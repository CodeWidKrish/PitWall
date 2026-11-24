"use client";

import Image from "next/image";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useFollow } from "@/components/follow";
import { driver, team } from "@/lib/data";

/**
 * Your team's car crosses the giant wordmark once, flat out, the first time the footer
 * comes into view; it leaves a fading streak of its colour on the track line.
 */
export function FooterDrive() {
  const { followId } = useFollow();
  const d = driver(followId);
  const id = d.team_now ?? d.team_next ?? "red_bull";
  const ref = useRef<HTMLDivElement>(null);
  const [go, setGo] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setGo(true);
          io.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} aria-hidden="true" className={`foot-drive pointer-events-none relative h-[clamp(40px,6vw,84px)] ${go ? "go" : ""}`} style={{ "--tc": team(id).colour } as CSSProperties}>
      <span className="foot-trail absolute bottom-[8%] left-0 h-[3px] w-full origin-left rounded-full" />
      <Image
        src={`/cars/${id}-side.webp`}
        alt=""
        width={640}
        height={159}
        unoptimized
        className="foot-car absolute bottom-0 left-0 h-auto w-[clamp(150px,22vw,320px)] drop-shadow-[0_10px_10px_rgb(0_0_0/0.6)]"
      />
    </div>
  );
}
