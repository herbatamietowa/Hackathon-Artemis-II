"""Project simulation engine — BOM explosion + three-scenario production planning.

Inventory flow per feasible plant:
  1. Check finished-goods ATP (3_1) for plate + gasket at that plant.
  2. If ATP >= qty  →  ship only  (no production needed).
  3. If shortfall   →  check raw-material ATP for shortfall qty at that plant.
       RM sufficient  →  produce shortfall, then ship.
       RM missing     →  order RM → produce → ship  (procurement LT from BOM).
Shipping is computed via Haversine distance to the chosen delivery destination.
CO₂ = transport only (GLEC emission factors by mode).
"""
from __future__ import annotations

import logging
import math
import re
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Geography — factory region centroids (estimated; real locations undisclosed)
# ---------------------------------------------------------------------------

FACTORY_COORDS: dict[str, dict] = {
    "NW01": {"lat": 41.88,  "lon": -87.63, "continent": "N. America", "island": False},
    "NW02": {"lat": 51.50,  "lon": 10.50,  "continent": "Europe",      "island": False},
    "NW03": {"lat": 50.06,  "lon": 19.94,  "continent": "Europe",      "island": False},
    "NW04": {"lat": 19.08,  "lon": 72.88,  "continent": "Asia",        "island": False},
    "NW05": {"lat": 35.68,  "lon": 139.69, "continent": "Asia",        "island": True},
    "NW06": {"lat": 33.45,  "lon": -84.39, "continent": "N. America",  "island": False},
    "NW07": {"lat": 37.78,  "lon": -122.42,"continent": "N. America",  "island": False},
    "NW08": {"lat": 40.42,  "lon": -3.70,  "continent": "Europe",      "island": False},
    "NW09": {"lat": 47.38,  "lon": 8.54,   "continent": "Europe",      "island": False},
    "NW10": {"lat": 56.95,  "lon": 24.11,  "continent": "Europe",      "island": False},
    "NW11": {"lat": 25.20,  "lon": 55.27,  "continent": "Middle East", "island": False},
    "NW12": {"lat": -15.78, "lon": -47.93, "continent": "S. America",  "island": False},
    "NW13": {"lat": -33.46, "lon": -70.65, "continent": "S. America",  "island": False},
    "NW14": {"lat": -33.87, "lon": 151.21, "continent": "Oceania",     "island": True},
    "NW15": {"lat": 13.75,  "lon": 100.52, "continent": "Asia",        "island": False},
}

# Curated delivery destinations — major industrial / logistics hubs
DELIVERY_DESTINATIONS: list[dict] = [
    {"name": "Frankfurt, Germany",      "lat": 50.11,  "lon": 8.68,    "continent": "Europe",       "island": False},
    {"name": "Rotterdam, Netherlands",  "lat": 51.92,  "lon": 4.48,    "continent": "Europe",       "island": False},
    {"name": "Warsaw, Poland",          "lat": 52.23,  "lon": 21.01,   "continent": "Europe",       "island": False},
    {"name": "Madrid, Spain",           "lat": 40.42,  "lon": -3.70,   "continent": "Europe",       "island": False},
    {"name": "Istanbul, Turkey",        "lat": 41.01,  "lon": 28.96,   "continent": "Europe",       "island": False},
    {"name": "Milan, Italy",            "lat": 45.46,  "lon": 9.19,    "continent": "Europe",       "island": False},
    {"name": "Stockholm, Sweden",       "lat": 59.33,  "lon": 18.07,   "continent": "Europe",       "island": False},
    {"name": "New York, USA",           "lat": 40.71,  "lon": -74.01,  "continent": "N. America",   "island": False},
    {"name": "Chicago, USA",            "lat": 41.88,  "lon": -87.63,  "continent": "N. America",   "island": False},
    {"name": "Houston, USA",            "lat": 29.76,  "lon": -95.37,  "continent": "N. America",   "island": False},
    {"name": "Los Angeles, USA",        "lat": 34.05,  "lon": -118.24, "continent": "N. America",   "island": False},
    {"name": "Toronto, Canada",         "lat": 43.65,  "lon": -79.38,  "continent": "N. America",   "island": False},
    {"name": "Mexico City, Mexico",     "lat": 19.43,  "lon": -99.13,  "continent": "N. America",   "island": False},
    {"name": "São Paulo, Brazil",       "lat": -23.55, "lon": -46.63,  "continent": "S. America",   "island": False},
    {"name": "Santiago, Chile",         "lat": -33.46, "lon": -70.65,  "continent": "S. America",   "island": False},
    {"name": "Dubai, UAE",              "lat": 25.20,  "lon": 55.27,   "continent": "Middle East",  "island": False},
    {"name": "Mumbai, India",           "lat": 19.08,  "lon": 72.88,   "continent": "Asia",         "island": False},
    {"name": "Singapore",               "lat": 1.35,   "lon": 103.82,  "continent": "Asia",         "island": True},
    {"name": "Shanghai, China",         "lat": 31.23,  "lon": 121.47,  "continent": "Asia",         "island": False},
    {"name": "Tokyo, Japan",            "lat": 35.68,  "lon": 139.69,  "continent": "Asia",         "island": True},
    {"name": "Bangkok, Thailand",       "lat": 13.75,  "lon": 100.52,  "continent": "Asia",         "island": False},
    {"name": "Sydney, Australia",       "lat": -33.87, "lon": 151.21,  "continent": "Oceania",      "island": True},
    {"name": "Johannesburg, S. Africa", "lat": -26.20, "lon": 28.04,   "continent": "Africa",       "island": False},
    {"name": "Lagos, Nigeria",          "lat": 6.52,   "lon": 3.38,    "continent": "Africa",       "island": False},
    {"name": "Cairo, Egypt",            "lat": 30.06,  "lon": 31.24,   "continent": "Africa",       "island": False},
]

