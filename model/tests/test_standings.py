from __future__ import annotations

import pandas as pd
from conftest import race, result

from pitwall.data import parse
from pitwall.data.standings import reconcile, standings_frame


def _standings(
    season: int, rnd: int, drivers: list[tuple[str, float, int]], teams: list[tuple[str, float, int]]
):
    d = {
        "round": str(rnd),
        "DriverStandings": [
            {"position": str(i + 1), "points": str(p), "wins": str(w), "Driver": {"driverId": did}}
            for i, (did, p, w) in enumerate(drivers)
        ],
    }
    c = {
        "round": str(rnd),
        "ConstructorStandings": [
            {"position": str(i + 1), "points": str(p), "wins": str(w), "Constructor": {"constructorId": cid}}
            for i, (cid, p, w) in enumerate(teams)
        ],
    }
    return pd.concat([standings_frame(season, d, "driver"), standings_frame(season, c, "constructor")])


def _results() -> tuple[pd.DataFrame, pd.DataFrame]:
    races = [
        race(2024, 1, Results=[result(0, 1), result(2, 2), result(3, 3), result(1, 4)]),
        race(2024, 2, Results=[result(2, 1), result(0, 2), result(1, 3), result(3, 4)]),
    ]
    sprint = [race(2024, 2, SprintResults=[{**result(0, 1), "points": "8"}, {**result(2, 2), "points": "7"}])]
    return parse.results_frame(races), parse.results_frame(sprint, key="SprintResults")


MATCHING_DRIVERS = [
    ("max_verstappen", 25 + 18 + 8, 1),
    ("leclerc", 18 + 25 + 7, 1),
    ("sainz", 15 + 12, 0),
    ("perez", 12 + 15, 0),
]
MATCHING_TEAMS = [("red_bull", 51 + 27, 1), ("ferrari", 50 + 27, 1)]


def test_points_and_wins_reconcile_exactly() -> None:
    res, spr = _results()
    mism = reconcile(res, spr, _standings(2024, 2, MATCHING_DRIVERS, MATCHING_TEAMS))
    assert mism.empty


def test_a_points_difference_is_reported() -> None:
    res, spr = _results()
    drivers = [("max_verstappen", 50, 1), *MATCHING_DRIVERS[1:]]
    mism = reconcile(res, spr, _standings(2024, 2, drivers, MATCHING_TEAMS))
    assert len(mism) == 1
    row = mism.iloc[0]
    assert row["entity_id"] == "max_verstappen" and row["diff"] == -1 and not row["explained"]


def test_a_wins_difference_is_reported() -> None:
    res, spr = _results()
    teams = [("red_bull", 78, 2), MATCHING_TEAMS[1]]
    mism = reconcile(res, spr, _standings(2024, 2, MATCHING_DRIVERS, teams))
    assert list(mism["entity_id"]) == ["red_bull"]


def test_standings_cut_off_round_is_respected() -> None:
    # Standings after round 1 only count round 1 results, even though round 2 is in the data.
    res, spr = _results()
    drivers = [("max_verstappen", 25, 1), ("leclerc", 18, 0), ("sainz", 15, 0), ("perez", 12, 0)]
    teams = [("red_bull", 37, 1), ("ferrari", 33, 0)]
    assert reconcile(res, spr, _standings(2024, 1, drivers, teams)).empty


def test_known_adjustment_is_explained() -> None:
    res = parse.results_frame(
        [
            race(
                2020,
                1,
                Results=[{**result(0, 1), "Constructor": {"constructorId": "racing_point", "name": "RP"}}],
            )
        ]
    )
    st = _standings(2020, 1, [("max_verstappen", 25, 1)], [("racing_point", 10, 1)])
    mism = reconcile(res, pd.DataFrame(), st)
    assert len(mism) == 1 and bool(mism.iloc[0]["explained"])
    assert "brake-duct" in mism.iloc[0]["reason"]
