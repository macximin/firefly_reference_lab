import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  acquireSurveySourceLock,
  assertSurveyAdmissible,
  buildCurrentSurveyCompletedPointer,
  buildCurrentSurveyDomainReceipt,
  buildCurrentSurveyPrompt,
  buildSurveyWindows,
  buildSurveyRunInputDescriptor,
  deriveSurveyCompletedAt,
  deriveSurveyRunCompletedAt,
  indexSourceChapters,
  publishSurveyTrackedProjection,
  releaseSurveySourceLock,
  validatePrivateSurveyResult,
} from "../tools/genre-soul-survey-runner.mjs";

const ACTUAL_REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEST_CORPUS = {
  privateRegistrySha256: "c".repeat(64),
  availableSourceCount: 3,
  observedSourceSetSha256: "d".repeat(64),
};
const GENRE_TARGETS = new Map([
  ["modern-fantasy-ko", "male-modern-fantasy-ko"],
  ["fantasy-ko", "male-fantasy-ko"],
  ["murim-ko", "male-murim-ko"],
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function publishPaths(root, genre = "modern-fantasy-ko") {
  const soulId = GENRE_TARGETS.get(genre) ?? `male-${genre}`;
  const baseRelativePath = `analyses/genre_souls/${soulId}/v1`;
  return {
    surveyPath: join(root, baseRelativePath, "survey.json"),
    leakReceiptPath: join(root, baseRelativePath, "survey.leak-scan.json"),
    surveyRelativePath: `${baseRelativePath}/survey.json`,
    leakReceiptRelativePath: `${baseRelativePath}/survey.leak-scan.json`,
  };
}

function testPublishOptions(root, genre, surveyBytes) {
  return {
    repositoryRoot: root,
    genre,
    surveyBytes,
    testOnly: true,
    testOnlyRepositoryRoot: root,
    testOnlyExpectedCorpus: TEST_CORPUS,
  };
}

function surveyCandidateBytes(genre = "modern-fantasy-ko", fixture = "safe") {
  return Buffer.from(`${JSON.stringify({
    schemaVersion: "genre-soul-survey/v1",
    genre,
    fixture,
  }, null, 2)}\n`);
}

function leakReceipt(path, bytes, status = "pass") {
  return {
    schemaVersion: "tracked-projection-leak-scan/v1",
    scanner: {
      version: "genre-soul-surface-scanner/v1",
      exactTokenCount: 12,
      longCommonUtf8Bytes: 120,
    },
    artifact: { path, sha256: sha256(bytes), sizeBytes: bytes.byteLength },
    corpus: { ...TEST_CORPUS },
    matchCount: status === "pass" ? 0 : 1,
    matches: status === "pass" ? [] : [{ matchId: "fixture-match" }],
    truncated: false,
    status,
    automaticRewrite: false,
    automaticReject: false,
  };
}

async function isMissing(path) {
  try {
    await access(path);
    return false;
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
}

async function findLiveLocks(root) {
  const liveLocks = [];
  async function visit(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const path = join(directory, entry.name);
      if (entry.name.endsWith(".lock")) liveLocks.push(path);
      else await visit(path);
    }
  }
  await visit(root);
  return liveLocks.sort();
}

function source(chapters) {
  return Buffer.from(Array.from({ length: chapters }, (_, index) => (
    `ⓚ${index + 1}화\n${`본문-${index + 1} `.repeat(100)}\n`
  )).join(""));
}

test("indexes UTF-8 chapter bytes and builds distributed survey windows", () => {
  const bytes = source(250);
  const chapters = indexSourceChapters(bytes);
  assert.equal(chapters.length, 250);
  assert.equal(chapters[0].startByte, 0);
  assert.equal(chapters.at(-1).endByte, bytes.byteLength);
  const windows = buildSurveyWindows(bytes, 250, 120);
  assert.equal(windows.length, 5);
  assert.equal(windows[0].phase, "opening");
  assert.equal(windows.at(-1).phase, "ending");
  assert.ok(windows.every((window) => window.endByte > window.startByte));
  assert.ok(windows.every((window) => Buffer.from(bytes.subarray(window.startByte, window.endByte)).toString("utf8").includes("�") === false));
});

test("rejects chapter drift and incomplete private survey output", () => {
  const bytes = source(5);
  assert.throws(() => buildSurveyWindows(bytes, 6), /chapter count drift/u);
  const windows = buildSurveyWindows(bytes, 5);
  const coverage = windows.map(({ startByte, endByte }) => ({ startByte, endByte }));
  const base = {
    schemaVersion: "private-genre-soul-survey-result/v1",
    sourceId: "gdrive-source",
    sourceSha256: "a".repeat(64),
    genre: "fantasy-ko",
    coverage,
    observations: windows.map((window) => ({
      windowId: window.windowId,
      phase: window.phase,
      commercialEngine: "행동",
      protagonistAction: "선택",
      resistance: "저항",
      payoff: "지급",
      endingPromise: "다음 행동",
      genreEvidence: "장르 근거",
    })),
    classification: { genre: "fantasy-ko", confidence: 0.9, recommendation: "keep", reason: "근거" },
  };
  assert.equal(validatePrivateSurveyResult(base, {
    sourceId: base.sourceId,
    sourceSha256: base.sourceSha256,
    genre: base.genre,
    windows,
    coverage,
  }), true);
  assert.equal(assertSurveyAdmissible(base), true);
  assert.throws(
    () => assertSurveyAdmissible({
      ...base,
      classification: { ...base.classification, recommendation: "needs-manager-review" },
    }),
    /requires manager review/u,
  );
  assert.throws(
    () => validatePrivateSurveyResult({ ...base, observations: base.observations.slice(1) }, {
      sourceId: base.sourceId,
      sourceSha256: base.sourceSha256,
      genre: base.genre,
      windows,
      coverage,
    }),
    /one observation per window/u,
  );
});

test("content-addresses survey inputs across source, profile Soul, and exact windows", () => {
  const base = {
    genre: "modern-fantasy-ko",
    soulId: "male-modern-fantasy-ko",
    profileId: "inkos_male_modern_fantasy",
    sourceId: "gdrive-fixture",
    repoRelativePath: "private_sources/fixture.txt",
    sourceSha256: "a".repeat(64),
    sourceSizeBytes: 12_345,
    chapterCount: 100,
    configSha256: "b".repeat(64),
    soulSha256: "c".repeat(64),
    windows: Array.from({ length: 5 }, (_, index) => ({
      windowId: `w0${index + 1}`,
      filename: `w0${index + 1}.txt`,
      chapterSequence: 1 + index * 20,
      chapterNumber: 1 + index * 20,
      startByte: index * 100,
      endByte: index * 100 + 100,
      phase: index === 0 ? "opening" : index === 4 ? "ending" : `distributed-${index}`,
      sha256: String(index + 1).repeat(64),
    })),
  };
  const first = buildSurveyRunInputDescriptor(base);
  const identical = buildSurveyRunInputDescriptor(structuredClone(base));
  const changedSource = buildSurveyRunInputDescriptor({ ...base, sourceSha256: "d".repeat(64) });
  const changedSoul = buildSurveyRunInputDescriptor({ ...base, soulSha256: "e".repeat(64) });

  assert.equal(first.bytes.compare(identical.bytes), 0);
  assert.equal(first.inputDigest, identical.inputDigest);
  assert.notEqual(first.inputDigest, changedSource.inputDigest);
  assert.notEqual(first.inputDigest, changedSoul.inputDigest);
  assert.match(first.inputDigest, /^[a-f0-9]{64}$/u);
});

test("fresh survey prompts and domain seals bind only opaque exact inputs", () => {
  const inputDigest = "a".repeat(64);
  const manifest = {
    schemaVersion: "private-genre-soul-survey-manifest/v3",
    inputDigest,
    promptContractVersion: "private-genre-soul-survey-prompt/v4",
    sourceId: "gdrive-survey-current",
    sourceSha256: "b".repeat(64),
    sourceSizeBytes: 240,
    chapterCount: 2,
    genre: "modern-fantasy-ko",
    soulId: "male-modern-fantasy-ko",
    profileId: "inkos_male_modern_fantasy",
    windows: [
      { inputId: "input-002", windowId: "w001", chapterSequence: 1, chapterNumber: 1, startByte: 0, endByte: 120, phase: "opening", sha256: "c".repeat(64) },
      { inputId: "input-003", windowId: "w002", chapterSequence: 2, chapterNumber: 2, startByte: 120, endByte: 240, phase: "ending", sha256: "d".repeat(64) },
    ],
    coverage: [{ startByte: 0, endByte: 120 }, { startByte: 120, endByte: 240 }],
  };
  const prompt = buildCurrentSurveyPrompt(manifest);
  assert.match(prompt, /firefly_read_source/u);
  assert.match(prompt, /input-001/u);
  assert.match(prompt, /input-002/u);
  assert.match(prompt, /input-003/u);
  assert.match(prompt, /nextInputId and nextCursor/u);
  assert.doesNotMatch(prompt, /exactly once/u);
  assert.doesNotMatch(prompt, /read_file|\/private\/|\.txt/u);
  assert.throws(() => buildCurrentSurveyPrompt({
    ...manifest,
    promptContractVersion: "private-genre-soul-survey-prompt/v3",
  }), /canonical pathless manifest/u);

  const result = {
    schemaVersion: "private-genre-soul-survey-result/v1",
    sourceId: manifest.sourceId,
    sourceSha256: manifest.sourceSha256,
    genre: manifest.genre,
    coverage: manifest.coverage,
    observations: manifest.windows.map((window) => ({
      windowId: window.windowId,
      phase: window.phase,
      commercialEngine: "engine",
      protagonistAction: "action",
      resistance: "resistance",
      payoff: "payoff",
      endingPromise: "promise",
      genreEvidence: "evidence",
    })),
    classification: { genre: manifest.genre, confidence: 0.9, recommendation: "keep", reason: "fit" },
  };
  const readCapabilityBytes = Buffer.from("capability\n");
  const receipt = {
    role: `genre-soul-survey:${manifest.sourceId}`,
    inputDigest,
    runId: "run-current-survey",
    profileId: manifest.profileId,
    model: "gpt-5.6-sol",
    provider: "openai-codex",
    reasoningEffort: "high",
    profileConfigSha256: "e".repeat(64),
    soulSha256: "f".repeat(64),
    promptSha256: sha256(Buffer.from(prompt)),
    expectedReadCount: 3,
    exactReadCount: 3,
    exactReadSha256s: [sha256(Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)), "c".repeat(64), "d".repeat(64)],
    inputSha256: "1".repeat(64),
    readCapabilitySha256: sha256(readCapabilityBytes),
    readCapabilityTool: "firefly_read_source",
    readCapabilityToolset: "firefly-source-read",
    readManifestSha256: "2".repeat(64),
    readExecutionEnvironmentSha256: "3".repeat(64),
    readExecutionRuntimeIdentitySha256: "4".repeat(64),
    candidateOutputSha256: "5".repeat(64),
    resultSha256: "6".repeat(64),
    usageSha256: "7".repeat(64),
    traceSha256: "8".repeat(64),
    completedAt: "2026-08-30T00:00:00.000Z",
  };
  const structuredHostReceiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
  const domainReceipt = buildCurrentSurveyDomainReceipt({
    inputDigest,
    manifest,
    prompt,
    structured: { attempt: "attempts/attempt-current", receipt, result },
    structuredCompletedPointerBytes: Buffer.from("structured-pointer\n"),
    structuredHostReceiptBytes,
    readCapabilityBytes,
  });
  assert.equal(domainReceipt.schemaVersion, "private-hermes-survey-run-receipt/v3");
  assert.equal(domainReceipt.exactReadCount, 2);
  assert.deepEqual(domainReceipt.exactReadSha256s, ["c".repeat(64), "d".repeat(64)]);
  assert.equal(domainReceipt.observationIds.length, 2);
  const domainReceiptBytes = Buffer.from(`${JSON.stringify(domainReceipt, null, 2)}\n`);
  const pointer = buildCurrentSurveyCompletedPointer({ inputDigest, domainReceipt, domainReceiptBytes });
  assert.equal(pointer.schemaVersion, "private-hermes-survey-completed-pointer/v2");
  assert.equal(pointer.domainReceiptSha256, sha256(domainReceiptBytes));
  assert.throws(() => buildCurrentSurveyDomainReceipt({
    inputDigest,
    manifest,
    prompt,
    structured: { attempt: "attempts/attempt-current", receipt, result },
    structuredCompletedPointerBytes: Buffer.from("structured-pointer\n"),
    structuredHostReceiptBytes,
    readCapabilityBytes: Buffer.from("forged\n"),
  }), /does not bind/u);
});

test("derives survey completion only from sealed Hermes trace times", () => {
  const first = deriveSurveyRunCompletedAt({ started_at: 1_700_000_000, ended_at: 1_700_000_010.125 });
  const second = deriveSurveyRunCompletedAt({ started_at: 1_700_000_020, ended_at: 1_700_000_030.5 });
  assert.equal(first, "2023-11-14T22:13:30.125Z");
  assert.equal(second, "2023-11-14T22:13:50.500Z");
  assert.equal(deriveSurveyCompletedAt([{ completedAt: first }, { completedAt: second }]), second);
  assert.throws(() => deriveSurveyRunCompletedAt({ ended_at: 0 }), /completion time/u);
  assert.throws(() => deriveSurveyCompletedAt([{ completedAt: "not-a-time" }]), /completion evidence/u);
});

test("source-level survey lock serializes all content digests for one source", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "survey-source-lock-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sourceRunRoot = "exports/genre-souls/male-modern-fantasy-ko/v1/survey-runs/gdrive-fixture";
  const first = await acquireSurveySourceLock(root, sourceRunRoot, "a".repeat(64));
  await assert.rejects(
    acquireSurveySourceLock(root, sourceRunRoot, "b".repeat(64)),
    /source lock exists|concurrent|stale/u,
  );
  await releaseSurveySourceLock(first);
  const second = await acquireSurveySourceLock(root, sourceRunRoot, "b".repeat(64));
  await releaseSurveySourceLock(second);
  assert.deepEqual(await findLiveLocks(root), []);
});

