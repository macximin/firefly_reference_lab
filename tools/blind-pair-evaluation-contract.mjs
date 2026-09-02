import { createHash } from "node:crypto";
import { HERMES_READ_SOURCE_MAX_BYTES } from "./genre-soul-hermes-run-lib.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,239}$/u;
const OPAQUE_PAIR_ID = /^bp-[0-9a-f]{24}$/u;
const OPAQUE_BLIND_ID = /^br-[0-9a-f]{24}$/u;
const INKOS_UNSAFE_BOOK_ID = /[\u0000-\u001f\u007f/\\:*?"'`{}<>|]/u;
const BLIND_EVALUATOR_PROFILE_ID = "inkos_blind_evaluator";
// These are the immutable, audited bytes registered by the HQ blind-evaluator
// profile.  A valid-looking digest is not sufficient: accepting one would let a
// caller substitute a different evaluator configuration or Soul under the same
// profile ID.
export const INKOS_BLIND_EVALUATOR_CONFIG_SHA256 = "4124e16bc40d28732d1dd02f9f2e8b78127a202313e1ace21021f16fca809f46";
export const INKOS_BLIND_EVALUATOR_SOUL_SHA256 = "5c4cca60c9971312682f7b71cac5d4d61b6f9e2c42d19af99c8fe6daedacd94b";
export const BLIND_EVALUATOR_EXACT_INPUT_MAX_BYTES = HERMES_READ_SOURCE_MAX_BYTES;
const GENRES = new Set(["modern-fantasy-ko", "fantasy-ko", "murim-ko"]);
const CANDIDATE_IDS = Object.freeze(["candidate-A", "candidate-B"]);
const COMMERCIAL_FIELDS = Object.freeze([
  "openingPressure", "protagonistAgency", "resistanceQuality", "visiblePayoff",
  "endingPropulsion", "referenceEngineRetention", "transformationIntegrity", "styleFidelity",
]);
const GENRE_IDENTITY_FIELDS = Object.freeze([
  "worldConstraintEvidence", "repeatableVerbEvidence", "oppositionFormEvidence",
  "rewardStatusCurrencyEvidence", "nextEpisodeActionEvidence",
]);
const CONTENT_NEUTRAL_CODES = new Set([
  "unauthorized-softening", "unauthorized-escalation", "moral-lecture", "disclaimer",
  "forced-punishment", "forced-apology", "forced-redemption", "forced-cost",
  "forced-moral-growth", "forced-balance",
]);
const SURFACE_METHODS = new Set([
  "exact-token-12", "exact-byte-120", "long-common-substring", "near-string",
]);
const AUTHORITY = Object.freeze({
  scope: "analysis-only",
  mayWriteInkOSCanon: false,
  mayPromoteSoul: false,
  ownerDecisionRequired: true,
});

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
  if (!isObject(value)) throw new Error(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} keys must be exactly ${wanted.join(", ")}.`);
  }
}

function assertSha(value, label) {
  if (!SHA256.test(value ?? "")) throw new Error(`${label} must be a full lowercase SHA-256.`);
}

function assertId(value, label) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) throw new Error(`${label} is invalid.`);
}

function assertText(value, label, maxLength = 8_000) {
  if (typeof value !== "string" || value.trim() === "" || value.length > maxLength) {
    throw new Error(`${label} must be non-empty bounded text.`);
  }
}

function assertScore(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${label} must be between 0 and 100.`);
  }
}

function assertArtifactRef(value, label) {
  exactKeys(value, ["path", "sha256", "byteLength"], label);
  assertText(value.path, `${label}.path`, 2_000);
  assertSha(value.sha256, `${label}.sha256`);
  if (!Number.isSafeInteger(value.byteLength) || value.byteLength < 1) {
    throw new Error(`${label}.byteLength must be a positive integer.`);
  }
}

function assertAuthority(value, label) {
  exactKeys(value, Object.keys(AUTHORITY), label);
  if (JSON.stringify(value) !== JSON.stringify(AUTHORITY)) {
    throw new Error(`${label} must remain analysis-only, non-canonical, non-promoting, and owner-separated.`);
  }
}

function canonicalBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function rawSha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortJson(nested)]));
  }
  return value;
}

function hashInkOSCanonicalJson(value) {
  return rawSha256(JSON.stringify(sortJson(value)));
}

export function hashBlindEvaluationArtifact(value) {
  return rawSha256(canonicalBytes(value));
}

export function scoreBlindCommercialEvaluation(evaluation) {
  exactKeys(evaluation, COMMERCIAL_FIELDS, "commercial evaluation");
  for (const field of COMMERCIAL_FIELDS) assertScore(evaluation[field], `commercial evaluation.${field}`);
  const dopamine = COMMERCIAL_FIELDS.slice(0, 5)
    .reduce((sum, field) => sum + evaluation[field], 0) / 5;
  const reference = COMMERCIAL_FIELDS.slice(5)
    .reduce((sum, field) => sum + evaluation[field], 0) / 3;
  return Math.round(((dopamine * 0.7) + (reference * 0.3)) * 10) / 10;
}

