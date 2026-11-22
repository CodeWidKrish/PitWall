import { REPO_URL } from "@/lib/roadmap";

export function SiteFooter() {
  return (
    <footer className="overflow-hidden border-t border-rule pb-10 pt-20">
      <div className="mx-auto max-w-[1280px] px-5">
        <p
          aria-hidden="true"
          className="type-display whitespace-nowrap text-[clamp(84px,22vw,340px)] italic leading-[0.8] text-transparent [-webkit-text-stroke:1.5px_var(--ink)]"
        >
          PitWall
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 font-mono text-[11px] uppercase leading-relaxed tracking-[0.1em] text-sub">
          <span>Independent project · not affiliated with Formula 1, the FIA or any team</span>
          <a href={REPO_URL} className="text-ink underline underline-offset-4">
            Source on GitHub
          </a>
          <span>For analysis, not betting</span>
        </div>
      </div>
    </footer>
  );
}
