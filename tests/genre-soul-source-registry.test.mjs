import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";

import {
  buildGenreSoulSourceRegistry,
  deriveCorpusIdentity,
  resolveRegistryEntry,
  resolveSoulInputRegistryEntry,
  validateDriveSnapshot,
  validateSourceRegistryArtifacts,
  validateSourceRegistryFiles,
} from "../tools/genre-soul-source-registry.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

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
    assert.throws(
      () => validateSourceRegistryArtifacts({
        inventory: {
          ...result.inventory,
          counts: { ...result.inventory.counts, eligibleForSoulInput: 1 },
        },
        privateRegistry: result.privateRegistry,
        receipt: result.receipt,
      }),
      /counts do not match its items/u,
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
    counts: {
      discovered: 1,
      verifiedLocal: 0,
      driftedLocal: 0,
      remoteOnly: 0,
      providerSizeMismatch: 0,
      suspiciouslySmall: 0,
      excludedFemale: 2,
      eligibleForSoulInput: 0,
    },
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
      soulInput: {
        eligible: false,
        genre: null,
        managerSelectionReceiptSha256: null,
      },
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

test("binds manager-selected local sources to one genre and detects selection tampering", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-source-selection-"));
  try {
    const contents = ["현대 원문", "판타지 원문", "무협 원문"];
    const files = [
      { ...fileA, providerFileId: "modern", title: "현대 작품_현대필명_합본.txt", sizeBytes: Buffer.byteLength(contents[0]) },
      { ...fileA, providerFileId: "fantasy", title: "판타지 작품_판타지필명_합본.txt", sizeBytes: Buffer.byteLength(contents[1]) },
      { ...fileA, providerFileId: "murim", title: "무협 작품_무협필명_합본.txt", sizeBytes: Buffer.byteLength(contents[2]) },
    ];
    const sourceSnapshot = snapshot(files);
    const snapshotPath = join(root, "exports/source-registry/snapshot.json");
    const managerSelectionPath = join(root, "evidence/genre-souls/selection.json");
    const privateRegistryPath = join(root, "exports/source-registry/private.json");
    const inventoryPath = join(root, "evidence/inventory.json");
    const receiptPath = join(root, "evidence/receipt.json");
    await mkdir(join(root, "exports/source-registry"), { recursive: true });
    await mkdir(join(root, "evidence/genre-souls"), { recursive: true });
    await writeFile(snapshotPath, `${JSON.stringify(sourceSnapshot, null, 2)}\n`);
    for (const [index, file] of files.entries()) {
      const identity = deriveCorpusIdentity(file);
      await mkdir(join(root, identity.repoRelativePath, ".."), { recursive: true });
      await writeFile(join(root, identity.repoRelativePath), contents[index]);
    }
    const genres = ["modern-fantasy-ko", "fantasy-ko", "murim-ko"];
    const selection = {
      schemaVersion: "genre-soul-manager-selection/v1",
      selectionId: "test-selection",
      selectedAt: "2026-08-28T01:00:00.000Z",
      manager: { actorId: "test-manager", role: "manager" },
      sourceSnapshotSha256: sha256(`${JSON.stringify(sourceSnapshot, null, 2)}\n`),
      genres: Object.fromEntries(genres.map((genre, index) => {
        const file = files[index];
        const identity = deriveCorpusIdentity(file);
        return [genre, [{
          sourceId: identity.sourceId,
          providerFileId: file.providerFileId,
          title: file.title,
          author: identity.author,
          sourceSha256: sha256(contents[index]),
          sizeBytes: Buffer.byteLength(contents[index]),
          selectionBasis: "commercial-anchor",
          evidenceMode: "local-source-inspection",
        }]];
      })),
      promotionEvidence: false,
    };
    await writeFile(managerSelectionPath, `${JSON.stringify(selection, null, 2)}\n`);

    const result = await buildGenreSoulSourceRegistry({
      repositoryRoot: root,
      snapshotPath,
      managerSelectionPath,
      privateRegistryPath,
      inventoryPath,
      receiptPath,
      expectedDirectFiles: 3,
      expectedExcludedFemaleFiles: 2,
      managerSelectionMinimumPerGenre: 1,
    });
    assert.equal(result.inventory.counts.eligibleForSoulInput, 3);
    const modernId = deriveCorpusIdentity(files[0]).sourceId;
    assert.equal(resolveSoulInputRegistryEntry(result.privateRegistry, modernId, genres[0]).sourceId, modernId);
    assert.throws(() => resolveSoulInputRegistryEntry(result.privateRegistry, modernId, genres[1]), /not manager-selected/u);
    await validateSourceRegistryFiles({ repositoryRoot: root, privateRegistryPath, inventoryPath, receiptPath });

    await writeFile(managerSelectionPath, `${JSON.stringify({ ...selection, selectionId: "tampered" }, null, 2)}\n`);
    await assert.rejects(
      validateSourceRegistryFiles({ repositoryRoot: root, privateRegistryPath, inventoryPath, receiptPath }),
      /Manager selection byte SHA-256 mismatch/u,
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
