# PitWall: case study

**Building an F1 forecaster that publishes its odds before every race and keeps score in public.**

Live site: [pitwallgp.vercel.app](https://pitwallgp.vercel.app) · Code: this repository

## The problem

F1 predictions online are mostly opinions, betting odds, or models that are only ever shown when they were right. I wanted a forecaster that commits to a probability for every driver before each race, then shows its whole record, misses included, against simple baselines. And it had to be something people actually enjoy using, not a notebook.

## Data

- Every race, qualifying session and sprint since 2018 from the Jolpica F1 API (the successor to Ergast), with disk caching, retries and rate limiting.
- Race-day weather for each circuit from Open-Meteo, for the race window and the hours before it.
- **Trust before modelling.** Championship points are rebuilt from the results and checked against the official standings after every round. All 289 standings rows from 2018 to 2026 match. The one known exception, Racing Point's 15-point penalty in 2020, is written down as a documented adjustment, and any unexplained difference fails the build.
- I first used FastF1, but its current version needs an F1 account login, which cannot run in a public pipeline. So the data layer moved to Jolpica and Open-Meteo instead.

## Model

**Features** describe what was known before each race and nothing after it: an Elo rating built from every head-to-head finish, recent finishing positions and points, grid and qualifying gaps (to pole and to the teammate), retirement rates, team form and circuit history. A test changes one race's results and checks that features for that race do not move.

**Ranking models.** A race is an ordering, so the core is a Plackett-Luce model fitted by maximum likelihood. After qualifying it is blended with a LightGBM LambdaRank model. Both output a strength per driver; a softmax with a temperature fitted on held-out seasons turns strengths into calibrated win probabilities, and exact Plackett-Luce maths gives podium chances.

**No peeking.** Which model to use is chosen walk-forward: for each test season, from the two seasons before it only.

**Championships.** The remaining races and sprints are simulated 10,000 times with Gumbel-max sampling. Retirements are drawn from team and driver reliability. A season-long form swing for every team and driver is tuned on title forecasts from five points of every past season. That tuning picked "no swing" before the season, but on only six forecasts and while giving an eventual champion 0%, so I overruled it and documented why.

## Results

151 races, 2020 to 2026, each season predicted by a model that had only seen earlier seasons:

| | Winner | Winner in top 3 | Brier |
|---|---|---|---|
| After qualifying | 58.3% | 89.4% | 0.586 |
| Grid-slot baseline | 57.0% | 85.4% | 0.646 |
| Before qualifying | 47.7% | 78.8% | 0.693 |
| Elo baseline | 47.0% | 68.9% | 0.741 |

The hit rate beats the baselines only slightly, which is honest for a sport with this much luck. The bigger gain is in the Brier score, which measures whether the probabilities themselves are right. In 2026 the model, trained on 2018 to 2025 only, called 14 of the first 21 winners after qualifying.

## The website

The goal was a site that feels like race day, not a dashboard.

- **A physics race on the homepage.** A quasi-steady-state lap model gives every corner its limit speed from tyre grip plus downforce, and the straights come from power against drag. Forward and backward passes give the speed envelope, as in real lap-time simulation. Cars race on it with a racing line (outside, apex, outside), dirty air that costs grip when following, tow and DRS at realistic strength, side-by-side overtakes, start reactions, tyre wear and the odd lock-up. The race logic is pure TypeScript, so it is tested headlessly: whole races are run in Node to check that the field spreads out and that cars never overlap.
- **A realistic car.** A detailed CC-BY model was cleaned with a custom pipeline. Every sponsor and team logo, the race number and the tyre lettering were removed; the paint texture became a livery mask so any team's colours can be applied in a shader; and the mesh was simplified and Meshopt-compressed to 2.2 MB, served from Vercel Blob. The studio adds driver helmets, wheel bands found automatically from the tyre meshes, lighting presets and part hotspots.
- **Real sound.** I tried synthesised and pitch-shifted engine sound; both sounded fake. The site now plays only real, freely licensed recordings: a trackside bed from the 2021 Turkish GP, close-up launches from Goodwood, and the 2021 Sochi grid for lights out.
- **Interactive tools.** A podium game uses exact-order Plackett-Luce probabilities, and a what-if simulator re-runs the championship model in a web worker (10,000 seasons in about a second) from inputs the Python pipeline exports.
- **Performance.** Data is split so heavy parts load on demand; the 3D starts when the browser is idle and compiles shaders in the background; and the car model's host is preconnected.

## Decisions I would defend in a review

- **Honest numbers over impressive ones.** Winner accuracy around 50 to 60% is the realistic ceiling, so the site leads with calibration and baselines, not a headline accuracy figure.
- **Licensing first.** Official F1 highlights refuse to play on other sites (YouTube error 150), so they open on YouTube. Every photo, clip and sound on the site is freely licensed and credited.
- **Automation.** A GitHub Actions workflow checks for new results daily. After a race it re-simulates, rebuilds the site's data and commits it, which redeploys the site. When a season ends, the next race rolls over to round 1 of the next season.

## Stack

Python 3.12 (pandas, NumPy, SciPy, scikit-learn, LightGBM, uv, ruff, mypy strict, pytest) · Next.js 16, React 19, TypeScript, Tailwind 4, three.js, Web Audio, Web Workers · GitHub Actions · Vercel and Vercel Blob.
