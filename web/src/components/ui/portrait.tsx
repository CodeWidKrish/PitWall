import Image from "next/image";
import type { CSSProperties } from "react";
import { type Driver, photoSrc, team } from "@/lib/data";

/**
 * A driver's photo (freely licensed, from Wikimedia Commons; see /credits),
 * toned in their team colour until `live` turns it to full colour.
 */
export function Portrait({
  d,
  live = false,
  sizes,
  className = "",
  preload = false,
}: {
  d: Driver;
  live?: boolean;
  sizes: string;
  className?: string;
  preload?: boolean;
}) {
  const src = photoSrc(d);
  const colour = team(d.team_now ?? d.team_next).colour;
  return (
    <div className={`portrait ${live ? "live" : ""} ${className}`} style={{ "--c": colour } as CSSProperties}>
      {src ? (
        <Image
          src={src}
          alt={`${d.name}`}
          fill
          sizes={sizes}
          preload={preload}
          className="object-cover object-[50%_18%]"
        />
      ) : (
        <span className="type-display absolute inset-0 grid place-items-center text-6xl text-white/30">{d.code}</span>
      )}
    </div>
  );
}
