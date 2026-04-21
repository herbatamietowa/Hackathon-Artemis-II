# Solution Overview — Northwind Manufacturing Capacity Planner

This document explains what the application does, how it works, and where everything lives — written so anyone can understand it, no coding experience needed.

---

## What the App Does

The app helps manufacturing managers at Northwind plan production capacity across 15 global factories. It reads real operational data from Excel files and turns it into actionable insights across five areas:

1. **New Project** — Simulate a new production order: which factory should make it, how long will it take, what does it cost, and what raw materials are needed?
2. **Order Materials** — Place raw material orders with estimated cost and current stock shown live.
3. **Factory Pulse** — See how loaded each factory's work centres are (presses, assembly lines, etc.) and spot bottlenecks.
4. **Raw Material Needs** — See which raw materials need to be ordered and by when, based on current demand gaps and supplier lead times.
5. **Disruption Sim** — Simulate what happens if a factory goes offline (due to disaster, strike, etc.) and find alternative factories that can absorb the load.

---

## Tech Stack

### Backend (the "brain")
| What | Technology |
|------|-----------|
| Language | **Python 3.13** |
| Web framework | **FastAPI** — serves data to the frontend via HTTP API |
| Data processing | **pandas** — reads and crunches the Excel data |
| Excel reading | **openpyxl** — opens `.xlsx` files |
| AI — Agent 1 | **Groq** (`llama-3.3-70b-versatile`) — capacity analysis and bottleneck flagging |
| AI — Agent 2 | **Gemini Flash** (`gemini-2.0-flash`) — sustainability scoring and path comparison |
| Configuration | **python-dotenv** — loads secrets from `.env` file |
| Tests | **pytest** |

### Frontend (what the user sees)
| What | Technology |
|------|-----------|
| Language | **TypeScript** (typed JavaScript) |
| UI framework | **React** — builds the interactive interface |
| Charts | **Recharts** — renders the capacity bar charts |
| Build tool | **Vite** — compiles the code for the browser |

### Infrastructure
| What | Technology |
|------|-----------|
| Containerisation | **Docker + Docker Compose** — packages both backend and frontend to run anywhere |
| Frontend server | **Nginx** — serves the built frontend files in production |

### Data source
All data comes from two Excel files in the `data/` folder:
- `hackathon_dataset.xlsx` — the main dataset (12 sheets: demand, capacity, BOM, inventory, SAP master data, etc.)
- `Data_Dictionary_overview.xlsx` — column definitions

---

## How the Data Flows

```
Excel file (hackathon_dataset.xlsx)
        ↓
  Python backend reads and processes sheets
        ↓
  FastAPI serves results as JSON via HTTP
        ↓
  React frontend fetches and displays data
        ↓
  User sees charts, cards, and forms
```

---

## Folder Structure

