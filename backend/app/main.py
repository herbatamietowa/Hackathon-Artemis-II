"""FastAPI application entry point."""
from __future__ import annotations
import logging
from pathlib import Path

# Load .env BEFORE importing config (config reads os.getenv at import time)
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.routes import router
from .agents.contracts import KNOWN_WC_CODES
from .config import DATA_PATH
from .data.loader import load_workbook

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Predictive Manufacturing API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.on_event("startup")
async def startup() -> None:
    """Warm the workbook cache and populate KNOWN_WC_CODES."""
    try:
        wb = load_workbook(DATA_PATH)
        sheets = {k.strip(): v for k, v in wb.items()}
        wc_sheet = next((v for k, v in sheets.items() if "2_1" in k), None)
        if wc_sheet is not None and "Work center code" in wc_sheet.columns:
            codes = wc_sheet["Work center code"].dropna().astype(str).unique().tolist()
            KNOWN_WC_CODES.update(codes)
            logger.info("Loaded %d known WC codes", len(KNOWN_WC_CODES))
        logger.info("Workbook cache warmed from %s", DATA_PATH)
    except FileNotFoundError:
        logger.warning("Dataset not found at %s — engine calls will fail until DATA_PATH is set", DATA_PATH)
