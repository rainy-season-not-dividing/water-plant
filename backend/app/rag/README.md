# RAG 知识底座

本目录是未来水厂多 Agent 运行时的知识底座边界，负责承载知识清洗、待审核知识块、后续 embedding、向量库写入和 Agent 检索调用等能力。

当前阶段重点是“知识入库前处理”，也就是先把 Word 知识文档清洗成可人工审核的结构化知识块。清洗结果不会直接写入 Qdrant，也不会直接进入 Agent 可检索知识库。

## 当前能力

- 定义稳定的 RAG 数据结构和接口。
- 预留 ingestion、embedding、retriever、vector store 和 Agent-facing service 边界。
- 支持将 `.docx` Word 文档解析成待审核知识块。
- 支持正文段落、表格行、`w:sdt` 内容控件和标题路径提取。
- 支持通过编号标题维护 `section_path`，标题本身不生成普通知识块。
- 支持在可识别的 Word 自动编号场景下回填条文号，例如把正文段落补成 `7.1.1 xxx`。
- 支持过滤“目次/目录”区域中的目录行，减少审核噪声。
- 支持通过 CLI 输出 `pending_review` JSON 文件，供人工审核和后续发布链路使用。
- 支持将 `approved` JSON 做入库前 dry-run 预检，生成 embedding chunk 计划和质量统计；当前不会调用 embedding，也不会写 Qdrant。
- 支持通过 OpenAI 兼容接口做限量 embedding preview；开发阶段必须传 `--limit`，避免无意消耗过多 token。

## 当前目录职责

```text
backend/app/rag/
```

| 文件 | 说明 |
| --- | --- |
| `schemas.py` | RAG 核心数据结构，包括 `KnowledgeMetadata`、`KnowledgeChunk`、`PendingReviewKnowledgeBlock` 等 |
| `cleaning.py` | Word 清洗 POC：解析 `.docx`，生成待审核知识块 |
| `chunker.py` | 临时文本切块器，供后续 ingestion 使用 |
| `ingestion.py` | 入库链路边界，当前支持 approved 文件校验和 dry-run chunk 计划；真实 embedding 和向量库尚未接入 |
| `embeddings.py` | embedding provider，当前支持 OpenAI 兼容接口 |
| `retriever.py` | 检索边界预留 |
| `service.py` | Agent / workflow 调用 RAG 的稳定门面 |
| `interfaces.py` | embedding、vector store、chunker 等协议定义 |

## 规划流程

```text
Word / 文档 / 日志 / 规则
  -> cleaning 清洗
  -> pending review blocks 待审核知识块
  -> human approval 人工确认
  -> ingestion 入库
  -> embeddings 向量化
  -> vector store 写入 Qdrant

agents / workflows
  -> RAG service
  -> retriever
  -> vector store
  -> 返回 LLM / 安全校验 / 人工确认所需上下文
```

## 当前分块策略

当前 POC 中，分块发生在 Word 文本提取之后、生成待审核知识块之前。

实际链路是：

```text
读取 .docx
-> 提取正文段落 / 表格行 / w:sdt 内容控件 / 标题路径
-> 过滤目录行，标题只更新 section_path
-> 对每个段落或表格行做文本切块
-> 生成 pending_review 待审核知识块
-> 写出 JSON
```

也就是说，当前不会先把整篇 Word 拼成一个大文本再统一切块，而是先尊重 Word 的基础结构：

```text
普通正文段落 -> 一个 DocumentTextBlock
普通表格行   -> 一个 DocumentTextBlock
内容控件正文 -> 按其中的段落或表格继续提取
标题         -> 进入 section_path，不直接生成知识块
目录行       -> 默认过滤，不生成知识块
```

然后再判断每个 `DocumentTextBlock` 的长度：

- 如果文本长度不超过 `chunk_size`，直接生成 1 个待审核知识块。
- 如果文本长度超过 `chunk_size`，按字符长度继续切成多个待审核知识块。
- 长文本切块时，相邻知识块之间保留 `overlap` 字符，减少上下文断裂。

默认参数：

```text
chunk_size = 900
overlap = 120
```

当前分块依据：

| 依据 | 作用 |
| --- | --- |
| Word 段落 | 普通段落优先保持为独立块 |
| Word 表格行 | 普通表格按行提取，每行优先保持为独立块 |
| Word 内容控件 | 顶层 `w:sdt` 中的段落和表格会按正文流顺序继续提取 |
| Word 自动编号 | 能识别到的标准条文编号会回填到正文文本中，方便审核、引用和检索展示 |
| 字符长度 | 超过 `chunk_size` 的长文本会继续切分 |
| 重叠长度 | 长文本切分时保留 `overlap` 字符上下文 |
| 标题路径 | Word 样式标题和 `1 范围`、`4.1 总体要求` 这类编号标题会写入 `section_path`，帮助人工审核和后续检索理解上下文 |
| 目录过滤 | “目次/目录”后的目录项会被过滤，不进入 pending review |

示例：

```text
标题：超滤 TMP 异常处理
段落 A：500 字
段落 B：1500 字
表格第 1 行：60 字
```

当前会处理为：

```text
段落 A -> 1 个 pending_review 知识块
段落 B -> 多个 pending_review 知识块，每块最多约 900 字，相邻块重叠约 120 字
表格第 1 行 -> 1 个 pending_review 知识块
```

需要注意：当前分块策略是 POC 级别，偏确定性和可验证，不是最终的语义分块方案。

后续更理想的分块依据应逐步加入：

```text
标题层级
自然段落
完整表格语义
列表项
工艺步骤
安全规则边界
案例结构
问答结构
最大 token 长度
语义完整性
```

