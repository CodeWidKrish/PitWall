"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_FOLLOW, driver, site, team } from "@/lib/data";

/**
 * The driver the visitor follows. Their team colour becomes --you across the page,
 * and charts and lists highlight them. Saved in this browser only.
 */
const KEY = "pitwall:follow";

interface Follow {
  followId: string;
  setFollow: (id: string) => void;
}

const FollowContext = createContext<Follow>({ followId: DEFAULT_FOLLOW, setFollow: () => {} });

function teamOf(id: string) {
  const d = driver(id);
  return team(d.team_now ?? d.team_next);
}

export function FollowProvider({ children }: { children: ReactNode }) {
  const [followId, setFollowId] = useState(DEFAULT_FOLLOW);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser storage after hydration
      if (saved && saved in site.drivers) setFollowId(saved);
    } catch {
      /* storage unavailable: keep the default */
    }
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--you", teamOf(followId).colour);
  }, [followId]);

  const setFollow = useCallback((id: string) => {
    setFollowId(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* storage unavailable: the pick lasts for this visit */
    }
  }, []);

  const value = useMemo(() => ({ followId, setFollow }), [followId, setFollow]);
  return <FollowContext.Provider value={value}>{children}</FollowContext.Provider>;
}

export function useFollow() {
  return useContext(FollowContext);
}
