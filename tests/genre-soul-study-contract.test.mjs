import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { buildGenreSoulSourceRegistry } from "../tools/genre-soul-source-registry.mjs";
import {
  assertFullByteCoverage,
  computeCommercialMechanismSignature,
  computePrimaryCommercialEngineSignature,
  computeTrackedProjectionObservedSourceSetSha256,
  scanTrackedProjection,
  scanTrackedProjectionBytes,
  validateDeepReadArtifact,
  validateGenreProfileArtifact,
  validateManagerQaReceipt,
  validatePromotionEligibility,
  validateSurveyArtifact,
} from "../tools/genre-soul-study-contract.mjs";

const hash = (character) => character.repeat(64);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const sourceText = "주인공은 회사를 샀다. 경쟁자는 계약을 막았다. 주인공은 현금과 지분으로 보상을 받았다. ".repeat(20);
const profileSourceIds = ["gdrive-commercial", "gdrive-breadth", "gdrive-surface"];
const profileDimensions = [
  "worldConstraints",
  "protagonistRepeatedVerbs",
  "pressureAndOpposition",
  "rewardAndStatusCurrency",
  "nextChapterExpectedAction",
  "commercialEngines",
  "emotionalCoherence",
  "arcAndGrowth",
  "failurePatterns",
];

function boundReference(path, character, sizeBytes = 100) {
  return { path, sha256: hash(character), sizeBytes };
}

function profileEvidence(sourceId, suffix, options = {}) {
  const item = {
    sourceId,
    observationId: `obs-${sourceId.slice("gdrive-".length)}-${suffix}`,
    segmentId: "s0001",
    kind: options.kind ?? "commercial-engine",
    selectors: [{ type: "utf8-byte", startByte: options.startByte ?? 10, endByte: options.endByte ?? 20 }],
  };
  if (options.span) item.span = options.span;
  return item;
}

function makeGenreProfile() {
  const soulId = "male-modern-fantasy-ko";
  const sources = profileSourceIds.map((sourceId, index) => ({
    sourceId,
    selectionBasis: ["commercial-anchor", "genre-breadth", "surface-anchor"][index],
    sourceSha256: hash(["1", "2", "3"][index]),
    sourceSizeBytes: 1_000,
    chapterCount: 100 + index,
    trackedStudy: boundReference(`analyses/genre_souls/${soulId}/v1/work-studies/${sourceId}.deep-read.json`, "4"),
    privateBundle: boundReference(`exports/genre-souls/${soulId}/v1/deep-read-runs/${sourceId}/deep-read-receipt.json`, "5"),
    trackedLeakReceipt: boundReference(`analyses/genre_souls/${soulId}/v1/leak-scan-receipts/${sourceId}.deep-read.json`, "6"),
  }));
  const patterns = profileDimensions.map((dimension, index) => {
    const classification = dimension === "failurePatterns" ? "failure" : "genre-common";
    return {
      patternId: `pattern-${String(index + 1).padStart(2, "0")}`,
      dimension,
      classification,
      guidance: `${dimension} 지침`,
      commercialFunction: `${dimension} 상업 기능`,
      sourceIds: [...profileSourceIds].sort(),
      evidence: profileSourceIds.map((sourceId, sourceIndex) => profileEvidence(sourceId, `p${index}-${sourceIndex}`, {
        kind: dimension === "failurePatterns" ? "failure-pattern" : "commercial-engine",
        startByte: 10 + (index * 30),
        endByte: 20 + (index * 30),
      })),
    };
  });
  const primaryCommercialEngines = profileSourceIds.map((sourceId, sourceIndex) => {
    const mechanism = {
      protagonistRepeatedVerb: `행동 ${sourceIndex + 1}`,
      pressure: `압박 ${sourceIndex + 1}`,
      activeChoice: `선택 ${sourceIndex + 1}`,
      resistance: `저항 ${sourceIndex + 1}`,
      payoff: `지급 ${sourceIndex + 1}`,
      recognition: `인정 ${sourceIndex + 1}`,
    };
    const signatureSha256 = computePrimaryCommercialEngineSignature(sourceId, mechanism);
    return {
      engineId: `engine-${signatureSha256.slice(0, 24)}`,
      sourceId,
      mechanism,
      signatureSha256,
      evidence: ["early", "middle", "late"].map((span, spanIndex) => profileEvidence(sourceId, `e${sourceIndex}-${span}`, {
        span,
        startByte: 400 + (spanIndex * 30),
        endByte: 410 + (spanIndex * 30),
      })),
    };
  });
  return {
    schemaVersion: "genre-soul-analysis-profile/v1",
    state: "candidate",
    genre: "modern-fantasy-ko",
    soulId,
    version: "v1",
    generatedAt: "2026-08-29T12:00:00.000Z",
    evidenceSet: {
      managerSelection: boundReference("evidence/genre-souls/male-manager-selection.v1.json", "7"),
      inventory: boundReference("evidence/genre-souls/male-source-inventory.v1.json", "8"),
      registryReceipt: {
        ...boundReference("evidence/genre-souls/male-source-registry-receipt.v1.json", "9"),
        privateRegistrySha256: hash("a"),
      },
      sources,
    },
    synthesis: {
      privateInput: {
        schemaVersion: "private-genre-soul-profile-input/v1",
        path: `exports/genre-souls/${soulId}/v1/profile-runs/${hash("b")}/genre/input.json`,
        sha256: hash("c"),
        sizeBytes: 10_000,
        sourceIds: [...profileSourceIds].sort(),
        observationCount: 300,
        selectorCount: 500,
      },
      run: {
        runId: "profile-run-1",
        model: "gpt-5.6-sol",
        provider: "openai-codex",
        reasoningEffort: "high",
        configSha256: hash("d"),
        traceReceiptSha256: hash("e"),
      },
      contentContract: {
        id: "fiction-content-neutral-ko/v1",
        sha256: "c5b531577cbfbfb1dfc4cd2b5cb82d7ce796c6958e0bc00c3e180b0e5440e199",
      },
      truncation: false,
    },
    patterns,
    primaryCommercialEngines,
    dimensions: Object.fromEntries(patterns.map((pattern) => [pattern.dimension, [pattern.patternId]])),
    contentNeutrality: {
      automaticMoralGate: false,
      illegalityIsAutomaticFailure: false,
      userIntensityPreserved: true,
    },
    authority: {
      scope: "analysis-only",
      mayWriteInkOSCanon: false,
      mayPromoteSoul: false,
      ownerDecisionRequired: true,
    },
  };
}