例如，安全规则不应被随意切碎；复杂表格也不一定适合一行一个知识块，可能需要采用“表头 + 数据行”或“整表摘要 + 行级明细”的组合策略。

## 审核块、向量分片和分词

当前 `cleaning.py` 输出的是 `pending_review` 待审核知识块，不等于最终写入向量数据库的 embedding chunk。

推荐链路是：

```text
Word 原文
  -> cleaning 清洗
  -> pending_review 待审核知识块
  -> 人工审核 / 修正 / 删除 / 必要时合并或拆分
  -> approved 知识块
  -> ingestion 阶段生成 embedding chunks
  -> embedding 向量化
  -> 写入向量数据库
```

### 1. 为什么 approved 之后还要再分片

待审核知识块面向人工审核，优先保持来源结构清楚、可追溯、可修改。向量分片面向检索，优先保证长度合适、上下文完整、召回粒度稳定。

因此，入库前仍应基于 `approved` 知识块再做 embedding 分片：

- 短块：通常直接生成 1 个 embedding chunk。
- 超长块：按 token 或字符长度继续切成多个 embedding chunk，并保留适当 overlap。
- 不同审核块：默认不跨块合并，避免把来源不同或语义边界不同的内容揉在一起。
- 特殊结构：表格、步骤、FAQ、强相关条款可以在 ingestion 阶段采用专门组合策略。

向量化时可动态拼接章节上下文：

```text
" / ".join(section_path) + "\n" + text
```

但不建议在 pending JSON 中长期保存重复的 `raw_text` 或 `context_text` 字段。

### 2. 分片和分词不是一回事

分片是应用层策略，决定“一段知识切成几个可检索单元”。分词或 tokenization 是 embedding 模型内部或调用前的文本编码过程，决定“文本如何被模型拆成 token”。

通常不会因为分词把一句完整的话拆成几个向量。只要这句话所在的 embedding chunk 没有被应用层分片切开，它就会作为同一个 chunk 生成一个向量。模型内部会把句子切成 token，但这些 token 共同参与同一次 embedding 计算，最终仍是一个向量。

只有当应用层分片边界正好切到一句话中间时，一句话才可能被拆到两个 embedding chunk 中，各自生成向量。为避免这种情况，后续分片器应优先按段落、句子、列表项、表格语义边界切分，字符长度只作为兜底限制。

### 3. 同一小节下多条内容的关联

像 `7.1` 下的多条 `7.1.x` 条文，当前会优先一条一段输出。这样做的好处是审核清楚、引用准确、向量召回粒度细；风险是单条内容可能缺少兄弟条款上下文。

缓解方式不是简单把整节全部合并成一个大块，而是在 ingestion 阶段保留层级上下文和相邻关系：

- 每个 chunk 都带 `section_path`。
- 条文号保留在 `text` 中，例如 `7.1.1 xxx`。
- metadata 中保留来源、位置和块顺序。
- 检索召回后可按同一 `section_path` 或相邻 `source_locator` 做上下文扩展。
- 对强依赖的列表、步骤或表格，可在 ingestion 阶段生成“整组摘要 chunk + 单条明细 chunk”的组合。

这样既不会牺牲精确召回，也能在回答时补足上下文。

## Word 清洗使用手册

### 1. 基本命令

在项目根目录 `water_plant` 下执行：

```bash
python scripts/clean-rag-word.py path/to/source.docx
```

默认输出到：

```text
backend/data/rag_review/<源文件名>.pending.json
```

示例：

```bash
python scripts/clean-rag-word.py "项目说明书/YFJZ-R803-01 软件需求规格说明.docx"
```

如果不携带任何可选参数，只传入 Word 文件路径，脚本会按默认规则执行：

- 读取该 `.docx` 文件。
- 提取正文段落、正文表格行、`w:sdt` 内容控件和可识别的标题路径。
- 过滤目录行，标题只进入 `section_path`，不单独生成待审核知识块。
- 生成状态为 `pending_review` 的待审核知识块。
- `knowledge_type` 默认使用 `process_doc`。
- `source` 默认使用输入文件名，例如 `YFJZ-R803-01 软件需求规格说明.docx`。
- `agent_scope` 默认为空列表，表示暂不指定适用 Agent。
- `process_areas` 默认为空列表，表示暂不指定工艺区域。
- `device_ids` 默认为空列表，表示暂不指定关联设备。
- `incident_types` 默认为空列表，表示暂不指定事件类型。
- `source_version` 默认为空。
- `safety_level` 默认为空。
- `effective_time` 默认为空。
- `chunk_size` 默认使用 `900`。
- `overlap` 默认使用 `120`。
- 默认输出到 `backend/data/rag_review/<源文件名>.pending.json`。

简单说，不带可选参数时，它会把输入 Word 当作普通工艺文档处理，生成一份待人工审核的 JSON；不会入库、不会向量化、不会给 Agent 直接使用。

### 2. 可选参数总览

脚本格式：

```bash
python scripts/clean-rag-word.py <input.docx> [可选参数]
```

`<input.docx>` 是必填参数，表示要清洗的 Word 文件路径。

注意：`~$*.docx` 是 Word 临时锁文件，不是正式文档；脚本会拒绝读取这类输入。

