from __future__ import annotations

import unittest

from app.rag.elasticsearch_store import ElasticsearchChunkStore, ElasticsearchHttpError
from app.rag.manifest import ChunkManifest
from app.rag.schemas import RetrievalRequest


class RagElasticsearchStoreTest(unittest.TestCase):
    def test_upsert_creates_index_and_writes_chunk_payload(self) -> None:
        client = _FakeElasticsearchClient(index_exists=False)
        store = ElasticsearchChunkStore(url="http://es.test", index_name="water_plant_rag_chunks", client=client)
        chunk = _chunk()

        count = store.upsert_chunks([chunk])

        self.assertEqual(count, 1)
        self.assertTrue(client.index_created)
        self.assertEqual(client.indexed_documents[chunk.chunk_id]["doc_id"], "wiki/UF处置顺序.md")
        self.assertEqual(client.indexed_documents[chunk.chunk_id]["content_hash"], chunk.content_hash)
        self.assertEqual(client.indexed_documents[chunk.chunk_id]["visibility"], "public")

    def test_search_builds_bm25_query_and_converts_hits(self) -> None:
        client = _FakeElasticsearchClient(
            index_exists=True,
            search_hits=[
                {
                    "_id": "chunk-1",
                    "_score": 12.0,
                    "_source": {
                        "chunk_id": "chunk-1",
                        "display_text": "UF TMP 升高时先复核上游来水。",
                        "source": "wikidb:wiki/UF处置顺序.md",
                        "knowledge_type": "process_doc",
                        "source_locator": "wiki/UF处置顺序.md#section-1",
                        "section_path": ["UF处置顺序"],
                        "agent_scope": ["uf"],
                    },
                }
            ],
        )
        store = ElasticsearchChunkStore(url="http://es.test", index_name="water_plant_rag_chunks", client=client)

        results = store.search(RetrievalRequest(query="UF TMP", agent_id="uf", top_k=5))

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].chunk.id, "chunk-1")
        self.assertEqual(results[0].score, 12.0)
        self.assertEqual(results[0].chunk.metadata.extra["source_locator"], "wiki/UF处置顺序.md#section-1")
        filters = client.search_body["query"]["bool"]["filter"]
        self.assertIn({"term": {"status": "active"}}, filters)
        self.assertIn({"term": {"visibility": "public"}}, filters)
        self.assertIn({"term": {"agent_scope": "uf"}}, filters)

    def test_search_builds_acl_filter_for_tenant_and_roles(self) -> None:
        client = _FakeElasticsearchClient(index_exists=True)
        store = ElasticsearchChunkStore(url="http://es.test", index_name="water_plant_rag_chunks", client=client)

        store.search(RetrievalRequest(query="UF TMP", tenant_id="plant-a", roles=["operator"], top_k=5))

        filters = client.search_body["query"]["bool"]["filter"]
        self.assertIn(
            {
                "bool": {
                    "should": [
                        {"term": {"visibility": "public"}},
                        {"term": {"acl.tenant": "plant-a"}},
                        {"terms": {"acl.roles": ["operator"]}},
                    ],
                    "minimum_should_match": 1,
                }
            },
            filters,
        )


class _FakeElasticsearchClient:
    def __init__(self, *, index_exists: bool, search_hits: list[dict] | None = None) -> None:
        self.index_exists = index_exists
        self.search_hits = search_hits or []
        self.index_created = False
        self.indexed_documents: dict[str, dict] = {}
        self.search_body: dict = {}

    def request(self, method: str, path: str, json_body: dict | None = None) -> dict:
        if method == "HEAD" and path == "/water_plant_rag_chunks":
            if not self.index_exists:
                raise ElasticsearchHttpError(404, "not found")
            return {}
        if method == "PUT" and path == "/water_plant_rag_chunks":
            self.index_exists = True
            self.index_created = True
            return {"acknowledged": True}
        if method == "PUT" and path.startswith("/water_plant_rag_chunks/_doc/"):
            chunk_id = path.split("/_doc/", 1)[1].split("?", 1)[0]
            self.indexed_documents[chunk_id] = json_body or {}
            return {"result": "created"}
        if method == "POST" and path == "/water_plant_rag_chunks/_search":
            self.search_body = json_body or {}
            return {"hits": {"hits": self.search_hits}}
        raise AssertionError(f"unexpected request: {method} {path}")


def _chunk() -> ChunkManifest:
    return ChunkManifest(
        doc_id="wiki/UF处置顺序.md",
        doc_version="doc-version",
        chunk_id="chunk-1",
        chunk_index=1,
        chunk_ref="UF处置顺序#section-1",
        content="UF TMP 升高时先复核上游来水。",
        normalized_content="UF TMP 升高时先复核上游来水。",
        content_hash="content-hash",
        source_path="wiki/UF处置顺序.md",
        source_locator="wiki/UF处置顺序.md#section-1",
        title="UF处置顺序",
        heading_path=["UF处置顺序"],
        chunk_type="content_chunk",
        metadata={
            "source": "wikidb:wiki/UF处置顺序.md",
            "knowledge_type": "process_doc",
            "agent_scope": ["uf"],
        },
    )


if __name__ == "__main__":
    unittest.main()