test("publishes only the exact three canonical survey target pairs", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "survey-publish-targets-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const hookCalls = { support: 0, temporaryRelease: 0, lockRelease: 0 };

  for (const [genre] of GENRE_TARGETS) {
    const surveyBytes = surveyCandidateBytes(genre);
    const paths = publishPaths(root, genre);
    const result = await publishSurveyTrackedProjection({
      ...testPublishOptions(root, genre, surveyBytes),
      testOnlyScanner: async ({ artifactRelativePath, artifactBytes }) => {
        assert.equal(artifactRelativePath, paths.surveyRelativePath);
        assert.equal(artifactBytes.compare(surveyBytes), 0);
        assert.equal(await isMissing(paths.surveyPath), true);
        assert.equal(await isMissing(paths.leakReceiptPath), true);
        return leakReceipt(artifactRelativePath, artifactBytes);
      },
      testOnlyHooks: {
        afterSupportPublish: async () => {
          hookCalls.support += 1;
          assert.equal(await isMissing(paths.leakReceiptPath), false);
          assert.equal(await isMissing(paths.surveyPath), true);
        },
        afterTemporaryReleaseRename: async () => {
          hookCalls.temporaryRelease += 1;
        },
        afterLockReleaseRename: async () => {
          hookCalls.lockRelease += 1;
        },
      },
    });
    assert.equal(result.status, "created");
    assert.equal(result.surveyPath, paths.surveyRelativePath);
    assert.equal(result.leakReceiptPath, paths.leakReceiptRelativePath);
    assert.equal(result.leakScan.artifact.path, paths.surveyRelativePath);
    assert.equal((await readFile(paths.surveyPath)).compare(surveyBytes), 0);
  }

  assert.equal(hookCalls.support, GENRE_TARGETS.size);
  assert.ok(hookCalls.temporaryRelease >= GENRE_TARGETS.size * 2);
  assert.equal(hookCalls.lockRelease, GENRE_TARGETS.size);
  assert.deepEqual(await findLiveLocks(root), []);
});

