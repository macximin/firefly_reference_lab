import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildHermesExecutionEnvironment,
  buildHistoricalHermesExecutionEnvironmentDescriptorV2,
  buildHermesStructuredAttemptInputAttestation,
  FICTION_CONTENT_CONTRACT_ID,
  FICTION_CONTENT_CONTRACT_SHA256,
  HERMES_EXACT_INPUT_AUTH_PROJECTION_CONTRACT,
  HERMES_STRUCTURED_ATTEMPT_INPUT_ATTESTATION_RUNTIME_KEYS,
  HERMES_STRUCTURED_ATTEMPT_INPUT_ATTESTATION_SCHEMA,
} from "../tools/genre-soul-hermes-run-lib.mjs";
import {
  buildCurrentDeepReadCompletedPointer,
  buildCurrentDeepReadDomainReceipt,
  buildCurrentDeepReadSegmentInputDigest,
  buildCurrentDeepReadSegmentPrompt,
  buildDeepReadSegments,
  buildDeepReadWorkInputDescriptor,
  buildDeepReadWorkInputDigest,
  classifyDeepReadRuntimeAttestation,
  publishDeepReadTrackedProjection,
  resolveDeepReadReadFilePath,
  validateDeepReadCompletedAttempt,
  validatePrivateDeepReadSegment,
  withDeepReadWorkLock,
} from "../tools/genre-soul-deep-read-runner.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function authAdapterPlanningEvidence(fileSha256 = "e".repeat(64)) {
  const descriptor = {
    schemaVersion: "hermes-auth-store-adapter-planning-evidence/v1",
    contractVersion: HERMES_EXACT_INPUT_AUTH_PROJECTION_CONTRACT,
    files: [{ name: "sitecustomize.py", sha256: fileSha256, sizeBytes: 1234 }],
    totalBytes: 1234,
  };
  return { ...descriptor, sha256: sha256(jsonBytes(descriptor)) };
}

function exactReadCursor(inputId, sourceSha256, chunkIndex = 0) {
  return `cursor-${sha256(Buffer.from([
    "firefly-hermes-read-cursor/v1", inputId, sourceSha256, String(chunkIndex),
  ].join("\0")))}`;
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
    exactInputAuthProjectionContractVersion: HERMES_EXACT_INPUT_AUTH_PROJECTION_CONTRACT,
    authAdapterPlanningEvidence: authAdapterPlanningEvidence(),
  };
  assert.equal(
    buildDeepReadWorkInputDescriptor(base).schemaVersion,
    "private-genre-soul-deep-read-work-input-digest/v3",
  );
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
  assert.notEqual(buildDeepReadWorkInputDigest({
    ...base,
    authAdapterPlanningEvidence: authAdapterPlanningEvidence("f".repeat(64)),
  }), digest);
  assert.throws(() => buildDeepReadWorkInputDigest({
    ...base,
    exactInputAuthProjectionContractVersion: undefined,
  }), /auth projection digest binding drifted/u);

  const historical = { ...base };
  delete historical.exactInputAuthProjectionContractVersion;
  delete historical.authAdapterPlanningEvidence;
  assert.equal(
    buildDeepReadWorkInputDescriptor(historical).schemaVersion,
    "private-genre-soul-deep-read-work-input-digest/v2",
  );
  assert.notEqual(buildDeepReadWorkInputDigest(historical), digest);
});

