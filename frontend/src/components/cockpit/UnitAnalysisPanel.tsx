import type { CockpitUnitAnalysisSection } from '../../types/cockpit';

interface UnitAnalysisPanelProps {
  data: CockpitUnitAnalysisSection;
}

export function UnitAnalysisPanel({ data }: UnitAnalysisPanelProps) {
  return (
    <section className="rounded-[28px] border border-slate-800/80 bg-slate-950/80 p-6 shadow-[0_24px_60px_rgba(2,6,23,0.24)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-300/80">单耗分析</p>
          <h2 className="mt-3 text-2xl font-semibold text-white">电耗、药耗与历史指标联动</h2>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-4">
        {data.unitCards.map((item) => (
          <div key={item.key} className="rounded-[22px] border border-slate-800 bg-slate-900/70 px-4 py-4">
            <div className="text-xs text-slate-500">{item.label}</div>
            <div className="mt-3 text-2xl font-semibold text-white">{item.value.toFixed(4)}</div>
            <div className="mt-1 text-xs text-slate-400">{item.unit}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.04fr_0.96fr]">
        <div className="rounded-[24px] border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-200">周期对比</h3>
            <span className="text-xs text-slate-500">吨水电耗 / 药剂成本</span>
          </div>
          <div className="space-y-3">
            {data.comparisonSeries.map((item) => (
              <div key={item.period} className="grid grid-cols-[64px_1fr_90px_90px] items-center gap-3 text-sm">
                <span className="text-slate-400">{item.label}</span>
                <div className="h-2 rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#22d3ee,#60a5fa)]"
                    style={{ width: `${Math.max((item.electricityPerTon / Math.max(...data.comparisonSeries.map((row) => row.electricityPerTon), 0.001)) * 100, 5)}%` }}
                  />
                </div>
                <span className="text-right text-slate-200">{item.electricityPerTon.toFixed(4)}</span>
                <span className="text-right text-slate-400">{item.chemicalCost.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-200">药剂明细</h3>
            <span className="text-xs text-slate-500">按当前周期</span>
          </div>
          <div className="space-y-3">
            {data.chemicalItems.map((item) => (
              <div key={item.key} className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-200">{item.label}</span>
                  <span className="text-sm font-medium text-white">{item.cost.toFixed(2)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span>投加量 {item.dosage.toFixed(2)} L</span>
                  <span>单价 {item.price.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-[24px] border border-slate-800 bg-slate-900/60 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-200">实时快照</h3>
          <span className="text-xs text-slate-500">历史趋势最近采样</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.historySnapshot.map((item) => (
            <div key={item.key} className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
              <div className="text-xs text-slate-500">{item.label}</div>
              <div className="mt-2 text-xl font-semibold text-white">
                {item.value.toFixed(3)}
                <span className="ml-2 text-sm font-normal text-slate-400">{item.unit}</span>
              </div>
              <div className="mt-2 text-xs text-slate-500">{item.capturedAt}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
