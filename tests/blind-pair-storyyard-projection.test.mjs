import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  BLIND_PAIR_AUTHORITY,
  INKOS_BLIND_EVALUATOR_CONFIG_SHA256,
  INKOS_BLIND_EVALUATOR_SOUL_SHA256,
  buildBlindReviewReceiptFromRawEvidence,
  hashBlindEvaluationArtifact,
  scoreBlindCommercialEvaluation,
} from "../tools/blind-pair-evaluation-contract.mjs";
import {
  assertStoryyardV2EvaluationPacketIdentity,
  buildStoryyardV2EvaluationProjection,
} from "../tools/blind-pair-storyyard-projection.mjs";

const rawSha = (value) => createHash("sha256").update(value).digest("hex");
const sealedSha = (value) => hashBlindEvaluationArtifact({ value });
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const opaqueId = (prefix, value) => `${prefix}-${rawSha(value).slice(0, 24)}`;
const generatedAt = "2026-09-02T06:00:00.000Z";

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortJson(nested)]));
  }
  return value;
}

const canonicalSha = (value) => rawSha(JSON.stringify(sortJson(value)));

function fullSpan(body) {
  return {
    coordinateKind: "utf8-byte",
    startByte: 0,
    endByte: Buffer.byteLength(body),
    sliceSha256: rawSha(body),
  };
}

function fixture() {
  const candidateContexts = ["후보 A의 압박과 반격.", "후보 B의 계약과 보상."].map((body, index) => ({
    id: `candidate-${index === 0 ? "A" : "B"}`,
    body,
    sha256: rawSha(body),
    byteLength: Buffer.byteLength(body),
    evidenceSpans: [fullSpan(body)],
  }));
  const commonText = "공통 Book brief, canon, Arc와 Rail의 lane-neutral 원문 projection.";
  const commonContext = { text: commonText, sha256: rawSha(commonText), byteLength: Buffer.byteLength(commonText) };
  const input = {
    schemaVersion: "firefly-blind-pair-evaluation-input/v2",
    genre: "modern-fantasy-ko",
    pairId: opaqueId("bp", "storyyard-pair"),
    round: 2,
    blindRunId: opaqueId("br", "storyyard-run"),
    blindSessionId: opaqueId("br", "storyyard-session"),
    reviewPacket: { path: "exports/private/review-packet.json", sha256: sealedSha("pending-transfer"), byteLength: 200 },
    commonContext,
    commonInputReceiptSha256: canonicalSha({ schemaVersion: "inkos-blind-common-context/v1", commonContext }),
    pairedGenerationReceiptSha256: sealedSha("paired-generation"),
    labelAssignmentReceiptSha256: sealedSha("label-assignment"),
    candidates: candidateContexts.map(({ id, sha256, byteLength }) => ({ id, sha256, byteLength })),
    producerActors: [
      { lane: "neutral", actorId: "producer-neutral", profileId: "inkos_neutral_baseline", terminalReceiptSha256: sealedSha("neutral-terminal") },
      { lane: "soul", actorId: "producer-soul", profileId: "inkos_male_modern_fantasy", terminalReceiptSha256: sealedSha("soul-terminal") },
    ],
    reviewer: {
      actorId: "reviewer-blind", profileId: "inkos_blind_evaluator", provider: "openai-codex",
      model: "gpt-6-astra", reasoning: "medium", configSha256: INKOS_BLIND_EVALUATOR_CONFIG_SHA256, soulSha256: INKOS_BLIND_EVALUATOR_SOUL_SHA256,
    },
    contentContract: {
      id: "fiction-content-neutral-ko/v1", sha256: sealedSha("content-contract"), intensityDirectiveSha256: sealedSha("intensity"),
    },
    authority: BLIND_PAIR_AUTHORITY,
  };
  const canaryIsolation = {
    receiptSha256: sealedSha("isolation-receipt"), receiptSelfHash: sealedSha("isolation-self"),
    isolationScopeSha256: sealedSha("isolation-scope"), commonSnapshotSha256: sealedSha("common-snapshot"),
  };
  const unsignedTransfer = {
    schemaVersion: "inkos-blind-pair-evaluation-transfer/v1",
    pairId: input.pairId,
    round: input.round,
    blindRunId: input.blindRunId,
    blindSessionId: input.blindSessionId,
    bookId: "book-01",
    chapterNumber: 1,
    commonContext,
    commonInputReceiptSha256: input.commonInputReceiptSha256,
    pairedGenerationReceiptSha256: input.pairedGenerationReceiptSha256,
    labelAssignmentReceiptSha256: input.labelAssignmentReceiptSha256,
    canaryIsolation,
    candidates: candidateContexts.map(({ id, body, sha256, byteLength }) => ({ id, body, sha256, byteLength })),
    generatedAt,
    authority: {
      scope: "evaluation-input", mayWriteInkOSCanon: false, mayRevealGeneratorIdentity: false, ownerDecisionRequired: true,
    },
  };
  const transfer = { ...unsignedTransfer, transferSelfHash: canonicalSha(unsignedTransfer) };
  const transferBytes = jsonBytes(transfer);
  input.reviewPacket = {
    path: input.reviewPacket.path,
    sha256: rawSha(transferBytes),
    byteLength: transferBytes.byteLength,
  };
  const commercial = (score) => ({
    openingPressure: score, protagonistAgency: score, resistanceQuality: score, visiblePayoff: score,
    endingPropulsion: score, referenceEngineRetention: score, transformationIntegrity: score, styleFidelity: score,
  });
  const candidateEvaluation = (index, score) => {
    const span = candidateContexts[index].evidenceSpans[0];
    const evaluation = commercial(score);
    return {
      candidateSha256: candidateContexts[index].sha256,
      commercialEvaluation: evaluation,
      commercialScore: scoreBlindCommercialEvaluation(evaluation),
      emotionalCoherence: { score: score - 1, evidence: [span] },
      contentNeutrality: { passed: true, violations: [] },
      canonContradictions: [],
      canonLeaks: [],
      genreIdentity: {
        worldConstraintEvidence: [span], repeatableVerbEvidence: [span], oppositionFormEvidence: [span],
        rewardStatusCurrencyEvidence: [span], nextEpisodeActionEvidence: [span], pass: true,
      },
    };
  };
  const result = {
    schemaVersion: "firefly-blind-pair-evaluator-result/v2",
    pairId: input.pairId,
    round: input.round,
    blindRunId: input.blindRunId,
    pairedGenerationReceiptSha256: input.pairedGenerationReceiptSha256,
    winner: "candidate-B",
    rankingReason: "후보 B의 지급과 다음 행동 약속이 더 선명하다.",
    evaluations: { "candidate-A": candidateEvaluation(0, 86), "candidate-B": candidateEvaluation(1, 92) },
    humanDecision: "pending",
    authority: BLIND_PAIR_AUTHORITY,
  };
  return { input, result, candidateContexts, transfer };
}

