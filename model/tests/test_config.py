import argparse
from pathlib import Path

import pytest

from pitwall.cli import main, parse_seasons
from pitwall.config import FORECAST_SEASON, Settings


def test_training_seasons_cover_2018_to_2026() -> None:
    seasons = Settings().training_seasons
    assert seasons[0] == 2018
    assert seasons[-1] == 2026
    assert FORECAST_SEASON not in seasons


def test_ensure_dirs_creates_folders(tmp_path: Path) -> None:
    settings = Settings(cache_dir=tmp_path / "cache", data_dir=tmp_path / "data", output_dir=tmp_path / "out")
    settings.ensure_dirs()
    assert settings.jolpica_cache_dir.is_dir()
    assert settings.weather_cache_dir.is_dir()
    assert settings.data_dir.is_dir()
    assert settings.output_dir.is_dir()


def test_cli_info_runs(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["info"]) == 0
    assert "Forecast      2027" in capsys.readouterr().out


@pytest.mark.parametrize(
    ("text", "seasons"),
    [("2024", [2024]), ("2018-2020", [2018, 2019, 2020]), ("2019, 2021", [2019, 2021])],
)
def test_parse_seasons(text: str, seasons: list[int]) -> None:
    assert parse_seasons(text) == seasons


def test_parse_seasons_rejects_backwards_range() -> None:
    with pytest.raises(argparse.ArgumentTypeError):
        parse_seasons("2026-2018")
