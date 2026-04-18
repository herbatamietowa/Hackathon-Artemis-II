"""Bottleneck detection at work-center level."""
from __future__ import annotations
import pandas as pd
from ..config import BOTTLENECK_THRESHOLD


def detect_bottlenecks(
    wc_utilization: pd.DataFrame,
    threshold: float = BOTTLENECK_THRESHOLD,
) -> list[str]:
    """Return list of WC codes where utilization >= threshold.

    wc_utilization must have columns: [wc_code, utilization]
    """
    over = wc_utilization[wc_utilization["utilization"] >= threshold]
    return over["wc_code"].tolist()
