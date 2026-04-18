"""Build the master demand frame and capacity frame from raw sheets.

Join sequence (frozen by consensus plan):
  1_1/1_2.Connector → 2_6.Connector        (cycle time, WC, tool)
  1_3.Project name  → 1_1/1_2.Project_name (probability)
  2_6.Plant+WC      → 2_5 (OEE per WC)
  2_1.WC code       → aggregate monthly via 2_4 calendar

Measure selection: 'Available Capacity, hours' from sheet 2_1 (authoritative).
Rev no dedup: Material Status == 'Active' then latest Rev no.
"""
from __future__ import annotations
import logging
import re

import pandas as pd

from .missing import three_tier_classify, summarise_quality

logger = logging.getLogger(__name__)

AVAIL_CAP_MEASURE = "Available Capacity, hours"


def _month_cols(df: pd.DataFrame) -> list[str]:
    """Return monthly demand columns matching pattern 'M YYYY'."""
    return [c for c in df.columns if re.match(r"^\d{1,2} 20\d{2}$", str(c).strip())]


def _dedup_tool_master(tm: pd.DataFrame) -> pd.DataFrame:
    """Deduplicate 2_6 per Connector: prefer Active status, then latest Rev no."""
    tm = tm.copy()
    # Normalise Material Status
    if "Material Status" in tm.columns:
        tm["_active"] = tm["Material Status"].str.strip().str.lower() == "active"
    else:
        tm["_active"] = True

    # Convert Rev no to numeric for sorting (non-numeric → 0)
    if "Rev no" in tm.columns:
        tm["_rev_num"] = pd.to_numeric(tm["Rev no"], errors="coerce").fillna(0)
    else:
        tm["_rev_num"] = 0

    tm = tm.sort_values(["_active", "_rev_num"], ascending=[False, False])
    return tm.drop_duplicates(subset=["Connector"], keep="first").drop(columns=["_active", "_rev_num"])


def build_oee_lookup(schedule_df: pd.DataFrame) -> dict[tuple[str, str], float]:
    """Return {(plant, wc_description): oee} from sheet 2_5.

    Uses the row where AP Limit == 'Available Capacity, hours' (baseline shift level).
    """
    df = schedule_df.copy()
    baseline = df[df["AP Limit"].str.strip() == AVAIL_CAP_MEASURE] if "AP Limit" in df.columns else df
    if baseline.empty:
        baseline = df  # fallback: use all rows, first per WC

    oee: dict[tuple[str, str], float] = {}
    for _, row in baseline.iterrows():
        plant = str(row.get("Plant", "")).strip()
        wc = str(row.get("WC-Description", "")).strip()
        val = row.get("OEE (in %)", None)
        if plant and wc and pd.notna(val):
            oee[(plant, wc)] = float(val)
    return oee


def build_capacity_frame(
    wc_capacity_df: pd.DataFrame,
    schedule_df: pd.DataFrame,
    week_to_month: dict[str, str],
    factory: str,
) -> pd.DataFrame:
    """Return monthly available hours per WC for the given factory.

    Columns: [wc_code, month, available_hours, oee]
    Source: 'Available Capacity, hours' measure from sheet 2_1,
            aggregated weekly→monthly via sheet 2_4 calendar.
    """
    df = wc_capacity_df.copy()

    # Filter to the target factory and the authoritative measure
    factory_prefix = f"P01_{factory}_"
    df = df[df["Work center code"].str.startswith(factory_prefix, na=False)]

    if "Measure" in df.columns:
        df = df[df["Measure"].str.strip() == AVAIL_CAP_MEASURE]

    if df.empty:
        logger.warning("No capacity data found for factory %s", factory)
        return pd.DataFrame(columns=["wc_code", "month", "available_hours", "oee"])

    # Build OEE lookup from 2_5
    oee_lookup = build_oee_lookup(schedule_df)

    # Aggregate weekly columns → monthly
    week_cols = [c for c in df.columns if str(c).startswith("Week ") and c in week_to_month]
    if not week_cols:
        logger.warning("No matching week columns found (week_to_month has %d entries)", len(week_to_month))
        return pd.DataFrame(columns=["wc_code", "month", "available_hours", "oee"])

    melted = df[["Work center code"] + week_cols].melt(
        id_vars=["Work center code"],
        value_vars=week_cols,
        var_name="week",
        value_name="available_hours",
    )
    melted["month"] = melted["week"].map(week_to_month)
    melted = melted.dropna(subset=["month"])
    melted["available_hours"] = pd.to_numeric(melted["available_hours"], errors="coerce").fillna(0)

    cap = (
        melted.groupby(["Work center code", "month"], as_index=False)["available_hours"]
        .sum()
        .rename(columns={"Work center code": "wc_code"})
    )

    # Attach OEE: derive (plant, wc_description) from wc_code = "P01_{plant}_{wc}"
    def _get_oee(wc_code: str) -> float:
        parts = wc_code.split("_", 2)  # P01, NW01, PRESS_3
        if len(parts) >= 3:
            plant, wc_desc = parts[1], parts[2]
            return oee_lookup.get((plant, wc_desc), 0.82)  # 0.82 = sensible default
        return 0.82

    cap["oee"] = cap["wc_code"].map(_get_oee)
    cap["available_hours"] = cap["available_hours"] * cap["oee"]  # apply OEE
    return cap


