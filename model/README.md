# PitWall model

The Python side of PitWall: data pipeline, features, training, backtest and season simulation. It writes JSON files to `web/public/data/`, which the website reads.

## Setup

Requires [uv](https://docs.astral.sh/uv/). It installs Python 3.12 automatically.

```bash
cd model
uv sync
uv run pitwall info
```

## Checks

```bash
uv run ruff check .
uv run mypy
uv run pytest
```

## Dependencies and why

| Package | Why |
|---|---|
| fastf1 | Session timing, lap data, weather and results for 2018 onwards |
| pandas, numpy | Tables and numeric work for features |
| scikit-learn | Calibration, metrics and baseline models |
| lightgbm | The main ranking model for race finishing order |
| requests | Jolpica (Ergast-compatible) API for historical results |
| pytest, ruff, mypy | Tests, linting and strict type checking (development only) |

The FastF1 cache can grow to several GB. It is stored in `~/.cache/pitwall/fastf1` by default. Set `PITWALL_CACHE_DIR` to change it.
