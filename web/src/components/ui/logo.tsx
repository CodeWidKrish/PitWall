/**
 * PitWall mark: an italic P cut from solid blocks, its bowl closing into the
 * purple sector line that runs out ahead of it, the way a timing screen marks
 * the fastest sector. The wordmark is condensed heavy italic to match.
 */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 32" className={className} aria-hidden="true">
      <g transform="skewX(-14) translate(8 0)">
        {/* stem */}
        <rect x="4" y="3" width="6.5" height="26" rx="1" fill="currentColor" />
        {/* bowl with counter */}
        <path
          fillRule="evenodd"
          fill="currentColor"
          d="M10.5 3H21a8.5 8.5 0 0 1 0 17H10.5v-5.6H20.6a2.9 2.9 0 0 0 0-5.8H10.5Z"
        />
        {/* purple sector: the bowl's line carried out ahead */}
        <rect x="15" y="23.4" width="21" height="5.6" rx="1" fill="var(--accent)" />
      </g>
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <LogoMark className="h-7 w-[38px]" />
      <span className="font-display text-[23px] font-extrabold uppercase italic leading-none tracking-[0.01em] [font-stretch:72%]">
        Pit<span className="font-light [font-stretch:62%]">wall</span>
      </span>
    </span>
  );
}