export function validateBlindPairEvaluationInput(input) {
  exactKeys(input, [
    "schemaVersion", "genre", "pairId", "round", "blindRunId", "blindSessionId",
    "reviewPacket", "commonContext", "commonInputReceiptSha256", "pairedGenerationReceiptSha256",
    "labelAssignmentReceiptSha256", "candidates", "producerActors", "reviewer",
    "contentContract", "authority",
  ], "blind evaluation input");
  if (input.schemaVersion !== "firefly-blind-pair-evaluation-input/v2") {
    throw new Error("Blind evaluation input schemaVersion is invalid.");
  }
  if (!GENRES.has(input.genre)) throw new Error("Blind evaluation input genre is invalid.");
  if (!OPAQUE_PAIR_ID.test(input.pairId ?? "")) {
    throw new Error("Blind evaluation input pairId must be opaque bp-<24 lowercase hex>.");
  }
  for (const [value, label] of [[input.blindRunId, "blindRunId"], [input.blindSessionId, "blindSessionId"]]) {
    if (!OPAQUE_BLIND_ID.test(value ?? "")) {
      throw new Error(`Blind evaluation input ${label} must be opaque br-<24 lowercase hex>.`);
    }
  }
  if (input.blindRunId === input.blindSessionId) {
    throw new Error("Blind evaluation run and session IDs must be distinct opaque identifiers.");
  }
  if (![1, 2, 3].includes(input.round)) throw new Error("Blind evaluation input round must be 1, 2, or 3.");
  assertArtifactRef(input.reviewPacket, "blind evaluation input.reviewPacket");
  exactKeys(input.commonContext, ["text", "sha256", "byteLength"], "blind evaluation input.commonContext");
  assertText(input.commonContext.text, "blind evaluation input.commonContext.text", 500_000);
  const commonContextBytes = Buffer.from(input.commonContext.text, "utf8");
  if (commonContextBytes.toString("utf8") !== input.commonContext.text
    || rawSha256(commonContextBytes) !== input.commonContext.sha256
    || commonContextBytes.byteLength !== input.commonContext.byteLength) {
    throw new Error("Blind evaluation commonContext text/bytes/hash binding drifted.");
  }
  for (const field of [
    "commonInputReceiptSha256", "pairedGenerationReceiptSha256", "labelAssignmentReceiptSha256",
  ]) assertSha(input[field], `blind evaluation input.${field}`);
  if (!Array.isArray(input.candidates) || input.candidates.length !== 2) {
    throw new Error("Blind evaluation input requires exactly two candidates.");
  }
  input.candidates.forEach((candidate, index) => {
    exactKeys(candidate, ["id", "sha256", "byteLength"], `blind evaluation input.candidates[${index}]`);
    if (candidate.id !== CANDIDATE_IDS[index]) throw new Error("Blind candidate IDs must be candidate-A then candidate-B.");
    assertSha(candidate.sha256, `blind evaluation input.candidates[${index}].sha256`);
    if (!Number.isSafeInteger(candidate.byteLength) || candidate.byteLength < 1) {
      throw new Error("Blind candidate byteLength must be positive.");
    }
  });
  if (input.candidates[0].sha256 === input.candidates[1].sha256) {
    throw new Error("Blind candidates must have different content hashes.");
  }
  if (!Array.isArray(input.producerActors) || input.producerActors.length !== 2) {
    throw new Error("Blind evaluation input requires two sealed producer actors.");
  }
  const actorIds = new Set();
  const lanes = [];
  input.producerActors.forEach((actor, index) => {
    exactKeys(actor, ["lane", "actorId", "profileId", "terminalReceiptSha256"], `blind evaluation input.producerActors[${index}]`);
    if (!["neutral", "soul"].includes(actor.lane)) throw new Error("Blind producer lane is invalid.");
    lanes.push(actor.lane);
    assertId(actor.actorId, `blind evaluation input.producerActors[${index}].actorId`);
    assertId(actor.profileId, `blind evaluation input.producerActors[${index}].profileId`);
    assertSha(actor.terminalReceiptSha256, `blind evaluation input.producerActors[${index}].terminalReceiptSha256`);
    if (actorIds.has(actor.actorId)) throw new Error("Blind producer actor IDs must be distinct.");
    actorIds.add(actor.actorId);
  });
  if (lanes.sort().join(",") !== "neutral,soul") throw new Error("Blind producer actors must cover neutral and soul lanes.");
  exactKeys(input.reviewer, [
    "actorId", "profileId", "provider", "model", "reasoning", "configSha256", "soulSha256",
  ], "blind evaluation input.reviewer");
  assertId(input.reviewer.actorId, "blind evaluation input.reviewer.actorId");
  if (input.reviewer.profileId !== BLIND_EVALUATOR_PROFILE_ID) {
    throw new Error(`Blind reviewer profileId must be ${BLIND_EVALUATOR_PROFILE_ID}.`);
  }
  assertSha(input.reviewer.configSha256, "blind evaluation input.reviewer.configSha256");
  assertSha(input.reviewer.soulSha256, "blind evaluation input.reviewer.soulSha256");
  if (input.reviewer.configSha256 !== INKOS_BLIND_EVALUATOR_CONFIG_SHA256
    || input.reviewer.soulSha256 !== INKOS_BLIND_EVALUATOR_SOUL_SHA256) {
    throw new Error("Blind reviewer must use the fixed audited inkos_blind_evaluator config/Soul digests.");
  }
  if (actorIds.has(input.reviewer.actorId)) throw new Error("Blind reviewer must be actor-distinct from both producers.");
  if (input.reviewer.provider !== "openai-codex" || input.reviewer.model !== "gpt-5.6-sol" || input.reviewer.reasoning !== "high") {
    throw new Error("Blind reviewer runtime must be openai-codex/gpt-5.6-sol/high.");
  }
  exactKeys(input.contentContract, ["id", "sha256", "intensityDirectiveSha256"], "blind evaluation input.contentContract");
  if (input.contentContract.id !== "fiction-content-neutral-ko/v1") throw new Error("Blind content contract ID is invalid.");
  assertSha(input.contentContract.sha256, "blind evaluation input.contentContract.sha256");
  assertSha(input.contentContract.intensityDirectiveSha256, "blind evaluation input.contentContract.intensityDirectiveSha256");
  assertAuthority(input.authority, "blind evaluation input.authority");
  return true;
}

