import Link from "next/link";
import { site } from "@/lib/data";
import { REPO_URL } from "@/lib/links";

export function SiteFooter() {
  const built = new Date(site.built_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return (
    <footer className="theme-night overflow-hidden pb-10 pt-24">
      <div className="wrap">
        <p aria-hidden="true" className="giant" data-cursor="PitWall">
          PitWall
        </p>
        <div className="mt-12 grid gap-8 border-t border-rule pt-8 font-mono text-[11px] uppercase leading-relaxed tracking-[0.1em] text-sub md:grid-cols-3">
          <p>
            Independent project. Not affiliated with Formula 1, the FIA or any team. For analysis, not betting.
          </p>
          <p>
            Results from the Jolpica F1 API · weather from Open-Meteo · highlights by FORMULA 1 on YouTube · photos,
            footage and engine sounds from Wikimedia Commons ({" "}
            <Link href="/credits" className="text-ink underline underline-offset-4">
              credits
            </Link>{" "}
            )
          </p>
          <p className="md:text-right">
            Data updated {built} ·{" "}
            <a href={REPO_URL} className="text-ink underline underline-offset-4">
              Source on GitHub
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
