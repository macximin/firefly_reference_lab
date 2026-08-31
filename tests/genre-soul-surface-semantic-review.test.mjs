import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  computeGenreSoulSurfaceSampleSetSha256,
  computeGenreSoulSurfaceSourceSetSha256,
  evaluateGenreSoulSurfaceHil,
  validatePrivateGenreSoulAmbiguousSurfaceRequest,
} from "../tools/genre-soul-surface-hil-lib.mjs";
import {
  assertGenreSoulSurfaceSemanticReviewContextBudget,
  buildGenreSoulSurfaceSemanticReviewPrompt,
  buildPrivateGenreSoulSurfaceSemanticReviewAggregate,
  buildPrivateGenreSoulSurfaceSemanticReviewInput,
  buildPrivateGenreSoulSurfaceSemanticReviewPartitionPlan,
  genreSoulSurfaceSemanticReviewerRole,
  isGenreSoulSurfaceSemanticReviewContextBudgetError,
  resolveGenreSoulSurfaceSemanticReview,
  validateGenreSoulSurfaceSemanticReviewReceipt,
  validatePrivateGenreSoulSurfaceSemanticReviewAggregate,
  validatePrivateGenreSoulSurfaceSemanticReviewPartitionPlan,
  validatePrivateGenreSoulSurfaceSemanticReviewResult,
} from "../tools/genre-soul-surface-semantic-review-lib.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const producerRuns = [{
  role: "genre-soul-profile-synthesis",
  runId: "producer-run-1",
  resultSha256: sha256("producer-result"),
  hostReceiptSha256: sha256("producer-receipt"),
}];

function evaluate({ candidate, samples, bindings = [] }) {
  return evaluateGenreSoulSurfaceHil({
    stage: "profile",
    genre: "modern-fantasy-ko",
    soulId: "male-modern-fantasy-ko",
    inputDigest: sha256("profile-input"),
    candidatePath: "exports/genre-souls/male-modern-fantasy-ko/v1/profile-runs/test/genre/candidate.json",
    candidate,
    selectionBindings: bindings,
    privateSamples: samples,
    sourceSetSha256: computeGenreSoulSurfaceSourceSetSha256(bindings),
    sampleSetSha256: computeGenreSoulSurfaceSampleSetSha256(samples),
  });
}

function reviewResult(inputValidation, verdictForFinding) {
  const result = {
    schemaVersion: "private-genre-soul-surface-semantic-review-result/v1",
    gateVersion: "genre-soul-protected-surface-hil/v3",
    stage: inputValidation.input.stage,
    genre: inputValidation.input.genre,
    soulId: inputValidation.input.soulId,
    inputDigest: inputValidation.input.inputDigest,
    reviewRequestSha256: inputValidation.sha256,
    findingDecisions: inputValidation.input.findings.map((finding, index) => {
      const verdict = verdictForFinding(finding, index);
      const reasonCode = {
        "generic-overlap": "common-lexeme",
        "protected-identity": "same-person-identity",
        uncertain: "insufficient-context",
      }[verdict];
      return {
        findingId: finding.findingId,
        verdict,
        reasonCode,
        evidenceWindowIds: [
          finding.candidateWindows[0].windowId,
          finding.privateSourceWindows[0].windowId,
        ].sort(),
      };
    }),
    authority: {
      scope: "reference-lab-analysis-surface-only",
      mayWriteInkOSCanon: false,
      mayPromoteSoul: false,
    },
  };
  return validatePrivateGenreSoulSurfaceSemanticReviewResult(result, { input: inputValidation.bytes });
}