function surface(candidate, withMatch) {
  const selectorBody = {
    provenanceBridgeReceiptSha256: sealedSha(`bridge-${candidate.id}`),
    matchMethod: "exact-token-12",
    candidate: {
      coordinateKind: "utf8-byte",
      candidateContentSha256: candidate.sha256,
      startByte: 0,
      endByte: candidate.byteLength,
      candidateSliceSha256: rawSha(candidate.body),
    },
    source: {
      coordinateKind: "utf8-byte",
      sourceId: `source-${candidate.id}`,
      sourceSha256: sealedSha(`source-${candidate.id}`),
      startByte: 0,
      endByte: 32_768,
      sliceSha256: sealedSha(`source-slice-${candidate.id}`),
    },
  };
  const selectorSha256 = rawSha(JSON.stringify(selectorBody));
  const matches = withMatch ? [{
    matchId: `fsm-${selectorSha256.slice(0, 24)}`,
    selectorSha256,
    ...selectorBody,
    classification: "pending",
  }] : [];
  const upstreamScanSha256 = sealedSha(`upstream-${candidate.id}`);
  const unsigned = {
    schemaVersion: "firefly-blind-pair-surface-scan/v1",
    candidateId: candidate.id,
    candidateSha256: candidate.sha256,
    candidateByteLength: candidate.byteLength,
    scanner: { version: "genre-soul-surface-scanner/v1", exactTokenCount: 12, exactByteLength: 120 },
    corpus: {
      privateRegistrySha256: sealedSha("registry"), availableSourceCount: 2,
      observedSourceSetSha256: sealedSha("observed"), surfaceIndexSha256: sealedSha("surface-index"),
    },
    upstreamScanSha256,
    status: matches.length === 0 ? "completed-no-match" : "completed-with-matches",
    matchCount: matches.length,
    matches,
    truncated: false,
    automaticRewriteApplied: false,
    automaticRejectApplied: false,
    humanDecision: "pending",
  };
  return { receipt: { ...unsigned, receiptSelfHash: hashBlindEvaluationArtifact(unsigned) }, upstreamScanSha256 };
}

