import type { AgentId } from '../types';

export interface PlantAnchor {
  x: number;
  y: number;
  z: number;
}

type PlantAgentAnchors = Record<AgentId, PlantAnchor>;
type EdgeAgentId = Exclude<AgentId, 'supervisor'>;

const EDGE_AGENT_HEIGHT = 44;
const EDGE_AGENT_ROW_Y = 8;

const EDGE_AGENT_ANCHORS: Record<EdgeAgentId, PlantAnchor> = {
  ro: { x: -80, y: EDGE_AGENT_ROW_Y, z: EDGE_AGENT_HEIGHT + 5 },
  uf: { x: 18, y: EDGE_AGENT_ROW_Y, z: EDGE_AGENT_HEIGHT },
  dosing: { x: 110, y: EDGE_AGENT_ROW_Y, z: EDGE_AGENT_HEIGHT },
  pump: { x: 165, y: EDGE_AGENT_ROW_Y, z: EDGE_AGENT_HEIGHT },
};

/**
 * Real water plant anchors in the existing data coordinate system.
 * Three.js maps these as [x, z, y].
 *
 * The real model's visual order from left to right is:
 * ro -> uf -> dosing -> pump.
 */
export const REAL_DEVICE_ANCHORS: PlantAgentAnchors = {
  supervisor: { x: 8, y: -76, z: 0 },
  ro: { x: EDGE_AGENT_ANCHORS.ro.x, y: EDGE_AGENT_ANCHORS.ro.y, z: 0 },
  uf: { x: EDGE_AGENT_ANCHORS.uf.x, y: EDGE_AGENT_ANCHORS.uf.y, z: 0 },
  dosing: { x: EDGE_AGENT_ANCHORS.dosing.x, y: EDGE_AGENT_ANCHORS.dosing.y, z: 0 },
  pump: { x: EDGE_AGENT_ANCHORS.pump.x, y: EDGE_AGENT_ANCHORS.pump.y, z: 0 },
};

export const REAL_DEVICE_CENTERS: PlantAgentAnchors = {
  supervisor: { x: 8, y: -76, z: 25 },
  ro: { x: EDGE_AGENT_ANCHORS.ro.x, y: EDGE_AGENT_ANCHORS.ro.y, z: 11 },
  uf: { x: EDGE_AGENT_ANCHORS.uf.x, y: EDGE_AGENT_ANCHORS.uf.y, z: 12 },
  dosing: { x: EDGE_AGENT_ANCHORS.dosing.x, y: EDGE_AGENT_ANCHORS.dosing.y, z: 9 },
  pump: { x: EDGE_AGENT_ANCHORS.pump.x, y: EDGE_AGENT_ANCHORS.pump.y, z: 8 },
};

export const REAL_AGENT_ANCHORS: PlantAgentAnchors = {
  supervisor: { x: 8, y: -76, z: 85 },
  ...EDGE_AGENT_ANCHORS,
};

export const REAL_BUBBLE_ANCHORS: PlantAgentAnchors = {
  supervisor: { x: 8, y: -76, z: 30 },
  ...EDGE_AGENT_ANCHORS,
};

export const REAL_DEVICE_FOCUS_PRESETS: Record<
  AgentId,
  { cameraPos: [number, number, number]; lookAt: [number, number, number]; duration?: number }
> = {
  supervisor: {
    cameraPos: [8, 58, -118],
    lookAt: [8, 18, -76],
    duration: 2000,
  },
  pump: {
    cameraPos: [EDGE_AGENT_ANCHORS.pump.x + 2, 34, 42],
    lookAt: [EDGE_AGENT_ANCHORS.pump.x, 9, EDGE_AGENT_ANCHORS.pump.y],
    duration: 2000,
  },
  dosing: {
    cameraPos: [EDGE_AGENT_ANCHORS.dosing.x + 2, 34, 40],
    lookAt: [EDGE_AGENT_ANCHORS.dosing.x, 10, EDGE_AGENT_ANCHORS.dosing.y],
    duration: 2000,
  },
  uf: {
    cameraPos: [EDGE_AGENT_ANCHORS.uf.x + 2, 38, 42],
    lookAt: [EDGE_AGENT_ANCHORS.uf.x, 13, EDGE_AGENT_ANCHORS.uf.y],
    duration: 2000,
  },
  ro: {
    cameraPos: [EDGE_AGENT_ANCHORS.ro.x + 2, 36, 42],
    lookAt: [EDGE_AGENT_ANCHORS.ro.x, 12, EDGE_AGENT_ANCHORS.ro.y],
    duration: 2000,
  },
};
