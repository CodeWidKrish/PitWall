import type { Metadata } from "next";
import Link from "next/link";
import { type CSSProperties, Suspense } from "react";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { Portrait } from "@/components/ui/portrait";
import { driver, shortRaceName, team } from "@/lib/data";
import { oneIn, parseCall } from "@/lib/podium";

type Props = { searchParams: Promise<{ p?: string; r?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { p, r } = await searchParams;
  const call = parseCall(p, r);
  if (!call) return { title: "Podium call" };
  const codes = call.picks.map((x) => driver(x).code).join(" · ");
  const title = `${codes}: my ${shortRaceName(call.race.race_name)} podium`;
  const description = `PitWall's model gives this exact podium 1 in ${oneIn(call.p)}. Can you beat it?`;
  const image = `/api/card?r=${call.race.season}-${call.race.round}&p=${call.picks.join(",")}`;
  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

/** Where a shared podium call lands: the call, its odds, and a way to make your own. */
export default function CallPage({ searchParams }: Props) {
  return (
    <>
      <SiteHeader home={false} />
      <main id="main" className="theme-night flex-1 pb-24 pt-36">
        <div className="wrap grid gap-12">
          <Suspense fallback={<div className="h-[60vh]" aria-hidden="true" />}>
            <CallBody searchParams={searchParams} />
          </Suspense>
          <Link href="/#game" className="btn btn-primary w-fit" data-cursor="Play">
            <span className="lbl">
              <i>Make your own call</i>
              <i>Make your own call</i>
            </span>
            <span className="dot" />
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

async function CallBody({ searchParams }: Props) {
  const { p, r } = await searchParams;
  const call = parseCall(p, r);
  return (
    <>
          {call ? (
            <>
              <div className="grid gap-5">
                <span className="tag">
                  A podium call · {shortRaceName(call.race.race_name)}
                  {call.forThisRace ? "" : " · made for an earlier race"}
                </span>
                <h1 className="h2">
                  <span className="type-voice">1 in</span> <span className="type-display">{oneIn(call.p)}</span>
                </h1>
                <p className="max-w-[52ch] text-lg text-sub">
                  That&apos;s how likely PitWall&apos;s model thinks this exact podium is. Its own pick is 1 in {oneIn(call.modelP)}.
                </p>
              </div>
              <ol className="grid max-w-[880px] grid-cols-3 items-end gap-3 sm:gap-5">
                {[1, 0, 2].map((slot, i) => {
                  const d = driver(call.picks[slot]);
                  const c = team(d.team_now).colour;
                  return (
                    <li key={slot} className="grid gap-3 [animation:heroIn_.9s_var(--ease-out-expo)_both]" style={{ animationDelay: `${i * 0.12}s`, "--c": c } as CSSProperties}>
                      <Link href={`/drivers/${d.id}`} className="grid gap-3">
                        <Portrait d={d} live sizes="(min-width: 640px) 260px, 30vw" className="aspect-[4/5] w-full rounded-2xl" />
                        <span className="type-code text-[clamp(26px,4vw,44px)] leading-none text-[var(--c)]">{d.code}</span>
                      </Link>
                      <span
                        className="grid place-items-start rounded-t-xl border-t-4 border-[var(--c)] bg-white/[0.04] p-4 font-mono text-sm text-sub"
                        style={{ height: [150, 200, 110][slot] }}
                      >
                        P{slot + 1}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </>
          ) : (
            <div className="grid gap-5">
              <span className="tag">Podium call</span>
              <h1 className="h2">
                <span className="type-voice">This call</span> <span className="type-display">has expired</span>
              </h1>
              <p className="max-w-[52ch] text-lg text-sub">The link doesn&apos;t match a podium for the next race. Make your own below.</p>
            </div>
          )}
    </>
  );
}
