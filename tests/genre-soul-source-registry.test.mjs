import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";

import {
  buildGenreSoulSourceRegistry,
  deriveCorpusIdentity,
  resolveRegistryEntry,
  validateDriveSnapshot,
  validateSourceRegistryArtifacts,
  validateSourceRegistryFiles,
} from "../tools/genre-soul-source-registry.mjs";

function snapshot(files) {
  return {
    schemaVersion: "drive-folder-metadata-snapshot/v1",
    capturedAt: "2026-08-28T00:00:00.000Z",
    source: {
      provider: "google-drive",
      rootFolderId: "folder-male",
      rootTitle: "원고들_코퍼스",
      parentChain: ["FF_STUDIO", "01_원천_코퍼스", "원고들_코퍼스"],
    },
    scope: {
      audience: "male-oriented",
      directFileCount: files.length,
      excludedFolders: [{
        folderId: "folder-female",
        title: "로맨스사업팀_연재EPUB_합본TXT",
        reason: "female-oriented-corpus-out-of-v1-scope",
        observedDirectFileCount: 2,
      }],
    },
    files,
  };
}

const fileA = {
  providerFileId: "file-a",
  title: "첫 작품_필명_합본.txt",
  mimeType: "text/plain",
  sizeBytes: Buffer.byteLength("첫 원문"),
  modifiedAt: "2026-08-27T00:00:00.000Z",
};
const fileB = {
  providerFileId: "file-b",
  title: "둘째 작품_다른필명_합본.txt",
  mimeType: "text/plain",
  sizeBytes: 2_000_000,
  modifiedAt: "2026-08-27T01:00:00.000Z",
};

test("derives stable source identity and repository-local path", () => {
  assert.deepEqual(deriveCorpusIdentity(fileA), {
    sourceId: "gdrive-file-a",
    author: "필명",
    repoRelativePath: "private_sources/korean_webnovel_corpus/필명/첫 작품_필명_합본.txt",
  });
});

