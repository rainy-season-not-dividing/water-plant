from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

from app.rag.wiki_publish_ledger import (
    default_wiki_publish_ledger_path,
    file_sha1,
    ledger_entry_is_current,
    load_wiki_publish_ledger,
    normalize_wiki_document_path,
    save_wiki_publish_ledger,
)


class RagWikiPublishLedgerTest(unittest.TestCase):
    def test_missing_ledger_loads_empty_documents(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            ledger = load_wiki_publish_ledger(Path(temp_dir) / "wiki" / ".qdrant_published.json")

        self.assertEqual(ledger["version"], 1)
        self.assertEqual(ledger["documents"], {})

    def test_save_and_load_ledger_preserves_unicode_document_paths(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "wiki" / ".qdrant_published.json"
            ledger = {
                "version": 1,
                "documents": {
                    "wiki/RO处置顺序.md": {
                        "status": "published",
                        "file_sha1": "abc",
                    }
                },
            }

            save_wiki_publish_ledger(path, ledger)
            loaded = load_wiki_publish_ledger(path)

        self.assertIn("wiki/RO处置顺序.md", loaded["documents"])

    def test_file_sha1_changes_when_document_content_changes(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "wiki.md"
            path.write_text("alpha", encoding="utf-8")
            first = file_sha1(path)
            path.write_text("beta", encoding="utf-8")

            self.assertNotEqual(first, file_sha1(path))

    def test_normalize_wiki_document_path_accepts_common_forms(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)

            self.assertEqual(normalize_wiki_document_path("RO处置顺序.md", wikidb_root=root), "wiki/RO处置顺序.md")
            self.assertEqual(normalize_wiki_document_path("wiki/UF处置顺序.md", wikidb_root=root), "wiki/UF处置顺序.md")

    def test_ledger_entry_current_requires_same_file_and_embedding_config(self) -> None:
        entry = {
            "file_sha1": "abc",
            "collection": "water_plant_rag_dev",
            "embedding_model": "text-embedding-v4",
            "vector_dimension": 1024,
        }

        self.assertTrue(
            ledger_entry_is_current(
                entry,
                file_digest="abc",
                collection="water_plant_rag_dev",
                embedding_model="text-embedding-v4",
                vector_dimension=1024,
            )
        )
        self.assertFalse(
            ledger_entry_is_current(
                entry,
                file_digest="changed",
                collection="water_plant_rag_dev",
                embedding_model="text-embedding-v4",
                vector_dimension=1024,
            )
        )

    def test_default_ledger_path_lives_under_wiki_dir(self) -> None:
        root = Path("wikidb") / "wikidb"

        self.assertEqual(default_wiki_publish_ledger_path(root), root / "wiki" / ".qdrant_published.json")


if __name__ == "__main__":
    unittest.main()
