import { useState } from 'react';
import { Eye, X } from 'lucide-react';
import type { ScenarioLogRecord } from '../../types';
import { AGENT_WINDOW_DATA } from '../../data/agentWindowData';

export interface LogDrawerProps {
  isOpen: boolean;
  records: ScenarioLogRecord[];
  isLoading?: boolean;
  isLoadingMore?: boolean;
  restoredRecordCount?: number;
  restoredEventCount?: number;
  hasMoreHistory?: boolean;
  onLoadMore?: () => void;
  onClose: () => void;
}

type DetailType = 'supervisor' | 'edge' | 'plan';

interface DetailState {
  title: string;
  content: string;
}

function buildDetail(record: ScenarioLogRecord, type: DetailType): DetailState | null {
  if (type === 'supervisor' && record.supervisorThinking) {
    return {
      title: '监管智能体分析详情',
      content: record.supervisorThinking,
    };
  }

  if (type === 'edge' && record.edgeAgentThinking) {
    return {
      title: '专项智能体分析详情',
      content: record.edgeAgentThinking,
    };
  }

  if (type === 'plan' && record.planResult) {
    return {
      title: '处置方案详情',
      content: record.planResult.detail,
    };
  }

  return null;
}

function DetailButton({
  label,
  disabledLabel,
  onClick,
}: {
  label: string;
  disabledLabel: string;
  onClick?: () => void;
}) {
  if (!onClick) {
    return <span className="text-xs text-slate-500">{disabledLabel}</span>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/20"
    >
      <Eye className="h-3 w-3" />
      {label}
    </button>
  );
}

export function LogDrawer({
  isOpen,
  records,
  isLoading = false,
  isLoadingMore = false,
  restoredRecordCount = 0,
  restoredEventCount = 0,
  hasMoreHistory = false,
  onLoadMore,
  onClose,
}: LogDrawerProps) {
  const [detail, setDetail] = useState<DetailState | null>(null);

  if (!isOpen) return null;

  const openDetail = (record: ScenarioLogRecord, type: DetailType) => {
    const nextDetail = buildDetail(record, type);
    if (nextDetail) setDetail(nextDetail);
  };

  const handleClose = () => {
    setDetail(null);
    onClose();
  };

  return (
    <section className="fixed inset-y-4 right-4 z-50 flex w-[960px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-950/98 text-slate-100 shadow-2xl">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">日志记录</h2>
          <p className="mt-1 text-xs text-slate-500">按异常处置流程汇总监管分析、专项分析与处置结果。</p>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          aria-label="关闭日志记录"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2 text-xs text-slate-500">
        <span>
          {isLoading
            ? '正在恢复历史日志'
            : `已恢复最近 ${restoredRecordCount} 条流程记录`}
        </span>
        {hasMoreHistory && onLoadMore ? (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="rounded border border-slate-700 px-2 py-1 text-xs font-semibold text-slate-300 hover:border-cyan-500/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoadingMore ? '加载中...' : '加载更多'}
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {records.length === 0 ? (
          <p className="rounded border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-500">
            {isLoading ? '正在加载历史日志...' : '暂无日志记录'}
          </p>
        ) : (
          <table className="w-full min-w-[840px] border-separate border-spacing-0 overflow-hidden rounded border border-slate-800 text-left text-xs">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="border-b border-slate-800 px-3 py-2 font-semibold">时间</th>
                <th className="border-b border-slate-800 px-3 py-2 font-semibold">异常事件</th>
                <th className="border-b border-slate-800 px-3 py-2 font-semibold">监管分析</th>
                <th className="border-b border-slate-800 px-3 py-2 font-semibold">专项分析</th>
                <th className="border-b border-slate-800 px-3 py-2 font-semibold">处置结果</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => {
                const agentName = AGENT_WINDOW_DATA[record.targetAgentId]?.name ?? record.targetAgentId;
                return (
                  <tr key={record.id} className="bg-slate-950/70 align-top odd:bg-slate-900/30">
                    <td className="border-b border-slate-800 px-3 py-3 font-mono text-[11px] text-slate-300">{record.startedAt}</td>
                    <td className="border-b border-slate-800 px-3 py-3">
                      <p className="font-semibold text-slate-100">{record.incidentTitle}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{agentName}</p>
                    </td>
                    <td className="border-b border-slate-800 px-3 py-3">
                      <DetailButton
                        label="已生成监管分析"
                        disabledLabel="分析中"
                        onClick={record.supervisorThinking ? () => openDetail(record, 'supervisor') : undefined}
                      />
                    </td>
                    <td className="border-b border-slate-800 px-3 py-3">
                      <DetailButton
                        label={`已生成 ${AGENT_WINDOW_DATA[record.targetAgentId]?.englishName ?? '专项'} 分析`}
                        disabledLabel="等待专项分析"
                        onClick={record.edgeAgentThinking ? () => openDetail(record, 'edge') : undefined}
                      />
                    </td>
                    <td className="border-b border-slate-800 px-3 py-3">
                      <DetailButton
                        label={record.planResult?.summary ?? '等待处置'}
                        disabledLabel="等待处置"
                        onClick={record.planResult ? () => openDetail(record, 'plan') : undefined}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {detail ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 p-4">
          <article className="flex max-h-[82vh] w-[640px] max-w-full flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-950 text-slate-100 shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <h3 className="text-sm font-semibold">{detail.title}</h3>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                aria-label="关闭详情"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <pre className="min-h-0 overflow-auto whitespace-pre-wrap p-4 text-xs leading-6 text-slate-200">{detail.content}</pre>
          </article>
        </div>
      ) : null}
    </section>
  );
}