test("strictly validates the candidate scan receipt before publishing either tracked file", async (t) => {
  const mutations = [
    ["scanner contract", (receipt) => { receipt.scanner.exactTokenCount = 11; }],
    ["extra raw-bearing key", (receipt) => { receipt.rawExcerpt = "private prose"; }],
    ["candidate binding", (receipt) => { receipt.artifact.sha256 = "e".repeat(64); }],
    ["corpus binding", (receipt) => { receipt.corpus.availableSourceCount += 1; }],
  ];
  const roots = [];
  t.after(() => Promise.all(roots.map((root) => rm(root, { recursive: true, force: true }))));
  const surveyBytes = surveyCandidateBytes("modern-fantasy-ko", "strict");

  for (const [label, mutate] of mutations) {
    const root = await mkdtemp(join(tmpdir(), "survey-publish-strict-"));
    roots.push(root);
    const paths = publishPaths(root);
    await assert.rejects(publishSurveyTrackedProjection({
      ...testPublishOptions(root, "modern-fantasy-ko", surveyBytes),
      testOnlyScanner: async ({ artifactRelativePath, artifactBytes }) => {
        const receipt = leakReceipt(artifactRelativePath, artifactBytes);
        mutate(receipt);
        return receipt;
      },
    }), /scan|receipt|byte|corpus|contract|keys/u, label);
    assert.equal(await isMissing(paths.surveyPath), true, label);
    assert.equal(await isMissing(paths.leakReceiptPath), true, label);
    assert.deepEqual(await findLiveLocks(root), [], label);
  }
});

