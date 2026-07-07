from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile

from app.rag.cleaning import KnowledgeCleaningPipeline, write_pending_blocks_json


DOCUMENT_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>UF Operation</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>TMP rising should trigger backwash review.</w:t></w:r>
    </w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Parameter</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Limit</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>TMP</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>High trend</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
    <w:sectPr/>
  </w:body>
</w:document>
"""


STRUCTURED_DOCUMENT_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>目次</w:t></w:r></w:p>
    <w:p><w:r><w:t>前言III</w:t></w:r></w:p>
    <w:p><w:r><w:t>1 范围4</w:t></w:r></w:p>
    <w:p><w:r><w:t>2 规范性引用文件4</w:t></w:r></w:p>
    <w:p><w:r><w:t>1 范围</w:t></w:r></w:p>
    <w:p><w:r><w:t>本文件规定了城镇污水处理厂绿色设计的基本要求。</w:t></w:r></w:p>
    <w:sdt>
      <w:sdtContent>
        <w:p><w:r><w:t>2</w:t><w:tab/><w:t>规范性引用文件</w:t></w:r></w:p>
        <w:p><w:r><w:t>下列文件中的内容通过文中的规范性引用而构成本文件必不可少的条款。</w:t></w:r></w:p>
      </w:sdtContent>
    </w:sdt>
    <w:p><w:r><w:t>4 一般规定</w:t></w:r></w:p>
    <w:p><w:r><w:t>4.1</w:t><w:tab/><w:t>总体要求</w:t></w:r></w:p>
    <w:p><w:r><w:t>4.1.1 绿色设计应遵循安全可靠、节约资源的原则。</w:t></w:r></w:p>
    <w:p><w:r><w:t>4.2 厂址选择</w:t></w:r></w:p>
    <w:p><w:r><w:t>厂址选择应结合区域规划和环境条件。</w:t></w:r></w:p>
    <w:sectPr/>
  </w:body>
</w:document>
"""


STYLE_NUMBERED_DOCUMENT_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="107"/></w:pPr>
      <w:r><w:t>范围</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t>本文件适用于新建污水处理厂。</w:t></w:r></w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="107"/></w:pPr>
      <w:r><w:t>规范性引用文件</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t>下列文件构成本文件的引用条款。</w:t></w:r></w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="107"/></w:pPr>
      <w:r><w:t>一般规定</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="108"/></w:pPr>
      <w:r><w:t>总体要求</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="168"/></w:pPr>
      <w:r><w:t>设计应遵循安全可靠的原则。</w:t></w:r>
    </w:p>
    <w:sectPr/>
  </w:body>
</w:document>
"""


STYLES_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="107">
    <w:name w:val="标准文件_章标题"/>
    <w:pPr><w:outlineLvl w:val="0"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="108">
    <w:name w:val="标准文件_一级条标题"/>
    <w:pPr><w:outlineLvl w:val="1"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="68">
    <w:name w:val="标准文件_二级条标题"/>
    <w:pPr><w:outlineLvl w:val="2"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="168">
    <w:name w:val="标准文件_二级无标题"/>
    <w:basedOn w:val="68"/>
    <w:pPr><w:outlineLvl w:val="9"/></w:pPr>
  </w:style>
</w:styles>
"""


NUMBERING_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="27">
    <w:lvl w:ilvl="1"><w:pStyle w:val="107"/><w:lvlText w:val="%1"/></w:lvl>
    <w:lvl w:ilvl="2"><w:pStyle w:val="108"/><w:lvlText w:val="%1.%2"/></w:lvl>
    <w:lvl w:ilvl="3"><w:pStyle w:val="68"/><w:lvlText w:val="%1.%2.%3"/></w:lvl>
  </w:abstractNum>
