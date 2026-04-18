# Work Plan: Hackathon Artemis II — Predictive Manufacturing AI Agent System

- Plan ID: hackathon-artemis-ii
- Source spec: `.omc/specs/deep-interview-hackathon-artemis.md`
- Horizon: 24 hours, 4-5 person team
- Status: REVISED v2 — Architect + Critic feedback incorporated
- Generated: 2026-04-18

---

## 1. RALPLAN-DR Summary

### Principles (guiding decisions)

1. **Depth over breadth.** Three diverging scenario curves for Factory NW01 are the win condition. Sourcing is stretch only.
2. **Agent isolation is a hard contract.** Agent 1 touches data, Agent 2 touches JSON. Violating this ruins the demo narrative and the judge criterion.
3. **Deterministic core, LLM shell.** Capacity math runs in pure pandas and is callable/testable without any API key. Agents wrap a deterministic function — they do not *compute* capacity themselves.
4. **Monthly primary, weekly only where native.** Source granularity is respected: sheet 2_1 stays weekly internally, aggregated to monthly via sheet 2_4 working-day weights.
5. **Observable missing data.** Excluded and flagged row counts are first-class fields in Agent 1's output and surface on the UI. No silent drops.

### Decision Drivers (top 3 constraints shaping architecture)

1. **24h clock with 4-5 parallel tracks.** Any design that serializes tracks kills the project. Backend, data pipeline, and UI must mock-contract early so they unblock each other.
2. **Two-SDK agent split (Anthropic + OpenAI).** Doubles credential, rate-limit, and error-path surface area. Demands a narrow, typed JSON contract between agents and per-agent adapter modules.
3. **No ground truth for accuracy.** Success = scenario robustness. The pipeline *must* produce three visibly diverging utilization curves; if they collapse, the demo fails regardless of code quality.

### Viable Options

#### Option A — Deterministic engine with thin LLM wrappers (RECOMMENDED)

The capacity calculation is a pure Python function (`compute_capacity_plan(factory, scenario) -> dict`). Agent 1 is prompted to *call* this function via a single Python tool and return the JSON. Agent 2 consumes Agent 1's JSON. All three scenarios can be run without any LLM call for dev/testing.

- Pros: Testable without API keys; scenario divergence guaranteed by math not prompts; cheap to re-run; judges can see the logic; Agent 1 tool-use story is clean.
- Cons: Agent 1 is a thin wrapper (accepted, and framed as a feature: "agent provides narrative reasoning and schema enforcement, engine provides math").

#### Option B — LLM-first computation (Agent 1 writes pandas code live via tool use)

Agent 1 receives raw DataFrames and an open Python executor, invents the join logic per scenario from scratch.

- Pros: Showcases tool-use; flexible to prompt changes.
- Cons: Non-deterministic math; rate-limit exposure during debug; scenario divergence depends on prompt fidelity; QA impossible in 24h; high risk of one scenario silently collapsing mid-demo.

#### Option C — Precompute all scenarios at container startup, agents serve cached JSON

Batch job on `docker compose up` computes all 15 plants × 3 scenarios × 36 months and stores to SQLite/parquet. Agents read cache only.

- Pros: Demo is instant; no live API on scenario switch.
- Cons: Breaks the "Agent 1 uses Python tool" judging narrative; requires an ETL stage that eats hours 0-8; brittle if data is re-uploaded.

### Chosen: Option A

Option A threads the judges' criteria (Agent 1 uses Python tools, Agent 2 reasons over JSON) while keeping the math deterministic and testable. Option B is rejected because scenario divergence becomes a prompt-engineering lottery on a 24h clock. Option C is rejected because it degrades the Agent 1 tool-use story and front-loads an ETL stage we cannot afford before the Data track has even explored the Excel file.

---

## 2. Architecture

### Repository layout (target)