function evaluatorInput(input, candidates) {
  return {
    schemaVersion: "private-firefly-blind-pair-evaluator-input/v2",
    genre: input.genre,
    pairId: input.pairId,
    round: input.round,
    blindRunId: input.blindRunId,
    pairedGenerationReceiptSha256: input.pairedGenerationReceiptSha256,
    reviewerRuntime: { configSha256: input.reviewer.configSha256, soulSha256: input.reviewer.soulSha256 },
    commonContext: input.commonContext,
    contentContract: input.contentContract,
    candidates,
    authority: BLIND_PAIR_AUTHORITY,
  };
}

function buildReceipt(input, result, candidateContexts, surfaceScans) {
  const evaluatorInputBytes = jsonBytes(evaluatorInput(input, candidateContexts));
  const evaluatorResultBytes = jsonBytes(result);
  const evaluatorInputSha256 = rawSha(evaluatorInputBytes);
  const hostReceipt = {
    role: "blind-pair-commercial-evaluator", runId: "reviewer-run-01", profileId: input.reviewer.profileId,
    profileConfigSha256: input.reviewer.configSha256, soulSha256: input.reviewer.soulSha256,
    provider: "openai-codex", model: "gpt-6-astra", reasoningEffort: input.reviewer.reasoning,
    inputDigest: hashBlindEvaluationArtifact(input),
    inputSha256: rawSha(jsonBytes([{ path: "/sealed/evaluator-input.json", sha256: evaluatorInputSha256 }])),
    expectedReadCount: 1, exactReadCount: 1, exactReadSha256s: [evaluatorInputSha256],
    resultSha256: rawSha(evaluatorResultBytes), completedAt: generatedAt,
  };
  return buildBlindReviewReceiptFromRawEvidence({
    input, result, candidateContexts, evaluatorInputBytes, evaluatorResultBytes,
    hostReceiptBytes: jsonBytes(hostReceipt), surfaceScans,
  });
}

function envelope(input, result, reviewReceipt, transfer) {
  const currentContent = "현재 InkOS 정본 원고";
  const contentNeutralReceiptSha256s = ["candidate-A", "candidate-B"].map((id) => canonicalSha({
    schemaVersion: "firefly-content-neutral-evaluation/v1",
    candidateId: id,
    candidateSha256: result.evaluations[id].candidateSha256,
    contentNeutrality: result.evaluations[id].contentNeutrality,
  })).sort();
  return {
    generatedAt,
    source: { system: "inkos", bookId: "book-01", sourceRevision: "revision-01" },
    work: { id: "book-01", title: "블라인드 작품", genre: input.genre, status: "active", targetChapters: 200 },
    artifact: {
      id: "chapter-0001", kind: "chapter", chapterNumber: 1, title: "첫 화", status: "ready-for-review",
      currentContent, currentContentSha256: rawSha(currentContent),
    },
    comparison: {
      reviewKind: "independent-blind-comparison", pairId: input.pairId, round: input.round,
      blindRunId: input.blindRunId, blindSessionId: input.blindSessionId,
      commonInputReceiptSha256: input.commonInputReceiptSha256,
      pairedGenerationReceiptSha256: input.pairedGenerationReceiptSha256,
      labelAssignmentReceiptSha256: input.labelAssignmentReceiptSha256,
      runtimeReceiptSha256: reviewReceipt.evaluatorBinding.evaluatorResultSha256,
      canaryIsolation: structuredClone(transfer.canaryIsolation),
      candidateLabelsShuffled: true,
      generatorMetadataExcluded: true,
      runtime: { kernel: "enforce", piWorker: "off", retrieval: "legacy", fts: "off", model: "gpt-6-astra", reasoning: "medium" },
    },
    candidatePreparedAt: { "candidate-A": transfer.generatedAt, "candidate-B": transfer.generatedAt },
    sealedGenerationEvidence: {
      candidateEvidenceReceiptSha256s: [sealedSha("candidate-a"), sealedSha("candidate-b")].sort(),
      contentNeutralReceiptSha256s,
    },
  };
}

function buildProjection(overrides = {}) {
  const { input, result, candidateContexts, transfer } = fixture();
  const surfaceScans = [surface(candidateContexts[0], true), surface(candidateContexts[1], false)];
  const reviewReceipt = buildReceipt(input, result, candidateContexts, surfaceScans);
  const projectionEnvelope = envelope(input, result, reviewReceipt, transfer);
  return {
    input, result, candidateContexts, transfer, surfaceScans, reviewReceipt, envelope: projectionEnvelope,
    packet: buildStoryyardV2EvaluationProjection({
      transfer, input, result, candidateContexts, reviewReceipt, surfaceScans, envelope: projectionEnvelope, ...overrides,
    }),
  };
}

