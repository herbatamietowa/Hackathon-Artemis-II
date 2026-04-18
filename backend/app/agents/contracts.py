"""Agent handoff contract validation.

NOTE: retry on invariant failure makes no sense here — numeric fields are
copied verbatim from the deterministic engine. Any violation means the LLM
mutated a number it should not have touched → trigger fallback directly.
"""
from __future__ import annotations
import logging

logger = logging.getLogger(__name__)

# Populated at app startup from loader (distinct WC codes in sheet 2_1).
# Must be set before validate_agent1_payload is called.
KNOWN_WC_CODES: set[str] = set()


class ContractError(ValueError):
    pass


def validate_agent1_payload(data: dict) -> None:
    """Raise ContractError if Agent 1 output violates invariants.

    On violation, caller should fall back to deterministic Agent2Verdict
    without retrying (inputs are deterministic; retry changes nothing).
    """
    required = {
        "scenario", "factory", "period",
        "capacity_utilization", "available_hours", "demanded_hours",
        "bottleneck_detected", "bottleneck_work_centers",
        "oee_applied", "excluded_rows", "flag_count", "reconstructed_rows",
        "reasoning",
    }
    missing = required - set(data.keys())
    if missing:
        raise ContractError(f"Missing fields: {missing}")

    util = data["capacity_utilization"]
    if not isinstance(util, (int, float)):
        raise ContractError(f"capacity_utilization must be numeric, got {type(util)}")
    if util < 0:
        raise ContractError(f"capacity_utilization cannot be negative: {util}")
    # No upper bound — overloaded factories legitimately exceed 1.0 (even 3.0+)
    if util > 2.0:
        logger.warning(
            "capacity_utilization=%.2f > 2.0 for %s/%s — check demand scaling",
            util, data.get("factory"), data.get("scenario"),
        )

    oee = data["oee_applied"]
    if not (0.0 <= oee <= 1.0):
        raise ContractError(f"oee_applied must be in [0, 1], got {oee}")

    detected = data["bottleneck_detected"]
    wcs = data["bottleneck_work_centers"]
    if not isinstance(wcs, list):
        raise ContractError("bottleneck_work_centers must be a list")
    if detected != (len(wcs) > 0):
        raise ContractError(
            f"bottleneck_detected={detected} inconsistent with "
            f"bottleneck_work_centers={wcs}"
        )

    if KNOWN_WC_CODES:
        unknown = [w for w in wcs if w not in KNOWN_WC_CODES]
        if unknown:
            raise ContractError(f"Unknown WC codes in bottleneck list: {unknown}")

    for count_field in ("excluded_rows", "flag_count", "reconstructed_rows"):
        if data[count_field] < 0:
            raise ContractError(f"{count_field} cannot be negative")
