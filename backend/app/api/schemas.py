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
    verdict: str                          # "APPROVED" | "CORRECTED"
    strategy: str
    sustainability_recommendation: str
    fallback: bool = False


class AnalyzeResponse(BaseModel):
    agent1_result: Agent1Result
    agent2_verdict: Agent2Verdict
    per_work_center: list[WCLoadModel]


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
