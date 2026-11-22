import { Eyebrow } from "@/components/ui/eyebrow";
import { PHASES, type PhaseStatus } from "@/lib/roadmap";

const STATUS: Record<PhaseStatus, { label: string; className: string }> = {
  done: { label: "Done", className: "text-gain" },
  active: { label: "In progress", className: "text-accent" },
  next: { label: "Up next", className: "text-sub" },
};

export function BuildLog() {
  return (
    <section className="py-24 md:py-32">
      <div className="mx-auto max-w-[1280px] px-5">
        <Eyebrow>Build log</Eyebrow>
        <h2 className="mt-6 text-[clamp(44px,7vw,104px)] leading-[0.88]">
          <span className="type-display">Seven</span> <span className="type-voice">phases,</span>
          <br />
          <span className="type-display">one launch</span>
        </h2>

        <ol className="mt-16 border-t border-rule">
          {PHASES.map((p) => {
            const s = STATUS[p.status];
            return (
              <li
                key={p.id}
                className={`grid grid-cols-[40px_minmax(0,1fr)_auto] items-baseline gap-x-5 gap-y-1 border-b border-rule py-6 md:grid-cols-[56px_220px_minmax(0,1fr)_120px_120px] ${p.status === "next" ? "opacity-70" : ""}`}
              >
                <span className="type-data text-sm text-sub">{String(p.id).padStart(2, "0")}</span>
                <span className="type-display text-[28px] leading-none md:text-[32px]">{p.title}</span>
                <span className="col-start-2 text-[15px] text-sub md:col-start-auto">{p.summary}</span>
                <span className="type-data col-start-2 text-xs text-sub md:col-start-auto">{p.window}</span>
                <span
                  className={`row-start-1 col-start-3 inline-flex items-center gap-2 justify-self-end font-mono text-[11px] font-semibold uppercase tracking-[0.1em] md:col-start-auto md:row-start-auto ${s.className}`}
                >
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
