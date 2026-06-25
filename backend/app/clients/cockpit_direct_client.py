from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


class CockpitDirectClientError(RuntimeError):
    pass


@dataclass
class _SessionState:
    session_id: str = ""
    expires_at: datetime | None = None


class CockpitDirectClient:
    def __init__(self) -> None:
        self._api_base = os.getenv("COCKPIT_DIRECT_API_BASE_URL", "http://144.48.65.131:8080/vpad").strip().rstrip("/")
        self._api_path_prefix = os.getenv("COCKPIT_DIRECT_API_PATH_PREFIX", "/a").strip().rstrip("/")
        self._username = os.getenv("COCKPIT_DIRECT_USERNAME", "system").strip()
        self._password = os.getenv("COCKPIT_DIRECT_PASSWORD", "admin").strip()
        self._timeout = int(os.getenv("COCKPIT_DIRECT_TIMEOUT_MS", os.getenv("EXTERNAL_DATA_TIMEOUT_MS", "10000"))) / 1000
        self._session_ttl_seconds = int(os.getenv("COCKPIT_DIRECT_SESSION_TTL_SECONDS", "1500"))
        self._session = _SessionState()
        self._lock = Lock()

    def list_factories(self) -> list[dict[str, Any]]:
        return self._get_list("/scqf/scqf/listData", {"pageNo": 1, "pageSize": 100}, use_ajax_header=True)

    def list_cost_configs(self, page_size: int = 12) -> list[dict[str, Any]]:
        return self._get_list(
            "/water/waterTreatmentCostDetail/listData",
            {"pageSize": page_size, "orderBy": "cbsj desc"},
        )

    def list_ro_flow_records(self, endpoint: str, page_size: int = 16) -> list[dict[str, Any]]:
        return self._get_list(endpoint, {"pageSize": page_size, "orderBy": "cbsj desc"})

    def list_energy_records(self, page_size: int = 16) -> list[dict[str, Any]]:
        return self._get_list("/dn/dn/listData", {"pageSize": page_size, "orderBy": "cbsj desc"})

    def list_chemical_records(self, page_size: int = 16) -> list[dict[str, Any]]:
        return self._get_list("/jy1/jy1/listData", {"pageSize": page_size, "orderBy": "cbsj desc"})

    def list_messages(self, page_size: int = 50) -> list[dict[str, Any]]:
        return self._get_list("/message/messageCenter/listData", {"pageSize": page_size})

    def list_unified_temp_data(self, page_size: int = 999, page_no: int = 1) -> list[dict[str, Any]]:
        return self._get_list("/temp/tempAllData/listData", {"pageSize": page_size, "pageNo": page_no, "orderBy": "cbsj desc"})

    def fetch_all_unified_temp_data(self, page_size: int = 999, max_pages: int = 40) -> list[dict[str, Any]]:
        all_rows: list[dict[str, Any]] = []
        for page in range(1, max_pages + 1):
            rows = self.list_unified_temp_data(page_size=page_size, page_no=page)
            if not rows:
                break
            all_rows.extend(rows)
            if len(rows) < page_size:
                break
        return all_rows

    def _get_list(self, endpoint: str, params: dict[str, Any], *, use_ajax_header: bool = False) -> list[dict[str, Any]]:
        payload = self._request_json(endpoint, params, use_ajax_header=use_ajax_header)
        items = payload.get("list", [])
        if not isinstance(items, list):
            return []
        return [item for item in items if isinstance(item, dict)]

    def _request_json(self, endpoint: str, params: dict[str, Any], *, use_ajax_header: bool = False) -> dict[str, Any]:
        response = self._request_json_once(endpoint, params, use_ajax_header=use_ajax_header)
        if response.get("code") == 401:
            self._clear_session()
            response = self._request_json_once(endpoint, params, use_ajax_header=use_ajax_header)
        return response

    def _request_json_once(self, endpoint: str, params: dict[str, Any], *, use_ajax_header: bool = False) -> dict[str, Any]:
        session_id = self._ensure_session()
        query = {"__sid": session_id, "__ajax": "json", **params}
        url = f"{self._api_base}{self._api_path_prefix}{endpoint}?{urlencode(query)}"
        headers = {"Accept": "application/json"}
        if use_ajax_header:
            headers["X-Requested-With"] = "XMLHttpRequest"
        return self._open_json(url, method="GET", headers=headers)

    def _ensure_session(self) -> str:
        with self._lock:
            if self._session.session_id and self._session.expires_at and datetime.now(timezone.utc) < self._session.expires_at:
                return self._session.session_id
            session_id = self._login()
            self._session = _SessionState(
                session_id=session_id,
                expires_at=datetime.now(timezone.utc) + timedelta(seconds=self._session_ttl_seconds),
            )
            return session_id

    def _clear_session(self) -> None:
        with self._lock:
            self._session = _SessionState()

    def _login(self) -> str:
        if not self._username or not self._password:
            raise CockpitDirectClientError("Cockpit direct credentials are not configured")

        query = urlencode(
            {
                "__ajax": "json",
                "username": self._username,
                "password": self._password,
            }
        )
        url = f"{self._api_base}{self._api_path_prefix}/login?{query}"
        payload = self._open_json(url, method="POST", headers={"Accept": "application/json"})
        session_id = str(payload.get("sessionid", "")).strip()
        if not session_id or str(payload.get("result", "")).lower() != "true":
            message = str(payload.get("message", "Cockpit direct login failed"))
            raise CockpitDirectClientError(message)
        return session_id

    def _open_json(self, url: str, *, method: str, headers: dict[str, str]) -> dict[str, Any]:
        request = Request(url, method=method, headers=headers)
        try:
            with urlopen(request, timeout=self._timeout) as response:
                body = response.read().decode("utf-8", errors="replace")
        except (HTTPError, URLError, TimeoutError) as exc:
            raise CockpitDirectClientError(f"Cockpit direct request failed: {url}") from exc

        try:
            payload = json.loads(body)
        except json.JSONDecodeError as exc:
            raise CockpitDirectClientError(f"Cockpit direct response is not JSON: {url}") from exc

        if not isinstance(payload, dict):
            raise CockpitDirectClientError(f"Cockpit direct response is not an object: {url}")
        return payload


cockpit_direct_client = CockpitDirectClient()
