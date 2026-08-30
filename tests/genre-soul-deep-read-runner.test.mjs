import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildCurrentDeepReadCompletedPointer,
  buildCurrentDeepReadDomainReceipt,
  buildCurrentDeepReadSegmentInputDigest,
  buildCurrentDeepReadSegmentPrompt,
  buildDeepReadSegments,
  buildDeepReadWorkInputDigest,
  classifyDeepReadRuntimeAttestation,
  publishDeepReadTrackedProjection,
  resolveDeepReadReadFilePath,
  validatePrivateDeepReadSegment,
  withDeepReadWorkLock,
} from "../tools/genre-soul-deep-read-runner.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

const TEST_CORPUS = {
  privateRegistrySha256: "c".repeat(64),
  availableSourceCount: 3,
  observedSourceSetSha256: "d".repeat(64),
};
const ACTUAL_REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CASE_ALIAS_REPOSITORY_ROOT = ACTUAL_REPOSITORY_ROOT.replace("/firefly_studio/", "/FIREFLY_STUDIO/");

function publishPaths(root, sourceId = "gdrive-fixture") {
  const base = join(root, "analyses/genre_souls/male-modern-fantasy-ko/v1");
  return {
    artifactPath: join(base, `work-studies/${sourceId}.deep-read.json`),
    leakReceiptPath: join(base, `leak-scan-receipts/${sourceId}.deep-read.json`),
    artifactRelativePath: `analyses/genre_souls/male-modern-fantasy-ko/v1/work-studies/${sourceId}.deep-read.json`,
  };
}

