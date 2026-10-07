"""Append-only audit trail for the agent loop.

Every iteration of every run is written to `output/audit_trail.json` as one JSON
object per line (JSON Lines). The file is opened in append mode and never read,
rewritten or truncated, so:

  * a crash halfway through a write loses at most the line being written, not
    the history,
  * two requests writing at once cannot interleave into a corrupt array, and
  * the trail from earlier runs survives a restart, a redeploy, and this file
    being edited.

A single JSON array would need to be parsed and rewritten on every append, which
is neither append-only nor crash-safe. The extension stays `.json` because that
is what the assignment asks for; each line is valid JSON on its own.
"""

from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

AUDIT_PATH = Path(__file__).resolve().parent.parent / "output" / "audit_trail.json"

# Enough of an argument or result to see what happened, not so much that the
# catalogue ends up in the log.
PREVIEW_CHARS = 200

# Appends are short, but two chat requests can land at once and a half-written
# line would be unparseable.
_lock = threading.Lock()


def preview(value: Any, limit: int = PREVIEW_CHARS) -> str:
    """A short, readable stand-in for an argument or a tool result."""
    if value is None:
        return ""
    if isinstance(value, str):
        text = value
    else:
        try:
            text = json.dumps(value, default=str, ensure_ascii=False)
        except (TypeError, ValueError):
            text = str(value)
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def append(entry: dict[str, Any]) -> None:
    """Write one record. Never raises - an audit failure must not break a reply."""
    try:
        AUDIT_PATH.parent.mkdir(parents=True, exist_ok=True)
        line = json.dumps(entry, default=str, ensure_ascii=False)
        with _lock:
            with AUDIT_PATH.open("a", encoding="utf-8") as handle:
                handle.write(line + "\n")
    except Exception:  # noqa: BLE001 - logging must not take the request down
        pass


def entry(
    run_id: str,
    ability: str,
    iteration: int,
    model_name: str,
    tool_calls: list[dict[str, Any]],
    stop_reason: str,
    thoughts: str | None = None,
    inputs: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "time": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "run_id": run_id,
        "ability": ability,
        "iteration": iteration,
        "model": model_name,
        "inputs": inputs or {},
        "thoughts": preview(thoughts) if thoughts else None,
        "tool_calls": tool_calls,
        "stop_reason": stop_reason,
    }
