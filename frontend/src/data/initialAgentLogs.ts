import type { AgentId, AgentLog } from '../types/index';

export const INITIAL_AGENT_LOGS: Record<AgentId, AgentLog[]> = {
  supervisor: [
    { id: 'm1', time: '03:41:02', message: '启动未来水厂智能体融合巡检架构', type: 'info' },
    { id: 'm2', time: '03:42:15', message: '分析进出流量：工艺产销差稳定在 2.4%', type: 'success' },
  ],
  dosing: [
    { id: 'd1', time: '03:40:48', message: '阻垢剂药箱液位校验：72% 充足', type: 'info' },
    { id: 'd2', time: '03:41:55', message: '阻垢剂投加参考：当前产水 3000 m3/d -> 设定值 4.0 ppm', type: 'success' },
  ],
  uf: [
    { id: 'u1', time: '03:40:50', message: '超滤进水阀组联动率 100%，系统正常运行', type: 'info' },
    { id: 'u2', time: '03:42:01', message: '跨膜压差在线扫频完成：82 kPa，处于常态运行态', type: 'success' },
  ],
  ro: [
    { id: 'me1', time: '03:40:55', message: '一级反渗透 膜区在线巡检启动', type: 'info' },
    { id: 'me2', time: '03:42:10', message: '反渗透产水 TDS 180 mg/L，处于 PPT 100-300 mg/L 范围', type: 'success' },
  ],
  pump: [
    { id: 'p1', time: '03:40:57', message: '泵组转速、电流与温升采样链路已上线', type: 'info' },
    { id: 'p2', time: '03:42:12', message: '主泵运行电流 28A，处于正常负载区间', type: 'success' },
  ],
};
