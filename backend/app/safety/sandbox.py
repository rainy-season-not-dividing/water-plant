from ..prompts import INCIDENT_CONTEXT, SYSTEM_PROMPT_SANDBOX


def build_sandbox_messages(incident_type: str, telemetry: dict) -> tuple[str, str]:
    context = INCIDENT_CONTEXT.get(incident_type, "")
    telemetry_text = "\n".join(f"  {key}: {value}" for key, value in telemetry.items())
    user_message = f"""{context}

当前遥测数据：
{telemetry_text}

请基于当前异常和遥测数据，执行安全沙箱推演。"""
    return SYSTEM_PROMPT_SANDBOX, user_message