function makeManagerQaReceipt() {
  const profile = makeGenreProfile();
  const sourceIds = profile.evidenceSet.sources.map((source) => source.sourceId).sort();
  const engines = new Map(profile.primaryCommercialEngines.map((engine) => [engine.sourceId, engine]));
  const sources = sourceIds.map((sourceId, sourceIndex) => {
    const engine = engines.get(sourceId);
    return {
      sourceId,
      sourceSizeBytes: 1_000,
      engineId: engine.engineId,
      engineSignatureSha256: engine.signatureSha256,
      mechanismSignatureSha256: computeCommercialMechanismSignature(engine.mechanism),
      samples: ["early", "middle", "late"].map((span, spanIndex) => ({
        span,
        observationId: `obs-${sourceId.slice("gdrive-".length)}-qa-${span}`,
        kind: ["commercial-engine", "protagonist-action", "payoff-witness"][spanIndex],
        selector: {
          type: "utf8-byte",
          startByte: 100 + (sourceIndex * 100) + (spanIndex * 20),
          endByte: 110 + (sourceIndex * 100) + (spanIndex * 20),
        },
        sliceSha256: hash(["1", "2", "3"][spanIndex]),
      })),
    };
  });
  const engineComparisons = [];
  for (let leftIndex = 0; leftIndex < sourceIds.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < sourceIds.length; rightIndex += 1) {
      const leftSourceId = sourceIds[leftIndex];
      const rightSourceId = sourceIds[rightIndex];
      const pair = `${leftSourceId}::${rightSourceId}`;
      engineComparisons.push({
        comparisonId: `comparison-${sha256(pair).slice(0, 24)}`,
        leftSourceId,
        rightSourceId,
        leftEngineId: engines.get(leftSourceId).engineId,
        rightEngineId: engines.get(rightSourceId).engineId,
        verdict: "different",
        semanticDifference: "압박을 자산으로 전환하는 반복 행동과 저항 해소 방식이 다르다.",
        commercialConsequence: "독자가 기대하는 지급 주기와 다음 행동 약속이 서로 다르다.",
      });
    }
  }
  return {
    schemaVersion: "genre-soul-manager-qa/v1",
    state: "candidate-qa-passed",
    genre: profile.genre,
    soulId: profile.soulId,
    version: "v1",
    profile: {
      path: `analyses/genre_souls/${profile.soulId}/v1/genre-profile.json`,
      sha256: hash("4"),
      sizeBytes: 10_000,
      synthesisRunId: profile.synthesis.run.runId,
      leakScanReceipt: boundReference(
        `analyses/genre_souls/${profile.soulId}/v1/leak-scan-receipts/genre-profile.json`,
        "5",
      ),
    },
    privateInput: {
      schemaVersion: "private-genre-soul-manager-qa-input/v1",
      path: `exports/genre-souls/${profile.soulId}/v1/manager-qa-runs/${hash("6")}/input.json`,
      sha256: hash("7"),
      sizeBytes: 20_000,
      sourceIds,
      rawSampleCount: 9,
    },
    manager: {
      actorId: "hermes:inkos_male_modern_fantasy:manager-qa-run-1",
      role: "manager",
      runId: "manager-qa-run-1",
      model: "gpt-5.6-sol",
      provider: "openai-codex",
      reasoningEffort: "high",
      configSha256: hash("8"),
      traceReceiptSha256: hash("9"),
      outputSha256: hash("a"),
    },
    decidedAt: "2026-08-29T15:00:00.000Z",
    sources,
    engineComparisons,
    checks: {
      profileEvidenceBinding: true,
      exactSourceCoverage: true,
      rawSampleReadback: true,
      primaryEnginesPairwiseDifferent: true,
      profileSurfaceLeakScanPassed: true,
      contentNeutrality: true,
    },
    contentNeutrality: {
      moralFitnessGate: false,
      automaticRewrite: false,
      userIntensityPreserved: true,
    },
    authority: {
      scope: "reference-lab-qa-only",
      mayWriteInkOSCanon: false,
      mayPromoteSoul: false,
      ownerDecisionRequired: true,
    },
    result: "pass",
  };
}

