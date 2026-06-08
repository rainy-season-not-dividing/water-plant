import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Plus, Trash2, XCircle } from 'lucide-react';
import type { AgentId, AgentUIStatus, DecisionStep, EventLogEntry, IncidentType, TelemetryState, ThinkingContent } from '../../types/index';
import { DecisionChain } from './DecisionChain';

export interface InfoPanelAgent {
  id: AgentId;
  name: string;
  status: AgentUIStatus;
}

export interface RecommendationAction {
  action: string;
  parameter: string;
  basis: string;
}

const ACTION_OPTIONS = [
  '复核 UF 上游保护状态',
  '检查自清洗过滤器',
  '评估物理反洗恢复效果',
  '调整反洗周期建议',
  '评估气水反洗条件',
  '生成 CEB/CED 条件复核',
  '评估 UF CIP 深度清洗',
  '确认 UF 清洗残留',
  '确认 RO 进水保护',
  '隔离 RO 进水建议',
  '延长 UF 清洗后冲洗',
  '复核 RO 进水与产水质量',
  '核查阻垢剂投加状态',
  '调整 RO 回收率建议',
  '降低 RO 产水负荷建议',
  '复核 RO 段间压差',
  '评估 RO CIP 条件',
  '核查 CIP 药剂兼容性',
  '复核泵组负载与温升',
  '评估降载和备用泵分担',
  '核查高压泵压力/流量',
  '核查加药泵流量',
  '校核产水规模',
  '提交监督总管冲突消解',
  '记录人工确认和处置边界',
  '效果回写与持续观察',
];

export interface InfoPanelProps {
  currentAgent: InfoPanelAgent | null;
  thinking: ThinkingContent | null;
  telemetry: TelemetryState;
  decisionSteps: DecisionStep[];
  events: EventLogEntry[];
  incidentType?: IncidentType | null;
  awaitingHumanConfirmation?: boolean;
  onConfirmHumanAction?: (actions: RecommendationAction[]) => void;
  onRejectHumanAction?: () => void;
  className?: string;
}

