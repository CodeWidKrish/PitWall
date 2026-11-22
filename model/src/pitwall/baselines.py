"""Simple baselines the model has to beat.

elo   Thursday baseline: back the driver with the best Elo rating.
grid  Saturday baseline: win chance by starting slot, learned from past seasons
      (pole wins about half the time, P2 about a fifth, and so on).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from pitwall.model import fit_temperature, softmax_by_race


def elo_baseline(train: pd.DataFrame, test: pd.DataFrame) -> np.ndarray:
    done = train[train["position"].notna()]
    t = fit_temperature(done, done["elo"].to_numpy() / 100.0)
    return softmax_by_race(test, test["elo"].to_numpy() / 100.0, t)


def grid_baseline(train: pd.DataFrame, test: pd.DataFrame, max_slot: int = 22) -> np.ndarray:
    done = train[train["position"].notna()]
    slot = done["grid"].fillna(max_slot).clip(1, max_slot).astype(int)
    wins = done["won"].groupby(slot).sum()
    starts = slot.value_counts()
    # Add-one smoothing so a slot that never won still has a small chance.
    rate = (wins.reindex(range(1, max_slot + 1), fill_value=0) + 0.1) / (
        starts.reindex(range(1, max_slot + 1), fill_value=0) + 1.0
    )
    test_slot = test["grid"].fillna(max_slot).clip(1, max_slot).astype(int)
    raw = test_slot.map(rate).to_numpy(dtype=float)
    keys = [test["season"], test["round"]]
    s = pd.Series(raw, index=test.index)
    return (s / s.groupby(keys).transform("sum")).to_numpy()
