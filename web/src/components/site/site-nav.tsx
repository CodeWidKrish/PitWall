"use client";

import Link from "next/link";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CommandPalette } from "@/components/ui/command-palette";
import { RaceAlerts } from "@/components/ui/race-alerts";
import { SoundToggle } from "@/components/ui/sound-toggle";

export const LINKS: { id: string; label: string; note: string; menuOnly?: boolean }[] = [
  { id: "drivers", label: "Drivers", note: "Pick who you ride with" },
  { id: "car", label: "The car", note: "Walk around it" },
  { id: "odds", label: "The odds", note: "Every driver, next race" },
  { id: "game", label: "Play", note: "Beat the model" },
  { id: "watch", label: "Watch", note: "Real cars, real sound", menuOnly: true },
  { id: "season", label: "2026", note: "The title, race by race", menuOnly: true },
  { id: "forecast", label: "2027", note: "Who wins next year" },
  { id: "whatif", label: "What if", note: "Break the season" },
  { id: "live", label: "Live", note: "This season's calls, scored", menuOnly: true },
  { id: "record", label: "Record", note: "Every call, scored" },
];

type LenisLike = { stop: () => void; start: () => void; scrollTo: (t: HTMLElement, o?: object) => void };
const lenis = () => (window as unknown as { __lenis?: LenisLike | null }).__lenis ?? null;