test("scanner quarantine or throw leaves no tracked pair and no live lock", async (t) => {
  const roots = await Promise.all([
    mkdtemp(join(tmpdir(), "survey-publish-quarantine-")),
    mkdtemp(join(tmpdir(), "survey-publish-scan-throw-")),
  ]);
  t.after(() => Promise.all(roots.map((root) => rm(root, { recursive: true, force: true }))));
  const surveyBytes = surveyCandidateBytes("modern-fantasy-ko", "unpublished");

  await assert.rejects(publishSurveyTrackedProjection({
    ...testPublishOptions(roots[0], "modern-fantasy-ko", surveyBytes),
    testOnlyScanner: async ({ artifactRelativePath, artifactBytes }) => (
      leakReceipt(artifactRelativePath, artifactBytes, "quarantine")
    ),
  }), /quarantin|scan|receipt|byte|corpus/u);
  await assert.rejects(publishSurveyTrackedProjection({
    ...testPublishOptions(roots[1], "modern-fantasy-ko", surveyBytes),
    testOnlyScanner: async () => { throw new Error("fixture scanner failed"); },
  }), /fixture scanner failed/u);

  for (const root of roots) {
    const paths = publishPaths(root);
    assert.equal(await isMissing(paths.surveyPath), true);
    assert.equal(await isMissing(paths.leakReceiptPath), true);
    assert.deepEqual(await findLiveLocks(root), []);
  }
});

