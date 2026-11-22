export type PhaseStatus = "done" | "active" | "next";

export interface Phase {
  id: number;
  title: string;
  summary: string;
  window: string;
  status: PhaseStatus;
}

export interface Feature {
  title: string;
  body: string;
}

export const REPO_URL = "https://github.com/CodeWidKrish/PitWall";

export const PHASES: readonly Phase[] = [
  {
    id: 1,
    title: "Setup",
    summary: "Web app, model package and checks on every push.",
    window: "22 Nov",
    status: "done",
  },
  {
    id: 2,
    title: "Data",
    summary: "Every race from 2018 to 2026: results, qualifying, sprints and race-day weather.",
    window: "22 Nov",
    status: "done",
  },
  {
    id: 3,
    title: "Model",
    summary: "Elo and grid baselines, a LightGBM ranker and a 2019–2026 backtest.",
    window: "26–29 Nov",
    status: "next",
  },
  {
    id: 4,
    title: "Website",
    summary: "Design system and every section of the prototype as real components.",
    window: "26–29 Nov",
    status: "next",
  },
  {
    id: 5,
    title: "3D cars",
    summary: "A realistic car, team liveries, the night race and the studio.",
    window: "30 Nov–4 Dec",
    status: "next",
  },
  {
    id: 6,
    title: "Live features",
    summary: "Grid odds, the podium game, head to head and the what-if simulator.",
    window: "5–7 Dec",
    status: "next",
  },
  {
    id: 7,
    title: "Launch",
    summary: "Go live, with automatic updates after every race and the write-up.",
    window: "8–10 Dec",
    status: "next",
  },
];

export const FEATURES: readonly Feature[] = [
  {
    title: "Predictions on the record",
    body: "Every forecast is timestamped before lights out and scored afterwards against two simple baselines.",
  },
  {
    title: "The whole season, up front",
    body: "Win odds for all 24 rounds of 2027, published before round 1 and updated after every weekend.",
  },
  {
    title: "An honest backtest",
    body: "Each season from 2019 to 2026 predicted using only what was known before it started.",
  },
  {
    title: "Break the season",
    body: "Force a retirement or add rain, then re-run 10,000 seasons in your browser.",
  },
  {
    title: "Odds that explain themselves",
    body: "Every number shows which factors moved it, from qualifying pace to reliability.",
  },
  {
    title: "Broadcast-grade 3D",
    body: "A night race with TV camera cuts, live timing, an onboard view and a studio car.",
  },
];
