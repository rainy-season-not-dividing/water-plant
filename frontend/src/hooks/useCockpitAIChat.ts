import { useCallback, useMemo, useRef, useState } from 'react';
import { streamCockpitChat } from '../api/services/aiService';
import type { CockpitSectionKey, CockpitChatMessage } from '../types';

type StreamStatus = 'idle' | 'streaming' | 'error';

const RECENT_MESSAGE_LIMIT = 8;
const ARCHIVE_TRIGGER_COUNT = 12;

function createMessage(role: 'user' | 'assistant', content: string): CockpitChatMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
  };
}

function buildArchiveSummary(messages: CockpitChatMessage[]): string | null {
  if (messages.length <= RECENT_MESSAGE_LIMIT) return null;
  const archived = messages.slice(0, -RECENT_MESSAGE_LIMIT);
  if (!archived.length) return null;
  const lines = archived
    .slice(-6)
    .map((item) => `${item.role === 'user' ? '用户' : '助手'}: ${item.content}`)
    .join('\n');
  return `更早对话摘要：此前已讨论以下内容。\n${lines}`;
}

export function useCockpitAIChat(params: {
  section: CockpitSectionKey;
  selectedTab?: string | null;
}) {
  const { section, selectedTab } = params;
  const [messages, setMessages] = useState<CockpitChatMessage[]>([]);
  const [status, setStatus] = useState<StreamStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [archivedSummary, setArchivedSummary] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const canSend = useMemo(() => status !== 'streaming', [status]);

  const sendMessage = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || status === 'streaming') return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const userMessage = createMessage('user', trimmed);
      const assistantMessage = createMessage('assistant', '');
      const nextMessages = [...messages, userMessage];
      const nextArchive =
        nextMessages.length >= ARCHIVE_TRIGGER_COUNT
          ? buildArchiveSummary(nextMessages) ?? archivedSummary
          : archivedSummary;
      const recentMessages = nextMessages.slice(-RECENT_MESSAGE_LIMIT);

      setMessages([...nextMessages, assistantMessage]);
      setArchivedSummary(nextArchive);
      setStatus('streaming');
      setError(null);

      await streamCockpitChat(
        {
          section,
          selected_tab: selectedTab ?? null,
          question: trimmed,
          history: recentMessages.map((item) => ({
            role: item.role,
            content: item.content,
          })),
          archived_summary: nextArchive,
        },
        (event) => {
          if (event.type === 'token') {
            setMessages((prev) =>
              prev.map((item) =>
                item.id === assistantMessage.id ? { ...item, content: item.content + event.content } : item,
              ),
            );
            return;
          }
          if (event.type === 'done') {
            setStatus('idle');
            abortRef.current = null;
            return;
          }
          if (event.type === 'error') {
            setStatus('error');
            setError(event.message);
            setMessages((prev) =>
              prev.map((item) =>
                item.id === assistantMessage.id
                  ? { ...item, content: item.content || `分析失败：${event.message}` }
                  : item,
              ),
            );
            abortRef.current = null;
          }
        },
        controller.signal,
      );
    },
    [archivedSummary, messages, section, selectedTab, status],
  );

  const clearMessages = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setArchivedSummary(null);
    setStatus('idle');
    setError(null);
  }, []);

  return {
    messages,
    status,
    error,
    archivedSummary,
    canSend,
    sendMessage,
    clearMessages,
  };
}
