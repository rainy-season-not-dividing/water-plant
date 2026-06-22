# Agents

智能体定义、角色配置和运行入口放在这里。

当前阶段保留现有 `/api/ai/analyze` 流程不变。后续如果引入真正的监管智能体、专项智能体或多智能体协作，应优先在本目录建立 agent 边界，再调用 `services/llm.py`、`skills/` 和 `tools/`。
