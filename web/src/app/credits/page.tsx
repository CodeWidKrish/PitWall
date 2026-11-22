import type { Metadata } from "next";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { Portrait } from "@/components/ui/portrait";
import { driver, photoCredits } from "@/lib/data";

export const metadata: Metadata = {
  title: "Credits",
  description: "Who made the photos, data and footage PitWall uses, and under which licences.",
};

export default function Credits() {
  const rows = Object.entries(photoCredits).sort(([a], [b]) => driver(a).last_name.localeCompare(driver(b).last_name));
  return (
    <>
      <SiteHeader home={false} />
      <main className="theme-day flex-1 pb-28 pt-40">
        <div className="wrap">
          <span className="tag">Credits</span>
          <h1 className="h2 mt-6">
            <span className="type-voice">Made with</span> <span className="type-display">open work</span>
          </h1>
          <div className="mt-10 grid max-w-[70ch] gap-4 text-[17px] text-sub">
            <p>
              Race results come from the Jolpica F1 API and race weather from Open-Meteo. Highlights are by FORMULA 1 and
              play from YouTube; PitWall doesn&apos;t host any footage. Team names are used only to identify teams; no
              logos are used.
            </p>
            <p>
              Driver photos are from Wikimedia Commons under the licences below. On the site they are cropped and shown
              toned in the team colour until hovered or selected. Thank you to every photographer.
            </p>
          </div>

          <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map(([id, c]) => {
              const d = driver(id);
              return (
                <li key={id} className="panel grid grid-cols-[88px_minmax(0,1fr)] gap-4 overflow-hidden p-3">
                  <Portrait d={d} live sizes="88px" className="aspect-[3/4] rounded-xl" />
                  <div className="grid content-start gap-1 py-1 text-sm">
                    <strong className="type-voice text-xl font-normal leading-tight">{d.name}</strong>
                    <span className="text-sub">Photo: {c.author}</span>
                    <span className="text-sub">
                      Licence:{" "}
                      {c.licence_url ? (
                        <a href={c.licence_url} className="text-ink underline underline-offset-2" rel="license noreferrer">
                          {c.licence}
                        </a>
                      ) : (
                        c.licence
                      )}
                    </span>
                    <a href={c.source} className="text-ink underline underline-offset-2" rel="noreferrer">
                      Original on Wikimedia Commons
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
