import { useEffect, useMemo, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { createPlanAction, deletePlanAction, listPlanActions, updatePlanAction } from '../../api/services/adminService';
import type { AdminPlanAction } from '../../types/admin';
import type { AgentId, IncidentType } from '../../types';

const AGENT_IDS: AgentId[] = ['supervisor', 'uf', 'ro', 'dosing', 'pump'];
const INCIDENT_TYPES: IncidentType[] = ['dosing_abnormal', 'uf_clogging', 'ro_fouling', 'pump_overload'];

const emptyAction = (): AdminPlanAction => ({
  id: '',
  label: '',
  defaultParameter: '',
  defaultBasis: '',
  agentIds: [],
  incidentTypes: [],
  enabled: true,
});

export function PlanActionManager() {
  const [actions, setActions] = useState<AdminPlanAction[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [draft, setDraft] = useState<AdminPlanAction>(emptyAction);
  const [statusText, setStatusText] = useState('');

  const selected = useMemo(() => actions.find((item) => item.id === selectedId) ?? null, [actions, selectedId]);

  const load = () => {
    listPlanActions().then((items) => {
      setActions(items);
      setSelectedId(items[0]?.id ?? '');
      setDraft(items[0] ?? emptyAction());
    });
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setDraft(selected ? { ...selected, agentIds: [...selected.agentIds], incidentTypes: [...selected.incidentTypes] } : emptyAction());
  }, [selected]);

  const toggleValue = <T extends string>(values: T[], value: T) => (values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);

  const handleCreate = () => {
    const next = emptyAction();
    setSelectedId('');
    setDraft(next);
    setStatusText('正在新增空白操作');
  };

  const handleSave = async () => {
    if (!draft.label.trim()) {
      setStatusText('操作名称不能为空');
      return;
    }

    if (draft.id) {
      const saved = await updatePlanAction(draft.id, draft);
      setActions((current) => current.map((item) => (item.id === saved.id ? saved : item)));
      setStatusText('方案操作已保存');
    } else {
      const saved = await createPlanAction({
        label: draft.label,
        defaultParameter: draft.defaultParameter,
        defaultBasis: draft.defaultBasis,
        agentIds: draft.agentIds,
        incidentTypes: draft.incidentTypes,
        enabled: draft.enabled,
      });
      setActions((current) => [saved, ...current]);
      setSelectedId(saved.id);
      setStatusText('方案操作已新增');
    }
  };

  const handleDelete = async () => {
    if (!draft.id) {
      setDraft(emptyAction());
      return;
    }
    if (draft.system) {
      setStatusText('系统固定操作不可删除');
      return;
    }
    await deletePlanAction(draft.id);
    setActions((current) => current.filter((item) => item.id !== draft.id));
    setSelectedId('');
    setDraft(emptyAction());
    setStatusText('方案操作已删除');
  };

  return (
    <section className="grid min-h-0 grid-cols-[300px_minmax(0,1fr)] gap-4">
      <aside className="overflow-hidden rounded border border-slate-800 bg-slate-950/70">
        <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
          <span className="text-xs font-semibold uppercase text-slate-400">方案操作库</span>
          <button type="button" onClick={handleCreate} className="inline-flex items-center gap-1 rounded border border-cyan-500/40 px-2 py-1 text-xs text-cyan-200 hover:bg-cyan-500/15">
            <Plus className="h-3 w-3" />
            新增
          </button>
        </div>
        <div className="max-h-[calc(100vh-220px)] overflow-y-auto p-2">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => setSelectedId(action.id)}
              className={`mb-2 w-full rounded border px-3 py-2 text-left transition-colors ${
                selectedId === action.id
                  ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-100'
                  : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-600'
              }`}
            >
              <span className="block truncate text-sm font-semibold">{action.label}</span>
              <span className="text-xs text-slate-500">
                {action.system ? '固定' : '自定义'} · {action.enabled ? '启用' : '停用'} · {action.agentIds.join(', ') || '未指定 Agent'}
              </span>
            </button>
          ))}
        </div>
      </aside>

      <div className="min-h-0 overflow-y-auto rounded border border-slate-800 bg-slate-950/70 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">方案操作管理</h2>
            <p className="mt-1 text-xs text-slate-500">维护人工确认阶段可选择的标准化操作项。</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={Boolean(draft.system)}
              className={`inline-flex items-center gap-1.5 rounded border px-3 py-2 text-xs font-semibold ${
                draft.system
                  ? 'cursor-not-allowed border-slate-700 bg-slate-800/50 text-slate-500'
                  : 'border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20'
              }`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              删除
            </button>
            <button type="button" onClick={handleSave} className="inline-flex items-center gap-1.5 rounded border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25">
              <Save className="h-3.5 w-3.5" />
              保存
            </button>
          </div>
        </div>

        {statusText ? <p className="mt-3 rounded border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200">{statusText}</p> : null}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="col-span-2 text-xs text-slate-400">
            操作名称
            <input value={draft.label} onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400" />
          </label>
          <label className="text-xs text-slate-400">
            默认参数
            <textarea value={draft.defaultParameter} onChange={(event) => setDraft((current) => ({ ...current, defaultParameter: event.target.value }))} rows={4} className="mt-1 w-full resize-none rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm leading-6 text-slate-100 outline-none focus:border-cyan-400" />
          </label>
          <label className="text-xs text-slate-400">
            默认依据
            <textarea value={draft.defaultBasis} onChange={(event) => setDraft((current) => ({ ...current, defaultBasis: event.target.value }))} rows={4} className="mt-1 w-full resize-none rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm leading-6 text-slate-100 outline-none focus:border-cyan-400" />
          </label>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <fieldset className="rounded border border-slate-800 p-3">
            <legend className="px-1 text-xs font-semibold text-slate-300">适用 Agent</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {AGENT_IDS.map((agentId) => (
                <label key={agentId} className="flex items-center gap-2 text-xs text-slate-300">
                  <input type="checkbox" checked={draft.agentIds.includes(agentId)} onChange={() => setDraft((current) => ({ ...current, agentIds: toggleValue(current.agentIds, agentId) }))} />
                  {agentId}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="rounded border border-slate-800 p-3">
            <legend className="px-1 text-xs font-semibold text-slate-300">适用异常</legend>
            <div className="mt-2 grid grid-cols-1 gap-2">
              {INCIDENT_TYPES.map((incidentType) => (
                <label key={incidentType} className="flex items-center gap-2 text-xs text-slate-300">
                  <input type="checkbox" checked={draft.incidentTypes.includes(incidentType)} onChange={() => setDraft((current) => ({ ...current, incidentTypes: toggleValue(current.incidentTypes, incidentType) }))} />
                  {incidentType}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <label className="mt-4 flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} />
          启用该操作
        </label>
      </div>
    </section>
  );
}
