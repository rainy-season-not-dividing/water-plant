import type { AgentId, AgentLog, AgentStatusMap, TelemetryState } from '../../types/index';

type StatusMap = AgentStatusMap;
type LogMap = Record<AgentId, AgentLog[]>;
type SetStr = (s: string) => void;
type SetLogs = (l: string[]) => void;

export function applyDosingStep(
  step: number, stamp: string,
  t: TelemetryState, aStatuses: StatusMap, aLogs: LogMap, payloadLogs: string[],
  setTitle: SetStr, setDesc: SetStr, setPayload: SetLogs
) {
  switch (step) {
    case 1:
      setTitle('【步骤1/8】UF/RO 进水保护：前端水质波动');
      setDesc('UF 产水浊度与 RO 进水保护指标出现偏离，需联动复核加药、过滤器和 UF 反洗状态。');
      t.inletTurbidity = 15.0;
      t.healthScore = 85;
      t.outletTurbidity = 1.6;
      aStatuses.dosing = 'warning';
      aLogs.dosing = [
        { id: `dos_${stamp}`, time: stamp, message: '警报：UF 产水浊度升至 1.6 NTU，超过 PPT 目标 <1 NTU。', type: 'warning' },
        ...aLogs.dosing
      ];
      setPayload(['[系统警报] 进水工艺监测点异常触发现场高频波动。', '[加药智能体] 捕获 RO 阻垢剂/UF 清洗药剂联动复核需求。']);
      break;
    case 2:
      setTitle('【步骤2/8】感知数据实时上送云管');
      setDesc('故障诊断传感器与加药智能体并行，将多维工艺异常断面指标高速注入总控制信道。');
      t.onlineRate = 99.8;
      aLogs.dosing = [
        { id: `dos_${stamp}`, time: stamp, message: '正在构建局部高维度工况快照并打包广播...', type: 'info' },
        ...aLogs.dosing
      ];
      setPayload([...payloadLogs, '[通信子网] 加药子段断面传感器实时上送多重分析值。', '[数据验证] 加药浓度失调归档，信道时延 15ms。']);
      break;
    case 3:
      setTitle('【步骤3/8】监管总管智能体工艺链深度归因分析');
      setDesc('总管智能体接管全链感知。比对 UF 产水浊度、SDI、TMP 和 RO 进水保护状态，定位前端颗粒负荷风险。');
      aStatuses.supervisor = 'warning';
      aLogs.supervisor = [
        { id: `mast_${stamp}`, time: stamp, message: '诊断广播：UF 产水质量偏离 PPT 基准，需复核过滤器、UF 反洗和加药状态。', type: 'warning' },
        ...aLogs.supervisor
      ];
      setPayload([...payloadLogs, '[总控智能体] 启动关联推演。判定风险来自前端颗粒负荷与阻垢剂投加状态偏离。']);
      break;
    case 4:
      setTitle('【步骤4/8】协同建议单生成');
      setDesc('总管智能体生成建议单：复核 UF 反洗效果、确认阻垢剂投加状态，并提示 RO 侧关注进水污染风险。');
      aStatuses.supervisor = 'processing';
      aStatuses.uf = 'processing';
      aLogs.supervisor = [
        { id: `mast_${stamp}`, time: stamp, message: '建议链：请【加药智能体】核查阻垢剂投加，请【超滤】评估反洗/CEB 条件。', type: 'info' },
        ...aLogs.supervisor
      ];
      aLogs.uf = [
        { id: `uf_${stamp}`, time: stamp, message: '接收协同建议：预计浊度冲击5分钟后到达，复核过滤器、UF 反洗和 CEB 条件。', type: 'info' },
        ...aLogs.uf
      ];
      setPayload([...payloadLogs, '[控制中心] 生成协同建议：复核 RO 阻垢剂投加与 UF 清洗条件，等待人工确认。']);
      break;
    case 5:
      setTitle('【步骤5/8】加药与 UF 保护建议生成');
      setDesc('加药智能体结合 PPT 阻垢剂临时参考 3-5 ppm，生成“维持 4 ppm 并复核泵流量偏差”的建议，等待人工确认。');
      t.dosingRate = 4.0;
      aStatuses.dosing = 'processing';
      aLogs.dosing = [
        { id: `dos_${stamp}`, time: stamp, message: '方案生成：阻垢剂维持 4 ppm，核查加药泵偏差是否超过 10%，必要时人工确认调整。', type: 'info' },
        ...aLogs.dosing
      ];
      setPayload([...payloadLogs, '[加药系统] AI 完成阻垢剂投加趋势评估，输出建议剂量与复核项。']);
      break;
    case 6:
      setTitle('【步骤6/8】等待人工确认');
      setDesc('AI 已生成建议单。反洗、加药和泵阀动作必须由人工确认后执行，系统暂停在确认节点。');
      t.energyConsumption = 0.25;
      setPayload([...payloadLogs, '[人工确认] 建议单已形成，等待现场人员确认或驳回。']);
      break;
    case 7:
      setTitle('【步骤7/8】人工确认后效果回写');
      setDesc('人工确认处置后，系统记录加药泵复核、UF 反洗效果和 RO 进水风险变化。');
      t.chemicalLevel = 70;
      aLogs.dosing = [
        { id: `dos_${stamp}`, time: stamp, message: '效果回写：阻垢剂投加稳定在 4 ppm，UF 产水浊度回落。', type: 'success' },
        ...aLogs.dosing
      ];
      setPayload([...payloadLogs, '[效果回写] 人工确认后记录阻垢剂投加复核、UF 清洗效果与 RO 进水风险变化。']);
      break;
    case 8:
      setTitle('【步骤8/8】UF/RO 产水质量恢复，指标回归');
      setDesc('人工确认处置后，UF 产水浊度回到 <1 NTU，RO 进水保护状态恢复，多智能体恢复建议巡检。');
      t.inletTurbidity = 10;
      t.outletTurbidity = 0.08;
      t.healthScore = 99;
      aStatuses.supervisor = 'monitoring';
      aStatuses.dosing = 'monitoring';
      aStatuses.uf = 'monitoring';
      aLogs.supervisor = [
        { id: `mast_${stamp}`, time: stamp, message: '水质跟踪显示浊度完全脱困。智能体联勤网络变回常态巡视阶段。', type: 'success' },
        ...aLogs.supervisor
      ];
      aLogs.dosing = [
        { id: `dos_${stamp}`, time: stamp, message: '本轮 UF/RO 前端水质波动处置结束。过程建议单已归档。', type: 'success' },
        ...aLogs.dosing
      ];
      setPayload([...payloadLogs, '[运营总结] 建议闭环记录完成，阻垢剂投加维持在 3-5 ppm 参考范围内。', '[运营状态] 全厂指标恢复至 PPT 展示口径。']);
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
      setTitle('【步骤1/8】超滤阻塞：跨膜压差峰值恶化');
      setDesc('中部超滤A通道检测到细悬浮颗粒沉积，跨膜压差(TMP)从 82 kPa 升至 450 kPa，达到 CEB 建议触发参考值。');
      t.ufPressure = 450;
      t.healthScore = 80;
      aStatuses.uf = 'warning';
      aLogs.uf = [
        { id: `uf_${stamp}`, time: stamp, message: '警告：UF TMP 达到 450 kPa，建议人工确认反洗/CEB。', type: 'warning' },
        ...aLogs.uf
      ];
      setPayload(['[系统警报] 中游超滤阀段跨膜压差瞬时超过二级极限。', '[超滤智能体] 捕获膜片孔道孔径极度压缩。']);
      break;
    case 2:
      setTitle('【步骤2/8】故障断面参数高速上送分析');
      setDesc('流变特性，液位反馈，及泵机瞬时负荷打包上传。多维监控看板启动全局渲染状态监控。');
      setPayload([...payloadLogs, '[信道传输] 超滤物理断面高速以双向光纤注入中心控制柜。', '[事件汇聚] A模块堵积系数 0.82 已建卡记录。']);
      break;
    case 3:
      setTitle('【步骤3/8】监管总管启动全拓扑联合诊断');
      setDesc('总管智能体整合工艺链路，发觉由于前期大颗粒穿透，引起超滤微通道局部堵塞。排除设备损坏后生成反洗/CEB 建议。');
      aStatuses.supervisor = 'warning';
      aLogs.supervisor = [
        { id: `mast_${stamp}`, time: stamp, message: '分析结论：非泵机故障。应通过临时逆流脉冲反洗清理超滤A膜。', type: 'warning' },
        ...aLogs.supervisor
      ];
      setPayload([...payloadLogs, '[主管大脑] 进行工况拟合，证实为高杂质负荷吸附。生成反洗/CEB 处置建议，等待人工确认。']);
      break;
    case 4:
      setTitle('【步骤4/8】协调反洗/CEB 建议与过流复核');
      setDesc('总管建议复核超滤A通道运行状态，并评估B、C超滤常态组承载能力，确保全厂产水量维持 3000 m3/d。');
      aStatuses.supervisor = 'processing';
      aStatuses.uf = 'processing';
      t.outletFlow = 3000;
      aLogs.uf = [
        { id: `uf_${stamp}`, time: stamp, message: '建议复核A滤柱压差，并评估B/C超滤组承载状态。', type: 'info' },
        ...aLogs.uf
      ];
      setPayload([...payloadLogs, '[工艺建议] 如需切换阀组或反洗/CEB，必须由人工确认后执行。']);
      break;
    case 5:
      setTitle('【步骤5/8】反洗/CEB 建议参数计算');
      setDesc('超滤智能体生成反洗/CEB 建议参数，结合 TMP 450 kPa 临时触发参考值，提示人工复核后执行。');
      t.energyConsumption = 0.32;
      aLogs.uf = [
        { id: `uf_${stamp}`, time: stamp, message: '方案生成：建议复核反洗/CEB 条件，TMP 450 kPa 作为临时参考触发值。', type: 'info' },
        ...aLogs.uf
      ];
      setPayload([...payloadLogs, '[优化推导] 建立膜孔附着趋势，输出反洗/CEB 参数建议。']);
      break;
    case 6:
      setTitle('【步骤6/8】等待人工确认 UF 建议');
      setDesc('AI 生成 UF 反洗/CEB 建议单，等待人工确认后再由现场执行。');
      setPayload([...payloadLogs, '[人工确认] UF 反洗/CEB 建议已生成，等待现场确认。']);
      break;
    case 7:
      setTitle('【步骤7/8】人工确认后反洗效果回写');
      setDesc('现场确认反洗后，系统回写 TMP 下降、产水浊度恢复和反洗恢复率。');
      t.ufPressure = 180;
      aLogs.uf = [
        { id: `uf_${stamp}`, time: stamp, message: '效果回写：现场确认处置后，TMP 开始下降，UF 产水浊度回落。', type: 'success' },
        ...aLogs.uf
      ];
      setPayload([...payloadLogs, '[效果回写] 记录人工确认后的反洗/CEB 效果与 TMP 恢复趋势。']);
      break;
    case 8:
      setTitle('【步骤8/8】阻力测定健康归零，系统产水无感恢复');
      setDesc('超滤A柱透水压差重返原点 (82 kPa)。产水通量完全顺滑复原。多智能体联控闭环保障完毕。');
      t.ufPressure = 82;
      t.outletFlow = 3000;
      t.healthScore = 98;
      aStatuses.supervisor = 'monitoring';
      aStatuses.uf = 'monitoring';
      aLogs.supervisor = [
        { id: `mast_${stamp}`, time: stamp, message: '超滤阻力异常故障修复，总管智能体切换全厂为低碳巡航模式。', type: 'success' },
        ...aLogs.supervisor
      ];
      aLogs.uf = [
        { id: `uf_${stamp}`, time: stamp, message: '跨膜压差回落至 82 kPa，UF 产水浊度恢复至 <1 NTU。', type: 'success' },
        ...aLogs.uf
      ];
      setPayload([...payloadLogs, '[监控归档] TMP 回落至 82 kPa，UF 产水浊度恢复至 PPT 目标 <1 NTU。']);
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
      setTitle('【步骤1/8】膜组件衰减：产水通量滑落');
      setDesc('右侧高精膜区一级 RO 产水 TDS 升至 360 mg/L，超过 PPT 典型范围 100-300 mg/L。系统能耗上升，膜组件出现浓化失衡迹象。');
      t.roTds = 360;
      t.healthScore = 78;
      t.energyConsumption = 0.28;
      aStatuses.ro = 'warning';
      aLogs.ro = [
        { id: `ro_${stamp}`, time: stamp, message: '能效警告：RO 产水 TDS 升至 360 mg/L，需评估结垢/污染风险。', type: 'warning' },
        ...aLogs.ro
      ];
      setPayload(['[工艺警报] RO 过滤区域产生有机沉淀物极化，产水通量滑落超25%。', '[反渗透智能体] 捕捉产水通道能效转换指数下滑。']);
      break;
    case 2:
      setTitle('【步骤2/8】感知探针工艺谱分析并上送中心');
      setDesc('膜丝表面浓差极化数据、实时透盐率、能耗指数封装广播。');
      setPayload([...payloadLogs, '[总线数据] 终端流阻衰减、实时温度、PH耦合信号上送。']);
      break;
    case 3:
      setTitle('【步骤3/8】监管总控制定自校正能效方案');
      setDesc('监管总管通过分析，判断暂不建议整机停开机，优先形成人工复核的错流流速与膜保护建议。');
      aStatuses.supervisor = 'warning';
      aLogs.supervisor = [
        { id: `mast_${stamp}`, time: stamp, message: '诊断广播：终端极化过载。建议复核错流流速、段间压差与 CIP 条件。', type: 'warning' },
        ...aLogs.supervisor
      ];
      setPayload([...payloadLogs, '[架构推演] 为避免深度堵塞，生成膜面错流冲刷与 CIP 条件复核建议。']);
      break;
    case 4:
      setTitle('【步骤4/8】协同膜保护建议生成');
      setDesc('生成出水压力、错流流速与前置 UF 保护建议；涉及调泵、阀门或 CIP 的动作必须人工确认。');
      aStatuses.supervisor = 'processing';
      aStatuses.ro = 'processing';
      aLogs.supervisor = [
        { id: `mast_${stamp}`, time: stamp, message: '协同建议：复核 UF 出水状态，保护一级 RO 膜组件进水条件。', type: 'info' },
        ...aLogs.supervisor
      ];
      aLogs.ro = [
        { id: `ro_${stamp}`, time: stamp, message: '接收膜保护建议，等待人工确认错流冲刷或 CIP 条件。', type: 'info' },
        ...aLogs.ro
      ];
      setPayload([...payloadLogs, '[建议生成] 一级 RO 膜保护建议已形成，等待人工确认。']);
      break;
    case 5:
      setTitle('【步骤5/8】两相错流剪切清洗曲线推算');
      setDesc('反渗透智能体计算错流冲刷建议，结合一级 RO 进水压力 1.0-1.5 MPa 和回收率 75% 进行人工复核。');
      aLogs.ro = [
        { id: `ro_${stamp}`, time: stamp, message: '方案生成：建议复核错流冲刷、阻垢剂 3-5 ppm 与 CIP 条件。', type: 'info' },
        ...aLogs.ro
      ];
      setPayload([...payloadLogs, '[模型寻优] 基于膜壁阻力趋势，输出错流冲刷与 CIP 复核建议。']);
      break;
    case 6:
      setTitle('【步骤6/8】等待人工确认膜保护建议');
      setDesc('AI 已完成 RO 膜保护建议，涉及调泵、冲洗或 CIP 的动作必须人工确认。');
      setPayload([...payloadLogs, '[人工确认] RO 膜保护建议已提交，等待现场确认。']);
      break;
    case 7:
      setTitle('【步骤7/8】人工确认后 RO 效果回写');
      setDesc('现场确认处置后，系统回写产水 TDS、段间压差和脱盐率恢复趋势。');
      t.roTds = 240;
      aLogs.ro = [
        { id: `ro_${stamp}`, time: stamp, message: '效果回写：现场确认处置后，RO 产水 TDS 开始回落。', type: 'success' },
        ...aLogs.ro
      ];
      setPayload([...payloadLogs, '[效果回写] 记录人工确认后的 TDS、段间压差和脱盐率恢复趋势。']);
      break;
    case 8:
      setTitle('【步骤8/8】RO 产水质量恢复，TDS 回归');
      setDesc('最终 RO 产水 TDS 回落至 180 mg/L，单顿出水综合能耗重设为 0.18 kWh，警报全面解除。');
      t.roTds = 180;
      t.energyConsumption = 0.18;
      t.healthScore = 98;
      aStatuses.supervisor = 'monitoring';
      aStatuses.ro = 'monitoring';
      aLogs.supervisor = [
        { id: `mast_${stamp}`, time: stamp, message: '膜保护处置建议闭环完成。全厂产水维持 3000 m3/d。', type: 'success' },
        ...aLogs.supervisor
      ];
      aLogs.ro = [
        { id: `ro_${stamp}`, time: stamp, message: 'RO 产水 TDS 回落至 180 mg/L，处于 PPT 100-300 mg/L 范围。', type: 'success' },
        ...aLogs.ro
      ];
      setPayload([...payloadLogs, '[闭环归档] 本轮 RO 膜保护建议已归档，CIP 与调泵动作均以人工确认为前提。']);
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
      setTitle('[步骤1/8] 泵组过载：主泵电流与温升越限');
      setDesc('主泵电流快速升至 46A，温度达到 78degC，泵组智能体判定存在持续过载风险。');
      t.pumpCurrent = 46;
      t.pumpTemperature = 78;
      t.pumpStatus = 'overload';
      t.healthScore = 82;
      aStatuses.pump = 'warning';
      aLogs.pump = [
        { id: `pump_${stamp}`, time: stamp, message: '警报：主泵电流升至 46A，温升曲线超过安全运行阈值。', type: 'warning' },
        ...aLogs.pump
      ];
      setPayload(['[系统警报] 泵组负载异常触发，水力输送链路进入保护评估。', '[泵组智能体] 捕获电流、转速、温升三路异常特征。']);
      break;
    case 2:
      setTitle('[步骤2/8] 运行断面数据上送总控');
      setDesc('泵组智能体打包主泵负载、备用泵状态与出水流量波动，提交总控智能体进行联动诊断。');
      aLogs.pump = [
        { id: `pump_${stamp}`, time: stamp, message: '已上送泵组负载快照：主泵电流、轴温、转速与备用泵可用状态。', type: 'info' },
        ...aLogs.pump
      ];
      setPayload([...payloadLogs, '[通信链路] 泵组运行断面已进入总控诊断队列。']);
      break;
    case 3:
      setTitle('[步骤3/8] 总控识别非工艺水质异常');
      setDesc('总控智能体排除水质突变，判断故障主要来自输送设备负载偏高，生成降载和备用泵接管建议。');
      aStatuses.supervisor = 'warning';
      aLogs.supervisor = [
        { id: `mast_${stamp}`, time: stamp, message: '诊断结论：泵组过载为主因，建议人工确认主泵降速与备用泵分担策略。', type: 'warning' },
        ...aLogs.supervisor
      ];
      setPayload([...payloadLogs, '[总控智能体] 完成归因：非水质异常，定位为泵组负载风险。']);
      break;
    case 4:
      setTitle('[步骤4/8] 生成泵组降载与备用切换建议');
      setDesc('总控生成协同建议：复核主泵负载、备用泵状态与出水规模，人工确认后再执行降载或切换。');
      aStatuses.supervisor = 'processing';
      aStatuses.pump = 'processing';
      aLogs.pump = [
        { id: `pump_${stamp}`, time: stamp, message: '接收泵组降载建议：主泵降速 12%，备用泵分担需人工确认。', type: 'info' },
        ...aLogs.pump
      ];
      setPayload([...payloadLogs, '[建议中心] 泵组降载策略已生成，等待人工确认。']);
      break;
    case 5:
      setTitle('[步骤5/8] 泵组水力平衡方案生成');
      setDesc('泵组智能体计算变频降载曲线，生成主泵与备用泵流量分配比例建议，避免瞬时水锤。');
      t.pumpSpeed = 1360;
      aLogs.pump = [
        { id: `pump_${stamp}`, time: stamp, message: '方案生成：建议主泵转速降至 1360rpm，备用泵补偿 18% 输送负载。', type: 'info' },
        ...aLogs.pump
      ];
      setPayload([...payloadLogs, '[泵组智能体] 输出变频降载与备用泵补偿建议曲线。']);
      break;
    case 6:
      setTitle('[步骤6/8] 等待人工确认泵组建议');
      setDesc('系统完成风险说明，泵组降载和备用泵接管建议等待人工确认。');
      t.energyConsumption = 0.24;
      setPayload([...payloadLogs, '[人工确认] 泵组降载建议已生成，等待现场确认或驳回。']);
      break;
    case 7:
      setTitle('[步骤7/8] 人工确认后泵组效果回写');
      setDesc('现场确认处置后，系统回写主泵电流、备用泵分担和温升曲线变化。');
      t.pumpCurrent = 32;
      t.pumpTemperature = 62;
      t.outletFlow = 3000;
      aLogs.pump = [
        { id: `pump_${stamp}`, time: stamp, message: '效果回写：备用泵分担确认后，主泵电流回落至 32A。', type: 'success' },
        ...aLogs.pump
      ];
      setPayload([...payloadLogs, '[效果回写] 泵组降载处置已记录，产水量维持 3000 m3/d。']);
      break;
    case 8:
      setTitle('[步骤8/8] 泵组恢复稳定巡检');
      setDesc('泵组电流、温度与出水流量恢复到安全区间，多智能体关闭过载处置流程。');
      t.pumpSpeed = 1480;
      t.pumpCurrent = 28;
      t.pumpTemperature = 55;
      t.pumpStatus = 'normal';
      t.outletFlow = 3000;
      t.healthScore = 98;
      t.energyConsumption = 0.22;
      aStatuses.supervisor = 'monitoring';
      aStatuses.pump = 'monitoring';
      aLogs.supervisor = [
        { id: `mast_${stamp}`, time: stamp, message: '泵组过载处置完成，全厂输送链路恢复低风险巡检。', type: 'success' },
        ...aLogs.supervisor
      ];
      aLogs.pump = [
        { id: `pump_${stamp}`, time: stamp, message: '泵组状态恢复：电流 28A，温度 55degC，运行状态正常。', type: 'success' },
        ...aLogs.pump
      ];
      setPayload([...payloadLogs, '[闭环完成] 泵组过载风险解除，系统恢复额定工况。']);
      break;
  }
}
