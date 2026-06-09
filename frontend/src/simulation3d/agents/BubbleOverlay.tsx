/**
 * BubbleOverlay — Canvas 外部 2D HUD 渲染器
 *
 * 两大差异：
 * 1. 在 R3F Canvas **外部**渲染 → HTML 标签（<svg>, <div>）不会被 R3F 拦截
 * 2. 位置数据从共享 ref（bubbleStateRef）读取，由 ThinkingBubble 每帧写入
 *
 * 内容数据（thinking.text / thinking.status）直接从 Zustand store 读取
 * 兼容 A 的流式 ThinkingContent：{ title, text, status: StreamingStatus }
 *   - streaming: 逐字打字机 + 光标闪烁
 *   - done: 全文显示
 *   - error: 全文显示 + 错误标记
 */

import React, { useRef, useEffect, useState } from 'react';
import { useScenarioStore } from '../../stores/useScenarioStore';
import type { AgentId, ThinkingContent } from '../../types';

// ─── 共享状态类型 ─────────────────────────────────────────────

export interface BubbleState {
  agentId: AgentId | null;
  visible: boolean;
  x: number;
  y: number;
  tail: 'left' | 'right' | 'top-left';
  anchorX: number;
  anchorY: number;
  lineFromX: number;
  lineFromY: number;
}

export const INITIAL_BUBBLE_STATE: BubbleState = {
  agentId: null,
  visible: false,
  x: 0,
  y: 0,
  tail: 'left',
  anchorX: 0,
  anchorY: 0,
  lineFromX: 0,
  lineFromY: 0,
};

// ─── 组件 ────────────────────────────────────────────────────

interface BubbleOverlayProps {
  bubbleStateRef: React.MutableRefObject<BubbleState>;
}

