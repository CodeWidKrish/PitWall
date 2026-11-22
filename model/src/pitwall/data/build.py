"""Build PitWall's clean data tables for a range of seasons.

Outputs (Parquet, in `Settings.data_dir`):
  races       one row per Grand Prix on the calendar
  results     one row per driver per race
  qualifying  one row per driver per qualifying session
  sprints     one row per driver per sprint race
  weather     one row per race (Open-Meteo, race window)
  entries     one row per driver per race with everything joined: the modelling table
  manifest    counts, coverage and the data-check report (JSON)
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pandas as pd

from pitwall import __version__
from pitwall.config import Settings
from pitwall.data import parse
from pitwall.data.jolpica import JolpicaClient
from pitwall.data.validate import Report, check
from pitwall.data.weather import RaceSlot, WeatherLoader, weather_frame

log = logging.getLogger(__name__)

TABLES = ("races", "results", "qualifying", "sprints", "weather", "entries")
WEATHER_FEATURES = ("air_temp_c", "humidity_pct", "wind_speed_ms", "rain_mm", "rain_before_mm", "rain_share")


@dataclass
class Tables:
    races: pd.DataFrame
    results: pd.DataFrame
    qualifying: pd.DataFrame
    sprints: pd.DataFrame
    weather: pd.DataFrame
    entries: pd.DataFrame


def fetch_season(client: JolpicaClient, season: int, *, current: bool) -> dict[str, pd.DataFrame]:
    """Download and parse one season. Past seasons are cached permanently."""
    permanent = not current
    return {
        "races": parse.races_frame(client.races(f"{season}", permanent=permanent)),
        "results": parse.results_frame(client.races(f"{season}/results", permanent=permanent)),
        "qualifying": parse.qualifying_frame(client.races(f"{season}/qualifying", permanent=permanent)),
        "sprints": parse.results_frame(
            client.races(f"{season}/sprint", permanent=permanent), key="SprintResults"
        ),
    }


def build_entries(
    races: pd.DataFrame,
    results: pd.DataFrame,
    qualifying: pd.DataFrame,
    sprints: pd.DataFrame,
    weather: pd.DataFrame,
) -> pd.DataFrame:
    """One row per driver per race, with qualifying, sprint and weather joined on."""
    keys = ["season", "round"]
    e = results.merge(
        races[[*keys, "race_name", "date", "circuit_id", "country", "has_sprint"]], on=keys, how="left"
    )
    q = qualifying[
        [*keys, "driver_id", "quali_position", "best_ms", "gap_to_pole_pct", "gap_to_teammate_pct"]
    ]
    e = e.merge(q.rename(columns={"best_ms": "quali_best_ms"}), on=[*keys, "driver_id"], how="left")
    if not sprints.empty:
        s = sprints[[*keys, "driver_id", "position", "points"]].rename(
            columns={"position": "sprint_position", "points": "sprint_points"}
        )
        e = e.merge(s, on=[*keys, "driver_id"], how="left")
    else:
        e["sprint_position"] = pd.array([None] * len(e), dtype="Int64")
        e["sprint_points"] = 0.0
    e["sprint_points"] = e["sprint_points"].fillna(0.0)
    if not weather.empty:
        w = weather[[*keys, *WEATHER_FEATURES, "wet_race"]]
        e = e.merge(w, on=keys, how="left")
    else:
        for col in WEATHER_FEATURES:
            e[col] = float("nan")
        e["wet_race"] = pd.NA

    # targets and simple flags the model will use
    e["won"] = e["position"].eq(1).fillna(False).astype(bool)
    e["podium"] = e["position"].le(3).fillna(False).astype(bool)
    e["points_finish"] = e["points"] > 0
    e["dnf"] = ~e["finished"] & ~e["disqualified"]
    e["teammate_id"] = _teammates(e)
    return e.sort_values([*keys, "position"], na_position="last").reset_index(drop=True)


def _teammates(e: pd.DataFrame) -> pd.Series:
    """The other driver in the same car that weekend (None for one-off third cars)."""
    out = pd.Series([None] * len(e), index=e.index, dtype="object")
    for _, g in e.groupby(["season", "round", "constructor_id"]):
        if len(g) == 2:
            a, b = g.index
            out[a] = e.at[b, "driver_id"]
            out[b] = e.at[a, "driver_id"]
    return out


def race_slots(races: pd.DataFrame, results: pd.DataFrame) -> list[RaceSlot]:
    """Location and start time for every race that has been run."""
    raced = results[["season", "round"]].drop_duplicates()
    r = races.merge(raced, on=["season", "round"])
    r = r.dropna(subset=["lat", "lon"])
    # A few early races lack a start time; assume 13:00 UTC for those.
    starts = r["race_start_utc"].fillna(r["date"] + timedelta(hours=13))
    return [
        RaceSlot(int(s), int(n), float(la), float(lo), pd.Timestamp(t).to_pydatetime())
        for s, n, la, lo, t in zip(r["season"], r["round"], r["lat"], r["lon"], starts, strict=True)
    ]


def build(
    settings: Settings,
    seasons: Sequence[int],
    *,
    client: JolpicaClient | None = None,
    weather_loader: WeatherLoader | None = None,
    today: datetime | None = None,
    progress: Callable[[str], None] = print,
) -> tuple[Tables, Report]:
    settings.ensure_dirs()
    client = client or JolpicaClient(cache_dir=settings.jolpica_cache_dir)
    year_now = (today or datetime.now(UTC)).year

    parts: dict[str, list[pd.DataFrame]] = {k: [] for k in ("races", "results", "qualifying", "sprints")}
    for season in seasons:
        season_data = fetch_season(client, season, current=season >= year_now)
        for k, df in season_data.items():
            if not df.empty:
                parts[k].append(df)
        res = season_data["results"]
        raced_n = 0 if res.empty else res[["season", "round"]].drop_duplicates().shape[0]
        progress(f"  {season}: {len(season_data['races'])} rounds, {raced_n} raced")

    races = pd.concat(parts["races"], ignore_index=True)
    results = pd.concat(parts["results"], ignore_index=True)
    qualifying = pd.concat(parts["qualifying"], ignore_index=True)
    sprints = pd.concat(parts["sprints"], ignore_index=True) if parts["sprints"] else pd.DataFrame()

    weather = pd.DataFrame()
    if weather_loader is not None:
        slots = race_slots(races, results)
        progress(f"  weather: {len(slots)} races from Open-Meteo (cached after the first run)")

        def tick(slot: RaceSlot, done: int) -> None:
            if slot.round == 1:
                progress(f"    {slot.season} ...")

        weather, missing = weather_frame(slots, weather_loader, tick)
        if missing:
            progress(f"  weather: missing for {len(missing)} races: {', '.join(missing[:6])}")

    entries = build_entries(races, results, qualifying, sprints, weather)
    tables = Tables(races, results, qualifying, sprints, weather, entries)
    report = check(races, results, qualifying, sprints, weather, entries)
    write(settings.data_dir, tables, report, seasons, client.requests_made)
    return tables, report


def write(data_dir: Path, t: Tables, report: Report, seasons: Sequence[int], requests_made: int) -> None:
    data_dir.mkdir(parents=True, exist_ok=True)
    for name in TABLES:
        df: pd.DataFrame = getattr(t, name)
        df.to_parquet(data_dir / f"{name}.parquet", index=False)
    raced = t.results[["season", "round"]].drop_duplicates()
    manifest = {
        "built_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "model_version": __version__,
        "seasons": list(seasons),
        "counts": {name: len(getattr(t, name)) for name in TABLES},
        "races_on_calendar": len(t.races),
        "races_completed": len(raced),
        "races_by_season": {str(k): int(v) for k, v in raced.groupby("season").size().items()},
        "weather_coverage": round(len(t.weather) / max(1, len(raced)), 3) if not t.weather.empty else 0.0,
        "api_requests": requests_made,
        "checks": {"ok": report.ok, "errors": report.errors, "warnings": report.warnings},
    }
    (data_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def load(data_dir: Path, name: str) -> pd.DataFrame:
    """Read a built table back (e.g. load(settings.data_dir, "entries"))."""
    return pd.read_parquet(data_dir / f"{name}.parquet")