# ---------------------------------------------------------------------------
# Transport parameters (GLEC Framework + market rates)
# ---------------------------------------------------------------------------

# gCO₂ per tonne-km
_CO2_FACTOR: dict[str, float] = {"road": 96.0, "rail": 22.0, "sea": 12.0, "air": 602.0}
# EUR per tonne-km (approximate market)
_COST_FACTOR: dict[str, float] = {"road": 0.12, "rail": 0.05, "sea": 0.015, "air": 3.50}
# km per day (effective speed including port/terminal time)
_SPEED: dict[str, int] = {"road": 600, "rail": 500, "sea": 350, "air": 5000}
_AIR_MIN_DAYS = 2        # minimum air freight door-to-door
_SEA_ROUTE_MULT = 1.4   # great-circle → actual shipping lane distance


# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def determine_transport(
    factory_continent: str,
    dest_continent: str,
    dist_km: float,
    dest_island: bool = False,
    factory_island: bool = False,
) -> dict:
    """
    Returns transport metadata for Economy and Express modes.

    Economy/Standard: road (<3 000 km same continent), rail (<8 000 km same continent), else sea.
    Express: always air, min 2 days door-to-door.
    """
    notes: list[str] = []
    if factory_island:
        notes.append("Factory is on an island — initial sea crossing required from origin port.")
    if dest_island:
        notes.append("Destination is island-accessible — partial sea crossing or air required for final leg.")

    same_continent = factory_continent == dest_continent
    if same_continent and dist_km < 3_000:
        eco_mode = "road"
    elif same_continent and dist_km < 8_000:
        eco_mode = "rail"
    else:
        eco_mode = "sea"
        if not same_continent:
            notes.append("Intercontinental route — sea freight (Economy) or air (Express).")

    sea_adjusted = dist_km * (_SEA_ROUTE_MULT if eco_mode == "sea" else 1.0)
    eco_days = max(1, int(sea_adjusted / _SPEED[eco_mode]))
    exp_days = max(_AIR_MIN_DAYS, int(dist_km / _SPEED["air"]))

    return {
        "eco_mode": eco_mode,
        "eco_days": eco_days,
        "eco_co2_per_tonne_km": _CO2_FACTOR[eco_mode],
        "eco_cost_per_tonne_km": _COST_FACTOR[eco_mode],
        "eco_dist_km": sea_adjusted,
        "exp_days": exp_days,
        "exp_co2_per_tonne_km": _CO2_FACTOR["air"],
        "exp_cost_per_tonne_km": _COST_FACTOR["air"],
        "exp_dist_km": dist_km,
        "transport_note": " ".join(notes) if notes else None,
    }


def _plant_col(df: pd.DataFrame) -> str | None:
    """Find the plant column in a DataFrame, trying common names."""
    for name in ("Plant", "G35 - Plant", "plant"):
        if name in df.columns:
            return name
    return None


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------

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
    mode: str                    # "Economy" | "Express" | "Standard"
    transport_mode: str          # "road" | "rail" | "sea" | "air"
    transport_note: str | None
    total_cost_eur: float
    plate_cost: float
    gasket_cost: float
    shipping_cost: float
    delivery_days: int
    raw_material_lt_days: int    # RM procurement wait (0 if RM in stock)
    production_lt_days: int      # 0 if finished goods fully cover qty
    logistics_lt_days: int
    carbon_score: float          # 0-100 normalised transport CO₂
    grid_intensity: float
    scrap_factor: float
    estimated_co2_kg: float      # transport CO₂ only
    rm_ordered_at_plant: bool
    stock_available_qty: int     # finished-goods ATP that covers part of order
    delivery_name: str
    delivery_dist_km: float
    is_bom_pair: bool = False            # plate + compatible gasket ordered together
    joining_time_days: int = 0           # assembly joining time at plate plant
    joining_note: str | None = None      # explanation of joining estimate
    inter_plant_days: int = 0            # transport: gasket plant → plate assembly plant
    inter_plant_cost_eur: float = 0.0
    inter_plant_co2_kg: float = 0.0


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
    data_quality_warning: bool = False


# ---------------------------------------------------------------------------
# Public helpers — material lists
# ---------------------------------------------------------------------------

def _material_list_from_sheet(df: pd.DataFrame, fallback_name_map: dict) -> list[dict]:
    mat_col = next((c for c in df.columns if "material number" in str(c).lower()), None)
    desc_col = next((c for c in df.columns if "material description" in str(c).lower()), None)
    if mat_col is None:
        return []
    rows = df[[mat_col] + ([desc_col] if desc_col else [])].dropna(subset=[mat_col]).drop_duplicates(mat_col)
    result = {}
    for _, row in rows.iterrows():
        code = str(row[mat_col]).strip()
        if not code:
            continue
        name = str(row[desc_col]).strip() if desc_col and pd.notna(row[desc_col]) else fallback_name_map.get(code, code)
        result[code] = name
    return [{"code": c, "name": n} for c, n in sorted(result.items())]