/**
 * Validates the public, intentionally lane-free transfer emitted by InkOS.
 * Keep this local copy deliberately narrow: it is the cross-repository boundary
 * RefLab consumes, not a second owner for InkOS's private label receipt.
 */
export function validateInkOSBlindPairEvaluationTransfer(transfer) {
  exactKeys(transfer, [
    "schemaVersion", "pairId", "round", "blindRunId", "blindSessionId", "bookId", "chapterNumber",
    "commonContext", "commonInputReceiptSha256", "pairedGenerationReceiptSha256", "labelAssignmentReceiptSha256",
    "canaryIsolation", "candidates", "generatedAt", "authority", "transferSelfHash",
  ], "InkOS blind evaluation transfer");
  if (transfer.schemaVersion !== "inkos-blind-pair-evaluation-transfer/v1") {
    throw new Error("InkOS blind evaluation transfer schemaVersion is invalid.");
  }
  if (!OPAQUE_PAIR_ID.test(transfer.pairId ?? "")) throw new Error("InkOS transfer pairId must be opaque bp-<24 lowercase hex>.");
  for (const [value, label] of [[transfer.blindRunId, "blindRunId"], [transfer.blindSessionId, "blindSessionId"]]) {
    if (!OPAQUE_BLIND_ID.test(value ?? "")) throw new Error(`InkOS transfer ${label} must be opaque br-<24 lowercase hex>.`);
  }
  if (transfer.blindRunId === transfer.blindSessionId) throw new Error("InkOS transfer run and session IDs must be distinct.");
  if (![1, 2, 3].includes(transfer.round) || typeof transfer.bookId !== "string" || transfer.bookId.length > 120
    || transfer.bookId.trim() !== transfer.bookId || transfer.bookId === "." || transfer.bookId === ".."
    || transfer.bookId.includes("..") || INKOS_UNSAFE_BOOK_ID.test(transfer.bookId)
    || !Number.isSafeInteger(transfer.chapterNumber) || transfer.chapterNumber < 1) {
    throw new Error("InkOS transfer round, Book ID, or chapter number is invalid.");
  }
  exactKeys(transfer.commonContext, ["text", "sha256", "byteLength"], "InkOS transfer.commonContext");
  assertText(transfer.commonContext.text, "InkOS transfer.commonContext.text", 500_000);
  const commonBytes = Buffer.from(transfer.commonContext.text, "utf8");
  if (commonBytes.toString("utf8") !== transfer.commonContext.text
    || rawSha256(commonBytes) !== transfer.commonContext.sha256
    || commonBytes.byteLength !== transfer.commonContext.byteLength) {
    throw new Error("InkOS transfer commonContext text/bytes/hash binding drifted.");
  }
  for (const field of [
    "commonInputReceiptSha256", "pairedGenerationReceiptSha256", "labelAssignmentReceiptSha256", "transferSelfHash",
  ]) assertSha(transfer[field], `InkOS transfer.${field}`);
  exactKeys(transfer.canaryIsolation, ["receiptSha256", "receiptSelfHash", "isolationScopeSha256", "commonSnapshotSha256"], "InkOS transfer.canaryIsolation");
  for (const field of Object.keys(transfer.canaryIsolation)) assertSha(transfer.canaryIsolation[field], `InkOS transfer.canaryIsolation.${field}`);
  if (!Array.isArray(transfer.candidates) || transfer.candidates.length !== 2) {
    throw new Error("InkOS transfer requires exactly candidate-A and candidate-B.");
  }
  transfer.candidates.forEach((candidate, index) => {
    exactKeys(candidate, ["id", "body", "sha256", "byteLength"], `InkOS transfer.candidates[${index}]`);
    if (candidate.id !== CANDIDATE_IDS[index]) throw new Error("InkOS transfer candidate IDs must be candidate-A then candidate-B.");
    assertText(candidate.body, `InkOS transfer.candidates[${index}].body`, 10 * 1024 * 1024);
    const bodyBytes = Buffer.from(candidate.body, "utf8");
    if (bodyBytes.toString("utf8") !== candidate.body || rawSha256(bodyBytes) !== candidate.sha256
      || bodyBytes.byteLength !== candidate.byteLength) {
      throw new Error(`InkOS transfer ${candidate.id} body/sha256/byteLength binding drifted.`);
    }
  });
  if (transfer.candidates[0].sha256 === transfer.candidates[1].sha256) throw new Error("InkOS transfer candidates must differ.");
  if (typeof transfer.generatedAt !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(transfer.generatedAt)
    || !Number.isFinite(Date.parse(transfer.generatedAt))) {
    throw new Error("InkOS transfer generatedAt is invalid.");
  }
  exactKeys(transfer.authority, ["scope", "mayWriteInkOSCanon", "mayRevealGeneratorIdentity", "ownerDecisionRequired"], "InkOS transfer.authority");
  if (transfer.authority.scope !== "evaluation-input" || transfer.authority.mayWriteInkOSCanon !== false
    || transfer.authority.mayRevealGeneratorIdentity !== false || transfer.authority.ownerDecisionRequired !== true) {
    throw new Error("InkOS transfer authority must remain evaluation-only and identity-blind.");
  }
  const { transferSelfHash, ...unsigned } = transfer;
  if (hashInkOSCanonicalJson(unsigned) !== transferSelfHash) throw new Error("InkOS transfer self-hash drifted.");
  return true;
}

