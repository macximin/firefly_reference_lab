import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { symlinkSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import {
  BLIND_PAIR_AUTHORITY,
  INKOS_BLIND_EVALUATOR_CONFIG_SHA256,
  INKOS_BLIND_EVALUATOR_SOUL_SHA256,
  LEGACY_INKOS_BLIND_EVALUATOR_CONFIG_SHA256,
  LEGACY_INKOS_BLIND_EVALUATOR_SOUL_SHA256,
  hashBlindEvaluationArtifact,
  scoreBlindCommercialEvaluation,
} from "../tools/blind-pair-evaluation-contract.mjs";
import {
  buildBlindPairEvaluatorPrompt,
  buildBlindSurfaceScanReceipt,
  runBlindPairEvaluation,
} from "../tools/blind-pair-evaluation-runner.mjs";
import {
  FICTION_CONTENT_CONTRACT_ID,
  FICTION_CONTENT_CONTRACT_SHA256,
} from "../tools/genre-soul-hermes-run-lib.mjs";
import { buildGenreSoulSourceRegistry } from "../tools/genre-soul-source-registry.mjs";

const REPOSITORY_ROOT = resolve(new URL("..", import.meta.url).pathname);
const rawSha = (value) => createHash("sha256").update(value).digest("hex");
const sealedSha = (value) => hashBlindEvaluationArtifact({ value });
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const opaqueId = (prefix, value) => `${prefix}-${rawSha(value).slice(0, 24)}`;
const EXACT_TWELVE = "하나 둘 셋 넷 다섯 여섯 일곱 여덟 아홉 열 열하나 열둘";
const REVIEWER_CONFIG_SHA256 = INKOS_BLIND_EVALUATOR_CONFIG_SHA256;
const REVIEWER_SOUL_SHA256 = INKOS_BLIND_EVALUATOR_SOUL_SHA256;
const COMMON_CONTEXT_TEXT = "공통 Book brief와 캐논, 현재 Arc·Rail은 두 후보에 동일하게 적용된다.";

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortJson(nested)]));
  }
  return value;
}

const inkosCanonicalSha = (value) => rawSha(JSON.stringify(sortJson(value)));

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

function genreIdentity(span) {
  return {
    worldConstraintEvidence: [span],
    repeatableVerbEvidence: [span],
    oppositionFormEvidence: [span],
    rewardStatusCurrencyEvidence: [span],
    nextEpisodeActionEvidence: [span],
    pass: true,
  };
}

function evaluatorResult(input, evaluatorInput) {
  const a = commercialEvaluation(87);
  const b = commercialEvaluation(92);
  const candidate = (index, commercial, emotionalScore) => {
    const sealed = evaluatorInput.candidates[index];
    const evidence = sealed.evidenceSpans[0];
    return {
      candidateSha256: sealed.sha256,
      commercialEvaluation: commercial,
      commercialScore: scoreBlindCommercialEvaluation(commercial),
      emotionalCoherence: { score: emotionalScore, evidence: [evidence] },
      contentNeutrality: { passed: true, violations: [] },
      canonContradictions: [],
      canonLeaks: [],
      genreIdentity: genreIdentity(evidence),
    };
  };
  return {
    schemaVersion: "firefly-blind-pair-evaluator-result/v2",
    pairId: input.pairId,
    round: input.round,
    blindRunId: input.blindRunId,
    pairedGenerationReceiptSha256: input.pairedGenerationReceiptSha256,
    winner: "candidate-B",
    rankingReason: "후보 B가 가시적 지급과 다음 행동 약속에서 더 강하게 작동한다.",
    evaluations: {
      "candidate-A": candidate(0, a, 84),
      "candidate-B": candidate(1, b, 91),
    },
    humanDecision: "pending",
    authority: BLIND_PAIR_AUTHORITY,
  };
}

