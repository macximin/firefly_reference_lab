import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertNoSelectionSurfaceInTrackedCandidate,
  assertPrivateInputContextBudget,
  buildBoundedWorkPartitions,
  buildProfilePromptContractEvidence,
  publishProfileBundle,
  readCompletedGenreSoulProfileRun,
  runGenreSoulProfile,
  selectWorkSampleSelectorIds,
  validatePrivateGenreSynthesisResult,
  validatePrivateWorkPartResult,
  validatePrivateWorkSynthesisResult,
} from "../tools/genre-soul-profile-runner.mjs";
import {
  HERMES_EXACT_INPUT_AUTH_PROJECTION_CONTRACT,
  HERMES_STRUCTURED_ATTEMPT_INPUT_ATTESTATION_SCHEMA,
  buildHermesExecutionEnvironment,
  buildHermesStructuredAttemptInputAttestation,
  measureHermesExactInputTranscript,
} from "../tools/genre-soul-hermes-run-lib.mjs";
import { writePrivateGenreSoulSurfaceHilDecision } from "../tools/genre-soul-surface-hil-decision.mjs";
import { buildPrivateGenreSoulAmbiguousSurfaceRequestV3 } from "../tools/genre-soul-surface-hil-lib.mjs";
import { validateGenreProfileArtifact } from "../tools/genre-soul-study-contract.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const fixedSha = (character) => character.repeat(64);
const TEST_SOUL_TEXT = "# Test genre soul\n\nCommercial fiction analysis fixture.\n";
const dimensions = [
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
const bases = ["commercial-anchor", "genre-breadth", "surface-anchor"];
const ACTUAL_REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CASE_ALIAS_REPOSITORY_ROOT = ACTUAL_REPOSITORY_ROOT.replace("/firefly_studio/", "/FIREFLY_STUDIO/");

function fixtureReadCursor(inputId, sourceSha256, chunkIndex) {
  return `cursor-${hash(Buffer.from([
    "firefly-hermes-read-cursor/v1",
    inputId,
    sourceSha256,
    String(chunkIndex),
  ].join("\0")))}`;
}

function fixtureReadChunks(content) {
  if (content.length === 0) return [""];
  const codePoints = Array.from(content);
  const chunks = [];
  let start = 0;
  while (start < codePoints.length) {
    let low = start + 1;
    let high = Math.min(codePoints.length, start + 75_000);
    let best = start;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const candidate = codePoints.slice(start, middle).join("");
      if (Array.from(JSON.stringify(candidate)).length <= 75_000) {
        best = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    if (best === start) throw new Error("Fixture exact-input content cannot fit its chunk boundary.");
    chunks.push(codePoints.slice(start, best).join(""));
    start = best;
  }
  return chunks;
}

function runtimeEvidence(overrides = {}) {
  const runtime = {
    schemaVersion: "genre-soul-hermes-runtime-evidence/v3",
    profileId: "inkos_male_modern_fantasy",
    contextLimit: 272_000,
    profilePromptContextBytes: 4_096,
    projectPromptContextBytes: 1_024,
    profileConfigSha256: fixedSha("9"),
    soulSha256: hash(Buffer.from(TEST_SOUL_TEXT)),
    contentNeutralContractId: "fiction-content-neutral-ko/v1",
    contentNeutralContractSha256: "c5b531577cbfbfb1dfc4cd2b5cb82d7ce796c6958e0bc00c3e180b0e5440e199",
    contentNeutralSoulSectionSha256: fixedSha("b"),
    contextLimitEntrySha256: fixedSha("c"),
    runtimeAttestation: "current-attested",
    hermesExecutableSha256: fixedSha("d"),
    hermesDelegatedExecutableSha256: fixedSha("1"),
    hermesVersionSha256: fixedSha("e"),
    hermesImplementationSha256: fixedSha("2"),
    hermesDependencySha256: fixedSha("3"),
    hermesProfileContextSha256: fixedSha("4"),
    hermesProjectContextSha256: fixedSha("5"),
    ...overrides,
  };
  runtime.hermesRuntimeIdentitySha256 = hash(jsonBytes({
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
  return runtime;
}

function buildFixtureReadCapability(input, runtime, inputBytes) {
  const expectedInputs = [{
    inputId: "input-001",
    path: resolve(input.expectedReadPaths[0]),
    sha256: hash(inputBytes),
    sizeBytes: inputBytes.byteLength,
  }];
  const manifestBytes = jsonBytes({
    schemaVersion: "firefly-hermes-read-manifest/v1",
    inputs: expectedInputs,
  });
  const pluginFiles = input.expectedPluginPlanningEvidence?.files
    ?? ["__init__.py", "plugin.yaml", "reader.py"].map((name, index) => ({
      name,
      sha256: hash(`fixture-plugin-${index}`),
      sizeBytes: index + 1,
    }));
  const authAdapterFiles = input.expectedAuthAdapterPlanningEvidence?.files
    ?? [{
      name: "sitecustomize.py",
      sha256: hash("fixture-auth-adapter"),
      sizeBytes: 1,
    }];
  const executionPolicy = {
    schemaVersion: "hermes-exact-input-execution-policy/v3",
    homeScope: "ephemeral-system-temp",
    workspaceScope: "empty-ephemeral-system-temp",
    cleanup: "required-before-finalization",
    capsuleCredentialPersistence: "forbidden",
    credentialCopyIntoCapsule: "forbidden",
    authoritativeAuthStoreScope: "source-profile-global-root",
    authoritativeAuthStoreMutation: "provider-managed-under-auth-lock",
    authProjectionContractVersion: HERMES_EXACT_INPUT_AUTH_PROJECTION_CONTRACT,
    authProjectionActivationProof: "sealed-reader-ready-contract",
    ambientDotenvAndExternalSecretLoading: "disabled-by-bootstrap-adapter",
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
  const executionEnvironmentSha256 = hash(jsonBytes({
    schemaVersion: "hermes-exact-input-environment-template/v3",
    executionPolicy,
    baseEnvironmentKeys: ["HERMES_BUNDLED_PLUGINS"],
    manifestBinding: "attempt-scoped-absolute-path-plus-sha256",
    addedEnvironmentKeys: [
      "FIREFLY_HERMES_AUTH_ADAPTER_CONTRACT",
      "FIREFLY_HERMES_AUTH_STORE",
      "FIREFLY_HERMES_CAPSULE_HOME",
      "FIREFLY_READ_MANIFEST",
      "FIREFLY_READ_MANIFEST_SHA256",
      "PYTHONPATH",
    ],
  }));
  const executionRuntimeIdentitySha256 = hash(jsonBytes({
    schemaVersion: "hermes-exact-input-runtime-identity/v3",
    sourceRuntimeIdentitySha256: runtime.hermesRuntimeIdentitySha256,
    manifestSha256: hash(manifestBytes),
    pluginFiles,
    authProjectionContractVersion: HERMES_EXACT_INPUT_AUTH_PROJECTION_CONTRACT,
    authAdapterFiles,
    executionEnvironmentSha256,
  }));
  const capability = {
    schemaVersion: "private-hermes-exact-input-read-capability/v3",
    toolset: "firefly-source-read",
    tool: "firefly_read_source",
    sourceRuntimeIdentitySha256: runtime.hermesRuntimeIdentitySha256,
    executionRuntimeIdentitySha256,
    executionEnvironmentSha256,
    manifest: { sha256: hash(manifestBytes), sizeBytes: manifestBytes.byteLength },
    pluginFiles,
    authProjectionContractVersion: HERMES_EXACT_INPUT_AUTH_PROJECTION_CONTRACT,
    authAdapterFiles,
    expectedInputs,
    cliPolicy: {
      entrypoint: "attested-delegated-executable",
      flags: ["--oneshot", "--usage-file", "--pass-session-id", "--toolsets", "--model", "--provider"],
      model: "gpt-5.6-sol",
      provider: "openai-codex",
      toolsets: ["firefly-source-read"],
    },
    executionPolicy,
  };
  return { capability, bytes: jsonBytes(capability) };
}

function buildFixtureAttemptAttestation(input, runtime, inputBytes) {
  const readCapability = buildFixtureReadCapability(input, runtime, inputBytes);
  const expectedReads = [{
    path: resolve(input.expectedReadPaths[0]),
    sha256: hash(inputBytes),
    sizeBytes: inputBytes.byteLength,
  }];
  const value = buildHermesStructuredAttemptInputAttestation({
    schemaVersion: HERMES_STRUCTURED_ATTEMPT_INPUT_ATTESTATION_SCHEMA,
    role: input.role,
    profileHome: resolve(input.profileHome),
    projectCwd: resolve(input.projectCwd),
    profileId: input.profileId,
    promptSha256: hash(Buffer.from(input.prompt)),
    inputDigest: input.inputDigest,
    inputSha256: hash(jsonBytes(expectedReads.map(({ path, sha256 }) => ({ path, sha256 })))),
    expectedReads,
    outputReserveTokens: input.outputReserveTokens,
    executionEnvironmentSha256: buildHermesExecutionEnvironment({
      profileHome: input.profileHome,
      projectCwd: input.projectCwd,
    }).descriptorSha256,
    readCapabilitySha256: hash(readCapability.bytes),
    runtime: {
      profileId: input.profileId,
      runtimeAttestation: runtime.runtimeAttestation,
      profileConfigSha256: runtime.profileConfigSha256,
      soulSha256: runtime.soulSha256,
      contentNeutralContractId: runtime.contentNeutralContractId,
      contentNeutralContractSha256: runtime.contentNeutralContractSha256,
      contentNeutralSoulSectionSha256: runtime.contentNeutralSoulSectionSha256,
      contextLimitEntrySha256: runtime.contextLimitEntrySha256,
      contextLimit: runtime.contextLimit,
      hermesCommand: "/usr/bin/true",
      hermesExecutableSha256: runtime.hermesExecutableSha256,
      hermesDelegatedExecutableSha256: runtime.hermesDelegatedExecutableSha256,
      hermesVersionSha256: runtime.hermesVersionSha256,
      hermesImplementationSha256: runtime.hermesImplementationSha256,
      hermesDependencySha256: runtime.hermesDependencySha256,
      hermesProfileContextSha256: runtime.hermesProfileContextSha256,
      hermesProjectContextSha256: runtime.hermesProjectContextSha256,
      hermesRuntimeIdentitySha256: runtime.hermesRuntimeIdentitySha256,
    },
  });
  return jsonBytes(value);
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function refreshProfileCompletionSeal(root, run, relativePaths) {
  const completedRelativePath = `exports/genre-souls/${run.profile.soulId}/v1/profile-runs/${run.inputDigest}/completed.json`;
  const completedPath = join(root, completedRelativePath);
  const completion = JSON.parse(await readFile(completedPath, "utf8"));
  for (const relativePath of relativePaths) {
    const artifact = completion.artifacts.find((entry) => entry.path === relativePath);
    assert.ok(artifact, `missing completion artifact: ${relativePath}`);
    const bytes = await readFile(join(root, relativePath));
    artifact.sha256 = hash(bytes);
    artifact.sizeBytes = bytes.byteLength;
  }
  await writeFile(completedPath, jsonBytes(completion));
}

function firstWorkPartAttemptArtifact(run, suffix) {
  const artifact = run.completion.artifacts.find((entry) => (
    entry.path.includes("/parts/")
    && entry.path.includes("/hermes/attempts/")
    && entry.path.endsWith(`/${suffix}`)
  ));
  assert.ok(artifact, `missing work-part Hermes ${suffix}`);
  return artifact.path;
}

function surfaceReviewAttemptArtifact(run, suffix) {
  const artifact = run.completion.artifacts.find((entry) => (
    entry.path.includes("/genre/surface-review/hermes/attempts/")
    && entry.path.endsWith(`/${suffix}`)
  ));
  assert.ok(artifact, `missing surface-review Hermes ${suffix}`);
  return artifact.path;
}

async function rewriteSealedSurfaceReviewTrace(root, run, mutate) {
  const tracePath = surfaceReviewAttemptArtifact(run, "session.jsonl");
  const attemptRoot = dirname(tracePath);
  const hermesRoot = dirname(dirname(attemptRoot));
  const groupRoot = dirname(hermesRoot);
  const paths = {
    trace: tracePath,
    receipt: `${attemptRoot}/host-receipt.json`,
    attemptCompletion: `${attemptRoot}/completed.json`,
    pointer: `${hermesRoot}/completed.json`,
    acceptedReceipt: `${groupRoot}/accepted-host-receipt.json`,
  };
  const trace = JSON.parse((await readFile(join(root, paths.trace), "utf8")).trim());
  const receipt = JSON.parse(await readFile(join(root, paths.receipt), "utf8"));
  await mutate({ trace, receipt });
  const traceBytes = Buffer.from(`${JSON.stringify(trace)}\n`);
  receipt.traceSha256 = hash(traceBytes);
  receipt.contextInputProxyTokens = Math.ceil((
    Buffer.byteLength(trace.system_prompt, "utf8")
    + Buffer.byteLength(JSON.stringify(trace.messages.slice(0, -1)), "utf8")
  ) / 2);
  receipt.contextBudgetUpperBoundTokens = receipt.contextInputProxyTokens
    + Math.max(receipt.contextOutputReserveTokens, receipt.outputTokens);
  const receiptBytes = jsonBytes(receipt);
  const attemptCompletion = JSON.parse(await readFile(join(root, paths.attemptCompletion), "utf8"));
  attemptCompletion.hostReceiptSha256 = hash(receiptBytes);
  const attemptCompletionBytes = jsonBytes(attemptCompletion);
  const pointer = JSON.parse(await readFile(join(root, paths.pointer), "utf8"));
  pointer.hostReceiptSha256 = hash(receiptBytes);
  pointer.attemptCompletionSha256 = hash(attemptCompletionBytes);
  const pointerBytes = jsonBytes(pointer);
  await Promise.all([
    writeFile(join(root, paths.trace), traceBytes),
    writeFile(join(root, paths.receipt), receiptBytes),
    writeFile(join(root, paths.attemptCompletion), attemptCompletionBytes),
    writeFile(join(root, paths.pointer), pointerBytes),
    writeFile(join(root, paths.acceptedReceipt), receiptBytes),
  ]);
  await refreshProfileCompletionSeal(root, run, Object.values(paths));
}

async function rewriteSealedWorkPartAttempt(root, run, mutate) {
  const tracePath = firstWorkPartAttemptArtifact(run, "session.jsonl");
  const attemptRoot = dirname(tracePath);
  const hermesRoot = dirname(dirname(attemptRoot));
  const groupRoot = dirname(hermesRoot);
  const paths = {
    candidate: `${attemptRoot}/candidate-output.txt`,
    result: `${attemptRoot}/result.json`,
    trace: tracePath,
    receipt: `${attemptRoot}/host-receipt.json`,
    attemptCompletion: `${attemptRoot}/completed.json`,
    pointer: `${hermesRoot}/completed.json`,
    accepted: `${groupRoot}/accepted.json`,
    acceptedReceipt: `${groupRoot}/accepted-host-receipt.json`,
  };
  const trace = JSON.parse((await readFile(join(root, paths.trace), "utf8")).trim());
  const result = JSON.parse(await readFile(join(root, paths.result), "utf8"));
  const receipt = JSON.parse(await readFile(join(root, paths.receipt), "utf8"));
  await mutate({ trace, result, receipt });
  const finalMessage = trace.messages.at(-1);
  assert.equal(finalMessage.role, "assistant");
  finalMessage.content = JSON.stringify(result);
  const candidateBytes = Buffer.from(JSON.stringify(result));
  const resultBytes = jsonBytes(result);
  const traceBytes = Buffer.from(`${JSON.stringify(trace)}\n`);
  receipt.candidateOutputSha256 = hash(candidateBytes);
  receipt.resultSha256 = hash(resultBytes);
  receipt.traceSha256 = hash(traceBytes);
  receipt.contextInputProxyTokens = Math.ceil((
    Buffer.byteLength(trace.system_prompt, "utf8")
    + Buffer.byteLength(JSON.stringify(trace.messages.slice(0, -1)), "utf8")
  ) / 2);
  receipt.contextBudgetUpperBoundTokens = receipt.contextInputProxyTokens
    + Math.max(receipt.contextOutputReserveTokens, receipt.outputTokens);
  const receiptBytes = jsonBytes(receipt);
  const attemptCompletion = JSON.parse(await readFile(join(root, paths.attemptCompletion), "utf8"));
  attemptCompletion.hostReceiptSha256 = hash(receiptBytes);
  const attemptCompletionBytes = jsonBytes(attemptCompletion);
  const pointer = JSON.parse(await readFile(join(root, paths.pointer), "utf8"));
  pointer.hostReceiptSha256 = hash(receiptBytes);
  pointer.attemptCompletionSha256 = hash(attemptCompletionBytes);
  const pointerBytes = jsonBytes(pointer);
  await Promise.all([
    writeFile(join(root, paths.candidate), candidateBytes),
    writeFile(join(root, paths.result), resultBytes),
    writeFile(join(root, paths.trace), traceBytes),
    writeFile(join(root, paths.receipt), receiptBytes),
    writeFile(join(root, paths.attemptCompletion), attemptCompletionBytes),
    writeFile(join(root, paths.pointer), pointerBytes),
    writeFile(join(root, paths.accepted), resultBytes),
    writeFile(join(root, paths.acceptedReceipt), receiptBytes),
  ]);
  await refreshProfileCompletionSeal(root, run, Object.values(paths));
}

async function rewriteSealedWorkPartCandidateOnly(root, run, candidateValue) {
  const tracePath = firstWorkPartAttemptArtifact(run, "session.jsonl");
  const attemptRoot = dirname(tracePath);
  const hermesRoot = dirname(dirname(attemptRoot));
  const groupRoot = dirname(hermesRoot);
  const paths = {
    candidate: `${attemptRoot}/candidate-output.txt`,
    receipt: `${attemptRoot}/host-receipt.json`,
    attemptCompletion: `${attemptRoot}/completed.json`,
    pointer: `${hermesRoot}/completed.json`,
    acceptedReceipt: `${groupRoot}/accepted-host-receipt.json`,
  };
  const candidateBytes = Buffer.from(JSON.stringify(candidateValue));
  const receipt = JSON.parse(await readFile(join(root, paths.receipt), "utf8"));
  receipt.candidateOutputSha256 = hash(candidateBytes);
  const receiptBytes = jsonBytes(receipt);
  const attemptCompletion = JSON.parse(await readFile(join(root, paths.attemptCompletion), "utf8"));
  attemptCompletion.hostReceiptSha256 = hash(receiptBytes);
  const attemptCompletionBytes = jsonBytes(attemptCompletion);
  const pointer = JSON.parse(await readFile(join(root, paths.pointer), "utf8"));
  pointer.hostReceiptSha256 = hash(receiptBytes);
  pointer.attemptCompletionSha256 = hash(attemptCompletionBytes);
  const pointerBytes = jsonBytes(pointer);
  await Promise.all([
    writeFile(join(root, paths.candidate), candidateBytes),
    writeFile(join(root, paths.receipt), receiptBytes),
    writeFile(join(root, paths.attemptCompletion), attemptCompletionBytes),
    writeFile(join(root, paths.pointer), pointerBytes),
    writeFile(join(root, paths.acceptedReceipt), receiptBytes),
  ]);
  await refreshProfileCompletionSeal(root, run, Object.values(paths));
}

function makeWork(sourceId, selectionBasis, sourceIndex) {
  const observations = [];
  let cursor = 100;
  for (const [bandIndex, coverageBand] of ["early", "middle", "late"].entries()) {
    for (let index = 0; index < 3; index += 1) {
      const observationId = `obs-${sourceIndex}-${bandIndex}-${index}`;
      const byteSize = 30 + ((2 - index) * 5);
      const testSourceText = `RAW${sourceIndex}${bandIndex}${index}`.padEnd(byteSize, "x");
      observations.push({
        sourceId,
        observationId,
        segmentId: `s${String(bandIndex + 1).padStart(4, "0")}`,
        segmentIndex: bandIndex,
        observationIndex: index,
        kind: index % 2 === 0 ? "commercial-engine" : "protagonist-action",
        finding: `비공개 관찰 ${sourceIndex}-${bandIndex}-${index}`,
        commercialFunction: `비공개 기능 ${sourceIndex}-${bandIndex}-${index}`,
        coverageBand,
        selectors: [{
          selectorId: `sel-${sourceIndex}-${bandIndex}-${index}`,
          sourceId,
          observationId,
          chapterSequence: index + 1,
          coordinateKind: "utf8-byte",
          startByte: cursor,
          endByte: cursor + byteSize,
          sliceSha256: hash(testSourceText),
          coverageBand,
          testSourceText,
        }],
      });
      cursor += 100;
    }
  }
  return {
    bindingId: `deep-read-binding-${sourceId}`,
    genre: "modern-fantasy-ko",
    soulId: "male-modern-fantasy-ko",
    sourceId,
    title: `표면금지작품${sourceIndex}`,
    author: `필명금지${sourceIndex}`,
    selectionBasis,
    sourceSha256: hash(sourceId),
    sourceSizeBytes: 10_000,
    chapterCount: 100 + sourceIndex,
    evidence: {
      trackedStudy: {
        repoRelativePath: `analyses/genre_souls/male-modern-fantasy-ko/v1/work-studies/${sourceId}.deep-read.json`,
        sha256: fixedSha("1"),
        sizeBytes: 100,
      },
      privateBundleReceipt: {
        repoRelativePath: `exports/genre-souls/male-modern-fantasy-ko/v1/deep-read-runs/${sourceId}/deep-read-receipt.json`,
        sha256: fixedSha("2"),
        sizeBytes: 100,
        runtimeAttestation: "legacy-unattested",
      },
      leakScanReceipt: {
        repoRelativePath: `analyses/genre_souls/male-modern-fantasy-ko/v1/leak-scan-receipts/${sourceId}.deep-read.json`,
        sha256: fixedSha("3"),
        sizeBytes: 100,
      },
    },
    observations,
  };
}

function makeEvidence() {
  const bindings = [
    makeWork("gdrive-surface", "surface-anchor", 3),
    makeWork("gdrive-commercial", "commercial-anchor", 1),
    makeWork("gdrive-breadth", "genre-breadth", 2),
  ];
  return {
    schemaVersion: "genre-soul-deep-read-evidence/v1",
    genre: "modern-fantasy-ko",
    soulId: "male-modern-fantasy-ko",
    metadata: {
      managerSelection: {
        repoRelativePath: "evidence/genre-souls/male-manager-selection.v1.json",
        sha256: fixedSha("4"),
        sizeBytes: 100,
      },
      inventory: {
        repoRelativePath: "evidence/genre-souls/male-source-inventory.v1.json",
        sha256: fixedSha("5"),
        sizeBytes: 100,
      },
      privateRegistry: {
        repoRelativePath: "exports/source-registry/male-source-registry.v1.json",
        sha256: fixedSha("6"),
        sizeBytes: 100,
      },
      registryReceipt: {
        repoRelativePath: "evidence/genre-souls/male-source-registry-receipt.v1.json",
        sha256: fixedSha("7"),
        sizeBytes: 100,
      },
      survey: {
        repoRelativePath: "analyses/genre_souls/male-modern-fantasy-ko/v1/survey.json",
        sha256: fixedSha("8"),
        sizeBytes: 100,
      },
    },
    bindings,
    observations: bindings.flatMap((binding) => binding.observations),
  };
}

function makeOverflowAmbiguousTerms(count = 36) {
  return Array.from({ length: count }, (_, index) => `김${String.fromCharCode(0xac00 + index)}`);
}

function makeAmbiguousSurfaceEvidence(terms = null, { sampleSelectorCount = 8 } = {}) {
  const evidence = makeEvidence();
  const surfaceWork = evidence.bindings.find((binding) => binding.sourceId === "gdrive-surface");
  const sourceText = terms === null
    ? "차도윤과 함께 움직였다. 일반 행동 묘사가 이어졌다."
    : terms.map((term) => `${term} 원천맥락아자차카타파하`).join(" ");
  const selectors = terms === null
    ? [surfaceWork.observations[0].selectors[0]]
    : surfaceWork.observations.slice(0, sampleSelectorCount).map((observation) => observation.selectors[0]);
  selectors.forEach((selector) => bindTestSourceText(selector, sourceText));
  return evidence;
}

function injectAmbiguousWorkSurface(result, input, terms = null) {
  if (input.role === "genre-soul-work-consolidation:gdrive-surface") {
    if (terms === null) {
      result.primaryCommercialEngine.mechanism.pressure = "차도윤 방식은 기회가 닫히기 전에 압박을 회수한다";
    } else {
      const candidateText = terms.map((term) => `${term} 후보맥락가나다라마바사`).join(" ");
      for (const key of Object.keys(result.primaryCommercialEngine.mechanism)) {
        result.primaryCommercialEngine.mechanism[key] = candidateText;
      }
    }
  } else if (terms !== null && input.role === "genre-soul-profile-synthesis") {
    const candidateText = terms.map((term) => `${term} 후보맥락가나다라마바사`).join(" ");
    result.patterns[0].guidance = candidateText;
    result.patterns[0].commercialFunction = candidateText;
  }
}

function bindTestSourceText(selector, sourceText) {
  selector.testSourceText = sourceText;
  selector.endByte = selector.startByte + Buffer.byteLength(sourceText);
  selector.sliceSha256 = hash(sourceText);
}

function fakePartitionInput(work, options) {
  const included = work.observations.filter((observation) => options.observationIds.includes(observation.observationId));
  const selectorById = new Map(work.observations.flatMap((observation) => observation.selectors)
    .map((selector) => [selector.selectorId, selector]));
  const blobs = [...options.includeSourceTextForSelectorIds].sort().map((selectorId) => {
    const selector = selectorById.get(selectorId);
    const sourceText = selector.testSourceText;
    return {
      selectorId,
      sourceId: selector.sourceId,
      coordinateKind: selector.coordinateKind,
      startByte: selector.startByte,
      endByte: selector.endByte,
      sliceSha256: selector.sliceSha256,
      byteSize: Buffer.byteLength(sourceText),
      conservativeTokenProxy: Math.ceil(Buffer.byteLength(sourceText) / 2),
      sourceText,
    };
  });
  return {
    schemaVersion: "private-genre-soul-work-synthesis-part-input/v1",
    genre: work.genre,
    soulId: work.soulId,
    sourceId: work.sourceId,
    title: work.title,
    author: work.author,
    selectionBasis: work.selectionBasis,
    sourceSha256: work.sourceSha256,
    sourceSizeBytes: work.sourceSizeBytes,
    chapterCount: work.chapterCount,
    evidence: work.evidence,
    observations: included.map((observation) => ({ ...observation })),
    observationPartition: {
      totalObservationCount: work.observations.length,
      includedObservationCount: included.length,
      includedObservationIds: included.map((observation) => observation.observationId),
    },
    sourceTextSample: { blobs },
    payloadMetrics: { observationCount: included.length },
  };
}

function mechanism(sourceId) {
  return {
    protagonistRepeatedVerb: `반복 행동 ${sourceId}`,
    pressure: "기회가 닫히는 압박",
    activeChoice: "즉시 판을 바꾸는 선택",
    resistance: "이해관계자의 실질 저항",
    payoff: "자원과 지위의 가시적 지급",
    recognition: "주변 인물의 공개적 인정",
  };
}

function workResult(work, observationCatalog) {
  const byBand = Object.fromEntries(["early", "middle", "late"].map((band) => [
    band,
    observationCatalog.find((observation) => observation.coverageBand === band).observationId,
  ]));
  const evidenceId = [...observationCatalog.map((observation) => observation.observationId)].sort()[0];
  return {
    schemaVersion: "private-genre-soul-work-synthesis/v1",
    genre: work.genre,
    soulId: work.soulId,
    sourceId: work.sourceId,
    sourceSha256: work.sourceSha256,
    selectionBasis: work.selectionBasis,
    primaryCommercialEngine: { mechanism: mechanism(work.sourceId), evidenceObservationIds: byBand },
    patterns: dimensions.map((dimension) => ({
      dimension,
      classification: dimension === "failurePatterns" ? "failure" : "source-specific",
      guidance: `${dimension}의 일반화된 실행 지침`,
      commercialFunction: `${dimension}의 상업 기능`,
      evidenceObservationIds: [evidenceId],
    })),
  };
}

function makeFakeExecutor(counter, runtime = runtimeEvidence(), mutateResult = null, runIdForInput = null) {
  return async (input) => {
    const completedPath = join(input.runRoot, "completed.json");
    if (await pathExists(completedPath)) {
      const pointer = JSON.parse(await readFile(completedPath, "utf8"));
      const attemptDir = join(input.runRoot, pointer.attempt);
      const result = JSON.parse(await readFile(join(attemptDir, "result.json"), "utf8"));
      const receipt = JSON.parse(await readFile(join(attemptDir, "host-receipt.json"), "utf8"));
      const usage = JSON.parse(await readFile(join(attemptDir, "usage.json"), "utf8"));
      let trace;
      try {
        trace = JSON.parse((await readFile(join(attemptDir, "session.jsonl"), "utf8")).trim());
      } catch {
        // The production runner validates immutable evidence before reuse. Leave malformed trace
        // bytes to the profile runner so the negative test exercises that same fail-closed path.
      }
      await input.validateResult(result);
      return {
        status: "reused",
        reused: true,
        recovered: false,
        attempt: pointer.attempt,
        attemptDir,
        receipt,
        result,
        usage,
        trace,
      };
    }
    counter.calls += 1;
    const inputBytes = await readFile(input.expectedReadPaths[0]);
    const readCapability = buildFixtureReadCapability(input, runtime, inputBytes);
    const privateInput = JSON.parse(inputBytes.toString("utf8"));
    let result;
    if (input.role.startsWith("genre-soul-work-part:")) {
      const [, sourceId, partId] = input.role.split(":");
      const ids = [...privateInput.observationPartition.includedObservationIds].sort();
      result = {
        schemaVersion: "private-genre-soul-work-synthesis-part/v1",
        genre: privateInput.genre,
        soulId: privateInput.soulId,
        sourceId,
        sourceSha256: privateInput.sourceSha256,
        selectionBasis: privateInput.selectionBasis,
        partId,
        reviewedObservationIds: ids,
        primaryCommercialEngineCandidate: { mechanism: mechanism(sourceId), evidenceObservationIds: ids },
        patterns: dimensions.map((dimension) => ({
          dimension,
          classification: dimension === "failurePatterns" ? "failure" : "source-specific",
          guidance: `${dimension}의 파티션 근거 지침`,
          commercialFunction: `${dimension}의 파티션 상업 기능`,
          evidenceObservationIds: ids,
        })),
      };
    } else if (input.role.startsWith("genre-soul-work-consolidation:")) {
      const sourceId = input.role.split(":").at(-1);
      result = workResult({
        genre: privateInput.genre,
        soulId: privateInput.soulId,
        sourceId,
        sourceSha256: privateInput.sourceSha256,
        selectionBasis: privateInput.selectionBasis,
      }, privateInput.observationCatalog);
    } else if (input.role.startsWith("genre-soul-surface-semantic-review:")) {
      result = {
        schemaVersion: "private-genre-soul-surface-semantic-review-result/v1",
        gateVersion: privateInput.gateVersion,
        stage: privateInput.stage,
        genre: privateInput.genre,
        soulId: privateInput.soulId,
        inputDigest: privateInput.inputDigest,
        reviewRequestSha256: hash(inputBytes),
        findingDecisions: privateInput.findings.map((finding) => ({
          findingId: finding.findingId,
          verdict: "generic-overlap",
          reasonCode: "common-lexeme",
          evidenceWindowIds: [
            finding.candidateWindows[0].windowId,
            finding.privateSourceWindows[0].windowId,
          ].sort(),
        })),
        authority: {
          scope: "reference-lab-analysis-surface-only",
          mayWriteInkOSCanon: false,
          mayPromoteSoul: false,
        },
      };
    } else {
      const works = privateInput.works;
      result = {
        schemaVersion: "private-genre-soul-profile-synthesis/v1",
        genre: privateInput.genre,
        soulId: privateInput.soulId,
        version: "v1",
        patterns: dimensions.map((dimension) => ({
          dimension,
          classification: dimension === "failurePatterns" ? "failure" : "genre-common",
          guidance: `${dimension}의 장르 공통 실행 원리`,
          commercialFunction: `${dimension}의 독자 보상 기능`,
          evidence: [...works]
            .sort((left, right) => left.sourceId.localeCompare(right.sourceId))
            .map((entry) => {
              const pattern = entry.acceptedOutput.result.patterns.find((candidate) => candidate.dimension === dimension);
              return {
                sourceId: entry.sourceId,
                evidenceObservationIds: [...pattern.evidenceObservationIds],
              };
            }),
        })),
        routingCandidates: [
          { role: "spine", sourceId: works.find((work) => work.selectionBasis === "commercial-anchor").sourceId, rationale: "보상 골격의 기준" },
          { role: "style", sourceId: works.find((work) => work.selectionBasis === "surface-anchor").sourceId, rationale: "표현 질감의 참고" },
          { role: "supporting", sourceId: works.find((work) => work.selectionBasis === "genre-breadth").sourceId, rationale: "변주 폭의 보조" },
        ],
        unresolvedConflicts: [],
      };
    }
    if (mutateResult) mutateResult(result, input);
    await input.validateResult(result);
    const runId = runIdForInput?.(input, counter.calls) ?? `fake-run-${counter.calls}`;
    const candidateOutputBytes = Buffer.from(JSON.stringify(result));
    const resultBytes = jsonBytes(result);
    const usage = {
      cost_usd: 0,
      cost_status: "included",
      cost_source: "none",
      input_tokens: 1200,
      output_tokens: 300,
      cache_read_tokens: 400,
      cache_write_tokens: 0,
      reasoning_tokens: 50,
      total_tokens: 1900,
      api_calls: 2,
      model: "gpt-5.6-sol",
      provider: "openai-codex",
      session_id: runId,
      completed: true,
      failed: false,
      service_tier: null,
    };
    const inputChunks = fixtureReadChunks(inputBytes.toString("utf8"));
    const readMessages = [];
    let readCursor = null;
    for (const [chunkIndex, content] of inputChunks.entries()) {
      const callId = `call-read-profile-input-${String(chunkIndex + 1).padStart(4, "0")}`;
      const argumentsValue = readCursor === null
        ? { inputId: "input-001" }
        : { inputId: "input-001", cursor: readCursor };
      const finalChunk = chunkIndex + 1 === inputChunks.length;
      const nextCursor = finalChunk
        ? null
        : fixtureReadCursor("input-001", hash(inputBytes), chunkIndex + 1);
      readMessages.push({
        role: "assistant",
        finish_reason: "tool_calls",
        compacted: 0,
        tool_calls: [{
          id: callId,
          function: { name: "firefly_read_source", arguments: JSON.stringify(argumentsValue) },
        }],
      }, {
        role: "tool",
        tool_call_id: callId,
        compacted: 0,
        content: JSON.stringify({
          schemaVersion: "firefly-hermes-read-result/v2",
          inputId: "input-001",
          sha256: hash(inputBytes),
          sizeBytes: inputBytes.byteLength,
          chunkIndex,
          chunkCount: inputChunks.length,
          chunkSha256: hash(Buffer.from(content, "utf8")),
          nextInputId: finalChunk ? null : "input-001",
          nextCursor,
          content,
        }),
      });
      readCursor = nextCursor;
    }
    const trace = {
      id: runId,
      model: "gpt-5.6-sol",
      billing_provider: "openai-codex",
      profile_name: input.profileId,
      end_reason: "agent_close",
      ended_at: 1787932800.125,
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
      system_prompt: `${TEST_SOUL_TEXT}\nHermes fixture runtime context`,
      messages: [
        { role: "user", content: input.prompt, compacted: 0 },
        ...readMessages,
        { role: "assistant", finish_reason: "stop", compacted: 0, content: JSON.stringify(result) },
      ],
    };
    const usageBytes = jsonBytes(usage);
    const traceBytes = Buffer.from(`${JSON.stringify(trace)}\n`);
    const contextInputProxyTokens = Math.ceil((
      Buffer.byteLength(trace.system_prompt, "utf8")
      + Buffer.byteLength(JSON.stringify(trace.messages.slice(0, -1)), "utf8")
    ) / 2);
    const contextOutputReserveTokens = input.outputReserveTokens;
    const contextBudgetUpperBoundTokens = contextInputProxyTokens
      + Math.max(contextOutputReserveTokens, usage.output_tokens);
    const receipt = {
      schemaVersion: "private-hermes-structured-run-receipt/v1",
      role: input.role,
      runId,
      profileId: input.profileId,
      inputDigest: input.inputDigest,
      model: "gpt-5.6-sol",
      provider: "openai-codex",
      readCapabilitySha256: hash(readCapability.bytes),
      readCapabilityTool: "firefly_read_source",
      readCapabilityToolset: "firefly-source-read",
      readExecutionEnvironmentSha256: readCapability.capability.executionEnvironmentSha256,
      readExecutionRuntimeIdentitySha256: readCapability.capability.executionRuntimeIdentitySha256,
      readManifestSha256: readCapability.capability.manifest.sha256,
      reasoningEffort: "high",
      runtimeAttestation: runtime.runtimeAttestation,
      promptSha256: hash(Buffer.from(input.prompt)),
      inputSha256: hash(jsonBytes([{ path: input.expectedReadPaths[0], sha256: hash(inputBytes) }])),
      profileConfigSha256: runtime.profileConfigSha256,
      soulSha256: runtime.soulSha256,
      contentNeutralContractId: "fiction-content-neutral-ko/v1",
      contentNeutralContractSha256: "c5b531577cbfbfb1dfc4cd2b5cb82d7ce796c6958e0bc00c3e180b0e5440e199",
      contentNeutralSoulSectionSha256: runtime.contentNeutralSoulSectionSha256,
      effectiveSystemPromptSha256: hash(Buffer.from(trace.system_prompt)),
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
      contextOutputReserveTokens,
      contextBudgetUpperBoundTokens,
      cumulativeCacheReadTokens: usage.cache_read_tokens,
      cacheWriteTokens: usage.cache_write_tokens,
      truncation: false,
      compaction: false,
      compression: false,
      expectedReadCount: 1,
      exactReadCount: 1,
      exactReadSha256s: [hash(inputBytes)],
      candidateOutputSha256: hash(candidateOutputBytes),
      resultSha256: hash(resultBytes),
      usageSha256: hash(usageBytes),
      traceSha256: hash(traceBytes),
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      reasoningTokens: usage.reasoning_tokens,
      totalTokens: usage.total_tokens,
      apiCalls: usage.api_calls,
      completedAt: new Date(trace.ended_at * 1000).toISOString(),
      completed: true,
    };
    const inputAttestationBytes = buildFixtureAttemptAttestation(input, runtime, inputBytes);
    const attemptId = `attempt-fixture-${hash(inputAttestationBytes)}`;
    const attemptDir = join(input.runRoot, "attempts", attemptId);
    await mkdir(attemptDir, { recursive: true });
    await Promise.all([
      writeFile(join(attemptDir, "candidate-output.txt"), candidateOutputBytes),
      writeFile(join(attemptDir, "usage.json"), usageBytes),
      writeFile(join(attemptDir, "result.json"), resultBytes),
      writeFile(join(attemptDir, "session.jsonl"), traceBytes),
      writeFile(join(attemptDir, "host-receipt.json"), jsonBytes(receipt)),
      writeFile(join(attemptDir, "input-attestation.json"), inputAttestationBytes),
      writeFile(join(attemptDir, "read-capability.json"), readCapability.bytes),
    ]);
    const completionBytes = jsonBytes({
      schemaVersion: "private-hermes-structured-attempt-completion/v1",
      role: input.role,
      attemptId,
      runId,
      hostReceiptSha256: hash(jsonBytes(receipt)),
      completed: true,
    });
    await writeFile(join(attemptDir, "completed.json"), completionBytes);
    const attempt = `attempts/${attemptId}`;
    await writeFile(completedPath, jsonBytes({
      schemaVersion: "private-hermes-structured-completed-pointer/v1",
      role: input.role,
      attempt,
      attemptCompletionSha256: hash(completionBytes),
      hostReceiptSha256: hash(jsonBytes(receipt)),
    }));
    return {
      status: "completed",
      reused: false,
      recovered: false,
      attempt,
      attemptDir,
      receipt,
      result,
      usage,
      trace,
    };
  };
}

function passingScan({ artifactRelativePath, artifactBytes }) {
  return {
    schemaVersion: "tracked-projection-leak-scan/v1",
    scanner: { version: "genre-soul-surface-scanner/v1", exactTokenCount: 12, longCommonUtf8Bytes: 120 },
    artifact: { path: artifactRelativePath, sha256: hash(artifactBytes), sizeBytes: artifactBytes.byteLength },
    corpus: {
      privateRegistrySha256: fixedSha("6"),
      availableSourceCount: 3,
      observedSourceSetSha256: fixedSha("7"),
    },
    matchCount: 0,
    matches: [],
    truncated: false,
    status: "pass",
    automaticRewrite: false,
    automaticReject: false,
  };
}

test("selects the smallest selectors in every selector band with kind diversity", () => {
  const work = makeWork("gdrive-selector", "commercial-anchor", 1);
  const selected = selectWorkSampleSelectorIds(work);
  assert.equal(selected.length, 9);
  for (const band of ["early", "middle", "late"]) {
    const selectedObservations = work.observations.filter((observation) => (
      observation.selectors.some((selector) => selector.coverageBand === band && selected.includes(selector.selectorId))
    ));
    assert.equal(selectedObservations.length, 3);
    assert.equal(new Set(selectedObservations.map((observation) => observation.kind)).size, 2);
  }
});

test("partitions every observation exactly and fails closed at the context ceiling", () => {
  const work = makeWork("gdrive-partition", "commercial-anchor", 1);
  const parts = buildBoundedWorkPartitions(work, {
    workPartitionInputBuilder: fakePartitionInput,
    maxInputConservativeTokenProxy: 8_000,
    outputReserveTokens: 48_000,
  });
  const ids = parts.flatMap((part) => part.observationIds);
  assert.deepEqual(ids, work.observations.map((observation) => observation.observationId));
  assert.equal(new Set(ids).size, work.observations.length);
  assert.ok(parts.length > 1);
  const repeated = buildBoundedWorkPartitions(work, {
    workPartitionInputBuilder: fakePartitionInput,
    maxInputConservativeTokenProxy: 8_000,
    outputReserveTokens: 48_000,
  });
  assert.deepEqual(
    repeated.map((part) => ({
      partId: part.partId,
      observationIds: part.observationIds,
      inputSha256: hash(part.bytes),
      contextBudget: part.contextBudget,
    })),
    parts.map((part) => ({
      partId: part.partId,
      observationIds: part.observationIds,
      inputSha256: hash(part.bytes),
      contextBudget: part.contextBudget,
    })),
  );
  for (const part of parts) {
    const measurement = measureHermesExactInputTranscript([part.bytes]);
    assert.equal(part.contextBudget.readTranscriptProxyBytes, measurement.readTranscriptProxyBytes);
    assert.equal(part.contextBudget.conservativeTokenProxy, measurement.contextProxyTokens);
    assert.ok(part.contextBudget.conservativeTokenProxy <= 8_000);
    assert.equal(part.contextBudget.contextPlan.fits, true);
  }
  const projectBound = assertPrivateInputContextBudget(Buffer.alloc(128, 0x61), {
    prompt: "profile budget fixture",
    profilePromptContextBytes: 4_096,
    projectPromptContextBytes: 1_024,
    pluginContextBytes: 2_048,
  });
  assert.equal(projectBound.schemaVersion, "genre-soul-private-input-context-budget/v2");
  assert.equal(projectBound.contextPlan.profilePromptContextBytes, 4_096);
  assert.equal(projectBound.contextPlan.projectPromptContextBytes, 1_024);
  assert.equal(projectBound.contextPlan.pluginContextBytes, 2_048);
  assert.throws(() => assertPrivateInputContextBudget(Buffer.alloc(128, 0x61), {
    projectPromptContextBytes: 600_000,
  }), /preflight context boundary failed/u);
  assert.throws(() => assertPrivateInputContextBudget(Buffer.alloc(1_002), {
    maxInputConservativeTokenProxy: 500,
    outputReserveTokens: 48_000,
  }), /context budget failed/u);
  const plain = Buffer.alloc(300_000, 0x61);
  const plainMeasurement = measureHermesExactInputTranscript([plain]);
  const plainReceipt = assertPrivateInputContextBudget(plain);
  assert.equal(plainReceipt.conservativeTokenProxy, plainMeasurement.contextProxyTokens);
  assert.ok(plainReceipt.conservativeTokenProxy < 190_000);
  const cursorRegression = Buffer.alloc(377_857, 0x61);
  assert.ok(Math.ceil(cursorRegression.byteLength / 2) < 190_000);
  assert.ok(measureHermesExactInputTranscript([cursorRegression]).contextProxyTokens > 190_000);
  assert.throws(() => assertPrivateInputContextBudget(cursorRegression), /context budget failed/u);
  const escapeHeavy = Buffer.alloc(100_000);
  assert.ok(measureHermesExactInputTranscript([escapeHeavy]).contextProxyTokens > 190_000);
  assert.throws(() => assertPrivateInputContextBudget(escapeHeavy), /context budget failed/u);
});

test("rejects wrong part evidence, work identity, and non-canonical engine shape", () => {
  const work = makeWork("gdrive-validation", "commercial-anchor", 1);
  const ids = work.observations.slice(0, 2).map((observation) => observation.observationId);
  const part = {
    schemaVersion: "private-genre-soul-work-synthesis-part/v1",
    genre: work.genre,
    soulId: work.soulId,
    sourceId: work.sourceId,
    sourceSha256: work.sourceSha256,
    selectionBasis: work.selectionBasis,
    partId: "p0001",
    reviewedObservationIds: [...ids].sort(),
    primaryCommercialEngineCandidate: { mechanism: mechanism(work.sourceId), evidenceObservationIds: [ids[0]] },
    patterns: dimensions.map((dimension) => ({
      dimension,
      classification: dimension === "failurePatterns" ? "failure" : "source-specific",
      guidance: `${dimension} 지침`,
      commercialFunction: `${dimension} 기능`,
      evidenceObservationIds: [ids[0]],
    })),
  };
  assert.equal(validatePrivateWorkPartResult(part, { work, partId: "p0001", observationIds: ids }), true);
  const incompleteReview = structuredClone(part);
  incompleteReview.reviewedObservationIds = [ids[0]];
  assert.throws(
    () => validatePrivateWorkPartResult(incompleteReview, { work, partId: "p0001", observationIds: ids }),
    /exactly cover the sorted observation partition/u,
  );
  const wrongEvidence = structuredClone(part);
  wrongEvidence.patterns[0].evidenceObservationIds = [work.observations.at(-1).observationId];
  assert.throws(() => validatePrivateWorkPartResult(wrongEvidence, { work, partId: "p0001", observationIds: ids }), /outside its exact partition/u);
  const final = workResult(work, work.observations);
  const wrongIdentity = structuredClone(final);
  wrongIdentity.sourceSha256 = fixedSha("a");
  assert.throws(() => validatePrivateWorkSynthesisResult(wrongIdentity, work), /identity drifted/u);
  const wrongEngine = structuredClone(final);
  delete wrongEngine.primaryCommercialEngine.mechanism.recognition;
  assert.throws(() => validatePrivateWorkSynthesisResult(wrongEngine, work), /keys must be exactly/u);
  const boundaryWork = structuredClone(work);
  const earlyObservation = boundaryWork.observations.find((observation) => observation.coverageBand === "early");
  earlyObservation.coverageBand = "middle";
  assert.equal(validatePrivateWorkSynthesisResult(final, boundaryWork), true);
  earlyObservation.selectors[0].coverageBand = "middle";
  assert.throws(() => validatePrivateWorkSynthesisResult(final, boundaryWork), /outside its coverage band/u);
});

test("rejects work evidence not carried by an accepted same-dimension partition result", () => {
  const work = makeWork("gdrive-provenance", "commercial-anchor", 1);
  const final = workResult(work, work.observations);
  const firstId = work.observations[0].observationId;
  const provenance = {
    engineObservationIds: new Set(work.observations.map((observation) => observation.observationId)),
    patternObservationIdsByDimension: new Map(dimensions.map((dimension) => [dimension, new Set([firstId])])),
  };
  assert.equal(validatePrivateWorkSynthesisResult(final, work, provenance), true);
  const missingEngineProvenance = {
    ...provenance,
    engineObservationIds: new Set(
      [...provenance.engineObservationIds]
        .filter((observationId) => observationId !== final.primaryCommercialEngine.evidenceObservationIds.early),
    ),
  };
  assert.throws(
    () => validatePrivateWorkSynthesisResult(final, work, missingEngineProvenance),
    /was not cited by an accepted partition result/u,
  );
  const crossDimension = structuredClone(final);
  crossDimension.patterns.find((pattern) => pattern.dimension === "worldConstraints").evidenceObservationIds = [work.observations[1].observationId];
  assert.throws(
    () => validatePrivateWorkSynthesisResult(crossDimension, work, provenance),
    /not carried by an accepted same-dimension partition pattern/u,
  );
});

test("rejects genre evidence not carried by an accepted same-dimension work result and unresolved conflicts", () => {
  const evidence = makeEvidence();
  const workResults = evidence.bindings.map((work) => ({ result: workResult(work, work.observations) }));
  for (const { result: workResultEntry } of workResults) {
    const work = evidence.bindings.find((binding) => binding.sourceId === workResultEntry.sourceId);
    workResultEntry.patterns.forEach((pattern, index) => {
      pattern.evidenceObservationIds = [work.observations[index].observationId];
    });
  }
  const result = {
    schemaVersion: "private-genre-soul-profile-synthesis/v1",
    genre: evidence.genre,
    soulId: evidence.soulId,
    version: "v1",
    patterns: dimensions.map((dimension) => ({
      dimension,
      classification: dimension === "failurePatterns" ? "failure" : "genre-common",
      guidance: `${dimension}의 장르 공통 실행 원리`,
      commercialFunction: `${dimension}의 독자 보상 기능`,
      evidence: [...evidence.bindings].sort((left, right) => left.sourceId.localeCompare(right.sourceId)).map((work) => ({
        sourceId: work.sourceId,
        evidenceObservationIds: [...workResults
          .find((entry) => entry.result.sourceId === work.sourceId)
          .result.patterns.find((pattern) => pattern.dimension === dimension)
          .evidenceObservationIds],
      })),
    })),
    routingCandidates: [
      { role: "spine", sourceId: evidence.bindings.find((work) => work.selectionBasis === "commercial-anchor").sourceId, rationale: "보상 골격의 기준" },
      { role: "style", sourceId: evidence.bindings.find((work) => work.selectionBasis === "surface-anchor").sourceId, rationale: "표현 질감의 참고" },
      { role: "supporting", sourceId: evidence.bindings.find((work) => work.selectionBasis === "genre-breadth").sourceId, rationale: "변주 폭의 보조" },
    ],
    unresolvedConflicts: [],
  };
  const expected = {
    genre: evidence.genre,
    soulId: evidence.soulId,
    bindings: evidence.bindings,
    workResults: workResults.map((entry) => entry.result),
  };
  assert.equal(validatePrivateGenreSynthesisResult(result, expected), true);
  const crossDimension = structuredClone(result);
  const targetEvidence = crossDimension.patterns.find((pattern) => pattern.dimension === "worldConstraints").evidence[0];
  const targetWorkResult = workResults.find((entry) => entry.result.sourceId === targetEvidence.sourceId).result;
  targetEvidence.evidenceObservationIds = [
    targetWorkResult.patterns.find((pattern) => pattern.dimension === "commercialEngines").evidenceObservationIds[0],
  ];
  assert.throws(
    () => validatePrivateGenreSynthesisResult(crossDimension, expected),
    /not carried by an accepted same-dimension work pattern/u,
  );
  const unresolved = structuredClone(result);
  unresolved.unresolvedConflicts = ["증거 충돌"];
  assert.throws(() => validatePrivateGenreSynthesisResult(unresolved, expected), /cannot publish while unresolved conflicts remain/u);
});

test("profile synthesis prompts state the exact evidence provenance enforced by their validators", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-profile-prompt-provenance-"));
  const counter = { calls: 0 };
  let partPromptCount = 0;
  let workPromptCount = 0;
  let genrePromptCount = 0;
  try {
    const completed = await runGenreSoulProfile({
      testOnlyRepositoryRoot: root,
      genre: "modern-fantasy-ko",
      testOnly: true,
      testOnlySoulText: TEST_SOUL_TEXT,
      testOnlyEvidenceLoader: async () => makeEvidence(),
      testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
      testOnlyWorkPartitionInputBuilder: fakePartitionInput,
      testOnlyExecutor: makeFakeExecutor(counter, runtimeEvidence(), (_result, input) => {
        if (input.role.startsWith("genre-soul-work-part:")) {
          partPromptCount += 1;
          assert.match(input.prompt, /Every evidenceObservationIds array must be non-empty, unique, and sorted/u);
          assert.match(input.prompt, /NFC-normalized and trimmed, with every whitespace run collapsed to one space/u);
        } else if (input.role.startsWith("genre-soul-work-consolidation:")) {
          workPromptCount += 1;
          assert.match(
            input.prompt,
            /parts\[\]\.acceptedOutput\.result\.patterns\[\] whose dimension exactly equals that output pattern's dimension/u,
          );
          assert.match(input.prompt, /evidenceObservationIds array must be non-empty, unique, and sorted/u);
          assert.match(
            input.prompt,
            /cited by an accepted partition primaryCommercialEngineCandidate/u,
          );
          assert.match(input.prompt, /NFC-normalized and trimmed, with every whitespace run collapsed to one space/u);
        } else if (input.role === "genre-soul-profile-synthesis") {
          genrePromptCount += 1;
          assert.match(
            input.prompt,
            /works\[\]\.acceptedOutput\.result\.patterns\[\] whose dimension exactly equals that output pattern's dimension/u,
          );
          assert.match(input.prompt, /Evidence entries must be non-empty, unique by sourceId, and sorted by sourceId/u);
          assert.match(input.prompt, /return unresolvedConflicts as exactly \[\]/u);
          assert.match(input.prompt, /Encode evidence-supported differences as conditional patterns/u);
          assert.match(input.prompt, /using each of the three sourceIds exactly once/u);
          assert.match(input.prompt, /NFC-normalized and trimmed, with every whitespace run collapsed to one space/u);
        }
      }),
      testOnlyScanner: async (input) => passingScan(input),
    });
    assert.equal(completed.status, "completed");
    assert.ok(partPromptCount >= 3);
    assert.equal(workPromptCount, 3);
    assert.equal(genrePromptCount, 1);
    const manifestArtifact = completed.completion.artifacts.find((artifact) => artifact.path.endsWith("/manifest.json"));
    assert.ok(manifestArtifact);
    const manifest = JSON.parse(await readFile(join(root, manifestArtifact.path), "utf8"));
    assert.equal(manifest.promptContractVersion, "genre-soul-profile-partitioned-synthesis-prompts/v3");
    assert.deepEqual(manifest.promptContracts.contracts.workConsolidations, [
      {
        sourceId: "gdrive-commercial",
        sha256: "10ba56fbe88755d237c43caa827e58d91ecd54694a90e983b348680616a0864e",
        sizeBytes: 3048,
      },
      {
        sourceId: "gdrive-breadth",
        sha256: "c83979cd2ff04c626403731e0e357e1b2431b18735e851aa658ec94bf744af7c",
        sizeBytes: 3041,
      },
      {
        sourceId: "gdrive-surface",
        sha256: "86ab87d2f7e6a21f1ed26a9410ffb3b3b5e19855551dd8c7154b6ebe58ae3b6c",
        sizeBytes: 3042,
      },
    ]);
    assert.deepEqual(manifest.promptContracts.contracts.genreSynthesis, {
      sha256: "ff1cc7e9f5d726cfbda9a77deec1fcc0fe7af899219ed4c377fb9eb58c14a4db",
      sizeBytes: 2818,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("profile operating API rejects production executor injection and arbitrary test receipts", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-profile-executor-boundary-"));
  const evidence = makeEvidence();
  const counter = { calls: 0 };
  const strongExecutor = makeFakeExecutor(counter);
  try {
    await assert.rejects(runGenreSoulProfile({
      testOnlyRepositoryRoot: root,
      genre: "modern-fantasy-ko",
      executor: strongExecutor,
    }), /production executor is not injectable/u);
    await assert.rejects(runGenreSoulProfile({
      testOnlyRepositoryRoot: root,
      genre: "modern-fantasy-ko",
      testOnlyExecutor: strongExecutor,
    }), /explicit testOnly=true boundary/u);
    for (const [key, value] of [
      ["repositoryRoot", root],
      ["profileRoot", root],
      ["contextCachePath", join(root, "context.yaml")],
      ["evidenceLoader", async () => evidence],
      ["runtimeEvidenceLoader", async () => runtimeEvidence()],
      ["promptContractEvidenceFactory", () => ({})],
      ["workPartitionInputBuilder", fakePartitionInput],
      ["scanner", async (input) => passingScan(input)],
      ["privateRegistryPath", join(root, "registry.json")],
      ["inventoryPath", join(root, "inventory.json")],
      ["registryReceiptPath", join(root, "receipt.json")],
      ["maxInputConservativeTokenProxy", 1],
      ["outputReserveTokens", 1],
      ["publishHooks", {}],
      ["completionHooks", {}],
    ]) {
      await assert.rejects(runGenreSoulProfile({
        genre: "modern-fantasy-ko",
        [key]: value,
      }), new RegExp(`production option is not injectable: ${key}`, "u"));
    }
    await assert.rejects(runGenreSoulProfile({
      genre: "modern-fantasy-ko",
      testOnlyScanner: async (input) => passingScan(input),
    }), /test override requires the explicit testOnly=true boundary/u);
    await assert.rejects(runGenreSoulProfile({
      testOnlyRepositoryRoot: root,
      genre: "modern-fantasy-ko",
      testOnly: true,
      testOnlySoulText: TEST_SOUL_TEXT,
      testOnlyEvidenceLoader: async () => evidence,
      testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
      testOnlyWorkPartitionInputBuilder: fakePartitionInput,
      testOnlyExecutor: async (input) => {
        const run = await strongExecutor(input);
        return {
          ...run,
          receipt: {
            role: input.role,
            runId: "arbitrary-bypass",
            inputDigest: input.inputDigest,
            resultSha256: hash(jsonBytes(run.result)),
            completed: true,
          },
        };
      },
      testOnlyScanner: async (input) => passingScan(input),
    }), /Hermes receipt boundary drifted/u);
    assert.equal(await pathExists(join(root, "analyses/genre_souls/male-modern-fantasy-ko/v1/genre-profile.json")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("one profile run rejects mixed legacy and current deep-read attestations", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-profile-attestation-mix-"));
  const evidence = makeEvidence();
  evidence.bindings[0].evidence.privateBundleReceipt.runtimeAttestation = "current-attested";
  try {
    await assert.rejects(runGenreSoulProfile({
      genre: "modern-fantasy-ko",
      testOnly: true,
      testOnlyRepositoryRoot: root,
      testOnlySoulText: TEST_SOUL_TEXT,
      testOnlyEvidenceLoader: async () => evidence,
      testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
    }), /cannot mix legacy-unattested and current-attested/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("completion readback rejects mixed sealed deep-read attestations", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-profile-completion-attestation-mix-"));
  const evidence = makeEvidence();
  const reboundSourceId = evidence.bindings[0].sourceId;
  try {
    const run = await runGenreSoulProfile({
      genre: "modern-fantasy-ko",
      testOnly: true,
      testOnlyRepositoryRoot: root,
      testOnlySoulText: TEST_SOUL_TEXT,
      testOnlyEvidenceLoader: async () => evidence,
      testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
      testOnlyWorkPartitionInputBuilder: (work, options) => {
        const input = fakePartitionInput(work, options);
        if (work.sourceId === reboundSourceId) {
          input.evidence = structuredClone(input.evidence);
          input.evidence.privateBundleReceipt.runtimeAttestation = "current-attested";
        }
        return input;
      },
      testOnlyExecutor: makeFakeExecutor({ calls: 0 }),
      testOnlyScanner: async (input) => passingScan(input),
    });
    const profilePath = `analyses/genre_souls/${run.profile.soulId}/v1/genre-profile.json`;
    await assert.rejects(
      readCompletedGenreSoulProfileRun({
        repositoryRoot: root,
        profilePath,
        profileBytes: await readFile(join(root, profilePath)),
        profile: run.profile,
        soulText: TEST_SOUL_TEXT,
      }),
      /cannot mix legacy-unattested and current-attested/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("profile test-only execution requires an isolated repository root before dependencies run", async () => {
  const isolatedRoot = await mkdtemp(join(tmpdir(), "genre-profile-isolated-boundary-"));
  let dependencyCalls = 0;
  let executorCalls = 0;
  let scannerCalls = 0;
  const base = {
    genre: "modern-fantasy-ko",
    testOnly: true,
    testOnlySoulText: TEST_SOUL_TEXT,
    testOnlyEvidenceLoader: async () => {
      dependencyCalls += 1;
      throw new Error("dependency must not run");
    },
    testOnlyExecutor: async () => {
      executorCalls += 1;
      throw new Error("executor must not run");
    },
    testOnlyScanner: async () => {
      scannerCalls += 1;
      throw new Error("scanner must not run");
    },
    testOnlyRunLockHooks: {
      afterLockReleaseRename: () => { throw new Error("run-lock hook must not run"); },
    },
  };
  try {
    await assert.rejects(
      runGenreSoulProfile(base),
      /requires an explicit testOnlyRepositoryRoot/u,
    );
    await assert.rejects(
      runGenreSoulProfile({ ...base, testOnlyRepositoryRoot: ACTUAL_REPOSITORY_ROOT }),
      /must not equal the canonical Reference Lab repository root/u,
    );
    await assert.rejects(
      runGenreSoulProfile({ ...base, testOnlyRepositoryRoot: CASE_ALIAS_REPOSITORY_ROOT }),
      /must not equal the canonical Reference Lab repository root/u,
    );
    await assert.rejects(
      runGenreSoulProfile({
        genre: "modern-fantasy-ko",
        testOnlyRunLockHooks: { afterLockReleaseRename: () => {} },
      }),
      /explicit testOnly=true boundary/u,
    );
    assert.equal(dependencyCalls, 0);
    assert.equal(executorCalls, 0);
    assert.equal(scannerCalls, 0);
    assert.deepEqual(await readdir(isolatedRoot), []);
  } finally {
    await rm(isolatedRoot, { recursive: true, force: true });
  }
});

test("profile publication test hooks require the same isolated repository root boundary", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-profile-publish-isolated-boundary-"));
  const aliasParent = await mkdtemp(join(tmpdir(), "genre-profile-publish-isolated-alias-"));
  const aliasRoot = join(aliasParent, "test-root-alias");
  await symlink(root, aliasRoot);
  const files = [
    { path: "analyses/soul/v1/genre-profile.json", bytes: jsonBytes({ marker: true }) },
    { path: "analyses/soul/v1/genre-profile.md", bytes: Buffer.from("support\n") },
  ];
  const options = {
    markerPath: files[0].path,
    lockPath: "exports/genre-souls/soul/v1/.profile-publish-lock",
    inputDigest: fixedSha("a"),
    testOnly: true,
    testOnlyHooks: { afterSupportPublish: () => { throw new Error("hook must not run"); } },
  };
  try {
    await assert.rejects(
      publishProfileBundle(root, files, options),
      /requires an explicit testOnlyRepositoryRoot/u,
    );
    await assert.rejects(
      publishProfileBundle(ACTUAL_REPOSITORY_ROOT, files, {
        ...options,
        testOnlyRepositoryRoot: ACTUAL_REPOSITORY_ROOT,
      }),
      /must not equal the canonical Reference Lab repository root/u,
    );
    await assert.rejects(
      publishProfileBundle(CASE_ALIAS_REPOSITORY_ROOT, files, {
        ...options,
        testOnlyRepositoryRoot: CASE_ALIAS_REPOSITORY_ROOT,
      }),
      /must not equal the canonical Reference Lab repository root/u,
    );
    await assert.rejects(
      publishProfileBundle(aliasRoot, files, {
        ...options,
        testOnlyRepositoryRoot: aliasRoot,
      }),
      /physical non-symlink directory/u,
    );
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(aliasParent, { recursive: true, force: true });
  }
});

test("production profile publication is sealed to the physical canonical repository and exact six-artifact target set", async () => {
  const otherRoot = await mkdtemp(join(tmpdir(), "genre-profile-production-other-root-"));
  const aliasParent = await mkdtemp(join(tmpdir(), "genre-profile-production-alias-"));
  const symlinkAlias = join(aliasParent, "reference-lab-alias");
  await symlink(ACTUAL_REPOSITORY_ROOT, symlinkAlias);
  const soulId = "male-modern-fantasy-ko";
  const analysisRoot = `analyses/genre_souls/${soulId}/v1`;
  const files = [
    { path: `${analysisRoot}/genre-profile.json`, bytes: jsonBytes({ marker: true }) },
    { path: `${analysisRoot}/genre-profile.md`, bytes: Buffer.from("profile\n") },
    { path: `inkos_handoffs/genre-souls/${soulId}/v1/reference-routing-catalog.json`, bytes: jsonBytes({ routing: true }) },
    { path: `${analysisRoot}/leak-scan-receipts/genre-profile.json`, bytes: jsonBytes({ status: "pass" }) },
    { path: `${analysisRoot}/leak-scan-receipts/genre-profile.md.json`, bytes: jsonBytes({ status: "pass" }) },
    { path: `${analysisRoot}/leak-scan-receipts/reference-routing-catalog.json`, bytes: jsonBytes({ status: "pass" }) },
  ];
  const options = {
    markerPath: files[0].path,
    lockPath: `exports/genre-souls/${soulId}/v1/.profile-publish-lock`,
    inputDigest: fixedSha("a"),
  };
  try {
    for (const root of [otherRoot, symlinkAlias, CASE_ALIAS_REPOSITORY_ROOT]) {
      await assert.rejects(
        publishProfileBundle(root, files, options),
        /canonical Reference Lab repository root/u,
      );
    }
    assert.deepEqual(await readdir(otherRoot), []);

    const arbitraryMarker = `analyses/genre_souls/publisher-capability-${process.pid}/v1/genre-profile.json`;
    await assert.rejects(publishProfileBundle(ACTUAL_REPOSITORY_ROOT, [
      { path: arbitraryMarker, bytes: jsonBytes({ marker: true }) },
      { path: `${dirname(arbitraryMarker)}/genre-profile.md`, bytes: Buffer.from("support\n") },
    ], {
      markerPath: arbitraryMarker,
      lockPath: `exports/genre-souls/publisher-capability-${process.pid}/v1/.profile-publish-lock`,
      inputDigest: fixedSha("b"),
    }), /canonical genre-profile\.json visibility marker/u);
    assert.equal(await pathExists(join(ACTUAL_REPOSITORY_ROOT, arbitraryMarker)), false);

    await assert.rejects(
      publishProfileBundle(ACTUAL_REPOSITORY_ROOT, files.slice(0, 5), options),
      /exact canonical six-artifact profile bundle/u,
    );
  } finally {
    await rm(otherRoot, { recursive: true, force: true });
    await rm(aliasParent, { recursive: true, force: true });
  }
});

test("publishes only scanned candidates, keeps raw private, and reuses the immutable completion", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-profile-runner-"));
  const evidence = makeEvidence();
  const counter = { calls: 0 };
  try {
    const first = await runGenreSoulProfile({
      testOnlyRepositoryRoot: root,
      genre: "modern-fantasy-ko",
      testOnly: true,
      testOnlySoulText: TEST_SOUL_TEXT,
      testOnlyEvidenceLoader: async () => evidence,
      testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
      testOnlyWorkPartitionInputBuilder: fakePartitionInput,
      testOnlyExecutor: makeFakeExecutor(counter),
      testOnlyScanner: async (input) => passingScan(input),
    });
    assert.equal(first.status, "completed");
    assert.equal(counter.calls, 7);
    assert.equal(first.surfaceReview, undefined);
    const manifest = JSON.parse(await readFile(join(
      root,
      `exports/genre-souls/male-modern-fantasy-ko/v1/profile-runs/${first.inputDigest}/manifest.json`,
    ), "utf8"));
    assert.equal(manifest.schemaVersion, "private-genre-soul-profile-run-input-digest/v6");
    assert.equal(
      manifest.semanticReviewPromptContractVersion,
      "genre-soul-surface-semantic-review-prompt/v1",
    );
    assert.equal(
      manifest.semanticReviewPartitionAlgorithmVersion,
      "genre-soul-surface-semantic-review-greedy-prefix/v1",
    );
    assert.equal(
      manifest.semanticReviewPartitionPlanSchemaVersion,
      "private-genre-soul-surface-semantic-review-partition-plan/v1",
    );
    assert.equal(
      manifest.semanticReviewAggregateSchemaVersion,
      "private-genre-soul-surface-semantic-review-aggregate/v1",
    );
    const { inputDigest: sealedInputDigest, ...sealedDescriptor } = manifest;
    assert.equal(hash(jsonBytes(sealedDescriptor)), sealedInputDigest);
    for (const key of [
      "semanticReviewPartitionAlgorithmVersion",
      "semanticReviewPartitionPlanSchemaVersion",
      "semanticReviewAggregateSchemaVersion",
    ]) {
      const driftedDescriptor = structuredClone(sealedDescriptor);
      driftedDescriptor[key] = `${driftedDescriptor[key]}-drifted`;
      assert.notEqual(hash(jsonBytes(driftedDescriptor)), sealedInputDigest, key);
    }
    assert.equal(manifest.contextBudgetContractVersion, "genre-soul-profile-context-budget/v2");
    assert.equal(manifest.outputReserveTokens, 48_000);
    assert.equal(manifest.exactInputPluginPlanningEvidence.schemaVersion, "hermes-exact-input-plugin-planning-evidence/v1");
    assert.equal(
      manifest.exactInputAuthProjectionContractVersion,
      HERMES_EXACT_INPUT_AUTH_PROJECTION_CONTRACT,
    );
    assert.equal(
      manifest.authAdapterPlanningEvidence.schemaVersion,
      "hermes-auth-store-adapter-planning-evidence/v1",
    );
    assert.equal(
      manifest.authAdapterPlanningEvidence.contractVersion,
      HERMES_EXACT_INPUT_AUTH_PROJECTION_CONTRACT,
    );
    assert.ok(manifest.workInputs.every((work) => work.parts.every((part) => (
      part.contextBudget?.schemaVersion === "genre-soul-private-input-context-budget/v2"
      && part.contextBudget.contextPlan?.fits === true
    ))));
    assert.equal(validateGenreProfileArtifact(first.profile), true);
    assert.deepEqual(first.profile.evidenceSet.sources.map((source) => source.selectionBasis), bases);
    assert.equal(first.profile.synthesis.privateInput.observationCount, 27);
    assert.equal(first.profile.synthesis.privateInput.selectorCount, 27);
    const profilePath = "analyses/genre_souls/male-modern-fantasy-ko/v1/genre-profile.json";
    const profileBytes = await readFile(join(root, profilePath));
    const completedReadback = await readCompletedGenreSoulProfileRun({
      repositoryRoot: root,
      profilePath,
      profileBytes,
      profile: first.profile,
      soulText: TEST_SOUL_TEXT,
    });
    assert.equal(completedReadback.inputDigest, first.inputDigest);
    const trackedPaths = first.completion.artifacts
      .map((artifact) => artifact.path)
      .filter((path) => path.startsWith("analyses/") || path.startsWith("inkos_handoffs/"));
    assert.equal(trackedPaths.length, 6);
    for (const path of trackedPaths) {
      const bytes = await readFile(join(root, path));
      assert.equal(bytes.includes(Buffer.from("SECRET_RAW_")), false, path);
    }
    const second = await runGenreSoulProfile({
      testOnlyRepositoryRoot: root,
      genre: "modern-fantasy-ko",
      testOnly: true,
      testOnlySoulText: TEST_SOUL_TEXT,
      testOnlyEvidenceLoader: async () => evidence,
      testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
      testOnlyWorkPartitionInputBuilder: fakePartitionInput,
      testOnlyExecutor: makeFakeExecutor(counter),
      testOnlyScanner: async (input) => passingScan(input),
    });
    assert.equal(second.status, "reused");
    assert.equal(counter.calls, 7);
    const runLockReleases = (await readdir(join(
      root,
      `exports/genre-souls/male-modern-fantasy-ko/v1/profile-runs/${first.inputDigest}`,
    ))).filter((name) => name.startsWith(".profile-run-lock.released-"));
    const publishLockReleases = (await readdir(join(root, "exports/genre-souls/male-modern-fantasy-ko/v1")))
      .filter((name) => name.startsWith(".profile-publish-lock.released-"));
    assert.equal(runLockReleases.length, 2);
    assert.equal(publishLockReleases.length, 2);
    const runLockParent = join(
      root,
      `exports/genre-souls/male-modern-fantasy-ko/v1/profile-runs/${first.inputDigest}`,
    );
    const damagedRunLockName = runLockReleases[0];
    const damagedRunLockPath = join(runLockParent, damagedRunLockName);
    const damagedRunOwnerPath = join(damagedRunLockPath, "owner.json");
    const damagedRunOwner = JSON.parse(await readFile(damagedRunOwnerPath, "utf8"));
    delete damagedRunOwner.inputDigest;
    const damagedRunOwnerBytes = jsonBytes(damagedRunOwner);
    await writeFile(damagedRunOwnerPath, damagedRunOwnerBytes);
    const reboundRunLockName = damagedRunLockName.replace(/[a-f0-9]{64}$/u, hash(damagedRunOwnerBytes));
    await rename(damagedRunLockPath, join(runLockParent, reboundRunLockName));
    await assert.rejects(runGenreSoulProfile({
      testOnlyRepositoryRoot: root,
      genre: "modern-fantasy-ko",
      testOnly: true,
      testOnlySoulText: TEST_SOUL_TEXT,
      testOnlyEvidenceLoader: async () => evidence,
      testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
      testOnlyWorkPartitionInputBuilder: fakePartitionInput,
      testOnlyExecutor: makeFakeExecutor(counter),
      testOnlyScanner: async (input) => passingScan(input),
    }), /released quarantine owner contract drifted; manual audit is required/u);
    assert.equal(counter.calls, 7);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("profile completion rejects resealed semantic partition contract drift and reuses the restored descriptor", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-profile-partition-contract-drift-"));
  const counter = { calls: 0 };
  const options = {
    testOnlyRepositoryRoot: root,
    genre: "modern-fantasy-ko",
    testOnly: true,
    testOnlySoulText: TEST_SOUL_TEXT,
    testOnlyEvidenceLoader: async () => makeEvidence(),
    testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
    testOnlyWorkPartitionInputBuilder: fakePartitionInput,
    testOnlyExecutor: makeFakeExecutor(counter),
    testOnlyScanner: async (input) => passingScan(input),
  };
  try {
    const completed = await runGenreSoulProfile(options);
    const profilePath = "analyses/genre_souls/male-modern-fantasy-ko/v1/genre-profile.json";
    const manifestPath = `exports/genre-souls/male-modern-fantasy-ko/v1/profile-runs/${completed.inputDigest}/manifest.json`;
    const originalManifest = JSON.parse(await readFile(join(root, manifestPath), "utf8"));
    for (const key of [
      "semanticReviewPartitionAlgorithmVersion",
      "semanticReviewPartitionPlanSchemaVersion",
      "semanticReviewAggregateSchemaVersion",
    ]) {
      const driftedManifest = structuredClone(originalManifest);
      driftedManifest[key] = `${driftedManifest[key]}-drifted`;
      await writeFile(join(root, manifestPath), jsonBytes(driftedManifest));
      await refreshProfileCompletionSeal(root, completed, [manifestPath]);
      await assert.rejects(readCompletedGenreSoulProfileRun({
        repositoryRoot: root,
        profilePath,
        profileBytes: await readFile(join(root, profilePath)),
        profile: completed.profile,
        soulText: TEST_SOUL_TEXT,
      }), /run manifest identity|input digest drifted/u, key);
      await writeFile(join(root, manifestPath), jsonBytes(originalManifest));
      await refreshProfileCompletionSeal(root, completed, [manifestPath]);
    }
    const callsAfterCompletion = counter.calls;
    const reused = await runGenreSoulProfile(options);
    assert.equal(reused.status, "reused");
    assert.equal(reused.inputDigest, completed.inputDigest);
    assert.equal(counter.calls, callsAfterCompletion);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a consistently sealed Hermes capability that differs from the profile plugin plan", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-profile-plugin-plan-drift-"));
  const evidence = makeEvidence();
  const counter = { calls: 0 };
  const baseExecutor = makeFakeExecutor(counter);
  try {
    await assert.rejects(runGenreSoulProfile({
      testOnlyRepositoryRoot: root,
      genre: "modern-fantasy-ko",
      testOnly: true,
      testOnlySoulText: TEST_SOUL_TEXT,
      testOnlyEvidenceLoader: async () => evidence,
      testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
      testOnlyWorkPartitionInputBuilder: fakePartitionInput,
      testOnlyExecutor: async (input) => {
        const planned = input.expectedPluginPlanningEvidence;
        const driftedDescriptor = {
          schemaVersion: planned.schemaVersion,
          files: planned.files.map((file, index) => (
            index === 0 ? { ...file, sha256: hash("transient-plugin-bytes") } : file
          )),
          totalBytes: planned.totalBytes,
        };
        return baseExecutor({
          ...input,
          expectedPluginPlanningEvidence: {
            ...driftedDescriptor,
            sha256: hash(jsonBytes(driftedDescriptor)),
          },
        });
      },
      testOnlyScanner: async (input) => passingScan(input),
    }), /sealed plugin capability drifted from the sealed planning evidence/u);
    assert.equal(counter.calls, 1);
    assert.equal(await pathExists(join(
      root,
      "analyses/genre_souls/male-modern-fantasy-ko/v1/genre-profile.json",
    )), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a consistently sealed Hermes auth adapter that differs from the profile run plan", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-profile-auth-adapter-plan-drift-"));
  const evidence = makeEvidence();
  const counter = { calls: 0 };
  const baseExecutor = makeFakeExecutor(counter);
  try {
    await assert.rejects(runGenreSoulProfile({
      testOnlyRepositoryRoot: root,
      genre: "modern-fantasy-ko",
      testOnly: true,
      testOnlySoulText: TEST_SOUL_TEXT,
      testOnlyEvidenceLoader: async () => evidence,
      testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
      testOnlyWorkPartitionInputBuilder: fakePartitionInput,
      testOnlyExecutor: async (input) => {
        const planned = input.expectedAuthAdapterPlanningEvidence;
        const driftedDescriptor = {
          schemaVersion: planned.schemaVersion,
          contractVersion: planned.contractVersion,
          files: planned.files.map((file, index) => (
            index === 0 ? { ...file, sha256: hash("transient-auth-adapter-bytes") } : file
          )),
          totalBytes: planned.totalBytes,
        };
        return baseExecutor({
          ...input,
          expectedAuthAdapterPlanningEvidence: {
            ...driftedDescriptor,
            sha256: hash(jsonBytes(driftedDescriptor)),
          },
        });
      },
      testOnlyScanner: async (input) => passingScan(input),
    }), /sealed auth adapter capability drifted from the sealed planning evidence/u);
    assert.equal(counter.calls, 1);
    assert.equal(await pathExists(join(
      root,
      "analyses/genre_souls/male-modern-fantasy-ko/v1/genre-profile.json",
    )), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("completion readback rejects a top-level-resealed input attestation with a forged prompt binding", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-profile-attestation-forge-"));
  const evidence = makeEvidence();
  try {
    const run = await runGenreSoulProfile({
      testOnlyRepositoryRoot: root,
      genre: "modern-fantasy-ko",
      testOnly: true,
      testOnlySoulText: TEST_SOUL_TEXT,
      testOnlyEvidenceLoader: async () => evidence,
      testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
      testOnlyWorkPartitionInputBuilder: fakePartitionInput,
      testOnlyExecutor: makeFakeExecutor({ calls: 0 }),
      testOnlyScanner: async (input) => passingScan(input),
    });
    const attestationPath = firstWorkPartAttemptArtifact(run, "input-attestation.json");
    const attestation = JSON.parse(await readFile(join(root, attestationPath), "utf8"));
    attestation.promptSha256 = fixedSha("0");
    await writeFile(join(root, attestationPath), jsonBytes(attestation));
    await refreshProfileCompletionSeal(root, run, [attestationPath]);
    const profilePath = `analyses/genre_souls/${run.profile.soulId}/v1/genre-profile.json`;
    const profileBytes = await readFile(join(root, profilePath));
    await assert.rejects(
      readCompletedGenreSoulProfileRun({
        repositoryRoot: root,
        profilePath,
        profileBytes,
        profile: run.profile,
        soulText: TEST_SOUL_TEXT,
      }),
      /input attestation|attempt directory suffix|promptSha256/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("completion readback rejects fully resealed traces with a wrong prompt or no private read", async () => {
  const roots = await Promise.all([0, 1].map(() => mkdtemp(join(tmpdir(), "genre-profile-trace-forge-"))));
  const evidence = makeEvidence();
  const build = (root) => runGenreSoulProfile({
    testOnlyRepositoryRoot: root,
    genre: "modern-fantasy-ko",
    testOnly: true,
    testOnlySoulText: TEST_SOUL_TEXT,
    testOnlyEvidenceLoader: async () => evidence,
    testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
    testOnlyWorkPartitionInputBuilder: fakePartitionInput,
    testOnlyExecutor: makeFakeExecutor({ calls: 0 }),
    testOnlyScanner: async (input) => passingScan(input),
  });
  const readback = async (root, run) => {
    const profilePath = `analyses/genre_souls/${run.profile.soulId}/v1/genre-profile.json`;
    return readCompletedGenreSoulProfileRun({
      repositoryRoot: root,
      profilePath,
      profileBytes: await readFile(join(root, profilePath)),
      profile: run.profile,
      soulText: TEST_SOUL_TEXT,
    });
  };
  try {
    const wrongPromptRun = await build(roots[0]);
    await rewriteSealedWorkPartAttempt(roots[0], wrongPromptRun, async ({ trace }) => {
      const prompt = trace.messages[0].content;
      trace.messages[0].content = `X${prompt.slice(1)}`;
    });
    await assert.rejects(readback(roots[0], wrongPromptRun), /prompt|trace/u);

    const noReadRun = await build(roots[1]);
    await rewriteSealedWorkPartAttempt(roots[1], noReadRun, async ({ trace }) => {
      trace.messages = [trace.messages[0], trace.messages.at(-1)];
    });
    await assert.rejects(readback(roots[1], noReadRun), /read_file|read count|tool call|trace/u);
  } finally {
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  }
});

test("completion readback rejects a fully resealed schema-shaped result with false partition provenance", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-profile-result-forge-"));
  const evidence = makeEvidence();
  try {
    const run = await runGenreSoulProfile({
      testOnlyRepositoryRoot: root,
      genre: "modern-fantasy-ko",
      testOnly: true,
      testOnlySoulText: TEST_SOUL_TEXT,
      testOnlyEvidenceLoader: async () => evidence,
      testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
      testOnlyWorkPartitionInputBuilder: fakePartitionInput,
      testOnlyExecutor: makeFakeExecutor({ calls: 0 }),
      testOnlyScanner: async (input) => passingScan(input),
    });
    await rewriteSealedWorkPartAttempt(root, run, async ({ result }) => {
      result.reviewedObservationIds[0] = "obs-forged";
    });
    const profilePath = `analyses/genre_souls/${run.profile.soulId}/v1/genre-profile.json`;
    await assert.rejects(
      readCompletedGenreSoulProfileRun({
        repositoryRoot: root,
        profilePath,
        profileBytes: await readFile(join(root, profilePath)),
        profile: run.profile,
        soulText: TEST_SOUL_TEXT,
      }),
      /reviewedObservationIds|partition|result/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("completion readback rejects a fully resealed candidate output that differs from result JSON", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-profile-candidate-result-drift-"));
  const evidence = makeEvidence();
  try {
    const run = await runGenreSoulProfile({
      testOnlyRepositoryRoot: root,
      genre: "modern-fantasy-ko",
      testOnly: true,
      testOnlySoulText: TEST_SOUL_TEXT,
      testOnlyEvidenceLoader: async () => evidence,
      testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
      testOnlyWorkPartitionInputBuilder: fakePartitionInput,
      testOnlyExecutor: makeFakeExecutor({ calls: 0 }),
      testOnlyScanner: async (input) => passingScan(input),
    });
    await rewriteSealedWorkPartCandidateOnly(root, run, {
      schemaVersion: "private-forged-candidate/v1",
      plausible: true,
    });
    const profilePath = `analyses/genre_souls/${run.profile.soulId}/v1/genre-profile.json`;
    await assert.rejects(
      readCompletedGenreSoulProfileRun({
        repositoryRoot: root,
        profilePath,
        profileBytes: await readFile(join(root, profilePath)),
        profile: run.profile,
        soulText: TEST_SOUL_TEXT,
      }),
      /candidate output does not exactly equal its parsed result JSON/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("completion readback rejects a top-level-resealed final projection that differs from sealed Hermes results", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-profile-projection-forge-"));
  const evidence = makeEvidence();
  try {
    const run = await runGenreSoulProfile({
      testOnlyRepositoryRoot: root,
      genre: "modern-fantasy-ko",
      testOnly: true,
      testOnlySoulText: TEST_SOUL_TEXT,
      testOnlyEvidenceLoader: async () => evidence,
      testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
      testOnlyWorkPartitionInputBuilder: fakePartitionInput,
      testOnlyExecutor: makeFakeExecutor({ calls: 0 }),
      testOnlyScanner: async (input) => passingScan(input),
    });
    const profilePath = `analyses/genre_souls/${run.profile.soulId}/v1/genre-profile.json`;
    const routingPath = `inkos_handoffs/genre-souls/${run.profile.soulId}/v1/reference-routing-catalog.json`;
    const forgedProfile = JSON.parse(await readFile(join(root, profilePath), "utf8"));
    forgedProfile.patterns[0].guidance = `${forgedProfile.patterns[0].guidance} (재봉인 변조)`;
    validateGenreProfileArtifact(forgedProfile);
    const forgedProfileBytes = jsonBytes(forgedProfile);
    const forgedRouting = JSON.parse(await readFile(join(root, routingPath), "utf8"));
    forgedRouting.profile.sha256 = hash(forgedProfileBytes);
    await Promise.all([
      writeFile(join(root, profilePath), forgedProfileBytes),
      writeFile(join(root, routingPath), jsonBytes(forgedRouting)),
    ]);
    await refreshProfileCompletionSeal(root, run, [profilePath, routingPath]);

    await assert.rejects(
      readCompletedGenreSoulProfileRun({
        repositoryRoot: root,
        profilePath,
        profileBytes: forgedProfileBytes,
        profile: forgedProfile,
        soulText: TEST_SOUL_TEXT,
      }),
      /deterministic sealed-Hermes projection/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("serializes an entire content-addressed profile run before manifest work and records the actual digest", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-profile-run-lock-"));
  const evidence = makeEvidence();
  const counter = { calls: 0 };
  const baseExecutor = makeFakeExecutor(counter);
  let announcePaused;
  let releasePaused;
  const paused = new Promise((resolvePromise) => { announcePaused = resolvePromise; });
  const release = new Promise((resolvePromise) => { releasePaused = resolvePromise; });
  let replacementLiveLockPath;
  let releasedLockPath;
  let liveLockIdentity;
  let liveOwnerIdentity;
  let firstCall = true;
  const pausingExecutor = async (input) => {
    if (firstCall) {
      firstCall = false;
      announcePaused();
      await release;
    }
    return baseExecutor(input);
  };
  const options = {
    testOnlyRepositoryRoot: root,
    genre: "modern-fantasy-ko",
    testOnly: true,
    testOnlySoulText: TEST_SOUL_TEXT,
    testOnlyEvidenceLoader: async () => evidence,
    testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
    testOnlyWorkPartitionInputBuilder: fakePartitionInput,
    testOnlyExecutor: pausingExecutor,
    testOnlyScanner: async (input) => passingScan(input),
    testOnlyRunLockHooks: {
      afterLockReleaseRename: async ({ liveLockPath, releasePath }) => {
        replacementLiveLockPath = liveLockPath;
        releasedLockPath = releasePath;
        await mkdir(liveLockPath);
        await writeFile(join(liveLockPath, "foreign.txt"), "foreign\n");
      },
    },
  };
  try {
    const first = runGenreSoulProfile(options);
    await paused;
    const runsRoot = join(root, "exports/genre-souls/male-modern-fantasy-ko/v1/profile-runs");
    const [inputDigest] = await readdir(runsRoot);
    assert.match(inputDigest, /^[a-f0-9]{64}$/u);
    const owner = JSON.parse(await readFile(join(runsRoot, inputDigest, ".profile-run-lock/owner.json"), "utf8"));
    assert.equal(owner.inputDigest, inputDigest);
    const [liveLockInfo, liveOwnerInfo] = await Promise.all([
      lstat(join(runsRoot, inputDigest, ".profile-run-lock")),
      lstat(join(runsRoot, inputDigest, ".profile-run-lock/owner.json")),
    ]);
    liveLockIdentity = { dev: String(liveLockInfo.dev), ino: String(liveLockInfo.ino) };
    liveOwnerIdentity = { dev: String(liveOwnerInfo.dev), ino: String(liveOwnerInfo.ino) };
    await assert.rejects(runGenreSoulProfile({ ...options, testOnlyExecutor: baseExecutor }), /Profile run lock exists; stale locks require manual audit/u);
    releasePaused();
    const completed = await first;
    assert.equal(completed.inputDigest, inputDigest);
    assert.equal(replacementLiveLockPath, join(runsRoot, inputDigest, ".profile-run-lock"));
    assert.equal(await readFile(join(replacementLiveLockPath, "foreign.txt"), "utf8"), "foreign\n");
    const releasedOwnerBytes = await readFile(join(releasedLockPath, "owner.json"));
    assert.equal(JSON.parse(releasedOwnerBytes.toString("utf8")).inputDigest, inputDigest);
    const [releasedLockInfo, releasedOwnerInfo] = await Promise.all([
      lstat(releasedLockPath),
      lstat(join(releasedLockPath, "owner.json")),
    ]);
    assert.deepEqual({ dev: String(releasedLockInfo.dev), ino: String(releasedLockInfo.ino) }, liveLockIdentity);
    assert.deepEqual({ dev: String(releasedOwnerInfo.dev), ino: String(releasedOwnerInfo.ino) }, liveOwnerIdentity);
    assert.match(
      basename(releasedLockPath),
      new RegExp(`-${liveLockIdentity.dev}-${liveLockIdentity.ino}-${liveOwnerIdentity.dev}-${liveOwnerIdentity.ino}-${hash(releasedOwnerBytes)}$`, "u"),
    );
  } finally {
    releasePaused?.();
    await rm(root, { recursive: true, force: true });
  }
});

test("writes the top-level completion pointer only after every artifact and routing validator passes", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-profile-completion-last-"));
  const evidence = makeEvidence();
  const counter = { calls: 0 };
  const baseOptions = {
    testOnlyRepositoryRoot: root,
    genre: "modern-fantasy-ko",
    testOnly: true,
    testOnlySoulText: TEST_SOUL_TEXT,
    testOnlyEvidenceLoader: async () => evidence,
    testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
    testOnlyWorkPartitionInputBuilder: fakePartitionInput,
    testOnlyExecutor: makeFakeExecutor(counter),
    testOnlyScanner: async (input) => passingScan(input),
  };
  try {
    await assert.rejects(runGenreSoulProfile({
      ...baseOptions,
      testOnlyCompletionHooks: { afterArtifactValidation: () => { throw new Error("injected-after-artifact-validation"); } },
    }), /injected-after-artifact-validation/u);
    const runsRoot = join(root, "exports/genre-souls/male-modern-fantasy-ko/v1/profile-runs");
    const [inputDigest] = await readdir(runsRoot);
    assert.equal(await pathExists(join(runsRoot, inputDigest, "completed.json")), false);
    assert.equal(await pathExists(join(root, "analyses/genre_souls/male-modern-fantasy-ko/v1/genre-profile.json")), true);
    const recovered = await runGenreSoulProfile(baseOptions);
    assert.equal(recovered.status, "completed");
    assert.equal(await pathExists(join(runsRoot, inputDigest, "completed.json")), true);
    assert.equal(counter.calls, 7);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime bytes and canonical prompt-contract bytes change the top-level run digest", async () => {
  const roots = await Promise.all([0, 1, 2, 3].map(() => mkdtemp(join(tmpdir(), "genre-profile-digest-"))));
  const evidence = makeEvidence();
  const baselineRuntime = runtimeEvidence();
  const changedRuntime = runtimeEvidence({
    hermesExecutableSha256: fixedSha("0"),
    hermesVersionSha256: fixedSha("1"),
    hermesRuntimeIdentitySha256: fixedSha("2"),
  });
  const changedProjectContextRuntime = runtimeEvidence({
    hermesProjectContextSha256: fixedSha("0"),
    projectPromptContextBytes: 2_048,
    hermesRuntimeIdentitySha256: fixedSha("1"),
  });
  const run = async (root, runtime, promptContractEvidenceFactory) => runGenreSoulProfile({
    testOnlyRepositoryRoot: root,
    genre: "modern-fantasy-ko",
    testOnly: true,
    testOnlySoulText: TEST_SOUL_TEXT,
    testOnlyEvidenceLoader: async () => evidence,
    testOnlyRuntimeEvidenceLoader: async () => runtime,
    testOnlyPromptContractEvidenceFactory: promptContractEvidenceFactory,
    testOnlyWorkPartitionInputBuilder: fakePartitionInput,
    testOnlyExecutor: makeFakeExecutor({ calls: 0 }, runtime),
    testOnlyScanner: async (input) => passingScan(input),
  });
  try {
    const baseline = await run(roots[0], baselineRuntime);
    const runtimeChanged = await run(roots[1], changedRuntime);
    const projectContextChanged = await run(roots[2], changedProjectContextRuntime);
    const promptChanged = await run(roots[3], baselineRuntime, (input) => {
      const evidenceValue = buildProfilePromptContractEvidence(input);
      evidenceValue.contracts.genreSynthesis.sha256 = fixedSha("e");
      return evidenceValue;
    });
    assert.equal(baseline.status, "completed");
    assert.equal(runtimeChanged.status, "completed");
    assert.equal(projectContextChanged.status, "completed");
    assert.equal(promptChanged.status, "completed");
    assert.notEqual(runtimeChanged.inputDigest, baseline.inputDigest);
    assert.notEqual(projectContextChanged.inputDigest, baseline.inputDigest);
    assert.notEqual(promptChanged.inputDigest, baseline.inputDigest);
  } finally {
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  }
});

test("top-level reuse rejects deleted usage evidence and modified session traces", async () => {
  const roots = await Promise.all([0, 1].map(() => mkdtemp(join(tmpdir(), "genre-profile-hermes-evidence-"))));
  const evidence = makeEvidence();
  const runFixture = async (root, counter) => runGenreSoulProfile({
    testOnlyRepositoryRoot: root,
    genre: "modern-fantasy-ko",
    testOnly: true,
    testOnlySoulText: TEST_SOUL_TEXT,
    testOnlyEvidenceLoader: async () => evidence,
    testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
    testOnlyWorkPartitionInputBuilder: fakePartitionInput,
    testOnlyExecutor: makeFakeExecutor(counter),
    testOnlyScanner: async (input) => passingScan(input),
  });
  try {
    const deletedCounter = { calls: 0 };
    const deletedRun = await runFixture(roots[0], deletedCounter);
    const usageArtifact = deletedRun.completion.artifacts.find((artifact) => artifact.path.endsWith("/usage.json"));
    assert.ok(usageArtifact);
    await rm(join(roots[0], usageArtifact.path));
    await assert.rejects(runFixture(roots[0], deletedCounter));
    assert.equal(deletedCounter.calls, 7);

    const changedCounter = { calls: 0 };
    const changedRun = await runFixture(roots[1], changedCounter);
    const sessionArtifact = changedRun.completion.artifacts.find((artifact) => artifact.path.endsWith("/session.jsonl"));
    assert.ok(sessionArtifact);
    await writeFile(join(roots[1], sessionArtifact.path), "tampered-session\n");
    await assert.rejects(
      runFixture(roots[1], changedCounter),
      /Hermes trace or usage is invalid JSON|completion artifact drifted|completion pointer exact artifact set or identity drifted/u,
    );
    assert.equal(changedCounter.calls, 7);
  } finally {
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  }
});

test("a failed candidate scan leaves no tracked partial writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-profile-scan-fail-"));
  const evidence = makeEvidence();
  const counter = { calls: 0 };
  let scans = 0;
  try {
    await assert.rejects(runGenreSoulProfile({
      testOnlyRepositoryRoot: root,
      genre: "modern-fantasy-ko",
      testOnly: true,
      testOnlySoulText: TEST_SOUL_TEXT,
      testOnlyEvidenceLoader: async () => evidence,
      testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
      testOnlyWorkPartitionInputBuilder: fakePartitionInput,
      testOnlyExecutor: makeFakeExecutor(counter),
      testOnlyScanner: async (input) => {
        scans += 1;
        const receipt = passingScan(input);
        if (scans === 2) {
          receipt.status = "quarantine";
          receipt.matchCount = 1;
          receipt.matches = [{ matchId: "test-match" }];
        }
        return receipt;
      },
    }), /canonical zero-match byte- and corpus-bound pass receipt/u);
    assert.equal(await pathExists(join(root, "analyses/genre_souls/male-modern-fantasy-ko/v1/genre-profile.json")), false);
    assert.equal(await pathExists(join(root, "inkos_handoffs/genre-souls/male-modern-fantasy-ko/v1/reference-routing-catalog.json")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("publishes support before the no-clobber profile marker, preserves failed support with its lock, and fails closed on stale locks", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-profile-atomic-publish-"));
  const files = [
    { path: "analyses/soul/v1/genre-profile.json", bytes: jsonBytes({ marker: true }) },
    { path: "analyses/soul/v1/genre-profile.md", bytes: Buffer.from("support\n") },
    { path: "analyses/soul/v1/leak-scan-receipts/genre-profile.json", bytes: jsonBytes({ status: "pass" }) },
  ];
  const options = {
    markerPath: files[0].path,
    lockPath: "exports/genre-souls/soul/v1/.profile-publish-lock",
    inputDigest: fixedSha("a"),
    testOnly: true,
    testOnlyRepositoryRoot: root,
  };
  try {
    await assert.rejects(publishProfileBundle(root, files, {
      ...options,
      testOnlyHooks: { afterSupportPublish: () => { throw new Error("injected-before-marker"); } },
    }), /files and lock preserved for manual audit/u);
    assert.equal(await pathExists(join(root, files[0].path)), false);
    assert.equal(await pathExists(join(root, files[1].path)), true);
    assert.equal(await pathExists(join(root, files[2].path)), true);
    assert.equal(await pathExists(join(root, options.lockPath, "owner.json")), true);
    await assert.rejects(publishProfileBundle(root, files, options), /publish lock exists; stale locks require manual audit/u);
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });

    for (const support of files.slice(1)) {
      const target = join(root, support.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, support.bytes);
    }
    await assert.rejects(publishProfileBundle(root, files, {
      ...options,
      testOnlyHooks: { afterSupportPublish: () => { throw new Error("injected-after-reused-support"); } },
    }), /files and lock preserved for manual audit/u);
    assert.equal(await pathExists(join(root, files[0].path)), false);
    assert.equal(await pathExists(join(root, options.lockPath, "owner.json")), true);
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });

    let releaseFirst;
    let announceFirst;
    const firstPaused = new Promise((resolvePromise) => { announceFirst = resolvePromise; });
    const release = new Promise((resolvePromise) => { releaseFirst = resolvePromise; });
    const first = publishProfileBundle(root, files, {
      ...options,
      testOnlyHooks: { afterSupportPublish: async () => { announceFirst(); await release; } },
    });
    await firstPaused;
    assert.equal(await pathExists(join(root, files[0].path)), false);
    const owner = JSON.parse(await readFile(join(root, options.lockPath, "owner.json"), "utf8"));
    assert.equal(owner.inputDigest, options.inputDigest);
    await assert.rejects(publishProfileBundle(root, files, options), /publish lock exists; stale locks require manual audit/u);
    releaseFirst();
    assert.equal(await first, "created");
    for (const file of files) assert.equal((await lstat(join(root, file.path))).mode & 0o077, 0);
    assert.equal(await publishProfileBundle(root, files, options), "reused");

    await rm(join(root, files[1].path));
    await assert.rejects(
      publishProfileBundle(root, files, options),
      /marker exists without (?:its )?exact support/u,
    );
    assert.equal(await pathExists(join(root, options.lockPath, "owner.json")), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("profile publish lock release quarantine never removes a replacement at the live pathname", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-profile-publish-release-replacement-"));
  const files = [
    { path: "analyses/soul/v1/genre-profile.json", bytes: jsonBytes({ marker: true }) },
    { path: "analyses/soul/v1/genre-profile.md", bytes: Buffer.from("support\n") },
  ];
  const lockPath = "exports/genre-souls/soul/v1/.profile-publish-lock";
  let liveLockPath;
  let releasePath;
  let liveLockIdentity;
  let liveOwnerIdentity;
  const temporaryReleases = [];
  try {
    assert.equal(await publishProfileBundle(root, files, {
      markerPath: files[0].path,
      lockPath,
      inputDigest: fixedSha("c"),
      testOnly: true,
      testOnlyRepositoryRoot: root,
      testOnlyHooks: {
        afterSupportPublish: async () => {
          liveLockPath = join(root, lockPath);
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
    }), "created");
    assert.equal(await readFile(join(liveLockPath, "foreign.txt"), "utf8"), "foreign\n");
    const ownerBytes = await readFile(join(releasePath, "owner.json"));
    assert.equal(JSON.parse(ownerBytes.toString("utf8")).inputDigest, fixedSha("c"));
    const [releasedLockInfo, releasedOwnerInfo] = await Promise.all([
      lstat(releasePath),
      lstat(join(releasePath, "owner.json")),
    ]);
    assert.deepEqual({ dev: String(releasedLockInfo.dev), ino: String(releasedLockInfo.ino) }, liveLockIdentity);
    assert.deepEqual({ dev: String(releasedOwnerInfo.dev), ino: String(releasedOwnerInfo.ino) }, liveOwnerIdentity);
    assert.match(
      basename(releasePath),
      new RegExp(`-${liveLockIdentity.dev}-${liveLockIdentity.ino}-${liveOwnerIdentity.dev}-${liveOwnerIdentity.ino}-${hash(ownerBytes)}$`, "u"),
    );
    assert.equal(temporaryReleases.length, files.length);
    for (const temporary of temporaryReleases) {
      assert.equal(await readFile(temporary.liveTemporaryPath, "utf8"), "foreign-temp\n");
      const quarantineBytes = await readFile(temporary.releasePath);
      const quarantineInfo = await lstat(temporary.releasePath);
      assert.equal(quarantineInfo.isFile(), true);
      assert.ok(quarantineInfo.nlink >= 2);
      assert.match(
        basename(temporary.releasePath),
        new RegExp(`^file\\.released-[a-f0-9]{32}-${quarantineInfo.dev}-${quarantineInfo.ino}-${hash(quarantineBytes)}-${quarantineBytes.byteLength}$`, "u"),
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("profile publish lock rejects a semantically damaged content-rebound tombstone", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-profile-damaged-tombstone-"));
  const files = [
    { path: "analyses/soul/v1/genre-profile.json", bytes: jsonBytes({ marker: true }) },
    { path: "analyses/soul/v1/genre-profile.md", bytes: Buffer.from("support\n") },
  ];
  const options = {
    markerPath: files[0].path,
    lockPath: "exports/genre-souls/soul/v1/.profile-publish-lock",
    inputDigest: fixedSha("d"),
    testOnly: true,
    testOnlyRepositoryRoot: root,
  };
  try {
    await publishProfileBundle(root, files, options);
    const lockParent = join(root, "exports/genre-souls/soul/v1");
    const [releasedName] = (await readdir(lockParent)).filter((name) => name.startsWith(".profile-publish-lock.released-"));
    const releasedPath = join(lockParent, releasedName);
    const ownerPath = join(releasedPath, "owner.json");
    const ownerInfoBefore = await lstat(ownerPath);
    const owner = JSON.parse(await readFile(ownerPath, "utf8"));
    delete owner.inputDigest;
    const damagedBytes = jsonBytes(owner);
    await writeFile(ownerPath, damagedBytes);
    const ownerInfoAfter = await lstat(ownerPath);
    assert.deepEqual(
      { dev: ownerInfoAfter.dev, ino: ownerInfoAfter.ino },
      { dev: ownerInfoBefore.dev, ino: ownerInfoBefore.ino },
    );
    const reboundName = releasedName.replace(/[a-f0-9]{64}$/u, hash(damagedBytes));
    await rename(releasedPath, join(lockParent, reboundName));
    await assert.rejects(
      publishProfileBundle(root, files, options),
      /released quarantine owner contract drifted; manual audit is required/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("profile failure never mutates a replaced support and preserves the lock for audit", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-profile-rollback-ownership-"));
  const files = [
    { path: "analyses/soul/v1/genre-profile.json", bytes: jsonBytes({ marker: true }) },
    { path: "analyses/soul/v1/genre-profile.md", bytes: Buffer.from("owned-support\n") },
    { path: "analyses/soul/v1/leak-scan-receipts/genre-profile.json", bytes: jsonBytes({ status: "pass" }) },
  ];
  const lockPath = "exports/genre-souls/soul/v1/.profile-publish-lock";
  const foreignBytes = Buffer.from("foreign-replacement\n");
  try {
    await assert.rejects(publishProfileBundle(root, files, {
      markerPath: files[0].path,
      lockPath,
      inputDigest: fixedSha("b"),
      testOnly: true,
      testOnlyRepositoryRoot: root,
      testOnlyHooks: {
        afterSupportPublish: async ({ supports }) => {
          await rm(supports[0].absolute);
          await writeFile(supports[0].absolute, foreignBytes);
          throw new Error("injected-after-foreign-replacement");
        },
      },
    }), /files and lock preserved for manual audit/u);
    assert.deepEqual(await readFile(join(root, files[1].path)), foreignBytes);
    assert.equal(await pathExists(join(root, files[0].path)), false);
    assert.equal(await pathExists(join(root, lockPath, "owner.json")), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("top-level reuse revalidates exact pointer, routing support, and partition review provenance", async () => {
  const roots = await Promise.all([0, 1, 2].map(() => mkdtemp(join(tmpdir(), "genre-profile-reuse-validation-"))));
  const evidence = makeEvidence();
  const runFixture = async (root, counter) => runGenreSoulProfile({
    testOnlyRepositoryRoot: root,
    genre: "modern-fantasy-ko",
    testOnly: true,
    testOnlySoulText: TEST_SOUL_TEXT,
    testOnlyEvidenceLoader: async () => evidence,
    testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
    testOnlyWorkPartitionInputBuilder: fakePartitionInput,
    testOnlyExecutor: makeFakeExecutor(counter),
    testOnlyScanner: async (input) => passingScan(input),
  });
  try {
    const pointerCounter = { calls: 0 };
    const pointerRun = await runFixture(roots[0], pointerCounter);
    const pointerPath = join(
      roots[0],
      `exports/genre-souls/male-modern-fantasy-ko/v1/profile-runs/${pointerRun.inputDigest}/completed.json`,
    );
    const pointer = JSON.parse(await readFile(pointerPath, "utf8"));
    pointer.artifacts.pop();
    await writeFile(pointerPath, jsonBytes(pointer));
    await assert.rejects(runFixture(roots[0], pointerCounter), /exact artifact set or identity drifted/u);
    assert.equal(pointerCounter.calls, 7);

    const routingCounter = { calls: 0 };
    const routingRun = await runFixture(roots[1], routingCounter);
    const realRoutingPath = join(
      roots[1],
      "inkos_handoffs/genre-souls/male-modern-fantasy-ko/v1/reference-routing-catalog.json",
    );
    const routing = JSON.parse(await readFile(realRoutingPath, "utf8"));
    routing.routes[0].retrievalActive = true;
    await writeFile(realRoutingPath, jsonBytes(routing));
    await assert.rejects(runFixture(roots[1], routingCounter), /marker exists without exact support|tracked artifact differs/u);
    assert.equal(routingCounter.calls, 7);

    const provenanceCounter = { calls: 0 };
    const provenanceRun = await runFixture(roots[2], provenanceCounter);
    const partResultArtifact = provenanceRun.completion.artifacts.find((artifact) => (
      artifact.path.includes("/parts/p0001/hermes/attempts/") && artifact.path.endsWith("/result.json")
    ));
    assert.ok(partResultArtifact);
    const partResultPath = join(roots[2], partResultArtifact.path);
    const partResult = JSON.parse(await readFile(partResultPath, "utf8"));
    partResult.reviewedObservationIds = partResult.reviewedObservationIds.slice(1);
    await writeFile(partResultPath, jsonBytes(partResult));
    await assert.rejects(runFixture(roots[2], provenanceCounter), /reviewedObservationIds must exactly cover/u);
    assert.equal(provenanceCounter.calls, 7);
  } finally {
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  }
});

test("rejects a symlinked write ancestor before creating private or tracked artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-profile-symlink-root-"));
  const outside = await mkdtemp(join(tmpdir(), "genre-profile-symlink-outside-"));
  const counter = { calls: 0 };
  try {
    await mkdir(root, { recursive: true });
    await symlink(outside, join(root, "exports"), "dir");
    await assert.rejects(runGenreSoulProfile({
      testOnlyRepositoryRoot: root,
      genre: "modern-fantasy-ko",
      testOnly: true,
      testOnlySoulText: TEST_SOUL_TEXT,
      testOnlyEvidenceLoader: async () => makeEvidence(),
      testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
      testOnlyWorkPartitionInputBuilder: fakePartitionInput,
      testOnlyExecutor: makeFakeExecutor(counter),
      testOnlyScanner: async (input) => passingScan(input),
    }), /symlink ancestor/u);
    assert.equal(counter.calls, 0);
    assert.deepEqual(await readdir(outside), []);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("tracked semantic lint rejects selection identity and private-sample proper surfaces without blocking generic mechanisms", () => {
  const bindings = makeEvidence().bindings;
  assert.throws(() => assertNoSelectionSurfaceInTrackedCandidate({
    guidance: `이 지침은 ${bindings[0].author}의 표면을 반복한다`,
  }, bindings), /protected private surface/u);

  const privateSampleBlobs = [{
    selectorId: "selector-private-name",
    sourceText: "차도윤과 김철은 함께 움직였다. 김광은 문을 닫았다. 김철이는 먼저 갔다. 김철이가 돌아왔다. 김철이를 불렀다. 김철, 지금 와. 모두 그를 김철이라고 불렀다. 태성그룹이라는 회사가 인수를 준비했고 상대도 태성그룹이었다. 대기업은 시장 압박을 받았다. 기회가 닫히기 전에 움직였다. 계약을 뒤집어 현금을 즉시 확보했다. 압박을 돈으로 바꾼 뒤 목격자 앞에서 즉시 지위를 얻는다.",
  }];
  assert.equal(assertNoSelectionSurfaceInTrackedCandidate({
    mechanism: "주인공이 압박을 선제 행동으로 바꾸고 공개 보상을 회수한다",
  }, bindings, privateSampleBlobs), true);
  assert.throws(() => assertNoSelectionSurfaceInTrackedCandidate({
    mechanism: "차도윤 방식은 압박을 선제 행동으로 전환한다",
  }, bindings, privateSampleBlobs), /pending_semantic_review/u);
  assert.throws(() => assertNoSelectionSurfaceInTrackedCandidate({
    routing: "태성그룹의 자원 회수 순서를 기준으로 삼는다",
  }, bindings, privateSampleBlobs), /pending_semantic_review/u);
  assert.throws(() => assertNoSelectionSurfaceInTrackedCandidate({
    mechanism: "김철 방식은 압박을 선제 행동으로 전환한다",
  }, bindings, privateSampleBlobs), /pending_semantic_review/u);
  assert.throws(() => assertNoSelectionSurfaceInTrackedCandidate({
    mechanism: "김광 방식은 압박을 선제 행동으로 전환한다",
  }, bindings, privateSampleBlobs), /pending_semantic_review/u);
  assert.throws(() => assertNoSelectionSurfaceInTrackedCandidate({
    routing: "태성 방식의 자원 회수 순서를 기준으로 삼는다",
  }, bindings, privateSampleBlobs), /pending_semantic_review/u);
  for (const [index, sourceText] of [
    "김철이는 먼저 움직였다.",
    "김철이가 먼저 움직였다.",
    "김철이를 먼저 불렀다.",
    "김철, 지금 와.",
    "모두 그를 김철이라고 불렀다.",
  ].entries()) {
    assert.throws(() => assertNoSelectionSurfaceInTrackedCandidate({
      mechanism: "김철 방식은 압박을 선제 행동으로 전환한다",
    }, bindings, [{ selectorId: `selector-name-form-${index}`, sourceText }]), /pending_semantic_review/u);
  }
  for (const [index, sourceText] of ["태성그룹이라는 회사다.", "상대는 태성그룹이었다."].entries()) {
    assert.throws(() => assertNoSelectionSurfaceInTrackedCandidate({
      routing: "태성 방식의 자원 회수 순서를 기준으로 삼는다",
    }, bindings, [{ selectorId: `selector-org-form-${index}`, sourceText }]), /pending_semantic_review/u);
  }
  assert.throws(() => assertNoSelectionSurfaceInTrackedCandidate({
    guidance: "계약을 뒤집어 현금을 즉시 확보했다",
  }, bindings, privateSampleBlobs), /exact-private-surface-copy/u);
  assert.throws(() => assertNoSelectionSurfaceInTrackedCandidate({
    guidance: "압박을 돈으로 바꾼 뒤 목격자 앞에서 즉시 지위를 얻는다",
  }, bindings, privateSampleBlobs), /exact-private-surface-copy/u);
  const selectionBindings = structuredClone(bindings);
  selectionBindings[0].title = "재벌집 막내아들";
  assert.equal(assertNoSelectionSurfaceInTrackedCandidate({
    guidance: "재벌집 방식의 보상 회수를 변주한다",
  }, selectionBindings, []), true);
  selectionBindings[0].title = "재벌집막내아들";
  assert.equal(assertNoSelectionSurfaceInTrackedCandidate({
    guidance: "재벌집 방식의 보상 회수를 변주한다",
  }, selectionBindings, []), true);
  assert.equal(assertNoSelectionSurfaceInTrackedCandidate({
    mechanism: "대기업 인수 방식은 압박을 선제 행동으로 바꾼다",
  }, [{ ...bindings[0], title: "대기업재벌집" }, ...bindings.slice(1)], privateSampleBlobs), true);
  assert.equal(assertNoSelectionSurfaceInTrackedCandidate({
    mechanism: "기회가 닫히는 압박을 선제 행동으로 바꾼다",
  }, bindings, privateSampleBlobs), true);
  assert.equal(assertNoSelectionSurfaceInTrackedCandidate({
    mechanism: "대기업 인수 압박 회수",
  }, bindings, privateSampleBlobs), true);
  assert.throws(() => assertNoSelectionSurfaceInTrackedCandidate({
    mechanism: "공개 방식은 압박 회수 순서를 바꾼다",
  }, bindings, [{ selectorId: "selector-ambiguous-public", sourceText: "공개는 다음 보상을 바꾼다." }]), /pending_semantic_review/u);
  for (const [index, genericNoun] of ["변화", "한계", "권한"].entries()) {
    assert.equal(assertNoSelectionSurfaceInTrackedCandidate({
      mechanism: `${genericNoun} 방식은 압박 회수 순서를 바꾼다`,
    }, bindings, [{ selectorId: `selector-generic-${index}`, sourceText: `${genericNoun}는 다음 보상을 바꾼다.` }]), true);
  }
});

test("high-confidence protected work surfaces fail only at the final tracked profile gate", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-profile-preseal-surface-"));
  const counter = { calls: 0 };
  try {
    await assert.rejects(runGenreSoulProfile({
      testOnlyRepositoryRoot: root,
      genre: "modern-fantasy-ko",
      testOnly: true,
      testOnlySoulText: TEST_SOUL_TEXT,
      testOnlyEvidenceLoader: async () => makeEvidence(),
      testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
      testOnlyWorkPartitionInputBuilder: fakePartitionInput,
      testOnlyExecutor: makeFakeExecutor(counter, runtimeEvidence(), (result, input) => {
        if (input.role === "genre-soul-work-consolidation:gdrive-commercial") {
          result.primaryCommercialEngine.mechanism.pressure = "표면금지작품1의 고유 압박을 그대로 따른다";
        }
      }),
      testOnlyScanner: async (input) => passingScan(input),
    }), /Tracked profile semantic candidate contains a protected private surface/u);
    const [runDigest] = await readdir(join(
      root,
      "exports/genre-souls/male-modern-fantasy-ko/v1/profile-runs",
    ));
    assert.ok(runDigest);
    assert.equal(await pathExists(join(
      root,
      "exports/genre-souls/male-modern-fantasy-ko/v1/profile-runs",
      runDigest,
      "works/gdrive-commercial/consolidation/hermes/completed.json",
    )), true);
    assert.equal(await pathExists(join(
      root,
      "exports/genre-souls/male-modern-fantasy-ko/v1/profile-runs",
      runDigest,
      "genre/hermes/completed.json",
    )), true);
    await assert.rejects(readFile(join(
      root,
      "analyses/genre_souls/male-modern-fantasy-ko/v1/genre-profile.json",
    )), /ENOENT/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("high-confidence protected genre surfaces fail after the producer synthesis is privately sealed", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-profile-preseal-genre-surface-"));
  const counter = { calls: 0 };
  try {
    await assert.rejects(runGenreSoulProfile({
      testOnlyRepositoryRoot: root,
      genre: "modern-fantasy-ko",
      testOnly: true,
      testOnlySoulText: TEST_SOUL_TEXT,
      testOnlyEvidenceLoader: async () => makeEvidence(),
      testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
      testOnlyWorkPartitionInputBuilder: fakePartitionInput,
      testOnlyExecutor: makeFakeExecutor(counter, runtimeEvidence(), (result, input) => {
        if (input.role === "genre-soul-profile-synthesis") {
          result.routingCandidates[0].rationale = "표면금지작품1의 고유 보상 순서를 그대로 따른다";
        }
      }),
      testOnlyScanner: async (input) => passingScan(input),
    }), /Tracked profile semantic candidate contains a protected private surface/u);
    const [runDigest] = await readdir(join(
      root,
      "exports/genre-souls/male-modern-fantasy-ko/v1/profile-runs",
    ));
    assert.ok(runDigest);
    assert.equal(await pathExists(join(
      root,
      "exports/genre-souls/male-modern-fantasy-ko/v1/profile-runs",
      runDigest,
      "genre/hermes/completed.json",
    )), true);
    await assert.rejects(readFile(join(
      root,
      "analyses/genre_souls/male-modern-fantasy-ko/v1/genre-profile.json",
    )), /ENOENT/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("profile semantic reviewer auto-passes generic overlap once and seals its independent evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-profile-semantic-pass-"));
  const counter = { calls: 0 };
  const evidence = makeAmbiguousSurfaceEvidence();
  let semanticPromptCount = 0;
  const mutateResult = (result, input) => {
    injectAmbiguousWorkSurface(result, input);
    if (input.role.startsWith("genre-soul-surface-semantic-review:")) {
      semanticPromptCount += 1;
      assert.match(input.prompt, /independent private surface-semantic reviewer/u);
      assert.match(input.prompt, /Fictional crime, coercion, violence, bias, morality, and commercial intensity are irrelevant/u);
      assert.match(input.prompt, /Do not propose rewrites and do not echo/u);
    }
  };
  const executor = makeFakeExecutor(counter, runtimeEvidence(), mutateResult);
  const options = {
    testOnlyRepositoryRoot: root,
    genre: "modern-fantasy-ko",
    testOnly: true,
    testOnlySoulText: TEST_SOUL_TEXT,
    testOnlyEvidenceLoader: async () => evidence,
    testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
    testOnlyWorkPartitionInputBuilder: fakePartitionInput,
    testOnlyExecutor: executor,
    testOnlyScanner: async (input) => passingScan(input),
  };
  try {
    const completed = await runGenreSoulProfile(options);
    assert.equal(completed.status, "completed");
    assert.equal(counter.calls, 8);
    assert.equal(semanticPromptCount, 1);
    assert.equal(completed.surfaceReview.status, "pass");
    assert.equal(completed.surfaceHil, undefined);
    assert.match(completed.surfaceReview.receipt.role, /^genre-soul-surface-semantic-review:profile:/u);
    for (const path of [
      completed.surfaceReview.candidatePath,
      completed.surfaceReview.inputPath,
      completed.surfaceReview.acceptedPath,
      completed.surfaceReview.acceptedReceiptPath,
    ]) assert.ok(completed.completion.artifacts.some((artifact) => artifact.path === path), path);
    const reviewArtifacts = completed.completion.artifacts.filter((artifact) => (
      artifact.path.includes("/genre/surface-review/")
    ));
    assert.ok(reviewArtifacts.some((artifact) => artifact.path.endsWith("/hermes/completed.json")));
    assert.ok(reviewArtifacts.some((artifact) => artifact.path.endsWith("/session.jsonl")));
    assert.ok(reviewArtifacts.every((artifact) => !artifact.path.includes("/owner-hil/")));

    const profilePath = "analyses/genre_souls/male-modern-fantasy-ko/v1/genre-profile.json";
    const readback = await readCompletedGenreSoulProfileRun({
      repositoryRoot: root,
      profilePath,
      profileBytes: await readFile(join(root, profilePath)),
      profile: completed.profile,
      soulText: TEST_SOUL_TEXT,
    });
    assert.equal(readback.inputDigest, completed.inputDigest);

    const reused = await runGenreSoulProfile(options);
    assert.equal(reused.status, "reused");
    assert.equal(reused.surfaceReview.status, "pass");
    assert.equal(counter.calls, 8);
    assert.equal(semanticPromptCount, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("profile production-budget overflow partitions all-generic findings and reuses exact completion", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-profile-semantic-overflow-pass-"));
  const counter = { calls: 0 };
  const terms = makeOverflowAmbiguousTerms();
  let semanticCallCount = 0;
  const options = {
    testOnlyRepositoryRoot: root,
    genre: "modern-fantasy-ko",
    testOnly: true,
    testOnlySoulText: TEST_SOUL_TEXT,
    testOnlyEvidenceLoader: async () => makeAmbiguousSurfaceEvidence(terms),
    testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
    testOnlyWorkPartitionInputBuilder: fakePartitionInput,
    testOnlyExecutor: makeFakeExecutor(counter, runtimeEvidence(), (result, input) => {
      injectAmbiguousWorkSurface(result, input, terms);
      if (input.role.startsWith("genre-soul-surface-semantic-review:")) semanticCallCount += 1;
    }),
    testOnlyScanner: async (input) => passingScan(input),
  };
  try {
    const completed = await runGenreSoulProfile(options);
    assert.equal(completed.status, "completed");
    assert.equal(completed.surfaceReview.mode, "partitioned");
    assert.equal(completed.surfaceReview.status, "pass");
    assert.ok(completed.surfaceReview.partCount >= 2);
    assert.equal(semanticCallCount, completed.surfaceReview.partCount);
    assert.equal(completed.surfaceHil, undefined);
    const plan = JSON.parse(await readFile(join(root, completed.surfaceReview.partitionPlanPath), "utf8"));
    assert.equal(plan.parts.length, completed.surfaceReview.partCount);
    assert.equal(plan.parts.every((part) => (
      part.contextBudgetReceipt.maxInputConservativeTokenProxy === 190_000
      && part.contextBudgetReceipt.conservativeTokenProxy <= 190_000
    )), true);
    const profilePath = "analyses/genre_souls/male-modern-fantasy-ko/v1/genre-profile.json";
    const readback = await readCompletedGenreSoulProfileRun({
      repositoryRoot: root,
      profilePath,
      profileBytes: await readFile(join(root, profilePath)),
      profile: completed.profile,
      soulText: TEST_SOUL_TEXT,
    });
    assert.equal(readback.inputDigest, completed.inputDigest);

    const callsAfterCompletion = counter.calls;
    const reused = await runGenreSoulProfile(options);
    assert.equal(reused.status, "reused");
    assert.equal(reused.surfaceReview.mode, "partitioned");
    assert.equal(reused.surfaceReview.status, "pass");
    assert.equal(counter.calls, callsAfterCompletion);
    assert.equal(semanticCallCount, completed.surfaceReview.partCount);

    const aggregatePath = completed.surfaceReview.aggregatePath;
    const aggregate = JSON.parse(await readFile(join(root, aggregatePath), "utf8"));
    aggregate.verdictCounts.genericOverlap += 1;
    await writeFile(join(root, aggregatePath), jsonBytes(aggregate));
    await refreshProfileCompletionSeal(root, completed, [aggregatePath]);
    await assert.rejects(readCompletedGenreSoulProfileRun({
      repositoryRoot: root,
      profilePath,
      profileBytes: await readFile(join(root, profilePath)),
      profile: completed.profile,
      soulText: TEST_SOUL_TEXT,
    }), /aggregate drifted|verdictCounts|partition evidence/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("profile partition aggregate preserves raw verdict evidence and fail-closes incomplete windows to HIL", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-profile-semantic-overflow-incomplete-"));
  const counter = { calls: 0 };
  const terms = makeOverflowAmbiguousTerms();
  const options = {
    testOnlyRepositoryRoot: root,
    genre: "modern-fantasy-ko",
    testOnly: true,
    testOnlySoulText: TEST_SOUL_TEXT,
    testOnlyEvidenceLoader: async () => makeAmbiguousSurfaceEvidence(terms, { sampleSelectorCount: 9 }),
    testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
    testOnlyWorkPartitionInputBuilder: fakePartitionInput,
    testOnlyExecutor: makeFakeExecutor(counter, runtimeEvidence(), (result, input) => {
      injectAmbiguousWorkSurface(result, input, terms);
    }),
    testOnlyScanner: async (input) => passingScan(input),
  };
  try {
    const pending = await runGenreSoulProfile(options);
    assert.equal(pending.status, "pending_hil");
    assert.equal(pending.surfaceReview.mode, "partitioned");
    assert.equal(pending.surfaceReview.status, "pending_hil");

    const plan = JSON.parse(await readFile(join(root, pending.surfaceReview.partitionPlanPath), "utf8"));
    const surfaceRoot = dirname(pending.surfaceReview.partitionPlanPath);
    let incompleteCount = 0;
    let selected = null;
    for (const part of plan.parts) {
      const partRoot = join(surfaceRoot, "parts", part.partId);
      const input = JSON.parse(await readFile(join(root, partRoot, "input.json"), "utf8"));
      const incompleteFindings = input.findings.filter((finding) => !finding.windowCoverageComplete);
      incompleteCount += incompleteFindings.length;
      if (selected !== null || incompleteFindings.length < 1) continue;
      const finding = incompleteFindings[0];
      const rawResultBytes = await readFile(join(root, partRoot, "accepted.json"));
      const rawResult = JSON.parse(rawResultBytes);
      const rawDecision = rawResult.findingDecisions.find((decision) => decision.findingId === finding.findingId);
      const acceptedReceipt = JSON.parse(await readFile(
        join(root, partRoot, "accepted-host-receipt.json"),
        "utf8",
      ));
      const completedPointer = JSON.parse(await readFile(join(root, partRoot, "hermes", "completed.json"), "utf8"));
      const attemptRoot = join(partRoot, "hermes", completedPointer.attempt);
      const candidateOutput = JSON.parse(await readFile(join(root, attemptRoot, "candidate-output.txt"), "utf8"));
      const attemptResultBytes = await readFile(join(root, attemptRoot, "result.json"));
      selected = {
        partId: part.partId,
        finding,
        rawDecision,
        rawResult,
        rawResultBytes,
        acceptedReceipt,
        candidateOutput,
        attemptResultBytes,
      };
    }
    assert.ok(selected);
    assert.ok(incompleteCount > 0);
    assert.equal(selected.rawDecision.verdict, "generic-overlap");
    assert.equal(selected.rawDecision.reasonCode, "common-lexeme");
    assert.deepEqual(selected.candidateOutput, selected.rawResult);
    assert.equal(selected.attemptResultBytes.compare(selected.rawResultBytes), 0);
    assert.equal(selected.acceptedReceipt.resultSha256, hash(selected.rawResultBytes));

    const aggregate = JSON.parse(await readFile(join(root, pending.surfaceReview.aggregatePath), "utf8"));
    const effectiveDecision = aggregate.findingDecisions.find((decision) => (
      decision.findingId === selected.finding.findingId
    ));
    assert.deepEqual(effectiveDecision, {
      ...selected.rawDecision,
      verdict: "uncertain",
      reasonCode: "insufficient-context",
    });
    assert.equal(aggregate.verdictCounts.uncertain, incompleteCount);
    assert.equal(aggregate.verdictCounts.protectedIdentity, 0);
    assert.equal(aggregate.outcome, "pending_hil");
    const aggregatePart = aggregate.parts.find((part) => part.partId === selected.partId);
    assert.ok(aggregatePart.uncertainFindingIds.includes(selected.finding.findingId));
    assert.equal(aggregatePart.result.sha256, hash(selected.rawResultBytes));

    const request = JSON.parse(await readFile(join(root, pending.surfaceHil.requestPath), "utf8"));
    assert.equal(request.findings.length, incompleteCount);
    assert.ok(request.findings.some((finding) => finding.findingId === selected.finding.findingId));
    assert.equal(await pathExists(join(
      root,
      `exports/genre-souls/male-modern-fantasy-ko/v1/profile-runs/${pending.inputDigest}/completed.json`,
    )), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("profile overflow emits one batch v4 HIL request and completes after one owner decision", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-profile-semantic-overflow-hil-"));
  const counter = { calls: 0 };
  const terms = makeOverflowAmbiguousTerms();
  let uncertainAssigned = false;
  const options = {
    testOnlyRepositoryRoot: root,
    genre: "modern-fantasy-ko",
    testOnly: true,
    testOnlySoulText: TEST_SOUL_TEXT,
    testOnlyEvidenceLoader: async () => makeAmbiguousSurfaceEvidence(terms),
    testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
    testOnlyWorkPartitionInputBuilder: fakePartitionInput,
    testOnlyExecutor: makeFakeExecutor(counter, runtimeEvidence(), (result, input) => {
      injectAmbiguousWorkSurface(result, input, terms);
      if (input.role.startsWith("genre-soul-surface-semantic-review:") && !uncertainAssigned) {
        result.findingDecisions[0].verdict = "uncertain";
        result.findingDecisions[0].reasonCode = "insufficient-context";
        uncertainAssigned = true;
      }
    }),
    testOnlyScanner: async (input) => passingScan(input),
  };
  try {
    const pending = await runGenreSoulProfile(options);
    assert.equal(pending.status, "pending_hil");
    assert.equal(pending.surfaceReview.mode, "partitioned");
    assert.ok(pending.surfaceReview.partCount >= 2);
    assert.equal(pending.surfaceReview.status, "pending_hil");
    assert.equal(pending.surfaceHil.findingCount, 1);
    const request = JSON.parse(await readFile(join(root, pending.surfaceHil.requestPath), "utf8"));
    assert.equal(request.schemaVersion, "private-genre-soul-batch-ambiguous-surface-request/v4");
    assert.equal(request.findings.length, 1);
    assert.equal(request.batchSemanticReview.parts.length, pending.surfaceReview.partCount);
    assert.equal((await readdir(join(root, dirname(pending.surfaceHil.requestPath)))).length, 1);
    assert.equal(await pathExists(join(
      root,
      `exports/genre-souls/male-modern-fantasy-ko/v1/profile-runs/${pending.inputDigest}/completed.json`,
    )), false);

    const callsAtHil = counter.calls;
    const decision = await writePrivateGenreSoulSurfaceHilDecision({
      repositoryRoot: root,
      requestPath: pending.surfaceHil.requestPath,
      decision: "approve",
      actorId: "owner:test",
      decidedAt: "2026-08-30T00:00:00.000Z",
      testOnly: true,
      testOnlyRepositoryRoot: root,
    });
    assert.equal(decision.outcome, "approved");
    const completed = await runGenreSoulProfile(options);
    assert.equal(completed.status, "completed");
    assert.equal(completed.surfaceReview.mode, "partitioned");
    assert.equal(completed.surfaceReview.status, "pending_hil");
    assert.equal(completed.surfaceHil.outcome, "pass");
    assert.equal(completed.surfaceHil.decisionPath, decision.decisionPath);
    assert.equal(counter.calls, callsAtHil);
    assert.equal((await readdir(join(root, dirname(decision.decisionPath)))).length, 1);
    const requestArtifacts = completed.completion.artifacts.filter((artifact) => (
      artifact.path.includes("/genre/surface-review/owner-hil/requests/")
    ));
    const decisionArtifacts = completed.completion.artifacts.filter((artifact) => (
      artifact.path.includes("/genre/surface-review/owner-hil/decisions/")
    ));
    assert.equal(requestArtifacts.length, 1);
    assert.equal(decisionArtifacts.length, 1);
    const profilePath = "analyses/genre_souls/male-modern-fantasy-ko/v1/genre-profile.json";
    const readback = await readCompletedGenreSoulProfileRun({
      repositoryRoot: root,
      profilePath,
      profileBytes: await readFile(join(root, profilePath)),
      profile: completed.profile,
      soulText: TEST_SOUL_TEXT,
    });
    assert.equal(readback.inputDigest, completed.inputDigest);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("profile overflow protected verdict blocks after aggregate with no HIL or completion", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-profile-semantic-overflow-block-"));
  const counter = { calls: 0 };
  const terms = makeOverflowAmbiguousTerms();
  let protectedAssigned = false;
  try {
    await assert.rejects(runGenreSoulProfile({
      testOnlyRepositoryRoot: root,
      genre: "modern-fantasy-ko",
      testOnly: true,
      testOnlySoulText: TEST_SOUL_TEXT,
      testOnlyEvidenceLoader: async () => makeAmbiguousSurfaceEvidence(terms),
      testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
      testOnlyWorkPartitionInputBuilder: fakePartitionInput,
      testOnlyExecutor: makeFakeExecutor(counter, runtimeEvidence(), (result, input) => {
        injectAmbiguousWorkSurface(result, input, terms);
        if (input.role.startsWith("genre-soul-surface-semantic-review:") && !protectedAssigned) {
          result.findingDecisions[0].verdict = "protected-identity";
          result.findingDecisions[0].reasonCode = "same-person-identity";
          protectedAssigned = true;
        }
      }),
      testOnlyScanner: async (input) => passingScan(input),
    }), /semantic reviewer found a protected private identity/u);
    const [runDigest] = await readdir(join(
      root,
      "exports/genre-souls/male-modern-fantasy-ko/v1/profile-runs",
    ));
    const reviewRoot = join(
      root,
      "exports/genre-souls/male-modern-fantasy-ko/v1/profile-runs",
      runDigest,
      "genre/surface-review",
    );
    const aggregate = JSON.parse(await readFile(join(reviewRoot, "aggregate.json"), "utf8"));
    assert.equal(aggregate.outcome, "blocked");
    assert.equal(aggregate.verdictCounts.protectedIdentity, 1);
    assert.ok(aggregate.parts.length >= 2);
    assert.equal(await pathExists(join(reviewRoot, "owner-hil")), false);
    assert.equal(await pathExists(join(
      root,
      "exports/genre-souls/male-modern-fantasy-ko/v1/profile-runs",
      runDigest,
      "completed.json",
    )), false);
    assert.equal(await pathExists(join(
      root,
      "analyses/genre_souls/male-modern-fantasy-ko/v1/genre-profile.json",
    )), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("profile semantic reviewer preserves sealed evidence but blocks a protected identity before publication", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-profile-semantic-block-"));
  const counter = { calls: 0 };
  const evidence = makeAmbiguousSurfaceEvidence();
  const mutateResult = (result, input) => {
    injectAmbiguousWorkSurface(result, input);
    if (input.role.startsWith("genre-soul-surface-semantic-review:")) {
      for (const finding of result.findingDecisions) {
        finding.verdict = "protected-identity";
        finding.reasonCode = "same-person-identity";
      }
    }
  };
  try {
    await assert.rejects(runGenreSoulProfile({
      testOnlyRepositoryRoot: root,
      genre: "modern-fantasy-ko",
      testOnly: true,
      testOnlySoulText: TEST_SOUL_TEXT,
      testOnlyEvidenceLoader: async () => evidence,
      testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
      testOnlyWorkPartitionInputBuilder: fakePartitionInput,
      testOnlyExecutor: makeFakeExecutor(counter, runtimeEvidence(), mutateResult),
      testOnlyScanner: async (input) => passingScan(input),
    }), /semantic reviewer found a protected private identity/u);
    assert.equal(counter.calls, 8);
    const [runDigest] = await readdir(join(
      root,
      "exports/genre-souls/male-modern-fantasy-ko/v1/profile-runs",
    ));
    const reviewRoot = join(
      root,
      "exports/genre-souls/male-modern-fantasy-ko/v1/profile-runs",
      runDigest,
      "genre/surface-review",
    );
    for (const path of [
      "candidate.json",
      "input.json",
      "accepted.json",
      "accepted-host-receipt.json",
      "hermes/completed.json",
    ]) assert.equal(await pathExists(join(reviewRoot, path)), true, path);
    assert.equal(await pathExists(join(
      root,
      "exports/genre-souls/male-modern-fantasy-ko/v1/profile-runs",
      runDigest,
      "completed.json",
    )), false);
    assert.equal(await pathExists(join(
      root,
      "analyses/genre_souls/male-modern-fantasy-ko/v1/genre-profile.json",
    )), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("profile semantic reviewer rejects missing or extra finding decisions before publication", async () => {
  for (const [label, mutateDecisions] of [
    ["missing", (decisions) => { decisions.pop(); }],
    ["extra", (decisions) => { decisions.push(structuredClone(decisions[0])); }],
  ]) {
    const root = await mkdtemp(join(tmpdir(), `genre-profile-semantic-${label}-`));
    const counter = { calls: 0 };
    const evidence = makeAmbiguousSurfaceEvidence();
    const mutateResult = (result, input) => {
      injectAmbiguousWorkSurface(result, input);
      if (input.role.startsWith("genre-soul-surface-semantic-review:")) {
        mutateDecisions(result.findingDecisions);
      }
    };
    try {
      await assert.rejects(runGenreSoulProfile({
        testOnlyRepositoryRoot: root,
        genre: "modern-fantasy-ko",
        testOnly: true,
        testOnlySoulText: TEST_SOUL_TEXT,
        testOnlyEvidenceLoader: async () => evidence,
        testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
        testOnlyWorkPartitionInputBuilder: fakePartitionInput,
        testOnlyExecutor: makeFakeExecutor(counter, runtimeEvidence(), mutateResult),
        testOnlyScanner: async (input) => passingScan(input),
      }), /exact finding set/u);
      assert.equal(counter.calls, 8);
      assert.equal(await pathExists(join(
        root,
        "analyses/genre_souls/male-modern-fantasy-ko/v1/genre-profile.json",
      )), false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("profile semantic reviewer must use a run distinct from every producer", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-profile-semantic-run-identity-"));
  const counter = { calls: 0 };
  const evidence = makeAmbiguousSurfaceEvidence();
  let producerRunId;
  const runIdForInput = (input, callCount) => {
    if (producerRunId === undefined && input.role.startsWith("genre-soul-work-consolidation:")) {
      producerRunId = "shared-producer-review-run";
      return producerRunId;
    }
    if (input.role.startsWith("genre-soul-surface-semantic-review:")) return producerRunId;
    return `fake-run-${callCount}`;
  };
  try {
    await assert.rejects(runGenreSoulProfile({
      testOnlyRepositoryRoot: root,
      genre: "modern-fantasy-ko",
      testOnly: true,
      testOnlySoulText: TEST_SOUL_TEXT,
      testOnlyEvidenceLoader: async () => evidence,
      testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
      testOnlyWorkPartitionInputBuilder: fakePartitionInput,
      testOnlyExecutor: makeFakeExecutor(
        counter,
        runtimeEvidence(),
        injectAmbiguousWorkSurface,
        runIdForInput,
      ),
      testOnlyScanner: async (input) => passingScan(input),
    }), /run separate from every producer/u);
    assert.equal(counter.calls, 8);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("completion readback reconstructs semantic producer bindings and the canonical reviewer prompt", async () => {
  const roots = await Promise.all([0, 1].map(() => mkdtemp(join(tmpdir(), "genre-profile-semantic-readback-"))));
  const build = (root) => runGenreSoulProfile({
    testOnlyRepositoryRoot: root,
    genre: "modern-fantasy-ko",
    testOnly: true,
    testOnlySoulText: TEST_SOUL_TEXT,
    testOnlyEvidenceLoader: async () => makeAmbiguousSurfaceEvidence(),
    testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
    testOnlyWorkPartitionInputBuilder: fakePartitionInput,
    testOnlyExecutor: makeFakeExecutor({ calls: 0 }, runtimeEvidence(), injectAmbiguousWorkSurface),
    testOnlyScanner: async (input) => passingScan(input),
  });
  const readback = async (root, run) => {
    const profilePath = `analyses/genre_souls/${run.profile.soulId}/v1/genre-profile.json`;
    return readCompletedGenreSoulProfileRun({
      repositoryRoot: root,
      profilePath,
      profileBytes: await readFile(join(root, profilePath)),
      profile: run.profile,
      soulText: TEST_SOUL_TEXT,
    });
  };
  try {
    const producerBindingRun = await build(roots[0]);
    const semanticInputPath = producerBindingRun.surfaceReview.inputPath;
    const semanticInput = JSON.parse(await readFile(join(roots[0], semanticInputPath), "utf8"));
    semanticInput.producerRuns[0].hostReceiptSha256 = fixedSha("0");
    await writeFile(join(roots[0], semanticInputPath), jsonBytes(semanticInput));
    await refreshProfileCompletionSeal(roots[0], producerBindingRun, [semanticInputPath]);
    await assert.rejects(
      readback(roots[0], producerBindingRun),
      /surface semantic input drifted from reconstructed findings/u,
    );

    const promptRun = await build(roots[1]);
    await rewriteSealedSurfaceReviewTrace(roots[1], promptRun, async ({ trace }) => {
      const prompt = trace.messages[0].content;
      trace.messages[0].content = `X${prompt.slice(1)}`;
    });
    await assert.rejects(readback(roots[1], promptRun), /prompt|trace/u);
  } finally {
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  }
});

test("profile run keeps an ambiguous surface private until an exact owner decision is consumed and sealed", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-profile-private-surface-"));
  const counter = { calls: 0 };
  const evidence = makeEvidence();
  for (const observation of evidence.bindings[0].observations) {
    for (const selector of observation.selectors) {
      bindTestSourceText(selector, "차도윤과 함께 움직였다. 일반 행동 묘사가 이어졌다.");
    }
  }
  const leakWorkMechanism = (result, input) => {
    if (input.role.startsWith("genre-soul-work-consolidation:")) {
      result.primaryCommercialEngine.mechanism.pressure = "차도윤 방식은 기회가 닫히기 전에 압박을 회수한다";
    } else if (input.role.startsWith("genre-soul-surface-semantic-review:")) {
      for (const finding of result.findingDecisions) {
        finding.verdict = "uncertain";
        finding.reasonCode = "insufficient-context";
      }
    }
  };
  try {
    const runOptions = {
      testOnlyRepositoryRoot: root,
      genre: "modern-fantasy-ko",
      testOnly: true,
      testOnlySoulText: TEST_SOUL_TEXT,
      testOnlyEvidenceLoader: async () => evidence,
      testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
      testOnlyWorkPartitionInputBuilder: fakePartitionInput,
      testOnlyExecutor: makeFakeExecutor(counter, runtimeEvidence(), leakWorkMechanism),
      testOnlyScanner: async (input) => passingScan(input),
    };
    const result = await runGenreSoulProfile(runOptions);
    assert.equal(result.status, "pending_hil");
    assert.match(result.surfaceHil.requestPath, /\/genre\/surface-review\/owner-hil\/requests\//u);
    assert.equal(await pathExists(join(root, result.surfaceHil.candidatePath)), true);
    assert.equal(await pathExists(join(root, result.surfaceHil.requestPath)), true);
    assert.equal(await pathExists(join(root, "analyses/genre_souls/male-modern-fantasy-ko/v1/genre-profile.json")), false);
    assert.equal(await pathExists(join(root, "inkos_handoffs/genre-souls/male-modern-fantasy-ko/v1/reference-routing-catalog.json")), false);
    assert.equal(await pathExists(join(root, "exports/genre-souls/male-modern-fantasy-ko/v1/profile-runs/completed.json")), false);
    const decision = await writePrivateGenreSoulSurfaceHilDecision({
      repositoryRoot: root,
      requestPath: result.surfaceHil.requestPath,
      decision: "approve",
      actorId: "owner:test",
      decidedAt: "2026-08-30T00:00:00.000Z",
      testOnly: true,
      testOnlyRepositoryRoot: root,
    });
    assert.equal(decision.outcome, "approved");
    const completed = await runGenreSoulProfile(runOptions);
    assert.equal(completed.status, "completed");
    assert.equal(completed.surfaceHil.outcome, "pass");
    assert.equal(completed.surfaceHil.decisionPath, decision.decisionPath);
    assert.equal(counter.calls, 8);
    assert.equal(completed.surfaceReview.status, "pending_hil");
    for (const path of [
      completed.surfaceReview.candidatePath,
      completed.surfaceReview.inputPath,
      completed.surfaceReview.acceptedPath,
      completed.surfaceReview.acceptedReceiptPath,
      completed.surfaceHil.candidatePath,
      completed.surfaceHil.requestPath,
      completed.surfaceHil.decisionPath,
    ]) assert.ok(completed.completion.artifacts.some((artifact) => artifact.path === path));
    const profilePath = "analyses/genre_souls/male-modern-fantasy-ko/v1/genre-profile.json";
    const readback = await readCompletedGenreSoulProfileRun({
      repositoryRoot: root,
      profilePath,
      profileBytes: await readFile(join(root, profilePath)),
      profile: completed.profile,
      soulText: TEST_SOUL_TEXT,
    });
    assert.equal(readback.inputDigest, completed.inputDigest);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("profile run resumes an approved historical single v3 owner HIL without generating v4", async () => {
  const root = await mkdtemp(join(tmpdir(), "genre-profile-legacy-v3-surface-"));
  const counter = { calls: 0 };
  const evidence = makeEvidence();
  for (const observation of evidence.bindings[0].observations) {
    for (const selector of observation.selectors) {
      bindTestSourceText(selector, "차도윤과 함께 움직였다. 일반 행동 묘사가 이어졌다.");
    }
  }
  const leakWorkMechanism = (result, input) => {
    if (input.role.startsWith("genre-soul-work-consolidation:")) {
      result.primaryCommercialEngine.mechanism.pressure = "차도윤 방식은 기회가 닫히기 전에 압박을 회수한다";
    } else if (input.role.startsWith("genre-soul-surface-semantic-review:")) {
      for (const finding of result.findingDecisions) {
        finding.verdict = "uncertain";
        finding.reasonCode = "insufficient-context";
      }
    }
  };
  try {
    const runOptions = {
      testOnlyRepositoryRoot: root,
      genre: "modern-fantasy-ko",
      testOnly: true,
      testOnlySoulText: TEST_SOUL_TEXT,
      testOnlyEvidenceLoader: async () => evidence,
      testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
      testOnlyWorkPartitionInputBuilder: fakePartitionInput,
      testOnlyExecutor: makeFakeExecutor(counter, runtimeEvidence(), leakWorkMechanism),
      testOnlyScanner: async (input) => passingScan(input),
    };
    const pending = await runGenreSoulProfile(runOptions);
    assert.equal(pending.status, "pending_hil");
    const currentRequestAbsolutePath = join(root, pending.surfaceHil.requestPath);
    const currentRequest = JSON.parse(await readFile(currentRequestAbsolutePath, "utf8"));
    const legacy = buildPrivateGenreSoulAmbiguousSurfaceRequestV3({
      stage: currentRequest.stage,
      genre: currentRequest.genre,
      soulId: currentRequest.soulId,
      inputDigest: currentRequest.inputDigest,
      candidate: currentRequest.candidate,
      privateEvidence: currentRequest.privateEvidence,
      semanticReview: currentRequest.semanticReview,
      findings: currentRequest.findings,
    });
    const legacyRequestPath = pending.surfaceHil.requestPath.replace(
      pending.surfaceHil.requestSha256,
      legacy.sha256,
    );
    await rm(currentRequestAbsolutePath);
    await writeFile(join(root, legacyRequestPath), legacy.bytes);
    const decision = await writePrivateGenreSoulSurfaceHilDecision({
      repositoryRoot: root,
      requestPath: legacyRequestPath,
      decision: "approve",
      actorId: "owner:test",
      decidedAt: "2026-08-30T00:00:00.000Z",
      testOnly: true,
      testOnlyRepositoryRoot: root,
    });
    const callsAtHil = counter.calls;
    const completed = await runGenreSoulProfile(runOptions);
    assert.equal(completed.status, "completed");
    assert.equal(completed.surfaceHil.requestPath, legacyRequestPath);
    assert.equal(completed.surfaceHil.decisionPath, decision.decisionPath);
    assert.equal(counter.calls, callsAtHil);
    assert.equal(await pathExists(currentRequestAbsolutePath), false);
    const profilePath = "analyses/genre_souls/male-modern-fantasy-ko/v1/genre-profile.json";
    assert.equal((await readCompletedGenreSoulProfileRun({
      repositoryRoot: root,
      profilePath,
      profileBytes: await readFile(join(root, profilePath)),
      profile: completed.profile,
      soulText: TEST_SOUL_TEXT,
    })).inputDigest, completed.inputDigest);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("profile private samples bind live selector source, coordinates, size, SHA, and exact bytes", async () => {
  const cases = [
    ["selector", (blob) => { blob.selectorId = "sel-wrong"; }],
    ["source", (blob) => { blob.sourceId = "gdrive-wrong"; }],
    ["coordinates", (blob) => { blob.startByte += 1; blob.endByte += 1; }],
    ["byte-size", (blob) => { blob.byteSize += 1; }],
    ["token-proxy", (blob) => { blob.conservativeTokenProxy += 1; }],
    ["slice-sha", (blob) => { blob.sliceSha256 = fixedSha("0"); }],
    ["source-bytes", (blob) => { blob.sourceText = "Z".repeat(blob.byteSize); }],
  ];
  for (const [label, mutate] of cases) {
    const root = await mkdtemp(join(tmpdir(), `genre-profile-private-binding-${label}-`));
    const counter = { calls: 0 };
    const tamperedBuilder = (work, options) => {
      const input = fakePartitionInput(work, options);
      mutate(input.sourceTextSample.blobs[0]);
      return input;
    };
    try {
      await assert.rejects(runGenreSoulProfile({
        testOnlyRepositoryRoot: root,
        genre: "modern-fantasy-ko",
        testOnly: true,
        testOnlySoulText: TEST_SOUL_TEXT,
        testOnlyEvidenceLoader: async () => makeEvidence(),
        testOnlyRuntimeEvidenceLoader: async () => runtimeEvidence(),
        testOnlyWorkPartitionInputBuilder: tamperedBuilder,
        testOnlyExecutor: makeFakeExecutor(counter),
        testOnlyScanner: async (input) => passingScan(input),
      }), /private sample blob|private sample selectors|live selector membership|source bytes, coordinates, size, or slice SHA/u);
      assert.equal(counter.calls, 0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});
