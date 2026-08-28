#!/usr/bin/env node

import { createHash } from "node:crypto";
import { isUtf8 } from "node:buffer";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultSnapshotPath = join(repoRoot, "exports/source-registry/drive-male-corpus-metadata.json");
const defaultPrivateRegistryPath = join(repoRoot, "exports/source-registry/male-source-registry.v1.json");
const defaultInventoryPath = join(repoRoot, "evidence/genre-souls/male-source-inventory.v1.json");
const defaultReceiptPath = join(repoRoot, "evidence/genre-souls/male-source-registry-receipt.v1.json");
const defaultManagerSelectionRelativePath = "evidence/genre-souls/male-manager-selection.v1.json";
const defaultLocalRoot = join(repoRoot, "private_sources/korean_webnovel_corpus");

const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_SOURCE_ID = /^gdrive-[A-Za-z0-9_-]+$/u;
const EXPECTED_DIRECT_FILES = 398;
const EXPECTED_EXCLUDED_FEMALE_FILES = 374;
const SOUL_GENRES = ["modern-fantasy-ko", "fantasy-ko", "murim-ko"];
const SELECTION_BASES = ["commercial-anchor", "genre-breadth", "surface-anchor"];

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
      structure: analyzeSourceStructure(bytes),
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

function parseChapterNumber(markerLine) {
  const direct = markerLine.match(/^ⓚ(\d{1,4})(?:화)?/u);
  if (direct) return Number(direct[1]);
  const angle = markerLine.match(/^ⓚ<(\d{1,4})>/u);
  if (angle) return Number(angle[1]);
  const titleFirst = markerLine.match(/^ⓚ[^\r\n]{0,120}?\b(\d{1,4})화(?:\s|$)/u);
  return titleFirst ? Number(titleFirst[1]) : null;
}

