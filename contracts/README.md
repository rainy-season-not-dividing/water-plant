# 契约目录

`contracts/` 用来存放前端、后端、Agent 事件和 3D 演示之间共享的数据契约。它不是业务代码目录，而是团队对“接口字段、事件结构、mock 数据形状”的共同约定入口。

## 文件说明

- `openapi.yaml`：HTTP API 草案，包括请求、响应和流式接口说明。
- `agent-events.schema.json`：Agent 运行时间线事件结构。
- `simulation-events.schema.json`：3D 仿真事件结构。
- `mock/`：与契约保持一致的 mock 数据样例。

## 使用规则

- 当前后端或 3D 行为依赖新字段时，先同步更新这里的契约。
- ID 保持稳定且语言中性，例如 `pump-001`，不要使用展示名称当 ID。
- mock 数据可以存在，但字段结构应尽量贴近契约。
- 本项目当前只通过仿真事件演示硬件行为，不表示已经接入真实硬件控制。

## RAG 检索状态

`/api/ai/analyze` 的正式 RAG 链路是 `Elasticsearch BM25 + Qdrant Vector + RRF`。SSE `error` 事件可能包含：

- `ragStatus`：取值为 `disabled`、`hybrid`、`degraded_bm25_only`、`degraded_vector_only`、`no_results`、`failed`。
- `failedSources`：失败的检索源，目前可能是 `bm25` 和/或 `vector`。
- `errorMessage`：面向人阅读的失败说明。

场景日志错误事件复用当前 active `scenarioId` 和已有事件类型：`supervisor_analysis`、`agent_analysis` 或 `sandbox_error`。错误 payload 包含 `status: "error"`、`ragStatus`、`failedSources`、`errorMessage` 和 `text`。
