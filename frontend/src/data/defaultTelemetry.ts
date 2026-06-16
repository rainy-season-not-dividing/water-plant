import type { TelemetryState } from '../types/index';

export const DEFAULT_TELEMETRY: TelemetryState = {
  inletFlow: 4300,
  outletFlow: 3000,
  inletTurbidity: 10,
  outletTurbidity: 0.08,
  dosingRate: 4.0,
  chemicalLevel: 72,
  ufPressure: 82,
  roPressureDiff: 0.45,
  roFlux: 75,
  roTds: 180,
  roFlushMode: 'ready',
  roRecoveryTime: 0,
  pumpSpeed: 1480,
  pumpCurrent: 28,
  pumpTemperature: 55,
  pumpStatus: 'normal',
  energyConsumption: 0.22,
  healthScore: 98,
  activeAgentsCount: 5,
  onlineRate: 100
};
