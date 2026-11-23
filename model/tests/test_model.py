"""Model tests on a small synthetic league where the answer is known."""

from __future__ import annotations

from datetime import timedelta

import numpy as np
import pandas as pd
import pytest

from pitwall.elo import Elo
from pitwall.features import PRE_QUALI, build_features
from pitwall.metrics import race_scores, summarise
from pitwall.model import fit, softmax_by_race, top3_probs
from pitwall.simulate import RACE_POINTS, clinched, simulate

DRIVERS = [f"d{i}" for i in range(8)]  # d0 is the strongest, d7 the weakest
TEAMS = {d: f"t{i // 2}" for i, d in enumerate(DRIVERS)}


def league(
    seasons: range = range(2018, 2023), rounds: int = 8, seed: int = 1
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Races where finishing order follows true strength plus noise."""
    rng = np.random.default_rng(seed)
    strength = np.linspace(2.0, 0.0, len(DRIVERS))
    rows, races = [], []
    for s in seasons:
        for r in range(1, rounds + 1):
            date = pd.Timestamp(f"{s}-03-01") + timedelta(days=14 * r)
            races.append({"season": s, "round": r, "date": date, "has_sprint": False, "circuit_id": f"c{r}"})
            perf = strength + rng.normal(0, 0.8, len(DRIVERS))
            order = np.argsort(-perf)
            quali = np.argsort(-(strength + rng.normal(0, 0.5, len(DRIVERS))))
            qpos = {DRIVERS[j]: k + 1 for k, j in enumerate(quali)}
            for pos, j in enumerate(order, start=1):
                d = DRIVERS[j]
                rows.append(
                    {
                        "season": s,
                        "round": r,
                        "date": date,
                        "circuit_id": f"c{r}",
                        "race_name": f"R{r}",
                        "country": "X",
                        "has_sprint": False,
                        "driver_id": d,
                        "driver_code": d.upper(),
                        "driver_name": d,
                        "constructor_id": TEAMS[d],
                        "constructor_name": TEAMS[d],
                        "position": pos,
                        "grid": qpos[d],
                        "quali_position": qpos[d],
                        "gap_to_pole_pct": (qpos[d] - 1) * 0.2,
                        "gap_to_teammate_pct": 0.0,
                        "pit_lane_start": False,
                        "classified": True,
                        "finished": True,
                        "disqualified": False,
                        "dnf": False,
                        "points": float(RACE_POINTS[pos - 1]) if pos <= 10 else 0.0,
                        "sprint_points": 0.0,
                        "won": pos == 1,
                        "podium": pos <= 3,
                    }
                )
    e = pd.DataFrame(rows)
    for col in ("position", "grid", "quali_position"):
        e[col] = e[col].astype("Int64")
    for col in ("gap_to_pole_pct", "gap_to_teammate_pct"):
        e[col] = e[col].astype("Float64")
    return e, pd.DataFrame(races)


def test_features_never_see_their_own_race() -> None:
    e, races = league()
    f = build_features(e, races).sort_values(["season", "round", "driver_id"]).reset_index(drop=True)
    # Change one race's results drastically: features for that race must not move.
    e2 = e.copy()
    target = (e2["season"] == 2020) & (e2["round"] == 4)
    e2.loc[target, "points"] = 999.0
    e2.loc[target, "position"] = pd.array(list(range(8, 0, -1)), dtype="Int64")
    f2 = build_features(e2, races).sort_values(["season", "round", "driver_id"]).reset_index(drop=True)
    mask = (f["season"] == 2020) & (f["round"] == 4)
    pd.testing.assert_frame_equal(f.loc[mask, PRE_QUALI], f2.loc[mask, PRE_QUALI])
    later = (f["season"] == 2020) & (f["round"] == 5)
    assert not f.loc[later, "drv_points_avg5"].equals(f2.loc[later, "drv_points_avg5"])


def test_elo_rewards_the_driver_ahead() -> None:
    elo = Elo()
    for _ in range(20):
        elo.update(["a", "b", "c"])
    assert elo.ratings["a"] > elo.ratings["b"] > elo.ratings["c"]


def test_softmax_sums_to_one_per_race() -> None:
    df = pd.DataFrame({"season": [1, 1, 1, 2, 2], "round": [1, 1, 1, 1, 1]})
    p = softmax_by_race(df, np.array([3.0, 1.0, 0.0, 5.0, 5.0]), 1.0)
    assert p[:3].sum() == pytest.approx(1) and p[3:].sum() == pytest.approx(1)
    assert p[3] == pytest.approx(0.5)


def test_top3_probabilities_add_to_three() -> None:
    w = np.exp(np.array([2.0, 1.5, 1.0, 0.2, 0.0, -1.0]))
    p = top3_probs(w)
    assert p.sum() == pytest.approx(3.0)
    assert np.all(np.diff(p) <= 1e-12)  # stronger drivers are likelier to podium


@pytest.mark.parametrize("kind", ["pl", "lgbm", "blend"])
def test_models_learn_the_true_order(kind: str) -> None:
    e, races = league()
    f = build_features(e, races)
    model = fit(f[f["season"] < 2022], PRE_QUALI, kind=kind)
    test = f[f["season"] == 2022].copy()
    test["p"] = model.predict(test)["p_win"].to_numpy()
    s = summarise(race_scores(test, "p"))
    assert s["winner_prob"] > 1 / len(DRIVERS)  # better than picking at random
    mean_p = test.groupby("driver_id")["p"].mean().reindex(DRIVERS)
    # Average win chance should follow true strength (d0 strongest ... d7 weakest).
    rank_corr = mean_p.rank(ascending=False).corr(pd.Series(range(1, len(DRIVERS) + 1), index=DRIVERS))
    assert rank_corr > 0.85
    assert mean_p["d0"] > mean_p["d7"]


def test_simulation_is_a_proper_distribution() -> None:
    e, races = league(rounds=8)
    extra = pd.DataFrame(
        [
            {
                "season": 2022,
                "round": r,
                "date": pd.Timestamp("2022-12-01"),
                "has_sprint": False,
                "circuit_id": f"c{r}",
            }
            for r in (9, 10)
        ]
    )
    races = pd.concat([races, extra], ignore_index=True)
    races["race_name"], races["country"] = "R", "X"
    f = build_features(e, races)
    model = fit(f[f["season"] < 2022], PRE_QUALI, kind="pl")
    res = simulate(e, races, model, 2022, n_sims=2000)
    assert res["remaining_rounds"] == [9, 10]
    assert sum(r["p_title"] for r in res["drivers"]) == pytest.approx(1)
    assert sum(r["p_title"] for r in res["constructors"]) == pytest.approx(1)
    for r in res["drivers"]:
        assert r["expected_points"] >= r["points_now"]


def test_clinched_when_the_lead_is_out_of_reach() -> None:
    rows = [{"driver_id": "a", "points_now": 100.0}, {"driver_id": "b", "points_now": 60.0}]
    assert clinched(rows, max_gain=25) == "a"
    assert clinched(rows, max_gain=50) is None


def test_confusion_matrix_counts_top_picks() -> None:
    from pitwall.metrics import classification

    df = pd.DataFrame(
        {
            "season": [1] * 4 + [1] * 4,
            "round": [1] * 4 + [2] * 4,
            "won": [True, False, False, False, False, True, False, False],
            "podium": [True, True, True, False, True, True, False, True],
            "p": [0.6, 0.2, 0.1, 0.1, 0.5, 0.3, 0.1, 0.1],
        }
    )
    c = classification(df, "p", "p")
    w = c["win"]
    # Race 1: top pick won (TP). Race 2: top pick lost (FP) and the winner was missed (FN).
    assert (w["tp"], w["fp"], w["fn"], w["tn"]) == (1, 1, 1, 5)
    assert w["precision"] == 0.5 and w["recall"] == 0.5
    assert w["accuracy"] == 0.75 and w["error_rate"] == 0.25
    assert 0.5 < w["roc_auc"] <= 1.0


def test_select_kind_uses_only_training_seasons() -> None:
    from pitwall.model import KINDS, select_kind

    e, races = league(seasons=range(2018, 2022))
    f = build_features(e, races)
    train = f[f["season"] < 2021]
    kind, losses = select_kind(train, PRE_QUALI)
    assert kind in KINDS and set(losses) == set(KINDS)
    # Poisoning a season outside `train` must not change the choice.
    poisoned = f.copy()
    poisoned.loc[poisoned["season"] == 2021, "won"] = False
    assert select_kind(poisoned[poisoned["season"] < 2021], PRE_QUALI)[0] == kind


def test_confidence_bands_group_races_by_favourite_odds() -> None:
    from pitwall.metrics import confidence_bands

    scores = pd.DataFrame(
        {
            "favourite_prob": [0.2, 0.22, 0.5, 0.8],
            "winner_hit": [False, True, True, True],
            "winner_in_top3": [True, True, True, True],
        }
    )
    bands = {b["band"]: b for b in confidence_bands(scores)}
    assert bands["0%-25%"]["races"] == 2 and bands["0%-25%"]["favourite_won"] == 0.5
    assert bands["60%-100%"]["favourite_won"] == 1.0


def test_preseason_state_from_config() -> None:
    from pitwall.simulate import preseason_state

    e, _ = league(seasons=range(2018, 2020))
    config = {
        "season": 2020,
        "calendar": [
            {"round": 1, "race_name": "A", "circuit_id": "c1", "country": "X", "has_sprint": True},
            {"round": 2, "race_name": "B", "circuit_id": "c2", "country": "X", "has_sprint": False},
        ],
        "lineup": [
            {"constructor_id": "t0", "driver_id": "d0", "status": "confirmed"},
            {"constructor_id": "t0", "driver_id": "rookie", "status": "assumed"},
        ],
    }
    state, race_rows = preseason_state(e, config)
    assert state.after_round == 0 and list(state.future["round"]) == [1, 2]
    lineup = state.lineup.set_index("driver_id")
    assert lineup.at["d0", "driver_code"] == "D0"
    assert lineup.at["rookie", "status"] == "assumed" and lineup.at["rookie", "driver_code"] == "ROO"
    assert race_rows["date"].is_monotonic_increasing


def test_top3_is_stable_with_a_dominant_driver() -> None:
    w = np.exp(np.array([60.0, 0.0, -1.0, -2.0, -3.0]))
    with np.errstate(all="raise"):
        p = top3_probs(w)
    assert np.isfinite(p).all()
    assert p[0] == pytest.approx(1.0) and p.sum() == pytest.approx(3.0)


def test_next_race_rolls_over_to_next_season() -> None:
    from pitwall.site import _next_race

    e, races = league(seasons=range(2018, 2022))
    races["race_name"], races["country"], races["circuit_name"] = "R", "X", "C"
    config = {
        "season": 2022,
        "calendar": [
            {"round": 1, "race_name": "Opener", "circuit_id": "c1", "country": "X", "has_sprint": False},
            {"round": 2, "race_name": "Second", "circuit_id": "c2", "country": "X", "has_sprint": False},
        ],
        "lineup": [
            {"constructor_id": f"t{i // 2}", "driver_id": f"d{i}", "status": "confirmed"} for i in range(8)
        ],
    }
    f = build_features(e, races)
    nxt = _next_race(e, races, f, config)
    assert nxt is not None
    assert (nxt["season"], nxt["round"], nxt["race_name"]) == (2022, 1, "Opener")
    assert nxt["start_utc"] is None  # dates for next season are not published yet
    assert sum(o["p_win"] for o in nxt["odds"]) == pytest.approx(1, abs=1e-3)
    assert _next_race(e, races, f, None) is None
