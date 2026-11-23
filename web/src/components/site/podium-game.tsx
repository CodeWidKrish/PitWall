"use client";

import { type CSSProperties, type PointerEvent as RPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { useFollow } from "@/components/follow";
import { toast } from "@/components/ui/toaster";
import { driver, type NextRace, pct, shortRaceName, team } from "@/lib/data";

type Slots = [string | null, string | null, string | null];

/** Chance of an exact podium order under the model (Plackett-Luce on win odds). */
function podiumChance(odds: Map<string, number>, picks: string[]) {
  let rest = [...odds.values()].reduce((a, b) => a + b, 0);
  let p = 1;
  for (const id of picks) {
    const w = odds.get(id) ?? 0;
    p *= w / rest;
    rest -= w;
  }
  return p;
}

function oneIn(p: number) {
  if (p <= 0) return "—";
  const n = 1 / p;
  return n < 10 ? n.toFixed(1) : Math.round(n).toLocaleString("en-GB");
}

/**
 * Beat the model: drag three drivers onto the podium (or tap to fill the next step),
 * lock it in and see how likely the model thinks your call is.
 */
export function PodiumGame({ race }: { race: NextRace }) {
  const { followId } = useFollow();
  const key = `pitwall:podium:${race.season}-${race.round}`;
  const odds = useMemo(() => new Map(race.odds.map((o) => [o.driver_id, o.p_win])), [race]);
  const modelPick = race.odds.slice(0, 3).map((o) => o.driver_id);
  const [slots, setSlots] = useState<Slots>([null, null, null]);
  const [locked, setLocked] = useState(false);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const seats = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    // Restore a saved call once the page has hydrated.
    const t = setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(key) ?? "null") as Slots | null;
        if (saved?.every(Boolean)) {
          setSlots(saved);
          setLocked(true);
        }
      } catch {
        /* nothing saved */
      }
    }, 0);
    return () => clearTimeout(t);
  }, [key]);

  const place = (id: string, slot?: number) => {
    if (locked) return;
    setSlots((s) => {
      const next = s.map((x) => (x === id ? null : x)) as Slots;
      const target = slot ?? next.findIndex((x) => x === null);
      if (target < 0) return s;
      next[target] = id;
      return next;
    });
  };

  const seatAt = (x: number, y: number) =>
    seats.current.findIndex((el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top - 20 && y <= r.bottom + 20;
    });

  const startDrag = (e: RPointerEvent, id: string) => {
    if (locked || e.button !== 0) return;
    const startX = e.clientX,
      startY = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
      moved = true;
      setDrag({ id, x: ev.clientX, y: ev.clientY });
      const s = seatAt(ev.clientX, ev.clientY);
      setOver(s >= 0 ? s : null);
    };
    const up = (ev: PointerEvent) => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      setDrag(null);
      setOver(null);
      if (!moved) return place(id);
      const s = seatAt(ev.clientX, ev.clientY);
      if (s >= 0) place(id, s);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  };

  const full = slots.every(Boolean);
  const picks = slots.filter(Boolean) as string[];
  const yourP = full ? podiumChance(odds, picks) : 0;
  const modelP = podiumChance(odds, modelPick);
  const sameAsModel = full && picks.every((p, i) => p === modelPick[i]);
  const name = shortRaceName(race.race_name);

  const lock = () => {
    if (!full) return;
    setLocked(true);
    try {
      localStorage.setItem(key, JSON.stringify(slots));
    } catch {
      /* ignore */
    }
  };
  const clear = () => {
    setSlots([null, null, null]);
    setLocked(false);
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  };
  const share = async () => {
    const codes = picks.map((p) => driver(p).code).join(" · ");
    const text = `My ${name} GP podium: ${codes}. PitWall's model gives it 1 in ${oneIn(yourP)}. ${location.origin}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast({ title: "Copied your call", body: "Paste it anywhere to challenge a friend." });
      }
    } catch {
      /* cancelled */
    }
  };

  const verdict = !full
    ? "Fill the podium, then lock it in."
    : !locked
      ? "Ready. Lock it in to see the verdict."
      : sameAsModel
        ? "Same call as the model. Safe, sensible, and still less likely than not."
        : yourP > modelP * 0.5
          ? "A strong call. The model rates it close to its own pick."
          : yourP > modelP * 0.1
            ? "A brave call. Possible, but the model would bet against it."
            : "A long shot. If this lands, frame it.";

  const order = [1, 0, 2]; // P2, P1, P3 left to right
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-14">
      {/* Stage */}
      <div className="panel relative overflow-hidden px-4 pt-6 md:px-6" style={{ "--c": "var(--you)" } as CSSProperties}>
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 transition-[clip-path,opacity] duration-1000 ease-expo ${locked ? "opacity-[0.07] [clip-path:inset(0_0_0_0)]" : "opacity-0 [clip-path:inset(0_100%_0_0)]"}`}
          style={{ background: "repeating-conic-gradient(#0b0c0e 0 25%, #ecedef 0 50%) 0 0 / 36px 36px" }}
        />
        <span className="tag">{name} podium · your call</span>
        <div className="mt-5 flex flex-wrap gap-2" aria-label="Drivers to place" role="list">
          {race.odds.map((o) => {
            const d = driver(o.driver_id);
            const used = slots.includes(o.driver_id);
            const c = team(o.team).colour;
            return (
              <button
                key={o.driver_id}
                type="button"
                role="listitem"
                disabled={locked}
                onPointerDown={(e) => startDrag(e, o.driver_id)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), place(o.driver_id))}
                aria-label={`${d.name}, ${pct(o.p_win)} to win. Press to place on the podium.`}
                className={`inline-flex touch-none select-none items-center gap-2 rounded-full border px-3 py-2 font-mono text-xs font-semibold tracking-[0.06em] transition-[opacity,transform,border-color] duration-300 ease-expo ${
                  used ? "pointer-events-none opacity-25" : "cursor-grab hover:-translate-y-0.5"
                } ${o.driver_id === followId ? "border-[var(--you)]" : "border-rule"} bg-panel`}
              >
                <i className="size-3 rounded-full" style={{ background: c }} />
                {d.code}
                <span className="font-normal text-sub">{pct(o.p_win, 0)}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-8 grid grid-cols-3 items-end gap-3">
          {order.map((slot) => {
            const id = slots[slot];
            const d = id ? driver(id) : null;
            const c = d ? team(d.team_now).colour : undefined;
            const h = slot === 0 ? "h-[150px]" : slot === 1 ? "h-[108px]" : "h-[78px]";
            return (
              <div key={slot} className="grid justify-items-center gap-2.5">
                <div
                  ref={(el) => {
                    seats.current[slot] = el;
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`${["First", "Second", "Third"][slot]} place${d ? `: ${d.name}. Press to remove.` : ", empty"}`}
                  onClick={() => !locked && id && setSlots((s) => s.map((x, i) => (i === slot ? null : x)) as Slots)}
                  onKeyDown={(e) => e.key === "Enter" && !locked && id && setSlots((s) => s.map((x, i) => (i === slot ? null : x)) as Slots)}
                  className={`grid min-h-[92px] w-full place-items-center rounded-2xl border-[1.5px] p-2 text-center transition-[transform,background,border-color] duration-300 ease-expo ${
                    d ? "border-transparent text-[#0b0c0e]" : over === slot ? "scale-[1.04] border-[var(--you)] bg-[color-mix(in_srgb,var(--you)_14%,transparent)]" : "border-dashed border-rule"
                  }`}
                  style={d ? { background: c } : undefined}
                >
                  {d ? (
                    <span>
                      <span className="type-code block text-[clamp(26px,4vw,38px)] leading-none">{d.code}</span>
                      <small className="mt-1 block font-mono text-[10px] uppercase tracking-[0.12em] opacity-70">{d.last_name}</small>
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] uppercase leading-snug tracking-[0.1em] text-sub">
                      Drop or tap
                      <br />a driver
                    </span>
                  )}
                </div>
                <div
                  className={`grid w-full place-items-center rounded-t-[10px] bg-ink font-display text-[44px] font-extrabold text-paper transition-[height] duration-700 ease-expo [font-stretch:70%] ${h}`}
                >
                  {slot + 1}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Verdict */}
      <div className="grid content-start gap-6" aria-live="polite">
        <p className="font-display text-[clamp(84px,12vw,170px)] font-extrabold leading-[0.8] tracking-[-0.02em] [font-stretch:70%]">
          <small className="type-voice mr-2 text-[0.26em] font-normal text-you">1 in</small>
          {locked ? oneIn(yourP) : <span className="opacity-20">—</span>}
        </p>
        <p className="type-voice max-w-[24ch] text-[26px] leading-tight">{verdict}</p>
        <div className="grid gap-2.5 border-t border-rule pt-5 font-mono text-xs">
          {[
            { label: "Your podium", p: locked ? yourP : 0, codes: locked ? picks : [], c: "var(--you)" },
            { label: "Model's pick", p: modelP, codes: modelPick, c: "var(--accent)" },
          ].map((row) => (
            <div key={row.label} className="grid grid-cols-[110px_minmax(0,1fr)_72px] items-center gap-3">
              <span className="text-sub">{row.label}</span>
              <span className="h-2 overflow-hidden rounded-full bg-rule">
                <i
                  className="block h-full rounded-full transition-[width] duration-1000 ease-expo"
                  style={{ width: `${Math.min(100, (row.p / modelP) * 100)}%`, background: row.c }}
                />
              </span>
              <span className="text-right">{row.p ? pct(row.p, 2) : "—"}</span>
              <span />
              <span className="col-span-2 -mt-1 text-[11px] text-sub">{row.codes.map((c) => driver(c).code).join(" · ")}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2.5">
          {!locked ? (
            <button type="button" className="btn btn-ink" onClick={lock} disabled={!full} data-cursor="Lock" aria-disabled={!full}>
              <span className="lbl">
                <i>Lock it in</i>
                <i>Lock it in</i>
              </span>
              <span className="dot" />
            </button>
          ) : (
            <button type="button" className="btn btn-ink" onClick={share} data-cursor="Share">
              <span className="lbl">
                <i>Share my call</i>
                <i>Share my call</i>
              </span>
              <span className="dot" />
            </button>
          )}
          <button type="button" className="btn btn-line" onClick={clear}>
            <span className="lbl">
              <i>{locked ? "Change my call" : "Clear"}</i>
              <i>{locked ? "Change my call" : "Clear"}</i>
            </span>
          </button>
        </div>
        <p className="text-sm text-sub">
          Exact order, using the model&apos;s pre-race win odds. Your call stays in this browser; after the race, the
          record shows how the model did.
        </p>
      </div>

      {/* Drag ghost */}
      {drag ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed left-0 top-0 z-[95] inline-flex items-center gap-2 rounded-full px-3 py-2 font-mono text-xs font-semibold text-[#0b0c0e] shadow-[0_18px_40px_-12px_rgb(0_0_0/0.5)]"
          style={{
            transform: `translate(${drag.x}px, ${drag.y}px) translate(-50%, -50%) rotate(-4deg)`,
            background: team(driver(drag.id).team_now).colour,
          }}
        >
          {driver(drag.id).code}
        </div>
      ) : null}
    </div>
  );
}
