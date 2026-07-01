# Backend

FastAPI 后端服务，提供水厂数据接口和 AI Agent 对话能力。

## 启动

```bash
cd backend
pip install -r requirements.txt   # 首次安装依赖
python run.py                     # 启动开发服务器 (localhost:8000, 热重载)
```

## 环境变量

复制 `.env.example` 为 `.env`，填入所需配置（如 LLM API Key）。

## API 文档

启动后访问 http://localhost:8000/docs 查看 Swagger 文档。

## AI Agent 与多 Agent 演进架构

当前后端已经具备 AI 分析能力，但尚未形成完整的多 Agent runtime。现阶段真实运行链路主要是：

```text
POST /api/ai/analyze        # supervisor / agent / sandbox 三阶段流式分析
POST /api/ai/cockpit/chat   # 集团驾驶舱 AI 问答
GET/PUT /api/admin/agents   # 后台 Agent 配置
GET/POST/PUT/DELETE /api/admin/plan-actions
POST /api/agent/runs        # 兼容预留接口，目前仅返回 queued
```

当前内置业务 Agent 配置保存在 `backend/data/admin_config.json`，默认值来自 `backend/app/data/default_admin_config.py`：

```text
supervisor  监管总管智能体：风险汇总、冲突消解、人工确认单、闭环复盘
dosing      加药智能体：阻垢剂核查、UF 清洗药剂复核、加药泵偏差识别、药箱液位跟踪
uf          超滤智能体：TMP 趋势识别、反洗恢复评估、CEB/CED 条件复核、反渗透前置保护
ro          反渗透智能体：TDS 异常识别、段间压差分析、回收率复核、CIP 风险评估
pump        泵组智能体：负载识别、温升复核、备用泵分担、供水能力校核
```

需要注意：这些 Agent 目前主要是运行配置、前端展示和建议动作库的业务身份；Python 侧尚未为每个 Agent 建立独立 class 或正式执行器。

### 当前目录职责

```text
app/routers/
```

HTTP/SSE API 边界层。负责请求校验、响应包装和流式输出。后续不应承载复杂多 Agent 编排，只调用 service 或 workflow。

```text
app/services/
```

通用业务服务层。当前 `llm.py` 负责 LLM 流式调用，`cockpit_ai_service.py` 负责驾驶舱 AI 问答编排。后续应保留通用能力，避免继续膨胀成多 Agent 编排中心。

```text
app/agents/
```

多 Agent 角色边界预留目录。后续应放置 `SupervisorAgent`、`UfAgent`、`RoAgent`、`DosingAgent`、`PumpAgent` 等角色定义，负责声明自身输入、输出、可用 skills/tools、业务禁区和执行逻辑。

```text
app/workflows/
```

多 Agent 流程编排预留目录。后续应承接异常决策链、阶段流转、并行/串行 Agent 调度、结果汇总、冲突消解、沙箱校验和人工确认前的建议单生成。

```text
app/skills/
```

可复用专业能力模块。适合放稳定的领域判断、prompt 构造和结果结构化逻辑。当前已有：

```text
cockpit_history_skill.py   # 构造驾驶舱问答上下文，包含三页统计数据、历史异常记录和对话上下文
sandbox_validation.py      # 构造安全沙箱推演消息，检查权限边界、工艺顺序和人工确认要求
```

后续可继续拆分 UF 诊断、RO 膜风险、加药分域、泵组负载、建议单生成等 skill。

```text
app/tools/
```

Agent 可调用的工具封装预留目录。适合放实时遥测查询、设备状态查询、历史日志查询、后台配置查询、真实外部接口查询等。工具层应复用 `repositories/`、`services/`、`clients/`，不直接读取前端 mock，也不把外部接口响应原样透传给 Agent 或前端。

```text
app/repositories/
```

持久化边界。负责读写后台配置、场景日志和审计日志。Agent 需要配置或历史记录时，应通过 repository 或 tool 间接访问。

```text
app/clients/
```

外部系统客户端。负责请求真实数据接口、第三方平台或数据中台，不负责把外部字段解释成前端/Agent 契约。

```text
app/adapters/
```

字段转换层。负责把外部系统数据转换成本项目内部稳定契约，避免真实接口字段直接泄漏到前端或 Agent。

```text
app/prompts.py
```

当前集中存放 Supervisor、专项 Agent、Sandbox、驾驶舱 AI 的系统 prompt。短期可继续使用；当 Agent/skill 增多后，应逐步按 Agent 或 skill 拆分，避免单文件过大。

### 推荐的后续调用链

```text
router
  -> workflow
    -> agents
      -> skills
      -> tools
        -> repositories / services / clients
    -> sandbox validation
    -> repositories 写入运行事件
  -> router SSE/JSON 返回前端
```

示例决策链：

```text
异常触发
-> Supervisor 初判风险和关联专业域
-> 分派 UF/RO/加药/泵组 Agent
-> 各 Agent 调用 skill/tool 生成专业判断
-> Workflow 汇总并消解冲突
-> Sandbox 复核权限边界、工艺顺序和人工确认要求
-> 生成建议单
-> 等待人工确认
```

### 架构成熟度判断

当前结构方向是合理的：`routers/services/repositories/clients/adapters` 已经有清晰分层，`agents/skills/tools/workflows` 也预留了多 Agent 演进位置。

但多 Agent 架构还不完整，主要缺口是：

```text
1. agents/ 还没有正式 Agent 基类、角色实现或执行上下文。
2. workflows/ 还没有 run 状态机、阶段事件、并行/串行调度和恢复机制。
3. tools/ 还没有 tool registry、统一入参出参、超时和错误处理约定。
4. skills/ 还缺少结构化输出协议，当前更多是 prompt 构造能力。
5. /api/agent/runs 仍是占位接口，没有和 workflow/agent 执行器打通。
6. 当前 SSE 事件较简单，尚未覆盖 tool.called、plan.created、run.succeeded 等完整 Agent event。
```

因此，当前可以定义为“AI 分析链路可用，多 Agent 目录和边界已预留，正式多 Agent runtime 尚未落地”。

长期禁区：当前系统是 AI 副驾驶，只生成分析和建议，不自动执行 PLC、泵阀、反洗、CEB、CIP、加药等现场控制动作；这些动作必须人工确认。

## 持久化说明

当前后台配置与运行日志使用文件持久化：

```text
backend/data/admin_config.json
backend/data/scenario_logs.jsonl
backend/data/audit_logs.jsonl
```

读写逻辑位于：

```text
backend/app/repositories/admin_config_repository.py
backend/app/repositories/runtime_log_repository.py
```

完整说明见：

```text
docs/数据持久化说明.md
```
