"""Race-window weather from the Open-Meteo historical archive.

For each race we take hourly reanalysis data at the circuit's coordinates for
the hour the race starts and the two hours after (a Grand Prix lasts about
1.5 hours). Open-Meteo is free and needs no key or account.

Trade-off: these are grid-cell values (roughly 10-25 km), not readings from the
track's own sensors, and there is no track-surface temperature. They are good
enough to tell a hot, cool or wet race apart, which is what the model needs.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import pandas as pd
import requests

log = logging.getLogger(__name__)

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
HOURLY = "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m"
RACE_HOURS = 3  # start hour + 2
BEFORE_HOURS = 3  # rain in the hours before the start leaves a wet track
WET_DURING_MM = 0.5  # rain during the race that makes it "wet"
WET_BEFORE_MM = 1.0  # rain before the start that likely means a wet start
RAINY_HOUR_MM = 0.2
MIN_INTERVAL_S = 0.25


@dataclass(frozen=True)
class RaceSlot:
    season: int
    round: int
    lat: float
    lon: float
    start_utc: datetime


WeatherLoader = Callable[[RaceSlot], pd.DataFrame | None]


def window(hourly: pd.DataFrame, start_utc: datetime) -> pd.DataFrame:
    """Rows from BEFORE_HOURS before the start hour to the end of the race window.

    Adds a `phase` column: "before" for the lead-up, "race" for the race hours.
    """
    start = pd.Timestamp(start_utc).tz_localize(None).floor("h")
    first = start - timedelta(hours=BEFORE_HOURS)
    last = start + timedelta(hours=RACE_HOURS - 1)
    t = pd.to_datetime(hourly["time"])
    out = hourly[(t >= first) & (t <= last)].copy()
    out["phase"] = ["race" if ts >= start else "before" for ts in pd.to_datetime(out["time"])]
    return out


def summarise(slot: RaceSlot, hours: pd.DataFrame) -> dict[str, Any]:
    """Collapse the window into one row: conditions during the race, plus rain before it."""
    race = hours[hours["phase"] == "race"] if "phase" in hours else hours
    before = hours[hours["phase"] == "before"] if "phase" in hours else hours.iloc[0:0]
    rain = race["precipitation"].fillna(0.0)
    rain_mm = float(rain.sum())
    rain_before_mm = float(before["precipitation"].fillna(0.0).sum())
    return {
        "season": slot.season,
        "round": slot.round,
        "air_temp_c": float(race["temperature_2m"].mean()),
        "humidity_pct": float(race["relative_humidity_2m"].mean()),
        "wind_speed_ms": float(race["wind_speed_10m"].mean()),
        "rain_mm": round(rain_mm, 2),
        "rain_before_mm": round(rain_before_mm, 2),
        "rain_share": float((rain >= RAINY_HOUR_MM).mean()) if len(rain) else 0.0,
        "wet_race": rain_mm >= WET_DURING_MM or rain_before_mm >= WET_BEFORE_MM,
        "weather_hours": len(race),
    }


def open_meteo_loader(
    cache_dir: Path,
    session: requests.Session | None = None,
    sleep: Callable[[float], None] = time.sleep,
) -> WeatherLoader:
    """A loader that fetches (and caches on disk) the hourly archive for a race day."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    http = session or requests.Session()
    http.headers.update({"User-Agent": "pitwall-model/0.1 (+https://github.com/CodeWidKrish/PitWall)"})
    last = [0.0]

    def fetch(slot: RaceSlot) -> pd.DataFrame | None:
        day = (slot.start_utc - timedelta(hours=BEFORE_HOURS)).date()
        end = (slot.start_utc + timedelta(hours=RACE_HOURS)).date()
        params = {
            "latitude": f"{slot.lat:.4f}",
            "longitude": f"{slot.lon:.4f}",
            "start_date": day.isoformat(),
            "end_date": end.isoformat(),
            "hourly": HOURLY,
            "timezone": "UTC",
            "wind_speed_unit": "ms",
        }
        key = hashlib.sha1(json.dumps(params, sort_keys=True).encode()).hexdigest()
        path = cache_dir / f"{key}.json"
        if path.exists():
            payload = json.loads(path.read_text(encoding="utf-8"))
        else:
            wait = MIN_INTERVAL_S - (time.monotonic() - last[0])
            if wait > 0:
                sleep(wait)
            last[0] = time.monotonic()
            resp = http.get(ARCHIVE_URL, params=params, timeout=30)
            if resp.status_code != 200:
                raise RuntimeError(f"Open-Meteo HTTP {resp.status_code}")
            payload = resp.json()
            path.write_text(json.dumps(payload), encoding="utf-8")
        hourly = pd.DataFrame(payload.get("hourly") or {})
        if hourly.empty:
            return None
        return window(hourly, slot.start_utc)

    return fetch


def weather_frame(
    slots: Iterable[RaceSlot],
    loader: WeatherLoader,
    on_progress: Callable[[RaceSlot, int], None] | None = None,
) -> tuple[pd.DataFrame, list[str]]:
    """Weather for every race slot. Returns the table and a list of races it couldn't get."""
    rows: list[dict[str, Any]] = []
    missing: list[str] = []
    for slot in slots:
        try:
            hours = loader(slot)
        except Exception as exc:  # network and parsing errors are reported, not fatal
            log.warning("weather %s R%s failed: %s", slot.season, slot.round, exc)
            hours = None
        if hours is None or len(hours) == 0:
            missing.append(f"{slot.season} R{slot.round}")
        else:
            rows.append(summarise(slot, hours))
        if on_progress:
            on_progress(slot, len(rows))
    return pd.DataFrame(rows), missing