function testPublishOptions(root, artifactBytes, sourceId = "gdrive-fixture") {
  const { artifactPath, leakReceiptPath } = publishPaths(root, sourceId);
  return {
    repositoryRoot: root,
    testOnlyRepositoryRoot: root,
    artifactPath,
    leakReceiptPath,
    artifactBytes,
    testOnly: true,
    testOnlyExpectedCorpus: TEST_CORPUS,
  };
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

function source(chapters) {
  return Buffer.from(Array.from({ length: chapters }, (_, index) => (
    `ⓚ${index + 1}화\n${`본문-${index + 1} `.repeat(80)}\n`
  )).join(""));
}

test("groups natural chapters into gap-free full-work segments", () => {
  const bytes = source(12);
  const segments = buildDeepReadSegments(bytes, 12, Math.ceil(bytes.byteLength / 3));
  assert.ok(segments.length >= 3);
  assert.equal(segments[0].startByte, 0);
  assert.equal(segments.at(-1).endByte, bytes.byteLength);
  assert.equal(segments.flatMap((segment) => segment.chapters).length, 12);
  for (let index = 1; index < segments.length; index += 1) {
    assert.equal(segments[index].startByte, segments[index - 1].endByte);
  }
});

test("binds target segmentation and current runtime identity into the work digest", () => {
  const bytes = source(4);
  const selectionEntry = {
    sourceId: "gdrive-work-digest",
    sourceSha256: sha256(bytes),
    sizeBytes: bytes.byteLength,
    chapterCount: 4,
  };
  const runtime = {
    configBytes: Buffer.from("config"),
    contextLimitEntryBytes: Buffer.from("limit"),
    soulBytes: Buffer.from("soul"),
    contextLimit: 272_000,
    runtimeAttestation: "current-attested",
    soulSha256: "1".repeat(64),
    contentNeutralContractId: "fiction-content-neutral-ko/v1",
    contentNeutralContractSha256: "2".repeat(64),
    contentNeutralSoulSectionSha256: "3".repeat(64),
    hermesExecutableSha256: "4".repeat(64),
    hermesDelegatedExecutableSha256: "5".repeat(64),
    hermesVersionSha256: "6".repeat(64),
    hermesImplementationSha256: "7".repeat(64),
    hermesDependencySha256: "8".repeat(64),
    hermesProfileContextSha256: "9".repeat(64),
    hermesProjectContextSha256: "a".repeat(64),
    hermesRuntimeIdentitySha256: "b".repeat(64),
  };
  const base = {
    genre: "murim-ko",
    soulId: "male-murim-ko",
    profileId: "inkos_male_murim",
    selectionEntry,
    targetBytes: Math.ceil(bytes.byteLength / 2),
    segments: buildDeepReadSegments(bytes, 4, Math.ceil(bytes.byteLength / 2)),
    runtime,
  };
  const digest = buildDeepReadWorkInputDigest(base);
  assert.notEqual(buildDeepReadWorkInputDigest({ ...base, targetBytes: base.targetBytes + 1 }), digest);
  assert.notEqual(buildDeepReadWorkInputDigest({
    ...base,
    runtime: { ...runtime, hermesDependencySha256: "c".repeat(64) },
  }), digest);
  assert.notEqual(buildDeepReadWorkInputDigest({
    ...base,
    selectionEntry: { ...selectionEntry, sourceSha256: "d".repeat(64) },
  }), digest);
});

test("fresh deep-read prompts and domain seals bind only opaque exact inputs", () => {
  const manifest = {
    schemaVersion: "private-genre-soul-deep-read-segment-manifest/v2",
    promptContractVersion: "private-genre-soul-deep-read-segment-prompt/v4",
    profileId: "inkos_male_murim",
    sourceId: "gdrive-deep-current",
    sourceSha256: "a".repeat(64),
    genre: "murim-ko",
    segmentId: "s0001",
    coverage: { startByte: 0, endByte: 200 },
    chapterFiles: [
      { inputId: "input-002", fileId: "c0001", chapterSequence: 1, chapterNumber: 1, startByte: 0, endByte: 100, sha256: "b".repeat(64) },
      { inputId: "input-003", fileId: "c0002", chapterSequence: 2, chapterNumber: 2, startByte: 100, endByte: 200, sha256: "c".repeat(64) },
    ],
  };
  const prompt = buildCurrentDeepReadSegmentPrompt(manifest);
  assert.match(prompt, /firefly_read_source/u);
  assert.match(prompt, /input-001/u);
  assert.match(prompt, /input-002/u);
  assert.match(prompt, /input-003/u);
  assert.doesNotMatch(prompt, /read_file|\/private\/|\.txt/u);
  const workInputDigest = "d".repeat(64);
  const segmentInputDigest = buildCurrentDeepReadSegmentInputDigest({ workInputDigest, manifest, prompt });
  const result = {
    schemaVersion: "private-genre-soul-deep-read-segment/v1",
    sourceId: manifest.sourceId,
    sourceSha256: manifest.sourceSha256,
    genre: manifest.genre,
    segmentId: manifest.segmentId,
    coverage: manifest.coverage,
    observations: ["commercial-engine", "protagonist-action", "pressure-resistance", "payoff-witness"].map((kind) => ({
      kind,
      finding: "구체적인 파생 관찰",
      commercialFunction: "기능",
      chapterSequences: [1],
    })),
    unresolvedPromises: [],
  };
  const readCapabilityBytes = Buffer.from("capability\n");
  const receipt = {
    role: `genre-soul-deep-read:${manifest.sourceId}:${manifest.segmentId}`,
    inputDigest: segmentInputDigest,
    runId: "run-current-deep",
    profileId: manifest.profileId,
    model: "gpt-5.6-sol",
    provider: "openai-codex",
    reasoningEffort: "high",
    profileConfigSha256: "e".repeat(64),
    soulSha256: "f".repeat(64),
    runtimeAttestation: "current-attested",
    promptSha256: sha256(Buffer.from(prompt)),
    expectedReadCount: 3,
    exactReadCount: 3,
    exactReadSha256s: [sha256(Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)), "b".repeat(64), "c".repeat(64)],
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
    inputTokens: 100,
    outputTokens: 50,
    reasoningTokens: 25,
    totalTokens: 150,
    apiCalls: 1,
    completedAt: "2026-08-30T00:00:00.000Z",
  };
  const structuredHostReceiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
  const domainReceipt = buildCurrentDeepReadDomainReceipt({
    workInputDigest,
    segmentInputDigest,
    segmentIndex: 0,
    manifest,
    prompt,
    structured: { attempt: "attempts/attempt-current", receipt, result },
    structuredCompletedPointerBytes: Buffer.from("structured-pointer\n"),
    structuredHostReceiptBytes,
    readCapabilityBytes,
  });
  assert.equal(domainReceipt.schemaVersion, "private-hermes-deep-read-segment-receipt/v2");
  assert.equal(domainReceipt.exactReadCount, 2);
  assert.deepEqual(domainReceipt.exactReadSha256s, ["b".repeat(64), "c".repeat(64)]);
  assert.equal(domainReceipt.observationIds.length, 4);
  const domainReceiptBytes = Buffer.from(`${JSON.stringify(domainReceipt, null, 2)}\n`);
  const pointer = buildCurrentDeepReadCompletedPointer({ segmentInputDigest, domainReceipt, domainReceiptBytes });
  assert.equal(pointer.schemaVersion, "private-deep-read-completed-pointer/v2");
  assert.equal(pointer.domainReceiptSha256, sha256(domainReceiptBytes));
  assert.throws(() => buildCurrentDeepReadDomainReceipt({
    workInputDigest,
    segmentInputDigest,
    segmentIndex: 0,
    manifest,
    prompt,
    structured: { attempt: "attempts/attempt-current", receipt, result },
    structuredCompletedPointerBytes: Buffer.from("structured-pointer\n"),
    structuredHostReceiptBytes,
    readCapabilityBytes: Buffer.from("forged\n"),
  }), /does not bind/u);
});

