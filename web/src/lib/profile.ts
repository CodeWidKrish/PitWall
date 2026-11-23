/** Everything a driver page shows, derived from the exported site data. */
import { driver, type Odds, site, team } from "@/lib/data";

/** Drivers with a page: this season's grid plus next season's line-up. */
export function profileIds(): string[] {
  return Object.values(site.drivers)
    .filter((d) => d.team_now || d.team_next)
    .map((d) => d.id);
}

export function profile(id: string) {
  const d = site.drivers[id];
  if (!d) return null;
  const t = team(d.team_now ?? d.team_next);
  const race = site.next_race;
  const odds: Odds | undefined = race?.odds.find((o) => o.driver_id === id);
  const oddsRank = odds && race ? race.odds.indexOf(odds) + 1 : null;
  const standing = site.season.drivers.find((s) => s.driver_id === id) ?? null;

  // Points each round, from the cumulative totals.
  const rounds = site.season.progress.rounds;
  const cum = site.season.progress.drivers[id] ?? [];
  const perRound = cum.map((v, i) => Math.round((v - (i ? cum[i - 1] : 0)) * 10) / 10);

  // The teammate this season, by the same team.
  const mateId =
    d.team_now &&
    site.season.drivers.find((s) => s.driver_id !== id && site.drivers[s.driver_id]?.team_now === d.team_now)?.driver_id;
  const mate = mateId ? site.season.drivers.find((s) => s.driver_id === mateId) ?? null : null;

  // What the model said about this driver, race by race.
  const calls = site.races;
  const favPost = calls.filter((c) => c.post.favourite === id);
  const wins = calls.filter((c) => c.winner === id);
  const calledWins = wins.filter((c) => c.post.favourite === id).length;
  const winChances = wins.map((c) => c.post.p_winner).filter((x): x is number => x !== null);

  const title = site.forecast?.drivers.find((x) => x.driver_id === id) ?? null;
  const titleRank = title && site.forecast ? site.forecast.drivers.indexOf(title) + 1 : null;

  return {
    d,
    t,
    race,
    odds,
    oddsRank,
    standing,
    rounds,
    perRound,
    mate: mate ? { d: driver(mate.driver_id), s: mate } : null,
    model: {
      favourite: favPost.length,
      favouriteHits: favPost.filter((c) => c.post.hit).length,
      wins: wins.length,
      calledWins,
      avgChanceWhenWon: winChances.length ? winChances.reduce((a, b) => a + b, 0) / winChances.length : null,
    },
    title,
    titleRank,
  };
}

export type Profile = NonNullable<ReturnType<typeof profile>>;

/** Where a value sits in the field, 0 (worst) to 1 (best), with its rank. */
export function inField(race: NonNullable<typeof site.next_race>, id: string, key: string, hib: boolean) {
  const vals = race.odds.map((o) => o.inputs[key]).filter((v): v is number => v !== null);
  const mine = race.odds.find((o) => o.driver_id === id)?.inputs[key] ?? null;
  if (mine === null || !vals.length) return { value: null, share: null, rank: null, of: vals.length };
  const min = Math.min(...vals),
    max = Math.max(...vals);
  const x = max === min ? 1 : (mine - min) / (max - min);
  const rank = vals.filter((v) => (hib ? v > mine : v < mine)).length + 1;
  return { value: mine, share: hib ? x : 1 - x, rank, of: vals.length };
}