def get_plate_list(data_path: Path) -> list[dict]:
    from ..data.loader import load_workbook
    _wb = load_workbook(data_path)
    df11 = _wb.get("1_1 Export Plates", pd.DataFrame())
    df23 = _wb.get("2_3 SAP MasterData", pd.DataFrame())
    name_map = df23.set_index("Sap code")["Description"].to_dict() if "Description" in df23.columns else {}
    return _material_list_from_sheet(df11, name_map)


def get_gasket_list(data_path: Path) -> list[dict]:
    from ..data.loader import load_workbook
    _wb = load_workbook(data_path)
    df12 = _wb.get("1_2 Gaskets", pd.DataFrame())
    desc_col = next((c for c in df12.columns if "material description" in str(c).lower()), None)
    if desc_col:
        df12 = df12[df12[desc_col].str.contains("gasket", case=False, na=False)]
    df23 = _wb.get("2_3 SAP MasterData", pd.DataFrame())
    name_map = df23.set_index("Sap code")["Description"].to_dict() if "Description" in df23.columns else {}
    return _material_list_from_sheet(df12, name_map)


# ---------------------------------------------------------------------------
# Compatible gasket lookup — Tool No. prefix rule
# ---------------------------------------------------------------------------

def get_compatible_gaskets(plate_code: str, data_path: Path) -> dict:
    """
    Return gaskets compatible with plate_code via the 7-char Tool No. prefix rule.

    Step A: Find plate rows in 2_6 Tool_material nr master.
    Step B: Extract 7-char prefix from Tool No. (e.g. 'T-70017' from 'T-70017-B').
    Step C: Find 2_6 rows sharing that prefix where Type == 'Gaskets'.
    Fallback: if plate not in 2_6 or no Tool No. column, match on Material Description
              prefix token (e.g. 'S160', 'XL420') against 1_2 Gaskets descriptions.
              Sets data_quality_warning = True.
    """
    from ..data.loader import load_workbook
    _wb = load_workbook(data_path)
    df26 = _wb.get("2_6 Tool_material nr master", pd.DataFrame())
    df12 = _wb.get("1_2 Gaskets", pd.DataFrame())
    df23 = _wb.get("2_3 SAP MasterData", pd.DataFrame())

    name_map = df23.set_index("Sap code")["Description"].to_dict() if "Description" in df23.columns else {}

    # Locate relevant columns in 2_6
    sap_col = next((c for c in df26.columns if str(c).strip() == "Sap code"), None)
    tool_col = next(
        (c for c in df26.columns if "tool" in str(c).lower() and ("no" in str(c).lower() or "nr" in str(c).lower())),
        None,
    )
    type_col = next((c for c in df26.columns if str(c).strip().lower() == "type"), None)

    gasket_mat_col = next((c for c in df12.columns if "material number" in str(c).lower()), None)
    gasket_desc_col = next((c for c in df12.columns if "material description" in str(c).lower()), None)

    def _gasket_info(codes: list[str]) -> list[dict]:
        return [{"code": c, "name": str(name_map.get(c, c))} for c in sorted(set(codes))]

    # ── Primary path: Tool No. prefix matching ────────────────────────────────
    if sap_col and tool_col:
        plate_rows = df26[df26[sap_col] == plate_code]
        if not plate_rows.empty:
            prefixes: set[str] = set()
            for tool_no in plate_rows[tool_col].dropna().astype(str):
                p = tool_no.strip()[:7]
                if len(p) >= 3:
                    prefixes.add(p)

            if prefixes:
                mask = df26[tool_col].astype(str).str[:7].isin(prefixes)
                matches = df26[mask]
                if type_col:
                    matches = matches[matches[type_col].str.strip().str.lower() == "gaskets"]

                codes_in_26 = matches[sap_col].dropna().astype(str).tolist()

                # Cross-reference with 1_2 to keep only real gasket catalog entries
                if gasket_mat_col:
                    valid = set(df12[gasket_mat_col].dropna().astype(str).tolist())
                    codes_in_26 = [c for c in codes_in_26 if c in valid]

                return {
                    "compatible_gaskets": _gasket_info(codes_in_26),
                    "tool_prefixes": sorted(prefixes),
                    "data_quality_warning": False,
                    "warning_message": None,
                }

    # ── Fallback: description-prefix string match ─────────────────────────────
    plate_desc = str(name_map.get(plate_code, plate_code))
    token_match = re.match(r"^([A-Za-z]+\d+)", plate_desc.strip())
    desc_prefix = token_match.group(1).upper() if token_match else None

    if desc_prefix and gasket_mat_col and gasket_desc_col:
        matched = df12[df12[gasket_desc_col].str.upper().str.startswith(desc_prefix, na=False)]
        codes = matched[gasket_mat_col].dropna().astype(str).tolist()
        return {
            "compatible_gaskets": _gasket_info(codes),
            "tool_prefixes": [],
            "data_quality_warning": True,
            "warning_message": (
                f"Plate {plate_code} has no Tool No. record in the Tool Master (2_6). "
                f"Compatibility derived from description prefix '{desc_prefix}' — treat as approximate."
            ),
        }

    return {
        "compatible_gaskets": [],
        "tool_prefixes": [],
        "data_quality_warning": True,
        "warning_message": (
            f"Plate {plate_code} could not be matched in the Tool Master or via description prefix. "
            "No compatible gaskets identified."
        ),
    }


# ---------------------------------------------------------------------------
# Standalone gasket simulation (no plate, no BOM explosion)
# ---------------------------------------------------------------------------

