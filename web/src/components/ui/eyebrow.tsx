import type { ReactNode } from "react";

interface EyebrowProps {
  children: ReactNode;
  className?: string;
}

/** Small mono label with the purple-sector bar, used above section headlines. */
export function Eyebrow({ children, className = "" }: EyebrowProps) {
  return (
    <span
      className={`inline-flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-sub ${className}`}
    >
      <span aria-hidden="true" className="h-1.5 w-[22px] rounded-[1px] bg-accent" />
      {children}
    </span>
  );
}