function reviewRun(inputValidation, resultValidation, override = {}) {
  const { inputPath: inputPathOverride, ...receiptOverride } = override;
  const inputPath = inputPathOverride ?? "/private/reference-lab/surface-review/input.json";
  const prompt = buildGenreSoulSurfaceSemanticReviewPrompt(inputValidation.bytes);
  const receipt = {
    role: genreSoulSurfaceSemanticReviewerRole(inputValidation.bytes),
    runId: "semantic-review-run-1",
    model: "gpt-5.6-sol",
    provider: "openai-codex",
    reasoningEffort: "high",
    promptSha256: sha256(Buffer.from(prompt)),
    inputDigest: inputValidation.sha256,
    inputSha256: sha256(jsonBytes([{ path: inputPath, sha256: inputValidation.sha256 }])),
    resultSha256: resultValidation.sha256,
    completed: true,
    truncation: false,
    compaction: false,
    compression: false,
    expectedReadCount: 1,
    exactReadCount: 1,
    exactReadSha256s: [inputValidation.sha256],
    ...receiptOverride,
  };
  return { receipt, receiptBytes: jsonBytes(receipt), prompt, inputPath };
}

function multiFindingEvaluation() {
  return evaluate({
    candidate: {
      first: "김광 방식",
      second: "차도윤 방식",
      third: "박재현 방식",
      fourth: "윤서진 방식",
    },
    samples: [{
      selectorId: "selector-many-names",
      sourceText: "김광은 움직였다. 차도윤은 계약을 보았다. 박재현은 현금을 받았다. 윤서진은 회사를 샀다.",
    }],
  });
}

function twoFindingBudget({ findingIds, inputBytes, inputSha256, promptBytes }) {
  if (findingIds.length > 2) return null;
  return {
    schemaVersion: "test-surface-semantic-context-budget/v1",
    inputSha256,
    inputSizeBytes: inputBytes.byteLength,
    promptSha256: sha256(promptBytes),
    findingCount: findingIds.length,
  };
}

function aggregateParts(planValidation, verdictForFinding) {
  return planValidation.parts.map((part, index) => {
    const result = reviewResult(part.input, (finding, findingIndex) => (
      verdictForFinding(finding, findingIndex, index)
    ));
    const inputPath = `/private/reference-lab/surface-review/${part.partId}/input.json`;
    const run = reviewRun(part.input, result, {
      inputPath,
      runId: `semantic-review-run-${index + 1}`,
    });
    return {
      partId: part.partId,
      input: part.input.bytes,
      result: result.bytes,
      paths: {
        input: `exports/private/surface-review/${part.partId}/input.json`,
        result: `exports/private/surface-review/${part.partId}/accepted.json`,
        receipt: `exports/private/surface-review/${part.partId}/accepted-host-receipt.json`,
      },
      reviewRun: run,
    };
  });
}

test("v3 extractor routes Korean role, punctuation, particle, and compound false positives to bounded semantic review", () => {
  const samples = [{
    selectorId: "selector-false-positives",
    sourceText: "박 대표는 서명이 필요하다고 말했다. 회장님, 현재 계약을 본다. 전에 기사가 왔다. 정부군은 이동했다.",
  }];
  const evaluation = evaluate({
    candidate: {
      signature: "서명은 절차다.",
      present: "현재 계약을 검토한다.",
      before: "전에 확인한다.",
      government: "정부 방식은 공개적이다.",
    },
    samples,
  });
  assert.equal(evaluation.status, "pending_semantic_review");
  assert.ok(evaluation.findings.some((finding) => finding.rule === "adjacent-role-or-honorific/v1"));
  assert.ok(evaluation.findings.every((finding) => (
    finding.candidateWindows.every((window) => Buffer.byteLength(window.text) <= 768)
    && finding.privateSourceWindows.every((window) => Buffer.byteLength(window.text) <= 768)
  )));
  assert.ok(evaluation.findings.flatMap((finding) => finding.privateSourceWindows)
    .some((window) => window.text.includes("회장님,")));

  const input = buildPrivateGenreSoulSurfaceSemanticReviewInput({ evaluation, producerRuns });
  const result = reviewResult(input, () => "generic-overlap");
  const run = reviewRun(input, result);
  assert.equal(validateGenreSoulSurfaceSemanticReviewReceipt(run.receipt, {
    input: input.bytes,
    inputPath: run.inputPath,
    prompt: run.prompt,
    result: result.bytes,
    producerRuns,
  }), true);
  const resolution = resolveGenreSoulSurfaceSemanticReview({
    evaluation,
    input: input.bytes,
    result: result.bytes,
    reviewRun: run,
  });
  assert.equal(resolution.status, "pass");
  assert.equal(resolution.request, null);
});

