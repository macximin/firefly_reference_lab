import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  PRIVATE_GENRE_SOUL_AMBIGUOUS_SURFACE_DECISION_SCHEMA,
  PRIVATE_GENRE_SOUL_AMBIGUOUS_SURFACE_REQUEST_SCHEMA,
  buildPrivateGenreSoulAmbiguousSurfaceDecision,
  buildPrivateGenreSoulAmbiguousSurfaceRequest,
  computeGenreSoulSurfaceSampleSetSha256,
  computeGenreSoulSurfaceSourceSetSha256,
  evaluateGenreSoulSurfaceHil,
  resolveGenreSoulSurfaceHilDecision,
  validatePrivateGenreSoulAmbiguousSurfaceDecision,
  validatePrivateGenreSoulAmbiguousSurfaceRequest,
} from "../tools/genre-soul-surface-hil-lib.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const digest = (label) => sha256(Buffer.from(label));

function evaluate(candidate, privateSamples = [], overrides = {}) {
  const selectionBindings = overrides.selectionBindings ?? [{
    sourceId: "gdrive-a",
    sourceSha256: digest("gdrive-a-source"),
    title: "재벌집 막내아들",
    author: "검은필명",
  }];
  const samples = overrides.privateSamples ?? privateSamples;
  return evaluateGenreSoulSurfaceHil({
    stage: "profile",
    genre: "modern-fantasy-ko",
    soulId: "male-modern-fantasy-ko",
    inputDigest: digest("input"),
    candidatePath: "analyses/genre_souls/male-modern-fantasy-ko/v1/genre-profile.json",
    candidate,
    selectionBindings,
    privateSamples: samples,
    sourceSetSha256: computeGenreSoulSurfaceSourceSetSha256(selectionBindings),
    sampleSetSha256: computeGenreSoulSurfaceSampleSetSha256(samples),
    ...overrides,
  });
}

test("high-confidence selection identities, adjacent roles and honorifics, and explicit organizations block", () => {
  for (const candidate of [
    { guidance: "재벌집 막내아들의 보상 구조를 따른다" },
    { guidance: "검은필명의 표면을 따른다" },
  ]) {
    const result = evaluate(candidate);
    assert.equal(result.status, "blocked");
    assert.equal(result.blockers[0].rule, "exact-selection-identity/v1");
    assert.equal(result.request, null);
  }

  const cases = [
    ["김광은 회장으로 취임했다.", "김광 방식은 저항을 보상으로 바꾼다", "adjacent-role-or-honorific/v1"],
    ["회장 박준은 인수를 결정했다.", "박준 방식은 저항을 보상으로 바꾼다", "adjacent-role-or-honorific/v1"],
    ["김광 씨가 계약을 뒤집었다.", "김광 방식은 저항을 보상으로 바꾼다", "adjacent-role-or-honorific/v1"],
    ["태성그룹이라는 회사가 인수를 준비했다.", "태성 방식은 저항을 보상으로 바꾼다", "explicit-organization-structure/v1"],
    ["태성 본사는 인수를 준비했다.", "태성 방식은 저항을 보상으로 바꾼다", "explicit-organization-structure/v1"],
  ];
  for (const [index, [sourceText, prose, rule]] of cases.entries()) {
    const result = evaluate({ guidance: prose }, [{ sampleId: `sample-${index}`, sourceText }]);
    assert.equal(result.status, "blocked", sourceText);
    assert.equal(result.blockers.some((blocker) => blocker.rule === rule), true, sourceText);
    assert.equal(result.request, null);
  }
});

