import type { AgentId, AgentMeta } from '../types/index';

export const AGENT_WINDOW_DATA: Record<AgentId, AgentMeta> = {
  supervisor: {
    id: 'supervisor',
    name: '监管总管智能体',
    englishName: 'Supervisor',
    color: '#378ADD',
    role: '汇总 UF、RO、加药和泵组状态，生成风险分级与人工确认单，不直接控制设备。',
    metrics: [
      { key: 'alarmCount', label: '待确认建议', value: 0, unit: '条', normalRange: { min: 0, max: 5 }, alarmRule: 'upper', shiftDirection: 'up' },
      { key: 'productionScale', label: '产水规模', value: 3000, unit: 'm3/d', normalRange: { min: 2800, max: 3000 }, alarmRule: 'lower', shiftDirection: 'down' },
      { key: 'feedScale', label: '进水规模', value: 4300, unit: 'm3/d', normalRange: { min: 4000, max: 4500 }, alarmRule: 'both' },
      { key: 'onlineRate', label: '设备在线率', value: 99.2, unit: '%', normalRange: { min: 95 }, alarmRule: 'lower', shiftDirection: 'down' },
    ],
  },
  dosing: {
    id: 'dosing',
    name: '加药智能体',
    englishName: 'Dosing',
    color: '#BA7517',
    role: '跟踪 RO 阻垢剂、UF 清洗药剂、加药泵流量和药箱液位，输出投加/清洗建议并等待人工确认。',
    metrics: [
      { key: 'antiscalantDose', label: '阻垢剂投加', value: 4.0, unit: 'ppm', normalRange: { min: 3, max: 5 }, alarmRule: 'both', shiftDirection: 'up' },
      { key: 'chemicalLevel', label: '药箱液位', value: 72, unit: '%', normalRange: { min: 20, max: 100 }, alarmRule: 'lower', shiftDirection: 'down' },
      { key: 'pumpDeviation', label: '加药泵偏差', value: 4, unit: '%', normalRange: { max: 10 }, alarmRule: 'upper', shiftDirection: 'up' },
      { key: 'ufCleanState', label: 'UF清洗药剂', value: '待命', unit: '', normalRange: ['待命', '需复核'], alarmRule: null },
    ],
  },
  uf: {
    id: 'uf',
    name: '超滤智能体',
    englishName: 'UF',
    color: '#1D9E75',
    role: '监测 UF TMP、产水浊度、SDI、回收率和反洗/CEB 记录，判断是否生成反洗或 CEB 建议。',
    metrics: [
      { key: 'tmp', label: 'UF TMP', value: 82, unit: 'kPa', normalRange: { max: 300 }, alarmRule: 'upper', shiftDirection: 'up' },
      { key: 'recovery', label: 'UF回收率', value: 93, unit: '%', normalRange: { min: 90, max: 93 }, alarmRule: 'lower', shiftDirection: 'down' },
      { key: 'turbidity', label: 'UF产水浊度', value: 0.8, unit: 'NTU', normalRange: { max: 1 }, alarmRule: 'upper', shiftDirection: 'up' },
      { key: 'sdi', label: 'UF出水SDI', value: 2.5, unit: '', normalRange: { max: 3 }, alarmRule: 'upper', shiftDirection: 'up' },
    ],
  },
  ro: {
    id: 'ro',
    name: '反渗透智能体',
    englishName: 'RO',
    color: '#D85A30',
    role: '分析一级 RO 进水压力、段间压差、产水 TDS、回收率和 CIP 风险，输出膜保护建议。',
    metrics: [
      { key: 'inletPressure', label: 'RO进水压力', value: 1.2, unit: 'MPa', normalRange: { min: 1.0, max: 1.5 }, alarmRule: 'both', shiftDirection: 'up' },
      { key: 'tds', label: '产水TDS', value: 180, unit: 'mg/L', normalRange: { min: 100, max: 300 }, alarmRule: 'upper', shiftDirection: 'up' },
      { key: 'recovery', label: 'RO回收率', value: 75, unit: '%', normalRange: { min: 70, max: 75 }, alarmRule: 'lower', shiftDirection: 'down' },
      { key: 'desalination', label: '脱盐率', value: 97, unit: '%', normalRange: { min: 95, max: 99 }, alarmRule: 'lower', shiftDirection: 'down' },
    ],
  },
  pump: {
    id: 'pump',
    name: '泵组智能体',
    englishName: 'Pump',
    color: '#534AB7',
    role: '持续评估泵组转速、电流、温度、压力和能耗，给出供水能力与备用泵切换建议。',
    metrics: [
      { key: 'speed', label: '转速', value: 1480, unit: 'rpm', normalRange: { min: 1450, max: 1500 }, alarmRule: 'both', shiftDirection: 'up' },
      { key: 'current', label: '电流', value: 28, unit: 'A', normalRange: { min: 25, max: 35 }, alarmRule: 'upper', shiftDirection: 'up' },
      { key: 'temperature', label: '温度', value: 55, unit: 'degC', normalRange: { max: 65 }, alarmRule: 'upper', shiftDirection: 'up' },
      { key: 'runState', label: '运行状态', value: '正常', unit: '', normalRange: ['正常', '过载'], alarmRule: null },
    ],
  },
};

export const AGENT_ORDER: AgentId[] = ['supervisor', 'uf', 'ro', 'dosing', 'pump'];
