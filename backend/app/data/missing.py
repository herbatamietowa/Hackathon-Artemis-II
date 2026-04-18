"""Three-tier missing data classification.

Tier 0 — Reconstruct: attempt to rebuild Connector from {Plant}_{Material number}
Tier 1 — Impute:      resolve Missing CT / Missing WC via 2_6 join
Tier 2 — Flag:        reconstruction failed or join still incomplete
Tier 3 — Drop:        no material code AND no monthly demand
"""
from __future__ import annotations
import pandas as pd


PLACEHOLDER_STRINGS = {"Missing CT", "Missing WC", "Missing tool", "Missing plant", "_", "#N/A"}


def three_tier_classify(
    df: pd.DataFrame,
    tool_master: pd.DataFrame,
) -> pd.DataFrame:
    """Attach _status column to pipeline demand frame (1_1 or 1_2 merged with 2_6).

    Returns df with extra columns:
      _status: 'ok' | 'reconstructed' | 'imputed' | 'flagged' | 'dropped'
      _rev_mismatch: bool
    """
    df = df.copy()
    df["_status"] = "ok"
    df["_rev_mismatch"] = False

    connector_col = "Connector Plant_Material nr"
    material_col = "Material number"
    plant_col = "Connector RCCP pivot"

    # --- Tier 0: Reconstruct Connector from Plant + Material number ---
    mask_blank = (
        df[connector_col].isna() |
        df[connector_col].isin(PLACEHOLDER_STRINGS)
    )
    if mask_blank.any() and material_col in df.columns:
        plant_codes = df.loc[mask_blank, plant_col].str.split("_").str[0]
        mat_codes = df.loc[mask_blank, material_col]
        reconstructed = plant_codes + "_" + mat_codes
        valid_recon = reconstructed.notna() & reconstructed.str.match(r"NW\d{2}_.+")
        df.loc[mask_blank & valid_recon, connector_col] = reconstructed[valid_recon]
        df.loc[mask_blank & valid_recon, "_status"] = "reconstructed"

    # --- Tier 1: Impute cycle time / WC from tool master (2_6) via Connector ---
    mask_missing_ct = (
        df.get("Cycle time", pd.Series(dtype=str)).isin(PLACEHOLDER_STRINGS) |
        df.get("Cycle time", pd.Series(dtype=str)).isna()
    )
    mask_missing_wc = (
        df.get("Work center", pd.Series(dtype=str)).isin(PLACEHOLDER_STRINGS) |
        df.get("Work center", pd.Series(dtype=str)).isna()
    )
    needs_impute = (mask_missing_ct | mask_missing_wc) & (df["_status"] != "dropped")

    if needs_impute.any() and not tool_master.empty:
        # Rev no dedup: prefer Active status, then latest Rev no
        tm = tool_master.copy()
        if "Material Status" in tm.columns:
            tm = tm.sort_values(
                ["Material Status", "Rev no"],
                ascending=[True, False],  # Active < Phase-out alphabetically → True sorts Active first
                na_position="last",
            )
            # Re-sort so Active comes first (Active > Phase-out alphabetically)
            active_mask = tm["Material Status"].str.lower().str.strip() == "active"
            tm = pd.concat([tm[active_mask], tm[~active_mask]])
        tm_deduped = tm.drop_duplicates(subset=["Connector"], keep="first")

        lookup = tm_deduped.set_index("Connector")[["Cycle times Standard Value (Machine)", "Work center"]].to_dict("index")

        for idx in df[needs_impute].index:
            conn = df.at[idx, connector_col]
            if pd.notna(conn) and conn in lookup:
                if mask_missing_ct[idx]:
                    df.at[idx, "Cycle time"] = lookup[conn]["Cycle times Standard Value (Machine)"]
                if mask_missing_wc[idx]:
                    df.at[idx, "Work center"] = lookup[conn]["Work center"]
                if df.at[idx, "_status"] == "ok":
                    df.at[idx, "_status"] = "imputed"

    # --- Rev no mismatch flag ---
    if "Rev no" in df.columns and "Rev no" in tool_master.columns:
        rev_lookup = tool_master.drop_duplicates("Connector").set_index("Connector")["Rev no"]
        df["_rev_mismatch"] = (
            df[connector_col]
            .map(rev_lookup)
            .fillna(df.get("Rev no", pd.Series(dtype=object)))
            != df.get("Rev no", pd.Series(dtype=object))
        )

    # --- Tier 2: Flag remaining missing ---
    still_missing = (
        df["_status"].isin(["ok", "reconstructed", "imputed"]) &
        (
            df.get("Work center", pd.Series(dtype=str)).isin(PLACEHOLDER_STRINGS) |
            df.get("Work center", pd.Series(dtype=str)).isna()
        )
    )
    df.loc[still_missing, "_status"] = "flagged"

    # --- Tier 3: Drop fully empty rows ---
    month_cols = [c for c in df.columns if str(c).strip()[:1].isdigit() and "20" in str(c)]
    if month_cols:
        no_qty = df[month_cols].fillna(0).sum(axis=1) == 0
        no_material = df[connector_col].isna() | df[connector_col].isin(PLACEHOLDER_STRINGS)
        df.loc[no_qty & no_material, "_status"] = "dropped"

    return df


def summarise_quality(df: pd.DataFrame) -> dict:
    counts = df["_status"].value_counts().to_dict()
    return {
        "ok": counts.get("ok", 0),
        "reconstructed_rows": counts.get("reconstructed", 0),
        "imputed": counts.get("imputed", 0),
        "flag_count": counts.get("flagged", 0),
        "excluded_rows": counts.get("dropped", 0),
        "rev_mismatch": int(df.get("_rev_mismatch", pd.Series(False)).sum()),
    }