/**
 * Assemble RefLab's sealed v2 input from InkOS's public transfer.  Candidate
 * labels are copied in-place and no producer lane, WorkOrder, profile, or other
 * private label-assignment material is accepted by this boundary.
 */
export function assembleBlindPairEvaluationInputFromInkOSTransfer({
  transfer,
  genre,
  reviewPacket,
  producerActors,
  reviewerActorId,
  contentContract,
}) {
  validateInkOSBlindPairEvaluationTransfer(transfer);
  const input = {
    schemaVersion: "firefly-blind-pair-evaluation-input/v2",
    genre,
    pairId: transfer.pairId,
    round: transfer.round,
    blindRunId: transfer.blindRunId,
    blindSessionId: transfer.blindSessionId,
    reviewPacket,
    commonContext: structuredClone(transfer.commonContext),
    commonInputReceiptSha256: transfer.commonInputReceiptSha256,
    pairedGenerationReceiptSha256: transfer.pairedGenerationReceiptSha256,
    labelAssignmentReceiptSha256: transfer.labelAssignmentReceiptSha256,
    candidates: transfer.candidates.map(({ id, sha256, byteLength }) => ({ id, sha256, byteLength })),
    producerActors,
    reviewer: {
      actorId: reviewerActorId,
      profileId: BLIND_EVALUATOR_PROFILE_ID,
      provider: "openai-codex",
      model: "gpt-5.6-sol",
      reasoning: "high",
      configSha256: INKOS_BLIND_EVALUATOR_CONFIG_SHA256,
      soulSha256: INKOS_BLIND_EVALUATOR_SOUL_SHA256,
    },
    contentContract,
    authority: BLIND_PAIR_AUTHORITY,
  };
  validateBlindPairEvaluationInput(input);
  return input;
}

function normalizeCandidateContexts(input, candidateContexts) {
  if (!Array.isArray(candidateContexts) || candidateContexts.length !== 2) {
    throw new Error("Blind evaluation validation requires the two exact raw candidate contexts.");
  }
  return candidateContexts.map((context, index) => {
    const expected = input.candidates[index];
    if (!isObject(context) || context.id !== expected.id || typeof context.body !== "string") {
      throw new Error(`Blind raw candidate context ${expected.id} is invalid.`);
    }
    const bytes = Buffer.from(context.body, "utf8");
    if (bytes.toString("utf8") !== context.body) throw new Error(`Blind raw candidate ${expected.id} is not canonical UTF-8.`);
    if (rawSha256(bytes) !== expected.sha256 || bytes.byteLength !== expected.byteLength) {
      throw new Error(`Blind raw candidate ${expected.id} body binding drifted.`);
    }
    if (!Array.isArray(context.evidenceSpans) || context.evidenceSpans.length < 1) {
      throw new Error(`Blind raw candidate ${expected.id} requires a non-empty exact evidence span catalog.`);
    }
    const normalized = { ...context, bytes, sha256: expected.sha256 };
    normalized.evidenceSpans.forEach((span, spanIndex) => validateCandidateSpan(
      span,
      normalized,
      `Blind raw candidate ${expected.id} evidenceSpans[${spanIndex}]`,
      { requireCatalog: false },
    ));
    return normalized;
  });
}

export function buildBlindCandidateEvidenceSpans(body) {
  if (typeof body !== "string" || body.trim() === "") {
    throw new Error("Blind review candidate requires a non-whitespace body.");
  }
  const spans = [];
  for (const match of body.matchAll(/[^\r\n]+/gu)) {
    const raw = match[0];
    const leading = raw.match(/^\s*/u)?.[0].length ?? 0;
    const trailing = raw.match(/\s*$/u)?.[0].length ?? 0;
    const startCodeUnit = (match.index ?? 0) + leading;
    const endCodeUnit = (match.index ?? 0) + raw.length - trailing;
    if (endCodeUnit <= startCodeUnit) continue;
    const startByte = Buffer.byteLength(body.slice(0, startCodeUnit), "utf8");
    const slice = Buffer.from(body.slice(startCodeUnit, endCodeUnit), "utf8");
    spans.push({
      coordinateKind: "utf8-byte",
      startByte,
      endByte: startByte + slice.byteLength,
      sliceSha256: rawSha256(slice),
    });
  }
  if (spans.length < 1) throw new Error("Blind review candidate requires at least one non-whitespace evidence span.");
  return spans;
}

export function buildBlindPairEvaluatorInput(input, candidateContexts) {
  validateBlindPairEvaluationInput(input);
  const contexts = normalizeCandidateContexts(input, candidateContexts);
  const value = {
    schemaVersion: "private-firefly-blind-pair-evaluator-input/v2",
    genre: input.genre,
    pairId: input.pairId,
    round: input.round,
    blindRunId: input.blindRunId,
    pairedGenerationReceiptSha256: input.pairedGenerationReceiptSha256,
    reviewerRuntime: {
      configSha256: input.reviewer.configSha256,
      soulSha256: input.reviewer.soulSha256,
    },
    commonContext: input.commonContext,
    contentContract: input.contentContract,
    candidates: contexts.map(({ id, body, sha256, evidenceSpans }) => ({
      id,
      body,
      sha256,
      byteLength: Buffer.byteLength(body, "utf8"),
      evidenceSpans,
    })),
    authority: BLIND_PAIR_AUTHORITY,
  };
  const bytes = canonicalBytes(value);
  if (bytes.byteLength > BLIND_EVALUATOR_EXACT_INPUT_MAX_BYTES) {
    throw new Error(`Blind evaluator exact-read input exceeds ${BLIND_EVALUATOR_EXACT_INPUT_MAX_BYTES} bytes.`);
  }
  return { value, bytes };
}

