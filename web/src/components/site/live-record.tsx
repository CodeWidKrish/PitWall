import type { CSSProperties } from "react";
import { Countdown } from "@/components/site/countdown";
import { D, SectionHead, V } from "@/components/ui/reveal";
import { type Bin, explain, finalCall, summary } from "@/lib/ledger";
import { driver, pct, shortRaceName, site, team } from "@/lib/data";
import { REPO_URL } from "@/lib/links";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });

/** Reliability diagram: when the model said X%, how often did it happen? */
function Reliability({ bins }: { bins: Bin[] }) {
  const S = 260,
    P = 34,
    max = 0.6;
  const x = (v: number) => P + (Math.min(v, max) / max) * S;
  const y = (v: number) => P + S - (Math.min(v, max) / max) * S;
  const live = bins.filter((b) => b.n > 0);
  const total = live.reduce((a, b) => a + b.n, 0);
  return (
    <figure className="grid gap-3">
      <svg viewBox={`0 0 ${S + P * 2} ${S + P * 2}`} className="w-full max-w-[380px]" role="img" aria-label={
        live.length
          ? `Reliability: ${live.map((b) => `${pct(b.predicted, 0)} predicted, ${pct(b.actual, 0)} happened (${b.n})`).join("; ")}`
          : "Reliability chart, waiting for the first scored race"
      }>
        <rect x={P} y={P} width={S} height={S} rx="6" className="fill-[color-mix(in_oklab,var(--ink)_3%,transparent)] stroke-rule" />
        {[0.2, 0.4].map((g) => (
          <g key={g} className="stroke-rule" strokeDasharray="2 5">
            <line x1={x(g)} y1={P} x2={x(g)} y2={P + S} />
            <line x1={P} y1={y(g)} x2={P + S} y2={y(g)} />
          </g>
        ))}
        {[0, 0.2, 0.4, 0.6].map((g) => (
          <g key={g} className="fill-sub font-mono text-[10px]">
            <text x={x(g)} y={P + S + 16} textAnchor="middle">{`${g * 100}%`}</text>
            <text x={P - 8} y={y(g) + 3} textAnchor="end">{`${g * 100}%`}</text>
          </g>
        ))}
        <line x1={x(0)} y1={y(0)} x2={x(max)} y2={y(max)} className="stroke-sub" strokeDasharray="5 6" />
        <text x={x(0.44)} y={y(0.5)} className="fill-sub font-mono text-[10px]" transform={`rotate(-45 ${x(0.44)} ${y(0.5)})`}>
          perfect
        </text>
        {live.length > 1 ? (
          <polyline
            points={live.map((b) => `${x(b.predicted)},${y(b.actual)}`).join(" ")}
            fill="none"
            className="stroke-[var(--you)] [stroke-dasharray:600] [stroke-dashoffset:600] [animation:draw_1.6s_var(--ease-out-expo)_0.2s_forwards]"
            strokeWidth="2.5"
          />
        ) : null}
        {live.map((b) => (
          <circle
            key={b.lo}
            cx={x(b.predicted)}
            cy={y(b.actual)}
            r={4 + Math.sqrt(b.n / Math.max(1, total)) * 14}
            className="fill-[var(--you)] stroke-ink"
            fillOpacity=".8"
          >
            <title>{`Said ${pct(b.predicted, 0)}, happened ${pct(b.actual, 0)} · ${b.n} drivers`}</title>
          </circle>
        ))}
        {!live.length ? (
          <text x={P + S / 2} y={P + S / 2} textAnchor="middle" className="fill-sub font-mono text-[11px] uppercase tracking-[0.12em]">
            First dots after the first result
          </text>
        ) : null}
      </svg>
      <figcaption className="max-w-[44ch] text-sm text-sub">
        Every driver in every scored race, grouped by the win chance they were given. Dots on the dashed line mean the
        odds were honest.
      </figcaption>
    </figure>
  );
}

/**
 * The live record: forecasts published before each race, frozen at lights out and scored
 * after the result, straight from the ledger in the repository.
 */
