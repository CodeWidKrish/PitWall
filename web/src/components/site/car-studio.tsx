"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useFollow } from "@/components/follow";
import type { Hotspot, Lighting, StudioController, View } from "@/components/three/studio-scene";
import { driver, site, team } from "@/lib/data";

const TYRES = [
  { k: "Soft", c: "#FF3B3B" },
  { k: "Medium", c: "#FFD12E" },
  { k: "Hard", c: "#F2F4F7" },
  { k: "Inter", c: "#3BD16F" },
  { k: "Wet", c: "#2E8BFF" },
];
const LIGHTS: { k: Lighting; label: string }[] = [
  { k: "studio", label: "Studio" },
  { k: "night", label: "Night" },
  { k: "sunset", label: "Sunset" },
];
const VIEWS: { k: View; label: string }[] = [
  { k: "hero", label: "Turntable" },
  { k: "front", label: "Front" },
  { k: "side", label: "Side" },
  { k: "top", label: "Top" },
  { k: "rear", label: "Rear" },
];
const NOTES: Record<string, { title: string; body: string }> = {
  wing: {
    title: "Front wing",
    body: "The first part to touch the air. It makes about a quarter of the downforce and steers the airflow around the front tyres.",
  },
  halo: {
    title: "Halo",
    body: "A titanium hoop over the cockpit, strong enough to carry the weight of a double-decker bus. Mandatory since 2018.",
  },
  sidepod: {
    title: "Sidepods",
    body: "House the radiators. Their shape feeds clean air to the back of the car and the floor.",
  },
  floor: {
    title: "Floor",
    body: "The biggest source of downforce. Tunnels underneath speed the air up and suck the car onto the track.",
  },
  rear: {
    title: "Rear wing and DRS",
    body: "On a straight, within a second of the car ahead, the top flap opens to cut drag: worth roughly 10 to 15 km/h.",
  },
  tyre: {
    title: "Tyres",
    body: "Three dry compounds and two for rain. Softer is faster but wears sooner, which is why strategy decides races.",
  },
};

function accentFor(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150 ? "#16181c" : "#f2f3f5";
}

