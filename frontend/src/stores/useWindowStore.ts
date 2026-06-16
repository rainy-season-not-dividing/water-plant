import { create } from 'zustand';
import type { AgentId, WindowState } from '../types/index';

// ─── Store 接口 ───

export interface WindowManagerState {
  windows: Record<AgentId, WindowState>;
  activeWindowId: AgentId | null;
  maxZIndex: number;
}

export interface WindowManagerActions {
  openWindow: (agentId: AgentId) => void;
  openAllWindowsTiled: (viewport?: { width: number; height: number }) => void;
  closeWindow: (agentId: AgentId) => void;
  minimizeWindow: (agentId: AgentId) => void;
  restoreWindow: (agentId: AgentId) => void;
  focusWindow: (agentId: AgentId) => void;
  moveWindow: (agentId: AgentId, position: { x: number; y: number }) => void;
  resizeWindow: (agentId: AgentId, size: { width: number; height: number }) => void;
  closeAllWindows: () => void;
  getOpenWindows: () => WindowState[];
  cycleWindow: (direction: 'next' | 'prev') => void;
}

const DEFAULT_WINDOW_SIZE = { width: 420, height: 520 };
const TILED_WINDOW_SIZE = { width: 340, height: 310 };

const DEFAULT_POSITIONS: Record<AgentId, { x: number; y: number }> = {
  supervisor: { x: 200, y: 100 },
  dosing: { x: 260, y: 140 },
  uf: { x: 320, y: 180 },
  ro: { x: 380, y: 120 },
  pump: { x: 440, y: 160 },
};

const TILED_ORDER: AgentId[] = ['supervisor', 'uf', 'ro', 'dosing', 'pump'];

function getTiledLayout(viewport?: { width: number; height: number }): Record<AgentId, { position: { x: number; y: number }; size: { width: number; height: number } }> {
  const width = viewport?.width ?? window.innerWidth;
  const height = viewport?.height ?? window.innerHeight;
  const dockOffset = 96;
  const rightPanelOffset = 328;
  const topOffset = 128;
  const bottomOffset = 88;
  const gap = 12;
  const availableWidth = Math.max(760, width - dockOffset - rightPanelOffset - 48);
  const availableHeight = Math.max(520, height - topOffset - bottomOffset);
  const columns = availableWidth >= 1060 ? 3 : 2;
  const rows = Math.ceil(TILED_ORDER.length / columns);
  const tileWidth = Math.max(300, Math.min(TILED_WINDOW_SIZE.width, Math.floor((availableWidth - gap * (columns - 1)) / columns)));
  const tileHeight = Math.max(260, Math.min(TILED_WINDOW_SIZE.height, Math.floor((availableHeight - gap * (rows - 1)) / rows)));
  const startX = 96;
  const startY = 116;

  return TILED_ORDER.reduce((acc, agentId, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    acc[agentId] = {
      position: {
        x: startX + column * (tileWidth + gap),
        y: startY + row * (tileHeight + gap),
      },
      size: { width: tileWidth, height: tileHeight },
    };
    return acc;
  }, {} as Record<AgentId, { position: { x: number; y: number }; size: { width: number; height: number } }>);
}

function createDefaultWindow(agentId: AgentId): WindowState {
  return {
    agentId,
    isOpen: false,
    isMinimized: false,
    position: DEFAULT_POSITIONS[agentId],
    size: { ...DEFAULT_WINDOW_SIZE },
    zIndex: 10,
  };
}

const INITIAL_WINDOWS: Record<AgentId, WindowState> = {
  supervisor: createDefaultWindow('supervisor'),
  dosing: createDefaultWindow('dosing'),
  uf: createDefaultWindow('uf'),
  ro: createDefaultWindow('ro'),
  pump: createDefaultWindow('pump'),
};

function getNextActiveWindowId(windows: Record<AgentId, WindowState>): AgentId | null {
  const visibleWindows = (Object.values(windows) as WindowState[]).filter(
    (windowItem) => windowItem.isOpen && !windowItem.isMinimized
  );

  if (!visibleWindows.length) return null;

  return visibleWindows.sort((a, b) => b.zIndex - a.zIndex)[0].agentId;
}