export function LiveRecord() {
  const s = summary();
  const rec = site.record?.modes;
  const next = s.pending[s.pending.length - 1];
  const nextCall = next ? finalCall(next) : null;
  const ledgerUrl = `${REPO_URL}/commits/main/web/src/data/ledger.json`;
  const tiles: [string, string, string | null][] = [
    ["Races scored", String(s.races), null],
    ["Favourite won", s.hitRate === null ? "—" : pct(s.hitRate, 0), rec ? pct(rec.post_quali.model.winner_hit, 0) : null],
    ["Winner in top 3", s.top3Rate === null ? "—" : pct(s.top3Rate, 0), rec ? pct(rec.post_quali.model.winner_in_top3, 0) : null],
    ["Brier score", s.brier === null ? "—" : s.brier.toFixed(3), rec ? rec.post_quali.model.brier.toFixed(3) : null],
  ];

  return (
    <section id="live" className="theme-night section" aria-labelledby="live-h">
      <div className="wrap">
        <SectionHead
          id="live-h"
          tag={`Live record · since ${s.since ? new Date(s.since).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "the next race"}`}
          lines={[
            <span key="a">
              <D>Called</D> <V>before,</V>
            </span>,
            <D key="b">scored after</D>,
          ]}
          lede="Every forecast is written to a ledger in the repository before lights out and scored once the result is in. These are live calls through the rest of 2026 and all of 2027, not a backtest."
        />

        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="grid content-start gap-10">
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-rule bg-rule md:grid-cols-4">
              {tiles.map(([k, v, base]) => (
                <div key={k} className="grid content-between gap-6 bg-paper p-5">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-sub">{k}</dt>
                  <dd className="grid gap-1">
                    <span className="type-display text-[clamp(34px,4vw,52px)] leading-none">{v}</span>
                    {base ? <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-sub">Backtest {base}</span> : <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-sub">Live calls</span>}
                  </dd>
                </div>
              ))}
            </dl>

            {next && nextCall ? (
              <article className="panel grid gap-5 p-6" aria-label={`Next call to be scored: ${next.race_name}`}>
                <header className="flex flex-wrap items-baseline justify-between gap-3">
                  <span className="tag">On the record · waiting for the result</span>
                  <a href={ledgerUrl} target="_blank" rel="noreferrer" className="font-mono text-[11px] uppercase tracking-[0.12em] text-sub underline decoration-rule underline-offset-4 hover:text-ink">
                    See every change
                  </a>
                </header>
                <div className="flex flex-wrap items-end justify-between gap-6">
                  <div className="grid gap-1">
                    <h3 className="type-voice text-[clamp(28px,3vw,40px)] leading-none">{shortRaceName(next.race_name)}</h3>
                    <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-sub">
                      Published {when(nextCall.published_at)} · {nextCall.stage === "post_quali" ? "after qualifying" : "before qualifying"}
                    </p>
                  </div>
                  {next.start_utc ? <Countdown startUtc={next.start_utc} /> : null}
                </div>
                <ol className="grid gap-2.5" data-reveal="list">
                  {nextCall.odds.slice(0, 5).map((o, i) => {
                    const d = driver(o.driver_id);
                    const t = team(d.team_now);
                    return (
                      <li key={o.driver_id} className="grid grid-cols-[22px_48px_minmax(0,1fr)_64px] items-center gap-3" style={{ "--c": t.colour } as CSSProperties}>
                        <span className="type-data text-xs text-sub">{i + 1}</span>
                        <span className="type-code text-lg leading-none">{d.code}</span>
                        <span className="h-2 overflow-hidden rounded-full bg-rule">
                          <i className="bar-fill" style={{ "--w": `${(o.p_win / nextCall.odds[0].p_win) * 100}%`, "--i": i } as CSSProperties} />
                        </span>
                        <span className="type-data text-right">{pct(o.p_win)}</span>
                      </li>
                    );
                  })}
                </ol>
              </article>
            ) : null}

            {s.scored.length ? (
              <ol className="grid gap-2" aria-label="Scored calls">
                {[...s.scored].reverse().map((c) => (
                  <li key={`${c.call.season}-${c.call.round}`} className="border-b border-rule">
                    <details className="group">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 py-3 [&::-webkit-details-marker]:hidden">
                    <span className="grid">
                      <span className="type-voice text-xl leading-tight">{shortRaceName(c.call.race_name)} {c.call.season}</span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-sub">
                        Called {driver(c.favourite.driver_id).code} at {pct(c.favourite.p_win, 0)} · won by {driver(c.call.result?.winner).code}
                        {c.p_winner !== null ? ` (${pct(c.p_winner, 0)})` : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className={`pill ${c.hit ? "hit" : c.inTop3 ? "best" : "miss"}`}>{c.hit ? "Hit" : c.inTop3 ? "Top 3" : "Miss"}</span>
                      <span aria-hidden="true" className="font-mono text-lg text-sub transition-transform duration-500 ease-expo group-open:rotate-45">+</span>
                    </span>
                    </summary>
                    <div className="grid max-w-[60ch] gap-1.5 pb-4 text-sm leading-relaxed text-sub">
                      {explain(c, (id) => driver(id).name).map((l) => (
                        <p key={l}>{l}</p>
                      ))}
                    </div>
                    </details>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="max-w-[52ch] text-sm text-sub">
                Nothing scored yet: the ledger started this week. The first result goes in automatically after the race above,
                and every call after it stays on this page, hit or miss.
              </p>
            )}
          </div>

          <Reliability bins={s.bins} />
        </div>
      </div>
    </section>
  );
}
