"""Command-line entry point: `pitwall <command>`."""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from typing import Any

import pandas as pd

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


def _load_tables(settings: Settings) -> dict[str, Any] | None:
    from pitwall.data.build import load

    if not (settings.data_dir / "entries.parquet").exists():
        print("No data yet. Run `pitwall data build` first.")
        return None
    return {name: load(settings.data_dir, name) for name in ("entries", "races", "standings")}


def _model_backtest(settings: Settings, seasons: list[int]) -> int:
    from pitwall import backtest
    from pitwall.features import build_features

    t = _load_tables(settings)
    if t is None:
        return 1
    feats = build_features(t["entries"], t["races"])
    print(
        f"Backtesting {seasons[0]}-{seasons[-1]} (each season uses a model trained on earlier seasons only)"
    )
    report = backtest.run(feats, seasons)
    report["title_calibration"] = backtest.title_calibration(
        t["entries"],
        t["races"],
        t["standings"],
        feats,
        [y for y in seasons if y < settings.last_completed_season],
    )
    _, md_path = backtest.write(report, settings.reports_dir)
    for mode, r in report["modes"].items():
        m, b = r["overall"]["model"], r["overall"][r["baseline"]]
        print(
            f"{mode:<10} winner {m['winner_hit']:.1%} (baseline {b['winner_hit']:.1%}) | "
            f"winner in top 3 {m['winner_in_top3']:.1%} | Brier {m['brier']:.3f} (baseline {b['brier']:.3f})"
        )
    print(f"Report: {md_path}")
    return 0


def _model_simulate(settings: Settings, season: int | None, sims: int) -> int:
    from pitwall.features import PRE_QUALI, build_features
    from pitwall.model import fit, select_kind
    from pitwall.simulate import PRESEASON_SCALE, preseason_state, simulate, swing

    t = _load_tables(settings)
    if t is None:
        return 1
    entries, races = t["entries"], t["races"]
    season = season or int(entries["season"].max())
    feats = build_features(entries, races)
    done = feats[feats["position"].notna()]
    kind, _ = select_kind(done, PRE_QUALI)
    model = fit(done, PRE_QUALI, kind=kind)
    config_path = settings.config_dir / f"season-{season}.json"
    if season not in set(entries["season"]) and config_path.exists():
        config = json.loads(config_path.read_text(encoding="utf-8"))
        state, race_rows = preseason_state(entries, config)
        races = pd.concat([races, race_rows], ignore_index=True)
        team_s, drv_s = swing(PRESEASON_SCALE)
        result = simulate(
            entries,
            races,
            model,
            season,
            n_sims=sims,
            state=state,
            team_form_sigma=team_s,
            driver_form_sigma=drv_s,
        )
        result["preseason"] = True
        result["sources"] = {
            k: config[k] for k in ("calendar_source", "calendar_note", "lineup_source", "lineup_note")
        }
    elif season not in set(entries["season"]):
        print(f"No data or config/season-{season}.json for {season}.")
        return 1
    else:
        result = simulate(entries, races, model, season, n_sims=sims)
    result["model_kind"] = kind
    settings.reports_dir.mkdir(parents=True, exist_ok=True)
    path = settings.reports_dir / f"titles-{season}.json"
    path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    left = result["remaining_rounds"]
    print(
        f"{season} after round {result['after_round']}: {len(left)} races left, "
        f"{result['remaining_sprints']} sprints"
    )
    if result["drivers_clinched_by"]:
        print(f"Drivers' title mathematically decided: {result['drivers_clinched_by']}")
    if result["constructors_clinched_by"]:
        print(f"Constructors' title mathematically decided: {result['constructors_clinched_by']}")
    print("Drivers' championship")
    for r in result["drivers"][:6]:
        print(
            f"  {r['code']:<4} {r['points_now']:>6g} pts  -> {r['expected_points']:>6.1f}  "
            f"title {r['p_title']:>6.1%}"
        )
    print("Constructors' championship")
    for r in result["constructors"][:5]:
        print(
            f"  {r['name']:<16} {r['points_now']:>6g} pts  -> {r['expected_points']:>6.1f}  "
            f"title {r['p_title']:>6.1%}"
        )
    print(f"Saved {path}")
    return 0


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

    model = sub.add_parser("model", help="backtest the model and simulate championships")
    model_sub = model.add_subparsers(dest="model_command", required=True)
    bt = model_sub.add_parser("backtest", help="season-by-season backtest, written to model/reports/")
    bt.add_argument("--seasons", type=parse_seasons, default=None, help="test seasons (default: 2020-2026)")
    sim = model_sub.add_parser("simulate", help="title odds for both championships")
    sim.add_argument("--season", type=int, default=None, help="season to simulate (default: latest)")
    sim.add_argument("--sims", type=int, default=10_000)
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
    if args.command == "model":
        if args.model_command == "backtest":
            return _model_backtest(
                settings, args.seasons or list(range(2020, settings.last_completed_season + 1))
            )
        if args.model_command == "simulate":
            return _model_simulate(settings, args.season, args.sims)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
