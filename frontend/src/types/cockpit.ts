export interface CockpitTrendMeta {
  direction: 'up' | 'down' | 'stable';
  delta: number;
  label: string;
}

export interface CockpitKpi {
  key: string;
  label: string;
  value: number;
  unit: string;
  trend: CockpitTrendMeta;
}

export interface CockpitFactoryInfo {
  id: string;
  name: string;
  productionScale: number;
  location: string;
}

export interface CockpitAlert {
  name: string;
  severity: string;
  severityColor: string;
  time: string;
  reason: string;
  solution: string;
  content: string;
}

export interface CockpitSummaryCard {
  key: string;
  title: string;
  summary: string;
  status: 'normal' | 'attention';
}

export interface CockpitRecentPeriod {
  period: string;
  label: string;
  totalCost: number;
  costPerTon: number;
}

export interface CockpitOverviewSection {
  title: string;
  subtitle: string;
  factory: CockpitFactoryInfo;
  updatedAt: string;
  kpis: CockpitKpi[];
  summaryCards: CockpitSummaryCard[];
  alerts: CockpitAlert[];
  recentPeriods: CockpitRecentPeriod[];
}

export interface CockpitCostBreakdownItem {
  key: string;
  label: string;
  value: number;
}

export interface CockpitCostTrendPoint {
  period: string;
  label: string;
  totalCost: number;
  costPerTon: number;
}

export interface CockpitCostOverviewSection {
  headline: {
    totalCost: number;
    costPerTon: number;
    rawWaterVolume: number;
    productionVolume: number;
  };
  breakdown: CockpitCostBreakdownItem[];
  trend: CockpitCostTrendPoint[];
  insights: string[];
}

export interface CockpitUnitCard {
  key: string;
  label: string;
  value: number;
  unit: string;
}

export interface CockpitComparisonPoint {
  period: string;
  label: string;
  electricityPerTon: number;
  chemicalCost: number;
}

export interface CockpitChemicalItem {
  key: string;
  label: string;
  dosage: number;
  price: number;
  cost: number;
}

export interface CockpitHistorySnapshotItem {
  key: string;
  label: string;
  unit: string;
  value: number;
  capturedAt: string;
}

export interface CockpitUnitAnalysisSection {
  unitCards: CockpitUnitCard[];
  comparisonSeries: CockpitComparisonPoint[];
  chemicalItems: CockpitChemicalItem[];
  historySnapshot: CockpitHistorySnapshotItem[];
}

export interface CockpitBudgetMonthPoint {
  month: string;
  budget: number;
  actual: number | null;
  forecast: number | null;
}

export interface CockpitBudgetItem {
  key: string;
  name: string;
  yearBudget: number;
  yearActual: number;
}

export interface CockpitBudgetSection {
  annualBudget: number;
  executed: number;
  remaining: number;
  executionRate: number;
  monthlySeries: CockpitBudgetMonthPoint[];
  items: CockpitBudgetItem[];
  insights: string[];
}

export interface CockpitHistoryPoint {
  date: string;
  value: number;
}

export interface CockpitHistorySeries {
  key: string;
  label: string;
  unit: string;
  points: CockpitHistoryPoint[];
}

export interface CockpitHistoryTrendSection {
  defaultRangeDays: number;
  realtimeSnapshot: CockpitHistorySnapshotItem[];
  series: CockpitHistorySeries[];
}

export interface CockpitSourceStatus {
  mode: string;
  ok: boolean;
  message: string;
  factoryName: string;
  updatedAt: string;
  recordMonth: string;
}

export interface CockpitDashboardPayload {
  overview: CockpitOverviewSection;
  costOverview: CockpitCostOverviewSection;
  unitAnalysis: CockpitUnitAnalysisSection;
  budget: CockpitBudgetSection;
  historyTrend: CockpitHistoryTrendSection;
  sourceStatus: CockpitSourceStatus;
}