export const BubbleOverlay: React.FC<BubbleOverlayProps> = ({ bubbleStateRef }) => {
  // 卡片 + 连线 DOM refs
  const cardEl = useRef<HTMLDivElement>(null);
  const bodyEl = useRef<HTMLDivElement>(null);
  const lineEl = useRef<SVGPathElement>(null);
  const tailEl = useRef<HTMLDivElement>(null);

  // Zustand 状态（低频率变化，不影响性能）
  const thinking = useScenarioStore((s) => s.thinking);
  const thinkingAgentId = useScenarioStore((s) => s.thinkingAgentId);

  // 打字机效果：按句缓冲 + 恒速逐字输出
  const [displayedLength, setDisplayedLength] = useState(0);
  const targetLength = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentenceEnd = useRef(0);

  // 当 thinking 变化（新标题/新内容）时重置打字机
  useEffect(() => {
    setDisplayedLength(0);
    targetLength.current = 0;
    lastSentenceEnd.current = 0;
    if (timerRef.current) clearTimeout(timerRef.current);
  }, [thinking?.title]);

  // 按句释放：找到最新的完整句（以换行或句号/问号/感叹号结尾），
  // 立即将 targetLength 推进到该位置
  useEffect(() => {
    if (!thinking) return;
    const text = thinking.text;

    // done/error 状态直接释放全部
    if (thinking.status !== 'streaming') {
      targetLength.current = text.length;
      return;
    }

    // 找最后一个句子终结符的位置
    let endPos = lastSentenceEnd.current;
    for (let i = lastSentenceEnd.current; i < text.length; i++) {
      const ch = text[i];
      if (ch === '\n' || ch === '。' || ch === '？' || ch === '！'
        || ch === '.' || ch === '?' || ch === '!') {
        endPos = i + 1;
      }
    }
    if (endPos > lastSentenceEnd.current) {
      lastSentenceEnd.current = endPos;
      targetLength.current = endPos;
    }

    // 流结束时释放残余（最后一句可能没有终结符）
    if (text.length > 0 && targetLength.current < text.length) {
      // 如果已经有超过 500ms 没有新 token（句尾残留），也释放
      // 这里用简单策略：如果 displayed 已追上 target 且 text 更长，释放全部
      // （通过下一个 effect 的自然追赶来处理）
    }
  }, [thinking?.text, thinking?.status]);

  // 匀速逐字追赶 targetLength
  useEffect(() => {
    if (!thinking) return;
    const target = Math.max(targetLength.current, thinking.status !== 'streaming' ? thinking.text.length : targetLength.current);
    if (displayedLength >= target) return;

    const buffered = target - displayedLength;
    // 缓冲大时加速，保证不掉队；正常时 18ms/字（约 55 字/秒）
    const interval = buffered > 30 ? 8 : buffered > 15 ? 12 : 18;

    timerRef.current = setTimeout(() => {
      setDisplayedLength((n) => Math.min(n + 1, target));
    }, interval);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [displayedLength, thinking]);

  const displayText = thinking ? thinking.text.slice(0, displayedLength) : '';

  // Smart scroll：默认自动跟随最新，用户上滑锁定，回底恢复
  const isAtBottom = useRef(true);
  const isProgrammaticScroll = useRef(false);

  const handleScroll = () => {
    if (isProgrammaticScroll.current) return;
    if (!bodyEl.current) return;
    const el = bodyEl.current;
    const threshold = 8;
    isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
  };

  useEffect(() => {
    if (!isAtBottom.current) return;
    const scrollToBottom = () => {
      if (!bodyEl.current) return;
      isProgrammaticScroll.current = true;
      bodyEl.current.scrollTop = bodyEl.current.scrollHeight;
      requestAnimationFrame(() => {
        isProgrammaticScroll.current = false;
      });
    };
    scrollToBottom();
  }, [displayText]);

  // ── rAF 同步循环：每帧读 bubbleStateRef 并更新 DOM ──
  useEffect(() => {
    let running = true;
    const tick = () => {
      if (!running) return;
      const s = bubbleStateRef.current;

      if (cardEl.current) {
        cardEl.current.style.left = `${s.x}px`;
        cardEl.current.style.top = `${s.y}px`;
        cardEl.current.style.opacity = s.visible && !!thinking ? '1' : '0';
      }

      if (tailEl.current) {
        tailEl.current.dataset.tail = s.tail;
      }

      if (lineEl.current) {
        lineEl.current.setAttribute(
          'd',
          `M ${s.lineFromX} ${s.lineFromY} L ${s.anchorX} ${s.anchorY}`,
        );
        lineEl.current.style.opacity = s.visible && !!thinking ? '1' : '0';
      }

      requestAnimationFrame(tick);
    };
    tick();
    return () => {
      running = false;
    };
  }, [thinking, bubbleStateRef]);

  if (!thinking || !thinkingAgentId || !thinking.text) return null;

  // 截取已显示的文本，按行拆分
  const lines = displayText.split('\n').filter(Boolean);
  const isStreaming = thinking.status === 'streaming';

  return (
    <>
      <style>{`
        .tail-triangle {
          position: absolute;
          width: 0;
          height: 0;
        }
        [data-tail="left"] .tail-triangle {
          right: 100%;
          top: 50%;
          transform: translateY(-50%);
          border-right: 8px solid rgba(10, 18, 32, 0.92);
          border-top: 6px solid transparent;
          border-bottom: 6px solid transparent;
          border-left: none;
        }
        [data-tail="right"] .tail-triangle {
          left: 100%;
          top: 50%;
          transform: translateY(-50%);
          border-left: 8px solid rgba(10, 18, 32, 0.92);
          border-top: 6px solid transparent;
          border-bottom: 6px solid transparent;
          border-right: none;
        }
        [data-tail="top-left"] .tail-triangle {
          left: 50%;
          bottom: 100%;
          transform: translateX(-50%);
          border-bottom: 8px solid rgba(10, 18, 32, 0.92);
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-top: none;
        }
        @keyframes blink-cursor {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>

      {/* SVG 连线 */}
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 0,
          overflow: 'visible',
        }}
      >
        <path
          ref={lineEl}
          fill="none"
          stroke="rgba(56, 189, 248, 0.2)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          style={{ transition: 'none' }}
        />
      </svg>

      {/* 气泡卡片 */}
      <div
        ref={cardEl}
        style={{
          position: 'absolute',
          pointerEvents: 'auto',
          opacity: 0,
          transition: 'opacity 0.35s ease-in-out',
          zIndex: 1,
        }}
      >
        <div
          ref={tailEl}
          data-tail={bubbleStateRef.current.tail}
          style={{
            background: 'rgba(10, 18, 32, 0.92)',
            border: '1.5px solid rgba(56, 189, 248, 0.5)',
            borderRadius: 10,
            padding: '12px 16px',
            width: 228,
            height: 260,
            overflow: 'hidden',
            color: '#e2e8f0',
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif',
            fontSize: 14,
            lineHeight: 1.65,
            cursor: 'pointer',
            backdropFilter: 'blur(10px)',
            boxShadow:
              '0 4px 24px rgba(0, 0, 0, 0.4), 0 0 20px rgba(56, 189, 248, 0.12)',
            position: 'relative',
            userSelect: 'none',
            wordBreak: 'break-word',
          }}
          title="点击关闭"
          onClick={() => useScenarioStore.getState().clearThinking()}
        >
          {/* 三角尾巴 */}
          <div className="tail-triangle" />

          {/* 标题 */}
          <div
            style={{
              color: '#38bdf8',
              fontWeight: 600,
              fontSize: 14,
              marginBottom: 6,
              paddingBottom: 5,
              borderBottom: '1px solid rgba(56, 189, 248, 0.2)',
              whiteSpace: 'nowrap',
            }}
          >
            {thinking.title}
          </div>

          {/* 推理内容（逐行渲染，最后一行高亮） */}
          <div
            ref={bodyEl}
            onScroll={handleScroll}
            style={{
              height: 194,
              overflowY: 'auto',
              paddingRight: 4,
            }}
          >
            {lines.map((line, i) => (
              <div
                key={i}
                style={{
                  color: i === lines.length - 1 ? '#f1f5f9' : '#94a3b8',
                  paddingLeft: 8,
                  borderLeft: '2px solid rgba(56, 189, 248, 0.35)',
                  marginBottom: 3,
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                {line}
              </div>
            ))}

            {/* 流式光标 */}
            {isStreaming && (
              <span
              style={{
                  display: 'inline-block',
                  width: 1.5,
                  height: 13,
                  background: '#38bdf8',
                  marginLeft: 1,
                  verticalAlign: 'middle',
                  animation: 'blink-cursor 0.7s infinite',
                }}
              />
            )}

            {/* 错误标记 */}
            {thinking.status === 'error' && (
              <div
                style={{
                  marginTop: 6,
                  color: '#f87171',
                  fontSize: 11,
                  opacity: 0.8,
                }}
              >
                ⚠ 分析异常
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
