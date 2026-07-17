def build_effect_writeback_placeholder(run_id: str) -> dict:
    return {
        "runId": run_id,
        "status": "pending_human_confirmation",
    }