test("failure after support publication preserves the receipt and live lock for audit", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "survey-publish-partial-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const surveyBytes = surveyCandidateBytes("modern-fantasy-ko", "partial");
  const paths = publishPaths(root);
  const scanner = async ({ artifactRelativePath, artifactBytes }) => (
    leakReceipt(artifactRelativePath, artifactBytes)
  );

  await assert.rejects(publishSurveyTrackedProjection({
    ...testPublishOptions(root, "modern-fantasy-ko", surveyBytes),
    testOnlyScanner: scanner,
    testOnlyHooks: {
      afterSupportPublish: async () => { throw new Error("simulated support-stage interruption"); },
    },
  }), /lock preserved|manual audit|partial/u);
  assert.equal(await isMissing(paths.surveyPath), true);
  assert.equal(await isMissing(paths.leakReceiptPath), false);
  assert.deepEqual(JSON.parse(await readFile(paths.leakReceiptPath, "utf8")), (
    leakReceipt(paths.surveyRelativePath, surveyBytes)
  ));
  assert.equal((await findLiveLocks(root)).length, 1);

  let scannerCalled = false;
  await assert.rejects(publishSurveyTrackedProjection({
    ...testPublishOptions(root, "modern-fantasy-ko", surveyBytes),
    testOnlyScanner: async () => {
      scannerCalled = true;
      return scanner({ artifactRelativePath: paths.surveyRelativePath, artifactBytes: surveyBytes });
    },
  }), /lock exists|manual audit|stale/u);
  assert.equal(scannerCalled, false);
});

