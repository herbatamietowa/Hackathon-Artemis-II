# Deep Interview Spec: Hackathon Artemis II — Predictive Manufacturing AI Agent System

## Metadata
- Interview ID: artemis-2026-04-18
- Rounds: 6
- Final Ambiguity Score: 15%
- Type: greenfield
- Generated: 2026-04-18
- Threshold: 20%
- Status: PASSED

---

## Clarity Breakdown

| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.88 | 0.40 | 0.352 |
| Constraint Clarity | 0.88 | 0.30 | 0.264 |
| Success Criteria | 0.78 | 0.30 | 0.234 |
| **Total Clarity** | | | **0.850** |
| **Ambiguity** | | | **15%** |

---

## Goal

Build a two-agent AI system (FastAPI + React + Docker) that ingests `hackathon_dataset.xlsx` and produces:

1. **(Primary)** A 3-scenario capacity model for Factory NW01 (and optionally others) showing work-center load vs. available capacity for the 36-month horizon, with bottleneck detection and a sustainability reallocation check (NW01 → NW03).
2. **(Secondary, if time permits)** A sourcing stub: order-by-date for top-N materials by demand volume.

Judges evaluate **scenario robustness** — the three capacity curves must diverge sensibly as probability assumptions change, and Agent 2's reasoning must be logically sound.

---

## The Two Agents

### Agent 1 — Capacity Calculator
- **Model:** `claude-haiku-4-5-20251001` (Anthropic SDK)
- **Role:** Production Planning Specialist
- **Tools:** Python executor (pandas, numpy)
- **Input:** Raw Excel data (via FastAPI ingestion layer) + scenario parameters
- **Task:** Calculate total load for the selected factory/month, factoring in OEE from sheet 2_5
- **Output (strict JSON):**
  ```json
  {
    "scenario": "probability_weighted",
    "factory": "NW01",
    "period": "May 2026",
    "capacity_utilization": 0.87,
    "available_hours": 1240.0,
    "demanded_hours": 1078.8,
    "bottleneck_detected": true,
    "bottleneck_work_centers": ["PRESS_3", "PRESS_5"],
    "oee_applied": 0.82,
    "excluded_rows": 12,
    "flag_count": 7,
    "reasoning": "..."
  }
  ```

### Agent 2 — Sustainability Evaluator
- **Model:** OpenAI `o3` or `o4-mini` (OpenAI SDK, strong reasoning)
- **Role:** Senior Operations Director
- **Input:** ONLY the JSON output from Agent 1 (no raw data access)
- **Evaluation criteria:**
  1. Is the calculation logically consistent? (load hours / available hours = utilization%)
  2. Is the 10% OEE downtime from sheet 2_5 correctly applied?
  3. If bottleneck detected: can production shift to NW03 (lower energy consumption)?
- **Output:** `{ "verdict": "APPROVED" | "CORRECTED", "strategy": "...", "sustainability_recommendation": "..." }`

---

## Constraints

- **Time:** 24 hours, 4–5 person team
- **Stack:** React (frontend), FastAPI (backend), Docker (containerization), pandas (data processing)
- **APIs:** Anthropic SDK (Agent 1) + OpenAI SDK (Agent 2) — two separate API integrations
- **Granularity:** Monthly primary. Weekly used only where data is natively weekly (sheet 2_1). Use sheet 2_4 (Model Calendar) to aggregate weekly capacity to monthly totals via working-day weighting.
- **Missing data policy (three-tier):**
  1. **Impute:** If `Missing CT` / `Missing WC` but material code exists → resolve via sheet 2_6 join
  2. **Flag:** Rows where connector is `_` or join fails → mark as `unresolvable`, include count in Agent 1 output
  3. **Drop:** Fully null rows (no material, no quantity) → silently excluded
- **Rev no:** Treat different Rev no as non-substitutable — flag cross-rev matches, do not auto-merge
- **Sustainability scope:** Sustainability = factory-level energy (NW01 vs NW03 reallocation decision). NOT compute efficiency of AI models themselves (accuracy is priority).
- **Scenarios:** Three, run sequentially:
  - `100_pct`: All pipeline projects treated as 100% probability
  - `probability_weighted`: Demand × project probability (10/25/50/75/90 from sheet 1_3)
  - `high_prob_only`: Only projects with probability ≥ 75%

