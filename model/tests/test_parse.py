from __future__ import annotations

import pytest
from conftest import JsonDict, constructor, driver, race

from pitwall.data import parse


@pytest.mark.parametrize(
    ("text", "ms"),
    [("1:23.456", 83456), ("83.456", 83456), ("0:59.999", 59999), ("", None), (None, None), ("DNF", None)],
)
def test_lap_time_ms(text: str | None, ms: int | None) -> None:
    assert parse.lap_time_ms(text) == ms


@pytest.mark.parametrize(
    ("status", "finished"),
    [
        ("Finished", True),
        ("+1 Lap", True),
        ("+3 Laps", True),
        ("Lapped", True),
        ("Engine", False),
        ("Accident", False),
    ],
)
def test_is_finished(status: str, finished: bool) -> None:
    assert parse.is_finished(status) is finished


def test_results_frame_classifies_finishers_and_retirements(standard_results: list[JsonDict]) -> None:
    df = parse.results_frame(standard_results).set_index("driver_code")
    assert df.loc["VER", "position"] == 1 and df.loc["VER", "finished"]
    assert df.loc["SAI", "finished"]  # lapped but took the flag
    assert not df.loc["PER", "finished"] and not df.loc["PER", "classified"]
    assert df.loc["PER", "status"] == "Engine"
    assert df["points"].sum() == 25 + 18 + 15 + 12


def test_results_frame_flags_pit_lane_start() -> None:
    r = race(2024, 1, Results=[{**_res(0, 1), "grid": "0"}])
    assert bool(parse.results_frame([r])["pit_lane_start"].iloc[0])


def _res(i: int, pos: int) -> JsonDict:
    return {
        "number": "1",
        "position": str(pos),
        "positionText": str(pos),
        "points": "25",
        "Driver": driver(i),
        "Constructor": constructor(i),
        "grid": "1",
        "laps": "57",
        "status": "Finished",
    }


def _q(i: int, pos: int, q1: str | None, q2: str | None = None, q3: str | None = None) -> JsonDict:
    out: JsonDict = {"position": str(pos), "Driver": driver(i), "Constructor": constructor(i)}
    for k, v in (("Q1", q1), ("Q2", q2), ("Q3", q3)):
        if v is not None:
            out[k] = v
    return out


def test_qualifying_gaps_compare_within_one_session() -> None:
    # Leclerc's Q1 lap is quicker than Verstappen's pole time in Q3, but grip
    # differs between sessions, so the pole sitter must still show a 0% gap.
    r = race(
        2024,
        1,
        QualifyingResults=[
            _q(0, 1, "1:31.000", "1:30.500", "1:30.000"),
            _q(2, 2, "1:29.900", "1:30.400", "1:30.300"),
            _q(1, 3, "1:31.500", "1:31.000"),  # out in Q2
            _q(3, 4, "1:32.000"),  # out in Q1
        ],
    )
    df = parse.qualifying_frame([r]).set_index("driver_id")
    assert df.loc["max_verstappen", "gap_to_pole_pct"] == 0
    assert df.loc["leclerc", "gap_to_pole_pct"] == pytest.approx(300 / 90000 * 100)
    assert df.loc["perez", "reached_session"] == 2
    # Teammates are compared in the deepest session both reached (Q2 for VER/PER).
    assert df.loc["perez", "gap_to_teammate_pct"] == pytest.approx(500 / 90500 * 100)
    assert df.loc["max_verstappen", "gap_to_teammate_pct"] == 0
    # Sainz only reached Q1, so Leclerc vs Sainz is measured in Q1.
    assert df.loc["sainz", "gap_to_teammate_pct"] == pytest.approx(2100 / 89900 * 100)


def test_races_frame_reads_schedule_and_sprint_flag() -> None:
    sched = [race(2024, 2), {**race(2024, 1), "Sprint": {"date": "2024-03-01"}}]
    df = parse.races_frame(sched)
    assert list(df["round"]) == [1, 2]
    assert list(df["has_sprint"]) == [True, False]
    assert df["lat"].iloc[0] == pytest.approx(26.0)