async function buildSurfaceCorpus(root) {
  const sourceTitle = "참고작_필명_합본.txt";
  const sourceText = `ⓚ참고작 1화\n그 장면에는 ${EXACT_TWELVE} 순서가 그대로 있었다.\n`;
  const sourcePath = `private_sources/korean_webnovel_corpus/필명/${sourceTitle}`;
  const snapshotPath = join(root, "exports/source-registry/snapshot.json");
  await mkdir(dirname(snapshotPath), { recursive: true });
  await mkdir(dirname(join(root, sourcePath)), { recursive: true });
  await writeFile(join(root, sourcePath), sourceText);
  await writeFile(snapshotPath, `${JSON.stringify({
    schemaVersion: "drive-folder-metadata-snapshot/v1",
    capturedAt: "2026-09-02T00:00:00.000Z",
    source: { provider: "google-drive", rootFolderId: "root", rootTitle: "원고들_코퍼스", parentChain: [] },
    scope: {
      audience: "male-oriented",
      directFileCount: 1,
      excludedFolders: [{
        folderId: "female", title: "여성향", reason: "female-oriented-corpus-out-of-v1-scope", observedDirectFileCount: 1,
      }],
    },
    files: [{
      providerFileId: "source-one",
      title: sourceTitle,
      mimeType: "text/plain",
      sizeBytes: Buffer.byteLength(sourceText),
      modifiedAt: "2026-09-01T00:00:00.000Z",
    }],
  }, null, 2)}\n`);
  await buildGenreSoulSourceRegistry({
    repositoryRoot: root,
    snapshotPath,
    privateRegistryPath: join(root, "exports/source-registry/male-source-registry.v1.json"),
    inventoryPath: join(root, "evidence/genre-souls/male-source-inventory.v1.json"),
    receiptPath: join(root, "evidence/genre-souls/male-source-registry-receipt.v1.json"),
    expectedDirectFiles: 1,
    expectedExcludedFemaleFiles: 1,
  });
}

