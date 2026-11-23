"""The race weekend: sprint odds, constructor odds, the Saturday update and the live ledger.

Sprint odds
    A sprint is a third of a race with no pit stops, so it is more predictable than a
    Grand Prix. The same pre-qualifying driver strengths are used, with their own softmax
    temperature fitted on every past sprint: for each sprint season, a model trained only
    on earlier seasons scores that season's sprint weekends, and one temperature is fitted
    to all of those sprint winners together.

Constructor odds
    The chance that a team wins, gets a car on the podium, or finishes one-two, from the
    same Plackett-Luce strengths, by sampling whole finishing orders (Gumbel-max).

Saturday update
    Once qualifying is in, the next race is re-scored with the post-qualifying model
    (grid, gap to pole, gap to teammate). The grid is taken as the qualifying order;
    grid penalties are not known from the qualifying classification.

Live ledger
    Every forecast the site publishes before a race is written to `ledger.json`. After
    the race the result is added next to it, so the site can score its live calls and
    no one, including me, can quietly rewrite them later.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import requests

from pitwall.features import PRE_QUALI
from pitwall.model import fit, fit_temperature, softmax_by_race, top3_probs

SAMPLES = 20_000


# ---------------------------------------------------------------- sprint odds


def sprint_rows(feats: pd.DataFrame, sprints: pd.DataFrame) -> pd.DataFrame:
    """Race-weekend feature rows for every completed sprint, with who won the sprint."""
    if sprints.empty:
        return feats.iloc[0:0].assign(sprint_won=pd.Series(dtype=bool))
    won = sprints[sprints["position"] == 1][["season", "round", "driver_id"]].assign(sprint_won=True)
    keys = sprints[["season", "round"]].drop_duplicates()
    rows = feats.merge(keys, on=["season", "round"])
    rows = rows.merge(won, on=["season", "round", "driver_id"], how="left")
    rows["sprint_won"] = rows["sprint_won"].astype("boolean").fillna(False).astype(bool)
    # Only weekends where the sprint winner is in the field we score.
    ok = rows.groupby(["season", "round"])["sprint_won"].transform("any")
    return rows[ok].reset_index(drop=True)


def sprint_calibration(feats: pd.DataFrame, sprints: pd.DataFrame) -> dict[str, Any]:
    """Fit the sprint temperature walk-forward by season, and score it."""
    rows = sprint_rows(feats, sprints)
    done = feats[feats["position"].notna()]
    parts, scores = [], []
    for season in sorted(int(s) for s in rows["season"].unique()):
        train = done[done["season"] < season]
        if train["season"].nunique() < 2:
            continue
        test = rows[rows["season"] == season]
        model = fit(train, PRE_QUALI, kind="pl")
        parts.append(test)
        scores.append(model.scores(test))
    if not parts:
        return {"temperature": 1.0, "sprints": 0}
    df = pd.concat(parts, ignore_index=True)
    s = np.concatenate(scores)
    t = fit_temperature(df, s, winner_col="sprint_won")
    p = softmax_by_race(df, s, t)
    df = df.assign(p=p)
    hits, top3s, briers = [], [], []
    for _, g in df.groupby(["season", "round"]):
        won = g["sprint_won"].to_numpy().astype(bool)
        pr = g["p"].to_numpy()
        hits.append(bool(won[int(np.argmax(pr))]))
        top3s.append(bool(won[np.argsort(-pr)[:3]].any()))
        briers.append(float(((pr - won) ** 2).sum()))
    fav_hit = np.asarray(hits)
    top3 = np.asarray(top3s)
    brier = np.asarray(briers)
    return {
        "temperature": round(t, 4),
        "sprints": len(fav_hit),
        "seasons": sorted(int(x) for x in df["season"].unique()),
        "favourite_won": round(float(fav_hit.mean()), 4),
        "winner_in_top3": round(float(top3.mean()), 4),
        "brier": round(float(brier.mean()), 4),
    }


def sprint_odds(scores: np.ndarray, temperature: float) -> tuple[np.ndarray, np.ndarray]:
    """Sprint win and podium chances from race scores and the sprint temperature."""
    z = scores / temperature
    w = np.exp(z - z.max())
    return w / w.sum(), top3_probs(w)


# ------------------------------------------------------------ constructor odds


def constructor_odds(
    scores: np.ndarray, teams: list[str], samples: int = SAMPLES, seed: int = 11
) -> list[dict[str, Any]]:
    """Win, podium and one-two chances per team, by sampling whole finishing orders."""
    rng = np.random.default_rng(seed)
    s = np.asarray(scores, dtype=float)
    order = np.argsort(-(s[None, :] + rng.gumbel(size=(samples, len(s)))), axis=1)
    team_arr = np.asarray(teams)
    top = team_arr[order[:, :3]]
    out = []
    for t in sorted(set(teams)):
        win = float(np.mean(top[:, 0] == t))
        podium = float(np.mean((top == t).any(axis=1)))
        one_two = float(np.mean((top[:, 0] == t) & (top[:, 1] == t)))
        out.append(
            {"team": t, "p_win": round(win, 4), "p_podium": round(podium, 4), "p_one_two": round(one_two, 4)}
        )
    return sorted(out, key=lambda r: (-r["p_win"], -r["p_podium"]))


# ------------------------------------------------------------- Saturday update


def with_qualifying(
    rows: pd.DataFrame, qualifying: pd.DataFrame, season: int, rnd: int
) -> pd.DataFrame | None:
    """The next race's rows with this weekend's qualifying added, or None if it isn't in yet."""
    q = qualifying[(qualifying["season"] == season) & (qualifying["round"] == rnd)]
    if q.empty:
        return None
    cols = ["driver_id", "quali_position", "gap_to_pole_pct", "gap_to_teammate_pct"]
    out = rows.drop(columns=[c for c in cols[1:] if c in rows.columns]).merge(
        q[cols], on="driver_id", how="left"
    )
    out["quali_position"] = out["quali_position"].astype("Float64").astype(float)
    # Anyone without a time starts at the back; the grid is taken as the qualifying order.
    out["quali_position"] = out["quali_position"].fillna(float(len(out)))
    out["grid"] = out["quali_position"]
    out["pit_lane_start"] = 0.0
    for c in ("gap_to_pole_pct", "gap_to_teammate_pct"):
        out[c] = out[c].astype("Float64").astype(float)
    return out


