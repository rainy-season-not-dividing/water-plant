import { ArrowLeft, RefreshCw, ServerCog } from 'lucide-react';
import type { CockpitFactoryInfo, CockpitSourceStatus } from '../../types/cockpit';

interface CockpitHeaderProps {
  factory: CockpitFactoryInfo;
  sourceStatus: CockpitSourceStatus;
  subtitle: string;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export function CockpitHeader({ factory, sourceStatus, subtitle, isRefreshing, onRefresh }: CockpitHeaderProps) {
  return (
    <header className="relative overflow-hidden rounded-[28px] border border-cyan-500/20 bg-[radial-gradient(circle_at_top_left,rgba(6,182,212,0.2),transparent_38%),linear-gradient(135deg,rgba(8,20,37,0.96),rgba(2,8,18,0.96))] p-6 shadow-[0_24px_80px_rgba(8,145,178,0.16)]">
      <div className="pointer-events-none absolute inset-y-0 right-0 w-72 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.16),transparent_70%)]" />
      <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="mb-4 flex items-center gap-3">
            <a
              href="/"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-cyan-400/20 bg-slate-950/70 text-cyan-100 transition hover:border-cyan-300/60 hover:text-white"
              aria-label="返回首页"
            >
              <ArrowLeft className="h-4 w-4" />
            </a>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.26em] text-cyan-200">
              <ServerCog className="h-3.5 w-3.5" />
              Leadership Cockpit
            </div>
          </div>
          <h1 className="text-3xl font-semibold tracking-wide text-white md:text-4xl">{factory.name || '领导驾驶舱'}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 md:text-base">{subtitle}</p>
          <div className="mt-5 flex flex-wrap gap-3 text-xs text-slate-300">
            <span className="rounded-full border border-slate-700/80 bg-slate-950/70 px-3 py-1.5">生产规模 {factory.productionScale || 3000} m3/d</span>
            <span className="rounded-full border border-slate-700/80 bg-slate-950/70 px-3 py-1.5">位置 {factory.location || '未配置'}</span>
            <span className="rounded-full border border-slate-700/80 bg-slate-950/70 px-3 py-1.5">数据周期 {sourceStatus.recordMonth || '-'}</span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-3 rounded-[24px] border border-slate-800/80 bg-slate-950/70 p-4 backdrop-blur-sm xl:w-[320px]">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-[0.22em] text-slate-500">数据状态</span>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${sourceStatus.ok ? 'bg-emerald-500/12 text-emerald-300' : 'bg-rose-500/12 text-rose-300'}`}>
              {sourceStatus.ok ? '在线' : '异常'}
            </span>
          </div>
          <div className="space-y-2 text-sm text-slate-300">
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">来源模式</span>
              <span className="font-medium text-slate-100">{sourceStatus.mode}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">最近更新</span>
              <span className="font-medium text-slate-100">{sourceStatus.updatedAt || '-'}</span>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-3 text-xs leading-5 text-slate-400">
              {sourceStatus.message}
            </div>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-sm font-medium text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? '刷新中...' : '刷新数据'}
          </button>
        </div>
      </div>
    </header>
  );
}
