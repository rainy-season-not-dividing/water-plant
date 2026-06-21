import { create } from 'zustand';
import type { ScenarioLogRecord } from '../types';

export interface LogState {
  records: ScenarioLogRecord[];
  activeRecordId: string | null;
}

export interface LogActions {
  startScenarioLog: (record: Omit<ScenarioLogRecord, 'id'>) => string;
  getActiveScenarioLog: () => ScenarioLogRecord | null;
  updateActiveScenarioLog: (patch: Partial<Omit<ScenarioLogRecord, 'id'>>) => void;
  updateScenarioLog: (id: string, patch: Partial<Omit<ScenarioLogRecord, 'id'>>) => void;
  clearLogs: () => void;
}

let logCounter = 0;

export const useLogStore = create<LogState & LogActions>((set) => ({
  records: [],
  activeRecordId: null,

  startScenarioLog: (record) => {
    const id = `hist_${++logCounter}_${Date.now()}`;
    set((state) => ({
      records: [{ ...record, id }, ...state.records].slice(0, 100),
      activeRecordId: id,
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

  clearLogs: () => set({ records: [], activeRecordId: null }),
}));
