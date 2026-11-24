"use client";

import type { CSSProperties } from "react";
import { useFollow } from "@/components/follow";
import { Portrait } from "@/components/ui/portrait";
import { currentGrid, pct, site, team, inkOn } from "@/lib/data";

/** The 2026 grid as portraits. Picking one recolours the page in that team's colour. */
export function DriverPicker() {
  const { followId, setFollow } = useFollow();
  const odds = new Map(site.next_race?.odds.map((o) => [o.driver_id, o.p_win]));
  const grid = currentGrid();

  return (
    <div
      role="radiogroup"
      aria-label="Choose a driver to follow"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
    >
      {grid.map((d, i) => {
        const t = team(d.team_now);
        const on = d.id === followId;
        const p = odds.get(d.id);
        return (
          <button
            key={d.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setFollow(d.id)}
            data-cursor={on ? "Yours" : "Follow"}
            data-reveal="fade"
            style={{ "--c": t.colour, "--i": i % 6 } as CSSProperties}
            className={`group relative aspect-[3/4] overflow-hidden rounded-2xl text-left outline-offset-4 transition-[box-shadow,transform] duration-500 ease-expo hover:-translate-y-1 ${
              on ? "shadow-[0_0_0_2px_var(--c)]" : "shadow-[0_0_0_1px_var(--rule)]"
            }`}
          >
            <Portrait
              d={d}
              live={on}
              sizes="(min-width: 1024px) 210px, (min-width: 640px) 30vw, 48vw"
              className="absolute inset-0 transition-transform duration-700 ease-expo group-hover:scale-[1.04]"
            />
            <span
              aria-hidden="true"
              className="absolute right-2 top-0 z-[2] font-display text-[76px] font-extrabold italic leading-none text-transparent opacity-70 [-webkit-text-stroke:1.2px_var(--c)] [font-stretch:70%]"
            >
              {d.number ?? ""}
            </span>
            <span className="absolute inset-x-0 bottom-0 z-[2] grid gap-1 bg-[linear-gradient(0deg,rgb(11_12_14/0.92)_0%,rgb(11_12_14/0.6)_55%,transparent)] p-3.5 pt-12 text-[#ecedef]">
              <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#a4aab2]">
                <i className="size-2.5 rounded-[3px]" style={{ background: t.colour }} />
                {t.name}
              </span>
              <span className="type-code text-[34px] leading-[0.9]">{d.code}</span>
              <span className="flex items-baseline justify-between gap-2">
                <span className="type-voice truncate text-[17px] leading-tight">{d.name}</span>
                {p !== undefined ? <span className="type-data text-xs text-[#a4aab2]">{pct(p)}</span> : null}
              </span>
            </span>
            <span
              aria-hidden="true"
              className={`absolute left-3 top-3 z-[2] rounded-full px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] transition-opacity duration-300 ${
                on ? "opacity-100" : "opacity-0"
              }`}
              style={{ background: t.colour, color: inkOn(t.colour) }}
            >
              Following
            </span>
          </button>
        );
      })}
    </div>
  );
}
