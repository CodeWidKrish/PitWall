import { Eyebrow } from "@/components/ui/eyebrow";
import { REPO_URL } from "@/lib/roadmap";

/** Opening statement. A racing line draws across the screen behind the headline. */
export function Hero() {
  return (
    <section className="relative isolate overflow-hidden pb-24 pt-40 md:pb-32 md:pt-48">
      <svg
        aria-hidden="true"
        viewBox="0 0 1440 700"
        preserveAspectRatio="none"
        className="absolute inset-0 -z-10 h-full w-full"
      >
        <defs>
          <radialGradient id="glow" cx="72%" cy="38%" r="45%">
            <stop offset="0" stopColor="#8f45ff" stopOpacity="0.22" />
            <stop offset="1" stopColor="#8f45ff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="1440" height="700" fill="url(#glow)" />
        <path
          d="M-40,560 C220,540 300,380 520,400 S820,600 1000,460 S1240,160 1480,200"
          fill="none"
          stroke="#8f45ff"
          strokeWidth="2"
          strokeLinecap="round"
          pathLength={1}
          className="[stroke-dasharray:1] [stroke-dashoffset:1] motion-safe:animate-[draw_2.4s_var(--ease-out-expo)_0.2s_forwards] motion-reduce:[stroke-dashoffset:0]"
        />
      </svg>

      <div className="mx-auto max-w-[1280px] px-5">
        <Eyebrow>2027 season · 24 rounds · 10 sprints</Eyebrow>

        <h1 className="mt-7 text-[clamp(56px,11vw,176px)] leading-[0.84]">
          <span className="block overflow-hidden pb-[0.05em]">
            <span className="inline-block motion-safe:animate-[rise_1.1s_var(--ease-out-expo)_both]">
              <span className="type-voice">Who</span> <span className="type-display">wins</span>
            </span>
          </span>
          <span className="block overflow-hidden pb-[0.05em]">
            <span className="inline-block motion-safe:animate-[rise_1.1s_var(--ease-out-expo)_0.08s_both]">
              <span className="type-display">the</span>{" "}
              <span className="type-display text-transparent [-webkit-text-stroke:2px_var(--accent)]">title?</span>
            </span>
          </span>
        </h1>

        <div className="mt-10 grid gap-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <p className="max-w-[46ch] text-[17px] leading-relaxed text-sub">
            PitWall predicts every Formula 1 race winner and the championship, publishes its odds before lights out
            and scores itself in public afterwards. The forecast for the 2027 season is being built now.
          </p>
          <a
            href={REPO_URL}
            className="group inline-flex items-center gap-3 justify-self-start rounded-full bg-accent px-6 py-4 font-mono text-xs font-semibold uppercase tracking-[0.1em] text-white transition-colors duration-500 hover:bg-ink hover:text-paper"
          >
            View the source
            <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1">
              →
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}
