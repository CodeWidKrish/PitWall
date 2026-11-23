import Link from "next/link";
import { HeaderShell } from "@/components/site/header-shell";
import { SiteNav } from "@/components/site/site-nav";
import { Logo } from "@/components/ui/logo";

/** Site navigation: logo, section links, the sound switch and the phone menu. */
export function SiteHeader({ home = true }: { home?: boolean }) {
  return (
    <HeaderShell alwaysSolid={!home}>
      <div className="wrap flex h-[68px] items-center justify-between gap-4">
        <Link href="/" aria-label="PitWall home" data-cursor="Home">
          <Logo />
        </Link>
        <SiteNav home={home} />
      </div>
    </HeaderShell>
  );
}
