import type { AgentId, AgentUIStatus } from '../../types/index';

export interface TaskbarWindowItem {
  agentId: AgentId;
  title: string;
  status: AgentUIStatus;
  isActive: boolean;
  isMinimized: boolean;
}

export interface TaskbarProps {
  windows: TaskbarWindowItem[];
  notificationCount: number;
  currentTime: string;
  onHome: () => void;
  onSelectWindow: (agentId: AgentId) => void;
  onOpenNotifications?: () => void;
  className?: string;
}

export function Taskbar({
  windows,
  notificationCount,
  currentTime,
  onHome,
  onSelectWindow,
  onOpenNotifications,
  className = '',
}: TaskbarProps) {
  return (
    <footer className={`flex items-center gap-3 border-t border-[var(--color-border-default)] bg-[var(--color-surface-base)] px-3 py-2 ${className}`}>
      <button
        type="button"
        onClick={onHome}
        className="rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-slate-900 px-3 py-1.5 text-sm text-slate-100 hover:border-[var(--color-border-active)]"
      >
        Home
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        {windows.map((windowItem) => (
          <button
            key={windowItem.agentId}
            type="button"
            onClick={() => onSelectWindow(windowItem.agentId)}
            className={`min-w-28 rounded-[var(--radius-card)] border px-3 py-1.5 text-left text-xs ${
              windowItem.isActive
                ? 'border-[var(--color-border-active)] bg-cyan-400/10 text-cyan-100'
                : 'border-[var(--color-border-default)] bg-slate-900 text-slate-300'
            }`}
          >
            <span className="block truncate">{windowItem.title}</span>
            <span className="block text-[10px] capitalize text-slate-500">
              {windowItem.isMinimized ? 'minimized' : windowItem.status}
            </span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onOpenNotifications}
        className="relative rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-slate-900 px-3 py-1.5 text-sm text-slate-100"
        aria-label="打开日志记录"
      >
        日志记录
        {notificationCount > 0 ? (
          <span className="ml-2 rounded-full bg-rose-500 px-1.5 text-xs text-white">{notificationCount}</span>
        ) : null}
      </button>

      <time className="min-w-20 text-right text-xs font-mono text-slate-300">{currentTime}</time>
    </footer>
  );
}
