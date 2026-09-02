import { createHash } from "node:crypto";

const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,239}$/u;
const GENRES = new Set(["modern-fantasy-ko", "fantasy-ko", "murim-ko"]);
const CANDIDATE_IDS = Object.freeze(["candidate-A", "candidate-B"]);
const COMMERCIAL_FIELDS = Object.freeze([
  "openingPressure",
  "protagonistAgency",
  "resistanceQuality",
  "visiblePayoff",
  "endingPropulsion",
  "referenceEngineRetention",
  "transformationIntegrity",
  "styleFidelity",
]);
const CONTENT_NEUTRAL_CODES = new Set([
  "unauthorized-softening",
  "unauthorized-escalation",
  "moral-lecture",
  "disclaimer",
  "forced-punishment",
  "forced-apology",
  "forced-redemption",
  "forced-cost",
  "forced-moral-growth",
  "forced-balance",
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

export function hashBlindEvaluationArtifact(value) {
  return createHash("sha256").update(canonicalBytes(value)).digest("hex");
}

export function scoreBlindCommercialEvaluation(evaluation) {
  exactKeys(evaluation, COMMERCIAL_FIELDS, "commercial evaluation");
  for (const field of COMMERCIAL_FIELDS) {
    if (typeof evaluation[field] !== "number" || !Number.isFinite(evaluation[field])
      || evaluation[field] < 0 || evaluation[field] > 100) {
      throw new Error(`commercial evaluation.${field} must be between 0 and 100.`);
    }
  }
  const dopamine = COMMERCIAL_FIELDS.slice(0, 5)
    .reduce((sum, field) => sum + evaluation[field], 0) / 5;
  const reference = COMMERCIAL_FIELDS.slice(5)
    .reduce((sum, field) => sum + evaluation[field], 0) / 3;
  return Math.round(((dopamine * 0.7) + (reference * 0.3)) * 10) / 10;
}

export function validateBlindPairEvaluationInput(input) {
  exactKeys(input, [
    "schemaVersion", "genre", "pairId", "round", "blindRunId", "blindSessionId",
    "reviewPacket", "commonInputReceiptSha256", "pairedGenerationReceiptSha256",
    "labelAssignmentReceiptSha256", "candidates", "producerActors", "reviewer",
    "contentContract", "authority",
  ], "blind evaluation input");
  if (input.schemaVersion !== "firefly-blind-pair-evaluation-input/v1") {
    throw new Error("Blind evaluation input schemaVersion is invalid.");
  }
  if (!GENRES.has(input.genre)) throw new Error("Blind evaluation input genre is invalid.");
  for (const [value, label] of [
    [input.pairId, "pairId"], [input.blindRunId, "blindRunId"], [input.blindSessionId, "blindSessionId"],
  ]) assertId(value, `blind evaluation input.${label}`);
  if (![1, 2, 3].includes(input.round)) throw new Error("Blind evaluation input round must be 1, 2, or 3.");
  assertArtifactRef(input.reviewPacket, "blind evaluation input.reviewPacket");
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
  exactKeys(input.reviewer, ["actorId", "profileId", "provider", "model", "reasoning"], "blind evaluation input.reviewer");
  assertId(input.reviewer.actorId, "blind evaluation input.reviewer.actorId");
  assertId(input.reviewer.profileId, "blind evaluation input.reviewer.profileId");
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

function validateCandidateResult(candidate, label) {
  exactKeys(candidate, ["commercialEvaluation", "commercialScore", "emotionalCoherenceNote", "contentNeutrality", "genreIdentity"], label);
  const score = scoreBlindCommercialEvaluation(candidate.commercialEvaluation);
  if (candidate.commercialScore !== score) throw new Error(`${label}.commercialScore does not match dopamine70-reference30-v1.`);
  assertText(candidate.emotionalCoherenceNote, `${label}.emotionalCoherenceNote`);
  exactKeys(candidate.contentNeutrality, ["passed", "violations"], `${label}.contentNeutrality`);
  if (!Array.isArray(candidate.contentNeutrality.violations)) throw new Error(`${label}.contentNeutrality.violations must be an array.`);
  candidate.contentNeutrality.violations.forEach((violation, index) => {
    exactKeys(violation, ["code", "evidence"], `${label}.contentNeutrality.violations[${index}]`);
    if (!CONTENT_NEUTRAL_CODES.has(violation.code)) throw new Error(`${label} has an unknown content-neutrality code.`);
    assertText(violation.evidence, `${label}.contentNeutrality.violations[${index}].evidence`, 2_000);
  });
  if (candidate.contentNeutrality.passed !== (candidate.contentNeutrality.violations.length === 0)) {
    throw new Error(`${label}.contentNeutrality passed flag contradicts its violations.`);
  }
  exactKeys(candidate.genreIdentity, [
    "worldConstraintEvidence", "repeatableVerbEvidence", "oppositionFormEvidence",
    "rewardStatusCurrencyEvidence", "nextEpisodeActionEvidence", "pass",
  ], `${label}.genreIdentity`);
  const evidenceFields = Object.keys(candidate.genreIdentity).filter((key) => key !== "pass");
  for (const field of evidenceFields) {
    const values = candidate.genreIdentity[field];
    if (!Array.isArray(values) || values.some((value) => typeof value !== "string" || value.trim() === "" || value.length > 2_000)) {
      throw new Error(`${label}.genreIdentity.${field} must be bounded evidence text.`);
    }
  }
  const complete = evidenceFields.every((field) => candidate.genreIdentity[field].length > 0);
  if (candidate.genreIdentity.pass !== complete) throw new Error(`${label}.genreIdentity pass flag contradicts evidence coverage.`);
}

export function validateBlindPairEvaluationResult(result, input) {
  validateBlindPairEvaluationInput(input);
  exactKeys(result, [
    "schemaVersion", "pairId", "round", "blindRunId", "pairedGenerationReceiptSha256",
    "winner", "rankingReason", "evaluations", "hardContradictions", "canonLeaks",
    "humanDecision", "authority",
  ], "blind evaluation result");
  if (result.schemaVersion !== "firefly-blind-pair-evaluator-result/v1") {
    throw new Error("Blind evaluation result schemaVersion is invalid.");
  }
  if (result.pairId !== input.pairId || result.round !== input.round || result.blindRunId !== input.blindRunId
    || result.pairedGenerationReceiptSha256 !== input.pairedGenerationReceiptSha256) {
    throw new Error("Blind evaluation result does not match its sealed input.");
  }
  if (![...CANDIDATE_IDS, "tie", "invalid"].includes(result.winner)) throw new Error("Blind evaluation winner is invalid.");
  assertText(result.rankingReason, "blind evaluation result.rankingReason");
  exactKeys(result.evaluations, CANDIDATE_IDS, "blind evaluation result.evaluations");
  CANDIDATE_IDS.forEach((id) => validateCandidateResult(result.evaluations[id], `blind evaluation result.evaluations.${id}`));
  for (const field of ["hardContradictions", "canonLeaks"]) {
    if (!Array.isArray(result[field])) throw new Error(`blind evaluation result.${field} must be an array.`);
    result[field].forEach((finding, index) => {
      exactKeys(finding, ["candidateId", "code", "evidence"], `blind evaluation result.${field}[${index}]`);
      if (!CANDIDATE_IDS.includes(finding.candidateId)) throw new Error(`blind evaluation result.${field} candidate is invalid.`);
      assertId(finding.code, `blind evaluation result.${field}[${index}].code`);
      assertText(finding.evidence, `blind evaluation result.${field}[${index}].evidence`, 2_000);
    });
  }
  if (result.humanDecision !== "pending") throw new Error("Blind evaluator must leave the human decision pending.");
  assertAuthority(result.authority, "blind evaluation result.authority");
  return true;
}

export function buildBlindReviewReceipt({ input, result, hermes, createdAt }) {
  validateBlindPairEvaluationResult(result, input);
  exactKeys(hermes, ["runId", "profileId", "model", "reasoning", "inputSha256", "resultSha256", "hostReceiptSha256"], "blind review Hermes evidence");
  for (const field of ["runId", "profileId"]) assertId(hermes[field], `blind review Hermes evidence.${field}`);
  if (hermes.profileId !== input.reviewer.profileId || hermes.model !== "gpt-5.6-sol" || hermes.reasoning !== "high") {
    throw new Error("Blind review Hermes runtime does not match the sealed reviewer.");
  }
  const inputSha256 = hashBlindEvaluationArtifact(input);
  const resultSha256 = hashBlindEvaluationArtifact(result);
  if (hermes.inputSha256 !== inputSha256 || hermes.resultSha256 !== resultSha256) {
    throw new Error("Blind review Hermes evidence is not bound to the exact input and result.");
  }
  assertSha(hermes.hostReceiptSha256, "blind review Hermes evidence.hostReceiptSha256");
  if (typeof createdAt !== "string" || !Number.isFinite(Date.parse(createdAt))) {
    throw new Error("Blind review receipt createdAt is invalid.");
  }
  const unsigned = {
    schemaVersion: "firefly-blind-review-receipt/v1",
    genre: input.genre,
    pairId: input.pairId,
    round: input.round,
    blindRunId: input.blindRunId,
    blindSessionId: input.blindSessionId,
    inputSha256,
    resultSha256,
    reviewPacketSha256: input.reviewPacket.sha256,
    commonInputReceiptSha256: input.commonInputReceiptSha256,
    pairedGenerationReceiptSha256: input.pairedGenerationReceiptSha256,
    labelAssignmentReceiptSha256: input.labelAssignmentReceiptSha256,
    reviewer: {
      actorId: input.reviewer.actorId,
      profileId: input.reviewer.profileId,
      model: hermes.model,
      reasoning: hermes.reasoning,
      actorDistinctFromProducers: true,
      runId: hermes.runId,
      hostReceiptSha256: hermes.hostReceiptSha256,
    },
    outcome: {
      winner: result.winner,
      commercialScores: Object.fromEntries(CANDIDATE_IDS.map((id) => [id, result.evaluations[id].commercialScore])),
      genreIdentityPassed: Object.fromEntries(CANDIDATE_IDS.map((id) => [id, result.evaluations[id].genreIdentity.pass])),
      contentNeutralViolationCounts: Object.fromEntries(CANDIDATE_IDS.map((id) => [id, result.evaluations[id].contentNeutrality.violations.length])),
      hardContradictionCount: result.hardContradictions.length,
      canonLeakCount: result.canonLeaks.length,
      humanDecision: "pending",
    },
    authority: AUTHORITY,
    createdAt,
  };
  return { ...unsigned, receiptSelfHash: hashBlindEvaluationArtifact(unsigned) };
}

export const BLIND_PAIR_AUTHORITY = AUTHORITY;
