"use client";

import { type CSSProperties, useId, useLayoutEffect, useRef, useState } from "react";
import { RaceOdds } from "@/components/site/race-odds";
import { TeamCar } from "@/components/ui/team-car";
import { driver, inkOn, type NextRace, type Odds, pct, type TeamOdds, team } from "@/lib/data";

type Session = "race" | "sprint";

/**
 * The weekend's odds: the Grand Prix and, on sprint weekends, the sprint, behind one
 * segmented switch. Below the drivers, the same odds by team.
 */
export function WeekendOdds({ race }: { race: NextRace }) {
  const sprint = race.sprint ?? null;
  const [session, setSession] = useState<Session>("race");
  const id = useId();

  // Sprint rows carry the same inputs as the race rows, so the details still open.
  const sprintOdds: Odds[] = sprint
    ? sprint.odds.map((o) => ({ ...o, inputs: race.odds.find((r) => r.driver_id === o.driver_id)?.inputs ?? {} }))
    : [];
  const odds = session === "sprint" ? sprintOdds : race.odds;
  const teams = session === "sprint" ? sprint?.constructors : race.constructors;
  const post = race.stage === "post_quali";

  return (
    <div className="grid gap-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {sprint ? (
          <Segmented
            label="Session"
            value={session}
            onChange={setSession}
            options={[
              { value: "race", label: "Grand Prix" },
              { value: "sprint", label: "Sprint" },
            ]}
            controls={`${id}-panel`}
          />
        ) : (
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-sub">Grand Prix</span>
        )}
        <Stage race={race} session={session} />
      </div>
      {race.weather ? <RaceWeather w={race.weather} /> : null}

      {session === "sprint" && sprint?.result ? (
        <p className="panel flex flex-wrap items-center gap-x-4 gap-y-2 p-4 text-sm">
          <span className="pill best">Sprint result</span>
          Won by <strong className="font-semibold">{driver(sprint.result.winner).name}</strong>, whom the model gave{" "}
          {pct(sprint.odds.find((o) => o.driver_id === sprint.result?.winner)?.p_win ?? 0)}. Podium:{" "}
          {sprint.result.podium.map((d) => driver(d).code).join(", ")}.
        </p>
      ) : null}

      <div id={`${id}-panel`} role="region" aria-live="polite" aria-label={session === "sprint" ? "Sprint odds" : "Grand Prix odds"} key={session} className="[animation:heroIn_.7s_var(--ease-out-expo)_both]">
        <RaceOdds race={race} odds={odds} moved={post && session === "race"} label={session === "sprint" ? "sprint win" : "win"} />
      </div>

      {teams?.length ? <TeamOddsBoard teams={teams} session={session} /> : null}

      {session === "sprint" && sprint ? (
        <p className="max-w-[70ch] text-sm text-sub">
          A sprint is about a third of a race with no pit stops, so it is a little more predictable. These odds use the
          same pre-qualifying strengths as the Grand Prix with their own scale, fitted on {sprint.calibration.sprints}{" "}
          past sprints
          {sprint.calibration.favourite_won !== undefined
            ? `, where the favourite won ${pct(sprint.calibration.favourite_won, 0)} of the time and the winner was in its top three ${pct(sprint.calibration.winner_in_top3 ?? 0, 0)}`
            : ""}
          . Sprint qualifying is not used.
        </p>
      ) : null}
    </div>
  );
}

/** The race-day forecast at lights out: context only, the model doesn't use it. */
function RaceWeather({ w }: { w: NonNullable<NextRace["weather"]> }) {
  const items: [string, string][] = [
    ["Air", w.temperature_c !== null ? `${Math.round(w.temperature_c)}°C` : "—"],
    ["Rain chance", w.rain_chance !== null ? `${Math.round(w.rain_chance)}%` : "—"],
    ["Wind", w.wind_kmh !== null ? `${Math.round(w.wind_kmh)} km/h` : "—"],
    ["Cloud", w.cloud_cover !== null ? `${Math.round(w.cloud_cover)}%` : "—"],
  ];
  const wet = (w.rain_chance ?? 0) >= 40;
  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-2xl border border-rule px-5 py-4">
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-sub">Forecast at lights out</span>
      <dl className="flex flex-wrap gap-x-7 gap-y-2">
        {items.map(([k, v]) => (
          <div key={k} className="flex items-baseline gap-2">
            <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-sub">{k}</dt>
            <dd className={`type-data text-lg ${k === "Rain chance" && wet ? "text-[var(--accent)]" : ""}`}>{v}</dd>
          </div>
        ))}
      </dl>
      <span className="ml-auto text-xs text-sub">
        Open-Meteo{wet ? " · a wet race adds randomness the odds don't include" : " · not a model input"}
      </span>
    </div>
  );
}