test("quote, acronym, and organization morphology stay semantic and a protected reviewer verdict blocks", () => {
  const evaluation = evaluate({
    candidate: {
      present: "현재 압박을 보상으로 바꾼다.",
      crisis: "IMF 충격을 역이용한다.",
      company: "중견기업 인수로 보상을 회수한다.",
    },
    samples: [
      { selectorId: "selector-quoted-current", sourceText: "그는 “현재”라고 말했다." },
      { selectorId: "selector-imf", sourceText: "IMF 충격이 시장을 흔들었다." },
      { selectorId: "selector-generic-company", sourceText: "“중견기업”의 자금 흐름을 읽었다." },
    ],
  });
  assert.equal(evaluation.status, "pending_semantic_review");
  assert.deepEqual(evaluation.blockers, []);
  assert.ok(evaluation.findings.some((finding) => finding.rule === "quoted-private-surface-overlap/v1"));
  assert.ok(evaluation.findings.some((finding) => finding.rule === "latin-identifier-shaped-overlap/v1"));
  assert.ok(evaluation.findings.some((finding) => finding.rule === "organization-full-form-overlap/v1"));

  const input = buildPrivateGenreSoulSurfaceSemanticReviewInput({ evaluation, producerRuns });
  const genericResult = reviewResult(input, () => "generic-overlap");
  const genericResolution = resolveGenreSoulSurfaceSemanticReview({
    evaluation,
    input: input.bytes,
    result: genericResult.bytes,
    reviewRun: reviewRun(input, genericResult),
  });
  assert.equal(genericResolution.status, "pass");

  const protectedFindingId = input.input.findings.find((finding) => (
    finding.rule === "organization-full-form-overlap/v1"
  )).findingId;
  const protectedResult = reviewResult(input, (finding) => (
    finding.findingId === protectedFindingId ? "protected-identity" : "generic-overlap"
  ));
  const protectedResolution = resolveGenreSoulSurfaceSemanticReview({
    evaluation,
    input: input.bytes,
    result: protectedResult.bytes,
    reviewRun: reviewRun(input, protectedResult),
  });
  assert.equal(protectedResolution.status, "blocked");
  assert.equal(protectedResolution.request, null);
  assert.ok(protectedResolution.blockers.some((blocker) => blocker.rule === "semantic-protected-identity/v1"));
});