test("fresh deep-read prompts and domain seals bind only opaque exact inputs", () => {
  const manifest = {
    schemaVersion: "private-genre-soul-deep-read-segment-manifest/v2",
    promptContractVersion: "private-genre-soul-deep-read-segment-prompt/v5",
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
  assert.match(prompt, /nextInputId and nextCursor/u);
  assert.doesNotMatch(prompt, /exactly once/u);
  assert.doesNotMatch(prompt, /read_file|\/private\/|\.txt/u);
  assert.throws(() => buildCurrentDeepReadSegmentPrompt({
    ...manifest,
    promptContractVersion: "private-genre-soul-deep-read-segment-prompt/v4",
  }), /canonical pathless manifest/u);
  const workInputDigest = "d".repeat(64);
  const adapterBinding = {
    exactInputAuthProjectionContractVersion: HERMES_EXACT_INPUT_AUTH_PROJECTION_CONTRACT,
    authAdapterPlanningEvidence: authAdapterPlanningEvidence(),
  };
  const segmentInputDigest = buildCurrentDeepReadSegmentInputDigest({
    workInputDigest,
    manifest,
    prompt,
    ...adapterBinding,
  });
  const historicalSegmentInputDigest = buildCurrentDeepReadSegmentInputDigest({ workInputDigest, manifest, prompt });
  assert.equal(historicalSegmentInputDigest, sha256(jsonBytes({
    schemaVersion: "private-genre-soul-deep-read-segment-input-digest/v1",
    workInputDigest,
    promptContractVersion: manifest.promptContractVersion,
    promptSha256: sha256(Buffer.from(prompt)),
    manifestSha256: sha256(jsonBytes(manifest)),
  })));
  assert.notEqual(segmentInputDigest, historicalSegmentInputDigest);
  assert.notEqual(buildCurrentDeepReadSegmentInputDigest({
    workInputDigest,
    manifest,
    prompt,
    ...adapterBinding,
    authAdapterPlanningEvidence: authAdapterPlanningEvidence("f".repeat(64)),
  }), segmentInputDigest);
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
    ...adapterBinding,
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
    ...adapterBinding,
  }), /does not bind/u);
  assert.throws(() => buildCurrentDeepReadDomainReceipt({
    workInputDigest,
    segmentInputDigest,
    segmentIndex: 0,
    manifest,
    prompt,
    structured: { attempt: "attempts/attempt-current", receipt, result },
    structuredCompletedPointerBytes: Buffer.from("structured-pointer\n"),
    structuredHostReceiptBytes,
    readCapabilityBytes,
    ...adapterBinding,
    authAdapterPlanningEvidence: authAdapterPlanningEvidence("f".repeat(64)),
  }), /prompt contract drifted/u);
});

