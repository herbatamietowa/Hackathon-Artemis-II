import os
from pathlib import Path

# Agent 1 — Groq (free, LPU-accelerated, ~1-2s inference)
GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
GROQ_BASE_URL: str = "https://api.groq.com/openai/v1"
AGENT1_MODEL: str = "llama-3.3-70b-versatile"  # best tool-calling model on Groq

# Agent 2 — Gemini (free tier, strong reasoning)
GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
GEMINI_BASE_URL: str = "https://generativelanguage.googleapis.com/v1beta/openai/"
AGENT2_MODEL: str = "gemini-2.0-flash"
AGENT2_FALLBACK_MODEL: str = "gemini-1.5-flash"

_PROJECT_ROOT = Path(__file__).parents[2]  # backend/app/config.py → project root
DATA_PATH: Path = Path(os.getenv("DATA_PATH", str(_PROJECT_ROOT / "data" / "hackathon_dataset.xlsx")))

BOTTLENECK_THRESHOLD: float = 0.90
HIGH_PROB_THRESHOLD: float = 75.0   # min probability (%) for high_prob_only scenario

SCENARIOS: list[str] = ["100_pct", "probability_weighted", "high_prob_only"]
