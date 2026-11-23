"use client";

import { useEffect, useState } from "react";
import { sound } from "@/lib/sound";

/** Sound switch with a live equaliser. Audio only starts after this click. */
export function SoundToggle() {
  const [on, setOn] = useState(false);
  useEffect(() => sound?.subscribe(setOn), []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || /input|select|textarea/i.test(t.tagName)) return;
      if (e.key === "m" || e.key === "M") void sound?.toggle();
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);
  return (
    <button
      type="button"
      onClick={() => {
        void sound?.toggle();
      }}
      aria-pressed={on}
      data-cursor={on ? "Mute" : "Sound"}
      data-magnetic
      title="Sound (M)"
      className="group inline-flex h-11 items-center justify-center gap-2.5 rounded-full border border-current px-3.5 max-sm:w-11 max-sm:px-0 font-mono text-[11px] font-semibold uppercase tracking-[0.12em]"
    >
      <span className="flex h-3 items-end gap-[2px]" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <i
            key={i}
            className="block w-[2px] rounded-[1px] bg-current"
            style={{
              height: on ? undefined : "3px",
              animation: on ? `eq 0.9s ${i * -0.22}s ease-in-out infinite` : "none",
            }}
          />
        ))}
      </span>
      <span className="max-sm:sr-only">Sound {on ? "on" : "off"}</span>
    </button>
  );
}