test("reuses a sealed historical current-v2 attempt without entering the auth-required executor", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "deep-read-historical-current-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const profileId = "inkos_male_murim";
  const profileHome = join(root, "profiles", profileId);
  const configBytes = Buffer.from("fixture-config\n");
  const soulBytes = Buffer.from("fixture historical soul\n");
  const contextLimitEntryBytes = Buffer.from("gpt-5.6-sol@fixture: 272000");
  const runtime = {
    runtimeAttestation: "current-attested",
    profileId,
    profileHome,
    configBytes,
    soulBytes,
    soulText: soulBytes.toString("utf8"),
    contextLimitEntryBytes,
    contextLimit: 272_000,
    profileConfigSha256: sha256(configBytes),
    soulSha256: sha256(soulBytes),
    contentNeutralContractId: FICTION_CONTENT_CONTRACT_ID,
    contentNeutralContractSha256: FICTION_CONTENT_CONTRACT_SHA256,
    contentNeutralSoulSectionSha256: "1".repeat(64),
    contextLimitEntrySha256: sha256(contextLimitEntryBytes),
    hermesCommand: join(root, "missing-hermes-that-must-not-run"),
    hermesExecutableSha256: "2".repeat(64),
    hermesDelegatedExecutableSha256: "3".repeat(64),
    hermesVersionSha256: "4".repeat(64),
    hermesImplementationSha256: "5".repeat(64),
    hermesDependencySha256: "6".repeat(64),
    hermesProfileContextSha256: "7".repeat(64),
    hermesProjectContextSha256: "8".repeat(64),
  };
  runtime.hermesRuntimeIdentitySha256 = sha256(jsonBytes({
    runtimeAttestation: runtime.runtimeAttestation,
    profileConfigSha256: runtime.profileConfigSha256,
    soulSha256: runtime.soulSha256,
    contextLimitEntrySha256: runtime.contextLimitEntrySha256,
    hermesExecutableSha256: runtime.hermesExecutableSha256,
    hermesDelegatedExecutableSha256: runtime.hermesDelegatedExecutableSha256,
    hermesVersionSha256: runtime.hermesVersionSha256,
    hermesImplementationSha256: runtime.hermesImplementationSha256,
    hermesDependencySha256: runtime.hermesDependencySha256,
    hermesProfileContextSha256: runtime.hermesProfileContextSha256,
    hermesProjectContextSha256: runtime.hermesProjectContextSha256,
  }));
  const sourceBytes = source(2);
  const segment = buildDeepReadSegments(sourceBytes, 2, sourceBytes.byteLength)[0];
  const selectionEntry = {
    sourceId: "gdrive-historical-current",
    sourceSha256: sha256(sourceBytes),
    sizeBytes: sourceBytes.byteLength,
    chapterCount: 2,
  };
  const workInputDigest = buildDeepReadWorkInputDigest({
    genre: "murim-ko",
    soulId: "male-murim-ko",
    profileId,
    selectionEntry,
    targetBytes: sourceBytes.byteLength,
    segments: [segment],
    runtime,
  });
  const segmentDir = join(root, "historical", "segments", segment.segmentId);
  const chaptersDir = join(segmentDir, "chapters");
  const chapterFiles = segment.chapters.map((chapter) => {
    const fileId = `c${String(chapter.sequence).padStart(4, "0")}`;
    const bytes = sourceBytes.subarray(chapter.startByte, chapter.endByte);
    return {
      fileId,
      path: join(chaptersDir, `${fileId}.txt`),
      bytes,
      chapterSequence: chapter.sequence,
      chapterNumber: chapter.chapterNumber,
      startByte: chapter.startByte,
      endByte: chapter.endByte,
      sha256: sha256(bytes),
    };
  });
  const manifest = {
    schemaVersion: "private-genre-soul-deep-read-segment-manifest/v2",
    promptContractVersion: "private-genre-soul-deep-read-segment-prompt/v5",
    profileId,
    sourceId: selectionEntry.sourceId,
    sourceSha256: selectionEntry.sourceSha256,
    genre: "murim-ko",
    segmentId: segment.segmentId,
    coverage: { startByte: segment.startByte, endByte: segment.endByte },
    chapterFiles: chapterFiles.map((file, index) => ({
      inputId: `input-${String(index + 2).padStart(3, "0")}`,
      fileId: file.fileId,
      chapterSequence: file.chapterSequence,
      chapterNumber: file.chapterNumber,
      startByte: file.startByte,
      endByte: file.endByte,
      sha256: file.sha256,
    })),
  };
  const manifestBytes = jsonBytes(manifest);
  const manifestPath = join(segmentDir, "manifest.json");
  await mkdir(chaptersDir, { recursive: true });
  await Promise.all([
    writeFile(manifestPath, manifestBytes),
    ...chapterFiles.map((file) => writeFile(file.path, file.bytes)),
  ]);
  const prompt = buildCurrentDeepReadSegmentPrompt(manifest);
  const segmentInputDigest = buildCurrentDeepReadSegmentInputDigest({ workInputDigest, manifest, prompt });
  const expectedFiles = [
    { inputId: "input-001", path: manifestPath, bytes: manifestBytes, sha256: sha256(manifestBytes), sizeBytes: manifestBytes.byteLength },
    ...chapterFiles.map((file, index) => ({
      inputId: manifest.chapterFiles[index].inputId,
      path: file.path,
      bytes: file.bytes,
      sha256: file.sha256,
      sizeBytes: file.bytes.byteLength,
    })),
  ];
  const expectedInputs = expectedFiles.map(({ inputId, path, sha256: fileSha256, sizeBytes }) => ({
    inputId,
    path: resolve(path),
    sha256: fileSha256,
    sizeBytes,
  }));
  const readManifestBytes = jsonBytes({ schemaVersion: "firefly-hermes-read-manifest/v1", inputs: expectedInputs });
  const executionPolicy = {
    schemaVersion: "hermes-exact-input-execution-policy/v2",
    homeScope: "ephemeral-system-temp",
    workspaceScope: "empty-ephemeral-system-temp",
    cleanup: "required-before-finalization",
    credentialPersistence: "forbidden",
    pluginDiscovery: "ephemeral-bundled-root",
    readProtocol: "sequential-cursor-chunks-v2",
    resultSchema: "firefly-hermes-read-result/v2",
    cursorProtocol: "firefly-hermes-read-cursor/v1",
    maxSourceBytes: 4_500_000,
    maxEncodedContentChars: 75_000,
    maxResultChars: 80_000,
    preflightAccounting: "deterministic-chunk-transcript",
    forbiddenCredentialNames: [".anthropic_oauth.json", ".env", "auth.json", "credentials.json", "oauth.json", "tokens.json"],
    pythonDontWriteBytecode: "1",
    gitOptionalLocks: "0",
  };
  const pluginFiles = ["__init__.py", "plugin.yaml", "reader.py"].map((name, index) => ({
    name,
    sha256: sha256(`historical-plugin-${index}`),
    sizeBytes: index + 1,
  }));
  const executionEnvironmentSha256 = sha256(jsonBytes({
    schemaVersion: "hermes-exact-input-environment-template/v2",
    executionPolicy,
    baseEnvironmentKeys: ["HERMES_BUNDLED_PLUGINS"],
    manifestBinding: "attempt-scoped-absolute-path-plus-sha256",
    addedEnvironmentKeys: ["FIREFLY_READ_MANIFEST", "FIREFLY_READ_MANIFEST_SHA256"],
  }));
  const executionRuntimeIdentitySha256 = sha256(jsonBytes({
    schemaVersion: "hermes-exact-input-runtime-identity/v2",
    sourceRuntimeIdentitySha256: runtime.hermesRuntimeIdentitySha256,
    manifestSha256: sha256(readManifestBytes),
    pluginFiles,
    executionEnvironmentSha256,
  }));
  const readCapability = {
    schemaVersion: "private-hermes-exact-input-read-capability/v2",
    toolset: "firefly-source-read",
    tool: "firefly_read_source",
    sourceRuntimeIdentitySha256: runtime.hermesRuntimeIdentitySha256,
    executionRuntimeIdentitySha256,
    executionEnvironmentSha256,
    manifest: { sha256: sha256(readManifestBytes), sizeBytes: readManifestBytes.byteLength },
    pluginFiles,
    expectedInputs,
    cliPolicy: {
      flags: ["--oneshot", "--usage-file", "--pass-session-id", "--toolsets", "--model", "--provider"],
      model: "gpt-5.6-sol",
      provider: "openai-codex",
      toolsets: ["firefly-source-read"],
    },
    executionPolicy,
  };
  const readCapabilityBytes = jsonBytes(readCapability);
  const result = {
    schemaVersion: "private-genre-soul-deep-read-segment/v1",
    sourceId: manifest.sourceId,
    sourceSha256: manifest.sourceSha256,
    genre: manifest.genre,
    segmentId: manifest.segmentId,
    coverage: manifest.coverage,
    observations: ["commercial-engine", "protagonist-action", "pressure-resistance", "payoff-witness"].map((kind) => ({
      kind,
      finding: "히스토리컬 재사용 관찰",
      commercialFunction: "상업 기능",
      chapterSequences: [1],
    })),
    unresolvedPromises: [],
  };
  const resultBytes = jsonBytes(result);
  const candidateOutputBytes = Buffer.from(JSON.stringify(result));
  const runId = "historical-current-run";
  const completedAt = "2026-08-30T00:00:00.000Z";
  const usage = {
    cost_usd: 0,
    cost_status: "included",
    cost_source: "none",
    input_tokens: 10,
    output_tokens: 5,
    cache_read_tokens: 5,
    cache_write_tokens: 0,
    reasoning_tokens: 1,
    total_tokens: 20,
    api_calls: expectedFiles.length,
    model: "gpt-5.6-sol",
    provider: "openai-codex",
    session_id: runId,
    completed: true,
    failed: false,
    service_tier: null,
  };
  const readMessages = expectedFiles.flatMap((file, index) => {
    const callId = `${runId}-read-${index + 1}`;
    const nextFile = expectedFiles[index + 1] ?? null;
    return [
      {
        role: "assistant",
        compacted: 0,
        finish_reason: "tool_calls",
        tool_calls: [{
          id: callId,
          function: {
            name: "firefly_read_source",
            arguments: JSON.stringify(index === 0
              ? { inputId: file.inputId }
              : { inputId: file.inputId, cursor: exactReadCursor(file.inputId, file.sha256) }),
          },
        }],
      },
      {
        role: "tool",
        compacted: 0,
        tool_call_id: callId,
        tool_name: "firefly_read_source",
        content: JSON.stringify({
          schemaVersion: "firefly-hermes-read-result/v2",
          inputId: file.inputId,
          sha256: file.sha256,
          sizeBytes: file.sizeBytes,
          chunkIndex: 0,
          chunkCount: 1,
          chunkSha256: file.sha256,
          nextInputId: nextFile?.inputId ?? null,
          nextCursor: nextFile ? exactReadCursor(nextFile.inputId, nextFile.sha256) : null,
          content: file.bytes.toString("utf8"),
        }),
      },
    ];
  });
  const trace = {
    id: runId,
    model: "gpt-5.6-sol",
    billing_provider: "openai-codex",
    profile_name: profileId,
    end_reason: "agent_close",
    ended_at: Date.parse(completedAt) / 1000,
    compression_failure_cooldown_until: null,
    compression_failure_error: null,
    compression_fallback_streak: 0,
    compression_ineffective_count: 0,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_read_tokens: usage.cache_read_tokens,
    cache_write_tokens: usage.cache_write_tokens,
    reasoning_tokens: usage.reasoning_tokens,
    api_call_count: usage.api_calls,
    system_prompt: runtime.soulText,
    messages: [
      { role: "user", compacted: 0, content: prompt },
      ...readMessages,
      { role: "assistant", compacted: 0, finish_reason: "stop", content: candidateOutputBytes.toString("utf8") },
    ],
  };
  const usageBytes = jsonBytes(usage);
  const traceBytes = Buffer.from(`${JSON.stringify(trace)}\n`);
  const contextInputProxyTokens = Math.ceil((
    Buffer.byteLength(trace.system_prompt, "utf8")
    + Buffer.byteLength(JSON.stringify(trace.messages.slice(0, -1)), "utf8")
  ) / 2);
  const inputSha256 = sha256(jsonBytes(expectedInputs.map(({ path, sha256: fileSha256 }) => ({ path, sha256: fileSha256 }))));
  const role = `genre-soul-deep-read:${manifest.sourceId}:${manifest.segmentId}`;
  const receipt = {
    schemaVersion: "private-hermes-structured-run-receipt/v1",
    role,
    runId,
    profileId,
    model: "gpt-5.6-sol",
    provider: "openai-codex",
    readCapabilitySha256: sha256(readCapabilityBytes),
    readCapabilityTool: "firefly_read_source",
    readCapabilityToolset: "firefly-source-read",
    readExecutionEnvironmentSha256: readCapability.executionEnvironmentSha256,
    readExecutionRuntimeIdentitySha256: readCapability.executionRuntimeIdentitySha256,
    readManifestSha256: readCapability.manifest.sha256,
    reasoningEffort: "high",
    runtimeAttestation: runtime.runtimeAttestation,
    promptSha256: sha256(Buffer.from(prompt)),
    inputDigest: segmentInputDigest,
    inputSha256,
    profileConfigSha256: runtime.profileConfigSha256,
    soulSha256: runtime.soulSha256,
    contentNeutralContractId: runtime.contentNeutralContractId,
    contentNeutralContractSha256: runtime.contentNeutralContractSha256,
    contentNeutralSoulSectionSha256: runtime.contentNeutralSoulSectionSha256,
    effectiveSystemPromptSha256: sha256(Buffer.from(trace.system_prompt)),
    contextLimitEntrySha256: runtime.contextLimitEntrySha256,
    hermesExecutableSha256: runtime.hermesExecutableSha256,
    hermesDelegatedExecutableSha256: runtime.hermesDelegatedExecutableSha256,
    hermesVersionSha256: runtime.hermesVersionSha256,
    hermesImplementationSha256: runtime.hermesImplementationSha256,
    hermesDependencySha256: runtime.hermesDependencySha256,
    hermesProfileContextSha256: runtime.hermesProfileContextSha256,
    hermesProjectContextSha256: runtime.hermesProjectContextSha256,
    hermesRuntimeIdentitySha256: runtime.hermesRuntimeIdentitySha256,
    contextLimit: runtime.contextLimit,
    contextInputProxyTokens,
    contextOutputReserveTokens: 48_000,
    contextBudgetUpperBoundTokens: contextInputProxyTokens + 48_000,
    cumulativeCacheReadTokens: usage.cache_read_tokens,
    cacheWriteTokens: usage.cache_write_tokens,
    compaction: false,
    compression: false,
    truncation: false,
    expectedReadCount: expectedFiles.length,
    exactReadCount: expectedFiles.length,
    exactReadSha256s: expectedFiles.map((file) => file.sha256),
    candidateOutputSha256: sha256(candidateOutputBytes),
    resultSha256: sha256(resultBytes),
    usageSha256: sha256(usageBytes),
    traceSha256: sha256(traceBytes),
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    reasoningTokens: usage.reasoning_tokens,
    totalTokens: usage.total_tokens,
    apiCalls: usage.api_calls,
    completedAt,
    completed: true,
  };
  const hostReceiptBytes = jsonBytes(receipt);
  const expectedReads = expectedInputs.map(({ path, sha256: fileSha256, sizeBytes }) => ({
    path,
    sha256: fileSha256,
    sizeBytes,
  }));
  const inputAttestationBytes = jsonBytes(buildHermesStructuredAttemptInputAttestation({
    schemaVersion: HERMES_STRUCTURED_ATTEMPT_INPUT_ATTESTATION_SCHEMA,
    role,
    profileHome: resolve(profileHome),
    projectCwd: resolve(root),
    profileId,
    promptSha256: sha256(Buffer.from(prompt)),
    inputDigest: segmentInputDigest,
    inputSha256,
    expectedReads,
    outputReserveTokens: 48_000,
    executionEnvironmentSha256: buildHistoricalHermesExecutionEnvironmentDescriptorV2({
      profileHome,
      projectCwd: root,
    }).descriptorSha256,
    readCapabilitySha256: sha256(readCapabilityBytes),
    runtime: Object.fromEntries(HERMES_STRUCTURED_ATTEMPT_INPUT_ATTESTATION_RUNTIME_KEYS.map((key) => [key, runtime[key]])),
  }));
  const attemptId = `attempt-fixture-${sha256(inputAttestationBytes)}`;
  const attemptRelativePath = `attempts/${attemptId}`;
  const attemptDir = join(segmentDir, "structured", attemptRelativePath);
  const attemptCompletionBytes = jsonBytes({
    schemaVersion: "private-hermes-structured-attempt-completion/v1",
    role,
    attemptId,
    runId,
    hostReceiptSha256: sha256(hostReceiptBytes),
    completed: true,
  });
  const structuredCompletedPointerBytes = jsonBytes({
    schemaVersion: "private-hermes-structured-completed-pointer/v1",
    role,
    attempt: attemptRelativePath,
    attemptCompletionSha256: sha256(attemptCompletionBytes),
    hostReceiptSha256: sha256(hostReceiptBytes),
  });
  const structured = { attempt: attemptRelativePath, attemptDir, receipt, result };
  const domainReceipt = buildCurrentDeepReadDomainReceipt({
    workInputDigest,
    segmentInputDigest,
    segmentIndex: 0,
    manifest,
    prompt,
    structured,
    structuredCompletedPointerBytes,
    structuredHostReceiptBytes: hostReceiptBytes,
    readCapabilityBytes,
  });
  const domainReceiptBytes = jsonBytes(domainReceipt);
  const completedPointer = buildCurrentDeepReadCompletedPointer({
    segmentInputDigest,
    domainReceipt,
    domainReceiptBytes,
  });
  await mkdir(attemptDir, { recursive: true });
  await Promise.all([
    writeFile(join(attemptDir, "candidate-output.txt"), candidateOutputBytes),
    ...[
      ["completed.json", attemptCompletionBytes],
      ["host-receipt.json", hostReceiptBytes],
      ["input-attestation.json", inputAttestationBytes],
      ["read-capability.json", readCapabilityBytes],
      ["result.json", resultBytes],
      ["session.jsonl", traceBytes],
      ["usage.json", usageBytes],
    ].map(([name, bytes]) => writeFile(join(attemptDir, name), bytes)),
    writeFile(join(segmentDir, "structured", "completed.json"), structuredCompletedPointerBytes),
    writeFile(join(segmentDir, "domain-receipt.json"), domainReceiptBytes),
    writeFile(join(segmentDir, "completed.json"), jsonBytes(completedPointer)),
  ]);
  const validationInput = {
    repositoryRoot: root,
    segmentDir,
    completedPath: join(segmentDir, "completed.json"),
    manifest,
    manifestPath,
    segment,
    segmentIndex: 0,
    workInputDigest,
    expected: {
      sourceId: manifest.sourceId,
      sourceSha256: manifest.sourceSha256,
      genre: manifest.genre,
      segmentId: manifest.segmentId,
      coverage: manifest.coverage,
      chapters: segment.chapters,
    },
    profileId,
    runtime,
    chapterFiles,
    manifestBytes,
  };
  const first = await validateDeepReadCompletedAttempt(validationInput);
  const second = await validateDeepReadCompletedAttempt(validationInput);
  assert.equal(first.receipt.runId, runId);
  assert.equal(second.receipt.runId, runId);
  assert.deepEqual(second.result, result);
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
