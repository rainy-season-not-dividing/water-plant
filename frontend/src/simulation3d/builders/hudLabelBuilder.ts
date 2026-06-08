import type { Camera3D, Renderable } from '../utils/geometry3d';
import { helperHUDLabel } from '../utils/geometry3d';
import type { TelemetryState } from '../../types/index';

export function buildHUDLabels(camera: Camera3D, telemetry: TelemetryState): Renderable[] {
  const list: Renderable[] = [];

  const colorPretreat = telemetry.inletTurbidity > 25 ? '#fbbf24' : '#22d3ee';
  const statPretreat = telemetry.inletTurbidity > 25 ? '进水负荷偏高' : '水质稳定流转中';
  helperHUDLabel(-280, 0, 50, '1# 预处理单元', `进水浊度: ${telemetry.inletTurbidity.toFixed(1)} NTU`, `工况: ${statPretreat}`, colorPretreat, camera, list);
  helperHUDLabel(-180, -220, 60, '2# 阻垢剂加药单元', `料位储量: ${telemetry.chemicalLevel}%`, `投加参考: ${telemetry.dosingRate.toFixed(1)} ppm`, '#fbbf24', camera, list);
  helperHUDLabel(20, -40, 10, '3# UF 产水监测', `UF 产水浊度: ${telemetry.outletTurbidity.toFixed(3)} NTU`, '目标: <1 NTU', '#0ea5e9', camera, list);

  const colorUf = telemetry.ufPressure > 300 ? '#f43f5e' : '#38bdf8';
  const statUf = telemetry.ufPressure > 300 ? 'TMP 偏高，建议复核' : '在役稳态回收';
  helperHUDLabel(50, 220, 20, '4# UF 超滤膜组', `TMP: ${telemetry.ufPressure} kPa`, `工况: ${statUf}`, colorUf, camera, list);
  helperHUDLabel(280, 20, 60, '5# 一级 RO 膜组', `产水 TDS: ${telemetry.roTds} mg/L`, '目标: 100-300 mg/L', '#10b981', camera, list);

  return list;
}
