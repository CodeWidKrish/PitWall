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
from pitwall.data.jolpica import JolpicaClient
from pitwall.features import POST_QUALI, PRE_QUALI, build_features
from pitwall.model import fit, select_kind
from pitwall.simulate import current_state, future_features

SITE_JSON = REPO_ROOT / "web" / "src" / "data" / "site.json"
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
        data = client.get(f"{season}/drivers")
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


def _next_race(entries: pd.DataFrame, races: pd.DataFrame, feats: pd.DataFrame) -> dict[str, Any] | None:
    season = int(entries["season"].max())
    state = current_state(entries, races, season)
    if state.future.empty:
        return None
    fut = future_features(entries, races, state)
    nxt = int(fut["round"].min())
    rows = fut[fut["round"] == nxt].copy()
    done = feats[feats["position"].notna()]
    kind, _ = select_kind(done, PRE_QUALI)
    pred = fit(done, PRE_QUALI, kind=kind).predict(rows)
    rows["p_win"] = pred["p_win"].to_numpy()
    rows["p_podium"] = pred["p_podium"].to_numpy()
    rows = rows.sort_values("p_win", ascending=False)
    info = races[(races["season"] == season) & (races["round"] == nxt)].iloc[0]
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
        "circuit_name": str(info["circuit_name"]),
        "locality": str(info["locality"]),
        "country": str(info["country"]),
        "start_utc": pd.Timestamp(info["race_start_utc"]).tz_localize("UTC").isoformat()
        if pd.notna(info["race_start_utc"])
        else None,
        "has_sprint": bool(info["has_sprint"]),
        "model_kind": kind,
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
                "inputs": {f: _num(r[f]) for f, _, _ in INPUTS},
            }
            for _, r in rows.iterrows()
        ],
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
    standings = load(settings.data_dir, "standings")
    season = int(entries["season"].max())
    feats = build_features(entries, races)

    forecast_path = settings.reports_dir / f"titles-{settings.forecast_season}.json"
    forecast = json.loads(forecast_path.read_text(encoding="utf-8")) if forecast_path.exists() else None
    config_path = settings.config_dir / f"season-{settings.forecast_season}.json"
    config = json.loads(config_path.read_text(encoding="utf-8")) if config_path.exists() else None

    season_block = _season_block(entries, races, standings, season)
    current_ids = {d["driver_id"] for d in season_block["drivers"] if d["starts"] >= 3}
    next_ids = {s["driver_id"] for s in config["lineup"]} if config else set()
    ids = current_ids | next_ids

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
        "next_race": _next_race(entries, races, feats),
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
