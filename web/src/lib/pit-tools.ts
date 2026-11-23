/**
 * The tools "Ask the pit wall" may use. Each one reads PitWall's own data (the exported
 * site data, the live ledger, the simulator), so every answer comes from real numbers.
 */
import { driver, pct, site, team } from "@/lib/data";
import { summary } from "@/lib/ledger";
import { simulate, type SimInputs, type WhatIf } from "@/lib/sim";

export interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

const p = (x: number | null | undefined, d = 1) => (x === null || x === undefined ? null : pct(x, d));

/** Match "Max", "VER", "verstappen", "Lando Norris" to a driver id. */
export function findDriver(q: string): string | null {
  const s = q.toLowerCase().trim();
  if (!s) return null;
  const all = Object.values(site.drivers);
  return (
    all.find((d) => d.id === s || d.code.toLowerCase() === s)?.id ??
    all.find((d) => d.name.toLowerCase() === s || d.last_name.toLowerCase() === s)?.id ??
    all.find((d) => d.name.toLowerCase().includes(s) || s.includes(d.last_name.toLowerCase()))?.id ??
    null
  );
}

export function findTeam(q: string): string | null {
  const s = q.toLowerCase().replace(/[^a-z ]/g, "").trim();
  const ids = new Set([...Object.keys(site.teams)]);
  for (const id of ids) {
    const t = team(id);
    if (id === s.replace(/ /g, "_") || t.name.toLowerCase() === s || t.short.toLowerCase() === s) return id;
  }
  for (const id of ids) if (team(id).name.toLowerCase().includes(s) || s.includes(team(id).name.toLowerCase())) return id;
  return null;
}

