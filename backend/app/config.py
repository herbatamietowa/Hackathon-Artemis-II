import os
from pathlib import Path

ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")

DATA_PATH: Path = Path(os.getenv("DATA_PATH", "/data/hackathon_dataset.xlsx"))

AGENT1_MODEL: str = "claude-haiku-4-5-20251001"
AGENT2_MODEL: str = "o4-mini"
AGENT2_FALLBACK_MODEL: str = "o3"

BOTTLENECK_THRESHOLD: float = 0.90
HIGH_PROB_THRESHOLD: float = 0.75   # min probability (%) for high_prob_only scenario

SCENARIOS: list[str] = ["100_pct", "probability_weighted", "high_prob_only"]
