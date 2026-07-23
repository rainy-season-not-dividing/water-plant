# RAG 知识底座

本目录承载智能水厂多 Agent 的知识检索底座。当前正式链路已经从早期“Wiki + Qdrant 向量检索”升级为：

```text
wikidb/wiki/*.md
  -> DocumentManifest / ChunkManifest
  -> PostgreSQL rag_documents / rag_chunks
  -> Elasticsearch water_plant_rag_chunks
  -> Qdrant water_plant_rag_chunks

query
  -> ES BM25
  -> Qdrant vector
  -> RRF hybrid fusion
  -> content_hash 去重 / 单文档 chunk 限制
  -> optional reranker
  -> Top evidence
```

运行时默认不再实时解析 Wiki，也不再只依赖 Qdrant。Wiki 处理发生在人工同步阶段，查询走已同步的索引。

## 当前状态

- 默认检索模式：`hybrid`
- 状态库：PostgreSQL，SQLite 只作为 fallback / 测试能力
- Keyword：Elasticsearch BM25
- Vector：Qdrant
- 融合：RRF
- Reranker：HTTP reranker 边界已预留，默认关闭
- ACL：支持 public / tenant / roles 基线过滤，尚未接入完整组织权限服务
- 质量评测：见 `backend/data/rag_eval/wiki_20260723_es_qdrant_rrf/`

## 核心配置

| 配置 | 默认/示例 | 说明 |
| --- | --- | --- |
| `RAG_ENABLED` | `true` | 是否启用 RAG |
| `RAG_RETRIEVAL_MODE` | `hybrid` | `keyword` / `vector` / `hybrid` |
| `RAG_WIKIDB_ROOT` | `/app/wikidb` | Wiki 根目录 |
| `RAG_DATABASE_URL` | `postgresql://...` | RAG state PostgreSQL |
| `ELASTICSEARCH_URL` | `http://elasticsearch:9200` | ES 地址 |
| `RAG_ELASTICSEARCH_INDEX` | `water_plant_rag_chunks` | ES index |
| `QDRANT_URL` | `http://qdrant:6333` | Qdrant 地址 |
| `RAG_QDRANT_COLLECTION` | `water_plant_rag_chunks` | Qdrant collection |
| `RAG_HYBRID_CANDIDATE_K` | `80` | 两路候选数 |
| `RAG_FUSION_KEEP` | `50` | RRF 后候选数 |
| `RAG_FINAL_TOP_K` | `10` | 默认最终返回数量 |
| `RAG_DOC_CHUNK_LIMIT` | `3` | 单文档 chunk 上限 |
| `RAG_RETRIEVAL_LOG_PATH` | 空或 JSONL 路径 | 检索日志输出 |
| `RAG_RERANK_ENABLED` | `false` | 是否启用 reranker |

## 常用命令

在仓库根目录执行。

启动本地索引服务：

```powershell
docker compose up -d postgres elasticsearch qdrant
```

同步 Wiki 到 PostgreSQL / ES / Qdrant：

```powershell
python scripts/sync-rag-indexes.py --json
```

只做一致性检查：

```powershell
python scripts/sync-rag-indexes.py --check --json
```

只预览同步计划，不写入：

```powershell
python scripts/sync-rag-indexes.py --dry-run --json
```

调试检索：

```powershell
python scripts/search-rag-hybrid.py "浊度升高可能是什么原因？" --mode hybrid --top-k 5 --json
```

评测：

```powershell
python scripts/evaluate-rag.py backend/data/rag_eval/wiki_20260723_es_qdrant_rrf/eval-cases.jsonl --mode hybrid --top-k 10 --json
```

## 代码职责

| 文件 | 说明 |
| --- | --- |
| `manifest.py` | Wiki 文档和 chunk manifest、稳定 ID、payload 和 ACL 默认值 |
| `state_store.py` | PostgreSQL / SQLite RAG 状态库 |
| `elasticsearch_store.py` | ES index、BM25 查询和一致性检查 |
| `qdrant_store.py` | Qdrant collection、vector 查询和一致性检查 |
| `retrievers/elasticsearch.py` | ES retriever wrapper |
| `retrievers/vector.py` | Qdrant vector retriever wrapper |
| `retrievers/hybrid.py` | ES + Qdrant RRF、去重、多样化、fallback、日志、reranker |
| `reranker.py` | 可选 HTTP reranker |
| `retrieval_log.py` | 结构化检索日志 |
| `service.py` | 后端运行时调用 RAG 的稳定门面 |
| `schemas.py` | 请求、结果和知识块结构 |
| `cleaning.py` / `ingestion.py` | Word / approved JSON 的旧人工审核预处理链路 |

