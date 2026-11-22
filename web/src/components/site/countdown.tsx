"use client";

import { useEffect, useState } from "react";

const pad = (n: number) => String(Math.max(0, n)).padStart(2, "0");

/** Time to lights out. Once the start has passed, says the result is being scored. */
export function Countdown({ startUtc }: { startUtc: string }) {
  const start = Date.parse(startUtc);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (now === null) return <div className="h-[52px]" aria-hidden="true" />;

  const left = Math.floor((start - now) / 1000);
  if (left <= 0) {
    const when = new Date(start).toLocaleString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    return (
      <p className="max-w-[30ch] font-mono text-xs uppercase leading-relaxed tracking-[0.12em] text-sub">
        Lights out was {when}. Scored once the official result is published.
      </p>
    );
  }
  const parts: [string, number][] = [
    ["Days", Math.floor(left / 86400)],
    ["Hrs", Math.floor((left % 86400) / 3600)],
    ["Min", Math.floor((left % 3600) / 60)],
    ["Sec", left % 60],
  ];
  return (
    <div className="flex gap-5" aria-label="Time until lights out" role="timer">
      {parts.map(([label, v]) => (
        <div key={label} className="grid gap-1.5">
          <span className="type-data text-[30px] font-medium leading-none">{pad(v)}</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-sub">{label}</span>
        </div>
      ))}
    </div>
  );
}
