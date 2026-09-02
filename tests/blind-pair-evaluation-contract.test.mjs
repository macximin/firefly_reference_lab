import assert from "node:assert/strict";
import test from "node:test";

import {
  BLIND_PAIR_AUTHORITY,
  buildBlindReviewReceipt,
  hashBlindEvaluationArtifact,
  scoreBlindCommercialEvaluation,
  validateBlindPairEvaluationInput,
  validateBlindPairEvaluationResult,
} from "../tools/blind-pair-evaluation-contract.mjs";

const sha = (value) => hashBlindEvaluationArtifact({ value });
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
const genreIdentity = (pass = true) => ({
  worldConstraintEvidence: pass ? ["세계 제약 근거"] : [],
  repeatableVerbEvidence: pass ? ["주인공 반복 동사 근거"] : [],
  oppositionFormEvidence: pass ? ["대립 형식 근거"] : [],
  rewardStatusCurrencyEvidence: pass ? ["보상·지위 화폐 근거"] : [],
  nextEpisodeActionEvidence: pass ? ["다음 회차 행동 근거"] : [],
  pass,
});

function input() {
  return {
    schemaVersion: "firefly-blind-pair-evaluation-input/v1",
    genre: "modern-fantasy-ko",
    pairId: "modern-pair-01",
    round: 1,
    blindRunId: "blind-run-01",
    blindSessionId: "blind-session-01",
    reviewPacket: { path: "exports/pair-01/packet.json", sha256: sha("packet"), byteLength: 500 },
    commonInputReceiptSha256: sha("common"),
    pairedGenerationReceiptSha256: sha("generation"),
    labelAssignmentReceiptSha256: sha("labels"),
    candidates: [
      { id: "candidate-A", sha256: sha("a"), byteLength: 1_000 },
      { id: "candidate-B", sha256: sha("b"), byteLength: 1_100 },
    ],
    producerActors: [
      { lane: "neutral", actorId: "producer-neutral-01", profileId: "inkos_neutral_baseline", terminalReceiptSha256: sha("neutral-terminal") },
      { lane: "soul", actorId: "producer-soul-01", profileId: "inkos_male_modern_fantasy", terminalReceiptSha256: sha("soul-terminal") },
    ],
    reviewer: {
      actorId: "reviewer-01", profileId: "inkos_blind_evaluator", provider: "openai-codex", model: "gpt-5.6-sol", reasoning: "high",
    },
    contentContract: { id: "fiction-content-neutral-ko/v1", sha256: sha("content"), intensityDirectiveSha256: sha("intensity") },
    authority: BLIND_PAIR_AUTHORITY,
  };
}

function result(selections = {}) {
  const a = evaluation(88);
  const b = evaluation(92);
  return {
    schemaVersion: "firefly-blind-pair-evaluator-result/v1",
    pairId: "modern-pair-01",
    round: 1,
    blindRunId: "blind-run-01",
    pairedGenerationReceiptSha256: sha("generation"),
    winner: selections.winner ?? "candidate-B",
    rankingReason: "두 후보의 상업 작동과 장르 정체성을 같은 기준으로 비교했다.",
    evaluations: {
      "candidate-A": {
        commercialEvaluation: a,
        commercialScore: scoreBlindCommercialEvaluation(a),
        emotionalCoherenceNote: "압박과 선택의 감정 인과가 이어진다.",
        contentNeutrality: { passed: true, violations: [] },
        genreIdentity: genreIdentity(true),
      },
      "candidate-B": {
        commercialEvaluation: b,
        commercialScore: scoreBlindCommercialEvaluation(b),
        emotionalCoherenceNote: "선택 뒤 보상과 다음 행동 약속이 분명하다.",
        contentNeutrality: { passed: true, violations: [] },
        genreIdentity: genreIdentity(true),
      },
    },
    hardContradictions: [],
    canonLeaks: [],
    humanDecision: "pending",
    authority: BLIND_PAIR_AUTHORITY,
  };
}

test("validates one sealed actor-distinct blind pair and builds a bodyless receipt", () => {
  const sealedInput = input();
  const evaluatorResult = result();
  assert.equal(validateBlindPairEvaluationInput(sealedInput), true);
  assert.equal(validateBlindPairEvaluationResult(evaluatorResult, sealedInput), true);
  const receipt = buildBlindReviewReceipt({
    input: sealedInput,
    result: evaluatorResult,
    hermes: {
      runId: "review-run-01",
      profileId: "inkos_blind_evaluator",
      model: "gpt-5.6-sol",
      reasoning: "high",
      inputSha256: hashBlindEvaluationArtifact(sealedInput),
      resultSha256: hashBlindEvaluationArtifact(evaluatorResult),
      hostReceiptSha256: sha("host"),
    },
    createdAt: "2026-09-02T00:00:00.000Z",
  });
  assert.equal(receipt.schemaVersion, "firefly-blind-review-receipt/v1");
  assert.equal(receipt.outcome.winner, "candidate-B");
  assert.equal(receipt.outcome.humanDecision, "pending");
  assert.equal(receipt.reviewer.actorDistinctFromProducers, true);
  assert.equal(receipt.receiptSelfHash, hashBlindEvaluationArtifact(Object.fromEntries(
    Object.entries(receipt).filter(([key]) => key !== "receiptSelfHash"),
  )));
  assert.equal(JSON.stringify(receipt).includes("rankingReason"), false);
});

test("fails closed on producer/reviewer collapse, mapping-shaped labels, score drift, and extra keys", () => {
  const collapsed = input();
  collapsed.reviewer.actorId = collapsed.producerActors[0].actorId;
  assert.throws(() => validateBlindPairEvaluationInput(collapsed), /actor-distinct/u);

  const mapped = input();
  mapped.candidates[0].id = "soul";
  assert.throws(() => validateBlindPairEvaluationInput(mapped), /candidate-A then candidate-B/u);

  const drifted = result();
  drifted.evaluations["candidate-A"].commercialScore = 1;
  assert.throws(() => validateBlindPairEvaluationResult(drifted, input()), /does not match/u);

  const extra = result();
  extra.generatedBy = "producer";
  assert.throws(() => validateBlindPairEvaluationResult(extra, input()), /keys must be exactly/u);
});

test("content-neutrality and genre identity flags must match their evidence", () => {
  const neutralityDrift = result();
  neutralityDrift.evaluations["candidate-A"].contentNeutrality = {
    passed: true,
    violations: [{ code: "moral-lecture", evidence: "서사 밖 훈계가 삽입됐다." }],
  };
  assert.throws(() => validateBlindPairEvaluationResult(neutralityDrift, input()), /contradicts/u);

  const identityDrift = result();
  identityDrift.evaluations["candidate-B"].genreIdentity.worldConstraintEvidence = [];
  assert.throws(() => validateBlindPairEvaluationResult(identityDrift, input()), /contradicts/u);
});
