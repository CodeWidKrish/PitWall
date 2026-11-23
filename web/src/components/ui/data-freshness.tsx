"use client";

import { useEffect, useState } from "react";

const rtf = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });

function ago(ms: number) {
  const m = Math.round(ms / 60000);
  if (Math.abs(m) < 60) return rtf.format(-m, "minute");
  const h = Math.round(m / 60);
  if (Math.abs(h) < 48) return rtf.format(-h, "hour");
  return rtf.format(-Math.round(h / 24), "day");
}

/** "Data updated 3 hours ago", kept current in the visitor's browser. */
export function DataFreshness({ builtAt }: { builtAt: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);
  const at = Date.parse(builtAt);
  return (
    <a href="/api/health" className="hover:text-ink" title={new Date(at).toUTCString()}>
      Data updated {now === null ? new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ago(now - at)}
    </a>
  );
}
