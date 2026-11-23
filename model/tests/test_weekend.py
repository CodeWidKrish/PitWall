"""Sprint odds, constructor odds, the Saturday update and the live ledger."""

from __future__ import annotations

from datetime import UTC, datetime

import numpy as np
import pandas as pd

from pitwall.weekend import constructor_odds, sprint_odds, update_ledger, with_qualifying


def test_constructor_win_odds_match_the_drivers() -> None:
    scores = np.array([2.0, 1.5, 1.0, 0.2, 0.1, -1.0])
    teams = ["a", "a", "b", "b", "c", "c"]
    rows = {r["team"]: r for r in constructor_odds(scores, teams, samples=60_000)}
    w = np.exp(scores - scores.max())
    p = w / w.sum()
    assert abs(rows["a"]["p_win"] - (p[0] + p[1])) < 0.01
    assert abs(sum(r["p_win"] for r in rows.values()) - 1) < 1e-9
    for r in rows.values():
        assert r["p_one_two"] <= r["p_win"] <= r["p_podium"] <= 1


def test_sprint_odds_sum_to_one_and_sharpen_with_a_low_temperature() -> None:
    scores = np.array([1.0, 0.5, 0.0, -0.5])
    win, podium = sprint_odds(scores, 1.0)
    sharp, _ = sprint_odds(scores, 0.5)
    assert abs(win.sum() - 1) < 1e-9
    assert abs(podium.sum() - 3) < 1e-6
    assert sharp[0] > win[0]


def test_qualifying_sets_the_grid_and_unclassified_start_last() -> None:
    rows = pd.DataFrame({"driver_id": ["x", "y", "z"], "season": 2026, "round": 5})
    quali = pd.DataFrame(
        {
            "season": [2026, 2026],
            "round": [5, 5],
            "driver_id": ["y", "x"],
            "quali_position": [1, 2],
            "gap_to_pole_pct": [0.0, 0.3],
            "gap_to_teammate_pct": [None, None],
        }
    )
    assert with_qualifying(rows, quali, 2026, 6) is None
    out = with_qualifying(rows, quali, 2026, 5)
    assert out is not None
    grid = dict(zip(out["driver_id"], out["grid"], strict=True))
    assert grid == {"x": 2.0, "y": 1.0, "z": 3.0}


def _race(stage: str, p: float) -> dict[str, object]:
    return {
        "season": 2027,
        "round": 1,
        "race_name": "Australian Grand Prix",
        "start_utc": "2027-03-07T04:00:00+00:00",
        "stage": stage,
        "odds": [
            {"driver_id": "a", "p_win": p, "p_podium": 0.9},
            {"driver_id": "b", "p_win": 1 - p, "p_podium": 0.8},
        ],
    }


def test_ledger_publishes_before_the_race_freezes_after_and_scores_the_result() -> None:
    empty = pd.DataFrame({"season": [], "round": [], "position": [], "driver_id": []})
    thu = datetime(2027, 3, 4, tzinfo=UTC)
    led = update_ledger({}, _race("pre_quali", 0.6), empty, thu)
    assert led["calls"][0]["pre"]["odds"][0]["p_win"] == 0.6
    # Same numbers again: the original time stamp stays.
    again = update_ledger(led, _race("pre_quali", 0.6), empty, datetime(2027, 3, 5, tzinfo=UTC))
    assert again["calls"][0]["pre"]["published_at"] == led["calls"][0]["pre"]["published_at"]
    # Saturday: a post-qualifying forecast is added next to the Thursday one.
    sat = update_ledger(again, _race("post_quali", 0.7), empty, datetime(2027, 3, 6, tzinfo=UTC))
    assert sat["calls"][0]["pre"]["odds"][0]["p_win"] == 0.6
    assert sat["calls"][0]["post"]["odds"][0]["p_win"] == 0.7
    # After lights out nothing can be rewritten.
    late = update_ledger(sat, _race("post_quali", 0.1), empty, datetime(2027, 3, 7, 5, tzinfo=UTC))
    assert late["calls"][0]["post"]["odds"][0]["p_win"] == 0.7
    # The result is added once it is in.
    res = pd.DataFrame(
        {"season": [2027] * 3, "round": [1] * 3, "position": [2, 1, 3], "driver_id": ["a", "b", "c"]}
    )
    done = update_ledger(late, None, res, datetime(2027, 3, 8, tzinfo=UTC))
    assert done["calls"][0]["result"] == {"winner": "b", "podium": ["b", "a", "c"]}
