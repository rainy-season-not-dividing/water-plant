import { BarChart3, Droplets, FlaskConical, Waves, Zap } from 'lucide-react';
import type { CockpitLeadershipPayload } from '../../types/cockpit';
import { BarChart, LineChart } from './CockpitCharts';
import { getCockpitIcon } from './CockpitShell';

const leadershipIconMap = {
  zap: Zap,
  'flask-conical': FlaskConical,
  droplets: Droplets,
  coins: BarChart3,
} as const;

export function LeadershipView({ data }: { data: CockpitLeadershipPayload }) {
  const barOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    grid: { left: '10%', right: '5%', top: '14%', bottom: '16%' },
    xAxis: {
      type: 'category',
      data: data.charts.monthlyWaterTrend.categories,
      axisLabel: { color: '#9cc7ed' },
      axisLine: { lineStyle: { color: '#184261' } },
    },
    yAxis: {
      type: 'value',
      name: data.charts.monthlyWaterTrend.unit,
      nameTextStyle: { color: '#6cb6e3' },
      axisLabel: { color: '#9cc7ed' },
      splitLine: { lineStyle: { color: '#17324a' } },
    },
    series: [
      {
        name: data.charts.monthlyWaterTrend.title,
        type: 'bar',
        data: data.charts.monthlyWaterTrend.values,
        itemStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: '#1dd7ff' },
              { offset: 1, color: '#1387ff' },
            ],
          },
          borderRadius: [6, 6, 0, 0],
        },
        label: { show: true, position: 'top', color: '#ecfeff' },
      },
    ],
  };

  const lineOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    grid: { left: '10%', right: '5%', top: '14%', bottom: '16%' },
    xAxis: {
      type: 'category',
      data: data.charts.powerPerTonTrend.categories,
      axisLabel: { color: '#9cc7ed' },
      axisLine: { lineStyle: { color: '#184261' } },
    },
    yAxis: {
      type: 'value',
      name: data.charts.powerPerTonTrend.unit,
      nameTextStyle: { color: '#6cb6e3' },
      axisLabel: { color: '#9cc7ed' },
      splitLine: { lineStyle: { color: '#17324a' } },
    },
    series: [
      {
        name: '实际值',
        type: 'line',
        data: data.charts.powerPerTonTrend.actual,
        lineStyle: { color: '#14d2ff', width: 3 },
        itemStyle: { color: '#8df6ff' },
        symbolSize: 10,
      },
      {
        name: 'AI预测',
        type: 'line',
        data: data.charts.powerPerTonTrend.predicted,
        lineStyle: { color: '#ffae3d', width: 3, type: 'dashed' },
        itemStyle: { color: '#ffd27c' },
        symbolSize: 8,
      },
    ],
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-5 xl:grid-cols-4">
        {data.cards.map((card) => {
          const Icon = leadershipIconMap[card.icon as keyof typeof leadershipIconMap] ?? getCockpitIcon(card.icon);
          return (
            <article
              key={card.key}
              className="rounded-[28px] border border-cyan-500/18 bg-[linear-gradient(180deg,rgba(8,24,46,0.95),rgba(10,28,48,0.92))] p-6 shadow-[0_24px_60px_rgba(0,6,18,0.28)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="text-lg font-medium text-slate-200">{card.title}</div>
                <Icon className="h-7 w-7 text-cyan-300" />
              </div>
              <div className="mt-8 text-[3rem] font-bold leading-none text-white">
                {card.value.toFixed(card.unit.includes('m3') ? 2 : card.unit.includes('/m3') ? 3 : 2)}
                <span className="ml-2 text-2xl text-cyan-200">{card.unit}</span>
              </div>
              <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-cyan-400/24 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-100">
                <Waves className="h-3.5 w-3.5" />
                {card.factoryName}
              </div>
              <div className="mt-4 text-sm text-slate-400">{card.dateRange}</div>
            </article>
          );
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="rounded-[30px] border border-cyan-500/15 bg-[#0b1b2f]/92 p-6 shadow-[0_24px_60px_rgba(0,6,18,0.24)]">
          <div className="mb-4 flex items-center gap-3 text-xl font-semibold text-cyan-200">
            <BarChart3 className="h-5 w-5" />
            {data.charts.monthlyWaterTrend.title}
          </div>
          <BarChart option={barOption} className="h-[320px] w-full" />
        </article>

        <article className="rounded-[30px] border border-cyan-500/15 bg-[#0b1b2f]/92 p-6 shadow-[0_24px_60px_rgba(0,6,18,0.24)]">
          <div className="mb-4 flex items-center gap-3 text-xl font-semibold text-cyan-200">
            <Zap className="h-5 w-5" />
            {data.charts.powerPerTonTrend.title}
          </div>
          <LineChart option={lineOption} className="h-[320px] w-full" />
        </article>
      </section>
    </div>
  );
}
