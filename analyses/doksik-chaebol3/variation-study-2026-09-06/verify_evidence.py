#!/usr/bin/env python3
"""Read-only verification of this study's exact local source slices."""
import hashlib
import json
from pathlib import Path


def digest(data):
    return hashlib.sha256(data).hexdigest()


root = Path(__file__).resolve().parent
events_path = root / "events.json"
manifest_path = root / "source-excerpt-manifest.json"
events = json.loads(events_path.read_bytes())
manifest = json.loads(manifest_path.read_bytes())
assert digest(events_path.read_bytes()) == manifest["eventsSha256"]
assert len(events["events"]) == len(manifest["events"]) == 7
assert len({event["eventId"] for event in events["events"]}) == 7
assert sum(event["role"] == "main" for event in events["events"]) == 2
cache = {}
receipts = []
for event, receipt in zip(events["events"], manifest["events"]):
    for key in ("eventId", "role", "workTitle", "sourcePath", "sourceSha256",
                "startLine", "endLine", "chapterRange"):
        assert event[key] == receipt[key], (event["eventId"], key)
    source_path = Path(event["sourcePath"])
    assert source_path.is_absolute()
    if source_path not in cache:
        cache[source_path] = source_path.read_bytes()
    source = cache[source_path]
    assert digest(source) == event["sourceSha256"]
    lines = source.splitlines(keepends=True)
    first, last = event["startLine"], event["endLine"]
    assert 1 <= first <= last <= len(lines)
    part = b"".join(lines[first - 1:last])
    start = sum(map(len, lines[:first - 1]))
    assert start == receipt["sourceByteStart"]
    assert start + len(part) == receipt["sourceByteEndExclusive"]
    assert len(part) == receipt["sourceSliceBytes"]
    assert digest(part) == receipt["sourceSliceSha256"]
    assert Path(receipt["excerptPath"]).read_bytes() == part
    receipts.append({"eventId": event["eventId"], "exactSourceAndExcerpt": True,
                     "sourceSliceBytes": len(part)})
assert sum(row["sourceSliceBytes"] for row in receipts) == manifest["sumSourceSliceBytes"]
print(json.dumps({
    "schemaVersion": 1,
    "status": "pass",
    "eventsSha256": digest(events_path.read_bytes()),
    "manifestSha256": digest(manifest_path.read_bytes()),
    "comparisonSha256": digest((root / "comparison.md").read_bytes()),
    "sourceFileCount": len(cache),
    "eventCount": len(receipts),
    "sumSourceSliceBytes": manifest["sumSourceSliceBytes"],
    "scope": "Hashes, metadata binding, exact line/byte ranges, source and private excerpt readback only. Not proof of semantic completeness, historical accuracy or whole-work analysis.",
    "events": receipts,
}, ensure_ascii=False, indent=2))