test("validates derived observations only at chapter boundaries", () => {
  const bytes = source(5);
  const segment = buildDeepReadSegments(bytes, 5, bytes.byteLength)[0];
  const expected = {
    sourceId: "gdrive-source",
    sourceSha256: "a".repeat(64),
    genre: "murim-ko",
    segmentId: segment.segmentId,
    coverage: { startByte: segment.startByte, endByte: segment.endByte },
    chapters: segment.chapters,
  };
  const result = {
    schemaVersion: "private-genre-soul-deep-read-segment/v1",
    sourceId: expected.sourceId,
    sourceSha256: expected.sourceSha256,
    genre: expected.genre,
    segmentId: expected.segmentId,
    coverage: expected.coverage,
    observations: Array.from({ length: 4 }, (_, index) => ({
      kind: ["commercial-engine", "protagonist-action", "pressure-resistance", "payoff-witness"][index],
      finding: "구체적인 파생 관찰",
      commercialFunction: "기능",
      chapterSequences: [segment.chapters[0].sequence],
    })),
    unresolvedPromises: [],
  };
  assert.equal(validatePrivateDeepReadSegment(result, expected), true);
  const legacy = structuredClone(result);
  for (const observation of legacy.observations) {
    delete observation.chapterSequences;
    observation.evidenceRanges = [{
      startByte: segment.chapters[0].startByte,
      endByte: segment.chapters[0].endByte,
    }];
  }
  assert.equal(validatePrivateDeepReadSegment(legacy, expected), true);
  const drifted = structuredClone(result);
  drifted.observations[0].chapterSequences[0] = 999;
  assert.throws(() => validatePrivateDeepReadSegment(drifted, expected), /invalid chapter sequence/u);

  const bothSelectors = structuredClone(result);
  bothSelectors.observations[0].evidenceRanges = [{
    startByte: segment.chapters[0].startByte,
    endByte: segment.chapters[0].endByte,
  }];
  assert.throws(() => validatePrivateDeepReadSegment(bothSelectors, expected), /exactly one evidence selector/u);

  const extraObservationKey = structuredClone(result);
  extraObservationKey.observations[0].sourceTitle = "private title";
  assert.throws(() => validatePrivateDeepReadSegment(extraObservationKey, expected), /keys must be exactly/u);

  const extraRangeKey = structuredClone(legacy);
  extraRangeKey.observations[0].evidenceRanges[0].sliceSha256 = "b".repeat(64);
  assert.throws(() => validatePrivateDeepReadSegment(extraRangeKey, expected), /keys must be exactly/u);
});

test("rejects conflicting read_file path aliases", () => {
  assert.equal(resolveDeepReadReadFilePath({
    function: { arguments: JSON.stringify({ path: "/bound", file_path: "/bound" }) },
  }), "/bound");
  assert.throws(() => resolveDeepReadReadFilePath({
    function: { arguments: JSON.stringify({ path: "/bound", file_path: "/outside" }) },
  }), /path arguments conflict/u);
});

test("labels historical receipts as legacy-unattested and new receipts as current-attested", () => {
  assert.equal(classifyDeepReadRuntimeAttestation({}), "legacy-unattested");
  assert.equal(
    classifyDeepReadRuntimeAttestation({ runtimeAttestation: "current-attested" }),
    "current-attested",
  );
  assert.throws(
    () => classifyDeepReadRuntimeAttestation({ runtimeAttestation: "legacy-unattested" }),
    /runtime attestation is invalid/u,
  );
  assert.throws(
    () => classifyDeepReadRuntimeAttestation({ runtimeAttestation: "claimed-without-proof" }),
    /runtime attestation is invalid/u,
  );
});

test("scans the exact candidate bytes and publishes the tracked artifact marker last", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "deep-read-publish-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { artifactPath, leakReceiptPath, artifactRelativePath } = publishPaths(root);
  const artifactBytes = Buffer.from("{\"safe\":true}\n");
  const missing = async (path) => {
    try {
      await access(path);
      return false;
    } catch (error) {
      if (error?.code === "ENOENT") return true;
      throw error;
    }
  };

  await assert.rejects(publishDeepReadTrackedProjection({
    ...testPublishOptions(root, artifactBytes),
    testOnlyScanner: async ({ artifactRelativePath: scannedPath, artifactBytes: scannedBytes }) => {
      assert.equal(scannedPath, artifactRelativePath);
      assert.equal(scannedBytes.compare(artifactBytes), 0);
      assert.equal(await missing(artifactPath), true);
      return leakReceipt(scannedPath, scannedBytes, "quarantine");
    },
  }), /not byte- and corpus-bound/u);
  assert.equal(await missing(artifactPath), true);
  assert.equal(await missing(leakReceiptPath), true);

  await publishDeepReadTrackedProjection({
    ...testPublishOptions(root, artifactBytes),
    testOnlyScanner: async ({ artifactRelativePath: scannedPath, artifactBytes: scannedBytes }) => {
      assert.equal(scannedBytes.compare(artifactBytes), 0);
      assert.equal(await missing(artifactPath), true);
      return leakReceipt(scannedPath, scannedBytes);
    },
    testOnlyHooks: {
      afterSupportPublish: async () => {
        assert.equal(await missing(leakReceiptPath), false);
        assert.equal(await missing(artifactPath), true);
      },
    },
  });
  assert.equal((await readFile(artifactPath)).compare(artifactBytes), 0);
  const leak = JSON.parse(await readFile(leakReceiptPath, "utf8"));
  assert.equal(leak.artifact.path, artifactRelativePath);
  assert.equal(leak.artifact.sizeBytes, artifactBytes.byteLength);
  const lockRoot = join(root, "exports/genre-souls/.deep-read-publish-locks");
  const releasedBeforeReuse = (await readdir(lockRoot)).filter((name) => name.includes(".lock.released-")).length;
  await publishDeepReadTrackedProjection({
    ...testPublishOptions(root, artifactBytes),
    testOnlyScanner: async () => { throw new Error("reuse must not rescan"); },
  });
  const releasedLocks = (await readdir(lockRoot))
    .filter((name) => name.includes(".lock.released-"));
  assert.equal(releasedLocks.length, releasedBeforeReuse + 1);
});

