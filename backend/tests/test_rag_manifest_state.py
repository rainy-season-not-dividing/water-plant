from __future__ import annotations

from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from app.rag.manifest import build_wiki_document_manifests, default_acl_config
from app.rag.sources.wiki.config import WikiSourceConfig
from app.rag.state_store import SqliteRagIndexStateStore


class RagManifestStateTest(unittest.TestCase):
    def test_wiki_manifest_builds_stable_document_and_chunk_fields(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            wiki_dir = root / "wiki"
            wiki_dir.mkdir()
            (wiki_dir / "UF处置顺序.md").write_text(
                """---
tags: [超滤, uf_clogging]
date: 2026-07-18
---
## TMP 升高
UF TMP 升高时，应先复核上游来水。
""",
                encoding="utf-8",
            )

            documents = build_wiki_document_manifests(WikiSourceConfig.from_path(root))

        document = documents["wiki/UF处置顺序.md"]
        self.assertEqual(document.doc_id, "wiki/UF处置顺序.md")
        self.assertEqual(len(document.doc_version), 40)
        self.assertEqual(len(document.chunks), 1)
        chunk = document.chunks[0]
        self.assertEqual(chunk.doc_id, document.doc_id)
        self.assertEqual(chunk.doc_version, document.doc_version)
        self.assertEqual(len(chunk.chunk_id), 40)
        self.assertEqual(chunk.status, "active")
        self.assertEqual(chunk.visibility, "public")
        self.assertEqual(chunk.heading_path, ["UF处置顺序", "TMP 升高"])
        self.assertIn("doc_id", chunk.to_payload())
        self.assertIn("content_hash", chunk.to_payload())

    def test_wiki_manifest_uses_default_acl_environment(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            wiki_dir = root / "wiki"
            wiki_dir.mkdir()
            (wiki_dir / "权限边界.md").write_text("只允许运行员查看。", encoding="utf-8")
            with patch.dict(
                "os.environ",
                {
                    "RAG_DEFAULT_VISIBILITY": "internal",
                    "RAG_DEFAULT_TENANT": "plant-a",
                    "RAG_DEFAULT_ROLES": "operator, supervisor",
                },
                clear=False,
            ):
                documents = build_wiki_document_manifests(WikiSourceConfig.from_path(root))
                acl = default_acl_config()

        chunk = documents["wiki/权限边界.md"].chunks[0]
        self.assertEqual(acl["roles"], ["operator", "supervisor"])
        self.assertEqual(chunk.visibility, "internal")
        self.assertEqual(chunk.acl, {"roles": ["operator", "supervisor"], "tenant": "plant-a"})

    def test_sqlite_state_store_tracks_documents_and_chunks(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            wiki_dir = root / "wiki"
            wiki_dir.mkdir()
            (wiki_dir / "加药分域.md").write_text("加药异常必须区分 UF 和 RO。", encoding="utf-8")
            document = build_wiki_document_manifests(WikiSourceConfig.from_path(root))["wiki/加药分域.md"]
            store = SqliteRagIndexStateStore(Path(temp_dir) / "state.sqlite")

            store.init_schema()
            store.upsert_document(document, seen_at="2026-07-23T10:00:00+08:00", indexed_at="2026-07-23T10:00:00+08:00")
            store.replace_document_chunks(document)
            loaded = store.load_documents()
            loaded_chunks = store.load_chunks()
            store.mark_document_deleted(document.doc_id, seen_at="2026-07-23T10:05:00+08:00")
            deleted = store.load_documents()

        self.assertEqual(loaded[document.doc_id].doc_version, document.doc_version)
        self.assertEqual(loaded_chunks[document.chunks[0].chunk_id].content_hash, document.chunks[0].content_hash)
        self.assertEqual(deleted[document.doc_id].status, "deleted")


if __name__ == "__main__":
    unittest.main()