/** Desktop links that show where you are; a full-screen menu on phones. */
export function SiteNav({ home }: { home: boolean }) {
  const [active, setActive] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const list = useRef<HTMLUListElement>(null);
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- portal target exists only after mount
  useEffect(() => setMounted(true), []);

  // Scroll spy: the section crossing the middle of the screen is "active".
  useEffect(() => {
    if (!home) return;
    const io = new IntersectionObserver(
      (es) => {
        es.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id);
        });
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    const top = document.getElementById("top");
    const ioTop = new IntersectionObserver(([e]) => e.isIntersecting && setActive(null), { threshold: 0.4 });
    if (top) ioTop.observe(top);
    LINKS.forEach((l) => {
      const el = document.getElementById(l.id);
      if (el) io.observe(el);
    });
    return () => {
      io.disconnect();
      ioTop.disconnect();
    };
  }, [home]);

  // Slide the underline to the active link.
  useEffect(() => {
    const ul = list.current;
    const a = active ? ul?.querySelector<HTMLElement>(`[data-id="${active}"]`) : null;
    if (!ul || !a) {
      setBar(null);
      return;
    }
    const r = a.getBoundingClientRect(),
      p = ul.getBoundingClientRect();
    setBar({ left: r.left - p.left, width: r.width });
  }, [active]);

  // Menu open: freeze the page and close on Escape.
  useEffect(() => {
    if (!open) return;
    lenis()?.stop();
    document.documentElement.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("keydown", key);
    return () => {
      lenis()?.start();
      document.documentElement.style.overflow = "";
      removeEventListener("keydown", key);
    };
  }, [open]);

  const go = (id: string) => {
    setOpen(false);
    const el = document.getElementById(id);
    if (!el) return;
    setTimeout(() => {
      const l = lenis();
      if (l) l.scrollTo(el, { duration: 1.4 });
      else el.scrollIntoView();
    }, 420);
  };

  return (
    <>
      {home ? (
        <nav aria-label="Sections" className="hidden lg:block">
          <ul ref={list} className="relative flex gap-1 font-mono text-xs uppercase tracking-[0.12em]">
            {LINKS.filter((l) => !l.menuOnly).map((l) => (
              <li key={l.id}>
                <a
                  href={`#${l.id}`}
                  data-id={l.id}
                  aria-current={active === l.id ? "location" : undefined}
                  className={`block whitespace-nowrap rounded-full px-3 py-2 transition-colors duration-300 ${
                    active === l.id ? "text-white" : "text-white/60 hover:text-white"
                  }`}
                >
                  {l.label}
                </a>
              </li>
            ))}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-1 h-[2px] rounded-full bg-[var(--you)] transition-[left,width,opacity] duration-500 ease-expo"
              style={{ left: bar?.left ?? 0, width: bar?.width ?? 0, opacity: bar ? 1 : 0 }}
            />
          </ul>
        </nav>
      ) : null}

      <div className="flex items-center gap-2">
        <CommandPalette home={home} />
        <RaceAlerts />
        <SoundToggle />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="menu"
          aria-label={open ? "Close menu" : "Open menu"}
          className="grid size-11 place-items-center rounded-full border border-white/30 lg:hidden"
        >
          <span className="relative block h-3 w-5" aria-hidden="true">
            <i className="absolute left-0 top-0 block h-[2px] w-5 rounded bg-current" />
            <i className="absolute left-0 top-[10px] block h-[2px] w-3 rounded bg-current" />
          </span>
        </button>
      </div>

      {/* Full-screen menu (phones and tablets), outside the header's blur layer */}
      {mounted
        ? createPortal(
      <div
        id="menu"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className={`fixed inset-0 z-[120] bg-[#08090a] text-[#ecedef] transition-[clip-path] duration-700 ease-[cubic-bezier(.76,0,.24,1)] lg:hidden ${
          open ? "[clip-path:inset(0_0_0_0)]" : "pointer-events-none [clip-path:inset(0_0_100%_0)]"
        }`}
      >
        <div className="wrap flex h-[80px] items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#8a9099]">Menu</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            tabIndex={open ? 0 : -1}
            aria-label="Close menu"
            className="grid size-11 place-items-center rounded-full border border-white/30"
          >
            <span className="relative block h-3 w-5" aria-hidden="true">
              <i className="absolute left-0 top-[5px] block h-[2px] w-5 rotate-45 rounded bg-current" />
              <i className="absolute left-0 top-[5px] block h-[2px] w-5 -rotate-45 rounded bg-current" />
            </span>
          </button>
        </div>
        <div className="wrap flex h-[calc(100%-80px)] flex-col justify-between pb-10 pt-8">
          <ol className="grid gap-1">
            {LINKS.map((l, i) => (
              <li key={l.id} className="overflow-hidden border-b border-white/10">
                {home ? (
                  <button
                    type="button"
                    onClick={() => go(l.id)}
                    tabIndex={open ? 0 : -1}
                    className="flex w-full items-baseline justify-between gap-4 py-3 text-left transition-transform duration-700 ease-expo"
                    style={{ transform: open ? "none" : "translateY(110%)", transitionDelay: open ? `${120 + i * 50}ms` : "0ms" } as CSSProperties}
                  >
                    <span className="type-display whitespace-nowrap text-[clamp(44px,12vw,72px)] leading-[0.9]">{l.label}</span>
                    <span className="text-right font-mono text-[10px] uppercase tracking-[0.14em] text-[#8a9099]">{l.note}</span>
                  </button>
                ) : (
                  <Link
                    href={`/#${l.id}`}
                    tabIndex={open ? 0 : -1}
                    onClick={() => setOpen(false)}
                    className="flex items-baseline justify-between gap-4 py-3"
                  >
                    <span className="type-display whitespace-nowrap text-[clamp(44px,12vw,72px)] leading-[0.9]">{l.label}</span>
                    <span className="text-right font-mono text-[10px] uppercase tracking-[0.14em] text-[#8a9099]">{l.note}</span>
                  </Link>
                )}
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <button
              type="button"
              tabIndex={open ? 0 : -1}
              onClick={() => {
                setOpen(false);
                setTimeout(() => dispatchEvent(new Event("pitwall:palette")), 450);
              }}
              className="inline-flex h-11 items-center gap-3 rounded-full border border-white/30 px-4 font-mono text-[11px] uppercase tracking-[0.12em]"
            >
              Search drivers and sections
            </button>
            <p className="font-mono text-[11px] uppercase leading-relaxed tracking-[0.12em] text-[#8a9099]">
              Independent F1 forecasts · not affiliated with Formula 1
            </p>
          </div>
        </div>
      </div>,
            document.body,
          )
        : null}
    </>
  );
}
