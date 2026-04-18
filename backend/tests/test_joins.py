"""Test data join quality: key columns should be non-null for ≥80% of rows."""
import pytest
from pathlib import Path

DATA_PATH = Path(__file__).parents[2] / "data" / "hackathon_dataset.xlsx"
pytestmark = pytest.mark.skipif(
    not DATA_PATH.exists(), reason="Dataset not available"
)


@pytest.fixture(scope="module")
def workbook():
    from app.data.loader import load_workbook
    return load_workbook(DATA_PATH)


def _non_null_pct(df, col):
    if col not in df.columns:
        return 0.0
    return df[col].notna().sum() / max(len(df), 1)


def test_sheet_1_1_connector_non_null(workbook):
    df = next(v for k, v in workbook.items() if "1_1" in k)
    assert _non_null_pct(df, "Connector Plant_Material nr") >= 0.8


def test_sheet_1_2_connector_non_null(workbook):
    df = next(v for k, v in workbook.items() if "1_2" in k)
    assert _non_null_pct(df, "Connector Plant_Material nr") >= 0.8


def test_sheet_2_1_wc_code_non_null(workbook):
    df = next(v for k, v in workbook.items() if "2_1" in k)
    wc_col = next((c for c in df.columns if "work center" in c.lower()), None)
    assert wc_col is not None, "No work center column in sheet 2_1"
    assert _non_null_pct(df, wc_col) >= 0.8


def test_sheet_2_5_oee_present(workbook):
    df = next(v for k, v in workbook.items() if "2_5" in k)
    assert len(df) > 0, "Sheet 2_5 is empty"


def test_sheet_2_6_connector_non_null(workbook):
    df = next(v for k, v in workbook.items() if "2_6" in k)
    assert _non_null_pct(df, "Connector") >= 0.8


def test_demand_frame_builds_without_crash():
    from app.data.loader import load_workbook
    from app.data.joins import build_demand_frame
    wb = load_workbook(DATA_PATH)
    sheets = {k.strip(): v for k, v in wb.items()}
    plates  = next(v for k, v in sheets.items() if "1_1" in k)
    gaskets = next(v for k, v in sheets.items() if "1_2" in k)
    projs   = next(v for k, v in sheets.items() if "1_3" in k)
    tool_m  = next(v for k, v in sheets.items() if "2_6" in k)
    demand_df, quality = build_demand_frame(plates, gaskets, projs, tool_m, "NW01")
    total = sum(quality.values())
    assert total > 0, "build_demand_frame returned empty quality summary"
    assert quality.get("excluded_rows", 0) >= 0