def _simulate_standalone_gasket(
    gasket_code: str,
    quantity: int,
    data_path: Path,
    name_map: dict,
    df23: pd.DataFrame,
    df25: pd.DataFrame,
    df21: pd.DataFrame,
    df31: pd.DataFrame,
    df26: pd.DataFrame,
    delivery_lat: float | None,
    delivery_lon: float | None,
    delivery_name: str,
) -> ProjectSimulationResult:
    """
    Gaskets ordered alone: no plate cost, no BOM explosion.
    Finds plants with active gasket tooling, checks gasket ATP, ships to destination.
    """
    gasket_name = str(name_map.get(gasket_code, gasket_code))

    # Plants with active tooling for this gasket
    active26 = df26[df26["Material Status"] == "Active"] if "Material Status" in df26.columns else df26
    feasible = set(active26[active26["Sap code"] == gasket_code]["Plant"].dropna().astype(str))

    plant_meta = (
        df25[["Plant", "Plant name"]].drop_duplicates("Plant").set_index("Plant")
        if "Plant" in df25.columns else pd.DataFrame()
    )
    week_cols = [c for c in df21.columns if str(c).startswith("Week ")]
    inv31_plant_col = _plant_col(df31)
    inv31_mat_col = next((c for c in df31.columns if "Material Unique" in c), None)

    def _atp(plant: str) -> float:
        if df31.empty or inv31_mat_col is None:
            return 0.0
        mask = df31[inv31_mat_col] == gasket_code
        if inv31_plant_col:
            mask = mask & (df31[inv31_plant_col] == plant)
        rows = df31[mask]
        atp_col = next((c for c in rows.columns if "ATP" in c), None)
        return float(rows[atp_col].sum()) if atp_col and not rows.empty else 0.0

    dest_meta = next(
        (d for d in DELIVERY_DESTINATIONS
         if delivery_lat is not None and abs(d["lat"] - delivery_lat) < 0.1 and abs(d["lon"] - delivery_lon) < 0.1),
        None,
    )

    plant_scenarios: list[dict] = []
    for plant in sorted(feasible):
        if plant not in plant_meta.index:
            continue
        pname = str(plant_meta.at[plant, "Plant name"])
        fcoords = FACTORY_COORDS.get(plant, {})

        # Gasket unit cost from 2_3 (plate_unit = 0 for standalone)
        g_mask = df23["Sap code"] == gasket_code
        if "G35 - Plant" in df23.columns:
            g_mask = g_mask & (df23["G35 - Plant"] == plant)
        g_costs = df23[g_mask]
        gasket_unit = float(g_costs["Standard Cost in EUR"].median()) if not g_costs.empty and "Standard Cost in EUR" in g_costs.columns else 20.0
        prod_lt_wk  = float(g_costs["Production LT Weeks"].median())  if not g_costs.empty and "Production LT Weeks"  in g_costs.columns else 2.0
        prod_lt_days = max(1, int(prod_lt_wk * 7))

        gasket_atp = _atp(plant)
        stock_cover = int(min(gasket_atp, quantity))
        shortfall   = max(0, quantity - stock_cover)
        prod_lt_eff = prod_lt_days if shortfall > 0 else 0

        wc_prefix = f"P01_{plant}_"
        wc_rows = df21[df21["Work center code"].str.startswith(wc_prefix, na=False)] if "Work center code" in df21.columns else pd.DataFrame()
        if "Measure" in wc_rows.columns:
            wc_rows = wc_rows[wc_rows["Measure"].str.strip() == "Available Capacity, hours"]
        wc_headroom = float(wc_rows[week_cols[-1]].sum()) if week_cols and not wc_rows.empty else 1_000.0

        if delivery_lat is not None and delivery_lon is not None and fcoords:
            dist_km = haversine_km(fcoords["lat"], fcoords["lon"], delivery_lat, delivery_lon)
        else:
            dist_km = 1_000.0

        transport = determine_transport(
            factory_continent=fcoords.get("continent", "Europe"),
            dest_continent=dest_meta["continent"] if dest_meta else "Europe",
            dist_km=dist_km,
            dest_island=dest_meta.get("island", False) if dest_meta else False,
            factory_island=fcoords.get("island", False),
        )

        weight_tonnes = 2.0 * quantity / 1_000  # rough gasket weight ~2 kg each
        eco_co2_kg   = round(transport["eco_dist_km"] * weight_tonnes * transport["eco_co2_per_tonne_km"] / 1_000, 1)
        exp_co2_kg   = round(transport["exp_dist_km"] * weight_tonnes * transport["exp_co2_per_tonne_km"] / 1_000, 1)
        eco_ship_eur = round(transport["eco_dist_km"] * weight_tonnes * transport["eco_cost_per_tonne_km"], 2)
        exp_ship_eur = round(transport["exp_dist_km"] * weight_tonnes * transport["exp_cost_per_tonne_km"], 2)

        plant_scenarios.append({
            "plant": plant, "plant_name": pname,
            "plate_unit": 0.0, "gasket_unit": gasket_unit,
            "prod_lt_days": prod_lt_eff,
            "grid": _grid(pname), "scrap_factor": 1.0,
            "weight_per_unit": 2.0, "wc_headroom": wc_headroom,
            "stock_cover": stock_cover, "shortfall": shortfall,
            "rm_ordered": False, "rm_wait_days": 0,
            "raw_materials": [],
            "dist_km": dist_km, "transport": transport,
            "eco_co2_kg": eco_co2_kg, "exp_co2_kg": exp_co2_kg,
            "eco_ship_eur": eco_ship_eur, "exp_ship_eur": exp_ship_eur,
            "eco_total_days": prod_lt_eff + transport["eco_days"],
            "exp_total_days": prod_lt_eff + transport["exp_days"],
            "eco_total_eur": round(gasket_unit * quantity + eco_ship_eur, 2),
            "exp_total_eur": round(gasket_unit * quantity + exp_ship_eur, 2),
            "is_bom_pair": False, "joining_days": 0, "joining_note": None,
            "inter_plant_days": 0, "inter_plant_eur": 0.0, "inter_plant_co2": 0.0,
        })

    if not plant_scenarios:
        return ProjectSimulationResult(
            plate_code=gasket_code, plate_name=gasket_name,
            gasket_code=None, gasket_name="Standalone — no plate",
            quantity=quantity, feasible_plants=sorted(feasible),
            warning="No plant data found for this gasket.",
        )

    green  = min(plant_scenarios, key=lambda s: s["eco_co2_kg"])
    fast   = min(plant_scenarios, key=lambda s: s["exp_total_days"])
    budget = min(plant_scenarios, key=lambda s: s["eco_total_eur"])

    paths = [
        _build_path("The Green Path",  "\U0001f33f", green,  quantity, "Economy",  False, delivery_name),
        _build_path("The Fast Path",   "⚡",         fast,   quantity, "Express",  True,  delivery_name),
        _build_path("The Budget Path", "\U0001f4b0", budget, quantity, "Standard", False, delivery_name),
    ]
    return ProjectSimulationResult(
        plate_code=gasket_code, plate_name=gasket_name,
        gasket_code=None, gasket_name="Standalone — no plate",
        quantity=quantity, feasible_plants=sorted(feasible),
        raw_materials=[], paths=paths,
        warning=None,
    )


