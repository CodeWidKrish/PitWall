"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { CLIPS, HIGHLIGHTS, playlistUrl, poster, watchUrl } from "@/lib/footage";
import { sound } from "@/lib/sound";

function Icon({ d, className = "size-4" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d={d} fill="currentColor" />
    </svg>
  );
}
const PLAY = "M7 4.5v15l13-7.5z";
const PAUSE = "M6 4h4v16H6zM14 4h4v16h-4z";
const SPEAKER = "M4 9v6h4l5 4V5L8 9zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z";
const MUTED = "M4 9v6h4l5 4V5L8 9zm15.6 3 2.1-2.1-1.4-1.4-2.1 2.1-2.1-2.1-1.4 1.4 2.1 2.1-2.1 2.1 1.4 1.4 2.1-2.1 2.1 2.1 1.4-1.4z";

/**
 * Real F1 cars on track, with their trackside sound. Plays muted as you reach it,
 * like a broadcast in the background; turn the sound up for the real thing.
 */
export function Watch() {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const clip = CLIPS[i];

  // Play while on screen, pause when scrolled away.
  useEffect(() => {
    const v = video.current;
    if (!v || !box.current) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) void v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.35 },
    );
    io.observe(box.current);
    return () => io.disconnect();
  }, [i]);

  // Follow the site sound switch.
  useEffect(
    () =>
      sound?.subscribe((on) => {
        if (!on && video.current) {
          video.current.muted = true;
          setMuted(true);
        }
      }),
    [],
  );

  const toggleSound = () => {
    const v = video.current;
    if (!v) return;
    const turnOn = muted;
    v.muted = !turnOn;
    setMuted(!turnOn);
    if (turnOn) {
      v.volume = 0.8;
      if (!sound?.on) void sound?.toggle(true);
      void v.play().catch(() => {});
    }
  };
  const soundOn = !muted;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-12">
      <div className="wrap">
        <div
          ref={box}
          className="group relative aspect-[16/9] overflow-hidden rounded-[20px] bg-black shadow-[0_40px_120px_-40px_rgb(0_0_0/0.9)] max-md:aspect-[4/5]"
        >
          <video
            key={clip.slug}
            ref={video}
            className="absolute inset-0 size-full object-cover"
            src={`/footage/${clip.slug}.mp4`}
            poster={`/footage/${clip.slug}.jpg`}
            muted={muted}
            playsInline
            loop
            preload="metadata"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              setProgress(v.duration ? v.currentTime / v.duration : 0);
            }}
          />
          <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgb(11_12_14/0.7)_0%,transparent_30%,transparent_60%,rgb(11_12_14/0.85)_100%)]" />

          <div className="absolute left-5 top-5 grid gap-2 md:left-8 md:top-7">
            <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[#ecedef]">
              <i className={`size-1.5 rounded-full ${playing ? "bg-[#ff2a2a] [animation:blink_1.2s_infinite]" : "bg-[#8a9099]"}`} />
              {clip.place} · {clip.year}
            </span>
            <span className="type-display text-[clamp(30px,5vw,72px)] leading-[0.86] text-white">{clip.title}</span>
          </div>

          <div className="absolute inset-x-0 bottom-0 grid gap-4 p-5 md:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="max-w-[46ch] text-sm text-[#c4c8ce]">{clip.note}</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const v = video.current;
                    if (!v) return;
                    if (v.paused) void v.play();
                    else v.pause();
                  }}
                  data-cursor={playing ? "Pause" : "Play"}
                  aria-label={playing ? "Pause" : "Play"}
                  className="grid size-12 place-items-center rounded-full bg-white text-[#0b0c0e] transition-transform duration-300 ease-expo hover:scale-110"
                >
                  <Icon d={playing ? PAUSE : PLAY} className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={toggleSound}
                  data-cursor={soundOn ? "Mute" : "Listen"}
                  aria-pressed={soundOn}
                  className="inline-flex h-12 items-center gap-2 rounded-full border border-white/30 bg-black/30 px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur-md transition-colors hover:bg-white hover:text-[#0b0c0e]"
                >
                  <Icon d={soundOn ? SPEAKER : MUTED} />
                  {soundOn ? "Trackside sound on" : "Hear the cars"}
                </button>
              </div>
            </div>
            <div className="h-[3px] overflow-hidden rounded-full bg-white/20" aria-hidden="true">
              <i className="block h-full bg-white" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
        </div>

        {/* Clip picker */}
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4" role="tablist" aria-label="Clips">
          {CLIPS.map((c, k) => (
            <button
              key={c.slug}
              type="button"
              role="tab"
              aria-selected={k === i}
              onClick={() => {
                setI(k);
                setProgress(0);
              }}
              data-cursor="Watch"
              className="group/c grid gap-2 text-left"
            >
              <span
                className={`relative block aspect-video overflow-hidden rounded-xl transition-shadow duration-300 ${
                  k === i ? "shadow-[0_0_0_2px_var(--you)]" : "shadow-[0_0_0_1px_var(--rule)]"
                }`}
              >
                <Image
                  src={`/footage/${c.slug}.jpg`}
                  alt=""
                  fill
                  sizes="(min-width: 768px) 25vw, 50vw"
                  className={`object-cover transition-[filter,transform] duration-700 ease-expo group-hover/c:scale-105 ${
                    k === i ? "" : "grayscale group-hover/c:grayscale-0"
                  }`}
                />
                {k === i ? (
                  <span className="absolute bottom-0 left-0 h-[3px] bg-[var(--you)]" style={{ width: `${progress * 100}%` }} />
                ) : null}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-sub">
                {c.place.split(",")[0]} · {c.year}
              </span>
              <span className="type-voice -mt-1 text-lg leading-tight">{c.title}</span>
            </button>
          ))}
        </div>
        <p className="mt-5 font-mono text-[10px] uppercase leading-relaxed tracking-[0.1em] text-sub">
          Fan footage from Wikimedia Commons, CC BY-SA 4.0: {CLIPS.map((c) => c.author).filter((a, k, all) => all.indexOf(a) === k).join(", ")}.
          Trimmed and re-encoded for the web.{" "}
          <a href="/credits" className="text-ink underline underline-offset-4">
            Full credits
          </a>
        </p>
      </div>

      {/* Official highlights: F1 doesn't allow them to play on other sites, so they open on YouTube. */}
      <div>
        <div className="wrap mb-5 flex flex-wrap items-end justify-between gap-3">
          <span className="tag">Official 2026 race highlights</span>
          <a
            href={playlistUrl()}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-sub underline underline-offset-4 hover:text-ink"
          >
            Full playlist on YouTube ↗
          </a>
        </div>
        <div className="rail pb-2">
          {HIGHLIGHTS.map((h) => (
            <a
              key={h.id}
              href={watchUrl(h.id)}
              target="_blank"
              rel="noreferrer"
              data-cursor="YouTube"
              className="group grid w-[min(300px,72vw)] gap-3"
            >
              <span className="relative block aspect-video overflow-hidden rounded-xl shadow-[0_0_0_1px_var(--rule)]">
                <Image
                  src={poster(h.id)}
                  alt=""
                  fill
                  sizes="300px"
                  className="object-cover grayscale transition-[filter,transform] duration-700 ease-expo group-hover:scale-105 group-hover:grayscale-0"
                />
                <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur">
                  YouTube ↗
                </span>
              </span>
              <span className="grid gap-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-sub">By FORMULA 1 · {h.season}</span>
                <span className="type-voice text-xl leading-tight">{h.race}</span>
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