test("unanchored organization-stem overlaps route to organization HIL without becoming hard identity blocks", () => {
  for (const [index, [sourceText, prose]] of [
    ["계약기업은 별도 심사를 받았다.", "계약 절차는 저항 해소 순서를 바꾼다"],
    ["사업 회사는 다른 시장을 맡았다.", "사업 구조는 선택의 보상을 바꾼다"],
    ["재무분석그룹은 보고서를 제출했다.", "재무분석 결과는 다음 행동을 바꾼다"],
    ["시장분석 회사는 자료를 모았다.", "시장분석 결과는 보상 회수 순서를 바꾼다"],
  ].entries()) {
    const result = evaluate(
      { mechanism: prose },
      [{ sampleId: `sample-generic-org-stem-${index}`, sourceText }],
    );
    assert.equal(result.status, "pending_hil", sourceText);
    assert.equal(result.blockers.length, 0, sourceText);
    assert.equal(result.request.findings.length, 1, sourceText);
    assert.equal(result.request.findings[0].rule, "bare-organization-stem-overlap/v1", sourceText);
  }

  const reverse = evaluate(
    { mechanism: "재무분석회사는 별도 지표를 사용한다" },
    [{ sampleId: "sample-generic-org-reverse", sourceText: "재무분석 결과가 선택을 바꿨다." }],
  );
  assert.equal(reverse.status, "pending_hil");
  assert.equal(reverse.request.findings[0].rule, "bare-organization-stem-overlap/v1");

  // v2 does not guess that an unanchored bare homonym refers back to the
  // organization; it binds that uncertainty to an explicit owner finding.
  const unanchoredNameLikeStem = evaluate(
    { mechanism: "청운 결과는 보상 회수 순서를 바꾼다" },
    [{ sampleId: "sample-unanchored-org-stem", sourceText: "청운그룹은 보고서를 냈다." }],
  );
  assert.equal(unanchoredNameLikeStem.status, "pending_hil");
  assert.equal(
    unanchoredNameLikeStem.request.findings[0].rule,
    "bare-organization-stem-overlap/v1",
  );

  const exactFull = evaluate(
    { mechanism: "계약기업 방식은 저항 해소 순서를 바꾼다" },
    [{ sampleId: "sample-generic-org-full", sourceText: "계약기업은 별도 심사를 받았다." }],
  );
  assert.equal(exactFull.status, "blocked");
  assert.equal(
    exactFull.blockers.some((blocker) => blocker.rule === "explicit-organization-structure/v1"),
    true,
  );
});

test("organization stems require structure or identity attribution on both sides", () => {
  for (const [index, [sourceText, prose]] of [
    ["태성그룹은 인수를 준비했다.", "태성 방식은 저항 해소 순서를 바꾼다"],
    ["태성 방식은 인수를 먼저 검토했다.", "태성그룹은 저항 해소 순서를 바꾼다"],
    ["태성그룹은 인수를 준비했다.", "태성의 자원 회수 순서는 다르다"],
    ["청운분석그룹은 보고서를 냈다.", "청운분석 전략은 보상 회수 순서를 바꾼다"],
  ].entries()) {
    const result = evaluate(
      { mechanism: prose },
      [{ sampleId: `sample-org-context-${index}`, sourceText }],
    );
    assert.equal(result.status, "blocked", sourceText);
    assert.equal(
      result.blockers.some((blocker) => blocker.rule === "explicit-organization-structure/v1"),
      true,
    );
  }

  for (const [index, sourceText] of [
    "태성, 본사는 다음 인수를 준비했다.",
    "태성. 회사는 다음 인수를 준비했다.",
    "태성\n본사는 다음 인수를 준비했다.",
    "태성\r\n회사는 다음 인수를 준비했다.",
  ].entries()) {
    const result = evaluate(
      { mechanism: "태성 결과는 보상 회수 순서를 바꾼다" },
      [{ sampleId: `sample-org-punctuation-${index}`, sourceText }],
    );
    assert.equal(result.status, "pass", sourceText);
  }
});

