import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { BrainCircuit, Maximize2, Minimize2, RotateCcw, Send, X } from 'lucide-react';
import { useCockpitAIContext } from './CockpitAIContext';
import type { CockpitSectionKey } from '../../types';

interface CockpitAIChatPanelProps {
  isOpen: boolean;
  section: CockpitSectionKey;
  selectedTab?: string | null;
  onClose: () => void;
}

function formatAssistantText(content: string): string {
  return content
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^[ \t]*[-*]\s+/gm, '')
    .replace(/^[ \t]*\d+\.\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function CockpitAIChatPanel({
  isOpen,
  onClose,
}: CockpitAIChatPanelProps) {
  const { messages, status, error, canSend, sendMessage, clearMessages } = useCockpitAIContext();
  const [input, setInput] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, status, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setIsFullscreen(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (isFullscreen) {
        setIsFullscreen(false);
        return;
      }
      onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, isOpen, onClose]);

  const submitInput = async () => {
    const question = input.trim();
    if (!question || !canSend) return;
    setInput('');
    await sendMessage(question);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await submitInput();
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void submitInput();
  };

  const handleClose = () => {
    setIsFullscreen(false);
    onClose();
  };

  const panelWidthClass = isFullscreen
    ? 'left-0 right-0 max-w-none border-x-0'
    : 'right-0 max-w-[460px] border-l border-cyan-500/16';
  const contentWidthClass = isFullscreen ? 'mx-auto w-full max-w-5xl' : '';

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[2px] transition ${
          isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={handleClose}
      />
      <aside
        className={`fixed top-0 z-50 flex h-screen w-full flex-col bg-[#081321]/96 shadow-[-24px_0_64px_rgba(2,6,23,0.42)] transition-[transform,max-width] duration-300 ${panelWidthClass} ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="border-b border-cyan-500/12 px-5 py-5">
          <div className={`flex items-start justify-between gap-4 ${contentWidthClass}`}>
            <div className="flex items-center gap-2 text-lg font-semibold text-cyan-200">
              <BrainCircuit className="h-5 w-5" />
              AI 分析助手
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsFullscreen((prev) => !prev)}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition ${
                  isFullscreen
                    ? 'border-slate-600 bg-slate-200 text-slate-950 hover:bg-white'
                    : 'border-slate-800 bg-transparent text-slate-400 hover:border-cyan-500/25 hover:bg-slate-900/70 hover:text-white'
                }`}
                aria-label={isFullscreen ? '退出全屏' : '展开全屏'}
                aria-pressed={isFullscreen}
              >
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-800 bg-slate-950/60 text-slate-400 transition hover:border-cyan-500/25 hover:text-white"
                aria-label="关闭 AI 助手"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className={`mt-4 flex gap-3 ${contentWidthClass}`}>
            <button
              type="button"
              onClick={clearMessages}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-950/55 px-4 py-2.5 text-sm text-slate-300 transition hover:border-cyan-500/25 hover:text-white"
            >
              <RotateCcw className="h-4 w-4" />
              清空对话
            </button>
          </div>
        </div>

        <div ref={scrollerRef} className="flex-1 overflow-y-auto px-5 py-5">
          <div className={`space-y-4 ${contentWidthClass}`}>
            {messages.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-cyan-500/18 bg-cyan-500/6 px-5 py-6 text-sm leading-7 text-slate-400">
                例如：
                <br />
                “为什么这个月吨水成本偏高？”
                <br />
                “结合单耗页和历史异常，这个变化像不像药剂侧问题？”
                <br />
                “从集团总览角度看，当前更像经营波动还是工艺风险？”
              </div>
            ) : null}

            {messages.map((message) => (
              <article
                key={message.id}
                className={`rounded-[22px] border px-4 py-3 ${
                  message.role === 'user'
                    ? `${isFullscreen ? 'ml-auto max-w-3xl' : 'ml-auto max-w-[88%]'} border-cyan-400/25 bg-cyan-500/10 text-cyan-50`
                    : `${isFullscreen ? 'max-w-5xl' : 'max-w-[92%]'} border-slate-800 bg-slate-900/85 text-slate-100`
                }`}
              >
                <div className="whitespace-pre-wrap text-sm leading-7">
                  {message.role === 'assistant'
                    ? formatAssistantText(message.content || (status === 'streaming' ? '正在分析...' : ''))
                    : message.content}
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="border-t border-cyan-500/12 px-5 py-5">
          {error ? (
            <div className="mb-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              最近一次分析失败：{error}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className={contentWidthClass}>
            <div className="flex flex-col gap-3">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="请输入问题"
                rows={4}
                className="min-h-[132px] resize-y rounded-[24px] border border-slate-800 bg-slate-950/65 px-4 py-3 text-sm leading-7 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/45"
              />
              <button
                type="submit"
                disabled={!canSend || !input.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-[22px] border border-cyan-500/20 bg-cyan-500/12 px-6 py-3 text-sm font-medium text-cyan-100 transition hover:border-cyan-400/45 hover:bg-cyan-500/18 disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-950/40 disabled:text-slate-500"
              >
                <Send className="h-4 w-4" />
                {status === 'streaming' ? '分析中...' : '发送'}
              </button>
            </div>
          </form>
        </div>
      </aside>
    </>
  );
}
