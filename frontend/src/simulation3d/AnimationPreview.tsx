import React, { useState } from 'react';
import { useScenarioStore } from '../stores/useScenarioStore';
import { REAL_DEVICE_FOCUS_PRESETS } from './plantAnchors';
import type { IncidentType, AgentId, CameraFocusTarget, ThinkingContent } from '../types/scenario';

/** 4 个异常演练场景 */
const SCENARIOS: { type: IncidentType; label: string; color: string }[] = [
  { type: 'dosing_abnormal', label: 'Ctrl+1 加药异常', color: '#BA7517' },
  { type: 'uf_clogging', label: 'Ctrl+2 UF 异常', color: '#1D9E75' },
  { type: 'ro_fouling', label: 'Ctrl+3 RO 指标异常', color: '#D85A30' },
  { type: 'pump_overload', label: 'Ctrl+4 泵组支撑异常', color: '#534AB7' },
];

const AGENTS: AgentId[] = ['supervisor', 'dosing', 'uf', 'ro', 'pump'];
const AGENT_LABELS: Record<AgentId, string> = {
  supervisor: '监督者',
  dosing: '加药',
  uf: '超滤',
  ro: 'RO',
  pump: '泵组',
};

/**
 * 动画预览面板（临时调试用）
 * 直接操作 Zustand Store，不修改 A 的任何代码
 * 放在 simulation3d/ 目录（B 的领地）
 */