test("a confirmed source organization full form blocks candidate separator reconstruction asymmetrically", () => {
  for (const [index, [sourceText, prose]] of [
    ["태성그룹은 인수를 준비했다.", "태성, 그룹 방식은 저항 해소 순서를 바꾼다"],
    ["태성 그룹은 인수를 준비했다.", "태성. 그룹 방식은 저항 해소 순서를 바꾼다"],
    ["태성그룹은 인수를 준비했다.", "태성\n그룹 방식은 저항 해소 순서를 바꾼다"],
    ["태성그룹은 인수를 준비했다.", "태성\r\n그룹 방식은 저항 해소 순서를 바꾼다"],
  ].entries()) {
    const result = evaluate(
      { mechanism: prose },
      [{ sampleId: `sample-org-full-reconstruction-${index}`, sourceText }],
    );
    assert.equal(result.status, "blocked", sourceText);
    assert.equal(
      result.blockers.some((blocker) => blocker.rule === "explicit-organization-structure/v1"),
      true,
    );
  }

  for (const [index, sourceText] of [
    "태성, 그룹은 인수를 준비했다.",
    "태성\n그룹은 인수를 준비했다.",
    "태성\r\n그룹은 인수를 준비했다.",
  ].entries()) {
    const result = evaluate(
      { mechanism: "태성그룹은 저항 해소 순서를 바꾼다" },
      [{ sampleId: `sample-source-separator-non-org-${index}`, sourceText }],
    );
    assert.equal(result.status, "pending_hil", sourceText);
    assert.equal(result.blockers.length, 0, sourceText);
    assert.equal(result.request.findings[0].rule, "bare-organization-stem-overlap/v1", sourceText);
  }
});

test("quoted private terms and identifier-shaped Latin overlaps remain protected without blocking lowercase general words", () => {
  for (const [sourceText, prose, rule] of [
    ["그들은 그 물건을 『검은 별』이라고 불렀다.", "검은 별 방식으로 보상을 회수한다", "quoted-private-identity/v1"],
    ["ACME_7은 비밀 법인이었다.", "ACME_7 방식으로 보상을 회수한다", "latin-private-identifier/v1"],
    ["FireFly9은 비밀 법인이었다.", "FireFly9 방식으로 보상을 회수한다", "latin-private-identifier/v1"],
  ]) {
    const result = evaluate({ guidance: prose }, [{ sampleId: `sample-${sha256(sourceText).slice(0, 8)}`, sourceText }]);
    assert.equal(result.status, "blocked", sourceText);
    assert.equal(result.blockers.some((blocker) => blocker.rule === rule), true, sourceText);
  }
  const lowercase = evaluate(
    { guidance: "shared mechanism changes the payoff" },
    [{ sampleId: "sample-lowercase", sourceText: "shared mechanism changes the pressure" }],
  );
  assert.equal(lowercase.status, "pass");
});

test("a candidate-side role anchor blocks when the private sample only has the bare overlap", () => {
  const result = evaluate(
    { mechanism: "박준 회장은 압박을 보상으로 바꾼다" },
    [{ sampleId: "sample-bare-park", sourceText: "박준은 움직였다." }],
  );
  assert.equal(result.status, "blocked");
  assert.equal(
    result.blockers.some((blocker) => blocker.rule === "adjacent-role-or-honorific/v1"),
    true,
  );
});

test("separated role adjacency does not turn a contract noun into a person", () => {
  for (const [sourceText, prose] of [
    ["검사 결과는 다음 선택을 바꿨다.", "결과 차이는 다음 선택을 바꾼다"],
    ["회장 권한은 계약 구조에서 나온다.", "권한 차이는 계약 구조를 바꾼다"],
  ]) {
    const result = evaluate(
      { mechanism: prose },
      [{ sampleId: `sample-${sha256(sourceText).slice(0, 8)}`, sourceText }],
    );
    assert.equal(result.status, "pass", sourceText);
  }
});

test("bare surname-shaped overlaps stay pending HIL without becoming person confidence", () => {
  for (const term of ["김광", "박준", "이동", "이용", "이행", "이탈", "김치", "공개"]) {
    const result = evaluate(
      { mechanism: `${term} 방식은 압박 회수 순서를 바꾼다` },
      [{ sampleId: `sample-${sha256(term).slice(0, 8)}`, sourceText: `${term}은 다음 보상을 바꾼다.` }],
    );
    assert.equal(result.status, "pending_hil", term);
    assert.equal(result.request.schemaVersion, PRIVATE_GENRE_SOUL_AMBIGUOUS_SURFACE_REQUEST_SCHEMA);
    assert.equal(result.request.schemaVersion, "private-genre-soul-ambiguous-surface-request/v2");
    assert.equal(result.request.gateVersion, "genre-soul-protected-surface-hil/v2");
    assert.equal(result.request.findings.length, 1);
    assert.equal(result.request.findings[0].normalizedTerm, term);
    assert.deepEqual(result.request.findings[0].candidateLocations, ["$.mechanism"]);
    assert.equal(Buffer.isBuffer(result.requestBytes), true);
    assert.equal(result.requestSha256, sha256(result.requestBytes));
    assert.equal(validatePrivateGenreSoulAmbiguousSurfaceRequest(result.requestBytes).sha256, result.requestSha256);
  }
});

