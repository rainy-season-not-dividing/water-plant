import { useCallback, useRef } from 'react';
import { motion } from 'motion/react';
import type { AgentId, AgentLog, AgentUIStatus, MetricField } from '../../types/index';
import { MetricCard } from './MetricCard';

export interface AgentWindowProps {
  agentId: AgentId;
  title: string;
  status: AgentUIStatus;
  role: string;
  metrics: MetricField[];
  capabilities?: string[];
  logs?: AgentLog[];
  footerText?: string;
  isActive?: boolean;
  isMinimized?: boolean;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  onFocus: (agentId: AgentId) => void;
  onMinimize: (agentId: AgentId) => void;
  onClose: (agentId: AgentId) => void;
  onMove: (agentId: AgentId, position: { x: number; y: number }) => void;
  onResize: (agentId: AgentId, size: { width: number; height: number }) => void;
  className?: string;
}

const statusTone: Record<AgentUIStatus, { dot: string; title: string; label: string }> = {
  normal: { dot: 'bg-emerald-400', title: 'bg-slate-900', label: 'Normal' },
  pending: { dot: 'bg-amber-400', title: 'bg-slate-900', label: 'Pending' },
  alarm: { dot: 'bg-rose-400', title: 'bg-rose-950/80', label: 'Alarm' },
  recovering: { dot: 'bg-teal-400', title: 'bg-emerald-950/70', label: 'Recovering' },
};


export function AgentWindow({
  agentId,
  title,
  status,
  role,
  metrics,
  capabilities = [],
  logs = [],
  footerText = 'Ready',
  isActive = false,
  isMinimized = false,
  position,
  size,
  zIndex,
  onFocus,
  onMinimize,
  onClose,
  onMove,
  onResize,
  className = '',
}: AgentWindowProps) {
  const dragStartRef = useRef<{
    pointerId: number;
    originX: number;
    originY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const resizeStartRef = useRef<{
    pointerId: number;
    originX: number;
    originY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);

  const handleDragStart = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;

      event.currentTarget.setPointerCapture(event.pointerId);
      onFocus(agentId);
      dragStartRef.current = {
        pointerId: event.pointerId,
        originX: event.clientX,
        originY: event.clientY,
        startX: position.x,
        startY: position.y,
      };
    },
    [agentId, onFocus, position.x, position.y]
  );

  const handleDragMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const dragStart = dragStartRef.current;
      if (!dragStart || dragStart.pointerId !== event.pointerId) return;

      onMove(agentId, {
        x: Math.max(80, dragStart.startX + event.clientX - dragStart.originX),
        y: Math.max(48, dragStart.startY + event.clientY - dragStart.originY),
      });
    },
    [agentId, onMove]
  );

  const handleDragEnd = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (dragStartRef.current?.pointerId === event.pointerId) {
      dragStartRef.current = null;
    }
  }, []);

  const handleResizeStart = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;

      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      onFocus(agentId);
      resizeStartRef.current = {
        pointerId: event.pointerId,
        originX: event.clientX,
        originY: event.clientY,
        startWidth: size.width,
        startHeight: size.height,
      };
    },
    [agentId, onFocus, size.height, size.width]
  );

  const handleResizeMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const resizeStart = resizeStartRef.current;
      if (!resizeStart || resizeStart.pointerId !== event.pointerId) return;

      onResize(agentId, {
        width: Math.max(300, resizeStart.startWidth + event.clientX - resizeStart.originX),
        height: Math.max(260, resizeStart.startHeight + event.clientY - resizeStart.originY),
      });
    },
    [agentId, onResize]
  );

  const handleResizeEnd = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (resizeStartRef.current?.pointerId === event.pointerId) {
      resizeStartRef.current = null;
    }
  }, []);

  if (isMinimized) return null;

  const tone = statusTone[status];

  return (
    <motion.section
      initial={{ scale: 0.95, opacity: 0, filter: 'blur(4px)' }}
      animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
      exit={{ scale: 0.95, opacity: 0, filter: 'blur(2px)' }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={`absolute overflow-hidden rounded-[var(--radius-panel)] border bg-[var(--color-surface-base)] text-slate-100 shadow-[var(--shadow-window)] ${
        isActive ? 'border-[var(--color-border-active)]' : 'border-[var(--color-border-default)]'
      } ${className}`}
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        zIndex,
      }}
      onMouseDown={() => onFocus(agentId)}
      aria-label={`${title} agent window`}
    >
      <header
        className={`flex cursor-move touch-none items-center justify-between px-3 py-2 ${tone.title}`}
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot}`} />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{title}</h2>
            <p className="text-[10px] uppercase tracking-wide text-slate-400">{tone.label}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              onMinimize(agentId);
            }}
            className="h-7 w-7 rounded text-slate-300 hover:bg-slate-800"
            aria-label={`Minimize ${title}`}
          >
            -
          </button>
          <button
            type="button"
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              onClose(agentId);
            }}
            className="h-7 w-7 rounded text-slate-300 hover:bg-slate-800"
            aria-label={`Close ${title}`}
          >
            x
          </button>
        </div>
      </header>

      <div className="max-h-[calc(100%-72px)] space-y-3 overflow-y-auto p-3 pb-12">
        <p className="rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] p-2 text-xs leading-5 text-slate-300">
          {role}
        </p>

        <div className="grid grid-cols-2 gap-2">
          {metrics.map((metric) => (
            <MetricCard key={metric.key} metric={metric} />
          ))}
        </div>

        {capabilities.length > 0 ? (
          <div>
            <h3 className="mb-2 text-[10px] font-semibold uppercase text-slate-500">能力标签</h3>
            <div className="flex flex-wrap gap-1.5">
              {capabilities.map((capability) => (
                <span key={capability} className="rounded border border-cyan-500/25 bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-100">
                  {capability}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {logs.length > 0 ? (
          <div>
            <h3 className="mb-2 text-[10px] font-semibold uppercase text-slate-500">最近日志</h3>
            <div className="space-y-1.5">
              {logs.slice(0, 2).map((log) => (
                <article key={log.id} className="rounded border border-slate-800 bg-slate-950/55 p-2 text-[11px] leading-4 text-slate-300">
                  <p className="text-slate-500">{log.time}</p>
                  <p className="mt-1">{log.message}</p>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <footer className="absolute inset-x-0 bottom-0 border-t border-[var(--color-border-default)] bg-slate-900/80 px-3 py-2 text-xs text-slate-300">
        {footerText}
      </footer>
      <button
        type="button"
        className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize touch-none rounded-tl border-l border-t border-[var(--color-border-default)] bg-slate-800/80 text-[10px] text-slate-400"
        aria-label={`Resize ${title}`}
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
      >
        /
      </button>
    </motion.section>
  );
}