async function fixture(t, { pairId = "modern-pair-01" } = {}) {
  const root = await mkdtemp(join(tmpdir(), "blind-pair-runner-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await buildSurfaceCorpus(root);
  const bodies = [
    "후보 A는 첫 압박을 견디고 계약서를 뒤집었다.",
    `후보 B는 ${EXACT_TWELVE} 뒤 자산을 확보했다.`,
  ];
  const pairSeed = pairId;
  const opaquePairId = opaqueId("bp", `pair-${pairSeed}`);
  const opaqueBlindRunId = opaqueId("br", `run-${pairSeed}`);
  const opaqueBlindSessionId = opaqueId("br", `session-${pairSeed}`);
  const commonContext = {
    text: COMMON_CONTEXT_TEXT,
    sha256: rawSha(COMMON_CONTEXT_TEXT),
    byteLength: Buffer.byteLength(COMMON_CONTEXT_TEXT),
  };
  const commonInputReceiptSha256 = inkosCanonicalSha({
    schemaVersion: "inkos-blind-common-context/v1",
    commonContext,
  });
  const pairedGenerationReceiptSha256 = sealedSha(`generation-${pairId}`);
  const labelAssignmentReceiptSha256 = sealedSha(`labels-${pairId}`);
  const unsignedTransfer = {
    schemaVersion: "inkos-blind-pair-evaluation-transfer/v1",
    pairId: opaquePairId,
    round: 1,
    blindRunId: opaqueBlindRunId,
    blindSessionId: opaqueBlindSessionId,
    bookId: "book-01",
    chapterNumber: 1,
    commonContext,
    commonInputReceiptSha256,
    pairedGenerationReceiptSha256,
    labelAssignmentReceiptSha256,
    canaryIsolation: {
      receiptSha256: sealedSha("canary-receipt"),
      receiptSelfHash: sealedSha("canary-self"),
      isolationScopeSha256: sealedSha("canary-scope"),
      commonSnapshotSha256: sealedSha("canary-snapshot"),
    },
    candidates: bodies.map((body, index) => ({
      id: `candidate-${index === 0 ? "A" : "B"}`,
      body,
      sha256: rawSha(body),
      byteLength: Buffer.byteLength(body),
    })),
    generatedAt: "2026-09-02T02:00:00.000Z",
    authority: {
      scope: "evaluation-input",
      mayWriteInkOSCanon: false,
      mayRevealGeneratorIdentity: false,
      ownerDecisionRequired: true,
    },
  };
  const transfer = { ...unsignedTransfer, transferSelfHash: inkosCanonicalSha(unsignedTransfer) };
  const reviewPacketBytes = jsonBytes(transfer);
  const reviewPacketRelativePath = `exports/incoming/${opaquePairId}.json`;
  const reviewPacketPath = join(root, reviewPacketRelativePath);
  await mkdir(dirname(reviewPacketPath), { recursive: true });
  await writeFile(reviewPacketPath, reviewPacketBytes);
  const input = {
    schemaVersion: "firefly-blind-pair-evaluation-input/v2",
    genre: "modern-fantasy-ko",
    pairId: opaquePairId,
    round: 1,
    blindRunId: opaqueBlindRunId,
    blindSessionId: opaqueBlindSessionId,
    reviewPacket: {
      path: reviewPacketRelativePath,
      sha256: rawSha(reviewPacketBytes),
      byteLength: reviewPacketBytes.byteLength,
    },
    commonContext,
    commonInputReceiptSha256,
    pairedGenerationReceiptSha256,
    labelAssignmentReceiptSha256,
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
      model: "gpt-6-astra",
      reasoning: "medium",
      configSha256: REVIEWER_CONFIG_SHA256,
      soulSha256: REVIEWER_SOUL_SHA256,
    },
    contentContract: {
      id: FICTION_CONTENT_CONTRACT_ID,
      sha256: FICTION_CONTENT_CONTRACT_SHA256,
      intensityDirectiveSha256: sealedSha("preserve"),
    },
    authority: BLIND_PAIR_AUTHORITY,
  };
  return { root, input, bodies, pairSeed, transfer };
}

function stubExecutor(input, observations = {}, mutateResult = (value) => value, mutateReceipt = (value) => value) {
  return async (options) => {
    observations.options = options;
    assert.equal(options.role, "blind-pair-commercial-evaluator");
    assert.equal(options.profileId, input.reviewer.profileId);
    assert.deepEqual(options.expectedProfileRuntime, {
      model: input.reviewer.model,
      profileConfigSha256: input.reviewer.configSha256,
      soulSha256: input.reviewer.soulSha256,
    });
    assert.equal(options.expectedReadPaths.length, 1);
    const evaluatorInputBytes = await readFile(options.expectedReadPaths[0]);
    const evaluatorInput = JSON.parse(evaluatorInputBytes.toString("utf8"));
    observations.evaluatorInput = evaluatorInput;
    assert.deepEqual(evaluatorInput.candidates.map((candidate) => candidate.id), ["candidate-A", "candidate-B"]);
    assert.equal("producerActors" in evaluatorInput, false);
    assert.equal("producerEvidence" in evaluatorInput, false);
    assert.doesNotMatch(JSON.stringify(evaluatorInput), /producer-neutral|producer-soul|inkos_neutral_baseline|inkos_male_modern_fantasy/u);
    assert.doesNotMatch(options.prompt, /producer-neutral|producer-soul|inkos_neutral_baseline|inkos_male_modern_fantasy|genre-soul/u);
    const result = mutateResult(evaluatorResult(input, evaluatorInput));
    await options.validateResult(result);
    const evaluatorSha = rawSha(evaluatorInputBytes);
    const receipt = {
      role: options.role,
      runId: `review-run-${input.pairId}`,
      profileId: options.profileId,
      profileConfigSha256: input.reviewer.configSha256,
      soulSha256: input.reviewer.soulSha256,
      model: "gpt-6-astra",
      provider: "openai-codex",
      reasoningEffort: input.reviewer.reasoning,
      inputDigest: options.inputDigest,
      inputSha256: rawSha(jsonBytes([{ path: options.expectedReadPaths[0], sha256: evaluatorSha }])),
      resultSha256: hashBlindEvaluationArtifact(result),
      expectedReadCount: 1,
      exactReadCount: 1,
      exactReadSha256s: [evaluatorSha],
      completedAt: "2026-09-02T03:00:00.000Z",
    };
    return { status: "completed", result, receipt: mutateReceipt(receipt) };
  };
}

test("runs exact blind review, validates Korean spans, performs real surface scans, and publishes bodyless receipts", async (t) => {
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
  assert.equal(first.receipt.schemaVersion, "firefly-blind-review-receipt/v2");
  assert.equal(first.receipt.outcome.winner, "candidate-B");
  assert.equal(first.receipt.outcome.humanDecision, "pending");
  assert.equal(first.receipt.authority.mayWriteInkOSCanon, false);
  assert.equal(first.receipt.authority.mayPromoteSoul, false);
  assert.equal(first.receipt.candidateBindings["candidate-A"].surfaceScanStatus, "completed-no-match");
  assert.equal(first.receipt.candidateBindings["candidate-A"].surfaceMatchCount, 0);
  assert.equal(first.receipt.candidateBindings["candidate-B"].surfaceScanStatus, "completed-with-matches");
  assert.ok(first.receipt.candidateBindings["candidate-B"].surfaceMatchCount > 0);
  assert.equal(first.receipt.storyyardProjection.manuscriptApply, false);
  assert.equal(first.receipt.storyyardProjection.canonLeakPolicy, "block-on-nonzero");
  assert.equal(first.receipt.commonContextSha256, input.commonContext.sha256);
  assert.equal(first.receipt.commonContextByteLength, input.commonContext.byteLength);
  assert.equal(first.receipt.reviewer.configSha256, input.reviewer.configSha256);
  assert.equal(first.receipt.reviewer.soulSha256, input.reviewer.soulSha256);
  assert.deepEqual(first.publications.surfaceScans, ["written", "written"]);
  assert.deepEqual(second.publications.surfaceScans, ["reused", "reused"]);

  const exactInput = JSON.parse(await readFile(join(root, first.evaluatorInputPath), "utf8"));
  assert.deepEqual(exactInput.candidates.map((candidate) => Object.keys(candidate).sort()), [
    ["body", "byteLength", "evidenceSpans", "id", "sha256"],
    ["body", "byteLength", "evidenceSpans", "id", "sha256"],
  ]);
  assert.equal(JSON.stringify(exactInput).includes("labelMap"), false);
  assert.equal(JSON.stringify(exactInput).includes("hiddenLane"), false);
  assert.equal(exactInput.schemaVersion, "private-firefly-blind-pair-evaluator-input/v2");
  assert.deepEqual(exactInput.reviewerRuntime, {
    configSha256: input.reviewer.configSha256,
    soulSha256: input.reviewer.soulSha256,
  });
  assert.deepEqual(exactInput.commonContext, input.commonContext);
  assert.ok(exactInput.commonContext.byteLength > 0);
  assert.match(observations.options.prompt, /typed span object copied byte-for-byte/u);
  assert.match(observations.options.prompt, /commonContext/u);

  const surfaceA = JSON.parse(await readFile(join(root, first.surfaceScanPaths[0]), "utf8"));
  const surfaceB = JSON.parse(await readFile(join(root, first.surfaceScanPaths[1]), "utf8"));
  assert.equal(surfaceA.status, "completed-no-match");
  assert.equal(surfaceB.status, "completed-with-matches");
  assert.ok(surfaceB.matches.every((match) => match.candidate.candidateContentSha256 === input.candidates[1].sha256));
  assert.ok(surfaceB.matches.every((match) => match.classification === "pending"));
  assert.ok(surfaceB.matches.every((match) => !("rawText" in match.source)));

  const privateHost = JSON.parse(await readFile(join(root, first.privateInputPath), "utf8"));
  assert.equal(privateHost.schemaVersion, "private-firefly-blind-pair-host-input/v2");
  assert.deepEqual(privateHost.sealedInput.producerActors, input.producerActors);
  const trackedBytes = await readFile(join(root, first.receiptPath));
  const tracked = JSON.parse(trackedBytes.toString("utf8"));
  assert.equal("rankingReason" in tracked, false);
  assert.equal("candidates" in tracked, false);
  assert.equal("producerActors" in tracked, false);
  for (const body of bodies) assert.equal(trackedBytes.includes(Buffer.from(body)), false);
  assert.match(tracked.evaluatorBinding.evaluatorInputSha256, /^[0-9a-f]{64}$/u);
  assert.match(tracked.evaluatorBinding.evaluatorResultSha256, /^[0-9a-f]{64}$/u);
  assert.match(tracked.evaluatorBinding.hostReceiptSha256, /^[0-9a-f]{64}$/u);
  assert.equal(tracked.evaluatorBinding.evaluatorInputSha256, rawSha(await readFile(join(root, first.evaluatorInputPath))));
  assert.equal(tracked.evaluatorBinding.evaluatorResultSha256, rawSha(await readFile(join(root, first.privateResultPath))));
  assert.equal(tracked.evaluatorBinding.hostReceiptSha256, rawSha(jsonBytes(first.run.receipt)));
});

test("host rejects invalid evaluator spans and tampered result or host receipt hashes", async (t) => {
  const invalidCases = [
    {
      pairId: "bad-boundary-01",
      mutate: (result) => {
        result.evaluations["candidate-A"].emotionalCoherence.evidence[0].startByte = 1;
        return result;
      },
      pattern: /UTF-8 boundaries|slice SHA-256|not copied/u,
    },
    {
      pairId: "bad-range-01",
      mutate: (result) => {
        result.evaluations["candidate-B"].genreIdentity.worldConstraintEvidence[0].endByte = 999_999;
        return result;
      },
      pattern: /out of range/u,
    },
    {
      pairId: "untyped-01",
      mutate: (result) => {
        result.evaluations["candidate-A"].canonLeaks = [{ code: "canon-leak", evidence: "원문 인명" }];
        return result;
      },
      pattern: /typed exact spans/u,
    },
  ];
  for (const entry of invalidCases) {
    const { root, input } = await fixture(t, { pairId: entry.pairId });
    await assert.rejects(runBlindPairEvaluation({
      input,
      testOnly: true,
      testOnlyRepositoryRoot: root,
      testOnlyExecutor: stubExecutor(input, {}, entry.mutate),
    }), entry.pattern);
  }

  const hostFixture = await fixture(t, { pairId: "host-tamper-01" });
  await assert.rejects(runBlindPairEvaluation({
    input: hostFixture.input,
    testOnly: true,
    testOnlyRepositoryRoot: hostFixture.root,
    testOnlyExecutor: stubExecutor(hostFixture.input, {}, (value) => value, (receipt) => ({
      ...receipt,
      resultSha256: "0".repeat(64),
    })),
  }), /receipt drifted/u);

  for (const field of ["profileConfigSha256", "soulSha256", "model", "reasoningEffort"]) {
    const digestFixture = await fixture(t, { pairId: `host-${field}` });
    await assert.rejects(runBlindPairEvaluation({
      input: digestFixture.input,
      testOnly: true,
      testOnlyRepositoryRoot: digestFixture.root,
      testOnlyExecutor: stubExecutor(digestFixture.input, {}, (value) => value, (receipt) => ({
        ...receipt,
        [field]: field === "model" ? "gpt-5.6-sol" : field === "reasoningEffort" ? "high" : sealedSha(`arbitrary-${field}`),
      })),
    }), /receipt drifted/u);
  }
});

test("new evaluator execution rejects the historical Sol tuple before invoking Hermes", async (t) => {
  const { root, input } = await fixture(t, { pairId: "legacy-runtime" });
  Object.assign(input.reviewer, {
    model: "gpt-5.6-sol",
    reasoning: "high",
    configSha256: LEGACY_INKOS_BLIND_EVALUATOR_CONFIG_SHA256,
    soulSha256: LEGACY_INKOS_BLIND_EVALUATOR_SOUL_SHA256,
  });
  let invoked = false;
  await assert.rejects(runBlindPairEvaluation({
    input, testOnly: true, testOnlyRepositoryRoot: root,
    testOnlyExecutor: async () => { invoked = true; throw new Error("must not execute"); },
  }), /fixed audited/u);
  assert.equal(invoked, false);
});

test("surface receipt builder rejects a fake empty scan, truncation, and unsupported match evidence", () => {
  const candidate = {
    id: "candidate-A",
    body: "후보 본문",
    sha256: rawSha("후보 본문"),
    byteLength: Buffer.byteLength("후보 본문"),
    evidenceSpans: [],
  };
  const base = {
    schemaVersion: "tracked-projection-leak-scan/v1",
    scanner: { version: "genre-soul-surface-scanner/v1", exactTokenCount: 12, longCommonUtf8Bytes: 120 },
    artifact: { path: "analyses/genre_souls/test.txt", sha256: candidate.sha256, sizeBytes: candidate.byteLength },
    corpus: { privateRegistrySha256: sealedSha("registry"), availableSourceCount: 1, observedSourceSetSha256: sealedSha("observed") },
    matchCount: 0,
    matches: [],
    truncated: false,
    status: "pass",
    automaticRewrite: false,
    automaticReject: false,
  };
  const sources = new Map([["gdrive-source", sealedSha("source")]]);
  const built = buildBlindSurfaceScanReceipt({ rawScan: base, candidate, sourceSha256ById: sources });
  assert.equal(built.receipt.status, "completed-no-match");

  assert.throws(() => buildBlindSurfaceScanReceipt({
    rawScan: { ...base, matchCount: 1 }, candidate, sourceSha256ById: sources,
  }), /match count is invalid/u);
  assert.throws(() => buildBlindSurfaceScanReceipt({
    rawScan: { ...base, truncated: true }, candidate, sourceSha256ById: sources,
  }), /truncated/u);
  assert.throws(() => buildBlindSurfaceScanReceipt({
    rawScan: {
      ...base,
      matchCount: 1,
      status: "quarantine",
      matches: [{
        matchId: "raw", method: "semantic-guess/v1", sourceId: "gdrive-source",
        sourceSelector: { startByte: 0, endByte: 1, sliceSha256: sealedSha("slice") },
        artifactSelector: { startByte: 0, endByte: 1, sliceSha256: sealedSha("slice") },
        classification: "pending",
      }],
    },
    candidate,
    sourceSha256ById: sources,
  }), /unsupported/u);
});

test("rejects profile collapse, production-shaped injection, symlink roots, packet drift, and body drift", async (t) => {
  const { root, input } = await fixture(t, { pairId: "boundary-pair-01" });
  const executor = stubExecutor(input);
  await assert.rejects(runBlindPairEvaluation({ input, testOnlyExecutor: executor }), /requires testOnly=true/u);
  await assert.rejects(runBlindPairEvaluation({ input, testOnly: true, testOnlyExecutor: executor }), /explicit testOnlyRepositoryRoot/u);
  await assert.rejects(runBlindPairEvaluation({ input, executor }), /production executor is not injectable/u);
  await assert.rejects(runBlindPairEvaluation({
    input, testOnly: true, testOnlyRepositoryRoot: REPOSITORY_ROOT, testOnlyExecutor: executor,
  }), /outside the canonical Reference Lab root/u);

  const collapsed = structuredClone(input);
  collapsed.reviewer.profileId = collapsed.producerActors[0].profileId;
  await assert.rejects(runBlindPairEvaluation({
    input: collapsed, testOnly: true, testOnlyRepositoryRoot: root, testOnlyExecutor: stubExecutor(collapsed),
  }), /must be inkos_blind_evaluator/u);

  const alias = `${root}-alias`;
  symlinkSync(root, alias);
  t.after(() => rm(alias, { force: true }));
  await assert.rejects(runBlindPairEvaluation({
    input, testOnly: true, testOnlyRepositoryRoot: alias, testOnlyExecutor: executor,
  }), /physical non-symlink/u);

  const packetDrift = structuredClone(input);
  packetDrift.reviewPacket.sha256 = "0".repeat(64);
  await assert.rejects(runBlindPairEvaluation({
    input: packetDrift, testOnly: true, testOnlyRepositoryRoot: root, testOnlyExecutor: stubExecutor(packetDrift),
  }), /artifact binding drifted/u);

  const bodyDrift = structuredClone(input);
  bodyDrift.candidates[0].sha256 = sealedSha("wrong-body");
  await assert.rejects(runBlindPairEvaluation({
    input: bodyDrift, testOnly: true, testOnlyRepositoryRoot: root, testOnlyExecutor: stubExecutor(bodyDrift),
  }), /transfer drifted|body binding drifted/u);

  const semanticPair = structuredClone(input);
  semanticPair.pairId = "bp-modern-fantasy-pair";
  await assert.rejects(runBlindPairEvaluation({
    input: semanticPair, testOnly: true, testOnlyRepositoryRoot: root, testOnlyExecutor: stubExecutor(semanticPair),
  }), /must be opaque/u);

  const contextDrift = structuredClone(input);
  contextDrift.commonContext.text += " 변조";
  await assert.rejects(runBlindPairEvaluation({
    input: contextDrift, testOnly: true, testOnlyRepositoryRoot: root, testOnlyExecutor: stubExecutor(contextDrift),
  }), /commonContext text\/bytes\/hash binding drifted/u);
});

test("runner accepts only the exact lane-free InkOS transfer and binds it to the sealed input", async (t) => {
  const noncanonical = await fixture(t, { pairId: "transfer-encoding-01" });
  const noncanonicalPacketPath = join(noncanonical.root, noncanonical.input.reviewPacket.path);
  const noncanonicalPacket = JSON.parse(await readFile(noncanonicalPacketPath, "utf8"));
  const noncanonicalBytes = Buffer.from(JSON.stringify(noncanonicalPacket), "utf8");
  await writeFile(noncanonicalPacketPath, noncanonicalBytes);
  const noncanonicalInput = structuredClone(noncanonical.input);
  noncanonicalInput.reviewPacket = {
    ...noncanonicalInput.reviewPacket,
    sha256: rawSha(noncanonicalBytes),
    byteLength: noncanonicalBytes.byteLength,
  };
  await assert.rejects(runBlindPairEvaluation({
    input: noncanonicalInput,
    testOnly: true,
    testOnlyRepositoryRoot: noncanonical.root,
    testOnlyExecutor: stubExecutor(noncanonicalInput),
  }), /canonical transfer JSON bytes/u);

  const leaked = await fixture(t, { pairId: "transfer-leak-01" });
  const leakedPacketPath = join(leaked.root, leaked.input.reviewPacket.path);
  const leakedPacket = JSON.parse(await readFile(leakedPacketPath, "utf8"));
  leakedPacket.candidateToLane = { "candidate-A": "neutral", "candidate-B": "soul" };
  const leakedBytes = jsonBytes(leakedPacket);
  await writeFile(leakedPacketPath, leakedBytes);
  const leakedInput = structuredClone(leaked.input);
  leakedInput.reviewPacket = {
    ...leakedInput.reviewPacket,
    sha256: rawSha(leakedBytes),
    byteLength: leakedBytes.byteLength,
  };
  await assert.rejects(runBlindPairEvaluation({
    input: leakedInput,
    testOnly: true,
    testOnlyRepositoryRoot: leaked.root,
    testOnlyExecutor: stubExecutor(leakedInput),
  }), /keys must be exactly/u);

  const drifted = await fixture(t, { pairId: "transfer-binding-01" });
  const driftedInput = structuredClone(drifted.input);
  driftedInput.labelAssignmentReceiptSha256 = sealedSha("different-label-receipt");
  await assert.rejects(runBlindPairEvaluation({
    input: driftedInput,
    testOnly: true,
    testOnlyRepositoryRoot: drifted.root,
    testOnlyExecutor: stubExecutor(driftedInput),
  }), /transfer drifted from the sealed RefLab input/u);
});

test("refuses to overwrite a conflicting tracked receipt and leaves the original bytes intact", async (t) => {
  const { root, input } = await fixture(t, { pairId: "occupied-pair-01" });
  const occupied = join(root, `analyses/genre_souls/male-modern-fantasy-ko/v1/blind-reviews/${input.pairId}.json`);
  await mkdir(dirname(occupied), { recursive: true });
  await writeFile(occupied, "{\"occupied\":true}\n");
  await assert.rejects(runBlindPairEvaluation({
    input,
    testOnly: true,
    testOnlyRepositoryRoot: root,
    testOnlyExecutor: stubExecutor(input),
  }), /already exists with different bytes/u);
  assert.equal(await readFile(occupied, "utf8"), "{\"occupied\":true}\n");
});

test("refuses to overwrite a conflicting private surface-scan receipt", async (t) => {
  const { root, input } = await fixture(t, { pairId: "occupied-surface-01" });
  const occupied = join(
    root,
    `exports/genre-souls/male-modern-fantasy-ko/v1/blind-reviews/${input.pairId}/surface-scan-candidate-A.json`,
  );
  await mkdir(dirname(occupied), { recursive: true });
  await writeFile(occupied, "{\"occupiedSurface\":true}\n");
  await assert.rejects(runBlindPairEvaluation({
    input,
    testOnly: true,
    testOnlyRepositoryRoot: root,
    testOnlyExecutor: stubExecutor(input),
  }), /already exists with different bytes/u);
  assert.equal(await readFile(occupied, "utf8"), "{\"occupiedSurface\":true}\n");
});

test("prompt exposes only opaque A/B bodies, exact typed schema, and pending advisory authority", async (t) => {
  const { root, input, pairSeed } = await fixture(t, { pairId: "prompt-pair-01" });
  const packet = JSON.parse(await readFile(join(root, input.reviewPacket.path), "utf8"));
  const candidates = packet.candidates.map((candidate, index) => ({
    id: candidate.id,
    body: candidate.body,
    sha256: input.candidates[index].sha256,
    byteLength: input.candidates[index].byteLength,
    evidenceSpans: [{
      coordinateKind: "utf8-byte",
      startByte: 0,
      endByte: Buffer.byteLength(candidate.body),
      sliceSha256: rawSha(candidate.body),
    }],
  }));
  const projected = {
    schemaVersion: "private-firefly-blind-pair-evaluator-input/v2",
    genre: "murim-ko",
    pairId: opaqueId("bp", "murim-pair-01"),
    round: 2,
    blindRunId: opaqueId("br", "blind-run-murim-01"),
    pairedGenerationReceiptSha256: "a".repeat(64),
    reviewerRuntime: {
      configSha256: input.reviewer.configSha256,
      soulSha256: input.reviewer.soulSha256,
    },
    commonContext: input.commonContext,
    contentContract: input.contentContract,
    candidates,
    authority: BLIND_PAIR_AUTHORITY,
  };
  const prompt = buildBlindPairEvaluatorPrompt(projected);
  assert.match(prompt, /candidate-A/u);
  assert.match(prompt, /candidate-B/u);
  assert.match(prompt, /firefly-blind-pair-evaluator-result\/v2/u);
  assert.match(prompt, /humanDecision.*pending/su);
  assert.match(prompt, /typed span object copied byte-for-byte/u);
  assert.match(prompt, /commonContext/u);
  assert.match(prompt, new RegExp(projected.pairId, "u"));
  assert.match(prompt, new RegExp(projected.blindRunId, "u"));
  assert.doesNotMatch(prompt, new RegExp(pairSeed, "u"));
  assert.doesNotMatch(prompt, /producer|genre-soul|labelMap|hiddenLane|"lane"/u);
});