function buildDefaultActions(agentId: AgentId | 'supervisor', telemetry: TelemetryState, incidentType?: IncidentType | null): RecommendationAction[] {
  const common = [
    {
      action: '记录人工确认和处置边界',
      parameter: '仅记录建议，不自动下发 PLC/泵阀/反洗/CEB/CIP',
      basis: '当前系统权限策略要求所有控制动作由人工确认后执行。',
    },
    {
      action: '效果回写与持续观察',
      parameter: `产水量 ${telemetry.outletFlow} m3/d，健康度 ${telemetry.healthScore}%`,
      basis: '记录确认后指标变化，作为后续建议单闭环依据。',
    },
  ];

  if (incidentType === 'uf_clogging' || agentId === 'uf') {
    return [
      {
        action: '复核 UF 上游保护状态',
        parameter: '自清洗过滤器压差、进水浊度、UF 产水浊度',
        basis: 'UF 是 RO 前置保护，先排查上游颗粒负荷和过滤器状态。',
      },
      {
        action: '评估物理反洗恢复效果',
        parameter: `UF TMP ${telemetry.ufPressure} kPa；反洗后恢复率按现场点位填写`,
        basis: 'TMP 持续升高或反洗恢复不足时，再升级到 CEB/CED 评估。',
      },
      {
        action: '生成 CEB/CED 条件复核',
        parameter: '药剂类别、浓度、接触时间、膜材质限制',
        basis: '化学增强清洗必须确认药剂兼容性和联锁条件。',
      },
      {
        action: '确认 RO 进水保护',
        parameter: 'UF 产水浊度 <1 NTU，SDI <3，余氯/ORP 残留按现场点位确认',
        basis: 'UF 清洗恢复不等于 RO 可立即进水，需确认残留风险。',
      },
      ...common,
    ];
  }

  if (incidentType === 'ro_fouling' || agentId === 'ro') {
    return [
      {
        action: '复核 RO 进水与产水质量',
        parameter: `RO 产水 TDS ${telemetry.roTds} mg/L；目标 100-300 mg/L`,
        basis: '产水 TDS 偏高可能来自膜性能、密封、结垢或上游 UF 保护不足。',
      },
      {
        action: '核查阻垢剂投加状态',
        parameter: `阻垢剂 ${telemetry.dosingRate} ppm；一级 RO 回收率 75%`,
        basis: '结垢风险需结合 TDS、回收率、段间压差和投加状态判断。',
      },
      {
        action: '联动 UF 与泵组复核',
        parameter: 'UF 产水浊度、SDI、高压泵压力/流量',
        basis: 'RO 压差或 TDS 异常需回看 UF 前置保护和泵组运行。',
      },
      {
        action: '评估 CIP 条件',
        parameter: '污染类型、清洗剂兼容性、CIP 周期、清洗循环能力',
        basis: 'CIP 只作为恢复不足后的建议，避免过度清洗伤膜。',
      },
      ...common,
    ];
  }

  if (incidentType === 'pump_overload' || agentId === 'pump') {
    return [
      {
        action: '复核泵组负载与温升',
        parameter: `主泵电流 ${telemetry.pumpCurrent} A，温度 ${telemetry.pumpTemperature} degC`,
        basis: '判断是否存在持续过载、轴温异常或供水波动。',
      },
      {
        action: '评估降载和备用泵分担',
        parameter: `主泵转速参考 ${telemetry.pumpSpeed} rpm，备用泵分担比例按现场确认`,
        basis: '泵组调整会影响 UF/RO 进水压力和产水量，必须人工确认。',
      },
      {
        action: '校核产水规模',
        parameter: `产水量维持 ${telemetry.outletFlow} m3/d`,
        basis: '降载策略不能破坏 PPT 确认的产水规模口径。',
      },
      ...common,
    ];
  }

  if (incidentType === 'dosing_abnormal' || agentId === 'dosing') {
    return [
      {
        action: '区分 UF 清洗加药与 RO 保护加药',
        parameter: 'UF: CEB/CED、氧化剂、酸/碱清洗；RO: 阻垢剂、CIP、非氧化性膜兼容药剂',
        basis: '加药异常不能只按 RO 阻垢剂处理，必须先确认属于哪个药剂域。',
      },
      {
        action: '复核 UF 清洗药剂与残留风险',
        parameter: '药剂类别、浓度、接触时间、清洗泵状态、余氯/ORP、冲洗时间',
        basis: 'UF 氧化剂或酸碱清洗后，残留风险不能进入 RO。',
      },
      {
        action: '核查阻垢剂投加状态',
        parameter: `当前参考 ${telemetry.dosingRate} ppm；临时建议范围 3-5 ppm`,
        basis: 'RO 阻垢剂用于结垢预防，需结合回收率、进水 TDS 和段间压差判断。',
      },
      {
        action: '提交监督总管冲突消解',
        parameter: '是否隔离 RO、是否延长冲洗、是否需要现场余氯/ORP 检测',
        basis: '跨 UF/RO 的药剂残留和进水安全由监督总管汇总后交人工确认。',
      },
      ...common,
    ];
  }

  return [
    {
      action: '区分 UF 清洗加药与 RO 保护加药',
      parameter: 'UF: CEB/CED 药剂；RO: 阻垢剂/CIP/非氧化性膜兼容药剂',
      basis: '加药 Agent 不能把 UF 氧化剂清洗和 RO 阻垢剂混为一谈。',
    },
    {
      action: '复核 RO 阻垢剂投加状态',
      parameter: `当前参考 ${telemetry.dosingRate} ppm，建议范围 3-5 ppm`,
      basis: '阻垢剂用于 RO 结垢预防，需结合回收率和进水 TDS 判断。',
    },
    {
      action: '复核 UF 清洗药剂与残留风险',
      parameter: '药箱液位、加药泵流量、清洗后余氯/ORP/冲洗时间',
      basis: 'UF 氧化剂或酸碱清洗后，残留风险不能进入 RO。',
    },
    {
      action: '提交监督总管进行 RO 隔离判断',
      parameter: '是否隔离 RO、是否延长冲洗、是否需要现场检测',
      basis: '跨 UF/RO 的药剂风险由监督总管汇总后交人工确认。',
    },
    ...common,
  ];
}

