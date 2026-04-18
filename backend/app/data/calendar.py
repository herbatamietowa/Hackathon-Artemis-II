"""Weekly → monthly aggregation using sheet 2_4 (Model Calendar).

Sheet 2_4 is transposed: rows are attributes, columns are dates/weeks.
We need the 'Week Number' and 'Month Number' rows to build a mapping
from ISO week → month, weighted by working days per plant.
"""
from __future__ import annotations
import pandas as pd


def build_week_to_month_map(calendar_df: pd.DataFrame, plant: str = "NW01") -> dict[str, str]:
    """Return {week_col_name: month_label} mapping for a given plant.

    week_col_name matches the format used in sheet 2_1: 'Week N YYYY'
    month_label matches the format used in 1_1/1_2: 'M YYYY' (e.g. '5 2026')
    """
    cal = calendar_df.copy()
    # Row index is attribute name; columns are date/week labels
    cal = cal.set_index(cal.columns[0]) if not isinstance(cal.index, pd.Index) else cal

    # Find the rows we need
    idx = cal.index.astype(str).str.strip()
    week_row = cal[idx == "Week Number"]
    month_row = cal[idx == "Month Number"]
    year_row = cal[idx == "Year"]

    if week_row.empty or month_row.empty:
        return {}

    weeks = week_row.iloc[0]
    months = month_row.iloc[0]
    years = year_row.iloc[0] if not year_row.empty else pd.Series(dtype=object)

    mapping: dict[str, str] = {}
    for col in weeks.index:
        w = weeks[col]
        m = months[col]
        y = years[col] if col in years.index else None
        if pd.notna(w) and pd.notna(m) and pd.notna(y):
            week_label = f"Week {int(w)} {int(y)}"
            month_label = f"{int(m)} {int(y)}"
            mapping[week_label] = month_label

    return mapping


def weekly_to_monthly(
    weekly_df: pd.DataFrame,
    week_to_month: dict[str, str],
    value_col: str,
    group_cols: list[str],
) -> pd.DataFrame:
    """Aggregate a weekly DataFrame to monthly by summing values.

    weekly_df must have columns: group_cols + all week columns + value_col
    Returns DataFrame with columns: group_cols + ['month', value_col]
    """
    week_cols = [c for c in weekly_df.columns if str(c).startswith("Week ") and c in week_to_month]

    melted = weekly_df[group_cols + week_cols].melt(
        id_vars=group_cols,
        value_vars=week_cols,
        var_name="week",
        value_name=value_col,
    )
    melted["month"] = melted["week"].map(week_to_month)
    melted = melted.dropna(subset=["month"])
    melted[value_col] = pd.to_numeric(melted[value_col], errors="coerce").fillna(0)

    return (
        melted.groupby(group_cols + ["month"], as_index=False)[value_col]
        .sum()
    )


def get_working_days_per_month(calendar_df: pd.DataFrame, plant: str = "NW01") -> dict[str, float]:
    """Return {month_label: working_days} for weighting partial-week demand."""
    cal = calendar_df.copy()
    cal = cal.set_index(cal.columns[0]) if not isinstance(cal.index, pd.Index) else cal
    idx = cal.index.astype(str).str.strip()

    wd_row_name = f"Working Days {plant}"
    month_row = cal[idx == "Month Number"]
    year_row = cal[idx == "Year"]
    wd_row = cal[idx == wd_row_name]

    if wd_row.empty or month_row.empty:
        return {}

    months = month_row.iloc[0]
    years = year_row.iloc[0] if not year_row.empty else pd.Series(dtype=object)
    wdays = wd_row.iloc[0]

    result: dict[str, float] = {}
    for col in months.index:
        m = months[col]
        y = years[col] if col in years.index else None
        w = wdays[col] if col in wdays.index else None
        if pd.notna(m) and pd.notna(y) and pd.notna(w):
            label = f"{int(m)} {int(y)}"
            result[label] = result.get(label, 0) + float(w)

    return result
