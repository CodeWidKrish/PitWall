"""The race model: a LightGBM ranker turned into calibrated probabilities.

1. LightGBM's LambdaRank learns a score per driver per race from the features,
   trained to put the actual finishing order first (the winner matters most).
2. Scores become win probabilities with a softmax. Its temperature is fitted on
   a season the ranker did not train on, so the odds are calibrated, not overconfident.
3. Podium odds come from the Plackett-Luce model: the exact chance of finishing
   in the top three when drivers are drawn in order with those strengths.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import lightgbm as lgb
import numpy as np
import pandas as pd

from pitwall.plackett_luce import PLModel, fit_pl

PARAMS: dict[str, Any] = {
    "objective": "lambdarank",
    "metric": "ndcg",
    "ndcg_eval_at": [1, 3],
    "lambdarank_truncation_level": 10,
    "learning_rate": 0.03,
    "num_leaves": 15,
    "min_data_in_leaf": 25,
    "feature_fraction": 0.8,
    "bagging_fraction": 0.8,
    "bagging_freq": 1,
    "lambda_l2": 1.0,
    "verbosity": -1,
    "deterministic": True,
    "force_row_wise": True,
}
ROUNDS = 300
TEMPERATURES = np.exp(np.linspace(np.log(0.05), np.log(20), 120))


def relevance(position: pd.Series, classified: pd.Series) -> np.ndarray:
    """P1 = 10, P2 = 9 ... P10 = 1; outside the top ten or retired = 0."""
    pos = position.astype("Float64").astype(float).fillna(99.0)
    rel = np.clip(11 - pos, 0, 10)
    rel = np.where(classified.fillna(False).astype(bool), rel, 0)
    return rel.astype(int)


def _sorted(df: pd.DataFrame) -> pd.DataFrame:
    return df.sort_values(["season", "round", "driver_id"]).reset_index(drop=True)


def _groups(df: pd.DataFrame) -> np.ndarray:
    return df.groupby(["season", "round"], sort=False).size().to_numpy()


def train_ranker(df: pd.DataFrame, features: list[str], seed: int = 7) -> lgb.Booster:
    d = _sorted(df)
    data = lgb.Dataset(
        d[features],
        label=relevance(d["position"], d["classified"]),
        group=_groups(d),
        free_raw_data=False,
    )
    return lgb.train({**PARAMS, "seed": seed}, data, num_boost_round=ROUNDS)


def softmax_by_race(df: pd.DataFrame, scores: np.ndarray, temperature: float) -> np.ndarray:
    z = pd.Series(scores / temperature, index=df.index)
    keys = [df["season"], df["round"]]
    z = z - z.groupby(keys).transform("max")
    ez = pd.Series(np.exp(z.to_numpy()), index=df.index)
    out: np.ndarray = (ez / ez.groupby(keys).transform("sum")).to_numpy()
    return out


def fit_temperature(df: pd.DataFrame, scores: np.ndarray, winner_col: str = "won") -> float:
    """Temperature that minimises the log loss of the actual winners."""
    won = df[winner_col].to_numpy().astype(bool)
    best_t, best_loss = 1.0, np.inf
    for t in TEMPERATURES:
        p = softmax_by_race(df, scores, float(t))
        loss = -np.mean(np.log(np.clip(p[won], 1e-9, 1)))
        if loss < best_loss:
            best_t, best_loss = float(t), float(loss)
    return best_t


def top3_probs(weights: np.ndarray) -> np.ndarray:
    """Exact Plackett-Luce probability that each driver finishes in the top three."""
    w = np.asarray(weights, dtype=float)
    w = w / w.max()  # scale so the strongest driver is 1: avoids overflow
    n = len(w)
    p1 = w / w.sum()
    p2 = np.zeros(n)
    p3 = np.zeros(n)
    # Remaining-field sums are added up directly rather than by subtraction, which
    # loses all precision when one driver is far stronger than the rest.
    for j in range(n):
        if p1[j] == 0:
            continue
        mask = np.ones(n, bool)
        mask[j] = False
        rest_j = w[mask].sum()
        if rest_j <= 0:
            continue
        p2[mask] += p1[j] * w[mask] / rest_j
        for k in range(n):
            if k == j or w[k] == 0:
                continue
            m2 = mask.copy()
            m2[k] = False
            rest_jk = w[m2].sum()
            if rest_jk <= 0:
                continue
            p3[m2] += p1[j] * (w[k] / rest_j) * w[m2] / rest_jk
    out: np.ndarray = np.clip(p1 + p2 + p3, 0, 1)
    return out


KINDS = ("lgbm", "pl", "blend")
CALIBRATION_SEASONS = 3


@dataclass
class RaceModel:
    """Scores from LightGBM, Plackett-Luce or a 50/50 blend, on a common log-odds scale."""

    kind: str
    features: list[str]
    booster: lgb.Booster | None = None
    lgbm_temperature: float = 1.0
    pl: PLModel | None = None
    pl_temperature: float = 1.0
    blend_weight: float = 0.5  # weight on Plackett-Luce in the blend
    importance: dict[str, float] = field(default_factory=dict)

    @property
    def temperature(self) -> float:
        # Scores are already on a calibrated scale; kept for reporting.
        return self.lgbm_temperature

    def scores(self, df: pd.DataFrame) -> np.ndarray:
        parts: list[tuple[float, np.ndarray]] = []
        if self.pl is not None:
            pl_s = self.pl.scores(df) / self.pl_temperature
            parts.append((1.0 if self.booster is None else self.blend_weight, pl_s))
        if self.booster is not None:
            lg = np.asarray(self.booster.predict(df[self.features])) / self.lgbm_temperature
            parts.append((1.0 if self.pl is None else 1 - self.blend_weight, lg))
        out: np.ndarray = sum(w * s for w, s in parts)  # type: ignore[assignment]
        return out

    def predict(self, df: pd.DataFrame) -> pd.DataFrame:
        """Win and podium probabilities for each driver in each race of `df`."""
        out = df[["season", "round", "driver_id", "constructor_id"]].copy()
        s = self.scores(df)
        out["score"] = s
        out["p_win"] = softmax_by_race(df, s, 1.0)
        out["p_podium"] = 0.0
        for _, idx in out.groupby(["season", "round"]).groups.items():
            w = np.exp(out.loc[idx, "score"] - out.loc[idx, "score"].max())
            out.loc[idx, "p_podium"] = top3_probs(w.to_numpy())
        return out


def _lgbm_temperature(train: pd.DataFrame, features: list[str], seed: int) -> float:
    """Fit the softmax temperature on out-of-sample scores from up to three recent seasons."""
    seasons = sorted(int(s) for s in train["season"].unique())
    held_parts, score_parts = [], []
    for c in seasons[-CALIBRATION_SEASONS:]:
        core = train[train["season"] < c]
        if core["season"].nunique() < 1:
            continue
        held = train[train["season"] == c]
        ranker = train_ranker(core, features, seed)
        held_parts.append(held)
        score_parts.append(np.asarray(ranker.predict(held[features])))
    if not held_parts:
        ranker = train_ranker(train, features, seed)
        return fit_temperature(train, np.asarray(ranker.predict(train[features])))
    return fit_temperature(pd.concat(held_parts), np.concatenate(score_parts))


def _pl_temperature(train: pd.DataFrame, features: list[str]) -> float:
    """Recalibrate Plackett-Luce odds on out-of-sample scores from up to three recent seasons."""
    seasons = sorted(int(s) for s in train["season"].unique())
    held_parts, score_parts = [], []
    for c in seasons[-CALIBRATION_SEASONS:]:
        core = train[train["season"] < c]
        if core["season"].nunique() < 1:
            continue
        held = train[train["season"] == c]
        held_parts.append(held)
        score_parts.append(fit_pl(core, features).scores(held))
    if not held_parts:
        return 1.0
    return fit_temperature(pd.concat(held_parts), np.concatenate(score_parts))


def fit(train: pd.DataFrame, features: list[str], kind: str = "blend", seed: int = 7) -> RaceModel:
    """Train on completed races in `train`. `kind` is "lgbm", "pl" or "blend"."""
    if kind not in KINDS:
        raise ValueError(f"unknown model kind {kind!r}")
    train = train[train["position"].notna()]
    model = RaceModel(kind, features)
    imp: dict[str, float] = {}
    if kind in ("pl", "blend"):
        model.pl = fit_pl(train, features)
        model.pl_temperature = _pl_temperature(train, features)
        for f, v in model.pl.importance.items():
            imp[f] = imp.get(f, 0.0) + v / (2 if kind == "blend" else 1)
    if kind in ("lgbm", "blend"):
        model.lgbm_temperature = _lgbm_temperature(train, features, seed)
        model.booster = train_ranker(train, features, seed)
        gain = model.booster.feature_importance("gain")
        total = float(gain.sum()) or 1.0
        for f, g in zip(features, gain, strict=True):
            imp[f] = imp.get(f, 0.0) + float(g) / total / (2 if kind == "blend" else 1)
    model.importance = {f: round(v, 4) for f, v in imp.items()}
    return model


def winner_log_loss(df: pd.DataFrame, p_win: np.ndarray) -> float:
    won = df["won"].to_numpy().astype(bool)
    return float(-np.mean(np.log(np.clip(p_win[won], 1e-9, 1))))


def select_kind(
    train: pd.DataFrame, features: list[str], validation_seasons: int = 2
) -> tuple[str, dict[str, float]]:
    """Pick the model kind using only `train`: walk forward over its last seasons.

    For each of the last `validation_seasons` seasons in `train`, every kind is fitted
    on the seasons before it and scored on it (log loss of the winners). The kind
    with the lowest average wins. Nothing outside `train` is looked at.
    """
    train = train[train["position"].notna()]
    seasons = sorted(int(s) for s in train["season"].unique())
    val = [s for s in seasons[-validation_seasons:] if any(x < s for x in seasons)]
    if not val:
        return "pl", {}
    losses: dict[str, float] = {}
    for kind in KINDS:
        scores = []
        for v in val:
            m = fit(train[train["season"] < v], features, kind=kind)
            held = train[train["season"] == v]
            scores.append(winner_log_loss(held, m.predict(held)["p_win"].to_numpy()))
        losses[kind] = round(float(np.mean(scores)), 4)
    return min(losses, key=lambda k: losses[k]), losses