---

## Non-Goals
- Real-time streaming from Salesforce/Anaplan
- ML/predictive maintenance models (rules + heuristics only, per HINTS.md)
- Full sourcing forecast (build stub only if capacity model + scenarios ship with time to spare)
- Authentication / multi-user sessions
- Deployment beyond local Docker Compose
- Tool-level maintenance threshold engine (flag accumulated volume, don't auto-schedule)

---

## Acceptance Criteria

- [ ] FastAPI endpoint accepts factory code + scenario name, returns Agent 1 JSON
- [ ] Agent 1 reads sheets 1_1, 1_2, 1_3, 2_1, 2_5, 2_6 correctly via pandas
- [ ] Agent 1 applies OEE from sheet 2_5 (column `OEE (in %)`) to available hours
- [ ] Agent 1 runs all three scenarios and produces diverging utilization numbers
- [ ] Agent 2 receives ONLY Agent 1's JSON (no raw data) and produces verdict + strategy
- [ ] Agent 2 sustainability check: if bottleneck at NW01, check NW03 capacity in same period
- [ ] React UI shows: scenario selector → capacity bar chart → Agent 2 verdict panel
- [ ] Missing data rows are counted and surfaced (not silently hidden)
- [ ] All three scenario curves diverge sensibly (100% > probability_weighted > high_prob_only load)
- [ ] Docker Compose: `docker-compose up` starts both frontend and backend

---

## Assumptions Exposed & Resolved

| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| "Full pipeline" = capacity + sourcing in 24h | Contrarian: sourcing join is 4 sheets + scrap math | **Depth over breadth**: nail scenarios first, sourcing is stretch |
| "Accuracy" = numeric closeness to ground truth | No ground truth exists | **Accuracy = scenario robustness**: curves diverge sensibly, reasoning is sound |
| Primary granularity should be weekly | Weekly is more precise | **Monthly primary** (demand-native), weekly only where already weekly in source |
| Missing data rows should be imputed or dropped | Both lose information | **Three-tier**: impute via 2_6 where possible, flag where not, drop blanks |
| Agent 2 should be Claude Opus | OpenAI o3/o4-mini is strong at reasoning | **Claude Haiku (Agent 1) + OpenAI o3/o4-mini (Agent 2)** |

---

## Technical Context (Greenfield)

**Data pipeline (pandas):**
```
hackathon_dataset.xlsx
  sheets 1_1, 1_2  → pipeline demand (monthly PCS per material per project)
  sheet  1_3       → project probability (10/25/50/75/90)
  sheet  2_1       → weekly capacity per WC (23 measures)
  sheet  2_4       → calendar (weekly → monthly aggregation key)
  sheet  2_5       → OEE per WC per shift level
  sheet  2_6       → core join: material ↔ tool ↔ WC ↔ cycle time

Join sequence:
  1_1/1_2.Connector → 2_6.Connector         (get cycle time, WC, tool)
  1_3.Project name  → 1_1/1_2.Project_name  (get probability)
  2_6.Plant + WC    → 2_5 (get OEE)
  2_1.WC code       → aggregate to monthly via 2_4

Capacity calc:
  demand_hours = SUM(PCS × cycle_time_minutes / 60) × probability_weight
  available_hours = SUM(weekly_available_hours × OEE) for weeks in month
  utilization = demand_hours / available_hours
```

**FastAPI routes (minimum viable):**
```
POST /api/analyze          { factory, scenario } → { agent1_result, agent2_verdict }
GET  /api/scenarios        → list of scenario names
GET  /api/factories        → list of plant codes in dataset
```

**React components (minimum viable):**
```
<ScenarioSelector>         dropdown: 100_pct | probability_weighted | high_prob_only
<CapacityChart>            bar chart: WC × utilization %, color-coded by threshold
<BottleneckAlert>          if bottleneck_detected: show WCs + Agent 2 strategy
<DataQualityBadge>         excluded_rows count + flag_count
```

**Docker Compose:**
```yaml
services:
  backend:   fastapi + uvicorn, mounts ./data
  frontend:  react + nginx, proxies /api → backend
```

---

## Ontology (Key Entities)

| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| Factory | core domain | code (NW01…NW15), region, shift_pattern, OEE | has many WorkCenters |
| WorkCenter | core domain | code, press_size (S/M/L), shift_levels, available_hours | belongs to Factory, has many Tools |
| Tool | core domain | tool_no, accumulated_volume, cycle_time | belongs to WorkCenter, produces many Materials |
| Material | core domain | sap_code, rev_no, type (plate/gasket), cycle_time | produced by Tool, demanded by PipelineProject |
| PipelineProject | core domain | project_name, probability, requested_date, region | demands many Materials |
| CapacityPlan | core domain | factory, period, scenario, demand_hours, available_hours, utilization | output of Agent1 |
| ScenarioModel | supporting | name, probability_filter, demand_multiplier | parameterizes CapacityPlan |
| Agent1Calculator | external system | model (haiku), tools (Python), input (raw data), output (JSON) | calls Python, feeds Agent2 |
| Agent2Evaluator | external system | model (o3/o4-mini), input (JSON only), output (verdict + strategy) | evaluates Agent1 |

---

## Ontology Convergence

| Round | Entity Count | New | Changed | Stable | Stability |
|-------|-------------|-----|---------|--------|-----------|
| 1 | 6 | 6 | - | - | N/A |
| 2 | 8 | 2 | 0 | 6 | 75% |
| 3 | 9 | 1 | 0 | 8 | 89% |
| 4 | 9 | 0 | 0 | 9 | 100% |
| 5 | 9 | 0 | 0 | 9 | 100% |
| 6 | 9 | 0 | 0 | 9 | 100% |

---

## Team Split Recommendation (4–5 people, 24h)

| Track | People | Hours 0–8 | Hours 8–16 | Hours 16–24 |
|-------|--------|-----------|------------|-------------|
| Data / Agent 1 | 2 | Excel ingestion + join pipeline | Capacity calc + 3 scenarios | Agent 1 prompt tuning + OEE |
| Agent 2 + API | 1 | FastAPI routes + OpenAI SDK | Agent 2 prompt + verdict logic | Integration + Docker |
| React UI | 1 | Scaffold + scenario selector | CapacityChart + bottleneck panel | Polish + DataQuality badge |
| QA / Sourcing stretch | 1 | End-to-end test | Sourcing stub (top-N materials) | Demo prep + README |

---

## Interview Transcript

<details>
<summary>Full Q&A (6 rounds)</summary>

### Round 1
**Q:** At the final demo, what specific output would make judges say 'yes, this works'?
**A:** Full pipeline: capacity + sourcing
**Ambiguity:** 43% (Goal: 0.70, Constraints: 0.45, Criteria: 0.52)

### Round 2
**Q:** Which models for Agent 1 and Agent 2?
**A:** Claude + OpenAI o3/o4 (Haiku for Calculator, o3/o4-mini for Evaluator)
**Ambiguity:** 38% (Goal: 0.70, Constraints: 0.62, Criteria: 0.52)

### Round 3
**Q:** How will judges evaluate prediction quality without ground truth?
**A:** Scenario robustness — three curves must diverge sensibly
**Ambiguity:** 30% (Goal: 0.75, Constraints: 0.62, Criteria: 0.72)

### Round 4 (Contrarian)
**Q:** What if nailing scenarios is more impressive than half-built sourcing?
**A:** Depth over breadth — nail scenarios first, sourcing is stretch
**Ambiguity:** 24% (Goal: 0.82, Constraints: 0.68, Criteria: 0.75)

### Round 5
**Q:** Primary time granularity — weekly or monthly?
**A:** Monthly primary + weekly only where natively weekly
**Ambiguity:** 20% (Goal: 0.85, Constraints: 0.78, Criteria: 0.75)

### Round 6 (Simplifier)
**Q:** Missing data policy — simplest approach?
**A:** Three-tier: impute via 2_6, flag where not, drop blanks
**Ambiguity:** 15% (Goal: 0.88, Constraints: 0.88, Criteria: 0.78)

</details>
