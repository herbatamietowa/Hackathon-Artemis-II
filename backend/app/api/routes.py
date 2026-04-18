"""FastAPI route handlers."""
from __future__ import annotations
import logging
from datetime import date

from fastapi import APIRouter, HTTPException

from .schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    FactoryListResponse,
    ScenarioListResponse,
    SourcingRequest,
    SourcingResponse,
    WCLoadModel,
)
from ..config import DATA_PATH, SCENARIOS
from ..data.loader import load_workbook
from ..engine.capacity import compute_capacity_plan

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/scenarios", response_model=ScenarioListResponse)
def list_scenarios() -> ScenarioListResponse:
    return ScenarioListResponse(scenarios=SCENARIOS)


@router.get("/factories", response_model=FactoryListResponse)
def list_factories() -> FactoryListResponse:
    try:
        wb = load_workbook(DATA_PATH)
        sheets = {k.strip(): v for k, v in wb.items()}
        wc_sheet = next((v for k, v in sheets.items() if "2_1" in k), None)
        if wc_sheet is not None and "Plant" in wc_sheet.columns:
            factories = sorted(wc_sheet["Plant"].dropna().astype(str).unique().tolist())
            return FactoryListResponse(factories=factories)
    except Exception as exc:
        logger.warning("Could not derive factory list from data: %s", exc)
    return FactoryListResponse(factories=["NW01", "NW03"])


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
