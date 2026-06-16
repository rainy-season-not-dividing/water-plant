import { useEffect, useMemo, useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import { listAdminAgents, updateAdminAgent } from '../../api/services/adminService';
import type { AdminAgentConfig } from '../../types/admin';

export function AgentConfigManager() {
  const [agents, setAgents] = useState<AdminAgentConfig[]>([]);
  const [selectedId, setSelectedId] = useState<string>('supervisor');
  const [draft, setDraft] = useState<AdminAgentConfig | null>(null);
  const [statusText, setStatusText] = useState('');

  const selected = useMemo(() => agents.find((agent) => agent.id === selectedId) ?? agents[0], [agents, selectedId]);

  useEffect(() => {
    listAdminAgents().then((items) => {
      setAgents(items);
      setSelectedId(items[0]?.id ?? 'supervisor');
      setDraft(items[0] ?? null);
    });
  }, []);

  useEffect(() => {
    if (selected) setDraft({ ...selected, capabilities: [...selected.capabilities], metrics: selected.metrics.map((metric) => ({ ...metric })) });
  }, [selected]);

  const updateDraft = (patch: Partial<AdminAgentConfig>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  };

  const handleSave = async () => {
    if (!draft) return;
    const saved = await updateAdminAgent(draft.id, {
      name: draft.name,
      englishName: draft.englishName,
      role: draft.role,
      color: draft.color,
      capabilities: draft.capabilities,
      metrics: draft.metrics,
      enabled: draft.enabled,
    });
    setAgents((current) => current.map((agent) => (agent.id === saved.id ? saved : agent)));
    setStatusText('Agent 配置已保存');
  };

  if (!draft) {
    return <div className="rounded border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">正在加载 Agent 配置...</div>;
  }

  return (
    <section className="grid min-h-0 grid-cols-[260px_minmax(0,1fr)] gap-4">
      <aside className="overflow-hidden rounded border border-slate-800 bg-slate-950/70">
        <div className="border-b border-slate-800 px-3 py-2 text-xs font-semibold uppercase text-slate-400">Agent 列表</div>
        <div className="max-h-[calc(100vh-220px)] overflow-y-auto p-2">
          {agents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => setSelectedId(agent.id)}
              className={`mb-2 w-full rounded border px-3 py-2 text-left transition-colors ${
                selectedId === agent.id
                  ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-100'
                  : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-600'
              }`}
            >
              <span className="block text-sm font-semibold">{agent.name}</span>
              <span className="text-xs text-slate-500">{agent.englishName}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="min-h-0 overflow-y-auto rounded border border-slate-800 bg-slate-950/70 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Agent 管理</h2>
            <p className="mt-1 text-xs text-slate-500">维护智能体展示文案、能力标签和指标字段。</p>
          </div>
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 rounded border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25"
          >
            <Save className="h-3.5 w-3.5" />
            保存
          </button>
        </div>

        {statusText ? <p className="mt-3 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">{statusText}</p> : null}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-xs text-slate-400">
            中文名称
            <input value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400" />
          </label>
          <label className="text-xs text-slate-400">
            英文名称
            <input value={draft.englishName} onChange={(event) => updateDraft({ englishName: event.target.value })} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400" />
          </label>
          <label className="text-xs text-slate-400">
            标识色
            <input value={draft.color} onChange={(event) => updateDraft({ color: event.target.value })} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400" />
          </label>
          <label className="flex items-end gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={draft.enabled} onChange={(event) => updateDraft({ enabled: event.target.checked })} />
            启用该 Agent
          </label>
        </div>

        <label className="mt-3 block text-xs text-slate-400">
          职责描述
          <textarea value={draft.role} onChange={(event) => updateDraft({ role: event.target.value })} rows={3} className="mt-1 w-full resize-none rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm leading-6 text-slate-100 outline-none focus:border-cyan-400" />
        </label>

        <section className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">能力标签</h3>
            <button
              type="button"
              onClick={() => updateDraft({ capabilities: [...draft.capabilities, ''] })}
              className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
            >
              新增
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {draft.capabilities.map((capability, index) => (
              <input
                key={index}
                value={capability}
                onChange={(event) => {
                  const capabilities = draft.capabilities.map((item, itemIndex) => (itemIndex === index ? event.target.value : item));
                  updateDraft({ capabilities });
                }}
                className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-400"
              />
            ))}
          </div>
        </section>

        <section className="mt-4">
          <h3 className="text-sm font-semibold text-slate-200">指标配置</h3>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {draft.metrics.map((metric, index) => (
              <div key={metric.key} className="rounded border border-slate-800 bg-slate-900/60 p-2">
                <input
                  value={metric.label}
                  onChange={(event) => {
                    const metrics = draft.metrics.map((item, itemIndex) => (itemIndex === index ? { ...item, label: event.target.value } : item));
                    updateDraft({ metrics });
                  }}
                  className="mb-2 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs font-semibold text-slate-100 outline-none focus:border-cyan-400"
                />
                <div className="grid grid-cols-[1fr_72px] gap-2">
                  <input
                    value={String(metric.value)}
                    onChange={(event) => {
                      const raw = event.target.value;
                      const parsed = Number(raw);
                      const value = raw === '' || Number.isNaN(parsed) ? raw : parsed;
                      const metrics = draft.metrics.map((item, itemIndex) => (itemIndex === index ? { ...item, value } : item));
                      updateDraft({ metrics });
                    }}
                    className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-cyan-400"
                  />
                  <input
                    value={metric.unit}
                    onChange={(event) => {
                      const metrics = draft.metrics.map((item, itemIndex) => (itemIndex === index ? { ...item, unit: event.target.value } : item));
                      updateDraft({ metrics });
                    }}
                    className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-cyan-400"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <button
          type="button"
          onClick={() => selected && setDraft({ ...selected, capabilities: [...selected.capabilities], metrics: selected.metrics.map((metric) => ({ ...metric })) })}
          className="mt-4 inline-flex items-center gap-1.5 rounded border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          放弃未保存修改
        </button>
      </div>
    </section>
  );
}
