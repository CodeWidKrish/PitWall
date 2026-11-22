import Link from "next/link";
import { HeaderShell } from "@/components/site/header-shell";
import { Logo } from "@/components/ui/logo";
import { SoundToggle } from "@/components/ui/sound-toggle";

const LINKS = [
  { href: "#drivers", label: "Drivers" },
  { href: "#odds", label: "The odds" },
  { href: "#watch", label: "Watch" },
  { href: "#season", label: "2026" },
  { href: "#forecast", label: "2027" },
  { href: "#record", label: "Record" },
];

/** Site navigation: logo, section links and the sound switch. */
export function SiteHeader({ home = true }: { home?: boolean }) {
  return (
    <HeaderShell>
      <div className="wrap flex h-[68px] items-center justify-between gap-4">
        <Link href="/" aria-label="PitWall home" data-cursor="Home">
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
        <SoundToggle />
      </div>
    </HeaderShell>
  );
}
