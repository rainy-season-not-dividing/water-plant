import type { AgentId, AgentLog, AgentStatusMap, TelemetryState } from '../../types/index';

type StatusMap = AgentStatusMap;
type LogMap = Record<AgentId, AgentLog[]>;
type SetStr = (s: string) => void;
type SetLogs = (l: string[]) => void;

function prependLog(logs: LogMap, agentId: AgentId, stamp: string, message: string, type: AgentLog['type']) {
  logs[agentId] = [
    { id: `${agentId}_${stamp}_${Math.random().toString(36).slice(2)}`, time: stamp, message, type },
    ...logs[agentId],
  ];
}

export function applyDosingStep(
  step: number, stamp: string,
  t: TelemetryState, aStatuses: StatusMap, aLogs: LogMap, payloadLogs: string[],
  setTitle: SetStr, setDesc: SetStr, setPayload: SetLogs
) {
  switch (step) {
    case 1:
      setTitle('【步骤1/8】加药异常：先区分 UF 清洗域与 RO 保护域');
      setDesc('系统检测到药箱液位和加药泵流量波动，同时 UF 产水浊度升至 1.6 NTU。先判断异常属于 UF 清洗加药、RO 阻垢保护，还是药泵本体问题。');
      t.outletTurbidity = 1.6;
      t.dosingRate = 2.6;
      t.chemicalLevel = 38;
      t.healthScore = 84;
      aStatuses.dosing = 'warning';
      prependLog(aLogs, 'dosing', stamp, '告警：加药泵流量偏离，需区分 UF 清洗加药域与 RO 保护加药域。', 'warning');
      setPayload([
        '[系统警报] 加药链路出现波动，UF 产水浊度同步偏高。',
        '[加药智能体] 启动分域复核：UF CEB/CED 药剂、RO 阻垢剂、药泵流量与液位。',
      ]);
      break;
    case 2:
      setTitle('【步骤2/8】采集加药、UF 与 RO 关联指标');
      setDesc('上送 UF TMP、UF 产水浊度、SDI、RO 进水/产水 TDS、回收率、阻垢剂投加和药泵状态，避免把所有加药问题都归为 RO 阻垢剂。');
      t.ufPressure = 300;
      t.roTds = 220;
      t.onlineRate = 99.8;
      prependLog(aLogs, 'dosing', stamp, '已采集药箱液位、加药泵流量、UF 清洗记录与 RO 阻垢剂投加状态。', 'info');
      setPayload([...payloadLogs, '[数据上送] UF 清洗药剂域与 RO 保护药剂域同步进入总管分析。']);
      break;
    case 3:
      setTitle('【步骤3/8】监管总管判断跨域风险');
      setDesc('监管总管联动 UF、RO、加药和泵组，判断 UF 清洗残留是否会影响 RO 进水，以及 RO 结垢风险是否来自阻垢剂投加不足。');
      aStatuses.supervisor = 'warning';
      prependLog(aLogs, 'supervisor', stamp, '跨域判断：加药异常必须同时评估 UF 清洗残留与 RO 进水保护。', 'warning');
      setPayload([...payloadLogs, '[总管分析] 加药 Agent 不独立决定投加量，需结合 UF/RO 风险和人工确认。']);
      break;
    case 4:
      setTitle('【步骤4/8】生成分域复核建议');
      setDesc('建议先复核 UF CEB/CED 药剂类别、冲洗残留和药泵状态，再复核 RO 阻垢剂投加、回收率和进水 TDS，必要时建议 RO 临时隔离。');
      aStatuses.supervisor = 'processing';
      aStatuses.dosing = 'processing';
      aStatuses.uf = 'processing';
      aStatuses.ro = 'processing';
      prependLog(aLogs, 'supervisor', stamp, '建议链：加药分域复核 + UF 残留确认 + RO 进水安全判断。', 'info');
      prependLog(aLogs, 'dosing', stamp, '建议复核：UF 清洗药剂与 RO 阻垢剂分别建账，不混用判断。', 'info');
      setPayload([...payloadLogs, '[建议生成] 形成加药分域复核单，等待专项 Agent 细化。']);
      break;
    case 5:
      setTitle('【步骤5/8】加药智能体细化建议单');
      setDesc('加药智能体建议：阻垢剂维持在 3-5 ppm 临时参考范围内复核；UF 清洗药剂需确认药剂类别、浓度、接触时间、余氯/ORP 与冲洗时间。');
      t.dosingRate = 4.0;
      t.chemicalLevel = 42;
      prependLog(aLogs, 'dosing', stamp, '方案生成：RO 阻垢剂按 3-5 ppm 参考范围复核，UF 清洗药剂需确认残留风险。', 'info');
      setPayload([...payloadLogs, '[专项建议] 输出 UF 清洗加药域与 RO 保护加药域两组人工确认项。']);
      break;
    case 6:
      setTitle('【步骤6/8】等待人工确认加药分域处置单');
      setDesc('AI 只生成建议。药剂投加量调整、RO 隔离、冲洗延长、泵阀动作必须由人工确认后进入执行记录。');
      t.energyConsumption = 0.25;
      setPayload([...payloadLogs, '[人工确认] 加药分域复核单已形成，等待现场确认或驳回。']);
      break;
    case 7:
      setTitle('【步骤7/8】人工确认后记录处置结果');
      setDesc('系统记录加药泵复核、药箱液位、UF 清洗残留确认和 RO 进水安全判断，不写成 AI 自动加药或自动隔离。');
      t.chemicalLevel = 68;
      t.outletTurbidity = 0.7;
      prependLog(aLogs, 'dosing', stamp, '效果回写：现场已复核加药泵和药剂域，UF 产水浊度回落。', 'success');
      setPayload([...payloadLogs, '[效果回写] 人工确认结果已写入建议闭环，继续观察 UF/RO 指标。']);
      break;
    case 8:
      setTitle('【步骤8/8】加药链路恢复，UF/RO 风险解除');
      setDesc('UF 产水浊度回到 <1 NTU，RO 产水 TDS 保持在 100-300 mg/L 范围，加药智能体恢复分域巡检。');
      t.outletTurbidity = 0.08;
      t.roTds = 180;
      t.dosingRate = 4.2;
      t.healthScore = 98;
      aStatuses.supervisor = 'monitoring';
      aStatuses.dosing = 'monitoring';
      aStatuses.uf = 'monitoring';
      aStatuses.ro = 'monitoring';
      prependLog(aLogs, 'supervisor', stamp, '加药分域处置闭环完成，系统恢复 AI 副驾驶巡检。', 'success');
      prependLog(aLogs, 'dosing', stamp, '本轮加药异常归档：UF 清洗域与 RO 保护域已分开记录。', 'success');
      setPayload([...payloadLogs, '[闭环归档] 建议、人工确认和指标恢复已记录。']);
      break;
  }
}

