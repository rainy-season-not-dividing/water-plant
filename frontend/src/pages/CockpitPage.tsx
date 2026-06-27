import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { getCockpitCostOverview, getCockpitLeadership, getCockpitUnitAnalysis } from '../api/services/cockpitService';
import { CockpitAIChatPanel } from '../components/cockpit/CockpitAIChatPanel';
import { CockpitAIProvider, useCockpitAIContext } from '../components/cockpit/CockpitAIContext';
import { CockpitShell } from '../components/cockpit/CockpitShell';
import { CostOverviewView } from '../components/cockpit/CostOverviewView';
import { LeadershipView } from '../components/cockpit/LeadershipView';
import { UnitAnalysisView } from '../components/cockpit/UnitAnalysisView';
import type {
  CockpitCostOverviewPayload,
  CockpitLeadershipPayload,
  CockpitSectionKey,
  CockpitSidebarItem,
  CockpitUnitAnalysisPayload,
} from '../types/cockpit';

type CockpitPageState = {
  leadership: CockpitLeadershipPayload | null;
  'cost-overview': CockpitCostOverviewPayload | null;
  'unit-analysis': CockpitUnitAnalysisPayload | null;
};

function LoadingState() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(0,229,255,0.12),_transparent_28%),linear-gradient(180deg,_#071220_0%,_#09172a_55%,_#0a1525_100%)] px-6 py-10 text-slate-100">
      <div className="rounded-[28px] border border-cyan-500/20 bg-slate-950/80 px-8 py-10 text-center shadow-[0_24px_60px_rgba(2,6,23,0.24)]">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-cyan-400/20 border-t-cyan-300" />
        <div className="mt-5 text-lg font-medium text-white">正在加载驾驶舱数据</div>
        <div className="mt-2 text-sm text-slate-400">正在同步最新统计信息</div>
      </div>
    </main>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(0,229,255,0.12),_transparent_28%),linear-gradient(180deg,_#071220_0%,_#09172a_55%,_#0a1525_100%)] px-6 py-10 text-slate-100">
      <div className="max-w-xl rounded-[28px] border border-rose-500/20 bg-slate-950/85 px-8 py-10 text-center shadow-[0_24px_60px_rgba(2,6,23,0.24)]">
        <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/10 text-rose-300">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <div className="mt-5 text-xl font-semibold text-white">驾驶舱加载失败</div>
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

function getSectionFromPath(): CockpitSectionKey {
  const path = window.location.pathname;
  if (path.startsWith('/cockpit/cost-overview')) return 'cost-overview';
  if (path.startsWith('/cockpit/unit-analysis')) return 'unit-analysis';
  return 'leadership';
}

function updateBrowserPath(section: CockpitSectionKey) {
  const pathMap: Record<CockpitSectionKey, string> = {
    leadership: '/cockpit',
    'cost-overview': '/cockpit/cost-overview',
    'unit-analysis': '/cockpit/unit-analysis',
  };
  window.history.replaceState({}, '', pathMap[section]);
}

export default function CockpitPage() {
  const [activeSection, setActiveSection] = useState<CockpitSectionKey>(getSectionFromPath);
  const [payloads, setPayloads] = useState<CockpitPageState>({
    leadership: null,
    'cost-overview': null,
    'unit-analysis': null,
  });
  const [selectedCostTab, setSelectedCostTab] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSection = async (section: CockpitSectionKey, refresh = false) => {
    if (!refresh && payloads[section]) return;
    const loader =
      section === 'leadership'
        ? getCockpitLeadership
        : section === 'cost-overview'
          ? getCockpitCostOverview
          : getCockpitUnitAnalysis;
    const next = await loader(refresh);
    setPayloads((prev) => ({ ...prev, [section]: next }));
  };

  const loadInitial = async () => {
    try {
      setError(null);
      setIsLoading(true);
      const leadership = await getCockpitLeadership();
      setPayloads((prev) => ({ ...prev, leadership }));
      if (activeSection !== 'leadership') {
        await loadSection(activeSection);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadInitial();
  }, []);

  useEffect(() => {
    updateBrowserPath(activeSection);
    if (!payloads[activeSection]) {
      void loadSection(activeSection).catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });
    }
  }, [activeSection]);

  useEffect(() => {
    const fallbackTab = payloads['cost-overview']?.selectedTab ?? null;
    setSelectedCostTab((prev) => prev ?? fallbackTab);
  }, [payloads['cost-overview']?.selectedTab]);

  const handleRefresh = async () => {
    try {
      setError(null);
      setIsRefreshing(true);
      await loadSection(activeSection, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRefreshing(false);
    }
  };

  const shellData = useMemo(() => payloads[activeSection] ?? payloads.leadership, [activeSection, payloads]);

  const sidebar: CockpitSidebarItem[] =
    shellData?.pageKey === 'leadership'
      ? shellData.sidebar
      : [
          { key: 'leadership', label: '集团总览' },
          { key: 'cost-overview', label: '成本总览' },
          { key: 'unit-analysis', label: '单耗分析' },
        ];

  if (isLoading && !payloads.leadership) return <LoadingState />;
  if (error && !shellData) return <ErrorState message={error} onRetry={() => void loadInitial()} />;
  if (!shellData) return null;

  return (
    <CockpitAIProvider section={activeSection} selectedTab={selectedCostTab}>
      <CockpitPageContent
        shellData={shellData}
        sidebar={sidebar}
        activeSection={activeSection}
        payloads={payloads}
        selectedCostTab={selectedCostTab}
        isRefreshing={isRefreshing}
        isChatOpen={isChatOpen}
        error={error}
        onNavigate={setActiveSection}
        onRefresh={() => void handleRefresh()}
        onOpenChat={() => setIsChatOpen(true)}
        onCloseChat={() => setIsChatOpen(false)}
        onSelectedTabChange={setSelectedCostTab}
      />
    </CockpitAIProvider>
  );
}

function CockpitPageContent({
  shellData,
  sidebar,
  activeSection,
  payloads,
  selectedCostTab,
  isRefreshing,
  isChatOpen,
  error,
  onNavigate,
  onRefresh,
  onOpenChat,
  onCloseChat,
  onSelectedTabChange,
}: {
  shellData: CockpitLeadershipPayload | CockpitCostOverviewPayload | CockpitUnitAnalysisPayload;
  sidebar: CockpitSidebarItem[];
  activeSection: CockpitSectionKey;
  payloads: CockpitPageState;
  selectedCostTab: string | null;
  isRefreshing: boolean;
  isChatOpen: boolean;
  error: string | null;
  onNavigate: (key: CockpitSectionKey) => void;
  onRefresh: () => void;
  onOpenChat: () => void;
  onCloseChat: () => void;
  onSelectedTabChange: (tab: string | null) => void;
}) {
  const mainContent = (
    <>
      {error ? (
        <div className="mb-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          最近一次刷新失败：{error}
        </div>
      ) : null}

      {activeSection === 'leadership' && payloads.leadership ? <LeadershipView data={payloads.leadership} /> : null}
      {activeSection === 'cost-overview' && payloads['cost-overview'] ? (
        <CostOverviewView
          data={payloads['cost-overview']}
          selectedTab={selectedCostTab ?? payloads['cost-overview'].selectedTab}
          onSelectedTabChange={(tab) => onSelectedTabChange(tab)}
        />
      ) : null}
      {activeSection === 'unit-analysis' && payloads['unit-analysis'] ? <UnitAnalysisView data={payloads['unit-analysis']} /> : null}
    </>
  );

  return (
    <>
      <CockpitShellFrame
        title={shellData.title}
        subtitle={shellData.subtitle}
        factory={shellData.factory}
        sourceStatus={shellData.sourceStatus}
        sidebar={sidebar}
        activeSection={activeSection}
        isRefreshing={isRefreshing}
        isChatOpen={isChatOpen}
        onNavigate={onNavigate}
        onRefresh={onRefresh}
        onOpenChat={onOpenChat}
      >
        {mainContent}
      </CockpitShellFrame>

      <CockpitAIChatPanel
        isOpen={isChatOpen}
        section={activeSection}
        selectedTab={selectedCostTab}
        onClose={onCloseChat}
      />
    </>
  );
}

function CockpitShellFrame({
  title,
  subtitle,
  factory,
  sourceStatus,
  sidebar,
  activeSection,
  isRefreshing,
  isChatOpen,
  onNavigate,
  onRefresh,
  onOpenChat,
  children,
}: {
  title: string;
  subtitle: string;
  factory: CockpitLeadershipPayload['factory'] | CockpitCostOverviewPayload['factory'] | CockpitUnitAnalysisPayload['factory'];
  sourceStatus:
    | CockpitLeadershipPayload['sourceStatus']
    | CockpitCostOverviewPayload['sourceStatus']
    | CockpitUnitAnalysisPayload['sourceStatus'];
  sidebar: CockpitSidebarItem[];
  activeSection: CockpitSectionKey;
  isRefreshing: boolean;
  isChatOpen: boolean;
  onNavigate: (key: CockpitSectionKey) => void;
  onRefresh: () => void;
  onOpenChat: () => void;
  children: ReactNode;
}) {
  const { status } = useCockpitAIContext();

  return (
    <CockpitShell
      title={title}
      subtitle={subtitle}
      factory={factory}
      sourceStatus={sourceStatus}
      sidebar={sidebar}
      activeKey={activeSection}
      isRefreshing={isRefreshing}
      isChatOpen={isChatOpen}
      isChatAnalyzing={status === 'streaming'}
      onNavigate={onNavigate}
      onRefresh={onRefresh}
      onOpenChat={onOpenChat}
    >
      {children}
    </CockpitShell>
  );
}
