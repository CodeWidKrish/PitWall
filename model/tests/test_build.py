from __future__ import annotations

from datetime import datetime

import pandas as pd
import pytest
from conftest import JsonDict, race, result

from pitwall.data import parse
from pitwall.data.build import build_entries, race_slots
from pitwall.data.validate import check, expected_grid_size
from pitwall.data.weather import RaceSlot, summarise, weather_frame, window


def _tables(results_payload: list[JsonDict]) -> tuple[pd.DataFrame, ...]:
    races = parse.races_frame([race(2024, 1)])
    results = parse.results_frame(results_payload)
    quali = parse.qualifying_frame([])
    return races, results, quali


def test_entries_join_teammates_and_targets(standard_results: list[JsonDict]) -> None:
    races, results, _ = _tables(standard_results)
    q = pd.DataFrame(
        {
            "season": [2024] * 4,
            "round": [1] * 4,
            "driver_id": ["max_verstappen", "leclerc", "perez", "sainz"],
            "quali_position": [1, 2, 3, 4],
            "best_ms": [90000, 90100, 90200, 90300],
            "gap_to_pole_pct": [0.0, 0.1, 0.2, 0.3],
            "gap_to_teammate_pct": [0.0, 0.0, 0.2, 0.2],
        }
    )
    e = build_entries(races, results, q, pd.DataFrame(), pd.DataFrame()).set_index("driver_id")
    assert e.loc["max_verstappen", "won"] and e.loc["max_verstappen", "teammate_id"] == "perez"
    assert e.loc["sainz", "podium"] and not e.loc["sainz", "dnf"]
    assert e.loc["perez", "dnf"]
    assert e["won"].sum() == 1
    assert e.loc["leclerc", "quali_position"] == 2


def test_checks_pass_on_clean_data(standard_results: list[JsonDict]) -> None:
    races, results, quali = _tables(standard_results)
    e = build_entries(races, results, quali, pd.DataFrame(), pd.DataFrame())
    report = check(races, results, quali, pd.DataFrame(), None, e)
    assert report.ok, report.errors


def test_checks_catch_two_winners() -> None:
    bad = [race(2024, 1, Results=[result(0, 1), result(2, 1)])]
    races, results, quali = _tables(bad)
    e = build_entries(races, results, quali, pd.DataFrame(), pd.DataFrame())
    report = check(races, results, quali, pd.DataFrame(), None, e)
    assert not report.ok
    assert any("winners" in msg for msg in report.errors)


def test_grid_size_changes_in_2026() -> None:
    assert expected_grid_size(2025) == 20
    assert expected_grid_size(2026) == 22


def _hourly(day: str) -> pd.DataFrame:
    hours = pd.date_range(f"{day} 00:00", periods=24, freq="h")
    rain = [0.0] * 24
    rain[15], rain[16] = 0.4, 0.3  # rain during a 15:00 start
    return pd.DataFrame(
        {
            "time": hours.strftime("%Y-%m-%dT%H:%M"),
            "temperature_2m": [float(h) for h in range(24)],
            "relative_humidity_2m": [50.0] * 24,
            "precipitation": rain,
            "wind_speed_10m": [2.0] * 24,
        }
    )


def test_window_takes_the_start_hour_and_the_next_two() -> None:
    hours = window(_hourly("2024-03-02"), datetime(2024, 3, 2, 15, 30))
    assert list(hours["temperature_2m"]) == [12.0, 13.0, 14.0, 15.0, 16.0, 17.0]
    assert list(hours["phase"]) == ["before"] * 3 + ["race"] * 3


def test_weather_summary_flags_a_wet_race() -> None:
    slot = RaceSlot(2024, 1, 26.0, 50.5, datetime(2024, 3, 2, 15, 0))
    row = summarise(slot, window(_hourly("2024-03-02"), slot.start_utc))
    assert row["air_temp_c"] == 16.0
    assert row["rain_mm"] == 0.7 and row["wet_race"]
    assert row["rain_before_mm"] == 0.0
    assert row["rain_share"] == pytest.approx(2 / 3)


def test_rain_before_the_start_makes_a_wet_race() -> None:
    hourly = _hourly("2024-03-02")
    hourly.loc[13, "precipitation"] = 1.5  # heavy shower two hours before a 15:00 start
    hourly.loc[15:16, "precipitation"] = 0.0
    slot = RaceSlot(2024, 1, 26.0, 50.5, datetime(2024, 3, 2, 15, 0))
    row = summarise(slot, window(hourly, slot.start_utc))
    assert row["rain_mm"] == 0.0 and row["rain_before_mm"] == 1.5 and row["wet_race"]


def test_weather_frame_reports_missing_races() -> None:
    def loader(slot: RaceSlot) -> pd.DataFrame | None:
        if slot.round == 2:
            raise RuntimeError("no data")
        return window(_hourly("2024-03-02"), slot.start_utc)

    slots = [RaceSlot(2024, r, 26.0, 50.5, datetime(2024, 3, 2, 15, 0)) for r in (1, 2)]
    df, missing = weather_frame(slots, loader)
    assert len(df) == 1
    assert missing == ["2024 R2"]


def test_race_slots_default_a_missing_start_time() -> None:
    sched = [race(2024, 1), {**race(2024, 2), "time": "05:10:00Z"}]
    races = parse.races_frame(sched)
    res = parse.results_frame([race(2024, 1, Results=[result(0, 1)]), race(2024, 2, Results=[result(0, 1)])])
    slots = {s.round: s for s in race_slots(races, res)}
    assert slots[1].start_utc == datetime(2024, 3, 1, 13, 0)
    assert slots[2].start_utc == datetime(2024, 3, 2, 5, 10)
