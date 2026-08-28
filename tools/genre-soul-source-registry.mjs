#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultSnapshotPath = join(repoRoot, "exports/source-registry/drive-male-corpus-metadata.json");
const defaultPrivateRegistryPath = join(repoRoot, "exports/source-registry/male-source-registry.v1.json");
const defaultInventoryPath = join(repoRoot, "evidence/genre-souls/male-source-inventory.v1.json");
const defaultReceiptPath = join(repoRoot, "evidence/genre-souls/male-source-registry-receipt.v1.json");
const defaultLocalRoot = join(repoRoot, "private_sources/korean_webnovel_corpus");

const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_SOURCE_ID = /^gdrive-[A-Za-z0-9_-]+$/u;
const EXPECTED_DIRECT_FILES = 398;
const EXPECTED_EXCLUDED_FEMALE_FILES = 374;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function jsonBytes(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeRepoRelative(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty repo-relative path.`);
  }
  const normalized = normalize(value);
  if (
    isAbsolute(value)
    || normalized !== value
    || normalized === "."
    || normalized === ".."
    || normalized.startsWith(`..${sep}`)
  ) {
    throw new Error(`${label} must stay inside the repository: ${value}`);
  }
  return value;
}

function assertExactKeys(value, expected, label) {
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(keys) !== JSON.stringify(wanted)) {
    throw new Error(`${label} keys must be exactly ${wanted.join(", ")}.`);
  }
}

export function deriveCorpusIdentity(file) {
  if (!isObject(file)) throw new Error("Drive file entry must be an object.");
  const { providerFileId, title, mimeType, sizeBytes, modifiedAt } = file;
  if (typeof providerFileId !== "string" || !providerFileId) throw new Error("Drive file ID is required.");
  if (typeof title !== "string" || !title.endsWith("_합본.txt")) {
    throw new Error(`Male corpus file must use the _합본.txt convention: ${String(title)}`);
  }
  if (/[\\/\0]/u.test(title)) throw new Error(`Unsafe source title: ${title}`);
  if (mimeType !== "text/plain") throw new Error(`Male corpus file must be text/plain: ${title}`);
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1) throw new Error(`Drive source size is invalid: ${title}`);
  if (typeof modifiedAt !== "string" || !Number.isFinite(Date.parse(modifiedAt))) {
    throw new Error(`Drive source modifiedAt is invalid: ${title}`);
  }
  const stem = title.slice(0, -"_합본.txt".length);
  const delimiter = stem.lastIndexOf("_");
  if (delimiter < 1 || delimiter === stem.length - 1) throw new Error(`Cannot derive author folder: ${title}`);
  const author = stem.slice(delimiter + 1);
  if (/[\\/\0]/u.test(author)) throw new Error(`Unsafe author folder: ${author}`);
  return {
    sourceId: `gdrive-${providerFileId}`,
    author,
    repoRelativePath: `private_sources/korean_webnovel_corpus/${author}/${title}`,
  };
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`${label} cannot be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function inspectLocalSource(input) {
  const absolute = resolve(input.repositoryRoot, input.repoRelativePath);
  const rel = relative(input.repositoryRoot, absolute);
  if (rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) {
    throw new Error(`Local source escaped the repository: ${input.repoRelativePath}`);
  }
  try {
    let cursor = input.repositoryRoot;
    const rootInfo = await lstat(cursor);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
      throw new Error("Reference Lab repository root must be a real directory.");
    }
    for (const part of input.repoRelativePath.split("/")) {
      cursor = join(cursor, part);
      const partInfo = await lstat(cursor);
      if (partInfo.isSymbolicLink()) {
        throw new Error(`Local source path contains a symlink: ${input.repoRelativePath}`);
      }
    }
    const info = await lstat(absolute);
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error(`Local source must be a real regular file: ${input.repoRelativePath}`);
    }
    const rootReal = await realpath(input.repositoryRoot);
    const fileReal = await realpath(absolute);
    const realRelative = relative(rootReal, fileReal);
    if (realRelative.startsWith(`..${sep}`) || realRelative === ".." || isAbsolute(realRelative)) {
      throw new Error(`Local source realpath escaped the repository: ${input.repoRelativePath}`);
    }
    const bytes = await readFile(absolute);
    const providerSizeMatches = bytes.byteLength === input.providerSizeBytes;
    return {
      status: providerSizeMatches ? "verified-local" : "drifted-local",
      sourceSha256: sha256(bytes),
      actualSizeBytes: bytes.byteLength,
      providerSizeMatches,
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        status: "remote-only",
        sourceSha256: null,
        actualSizeBytes: null,
        providerSizeMatches: null,
      };
    }
    throw error;
  }
}

