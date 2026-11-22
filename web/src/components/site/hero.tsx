import Image from "next/image";
import type { CSSProperties } from "react";
import { Countdown } from "@/components/site/countdown";
import { Line } from "@/components/ui/reveal";
import { driver, pct, photoSrc, shortRaceName, site, team } from "@/lib/data";

/**
 * Opening shot: the next race, its favourite in the team colour, the model's
 * win odds for the whole grid rolling along the bottom.
 */
export function Hero() {
  const race = site.next_race;
  if (!race) return null;
  const fav = race.odds[0];
  const d = driver(fav.driver_id);
  const t = team(fav.team);
  const src = photoSrc(d);
  const title = site.forecast?.drivers.find((r) => r.driver_id === d.id);
  const lastWinner = race.last_winner ? driver(race.last_winner.driver_id) : null;
  const name = shortRaceName(race.race_name);
  const after = site.data_through;

  return (
    <section
      id="top"
      aria-label={`${race.race_name} forecast`}
      className="theme-night relative isolate h-[max(720px,100svh)] max-h-[1080px] overflow-hidden"
      style={{ "--c": t.colour } as CSSProperties}
    >
      {src ? (
        <div className="hero-photo" aria-hidden="true">
          <Image src={src} alt="" fill preload sizes="(min-width: 1440px) 920px, 64vw" className="object-cover object-[50%_15%]" />
        </div>
      ) : null}
      <span
        aria-hidden="true"
        className="hero-number pointer-events-none absolute right-[-2vw] top-[8%] z-0 text-[clamp(260px,42vw,640px)] max-md:hidden"
      >
        {d.number ?? ""}
      </span>
      <div className="flare" aria-hidden="true" />
      <div
        aria-hidden="true"
        className="absolute inset-0 z-[1] bg-[linear-gradient(90deg,rgb(11_12_14/0.94)_0%,rgb(11_12_14/0.55)_38%,transparent_66%),linear-gradient(0deg,rgb(11_12_14)_0%,transparent_42%),linear-gradient(180deg,rgb(11_12_14/0.7)_0%,transparent_20%)]"
      />

      {/* Favourite card */}
      <aside
        aria-label="Race favourite"
        data-reveal="fade"
        style={{ "--i": 4 } as CSSProperties}
        className="absolute right-[max(20px,calc((100vw-1280px)/2+20px))] top-[104px] z-[3] w-[340px] rounded-2xl border border-white/10 bg-[rgb(18_20_23/0.62)] p-5 backdrop-blur-xl max-lg:hidden"
      >
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-sub">
          <span>Race favourite</span>
          <span className="pill best">Top odds</span>
        </div>
        <p className="mt-3.5 flex items-start font-display text-[108px] font-extrabold leading-[0.82] tracking-[-0.02em] [font-stretch:70%]">
          {(fav.p_win * 100).toFixed(1)}
          <small className="type-voice ml-1 text-[0.42em] text-accent">%</small>
        </p>
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
      <div className="absolute inset-x-0 bottom-[96px] z-[3]">
        <div className="wrap grid gap-8">
          <span className="tag text-sub" data-reveal="fade">
            Round {race.round} · {race.locality} · {race.has_sprint ? "Sprint weekend" : "Next race"}
          </span>
          <h1 className="text-[clamp(64px,11vw,176px)] leading-[0.84]" data-reveal="lines">
            <Line i={0}>
              <span className="type-voice">Who</span> <span className="type-display">wins</span>
            </Line>
            <Line i={1}>
              <span className="type-display text-transparent [-webkit-text-stroke:2px_var(--accent)]">{name}?</span>
            </Line>
          </h1>
          <div className="flex flex-wrap items-end gap-x-10 gap-y-6" data-reveal="fade" style={{ "--i": 3 } as CSSProperties}>
            <a href="#odds" className="btn btn-primary" data-cursor="Go">
              <span className="lbl">
                <i>See every driver&apos;s odds</i>
                <i>See every driver&apos;s odds</i>
              </span>
              <span className="dot" />
            </a>
            {race.start_utc ? <Countdown startUtc={race.start_utc} /> : null}
            <p className="max-w-[38ch] text-[15px] text-[#a4aab2]">
              Pre-race odds from a model trained on every race since 2018, with results up to the {after.race_name}{" "}
              (Round {after.round}).
            </p>
          </div>
        </div>
      </div>

      {/* Odds ticker */}
      <div className="ticker absolute inset-x-0 bottom-0 z-[3] overflow-hidden whitespace-nowrap border-t border-white/10 bg-[rgb(11_12_14/0.6)] backdrop-blur-md">
        <div className="ticker-track py-[18px]" aria-label="Win odds for every driver">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex" aria-hidden={copy === 1}>
              {race.odds.map((o) => {
                const od = driver(o.driver_id);
                return (
                  <span key={o.driver_id} className="inline-flex items-baseline gap-3 border-r border-white/10 px-6">
                    <i className="h-2.5 w-1 self-center rounded-sm" style={{ background: team(o.team).colour }} />
                    <span className="type-code text-2xl leading-none">{od.code}</span>
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