```
Hackathon-Artemis-II/
│
├── data/                          ← Excel data files (the source of truth)
│   ├── hackathon_dataset.xlsx     ← 12 sheets of real operational data
│   └── Data_Dictionary_overview.xlsx
│
├── backend/                       ← Python server
│   ├── app/
│   │   ├── main.py                ← Starts the FastAPI server
│   │   ├── config.py              ← Paths and environment variables
│   │   │
│   │   ├── api/
│   │   │   ├── routes.py          ← All HTTP endpoints (what the frontend can ask for)
│   │   │   └── schemas.py         ← Data shapes (what each response looks like)
│   │   │
│   │   ├── engine/                ← All business logic (calculations)
│   │   │   ├── capacity.py        ← Factory Pulse: work centre load vs. capacity
│   │   │   ├── sourcing.py        ← Raw Material Needs: gaps, lead times, order dates, costs
│   │   │   ├── project_simulation.py ← New Project: BOM explosion, plant feasibility, paths
│   │   │   ├── project_architect.py  ← Order Materials: validates and logs orders
│   │   │   ├── disaster.py        ← Disruption Sim: simulates factory offline scenarios
│   │   │   ├── gci.py             ← Green Compatibility Index: sustainability scoring
│   │   │   ├── bottleneck.py      ← Detects overloaded work centres
│   │   │   ├── reallocation.py    ← Suggests shifting load to alternative factories
│   │   │   └── scenarios.py       ← Demand multipliers (100%, probability-weighted, high-prob)
│   │   │
│   │   ├── agents/                ← AI-powered agents (Groq + Gemini Flash)
│   │   │   ├── agent1_capacity.py    ← Analyses capacity data and flags issues
│   │   │   ├── agent2_sustainability.py ← Scores sustainability of production paths
│   │   │   └── prompts/           ← System prompt text files for each agent
│   │   │
│   │   └── data/                  ← Data loading and joining utilities
│   │       ├── loader.py          ← Reads and caches Excel sheets
│   │       ├── joins.py           ← Merges demand + capacity + tooling data
│   │       ├── calendar.py        ← Converts week numbers to dates
│   │       └── missing.py         ← Handles missing/incomplete rows
│   │
│   ├── tests/                     ← Automated tests
│   ├── requirements.txt           ← Python packages needed
│   └── Dockerfile                 ← How to containerise the backend
│
├── frontend/                      ← React user interface
│   ├── src/
│   │   ├── App.tsx                ← Main app: tabs, state, data loading, layout
│   │   ├── types.ts               ← TypeScript type definitions (mirrors backend schemas)
│   │   │
│   │   ├── api/
│   │   │   └── client.ts          ← All calls to the backend (fetch wrappers)
│   │   │
│   │   └── components/            ← UI panels, one per feature
│   │       ├── ProjectSimulator.tsx   ← New Project tab
│   │       ├── ProjectArchitect.tsx   ← Order Materials tab
│   │       ├── SourcingPanel.tsx      ← Raw Material Needs tab
│   │       ├── CapacityChart.tsx      ← Work centre bar chart
│   │       ├── BottleneckAlert.tsx    ← Red/amber bottleneck warning banner
│   │       ├── ReallocationBanner.tsx ← Suggests moving load to another factory
│   │       ├── DisasterPanel.tsx      ← Disruption simulation results
│   │       ├── GCIPanel.tsx           ← Green Compatibility Index display
│   │       ├── Agent2Panel.tsx        ← AI sustainability analysis panel
│   │       ├── FactorySelector.tsx    ← Factory dropdown with bottleneck indicators
│   │       ├── ScenarioSelector.tsx   ← Demand scenario dropdown
│   │       ├── DataQualityBadge.tsx   ← Shows data gaps or reconstructed rows
│   │       └── LoadingState.tsx       ← Spinner shown while data loads
│   │
│   ├── index.html                 ← HTML shell the React app mounts into
│   ├── package.json               ← JavaScript packages needed
│   └── Dockerfile                 ← How to containerise the frontend
│
├── docker-compose.yml             ← Runs backend + frontend together with one command
├── solution.md                    ← This file
└── README.md                      ← Setup instructions
```

---

## Feature-by-Feature Breakdown

### New Project (`🔩 New Project` tab)
- **What it does:** You pick a plate and/or gasket material and a quantity. The app explodes the Bill of Materials (BOM), checks inventory, and compares all feasible factories. It then presents three production paths: the greenest, the fastest, and the cheapest.
- **Where the logic lives:** `backend/app/engine/project_simulation.py`
- **Data used:** Sheets `3_2 Component_SF_RM` (BOM), `2_3 SAP MasterData` (costs, lead times), `2_1 Work Center Capacity Weekly`, `3_1 Inventory ATP`, `2_6 Tool_material nr master`
- **Frontend component:** `ProjectSimulator.tsx`

### Order Materials (`📦 Order Materials` tab)
- **What it does:** You select a raw material, enter a quantity, choose a factory and delivery date, and place an order. The app shows current stock, projected stock after delivery, and an estimated cost (derived from the finished goods standard cost in SAP). The cost updates live as you change the quantity.
- **Where the logic lives:** `backend/app/engine/project_architect.py`, `backend/app/api/routes.py` (`/raw-materials`, `/order-raw-material`)
- **Data used:** Sheets `3_2 Component_SF_RM` (BOM, unit quantities), `2_3 SAP MasterData` (standard cost), `3_1 Inventory ATP` (current stock)
- **Frontend component:** `ProjectArchitect.tsx`
- **Note on cost estimation:** Raw material purchase prices are not in the dataset. The cost is estimated as: finished good standard cost ÷ effective component quantity (kg/pc) = estimated cost per kg of raw material. This is clearly labelled with an asterisk (*).

### Factory Pulse (`📊 Factory Pulse` tab)
- **What it does:** Shows how loaded each work centre (press, extrusion, assembly, etc.) is for the selected factory and time period. Green = comfortable, amber = near limit, red = overloaded. Bottlenecks are highlighted automatically. If a factory is overloaded, the app suggests how much work to shift to the nearest compatible factory.
- **Where the logic lives:** `backend/app/engine/capacity.py`, `backend/app/engine/bottleneck.py`, `backend/app/engine/reallocation.py`, `backend/app/agents/agent1_capacity.py`
- **Data used:** Sheets `2_1 Work Center Capacity Weekly`, `2_2 OPS plan per material`, `2_3 SAP MasterData`, `2_4 Model Calendar`, `2_5 WC Schedule_limits`
- **Frontend components:** `CapacityChart.tsx`, `BottleneckAlert.tsx`, `ReallocationBanner.tsx`

