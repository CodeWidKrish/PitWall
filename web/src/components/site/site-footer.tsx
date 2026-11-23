import Link from "next/link";
import type { CSSProperties } from "react";
import { Countdown } from "@/components/site/countdown";
import { AddToCalendar } from "@/components/ui/add-to-calendar";
import { Logo, LogoMark } from "@/components/ui/logo";
import { driver, pct, shortRaceName, site, team } from "@/lib/data";
import { REPO_URL } from "@/lib/links";

const COLUMNS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: "Predictions",
    links: [
      { label: "Next race odds", href: "/#odds" },
      { label: "Beat the model", href: "/#game" },
      { label: "2027 title odds", href: "/#forecast" },
      { label: "What-if simulator", href: "/#whatif" },
    ],
  },
  {
    title: "Season",
    links: [
      { label: "Standings", href: "/#season" },
      { label: "Head to head", href: "/#h2h" },
      { label: "2027 calendar", href: "/#forecast" },
      { label: "Race highlights", href: "/#watch" },
    ],
  },
  {
    title: "Explore",
    links: [
      { label: "The drivers", href: "/#drivers" },
      { label: "The car", href: "/#car" },
      { label: "Track record", href: "/#record" },
      { label: "How the model works", href: "/methodology" },
    ],
  },
  {
    title: "PitWall",
    links: [
      { label: "Methodology", href: "/methodology" },
      { label: "Privacy", href: "/privacy" },
      { label: "Credits", href: "/credits" },
      { label: "GitHub", href: REPO_URL, external: true },
    ],
  },
];

function Arrow() {
  return (
    <svg viewBox="0 0 12 12" className="size-2.5" aria-hidden="true">
      <path d="M3 9 9 3M4 3h5v5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function SiteFooter() {
  const race = site.next_race;
  const favOdds = race?.odds[0];
  const fav = favOdds ? driver(favOdds.driver_id) : null;
  const year = new Date(site.built_at).getFullYear();
  const updated = new Date(site.built_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const rec = site.record?.modes.post_quali.model;

  return (
    <footer className="theme-night relative overflow-hidden border-t border-rule">
      {/* Next race */}
      {race && fav && favOdds ? (
        <div className="wrap grid gap-12 py-20 md:py-28 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-end">
          <div>
            <span className="tag">
              Round {race.round} · {race.circuit_name}
            </span>
            <p className="h2 mt-6" data-reveal="lines">
              <span className="reveal-line">
                <span>
                  <span className="type-voice">Lights out</span> <span className="type-display">in</span>
                </span>
              </span>
              <span className="reveal-line">
                <span style={{ "--i": 1 } as CSSProperties}>
                  <span className="type-display text-transparent [-webkit-text-stroke:2px_var(--accent)]">
                    {shortRaceName(race.race_name)}
                  </span>
                </span>
              </span>
            </p>
            <div className="mt-8">{race.start_utc ? <Countdown startUtc={race.start_utc} /> : null}</div>
          </div>
          <div className="grid gap-6">
            <div className="panel grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 p-5" style={{ "--c": team(favOdds.team).colour } as CSSProperties}>
              <span className="h-12 w-1.5 rounded-full bg-[var(--c)]" />
              <span className="grid gap-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-sub">Race favourite</span>
                <span className="type-voice text-2xl leading-none">{fav.name}</span>
              </span>
              <span className="type-data text-3xl">{pct(favOdds.p_win)}</span>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/#game" className="btn btn-primary" data-cursor="Play">
                <span className="lbl">
                  <i>Make your call</i>
                  <i>Make your call</i>
                </span>
                <span className="dot" />
              </Link>
              {race.start_utc ? (
                <AddToCalendar
                  title={`${race.race_name} (PitWall)`}
                  startUtc={race.start_utc}
                  location={`${race.circuit_name}, ${race.locality}`}
                />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Proof strip */}
      {rec ? (
        <div className="border-y border-rule">
          <dl className="wrap grid grid-cols-2 md:grid-cols-4">
            {[
              [`${Math.round(rec.winner_hit * 100)}%`, "Winners called after qualifying"],
              [`${Math.round(rec.winner_in_top3 * 100)}%`, "Winner in our top three"],
              [`${rec.races}`, "Races in the public record"],
              ["10,000", "Seasons simulated per forecast"],
            ].map(([v, k], i) => (
              <div key={k} className={`grid gap-1 py-7 ${i ? "md:border-l md:border-rule md:pl-8" : ""} ${i % 2 ? "max-md:border-l max-md:border-rule max-md:pl-5" : ""}`}>
                <dt className="order-2 text-sm text-sub">{k}</dt>
                <dd className="type-display order-1 text-[clamp(34px,4vw,52px)] leading-none">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {/* Links */}
      <div className="wrap grid gap-12 py-16 lg:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))]">
        <div className="grid content-start gap-5">
          <Link href="/" aria-label="PitWall home" className="w-fit">
            <Logo />
          </Link>
          <p className="max-w-[32ch] text-sm leading-relaxed text-sub">
            Race-by-race win odds, championship forecasts and a public record of every call. Updated after every
            Grand Prix.
          </p>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="PitWall on GitHub"
            className="grid size-10 place-items-center rounded-full border border-rule text-ink transition-colors hover:border-ink"
            data-magnetic
          >
            <svg viewBox="0 0 16 16" className="size-[18px]" aria-hidden="true">
              <path
                fill="currentColor"
                d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
              />
            </svg>
          </a>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title} className="grid content-start gap-4">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-sub">{col.title}</h2>
            <ul className="grid gap-2.5">
              {col.links.map((l) => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    {...(l.external ? { target: "_blank", rel: "noreferrer" } : {})}
                    className="group inline-flex items-center gap-1.5 text-[15px] text-ink transition-colors hover:text-[var(--you)]"
                  >
                    <span className="relative after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:origin-right after:scale-x-0 after:bg-current after:transition-transform after:duration-500 after:ease-expo group-hover:after:origin-left group-hover:after:scale-x-100">
                      {l.label}
                    </span>
                    {l.external ? <Arrow /> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      {/* Giant wordmark */}
      <div className="wrap" aria-hidden="true">
        <div className="flex items-end gap-[2vw] border-t border-rule pt-10">
          <LogoMark className="h-[clamp(60px,14vw,210px)] w-auto flex-none text-ink" />
          <p className="giant" style={{ fontSize: "clamp(84px, 19vw, 300px)" }} data-cursor="PitWall">
            PitWall
          </p>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="wrap grid gap-4 py-8 font-mono text-[11px] uppercase leading-relaxed tracking-[0.1em] text-sub md:grid-cols-[1fr_auto_1fr] md:items-center">
        <span>© {year} PitWall · Data updated {updated}</span>
        <span className="flex gap-5">
          <Link href="/privacy" className="hover:text-ink">
            Privacy
          </Link>
          <Link href="/methodology" className="hover:text-ink">
            Methodology
          </Link>
          <Link href="/credits" className="hover:text-ink">
            Credits
          </Link>
        </span>
        <a href="#top" className="inline-flex items-center gap-2 text-ink md:justify-self-end" data-cursor="Top">
          Back to the start
          <svg viewBox="0 0 12 12" className="size-3" aria-hidden="true">
            <path d="M6 10V2M2.5 5.5 6 2l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </a>
        <p className="text-[10px] normal-case tracking-normal text-sub/70 md:col-span-3">
          F1, FORMULA 1 and related marks are trademarks of Formula One Licensing B.V. PitWall is not affiliated with
          Formula 1, the FIA or any team. Predictions are for entertainment and analysis, not betting.
        </p>
      </div>
    </footer>
  );
}
