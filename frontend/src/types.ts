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

export interface AgentTurn {
  agent_name: string;
  message: string;
  verdict?: string;
}

export interface AnalyzeResponse {
  agent1_result: Agent1Result;
  agent2_verdict: Agent2Verdict;
  per_work_center: WCLoad[];
  debate_history: AgentTurn[];
  status: 'CONSENSUS' | 'CONTESTED' | 'USER_OVERRIDE';
  reallocation?: ReallocationSuggestion;
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
  estimated_cost_eur?: number | null;
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

export interface ProjectItemCreate {
  item_type:  'plate' | 'gasket';
  final_code: string;
  description: string;
  quantity: number;
  selected_path: string;
  production_plant: string;
  delivery_days: number;
  cost: number;
  est_co2: number;
  grid_co2: number;
  deadline?: string;
}

export interface ProjectCreate {
  name: string;
  status: string;
  items: ProjectItemCreate[];
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
  transport_mode: string;
  transport_note: string | null;
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
  estimated_co2_kg: number;
  rm_ordered_at_plant: boolean;
  stock_available_qty: number;
  delivery_name: string;
  delivery_dist_km: number;
  is_bom_pair: boolean;
  joining_time_days: number;
  joining_note: string | null;
  inter_plant_days: number;
  inter_plant_cost_eur: number;
  inter_plant_co2_kg: number;
}

export interface ProjectSimulationResult {
  // Plate fields
  plate_code?: string;
  plate_name?: string;
  plate_description?: string;
  plate_final?: string;

  // Gasket fields
  gasket_code?: string;
  gasket_name?: string;
  gasket_description?: string;
  gasket_final?: string;

  // Shared
  quantity: number;
  feasible_plants: string[];
  raw_materials: RawMaterialStatus[];
  paths: SimulationPath[];
  warning: string | null;

  // These belong on SimulationPath, not here — but keep if your backend sends them
  est_co2?: number;
  grid_co2?: number;
  data_quality_warning: boolean;
}

export interface ProjectSimulationRequest {
  plate_code: string;
  quantity: number;
  delivery_lat?: number;
  delivery_lon?: number;
  delivery_name?: string;
  gasket_override?: string;
  item_type?: string;
}

export interface DeliveryDestination {
  name: string;
  lat: number;
  lon: number;
  continent: string;
  island: boolean;
}

export interface CompatibleGasketItem {
  code: string;
  name: string;
}

export interface CompatibleGasketsResult {
  plate_code: string;
  tool_prefixes: string[];
  compatible_gaskets: CompatibleGasketItem[];
  data_quality_warning: boolean;
  warning_message: string | null;
}

export interface RawMaterialItem {
  unit_cost_eur?: number | null;
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
  plate_code: string | null ;
  plate_name: string | null;
  gasket_name: string | null;
  gasket_code: string | null;
  quantity: number;
  path_name: string;
  plant: string;
  mode: string;
  total_cost_eur: number;
  delivery_days: number;
  carbon_score: number;
}

export interface DebateProjectPathRequest {
  plate_code: string;
  quantity: number;
  user_argument?: string;
  delivery_lat?: number;
  delivery_lon?: number;
  delivery_name?: string;
}

export interface UploadDataResponse {
  sheets_merged: string[];
  rows_added: Record<string, number>;
}

export interface DebateProjectPathResponse {
  agreed_path: SimulationPath | null;
  debate_history: AgentTurn[];
  status: 'CONSENSUS' | 'CONTESTED' | 'USER_OVERRIDE';
  parameters_considered: string[];
  tradeoffs: string[];
  plate_code: string;
  plate_name: string;
}
