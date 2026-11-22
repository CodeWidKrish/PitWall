import { Eyebrow } from "@/components/ui/eyebrow";
import { FEATURES } from "@/lib/roadmap";

export function FeatureGrid() {
  return (
    <section className="theme-day py-24 md:py-32">
      <div className="mx-auto max-w-[1280px] px-5">
        <div className="grid gap-8 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:items-end">
          <div>
            <Eyebrow>What PitWall does</Eyebrow>
            <h2 className="mt-6 text-[clamp(44px,7vw,104px)] leading-[0.88]">
              <span className="type-display">Odds</span> <span className="type-voice">you can</span>
              <br />
              <span className="type-display">check</span>
            </h2>
          </div>
          <p className="max-w-[46ch] text-[17px] leading-relaxed text-sub">
            Most F1 predictors claim an accuracy nobody can verify. PitWall locks every call before the race and keeps
            the receipts.
          </p>
        </div>

        <ol className="mt-16 grid border-t border-rule sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <li key={f.title} className="grid content-start gap-3 border-b border-rule py-8 sm:pr-8">
              <span className="type-data text-xs text-sub">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="type-voice text-[28px] leading-[1.05]">{f.title}</h3>
              <p className="max-w-[38ch] text-[15px] leading-relaxed text-sub">{f.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