export const TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "next_race",
      description:
        "The next Grand Prix: name, date, whether odds are before or after qualifying, the model's win and podium odds for the top drivers, team odds, sprint odds if it is a sprint weekend, and the race-day weather forecast (temperature, rain chance, wind).",
      parameters: { type: "object", properties: { top: { type: "integer", description: "How many drivers (default 10)" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "driver",
      description:
        "Everything PitWall has on one driver: next-race odds and the model inputs behind them (with the field's range), 2026 standing, career since 2018, 2027 seat and title odds.",
      parameters: {
        type: "object",
        properties: { name: { type: "string", description: "Name, surname or three-letter code" } },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "standings",
      description: "The current championship standings after the latest race.",
      parameters: {
        type: "object",
        properties: { kind: { type: "string", enum: ["drivers", "constructors"] }, top: { type: "integer" } },
        required: ["kind"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "title_odds",
      description: "Next season's championship odds from 10,000 simulated seasons, with expected points.",
      parameters: {
        type: "object",
        properties: { kind: { type: "string", enum: ["drivers", "constructors"] }, top: { type: "integer" } },
        required: ["kind"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "track_record",
      description:
        "How accurate the model is: the walk-forward backtest (151 races) against baselines, per-season results, and the live ledger of calls published before races this season.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "race_calls",
      description: "Every completed race this season: winner, pole, the model's favourite before and after qualifying, and whether it was right.",
      parameters: { type: "object", properties: { last: { type: "integer", description: "Only the last N races" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "what_if",
      description:
        "Re-run next season 5,000 times with one change and compare title odds to the baseline: a team faster or slower (pace_steps from -3 to 3), a driver out from a round, or more or less chaos.",
      parameters: {
        type: "object",
        properties: {
          team: { type: "string" },
          pace_steps: { type: "integer", minimum: -3, maximum: 3 },
          driver_out: { type: "string" },
          from_round: { type: "integer", minimum: 1 },
          chaos: { type: "string", enum: ["calm", "normal", "chaos"] },
        },
      },
    },
  },
];

type Args = Record<string, unknown>;

/** "3rd best of 22" for one input, so the engineer never calls a value the best when it isn't. */
function rankIn(odds: { driver_id: string; inputs: Record<string, number | null> }[], id: string, key: string, hib: boolean) {
  const vals = odds.map((o) => ({ id: o.driver_id, v: o.inputs[key] })).filter((x): x is { id: string; v: number } => x.v !== null);
  const me = vals.find((x) => x.id === id);
  if (!me) return "no data";
  const better = vals.filter((x) => (hib ? x.v > me.v : x.v < me.v)).length;
  const n = better + 1;
  const suffix = n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
  return `${n}${suffix} best of ${vals.length}`;
}
const int = (v: unknown, d: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Number.isFinite(Number(v)) ? Math.round(Number(v)) : d));

/** Run a tool. Returns plain JSON for the model and a one-line label for the "sources" chips. */
export async function runTool(
  name: string,
  args: Args,
  origin: string,
): Promise<{ data: unknown; label: string }> {
  const race = site.next_race;
  switch (name) {
    case "next_race": {
      if (!race) return { data: { error: "No upcoming race in the data." }, label: "Next race" };
      const top = int(args.top, 10, 1, 22);
      return {
        label: `${race.race_name} odds`,
        data: {
          race: race.race_name,
          round: race.round,
          season: race.season,
          circuit: race.circuit_name,
          start_utc: race.start_utc,
          stage: race.stage === "post_quali" ? "after qualifying (grid set)" : "before qualifying",
          pole: race.pole ? driver(race.pole).name : null,
          odds: race.odds.slice(0, top).map((o) => ({
            driver: driver(o.driver_id).name,
            team: team(o.team).name,
            win: p(o.p_win),
            podium: p(o.p_podium, 0),
            win_before_qualifying: race.stage === "post_quali" ? p(o.p_win_pre) : undefined,
          })),
          teams: race.constructors?.slice(0, 6).map((t) => ({
            team: team(t.team).name,
            win: p(t.p_win),
            podium: p(t.p_podium, 0),
            one_two: p(t.p_one_two),
          })),
          sprint: race.sprint
            ? race.sprint.odds.slice(0, 5).map((o) => ({ driver: driver(o.driver_id).name, win: p(o.p_win) }))
            : "not a sprint weekend",
          race_day_forecast: race.weather
            ? { ...race.weather, note: "Open-Meteo forecast for the start; the model does not use weather" }
            : "not available yet (forecasts start about two weeks out)",
          last_winner_here: race.last_winner ? `${driver(race.last_winner.driver_id).name} (${race.last_winner.season})` : null,
        },
      };
    }
    case "driver": {
      const id = findDriver(String(args.name ?? ""));
      if (!id) return { data: { error: `No driver matching "${args.name}".` }, label: "Driver lookup" };
      const d = driver(id);
      const o = race?.odds.find((x) => x.driver_id === id);
      const st = site.season.drivers.find((x) => x.driver_id === id);
      const t27 = site.forecast?.drivers.find((x) => x.driver_id === id);
      return {
        label: `${d.name}`,
        data: {
          name: d.name,
          code: d.code,
          nationality: d.nationality,
          team_now: team(d.team_now).name,
          team_2027: d.team_next ? `${team(d.team_next).name} (${d.seat_status})` : "no confirmed 2027 seat",
          next_race: o && race
            ? {
                race: race.race_name,
                win: p(o.p_win),
                podium: p(o.p_podium, 0),
                rank_in_odds: race.odds.indexOf(o) + 1,
                starts: o.quali_position ? `P${o.quali_position}` : undefined,
                inputs: race.inputs.map((inp) => ({
                  input: inp.label,
                  value: o.inputs[inp.key],
                  rank_in_field: rankIn(race.odds, id, inp.key, inp.higher_is_better),
                  field_best: inp.higher_is_better ? race.field[inp.key]?.max : race.field[inp.key]?.min,
                  field_worst: inp.higher_is_better ? race.field[inp.key]?.min : race.field[inp.key]?.max,
                })),
              }
            : "not in the next race",
          season_2026: st
            ? { position: st.position, points: st.points, wins: st.wins, podiums: st.podiums, poles: st.poles, dnfs: st.dnfs, avg_finish: st.avg_finish }
            : null,
          career_since_2018: d.career_since_2018,
          title_2027: t27 ? { title_chance: p(t27.p_title), expected_points: Math.round(t27.expected_points) } : null,
        },
      };
    }
    case "standings": {
      const top = int(args.top, 10, 1, 22);
      if (args.kind === "constructors")
        return {
          label: "Constructors' standings",
          data: site.season.constructors.slice(0, top).map((c) => ({ pos: c.position, team: team(c.constructor_id).name, points: c.points, wins: c.wins })),
        };
      return {
        label: "Drivers' standings",
        data: {
          after_round: site.season.after_round,
          of_rounds: site.season.rounds,
          clinched: site.season.clinched ?? null,
          table: site.season.drivers.slice(0, top).map((s) => ({ pos: s.position, driver: driver(s.driver_id).name, points: s.points, wins: s.wins })),
        },
      };
    }
    case "title_odds": {
      const f = site.forecast;
      if (!f) return { data: { error: "No title forecast in the data." }, label: "Title odds" };
      const top = int(args.top, 10, 1, 22);
      const rows =
        args.kind === "constructors"
          ? f.constructors.slice(0, top).map((c) => ({ team: c.name, title: p(c.p_title), expected_points: Math.round(c.expected_points) }))
          : f.drivers.slice(0, top).map((c) => ({ driver: c.name, team: team(c.team).name, title: p(c.p_title), expected_points: Math.round(c.expected_points), seat: c.seat_status }));
      return { label: `${f.season} title odds`, data: { season: f.season, simulations: f.simulations, rows } };
    }
    case "track_record": {
      const r = site.record?.modes;
      const live = summary();
      return {
        label: "Track record",
        data: {
          backtest: r
            ? {
                races: r.post_quali.model.races,
                after_qualifying: { winner_hit: p(r.post_quali.model.winner_hit), winner_in_top3: p(r.post_quali.model.winner_in_top3), brier: r.post_quali.model.brier, baseline_grid_slot_winner_hit: p(r.post_quali.baseline_scores.winner_hit) },
                before_qualifying: { winner_hit: p(r.pre_quali.model.winner_hit), winner_in_top3: p(r.pre_quali.model.winner_in_top3), brier: r.pre_quali.model.brier, baseline_elo_winner_hit: p(r.pre_quali.baseline_scores.winner_hit) },
                per_season_after_qualifying: r.post_quali.per_season.map((s) => ({ season: s.season, model: p(s.model.winner_hit, 0), baseline: p(s.baseline.winner_hit, 0) })),
              }
            : null,
          live_ledger: {
            since: live.since,
            races_scored: live.races,
            favourite_won: p(live.hitRate),
            winner_in_top3: p(live.top3Rate),
            brier: live.brier,
            waiting_for: live.pending.map((c) => c.race_name),
          },
        },
      };
    }
    case "race_calls": {
      const last = int(args.last, 24, 1, 30);
      return {
        label: `${site.season.season} race calls`,
        data: site.races.slice(-last).map((c) => ({
          round: c.round,
          race: c.race_name,
          winner: c.winner ? driver(c.winner).name : null,
          pole: c.pole ? driver(c.pole).name : null,
          before_qualifying: `${driver(c.pre.favourite).code} ${p(c.pre.p_favourite, 0)} ${c.pre.hit ? "hit" : "miss"}`,
          after_qualifying: `${driver(c.post.favourite).code} ${p(c.post.p_favourite, 0)} ${c.post.hit ? "hit" : "miss"}`,
        })),
      };
    }
    case "what_if": {
      const res = await fetch(new URL("/data/sim.json", origin));
      if (!res.ok) return { data: { error: "Simulator inputs unavailable." }, label: "What if" };
      const inp = (await res.json()) as SimInputs;
      const w: WhatIf = { n: 5000, seed: 7 };
      const changes: string[] = [];
      const teamId = args.team ? findTeam(String(args.team)) : null;
      const steps = int(args.pace_steps, 0, -3, 3);
      if (teamId && steps) {
        w.pace = { team: teamId, delta: steps * 0.2 };
        changes.push(`${team(teamId).name} ${steps > 0 ? "faster" : "slower"} by ${Math.abs(steps)} step${Math.abs(steps) > 1 ? "s" : ""}`);
      }
      const out = args.driver_out ? findDriver(String(args.driver_out)) : null;
      if (out) {
        const from = int(args.from_round, 1, 1, 30);
        w.out = { driver: out, fromRound: from };
        changes.push(`${driver(out).name} out from round ${from}`);
      }
      if (args.chaos === "calm" || args.chaos === "chaos") {
        w.chaos = args.chaos === "calm" ? 0.6 : 1.7;
        changes.push(`${args.chaos} season`);
      }
      if (!changes.length) return { data: { error: "Give one change: a team's pace, a driver out, or chaos." }, label: "What if" };
      const base = simulate(inp, { n: 5000, seed: 7 });
      const alt = simulate(inp, w);
      const baseP = new Map(base.drivers.map((d) => [d.id, d.p]));
      const baseT = new Map(base.teams.map((d) => [d.id, d.p]));
      return {
        label: `What if: ${changes.join(", ")}`,
        data: {
          season: inp.season,
          change: changes,
          simulations: alt.n,
          drivers: alt.drivers.slice(0, 8).map((d) => ({ driver: driver(d.id).name, title: p(d.p), before: p(baseP.get(d.id) ?? 0) })),
          teams: alt.teams.slice(0, 5).map((t) => ({ team: team(t.id).name, title: p(t.p), before: p(baseT.get(t.id) ?? 0) })),
        },
      };
    }
    default:
      return { data: { error: `Unknown tool ${name}.` }, label: name };
  }
}
