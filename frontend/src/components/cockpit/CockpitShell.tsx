import type { ReactNode } from 'react';
import {
  Activity,
  BarChart3,
  Beaker,
  Coins,
  Droplets,
  LayoutDashboard,
  LineChart,
  MessageSquareText,
  RefreshCw,
  Waves,
  Zap,
} from 'lucide-react';
import type { CockpitFactoryInfo, CockpitSectionKey, CockpitSidebarItem, CockpitSourceStatus } from '../../types/cockpit';

const ICON_MAP = {
  leadership: LayoutDashboard,
  'cost-overview': Coins,
  'unit-analysis': Activity,
  zap: Zap,
  'flask-conical': Beaker,
  droplets: Droplets,
  coins: Coins,
  waves: Waves,
  'line-chart': LineChart,
  'pie-chart': BarChart3,
} as const;

export function getCockpitIcon(name?: string) {
  if (!name) return LayoutDashboard;
  return ICON_MAP[name as keyof typeof ICON_MAP] ?? LayoutDashboard;
}

interface CockpitShellProps {
  title: string;
  subtitle: string;
  factory: CockpitFactoryInfo;
  sourceStatus: CockpitSourceStatus;
  sidebar: CockpitSidebarItem[];
  activeKey: CockpitSectionKey;
  isRefreshing: boolean;
  isChatOpen: boolean;
  onNavigate: (key: CockpitSectionKey) => void;
  onRefresh: () => void;
  onOpenChat: () => void;
  children: ReactNode;
}

export function CockpitShell({
  title,
  subtitle,
  factory,
  sourceStatus,
  sidebar,
  activeKey,
  isRefreshing,
  isChatOpen,
  onNavigate,
  onRefresh,
  onOpenChat,
  children,
}: CockpitShellProps) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(0,229,255,0.12),_transparent_28%),linear-gradient(180deg,_#071220_0%,_#09172a_55%,_#0a1525_100%)] px-4 py-4 text-slate-100 md:px-6 md:py-6">
      <div className="mx-auto flex w-full max-w-[1900px] gap-4">
        <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-[250px] shrink-0 flex-col rounded-[28px] border border-cyan-500/15 bg-[#091526]/95 p-5 shadow-[0_30px_80px_rgba(1,9,20,0.45)] xl:flex">
          <div className="border-b border-cyan-500/12 pb-5">
            <div className="text-sm font-semibold uppercase tracking-[0.35em] text-cyan-300/80">未来水厂</div>
            <div className="mt-3 text-3xl font-bold text-white">{title}</div>
            <div className="mt-2 text-sm text-slate-400">{subtitle}</div>
          </div>

          <div className="mt-6 text-xs uppercase tracking-[0.28em] text-slate-500">快速入口</div>
          <nav className="mt-4 space-y-3">
            {sidebar.map((item) => {
              const Icon = getCockpitIcon(item.key);
              const active = item.key === activeKey;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onNavigate(item.key)}
                  className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                    active
                      ? 'border-cyan-400/50 bg-cyan-500/12 text-white shadow-[0_0_0_1px_rgba(34,211,238,0.16)]'
                      : 'border-slate-800 bg-slate-950/35 text-slate-300 hover:border-cyan-500/25 hover:bg-cyan-500/8 hover:text-white'
                  }`}
                >
                  <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${active ? 'bg-cyan-400/18 text-cyan-200' : 'bg-slate-900 text-slate-400'}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="font-medium">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="mt-6 border-t border-cyan-500/12 pt-6">
            <div className="mb-3 text-xs uppercase tracking-[0.28em] text-slate-500">AI 助手</div>
            <button
              type="button"
              onClick={onOpenChat}
              className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                isChatOpen
                  ? 'border-cyan-400/50 bg-cyan-500/12 text-white shadow-[0_0_0_1px_rgba(34,211,238,0.16)]'
                  : 'border-slate-800 bg-slate-950/35 text-slate-300 hover:border-cyan-500/25 hover:bg-cyan-500/8 hover:text-white'
              }`}
            >
              <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${isChatOpen ? 'bg-cyan-400/18 text-cyan-200' : 'bg-slate-900 text-slate-400'}`}>
                <MessageSquareText className="h-5 w-5" />
              </span>
              <div className="font-medium">AI 分析助手</div>
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <section className="rounded-[30px] border border-cyan-500/12 bg-[linear-gradient(135deg,rgba(6,16,30,0.95),rgba(8,18,34,0.9))] px-6 py-6 shadow-[0_32px_90px_rgba(2,6,23,0.42)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/18 bg-cyan-500/10 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-cyan-200">
                  <LayoutDashboard className="h-3.5 w-3.5" />
                  Leadership Cockpit
                </div>
                <h1 className="mt-5 text-4xl font-bold tracking-tight text-white md:text-5xl">{factory.name || '未来水厂'}</h1>
                <p className="mt-3 text-sm leading-7 text-slate-400 md:max-w-2xl">{subtitle}</p>
                <div className="mt-5 flex flex-wrap gap-3 text-xs text-slate-300">
                  <span className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1.5">生产规模 {factory.productionScale || 3000} m3/d</span>
                  <span className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1.5">位置 {factory.location || '沧州'}</span>
                  <span className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1.5">数据周期 {sourceStatus.recordMonth || '-'}</span>
                </div>
              </div>

              <div className="min-w-[300px] rounded-[26px] border border-cyan-500/12 bg-slate-950/55 p-5">
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-500">数据状态</div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${sourceStatus.ok ? 'bg-emerald-500/12 text-emerald-300' : 'bg-rose-500/12 text-rose-300'}`}>
                    {sourceStatus.ok ? '在线' : '异常'}
                  </span>
                </div>
                <div className="mt-4 grid gap-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">数据来源</span>
                    <span className="font-semibold text-slate-100">{sourceStatus.dataSource}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">最近更新</span>
                    <span className="font-semibold text-slate-100">{sourceStatus.updatedAt || '-'}</span>
                  </div>
                </div>
                <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/75 px-3 py-2 text-xs text-slate-300">{sourceStatus.message}</div>
                <button
                  type="button"
                  onClick={onRefresh}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-500/18 bg-cyan-500/8 px-4 py-3 text-sm font-medium text-cyan-100 transition hover:border-cyan-400/45 hover:bg-cyan-500/14"
                >
                  <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  刷新数据
                </button>
              </div>
            </div>
          </section>

          <div className="mt-6 xl:hidden">
            <div className="grid gap-3 sm:grid-cols-3">
              {sidebar.map((item) => {
                const Icon = getCockpitIcon(item.key);
                const active = item.key === activeKey;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onNavigate(item.key)}
                    className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                      active
                        ? 'border-cyan-400/50 bg-cyan-500/12 text-white'
                        : 'border-slate-800 bg-slate-950/50 text-slate-300 hover:border-cyan-500/25 hover:text-white'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6">{children}</div>
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenChat}
        className="fixed bottom-6 right-6 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-500/15 text-cyan-100 shadow-[0_16px_40px_rgba(34,211,238,0.18)] transition hover:border-cyan-300/50 hover:bg-cyan-500/20 xl:hidden"
        aria-label="打开 AI 分析助手"
      >
        <MessageSquareText className="h-5 w-5" />
      </button>
    </main>
  );
}
