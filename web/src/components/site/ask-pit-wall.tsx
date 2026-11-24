"use client";

import { type CSSProperties, type FormEvent, Fragment, useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useFollow } from "@/components/follow";
import { driver, shortRaceName, site, team } from "@/lib/data";

interface Turn {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  error?: boolean;
}

const KEY = "pitwall:ask";
export const openAsk = (q?: string) => window.dispatchEvent(new CustomEvent("pitwall:ask", { detail: q }));

type LenisLike = { stop: () => void; start: () => void };
const lenis = () => (window as unknown as { __lenis?: LenisLike | null }).__lenis ?? null;

function suggestions(): string[] {
  const r = site.next_race;
  const fav = r ? driver(r.odds[0]?.driver_id).last_name : "the favourite";
  const name = r ? shortRaceName(r.race_name) : "the next race";
  return [
    `Why is ${fav} favourite in ${name}?`,
    "How accurate has the model been?",
    `What if Ferrari were much faster in ${site.forecast?.season ?? "next season"}?`,
    "Which team is most likely to get a one-two?",
  ];
}

/** Plain text with short "- " lists, as the engineer is told to answer. */
function Answer({ text, reveal }: { text: string; reveal: boolean }) {
  const lines = text.split("\n").filter((l) => l.trim());
  return (
    <div className={`grid gap-2 ${reveal ? "[&>*]:[animation:heroIn_.6s_var(--ease-out-expo)_both]" : ""}`}>
      {lines.map((l, i) =>
        /^\s*[-•*]\s+/.test(l) ? (
          <p key={i} className="relative pl-4" style={{ animationDelay: `${i * 60}ms` }}>
            <span aria-hidden="true" className="absolute left-0 top-[0.62em] h-px w-2 bg-current opacity-60" />
            {l.replace(/^\s*[-•*]\s+/, "").replace(/\*\*/g, "")}
          </p>
        ) : (
          <p key={i} style={{ animationDelay: `${i * 60}ms` }}>
            {l.replace(/\*\*/g, "")}
          </p>
        ),
      )}
    </div>
  );
}

/**
 * "Ask the pit wall": questions about the odds, a driver, the record or a what-if, answered
 * only from PitWall's own data. Each answer lists the data it used.
 */
