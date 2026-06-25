export type CockpitSectionKey = 'leadership' | 'cost-overview' | 'unit-analysis';

export interface CockpitFactoryInfo {
  id: string;
  name: string;
  productionScale: number;
  location: string;
}

export interface CockpitSourceStatus {
  mode: string;
  ok: boolean;
  message: string;
  factoryName: string;
  updatedAt: string;
  recordMonth: string;
  dataSource: string;
}

export interface CockpitSidebarItem {
  key: CockpitSectionKey;
  label: string;
}

export interface CockpitMetricCard {
  key: string;
  title: string;
  value: number;
  unit: string;
  icon?: string;
  factoryName?: string;
  dateRange?: string;
  formula?: string;
}

export interface CockpitChartSeriesPair {
  actual: number[];
  predicted: number[];
}

export interface CockpitLeadershipPayload {
  pageKey: 'leadership';
  title: string;
  subtitle: string;
  factory: CockpitFactoryInfo;
  sourceStatus: CockpitSourceStatus;
  cards: CockpitMetricCard[];
  charts: {
    monthlyWaterTrend: {
      title: string;
      factoryName: string;
      unit: string;
      categories: string[];
      values: number[];
    };
    powerPerTonTrend: {
      title: string;
      factoryName: string;
      unit: string;
      categories: string[];
      actual: number[];
      predicted: number[];
    };
  };
  sidebar: CockpitSidebarItem[];
}

export interface CockpitCostCompositionItem {
  name: string;
  value: number;
}

export interface CockpitCostConfigRow {
  time: string;
  electricityPrice: number;
  rawWaterPrice: number;
  tailWaterPrice: number;
  laborCost: number;
  otherCosts: number;
  ufSodiumHypochlorite: number;
  ufAcidDosing: number;
  ufAlkaliDosing: number;
  roAlkaliDosing: number;
  roScaleInhibitor: number;
  roReducingAgent: number;
  roNonOxidizingBiocide: number;
  roAcidDosing: number;
}

export interface CockpitMonthlyTab {
  key: string;
  label: string;
}

export interface CockpitCostOverviewMonthlyView {
  headlineCards: CockpitMetricCard[];
  subCards: CockpitMetricCard[];
  costComposition: CockpitCostCompositionItem[];
  costTrend: {
    labels: string[];
    actual: Array<number | string>;
    predicted: Array<number | string>;
  };
  configRows: CockpitCostConfigRow[];
}

export interface CockpitCostOverviewPayload {
  pageKey: 'cost-overview';
  title: string;
  subtitle: string;
  factory: CockpitFactoryInfo;
  sourceStatus: CockpitSourceStatus;
  monthlyTabs: CockpitMonthlyTab[];
  selectedTab: string;
  recordMonth: string;
  monthlyViews: Record<string, CockpitCostOverviewMonthlyView>;
}

export interface CockpitChemicalDetailItem {
  key: string;
  label: string;
  dosage: number;
  price: number;
  cost: number;
}

export interface CockpitUnitCoreMetricSeries {
  name: string;
  unit: string;
  actual: number;
  predicted: number;
}

export interface CockpitUnitAnalysisPayload {
  pageKey: 'unit-analysis';
  title: string;
  subtitle: string;
  factory: CockpitFactoryInfo;
  sourceStatus: CockpitSourceStatus;
  cards: CockpitMetricCard[];
  coreMetrics: {
    categories: string[];
    series: CockpitUnitCoreMetricSeries[];
  };
  chemicalCostChart: CockpitChartSeriesPair & {
    categories: string[];
  };
  chemicalDetailItems: CockpitChemicalDetailItem[];
}

export interface CockpitDashboardPayload {
  leadership: CockpitLeadershipPayload;
  costOverview: CockpitCostOverviewPayload;
  unitAnalysis: CockpitUnitAnalysisPayload;
}
