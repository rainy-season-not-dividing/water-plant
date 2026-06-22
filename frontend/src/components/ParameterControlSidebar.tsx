import React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { TelemetryState } from '../types/index';

interface ParameterControlSidebarProps {
  telemetry: TelemetryState;
  setTelemetry: React.Dispatch<React.SetStateAction<TelemetryState>>;
  resetToNormal: () => void;
}

export const ParameterControlSidebar: React.FC<ParameterControlSidebarProps> = ({
  telemetry,
  setTelemetry,
  resetToNormal
}) => {
  const ufFeedback =
    telemetry.ufPressure >= 450
      ? '建议生成 CEB/反洗处置单'
      : telemetry.ufPressure > 300
        ? '进入关注区间，建议复核反洗恢复效果'
        : '处于稳态区间';
  const roFeedback =
    telemetry.roTds > 300
      ? '超出案例范围，建议复核膜保护条件'
      : '处于案例范围';
  const dosingFeedback =
    telemetry.dosingRate < 3
      ? '投加偏低，需复核阻垢保护裕度'
      : telemetry.dosingRate > 5
        ? '投加偏高，需复核药剂消耗与结垢风险'
        : '处于建议范围';
  const turbidityFeedback =
    telemetry.outletTurbidity > 1
      ? '超过 <1 NTU 目标，需关注超滤产水质量'
      : '达到 <1 NTU 目标';

  return (
    <aside
      className="col-span-12 lg:col-span-4 bg-slate-950/70 border border-slate-800 rounded-2xl p-5 space-y-5 flex flex-col min-h-0"
      id="engineering-studio-panel"
    >
      <div>
        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
          <SlidersHorizontal className="w-4 h-4 text-teal-400" />
          超滤 + 一级反渗透 参数微调
        </h3>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
          按 PPT 口径调整进水规模、产水规模、超滤 TMP、反渗透产水 TDS 和阻垢剂投加参考值。
        </p>
      </div>

      <div className="space-y-4 flex-1 overflow-y-auto pr-1">
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300 font-medium">进水规模</span>
            <span className="text-teal-400 font-mono font-bold">{telemetry.inletFlow} m3/d</span>
          </div>
          <input
            type="range"
            min="3000"
            max="5000"
            step="50"
            value={telemetry.inletFlow}
            onChange={(e) => {
              const updatedFlow = parseInt(e.target.value);
              setTelemetry(prev => ({
                ...prev,
                inletFlow: updatedFlow,
                outletFlow: Math.round(updatedFlow * 0.698)
              }));
            }}
            className="theme-slider"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300 font-medium">产水规模</span>
            <span className="text-teal-400 font-mono font-bold">{telemetry.outletFlow} m3/d</span>
          </div>
          <input
            type="range"
            min="2200"
            max="3200"
            step="50"
            value={telemetry.outletFlow}
            onChange={(e) => {
              const updatedFlow = parseInt(e.target.value);
              setTelemetry(prev => ({ ...prev, outletFlow: updatedFlow }));
            }}
            className="theme-slider"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300 font-medium">超滤产水浊度</span>
            <span className="text-teal-400 font-mono font-bold">{telemetry.outletTurbidity} NTU</span>
          </div>
          <input
            type="range"
            min="0.02"
            max="2.00"
            step="0.02"
            value={telemetry.outletTurbidity}
            onChange={(e) => {
              const updatedTurb = parseFloat(e.target.value);
              setTelemetry(prev => ({
                ...prev,
                outletTurbidity: updatedTurb,
                healthScore: updatedTurb > 1 ? 82 : 98
              }));
            }}
            className="theme-slider"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300 font-medium">阻垢剂投加量</span>
            <span className="text-teal-400 font-mono font-bold">{telemetry.dosingRate} ppm</span>
          </div>
          <input
            type="range"
            min="1.0"
            max="8.0"
            step="0.1"
            value={telemetry.dosingRate}
            onChange={(e) => {
              const updatedDosing = parseFloat(e.target.value);
              setTelemetry(prev => ({
                ...prev,
                dosingRate: updatedDosing,
                healthScore: updatedDosing > 5 || updatedDosing < 3 ? 88 : 98
              }));
            }}
            className="theme-slider"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300 font-medium">超滤 TMP</span>
            <span className="text-teal-400 font-mono font-bold">{telemetry.ufPressure} kPa</span>
          </div>
          <input
            type="range"
            min="50"
            max="500"
            step="5"
            value={telemetry.ufPressure}
            onChange={(e) => {
              const updatedPres = parseInt(e.target.value);
              setTelemetry(prev => ({
                ...prev,
                ufPressure: updatedPres,
                energyConsumption: parseFloat((0.15 + (updatedPres / 1200)).toFixed(3)),
                healthScore: updatedPres >= 450 ? 78 : updatedPres > 300 ? 86 : 98
              }));
            }}
            className="theme-slider"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300 font-medium">反渗透产水 TDS</span>
            <span className="text-teal-400 font-mono font-bold">{telemetry.roTds} mg/L</span>
          </div>
          <input
            type="range"
            min="50"
            max="500"
            step="5"
            value={telemetry.roTds}
            onChange={(e) => {
              const updatedTds = parseInt(e.target.value);
              setTelemetry(prev => ({
                ...prev,
                roTds: updatedTds,
                healthScore: updatedTds > 300 ? 84 : 98
              }));
            }}
            className="theme-slider"
          />
        </div>

        <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-800 text-[11px] text-slate-400 space-y-1">
          <p className="font-semibold text-slate-300">模拟反馈联动：</p>
          <p>1. 当前确认：进水 {telemetry.inletFlow} m3/d，产水 {telemetry.outletFlow} m3/d，综合健康度 {telemetry.healthScore}%。</p>
          <p>2. 超滤反馈：TMP {telemetry.ufPressure} kPa，{ufFeedback}。</p>
          <p>3. 反渗透反馈：产水 TDS {telemetry.roTds} mg/L，{roFeedback}。</p>
          <p>4. 加药反馈：阻垢剂 {telemetry.dosingRate.toFixed(1)} ppm，{dosingFeedback}。</p>
          <p>5. 浊度反馈：超滤产水浊度 {telemetry.outletTurbidity.toFixed(2)} NTU，{turbidityFeedback}。</p>
        </div>
      </div>

      <button
        onClick={resetToNormal}
        className="w-full py-2 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-400 font-medium text-xs hover:bg-teal-500/20 transition-all cursor-pointer"
        id="btn-sidebar-reset"
      >
        还原基准工况
      </button>
    </aside>
  );
};
