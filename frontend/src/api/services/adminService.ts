import { request } from '../client';
import type {
  AdminAgentConfig,
  AdminAgentUpdate,
  AdminPlanAction,
  AdminPlanActionCreate,
  AdminPlanActionUpdate,
} from '../../types/admin';

export async function listAdminAgents(): Promise<AdminAgentConfig[]> {
  return request<AdminAgentConfig[]>('/admin/agents');
}

export async function updateAdminAgent(agentId: string, patch: AdminAgentUpdate): Promise<AdminAgentConfig> {
  return request<AdminAgentConfig>(`/admin/agents/${agentId}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export async function listPlanActions(): Promise<AdminPlanAction[]> {
  return request<AdminPlanAction[]>('/admin/plan-actions');
}

export async function createPlanAction(payload: AdminPlanActionCreate): Promise<AdminPlanAction> {
  return request<AdminPlanAction>('/admin/plan-actions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updatePlanAction(actionId: string, patch: AdminPlanActionUpdate): Promise<AdminPlanAction> {
  return request<AdminPlanAction>(`/admin/plan-actions/${actionId}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export async function deletePlanAction(actionId: string): Promise<void> {
  await request<{ ok: boolean }>(`/admin/plan-actions/${actionId}`, { method: 'DELETE' });
}
