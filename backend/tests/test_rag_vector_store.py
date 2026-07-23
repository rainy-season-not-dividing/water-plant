from __future__ import annotations

import unittest

from app.rag.ingestion import PlannedEmbeddingChunk
from app.rag.qdrant_store import (
    QdrantHttpError,
    QdrantStoreError,
    QdrantVectorStore,
    qdrant_filter_from_request,
    stable_point_id,
)
from app.rag.schemas import RetrievalRequest


class RagVectorStoreTest(unittest.TestCase):
    def test_upsert_creates_collection_and_writes_payload(self) -> None:
        client = _FakeQdrantClient(collection_exists=False)
        store = QdrantVectorStore(
            url="http://qdrant.test",
            collection_name="water_plant_rag_chunks",
            vector_dimension=3,
            client=client,
        )
        chunk = _planned_chunk()

        upserted_count = store.upsert_embedding_chunks([chunk], [[0.1, 0.2, 0.3]])

        self.assertEqual(upserted_count, 1)
        self.assertEqual(client.created_collection["vectors"]["size"], 3)
        self.assertEqual(client.created_collection["vectors"]["distance"], "Cosine")
        point = client.upserted_points[0]
        self.assertEqual(point["id"], stable_point_id(chunk.id))
        self.assertEqual(point["payload"]["chunk_id"], chunk.id)
        self.assertEqual(point["payload"]["approved_block_id"], "block-1")
        self.assertEqual(point["payload"]["source_locator"], "standard.docx#block-1")
        self.assertEqual(point["payload"]["display_text"], "7.1.1 Use renewable energy first.")

    def test_upsert_rejects_vector_dimension_mismatch(self) -> None:
        client = _FakeQdrantClient(collection_exists=True)
        store = QdrantVectorStore(
            url="http://qdrant.test",
            collection_name="water_plant_rag_chunks",
            vector_dimension=3,
            client=client,
        )

        with self.assertRaisesRegex(QdrantStoreError, "vector dimension mismatch"):
            store.upsert_embedding_chunks([_planned_chunk()], [[0.1, 0.2]])

    def test_ensure_collection_rejects_existing_dimension_mismatch(self) -> None:
        client = _FakeQdrantClient(collection_exists=True, existing_vector_size=2)
        store = QdrantVectorStore(
            url="http://qdrant.test",
            collection_name="water_plant_rag_chunks",
            vector_dimension=3,
            client=client,
        )

        with self.assertRaisesRegex(QdrantStoreError, "vector size mismatch"):
            store.ensure_collection()

    def test_search_builds_filter_and_converts_results(self) -> None:
        client = _FakeQdrantClient(
            collection_exists=True,
            search_result=[
                {
                    "id": stable_point_id("chunk-1"),
                    "score": 0.91,
                    "payload": {
                        "chunk_id": "chunk-1",
                        "display_text": "Use renewable energy first.",
                        "source": "standard.docx",
                        "knowledge_type": "process_doc",
                        "agent_scope": ["supervisor"],
                        "process_areas": ["energy"],
                        "device_ids": [],
                        "incident_types": [],
                    },
                }
            ],
        )
        store = QdrantVectorStore(
            url="http://qdrant.test",
            collection_name="water_plant_rag_chunks",
            vector_dimension=3,
            client=client,
        )
        request = RetrievalRequest(
            query="energy",
            agent_id="supervisor",
            top_k=3,
            process_areas=["energy"],
            knowledge_types=["process_doc"],
        )

        results = store.search(request, [0.1, 0.2, 0.3])

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].rank, 1)
        self.assertEqual(results[0].score, 0.91)
        self.assertEqual(results[0].chunk.id, "chunk-1")
        self.assertEqual(results[0].chunk.text, "Use renewable energy first.")
        self.assertEqual(results[0].chunk.metadata.source, "standard.docx")
        self.assertEqual(client.search_body["limit"], 3)
        self.assertEqual(
            client.search_body["filter"],
            {
                "must": [
                    {"key": "status", "match": {"value": "active"}},
                    {"key": "visibility", "match": {"value": "public"}},
                    {"key": "agent_scope", "match": {"value": "supervisor"}},
                    {"key": "knowledge_type", "match": {"any": ["process_doc"]}},
                    {"key": "process_areas", "match": {"any": ["energy"]}},
                ]
            },
        )

    def test_qdrant_filter_returns_empty_without_constraints(self) -> None:
        self.assertEqual(
            qdrant_filter_from_request(RetrievalRequest(query="hello")),
            {
                "must": [
                    {"key": "status", "match": {"value": "active"}},
                    {"key": "visibility", "match": {"value": "public"}},
                ]
            },
        )

    def test_qdrant_filter_allows_tenant_or_role_access(self) -> None:
        filters = qdrant_filter_from_request(
            RetrievalRequest(query="hello", tenant_id="plant-a", roles=["operator"])
        )

        self.assertEqual(filters["must"][0], {"key": "status", "match": {"value": "active"}})
        self.assertEqual(
            filters["must"][1],
            {
                "should": [
                    {"key": "visibility", "match": {"value": "public"}},
                    {"key": "acl.tenant", "match": {"value": "plant-a"}},
                    {"key": "acl.roles", "match": {"any": ["operator"]}},
                ]
            },
        )


