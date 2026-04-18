"""Cross-factory reallocation check: NW01 bottleneck → NW03 headroom."""
from __future__ import annotations
import logging
from pathlib import Path

import pandas as pd

logger = logging.getLogger(__name__)

SUSTAINABILITY_TARGET = "NW03"  # lower energy-consumption factory


def check_nw03_headroom(
    period: str,
    overflow_hours: float,
    data_path: str | Path,
) -> dict:
    """Return NW03 available headroom for a given period.

    Returns:
        {
          "factory": "NW03",
          "period": period,
          "available_headroom_hours": float,
          "can_absorb_overflow": bool,
          "overflow_hours": float,
        }
    """
    from ..data.loader import load_workbook
    from ..data.calendar import build_week_to_month_map
    from .capacity import _build_capacity_for_factory

    try:
        wb = load_workbook(data_path)
        sheets = {k.strip(): v for k, v in wb.items()}

        cal_key = next((k for k in sheets if "2_4" in k or "Model Calendar" in k), None)
        cap_key = next((k for k in sheets if "2_1" in k or "Work Center Capacity" in k), None)
        sch_key = next((k for k in sheets if "2_5" in k or "WC Schedule" in k), None)

        if not all([cal_key, cap_key, sch_key]):
            logger.warning("Could not locate required sheets for NW03 headroom check")
            return _empty_headroom(period, overflow_hours)

        week_to_month = build_week_to_month_map(sheets[cal_key], plant=SUSTAINABILITY_TARGET)
        nw03_cap = _build_capacity_for_factory(
            sheets[cap_key], sheets[sch_key], week_to_month, SUSTAINABILITY_TARGET
        )

        period_cap = nw03_cap[nw03_cap["month"] == period]
        if period_cap.empty:
            logger.info("No capacity data for NW03 in period %s", period)
            return _empty_headroom(period, overflow_hours)

        # Available capacity that isn't already committed (we don't have NW03 demand here,
        # so we report total available capacity as headroom — conservative upper bound)
        total_available = float(period_cap["available_hours"].sum())

        return {
            "factory": SUSTAINABILITY_TARGET,
            "period": period,
            "available_headroom_hours": total_available,
            "can_absorb_overflow": total_available >= overflow_hours,
            "overflow_hours": overflow_hours,
        }
    except Exception as exc:
        logger.error("NW03 headroom check failed: %s", exc)
        return _empty_headroom(period, overflow_hours)


def _empty_headroom(period: str, overflow_hours: float) -> dict:
    return {
        "factory": SUSTAINABILITY_TARGET,
        "period": period,
        "available_headroom_hours": 0.0,
        "can_absorb_overflow": False,
        "overflow_hours": overflow_hours,
    }
