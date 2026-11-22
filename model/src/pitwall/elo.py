"""Multi-driver Elo ratings from race finishing order.

After each race, every pair of classified finishers is treated as a head-to-head:
the driver ahead "beat" the one behind. Ratings carry across seasons, pulled a
little back toward the average each winter because cars change. Retirements are
left out of the update, since most are mechanical rather than the driver's fault.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

import pandas as pd

BASE = 1500.0


@dataclass
class Elo:
    k: float = 24.0
    season_regression: float = 0.2  # share of the gap to BASE removed each new season
    ratings: dict[str, float] = field(default_factory=lambda: defaultdict(lambda: BASE))

    def expected(self, a: float, b: float) -> float:
        return 1.0 / (1.0 + 10 ** ((b - a) / 400.0))

    def update(self, order: list[str]) -> None:
        """Update from a finishing order (best first) of classified drivers."""
        n = len(order)
        if n < 2:
            return
        current = {d: self.ratings[d] for d in order}
        for i, a in enumerate(order):
            delta = 0.0
            for j, b in enumerate(order):
                if a == b:
                    continue
                score = 1.0 if i < j else 0.0
                delta += score - self.expected(current[a], current[b])
            self.ratings[a] = current[a] + self.k * delta / (n - 1)

    def new_season(self) -> None:
        for d in list(self.ratings):
            self.ratings[d] = BASE + (self.ratings[d] - BASE) * (1 - self.season_regression)


def pre_race_elo(entries: pd.DataFrame) -> pd.Series:
    """Each driver's Elo *before* each race, aligned to `entries` (sorted by date)."""
    elo = Elo()
    out = pd.Series(index=entries.index, dtype=float)
    last_season: int | None = None
    for _, g in entries.groupby(["season", "round"], sort=True):
        season = int(g["season"].iloc[0])
        if last_season is not None and season != last_season:
            elo.new_season()
        last_season = season
        for idx, d in zip(g.index, g["driver_id"], strict=True):
            out[idx] = elo.ratings[d]
        done = g[g["position"].notna() & g["classified"]].sort_values("position")
        elo.update(list(done["driver_id"]))
    return out