</w:numbering>
"""


class RagCleaningTest(unittest.TestCase):
    def test_clean_docx_creates_pending_review_blocks(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            docx_path = Path(temp_dir) / "source.docx"
            _write_docx(docx_path)

            blocks = KnowledgeCleaningPipeline().clean_docx(
                docx_path,
                source="uf-manual",
                agent_scope=["uf"],
                process_areas=["ultrafiltration", "reverse_osmosis"],
                device_ids=["uf-01"],
                incident_types=["tmp_rising", "membrane_fouling"],
                safety_level="review_required",
                effective_time="2026-07-06",
            )

            self.assertEqual(len(blocks), 3)
            self.assertTrue(all(block.status == "pending_review" for block in blocks))
            self.assertEqual(blocks[0].section_path, ["UF Operation"])
            self.assertEqual(blocks[0].metadata.source, "uf-manual")
            self.assertEqual(blocks[0].metadata.agent_scope, ["uf"])
            self.assertEqual(blocks[0].metadata.process_areas, ["ultrafiltration", "reverse_osmosis"])
            self.assertEqual(blocks[0].metadata.device_ids, ["uf-01"])
            self.assertEqual(blocks[0].metadata.incident_types, ["tmp_rising", "membrane_fouling"])
            self.assertEqual(blocks[0].metadata.safety_level, "review_required")
            self.assertEqual(blocks[0].metadata.effective_time, "2026-07-06")
            self.assertEqual(blocks[1].metadata.extra["block_kind"], "table_row")

    def test_write_pending_blocks_json(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            docx_path = Path(temp_dir) / "source.docx"
            output_path = Path(temp_dir) / "pending.json"
            _write_docx(docx_path)
            blocks = KnowledgeCleaningPipeline().clean_docx(docx_path, source="source.docx")

            summary = write_pending_blocks_json(
                blocks,
                output_path,
                source="source.docx",
                input_path=docx_path,
            )

            payload = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(summary.block_count, 3)
            self.assertEqual(payload["status"], "pending_review")
            self.assertEqual(payload["block_count"], 3)
            self.assertEqual(payload["blocks"][0]["metadata"]["knowledge_type"], "process_doc")

    def test_clean_docx_handles_sdt_numbered_headings_and_toc(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            docx_path = Path(temp_dir) / "standard.docx"
            _write_docx(docx_path, STRUCTURED_DOCUMENT_XML)

            blocks = KnowledgeCleaningPipeline().clean_docx(docx_path, source="standard")

            self.assertEqual([block.text for block in blocks], [
                "本文件规定了城镇污水处理厂绿色设计的基本要求。",
                "下列文件中的内容通过文中的规范性引用而构成本文件必不可少的条款。",
                "4.1.1 绿色设计应遵循安全可靠、节约资源的原则。",
                "厂址选择应结合区域规划和环境条件。",
            ])
            self.assertEqual(blocks[0].section_path, ["1 范围"])
            self.assertEqual(blocks[1].section_path, ["2 规范性引用文件"])
            self.assertEqual(blocks[2].section_path, ["4 一般规定", "4.1 总体要求"])
            self.assertEqual(blocks[3].section_path, ["4 一般规定", "4.2 厂址选择"])

    def test_clean_docx_uses_custom_style_outline_levels(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            docx_path = Path(temp_dir) / "styled-standard.docx"
            _write_docx(docx_path, STYLE_NUMBERED_DOCUMENT_XML, STYLES_XML, NUMBERING_XML)

            blocks = KnowledgeCleaningPipeline().clean_docx(docx_path, source="styled-standard")

            self.assertEqual([block.text for block in blocks], [
                "本文件适用于新建污水处理厂。",
                "下列文件构成本文件的引用条款。",
                "3.1.1 设计应遵循安全可靠的原则。",
            ])
            self.assertEqual(blocks[0].section_path, ["1 范围"])
            self.assertEqual(blocks[1].section_path, ["2 规范性引用文件"])
            self.assertEqual(blocks[2].section_path, ["3 一般规定", "3.1 总体要求"])

    def test_clean_docx_rejects_word_temporary_lock_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            docx_path = Path(temp_dir) / "~$source.docx"
            _write_docx(docx_path)

            with self.assertRaisesRegex(ValueError, "temporary lock file"):
                KnowledgeCleaningPipeline().clean_docx(docx_path)


def _write_docx(
    path: Path,
    document_xml: str = DOCUMENT_XML,
    styles_xml: str | None = None,
    numbering_xml: str | None = None,
) -> None:
    with ZipFile(path, "w") as archive:
        archive.writestr("word/document.xml", document_xml)
        if styles_xml is not None:
            archive.writestr("word/styles.xml", styles_xml)
        if numbering_xml is not None:
            archive.writestr("word/numbering.xml", numbering_xml)


if __name__ == "__main__":
    unittest.main()
