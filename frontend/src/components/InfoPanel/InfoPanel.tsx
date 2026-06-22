import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, Plus, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import type { AgentId, AgentUIStatus, DecisionStep, EventLogEntry, IncidentType, TelemetryState, ThinkingContent } from '../../types/index';
import { listPlanActions } from '../../api/services/adminService';
import type { AdminPlanAction } from '../../types/admin';
import type { SandboxValidationResult } from '../../features/sandbox/sandboxSkill';
import type { SandboxStreamStatus } from '../../features/sandbox/useSandboxValidation';
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

const AGENT_STATUS_LABEL: Record<AgentUIStatus, string> = {
  normal: '正常巡检',
  pending: '待确认',
  alarm: '告警分析',
  recovering: '恢复中',
};

const FALLBACK_ACTION_OPTIONS = [
  '复核 超滤上游保护状态',
  '检查自清洗过滤器',
  '评估物理反洗恢复效果',
  '调整反洗周期建议',
  '评估气水反洗条件',
  '生成 CEB/CED 条件复核',
  '评估 超滤 CIP 深度清洗',
  '确认 超滤清洗残留',
  '确认 反渗透进水保护',
  '隔离 反渗透进水建议',
  '延长 超滤清洗后冲洗',
  '复核 反渗透进水与产水质量',
  '核查阻垢剂投加状态',
  '调整 反渗透回收率建议',
  '降低 反渗透产水负荷建议',
  '复核 反渗透段间压差',
  '评估 反渗透 CIP 条件',
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

function actionFromPlanAction(item: AdminPlanAction): RecommendationAction {
  return {
    action: item.label,
    parameter: item.defaultParameter,
    basis: item.defaultBasis,
  };
}

function buildActionsFromPlanLibrary(
  items: AdminPlanAction[],
  agentId: AgentId | 'supervisor',
  incidentType?: IncidentType | null,
): RecommendationAction[] {
  const filtered = items.filter((item) => {
    if (!item.enabled) return false;
    const matchesAgent = item.agentIds.length === 0 || item.agentIds.includes(agentId as AgentId);
    const matchesIncident = !incidentType || item.incidentTypes.length === 0 || item.incidentTypes.includes(incidentType);
    return matchesAgent && matchesIncident;
  });
  return filtered.map(actionFromPlanAction);
}

export interface InfoPanelProps {
  currentAgent: InfoPanelAgent | null;
  thinking: ThinkingContent | null;
  telemetry: TelemetryState;
  decisionSteps: DecisionStep[];
  events: EventLogEntry[];
  incidentType?: IncidentType | null;
  sandboxValidation?: SandboxValidationResult | null;
  sandboxStatus?: SandboxStreamStatus;
  sandboxText?: string;
  awaitingHumanConfirmation?: boolean;
  readOnly?: boolean;
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
        action: '复核 超滤上游保护状态',
        parameter: '自清洗过滤器压差、进水浊度、超滤产水浊度',
        basis: '超滤是 反渗透前置保护，先排查上游颗粒负荷和过滤器状态。',
      },
      {
        action: '评估物理反洗恢复效果',
        parameter: `超滤 TMP ${telemetry.ufPressure} kPa；反洗后恢复率按现场点位填写`,
        basis: 'TMP 持续升高或反洗恢复不足时，再升级到 CEB/CED 评估。',
      },
      {
        action: '生成 CEB/CED 条件复核',
        parameter: '药剂类别、浓度、接触时间、膜材质限制',
        basis: '化学增强清洗必须确认药剂兼容性和联锁条件。',
      },
      {
        action: '确认 反渗透进水保护',
        parameter: '超滤产水浊度 <1 NTU，SDI <3，余氯/ORP 残留按现场点位确认',
        basis: '超滤清洗恢复不等于 反渗透可立即进水，需确认残留风险。',
      },
      ...common,
    ];
  }

  if (incidentType === 'ro_fouling' || agentId === 'ro') {
    return [
      {
        action: '复核 反渗透进水与产水质量',
        parameter: `反渗透产水 TDS ${telemetry.roTds} mg/L；目标 100-300 mg/L`,
        basis: '产水 TDS 偏高可能来自膜性能、密封、结垢或上游 超滤 保护不足。',
      },
      {
        action: '核查阻垢剂投加状态',
        parameter: `阻垢剂 ${telemetry.dosingRate} ppm；一级反渗透 回收率 75%`,
        basis: '结垢风险需结合 TDS、回收率、段间压差和投加状态判断。',
      },
      {
        action: '联动 超滤 与泵组复核',
        parameter: '超滤产水浊度、SDI、高压泵压力/流量',
        basis: '反渗透压差或 TDS 异常需回看 超滤前置保护和泵组运行。',
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
        basis: '泵组调整会影响 超滤/反渗透 进水压力和产水量，必须人工确认。',
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
        action: '区分 超滤清洗加药与 反渗透保护加药',
        parameter: '超滤: CEB/CED、氧化剂、酸/碱清洗；反渗透: 阻垢剂、CIP、非氧化性膜兼容药剂',
        basis: '加药异常不能只按 反渗透阻垢剂处理，必须先确认属于哪个药剂域。',
      },
      {
        action: '复核 超滤清洗药剂与残留风险',
        parameter: '药剂类别、浓度、接触时间、清洗泵状态、余氯/ORP、冲洗时间',
        basis: '超滤氧化剂或酸碱清洗后，残留风险不能进入 反渗透。',
      },
      {
        action: '核查阻垢剂投加状态',
        parameter: `当前参考 ${telemetry.dosingRate} ppm；临时建议范围 3-5 ppm`,
        basis: '反渗透阻垢剂用于结垢预防，需结合回收率、进水 TDS 和段间压差判断。',
      },
      {
        action: '提交监督总管冲突消解',
        parameter: '是否隔离 反渗透、是否延长冲洗、是否需要现场余氯/ORP 检测',
        basis: '跨 超滤/反渗透 的药剂残留和进水安全由监督总管汇总后交人工确认。',
      },
      ...common,
    ];
  }

  return [
    {
      action: '区分 超滤清洗加药与 反渗透保护加药',
      parameter: '超滤: CEB/CED 药剂；反渗透: 阻垢剂/CIP/非氧化性膜兼容药剂',
      basis: '加药 Agent 不能把 超滤氧化剂清洗和 反渗透阻垢剂混为一谈。',
    },
    {
      action: '复核 反渗透阻垢剂投加状态',
      parameter: `当前参考 ${telemetry.dosingRate} ppm，建议范围 3-5 ppm`,
      basis: '阻垢剂用于 反渗透 结垢预防，需结合回收率和进水 TDS 判断。',
    },
    {
      action: '复核 超滤清洗药剂与残留风险',
      parameter: '药箱液位、加药泵流量、清洗后余氯/ORP/冲洗时间',
      basis: '超滤氧化剂或酸碱清洗后，残留风险不能进入 反渗透。',
    },
    {
      action: '提交监督总管进行 反渗透 隔离判断',
      parameter: '是否隔离 反渗透、是否延长冲洗、是否需要现场检测',
      basis: '跨 超滤/反渗透 的药剂风险由监督总管汇总后交人工确认。',
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
  sandboxValidation = null,
  sandboxStatus = 'idle',
  sandboxText = '',
  awaitingHumanConfirmation = false,
  readOnly = false,
  onConfirmHumanAction,
  onRejectHumanAction,
  className = '',
}: InfoPanelProps) {
  const thinkingRef = useRef<HTMLDivElement>(null);
  const thinkingAtBottom = useRef(true);
  const thinkingProgrammaticScroll = useRef(false);
  const actionAgentId = currentAgent?.id ?? 'supervisor';
  const [actions, setActions] = useState<RecommendationAction[]>(() => buildDefaultActions(actionAgentId, telemetry, incidentType));
  const [planActionLibrary, setPlanActionLibrary] = useState<AdminPlanAction[]>([]);
  const actionOptions = planActionLibrary.length > 0 ? planActionLibrary.filter((item) => item.enabled).map((item) => item.label) : FALLBACK_ACTION_OPTIONS;
  const [sandboxExpanded, setSandboxExpanded] = useState(false);
  const sandboxRunning = sandboxStatus === 'streaming';
  const sandboxError = sandboxStatus === 'error';
  const sandboxSummary = sandboxRunning
    ? '安全沙箱推演中，请稍后。系统正在调用沙箱 Skill 对建议动作、权限边界和生产连续性做二次校验。'
    : sandboxValidation?.summary ?? '等待建议生成后进入安全沙箱推演。';

  useEffect(() => {
    if (awaitingHumanConfirmation) {
      const libraryActions = buildActionsFromPlanLibrary(planActionLibrary, actionAgentId, incidentType);
      setActions(libraryActions.length > 0 ? libraryActions : buildDefaultActions(actionAgentId, telemetry, incidentType));
    }
  }, [actionAgentId, awaitingHumanConfirmation, incidentType, planActionLibrary, telemetry]);

  useEffect(() => {
    listPlanActions()
      .then((items) => {
        setPlanActionLibrary(items);
      })
      .catch(() => {
        setPlanActionLibrary([]);
      });
  }, []);

  const handleThinkingScroll = () => {
    if (thinkingProgrammaticScroll.current) return;
    if (!thinkingRef.current) return;
    const el = thinkingRef.current;
    thinkingAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 8;
  };

  useEffect(() => {
    if (!thinkingAtBottom.current) return;
    const scrollToBottom = () => {
      if (!thinkingRef.current) return;
      thinkingProgrammaticScroll.current = true;
      thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight;
      requestAnimationFrame(() => {
        thinkingProgrammaticScroll.current = false;
      });
    };
    scrollToBottom();
  }, [thinking?.text]);

  const updateAction = (index: number, patch: Partial<RecommendationAction>) => {
    setActions((prev) => prev.map((entry, itemIndex) => (itemIndex === index ? { ...entry, ...patch } : entry)));
  };

  const updateSelectedAction = (index: number, actionLabel: string) => {
    const matched = planActionLibrary.find((item) => item.label === actionLabel);
    updateAction(index, matched ? actionFromPlanAction(matched) : { action: actionLabel });
  };

  const deleteAction = (index: number) => {
    setActions((prev) => {
      const next = prev.filter((_, itemIndex) => itemIndex !== index);
      if (next.length === 0) {
        window.setTimeout(() => onRejectHumanAction?.(), 0);
      }
      return next;
    });
  };

  const confirmActions = () => {
    const validActions = actions.filter((item) => item.action.trim());
    if (validActions.length === 0) {
      onRejectHumanAction?.();
      return;
    }
    onConfirmHumanAction?.(validActions);
  };

  return (
    <aside className={`flex min-h-0 flex-col overflow-hidden border-l border-[var(--color-border-default)] bg-[var(--color-surface-overlay)] text-slate-100 ${className}`}>
      <div className="min-h-0 flex-1 space-y-[var(--spacing-gap)] overflow-y-auto p-[var(--spacing-panel)] pr-2">
      <section>
        <h2 className="text-xs font-semibold tracking-wide text-slate-400">当前智能体</h2>
        {currentAgent ? (
          <div className="mt-2 rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-slate-900/60 p-[var(--spacing-card)]">
            <p className="text-sm font-semibold">{currentAgent.name}</p>
            <p className="mt-1 text-xs text-slate-400">{AGENT_STATUS_LABEL[currentAgent.status]}</p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">暂无活跃智能体</p>
        )}
      </section>

      <section>
        <h2 className="text-xs font-semibold tracking-wide text-slate-400">深度思考</h2>
        {thinking ? (
          <div ref={thinkingRef} onScroll={handleThinkingScroll} className="mt-2 h-48 overflow-y-auto space-y-2 rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-slate-900/60 p-[var(--spacing-card)]">
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
          <p className="mt-2 text-sm text-slate-500">空闲</p>
        )}

        {awaitingHumanConfirmation && (
          <div className="mt-3 rounded-[var(--radius-card)] border border-amber-500/40 bg-amber-950/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-amber-200">处置步骤建议，等待人工确认</p>
              <button
                type="button"
                onClick={() => setActions((prev) => [...prev, { action: '', parameter: '', basis: '' }])}
                disabled={readOnly}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-45"
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
                      onClick={() => deleteAction(index)}
                      disabled={readOnly}
                      className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
                      title="删除操作"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <select
                    value={item.action}
                    onChange={(event) => updateSelectedAction(index, event.target.value)}
                    disabled={readOnly}
                    className="mb-1 w-full rounded border border-slate-700 bg-slate-950/80 px-2 py-1 text-xs font-semibold text-slate-100 outline-none focus:border-amber-400 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <option value="">请选择操作</option>
                    {item.action && !actionOptions.includes(item.action) && (
                      <option value={item.action}>{item.action}</option>
                    )}
                    {actionOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <input
                    value={item.parameter}
                    onChange={(event) => updateAction(index, { parameter: event.target.value })}
                    readOnly={readOnly}
                    className="mb-1 w-full rounded border border-slate-700 bg-slate-950/80 px-2 py-1 text-[11px] text-cyan-100 outline-none focus:border-cyan-400"
                  />
                  <textarea
                    value={item.basis}
                    onChange={(event) => updateAction(index, { basis: event.target.value })}
                    readOnly={readOnly}
                    rows={2}
                    className="w-full resize-none rounded border border-slate-700 bg-slate-950/80 px-2 py-1 text-[11px] leading-4 text-slate-300 outline-none focus:border-slate-400"
                  />
                </div>
              ))}
            </div>

            <p className="mt-2 text-[11px] leading-5 text-slate-300">
              {readOnly
                ? '历史回放中，处置交互已锁定，仅展示当时记录。'
                : '反洗、CEB、CIP、加药和泵阀控制不会自动执行。确认后仅进入执行记录/效果回写流程。'}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={confirmActions}
                disabled={readOnly}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25 focus:outline-none focus:ring-1 focus:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                人工确认执行
              </button>
              <button
                type="button"
                onClick={onRejectHumanAction}
                disabled={readOnly}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-600 bg-slate-900/80 px-2.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <XCircle className="h-3.5 w-3.5" />
                驳回/需复核
              </button>
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xs font-semibold tracking-wide text-slate-400">决策链</h2>
        <DecisionChain steps={decisionSteps} />
        <div className="mt-2 rounded-[var(--radius-card)] border border-cyan-500/30 bg-cyan-950/20 p-3">
          <div className="flex items-start gap-2">
            <ShieldCheck className={`mt-0.5 h-4 w-4 flex-shrink-0 ${sandboxRunning ? 'animate-pulse text-cyan-300' : sandboxError ? 'text-rose-300' : sandboxValidation?.passed ? 'text-emerald-300' : 'text-cyan-300'}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-cyan-100">安全沙箱推演</p>
                {sandboxValidation ? (
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                    sandboxValidation.status === 'error_fallback'
                      ? 'bg-amber-500/10 text-amber-300'
                      : sandboxValidation.confidenceScore >= 97
                        ? 'bg-emerald-500/10 text-emerald-300'
                        : 'bg-cyan-500/10 text-cyan-300'
                  }`}>
                    置信度 {sandboxValidation.confidenceScore}%
                  </span>
                ) : (
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${sandboxRunning ? 'bg-cyan-500/10 text-cyan-300' : sandboxError ? 'bg-rose-500/10 text-rose-300' : 'bg-slate-700/70 text-slate-300'}`}>
                    {sandboxRunning ? '推演中' : sandboxError ? '异常' : '等待'}
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] leading-5 text-slate-300">{sandboxSummary}</p>
              {sandboxRunning && sandboxText && (
                <div className="mt-2 max-h-24 overflow-y-auto rounded border border-cyan-500/20 bg-slate-950/40 p-2 text-[10px] leading-4 text-cyan-100/80">
                  {sandboxText}
                </div>
              )}
              {sandboxError && !sandboxValidation && (
                <p className="mt-1 text-[11px] text-rose-300">沙箱推演未完整返回，请检查模型服务或稍后重试。</p>
              )}
              {sandboxValidation && (
                <>
                  <p className={`mt-1 text-[11px] ${sandboxValidation.passed ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {sandboxValidation.statusText}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSandboxExpanded((value) => !value)}
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-300 hover:text-cyan-100"
                  >
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${sandboxExpanded ? 'rotate-180' : ''}`} />
                    {sandboxExpanded ? '收起推演详情' : '展开推演详情'}
                  </button>
                  {sandboxExpanded && (
                    <div className="mt-2 max-h-52 overflow-y-auto pr-1">
                      <div className="space-y-1.5">
                        {sandboxValidation.checks.map((check) => (
                          <div key={check.id} className="rounded border border-slate-700/70 bg-slate-950/50 p-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-semibold text-slate-200">{check.label}</span>
                              <span className={`text-[10px] ${check.passed ? 'text-emerald-300' : 'text-amber-300'}`}>
                                {check.passed ? '通过' : '需复核'}
                              </span>
                            </div>
                            <p className="mt-1 text-[10px] leading-4 text-slate-400">{check.summary}</p>
                          </div>
                        ))}
                        <div className="rounded border border-slate-700/70 bg-slate-950/50 p-2">
                          <p className="text-[11px] font-semibold text-slate-200">完整推演文本</p>
                          <p className="mt-1 whitespace-pre-wrap text-[10px] leading-4 text-slate-400">{sandboxValidation.rawText}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="min-h-[160px] overflow-hidden">
        <h2 className="text-xs font-semibold tracking-wide text-slate-400">事件日志</h2>
        <div className="mt-2 max-h-64 min-h-[120px] space-y-2 overflow-y-auto pb-2 pr-1">
          {events.map((event) => (
            <article key={event.id} className="rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-slate-900/50 p-2 text-xs">
              <p className="text-slate-500">{event.time}</p>
              <p className="mt-1 text-slate-200">{event.text}</p>
            </article>
          ))}
        </div>
      </section>
      </div>
    </aside>
  );
}
