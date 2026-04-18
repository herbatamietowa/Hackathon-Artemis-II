"""Project simulation engine — BOM explosion + three-scenario production planning.

Steps:
1. Explosion: find paired Gasket from 3_2 (Comp Plate/Gasket column), identify raw materials
2. Feasibility: plants with active tooling for BOTH plate and gasket in 2_6
3. Inventory: check Coil/Rubber Compound availability from 3_1 Inventory ATP
4. Three paths: Green (low carbon + Economy), Fast (best WC headroom + Express),
                Budget (lowest unit cost + Standard)
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

logger = logging.getLogger(__name__)

_MODE_LT_MULT:          dict[str, float] = {"Economy": 1.50, "Standard": 1.00, "Express": 0.30}
_MODE_COST_PER_TKM:     dict[str, float] = {"Economy": 0.05, "Standard": 0.15, "Express": 3.00}
_MODE_EMISSION_GTKM:    dict[str, float] = {"Economy": 10.0, "Standard": 50.0, "Express": 500.0}

_GRID_INTENSITY: dict[str, float] = {
    "Alpine": 0.15, "Iberia": 0.22, "West Coast": 0.25, "Andes": 0.26,
    "Cerrado": 0.28, "Baltics": 0.33, "Southeast": 0.38, "Southbay": 0.35,
    "Heartland": 0.40, "Midwest": 0.45, "Oceania": 0.52, "Carpathia": 0.55,
    "Pacific": 0.60, "Indochina": 0.65, "Levant": 0.78,
}


def _grid(plant_name: str) -> float:
    for k, v in _GRID_INTENSITY.items():
        if k.lower() in plant_name.lower():
            return v
    return 0.50


@dataclass
class RawMaterialStatus:
    code: str
    name: str
    available_qty: float
    needed_qty: float
    sufficient: bool
    unit: str = "KG"


@dataclass
class SimulationPath:
    name: str
    icon: str
    plant: str
    plant_name: str
    mode: str
    total_cost_eur: float
    plate_cost: float
    gasket_cost: float
    shipping_cost: float
    delivery_days: int
    raw_material_lt_days: int
    production_lt_days: int
    logistics_lt_days: int
    carbon_score: float       # 0-100
    grid_intensity: float
    scrap_factor: float
    estimated_co2_kg: float   # estimated total CO₂ in kg (production + logistics)


@dataclass
class ProjectSimulationResult:
    plate_code: str
    plate_name: str
    gasket_code: str | None
    gasket_name: str
    quantity: int
    feasible_plants: list[str]
    raw_materials: list[RawMaterialStatus] = field(default_factory=list)
    paths: list[SimulationPath] = field(default_factory=list)
    warning: str | None = None


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

def get_plate_list(data_path: Path) -> list[dict]:
    """Return unique header materials from 3_2 with names from 2_3."""
    df32 = pd.read_excel(data_path, sheet_name="3_2 Component_SF_RM")
    df23 = pd.read_excel(data_path, sheet_name="2_3 SAP MasterData")
    name_map = df23.set_index("Sap code")["Description"].to_dict() if "Description" in df23.columns else {}
    codes = sorted(str(c) for c in df32["Header Material code"].dropna().unique())
    return [{"code": c, "name": str(name_map.get(c, c))} for c in codes]


# ---------------------------------------------------------------------------
# Main simulation
# ---------------------------------------------------------------------------

def compute_project_simulation(
    plate_code: str,
    quantity: int,
    data_path: Path,
) -> ProjectSimulationResult:
    df32 = pd.read_excel(data_path, sheet_name="3_2 Component_SF_RM")
    df26 = pd.read_excel(data_path, sheet_name="2_6 Tool_material nr master")
    df23 = pd.read_excel(data_path, sheet_name="2_3 SAP MasterData")
    df25 = pd.read_excel(data_path, sheet_name="2_5 WC Schedule_limits")
    df21 = pd.read_excel(data_path, sheet_name="2_1 Work Center Capacity Weekly")
    try:
        df31 = pd.read_excel(data_path, sheet_name="3_1 Inventory ATP")
    except Exception:
        df31 = pd.DataFrame()

    name_map = df23.set_index("Sap code")["Description"].to_dict() if "Description" in df23.columns else {}
    plate_name = str(name_map.get(plate_code, plate_code))

    # ── BOM explosion ─────────────────────────────────────────────────────────
    bom = df32[df32["Header Material code"] == plate_code].copy()
    bom["_type"] = bom.get("Comp Plate/Gasket", pd.Series(dtype=str)).fillna("").str.strip().str.lower()

    scrap_factor = float(bom["Total Scrap Factor"].mean()) if "Total Scrap Factor" in bom.columns and not bom.empty else 1.05
    weight_per_unit = float(bom["Effective Component Quantity"].sum()) if "Effective Component Quantity" in bom.columns and not bom.empty else 10.0
    prod_lt_bom = float(bom["Production LT in Weeks"].max()) if "Production LT in Weeks" in bom.columns and not bom.empty else 2.0

    # Gasket: rows where Comp Plate/Gasket contains "gasket"
    gasket_rows = bom[bom["_type"].str.contains("gasket", na=False)]
    gasket_code: str | None = None
    if not gasket_rows.empty and "Component Material code" in gasket_rows.columns:
        gasket_code = str(gasket_rows["Component Material code"].iloc[0])

    gasket_name = str(name_map.get(gasket_code, gasket_code)) if gasket_code else "Not identified"

    # Raw material rows (everything that is neither plate nor gasket)
    rm_mask = ~bom["_type"].str.contains("plate|gasket", na=False)
    rm_bom = bom[rm_mask]

    # ── Raw material inventory check ──────────────────────────────────────────
    raw_materials: list[RawMaterialStatus] = []
    if not df31.empty and "Component Material code" in rm_bom.columns:
        for _, rm_row in rm_bom.iterrows():
            rm_code = rm_row.get("Component Material code")
            if pd.isna(rm_code):
                continue
            rm_code = str(rm_code)

            needed = float(rm_row.get("Effective Component Quantity", 1.0)) * quantity

            inv = df31[df31["Material Unique (code)"] == rm_code]
            atp = float(inv["ATP Quantity"].sum()) if "ATP Quantity" in inv.columns and not inv.empty else 0.0
            in_transit = float(inv["Stock in Transit Qty"].sum()) if "Stock in Transit Qty" in inv.columns and not inv.empty else 0.0
            available = atp + in_transit

            rm_desc = rm_row.get("Component Description") or name_map.get(rm_code, rm_code)
            unit = str(rm_row.get("Component BUoM", "KG"))

            raw_materials.append(RawMaterialStatus(
                code=rm_code,
                name=str(rm_desc),
                available_qty=round(available, 1),
                needed_qty=round(needed, 1),
                sufficient=available >= needed,
                unit=unit,
            ))

        raw_materials = raw_materials[:6]

    # Earliest raw material lead time (days until stock available, or 14 default)
    raw_mat_lt_days = 7 if raw_materials and all(rm.sufficient for rm in raw_materials) else 14

    # ── Plant feasibility (2_6 active tooling for plate AND gasket) ───────────
    active26 = df26[df26["Material Status"] == "Active"] if "Material Status" in df26.columns else df26
    plate_plants = set(active26[active26["Sap code"] == plate_code]["Plant"].dropna().astype(str))
    gasket_plants = set(active26[active26["Sap code"] == gasket_code]["Plant"].dropna().astype(str)) if gasket_code else set()

    feasible = plate_plants & gasket_plants if gasket_plants else plate_plants
    warning: str | None = None
    if not plate_plants:
        warning = f"No active tooling found for plate {plate_code} in 2_6."
    elif gasket_code and not (plate_plants & gasket_plants):
        warning = "No single plant covers both plate and gasket — showing plate-capable plants only."
        feasible = plate_plants

    # ── Per-plant metrics ─────────────────────────────────────────────────────
    plant_meta = df25[["Plant", "Plant name"]].drop_duplicates("Plant").set_index("Plant") if "Plant" in df25.columns else pd.DataFrame()
    week_cols = [c for c in df21.columns if str(c).startswith("Week ")]

    plant_scenarios: list[dict] = []
    for plant in sorted(feasible):
        if plant not in plant_meta.index:
            continue
        pname = str(plant_meta.at[plant, "Plant name"])
        grid = _grid(pname)

        # Costs from 2_3 filtered to this plant
        if "G35 - Plant" in df23.columns:
            p_costs = df23[(df23["Sap code"] == plate_code) & (df23["G35 - Plant"] == plant)]
            g_costs = df23[(df23["Sap code"] == gasket_code) & (df23["G35 - Plant"] == plant)] if gasket_code else pd.DataFrame()
        else:
            p_costs = df23[df23["Sap code"] == plate_code]
            g_costs = df23[df23["Sap code"] == gasket_code] if gasket_code else pd.DataFrame()

        plate_unit = float(p_costs["Standard Cost in EUR"].median()) if not p_costs.empty and "Standard Cost in EUR" in p_costs.columns else 50.0
        gasket_unit = float(g_costs["Standard Cost in EUR"].median()) if not g_costs.empty and "Standard Cost in EUR" in g_costs.columns else 20.0
        transport_lt = float(p_costs["Transportation Lanes Lead Time (CD)"].median()) if not p_costs.empty and "Transportation Lanes Lead Time (CD)" in p_costs.columns else 14.0
        prod_lt_wk = float(p_costs["Production LT Weeks"].median()) if not p_costs.empty and "Production LT Weeks" in p_costs.columns else prod_lt_bom
        prod_lt_days = max(1, int(prod_lt_wk * 7))

        # WC available hours (latest week, Available Capacity measure)
        factory_prefix = f"P01_{plant}_"
        wc_rows = df21[df21["Work center code"].str.startswith(factory_prefix, na=False)] if "Work center code" in df21.columns else pd.DataFrame()
        if "Measure" in wc_rows.columns:
            wc_rows = wc_rows[wc_rows["Measure"].str.strip() == "Available Capacity, hours"]
        wc_headroom = float(wc_rows[week_cols[-1]].sum()) if week_cols and not wc_rows.empty else 1000.0

        plant_scenarios.append({
            "plant": plant, "plant_name": pname,
            "plate_unit": plate_unit, "gasket_unit": gasket_unit,
            "transport_lt": max(1.0, transport_lt), "prod_lt_days": prod_lt_days,
            "grid": grid, "scrap_factor": scrap_factor,
            "weight_per_unit": weight_per_unit, "wc_headroom": wc_headroom,
        })

    if not plant_scenarios:
        return ProjectSimulationResult(
            plate_code=plate_code, plate_name=plate_name,
            gasket_code=gasket_code, gasket_name=gasket_name,
            quantity=quantity, feasible_plants=sorted(feasible),
            raw_materials=raw_materials, paths=[],
            warning=warning or "No plant data found for feasible plants.",
        )

    # ── Select best plant per scenario ────────────────────────────────────────
    green  = min(plant_scenarios, key=lambda s: s["grid"] * s["scrap_factor"])
    fast   = max(plant_scenarios, key=lambda s: s["wc_headroom"])
    budget = min(plant_scenarios, key=lambda s: s["plate_unit"] + s["gasket_unit"])

    paths = [
        _build_path("The Green Path",  "\U0001f33f", green,  quantity, "Economy",  raw_mat_lt_days),
        _build_path("The Fast Path",   "\u26a1",     fast,   quantity, "Express",  raw_mat_lt_days),
        _build_path("The Budget Path", "\U0001f4b0", budget, quantity, "Standard", raw_mat_lt_days),
    ]

    return ProjectSimulationResult(
        plate_code=plate_code, plate_name=plate_name,
        gasket_code=gasket_code, gasket_name=gasket_name,
        quantity=quantity, feasible_plants=sorted(feasible),
        raw_materials=raw_materials, paths=paths,
        warning=warning,
    )


def _build_path(
    name: str, icon: str, s: dict,
    quantity: int, mode: str, raw_mat_lt_days: int,
) -> SimulationPath:
    plate_unit, gasket_unit = s["plate_unit"], s["gasket_unit"]
    scrap = s["scrap_factor"]
    transport_lt = s["transport_lt"]
    weight = s["weight_per_unit"]

    unit_cost = (plate_unit + gasket_unit) * scrap
    logistics_lt = max(1, int(transport_lt * _MODE_LT_MULT[mode]))

    # Shipping: weight × distance × cost-per-tonne-km
    distance_km = transport_lt * 50
    shipping = round((weight * quantity / 1000) * distance_km * _MODE_COST_PER_TKM[mode], 2)

    total = round(unit_cost * quantity + shipping, 2)
    delivery = raw_mat_lt_days + s["prod_lt_days"] + logistics_lt

    # Carbon score 0-100: production emissions + logistics emissions, scaled
    prod_carbon = s["grid"] * scrap * 1.5
    log_carbon = (weight / 1000) * distance_km * _MODE_EMISSION_GTKM[mode] / 10_000
    carbon_score = min(100.0, round((prod_carbon + log_carbon) / 3.0 * 100, 1))

    # Estimated CO₂ in kg: production (grid kgCO₂/kWh × proxy energy) + logistics
    prod_co2_kg = round(s["grid"] * scrap * 1.5 * quantity, 1)
    log_co2_kg = round((weight * quantity / 1000) * distance_km * _MODE_EMISSION_GTKM[mode] / 1_000, 1)
    estimated_co2_kg = round(prod_co2_kg + log_co2_kg, 1)

    return SimulationPath(
        name=name, icon=icon,
        plant=s["plant"], plant_name=s["plant_name"], mode=mode,
        total_cost_eur=total,
        plate_cost=round(plate_unit * quantity * scrap, 2),
        gasket_cost=round(gasket_unit * quantity * scrap, 2),
        shipping_cost=shipping,
        delivery_days=delivery,
        raw_material_lt_days=raw_mat_lt_days,
        production_lt_days=s["prod_lt_days"],
        logistics_lt_days=logistics_lt,
        carbon_score=carbon_score,
        grid_intensity=s["grid"],
        scrap_factor=round(scrap, 3),
        estimated_co2_kg=estimated_co2_kg,
    )
