import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { shortRaceName, site } from "@/lib/data";

export const metadata: Metadata = {
  title: "Off track",
  description: "That page isn't on PitWall. Head back to the odds for the next race.",
};

/** A missing page: say so plainly and offer the useful ways back. */
export default function NotFound() {
  const race = site.next_race;
  const links: [string, string, string][] = [
    ["/", "Home", "The race and the countdown"],
    ["/#odds", race ? `${shortRaceName(race.race_name)} odds` : "Race odds", "Every driver, next race"],
    ["/#drivers", "Drivers", "Every driver on the grid"],
    ["/methodology", "How it works", "The model, in plain words"],
  ];
  return (
    <>
      <SiteHeader home={false} />
      <main id="main" className="theme-night flex-1 pb-28 pt-40">
        <div className="wrap grid gap-12">
          <div className="grid gap-6">
            <span className="tag">404 · Off track</span>
            <h1 className="h2">
              <span className="type-voice">Off the</span> <span className="type-display">racing line</span>
            </h1>
            <p className="max-w-[48ch] text-lg text-sub">
              That page isn&apos;t on PitWall: the link may be old or mistyped. Here&apos;s the quickest way back.
            </p>
          </div>
          <ul className="grid gap-px overflow-hidden rounded-2xl border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
            {links.map(([href, label, note]) => (
              <li key={href} className="bg-paper">
                <Link href={href} className="group grid h-full gap-2 p-6 transition-colors hover:bg-white/[0.03]">
                  <span className="flex items-center justify-between gap-3">
                    <span className="type-voice text-2xl leading-none">{label}</span>
                    <span aria-hidden="true" className="text-sub transition-transform duration-500 ease-expo group-hover:translate-x-1">
                      →
                    </span>
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-sub">{note}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
