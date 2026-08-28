import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildGenreSoulSourceRegistry, deriveCorpusIdentity } from "../tools/genre-soul-source-registry.mjs";
import { resolvePrivateSourceSlice, validatePrivateSourceSliceWorkOrder } from "../tools/private-source-slice-lib.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const sourceText = "첫 원문에서 압박이 시작된다.";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "private-source-slice-"));
  const file = {
    providerFileId: "file-a", title: "첫 작품_필명_합본.txt", mimeType: "text/plain",
    sizeBytes: Buffer.byteLength(sourceText), modifiedAt: "2026-08-27T00:00:00.000Z",
  };
  const snapshot = {
    schemaVersion: "drive-folder-metadata-snapshot/v1", capturedAt: "2026-08-28T00:00:00.000Z",
    source: { provider: "google-drive", rootFolderId: "folder-male", rootTitle: "원고들_코퍼스", parentChain: [] },
    scope: { audience: "male-oriented", directFileCount: 1, excludedFolders: [{ folderId: "female", title: "여성향", reason: "female-oriented-corpus-out-of-v1-scope", observedDirectFileCount: 1 }] },
    files: [file],
  };
  const snapshotPath = join(root, "exports/source-registry/snapshot.json");
  const privateRegistryPath = join(root, "exports/source-registry/private.json");
  const inventoryPath = join(root, "evidence/inventory.json");
  const receiptPath = join(root, "evidence/receipt.json");
  await mkdir(join(root, "exports/source-registry"), { recursive: true });
  await mkdir(join(root, "private_sources/korean_webnovel_corpus/필명"), { recursive: true });
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  await writeFile(join(root, deriveCorpusIdentity(file).repoRelativePath), sourceText);
  const built = await buildGenreSoulSourceRegistry({
    repositoryRoot: root, snapshotPath, privateRegistryPath, inventoryPath, receiptPath,
    expectedDirectFiles: 1, expectedExcludedFemaleFiles: 1,
  });
  const selected = "압박";
  const characterStart = sourceText.indexOf(selected);
  const startByte = Buffer.byteLength(sourceText.slice(0, characterStart));
  const endByte = startByte + Buffer.byteLength(selected);
  const receiptSha256 = hash(await readFile(receiptPath));
  const commit = "1".repeat(40);
  const selectorSha256 = hash("selector");
  const common = {
    requestId: "11111111-1111-4111-8111-111111111111",
    packetId: "frp-1234567890abcdef12345678",
    packetSha256: hash("packet"),
    matchId: "fsm-1234567890abcdef12345678",
    selectorSha256,
  };
  const selector = {
    coordinateKind: "utf8-byte", sourceId: built.privateRegistry.items[0].sourceId,
    sourceSha256: built.privateRegistry.items[0].sourceSha256, startByte, endByte,
    expectedSliceSha256: hash(selected),
  };
  const workOrder = {
    schemaVersion: 2,
    workOrderId: "22222222-2222-4222-8222-222222222222",
    repo: "firefly_reference_lab",
    capability: "private-source-slice",
    executionMode: "human-source-review",
    approvalMode: "human",
    adapterContract: "reference-source-slice/v1",
    sourceSlice: { ...common, selector, maxBytes: 32_768 },
    sourceRegistry: {
      receiptRepo: "firefly_reference_lab", receiptCommit: commit,
      receiptPath: "evidence/receipt.json", receiptSha256,
      privateRegistryPath: "exports/source-registry/private.json",
      declaredPrivateRegistrySha256: built.receipt.privateRegistrySha256,
    },
    grant: {
      issuer: "storyyard", audience: "firefly-hq-source-slice", actorId: "owner-one",
      authenticatedRole: "admin", ownerScope: "owner-scope", ...common,
      coordinateKind: selector.coordinateKind, sourceId: selector.sourceId, sourceSha256: selector.sourceSha256,
      startByte, endByte, expectedSliceSha256: selector.expectedSliceSha256, maxBytes: 32_768,
      expiresAt: "2026-08-28T07:00:00.000Z", jti: "jti-one", verifiedGrantSha256: hash("grant"),
    },
  };
  return { root, workOrder, commit, selected };
}

test("returns private source bytes only through the sensitive result and emits pointer-only receipt", async () => {
  const { root, workOrder, commit, selected } = await fixture();
  try {
    assert.equal(validatePrivateSourceSliceWorkOrder(workOrder), workOrder);
    const result = await resolvePrivateSourceSlice(workOrder, { repositoryRoot: root, repositoryCommit: commit, resolvedAt: "2026-08-28T06:30:00.000Z" });
    assert.equal(result.bytes.toString("utf8"), selected);
    assert.equal(result.receipt.sliceSha256, hash(selected));
    assert.equal(result.receipt.rawSourcePersisted, false);
    assert.equal(JSON.stringify(result.receipt).includes(selected), false);
    assert.equal(JSON.stringify(result.receipt).includes("private_sources"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects browser paths, grant drift, source drift, and an oversized range", async () => {
  const { root, workOrder, commit } = await fixture();
  try {
    assert.throws(() => validatePrivateSourceSliceWorkOrder({ ...workOrder, path: "/tmp/source.txt" }), /fields are invalid/u);
    assert.throws(() => validatePrivateSourceSliceWorkOrder({ ...workOrder, grant: { ...workOrder.grant, sourceId: "gdrive-other" } }), /exactly match/u);
    assert.throws(() => validatePrivateSourceSliceWorkOrder({
      ...workOrder,
      sourceSlice: { ...workOrder.sourceSlice, selector: { ...workOrder.sourceSlice.selector, endByte: workOrder.sourceSlice.selector.startByte + 32_769 } },
    }), /byte range/u);
    const sourcePath = join(root, "private_sources/korean_webnovel_corpus/필명/첫 작품_필명_합본.txt");
    await writeFile(sourcePath, "바뀐 원문");
    await assert.rejects(() => resolvePrivateSourceSlice(workOrder, { repositoryRoot: root, repositoryCommit: commit }), /byte readback failed/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