class _FakeQdrantClient:
    def __init__(
        self,
        *,
        collection_exists: bool,
        existing_vector_size: int = 3,
        search_result: list[dict] | None = None,
    ) -> None:
        self.collection_exists = collection_exists
        self.existing_vector_size = existing_vector_size
        self.search_result = search_result or []
        self.created_collection: dict = {}
        self.upserted_points: list[dict] = []
        self.search_body: dict = {}

    def request(self, method: str, path: str, json_body: dict | None = None) -> dict:
        if method == "GET" and path == "/collections/water_plant_rag_chunks":
            if not self.collection_exists:
                raise QdrantHttpError(404, "not found")
            return {
                "result": {
                    "config": {
                        "params": {
                            "vectors": {
                                "size": self.existing_vector_size,
                                "distance": "Cosine",
                            }
                        }
                    }
                }
            }
        if method == "PUT" and path == "/collections/water_plant_rag_chunks":
            self.collection_exists = True
            self.created_collection = json_body or {}
            return {"result": True}
        if method == "PUT" and path == "/collections/water_plant_rag_chunks/index":
            return {"result": True}
        if method == "PUT" and path.startswith("/collections/water_plant_rag_chunks/points"):
            self.upserted_points.extend((json_body or {}).get("points", []))
            return {"result": {"operation_id": 1, "status": "completed"}}
        if method == "POST" and path == "/collections/water_plant_rag_chunks/points/search":
            self.search_body = json_body or {}
            return {"result": self.search_result}
        raise AssertionError(f"unexpected request: {method} {path}")


def _planned_chunk() -> PlannedEmbeddingChunk:
    return PlannedEmbeddingChunk(
        id="0123456789abcdef0123456789abcdef01234567",
        chunk_type="content_chunk",
        text_for_embedding="7 Energy / 7.1 General\n7.1.1 Use renewable energy first.",
        display_text="7.1.1 Use renewable energy first.",
        metadata={
            "approved_block_id": "block-1",
            "source": "standard.docx",
            "knowledge_type": "process_doc",
            "agent_scope": ["supervisor"],
            "process_areas": ["energy"],
            "device_ids": [],
            "incident_types": [],
            "source_version": "v1",
            "safety_level": "review_required",
            "effective_time": "2026-07-08",
            "title": "7.1 General",
            "section_path": ["7 Energy", "7.1 General"],
            "source_locator": "standard.docx#block-1",
            "block_index": 1,
            "block_kind": "paragraph",
            "reviewed_by": "alice",
            "reviewed_at": "2026-07-08T10:00:00+08:00",
            "review_mode": "approve_all",
            "review_action": "approve",
            "review_note": "",
        },
        char_count=58,
    )


if __name__ == "__main__":
    unittest.main()
