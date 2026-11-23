"""Everything the website shows, as one JSON file built from real data.

`pitwall site export` writes `web/src/data/site.json`:

  drivers / teams   who is on the 2026 grid and the 2027 grid
  season            2026 standings, points race by race, and who has clinched
  races             every 2026 race: winner, pole, and what the model said beforehand
  next_race         the next race's win and podium odds, with the inputs behind them
  forecast          2027 title odds for both championships, with seat status
  record            the walk-forward backtest summary (model vs baseline)

The 2026 race calls come from a model trained on 2018-2025 only, the same walk-forward
setup as the backtest, so no 2026 result leaks into a 2026 call.

`pitwall site photos` downloads a freely licensed photo of each driver from Wikimedia
Commons (via the driver's English Wikipedia article) and records the author and licence.
"""

from __future__ import annotations

import json
import re
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import unquote

import pandas as pd
import requests

from pitwall.config import REPO_ROOT, Settings
from pitwall.data.jolpica import JolpicaClient, JolpicaError
from pitwall.features import POST_QUALI, PRE_QUALI, build_features
from pitwall.model import fit, select_kind
from pitwall.simulate import current_state, future_features
from pitwall.weekend import (
    constructor_odds,
    race_weather,
    read_ledger,
    sprint_calibration,
    sprint_odds,
    update_ledger,
    with_qualifying,
)

SITE_JSON = REPO_ROOT / "web" / "src" / "data" / "site.json"
SIM_JSON = REPO_ROOT / "web" / "public" / "data" / "sim.json"
LEDGER_JSON = REPO_ROOT / "web" / "src" / "data" / "ledger.json"
PHOTO_DIR = REPO_ROOT / "web" / "public" / "drivers"
CREDITS_JSON = REPO_ROOT / "web" / "src" / "data" / "photo-credits.json"
USER_AGENT = "PitWall/0.1 (+https://github.com/CodeWidKrish/PitWall)"

# Inputs shown next to each driver's odds: (feature, label, higher_is_better).
INPUTS: list[tuple[str, str, bool]] = [
    ("elo", "Elo rating", True),
    ("drv_finish_avg5", "Average finish, last 5", False),
    ("drv_points_avg5", "Points per race, last 5", True),
    ("drv_quali_avg5", "Average grid slot, last 5", False),
    ("team_points_avg5", "Team points per race, last 5", True),
    ("drv_circuit_finish", "Past finishes at this track", False),
    ("drv_dnf_rate10", "Retirement rate, last 10", False),
]


def _num(x: Any, digits: int = 4) -> float | None:
    if x is None or pd.isna(x):
        return None
    return round(float(x), digits)


def _driver_meta(settings: Settings, seasons: list[int]) -> dict[str, dict[str, Any]]:
    client = JolpicaClient(cache_dir=settings.jolpica_cache_dir)
    meta: dict[str, dict[str, Any]] = {}
    for season in seasons:
        try:
            data = client.get(f"{season}/drivers")
        except JolpicaError:
            # The API is down: keep the details the site already shows rather than fail.
            if not SITE_JSON.exists():
                raise
            old = json.loads(SITE_JSON.read_text(encoding="utf-8"))["drivers"]
            keys = ("first_name", "last_name", "number", "nationality", "date_of_birth", "wikipedia")
            return {d: {k: v.get(k) for k in keys} for d, v in old.items()}
        for d in data["MRData"]["DriverTable"]["Drivers"]:
            meta[d["driverId"]] = {
                "first_name": d.get("givenName", ""),
                "last_name": d.get("familyName", ""),
                "number": int(d["permanentNumber"]) if d.get("permanentNumber") else None,
                "nationality": d.get("nationality"),
                "date_of_birth": d.get("dateOfBirth"),
                "wikipedia": d.get("url"),
            }
    return meta


