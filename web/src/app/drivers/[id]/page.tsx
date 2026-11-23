import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { DriverActions } from "@/components/site/driver-actions";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { Portrait } from "@/components/ui/portrait";
import { driver, pct, shortRaceName, site, team } from "@/lib/data";
import { inField, profile, profileIds } from "@/lib/profile";

export function generateStaticParams() {
  return profileIds().map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps<"/drivers/[id]">): Promise<Metadata> {
  const { id } = await params;
  const p = profile(id);
  if (!p) return {};
  const odds = p.odds && p.race ? `${pct(p.odds.p_win)} to win ${shortRaceName(p.race.race_name)}` : null;
  const description = [
    odds,
    p.standing ? `P${p.standing.position} in ${site.season.season} with ${p.standing.points} points` : null,
    p.title ? `${pct(p.title.p_title)} for the ${site.forecast?.season} title` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return { title: p.d.name, description, openGraph: { title: `${p.d.name} · PitWall`, description } };
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

function fmt(key: string, v: number | null) {
  if (v === null) return "—";
  if (key === "elo") return Math.round(v).toString();
  if (key.includes("rate")) return pct(v, 0);
  return v.toFixed(1);
}

export default async function DriverPage({ params }: PageProps<"/drivers/[id]">) {
  const { id } = await params;
  const p = profile(id);
  if (!p) notFound();
  const { d, t, race, odds, standing } = p;
  const ids = profileIds().filter((x) => site.drivers[x]?.team_now);
  const at = ids.indexOf(id);
  const prev = at > 0 ? driver(ids[at - 1]) : null;
  const next = at >= 0 && at < ids.length - 1 ? driver(ids[at + 1]) : null;
  const maxPts = Math.max(25, ...p.perRound);

  return (
    <>
      <SiteHeader home={false} />
      <main id="main" className="flex-1" style={{ "--c": t.colour } as CSSProperties}>
        {/* Hero */}
        <section className="theme-night relative overflow-hidden pb-16 pt-32 md:pt-40" aria-labelledby="drv-h">
          <span
            aria-hidden="true"
            className="type-display pointer-events-none absolute -right-6 top-24 select-none text-[clamp(160px,26vw,420px)] leading-none text-transparent opacity-40 [-webkit-text-stroke:1px_var(--c)]"
          >
            {d.number ?? d.code}
          </span>
          <div className="wrap relative grid items-end gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <Portrait d={d} live preload sizes="(min-width: 1024px) 40vw, 90vw" className="aspect-[4/5] w-full max-w-[460px] rounded-3xl [animation:heroIn_1s_var(--ease-out-expo)_both]" />
            <div className="grid gap-7">
              <span className="tag [animation:heroIn_1s_var(--ease-out-expo)_.1s_both]">
                {team(d.team_now ?? d.team_next).name}
                {d.number ? ` · #${d.number}` : ""}
                {d.nationality ? ` · ${d.nationality}` : ""}
              </span>
              <h1 id="drv-h" className="text-[clamp(56px,8vw,128px)] leading-[0.86] [animation:heroIn_1s_var(--ease-out-expo)_.2s_both]">
                <span className="type-voice block">{d.first_name || d.name.split(" ")[0]}</span>
                <span className="type-display block text-[var(--c)]">{d.last_name || d.name}</span>
              </h1>
              <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-rule bg-rule sm:grid-cols-5 [animation:heroIn_1s_var(--ease-out-expo)_.3s_both]">
                {[
                  [standing ? ordinal(standing.position) : "—", `${site.season.season} standing`],
                  [standing ? String(standing.points) : "—", "Points"],
                  [standing ? String(standing.wins) : "—", "Wins"],
                  [standing ? String(standing.podiums) : "—", "Podiums"],
                  [standing ? String(standing.poles) : "—", "Poles"],
                ].map(([v, k]) => (
                  <div key={k} className="grid gap-1 bg-paper p-4">
                    <dd className="type-display text-[clamp(26px,3vw,40px)] leading-none">{v}</dd>
                    <dt className="order-first font-mono text-[10px] uppercase tracking-[0.14em] text-sub">{k}</dt>
                  </div>
                ))}
              </dl>
              <div className="[animation:heroIn_1s_var(--ease-out-expo)_.4s_both]">
                <DriverActions id={id} name={d.name} last={d.last_name || d.name} />
              </div>
            </div>
          </div>
        </section>

        {/* Next race */}
        {race && odds ? (
          <section className="theme-day section" aria-labelledby="drv-next">
            <div className="wrap grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <div className="grid content-start gap-5">
                <span className="tag">
                  Next race · {shortRaceName(race.race_name)} · {race.stage === "post_quali" ? "grid set" : "before qualifying"}
                </span>
                <h2 id="drv-next" className="sr-only">
                  {d.name} at {race.race_name}
                </h2>
                <p className="type-display text-[clamp(96px,12vw,180px)] leading-[0.8]">{pct(odds.p_win)}</p>
                <p className="max-w-[36ch] text-lg text-sub">
                  Chance to win, {ordinal(p.oddsRank ?? 0)} in the field. Podium {pct(odds.p_podium, 0)}
                  {odds.quali_position ? `, starting P${odds.quali_position}` : ""}.
                </p>
              </div>
              <dl className="grid content-start gap-3.5" data-reveal="list">
                {race.inputs.map((inp, i) => {
                  const f = inField(race, id, inp.key, inp.higher_is_better);
                  return (
                    <div key={inp.key} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_64px_70px] items-center gap-3 border-b border-rule pb-3.5 text-sm">
                      <dt>{inp.label}</dt>
                      <span className="h-2 overflow-hidden rounded-full bg-rule" aria-hidden="true">
                        {f.share !== null ? <i className="bar-fill" style={{ "--w": `${Math.max(4, f.share * 100)}%`, "--i": i } as CSSProperties} /> : null}
                      </span>
                      <dd className="type-data text-right">{fmt(inp.key, f.value)}</dd>
                      <span className="text-right font-mono text-[10px] uppercase tracking-[0.1em] text-sub">{f.rank ? `${ordinal(f.rank)} / ${f.of}` : ""}</span>
                    </div>
                  );
                })}
                <p className="pt-2 text-sm text-sub">Where {d.last_name} sits in this weekend&apos;s field on each input the model reads. It weighs them together.</p>
              </dl>
            </div>
          </section>
        ) : null}

        {/* Season */}
        {standing ? (
          <section className="theme-night section" aria-labelledby="drv-season">
            <div className="wrap grid gap-12">
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div className="grid gap-4">
                  <span className="tag">{site.season.season} · points race by race</span>
                  <h2 id="drv-season" className="type-voice text-[clamp(36px,4.4vw,64px)] leading-none">
                    {standing.points} points, {ordinal(standing.position)}
                  </h2>
                </div>
                {p.mate ? (
                  <Link href={`/drivers/${p.mate.d.id}`} className="panel grid gap-1 p-4 transition-colors hover:border-ink">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-sub">Teammate</span>
                    <span className="type-voice text-xl leading-none">
                      {p.mate.d.name} · {p.mate.s.points} pts
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-sub">
                      {standing.points >= p.mate.s.points ? `${d.code} ahead by ${standing.points - p.mate.s.points}` : `${d.code} behind by ${p.mate.s.points - standing.points}`}
                    </span>
                  </Link>
                ) : null}
              </div>
              <div className="flex h-56 items-end gap-[3px] border-b border-rule" role="img" aria-label={`Points per round: ${p.perRound.join(", ")}`} data-reveal="list">
                {p.perRound.map((v, i) => (
                  <div key={i} className="group relative flex h-full flex-1 flex-col justify-end" title={`Round ${p.rounds[i]}: ${v} points`}>
                    <span
                      className="block rounded-t-[3px] bg-[var(--c)] opacity-80 transition-[opacity,height] duration-700 ease-expo group-hover:opacity-100"
                      style={{ height: `${Math.max(1.5, (v / maxPts) * 100)}%`, transitionDelay: `${i * 25}ms` }}
                    />
                    <span className="absolute -top-6 left-1/2 hidden -translate-x-1/2 font-mono text-[10px] text-ink group-hover:block">{v}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-sub">
                <span>Round {p.rounds[0]}</span>
                <span>Round {p.rounds[p.rounds.length - 1]}</span>
              </div>
            </div>
          </section>
        ) : null}

        {/* The model on this driver, and next season */}
        <section className="theme-day section" aria-labelledby="drv-model">
          <div className="wrap grid gap-10 md:grid-cols-2">
            <article className="panel grid content-start gap-5 p-7">
              <span className="tag">The model on {d.last_name}</span>
              <h2 id="drv-model" className="sr-only">
                The model&apos;s record on {d.name}
              </h2>
              <ul className="grid gap-4 text-[17px]">
                <li>
                  Favourite after qualifying <strong className="type-data">{p.model.favourite}</strong> time{p.model.favourite === 1 ? "" : "s"} this season,
                  right <strong className="type-data">{p.model.favouriteHits}</strong>.
                </li>
                <li>
                  Won <strong className="type-data">{p.model.wins}</strong> race{p.model.wins === 1 ? "" : "s"}; the model had {d.last_name} as favourite for{" "}
                  <strong className="type-data">{p.model.calledWins}</strong>
                  {p.model.avgChanceWhenWon !== null ? `, giving ${pct(p.model.avgChanceWhenWon, 0)} on average` : ""}.
                </li>
                <li>Career since 2018: {d.career_since_2018.starts} starts, {d.career_since_2018.wins} wins, {d.career_since_2018.podiums} podiums.</li>
              </ul>
            </article>
            <article className="panel grid content-start gap-5 p-7">
              <span className="tag">{site.forecast?.season ?? "Next"} season</span>
              {p.title ? (
                <>
                  <p className="type-display text-[clamp(64px,8vw,110px)] leading-[0.85]">{pct(p.title.p_title)}</p>
                  <p className="text-[17px] text-sub">
                    Title chance, {ordinal(p.titleRank ?? 0)} of {site.forecast?.drivers.length}, from {site.forecast?.simulations.toLocaleString("en-GB")} simulated seasons.
                    Expected {Math.round(p.title.expected_points)} points with {team(d.team_next).name}
                    {d.seat_status && d.seat_status !== "confirmed" ? ` (seat ${d.seat_status})` : ""}.
                  </p>
                </>
              ) : (
                <p className="text-[17px] text-sub">No confirmed seat for next season in PitWall&apos;s data.</p>
              )}
            </article>
          </div>
        </section>

        <nav aria-label="More drivers" className="theme-night border-t border-rule">
          <div className="wrap flex flex-wrap items-center justify-between gap-4 py-10 font-mono text-[11px] uppercase tracking-[0.14em]">
            {prev ? <Link href={`/drivers/${prev.id}`} className="hover:text-[var(--you)]">← {prev.name}</Link> : <span />}
            <Link href="/#drivers" className="text-sub hover:text-ink">All drivers</Link>
            {next ? <Link href={`/drivers/${next.id}`} className="hover:text-[var(--you)]">{next.name} →</Link> : <span />}
          </div>
        </nav>
      </main>
      <SiteFooter />
    </>
  );
}