export function validateDriveSnapshot(snapshot, options = {}) {
  const expectedDirectFiles = options.expectedDirectFiles ?? EXPECTED_DIRECT_FILES;
  const expectedExcludedFemaleFiles = options.expectedExcludedFemaleFiles ?? EXPECTED_EXCLUDED_FEMALE_FILES;
  if (!isObject(snapshot) || snapshot.schemaVersion !== "drive-folder-metadata-snapshot/v1") {
    throw new Error("Drive snapshot must use drive-folder-metadata-snapshot/v1.");
  }
  if (!Number.isFinite(Date.parse(snapshot.capturedAt))) throw new Error("Drive snapshot capturedAt is invalid.");
  if (!isObject(snapshot.source) || snapshot.source.provider !== "google-drive") {
    throw new Error("Drive snapshot source must identify google-drive.");
  }
  if (!Array.isArray(snapshot.files) || snapshot.files.length !== expectedDirectFiles) {
    throw new Error(`Drive snapshot must contain exactly ${expectedDirectFiles} direct male corpus files.`);
  }
  if (!isObject(snapshot.scope) || snapshot.scope.audience !== "male-oriented") {
    throw new Error("Drive snapshot scope must be male-oriented.");
  }
  if (snapshot.scope.directFileCount !== snapshot.files.length) {
    throw new Error("Drive snapshot directFileCount does not match files.");
  }
  const excluded = snapshot.scope.excludedFolders;
  if (
    !Array.isArray(excluded)
    || excluded.length !== 1
    || excluded[0]?.reason !== "female-oriented-corpus-out-of-v1-scope"
    || excluded[0]?.observedDirectFileCount !== expectedExcludedFemaleFiles
  ) {
    throw new Error(`Drive snapshot must explicitly exclude the ${expectedExcludedFemaleFiles}-file female corpus.`);
  }
  const sourceIds = new Set();
  const titles = new Set();
  for (const file of snapshot.files) {
    const identity = deriveCorpusIdentity(file);
    if (sourceIds.has(identity.sourceId)) throw new Error(`Duplicate source ID: ${identity.sourceId}`);
    if (titles.has(file.title)) throw new Error(`Duplicate source title: ${file.title}`);
    sourceIds.add(identity.sourceId);
    titles.add(file.title);
  }
  return snapshot;
}

