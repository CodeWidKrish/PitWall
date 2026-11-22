# PitWall

**Who wins the next Grand Prix, and who takes the title?**

PitWall is an AI/ML Formula 1 forecaster. It predicts win odds for every driver at every race of the 2027 season, simulates both championships (drivers and constructors) 10,000 times, publishes each forecast before the race and scores itself in public afterwards.

> Status: in development. Phases 1-4 (setup, data, model, website base) are done: the site runs on real 2026 results, the model's odds and its walk-forward backtest ([`model/reports/BACKTEST.md`](model/reports/BACKTEST.md)). The original design prototype is in [`prototype/`](prototype/).

![PitWall prototype hero](prototype/screen-hero-v3.png)

## What makes it different

- **Predictions on the record.** Every forecast is timestamped before lights out and scored afterwards with a Brier score, next to two simple baselines: back the favourite, and pole sitter wins.
- **The whole season, up front.** The 2027 forecast is published before round 1, then updated after every weekend.
- **An honest backtest.** Seasons 2019–2026 are each predicted using only the data available before that season.
- **What-if simulator.** Force a retirement, add rain or drop sprint points, then re-run 10,000 seasons in the browser.
- **Explained odds.** Each prediction shows which factors moved it.
- **A broadcast-grade interface.** A 3D night race with TV-style camera cuts, live timing, an onboard dashboard and a studio car showcase.

## How it works

| Layer | Tools |
|---|---|
| Data | Jolpica API (results, qualifying, sprints) and the Open-Meteo archive (race-day weather), 2018–2026 |
| Model | Plackett-Luce regression and a LightGBM ranker, calibrated on held-out seasons; Monte Carlo simulation of both championships |
| Evaluation | Rolling backtest, Brier score, calibration, winner hit rate |
| Pipeline | GitHub Actions runs after each race weekend and publishes JSON |
| Web | Next.js, TypeScript, Tailwind, Three.js (React Three Fiber), GSAP, Lenis |

## Credits

- Results: [Jolpica F1 API](https://github.com/jolpica/jolpica-f1). Weather: [Open-Meteo](https://open-meteo.com/).
- Driver photos: Wikimedia Commons, each under its own free licence (CC BY, CC BY-SA, CC0 or UK OGL); authors and licences are listed on the site's `/credits` page and in [`web/src/data/photo-credits.json`](web/src/data/photo-credits.json).
- Race highlights: by FORMULA 1, embedded from YouTube. PitWall does not host any footage.
- Not affiliated with Formula 1, the FIA or any team. No team or F1 logos are used.

## Project structure

```
web/         Next.js website (TypeScript, Tailwind)
model/       Python 3.12 model: data, features, training, backtest, simulation
prototype/   Interactive design prototype (sample data)
.github/     CI: lint, type checks, build and tests on every push
```

## Run it

```bash
# website
cd web && npm install && npm run dev

# model (needs uv: https://docs.astral.sh/uv/)
cd model && uv sync && uv run pitwall info
```

## Notes

- The prototype uses invented drivers, teams and numbers for design purposes only.
- PitWall is an independent project. It is not affiliated with Formula 1, the FIA or any team, and it does not use their logos.
- PitWall is for analysis and fun, not betting.

## License

Code is released under the [MIT License](LICENSE). Licensed third-party 3D assets are not part of this repository.
