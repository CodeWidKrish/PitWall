"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { toast } from "@/components/ui/toaster";

type State = "loading" | "unsupported" | "ios" | "off-server" | "denied" | "off" | "on" | "busy";

const b64ToBytes = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

async function registration() {
  return (await navigator.serviceWorker.getRegistration("/")) ?? navigator.serviceWorker.register("/sw.js");
}

/** Open the alerts panel from anywhere (the command palette uses this). */
export const openAlerts = () => window.dispatchEvent(new Event("pitwall:alerts"));

/**
 * Race alerts: a push notification when the odds are in for race week, and again once the
 * grid is set. A bell in the header opens a small panel to switch them on or off.
 */
export function RaceAlerts() {
  const [state, setState] = useState<State>("loading");
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const panel = useId();
  const root = useRef<HTMLDivElement>(null);

  const check = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      const ios = /iP(hone|ad|od)/.test(navigator.userAgent);
      setState(ios ? "ios" : "unsupported");
      return;
    }
    try {
      const res = await fetch("/api/alerts", { cache: "no-store" });
      const info = (await res.json()) as { enabled: boolean; publicKey: string | null };
      if (!info.enabled || !info.publicKey) return setState("off-server");
      setKey(info.publicKey);
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    } catch {
      setState("off-server");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser capabilities after mount
    void check();
    const show = () => setOpen(true);
    addEventListener("pitwall:alerts", show);
    return () => removeEventListener("pitwall:alerts", show);
  }, [check]);

  // Close on Escape or a click outside.
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const click = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    addEventListener("keydown", key);
    addEventListener("pointerdown", click);
    return () => {
      removeEventListener("keydown", key);
      removeEventListener("pointerdown", click);
    };
  }, [open]);

  const turnOn = async () => {
    if (!key) return;
    setState("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "denied" : "off");
      const reg = await registration();
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error(String(res.status));
      setState("on");
      await reg.showNotification("Race alerts are on", {
        body: "You'll get the odds in race week, and again once the grid is set.",
        icon: "/icon-192.png",
        tag: "pitwall-welcome",
      });
      toast({ title: "Race alerts on", body: "Odds in race week, and again when the grid is set." });
    } catch {
      setState("off");
      toast({ title: "Couldn't switch alerts on", body: "Try again in a moment." });
    }
  };

  const turnOff = async () => {
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/alerts", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
      toast({ title: "Race alerts off" });
    } catch {
      setState("on");
    }
  };

  const on = state === "on";
  const note: Record<State, string> = {
    loading: "Checking this browser…",
    unsupported: "This browser can't receive notifications from websites.",
    ios: "On iPhone and iPad, add PitWall to your Home Screen first (Share › Add to Home Screen), then open it from there.",
    "off-server": "Race alerts are being switched on. Check back soon.",
    denied: "Notifications are blocked for this site. Allow them in your browser's site settings, then try again.",
    off: "Two a race at most: the odds in race week, and again once the grid is set. No account, nothing else stored.",
    on: "You'll get the odds in race week, and again once the grid is set.",
    busy: "One moment…",
  };
  const canToggle = state === "on" || state === "off" || state === "busy";

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panel}
        aria-label={on ? "Race alerts on" : "Race alerts"}
        title="Race alerts"
        data-magnetic
        className="relative grid size-11 place-items-center rounded-full border border-current"
      >
        <svg viewBox="0 0 24 24" className={`size-[18px] ${on ? "origin-top [animation:ring_2.6s_ease-in-out_1]" : ""}`} aria-hidden="true">
          <path
            d="M12 3a5 5 0 0 0-5 5v3.2c0 .9-.3 1.8-.9 2.5L5 15h14l-1.1-1.3a3.9 3.9 0 0 1-.9-2.5V8a5 5 0 0 0-5-5Z"
            fill={on ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path d="M10 18a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        {on ? <span aria-hidden="true" className="absolute right-2 top-2 size-2 rounded-full bg-[var(--you)] ring-2 ring-[#0b0c0e]" /> : null}
      </button>

      <div
        id={panel}
        role="dialog"
        aria-label="Race alerts"
        className={`absolute right-0 top-[calc(100%+12px)] z-[60] w-[340px] origin-top-right max-sm:fixed max-sm:inset-x-4 max-sm:top-[84px] max-sm:w-auto rounded-2xl border border-white/10 bg-[rgb(14_15_18/0.96)] p-5 text-[#ecedef] shadow-[0_30px_80px_-20px_rgb(0_0_0/0.8)] backdrop-blur-xl transition-[opacity,transform] duration-500 ease-expo ${
          open ? "opacity-100" : "pointer-events-none -translate-y-2 scale-[0.97] opacity-0"
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8a9099]">Race alerts</span>
            <p className="type-voice text-2xl leading-none">Never miss the odds</p>
          </div>
          {canToggle ? (
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label="Race alerts"
              disabled={state === "busy"}
              tabIndex={open ? 0 : -1}
              onClick={() => (on ? turnOff() : turnOn())}
              className="switch shrink-0"
            />
          ) : null}
        </div>
        <p className="mt-4 text-sm leading-relaxed text-[#b4b8bf]">{note[state]}</p>
      </div>
    </div>
  );
}
