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

运行时默认不再实时解析 Wiki，也不再只依赖 Qdrant。Wiki 处理发生在人工同步阶段，查询走已同步的索引。`keyword` 模式表示 Elasticsearch BM25，不再保留旧 Wiki keyword fallback 开关。

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


| 配置                      | 默认/示例                   | 说明                                                       |
| ------------------------- | --------------------------- | ---------------------------------------------------------- |
| `RAG_ENABLED`             | `true`                      | 是否启用 RAG                                               |
| `RAG_RETRIEVAL_MODE`      | `hybrid`                    | 正式路径为`hybrid`；调试可用 `keyword`(ES BM25) / `vector` |
| `RAG_WIKIDB_ROOT`         | `/app/wikidb`               | Wiki 根目录                                                |
| `RAG_DATABASE_URL`        | `postgresql://...`          | RAG state PostgreSQL                                       |
| `ELASTICSEARCH_URL`       | `http://elasticsearch:9200` | ES 地址                                                    |
| `RAG_ELASTICSEARCH_INDEX` | `water_plant_rag_chunks`    | ES index                                                   |
| `QDRANT_URL`              | `http://qdrant:6333`        | Qdrant 地址                                                |
| `RAG_QDRANT_COLLECTION`   | `water_plant_rag_chunks`    | Qdrant collection                                          |
| `RAG_HYBRID_CANDIDATE_K`  | `80`                        | 两路候选数                                                 |
| `RAG_FUSION_KEEP`         | `50`                        | RRF 后候选数                                               |
| `RAG_FINAL_TOP_K`         | `10`                        | 默认最终返回数量                                           |
| `RAG_DOC_CHUNK_LIMIT`     | `3`                         | 单文档 chunk 上限                                          |
| `RAG_RETRIEVAL_LOG_PATH`  | 空或 JSONL 路径             | 检索日志输出                                               |
| `RAG_RERANK_ENABLED`      | `false`                     | 是否启用 reranker                                          |

## ACL 和检索过滤

当前 ACL 是 RAG 知识可见性过滤，不是完整的用户登录鉴权系统。它只控制某条知识 chunk 是否允许进入检索候选集；用户身份认证、组织权限服务和接口级鉴权仍需要由上层业务补齐。

### 写入索引时

`scripts/sync-rag-indexes.py` 从 Wiki Markdown 生成 `DocumentManifest` / `ChunkManifest` 时，会给每个 chunk 写入 ACL 和范围元数据：


| 字段             | 来源                                    | 说明                   |
| ---------------- | --------------------------------------- | ---------------------- |
| `visibility`     | `RAG_DEFAULT_VISIBILITY`，默认 `public` | 公共知识或受限知识标记 |
| `acl.tenant`     | `RAG_DEFAULT_TENANT`                    | 租户/水厂范围          |
| `acl.roles`      | `RAG_DEFAULT_ROLES`                     | 可访问角色列表         |
| `agent_scope`    | chunk metadata                          | 适用 Agent             |
| `process_areas`  | chunk metadata                          | 工艺区域过滤           |
| `device_ids`     | chunk metadata                          | 设备范围过滤           |
| `incident_types` | chunk metadata                          | 异常类型过滤           |
| `knowledge_type` | chunk metadata                          | 知识类型过滤           |

这些字段会同时写入 Elasticsearch document 和 Qdrant point payload。Qdrant 会为 `doc_id`、`doc_version`、`visibility`、`acl.roles`、`acl.tenant`、`status` 创建 payload index。

### 检索时

检索请求使用 `RetrievalRequest` 表达过滤条件：

```text
query
tenant_id
roles
agent_id
process_areas
device_ids
incident_types
knowledge_types
```

ACL 策略是 OR 关系：

```text
visibility == public
OR acl.tenant == request.tenant_id
OR acl.roles 与 request.roles 有交集
```

如果请求没有 `tenant_id` 和 `roles`，则只能命中 `visibility == public` 的知识。

范围过滤是 AND 关系追加到同一次查询中：

```text
status == active
AND ACL filter
AND agent_scope / process_areas / device_ids / incident_types / knowledge_types 等可选过滤
```

### Filter 执行位置

Filter 不是检索出结果后再由 Python 二次筛选，而是在 ES / Qdrant 查询阶段下推：

- Elasticsearch：`multi_match` 负责 BM25 相关性打分，`bool.filter` 负责 `status`、ACL 和范围过滤。
- Qdrant：`vector` 负责语义相似度检索，`filter.must` / `filter.should` 负责 payload 字段过滤。

向量本身不理解 `roles` 或 `tenant`；这些字段保存在 Qdrant payload 中，由 Qdrant 的 payload filter 限制可搜索集合，再做向量相似度排序。

ES 是这样：

```
multi_match 查询
+ bool.filter:
  - status == active
  - ACL filter
  - agent_scope / process_areas / device_ids 等可选过滤
```

所以 ES 会在打分检索时只考虑满足 filter 的文档。

Qdrant 也是这样：

```
vector search body:
  vector: ...
  filter:
    must:
      - status == active
      - ACL payload filter
      - 其他 metadata filter
```

### 当前主链路限制

当前 `/api/ai/analyze` 主链路通过 `RagEvidenceTool` 构造检索请求时，尚未接入真实用户身份上下文，因此没有传入 `tenant_id` 和 `roles`。这意味着现阶段主链路主要检索 `public` 知识。后续接入登录态或组织权限服务时，需要把用户租户和角色传入 `RetrievalRequest`。

当前主链路也主要把 Agent 信息写入 query 文本，还没有把 `agent_id` 作为结构化过滤字段传入 `RetrievalRequest.agent_id`。如需严格按 Agent 范围隔离知识，需要同步补齐调用层传参和测试。

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


