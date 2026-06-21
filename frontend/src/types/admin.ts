import type { AgentId, IncidentType, MetricField } from './scenario';

export interface AdminAgentConfig {
  id: AgentId;
  name: string;
  englishName: string;
  color: string;
  role: string;
  capabilities: string[];
  metrics: MetricField[];
  enabled: boolean;
}

export interface AdminPlanAction {
  id: string;
  label: string;
  defaultParameter: string;
  defaultBasis: string;
  agentIds: AgentId[];
  incidentTypes: IncidentType[];
  enabled: boolean;
  system?: boolean;
}

export type AdminAgentUpdate = Partial<Omit<AdminAgentConfig, 'id'>>;
export type AdminPlanActionCreate = Omit<AdminPlanAction, 'id'>;
export type AdminPlanActionUpdate = Partial<Omit<AdminPlanAction, 'id'>>;