test("semantic resolution blocks protected identities and binds the full projection into owner HIL v4", () => {
  const evaluation = evaluate({
    candidate: { first: "김광 방식", second: "차도윤 방식" },
    samples: [{ selectorId: "selector-names", sourceText: "김광은 움직였다. 차도윤은 계약을 보았다." }],
  });
  assert.equal(evaluation.status, "pending_semantic_review");
  const input = buildPrivateGenreSoulSurfaceSemanticReviewInput({ evaluation, producerRuns });

  const protectedResult = reviewResult(input, (_finding, index) => (
    index === 0 ? "protected-identity" : "generic-overlap"
  ));
  const protectedResolution = resolveGenreSoulSurfaceSemanticReview({
    evaluation,
    input: input.bytes,
    result: protectedResult.bytes,
    reviewRun: reviewRun(input, protectedResult),
  });
  assert.equal(protectedResolution.status, "blocked");
  assert.equal(protectedResolution.request, null);

  const uncertainId = input.input.findings[0].findingId;
  const uncertainResult = reviewResult(input, (finding) => (
    finding.findingId === uncertainId ? "uncertain" : "generic-overlap"
  ));
  const uncertainResolution = resolveGenreSoulSurfaceSemanticReview({
    evaluation,
    input: input.bytes,
    result: uncertainResult.bytes,
    reviewRun: reviewRun(input, uncertainResult),
  });
  assert.equal(uncertainResolution.status, "pending_hil");
  assert.equal(uncertainResolution.request.schemaVersion, "private-genre-soul-ambiguous-surface-request/v4");
  assert.deepEqual(uncertainResolution.request.findings.map((finding) => finding.findingId), [uncertainId]);
  assert.deepEqual(uncertainResolution.request.semanticProjection, {
    findingSetSha256: evaluation.findingSetSha256,
    genericFindingIds: evaluation.findings
      .map((finding) => finding.findingId)
      .filter((findingId) => findingId !== uncertainId),
    protectedFindingIds: [],
    uncertainFindingIds: [uncertainId],
  });
  assert.equal(
    validatePrivateGenreSoulAmbiguousSurfaceRequest(uncertainResolution.requestBytes).sha256,
    uncertainResolution.requestSha256,
  );
  assert.equal(uncertainResolution.legacyRequest.schemaVersion, "private-genre-soul-ambiguous-surface-request/v3");
  assert.equal(
    validatePrivateGenreSoulAmbiguousSurfaceRequest(uncertainResolution.legacyRequestBytes).sha256,
    uncertainResolution.legacyRequestSha256,
  );
});

test("selection metadata and exact five-token copy remain deterministic blocks", () => {
  const bindings = [{
    sourceId: "source-a",
    sourceSha256: sha256("source-a"),
    title: "독점재벌삼세",
    author: "작가표면명",
  }];
  const exactSelection = evaluate({
    candidate: { guidance: "독점재벌삼세의 보상을 따른다" },
    samples: [],
    bindings,
  });
  assert.equal(exactSelection.status, "blocked");
  assert.equal(exactSelection.findings.length, 0);

  const copied = evaluate({
    candidate: { guidance: "계약을 뒤집어 현금을 즉시 확보했다" },
    samples: [{ selectorId: "selector-copy", sourceText: "계약을 뒤집어 현금을 즉시 확보했다." }],
  });
  assert.equal(copied.status, "blocked");
  assert.ok(copied.blockers.some((blocker) => blocker.rule === "exact-private-surface-copy/v1"));

});

test("strict review coverage and fresh reviewer receipt fail closed", () => {
  const evaluation = evaluate({
    candidate: { mechanism: "김광 방식" },
    samples: [{ selectorId: "selector-a", sourceText: "김광은 움직였다." }],
  });
  const input = buildPrivateGenreSoulSurfaceSemanticReviewInput({ evaluation, producerRuns });
  const result = reviewResult(input, () => "generic-overlap");
  const missing = structuredClone(result.result);
  missing.findingDecisions = [];
  assert.throws(
    () => validatePrivateGenreSoulSurfaceSemanticReviewResult(missing, { input: input.bytes }),
    /exact finding set/u,
  );
  const sameRun = reviewRun(input, result, { runId: producerRuns[0].runId });
  assert.throws(
    () => validateGenreSoulSurfaceSemanticReviewReceipt(sameRun.receipt, {
      input: input.bytes,
      inputPath: sameRun.inputPath,
      prompt: sameRun.prompt,
      result: result.bytes,
      producerRuns,
    }),
    /separate from every producer/u,
  );
  const run = reviewRun(input, result);
  assert.throws(
    () => validateGenreSoulSurfaceSemanticReviewReceipt(run.receipt, {
      input: input.bytes,
      inputPath: run.inputPath,
      prompt: run.prompt,
      result: result.bytes,
      producerRuns: [{
        ...producerRuns[0],
        runId: "drifted-producer-run",
      }],
    }),
    /producerRuns drifted/u,
  );
});

