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
      title: 'RO 阻垢剂/UF 清洗加药复核',
      detail: '模拟 RO 阻垢剂或 UF 清洗加药状态异常，触发多智能体生成待人工确认的建议单。'
    };
  } else if (incidentType === 'uf_clogging') {
    return {
      title: '超滤跨膜压差过高堵塞处置',
      detail: '模拟超滤系统 TMP 升至 CEB 建议触发区间，生成反洗/CEB 人工确认建议。'
    };
  } else if (incidentType === 'pump_overload') {
    return {
      title: '泵组电流过载协同处置',
      detail: '模拟主泵电流与温升持续爬升，触发泵组智能体联动总控生成降速、备用泵切换与水力平衡建议。'
    };
  }
  return {
    title: '一级 RO 膜污染/结垢风险',
    detail: '模拟一级 RO 产水 TDS 或段间压差异常，触发膜保护与 CIP 风险建议。'
  };
}
