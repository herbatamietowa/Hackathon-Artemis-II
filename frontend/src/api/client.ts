import type { AnalyzeRequest, AnalyzeResponse, ApproveProjectRequest, ConfirmProjectRequest, DisasterRequest, DisasterResult, GCIRequest, GCIResponse, MaterialOption, ProjectArchitectRequest, ProjectArchitectResponse, ProjectSimulationRequest, ProjectSimulationResult, SourcingRequest, SourcingResponse } from '../types';

const BASE = '/api';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`POST ${path} failed: ${res.status} — ${err}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => get<{ status: string }>('/health'),
  scenarios: () => get<{ scenarios: string[] }>('/scenarios'),
  factories: () => get<{ factories: string[] }>('/factories'),
  materials: () => get<{ materials: MaterialOption[] }>('/materials'),
  analyze: (req: AnalyzeRequest) => post<AnalyzeResponse>('/analyze', req),
  sourcing: (req: SourcingRequest) => post<SourcingResponse>('/sourcing', req),
  gci: (req: GCIRequest) => post<GCIResponse>('/gci', req),
  disaster: (req: DisasterRequest) => post<DisasterResult>('/disaster', req),
  projectArchitect: (req: ProjectArchitectRequest) => post<ProjectArchitectResponse>('/project-architect', req),
  confirmProject: (req: ConfirmProjectRequest) => post<{ status: string }>('/confirm-project', req),
  plates: () => get<{ materials: MaterialOption[] }>('/plates'),
  simulateProject: (req: ProjectSimulationRequest) => post<ProjectSimulationResult>('/simulate-project', req),
  approveProject: (req: ApproveProjectRequest) => post<{ status: string; record: Record<string, unknown> }>('/approve-project', req),
};
