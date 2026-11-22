"""Command-line entry point: `pitwall <command>`."""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence

from pitwall import __version__
from pitwall.config import Settings


def _info(settings: Settings) -> int:
    print(f"PitWall model {__version__}")
    print(f"Python        {sys.version.split()[0]}")
    print(f"Seasons       {settings.first_season}-{settings.last_completed_season} (training)")
    print(f"Forecast      {settings.forecast_season}")
    print(f"Cache         {settings.cache_dir}")
    print(f"Data          {settings.data_dir}")
    print(f"Output        {settings.output_dir}")
    return 0


def parse_seasons(text: str) -> list[int]:
    """'2018-2026' or '2024' or '2019,2021' into a sorted list of seasons."""
    seasons: set[int] = set()
    for part in text.split(","):
        part = part.strip()
        if "-" in part:
            a, b = part.split("-", 1)
            lo, hi = int(a), int(b)
            if lo > hi:
                raise argparse.ArgumentTypeError(f"bad season range: {part}")
            seasons.update(range(lo, hi + 1))
        elif part:
            seasons.add(int(part))
    if not seasons or min(seasons) < 1950:
        raise argparse.ArgumentTypeError(f"bad seasons: {text}")
    return sorted(seasons)


def _data_build(settings: Settings, seasons: list[int], weather: bool) -> int:
    from pitwall.data.build import build
    from pitwall.data.weather import open_meteo_loader

    print(f"Building data for {seasons[0]}-{seasons[-1]}")
    loader = open_meteo_loader(settings.weather_cache_dir) if weather else None
    tables, report = build(settings, seasons, weather_loader=loader)
    print(f"Wrote {len(tables.entries):,} driver-race rows to {settings.data_dir}")
    return _print_report(report.errors, report.warnings)


def _data_check(settings: Settings) -> int:
    path = settings.data_dir / "manifest.json"
    if not path.exists():
        print("No data yet. Run `pitwall data build` first.")
        return 1
    m = json.loads(path.read_text(encoding="utf-8"))
    print(f"Built {m['built_at']} for seasons {m['seasons'][0]}-{m['seasons'][-1]}")
    print(f"Races completed: {m['races_completed']} of {m['races_on_calendar']} on the calendar")
    for name, n in m["counts"].items():
        print(f"  {name:<11} {n:>6,}")
    print(f"Weather coverage: {m['weather_coverage']:.0%}")
    return _print_report(m["checks"]["errors"], m["checks"]["warnings"])


def _print_report(errors: list[str], warnings: list[str]) -> int:
    for w in warnings:
        print(f"WARN  {w}")
    for e in errors:
        print(f"ERROR {e}")
    print("Checks passed" if not errors else f"{len(errors)} check(s) failed")
    return 0 if not errors else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="pitwall", description="PitWall F1 forecasting model")
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("info", help="show settings and paths")

    data = sub.add_parser("data", help="build and check the data tables")
    data_sub = data.add_subparsers(dest="data_command", required=True)
    b = data_sub.add_parser("build", help="download, clean and validate data")
    b.add_argument("--seasons", type=parse_seasons, default=None, help="e.g. 2018-2026 (default: all)")
    b.add_argument("--no-weather", action="store_true", help="skip the weather download")
    data_sub.add_parser("check", help="show what was built and re-print the checks")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    settings = Settings()
    if args.command == "info":
        return _info(settings)
    if args.command == "data":
        if args.data_command == "build":
            seasons = args.seasons or [*settings.training_seasons]
            return _data_build(settings, seasons, weather=not args.no_weather)
        if args.data_command == "check":
            return _data_check(settings)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
