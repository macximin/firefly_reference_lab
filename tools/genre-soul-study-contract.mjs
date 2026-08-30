#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, join, normalize, relative, resolve, sep } from "node:path";

import {
  resolveSoulInputRegistryEntry,
  validateSourceRegistryFiles,
} from "./genre-soul-source-registry.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const FICTION_CONTENT_CONTRACT_SHA256 = "c5b531577cbfbfb1dfc4cd2b5cb82d7ce796c6958e0bc00c3e180b0e5440e199";
const SAFE_SOURCE_ID = /^gdrive-[A-Za-z0-9_-]+$/u;
const GENRES = new Set(["modern-fantasy-ko", "fantasy-ko", "murim-ko"]);
const PROFILE_SELECTION_BASES = ["commercial-anchor", "genre-breadth", "surface-anchor"];
const PROFILE_CLASSIFICATIONS = new Set(["genre-common", "conditional", "source-specific", "failure"]);
const PROFILE_DIMENSIONS = [
  "worldConstraints",
  "protagonistRepeatedVerbs",
  "pressureAndOpposition",
  "rewardAndStatusCurrency",
  "nextChapterExpectedAction",
  "commercialEngines",
  "emotionalCoherence",
  "arcAndGrowth",
  "failurePatterns",
];
const COMMERCIAL_ENGINE_MECHANISM_KEYS = [
  "protagonistRepeatedVerb",
  "pressure",
  "activeChoice",
  "resistance",
  "payoff",
  "recognition",
];
const DEEP_READ_OBSERVATION_KINDS = new Set([
  "commercial-engine",
  "protagonist-action",
  "pressure-resistance",
  "payoff-witness",
  "emotional-coherence",
  "surface-style",
  "failure-pattern",
  "ending-promise",
]);
const FORBIDDEN_TRACKED_KEYS = /^(?:body|text|prose|quote|excerpt|raw|rawText|rawProse|sourceText)$/iu;
const FICTIONAL_CONTENT_TOPIC = "(?:범죄|폭력|강압|강제|협박|불법|위법|성별|젠더|편견|차별)";
const MANDATORY_POLICY = "(?:반드시|무조건|항상|자동(?:으로)?|일괄(?:적으로)?)";
const CENSOR_ACTION = "(?:금지|거절|삭제|정화|완화|순화|감점)(?!하지)";
const CONTENT_NEUTRAL_FORBIDDEN = [
  new RegExp(`${FICTIONAL_CONTENT_TOPIC}.{0,40}${MANDATORY_POLICY}.{0,16}${CENSOR_ACTION}`, "u"),
  new RegExp(`${FICTIONAL_CONTENT_TOPIC}.{0,40}${CENSOR_ACTION}.{0,16}${MANDATORY_POLICY}`, "u"),
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(value, expected, label) {
  if (!isObject(value)) throw new Error(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} keys must be exactly ${wanted.join(", ")}.`);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} must be a non-empty string.`);
}