def _season_block(
    entries: pd.DataFrame, races: pd.DataFrame, standings: pd.DataFrame, season: int
) -> dict[str, Any]:
    e = entries[(entries["season"] == season) & entries["position"].notna()].copy()
    last_round = int(e["round"].max())
    total = int((races["season"] == season).sum())
    e["total_points"] = e["points"] + e["sprint_points"].fillna(0)
    s = standings[(standings["season"] == season) & (standings["round"] == last_round)]

    by_driver = e.groupby("driver_id")
    drivers = []
    rows: list[dict[Any, Any]] = s[s["kind"] == "driver"].sort_values("position").to_dict("records")
    for row in rows:
        g = by_driver.get_group(row["entity_id"]) if row["entity_id"] in by_driver.groups else e.iloc[0:0]
        classified = g[g["classified"]]
        drivers.append(
            {
                "driver_id": row["entity_id"],
                "position": int(row["position"]),
                "points": float(row["points"]),
                "wins": int(row["wins"]),
                "podiums": int(g["podium"].sum()),
                "poles": int((g["quali_position"] == 1).sum()),
                "starts": len(g),
                "dnfs": int(g["dnf"].sum()),
                "avg_finish": _num(classified["position"].astype(float).mean(), 2),
                "avg_quali": _num(g["quali_position"].astype(float).mean(), 2),
                "best_finish": int(g["position"].min()) if len(g) else None,
                "team": g["constructor_id"].iloc[-1] if len(g) else None,
            }
        )
    team_rows: list[dict[Any, Any]] = s[s["kind"] == "constructor"].sort_values("position").to_dict("records")
    constructors = [
        {
            "constructor_id": row["entity_id"],
            "position": int(row["position"]),
            "points": float(row["points"]),
            "wins": int(row["wins"]),
        }
        for row in team_rows
    ]
    # Cumulative points after every round, per driver and per team.
    per_round = e.pivot_table(
        index="round", columns="driver_id", values="total_points", aggfunc="sum"
    ).fillna(0)
    team_round = e.pivot_table(
        index="round", columns="constructor_id", values="total_points", aggfunc="sum"
    ).fillna(0)
    return {
        "season": season,
        "after_round": last_round,
        "rounds": total,
        "drivers": drivers,
        "constructors": constructors,
        "progress": {
            "rounds": [int(r) for r in per_round.index],
            "drivers": {d: [float(v) for v in per_round[d].cumsum()] for d in per_round.columns},
            "constructors": {t: [float(v) for v in team_round[t].cumsum()] for t in team_round.columns},
        },
    }


def _race_calls(feats: pd.DataFrame, races: pd.DataFrame, season: int) -> list[dict[str, Any]]:
    """Model calls for every completed race of `season`, from a model trained before it."""
    done = feats[feats["position"].notna()]
    train, test = done[done["season"] < season], done[done["season"] == season].copy()
    for mode, cols in (("pre", PRE_QUALI), ("post", POST_QUALI)):
        kind, _ = select_kind(train, cols)
        p = fit(train, cols, kind=kind).predict(test)
        test[f"p_{mode}"] = p["p_win"].to_numpy()
    out = []
    info: dict[int, dict[Any, Any]] = {
        int(r["round"]): r for r in races[races["season"] == season].to_dict("records")
    }
    for _, g in test.groupby("round", sort=True):
        rnd = int(g["round"].iloc[0])
        winner = g[g["won"]]
        pole = g[g["quali_position"] == 1]
        call: dict[str, Any] = {
            "round": rnd,
            "race_name": str(info[rnd]["race_name"]),
            "circuit_id": str(info[rnd]["circuit_id"]),
            "country": str(info[rnd]["country"]),
            "date": pd.Timestamp(info[rnd]["date"]).date().isoformat(),
            "has_sprint": bool(info[rnd]["has_sprint"]),
            "winner": winner["driver_id"].iloc[0] if len(winner) else None,
            "pole": pole["driver_id"].iloc[0] if len(pole) else None,
        }
        for mode in ("pre", "post"):
            top = g.sort_values(f"p_{mode}", ascending=False).iloc[0]
            win_p = float(winner[f"p_{mode}"].iloc[0]) if len(winner) else None
            call[mode] = {
                "favourite": top["driver_id"],
                "p_favourite": round(float(top[f"p_{mode}"]), 4),
                "p_winner": _num(win_p),
                "hit": bool(len(winner) and top["driver_id"] == winner["driver_id"].iloc[0]),
                "winner_in_top3": bool(
                    len(winner)
                    and winner["driver_id"].iloc[0]
                    in set(g.sort_values(f"p_{mode}", ascending=False)["driver_id"].head(3))
                ),
            }
        out.append(call)
    return out


