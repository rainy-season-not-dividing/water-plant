import React, { Suspense, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import type { AgentId } from '../types';
import { CameraController } from './CameraController';
import { Ground } from './Ground';
import { SupervisorHub } from './equipment/SupervisorHub';
import { DosingModule } from './equipment/DosingModule';
import { UFModule } from './equipment/UFModule';
import { ROModule } from './equipment/ROModule';
import { PumpModule } from './equipment/PumpModule';
import { PipelineSystem } from './pipelines/PipelineSystem';
import { AgentNode } from './agents/AgentNode';
import { ThinkingBubble } from './agents/ThinkingBubble';
import { BubbleOverlay, INITIAL_BUBBLE_STATE } from './agents/BubbleOverlay';
import { useScenarioStore } from '../stores/useScenarioStore';
import { ParticleSystem } from './pipelines/ParticleSystem';
import { AlarmFlash } from './effects/AlarmFlash';
import { RecoveryGradient } from './effects/RecoveryGradient';
import { DeviceAction } from './effects/DeviceAction';
import { ScanCone } from './effects/ScanCone';
import { SCENE_SCALE, CAMERA_DEFAULTS } from './config';

interface Scene3DProps {
  className?: string;
}

/** 4个专项 Agent（不含 supervisor） */
const SPECIALIST_AGENTS: AgentId[] = ['dosing', 'uf', 'ro', 'pump'];

/**
 * 水厂 3D 场景主容器
 * R3F Canvas + 灯光 + 设备 + Agent + 管道 + 粒子 + 效果
 * 所有子组件独立从 Zustand Store 读取状态
 *
 * 缩放架构：
 * - 相机 + 灯光在 scale group 外面（不受 SCENE_SCALE 影响）
 * - 全部 3D 内容在 scale group 内部（统一由 SCENE_SCALE 缩放）
 * - 修改 config.ts 中的 SCENE_SCALE 即可整体调整场景大小
 *
 * HUD 架构：
 * - ThinkingBubble 在 Canvas 内只计算 Agent 的屏幕投影，不渲染 HTML。
 * - BubbleOverlay 在 Canvas 外渲染气泡，避免 Drei Html 二次投影。
 */
export const Scene3D: React.FC<Scene3DProps> = ({ className }) => {
  const overlayRef = useRef<HTMLDivElement>(null);

  // 共享气泡状态：ThinkingBubble（Canvas 内）每帧写入，
  // BubbleOverlay（Canvas 外）每帧通过 rAF 读取
  const bubbleStateRef = useRef({ ...INITIAL_BUBBLE_STATE });
  // 同步 agentId（当 thinking 触发时）
  const targetAgentId = useScenarioStore((s) => s.targetAgentId);
  const thinking = useScenarioStore((s) => s.thinking);
  const thinkingAgentId = useScenarioStore((s) => s.thinkingAgentId);
  if (thinking && thinkingAgentId) {
    bubbleStateRef.current.agentId = thinkingAgentId;
  }

  return (
    <div
      className={className}
      style={{ width: '100%', height: '100%', minHeight: 480, position: 'relative' }}
    >
      <Canvas
        shadows
        gl={{
          antialias: true,
          alpha: false,
          toneMapping: 3, // ACESFilmicToneMapping
        }}
        camera={{
          position: CAMERA_DEFAULTS.position,
          fov: CAMERA_DEFAULTS.fov,
          near: CAMERA_DEFAULTS.near,
          far: CAMERA_DEFAULTS.far,
        }}
        style={{ background: 'radial-gradient(ellipse at 50% 50%, #0f172a 0%, #020617 100%)' }}
      >
        {/* ─── 灯光（scale 外面，保持恒定照明） ─── */}
        <ambientLight intensity={0.8} />
        {/* 半球光补充环境漫反射，避免底部过暗 */}
        <hemisphereLight
          args={['#0a1628', '#1e293b', 0.4]}
        />
        <directionalLight
          position={[80, 120, 60]}
          intensity={1.5}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <directionalLight
          position={[-40, 60, -40]}
          intensity={0.5}
        />
        <pointLight position={[0, 30, -15]} intensity={3} color="#378ADD" distance={200} />
        <pointLight position={[-40, 25, -50]} intensity={1.5} color="#BA7517" distance={120} />
        <pointLight position={[55, 25, 8]} intensity={1.5} color="#D85A30" distance={120} />

        {/* ─── 相机控制器（scale 外面） ─── */}
        <CameraController />

        {/* ─── 思考气泡（Canvas 内计算引擎，放在 scale 外避免坐标语义混淆） ─── */}
        <ThinkingBubble bubbleStateRef={bubbleStateRef} />

        {/* ═══ 全局缩放 group ═══ */}
        <group scale={[SCENE_SCALE, SCENE_SCALE, SCENE_SCALE]}>
          {/* ─── 地面 ─── */}
          <Ground />

          {/* ─── 监管中枢（GLB 模型加载） ─── */}
          <Suspense fallback={null}>
            <SupervisorHub />
          </Suspense>

          {/* ─── 设备模块 ─── */}
          <DosingModule />
          <UFModule />
          <ROModule />
          <PumpModule />

          {/* ─── 管道 ─── */}
          <PipelineSystem />

          {/* ─── Agent 模型 ×4（GLB 模型加载） ─── */}
          <Suspense fallback={null}>
            {SPECIALIST_AGENTS.map((id) => (
              <AgentNode key={id} agentId={id} />
            ))}
          </Suspense>

          {/* ─── 粒子 ─── */}
          <ParticleSystem />

          {/* ─── 效果 ─── */}
          <AlarmFlash />
          <RecoveryGradient />
          <DeviceAction />
          <ScanCone />
        </group>
      </Canvas>

      {/* ─── 2D HUD 覆盖层（Canvas 外部 HTML 渲染） ─── */}
      <div
        ref={overlayRef}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 10,
          overflow: 'hidden',
        }}
      >
        <BubbleOverlay bubbleStateRef={bubbleStateRef} />
      </div>
    </div>
  );
};
