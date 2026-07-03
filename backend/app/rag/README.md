# RAG

This package is the future knowledge foundation for the water plant Agent runtime.

Current scope:

- Define stable RAG data structures and interfaces.
- Reserve boundaries for ingestion, chunking, embedding, retrieval, and Agent-facing service calls.
- Stay inert until vector storage, embedding provider, and Agent tools are explicitly wired.

Planned flow:

```text
documents / logs / rules
  -> ingestion
  -> chunker
  -> embeddings
  -> vector store

agents / workflows
  -> RAG service
  -> retriever
  -> vector store
  -> context for LLM / safety checks / human confirmation
```