function Stage({ race, session }: { race: NextRace; session: Session }) {
  const post = race.stage === "post_quali" && session === "race";
  return (
    <span className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.14em] text-sub">
      <span className={`relative grid size-2.5 place-items-center rounded-full ${post ? "bg-gain" : "bg-sub"}`} aria-hidden="true" />
      {post ? (
        <>
          Grid set · pole {driver(race.pole).code} · re-run with qualifying
        </>
      ) : (
        <>Before qualifying · updates once the grid is set</>
      )}
    </span>
  );
}

/** A segmented control whose highlight slides to the selected option. */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  controls,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  controls?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const el = wrap.current?.querySelector<HTMLElement>(`[data-v="${value}"]`);
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value]);
  const move = (dir: number) => {
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + dir + options.length) % options.length];
    onChange(next.value);
    wrap.current?.querySelector<HTMLElement>(`[data-v="${next.value}"]`)?.focus();
  };
  return (
    <div
      ref={wrap}
      role="tablist"
      aria-label={label}
      className="relative inline-flex rounded-full border border-rule p-1"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") move(1);
        if (e.key === "ArrowLeft") move(-1);
      }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-1 rounded-full bg-ink transition-[left,width] duration-500 ease-expo"
        style={{ left: pill?.left ?? 4, width: pill?.width ?? 0 }}
      />
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            data-v={o.value}
            aria-selected={on}
            aria-controls={controls}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={`relative z-[1] rounded-full px-5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors duration-300 ${on ? "text-paper" : "text-sub hover:text-ink"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Team odds: one bar split by who wins, then each team's win, podium and one-two chance. */
function TeamOddsBoard({ teams, session }: { teams: TeamOdds[]; session: Session }) {
  const [hover, setHover] = useState<string | null>(null);
  const shown = teams.filter((t) => t.p_podium >= 0.005);
  const maxPod = Math.max(...shown.map((t) => t.p_podium));
  return (
    <div className="grid gap-6" data-reveal="list">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="type-voice text-[clamp(26px,2.6vw,34px)] leading-none">By team</h3>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-sub">
          {session === "sprint" ? "Sprint" : "Grand Prix"} · from 20,000 simulated finishing orders
        </span>
      </div>

      {/* who wins, as one bar */}
      <div className="flex h-11 overflow-hidden rounded-xl border border-rule" role="img" aria-label={`Win chance by team: ${shown.map((t) => `${team(t.team).name} ${pct(t.p_win, 0)}`).join(", ")}`}>
        {shown.map((t, i) => {
          const tm = team(t.team);
          return (
            <span
              key={t.team}
              onMouseEnter={() => setHover(t.team)}
              onMouseLeave={() => setHover(null)}
              className={`bar-fill relative grid min-w-0 place-items-center !rounded-none transition-opacity duration-300 ${hover && hover !== t.team ? "opacity-35" : ""}`}
              style={{ "--c": tm.colour, "--w": "100%", width: `${t.p_win * 100}%`, transitionDelay: `${i * 70}ms` } as CSSProperties}
            >
              {t.p_win > 0.08 ? <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: inkOn(tm.colour) }}>{tm.short}</span> : null}
            </span>
          );
        })}
      </div>

      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-rule font-mono text-[10px] uppercase tracking-[0.14em] text-sub">
            <th scope="col" className="py-2 font-normal">Team</th>
            <th scope="col" className="py-2 text-right font-normal">Wins</th>
            <th scope="col" className="hidden py-2 pl-6 font-normal md:table-cell">Car on the podium</th>
            <th scope="col" className="py-2 text-right font-normal">Podium</th>
            <th scope="col" className="py-2 text-right font-normal">1-2</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((t, i) => {
            const tm = team(t.team);
            return (
              <tr
                key={t.team}
                onMouseEnter={() => setHover(t.team)}
                onMouseLeave={() => setHover(null)}
                className={`border-b border-rule transition-colors duration-300 ${hover === t.team ? "bg-[color-mix(in_oklab,var(--c)_10%,transparent)]" : ""}`}
                style={{ "--c": tm.colour, "--i": i } as CSSProperties}
              >
                <th scope="row" className="py-3 font-normal">
                  <span className="flex items-center gap-3">
                    <TeamCar id={t.team} className="w-[84px] max-sm:w-[60px]" />
                    <span className="type-voice text-lg leading-none">{tm.name}</span>
                  </span>
                </th>
                <td className="type-data py-3 text-right text-lg">{pct(t.p_win)}</td>
                <td className="hidden py-3 pl-6 md:table-cell">
                  <span className="block h-2 overflow-hidden rounded-full bg-rule">
                    <i className="bar-fill" style={{ "--w": `${(t.p_podium / maxPod) * 100}%` } as CSSProperties} />
                  </span>
                </td>
                <td className="type-data py-3 text-right text-sm">{pct(t.p_podium, 0)}</td>
                <td className="type-data py-3 text-right text-sm text-sub">{pct(t.p_one_two)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