export function analyzeSourceStructure(bytes) {
  if (!Buffer.isBuffer(bytes)) throw new Error("Source structure input must be a Buffer.");
  if (!isUtf8(bytes)) {
    return {
      status: "needs-review",
      utf8Valid: false,
      markerLineCount: 0,
      parsedChapterCount: 0,
      unparsedMarkerLineCount: 0,
      sequenceIssueCount: 0,
      firstChapterNumber: null,
      lastChapterNumber: null,
      replacementCharacterCount: 0,
    };
  }
  const text = bytes.toString("utf8");
  const markerLines = [...text.matchAll(/^ⓚ[^\r\n]*/gmu)].map((match) => match[0]);
  const chapterNumbers = markerLines.map(parseChapterNumber).filter((value) => value !== null);
  let sequenceIssueCount = 0;
  for (let index = 1; index < chapterNumbers.length; index += 1) {
    if (chapterNumbers[index] !== chapterNumbers[index - 1] + 1) sequenceIssueCount += 1;
  }
  const replacementCharacterCount = text.match(/�/gu)?.length ?? 0;
  const complete = chapterNumbers.length > 0
    && sequenceIssueCount === 0
    && replacementCharacterCount === 0;
  return {
    status: complete ? "complete" : "needs-review",
    utf8Valid: true,
    markerLineCount: markerLines.length,
    parsedChapterCount: chapterNumbers.length,
    unparsedMarkerLineCount: markerLines.length - chapterNumbers.length,
    sequenceIssueCount,
    firstChapterNumber: chapterNumbers[0] ?? null,
    lastChapterNumber: chapterNumbers.at(-1) ?? null,
    replacementCharacterCount,
  };
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

export function validateManagerSelectionArtifact(selection, snapshot, items, options = {}) {
  const minimumPerGenre = options.minimumPerGenre ?? 3;
  if (!isObject(selection) || selection.schemaVersion !== "genre-soul-manager-selection/v1") {
    throw new Error("Manager selection must use genre-soul-manager-selection/v1.");
  }
  assertExactKeys(selection, [
    "schemaVersion", "selectionId", "selectedAt", "manager", "sourceSnapshotSha256",
    "genres", "promotionEvidence",
  ], "managerSelection");
  if (typeof selection.selectionId !== "string" || !selection.selectionId) throw new Error("Manager selection ID is required.");
  if (typeof selection.selectedAt !== "string" || !Number.isFinite(Date.parse(selection.selectedAt))) {
    throw new Error("Manager selection selectedAt is invalid.");
  }
  if (!isObject(selection.manager)) throw new Error("Manager selection actor is required.");
  assertExactKeys(selection.manager, ["actorId", "role"], "managerSelection.manager");
  if (typeof selection.manager.actorId !== "string" || !selection.manager.actorId || selection.manager.role !== "manager") {
    throw new Error("Manager selection requires a named manager actor.");
  }
  if (selection.sourceSnapshotSha256 !== sha256(jsonBytes(snapshot))) {
    throw new Error("Manager selection source snapshot SHA-256 drifted.");
  }
  if (selection.promotionEvidence !== false) throw new Error("Manager selection is not promotion evidence.");
  if (!isObject(selection.genres)) throw new Error("Manager selection genres are required.");
  assertExactKeys(selection.genres, SOUL_GENRES, "managerSelection.genres");
  const itemBySourceId = new Map(items.map((item) => [item.sourceId, item]));
  const seenSourceIds = new Set();
  for (const genre of SOUL_GENRES) {
    const entries = selection.genres[genre];
    if (!Array.isArray(entries) || entries.length !== minimumPerGenre) {
      throw new Error(`Manager selection ${genre} must contain exactly ${minimumPerGenre} sources.`);
    }
    const bases = [];
    for (const [index, entry] of entries.entries()) {
      const label = `managerSelection.genres.${genre}[${index}]`;
      if (!isObject(entry)) throw new Error(`${label} must be an object.`);
      assertExactKeys(entry, [
        "sourceId", "providerFileId", "title", "author", "sourceSha256", "sizeBytes",
        "chapterCount", "selectionBasis", "evidenceMode",
      ], label);
      if (seenSourceIds.has(entry.sourceId)) throw new Error(`Manager selection source is duplicated: ${entry.sourceId}`);
      seenSourceIds.add(entry.sourceId);
      const source = itemBySourceId.get(entry.sourceId);
      if (!source) throw new Error(`Manager selection source is not inventoried: ${entry.sourceId}`);
      if (
        source.providerFileId !== entry.providerFileId
        || source.title !== entry.title
        || source.author !== entry.author
        || source.local.sourceSha256 !== entry.sourceSha256
        || source.local.actualSizeBytes !== entry.sizeBytes
      ) throw new Error(`Manager selection source identity drift: ${entry.sourceId}`);
      if (source.local.status !== "verified-local") throw new Error(`Manager selection source is not locally verified: ${entry.sourceId}`);
      if (
        source.local.structure?.status !== "complete"
        || source.local.structure.parsedChapterCount !== entry.chapterCount
      ) throw new Error(`Manager selection source structure is not complete: ${entry.sourceId}`);
      if (!SELECTION_BASES.includes(entry.selectionBasis)) throw new Error(`${label}.selectionBasis is invalid.`);
      if (!["local-source-inspection", "drive-content-inspection"].includes(entry.evidenceMode)) {
        throw new Error(`${label}.evidenceMode is invalid.`);
      }
      bases.push(entry.selectionBasis);
    }
    if (minimumPerGenre === SELECTION_BASES.length && JSON.stringify([...bases].sort()) !== JSON.stringify([...SELECTION_BASES].sort())) {
      throw new Error(`Manager selection ${genre} must preserve commercial, genre-breadth, and surface anchors.`);
    }
  }
  return true;
}

export async function buildGenreSoulSourceRegistry(options = {}) {
  const repositoryRoot = resolve(options.repositoryRoot ?? repoRoot);
  const snapshotPath = resolve(options.snapshotPath ?? defaultSnapshotPath);
  const privateRegistryPath = resolve(options.privateRegistryPath ?? defaultPrivateRegistryPath);
  const inventoryPath = resolve(options.inventoryPath ?? defaultInventoryPath);
  const receiptPath = resolve(options.receiptPath ?? defaultReceiptPath);
  const managerSelectionPath = options.managerSelectionPath === null
    ? null
    : resolve(options.managerSelectionPath ?? join(repositoryRoot, defaultManagerSelectionRelativePath));
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
      integrityHints: [
        ...(file.sizeBytes < 100_000 ? ["suspiciously-small"] : []),
        ...(local.structure?.utf8Valid === false ? ["utf8-invalid"] : []),
        ...((local.structure?.replacementCharacterCount ?? 0) > 0 ? ["replacement-character"] : []),
        ...(local.structure?.parsedChapterCount === 0 ? ["chapter-markers-missing"] : []),
        ...((local.structure?.unparsedMarkerLineCount ?? 0) > 0 ? ["chapter-markers-unparsed"] : []),
        ...((local.structure?.sequenceIssueCount ?? 0) > 0 ? ["chapter-sequence-anomaly"] : []),
      ],
      classification: {
        status: "unreviewed",
        genre: null,
        managerReceiptSha256: null,
      },
      eligibleForSoulInput: false,
    });
  }

  let managerSelection = null;
  let managerSelectionSha256 = null;
  if (managerSelectionPath !== null) {
    try {
      const selectionBytes = await readFile(managerSelectionPath);
      managerSelection = JSON.parse(selectionBytes.toString("utf8"));
      validateManagerSelectionArtifact(managerSelection, snapshot, items, {
        minimumPerGenre: options.managerSelectionMinimumPerGenre,
      });
      managerSelectionSha256 = sha256(selectionBytes);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  if (managerSelection) {
    for (const genre of SOUL_GENRES) {
      for (const selected of managerSelection.genres[genre]) {
        const item = items.find((candidate) => candidate.sourceId === selected.sourceId);
        item.classification = {
          status: "manager-selected",
          genre,
          managerReceiptSha256: managerSelectionSha256,
        };
        item.eligibleForSoulInput = true;
      }
    }
  }

  const counts = {
    discovered: items.length,
    verifiedLocal: items.filter((item) => item.local.status === "verified-local").length,
    driftedLocal: items.filter((item) => item.local.status === "drifted-local").length,
    remoteOnly: items.filter((item) => item.local.status === "remote-only").length,
    providerSizeMismatch: items.filter((item) => item.local.providerSizeMatches === false).length,
    suspiciouslySmall: items.filter((item) => item.integrityHints.includes("suspiciously-small")).length,
    excludedFemale: snapshot.scope.excludedFolders[0].observedDirectFileCount,
    eligibleForSoulInput: items.filter((item) => item.eligibleForSoulInput).length,
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
      soulInput: item.eligibleForSoulInput
        ? {
            eligible: true,
            genre: item.classification.genre,
            managerSelectionReceiptSha256: managerSelectionSha256,
          }
        : {
            eligible: false,
            genre: null,
            managerSelectionReceiptSha256: null,
          },
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
    managerSelectionPath: managerSelectionPath && managerSelection
      ? relative(repositoryRoot, managerSelectionPath)
      : null,
    managerSelectionSha256,
    counts,
    resolverEligibility: managerSelection ? "manager-selected-local-only" : "blocked-until-manager-selection",
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
  const derivedCounts = {
    discovered: inventory.items.length,
    verifiedLocal: inventory.items.filter((item) => item.local?.status === "verified-local").length,
    driftedLocal: inventory.items.filter((item) => item.local?.status === "drifted-local").length,
    remoteOnly: inventory.items.filter((item) => item.local?.status === "remote-only").length,
    providerSizeMismatch: inventory.items.filter((item) => item.local?.providerSizeMatches === false).length,
    suspiciouslySmall: inventory.items.filter((item) => item.integrityHints?.includes("suspiciously-small")).length,
    excludedFemale: inventory.counts?.excludedFemale,
    eligibleForSoulInput: inventory.items.filter((item) => item.eligibleForSoulInput === true).length,
  };
  if (JSON.stringify(inventory.counts) !== JSON.stringify(derivedCounts)) {
    throw new Error("Tracked inventory counts do not match its items.");
  }
  const registryIds = new Set();
  for (const [index, entry] of privateRegistry.items.entries()) {
    const expectedKeys = entry.status === "unavailable" && entry.rejectionReason
      ? ["sourceId", "repoRelativePath", "sourceSha256", "sizeBytes", "status", "soulInput", "rejectionReason"]
      : ["sourceId", "repoRelativePath", "sourceSha256", "sizeBytes", "status", "soulInput"];
    assertExactKeys(entry, expectedKeys, `privateRegistry.items[${index}]`);
    if (!SAFE_SOURCE_ID.test(entry.sourceId)) throw new Error(`Invalid private registry source ID: ${entry.sourceId}`);
    if (registryIds.has(entry.sourceId)) throw new Error(`Duplicate private registry source ID: ${entry.sourceId}`);
    registryIds.add(entry.sourceId);
    safeRepoRelative(entry.repoRelativePath, `privateRegistry.items[${index}].repoRelativePath`);
    const inventoryEntry = inventoryById.get(entry.sourceId);
    if (!inventoryEntry || inventoryEntry.repoRelativePath !== entry.repoRelativePath) {
      throw new Error(`Private registry entry does not match tracked inventory: ${entry.sourceId}`);
    }
    if (!isObject(entry.soulInput)) throw new Error(`Private registry Soul input state is missing: ${entry.sourceId}`);
    assertExactKeys(entry.soulInput, ["eligible", "genre", "managerSelectionReceiptSha256"], `privateRegistry.items[${index}].soulInput`);
    if (entry.soulInput.eligible !== inventoryEntry.eligibleForSoulInput) {
      throw new Error(`Private registry Soul eligibility differs from tracked inventory: ${entry.sourceId}`);
    }
    if (entry.soulInput.eligible) {
      if (
        entry.status !== "available"
        || !SOUL_GENRES.includes(entry.soulInput.genre)
        || !SHA256.test(entry.soulInput.managerSelectionReceiptSha256 ?? "")
        || inventoryEntry.classification.status !== "manager-selected"
        || inventoryEntry.classification.genre !== entry.soulInput.genre
        || inventoryEntry.classification.managerReceiptSha256 !== entry.soulInput.managerSelectionReceiptSha256
      ) throw new Error(`Private registry Soul selection evidence is invalid: ${entry.sourceId}`);
    } else if (entry.soulInput.genre !== null || entry.soulInput.managerSelectionReceiptSha256 !== null) {
      throw new Error(`Ineligible private source cannot carry Soul selection evidence: ${entry.sourceId}`);
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
  if (receipt.managerSelectionPath === null) {
    if (receipt.managerSelectionSha256 !== null || receipt.resolverEligibility !== "blocked-until-manager-selection") {
      throw new Error("Registry receipt cannot claim manager selection evidence.");
    }
  } else {
    safeRepoRelative(receipt.managerSelectionPath, "receipt.managerSelectionPath");
    if (!SHA256.test(receipt.managerSelectionSha256 ?? "") || receipt.resolverEligibility !== "manager-selected-local-only") {
      throw new Error("Registry receipt manager selection evidence is invalid.");
    }
  }
  const eligibleEntries = privateRegistry.items.filter((entry) => entry.soulInput.eligible);
  if (
    eligibleEntries.length > 0
    && (
      receipt.managerSelectionPath === null
      || eligibleEntries.some((entry) => entry.soulInput.managerSelectionReceiptSha256 !== receipt.managerSelectionSha256)
    )
  ) throw new Error("Soul input eligibility is not bound to the receipt manager selection.");
  if (eligibleEntries.length === 0 && receipt.managerSelectionPath !== null) {
    throw new Error("Manager selection receipt must select at least one Soul input.");
  }
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

export function resolveSoulInputRegistryEntry(privateRegistry, sourceId, genre) {
  const entry = resolveRegistryEntry(privateRegistry, sourceId);
  if (
    !isObject(entry.soulInput)
    || entry.soulInput.eligible !== true
    || entry.soulInput.genre !== genre
    || !SHA256.test(entry.soulInput.managerSelectionReceiptSha256 ?? "")
  ) throw new Error(`Resolver source is not manager-selected for ${genre}: ${sourceId}`);
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
  if (receipt.managerSelectionPath !== null) {
    const selectionPath = resolve(repositoryRoot, safeRepoRelative(receipt.managerSelectionPath, "receipt.managerSelectionPath"));
    const selectionBytes = await readFile(selectionPath);
    if (sha256(selectionBytes) !== receipt.managerSelectionSha256) throw new Error("Manager selection byte SHA-256 mismatch.");
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
