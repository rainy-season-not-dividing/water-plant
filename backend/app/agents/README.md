# Agents

智能体定义、角色配置和运行入口放在这里。

当前阶段保留现有 `/api/ai/analyze` 对外流程不变，但内部已经通过本目录建立 Agent Runtime 边界。

目录约定：

- `supervisor/`：监管总管智能体，负责调度、拆解、汇总和人工确认建议单组织。
- `dosing/`、`uf/`、`ro/`、`pump/`：专项智能体目录，分别保留自己的 prompt、policy、schema、context_policy 和私有 skills 边界。
- `registry.py`：Agent 注册表和旧 phase 到 Agent 的兼容映射。
- `permissions.py`：Agent 工具权限白名单。
- `schemas.py`：Agent Runtime 的基础类型。

兼容要求：

- 旧 `supervisor / agent / sandbox` phase 的 prompt 内容、LLM 参数和 SSE 返回格式保持不变。
- 专业判断逻辑不在顶层公共 `skills/` 中扩写，应逐步归入对应 Agent 私有 `skills/`。
