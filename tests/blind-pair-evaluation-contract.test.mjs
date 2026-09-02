import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  BLIND_PAIR_AUTHORITY,
  INKOS_BLIND_EVALUATOR_CONFIG_SHA256,
  INKOS_BLIND_EVALUATOR_SOUL_SHA256,
  assembleBlindPairEvaluationInputFromInkOSTransfer,
  buildBlindReviewReceiptFromRawEvidence,
  hashBlindEvaluationArtifact,
  scoreBlindCommercialEvaluation,
  validateBlindPairEvaluationInput,
  validateBlindPairEvaluationResult,
  validateBlindSurfaceScanReceipt,
} from "../tools/blind-pair-evaluation-contract.mjs";

const rawSha = (value) => createHash("sha256").update(value).digest("hex");
const sha = (value) => hashBlindEvaluationArtifact({ value });
const opaqueId = (prefix, value) => `${prefix}-${rawSha(value).slice(0, 24)}`;
const PAIR_ID = opaqueId("bp", "contract-pair");
const BLIND_RUN_ID = opaqueId("br", "contract-run");
const BLIND_SESSION_ID = opaqueId("br", "contract-session");
const REVIEWER_CONFIG_SHA256 = INKOS_BLIND_EVALUATOR_CONFIG_SHA256;
const REVIEWER_SOUL_SHA256 = INKOS_BLIND_EVALUATOR_SOUL_SHA256;
const COMMON_CONTEXT_TEXT = "공통 작품 기획과 캐논, 현재 Arc·Rail은 두 후보에 동일하게 적용된다.";
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const evaluation = (score = 90) => ({
  openingPressure: score,
  protagonistAgency: score,
  resistanceQuality: score,
  visiblePayoff: score,
  endingPropulsion: score,
  referenceEngineRetention: score,
  transformationIntegrity: score,
  styleFidelity: score,
});

function span(body, text) {
  const startCharacter = body.indexOf(text);
  assert.notEqual(startCharacter, -1);
  const startByte = Buffer.byteLength(body.slice(0, startCharacter));
  return {
    coordinateKind: "utf8-byte",
    startByte,
    endByte: startByte + Buffer.byteLength(text),
    sliceSha256: rawSha(text),
  };
}

function contexts() {
  const bodies = [
    "한글 감정이 이어진다.\n계약을 뒤집었다.",
    "압박 직후 자산을 샀다.\n다음 거래를 선언했다.",
  ];
  return bodies.map((body, index) => ({
    id: `candidate-${index === 0 ? "A" : "B"}`,
    body,
    sha256: rawSha(body),
    byteLength: Buffer.byteLength(body),
    evidenceSpans: index === 0
      ? [span(body, "한글 감정이 이어진다."), span(body, "계약을 뒤집었다.")]
      : [span(body, "압박 직후 자산을 샀다."), span(body, "다음 거래를 선언했다.")],
  }));
}

function input(candidateContexts = contexts()) {
  return {
    schemaVersion: "firefly-blind-pair-evaluation-input/v2",
    genre: "modern-fantasy-ko",
    pairId: PAIR_ID,
    round: 1,
    blindRunId: BLIND_RUN_ID,
    blindSessionId: BLIND_SESSION_ID,
    reviewPacket: { path: "exports/pair-01/packet.json", sha256: sha("packet"), byteLength: 500 },
    commonContext: {
      text: COMMON_CONTEXT_TEXT,
      sha256: rawSha(COMMON_CONTEXT_TEXT),
      byteLength: Buffer.byteLength(COMMON_CONTEXT_TEXT),
    },
    commonInputReceiptSha256: sha("common"),
    pairedGenerationReceiptSha256: sha("generation"),
    labelAssignmentReceiptSha256: sha("labels"),
    candidates: candidateContexts.map(({ id, sha256, byteLength }) => ({ id, sha256, byteLength })),
    producerActors: [
      { lane: "neutral", actorId: "producer-neutral-01", profileId: "inkos_neutral_baseline", terminalReceiptSha256: sha("neutral-terminal") },
      { lane: "soul", actorId: "producer-soul-01", profileId: "inkos_male_modern_fantasy", terminalReceiptSha256: sha("soul-terminal") },
    ],
    reviewer: {
      actorId: "reviewer-01", profileId: "inkos_blind_evaluator", provider: "openai-codex", model: "gpt-5.6-sol", reasoning: "high",
      configSha256: REVIEWER_CONFIG_SHA256, soulSha256: REVIEWER_SOUL_SHA256,
    },
    contentContract: { id: "fiction-content-neutral-ko/v1", sha256: sha("content"), intensityDirectiveSha256: sha("intensity") },
    authority: BLIND_PAIR_AUTHORITY,
  };
}