export function applyUfStep(
  step: number, stamp: string,
  t: TelemetryState, aStatuses: StatusMap, aLogs: LogMap, payloadLogs: string[],
  setTitle: SetStr, setDesc: SetStr, setPayload: SetLogs
) {
  switch (step) {
    case 1:
      setTitle('【步骤1/8】UF 异常：TMP 升高并触发前置保护复核');
      setDesc('UF TMP 从 82 kPa 升至 450 kPa，达到 CEB 建议触发参考值。系统先复核自清洗过滤器和上游来水，不直接判定为膜深度污染。');
      t.ufPressure = 450;
      t.outletTurbidity = 1.2;
      t.healthScore = 80;
      aStatuses.uf = 'warning';
      prependLog(aLogs, 'uf', stamp, '告警：UF TMP 达到 450 kPa，先复核上游保护和自清洗过滤器。', 'warning');
      setPayload([
        '[系统警报] UF TMP 达到 CEB 建议触发参考值。',
        '[超滤智能体] 按顺序检查自清洗过滤器、上游来水和物理反洗效果。',
      ]);
      break;
    case 2:
      setTitle('【步骤2/8】采集 UF 上游与反洗恢复数据');
      setDesc('采集自清洗过滤器压差、UF 进水浊度、产水浊度、SDI、反洗频率和反洗后恢复率，用于区分上游颗粒负荷与 UF 膜污染。');
      t.inletTurbidity = 14.5;
      t.outletTurbidity = 1.4;
      prependLog(aLogs, 'uf', stamp, '已采集自清洗过滤器、反洗频率和反洗后恢复率。', 'info');
      setPayload([...payloadLogs, '[数据上送] UF 上游保护状态与反洗效果进入监管总管。']);
      break;
    case 3:
      setTitle('【步骤3/8】监管总管确认处置顺序');
      setDesc('总管判断：UF 是 RO 前置保护屏障。应先查上游与物理反洗，再评估 CEB/CED；只有长期恢复不足才进入 UF CIP 评估。');
      aStatuses.supervisor = 'warning';
      prependLog(aLogs, 'supervisor', stamp, '诊断结论：不得直接建议 CIP，按上游复核 -> 物理反洗 -> CEB/CED -> CIP 评估排序。', 'warning');
      setPayload([...payloadLogs, '[总管分析] UF 异常可能提升 RO 进水污染风险，需联动 RO Agent。']);
      break;
    case 4:
      setTitle('【步骤4/8】生成 UF 清洗升级链路建议');
      setDesc('建议复核自清洗过滤器、评估物理反洗恢复、请求加药 Agent 评估 CEB/CED 条件，并让 RO Agent 判断是否需要隔离进水。');
      aStatuses.supervisor = 'processing';
      aStatuses.uf = 'processing';
      aStatuses.dosing = 'processing';
      aStatuses.ro = 'processing';
      t.outletFlow = 3000;
      prependLog(aLogs, 'uf', stamp, '建议链：自清洗过滤器 -> 物理反洗 -> CEB/CED -> 残留确认 -> RO 进水安全。', 'info');
      prependLog(aLogs, 'ro', stamp, '接收 UF 产水风险提示，准备判断 RO 进水是否需隔离。', 'info');
      setPayload([...payloadLogs, '[协同建议] UF 清洗升级链路已形成，等待专项 Agent 细化。']);
      break;
    case 5:
      setTitle('【步骤5/8】UF Agent 输出 CEB/CED 复核项');
      setDesc('UF Agent 建议：先评估物理反洗恢复率；若恢复不足，复核 CEB/CED 药剂类别、浓度、接触时间、膜材质限制和清洗后残留。');
      prependLog(aLogs, 'uf', stamp, '方案生成：CEB/CED 仅作为人工确认建议，需核查药剂兼容性和残留风险。', 'info');
      prependLog(aLogs, 'dosing', stamp, '加药 Agent 准备复核 UF 清洗药剂类别、液位和清洗泵状态。', 'info');
      setPayload([...payloadLogs, '[专项建议] UF CEB/CED 条件复核单已生成。']);
      break;
    case 6:
      setTitle('【步骤6/8】等待人工确认 UF 处置链');
      setDesc('反洗、CEB/CED、RO 隔离、冲洗延长和 CIP 评估均为建议动作，必须人工确认后执行或记录。');
      setPayload([...payloadLogs, '[人工确认] UF 清洗升级建议单已提交，等待现场确认。']);
      break;
    case 7:
      setTitle('【步骤7/8】人工确认后回写 UF 恢复与 RO 安全');
      setDesc('系统记录现场反洗/CEB 复核结果、TMP 下降趋势、产水浊度恢复情况和 RO 进水残留确认。');
      t.ufPressure = 180;
      t.outletTurbidity = 0.6;
      prependLog(aLogs, 'uf', stamp, '效果回写：人工确认处置后，TMP 下降，UF 产水浊度回落。', 'success');
      prependLog(aLogs, 'ro', stamp, 'RO 进水保护状态已复核，继续观察 SDI 和残留风险。', 'info');
      setPayload([...payloadLogs, '[效果回写] 记录 UF 恢复指标和 RO 进水安全判断。']);
      break;
    case 8:
      setTitle('【步骤8/8】UF 指标恢复，RO 前置保护稳定');
      setDesc('UF TMP 回落至 82 kPa，产水浊度恢复至 <1 NTU，RO 进水保护状态恢复，系统回到建议巡检。');
      t.ufPressure = 82;
      t.outletTurbidity = 0.08;
      t.outletFlow = 3000;
      t.healthScore = 98;
      aStatuses.supervisor = 'monitoring';
      aStatuses.uf = 'monitoring';
      aStatuses.dosing = 'monitoring';
      aStatuses.ro = 'monitoring';
      prependLog(aLogs, 'supervisor', stamp, 'UF 清洗升级建议闭环完成，RO 前置保护恢复稳定。', 'success');
      prependLog(aLogs, 'uf', stamp, 'TMP 回落至 82 kPa，UF 产水浊度恢复至 PPT 目标 <1 NTU。', 'success');
      setPayload([...payloadLogs, '[闭环归档] UF 处置建议、人工确认与恢复指标已记录。']);
      break;
  }
}

