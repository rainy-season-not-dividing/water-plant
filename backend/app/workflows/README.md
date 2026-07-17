# Workflows

决策链、多智能体编排和阶段流转放在这里。

当前继续兼容现有 `POST /api/ai/analyze`，内部由 `decision_chain.py` 承接旧 phase 分析链路。

目录约定：

- `decision_chain.py`：旧 `supervisor / agent / sandbox` phase 的兼容编排入口。
- `incident_analysis.py`：异常分析 workflow 的命名入口。
- `human_confirmation.py`：人工确认边界。
- `effect_writeback.py`：效果回写边界。
- `schemas.py`：WorkflowRun 等基础类型。

兼容要求：

- workflow 负责流程编排，不直接做 RO/UF/加药/泵组等专业判断。
- 旧前端 phase 推进、日志事件和 SSE token 流不应因内部重排而变化。