function genreIdentity(evidence, pass = true) {
  const values = () => (pass ? [structuredClone(evidence)] : []);
  return {
    worldConstraintEvidence: values(),
    repeatableVerbEvidence: values(),
    oppositionFormEvidence: values(),
    rewardStatusCurrencyEvidence: values(),
    nextEpisodeActionEvidence: values(),
    pass,
  };
}

function result(candidateContexts = contexts(), selections = {}) {
  const a = evaluation(88);
  const b = evaluation(92);
  const candidate = (index, commercial) => ({
    candidateSha256: candidateContexts[index].sha256,
    commercialEvaluation: commercial,
    commercialScore: scoreBlindCommercialEvaluation(commercial),
    emotionalCoherence: { score: index === 0 ? 86 : 93, evidence: [structuredClone(candidateContexts[index].evidenceSpans[0])] },
    contentNeutrality: { passed: true, violations: [] },
    canonContradictions: [],
    canonLeaks: [],
    genreIdentity: genreIdentity(candidateContexts[index].evidenceSpans[1]),
  });
  return {
    schemaVersion: "firefly-blind-pair-evaluator-result/v2",
    pairId: PAIR_ID,
    round: 1,
    blindRunId: BLIND_RUN_ID,
    pairedGenerationReceiptSha256: sha("generation"),
    winner: selections.winner ?? "candidate-B",
    rankingReason: "두 후보의 상업 작동과 장르 정체성을 같은 기준으로 비교했다.",
    evaluations: { "candidate-A": candidate(0, a), "candidate-B": candidate(1, b) },
    humanDecision: "pending",
    authority: BLIND_PAIR_AUTHORITY,
  };
}

function noMatchSurfaceReceipt(candidate) {
  const upstreamScanSha256 = sha(`upstream-${candidate.id}`);
  const unsigned = {
    schemaVersion: "firefly-blind-pair-surface-scan/v1",
    candidateId: candidate.id,
    candidateSha256: candidate.sha256,
    candidateByteLength: candidate.byteLength,
    scanner: { version: "genre-soul-surface-scanner/v1", exactTokenCount: 12, exactByteLength: 120 },
    corpus: {
      privateRegistrySha256: sha("registry"),
      availableSourceCount: 1,
      observedSourceSetSha256: sha("observed"),
      surfaceIndexSha256: sha("surface-index"),
    },
    upstreamScanSha256,
    status: "completed-no-match",
    matchCount: 0,
    matches: [],
    truncated: false,
    automaticRewriteApplied: false,
    automaticRejectApplied: false,
    humanDecision: "pending",
  };
  return { receipt: { ...unsigned, receiptSelfHash: hashBlindEvaluationArtifact(unsigned) }, upstreamScanSha256 };
}

