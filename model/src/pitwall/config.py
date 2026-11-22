"""Paths and season settings shared across the pipeline."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

MODEL_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = MODEL_ROOT.parent

# API response caches live outside OneDrive by default so they never sync.
DEFAULT_CACHE_DIR = Path(os.environ.get("PITWALL_CACHE_DIR", Path.home() / ".cache" / "pitwall"))

# Clean tables built by the pipeline (gitignored, rebuilt with `pitwall data build`).
DEFAULT_DATA_DIR = MODEL_ROOT / "data" / "processed"

# Where the pipeline writes the JSON the website reads.
DEFAULT_OUTPUT_DIR = REPO_ROOT / "web" / "public" / "data"

JOLPICA_BASE_URL = "https://api.jolpi.ca/ergast/f1"

# The modern era of complete, consistent data starts in 2018.
FIRST_SEASON = 2018
LAST_COMPLETED_SEASON = 2026
FORECAST_SEASON = 2027


@dataclass(frozen=True)
class Settings:
    """Runtime settings, resolved once at start-up."""

    cache_dir: Path = DEFAULT_CACHE_DIR
    data_dir: Path = DEFAULT_DATA_DIR
    output_dir: Path = DEFAULT_OUTPUT_DIR
    first_season: int = FIRST_SEASON
    last_completed_season: int = LAST_COMPLETED_SEASON
    forecast_season: int = FORECAST_SEASON

    @property
    def training_seasons(self) -> list[int]:
        """Every completed season the model may learn from."""
        return list(range(self.first_season, self.last_completed_season + 1))

    @property
    def jolpica_cache_dir(self) -> Path:
        return self.cache_dir / "jolpica"

    @property
    def weather_cache_dir(self) -> Path:
        return self.cache_dir / "open-meteo"

    def ensure_dirs(self) -> None:
        """Create the cache, data and output folders if they are missing."""
        for d in (self.jolpica_cache_dir, self.weather_cache_dir, self.data_dir, self.output_dir):
            d.mkdir(parents=True, exist_ok=True)
