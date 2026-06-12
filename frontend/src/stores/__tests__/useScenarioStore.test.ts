import { describe, it, expect, beforeEach } from 'vitest';
import { useScenarioStore } from '../useScenarioStore';
import { ScenarioPhase } from '../../types/index';

/** 完成 DISPATCHING 阶段的所有跳（含闭环回传）：逐个 transmit→scan 直到自动进入下一 phase */
function completeAllHops() {
  const { highlightSequence } = useScenarioStore.getState();
  for (let i = 0; i < highlightSequence.length; i++) {
    useScenarioStore.getState().advanceHop(); // transmitting → scanning
    useScenarioStore.getState().advanceHop(); // scanning → next transmitting / returning / auto advance
  }
  // 如果进入了 returning 阶段，再推一次完成闭环
  if (useScenarioStore.getState().hopSubPhase === 'returning') {
    useScenarioStore.getState().advanceHop(); // returning → auto advance
  }
}

describe('useScenarioStore', () => {
  beforeEach(() => {
    useScenarioStore.getState().forceIdle();
  });

  it('starts in IDLE phase with normal status', () => {
    const state = useScenarioStore.getState();
    expect(state.phase).toBe(ScenarioPhase.IDLE);
    expect(state.agentUIStatus).toBe('normal');
    expect(state.highlightSequence).toEqual([]);
    expect(state.highlightIndex).toBe(0);
  });

  it('startIncident transitions to ANOMALY_DETECTED with highlight sequence', () => {
    useScenarioStore.getState().startIncident('dosing_abnormal');
    const state = useScenarioStore.getState();
    expect(state.phase).toBe(ScenarioPhase.ANOMALY_DETECTED);
    expect(state.agentUIStatus).toBe('pending');
    expect(state.targetAgentId).toBe('dosing');
    expect(state.activeAgentId).toBe('supervisor');
    expect(state.particleIntent).toBe('anomaly');
    expect(state.highlightSequence).toEqual(['dosing', 'uf', 'ro']);
    expect(state.highlightIndex).toBe(0);
    expect(state.flashingDeviceId).toBe('dosing');
  });

  it('startIncident does nothing if not IDLE', () => {
    useScenarioStore.getState().startIncident('dosing_abnormal');
    useScenarioStore.getState().startIncident('uf_clogging');
    const state = useScenarioStore.getState();
    expect(state.targetAgentId).toBe('dosing');
  });

  it('advancePhase progresses through phases with highlight changes', () => {
    useScenarioStore.getState().startIncident('ro_fouling');
    expect(useScenarioStore.getState().highlightSequence).toEqual(['ro', 'uf', 'dosing', 'pump']);

    useScenarioStore.getState().advancePhase(); // SUPERVISOR_ANALYZING
    expect(useScenarioStore.getState().phase).toBe(ScenarioPhase.SUPERVISOR_ANALYZING);
    expect(useScenarioStore.getState().agentUIStatus).toBe('alarm');

    useScenarioStore.getState().advancePhase(); // DISPATCHING
    expect(useScenarioStore.getState().phase).toBe(ScenarioPhase.DISPATCHING);
    expect(useScenarioStore.getState().hopIndex).toBe(0);
    expect(useScenarioStore.getState().hopSubPhase).toBe('transmitting');
    expect(useScenarioStore.getState().highlightIndex).toBe(0);
    expect(useScenarioStore.getState().flashingDeviceId).toBeNull();
    expect(useScenarioStore.getState().particleIntent).toBe('dispatch');

    // advanceHop: transmitting → scanning
    useScenarioStore.getState().advanceHop();
    expect(useScenarioStore.getState().hopSubPhase).toBe('scanning');
    expect(useScenarioStore.getState().flashingDeviceId).toBe('ro');
    expect(useScenarioStore.getState().particleIntent).toBeNull();

    // advanceHop: scanning → 下一跳 transmitting
    useScenarioStore.getState().advanceHop();
    expect(useScenarioStore.getState().hopIndex).toBe(1);
    expect(useScenarioStore.getState().hopSubPhase).toBe('transmitting');
    expect(useScenarioStore.getState().highlightIndex).toBe(1);
    expect(useScenarioStore.getState().flashingDeviceId).toBeNull();
    expect(useScenarioStore.getState().particleIntent).toBe('dispatch');

    // 手动推进（hops 未完成，advancePhase 被阻止）
    useScenarioStore.getState().advancePhase();
    expect(useScenarioStore.getState().phase).toBe(ScenarioPhase.DISPATCHING);

    // 完成剩余 hops → 自动进入 AGENT_ANALYZING
    useScenarioStore.getState().advanceHop(); // transmitting → scanning (hop 1)
    useScenarioStore.getState().advanceHop(); // scanning → hop 2 transmitting
    useScenarioStore.getState().advanceHop(); // transmitting → scanning (hop 2)
    useScenarioStore.getState().advanceHop(); // scanning → hop 3 transmitting
    useScenarioStore.getState().advanceHop(); // transmitting → scanning (hop 3)
    useScenarioStore.getState().advanceHop(); // scanning → returning (last!=target)
    useScenarioStore.getState().advanceHop(); // returning → auto advance
    expect(useScenarioStore.getState().phase).toBe(ScenarioPhase.AGENT_ANALYZING);
    expect(useScenarioStore.getState().hopSubPhase).toBeNull();
    expect(useScenarioStore.getState().flashingDeviceId).toBeNull();
  });

  it('HUMAN_CONFIRMING clears flashingDeviceId', () => {
    useScenarioStore.getState().startIncident('uf_clogging');
    useScenarioStore.getState().advancePhase(); // SUPERVISOR_ANALYZING
    useScenarioStore.getState().advancePhase(); // DISPATCHING
    completeAllHops(); // → AGENT_ANALYZING
    useScenarioStore.getState().advancePhase(); // HUMAN_CONFIRMING
    expect(useScenarioStore.getState().phase).toBe(ScenarioPhase.HUMAN_CONFIRMING);
    expect(useScenarioStore.getState().flashingDeviceId).toBeNull();
  });

  it('advancePhase at RECOVERED does nothing', () => {
    useScenarioStore.getState().startIncident('pump_overload');
    useScenarioStore.getState().advancePhase(); // SUPERVISOR_ANALYZING
    useScenarioStore.getState().advancePhase(); // DISPATCHING
    completeAllHops(); // → AGENT_ANALYZING
    // AGENT_ANALYZING → HUMAN_CONFIRMING → EXECUTING → DEVICE_OPERATING → RECOVERING → RECOVERED
    for (let i = 0; i < 5; i++) {
      useScenarioStore.getState().advancePhase();
    }
    expect(useScenarioStore.getState().phase).toBe(ScenarioPhase.RECOVERED);
    expect(useScenarioStore.getState().highlightSequence).toEqual([]);

    useScenarioStore.getState().advancePhase();
    expect(useScenarioStore.getState().phase).toBe(ScenarioPhase.RECOVERED);
  });

  it('forceIdle resets all state including highlights', () => {
    useScenarioStore.getState().startIncident('uf_clogging');
    useScenarioStore.getState().advancePhase();
    useScenarioStore.getState().forceIdle();
    const state = useScenarioStore.getState();
    expect(state.phase).toBe(ScenarioPhase.IDLE);
    expect(state.agentUIStatus).toBe('normal');
    expect(state.targetAgentId).toBeNull();
    expect(state.activeAgentId).toBeNull();
    expect(state.particleIntent).toBeNull();
    expect(state.highlightSequence).toEqual([]);
    expect(state.highlightIndex).toBe(0);
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