export async function buildGenreSoulSourceRegistry(options = {}) {
  const repositoryRoot = resolve(options.repositoryRoot ?? repoRoot);
  const snapshotPath = resolve(options.snapshotPath ?? defaultSnapshotPath);
  const privateRegistryPath = resolve(options.privateRegistryPath ?? defaultPrivateRegistryPath);
  const inventoryPath = resolve(options.inventoryPath ?? defaultInventoryPath);
  const receiptPath = resolve(options.receiptPath ?? defaultReceiptPath);
  const snapshot = validateDriveSnapshot(
    await readJson(snapshotPath, "Drive metadata snapshot"),
    options,
  );
  const generatedAt = options.generatedAt ?? snapshot.capturedAt;
  if (!Number.isFinite(Date.parse(generatedAt))) throw new Error("generatedAt must be ISO-8601 compatible.");

  const sortedFiles = [...snapshot.files].sort((left, right) => left.title.localeCompare(right.title, "ko"));
  const items = [];
  for (const file of sortedFiles) {
    const identity = deriveCorpusIdentity(file);
    const local = await inspectLocalSource({
      repositoryRoot,
      repoRelativePath: identity.repoRelativePath,
      providerSizeBytes: file.sizeBytes,
    });
    items.push({
      sourceId: identity.sourceId,
      providerFileId: file.providerFileId,
      title: file.title,
      author: identity.author,
      repoRelativePath: identity.repoRelativePath,
      provider: {
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        modifiedAt: file.modifiedAt,
      },
      local,
      integrityHints: file.sizeBytes < 100_000 ? ["suspiciously-small"] : [],
      classification: {
        status: "unreviewed",
        genre: null,
        managerReceiptSha256: null,
      },
      eligibleForSoulInput: false,
    });
  }

  const counts = {
    discovered: items.length,
    verifiedLocal: items.filter((item) => item.local.status === "verified-local").length,
    driftedLocal: items.filter((item) => item.local.status === "drifted-local").length,
    remoteOnly: items.filter((item) => item.local.status === "remote-only").length,
    providerSizeMismatch: items.filter((item) => item.local.providerSizeMatches === false).length,
    suspiciouslySmall: items.filter((item) => item.integrityHints.includes("suspiciously-small")).length,
    excludedFemale: snapshot.scope.excludedFolders[0].observedDirectFileCount,
    eligibleForSoulInput: 0,
  };
  const inventory = {
    schemaVersion: "genre-soul-source-inventory/v1",
    inventoryId: "male-korean-webnovel-corpus-2026-08-28",
    generatedAt,
    sourceSnapshot: {
      provider: "google-drive",
      rootFolderId: snapshot.source.rootFolderId,
      rootTitle: snapshot.source.rootTitle,
      capturedAt: snapshot.capturedAt,
      snapshotSha256: sha256(jsonBytes(snapshot)),
    },
    scope: {
      audience: "male-oriented",
      genres: ["modern-fantasy-ko", "fantasy-ko", "murim-ko"],
      femaleCorpusExcluded: true,
      automaticGenreClassificationIsEvidence: false,
      promotionEvidence: false,
    },
    counts,
    items,
  };
  const privateRegistry = {
    schemaVersion: "private-source-registry/v1",
    registryId: "male-korean-webnovel-corpus-v1",
    generatedAt,
    repositoryRootKind: "firefly-reference-lab",
    sourceRoot: "private_sources/korean_webnovel_corpus",
    inventoryId: inventory.inventoryId,
    items: items.map((item) => ({
      sourceId: item.sourceId,
      repoRelativePath: item.repoRelativePath,
      sourceSha256: item.local.sourceSha256,
      sizeBytes: item.local.actualSizeBytes,
      status: item.local.status === "verified-local" ? "available" : "unavailable",
      ...(item.local.status === "drifted-local" ? { rejectionReason: "provider-size-drift" } : {}),
    })),
  };
  const inventoryBytes = jsonBytes(inventory);
  const registryBytes = jsonBytes(privateRegistry);
  const receipt = {
    schemaVersion: "source-registry-receipt/v1",
    receiptId: "male-korean-webnovel-corpus-v1",
    generatedAt,
    inventoryPath: relative(repositoryRoot, inventoryPath),
    inventorySha256: sha256(inventoryBytes),
    privateRegistryPath: relative(repositoryRoot, privateRegistryPath),
    privateRegistrySha256: sha256(registryBytes),
    counts,
    resolverEligibility: "blocked-until-manager-selection",
    rawSourceTracked: false,
    absolutePathCount: 0,
  };

  validateSourceRegistryArtifacts({ inventory, privateRegistry, receipt });
  if (options.write !== false) {
    for (const path of [privateRegistryPath, inventoryPath, receiptPath]) await mkdir(dirname(path), { recursive: true });
    await writeFile(privateRegistryPath, registryBytes);
    await writeFile(inventoryPath, inventoryBytes);
    await writeFile(receiptPath, jsonBytes(receipt));
  }
  return { inventory, privateRegistry, receipt };
}