function validateCandidateSpan(span, context, label, { requireCatalog = true } = {}) {
  exactKeys(span, ["coordinateKind", "startByte", "endByte", "sliceSha256"], label);
  if (span.coordinateKind !== "utf8-byte") throw new Error(`${label}.coordinateKind must be utf8-byte.`);
  if (!Number.isSafeInteger(span.startByte) || span.startByte < 0
    || !Number.isSafeInteger(span.endByte) || span.endByte <= span.startByte
    || span.endByte > context.bytes.byteLength) {
    throw new Error(`${label} byte range is out of range.`);
  }
  assertSha(span.sliceSha256, `${label}.sliceSha256`);
  const slice = context.bytes.subarray(span.startByte, span.endByte);
  let decoded;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(slice);
  } catch {
    throw new Error(`${label} does not align to UTF-8 boundaries.`);
  }
  if (Buffer.from(decoded, "utf8").compare(slice) !== 0) {
    throw new Error(`${label} does not align to UTF-8 boundaries.`);
  }
  if (rawSha256(slice) !== span.sliceSha256) throw new Error(`${label} slice SHA-256 mismatches exact candidate bytes.`);
  if (requireCatalog && !context.evidenceSpans.some((candidate) => JSON.stringify(candidate) === JSON.stringify(span))) {
    throw new Error(`${label} is not copied from the sealed candidate-local evidence span catalog.`);
  }
  return true;
}

function validateSpanList(value, context, label, { nonEmpty = false, requireCatalog = true } = {}) {
  if (!Array.isArray(value) || (nonEmpty && value.length < 1)) {
    throw new Error(`${label} must be ${nonEmpty ? "a non-empty" : "an"} array of typed exact spans.`);
  }
  value.forEach((span, index) => validateCandidateSpan(span, context, `${label}[${index}]`, { requireCatalog }));
}

function validateCandidateResult(candidate, expectedInput, context, label) {
  exactKeys(candidate, [
    "candidateSha256", "commercialEvaluation", "commercialScore", "emotionalCoherence",
    "contentNeutrality", "canonContradictions", "canonLeaks", "genreIdentity",
  ], label);
  if (candidate.candidateSha256 !== expectedInput.sha256) throw new Error(`${label}.candidateSha256 drifted from the sealed candidate.`);
  const score = scoreBlindCommercialEvaluation(candidate.commercialEvaluation);
  if (candidate.commercialScore !== score) throw new Error(`${label}.commercialScore does not match dopamine70-reference30-v1.`);
  exactKeys(candidate.emotionalCoherence, ["score", "evidence"], `${label}.emotionalCoherence`);
  assertScore(candidate.emotionalCoherence.score, `${label}.emotionalCoherence.score`);
  validateSpanList(candidate.emotionalCoherence.evidence, context, `${label}.emotionalCoherence.evidence`, { nonEmpty: true });
  exactKeys(candidate.contentNeutrality, ["passed", "violations"], `${label}.contentNeutrality`);
  if (!Array.isArray(candidate.contentNeutrality.violations)) throw new Error(`${label}.contentNeutrality.violations must be an array.`);
  candidate.contentNeutrality.violations.forEach((violation, index) => {
    exactKeys(violation, ["code", "evidence"], `${label}.contentNeutrality.violations[${index}]`);
    if (!CONTENT_NEUTRAL_CODES.has(violation.code)) throw new Error(`${label} has an unknown content-neutrality code.`);
    validateSpanList(violation.evidence, context, `${label}.contentNeutrality.violations[${index}].evidence`, { nonEmpty: true });
  });
  if (candidate.contentNeutrality.passed !== (candidate.contentNeutrality.violations.length === 0)) {
    throw new Error(`${label}.contentNeutrality passed flag contradicts its violations.`);
  }
  for (const [field, expectedCode] of [["canonContradictions", "hard-canon-contradiction"], ["canonLeaks", "canon-leak"]]) {
    if (!Array.isArray(candidate[field])) throw new Error(`${label}.${field} must be an array.`);
    candidate[field].forEach((finding, index) => {
      exactKeys(finding, ["code", "evidence"], `${label}.${field}[${index}]`);
      if (finding.code !== expectedCode) throw new Error(`${label}.${field}[${index}].code must be ${expectedCode}.`);
      validateSpanList(finding.evidence, context, `${label}.${field}[${index}].evidence`, { nonEmpty: true });
    });
  }
  exactKeys(candidate.genreIdentity, [...GENRE_IDENTITY_FIELDS, "pass"], `${label}.genreIdentity`);
  for (const field of GENRE_IDENTITY_FIELDS) {
    validateSpanList(candidate.genreIdentity[field], context, `${label}.genreIdentity.${field}`);
  }
  const complete = GENRE_IDENTITY_FIELDS.every((field) => candidate.genreIdentity[field].length > 0);
  if (candidate.genreIdentity.pass !== complete) throw new Error(`${label}.genreIdentity pass flag contradicts evidence coverage.`);
}