test("surname and organization-stem findings deduplicate by rule in one v2 owner request", () => {
  const result = evaluate(
    { mechanism: "김광 결과는 보상 회수 순서를 바꾼다" },
    [
      { sampleId: "sample-mixed-bare", sourceText: "김광은 다음 결과를 확인했다." },
      { sampleId: "sample-mixed-org", sourceText: "김광그룹은 별도 보고서를 냈다." },
    ],
  );
  assert.equal(result.status, "pending_hil");
  assert.equal(result.request.findings.length, 2);
  const byRule = new Map(result.request.findings.map((finding) => [finding.rule, finding]));
  assert.deepEqual(
    [...byRule.keys()].sort(),
    [
      "bare-korean-surname-shaped-2-4-overlap/v1",
      "bare-organization-stem-overlap/v1",
    ],
  );
  assert.equal(byRule.get("bare-korean-surname-shaped-2-4-overlap/v1").normalizedTerm, "김광");
  assert.equal(byRule.get("bare-organization-stem-overlap/v1").normalizedTerm, "김광");
  assert.deepEqual(
    byRule.get("bare-organization-stem-overlap/v1").privateSampleRefs,
    ["sample-mixed-org"],
  );

  const requestPath = `exports/genre-souls/male-modern-fantasy-ko/v1/surface-hil/requests/${result.requestSha256}.json`;
  const approved = buildPrivateGenreSoulAmbiguousSurfaceDecision({
    request: result.requestBytes,
    requestPath,
    findingDecisions: result.request.findings.map((finding) => ({
      findingId: finding.findingId,
      decision: "generic-overlap-approved",
    })),
    decidedByActorId: "owner:local",
    decidedByRole: "owner",
    decidedAt: "2026-08-30T04:00:00.000Z",
  });
  assert.equal(resolveGenreSoulSurfaceHilDecision(result, {
    decision: approved.bytes,
    requestPath,
  }).status, "pass");
});

test("explicit contract ontology terms bypass only bare ambiguity routing", () => {
  for (const term of ["주인공", "선택", "성장", "지위", "권한", "압박", "보상", "행동"]) {
    const result = evaluate(
      { mechanism: `${term} 메커니즘은 지급 순서를 바꾼다` },
      [{ sampleId: `sample-${sha256(term).slice(0, 8)}`, sourceText: `${term} 구조가 다음 장면에서 달라진다.` }],
    );
    assert.equal(result.status, "pass", term);
  }
});

test("bare three- and four-syllable repetition stays ambiguous instead of becoming confidence", () => {
  for (const term of ["차도윤", "박물관"]) {
    const result = evaluate(
      { mechanism: `${term} 방식은 압박 회수 순서를 바꾼다` },
      [{ sampleId: `sample-${sha256(term).slice(0, 8)}`, sourceText: `${term}은 움직였다. ${term}은 다시 움직였다.` }],
    );
    assert.equal(result.status, "pending_hil", term);
    assert.equal(result.request.findings.some((finding) => finding.normalizedTerm === term), true);
    assert.deepEqual(result.blockers, []);
  }
});

test("name-final helper syllable plus particle stays ambiguous", () => {
  for (const [index, sourceText] of ["김철이는 먼저 움직였다.", "김철이가 먼저 움직였다.", "김철이를 먼저 불렀다."].entries()) {
    const result = evaluate(
      { mechanism: "김철 방식은 압박을 바꾼다" },
      [{ selectorId: `selector-name-helper-${index}`, sourceText }],
    );
    assert.equal(result.status, "pending_hil", sourceText);
  }
});

