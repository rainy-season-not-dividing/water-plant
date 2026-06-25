import { request } from '../client';
import type {
  CockpitCostOverviewPayload,
  CockpitDashboardPayload,
  CockpitLeadershipPayload,
  CockpitUnitAnalysisPayload,
} from '../../types/cockpit';

export async function getCockpitDashboard(refresh = false): Promise<CockpitDashboardPayload> {
  return request<CockpitDashboardPayload>(`/cockpit/dashboard${refresh ? '?refresh=true' : ''}`);
}

export async function getCockpitLeadership(refresh = false): Promise<CockpitLeadershipPayload> {
  return request<CockpitLeadershipPayload>(`/cockpit/leadership${refresh ? '?refresh=true' : ''}`);
}

export async function getCockpitCostOverview(refresh = false): Promise<CockpitCostOverviewPayload> {
  return request<CockpitCostOverviewPayload>(`/cockpit/cost-overview${refresh ? '?refresh=true' : ''}`);
}

export async function getCockpitUnitAnalysis(refresh = false): Promise<CockpitUnitAnalysisPayload> {
  return request<CockpitUnitAnalysisPayload>(`/cockpit/unit-analysis${refresh ? '?refresh=true' : ''}`);
}

export async function refreshCockpitDashboard(): Promise<CockpitDashboardPayload> {
  return request<CockpitDashboardPayload>('/cockpit/refresh', { method: 'POST' });
}