| 文件                           | 说明                                                                |
| ------------------------------ | ------------------------------------------------------------------- |
| `manifest.py`                  | Wiki 文档和 chunk manifest、稳定 ID、payload 和 ACL 默认值          |
| `state_store.py`               | PostgreSQL / SQLite RAG 状态库                                      |
| `elasticsearch_store.py`       | ES index、BM25 查询和一致性检查                                     |
| `qdrant_store.py`              | Qdrant collection、vector 查询和一致性检查                          |
| `retrievers/elasticsearch.py`  | ES retriever wrapper                                                |
| `retrievers/qdrant_vector.py`  | embedding + Qdrant vector retriever                                 |
| `retrievers/hybrid.py`         | ES + Qdrant RRF、去重、多样化、单路降级、状态化返回、日志、reranker |
| `reranker.py`                  | 可选 HTTP reranker                                                  |
| `retrieval_log.py`             | 结构化检索日志                                                      |
| `service.py`                   | 后端运行时调用 RAG 的稳定门面                                       |
| `schemas.py`                   | 请求、结果和知识块结构                                              |
| `cleaning.py` / `ingestion.py` | Word / approved JSON 的旧人工审核预处理链路                         |

## 新旧脚本分层

当前主链路脚本：


| 脚本                           | 状态         | 用途                                              |
| ------------------------------ | ------------ | ------------------------------------------------- |
| `scripts/sync-rag-indexes.py`  | 当前主脚本   | Wiki manifest 增量同步到 PostgreSQL / ES / Qdrant |
| `scripts/search-rag-hybrid.py` | 当前调试入口 | 对比 keyword / vector / hybrid                    |
| `scripts/evaluate-rag.py`      | 当前评测入口 | 跑 JSONL 评测集并输出指标                         |

Word / approved 辅助脚本：


| 脚本                              | 状态 | 用途                                                                  |
| --------------------------------- | ---- | --------------------------------------------------------------------- |
| `scripts/publish-rag-approved.py` | 辅助 | approved JSON 限量发布到 Qdrant，适合开发验证，不是当前正式 Wiki 链路 |
| `scripts/embed-rag-approved.py`   | 辅助 | approved JSON embedding 预览，不写索引                                |
| `scripts/ingest-rag-approved.py`  | 辅助 | approved JSON dry-run 校验                                            |
| `scripts/clean-rag-word.py`       | 辅助 | Word 文档清洗成 pending review                                        |
| `scripts/review-rag-pending.py`   | 辅助 | pending review 转 approved / rejected                                 |

已移除的旧入口：


| 脚本/模块                                | 原用途                                                | 替代方式                                                                 |
| ---------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------ |
| `scripts/dry-run-rag-wiki.py`            | 旧 Wiki approved payload 预检                         | `scripts/sync-rag-indexes.py --dry-run --json`                           |
| `scripts/publish-rag-wiki.py`            | 旧 Wiki -> Qdrant 发布和`.qdrant_published.json` 台账 | `scripts/sync-rag-indexes.py --json`                                     |
| `scripts/search-rag.py`                  | 旧 Qdrant vector-only 检索调试                        | `scripts/search-rag-hybrid.py --mode vector`                             |
| `scripts/test-rag-live.py`               | 旧 embedding + Qdrant live smoke                      | `sync-rag-indexes.py --check`、`search-rag-hybrid.py`、`evaluate-rag.py` |
| `backend/app/rag/wiki_publish_ledger.py` | 旧 Qdrant 发布台账                                    | PostgreSQL state store                                                   |

## 检索模式选择


| 问题类型                     | 推荐模式             | 说明                         |
| ---------------------------- | -------------------- | ---------------------------- |
| 默认问答                     | `hybrid`             | 综合召回和排序最稳           |
| 明确术语、文件名、目录导航   | `keyword` / `hybrid` | ES BM25 对精确词更直接       |
| 模糊描述、同义表达、异常解释 | `vector` / `hybrid`  | Qdrant 语义召回更稳          |
| 设备号、参数名、标准条款号   | `keyword`            | 精确字符串优先               |
| 安全边界和现场操作建议       | `hybrid` + 安全规则  | RAG 只给证据，不替代人工确认 |

## 运行时状态

`RagService.retrieve()` 返回状态化结果，不再用空列表混淆不同场景：


| 状态                   | 含义                                                                          |
| ---------------------- | ----------------------------------------------------------------------------- |
| `disabled`             | RAG 未启用                                                                    |
| `hybrid`               | ES BM25 与 Qdrant Vector 双路成功并完成 RRF                                   |
| `degraded_bm25_only`   | Qdrant/embedding 失败，降级为 ES BM25                                         |
| `degraded_vector_only` | ES 失败，降级为 Qdrant Vector                                                 |
| `no_results`           | 检索链路可用但没有命中                                                        |
| `failed`               | ES 与 Qdrant 两路均失败；`/api/ai/analyze` 将终止分析，不继续生成具体处置建议 |

## 评测结论

当前评测目录：

```text
backend/data/rag_eval/wiki_20260723_es_qdrant_rrf/
```

12 条问题覆盖定义、关系、异常诊断、工艺边界、安全边界、目录导航、维护入口、设备诊断、标准边界和驾驶舱分析口径。

本轮结果：


| 模式    | Recall@10 |    MRR | duplicate rate | doc concentration |  平均延迟 |
| ------- | --------: | -----: | -------------: | ----------------: | --------: |
| keyword |    0.8194 | 0.9167 |         0.0333 |            0.5250 |  31.98 ms |
| vector  |    0.8403 | 0.9167 |         0.0833 |            0.4833 | 314.43 ms |
| hybrid  |    0.9792 | 1.0000 |         0.0000 |            0.2917 | 383.03 ms |

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
