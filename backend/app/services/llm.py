import os
import json
from collections.abc import AsyncGenerator

from openai import AsyncOpenAI

from ..prompts import SYSTEM_PROMPT_SUPERVISOR, SYSTEM_PROMPT_AGENT, INCIDENT_CONTEXT
from ..skills.sandbox_validation import build_sandbox_messages


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
    if phase == "sandbox":
        system_prompt, user_message = build_sandbox_messages(incident_type, telemetry)
    else:
        system_prompt = SYSTEM_PROMPT_SUPERVISOR if phase == "supervisor" else SYSTEM_PROMPT_AGENT
        context = INCIDENT_CONTEXT.get(incident_type, "")
        telemetry_text = "\n".join(f"  {k}: {v}" for k, v in telemetry.items())
        user_message = f"""{context}

当前遥测数据：
{telemetry_text}

请开始分析。"""

    async for event in stream_chat(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        temperature=0.7,
        max_tokens=1024,
    ):
        yield event