function makeCurrentManagerQaReceipt(surfaceMode = "deterministic-clean") {
  const receipt = makeManagerQaReceipt();
  receipt.schemaVersion = "genre-soul-manager-qa/v2";
  receipt.privateInput.schemaVersion = "private-genre-soul-manager-qa-input/v2";
  receipt.manager.inputDigest = hash("b");
  const structuredRoot = `${receipt.privateInput.path.slice(0, -"/input.json".length)}/structured-runs/${receipt.manager.inputDigest}`;
  const surfaceRoot = `${structuredRoot}/surface-review`;
  const candidateBytes = jsonBytes({
    schemaVersion: "genre-soul-manager-surface-candidate/v1",
    genre: receipt.genre,
    soulId: receipt.soulId,
    profile: {
      sha256: receipt.profile.sha256,
      synthesisRunId: receipt.profile.synthesisRunId,
    },
    manager: {
      runId: receipt.manager.runId,
      outputSha256: receipt.manager.outputSha256,
    },
    engineComparisons: receipt.engineComparisons,
  });
  const candidate = {
    path: `${surfaceRoot}/candidate.json`,
    sha256: sha256(candidateBytes),
    sizeBytes: candidateBytes.byteLength,
  };
  const authority = {
    scope: "reference-lab-analysis-surface-only",
    mayWriteInkOSCanon: false,
    mayPromoteSoul: false,
  };
  const deterministic = {
    status: "pass",
    privateEvidence: {
      sourceSetSha256: hash("c"),
      sampleSetSha256: hash("d"),
    },
    findingSetSha256: null,
    findingIds: [],
  };
  receipt.surfaceReview = {
    schemaVersion: "genre-soul-manager-surface-review-proof/v2",
    gateVersion: "genre-soul-protected-surface-hil/v3",
    extractorVersion: "genre-soul-surface-candidate-extractor/v3",
    mode: "deterministic-clean",
    candidate,
    deterministic,
    semantic: null,
    ownerDecision: null,
    authority,
  };
  if (surfaceMode === "deterministic-clean") return receipt;

  const findingId = `surface-finding-${"1".repeat(24)}`;
  const semanticInputSha256 = hash("e");
  const verdict = surfaceMode === "semantic-auto-passed" ? "generic-overlap" : "uncertain";
  const decision = {
    findingId,
    verdict,
    reasonCode: verdict === "generic-overlap" ? "common-lexeme" : "ambiguous-identity-use",
    evidenceWindowIds: [
      `surface-window-${"2".repeat(24)}`,
      `surface-window-${"3".repeat(24)}`,
    ],
  };
  const semanticResultBytes = jsonBytes({
    schemaVersion: "private-genre-soul-surface-semantic-review-result/v1",
    gateVersion: "genre-soul-protected-surface-hil/v3",
    stage: "manager-qa",
    genre: receipt.genre,
    soulId: receipt.soulId,
    inputDigest: receipt.manager.inputDigest,
    reviewRequestSha256: semanticInputSha256,
    findingDecisions: [decision],
    authority,
  });
  receipt.surfaceReview.deterministic = {
    ...deterministic,
    status: "pending_semantic_review",
    findingSetSha256: hash("f"),
    findingIds: [findingId],
  };
  receipt.surfaceReview.mode = surfaceMode;
  receipt.surfaceReview.semantic = {
    input: boundReference(`${surfaceRoot}/input.json`, "e", 1_000),
    result: {
      path: `${surfaceRoot}/semantic/accepted.json`,
      sha256: sha256(semanticResultBytes),
      sizeBytes: semanticResultBytes.byteLength,
    },
    receipt: boundReference(`${surfaceRoot}/semantic/accepted-host-receipt.json`, "1", 1_001),
    reviewer: {
      role: `genre-soul-surface-semantic-review:manager-qa:${semanticInputSha256.slice(0, 24)}`,
      runId: "manager-surface-review-run-1",
      model: "gpt-5.6-sol",
      provider: "openai-codex",
      reasoningEffort: "high",
      promptSha256: hash("2"),
    },
    findingDecisions: [decision],
    verdictCounts: {
      genericOverlap: verdict === "generic-overlap" ? 1 : 0,
      protectedIdentity: 0,
      uncertain: verdict === "uncertain" ? 1 : 0,
    },
    outcome: verdict === "generic-overlap" ? "auto-passed" : "owner-approved",
  };
  if (surfaceMode === "semantic-owner-approved") {
    const requestSha256 = hash("3");
    receipt.surfaceReview.ownerDecision = {
      request: boundReference(`${surfaceRoot}/owner-hil/requests/${requestSha256}.json`, "3", 1_002),
      decision: {
        ...boundReference(`${surfaceRoot}/owner-hil/decisions/${requestSha256}.json`, "4", 1_003),
        decisionId: `surface-decision-${"5".repeat(24)}`,
        outcome: "approved",
        decidedByRole: "owner",
      },
    };
  }
  return receipt;
}

function rebindPhaseAwareCandidate(receipt) {
  const candidateBytes = jsonBytes({
    schemaVersion: "genre-soul-manager-surface-candidate/v2",
    genre: receipt.genre,
    soulId: receipt.soulId,
    profile: {
      sha256: receipt.profile.sha256,
      synthesisRunId: receipt.profile.synthesisRunId,
    },
    manager: {
      runId: receipt.manager.runId,
      outputSha256: receipt.manager.outputSha256,
    },
    sourceEngineAssessments: receipt.sources.map((source) => ({
      sourceId: source.sourceId,
      collectiveAssessment: source.collectiveAssessment,
    })),
    engineComparisons: receipt.engineComparisons,
  });
  receipt.surfaceReview.candidate.sha256 = sha256(candidateBytes);
  receipt.surfaceReview.candidate.sizeBytes = candidateBytes.byteLength;
}

function makePhaseAwareManagerQaReceipt() {
  const receipt = makeCurrentManagerQaReceipt();
  receipt.schemaVersion = "genre-soul-manager-qa/v3";
  receipt.privateInput.schemaVersion = "private-genre-soul-manager-qa-input/v3";
  receipt.surfaceReview.schemaVersion = "genre-soul-manager-surface-review-proof/v3";
  const fieldsBySpan = {
    early: ["pressure", "protagonistRepeatedVerb"],
    middle: ["activeChoice", "resistance"],
    late: ["payoff", "recognition"],
  };
  for (const [sourceIndex, source] of receipt.sources.entries()) {
    const phaseSampleIds = {};
    for (const [sampleIndex, sample] of source.samples.entries()) {
      sample.sampleId = `sample-${sourceIndex}-${sampleIndex}`;
      sample.phaseContribution = "supports-phase";
      sample.supportedMechanismFields = fieldsBySpan[sample.span];
      phaseSampleIds[sample.span] = sample.sampleId;
    }
    source.collectiveAssessment = {
      phaseSampleIds,
      supportedMechanismFields: [
        "activeChoice", "payoff", "pressure", "protagonistRepeatedVerb", "recognition", "resistance",
      ],
      collectiveVerdict: "supported",
      rationale: "초중후 표본이 압박과 실행과 지급의 전체 순환을 지지한다.",
      commercialConsequence: "공통 독자 약속과 작품별 실행 변주가 함께 유지된다.",
    };
  }
  for (const comparison of receipt.engineComparisons) comparison.verdict = "shared-core";
  delete receipt.checks.primaryEnginesPairwiseDifferent;
  receipt.checks.phaseAwareCollectiveEvidenceComplete = true;
  receipt.checks.engineRelationsEvidenceComplete = true;
  rebindPhaseAwareCandidate(receipt);
  return receipt;
}

function makeManagerQaValidationContext(receipt, profile = makeGenreProfile()) {
  return {
    requireLiveBindings: true,
    expectedProfile: {
      artifact: profile,
      path: receipt.profile.path,
      sha256: receipt.profile.sha256,
      sizeBytes: receipt.profile.sizeBytes,
      leakScanReceipt: structuredClone(receipt.profile.leakScanReceipt),
    },
    expectedRunEvidence: {
      receipt: {
        profileId: "inkos_male_modern_fantasy",
        runId: receipt.manager.runId,
        ...(receipt.manager.inputDigest === undefined ? {} : { inputDigest: receipt.manager.inputDigest }),
        model: receipt.manager.model,
        provider: receipt.manager.provider,
        reasoningEffort: receipt.manager.reasoningEffort,
        profileConfigSha256: receipt.manager.configSha256,
        resultSha256: receipt.manager.outputSha256,
      },
      hostReceiptSha256: receipt.manager.traceReceiptSha256,
    },
  };
}

