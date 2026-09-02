import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { symlinkSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import {
  BLIND_PAIR_AUTHORITY,
  hashBlindEvaluationArtifact,
  scoreBlindCommercialEvaluation,
} from "../tools/blind-pair-evaluation-contract.mjs";
import {
  FICTION_CONTENT_CONTRACT_ID,
  FICTION_CONTENT_CONTRACT_SHA256,
} from "../tools/genre-soul-hermes-run-lib.mjs";
import {
  buildBlindPairEvaluatorPrompt,
  runBlindPairEvaluation,
} from "../tools/blind-pair-evaluation-runner.mjs";

const REPOSITORY_ROOT = resolve(new URL("..", import.meta.url).pathname);
const rawSha = (value) => createHash("sha256").update(value).digest("hex");
const sealedSha = (value) => hashBlindEvaluationArtifact({ value });
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");

function commercialEvaluation(score) {
  return {
    openingPressure: score,
    protagonistAgency: score,
    resistanceQuality: score,
    visiblePayoff: score,
    endingPropulsion: score,
    referenceEngineRetention: score,
    transformationIntegrity: score,
    styleFidelity: score,
  };
}

function genreIdentity() {
  return {
    worldConstraintEvidence: ["세계 제약이 행동을 제한한다."],
    repeatableVerbEvidence: ["주인공이 반복 가능한 선택을 실행한다."],
    oppositionFormEvidence: ["유능한 상대가 같은 목표를 다르게 막는다."],
    rewardStatusCurrencyEvidence: ["보상과 지위 변화가 눈에 보인다."],
    nextEpisodeActionEvidence: ["다음 회차에 실행할 행동이 남는다."],
    pass: true,
  };
}

function evaluatorResult(input) {
  const a = commercialEvaluation(87);
  const b = commercialEvaluation(92);
  return {
    schemaVersion: "firefly-blind-pair-evaluator-result/v1",
    pairId: input.pairId,
    round: input.round,
    blindRunId: input.blindRunId,
    pairedGenerationReceiptSha256: input.pairedGenerationReceiptSha256,
    winner: "candidate-B",
    rankingReason: "후보 B가 가시적 지급과 다음 행동 약속에서 더 강하게 작동한다.",
    evaluations: {
      "candidate-A": {
        commercialEvaluation: a,
        commercialScore: scoreBlindCommercialEvaluation(a),
        emotionalCoherenceNote: "압박 뒤 선택과 감정 반응이 이어진다.",
        contentNeutrality: { passed: true, violations: [] },
        genreIdentity: genreIdentity(),
      },
      "candidate-B": {
        commercialEvaluation: b,
        commercialScore: scoreBlindCommercialEvaluation(b),
        emotionalCoherenceNote: "선택 뒤 보상과 다음 행동이 선명하게 이어진다.",
        contentNeutrality: { passed: true, violations: [] },
        genreIdentity: genreIdentity(),
      },
    },
    hardContradictions: [],
    canonLeaks: [],
    humanDecision: "pending",
    authority: BLIND_PAIR_AUTHORITY,
  };
}

async function fixture(t, { pairId = "modern-pair-01" } = {}) {
  const root = await mkdtemp(join(tmpdir(), "blind-pair-runner-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bodies = [
    "후보 A는 첫 압박을 견디고 계약서를 뒤집었다.",
    "후보 B는 첫 압박 직후 자산을 확보하고 다음 거래를 선언했다.",
  ];
  const packet = {
    schemaVersion: "private-test-review-packet/v1",
    producerEvidence: {
      lane: "genre-soul",
      labelMap: { "candidate-A": "neutral", "candidate-B": "soul" },
    },
    candidates: bodies.map((body, index) => ({
      id: `candidate-${index === 0 ? "A" : "B"}`,
      body,
      sha256: rawSha(body),
      hiddenLane: index === 0 ? "neutral" : "soul",
    })),
  };
  const reviewPacketBytes = jsonBytes(packet);
  const reviewPacketRelativePath = `exports/incoming/${pairId}.json`;
  const reviewPacketPath = join(root, reviewPacketRelativePath);
  await mkdir(dirname(reviewPacketPath), { recursive: true });
  await writeFile(reviewPacketPath, reviewPacketBytes);
  const input = {
    schemaVersion: "firefly-blind-pair-evaluation-input/v1",
    genre: "modern-fantasy-ko",
    pairId,
    round: 1,
    blindRunId: `blind-run-${pairId}`,
    blindSessionId: `blind-session-${pairId}`,
    reviewPacket: {
      path: reviewPacketRelativePath,
      sha256: rawSha(reviewPacketBytes),
      byteLength: reviewPacketBytes.byteLength,
    },
    commonInputReceiptSha256: sealedSha(`common-${pairId}`),
    pairedGenerationReceiptSha256: sealedSha(`generation-${pairId}`),
    labelAssignmentReceiptSha256: sealedSha(`labels-${pairId}`),
    candidates: bodies.map((body, index) => ({
      id: `candidate-${index === 0 ? "A" : "B"}`,
      sha256: rawSha(body),
      byteLength: Buffer.byteLength(body),
    })),
    producerActors: [
      { lane: "neutral", actorId: "producer-neutral-01", profileId: "inkos_neutral_baseline", terminalReceiptSha256: sealedSha("neutral-terminal") },
      { lane: "soul", actorId: "producer-soul-01", profileId: "inkos_male_modern_fantasy", terminalReceiptSha256: sealedSha("soul-terminal") },
    ],
    reviewer: {
      actorId: "reviewer-blind-01",
      profileId: "inkos_blind_evaluator",
      provider: "openai-codex",
      model: "gpt-5.6-sol",
      reasoning: "high",
    },
    contentContract: {
      id: FICTION_CONTENT_CONTRACT_ID,
      sha256: FICTION_CONTENT_CONTRACT_SHA256,
      intensityDirectiveSha256: sealedSha("preserve"),
    },
    authority: BLIND_PAIR_AUTHORITY,
  };
  return { root, input, bodies };
}

function stubExecutor(input, observations = {}) {
  return async (options) => {
    observations.options = options;
    assert.equal(options.role, "blind-pair-commercial-evaluator");
    assert.equal(options.profileId, input.reviewer.profileId);
    assert.equal(options.expectedReadPaths.length, 1);
    const evaluatorInputBytes = await readFile(options.expectedReadPaths[0]);
    const evaluatorInput = JSON.parse(evaluatorInputBytes.toString("utf8"));
    observations.evaluatorInput = evaluatorInput;
    assert.deepEqual(evaluatorInput.candidates.map((candidate) => candidate.id), ["candidate-A", "candidate-B"]);
    assert.equal("producerActors" in evaluatorInput, false);
    assert.equal("producerEvidence" in evaluatorInput, false);
    assert.doesNotMatch(JSON.stringify(evaluatorInput), /producer-neutral|producer-soul|inkos_neutral_baseline|inkos_male_modern_fantasy/u);
    assert.doesNotMatch(options.prompt, /producer-neutral|producer-soul|inkos_neutral_baseline|inkos_male_modern_fantasy|genre-soul/u);
    const result = evaluatorResult(input);
    assert.equal(await options.validateResult(result), true);
    const evaluatorSha = rawSha(evaluatorInputBytes);
    return {
      status: "completed",
      result,
      receipt: {
        role: options.role,
        runId: `review-run-${input.pairId}`,
        profileId: options.profileId,
        model: "gpt-5.6-sol",
        provider: "openai-codex",
        reasoningEffort: "high",
        inputDigest: options.inputDigest,
        inputSha256: rawSha(jsonBytes([{ path: options.expectedReadPaths[0], sha256: evaluatorSha }])),
        resultSha256: hashBlindEvaluationArtifact(result),
        expectedReadCount: 1,
        exactReadCount: 1,
        exactReadSha256s: [evaluatorSha],
        completedAt: "2026-09-02T03:00:00.000Z",
      },
    };
  };
}

test("runs an actor/profile-distinct exact-read review and publishes one bodyless receipt", async (t) => {
  const { root, input, bodies } = await fixture(t);
  const observations = {};
  const options = {
    input,
    testOnly: true,
    testOnlyRepositoryRoot: root,
    testOnlyExecutor: stubExecutor(input, observations),
    testOnlyProfileHome: join(root, "profiles", input.reviewer.profileId),
  };
  const first = await runBlindPairEvaluation(options);
  const second = await runBlindPairEvaluation(options);

  assert.equal(first.status, "written");
  assert.equal(second.status, "reused");
  assert.equal(first.receipt.outcome.winner, "candidate-B");
  assert.equal(first.receipt.outcome.humanDecision, "pending");
  assert.equal(first.receipt.authority.mayWriteInkOSCanon, false);
  assert.equal(first.receipt.authority.mayPromoteSoul, false);
  assert.equal(first.receiptPath, "analyses/genre_souls/male-modern-fantasy-ko/v1/blind-reviews/modern-pair-01.json");
  const exactInput = JSON.parse(await readFile(join(root, first.evaluatorInputPath), "utf8"));
  assert.deepEqual(exactInput.candidates.map((candidate) => Object.keys(candidate).sort()), [
    ["body", "byteLength", "id", "sha256"],
    ["body", "byteLength", "id", "sha256"],
  ]);
  assert.equal(JSON.stringify(exactInput).includes("labelMap"), false);
  assert.equal(JSON.stringify(exactInput).includes("hiddenLane"), false);
  const privateHost = JSON.parse(await readFile(join(root, first.privateInputPath), "utf8"));
  assert.equal(privateHost.schemaVersion, "private-firefly-blind-pair-host-input/v1");
  assert.deepEqual(privateHost.sealedInput.producerActors, input.producerActors);
  const trackedBytes = await readFile(join(root, first.receiptPath));
  const tracked = JSON.parse(trackedBytes.toString("utf8"));
  assert.equal("rankingReason" in tracked, false);
  assert.equal("candidates" in tracked, false);
  assert.equal("producerActors" in tracked, false);
  for (const body of bodies) assert.equal(trackedBytes.includes(Buffer.from(body)), false);
  assert.deepEqual(observations.options.expectedReadPaths, [join(root, first.evaluatorInputPath)]);
  assert.notEqual(observations.options.expectedReadPaths[0], join(root, first.privateInputPath));
});

test("rejects reviewer profile collapse and every production-shaped executor injection", async (t) => {
  const { root, input } = await fixture(t, { pairId: "boundary-pair-01" });
  const executor = stubExecutor(input);
  await assert.rejects(
    runBlindPairEvaluation({ input, testOnlyExecutor: executor }),
    /requires testOnly=true/u,
  );
  await assert.rejects(
    runBlindPairEvaluation({ input, testOnly: true, testOnlyExecutor: executor }),
    /explicit testOnlyRepositoryRoot/u,
  );
  await assert.rejects(
    runBlindPairEvaluation({ input, executor }),
    /production executor is not injectable/u,
  );
  await assert.rejects(
    runBlindPairEvaluation({
      input,
      testOnly: true,
      testOnlyRepositoryRoot: REPOSITORY_ROOT,
      testOnlyExecutor: executor,
    }),
    /outside the canonical Reference Lab root/u,
  );
  const collapsed = structuredClone(input);
  collapsed.reviewer.profileId = collapsed.producerActors[0].profileId;
  await assert.rejects(
    runBlindPairEvaluation({
      input: collapsed,
      testOnly: true,
      testOnlyRepositoryRoot: root,
      testOnlyExecutor: stubExecutor(collapsed),
    }),
    /profile must be distinct/u,
  );
});

test("rejects a symlink test root, packet drift, and candidate-body drift before execution", async (t) => {
  const { root, input } = await fixture(t, { pairId: "drift-pair-01" });
  const alias = `${root}-alias`;
  symlinkSync(root, alias);
  t.after(() => rm(alias, { force: true }));
  await assert.rejects(
    runBlindPairEvaluation({
      input,
      testOnly: true,
      testOnlyRepositoryRoot: alias,
      testOnlyExecutor: stubExecutor(input),
    }),
    /physical non-symlink/u,
  );

  const packetDrift = structuredClone(input);
  packetDrift.reviewPacket.sha256 = "0".repeat(64);
  await assert.rejects(
    runBlindPairEvaluation({
      input: packetDrift,
      testOnly: true,
      testOnlyRepositoryRoot: root,
      testOnlyExecutor: stubExecutor(packetDrift),
    }),
    /artifact binding drifted/u,
  );

  const bodyDrift = structuredClone(input);
  bodyDrift.candidates[0].sha256 = sealedSha("wrong-body");
  await assert.rejects(
    runBlindPairEvaluation({
      input: bodyDrift,
      testOnly: true,
      testOnlyRepositoryRoot: root,
      testOnlyExecutor: stubExecutor(bodyDrift),
    }),
    /body binding drifted/u,
  );
});

test("refuses to overwrite a conflicting tracked blind receipt", async (t) => {
  const { root, input } = await fixture(t, { pairId: "occupied-pair-01" });
  const occupied = join(root, "analyses/genre_souls/male-modern-fantasy-ko/v1/blind-reviews/occupied-pair-01.json");
  await mkdir(dirname(occupied), { recursive: true });
  await writeFile(occupied, "{\"occupied\":true}\n");
  await assert.rejects(
    runBlindPairEvaluation({
      input,
      testOnly: true,
      testOnlyRepositoryRoot: root,
      testOnlyExecutor: stubExecutor(input),
    }),
    /already exists with different bytes/u,
  );
  assert.equal(await readFile(occupied, "utf8"), "{\"occupied\":true}\n");
});

test("prompt exposes only the two opaque candidate labels and keeps human authority pending", () => {
  const projected = {
    schemaVersion: "private-firefly-blind-pair-evaluator-input/v1",
    genre: "murim-ko",
    pairId: "murim-pair-01",
    round: 2,
    blindRunId: "blind-run-murim-01",
    pairedGenerationReceiptSha256: "a".repeat(64),
  };
  const prompt = buildBlindPairEvaluatorPrompt(projected);
  assert.match(prompt, /candidate-A/);
  assert.match(prompt, /candidate-B/);
  assert.match(prompt, /humanDecision.*pending/su);
  assert.doesNotMatch(prompt, /producer|genre-soul|labelMap|hiddenLane|"lane"/u);
});
