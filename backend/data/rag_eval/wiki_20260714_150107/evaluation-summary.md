# Wiki RAG 检索改造后评估摘要

## 本轮改动

- Wiki parser 会先剥离 UTF-8 BOM，避免 front matter 被误当成正文。
- `INDEX.md` 解析为 `wiki_outline`，作为导航/outline 块处理。
- Keyword 检索改为核心词 + 字段加权：
  - 对中文问句去除“是什么、可能、原因、关系、如何”等问句虚词。
  - 对中文核心词生成 2/3/4-gram 补召回。
  - title / section_path / source_locator 权重大于正文。
  - 普通知识问答默认跳过 `wiki_outline`。
- Hybrid 检索继续使用 RRF 融合 keyword + vector：
  - 普通问题过滤 outline，避免 `INDEX.md` 干扰。
  - 目录/索引/导航类问题允许 outline，并给 outline 小幅 boost。

## 输出位置

- 输出目录：`backend/data/rag_eval/wiki_20260714_150107`
- approved payload：`backend/data/rag_approved/wikidb.approved.json`
- Qdrant collection：`water_plant_rag_eval_20260714_150107`

旧测试目录 `backend/data/rag_eval/wiki_20260714_141943` 已删除。

## dry-run / publish

- approved_block_count：380
- planned_chunk_count：380
- skipped_count：0
- block_kind：`wiki_section` 379，`wiki_outline` 1
- short_text_count：102
- long_text_count：1，来自 `wiki/INDEX.md#section-1`
- publish：380 / 380 chunks 已写入 Qdrant
- vector_dimension：1024
- embedding_elapsed_seconds：20.22
- upsert_elapsed_seconds：2.72

和上一轮 469 chunks 相比，块数减少是正向变化：原先若干文件的 YAML front matter 因 BOM 未剥离被当作正文块；现在 front matter 正确剥离，不再入库为普通知识。

## 三种检索方式对比

### 1. `BC比和BOD5、COD有什么关系？`

- keyword Top1：`wiki/COD.md#section-1`
  - 准确性：中等。能命中 COD/BOD5/BC 比相关块，但 Top1 偏 COD 定义，真正关系解释在 Top4/Top5。
- vector Top1：`wiki/BC比.md#section-1`
  - 准确性：高。语义上先命中 BC 比主题，Top2 命中 B/C 比定义。
- hybrid Top1：`wiki/BC比.md#section-1`
  - 准确性：高。融合后把 keyword + vector 共同命中的 BC 比主题放到首位，优于单独 keyword。

结论：关系类问题 hybrid 表现最好，vector 次之，keyword 可作为补充但不宜单独依赖。

### 2. `BOD5是什么指标？`

- keyword Top1：`wiki/BOD5.md#section-1`
  - 准确性：高。字段加权后已能直接命中 BOD5 定义。
- vector Top1：`wiki/BOD5.md#section-1`
  - 准确性：高。语义命中稳定。
- hybrid Top1：`wiki/BOD5.md#section-1`
  - 准确性：高。keyword 和 vector 双路命中同一块，结果最稳。

结论：定义类问题三种方式都可用，hybrid 稳定性最好。

### 3. `浊度升高可能是什么原因？`

- keyword Top1：`wiki/浊度升高.md#section-1`
  - 准确性：高。上一轮 keyword 为 0，本轮通过核心词和 n-gram 成功命中。
- vector Top1：`wiki/浊度.md#section-4`
  - 准确性：高。命中“浊度”条目里的常见异常段，内容包含原因和建议处置。
- hybrid Top1：`wiki/浊度升高.md#section-1`
  - 准确性：高。融合后优先返回专门的异常条目，结果优于纯 vector。

结论：异常诊断类问题改造收益明显，keyword 从 0 召回提升到准确命中；hybrid 最适合作为默认模式。

### 4. `Wiki目录里有哪些主题？`

- keyword Top1：`wiki/INDEX.md#section-1`
  - 准确性：高。目录类问题允许 outline 命中。
- vector Top1：`wiki/决策日志.md#section-1`
  - 准确性：低。语义检索不适合目录导航类问题。
- hybrid Top1：`wiki/INDEX.md#section-1`
  - 准确性：高。导航类 query 对 outline 放行并 boost 后，结果符合预期。

结论：目录/索引类问题应走 keyword/outline 路径，不适合纯 vector。

## 三种检索方式时延对比

本轮每个 `search-*.json` 文件中均记录了：

```json
"elapsed_seconds": ...
```

整理结果如下：

| 问题 | keyword | vector | hybrid |
| --- | ---: | ---: | ---: |
| `BC比和BOD5、COD有什么关系？` | 0.09s | 4.01s | 4.30s |
| `BOD5是什么指标？` | 0.04s | 2.78s | 4.44s |
| `浊度升高可能是什么原因？` | 0.05s | 3.17s | 2.92s |
| `Wiki目录里有哪些主题？` | 0.08s | 3.37s | 6.04s |

时延结论：

- `keyword` 最快，基本是本地 planned chunks 文本扫描，不调用 embedding API，不访问 Qdrant，本轮均在 0.1s 内。
- `vector` 明显更慢，因为需要先调用 embedding provider 将 query 转为向量，再访问 Qdrant 做向量检索，本轮约 2.78s-4.01s。
- `hybrid` 通常接近或略高于 `vector`，因为当前会同时执行 keyword 和 vector，并做 RRF 融合；整体耗时主要受 embedding API 和 Qdrant 查询影响。
- `Wiki目录里有哪些主题？` 的 hybrid 时延为 6.04s，偏高，可能受当次 embedding/API 波动影响。该值是单次测试结果，不能直接视为稳定均值。

准确性与时延综合判断：

| 模式 | 准确性表现 | 时延表现 | 适用建议 |
| --- | --- | --- | --- |
| keyword | 明确术语、异常名、目录类问题表现好；复杂语义问题可能偏 | 最快 | 适合精确检索、目录/索引、设备号/参数名/条款号 |
| vector | 定义、关系、异常解释语义召回稳定；目录类问题不适合 | 较慢 | 适合概念解释、语义近似、模糊追问 |
| hybrid | 综合准确性最好，默认问答最稳 | 通常最慢或接近 vector | 适合作为默认检索模式，但后续需要并行化或缓存优化 |

后续若要严谨评估性能，应对同一批问题重复运行多轮，统计平均值、P50/P95 和失败率；本报告仅记录本轮单次测试结果。

## 总体结论

- `INDEX.md` 作为导航/outline 的处理已生效：普通问答不再被它抢占，目录类问题仍可命中。
- Keyword 的中文自然问句能力明显改善，尤其是“浊度升高可能是什么原因？”从 0 召回变为 Top1 准确命中。
- Vector 对定义、关系、异常解释仍然稳定，但对目录类问题不合适。
- Hybrid 当前是最适合作为默认检索方式的模式：既能利用 keyword 的精确标题命中，又能利用 vector 的语义召回。
- 从时延看，keyword 远快于 vector/hybrid；hybrid 准确性最好，但当前同步执行方式会带来更高耗时，后续可考虑并行化、query embedding 缓存或按问题类型路由。

## 仍建议后续优化

- “来源”“适用工艺段”等短 section 仍会进入检索结果，后续可在 ingestion 阶段聚合或降权。
- Keyword 目前是轻量规则，不是真正中文分词；后续可加入领域词表、别名表和标题索引。
- Hybrid 仍是 RRF，不看原始语义分数和业务风险；后续进入 Router 阶段时，应按问题类型选择 keyword/vector/hybrid/安全规则路径。
