"""Client for the Jolpica F1 API (Ergast-compatible).

Responses are cached on disk. Completed seasons are cached for good; the
current season expires after a few hours so new results come through.
Requests are spaced out to stay inside Jolpica's limits (4 per second,
500 per hour), and failures are retried with backoff.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import requests

from pitwall.config import JOLPICA_BASE_URL

JsonDict = dict[str, Any]

PAGE_SIZE = 100
MIN_INTERVAL_S = 0.35
MAX_RETRIES = 5
USER_AGENT = "pitwall-model/0.1 (+https://github.com/CodeWidKrish/PitWall)"


class JolpicaError(RuntimeError):
    """The API could not be reached or returned something unusable."""


@dataclass
class JolpicaClient:
    cache_dir: Path
    fresh_for_s: float = 6 * 3600
    base_url: str = JOLPICA_BASE_URL
    session: requests.Session = field(default_factory=requests.Session)
    sleep: Callable[[float], None] = time.sleep
    _last_request: float = 0.0
    requests_made: int = 0

    def __post_init__(self) -> None:
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.session.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json"})

    # ---- low level -------------------------------------------------------

    def _cache_path(self, url: str) -> Path:
        return self.cache_dir / f"{hashlib.sha1(url.encode()).hexdigest()}.json"

    def _read_cache(self, url: str, permanent: bool) -> JsonDict | None:
        path = self._cache_path(url)
        if not path.exists():
            return None
        if not permanent and time.time() - path.stat().st_mtime > self.fresh_for_s:
            return None
        data: JsonDict = json.loads(path.read_text(encoding="utf-8"))
        return data

    def _throttle(self) -> None:
        wait = MIN_INTERVAL_S - (time.monotonic() - self._last_request)
        if wait > 0:
            self.sleep(wait)
        self._last_request = time.monotonic()

    def get(self, path: str, *, offset: int = 0, permanent: bool = False) -> JsonDict:
        """Fetch one page of `path` (e.g. "2024/results")."""
        url = f"{self.base_url}/{path}.json?limit={PAGE_SIZE}&offset={offset}"
        cached = self._read_cache(url, permanent)
        if cached is not None:
            return cached

        delay = 2.0
        for attempt in range(1, MAX_RETRIES + 1):
            self._throttle()
            try:
                resp = self.session.get(url, timeout=30)
            except requests.RequestException as exc:
                if attempt == MAX_RETRIES:
                    raise JolpicaError(f"{url}: {exc}") from exc
                self.sleep(delay)
                delay *= 2
                continue
            self.requests_made += 1
            if resp.status_code == 429 or resp.status_code >= 500:
                if attempt == MAX_RETRIES:
                    raise JolpicaError(f"{url}: HTTP {resp.status_code} after {attempt} tries")
                retry_after = resp.headers.get("Retry-After")
                self.sleep(float(retry_after) if retry_after and retry_after.isdigit() else delay)
                delay *= 2
                continue
            if resp.status_code != 200:
                raise JolpicaError(f"{url}: HTTP {resp.status_code}")
            data: JsonDict = resp.json()
            self._cache_path(url).write_text(json.dumps(data), encoding="utf-8")
            return data
        raise JolpicaError(f"{url}: gave up")  # pragma: no cover

    # ---- paginated race tables --------------------------------------------

    def races(self, path: str, *, permanent: bool = False) -> list[JsonDict]:
        """All races for `path`, merging races that are split across pages.

        Ergast-style pagination counts result rows, not races, so one race can
        start at the end of one page and continue on the next.
        """
        merged: dict[tuple[str, str], JsonDict] = {}
        order: list[tuple[str, str]] = []
        offset = 0
        while True:
            page = self.get(path, offset=offset, permanent=permanent)["MRData"]
            total = int(page["total"])
            for race in page["RaceTable"]["Races"]:
                key = (race["season"], race["round"])
                if key not in merged:
                    merged[key] = race
                    order.append(key)
                    continue
                for list_key in ("Results", "QualifyingResults", "SprintResults"):
                    if list_key in race:
                        merged[key].setdefault(list_key, []).extend(race[list_key])
            offset += PAGE_SIZE
            if offset >= total:
                break
        return [merged[k] for k in order]
