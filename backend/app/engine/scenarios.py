"""Scenario definitions — single source of truth.

Three scenarios:
  100_pct             — all pipeline demand treated as certain (multiplier = 1.0)
  probability_weighted — demand × (probability / 100)
  high_prob_only      — only projects with probability >= HIGH_PROB_THRESHOLD, multiplier = 1.0
"""
from __future__ import annotations
from typing import Callable
import pandas as pd
from ..config import HIGH_PROB_THRESHOLD

SCENARIO_NAMES = ["100_pct", "probability_weighted", "high_prob_only"]


def get_demand_multiplier(scenario: str) -> Callable[[pd.Series], float]:
    """Return a function that computes the demand multiplier for a row."""
    if scenario == "100_pct":
        return lambda row: 1.0

    if scenario == "probability_weighted":
        def _pw(row: pd.Series) -> float:
            prob = float(row.get("probability", 50))
            return prob / 100.0
        return _pw

    if scenario == "high_prob_only":
        def _hp(row: pd.Series) -> float:
            prob = float(row.get("probability", 0))
            return 1.0 if prob >= HIGH_PROB_THRESHOLD else 0.0
        return _hp

    raise ValueError(f"Unknown scenario: {scenario!r}. Must be one of {SCENARIO_NAMES}")


def apply_scenario(demand_df: pd.DataFrame, scenario: str) -> pd.DataFrame:
    """Return demand_df with 'demanded_hours' column adjusted for the scenario."""
    df = demand_df.copy()
    multiplier_fn = get_demand_multiplier(scenario)
    df["_multiplier"] = df.apply(multiplier_fn, axis=1)
    df["demanded_hours"] = df["demanded_hours_raw"] * df["_multiplier"]
    return df[df["demanded_hours"] > 0].drop(columns=["_multiplier"])
