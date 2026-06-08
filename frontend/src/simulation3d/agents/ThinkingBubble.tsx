/**
 * ThinkingBubble — Canvas 内部计算引擎（不渲染 HTML）
 *
 * 职责：每帧用 useFrame 将 Agent 3D 坐标 → 屏幕投影 → 象限偏移
 *       结果存入共享 bubbleStateRef，供 Canvas 外部的 BubbleOverlay 读取
 *
 * 不产生任何 DOM / JSX 输出（return null），避免 R3F 渲染 HTML 元素
 *
 * 兼容说明：
 *   - A 的 useStreamingAI 写入 ThinkingContent { title, text, status }
 *   - B 的 BubbleOverlay 从 store 读取 thinking.text 渲染流式文本
 *   - 本组件只负责 3D → 2D 坐标投影，不关心 thinking 的内容格式
 */

import { useRef, useMemo } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BUBBLE_ANCHORS } from '../../data/constants';
import { SCENE_SCALE } from '../config';
import type { AgentId } from '../../types';
import type { BubbleState } from './BubbleOverlay';
import { debug3d } from '../utils/debug3d';

// ─── 常量 ────────────────────────────────────────────────────

const BW = 260;
const BH = 260;
const PADDING = 20;
const EDGE_GAP = 18;
const SUPERVISOR_GAP_X = 42;
const SUPERVISOR_GAP_Y = 46;
const SMOOTH_RATE = 0.08;

type TailDir = BubbleState['tail'];

/** 根据 Agent 屏幕像素坐标计算偏移方向 + 位置 */
function clampBubble(x: number, y: number, vw: number, vh: number) {
  return {
    x: Math.max(PADDING, Math.min(vw - BW - PADDING, x)),
    y: Math.max(PADDING, Math.min(vh - BH - PADDING, y)),
  };
}

function calcLineStart(ox: number, oy: number, tail: TailDir) {
  if (tail === 'left') return { x: ox, y: oy + BH / 2 };
  if (tail === 'right') return { x: ox + BW, y: oy + BH / 2 };
  return { x: ox, y: oy + BH };
}

/** 根据 Agent 屏幕像素坐标计算偏移方向 + 位置 */
function calcOffset(agentId: AgentId, ax: number, ay: number, vw: number, vh: number) {
  const midX = vw / 2;
  const thr = vw * 0.15;
  let ox: number, oy: number, tail: TailDir;

  if (agentId === 'supervisor') {
    // 监管智能体处在主视觉中心，使用短距离侧向标注，避免整卡片高度上移。
    if (ax > midX + thr) {
      ox = ax - BW - SUPERVISOR_GAP_X;
      tail = 'right';
    } else {
      ox = ax + SUPERVISOR_GAP_X;
      tail = 'left';
    }
    oy = ay - SUPERVISOR_GAP_Y;
  } else if (ax < midX - thr) {
    ox = ax + EDGE_GAP;
    oy = ay - BH / 2;
    tail = 'left';
  } else if (ax > midX + thr) {
    ox = ax - BW - EDGE_GAP;
    oy = ay - BH / 2;
    tail = 'right';
  } else {
    // 中央区域仍优先侧放，避免气泡与 Agent 纵向距离过大。
    ox = ax + EDGE_GAP;
    oy = ay - BH / 2;
    tail = 'left';
  }

  const clamped = clampBubble(ox, oy, vw, vh);
  return { ox: clamped.x, oy: clamped.y, tail };
}

// ─── 组件 ────────────────────────────────────────────────────

interface ThinkingBubbleProps {
  bubbleStateRef: React.MutableRefObject<BubbleState>;
}

export const ThinkingBubble: React.FC<ThinkingBubbleProps> = ({ bubbleStateRef }) => {
  const { camera, size } = useThree();
  const agentId = bubbleStateRef.current.agentId;
  const anchor = agentId ? BUBBLE_ANCHORS[agentId] : null;

  const worldVec = useMemo(() => {
    if (!anchor) return new THREE.Vector3();
    return new THREE.Vector3(
      anchor.x * SCENE_SCALE,
      anchor.z * SCENE_SCALE,
      anchor.y * SCENE_SCALE,
    );
  }, [agentId]);

  const smooth = useRef({ x: -999, y: -999 });

  useFrame(() => {
    if (!anchor) return;

    const ndc = worldVec.clone().project(camera);
    const onScreen = ndc.z > 0 && ndc.z < 1;

    const rawX = (ndc.x * 0.5 + 0.5) * size.width;
    const rawY = (-ndc.y * 0.5 + 0.5) * size.height;

    if (smooth.current.x === -999) {
      smooth.current.x = rawX;
      smooth.current.y = rawY;
      debug3d('bubble', {
        action: 'first_project',
        agentId,
        anchor: `${anchor.x},${anchor.y},${anchor.z}`,
        rawScreen: `${rawX.toFixed(0)},${rawY.toFixed(0)}`,
      });
    } else {
      smooth.current.x += (rawX - smooth.current.x) * SMOOTH_RATE;
      smooth.current.y += (rawY - smooth.current.y) * SMOOTH_RATE;
    }

    if (!onScreen) {
      bubbleStateRef.current.visible = false;
      return;
    }

    const { ox, oy, tail } = calcOffset(
      agentId,
      smooth.current.x,
      smooth.current.y,
      size.width,
      size.height,
    );

    const lineStart = calcLineStart(ox, oy, tail);

    bubbleStateRef.current = {
      ...bubbleStateRef.current,
      visible: true,
      x: ox,
      y: oy,
      tail,
      anchorX: smooth.current.x,
      anchorY: smooth.current.y,
      lineFromX: lineStart.x,
      lineFromY: lineStart.y,
    };
  });

  return null; // 不渲染任何 HTML / R3F 元素
};