## 新旧脚本分层

当前主链路脚本：

| 脚本 | 状态 | 用途 |
| --- | --- | --- |
| `scripts/sync-rag-indexes.py` | 当前主脚本 | Wiki manifest 增量同步到 PostgreSQL / ES / Qdrant |
| `scripts/search-rag-hybrid.py` | 当前调试入口 | 对比 keyword / vector / hybrid |
| `scripts/evaluate-rag.py` | 当前评测入口 | 跑 JSONL 评测集并输出指标 |

辅助/兼容脚本：

| 脚本 | 状态 | 用途 |
| --- | --- | --- |
| `scripts/search-rag.py` | 兼容 | 只查 Qdrant vector，适合排查向量库 |
| `scripts/test-rag-live.py` | 兼容 | 旧 live smoke，主要检查 embedding + Qdrant |
| `scripts/dry-run-rag-wiki.py` | 可替代 | 旧 Wiki approved payload 预检；多数场景可用 `sync-rag-indexes.py --dry-run` 替代 |
| `scripts/publish-rag-wiki.py` | 可替代 | 旧 Wiki -> Qdrant 发布脚本；新链路应使用 `sync-rag-indexes.py` |
| `scripts/publish-rag-approved.py` | 辅助 | approved JSON 限量发布到 Qdrant，适合开发验证，不是当前正式 Wiki 链路 |
| `scripts/embed-rag-approved.py` | 辅助 | approved JSON embedding 预览，不写索引 |
| `scripts/ingest-rag-approved.py` | 辅助 | approved JSON dry-run 校验 |
| `scripts/clean-rag-word.py` | 辅助 | Word 文档清洗成 pending review |
| `scripts/review-rag-pending.py` | 辅助 | pending review 转 approved / rejected |

删除这些兼容脚本前，需要先确认没有外部流程、历史数据修复或团队成员仍在使用。

## 检索模式选择

| 问题类型 | 推荐模式 | 说明 |
| --- | --- | --- |
| 默认问答 | `hybrid` | 综合召回和排序最稳 |
| 明确术语、文件名、目录导航 | `keyword` / `hybrid` | ES BM25 对精确词更直接 |
| 模糊描述、同义表达、异常解释 | `vector` / `hybrid` | Qdrant 语义召回更稳 |
| 设备号、参数名、标准条款号 | `keyword` | 精确字符串优先 |
| 安全边界和现场操作建议 | `hybrid` + 安全规则 | RAG 只给证据，不替代人工确认 |

## 评测结论

当前评测目录：

```text
backend/data/rag_eval/wiki_20260723_es_qdrant_rrf/
```

12 条问题覆盖定义、关系、异常诊断、工艺边界、安全边界、目录导航、维护入口、设备诊断、标准边界和驾驶舱分析口径。

本轮结果：

| 模式 | Recall@10 | MRR | duplicate rate | doc concentration | 平均延迟 |
| --- | ---: | ---: | ---: | ---: | ---: |
| keyword | 0.8194 | 0.9167 | 0.0333 | 0.5250 | 31.98 ms |
| vector | 0.8403 | 0.9167 | 0.0833 | 0.4833 | 314.43 ms |
| hybrid | 0.9792 | 1.0000 | 0.0000 | 0.2917 | 383.03 ms |

结论：默认 `hybrid` 合理，但评测集还需要扩展，`evaluate-rag.py` 的 doc-level nDCG 口径也需要后续修正。

## 部署注意

云服务器运行时后端镜像目前只包含 `backend/app`，不包含 `scripts/`。因此首次部署或 Wiki 更新后，需要从源码工作区或运维机器运行：

```powershell
python scripts/sync-rag-indexes.py --json
python scripts/sync-rag-indexes.py --check --json
```

如果脚本不在服务器上，或者运行脚本的机器访问不到 `127.0.0.1:5432/9200/6333`，RAG 索引不会自动完成。后续确实需要容器内同步时，再补独立同步容器或运维镜像。

## 测试

```powershell
cd backend
python -m unittest discover -s tests -p "test_*.py"
```