# ----------------------------------------------------------------- the ledger


def update_ledger(
    ledger: dict[str, Any],
    next_race: dict[str, Any] | None,
    entries: pd.DataFrame,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Add the forecast being published and the results of races that have finished.

    A forecast is only ever written before its race starts; after that it is frozen.
    """
    now = now or datetime.now(UTC)
    calls: list[dict[str, Any]] = list(ledger.get("calls", []))
    by_key = {(c["season"], c["round"]): c for c in calls}

    # Results for races that have happened.
    done = entries[entries["position"].notna()]
    for c in calls:
        if c.get("result"):
            continue
        g = done[(done["season"] == c["season"]) & (done["round"] == c["round"])]
        if g.empty:
            continue
        podium = g.sort_values("position").head(3)["driver_id"].tolist()
        c["result"] = {"winner": podium[0], "podium": podium}

    # The forecast being published now.
    if next_race:
        start = next_race.get("start_utc")
        open_ = start is None or now < datetime.fromisoformat(start)
        key = (next_race["season"], next_race["round"])
        snap = [
            {"driver_id": o["driver_id"], "p_win": o["p_win"], "p_podium": o["p_podium"]}
            for o in next_race["odds"]
        ]
        if open_:
            entry = by_key.get(key)
            if entry is None:
                entry = {
                    "season": next_race["season"],
                    "round": next_race["round"],
                    "race_name": next_race["race_name"],
                    "start_utc": start,
                    "result": None,
                }
                calls.append(entry)
            slot = "pre" if next_race.get("stage", "pre_quali") == "pre_quali" else "post"
            # Re-publishing the same numbers keeps the original time stamp.
            if entry.get(slot, {}).get("odds") != snap:
                entry[slot] = {"published_at": now.isoformat(timespec="seconds"), "odds": snap}
    calls.sort(key=lambda c: (c["season"], c["round"]))
    return {"since": ledger.get("since") or now.date().isoformat(), "calls": calls}


def read_ledger(path: Path) -> dict[str, Any]:
    if path.exists():
        data: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
        return data
    return {"since": None, "calls": []}


# ------------------------------------------------------------ race-day weather

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"


def race_weather(lat: float | None, lon: float | None, start_utc: str | None) -> dict[str, Any] | None:
    """Open-Meteo's forecast for the hour of the race start, or None if it is too far off.

    Shown next to the odds as context only: the model does not use weather.
    """
    if lat is None or lon is None or not start_utc or pd.isna(lat) or pd.isna(lon):
        return None
    start = datetime.fromisoformat(start_utc)
    days = (start - datetime.now(UTC)).total_seconds() / 86400
    if not 0 <= days <= 15:
        return None
    params: dict[str, str | float] = {
        "latitude": float(lat),
        "longitude": float(lon),
        "hourly": "temperature_2m,precipitation_probability,precipitation,wind_speed_10m,cloud_cover",
        "timezone": "UTC",
        "start_date": start.date().isoformat(),
        "end_date": start.date().isoformat(),
    }
    try:
        res = requests.get(FORECAST_URL, params=params, timeout=20)
        res.raise_for_status()
        h = res.json()["hourly"]
    except (requests.RequestException, KeyError, ValueError):
        return None
    hour = start.strftime("%Y-%m-%dT%H:00")
    if hour not in h["time"]:
        return None
    i = h["time"].index(hour)

    def val(k: str) -> float | None:
        v = h.get(k, [None] * (i + 1))[i]
        return None if v is None else round(float(v), 1)

    return {
        "at": hour + "Z",
        "temperature_c": val("temperature_2m"),
        "rain_chance": val("precipitation_probability"),
        "rain_mm": val("precipitation"),
        "wind_kmh": val("wind_speed_10m"),
        "cloud_cover": val("cloud_cover"),
        "fetched_at": datetime.now(UTC).isoformat(timespec="seconds"),
    }
