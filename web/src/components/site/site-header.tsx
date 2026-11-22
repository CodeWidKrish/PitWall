import Link from "next/link";
import { shortRaceName, site } from "@/lib/data";

const LINKS = [
  { href: "#drivers", label: "Drivers" },
  { href: "#odds", label: "The odds" },
  { href: "#watch", label: "Watch" },
  { href: "#season", label: "2026" },
  { href: "#forecast", label: "2027" },
  { href: "#record", label: "Record" },
];

export function Logo() {
  return (
    <>
      <svg viewBox="0 0 26 26" className="size-[26px]" aria-hidden="true">
        <rect x="1" y="1" width="24" height="24" rx="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M5 18 C9 18 9 8 13 8 S17 18 21 18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <span className="font-display text-[22px] font-extrabold uppercase italic leading-none tracking-[0.02em] [font-stretch:70%]">
        PitWall
      </span>
    </>
  );
}

/** Fixed bar that inverts against whatever is behind it, day or night. */
export function SiteHeader({ home = true }: { home?: boolean }) {
  const next = site.next_race;
  return (
    <header className="fixed inset-x-0 top-0 z-50 text-white mix-blend-difference">
      <div className="wrap flex h-[72px] items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5" aria-label="PitWall home">
          <Logo />
        </Link>
        {home ? (
          <nav aria-label="Sections" className="hidden lg:block">
            <ul className="flex gap-7 font-mono text-xs uppercase tracking-[0.12em]">
              {LINKS.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    className="relative after:absolute after:inset-x-0 after:-bottom-1.5 after:h-px after:origin-right after:scale-x-0 after:bg-current after:transition-transform after:duration-500 after:ease-expo hover:after:origin-left hover:after:scale-x-100"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        {next ? (
          <Link
            href="/#odds"
            data-cursor="Odds"
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-current px-3.5 py-2.5 font-mono text-xs font-semibold uppercase tracking-[0.1em]"
          >
            R{next.round} · {shortRaceName(next.race_name)}
          </Link>
        ) : null}
      </div>
    </header>
  );
}
