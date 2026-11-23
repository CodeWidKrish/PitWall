import type { CSSProperties } from "react";
import { Countdown } from "@/components/site/countdown";
import { RaceStage } from "@/components/site/race-stage";
import { CountUp } from "@/components/ui/count-up";
import { Portrait } from "@/components/ui/portrait";
import { Line } from "@/components/ui/reveal";
import { driver, pct, shortRaceName, site, team } from "@/lib/data";

/**
 * Opening shot: a live 3D race of the model's top ten under the floodlights,
 * the next race's favourite, and every driver's win odds rolling along the bottom.
 */
export function Hero() {
  const race = site.next_race;
  if (!race) return null;
  const fav = race.odds[0];
  const d = driver(fav.driver_id);
  const t = team(fav.team);
  const title = site.forecast?.drivers.find((r) => r.driver_id === d.id);
  const lastWinner = race.last_winner ? driver(race.last_winner.driver_id) : null;
  const name = shortRaceName(race.race_name);
  const after = site.data_through;

  return (
    <section
      id="top"
      data-cam="tv"
      aria-label={`${race.race_name} forecast`}
      className="theme-night relative isolate h-[max(720px,100svh)] max-h-[1100px] overflow-hidden bg-[radial-gradient(60%_60%_at_70%_40%,rgb(143_69_255/0.22),transparent),#0b0c0e]"
      style={{ "--c": t.colour } as CSSProperties}
    >
      <RaceStage />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1] bg-[linear-gradient(90deg,rgb(11_12_14/0.88)_0%,rgb(11_12_14/0.4)_34%,transparent_60%),linear-gradient(0deg,rgb(11_12_14/0.96)_0%,transparent_40%),linear-gradient(180deg,rgb(11_12_14/0.65)_0%,transparent_18%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(120%_90%_at_55%_45%,transparent_55%,rgb(0_0_0/0.6))]"
      />

      {/* Favourite card */}
      <aside
        aria-label="Race favourite"
        className="hero-fav absolute right-[max(20px,calc((100vw-1280px)/2+20px))] top-[104px] z-[3] w-[340px] rounded-2xl border border-white/10 bg-[rgb(18_20_23/0.62)] p-5 backdrop-blur-xl max-lg:hidden"
      >
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-sub">
          <span>Race favourite · R{race.round}</span>
          <span className="pill best">Top odds</span>
        </div>
        <div className="mt-3.5 flex items-end justify-between gap-3">
          <p className="flex items-start font-display text-[100px] font-extrabold leading-[0.82] tracking-[-0.02em] [font-stretch:70%]">
            <CountUp value={fav.p_win * 100} decimals={1} />
            <small className="type-voice ml-1 text-[0.42em] text-accent">%</small>
          </p>
          <Portrait d={d} live sizes="80px" className="aspect-[3/4] w-[72px] flex-none rounded-lg" />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className="h-[30px] w-[5px] flex-none rounded-sm" style={{ background: t.colour }} />
          <div>
            <strong className="type-voice block text-[26px] leading-none">{d.name}</strong>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-sub">{t.name}</span>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-3 border-t border-white/10">
          {[
            ["Podium", pct(fav.p_podium, 0)],
            [`${site.forecast?.season ?? ""} title`, title ? pct(title.p_title, 0) : "—"],
            ["Won here", lastWinner ? `${lastWinner.code} '${String(race.last_winner!.season).slice(2)}` : "—"],
          ].map(([k, v]) => (
            <div key={k} className="grid gap-1.5 pt-3">
              <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-sub">{k}</dt>
              <dd className="type-data text-lg">{v}</dd>
            </div>
          ))}
        </dl>
      </aside>

      {/* Headline */}
      <div className="hero-copy pointer-events-none absolute inset-x-0 bottom-[86px] z-[3]">
        <div className="wrap grid gap-7">
          <span className="tag text-sub" data-reveal="fade">
            Next race · Round {race.round} · {race.locality}
          </span>
          <h1 className="text-[clamp(60px,10vw,164px)] leading-[0.84]" data-reveal="lines">
            <Line i={0}>
              <span className="type-voice">Who</span> <span className="type-display">wins</span>
            </Line>
            <Line i={1}>
              <span className="type-display text-transparent [-webkit-text-stroke:2px_var(--accent)]">{name}?</span>
            </Line>
          </h1>
          <div
            className="flex flex-wrap items-end gap-x-10 gap-y-5 [&_a]:pointer-events-auto"
            data-reveal="fade"
            style={{ "--i": 3 } as CSSProperties}
          >
            <a href="#odds" className="btn btn-primary" data-cursor="Go">
              <span className="lbl">
                <i>See every driver&apos;s odds</i>
                <i>See every driver&apos;s odds</i>
              </span>
              <span className="dot" />
            </a>
            {race.start_utc ? <Countdown startUtc={race.start_utc} /> : null}
            <p className="max-w-[36ch] text-[14px] text-[#a4aab2] max-md:hidden">
              Odds from a model trained on every race since 2018, with results up to the {after.race_name} (Round{" "}
              {after.round}). The race behind is a simulation of its top ten.
            </p>
          </div>
        </div>
      </div>

      {/* Odds ticker */}
      <div className="hero-ticker ticker absolute inset-x-0 bottom-0 z-[3] overflow-hidden whitespace-nowrap border-t border-white/10 bg-[rgb(11_12_14/0.6)] backdrop-blur-md">
        <div className="ticker-track py-4" aria-label="Win odds for every driver">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex" aria-hidden={copy === 1}>
              {race.odds.map((o) => {
                const od = driver(o.driver_id);
                return (
                  <span key={o.driver_id} className="inline-flex items-baseline gap-3 border-r border-white/10 px-6">
                    <i className="h-2.5 w-1 self-center rounded-sm" style={{ background: team(o.team).colour }} />
                    <span className="type-code text-[22px] leading-none">{od.code}</span>
                    <span className="type-data text-sm">{pct(o.p_win)}</span>
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