```
Hackathon-Artemis-II/
  data/
    hackathon_dataset.xlsx                 (exists)
    Data_Dictionary_overview.xlsx          (exists)
  backend/
    app/
      main.py                              FastAPI app + CORS + router include
      config.py                            env loading (ANTHROPIC_API_KEY, OPENAI_API_KEY, DATA_PATH)
      api/
        routes.py                          /api/analyze, /api/scenarios, /api/factories, /api/health
        schemas.py                         pydantic models: AnalyzeRequest, Agent1Result, Agent2Verdict, AnalyzeResponse
      data/
        loader.py                          load_workbook() - reads all sheets once, caches
        joins.py                           build_master_frame() - executes documented join sequence
        missing.py                         three_tier_classify() - impute/flag/drop
        calendar.py                        weekly_to_monthly() using sheet 2_4 working-day weights
      engine/
        scenarios.py                       SCENARIOS dict: 100_pct / probability_weighted / high_prob_only
        capacity.py                        compute_capacity_plan(factory, scenario, period?) -> dict
        bottleneck.py                      detect_bottlenecks(wc_utilization, threshold=0.9)
        reallocation.py                    check_nw03_headroom(period, overflow_hours) -> dict
      agents/
        agent1_capacity.py                 Anthropic SDK, claude-haiku-4-5-20251001, Python tool
        agent2_sustainability.py           OpenAI SDK, o3 or o4-mini, JSON-only input
        contracts.py                       validate_agent1_payload + invariant guards (see Data-Pipeline Decisions)
        prompts/
          agent1_system.md
          agent2_system.md
    tests/
      test_joins.py                        golden-row assertions on master frame
      test_capacity.py                     scenario divergence test (100_pct > pw > high_prob)
      test_missing.py                      three-tier classification cases
      test_contracts.py                    Agent 1 JSON schema round-trip + invariant positive fixture
      test_agent1_numeric_guard.py         mock Anthropic to return mutated numerics → assert fallback triggers
      test_agent2_isolation.py             mock pd.read_excel → assert call_count==0 inside agent2 call
      fixtures/
        agent1_example.json                golden Agent1Result (ALL numeric fields present, shapes CapacityPlanResult)
    requirements.txt                       fastapi, uvicorn, pandas, openpyxl, anthropic, openai, pydantic
    Dockerfile
  frontend/
    src/
      App.tsx                              router + layout
      api/client.ts                        fetch wrappers for /api/*
      components/
        ScenarioSelector.tsx               dropdown (3 scenarios)
        FactorySelector.tsx                dropdown (populated from /api/factories)
        CapacityChart.tsx                  recharts bar: WC × utilization %, color by threshold
        BottleneckAlert.tsx                renders when bottleneck_detected
        Agent2Panel.tsx                    verdict badge + strategy + sustainability recommendation
        DataQualityBadge.tsx               excluded_rows + flag_count
        LoadingState.tsx
      types.ts                             mirrors backend pydantic schemas
      styles.css
    package.json                           react, vite, recharts, typescript
    Dockerfile
    nginx.conf                             /api -> backend:8000 proxy
  docker-compose.yml                       backend + frontend services, mounts ./data
  .env.example                             ANTHROPIC_API_KEY, OPENAI_API_KEY
  README.md                                run instructions + demo script
  .omc/plans/hackathon-artemis-ii.md       this plan
```

### CapacityPlanResult — single source of truth (Architect Rev #1)

`compute_capacity_plan()` returns ONE `CapacityPlanResult` dataclass carrying both the aggregate fields (which Agent 1 copies verbatim) AND the `per_work_center` list (which goes directly to the API response). This eliminates the dual-data-path divergence risk.

