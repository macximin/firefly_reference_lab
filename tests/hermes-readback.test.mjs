import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyHermesExactFileReads } from "../tools/hermes-readback.mjs";

function traceFor(path, content) {
  return {
    messages: [
      {
        role: "assistant",
        tool_calls: [{
          id: "call-1",
          function: { name: "read_file", arguments: JSON.stringify({ path }) },
        }],
      },
      {
        role: "tool",
        tool_call_id: "call-1",
        content: JSON.stringify({ content }),
      },
    ],
  };
}

test("proves a line-numbered Hermes read_file result equals the entire private file", async () => {
  const root = await mkdtemp(join(tmpdir(), "hermes-readback-"));
  const path = join(root, "segment.txt");
  try {
    await writeFile(path, "첫 줄\n123|원문 줄\n끝 줄\n");
    const exact = await verifyHermesExactFileReads(traceFor(path, "1|첫 줄\n2|123|원문 줄\n3|끝 줄\n4|"), [path]);
    assert.equal(exact.exactReadCount, 1);
    assert.equal(exact.exactReadSha256s.length, 1);
    await assert.rejects(
      verifyHermesExactFileReads(traceFor(path, "1|첫 줄\n2|123|원문 줄"), [path]),
      /partial or drifted/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects duplicate or path-only Hermes read evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "hermes-readback-"));
  const path = join(root, "segment.txt");
  try {
    await writeFile(path, "원문\n");
    const trace = traceFor(path, "1|원문\n2|");
    trace.messages[0].tool_calls.push({
      id: "call-2",
      function: { name: "read_file", arguments: JSON.stringify({ path }) },
    });
    await assert.rejects(verifyHermesExactFileReads(trace, [path]), /exact file once/u);
    await assert.rejects(verifyHermesExactFileReads({ messages: trace.messages.slice(0, 1) }, [path]), /exact file once|result is missing/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