function evaluatorInput(sealedInput, candidateContexts) {
  return {
    schemaVersion: "private-firefly-blind-pair-evaluator-input/v2",
    genre: sealedInput.genre,
    pairId: sealedInput.pairId,
    round: sealedInput.round,
    blindRunId: sealedInput.blindRunId,
    pairedGenerationReceiptSha256: sealedInput.pairedGenerationReceiptSha256,
    reviewerRuntime: {
      configSha256: sealedInput.reviewer.configSha256,
      soulSha256: sealedInput.reviewer.soulSha256,
    },
    commonContext: sealedInput.commonContext,
    contentContract: sealedInput.contentContract,
    candidates: candidateContexts.map(({ id, body, sha256, byteLength, evidenceSpans }) => ({
      id, body, sha256, byteLength, evidenceSpans,
    })),
    authority: BLIND_PAIR_AUTHORITY,
  };
}

function rawEvidence(sealedInput, evaluatorResult, candidateContexts, overrides = {}) {
  const evaluatorInputBytes = overrides.evaluatorInputBytes ?? jsonBytes(evaluatorInput(sealedInput, candidateContexts));
  const evaluatorResultBytes = overrides.evaluatorResultBytes ?? jsonBytes(evaluatorResult);
  const evaluatorInputSha256 = rawSha(evaluatorInputBytes);
  const hostReceipt = {
    role: "blind-pair-commercial-evaluator",
    runId: "review-run-01",
    profileId: sealedInput.reviewer.profileId,
    profileConfigSha256: sealedInput.reviewer.configSha256,
    soulSha256: sealedInput.reviewer.soulSha256,
    provider: "openai-codex",
    model: "gpt-5.6-sol",
    reasoningEffort: "high",
    inputDigest: hashBlindEvaluationArtifact(sealedInput),
    inputSha256: rawSha(jsonBytes([{ path: "/sealed/evaluator-input.json", sha256: evaluatorInputSha256 }])),
    expectedReadCount: 1,
    exactReadCount: 1,
    exactReadSha256s: [evaluatorInputSha256],
    resultSha256: rawSha(evaluatorResultBytes),
    completedAt: "2026-09-02T00:00:00.000Z",
    ...overrides.hostReceipt,
  };
  return {
    evaluatorInputBytes,
    evaluatorResultBytes,
    hostReceiptBytes: overrides.hostReceiptBytes ?? jsonBytes(hostReceipt),
  };
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortJson(nested)]));
  }
  return value;
}

function inkosTransfer(sealedInput, candidateContexts) {
  const unsigned = {
    schemaVersion: "inkos-blind-pair-evaluation-transfer/v1",
    pairId: sealedInput.pairId,
    round: sealedInput.round,
    blindRunId: sealedInput.blindRunId,
    blindSessionId: sealedInput.blindSessionId,
    bookId: "book-01",
    chapterNumber: 1,
    commonContext: sealedInput.commonContext,
    commonInputReceiptSha256: sealedInput.commonInputReceiptSha256,
    pairedGenerationReceiptSha256: sealedInput.pairedGenerationReceiptSha256,
    labelAssignmentReceiptSha256: sealedInput.labelAssignmentReceiptSha256,
    canaryIsolation: {
      receiptSha256: sha("canary-receipt"), receiptSelfHash: sha("canary-self"),
      isolationScopeSha256: sha("canary-scope"), commonSnapshotSha256: sha("canary-snapshot"),
    },
    candidates: candidateContexts.map(({ id, body, sha256, byteLength }) => ({ id, body, sha256, byteLength })),
    generatedAt: "2026-09-02T00:00:00.000Z",
    authority: {
      scope: "evaluation-input", mayWriteInkOSCanon: false, mayRevealGeneratorIdentity: false, ownerDecisionRequired: true,
    },
  };
  return { ...unsigned, transferSelfHash: rawSha(JSON.stringify(sortJson(unsigned))) };
}

