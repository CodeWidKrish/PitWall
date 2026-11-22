"use client";

import { type CSSProperties, type PointerEvent, useMemo, useRef, useState } from "react";
import { useFollow } from "@/components/follow";
import { driver, site, team } from "@/lib/data";

const W = 1200;
const H = 440;
const PAD = { l: 8, r: 110, t: 16, b: 34 };

interface Series {
  id: string;
  label: string;
  colour: string;
  values: number[];
  mine: boolean;
}

/** Points after every round of the season: the title race as it happened. */
export function PointsChart() {
  const { followId } = useFollow();
  const [kind, setKind] = useState<"drivers" | "constructors">("drivers");
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const { rounds } = site.season.progress;
  const names = new Map(site.races.map((r) => [r.round, r.country]));

  const series = useMemo<Series[]>(() => {
    if (kind === "drivers") {
      const top = site.season.drivers.slice(0, 6).map((s) => s.driver_id);
      const ids = top.includes(followId) ? top : [...top, followId];
      return ids
        .filter((id) => site.season.progress.drivers[id])
        .map((id) => {
          const d = driver(id);
          return {
            id,
            label: d.code,
            colour: team(d.team_now).colour,
            values: site.season.progress.drivers[id],
            mine: id === followId,
          };
        });
    }
    const myTeam = driver(followId).team_now;
    return site.season.constructors.slice(0, 6).map((c) => ({
      id: c.constructor_id,
      label: team(c.constructor_id).short,
      colour: team(c.constructor_id).colour,
      values: site.season.progress.constructors[c.constructor_id] ?? [],
      mine: c.constructor_id === myTeam,
    }));
  }, [kind, followId]);

  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const x = (i: number) => PAD.l + (i / Math.max(1, rounds.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - (v / max) * (H - PAD.t - PAD.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round((max * f) / 10) * 10);

  // End labels: keep at least 16 units apart so close finishers don't overlap.
  const labelY = new Map<string, number>();
  {
    const ends = series
      .map((s) => ({ id: s.id, y: y(s.values[s.values.length - 1] ?? 0) }))
      .sort((a, b) => a.y - b.y);
    let prev = -Infinity;
    for (const e of ends) {
      const v = Math.max(e.y, prev + 16);
      labelY.set(e.id, v);
      prev = v;
    }
  }

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const fx = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((fx - PAD.l) / (W - PAD.l - PAD.r)) * (rounds.length - 1));
    setHover(Math.max(0, Math.min(rounds.length - 1, i)));
  };

  const tipLeft = hover === null ? 0 : (x(hover) / W) * 100;
  const sorted = hover === null ? [] : [...series].sort((a, b) => b.values[hover] - a.values[hover]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="seg" role="group" aria-label="Championship">
          {(["drivers", "constructors"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
              {k}
            </button>
          ))}
        </div>
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-sub">
          Hover or drag across to read any round
        </span>
      </div>
      <div ref={box} className="relative border-t border-rule pt-6" data-reveal="fade">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full touch-pan-y"
          role="img"
          aria-label={`${kind === "drivers" ? "Drivers'" : "Constructors'"} points after each round of ${site.season.season}`}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--rule)" />
              <text x={W - 6} y={y(t) + 4} textAnchor="end" className="fill-[var(--sub)] font-mono text-[12px]">
                {t}
              </text>
            </g>
          ))}
          {rounds.map((r, i) =>
            i % 2 === 0 || i === rounds.length - 1 ? (
              <text
                key={r}
                x={x(i)}
                y={H - 10}
                textAnchor="middle"
                className="fill-[var(--sub)] font-mono text-[12px]"
              >
                R{r}
              </text>
            ) : null,
          )}
          {hover !== null ? (
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="var(--ink)" strokeOpacity="0.4" />
          ) : null}
          {[...series]
            .sort((a, b) => Number(a.mine) - Number(b.mine))
            .map((s) => {
              const d = s.values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
              const last = s.values.length - 1;
              return (
                <g key={s.id} style={{ "--c": s.colour } as CSSProperties}>
                  <path
                    d={d}
                    fill="none"
                    stroke="var(--c)"
                    strokeWidth={s.mine ? 4 : 2}
                    strokeOpacity={s.mine || hover === null ? 1 : 0.75}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    pathLength={1}
                    className="[stroke-dasharray:1] [stroke-dashoffset:1] [.is-in_&]:animate-[draw_2s_var(--ease-out-expo)_forwards]"
                  />
                  <circle cx={x(last)} cy={y(s.values[last])} r={s.mine ? 6 : 4} fill="var(--c)" />
                  <text
                    x={x(last) + 12}
                    y={(labelY.get(s.id) ?? y(s.values[last])) + 4}
                    className="fill-[var(--ink)] font-mono text-[12px] font-semibold"
                  >
                    {s.label}
                  </text>
                  {hover !== null ? <circle cx={x(hover)} cy={y(s.values[hover])} r={5} fill="var(--c)" /> : null}
                </g>
              );
            })}
        </svg>
        {hover !== null ? (
          <div
            className="pointer-events-none absolute top-6 min-w-[180px] rounded-xl bg-[#0b0c0e] px-3.5 py-3 font-mono text-xs text-[#ecedef] shadow-[0_20px_40px_-16px_rgb(0_0_0/0.5)]"
            style={{
              left: `${tipLeft}%`,
              transform: `translateX(${tipLeft > 60 ? "calc(-100% - 16px)" : "16px"})`,
            }}
          >
            <b className="mb-2 block text-[11px] tracking-[0.14em] text-[#8a9099]">
              R{rounds[hover]} · {names.get(rounds[hover]) ?? ""}
            </b>
            {sorted.map((s) => (
              <div key={s.id} className="flex justify-between gap-4">
                <span>
                  <i className="mr-2 inline-block size-2 rounded-sm" style={{ background: s.colour }} />
                  {s.label}
                </span>
                <span className="tabular-nums">{s.values[hover]}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
