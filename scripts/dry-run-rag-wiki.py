from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = PROJECT_ROOT / "backend"
DEFAULT_WIKIDB_ROOT = PROJECT_ROOT.parent / "wikidb" / "wikidb"
sys.path.insert(0, str(BACKEND_ROOT))

from app.rag.ingestion import dry_run_approved_payload
from app.rag.sources.wiki.config import WikiSourceConfig
from app.rag.sources.wiki.extractor import WikiMarkdownExtractor


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Preview approved RAG chunks generated from wikidb/wiki Markdown.")
    parser.add_argument(
        "--wikidb-root",
        type=Path,
        default=DEFAULT_WIKIDB_ROOT,
        help=f"Path to wikidb root. Defaults to {DEFAULT_WIKIDB_ROOT}.",
    )
    parser.add_argument("--output", type=Path, help="Optional path to write the approved payload JSON.")
    parser.add_argument("--json", action="store_true", help="Print summary as JSON.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    config = WikiSourceConfig.from_path(args.wikidb_root)
    payload = WikiMarkdownExtractor(config=config).approved_payload()
    chunks, report = dry_run_approved_payload(payload)
    summary = {
        "wikidb_root": str(args.wikidb_root),
        "wiki_dir": str(config.wiki_dir),
        "approved_block_count": payload["block_count"],
        "planned_chunk_count": len(chunks),
        "report": report.to_dict(),
    }

    if args.output is not None:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        summary["output"] = str(args.output)

    if args.json:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    else:
        print("RAG wiki dry-run")
        print(f"wikidb_root: {summary['wikidb_root']}")
        print(f"wiki_dir: {summary['wiki_dir']}")
        print(f"approved_block_count: {summary['approved_block_count']}")
        print(f"planned_chunk_count: {summary['planned_chunk_count']}")
        if args.output is not None:
            print(f"output: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
