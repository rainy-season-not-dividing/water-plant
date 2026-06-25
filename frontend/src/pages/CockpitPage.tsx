import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { getCockpitDashboard, refreshCockpitDashboard } from '../api/services/cockpitService';
import { CockpitHeader } from '../components/cockpit/CockpitHeader';
import { CostOverviewPanel } from '../components/cockpit/CostOverviewPanel';
import { BudgetPanel } from '../components/cockpit/BudgetPanel';
import { HistoryTrendPanel } from '../components/cockpit/HistoryTrendPanel';
import { KpiCards } from '../components/cockpit/KpiCards';
import { UnitAnalysisPanel } from '../components/cockpit/UnitAnalysisPanel';
import type { CockpitDashboardPayload } from '../types/cockpit';

function LoadingState() {
  return (
    <main className="relative z-10 flex min-h-screen items-center justify-center px-6 py-10 text-slate-100">
      <div className="rounded-[28px] border border-slate-800 bg-slate-950/80 px-8 py-10 text-center shadow-[0_24px_60px_rgba(2,6,23,0.24)]">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-cyan-400/20 border-t-cyan-300" />
        <div className="mt-5 text-lg font-medium text-white">正在载入领导驾驶舱数据</div>
        <div className="mt-2 text-sm text-slate-400">正在连接外部系统并生成统计结果...</div>
      </div>
    </main>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="relative z-10 flex min-h-screen items-center justify-center px-6 py-10 text-slate-100">
      <div className="max-w-xl rounded-[28px] border border-rose-500/20 bg-slate-950/85 px-8 py-10 text-center shadow-[0_24px_60px_rgba(2,6,23,0.24)]">
        <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/10 text-rose-300">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <div className="mt-5 text-xl font-semibold text-white">领导驾驶舱加载失败</div>
        <div className="mt-3 text-sm leading-6 text-slate-400">{message}</div>
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-5 py-3 text-sm font-medium text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-500/15"
        >
          重新加载
        </button>
      </div>
    </main>
  );
}

export default function CockpitPage() {
  const [payload, setPayload] = useState<CockpitDashboardPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = async (refresh = false) => {
    try {
      setError(null);
      if (refresh) {
        setIsRefreshing(true);
        const next = await refreshCockpitDashboard();
        setPayload(next);
      } else {
        setIsLoading(true);
        const next = await getCockpitDashboard();
        setPayload(next);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  if (isLoading && !payload) return <LoadingState />;
  if (error && !payload) return <ErrorState message={error} onRetry={() => void loadDashboard()} />;
  if (!payload) return null;

  return (
    <main className="relative z-10 min-h-screen px-4 py-4 text-slate-100 md:px-6 md:py-6">
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-6">
        <CockpitHeader
          factory={payload.overview.factory}
          subtitle={payload.overview.subtitle}
          sourceStatus={payload.sourceStatus}
          isRefreshing={isRefreshing}
          onRefresh={() => void loadDashboard(true)}
        />

        {error ? (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            最近一次刷新失败：{error}
          </div>
        ) : null}

        <KpiCards items={payload.overview.kpis} />

        <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
          <div className="rounded-[28px] border border-slate-800/80 bg-slate-950/80 p-6 shadow-[0_24px_60px_rgba(2,6,23,0.24)]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">模块摘要</h2>
              <span className="text-xs text-slate-500">首屏概览</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {payload.overview.summaryCards.map((card) => (
                <article key={card.key} className="rounded-[24px] border border-slate-800 bg-slate-900/70 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-lg font-medium text-white">{card.title}</div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${card.status === 'normal' ? 'bg-emerald-500/12 text-emerald-300' : 'bg-amber-500/12 text-amber-300'}`}>
                      {card.status === 'normal' ? '平稳' : '关注'}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{card.summary}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-800/80 bg-slate-950/80 p-6 shadow-[0_24px_60px_rgba(2,6,23,0.24)]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">告警摘要</h2>
              <span className="text-xs text-slate-500">{payload.overview.alerts.length} 条</span>
            </div>
            <div className="space-y-3">
              {payload.overview.alerts.map((alert) => (
                <article key={`${alert.name}-${alert.time}`} className="rounded-[22px] border border-slate-800 bg-slate-900/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-white">{alert.name}</div>
                      <div className="mt-1 text-xs text-slate-500">{alert.time}</div>
                    </div>
                    <span
                      className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                      style={{ backgroundColor: `${alert.severityColor}1F`, color: alert.severityColor }}
                    >
                      {alert.severity}
                    </span>
                  </div>
                  <div className="mt-3 text-sm leading-6 text-slate-300">{alert.content}</div>
                  <div className="mt-2 text-xs leading-5 text-slate-500">原因：{alert.reason}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">建议：{alert.solution}</div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <CostOverviewPanel data={payload.costOverview} />
        <UnitAnalysisPanel data={payload.unitAnalysis} />
        <BudgetPanel data={payload.budget} />
        <HistoryTrendPanel data={payload.historyTrend} />
      </div>
    </main>
  );
}
