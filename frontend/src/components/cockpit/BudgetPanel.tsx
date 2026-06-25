import type { CockpitBudgetSection } from '../../types/cockpit';

interface BudgetPanelProps {
  data: CockpitBudgetSection;
}

export function BudgetPanel({ data }: BudgetPanelProps) {
  const maxValue = Math.max(
    ...data.monthlySeries.flatMap((item) => [item.budget, item.actual ?? 0, item.forecast ?? 0]),
    1,
  );

  return (
    <section className="rounded-[28px] border border-slate-800/80 bg-slate-950/80 p-6 shadow-[0_24px_60px_rgba(2,6,23,0.24)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-300/80">预算管理</p>
          <h2 className="mt-3 text-2xl font-semibold text-white">年度预算执行、剩余空间与超支识别</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3">
            <div className="text-xs text-slate-500">年度预算</div>
            <div className="mt-2 text-2xl font-semibold text-white">{(data.annualBudget / 1000).toFixed(0)}K</div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3">
            <div className="text-xs text-slate-500">执行率</div>
            <div className="mt-2 text-2xl font-semibold text-white">{data.executionRate.toFixed(1)}%</div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3">
            <div className="text-xs text-slate-500">剩余预算</div>
            <div className="mt-2 text-2xl font-semibold text-white">{(data.remaining / 1000).toFixed(0)}K</div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <div className="rounded-[24px] border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-200">预算与执行节奏</h3>
            <span className="text-xs text-slate-500">预算 / 实际 / 预测</span>
          </div>
          <div className="space-y-4">
            {data.monthlySeries.map((item) => (
              <div key={item.month}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-slate-300">{item.month}</span>
                  <span className="text-slate-500">预算 {item.budget.toFixed(0)}</span>
                </div>
                <div className="space-y-2">
                  <div className="h-2 rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-slate-600" style={{ width: `${(item.budget / maxValue) * 100}%` }} />
                  </div>
                  {item.actual !== null ? (
                    <div className="h-2 rounded-full bg-slate-800">
                      <div className="h-full rounded-full bg-[linear-gradient(90deg,#22d3ee,#3b82f6)]" style={{ width: `${(item.actual / maxValue) * 100}%` }} />
                    </div>
                  ) : null}
                  {item.forecast !== null ? (
                    <div className="h-2 rounded-full bg-slate-800">
                      <div className="h-full rounded-full bg-[linear-gradient(90deg,#c084fc,#6366f1)]" style={{ width: `${(item.forecast / maxValue) * 100}%` }} />
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-200">预算分项</h3>
            <span className="text-xs text-slate-500">年度预算 vs 年度实际</span>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-800">
            <table className="min-w-full divide-y divide-slate-800 text-sm">
              <thead className="bg-slate-950/80 text-left text-xs uppercase tracking-[0.22em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">项目</th>
                  <th className="px-4 py-3">预算</th>
                  <th className="px-4 py-3">实际</th>
                  <th className="px-4 py-3">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-900/70">
                {data.items.map((item) => {
                  const overspend = item.yearActual > item.yearBudget;
                  return (
                    <tr key={item.key}>
                      <td className="px-4 py-3 text-slate-200">{item.name}</td>
                      <td className="px-4 py-3 text-slate-300">{item.yearBudget.toFixed(0)}</td>
                      <td className="px-4 py-3 text-slate-300">{item.yearActual.toFixed(0)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${overspend ? 'bg-rose-500/12 text-rose-300' : 'bg-emerald-500/12 text-emerald-300'}`}>
                          {overspend ? '超支关注' : '受控'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-3">
        {data.insights.map((item) => (
          <div key={item} className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm leading-6 text-slate-300">
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}
