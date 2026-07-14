from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path

from .config import WikiSourceConfig


class WikiMarkdownReader:
    def __init__(self, config: WikiSourceConfig) -> None:
        self.config = config

    def iter_markdown_files(self) -> Iterable[Path]:
        wiki_dir = self.config.wiki_dir
        if not wiki_dir.exists():
            return []

        files = []
        for path in wiki_dir.rglob("*.md"):
            if not path.is_file():
                continue
            name = path.name.lower()
            if name == "index.md" and not self.config.include_index:
                continue
            if path.stem == "决策日志" and not self.config.include_decision_log:
                continue
            files.append(path)
        return sorted(files)

    def read_text(self, path: Path) -> str:
        return path.read_text(encoding="utf-8")