export const useWindowStore = create<WindowManagerState & WindowManagerActions>((set, get) => ({
  windows: { ...INITIAL_WINDOWS },
  activeWindowId: null,
  maxZIndex: 10,

  openWindow: (agentId) => {
    const { windows, maxZIndex } = get();
    const win = windows[agentId];

    if (win.isOpen && !win.isMinimized) {
      get().focusWindow(agentId);
      return;
    }

    const newZ = maxZIndex + 1;
    set({
      windows: {
        ...windows,
        [agentId]: { ...win, isOpen: true, isMinimized: false, zIndex: newZ },
      },
      activeWindowId: agentId,
      maxZIndex: newZ,
    });
  },

  openAllWindowsTiled: (viewport) => {
    const layout = getTiledLayout(viewport);
    const nextWindows = { ...get().windows };
    let zIndex = get().maxZIndex;

    for (const agentId of TILED_ORDER) {
      zIndex += 1;
      nextWindows[agentId] = {
        ...nextWindows[agentId],
        isOpen: true,
        isMinimized: false,
        position: layout[agentId].position,
        size: layout[agentId].size,
        zIndex,
      };
    }

    set({
      windows: nextWindows,
      activeWindowId: 'supervisor',
      maxZIndex: zIndex,
    });
  },

  closeWindow: (agentId) => {
    const { windows, activeWindowId } = get();
    const nextWindows = {
      ...windows,
      [agentId]: { ...windows[agentId], isOpen: false, isMinimized: false },
    };

    set({
      windows: nextWindows,
      activeWindowId: activeWindowId === agentId ? getNextActiveWindowId(nextWindows) : activeWindowId,
    });
  },

  minimizeWindow: (agentId) => {
    const { windows, activeWindowId } = get();
    const nextWindows = {
      ...windows,
      [agentId]: { ...windows[agentId], isMinimized: true },
    };

    set({
      windows: nextWindows,
      activeWindowId: activeWindowId === agentId ? getNextActiveWindowId(nextWindows) : activeWindowId,
    });
  },

  restoreWindow: (agentId) => {
    const { windows, maxZIndex } = get();
    const newZ = maxZIndex + 1;
    set({
      windows: {
        ...windows,
        [agentId]: { ...windows[agentId], isOpen: true, isMinimized: false, zIndex: newZ },
      },
      activeWindowId: agentId,
      maxZIndex: newZ,
    });
  },

  focusWindow: (agentId) => {
    const { windows, maxZIndex } = get();
    if (!windows[agentId].isOpen) return;

    const newZ = maxZIndex + 1;
    set({
      windows: {
        ...windows,
        [agentId]: { ...windows[agentId], isMinimized: false, zIndex: newZ },
      },
      activeWindowId: agentId,
      maxZIndex: newZ,
    });
  },

  moveWindow: (agentId, position) => {
    const { windows } = get();
    set({
      windows: {
        ...windows,
        [agentId]: { ...windows[agentId], position },
      },
    });
  },

  resizeWindow: (agentId, size) => {
    const { windows } = get();
    set({
      windows: {
        ...windows,
        [agentId]: {
          ...windows[agentId],
          size: {
            width: Math.max(300, size.width),
            height: Math.max(260, size.height),
          },
        },
      },
    });
  },

  closeAllWindows: () => {
    const reset = Object.fromEntries(
      Object.entries(INITIAL_WINDOWS).map(([id, win]) => [id, { ...win }])
    ) as Record<AgentId, WindowState>;
    set({ windows: reset, activeWindowId: null, maxZIndex: 10 });
  },

  getOpenWindows: () => {
    return (Object.values(get().windows) as WindowState[]).filter((w) => w.isOpen);
  },

  cycleWindow: (direction) => {
    const { windows, activeWindowId } = get();
    const visible = (Object.values(windows) as WindowState[])
      .filter((w) => w.isOpen && !w.isMinimized)
      .sort((a, b) => a.zIndex - b.zIndex);

    if (visible.length < 2) return;

    const currentIndex = visible.findIndex((w) => w.agentId === activeWindowId);
    const nextIndex =
      direction === 'next'
        ? (currentIndex + 1) % visible.length
        : (currentIndex - 1 + visible.length) % visible.length;

    get().focusWindow(visible[nextIndex].agentId);
  },
}));