test("generic four-token mechanism passes when it has no two-syllable ambiguity", () => {
  const phrase = "압박 보상 행동 저항";
  const result = evaluate(
    { mechanism: phrase },
    [{ sampleId: "sample-four-token", sourceText: phrase }],
  );
  assert.equal(result.status, "pass");
});

test("an exact copied private surface of five or more tokens blocks", () => {
  const result = evaluate(
    { guidance: "계약을 뒤집어 현금을 즉시 확보했다 이후 보상을 공개한다" },
    [{
      sampleId: "sample-copy",
      sourceText: "그는 계약을 뒤집어 현금을 즉시 확보했다 이후에는 곧장 떠났다.",
    }],
  );
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.blockers, [{
    rule: "exact-private-surface-copy/v1",
    candidateLocation: "$.guidance",
    evidenceRef: "sample-copy",
    tokenCount: 5,
  }]);
  assert.equal(result.request, null);
});

test("request construction is deterministic, sorted, deduplicated, and content-bound", () => {
  const first = evaluate(
    {
      z: "김광 방식과 공개 방식을 비교한다",
      a: ["공개 방식", "김광 방식", "김광 방식"],
    },
    [
      { sampleId: "sample-z", sourceText: "공개는 늦었다. 김광은 먼저 갔다." },
      { sampleId: "sample-a", sourceText: "김광은 돌아왔다. 공개는 빨랐다." },
      { sampleId: "sample-z", sourceText: "공개는 늦었다. 김광은 먼저 갔다." },
    ],
  );
  const second = evaluate(
    {
      z: "김광 방식과 공개 방식을 비교한다",
      a: ["공개 방식", "김광 방식", "김광 방식"],
    },
    [
      { sampleId: "sample-a", sourceText: "김광은 돌아왔다. 공개는 빨랐다." },
      { sampleId: "sample-z", sourceText: "공개는 늦었다. 김광은 먼저 갔다." },
    ],
  );
  assert.equal(first.status, "pending_hil");
  assert.equal(second.status, "pending_hil");
  assert.deepEqual(first.request, second.request);
  assert.equal(first.requestBytes.equals(second.requestBytes), true);
  assert.equal(first.requestSha256, second.requestSha256);
  assert.deepEqual(
    first.request.findings.map((finding) => finding.findingId),
    [...first.request.findings.map((finding) => finding.findingId)].sort(),
  );
  const byTerm = new Map(first.request.findings.map((finding) => [finding.normalizedTerm, finding]));
  assert.deepEqual(byTerm.get("김광").candidateLocations, ["$.a[1]", "$.a[2]", "$.z"]);
  assert.deepEqual(byTerm.get("김광").privateSampleRefs, ["sample-a", "sample-z"]);
  assert.deepEqual(byTerm.get("공개").candidateLocations, ["$.a[0]", "$.z"]);
  assert.deepEqual(byTerm.get("공개").privateSampleRefs, ["sample-a", "sample-z"]);

  const rebuilt = buildPrivateGenreSoulAmbiguousSurfaceRequest({
    stage: first.request.stage,
    genre: first.request.genre,
    soulId: first.request.soulId,
    inputDigest: first.request.inputDigest,
    candidate: first.request.candidate,
    privateEvidence: first.request.privateEvidence,
    findings: [...first.request.findings].reverse().map((finding) => ({
      rule: finding.rule,
      normalizedTerm: finding.normalizedTerm,
      candidateLocations: [...finding.candidateLocations].reverse(),
      privateSampleRefs: [...finding.privateSampleRefs].reverse(),
    })),
  });
  assert.equal(rebuilt.bytes.equals(first.requestBytes), true);
  assert.equal(rebuilt.sha256, first.requestSha256);

  const drifted = evaluate(
    { z: "김광 방식과 공개 방식은 서로 다르다", a: ["공개 방식", "김광 방식", "김광 방식"] },
    second.request.findings.length > 0
      ? [
          { sampleId: "sample-a", sourceText: "김광은 돌아왔다. 공개는 빨랐다." },
          { sampleId: "sample-z", sourceText: "공개는 늦었다. 김광은 먼저 갔다." },
        ]
      : [],
  );
  assert.notEqual(drifted.requestSha256, first.requestSha256);
});