export function validateBlindPairEvaluationResult(result, input, candidateContexts) {
  validateBlindPairEvaluationInput(input);
  const contexts = normalizeCandidateContexts(input, candidateContexts);
  exactKeys(result, [
    "schemaVersion", "pairId", "round", "blindRunId", "pairedGenerationReceiptSha256",
    "winner", "rankingReason", "evaluations", "humanDecision", "authority",
  ], "blind evaluation result");
  if (result.schemaVersion !== "firefly-blind-pair-evaluator-result/v2") {
    throw new Error("Blind evaluation result schemaVersion is invalid.");
  }
  if (result.pairId !== input.pairId || result.round !== input.round || result.blindRunId !== input.blindRunId
    || result.pairedGenerationReceiptSha256 !== input.pairedGenerationReceiptSha256) {
    throw new Error("Blind evaluation result does not match its sealed input.");
  }
  if (![...CANDIDATE_IDS, "tie", "invalid"].includes(result.winner)) throw new Error("Blind evaluation winner is invalid.");
  assertText(result.rankingReason, "blind evaluation result.rankingReason");
  exactKeys(result.evaluations, CANDIDATE_IDS, "blind evaluation result.evaluations");
  CANDIDATE_IDS.forEach((id, index) => validateCandidateResult(
    result.evaluations[id], input.candidates[index], contexts[index], `blind evaluation result.evaluations.${id}`,
  ));
  if (result.humanDecision !== "pending") throw new Error("Blind evaluator must leave the human decision pending.");
  assertAuthority(result.authority, "blind evaluation result.authority");
  return true;
}

function validateSurfaceSelector(selector, context, label) {
  exactKeys(selector, [
    "coordinateKind", "candidateContentSha256", "startByte", "endByte", "candidateSliceSha256",
  ], label);
  if (selector.candidateContentSha256 !== context.sha256) throw new Error(`${label}.candidateContentSha256 drifted.`);
  validateCandidateSpan({
    coordinateKind: selector.coordinateKind,
    startByte: selector.startByte,
    endByte: selector.endByte,
    sliceSha256: selector.candidateSliceSha256,
  }, context, label, { requireCatalog: false });
}

export function validateBlindSurfaceScanReceipt(receipt, candidateContext, expected = {}) {
  if (!isObject(candidateContext) || typeof candidateContext.body !== "string") {
    throw new Error("Blind surface scan validation requires exact candidate bytes.");
  }
  const bytes = Buffer.from(candidateContext.body, "utf8");
  const context = { ...candidateContext, bytes, sha256: rawSha256(bytes) };
  exactKeys(receipt, [
    "schemaVersion", "candidateId", "candidateSha256", "candidateByteLength", "scanner", "corpus",
    "upstreamScanSha256", "status", "matchCount", "matches", "truncated", "automaticRewriteApplied",
    "automaticRejectApplied", "humanDecision", "receiptSelfHash",
  ], "blind surface scan receipt");
  if (receipt.schemaVersion !== "firefly-blind-pair-surface-scan/v1") throw new Error("Blind surface scan schemaVersion is invalid.");
  if (receipt.candidateId !== candidateContext.id || receipt.candidateSha256 !== context.sha256
    || receipt.candidateByteLength !== bytes.byteLength) throw new Error("Blind surface scan candidate/body binding drifted.");
  exactKeys(receipt.scanner, ["version", "exactTokenCount", "exactByteLength"], "blind surface scan receipt.scanner");
  if (receipt.scanner.version !== "genre-soul-surface-scanner/v1" || receipt.scanner.exactTokenCount !== 12
    || receipt.scanner.exactByteLength !== 120) throw new Error("Blind surface scan scanner contract drifted.");
  exactKeys(receipt.corpus, [
    "privateRegistrySha256", "availableSourceCount", "observedSourceSetSha256", "surfaceIndexSha256",
  ], "blind surface scan receipt.corpus");
  for (const field of ["privateRegistrySha256", "observedSourceSetSha256", "surfaceIndexSha256"]) {
    assertSha(receipt.corpus[field], `blind surface scan receipt.corpus.${field}`);
  }
  if (!Number.isSafeInteger(receipt.corpus.availableSourceCount) || receipt.corpus.availableSourceCount < 1) {
    throw new Error("Blind surface scan requires a non-empty observed corpus.");
  }
  assertSha(receipt.upstreamScanSha256, "blind surface scan receipt.upstreamScanSha256");
  if (expected.upstreamScanSha256 !== undefined && receipt.upstreamScanSha256 !== expected.upstreamScanSha256) {
    throw new Error("Blind surface scan upstream receipt binding drifted.");
  }
  if (!Array.isArray(receipt.matches) || !Number.isSafeInteger(receipt.matchCount)
    || receipt.matchCount !== receipt.matches.length) throw new Error("Blind surface scan match count contradicts typed matches.");
  const expectedStatus = receipt.matchCount === 0 ? "completed-no-match" : "completed-with-matches";
  if (receipt.status !== expectedStatus) throw new Error("Blind surface scan completion status contradicts its matches.");
  if (receipt.truncated !== false) throw new Error("Blind surface scan must be complete and non-truncated.");
  if (receipt.automaticRewriteApplied !== false || receipt.automaticRejectApplied !== false || receipt.humanDecision !== "pending") {
    throw new Error("Blind surface scan must not rewrite, reject, or make the human decision.");
  }
  const matchIds = new Set();
  receipt.matches.forEach((match, index) => {
    const label = `blind surface scan receipt.matches[${index}]`;
    exactKeys(match, [
      "matchId", "selectorSha256", "provenanceBridgeReceiptSha256", "matchMethod", "classification",
      "candidate", "source",
    ], label);
    assertId(match.matchId, `${label}.matchId`);
    if (matchIds.has(match.matchId)) throw new Error("Blind surface scan match IDs must be unique.");
    matchIds.add(match.matchId);
    assertSha(match.selectorSha256, `${label}.selectorSha256`);
    assertSha(match.provenanceBridgeReceiptSha256, `${label}.provenanceBridgeReceiptSha256`);
    if (!SURFACE_METHODS.has(match.matchMethod) || match.classification !== "pending") {
      throw new Error(`${label} method or classification is invalid.`);
    }
    validateSurfaceSelector(match.candidate, context, `${label}.candidate`);
    exactKeys(match.source, [
      "coordinateKind", "sourceId", "sourceSha256", "startByte", "endByte", "sliceSha256",
    ], `${label}.source`);
    if (match.source.coordinateKind !== "utf8-byte") throw new Error(`${label}.source coordinateKind is invalid.`);
    assertId(match.source.sourceId, `${label}.source.sourceId`);
    assertSha(match.source.sourceSha256, `${label}.source.sourceSha256`);
    if (!Number.isSafeInteger(match.source.startByte) || match.source.startByte < 0
      || !Number.isSafeInteger(match.source.endByte) || match.source.endByte <= match.source.startByte
      || match.source.endByte - match.source.startByte > 32_768) {
      throw new Error(`${label}.source byte range is invalid.`);
    }
    assertSha(match.source.sliceSha256, `${label}.source.sliceSha256`);
    const selectorBody = {
      provenanceBridgeReceiptSha256: match.provenanceBridgeReceiptSha256,
      matchMethod: match.matchMethod,
      candidate: match.candidate,
      source: match.source,
    };
    if (rawSha256(JSON.stringify(selectorBody)) !== match.selectorSha256
      || match.matchId !== `fsm-${match.selectorSha256.slice(0, 24)}`) {
      throw new Error(`${label} selector identity is invalid.`);
    }
  });
  const { receiptSelfHash, ...unsigned } = receipt;
  if (receiptSelfHash !== hashBlindEvaluationArtifact(unsigned)) throw new Error("Blind surface scan receipt self-hash drifted.");
  return true;
}