test("publication snapshots caller bytes before an asynchronous scanner can mutate them", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "deep-read-publish-snapshot-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const original = Buffer.from("{\"candidate\":\"original\"}\n");
  const callerBytes = Buffer.from(original);
  const { artifactPath } = publishPaths(root);
  await publishDeepReadTrackedProjection({
    ...testPublishOptions(root, callerBytes),
    testOnlyScanner: async ({ artifactRelativePath, artifactBytes: scannedBytes }) => {
      callerBytes.fill(0x78);
      assert.equal(scannedBytes.compare(original), 0);
      return leakReceipt(artifactRelativePath, scannedBytes);
    },
  });
  assert.equal((await readFile(artifactPath)).compare(original), 0);
  assert.notEqual(callerBytes.compare(original), 0);
});

test("publication rejects a scan receipt bound to different candidate bytes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "deep-read-publish-drift-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const artifactBytes = Buffer.from("{\"candidate\":\"bound\"}\n");
  const { artifactPath, leakReceiptPath } = publishPaths(root);
  await assert.rejects(publishDeepReadTrackedProjection({
    ...testPublishOptions(root, artifactBytes),
    testOnlyScanner: async ({ artifactRelativePath, artifactBytes: scannedBytes }) => {
      scannedBytes.fill(0x20);
      return leakReceipt(artifactRelativePath, scannedBytes);
    },
  }), /not byte- and corpus-bound/u);
  await assert.rejects(access(artifactPath), /ENOENT/u);
  await assert.rejects(access(leakReceiptPath), /ENOENT/u);
});

test("tracked publication refuses dangling symbolic-link markers", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "deep-read-publish-link-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const artifactBytes = Buffer.from("{}\n");
  const { artifactPath } = publishPaths(root);
  const escapedPath = join(root, "escaped.json");
  await mkdir(join(root, "analyses/genre_souls/male-modern-fantasy-ko/v1/work-studies"), { recursive: true });
  await symlink(escapedPath, artifactPath);
  await assert.rejects(publishDeepReadTrackedProjection({
    ...testPublishOptions(root, artifactBytes),
    testOnlyScanner: async ({ artifactRelativePath, artifactBytes: scannedBytes }) => (
      leakReceipt(artifactRelativePath, scannedBytes)
    ),
  }), /symbolic link|not a real file/u);
  await assert.rejects(access(escapedPath), /ENOENT/u);
});

test("production publication rejects scanner injection and test overrides require an explicit boundary", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "deep-read-publish-boundary-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const artifactBytes = Buffer.from("{}\n");
  const base = testPublishOptions(root, artifactBytes);
  delete base.testOnly;
  delete base.testOnlyRepositoryRoot;
  delete base.testOnlyExpectedCorpus;
  await assert.rejects(publishDeepReadTrackedProjection({
    ...base,
    scanner: async () => ({}),
  }), /forbids dependency injection/u);
  await assert.rejects(publishDeepReadTrackedProjection({
    ...base,
    testOnlyScanner: async () => ({}),
  }), /require testOnly=true/u);
});

test("production deep-read publication is sealed to the physical canonical repository and exact pair before dependencies or mutation", async (t) => {
  const otherRoot = await mkdtemp(join(tmpdir(), "deep-read-production-other-root-"));
  const aliasParent = await mkdtemp(join(tmpdir(), "deep-read-production-alias-"));
  const symlinkAlias = join(aliasParent, "reference-lab-alias");
  await symlink(ACTUAL_REPOSITORY_ROOT, symlinkAlias);
  t.after(() => Promise.all([
    rm(otherRoot, { recursive: true, force: true }),
    rm(aliasParent, { recursive: true, force: true }),
  ]));
  const artifactBytes = Buffer.from("{}\n");
  for (const root of [otherRoot, symlinkAlias, CASE_ALIAS_REPOSITORY_ROOT]) {
    const paths = publishPaths(root, "gdrive-production-capability");
    await assert.rejects(publishDeepReadTrackedProjection({
      repositoryRoot: root,
      artifactPath: paths.artifactPath,
      leakReceiptPath: paths.leakReceiptPath,
      artifactBytes,
    }), /canonical Reference Lab repository root/u);
  }
  assert.deepEqual(await readdir(otherRoot), []);

  const arbitraryArtifact = join(
    ACTUAL_REPOSITORY_ROOT,
    `analyses/genre_souls/male-modern-fantasy-ko/v1/work-studies/publisher-capability-${process.pid}.json`,
  );
  const arbitraryLeak = join(
    ACTUAL_REPOSITORY_ROOT,
    `analyses/genre_souls/male-modern-fantasy-ko/v1/leak-scan-receipts/publisher-capability-${process.pid}.json`,
  );
  await assert.rejects(publishDeepReadTrackedProjection({
    repositoryRoot: ACTUAL_REPOSITORY_ROOT,
    artifactPath: arbitraryArtifact,
    leakReceiptPath: arbitraryLeak,
    artifactBytes,
  }), /not a canonical work-study target/u);
  await assert.rejects(access(arbitraryArtifact), /ENOENT/u);
  await assert.rejects(access(arbitraryLeak), /ENOENT/u);
});

