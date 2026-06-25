import type { CockpitKpi } from '../../types/cockpit';

interface KpiCardsProps {
  items: CockpitKpi[];
}

function getTrendColor(direction: CockpitKpi['trend']['direction']) {
  if (direction === 'up') return 'text-rose-300 bg-rose-500/10 border-rose-500/20';
  if (direction === 'down') return 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20';
  return 'text-slate-300 bg-slate-500/10 border-slate-500/20';
}

export function KpiCards({ items }: KpiCardsProps) {
  return (
    <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-5">
      {items.map((item) => (
        <article
          key={item.key}
          className="rounded-[26px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,8,18,0.92))] p-5 shadow-[0_18px_50px_rgba(2,6,23,0.32)]"
        >
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{item.label}</div>
          <div className="mt-4 flex items-end gap-2">
            <span className="text-3xl font-semibold text-white">{Number.isFinite(item.value) ? item.value.toLocaleString() : '-'}</span>
            <span className="pb-1 text-sm text-slate-400">{item.unit}</span>
          </div>
          <div className={`mt-4 inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getTrendColor(item.trend.direction)}`}>
            {item.trend.label}
          </div>
        </article>
      ))}
    </section>
  );
}