test("raw evidence windows are globally bounded per finding and incomplete coverage fails closed to uncertain", () => {
  const candidate = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [
    `mechanism${String(index).padStart(2, "0")}`,
    `김광 방식 ${index}`,
  ]));
  const samples = Array.from({ length: 12 }, (_, index) => ({
    selectorId: `selector-${String(index).padStart(2, "0")}`,
    sourceText: `김광은 ${index}번째로 움직였다.`,
  }));
  const evaluation = evaluate({ candidate, samples });
  assert.equal(evaluation.status, "pending_semantic_review");
  const finding = evaluation.findings.find((entry) => entry.normalizedTerm === "김광");
  assert.ok(finding);
  assert.ok(finding.candidateWindows.length <= 8);
  assert.ok(finding.privateSourceWindows.length <= 8);
  assert.equal(finding.windowCoverageComplete, false);

  const input = buildPrivateGenreSoulSurfaceSemanticReviewInput({ evaluation, producerRuns });
  assert.throws(
    () => reviewResult(input, () => "generic-overlap"),
    /must remain uncertain/u,
  );
  assert.equal(reviewResult(input, () => "uncertain").result.findingDecisions[0].verdict, "uncertain");
});

test("legacy single v1 input and prompt bytes stay stable while shared context preflight is exact", () => {
  const evaluation = evaluate({
    candidate: { mechanism: "김광 방식" },
    samples: [{ selectorId: "selector-a", sourceText: "김광은 움직였다." }],
  });
  const input = buildPrivateGenreSoulSurfaceSemanticReviewInput({ evaluation, producerRuns });
  const prompt = buildGenreSoulSurfaceSemanticReviewPrompt(input.bytes);
  assert.equal(input.input.schemaVersion, "private-genre-soul-surface-semantic-review-input/v1");
  assert.equal(input.sha256, "a8f40c833cb2b6e68f569aae4409528e1cfd41f8d8baee0ab819642074847716");
  assert.equal(input.bytes.byteLength, 2_735);
  assert.equal(sha256(Buffer.from(prompt)), "946aebd1be23b6c5072518f9f5a3803e155a2cce6ce8549b3863de7aeb317507");
  assert.equal(Buffer.byteLength(prompt), 2_334);

  const receipt = assertGenreSoulSurfaceSemanticReviewContextBudget(input.bytes, {
    prompt,
    outputReserveTokens: 8_192,
    contextLimit: 272_000,
    projectPromptContextBytes: 1_024,
  });
  assert.equal(receipt.inputSha256, input.sha256);
  assert.equal(receipt.inputSizeBytes, input.bytes.byteLength);
  assert.equal(receipt.promptSha256, sha256(Buffer.from(prompt)));
  assert.equal(receipt.projectPromptContextBytes, 1_024);
  assert.equal(receipt.contextPlan.projectPromptContextBytes, 1_024);
  assert.equal(receipt.contextPlan.fits, true);
  assert.throws(
    () => assertGenreSoulSurfaceSemanticReviewContextBudget(input.bytes, {
      prompt,
      maxInputConservativeTokenProxy: 1,
      outputReserveTokens: 8_192,
      contextLimit: 272_000,
    }),
    (error) => isGenreSoulSurfaceSemanticReviewContextBudgetError(error),
  );
});