def build_demand_frame(
    plates_df: pd.DataFrame,
    gaskets_df: pd.DataFrame,
    projects_df: pd.DataFrame,
    tool_master_df: pd.DataFrame,
    factory: str,
) -> tuple[pd.DataFrame, dict]:
    """Return (demand_frame, quality_summary).

    demand_frame columns: [connector, wc_code, cycle_time_min, month, pcs,
                           probability, demanded_hours, _status, _rev_mismatch]
    """
    tm = _dedup_tool_master(tool_master_df)

    # Filter tool master to this factory
    tm_factory = tm[tm["Plant"].str.strip() == factory] if "Plant" in tm.columns else tm

    frames = []
    for raw_df, product_type in [(plates_df, "Plates"), (gaskets_df, "Gaskets")]:
        df = raw_df.copy()

        # Filter to this factory
        factory_col = "Plate Factory" if product_type == "Plates" else "Gasket Factory"
        if factory_col in df.columns:
            df = df[df[factory_col].str.contains(factory, na=False)]

        if df.empty:
            continue

        # Apply three-tier missing data classification
        df = three_tier_classify(df, tm_factory)

        # Drop tier-3 rows
        df = df[df["_status"] != "dropped"]

        # Join probability from 1_3
        if "Project_name" in df.columns and not projects_df.empty:
            prob_map = (
                projects_df.set_index("Project name")["Probability"]
                if "Project name" in projects_df.columns
                else pd.Series(dtype=float)
            )
            df["probability"] = df["Project_name"].map(prob_map).fillna(50).astype(float)
        else:
            df["probability"] = 50.0

        # Melt monthly demand columns
        month_cols = _month_cols(df)
        if not month_cols:
            continue

        id_cols = ["Connector Plant_Material nr", "Work center", "Cycle time",
                   "probability", "_status", "_rev_mismatch"]
        id_cols = [c for c in id_cols if c in df.columns]

        melted = df[id_cols + month_cols].melt(
            id_vars=id_cols,
            value_vars=month_cols,
            var_name="month",
            value_name="pcs",
        )
        melted["pcs"] = pd.to_numeric(melted["pcs"], errors="coerce").fillna(0)
        melted = melted[melted["pcs"] > 0]

        melted = melted.rename(columns={
            "Connector Plant_Material nr": "connector",
            "Work center": "wc_short",
            "Cycle time": "cycle_time_raw",
        })

        # Build full WC code
        melted["wc_code"] = f"P01_{factory}_" + melted["wc_short"].astype(str)

        # Cycle time in minutes (SAP convention: minutes per piece)
        melted["cycle_time_min"] = pd.to_numeric(melted["cycle_time_raw"], errors="coerce").fillna(0)

        # Demanded hours = PCS × cycle_time_min / 60
        melted["demanded_hours_raw"] = melted["pcs"] * melted["cycle_time_min"] / 60.0

        frames.append(melted)

    if not frames:
        return pd.DataFrame(), {"ok": 0, "flag_count": 0, "excluded_rows": 0, "reconstructed_rows": 0}

    demand = pd.concat(frames, ignore_index=True)
    quality = {
        "ok": int((demand["_status"] == "ok").sum()),
        "reconstructed_rows": int((demand["_status"] == "reconstructed").sum()),
        "imputed": int((demand["_status"] == "imputed").sum()),
        "flag_count": int((demand["_status"] == "flagged").sum()),
        "excluded_rows": 0,  # dropped rows are already excluded above
        "rev_mismatch": int(demand.get("_rev_mismatch", pd.Series(False)).sum()),
    }

    return demand, quality