export function applyRoStep(
  step: number, stamp: string,
  t: TelemetryState, aStatuses: StatusMap, aLogs: LogMap, payloadLogs: string[],
  setTitle: SetStr, setDesc: SetStr, setPayload: SetLogs
) {
  switch (step) {
    case 1:
      setTitle('【步骤1/8】RO 异常：产水 TDS 与段间压差升高');
      setDesc('一级 RO 产水 TDS 升至 360 mg/L，超过 PPT 100-300 mg/L 范围；段间压差同步升高，需判断结垢、污染、密封或进水波动风险。');
      t.roTds = 360;
      t.roPressureDiff = 0.78;
      t.roFlux = 68.5;
      t.healthScore = 78;
      aStatuses.ro = 'warning';
      prependLog(aLogs, 'ro', stamp, '告警：RO 产水 TDS 升至 360 mg/L，段间压差升高。', 'warning');
      setPayload([
        '[系统警报] RO 产水 TDS 和段间压差偏离。',
        '[反渗透智能体] 启动结垢、污染、密封和进水条件联合判断。',
      ]);
      break;
    case 2:
      setTitle('【步骤2/8】回看 UF 与 RO 保护指标');
      setDesc('采集 RO 进水/产水 TDS、回收率、阻垢剂投加、浓水状态和高压泵压力，同时回看 UF 产水浊度、SDI、TMP 与反洗效果。');
      t.outletTurbidity = 0.9;
      t.dosingRate = 3.1;
      prependLog(aLogs, 'ro', stamp, '已回看 UF 产水浊度、SDI、阻垢剂投加和高压泵压力流量。', 'info');
      setPayload([...payloadLogs, '[数据上送] RO 异常同步关联 UF 前置保护、加药和泵组能力。']);
      break;
    case 3:
      setTitle('【步骤3/8】监管总管禁止直接跳到 CIP');
      setDesc('总管判断：RO 压差升高不能直接建议 CIP。先查 UF 进水保护、阻垢剂投加、回收率和高压泵压力/流量，再评估低风险运行调整。');
      aStatuses.supervisor = 'warning';
      prependLog(aLogs, 'supervisor', stamp, '诊断结论：RO 异常先排查 UF、阻垢剂、回收率和高压泵，不直接建议 CIP。', 'warning');
      setPayload([...payloadLogs, '[总管分析] CIP 只作为恢复不足后的评估建议，需人工确认。']);
      break;
    case 4:
      setTitle('【步骤4/8】生成 RO 膜保护协同建议');
      setDesc('建议 RO Agent 联动加药 Agent 核查阻垢剂和药泵，联动泵组 Agent 核查高压泵压力/流量，并回看 UF 产水质量。');
      aStatuses.supervisor = 'processing';
      aStatuses.ro = 'processing';
      aStatuses.dosing = 'processing';
      aStatuses.pump = 'processing';
      prependLog(aLogs, 'supervisor', stamp, '协同建议：RO 膜保护需联动 UF、加药和泵组，等待人工确认。', 'info');
      prependLog(aLogs, 'dosing', stamp, '接收 RO 阻垢剂投加状态核查任务。', 'info');
      prependLog(aLogs, 'pump', stamp, '接收高压泵压力和流量复核任务。', 'info');
      setPayload([...payloadLogs, '[协同建议] RO 膜保护建议单已生成。']);
      break;
    case 5:
      setTitle('【步骤5/8】RO Agent 细化保护与 CIP 评估项');
      setDesc('RO Agent 建议：复核回收率 75%、阻垢剂 3-5 ppm、高压泵 1.0-1.5 MPa、UF 产水质量；若恢复不足，再评估 CIP 药剂兼容性和循环能力。');
      prependLog(aLogs, 'ro', stamp, '方案生成：先低风险复核运行条件，恢复不足再进入 CIP 条件评估。', 'info');
      setPayload([...payloadLogs, '[专项建议] 输出 RO 膜保护、阻垢剂核查和 CIP 评估前置条件。']);
      break;
    case 6:
      setTitle('【步骤6/8】等待人工确认 RO 膜保护建议');
      setDesc('涉及调泵、调回收率、冲洗、阻垢剂调整或 CIP 的动作均需人工确认；系统仅记录建议和风险依据。');
      setPayload([...payloadLogs, '[人工确认] RO 膜保护建议已提交，等待现场确认。']);
      break;
    case 7:
      setTitle('【步骤7/8】人工确认后回写 RO 恢复趋势');
      setDesc('系统记录产水 TDS、段间压差、产水流量、阻垢剂复核和高压泵状态变化，形成可追溯闭环。');
      t.roTds = 240;
      t.roPressureDiff = 0.52;
      t.roFlux = 73.4;
      prependLog(aLogs, 'ro', stamp, '效果回写：人工确认处置后，RO 产水 TDS 和段间压差开始回落。', 'success');
      setPayload([...payloadLogs, '[效果回写] 记录 RO 膜保护处置后的关键指标变化。']);
      break;
    case 8:
      setTitle('【步骤8/8】RO 产水质量恢复，CIP 评估归档');
      setDesc('RO 产水 TDS 回落至 180 mg/L，段间压差恢复稳定。本轮未自动执行 CIP，相关评估和人工确认记录归档。');
      t.roTds = 180;
      t.roPressureDiff = 0.45;
      t.roFlux = 75.2;
      t.energyConsumption = 0.18;
      t.healthScore = 98;
      aStatuses.supervisor = 'monitoring';
      aStatuses.ro = 'monitoring';
      aStatuses.dosing = 'monitoring';
      aStatuses.pump = 'monitoring';
      prependLog(aLogs, 'supervisor', stamp, 'RO 膜保护建议闭环完成，全厂产水维持 3000 m3/d。', 'success');
      prependLog(aLogs, 'ro', stamp, 'RO 产水 TDS 回落至 180 mg/L，处于 PPT 100-300 mg/L 范围。', 'success');
      setPayload([...payloadLogs, '[闭环归档] RO 处置建议、人工确认和恢复指标已记录。']);
      break;
  }
}

