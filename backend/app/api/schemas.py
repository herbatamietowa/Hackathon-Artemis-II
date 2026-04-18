from __future__ import annotations
from dataclasses import dataclass, field, asdict
from typing import Optional
from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Engine dataclass — single source of truth for ALL numeric fields
# ---------------------------------------------------------------------------

@dataclass
class WCLoad:
    wc: str
    utilization: float
    available: float
    demanded: float


@dataclass
class CapacityPlanResult:
    # Aggregate fields — Agent 1 copies these verbatim (no LLM editing)
    scenario: str
    factory: str
    period: str
    capacity_utilization: float
    available_hours: float
    demanded_hours: float
    bottleneck_detected: bool
    bottleneck_work_centers: list[str]
    oee_applied: float
    excluded_rows: int
    flag_count: int
    reconstructed_rows: int
    # Per-WC detail — goes to AnalyzeResponse directly, NOT to Agent 2
    per_work_center: list[WCLoad] = field(default_factory=list)

    def to_agent1_dict(self) -> dict:
        """Return only the aggregate fields Agent 1 emits (no per_work_center)."""
        return {
            "scenario": self.scenario,
            "factory": self.factory,
            "period": self.period,
            "capacity_utilization": self.capacity_utilization,
            "available_hours": self.available_hours,
            "demanded_hours": self.demanded_hours,
            "bottleneck_detected": self.bottleneck_detected,
            "bottleneck_work_centers": self.bottleneck_work_centers,
            "oee_applied": self.oee_applied,
            "excluded_rows": self.excluded_rows,
            "flag_count": self.flag_count,
            "reconstructed_rows": self.reconstructed_rows,
        }


# ---------------------------------------------------------------------------
# Pydantic models — API request / response shapes
# ---------------------------------------------------------------------------

class AnalyzeRequest(BaseModel):
    factory: str
    scenario: str
    period: Optional[str] = None  # "2026-05"; defaults to next month if omitted
    user_argument: Optional[str] = None


class WCLoadModel(BaseModel):
    wc: str
    utilization: float
    available: float
    demanded: float


class Agent1Result(BaseModel):
    scenario: str
    factory: str
    period: str
    capacity_utilization: float
    available_hours: float
    demanded_hours: float
    bottleneck_detected: bool
    bottleneck_work_centers: list[str]
    oee_applied: float
    excluded_rows: int
    flag_count: int
    reconstructed_rows: int
    reasoning: str
    fallback: bool = False


class Agent2Verdict(BaseModel):
    verdict: str                          # "APPROVED" | "REOPEN DEBATE"
    strategy: str
    sustainability_recommendation: str
    challenge_summary: Optional[str] = None
    fallback: bool = False

class AgentTurn(BaseModel):
    agent_name: str  # "Cost Specialist" | "Sustainability Director" | "User"
    message: str
    verdict: Optional[str] = None


class ReallocationSuggestion(BaseModel):
    available_headroom_hours: float
    overflow_hours: float
    can_absorb: bool
    suggestion: str
    # Logistics & cost detail
    material_compatibility_pct: float   # % of source factory materials with active tooling at NW03
    compatible_materials: int
    total_materials: int
    cost_delta_pct: float               # median % cost change (positive = NW03 costs more)
    transport_lt_delta_days: float      # extra transport days vs current factory
    source_grid_intensity: float        # gCO₂/kWh at source factory
    target_grid_intensity: float        # gCO₂/kWh at NW03
    carbon_delta_pct: float             # positive = NW03 emits more


class AnalyzeResponse(BaseModel):
    agent1_result: Agent1Result
    agent2_verdict: Agent2Verdict
    per_work_center: list[WCLoadModel]
    debate_history: list[AgentTurn] = []
    status: str = "CONSENSUS"   # "CONSENSUS" | "CONTESTED" | "USER_OVERRIDE"
    reallocation: Optional[ReallocationSuggestion] = None


class ScenarioListResponse(BaseModel):
    scenarios: list[str]


class FactoryListResponse(BaseModel):
    factories: list[str]


# ---------------------------------------------------------------------------
# Sourcing schemas
# ---------------------------------------------------------------------------

class SourcingRequest(BaseModel):
    factory: str
    scenario: str
    period: Optional[str] = None


class SourcingMaterial(BaseModel):
    raw_material_code: str
    raw_material_name: str
    unit: str
    total_needed: float          # kg/units needed for gap demand
    lead_time_days: int          # from BOM Production LT in Weeks × 7
    order_by_date: str           # ISO date YYYY-MM-DD
    days_until_order: int        # negative = already overdue
    status: str                  # "on_track" | "order_soon" | "urgent" | "overdue"
    finished_goods: list[str]    # FG material codes that drive this RM demand


class SourcingResponse(BaseModel):
    factory: str
    scenario: str
    period: str
    materials: list[SourcingMaterial]
    on_track_count: int
    order_soon_count: int
    urgent_count: int
    overdue_count: int


# ---------------------------------------------------------------------------
# GCI schemas
# ---------------------------------------------------------------------------