test("malformed and non-canonical requests are rejected", () => {
  const result = evaluate(
    { mechanism: "김광 방식은 압박을 바꾼다" },
    [{ selectorId: "selector-a", sourceText: "김광은 움직였다." }],
  );
  assert.equal(result.status, "pending_hil");

  const cases = [
    (request) => { request.extra = true; },
    (request) => { request.schemaVersion = "private-genre-soul-ambiguous-surface-request/v1"; },
    (request) => { request.gateVersion = "genre-soul-protected-surface-hil/v1"; },
    (request) => { request.stage = "draft"; },
    (request) => { request.soulId = "male-fantasy-ko"; },
    (request) => { request.candidate.sha256 = "0".repeat(64); },
    (request) => { request.privateEvidence.sampleSetSha256 = "bad"; },
    (request) => { request.findings[0].findingId = `surface-finding-${"0".repeat(24)}`; },
    (request) => { request.findings[0].rule = "unknown-overlap/v1"; },
    (request) => { request.findings[0].normalizedTerm = "차도윤"; },
    (request) => { request.findings[0].candidateLocations = ["$.z", "$.a"]; },
    (request) => { request.findings[0].privateSampleRefs = ["raw prose is forbidden"]; },
    (request) => { request.findings[0].rawProse = "원문"; },
  ];
  for (const mutate of cases) {
    const request = structuredClone(result.request);
    mutate(request);
    assert.throws(() => validatePrivateGenreSoulAmbiguousSurfaceRequest(request));
  }

  assert.throws(
    () => validatePrivateGenreSoulAmbiguousSurfaceRequest(JSON.stringify(result.request)),
    /not canonical/u,
  );
  assert.throws(
    () => validatePrivateGenreSoulAmbiguousSurfaceRequest(Buffer.from([0xff, 0xfe])),
    /UTF-8/u,
  );
});

test("owner decisions bind the exact request and completely resolve approve or reject outcomes", () => {
  const pending = evaluate(
    { mechanism: "김광 방식과 공개 방식은 서로 다르다" },
    [{ selectorId: "selector-a", sourceText: "김광은 움직였다. 공개는 늦었다." }],
  );
  assert.equal(pending.status, "pending_hil");
  const requestPath = `exports/genre-souls/male-modern-fantasy-ko/v1/surface-hil/requests/${pending.requestSha256}.json`;
  const build = (action) => buildPrivateGenreSoulAmbiguousSurfaceDecision({
    request: pending.requestBytes,
    requestPath,
    findingDecisions: pending.request.findings.map((finding) => ({
      findingId: finding.findingId,
      decision: action,
    })),
    decidedByActorId: "owner:local",
    decidedByRole: "owner",
    decidedAt: "2026-08-30T04:00:00.000Z",
  });

  const approved = build("generic-overlap-approved");
  assert.equal(approved.decision.schemaVersion, PRIVATE_GENRE_SOUL_AMBIGUOUS_SURFACE_DECISION_SCHEMA);
  assert.equal(approved.decision.schemaVersion, "private-genre-soul-ambiguous-surface-decision/v2");
  assert.equal(approved.decision.outcome, "approved");
  assert.equal(
    validatePrivateGenreSoulAmbiguousSurfaceDecision(approved.bytes, {
      request: pending.requestBytes,
      requestPath,
    }).sha256,
    approved.sha256,
  );
  const approvedResolution = resolveGenreSoulSurfaceHilDecision(pending, {
    decision: approved.bytes,
    requestPath,
  });
  assert.equal(approvedResolution.status, "pass");
  assert.equal(approvedResolution.decision.decisionId, approved.decision.decisionId);

  const rejected = build("protected-reject");
  const rejectedResolution = resolveGenreSoulSurfaceHilDecision(pending, {
    decision: rejected.bytes,
    requestPath,
  });
  assert.equal(rejectedResolution.status, "blocked");
  assert.equal(rejectedResolution.blockers.length, pending.request.findings.length);

  assert.throws(() => build("polish-retry"), /finding decision is invalid/u);
});