/** The car up close: turntable, liveries, tyres, lighting and the parts that matter. */
export function CarStudio() {
  const { followId } = useFollow();
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const ctl = useRef<StudioController | null>(null);
  const myTeam = driver(followId).team_now ?? "mercedes";
  const [teamId, setTeamId] = useState<string | null>(null);
  const shownTeam = teamId ?? myTeam;
  const [tyre, setTyre] = useState(0);
  const [light, setLight] = useState<Lighting>("studio");
  const [view, setView] = useState<View>("hero");
  const [spots, setSpots] = useState<Hotspot[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "none">("idle");
  const teams = Object.keys(site.teams).filter((t) => team(t).name !== t);

  useEffect(() => {
    if (!host.current) return;
    let disposed = false;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting || ctl.current || !canvas.current || !host.current) return;
        io.disconnect();
        setState("loading");
        const c = team(myTeam).colour;
        void import("@/components/three/studio-scene").then(async ({ createStudio }) => {
          if (disposed || !canvas.current || !host.current) return;
          const s = await createStudio(canvas.current, host.current, c, accentFor(c), setSpots);
          if (disposed) return s?.dispose();
          ctl.current = s;
          setState(s ? "ready" : "none");
        });
      },
      { rootMargin: "300px 0px" },
    );
    io.observe(host.current);
    return () => {
      disposed = true;
      io.disconnect();
      ctl.current?.dispose();
      ctl.current = null;
    };
    // built once; livery changes go through the controller
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const c = team(shownTeam).colour;
    ctl.current?.setLivery(c, accentFor(c));
  }, [shownTeam, state]);

  const t = team(shownTeam);
  const note = open ? NOTES[open] : null;

  return (
    <div className="grid gap-6">
      <div
        ref={host}
        className="relative h-[clamp(460px,72vh,760px)] overflow-hidden rounded-[24px] border border-rule bg-[radial-gradient(70%_60%_at_50%_45%,rgb(143_69_255/0.16),transparent_70%),#08090b]"
        style={{ "--c": t.colour } as CSSProperties}
      >
        {/* giant team name behind the car */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-[12%] select-none text-center font-display text-[clamp(90px,17vw,260px)] font-extrabold uppercase italic leading-none text-transparent opacity-60 transition-[-webkit-text-stroke-color] duration-700 [-webkit-text-stroke:1.5px_color-mix(in_srgb,var(--c)_55%,transparent)] [font-stretch:62%]"
        >
          {t.name}
        </span>
        <canvas
          ref={canvas}
          className="absolute inset-0 size-full cursor-grab touch-pan-y active:cursor-grabbing"
          aria-label={`3D model of a modern F1 car in ${t.name} colours. Drag to turn it.`}
        />
        {state !== "ready" ? (
          <div className="absolute inset-0 grid place-items-center font-mono text-[11px] uppercase tracking-[0.16em] text-[#8a9099]">
            {state === "none" ? "3D car unavailable on this device" : "Rolling the car out…"}
          </div>
        ) : null}

        {/* hotspots */}
        {spots
          .filter((s) => s.visible)
          .map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setOpen(open === s.id ? null : s.id)}
              aria-label={NOTES[s.id].title}
              aria-expanded={open === s.id}
              className="group absolute left-0 top-0 z-[2] flex items-center gap-2 will-change-transform"
              style={{ transform: `translate(${s.x - 9}px, ${s.y - 9}px)` }}
            >
              <span className="relative grid size-[18px] place-items-center rounded-full border-2 border-white bg-white/25 shadow-[0_0_0_0_rgb(255_255_255/0.5)] [animation:pinPulse_2.2s_infinite]">
                <i className={`size-1.5 rounded-full ${open === s.id ? "bg-[var(--c)]" : "bg-white"}`} />
              </span>
              <span className="rounded-md border border-white/15 bg-[rgb(10_11_13/0.82)] px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#ecedef] opacity-0 backdrop-blur-sm transition-opacity duration-300 group-hover:opacity-100 max-md:hidden">
                {NOTES[s.id].title}
              </span>
            </button>
          ))}

        {/* note card */}
        <div
          className={`absolute bottom-24 left-4 z-[3] w-[min(340px,calc(100%-32px))] rounded-2xl border border-white/10 bg-[rgb(12_13_16/0.86)] p-4 text-[#ecedef] backdrop-blur-xl transition-[opacity,transform] duration-500 ease-expo md:left-6 ${
            note ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
          }`}
          role="dialog"
          aria-label={note?.title ?? "Part"}
        >
          {note ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <strong className="type-voice text-2xl font-normal leading-none">{note.title}</strong>
                <button type="button" onClick={() => setOpen(null)} aria-label="Close" className="font-mono text-sm text-[#8a9099] hover:text-white">
                  ✕
                </button>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-[#b4b9c0]">{note.body}</p>
            </>
          ) : null}
        </div>

        {/* team strip */}
        <div className="absolute left-4 top-4 z-[3] grid gap-1 md:left-6 md:top-6">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8a9099]">Livery</span>
          <span className="type-display text-3xl leading-none text-[#ecedef]">{t.name}</span>
        </div>

        {/* control bar */}
        <div className="absolute inset-x-3 bottom-3 z-[3] flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-[rgb(10_11_13/0.72)] p-2 backdrop-blur-xl md:inset-x-6 md:bottom-6">
          <div className="flex gap-1" role="group" aria-label="Tyre compound">
            {TYRES.map((ty, i) => (
              <button
                key={ty.k}
                type="button"
                aria-pressed={tyre === i}
                aria-label={`${ty.k} tyres`}
                title={ty.k}
                onClick={() => {
                  setTyre(i);
                  ctl.current?.setTyre(ty.c);
                }}
                className={`grid size-9 place-items-center rounded-full transition-colors ${tyre === i ? "bg-white/15" : "hover:bg-white/10"}`}
              >
                <span className="size-5 rounded-full border-[3px] bg-[#111]" style={{ borderColor: ty.c }} />
              </button>
            ))}
          </div>
          <div className="flex rounded-full bg-white/5 p-1" role="group" aria-label="Lighting">
            {LIGHTS.map((l) => (
              <button
                key={l.k}
                type="button"
                aria-pressed={light === l.k}
                onClick={() => {
                  setLight(l.k);
                  ctl.current?.setLighting(l.k);
                }}
                className={`rounded-full px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                  light === l.k ? "bg-[#ecedef] text-[#0b0c0e]" : "text-[#a4aab2] hover:text-white"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <div className="flex rounded-full bg-white/5 p-1 max-sm:w-full max-sm:justify-between" role="group" aria-label="Camera angle">
            {VIEWS.map((v) => (
              <button
                key={v.k}
                type="button"
                aria-pressed={view === v.k}
                onClick={() => {
                  setView(v.k);
                  ctl.current?.setView(v.k);
                }}
                className={`rounded-full px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                  view === v.k ? "bg-[#ecedef] text-[#0b0c0e]" : "text-[#a4aab2] hover:text-white"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* livery picker */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Paint the car in a team's colours">
        {teams.map((id) => {
          const tm = team(id);
          const on = id === shownTeam;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTeamId(id)}
              aria-pressed={on}
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition-[border-color,transform] duration-300 ease-expo hover:-translate-y-0.5 ${
                on ? "border-[var(--c)] bg-panel" : "border-rule"
              }`}
              style={{ "--c": tm.colour } as CSSProperties}
            >
              <i className="size-3 rounded-full" style={{ background: tm.colour }} />
              {tm.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
