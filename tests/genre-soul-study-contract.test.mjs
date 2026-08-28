import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { buildGenreSoulSourceRegistry } from "../tools/genre-soul-source-registry.mjs";
import {
  assertFullByteCoverage,
  scanTrackedProjection,
  validateDeepReadArtifact,
  validateGenreProfileArtifact,
  validateManagerQaReceipt,
  validatePromotionEligibility,
  validateSurveyArtifact,
} from "../tools/genre-soul-study-contract.mjs";

const hash = (character) => character.repeat(64);
const sourceText = "주인공은 회사를 샀다. 경쟁자는 계약을 막았다. 주인공은 현금과 지분으로 보상을 받았다. ".repeat(20);

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
    assert.equal(validateGenreProfileArtifact({
      schemaVersion: "genre-soul-analysis-profile/v1",
      genre: "modern-fantasy-ko",
      soulId: "male-modern-fantasy-ko",
      version: "v1",
      inventorySha256: hash("a"),
      surveySha256: hash("b"),
      deepReadReceiptSha256s: [hash("c")],
      dimensions: {
        worldConstraints: ["현대 자산과 제도"],
        protagonistRepeatedVerbs: ["산다"],
        pressureAndOpposition: ["계약 저항"],
        rewardAndStatusCurrency: ["현금과 지분"],
        nextChapterExpectedAction: ["다음 거래"],
        commercialEngines: ["가시적 지급"],
      },
      contentNeutrality: {
        automaticMoralGate: false,
        illegalityIsAutomaticFailure: false,
        userIntensityPreserved: true,
      },
    }), true);
    assert.equal(validateManagerQaReceipt({
      schemaVersion: "genre-soul-manager-qa/v1",
      genre: "modern-fantasy-ko",
      manager: { actorId: "manager-1", role: "manager" },
      decidedAt: "2026-08-28T03:00:00.000Z",
      inputSha256s: [hash("a"), hash("b")],
      coveragePassed: true,
      surfaceLeakScanPassed: true,
      moralFitnessGate: false,
      automaticRewrite: false,
      result: "pass",
    }), true);
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
    }), true);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("rejects moralizing genre defaults and Reference Lab owner-decision claims", () => {
  const base = {
    schemaVersion: "genre-soul-analysis-profile/v1",
    genre: "murim-ko",
    soulId: "male-murim-ko",
    version: "v1",
    inventorySha256: hash("a"),
    surveySha256: hash("b"),
    deepReadReceiptSha256s: [hash("c")],
    dimensions: {
      worldConstraints: ["강호 위계"], protagonistRepeatedVerbs: ["벤다"], pressureAndOpposition: ["문파 충돌"],
      rewardAndStatusCurrency: ["무공과 명성"], nextChapterExpectedAction: ["다음 대결"], commercialEngines: ["승패 지급"],
    },
    contentNeutrality: { automaticMoralGate: false, illegalityIsAutomaticFailure: false, userIntensityPreserved: true },
  };
  assert.throws(
    () => validateGenreProfileArtifact({ ...base, dimensions: { ...base.dimensions, commercialEngines: ["불법은 반드시 자동 거절"] } }),
    /forbidden moralizing default/u,
  );
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
    }),
    /must not claim/u,
  );
});

test("surface scanner quarantines raw prose and passes a derived pointer-only projection", async () => {
  const fixture = await fixtureRoot();
  try {
    const rawArtifact = join(fixture.root, "analyses/genre_souls/raw.json");
    const cleanArtifact = join(fixture.root, "analyses/genre_souls/clean.json");
    await mkdir(join(fixture.root, "analyses/genre_souls"), { recursive: true });
    await writeFile(rawArtifact, `${JSON.stringify({ summary: sourceText })}\n`);
    await writeFile(cleanArtifact, `${JSON.stringify({ sourceId: fixture.sourceId, sourceSha256: fixture.privateRegistry.items[0].sourceSha256 })}\n`);
    const raw = await scanTrackedProjection({
      repositoryRoot: fixture.root,
      artifactPath: rawArtifact,
      ...fixture.paths,
    });
    assert.equal(raw.status, "quarantine");
    assert.ok(raw.matchCount > 0);
    assert.equal(JSON.stringify(raw).includes(sourceText.slice(0, 50)), false);
    const clean = await scanTrackedProjection({
      repositoryRoot: fixture.root,
      artifactPath: cleanArtifact,
      ...fixture.paths,
    });
    assert.equal(clean.status, "pass");
    assert.equal(clean.matchCount, 0);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
