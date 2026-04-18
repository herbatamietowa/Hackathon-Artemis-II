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
  verdict: 'APPROVED' | 'CORRECTED';
  strategy: string;
  sustainability_recommendation: string;
  fallback: boolean;
}

export interface AnalyzeResponse {
  agent1_result: Agent1Result;
  agent2_verdict: Agent2Verdict;
  per_work_center: WCLoad[];
}

export interface AnalyzeRequest {
  factory: string;
  scenario: string;
  period?: string;
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