test("surface owner decisions reject stale, partial, non-owner, non-canonical, and self-reidentified bytes", () => {
  const pending = evaluate(
    { mechanism: "김광 방식과 공개 방식은 서로 다르다" },
    [{ selectorId: "selector-a", sourceText: "김광은 움직였다. 공개는 늦었다." }],
  );
  const requestPath = `exports/genre-souls/male-modern-fantasy-ko/v1/surface-hil/requests/${pending.requestSha256}.json`;
  const input = {
    request: pending.requestBytes,
    requestPath,
    findingDecisions: pending.request.findings.map((finding) => ({
      findingId: finding.findingId,
      decision: "generic-overlap-approved",
    })),
    decidedByActorId: "owner:local",
    decidedByRole: "owner",
    decidedAt: "2026-08-30T04:00:00.000Z",
  };
  assert.throws(
    () => buildPrivateGenreSoulAmbiguousSurfaceDecision({
      ...input,
      findingDecisions: input.findingDecisions.slice(1),
    }),
    /exact request finding set/u,
  );
  assert.throws(
    () => buildPrivateGenreSoulAmbiguousSurfaceDecision({ ...input, decidedByRole: "manager" }),
    /owner role/u,
  );
  const built = buildPrivateGenreSoulAmbiguousSurfaceDecision(input);
  const driftCases = [
    (decision) => { decision.schemaVersion = "private-genre-soul-ambiguous-surface-decision/v1"; },
    (decision) => { decision.gateVersion = "genre-soul-protected-surface-hil/v1"; },
    (decision) => { decision.request.sha256 = digest("stale-request"); },
    (decision) => { decision.candidate.sha256 = digest("stale-candidate"); },
    (decision) => { decision.privateEvidence.sampleSetSha256 = digest("stale-sample"); },
    (decision) => { decision.findingDecisions[0].decision = "protected-reject"; },
    (decision) => { decision.decidedBy.role = "manager"; },
    (decision) => { decision.authority.mayPromoteSoul = true; },
  ];
  for (const mutate of driftCases) {
    const decision = structuredClone(built.decision);
    mutate(decision);
    assert.throws(() => validatePrivateGenreSoulAmbiguousSurfaceDecision(decision, {
      request: pending.requestBytes,
      requestPath,
    }));
  }
  assert.throws(
    () => validatePrivateGenreSoulAmbiguousSurfaceDecision(JSON.stringify(built.decision), {
      request: pending.requestBytes,
      requestPath,
    }),
    /not canonical/u,
  );
  assert.throws(
    () => resolveGenreSoulSurfaceHilDecision(pending, {
      decision: built.bytes,
      requestPath: `${requestPath}.stale`,
    }),
    /exact request/u,
  );
});

