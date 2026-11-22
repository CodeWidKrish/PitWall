"""Monte Carlo season simulation for both championships.

From the current standings, every remaining race (and sprint) is played out
many times. In each simulated race:
  1. each driver may retire, with a chance based on their team's and their own
     recent reliability, pulled toward the league average;
  2. the remaining drivers finish in an order drawn from the Plackett-Luce
     model with the race model's strengths (the "Gumbel trick");
  3. points are awarded (25-18-15-12-10-8-6-4-2-1, sprints 8-7-6-5-4-3-2-1).
Drivers' and constructors' totals are added up, and the share of simulations each
one finishes on top is their title chance.

Assumes the current line-ups stay the same for the rest of the season.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from typing import Any

import numpy as np
import pandas as pd

from pitwall.data.standings import KNOWN_ADJUSTMENTS
from pitwall.features import build_features
from pitwall.model import RaceModel

RACE_POINTS = np.array([25, 18, 15, 12, 10, 8, 6, 4, 2, 1], dtype=float)
SPRINT_POINTS = np.array([8, 7, 6, 5, 4, 3, 2, 1], dtype=float)
DNF_SHRINK = 0.5  # weight on the league average when estimating a driver's DNF chance
SPRINT_DNF_FACTOR = 0.4  # sprints are a third of the distance
# Season-long form swing, in log-odds: scale x (team 0.6, driver 0.3). The scales are tuned
# by `pitwall model backtest` on title forecasts from five points of every 2020-2025 season
# (see model/reports/BACKTEST.md). In-season uses the tuned 1.5x. Pre-season tuning picked
# 0x, but that rests on only six forecasts and gave McLaren 0% for the 2024 constructors'
# title it went on to win, so it is overruled: winter changes are at least as uncertain as
# in-season ones, so pre-season uses the same 1.5x.
BASE_TEAM_SIGMA = 0.6
BASE_DRIVER_SIGMA = 0.3
IN_SEASON_SCALE = 1.5
PRESEASON_SCALE = 1.5


def swing(scale: float) -> tuple[float, float]:
    return BASE_TEAM_SIGMA * scale, BASE_DRIVER_SIGMA * scale


TEAM_FORM_SIGMA, DRIVER_FORM_SIGMA = swing(IN_SEASON_SCALE)


@dataclass
class SeasonState:
    season: int
    after_round: int
    lineup: pd.DataFrame  # driver_id, driver_code, driver_name, constructor_id, constructor_name
    driver_points: pd.Series  # by driver_id
    team_points: pd.Series  # by constructor_id
    future: pd.DataFrame  # one row per remaining race: round, race_name, has_sprint


def current_state(
    entries: pd.DataFrame, races: pd.DataFrame, season: int, after_round: int | None = None
) -> SeasonState:
    """Points and line-up after `after_round` (default: the last completed round)."""
    e = entries[(entries["season"] == season) & entries["position"].notna()]
    if after_round is None:
        after_round = int(e["round"].max())
    e = e[e["round"] <= after_round]
    pts = e["points"] + e["sprint_points"].fillna(0)
    driver_points = pts.groupby(e["driver_id"]).sum()
    team_points = pts.groupby(e["constructor_id"]).sum()
    for a in KNOWN_ADJUSTMENTS:
        if a.season == season and a.kind == "constructor" and a.entity_id in team_points.index:
            team_points[a.entity_id] += a.points
    # Pre-season (after_round == 0): use the line-up from round 1 of that season.
    last = (
        e[e["round"] == after_round]
        if after_round > 0
        else entries[(entries["season"] == season) & (entries["round"] == 1)]
    )
    lineup = last[
        ["driver_id", "driver_code", "driver_name", "constructor_id", "constructor_name"]
    ].reset_index(drop=True)
    future = races[(races["season"] == season) & (races["round"] > after_round)][
        ["season", "round", "race_name", "date", "circuit_id", "country", "has_sprint"]
    ]
    return SeasonState(season, after_round, lineup, driver_points, team_points, future.reset_index(drop=True))


def preseason_state(entries: pd.DataFrame, config: dict[str, Any]) -> tuple[SeasonState, pd.DataFrame]:
    """A season that hasn't started, from a config with its calendar and line-up.

    Returns the state and the calendar as race rows (to append to the races table).
    Driver codes and names come from each driver's latest entry in the data.
    """
    season = int(config["season"])
    cal = pd.DataFrame(config["calendar"])
    cal["season"] = season
    # Placeholder dates two weeks apart from early March: only used to order races.
    cal["date"] = [pd.Timestamp(f"{season}-03-07") + timedelta(days=14 * i) for i in range(len(cal))]
    latest = (
        entries.sort_values(["season", "round"])
        .drop_duplicates("driver_id", keep="last")
        .set_index("driver_id")
    )
    team_names = (
        entries.sort_values(["season", "round"])
        .drop_duplicates("constructor_id", keep="last")
        .set_index("constructor_id")["constructor_name"]
    )
    rows = []
    for seat in config["lineup"]:
        d = seat["driver_id"]
        rows.append(
            {
                "driver_id": d,
                "driver_code": latest.at[d, "driver_code"] if d in latest.index else d[:3].upper(),
                "driver_name": latest.at[d, "driver_name"] if d in latest.index else d,
                "constructor_id": seat["constructor_id"],
                "constructor_name": team_names.get(seat["constructor_id"], seat["constructor_id"]),
                "status": seat.get("status", "confirmed"),
            }
        )
    lineup = pd.DataFrame(rows)
    future = cal[["season", "round", "race_name", "date", "circuit_id", "country", "has_sprint"]]
    state = SeasonState(season, 0, lineup, pd.Series(dtype=float), pd.Series(dtype=float), future)
    # Only the columns the features need; the rest stay missing for a season not yet run.
    races_rows = cal.assign(circuit_name=cal["circuit_id"])
    return state, races_rows


def future_features(entries: pd.DataFrame, races: pd.DataFrame, state: SeasonState) -> pd.DataFrame:
    """Pre-qualifying features for every driver in every remaining race."""
    if state.future.empty:
        return pd.DataFrame()
    history = entries[
        (entries["season"] < state.season)
        | ((entries["season"] == state.season) & (entries["round"] <= state.after_round))
    ]
    rows = []
    for race in state.future.itertuples(index=False):
        for d in state.lineup.itertuples(index=False):
            rows.append(
                {
                    "season": race.season,
                    "round": race.round,
                    "race_name": race.race_name,
                    "date": race.date,
                    "circuit_id": race.circuit_id,
                    "country": race.country,
                    "has_sprint": race.has_sprint,
                    "driver_id": d.driver_id,
                    "driver_code": d.driver_code,
                    "driver_name": d.driver_name,
                    "constructor_id": d.constructor_id,
                    "constructor_name": d.constructor_name,
                    "points": 0.0,
                    "sprint_points": 0.0,
                    "classified": False,
                    "finished": False,
                    "disqualified": False,
                    "won": False,
                    "podium": False,
                    "dnf": False,
                    "pit_lane_start": False,
                }
            )
    placeholders = pd.DataFrame(rows)
    for col in ("position", "grid", "quali_position"):
        placeholders[col] = pd.array([None] * len(placeholders), dtype="Int64")
    for col in ("gap_to_pole_pct", "gap_to_teammate_pct"):
        placeholders[col] = pd.array([None] * len(placeholders), dtype="Float64")
    feats = build_features(pd.concat([history, placeholders], ignore_index=True), races)
    future = feats[(feats["season"] == state.season) & (feats["round"] > state.after_round)]
    return future.sort_values(["round", "driver_id"]).reset_index(drop=True)


def _dnf_chance(f: pd.DataFrame, league_rate: float) -> np.ndarray:
    own = f[["team_dnf_rate10", "drv_dnf_rate10"]].mean(axis=1).fillna(league_rate)
    return ((1 - DNF_SHRINK) * own + DNF_SHRINK * league_rate).clip(0.01, 0.5).to_numpy()


def _simulate_race(
    log_w: np.ndarray, p_dnf: np.ndarray, table: np.ndarray, n: int, rng: np.random.Generator
) -> np.ndarray:
    """Points for each driver (columns) in each of `n` simulations (rows)."""
    k = log_w.shape[-1]
    keys = (log_w if log_w.ndim == 2 else log_w[None, :]) + rng.gumbel(size=(n, k))
    dnf = rng.random((n, k)) < p_dnf[None, :]
    keys[dnf] = -np.inf
    order = np.argsort(-keys, axis=1)
    pts = np.zeros((n, k))
    m = min(len(table), k)
    rows = np.arange(n)[:, None]
    finishers = ~np.take_along_axis(dnf, order[:, :m], axis=1)
    pts[rows, order[:, :m]] = table[None, :m] * finishers
    return pts


def clinched(rows: list[dict[str, Any]], max_gain: float) -> str | None:
    """The leader's id if nobody can catch them even by winning everything left."""
    by_points = sorted(rows, key=lambda r: -r["points_now"])
    if len(by_points) < 2:
        return None
    lead = by_points[0]["points_now"] - by_points[1]["points_now"]
    if lead > max_gain:
        return str(by_points[0].get("driver_id") or by_points[0].get("constructor_id"))
    return None


