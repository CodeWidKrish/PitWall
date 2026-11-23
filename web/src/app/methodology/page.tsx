import type { Metadata } from "next";
import { ProsePage } from "@/components/site/prose-page";
import { pct, site } from "@/lib/data";
import { REPO_URL } from "@/lib/links";

export const metadata: Metadata = {
  title: "Methodology",
  description: "How PitWall turns race results into win odds and championship forecasts, and how it is scored.",
};

export default function Methodology() {
  const rec = site.record;
  const pre = rec?.modes.pre_quali;
  const post = rec?.modes.post_quali;
  return (
    <ProsePage
      tag="How it works"
      title={
        <>
          <span className="type-voice">How the</span> <span className="type-display">model works</span>
        </>
      }
    >
      <h2>The data</h2>
      <p>
        Every race, qualifying session and sprint since 2018 from the Jolpica F1 database, plus race-day weather for
        each circuit. Championship points are rebuilt from the results and checked against the official standings
        after every round.
      </p>
      <h2>What the model knows before a race</h2>
      <p>
        For every driver: an Elo rating built from head-to-head finishes, recent results and points, grid positions,
        qualifying gaps to the pole and to the teammate, retirements, the team&apos;s form and both their records at
        that circuit. Nothing from the race being predicted is ever used.
      </p>
      <h2>Win odds</h2>
      <p>
        A Plackett-Luce ranking model, and after qualifying a blend with a gradient-boosted ranker (LightGBM), turns
        those inputs into a strength for each driver. Strengths become probabilities that are recalibrated on seasons
        the model has not seen, so a 30% call should come true about 30% of the time.
      </p>
      <h2>Championships</h2>
      <p>
        The remaining races and sprints are played 10,000 times. Each simulated season gives every team and driver
        their own swing in form, draws retirements from their reliability and scores the points. The title odds are the
        share of seasons each driver and team wins. The what-if simulator runs the same simulation in your browser.
      </p>
      <h2>How it is scored</h2>
      {pre && post ? (
        <p>
          Each season from {rec!.test_seasons[0]} was predicted by a model trained only on earlier seasons. Across{" "}
          {post.model.races} races it named the winner {pct(post.model.winner_hit, 0)} of the time after qualifying (a
          pole-slot baseline: {pct(post.baseline_scores.winner_hit, 0)}) and {pct(pre.model.winner_hit, 0)} before it
          (an Elo baseline: {pct(pre.baseline_scores.winner_hit, 0)}). Its Brier score, which rewards honest
          probabilities, is {post.model.brier.toFixed(3)} against {post.baseline_scores.brier.toFixed(3)} for the
          baseline; lower is better.
        </p>
      ) : null}
      <h2>Limits</h2>
      <p>
        Formula 1 has a lot of luck: safety cars, crashes, strategy and weather. No model calls winners nine times in
        ten, and a 35% favourite losing is normal. Driver line-ups for next season use the latest reports until they are
        announced.
      </p>
      <p>
        The full code and the season-by-season backtest are open:{" "}
        <a href={REPO_URL} className="text-ink underline underline-offset-4">
          source on GitHub
        </a>
        .
      </p>
    </ProsePage>
  );
}
