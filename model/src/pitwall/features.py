"""Leak-free features: what was known about each driver and team *before* each race.

Every rolling statistic is shifted by one race, so a row never sees its own
result. Rows for races that haven't happened yet (position missing) can be
appended to get features for a forecast.

Two feature sets:
  PRE_QUALI   available on the Thursday before a race
  POST_QUALI  PRE_QUALI plus the grid and this weekend's qualifying pace
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from pandas.core.groupby import SeriesGroupBy

from pitwall.elo import pre_race_elo

DNF_FINISH = 21.0  # a retirement counts as finishing behind the whole field

PRE_QUALI: list[str] = [
    "elo",
    "elo_rank",
    "drv_finish_ewm",
    "drv_finish_avg5",
    "drv_points_avg5",
    "drv_wins_avg10",
    "drv_podium_avg10",
    "drv_dnf_rate10",
    "drv_quali_avg5",
    "drv_pole_gap_avg5",
    "drv_mate_gap_avg5",
    "drv_circuit_finish",
    "drv_starts",
    "team_points_avg5",
    "team_best_finish_avg5",
    "team_quali_avg5",
    "team_dnf_rate10",
    "team_circuit_finish",
    "season_points_pre",
    "season_rank_pre",
    "team_season_points_pre",
    "round_frac",
]

POST_QUALI: list[str] = [
    *PRE_QUALI,
    "grid",
    "quali_position",
    "gap_to_pole_pct",
    "gap_to_teammate_pct",
    "pit_lane_start",
]


def _prior_mean(g: SeriesGroupBy[Any, Any], window: int) -> pd.Series:
    out: pd.Series = g.transform(lambda s: s.shift(1).rolling(window, min_periods=1).mean())
    return out


def build_features(entries: pd.DataFrame, races: pd.DataFrame | None = None) -> pd.DataFrame:
    """Add feature columns to a copy of `entries` (one row per driver per race)."""
    e = entries.sort_values(["date", "season", "round", "driver_id"]).reset_index(drop=True).copy()
    done = e["position"].notna()

    finish = e["position"].astype("Float64").astype(float)
    finish = finish.where(e["classified"].fillna(False).astype(bool), DNF_FINISH)
    e["_finish"] = finish.where(done, np.nan)
    e["_points"] = (e["points"] + e["sprint_points"].fillna(0)).where(done, np.nan)
    e["_win"] = e["won"].astype(float).where(done, np.nan)
    e["_podium"] = e["podium"].astype(float).where(done, np.nan)
    e["_dnf"] = e["dnf"].astype(float).where(done, np.nan)
    e["_quali"] = e["quali_position"].astype("Float64").astype(float)
    e["_pole_gap"] = e["gap_to_pole_pct"].astype("Float64").astype(float)
    e["_mate_gap"] = e["gap_to_teammate_pct"].astype("Float64").astype(float)

    # ---- driver form (across seasons, in date order) ----
    e["elo"] = pre_race_elo(e)
    e["elo_rank"] = e.groupby(["season", "round"])["elo"].rank(ascending=False, method="min")
    by_drv = e.groupby("driver_id")
    e["drv_finish_ewm"] = by_drv["_finish"].transform(
        lambda s: s.shift(1).ewm(alpha=0.3, ignore_na=True).mean()
    )
    e["drv_finish_avg5"] = _prior_mean(by_drv["_finish"], 5)
    e["drv_points_avg5"] = _prior_mean(by_drv["_points"], 5)
    e["drv_wins_avg10"] = _prior_mean(by_drv["_win"], 10)
    e["drv_podium_avg10"] = _prior_mean(by_drv["_podium"], 10)
    e["drv_dnf_rate10"] = _prior_mean(by_drv["_dnf"], 10)
    e["drv_quali_avg5"] = _prior_mean(by_drv["_quali"], 5)
    e["drv_pole_gap_avg5"] = _prior_mean(by_drv["_pole_gap"], 5)
    e["drv_mate_gap_avg5"] = _prior_mean(by_drv["_mate_gap"], 5)
    e["drv_starts"] = by_drv.cumcount()
    e["drv_circuit_finish"] = e.groupby(["driver_id", "circuit_id"])["_finish"].transform(
        lambda s: s.shift(1).expanding().mean()
    )

    # ---- team form: aggregate both cars per race, then roll ----
    team_race = (
        e.groupby(["season", "round", "date", "constructor_id", "circuit_id"], as_index=False)
        .agg(
            t_points=("_points", "sum"),
            t_best=("_finish", "min"),
            t_quali=("_quali", "min"),
            t_dnf=("_dnf", "mean"),
            t_done=("_finish", "count"),
        )
        .sort_values(["date", "season", "round"])
    )
    team_race.loc[team_race["t_done"] == 0, ["t_points", "t_best", "t_dnf"]] = np.nan
    by_team = team_race.groupby("constructor_id")
    team_race["team_points_avg5"] = _prior_mean(by_team["t_points"], 5)
    team_race["team_best_finish_avg5"] = _prior_mean(by_team["t_best"], 5)
    team_race["team_quali_avg5"] = _prior_mean(by_team["t_quali"], 5)
    team_race["team_dnf_rate10"] = _prior_mean(by_team["t_dnf"], 10)
    team_race["team_circuit_finish"] = team_race.groupby(["constructor_id", "circuit_id"])[
        "t_best"
    ].transform(lambda s: s.shift(1).expanding().mean())
    team_race["team_season_points_pre"] = team_race.groupby(["season", "constructor_id"])[
        "t_points"
    ].transform(lambda s: s.fillna(0).cumsum().shift(1).fillna(0))
    keep = [
        "season",
        "round",
        "constructor_id",
        "team_points_avg5",
        "team_best_finish_avg5",
        "team_quali_avg5",
        "team_dnf_rate10",
        "team_circuit_finish",
        "team_season_points_pre",
    ]
    e = e.merge(team_race[keep], on=["season", "round", "constructor_id"], how="left")

    # ---- championship position before the race ----
    e["season_points_pre"] = e.groupby(["season", "driver_id"])["_points"].transform(
        lambda s: s.fillna(0).cumsum().shift(1).fillna(0)
    )
    e["season_rank_pre"] = e.groupby(["season", "round"])["season_points_pre"].rank(
        ascending=False, method="min"
    )

    if races is not None and not races.empty:
        n_rounds = races.groupby("season")["round"].max()
        e["round_frac"] = e["round"] / e["season"].map(n_rounds)
    else:
        e["round_frac"] = e["round"] / e.groupby("season")["round"].transform("max")

    e["pit_lane_start"] = e["pit_lane_start"].fillna(False).astype(float)
    for col in ("grid", "quali_position"):
        e[col] = e[col].astype("Float64").astype(float)
    # Grid 0 is a pit-lane start: behind everyone, not ahead of pole.
    e.loc[e["grid"] == 0, "grid"] = DNF_FINISH
    for col in ("gap_to_pole_pct", "gap_to_teammate_pct"):
        e[col] = e[col].astype("Float64").astype(float)

    return e.drop(columns=[c for c in e.columns if c.startswith("_")])
