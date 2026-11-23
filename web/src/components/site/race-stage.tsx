"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFollow } from "@/components/follow";
import type { CamMode, RaceController, SceneCar, Telemetry } from "@/components/three/race-scene";
import { driver, site, team } from "@/lib/data";
import { sound } from "@/lib/sound";

const CAMS: { k: CamMode; label: string }[] = [
  { k: "tv", label: "Broadcast" },
  { k: "board", label: "Onboard" },
  { k: "orbit", label: "Orbit" },
];

function accentFor(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150 ? "#0E1013" : "#ECEDEF";
}

interface Banner {
  id: number;
  kind: "overtake" | "fastest" | "radio" | "info";
  text: string;
  carId: string;
}

/**
 * The 3D night race behind the hero: start lights, then the model's top ten
 * racing. Broadcast, onboard and orbit cameras, a live timing tower, broadcast
 * graphics and, with sound on, real F1 cars and team radio.
 */
export function RaceStage() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const ctrl = useRef<RaceController | null>(null);
  const { followId, setFollow } = useFollow();
  const [ok, setOk] = useState(true);
  const [cam, setCam] = useState<CamMode>("tv");
  const [lights, setLights] = useState(0); // 0..5 lit, 6 = out
  const [shot, setShot] = useState("");
  const [tower, setTower] = useState<{ id: string; gap: string; delta: -1 | 0 | 1 }[]>([]);
  const [lap, setLap] = useState(1);
  const [tel, setTel] = useState<Telemetry | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [tags, setTags] = useState<{ id: string; x: number; y: number; visible: boolean }[]>([]);
  const camRef = useRef<CamMode>("tv");
  const bannerId = useRef(0);
  const launched = useRef(false);
  const heroVisible = useRef(true);

  const grid: SceneCar[] = useMemo(() => {
    const odds = site.next_race?.odds ?? [];
    const top = odds[0]?.p_win ?? 1;
    // Phones race the top six to keep the frame rate up; larger screens race the top ten.
    const count = typeof window !== "undefined" && innerWidth < 760 ? 6 : 10;
    return odds.slice(0, count).map((o) => {
      const d = driver(o.driver_id);
      const colour = team(o.team).colour;
      return { id: d.id, code: d.code, colour, accent: accentFor(colour), strength: Math.sqrt(o.p_win / top) };
    });
  }, []);
  const inGrid = grid.some((g) => g.id === followId);

  const showBanner = useCallback((b: Omit<Banner, "id">) => {
    const id = ++bannerId.current;
    setBanner({ ...b, id });
    if (b.kind === "radio") sound?.radio(b.text);
    setTimeout(() => setBanner((cur) => (cur?.id === id ? null : cur)), b.kind === "radio" ? 5200 : 3800);
  }, []);

  // Build the scene once.
  useEffect(() => {
    if (!canvas.current || !host.current) return;
    let disposed = false;
    let c: RaceController | null = null;
    // Start the 3D once the browser is idle, so the first paint and page scripts come first.
    const idle =
      "requestIdleCallback" in window
        ? (cb: () => void) => window.requestIdleCallback(cb, { timeout: 900 })
        : (cb: () => void) => window.setTimeout(cb, 200);
    idle(() => void import("@/components/three/race-scene").then(({ createRaceScene }) => {
      if (disposed || !canvas.current || !host.current) return;
      c = createRaceScene(canvas.current, host.current, grid, inGrid ? followId : grid[0]?.id, {
        onShot: setShot,
        onTower: (rows, l) => {
          setTower(rows);
          setLap(l);
        },
        onTelemetry: (t) => {
          setTel(t);
        },
        onBanner: (kind, text, carId) => showBanner({ kind, text, carId }),
        onTags: setTags,
      });
      if (!c) setOk(false);
      ctrl.current = c;
      if (launched.current) c?.launch();
    }));
    return () => {
      disposed = true;
      c?.dispose();
      ctrl.current = null;
      sound?.setView("off");
    };
    // The scene is built once; follow and camera changes go through the controller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Engine sound only while the race is on screen.
  useEffect(() => {
    if (!host.current) return;
    const io = new IntersectionObserver(
      ([e]) => {
        heroVisible.current = e.isIntersecting;
        sound?.setView(e.isIntersecting ? (camRef.current === "board" ? "near" : "far") : "off");
      },
      { threshold: 0.25 },
    );
    io.observe(host.current);
    const unsub = sound?.subscribe((on) => {
      if (on) sound?.setView(heroVisible.current ? (camRef.current === "board" ? "near" : "far") : "off");
    });
    return () => {
      io.disconnect();
      unsub?.();
    };
  }, []);

  // Start lights: one red light a second, then lights out.
  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (reduce) {
      launched.current = true;
      timers.push(setTimeout(() => setLights(6), 0));
      return () => timers.forEach(clearTimeout);
    }
    for (let k = 1; k <= 5; k++) timers.push(setTimeout(() => setLights(k), 250 + k * 520));
    timers.push(
      setTimeout(
        () => {
          setLights(6);
          launched.current = true;
          ctrl.current?.launch();
          sound?.launch();
          showBanner({ kind: "info", text: "Lights out and away we go", carId: grid[0]?.id ?? "" });
        },
        250 + 5 * 520 + 350 + Math.random() * 600,
      ),
    );
    return () => timers.forEach(clearTimeout);
  }, [grid, showBanner]);

  useEffect(() => {
    if (inGrid) ctrl.current?.setFollow(followId);
  }, [followId, inGrid]);

  const choose = (m: CamMode) => {
    setCam(m);
    camRef.current = m;
    ctrl.current?.setCam(m);
    host.current?.closest("section")?.setAttribute("data-cam", m);
    if (heroVisible.current) sound?.setView(m === "board" ? "near" : "far");
    if (m === "board") {
      const d = driver(inGrid ? followId : grid[0]?.id);
      showBanner({ kind: "info", text: `Onboard with ${d.name}`, carId: d.id });
    }
  };

  // Keyboard: 1 broadcast, 2 onboard, 3 orbit, while the race is on screen.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || /input|select|textarea/i.test(t.tagName) || !heroVisible.current) return;
      const m = ({ "1": "tv", "2": "board", "3": "orbit" } as Record<string, CamMode>)[e.key];
      if (m) host.current?.querySelector<HTMLButtonElement>(`[data-cam-btn="${m}"]`)?.click();
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);

  if (!ok) return null;
  const meId = inGrid ? followId : grid[0]?.id;
  const meColour = team(driver(meId).team_now).colour;

  return (
    <div ref={host} className="absolute inset-0 z-0" data-cam={cam}>
      <canvas
        ref={canvas}
        className="absolute inset-0 block size-full cursor-grab touch-pan-y active:cursor-grabbing"
        aria-label="3D race: the model's top ten drivers lapping a night street circuit. Drag to look around."
      />

      {/* Onboard letterbox */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-0 z-[4] bg-black transition-[height] duration-[900ms] ease-expo ${cam === "board" ? "h-[9vh]" : "h-0"}`}
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-[4] bg-black transition-[height] duration-[900ms] ease-expo ${cam === "board" ? "h-[9vh]" : "h-0"}`}
      />

      {/* Start lights */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute left-1/2 top-[140px] z-[5] flex -translate-x-1/2 gap-2 md:top-[96px] rounded-xl bg-[#121417]/90 px-4 py-3 shadow-[0_30px_80px_-20px_#000] transition-[opacity,transform] duration-700 ease-expo md:gap-3 ${
          lights === 6 ? "-translate-y-6 opacity-0" : "opacity-100"
        }`}
      >
        {[1, 2, 3, 4, 5].map((k) => (
          <span key={k} className="grid gap-1.5 rounded-full bg-[#050607] p-1.5">
            {[0, 1].map((r) => (
              <i
                key={r}
                className="block size-5 rounded-full transition-[background,box-shadow] duration-100 md:size-7"
                style={
                  lights >= k && lights < 6
                    ? { background: "#ff2a2a", boxShadow: "0 0 22px 4px rgb(255 42 42 / 0.6)" }
                    : { background: "#1a1c1f" }
                }
              />
            ))}
          </span>
        ))}
      </div>

      {/* Timing tower */}
      {tower.length ? (
        <div
          className={`absolute left-[max(20px,calc((100vw-1280px)/2+20px))] top-[92px] z-[3] w-[226px] overflow-hidden rounded-[10px] border border-white/10 bg-[rgb(10_11_13/0.8)] font-mono text-[11px] text-[#ecedef] backdrop-blur-md transition-opacity duration-500 max-xl:hidden [@media(max-height:820px)]:hidden ${
            cam === "board" ? "opacity-0" : "opacity-100"
          }`}
          aria-label="Live timing of the simulated race"
        >
          <div className="flex items-center justify-between bg-white/5 px-2.5 py-2 text-[10px] uppercase tracking-[0.14em] text-[#8a9099]">
            <span className="flex items-center gap-2">
              <i className="size-1.5 rounded-full bg-[#ff2a2a] [animation:blink_1.2s_infinite]" />
              Sim race
            </span>
            <b className="font-semibold text-[#ecedef]">Lap {lap}</b>
          </div>
          <ol className="relative h-[161px]">
            {tower.map((r, p) => {
              const d = driver(r.id);
              const c = team(d.team_now).colour;
              const mine = r.id === meId;
              // Top six, plus your driver in the last slot if they are further back.
              const myPos = tower.findIndex((x) => x.id === meId);
              if (p > 5 && !(mine && myPos > 5)) return null;
              const slot = p > 5 ? 6 : p;
              return (
                <li
                  key={r.id}
                  className="absolute inset-x-0 top-0 grid h-[23px] grid-cols-[16px_3px_34px_minmax(0,1fr)_10px] items-center gap-[7px] px-2.5 transition-[transform,background] duration-700 ease-expo"
                  style={{
                    transform: `translateY(${slot * 23}px)`,
                    background: mine
                      ? `color-mix(in srgb, ${c} 24%, transparent)`
                      : r.delta === 1
                        ? "rgb(29 191 107 / 0.16)"
                        : "transparent",
                  }}
                >
                  <span className="text-right text-[#8a9099]">{p + 1}</span>
                  <i className="h-[13px] w-[3px] rounded-[1px]" style={{ background: c }} />
                  <span className="type-code text-[13px]">{d.code}</span>
                  <span className="text-right tabular-nums text-[#a4aab2]">{r.gap}</span>
                  <span className={`text-[8px] ${r.delta === 1 ? "text-gain" : r.delta === -1 ? "text-[#ff2a2a]" : ""}`}>
                    {r.delta === 1 ? "▲" : r.delta === -1 ? "▼" : ""}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      {/* Broadcast banner */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none absolute left-1/2 top-[140px] z-[5] -translate-x-1/2 md:top-[96px] xl:left-[calc(max(20px,calc((100vw-1280px)/2+20px))+240px)] xl:translate-x-0"
      >
        {banner ? (
          <div
            key={banner.id}
            className="flex animate-[wipe_0.75s_var(--ease-out-expo)_both] items-stretch overflow-hidden rounded-lg font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#ecedef] shadow-[0_16px_40px_-18px_#000]"
          >
            <span
              className="flex items-center gap-2 px-3 py-2.5 text-white"
              style={{
                background:
                  banner.kind === "fastest"
                    ? "#8f45ff"
                    : banner.kind === "overtake"
                      ? "#1a8f55"
                      : banner.kind === "radio"
                        ? team(driver(banner.carId).team_now).colour
                        : "#c4141f",
                color: banner.kind === "radio" ? accentFor(team(driver(banner.carId).team_now).colour) : "#fff",
              }}
            >
              {banner.kind === "radio" ? (
                <span className="flex h-3.5 items-center gap-[2px]">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <i key={i} className="block w-[2px] rounded-[1px] bg-current" style={{ animation: `eq 0.8s ${i * -0.15}s ease-in-out infinite` }} />
                  ))}
                </span>
              ) : null}
              {banner.kind === "radio"
                ? `Team radio · ${driver(banner.carId).code}`
                : banner.kind === "fastest"
                  ? "Fastest lap"
                  : banner.kind === "overtake"
                    ? "Overtake"
                    : "Race control"}
            </span>
            <span className="max-w-[min(440px,60vw)] truncate bg-[rgb(10_11_13/0.88)] px-3.5 py-2.5 normal-case tracking-[0.03em]">
              {banner.kind === "radio" ? `“${banner.text}”` : banner.text}
            </span>
          </div>
        ) : null}
      </div>

      {/* Orbit tags */}
      {cam === "orbit"
        ? tags
            .filter((t) => t.visible)
            .map((t) => {
              const d = driver(t.id);
              const c = team(d.team_now).colour;
              const mine = t.id === meId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setFollow(t.id)}
                  className="absolute left-0 top-0 z-[2] flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 font-mono text-[11px] font-semibold tracking-[0.06em] backdrop-blur-sm will-change-transform"
                  style={{
                    transform: `translate(${t.x - 20}px, ${t.y - 26}px)`,
                    background: mine ? c : "rgb(11 12 14 / 0.72)",
                    color: mine ? accentFor(c) : "#ecedef",
                  }}
                  aria-label={`Follow ${d.name}`}
                >
                  <i className="size-2 rounded-[2px]" style={{ background: mine ? accentFor(c) : c }} />
                  {d.code}
                </button>
              );
            })
        : null}

      {/* Onboard HUD */}
      {cam === "board" && tel ? (
        <div
          className="pointer-events-none absolute bottom-[calc(9vh+20px)] left-1/2 z-[5] grid -translate-x-1/2 justify-items-center gap-3 text-[#ecedef]"
          aria-hidden="true"
          style={{ "--c": meColour } as CSSProperties}
        >
          <div className="flex gap-[5px]">
            {Array.from({ length: 15 }, (_, k) => {
              const lit = k < Math.round(tel.rpm * 15);
              const col = k < 5 ? "#1DBF6B" : k < 10 ? "#FF2A2A" : "#8F45FF";
              return (
                <i
                  key={k}
                  className="h-2 w-2.5 rounded-sm md:w-[15px]"
                  style={lit ? { background: col, boxShadow: `0 0 8px ${col}` } : { background: "rgb(255 255 255 / 0.1)" }}
                />
              );
            })}
          </div>
          <div className="flex items-center gap-6">
            <div className="grid justify-items-start gap-2 font-mono text-[11px] font-semibold tracking-[0.12em] max-sm:hidden">
              <span>
                P{tel.position} / {grid.length}
              </span>
              <span className="text-[#8a9099]">LAP {tel.lap}</span>
            </div>
            <div className="grid size-[66px] place-items-center rounded-xl border-2 border-white/85 bg-black/35 font-display text-[46px] font-extrabold leading-none [font-stretch:75%]">
              {tel.gear}
            </div>
            <div className="grid min-w-[150px] justify-items-end">
              <b className="font-display text-[86px] font-extrabold leading-[0.8] tabular-nums [font-stretch:70%] max-sm:text-6xl">
                {tel.speed}
              </b>
              <span className="mt-2 font-mono text-[10px] tracking-[0.18em] text-[#8a9099]">KM/H</span>
            </div>
            <div className="grid justify-items-start gap-2 font-mono text-[11px] font-semibold tracking-[0.12em]">
              <span
                className={`rounded px-2 py-1.5 transition-colors duration-150 ${
                  tel.drs ? "bg-gain text-[#0b0c0e]" : "border border-white/25 text-[#8a9099]"
                }`}
              >
                DRS
              </span>
              <span className="block h-1.5 w-[110px] overflow-hidden rounded-[3px] bg-white/10">
                <i className="block h-full bg-[linear-gradient(90deg,#FFD12E,#FF9F1C)]" style={{ width: `${tel.ers * 100}%` }} />
              </span>
              <span className="text-[#8a9099]">ERS</span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Camera switch */}
      <div className="absolute right-[max(20px,calc((100vw-1280px)/2+20px))] top-[92px] z-[6] grid justify-items-end gap-2.5 max-md:right-auto max-md:left-5 max-md:top-[84px] max-md:justify-items-start">
        {shot && lights === 6 ? (
          <span className="flex items-center gap-2 rounded-[5px] border border-white/10 bg-[rgb(10_11_13/0.7)] px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[#ecedef] max-md:hidden">
            <i className="size-1.5 rounded-full bg-[#ff2a2a] [animation:blink_1.2s_infinite]" />
            {shot}
          </span>
        ) : null}
        <div
          className="inline-flex rounded-full border border-white/15 bg-white/[0.06] p-1 backdrop-blur-md"
          role="group"
          aria-label="Camera"
        >
          {CAMS.map((m) => (
            <button
              key={m.k}
              type="button"
              aria-pressed={cam === m.k}
              onClick={() => choose(m.k)}
              data-cam-btn={m.k}
              data-cursor={m.label}
              className={`rounded-full px-3.5 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] transition-[background,color] duration-300 ease-expo ${
                cam === m.k ? "bg-[#ecedef] text-[#0b0c0e]" : "text-[#a4aab2] hover:text-white"
              }`}
            >
              {m.label}
              <kbd className="ml-2 hidden font-mono text-[9px] opacity-50 xl:inline">{CAMS.indexOf(m) + 1}</kbd>
            </button>
          ))}
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#6b727b] max-md:hidden">
          Drag for a free camera · keys 1 2 3 · M for sound
        </span>
      </div>
    </div>
  );
}
