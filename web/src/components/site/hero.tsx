import type { CSSProperties } from "react";
import { Countdown } from "@/components/site/countdown";
import { RaceStage } from "@/components/site/race-stage";
import { CountUp } from "@/components/ui/count-up";
import { Portrait } from "@/components/ui/portrait";
import { Line } from "@/components/ui/reveal";
import { driver, pct, shortRaceName, site, team } from "@/lib/data";

/**
 * Opening shot: the race fills the screen; the question, the countdown and the model's
 * top three sit on the glass at the bottom, out of the cars' way.
 */
export function Hero() {
  const race = site.next_race;
  if (!race) return null;
  const top = race.odds.slice(0, 3);
  const name = shortRaceName(race.race_name);
  const best = top[0]?.p_win ?? 1;

  return (
    <section
      id="top"
      data-cam="tv"
      aria-label={`${race.race_name} forecast`}
      className="theme-night relative isolate h-[max(680px,100svh)] max-h-[1100px] overflow-hidden bg-[#0b0c0e]"
    >
      <RaceStage />
      {/* a soft floor of shade so the words read, the race stays clear above */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1] bg-[linear-gradient(0deg,rgb(11_12_14/0.94)_0%,rgb(11_12_14/0.55)_26%,transparent_48%),linear-gradient(180deg,rgb(11_12_14/0.55)_0%,transparent_16%)]"
      />

      <div className="hero-copy pointer-events-none absolute inset-x-0 bottom-0 z-[3] pb-[max(28px,env(safe-area-inset-bottom))]">
        <div className="wrap grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* the question */}
          <div className="grid gap-5">
            <span className="tag text-[#a4aab2] [animation:heroIn_1s_var(--ease-out-expo)_0.1s_both]">
              Round {race.round} · {race.locality}
              {race.has_sprint ? " · Sprint weekend" : ""}
            </span>
            <h1 className="text-[clamp(52px,7.4vw,118px)] leading-[0.86]" data-reveal="lines">
              <Line i={0}>
                <span className="type-voice">Who wins</span>{" "}
                <span className="type-display text-transparent [-webkit-text-stroke:2px_var(--accent)]">{name}?</span>
              </Line>
            </h1>
            <div
              className="flex flex-wrap items-center gap-x-8 gap-y-4 [animation:heroIn_1s_var(--ease-out-expo)_0.35s_both] [&_a]:pointer-events-auto"
            >
              <a href="#odds" className="btn btn-primary" data-cursor="Go">
                <span className="lbl">
                  <i>See the full grid</i>
                  <i>See the full grid</i>
                </span>
                <span className="dot" />
              </a>
              <a href="#game" className="btn btn-line !text-[#ecedef] ![box-shadow:inset_0_0_0_1px_rgb(236_237_239/0.5)]" data-cursor="Play">
                <span className="lbl">
                  <i>Make your call</i>
                  <i>Make your call</i>
                </span>
              </a>
              {race.start_utc ? <Countdown startUtc={race.start_utc} /> : null}
            </div>
          </div>

          {/* the model's top three */}
          <div
            role="group"
            aria-label="The model's favourites"
            className="hero-fav pointer-events-auto rounded-2xl border border-white/10 bg-[rgb(14_15_18/0.6)] p-4 backdrop-blur-xl [animation:heroIn_1.1s_var(--ease-out-expo)_0.5s_both] max-lg:hidden"
          >
            <div className="mb-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-[#8a9099]">
              <span>Model&apos;s favourites</span>
              <span>Win chance</span>
            </div>
            <ol className="grid gap-2.5">
              {top.map((o, i) => {
                const d = driver(o.driver_id);
                const t = team(o.team);
                return (
                  <li key={o.driver_id} className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3" style={{ "--c": t.colour } as CSSProperties}>
                    <Portrait d={d} live sizes="40px" className="aspect-square w-10 rounded-lg" />
                    <span className="grid gap-1.5">
                      <span className="flex items-baseline gap-2">
                        <span className="type-code text-lg leading-none">{d.code}</span>
                        <span className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-[#8a9099]">{t.name}</span>
                      </span>
                      <span className="h-1 overflow-hidden rounded-full bg-white/10">
                        <i className="block h-full rounded-full bg-[var(--c)]" style={{ width: `${(o.p_win / best) * 100}%` }} />
                      </span>
                    </span>
                    <span className={`type-data text-right ${i === 0 ? "text-2xl" : "text-lg text-[#c4c8ce]"}`}>
                      {i === 0 ? <CountUp value={o.p_win * 100} decimals={1} /> : (o.p_win * 100).toFixed(1)}%
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="mt-3 border-t border-white/10 pt-3 text-[12px] leading-snug text-[#8a9099]">
              Podium for {driver(top[0].driver_id).code}: {pct(top[0].p_podium, 0)}. The race behind is a physics
              simulation of the top ten.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
