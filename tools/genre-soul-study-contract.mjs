#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, normalize, relative, resolve, sep } from "node:path";

import {
  resolveRegistryEntry,
  validateSourceRegistryFiles,
} from "./genre-soul-source-registry.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const GENRES = new Set(["modern-fantasy-ko", "fantasy-ko", "murim-ko"]);
const FORBIDDEN_TRACKED_KEYS = /^(?:body|text|prose|quote|excerpt|raw|rawText|rawProse|sourceText)$/iu;
const CONTENT_NEUTRAL_FORBIDDEN = [
  /성별.{0,12}(?:금지|부적합|감점)/u,
  /도덕(?:성|적).{0,12}(?:금지|부적합|감점|필수)/u,
  /불법.{0,12}(?:금지|자동.{0,4}(?:거절|수정)|감점)/u,
  /(?:반성|사과|갱생|속죄|응보|처벌).{0,12}(?:반드시|필수|의무)/u,
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertSha(value, label) {
  if (!SHA256.test(value ?? "")) throw new Error(`${label} must be a full SHA-256.`);
}

function assertIso(value, label) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be ISO-8601 compatible.`);
  }
}

function assertGenre(value) {
  if (!GENRES.has(value)) throw new Error(`Unsupported male genre Soul: ${String(value)}`);
}

function assertUniqueSorted(values, label) {
  if (!Array.isArray(values) || values.length < 1 || values.some((value) => typeof value !== "string" || !value)) {
    throw new Error(`${label} must be a non-empty string array.`);
  }
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
  const sorted = [...values].sort();
  if (sorted.some((value, index) => value !== values[index])) throw new Error(`${label} must be sorted.`);
}

function assertNoRawBearingKeys(value, path = "$") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRawBearingKeys(item, `${path}[${index}]`));
    return;
  }
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_TRACKED_KEYS.test(key)) throw new Error(`Tracked study artifact contains raw-bearing key ${path}.${key}.`);
    assertNoRawBearingKeys(child, `${path}.${key}`);
  }
}

function assertRange(range, sizeBytes, label) {
  if (
    !isObject(range)
    || !Number.isInteger(range.startByte)
    || !Number.isInteger(range.endByte)
    || range.startByte < 0
    || range.endByte <= range.startByte
    || range.endByte > sizeBytes
  ) {
    throw new Error(`${label} has an invalid UTF-8 byte range.`);
  }
}

function assertPartialCoverage(ranges, sizeBytes, label) {
  let previousEnd = -1;
  for (const [index, range] of ranges.entries()) {
    assertRange(range, sizeBytes, `${label}[${index}]`);
    if (range.startByte < previousEnd) throw new Error(`${label} must be sorted and non-overlapping.`);
    previousEnd = range.endByte;
  }
}

function assertHostReadReader(reader, label) {
  if (!isObject(reader) || reader.model !== "gpt-5.6-sol" || reader.reasoningEffort !== "high") {
    throw new Error(`${label} must be host-read gpt-5.6-sol/high.`);
  }
  if (typeof reader.runId !== "string" || !reader.runId) throw new Error(`${label} run ID is required.`);
  assertSha(reader.configSha256, `${label}.configSha256`);
  assertSha(reader.traceReceiptSha256, `${label}.traceReceiptSha256`);
}

export function assertFullByteCoverage(ranges, sizeBytes, label = "coverage") {
  if (!Array.isArray(ranges) || ranges.length < 1) throw new Error(`${label} must contain at least one range.`);
  let cursor = 0;
  for (const [index, range] of ranges.entries()) {
    assertRange(range, sizeBytes, `${label}[${index}]`);
    if (range.startByte !== cursor) {
      throw new Error(`${label} must be gap-free and non-overlapping at byte ${cursor}.`);
    }
    cursor = range.endByte;
  }
  if (cursor !== sizeBytes) throw new Error(`${label} stops at ${cursor}, expected ${sizeBytes}.`);
  return true;
}

export function validateSurveyArtifact(survey, privateRegistry) {
  if (!isObject(survey) || survey.schemaVersion !== "genre-soul-survey/v1") {
    throw new Error("Survey must use genre-soul-survey/v1.");
  }
  assertGenre(survey.genre);
  assertIso(survey.completedAt, "survey.completedAt");
  assertUniqueSorted(survey.candidateSourceIds, "survey.candidateSourceIds");
  if (!Array.isArray(survey.entries) || survey.entries.length !== survey.candidateSourceIds.length) {
    throw new Error("Survey entries must cover every candidate source exactly once.");
  }
  const entryIds = survey.entries.map((entry) => entry.sourceId).sort();
  if (JSON.stringify(entryIds) !== JSON.stringify(survey.candidateSourceIds)) {
    throw new Error("Survey entry source IDs do not equal candidateSourceIds.");
  }
  for (const [index, entry] of survey.entries.entries()) {
    const registryEntry = resolveRegistryEntry(privateRegistry, entry.sourceId);
    assertSha(entry.sourceSha256, `survey.entries[${index}].sourceSha256`);
    if (entry.sourceSha256 !== registryEntry.sourceSha256) throw new Error(`Survey source SHA drift: ${entry.sourceId}`);
    assertHostReadReader(entry.reader, `survey reader ${entry.sourceId}`);
    if (entry.status !== "surveyed" && entry.status !== "excluded-by-manager") {
      throw new Error(`Survey status is invalid: ${entry.sourceId}`);
    }
    if (!Array.isArray(entry.coverage) || entry.coverage.length < 1) throw new Error(`Survey coverage is empty: ${entry.sourceId}`);
    assertPartialCoverage(entry.coverage, registryEntry.sizeBytes, `survey.entries[${index}].coverage`);
    if (entry.status === "excluded-by-manager") {
      if (
        !isObject(entry.managerExclusion)
        || typeof entry.managerExclusion.decisionId !== "string"
        || entry.managerExclusion.actorRole !== "manager"
      ) {
        throw new Error(`Manager exclusion receipt is required: ${entry.sourceId}`);
      }
      assertSha(entry.managerExclusion.receiptSha256, `survey.entries[${index}].managerExclusion.receiptSha256`);
    } else if (entry.managerExclusion !== null) {
      throw new Error(`Surveyed source cannot carry a manager exclusion: ${entry.sourceId}`);
    }
  }
  assertNoRawBearingKeys(survey);
  return true;
}

export function validateDeepReadArtifact(deepRead, privateRegistry) {
  if (!isObject(deepRead) || deepRead.schemaVersion !== "genre-soul-deep-read/v1") {
    throw new Error("Deep-read artifact must use genre-soul-deep-read/v1.");
  }
  assertGenre(deepRead.genre);
  const registryEntry = resolveRegistryEntry(privateRegistry, deepRead.sourceId);
  assertSha(deepRead.sourceSha256, "deepRead.sourceSha256");
  if (deepRead.sourceSha256 !== registryEntry.sourceSha256 || deepRead.sourceSizeBytes !== registryEntry.sizeBytes) {
    throw new Error(`Deep-read source identity drift: ${deepRead.sourceId}`);
  }
  assertHostReadReader(deepRead.reader, "deep-read reader");
  assertIso(deepRead.completedAt, "deepRead.completedAt");
  assertFullByteCoverage(deepRead.coverage, registryEntry.sizeBytes, "deepRead.coverage");
  if (!Number.isInteger(deepRead.chapterCount) || deepRead.chapterCount < 1) {
    throw new Error("Deep-read chapterCount must be positive.");
  }
  if (!Array.isArray(deepRead.observationIds) || deepRead.observationIds.length < 1) {
    throw new Error("Deep-read must reference derived observations.");
  }
  assertNoRawBearingKeys(deepRead);
  return true;
}

export function validateGenreProfileArtifact(profile) {
  if (!isObject(profile) || profile.schemaVersion !== "genre-soul-analysis-profile/v1") {
    throw new Error("Genre profile must use genre-soul-analysis-profile/v1.");
  }
  assertGenre(profile.genre);
  if (typeof profile.soulId !== "string" || !profile.soulId || profile.version !== "v1") {
    throw new Error("Genre profile Soul identity is invalid.");
  }
  assertSha(profile.inventorySha256, "profile.inventorySha256");
  assertSha(profile.surveySha256, "profile.surveySha256");
  assertUniqueSorted(profile.deepReadReceiptSha256s, "profile.deepReadReceiptSha256s");
  if (profile.deepReadReceiptSha256s.length < 1 || profile.deepReadReceiptSha256s.some((value) => !SHA256.test(value))) {
    throw new Error("Genre profile requires full deep-read receipt SHA-256 values.");
  }
  const dimensions = [
    "worldConstraints",
    "protagonistRepeatedVerbs",
    "pressureAndOpposition",
    "rewardAndStatusCurrency",
    "nextChapterExpectedAction",
    "commercialEngines",
  ];
  if (!isObject(profile.dimensions)) throw new Error("Genre profile dimensions are required.");
  for (const key of dimensions) {
    if (!Array.isArray(profile.dimensions[key]) || profile.dimensions[key].length < 1) {
      throw new Error(`Genre profile dimension ${key} must be non-empty.`);
    }
  }
  if (
    !isObject(profile.contentNeutrality)
    || profile.contentNeutrality.automaticMoralGate !== false
    || profile.contentNeutrality.illegalityIsAutomaticFailure !== false
    || profile.contentNeutrality.userIntensityPreserved !== true
  ) {
    throw new Error("Genre profile content-neutrality boundary is invalid.");
  }
  const serialized = JSON.stringify(profile);
  for (const pattern of CONTENT_NEUTRAL_FORBIDDEN) {
    if (pattern.test(serialized)) throw new Error(`Genre profile contains a forbidden moralizing default: ${pattern}`);
  }
  assertNoRawBearingKeys(profile);
  return true;
}

export function validateManagerQaReceipt(receipt) {
  if (!isObject(receipt) || receipt.schemaVersion !== "genre-soul-manager-qa/v1") {
    throw new Error("Manager QA must use genre-soul-manager-qa/v1.");
  }
  assertGenre(receipt.genre);
  if (!isObject(receipt.manager) || receipt.manager.role !== "manager" || typeof receipt.manager.actorId !== "string") {
    throw new Error("Manager QA requires a named manager actor.");
  }
  assertIso(receipt.decidedAt, "managerQa.decidedAt");
  assertUniqueSorted(receipt.inputSha256s, "managerQa.inputSha256s");
  if (receipt.inputSha256s.some((value) => !SHA256.test(value))) throw new Error("Manager QA input SHA is invalid.");
  if (receipt.coveragePassed !== true || receipt.surfaceLeakScanPassed !== true || receipt.result !== "pass") {
    throw new Error("Manager QA cannot pass without coverage and zero-match leak scan.");
  }
  if (receipt.moralFitnessGate !== false || receipt.automaticRewrite !== false) {
    throw new Error("Manager QA must not install a moral-fitness gate or automatic rewrite.");
  }
  assertNoRawBearingKeys(receipt);
  return true;
}

export function validatePromotionEligibility(evidence) {
  if (!isObject(evidence) || evidence.schemaVersion !== "genre-soul-promotion-eligibility/v1") {
    throw new Error("Promotion evidence must use genre-soul-promotion-eligibility/v1.");
  }
  assertGenre(evidence.genre);
  if (evidence.status !== "pass") throw new Error("Promotion evidence status is not pass.");
  if (evidence.deepReadSourceCount < 3) throw new Error("Promotion requires at least three fully read sources.");
  if (evidence.reviewPacketSchema !== "firefly_review_packet/v2") throw new Error("Promotion requires Review Packet v2.");
  if (evidence.blindPairCount !== 3 || evidence.independentBlindRunCount !== 3) {
    throw new Error("Promotion requires three independent blind pairs.");
  }
  if (evidence.soulWins < 2 || evidence.averageCommercialScore < 85 || evidence.winningPairMinimumGain < 2) {
    throw new Error("Promotion commercial thresholds are not met.");
  }
  if (evidence.genreIdentityPassed !== 3) throw new Error("Promotion requires genre identity 3/3.");
  if (evidence.contentNeutralViolationCount !== 0 || evidence.unauthorizedCanonWriteCount !== 0) {
    throw new Error("Promotion has content-neutral or pre-decision canon violations.");
  }
  if (evidence.allSurfaceMatchesHumanClassified !== true || evidence.canonLeakCount !== 0) {
    throw new Error("Promotion surface comparison evidence is incomplete.");
  }
  if (evidence.managerQaPassed !== true || evidence.leakScanMatchCount !== 0) {
    throw new Error("Promotion requires manager QA and zero tracked-source matches.");
  }
  if (evidence.ownerDecisionRequired !== true || evidence.ownerDecisionId !== null) {
    throw new Error("Reference Lab eligibility must not claim the owner promotion decision.");
  }
  const exactThreeShaLists = [
    "reviewPacketSha256s",
    "blindReviewReceiptSha256s",
    "contentNeutralReceiptSha256s",
    "surfaceComparisonReceiptSha256s",
  ];
  for (const key of exactThreeShaLists) {
    assertUniqueSorted(evidence[key], `promotion.${key}`);
    if (evidence[key].length !== 3 || evidence[key].some((value) => !SHA256.test(value))) {
      throw new Error(`Promotion ${key} must contain exactly three full SHA-256 values.`);
    }
  }
  assertUniqueSorted(evidence.deepReadReceiptSha256s, "promotion.deepReadReceiptSha256s");
  if (evidence.deepReadReceiptSha256s.length < 3 || evidence.deepReadReceiptSha256s.some((value) => !SHA256.test(value))) {
    throw new Error("Promotion deep-read receipts must contain at least three full SHA-256 values.");
  }
  assertSha(evidence.managerQaReceiptSha256, "promotion.managerQaReceiptSha256");
  assertSha(evidence.leakScanReceiptSha256, "promotion.leakScanReceiptSha256");
  assertUniqueSorted(evidence.generationRunIds, "promotion.generationRunIds");
  assertUniqueSorted(evidence.blindRunIds, "promotion.blindRunIds");
  if (evidence.generationRunIds.length !== 6 || evidence.blindRunIds.length !== 3) {
    throw new Error("Promotion requires six isolated generation runs and three isolated blind runs.");
  }
  assertUniqueSorted(evidence.inputSha256s, "promotion.inputSha256s");
  if (evidence.inputSha256s.some((value) => !SHA256.test(value))) throw new Error("Promotion input SHA is invalid.");
  assertNoRawBearingKeys(evidence);
  return true;
}

function safeTrackedArtifactPath(repositoryRoot, artifactPath) {
  const absolute = resolve(artifactPath);
  const rel = relative(repositoryRoot, absolute);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel) || normalize(rel) !== rel) {
    throw new Error("Tracked projection path escaped Reference Lab.");
  }
  if (!/^(?:analyses\/genre_souls|inkos_handoffs\/genre-souls|comparisons\/genre-souls)\//u.test(rel)) {
    throw new Error("Tracked projection path is outside the allowed Soul projection roots.");
  }
  return { absolute, relative: rel };
}

function* rollingHashes(bytes, windowSize) {
  if (bytes.length < windowSize) return;
  const base = 257;
  let power = 1;
  for (let index = 1; index < windowSize; index += 1) power = Math.imul(power, base) >>> 0;
  let hash = 0;
  for (let index = 0; index < windowSize; index += 1) hash = (Math.imul(hash, base) + bytes[index]) >>> 0;
  yield { offset: 0, hash };
  for (let offset = 1; offset <= bytes.length - windowSize; offset += 1) {
    hash = (hash - Math.imul(bytes[offset - 1], power)) >>> 0;
    hash = (Math.imul(hash, base) + bytes[offset + windowSize - 1]) >>> 0;
    yield { offset, hash };
  }
}

function isUtf8Boundary(bytes, offset) {
  return offset === 0 || offset === bytes.length || (bytes[offset] & 0xc0) !== 0x80;
}

function tokenize(text) {
  return [...text.matchAll(/[가-힣A-Za-z0-9]+|[^\s]/gu)].map((match) => ({
    value: match[0],
    charStart: match.index,
    charEnd: match.index + match[0].length,
  }));
}

function buildArtifactNgrams(text, tokenCount) {
  const tokens = tokenize(text);
  const result = new Map();
  for (let index = 0; index <= tokens.length - tokenCount; index += 1) {
    const key = tokens.slice(index, index + tokenCount).map((token) => token.value).join("\u001f");
    if (!result.has(key)) result.set(key, { start: tokens[index].charStart, end: tokens[index + tokenCount - 1].charEnd });
  }
  return result;
}

export async function scanTrackedProjection(options) {
  const repositoryRoot = resolve(options.repositoryRoot);
  const artifact = safeTrackedArtifactPath(repositoryRoot, options.artifactPath);
  const artifactInfo = await lstat(artifact.absolute);
  if (!artifactInfo.isFile() || artifactInfo.isSymbolicLink()) throw new Error("Tracked projection must be a real file.");
  const artifactBytes = await readFile(artifact.absolute);
  const artifactText = artifactBytes.toString("utf8");
  if (Buffer.from(artifactText, "utf8").compare(artifactBytes) !== 0) throw new Error("Tracked projection must be valid UTF-8.");
  const { privateRegistry, receipt: registryReceipt } = await validateSourceRegistryFiles({
    repositoryRoot,
    privateRegistryPath: options.privateRegistryPath,
    inventoryPath: options.inventoryPath,
    receiptPath: options.registryReceiptPath ?? options.receiptPath,
  });
  const maxMatches = options.maxMatches ?? 100;
  const longWindowBytes = options.longWindowBytes ?? 120;
  const exactTokenCount = options.exactTokenCount ?? 12;
  const artifactWindowMap = new Map();
  for (const entry of rollingHashes(artifactBytes, longWindowBytes)) {
    if (!isUtf8Boundary(artifactBytes, entry.offset) || !isUtf8Boundary(artifactBytes, entry.offset + longWindowBytes)) continue;
    const offsets = artifactWindowMap.get(entry.hash) ?? [];
    offsets.push(entry.offset);
    artifactWindowMap.set(entry.hash, offsets);
  }
  const artifactNgrams = buildArtifactNgrams(artifactText, exactTokenCount);
  const matches = [];
  const seen = new Set();

  for (const source of privateRegistry.items.filter((entry) => entry.status === "available")) {
    if (matches.length >= maxMatches) break;
    const sourceBytes = await readFile(resolve(repositoryRoot, source.repoRelativePath));
    const sourceText = sourceBytes.toString("utf8");
    for (const window of rollingHashes(sourceBytes, longWindowBytes)) {
      if (!isUtf8Boundary(sourceBytes, window.offset) || !isUtf8Boundary(sourceBytes, window.offset + longWindowBytes)) continue;
      const candidateOffsets = artifactWindowMap.get(window.hash);
      if (!candidateOffsets) continue;
      for (const artifactStartByte of candidateOffsets) {
        if (sourceBytes.subarray(window.offset, window.offset + longWindowBytes)
          .compare(artifactBytes.subarray(artifactStartByte, artifactStartByte + longWindowBytes)) !== 0) continue;
        const key = `long:${source.sourceId}:${window.offset}:${artifactStartByte}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const slice = sourceBytes.subarray(window.offset, window.offset + longWindowBytes);
        matches.push({
          matchId: `match-${sha256(`${key}:${sha256(slice)}`).slice(0, 24)}`,
          method: "long-common-utf8-byte/v1",
          sourceId: source.sourceId,
          sourceSelector: { startByte: window.offset, endByte: window.offset + longWindowBytes, sliceSha256: sha256(slice) },
          artifactSelector: { startByte: artifactStartByte, endByte: artifactStartByte + longWindowBytes, sliceSha256: sha256(slice) },
          classification: "pending",
        });
        if (matches.length >= maxMatches) break;
      }
      if (matches.length >= maxMatches) break;
    }
    if (matches.length >= maxMatches) break;
    const sourceTokens = tokenize(sourceText);
    for (let index = 0; index <= sourceTokens.length - exactTokenCount; index += 1) {
      const key = sourceTokens.slice(index, index + exactTokenCount).map((token) => token.value).join("\u001f");
      const artifactRange = artifactNgrams.get(key);
      if (!artifactRange) continue;
      const sourceStartByte = Buffer.byteLength(sourceText.slice(0, sourceTokens[index].charStart));
      const sourceEndByte = Buffer.byteLength(sourceText.slice(0, sourceTokens[index + exactTokenCount - 1].charEnd));
      const artifactStartByte = Buffer.byteLength(artifactText.slice(0, artifactRange.start));
      const artifactEndByte = Buffer.byteLength(artifactText.slice(0, artifactRange.end));
      const signature = `tokens:${source.sourceId}:${sourceStartByte}:${artifactStartByte}`;
      if (seen.has(signature)) continue;
      seen.add(signature);
      const sourceSlice = sourceBytes.subarray(sourceStartByte, sourceEndByte);
      const artifactSlice = artifactBytes.subarray(artifactStartByte, artifactEndByte);
      matches.push({
        matchId: `match-${sha256(`${signature}:${sha256(sourceSlice)}`).slice(0, 24)}`,
        method: "exact-token-sequence/v1",
        tokenCount: exactTokenCount,
        sourceId: source.sourceId,
        sourceSelector: { startByte: sourceStartByte, endByte: sourceEndByte, sliceSha256: sha256(sourceSlice) },
        artifactSelector: { startByte: artifactStartByte, endByte: artifactEndByte, sliceSha256: sha256(artifactSlice) },
        classification: "pending",
      });
      if (matches.length >= maxMatches) break;
    }
  }
  const result = {
    schemaVersion: "tracked-projection-leak-scan/v1",
    scanner: {
      version: "genre-soul-surface-scanner/v1",
      exactTokenCount,
      longCommonUtf8Bytes: longWindowBytes,
    },
    artifact: { path: artifact.relative, sha256: sha256(artifactBytes), sizeBytes: artifactBytes.byteLength },
    corpus: {
      privateRegistrySha256: registryReceipt.privateRegistrySha256,
      availableSourceCount: privateRegistry.items.filter((entry) => entry.status === "available").length,
    },
    matchCount: matches.length,
    matches,
    truncated: matches.length >= maxMatches,
    status: matches.length === 0 ? "pass" : "quarantine",
    automaticRewrite: false,
    automaticReject: false,
  };
  assertNoRawBearingKeys(result);
  return result;
}
