import type { AgentId, AgentData } from '../types/index';

export const INITIAL_AGENTS_DATA: Record<AgentId, Omit<AgentData, 'status' | 'logs'>> = {
  supervisor: {
    id: 'supervisor',
    name: '监督总管智能体',
    englishName: '监管协调智能体',
    role: '统一数据采集、异常归因分析、建议单生成与人工确认闭环跟踪',
    x: 52,
    y: 19,
    desc: '全厂系统的神经中枢。协调各个子智能体运转，在发生异常时生成风险分级、处置建议单和人工确认记录。',
    capabilities: [
      '工艺全链归因诊断',
      '建议优先级排序',
      '多异常联动决策模型',
      '人工确认与效果回写'
    ],
    metrics: [
      { key: 'health', label: '协调健康度', value: 98, unit: '%', trend: 'stable' },
      { key: 'latency', label: '协同决策延迟', value: 120, unit: 'ms', trend: 'down' },
      { key: 'confidence', label: '诊断置信度', value: 99.4, unit: '%', trend: 'up' }
    ]
  },
  dosing: {
    id: 'dosing',
    name: '加药智能体',
    englishName: '加药优化智能体',
    role: '反渗透阻垢剂、超滤清洗药剂、加药泵流量与药箱液位监测建议',
    x: 34,
    y: 39,
    desc: '聚焦 超滤清洗加药与 反渗透保护加药。基于药箱液位、加药泵流量和 反渗透 结垢风险，生成待人工确认的投加建议。',
    capabilities: [
      '阻垢剂投加建议',
      '超滤清洗药剂状态复核',
      '加药泵流量偏差识别',
      '投加联锁状态检查'
    ],
    metrics: [
      { key: 'dosing_accuracy', label: '加药稳态精度', value: 99.1, unit: '%', trend: 'up' },
      { key: 'chemical_saving', label: '累计药剂节省', value: 12.4, unit: '%', trend: 'up' },
      { key: 'response_time', label: '工艺响应时延', value: 8, unit: 's', trend: 'stable' }
    ]
  },
  uf: {
    id: 'uf',
    name: '超滤智能体',
    englishName: '超滤监测智能体',
    role: '超滤 TMP、产水浊度、SDI、回收率与反洗/CEB 建议',
    x: 48,
    y: 71,
    desc: '全面监管超滤系统的安全与效能。实时分析 TMP、产水浊度和 SDI，生成反洗或 CEB 的人工确认建议。',
    capabilities: [
      '跨膜压差(TMP)多点测定',
      '反洗/CEB 建议生成',
      '清洗后恢复率跟踪',
      '滤阻发展建模预警'
    ],
    metrics: [
      { key: 'tmp', label: '跨膜压差 (TMP)', value: 85, unit: 'kPa', trend: 'stable' },
      { key: 'recovery_rate', label: '超滤回收率', value: 93, unit: '%', trend: 'stable' },
      { key: 'wash_cycle', label: '反洗周期参考', value: 30, unit: 'min', trend: 'stable' }
    ]
  },
  ro: {
    id: 'ro',
    name: '反渗透智能体',
    englishName: '反渗透 Optimization Agent',
    role: '一级反渗透 产水 TDS、进水压力、段间压差、回收率与 CIP 风险建议',
    x: 73,
    y: 43,
    desc: '管理一级反渗透 处理单元。把控进水压力、段间压差、产水 TDS、脱盐率和回收率，生成膜保护建议。',
    capabilities: [
      '反渗透压差趋势建模',
      '产水 TDS 异常识别',
      'CIP/冲洗风险复核',
      '单位产水能耗趋势分析'
    ],
    metrics: [
      { key: 'ro_pressure_diff', label: '反渗透压差', value: 0.45, unit: 'MPa', trend: 'stable' },
      { key: 'ro_tds', label: '产水 TDS', value: 180, unit: 'mg/L', trend: 'stable' },
      { key: 'ro_flush_mode', label: '冲洗模式', value: '已就绪', unit: '', trend: 'stable' },
      { key: 'ro_recovery_time', label: '恢复时间', value: 0, unit: 'min', trend: 'stable' }
    ]
  },
  pump: {
    id: 'pump',
    name: '泵组智能体',
    englishName: '泵组智能体',
    role: '泵组转速、电流、温度与过载风险监测，生成降载或备用泵建议',
    x: 65,
    y: 70,
    desc: '监管关键泵组运行状态。持续跟踪转速、电流与温升，在出现过载趋势时生成降载与备用泵切换建议。',
    capabilities: [
      '泵组电流过载识别',
      '转速与温升趋势分析',
      '备用泵切换策略推演',
      '运行能耗与寿命平衡'
    ],
    metrics: [
      { key: 'speed', label: '转速', value: 1480, unit: 'rpm', trend: 'stable' },
      { key: 'current', label: '电流', value: 28, unit: 'A', trend: 'stable' },
      { key: 'temperature', label: '温度', value: 55, unit: 'degC', trend: 'stable' },
      { key: 'status', label: '运行状态', value: '正常', unit: '', trend: 'stable' }
    ]
  }
};
