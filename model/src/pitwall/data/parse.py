"""Turn Jolpica (Ergast-style) JSON into tidy, typed tables.

Every function here is pure: JSON in, DataFrame out. That keeps parsing
testable without the network.
"""

from __future__ import annotations

import re
from typing import Any

import pandas as pd

JsonDict = dict[str, Any]

_LAP_TIME = re.compile(r"^(?:(\d+):)?(\d+(?:\.\d+)?)$")
_NOT_FINISHED_TEXT = {"R", "D", "E", "W", "F", "N"}


def lap_time_ms(text: str | None) -> int | None:
    """Parse "1:23.456" or "83.456" into milliseconds. Empty or odd input gives None."""
    if not text:
        return None
    m = _LAP_TIME.match(text.strip())
    if not m:
        return None
    minutes = int(m.group(1) or 0)
    return round((minutes * 60 + float(m.group(2))) * 1000)


def is_finished(status: str) -> bool:
    """True when the car took the chequered flag (including lapped cars)."""
    s = status.strip()
    return s == "Finished" or s == "Lapped" or s.startswith("+")


def _int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


# ---- schedule ---------------------------------------------------------------


def races_frame(schedule: list[JsonDict]) -> pd.DataFrame:
    rows = []
    for r in schedule:
        loc = r["Circuit"]["Location"]
        rows.append(
            {
                "season": int(r["season"]),
                "round": int(r["round"]),
                "race_name": r["raceName"],
                "date": r["date"],
                "circuit_id": r["Circuit"]["circuitId"],
                "circuit_name": r["Circuit"]["circuitName"],
                "locality": loc.get("locality"),
                "country": loc.get("country"),
                "lat": _float(loc.get("lat")),
                "lon": _float(loc.get("long")),
                "has_sprint": "Sprint" in r,
                # Race start in UTC; Jolpica gives e.g. "05:10:00Z". Missing for a few old races.
                "race_start_utc": f"{r['date']}T{r['time'].rstrip('Z')}" if r.get("time") else None,
            }
        )
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    df["date"] = pd.to_datetime(df["date"])
    df["race_start_utc"] = pd.to_datetime(df["race_start_utc"])
    return df.sort_values(["season", "round"]).reset_index(drop=True)


# ---- race and sprint results -------------------------------------------------


def _results_rows(races: list[JsonDict], key: str) -> list[JsonDict]:
    rows = []
    for race in races:
        for res in race.get(key, []):
            status = res.get("status", "")
            pos_text = res.get("positionText", "")
            fastest = res.get("FastestLap") or {}
            rows.append(
                {
                    "season": int(race["season"]),
                    "round": int(race["round"]),
                    "driver_id": res["Driver"]["driverId"],
                    "driver_code": res["Driver"].get("code"),
                    "driver_name": f"{res['Driver']['givenName']} {res['Driver']['familyName']}",
                    "car_number": _int(res.get("number")),
                    "constructor_id": res["Constructor"]["constructorId"],
                    "constructor_name": res["Constructor"]["name"],
                    "grid": _int(res.get("grid")),
                    "position": _int(res.get("position")),
                    "position_text": pos_text,
                    "classified": pos_text not in _NOT_FINISHED_TEXT,
                    "points": _float(res.get("points")) or 0.0,
                    "laps": _int(res.get("laps")),
                    "status": status,
                    "finished": is_finished(status),
                    "disqualified": pos_text == "D" or status == "Disqualified",
                    "time_ms": _int((res.get("Time") or {}).get("millis")),
                    "fastest_lap_rank": _int(fastest.get("rank")),
                    "fastest_lap_ms": lap_time_ms((fastest.get("Time") or {}).get("time")),
                }
            )
    return rows


_RESULT_DTYPES = {
    "car_number": "Int64",
    "grid": "Int64",
    "position": "Int64",
    "laps": "Int64",
    "time_ms": "Int64",
    "fastest_lap_rank": "Int64",
    "fastest_lap_ms": "Int64",
}


