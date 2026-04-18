"""Test three-tier missing data classification."""
import pandas as pd
import pytest
from app.data.missing import three_tier_classify, summarise_quality


def _make_row(**kwargs):
    defaults = {
        "Connector Plant_Material nr": "NW01_MAT001",
        "Material number": "MAT001",
        "Connector RCCP pivot": "NW01_RCCP",
        "Cycle time": 1.5,
        "Work center": "PRESS_1",
        "Rev no": 1,
        "_status": "ok",
    }
    defaults.update(kwargs)
    return defaults


def _df(*rows):
    return pd.DataFrame(list(rows))


def _tool_master():
    return pd.DataFrame([{
        "Connector": "NW01_MAT001",
        "Cycle times Standard Value (Machine)": 1.5,
        "Work center": "PRESS_1",
        "Material Status": "Active",
        "Rev no": 1,
    }])


def test_ok_row_stays_ok():
    df = _df(_make_row())
    result = three_tier_classify(df, _tool_master())
    assert result["_status"].iloc[0] == "ok"


def test_tier0_reconstruction():
    """Blank Connector reconstructed from plant+material."""
    row = _make_row(**{
        "Connector Plant_Material nr": "_",
        "Connector RCCP pivot": "NW01_RCCP",
        "Material number": "MAT001",
    })
    df = _df(row)
    result = three_tier_classify(df, _tool_master())
    assert result["_status"].iloc[0] == "reconstructed"
    assert result["Connector Plant_Material nr"].iloc[0] == "NW01_MAT001"


def test_tier1_imputation():
    """Missing cycle time imputed from tool master via Connector."""
    row = _make_row(**{"Cycle time": "Missing CT"})
    df = _df(row)
    result = three_tier_classify(df, _tool_master())
    assert result["_status"].iloc[0] == "imputed"
    assert result["Cycle time"].iloc[0] == 1.5


def test_tier2_flagged_when_wc_still_missing():
    """No tool master entry → flagged."""
    row = _make_row(**{
        "Connector Plant_Material nr": "NW01_UNKNOWN",
        "Work center": "Missing WC",
    })
    df = _df(row)
    result = three_tier_classify(df, _tool_master())
    assert result["_status"].iloc[0] == "flagged"


def test_summarise_quality_counts():
    rows = [
        _make_row(),
        _make_row(**{"Connector Plant_Material nr": "_", "Material number": "MAT001", "Connector RCCP pivot": "NW01_RCCP"}),
        _make_row(**{"Cycle time": "Missing CT"}),
    ]
    df = _df(*rows)
    result = three_tier_classify(df, _tool_master())
    summary = summarise_quality(result)
    assert summary["ok"] >= 1
    assert summary["reconstructed_rows"] >= 0
