# Tools

智能体可调用的外部工具封装放在这里，例如查询实时数据、查询设备状态、查询历史处置日志。

工具层应复用 `repositories/`、`services/`、`clients/` 中已有能力，不直接读取前端 mock，也不直接把外部接口响应透传给前端或智能体。

当前目录提供工具基础壳：

- `base.py`：工具接口。
- `registry.py`：工具注册表。
- `permissions.py`：按 Agent 权限白名单判断工具可用性。
- `runtime_data_tools.py`、`history_tools.py`、`rag_tools.py`：运行数据、历史记录和 RAG 证据工具边界。

工具只负责取数和外部能力封装，不承载领域专业判断。
