import { Coins, Database, Droplets, LineChart as LineChartIcon, PieChart as PieChartIcon, Waves } from 'lucide-react';
import type { CockpitCostOverviewPayload } from '../../types/cockpit';
import { LineChart, PieChart } from './CockpitCharts';
import { getCockpitIcon } from './CockpitShell';

export function CostOverviewView({ data }: { data: CockpitCostOverviewPayload }) {
  const pieOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item' },
    legend: { orient: 'vertical', left: 'left', textStyle: { color: '#b5d7f5' } },
    series: [
      {
        type: 'pie',
        radius: '62%',
        center: ['58%', '54%'],
        data: data.costComposition,
        label: { color: '#e5f6ff' },
        color: ['#17d1ff', '#ffae3a', '#2f8bff', '#8dbd7b'],
        itemStyle: { borderColor: '#091628', borderWidth: 2 },
      },
    ],
  };

  const trendOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: { data: ['实际总成本', 'AI预测成本'], textStyle: { color: '#b5d7f5' } },
    grid: { left: '10%', right: '4%', top: '14%', bottom: '14%' },
    xAxis: {
      type: 'category',
      data: data.costTrend.labels,
      axisLabel: { color: '#9cc7ed' },
      axisLine: { lineStyle: { color: '#184261' } },
    },
    yAxis: {
      type: 'value',
      name: '成本(元)',
      nameTextStyle: { color: '#6cb6e3' },
      axisLabel: { color: '#9cc7ed' },
      splitLine: { lineStyle: { color: '#17324a' } },
    },
    series: [
      {
        name: '实际总成本',
        type: 'line',
        smooth: true,
        data: data.costTrend.actual,
        lineStyle: { color: '#1cd7ff', width: 3 },
        areaStyle: { color: 'rgba(28,215,255,0.08)' },
      },
      {
        name: 'AI预测成本',
        type: 'line',
        smooth: true,
        data: data.costTrend.predicted,
        lineStyle: { color: '#b3e66d', width: 3, type: 'dashed' },
      },
    ],
  };

  const headlineIcons = [Waves, Droplets, LineChartIcon, Coins];
  return (
    <div className="space-y-6">
      <section className="flex flex-wrap gap-3">
        {data.monthlyTabs.map((tab) => (
          <div
            key={tab.key}
            className={`rounded-full border px-4 py-2 text-sm font-medium ${
              tab.key === data.selectedTab
                ? 'border-cyan-400/40 bg-cyan-500/12 text-cyan-100'
                : 'border-slate-800 bg-slate-950/40 text-slate-400'
            }`}
          >
            {tab.label}
          </div>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-4">
        {data.headlineCards.map((card, index) => {
          const Icon = headlineIcons[index] ?? getCockpitIcon(card.icon);
          return (
            <article key={card.key} className="rounded-[26px] border border-cyan-500/18 bg-[#0b1b2f]/92 p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="text-2xl font-semibold text-slate-200">{card.title}</div>
                <Icon className="h-7 w-7 text-cyan-300" />
              </div>
              <div className="mt-5 text-[3rem] font-bold leading-none text-white">
                {card.value.toFixed(card.unit.includes('/m3') ? 2 : 2)}
                <span className="ml-2 text-2xl text-cyan-200">{card.unit}</span>
              </div>
              <div className="mt-4 text-sm text-slate-400">{card.formula}</div>
            </article>
          );
        })}
      </section>

      <section className="grid gap-5 xl:grid-cols-4">
        {data.subCards.map((card) => (
          <article key={card.key} className="rounded-[26px] border border-cyan-500/18 bg-[#0b1b2f]/92 p-6 shadow-[0_18px_45px_rgba(1,8,20,0.18)]">
            <div className="text-lg font-medium text-slate-300">{card.title}</div>
            <div className="mt-4 text-[2.6rem] font-bold leading-none text-cyan-300">
              {card.value.toFixed(2)}
              <span className="ml-2 text-2xl text-slate-200">{card.unit}</span>
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="rounded-[30px] border border-cyan-500/15 bg-[#0b1b2f]/92 p-6">
          <div className="mb-4 flex items-center gap-3 text-xl font-semibold text-cyan-200">
            <PieChartIcon className="h-5 w-5" />
            成本构成
          </div>
          <PieChart option={pieOption} className="h-[360px] w-full" />
        </article>

        <article className="rounded-[30px] border border-cyan-500/15 bg-[#0b1b2f]/92 p-6">
          <div className="mb-4 flex items-center gap-3 text-xl font-semibold text-cyan-200">
            <LineChartIcon className="h-5 w-5" />
            成本趋势
          </div>
          <LineChart option={trendOption} className="h-[360px] w-full" />
        </article>
      </section>

      <section className="rounded-[30px] border border-cyan-500/15 bg-[#0b1b2f]/92 p-6">
        <div className="mb-4 flex items-center gap-3 text-xl font-semibold text-cyan-200">
          <Database className="h-5 w-5" />
          成本价格配置列表
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-3 text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left">时间</th>
                <th className="px-3 py-2 text-left">电价</th>
                <th className="px-3 py-2 text-left">原水价</th>
                <th className="px-3 py-2 text-left">尾水价</th>
                <th className="px-3 py-2 text-left">人工</th>
                <th className="px-3 py-2 text-left">其他</th>
              </tr>
            </thead>
            <tbody>
              {data.latestConfigRows.map((row) => (
                <tr key={row.time} className="rounded-2xl border border-slate-800 bg-slate-950/50 text-slate-200">
                  <td className="rounded-l-2xl px-3 py-3">{row.time || '-'}</td>
                  <td className="px-3 py-3">{row.electricityPrice.toFixed(4)}</td>
                  <td className="px-3 py-3">{row.rawWaterPrice.toFixed(4)}</td>
                  <td className="px-3 py-3">{row.tailWaterPrice.toFixed(4)}</td>
                  <td className="px-3 py-3">{row.laborCost.toFixed(2)}</td>
                  <td className="rounded-r-2xl px-3 py-3">{row.otherCosts.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
