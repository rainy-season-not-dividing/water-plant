import { ArrowLeft, Bot, ListChecks } from 'lucide-react';
import { useState } from 'react';
import { AgentConfigManager } from '../features/admin/AgentConfigManager';
import { PlanActionManager } from '../features/admin/PlanActionManager';

type AdminTab = 'agents' | 'plan-actions';

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>('agents');

  return (
    <main className="relative z-10 flex h-screen min-h-0 flex-col overflow-hidden bg-[#070b13] p-4 text-slate-100">
      <header className="mb-4 flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/80 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <a href="/" className="inline-flex h-9 w-9 items-center justify-center rounded border border-slate-700 bg-slate-900 text-slate-200 hover:border-cyan-500 hover:text-cyan-200" aria-label="返回前台">
            <ArrowLeft className="h-4 w-4" />
          </a>
          <div>
            <h1 className="text-lg font-semibold">未来水厂智能操作系统 - 后台管理</h1>
            <p className="mt-1 text-xs text-slate-500">Agent 配置与方案操作库管理</p>
          </div>
        </div>
        <div className="flex rounded border border-slate-800 bg-slate-900/70 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('agents')}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold ${activeTab === 'agents' ? 'bg-cyan-500/15 text-cyan-200' : 'text-slate-400 hover:text-slate-100'}`}
          >
            <Bot className="h-3.5 w-3.5" />
            Agent 管理
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('plan-actions')}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold ${activeTab === 'plan-actions' ? 'bg-cyan-500/15 text-cyan-200' : 'text-slate-400 hover:text-slate-100'}`}
          >
            <ListChecks className="h-3.5 w-3.5" />
            方案操作管理
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === 'agents' ? <AgentConfigManager /> : <PlanActionManager />}
      </div>
    </main>
  );
}
