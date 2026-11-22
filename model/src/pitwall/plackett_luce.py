"""Plackett-Luce regression: a linear model of finishing order.

Each driver gets a strength s = x · beta. The chance of finishing order (a, b, c, ...)
is the chance a is picked first from the whole field (softmax of strengths), then
b from the remaining drivers, and so on. Fitting beta by maximum likelihood on the
top of every finishing order uses far more information than "who won" alone, and
the resulting probabilities are calibrated by construction (no temperature needed).

Missing feature values are filled with the training median; features are
standardised; an L2 penalty keeps the weights stable on a few thousand rows.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from scipy.optimize import minimize  # type: ignore[import-untyped]

TOP_K = 6  # how many places of each finishing order to learn from
STAGE_WEIGHTS = np.array([1.0, 0.6, 0.5, 0.4, 0.35, 0.3])  # the win matters most


@dataclass
class PLModel:
    features: list[str]
    beta: np.ndarray
    median: pd.Series
    mean: pd.Series
    std: pd.Series
    l2: float
    importance: dict[str, float] = field(default_factory=dict)

    def matrix(self, df: pd.DataFrame) -> np.ndarray:
        x = df[self.features].astype(float).fillna(self.median)
        out: np.ndarray = ((x - self.mean) / self.std).to_numpy()
        return out

    def scores(self, df: pd.DataFrame) -> np.ndarray:
        out: np.ndarray = self.matrix(df) @ self.beta
        return out


def _race_blocks(df: pd.DataFrame) -> list[tuple[np.ndarray, list[int]]]:
    """Per race: row positions of all drivers, and the finishing order (row positions) of the top K."""
    blocks = []
    pos = df["position"].astype("Float64").astype(float).to_numpy()
    classified = df["classified"].fillna(False).astype(bool).to_numpy()
    for idx in df.groupby(["season", "round"], sort=False).indices.values():
        rows = np.asarray(idx)
        ranked = sorted((pos[r], r) for r in rows if classified[r] and not np.isnan(pos[r]))
        order = [r for _, r in ranked[:TOP_K]]
        if order:
            blocks.append((rows, order))
    return blocks


def _loss_and_grad(
    beta: np.ndarray, x: np.ndarray, blocks: list[tuple[np.ndarray, list[int]]], l2: float
) -> tuple[float, np.ndarray]:
    s = x @ beta
    loss = 0.5 * l2 * float(beta @ beta)
    grad = l2 * beta.copy()
    for rows, order in blocks:
        remaining = list(rows)
        for k, chosen in enumerate(order):
            w = STAGE_WEIGHTS[k]
            rs = np.asarray(remaining)
            sr = s[rs]
            m = sr.max()
            e = np.exp(sr - m)
            z = e.sum()
            loss += w * (m + np.log(z) - s[chosen])
            p = e / z
            grad += w * (p @ x[rs] - x[chosen])
            remaining.remove(chosen)
    return loss, grad


def fit_pl(train: pd.DataFrame, features: list[str], l2: float = 2.0) -> PLModel:
    train = train[train["position"].notna()].sort_values(["season", "round"]).reset_index(drop=True)
    raw = train[features].astype(float)
    median = raw.median()
    filled = raw.fillna(median)
    mean, std = filled.mean(), filled.std().replace(0, 1.0).fillna(1.0)
    x = ((filled - mean) / std).to_numpy()
    blocks = _race_blocks(train)
    res = minimize(
        _loss_and_grad,
        np.zeros(len(features)),
        args=(x, blocks, l2),
        jac=True,
        method="L-BFGS-B",
        options={"maxiter": 500},
    )
    beta = res.x
    total = float(np.abs(beta).sum()) or 1.0
    importance = {f: round(float(abs(b)) / total, 4) for f, b in zip(features, beta, strict=True)}
    return PLModel(features, beta, median, mean, std, l2, importance)
