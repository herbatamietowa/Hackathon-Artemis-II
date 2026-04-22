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

# In-memory override set by upload endpoint — survives until restart
_wb_override: dict[str, pd.DataFrame] | None = None


@functools.lru_cache(maxsize=1)
def _load_from_disk(path: Path) -> dict[str, pd.DataFrame]:
    """Load all sheets once from disk and cache."""
    if not path.exists():
        raise FileNotFoundError(f"Dataset not found: {path}")
    raw = pd.read_excel(path, sheet_name=None, engine="openpyxl")
    return {k.strip(): v for k, v in raw.items()}


def load_workbook(path: str | Path) -> dict[str, pd.DataFrame]:
    """Return the active workbook — override if set, otherwise disk cache."""
    if _wb_override is not None:
        return _wb_override
    return _load_from_disk(Path(path))


def set_workbook_override(wb: dict[str, pd.DataFrame]) -> None:
    """Replace the active workbook with a merged in-memory version."""
    global _wb_override
    _wb_override = wb
    _load_from_disk.cache_clear()


def get_sheet(alias: str, path: str | Path) -> pd.DataFrame:
    """Return a sheet by short alias (e.g. 's11', 's26')."""
    wb = load_workbook(path)
    full_name = SHEET_ALIAS[alias].strip()
    for k in wb:
        if k == full_name or k.strip() == full_name:
            return wb[k].copy()
    raise KeyError(f"Sheet alias '{alias}' → '{full_name}' not found. Available: {list(wb.keys())}")


def invalidate_cache() -> None:
    global _wb_override
    _wb_override = None
    _load_from_disk.cache_clear()
