import { AGENT_WINDOW_DATA } from '../../data/agentWindowData';
import { DEFAULT_PLAN_ACTIONS } from '../../data/defaultPlanActions';
import type {
  AdminAgentConfig,
  AdminAgentUpdate,
  AdminPlanAction,
  AdminPlanActionCreate,
  AdminPlanActionUpdate,
} from '../../types/admin';
import type { AgentId } from '../../types';

let agents: AdminAgentConfig[] = Object.values(AGENT_WINDOW_DATA).map((agent) => ({
  ...agent,
  capabilities: [],
  enabled: true,
}));

let planActions: AdminPlanAction[] = DEFAULT_PLAN_ACTIONS.map((item) => ({ ...item }));

function wait<T>(value: T): Promise<T> {
  return new Promise((resolve) => window.setTimeout(() => resolve(value), 120));
}

export const adminMock = {
  listAgents: () => wait(agents.map((item) => ({ ...item, metrics: item.metrics.map((metric) => ({ ...metric })) }))),

  updateAgent: (agentId: string, patch: AdminAgentUpdate) => {
    const existing = agents.find((item) => item.id === agentId);
    if (!existing) throw new Error(`Unknown agent: ${agentId}`);
    const next = { ...existing, ...patch, id: agentId as AgentId };
    agents = agents.map((item) => (item.id === agentId ? next : item));
    return wait(next);
  },

  listPlanActions: () => wait(planActions.map((item) => ({ ...item }))),

  createPlanAction: (payload: AdminPlanActionCreate) => {
    const next: AdminPlanAction = {
      ...payload,
      id: `plan-action-${Date.now()}`,
    };
    planActions = [next, ...planActions];
    return wait(next);
  },

  updatePlanAction: (actionId: string, patch: AdminPlanActionUpdate) => {
    const existing = planActions.find((item) => item.id === actionId);
    if (!existing) throw new Error(`Unknown plan action: ${actionId}`);
    const next = { ...existing, ...patch };
    planActions = planActions.map((item) => (item.id === actionId ? next : item));
    return wait(next);
  },

  deletePlanAction: (actionId: string) => {
    planActions = planActions.filter((item) => item.id !== actionId);
    return wait(undefined);
  },
};