def _next_race(
    entries: pd.DataFrame,
    races: pd.DataFrame,
    feats: pd.DataFrame,
    config: dict[str, Any] | None = None,
    qualifying: pd.DataFrame | None = None,
    sprints: pd.DataFrame | None = None,
    sprint_cal: dict[str, Any] | None = None,
    schedule: pd.DataFrame | None = None,
) -> dict[str, Any] | None:
    from pitwall.simulate import preseason_state

    season = int(entries["season"].max())
    state = current_state(entries, races, season)
    if state.future.empty:
        # Season over: roll on to round 1 of next season, from its calendar and line-up.
        if not config:
            return None
        state, race_rows = preseason_state(entries, config)
        if schedule is not None and not schedule.empty:
            # The official calendar, once published, gives real dates, start times and venues.
            official = schedule.set_index("round")
            for col in ("date", "race_start_utc", "circuit_name", "locality", "has_sprint"):
                if col in official:
                    race_rows[col] = (
                        race_rows["round"]
                        .map(official[col])
                        .where(race_rows["round"].isin(official.index), race_rows.get(col))
                    )
        races = pd.concat([races, race_rows], ignore_index=True)
        season = int(config["season"])
    fut = future_features(entries, races, state)
    nxt = int(fut["round"].min())
    rows = fut[fut["round"] == nxt].copy()
    done = feats[feats["position"].notna()]
    kind, _ = select_kind(done, PRE_QUALI)
    pred = fit(done, PRE_QUALI, kind=kind).predict(rows)
    rows["p_win"] = pred["p_win"].to_numpy()
    rows["p_podium"] = pred["p_podium"].to_numpy()
    rows["score"] = pred["score"].to_numpy()
    pre_win = dict(zip(rows["driver_id"], rows["p_win"], strict=True))
    pre_scores = rows["score"].to_numpy().copy()
    pre_teams = rows["constructor_id"].tolist()

    # Saturday: once qualifying is in, re-score with the grid and the qualifying gaps.
    stage = "pre_quali"
    post_rows = with_qualifying(rows, qualifying, season, nxt) if qualifying is not None else None
    if post_rows is not None:
        post_kind, _ = select_kind(done, POST_QUALI)
        post = fit(done, POST_QUALI, kind=post_kind).predict(post_rows)
        rows = post_rows.assign(
            p_win=post["p_win"].to_numpy(),
            p_podium=post["p_podium"].to_numpy(),
            score=post["score"].to_numpy(),
        )
        stage, kind = "post_quali", post_kind
    rows = rows.sort_values("p_win", ascending=False)
    info = races[(races["season"] == season) & (races["round"] == nxt)].iloc[0].to_dict()
    # Last time this circuit was raced, who won.
    past = entries[(entries["circuit_id"] == info["circuit_id"]) & entries["won"]].sort_values("date")
    field_stats = {
        f: {"min": _num(rows[f].min()), "max": _num(rows[f].max()), "mean": _num(rows[f].mean())}
        for f, _, _ in INPUTS
    }
    return {
        "season": season,
        "round": nxt,
        "race_name": str(info["race_name"]),
        "circuit_id": str(info["circuit_id"]),
        "circuit_name": str(info["circuit_name"])
        if pd.notna(info.get("circuit_name"))
        else str(info["circuit_id"]),
        "locality": str(info["locality"]) if pd.notna(info.get("locality")) else str(info["country"]),
        "country": str(info["country"]),
        "start_utc": pd.Timestamp(info["race_start_utc"]).tz_localize("UTC").isoformat()
        if pd.notna(info.get("race_start_utc"))
        else None,
        "has_sprint": bool(info["has_sprint"]),
        "weather": race_weather(
            info.get("lat"),
            info.get("lon"),
            pd.Timestamp(info["race_start_utc"]).tz_localize("UTC").isoformat()
            if pd.notna(info.get("race_start_utc"))
            else None,
        ),
        "model_kind": kind,
        "stage": stage,
        "pole": (
            str(rows.loc[rows["quali_position"] == 1, "driver_id"].iloc[0])
            if stage == "post_quali" and (rows["quali_position"] == 1).any()
            else None
        ),
        "constructors": constructor_odds(rows["score"].to_numpy(), rows["constructor_id"].tolist()),
        "sprint": _sprint_block(
            info, season, nxt, pre_scores, pre_teams, rows_ids=list(pre_win), sprints=sprints, cal=sprint_cal
        ),
        "last_winner": (
            {"driver_id": past["driver_id"].iloc[-1], "season": int(past["season"].iloc[-1])}
            if len(past)
            else None
        ),
        "inputs": [{"key": f, "label": label, "higher_is_better": hib} for f, label, hib in INPUTS],
        "field": field_stats,
        "odds": [
            {
                "driver_id": r["driver_id"],
                "team": r["constructor_id"],
                "p_win": round(float(r["p_win"]), 4),
                "p_podium": round(float(r["p_podium"]), 4),
                "p_win_pre": round(float(pre_win[r["driver_id"]]), 4),
                "quali_position": int(r["quali_position"]) if stage == "post_quali" else None,
                "inputs": {f: _num(r[f]) for f, _, _ in INPUTS},
            }
            for _, r in rows.iterrows()
        ],
    }