test("test-only deep-read publication requires an isolated repository root before scanner or mutation", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "deep-read-publish-isolated-root-"));
  const aliasParent = await mkdtemp(join(tmpdir(), "deep-read-publish-isolated-alias-"));
  const aliasRoot = join(aliasParent, "test-root-alias");
  await symlink(root, aliasRoot);
  t.after(() => Promise.all([
    rm(root, { recursive: true, force: true }),
    rm(aliasParent, { recursive: true, force: true }),
  ]));
  const artifactBytes = Buffer.from("{}\n");
  const paths = publishPaths(root, "gdrive-isolated-boundary");
  let scannerCalls = 0;
  const base = {
    repositoryRoot: root,
    artifactPath: paths.artifactPath,
    leakReceiptPath: paths.leakReceiptPath,
    artifactBytes,
    testOnly: true,
    testOnlyExpectedCorpus: TEST_CORPUS,
    testOnlyScanner: async () => {
      scannerCalls += 1;
      throw new Error("scanner must not run");
    },
  };
  await assert.rejects(
    publishDeepReadTrackedProjection(base),
    /requires an explicit testOnlyRepositoryRoot/u,
  );
  await assert.rejects(
    publishDeepReadTrackedProjection({
      ...base,
      repositoryRoot: ACTUAL_REPOSITORY_ROOT,
      testOnlyRepositoryRoot: ACTUAL_REPOSITORY_ROOT,
    }),
    /must not equal the canonical Reference Lab repository root/u,
  );
  await assert.rejects(
    publishDeepReadTrackedProjection({
      ...base,
      repositoryRoot: CASE_ALIAS_REPOSITORY_ROOT,
      testOnlyRepositoryRoot: CASE_ALIAS_REPOSITORY_ROOT,
    }),
    /must not equal the canonical Reference Lab repository root/u,
  );
  const aliasPaths = publishPaths(aliasRoot, "gdrive-isolated-boundary");
  await assert.rejects(
    publishDeepReadTrackedProjection({
      ...base,
      repositoryRoot: aliasRoot,
      testOnlyRepositoryRoot: aliasRoot,
      artifactPath: aliasPaths.artifactPath,
      leakReceiptPath: aliasPaths.leakReceiptPath,
    }),
    /physical non-symlink directory/u,
  );
  assert.equal(scannerCalls, 0);
  await assert.rejects(access(paths.artifactPath), /ENOENT/u);
  await assert.rejects(access(paths.leakReceiptPath), /ENOENT/u);
});

test("publication validates the exact scanner and canonical corpus receipt shape", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "deep-read-publish-corpus-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const artifactBytes = Buffer.from("{}\n");
  const { artifactPath, leakReceiptPath } = publishPaths(root);
  await assert.rejects(publishDeepReadTrackedProjection({
    ...testPublishOptions(root, artifactBytes),
    testOnlyScanner: async ({ artifactRelativePath, artifactBytes: scannedBytes }) => ({
      ...leakReceipt(artifactRelativePath, scannedBytes),
      corpus: { ...TEST_CORPUS, availableSourceCount: 4 },
    }),
  }), /not byte- and corpus-bound/u);
  await assert.rejects(access(artifactPath), /ENOENT/u);
  await assert.rejects(access(leakReceiptPath), /ENOENT/u);
});

test("publication lock serializes the exact target set", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "deep-read-publish-concurrent-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const artifactBytes = Buffer.from("{}\n");
  let entered;
  let release;
  const started = new Promise((resolvePromise) => { entered = resolvePromise; });
  const gate = new Promise((resolvePromise) => { release = resolvePromise; });
  const first = publishDeepReadTrackedProjection({
    ...testPublishOptions(root, artifactBytes),
    testOnlyScanner: async ({ artifactRelativePath, artifactBytes: scannedBytes }) => {
      entered();
      await gate;
      return leakReceipt(artifactRelativePath, scannedBytes);
    },
  });
  await started;
  await assert.rejects(publishDeepReadTrackedProjection({
    ...testPublishOptions(root, artifactBytes),
    testOnlyScanner: async ({ artifactRelativePath, artifactBytes: scannedBytes }) => (
      leakReceipt(artifactRelativePath, scannedBytes)
    ),
  }), /publish lock exists/u);
  release();
  await first;
});

