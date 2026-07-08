from __future__ import annotations

import argparse
from copy import deepcopy
from datetime import datetime
import json
from pathlib import Path
import sys
from typing import Any, Callable
from zoneinfo import ZoneInfo


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = PROJECT_ROOT / "backend"

PENDING_STATUS = "pending_review"
APPROVED_STATUS = "approved"
REJECTED_STATUS = "rejected"
PROGRESS_STATUS = "review_progress"
DEFAULT_REVIEWER = "reviewer"
LOCAL_TIMEZONE = ZoneInfo("Asia/Shanghai")

InputFunc = Callable[[str], str]
OutputFunc = Callable[[str], None]


class ReviewError(ValueError):
    """Raised when a pending review file cannot be safely reviewed."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Review pending RAG knowledge blocks and write approved/rejected JSON files."
    )
    parser.add_argument("input", type=Path, help="Path to a *.pending.json file.")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--approve-all",
        action="store_true",
        help="Approve every pending block and write an approved JSON file.",
    )
    mode.add_argument(
        "--interactive",
        action="store_true",
        help="Review blocks one by one in the terminal.",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Approved output path. Defaults to backend/data/rag_approved/<name>.approved.json.",
    )
    parser.add_argument("--reviewer", default=DEFAULT_REVIEWER, help="Reviewer name stored in review metadata.")
    parser.add_argument("--note", default="", help="Review note stored in review metadata.")
    parser.add_argument("--force", action="store_true", help="Overwrite existing output files.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        if args.approve_all:
            result = approve_all_pending_file(
                args.input,
                output_path=args.output,
                reviewer=args.reviewer,
                note=args.note,
                force=args.force,
            )
            print(f"Wrote {result['approved_count']} approved blocks to {result['approved_path']}")
            return 0

        result = review_pending_file_interactive(
            args.input,
            approved_output_path=args.output,
            reviewer=args.reviewer,
            note=args.note,
            force=args.force,
        )
        print(f"Wrote {result['approved_count']} approved blocks to {result['approved_path']}")
        print(f"Wrote {result['rejected_count']} rejected blocks to {result['rejected_path']}")
        print(f"Wrote {result['progress_count']} pending/skipped blocks to {result['progress_path']}")
        return 0
    except ReviewError as exc:
        print(f"Review failed: {exc}", file=sys.stderr)
        return 2


def approve_all_pending_file(
    input_path: str | Path,
    *,
    output_path: str | Path | None = None,
    reviewer: str = DEFAULT_REVIEWER,
    note: str = "",
    force: bool = False,
    reviewed_at: str | None = None,
) -> dict[str, Any]:
    source_path = Path(input_path)
    payload = _read_json(source_path)
    approved_path = Path(output_path) if output_path is not None else default_approved_path(source_path)
    reviewed_at = reviewed_at or _reviewed_at_now()

    approved_payload = approve_all_payload(
        payload,
        reviewer=reviewer,
        note=note,
        reviewed_at=reviewed_at,
    )
    _write_json(approved_path, approved_payload, force=force)
    return {
        "approved_path": str(approved_path),
        "approved_count": approved_payload["review_summary"]["approved_count"],
    }


def review_pending_file_interactive(
    input_path: str | Path,
    *,
    approved_output_path: str | Path | None = None,
    rejected_output_path: str | Path | None = None,
    progress_output_path: str | Path | None = None,
    reviewer: str = DEFAULT_REVIEWER,
    note: str = "",
    force: bool = False,
    reviewed_at: str | None = None,
    input_func: InputFunc = input,
    output_func: OutputFunc = print,
) -> dict[str, Any]:
    source_path = Path(input_path)
    payload = _read_json(source_path)
    approved_path = Path(approved_output_path) if approved_output_path is not None else default_approved_path(source_path)
    rejected_path = Path(rejected_output_path) if rejected_output_path is not None else default_rejected_path(source_path)
    progress_path = Path(progress_output_path) if progress_output_path is not None else default_progress_path(source_path)
    _ensure_can_write([approved_path, rejected_path, progress_path], force=force)

    reviewed_at = reviewed_at or _reviewed_at_now()
    result = run_interactive_review(
        payload,
        reviewer=reviewer,
        note=note,
        reviewed_at=reviewed_at,
        input_func=input_func,
        output_func=output_func,
    )
    _write_json(approved_path, result["approved_payload"], force=force, checked=True)
    _write_json(rejected_path, result["rejected_payload"], force=force, checked=True)
    _write_json(progress_path, result["progress_payload"], force=force, checked=True)
    return {
        "approved_path": str(approved_path),
        "rejected_path": str(rejected_path),
        "progress_path": str(progress_path),
        "approved_count": result["summary"]["approved_count"],
        "rejected_count": result["summary"]["rejected_count"],
        "progress_count": len(result["progress_payload"]["blocks"]),
    }


def approve_all_payload(
    payload: dict[str, Any],
    *,
    reviewer: str = DEFAULT_REVIEWER,
    note: str = "",
    reviewed_at: str | None = None,
) -> dict[str, Any]:
    validate_pending_payload(payload)
    reviewed_at = reviewed_at or _reviewed_at_now()
    approved_blocks: list[dict[str, Any]] = []
    for block in payload["blocks"]:
        approved_block = deepcopy(block)
        _apply_review_record(
            approved_block,
            status=APPROVED_STATUS,
            reviewer=reviewer,
            reviewed_at=reviewed_at,
            mode="approve_all",
            action="approve",
            note=note,
        )
        approved_blocks.append(approved_block)

    summary = _review_summary(
        mode="approve_all",
        reviewer=reviewer,
        reviewed_at=reviewed_at,
        approved_count=len(approved_blocks),
        rejected_count=0,
        edited_count=0,
        skipped_count=0,
        note=note,
    )
    return _build_review_payload(payload, status=APPROVED_STATUS, blocks=approved_blocks, summary=summary)


def run_interactive_review(
    payload: dict[str, Any],
    *,
    reviewer: str = DEFAULT_REVIEWER,
    note: str = "",
    reviewed_at: str | None = None,
    input_func: InputFunc = input,
    output_func: OutputFunc = print,
) -> dict[str, Any]:
    validate_pending_payload(payload)
    reviewed_at = reviewed_at or _reviewed_at_now()
    blocks = deepcopy(payload["blocks"])
    block_notes: dict[int, str] = {}
    index = 0

    while 0 <= index < len(blocks):
        block = blocks[index]
        _display_block(block, index=index, total=len(blocks), output_func=output_func)
        command = input_func("Action [a/r/e/n/s/b/q]: ").strip().lower()
        if command == "a":
            _apply_review_record(
                block,
                status=APPROVED_STATUS,
                reviewer=reviewer,
                reviewed_at=reviewed_at,
                mode="interactive",
                action="approve",
                note=_combined_note(note, block_notes.get(index, "")),
            )
            index += 1
        elif command == "r":
            _apply_review_record(
                block,
                status=REJECTED_STATUS,
                reviewer=reviewer,
                reviewed_at=reviewed_at,
                mode="interactive",
                action="reject",
                note=_combined_note(note, block_notes.get(index, "")),
            )
            index += 1
        elif command == "e":
            new_text = input_func("New text: ").strip()
            if not new_text:
                output_func("Text was empty; staying on this block.")
                continue
            original_text = str(block.get("text", ""))
            block["text"] = new_text
            block["char_count"] = len(new_text)
            _apply_review_record(
                block,
                status=APPROVED_STATUS,
                reviewer=reviewer,
                reviewed_at=reviewed_at,
                mode="interactive",
                action="edit",
                note=_combined_note(note, block_notes.get(index, "")),
                edited=True,
                original_text=original_text,
            )
            index += 1
        elif command == "n":
            block_notes[index] = input_func("Review note: ").strip()
        elif command == "s":
            _apply_review_record(
                block,
                status=PENDING_STATUS,
                reviewer=reviewer,
                reviewed_at=reviewed_at,
                mode="interactive",
                action="skip",
                note=_combined_note(note, block_notes.get(index, "")),
            )
            index += 1
        elif command == "b":
            index = max(0, index - 1)
        elif command == "q":
            break
        else:
            output_func("Unknown command. Use a/r/e/n/s/b/q.")

    approved_blocks = [block for block in blocks if block.get("status") == APPROVED_STATUS]
    rejected_blocks = [block for block in blocks if block.get("status") == REJECTED_STATUS]
    progress_blocks = [
        block
        for block in blocks
        if block.get("status") not in {APPROVED_STATUS, REJECTED_STATUS}
    ]
    edited_count = sum(1 for block in approved_blocks if _block_extra(block).get("review_edited") is True)
    skipped_count = sum(1 for block in progress_blocks if _block_extra(block).get("review_action") == "skip")
    summary = _review_summary(
        mode="interactive",
        reviewer=reviewer,
        reviewed_at=reviewed_at,
        approved_count=len(approved_blocks),
        rejected_count=len(rejected_blocks),
        edited_count=edited_count,
        skipped_count=skipped_count,
        note=note,
    )
    return {
        "summary": summary,
        "approved_payload": _build_review_payload(
            payload,
            status=APPROVED_STATUS,
            blocks=approved_blocks,
            summary=summary,
        ),
        "rejected_payload": _build_review_payload(
            payload,
            status=REJECTED_STATUS,
            blocks=rejected_blocks,
            summary=summary,
        ),
        "progress_payload": _build_review_payload(
            payload,
            status=PROGRESS_STATUS,
            blocks=progress_blocks,
            summary=summary,
        ),
    }


def validate_pending_payload(payload: dict[str, Any]) -> None:
    if not isinstance(payload, dict):
        raise ReviewError("input JSON must be an object")
    if payload.get("status") != PENDING_STATUS:
        raise ReviewError(f"top-level status must be {PENDING_STATUS!r}")
    if "blocks" not in payload:
        raise ReviewError("input JSON must contain blocks")
    blocks = payload["blocks"]
    if not isinstance(blocks, list):
        raise ReviewError("blocks must be a list")
    for index, block in enumerate(blocks, start=1):
        if not isinstance(block, dict):
            raise ReviewError(f"block {index} must be an object")
        if block.get("status") != PENDING_STATUS:
            raise ReviewError(f"block {index} status must be {PENDING_STATUS!r}")


def default_approved_path(input_path: str | Path) -> Path:
    source = Path(input_path)
    return _default_output_path(source, "rag_approved", "approved")


def default_rejected_path(input_path: str | Path) -> Path:
    source = Path(input_path)
    return _default_output_path(source, "rag_rejected", "rejected")


def default_progress_path(input_path: str | Path) -> Path:
    source = Path(input_path)
    output_dir = _default_output_dir(source, "rag_review")
    return output_dir / f"{_review_base_name(source)}.review-progress.json"


def _default_output_path(source: Path, dirname: str, suffix: str) -> Path:
    output_dir = _default_output_dir(source, dirname)
    return output_dir / f"{_review_base_name(source)}.{suffix}.json"


def _default_output_dir(source: Path, dirname: str) -> Path:
    if source.parent.name == "rag_review":
        return source.parent.parent / dirname
    return BACKEND_ROOT / "data" / dirname


def _review_base_name(source: Path) -> str:
    name = source.name
    if name.endswith(".pending.json"):
        return name[: -len(".pending.json")]
    if name.endswith(".json"):
        return name[: -len(".json")]
    return source.stem


def _apply_review_record(
    block: dict[str, Any],
    *,
    status: str,
    reviewer: str,
    reviewed_at: str,
    mode: str,
    action: str,
    note: str,
    edited: bool = False,
    original_text: str | None = None,
) -> None:
    block["status"] = status
    extra = _block_extra(block)
    extra["reviewed_by"] = reviewer
    extra["reviewed_at"] = reviewed_at
    extra["review_mode"] = mode
    extra["review_action"] = action
    extra["review_note"] = note
    if edited:
        extra["review_edited"] = True
        extra["review_original_text"] = original_text or ""
    else:
        extra.pop("review_edited", None)
        extra.pop("review_original_text", None)


def _block_extra(block: dict[str, Any]) -> dict[str, Any]:
    metadata = block.setdefault("metadata", {})
    if not isinstance(metadata, dict):
        raise ReviewError("block metadata must be an object")
    extra = metadata.setdefault("extra", {})
    if not isinstance(extra, dict):
        raise ReviewError("block metadata.extra must be an object")
    return extra


def _review_summary(
    *,
    mode: str,
    reviewer: str,
    reviewed_at: str,
    approved_count: int,
    rejected_count: int,
    edited_count: int,
    skipped_count: int,
    note: str,
) -> dict[str, Any]:
    summary = {
        "mode": mode,
        "reviewer": reviewer,
        "reviewed_at": reviewed_at,
        "approved_count": approved_count,
        "rejected_count": rejected_count,
        "edited_count": edited_count,
        "skipped_count": skipped_count,
    }
    if note:
        summary["review_note"] = note
    return summary


def _build_review_payload(
    source_payload: dict[str, Any],
    *,
    status: str,
    blocks: list[dict[str, Any]],
    summary: dict[str, Any],
) -> dict[str, Any]:
    payload = {
        key: deepcopy(value)
        for key, value in source_payload.items()
        if key not in {"status", "block_count", "blocks", "review_summary"}
    }
    payload["status"] = status
    payload["block_count"] = len(blocks)
    payload["blocks"] = deepcopy(blocks)
    payload["review_summary"] = deepcopy(summary)
    return payload


def _display_block(
    block: dict[str, Any],
    *,
    index: int,
    total: int,
    output_func: OutputFunc,
) -> None:
    metadata = block.get("metadata") if isinstance(block.get("metadata"), dict) else {}
    extra = metadata.get("extra") if isinstance(metadata.get("extra"), dict) else {}
    section_path = block.get("section_path") or []
    section = " / ".join(section_path) if isinstance(section_path, list) else str(section_path)
    output_func("")
    output_func(f"[{index + 1}/{total}]")
    output_func(f"title: {block.get('title') or ''}")
    output_func(f"section_path: {section}")
    output_func(f"text: {block.get('text') or ''}")
    output_func(f"source_locator: {block.get('source_locator') or ''}")
    output_func(f"block_kind: {extra.get('block_kind') or ''}")


def _combined_note(global_note: str, block_note: str) -> str:
    if global_note and block_note:
        return f"{global_note}\n{block_note}"
    return block_note or global_note


def _read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise ReviewError(f"input file does not exist: {path}")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ReviewError(f"invalid JSON: {exc}") from exc
    if not isinstance(payload, dict):
        raise ReviewError("input JSON must be an object")
    return payload


def _write_json(path: Path, payload: dict[str, Any], *, force: bool, checked: bool = False) -> None:
    if not checked:
        _ensure_can_write([path], force=force)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _ensure_can_write(paths: list[Path], *, force: bool) -> None:
    if force:
        return
    for path in paths:
        if path.exists():
            raise ReviewError(f"output file already exists: {path} (use --force to overwrite)")


def _reviewed_at_now() -> str:
    return datetime.now(LOCAL_TIMEZONE).isoformat(timespec="seconds")


if __name__ == "__main__":
    raise SystemExit(main())
