import type { AgentId, AgentUIStatus } from '../../types/index';

export interface DockAgentItem {
  id: AgentId;
  label: string;
  status: AgentUIStatus;
  badgeCount?: number;
  isActive?: boolean;
}

export interface DockProps {
  agents: DockAgentItem[];
  pulsingAgentId?: AgentId | null;
  onOpenAgent: (agentId: AgentId) => void;
  className?: string;
}

const statusClassName: Record<AgentUIStatus, string> = {
  normal: 'bg-[var(--color-status-normal)]',
  pending: 'bg-[var(--color-status-pending)]',
  alarm: 'bg-[var(--color-status-alarm)]',
  recovering: 'bg-[var(--color-status-recovering)]',
};

const dockShortLabel: Record<AgentId, string> = {
  supervisor: '监管',
  uf: '超滤',
  ro: '反渗透',
  dosing: '加药',
  pump: '泵组',
};

export function Dock({ agents, pulsingAgentId, onOpenAgent, className = '' }: DockProps) {
  return (
    <nav className={`flex flex-col items-center gap-3 ${className}`} aria-label="Agent dock">
      {agents.map((agent) => (
        <button
          key={agent.id}
          type="button"
          onClick={() => onOpenAgent(agent.id)}
          className={`relative flex h-12 w-12 items-center justify-center rounded-[var(--radius-card)] border text-xs font-semibold transition-colors ${
            agent.isActive
              ? 'border-[var(--color-border-active)] bg-cyan-400/15 text-cyan-100'
              : 'border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] text-slate-200 hover:border-slate-500'
          } ${pulsingAgentId === agent.id ? 'animate-glow-pulse' : ''}`}
          aria-label={`打开${agent.label}`}
          title={agent.label}
        >
          <span className="text-center leading-4">{dockShortLabel[agent.id]}</span>
          <span
            className={`absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border border-slate-950 ${statusClassName[agent.status]}`}
            aria-hidden="true"
          />
          {agent.badgeCount ? (
            <span className="absolute -bottom-1 -right-1 min-w-5 rounded-full bg-rose-500 px-1 text-[10px] leading-5 text-white">
              {agent.badgeCount}
            </span>
          ) : null}
        </button>
      ))}
    </nav>
  );
}
