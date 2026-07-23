# 20260723 ES + Qdrant + RRF 检索质量评测

## 评测目标

本轮评测用于验证当前 Wiki RAG 新链路：

```text
Wiki manifest -> PostgreSQL state -> Elasticsearch BM25 -> Qdrant vector -> RRF hybrid
```

评测重点不是验证代码单元逻辑，而是观察不同查询类型下 keyword、vector、hybrid 三种检索模式的命中质量、延迟、重复率和文档集中度。

## 评测输入

- 评测集：`backend/data/rag_eval/wiki_20260723_es_qdrant_rrf/eval-cases.jsonl`
- 问题数：12
- Top K：10
- 当前索引规模：108 documents / 510 chunks
- 检索模式：
  - `keyword`：Elasticsearch BM25
  - `vector`：Qdrant vector
  - `hybrid`：ES + Qdrant + RRF

问题覆盖方向：

| 类型 | 示例 |
| --- | --- |
| 定义类 | `BOD5是什么指标？` |
| 关系类 | `BC比和BOD5、COD有什么关系？` |
| 异常诊断 | `浊度升高可能是什么原因？`、`UF TMP升高应该先做什么？`、`RO产水电导率升高可能和哪些因素有关？` |
| 工艺边界 | `药耗异常要怎么区分UF和RO加药？` |
| 安全边界 | `AI副驾驶可以自动下发PLC吗？` |
| 目录导航 | `Wiki目录里有哪些主题？` |
| 维护入口 | `项目运行参数应该维护在哪里？` |
| 设备诊断 | `泵流量不足要结合哪些信号判断？` |
| 标准边界 | `GB 5749新旧版本差异需要注意什么？` |
| Agent 分析口径 | `驾驶舱统计分析要怎么区分当前事实和推测建议？` |

## 执行命令

```powershell
$env:PYTHONIOENCODING='utf-8'
python scripts/evaluate-rag.py backend/data/rag_eval/wiki_20260723_es_qdrant_rrf/eval-cases.jsonl --mode keyword --top-k 10 --output backend/data/rag_eval/wiki_20260723_es_qdrant_rrf/evaluation-keyword.json
python scripts/evaluate-rag.py backend/data/rag_eval/wiki_20260723_es_qdrant_rrf/eval-cases.jsonl --mode vector --top-k 10 --output backend/data/rag_eval/wiki_20260723_es_qdrant_rrf/evaluation-vector.json
python scripts/evaluate-rag.py backend/data/rag_eval/wiki_20260723_es_qdrant_rrf/eval-cases.jsonl --mode hybrid --top-k 10 --output backend/data/rag_eval/wiki_20260723_es_qdrant_rrf/evaluation-hybrid.json
```

## 指标结果

| 模式 | Recall@10 | MRR | nDCG@10 | duplicate rate | doc concentration | 平均延迟 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| keyword | 0.8194 | 0.9167 | 2.0393 | 0.0333 | 0.5250 | 31.98 ms |
| vector | 0.8403 | 0.9167 | 2.1503 | 0.0833 | 0.4833 | 314.43 ms |
| hybrid | 0.9792 | 1.0000 | 1.6636 | 0.0000 | 0.2917 | 383.03 ms |

说明：当前评测脚本按 doc 级相关文档标注计算 relevance，但同一相关文档的多个 chunk 会重复参与 nDCG，因此 nDCG@10 可能大于 1。本轮 nDCG 仅作不同模式之间的相对参考，后续应把 doc-level dedupe 后的 nDCG 作为正式指标。

## 分模式分析

### keyword

优点：

- 延迟最低，平均约 31.98 ms。
- 目录导航、关系类、工艺边界、安全边界、标准边界等有明确术语的问题表现较好。
- `Wiki目录里有哪些主题？` 能 Top1 命中 `wiki/INDEX.md`。

不足：

- `BOD5是什么指标？` Top1 错命中 `wiki/RO产水电导率升高.md`，Top2 才命中 `wiki/BOD5.md`，说明“指标”等泛词会干扰 BM25。
- `UF TMP升高应该先做什么？` Recall@10 只有 0.3333，Top1 被 `wiki/浊度升高.md` 抢占，说明 acronym + 中文混合问句仍需要领域词表或字段权重继续优化。
- 文档集中度最高，平均 0.5250，说明结果更容易集中在少数高词频文档。