function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer.`);
}

function assertRepoRelativePath(value, label) {
  assertNonEmptyString(value, label);
  const normalized = normalize(value);
  if (
    isAbsolute(value)
    || value.includes("\\")
    || value.includes("\0")
    || normalized !== value
    || normalized === "."
    || normalized === ".."
    || normalized.startsWith(`..${sep}`)
  ) {
    throw new Error(`${label} must stay inside the repository.`);
  }
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

function assertNoMandatoryContentCensorship(value, label, path = "$") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoMandatoryContentCensorship(item, label, `${path}[${index}]`));
    return;
  }
  if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      assertNoMandatoryContentCensorship(child, label, `${path}.${key}`);
    }
    return;
  }
  if (typeof value !== "string") return;
  for (const pattern of CONTENT_NEUTRAL_FORBIDDEN) {
    if (pattern.test(value)) {
      throw new Error(`${label} contains a forbidden mandatory content-censorship policy at ${path}.`);
    }
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
  assertExactKeys(reader, [
    "runId", "model", "reasoningEffort", "configSha256", "traceReceiptSha256",
  ], label);
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
  assertExactKeys(survey, [
    "schemaVersion", "genre", "completedAt", "candidateSourceIds", "entries",
  ], "survey");
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
    assertExactKeys(entry, [
      "sourceId", "sourceSha256", "reader", "status", "coverage", "managerExclusion", "observationIds",
    ], `survey.entries[${index}]`);
    const registryEntry = resolveSoulInputRegistryEntry(privateRegistry, entry.sourceId, survey.genre);
    assertSha(entry.sourceSha256, `survey.entries[${index}].sourceSha256`);
    if (entry.sourceSha256 !== registryEntry.sourceSha256) throw new Error(`Survey source SHA drift: ${entry.sourceId}`);
    assertHostReadReader(entry.reader, `survey reader ${entry.sourceId}`);
    if (entry.status !== "surveyed" && entry.status !== "excluded-by-manager") {
      throw new Error(`Survey status is invalid: ${entry.sourceId}`);
    }
    if (!Array.isArray(entry.coverage) || entry.coverage.length < 1) throw new Error(`Survey coverage is empty: ${entry.sourceId}`);
    entry.coverage.forEach((range, rangeIndex) => {
      assertExactKeys(range, ["startByte", "endByte"], `survey.entries[${index}].coverage[${rangeIndex}]`);
    });
    assertPartialCoverage(entry.coverage, registryEntry.sizeBytes, `survey.entries[${index}].coverage`);
    if (entry.status === "excluded-by-manager") {
      assertExactKeys(entry.managerExclusion, [
        "decisionId", "actorRole", "receiptSha256",
      ], `survey.entries[${index}].managerExclusion`);
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
    assertUniqueSorted(entry.observationIds, `survey.entries[${index}].observationIds`);
  }
  assertNoRawBearingKeys(survey);
  return true;
}

export function validateDeepReadArtifact(deepRead, privateRegistry) {
  if (!isObject(deepRead) || deepRead.schemaVersion !== "genre-soul-deep-read/v1") {
    throw new Error("Deep-read artifact must use genre-soul-deep-read/v1.");
  }
  assertExactKeys(deepRead, [
    "schemaVersion", "genre", "sourceId", "sourceSha256", "sourceSizeBytes", "reader", "completedAt",
    "coverage", "chapterCount", "observationIds",
  ], "deepRead");
  assertGenre(deepRead.genre);
  const registryEntry = resolveSoulInputRegistryEntry(privateRegistry, deepRead.sourceId, deepRead.genre);
  assertSha(deepRead.sourceSha256, "deepRead.sourceSha256");
  if (deepRead.sourceSha256 !== registryEntry.sourceSha256 || deepRead.sourceSizeBytes !== registryEntry.sizeBytes) {
    throw new Error(`Deep-read source identity drift: ${deepRead.sourceId}`);
  }
  assertHostReadReader(deepRead.reader, "deep-read reader");
  assertIso(deepRead.completedAt, "deepRead.completedAt");
  if (!Array.isArray(deepRead.coverage)) throw new Error("Deep-read coverage must be an array.");
  deepRead.coverage.forEach((range, index) => {
    assertExactKeys(range, ["startByte", "endByte"], `deepRead.coverage[${index}]`);
  });
  assertFullByteCoverage(deepRead.coverage, registryEntry.sizeBytes, "deepRead.coverage");
  if (!Number.isInteger(deepRead.chapterCount) || deepRead.chapterCount < 1) {
    throw new Error("Deep-read chapterCount must be positive.");
  }
  assertUniqueSorted(deepRead.observationIds, "deepRead.observationIds");
  assertNoRawBearingKeys(deepRead);
  return true;
}

function assertBoundReference(reference, label, extraKeys = []) {
  assertExactKeys(reference, ["path", "sha256", "sizeBytes", ...extraKeys], label);
  assertRepoRelativePath(reference.path, `${label}.path`);
  assertSha(reference.sha256, `${label}.sha256`);
  assertPositiveInteger(reference.sizeBytes, `${label}.sizeBytes`);
}

function normalizeCommercialMechanism(mechanism, label = "commercialEngine.mechanism") {
  assertExactKeys(mechanism, COMMERCIAL_ENGINE_MECHANISM_KEYS, label);
  return Object.fromEntries(COMMERCIAL_ENGINE_MECHANISM_KEYS.map((key) => {
    assertNonEmptyString(mechanism[key], `${label}.${key}`);
    const normalized = mechanism[key].normalize("NFC").trim().replace(/\s+/gu, " ");
    if (mechanism[key] !== normalized) {
      throw new Error(`${label}.${key} must already use host-normalized NFC and whitespace.`);
    }
    return [key, normalized];
  }));
}

export function computePrimaryCommercialEngineSignature(sourceId, mechanism) {
  if (!SAFE_SOURCE_ID.test(sourceId ?? "")) throw new Error("Commercial engine sourceId is invalid.");
  const normalizedMechanism = normalizeCommercialMechanism(mechanism);
  return sha256(JSON.stringify({
    schemaVersion: "genre-soul-commercial-engine-signature/v1",
    sourceId,
    mechanism: normalizedMechanism,
  }));
}

export function computeCommercialMechanismSignature(mechanism) {
  const normalizedMechanism = normalizeCommercialMechanism(mechanism);
  return sha256(JSON.stringify({
    schemaVersion: "genre-soul-commercial-mechanism-signature/v1",
    mechanism: normalizedMechanism,
  }));
}

function assertEvidenceItem(evidence, sourceBindings, label, options = {}) {
  const expectedKeys = ["sourceId", "observationId", "segmentId", "kind", "selectors"];
  if (options.requireSpan) expectedKeys.push("span");
  assertExactKeys(evidence, expectedKeys, label);
  const source = sourceBindings.get(evidence.sourceId);
  if (!source) throw new Error(`${label}.sourceId is outside the exact profile source set.`);
  assertNonEmptyString(evidence.observationId, `${label}.observationId`);
  if (!/^s\d{4}$/u.test(evidence.segmentId ?? "")) throw new Error(`${label}.segmentId is invalid.`);
  if (!DEEP_READ_OBSERVATION_KINDS.has(evidence.kind)) throw new Error(`${label}.kind is invalid.`);
  if (options.requireSpan && !["early", "middle", "late"].includes(evidence.span)) {
    throw new Error(`${label}.span must be early, middle, or late.`);
  }
  if (!Array.isArray(evidence.selectors) || evidence.selectors.length < 1) {
    throw new Error(`${label}.selectors must contain at least one UTF-8 byte selector.`);
  }
  let previousEnd = -1;
  for (const [index, selector] of evidence.selectors.entries()) {
    const selectorLabel = `${label}.selectors[${index}]`;
    assertExactKeys(selector, ["type", "startByte", "endByte"], selectorLabel);
    if (selector.type !== "utf8-byte") throw new Error(`${selectorLabel}.type must be utf8-byte.`);
    assertRange(selector, source.sourceSizeBytes, selectorLabel);
    if (selector.startByte < previousEnd) throw new Error(`${label}.selectors must be sorted and non-overlapping.`);
    previousEnd = selector.endByte;
  }
}

function assertEvidenceSupport(evidenceItems, sourceIds, sourceBindings, label, options = {}) {
  if (!Array.isArray(evidenceItems) || evidenceItems.length < 1) {
    throw new Error(`${label} must contain evidence.`);
  }
  const observationKeys = new Set();
  for (const [index, evidence] of evidenceItems.entries()) {
    assertEvidenceItem(evidence, sourceBindings, `${label}[${index}]`, options);
    const observationKey = `${evidence.sourceId}:${evidence.observationId}`;
    if (observationKeys.has(observationKey)) throw new Error(`${label} contains duplicate observation evidence.`);
    observationKeys.add(observationKey);
  }
  const evidenceSourceIds = [...new Set(evidenceItems.map((entry) => entry.sourceId))].sort();
  if (JSON.stringify(evidenceSourceIds) !== JSON.stringify([...sourceIds].sort())) {
    throw new Error(`${label} source support must exactly match its declared sourceIds.`);
  }
}

export function validateGenreProfileArtifact(profile) {
  if (!isObject(profile) || profile.schemaVersion !== "genre-soul-analysis-profile/v1") {
    throw new Error("Genre profile must use genre-soul-analysis-profile/v1.");
  }
  assertExactKeys(profile, [
    "schemaVersion",
    "state",
    "genre",
    "soulId",
    "version",
    "generatedAt",
    "evidenceSet",
    "synthesis",
    "patterns",
    "primaryCommercialEngines",
    "dimensions",
    "contentNeutrality",
    "authority",
  ], "profile");
  if (profile.state !== "candidate") throw new Error("Genre profile state must be candidate.");
  assertGenre(profile.genre);
  if (profile.soulId !== `male-${profile.genre}` || profile.version !== "v1") {
    throw new Error("Genre profile Soul identity is invalid.");
  }
  assertIso(profile.generatedAt, "profile.generatedAt");

  assertExactKeys(profile.evidenceSet, ["managerSelection", "inventory", "registryReceipt", "sources"], "profile.evidenceSet");
  assertBoundReference(profile.evidenceSet.managerSelection, "profile.evidenceSet.managerSelection");
  assertBoundReference(profile.evidenceSet.inventory, "profile.evidenceSet.inventory");
  assertBoundReference(profile.evidenceSet.registryReceipt, "profile.evidenceSet.registryReceipt", ["privateRegistrySha256"]);
  assertSha(profile.evidenceSet.registryReceipt.privateRegistrySha256, "profile.evidenceSet.registryReceipt.privateRegistrySha256");
  const expectedEvidencePaths = {
    managerSelection: "evidence/genre-souls/male-manager-selection.v1.json",
    inventory: "evidence/genre-souls/male-source-inventory.v1.json",
    registryReceipt: "evidence/genre-souls/male-source-registry-receipt.v1.json",
  };
  for (const [key, expectedPath] of Object.entries(expectedEvidencePaths)) {
    if (profile.evidenceSet[key].path !== expectedPath) {
      throw new Error(`profile.evidenceSet.${key}.path must bind ${expectedPath}.`);
    }
  }
  if (!Array.isArray(profile.evidenceSet.sources) || profile.evidenceSet.sources.length !== 3) {
    throw new Error("Genre profile evidenceSet must bind exactly three sources.");
  }
  const sourceBindings = new Map();
  for (const [index, source] of profile.evidenceSet.sources.entries()) {
    const label = `profile.evidenceSet.sources[${index}]`;
    assertExactKeys(source, [
      "sourceId",
      "selectionBasis",
      "sourceSha256",
      "sourceSizeBytes",
      "chapterCount",
      "trackedStudy",
      "privateBundle",
      "trackedLeakReceipt",
    ], label);
    if (!SAFE_SOURCE_ID.test(source.sourceId ?? "")) throw new Error(`${label}.sourceId is invalid.`);
    if (sourceBindings.has(source.sourceId)) throw new Error(`Genre profile source binding is duplicated: ${source.sourceId}`);
    if (source.selectionBasis !== PROFILE_SELECTION_BASES[index]) {
      throw new Error(`Genre profile selection bases must be exactly ${PROFILE_SELECTION_BASES.join(", ")} in canonical order.`);
    }
    assertSha(source.sourceSha256, `${label}.sourceSha256`);
    assertPositiveInteger(source.sourceSizeBytes, `${label}.sourceSizeBytes`);
    assertPositiveInteger(source.chapterCount, `${label}.chapterCount`);
    assertBoundReference(source.trackedStudy, `${label}.trackedStudy`);
    assertBoundReference(source.privateBundle, `${label}.privateBundle`);
    assertBoundReference(source.trackedLeakReceipt, `${label}.trackedLeakReceipt`);
    const expectedTrackedStudyPath = `analyses/genre_souls/${profile.soulId}/v1/work-studies/${source.sourceId}.deep-read.json`;
    const expectedTrackedLeakPath = `analyses/genre_souls/${profile.soulId}/v1/leak-scan-receipts/${source.sourceId}.deep-read.json`;
    if (source.trackedStudy.path !== expectedTrackedStudyPath) {
      throw new Error(`${label}.trackedStudy.path must bind ${expectedTrackedStudyPath}.`);
    }
    if (source.trackedLeakReceipt.path !== expectedTrackedLeakPath) {
      throw new Error(`${label}.trackedLeakReceipt.path must bind ${expectedTrackedLeakPath}.`);
    }
    const privateBundleBase = `exports/genre-souls/${profile.soulId}/v1/deep-read-runs/${source.sourceId}`;
    const legacyPrivateBundlePath = `${privateBundleBase}/deep-read-receipt.json`;
    const currentPrivateBundlePattern = new RegExp(`^${privateBundleBase}/runs/[0-9a-f]{64}/deep-read-receipt\\.json$`, "u");
    if (
      source.privateBundle.path !== legacyPrivateBundlePath
      && !currentPrivateBundlePattern.test(source.privateBundle.path)
    ) {
      throw new Error(`${label}.privateBundle.path must bind the exact legacy path or a content-addressed runs/<64hex>/deep-read-receipt.json path.`);
    }
    sourceBindings.set(source.sourceId, source);
  }

  const exactSourceIds = [...sourceBindings.keys()].sort();
  assertExactKeys(profile.synthesis, ["privateInput", "run", "contentContract", "truncation"], "profile.synthesis");
  assertExactKeys(profile.synthesis.privateInput, [
    "schemaVersion", "path", "sha256", "sizeBytes", "sourceIds", "observationCount", "selectorCount",
  ], "profile.synthesis.privateInput");
  if (profile.synthesis.privateInput.schemaVersion !== "private-genre-soul-profile-input/v1") {
    throw new Error("Profile synthesis private input schema is invalid.");
  }
  assertRepoRelativePath(profile.synthesis.privateInput.path, "profile.synthesis.privateInput.path");
  const privateInputPrefix = `exports/genre-souls/${profile.soulId}/v1/profile-runs/`;
  const privateInputSuffix = "/genre/input.json";
  const privateInputRunKey = profile.synthesis.privateInput.path.slice(
    privateInputPrefix.length,
    -privateInputSuffix.length,
  );
  if (
    !profile.synthesis.privateInput.path.startsWith(privateInputPrefix)
    || !profile.synthesis.privateInput.path.endsWith(privateInputSuffix)
    || !SHA256.test(privateInputRunKey)
  ) {
    throw new Error("Profile synthesis private input path must use a content-addressed profile-runs/<64hex>/genre/input.json path.");
  }
  assertSha(profile.synthesis.privateInput.sha256, "profile.synthesis.privateInput.sha256");
  assertPositiveInteger(profile.synthesis.privateInput.sizeBytes, "profile.synthesis.privateInput.sizeBytes");
  assertUniqueSorted(profile.synthesis.privateInput.sourceIds, "profile.synthesis.privateInput.sourceIds");
  if (JSON.stringify(profile.synthesis.privateInput.sourceIds) !== JSON.stringify(exactSourceIds)) {
    throw new Error("Profile synthesis private input must bind the exact three profile sources.");
  }
  assertPositiveInteger(profile.synthesis.privateInput.observationCount, "profile.synthesis.privateInput.observationCount");
  assertPositiveInteger(profile.synthesis.privateInput.selectorCount, "profile.synthesis.privateInput.selectorCount");
  assertExactKeys(profile.synthesis.run, [
    "runId", "model", "provider", "reasoningEffort", "configSha256", "traceReceiptSha256",
  ], "profile.synthesis.run");
  assertNonEmptyString(profile.synthesis.run.runId, "profile.synthesis.run.runId");
  if (
    profile.synthesis.run.model !== "gpt-5.6-sol"
    || profile.synthesis.run.provider !== "openai-codex"
    || profile.synthesis.run.reasoningEffort !== "high"
  ) {
    throw new Error("Profile synthesis run must be actual gpt-5.6-sol/openai-codex/high.");
  }
  assertSha(profile.synthesis.run.configSha256, "profile.synthesis.run.configSha256");
  assertSha(profile.synthesis.run.traceReceiptSha256, "profile.synthesis.run.traceReceiptSha256");
  assertExactKeys(profile.synthesis.contentContract, ["id", "sha256"], "profile.synthesis.contentContract");
  if (profile.synthesis.contentContract.id !== "fiction-content-neutral-ko/v1") {
    throw new Error("Profile synthesis content contract ID is invalid.");
  }
  assertSha(profile.synthesis.contentContract.sha256, "profile.synthesis.contentContract.sha256");
  if (profile.synthesis.contentContract.sha256 !== FICTION_CONTENT_CONTRACT_SHA256) {
    throw new Error("Profile synthesis content contract SHA-256 is not canonical.");
  }
  if (profile.synthesis.truncation !== false) throw new Error("Profile synthesis must prove truncation=false.");

  if (!Array.isArray(profile.patterns) || profile.patterns.length < PROFILE_DIMENSIONS.length) {
    throw new Error("Genre profile patterns must cover all nine dimensions.");
  }
  const patternIds = new Set();
  const patternDimensionById = new Map();
  for (const [index, pattern] of profile.patterns.entries()) {
    const label = `profile.patterns[${index}]`;
    assertExactKeys(pattern, [
      "patternId", "dimension", "classification", "guidance", "commercialFunction", "sourceIds", "evidence",
    ], label);
    assertNonEmptyString(pattern.patternId, `${label}.patternId`);
    if (patternIds.has(pattern.patternId)) throw new Error(`Genre profile pattern ID is duplicated: ${pattern.patternId}`);
    patternIds.add(pattern.patternId);
    if (!PROFILE_DIMENSIONS.includes(pattern.dimension)) throw new Error(`${label}.dimension is invalid.`);
    if (!PROFILE_CLASSIFICATIONS.has(pattern.classification)) throw new Error(`${label}.classification is invalid.`);
    if ((pattern.dimension === "failurePatterns") !== (pattern.classification === "failure")) {
      throw new Error("Only failurePatterns may use classification=failure, and every failurePatterns entry must use it.");
    }
    assertNonEmptyString(pattern.guidance, `${label}.guidance`);
    assertNonEmptyString(pattern.commercialFunction, `${label}.commercialFunction`);
    assertUniqueSorted(pattern.sourceIds, `${label}.sourceIds`);
    if (pattern.sourceIds.some((sourceId) => !sourceBindings.has(sourceId))) {
      throw new Error(`${label}.sourceIds must stay inside the exact profile source set.`);
    }
    if (pattern.classification === "genre-common" && pattern.sourceIds.length !== 3) {
      throw new Error(`${label} genre-common source support must contain exactly three sources.`);
    }
    if (pattern.classification === "conditional" && ![2, 3].includes(pattern.sourceIds.length)) {
      throw new Error(`${label} conditional source support must contain two or three sources.`);
    }
    if (pattern.classification === "source-specific" && pattern.sourceIds.length !== 1) {
      throw new Error(`${label} source-specific source support must contain exactly one source.`);
    }
    assertEvidenceSupport(pattern.evidence, pattern.sourceIds, sourceBindings, `${label}.evidence`);
    patternDimensionById.set(pattern.patternId, pattern.dimension);
  }

  assertExactKeys(profile.dimensions, PROFILE_DIMENSIONS, "profile.dimensions");
  const partitionIds = [];
  for (const dimension of PROFILE_DIMENSIONS) {
    assertUniqueSorted(profile.dimensions[dimension], `profile.dimensions.${dimension}`);
    for (const patternId of profile.dimensions[dimension]) {
      if (!patternIds.has(patternId)) throw new Error(`profile.dimensions.${dimension} references an unknown pattern ID.`);
      if (patternDimensionById.get(patternId) !== dimension) {
        throw new Error(`profile.dimensions.${dimension} contains a pattern assigned to another dimension.`);
      }
      partitionIds.push(patternId);
    }
  }
  if (
    partitionIds.length !== patternIds.size
    || new Set(partitionIds).size !== patternIds.size
    || [...patternIds].some((patternId) => !partitionIds.includes(patternId))
  ) {
    throw new Error("Genre profile dimensions must form an exact partition of all pattern IDs.");
  }

  if (!Array.isArray(profile.primaryCommercialEngines) || profile.primaryCommercialEngines.length !== 3) {
    throw new Error("Genre profile requires exactly three primary commercial engines.");
  }
  const engineSources = new Set();
  const engineIds = new Set();
  for (const [index, engine] of profile.primaryCommercialEngines.entries()) {
    const label = `profile.primaryCommercialEngines[${index}]`;
    assertExactKeys(engine, ["engineId", "sourceId", "mechanism", "signatureSha256", "evidence"], label);
    if (!sourceBindings.has(engine.sourceId)) throw new Error(`${label}.sourceId is outside the exact profile source set.`);
    if (engineSources.has(engine.sourceId)) throw new Error("Primary commercial engines must bind one distinct engine per source.");
    engineSources.add(engine.sourceId);
    const expectedSignature = computePrimaryCommercialEngineSignature(engine.sourceId, engine.mechanism);
    assertSha(engine.signatureSha256, `${label}.signatureSha256`);
    if (engine.signatureSha256 !== expectedSignature) throw new Error(`${label}.signatureSha256 is not host-normalized.`);
    const expectedEngineId = `engine-${expectedSignature.slice(0, 24)}`;
    if (engine.engineId !== expectedEngineId) throw new Error(`${label}.engineId must be ${expectedEngineId}.`);
    if (engineIds.has(engine.engineId)) throw new Error("Primary commercial engine ID is duplicated.");
    engineIds.add(engine.engineId);
    assertEvidenceSupport(engine.evidence, [engine.sourceId], sourceBindings, `${label}.evidence`, { requireSpan: true });
    const spans = engine.evidence.map((entry) => entry.span).sort();
    if (JSON.stringify(spans) !== JSON.stringify(["early", "late", "middle"])) {
      throw new Error(`${label}.evidence must contain exactly one early, middle, and late span.`);
    }
  }
  if (engineSources.size !== sourceBindings.size) {
    throw new Error("Primary commercial engines must cover the exact profile source set.");
  }

  assertExactKeys(profile.contentNeutrality, [
    "automaticMoralGate", "illegalityIsAutomaticFailure", "userIntensityPreserved",
  ], "profile.contentNeutrality");
  if (
    profile.contentNeutrality.automaticMoralGate !== false
    || profile.contentNeutrality.illegalityIsAutomaticFailure !== false
    || profile.contentNeutrality.userIntensityPreserved !== true
  ) {
    throw new Error("Genre profile content-neutrality boundary is invalid.");
  }
  assertExactKeys(profile.authority, [
    "scope", "mayWriteInkOSCanon", "mayPromoteSoul", "ownerDecisionRequired",
  ], "profile.authority");
  if (
    profile.authority.scope !== "analysis-only"
    || profile.authority.mayWriteInkOSCanon !== false
    || profile.authority.mayPromoteSoul !== false
    || profile.authority.ownerDecisionRequired !== true
  ) {
    throw new Error("Genre profile authority must remain analysis-only and owner-separated.");
  }
  assertNoMandatoryContentCensorship(profile, "Genre profile");
  assertNoRawBearingKeys(profile);
  return true;
}

export function validateManagerQaReceipt(receipt, context = {}) {
  if (!isObject(receipt) || receipt.schemaVersion !== "genre-soul-manager-qa/v1") {
    throw new Error("Manager QA must use genre-soul-manager-qa/v1.");
  }
  const receiptKeys = [
    "schemaVersion",
    "state",
    "genre",
    "soulId",
    "version",
    "profile",
    "privateInput",
    "manager",
    "decidedAt",
    "sources",
    "engineComparisons",
    "checks",
    "contentNeutrality",
    "authority",
    "result",
  ];
  if (Object.hasOwn(receipt, "surfaceReview")) receiptKeys.push("surfaceReview");
  assertExactKeys(receipt, receiptKeys, "managerQa");
  if (receipt.state !== "candidate-qa-passed" || receipt.result !== "pass") {
    throw new Error("Manager QA state and result must remain candidate-qa-passed/pass.");
  }
  assertGenre(receipt.genre);
  if (receipt.soulId !== `male-${receipt.genre}` || receipt.version !== "v1") {
    throw new Error("Manager QA Soul identity is invalid.");
  }

  assertExactKeys(receipt.profile, [
    "path", "sha256", "sizeBytes", "synthesisRunId", "leakScanReceipt",
  ], "managerQa.profile");
  assertRepoRelativePath(receipt.profile.path, "managerQa.profile.path");
  const expectedProfilePath = `analyses/genre_souls/${receipt.soulId}/v1/genre-profile.json`;
  if (receipt.profile.path !== expectedProfilePath) {
    throw new Error(`Manager QA profile path must bind ${expectedProfilePath}.`);
  }
  assertSha(receipt.profile.sha256, "managerQa.profile.sha256");
  assertPositiveInteger(receipt.profile.sizeBytes, "managerQa.profile.sizeBytes");
  assertNonEmptyString(receipt.profile.synthesisRunId, "managerQa.profile.synthesisRunId");
  assertBoundReference(receipt.profile.leakScanReceipt, "managerQa.profile.leakScanReceipt");
  const expectedProfileLeakPath = `analyses/genre_souls/${receipt.soulId}/v1/leak-scan-receipts/genre-profile.json`;
  if (receipt.profile.leakScanReceipt.path !== expectedProfileLeakPath) {
    throw new Error(`Manager QA profile leak receipt must bind ${expectedProfileLeakPath}.`);
  }

  assertExactKeys(receipt.privateInput, [
    "schemaVersion", "path", "sha256", "sizeBytes", "sourceIds", "rawSampleCount",
  ], "managerQa.privateInput");
  if (receipt.privateInput.schemaVersion !== "private-genre-soul-manager-qa-input/v1") {
    throw new Error("Manager QA private input schema is invalid.");
  }
  assertRepoRelativePath(receipt.privateInput.path, "managerQa.privateInput.path");
  const privateInputPrefix = `exports/genre-souls/${receipt.soulId}/v1/manager-qa-runs/`;
  const privateInputSuffix = "/input.json";
  const privateInputRunKey = receipt.privateInput.path.slice(
    privateInputPrefix.length,
    -privateInputSuffix.length,
  );
  if (
    !receipt.privateInput.path.startsWith(privateInputPrefix)
    || !receipt.privateInput.path.endsWith(privateInputSuffix)
    || !SHA256.test(privateInputRunKey)
  ) {
    throw new Error("Manager QA private input must use manager-qa-runs/<64hex>/input.json.");
  }
  assertSha(receipt.privateInput.sha256, "managerQa.privateInput.sha256");
  assertPositiveInteger(receipt.privateInput.sizeBytes, "managerQa.privateInput.sizeBytes");
  assertUniqueSorted(receipt.privateInput.sourceIds, "managerQa.privateInput.sourceIds");
  if (receipt.privateInput.sourceIds.length !== 3 || receipt.privateInput.rawSampleCount !== 9) {
    throw new Error("Manager QA requires exactly three sources and nine raw samples.");
  }

  assertExactKeys(receipt.manager, [
    "actorId",
    "role",
    "runId",
    "model",
    "provider",
    "reasoningEffort",
    "configSha256",
    "traceReceiptSha256",
    "outputSha256",
  ], "managerQa.manager");
  if (receipt.manager.role !== "manager") throw new Error("Manager QA requires manager role.");
  assertNonEmptyString(receipt.manager.actorId, "managerQa.manager.actorId");
  assertNonEmptyString(receipt.manager.runId, "managerQa.manager.runId");
  if (receipt.manager.runId === receipt.profile.synthesisRunId) {
    throw new Error("Manager QA must use a run separate from profile synthesis.");
  }
  if (
    receipt.manager.model !== "gpt-5.6-sol"
    || receipt.manager.provider !== "openai-codex"
    || receipt.manager.reasoningEffort !== "high"
  ) {
    throw new Error("Manager QA must be actual gpt-5.6-sol/openai-codex/high.");
  }
  assertSha(receipt.manager.configSha256, "managerQa.manager.configSha256");
  assertSha(receipt.manager.traceReceiptSha256, "managerQa.manager.traceReceiptSha256");
  assertSha(receipt.manager.outputSha256, "managerQa.manager.outputSha256");
  assertIso(receipt.decidedAt, "managerQa.decidedAt");

  if (receipt.surfaceReview !== undefined) {
    const review = receipt.surfaceReview;
    assertExactKeys(review, [
      "schemaVersion", "gateVersion", "candidate", "request", "decision", "authority",
    ], "managerQa.surfaceReview");
    if (
      review.schemaVersion !== "genre-soul-manager-surface-review-proof/v1"
      || review.gateVersion !== "genre-soul-protected-surface-hil/v1"
    ) throw new Error("Manager QA surface review proof schema or gate version drifted.");
    assertExactKeys(review.candidate, ["path", "sha256", "sizeBytes"], "managerQa.surfaceReview.candidate");
    assertExactKeys(review.request, ["path", "sha256", "sizeBytes"], "managerQa.surfaceReview.request");
    assertExactKeys(review.decision, [
      "path", "sha256", "sizeBytes", "decisionId", "outcome", "decidedByRole",
    ], "managerQa.surfaceReview.decision");
    for (const [label, reference] of [
      ["candidate", review.candidate],
      ["request", review.request],
      ["decision", review.decision],
    ]) {
      assertRepoRelativePath(reference.path, `managerQa.surfaceReview.${label}.path`);
      assertSha(reference.sha256, `managerQa.surfaceReview.${label}.sha256`);
      assertPositiveInteger(reference.sizeBytes, `managerQa.surfaceReview.${label}.sizeBytes`);
    }
    const managerRunRoot = receipt.privateInput.path.slice(0, -privateInputSuffix.length);
    const candidateSuffix = "/surface-hil/candidate.json";
    const structuredPrefix = `${managerRunRoot}/structured-runs/`;
    if (
      !review.candidate.path.startsWith(structuredPrefix)
      || !review.candidate.path.endsWith(candidateSuffix)
    ) throw new Error("Manager QA surface review candidate path is not bound to this private Manager run.");
    const structuredRunDigest = review.candidate.path.slice(
      structuredPrefix.length,
      -candidateSuffix.length,
    );
    if (!SHA256.test(structuredRunDigest)) {
      throw new Error("Manager QA surface review candidate path has an invalid structured-run digest.");
    }
    const surfaceRoot = review.candidate.path.slice(0, -"/candidate.json".length);
    if (
      review.request.path !== `${surfaceRoot}/requests/${review.request.sha256}.json`
      || review.decision.path !== `${surfaceRoot}/decisions/${review.request.sha256}.json`
    ) throw new Error("Manager QA surface review request or decision path is not bound to its exact candidate request.");
    if (
      !/^surface-decision-[0-9a-f]{24}$/u.test(review.decision.decisionId ?? "")
      || review.decision.outcome !== "approved"
      || review.decision.decidedByRole !== "owner"
    ) throw new Error("Manager QA surface review proof requires an exact approved owner decision.");
    assertExactKeys(review.authority, [
      "scope", "mayWriteInkOSCanon", "mayPromoteSoul",
    ], "managerQa.surfaceReview.authority");
    if (
      review.authority.scope !== "reference-lab-analysis-surface-only"
      || review.authority.mayWriteInkOSCanon !== false
      || review.authority.mayPromoteSoul !== false
    ) throw new Error("Manager QA surface review proof authority drifted.");
  }

  if (!Array.isArray(receipt.sources) || receipt.sources.length !== 3) {
    throw new Error("Manager QA must bind exactly three source audits.");
  }
  const expectedSourceIds = [...receipt.privateInput.sourceIds];
  const sourceById = new Map();
  const mechanismSignatures = new Set();
  for (const [index, source] of receipt.sources.entries()) {
    const label = `managerQa.sources[${index}]`;
    assertExactKeys(source, [
      "sourceId",
      "sourceSizeBytes",
      "engineId",
      "engineSignatureSha256",
      "mechanismSignatureSha256",
      "samples",
    ], label);
    if (!SAFE_SOURCE_ID.test(source.sourceId ?? "") || sourceById.has(source.sourceId)) {
      throw new Error(`${label}.sourceId is invalid or duplicated.`);
    }
    assertPositiveInteger(source.sourceSizeBytes, `${label}.sourceSizeBytes`);
    assertNonEmptyString(source.engineId, `${label}.engineId`);
    assertSha(source.engineSignatureSha256, `${label}.engineSignatureSha256`);
    assertSha(source.mechanismSignatureSha256, `${label}.mechanismSignatureSha256`);
    mechanismSignatures.add(source.mechanismSignatureSha256);
    if (!Array.isArray(source.samples) || source.samples.length !== 3) {
      throw new Error(`${label}.samples must contain exactly early, middle, and late.`);
    }
    const spans = [];
    for (const [sampleIndex, sample] of source.samples.entries()) {
      const sampleLabel = `${label}.samples[${sampleIndex}]`;
      assertExactKeys(sample, ["span", "observationId", "kind", "selector", "sliceSha256"], sampleLabel);
      if (!["early", "middle", "late"].includes(sample.span)) throw new Error(`${sampleLabel}.span is invalid.`);
      spans.push(sample.span);
      assertNonEmptyString(sample.observationId, `${sampleLabel}.observationId`);
      if (!DEEP_READ_OBSERVATION_KINDS.has(sample.kind)) throw new Error(`${sampleLabel}.kind is invalid.`);
      assertExactKeys(sample.selector, ["type", "startByte", "endByte"], `${sampleLabel}.selector`);
      if (sample.selector.type !== "utf8-byte") throw new Error(`${sampleLabel}.selector.type must be utf8-byte.`);
      assertRange(sample.selector, source.sourceSizeBytes, `${sampleLabel}.selector`);
      assertSha(sample.sliceSha256, `${sampleLabel}.sliceSha256`);
    }
    if (JSON.stringify(spans.sort()) !== JSON.stringify(["early", "late", "middle"])) {
      throw new Error(`${label}.samples must cover exactly early, middle, and late.`);
    }
    sourceById.set(source.sourceId, source);
  }
  if (JSON.stringify([...sourceById.keys()].sort()) !== JSON.stringify(expectedSourceIds)) {
    throw new Error("Manager QA source audits must match the exact private input sources.");
  }
  if (mechanismSignatures.size !== 3) {
    throw new Error("Manager QA cannot pass when primary commercial mechanisms are byte-identical.");
  }

  if (!Array.isArray(receipt.engineComparisons) || receipt.engineComparisons.length !== 3) {
    throw new Error("Manager QA requires all three pairwise engine comparisons.");
  }
  const expectedPairs = [];
  for (let leftIndex = 0; leftIndex < expectedSourceIds.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < expectedSourceIds.length; rightIndex += 1) {
      expectedPairs.push(`${expectedSourceIds[leftIndex]}::${expectedSourceIds[rightIndex]}`);
    }
  }
  const actualPairs = [];
  for (const [index, comparison] of receipt.engineComparisons.entries()) {
    const label = `managerQa.engineComparisons[${index}]`;
    assertExactKeys(comparison, [
      "comparisonId",
      "leftSourceId",
      "rightSourceId",
      "leftEngineId",
      "rightEngineId",
      "verdict",
      "semanticDifference",
      "commercialConsequence",
    ], label);
    if (comparison.leftSourceId >= comparison.rightSourceId) {
      throw new Error(`${label} sources must be in canonical ascending order.`);
    }
    const left = sourceById.get(comparison.leftSourceId);
    const right = sourceById.get(comparison.rightSourceId);
    if (!left || !right || comparison.leftEngineId !== left.engineId || comparison.rightEngineId !== right.engineId) {
      throw new Error(`${label} engine binding drifted.`);
    }
    const pair = `${comparison.leftSourceId}::${comparison.rightSourceId}`;
    const expectedComparisonId = `comparison-${sha256(pair).slice(0, 24)}`;
    if (comparison.comparisonId !== expectedComparisonId || comparison.verdict !== "different") {
      throw new Error(`${label} must prove a host-bound different verdict.`);
    }
    assertNonEmptyString(comparison.semanticDifference, `${label}.semanticDifference`);
    assertNonEmptyString(comparison.commercialConsequence, `${label}.commercialConsequence`);
    actualPairs.push(pair);
  }
  if (JSON.stringify(actualPairs.sort()) !== JSON.stringify(expectedPairs.sort())) {
    throw new Error("Manager QA pairwise comparisons are incomplete or duplicated.");
  }

  assertExactKeys(receipt.checks, [
    "profileEvidenceBinding",
    "exactSourceCoverage",
    "rawSampleReadback",
    "primaryEnginesPairwiseDifferent",
    "profileSurfaceLeakScanPassed",
    "contentNeutrality",
  ], "managerQa.checks");
  if (Object.values(receipt.checks).some((value) => value !== true)) {
    throw new Error("Manager QA cannot pass unless every deterministic check passes.");
  }

  assertExactKeys(receipt.contentNeutrality, [
    "moralFitnessGate", "automaticRewrite", "userIntensityPreserved",
  ], "managerQa.contentNeutrality");
  if (
    receipt.contentNeutrality.moralFitnessGate !== false
    || receipt.contentNeutrality.automaticRewrite !== false
    || receipt.contentNeutrality.userIntensityPreserved !== true
  ) {
    throw new Error("Manager QA must not install a moral-fitness gate or automatic rewrite.");
  }
  assertExactKeys(receipt.authority, [
    "scope", "mayWriteInkOSCanon", "mayPromoteSoul", "ownerDecisionRequired",
  ], "managerQa.authority");
  if (
    receipt.authority.scope !== "reference-lab-qa-only"
    || receipt.authority.mayWriteInkOSCanon !== false
    || receipt.authority.mayPromoteSoul !== false
    || receipt.authority.ownerDecisionRequired !== true
  ) {
    throw new Error("Manager QA authority must remain Reference-Lab-only and owner-separated.");
  }
  if (!isObject(context)) throw new Error("Manager QA validation context must be an object.");
  if (context.requireLiveBindings === true && (!context.expectedProfile || !context.expectedRunEvidence)) {
    throw new Error("Live Manager QA validation requires expectedProfile and expectedRunEvidence.");
  }
  if (context.expectedProfile !== undefined) {
    const profileContext = context.expectedProfile;
    const expectedProfile = profileContext.artifact ?? profileContext;
    validateGenreProfileArtifact(expectedProfile);
    if (
      expectedProfile.genre !== receipt.genre
      || expectedProfile.soulId !== receipt.soulId
      || expectedProfile.version !== receipt.version
      || expectedProfile.synthesis.run.runId !== receipt.profile.synthesisRunId
    ) throw new Error("Manager QA profile identity or synthesis run drifted from expectedProfile.");
    if (profileContext.artifact !== undefined) {
      if (
        profileContext.path !== receipt.profile.path
        || profileContext.sha256 !== receipt.profile.sha256
        || profileContext.sizeBytes !== receipt.profile.sizeBytes
      ) throw new Error("Manager QA profile byte binding drifted from expectedProfile.");
      if (profileContext.leakScanReceipt !== undefined) {
        const expectedLeak = profileContext.leakScanReceipt;
        if (
          expectedLeak.path !== receipt.profile.leakScanReceipt.path
          || expectedLeak.sha256 !== receipt.profile.leakScanReceipt.sha256
          || expectedLeak.sizeBytes !== receipt.profile.leakScanReceipt.sizeBytes
        ) throw new Error("Manager QA profile leak receipt binding drifted from expectedProfile.");
      }
    }
    const expectedSources = new Map(expectedProfile.evidenceSet.sources.map((source) => [source.sourceId, source]));
    const expectedEngines = new Map(expectedProfile.primaryCommercialEngines.map((engine) => [engine.sourceId, engine]));
    if (expectedSources.size !== receipt.sources.length || expectedEngines.size !== receipt.sources.length) {
      throw new Error("Manager QA expectedProfile source or engine count drifted.");
    }
    for (const source of receipt.sources) {
      const expectedSource = expectedSources.get(source.sourceId);
      const expectedEngine = expectedEngines.get(source.sourceId);
      if (
        !expectedSource
        || !expectedEngine
        || source.sourceSizeBytes !== expectedSource.sourceSizeBytes
        || source.engineId !== expectedEngine.engineId
        || source.engineSignatureSha256 !== expectedEngine.signatureSha256
        || source.mechanismSignatureSha256 !== computeCommercialMechanismSignature(expectedEngine.mechanism)
      ) throw new Error(`Manager QA source engine drifted from expectedProfile: ${source.sourceId}`);
    }
  }
  if (context.expectedRunEvidence !== undefined) {
    const runContext = context.expectedRunEvidence;
    const run = runContext.receipt ?? runContext;
    assertNonEmptyString(run.profileId, "Manager QA expected run profileId");
    assertNonEmptyString(run.runId, "Manager QA expected run runId");
    assertSha(run.profileConfigSha256, "Manager QA expected run profileConfigSha256");
    assertSha(run.resultSha256, "Manager QA expected run resultSha256");
    const hostReceiptSha256 = runContext.hostReceiptSha256 ?? runContext.traceReceiptSha256;
    assertSha(hostReceiptSha256, "Manager QA expected structured host receipt SHA-256");
    if (
      receipt.manager.actorId !== `hermes:${run.profileId}:${run.runId}`
      || receipt.manager.runId !== run.runId
      || receipt.manager.model !== run.model
      || receipt.manager.provider !== run.provider
      || receipt.manager.reasoningEffort !== run.reasoningEffort
      || receipt.manager.configSha256 !== run.profileConfigSha256
      || receipt.manager.traceReceiptSha256 !== hostReceiptSha256
      || receipt.manager.outputSha256 !== run.resultSha256
    ) throw new Error("Manager QA manager run drifted from expectedRunEvidence.");
  }
  assertNoMandatoryContentCensorship(receipt, "Manager QA");
  assertNoRawBearingKeys(receipt);
  return true;
}

export function validatePromotionEligibility(evidence) {
  if (!isObject(evidence) || evidence.schemaVersion !== "genre-soul-promotion-eligibility/v1") {
    throw new Error("Promotion evidence must use genre-soul-promotion-eligibility/v1.");
  }
  assertExactKeys(evidence, [
    "schemaVersion", "genre", "status", "deepReadSourceCount", "reviewPacketSchema", "blindPairCount",
    "independentBlindRunCount", "soulWins", "averageCommercialScore", "winningPairMinimumGain",
    "genreIdentityPassed", "contentNeutralViolationCount", "unauthorizedCanonWriteCount",
    "allSurfaceMatchesHumanClassified", "canonLeakCount", "managerQaPassed", "leakScanMatchCount",
    "ownerDecisionRequired", "ownerDecisionId", "deepReadReceiptSha256s", "reviewPacketSha256s",
    "blindReviewReceiptSha256s", "contentNeutralReceiptSha256s", "surfaceComparisonReceiptSha256s",
    "managerQaReceiptSha256", "leakScanReceiptSha256", "generationRunIds", "blindRunIds", "inputSha256s",
    "authority",
  ], "promotion");
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
  assertExactKeys(evidence.authority, [
    "scope", "mayWriteInkOSCanon", "mayPromoteSoul", "ownerDecisionRequired",
  ], "promotion.authority");
  if (
    evidence.authority.scope !== "analysis-only"
    || evidence.authority.mayWriteInkOSCanon !== false
    || evidence.authority.mayPromoteSoul !== false
    || evidence.authority.ownerDecisionRequired !== true
  ) {
    throw new Error("Promotion evidence authority must remain analysis-only, non-canonical, non-promoting, and owner-separated.");
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

function safeTrackedArtifactRelativePath(repositoryRoot, artifactRelativePath) {
  assertRepoRelativePath(artifactRelativePath, "Tracked projection relative path");
  return safeTrackedArtifactPath(repositoryRoot, resolve(repositoryRoot, artifactRelativePath));
}

async function assertTrackedProjectionAncestry(repositoryRoot, artifactPath, options = {}) {
  const root = resolve(repositoryRoot);
  const target = resolve(artifactPath);
  const rel = relative(root, target);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error("Tracked projection path escaped Reference Lab.");
  }
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error("Tracked projection repository root must be a real directory.");
  }
  let cursor = root;
  const parts = rel === "" ? [] : rel.split(sep);
  for (const [index, part] of parts.entries()) {
    cursor = join(cursor, part);
    let info;
    try {
      info = await lstat(cursor);
    } catch (error) {
      if (error?.code === "ENOENT" && options.requireTarget !== true) return;
      throw error;
    }
    if (info.isSymbolicLink()) throw new Error("Tracked projection path contains a symbolic-link ancestor.");
    if (index < parts.length - 1 && !info.isDirectory()) {
      throw new Error("Tracked projection path contains a non-directory ancestor.");
    }
  }
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

export function computeTrackedProjectionObservedSourceSetSha256(sourceBindings) {
  if (!Array.isArray(sourceBindings)) throw new Error("Tracked projection observed source set must be an array.");
  const sources = sourceBindings.map((binding, index) => {
    const label = `Tracked projection observed source set[${index}]`;
    assertExactKeys(binding, ["sourceId", "sourceSha256", "sizeBytes"], label);
    if (!SAFE_SOURCE_ID.test(binding.sourceId ?? "")) throw new Error(`${label}.sourceId is invalid.`);
    assertSha(binding.sourceSha256, `${label}.sourceSha256`);
    assertPositiveInteger(binding.sizeBytes, `${label}.sizeBytes`);
    return {
      sourceId: binding.sourceId,
      sourceSha256: binding.sourceSha256,
      sizeBytes: binding.sizeBytes,
    };
  }).sort((left, right) => (left.sourceId < right.sourceId ? -1 : left.sourceId > right.sourceId ? 1 : 0));
  if (new Set(sources.map((source) => source.sourceId)).size !== sources.length) {
    throw new Error("Tracked projection observed source IDs must be unique.");
  }
  return sha256(canonicalJsonBytes({
    schemaVersion: "tracked-projection-observed-source-set/v1",
    sources,
  }));
}

export function validateTrackedProjectionLeakReceipt(receipt, options = {}) {
  const label = options.label ?? "Tracked projection leak receipt";
  assertExactKeys(receipt, [
    "schemaVersion", "scanner", "artifact", "corpus", "matchCount", "matches", "truncated", "status",
    "automaticRewrite", "automaticReject",
  ], label);
  assertExactKeys(receipt.scanner, [
    "version", "exactTokenCount", "longCommonUtf8Bytes",
  ], `${label}.scanner`);
  assertExactKeys(receipt.artifact, ["path", "sha256", "sizeBytes"], `${label}.artifact`);
  assertExactKeys(receipt.corpus, [
    "privateRegistrySha256", "availableSourceCount", "observedSourceSetSha256",
  ], `${label}.corpus`);
  assertExactKeys(options.expectedArtifact, ["path", "sha256", "sizeBytes"], `${label} expected artifact`);
  assertExactKeys(options.expectedCorpus, [
    "privateRegistrySha256", "availableSourceCount", "observedSourceSetSha256",
  ], `${label} expected corpus`);
  assertRepoRelativePath(options.expectedArtifact.path, `${label} expected artifact path`);
  assertSha(options.expectedArtifact.sha256, `${label} expected artifact SHA-256`);
  assertPositiveInteger(options.expectedArtifact.sizeBytes, `${label} expected artifact sizeBytes`);
  assertSha(options.expectedCorpus.privateRegistrySha256, `${label} expected private registry SHA-256`);
  assertPositiveInteger(options.expectedCorpus.availableSourceCount, `${label} expected available source count`);
  assertSha(options.expectedCorpus.observedSourceSetSha256, `${label} expected observed source set SHA-256`);
  if (
    receipt.schemaVersion !== "tracked-projection-leak-scan/v1"
    || receipt.scanner.version !== "genre-soul-surface-scanner/v1"
    || receipt.scanner.exactTokenCount !== 12
    || receipt.scanner.longCommonUtf8Bytes !== 120
    || receipt.status !== "pass"
    || receipt.matchCount !== 0
    || !Array.isArray(receipt.matches)
    || receipt.matches.length !== 0
    || receipt.truncated !== false
    || receipt.automaticRewrite !== false
    || receipt.automaticReject !== false
    || JSON.stringify(receipt.artifact) !== JSON.stringify(options.expectedArtifact)
    || JSON.stringify(receipt.corpus) !== JSON.stringify(options.expectedCorpus)
  ) {
    throw new Error(`${label} is not a canonical zero-match byte- and corpus-bound pass receipt.`);
  }
  if (options.receiptBytes !== undefined) {
    if (!Buffer.isBuffer(options.receiptBytes)) throw new Error(`${label} canonical receipt bytes must be a buffer.`);
    if (options.receiptBytes.compare(canonicalJsonBytes(receipt)) !== 0) {
      throw new Error(`${label} is not canonical JSON.`);
    }
  }
  assertNoRawBearingKeys(receipt);
  return true;
}

async function readVerifiedProjectionSource(repositoryRoot, source) {
  const sourcePath = resolve(repositoryRoot, source.repoRelativePath);
  await assertTrackedProjectionAncestry(repositoryRoot, sourcePath, { requireTarget: true });
  const sourceInfo = await lstat(sourcePath);
  if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink()) {
    throw new Error(`Tracked projection source must be a real file: ${source.sourceId}`);
  }
  const bytes = await readFile(sourcePath);
  const observedSha256 = sha256(bytes);
  if (bytes.byteLength !== source.sizeBytes || observedSha256 !== source.sourceSha256) {
    throw new Error(`Tracked projection source byte drift: ${source.sourceId}`);
  }
  return {
    bytes,
    binding: {
      sourceId: source.sourceId,
      sourceSha256: observedSha256,
      sizeBytes: bytes.byteLength,
    },
  };
}

export async function scanTrackedProjectionBytes(options) {
  const repositoryRoot = resolve(options.repositoryRoot);
  const artifact = safeTrackedArtifactRelativePath(repositoryRoot, options.artifactRelativePath);
  await assertTrackedProjectionAncestry(repositoryRoot, artifact.absolute);
  if (!(Buffer.isBuffer(options.artifactBytes) || options.artifactBytes instanceof Uint8Array)) {
    throw new Error("Tracked projection candidate bytes must be a Buffer or Uint8Array.");
  }
  const artifactBytes = Buffer.from(options.artifactBytes);
  const artifactText = artifactBytes.toString("utf8");
  if (Buffer.from(artifactText, "utf8").compare(artifactBytes) !== 0) throw new Error("Tracked projection must be valid UTF-8.");
  const { privateRegistry, receipt: registryReceipt } = await validateSourceRegistryFiles({
    repositoryRoot,
    privateRegistryPath: options.privateRegistryPath,
    inventoryPath: options.inventoryPath,
    receiptPath: options.registryReceiptPath ?? options.receiptPath,
    verifyAvailableBytes: false,
  });
  if (options.hooks !== undefined) {
    throw new Error("Tracked projection production hooks are not injectable; use testOnlyHooks with testOnly=true.");
  }
  if (options.testOnlyHooks !== undefined && options.testOnly !== true) {
    throw new Error("Tracked projection test hooks require the explicit testOnly=true boundary.");
  }
  const hooks = options.testOnlyHooks ?? {};
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
  const observedSourceBindings = [];
  const availableSources = privateRegistry.items.filter((entry) => entry.status === "available");

  for (const source of availableSources) {
    const observed = await readVerifiedProjectionSource(repositoryRoot, source);
    const sourceBytes = observed.bytes;
    observedSourceBindings.push(observed.binding);
    if (typeof hooks.afterSourceBufferVerified === "function") {
      await hooks.afterSourceBufferVerified({
        sourceId: source.sourceId,
        sourceSha256: observed.binding.sourceSha256,
        sizeBytes: observed.binding.sizeBytes,
      });
    }
    if (matches.length >= maxMatches) continue;
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
    if (matches.length >= maxMatches) continue;
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
      availableSourceCount: availableSources.length,
      observedSourceSetSha256: computeTrackedProjectionObservedSourceSetSha256(observedSourceBindings),
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

export async function scanTrackedProjection(options) {
  const repositoryRoot = resolve(options.repositoryRoot);
  const artifact = safeTrackedArtifactPath(repositoryRoot, options.artifactPath);
  await assertTrackedProjectionAncestry(repositoryRoot, artifact.absolute, { requireTarget: true });
  const artifactInfo = await lstat(artifact.absolute);
  if (!artifactInfo.isFile() || artifactInfo.isSymbolicLink()) throw new Error("Tracked projection must be a real file.");
  const artifactBytes = await readFile(artifact.absolute);
  return scanTrackedProjectionBytes({
    ...options,
    repositoryRoot,
    artifactRelativePath: artifact.relative,
    artifactBytes,
  });
}
