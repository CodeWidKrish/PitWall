# PitWall model

The Python side of PitWall: data pipeline, features, training, backtest and season simulation. It writes JSON files to `web/public/data/`, which the website reads.

## Setup

Requires [uv](https://docs.astral.sh/uv/). It installs Python 3.12 automatically.

```bash
cd model
uv sync
uv run pitwall info
```

## Data

```bash
uv run pitwall data build                    # all seasons 2018-2026, with weather
uv run pitwall data build --seasons 2024     # one season
uv run pitwall data build --no-weather       # skip the weather download
uv run pitwall data check                    # what was built, plus the data checks
```

Sources: the [Jolpica F1 API](https://github.com/jolpica/jolpica-f1) (Ergast-compatible) for the calendar, results, qualifying and sprints, and the [Open-Meteo historical archive](https://open-meteo.com/en/docs/historical-weather-api) for weather at each circuit during the race window (start hour plus two). Both are free and need no account. API responses are cached on disk, requests are spaced to respect Jolpica's limits, and failures are retried with backoff. Completed seasons are cached for good; the current season refreshes every 6 hours.

Tables are written as Parquet to `model/data/processed/`, which git ignores:

| Table | One row per | Highlights |
|---|---|---|
| `races` | Grand Prix on the calendar | circuit, country, coordinates, sprint weekend flag |
| `results` | driver per race | grid, finish, status, finished / DNF / DSQ, points, fastest lap |
| `qualifying` | driver per qualifying | Q1-Q3 times, session-aware gap to pole and to teammate |
| `sprints` | driver per sprint | sprint finish and points |
| `weather` | race | air temperature, humidity, wind, rain in mm, share of rainy hours, wet race flag |
| `entries` | driver per race | everything above joined, plus teammate and the targets (won, podium, points, DNF) |

`manifest.json` records counts, coverage and the result of every data check: unique keys, consecutive rounds, exactly one winner per race, no repeated positions, plausible grids, and qualifying, sprint and weather coverage. The grid is 20 cars until 2025 and 22 from 2026.

**Qualifying gaps are session-aware.** Grip improves from Q1 to Q3, so a Q1 lap can be quicker than the pole time. Gaps are only measured within one session: the deepest session the driver reached, and the deepest session both teammates reached.

## Checks

```bash
uv run ruff check .
uv run mypy
uv run pytest
```

## Dependencies and why

| Package | Why |
|---|---|
| pandas, numpy | Tables and numeric work for features |
| scikit-learn | Calibration, metrics and baseline models |
| lightgbm | The main ranking model for race finishing order |
| requests | Jolpica (Ergast-compatible) and Open-Meteo APIs |
| pyarrow | Parquet storage for the built tables (fast, typed, compact) |
| pytest, ruff, mypy | Tests, linting and strict type checking (development only) |

API caches live in `~/.cache/pitwall/` (outside OneDrive). Set `PITWALL_CACHE_DIR` to change it.

**Why not FastF1?** Since version 3.9, FastF1's live-timing archive asks for an F1 account login. A public pipeline that runs in CI can't depend on a personal login, so PitWall uses Open-Meteo for weather. The trade-off: grid-cell weather (about 10-25 km) instead of trackside sensors, and no track-surface temperature.