def _schedule(settings: Settings, season: int) -> pd.DataFrame | None:
    """The official calendar for `season` from the API, or None if it isn't out (or the API is down)."""
    from pitwall.data.parse import races_frame

    try:
        sched = races_frame(JolpicaClient(cache_dir=settings.jolpica_cache_dir).races(f"{season}"))
    except JolpicaError:
        return None
    return sched if not sched.empty else None


def _sprint_block(
    info: dict[Any, Any],
    season: int,
    rnd: int,
    scores: Any,
    teams: list[str],
    rows_ids: list[str],
    sprints: pd.DataFrame | None,
    cal: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """Sprint odds for a sprint weekend, and the sprint result once it has been run."""
    if not info.get("has_sprint") or not cal or not cal.get("sprints"):
        return None
    p_win, p_podium = sprint_odds(scores, cal["temperature"])
    order = sorted(range(len(rows_ids)), key=lambda i: -p_win[i])
    result = None
    if sprints is not None and not sprints.empty:
        done = sprints[
            (sprints["season"] == season) & (sprints["round"] == rnd) & sprints["position"].notna()
        ]
        if not done.empty:
            podium = done.sort_values("position").head(3)["driver_id"].tolist()
            result = {"winner": podium[0], "podium": podium}
    return {
        "odds": [
            {
                "driver_id": rows_ids[i],
                "team": teams[i],
                "p_win": round(float(p_win[i]), 4),
                "p_podium": round(float(p_podium[i]), 4),
            }
            for i in order
        ],
        "constructors": constructor_odds(scores / cal["temperature"], teams),
        "calibration": cal,
        "result": result,
    }


def _sim_inputs(
    entries: pd.DataFrame, races: pd.DataFrame, feats: pd.DataFrame, config: dict[str, Any]
) -> dict[str, Any]:
    """What the browser needs to re-run next season's title simulation itself.

    Mirrors `pitwall model simulate` for a pre-season forecast: the same model, per-race
    strengths (log weights), retirement chances and form swing, so the what-if tool
    starts from the published odds.
    """
    from pitwall.simulate import (
        PRESEASON_SCALE,
        SPRINT_DNF_FACTOR,
        _dnf_chance,
        preseason_state,
        swing,
    )

    state, race_rows = preseason_state(entries, config)
    all_races = pd.concat([races, race_rows], ignore_index=True)
    fut = future_features(entries, all_races, state)
    done = feats[feats["position"].notna()]
    kind, _ = select_kind(done, PRE_QUALI)
    model = fit(done, PRE_QUALI, kind=kind)
    drivers = list(state.lineup["driver_id"])
    teams = list(state.lineup["constructor_id"])
    recent = entries[(entries["season"] >= int(entries["season"].max()) - 1) & entries["position"].notna()]
    league_dnf = float(recent["dnf"].mean()) if len(recent) else 0.1
    rounds = []
    for _, race in fut.groupby("round", sort=True):
        rnd = int(race["round"].iloc[0])
        race = race.set_index("driver_id").reindex(drivers).reset_index()
        rounds.append(
            {
                "round": rnd,
                "sprint": bool(race["has_sprint"].iloc[0]),
                "log_w": [round(float(v), 4) for v in model.scores(race)],
                "p_dnf": [round(float(v), 4) for v in _dnf_chance(race, league_dnf)],
            }
        )
    team_s, drv_s = swing(PRESEASON_SCALE)
    return {
        "season": int(config["season"]),
        "drivers": drivers,
        "teams": teams,
        "rounds": rounds,
        "team_sigma": team_s,
        "driver_sigma": drv_s,
        "sprint_dnf_factor": SPRINT_DNF_FACTOR,
        "race_points": [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
        "sprint_points": [8, 7, 6, 5, 4, 3, 2, 1],
    }


def _record(reports_dir: Path) -> dict[str, Any] | None:
    path = reports_dir / "backtest.json"
    if not path.exists():
        return None
    bt = json.loads(path.read_text(encoding="utf-8"))
    modes = {}
    for mode, r in bt["modes"].items():
        base = r["baseline"]
        modes[mode] = {
            "baseline": base,
            "model": r["overall"]["model"],
            "baseline_scores": r["overall"][base],
            "per_season": [
                {"season": s["season"], "model": s["model"], "baseline": s[base]} for s in r["per_season"]
            ],
            "confidence": r.get("confidence", []),
            "classification": r.get("classification", {}).get("win"),
        }
    return {"built_at": bt["built_at"], "test_seasons": bt["test_seasons"], "modes": modes}


def export(settings: Settings, out_path: Path = SITE_JSON) -> Path:
    from pitwall.data.build import load

    entries = load(settings.data_dir, "entries")
    races = load(settings.data_dir, "races")
    qualifying = load(settings.data_dir, "qualifying")
    sprints = load(settings.data_dir, "sprints")
    standings = load(settings.data_dir, "standings")
    season = int(entries["season"].max())
    feats = build_features(entries, races)

    forecast_path = settings.reports_dir / f"titles-{settings.forecast_season}.json"
    forecast = json.loads(forecast_path.read_text(encoding="utf-8")) if forecast_path.exists() else None
    config_path = settings.config_dir / f"season-{settings.forecast_season}.json"
    config = json.loads(config_path.read_text(encoding="utf-8")) if config_path.exists() else None
    sprint_cal = sprint_calibration(feats, sprints)
    next_race = _next_race(
        entries,
        races,
        feats,
        config,
        qualifying,
        sprints,
        sprint_cal,
        _schedule(settings, settings.forecast_season),
    )

    season_block = _season_block(entries, races, standings, season)
    # Who has mathematically clinched, from `pitwall model simulate` for this season.
    titles_now = settings.reports_dir / f"titles-{season}.json"
    if titles_now.exists():
        t_now = json.loads(titles_now.read_text(encoding="utf-8"))
        season_block["clinched"] = {
            "drivers": t_now.get("drivers_clinched_by"),
            "constructors": t_now.get("constructors_clinched_by"),
            "after_round": t_now.get("after_round"),
        }
    # The current grid is the line-up of the latest race; standings may include stand-ins.
    current_ids = set(current_state(entries, races, season).lineup["driver_id"])
    next_ids = {s["driver_id"] for s in config["lineup"]} if config else set()
    ids = {d["driver_id"] for d in season_block["drivers"]} | current_ids | next_ids

    meta = _driver_meta(settings, [season])
    latest = (
        entries.sort_values(["season", "round"])
        .drop_duplicates("driver_id", keep="last")
        .set_index("driver_id")
    )
    seat_2027 = {s["driver_id"]: s for s in config["lineup"]} if config else {}
    credits = json.loads(CREDITS_JSON.read_text(encoding="utf-8")) if CREDITS_JSON.exists() else {}
    drivers = {}
    for d in sorted(ids):
        m = meta.get(d, {})
        drivers[d] = {
            "id": d,
            "code": str(latest.at[d, "driver_code"]) if d in latest.index else d[:3].upper(),
            "name": str(latest.at[d, "driver_name"]) if d in latest.index else d,
            "first_name": m.get("first_name", ""),
            "last_name": m.get("last_name", ""),
            "number": m.get("number"),
            "nationality": m.get("nationality"),
            "date_of_birth": m.get("date_of_birth"),
            "team_now": str(latest.at[d, "constructor_id"]) if d in current_ids else None,
            "team_next": seat_2027[d]["constructor_id"] if d in seat_2027 else None,
            "seat_status": seat_2027[d].get("status") if d in seat_2027 else None,
            "wikipedia": m.get("wikipedia"),
            "photo": credits.get(d, {}).get("file"),
            "career_since_2018": {
                "starts": int((entries["driver_id"] == d).sum()),
                "wins": int(entries.loc[entries["driver_id"] == d, "won"].sum()),
                "podiums": int(entries.loc[entries["driver_id"] == d, "podium"].sum()),
            },
        }
    team_names = entries.sort_values("date").drop_duplicates("constructor_id", keep="last")
    teams = {
        r.constructor_id: {"id": r.constructor_id, "name": r.constructor_name}
        for r in team_names.itertuples(index=False)
        if r.constructor_id
        in {x["team_now"] for x in drivers.values()} | {x["team_next"] for x in drivers.values()}
    }

    site: dict[str, Any] = {
        "built_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "data_through": {
            "season": season,
            "round": season_block["after_round"],
            "race_name": str(
                races[(races["season"] == season) & (races["round"] == season_block["after_round"])][
                    "race_name"
                ].iloc[0]
            ),
        },
        "drivers": drivers,
        "teams": teams,
        "season": season_block,
        "races": _race_calls(feats, races, season),
        "next_race": next_race,
        "forecast": {
            "season": settings.forecast_season,
            "simulations": forecast["simulations"],
            "drivers": forecast["drivers"],
            "constructors": forecast["constructors"],
            "calendar": config["calendar"] if config else [],
            "sources": forecast.get("sources", {}),
        }
        if forecast
        else None,
        "record": _record(settings.reports_dir),
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(site, indent=1, ensure_ascii=False), encoding="utf-8")
    # The live record: what was published before each race, and what happened.
    ledger_path = out_path.parent / LEDGER_JSON.name
    ledger = update_ledger(read_ledger(ledger_path), next_race, entries)
    ledger_path.write_text(json.dumps(ledger, indent=1, ensure_ascii=False), encoding="utf-8")
    # The simulator's inputs are only needed by the what-if tool, so they are a separate
    # file the browser fetches on demand instead of part of every page load.
    if config:
        SIM_JSON.parent.mkdir(parents=True, exist_ok=True)
        SIM_JSON.write_text(
            json.dumps(_sim_inputs(entries, races, feats, config), separators=(",", ":")), encoding="utf-8"
        )
    return out_path


# ---------------------------------------------------------------- photos

FREE_LICENCE = re.compile(r"^(CC BY(-SA)? [0-9.]+|CC0|Public domain|PD|OGL [0-9.]+)", re.IGNORECASE)


def _strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text or "").strip()


