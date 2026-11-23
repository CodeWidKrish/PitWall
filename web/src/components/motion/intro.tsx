"use client";

import { useEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/ui/logo";

const SEEN = "pitwall:intro";

declare global {
  interface Window {
    __pitwallIntroDone?: boolean;
    __pitwallModelReady?: boolean;
  }
}

/**
 * Opening sequence: the mark, a counter that follows real loading (fonts, page,
 * the 3D car), then the curtain lifts and the start lights take over.
 * Shorter on repeat visits in the same session; skipped for reduced motion.
 */
export function Intro() {
  const [count, setCount] = useState(0);
  const [phase, setPhase] = useState<"load" | "lift" | "gone">("load");
  const shown = useRef(0);

  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let repeat = false;
    try {
      repeat = sessionStorage.getItem(SEEN) === "1";
      sessionStorage.setItem(SEEN, "1");
    } catch {
      /* ignore */
    }
    const finish = () => {
      window.__pitwallIntroDone = true;
      window.dispatchEvent(new Event("pitwall:intro-done"));
    };
    if (reduce) {
      const t = setTimeout(() => {
        setPhase("gone");
        finish();
      }, 0);
      return () => clearTimeout(t);
    }
    document.documentElement.style.overflow = "hidden";
    const lenis = (window as unknown as { __lenis?: { stop: () => void; start: () => void } }).__lenis;
    lenis?.stop();

    let target = 10;
    const steps: Promise<unknown>[] = [
      document.fonts.ready.then(() => (target = Math.max(target, 45))),
      new Promise<void>((r) => (document.readyState === "complete" ? r() : addEventListener("load", () => r(), { once: true }))).then(
        () => (target = Math.max(target, 70)),
      ),
      new Promise<void>((r) => {
        if (window.__pitwallModelReady) return r();
        addEventListener("pitwall:model", () => r(), { once: true });
      }).then(() => (target = 100)),
    ];
    const cap = setTimeout(() => (target = 100), repeat ? 600 : 4200);
    void Promise.all(steps);

    let raf = 0;
    let done = false;
    const lift = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      setCount(100);
      setPhase("lift");
      setTimeout(() => {
        setPhase("gone");
        document.documentElement.style.overflow = "";
        lenis?.start();
        finish();
      }, 950);
    };
    // Never hold the page: lift after a few seconds whatever happens.
    const hard = setTimeout(lift, repeat ? 1500 : 6000);
    const start = performance.now();
    const minTime = repeat ? 300 : 900;
    const tick = (now: number) => {
      const allowed = now - start < minTime ? Math.min(target, ((now - start) / minTime) * 100) : target;
      shown.current += (allowed - shown.current) * 0.12;
      const v = Math.min(100, Math.round(shown.current + 0.4));
      setCount(v);
      if (v >= 100) {
        lift();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(cap);
      clearTimeout(hard);
      document.documentElement.style.overflow = "";
    };
  }, []);

  if (phase === "gone") return null;
  return (
    <div
      aria-hidden="true"
      className={`intro fixed inset-0 z-[200] grid bg-[#08090a] text-[#ecedef] transition-[clip-path] duration-[950ms] ease-[cubic-bezier(.76,0,.24,1)] ${
        phase === "lift" ? "[clip-path:inset(0_0_100%_0)]" : "[clip-path:inset(0_0_0_0)]"
      }`}
    >
      <div className="wrap flex h-full flex-col justify-between py-8">
        <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.16em] text-[#8a9099]">
          <span>PitWall · race forecasts</span>
          <span className="max-sm:hidden">Loading the grid</span>
        </div>
        <div className="grid justify-items-center gap-8">
          <LogoMark className="h-[clamp(70px,12vw,140px)] w-auto animate-[introMark_1.2s_var(--ease-out-expo)_both]" />
          <div className="flex gap-2.5">
            {[0, 1, 2, 3, 4].map((k) => (
              <i
                key={k}
                className="block size-3.5 rounded-full transition-[background,box-shadow] duration-200 md:size-4"
                style={
                  count >= (k + 1) * 20
                    ? { background: "#ff2a2a", boxShadow: "0 0 16px 3px rgb(255 42 42 / 0.55)" }
                    : { background: "#1a1c1f" }
                }
              />
            ))}
          </div>
        </div>
        <div className="flex items-end justify-between">
          <span className="font-display text-[clamp(80px,16vw,220px)] font-extrabold leading-[0.8] tabular-nums tracking-[-0.02em] [font-stretch:70%]">
            {String(count).padStart(3, "0")}
          </span>
          <span className="max-w-[26ch] pb-3 text-right font-mono text-[11px] uppercase leading-relaxed tracking-[0.14em] text-[#8a9099]">
            Real results since 2018 · 10,000 simulated seasons · one call per race
          </span>
        </div>
      </div>
    </div>
  );
}