test("candidateBytes bind the exact candidate bytes and invalid boundary inputs fail closed", () => {
  const candidateBytes = Buffer.from('{"mechanism":"김광 방식"}\n');
  const result = evaluateGenreSoulSurfaceHil({
    stage: "manager-qa",
    genre: "fantasy-ko",
    soulId: "male-fantasy-ko",
    inputDigest: digest("manager-input"),
    candidatePath: "analyses/genre_souls/male-fantasy-ko/v1/manager-qa.json",
    candidateBytes,
    selectionBindings: [],
    privateSamples: [{ privateRef: "raw/sample-1", sourceText: "김광은 움직였다." }],
    sourceSetSha256: computeGenreSoulSurfaceSourceSetSha256([]),
    sampleSetSha256: computeGenreSoulSurfaceSampleSetSha256([
      { privateRef: "raw/sample-1", sourceText: "김광은 움직였다." },
    ]),
  });
  assert.equal(result.status, "pending_hil");
  assert.equal(result.candidate.sha256, sha256(candidateBytes));
  assert.equal(result.candidate.sizeBytes, candidateBytes.byteLength);
  assert.equal(result.request.stage, "manager-qa");

  assert.throws(() => evaluateGenreSoulSurfaceHil({
    stage: "profile",
    genre: "modern-fantasy-ko",
    soulId: "male-modern-fantasy-ko",
    inputDigest: digest("bad"),
    candidatePath: "analyses/genre_souls/male-modern-fantasy-ko/v1/genre-profile.json",
    candidate: { mechanism: "김광" },
    candidateBytes,
    selectionBindings: [],
    privateSamples: [],
    sourceSetSha256: computeGenreSoulSurfaceSourceSetSha256([]),
    sampleSetSha256: computeGenreSoulSurfaceSampleSetSha256([]),
  }), /exactly one/u);
  assert.throws(() => evaluateGenreSoulSurfaceHil({
    stage: "profile",
    genre: "modern-fantasy-ko",
    soulId: "male-fantasy-ko",
    inputDigest: digest("bad"),
    candidatePath: "analyses/genre_souls/male-modern-fantasy-ko/v1/genre-profile.json",
    candidate: { mechanism: "generic" },
    selectionBindings: [],
    privateSamples: [],
    sourceSetSha256: computeGenreSoulSurfaceSourceSetSha256([]),
    sampleSetSha256: computeGenreSoulSurfaceSampleSetSha256([]),
  }), /does not match/u);
  assert.throws(() => evaluateGenreSoulSurfaceHil({
    stage: "profile",
    genre: "modern-fantasy-ko",
    soulId: "male-modern-fantasy-ko",
    inputDigest: digest("bad-path"),
    candidatePath: "../outside.json",
    candidate: { mechanism: "generic" },
    selectionBindings: [],
    privateSamples: [],
    sourceSetSha256: computeGenreSoulSurfaceSourceSetSha256([]),
    sampleSetSha256: computeGenreSoulSurfaceSampleSetSha256([]),
  }), /safe relative path/u);
});

test("evaluation recomputes canonical source and exact-byte sample set digests", () => {
  const bindings = [{
    sourceId: "gdrive-z",
    sourceSha256: digest("source-z"),
    title: "제목 Z",
    author: "필명 Z",
  }, {
    sourceId: "gdrive-a",
    sourceSha256: digest("source-a"),
    title: "제목 A",
    author: "필명 A",
  }];
  const samples = [
    { selectorId: "selector-z", sourceText: "김광은 움직였다.\r\n" },
    { selectorId: "selector-a", sourceText: "박준은 멈췄다.\n" },
  ];
  assert.equal(
    computeGenreSoulSurfaceSourceSetSha256(bindings),
    computeGenreSoulSurfaceSourceSetSha256([...bindings].reverse()),
  );
  assert.equal(
    computeGenreSoulSurfaceSampleSetSha256(samples),
    computeGenreSoulSurfaceSampleSetSha256([...samples].reverse()),
  );
  assert.notEqual(
    computeGenreSoulSurfaceSampleSetSha256(samples),
    computeGenreSoulSurfaceSampleSetSha256([
      { selectorId: "selector-z", sourceText: "김광은 움직였다.\n" },
      samples[1],
    ]),
  );

  assert.throws(() => evaluateGenreSoulSurfaceHil({
    stage: "profile",
    genre: "modern-fantasy-ko",
    soulId: "male-modern-fantasy-ko",
    inputDigest: digest("digest-check"),
    candidatePath: "analyses/genre_souls/male-modern-fantasy-ko/v1/genre-profile.json",
    candidate: { mechanism: "김광 방식" },
    selectionBindings: bindings,
    privateSamples: samples,
    sourceSetSha256: digest("stale-source-set"),
    sampleSetSha256: computeGenreSoulSurfaceSampleSetSha256(samples),
  }), /source-set SHA-256/u);
  assert.throws(() => evaluateGenreSoulSurfaceHil({
    stage: "profile",
    genre: "modern-fantasy-ko",
    soulId: "male-modern-fantasy-ko",
    inputDigest: digest("digest-check"),
    candidatePath: "analyses/genre_souls/male-modern-fantasy-ko/v1/genre-profile.json",
    candidate: { mechanism: "김광 방식" },
    selectionBindings: bindings,
    privateSamples: samples,
    sourceSetSha256: computeGenreSoulSurfaceSourceSetSha256(bindings),
    sampleSetSha256: digest("stale-sample-set"),
  }), /sample-set SHA-256/u);
});