export function validateSourceRegistryArtifacts({ inventory, privateRegistry, receipt }) {
  if (!isObject(inventory) || inventory.schemaVersion !== "genre-soul-source-inventory/v1") {
    throw new Error("Tracked inventory must use genre-soul-source-inventory/v1.");
  }
  if (!Array.isArray(inventory.items) || inventory.items.length < 1) {
    throw new Error("Tracked inventory cannot be empty.");
  }
  if (!isObject(privateRegistry) || privateRegistry.schemaVersion !== "private-source-registry/v1") {
    throw new Error("Private registry must use private-source-registry/v1.");
  }
  if (!Array.isArray(privateRegistry.items) || privateRegistry.items.length < 1) {
    throw new Error("Private registry cannot be empty.");
  }
  if (privateRegistry.items.length !== inventory.items.length) {
    throw new Error("Private registry and tracked inventory counts differ.");
  }
  const inventoryById = new Map(inventory.items.map((item) => [item.sourceId, item]));
  if (inventoryById.size !== inventory.items.length) throw new Error("Tracked inventory source IDs must be unique.");
  const registryIds = new Set();
  for (const [index, entry] of privateRegistry.items.entries()) {
    const expectedKeys = entry.status === "unavailable" && entry.rejectionReason
      ? ["sourceId", "repoRelativePath", "sourceSha256", "sizeBytes", "status", "rejectionReason"]
      : ["sourceId", "repoRelativePath", "sourceSha256", "sizeBytes", "status"];
    assertExactKeys(entry, expectedKeys, `privateRegistry.items[${index}]`);
    if (!SAFE_SOURCE_ID.test(entry.sourceId)) throw new Error(`Invalid private registry source ID: ${entry.sourceId}`);
    if (registryIds.has(entry.sourceId)) throw new Error(`Duplicate private registry source ID: ${entry.sourceId}`);
    registryIds.add(entry.sourceId);
    safeRepoRelative(entry.repoRelativePath, `privateRegistry.items[${index}].repoRelativePath`);
    const inventoryEntry = inventoryById.get(entry.sourceId);
    if (!inventoryEntry || inventoryEntry.repoRelativePath !== entry.repoRelativePath) {
      throw new Error(`Private registry entry does not match tracked inventory: ${entry.sourceId}`);
    }
    if (entry.status === "available") {
      if (!SHA256.test(entry.sourceSha256 ?? "") || !Number.isInteger(entry.sizeBytes) || entry.sizeBytes < 1) {
        throw new Error(`Available source lacks a full SHA-256 and size: ${entry.sourceId}`);
      }
    } else if (entry.status === "unavailable") {
      if (entry.rejectionReason === "provider-size-drift") {
        if (!SHA256.test(entry.sourceSha256 ?? "") || !Number.isInteger(entry.sizeBytes) || entry.sizeBytes < 1) {
          throw new Error(`Drifted source must retain its observed SHA-256 and size: ${entry.sourceId}`);
        }
      } else if (entry.sourceSha256 !== null || entry.sizeBytes !== null) {
        throw new Error(`Unavailable source must not claim local bytes: ${entry.sourceId}`);
      }
    } else {
      throw new Error(`Unknown private source status: ${String(entry.status)}`);
    }
  }
  if (!isObject(receipt) || receipt.schemaVersion !== "source-registry-receipt/v1") {
    throw new Error("Registry receipt must use source-registry-receipt/v1.");
  }
  safeRepoRelative(receipt.inventoryPath, "receipt.inventoryPath");
  safeRepoRelative(receipt.privateRegistryPath, "receipt.privateRegistryPath");
  if (receipt.inventorySha256 !== sha256(jsonBytes(inventory))) throw new Error("Tracked inventory SHA-256 mismatch.");
  if (receipt.privateRegistrySha256 !== sha256(jsonBytes(privateRegistry))) throw new Error("Private registry SHA-256 mismatch.");
  if (receipt.rawSourceTracked !== false || receipt.absolutePathCount !== 0) {
    throw new Error("Registry receipt must prove zero tracked raw source and zero absolute paths.");
  }
  if (JSON.stringify(receipt.counts) !== JSON.stringify(inventory.counts)) {
    throw new Error("Registry receipt counts do not match inventory counts.");
  }
  return true;
}

