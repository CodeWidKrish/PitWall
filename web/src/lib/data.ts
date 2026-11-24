/**
 * Typed access to the data the model exports (`pitwall site export`).
 * Everything on the site comes from `src/data/site.json`: real results from the
 * Jolpica F1 API, the model's odds, and its walk-forward backtest.
 */
import credits from "@/data/photo-credits.json";
import raw from "@/data/site.json";

export interface Driver {
  id: string;
  code: string;
  name: string;
  first_name: string;
  last_name: string;
  number: number | null;
  nationality: string | null;
  date_of_birth: string | null;
  team_now: string | null;
  team_next: string | null;
  seat_status: "confirmed" | "expected" | "assumed" | null;
  photo: string | null;
  career_since_2018: { starts: number; wins: number; podiums: number };
}

export interface DriverStanding {
  driver_id: string;
  position: number;
  points: number;
  wins: number;
  podiums: number;
  poles: number;
  starts: number;
  dnfs: number;
  avg_finish: number | null;
  avg_quali: number | null;
  best_finish: number | null;
  team: string | null;
}

export interface TeamStanding {
  constructor_id: string;
  position: number;
  points: number;
  wins: number;
}

export interface Call {
  favourite: string;
  p_favourite: number;
  p_winner: number | null;
  hit: boolean;
  winner_in_top3: boolean;
}

export interface RaceCall {
  round: number;
  race_name: string;
  circuit_id: string;
  country: string;
  date: string;
  has_sprint: boolean;
  winner: string | null;
  pole: string | null;
  pre: Call;
  post: Call;
}

export interface InputDef {
  key: string;
  label: string;
  higher_is_better: boolean;
}

export interface Odds {
  driver_id: string;
  team: string;
  p_win: number;
  p_podium: number;
  /** Win chance before qualifying; equal to p_win until the grid is set. */
  p_win_pre?: number;
  quali_position?: number | null;
  inputs: Record<string, number | null>;
}

export interface TeamOdds {
  team: string;
  p_win: number;
  p_podium: number;
  p_one_two: number;
}

export interface SprintBlock {
  odds: { driver_id: string; team: string; p_win: number; p_podium: number }[];
  constructors: TeamOdds[];
  calibration: {
    temperature: number;
    sprints: number;
    seasons?: number[];
    favourite_won?: number;
    winner_in_top3?: number;
    brier?: number;
  };
  result: { winner: string; podium: string[] } | null;
}

export interface NextRace {
  season: number;
  round: number;
  race_name: string;
  circuit_id: string;
  circuit_name: string;
  locality: string;
  country: string;
  start_utc: string | null;
  has_sprint: boolean;
  model_kind: string;
  /** "pre_quali" from the Monday after the last race; "post_quali" once the grid is set. */
  stage?: "pre_quali" | "post_quali";
  pole?: string | null;
  constructors?: TeamOdds[];
  sprint?: SprintBlock | null;
  /** Open-Meteo forecast for the hour of the start; context only, not a model input. */
  weather?: {
    at: string;
    temperature_c: number | null;
    rain_chance: number | null;
    rain_mm: number | null;
    wind_kmh: number | null;
    cloud_cover: number | null;
    fetched_at: string;
  } | null;
  last_winner: { driver_id: string; season: number } | null;
  inputs: InputDef[];
  field: Record<string, { min: number | null; max: number | null; mean: number | null }>;
  odds: Odds[];
}

export interface TitleRow {
  p_title: number;
  expected_points: number;
  points_now: number;
}

export interface Scores {
  races: number;
  winner_hit: number;
  winner_in_top3: number;
  podium_overlap: number;
  brier: number;
  log_loss: number;
  winner_prob: number;
  favourite_prob: number;
}

export interface ModeRecord {
  baseline: string;
  model: Scores;
  baseline_scores: Scores;
  per_season: { season: number; model: Scores; baseline: Scores }[];
  confidence: { band: string; races: number; favourite_prob: number; favourite_won: number; winner_in_top3: number }[];
  classification: {
    precision: number;
    recall: number;
    roc_auc: number;
    accuracy: number;
  } | null;
}

