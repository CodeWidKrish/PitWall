"use client";

import { type CSSProperties, useState } from "react";
import { useFollow } from "@/components/follow";
import { Portrait } from "@/components/ui/portrait";
import { currentGrid, driver, type DriverStanding, site, team } from "@/lib/data";

interface Metric {
  label: string;
  get: (s: DriverStanding, id: string) => number | null;
  better: "high" | "low";
  fmt?: (v: number) => string;
}

const METRICS: Metric[] = [
  { label: "Points", get: (s) => s.points, better: "high" },
  { label: "Wins", get: (s) => s.wins, better: "high" },
  { label: "Podiums", get: (s) => s.podiums, better: "high" },
  { label: "Poles", get: (s) => s.poles, better: "high" },
  { label: "Avg finish", get: (s) => s.avg_finish, better: "low", fmt: (v) => v.toFixed(1) },
  { label: "Avg grid", get: (s) => s.avg_quali, better: "low", fmt: (v) => v.toFixed(1) },
  { label: "Retirements", get: (s) => s.dnfs, better: "low" },
  { label: "Wins since 2018", get: (_, id) => driver(id).career_since_2018.wins, better: "high" },
];

/** Any two drivers' 2026 seasons side by side. */
export function HeadToHead() {
  const { followId } = useFollow();
  const grid = currentGrid();
  const [a, setA] = useState<string | null>(null);
  const [b, setB] = useState<string | null>(null);
  const left = a ?? followId;
  const right = b ?? (grid.find((d) => d.id !== left && d.team_now === driver(left).team_now)?.id ?? grid[1].id);
  const stand = new Map(site.season.drivers.map((s) => [s.driver_id, s]));
  const sa = stand.get(left);
  const sb = stand.get(right);
  const da = driver(left);
  const db = driver(right);
  const ca = team(da.team_now).colour;
  const cb = team(db.team_now).colour;

  let scoreA = 0;
  let scoreB = 0;
  const rows = METRICS.map((m) => {
    const va = sa ? m.get(sa, left) : null;
    const vb = sb ? m.get(sb, right) : null;
    let win: "a" | "b" | null = null;
    if (va !== null && vb !== null && va !== vb) {
      win = (m.better === "high" ? va > vb : va < vb) ? "a" : "b";
      if (win === "a") scoreA++;
      else scoreB++;
    }
    const scale = Math.max(Math.abs(va ?? 0), Math.abs(vb ?? 0), 1e-9);
    return { m, va, vb, win, wa: ((va ?? 0) / scale) * 100, wb: ((vb ?? 0) / scale) * 100 };
  });

  const options = grid.map((d) => (
    <option key={d.id} value={d.id}>
      {d.code} · {d.last_name || d.name}
    </option>
  ));
  const fmt = (m: Metric, v: number | null) => (v === null ? "—" : m.fmt ? m.fmt(v) : String(v));
  const lead = scoreA === scoreB ? null : scoreA > scoreB ? da : db;

  return (
    <div className="panel p-5 md:p-7">
      <div className="mb-7 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-4">
        {[
          { d: da, set: setA, value: left, c: ca, align: "" },
          null,
          { d: db, set: setB, value: right, c: cb, align: "items-end text-right" },
        ].map((side, i) =>
          side ? (
            <div key={i} className={`grid gap-3 ${side.align}`} style={{ "--c": side.c } as CSSProperties}>
              <Portrait
                d={side.d}
                live
                sizes="120px"
                className={`aspect-square w-[clamp(72px,10vw,120px)] rounded-2xl ${i === 2 ? "justify-self-end" : ""}`}
              />
              <span className="type-code text-[clamp(52px,8vw,104px)] leading-[0.85] text-[var(--c)]">{side.d.code}</span>
              <select
                className="select max-w-[240px] justify-self-stretch"
                aria-label={i === 0 ? "Left driver" : "Right driver"}
                value={side.value}
                onChange={(e) => side.set(e.target.value)}
              >
                {options}
              </select>
            </div>
          ) : (
            <span key={i} className="type-voice pb-16 text-4xl text-sub">
              vs
            </span>
          ),
        )}
      </div>

      <div>
        {rows.map(({ m, va, vb, win, wa, wb }) => (
          <div
            key={m.label}
            className="grid grid-cols-[48px_minmax(0,1fr)_48px] items-center gap-2 border-t border-rule py-2.5 md:grid-cols-[64px_minmax(0,1fr)_150px_minmax(0,1fr)_64px] md:gap-3.5"
          >
            <span className={`type-data text-base ${win === "a" ? "font-semibold text-ink" : "text-sub"}`}>
              {fmt(m, va)}
            </span>
            <span className="flex h-3 justify-end overflow-hidden rounded-full bg-rule max-md:hidden">
              <i
                className="block h-full rounded-full transition-[width] duration-700 ease-expo"
                style={{ width: `${Math.max(0, wa)}%`, background: ca }}
              />
            </span>
            <span className="text-center font-mono text-[11px] uppercase tracking-[0.12em] text-sub">{m.label}</span>
            <span className="flex h-3 overflow-hidden rounded-full bg-rule max-md:hidden">
              <i
                className="block h-full rounded-full transition-[width] duration-700 ease-expo"
                style={{ width: `${Math.max(0, wb)}%`, background: cb }}
              />
            </span>
            <span className={`type-data text-right text-base ${win === "b" ? "font-semibold text-ink" : "text-sub"}`}>
              {fmt(m, vb)}
            </span>
          </div>
        ))}
      </div>
      <p className="type-voice mt-6 text-2xl leading-tight">
        {left === right
          ? "Same driver on both sides. Pick someone else."
          : lead
            ? `${lead.last_name} leads ${Math.max(scoreA, scoreB)}–${Math.min(scoreA, scoreB)} on these ${site.season.season} numbers.`
            : `Dead level, ${scoreA}–${scoreB}, on these ${site.season.season} numbers.`}
      </p>
    </div>
  );
}
