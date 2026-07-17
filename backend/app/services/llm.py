import os
import json
from collections.abc import AsyncGenerator

from openai import AsyncOpenAI


def _client() -> AsyncOpenAI:
    return AsyncOpenAI(
        api_key=os.getenv("LLM_API_KEY", ""),
        base_url=os.getenv("LLM_BASE_URL", "https://api.openai.com/v1"),
    )


def _model() -> str:
    return os.getenv("LLM_MODEL", "deepseek-chat")


async def stream_chat(
    *,
    messages: list[dict[str, str]],
    temperature: float = 0.7,
    max_tokens: int = 1024,
) -> AsyncGenerator[str, None]:
    stream = await _client().chat.completions.create(
        model=_model(),
        messages=messages,
        stream=True,
        temperature=temperature,
        max_tokens=max_tokens,
    )

    async for chunk in stream:
        delta = chunk.choices[0].delta if chunk.choices else None
        if delta and delta.content:
            yield json.dumps({"type": "token", "content": delta.content}, ensure_ascii=False)

    yield json.dumps({"type": "done"}, ensure_ascii=False)


async def stream_analysis(
    incident_type: str,
    phase: str,
    telemetry: dict,
) -> AsyncGenerator[str, None]:
    from ..workflows.decision_chain import stream_legacy_phase_analysis

    async for event in stream_legacy_phase_analysis(
        incident_type=incident_type,
        phase=phase,
        telemetry=telemetry,
    ):
        yield event