test("concurrent survey writers serialize the target pair without clobbering the winner", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "survey-publish-concurrent-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const firstBytes = surveyCandidateBytes("modern-fantasy-ko", "writer-1");
  const secondBytes = surveyCandidateBytes("modern-fantasy-ko", "writer-2");
  const paths = publishPaths(root);
  let announceFirst;
  let releaseFirst;
  const firstStarted = new Promise((resolvePromise) => { announceFirst = resolvePromise; });
  const gate = new Promise((resolvePromise) => { releaseFirst = resolvePromise; });
  const first = publishSurveyTrackedProjection({
    ...testPublishOptions(root, "modern-fantasy-ko", firstBytes),
    testOnlyScanner: async ({ artifactRelativePath, artifactBytes }) => {
      announceFirst();
      await gate;
      return leakReceipt(artifactRelativePath, artifactBytes);
    },
  });
  await firstStarted;
  let secondScannerCalled = false;
  await assert.rejects(publishSurveyTrackedProjection({
    ...testPublishOptions(root, "modern-fantasy-ko", secondBytes),
    testOnlyScanner: async ({ artifactRelativePath, artifactBytes }) => {
      secondScannerCalled = true;
      return leakReceipt(artifactRelativePath, artifactBytes);
    },
  }), /lock exists|concurrent|stale/u);
  assert.equal(secondScannerCalled, false);
  releaseFirst();
  assert.equal((await first).status, "created");
  assert.equal((await readFile(paths.surveyPath)).compare(firstBytes), 0);
  assert.equal(JSON.parse(await readFile(paths.leakReceiptPath, "utf8")).artifact.sha256, sha256(firstBytes));
  assert.deepEqual(await findLiveLocks(root), []);
});

test("rejects a symbolic-link survey target without writing through it", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "survey-publish-symlink-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const surveyBytes = surveyCandidateBytes();
  const paths = publishPaths(root);
  const escapedPath = join(root, "escaped.json");
  await mkdir(dirname(paths.surveyPath), { recursive: true });
  await symlink(escapedPath, paths.surveyPath);

  await assert.rejects(publishSurveyTrackedProjection({
    ...testPublishOptions(root, "modern-fantasy-ko", surveyBytes),
    testOnlyScanner: async ({ artifactRelativePath, artifactBytes }) => (
      leakReceipt(artifactRelativePath, artifactBytes)
    ),
  }), /symbolic link|symbolic-link|symlink|not a real file/u);
  assert.equal((await lstat(paths.surveyPath)).isSymbolicLink(), true);
  assert.equal(await isMissing(escapedPath), true);
  assert.equal(await isMissing(paths.leakReceiptPath), true);
});

