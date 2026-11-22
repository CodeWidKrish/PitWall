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


def _confusion(pred: np.ndarray, actual: np.ndarray) -> dict[str, Any]:
    tp = int(np.sum(pred & actual))
    fp = int(np.sum(pred & ~actual))
    fn = int(np.sum(~pred & actual))
    tn = int(np.sum(~pred & ~actual))
    n = tp + fp + fn + tn
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    accuracy = (tp + tn) / n if n else 0.0
    return {
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "tn": tn,
        "accuracy": round(accuracy, 4),
        "error_rate": round(1 - accuracy, 4),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        # What a model that always says "no" would score: shows how imbalanced the task is.
        "always_no_accuracy": round((fp + tn) / n, 4) if n else 0.0,
    }


def classification(df: pd.DataFrame, p_win: str, p_podium: str) -> dict[str, Any]:
    """Confusion matrices for "who wins" (top pick per race) and "who makes the podium" (top 3 per race).

    Also ROC AUC (how well the odds rank winners above non-winners, 50% = random)
    and expected calibration error (the average gap between predicted and actual
    frequency, weighted by how often each probability band is used).
    """
    from sklearn.metrics import roc_auc_score

    d = df.copy()
    d["_rank_w"] = d.groupby(["season", "round"])[p_win].rank(ascending=False, method="first")
    d["_rank_p"] = d.groupby(["season", "round"])[p_podium].rank(ascending=False, method="first")
    won = d["won"].to_numpy().astype(bool)
    pod = d["podium"].to_numpy().astype(bool)

    def ece(p: pd.Series, y: np.ndarray) -> float:
        bins = pd.cut(p, CALIBRATION_BINS, include_lowest=True)
        t = (
            pd.DataFrame({"p": p, "y": y, "b": bins})
            .groupby("b", observed=True)
            .agg(p=("p", "mean"), y=("y", "mean"), n=("y", "size"))
        )
        return float((t["n"] * (t["p"] - t["y"]).abs()).sum() / t["n"].sum())

    return {
        "win": {
            **_confusion((d["_rank_w"] == 1).to_numpy(), won),
            "roc_auc": round(float(roc_auc_score(won, d[p_win])), 4),
            "calibration_error": round(ece(d[p_win], won), 4),
        },
        "podium": {
            **_confusion((d["_rank_p"] <= 3).to_numpy(), pod),
            "roc_auc": round(float(roc_auc_score(pod, d[p_podium])), 4),
            "calibration_error": round(ece(d[p_podium], pod), 4),
        },
    }
