import type { CSSProperties } from "react";
import { CountUp } from "@/components/ui/count-up";
import { D, SectionHead, V } from "@/components/ui/reveal";
import { driver, pct, site } from "@/lib/data";
import { highlightFor, watchUrl } from "@/lib/footage";

/**
 * The model's track record. Every season from 2020 was predicted by a model trained
 * only on earlier seasons, then scored against a simple baseline.
 */
export function Record() {
  const rec = site.record;
  if (!rec) return null;
  const post = rec.modes.post_quali;
  const pre = rec.modes.pre_quali;
  const first = rec.test_seasons[0];
  const last = rec.test_seasons[rec.test_seasons.length - 1];
  const calls = [...site.races].reverse();
  const preHits = site.races.filter((r) => r.pre.hit).length;
  const postHits = site.races.filter((r) => r.post.hit).length;

  const rows = [
    {
      label: "Picks the winner, after qualifying",
      model: post.model.winner_hit,
      base: post.baseline_scores.winner_hit,
      baseLabel: "Pole-slot history",
    },
    {
      label: "Winner in its top 3, after qualifying",
      model: post.model.winner_in_top3,
      base: post.baseline_scores.winner_in_top3,
      baseLabel: "Pole-slot history",
    },
    {
      label: "Picks the winner, before qualifying",
      model: pre.model.winner_hit,
      base: pre.baseline_scores.winner_hit,
      baseLabel: "Elo ratings alone",
    },
  ];

  return (
    <section id="record" className="theme-day section" aria-labelledby="record-h">
      <div className="wrap">
        <SectionHead
          id="record-h"
          tag={`Public record · ${post.model.races} races, ${first}–${last}`}
          lines={[
            <span key="a">
              <D>Every</D> <V>call,</V>
            </span>,
            <D key="b">on the record</D>,
          ]}
          lede="Each season was predicted by a model that had only seen earlier seasons, then scored. No result leaks into its own forecast."
        />

        <div className="grid gap-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          <div>
            <p className="font-display text-[clamp(110px,15vw,220px)] font-extrabold leading-[0.8] tracking-[-0.02em] [font-stretch:70%]">
              <CountUp value={post.model.winner_hit * 100} />
              <small className="type-voice ml-1 text-[0.3em] text-accent">%</small>
            </p>
            <p className="type-voice mt-4 max-w-[24ch] text-2xl leading-tight">
              of race winners picked once the grid is set, with the favourite given a{" "}
              {pct(post.model.favourite_prob, 0)} chance on average.
            </p>
            <div className="mt-10 grid gap-6">
              {rows.map((r, i) => (
                <div key={r.label} className="grid gap-2.5" data-reveal="fade" style={{ "--i": i } as CSSProperties}>
                  <span className="text-[15px]">{r.label}</span>
                  {[
                    { k: "PitWall", v: r.model, c: "var(--accent)" },
                    { k: r.baseLabel, v: r.base, c: "var(--sub)" },
                  ].map((b) => (
                    <span
                      key={b.k}
                      className="grid grid-cols-[150px_minmax(0,1fr)_54px] items-center gap-3 font-mono text-xs"
                      style={{ "--c": b.c } as CSSProperties}
                    >
                      <span className={b.k === "PitWall" ? "text-ink" : "text-sub"}>{b.k}</span>
                      <span className="h-2 overflow-hidden rounded-full bg-rule">
                        <i className="bar-fill" style={{ "--w": `${b.v * 100}%` } as CSSProperties} />
                      </span>
                      <span className="text-right">{pct(b.v, 1)}</span>
                    </span>
                  ))}
                </div>
              ))}
            </div>
            <p className="mt-10 max-w-[52ch] text-sm leading-relaxed text-sub">
              Honest limits: F1 is hard to call. Even the best pick wins about half the time, so a 35% favourite losing is
              normal, not a miss. Probability accuracy (Brier {post.model.brier.toFixed(3)} after qualifying vs{" "}
              {post.baseline_scores.brier.toFixed(3)} for the baseline, lower is better) matters more than the hit
              rate. The full report, with calibration and the confusion matrix, is in the repository.
            </p>
          </div>

          <div>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-sub">
                {site.season.season}, race by race
              </h3>
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-sub">
                Before quali {preHits}/{site.races.length} · after quali {postHits}/{site.races.length}
              </span>
            </div>
            <ol className="border-t border-rule">
              {calls.map((r) => {
                const w = driver(r.winner);
                const fav = driver(r.post.favourite);
                const video = highlightFor(r.circuit_id, site.season.season);
                return (
                  <li
                    key={r.round}
                    className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-4 border-b border-rule py-4"
                  >
                    <span className="type-data text-xs text-sub">R{String(r.round).padStart(2, "0")}</span>
                    <span className="min-w-0">
                      <span className="type-voice block truncate text-[22px] leading-tight">
                        {r.race_name}
                      </span>
                      <span className="mt-1 block font-mono text-[11px] tracking-[0.04em] text-sub">
                        Won by {w.code} · model picked {fav.code} at {pct(r.post.p_favourite, 0)}
                        {r.post.hit ? "" : ` · gave ${w.code} ${r.post.p_winner !== null ? pct(r.post.p_winner, 0) : "—"}`}
                        {video ? (
                          <>
                            {" · "}
                            <a
                              href={watchUrl(video.id)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-ink underline underline-offset-2"
                            >
                              Highlights
                            </a>
                          </>
                        ) : null}
                      </span>
                    </span>
                    <span className={`pill ${r.post.hit ? "hit" : r.post.winner_in_top3 ? "best" : "miss"}`}>
                      {r.post.hit ? "Called it" : r.post.winner_in_top3 ? "In top 3" : "Missed"}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
