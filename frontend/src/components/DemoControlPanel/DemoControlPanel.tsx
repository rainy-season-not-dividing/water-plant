import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  Zap,
  Hand,
} from 'lucide-react';
import type { IncidentType } from '../../types/index';
import type { AutoDemoStatus } from '../../features/simulation/useAutoDemo';

export type DemoMode = 'auto' | 'manual';
export type SpeedMultiplier = 0.5 | 1 | 2;

const SCENARIO_OPTIONS: { id: IncidentType; label: string }[] = [
  { id: 'dosing_abnormal', label: '加药异常' },
  { id: 'uf_clogging', label: '超滤异常' },
  { id: 'ro_fouling', label: '反渗透指标异常' },
  { id: 'pump_overload', label: '泵组支撑异常' },
];

const SPEED_OPTIONS: SpeedMultiplier[] = [0.5, 1, 2];

export interface DemoControlPanelProps {
  isSimulationActive: boolean;
  simulationStep: number;
  totalSteps: number;
  simulationTitle: string;
  autoDemoStatus: AutoDemoStatus;
  onStartAutoDemo: (scenarioId: IncidentType) => void;
  onPauseAutoDemo: () => void;
  onResumeAutoDemo: () => void;
  onStopAutoDemo: () => void;
  onTriggerManual: (scenarioId: IncidentType) => void;
  onNextStep: () => void;
  onReset: () => void;
  onSpeedChange: (speed: SpeedMultiplier) => void;
  currentSpeed: SpeedMultiplier;
}

export function DemoControlPanel({
  isSimulationActive,
  simulationStep,
  totalSteps,
  simulationTitle,
  autoDemoStatus,
  onStartAutoDemo,
  onPauseAutoDemo,
  onResumeAutoDemo,
  onStopAutoDemo,
  onTriggerManual,
  onNextStep,
  onReset,
  onSpeedChange,
  currentSpeed,
}: DemoControlPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mode, setMode] = useState<DemoMode>('auto');
  const [selectedScenario, setSelectedScenario] = useState<IncidentType>('dosing_abnormal');

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="fixed bottom-20 left-6 z-40 flex items-center gap-2 rounded-full border border-cyan-500/40 bg-slate-950/95 px-4 py-2 text-xs font-semibold text-cyan-300 shadow-lg backdrop-blur transition-colors hover:bg-slate-900"
      >
        <Play className="h-3.5 w-3.5" />
        演示控制
        <ChevronUp className="h-3 w-3" />
      </button>
    );
  }

  const isPlaying = autoDemoStatus === 'playing';
  const isPaused = autoDemoStatus === 'paused';

  const handlePlay = () => {
    if (mode === 'auto') {
      if (isPaused) {
        onResumeAutoDemo();
      } else {
        onStartAutoDemo(selectedScenario);
      }
    } else {
      onTriggerManual(selectedScenario);
    }
  };

  const phaseLabel = isSimulationActive
    ? `第 ${simulationStep}/${totalSteps} 步 — ${simulationTitle}`
    : '就绪';

  return (
    <div className="fixed bottom-20 left-6 z-40 w-72 rounded-lg border border-cyan-500/30 bg-slate-950/95 shadow-2xl backdrop-blur">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
        <h3 className="text-xs font-semibold tracking-wide text-cyan-200">演示控制</h3>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          aria-label="折叠面板"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-3 p-3">
        {/* Scenario Selection */}
        <div>
          <label className="mb-1.5 block text-[10px] font-medium text-slate-400">场景选择</label>
          <div className="grid grid-cols-2 gap-1.5">
            {SCENARIO_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSelectedScenario(opt.id)}
                disabled={isSimulationActive}
                className={`rounded-md border px-2 py-1.5 text-[10px] font-medium transition-colors ${
                  selectedScenario === opt.id
                    ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-200'
                    : 'border-slate-700 bg-slate-900/60 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                } disabled:cursor-not-allowed disabled:opacity-40`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Mode Toggle */}
        <div>
          <label className="mb-1.5 block text-[10px] font-medium text-slate-400">模式</label>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setMode('auto')}
              disabled={isSimulationActive}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[10px] font-medium transition-colors ${
                mode === 'auto'
                  ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-200'
                  : 'border-slate-700 bg-slate-900/60 text-slate-400 hover:border-slate-600 hover:text-slate-200'
              } disabled:cursor-not-allowed disabled:opacity-40`}
            >
              <Zap className="h-3 w-3" />
              自动演示
            </button>
            <button
              type="button"
              onClick={() => setMode('manual')}
              disabled={isSimulationActive}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[10px] font-medium transition-colors ${
                mode === 'manual'
                  ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-200'
                  : 'border-slate-700 bg-slate-900/60 text-slate-400 hover:border-slate-600 hover:text-slate-200'
              } disabled:cursor-not-allowed disabled:opacity-40`}
            >
              <Hand className="h-3 w-3" />
              手动步进
            </button>
          </div>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handlePlay}
            disabled={isSimulationActive && !isPaused}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 transition-colors hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={isPlaying ? '暂停' : '播放'}
          >
            <Play className="h-3.5 w-3.5" />
          </button>
          {mode === 'auto' && isPlaying && (
            <button
              type="button"
              onClick={onPauseAutoDemo}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 bg-slate-900/60 text-slate-300 transition-colors hover:border-slate-600 hover:text-slate-100"
              aria-label="暂停"
            >
              <Pause className="h-3.5 w-3.5" />
            </button>
          )}
          {mode === 'manual' && isSimulationActive && (
            <button
              type="button"
              onClick={onNextStep}
              disabled={simulationStep >= totalSteps}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 bg-slate-900/60 text-slate-300 transition-colors hover:border-slate-600 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="下一步"
            >
              <SkipForward className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => { onStopAutoDemo(); onReset(); }}
            disabled={!isSimulationActive && autoDemoStatus === 'idle'}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 bg-slate-900/60 text-slate-300 transition-colors hover:border-slate-600 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="重置"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          {/* Speed Control */}
          <div className="ml-auto flex items-center gap-1">
            {SPEED_OPTIONS.map((speed) => (
              <button
                key={speed}
                type="button"
                onClick={() => onSpeedChange(speed)}
                className={`rounded px-1.5 py-0.5 text-[9px] font-bold transition-colors ${
                  currentSpeed === speed
                    ? 'bg-cyan-500/20 text-cyan-200'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>

        {/* Progress */}
        <div className="rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2">
          <p className="text-[10px] text-slate-300">{phaseLabel}</p>
          {isSimulationActive && (
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-cyan-500 transition-all duration-500"
                style={{ width: `${(simulationStep / totalSteps) * 100}%` }}
              />
            </div>
          )}
        </div>

        {/* Shortcut Hint */}
        <p className="text-center text-[9px] text-slate-600">
          Ctrl+1-4 快速触发场景
        </p>
      </div>
    </div>
  );
}