# ---------------------------------------------------------------------------
# Main simulation
# ---------------------------------------------------------------------------

def compute_project_simulation(
    plate_code: str,
    quantity: int,
    data_path: Path,
    delivery_lat: float | None = None,
    delivery_lon: float | None = None,
    delivery_name: str = "Unspecified",
    gasket_override: str | None = None,   # user-selected compatible gasket; merges into BOM pair
    item_type: str = "plate",             # 'plate' | 'gasket'
) -> ProjectSimulationResult:
    from ..data.loader import load_workbook
    _wb = load_workbook(data_path)
    df32 = _wb.get("3_2 Component_SF_RM", pd.DataFrame())
    df26 = _wb.get("2_6 Tool_material nr master", pd.DataFrame())
    df23 = _wb.get("2_3 SAP MasterData", pd.DataFrame())
    df25 = _wb.get("2_5 WC Schedule_limits", pd.DataFrame())
    df21 = _wb.get("2_1 Work Center Capacity Weekly", pd.DataFrame())
    df31 = _wb.get("3_1 Inventory ATP", pd.DataFrame())

    name_map = df23.set_index("Sap code")["Description"].to_dict() if "Description" in df23.columns else {}
    plate_name = str(name_map.get(plate_code, plate_code))

    # ── Standalone gasket fast-path ───────────────────────────────────────────
    if item_type == "gasket":
        return _simulate_standalone_gasket(
            gasket_code=plate_code,
            quantity=quantity,
            data_path=data_path,
            name_map=name_map,
            df23=df23, df25=df25, df21=df21, df31=df31, df26=df26,
            delivery_lat=delivery_lat,
            delivery_lon=delivery_lon,
            delivery_name=delivery_name,
        )

    # ── BOM explosion ─────────────────────────────────────────────────────────
    bom = df32[df32["Header Material code"] == plate_code].copy()
    bom["_type"] = bom.get("Comp Plate/Gasket", pd.Series(dtype=str)).fillna("").str.strip().str.lower()

    scrap_factor = float(bom["Total Scrap Factor"].mean()) if "Total Scrap Factor" in bom.columns and not bom.empty else 1.05
    weight_per_unit = float(bom["Effective Component Quantity"].sum()) if "Effective Component Quantity" in bom.columns and not bom.empty else 10.0
    prod_lt_bom = float(bom["Production LT in Weeks"].max()) if "Production LT in Weeks" in bom.columns and not bom.empty else 2.0

    gasket_rows = bom[bom["_type"].str.contains("gasket", na=False)]
    gasket_code: str | None = None
    if not gasket_rows.empty and "Component Material code" in gasket_rows.columns:
        gasket_code = str(gasket_rows["Component Material code"].iloc[0])

    # User-selected compatible gasket overrides the BOM-identified one → BOM pair
    is_bom_pair = gasket_override is not None
    if is_bom_pair:
        gasket_code = gasket_override

    gasket_name = str(name_map.get(gasket_code, gasket_code)) if gasket_code else "Not identified"

    rm_mask = ~bom["_type"].str.contains("plate|gasket", na=False)
    rm_bom = bom[rm_mask]

    # ── Plant feasibility (2_6 active tooling) ────────────────────────────────
    active26 = df26[df26["Material Status"] == "Active"] if "Material Status" in df26.columns else df26
    plate_plants = set(active26[active26["Sap code"] == plate_code]["Plant"].dropna().astype(str))
    gasket_plants = set(active26[active26["Sap code"] == gasket_code]["Plant"].dropna().astype(str)) if gasket_code else set()

    feasible = plate_plants & gasket_plants if gasket_plants else plate_plants
    warning: str | None = None
    if not plate_plants:
        warning = f"No active tooling found for plate {plate_code} in Tool Master (2_6)."
    elif gasket_code and not (plate_plants & gasket_plants):
        warning = "No single plant has active tooling for both plate and gasket — showing plate-capable plants."
        feasible = plate_plants

    # ── Plant metadata ────────────────────────────────────────────────────────
    plant_meta = (
        df25[["Plant", "Plant name"]].drop_duplicates("Plant").set_index("Plant")
        if "Plant" in df25.columns else pd.DataFrame()
    )
    week_cols = [c for c in df21.columns if str(c).startswith("Week ")]

    # Column for plant in 3_1
    inv31_plant_col = _plant_col(df31)
    inv31_mat_col = next((c for c in df31.columns if "Material Unique" in c), None)

    def _atp_at_plant(mat_code: str, plant: str) -> float:
        if df31.empty or inv31_mat_col is None:
            return 0.0
        mask = df31[inv31_mat_col] == mat_code
        if inv31_plant_col:
            mask = mask & (df31[inv31_plant_col] == plant)
        rows = df31[mask]
        if rows.empty:
            return 0.0
        atp_col = next((c for c in rows.columns if "ATP" in c), None)
        return float(rows[atp_col].sum()) if atp_col else 0.0

    # ── Per-plant scenario builder ────────────────────────────────────────────
    plant_scenarios: list[dict] = []

    for plant in sorted(feasible):
        if plant not in plant_meta.index:
            continue
        pname = str(plant_meta.at[plant, "Plant name"])

        # Costs from 2_3
        p_mask = df23["Sap code"] == plate_code
        g_mask = df23["Sap code"] == gasket_code if gasket_code else pd.Series(False, index=df23.index)
        if "G35 - Plant" in df23.columns:
            p_mask = p_mask & (df23["G35 - Plant"] == plant)
            g_mask = g_mask & (df23["G35 - Plant"] == plant)

        p_costs = df23[p_mask]
        g_costs = df23[g_mask]

        plate_unit   = float(p_costs["Standard Cost in EUR"].median())  if not p_costs.empty and "Standard Cost in EUR"             in p_costs.columns else 50.0
        gasket_unit  = float(g_costs["Standard Cost in EUR"].median())  if not g_costs.empty and "Standard Cost in EUR"             in g_costs.columns else 20.0
        prod_lt_wk   = float(p_costs["Production LT Weeks"].median())   if not p_costs.empty and "Production LT Weeks"              in p_costs.columns else prod_lt_bom
        prod_lt_days = max(1, int(prod_lt_wk * 7))

        # Grid intensity (from plant name keyword)
        grid = _grid(pname)

        # WC headroom (latest week)
        factory_prefix = f"P01_{plant}_"
        wc_rows = df21[df21["Work center code"].str.startswith(factory_prefix, na=False)] if "Work center code" in df21.columns else pd.DataFrame()
        if "Measure" in wc_rows.columns:
            wc_rows = wc_rows[wc_rows["Measure"].str.strip() == "Available Capacity, hours"]
        wc_headroom = float(wc_rows[week_cols[-1]].sum()) if week_cols and not wc_rows.empty else 1000.0

        # ── Step 1: Finished-goods ATP at this plant ──────────────────────────
        plate_atp   = _atp_at_plant(plate_code,  plant)
        gasket_atp  = _atp_at_plant(gasket_code, plant) if gasket_code else float("inf")

        # How many we can ship directly from stock
        stock_cover = int(min(plate_atp, gasket_atp if gasket_code else plate_atp, quantity))
        shortfall   = max(0, quantity - stock_cover)

        # ── Step 2: RM check for shortfall qty ───────────────────────────────
        rm_ordered   = False
        rm_wait_days = 0
        raw_materials_out: list[RawMaterialStatus] = []
        rm_lt_days_fallback = max(7, int(prod_lt_bom * 7))

        if shortfall > 0 and not rm_bom.empty and "Component Material code" in rm_bom.columns:
            rm_lt_weeks_max = 0.0
            all_rm_ok = True
            for _, rm_row in rm_bom.iterrows():
                rm_code = rm_row.get("Component Material code")
                if pd.isna(rm_code):
                    continue
                rm_code = str(rm_code)
                needed  = float(rm_row.get("Effective Component Quantity", 1.0)) * shortfall

                atp = _atp_at_plant(rm_code, plant)
                transit_col = next((c for c in df31.columns if "transit" in str(c).lower()), None)
                in_transit  = 0.0
                if not df31.empty and inv31_mat_col:
                    t_mask = df31[inv31_mat_col] == rm_code
                    if inv31_plant_col:
                        t_mask = t_mask & (df31[inv31_plant_col] == plant)
                    if transit_col:
                        in_transit = float(df31[t_mask][transit_col].sum())

                available = atp + in_transit
                sufficient = available >= needed

                rm_desc = rm_row.get("Component Description") or name_map.get(rm_code, rm_code)
                unit    = str(rm_row.get("Component BUoM", "KG"))

                raw_materials_out.append(RawMaterialStatus(
                    code=rm_code,
                    name=str(rm_desc),
                    available_qty=round(available, 1),
                    needed_qty=round(needed, 1),
                    sufficient=sufficient,
                    unit=unit,
                ))

                if not sufficient:
                    all_rm_ok = False
                rm_lt = float(rm_row.get("Production LT in Weeks", 2.0) or 2.0)
                rm_lt_weeks_max = max(rm_lt_weeks_max, rm_lt)

            if not all_rm_ok:
                rm_ordered   = True
                rm_wait_days = max(7, int(rm_lt_weeks_max * 7))

        raw_materials_out = raw_materials_out[:6]

        # Production LT applies only when shortfall > 0
        prod_lt_effective = prod_lt_days if shortfall > 0 else 0

        # ── Step 3: Shipping to delivery destination ──────────────────────────
        fcoords = FACTORY_COORDS.get(plant, {})
        if delivery_lat is not None and delivery_lon is not None and fcoords:
            dist_km = haversine_km(fcoords["lat"], fcoords["lon"], delivery_lat, delivery_lon)
        else:
            dist_km = 1_000.0   # default when no destination given

        transport = determine_transport(
            factory_continent=fcoords.get("continent", "Europe"),
            dest_continent="Europe",    # overridden below when destination is known
            dist_km=dist_km,
            dest_island=False,          # overridden below
            factory_island=fcoords.get("island", False),
        )
        # Re-compute with actual destination continent when provided
        # (we store the destination's metadata in the calling layer and
        #  pass it down — but here we only receive lat/lon, so we do a
        #  best-effort guess from the delivery destinations list)
        dest_meta = next(
            (d for d in DELIVERY_DESTINATIONS
             if delivery_lat is not None and abs(d["lat"] - delivery_lat) < 0.1 and abs(d["lon"] - delivery_lon) < 0.1),
            None,
        )
        if dest_meta:
            transport = determine_transport(
                factory_continent=fcoords.get("continent", "Europe"),
                dest_continent=dest_meta["continent"],
                dist_km=dist_km,
                dest_island=dest_meta.get("island", False),
                factory_island=fcoords.get("island", False),
            )

        weight_tonnes = weight_per_unit * quantity / 1_000

        eco_co2_kg   = round(transport["eco_dist_km"]  * weight_tonnes * transport["eco_co2_per_tonne_km"]  / 1_000, 1)
        exp_co2_kg   = round(transport["exp_dist_km"]  * weight_tonnes * transport["exp_co2_per_tonne_km"]  / 1_000, 1)
        eco_ship_eur = round(transport["eco_dist_km"]  * weight_tonnes * transport["eco_cost_per_tonne_km"],          2)
        exp_ship_eur = round(transport["exp_dist_km"]  * weight_tonnes * transport["exp_cost_per_tonne_km"],          2)

        # ── BOM pair: joining time + inter-plant transport (gasket → plate plant) ──
        joining_days       = 0
        joining_note_text  = None
        inter_plant_days   = 0
        inter_plant_eur    = 0.0
        inter_plant_co2    = 0.0

        if is_bom_pair:
            joining_days      = 2
            joining_note_text = (
                "Plate and gasket assembled at plate factory (2 days joining estimate; "
                "no process-time record in dataset). "
                "Transport costs include gasket delivery to assembly plant if made elsewhere."
            )
            # Find which plants can make the override gasket
            gasket_plants_bom = set(
                active26[active26["Sap code"] == gasket_code]["Plant"].dropna().astype(str)
            ) if gasket_code else set()

            if gasket_plants_bom and plant not in gasket_plants_bom:
                # Gasket must come from a different plant — find nearest gasket plant
                pf = FACTORY_COORDS.get(plant, {})
                best_g_plant = min(
                    gasket_plants_bom,
                    key=lambda gp: haversine_km(
                        pf.get("lat", 0), pf.get("lon", 0),
                        FACTORY_COORDS.get(gp, {}).get("lat", 0),
                        FACTORY_COORDS.get(gp, {}).get("lon", 0),
                    ) if gp in FACTORY_COORDS else 99_999,
                )
                gf = FACTORY_COORDS.get(best_g_plant, {})
                if gf and pf:
                    ip_dist = haversine_km(gf["lat"], gf["lon"], pf["lat"], pf["lon"])
                    ip_tr   = determine_transport(
                        gf.get("continent", "Europe"),
                        pf.get("continent", "Europe"),
                        ip_dist,
                        dest_island=pf.get("island", False),
                        factory_island=gf.get("island", False),
                    )
                    # Use economy mode for inter-plant leg (cost-focused)
                    gasket_weight_tonnes = (weight_per_unit / 2) * quantity / 1_000  # rough half-weight
                    inter_plant_days = ip_tr["eco_days"]
                    inter_plant_eur  = round(ip_tr["eco_dist_km"] * gasket_weight_tonnes * ip_tr["eco_cost_per_tonne_km"], 2)
                    inter_plant_co2  = round(ip_tr["eco_dist_km"] * gasket_weight_tonnes * ip_tr["eco_co2_per_tonne_km"] / 1_000, 1)

        eco_total_days = rm_wait_days + prod_lt_effective + inter_plant_days + joining_days + transport["eco_days"]
        exp_total_days = rm_wait_days + prod_lt_effective + inter_plant_days + joining_days + transport["exp_days"]

        eco_total_eur  = round((plate_unit + gasket_unit) * scrap_factor * quantity + eco_ship_eur + inter_plant_eur, 2)
        exp_total_eur  = round((plate_unit + gasket_unit) * scrap_factor * quantity + exp_ship_eur + inter_plant_eur, 2)

        plant_scenarios.append({
            "plant": plant, "plant_name": pname,
            "plate_unit": plate_unit, "gasket_unit": gasket_unit,
            "prod_lt_days": prod_lt_effective,
            "grid": grid, "scrap_factor": scrap_factor,
            "weight_per_unit": weight_per_unit,
            "wc_headroom": wc_headroom,
            # inventory
            "stock_cover": stock_cover,
            "shortfall": shortfall,
            "rm_ordered": rm_ordered,
            "rm_wait_days": rm_wait_days,
            "raw_materials": raw_materials_out,
            # shipping
            "dist_km": dist_km,
            "transport": transport,
            "eco_co2_kg": eco_co2_kg,
            "exp_co2_kg": exp_co2_kg,
            "eco_ship_eur": eco_ship_eur,
            "exp_ship_eur": exp_ship_eur,
            "eco_total_days": eco_total_days,
            "exp_total_days": exp_total_days,
            "eco_total_eur": eco_total_eur,
            "exp_total_eur": exp_total_eur,
            # BOM pair
            "is_bom_pair": is_bom_pair,
            "joining_days": joining_days,
            "joining_note": joining_note_text,
            "inter_plant_days": inter_plant_days,
            "inter_plant_eur": inter_plant_eur,
            "inter_plant_co2": inter_plant_co2,
        })

    if not plant_scenarios:
        return ProjectSimulationResult(
            plate_code=plate_code, plate_name=plate_name,
            gasket_code=gasket_code, gasket_name=gasket_name,
            quantity=quantity, feasible_plants=sorted(feasible),
            raw_materials=[], paths=[],
            warning=warning or "No plant data found for feasible plants.",
        )

    # ── Select best plant per scenario ────────────────────────────────────────
    # Green  = Economy mode, minimise transport CO₂
    # Fast   = Express/air, minimise total door-to-door days
    # Budget = Economy mode, minimise total cost
    green  = min(plant_scenarios, key=lambda s: s["eco_co2_kg"])
    fast   = min(plant_scenarios, key=lambda s: s["exp_total_days"])
    budget = min(plant_scenarios, key=lambda s: s["eco_total_eur"])

    # Pick raw_materials from the selected plant per path
    raw_mats = plant_scenarios[0]["raw_materials"]  # fallback

    paths = [
        _build_path("The Green Path",  "\U0001f33f", green,  quantity, "Economy",  is_express=False, delivery_name=delivery_name),
        _build_path("The Fast Path",   "⚡",         fast,   quantity, "Express",  is_express=True,  delivery_name=delivery_name),
        _build_path("The Budget Path", "\U0001f4b0", budget, quantity, "Standard", is_express=False, delivery_name=delivery_name),
    ]

    # Use raw materials from the green (default) plant for display
    return ProjectSimulationResult(
        plate_code=plate_code, plate_name=plate_name,
        gasket_code=gasket_code, gasket_name=gasket_name,
        quantity=quantity, feasible_plants=sorted(feasible),
        raw_materials=green["raw_materials"] or raw_mats,
        paths=paths,
        warning=warning,
    )


