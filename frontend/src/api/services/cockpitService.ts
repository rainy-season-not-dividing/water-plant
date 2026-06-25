import { request } from '../client';
import type { CockpitBudgetSection, CockpitCostOverviewSection, CockpitDashboardPayload, CockpitHistoryTrendSection, CockpitOverviewSection, CockpitUnitAnalysisSection } from '../../types/cockpit';

export async function getCockpitDashboard(refresh = false): Promise<CockpitDashboardPayload> {
  return request<CockpitDashboardPayload>(`/cockpit/dashboard${refresh ? '?refresh=true' : ''}`);
}

export async function getCockpitOverview(refresh = false): Promise<CockpitOverviewSection> {
  return request<CockpitOverviewSection>(`/cockpit/overview${refresh ? '?refresh=true' : ''}`);
}

export async function getCockpitCostOverview(refresh = false): Promise<CockpitCostOverviewSection> {
  return request<CockpitCostOverviewSection>(`/cockpit/cost-overview${refresh ? '?refresh=true' : ''}`);
}

export async function getCockpitUnitAnalysis(refresh = false): Promise<CockpitUnitAnalysisSection> {
  return request<CockpitUnitAnalysisSection>(`/cockpit/unit-analysis${refresh ? '?refresh=true' : ''}`);
}

export async function getCockpitBudget(refresh = false): Promise<CockpitBudgetSection> {
  return request<CockpitBudgetSection>(`/cockpit/budget${refresh ? '?refresh=true' : ''}`);
}

export async function getCockpitHistoryTrend(rangeDays = 7, refresh = false): Promise<CockpitHistoryTrendSection> {
  const params = new URLSearchParams({ range_days: String(rangeDays) });
  if (refresh) params.set('refresh', 'true');
  return request<CockpitHistoryTrendSection>(`/cockpit/history-trend?${params.toString()}`);
}

export async function refreshCockpitDashboard(): Promise<CockpitDashboardPayload> {
  return request<CockpitDashboardPayload>('/cockpit/refresh', { method: 'POST' });
}
