import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseToolArguments(call) {
  const raw = call?.function?.arguments;
  if (typeof raw === "string") return JSON.parse(raw);
  return raw ?? {};
}

function restoreReadFileContent(toolMessage) {
  if (typeof toolMessage?.content !== "string") throw new Error("Hermes read_file result has no content.");
  const payload = JSON.parse(toolMessage.content);
  if (!payload || typeof payload.content !== "string") throw new Error("Hermes read_file result payload is invalid.");
  return payload.content.split("\n").map((line) => line.replace(/^\d+\|/u, "")).join("\n");
}

export async function verifyHermesExactFileReads(trace, expectedPaths) {
  if (!trace || !Array.isArray(trace.messages)) throw new Error("Hermes trace messages are missing.");
  if (!Array.isArray(expectedPaths) || expectedPaths.length < 1 || new Set(expectedPaths).size !== expectedPaths.length) {
    throw new Error("Expected Hermes read paths must be unique and non-empty.");
  }
  const calls = [];
  for (const message of trace.messages) {
    const toolCalls = message.tool_calls ?? [];
    if (!Array.isArray(toolCalls)) throw new Error("Hermes trace tool calls must be an array.");
    for (const call of toolCalls) {
      if (call?.function?.name !== "read_file") continue;
      const args = parseToolArguments(call);
      calls.push({ id: call.id, path: args.path ?? args.file_path ?? null });
    }
  }
  const results = new Map(
    trace.messages
      .filter((message) => message.role === "tool" && typeof message.tool_call_id === "string")
      .map((message) => [message.tool_call_id, message]),
  );
  const exactReadSha256s = [];
  for (const expectedPath of expectedPaths) {
    const matches = calls.filter((call) => call.path === expectedPath);
    if (matches.length !== 1) throw new Error(`Hermes must read the exact file once: ${expectedPath}`);
    const toolMessage = results.get(matches[0].id);
    if (!toolMessage) throw new Error(`Hermes read_file result is missing: ${expectedPath}`);
    const expectedBytes = await readFile(expectedPath);
    const restoredBytes = Buffer.from(restoreReadFileContent(toolMessage), "utf8");
    if (restoredBytes.compare(expectedBytes) !== 0) {
      throw new Error(`Hermes read_file result is partial or drifted: ${expectedPath}`);
    }
    exactReadSha256s.push(sha256(expectedBytes));
  }
  return { exactReadCount: expectedPaths.length, exactReadSha256s };
}