| 参数 | 是否可重复 | 默认值 | 作用 |
| --- | --- | --- | --- |
| `-o` / `--output` | 否 | `backend/data/rag_review/<源文件名>.pending.json` | 指定输出 JSON 文件路径 |
| `--source` | 否 | 输入文件名 | 指定知识来源名称，写入 `metadata.source` |
| `--knowledge-type` | 否 | `process_doc` | 指定知识类型，只能填写脚本支持的固定枚举值 |
| `--agent-scope` | 是 | 空列表 | 指定知识未来适用的 Agent，可重复传入多个 |
| `--process-area` | 是 | 空列表 | 指定关联工艺区域，可重复传入多个 |
| `--device-id` | 是 | 空列表 | 指定关联设备 ID，可重复传入多个 |
| `--incident-type` | 是 | 空列表 | 指定关联事件类型，可重复传入多个 |
| `--source-version` | 否 | 空 | 指定来源文档版本 |
| `--safety-level` | 否 | 空 | 指定安全等级或审核等级 |
| `--effective-time` | 否 | 空 | 指定知识或规则的生效时间 |
| `--chunk-size` | 否 | `900` | 指定最大切块字符数 |
| `--overlap` | 否 | `120` | 指定相邻切块重叠字符数 |

### 3. 指定输出文件

```bash
python scripts/clean-rag-word.py "path/to/source.docx" -o "backend/data/rag_review/source.pending.json"
```

### 4. 指定知识来源名称

`--source` 会写入每个知识块的 metadata，建议使用稳定、可追溯的名称。

`--source` 可以自由填写字符串，不限制为固定枚举值。它代表“这批知识来自哪里”，后续用于追溯、审核和版本管理。

推荐填写有业务含义、能长期识别的名称，例如：

```text
YFJZ-R803-01 软件需求规格说明
uf-operation-manual-v1
ro-maintenance-guide-202607
2026年超滤运行案例汇总
```

不建议填写过于随意的名称，例如 `test`、`doc1`、`临时文件`，否则后续审核和追溯会比较困难。

```bash
python scripts/clean-rag-word.py "path/to/source.docx" --source "uf-operation-manual-v1"
```

### 5. 指定知识类型

默认知识类型是 `process_doc`。

`--knowledge-type` 不是任意填写，只能填写下面这些固定值：

| 可选值 | 含义 | 适用示例 |
| --- | --- | --- |
| `process_doc` | 工艺说明、流程文档、制度说明 | 工艺流程说明、运行规程、项目说明 |
| `equipment_manual` | 设备手册 | 超滤膜设备手册、泵组说明书、传感器手册 |
| `operation_case` | 运行案例或故障案例 | TMP 异常案例、RO 回收率波动案例 |
| `runtime_log` | 运行日志 | 历史运行记录、班组日志、事件日志 |
| `safety_rule` | 安全规则、权限边界、工艺禁区 | 禁止操作规则、人工确认要求 |
| `human_confirmation` | 人工确认记录 | 人工审批结果、操作确认记录 |
| `plan_rationale` | 方案依据、建议单依据 | 加药建议依据、清洗方案依据 |

如果填写不在表格中的值，脚本会报错并停止执行。

示例：

```bash
python scripts/clean-rag-word.py "path/to/source.docx" --knowledge-type equipment_manual
```

### 6. 指定 Agent 适用范围

可重复传入 `--agent-scope`。

```bash
python scripts/clean-rag-word.py "path/to/source.docx" --agent-scope uf --agent-scope supervisor
```

`--agent-scope` 当前不做强枚举校验，技术上可以填写任意字符串；但为了后续和项目 Agent 对齐，建议使用当前项目约定的 Agent id：

```text
supervisor
dosing
uf
ro
pump
```

### 7. 指定工艺区域、设备和事件类型

`--process-area`、`--device-id`、`--incident-type` 都可以重复传入多个值。

这些参数技术上是自由字符串，但建议使用稳定、可复用的命名，后续写入 Qdrant 后会作为 metadata filter 使用。

`--process-area` 会写入 `metadata.process_areas`，适合标注知识涉及的工艺区域。例如：

```text
ultrafiltration
reverse_osmosis
dosing
pump
supervision
```

示例：

```bash
python scripts/clean-rag-word.py "path/to/source.docx" --process-area ultrafiltration --process-area reverse_osmosis
```

`--device-id` 会写入 `metadata.device_ids`，适合标注知识涉及的设备。例如：

```text
uf-01
ro-train-01
dosing-pump-02
feed-pump-01
```

示例：

```bash
python scripts/clean-rag-word.py "path/to/source.docx" --device-id uf-01 --device-id ro-train-01
```

`--incident-type` 会写入 `metadata.incident_types`，适合标注知识涉及的事件或异常类型。例如：

```text
tmp_rising
membrane_fouling
ro_recovery_drop
pump_overload
dosing_abnormal
```

示例：

```bash
python scripts/clean-rag-word.py "path/to/source.docx" --incident-type tmp_rising --incident-type membrane_fouling
```

联合示例：

```bash
python scripts/clean-rag-word.py "path/to/source.docx" --agent-scope supervisor --agent-scope uf --agent-scope ro --process-area ultrafiltration --process-area reverse_osmosis --incident-type tmp_rising
```

### 8. 指定版本、安全等级和生效时间

`--source-version`、`--safety-level`、`--effective-time` 是单值自由字符串。

`--source-version` 建议填写能定位文档版本的值，例如：

```text
v1
v1.1
2026-07-06
初版
评审版
```

`--safety-level` 建议用于安全规则、人工确认要求、工艺禁区等知识。例如：

```text
normal
review_required
manual_confirmation_required
critical
```

`--effective-time` 建议填写规则或文档的生效时间。例如：

```text
2026-07-06
2026-07
长期有效
```

```bash
python scripts/clean-rag-word.py "path/to/source.docx" --source-version v1 --safety-level review_required --effective-time 2026-07-06
```

### 9. 调整切块大小

默认参数：

```text
chunk-size = 900
overlap = 120
```

示例：

```bash
python scripts/clean-rag-word.py "path/to/source.docx" --chunk-size 800 --overlap 100
```

一般不建议频繁调整，除非文档段落特别长或后续检索效果需要优化。

