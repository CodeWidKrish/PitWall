/**
 * Next season's title simulation, in the browser. A port of `pitwall model simulate`:
 * each simulated season draws a form swing for every team and driver, then every race
 * (and sprint) is a Plackett-Luce draw from the model's strengths with random
 * retirements. The what-if options bend those inputs.
 */
export interface SimRound {
  round: number;
  sprint: boolean;
  log_w: number[];
  p_dnf: number[];
}

export interface SimInputs {
  season: number;
  drivers: string[];
  teams: string[]; // team of each driver, same order
  rounds: SimRound[];
  team_sigma: number;
  driver_sigma: number;
  sprint_dnf_factor: number;
  race_points: number[];
  sprint_points: number[];
}

export interface WhatIf {
  /** Extra car pace for one team, in model units (log-strength). */
  pace?: { team: string; delta: number } | null;
  /** A driver who misses every race from this round on. */
  out?: { driver: string; fromRound: number } | null;
  /** 0.6 calm, 1 normal, 1.7 chaos: scales randomness and retirements. */
  chaos?: number;
  sprints?: boolean;
  n?: number;
  seed?: number;
}

export interface SimResult {
  drivers: { id: string; p: number; points: number }[];
  teams: { id: string; p: number; points: number }[];
  n: number;
  ms: number;
}

/** Small, fast, seeded random numbers so the same question gives the same answer. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(r: () => number) {
  let u = 0;
  while (u === 0) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

export function simulate(inp: SimInputs, w: WhatIf = {}): SimResult {
  const t0 = performance.now();
  const n = w.n ?? 10_000;
  const chaos = w.chaos ?? 1;
  const sprints = w.sprints ?? true;
  const r = rng(w.seed ?? 2027);
  const D = inp.drivers.length;
  const teamIds = [...new Set(inp.teams)];
  const teamIdx = inp.teams.map((t) => teamIds.indexOf(t));
  const outIdx = w.out ? inp.drivers.indexOf(w.out.driver) : -1;
  const paceTeam = w.pace ? teamIds.indexOf(w.pace.team) : -1;

  const wins = new Float64Array(D);
  const teamWins = new Float64Array(teamIds.length);
  const sumPts = new Float64Array(D);
  const sumTeam = new Float64Array(teamIds.length);
  const pts = new Float64Array(D);
  const tpts = new Float64Array(teamIds.length);
  const swing = new Float64Array(D);
  const teamSwing = new Float64Array(teamIds.length);
  const keys = new Float64Array(D);
  const order = Array.from({ length: D }, (_, i) => i);
  const dnf = new Uint8Array(D);

  const race = (rd: SimRound, table: number[], dnfScale: number) => {
    for (let i = 0; i < D; i++) {
      const out = outIdx === i && rd.round >= (w.out?.fromRound ?? 99);
      const p = Math.min(0.6, rd.p_dnf[i] * dnfScale * (0.5 + 0.5 * chaos));
      dnf[i] = out || r() < p ? 1 : 0;
      let u = r();
      while (u === 0) u = r();
      const g = -Math.log(-Math.log(u)) * chaos;
      const pace = teamIdx[i] === paceTeam ? (w.pace?.delta ?? 0) : 0;
      keys[i] = dnf[i] ? -Infinity : rd.log_w[i] + swing[i] + pace + g;
    }
    order.sort((a, b) => keys[b] - keys[a]);
    for (let k = 0; k < table.length && k < D; k++) {
      const i = order[k];
      if (!dnf[i]) pts[i] += table[k];
    }
  };

  for (let s = 0; s < n; s++) {
    pts.fill(0);
    for (let t = 0; t < teamIds.length; t++) teamSwing[t] = normal(r) * inp.team_sigma;
    for (let i = 0; i < D; i++) swing[i] = teamSwing[teamIdx[i]] + normal(r) * inp.driver_sigma;
    for (const rd of inp.rounds) {
      race(rd, inp.race_points, 1);
      if (rd.sprint && sprints) race(rd, inp.sprint_points, inp.sprint_dnf_factor);
    }
    tpts.fill(0);
    let best = -1,
      bestV = -1;
    for (let i = 0; i < D; i++) {
      tpts[teamIdx[i]] += pts[i];
      sumPts[i] += pts[i];
      const v = pts[i] + r() * 1e-6;
      if (v > bestV) {
        bestV = v;
        best = i;
      }
    }
    wins[best]++;
    let bt = -1,
      btV = -1;
    for (let t = 0; t < teamIds.length; t++) {
      sumTeam[t] += tpts[t];
      const v = tpts[t] + r() * 1e-6;
      if (v > btV) {
        btV = v;
        bt = t;
      }
    }
    teamWins[bt]++;
  }

  return {
    drivers: inp.drivers
      .map((id, i) => ({ id, p: wins[i] / n, points: sumPts[i] / n }))
      .sort((a, b) => b.p - a.p || b.points - a.points),
    teams: teamIds
      .map((id, t) => ({ id, p: teamWins[t] / n, points: sumTeam[t] / n }))
      .sort((a, b) => b.p - a.p || b.points - a.points),
    n,
    ms: Math.round(performance.now() - t0),
  };
}
