"use client";

import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { useFollow } from "@/components/follow";
import { driver, pct, site, team } from "@/lib/data";
import type { SimInputs, SimResult, WhatIf as WhatIfOptions } from "@/lib/sim";

const CHAOS = [
  { k: 0.6, label: "Calm" },
  { k: 1, label: "Normal" },
  { k: 1.7, label: "Chaos" },
];
// Car pace in model units; one step is roughly the gap between a midfield and a front-running car's form swing.
const PACE_STEPS = [-0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6];

function Delta({ now, was }: { now: number; was: number | undefined }) {
  if (was === undefined) return null;
  const d = (now - was) * 100;
  if (Math.abs(d) < 0.5) return <span className="text-sub">±0</span>;
  return <span className={d > 0 ? "text-gain" : "text-drop"}>{`${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}`}</span>;
}

/** Bend next season and re-run 10,000 seasons in a background thread. */
export function WhatIf() {
  const inputs = site.sim as unknown as SimInputs | null;
  const { followId } = useFollow();
  const worker = useRef<Worker | null>(null);
  const reqId = useRef(0);
  const [base, setBase] = useState<SimResult | null>(null);
  const [res, setRes] = useState<SimResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [paceTeam, setPaceTeam] = useState("ferrari");
  const [pace, setPace] = useState(3);
  const [outDriver, setOutDriver] = useState("");
  const [outFrom, setOutFrom] = useState(8);
  const [chaos, setChaos] = useState(1);
  const [sprints, setSprints] = useState(true);
  const [kind, setKind] = useState<"drivers" | "teams">("drivers");

  const run = useCallback(
    (w: WhatIfOptions, asBase = false) => {
      if (!inputs || !worker.current) return;
      const id = ++reqId.current;
      setBusy(true);
      worker.current.onmessage = (e: MessageEvent<{ id: number; result: SimResult }>) => {
        if (e.data.id !== reqId.current) return;
        setBusy(false);
        if (asBase) setBase(e.data.result);
        setRes(e.data.result);
      };
      worker.current.postMessage({ id, inputs, whatIf: { n: 10_000, ...w } });
    },
    [inputs],
  );

  // Start the worker and the baseline once the section is close to the screen.
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!inputs || !box.current) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting || worker.current) return;
        worker.current = new Worker(new URL("../../lib/sim.worker.ts", import.meta.url), { type: "module" });
        run({}, true);
        io.disconnect();
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(box.current);
    return () => {
      io.disconnect();
      worker.current?.terminate();
      worker.current = null;
    };
  }, [inputs, run]);

  if (!inputs) return null;

  const teamIds = [...new Set(inputs.teams)];
  const rounds = inputs.rounds.map((r) => r.round);
  const calendar = site.forecast?.calendar ?? [];
  const apply = () =>
    run({
      pace: PACE_STEPS[pace] !== 0 ? { team: paceTeam, delta: PACE_STEPS[pace] } : null,
      out: outDriver ? { driver: outDriver, fromRound: outFrom } : null,
      chaos,
      sprints,
    });
  const reset = () => {
    setPace(3);
    setOutDriver("");
    setChaos(1);
    setSprints(true);
    if (base) setRes(base);
  };
  const changed = PACE_STEPS[pace] !== 0 || outDriver !== "" || chaos !== 1 || !sprints;

  const rows = (kind === "drivers" ? res?.drivers : res?.teams) ?? [];
  const baseMap = new Map(((kind === "drivers" ? base?.drivers : base?.teams) ?? []).map((r) => [r.id, r.p]));
  const top = rows[0]?.p || 1;
  const myTeam = driver(followId).team_next ?? driver(followId).team_now;

  return (
    <div ref={box} className="grid gap-12 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:gap-16">
      {/* Controls */}
      <div className="grid content-start gap-6">
        <div className="grid gap-2.5">
          <label htmlFor="wi-team" className="font-mono text-[11px] uppercase tracking-[0.14em] text-sub">
            Car pace over the winter
          </label>
          <select id="wi-team" className="select" value={paceTeam} onChange={(e) => setPaceTeam(e.target.value)}>
            {teamIds.map((t) => (
              <option key={t} value={t}>
                {team(t).name}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-sub">Slower</span>
            <input
              type="range"
              min={0}
              max={PACE_STEPS.length - 1}
              step={1}
              value={pace}
              onChange={(e) => setPace(Number(e.target.value))}
              aria-label="Car pace change"
              aria-valuetext={PACE_STEPS[pace] === 0 ? "No change" : `${PACE_STEPS[pace] > 0 ? "Faster" : "Slower"} by ${Math.abs(pace - 3)} steps`}
              className="range flex-1"
              style={{ "--c": team(paceTeam).colour, "--v": `${(pace / (PACE_STEPS.length - 1)) * 100}%` } as CSSProperties}
            />
            <span className="font-mono text-[11px] text-sub">Faster</span>
          </div>
        </div>

        <div className="grid gap-2.5">
          <label htmlFor="wi-out" className="font-mono text-[11px] uppercase tracking-[0.14em] text-sub">
            A driver is out
          </label>
          <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
            <select id="wi-out" className="select" value={outDriver} onChange={(e) => setOutDriver(e.target.value)}>
              <option value="">Nobody</option>
              {inputs.drivers.map((d) => (
                <option key={d} value={d}>
                  {driver(d).name}
                </option>
              ))}
            </select>
            <select
              className="select"
              aria-label="From round"
              value={outFrom}
              disabled={!outDriver}
              onChange={(e) => setOutFrom(Number(e.target.value))}
            >
              {rounds.map((r) => (
                <option key={r} value={r}>
                  From R{r}
                </option>
              ))}
            </select>
          </div>
          {outDriver ? (
            <small className="text-sm text-sub">
              Misses every race from {calendar.find((c) => c.round === outFrom)?.race_name ?? `round ${outFrom}`} on.
            </small>
          ) : null}
        </div>

        <div className="grid gap-2.5">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-sub">Conditions</span>
          <div className="seg w-full" role="group" aria-label="Conditions">
            {CHAOS.map((c) => (
              <button key={c.k} type="button" aria-pressed={chaos === c.k} onClick={() => setChaos(c.k)} className="flex-1">
                {c.label}
              </button>
            ))}
          </div>
          <small className="text-sm text-sub">Chaos means more upsets and more retirements, like a season of wet races.</small>
        </div>

        <label className="flex items-center justify-between rounded-xl border border-rule px-4 py-3.5">
          <span className="text-sm">Count sprint points</span>
          <input type="checkbox" checked={sprints} onChange={(e) => setSprints(e.target.checked)} className="switch" />
        </label>

        <div className="flex flex-wrap gap-2.5">
          <button type="button" className="btn btn-primary" onClick={apply} disabled={busy || !base} data-cursor="Run">
            <span className="lbl">
              <i>{busy ? "Simulating…" : "Simulate 10,000 seasons"}</i>
              <i>{busy ? "Simulating…" : "Simulate 10,000 seasons"}</i>
            </span>
            <span className={`dot ${busy ? "animate-pulse" : ""}`} />
          </button>
          {changed ? (
            <button type="button" className="btn btn-line" onClick={reset}>
              <span className="lbl">
                <i>Reset</i>
                <i>Reset</i>
              </span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Results */}
      <div aria-live="polite" aria-busy={busy}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="seg" role="group" aria-label="Championship">
            <button type="button" aria-pressed={kind === "drivers"} onClick={() => setKind("drivers")}>
              Drivers
            </button>
            <button type="button" aria-pressed={kind === "teams"} onClick={() => setKind("teams")}>
              Constructors
            </button>
          </div>
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-sub">
            {res ? `${res.n.toLocaleString("en-GB")} seasons · ${res.ms} ms` : "Warming up…"}
          </span>
        </div>
        <ol className={`grid gap-2.5 transition-opacity duration-300 ${busy ? "opacity-50" : ""}`}>
          {(rows.length ? rows.slice(0, 10) : Array.from({ length: 10 }, () => null)).map((r, i) => {
            if (!r)
              return <li key={i} className="h-11 animate-pulse rounded-[10px] bg-panel" aria-hidden="true" />;
            const isDriver = kind === "drivers";
            const t = isDriver ? team(inputs.teams[inputs.drivers.indexOf(r.id)]) : team(r.id);
            const label = isDriver ? driver(r.id).code : t.short;
            const mine = isDriver ? r.id === followId : r.id === myTeam;
            return (
              <li
                key={r.id}
                className="grid grid-cols-[52px_minmax(0,1fr)_64px_52px] items-center gap-3 md:grid-cols-[64px_minmax(0,1fr)_80px_60px]"
                style={{ "--c": t.colour } as CSSProperties}
              >
                <span className="type-code text-[26px] leading-[0.9]">{label}</span>
                <span className={`relative h-11 overflow-hidden rounded-[10px] border bg-panel ${mine ? "border-[var(--you)]" : "border-rule"}`}>
                  <i
                    className="absolute inset-y-0 left-0 rounded-[9px] transition-[width] duration-700 ease-expo"
                    style={{ width: `${Math.max(1.5, (r.p / top) * 100)}%`, background: "var(--c)" }}
                  />
                  <span className="absolute inset-y-0 left-3 flex items-center font-mono text-[11px] text-[#0b0c0e] mix-blend-normal">
                    <span className="rounded bg-[rgb(255_255_255/0.85)] px-1.5 py-0.5">{isDriver ? t.name : `${Math.round(r.points)} pts exp.`}</span>
                  </span>
                </span>
                <span className="type-data text-right text-xl">{pct(r.p, r.p < 0.1 ? 1 : 0)}</span>
                <span className="type-data text-right text-xs">
                  <Delta now={r.p} was={baseMap.get(r.id)} />
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-5 text-sm text-sub">
          The same model as the forecast above, run in your browser. Changes show against the unchanged forecast.
        </p>
      </div>
    </div>
  );
}