## 输出 JSON 说明

输出文件整体结构：

```json
{
  "source": "source.docx",
  "input_path": "path/to/source.docx",
  "status": "pending_review",
  "block_count": 10,
  "blocks": []
}
```

每个 block 的关键字段：

| 字段 | 说明 |
| --- | --- |
| `id` | 根据来源、位置和文本生成的稳定哈希 |
| `text` | 清洗后的知识文本 |
| `metadata` | 来源、知识类型、Agent 范围、工艺区域、设备、事件类型等元数据 |
| `status` | 当前固定为 `pending_review` |
| `title` | 所属章节标题，能识别时填写 |
| `section_path` | 标题层级路径 |
| `source_locator` | 原文位置，例如 `xxx.docx#block-12` |
| `char_count` | 当前知识块字符数 |

`metadata` 中和后续检索过滤关系最大的字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `source` | 字符串 | 知识来源名称 |
| `knowledge_type` | 固定枚举 | 知识类型 |
| `agent_scope` | 字符串列表 | 可使用该知识的 Agent 范围 |
| `process_areas` | 字符串列表 | 关联工艺区域，可同时包含多个 |
| `device_ids` | 字符串列表 | 关联设备 ID，可同时包含多个 |
| `incident_types` | 字符串列表 | 关联事件类型，可同时包含多个 |
| `source_version` | 字符串或空 | 来源版本 |
| `safety_level` | 字符串或空 | 安全等级或审核等级 |
| `effective_time` | 字符串或空 | 生效时间 |

## 人工审核边界

当前 CLI 只负责生成待审核知识块。

它不会做这些事：

- 不调用 LLM 自动改写专业内容。
- 不默认删除或合并业务知识。
- 不直接 embedding。
- 不写入 Qdrant。
- 不让 Agent 直接检索这些 pending 文件。

人工审核通过后，后续再接入发布链路：

```text
pending_review -> approved -> embedding -> Qdrant -> Agent 可检索
```

被驳回或需要修改的知识块，应保留原始来源和审核意见，避免无法追溯。

## 人工审核使用手册

`scripts/review-rag-pending.py` 已用于把清洗脚本生成的 `pending_review` 文件转换为人工确认后的 `approved` / `rejected` / `review-progress` 文件。它只做审核状态迁移和审核记录写入，不做 embedding、不写 Qdrant，也不把待审核内容接入 Agent 检索。

脚本路径：

```text
scripts/review-rag-pending.py
```

### 1. 输入和输出

输入：

```text
backend/data/rag_review/<name>.pending.json
```

输出：

```text
backend/data/rag_approved/<name>.approved.json
backend/data/rag_rejected/<name>.rejected.json
backend/data/rag_review/<name>.review-progress.json
```

其中：

- `rag_approved/*.approved.json` 保存审核通过的 block，后续 ingestion 只能读取这类文件。
- `rag_rejected/*.rejected.json` 保存审核驳回的 block，便于追溯原因。
- `rag_review/*.review-progress.json` 保存交互审核中跳过或尚未处理的 block，用于后续继续人工处理。

### 2. 批量通过模式

如果一份 pending 文件已经人工确认可以整体通过，可执行：

```powershell
python scripts/review-rag-pending.py backend/data/rag_review/source.pending.json --approve-all
```

行为：

- 校验顶层 `status == "pending_review"`。
- 校验存在 `blocks` 且每个 block 的 `status == "pending_review"`。
- 将所有 block 的 `status` 改为 `approved`。
- 写入 block 级审核记录到 `metadata.extra`。
- 写入顶层 `review_summary`。
- 默认输出到 `backend/data/rag_approved/source.approved.json`。

可选参数：

| 参数 | 作用 |
| --- | --- |
| `--output` / `-o` | 指定 approved 输出路径 |
| `--reviewer` | 指定审核人，默认 `reviewer` |
| `--note` | 指定本次审核备注 |
| `--force` | 覆盖已存在输出文件；默认拒绝覆盖 |

示例：

```powershell
python scripts/review-rag-pending.py backend/data/rag_review/source.pending.json --approve-all --reviewer "张三" --note "按原文整体通过"
```

### 3. 逐条审核模式

需要逐条检查、编辑、驳回或跳过时，可执行：

```powershell
python scripts/review-rag-pending.py backend/data/rag_review/source.pending.json --interactive
```

每条展示：

```text
index / total
title
section_path
text
source_locator
metadata.extra.block_kind
```

操作命令：

```text
a = approve
r = reject
e = edit text
n = add review note
s = skip
b = back
q = quit and save progress
```

交互审核会默认写出三类文件：

```text
approved blocks -> backend/data/rag_approved/<name>.approved.json
rejected blocks -> backend/data/rag_rejected/<name>.rejected.json
skipped / unfinished -> backend/data/rag_review/<name>.review-progress.json
```

说明：

- `a` 会把当前 block 写入 approved 输出。
- `r` 会把当前 block 写入 rejected 输出。
- `e` 会输入新文本，更新 `text` 和 `char_count`，并把该 block 作为 edited + approved。
- `n` 会为当前 block 添加审核备注，不自动前进。
- `s` 会保留当前 block 的 `pending_review` 状态，并写入 progress 输出。
- `b` 返回上一条，可重新审核。
- `q` 退出并保存当前进度；未审核内容进入 progress 输出。

### 4. 审核记录字段

block 级字段写入 `metadata.extra`：

```json
{
  "metadata": {
    "extra": {
      "reviewed_by": "reviewer",
      "reviewed_at": "2026-07-07T00:00:00+08:00",
      "review_mode": "approve_all",
      "review_note": ""
    }
  }
}
```

