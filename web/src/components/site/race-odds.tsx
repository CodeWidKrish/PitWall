"use client";

import { type CSSProperties, useState } from "react";
import { useFollow } from "@/components/follow";
import { driver, type NextRace, type Odds, pct, team } from "@/lib/data";

function fmt(key: string, v: number | null): string {
  if (v === null) return "—";
  if (key === "elo") return Math.round(v).toString();
  if (key.includes("rate")) return pct(v, 0);
  return v.toFixed(1);
}

/** How far a chance moved once the grid was set, in percentage points. */
function Move({ now, was }: { now: number; was: number }) {
  const d = (now - was) * 100;
  if (Math.abs(d) < 0.05) return <span aria-label="unchanged after qualifying">· =</span>;
  const up = d > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 ${up ? "bg-gain/15 text-gain" : "bg-drop/15 text-drop"}`}
      aria-label={`${up ? "up" : "down"} ${Math.abs(d).toFixed(1)} points after qualifying`}
    >
      <svg viewBox="0 0 8 8" className={`size-2 ${up ? "" : "rotate-180"}`} aria-hidden="true">
        <path d="M4 1 7 6H1Z" fill="currentColor" />
      </svg>
      {Math.abs(d).toFixed(1)}
    </span>
  );
}

/** Where a value sits in the field, 0 (worst) to 1 (best). */
function standing(v: number | null, min: number | null, max: number | null, higherIsBetter: boolean): number | null {
  if (v === null || min === null || max === null || max === min) return null;
  const x = (v - min) / (max - min);
  return higherIsBetter ? x : 1 - x;
}

/**
 * Win and podium odds for every driver at the next race. Opening a row shows the
 * model's inputs for that driver against the rest of the field.
 */
export function RaceOdds({
  race,
  odds = race.odds,
  moved = false,
  label = "win",
}: {
  race: NextRace;
  odds?: Odds[];
  /** Show how each driver's chance moved once the grid was set. */
  moved?: boolean;
  label?: string;
}) {
  const { followId } = useFollow();
  const [open, setOpen] = useState<string | null>(null);
  const top = odds[0]?.p_win ?? 1;

  return (
    <div className="border-t border-rule" data-reveal="list">
      {odds.map((o, i) => {
        const d = driver(o.driver_id);
        const t = team(o.team);
        const isOpen = open === o.driver_id;
        const mine = followId === o.driver_id;
        return (
          <div
            key={o.driver_id}
            className={`relative border-b border-rule ${isOpen ? "open" : ""}`}
            style={{ "--c": t.colour, "--i": Math.min(i, 12) } as CSSProperties}
          >
            {mine ? (
              <span aria-hidden="true" className="absolute -left-3.5 inset-y-[18px] w-1 rounded-sm bg-you max-md:-left-2.5" />
            ) : null}
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : o.driver_id)}
              className="group grid w-full cursor-pointer grid-cols-[30px_60px_minmax(0,1fr)_76px_18px] items-center gap-3 py-[18px] text-left md:grid-cols-[48px_84px_minmax(0,1fr)_minmax(0,2fr)_92px_70px_22px] md:gap-[18px]"
            >
              <span className="type-data text-[13px] text-sub">{String(i + 1).padStart(2, "0")}</span>
              <span className="type-code text-[30px] leading-[0.9] transition-[color,letter-spacing] duration-500 ease-expo group-hover:tracking-[0.05em] group-hover:text-[var(--c)] md:text-4xl">
                {d.code}
              </span>
              <span className="grid min-w-0">
                <span className="type-voice truncate text-[22px] leading-[1.1]">{d.name}</span>
                <small className="flex flex-wrap items-center gap-x-2 font-mono text-[10px] uppercase leading-normal tracking-[0.14em] text-sub">
                  {t.name}
                  {moved && o.quali_position ? <span className="text-ink">· Starts P{o.quali_position}</span> : null}
                  {moved && o.p_win_pre !== undefined ? <Move now={o.p_win} was={o.p_win_pre} /> : null}
                </small>
              </span>
              <span className="h-2.5 overflow-hidden rounded-full bg-rule max-md:hidden">
                <i className="bar-fill" style={{ "--w": `${(o.p_win / top) * 100}%` } as CSSProperties} />
              </span>
              <span className="type-data text-right text-[22px]" aria-label={`${pct(o.p_win)} ${label} chance`}>
                {pct(o.p_win)}
              </span>
              <span className="type-data text-right text-xs text-sub max-md:hidden">
                {pct(o.p_podium, 0)}
                <br />
                <span className="text-[10px] uppercase tracking-[0.1em]">podium</span>
              </span>
              <span
                aria-hidden="true"
                className="text-center font-mono text-[22px] font-light text-sub transition-transform duration-500 ease-expo [.open_&]:rotate-45"
              >
                +
              </span>
            </button>
            <div className="expand">
              <div>
                <div className="grid gap-8 pb-7 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] md:pl-[150px]">
                  <dl className="grid gap-2.5">
                    {race.inputs.map((inp) => {
                      const f = race.field[inp.key];
                      const v = o.inputs[inp.key] ?? null;
                      const s = standing(v, f?.min ?? null, f?.max ?? null, inp.higher_is_better);
                      return (
                        <div
                          key={inp.key}
                          className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_56px] items-center gap-3 text-sm"
                        >
                          <dt>{inp.label}</dt>
                          <span className="relative h-2 rounded-full bg-rule" aria-hidden="true">
                            {s !== null ? (
                              <i
                                className="absolute inset-y-0 left-0 rounded-full"
                                style={{ width: `${Math.max(4, s * 100)}%`, background: "var(--c)" }}
                              />
                            ) : null}
                          </span>
                          <dd className="type-data text-right text-[13px]">{fmt(inp.key, v)}</dd>
                        </div>
                      );
                    })}
                  </dl>
                  <p className="max-w-[40ch] text-sm text-sub">
                    Bars show where <strong className="font-semibold text-ink">{d.last_name}</strong> sits in this
                    weekend&apos;s field, from worst (empty) to best (full). These are inputs, not reasons: the model
                    weighs them together. Podium chance {pct(o.p_podium)}.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
