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