### Raw Material Needs (`🚚 Raw Material Needs` tab)
- **What it does:** For the selected factory and demand scenario, it calculates which raw materials are needed to cover demand that isn't already covered by ATP (available-to-promise) inventory. For each material it shows: how much is needed, the supplier lead time, when the order must be placed, and an estimated cost. Materials are colour-coded: green = on track, yellow = order soon, orange = urgent, red = overdue.
- **Where the logic lives:** `backend/app/engine/sourcing.py`
- **Data used:** Sheets `1_1 Export Plates`, `1_2 Gaskets`, `3_2 Component_SF_RM` (BOM), `3_1 Inventory ATP`, `2_3 SAP MasterData` (costs)
- **Frontend component:** `SourcingPanel.tsx`
- **Clicking Order:** Pre-fills the Order Materials form with the selected material and recommended quantity.

### Disruption Sim (`🔴 Disruption Sim` tab)
- **What it does:** You simulate a factory going offline (fire, strike, flood, etc.). The app finds which other factories can manufacture the same products, scores each alternative on cost and sustainability, and recommends the best rerouting option.
- **Where the logic lives:** `backend/app/engine/disaster.py`, `backend/app/engine/gci.py`, `backend/app/agents/agent2_sustainability.py`
- **Data used:** Sheets `2_6 Tool_material nr master`, `2_3 SAP MasterData`, `1_1 Export Plates`, `1_2 Gaskets`
- **Frontend components:** `DisasterPanel.tsx`, `GCIPanel.tsx`, `Agent2Panel.tsx`

---

## Demand Scenarios

The app supports three demand scenarios, selectable from a dropdown:

| Scenario | What it means |
|----------|--------------|
| **100%** | Treat all demand as certain — plan for everything |
| **Probability-weighted** | Weight demand by the probability each project is approved |
| **High-probability only** | Only plan for projects with a high chance of being approved |

These are applied in `backend/app/engine/scenarios.py` and affect the Factory Pulse and Raw Material Needs calculations.

---

## Key Excel Sheets and What They Contain

| Sheet | Contents |
|-------|----------|
| `1_1 Export Plates` | Sales demand for plate materials, by month |
| `1_2 Gaskets` | Sales demand for gasket materials, by month |
| `1_3 Export Project list` | Project metadata (status, probability, delivery dates) |
| `2_1 Work Center Capacity Weekly` | Available and demanded hours per work centre per week |
| `2_2 OPS plan per material` | Production operations plan per material |
| `2_3 SAP MasterData` | Master data: standard cost, lead times, transportation time, vendor |
| `2_4 Model Calendar` | Factory working calendar |
| `2_5 WC Schedule_limits` | Work centre scheduling limits per factory |
| `2_6 Tool_material nr master` | Which tools (and factories) can produce which materials |
| `3_1 Inventory ATP` | Current stock, ATP quantity, and stock values per factory |
| `3_2 Component_SF_RM` | Bill of Materials: what raw materials go into each finished good |

---

## How to Run It

### With Docker (recommended)
```bash
docker-compose up
```
Then open `http://localhost:5173` in your browser.

### Without Docker
```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend (in a separate terminal)
cd frontend
npm install
npm run dev
```

---

## Important Notes

- **No database** — all data is read directly from the Excel files. Nothing is permanently saved except raw material orders (logged to a CSV file).
- **Cost estimates are approximate** — the app derives raw material costs from finished goods standard costs, since supplier prices are not in the dataset. All estimates are clearly marked with an asterisk (*).
- **AI agents are optional** — Agent 1 (capacity) uses Groq (`GROQ_API_KEY`) and Agent 2 (sustainability) uses Gemini Flash (`GEMINI_API_KEY`). Both are called via the OpenAI-compatible SDK pointed at different base URLs. If API keys are not set in `.env`, those panels show an error but the rest of the app works normally.
- **Transportation times** — the `Transportation Lanes Lead Time` from SAP MasterData is used for outbound logistics in the New Project paths. Raw material inbound lead times come from the `Production LT in Weeks` column in the BOM sheet.