def results_frame(races: list[JsonDict], key: str = "Results") -> pd.DataFrame:
    df = pd.DataFrame(_results_rows(races, key))
    if df.empty:
        return df
    df = df.astype(_RESULT_DTYPES)
    # Grid 0 means a pit-lane start. Keep it, but flag it.
    df["pit_lane_start"] = df["grid"] == 0
    return df.sort_values(["season", "round", "position"], na_position="last").reset_index(drop=True)


# ---- qualifying ----------------------------------------------------------------


SESSIONS = ("Q1", "Q2", "Q3")
QUALI_COLUMNS = [
    "season",
    "round",
    "driver_id",
    "constructor_id",
    "quali_position",
    "q1_ms",
    "q2_ms",
    "q3_ms",
    "best_ms",
    "reached_session",
    "gap_to_pole_pct",
    "gap_to_teammate_pct",
]


def _deepest(times: list[int | None]) -> int | None:
    """Index of the last qualifying session the driver set a time in."""
    for i in range(len(times) - 1, -1, -1):
        if times[i] is not None:
            return i
    return None


def qualifying_frame(races: list[JsonDict]) -> pd.DataFrame:
    """Qualifying with session-aware gaps.

    Track grip improves from Q1 to Q3, so times are only compared within one
    session: a driver's gap is measured in the deepest session they reached,
    and teammates are compared in the deepest session both reached.
    """
    rows: list[JsonDict] = []
    for race in races:
        entries = race.get("QualifyingResults", [])
        parsed = [[lap_time_ms(q.get(k)) for k in SESSIONS] for q in entries]
        fastest: list[int | None] = []
        for k in range(len(SESSIONS)):
            set_times = [t[k] for t in parsed if t[k] is not None]
            fastest.append(min(x for x in set_times if x is not None) if set_times else None)
        by_team: dict[str, list[int]] = {}
        for i, q in enumerate(entries):
            by_team.setdefault(q["Constructor"]["constructorId"], []).append(i)

        for i, q in enumerate(entries):
            times = parsed[i]
            depth = _deepest(times)
            gap_pole = None
            if depth is not None:
                t, f = times[depth], fastest[depth]
                if t is not None and f:
                    gap_pole = (t - f) / f * 100

            gap_mate = None
            mates = [j for j in by_team[q["Constructor"]["constructorId"]] if j != i]
            if len(mates) == 1:
                other = parsed[mates[0]]
                d_other = _deepest(other)
                if depth is not None and d_other is not None:
                    common = min(depth, d_other)
                    mine, theirs = times[common], other[common]
                    if mine is not None and theirs is not None:
                        best = min(mine, theirs)
                        gap_mate = (mine - best) / best * 100

            valid = [t for t in times if t is not None]
            rows.append(
                {
                    "season": int(race["season"]),
                    "round": int(race["round"]),
                    "driver_id": q["Driver"]["driverId"],
                    "constructor_id": q["Constructor"]["constructorId"],
                    "quali_position": _int(q.get("position")),
                    "q1_ms": times[0],
                    "q2_ms": times[1],
                    "q3_ms": times[2],
                    "best_ms": min(valid) if valid else None,
                    "reached_session": None if depth is None else depth + 1,
                    "gap_to_pole_pct": gap_pole,
                    "gap_to_teammate_pct": gap_mate,
                }
            )
    df = pd.DataFrame(rows, columns=QUALI_COLUMNS)
    if df.empty:
        return df
    df = df.astype(
        {c: "Int64" for c in ("quali_position", "q1_ms", "q2_ms", "q3_ms", "best_ms", "reached_session")}
        | {"gap_to_pole_pct": "Float64", "gap_to_teammate_pct": "Float64"}
    )
    return df.sort_values(["season", "round", "quali_position"]).reset_index(drop=True)