### vector

优点：

- 定义、异常诊断、设备诊断、运行边界类语义问题表现稳定。
- `BOD5是什么指标？`、`UF TMP升高应该先做什么？`、`泵流量不足要结合哪些信号判断？` 均 Top1 命中相关文档。

不足：

- 目录导航类问题失败：`Wiki目录里有哪些主题？` Top1 命中 `wiki/阀门.md` 的来源块，Recall@10 为 0。
- duplicate rate 为 0.0833，高于 keyword 和 hybrid。
- 延迟高于 keyword，平均约 314.43 ms，主要受 query embedding 和 Qdrant 查询影响。

### hybrid

优点：

- 综合质量最好：Recall@10 = 0.9792，MRR = 1.0000。
- 12 个问题全部 Top1 命中相关文档。
- duplicate rate = 0，doc concentration = 0.2917，说明 RRF 后的去重和单文档 chunk 限制有效。
- 能同时兜住 keyword 的精确命中和 vector 的语义召回，例如：
  - `BOD5是什么指标？`：修正 keyword Top1 错误，hybrid Top1 命中 `wiki/BOD5.md`
  - `Wiki目录里有哪些主题？`：修正 vector 导航失败，hybrid Top1 命中 `wiki/INDEX.md`
  - `AI副驾驶可以自动下发PLC吗？`：补齐 keyword 单路 Recall 不足，hybrid Recall@10 达到 1.0

不足：

- 平均延迟最高，约 383.03 ms。
- `RO产水电导率升高可能和哪些因素有关？` Recall@10 为 0.75，未完全覆盖标注中的全部相关文档，后续可针对 RO 关联链路补领域同义词、标题权重或 reranker。
- 当前 RRF 仍不理解业务风险优先级，安全边界类和操作建议类问题后续可接入 reranker 或规则层加权。

## 单项问题观察

| 问题 | keyword | vector | hybrid | 结论 |
| --- | --- | --- | --- | --- |
| BOD5 定义 | Top2 命中 | Top1 命中 | Top1 命中 | hybrid 修正 keyword 泛词干扰 |
| BC 比关系 | Top1 命中 | Top1 命中 | Top1 命中 | 三路均可用，hybrid 排序更稳 |
| 浊度升高 | Top1 命中 | Top1 命中浊度常见异常 | Top1 命中浊度升高专门条目 | hybrid 更贴近专门异常条目 |
| UF TMP | Recall 低 | Top1 命中 | Top1 命中 | acronym + 中文问题更依赖 vector/hybrid |
| RO 电导率 | Top1 命中 | Top1 命中 | Top1 命中 | 仍需补齐 RO 前置保护等关联召回 |
| Wiki 目录 | Top1 命中 | 未命中 | Top1 命中 | 导航类必须保留 keyword/outline 路径 |
| AI 权限边界 | Top1 命中但 Recall 低 | Recall 中等 | Recall 达 1.0 | hybrid 对安全边界召回更完整 |

## 总体结论

当前默认使用 `hybrid` 是合理的。它在本轮覆盖不同类型问题的评测中取得最高 Recall@10、最高 MRR、最低重复率和最低文档集中度，能够修正 keyword 与 vector 的单路短板。

但本轮仍不应视为最终质量验收：

- 评测集只有 12 条，应扩展到至少 30-50 条真实业务问题。
- nDCG 口径需要修正为 doc-level dedupe 后计算。
- 延迟需要多轮重复测试，统计 P50/P95，而不是只看单次平均。
- 需要继续观察来源块、短块、维护说明块对检索结果的干扰。

## 后续优化建议

- 扩充评测集：增加错误码、设备编号、参数名、版本号、多条件组合、同义表达、现场处置顺序类问题。
- 修正评测脚本：doc-level relevance 应先按 doc 去重后再计算 nDCG。
- 优化 keyword：补领域词表、同义词、英文缩写与中文术语映射，例如 TMP、UF、RO、PLC、TDS。
- 优化 ingestion：对“来源”等短块进行合并、降权或过滤。
- 优化性能：对 query embedding 做缓存，或按问题类型路由到 keyword/vector/hybrid。
- 评估 reranker：先在离线评测中对 RRF Top 50 做精排对比，再决定是否默认开启。
