import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="absolute inset-x-0 top-0 z-20">
      <div className="mx-auto flex h-[72px] max-w-[1280px] items-center px-5">
        <Link href="/" className="flex items-center gap-2.5" aria-label="PitWall home">
          <svg viewBox="0 0 26 26" className="size-[26px]" aria-hidden="true">
            <rect x="1" y="1" width="24" height="24" rx="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M5 18 C9 18 9 8 13 8 S17 18 21 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="font-display text-[22px] font-extrabold uppercase italic leading-none tracking-[0.02em] [font-stretch:70%]">
            PitWall
          </span>
        </Link>
      </div>
    </header>
  );
}
