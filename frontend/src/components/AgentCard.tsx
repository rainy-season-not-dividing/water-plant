import React from 'react';
import { SlidersHorizontal, X, Droplet, Activity, Waves } from 'lucide-react';
import { AgentId, AgentData, CardState, AgentLog, TelemetryState } from '../types/index';

interface AgentCardProps {
  id: AgentId;
  item: Omit<AgentData, 'status' | 'logs'>;
  cardState: CardState;
  status: 'idle' | 'monitoring' | 'processing' | 'warning';
  logs: AgentLog[];
  telemetry: TelemetryState;
  setTelemetry: React.Dispatch<React.SetStateAction<TelemetryState>>;
  toggleAgentCard: (id: AgentId) => void;
  closeAgentCard?: (id: AgentId) => void;
  handleStartDrag: (e: React.MouseEvent | React.TouchEvent, id: AgentId) => void;
  setAgentLogs: React.Dispatch<React.SetStateAction<Record<AgentId, AgentLog[]>>>;
  triggerCalibrationAnimation: (agentId: AgentId) => void;
}

export const AgentCard: React.FC<AgentCardProps> = ({
  id,
  item,
  cardState,
  status,
  logs,
  telemetry,
  setTelemetry,
  toggleAgentCard,
  closeAgentCard,
  handleStartDrag,
  setAgentLogs,
  triggerCalibrationAnimation,
}) => {
  // Visual metrics theme mapping
  let cardBorderColor = 'border-teal-500/20';
  let statusText = '健康正常';
  let statusBg = 'bg-emerald-500/10 text-emerald-400';

  if (status === 'warning') {
    cardBorderColor = 'border-amber-500/40';
    statusText = '工况异常触发';
    statusBg = 'bg-amber-500/20 text-amber-400 animate-pulse';
  } else if (status === 'processing') {
    cardBorderColor = 'border-blue-500/40';
    statusText = '自适应校衡中';
    statusBg = 'bg-blue-500/20 text-blue-400';
  }

  const handleCalibrationClick = () => {
    triggerCalibrationAnimation(id);
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: `${cardState.x}%`,
        top: `${cardState.y}%`,
        zIndex: cardState.zIndex,
        width: '320px',
        maxWidth: '90vw'
      }}
      className={`bg-slate-950/90 backdrop-blur-xl rounded-xl border ${cardBorderColor} shadow-2xl overflow-hidden transition-all duration-150 transform hover:scale-[1.01] flex flex-col`}
      id={`floating-card-${id}`}
    >
      {/* Drag handle banner */}
      <div
        onMouseDown={(e) => handleStartDrag(e, id)}
        onTouchStart={(e) => handleStartDrag(e, id)}
        className="px-3.5 py-2.5 bg-slate-900/60 border-b border-slate-800/80 cursor-move flex items-center justify-between select-none"
        id={`drag-handle-${id}`}
      >
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs font-bold font-mono tracking-wider text-teal-300">
            AG-NT: {id.toUpperCase()}
          </span>
        </div>

        {/* Interactive Actions group */}
        <div className="flex items-center gap-1.5">
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold ${statusBg}`}>
            {statusText}
          </span>
          <button
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onTouchStart={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (closeAgentCard) closeAgentCard(id);
              else toggleAgentCard(id);
            }}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-850 transition-colors cursor-pointer"
            title="关闭窗口"
            aria-label={`关闭 ${item.name}`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Info body scroll content */}
      <div className="p-3.5 space-y-3.5 flex-1 select-text">

        {/* Main Description */}
        <div>
          <h4 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
            <span className="w-1.5 h-2.5 rounded-sm bg-teal-400" />
            {item.name}
          </h4>
          <h5 className="text-[10px] text-slate-400 uppercase tracking-tight font-mono mb-1.5">
            {item.englishName}
          </h5>
          <p className="text-[11px] text-slate-300 leading-relaxed bg-slate-900/40 p-2 rounded-lg border border-slate-800/40">
            {item.role}
          </p>
        </div>

        {/* Local dynamic metrics sliders within this Agent controller */}
        <div className="space-y-2">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
            核心参数控制区
          </span>
          <div className="space-y-2 bg-slate-950/60 p-2.5 rounded-lg border border-slate-900">

            {id === 'dosing' && (
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Droplet className="w-3 h-3 text-amber-500" />
                    阻垢剂投加量
                  </span>
                  <span className="text-teal-400 font-mono font-semibold">{telemetry.dosingRate} ppm</span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="8.0"
                  step="0.1"
                  value={telemetry.dosingRate}
                  onChange={(e) => setTelemetry(prev => ({ ...prev, dosingRate: parseFloat(e.target.value) }))}
                  className="theme-slider"
                />
              </div>
            )}

            {id === 'uf' && (
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Activity className="w-3 h-3 text-cyan-400" />
                    跨膜压力阻差
                  </span>
                  <span className="text-cyan-400 font-mono font-semibold">{telemetry.ufPressure} kPa</span>
                </div>
                <input
                  type="range"
                  min="40"
                  max="350"
                  step="1"
                  value={telemetry.ufPressure}
                  onChange={(e) => setTelemetry(prev => ({ ...prev, ufPressure: parseInt(e.target.value) }))}
                  className="theme-slider"
                />
              </div>
            )}

            {id === 'ro' && (
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Waves className="w-3 h-3 text-emerald-400" />
                    精滤膜瞬时通量
                  </span>
                  <span className="text-emerald-400 font-mono font-semibold">{telemetry.roFlux} LMH</span>
                </div>
                <input
                  type="range"
                  min="30.0"
                  max="100.0"
                  step="0.5"
                  value={telemetry.roFlux}
                  onChange={(e) => setTelemetry(prev => ({ ...prev, roFlux: parseFloat(e.target.value) }))}
                  className="theme-slider"
                />
              </div>
            )}

            {id === 'supervisor' && (
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-400">总管工艺在线保障</span>
                  <span className="text-indigo-400 font-mono font-semibold">{telemetry.healthScore}%</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <button
                    onClick={() => setTelemetry(prev => ({ ...prev, healthScore: Math.min(prev.healthScore + 5, 100) }))}
                    className="px-2 py-0.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-[10px] rounded transition-colors cursor-pointer"
                  >
                    校准
                  </button>
                  <span className="text-[9px] text-slate-500 italic">自主拓扑诊断在线</span>
                </div>
              </div>
            )}

            {/* Default dynamic readings */}
            <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-900 text-[10px]">
              <div>
                <span className="text-slate-500 block">节点耗电比</span>
                <span className="text-slate-300 font-mono">
                  {(telemetry.energyConsumption * (id === 'ro' ? 1.5 : id === 'uf' ? 1.2 : 0.8)).toFixed(3)} kW/m³
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">故障风险系数</span>
                <span className={`font-mono font-semibold ${status === 'warning' ? 'text-red-400' : 'text-emerald-400'}`}>
                  {status === 'warning' ? 'HIGH RISK' : 'LOW RISK'}
                </span>
              </div>
            </div>

          </div>
        </div>

        {/* Diagnostics Log Console System */}
        <div className="space-y-1.5 text-[11px]">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
            实时决策日志
          </span>
          <div className="bg-slate-950 border border-slate-900 p-2 rounded-lg max-h-[110px] overflow-y-auto font-mono space-y-1.5 scrollbar-thin text-[10px]">
            {logs.map((log) => {
              let msgColor = 'text-slate-300';
              if (log.type === 'warning') msgColor = 'text-amber-400';
              if (log.type === 'success') msgColor = 'text-emerald-400';
              if (log.type === 'error') msgColor = 'text-red-400';

              return (
                <div key={log.id} className="leading-relaxed border-b border-slate-900 pb-1 last:border-0">
                  <span className="text-slate-500 mr-1">[{log.time}]</span>
                  <span className={msgColor}>{log.message}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Interactive Manual Intervention buttons inside card */}
        <div className="pt-1 select-none flex gap-2">
          <button
            onClick={handleCalibrationClick}
            className="flex-1 py-1.5 rounded-md bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/40 text-[10px] text-teal-300 font-semibold tracking-wider uppercase transition-colors text-center cursor-pointer"
          >
            单点策略校正
          </button>
        </div>

      </div>
    </div>
  );
};