def photos(site_path: Path = SITE_JSON, width: int = 900, pause: float = 1.0) -> dict[str, Any]:
    """Download one freely licensed photo per driver and record its credit."""
    site = json.loads(site_path.read_text(encoding="utf-8"))
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT
    credits: dict[str, Any] = (
        json.loads(CREDITS_JSON.read_text(encoding="utf-8")) if CREDITS_JSON.exists() else {}
    )
    PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    for driver_id, d in site["drivers"].items():
        if driver_id in credits and (PHOTO_DIR / credits[driver_id]["file"]).exists():
            continue
        # The Jolpica record links the driver's English Wikipedia article.
        wiki = d.get("wikipedia") or ""
        title = unquote(wiki.rsplit("/", 1)[-1]) or f"{d['first_name']} {d['last_name']}"
        r = session.get(
            "https://en.wikipedia.org/w/api.php",
            params={  # type: ignore[arg-type]
                "action": "query",
                "titles": title,
                "prop": "pageimages",
                "piprop": "name",
                "redirects": 1,
                "format": "json",
            },
            timeout=30,
        )
        pages = r.json().get("query", {}).get("pages", {})
        name = next((p.get("pageimage") for p in pages.values() if p.get("pageimage")), None)
        if not name:
            print(f"  {driver_id}: no lead image on Wikipedia ({title})")
            continue
        info = session.get(
            "https://commons.wikimedia.org/w/api.php",
            params={  # type: ignore[arg-type]
                "action": "query",
                "titles": f"File:{name}",
                "prop": "imageinfo",
                "iiprop": "url|extmetadata",
                "iiurlwidth": width,
                "format": "json",
            },
            timeout=30,
        ).json()
        page: dict[str, Any] = next(iter(info.get("query", {}).get("pages", {}).values()), {})
        ii = (page.get("imageinfo") or [None])[0]
        if not ii:
            print(f"  {driver_id}: {name} is not on Wikimedia Commons, skipped")
            continue
        em = ii.get("extmetadata", {})
        licence = _strip_html(em.get("LicenseShortName", {}).get("value", ""))
        if not FREE_LICENCE.match(licence):
            print(f"  {driver_id}: {name} has licence '{licence}', skipped")
            continue
        img = session.get(ii["thumburl"], timeout=60)
        img.raise_for_status()
        ext = Path(ii["thumburl"].split("?")[0]).suffix.lower() or ".jpg"
        file = f"{driver_id}{ext}"
        (PHOTO_DIR / file).write_bytes(img.content)
        credits[driver_id] = {
            "file": file,
            "author": _strip_html(em.get("Artist", {}).get("value", "")) or "Unknown",
            "licence": licence,
            "licence_url": em.get("LicenseUrl", {}).get("value"),
            "source": ii.get("descriptionurl"),
            "width": ii.get("thumbwidth"),
            "height": ii.get("thumbheight"),
        }
        print(f"  {driver_id}: {licence} · {credits[driver_id]['author'][:60]}")
        time.sleep(pause)
    CREDITS_JSON.write_text(json.dumps(credits, indent=1, ensure_ascii=False), encoding="utf-8")
    return credits


__all__ = ["export", "photos"]
