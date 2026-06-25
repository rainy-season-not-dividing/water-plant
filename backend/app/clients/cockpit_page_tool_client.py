from __future__ import annotations

import os
from typing import Any


class CockpitPageToolClientError(RuntimeError):
    pass


class CockpitPageToolClient:
    def __init__(self) -> None:
        self._tool_root = os.getenv(
            "COCKPIT_PAGE_TOOL_ROOT",
            r"E:\迎风聚智\softwawre\AgengRunne网页工具助手-22605251617",
        ).strip()

    def fetch_dashboard_payload(self) -> dict[str, Any]:
        raise CockpitPageToolClientError(
            f"Page tool data source is not implemented yet. Expected tool root: {self._tool_root}"
        )


cockpit_page_tool_client = CockpitPageToolClient()