test("exactly reuses an existing canonical pair without rescanning or rewriting", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "survey-publish-reuse-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const surveyBytes = surveyCandidateBytes("modern-fantasy-ko", "reusable");
  const paths = publishPaths(root);
  let scannerCalls = 0;
  const scanner = async ({ artifactRelativePath, artifactBytes }) => {
    scannerCalls += 1;
    return leakReceipt(artifactRelativePath, artifactBytes);
  };
  const options = {
    ...testPublishOptions(root, "modern-fantasy-ko", surveyBytes),
    testOnlyScanner: scanner,
  };
  const created = await publishSurveyTrackedProjection(options);
  const beforeSurvey = await readFile(paths.surveyPath);
  const beforeReceipt = await readFile(paths.leakReceiptPath);
  const reused = await publishSurveyTrackedProjection({
    ...options,
    testOnlyScanner: async () => { throw new Error("exact reuse must not rescan"); },
  });

  assert.equal(created.status, "created");
  assert.equal(reused.status, "reused");
  assert.equal(reused.surveyPath, paths.surveyRelativePath);
  assert.equal(reused.leakReceiptPath, paths.leakReceiptRelativePath);
  assert.equal(scannerCalls, 1);
  assert.equal((await readFile(paths.surveyPath)).compare(beforeSurvey), 0);
  assert.equal((await readFile(paths.leakReceiptPath)).compare(beforeReceipt), 0);
  assert.deepEqual(await findLiveLocks(root), []);
});

test("production and test-only publication boundaries fail closed before scanning", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "survey-publish-boundary-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const surveyBytes = surveyCandidateBytes();
  let scannerCalls = 0;
  const scanner = async ({ artifactRelativePath, artifactBytes }) => {
    scannerCalls += 1;
    return leakReceipt(artifactRelativePath, artifactBytes);
  };

  await assert.rejects(publishSurveyTrackedProjection({
    repositoryRoot: root,
    genre: "modern-fantasy-ko",
    surveyBytes,
  }), /canonical|production.*repository root|Reference Lab repository root/u);
  await assert.rejects(publishSurveyTrackedProjection({
    ...testPublishOptions(root, "romance-ko", surveyCandidateBytes("romance-ko")),
    testOnlyScanner: scanner,
  }), /genre|allowlist|canonical survey target/u);
  await assert.rejects(publishSurveyTrackedProjection({
    repositoryRoot: root,
    genre: "modern-fantasy-ko",
    surveyBytes,
    testOnly: true,
    testOnlyScanner: scanner,
    testOnlyExpectedCorpus: TEST_CORPUS,
  }), /testOnlyRepositoryRoot|isolated/u);
  await assert.rejects(publishSurveyTrackedProjection({
    ...testPublishOptions(root, "modern-fantasy-ko", surveyBytes),
    testOnlyRepositoryRoot: ACTUAL_REPOSITORY_ROOT,
    testOnlyScanner: scanner,
  }), /canonical Reference Lab repository root|must match repositoryRoot|isolated/u);
  await assert.rejects(publishSurveyTrackedProjection({
    repositoryRoot: root,
    genre: "modern-fantasy-ko",
    surveyBytes,
    testOnlyHooks: { afterSupportPublish: async () => {} },
  }), /testOnly=true|test-only/u);
  await assert.rejects(publishSurveyTrackedProjection({
    ...testPublishOptions(root, "modern-fantasy-ko", surveyBytes),
    testOnlyScanner: scanner,
    surveyPath: join(root, "attacker-selected.json"),
  }), /unknown|not injectable|options/u);

  assert.equal(scannerCalls, 0);
  assert.deepEqual(await findLiveLocks(root), []);
  assert.deepEqual(await readdir(root), []);
});
