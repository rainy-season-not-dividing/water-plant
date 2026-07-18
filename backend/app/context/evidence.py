from typing import Any


def format_rag_evidence(evidence: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for index, item in enumerate(evidence[:5], start=1):
        source = item.get("source_locator") or item.get("source") or "未知来源"
        text = " ".join(str(item.get("text") or "").split())
        if not text:
            continue
        lines.append(f"{index}. 来源：{source}\n   摘要：{text[:500]}")
    return "\n".join(lines)


__all__ = ["format_rag_evidence"]
