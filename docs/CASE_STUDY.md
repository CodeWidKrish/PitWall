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

- **A physics race on the homepage.** A quasi-steady-state lap model gives every corner its limit speed from tyre grip plus downforce, and the straights come from power against drag. Forward and backward passes give the speed envelope, as in real lap-time simulation. Cars race on it with a racing line (outside, apex, outside), dirty air that costs grip when following, tow and DRS at realistic strength, side-by-side overtakes, start reactions, tyre wear and the odd lock-up. The race logic is pure TypeScript, so it is tested headlessly: whole races are run in Node to check that the field spreads out, that cars face where they are going, and that they almost never touch (3 frames in 108,000 across six 5-minute races).
- **A realistic car.** A detailed CC-BY model was cleaned with a custom pipeline. Every sponsor and team logo, the race number and the tyre lettering were removed; the paint texture became a livery mask so any team's colours can be applied in a shader; and the mesh was simplified and Meshopt-compressed to 2.2 MB, served from Vercel Blob. The studio adds driver helmets, wheel bands found automatically from the tyre meshes, lighting presets and part hotspots.
- **Real sound.** I tried synthesised and pitch-shifted engine sound; both sounded fake. The site now plays only real, freely licensed recordings: a trackside bed from the 2021 Turkish GP, close-up launches from Goodwood, and the 2021 Sochi grid for lights out.
- **Interactive tools.** A podium game uses exact-order Plackett-Luce probabilities, and a what-if simulator re-runs the championship model in a web worker (10,000 seasons in about a second) from inputs the Python pipeline exports.
- **Race weekend.** After qualifying the odds are re-run with the grid and each driver's move is shown; sprint weekends get sprint odds with their own scale, fitted on 30 past sprints; constructor odds come from 20,000 sampled finishing orders; and a race-day weather forecast sits next to the odds as context.
- **A live record nobody can rewrite.** Every forecast is written to a ledger in the repository before lights out and scored after the race; its git history is the proof. The site shows a live reliability chart and a plain explanation of each call.
- **Ask the pit wall.** A chat on Groq's `gpt-oss-120b` that can only answer through read-only tools over the site's own data: odds, a driver's inputs ranked against the field, standings, the record and the what-if simulator. It shows the data it used, refuses betting advice and says when it doesn't know.
- **Sharing.** Every driver has a page with a generated preview card; podium calls unfurl into a picture; the homepage has its own card.
- **Performance.** Scrolling was stuck at 8 fps because a motion loop changed a style on the root and read the page height every frame; fixing that, plus native scrolling on touch screens, took it to about 55 fps on a laptop and about 50 on a throttled phone. On phones the detailed 3D car downloads only after the page has loaded, and never on slow connections.
- **Quality.** CI runs lint, types, the build, 60 model tests and 33 Playwright end-to-end tests on a laptop and a phone on every push. An hourly workflow checks the site is up and that no race has gone unscored.

## Decisions I would defend in a review

- **Honest numbers over impressive ones.** Winner accuracy around 50 to 60% is the realistic ceiling, so the site leads with calibration and baselines, not a headline accuracy figure.
- **Licensing first.** Official F1 highlights refuse to play on other sites (YouTube error 150), so they open on YouTube. Every photo, clip and sound on the site is freely licensed and credited.
- **Automation.** A GitHub Actions workflow checks for new results daily. After a race it re-simulates, rebuilds the site's data and commits it, which redeploys the site. When a season ends, the next race rolls over to round 1 of the next season.

## Stack

Python 3.12 (pandas, NumPy, SciPy, scikit-learn, LightGBM, uv, ruff, mypy strict, pytest) · Next.js 16, React 19, TypeScript, Tailwind 4, three.js, Web Audio, Web Workers · GitHub Actions · Vercel and Vercel Blob.