test("assembles an InkOS v1 transfer into the bodyless RefLab v2 input without importing a candidate-to-lane mapping", () => {
  const candidateContexts = contexts();
  const sealedInput = input(candidateContexts);
  const transfer = inkosTransfer(sealedInput, candidateContexts);
  const assembled = assembleBlindPairEvaluationInputFromInkOSTransfer({
    transfer,
    genre: sealedInput.genre,
    reviewPacket: sealedInput.reviewPacket,
    producerActors: sealedInput.producerActors,
    reviewerActorId: sealedInput.reviewer.actorId,
    contentContract: sealedInput.contentContract,
  });
  assert.equal(validateBlindPairEvaluationInput(assembled), true);
  assert.deepEqual(assembled.commonContext, transfer.commonContext);
  assert.deepEqual(assembled.candidates, transfer.candidates.map(({ id, sha256, byteLength }) => ({ id, sha256, byteLength })));
  assert.equal(assembled.reviewer.configSha256, INKOS_BLIND_EVALUATOR_CONFIG_SHA256);
  assert.equal(assembled.reviewer.soulSha256, INKOS_BLIND_EVALUATOR_SOUL_SHA256);
  assert.equal(JSON.stringify(assembled).includes("neutralWorkOrderId"), false);
  assert.equal(JSON.stringify(assembled).includes("candidateToLane"), false);

  const mappingLeak = structuredClone(transfer);
  mappingLeak.candidateToLane = { "candidate-A": "neutral", "candidate-B": "soul" };
  assert.throws(() => assembleBlindPairEvaluationInputFromInkOSTransfer({
    transfer: mappingLeak,
    genre: sealedInput.genre,
    reviewPacket: sealedInput.reviewPacket,
    producerActors: sealedInput.producerActors,
    reviewerActorId: sealedInput.reviewer.actorId,
    contentContract: sealedInput.contentContract,
  }), /keys must be exactly/u);

  const tampered = structuredClone(transfer);
  tampered.candidates[0].body = `${tampered.candidates[0].body} 변조`;
  assert.throws(() => assembleBlindPairEvaluationInputFromInkOSTransfer({
    transfer: tampered,
    genre: sealedInput.genre,
    reviewPacket: sealedInput.reviewPacket,
    producerActors: sealedInput.producerActors,
    reviewerActorId: sealedInput.reviewer.actorId,
    contentContract: sealedInput.contentContract,
  }), /body\/sha256\/byteLength binding drifted/u);
});

test("validates multibyte candidate-local spans and builds a bodyless Storyyard-v2-ready receipt", () => {
  const candidateContexts = contexts();
  const sealedInput = input(candidateContexts);
  const evaluatorResult = result(candidateContexts);
  assert.equal(validateBlindPairEvaluationInput(sealedInput), true);
  assert.equal(validateBlindPairEvaluationResult(evaluatorResult, sealedInput, candidateContexts), true);
  const surfaces = candidateContexts.map(noMatchSurfaceReceipt);
  const receipt = buildBlindReviewReceiptFromRawEvidence({
    input: sealedInput,
    result: evaluatorResult,
    candidateContexts,
    ...rawEvidence(sealedInput, evaluatorResult, candidateContexts),
    surfaceScans: surfaces,
  });
  assert.equal(receipt.schemaVersion, "firefly-blind-review-receipt/v2");
  assert.equal(receipt.outcome.winner, "candidate-B");
  assert.equal(receipt.outcome.emotionalCoherenceScores["candidate-B"], 93);
  assert.deepEqual(receipt.storyyardProjection, {
    purpose: "promotion-evaluation",
    actions: ["select", "tie", "invalid"],
    decisionEffect: "advisory",
    manuscriptApply: false,
    canonLeakPolicy: "block-on-nonzero",
  });
  assert.equal(receipt.commonContextSha256, sealedInput.commonContext.sha256);
  assert.equal(receipt.reviewer.configSha256, REVIEWER_CONFIG_SHA256);
  assert.equal(receipt.reviewer.soulSha256, REVIEWER_SOUL_SHA256);
  assert.match(receipt.candidateBindings["candidate-A"].evaluationBindingSha256, /^[0-9a-f]{64}$/u);
  assert.equal(receipt.receiptSelfHash, hashBlindEvaluationArtifact(Object.fromEntries(
    Object.entries(receipt).filter(([key]) => key !== "receiptSelfHash"),
  )));
  assert.equal(JSON.stringify(receipt).includes(candidateContexts[0].body), false);
});

