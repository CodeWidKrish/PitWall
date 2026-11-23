/**
 * The live record: every forecast the site published before a race (from
 * `src/data/ledger.json`, written by `pitwall site export`), scored against the result.
 * Unlike the backtest, nothing here was ever fitted after the fact.
 */
import raw from "@/data/ledger.json";

export interface LedgerOdds {
  driver_id: string;
  p_win: number;
  p_podium: number;
}

export interface LedgerCall {
  season: number;
  round: number;
  race_name: string;
  start_utc: string | null;
  pre?: { published_at: string; odds: LedgerOdds[] };
  post?: { published_at: string; odds: LedgerOdds[] };
  result: { winner: string; podium: string[] } | null;
}

export interface Ledger {
  since: string | null;
  calls: LedgerCall[];
}

export const ledger = raw as unknown as Ledger;

/** The last forecast published before lights out: after qualifying if there was one. */
export function finalCall(c: LedgerCall) {
  const pub = c.post ?? c.pre;
  if (!pub) return null;
  const odds = [...pub.odds].sort((a, b) => b.p_win - a.p_win);
  return { stage: c.post ? ("post_quali" as const) : ("pre_quali" as const), published_at: pub.published_at, odds };
}

export interface ScoredCall {
  call: LedgerCall;
  stage: "pre_quali" | "post_quali";
  published_at: string;
  favourite: LedgerOdds;
  /** Chance the forecast gave the driver who actually won. */
  p_winner: number | null;
  hit: boolean;
  inTop3: boolean;
  brier: number;
}

export function score(c: LedgerCall): ScoredCall | null {
  const f = finalCall(c);
  if (!f || !c.result) return null;
  const winner = c.result.winner;
  const top3 = f.odds.slice(0, 3).map((o) => o.driver_id);
  const p_winner = f.odds.find((o) => o.driver_id === winner)?.p_win ?? null;
  const brier = f.odds.reduce((s, o) => s + (o.p_win - (o.driver_id === winner ? 1 : 0)) ** 2, 0);
  return {
    call: c,
    stage: f.stage,
    published_at: f.published_at,
    favourite: f.odds[0],
    p_winner,
    hit: f.odds[0]?.driver_id === winner,
    inTop3: top3.includes(winner),
    brier,
  };
}

export interface Bin {
  lo: number;
  hi: number;
  n: number;
  predicted: number;
  actual: number;
}

const EDGES = [0, 0.05, 0.15, 0.3, 0.5, 1.0001];

/** Reliability bins: every driver in every scored race, by the win chance they were given. */
export function reliability(scored: ScoredCall[]): Bin[] {
  const bins = EDGES.slice(0, -1).map((lo, i) => ({ lo, hi: EDGES[i + 1], n: 0, p: 0, won: 0 }));
  for (const s of scored) {
    const f = finalCall(s.call);
    if (!f) continue;
    for (const o of f.odds) {
      const b = bins.find((x) => o.p_win >= x.lo && o.p_win < x.hi);
      if (!b) continue;
      b.n++;
      b.p += o.p_win;
      if (o.driver_id === s.call.result?.winner) b.won++;
    }
  }
  return bins.map((b) => ({ lo: b.lo, hi: Math.min(1, b.hi), n: b.n, predicted: b.n ? b.p / b.n : 0, actual: b.n ? b.won / b.n : 0 }));
}

export function summary() {
  const scored = ledger.calls.map(score).filter((s): s is ScoredCall => s !== null);
  const pending = ledger.calls.filter((c) => !c.result && (c.pre || c.post));
  const n = scored.length;
  const mean = (f: (s: ScoredCall) => number) => (n ? scored.reduce((a, s) => a + f(s), 0) / n : null);
  return {
    since: ledger.since,
    scored,
    pending,
    races: n,
    hitRate: mean((s) => (s.hit ? 1 : 0)),
    top3Rate: mean((s) => (s.inTop3 ? 1 : 0)),
    brier: mean((s) => s.brier),
    winnerChance: mean((s) => s.p_winner ?? 0),
    bins: reliability(scored),
  };
}