const AnimationPreview: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);

  const phase = useScenarioStore((s) => s.phase);
  const incidentType = useScenarioStore((s) => s.incidentType);
  const thinking = useScenarioStore((s) => s.thinking);

  /* ── 场景触发 ── */
  const triggerScenario = (type: IncidentType) => {
    useScenarioStore.getState().startIncident(type);
  };

  /* ── 阶段推进 ── */
  const advance = () => {
    useScenarioStore.getState().advancePhase();
  };

  /* ── 重置 ── */
  const reset = () => {
    useScenarioStore.getState().forceIdle();
  };

  /* ── 思考气泡 ── */
  const showThinking = (agentId: AgentId) => {
    const messages: Record<AgentId, ThinkingContent> = {
      supervisor: {
        title: '监管中枢',
        text: '问题：全厂传感器异常信号\n分析：数据上送 + 根因定位\n方案：生成专项 Agent 建议',
        status: 'done',
      },
      dosing: {
        title: '加药Agent',
        text: '问题：阻垢剂投加偏离\n分析：RO 进水保护风险\n方案：建议复核 3-5 ppm',
        status: 'done',
      },
      uf: {
        title: '超滤Agent',
        text: '问题：跨膜压差持续上升\n分析：膜污染趋势加速\n方案：建议人工确认 CEB',
        status: 'done',
      },
      ro: {
        title: 'RO Agent',
        text: '问题：RO 产水 TDS 偏高\n分析：进水 SDI 偏高\n方案：复核 75% 回收率',
        status: 'done',
      },
      pump: {
        title: '泵组Agent',
        text: '问题：电流波动异常\n分析：轴承温度偏高\n方案：切换备用泵',
        status: 'done',
      },
    };
    useScenarioStore.getState().setThinking(agentId, messages[agentId]);
  };

  const hideThinking = () => {
    useScenarioStore.getState().clearThinking();
  };

  /* ── 摄像机聚焦 ── */
  const focusCamera = (agentId: AgentId, duration = 2000) => {
    // 使用预设的"设备前上方"视角，而非简单偏移设备中心
    const preset = REAL_DEVICE_FOCUS_PRESETS[agentId];
    if (!preset) return;
    const target: CameraFocusTarget = {
      position: preset.cameraPos,
      lookAt: preset.lookAt,
      duration: preset.duration ?? duration,
    };
    useScenarioStore.getState().setCameraFocus(target);
  };

  const unfocusCamera = () => {
    useScenarioStore.getState().setCameraFocus(null);
  };

  /* ── 单独动画测试 ── */
  const flashDevice = (agentId: AgentId) => {
    // 直接写 deviceFlashing
    const s = useScenarioStore.getState();
    // 通过 startIncident 触发闪烁
    if (agentId !== 'supervisor') {
      const incMap: Record<string, IncidentType> = {
        dosing: 'dosing_abnormal',
        uf: 'uf_clogging',
        ro: 'ro_fouling',
        pump: 'pump_overload',
      };
      s.startIncident(incMap[agentId]);
    }
  };

  const stopFlash = () => {
    useScenarioStore.getState().forceIdle();
  };

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed top-4 right-4 z-[100] px-3 py-1.5 bg-slate-900/95 border border-teal-500/50 text-teal-400 text-xs rounded-lg hover:bg-slate-800 transition cursor-pointer backdrop-blur-md"
      >
        动画调试
      </button>
    );
  }

  return (
    <div className="fixed top-4 right-4 z-[100] w-72 max-h-[85vh] overflow-y-auto bg-slate-950/95 border border-slate-700/80 rounded-xl shadow-2xl backdrop-blur-lg text-xs text-slate-300">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
        <span className="font-semibold text-teal-400">3D 动画调试面板</span>
        <button
          onClick={() => setCollapsed(true)}
          className="text-slate-500 hover:text-slate-300 transition cursor-pointer text-lg leading-none"
        >
          &minus;
        </button>
      </div>

      {/* State indicator */}
      <div className="px-3 py-2 border-b border-slate-800/50 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Phase:</span>
          <span className="text-teal-400 font-mono">{phase}</span>
        </div>
        {incidentType && (
          <div className="flex items-center gap-2">
            <span className="text-slate-500">场景:</span>
            <span className="text-amber-400 font-mono">{incidentType}</span>
          </div>
        )}
        {thinking && (
          <div className="flex items-center gap-2">
            <span className="text-slate-500">气泡:</span>
            <span className="text-green-400">活跃中</span>
          </div>
        )}
      </div>

      {/* ── 1. 场景触发 ── */}
      <div className="px-3 py-2 border-b border-slate-800/50">
        <div className="text-slate-500 mb-1.5 font-medium">场景触发</div>
        <div className="grid grid-cols-2 gap-1">
          {SCENARIOS.map((s) => (
            <button
              key={s.type}
              onClick={() => triggerScenario(s.type)}
              className="px-2 py-1.5 rounded text-[11px] font-medium transition cursor-pointer hover:brightness-125"
              style={{ backgroundColor: s.color + '20', border: `1px solid ${s.color}40`, color: s.color }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button
          onClick={reset}
          className="mt-1.5 w-full px-2 py-1 rounded text-[11px] bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition cursor-pointer"
        >
          重置 (forceIdle)
        </button>
      </div>

      {/* ── 2. 阶段推进 ── */}
      <div className="px-3 py-2 border-b border-slate-800/50">
        <div className="text-slate-500 mb-1.5 font-medium">
          阶段推进 <span className="text-slate-600">({phase})</span>
        </div>
        <button
          onClick={advance}
          disabled={phase === 'recovered'}
          className="w-full px-2 py-1.5 rounded text-[11px] bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
        >
          下一阶段 (advancePhase)
        </button>
      </div>

      {/* ── 3. Agent 单点测试 ── */}
      <div className="px-3 py-2 border-b border-slate-800/50">
        <div className="text-slate-500 mb-1.5 font-medium">Agent 单点测试</div>
        <div className="space-y-1">
          {AGENTS.map((id) => (
            <div key={id} className="flex items-center gap-1">
              <span className="w-10 text-[10px] text-slate-500 truncate">{AGENT_LABELS[id]}</span>
              <button
                onClick={() => showThinking(id)}
                className="flex-1 px-1.5 py-1 rounded text-[10px] bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition cursor-pointer"
              >
                气泡
              </button>
              <button
                onClick={() => focusCamera(id)}
                className="flex-1 px-1.5 py-1 rounded text-[10px] bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition cursor-pointer"
              >
                聚焦
              </button>
              {id !== 'supervisor' && (
                <button
                  onClick={() => flashDevice(id)}
                  className="flex-1 px-1.5 py-1 rounded text-[10px] bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition cursor-pointer"
                >
                  闪烁
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-1 mt-1.5">
          <button
            onClick={hideThinking}
            className="flex-1 px-2 py-1 rounded text-[10px] bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition cursor-pointer"
          >
            隐藏气泡
          </button>
          <button
            onClick={unfocusCamera}
            className="flex-1 px-2 py-1 rounded text-[10px] bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition cursor-pointer"
          >
            取消聚焦
          </button>
          <button
            onClick={stopFlash}
            className="flex-1 px-2 py-1 rounded text-[10px] bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition cursor-pointer"
          >
            停止闪烁
          </button>
        </div>
      </div>

      {/* ── 4. 完整流程快捷按钮 ── */}
      <div className="px-3 py-2 border-b border-slate-800/50">
        <div className="text-slate-500 mb-1.5 font-medium">快捷流程</div>
        <div className="grid grid-cols-2 gap-1">
          <button
            onClick={() => {
              triggerScenario('dosing_abnormal');
            }}
            className="px-2 py-1.5 rounded text-[10px] bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition cursor-pointer"
          >
            加药异常 → 自动推进
          </button>
          <button
            onClick={() => {
              triggerScenario('ro_fouling');
              setTimeout(() => showThinking('ro'), 1000);
            }}
            className="px-2 py-1.5 rounded text-[10px] bg-orange-500/10 border border-orange-500/30 text-orange-400 hover:bg-orange-500/20 transition cursor-pointer"
          >
            RO 指标异常 → 思考气泡
          </button>
        </div>
      </div>

      {/* ── 5. 使用说明 ── */}
      <div className="px-3 py-2 text-slate-600 text-[10px] leading-relaxed">
        <p>流程: 点击场景按钮 → 点"下一阶段"逐阶段推进 → 观察动画变化 → 重置。</p>
        <p className="mt-1 text-slate-700">此面板仅在 simulation3d/ 目录，不在 A 的代码范围内。</p>
      </div>
    </div>
  );
};

export default AnimationPreview;