交互审核编辑过的 block 还会记录：

```json
{
  "metadata": {
    "extra": {
      "review_action": "edit",
      "review_edited": true,
      "review_original_text": "原始文本"
    }
  }
}
```

顶层字段写入 `review_summary`：

```json
{
  "status": "approved",
  "review_summary": {
    "mode": "approve_all",
    "reviewer": "reviewer",
    "reviewed_at": "2026-07-07T00:00:00+08:00",
    "approved_count": 371,
    "rejected_count": 0,
    "edited_count": 0,
    "skipped_count": 0
  }
}
```

### 5. 输出保护和非法输入

默认情况下，如果输出文件已存在，脚本会拒绝覆盖并提示使用 `--force`。推荐保留默认行为，避免覆盖已有审核结果。

脚本会拒绝以下输入：

- 顶层 `status` 不是 `pending_review`。
- 缺少 `blocks`。
- `blocks` 不是列表。
- 任意 block 的 `status` 不是 `pending_review`。

覆盖输出示例：

```powershell
python scripts/review-rag-pending.py backend/data/rag_review/source.pending.json --approve-all --force
```

### 6. 后续 ingestion 约束

后续向量化和入库脚本必须执行硬约束：

```text
只接受顶层 status == approved 的文件
只处理 block.status == approved 的 block
拒绝 pending_review / rejected / review-progress 文件
```

这个约束比审核工具本身更重要，避免未审核内容绕过流程直接进入向量数据库。

## Approved 入库预检使用手册

`scripts/ingest-rag-approved.py` 用于审核通过后的入库预检。当前只支持 dry-run，不调用 embedding，不写 Qdrant，也不会修改输入 JSON。

脚本路径：

```text
scripts/ingest-rag-approved.py
```

### 1. 基本命令

```powershell
python scripts/ingest-rag-approved.py backend/data/rag_approved/source.approved.json --dry-run
```

这条命令会：

- 读取 approved JSON。
- 校验顶层 `status == "approved"`。
- 校验每个 block 的 `status == "approved"`。
- 校验 `id`、`text`、`metadata.source`、`metadata.knowledge_type`、`source_locator`、`char_count`。
- 拒绝重复 `id` 和重复 `source_locator`。
- 生成“一条 approved block -> 一个 content_chunk”的 embedding chunk 计划。
- 输出 dry-run 统计报告。

### 2. 当前 chunk 计划策略

第一阶段保持保守策略：

```text
一条 approved block -> 一个 content_chunk
```

用于 embedding 的文本运行时动态构造：

```text
" / ".join(section_path) + "\n" + text
```

如果 `section_path` 为空，则直接使用 `text`。脚本不会把 `raw_text` 或 `context_text` 写回 approved JSON。

每个 planned chunk 会保留关键 metadata：

```text
approved_block_id
source
knowledge_type
agent_scope
process_areas
device_ids
incident_types
source_version
safety_level
effective_time
title
section_path
source_locator
block_index
block_kind
reviewed_by
reviewed_at
review_mode
review_action
review_note
```

### 3. dry-run 报告内容

默认文本报告包含：

```text
approved_block_count
planned_chunk_count
skipped_count
empty_section_path_count
short_text_count
long_text_count
by_block_kind
by_knowledge_type
warnings
```

可输出完整 JSON 报告：

```powershell
python scripts/ingest-rag-approved.py backend/data/rag_approved/source.approved.json --dry-run --json
```

可调整统计阈值：

```powershell
python scripts/ingest-rag-approved.py backend/data/rag_approved/source.approved.json --dry-run --short-text-threshold 20 --long-text-threshold 1200 --sample-size 10
```

### 4. 当前不会做的事

```text
不调用 embedding API
不写 Qdrant
不写入任何数据库
不修改 approved JSON
不默认跳过疑似封面或短文本
不在当前阶段做目录/短内容聚合
```

`section_path` 为空、文本很短或 chunk 很长时，dry-run 只给出 warning。是否过滤、聚合或重组，等完整检索链路打通并观察效果后再调整。

## Qdrant 本地与部署启动

本地开发和服务器部署都通过 Docker Compose 启动 Qdrant，但持久化目录不同。

### 1. 本地开发

本地 compose 文件：

```text
docker-compose.yml
```

本地 Qdrant 数据不放在项目目录中，避免污染仓库。项目根 `.env` 中配置：

```text
QDRANT_IMAGE=qdrant/qdrant:v1.12.4
QDRANT_STORAGE_PATH=E:/path/to/docker-data/water_plant/qdrant/storage
```

启动：

```powershell
docker compose up -d qdrant
```

检查：

```powershell
curl http://127.0.0.1:6333/collections
```

本地宿主机 Python 脚本使用：

```text
QDRANT_URL=http://127.0.0.1:6333
```

### 2. 服务器部署

部署 compose 文件：

```text
deploy/docker-compose.yml
```

服务器 Qdrant 数据挂载到交付目录：

```text
deploy/qdrant/storage -> /qdrant/storage
```

部署容器内 backend 使用：

```text
QDRANT_URL=http://qdrant:6333
```

Qdrant 端口只绑定宿主机本机：

```text
127.0.0.1:6333:6333
```

不要把 Qdrant 直接暴露到公网。

## Embedding 预览使用手册

`scripts/embed-rag-approved.py` 用于从 approved JSON 生成少量 embedding 预览。当前只调用 embedding provider，不写 Qdrant。

脚本路径：

```text
scripts/embed-rag-approved.py
```

### 1. 环境变量

不要把 API key 写入代码、README、Memory 或提交到仓库。开发时只设置在当前终端环境中。

PowerShell 示例：

