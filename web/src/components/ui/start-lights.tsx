interface StartLightsProps {
  /** How many of the five lights are on. */
  lit?: number;
  className?: string;
}

/** The five-light start gantry, used as the brand mark. */
export function StartLights({ lit = 5, className = "" }: StartLightsProps) {
  return (
    <span aria-hidden="true" className={`inline-flex gap-1 ${className}`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`size-2 rounded-full ${i < lit ? "bg-start-red shadow-[0_0_8px_var(--red)]" : "bg-white/15"}`}
        />
      ))}
    </span>
  );
}
