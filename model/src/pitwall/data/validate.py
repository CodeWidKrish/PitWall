"""Data checks. Errors mean the tables can't be trusted; warnings are worth a look."""

from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd


@dataclass
class Report:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors

    def error(self, msg: str) -> None:
        self.errors.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)


def _dupes(df: pd.DataFrame, keys: list[str]) -> int:
    return int(df.duplicated(keys).sum())


def expected_grid_size(season: int) -> int:
    """Cars per race: 20 until 2025, 22 from 2026 when an 11th team joined."""
    return 22 if season >= 2026 else 20


def check(
    races: pd.DataFrame,
    results: pd.DataFrame,
    qualifying: pd.DataFrame,
    sprints: pd.DataFrame,
    weather: pd.DataFrame | None,
    entries: pd.DataFrame,
    mismatches: pd.DataFrame | None = None,
) -> Report:
    r = Report()

    # races
    if (n := _dupes(races, ["season", "round"])) > 0:
        r.error(f"races: {n} duplicate (season, round) rows")
    for _, g in races.groupby("season"):
        year = int(g["season"].iloc[0])
        rounds = sorted(g["round"])
        if rounds != list(range(1, len(rounds) + 1)):
            r.error(f"races: {year} rounds are not 1..{len(rounds)}")

    # results
    if (n := _dupes(results, ["season", "round", "driver_id"])) > 0:
        r.error(f"results: {n} duplicate driver rows in a race")
    raced = results.groupby(["season", "round"])
    for _, g in raced:
        season, rnd = int(g["season"].iloc[0]), int(g["round"].iloc[0])
        size = len(g)
        if size != expected_grid_size(season):
            r.warn(f"results: {season} R{rnd} has {size} cars (expected {expected_grid_size(season)})")
        winners = int((g["position"] == 1).sum())
        if winners != 1:
            r.error(f"results: {season} R{rnd} has {winners} winners")
        pos = g["position"].dropna()
        if pos.duplicated().any():
            r.error(f"results: {season} R{rnd} has repeated finishing positions")
        if g["grid"].dropna().gt(26).any():
            r.error(f"results: {season} R{rnd} has an impossible grid slot")

    missing_races = set(map(tuple, results[["season", "round"]].drop_duplicates().to_numpy())) - set(
        map(tuple, races[["season", "round"]].to_numpy())
    )
    if missing_races:
        r.error(f"results: {len(missing_races)} races are missing from the schedule")

    # qualifying
    if (n := _dupes(qualifying, ["season", "round", "driver_id"])) > 0:
        r.error(f"qualifying: {n} duplicate driver rows")
    raced_keys = set(map(tuple, results[["season", "round"]].drop_duplicates().to_numpy()))
    quali_keys = set(map(tuple, qualifying[["season", "round"]].drop_duplicates().to_numpy()))
    if missing := sorted(raced_keys - quali_keys):
        r.warn(f"qualifying: missing for {len(missing)} races, e.g. {missing[:3]}")

    # sprints
    if not sprints.empty and (n := _dupes(sprints, ["season", "round", "driver_id"])) > 0:
        r.error(f"sprints: {n} duplicate driver rows")
    sprint_flag = set(map(tuple, races.loc[races["has_sprint"], ["season", "round"]].to_numpy()))
    sprint_keys = (
        set(map(tuple, sprints[["season", "round"]].drop_duplicates().to_numpy()))
        if not sprints.empty
        else set()
    )
    if missing := sorted((sprint_flag & raced_keys) - sprint_keys):
        r.warn(f"sprints: results missing for {len(missing)} sprint weekends")

    # weather
    if weather is None or weather.empty:
        r.warn("weather: not loaded")
    else:
        covered = len(set(map(tuple, weather[["season", "round"]].to_numpy())) & raced_keys)
        share = covered / max(1, len(raced_keys))
        if share < 0.95:
            r.warn(f"weather: only {covered}/{len(raced_keys)} races covered ({share:.0%})")

    # entries (the modelling table)
    if (n := _dupes(entries, ["season", "round", "driver_id"])) > 0:
        r.error(f"entries: {n} duplicate rows")
    if len(entries) != len(results):
        r.error(f"entries: {len(entries)} rows but results has {len(results)}")
    wins = entries.groupby(["season", "round"])["won"].sum()
    if (wins != 1).any():
        r.error("entries: some races don't have exactly one winner")
    if entries["quali_position"].isna().mean() > 0.05:
        r.warn(f"entries: {entries['quali_position'].isna().mean():.1%} rows lack a qualifying position")

    # points reconciliation against the official standings
    if mismatches is not None and not mismatches.empty:
        for m in mismatches.to_dict("records"):
            msg = (
                f"standings: {m['season']} {m['kind']} {m['entity_id']}: our points {m['ours']:g}, "
                f"official {m['official']:g} (diff {m['diff']:+g}); "
                f"wins {m['wins_ours']:g} vs {m['wins_official']:g}"
            )
            if m["explained"]:
                r.warn(f"{msg}. Known adjustment: {m['reason']}")
            else:
                r.error(msg)

    return r
