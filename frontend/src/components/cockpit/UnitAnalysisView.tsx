import { BarChart3, Coins, FlaskConical, Waves, Zap } from 'lucide-react';
import type { CockpitUnitAnalysisPayload } from '../../types/cockpit';
import { BarChart } from './CockpitCharts';
import { getCockpitIcon } from './CockpitShell';

export function UnitAnalysisView({ data }: { data: CockpitUnitAnalysisPayload }) {
  const coreOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: { data: data.coreMetrics.series.map((item) => item.name), textStyle: { color: '#b5d7f5' }, bottom: 0 },
    grid: { left: '10%', right: '5%', top: '10%', bottom: '18%' },
    xAxis: {
      type: 'category',
      data: data.coreMetrics.categories,
      axisLabel: { color: '#9cc7ed' },
      axisLine: { lineStyle: { color: '#184261' } },
    },
    yAxis: [
      {
        type: 'value',
        name: '金额(元)',
        nameTextStyle: { color: '#6cb6e3' },
        axisLabel: { color: '#9cc7ed' },
        splitLine: { lineStyle: { color: '#17324a' } },
      },
      {
        type: 'value',
        name: '水量(m3)',
        nameTextStyle: { color: '#6cb6e3' },
        axisLabel: { color: '#9cc7ed' },
        splitLine: { show: false },
      },
    ],
    series: data.coreMetrics.series.flatMap((item, index) => {
      const colorList = ['#19d2ff', '#ffad33', '#2e96ff', '#9c5cff'];
      const yAxisIndex = item.unit === 'm3' ? 1 : 0;
      return [
        {
          name: item.name,
          type: 'bar',
          yAxisIndex,
          data: [item.actual, null],
          itemStyle: { color: colorList[index % colorList.length] },
        },
        {
          name: `${item.name}预测`,
          type: 'bar',
          yAxisIndex,
          data: [null, item.predicted],
          itemStyle: { color: `${colorList[index % colorList.length]}88` },
        },
      ];
    }),
  };

  const chemicalOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: { data: ['实际成本', 'AI预测成本'], textStyle: { color: '#b5d7f5' } },
    grid: { left: '12%', right: '5%', top: '14%', bottom: '18%' },
    xAxis: {
      type: 'category',
      data: data.chemicalCostChart.categories,
      axisLabel: { color: '#9cc7ed', rotate: 28 },
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
        name: '实际成本',
        type: 'bar',
        data: data.chemicalCostChart.actual,
        itemStyle: { color: '#5974ff', borderRadius: [6, 6, 0, 0] },
      },
      {
        name: 'AI预测成本',
        type: 'bar',
        data: data.chemicalCostChart.predicted,
        itemStyle: { color: 'rgba(98,119,255,0.45)', borderRadius: [6, 6, 0, 0] },
      },
    ],
  };

  const icons = [Zap, FlaskConical, Waves, Coins];
  return (
    <div className="space-y-6">
      <section className="grid gap-5 xl:grid-cols-4">
        {data.cards.map((card, index) => {
          const Icon = icons[index] ?? getCockpitIcon(card.icon);
          return (
            <article key={card.key} className="rounded-[26px] border border-cyan-500/18 bg-[#0b1b2f]/92 p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="text-2xl font-semibold text-slate-200">{card.title}</div>
                <Icon className="h-7 w-7 text-cyan-300" />
              </div>
              <div className="mt-5 text-[2.9rem] font-bold leading-none text-white">
                {card.value.toFixed(card.unit.includes('/m3') ? 2 : 2)}
                <span className="ml-2 text-2xl text-cyan-200">{card.unit}</span>
              </div>
            </article>
          );
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="rounded-[30px] border border-cyan-500/15 bg-[#0b1b2f]/92 p-6">
          <div className="mb-4 flex items-center gap-3 text-xl font-semibold text-cyan-200">
            <BarChart3 className="h-5 w-5" />
            核心成本指标
          </div>
          <BarChart option={coreOption} className="h-[360px] w-full" />
        </article>

        <article className="rounded-[30px] border border-cyan-500/15 bg-[#0b1b2f]/92 p-6">
          <div className="mb-4 flex items-center gap-3 text-xl font-semibold text-cyan-200">
            <FlaskConical className="h-5 w-5" />
            各类药剂成本
          </div>
          <BarChart option={chemicalOption} className="h-[360px] w-full" />
        </article>
      </section>

      <section className="rounded-[30px] border border-cyan-500/15 bg-[#0b1b2f]/92 p-6">
        <div className="mb-4 flex items-center gap-3 text-xl font-semibold text-cyan-200">
          <FlaskConical className="h-5 w-5" />
          药剂成本构成明细
        </div>
        <div className="space-y-3 text-sm leading-7 text-slate-300">
          {data.chemicalDetailItems.map((item) => (
            <div key={item.key} className="rounded-2xl border border-slate-800 bg-slate-950/45 px-4 py-3">
              {item.label}: {item.cost.toFixed(2)}元（加药{item.dosage.toFixed(2)}L）
            </div>
          ))}
          <div className="rounded-2xl border border-cyan-500/18 bg-cyan-500/8 px-4 py-3 font-semibold text-cyan-100">
            总药剂成本：
            {data.chemicalDetailItems.reduce((sum, item) => sum + item.cost, 0).toFixed(2)}元
          </div>
        </div>
      </section>
    </div>
  );
}