```powershell
$env:RAG_EMBEDDING_PROVIDER = "openai_compatible"
$env:RAG_EMBEDDING_MODEL = "text-embedding-v4"
$env:RAG_EMBEDDING_DIMENSION = "1024"
$env:RAG_EMBEDDING_BASE_URL = "https://<your-compatible-endpoint>/compatible-mode/v1"
$env:RAG_EMBEDDING_API_KEY = "<your-api-key>"
```

也兼容：

```text
DASHSCOPE_API_KEY
OPENAI_COMPATIBLE_BASE_URL
EMBEDDING_PROVIDER
EMBEDDING_MODEL
EMBEDDING_DIMENSION
EMBEDDING_API_KEY
EMBEDDING_BASE_URL
```

如果接口不支持 `dimensions` 参数，可设置：

```powershell
$env:RAG_EMBEDDING_REQUEST_DIMENSION = "false"
```

### 2. 限量预览命令

`--limit` 是必填参数，用于控制开发阶段成本。

```powershell
python scripts/embed-rag-approved.py backend/data/rag_approved/source.approved.json --limit 5
```

输出包括：

```text
planned_chunks_total
embedded_count
vector_dimension
elapsed_seconds
storage: not written to Qdrant
```

可以调整批量大小：

```powershell
python scripts/embed-rag-approved.py backend/data/rag_approved/source.approved.json --limit 5 --batch-size 5
```

`text-embedding-v4` 当前单次 embedding 请求的输入数量不能超过 10，因此 `--batch-size` 默认使用 `10`，不要设置得更大。

可选写出限量向量预览文件：

```powershell
python scripts/embed-rag-approved.py backend/data/rag_approved/source.approved.json --limit 5 --output backend/data/rag_embedding_preview/source.limit5.embeddings.json
```

### 3. 当前不会做的事

```text
不写 Qdrant
不写正式向量库
不自动处理全部 approved block
不保存 API key
不把 embedding preview 当作正式发布产物
```

## Approved 发布到 Qdrant 使用手册

`scripts/publish-rag-approved.py` 用于把审核通过的 approved JSON 限量发布到 Qdrant 开发 collection。它会执行 approved 校验、生成 chunk plan、调用 embedding provider，并写入 Qdrant。

### 1. 基本命令

```powershell
python scripts/publish-rag-approved.py backend/data/rag_approved/source.approved.json --limit 5
```

`--limit` 是必填参数，用于控制开发阶段的 embedding 和写库数量，避免误把整份文档批量写入。
embedding 请求的默认 `--batch-size` 为 `10`，不要超过 `text-embedding-v4` 的单次请求上限。

默认 collection：

```text
water_plant_rag_dev
```

### 2. 环境变量

发布脚本复用 embedding 配置，并读取 Qdrant 配置：

```text
QDRANT_URL=http://127.0.0.1:6333
RAG_QDRANT_COLLECTION=water_plant_rag_dev
RAG_VECTOR_DIMENSION=1024
RAG_QDRANT_DISTANCE=Cosine
```

可以通过参数临时覆盖 collection 和 URL：

```powershell
python scripts/publish-rag-approved.py backend/data/rag_approved/source.approved.json --limit 5 --collection water_plant_rag_dev --qdrant-url http://127.0.0.1:6333
```

### 3. 输出内容

脚本会输出：

```text
planned_chunks_total
selected_count
embedded_count
upserted_count
vector_dimension
storage: written to Qdrant
```

可输出 JSON 摘要：

```powershell
python scripts/publish-rag-approved.py backend/data/rag_approved/source.approved.json --limit 5 --json
```

## Wiki 知识源和三种检索方式

`wikidb/wiki/*.md` 是本地 Wiki 知识源。Wiki 条目面向人工维护，Qdrant 面向机器向量检索；两者不是替代关系。

当前 Wiki 接入链路：

```text
wikidb/wiki/*.md
  -> WikiMarkdownExtractor
  -> approved payload
  -> ingestion planned chunks
  -> keyword / vector / hybrid 检索
```

Wiki 条目直接视为 `approved` 知识源，但 RAG 只读取 `wikidb/wiki/*.md`，不修改 `wikidb/raw` 原始文件。

### 1. Wiki dry-run 和发布

先预检 Wiki 会生成多少 approved block / planned chunk：

```powershell
python scripts/dry-run-rag-wiki.py --json
```

可同时写出 approved payload：

```powershell
python scripts/dry-run-rag-wiki.py --output backend/data/rag_approved/wikidb.approved.json --json
```

Wiki 发布到 Qdrant 使用文档级发布台账：

```text
wikidb/wikidb/wiki/.qdrant_published.json
```

发布原则：

```text
Wiki 文档是事实源。
Qdrant 是 Wiki 的向量索引。
发布脚本默认只新增，不删除 Qdrant 旧 point。
发布台账按 Wiki 文档记录，避免已发布文档重复调用 embedding API。
已发布且文件 hash 未变化的文档整篇跳过。
已发布但文件 hash 已变化的文档只提示，不自动覆盖旧向量。
台账中存在但当前 Wiki 已删除的文档只提示，不自动删除 Qdrant。
```

台账按文档记录，但每个文档条目会保留该文档生成的 `point_ids` 和 `source_locators`，方便排查。Qdrant 内部仍然是一段 section/chunk 对应一个向量 point。

发布新增 Wiki 文档时，显式指定文档：

```powershell
python scripts/publish-rag-wiki.py --document "RO处置顺序.md" --document "UF处置顺序.md" --json
```

第一次启用文档级台账时，如果 Qdrant 中已经有旧 Wiki 向量，只希望发布一批新增文档，可同时把未选中的旧文档记录为已发布基线：

