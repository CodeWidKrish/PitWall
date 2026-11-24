import Image from "next/image";

/** Teams with a rendered car (from the 3D model, in each team's colours). */
const RENDERED = new Set([
  "alpine",
  "aston_martin",
  "audi",
  "cadillac",
  "ferrari",
  "haas",
  "mclaren",
  "mercedes",
  "rb",
  "red_bull",
  "williams",
]);

/**
 * A team's car, side on, rendered from the site's 3D model in their livery colours.
 * Inside a `data-reveal` list it drives in from the left, staggered by `--i`.
 */
export function TeamCar({ id, className = "", view = "side" }: { id: string; className?: string; view?: "side" | "hero" }) {
  if (!RENDERED.has(id)) return <span className={className} aria-hidden="true" />;
  return (
    <Image
      src={`/cars/${id}-${view}.webp`}
      alt=""
      aria-hidden="true"
      width={view === "side" ? 640 : 820}
      height={view === "side" ? 159 : 282}
      unoptimized
      loading="lazy"
      className={`team-car h-auto drop-shadow-[0_4px_4px_rgb(0_0_0/0.45)] ${className}`}
    />
  );
}

export const hasCar = (id: string | null | undefined) => !!id && RENDERED.has(id);