test("failure after support publication preserves support and lock for manual audit", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "deep-read-publish-partial-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const artifactBytes = Buffer.from("{}\n");
  const { artifactPath, leakReceiptPath } = publishPaths(root);
  await assert.rejects(publishDeepReadTrackedProjection({
    ...testPublishOptions(root, artifactBytes),
    testOnlyScanner: async ({ artifactRelativePath, artifactBytes: scannedBytes }) => (
      leakReceipt(artifactRelativePath, scannedBytes)
    ),
    testOnlyHooks: {
      afterSupportPublish: async () => { throw new Error("simulated SIGKILL boundary"); },
    },
  }), /lock preserved for manual audit/u);
  assert.equal((await readFile(leakReceiptPath)).byteLength > 0, true);
  await assert.rejects(access(artifactPath), /ENOENT/u);
  const locks = await readdir(join(root, "exports/genre-souls/.deep-read-publish-locks"));
  assert.equal(locks.filter((entry) => entry.endsWith(".lock")).length, 1);
  await assert.rejects(publishDeepReadTrackedProjection({
    ...testPublishOptions(root, artifactBytes),
    testOnlyScanner: async ({ artifactRelativePath, artifactBytes: scannedBytes }) => (
      leakReceipt(artifactRelativePath, scannedBytes)
    ),
  }), /manual audit/u);
});

test("preexisting marker-only and support-only deep-read states preserve their live publish locks", async (t) => {
  const roots = await Promise.all(["marker", "support"].map((kind) => (
    mkdtemp(join(tmpdir(), `deep-read-publish-inverse-${kind}-`))
  )));
  t.after(() => Promise.all(roots.map((root) => rm(root, { recursive: true, force: true }))));
  const artifactBytes = Buffer.from("{}\n");
  for (const [index, root] of roots.entries()) {
    const { artifactPath, leakReceiptPath, artifactRelativePath } = publishPaths(root);
    const preexistingPath = index === 0 ? artifactPath : leakReceiptPath;
    const preexistingBytes = index === 0
      ? artifactBytes
      : Buffer.from(`${JSON.stringify(leakReceipt(artifactRelativePath, artifactBytes), null, 2)}\n`);
    await mkdir(dirname(preexistingPath), { recursive: true });
    await writeFile(preexistingPath, preexistingBytes);
    let scanned = false;
    await assert.rejects(publishDeepReadTrackedProjection({
      ...testPublishOptions(root, artifactBytes),
      testOnlyScanner: async () => {
        scanned = true;
        throw new Error("scanner must not run for an inverse partial");
      },
    }), /inconsistent preexisting marker\/support partial state.*lock preserved for manual audit/u);
    assert.equal(scanned, false);
    const lockRoot = join(root, "exports/genre-souls/.deep-read-publish-locks");
    const liveLocks = (await readdir(lockRoot)).filter((name) => name.endsWith(".lock"));
    assert.equal(liveLocks.length, 1);
    assert.equal(JSON.parse(await readFile(join(lockRoot, liveLocks[0], "owner.json"), "utf8")).pid, process.pid);
  }
});

test("deep-read publish lock release quarantine never removes a replacement at the live pathname", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "deep-read-publish-release-replacement-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const artifactBytes = Buffer.from("{}\n");
  let liveLockPath;
  let releasePath;
  let liveLockIdentity;
  let liveOwnerIdentity;
  const temporaryReleases = [];
  const result = await publishDeepReadTrackedProjection({
    ...testPublishOptions(root, artifactBytes),
    testOnlyScanner: async ({ artifactRelativePath, artifactBytes: scannedBytes }) => (
      leakReceipt(artifactRelativePath, scannedBytes)
    ),
    testOnlyHooks: {
      afterSupportPublish: async () => {
        const lockRoot = join(root, "exports/genre-souls/.deep-read-publish-locks");
        const [liveName] = (await readdir(lockRoot)).filter((name) => name.endsWith(".lock"));
        liveLockPath = join(lockRoot, liveName);
        const [lockInfo, ownerInfo] = await Promise.all([
          lstat(liveLockPath),
          lstat(join(liveLockPath, "owner.json")),
        ]);
        liveLockIdentity = { dev: String(lockInfo.dev), ino: String(lockInfo.ino) };
        liveOwnerIdentity = { dev: String(ownerInfo.dev), ino: String(ownerInfo.ino) };
      },
      afterTemporaryReleaseRename: async (paths) => {
        temporaryReleases.push(paths);
        await writeFile(paths.liveTemporaryPath, "foreign-temp\n");
      },
      afterLockReleaseRename: async (paths) => {
        ({ releasePath } = paths);
        assert.equal(paths.liveLockPath, liveLockPath);
        await mkdir(liveLockPath);
        await writeFile(join(liveLockPath, "foreign.txt"), "foreign\n");
      },
    },
  });
  assert.equal(result.artifactState, "created");
  assert.equal(await readFile(join(liveLockPath, "foreign.txt"), "utf8"), "foreign\n");
  const releasedOwnerBytes = await readFile(join(releasePath, "owner.json"));
  assert.equal(JSON.parse(releasedOwnerBytes.toString("utf8")).pid, process.pid);
  const [releasedLockInfo, releasedOwnerInfo] = await Promise.all([
    lstat(releasePath),
    lstat(join(releasePath, "owner.json")),
  ]);
  assert.deepEqual({ dev: String(releasedLockInfo.dev), ino: String(releasedLockInfo.ino) }, liveLockIdentity);
  assert.deepEqual({ dev: String(releasedOwnerInfo.dev), ino: String(releasedOwnerInfo.ino) }, liveOwnerIdentity);
  assert.match(
    basename(releasePath),
    new RegExp(`-${liveLockIdentity.dev}-${liveLockIdentity.ino}-${liveOwnerIdentity.dev}-${liveOwnerIdentity.ino}-${sha256(releasedOwnerBytes)}$`, "u"),
  );
  assert.equal(temporaryReleases.length, 2);
  for (const temporary of temporaryReleases) {
    assert.equal(await readFile(temporary.liveTemporaryPath, "utf8"), "foreign-temp\n");
    const quarantineBytes = await readFile(temporary.releasePath);
    const quarantineInfo = await lstat(temporary.releasePath);
    assert.equal(quarantineInfo.isFile(), true);
    assert.ok(quarantineInfo.nlink >= 2);
    assert.match(
      basename(temporary.releasePath),
      new RegExp(`^file\\.released-[a-f0-9]{32}-${quarantineInfo.dev}-${quarantineInfo.ino}-${sha256(quarantineBytes)}-${quarantineBytes.byteLength}$`, "u"),
    );
  }
});

