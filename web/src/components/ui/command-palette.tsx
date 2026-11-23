"use client";

import { useRouter } from "next/navigation";
import { type CSSProperties, type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFollow } from "@/components/follow";
import { openAsk } from "@/components/site/ask-pit-wall";
import { openAlerts } from "@/components/ui/race-alerts";
import { toast } from "@/components/ui/toaster";
import { currentGrid, driver, site, team } from "@/lib/data";
import { REPO_URL } from "@/lib/links";
import { sound } from "@/lib/sound";

interface Item {
  id: string;
  group: "Jump to" | "Drivers" | "Actions" | "Pages";
  label: string;
  hint?: string;
  keywords?: string;
  colour?: string;
  badge?: string;
  run: () => void;
}

/** Subsequence match with a bonus for consecutive letters and word starts; -1 if no match. */
export function fuzzy(query: string, text: string): number {
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  const t = text.toLowerCase();
  let score = 0,
    ti = 0,
    run = 0;
  for (const ch of q) {
    if (ch === " ") continue;
    const at = t.indexOf(ch, ti);
    if (at < 0) return -1;
    const wordStart = at === 0 || /[\s\-·(]/.test(t[at - 1]);
    run = at === ti ? run + 1 : 0;
    score += 1 + run * 2 + (wordStart ? 4 : 0) - Math.min(3, (at - ti) * 0.1);
    ti = at + 1;
  }
  return score + (t.startsWith(q) ? 8 : 0);
}

type LenisLike = { stop: () => void; start: () => void; scrollTo: (t: HTMLElement, o?: object) => void };
const lenis = () => (window as unknown as { __lenis?: LenisLike | null }).__lenis ?? null;

export const SECTIONS: { id: string; label: string; note: string }[] = [
  { id: "top", label: "Next race", note: "Countdown and favourites" },
  { id: "drivers", label: "Drivers", note: "Pick who you ride with" },
  { id: "car", label: "The car", note: "Liveries, tyres, lighting" },
  { id: "odds", label: "The odds", note: "Race, sprint and teams" },
  { id: "game", label: "Beat the model", note: "Call the podium" },
  { id: "season", label: "2026 season", note: "Standings race by race" },
  { id: "h2h", label: "Head to head", note: "Any two drivers" },
  { id: "watch", label: "Watch", note: "Real cars, real sound" },
  { id: "forecast", label: "2027 title odds", note: "10,000 seasons" },
  { id: "whatif", label: "What if", note: "Break the season" },
  { id: "live", label: "Live record", note: "This season's calls, scored" },
  { id: "record", label: "Track record", note: "151 races, backtested" },
];

/**
 * ⌘K / Ctrl+K: jump anywhere, follow any driver, switch on alerts or sound, from the keyboard.
 */
export function CommandPalette({ home }: { home: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [mounted, setMounted] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const router = useRouter();
  const { followId, setFollow } = useFollow();
  const listId = useId();

  // eslint-disable-next-line react-hooks/set-state-in-effect -- portal target exists only after mount
  useEffect(() => setMounted(true), []);

  const close = useCallback(() => {
    setOpen(false);
    input.current?.blur();
    setTimeout(() => {
      const back = opener.current;
      if (back && back !== document.body && document.contains(back)) back.focus();
    }, 0);
  }, []);

  const go = useCallback(
    (id: string) => {
      if (!home) return router.push(`/#${id}`);
      const el = document.getElementById(id);
      if (!el) return;
      const l = lenis();
      if (l) l.scrollTo(el, { duration: 1.4 });
      else el.scrollIntoView({ behavior: "smooth" });
    },
    [home, router],
  );

  const items = useMemo<Item[]>(() => {
    const jump: Item[] = SECTIONS.map((s) => ({
      id: `s-${s.id}`,
      group: "Jump to",
      label: s.label,
      hint: s.note,
      run: () => go(s.id),
    }));
    const drivers: Item[] = currentGrid().map((d) => {
      const t = team(d.team_now);
      return {
        id: `d-${d.id}`,
        group: "Drivers",
        label: d.name,
        hint: t.name,
        badge: d.code,
        colour: t.colour,
        keywords: `${d.code} ${t.name} ${d.number ?? ""}`,
        run: () => {
          setFollow(d.id);
          toast({ title: `Following ${d.name}`, body: "Their colour now runs through the whole site.", colour: t.colour });
        },
      };
    });
    const actions: Item[] = [
      { id: "a-ask", group: "Actions", label: "Ask the pit wall", hint: "Questions answered from PitWall's data", keywords: "chat ai assistant question why", run: () => openAsk() },
      { id: "a-alerts", group: "Actions", label: "Race alerts", hint: "Odds in race week, and when the grid is set", keywords: "notify notification push bell", run: () => openAlerts() },
      { id: "a-sound", group: "Actions", label: "Sound on or off", hint: "M", keywords: "audio mute engine", run: () => void sound?.toggle() },
      { id: "a-sprint", group: "Actions", label: site.next_race?.sprint ? "Sprint odds" : "Team odds", hint: "Constructors for the next race", keywords: "constructor team sprint", run: () => go("odds") },
    ];
    const pages: Item[] = [
      { id: "p-method", group: "Pages", label: "How the model works", hint: "/methodology", run: () => router.push("/methodology") },
      { id: "p-credits", group: "Pages", label: "Credits", hint: "Photos, footage, sound", run: () => router.push("/credits") },
      { id: "p-privacy", group: "Pages", label: "Privacy", hint: "What is stored", run: () => router.push("/privacy") },
      { id: "p-github", group: "Pages", label: "Source on GitHub", hint: "CodeWidKrish/PitWall", run: () => window.open(REPO_URL, "_blank", "noopener") },
    ];
    return [...jump, ...actions, ...drivers, ...pages];
  }, [go, router, setFollow]);

  const results = useMemo(() => {
    if (!q.trim()) return items.filter((i) => i.group !== "Drivers" || i.id === `d-${followId}`);
    const hits = items
      .map((i) => ({ i, s: Math.max(fuzzy(q, i.label), fuzzy(q, `${i.keywords ?? ""} ${i.hint ?? ""}`) - 3) }))
      .filter((r) => r.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 14);
    // Keep each group together, groups ordered by their best match.
    const best = new Map<string, number>();
    hits.forEach((h) => best.set(h.i.group, Math.max(best.get(h.i.group) ?? -1, h.s)));
    return hits
      .sort((a, b) => (best.get(b.i.group) ?? 0) - (best.get(a.i.group) ?? 0) || b.s - a.s)
      .map((r) => r.i);
  }, [q, items, followId]);

  // Global shortcut.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        opener.current = document.activeElement as HTMLElement;
        setOpen((o) => !o);
      }
    };
    const show = () => {
      opener.current = document.activeElement as HTMLElement;
      setOpen(true);
    };
    addEventListener("keydown", key);
    addEventListener("pitwall:palette", show);
    return () => {
      removeEventListener("keydown", key);
      removeEventListener("pitwall:palette", show);
    };
  }, []);

  // Open: freeze the page, focus the field, start fresh.
  useEffect(() => {
    if (!open) return;
    lenis()?.stop();
    document.documentElement.style.overflow = "hidden";
    const t = setTimeout(() => input.current?.focus(), 30);
    return () => {
      clearTimeout(t);
      lenis()?.start();
      document.documentElement.style.overflow = "";
      setQ("");
      setActive(0);
    };
  }, [open]);

  // Keep the active row in view.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (i: Item | undefined) => {
    if (!i) return;
    close();
    setTimeout(i.run, 160);
  };

  const onKey = (e: React.KeyboardEvent) => {
    const n = results.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % Math.max(1, n));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + n) % Math.max(1, n));
    } else if (e.key === "Home") {
      setActive(0);
    } else if (e.key === "End") {
      setActive(n - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      e.preventDefault(); // focus stays in the palette
    }
  };

  const rows: ReactNode[] = results.map((it, idx) => {
    const head = idx === 0 || results[idx - 1].group !== it.group ? it.group : null;
    const on = idx === active;
    const mine = it.id === `d-${followId}`;
    return (
      <li key={it.id} role="presentation">
        {head ? (
          <div role="presentation" className="px-3 pb-1.5 pt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-[#6f757e] first:pt-1">
            {head}
          </div>
        ) : null}
        <div
          id={`${listId}-${idx}`}
          role="option"
          aria-selected={on}
          data-i={idx}
          onMouseMove={() => setActive(idx)}
          onClick={() => choose(it)}
          className={`relative flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 ${on ? "bg-white/[0.07]" : ""}`}
          style={{ "--c": it.colour ?? "var(--accent)" } as CSSProperties}
        >
          <span
            aria-hidden="true"
            className={`absolute inset-y-2 left-0 w-[3px] rounded-full bg-[var(--c)] transition-opacity duration-150 ${on ? "opacity-100" : "opacity-0"}`}
          />
          {it.badge ? (
            <span className="type-code w-12 text-lg leading-none" style={{ color: on ? "var(--c)" : undefined }}>
              {it.badge}
            </span>
          ) : (
            <span aria-hidden="true" className="grid size-8 place-items-center rounded-lg border border-white/10 font-mono text-[11px] text-[#8a9099]">
              {it.group === "Jump to" ? "#" : it.group === "Actions" ? "›" : "↗"}
            </span>
          )}
          <span className="grid min-w-0 flex-1">
            <span className="truncate text-[15px] text-[#ecedef]">
              {it.label}
              {mine ? <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--you)]">Following</span> : null}
            </span>
            {it.hint ? <span className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-[#8a9099]">{it.hint}</span> : null}
          </span>
          {on ? <kbd className="font-mono text-[10px] text-[#8a9099]">↵</kbd> : null}
        </div>
      </li>
    );
  });

  const followName = driver(followId).last_name;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          opener.current = e.currentTarget;
          setOpen(true);
        }}
        aria-label="Search and jump (Ctrl K)"
        aria-haspopup="dialog"
        title="Search (Ctrl K)"
        className="hidden size-11 items-center justify-center gap-3 rounded-full border border-current font-mono text-[11px] uppercase tracking-[0.12em] md:inline-flex xl:w-auto xl:px-3.5"
      >
        <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="hidden xl:inline">Search</span>
        <kbd className="hidden rounded border border-current/40 px-1.5 py-0.5 text-[10px] opacity-70 xl:inline">⌘K</kbd>
      </button>

      {mounted
        ? createPortal(
            <div
              className={`fixed inset-0 z-[130] grid place-items-start justify-center px-4 pt-[min(16vh,140px)] transition-opacity duration-300 ${
                open ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
              aria-hidden={!open}
            >
              <div className="absolute inset-0 bg-[rgb(5_6_8/0.62)] backdrop-blur-sm" onClick={close} />
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Search and jump"
                className={`relative w-[min(620px,100%)] overflow-hidden rounded-2xl border border-white/10 bg-[rgb(16_17_20/0.94)] text-[#ecedef] shadow-[0_40px_120px_-30px_rgb(0_0_0/0.9)] backdrop-blur-xl transition-[transform,opacity] duration-500 ease-expo ${
                  open ? "translate-y-0 scale-100" : "-translate-y-3 scale-[0.98]"
                }`}
              >
                <div className="flex items-center gap-3 border-b border-white/10 px-5">
                  <svg viewBox="0 0 16 16" className="size-4 shrink-0 text-[#8a9099]" aria-hidden="true">
                    <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <input
                    ref={input}
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setActive(0);
                    }}
                    onKeyDown={onKey}
                    role="combobox"
                    aria-expanded="true"
                    aria-controls={listId}
                    aria-activedescendant={results.length ? `${listId}-${active}` : undefined}
                    aria-autocomplete="list"
                    placeholder="Jump to a section, follow a driver, switch on alerts…"
                    className="h-16 w-full bg-transparent text-[17px] text-[#ecedef] outline-none placeholder:text-[#6f757e] focus-visible:!outline-none"
                    tabIndex={open ? 0 : -1}
                  />
                  <kbd className="shrink-0 rounded border border-white/15 px-1.5 py-0.5 font-mono text-[10px] text-[#8a9099]">Esc</kbd>
                </div>
                <ul ref={listRef} id={listId} role="listbox" aria-label="Results" className="max-h-[min(56vh,460px)] overflow-y-auto overscroll-contain p-2">
                  {rows.length ? (
                    rows
                  ) : (
                    <li className="px-3 py-10 text-center text-sm text-[#8a9099]">
                      Nothing for “{q}”. Try a driver code like <span className="type-code">NOR</span> or a section like “odds”.
                    </li>
                  )}
                </ul>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-[#6f757e]">
                  <span className="flex gap-4">
                    <span>↑↓ move</span>
                    <span>↵ open</span>
                    <span>Esc close</span>
                  </span>
                  <span>Following {followName}</span>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
