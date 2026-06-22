import { request } from '../client';
import { AGENT_WINDOW_DATA } from '../../data/agentWindowData';
import type { AgentId, IncidentType, ScenarioLogRecord } from '../../types';

export interface ScenarioLogEventCreate {
  scenarioId: string;
  type: string;
  agentId?: string;
  incidentType?: string;
  phase?: string;
  summary?: string;
  payload?: Record<string, unknown>;
}

export interface ScenarioLogEvent {
  id: string;
  timestamp: string;
  scenarioId?: string;
  type: string;
  agentId?: string;
  incidentType?: string;
  phase?: string;
  summary?: string;
  payload?: Record<string, unknown>;
}

export interface ScenarioLogHistoryResult {
  records: ScenarioLogRecord[];
  eventCount: number;
  limit: number;
  hasMore: boolean;
}

const INCIDENT_TITLES: Record<IncidentType, string> = {
  dosing_abnormal: '加药单元检测到异常',
  uf_clogging: '超滤膜组检测到异常',
  ro_fouling: '反渗透膜组检测到异常',
  pump_overload: '泵组检测到异常',
};

const INCIDENT_TO_AGENT: Record<IncidentType, AgentId> = {
  dosing_abnormal: 'dosing',
  uf_clogging: 'uf',
  ro_fouling: 'ro',
  pump_overload: 'pump',
};

export async function createScenarioLogEvent(payload: ScenarioLogEventCreate): Promise<void> {
  try {
    await request('/logs/scenario', {
      method: 'POST',
      body: JSON.stringify({
        summary: '',
        payload: {},
        ...payload,
      }),
    });
  } catch {
    // Runtime logging must never interrupt the demo flow.
  }
}

export async function listScenarioLogEvents(params?: {
  limit?: number;
  scenarioId?: string;
}): Promise<ScenarioLogEvent[]> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.scenarioId) searchParams.set('scenarioId', params.scenarioId);
  const query = searchParams.toString();
  return request<ScenarioLogEvent[]>(`/logs/scenario${query ? `?${query}` : ''}`);
}

export async function listScenarioLogRecords(limit = 100): Promise<ScenarioLogRecord[]> {
  const events = await listScenarioLogEvents({ limit });
  return aggregateScenarioEvents(events, limit);
}

export async function listScenarioLogHistory(limit = 100): Promise<ScenarioLogHistoryResult> {
  const events = await listScenarioLogEvents({ limit });
  return {
    records: aggregateScenarioEvents(events, limit),
    eventCount: events.length,
    limit,
    hasMore: events.length >= limit && limit < 500,
  };
}

function aggregateScenarioEvents(events: ScenarioLogEvent[], limit: number): ScenarioLogRecord[] {
  const grouped = new Map<string, ScenarioLogRecord>();
  const orderedEvents = [...events].reverse();

  for (const event of orderedEvents) {
    const scenarioId = event.scenarioId;
    const incidentType = normalizeIncidentType(event.incidentType);
    if (!scenarioId || !incidentType) continue;

    const targetAgentId = normalizeAgentId(event.agentId) ?? INCIDENT_TO_AGENT[incidentType];
    const current =
      grouped.get(scenarioId) ??
      createBaseRecord({
        scenarioId,
        timestamp: event.timestamp,
        incidentType,
        targetAgentId,
        summary: event.summary,
      });

    applyEventToRecord(current, event);
    grouped.set(scenarioId, current);
  }

  return [...grouped.values()]
    .sort((a, b) => (b.sortAt ?? b.startedAt).localeCompare(a.sortAt ?? a.startedAt))
    .slice(0, limit);
}

function createBaseRecord(params: {
  scenarioId: string;
  timestamp: string;
  incidentType: IncidentType;
  targetAgentId: AgentId;
  summary?: string;
}): ScenarioLogRecord {
  const agentName = AGENT_WINDOW_DATA[params.targetAgentId]?.name ?? params.targetAgentId;
  return {
    id: params.scenarioId,
    startedAt: formatLogTime(params.timestamp),
    sortAt: params.timestamp,
    incidentTitle: params.summary || INCIDENT_TITLES[params.incidentType] || `${agentName}检测到异常`,
    incidentType: params.incidentType,
    targetAgentId: params.targetAgentId,
  };
}

function applyEventToRecord(record: ScenarioLogRecord, event: ScenarioLogEvent) {
  if (event.type === 'scenario_started' && event.summary) {
    record.incidentTitle = event.summary;
  }

  if (event.type === 'supervisor_analysis') {
    record.supervisorThinking = readPayloadText(event) ?? event.summary ?? record.supervisorThinking;
  }

  if (event.type === 'agent_analysis') {
    record.edgeAgentThinking = readPayloadText(event) ?? event.summary ?? record.edgeAgentThinking;
  }

  if (event.type === 'sandbox_result') {
    const sandboxText = readPayloadText(event);
    if (sandboxText) {
      record.edgeAgentThinking = [record.edgeAgentThinking, `沙箱推演结果：\n${sandboxText}`].filter(Boolean).join('\n\n');
    }
  }

  if (event.type === 'human_confirmation') {
    record.planResult = {
      status: 'executed',
      summary: event.summary || '已确认执行',
      detail: buildPlanDetail(event) || event.summary || '人工已确认 AI 建议，系统进入执行记录与效果回写流程。',
    };
  }

  if (event.type === 'human_rejection') {
    record.planResult = {
      status: 'rejected',
      summary: event.summary || '已驳回，未执行',
      detail: event.summary || '当前方案未执行。需要补充现场信息或重新生成处置建议后再确认。',
    };
  }
}

function readPayloadText(event: ScenarioLogEvent): string | undefined {
  const text = event.payload?.text;
  return typeof text === 'string' && text.trim() ? text : undefined;
}

function buildPlanDetail(event: ScenarioLogEvent): string | undefined {
  const actions = event.payload?.actions;
  if (!Array.isArray(actions)) return undefined;
  return actions
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;
      const action = 'action' in item && typeof item.action === 'string' ? item.action : '未填写';
      const parameter = 'parameter' in item && typeof item.parameter === 'string' ? item.parameter : '未填写';
      const basis = 'basis' in item && typeof item.basis === 'string' ? item.basis : '未填写';
      return `${index + 1}. ${action}\n参数：${parameter}\n依据：${basis}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

function normalizeIncidentType(value?: string): IncidentType | null {
  if (
    value === 'dosing_abnormal' ||
    value === 'uf_clogging' ||
    value === 'ro_fouling' ||
    value === 'pump_overload'
  ) {
    return value;
  }
  return null;
}

function normalizeAgentId(value?: string): AgentId | null {
  if (value === 'supervisor' || value === 'dosing' || value === 'uf' || value === 'ro' || value === 'pump') {
    return value;
  }
  return null;
}

function formatLogTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}