function makePromotionEligibility() {
  return {
    schemaVersion: "genre-soul-promotion-eligibility/v1",
    genre: "modern-fantasy-ko",
    status: "pass",
    deepReadSourceCount: 3,
    reviewPacketSchema: "firefly_review_packet/v2",
    blindPairCount: 3,
    independentBlindRunCount: 3,
    soulWins: 2,
    averageCommercialScore: 87,
    winningPairMinimumGain: 2.5,
    genreIdentityPassed: 3,
    contentNeutralViolationCount: 0,
    unauthorizedCanonWriteCount: 0,
    allSurfaceMatchesHumanClassified: true,
    canonLeakCount: 0,
    managerQaPassed: true,
    leakScanMatchCount: 0,
    ownerDecisionRequired: true,
    ownerDecisionId: null,
    deepReadReceiptSha256s: [hash("1"), hash("2"), hash("3")],
    reviewPacketSha256s: [hash("4"), hash("5"), hash("6")],
    blindReviewReceiptSha256s: [hash("7"), hash("8"), hash("9")],
    contentNeutralReceiptSha256s: [hash("a"), hash("b"), hash("c")],
    surfaceComparisonReceiptSha256s: [hash("d"), hash("e"), hash("f")],
    managerQaReceiptSha256: hash("a"),
    leakScanReceiptSha256: hash("b"),
    generationRunIds: ["generation-1", "generation-2", "generation-3", "generation-4", "generation-5", "generation-6"],
    blindRunIds: ["blind-1", "blind-2", "blind-3"],
    inputSha256s: [hash("a"), hash("b")],
    authority: {
      scope: "analysis-only",
      mayWriteInkOSCanon: false,
      mayPromoteSoul: false,
      ownerDecisionRequired: true,
    },
  };
}

async function fixtureRoot() {
  const root = await mkdtemp(join(tmpdir(), "genre-study-"));
  const sourceTitle = "상업 작품_필명_합본.txt";
  const sourcePath = `private_sources/korean_webnovel_corpus/필명/${sourceTitle}`;
  await mkdir(join(root, "exports/source-registry"), { recursive: true });
  await mkdir(join(root, "private_sources/korean_webnovel_corpus/필명"), { recursive: true });
  await writeFile(join(root, sourcePath), sourceText);
  const snapshotPath = join(root, "exports/source-registry/snapshot.json");
  await writeFile(snapshotPath, `${JSON.stringify({
    schemaVersion: "drive-folder-metadata-snapshot/v1",
    capturedAt: "2026-08-28T00:00:00.000Z",
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
      modifiedAt: "2026-08-27T00:00:00.000Z",
    }],
  }, null, 2)}\n`);
  const paths = {
    privateRegistryPath: join(root, "exports/source-registry/private.json"),
    inventoryPath: join(root, "evidence/inventory.json"),
    receiptPath: join(root, "evidence/receipt.json"),
  };
  const built = await buildGenreSoulSourceRegistry({
    repositoryRoot: root,
    snapshotPath,
    ...paths,
    expectedDirectFiles: 1,
    expectedExcludedFemaleFiles: 1,
  });
  built.privateRegistry.items[0].soulInput = {
    eligible: true,
    genre: "modern-fantasy-ko",
    managerSelectionReceiptSha256: hash("f"),
  };
  return { root, sourcePath, sourceId: "gdrive-source-one", paths, ...built };
}

test("requires gap-free full UTF-8 byte coverage", () => {
  assert.equal(assertFullByteCoverage([{ startByte: 0, endByte: 5 }, { startByte: 5, endByte: 10 }], 10), true);
  assert.throws(() => assertFullByteCoverage([{ startByte: 0, endByte: 4 }, { startByte: 5, endByte: 10 }], 10), /gap-free/u);
});

