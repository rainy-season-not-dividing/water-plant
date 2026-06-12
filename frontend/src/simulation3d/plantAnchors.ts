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
  ro: { x: -80, y: EDGE_AGENT_ROW_Y, z: EDGE_AGENT_HEIGHT-5},
  uf: { x: 20, y: EDGE_AGENT_ROW_Y-5, z: EDGE_AGENT_HEIGHT+5 },
  dosing: { x: 108, y: EDGE_AGENT_ROW_Y, z: EDGE_AGENT_HEIGHT },
  pump: { x: 173, y: EDGE_AGENT_ROW_Y, z: EDGE_AGENT_HEIGHT },
};

const DEVICE_FOCUS_CAMERA_OFFSETS: Record<EdgeAgentId, [number, number, number]> = {
  ro: [34, 36, 45],
  uf: [0, 38, -48],
  dosing: [-34, 34, 46],
  pump: [-44, 34, 44],
};

const AGENT_MODEL_VISUAL_OFFSETS: Partial<Record<EdgeAgentId, PlantAnchor>> = {
  // Keep these visual offsets in sync with AgentNode AGENT_MODEL_CONFIG.offset.
  ro: { x: 0, y: 0, z: 1.5 },
  uf: { x: 0, y: 0, z: -2 },
};

function withOffset(anchor: PlantAnchor, offset?: PlantAnchor): PlantAnchor {
  if (!offset) return anchor;
  return {
    x: anchor.x + offset.x,
    y: anchor.y + offset.y,
    z: anchor.z + offset.z,
  };
}

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

export const REAL_AGENT_VISUAL_ANCHORS: PlantAgentAnchors = {
  supervisor: REAL_AGENT_ANCHORS.supervisor,
  ro: withOffset(REAL_AGENT_ANCHORS.ro, AGENT_MODEL_VISUAL_OFFSETS.ro),
  uf: withOffset(REAL_AGENT_ANCHORS.uf, AGENT_MODEL_VISUAL_OFFSETS.uf),
  dosing: REAL_AGENT_ANCHORS.dosing,
  pump: REAL_AGENT_ANCHORS.pump,
};

export const REAL_BUBBLE_ANCHORS: PlantAgentAnchors = {
  supervisor: { x: 8, y: -76, z: 30 },
  ro: REAL_AGENT_VISUAL_ANCHORS.ro,
  uf: REAL_AGENT_VISUAL_ANCHORS.uf,
  dosing: REAL_AGENT_VISUAL_ANCHORS.dosing,
  pump: REAL_AGENT_VISUAL_ANCHORS.pump,
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
    cameraPos: [
      REAL_DEVICE_CENTERS.pump.x + DEVICE_FOCUS_CAMERA_OFFSETS.pump[0],
      REAL_DEVICE_CENTERS.pump.z + DEVICE_FOCUS_CAMERA_OFFSETS.pump[1],
      REAL_DEVICE_CENTERS.pump.y + DEVICE_FOCUS_CAMERA_OFFSETS.pump[2],
    ],
    lookAt: [REAL_DEVICE_CENTERS.pump.x, REAL_DEVICE_CENTERS.pump.z, REAL_DEVICE_CENTERS.pump.y],
    duration: 2000,
  },
  dosing: {
    cameraPos: [
      REAL_DEVICE_CENTERS.dosing.x + DEVICE_FOCUS_CAMERA_OFFSETS.dosing[0],
      REAL_DEVICE_CENTERS.dosing.z + DEVICE_FOCUS_CAMERA_OFFSETS.dosing[1],
      REAL_DEVICE_CENTERS.dosing.y + DEVICE_FOCUS_CAMERA_OFFSETS.dosing[2],
    ],
    lookAt: [REAL_DEVICE_CENTERS.dosing.x, REAL_DEVICE_CENTERS.dosing.z, REAL_DEVICE_CENTERS.dosing.y],
    duration: 2000,
  },
  uf: {
    cameraPos: [
      REAL_DEVICE_CENTERS.uf.x + DEVICE_FOCUS_CAMERA_OFFSETS.uf[0],
      REAL_DEVICE_CENTERS.uf.z + DEVICE_FOCUS_CAMERA_OFFSETS.uf[1],
      REAL_DEVICE_CENTERS.uf.y + DEVICE_FOCUS_CAMERA_OFFSETS.uf[2],
    ],
    lookAt: [REAL_DEVICE_CENTERS.uf.x, REAL_DEVICE_CENTERS.uf.z, REAL_DEVICE_CENTERS.uf.y],
    duration: 2000,
  },
  ro: {
    cameraPos: [
      REAL_DEVICE_CENTERS.ro.x + DEVICE_FOCUS_CAMERA_OFFSETS.ro[0],
      REAL_DEVICE_CENTERS.ro.z + DEVICE_FOCUS_CAMERA_OFFSETS.ro[1],
      REAL_DEVICE_CENTERS.ro.y + DEVICE_FOCUS_CAMERA_OFFSETS.ro[2],
    ],
    lookAt: [REAL_DEVICE_CENTERS.ro.x, REAL_DEVICE_CENTERS.ro.z, REAL_DEVICE_CENTERS.ro.y],
    duration: 2000,
  },
};