export function InfoPanel({
  currentAgent,
  thinking,
  telemetry,
  decisionSteps,
  events,
  incidentType = null,
  awaitingHumanConfirmation = false,
  onConfirmHumanAction,
  onRejectHumanAction,
  className = '',
}: InfoPanelProps) {
  const thinkingRef = useRef<HTMLDivElement>(null);
  const actionAgentId = currentAgent?.id ?? 'supervisor';
  const [actions, setActions] = useState<RecommendationAction[]>(() => buildDefaultActions(actionAgentId, telemetry, incidentType));

  useEffect(() => {
    if (awaitingHumanConfirmation) {
      setActions(buildDefaultActions(actionAgentId, telemetry, incidentType));
    }
  }, [actionAgentId, awaitingHumanConfirmation, incidentType]);

  useEffect(() => {
    const scrollToBottom = () => {
      if (!thinkingRef.current) return;
      thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight;
    };
    scrollToBottom();
    const frame = requestAnimationFrame(scrollToBottom);
    return () => cancelAnimationFrame(frame);
  }, [thinking?.text]);

  const updateAction = (index: number, patch: Partial<RecommendationAction>) => {
    setActions((prev) => prev.map((entry, itemIndex) => (itemIndex === index ? { ...entry, ...patch } : entry)));
  };

  return (
    <aside className={`flex min-h-0 flex-col gap-[var(--spacing-gap)] overflow-hidden border-l border-[var(--color-border-default)] bg-[var(--color-surface-overlay)] p-[var(--spacing-panel)] text-slate-100 ${className}`}>
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Current Agent</h2>
        {currentAgent ? (
          <div className="mt-2 rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-slate-900/60 p-[var(--spacing-card)]">
            <p className="text-sm font-semibold">{currentAgent.name}</p>
            <p className="mt-1 text-xs capitalize text-slate-400">{currentAgent.status}</p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">No active agent</p>
        )}
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Thinking</h2>
        {thinking ? (
          <div ref={thinkingRef} className="mt-2 h-48 overflow-y-auto space-y-2 rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-slate-900/60 p-[var(--spacing-card)]">
            <p className="text-sm font-semibold">{thinking.title}</p>
            <p className="whitespace-pre-wrap text-xs leading-5 text-slate-300">
              {thinking.text}
              {thinking.status === 'streaming' && (
                <span className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse align-middle bg-cyan-400" />
              )}
            </p>
            {thinking.status === 'error' && (
              <p className="text-xs text-red-400">分析未完整返回，请检查后端连接或稍后重试</p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Idle</p>
        )}

        {awaitingHumanConfirmation && (
          <div className="mt-3 rounded-[var(--radius-card)] border border-amber-500/40 bg-amber-950/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-amber-200">处置步骤建议，等待人工确认</p>
              <button
                type="button"
                onClick={() => setActions((prev) => [...prev, { action: ACTION_OPTIONS[0], parameter: '填写操作参数或目标值', basis: '填写触发依据和风险说明' }])}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
                title="新增操作"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
              {actions.map((item, index) => (
                <div key={index} className="rounded-md border border-amber-500/20 bg-slate-950/45 p-2">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase text-amber-300">步骤 {index + 1}</span>
                    <button
                      type="button"
                      onClick={() => setActions((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
                      className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
                      title="删除操作"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <select
                    value={item.action}
                    onChange={(event) => updateAction(index, { action: event.target.value })}
                    className="mb-1 w-full rounded border border-slate-700 bg-slate-950/80 px-2 py-1 text-xs font-semibold text-slate-100 outline-none focus:border-amber-400"
                  >
                    {ACTION_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <input
                    value={item.parameter}
                    onChange={(event) => updateAction(index, { parameter: event.target.value })}
                    className="mb-1 w-full rounded border border-slate-700 bg-slate-950/80 px-2 py-1 text-[11px] text-cyan-100 outline-none focus:border-cyan-400"
                  />
                  <textarea
                    value={item.basis}
                    onChange={(event) => updateAction(index, { basis: event.target.value })}
                    rows={2}
                    className="w-full resize-none rounded border border-slate-700 bg-slate-950/80 px-2 py-1 text-[11px] leading-4 text-slate-300 outline-none focus:border-slate-400"
                  />
                </div>
              ))}
            </div>

            <p className="mt-2 text-[11px] leading-5 text-slate-300">
              反洗、CEB、CIP、加药和泵阀控制不会自动执行。确认后仅进入执行记录/效果回写流程。
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onConfirmHumanAction?.(actions)}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25 focus:outline-none focus:ring-1 focus:ring-emerald-400"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                人工确认执行
              </button>
              <button
                type="button"
                onClick={onRejectHumanAction}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-600 bg-slate-900/80 px-2.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400"
              >
                <XCircle className="h-3.5 w-3.5" />
                驳回/需复核
              </button>
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Decision Chain</h2>
        <DecisionChain steps={decisionSteps} />
      </section>

      <section className="min-h-0 flex-1 overflow-hidden">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Event Log</h2>
        <div className="mt-2 h-full min-h-0 space-y-2 overflow-y-auto pb-2">
          {events.map((event) => (
            <article key={event.id} className="rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-slate-900/50 p-2 text-xs">
              <p className="text-slate-500">{event.time}</p>
              <p className="mt-1 text-slate-200">{event.text}</p>
            </article>
          ))}
        </div>
      </section>
    </aside>
  );
}