test("fails closed on wrong UTF-8 boundaries, wrong slice hashes, out-of-range spans, and uncatalogued evidence", () => {
  const candidateContexts = contexts();
  const sealedInput = input(candidateContexts);

  const boundary = result(candidateContexts);
  boundary.evaluations["candidate-A"].emotionalCoherence.evidence[0] = {
    coordinateKind: "utf8-byte", startByte: 1, endByte: 4, sliceSha256: rawSha(Buffer.from(candidateContexts[0].body).subarray(1, 4)),
  };
  assert.throws(() => validateBlindPairEvaluationResult(boundary, sealedInput, candidateContexts), /UTF-8 boundaries/u);

  const wrongHash = result(candidateContexts);
  wrongHash.evaluations["candidate-A"].emotionalCoherence.evidence[0].sliceSha256 = "0".repeat(64);
  assert.throws(() => validateBlindPairEvaluationResult(wrongHash, sealedInput, candidateContexts), /slice SHA-256 mismatches/u);

  const outOfRange = result(candidateContexts);
  outOfRange.evaluations["candidate-B"].genreIdentity.worldConstraintEvidence[0].endByte = 99_999;
  assert.throws(() => validateBlindPairEvaluationResult(outOfRange, sealedInput, candidateContexts), /out of range/u);

  const invented = result(candidateContexts);
  invented.evaluations["candidate-A"].emotionalCoherence.evidence = [span(candidateContexts[0].body, "한글")];
  assert.throws(() => validateBlindPairEvaluationResult(invented, sealedInput, candidateContexts), /not copied from the sealed/u);
});

test("rejects freeform-only violations and requires typed evidence for content, contradictions, and leaks", () => {
  const candidateContexts = contexts();
  const sealedInput = input(candidateContexts);
  const evidence = candidateContexts[0].evidenceSpans[0];

  const freeform = result(candidateContexts);
  freeform.evaluations["candidate-A"].contentNeutrality = {
    passed: false,
    violations: [{ code: "moral-lecture", evidence: "서사 밖 훈계" }],
  };
  assert.throws(() => validateBlindPairEvaluationResult(freeform, sealedInput, candidateContexts), /typed exact spans/u);

  const emptyLeak = result(candidateContexts);
  emptyLeak.evaluations["candidate-A"].canonLeaks = [{ code: "canon-leak", evidence: [] }];
  assert.throws(() => validateBlindPairEvaluationResult(emptyLeak, sealedInput, candidateContexts), /non-empty/u);

  const typed = result(candidateContexts);
  typed.evaluations["candidate-A"].contentNeutrality = {
    passed: false,
    violations: [{ code: "moral-lecture", evidence: [evidence] }],
  };
  typed.evaluations["candidate-A"].canonContradictions = [{ code: "hard-canon-contradiction", evidence: [evidence] }];
  typed.evaluations["candidate-A"].canonLeaks = [{ code: "canon-leak", evidence: [evidence] }];
  assert.equal(validateBlindPairEvaluationResult(typed, sealedInput, candidateContexts), true);
});

test("accepts checked empty contradiction/leak arrays only with exact non-empty common context", () => {
  const candidateContexts = contexts();
  const sealedInput = input(candidateContexts);
  const checked = result(candidateContexts);
  for (const id of ["candidate-A", "candidate-B"]) {
    assert.deepEqual(checked.evaluations[id].canonContradictions, []);
    assert.deepEqual(checked.evaluations[id].canonLeaks, []);
  }
  assert.ok(sealedInput.commonContext.byteLength > 0);
  assert.equal(validateBlindPairEvaluationResult(checked, sealedInput, candidateContexts), true);

  const absent = input(candidateContexts);
  absent.commonContext = { text: "   ", sha256: rawSha("   "), byteLength: 3 };
  assert.throws(() => validateBlindPairEvaluationResult(checked, absent, candidateContexts), /non-empty bounded text/u);
});