def simulate(
    entries: pd.DataFrame,
    races: pd.DataFrame,
    model: RaceModel,
    season: int,
    after_round: int | None = None,
    n_sims: int = 10_000,
    seed: int = 2027,
    team_form_sigma: float = TEAM_FORM_SIGMA,
    driver_form_sigma: float = DRIVER_FORM_SIGMA,
    state: SeasonState | None = None,
    feats: pd.DataFrame | None = None,
) -> dict[str, Any]:
    """Title odds. Pass `state` for a season that hasn't started (see preseason_state),
    and `feats` to reuse future features across repeated runs."""
    state = state or current_state(entries, races, season, after_round)
    lineup = state.lineup
    drivers = list(lineup["driver_id"])
    teams = sorted(lineup["constructor_id"].unique())
    team_of = dict(zip(lineup["driver_id"], lineup["constructor_id"], strict=True))

    base_d = np.array([state.driver_points.get(d, 0.0) for d in drivers])
    base_t = np.array([state.team_points.get(t, 0.0) for t in teams])
    sim_d = np.repeat(base_d[None, :], n_sims, axis=0)

    if feats is None:
        feats = future_features(entries, races, state)
    recent = entries[(entries["season"] >= season - 1) & entries["position"].notna()]
    league_dnf = float(recent["dnf"].mean()) if len(recent) else 0.1
    rng = np.random.default_rng(seed)
    # Form uncertainty: each simulated season gets its own swing in every team's and
    # driver's strength, so upgrades and slumps over the remaining races are possible.
    team_idx = np.array([teams.index(team_of[d]) for d in drivers])
    swing = rng.normal(0, team_form_sigma, (n_sims, len(teams)))[:, team_idx] + rng.normal(
        0, driver_form_sigma, (n_sims, len(drivers))
    )
    for _, race in feats.groupby("round", sort=True):
        race = race.set_index("driver_id").reindex(drivers).reset_index()
        log_w = model.scores(race)[None, :] + swing
        p_dnf = _dnf_chance(race, league_dnf)
        sim_d += _simulate_race(log_w, p_dnf, RACE_POINTS, n_sims, rng)
        if bool(race["has_sprint"].iloc[0]):
            sim_d += _simulate_race(log_w, p_dnf * SPRINT_DNF_FACTOR, SPRINT_POINTS, n_sims, rng)

    sim_t = np.repeat(base_t[None, :], n_sims, axis=0)
    gained = sim_d - base_d[None, :]
    for j in range(len(teams)):
        sim_t[:, j] += gained[:, team_idx == j].sum(axis=1)

    def champion_share(totals: np.ndarray) -> np.ndarray:
        tie_break = rng.random(totals.shape) * 1e-6
        winners = np.argmax(totals + tie_break, axis=1)
        return np.bincount(winners, minlength=totals.shape[1]) / len(totals)

    p_d, p_t = champion_share(sim_d), champion_share(sim_t)
    names = lineup.set_index("driver_id")
    team_names = lineup.drop_duplicates("constructor_id").set_index("constructor_id")["constructor_name"]
    driver_rows = sorted(
        (
            {
                "driver_id": d,
                "code": names.at[d, "driver_code"],
                "name": names.at[d, "driver_name"],
                "team": team_of[d],
                "seat_status": str(names.at[d, "status"]) if "status" in names.columns else "raced",
                "points_now": float(base_d[i]),
                "expected_points": round(float(sim_d[:, i].mean()), 1),
                "p_title": round(float(p_d[i]), 4),
            }
            for i, d in enumerate(drivers)
        ),
        key=lambda r: (-r["p_title"], -r["expected_points"]),
    )
    team_rows = sorted(
        (
            {
                "constructor_id": t,
                "name": team_names[t],
                "points_now": float(base_t[j]),
                "expected_points": round(float(sim_t[:, j].mean()), 1),
                "p_title": round(float(p_t[j]), 4),
            }
            for j, t in enumerate(teams)
        ),
        key=lambda r: (-r["p_title"], -r["expected_points"]),
    )
    races_left = len(state.future)
    sprints_left = int(state.future["has_sprint"].sum())
    max_driver = races_left * RACE_POINTS[0] + sprints_left * SPRINT_POINTS[0]
    max_team = races_left * RACE_POINTS[:2].sum() + sprints_left * SPRINT_POINTS[:2].sum()
    return {
        "season": season,
        "after_round": state.after_round,
        "drivers_clinched_by": clinched(driver_rows, max_driver),
        "constructors_clinched_by": clinched(team_rows, max_team),
        "remaining_rounds": [int(r) for r in state.future["round"]],
        "remaining_sprints": int(state.future["has_sprint"].sum()),
        "simulations": n_sims,
        "drivers": driver_rows,
        "constructors": team_rows,
    }
