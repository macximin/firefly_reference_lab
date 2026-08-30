"""Exact-ID input reader.

The model never receives a filesystem-path parameter. The host supplies a
canonical manifest and its digest through the environment, and this handler
opens only the entry selected by an opaque input ID.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import stat
import tempfile
from pathlib import PurePath


_MANIFEST_SCHEMA = "firefly-hermes-read-manifest/v1"
_RESULT_SCHEMA = "firefly-hermes-read-result/v2"
_MAX_SOURCE_BYTES = 4_500_000
_MAX_ENCODED_CONTENT_CHARS = 75_000
_MAX_RESULT_CHARS = 80_000
_SHA256 = re.compile(r"^[a-f0-9]{64}$")
_INPUT_ID = re.compile(r"^input-[0-9]{3}$")
_CURSOR = re.compile(r"^cursor-[a-f0-9]{64}$")

READ_SOURCE_SCHEMA = {
    "name": "firefly_read_source",
    "description": (
        "Read every host-attested Firefly input through a sequential cursor "
        "chain. Begin with only input-001, then make exactly one call per turn "
        "using the nextInputId and nextCursor returned by the prior result until "
        "nextCursor is null. This is the only file-reading capability in the "
        "session. It accepts no path, glob, command, offset, or write operation."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "inputId": {
                "type": "string",
                "pattern": "^input-[0-9]{3}$",
                "description": "Opaque ID supplied by the host prompt, for example input-001.",
            },
            "cursor": {
                "type": "string",
                "pattern": "^cursor-[a-f0-9]{64}$",
                "description": "Use only the exact nextCursor returned by the preceding call.",
            },
        },
        "required": ["inputId"],
        "additionalProperties": False,
    },
}


def _json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _error(message: str) -> str:
    return _json({"error": message})


def _open_absolute_no_symlinks(path: str) -> int:
    """Open an absolute regular-file candidate through no-follow dir fds."""
    logical_temp_root = os.path.abspath(tempfile.gettempdir())
    physical_temp_root = os.path.realpath(logical_temp_root)
    try:
        temp_relative = os.path.relpath(path, logical_temp_root)
    except ValueError:
        temp_relative = os.pardir
    if (
        logical_temp_root != physical_temp_root
        and temp_relative != os.pardir
        and not temp_relative.startswith(os.pardir + os.sep)
    ):
        physical_candidate = os.path.join(physical_temp_root, temp_relative)
        if os.path.realpath(path) == physical_candidate:
            path = physical_candidate
    pure = PurePath(path)
    if not pure.is_absolute() or str(pure) != path or "\x00" in path:
        raise ValueError("manifest path is not canonical absolute text")
    parts = pure.parts
    if not parts or parts[0] != os.sep or len(parts) < 2:
        raise ValueError("manifest path is not a file path")
    directory_flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_CLOEXEC", 0)
    nofollow = getattr(os, "O_NOFOLLOW", 0)
    directory_fd = os.open(os.sep, directory_flags)
    try:
        for component in parts[1:-1]:
            if component in {"", ".", ".."}:
                raise ValueError("manifest path contains an unsafe component")
            next_fd = os.open(component, directory_flags | nofollow, dir_fd=directory_fd)
            os.close(directory_fd)
            directory_fd = next_fd
        return os.open(
            parts[-1],
            os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | nofollow,
            dir_fd=directory_fd,
        )
    finally:
        os.close(directory_fd)


def _read_regular_file(path: str) -> bytes:
    fd = _open_absolute_no_symlinks(path)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode):
            raise ValueError("manifest target is not a regular file")
        chunks: list[bytes] = []
        while True:
            chunk = os.read(fd, 1024 * 1024)
            if not chunk:
                break
            chunks.append(chunk)
        after = os.fstat(fd)
        if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (
            after.st_dev,
            after.st_ino,
            after.st_size,
            after.st_mtime_ns,
        ):
            raise ValueError("manifest target changed while it was read")
        data = b"".join(chunks)
        if len(data) != before.st_size:
            raise ValueError("manifest target size changed while it was read")
        return data
    finally:
        os.close(fd)


def _exact_keys(value: object, keys: set[str], label: str) -> dict:
    if not isinstance(value, dict) or set(value) != keys:
        raise ValueError(f"{label} keys drifted")
    return value


def _load_manifest() -> tuple[dict[str, dict], str]:
    manifest_path = os.environ.get("FIREFLY_READ_MANIFEST", "")
    manifest_sha256 = os.environ.get("FIREFLY_READ_MANIFEST_SHA256", "")
    if not manifest_path or not _SHA256.fullmatch(manifest_sha256):
        raise ValueError("host manifest capability is missing")
    manifest_bytes = _read_regular_file(manifest_path)
    observed_sha256 = hashlib.sha256(manifest_bytes).hexdigest()
    if not hmac.compare_digest(observed_sha256, manifest_sha256):
        raise ValueError("host manifest digest drifted")
    try:
        manifest = json.loads(manifest_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("host manifest is not canonical UTF-8 JSON") from exc
    _exact_keys(manifest, {"schemaVersion", "inputs"}, "manifest")
    if manifest["schemaVersion"] != _MANIFEST_SCHEMA or not isinstance(manifest["inputs"], list):
        raise ValueError("host manifest schema drifted")
    entries: dict[str, dict] = {}
    expected_ids = [f"input-{index:03d}" for index in range(1, len(manifest["inputs"]) + 1)]
    for index, raw_entry in enumerate(manifest["inputs"]):
        entry = _exact_keys(raw_entry, {"inputId", "path", "sha256", "sizeBytes"}, f"manifest input {index}")
        input_id = entry["inputId"]
        if (
            not isinstance(input_id, str)
            or not _INPUT_ID.fullmatch(input_id)
            or input_id != expected_ids[index]
            or input_id in entries
            or not isinstance(entry["path"], str)
            or not isinstance(entry["sha256"], str)
            or not _SHA256.fullmatch(entry["sha256"])
            or not isinstance(entry["sizeBytes"], int)
            or isinstance(entry["sizeBytes"], bool)
            or entry["sizeBytes"] < 0
        ):
            raise ValueError("host manifest input binding drifted")
        entries[input_id] = entry
    if not entries:
        raise ValueError("host manifest has no inputs")
    return entries, manifest_sha256


def _split_content(content: str) -> list[str]:
    """Split text so each encoded JSON content string stays safely inline."""
    if content == "":
        return [""]
    chunks: list[str] = []
    start = 0
    while start < len(content):
        low = start + 1
        high = min(len(content), start + _MAX_ENCODED_CONTENT_CHARS)
        best = start
        while low <= high:
            middle = (low + high) // 2
            encoded_chars = len(_json(content[start:middle]))
            if encoded_chars <= _MAX_ENCODED_CONTENT_CHARS:
                best = middle
                low = middle + 1
            else:
                high = middle - 1
        if best == start:
            raise ValueError("bound input cannot be split inside the reader result boundary")
        chunks.append(content[start:best])
        start = best
    return chunks


def _cursor(input_id: str, source_sha256: str, chunk_index: int) -> str:
    material = "\0".join((
        "firefly-hermes-read-cursor/v1",
        input_id,
        source_sha256,
        str(chunk_index),
    )).encode("utf-8")
    return "cursor-" + hashlib.sha256(material).hexdigest()


def read_source(args: dict, **_kwargs) -> str:
    """Return one inline chunk from the exact bound UTF-8 cursor chain."""
    try:
        if not isinstance(args, dict) or set(args) not in ({"inputId"}, {"inputId", "cursor"}):
            raise ValueError("tool arguments keys drifted")
        input_id = args["inputId"]
        if not isinstance(input_id, str) or not _INPUT_ID.fullmatch(input_id):
            raise ValueError("inputId is invalid")
        entries, _manifest_sha256 = _load_manifest()
        entry = entries.get(input_id)
        if entry is None:
            raise ValueError("inputId is not authorized")
        cursor = args.get("cursor")
        if cursor is None and input_id != "input-001":
            raise ValueError("the cursor chain must begin with input-001")
        if cursor is not None and (not isinstance(cursor, str) or not _CURSOR.fullmatch(cursor)):
            raise ValueError("cursor is invalid")
        data = _read_regular_file(entry["path"])
        if len(data) > _MAX_SOURCE_BYTES:
            raise ValueError("bound input exceeds the exact-reader source boundary")
        observed_sha256 = hashlib.sha256(data).hexdigest()
        if len(data) != entry["sizeBytes"] or not hmac.compare_digest(observed_sha256, entry["sha256"]):
            raise ValueError("bound input bytes drifted")
        try:
            content = data.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ValueError("bound input is not UTF-8") from exc
        chunks = _split_content(content)
        if cursor is None:
            chunk_index = 0
        else:
            matches = [
                index for index in range(len(chunks))
                if hmac.compare_digest(cursor, _cursor(input_id, observed_sha256, index))
            ]
            if len(matches) != 1:
                raise ValueError("cursor is not authorized for this input")
            chunk_index = matches[0]
        input_ids = list(entries)
        input_index = input_ids.index(input_id)
        if chunk_index + 1 < len(chunks):
            next_input_id = input_id
            next_cursor = _cursor(input_id, observed_sha256, chunk_index + 1)
        elif input_index + 1 < len(input_ids):
            next_input_id = input_ids[input_index + 1]
            next_cursor = _cursor(next_input_id, entries[next_input_id]["sha256"], 0)
        else:
            next_input_id = None
            next_cursor = None
        chunk = chunks[chunk_index]
        result = _json({
            "schemaVersion": _RESULT_SCHEMA,
            "inputId": input_id,
            "sha256": observed_sha256,
            "sizeBytes": len(data),
            "chunkIndex": chunk_index,
            "chunkCount": len(chunks),
            "chunkSha256": hashlib.sha256(chunk.encode("utf-8")).hexdigest(),
            "nextInputId": next_input_id,
            "nextCursor": next_cursor,
            "content": chunk,
        })
        if len(result) > _MAX_RESULT_CHARS:
            raise ValueError("bound input exceeds the exact-reader result boundary")
        return result
    except Exception as exc:  # Hermes handlers return structured errors.
        return _error(str(exc))
