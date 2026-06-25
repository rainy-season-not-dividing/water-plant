import type { CockpitCostOverviewSection } from '../../types/cockpit';

interface CostOverviewPanelProps {
  data: CockpitCostOverviewSection;
}

export function CostOverviewPanel({ data }: CostOverviewPanelProps) {
  const maxCost = Math.max(...data.breakdown.map((item) => item.value), 1);

  return (
    <section className="rounded-[28px] border border-slate-800/80 bg-slate-950/80 p-6 shadow-[0_24px_60px_rgba(2,6,23,0.24)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-300/80">成本总览</p>
          <h2 className="mt-3 text-2xl font-semibold text-white">综合成本拆解与周期趋势</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3">
            <div className="text-xs text-slate-500">综合成本</div>
            <div className="mt-2 text-2xl font-semibold text-white">{data.headline.totalCost.toFixed(2)}</div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3">
            <div className="text-xs text-slate-500">吨水成本</div>
            <div className="mt-2 text-2xl font-semibold text-white">{data.headline.costPerTon.toFixed(3)}</div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="rounded-[24px] border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-200">费用构成</h3>
            <span className="text-xs text-slate-500">当前周期</span>
          </div>
          <div className="space-y-4">
            {data.breakdown.map((item) => (
              <div key={item.key}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-slate-300">{item.label}</span>
                  <span className="font-medium text-white">{item.value.toFixed(2)}</span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#22d3ee,#38bdf8,#2563eb)]"
                    style={{ width: `${Math.max((item.value / maxCost) * 100, 4)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-200">月度趋势</h3>
            <span className="text-xs text-slate-500">近 {data.trend.length} 个周期</span>
          </div>
          <div className="space-y-3">
            {data.trend.map((point) => (
              <div key={point.period} className="grid grid-cols-[72px_1fr_82px] items-center gap-3 text-sm">
                <span className="text-slate-400">{point.label}</span>
                <div className="h-2.5 rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#0ea5e9,#22d3ee)]"
                    style={{ width: `${Math.max((point.totalCost / Math.max(...data.trend.map((item) => item.totalCost), 1)) * 100, 4)}%` }}
                  />
                </div>
                <span className="text-right text-slate-200">{point.totalCost.toFixed(0)}</span>
              </div>
            ))}
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
