import type { AgentId, AgentLog, AgentStatusMap, IncidentType, TelemetryState } from '../../types/index';

export interface StepPayload {
  title: string;
  description: string;
  logs: string[];
  telemetryPatch?: Partial<TelemetryState>;
  agentStatusPatch?: Partial<AgentStatusMap>;
  agentLogsPatch?: Partial<Record<AgentId, AgentLog[]>>;
  stopPlaying?: boolean;
}

export function getActiveAgentForStep(type: IncidentType | null, step: number): AgentId {
  if (!type) return 'supervisor';
  if (step === 3 || step === 4) return 'supervisor';
  if (type === 'dosing_abnormal') return 'dosing';
  if (type === 'uf_clogging') return 'uf';
  if (type === 'ro_fouling') return 'ro';
  if (type === 'pump_overload') return 'pump';
  return 'supervisor';
}

export function getScenarioMeta(incidentType: IncidentType): { title: string; detail: string } {
  if (incidentType === 'dosing_abnormal') {
    return {
      title: '加药分域复核：UF 清洗域与 RO 保护域',
      detail: '模拟加药链路波动，区分 UF 清洗加药域（CEB/CED 药剂）与 RO 保护加药域（阻垢剂），联动 UF/RO Agent 生成分域复核建议单。'
    };
  } else if (incidentType === 'uf_clogging') {
    return {
      title: 'UF TMP 异常与 RO 前置保护复核',
      detail: '模拟 UF TMP 升至 CEB 建议触发区间，按上游自清洗过滤器→物理反洗→CEB/CED→残留确认→RO 进水安全顺序联动排查。'
    };
  } else if (incidentType === 'pump_overload') {
    return {
      title: '泵组压力流量支撑能力异常',
      detail: '模拟供水泵/高压泵/反洗泵/CIP 循环泵负载波动，联动 UF 反洗和 RO 进水压力判断工艺支撑能力。'
    };
  }
  return {
    title: 'RO TDS/段间压差异常协同复核',
    detail: '模拟一级 RO 产水 TDS 与段间压差偏离，回看 UF 产水质量、阻垢剂投加和高压泵状态，协同复核膜保护条件。'
  };
}
