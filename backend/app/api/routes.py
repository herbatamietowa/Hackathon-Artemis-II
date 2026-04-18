"""FastAPI route handlers."""
from __future__ import annotations
import logging
import re
from datetime import date

import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    FactoryListResponse,
    GCIRequest,
    GCIResponse,
    GCIRouteModel,
    MaterialListResponse,
    ScenarioListResponse,
    SourcingRequest,
    SourcingResponse,
    WCLoadModel,
)
from ..config import DATA_PATH, SCENARIOS
from ..engine.capacity import compute_capacity_plan

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


class TimelinePoint(BaseModel):
    period: str
    capacity_utilization: float
    available_hours: float
    demanded_hours: float
    bottleneck_detected: bool


class TimelineResponse(BaseModel):
    factory: str
    scenario: str
    points: list[TimelinePoint]


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/scenarios", response_model=ScenarioListResponse)
def list_scenarios() -> ScenarioListResponse:
    return ScenarioListResponse(scenarios=SCENARIOS)


@router.get("/factories", response_model=FactoryListResponse)
def list_factories() -> FactoryListResponse:
    try:
        df = pd.read_excel(DATA_PATH, sheet_name="2_1 Work Center Capacity Weekly", usecols=["Work center code"])
        codes = df["Work center code"].dropna().astype(str)
        factories = sorted({m.group(1) for wc in codes for m in [re.search(r"(NW\d+)", wc)] if m})
        if factories:
            return FactoryListResponse(factories=factories)
    except Exception as exc:
        logger.warning("Could not derive factory list from data: %s", exc)
    return FactoryListResponse(factories=["NW01", "NW03"])


@router.get("/timeline", response_model=TimelineResponse)
def timeline(
    factory: str = "NW01",
    scenario: str = "probability_weighted",
    months: int = 36,
) -> TimelineResponse:
    """Return capacity utilization for up to 36 months."""
    if scenario not in SCENARIOS:
        raise HTTPException(status_code=400, detail=f"Unknown scenario: {scenario}")
    months = min(max(months, 1), 36)

    today = date.today()
    periods: list[str] = []
    m, y = today.month, today.year
    for _ in range(months):
        m += 1
        if m > 12:
            m, y = 1, y + 1
        periods.append(f"{m} {y}")

    points: list[TimelinePoint] = []
    for period in periods:
        try:
            r = compute_capacity_plan(factory, scenario, period, DATA_PATH)
            points.append(TimelinePoint(
                period=period,
                capacity_utilization=r.capacity_utilization,
                available_hours=r.available_hours,
                demanded_hours=r.demanded_hours,
                bottleneck_detected=r.bottleneck_detected,
            ))
        except Exception as exc:
            logger.warning("Timeline skipping period %s: %s", period, exc)

    return TimelineResponse(factory=factory, scenario=scenario, points=points)


@router.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    if req.scenario not in SCENARIOS:
        raise HTTPException(status_code=400, detail=f"Unknown scenario: {req.scenario}. Valid: {SCENARIOS}")

    period = req.period
    if period is None:
        today = date.today()
        month = today.month % 12 + 1
        year = today.year + (1 if today.month == 12 else 0)
        period = f"{month} {year}"

    try:
        from ..agents.agent1_capacity import run_agent1
        from ..agents.agent2_sustainability import run_agent2

        engine_result = compute_capacity_plan(req.factory, req.scenario, period, DATA_PATH)
        agent1_result = run_agent1(engine_result)
        agent2_verdict = run_agent2(agent1_result)

        return AnalyzeResponse(
            agent1_result=agent1_result,
            agent2_verdict=agent2_verdict,
            per_work_center=[
                WCLoadModel(
                    wc=wc.wc,
                    utilization=wc.utilization,
                    available=wc.available,
                    demanded=wc.demanded,
                )
                for wc in engine_result.per_work_center
            ],
        )
    except Exception as exc:
        logger.exception("analyze endpoint error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/sourcing", response_model=SourcingResponse)
def sourcing(req: SourcingRequest) -> SourcingResponse:
    if req.scenario not in SCENARIOS:
        raise HTTPException(status_code=400, detail=f"Unknown scenario: {req.scenario}")
    try:
        from ..engine.sourcing import compute_sourcing_plan
        return compute_sourcing_plan(req.factory, req.scenario, req.period, DATA_PATH)
    except Exception as exc:
        logger.exception("sourcing endpoint error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/materials", response_model=MaterialListResponse)
def list_materials() -> MaterialListResponse:
    """Return all active materials that have multi-plant tooling (GCI candidates)."""
    try:
        df26 = pd.read_excel(DATA_PATH, sheet_name="2_6 Tool_material nr master")
        df23 = pd.read_excel(DATA_PATH, sheet_name="2_3 SAP MasterData")
        active = df26[df26["Material Status"] == "Active"]
        multi = active.groupby("Sap code")["Plant"].nunique()
        multi_codes = multi[multi > 1].index.tolist()
        name_map = df23.set_index("Sap code")["Description"].to_dict()
        materials = [
            {"code": code, "name": name_map.get(code, code)}
            for code in sorted(multi_codes)
        ]
        return MaterialListResponse(materials=materials)
    except Exception as exc:
        logger.warning("Could not load materials: %s", exc)
        return MaterialListResponse(materials=[])


@router.post("/gci", response_model=GCIResponse)
def gci(req: GCIRequest) -> GCIResponse:
    try:
        from ..engine.gci import compute_gci
        from ..agents.agent2_sustainability import run_agent2_gci

        result = compute_gci(
            material_code=req.material_code,
            rdd_str=req.rdd,
            alpha=req.alpha,
            data_path=DATA_PATH,
            forced_mode=req.forced_mode,
        )

        ai_insight = run_agent2_gci(result.ai_context)

        routes = [
            GCIRouteModel(
                plant=r.plant,
                plant_name=r.plant_name,
                region=r.region,
                mode=r.mode,
                gci=round(r.gci, 4),
                cost_score=round(r.cost_score, 4),
                carbon_score=round(r.carbon_score, 4),
                raw_cost_eur=round(r.raw_cost_eur, 2),
                raw_carbon=round(r.raw_carbon, 4),
                grid_intensity=r.grid_intensity,
                scrap_factor=round(r.scrap_factor, 4),
                dominant_size=r.dominant_size,
                arrival_date=r.arrival_date.isoformat(),
                meets_rdd=r.meets_rdd,
                days_margin=r.days_margin,
                transport_lt_days=r.transport_lt_days,
                carbon_penalty=r.carbon_penalty,
            )
            for r in result.routes
        ]

        return GCIResponse(
            material_code=result.material_code,
            material_name=result.material_name,
            rdd=req.rdd,
            slider_alpha=req.alpha,
            forced_mode=req.forced_mode,
            routes=routes,
            recommended_plant=result.recommended.plant if result.recommended else None,
            green_baseline=round(result.green_baseline, 4),
            green_potential_saving_pct=round(result.green_potential_saving_pct, 1),
            ai_insight=ai_insight,
        )
    except Exception as exc:
        logger.exception("GCI endpoint error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))