test("deep-read publish lock rejects a semantically damaged content-rebound tombstone", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "deep-read-publish-damaged-tombstone-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const artifactBytes = Buffer.from("{}\n");
  const options = {
    ...testPublishOptions(root, artifactBytes),
    testOnlyScanner: async ({ artifactRelativePath, artifactBytes: scannedBytes }) => (
      leakReceipt(artifactRelativePath, scannedBytes)
    ),
  };
  await publishDeepReadTrackedProjection(options);
  const lockParent = join(root, "exports/genre-souls/.deep-read-publish-locks");
  const [releasedName] = (await readdir(lockParent)).filter((name) => name.includes(".lock.released-"));
  const releasedPath = join(lockParent, releasedName);
  const ownerPath = join(releasedPath, "owner.json");
  const ownerInfoBefore = await lstat(ownerPath);
  const owner = JSON.parse(await readFile(ownerPath, "utf8"));
  delete owner.targetPaths;
  const damagedBytes = Buffer.from(`${JSON.stringify(owner, null, 2)}\n`);
  await writeFile(ownerPath, damagedBytes);
  const ownerInfoAfter = await lstat(ownerPath);
  assert.deepEqual(
    { dev: ownerInfoAfter.dev, ino: ownerInfoAfter.ino },
    { dev: ownerInfoBefore.dev, ino: ownerInfoBefore.ino },
  );
  const reboundName = releasedName.replace(/[a-f0-9]{64}$/u, sha256(damagedBytes));
  await rename(releasedPath, join(lockParent, reboundName));
  await assert.rejects(
    publishDeepReadTrackedProjection(options),
    /released quarantine owner contract drifted; manual audit is required/u,
  );
});

test("serializes one source across input digests and preserves lock ownership", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "deep-read-lock-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workDir = join(root, "exports/deep-read-runs/gdrive-fixture");
  const sourceId = "gdrive-fixture";
  const firstDigest = "1".repeat(64);
  const secondDigest = "2".repeat(64);
  let release;
  let entered;
  const gate = new Promise((resolvePromise) => { release = resolvePromise; });
  const started = new Promise((resolvePromise) => { entered = resolvePromise; });
  const first = withDeepReadWorkLock({ repositoryRoot: root, workDir, sourceId, inputDigest: firstDigest }, async () => {
    entered();
    await gate;
    return "first";
  });
  await started;
  const ownerPath = join(root, "exports/deep-read-runs/.work-locks/gdrive-fixture.lock/owner.json");
  const owner = JSON.parse(await readFile(ownerPath, "utf8"));
  assert.equal(owner.inputDigest, firstDigest);
  await assert.rejects(
    withDeepReadWorkLock({ repositoryRoot: root, workDir, sourceId, inputDigest: secondDigest }, async () => "second"),
    /concurrent or stale execution/u,
  );
  release();
  assert.equal(await first, "first");
  assert.equal(await withDeepReadWorkLock(
    { repositoryRoot: root, workDir, sourceId, inputDigest: secondDigest },
    async () => "second",
  ), "second");
  const released = (await readdir(join(root, "exports/deep-read-runs/.work-locks")))
    .filter((name) => name.startsWith("gdrive-fixture.lock.released-"));
  assert.equal(released.length, 2);
});

