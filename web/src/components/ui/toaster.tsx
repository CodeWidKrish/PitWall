"use client";

import { useEffect, useState } from "react";

export interface ToastDetail {
  title: string;
  body?: string;
  colour?: string;
}

/** Show a short confirmation at the bottom of the screen. */
export function toast(detail: ToastDetail) {
  window.dispatchEvent(new CustomEvent<ToastDetail>("pitwall:toast", { detail }));
}

export function Toaster() {
  const [t, setT] = useState<(ToastDetail & { id: number }) | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let id = 0;
    const on = (e: Event) => {
      const d = (e as CustomEvent<ToastDetail>).detail;
      const mine = ++id;
      setT({ ...d, id: mine });
      clearTimeout(timer);
      timer = setTimeout(() => setT((cur) => (cur?.id === mine ? null : cur)), 3400);
    };
    addEventListener("pitwall:toast", on);
    return () => {
      removeEventListener("pitwall:toast", on);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed bottom-[max(20px,env(safe-area-inset-bottom))] left-1/2 z-[95] w-[min(440px,calc(100vw-32px))] -translate-x-1/2 transition-[transform,opacity] duration-700 ease-expo ${
        t ? "translate-y-0 opacity-100" : "translate-y-[140%] opacity-0"
      }`}
    >
      {t ? (
        <div
          key={t.id}
          className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[rgb(11_12_14/0.9)] p-3 pr-5 text-[#ecedef] shadow-[0_24px_60px_-20px_rgb(0_0_0/0.7)] backdrop-blur-xl"
        >
          <span className="h-10 w-1.5 flex-none rounded-full" style={{ background: t.colour ?? "var(--accent)" }} />
          <span className="grid gap-0.5">
            <strong className="text-[15px] font-semibold">{t.title}</strong>
            {t.body ? <span className="text-[13px] text-[#a4aab2]">{t.body}</span> : null}
          </span>
        </div>
      ) : null}
    </div>
  );
}
