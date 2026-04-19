"""Sourcing forecast engine.

Logic:
  1. Build scenario-adjusted demand (pieces) per finished-good material per month
  2. Compare against ATP inventory (sheet 3_1) to find the gap
  3. For each gap: look up BOM (sheet 3_2) to find raw materials + quantities
  4. Lead time from BOM 'Production LT in Weeks' × 7
  5. order_by_date = first day of demand month − lead_time_days
  6. Aggregate by raw material across all finished goods
"""
from __future__ import annotations
import logging
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

from ..api.schemas import SourcingMaterial, SourcingResponse
from ..data.joins import build_demand_frame
from ..data.loader import load_workbook
from ..engine.scenarios import apply_scenario

logger = logging.getLogger(__name__)


def _parse_period(period: str) -> date:
    """'M YYYY' → first day of that month."""
    parts = period.strip().split()
    return date(int(parts[1]), int(parts[0]), 1)


def _status(days: int) -> str:
    if days > 14:
        return "on_track"
    if days > 7:
        return "order_soon"
    if days >= 0:
        return "urgent"
    return "overdue"


def _latest_inventory(inv_df: pd.DataFrame, factory: str) -> pd.DataFrame:
    """Return one ATP row per material from the most recent snapshot date."""
    df = inv_df[inv_df["Plant (code)"] == factory].copy()
    if df.empty:
        return df
    df["_date"] = pd.to_datetime(df["Calendar day"], errors="coerce")
    latest = df["_date"].max()
    df = df[df["_date"] == latest]
    return df.groupby("Material Unique (code)", as_index=False)[
        ["Stock Qty", "Stock in Transit Qty", "ATP Quantity"]
    ].sum()