test("surface completion semantics reject fake empties, truncation, body drift, and self-hash tampering", () => {
  const candidate = contexts()[0];
  const completed = noMatchSurfaceReceipt(candidate);
  assert.equal(validateBlindSurfaceScanReceipt(completed.receipt, candidate, {
    upstreamScanSha256: completed.upstreamScanSha256,
  }), true);

  const fakeEmpty = structuredClone(completed.receipt);
  fakeEmpty.matchCount = 1;
  assert.throws(() => validateBlindSurfaceScanReceipt(fakeEmpty, candidate), /match count contradicts/u);

  const truncated = structuredClone(completed.receipt);
  truncated.truncated = true;
  assert.throws(() => validateBlindSurfaceScanReceipt(truncated, candidate), /complete and non-truncated/u);

  const bodyDrift = { ...candidate, body: `${candidate.body}변조` };
  assert.throws(() => validateBlindSurfaceScanReceipt(completed.receipt, bodyDrift), /candidate\/body binding drifted/u);

  const tampered = structuredClone(completed.receipt);
  tampered.corpus.surfaceIndexSha256 = sha("tampered");
  assert.throws(() => validateBlindSurfaceScanReceipt(tampered, candidate), /self-hash drifted/u);
});

test("fails closed on actor collapse, semantic IDs, arbitrary reviewer identity/digests, and common-context drift", () => {
  const candidateContexts = contexts();
  const collapsed = input(candidateContexts);
  collapsed.reviewer.actorId = collapsed.producerActors[0].actorId;
  assert.throws(() => validateBlindPairEvaluationInput(collapsed), /actor-distinct/u);

  const mapped = input(candidateContexts);
  mapped.candidates[0].id = "soul";
  assert.throws(() => validateBlindPairEvaluationInput(mapped), /candidate-A then candidate-B/u);

  for (const field of ["pairId", "blindRunId", "blindSessionId"]) {
    const semantic = input(candidateContexts);
    semantic[field] = field === "pairId" ? "bp-modern-fantasy-pair" : `br-${field}-modern`;
    assert.throws(() => validateBlindPairEvaluationInput(semantic), /must be opaque/u);
  }

  const arbitraryProfile = input(candidateContexts);
  arbitraryProfile.reviewer.profileId = "another-reviewer";
  assert.throws(() => validateBlindPairEvaluationInput(arbitraryProfile), /must be inkos_blind_evaluator/u);

  const digestDrift = input(candidateContexts);
  digestDrift.reviewer.configSha256 = "0".repeat(64);
  assert.throws(() => validateBlindPairEvaluationInput(digestDrift), /fixed audited/u);

  const missingConfig = input(candidateContexts);
  delete missingConfig.reviewer.configSha256;
  assert.throws(() => validateBlindPairEvaluationInput(missingConfig), /keys must be exactly/u);

  const missingContext = input(candidateContexts);
  delete missingContext.commonContext;
  assert.throws(() => validateBlindPairEvaluationInput(missingContext), /keys must be exactly/u);

  const contextDrift = input(candidateContexts);
  contextDrift.commonContext.text += " 변조";
  assert.throws(() => validateBlindPairEvaluationInput(contextDrift), /commonContext text\/bytes\/hash binding drifted/u);
});