```python
@dataclass
class CapacityPlanResult:
    # --- aggregate (Agent 1 copies verbatim, no LLM editing) ---
    scenario: str
    factory: str
    period: str
    capacity_utilization: float     # demanded_hours / available_hours
    available_hours: float
    demanded_hours: float
    bottleneck_detected: bool       # == (len(bottleneck_work_centers) > 0)  ← invariant
    bottleneck_work_centers: list[str]
    oee_applied: float              # ∈ [0, 1]  ← invariant
    excluded_rows: int
    flag_count: int
    reconstructed_rows: int         # tier-0 Connector reconstructions (surfaced, not silent)
    # --- per-WC detail (goes to AnalyzeResponse.per_work_center, NOT to Agent 2) ---
    per_work_center: list[dict]     # [{wc, utilization, available, demanded}]
```

**Agent 1 numeric-copy guard** (in `agent1_capacity.py`):
```python
tool_result = compute_capacity_plan(factory, scenario, period)
# Claude fills ONLY reasoning; all numeric fields copied verbatim
agent1_json = {**tool_result_as_dict_excluding_per_wc, "reasoning": claude_narrative}
assert agent1_json["capacity_utilization"] == tool_result.capacity_utilization  # guard
# If assert fails → set agent1_json["fallback"] = True, replace reasoning with canned string
```

**Agent 1 fallback** (if Anthropic SDK fails or guard fires):
```python
{"fallback": True, "reasoning": f"[OFFLINE] Capacity utilization: {tool_result.capacity_utilization:.1%}. Bottleneck: {tool_result.bottleneck_detected}.", ...all other fields from tool_result...}
```

---

### Data-Pipeline Decisions (frozen, Architect Rev #2)

These decisions are made at plan time, not implementation time. They prevent flakiness in the divergence test.

| Decision | Choice | Rationale |
|----------|--------|-----------|
| `2_1` measure for `available_hours` | `Available Capacity, hours` row only | Avoid dual-source conflict with 2_5 JAN-DEC columns; one authoritative source |
| Rev no dedup when 2_6 has multiple rows per Connector | `Material Status == 'Active'` → latest Rev no | Matches real ops (Active trumps Phase-out); latest Rev is most current tooling |
| Rev no cross-match in demand vs inventory | Flag the mismatch (add `rev_mismatch: true` column), use Active row anyway | Spec says "non-substitutable" = flag, not drop; demand still counted |
| Connector reconstruction (tier-0, before imputation) | Attempt `f"{plant}_{material_number}"` if Connector is `_` or blank | Recovers rows where join key is reconstructable; count in `reconstructed_rows` |
| Tier-1 imputation source | `2_6.Cycle times Standard Value` via reconstructed Connector | Only impute if reconstruction succeeded |
| Tier-2 flag condition | Reconstruction failed OR WC still null after imputation | Row counted in `flag_count`, included with null WC |
| Tier-3 drop condition | No material code AND no quantity in any month column | Fully empty rows, not countable demand |
| "Known factory set" for WC invariant | Distinct `Work center code` values observed in loaded `2_1` sheet | Dynamic, not hardcoded NW01-NW15 list |

---

### Contract Invariants (`contracts.py`, Architect Rev #3, Critic-revised)

```python
def validate_agent1_payload(data: dict) -> None:
    """Raises ContractError if Agent 1 output violates invariants.
    NOTE: retry makes no sense here — numerics are verbatim from deterministic engine.
    On any violation, caller falls back to canned Agent2Verdict (no retry)."""
    assert isinstance(data["capacity_utilization"], float), "must be float"
    assert data["capacity_utilization"] >= 0, "utilization cannot be negative"
    # No upper bound — valid to exceed 1.0 (overloaded) or even 3.0+ in 100_pct scenario
    # Values > 2.0 logged as WARNING for observability but do NOT trigger fallback
    if data["capacity_utilization"] > 2.0:
        logger.warning("capacity_utilization=%.2f > 2.0 — check demand scaling", data["capacity_utilization"])
    assert data["oee_applied"] >= 0 and data["oee_applied"] <= 1, "OEE must be in [0,1]"
    assert data["bottleneck_detected"] == (len(data["bottleneck_work_centers"]) > 0), "bottleneck flag inconsistent"
    assert all(wc in KNOWN_WC_CODES for wc in data["bottleneck_work_centers"]), "unknown WC code in bottleneck list"
    assert data["excluded_rows"] >= 0 and data["flag_count"] >= 0 and data["reconstructed_rows"] >= 0
    # KNOWN_WC_CODES populated at startup from loader.py (distinct codes in sheet 2_1)
```

