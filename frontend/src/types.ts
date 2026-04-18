export interface WCLoad {
  wc: string;
  utilization: number;
  available: number;
  demanded: number;
}

export interface Agent1Result {
  scenario: string;
  factory: string;
  period: string;
  capacity_utilization: number;
  available_hours: number;
  demanded_hours: number;
  bottleneck_detected: boolean;
  bottleneck_work_centers: string[];
  oee_applied: number;
  excluded_rows: number;
  flag_count: number;
  reconstructed_rows: number;
  reasoning: string;
  fallback: boolean;
}

export interface Agent2Verdict {
  verdict: 'APPROVED' | 'REOPEN DEBATE';
  strategy: string;
  sustainability_recommendation: string;
  challenge_summary?: string;
  fallback: boolean;
}

export interface ReallocationSuggestion {
  available_headroom_hours: number;
  overflow_hours: number;
  can_absorb: boolean;
  suggestion: string;
  material_compatibility_pct: number;
  compatible_materials: number;
  total_materials: number;
  cost_delta_pct: number;
  transport_lt_delta_days: number;
  source_grid_intensity: number;
  target_grid_intensity: number;
  carbon_delta_pct: number;
}

export interface AnalyzeResponse {
  agent1_result: Agent1Result;
  agent2_verdict: Agent2Verdict;
  per_work_center: WCLoad[];
  debate_history: AgentTurn[];
  status: 'CONSENSUS' | 'CONTESTED' | 'USER_OVERRIDE';
  reallocation?: ReallocationSuggestion;
}
}

export interface AnalyzeRequest {
  factory: string;
  scenario: string;
  period?: string;
  user_argument?: string;
}

export interface SourcingMaterial {
  raw_material_code: string;
  raw_material_name: string;
  unit: string;
  total_needed: number;
  lead_time_days: number;
  order_by_date: string;
  days_until_order: number;
  status: 'on_track' | 'order_soon' | 'urgent' | 'overdue';
  finished_goods: string[];
}

export interface SourcingResponse {
  factory: string;
  scenario: string;
  period: string;
  materials: SourcingMaterial[];
  on_track_count: number;
  order_soon_count: number;
  urgent_count: number;
  overdue_count: number;
}

export interface SourcingRequest {
  factory: string;
  scenario: string;
  period?: string;
}

export interface ReallocationSuggestion {
  available_headroom_hours: number;
  overflow_hours: number;
  can_absorb: boolean;
  suggestion: string;
  material_compatibility_pct: number;
  compatible_materials: number;
  total_materials: number;
  cost_delta_pct: number;
  transport_lt_delta_days: number;
  source_grid_intensity: number;
  target_grid_intensity: number;
  carbon_delta_pct: number;
}

export interface DisasterAlternative {
  plant: string;
  plant_name: string;
  materials_coverable: number;
  total_offline_materials: number;
  coverage_pct: number;
  current_utilization: number;
  projected_utilization: number;
  capacity_headroom_hours: number;
  overloaded: boolean;
  cost_delta_pct: number;
  transport_lt_delta_days: number;
  grid_intensity: number;
  carbon_delta_pct: number;
}

export interface DisasterResult {
  offline_factory: string;
  scenario: string;
  period: string;
  duration_months: number;
  displaced_hours: number;
  alternatives: DisasterAlternative[];
  network_coverage_pct: number;
  unabsorbable_hours: number;
  ai_insight: string;
}

export interface DisasterRequest {
  offline_factory: string;
  scenario: string;
  period?: string;
  duration_months: number;
}

export interface GCIRoute {
  plant: string;
  plant_name: string;
  region: string;
  mode: string;
  gci: number;
  cost_score: number;
  carbon_score: number;
  raw_cost_eur: number;
  raw_carbon: number;
  grid_intensity: number;
  scrap_factor: number;
  dominant_size: string;
  arrival_date: string;
  meets_rdd: boolean;
  days_margin: number;
  transport_lt_days: number;
  carbon_penalty: boolean;
}

export interface GCIResponse {
  material_code: string;
  material_name: string;
  rdd: string | null;
  slider_alpha: number;
  forced_mode: string | null;
  routes: GCIRoute[];
  recommended_plant: string | null;
  green_baseline: number;
  green_potential_saving_pct: number;
  ai_insight: string;
}

export interface GCIRequest {
  material_code: string;
  rdd?: string;
  alpha: number;
  forced_mode?: string;
}

export interface MaterialOption {
  code: string;
  name: string;
}

export interface ScenarioPath {
  name: string;
  icon: string;
  plant: string;
  plant_name: string;
  region: string;
  mode: string;
  cost_eur: number;
  delivery_date: string;
  meets_deadline: boolean;
  days_margin: number;
  grid_intensity: number;
  carbon_score: number;
  transport_lt_days: number;
  gci_score: number;
}

export interface ProjectArchitectResponse {
  material_code: string;
  material_name: string;
  quantity: number;
  deadline: string | null;
  paths: ScenarioPath[];
}

export interface ProjectArchitectRequest {
  material_code: string;
  quantity: number;
  deadline?: string;
}

export interface ConfirmProjectRequest {
  material_code: string;
  material_name: string;
  quantity: number;
  deadline?: string;
  chosen_path: string;
  chosen_plant: string;
  cost_eur: number;
  delivery_date: string;
}

export interface RawMaterialStatus {
  code: string;
  name: string;
  available_qty: number;
  needed_qty: number;
  sufficient: boolean;
  unit: string;
}

export interface SimulationPath {
  name: string;
  icon: string;
  plant: string;
  plant_name: string;
  mode: string;
  total_cost_eur: number;
  plate_cost: number;
  gasket_cost: number;
  shipping_cost: number;
  delivery_days: number;
  raw_material_lt_days: number;
  production_lt_days: number;
  logistics_lt_days: number;
  carbon_score: number;
  grid_intensity: number;
  scrap_factor: number;
}

export interface ProjectSimulationResult {
  plate_code: string;
  plate_name: string;
  gasket_code: string | null;
  gasket_name: string;
  quantity: number;
  feasible_plants: string[];
  raw_materials: RawMaterialStatus[];
  paths: SimulationPath[];
  warning: string | null;
}

export interface ProjectSimulationRequest {
  plate_code: string;
  quantity: number;
}

export interface RawMaterialItem {
  code: string;
  name: string;
  unit: string;
  stock_qty: number;
}

export interface RawMaterialOrderRequest {
  material_code: string;
  material_name: string;
  unit: string;
  quantity: number;
  factory: string;
  deadline?: string;
}

export interface ApproveProjectRequest {
  plate_code: string;
  plate_name: string;
  gasket_code: string | null;
  quantity: number;
  path_name: string;
  plant: string;
  mode: string;
  total_cost_eur: number;
  delivery_days: number;
  carbon_score: number;
}
