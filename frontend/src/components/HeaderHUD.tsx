import React, { useMemo } from 'react';
import { Layers3, Settings, Waves, Cpu, Gauge, RotateCcw, AlertTriangle, Heart } from 'lucide-react';
import { AnomalySimulation, TelemetryState } from '../types/index';
import { useCountUp } from '../hooks/useCountUp';

interface HeaderHUDProps {
  simulation: AnomalySimulation;
  telemetry: TelemetryState;
  currentTime: string;
  resetToNormal: () => void;
  hasOpenAgentWindows: boolean;
  onOpenAllAgents: () => void;
  onCloseAllAgents: () => void;
}

export const HeaderHUD: React.FC<HeaderHUDProps> = ({
  simulation,
  telemetry,
  currentTime,
  resetToNormal,
  hasOpenAgentWindows,
  onOpenAllAgents,
  onCloseAllAgents,
}) => {
  const animatedAgents = useCountUp(telemetry.activeAgentsCount, { duration: 500, decimals: 0 });
  const animatedOnlineRate = useCountUp(telemetry.onlineRate, { duration: 700, decimals: telemetry.onlineRate === 100 ? 0 : 1 });
  const animatedHealth = useCountUp(telemetry.healthScore, { duration: 800, decimals: 1 });

  const healthColor = useMemo(() => {
    if (telemetry.healthScore >= 90) return 'text-emerald-400';
    if (telemetry.healthScore >= 70) return 'text-amber-400';
    return 'text-rose-400';
  }, [telemetry.healthScore]);

  const healthLabel = useMemo(() => {
    if (telemetry.healthScore >= 90) return '优良';
    if (telemetry.healthScore >= 70) return '注意';
    return '告警';
  }, [telemetry.healthScore]);

  const isAlarming = telemetry.healthScore < 70;
  return (
    <header 
      className="relative z-10 mx-4 mt-4 bg-slate-900/40 backdrop-blur-md border border-slate-800/60 rounded-xl"
      id="hud-header"
    >
      <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-4">
        
        {/* Logo & Platform Info */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-lg bg-teal-500/10 border border-teal-500/30 group">
            <div className="absolute inset-0 rounded-lg bg-teal-500/20 blur opacity-40 group-hover:opacity-100 transition-opacity" />
            <Waves className="w-5 h-5 text-teal-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 font-semibold text-teal-400 bg-teal-500/10 border border-teal-500/20 rounded">PRO-SYSTEM</span>
              <h1 className="text-lg font-extrabold tracking-wide bg-gradient-to-r from-slate-100 via-teal-100 to-teal-400 bg-clip-text text-transparent">
                未来水厂智能运营系统
              </h1>
            </div>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">
              Future Water Plant Intelligent Operations System
            </p>
          </div>
        </div>

        {/* Quick HUD Variables (System Diagnostics readouts) */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-mono">
          <div className="flex items-center gap-2 px-3 py-1 bg-slate-950/40 border border-slate-800 rounded-md">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            <span className="text-slate-400 text-[11px]">当前模式:</span>
            <span className="text-slate-200 font-semibold flex items-center gap-1">
              {simulation.active ? (
                <span className="text-amber-400 flex items-center gap-1 font-semibold animate-pulse">
                  <AlertTriangle className="w-3 object-contain h-3 text-amber-500" />
                  仿真链路调度
                </span>
              ) : (
                '全域自适巡检'
              )}
            </span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1 bg-slate-950/40 border border-slate-800 rounded-md">
            <Cpu className="w-3.5 h-3.5 text-teal-400" />
            <span className="text-slate-400 text-[11px]">活跃智能体:</span>
            <span className="text-emerald-400 font-bold tabular-nums transition-colors duration-500">{animatedAgents}</span>
            <span className="text-slate-500 text-[9px] px-1 py-0.2 bg-teal-500/10 rounded">Active</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1 bg-slate-950/40 border border-slate-800 rounded-md">
            <Gauge className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-slate-400 text-[11px]">设备在线率:</span>
            <span className="text-indigo-400 font-bold tabular-nums transition-colors duration-500">{animatedOnlineRate}%</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1 bg-slate-950/40 border border-slate-800 rounded-md">
            <Heart className={`w-3.5 h-3.5 ${healthColor} ${isAlarming ? 'animate-pulse' : ''}`} />
            <span className="text-slate-400 text-[11px]">健康度:</span>
            <span className={`font-bold tabular-nums transition-colors duration-700 ${healthColor} ${isAlarming ? 'animate-pulse scale-110' : ''}`}>
              {animatedHealth}
            </span>
            <span className={`text-[9px] px-1 py-0.5 rounded transition-colors duration-700 ${
              telemetry.healthScore >= 90 ? 'bg-emerald-500/10 text-emerald-400' :
              telemetry.healthScore >= 70 ? 'bg-amber-500/10 text-amber-400' :
              'bg-rose-500/10 text-rose-400'
            }`}>{healthLabel}</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1 bg-slate-950/40 border border-slate-800 rounded-md">
            <span className="text-slate-400 text-[11px]">环境时序:</span>
            <span className="text-slate-100 font-bold select-none">{currentTime}</span>
          </div>
        </div>

        {/* Preset trigger controls */}
        <div className="flex items-center gap-2">
          <button 
            onClick={resetToNormal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-white hover:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 transition-all cursor-pointer"
            title="复位环境数据与智能体状态"
            id="btn-reset-normal"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>系统重置</span>
          </button>
          <a
            href="/admin"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-300 transition-all hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
            title="进入后台管理系统"
          >
            <Settings className="h-3.5 w-3.5" />
            <span>后台管理</span>
          </a>
          <button
            onClick={hasOpenAgentWindows ? onCloseAllAgents : onOpenAllAgents}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              hasOpenAgentWindows
                ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
                : 'bg-teal-500/10 border border-teal-500/30 text-teal-400 hover:bg-teal-500/20'
            }`}
            title={hasOpenAgentWindows ? "一键关闭所有智能体控制面板" : "一键平铺展开所有智能体控制面板"}
            id="btn-expand-all"
          >
            <span className="inline-flex items-center gap-1.5">
              <Layers3 className="h-3.5 w-3.5" />
              {hasOpenAgentWindows ? "一键关闭" : "一键展开"}
            </span>
          </button>
        </div>

      </div>
    </header>
  );
};
