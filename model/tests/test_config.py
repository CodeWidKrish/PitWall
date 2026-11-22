from pathlib import Path

import pytest

from pitwall.cli import main
from pitwall.config import FORECAST_SEASON, Settings


def test_training_seasons_cover_2018_to_2026() -> None:
    seasons = Settings().training_seasons
    assert seasons[0] == 2018
    assert seasons[-1] == 2026
    assert FORECAST_SEASON not in seasons


def test_ensure_dirs_creates_folders(tmp_path: Path) -> None:
    settings = Settings(cache_dir=tmp_path / "cache", output_dir=tmp_path / "out")
    settings.ensure_dirs()
    assert settings.cache_dir.is_dir()
    assert settings.output_dir.is_dir()


def test_cli_info_runs(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["info"]) == 0
    assert "Forecast      2027" in capsys.readouterr().out
