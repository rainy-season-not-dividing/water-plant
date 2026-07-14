from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(slots=True)
class WikiSourceConfig:
    root: Path
    include_index: bool = True
    include_decision_log: bool = True

    @property
    def wiki_dir(self) -> Path:
        return self.root / "wiki"

    @classmethod
    def from_path(cls, path: str | Path) -> "WikiSourceConfig":
        return cls(root=Path(path))