test("greedy-prefix v1 builds deterministic contiguous atomic partitions with exact budget receipts", () => {
  const evaluation = multiFindingEvaluation();
  assert.equal(evaluation.status, "pending_semantic_review");
  assert.equal(evaluation.findings.length, 5);
  const built = buildPrivateGenreSoulSurfaceSemanticReviewPartitionPlan({
    evaluation,
    producerRuns,
    contextBudgetForPart: twoFindingBudget,
  });
  assert.deepEqual(built.plan.parts.map((part) => part.partId), ["p0001", "p0002", "p0003"]);
  assert.deepEqual(built.plan.parts.map((part) => part.findingIds.length), [2, 2, 1]);
  assert.deepEqual(
    built.plan.parts.flatMap((part) => part.findingIds),
    evaluation.findings.map((finding) => finding.findingId),
  );
  assert.ok(built.parts.every((part) => (
    part.input.input.schemaVersion === "private-genre-soul-surface-semantic-review-input/v1"
    && part.input.input.findings.length <= 2
    && part.contextBudgetReceipt.inputSha256 === part.input.sha256
  )));
  const rebuilt = validatePrivateGenreSoulSurfaceSemanticReviewPartitionPlan(built.bytes, {
    evaluation,
    producerRuns,
    contextBudgetForPart: twoFindingBudget,
  });
  assert.equal(rebuilt.sha256, built.sha256);
  assert.equal(buildPrivateGenreSoulSurfaceSemanticReviewPartitionPlan({
    evaluation,
    producerRuns,
    contextBudgetForPart: twoFindingBudget,
  }).sha256, built.sha256);

  const tampered = structuredClone(built.plan);
  tampered.parts[0].findingIds.pop();
  assert.throws(
    () => validatePrivateGenreSoulSurfaceSemanticReviewPartitionPlan(tampered, {
      evaluation,
      producerRuns,
      contextBudgetForPart: twoFindingBudget,
    }),
    /greedy-prefix reconstruction/u,
  );
  const receiptTamper = structuredClone(built.plan);
  receiptTamper.parts[0].contextBudgetReceipt.findingCount += 1;
  assert.throws(
    () => validatePrivateGenreSoulSurfaceSemanticReviewPartitionPlan(receiptTamper, {
      evaluation,
      producerRuns,
      contextBudgetForPart: twoFindingBudget,
    }),
    /greedy-prefix reconstruction/u,
  );
  assert.throws(
    () => buildPrivateGenreSoulSurfaceSemanticReviewPartitionPlan({
      evaluation,
      producerRuns,
      contextBudgetForPart: () => null,
    }),
    (error) => isGenreSoulSurfaceSemanticReviewContextBudgetError(error),
  );
  assert.throws(
    () => buildPrivateGenreSoulSurfaceSemanticReviewPartitionPlan({
      evaluation,
      producerRuns,
      contextBudgetForPart: () => {
        throw new Error("budget configuration drift");
      },
    }),
    /budget configuration drift/u,
  );
});

test("host aggregate preserves exact decision union, protected dominance, and one uncertain union projection", () => {
  const evaluation = multiFindingEvaluation();
  const plan = buildPrivateGenreSoulSurfaceSemanticReviewPartitionPlan({
    evaluation,
    producerRuns,
    contextBudgetForPart: twoFindingBudget,
  });
  const base = {
    evaluation,
    producerRuns,
    plan: plan.bytes,
    planPath: "exports/private/surface-review/partition-plan.json",
    aggregatePath: "exports/private/surface-review/aggregate.json",
    contextBudgetForPart: twoFindingBudget,
  };
  const genericParts = aggregateParts(plan, () => "generic-overlap");
  const passed = buildPrivateGenreSoulSurfaceSemanticReviewAggregate({ ...base, parts: genericParts });
  assert.equal(passed.status, "pass");
  assert.deepEqual(passed.aggregate.verdictCounts, {
    genericOverlap: evaluation.findings.length,
    protectedIdentity: 0,
    uncertain: 0,
  });
  assert.deepEqual(
    passed.aggregate.findingDecisions.map((decision) => decision.findingId),
    evaluation.findings.map((finding) => finding.findingId),
  );
  assert.deepEqual(passed.semanticReviewBinding.verdictCounts, passed.aggregate.verdictCounts);
  assert.equal(passed.semanticReviewBinding.outcome, "pass");
  assert.deepEqual(
    passed.semanticReviewBinding.parts.flatMap((part) => part.findingIds),
    evaluation.findings.map((finding) => finding.findingId),
  );
  assert.equal(validatePrivateGenreSoulSurfaceSemanticReviewAggregate(passed.bytes, {
    ...base,
    parts: genericParts,
  }).sha256, passed.sha256);

  const uncertainId = evaluation.findings[1].findingId;
  const pending = buildPrivateGenreSoulSurfaceSemanticReviewAggregate({
    ...base,
    parts: aggregateParts(plan, (finding) => (
      finding.findingId === uncertainId ? "uncertain" : "generic-overlap"
    )),
  });
  assert.equal(pending.status, "pending_hil");
  assert.deepEqual(pending.uncertainFindings.map((finding) => finding.findingId), [uncertainId]);
  assert.deepEqual(
    pending.semanticReviewBinding.parts.flatMap((part) => part.uncertainFindingIds),
    [uncertainId],
  );

  const protectedId = evaluation.findings[3].findingId;
  const blocked = buildPrivateGenreSoulSurfaceSemanticReviewAggregate({
    ...base,
    parts: aggregateParts(plan, (finding) => {
      if (finding.findingId === protectedId) return "protected-identity";
      if (finding.findingId === uncertainId) return "uncertain";
      return "generic-overlap";
    }),
  });
  assert.equal(blocked.status, "blocked");
  assert.deepEqual(blocked.protectedFindings.map((finding) => finding.findingId), [protectedId]);
  assert.equal(blocked.semanticReviewBinding.verdictCounts.protectedIdentity, 1);
  assert.equal(blocked.semanticReviewBinding.outcome, "blocked");
});