function evaluationBindingSha256(candidateSha256, triple, surfaceScanReceiptSha256) {
  return hashBlindEvaluationArtifact({
    schemaVersion: "firefly-blind-evaluation-binding/v1",
    candidateSha256,
    evaluatorInputSha256: triple.evaluatorInputSha256,
    evaluatorResultSha256: triple.evaluatorResultSha256,
    hostReceiptSha256: triple.hostReceiptSha256,
    surfaceScanReceiptSha256,
  });
}

function parseCanonicalRawJson(bytes, label) {
  if (!Buffer.isBuffer(bytes)) throw new Error(`${label} must be exact raw Buffer bytes.`);
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
  if (bytes.compare(canonicalBytes(value)) !== 0) throw new Error(`${label} must use canonical JSON bytes.`);
  return value;
}

function validateEvaluatorInputProjection(projection, input, candidateContexts) {
  exactKeys(projection, [
    "schemaVersion", "genre", "pairId", "round", "blindRunId", "pairedGenerationReceiptSha256",
    "reviewerRuntime", "commonContext", "contentContract", "candidates", "authority",
  ], "blind evaluator exact-read input");
  if (projection.schemaVersion !== "private-firefly-blind-pair-evaluator-input/v2"
    || projection.genre !== input.genre
    || projection.pairId !== input.pairId
    || projection.round !== input.round
    || projection.blindRunId !== input.blindRunId
    || projection.pairedGenerationReceiptSha256 !== input.pairedGenerationReceiptSha256) {
    throw new Error("Blind evaluator exact-read input identity drifted from the sealed input.");
  }
  exactKeys(projection.reviewerRuntime, ["configSha256", "soulSha256"], "blind evaluator reviewerRuntime");
  if (projection.reviewerRuntime.configSha256 !== input.reviewer.configSha256
    || projection.reviewerRuntime.soulSha256 !== input.reviewer.soulSha256) {
    throw new Error("Blind evaluator expected profile config/Soul hashes drifted.");
  }
  if (JSON.stringify(projection.commonContext) !== JSON.stringify(input.commonContext)
    || JSON.stringify(projection.contentContract) !== JSON.stringify(input.contentContract)
    || JSON.stringify(projection.authority) !== JSON.stringify(AUTHORITY)) {
    throw new Error("Blind evaluator common context, content contract, or authority drifted.");
  }
  const expectedCandidates = candidateContexts.map((candidate) => ({
    id: candidate.id,
    body: candidate.body,
    sha256: candidate.sha256,
    byteLength: candidate.byteLength,
    evidenceSpans: candidate.evidenceSpans,
  }));
  if (JSON.stringify(projection.candidates) !== JSON.stringify(expectedCandidates)) {
    throw new Error("Blind evaluator candidate bodies or span catalogs drifted.");
  }
}