# ---------------------------------------------------------------------------
# Path builder
# ---------------------------------------------------------------------------

def _build_path(
    name: str,
    icon: str,
    s: dict,
    quantity: int,
    mode: str,
    is_express: bool,
    delivery_name: str,
) -> SimulationPath:
    t = s["transport"]
    ship_eur  = s["exp_ship_eur"]  if is_express else s["eco_ship_eur"]
    ship_days = t["exp_days"]      if is_express else t["eco_days"]
    co2_kg    = s["exp_co2_kg"]    if is_express else s["eco_co2_kg"]
    t_mode    = "air"              if is_express else t["eco_mode"]
    dist_km   = t["exp_dist_km"]   if is_express else t["eco_dist_km"]

    plate_cost  = round(s["plate_unit"]  * quantity * s["scrap_factor"], 2)
    gasket_cost = round(s["gasket_unit"] * quantity * s["scrap_factor"], 2)

    inter_eur  = s.get("inter_plant_eur", 0.0)
    inter_co2  = s.get("inter_plant_co2", 0.0)
    total_co2  = round(co2_kg + inter_co2, 1)
    total      = round(plate_cost + gasket_cost + ship_eur + inter_eur, 2)

    joining_days  = s.get("joining_days", 0)
    inter_p_days  = s.get("inter_plant_days", 0)
    delivery_days = s["rm_wait_days"] + s["prod_lt_days"] + inter_p_days + joining_days + ship_days

    ref = 5_000.0
    carbon_score = round(max(0.0, 100.0 - (total_co2 / ref) * 100.0), 1)

    return SimulationPath(
        name=name, icon=icon,
        plant=s["plant"], plant_name=s["plant_name"],
        mode=mode, transport_mode=t_mode,
        transport_note=t.get("transport_note"),
        total_cost_eur=total,
        plate_cost=plate_cost,
        gasket_cost=gasket_cost,
        shipping_cost=ship_eur,
        delivery_days=delivery_days,
        raw_material_lt_days=s["rm_wait_days"],
        production_lt_days=s["prod_lt_days"],
        logistics_lt_days=ship_days,
        carbon_score=carbon_score,
        grid_intensity=s["grid"],
        scrap_factor=round(s["scrap_factor"], 3),
        estimated_co2_kg=total_co2,
        rm_ordered_at_plant=s["rm_ordered"],
        stock_available_qty=s["stock_cover"],
        delivery_name=delivery_name,
        delivery_dist_km=round(dist_km, 0),
        is_bom_pair=s.get("is_bom_pair", False),
        joining_time_days=joining_days,
        joining_note=s.get("joining_note"),
        inter_plant_days=inter_p_days,
        inter_plant_cost_eur=inter_eur,
        inter_plant_co2_kg=inter_co2,
    )


# ---------------------------------------------------------------------------
# Grid intensity lookup (production context, kept for reference)
# ---------------------------------------------------------------------------

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
