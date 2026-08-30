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
  buildGenreSoulSurfaceSemanticReviewPrompt,
  buildPrivateGenreSoulSurfaceSemanticReviewInput,
  genreSoulSurfaceSemanticReviewerRole,
  resolveGenreSoulSurfaceSemanticReview,
  validateGenreSoulSurfaceSemanticReviewReceipt,
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
  const inputPath = "/private/reference-lab/surface-review/input.json";
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
    ...override,
  };
  return { receipt, receiptBytes: jsonBytes(receipt), prompt, inputPath };
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

test("semantic resolution blocks protected identities and filters only uncertain findings into owner HIL v3", () => {
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
  assert.equal(uncertainResolution.request.schemaVersion, "private-genre-soul-ambiguous-surface-request/v3");
  assert.deepEqual(uncertainResolution.request.findings.map((finding) => finding.findingId), [uncertainId]);
  assert.equal(
    validatePrivateGenreSoulAmbiguousSurfaceRequest(uncertainResolution.requestBytes).sha256,
    uncertainResolution.requestSha256,
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