test("deep-read work lock rejects a semantically damaged content-rebound tombstone", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "deep-read-work-damaged-tombstone-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workDir = join(root, "exports/deep-read-runs/gdrive-fixture");
  const input = {
    repositoryRoot: root,
    workDir,
    sourceId: "gdrive-fixture",
    inputDigest: "7".repeat(64),
  };
  await withDeepReadWorkLock(input, async () => "done");
  const lockParent = join(root, "exports/deep-read-runs/.work-locks");
  const [releasedName] = (await readdir(lockParent)).filter((name) => name.includes(".lock.released-"));
  const releasedPath = join(lockParent, releasedName);
  const ownerPath = join(releasedPath, "owner.json");
  const ownerInfoBefore = await lstat(ownerPath);
  const owner = JSON.parse(await readFile(ownerPath, "utf8"));
  delete owner.sourceId;
  const damagedBytes = Buffer.from(`${JSON.stringify(owner, null, 2)}\n`);
  await writeFile(ownerPath, damagedBytes);
  const ownerInfoAfter = await lstat(ownerPath);
  assert.deepEqual(
    { dev: ownerInfoAfter.dev, ino: ownerInfoAfter.ino },
    { dev: ownerInfoBefore.dev, ino: ownerInfoBefore.ino },
  );
  const reboundName = releasedName.replace(/[a-f0-9]{64}$/u, sha256(damagedBytes));
  await rename(releasedPath, join(lockParent, reboundName));
  await assert.rejects(
    withDeepReadWorkLock(input, async () => "must-not-run"),
    /released quarantine owner contract drifted; manual audit is required/u,
  );
});

test("deep-read work lock release quarantine never removes a replacement at the live pathname", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "deep-read-work-release-replacement-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workDir = join(root, "exports/deep-read-runs/gdrive-fixture");
  let liveLockPath;
  let releasePath;
  let liveLockIdentity;
  let liveOwnerIdentity;
  assert.equal(await withDeepReadWorkLock({
    repositoryRoot: root,
    workDir,
    sourceId: "gdrive-fixture",
    inputDigest: "4".repeat(64),
    testOnly: true,
    testOnlyAfterReleaseRename: async (paths) => {
      ({ liveLockPath, releasePath } = paths);
      await mkdir(liveLockPath);
      await writeFile(join(liveLockPath, "foreign.txt"), "foreign\n");
    },
  }, async () => {
    const [lockInfo, ownerInfo] = await Promise.all([
      lstat(join(root, "exports/deep-read-runs/.work-locks/gdrive-fixture.lock")),
      lstat(join(root, "exports/deep-read-runs/.work-locks/gdrive-fixture.lock/owner.json")),
    ]);
    liveLockIdentity = { dev: String(lockInfo.dev), ino: String(lockInfo.ino) };
    liveOwnerIdentity = { dev: String(ownerInfo.dev), ino: String(ownerInfo.ino) };
    return "done";
  }), "done");
  assert.equal(await readFile(join(liveLockPath, "foreign.txt"), "utf8"), "foreign\n");
  const ownerBytes = await readFile(join(releasePath, "owner.json"));
  assert.equal(JSON.parse(ownerBytes.toString("utf8")).inputDigest, "4".repeat(64));
  const [releasedLockInfo, releasedOwnerInfo] = await Promise.all([
    lstat(releasePath),
    lstat(join(releasePath, "owner.json")),
  ]);
  assert.deepEqual({ dev: String(releasedLockInfo.dev), ino: String(releasedLockInfo.ino) }, liveLockIdentity);
  assert.deepEqual({ dev: String(releasedOwnerInfo.dev), ino: String(releasedOwnerInfo.ino) }, liveOwnerIdentity);
  assert.match(
    basename(releasePath),
    new RegExp(`-${liveLockIdentity.dev}-${liveLockIdentity.ino}-${liveOwnerIdentity.dev}-${liveOwnerIdentity.ino}-${sha256(ownerBytes)}$`, "u"),
  );
});

test("deep-read work lock release hooks require test mode and a physically isolated root", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "deep-read-work-hook-boundary-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const operation = async () => "must-not-run";
  const hook = async () => {};
  await assert.rejects(withDeepReadWorkLock({
    repositoryRoot: root,
    workDir: join(root, "exports/deep-read-runs/gdrive-fixture"),
    sourceId: "gdrive-fixture",
    inputDigest: "5".repeat(64),
    testOnlyAfterReleaseRename: hook,
  }, operation), /requires testOnly=true/u);
  for (const canonicalAlias of [ACTUAL_REPOSITORY_ROOT, CASE_ALIAS_REPOSITORY_ROOT]) {
    await assert.rejects(withDeepReadWorkLock({
      repositoryRoot: canonicalAlias,
      workDir: join(canonicalAlias, "exports/deep-read-runs/gdrive-hook-boundary"),
      sourceId: "gdrive-hook-boundary",
      inputDigest: "6".repeat(64),
      testOnly: true,
      testOnlyAfterReleaseRename: hook,
    }, operation), /must not equal the canonical Reference Lab repository root/u);
  }
  assert.deepEqual(await readdir(root), []);
});

test("work lock refuses a symbolic-link lock namespace", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "deep-read-lock-link-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const parent = join(root, "exports/deep-read-runs");
  const escaped = join(root, "escaped-locks");
  await Promise.all([mkdir(parent, { recursive: true }), mkdir(escaped)]);
  await symlink(escaped, join(parent, ".work-locks"), "dir");
  await assert.rejects(withDeepReadWorkLock({
    repositoryRoot: root,
    workDir: join(parent, "gdrive-fixture"),
    sourceId: "gdrive-fixture",
    inputDigest: "3".repeat(64),
  }, async () => {}), /symbolic-link component/u);
  assert.deepEqual(await readFile(join(escaped, "missing"), "utf8").catch((error) => error.code), "ENOENT");
});
