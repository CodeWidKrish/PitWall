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
| `standings` | driver or team per season | official championship points, wins and position at the last completed round |

`manifest.json` records counts, coverage and the result of every data check: unique keys, consecutive rounds, exactly one winner per race, no repeated positions, plausible grids, and qualifying, sprint and weather coverage. The grid is 20 cars until 2025 and 22 from 2026.

**Points reconciliation.** Every season, each driver's and each team's race + sprint points and wins are summed from `results` and `sprints` and compared with the official standings at the same round. Any difference fails the build unless it's a documented, verified adjustment in `KNOWN_ADJUSTMENTS` (for example, Racing Point's 15-point constructors' deduction in 2020). On the 2018-2026 data, all 289 standings rows match, with that one explained adjustment, including the half points from the 2021 Belgian GP.

**Qualifying gaps are session-aware.** Grip improves from Q1 to Q3, so a Q1 lap can be quicker than the pole time. Gaps are only measured within one session: the deepest session the driver reached, and the deepest session both teammates reached.

## Model

```bash
uv run pitwall model backtest              # 2020-2026, writes model/reports/BACKTEST.md
uv run pitwall model simulate --season 2026  # title odds for both championships
```

**Features** (`features.py`) describe each driver and team going into a race, using only earlier races: Elo rating, recent finishes, points, wins, podiums, retirements, qualifying pace and gap to teammate, record at the circuit, team form, and championship position. After qualifying, the grid and that weekend's qualifying gaps are added. A test proves that changing a race's result can't move that race's own features.

**Race model** (`model.py`, `plackett_luce.py`):
- *Plackett-Luce regression*: a linear model of the whole finishing order (top six places), fitted by maximum likelihood with an L2 penalty.
- *LightGBM LambdaRank*: a gradient-boosted ranker.
- Both are recalibrated with a softmax temperature fitted on out-of-sample scores from the last three training seasons.
- Before qualifying PitWall uses Plackett-Luce; after qualifying, a 50/50 blend of the two.

**Backtest** (`backtest.py`): each season from 2020 is predicted by a model trained only on earlier seasons, against two baselines: the Elo favourite (before qualifying) and win rate by grid slot (after qualifying).

| 2020-2026, 151 races | Top pick wins | Winner in top 3 | Brier | Log loss |
|---|---|---|---|---|
| Before qualifying: PitWall | **49.7%** | **80.8%** | **0.687** | **1.539** |
| Before qualifying: Elo baseline | 47.0% | 68.9% | 0.741 | 1.871 |
| After qualifying: PitWall | **58.3%** | **90.7%** | **0.580** | **1.234** |
| After qualifying: grid baseline | 57.0% | 85.4% | 0.646 | 1.574 |

The full report, with per-season numbers, calibration tables and feature importance, is in [`reports/BACKTEST.md`](reports/BACKTEST.md). The model kind per mode was chosen on this backtest, which flatters it slightly; the live 2027 scorecard is the clean test.

**Championships** (`simulate.py`): the remaining races and sprints are played 10,000 times. Each simulation draws retirements from team and driver reliability, finishing orders from the Plackett-Luce strengths, and a season-long form swing per team and driver, so upgrades and slumps are possible. It covers both titles, drivers' and constructors', and detects when a title is mathematically decided. Simulated from two-thirds distance in 2020-2025, the favourite went on to win 5 of 6 drivers' and 5 of 6 constructors' titles.

**Honest limits:** F1 has a lot of luck (safety cars, crashes, strategy), so no model picks winners 90% of the time. About 50-60% is the realistic ceiling. What PitWall aims for instead is calibration: when it says 30%, that should happen about 30% of the time.

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
| lightgbm | Gradient-boosted ranker, blended with the Plackett-Luce model |
| scipy | Optimiser for the Plackett-Luce regression (installed with scikit-learn) |
| requests | Jolpica (Ergast-compatible) and Open-Meteo APIs |
| pyarrow | Parquet storage for the built tables (fast, typed, compact) |
| pytest, ruff, mypy | Tests, linting and strict type checking (development only) |

API caches live in `~/.cache/pitwall/` (outside OneDrive). Set `PITWALL_CACHE_DIR` to change it.

**Why not FastF1?** Since version 3.9, FastF1's live-timing archive asks for an F1 account login. A public pipeline that runs in CI can't depend on a personal login, so PitWall uses Open-Meteo for weather. The trade-off: grid-cell weather (about 10-25 km) instead of trackside sensors, and no track-surface temperature.
