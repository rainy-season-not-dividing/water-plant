import React from 'react';
import { Activity, Sparkles, Layers, Droplet, Gauge } from 'lucide-react';
import type { Camera3D } from './utils/geometry3d';
import { mathProj } from './utils/geometry3d';
import type { AgentId, AgentData, AgentStatusMap } from '../types/index';
import { INITIAL_AGENTS_DATA } from '../data/initialAgents';
import { AGENT_3D_ANCHORS } from '../data/constants';

interface AgentBadgesProps {
  camera: Camera3D;
  agentStatuses: AgentStatusMap;
  cards: Record<AgentId, { isOpen: boolean }>;
  toggleAgentCard: (agentId: AgentId) => void;
}

export const AgentBadges: React.FC<AgentBadgesProps> = ({
  camera, agentStatuses, cards, toggleAgentCard
}) => {
  const agentAnchors = Object.fromEntries(
    Object.entries(AGENT_3D_ANCHORS).map(([id, anchor]) => [
      id,
      mathProj(anchor.x, anchor.y, anchor.z, camera)
    ])
  ) as Record<AgentId, ReturnType<typeof mathProj>>;

  return (
    <>
      {Object.entries(INITIAL_AGENTS_DATA).map(([id, item]) => {
        const status = agentStatuses[id as AgentId];
        const proj = agentAnchors[id as AgentId];

        let themeColor = '#14b8a6';
        if (status === 'warning') themeColor = '#fbbf24';
        else if (status === 'processing') themeColor = '#3b82f6';

        return (
          <g
            key={id}
            transform={`translate(${proj.x}, ${proj.y})`}
            className="cursor-pointer group select-none"
            onClick={() => toggleAgentCard(id as AgentId)}
            id={`agent-icon-g-${id}`}
          >
            <circle r="32" fill="url(#hologramCircle)" className="animate-pulse" opacity="0.5" />
            <circle
              r="18" fill="none" stroke={themeColor}
              strokeWidth="1.2" strokeDasharray="3 5" opacity="0.7"
              className="animate-spin"
              style={{ transformOrigin: '0px 0px', animationDuration: '12s' }}
            />
            <circle
              r="14"
              fill={status === 'warning' ? '#78350f' : '#031730'}
              stroke={themeColor} strokeWidth="2"
              className="group-hover:scale-110 transition-transform duration-200"
              filter="url(#glow)"
            />
            <g transform="translate(-5.5, -5.5) scale(0.48)">
              {id === 'supervisor' && <Activity className={`w-24 h-24 text-${status === 'warning' ? 'amber-400' : 'teal-400'}`} />}
              {id === 'dosing' && <Sparkles className={`w-24 h-24 text-${status === 'warning' ? 'amber-400' : 'yellow-400'}`} />}
              {id === 'uf' && <Layers className={`w-24 h-24 text-${status === 'warning' ? 'amber-400' : 'cyan-400'}`} />}
              {id === 'ro' && <Droplet className={`w-24 h-24 text-${status === 'warning' ? 'amber-400' : 'emerald-400'}`} />}
              {id === 'pump' && <Gauge className={`w-24 h-24 text-${status === 'warning' ? 'amber-400' : 'violet-400'}`} />}
            </g>
            <g transform="translate(0, -22)" className="opacity-90 group-hover:opacity-100 transition-opacity">
              <rect
                x="-28" y="-6" width="56" height="13" rx="4"
                fill={status === 'warning' ? '#78350f' : status === 'processing' ? '#1e3a8a' : '#064e3b'}
                stroke={themeColor} strokeWidth="0.5"
              />
              <text
                x="0" y="2.5" textAnchor="middle" fill="#f8fafc"
                fontSize="8" fontFamily="monospace" fontWeight="bold"
              >
                {status === 'warning' ? '异常' : status === 'processing' ? '思考中' : '优化中'}
              </text>
            </g>
            <line x1="0" y1="0" x2="0" y2="12" stroke={themeColor} strokeWidth="1.5" strokeDasharray="2 2" opacity="0.6" />
          </g>
        );
      })}
    </>
  );
};