---

### Dual-Fallback UI State

When `fallback: true` appears in either or both agent responses, the UI shows:

```
┌─────────────────────────────────────────────────┐
│  ⚠  OFFLINE MODE — live AI agents unavailable  │
│  Results computed by deterministic engine only  │
└─────────────────────────────────────────────────┘
```

Demo talk track (in README): "If you see this banner, both AI agent APIs are temporarily unavailable. The capacity math and chart are still fully deterministic and correct — the agents add reasoning narrative on top of the same engine. This is by design: the engine is the source of truth."

---

### FastAPI route signatures (exact)

```python
# backend/app/api/routes.py
from fastapi import APIRouter, HTTPException
from .schemas import AnalyzeRequest, AnalyzeResponse, ScenarioListResponse, FactoryListResponse

router = APIRouter(prefix="/api")

@router.get("/health")
def health() -> dict: ...

@router.get("/scenarios", response_model=ScenarioListResponse)
def list_scenarios() -> ScenarioListResponse: ...
    # returns: {"scenarios": ["100_pct", "probability_weighted", "high_prob_only"]}

@router.get("/factories", response_model=FactoryListResponse)
def list_factories() -> FactoryListResponse: ...
    # returns: {"factories": ["NW01", "NW02", ..., "NW15"]}

@router.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest) -> AnalyzeResponse: ...
    # req:  {"factory": "NW01", "scenario": "probability_weighted", "period": "2026-05" | null}
    # resp: {"agent1_result": Agent1Result, "agent2_verdict": Agent2Verdict,
    #        "per_work_center": [{"wc":"PRESS_3","utilization":0.94,"available":120,"demanded":113}, ...]}
```

### React component tree (exact)

```
<App>
  <Header/>
  <Controls>
    <FactorySelector/>
    <ScenarioSelector/>
    <RunButton/>
  </Controls>
  <Results>
    {loading && <LoadingState/>}
    {result && <>
      <DataQualityBadge excluded={...} flags={...}/>
      <CapacityChart data={result.per_work_center}/>
      <BottleneckAlert result={result.agent1_result}/>
      <Agent2Panel verdict={result.agent2_verdict}/>
    </>}
  </Results>
</App>
```

---

## 3. Phased Implementation Plan (24-hour clock)

### Hours 0-2: Kickoff + Contracts (ALL tracks, parallel)

**First 15 minutes (before anything else):** Run API key smoke test.
```bash
python -c "
import anthropic, openai
r = anthropic.Anthropic().messages.create(model='claude-haiku-4-5-20251001', max_tokens=10, messages=[{'role':'user','content':'ping'}])
print('Anthropic OK:', r.content[0].text)
r2 = openai.OpenAI().chat.completions.create(model='o4-mini', messages=[{'role':'user','content':'ping'}], max_completion_tokens=10)
print('OpenAI OK:', r2.choices[0].message.content)
"
```
If either fails: resolve before proceeding. A model-string typo found now costs 15 minutes; found at hour 20 costs the demo.

- Create repo skeleton exactly as layout above (empty files + stubs).
- Write `backend/app/api/schemas.py` + `agents/contracts.py` first — these are the inter-track contract.
- Write `backend/tests/fixtures/agent1_example.json` matching `CapacityPlanResult` shape (all numeric fields + `per_work_center` + `reconstructed_rows`). Every track codes against this fixture until hour 8.
- `docker-compose.yml` skeleton (backend on 8000, frontend on 5173/80, data volume mounted).