export function applyPumpStep(
  step: number, stamp: string,
  t: TelemetryState, aStatuses: StatusMap, aLogs: LogMap, payloadLogs: string[],
  setTitle: SetStr, setDesc: SetStr, setPayload: SetLogs
) {
  switch (step) {
    case 1:
      setTitle('[步骤1/8] 泵组异常：压力流量支撑能力波动');
      setDesc('主泵电流升至 46A，温度达到 78degC，可能影响 UF 供水、RO 高压泵或清洗循环能力。泵组只判断设备能力，不判断水质达标。');
      t.pumpCurrent = 46;
      t.pumpTemperature = 78;
      t.pumpStatus = 'overload';
      t.healthScore = 82;
      aStatuses.pump = 'warning';
      prependLog(aLogs, 'pump', stamp, '告警：主泵电流升至 46A，需复核泵组负载与压力流量。', 'warning');
      setPayload([
        '[系统警报] 泵组负载异常触发，水力输送链路进入保护评估。',
        '[泵组智能体] 仅判断供水、反洗、CIP 和加药泵能力，不替代水质判断。',
      ]);
      break;
    case 2:
      setTitle('[步骤2/8] 上送泵组与阀门运行断面');
      setDesc('采集供水泵、高压泵、反洗泵、CIP 循环泵、加药泵、阀门、压力、流量、频率、温升和能耗状态。');
      prependLog(aLogs, 'pump', stamp, '已上送泵组断面：压力、流量、频率、温升、阀门和备用泵状态。', 'info');
      setPayload([...payloadLogs, '[数据上送] 泵组运行能力进入总管联动诊断。']);
      break;
    case 3:
      setTitle('[步骤3/8] 总管判断对 UF/RO 工艺负荷的影响');
      setDesc('总管排除单纯水质归因，判断泵组波动可能影响 UF 反洗效果、RO 进水压力或 CIP 循环能力。');
      aStatuses.supervisor = 'warning';
      prependLog(aLogs, 'supervisor', stamp, '诊断结论：泵组异常影响工艺支撑能力，需联动 UF/RO 负荷判断。', 'warning');
      setPayload([...payloadLogs, '[总管分析] 泵组调整涉及生产连续性，必须人工确认。']);
      break;
    case 4:
      setTitle('[步骤4/8] 生成降载与备用泵分担建议');
      setDesc('建议复核主泵负载、备用泵可用性、UF/RO 进水压力和产水规模，人工确认后再执行降载或切换。');
      aStatuses.supervisor = 'processing';
      aStatuses.pump = 'processing';
      prependLog(aLogs, 'pump', stamp, '接收建议：主泵降载、备用泵分担和 UF/RO 压力流量联动复核。', 'info');
      setPayload([...payloadLogs, '[建议生成] 泵组降载和备用分担建议已形成。']);
      break;
    case 5:
      setTitle('[步骤5/8] 泵组智能体细化水力平衡方案');
      setDesc('泵组智能体给出主泵降速、备用泵分担、冲洗/CIP 循环能力复核建议，并提示不能破坏 3000 m3/d 产水规模。');
      t.pumpSpeed = 1360;
      prependLog(aLogs, 'pump', stamp, '方案生成：建议主泵降速复核，备用泵分担比例按现场能力确认。', 'info');
      setPayload([...payloadLogs, '[专项建议] 输出水力平衡和备用泵分担复核项。']);
      break;
    case 6:
      setTitle('[步骤6/8] 等待人工确认泵组建议');
      setDesc('降载、备用泵接管、阀门调整、反洗泵或 CIP 循环泵启停均需人工确认，AI 不直接调泵。');
      t.energyConsumption = 0.24;
      setPayload([...payloadLogs, '[人工确认] 泵组建议已生成，等待现场确认或驳回。']);
      break;
    case 7:
      setTitle('[步骤7/8] 人工确认后回写泵组与产水影响');
      setDesc('系统记录主泵电流、温升、备用泵分担、UF/RO 压力流量和产水规模变化。');
      t.pumpCurrent = 32;
      t.pumpTemperature = 62;
      t.outletFlow = 3000;
      prependLog(aLogs, 'pump', stamp, '效果回写：备用泵分担确认后，主泵电流回落至 32A。', 'success');
      setPayload([...payloadLogs, '[效果回写] 泵组降载处置已记录，产水量维持 3000 m3/d。']);
      break;
    case 8:
      setTitle('[步骤8/8] 泵组恢复稳定，工艺支撑能力正常');
      setDesc('泵组电流、温度、压力流量恢复稳定，UF/RO 工艺负荷支撑正常，系统恢复巡检。');
      t.pumpSpeed = 1480;
      t.pumpCurrent = 28;
      t.pumpTemperature = 55;
      t.pumpStatus = 'normal';
      t.outletFlow = 3000;
      t.healthScore = 98;
      t.energyConsumption = 0.22;
      aStatuses.supervisor = 'monitoring';
      aStatuses.pump = 'monitoring';
      prependLog(aLogs, 'supervisor', stamp, '泵组支撑能力建议闭环完成，全厂输送链路恢复低风险巡检。', 'success');
      prependLog(aLogs, 'pump', stamp, '泵组状态恢复：电流 28A，温度 55degC，运行状态正常。', 'success');
      setPayload([...payloadLogs, '[闭环完成] 泵组支撑能力恢复，系统回到额定工况。']);
      break;
  }
}
