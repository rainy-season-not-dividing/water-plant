# Backend

后端是 FastAPI 服务，负责数据接口、AI 分析、Agent 运行边界、RAG 检索和后台配置持久化。

## 启动

```powershell
cd backend
pip install -r requirements.txt
python run.py
```

启动后访问：

```text
http://localhost:8000/docs
```

## 环境变量

从模板复制：

```powershell
copy .env.example .env
```

`backend/.env` 应尽量保留 `.env.example` 中的全部字段；暂不启用的能力也用空值或默认开关显式写出，避免运行时行为只依赖代码默认值。

至少需要按场景配置：

- LLM：`LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`
- RAG embedding：`RAG_EMBEDDING_*`
- RAG stores：`QDRANT_URL`、`ELASTICSEARCH_URL`、`RAG_DATABASE_URL`
- Wiki 根目录：`RAG_WIKIDB_ROOT`

真实密钥、客户资料、生产地址和硬件连接参数不得提交到仓库。

## 主要 API

```text
POST /api/ai/analyze        三阶段 AI 分析流
POST /api/ai/cockpit/chat   驾驶舱 AI 问答
GET/PUT /api/admin/agents   Agent 配置
GET/POST/PUT/DELETE /api/admin/plan-actions
POST /api/agent/runs        Agent runtime 兼容入口，目前仍是预留/兼容链路
```

当前系统是 AI 副驾驶：只生成分析、证据和建议，不自动执行 PLC、泵阀、反洗、CEB、CIP、加药等现场控制动作。

## 目录边界

```text
app/routers/       HTTP / SSE API 边界
app/services/      LLM、驾驶舱问答等通用服务
app/agents/        Agent 角色、权限和运行边界
app/workflows/     分析链路和流程编排
app/tools/         Agent 可调用工具封装
app/rag/           RAG 知识底座、检索和同步相关运行代码
app/repositories/  文件持久化和配置读写
app/clients/       外部系统客户端
app/adapters/      外部数据到内部契约的适配
```

推荐调用方向：

```text
router
  -> workflow / service
    -> agents
      -> tools / rag / repositories / clients
```

## RAG

当前 RAG 正式链路是：

```text
Wiki Markdown
  -> ChunkManifest
  -> PostgreSQL state
  -> Elasticsearch BM25
  -> Qdrant vector
  -> hybrid RRF retrieval
```

常用命令在仓库根目录执行：

```powershell
python scripts/sync-rag-indexes.py --json
python scripts/sync-rag-indexes.py --check --json
python scripts/search-rag-hybrid.py "浊度升高可能是什么原因？" --mode hybrid --top-k 5 --json
```

详细说明见 `app/rag/README.md`。

## 持久化

当前后台配置和运行日志主要使用文件持久化：

```text
backend/data/admin_config.json
backend/data/scenario_logs.jsonl
backend/data/audit_logs.jsonl
```

RAG 索引状态使用 PostgreSQL；Qdrant 和 Elasticsearch 只作为检索面。

完整说明见 `docs/数据持久化说明.md`。

## 测试

```powershell
cd backend
python -m unittest discover -s tests -p "test_*.py"
```