test("projects a complete RefLab result into the exact Storyyard v2 evaluation-only packet identity", () => {
  const { input, result, reviewReceipt, packet } = buildProjection();
  assert.equal(assertStoryyardV2EvaluationPacketIdentity(packet), true);
  assert.deepEqual(Object.keys(packet), [
    "schemaVersion", "packetId", "packetSha256", "generatedAt", "purpose", "source", "work", "artifact",
    "comparison", "candidates", "sealedGenerationEvidence", "recommendation", "actions", "authority",
  ]);
  assert.deepEqual(Object.keys(packet.candidates[0]), [
    "id", "kind", "evaluationBindingSha256", "canaryIsolation", "status", "body", "sha256", "preparedAt",
    "commercialScore", "commercialEvaluation", "commercialEvaluationReceiptSha256", "review",
  ]);
  assert.deepEqual(Object.keys(packet.comparison), [
    "reviewKind", "pairId", "round", "blindRunId", "blindSessionId", "commonInputReceiptSha256",
    "pairedGenerationReceiptSha256", "labelAssignmentReceiptSha256", "runtimeReceiptSha256", "canaryIsolation",
    "candidateLabelsShuffled", "generatorMetadataExcluded", "runtime",
  ]);
  assert.deepEqual(Object.keys(packet.candidates[0].review), [
    "status", "retained", "variedSurface", "linkedConsequences", "emotionalCoherence", "contentNeutrality",
    "canonContradictions", "surfaceComparison",
  ]);
  assert.deepEqual(Object.keys(packet.candidates[0].review.surfaceComparison), [
    "schemaVersion", "soulId", "soulVersion", "surfaceIndexSha256", "surfaceMatches",
    "similarityPenaltyApplied", "automaticRewriteApplied", "automaticRejectApplied", "humanDecision",
  ]);
  assert.deepEqual(Object.keys(packet.candidates[0].review.surfaceComparison.surfaceMatches[0]), [
    "matchId", "selectorSha256", "provenanceBridgeReceiptSha256", "matchMethod", "candidate", "source", "classification",
  ]);
  assert.deepEqual(Object.keys(packet.sealedGenerationEvidence), [
    "candidateEvidenceReceiptSha256s", "contentNeutralReceiptSha256s",
  ]);
  assert.equal(packet.purpose, "promotion-evaluation");
  assert.equal(packet.recommendation, null);
  assert.deepEqual(packet.actions, ["select", "tie", "invalid"]);
  assert.deepEqual(packet.authority, {
    canon: "inkos", decisionSurface: "storyyard", decisionEffect: "advisory", manuscriptApply: false, reverseSync: false,
  });
  assert.equal(packet.comparison.pairId, input.pairId);
  assert.equal(packet.comparison.blindRunId, input.blindRunId);
  assert.deepEqual(packet.candidates.map((candidate) => candidate.id), ["candidate-A", "candidate-B"]);
  assert.equal(packet.candidates[0].evaluationBindingSha256, reviewReceipt.candidateBindings["candidate-A"].evaluationBindingSha256);
  assert.equal(packet.candidates[0].commercialEvaluationReceiptSha256, reviewReceipt.evaluatorBinding.evaluatorResultSha256);
  assert.equal(packet.comparison.runtimeReceiptSha256, reviewReceipt.evaluatorBinding.evaluatorResultSha256);
  assert.equal(
    packet.candidates[1].review.surfaceComparison.surfaceIndexSha256,
    packet.candidates[0].review.surfaceComparison.surfaceIndexSha256,
  );
  assert.deepEqual(packet.candidates[0].review.emotionalCoherence, result.evaluations["candidate-A"].emotionalCoherence);
  assert.equal(packet.candidates[0].review.surfaceComparison.surfaceMatches[0].source.endByte, 32_768);
  assert.equal(JSON.stringify(packet).includes("canonLeaks"), false);

  const { schemaVersion: _schema, packetId: _id, packetSha256: _sha, ...identityBody } = packet;
  assert.equal(packet.packetSha256, rawSha(JSON.stringify(identityBody)));
  assert.equal(packet.packetId, `frp-${packet.packetSha256.slice(0, 24)}`);
});

