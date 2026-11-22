"""Championship standings and the points reconciliation.

The reconciliation is the strongest check on the results data: for every
season, each driver's and each team's race + sprint points (and wins) are
summed from our tables and compared with the official championship standings
at the same round. If every total matches, the results are right end to end.

A small number of real-world adjustments make the standings differ from the
sum of race results (points taken away by the stewards after the fact). Those
are listed in KNOWN_ADJUSTMENTS with their source, and only those are accepted.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pandas as pd

JsonDict = dict[str, Any]


@dataclass(frozen=True)
class Adjustment:
    season: int
    kind: str  # "driver" or "constructor"
    entity_id: str
    points: float  # change applied to the standings, e.g. -15
    reason: str


# Verified penalties that remove championship points without changing race results.
KNOWN_ADJUSTMENTS: tuple[Adjustment, ...] = (
    Adjustment(
        2020,
        "constructor",
        "racing_point",
        -15,
        "FIA stewards deducted 15 constructors' points over the brake-duct design (Aug 2020).",
    ),
)

STANDINGS_COLUMNS = ["season", "round", "kind", "entity_id", "position", "points", "wins"]


def standings_frame(season: int, payload: JsonDict | None, kind: str) -> pd.DataFrame:
    """Flatten one Ergast standings list for drivers or constructors."""
    if payload is None:
        return pd.DataFrame(columns=STANDINGS_COLUMNS)
    rnd = int(payload["round"])
    rows = []
    key = "DriverStandings" if kind == "driver" else "ConstructorStandings"
    for s in payload.get(key, []):
        entity = s["Driver"]["driverId"] if kind == "driver" else s["Constructor"]["constructorId"]
        rows.append(
            {
                "season": season,
                "round": rnd,
                "kind": kind,
                "entity_id": entity,
                "position": int(s["position"]) if s.get("position") else None,
                "points": float(s["points"]),
                "wins": int(s["wins"]),
            }
        )
    return pd.DataFrame(rows, columns=STANDINGS_COLUMNS)


def _tally(results: pd.DataFrame, sprints: pd.DataFrame, by: str, upto: dict[int, int]) -> pd.DataFrame:
    """Points (race + sprint) and race wins per season and entity, up to each season's cut-off round."""

    def cut(df: pd.DataFrame) -> pd.DataFrame:
        if df.empty:
            return df
        limit = df["season"].map(upto)
        return df[df["round"] <= limit]

    # Stack race and sprint rows into one long table so empty pieces (seasons
    # without sprints, a cut-off before the first sprint) need no special case.
    parts = []
    r = cut(results)
    if not r.empty:
        parts.append(
            pd.DataFrame(
                {
                    "season": r["season"],
                    "entity_id": r[by],
                    "race_points": r["points"],
                    "sprint_points": 0.0,
                    "wins": r["position"].eq(1).fillna(False).astype(int),
                }
            )
        )
    s = cut(sprints)
    if not s.empty:
        parts.append(
            pd.DataFrame(
                {
                    "season": s["season"],
                    "entity_id": s[by],
                    "race_points": 0.0,
                    "sprint_points": s["points"],
                    "wins": 0,
                }
            )
        )
    if not parts:
        return pd.DataFrame(columns=["season", "entity_id", "race_points", "sprint_points", "wins", "points"])
    out = pd.concat(parts, ignore_index=True).groupby(["season", "entity_id"], as_index=False).sum()
    out["points"] = out["race_points"] + out["sprint_points"]
    return out


def reconcile(results: pd.DataFrame, sprints: pd.DataFrame, standings: pd.DataFrame) -> pd.DataFrame:
    """Every driver and team whose summed points or wins differ from the standings.

    Columns: season, kind, entity_id, ours, official, diff, wins_ours, wins_official,
    explained (True when a KNOWN_ADJUSTMENTS entry accounts for the difference) and reason.
    """
    if standings.empty:
        return pd.DataFrame()
    last_round = standings.groupby("season", as_index=False)["round"].max()
    upto = dict(zip(last_round["season"].astype(int), last_round["round"].astype(int), strict=True))
    frames = []
    for kind, by in (("driver", "driver_id"), ("constructor", "constructor_id")):
        ours = _tally(results, sprints, by, upto)
        official = standings[standings["kind"] == kind][["season", "entity_id", "points", "wins"]]
        m = ours.merge(official, on=["season", "entity_id"], how="outer", suffixes=("_ours", "_official"))
        m[["points_ours", "points_official", "wins_ours", "wins_official"]] = m[
            ["points_ours", "points_official", "wins_ours", "wins_official"]
        ].fillna(0.0)
        m["kind"] = kind
        frames.append(m)
    all_ = pd.concat(frames, ignore_index=True)
    all_["diff"] = (all_["points_official"] - all_["points_ours"]).round(2)
    bad = all_[(all_["diff"].abs() > 1e-6) | (all_["wins_ours"] != all_["wins_official"])].copy()

    adj = {(a.season, a.kind, a.entity_id): a for a in KNOWN_ADJUSTMENTS}
    explained: list[bool] = []
    reasons: list[str] = []
    for row in bad.to_dict("records"):
        a = adj.get((int(row["season"]), str(row["kind"]), str(row["entity_id"])))
        same_wins = row["wins_ours"] == row["wins_official"]
        explained.append(a is not None and abs(a.points - float(row["diff"])) < 1e-6 and bool(same_wins))
        reasons.append(a.reason if a else "")
    bad["explained"] = explained
    bad["reason"] = reasons
    return bad.rename(columns={"points_ours": "ours", "points_official": "official"})[
        [
            "season",
            "kind",
            "entity_id",
            "ours",
            "official",
            "diff",
            "wins_ours",
            "wins_official",
            "explained",
            "reason",
        ]
    ].reset_index(drop=True)