def compute_sourcing_plan(
    factory: str,
    scenario: str,
    period: str | None = None,
    data_path: str | Path | None = None,
) -> SourcingResponse:
    from ..config import DATA_PATH
    from ..engine.capacity import _default_period

    data_path = Path(data_path) if data_path else DATA_PATH
    period = period or _default_period()

    wb = load_workbook(data_path)
    sheets = {k.strip(): v for k, v in wb.items()}

    def _get(fragment: str) -> pd.DataFrame:
        for k, v in sheets.items():
            if fragment in k:
                return v.copy()
        return pd.DataFrame()

    plates_df   = _get("1_1")
    gaskets_df  = _get("1_2")
    projects_df = _get("1_3")
    tool_master = _get("2_6")
    sap_df      = _get("2_3")
    bom_df      = _get("3_2")
    inv_df      = _get("3_1")

    cost_map: dict[str, float] = {}
    if not sap_df.empty and "Sap code" in sap_df.columns and "Standard Cost in EUR" in sap_df.columns:
        cost_map = sap_df.dropna(subset=["Standard Cost in EUR"]).set_index("Sap code")["Standard Cost in EUR"].to_dict()

    # Per-unit RM cost: same method as /raw-materials (avg fg_cost/eff_qty across all BOM rows)
    rm_unit_cost_map: dict[str, float] = {}
    if not bom_df.empty:
        _rm_costs: dict[str, list] = defaultdict(list)
        for _, _brow in bom_df.iterrows():
            _rm = str(_brow.get("Component Material code", "")).strip()
            _fg = str(_brow.get("Header Material code", "")).strip()
            _qty = float(_brow.get("Effective Component Quantity", 0) or 0)
            _cost = cost_map.get(_fg, 0.0)
            if _rm and _qty > 0 and _cost > 0:
                _rm_costs[_rm].append(_cost / _qty)
        rm_unit_cost_map = {k: sum(v) / len(v) for k, v in _rm_costs.items()}

    demand_df, _ = build_demand_frame(plates_df, gaskets_df, projects_df, tool_master, factory)

    if demand_df.empty:
        return SourcingResponse(
            factory=factory, scenario=scenario, period=period,
            materials=[], on_track_count=0, order_soon_count=0,
            urgent_count=0, overdue_count=0,
        )

    demand_df = apply_scenario(demand_df, scenario)
    period_df = demand_df[demand_df["month"] == period].copy()

    if period_df.empty:
        return SourcingResponse(
            factory=factory, scenario=scenario, period=period,
            materials=[], on_track_count=0, order_soon_count=0,
            urgent_count=0, overdue_count=0,
        )

    # Adjusted pieces = demanded_hours * 60 / cycle_time_min
    period_df["adjusted_pcs"] = (
        period_df["demanded_hours"] * 60.0
        / period_df["cycle_time_min"].replace(0, float("nan"))
    ).fillna(0)

    # Extract MAT-XXXXXX from connector (NW01_MAT-100000 → MAT-100000)
    period_df["material_code"] = period_df["connector"].str.split("_", n=1).str[-1]

    demand_by_mat = (
        period_df.groupby("material_code", as_index=False)["adjusted_pcs"].sum()
    )

    # ATP inventory — latest snapshot for this factory
    inv = _latest_inventory(inv_df, factory)
    atp_map: dict[str, float] = {}
    if not inv.empty:
        atp_map = inv.set_index("Material Unique (code)")["ATP Quantity"].to_dict()

    demand_by_mat["atp"] = demand_by_mat["material_code"].map(atp_map).fillna(0.0)
    demand_by_mat["gap_pcs"] = (
        demand_by_mat["adjusted_pcs"] - demand_by_mat["atp"]
    ).clip(lower=0)

    # Filter to materials with a gap
    gap_df = demand_by_mat[demand_by_mat["gap_pcs"] > 0].copy()

    if gap_df.empty:
        return SourcingResponse(
            factory=factory, scenario=scenario, period=period,
            materials=[], on_track_count=0, order_soon_count=0,
            urgent_count=0, overdue_count=0,
        )

    # BOM: map finished goods → raw materials
    bom_factory = bom_df[bom_df["Plant"].str.contains(factory, na=False)].copy() if not bom_df.empty else bom_df
    bom_active = bom_factory[bom_factory.get("BOM Status", pd.Series("Active", index=bom_factory.index)) == "Active"] if not bom_factory.empty else bom_factory
    if bom_active.empty:
        bom_active = bom_factory

    # Aggregate: raw_material_code → {total_kg, lead_time_days, finished_goods, estimated_cost_eur}
    rm_needed: dict[str, dict] = defaultdict(lambda: {
        "total_needed": 0.0,
        "lead_time_days": 0,
        "unit": "KG",
        "name": "",
        "finished_goods": set(),
    })

    demand_date = _parse_period(period)
    today = date.today()

    for _, row in gap_df.iterrows():
        mat_code = row["material_code"]
        gap_pcs  = row["gap_pcs"]

        bom_rows = bom_active[bom_active["Header Material code"] == mat_code]
        if bom_rows.empty:
            continue

        for _, bom_row in bom_rows.iterrows():
            rm_code  = str(bom_row.get("Component Material code", "")).strip()
            rm_name  = str(bom_row.get("Component Description", rm_code)).strip()
            eff_qty  = float(bom_row.get("Effective Component Quantity", bom_row.get("Component Quantity", 0)) or 0)
            lt_weeks = float(bom_row.get("Production LT in Weeks", 4) or 4)
            unit     = str(bom_row.get("Component BUoM", "KG")).strip()

            if not rm_code or eff_qty == 0:
                continue

            rm_needed[rm_code]["total_needed"] += gap_pcs * eff_qty
            rm_needed[rm_code]["lead_time_days"] = max(
                rm_needed[rm_code]["lead_time_days"], int(lt_weeks * 7)
            )
            rm_needed[rm_code]["unit"] = unit
            rm_needed[rm_code]["name"] = rm_name
            rm_needed[rm_code]["finished_goods"].add(mat_code)

    materials: list[SourcingMaterial] = []
    for rm_code, info in rm_needed.items():
        lt_days = info["lead_time_days"] or 28
        order_date = demand_date - timedelta(days=lt_days)
        days_left  = (order_date - today).days

        unit_cost = rm_unit_cost_map.get(rm_code)
        est_cost = round(info["total_needed"] * unit_cost, 2) if unit_cost else None
        materials.append(SourcingMaterial(
            raw_material_code=rm_code,
            raw_material_name=info["name"],
            unit=info["unit"],
            total_needed=round(info["total_needed"], 2),
            lead_time_days=lt_days,
            order_by_date=order_date.isoformat(),
            days_until_order=days_left,
            status=_status(days_left),
            finished_goods=sorted(info["finished_goods"]),
            estimated_cost_eur=round(est_cost, 2) if est_cost else None,
        ))

    # Sort by urgency (overdue first, then by order_by_date)
    materials.sort(key=lambda m: m.order_by_date)

    counts = {"on_track": 0, "order_soon": 0, "urgent": 0, "overdue": 0}
    for m in materials:
        counts[m.status] = counts.get(m.status, 0) + 1

    return SourcingResponse(
        factory=factory,
        scenario=scenario,
        period=period,
        materials=materials,
        on_track_count=counts["on_track"],
        order_soon_count=counts["order_soon"],
        urgent_count=counts["urgent"],
        overdue_count=counts["overdue"],
    )
