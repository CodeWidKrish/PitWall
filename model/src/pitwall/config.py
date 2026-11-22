"""Paths and season settings shared across the pipeline."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

MODEL_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = MODEL_ROOT.parent

# The FastF1 cache can reach several GB, so it lives outside OneDrive by default.
DEFAULT_CACHE_DIR = Path(os.environ.get("PITWALL_CACHE_DIR", Path.home() / ".cache" / "pitwall" / "fastf1"))

# Where the pipeline writes the JSON the website reads.
DEFAULT_OUTPUT_DIR = REPO_ROOT / "web" / "public" / "data"

JOLPICA_BASE_URL = "https://api.jolpi.ca/ergast/f1"

# FastF1 timing data is reliable from 2018 onwards.
FIRST_SEASON = 2018
LAST_COMPLETED_SEASON = 2026
FORECAST_SEASON = 2027


@dataclass(frozen=True)
class Settings:
    """Runtime settings, resolved once at start-up."""

    cache_dir: Path = DEFAULT_CACHE_DIR
    output_dir: Path = DEFAULT_OUTPUT_DIR
    first_season: int = FIRST_SEASON
    last_completed_season: int = LAST_COMPLETED_SEASON
    forecast_season: int = FORECAST_SEASON

    @property
    def training_seasons(self) -> list[int]:
        """Every completed season the model may learn from."""
        return list(range(self.first_season, self.last_completed_season + 1))

    def ensure_dirs(self) -> None:
        """Create the cache and output folders if they are missing."""
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.output_dir.mkdir(parents=True, exist_ok=True)
