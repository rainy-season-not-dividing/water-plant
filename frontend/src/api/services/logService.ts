import { request } from '../client';

export interface ScenarioLogEventCreate {
  scenarioId: string;
  type: string;
  agentId?: string;
  incidentType?: string;
  phase?: string;
  summary?: string;
  payload?: Record<string, unknown>;
}

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