export function resolveRegistryEntry(privateRegistry, sourceId) {
  if (!isObject(privateRegistry) || privateRegistry.schemaVersion !== "private-source-registry/v1") {
    throw new Error("Resolver refuses legacy or malformed source registries.");
  }
  if (!Array.isArray(privateRegistry.items) || privateRegistry.items.length < 1) {
    throw new Error("Resolver refuses an empty source registry.");
  }
  const entry = privateRegistry.items.find((candidate) => candidate.sourceId === sourceId);
  if (!entry) throw new Error(`Resolver source ID is not registered: ${sourceId}`);
  safeRepoRelative(entry.repoRelativePath, "resolver repoRelativePath");
  if (entry.status !== "available" || !SHA256.test(entry.sourceSha256 ?? "") || !Number.isInteger(entry.sizeBytes)) {
    throw new Error(`Resolver source is not locally verified: ${sourceId}`);
  }
  return entry;
}

export async function validateSourceRegistryFiles(options = {}) {
  const repositoryRoot = resolve(options.repositoryRoot ?? repoRoot);
  const inventoryPath = resolve(options.inventoryPath ?? defaultInventoryPath);
  const privateRegistryPath = resolve(options.privateRegistryPath ?? defaultPrivateRegistryPath);
  const receiptPath = resolve(options.receiptPath ?? defaultReceiptPath);
  const [inventoryBytes, registryBytes, receiptBytes] = await Promise.all([
    readFile(inventoryPath),
    readFile(privateRegistryPath),
    readFile(receiptPath),
  ]);
  const inventory = JSON.parse(inventoryBytes.toString("utf8"));
  const privateRegistry = JSON.parse(registryBytes.toString("utf8"));
  const receipt = JSON.parse(receiptBytes.toString("utf8"));
  validateSourceRegistryArtifacts({ inventory, privateRegistry, receipt });
  if (receipt.inventorySha256 !== sha256(inventoryBytes)) throw new Error("Tracked inventory byte SHA-256 mismatch.");
  if (receipt.privateRegistrySha256 !== sha256(registryBytes)) throw new Error("Private registry byte SHA-256 mismatch.");
  if (safeRepoRelative(receipt.inventoryPath, "receipt.inventoryPath") !== relative(repositoryRoot, inventoryPath)) {
    throw new Error("Tracked inventory path does not match the receipt.");
  }
  if (safeRepoRelative(receipt.privateRegistryPath, "receipt.privateRegistryPath") !== relative(repositoryRoot, privateRegistryPath)) {
    throw new Error("Private registry path does not match the receipt.");
  }
  if (options.verifyAvailableBytes !== false) {
    for (const entry of privateRegistry.items.filter((candidate) => candidate.status === "available")) {
      const inspected = await inspectLocalSource({
        repositoryRoot,
        repoRelativePath: entry.repoRelativePath,
        providerSizeBytes: entry.sizeBytes,
      });
      if (
        inspected.status !== "verified-local"
        || inspected.sourceSha256 !== entry.sourceSha256
        || inspected.actualSizeBytes !== entry.sizeBytes
      ) {
        throw new Error(`Available source byte readback failed: ${entry.sourceId}`);
      }
    }
  }
  return { inventory, privateRegistry, receipt };
}

async function main() {
  const result = await buildGenreSoulSourceRegistry();
  await validateSourceRegistryFiles();
  console.log(JSON.stringify({
    inventory: relative(repoRoot, defaultInventoryPath),
    receipt: relative(repoRoot, defaultReceiptPath),
    privateRegistry: relative(repoRoot, defaultPrivateRegistryPath),
    counts: result.inventory.counts,
    readback: "passed",
  }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
