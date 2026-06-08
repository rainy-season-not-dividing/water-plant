import type { Device } from '../../types/index';

export const MOCK_DEVICES: Device[] = [
  {
    id: 'pump-001',
    name: '进水泵 1#',
    type: 'pump',
    status: 'running',
    metrics: [
      { key: 'flow_rate', label: '流量', value: 1240, unit: 'm³/h' },
      { key: 'current', label: '电流', value: 28, unit: 'A' },
      { key: 'temperature', label: '温度', value: 55, unit: '°C' },
    ],
    simulationNodeId: 'pump-001',
  },
  {
    id: 'dosing-001',
    name: '加药装置 1#',
    type: 'dosing-unit',
    status: 'running',
    metrics: [
      { key: 'dosing_rate', label: '投加量', value: 4.8, unit: 'mg/L' },
      { key: 'chemical_level', label: '药液液位', value: 72, unit: '%' },
    ],
    simulationNodeId: 'dosing-001',
  },
  {
    id: 'uf-001',
    name: '超滤膜组 1#',
    type: 'filter',
    status: 'running',
    metrics: [
      { key: 'pressure', label: '跨膜压差', value: 82, unit: 'kPa' },
    ],
    simulationNodeId: 'uf-001',
  },
  {
    id: 'ro-001',
    name: '反渗透膜组 1#',
    type: 'filter',
    status: 'running',
    metrics: [
      { key: 'pressure_diff', label: '压差', value: 0.45, unit: 'MPa' },
      { key: 'flux', label: '产水通量', value: 75.2, unit: 'L/m²·h' },
      { key: 'tds', label: '产水 TDS', value: 180, unit: 'mg/L' },
    ],
    simulationNodeId: 'ro-001',
  },
];