test("aggregate rejects missing evidence, host-receipt byte drift, and sibling reviewer reuse", () => {
  const evaluation = multiFindingEvaluation();
  const plan = buildPrivateGenreSoulSurfaceSemanticReviewPartitionPlan({
    evaluation,
    producerRuns,
    contextBudgetForPart: twoFindingBudget,
  });
  const base = {
    evaluation,
    producerRuns,
    plan: plan.bytes,
    planPath: "exports/private/surface-review/partition-plan.json",
    aggregatePath: "exports/private/surface-review/aggregate.json",
    contextBudgetForPart: twoFindingBudget,
  };
  const parts = aggregateParts(plan, () => "generic-overlap");
  assert.throws(
    () => buildPrivateGenreSoulSurfaceSemanticReviewAggregate({
      ...base,
      aggregatePath: base.planPath,
      parts,
    }),
    /paths must differ/u,
  );
  assert.throws(
    () => buildPrivateGenreSoulSurfaceSemanticReviewAggregate({ ...base, parts: parts.slice(0, -1) }),
    /every partition exactly once/u,
  );

  const receiptDrift = aggregateParts(plan, () => "generic-overlap");
  receiptDrift[0].reviewRun.receiptBytes = Buffer.concat([
    receiptDrift[0].reviewRun.receiptBytes,
    Buffer.from(" "),
  ]);
  assert.throws(
    () => buildPrivateGenreSoulSurfaceSemanticReviewAggregate({ ...base, parts: receiptDrift }),
    /receipt bytes are not canonical/u,
  );

  const reused = aggregateParts(plan, () => "generic-overlap");
  const secondResult = validatePrivateGenreSoulSurfaceSemanticReviewResult(
    reused[1].result,
    { input: plan.parts[1].input.bytes },
  );
  reused[1].reviewRun = reviewRun(plan.parts[1].input, secondResult, {
    inputPath: "/private/reference-lab/surface-review/p0002/input.json",
    runId: reused[0].reviewRun.receipt.runId,
  });
  assert.throws(
    () => buildPrivateGenreSoulSurfaceSemanticReviewAggregate({ ...base, parts: reused }),
    /runId is reused across partitions/u,
  );

  const inputDrift = aggregateParts(plan, () => "generic-overlap");
  inputDrift[0].input = Buffer.from(inputDrift[0].input);
  inputDrift[0].input[10] ^= 1;
  assert.throws(
    () => buildPrivateGenreSoulSurfaceSemanticReviewAggregate({ ...base, parts: inputDrift }),
    /not valid JSON|planned partition|canonical|keys must be exactly/u,
  );
});