**Agent 2 + API track (hours 2-8) absorbs Architect revisions:** `CapacityPlanResult` dataclass, `contracts.py` invariants, `test_agent2_isolation.py`, `test_agent1_numeric_guard.py` — all fit within this track's scope, no schedule impact.

Acceptance (hour 2):
- Both API smoke tests pass (Anthropic + OpenAI models confirmed reachable).
- `docker compose up` starts both services; frontend shows "hello" page; `GET /api/health` returns 200.
- `schemas.py` defines `Agent1Result` (with `reconstructed_rows` field) and `Agent2Verdict` pydantic models and all tracks agree.
- Fixture file exists, matches `CapacityPlanResult` shape, frontend renders it end-to-end via stub.

### Hours 2-8: Data Layer + Deterministic Engine (Track: Data/Agent 1, 2 people)

Files: `backend/app/data/loader.py`, `joins.py`, `missing.py`, `calendar.py`, `backend/app/engine/scenarios.py`, `capacity.py`, `bottleneck.py`, `reallocation.py`.

Work items:
1. `loader.py`: `load_workbook(path) -> dict[str, DataFrame]` using `pd.read_excel(sheet_name=None)`. LRU-cached. Normalize column names.
2. `joins.py`: implement the documented join sequence:
   - `1_1`/`1_2`.Connector -> `2_6`.Connector (cycle time, WC, tool)
   - `1_3`.Project_name -> `1_1`/`1_2`.Project_name (probability)
   - `2_6`.Plant+WC -> `2_5` (OEE)
   - `2_1`.WC -> aggregate monthly via `2_4`
   - Output: `master_frame` (one row per material-project-month) + `capacity_frame` (one row per WC-month).
3. `missing.py`: three-tier classification; attach `_status` column ∈ {ok, imputed, flagged, dropped}; `Rev no` mismatches flagged.
4. `calendar.py`: `weekly_to_monthly(weekly_df, calendar_df)` using working-day counts from sheet 2_4.
5. `scenarios.py`: three scenario functions that return a `demand_multiplier(project_row)` callable.
6. `capacity.py`: `compute_capacity_plan(factory, scenario, period=None) -> Agent1Result`. Also returns `per_work_center` list for the chart.
7. `bottleneck.py`: WC-level utilization threshold 0.9 by default.
8. `reallocation.py`: given overflow hours at NW01 for a period, compute NW03 free capacity in the same period.

Tests (`backend/tests/`):
- `test_joins.py`: master frame has non-null WC, cycle_time for >80% of rows; flagged+dropped counts reported.
- `test_capacity.py`: for NW01 2026-05, `utilization(100_pct) > utilization(probability_weighted) > utilization(high_prob_only)` — this is the demo win condition, asserted in code.
- `test_missing.py`: synthetic rows exercising each tier.

Acceptance (hour 8):
- `pytest backend/tests/ -k "not agents"` green.
- `python -c "from app.engine.capacity import compute_capacity_plan; print(compute_capacity_plan('NW01','probability_weighted'))"` returns a dict matching `Agent1Result` schema.
- Divergence test passes for at least 3 different months.

### Hours 2-8: FastAPI + OpenAI Scaffold (Track: Agent 2 + API, 1 person)

Files: `backend/app/main.py`, `api/routes.py`, `agents/agent2_sustainability.py`, `agents/contracts.py`, `agents/prompts/agent2_system.md`.

Work items:
1. `main.py`: FastAPI app, CORS for frontend, include router, startup hook that calls `load_workbook()` to warm cache.
2. `routes.py`: implement `/health`, `/scenarios`, `/factories`. `/analyze` initially returns fixture JSON, then swaps to real engine + Agent 2 at hour 8.
3. `agent2_sustainability.py`: OpenAI SDK call, model `o4-mini` (fallback `o3`), system prompt from `agent2_system.md`, input is Agent 1 JSON string only, output parsed into `Agent2Verdict` pydantic model. Retries on JSON parse failure (max 2).
4. `contracts.py`: `validate_agent1_payload(data)` raises before passing to Agent 2.
5. Prompt for Agent 2 encodes the 3 evaluation criteria verbatim from the spec.

