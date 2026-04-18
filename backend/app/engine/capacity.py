"""Core capacity calculation engine.

compute_capacity_plan() is the SINGLE SOURCE OF TRUTH for all numeric fields.
Agent 1 calls this as a tool and copies the result verbatim — it does not
compute capacity itself.
"""
from __future__ import annotations
import logging
from datetime import date
from pathlib import Path

import pandas as pd

from ..api.schemas import CapacityPlanResult, WCLoad
from ..data.loader import load_workbook
from ..data.joins import build_capacity_frame, build_demand_frame
from ..data.calendar import build_week_to_month_map
from .scenarios import apply_scenario
from .bottleneck import detect_bottlenecks

logger = logging.getLogger(__name__)


def _default_period() -> str:
    """Return next month label as 'M YYYY'."""
    today = date.today()
    month = today.month % 12 + 1
    year = today.year + (1 if today.month == 12 else 0)
    return f"{month} {year}"


def _build_capacity_for_factory(
    wc_cap_df: pd.DataFrame,
    schedule_df: pd.DataFrame,
    week_to_month: dict[str, str],
    factory: str,
) -> pd.DataFrame:
    """Thin wrapper so reallocation.py can import without circular deps."""
    return build_capacity_frame(wc_cap_df, schedule_df, week_to_month, factory)


def compute_capacity_plan(
    factory: str,
    scenario: str,
    period: str | None = None,
    data_path: str | Path | None = None,
) -> CapacityPlanResult:
    """Compute capacity utilisation for a factory/scenario/period.

    This is the authoritative calculation. All returned numeric fields are
    deterministic given the same inputs. Agent 1 must copy them verbatim.

    Args:
        factory:   Plant code, e.g. "NW01"
        scenario:  One of "100_pct", "probability_weighted", "high_prob_only"
        period:    Month label "M YYYY", e.g. "5 2026". Defaults to next month.
        data_path: Path to hackathon_dataset.xlsx. Reads from config if None.

    Returns:
        CapacityPlanResult dataclass (single source of truth for Agent 1 JSON)
    """
    from ..config import DATA_PATH

    data_path = Path(data_path) if data_path else DATA_PATH
    period = period or _default_period()

    wb = load_workbook(data_path)
    sheets = {k.strip(): v for k, v in wb.items()}

    def _get(fragment: str) -> pd.DataFrame:
        for k, v in sheets.items():
            if fragment in k:
                return v.copy()
        logger.warning("Sheet containing '%s' not found", fragment)
        return pd.DataFrame()

    plates_df    = _get("1_1")
    gaskets_df   = _get("1_2")
    projects_df  = _get("1_3")
    wc_cap_df    = _get("2_1")
    schedule_df  = _get("2_5")
    tool_master  = _get("2_6")
    calendar_df  = _get("2_4")

    # --- Build calendar mapping ---
    week_to_month = build_week_to_month_map(calendar_df, plant=factory)
    if not week_to_month:
        logger.warning("week_to_month mapping is empty for factory %s — calendar may not have loaded", factory)

    # --- Build capacity frame (monthly available hours per WC, OEE applied) ---
    cap_frame = build_capacity_frame(wc_cap_df, schedule_df, week_to_month, factory)

    # --- Build demand frame ---
    demand_df, quality = build_demand_frame(
        plates_df, gaskets_df, projects_df, tool_master, factory
    )

    # --- Apply scenario multipliers ---
    if not demand_df.empty:
        demand_df = apply_scenario(demand_df, scenario)

    # --- Aggregate demanded hours per WC per month ---
    if demand_df.empty:
        wc_demand = pd.DataFrame(columns=["wc_code", "month", "demanded_hours"])
    else:
        wc_demand = (
            demand_df.groupby(["wc_code", "month"], as_index=False)["demanded_hours"]
            .sum()
        )

    # --- Join demand with capacity for the target period ---
    period_cap = cap_frame[cap_frame["month"] == period].copy() if not cap_frame.empty else pd.DataFrame()
    period_dem = wc_demand[wc_demand["month"] == period].copy() if not wc_demand.empty else pd.DataFrame()

    if period_cap.empty:
        logger.warning("No capacity data for %s in period %s", factory, period)
        # Return zero-utilisation result rather than crashing
        return CapacityPlanResult(
            scenario=scenario,
            factory=factory,
            period=period,
            capacity_utilization=0.0,
            available_hours=0.0,
            demanded_hours=0.0,
            bottleneck_detected=False,
            bottleneck_work_centers=[],
            oee_applied=0.0,
            excluded_rows=quality.get("excluded_rows", 0),
            flag_count=quality.get("flag_count", 0),
            reconstructed_rows=quality.get("reconstructed_rows", 0),
            per_work_center=[],
        )

    merged = period_cap.merge(period_dem, on=["wc_code", "month"], how="left")
    merged["demanded_hours"] = merged["demanded_hours"].fillna(0.0)
    merged["utilization"] = (
        merged["demanded_hours"] / merged["available_hours"].replace(0, float("nan"))
    ).fillna(0.0)

    # --- Aggregate totals ---
    total_available = float(merged["available_hours"].sum())
    total_demanded  = float(merged["demanded_hours"].sum())
    overall_util    = total_demanded / total_available if total_available > 0 else 0.0
    avg_oee         = float(merged["oee"].mean()) if "oee" in merged.columns else 0.82

    # --- Bottleneck detection ---
    bottleneck_wcs = detect_bottlenecks(merged[["wc_code", "utilization"]])

    # --- Per-WC detail (not sent to Agent 2) ---
    per_wc = [
        WCLoad(
            wc=row["wc_code"],
            utilization=round(float(row["utilization"]), 4),
            available=round(float(row["available_hours"]), 2),
            demanded=round(float(row["demanded_hours"]), 2),
        )
        for _, row in merged.iterrows()
    ]

    return CapacityPlanResult(
        scenario=scenario,
        factory=factory,
        period=period,
        capacity_utilization=round(overall_util, 4),
        available_hours=round(total_available, 2),
        demanded_hours=round(total_demanded, 2),
        bottleneck_detected=len(bottleneck_wcs) > 0,
        bottleneck_work_centers=bottleneck_wcs,
        oee_applied=round(avg_oee, 4),
        excluded_rows=quality.get("excluded_rows", 0),
        flag_count=quality.get("flag_count", 0),
        reconstructed_rows=quality.get("reconstructed_rows", 0),
        per_work_center=per_wc,
    )
