import { describe, it, expect } from 'vitest';
import { applyDosingStep, applyUfStep, applyRoStep, applyPumpStep } from '../stepAppliers';
import type { AgentId, AgentStatusMap, AgentLog, TelemetryState } from '../../../types/index';

function createTelemetry(): TelemetryState {
  return {
    inletTurbidity: 12.0,
    outletTurbidity: 0.08,
    dosingRate: 4.8,
    chemicalLevel: 75,
    ufPressure: 82,
    roFlux: 75.2,
    pumpCurrent: 28,
    pumpTemperature: 55,
    pumpStatus: 'normal',
    healthScore: 98,
    onlineRate: 99.5,
    energyConsumption: 0.22,
  } as TelemetryState;
}

function createStatuses(): AgentStatusMap {
  return { supervisor: 'monitoring', dosing: 'monitoring', uf: 'monitoring', ro: 'monitoring', pump: 'monitoring' };
}

function createLogs(): Record<AgentId, AgentLog[]> {
  return { supervisor: [], dosing: [], uf: [], ro: [], pump: [] };
}

describe('stepAppliers', () => {
  describe('applyDosingStep', () => {
    it('step 1 sets turbidity and dosing agent to warning', () => {
      const t = createTelemetry();
      const s = createStatuses();
      const l = createLogs();
      let title = '';
      let desc = '';
      let logs: string[] = [];

      applyDosingStep(1, '10:00', t, s, l, [], (v) => { title = v; }, (v) => { desc = v; }, (v) => { logs = v; });

      expect(t.outletTurbidity).toBe(1.6);
      expect(t.dosingRate).toBe(2.6);
      expect(t.chemicalLevel).toBe(38);
      expect(s.dosing).toBe('warning');
      expect(title).toContain('步骤1');
      expect(desc).toContain('UF 清洗加药');
      expect(desc.length).toBeGreaterThan(0);
      expect(logs.length).toBeGreaterThan(0);
    });

    it('step 8 restores system to normal', () => {
      const t = createTelemetry();
      const s = createStatuses();
      const l = createLogs();
      let title = '';

      applyDosingStep(8, '10:00', t, s, l, [], (v) => { title = v; }, () => {}, () => {});

      expect(title).toContain('步骤8');
      expect(s.dosing).toBe('monitoring');
    });
  });

  describe('applyUfStep', () => {
    it('step 1 sets UF agent to warning', () => {
      const t = createTelemetry();
      const s = createStatuses();
      const l = createLogs();
      let title = '';

      applyUfStep(1, '10:00', t, s, l, [], (v) => { title = v; }, () => {}, () => {});

      expect(s.uf).toBe('warning');
      expect(title).toContain('步骤1');
    });
  });

  describe('applyRoStep', () => {
    it('step 1 sets RO agent to warning', () => {
      const t = createTelemetry();
      const s = createStatuses();
      const l = createLogs();
      let title = '';

      applyRoStep(1, '10:00', t, s, l, [], (v) => { title = v; }, () => {}, () => {});

      expect(s.ro).toBe('warning');
      expect(title).toContain('步骤1');
    });
  });

  describe('applyPumpStep', () => {
    it('step 1 sets pump agent to warning', () => {
      const t = createTelemetry();
      const s = createStatuses();
      const l = createLogs();
      let title = '';

      applyPumpStep(1, '10:00', t, s, l, [], (v) => { title = v; }, () => {}, () => {});

      expect(s.pump).toBe('warning');
      expect(title).toContain('步骤1');
    });
  });
});