Acceptance (hour 8):
- `curl POST /api/analyze -d '{"factory":"NW01","scenario":"100_pct"}'` returns stub response.
- Agent 2 called standalone on fixture JSON returns a valid `Agent2Verdict`.

### Hours 2-8: React UI + Chart (Track: UI, 1 person)

Files: all under `frontend/src/`.

Work items:
1. Vite + React + TypeScript scaffold; recharts installed.
2. `api/client.ts`: typed fetchers for all 3 GET + 1 POST endpoints.
3. `types.ts`: mirror pydantic models by hand (or generate from openapi later).
4. Build all components against the fixture JSON served from `/api/analyze`.
5. `CapacityChart`: bar chart, x=WC code, y=utilization%, color = green<0.8, amber<0.95, red>=0.95.
6. `BottleneckAlert`: red banner when `bottleneck_detected=true` listing `bottleneck_work_centers`.
7. `Agent2Panel`: verdict badge (APPROVED=green, CORRECTED=amber), strategy text, sustainability recommendation.
8. `DataQualityBadge`: small pill showing `flag_count` and `excluded_rows`.
9. nginx.conf proxies `/api` to `backend:8000`.

Acceptance (hour 8):
- Frontend hitting stub backend renders chart, alert, verdict panel, badge from fixture data.
- Scenario selector change triggers a new POST and re-renders.

### Hours 8-14: Agent 1 Wire-Up + Integration (Track: Data/Agent 1 + API)

Files: `backend/app/agents/agent1_capacity.py`, `agents/prompts/agent1_system.md`, update `api/routes.py`.

