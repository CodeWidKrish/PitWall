"use client";

import { type ReactNode, useEffect, useState } from "react";

/**
 * Transparent over the hero; once you scroll it becomes a floating glass bar that
 * tucks away while you read down the page and returns as soon as you scroll up.
 */
export function HeaderShell({ children }: { children: ReactNode }) {
  const [solid, setSolid] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let last = scrollY;
    const onScroll = () => {
      const y = scrollY;
      setSolid(y > 60);
      setHidden(y > 400 && y > last + 2);
      if (y < last - 2 || y < 120) setHidden(false);
      last = y;
    };
    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
    return () => removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 text-[#ecedef] transition-transform duration-700 ease-expo ${
        hidden ? "-translate-y-[110%]" : ""
      }`}
    >
      <div
        className={`mx-auto transition-[max-width,margin,background,border-color,border-radius,backdrop-filter] duration-700 ease-expo ${
          solid
            ? "mt-3 max-w-[min(1240px,calc(100vw-24px))] rounded-2xl border border-white/10 bg-[rgb(11_12_14/0.72)] backdrop-blur-xl backdrop-saturate-150"
            : "mt-0 max-w-full border border-transparent"
        }`}
      >
        {children}
      </div>
    </header>
  );
}