class GCIRequest(BaseModel):
    material_code: str
    rdd: Optional[str] = None           # ISO date, e.g. "2026-09-01"
    alpha: float = 0.5                  # 0 = pure sustainability, 1 = pure cost
    forced_mode: Optional[str] = None   # "Economy" | "Standard" | "Express" | None


class GCIRouteModel(BaseModel):
    plant: str
    plant_name: str
    region: str
    mode: str
    gci: float
    cost_score: float
    carbon_score: float
    raw_cost_eur: float
    raw_carbon: float
    grid_intensity: float
    scrap_factor: float
    dominant_size: str
    arrival_date: str       # ISO date
    meets_rdd: bool
    days_margin: int
    transport_lt_days: int
    carbon_penalty: bool


class GCIResponse(BaseModel):
    material_code: str
    material_name: str
    rdd: Optional[str]
    slider_alpha: float
    forced_mode: Optional[str]
    routes: list[GCIRouteModel]
    recommended_plant: Optional[str]
    green_baseline: float
    green_potential_saving_pct: float
    ai_insight: str


class MaterialListResponse(BaseModel):
    materials: list[dict]  # [{code, name}]


# ---------------------------------------------------------------------------
# Disaster simulation schemas
# ---------------------------------------------------------------------------

class DisasterRequest(BaseModel):
    offline_factory: str
    scenario: str
    period: Optional[str] = None
    duration_months: int = 1   # 1-12


class DisasterAlternative(BaseModel):
    plant: str
    plant_name: str
    materials_coverable: int
    total_offline_materials: int
    coverage_pct: float              # % of offline materials this plant can make
    current_utilization: float
    projected_utilization: float     # if all displaced demand routed here
    capacity_headroom_hours: float
    overloaded: bool                 # projected_utilization > 1.0
    # Logistics & cost detail
    cost_delta_pct: float            # median % cost change vs offline factory (compatible mats only)
    transport_lt_delta_days: float   # extra transport days vs offline factory
    grid_intensity: float            # gCO2/kWh at this plant
    carbon_delta_pct: float          # vs offline factory (positive = higher emissions)


class DisasterResult(BaseModel):
    offline_factory: str
    scenario: str
    period: str
    duration_months: int
    displaced_hours: float           # total demand that needs rerouting
    alternatives: list[DisasterAlternative]
    network_coverage_pct: float      # % of demand the network can absorb
    unabsorbable_hours: float
    ai_insight: str


# ---------------------------------------------------------------------------
# Project Architect schemas
# ---------------------------------------------------------------------------

class ScenarioPathModel(BaseModel):
    name: str
    icon: str
    plant: str
    plant_name: str
    region: str
    mode: str
    cost_eur: float
    delivery_date: str
    meets_deadline: bool
    days_margin: int
    grid_intensity: float
    carbon_score: float
    transport_lt_days: int
    gci_score: float


class ProjectArchitectRequest(BaseModel):
    material_code: str
    quantity: float = 1.0
    deadline: Optional[str] = None


class ProjectArchitectResponse(BaseModel):
    material_code: str
    material_name: str
    quantity: float
    deadline: Optional[str]
    paths: list[ScenarioPathModel]


class ConfirmProjectRequest(BaseModel):
    material_code: str
    material_name: str
    quantity: float
    deadline: Optional[str] = None
    chosen_path: str
    chosen_plant: str
    cost_eur: float
    delivery_date: str


# ---------------------------------------------------------------------------
# Project Simulation schemas (BOM explosion)
# ---------------------------------------------------------------------------

class RawMaterialStatusModel(BaseModel):
    code: str
    name: str
    available_qty: float
    needed_qty: float
    sufficient: bool
    unit: str


class SimulationPathModel(BaseModel):
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
    carbon_score: float
    grid_intensity: float
    scrap_factor: float


class ProjectSimulationRequest(BaseModel):
    plate_code: str
    quantity: int = 1


class ProjectSimulationResponse(BaseModel):
    plate_code: str
    plate_name: str
    gasket_code: Optional[str]
    gasket_name: str
    quantity: int
    feasible_plants: list[str]
    raw_materials: list[RawMaterialStatusModel]
    paths: list[SimulationPathModel]
    warning: Optional[str]


class ApproveProjectRequest(BaseModel):
    plate_code: str
    plate_name: str
    gasket_code: Optional[str] = None
    quantity: int
    path_name: str
    plant: str
    mode: str
    total_cost_eur: float
    delivery_days: int
    carbon_score: float


# ---------------------------------------------------------------------------
# Raw material ordering schemas
# ---------------------------------------------------------------------------

class RawMaterialItem(BaseModel):
    code: str
    name: str
    unit: str
    stock_qty: float


class RawMaterialListResponse(BaseModel):
    materials: list[RawMaterialItem]


class RawMaterialOrderRequest(BaseModel):
    material_code: str
    material_name: str
    unit: str
    quantity: float
    factory: str
    deadline: Optional[str] = None
