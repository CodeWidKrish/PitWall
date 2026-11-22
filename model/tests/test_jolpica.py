from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
import requests
from conftest import JsonDict, race, result

from pitwall.data.jolpica import JolpicaClient, JolpicaError


class FakeResponse:
    def __init__(self, status: int, payload: JsonDict | None = None, headers: dict[str, str] | None = None):
        self.status_code = status
        self._payload = payload or {}
        self.headers = headers or {}

    def json(self) -> JsonDict:
        return self._payload


class FakeSession(requests.Session):
    def __init__(self, responses: list[FakeResponse]):
        super().__init__()
        self.responses = responses
        self.urls: list[str] = []

    def get(self, url: str | bytes, **kwargs: Any) -> Any:  # type: ignore[override]
        self.urls.append(str(url))
        return self.responses.pop(0)


def page(total: int, offset: int, races: list[JsonDict]) -> JsonDict:
    return {
        "MRData": {"total": str(total), "offset": str(offset), "limit": "100", "RaceTable": {"Races": races}}
    }


def client(tmp_path: Path, responses: list[FakeResponse]) -> tuple[JolpicaClient, FakeSession]:
    s = FakeSession(responses)
    return JolpicaClient(cache_dir=tmp_path, session=s, sleep=lambda _: None), s


def test_races_merges_a_race_split_across_pages(tmp_path: Path) -> None:
    first = page(150, 0, [race(2024, 1, Results=[result(0, 1)]), race(2024, 2, Results=[result(0, 1)])])
    second = page(150, 100, [race(2024, 2, Results=[result(2, 2)]), race(2024, 3, Results=[result(0, 1)])])
    c, s = client(tmp_path, [FakeResponse(200, first), FakeResponse(200, second)])
    races = c.races("2024/results")
    assert [r["round"] for r in races] == ["1", "2", "3"]
    assert len(races[1]["Results"]) == 2
    assert "offset=100" in s.urls[1]


def test_second_call_is_served_from_cache(tmp_path: Path) -> None:
    payload = page(1, 0, [race(2024, 1)])
    c, s = client(tmp_path, [FakeResponse(200, payload)])
    c.races("2024", permanent=True)
    c.races("2024", permanent=True)
    assert len(s.urls) == 1
    assert c.requests_made == 1
    assert len(list(tmp_path.glob("*.json"))) == 1
    assert json.loads(next(tmp_path.glob("*.json")).read_text())["MRData"]["total"] == "1"


def test_rate_limit_is_retried(tmp_path: Path) -> None:
    payload = page(1, 0, [race(2024, 1)])
    c, s = client(tmp_path, [FakeResponse(429, headers={"Retry-After": "1"}), FakeResponse(200, payload)])
    assert len(c.races("2024")) == 1
    assert len(s.urls) == 2


def test_client_error_is_not_retried(tmp_path: Path) -> None:
    c, s = client(tmp_path, [FakeResponse(404)])
    with pytest.raises(JolpicaError, match="HTTP 404"):
        c.get("1800/results")
    assert len(s.urls) == 1
