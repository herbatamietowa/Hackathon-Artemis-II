"""Project Architect engine — three optimisation scenario paths for a production order.

Eco-Warrior  (alpha=0.0): minimise carbon emissions
Budget Master (alpha=1.0): minimise production cost
Speed Demon  (alpha=0.5, Express mode): minimise delivery time
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass
class ProjectPath:
    name: str           # "Eco-Warrior" | "Budget Master" | "Speed Demon"
    icon: str
    plant: str
    plant_name: str
    region: str
    mode: str
    cost_eur: float
    delivery_date: str  # ISO date
    meets_deadline: bool
    days_margin: int
    grid_intensity: float
    carbon_score: float
    transport_lt_days: int
    gci_score: float


@dataclass
class ProjectArchitectResult:
    material_code: str
    material_name: str
    quantity: float
    deadline: str | None
    paths: list[ProjectPath]


_PATHS_CONFIG = [
    ("Eco-Warrior",   "\U0001f33f", 0.0, None),
    ("Budget Master", "\U0001f4b0", 1.0, None),
    ("Speed Demon",   "\u26a1",     0.5, "Express"),
]


def compute_project_architect(
    material_code: str,
    quantity: float,
    deadline: str | None,
    data_path: Path,
) -> ProjectArchitectResult:
    """Return 3 scenario paths for a given production order."""
    from .gci import compute_gci

    paths: list[ProjectPath] = []
    mat_name = material_code

    for name, icon, alpha, forced_mode in _PATHS_CONFIG:
        try:
            result = compute_gci(
                material_code=material_code,
                rdd_str=deadline,
                alpha=alpha,
                data_path=data_path,
                forced_mode=forced_mode,
            )
        except Exception:
            continue

        mat_name = result.material_name
        rec = result.recommended
        if rec is None:
            continue

        paths.append(ProjectPath(
            name=name,
            icon=icon,
            plant=rec.plant,
            plant_name=rec.plant_name,
            region=rec.region,
            mode=rec.mode,
            cost_eur=round(rec.raw_cost_eur * quantity, 2),
            delivery_date=rec.arrival_date.isoformat(),
            meets_deadline=rec.meets_rdd,
            days_margin=rec.days_margin,
            grid_intensity=rec.grid_intensity,
            carbon_score=round(rec.carbon_score, 4),
            transport_lt_days=rec.transport_lt_days,
            gci_score=round(rec.gci, 4),
        ))

    return ProjectArchitectResult(
        material_code=material_code,
        material_name=mat_name,
        quantity=quantity,
        deadline=deadline,
        paths=paths,
    )




