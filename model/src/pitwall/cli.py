"""Command-line entry point: `pitwall <command>`."""

from __future__ import annotations

import argparse
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
    print(f"Output        {settings.output_dir}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="pitwall", description="PitWall F1 forecasting model")
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("info", help="show settings and paths")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    settings = Settings()
    if args.command == "info":
        return _info(settings)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
