from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

from app.rag.ingestion import dry_run_approved_payload, validate_approved_payload
from app.rag.sources.wiki.config import WikiSourceConfig
from app.rag.sources.wiki.extractor import WikiMarkdownExtractor
from app.rag.sources.wiki.parser import parse_wiki_markdown


class RagWikiSourceTest(unittest.TestCase):
    def test_parse_wiki_markdown_reads_front_matter_sections_and_links(self) -> None:
        document = parse_wiki_markdown(
            """---
tags: [需求文档, 风控模型]
date: 2026-07-10
source: raw/source.docx
related: [[企业信用评分]], [[授信引擎]]
---
摘要第一句。

## 方案
这里引用 [[企业信用评分]]。
""",
            fallback_title="风控模型",
        )

        self.assertEqual(document.metadata["tags"], ["需求文档", "风控模型"])
        self.assertEqual(document.metadata["date"], "2026-07-10")
        self.assertIn("[[企业信用评分]]", document.metadata["related"])
        self.assertEqual(document.links, ["企业信用评分", "授信引擎"])
        self.assertEqual(len(document.sections), 2)
        self.assertEqual(document.sections[1].section_path, ["方案"])

    def test_parse_wiki_markdown_strips_utf8_bom_before_front_matter(self) -> None:
        document = parse_wiki_markdown(
            "\ufeff---\ntags: [异常诊断]\ndate: 2026-07-14\n---\n正文。",
            fallback_title="浊度升高",
        )

        self.assertEqual(document.metadata["tags"], ["异常诊断"])
        self.assertEqual(document.sections[0].text, "正文。")

    def test_wiki_extractor_builds_approved_payload_for_ingestion(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            wiki_dir = root / "wiki"
            wiki_dir.mkdir()
            (wiki_dir / "药剂策略.md").write_text(
                """---
tags: [加药, 运行策略]
date: 2026-07-14
source: raw/药剂策略.docx
related: [[超滤运行]]
---
药剂策略摘要。

## PAC
PAC 投加需要结合浊度变化。
""",
                encoding="utf-8",
            )

            payload = WikiMarkdownExtractor(config=WikiSourceConfig.from_path(root)).approved_payload()
            validate_approved_payload(payload)
            chunks, report = dry_run_approved_payload(payload)

            self.assertEqual(payload["status"], "approved")
            self.assertEqual(payload["block_count"], 2)
            self.assertEqual(len(chunks), 2)
            self.assertEqual(report.by_block_kind, {"wiki_section": 2})
            first_block = payload["blocks"][0]
            self.assertEqual(first_block["metadata"]["extra"]["document_kind"], "wiki_markdown")
            self.assertEqual(first_block["metadata"]["extra"]["wiki_tags"], ["加药", "运行策略"])
            self.assertEqual(first_block["status"], "approved")

    def test_wiki_extractor_marks_index_as_outline(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            wiki_dir = root / "wiki"
            wiki_dir.mkdir()
            (wiki_dir / "INDEX.md").write_text("# Wiki Index\n\n| 主题 | 简介 |\n| --- | --- |\n", encoding="utf-8")

            payload = WikiMarkdownExtractor(config=WikiSourceConfig.from_path(root)).approved_payload()

            block = payload["blocks"][0]
            self.assertEqual(block["metadata"]["extra"]["block_kind"], "wiki_outline")
            self.assertTrue(block["metadata"]["extra"]["is_navigation"])


if __name__ == "__main__":
    unittest.main()
