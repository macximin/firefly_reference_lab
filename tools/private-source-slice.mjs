#!/usr/bin/env node
import { writeSync } from "node:fs";
import { resolvePrivateSourceSlice } from "./private-source-slice-lib.mjs";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
try {
  const workOrder = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const { bytes, receipt } = await resolvePrivateSourceSlice(workOrder);
  let offset = 0;
  while (offset < bytes.byteLength) offset += writeSync(3, bytes, offset, bytes.byteLength - offset);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n`);
  process.exitCode = 1;
}