Work items:
1. `agent1_capacity.py`: Anthropic SDK, model `claude-haiku-4-5-20251001`. Expose one tool `compute_capacity(factory, scenario, period?)` that internally calls `engine.capacity.compute_capacity_plan`. Agent 1's job: call the tool, read the dict, fill in the `reasoning` field narratively, return the full `Agent1Result` JSON.
2. Prompt: "Production Planning Specialist" role; must call the tool; must emit strict JSON matching `Agent1Result`.
3. Wire `/api/analyze` end-to-end: Agent 1 -> validate contract -> Agent 2 -> compose `AnalyzeResponse`.
4. Add `per_work_center` to response (comes from engine directly, not from agent - UI needs WC-level detail the agent JSON doesn't carry).

Acceptance (hour 14):
- Full round trip: UI click -> real Agent 1 call (Anthropic) -> real Agent 2 call (OpenAI) -> chart + verdict render.
- All three scenarios callable from UI and produce visibly different chart heights.
- Demo-grade latency under 25s per analyze request.

### Hours 14-18: Divergence Tuning + OEE Validation (Track: Data/Agent 1 + QA)

Work items:
1. Sanity-check the divergence story: for NW01 over 36 months, plot all 3 scenarios externally (matplotlib script in `backend/scripts/plot_divergence.py`) and confirm curves separate.
2. Validate OEE application: manually recompute one month's available hours in Excel, compare against `available_hours` output, verify 10% downtime is applied.
3. Validate NW03 reallocation for a month where NW01 is bottlenecked.
4. Freeze prompts for both agents at **hour 20** (not 18) — integration findings from hours 8-14 may require prompt tweaks; keep the window open until Docker prep starts.

Acceptance (hour 18):
- Divergence plot saved to `backend/scripts/divergence.png` and visually sensible.
- Hand-check of one month matches engine output within 1%.
- NW03 reallocation returns non-zero headroom for at least one NW01 bottleneck case.

### Hours 14-20: Sourcing Stretch (Track: QA/Sourcing, conditional)

Only if capacity track is green at hour 14. Files: `backend/app/engine/sourcing.py`, route `POST /api/sourcing` with `{factory, scenario, top_n}` -> list of `{material, order_by_date, total_demand}`. UI: new tab `<SourcingPanel/>`.

Acceptance: top-N materials by demand volume for NW01 with order-by-dates; NOT blocking for demo if skipped.

### Hours 18-22: Docker + Demo Prep (Track: API + UI + QA)

Work items:
1. Finalize `Dockerfile`s, `docker-compose.yml`, `.env.example`.
2. `README.md`: 5-step run guide, architecture diagram, demo script (click path + expected output).
3. End-to-end cold-start test: `git clone` simulation -> `cp .env.example .env` + fill keys -> `docker compose up` -> click through in browser.
4. Fallback recording: screen-record a successful run in case live demo fails.

Acceptance (hour 22):
- Fresh machine test: one-command startup works.
- README includes the demo script.
- Fallback video recorded.

### Hours 22-24: Buffer + Polish

Reserved for regression fixes, UI polish, judge-facing talking points. No new features.

---

## 4. Critical Path

The demo succeeds iff all five of these succeed, in this order:

1. `compute_capacity_plan('NW01', <any scenario>)` runs in pure Python and returns a `Agent1Result`-shaped dict.
2. Divergence test (`test_capacity.py`) passes: `100_pct > probability_weighted > high_prob_only` load.
3. Agent 1 calls the tool and returns valid JSON; JSON passes `validate_agent1_payload`.
4. Agent 2 receives that JSON (and only that JSON) and returns `{verdict, strategy, sustainability_recommendation}`.
5. `/api/analyze` wired to UI; chart heights visibly differ when scenario selector changes.

Anything else (sourcing, 15-factory support, polished UI, pretty README) is non-critical.

---

## 5. Top Risks + Mitigations

### Risk 1 — Scenario curves collapse (divergence fails)

Cause: probability weighting applied incorrectly, or `high_prob_only` filter too permissive, or `100_pct` identical to `probability_weighted` because no row has probability < 1.

Mitigation:
- Assert divergence in `test_capacity.py` and run it in CI-equivalent (local pre-commit) on every change.
- At hour 14, generate the divergence plot and keep re-running until it's visually obvious.
- If a scenario still collapses: widen `high_prob_only` threshold from 75% to 90%, or apply probability as a multiplier on demand hours (not a filter), whichever restores separation.

### Risk 2 — Excel join explodes (missing data >> imputed data)

Cause: `Connector` column has underscores or casing mismatches; `Plant+WC` composite key missing entries in sheet 2_5; more rows flagged/dropped than kept.

Mitigation:
- At hour 3, print shape + null counts for every intermediate frame.
- If flagged count > 30%: fall back to a whitelist of "known-good" connectors for NW01 demo case only, documented as a known limitation in README.
- Cap demo to NW01 + NW03 only; 15-factory coverage is non-goal.

### Risk 3 — Two-SDK integration failure during demo (rate limit, JSON parse error, cold key)

Cause: Anthropic or OpenAI returns malformed JSON, rate-limits, or a key rotates.

Mitigation:
- **Agent 1 fallback:** if Anthropic SDK call fails OR numeric-guard assertion fires → skip Claude, use `tool_result` directly, set `fallback: true`, fill `reasoning` with canned template. No retry (numerics are deterministic; retry cannot change the invariant check outcome).
- **Agent 2 fallback:** if OpenAI SDK fails or JSON parse error after 2 retries → return deterministic `Agent2Verdict`: `APPROVED` if `capacity_utilization < 0.9` else `CORRECTED` with NW03 headroom strategy. Set `fallback: true`.
- **Both down:** UI shows `⚠ OFFLINE MODE` banner (see Dual-Fallback UI State section). Demo still shows correct capacity math and chart.
- Pre-recorded fallback demo video at hour 22. Demo talk track documented in README.
- API key smoke test at **hour 0** (not 20) — eliminates late-stage key surprises.

---

## 6. Team Split (maps to spec's recommendation)

| Track | People | Owns files |
|-------|--------|------------|
| Data + Agent 1 | 2 | `backend/app/data/*`, `backend/app/engine/*`, `backend/app/agents/agent1_capacity.py`, `backend/tests/test_joins.py`, `test_capacity.py`, `test_missing.py` |
| Agent 2 + API | 1 | `backend/app/main.py`, `backend/app/api/*`, `backend/app/agents/agent2_sustainability.py`, `backend/app/agents/contracts.py`, `docker-compose.yml`, backend `Dockerfile` |
| React UI | 1 | all `frontend/**` |
| QA + Sourcing stretch | 1 | `backend/scripts/*`, `backend/tests/test_contracts.py`, `README.md`, demo script, optional `backend/app/engine/sourcing.py` |

---

## 7. ADR (for consensus handoff)

- **Decision:** Option A - deterministic engine with thin LLM wrappers.
- **Drivers:** 24h budget, scenario divergence is the judge criterion, agent-isolation contract, two-SDK surface.
- **Alternatives considered:** B (LLM-first computation) - rejected: non-deterministic math incompatible with 24h QA. C (precompute cache) - rejected: breaks Agent 1 tool-use narrative, front-loads ETL.
- **Why chosen:** Guarantees the divergence win condition via math, preserves the judging narrative (Agent 1 uses Python tool, Agent 2 reasons over JSON), allows all four tracks to work in parallel against a stub API from hour 2.
- **Consequences:** Agent 1 is a thin wrapper over a deterministic function; accept this. Weekly data (sheet 2_1) requires a real aggregation module, not a shortcut. Scenario definitions must be single-sourced in `scenarios.py`.
- **Follow-ups:** sourcing stretch deferred to hour 14 gate; 15-factory coverage reduced to NW01+NW03 for demo.

---

## 8. Success Criteria (testable, Critic-revised)

- [ ] FastAPI endpoint accepts factory code + scenario name, returns Agent 1 JSON with all fields from `Agent1Result` schema.
- [ ] `test_joins.py`: for each of sheets 1_1, 1_2, 1_3, 2_1, 2_5, 2_6 — key columns have ≥ 80% non-null values after loading; shape matches expected row ranges from DATA_DICTIONARY.md.
- [ ] `test_capacity.py`: OEE assertion — `available_hours` for NW01 2026-05 equals `raw_hours × oee_applied`; hand-checkable within 1%.
- [ ] `test_capacity.py` divergence: `utilization_100_pct > utilization_prob_weighted > utilization_high_prob` for ≥ 3 months in 2026.
- [ ] `test_agent2_isolation.py`: calling `agent2_sustainability.run(agent1_json_fixture)` with `pd.read_excel` mocked asserts `mock.call_count == 0` — Agent 2 never touches raw data.
- [ ] Agent 2 sustainability check: if bottleneck at NW01, `reallocation.py` returns NW03 headroom > 0 for at least one month.
- [ ] React UI: scenario selector → POST → capacity bar chart updates → Agent 2 verdict panel renders.
- [ ] `DataQualityBadge` shows non-zero `flag_count` and `reconstructed_rows` for real NW01 data (proves missing-data pipeline ran).
- [ ] Three scenario curves diverge visibly in the UI chart (bar heights meaningfully different).
- [ ] `docker compose up` from clean clone starts both services; `GET /api/health` returns 200.

### Buffer allocation note
Hours 22-24 buffer is protected: Architect revisions (~2h) were absorbed into the Agent 2 + API track hours 2-8 (that track has natural slack before real Agent 2 integration at hour 8). Sourcing stretch gate moved to hour 12 — QA person can be reassigned to regression if capacity track hits a snag at hour 14.