```powershell
python scripts/publish-rag-wiki.py --document "RO处置顺序.md" --document "UF处置顺序.md" --assume-published-unselected --json
```

这条命令会：

```text
选中的文档：如果台账未记录，则 embedding 并 upsert 到 Qdrant，成功后写入台账。
未选中的文档：如果台账未记录，则只写入 assumed_published 基线，不调用 embedding，不写 Qdrant。
```

可先 dry-run 预览将发布和跳过哪些文档：

```powershell
python scripts/publish-rag-wiki.py --document "RO处置顺序.md" --dry-run --json
```

如果确认某个已发布文档需要重新生成向量，可手动删除台账中的对应文档记录，或使用 `--force` 强制重发选中文档：

```powershell
python scripts/publish-rag-wiki.py --document "RO处置顺序.md" --force --json
```

注意：Wiki 发布是索引更新动作，不是查询动作。只有 Wiki 内容新增、需要人工确认后重发、parser / extractor 逻辑变化，或需要重建 collection 时，才应重新发布。

### 2. Keyword 检索

Keyword 检索由 `backend/app/rag/retrievers/keyword.py` 实现，不调用 embedding API，也不访问 Qdrant。它直接在当前 Wiki approved payload 生成的 planned chunks 上做确定性文本匹配。

当前逻辑：

```text
query
  -> 规范化为小写
  -> 去掉常见问句虚词
  -> 提取核心关键词
  -> 中文核心词生成 2/3/4-gram
  -> 在 title / section_path / source_locator / source / body 中加权匹配
  -> 返回 keyword score 排序后的结果
```

字段权重从高到低大致是：

```text
title
section_path
source_locator
source
body
```

因此，像下面的问题：

```text
浊度升高可能是什么原因？
```

不会再把整句当成唯一关键词去查，而会提取和扩展出类似：

```text
浊度升高
浊度
升高
原因
```

并优先匹配标题、章节路径和文件定位中的 `浊度升高`。

Keyword 适合：

- 明确术语：`BOD5是什么指标？`
- 明确异常名：`浊度升高可能是什么原因？`
- 设备名、参数名、条款号、文件名。
- Wiki 目录 / 索引类问题。

Keyword 不适合：

- 问法很绕、没有明确术语的问题。
- 需要语义近似、同义表达或上下文推断的问题。
- 需要跨多个概念综合解释的问题。

当前对 `INDEX.md` 的特殊处理：

```text
INDEX.md -> block_kind = wiki_outline
```

普通专业问答默认跳过 `wiki_outline`，避免长目录页抢占结果。只有当问题明显是目录、索引、导航、outline 类问题时，才允许 `INDEX.md` 命中。

### 3. Vector 检索

Vector 检索由 `backend/app/rag/retriever.py` 和 Qdrant store 实现。它会真实调用 embedding provider，把 query 转成向量，再到 Qdrant collection 中做语义相似度搜索。

当前逻辑：

```text
query
  -> ConfiguredEmbeddingProvider.embed_text(query)
  -> QdrantVectorStore.search(query_vector)
  -> Qdrant 返回相似 chunk
  -> 转成 RetrievalResult
```

Vector 检索依赖两个前提：

```text
1. 对应知识 chunk 已经发布到 Qdrant。
2. 当前 collection 中的向量是最新 parser / extractor / ingestion 逻辑生成的。
```

如果 Wiki dry-run 能看到某个条目，但 Qdrant 里没有发布它，vector 就检索不到它。

Vector 适合：

- 语义问答：`BOD5是什么指标？`
- 概念解释：`BC比和BOD5、COD有什么关系？`
- 近似表达：问题没有完全复用 Wiki 标题，但语义接近。
- 专业描述较长、关键词不完全确定的问题。

Vector 不适合：

- 目录 / 索引 / 列表导航类问题。
- 只靠编号、文件名、精确设备 ID 的问题。
- Qdrant collection 还没发布对应知识的场景。

Vector 返回的 `score` 是向量相似度分数，不是关键词命中分数。不同 embedding 模型、collection 和距离配置下，分数区间和可比性可能不同。

### 4. Hybrid 检索

Hybrid 检索由 `backend/app/rag/retrievers/hybrid.py` 实现。它不是重新发明一套检索，而是把 Keyword 和 Vector 的结果融合。

当前逻辑：

```text
query
  -> keyword.retrieve(top_k * 2)
  -> vector.retrieve(top_k * 2)
  -> Reciprocal Rank Fusion
  -> 返回 top_k
```

融合公式是 RRF：

```text
fused_score += 1 / (rrf_k + rank)
```

默认：

```text
rrf_k = 60
```

这意味着 Hybrid 当前主要看两路检索中的排名，而不是直接比较 keyword 原始分数和 vector 原始分数。

如果同一个 chunk 同时被 keyword 和 vector 命中，它会获得两路分数叠加，通常会排得更靠前。结果 metadata 中会写入：

```text
retrieval_sources = ["keyword", "vector"]
```

如果 keyword 没有结果，Hybrid 会接近纯 vector。如果 vector 没有结果，Hybrid 会接近纯 keyword。

Hybrid 对 `INDEX.md` 的处理：

- 普通专业问答：过滤 `wiki_outline`，避免目录页污染结果。
- 目录 / 索引 / 导航类问题：允许 `wiki_outline`，并给 outline 一个小幅 boost，让 `INDEX.md` 更容易排到前面。

Hybrid 适合：

- 默认问答入口。
- 同时包含明确术语和语义描述的问题。
- 异常诊断类问题，例如 `浊度升高可能是什么原因？`。
- 需要兼顾标题精确命中和语义召回的问题。

Hybrid 当前边界：

