import type { AgentId } from '../../types';
import type { ScenarioState } from '../../stores/useScenarioStore';

function getTransmissionEndpointAgentIds(state: ScenarioState): AgentId[] {
  const { phase, hopIndex, hopSubPhase, highlightSequence, targetAgentId } = state;
  if (phase !== 'dispatching' || !hopSubPhase) return [];

  if (hopSubPhase === 'transmitting') {
    const to = highlightSequence[hopIndex];
    if (!to) return [];
    const from = hopIndex === 0 ? 'supervisor' : highlightSequence[hopIndex - 1];
    return from ? [from, to] : [to];
  }

  if (hopSubPhase === 'returning') {
    const from = highlightSequence[highlightSequence.length - 1];
    if (!from || !targetAgentId || from === targetAgentId) return [];
    return [from, targetAgentId];
  }

  return [];
}

export function isTransmissionEndpointAgent(state: ScenarioState, agentId: AgentId): boolean {
  return getTransmissionEndpointAgentIds(state).includes(agentId);
}