test("fails closed on score/result drift and recomputes all three raw evidence hashes", () => {
  const candidateContexts = contexts();

  const drifted = result(candidateContexts);
  drifted.evaluations["candidate-A"].commercialScore = 1;
  assert.throws(() => validateBlindPairEvaluationResult(drifted, input(candidateContexts), candidateContexts), /does not match/u);

  const candidateHashDrift = result(candidateContexts);
  candidateHashDrift.evaluations["candidate-B"].candidateSha256 = "0".repeat(64);
  assert.throws(
    () => validateBlindPairEvaluationResult(candidateHashDrift, input(candidateContexts), candidateContexts),
    /candidateSha256 drifted/u,
  );

  const extra = result(candidateContexts);
  extra.generatedBy = "hidden-actor";
  assert.throws(() => validateBlindPairEvaluationResult(extra, input(candidateContexts), candidateContexts), /keys must be exactly/u);

  const sealedInput = input(candidateContexts);
  const evaluatorResult = result(candidateContexts);
  const evidence = rawEvidence(sealedInput, evaluatorResult, candidateContexts);
  const receipt = buildBlindReviewReceiptFromRawEvidence({
    input: sealedInput,
    result: evaluatorResult,
    candidateContexts,
    ...evidence,
    surfaceScans: candidateContexts.map(noMatchSurfaceReceipt),
  });
  assert.equal(receipt.evaluatorBinding.evaluatorInputSha256, rawSha(evidence.evaluatorInputBytes));
  assert.equal(receipt.evaluatorBinding.evaluatorResultSha256, rawSha(evidence.evaluatorResultBytes));
  assert.equal(receipt.evaluatorBinding.hostReceiptSha256, rawSha(evidence.hostReceiptBytes));

  const tamperedResultBytes = Buffer.from(evidence.evaluatorResultBytes);
  tamperedResultBytes[tamperedResultBytes.indexOf(Buffer.from("candidate-B"))] = 0x58;
  assert.throws(() => buildBlindReviewReceiptFromRawEvidence({
    input: sealedInput,
    result: evaluatorResult,
    candidateContexts,
    ...evidence,
    evaluatorResultBytes: tamperedResultBytes,
    surfaceScans: candidateContexts.map(noMatchSurfaceReceipt),
  }), /raw result bytes drifted|host receipt runtime\/config\/Soul\/input\/result binding drifted/u);

  const wrongConfigEvidence = rawEvidence(sealedInput, evaluatorResult, candidateContexts, {
    hostReceipt: { profileConfigSha256: sha("arbitrary-config") },
  });
  assert.throws(() => buildBlindReviewReceiptFromRawEvidence({
    input: sealedInput,
    result: evaluatorResult,
    candidateContexts,
    ...wrongConfigEvidence,
    surfaceScans: candidateContexts.map(noMatchSurfaceReceipt),
  }), /host receipt runtime\/config\/Soul\/input\/result binding drifted/u);

  const wrongReadEvidence = rawEvidence(sealedInput, evaluatorResult, candidateContexts, {
    hostReceipt: { exactReadSha256s: [sha("arbitrary-read")] },
  });
  assert.throws(() => buildBlindReviewReceiptFromRawEvidence({
    input: sealedInput,
    result: evaluatorResult,
    candidateContexts,
    ...wrongReadEvidence,
    surfaceScans: candidateContexts.map(noMatchSurfaceReceipt),
  }), /host receipt runtime\/config\/Soul\/input\/result binding drifted/u);

  const tamperedEvaluatorInput = evaluatorInput(sealedInput, candidateContexts);
  tamperedEvaluatorInput.commonContext = {
    text: `${sealedInput.commonContext.text} 변조`,
    sha256: rawSha(`${sealedInput.commonContext.text} 변조`),
    byteLength: Buffer.byteLength(`${sealedInput.commonContext.text} 변조`),
  };
  assert.throws(() => buildBlindReviewReceiptFromRawEvidence({
    input: sealedInput,
    result: evaluatorResult,
    candidateContexts,
    ...evidence,
    evaluatorInputBytes: jsonBytes(tamperedEvaluatorInput),
    surfaceScans: candidateContexts.map(noMatchSurfaceReceipt),
  }), /common context, content contract, or authority drifted/u);
});
