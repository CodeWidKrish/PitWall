import type { CSSProperties } from "react";
import { D, SectionHead, V } from "@/components/ui/reveal";
import circuits from "@/data/circuits.json";
import { Portrait } from "@/components/ui/portrait";
import { driver, pct, site, team } from "@/lib/data";

interface Circuit {
  name: string;
  length_m: number | null;
  path: string;
  start: [number, number];
}

const STATUS_NOTE: Record<string, string> = {
  expected: "Seat reported, not announced",
  assumed: "Seat open: 2026 driver kept as a placeholder",
};

/** 2027 title odds for both championships, before a wheel has turned. */
export function Forecast() {
  const f = site.forecast;
  if (!f) return null;
  const top = f.drivers.slice(0, 10);
  const rest = f.drivers.slice(10);
  const best = f.drivers[0]?.p_title ?? 1;
  const bestTeam = f.constructors[0]?.p_title ?? 1;
  const favourite = driver(f.drivers[0].driver_id);

  return (
    <section id="forecast" className="theme-night section overflow-hidden" aria-labelledby="forecast-h">
      <div className="wrap">
        <SectionHead
          id="forecast-h"
          tag={`${f.season} forecast · ${f.simulations.toLocaleString("en-GB")} simulated seasons`}
          lines={[
            <span key="a">
              <V>Who wins</V>
            </span>,
            <span key="b">
              <D>{f.season}?</D>
            </span>,
          ]}
          lede={
            <>
              Every race of next season simulated {f.simulations.toLocaleString("en-GB")} times, sprints included,
              with room for any team to find or lose pace over the winter. Odds firm up once real results arrive.
            </>
          }
        />

        <div className="grid gap-16 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div>
            <div className="mb-8 flex items-end gap-6">
              <Portrait d={favourite} live sizes="150px" className="aspect-[3/4] w-[clamp(110px,12vw,150px)] rounded-2xl" />
              <div>
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-sub">Title favourite</span>
                <p className="mt-2 font-display text-[clamp(84px,11vw,150px)] font-extrabold leading-[0.8] tracking-[-0.02em] [font-stretch:70%]">
                  {(f.drivers[0].p_title * 100).toFixed(0)}
                  <small className="type-voice ml-1 text-[0.32em] text-accent">%</small>
                </p>
                <p className="type-voice mt-2 text-2xl">{favourite.name}</p>
              </div>
            </div>
            <h3 className="mb-4 font-mono text-[11px] uppercase tracking-[0.16em] text-sub">Drivers&apos; championship</h3>
            <ol className="grid gap-2.5" data-reveal="list">
              {top.map((r, i) => {
                const t = team(r.team);
                const note = STATUS_NOTE[r.seat_status];
                return (
                  <li
                    key={r.driver_id}
                    className="grid grid-cols-[52px_minmax(0,1fr)_72px] items-center gap-4 md:grid-cols-[60px_minmax(0,1fr)_84px]"
                    style={{ "--c": t.colour, "--i": i } as CSSProperties}
                  >
                    <span className="type-code text-[28px] leading-[0.9]">{r.code}</span>
                    <span className="relative h-11 overflow-hidden rounded-[10px] border border-rule bg-panel">
                      <i
                        className="bar-fill absolute inset-y-0 left-0 rounded-[9px]"
                        style={{ "--w": `${Math.max(2, (r.p_title / best) * 100)}%` } as CSSProperties}
                      />
                      <span className="absolute inset-y-0 left-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] text-[#0b0c0e] mix-blend-normal">
                        <span className="rounded bg-[rgb(255_255_255/0.85)] px-1.5 py-0.5">{t.name}</span>
                        {note ? (
                          <span className="rounded bg-[rgb(11_12_14/0.75)] px-1.5 py-0.5 text-[#ecedef]" title={note}>
                            {r.seat_status}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="type-data text-right text-2xl">{pct(r.p_title, r.p_title < 0.1 ? 1 : 0)}</span>
                  </li>
                );
              })}
            </ol>
            {rest.length ? (
              <p className="mt-5 font-mono text-xs leading-relaxed text-sub">
                {rest.map((r) => `${r.code} ${pct(r.p_title)}`).join(" · ")}
              </p>
            ) : null}
          </div>

          <div>
            <h3 className="mb-4 font-mono text-[11px] uppercase tracking-[0.16em] text-sub">
              Constructors&apos; championship
            </h3>
            <ol className="grid gap-2.5" data-reveal="list">
              {f.constructors.map((r, i) => {
                const t = team(r.constructor_id);
                return (
                  <li
                    key={r.constructor_id}
                    className="grid grid-cols-[minmax(0,1fr)_64px] items-center gap-4 border-t border-rule pt-2.5"
                    style={{ "--c": t.colour, "--i": i } as CSSProperties}
                  >
                    <span className="grid gap-2">
                      <span className="flex justify-between text-[15px]">
                        {t.name}
                        <span className="font-mono text-xs text-sub">{Math.round(r.expected_points)} pts exp.</span>
                      </span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-rule">
                        <i
                          className="bar-fill"
                          style={{ "--w": `${Math.max(1, (r.p_title / bestTeam) * 100)}%` } as CSSProperties}
                        />
                      </span>
                    </span>
                    <span className="type-data text-right text-xl">{pct(r.p_title, r.p_title < 0.1 ? 1 : 0)}</span>
                  </li>
                );
              })}
            </ol>
            <p className="mt-8 max-w-[52ch] text-sm leading-relaxed text-sub">
              Line-ups follow the latest reports; seats marked <em>expected</em> are reported but not announced, and{" "}
              <em>assumed</em> seats are still open, so the 2026 driver stands in. The calendar order is official, the
              dates are not yet.
            </p>
          </div>
        </div>
      </div>

      {/* 2027 calendar */}
      <div className="mt-28">
        <div className="wrap mb-8 flex flex-wrap items-end justify-between gap-4">
          <span className="tag">
            {f.season} calendar · {f.calendar.length} rounds · {f.calendar.filter((r) => r.has_sprint).length} sprints
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-sub">Drag or scroll sideways →</span>
        </div>
        <ol className="rail pb-4" aria-label={`${f.season} calendar`}>
          {f.calendar.map((r) => {
            const c = (circuits.circuits as unknown as Record<string, Circuit>)[r.circuit_id];
            return (
              <li
                key={r.round}
                className="group relative flex h-[360px] w-[260px] flex-col justify-between overflow-hidden rounded-2xl border border-rule bg-panel p-[18px] transition-[transform,border-color] duration-500 ease-expo hover:-translate-y-1.5 hover:border-[var(--accent)]"
              >
                <span className="flex items-center justify-between font-mono text-[11px] tracking-[0.14em] text-sub">
                  <span>ROUND {String(r.round).padStart(2, "0")}</span>
                  {r.has_sprint ? (
                    <span className="rounded border border-current px-1.5 py-1 text-[9px] font-semibold text-accent">
                      SPRINT
                    </span>
                  ) : null}
                </span>
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3 top-10 font-display text-[92px] font-extrabold leading-[0.8] text-transparent opacity-20 [-webkit-text-stroke:1.2px_var(--ink)] [font-stretch:70%]"
                >
                  {String(r.round).padStart(2, "0")}
                </span>
                {c ? (
                  <svg viewBox="0 0 100 100" className="mx-auto mt-2 h-[150px] w-[150px] overflow-visible" role="img" aria-label={`${c.name} layout`}>
                    <path d={c.path} fill="none" stroke="var(--rule)" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
                    <path
                      d={c.path}
                      fill="none"
                      stroke="var(--ink)"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      pathLength={1}
                      className="[stroke-dasharray:1] [stroke-dashoffset:0] group-hover:animate-[redraw_1.6s_var(--ease-out-expo)]"
                    />
                    <circle cx={c.start[0]} cy={c.start[1]} r="2.6" fill="var(--accent)" />
                  </svg>
                ) : (
                  <span className="h-[150px]" />
                )}
                <span>
                  <strong className="type-voice block text-[28px] font-normal leading-none">{r.country}</strong>
                  <span className="mt-2 block font-mono text-[11px] leading-snug text-sub">
                    {c ? c.name : r.race_name}
                    {c?.length_m ? ` · ${(c.length_m / 1000).toFixed(3)} km` : ""}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