export function AskPitWall() {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [fresh, setFresh] = useState(-1);
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const title = useId();
  const { followId } = useFollow();
  // On phones and tablets the button steps aside while you scroll down through content, and comes
  // back as soon as you scroll up or stop near the end.
  const [tucked, setTucked] = useState(false);
  useEffect(() => {
    let last = scrollY;
    let idle: ReturnType<typeof setTimeout> | undefined;
    // Over the opening race the hero's own buttons are enough.
    const overHero = () => scrollY < innerHeight * 0.55;
    const onScroll = () => {
      const y = scrollY;
      if (innerWidth >= 1024) return setTucked(false);
      const end = y + innerHeight > document.documentElement.scrollHeight - 200;
      if ((y > last + 6 && !end) || overHero()) setTucked(true);
      else if (y < last - 6 || end) setTucked(false);
      last = y;
      clearTimeout(idle);
      idle = setTimeout(() => setTucked(overHero()), 700);
    };
    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    return () => {
      clearTimeout(idle);
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
    };
  }, []);
  const followed = driver(followId);
  const teamId = followed.team_now ?? followed.team_next ?? "red_bull";
  const teamColour = team(teamId).colour;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- portal target and saved chat exist only after mount
    setMounted(true);
    try {
      const saved = sessionStorage.getItem(KEY);
      if (saved) setTurns(JSON.parse(saved) as Turn[]);
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(turns.slice(-16)));
    } catch {
      /* storage unavailable */
    }
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim().slice(0, 600);
      if (!question || busy) return;
      const next: Turn[] = [...turns.filter((t) => !t.error), { role: "user", content: question }];
      setTurns(next);
      setQ("");
      setBusy(true);
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: next.slice(-8).map(({ role, content }) => ({ role, content })) }),
        });
        const data = (await res.json()) as { answer?: string; sources?: string[]; error?: string };
        setTurns((t) => {
          setFresh(t.length);
          return [
            ...t,
            data.answer
              ? { role: "assistant", content: data.answer, sources: data.sources }
              : { role: "assistant", content: data.error ?? "Lost the radio. Try again.", error: true },
          ];
        });
      } catch {
        setTurns((t) => [...t, { role: "assistant", content: "Lost the radio. Check your connection and try again.", error: true }]);
      } finally {
        setBusy(false);
        setTimeout(() => input.current?.focus(), 30);
      }
    },
    [busy, turns],
  );

  // Open from anywhere (command palette, buttons), optionally with a question.
  useEffect(() => {
    const on = (e: Event) => {
      setOpen(true);
      const qq = (e as CustomEvent<string | undefined>).detail;
      if (qq) void send(qq);
    };
    addEventListener("pitwall:ask", on);
    return () => removeEventListener("pitwall:ask", on);
  }, [send]);

  useEffect(() => {
    if (!open) return;
    const back = launcher.current;
    lenis()?.stop();
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("keydown", key);
    const t = setTimeout(() => input.current?.focus(), 350);
    return () => {
      lenis()?.start();
      removeEventListener("keydown", key);
      clearTimeout(t);
      back?.focus({ preventScroll: true });
    };
  }, [open]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send(q);
  };

  return (
    <>
      <button
        ref={launcher}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Ask the pit wall"
        title="Ask the pit wall"
        style={{ "--tc": teamColour } as CSSProperties}
        className={`pit-launch group fixed bottom-[max(20px,env(safe-area-inset-bottom))] right-5 z-[90] flex h-[62px] items-center rounded-full border border-white/12 bg-[linear-gradient(180deg,rgb(24_25_30/0.94),rgb(10_11_13/0.96))] pl-3 pr-2 text-[#ecedef] shadow-[0_24px_60px_-22px_rgb(0_0_0/0.95),inset_0_1px_0_rgb(255_255_255/0.07)] transition-[transform,opacity,box-shadow,border-color] duration-500 ease-expo hover:-translate-y-0.5 hover:border-white/25 ${
          open || tucked ? "pointer-events-none translate-y-[140%] opacity-0" : ""
        } max-sm:right-3 max-sm:h-[50px] max-sm:pl-2`}
      >
        {/* label slides out on hover and focus */}
        <span
          aria-hidden="true"
          className="grid max-w-0 overflow-hidden whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.14em] opacity-0 transition-[max-width,opacity,margin] duration-500 ease-expo group-hover:mr-2 group-hover:max-w-[180px] group-hover:opacity-100 group-focus-visible:mr-2 group-focus-visible:max-w-[180px] group-focus-visible:opacity-100"
        >
          Ask the pit wall
        </span>
        <span className="relative block h-[46px] w-[150px] max-sm:h-[38px] max-sm:w-[112px]" aria-hidden="true">
          {/* the team colour glowing on the track under the car */}
          <span className="pit-glow pointer-events-none absolute inset-x-1 bottom-0 h-5 rounded-[50%]" />
          {/* speed lines behind the car */}
          <span className="pit-streaks pointer-events-none absolute inset-y-2 -left-4 w-12">
            <i />
            <i />
            <i />
          </span>
          <Image
            key={teamId}
            src={`/cars/${teamId}-side.webp`}
            alt=""
            width={640}
            height={159}
            unoptimized
            priority
            className="pit-car absolute inset-x-0 bottom-[5px] h-auto w-full drop-shadow-[0_6px_6px_rgb(0_0_0/0.7)]"
          />
        </span>
      </button>

      {mounted
        ? createPortal(
            <div className={`fixed inset-0 z-[125] overflow-hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
              <div
                className={`absolute inset-0 bg-[rgb(5_6_8/0.5)] backdrop-blur-[2px] transition-opacity duration-500 ${open ? "opacity-100" : "opacity-0"}`}
                onClick={() => setOpen(false)}
              />
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby={title}
                className={`absolute inset-y-0 right-0 flex w-full flex-col border-l border-white/10 bg-[#0e0f12] text-[#ecedef] shadow-[-40px_0_120px_-40px_rgb(0_0_0/0.9)] transition-transform duration-700 ease-[cubic-bezier(.76,0,.24,1)] sm:w-[440px] ${
                  open ? "translate-x-0" : "translate-x-full"
                }`}
              >
                <header
                  style={{ "--tc": teamColour } as CSSProperties}
                  className="relative flex items-start justify-between gap-4 overflow-hidden border-b border-white/10 px-6 pb-6 pt-[118px]"
                >
                  <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-16 size-72 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--tc)_38%,transparent),transparent_68%)]" />
                  <Image
                    key={`${teamId}-hero`}
                    src={`/cars/${teamId}-hero.webp`}
                    alt=""
                    aria-hidden="true"
                    width={820}
                    height={282}
                    unoptimized
                    className={`pointer-events-none absolute right-2 top-5 h-auto w-[300px] drop-shadow-[0_18px_18px_rgb(0_0_0/0.75)] ${open ? "[animation:carIn_1s_var(--ease-out-expo)_.15s_both]" : "opacity-0"}`}
                  />
                  <div className="grid gap-1.5">
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8a9099]">Team radio · PitWall data only</span>
                    <h2 id={title} className="type-voice text-[30px] leading-none">
                      Ask the pit wall
                    </h2>
                  </div>
                  <div className="absolute left-5 top-5 z-[1] flex gap-2">
                    {turns.length ? (
                      <button
                        type="button"
                        onClick={() => setTurns([])}
                        tabIndex={open ? 0 : -1}
                        className="h-9 rounded-full border border-white/15 px-3 font-mono text-[10px] uppercase tracking-[0.12em] text-[#8a9099] hover:text-[#ecedef]"
                      >
                        Clear
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      tabIndex={open ? 0 : -1}
                      aria-label="Close"
                      className="grid size-9 place-items-center rounded-full border border-white/15"
                    >
                      <svg viewBox="0 0 12 12" className="size-3" aria-hidden="true">
                        <path d="m2 2 8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                    </button>
                  </div>
                </header>

                <div ref={log} className="flex-1 overflow-y-auto overscroll-contain px-6 py-6" aria-live="polite" aria-busy={busy}>
                  {!turns.length ? (
                    <div className="grid gap-6">
                      <p className="max-w-[34ch] text-[15px] leading-relaxed text-[#b4b8bf]">
                        Ask about the odds, a driver, the model&apos;s record or a what-if. Answers come only from
                        PitWall&apos;s own numbers, and each one shows the data it used.
                      </p>
                      <ul className="grid gap-2">
                        {suggestions().map((s) => (
                          <li key={s}>
                            <button
                              type="button"
                              tabIndex={open ? 0 : -1}
                              onClick={() => void send(s)}
                              className="group flex w-full items-center justify-between gap-4 rounded-xl border border-white/10 px-4 py-3 text-left text-[14px] transition-colors hover:border-white/25 hover:bg-white/[0.03]"
                            >
                              {s}
                              <span aria-hidden="true" className="text-[#8a9099] transition-transform duration-300 group-hover:translate-x-1">
                                →
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <ol className="grid gap-6">
                      {turns.map((t, i) => (
                        <li key={i} className={t.role === "user" ? "flex justify-end" : "grid gap-2"}>
                          {t.role === "user" ? (
                            <p className="max-w-[85%] rounded-2xl rounded-br-md bg-white/[0.08] px-4 py-2.5 text-[15px] leading-snug">{t.content}</p>
                          ) : (
                            <Fragment>
                              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--you)]">Pit wall</span>
                              <div className={`text-[15px] leading-relaxed ${t.error ? "text-[#ff8a8a]" : "text-[#e3e5e8]"}`}>
                                <Answer text={t.content} reveal={i === fresh} />
                              </div>
                              {t.sources?.length ? (
                                <ul className="flex flex-wrap gap-1.5 pt-1" aria-label="Data used">
                                  {t.sources.map((s) => (
                                    <li key={s} className="rounded-full border border-white/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[#8a9099]">
                                      {s}
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </Fragment>
                          )}
                        </li>
                      ))}
                      {busy ? (
                        <li className="grid gap-2" aria-label="The pit wall is checking the data">
                          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--you)]">Pit wall</span>
                          <span className="flex h-4 items-end gap-[3px]" aria-hidden="true">
                            {[0, 1, 2, 3, 4].map((k) => (
                              <i key={k} className="block w-[3px] rounded-[1px] bg-[#8a9099]" style={{ animation: `eq 0.9s ${k * -0.18}s ease-in-out infinite` }} />
                            ))}
                          </span>
                        </li>
                      ) : null}
                    </ol>
                  )}
                </div>

                <form onSubmit={submit} className="border-t border-white/10 px-6 pb-[max(20px,env(safe-area-inset-bottom))] pt-4">
                  <div className="flex items-end gap-2 rounded-2xl border border-white/15 bg-white/[0.03] p-2 pl-4 focus-within:border-white/35">
                    <label htmlFor={`${title}-q`} className="sr-only">
                      Your question
                    </label>
                    <textarea
                      id={`${title}-q`}
                      ref={input}
                      value={q}
                      rows={1}
                      maxLength={600}
                      tabIndex={open ? 0 : -1}
                      onChange={(e) => setQ(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void send(q);
                        }
                      }}
                      placeholder={`Ask about ${site.next_race ? shortRaceName(site.next_race.race_name) : "the odds"}, a driver, a what-if…`}
                      className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent py-2 text-[15px] outline-none placeholder:text-[#6f757e] focus-visible:!outline-none"
                    />
                    <button
                      type="submit"
                      disabled={busy || !q.trim()}
                      tabIndex={open ? 0 : -1}
                      aria-label="Send"
                      className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#ecedef] text-[#0b0c0e] transition-opacity disabled:opacity-30"
                    >
                      <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
                        <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                      </svg>
                    </button>
                  </div>
                  <p className="mt-2.5 font-mono text-[10px] uppercase leading-relaxed tracking-[0.1em] text-[#6f757e]">
                    Model odds, not certainties · not betting advice
                  </p>
                </form>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