test("validates survey, deep-read, genre profile, manager QA, and owner-separated promotion evidence", async () => {
  const fixture = await fixtureRoot();
  try {
    const source = fixture.privateRegistry.items[0];
    const survey = {
      schemaVersion: "genre-soul-survey/v1",
      genre: "modern-fantasy-ko",
      completedAt: "2026-08-28T01:00:00.000Z",
      candidateSourceIds: [fixture.sourceId],
      entries: [{
        sourceId: fixture.sourceId,
        sourceSha256: source.sourceSha256,
        reader: {
          runId: "survey-run-1", model: "gpt-5.6-sol", reasoningEffort: "high",
          configSha256: hash("1"), traceReceiptSha256: hash("2"),
        },
        status: "surveyed",
        coverage: [{ startByte: 0, endByte: 120 }],
        managerExclusion: null,
        observationIds: ["obs-1"],
      }],
    };
    assert.equal(validateSurveyArtifact(survey, fixture.privateRegistry), true);
    assert.equal(validateDeepReadArtifact({
      schemaVersion: "genre-soul-deep-read/v1",
      genre: "modern-fantasy-ko",
      sourceId: fixture.sourceId,
      sourceSha256: source.sourceSha256,
      sourceSizeBytes: source.sizeBytes,
      reader: {
        runId: "deep-run-1", model: "gpt-5.6-sol", reasoningEffort: "high",
        configSha256: hash("1"), traceReceiptSha256: hash("2"),
      },
      completedAt: "2026-08-28T02:00:00.000Z",
      coverage: [{ startByte: 0, endByte: source.sizeBytes }],
      chapterCount: 20,
      observationIds: ["obs-1"],
    }, fixture.privateRegistry), true);
    assert.equal(validateGenreProfileArtifact(makeGenreProfile()), true);
    assert.equal(validateManagerQaReceipt(makeManagerQaReceipt()), true);
    assert.equal(validatePromotionEligibility({
      schemaVersion: "genre-soul-promotion-eligibility/v1",
      genre: "modern-fantasy-ko",
      status: "pass",
      deepReadSourceCount: 3,
      reviewPacketSchema: "firefly_review_packet/v2",
      blindPairCount: 3,
      independentBlindRunCount: 3,
      soulWins: 2,
      averageCommercialScore: 87,
      winningPairMinimumGain: 2.5,
      genreIdentityPassed: 3,
      contentNeutralViolationCount: 0,
      unauthorizedCanonWriteCount: 0,
      allSurfaceMatchesHumanClassified: true,
      canonLeakCount: 0,
      managerQaPassed: true,
      leakScanMatchCount: 0,
      ownerDecisionRequired: true,
      ownerDecisionId: null,
      deepReadReceiptSha256s: [hash("1"), hash("2"), hash("3")],
      reviewPacketSha256s: [hash("4"), hash("5"), hash("6")],
      blindReviewReceiptSha256s: [hash("7"), hash("8"), hash("9")],
      contentNeutralReceiptSha256s: [hash("a"), hash("b"), hash("c")],
      surfaceComparisonReceiptSha256s: [hash("d"), hash("e"), hash("f")],
      managerQaReceiptSha256: hash("a"),
      leakScanReceiptSha256: hash("b"),
      generationRunIds: ["generation-1", "generation-2", "generation-3", "generation-4", "generation-5", "generation-6"],
      blindRunIds: ["blind-1", "blind-2", "blind-3"],
      inputSha256s: [hash("a"), hash("b")],
      authority: {
        scope: "analysis-only",
        mayWriteInkOSCanon: false,
        mayPromoteSoul: false,
        ownerDecisionRequired: true,
      },
    }), true);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("survey, deep-read, reader, range, and promotion contracts reject every extra key", async () => {
  const fixture = await fixtureRoot();
  try {
    const source = fixture.privateRegistry.items[0];
    const reader = {
      runId: "exact-run", model: "gpt-5.6-sol", reasoningEffort: "high",
      configSha256: hash("1"), traceReceiptSha256: hash("2"),
    };
    const survey = {
      schemaVersion: "genre-soul-survey/v1",
      genre: "modern-fantasy-ko",
      completedAt: "2026-08-28T01:00:00.000Z",
      candidateSourceIds: [fixture.sourceId],
      entries: [{
        sourceId: fixture.sourceId,
        sourceSha256: source.sourceSha256,
        reader,
        status: "surveyed",
        coverage: [{ startByte: 0, endByte: 120 }],
        managerExclusion: null,
        observationIds: ["obs-1"],
      }],
    };
    const deepRead = {
      schemaVersion: "genre-soul-deep-read/v1",
      genre: "modern-fantasy-ko",
      sourceId: fixture.sourceId,
      sourceSha256: source.sourceSha256,
      sourceSizeBytes: source.sizeBytes,
      reader,
      completedAt: "2026-08-28T02:00:00.000Z",
      coverage: [{ startByte: 0, endByte: source.sizeBytes }],
      chapterCount: 20,
      observationIds: ["obs-1"],
    };
    for (const mutated of [
      { ...structuredClone(survey), extra: true },
      (() => { const value = structuredClone(survey); value.entries[0].extra = true; return value; })(),
      (() => { const value = structuredClone(survey); value.entries[0].reader.extra = true; return value; })(),
      (() => { const value = structuredClone(survey); value.entries[0].coverage[0].extra = true; return value; })(),
    ]) assert.throws(() => validateSurveyArtifact(mutated, fixture.privateRegistry), /keys must be exactly/u);
    for (const mutated of [
      { ...structuredClone(deepRead), extra: true },
      (() => { const value = structuredClone(deepRead); value.reader.extra = true; return value; })(),
      (() => { const value = structuredClone(deepRead); value.coverage[0].extra = true; return value; })(),
    ]) assert.throws(() => validateDeepReadArtifact(mutated, fixture.privateRegistry), /keys must be exactly/u);

    const extraPromotion = makePromotionEligibility();
    extraPromotion.promoted = true;
    assert.throws(() => validatePromotionEligibility(extraPromotion), /keys must be exactly/u);
    const authorityDrift = makePromotionEligibility();
    authorityDrift.authority.mayPromoteSoul = true;
    assert.throws(() => validatePromotionEligibility(authorityDrift), /authority must remain analysis-only/u);
    const authorityExtra = makePromotionEligibility();
    authorityExtra.authority.ownerDecisionId = "forbidden";
    assert.throws(() => validatePromotionEligibility(authorityExtra), /keys must be exactly/u);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("profile accepts exact legacy and content-addressed current deep-read receipt paths only", () => {
  const legacy = makeGenreProfile();
  assert.equal(validateGenreProfileArtifact(legacy), true);

  const current = makeGenreProfile();
  current.evidenceSet.sources.forEach((source, index) => {
    const base = `exports/genre-souls/${current.soulId}/v1/deep-read-runs/${source.sourceId}`;
    source.privateBundle.path = `${base}/runs/${String(index + 1).repeat(64)}/deep-read-receipt.json`;
  });
  assert.equal(validateGenreProfileArtifact(current), true);

  const malformed = structuredClone(current);
  malformed.evidenceSet.sources[0].privateBundle.path = malformed.evidenceSet.sources[0].privateBundle.path
    .replace("/deep-read-receipt.json", "/extra/deep-read-receipt.json");
  assert.throws(() => validateGenreProfileArtifact(malformed), /exact legacy path or a content-addressed/u);
});

test("genre profile fails closed on two sources, duplicate bindings, source support, and authority", () => {
  const twoSources = makeGenreProfile();
  twoSources.evidenceSet.sources = twoSources.evidenceSet.sources.slice(0, 2);
  assert.throws(() => validateGenreProfileArtifact(twoSources), /exactly three sources/u);

  const duplicate = makeGenreProfile();
  duplicate.evidenceSet.sources[2] = {
    ...structuredClone(duplicate.evidenceSet.sources[0]),
    selectionBasis: "surface-anchor",
  };
  assert.throws(() => validateGenreProfileArtifact(duplicate), /duplicated/u);

  const unsupportedCommon = makeGenreProfile();
  unsupportedCommon.patterns[0].sourceIds = unsupportedCommon.patterns[0].sourceIds.slice(0, 2);
  unsupportedCommon.patterns[0].evidence = unsupportedCommon.patterns[0].evidence.filter((entry) => (
    unsupportedCommon.patterns[0].sourceIds.includes(entry.sourceId)
  ));
  assert.throws(() => validateGenreProfileArtifact(unsupportedCommon), /genre-common source support/u);

  const unauthorized = makeGenreProfile();
  unauthorized.authority.mayWriteInkOSCanon = true;
  assert.throws(() => validateGenreProfileArtifact(unauthorized), /authority must remain analysis-only/u);

  const contractDrift = makeGenreProfile();
  contractDrift.synthesis.contentContract.sha256 = hash("f");
  assert.throws(() => validateGenreProfileArtifact(contractDrift), /not canonical/u);
});

test("manager QA fails closed on shared synthesis runs, missing raw spans, and incomplete engine comparisons", () => {
  const sharedRun = makeManagerQaReceipt();
  sharedRun.manager.runId = sharedRun.profile.synthesisRunId;
  assert.throws(() => validateManagerQaReceipt(sharedRun), /separate from profile synthesis/u);

  const missingLate = makeManagerQaReceipt();
  missingLate.sources[0].samples[2].span = "middle";
  assert.throws(() => validateManagerQaReceipt(missingLate), /cover exactly early, middle, and late/u);

  const duplicateMechanism = makeManagerQaReceipt();
  duplicateMechanism.sources[2].mechanismSignatureSha256 = duplicateMechanism.sources[0].mechanismSignatureSha256;
  assert.throws(() => validateManagerQaReceipt(duplicateMechanism), /byte-identical/u);

  const missingPair = makeManagerQaReceipt();
  missingPair.engineComparisons = missingPair.engineComparisons.slice(0, 2);
  assert.throws(() => validateManagerQaReceipt(missingPair), /all three pairwise/u);

  const unauthorized = makeManagerQaReceipt();
  unauthorized.authority.mayPromoteSoul = true;
  assert.throws(() => validateManagerQaReceipt(unauthorized), /owner-separated/u);
});

test("current Manager QA v2 requires an exact deterministic, semantic, or owner surface proof", () => {
  for (const mode of [
    "deterministic-clean",
    "semantic-auto-passed",
    "semantic-owner-approved",
  ]) {
    assert.equal(validateManagerQaReceipt(makeCurrentManagerQaReceipt(mode)), true, mode);
  }

  const missingProof = makeCurrentManagerQaReceipt();
  delete missingProof.surfaceReview;
  assert.throws(() => validateManagerQaReceipt(missingProof), /keys must be exactly/u);

  const legacySubstitution = makeCurrentManagerQaReceipt();
  legacySubstitution.surfaceReview = {
    schemaVersion: "genre-soul-manager-surface-review-proof/v1",
    gateVersion: "genre-soul-protected-surface-hil/v2",
    candidate: boundReference("exports/legacy/surface-hil/candidate.json", "1"),
    request: boundReference(`exports/legacy/surface-hil/requests/${hash("2")}.json`, "2"),
    decision: {
      ...boundReference(`exports/legacy/surface-hil/decisions/${hash("2")}.json`, "3"),
      decisionId: `surface-decision-${"4".repeat(24)}`,
      outcome: "approved",
      decidedByRole: "owner",
    },
    authority: {
      scope: "reference-lab-analysis-surface-only",
      mayWriteInkOSCanon: false,
      mayPromoteSoul: false,
    },
  };
  assert.throws(() => validateManagerQaReceipt(legacySubstitution), /schema or gate version drifted/u);

  const resultDrift = makeCurrentManagerQaReceipt("semantic-auto-passed");
  resultDrift.surfaceReview.semantic.result.sha256 = hash("0");
  assert.throws(() => validateManagerQaReceipt(resultDrift), /result bytes drifted/u);

  const countDrift = makeCurrentManagerQaReceipt("semantic-auto-passed");
  countDrift.surfaceReview.semantic.verdictCounts.genericOverlap = 0;
  assert.throws(() => validateManagerQaReceipt(countDrift), /verdict counts drifted/u);

  const ownerPathDrift = makeCurrentManagerQaReceipt("semantic-owner-approved");
  ownerPathDrift.surfaceReview.ownerDecision.decision.path = ownerPathDrift.surfaceReview.ownerDecision.decision.path
    .replace("/owner-hil/decisions/", "/owner-hil/requests/");
  assert.throws(() => validateManagerQaReceipt(ownerPathDrift), /require(?:s)? an exact approved owner decision/u);
});

test("current Manager QA v3 accepts phase-complete shared cores and rejects drifted phase or relation evidence", () => {
  const valid = makePhaseAwareManagerQaReceipt();
  assert.equal(validateManagerQaReceipt(valid), true);
  assert.equal(validateManagerQaReceipt(valid, makeManagerQaValidationContext(valid)), true);

  const schemaSubstitution = makeCurrentManagerQaReceipt();
  schemaSubstitution.schemaVersion = "genre-soul-manager-qa/v3";
  assert.throws(() => validateManagerQaReceipt(schemaSubstitution), /requires private-genre-soul-manager-qa-input\/v3/u);

  const proofDowngrade = makePhaseAwareManagerQaReceipt();
  proofDowngrade.surfaceReview.schemaVersion = "genre-soul-manager-surface-review-proof/v2";
  assert.throws(() => validateManagerQaReceipt(proofDowngrade), /requires the current surface review proof v3/u);

  const duplicateSample = makePhaseAwareManagerQaReceipt();
  duplicateSample.sources[1].samples[0].sampleId = duplicateSample.sources[0].samples[0].sampleId;
  duplicateSample.sources[1].collectiveAssessment.phaseSampleIds.early = duplicateSample.sources[1].samples[0].sampleId;
  rebindPhaseAwareCandidate(duplicateSample);
  assert.throws(() => validateManagerQaReceipt(duplicateSample), /sampleId is duplicated/u);

  const incompleteUnion = makePhaseAwareManagerQaReceipt();
  incompleteUnion.sources[0].samples[0].supportedMechanismFields = ["pressure"];
  rebindPhaseAwareCandidate(incompleteUnion);
  assert.throws(() => validateManagerQaReceipt(incompleteUnion), /sample mechanism field union is incomplete/u);

  const wrongPhase = makePhaseAwareManagerQaReceipt();
  wrongPhase.sources[0].samples.find((sample) => sample.span === "early").supportedMechanismFields = ["activeChoice"];
  rebindPhaseAwareCandidate(wrongPhase);
  assert.throws(() => validateManagerQaReceipt(wrongPhase), /not allowed for its bound phase/u);

  const insufficientPair = makePhaseAwareManagerQaReceipt();
  insufficientPair.engineComparisons[0].verdict = "insufficient";
  rebindPhaseAwareCandidate(insufficientPair);
  assert.throws(() => validateManagerQaReceipt(insufficientPair), /evidence-complete relation verdict/u);

  const identicalDistinct = makePhaseAwareManagerQaReceipt();
  identicalDistinct.sources[1].mechanismSignatureSha256 = identicalDistinct.sources[0].mechanismSignatureSha256;
  identicalDistinct.engineComparisons[0].verdict = "distinct-variant";
  rebindPhaseAwareCandidate(identicalDistinct);
  assert.throws(() => validateManagerQaReceipt(identicalDistinct), /cannot claim a distinct variant/u);

  const checkDrift = makePhaseAwareManagerQaReceipt();
  checkDrift.checks.engineRelationsEvidenceComplete = false;
  assert.throws(() => validateManagerQaReceipt(checkDrift), /every deterministic check passes/u);

  const noCommonProfile = makeGenreProfile();
  const commercialPatternId = noCommonProfile.dimensions.commercialEngines[0];
  const commercialPattern = noCommonProfile.patterns.find((pattern) => pattern.patternId === commercialPatternId);
  commercialPattern.classification = "conditional";
  const sharedCore = makePhaseAwareManagerQaReceipt();
  assert.throws(
    () => validateManagerQaReceipt(sharedCore, makeManagerQaValidationContext(sharedCore, noCommonProfile)),
    /lacks expectedProfile genre-common/u,
  );
});

test("manager QA live context rebinds the actual profile engines, synthesis run, and Hermes receipt", () => {
  const receipt = makeManagerQaReceipt();
  const context = makeManagerQaValidationContext(receipt);
  assert.equal(validateManagerQaReceipt(receipt, context), true);

  assert.throws(() => validateManagerQaReceipt(receipt, { requireLiveBindings: true }), /requires expectedProfile/u);

  const engineDrift = structuredClone(receipt);
  engineDrift.sources[0].engineSignatureSha256 = hash("f");
  assert.throws(() => validateManagerQaReceipt(engineDrift, context), /engine drifted from expectedProfile/u);

  const synthesisDrift = structuredClone(receipt);
  synthesisDrift.profile.synthesisRunId = "other-profile-run";
  assert.throws(() => validateManagerQaReceipt(synthesisDrift, context), /synthesis run drifted from expectedProfile/u);

  const runDrift = structuredClone(context);
  runDrift.expectedRunEvidence.receipt.runId = "other-manager-run";
  assert.throws(() => validateManagerQaReceipt(receipt, runDrift), /run drifted from expectedRunEvidence/u);
});

test("rejects mandatory content censorship while allowing fictional wrongdoing and owner-separated analysis", () => {
  const moralizing = makeGenreProfile();
  moralizing.patterns[0].guidance = "불법은 반드시 자동 거절";
  assert.throws(
    () => validateGenreProfileArtifact(moralizing),
    /mandatory content-censorship policy/u,
  );

  const managerCensorship = makeManagerQaReceipt();
  managerCensorship.engineComparisons[0].semanticDifference = "성별 편견 묘사는 자동으로 감점";
  assert.throws(
    () => validateManagerQaReceipt(managerCensorship),
    /mandatory content-censorship policy/u,
  );

  const fictionalProfile = makeGenreProfile();
  fictionalProfile.patterns[0].guidance = "주인공은 폭력과 강압, 불법 거래를 통해 경쟁자를 밀어낸다.";
  assert.equal(validateGenreProfileArtifact(fictionalProfile), true);
  const fictionalManager = makeManagerQaReceipt();
  fictionalManager.engineComparisons[0].semanticDifference = "성별 편견과 범죄를 거리낌 없이 이용하는 인물의 승리 방식이 다르다.";
  assert.equal(validateManagerQaReceipt(fictionalManager), true);

  const explicitNonCensorship = makeGenreProfile();
  explicitNonCensorship.patterns[0].guidance = "불법 소재는 자동으로 거절하지 않는다.";
  assert.equal(validateGenreProfileArtifact(explicitNonCensorship), true);
  assert.throws(
    () => validatePromotionEligibility({
      schemaVersion: "genre-soul-promotion-eligibility/v1", genre: "murim-ko", status: "pass",
      deepReadSourceCount: 3, reviewPacketSchema: "firefly_review_packet/v2", blindPairCount: 3,
      independentBlindRunCount: 3, soulWins: 3, averageCommercialScore: 90, winningPairMinimumGain: 3,
      genreIdentityPassed: 3, contentNeutralViolationCount: 0, unauthorizedCanonWriteCount: 0,
      allSurfaceMatchesHumanClassified: true, canonLeakCount: 0, managerQaPassed: true, leakScanMatchCount: 0,
      ownerDecisionRequired: true, ownerDecisionId: "owner-decision",
      deepReadReceiptSha256s: [hash("1"), hash("2"), hash("3")],
      reviewPacketSha256s: [hash("4"), hash("5"), hash("6")],
      blindReviewReceiptSha256s: [hash("7"), hash("8"), hash("9")],
      contentNeutralReceiptSha256s: [hash("a"), hash("b"), hash("c")],
      surfaceComparisonReceiptSha256s: [hash("d"), hash("e"), hash("f")],
      managerQaReceiptSha256: hash("a"), leakScanReceiptSha256: hash("b"),
      generationRunIds: ["generation-1", "generation-2", "generation-3", "generation-4", "generation-5", "generation-6"],
      blindRunIds: ["blind-1", "blind-2", "blind-3"], inputSha256s: [hash("a")],
      authority: {
        scope: "analysis-only", mayWriteInkOSCanon: false, mayPromoteSoul: false, ownerDecisionRequired: true,
      },
    }),
    /must not claim/u,
  );
});

test("candidate-byte surface scanner quarantines raw prose and passes before any tracked write", async () => {
  const fixture = await fixtureRoot();
  try {
    const rawRelativePath = "analyses/genre_souls/raw.json";
    const cleanRelativePath = "analyses/genre_souls/clean.json";
    await assert.rejects(access(join(fixture.root, rawRelativePath)));
    await assert.rejects(access(join(fixture.root, cleanRelativePath)));
    const raw = await scanTrackedProjectionBytes({
      repositoryRoot: fixture.root,
      artifactRelativePath: rawRelativePath,
      artifactBytes: Buffer.from(`${JSON.stringify({ summary: sourceText })}\n`),
      ...fixture.paths,
    });
    assert.equal(raw.status, "quarantine");
    assert.ok(raw.matchCount > 0);
    assert.equal(JSON.stringify(raw).includes(sourceText.slice(0, 50)), false);
    const cleanBytes = Buffer.from(`${JSON.stringify({
      sourceId: fixture.sourceId,
      sourceSha256: fixture.privateRegistry.items[0].sourceSha256,
    })}\n`);
    const clean = await scanTrackedProjectionBytes({
      repositoryRoot: fixture.root,
      artifactRelativePath: cleanRelativePath,
      artifactBytes: cleanBytes,
      ...fixture.paths,
    });
    assert.equal(clean.status, "pass");
    assert.equal(clean.matchCount, 0);
    assert.equal(clean.corpus.observedSourceSetSha256, computeTrackedProjectionObservedSourceSetSha256([{
      sourceId: fixture.sourceId,
      sourceSha256: fixture.privateRegistry.items[0].sourceSha256,
      sizeBytes: fixture.privateRegistry.items[0].sizeBytes,
    }]));
    await assert.rejects(access(join(fixture.root, rawRelativePath)));
    await assert.rejects(access(join(fixture.root, cleanRelativePath)));

    await mkdir(join(fixture.root, "analyses/genre_souls"), { recursive: true });
    const onDiskArtifact = join(fixture.root, "analyses/genre_souls/on-disk.json");
    await writeFile(onDiskArtifact, cleanBytes);
    const onDisk = await scanTrackedProjection({
      repositoryRoot: fixture.root,
      artifactPath: onDiskArtifact,
      ...fixture.paths,
    });
    assert.equal(onDisk.status, "pass");
    assert.equal(onDisk.artifact.sha256, clean.artifact.sha256);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("candidate-byte scanner rejects source bytes drifted from the canonical private registry", async () => {
  const fixture = await fixtureRoot();
  try {
    await writeFile(join(fixture.root, fixture.sourcePath), `${sourceText}drifted-after-registry\n`);
    await assert.rejects(scanTrackedProjectionBytes({
      repositoryRoot: fixture.root,
      artifactRelativePath: "analyses/genre_souls/source-drift.json",
      artifactBytes: Buffer.from("{\"safe\":true}\n"),
      ...fixture.paths,
    }), new RegExp(`source byte drift: ${fixture.sourceId}`, "u"));
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("candidate-byte scanner keeps the exact verified buffer and digest when the source mutates during scanning", async () => {
  const fixture = await fixtureRoot();
  try {
    const canonical = fixture.privateRegistry.items[0];
    await assert.rejects(scanTrackedProjectionBytes({
      repositoryRoot: fixture.root,
      artifactRelativePath: "analyses/genre_souls/unguarded-hook.json",
      artifactBytes: Buffer.from("{\"safe\":true}\n"),
      ...fixture.paths,
      testOnlyHooks: { afterSourceBufferVerified: async () => {} },
    }), /explicit testOnly=true boundary/u);
    let mutationCount = 0;
    const result = await scanTrackedProjectionBytes({
      repositoryRoot: fixture.root,
      artifactRelativePath: "analyses/genre_souls/mutate-during-scan.json",
      artifactBytes: Buffer.from("{\"safe\":true}\n"),
      ...fixture.paths,
      testOnly: true,
      testOnlyHooks: {
        afterSourceBufferVerified: async ({ sourceId, sourceSha256, sizeBytes }) => {
          assert.equal(sourceId, fixture.sourceId);
          assert.equal(sourceSha256, canonical.sourceSha256);
          assert.equal(sizeBytes, canonical.sizeBytes);
          mutationCount += 1;
          await writeFile(join(fixture.root, fixture.sourcePath), "mutated only after the canonical buffer was verified\n");
        },
      },
    });
    assert.equal(mutationCount, 1);
    assert.equal(result.status, "pass");
    assert.equal(result.corpus.availableSourceCount, 1);
    assert.equal(result.corpus.observedSourceSetSha256, computeTrackedProjectionObservedSourceSetSha256([{
      sourceId: fixture.sourceId,
      sourceSha256: canonical.sourceSha256,
      sizeBytes: canonical.sizeBytes,
    }]));
    await assert.rejects(scanTrackedProjectionBytes({
      repositoryRoot: fixture.root,
      artifactRelativePath: "analyses/genre_souls/post-mutation.json",
      artifactBytes: Buffer.from("{\"safe\":true}\n"),
      ...fixture.paths,
    }), new RegExp(`source byte drift: ${fixture.sourceId}`, "u"));
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("tracked projection scanners reject a symbolic-link ancestor from repository root to target", async () => {
  const fixture = await fixtureRoot();
  try {
    const analyses = join(fixture.root, "analyses");
    const escaped = join(fixture.root, "escaped-genre-souls");
    await Promise.all([
      mkdir(analyses, { recursive: true }),
      mkdir(escaped, { recursive: true }),
    ]);
    await symlink(escaped, join(analyses, "genre_souls"), "dir");
    const artifactRelativePath = "analyses/genre_souls/symlinked.json";
    const artifactBytes = Buffer.from("{\"safe\":true}\n");
    await assert.rejects(scanTrackedProjectionBytes({
      repositoryRoot: fixture.root,
      artifactRelativePath,
      artifactBytes,
      ...fixture.paths,
    }), /symbolic-link ancestor/u);

    const artifactPath = join(fixture.root, artifactRelativePath);
    await writeFile(join(escaped, "symlinked.json"), artifactBytes);
    await assert.rejects(scanTrackedProjection({
      repositoryRoot: fixture.root,
      artifactPath,
      ...fixture.paths,
    }), /symbolic-link ancestor/u);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
