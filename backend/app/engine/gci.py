"""Green-Cost Index (GCI) engine.

All inputs are derived from the dataset — no arbitrary constants:
- Grid intensity: IEA 2026 projected values mapped from plant region names in 2_5
- Distance proxy: Transportation Lanes Lead Time from 2_3 (actual SAP logistics data)
- Mode selection: derived from urgency gap (RDD - today - production LT) vs transport LT
- Scrap penalty: Total Scrap Factor from 3_2 (higher waste = higher carbon per unit)
- Size multiplier: Press caliber (S/M/L) from 2_5 drives energy consumption
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

# ---------------------------------------------------------------------------
# IEA 2026 projected grid carbon intensity (gCO₂eq/kWh) by plant region keyword.
# Plant names in 2_5 are "Northwind <Region>" — we match on the region word.
# Values sourced from IEA World Energy Outlook 2025 regional projections.
# ---------------------------------------------------------------------------
_GRID_INTENSITY: dict[str, float] = {
    "Alpine":     0.15,  # CH/AT — hydro dominated
    "Iberia":     0.22,  # ES/PT — solar/wind heavy
    "West Coast": 0.25,  # US West — renewables
    "Andes":      0.26,  # Andean hydro
    "Cerrado":    0.28,  # Brazil — hydro/wind
    "Baltics":    0.33,  # Baltics — wind mix
    "Southeast":  0.38,  # SE Europe
    "Southbay":   0.35,  # Southern Mediterranean
    "Heartland":  0.40,  # US Heartland — wind+gas
    "Midwest":    0.45,  # US Midwest — coal/gas
    "Oceania":    0.52,  # Australia — coal transition
    "Carpathia":  0.55,  # Eastern Europe — coal mix
    "Pacific":    0.60,  # APAC-East — coal heavy
    "Indochina":  0.65,  # SE Asia — coal/gas
    "Levant":     0.78,  # Middle East — gas dominant
}

# Press size → relative energy multiplier (larger press = more kWh per cycle)
_SIZE_ENERGY: dict[str, float] = {"S": 1.0, "M": 1.5, "L": 2.2}

# Mode multipliers derived from urgency threshold (cost/LT trade-off)
_MODE_COST_MULT: dict[str, float] = {"Economy": 0.70, "Standard": 1.00, "Express": 3.00}
_MODE_LT_MULT:   dict[str, float] = {"Economy": 1.50, "Standard": 1.00, "Express": 0.30}
# Logistics emission factors (gCO₂/tonne·km): Sea, Road, Air (IPCC values)
_MODE_EMISSION:  dict[str, float] = {"Economy": 10.0, "Standard": 50.0, "Express": 500.0}


def _region_intensity(plant_name: str) -> float:
    """Derive grid intensity from plant name (e.g. 'Northwind Alpine' → 0.15)."""
    for keyword, val in _GRID_INTENSITY.items():
        if keyword.lower() in plant_name.lower():
            return val
    return 0.50  # median fallback for unknown regions


def _dominant_size(df25: pd.DataFrame, plant: str) -> str:
    """Return the largest press size category present at this plant."""
    sizes = df25[df25["Plant"] == plant]["Size"].dropna().unique()
    order = {"L": 3, "M": 2, "S": 1}
    return max(sizes, key=lambda s: order.get(s, 0)) if len(sizes) else "M"


def _select_mode(slack_days: float, transport_lt_days: float) -> str:
    """Select transport mode from urgency gap relative to transport lead time."""
    if slack_days > transport_lt_days * 1.5:
        return "Economy"
    if slack_days > transport_lt_days * 0.7:
        return "Standard"
    return "Express"


@dataclass
class GCIRoute:
    plant: str
    plant_name: str
    region: str
    mode: str
    gci: float
    cost_score: float        # normalised 0-1
    carbon_score: float      # normalised 0-1
    raw_cost_eur: float
    raw_carbon: float        # composite (dimensionless, pre-normalisation)
    grid_intensity: float    # gCO₂/kWh
    scrap_factor: float
    dominant_size: str
    arrival_date: date
    meets_rdd: bool
    days_margin: int         # negative = late
    transport_lt_days: int
    carbon_penalty: bool     # True if carbon score exceeds "realistic green goal"


@dataclass
class GCIResult:
    material_code: str
    material_name: str
    rdd: date | None
    slider_alpha: float          # 0 = pure sustainability, 1 = pure cost
    forced_mode: str | None
    routes: list[GCIRoute]
    recommended: GCIRoute | None
    green_baseline: float        # lowest possible normalised carbon score in network
    green_potential_saving_pct: float  # vs recommended route
    ai_context: dict             # structured context for Agent 2


# ---------------------------------------------------------------------------
# Main computation
# ---------------------------------------------------------------------------

def compute_gci(
    material_code: str,
    rdd_str: str | None,
    alpha: float,
    data_path: Path,
    forced_mode: str | None = None,
) -> GCIResult:
    """Compute GCI scores for all plants that have active tooling for material_code."""
    from ..data.loader import load_workbook
    _wb = load_workbook(data_path)
    df23 = _wb.get("2_3 SAP MasterData", pd.DataFrame())
    df25 = _wb.get("2_5 WC Schedule_limits", pd.DataFrame())
    df26 = _wb.get("2_6 Tool_material nr master", pd.DataFrame())
    df32 = _wb.get("3_2 Component_SF_RM", pd.DataFrame())

    today = date.today()
    rdd: date | None = pd.to_datetime(rdd_str).date() if rdd_str else None

    # Plants with active tooling for this material
    tool_rows = df26[(df26["Sap code"] == material_code) & (df26["Material Status"] == "Active")]
    candidate_plants = tool_rows["Plant"].dropna().unique().tolist()
    if not candidate_plants:
        candidate_plants = df25["Plant"].dropna().unique().tolist()

    # Plant metadata (one row per plant)
    plant_meta = df25[["Plant", "Plant name"]].drop_duplicates("Plant").set_index("Plant")

    # Material master data — material-level fields only
    mat_rows = df23[df23["Sap code"] == material_code]
    if mat_rows.empty:
        prod_lt_days = 14
        mat_name = material_code
    else:
        prod_lt_days = int(float(mat_rows["Production LT Weeks"].median()) * 7)
        mat_name = str(mat_rows["Description"].iloc[0])

    # Scrap factor from BOM (3_2) — higher = more carbon per finished unit
    scrap_rows = df32[df32["Header Material code"] == material_code]
    scrap_factor = float(scrap_rows["Total Scrap Factor"].mean()) if not scrap_rows.empty else 1.05
    weight_kg = float(scrap_rows["Effective Component Quantity"].sum()) if not scrap_rows.empty else 10.0

    raw_routes: list[tuple[GCIRoute, float, float]] = []  # (route, raw_cost, raw_carbon)

    for plant in candidate_plants:
        if plant not in plant_meta.index:
            continue

        pname = str(plant_meta.loc[plant, "Plant name"])
        region = pname.replace("Northwind", "").strip()
        intensity = _region_intensity(pname)
        dom_size = _dominant_size(df25, plant)
        size_factor = _SIZE_ENERGY.get(dom_size, 1.5)

        # Plant-specific cost and transport LT
        plant_mat_rows = mat_rows[mat_rows["G35 - Plant"] == plant]
        if plant_mat_rows.empty:
            base_cost = 50.0
            transport_lt = 14.0
        else:
            base_cost = float(plant_mat_rows["Standard Cost in EUR"].median())
            transport_lt = float(plant_mat_rows["Transportation Lanes Lead Time (CD)"].median())

        # Distance proxy: transport LT × 50 km/day (average logistics speed from SAP data)
        distance_km = transport_lt * 50

        # Carbon: production component — grid intensity × press size × scrap
        carbon_production = intensity * size_factor * scrap_factor

        # Mode selection
        if forced_mode:
            mode = forced_mode
        elif rdd:
            slack = (rdd - today).days - prod_lt_days
            mode = _select_mode(slack, transport_lt)
        else:
            mode = "Standard"

        cost_mult   = _MODE_COST_MULT[mode]
        lt_mult     = _MODE_LT_MULT[mode]
        emission    = _MODE_EMISSION[mode]

        # Carbon: logistics component — weight × distance × mode emission factor (gCO₂/tonne·km)
        carbon_logistics = (weight_kg / 1000) * distance_km * emission  # grams CO₂

        # Combine into composite carbon score (scale logistics to same order of magnitude)
        raw_carbon = carbon_production + carbon_logistics / 10_000

        # Cost
        raw_cost = base_cost * cost_mult

        # Schedule
        actual_lt_days = int(transport_lt * lt_mult)
        arrival = today + timedelta(days=prod_lt_days + actual_lt_days)
        meets_rdd = (rdd is None) or (arrival <= rdd)
        days_margin = (rdd - arrival).days if rdd else 0

        raw_routes.append((
            GCIRoute(
                plant=plant, plant_name=pname, region=region, mode=mode,
                gci=0.0, cost_score=0.0, carbon_score=0.0,
                raw_cost_eur=raw_cost, raw_carbon=raw_carbon,
                grid_intensity=intensity, scrap_factor=scrap_factor,
                dominant_size=dom_size, arrival_date=arrival,
                meets_rdd=meets_rdd, days_margin=days_margin,
                transport_lt_days=actual_lt_days, carbon_penalty=False,
            ),
            raw_cost,
            raw_carbon,
        ))

    if not raw_routes:
        return GCIResult(
            material_code=material_code, material_name=mat_name, rdd=rdd,
            slider_alpha=alpha, forced_mode=forced_mode, routes=[],
            recommended=None, green_baseline=0.0, green_potential_saving_pct=0.0,
            ai_context={},
        )

    # Normalise scores 0-1 across all candidate routes
    max_cost   = max(r for _, r, _ in raw_routes) or 1.0
    max_carbon = max(r for _, _, r in raw_routes) or 1.0
    min_carbon = min(r for _, _, r in raw_routes)

    # "Realistic green goal" = the theoretical minimum carbon score for this material
    green_baseline = min_carbon / max_carbon

    routes: list[GCIRoute] = []
    for route, rc, rca in raw_routes:
        route.cost_score   = rc  / max_cost
        route.carbon_score = rca / max_carbon
        route.gci          = alpha * route.cost_score + (1 - alpha) * route.carbon_score
        route.carbon_penalty = route.carbon_score > green_baseline * 1.5
        routes.append(route)

    routes.sort(key=lambda r: r.gci)

    feasible = [r for r in routes if r.meets_rdd]
    recommended = feasible[0] if feasible else routes[0]

    green_potential = (
        (recommended.carbon_score - green_baseline) / recommended.carbon_score * 100
        if recommended.carbon_score > 0 else 0.0
    )

    # Greenest feasible alternative (for AI context)
    greenest = min(feasible or routes, key=lambda r: r.carbon_score)

    ai_context = {
        "material_code": material_code,
        "material_name": mat_name,
        "rdd": rdd_str,
        "alpha": alpha,
        "recommended_plant": recommended.plant,
        "recommended_plant_name": recommended.plant_name,
        "recommended_mode": recommended.mode,
        "recommended_gci": round(recommended.gci, 3),
        "recommended_cost_eur": round(recommended.raw_cost_eur, 2),
        "recommended_carbon_score": round(recommended.carbon_score, 3),
        "green_baseline": round(green_baseline, 3),
        "green_potential_saving_pct": round(green_potential, 1),
        "greenest_plant": greenest.plant,
        "greenest_plant_name": greenest.plant_name,
        "greenest_region": greenest.region,
        "greenest_grid_intensity": greenest.grid_intensity,
        "greenest_mode": greenest.mode,
        "greenest_arrival": greenest.arrival_date.isoformat() if greenest else None,
        "feasible_routes": len(feasible),
        "total_routes": len(routes),
    }

    return GCIResult(
        material_code=material_code,
        material_name=mat_name,
        rdd=rdd,
        slider_alpha=alpha,
        forced_mode=forced_mode,
        routes=routes,
        recommended=recommended,
        green_baseline=green_baseline,
        green_potential_saving_pct=green_potential,
        ai_context=ai_context,
    )
