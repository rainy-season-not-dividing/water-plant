import { create } from 'zustand';
import type { AgentId, EventLogEntry, NotificationItem, LODLevel } from '../types/index';

// ─── 顶部 MetricsOverlay 指标 ───

export interface AlarmMetric {
  count: number;
  level: 'none' | 'low' | 'high';
}

export interface ProductionMetric {
  value: number;
  unit: string;
  status: 'normal' | 'warning';
}

export interface HealthMetric {
  label: string;
  level: 'good' | 'warning' | 'critical';
}

// ─── Store 接口 ───

export interface SystemState {
  // 顶部概览指标
  alarm: AlarmMetric;
  production: ProductionMetric;
  health: HealthMetric;

  // 事件日志（右侧面板）
  eventLog: EventLogEntry[];

  // 通知队列
  notifications: NotificationItem[];

  // 性能 / LOD
  currentFps: number;
  lodLevel: LODLevel;

  // 系统时钟
  systemTime: string;

  // Agent 在线统计
  onlineAgentCount: number;
  totalAgentCount: number;
}

export interface SystemActions {
  // 事件日志
  pushEvent: (entry: Omit<EventLogEntry, 'id'>) => void;
  clearEvents: () => void;

  // 通知
  pushNotification: (notification: Omit<NotificationItem, 'id'>) => void;
  dismissNotification: (id: string) => void;
  clearNotifications: () => void;

  // 性能
  updateFps: (fps: number) => void;

  // 时钟
  updateSystemTime: (time: string) => void;
}

let eventIdCounter = 0;
let notificationIdCounter = 0;
let notificationTimer: ReturnType<typeof setTimeout> | null = null;

const MAX_EVENT_LOG_SIZE = 20;
const ERROR_DISMISS_MS = 5000;
const RECOVERY_DISMISS_MS = 2000;

function getDefaultDismissMs(level: NotificationItem['level']) {
  return level === 'success' ? RECOVERY_DISMISS_MS : ERROR_DISMISS_MS;
}

function scheduleDismiss(id: string, autoDismissMs: number, dismiss: (id: string) => void) {
  if (notificationTimer) clearTimeout(notificationTimer);
  notificationTimer = setTimeout(() => {
    dismiss(id);
    notificationTimer = null;
  }, autoDismissMs);
}

export const useSystemStore = create<SystemState & SystemActions>((set, get) => ({
  // 初始状态
  alarm: { count: 0, level: 'none' },
  production: { value: 81, unit: '%', status: 'normal' },
  health: { label: '良好', level: 'good' },
  eventLog: [],
  notifications: [],
  currentFps: 60,
  lodLevel: 'full',
  systemTime: '',
  onlineAgentCount: 5,
  totalAgentCount: 5,

  // ─── Actions ───

  pushEvent: (entry) => {
    const id = `evt_${++eventIdCounter}_${Date.now()}`;
    set((state) => ({
      eventLog: [{ ...entry, id }, ...state.eventLog].slice(0, MAX_EVENT_LOG_SIZE),
    }));
  },

  clearEvents: () => set({ eventLog: [] }),

  pushNotification: (notification) => {
    const id = `notif_${++notificationIdCounter}_${Date.now()}`;
    const autoDismissMs = notification.autoDismissMs ?? getDefaultDismissMs(notification.level);

    let nextNotification: NotificationItem = { ...notification, id, autoDismissMs };
    const current = get().notifications[0];

    if (notification.level === 'error' && current?.level === 'error') {
      const relatedAgentIds = Array.from(
        new Set([...(current.relatedAgentIds ?? [current.agentId]), ...(notification.relatedAgentIds ?? [notification.agentId])])
      );
      const incidentCount = relatedAgentIds.length;
      nextNotification = {
        ...nextNotification,
        agentId: incidentCount > 1 ? 'supervisor' : notification.agentId,
        relatedAgentIds,
        incidentCount,
        title: incidentCount > 1 ? `${incidentCount} 个异常` : notification.title,
        description:
          incidentCount > 1
            ? `检测到 ${incidentCount} 个 Agent 异常并发，监管智能体已合并处理。`
            : notification.description,
      };
    }

    set({ notifications: [nextNotification] });
    scheduleDismiss(nextNotification.id, nextNotification.autoDismissMs, get().dismissNotification);
  },

  dismissNotification: (id) => {
    if (notificationTimer) {
      clearTimeout(notificationTimer);
      notificationTimer = null;
    }
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },

  clearNotifications: () => {
    if (notificationTimer) {
      clearTimeout(notificationTimer);
      notificationTimer = null;
    }
    set({ notifications: [] });
  },

  updateFps: (fps) => {
    const prev = get().lodLevel;
    let lodLevel: LODLevel = prev;

    if (fps < 15) lodLevel = 'lod3';
    else if (fps < 20) lodLevel = 'lod2';
    else if (fps < 30) lodLevel = 'lod1';
    else lodLevel = 'full';

    set({ currentFps: fps, lodLevel });
  },

  updateSystemTime: (time) => set({ systemTime: time }),
}));
