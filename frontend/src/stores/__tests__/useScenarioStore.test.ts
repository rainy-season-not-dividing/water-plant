import { describe, it, expect, beforeEach } from 'vitest';
import { useScenarioStore } from '../useScenarioStore';
import { ScenarioPhase } from '../../types/index';

describe('useScenarioStore', () => {
  beforeEach(() => {
    useScenarioStore.getState().forceIdle();
  });

  it('starts in IDLE phase with normal status', () => {
    const state = useScenarioStore.getState();
    expect(state.phase).toBe(ScenarioPhase.IDLE);
    expect(state.agentUIStatus).toBe('normal');
  });

  it('startIncident transitions to ANOMALY_DETECTED', () => {
    useScenarioStore.getState().startIncident('dosing_abnormal');
    const state = useScenarioStore.getState();
    expect(state.phase).toBe(ScenarioPhase.ANOMALY_DETECTED);
    expect(state.agentUIStatus).toBe('pending');
    expect(state.targetAgentId).toBe('dosing');
    expect(state.activeAgentId).toBe('supervisor');
    expect(state.particleIntent).toBe('anomaly');
  });

  it('startIncident does nothing if not IDLE', () => {
    useScenarioStore.getState().startIncident('dosing_abnormal');
    useScenarioStore.getState().startIncident('uf_clogging');
    const state = useScenarioStore.getState();
    expect(state.targetAgentId).toBe('dosing');
  });

  it('advancePhase progresses through phases', () => {
    useScenarioStore.getState().startIncident('ro_fouling');
    useScenarioStore.getState().advancePhase();
    expect(useScenarioStore.getState().phase).toBe(ScenarioPhase.SUPERVISOR_ANALYZING);
    expect(useScenarioStore.getState().agentUIStatus).toBe('alarm');

    useScenarioStore.getState().advancePhase();
    expect(useScenarioStore.getState().phase).toBe(ScenarioPhase.DISPATCHING);
  });

  it('advancePhase at RECOVERED does nothing', () => {
    useScenarioStore.getState().startIncident('pump_overload');
    // Advance through all phases to RECOVERED
    for (let i = 0; i < 8; i++) {
      useScenarioStore.getState().advancePhase();
    }
    expect(useScenarioStore.getState().phase).toBe(ScenarioPhase.RECOVERED);

    useScenarioStore.getState().advancePhase();
    expect(useScenarioStore.getState().phase).toBe(ScenarioPhase.RECOVERED);
  });

  it('forceIdle resets all state', () => {
    useScenarioStore.getState().startIncident('uf_clogging');
    useScenarioStore.getState().advancePhase();
    useScenarioStore.getState().forceIdle();
    const state = useScenarioStore.getState();
    expect(state.phase).toBe(ScenarioPhase.IDLE);
    expect(state.agentUIStatus).toBe('normal');
    expect(state.targetAgentId).toBeNull();
    expect(state.activeAgentId).toBeNull();
    expect(state.particleIntent).toBeNull();
  });

  it('decision steps progress with phase', () => {
    useScenarioStore.getState().startIncident('dosing_abnormal');
    expect(useScenarioStore.getState().decisionSteps[0].active).toBe(true);

    useScenarioStore.getState().advancePhase(); // SUPERVISOR_ANALYZING
    const steps = useScenarioStore.getState().decisionSteps;
    expect(steps[2].active).toBe(true);
    expect(steps[0].completed).toBe(true);
  });
});
