/** Podium calls: their chance under the model, and the shareable form of a call. */
import { site } from "@/lib/data";

/** Chance of an exact podium order under the model (Plackett-Luce on win odds). */
export function podiumChance(odds: Map<string, number>, picks: string[]) {
  let rest = [...odds.values()].reduce((a, b) => a + b, 0);
  let p = 1;
  for (const id of picks) {
    const w = odds.get(id) ?? 0;
    p *= w / rest;
    rest -= w;
  }
  return p;
}

export function oneIn(p: number) {
  if (p <= 0) return "—";
  const n = 1 / p;
  return n < 10 ? n.toFixed(1) : Math.round(n).toLocaleString("en-GB");
}

/** A shared call for the current next race, validated: three different drivers on the grid. */
export function parseCall(p: string | null | undefined, r: string | null | undefined) {
  const race = site.next_race;
  if (!race || !p) return null;
  const picks = p.split(",").slice(0, 3);
  const ids = new Set(race.odds.map((o) => o.driver_id));
  if (picks.length !== 3 || new Set(picks).size !== 3 || !picks.every((x) => ids.has(x))) return null;
  // A link made for an earlier race still opens, against today's race.
  const forThisRace = r === `${race.season}-${race.round}`;
  const odds = new Map(race.odds.map((o) => [o.driver_id, o.p_win]));
  const model = race.odds.slice(0, 3).map((o) => o.driver_id);
  return { race, picks, forThisRace, p: podiumChance(odds, picks), modelP: podiumChance(odds, model), model };
}

export const callUrl = (picks: string[]) => {
  const race = site.next_race;
  return `/call?r=${race?.season}-${race?.round}&p=${picks.join(",")}`;
};

/** Score a call against a real podium: 1 point per driver on it, 1 more for the right step. */
export function scorePodium(call: string[], podium: string[]) {
  return call.reduce((s, id, i) => s + (podium.includes(id) ? 1 : 0) + (podium[i] === id ? 1 : 0), 0);
}