export function buildBlindReviewReceiptFromRawEvidence({
  input,
  result,
  candidateContexts,
  evaluatorInputBytes,
  evaluatorResultBytes,
  hostReceiptBytes,
  surfaceScans,
}) {
  validateBlindPairEvaluationResult(result, input, candidateContexts);
  const evaluatorInput = parseCanonicalRawJson(evaluatorInputBytes, "Blind evaluator input evidence");
  validateEvaluatorInputProjection(evaluatorInput, input, candidateContexts);
  const evaluatorResult = parseCanonicalRawJson(evaluatorResultBytes, "Blind evaluator result evidence");
  if (JSON.stringify(evaluatorResult) !== JSON.stringify(result)) {
    throw new Error("Blind evaluator raw result bytes drifted from the validated result object.");
  }
  const hostReceipt = parseCanonicalRawJson(hostReceiptBytes, "Blind evaluator host receipt evidence");
  const evaluatorInputSha256 = rawSha256(evaluatorInputBytes);
  const evaluatorResultSha256 = rawSha256(evaluatorResultBytes);
  if (!isObject(hostReceipt)
    || hostReceipt.role !== "blind-pair-commercial-evaluator"
    || hostReceipt.profileId !== BLIND_EVALUATOR_PROFILE_ID
    || hostReceipt.profileId !== input.reviewer.profileId
    || hostReceipt.profileConfigSha256 !== input.reviewer.configSha256
    || hostReceipt.soulSha256 !== input.reviewer.soulSha256
    || hostReceipt.provider !== "openai-codex"
    || hostReceipt.model !== "gpt-5.6-sol"
    || hostReceipt.reasoningEffort !== "high"
    || hostReceipt.inputDigest !== hashBlindEvaluationArtifact(input)
    || !SHA256.test(hostReceipt.inputSha256 ?? "")
    || hostReceipt.expectedReadCount !== 1
    || hostReceipt.exactReadCount !== 1
    || JSON.stringify(hostReceipt.exactReadSha256s) !== JSON.stringify([evaluatorInputSha256])
    || hostReceipt.resultSha256 !== evaluatorResultSha256
    || typeof hostReceipt.runId !== "string"
    || hostReceipt.runId.length < 1
    || typeof hostReceipt.completedAt !== "string"
    || !Number.isFinite(Date.parse(hostReceipt.completedAt))) {
    throw new Error("Blind evaluator host receipt runtime/config/Soul/input/result binding drifted.");
  }
  const triple = {
    evaluatorInputSha256,
    evaluatorResultSha256,
    hostReceiptSha256: rawSha256(hostReceiptBytes),
  };
  if (!Array.isArray(surfaceScans) || surfaceScans.length !== 2) {
    throw new Error("Blind review receipt requires two completed candidate surface scans.");
  }
  const candidateBindings = {};
  CANDIDATE_IDS.forEach((id, index) => {
    const scan = surfaceScans[index];
    validateBlindSurfaceScanReceipt(scan.receipt, candidateContexts[index], {
      upstreamScanSha256: scan.upstreamScanSha256,
    });
    const scanReceiptSha256 = hashBlindEvaluationArtifact(scan.receipt);
    candidateBindings[id] = {
      candidateSha256: input.candidates[index].sha256,
      evaluationBindingSha256: evaluationBindingSha256(input.candidates[index].sha256, triple, scanReceiptSha256),
      surfaceScanReceiptSha256: scanReceiptSha256,
      surfaceIndexSha256: scan.receipt.corpus.surfaceIndexSha256,
      surfaceScanStatus: scan.receipt.status,
      surfaceMatchCount: scan.receipt.matchCount,
    };
  });
  const unsigned = {
    schemaVersion: "firefly-blind-review-receipt/v2",
    genre: input.genre,
    pairId: input.pairId,
    round: input.round,
    blindRunId: input.blindRunId,
    blindSessionId: input.blindSessionId,
    sealedInputSha256: hashBlindEvaluationArtifact(input),
    commonContextSha256: input.commonContext.sha256,
    commonContextByteLength: input.commonContext.byteLength,
    evaluatorBinding: {
      ...triple,
      tripleBindingSha256: hashBlindEvaluationArtifact(triple),
    },
    reviewPacketSha256: input.reviewPacket.sha256,
    commonInputReceiptSha256: input.commonInputReceiptSha256,
    pairedGenerationReceiptSha256: input.pairedGenerationReceiptSha256,
    labelAssignmentReceiptSha256: input.labelAssignmentReceiptSha256,
    reviewer: {
      actorId: input.reviewer.actorId,
      profileId: input.reviewer.profileId,
      configSha256: input.reviewer.configSha256,
      soulSha256: input.reviewer.soulSha256,
      model: hostReceipt.model,
      reasoning: hostReceipt.reasoningEffort,
      actorDistinctFromProducers: true,
      runId: hostReceipt.runId,
    },
    candidateBindings,
    outcome: {
      winner: result.winner,
      commercialScores: Object.fromEntries(CANDIDATE_IDS.map((id) => [id, result.evaluations[id].commercialScore])),
      emotionalCoherenceScores: Object.fromEntries(CANDIDATE_IDS.map((id) => [id, result.evaluations[id].emotionalCoherence.score])),
      genreIdentityPassed: Object.fromEntries(CANDIDATE_IDS.map((id) => [id, result.evaluations[id].genreIdentity.pass])),
      contentNeutralViolationCounts: Object.fromEntries(CANDIDATE_IDS.map((id) => [id, result.evaluations[id].contentNeutrality.violations.length])),
      hardContradictionCount: CANDIDATE_IDS.reduce((sum, id) => sum + result.evaluations[id].canonContradictions.length, 0),
      canonLeakCount: CANDIDATE_IDS.reduce((sum, id) => sum + result.evaluations[id].canonLeaks.length, 0),
      humanDecision: "pending",
    },
    storyyardProjection: {
      purpose: "promotion-evaluation",
      actions: ["select", "tie", "invalid"],
      decisionEffect: "advisory",
      manuscriptApply: false,
      canonLeakPolicy: "block-on-nonzero",
    },
    authority: AUTHORITY,
    createdAt: hostReceipt.completedAt,
  };
  return { ...unsigned, receiptSelfHash: hashBlindEvaluationArtifact(unsigned) };
}

export const BLIND_PAIR_AUTHORITY = AUTHORITY;
export const BLIND_PAIR_CANDIDATE_IDS = CANDIDATE_IDS;
