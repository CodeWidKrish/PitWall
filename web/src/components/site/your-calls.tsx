"use client";

import { useEffect, useState } from "react";
import { driver, shortRaceName } from "@/lib/data";
import { finalCall, ledger } from "@/lib/ledger";
import { scorePodium } from "@/lib/podium";

interface Row {
  key: string;
  race: string;
  you: string[];
  model: string[];
  podium: string[];
  youPts: number;
  modelPts: number;
}

/**
 * Your podium calls against the model's, race by race, scored on the real podium:
 * a point for each driver on it, another for the right step. Kept in this browser.
 */
export function YourCalls() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    const out: Row[] = [];
    for (const c of ledger.calls) {
      if (!c.result) continue;
      let you: string[] | null = null;
      try {
        you = JSON.parse(localStorage.getItem(`pitwall:podium:${c.season}-${c.round}`) ?? "null") as string[] | null;
      } catch {
        you = null;
      }
      const f = finalCall(c);
      if (!you?.every(Boolean) || !f) continue;
      const model = f.odds.slice(0, 3).map((o) => o.driver_id);
      out.push({
        key: `${c.season}-${c.round}`,
        race: `${shortRaceName(c.race_name)} ${c.season}`,
        you,
        model,
        podium: c.result.podium,
        youPts: scorePodium(you, c.result.podium),
        modelPts: scorePodium(model, c.result.podium),
      });
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading this browser's saved calls after mount
    setRows(out.reverse());
  }, []);

  if (rows === null) return null;
  const you = rows.reduce((a, r) => a + r.youPts, 0);
  const model = rows.reduce((a, r) => a + r.modelPts, 0);
  const lead = you === model ? "Level" : you > model ? `You lead by ${you - model}` : `Model leads by ${model - you}`;

  return (
    <div className="mt-16 grid gap-6 border-t border-rule pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-2">
          <span className="tag">You vs the model · this browser</span>
          <p className="type-voice text-[clamp(30px,3.4vw,46px)] leading-none">
            {rows.length ? (
              <>
                <span className="text-[var(--you)]">{you}</span> <span className="text-sub">to</span> {model} · {lead}
              </>
            ) : (
              "Your calls get scored here"
            )}
          </p>
        </div>
        <p className="max-w-[40ch] text-sm text-sub">
          A point for each driver you put on the podium, one more for the right step. Lock in a call before every race;
          it is scored automatically once the result is in.
        </p>
      </div>
      {rows.length ? (
        <ol className="grid gap-px overflow-hidden rounded-2xl border border-rule bg-rule">
          {rows.map((r) => (
            <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 bg-paper px-5 py-4 max-sm:grid-cols-1">
              <span className="grid">
                <span className="type-voice text-xl leading-tight">{r.race}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-sub">
                  Podium {r.podium.map((d) => driver(d).code).join(" · ")}
                </span>
              </span>
              <span className="font-mono text-xs">
                You {r.you.map((d) => driver(d).code).join(" ")} <strong className="type-data text-[var(--you)]">+{r.youPts}</strong>
              </span>
              <span className="font-mono text-xs text-sub">
                Model {r.model.map((d) => driver(d).code).join(" ")} <strong className="type-data text-ink">+{r.modelPts}</strong>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
