from __future__ import annotations

from types import SimpleNamespace
import unittest

from app.rag.embeddings import EmbeddingProviderError, OpenAICompatibleEmbeddingProvider


class RagEmbeddingsTest(unittest.TestCase):
    def test_openai_compatible_provider_embeds_batch(self) -> None:
        client = _FakeOpenAIClient(
            vectors=[
                [0.1, 0.2, 0.3],
                [0.4, 0.5, 0.6],
            ]
        )
        provider = OpenAICompatibleEmbeddingProvider(
            api_key="test-key",
            base_url="https://example.test/v1",
            model="text-embedding-v4",
            dimension=3,
            client=client,
        )

        vectors = provider.embed_texts(["alpha", "beta"])

        self.assertEqual(vectors, [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]])
        self.assertEqual(client.last_request["model"], "text-embedding-v4")
        self.assertEqual(client.last_request["input"], ["alpha", "beta"])
        self.assertEqual(client.last_request["dimensions"], 3)

    def test_openai_compatible_provider_can_skip_dimension_request(self) -> None:
        client = _FakeOpenAIClient(vectors=[[0.1, 0.2]])
        provider = OpenAICompatibleEmbeddingProvider(
            api_key="test-key",
            base_url="https://example.test/v1",
            model="text-embedding-v4",
            dimension=2,
            request_dimension=False,
            client=client,
        )

        provider.embed_text("alpha")

        self.assertNotIn("dimensions", client.last_request)

    def test_openai_compatible_provider_returns_empty_for_empty_input(self) -> None:
        client = _FakeOpenAIClient(vectors=[])
        provider = OpenAICompatibleEmbeddingProvider(
            api_key="test-key",
            base_url="https://example.test/v1",
            dimension=2,
            client=client,
        )

        self.assertEqual(provider.embed_texts([]), [])

    def test_openai_compatible_provider_rejects_empty_text(self) -> None:
        client = _FakeOpenAIClient(vectors=[])
        provider = OpenAICompatibleEmbeddingProvider(
            api_key="test-key",
            base_url="https://example.test/v1",
            dimension=2,
            client=client,
        )

        with self.assertRaisesRegex(EmbeddingProviderError, "non-empty strings"):
            provider.embed_texts([""])

    def test_openai_compatible_provider_rejects_dimension_mismatch(self) -> None:
        client = _FakeOpenAIClient(vectors=[[0.1, 0.2]])
        provider = OpenAICompatibleEmbeddingProvider(
            api_key="test-key",
            base_url="https://example.test/v1",
            dimension=3,
            client=client,
        )

        with self.assertRaisesRegex(EmbeddingProviderError, "dimension mismatch"):
            provider.embed_text("alpha")

    def test_openai_compatible_provider_rejects_response_count_mismatch(self) -> None:
        client = _FakeOpenAIClient(vectors=[[0.1, 0.2]])
        provider = OpenAICompatibleEmbeddingProvider(
            api_key="test-key",
            base_url="https://example.test/v1",
            dimension=2,
            client=client,
        )

        with self.assertRaisesRegex(EmbeddingProviderError, "count mismatch"):
            provider.embed_texts(["alpha", "beta"])


class _FakeOpenAIClient:
    def __init__(self, *, vectors: list[list[float]]) -> None:
        self.vectors = vectors
        self.last_request: dict = {}
        self.embeddings = self

    def create(self, **kwargs):
        self.last_request = kwargs
        return SimpleNamespace(
            data=[
                SimpleNamespace(embedding=vector)
                for vector in self.vectors
            ]
        )


if __name__ == "__main__":
    unittest.main()