export interface Site {
  built_at: string;
  data_through: { season: number; round: number; race_name: string };
  drivers: Record<string, Driver>;
  teams: Record<string, { id: string; name: string }>;
  season: {
    season: number;
    after_round: number;
    rounds: number;
    drivers: DriverStanding[];
    constructors: TeamStanding[];
    clinched?: { drivers: string | null; constructors: string | null; after_round: number };
    progress: {
      rounds: number[];
      drivers: Record<string, number[]>;
      constructors: Record<string, number[]>;
    };
  };
  races: RaceCall[];
  next_race: NextRace | null;
  forecast: {
    season: number;
    simulations: number;
    drivers: (TitleRow & { driver_id: string; code: string; name: string; team: string; seat_status: string })[];
    constructors: (TitleRow & { constructor_id: string; name: string })[];
    calendar: { round: number; race_name: string; circuit_id: string; country: string; has_sprint: boolean }[];
    sources: Record<string, string>;
  } | null;
  record: {
    built_at: string;
    test_seasons: number[];
    modes: { pre_quali: ModeRecord; post_quali: ModeRecord };
  } | null;
}

export interface PhotoCredit {
  file: string;
  author: string;
  licence: string;
  licence_url: string | null;
  source: string;
  width: number;
  height: number;
}

export const site = raw as unknown as Site;
export const photoCredits = credits as unknown as Record<string, PhotoCredit>;

/* ------------------------------------------------------------------ teams */

/** Team colours, approximate, used only as identifying accents (no logos). */
const TEAM_STYLE: Record<string, { name: string; short: string; colour: string }> = {
  mercedes: { name: "Mercedes", short: "MER", colour: "#27F4D2" },
  ferrari: { name: "Ferrari", short: "FER", colour: "#E8002D" },
  mclaren: { name: "McLaren", short: "MCL", colour: "#FF8000" },
  red_bull: { name: "Red Bull", short: "RBR", colour: "#3671C6" },
  aston_martin: { name: "Aston Martin", short: "AMR", colour: "#229971" },
  alpine: { name: "Alpine", short: "ALP", colour: "#0093CC" },
  williams: { name: "Williams", short: "WIL", colour: "#64C4FF" },
  rb: { name: "Racing Bulls", short: "RCB", colour: "#6692FF" },
  audi: { name: "Audi", short: "AUD", colour: "#F2430C" },
  haas: { name: "Haas", short: "HAA", colour: "#B6BABD" },
  cadillac: { name: "Cadillac", short: "CAD", colour: "#C9B37E" },
};

export function team(id: string | null | undefined) {
  if (!id) return { id: "", name: "—", short: "—", colour: "#8A9099" };
  const style = TEAM_STYLE[id];
  return {
    id,
    name: style?.name ?? site.teams[id]?.name ?? id,
    short: style?.short ?? id.slice(0, 3).toUpperCase(),
    colour: style?.colour ?? "#8A9099",
  };
}

/** Black or white, whichever reads better on a team colour (WCAG contrast). */
export function inkOn(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  const onBlack = (L + 0.05) / 0.05;
  const onWhite = 1.05 / (L + 0.05);
  return onBlack >= onWhite ? "#0b0c0e" : "#ffffff";
}

/* ---------------------------------------------------------------- drivers */

export function driver(id: string | null | undefined): Driver {
  const d = id ? site.drivers[id] : undefined;
  if (d) return d;
  return {
    id: id ?? "",
    code: (id ?? "—").slice(0, 3).toUpperCase(),
    name: id ?? "—",
    first_name: "",
    last_name: id ?? "—",
    number: null,
    nationality: null,
    date_of_birth: null,
    team_now: null,
    team_next: null,
    seat_status: null,
    photo: null,
    career_since_2018: { starts: 0, wins: 0, podiums: 0 },
  };
}

export function photoSrc(d: Driver): string | null {
  return d.photo ? `/drivers/${d.photo}` : null;
}

/** The current grid, ordered by next-race win odds (or standings if there is no next race). */
export function currentGrid(): Driver[] {
  if (site.next_race) return site.next_race.odds.map((o) => driver(o.driver_id));
  return site.season.drivers.map((s) => driver(s.driver_id)).filter((d) => d.team_now);
}

/* ------------------------------------------------------------- formatting */

export function pct(p: number, digits = 1): string {
  if (p > 0 && p < 0.001) return "<0.1%";
  return `${(p * 100).toFixed(digits)}%`;
}

export function shortRaceName(name: string): string {
  return name.replace(/ Grand Prix.*$/, "").replace(/^Grand Prix of /, "");
}

export const DEFAULT_FOLLOW = site.next_race?.odds[0]?.driver_id ?? site.season.drivers[0]?.driver_id ?? "";
