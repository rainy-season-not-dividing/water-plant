from __future__ import annotations

import json
import os
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen


class ExternalDataClientError(RuntimeError):
    pass


class ExternalDataClient:
    def __init__(self) -> None:
        self._base_url = os.getenv("EXTERNAL_DATA_BASE_URL", "").strip()
        self._timeout = int(os.getenv("EXTERNAL_DATA_TIMEOUT_MS", "5000")) / 1000

    def get_json(self, path: str) -> dict | list:
        if not self._base_url:
            raise ExternalDataClientError("EXTERNAL_DATA_BASE_URL is not configured")

        url = urljoin(self._base_url.rstrip("/") + "/", path.lstrip("/"))
        request = Request(url, headers={"Accept": "application/json"})

        try:
            with urlopen(request, timeout=self._timeout) as response:
                body = response.read().decode("utf-8")
        except (HTTPError, URLError, TimeoutError) as exc:
            raise ExternalDataClientError(f"External data request failed: {url}") from exc

        try:
            return json.loads(body)
        except json.JSONDecodeError as exc:
            raise ExternalDataClientError(f"External data response is not JSON: {url}") from exc


external_data_client = ExternalDataClient()
