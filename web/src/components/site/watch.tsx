"use client";

import Image from "next/image";
import { useState } from "react";
import { embedUrl, HIGHLIGHTS, type Highlight, playlistUrl, poster } from "@/lib/footage";

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 translate-x-px" aria-hidden="true">
      <path d="M7 4.5v15l13-7.5z" fill="currentColor" />
    </svg>
  );
}

/**
 * Official race highlights. Posters load first; the YouTube player (privacy-enhanced
 * mode) only loads when a visitor presses play.
 */
export function Watch() {
  const [current, setCurrent] = useState<Highlight>(HIGHLIGHTS[0]);
  const [playing, setPlaying] = useState(false);

  const choose = (h: Highlight) => {
    setCurrent(h);
    setPlaying(true);
  };

  return (
    <div className="grid gap-10">
      <div className="wrap">
        <div className="relative aspect-video overflow-hidden rounded-[20px] bg-black shadow-[0_40px_120px_-40px_rgb(0_0_0/0.9)]">
          {playing ? (
            <iframe
              key={current.id}
              src={embedUrl(current.id)}
              title={`${current.race} ${current.season} highlights`}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              className="absolute inset-0 size-full"
            />
          ) : (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              data-cursor="Play"
              className="group absolute inset-0 size-full cursor-pointer text-left"
              aria-label={`Play ${current.race} ${current.season} highlights`}
            >
              <Image
                src={poster(current.id)}
                alt=""
                fill
                sizes="(min-width: 1280px) 1240px, 100vw"
                className="object-cover transition-transform duration-[1.6s] ease-expo group-hover:scale-[1.03]"
              />
              <span className="absolute inset-0 bg-[linear-gradient(180deg,rgb(11_12_14/0.85)_0%,rgb(11_12_14/0.1)_32%,rgb(11_12_14/0.1)_70%,rgb(11_12_14/0.45)_100%)] transition-opacity duration-700 group-hover:opacity-70" />
              <span className="absolute left-5 top-5 grid gap-2 md:left-8 md:top-7">
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#a4aab2]">
                  Official highlights · {current.season}
                </span>
                <span className="type-voice text-[clamp(24px,3vw,40px)] leading-none text-white">{current.race}</span>
              </span>
              <span className="absolute left-1/2 top-1/2 grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[#0b0c0e] shadow-[0_0_0_12px_rgb(255_255_255/0.12)] transition-[transform,box-shadow] duration-500 ease-expo group-hover:scale-110 group-hover:shadow-[0_0_0_20px_rgb(255_255_255/0.1)] md:size-28">
                <PlayIcon />
              </span>
            </button>
          )}
        </div>
        <p className="mt-4 font-mono text-[11px] uppercase leading-relaxed tracking-[0.1em] text-sub">
          Video by FORMULA 1, played from YouTube. PitWall doesn&apos;t host or own any footage.{" "}
          <a href={playlistUrl()} target="_blank" rel="noreferrer" className="text-ink underline underline-offset-4">
            Every 2026 race on YouTube
          </a>
        </p>
      </div>

      <div className="rail pb-2" aria-label="More highlights">
        {HIGHLIGHTS.map((h) => {
          const on = h.id === current.id;
          return (
            <button
              key={h.id}
              type="button"
              onClick={() => choose(h)}
              aria-pressed={on}
              data-cursor="Play"
              className="group grid w-[min(300px,72vw)] cursor-pointer gap-3 text-left"
            >
              <span
                className={`relative block aspect-video overflow-hidden rounded-xl transition-shadow duration-300 ${
                  on ? "shadow-[0_0_0_2px_var(--you)]" : "shadow-[0_0_0_1px_var(--rule)]"
                }`}
              >
                <Image
                  src={poster(h.id)}
                  alt=""
                  fill
                  sizes="300px"
                  className="object-cover grayscale transition-[filter,transform] duration-700 ease-expo group-hover:scale-105 group-hover:grayscale-0 group-aria-pressed:grayscale-0"
                />
              </span>
              <span className="grid gap-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-sub">
                  {on ? "Now showing" : `${h.season} · Race highlights`}
                </span>
                <span className="type-voice text-xl leading-tight">{h.race}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