- 仍是 RRF 初版，不做 LLM rerank。
- 不按安全等级、Agent 权限或实时性做智能路由。
- 不替代 Runtime Tool、Safety 规则或人工确认。
- 对“来源”“适用工艺段”等短 section 仍可能召回，后续可继续做短块聚合或降权。

### 5. 三种模式调试命令

使用 `scripts/search-rag-hybrid.py` 对比三种检索方式：

```powershell
python scripts/search-rag-hybrid.py "BOD5是什么指标？" --mode keyword --json
python scripts/search-rag-hybrid.py "BOD5是什么指标？" --mode vector --json
python scripts/search-rag-hybrid.py "BOD5是什么指标？" --mode hybrid --json
```

指定 collection：

```powershell
python scripts/search-rag-hybrid.py "浊度升高可能是什么原因？" --mode hybrid --collection water_plant_rag_dev --json
```

推荐对比样例：

```powershell
python scripts/search-rag-hybrid.py "BC比和BOD5、COD有什么关系？" --mode keyword --json
python scripts/search-rag-hybrid.py "BC比和BOD5、COD有什么关系？" --mode vector --json
python scripts/search-rag-hybrid.py "BC比和BOD5、COD有什么关系？" --mode hybrid --json

python scripts/search-rag-hybrid.py "浊度升高可能是什么原因？" --mode keyword --json
python scripts/search-rag-hybrid.py "浊度升高可能是什么原因？" --mode vector --json
python scripts/search-rag-hybrid.py "浊度升高可能是什么原因？" --mode hybrid --json

python scripts/search-rag-hybrid.py "Wiki目录里有哪些主题？" --mode keyword --json
python scripts/search-rag-hybrid.py "Wiki目录里有哪些主题？" --mode vector --json
python scripts/search-rag-hybrid.py "Wiki目录里有哪些主题？" --mode hybrid --json
```

经验判断：

| 问题类型 | 推荐模式 | 原因 |
| --- | --- | --- |
| 明确术语 / 指标 / 文件标题 | `keyword` 或 `hybrid` | 标题和 section_path 命中更确定 |
| 普通概念解释 | `vector` 或 `hybrid` | 语义表达可能和 Wiki 原文不完全一致 |
| 异常诊断 | `hybrid` | 同时需要异常标题精确命中和语义召回 |
| 目录 / 索引 / 导航 | `keyword` 或 `hybrid` | 应优先返回 `INDEX.md` 这类 outline |
| 设备号 / 参数名 / 标准条款号 | `keyword` | 精确字符串更可靠 |
| 模糊追问 / 跨概念关系 | `vector` 或 `hybrid` | 向量语义召回更稳 |

## RAG 检索调试与 live 测试

`backend/app/rag/retriever.py` 是项目运行时检索编排入口，负责：

```text
query -> embedding provider -> Qdrant vector search -> RetrievalResult
```

脚本只作为人工调试入口，方便观察真实检索结果。

### 1. 输入问题并检索

```powershell
python scripts/search-rag.py "城镇污水处理厂绿色设计对节能有什么要求？" --top-k 5
```

它会真实调用 embedding API，并从 Qdrant collection 检索结果。输出包含：

```text
score
source
section_path
source_locator
text
```

可保存 JSON 结果：

```powershell
python scripts/search-rag.py "问题内容" --top-k 5 --output backend/data/rag_search_debug/query1.json
```

可使用 metadata filter：

```powershell
python scripts/search-rag.py "问题内容" --top-k 5 --agent-id supervisor --knowledge-type process_doc --process-area energy
```

### 2. live smoke 测试

普通单元测试默认不调用真实 API/Qdrant；真实链路验收使用 live smoke 脚本：

```powershell
python scripts/test-rag-live.py "城镇污水处理厂绿色设计对节能有什么要求？" --top-k 5 --min-results 1
```

可要求至少一个结果的 source 包含指定文本：

```powershell
python scripts/test-rag-live.py "绿色设计规程" --top-k 5 --expect-source-contains "城镇污水处理厂绿色设计规程"
```

live smoke 会真实检查：

```text
embedding API 可用
Qdrant 可连接
collection 可检索
返回结果数量达标
结果包含 chunk_id / source / source_locator / text
```

## 开发验证

在 `backend` 目录下运行：

```bash
python -m unittest discover -s tests -p "test_*.py"
```

编译检查：

```bash
python -m py_compile app/rag/cleaning.py app/rag/schemas.py app/rag/ingestion.py app/rag/embeddings.py app/rag/qdrant_store.py app/rag/retriever.py ../scripts/clean-rag-word.py ../scripts/review-rag-pending.py ../scripts/ingest-rag-approved.py ../scripts/embed-rag-approved.py ../scripts/publish-rag-approved.py ../scripts/search-rag.py ../scripts/test-rag-live.py
```

## 常见问题

### 为什么不直接写入向量库？

水厂知识会影响 Agent 建议、风险判断和人工确认链路。第一阶段必须先生成待审核知识块，经人工确认后再发布，避免未审核内容直接参与决策。

### 现在支持 `.doc` 吗？

暂不支持。当前 POC 只支持 `.docx`。

### 表格会怎么处理？

当前按“表格行”提取，每一行会用 `|` 拼接单元格内容，并作为待审核知识块输出。

### 图片、页眉页脚、批注会被解析吗？

当前不会。第一阶段只解析正文段落、正文标题和正文表格。

### Word 临时锁文件可以作为输入吗？

不可以。`~$*.docx` 是 Word 打开文档时生成的临时锁文件，脚本会直接报错，避免把它误当成正式 `.docx` 清洗。

### pending JSON 可以提交到仓库吗？

默认不建议提交真实业务文档清洗结果，除非已经确认没有敏感信息，并且团队明确要把它作为样例或测试数据保存。