test("builds a complete inventory while keeping unavailable files fail-closed", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-source-registry-"));
  try {
    const snapshotPath = join(root, "exports/source-registry/snapshot.json");
    await mkdir(join(root, "exports/source-registry"), { recursive: true });
    await mkdir(join(root, "private_sources/korean_webnovel_corpus/필명"), { recursive: true });
    await writeFile(snapshotPath, `${JSON.stringify(snapshot([fileA, fileB]), null, 2)}\n`);
    await writeFile(join(root, deriveCorpusIdentity(fileA).repoRelativePath), "첫 원문");

    const result = await buildGenreSoulSourceRegistry({
      repositoryRoot: root,
      snapshotPath,
      privateRegistryPath: join(root, "exports/source-registry/private.json"),
      inventoryPath: join(root, "evidence/inventory.json"),
      receiptPath: join(root, "evidence/receipt.json"),
      expectedDirectFiles: 2,
      expectedExcludedFemaleFiles: 2,
    });
    assert.equal(result.inventory.counts.discovered, 2);
    assert.equal(result.inventory.counts.verifiedLocal, 1);
    assert.equal(result.inventory.counts.remoteOnly, 1);
    assert.equal(result.inventory.counts.eligibleForSoulInput, 0);
    assert.match(resolveRegistryEntry(result.privateRegistry, "gdrive-file-a").sourceSha256, /^[0-9a-f]{64}$/u);
    assert.throws(
      () => resolveRegistryEntry(result.privateRegistry, "gdrive-file-b"),
      /not locally verified/u,
    );
    assert.equal(JSON.parse(await readFile(join(root, "evidence/inventory.json"), "utf8")).items.length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects duplicates, missing female exclusion, empty registries, and absolute paths", () => {
  assert.throws(
    () => validateDriveSnapshot(snapshot([fileA, fileA]), { expectedDirectFiles: 2, expectedExcludedFemaleFiles: 2 }),
    /Duplicate source ID/u,
  );
  assert.throws(
    () => validateDriveSnapshot({ ...snapshot([fileA]), scope: { ...snapshot([fileA]).scope, excludedFolders: [] } }, {
      expectedDirectFiles: 1,
      expectedExcludedFemaleFiles: 2,
    }),
    /explicitly exclude/u,
  );
  assert.throws(
    () => resolveRegistryEntry({ schemaVersion: "private-source-registry/v1", items: [] }, "gdrive-file-a"),
    /empty source registry/u,
  );
  const inventory = {
    schemaVersion: "genre-soul-source-inventory/v1",
    counts: {},
    items: [{ sourceId: "gdrive-file-a", repoRelativePath: "/tmp/raw.txt" }],
  };
  const privateRegistry = {
    schemaVersion: "private-source-registry/v1",
    items: [{
      sourceId: "gdrive-file-a",
      repoRelativePath: "/tmp/raw.txt",
      sourceSha256: "a".repeat(64),
      sizeBytes: 10,
      status: "available",
    }],
  };
  assert.throws(
    () => validateSourceRegistryArtifacts({ inventory, privateRegistry, receipt: {} }),
    /stay inside the repository/u,
  );
});

test("keeps a local file with provider size drift unavailable to the resolver", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-source-drift-"));
  try {
    const snapshotPath = join(root, "exports/source-registry/snapshot.json");
    await mkdir(join(root, "exports/source-registry"), { recursive: true });
    await mkdir(join(root, "private_sources/korean_webnovel_corpus/필명"), { recursive: true });
    await writeFile(snapshotPath, `${JSON.stringify(snapshot([{ ...fileA, sizeBytes: 999 }]), null, 2)}\n`);
    await writeFile(join(root, deriveCorpusIdentity(fileA).repoRelativePath), "첫 원문");
    const result = await buildGenreSoulSourceRegistry({
      repositoryRoot: root,
      snapshotPath,
      privateRegistryPath: join(root, "exports/source-registry/private.json"),
      inventoryPath: join(root, "evidence/inventory.json"),
      receiptPath: join(root, "evidence/receipt.json"),
      expectedDirectFiles: 1,
      expectedExcludedFemaleFiles: 2,
    });
    assert.equal(result.inventory.counts.verifiedLocal, 0);
    assert.equal(result.inventory.counts.driftedLocal, 1);
    assert.equal(result.privateRegistry.items[0].status, "unavailable");
    assert.equal(result.privateRegistry.items[0].rejectionReason, "provider-size-drift");
    assert.throws(
      () => resolveRegistryEntry(result.privateRegistry, "gdrive-file-a"),
      /not locally verified/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readback detects private registry tampering", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-source-tamper-"));
  try {
    const snapshotPath = join(root, "exports/source-registry/snapshot.json");
    const registryPath = join(root, "exports/source-registry/private.json");
    const inventoryPath = join(root, "evidence/inventory.json");
    const receiptPath = join(root, "evidence/receipt.json");
    await mkdir(join(root, "exports/source-registry"), { recursive: true });
    await writeFile(snapshotPath, `${JSON.stringify(snapshot([fileB]), null, 2)}\n`);
    await buildGenreSoulSourceRegistry({
      repositoryRoot: root,
      snapshotPath,
      privateRegistryPath: registryPath,
      inventoryPath,
      receiptPath,
      expectedDirectFiles: 1,
      expectedExcludedFemaleFiles: 2,
    });
    await writeFile(registryPath, (await readFile(registryPath, "utf8")).replace("unavailable", "available"));
    await assert.rejects(
      validateSourceRegistryFiles({ repositoryRoot: root, privateRegistryPath: registryPath, inventoryPath, receiptPath }),
      /full SHA-256|byte SHA-256 mismatch/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a source reached through a symlinked parent directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-source-symlink-"));
  try {
    const snapshotPath = join(root, "exports/source-registry/snapshot.json");
    await mkdir(join(root, "exports/source-registry"), { recursive: true });
    await mkdir(join(root, "private_sources/korean_webnovel_corpus"), { recursive: true });
    await mkdir(join(root, "real-author"), { recursive: true });
    await writeFile(join(root, "real-author/첫 작품_필명_합본.txt"), "첫 원문");
    await symlink(join(root, "real-author"), join(root, "private_sources/korean_webnovel_corpus/필명"));
    await writeFile(snapshotPath, `${JSON.stringify(snapshot([fileA]), null, 2)}\n`);
    await assert.rejects(
      buildGenreSoulSourceRegistry({
        repositoryRoot: root,
        snapshotPath,
        privateRegistryPath: join(root, "exports/source-registry/private.json"),
        inventoryPath: join(root, "evidence/inventory.json"),
        receiptPath: join(root, "evidence/receipt.json"),
        expectedDirectFiles: 1,
        expectedExcludedFemaleFiles: 2,
      }),
      /contains a symlink/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
