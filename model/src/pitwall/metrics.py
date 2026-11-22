"""How good are a set of race predictions? Honest, standard scores.

winner_hit      the top pick won
winner_in_top3  the winner was among the three highest probabilities
podium_overlap  share of the actual podium among the predicted top three
brier           sum over drivers of (p - outcome)^2, averaged per race (lower is better)
log_loss        -log(probability given to the actual winner), averaged (lower is better)
winner_prob     average probability given to the actual winner
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

CALIBRATION_BINS = [0.0, 0.02, 0.05, 0.1, 0.2, 0.35, 0.5, 0.7, 1.0]


def race_scores(df: pd.DataFrame, p_col: str) -> pd.DataFrame:
    """One row per race with the scores above. `df` needs season, round, won, podium and p_col."""
    rows = []
    for _, g in df.groupby(["season", "round"], sort=True):
        season, rnd = int(g["season"].iloc[0]), int(g["round"].iloc[0])
        g = g.sort_values(p_col, ascending=False)
        p = g[p_col].to_numpy()
        won = g["won"].to_numpy().astype(bool)
        if won.sum() != 1:
            continue
        podium = set(g.loc[g["podium"], "driver_id"])
        top3 = list(g["driver_id"].iloc[:3])
        rows.append(
            {
                "season": season,
                "round": rnd,
                "winner_hit": bool(won[0]),
                "winner_in_top3": bool(won[:3].any()),
                "podium_overlap": len(podium & set(top3)) / 3,
                "brier": float(np.sum((p - won) ** 2)),
                "log_loss": float(-np.log(max(float(p[won][0]), 1e-9))),
                "winner_prob": float(p[won][0]),
                "favourite_prob": float(p[0]),
            }
        )
    return pd.DataFrame(rows)


def summarise(scores: pd.DataFrame) -> dict[str, Any]:
    if scores.empty:
        return {}
    return {
        "races": len(scores),
        "winner_hit": round(float(scores["winner_hit"].mean()), 4),
        "winner_in_top3": round(float(scores["winner_in_top3"].mean()), 4),
        "podium_overlap": round(float(scores["podium_overlap"].mean()), 4),
        "brier": round(float(scores["brier"].mean()), 4),
        "log_loss": round(float(scores["log_loss"].mean()), 4),
        "winner_prob": round(float(scores["winner_prob"].mean()), 4),
    }


def calibration(df: pd.DataFrame, p_col: str, outcome: str = "won") -> list[dict[str, Any]]:
    """For each probability band: how often it was predicted vs how often it happened."""
    bins = pd.cut(df[p_col], CALIBRATION_BINS, include_lowest=True)
    table = df.groupby(bins, observed=True).agg(
        n=(outcome, "size"), predicted=(p_col, "mean"), actual=(outcome, "mean")
    )
    out: list[dict[str, Any]] = []
    for iv, n, pred, act in zip(
        table.index, table["n"].tolist(), table["predicted"].tolist(), table["actual"].tolist(), strict=True
    ):
        if n > 0:
            out.append(
                {
                    "band": f"{max(0.0, iv.left):.0%}-{iv.right:.0%}",
                    "n": int(n),
                    "predicted": round(float(pred), 4),
                    "actual": round(float(act), 4),
                }
            )
    return out
