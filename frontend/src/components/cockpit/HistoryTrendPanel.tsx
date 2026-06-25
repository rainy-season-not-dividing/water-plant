import { useMemo, useState } from 'react';
import type { CockpitHistoryTrendSection } from '../../types/cockpit';

interface HistoryTrendPanelProps {
  data: CockpitHistoryTrendSection;
}

const RANGE_OPTIONS = [7, 30, 90];

export function HistoryTrendPanel({ data }: HistoryTrendPanelProps) {
  const [rangeDays, setRangeDays] = useState<number>(data.defaultRangeDays || 7);

  const filteredSeries = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (rangeDays - 1));
    return data.series
      .map((item) => ({
        ...item,
        points: item.points.filter((point) => new Date(point.date) >= cutoff),
      }))
      .filter((item) => item.points.length > 0);
  }, [data.series, rangeDays]);

  return (
    <section className="rounded-[28px] border border-slate-800/80 bg-slate-950/80 p-6 shadow-[0_24px_60px_rgba(2,6,23,0.24)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-300/80">历史趋势</p>
          <h2 className="mt-3 text-2xl font-semibold text-white">关键水质指标历史趋势与快照</h2>
        </div>
        <div className="inline-flex rounded-full border border-slate-800 bg-slate-900/70 p-1">
          {RANGE_OPTIONS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setRangeDays(item)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${rangeDays === item ? 'bg-cyan-500/15 text-cyan-200' : 'text-slate-400 hover:text-slate-200'}`}
            >
              近 {item} 天
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.96fr_1.04fr]">
        <div className="rounded-[24px] border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-200">实时快照</h3>
            <span className="text-xs text-slate-500">{data.realtimeSnapshot.length} 项</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {data.realtimeSnapshot.map((item) => (
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

        <div className="rounded-[24px] border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-200">趋势序列</h3>
            <span className="text-xs text-slate-500">已筛选 {filteredSeries.length} 条</span>
          </div>
          <div className="space-y-4">
            {filteredSeries.map((series) => {
              const maxValue = Math.max(...series.points.map((point) => point.value), 1);
              const latest = series.points[series.points.length - 1];
              return (
                <div key={series.key} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-slate-100">{series.label}</div>
                      <div className="text-xs text-slate-500">{series.unit || '无单位'}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-cyan-200">{latest?.value.toFixed(3) ?? '-'}</div>
                      <div className="text-xs text-slate-500">{latest?.date ?? '-'}</div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {series.points.map((point) => (
                      <div key={`${series.key}-${point.date}`} className="grid grid-cols-[88px_1fr_70px] items-center gap-3 text-xs">
                        <span className="text-slate-500">{point.date}</span>
                        <div className="h-2 rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full bg-[linear-gradient(90deg,#22d3ee,#2563eb)]"
                            style={{ width: `${Math.max((point.value / maxValue) * 100, 4)}%` }}
                          />
                        </div>
                        <span className="text-right text-slate-300">{point.value.toFixed(3)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
