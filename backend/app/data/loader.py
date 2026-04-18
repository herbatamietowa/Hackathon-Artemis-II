"""Load and cache all sheets from hackathon_dataset.xlsx."""
from __future__ import annotations
import functools
from pathlib import Path

import pandas as pd

SHEET_NAMES = [
    "1_1 Export Plates",
    "1_2 Gaskets",
    "1_3 Export Project list",
    "2_1 Work Center Capacity Weekly",
    "2_2 OPS plan per material ",
    "2_3 SAP MasterData",
    "2_4 Model Calendar",
    "2_5 WC Schedule_limits",
    "2_6 Tool_material nr master",
    "3_1 Inventory ATP",
    "3_2 Component_SF_RM",
]

# Short aliases used throughout the codebase
SHEET_ALIAS = {
    "s11": "1_1 Export Plates",
    "s12": "1_2 Gaskets",
    "s13": "1_3 Export Project list",
    "s21": "2_1 Work Center Capacity Weekly",
    "s22": "2_2 OPS plan per material ",
    "s23": "2_3 SAP MasterData",
    "s24": "2_4 Model Calendar",
    "s25": "2_5 WC Schedule_limits",
    "s26": "2_6 Tool_material nr master",
    "s31": "3_1 Inventory ATP",
    "s32": "3_2 Component_SF_RM",
}


@functools.lru_cache(maxsize=1)
def load_workbook(path: str | Path) -> dict[str, pd.DataFrame]:
    """Load all sheets once and cache. Reads #N/A as NaN (default pandas behaviour)."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Dataset not found: {path}")

    raw = pd.read_excel(
        path,
        sheet_name=None,  # load all sheets
        engine="openpyxl",
    )
    # Normalise sheet names (strip trailing spaces)
    return {k.strip(): v for k, v in raw.items()}


def get_sheet(alias: str, path: str | Path) -> pd.DataFrame:
    """Return a sheet by short alias (e.g. 's11', 's26')."""
    wb = load_workbook(path)
    full_name = SHEET_ALIAS[alias].strip()
    # Try exact match first, then strip-matched
    for k in wb:
        if k == full_name or k.strip() == full_name:
            return wb[k].copy()
    raise KeyError(f"Sheet alias '{alias}' → '{full_name}' not found. Available: {list(wb.keys())}")


def invalidate_cache() -> None:
    load_workbook.cache_clear()
