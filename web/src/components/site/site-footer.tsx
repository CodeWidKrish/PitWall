import Link from "next/link";
import type { CSSProperties } from "react";
import { Countdown } from "@/components/site/countdown";
import { Logo, LogoMark } from "@/components/ui/logo";
import { driver, pct, shortRaceName, site } from "@/lib/data";
import { REPO_URL } from "@/lib/links";

const COLUMNS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: "Explore",
    links: [
      { label: "The drivers", href: "/#drivers" },
      { label: "Next race odds", href: "/#odds" },
      { label: "Watch", href: "/#watch" },
      { label: "2026 season", href: "/#season" },
      { label: "2027 forecast", href: "/#forecast" },
      { label: "Track record", href: "/#record" },
    ],
  },
  {
    title: "The model",
    links: [
      { label: "How it works", href: `${REPO_URL}/tree/main/model#readme`, external: true },
      { label: "Full backtest report", href: `${REPO_URL}/blob/main/model/reports/BACKTEST.md`, external: true },
      { label: "Source code", href: REPO_URL, external: true },
    ],
  },
  {
    title: "Project",
    links: [
      { label: "Credits and licences", href: "/credits" },
      { label: "MIT licence", href: `${REPO_URL}/blob/main/LICENSE`, external: true },
      { label: "Report an issue", href: `${REPO_URL}/issues`, external: true },
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
  const fav = race ? driver(race.odds[0].driver_id) : null;
  const built = new Date(site.built_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const year = new Date(site.built_at).getFullYear();

  return (
    <footer className="theme-night relative overflow-hidden border-t border-rule">
      {/* Next race call to action */}
      {race && fav ? (
        <div className="wrap grid gap-10 py-20 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:items-end md:py-28">
          <div>
            <span className="tag">Next race · Round {race.round}</span>
            <p className="h2 mt-6" data-reveal="lines">
              <span className="reveal-line">
                <span>
                  <span className="type-voice">Before</span> <span className="type-display">lights out</span>
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
          </div>
          <div className="grid gap-6">
            <p className="text-[17px] text-sub">
              The model makes {fav.name} favourite at {pct(race.odds[0].p_win)}. Every call is published before the race
              and scored after it.
            </p>
            {race.start_utc ? <Countdown startUtc={race.start_utc} /> : null}
            <div className="flex flex-wrap gap-3">
              <Link href="/#odds" className="btn btn-primary" data-cursor="Go">
                <span className="lbl">
                  <i>See the full grid</i>
                  <i>See the full grid</i>
                </span>
                <span className="dot" />
              </Link>
              <a href={REPO_URL} className="btn btn-line" data-cursor="Code">
                <span className="lbl">
                  <i>Star on GitHub</i>
                  <i>Star on GitHub</i>
                </span>
              </a>
            </div>
          </div>
        </div>
      ) : null}

      {/* Links */}
      <div className="wrap grid gap-12 border-t border-rule py-16 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
        <div className="grid content-start gap-5">
          <Link href="/" aria-label="PitWall home" className="w-fit">
            <Logo />
          </Link>
          <p className="max-w-[34ch] text-sm leading-relaxed text-sub">
            An open forecasting model for Formula 1. Win odds for every driver, both championships simulated 10,000
            times, and a public record of every call.
          </p>
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-sub">Data updated {built}</p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title} className="grid content-start gap-4">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-sub">{col.title}</h2>
            <ul className="grid gap-2.5">
              {col.links.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    {...(l.external ? { target: "_blank", rel: "noreferrer" } : {})}
                    className="group inline-flex items-center gap-1.5 text-[15px] text-ink transition-colors hover:text-accent"
                  >
                    <span className="relative after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:origin-right after:scale-x-0 after:bg-current after:transition-transform after:duration-500 after:ease-expo group-hover:after:origin-left group-hover:after:scale-x-100">
                      {l.label}
                    </span>
                    {l.external ? <Arrow /> : null}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      {/* Giant wordmark */}
      <div className="wrap relative" aria-hidden="true">
        <div className="flex items-end gap-[2vw] border-t border-rule pt-10">
          <LogoMark className="h-[clamp(60px,14vw,210px)] w-auto flex-none text-ink" />
          <p className="giant" style={{ fontSize: "clamp(84px, 19vw, 300px)" }} data-cursor="PitWall">
            PitWall
          </p>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="wrap flex flex-wrap items-center justify-between gap-4 py-8 font-mono text-[11px] uppercase leading-relaxed tracking-[0.1em] text-sub">
        <span>© {year} PitWall · Built by Krish Hingu</span>
        <span className="max-w-[70ch]">
          Independent project. Not affiliated with Formula 1, the FIA or any team. For analysis, not betting.
        </span>
        <a href="#top" className="inline-flex items-center gap-2 text-ink" data-cursor="Top">
          Back to the start
          <svg viewBox="0 0 12 12" className="size-3" aria-hidden="true">
            <path d="M6 10V2M2.5 5.5 6 2l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </a>
      </div>
    </footer>
  );
}
