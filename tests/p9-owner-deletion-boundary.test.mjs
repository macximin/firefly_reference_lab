import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const receiptPath = new URL("../docs/2026-08-23-p9-owner-deletion-receipt.md", import.meta.url);
const packPath = new URL("../inkos_handoffs/p9-pilot-distressed-company-buyer/", import.meta.url);

test("keeps the rejected P9 pilot deleted until a fresh owner approval", async () => {
  const receipt = await readFile(receiptPath, "utf8");
  const markdownNames = (await readdir(packPath)).filter((name) => name.endsWith(".md")).sort();
  const packDocuments = await Promise.all(
    markdownNames.map(async (name) => ({ name, text: await readFile(new URL(name, packPath), "utf8") })),
  );

  assert.equal(packDocuments.length, 11);
  for (const { name, text } of packDocuments) {
    assert.match(text, /INTENTIONALLY_DELETED_BY_OWNER/u);
    assert.match(text, /새로운 명시적 owner 승인/u, `${name} must require a fresh explicit approval`);
    assert.match(text, /아래 상태 표기는 삭제 전 시점의 기록/u, `${name} must preserve historical context`);
  }
  assert.match(receipt, /INTENTIONALLY_DELETED_BY_OWNER/u);
  assert.match(receipt, /새로운 명시적 owner 승인/u);
  assert.match(receipt, /RECOVERABLE_FROM_TRASH_ONLY_WITH_FRESH_OWNER_APPROVAL/u);
});