test("fails closed on Storyyard runtime, content-neutral, transfer, genre, and UTC drift", () => {
  const state = buildProjection();
  const rebuild = (projectionEnvelope, transfer = state.transfer) => buildStoryyardV2EvaluationProjection({
    transfer,
    input: state.input,
    result: state.result,
    candidateContexts: state.candidateContexts,
    reviewReceipt: state.reviewReceipt,
    surfaceScans: state.surfaceScans,
    envelope: projectionEnvelope,
  });

  const runtimeDrift = structuredClone(state.envelope);
  runtimeDrift.comparison.runtimeReceiptSha256 = sealedSha("wrong-runtime-receipt");
  assert.throws(() => rebuild(runtimeDrift), /exact evaluator result SHA-256/u);

  const modelDrift = structuredClone(state.envelope);
  modelDrift.comparison.runtime.model = "gpt-5.6-sol";
  assert.throws(() => rebuild(modelDrift), /locked evaluation baseline/u);

  const reasoningDrift = structuredClone(state.envelope);
  reasoningDrift.comparison.runtime.reasoning = "high";
  assert.throws(() => rebuild(reasoningDrift), /locked evaluation baseline/u);

  const neutralityDrift = structuredClone(state.envelope);
  neutralityDrift.sealedGenerationEvidence.contentNeutralReceiptSha256s = [
    sealedSha("wrong-neutral-a"), sealedSha("wrong-neutral-b"),
  ].sort();
  assert.throws(() => rebuild(neutralityDrift), /content-neutral receipts drifted/u);

  const canaryDrift = structuredClone(state.envelope);
  canaryDrift.comparison.canaryIsolation.receiptSha256 = sealedSha("wrong-canary");
  assert.throws(() => rebuild(canaryDrift), /canary isolation/u);

  const genreDrift = structuredClone(state.envelope);
  genreDrift.work.genre = "fantasy-ko";
  assert.throws(() => rebuild(genreDrift), /work.genre drifted/u);

  const timeDrift = structuredClone(state.envelope);
  timeDrift.generatedAt = "2026-09-02T06:00:00+00:00";
  assert.throws(() => rebuild(timeDrift), /UTC-Z/u);

  const transferDrift = structuredClone(state.transfer);
  transferDrift.candidates[0].body += " 변조";
  assert.throws(() => rebuild(state.envelope, transferDrift), /body\/sha256\/byteLength binding drifted/u);
});

test("requires both candidates to use the same exact public surface corpus", () => {
  const { input, result, candidateContexts, transfer } = fixture();
  const surfaceScans = [surface(candidateContexts[0], false), surface(candidateContexts[1], false)];
  const secondUnsigned = { ...surfaceScans[1].receipt };
  delete secondUnsigned.receiptSelfHash;
  secondUnsigned.corpus = { ...secondUnsigned.corpus, surfaceIndexSha256: sealedSha("other-surface-index") };
  surfaceScans[1].receipt = {
    ...secondUnsigned,
    receiptSelfHash: hashBlindEvaluationArtifact(secondUnsigned),
  };
  const reviewReceipt = buildReceipt(input, result, candidateContexts, surfaceScans);
  assert.throws(() => buildStoryyardV2EvaluationProjection({
    transfer,
    input,
    result,
    candidateContexts,
    reviewReceipt,
    surfaceScans,
    envelope: envelope(input, result, reviewReceipt, transfer),
  }), /same public surface corpus/u);
});

test("blocks Storyyard materialization on any typed canon leak instead of dropping it", () => {
  const { input, result, candidateContexts, transfer } = fixture();
  result.evaluations["candidate-A"].canonLeaks = [{
    code: "canon-leak", evidence: [candidateContexts[0].evidenceSpans[0]],
  }];
  const surfaceScans = [surface(candidateContexts[0], false), surface(candidateContexts[1], false)];
  const reviewReceipt = buildReceipt(input, result, candidateContexts, surfaceScans);
  assert.equal(reviewReceipt.outcome.canonLeakCount, 1);
  assert.throws(() => buildStoryyardV2EvaluationProjection({
    transfer, input, result, candidateContexts, reviewReceipt, surfaceScans,
    envelope: envelope(input, result, reviewReceipt, transfer),
  }), /canonLeakPolicy=block-on-nonzero/u);
});

test("detects Storyyard packet identity tampering", () => {
  const { packet } = buildProjection();
  packet.candidates[0].commercialScore = 1;
  assert.throws(() => assertStoryyardV2EvaluationPacketIdentity(packet), /identity or SHA-256 mismatch/u);
});
