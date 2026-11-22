"""Small, hand-made Ergast-style payloads so tests never touch the network."""

from __future__ import annotations

from typing import Any

import pytest

JsonDict = dict[str, Any]

DRIVERS = [
    ("max_verstappen", "VER", "Max", "Verstappen", "red_bull", "Red Bull"),
    ("perez", "PER", "Sergio", "Perez", "red_bull", "Red Bull"),
    ("leclerc", "LEC", "Charles", "Leclerc", "ferrari", "Ferrari"),
    ("sainz", "SAI", "Carlos", "Sainz", "ferrari", "Ferrari"),
]


def driver(i: int) -> JsonDict:
    did, code, given, family, *_ = DRIVERS[i]
    return {"driverId": did, "code": code, "givenName": given, "familyName": family}


def constructor(i: int) -> JsonDict:
    *_, cid, name = DRIVERS[i]
    return {"constructorId": cid, "name": name}


def result(
    i: int, pos: int, status: str = "Finished", pos_text: str | None = None, grid: int = 1
) -> JsonDict:
    return {
        "number": str(i + 1),
        "position": str(pos),
        "positionText": pos_text or str(pos),
        "points": str({1: 25, 2: 18, 3: 15, 4: 12}.get(pos, 0)),
        "Driver": driver(i),
        "Constructor": constructor(i),
        "grid": str(grid),
        "laps": "57",
        "status": status,
    }


def race(season: int, rnd: int, **lists: list[JsonDict]) -> JsonDict:
    base: JsonDict = {
        "season": str(season),
        "round": str(rnd),
        "raceName": f"Test Grand Prix {rnd}",
        "date": f"{season}-03-{rnd:02d}",
        "Circuit": {
            "circuitId": f"circuit_{rnd}",
            "circuitName": f"Circuit {rnd}",
            "Location": {"lat": "26.0", "long": "50.5", "locality": "Town", "country": "Land"},
        },
    }
    base.update(lists)
    return base


@pytest.fixture
def standard_results() -> list[JsonDict]:
    return [
        race(
            2024,
            1,
            Results=[
                result(0, 1, grid=1),
                result(2, 2, grid=2),
                result(3, 3, "+1 Lap", grid=4),
                result(1, 4, "Engine", pos_text="R", grid=3),
            ],
        )
    ]
