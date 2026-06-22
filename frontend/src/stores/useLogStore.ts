import { create } from 'zustand';
import type { ScenarioLogRecord } from '../types';

export interface LogState {
  records: ScenarioLogRecord[];
  activeRecordId: string | null;
  hydratedFromBackend: boolean;
  isHydrating: boolean;
  isLoadingMore: boolean;
  historyLimit: number;
  restoredEventCount: number;
  restoredRecordCount: number;
  hasMoreHistory: boolean;
  unreadCount: number;
}

export interface LogActions {
  startScenarioLog: (record: Omit<ScenarioLogRecord, 'id'>) => string;
  getActiveScenarioLog: () => ScenarioLogRecord | null;
  updateActiveScenarioLog: (patch: Partial<Omit<ScenarioLogRecord, 'id'>>) => void;
  updateScenarioLog: (id: string, patch: Partial<Omit<ScenarioLogRecord, 'id'>>) => void;
  hydrateLogsFromBackend: (payload: {
    records: ScenarioLogRecord[];
    eventCount?: number;
    limit?: number;
    hasMore?: boolean;
  }) => void;
  setHydrating: (isHydrating: boolean) => void;
  setLoadingMore: (isLoadingMore: boolean) => void;
  markLogsRead: () => void;
  clearLogs: () => void;
}

let logCounter = 0;

export const useLogStore = create<LogState & LogActions>((set) => ({
  records: [],
  activeRecordId: null,
  hydratedFromBackend: false,
  isHydrating: false,
  isLoadingMore: false,
  historyLimit: 100,
  restoredEventCount: 0,
  restoredRecordCount: 0,
  hasMoreHistory: false,
  unreadCount: 0,

  startScenarioLog: (record) => {
    const id = `hist_${++logCounter}_${Date.now()}`;
    set((state) => ({
      records: [{ ...record, id, sortAt: record.sortAt ?? new Date().toISOString() }, ...state.records].slice(0, 100),
      activeRecordId: id,
      unreadCount: state.unreadCount + 1,
    }));
    return id;
  },

  getActiveScenarioLog: () => {
    const state = useLogStore.getState();
    return state.records.find((record) => record.id === state.activeRecordId) ?? null;
  },

  updateActiveScenarioLog: (patch) => {
    set((state) => {
      if (!state.activeRecordId) return state;
      return {
        records: state.records.map((record) =>
          record.id === state.activeRecordId ? { ...record, ...patch } : record,
        ),
      };
    });
  },

  updateScenarioLog: (id, patch) => {
    set((state) => ({
      records: state.records.map((record) => (record.id === id ? { ...record, ...patch } : record)),
    }));
  },

  hydrateLogsFromBackend: (payload) => {
    set((state) => {
      const merged = new Map<string, ScenarioLogRecord>();
      for (const record of payload.records) merged.set(record.id, record);
      for (const record of state.records) merged.set(record.id, record);
      const historyLimit = payload.limit ?? state.historyLimit;
      const records = [...merged.values()]
        .sort((a, b) => (b.sortAt ?? b.startedAt).localeCompare(a.sortAt ?? a.startedAt))
        .slice(0, historyLimit);
      return {
        records,
        hydratedFromBackend: true,
        isHydrating: false,
        isLoadingMore: false,
        historyLimit,
        restoredEventCount: payload.eventCount ?? state.restoredEventCount,
        restoredRecordCount: payload.records.length,
        hasMoreHistory: payload.hasMore ?? state.hasMoreHistory,
      };
    });
  },

  setHydrating: (isHydrating) => set({ isHydrating }),

  setLoadingMore: (isLoadingMore) => set({ isLoadingMore }),

  markLogsRead: () => set({ unreadCount: 0 }),

  clearLogs: () =>
    set({
      records: [],
      activeRecordId: null,
      hydratedFromBackend: false,
      isHydrating: false,
      isLoadingMore: false,
      restoredEventCount: 0,
      restoredRecordCount: 0,
      hasMoreHistory: false,
      unreadCount: 0,
    }),
}));
