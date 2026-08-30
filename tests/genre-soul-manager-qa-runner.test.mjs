import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertRawSamplesBindPrivateSources,
  assertManagerQaTrackedSemanticSafety,
  derivePrivateManagerQaVerdict,
  publishTrackedPair,
  runGenreSoulManagerQa,
  validatePrivateManagerQaInput,
  validatePrivateManagerQaResult,
} from "../tools/genre-soul-manager-qa-runner.mjs";
import {
  HERMES_STRUCTURED_ATTEMPT_INPUT_ATTESTATION_SCHEMA,
  buildHermesExecutionEnvironment,
  buildHermesStructuredAttemptInputAttestation,
} from "../tools/genre-soul-hermes-run-lib.mjs";
import { writePrivateGenreSoulSurfaceHilDecision } from "../tools/genre-soul-surface-hil-decision.mjs";
import {
  computePrimaryCommercialEngineSignature,
  validateManagerQaReceipt,
} from "../tools/genre-soul-study-contract.mjs";

const GENRE = "modern-fantasy-ko";
const SOUL_ID = "male-modern-fantasy-ko";
const PROFILE_ID = "inkos_male_modern_fantasy";
const SOURCE_IDS = ["gdrive-Aaaaaaaaaaaa", "gdrive-Bbbbbbbbbbbb", "gdrive-Cccccccccccc"];
const BASES = ["commercial-anchor", "genre-breadth", "surface-anchor"];
const DIMENSIONS = [
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
const SPANS = ["early", "middle", "late"];
const FAKE_SOUL_TEXT = "# Test Soul\n\n- Profile ID: `inkos_male_modern_fantasy`\n";
const ACTUAL_REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CASE_ALIAS_REPOSITORY_ROOT = ACTUAL_REPOSITORY_ROOT.replace("/firefly_studio/", "/FIREFLY_STUDIO/");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function fakeAuthAdapterPlanningEvidence(label = "default") {
  const adapterBytes = Buffer.from(`fixture-hermes-auth-adapter-${label}`);
  const descriptor = {
    schemaVersion: "hermes-auth-store-adapter-planning-evidence/v1",
    contractVersion: "hermes-global-auth-store-adapter/v1",
    files: [{
      name: "sitecustomize.py",
      sha256: sha256(adapterBytes),
      sizeBytes: adapterBytes.byteLength,
    }],
    totalBytes: adapterBytes.byteLength,
  };
  return { ...descriptor, sha256: sha256(jsonBytes(descriptor)) };
}

async function writeBytes(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

function sourceBytes(sourceId) {
  const early = Buffer.alloc(99, "e");
  Buffer.from("차도윤 이동.").copy(early);
  return Buffer.concat([
    early,
    Buffer.from(sourceId.padEnd(100, "m")),
    Buffer.from(sourceId.padEnd(101, "l")),
  ]);
}

function spanRange(span) {
  if (span === "early") return { startByte: 0, endByte: 30 };
  if (span === "middle") return { startByte: 120, endByte: 150 };
  return { startByte: 240, endByte: 270 };
}

function mechanism(index, identical = false) {
  const suffix = identical ? "same" : String(index + 1);
  return {
    protagonistRepeatedVerb: `행동-${suffix}`,
    pressure: `압력-${suffix}`,
    activeChoice: `선택-${suffix}`,
    resistance: `저항-${suffix}`,
    payoff: `보상-${suffix}`,
    recognition: `인정-${suffix}`,
  };
}

function profileEvidence(sourceId, span, withSpan = false) {
  const range = spanRange(span);
  return {
    sourceId,
    observationId: `obs-${sourceId.slice(7)}-${span}`,
    segmentId: span === "early" ? "s0001" : span === "middle" ? "s0002" : "s0003",
    kind: "commercial-engine",
    selectors: [{ type: "utf8-byte", ...range }],
    ...(withSpan ? { span } : {}),
  };
}

function boundRef(path, digest = "a".repeat(64), sizeBytes = 10) {
  return { path, sha256: digest, sizeBytes };
}

function makeEvidence(root, { identicalMechanisms = false } = {}) {
  const metadata = {
    managerSelection: {
      repoRelativePath: "evidence/genre-souls/male-manager-selection.v1.json",
      sha256: "1".repeat(64),
      sizeBytes: 101,
      selectionId: "selection-fixture",
    },
    inventory: {
      repoRelativePath: "evidence/genre-souls/male-source-inventory.v1.json",
      sha256: "2".repeat(64),
      sizeBytes: 102,
      inventoryId: "inventory-fixture",
    },
    privateRegistry: {
      repoRelativePath: "exports/source-registry/male-source-registry.v1.json",
      sha256: "3".repeat(64),
      sizeBytes: 103,
      registryId: "registry-fixture",
    },
    registryReceipt: {
      repoRelativePath: "evidence/genre-souls/male-source-registry-receipt.v1.json",
      sha256: "4".repeat(64),
      sizeBytes: 104,
      receiptId: "receipt-fixture",
    },
    survey: {
      repoRelativePath: `analyses/genre_souls/${SOUL_ID}/v1/survey.json`,
      sha256: "5".repeat(64),
      sizeBytes: 105,
    },
  };
  const bindings = SOURCE_IDS.map((sourceId, index) => {
    const bytes = sourceBytes(sourceId);
    const sourcePath = `private_sources/${sourceId}.txt`;
    const observations = SPANS.map((span) => {
      const range = spanRange(span);
      const slice = bytes.subarray(range.startByte, range.endByte);
      return {
        sourceId,
        observationId: `obs-${sourceId.slice(7)}-${span}`,
        segmentId: span === "early" ? "s0001" : span === "middle" ? "s0002" : "s0003",
        segmentIndex: SPANS.indexOf(span),
        observationIndex: 0,
        kind: "commercial-engine",
        finding: `관찰-${span}`,
        commercialFunction: `기능-${span}`,
        coverageBand: span,
        selectors: [{
          selectorId: `selector-${sourceId}-${span}`,
          sourceId,
          observationId: `obs-${sourceId.slice(7)}-${span}`,
          chapterSequence: SPANS.indexOf(span) + 1,
          coordinateKind: "utf8-byte",
          ...range,
          sliceSha256: sha256(slice),
          coverageBand: span,
        }],
      };
    });
    return {
      bindingId: `deep-read-binding-${sourceId}`,
      genre: GENRE,
      soulId: SOUL_ID,
      sourceId,
      title: `작품-${index + 1}`,
      author: `작가-${index + 1}`,
      selectionBasis: BASES[index],
      sourceSha256: sha256(bytes),
      sourceSizeBytes: bytes.byteLength,
      chapterCount: 3,
      evidence: {
        source: { repoRelativePath: sourcePath, sha256: sha256(bytes), sizeBytes: bytes.byteLength },
        trackedStudy: {
          repoRelativePath: `analyses/genre_souls/${SOUL_ID}/v1/work-studies/${sourceId}.deep-read.json`,
          sha256: `${index + 5}`.repeat(64),
          sizeBytes: 200 + index,
        },
        leakScanReceipt: {
          repoRelativePath: `analyses/genre_souls/${SOUL_ID}/v1/leak-scan-receipts/${sourceId}.deep-read.json`,
          sha256: ["8", "9", "a"][index].repeat(64),
          sizeBytes: 300 + index,
        },
        privateBundleReceipt: {
          repoRelativePath: `exports/genre-souls/${SOUL_ID}/v1/deep-read-runs/${sourceId}/deep-read-receipt.json`,
          sha256: ["b", "c", "d"][index].repeat(64),
          sizeBytes: 400 + index,
          bundleId: `bundle-${index + 1}`,
        },
        managerSelectionSha256: metadata.managerSelection.sha256,
        inventorySha256: metadata.inventory.sha256,
        privateRegistrySha256: metadata.privateRegistry.sha256,
        registryReceiptSha256: metadata.registryReceipt.sha256,
        surveySha256: metadata.survey.sha256,
      },
      observations,
      fixtureMechanism: mechanism(index, identicalMechanisms),
    };
  });
  return {
    schemaVersion: "genre-soul-deep-read-evidence/v1",
    genre: GENRE,
    soulId: SOUL_ID,
    metadata,
    bindings,
    observations: bindings.flatMap((binding) => binding.observations),
  };
}

function makeProfile(evidence, privateProfileInput) {
  const sources = evidence.bindings.map((binding) => ({
    sourceId: binding.sourceId,
    selectionBasis: binding.selectionBasis,
    sourceSha256: binding.sourceSha256,
    sourceSizeBytes: binding.sourceSizeBytes,
    chapterCount: binding.chapterCount,
    trackedStudy: boundRef(
      binding.evidence.trackedStudy.repoRelativePath,
      binding.evidence.trackedStudy.sha256,
      binding.evidence.trackedStudy.sizeBytes,
    ),
    privateBundle: boundRef(
      binding.evidence.privateBundleReceipt.repoRelativePath,
      binding.evidence.privateBundleReceipt.sha256,
      binding.evidence.privateBundleReceipt.sizeBytes,
    ),
    trackedLeakReceipt: boundRef(
      binding.evidence.leakScanReceipt.repoRelativePath,
      binding.evidence.leakScanReceipt.sha256,
      binding.evidence.leakScanReceipt.sizeBytes,
    ),
  }));
  const patterns = DIMENSIONS.map((dimension, index) => ({
    patternId: `pattern-${String(index + 1).padStart(2, "0")}`,
    dimension,
    classification: dimension === "failurePatterns" ? "failure" : "genre-common",
    guidance: `지침-${index + 1}`,
    commercialFunction: `상업기능-${index + 1}`,
    sourceIds: [...SOURCE_IDS],
    evidence: SOURCE_IDS.map((sourceId) => profileEvidence(sourceId, "early")),
  }));
  const primaryCommercialEngines = evidence.bindings.map((binding) => {
    const signatureSha256 = computePrimaryCommercialEngineSignature(binding.sourceId, binding.fixtureMechanism);
    return {
      engineId: `engine-${signatureSha256.slice(0, 24)}`,
      sourceId: binding.sourceId,
      mechanism: binding.fixtureMechanism,
      signatureSha256,
      evidence: SPANS.map((span) => profileEvidence(binding.sourceId, span, true)),
    };
  });
  return {
    schemaVersion: "genre-soul-analysis-profile/v1",
    state: "candidate",
    genre: GENRE,
    soulId: SOUL_ID,
    version: "v1",
    generatedAt: "2026-08-29T01:00:00.000Z",
    evidenceSet: {
      managerSelection: boundRef(
        evidence.metadata.managerSelection.repoRelativePath,
        evidence.metadata.managerSelection.sha256,
        evidence.metadata.managerSelection.sizeBytes,
      ),
      inventory: boundRef(
        evidence.metadata.inventory.repoRelativePath,
        evidence.metadata.inventory.sha256,
        evidence.metadata.inventory.sizeBytes,
      ),
      registryReceipt: {
        ...boundRef(
          evidence.metadata.registryReceipt.repoRelativePath,
          evidence.metadata.registryReceipt.sha256,
          evidence.metadata.registryReceipt.sizeBytes,
        ),
        privateRegistrySha256: evidence.metadata.privateRegistry.sha256,
      },
      sources,
    },
    synthesis: {
      privateInput: {
        schemaVersion: "private-genre-soul-profile-input/v1",
        path: privateProfileInput.path,
        sha256: sha256(privateProfileInput.bytes),
        sizeBytes: privateProfileInput.bytes.byteLength,
        sourceIds: [...SOURCE_IDS],
        observationCount: 9,
        selectorCount: 9,
      },
      run: {
        runId: "profile-synthesis-run",
        model: "gpt-5.6-sol",
        provider: "openai-codex",
        reasoningEffort: "high",
        configSha256: "e".repeat(64),
        traceReceiptSha256: "f".repeat(64),
      },
      contentContract: {
        id: "fiction-content-neutral-ko/v1",
        sha256: "c5b531577cbfbfb1dfc4cd2b5cb82d7ce796c6958e0bc00c3e180b0e5440e199",
      },
      truncation: false,
    },
    patterns,
    primaryCommercialEngines,
    dimensions: Object.fromEntries(DIMENSIONS.map((dimension, index) => [dimension, [patterns[index].patternId]])),
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

function privateResult(input) {
  const sourceIds = input.profile.artifact.evidenceSet.sources.map((source) => source.sourceId).sort();
  const engineComparisons = [];
  for (let left = 0; left < sourceIds.length; left += 1) {
    for (let right = left + 1; right < sourceIds.length; right += 1) {
      engineComparisons.push({
        leftSourceId: sourceIds[left],
        rightSourceId: sourceIds[right],
        verdict: "different",
        semanticDifference: "반복 행동과 압력 해소 순서가 구조적으로 다르다",
        commercialConsequence: "보상 기대의 지급 주기와 다음 행동 약속이 분리된다",
      });
    }
  }
  return {
    schemaVersion: "private-genre-soul-manager-qa-result/v1",
    genre: input.genre,
    soulId: input.soulId,
    profileSha256: input.profile.sha256,
    synthesisRunId: input.profile.synthesisRunId,
    sampleVerdicts: input.rawSamples.map((sample) => ({
      sampleId: sample.sampleId,
      sourceId: sample.sourceId,
      span: sample.span,
      observationId: sample.observationId,
      kind: sample.kind,
      selector: sample.selector,
      sliceSha256: sample.sliceSha256,
      supportsPrimaryEngine: true,
      rationale: "표본의 행동과 압력이 엔진을 지지한다",
      commercialConsequence: "보상 기대가 다음 장면으로 이어진다",
    })),
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
    result: "pass",
  };
}

function fakeRun({ runId = "manager-qa-run", mutateResult, mutateCandidate } = {}) {
  return async (options) => {
    const inputBytes = await readFile(options.expectedReadPaths[0]);
    const input = JSON.parse(inputBytes.toString("utf8"));
    const runtime = input.runtime;
    const readCapability = buildFixtureReadCapability(options, runtime, inputBytes);
    const result = privateResult(input);
    if (mutateResult) mutateResult(result, input);
    await options.validateResult(result);
    const candidate = structuredClone(result);
    if (mutateCandidate) mutateCandidate(candidate, input);
    const candidateOutputBytes = Buffer.from(JSON.stringify(candidate));
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
    const trace = {
      id: runId,
      model: "gpt-5.6-sol",
      billing_provider: "openai-codex",
      profile_name: PROFILE_ID,
      end_reason: "agent_close",
      ended_at: 1787932800,
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
      system_prompt: `${FAKE_SOUL_TEXT}\nHermes fixture runtime context`,
      messages: [
        { role: "user", content: options.prompt, compacted: 0 },
        {
          role: "assistant",
          finish_reason: "tool_calls",
          compacted: 0,
          tool_calls: [{
            id: "call-read-manager-input",
            function: { name: "firefly_read_source", arguments: JSON.stringify({ inputId: "input-001" }) },
          }],
        },
        {
          role: "tool",
          tool_call_id: "call-read-manager-input",
          compacted: 0,
          content: JSON.stringify({
            schemaVersion: "firefly-hermes-read-result/v2",
            inputId: "input-001",
            sha256: sha256(inputBytes),
            sizeBytes: inputBytes.byteLength,
            chunkIndex: 0,
            chunkCount: 1,
            chunkSha256: sha256(inputBytes),
            nextInputId: null,
            nextCursor: null,
            content: inputBytes.toString("utf8"),
          }),
        },
        { role: "assistant", finish_reason: "stop", compacted: 0, content: JSON.stringify(result) },
      ],
    };
    const usageBytes = jsonBytes(usage);
    const traceBytes = Buffer.from(`${JSON.stringify(trace)}\n`);
    const contextInputProxyTokens = Math.ceil((
      Buffer.byteLength(trace.system_prompt, "utf8")
      + Buffer.byteLength(JSON.stringify(trace.messages.slice(0, -1)), "utf8")
    ) / 2);
    const contextOutputReserveTokens = options.outputReserveTokens;
    const contextBudgetUpperBoundTokens = contextInputProxyTokens
      + Math.max(contextOutputReserveTokens, usage.output_tokens);
    const receipt = {
      schemaVersion: "private-hermes-structured-run-receipt/v1",
      role: "manager-qa",
      runId,
      profileId: PROFILE_ID,
      model: "gpt-5.6-sol",
      provider: "openai-codex",
      readCapabilitySha256: sha256(readCapability.bytes),
      readCapabilityTool: "firefly_read_source",
      readCapabilityToolset: "firefly-source-read",
      readExecutionEnvironmentSha256: readCapability.capability.executionEnvironmentSha256,
      readExecutionRuntimeIdentitySha256: readCapability.capability.executionRuntimeIdentitySha256,
      readManifestSha256: readCapability.capability.manifest.sha256,
      reasoningEffort: "high",
      runtimeAttestation: runtime.runtimeAttestation,
      promptSha256: sha256(Buffer.from(options.prompt)),
      inputDigest: options.inputDigest,
      inputSha256: sha256(jsonBytes([{ path: options.expectedReadPaths[0], sha256: sha256(inputBytes) }])),
      profileConfigSha256: runtime.profileConfigSha256,
      soulSha256: runtime.soulSha256,
      contentNeutralContractId: "fiction-content-neutral-ko/v1",
      contentNeutralContractSha256: "c5b531577cbfbfb1dfc4cd2b5cb82d7ce796c6958e0bc00c3e180b0e5440e199",
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
      contextOutputReserveTokens,
      contextBudgetUpperBoundTokens,
      cumulativeCacheReadTokens: usage.cache_read_tokens,
      cacheWriteTokens: usage.cache_write_tokens,
      compaction: false,
      compression: false,
      truncation: false,
      expectedReadCount: 1,
      exactReadCount: 1,
      exactReadSha256s: [sha256(inputBytes)],
      candidateOutputSha256: sha256(candidateOutputBytes),
      resultSha256: sha256(resultBytes),
      usageSha256: sha256(usageBytes),
      traceSha256: sha256(traceBytes),
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      reasoningTokens: usage.reasoning_tokens,
      totalTokens: usage.total_tokens,
      apiCalls: usage.api_calls,
      completedAt: "2026-08-29T02:00:00.000Z",
      completed: true,
    };
    const inputAttestationBytes = buildFixtureAttemptAttestation(options, runtime, inputBytes);
    const attemptId = `attempt-fixture-${sha256(inputAttestationBytes)}`;
    const attemptDir = join(options.runRoot, "attempts", attemptId);
    await mkdir(attemptDir, { recursive: true });
    await Promise.all([
      writeFile(join(attemptDir, "candidate-output.txt"), candidateOutputBytes),
      writeFile(join(attemptDir, "result.json"), resultBytes),
      writeFile(join(attemptDir, "usage.json"), usageBytes),
      writeFile(join(attemptDir, "session.jsonl"), traceBytes),
      writeFile(join(attemptDir, "host-receipt.json"), jsonBytes(receipt)),
      writeFile(join(attemptDir, "input-attestation.json"), inputAttestationBytes),
      writeFile(join(attemptDir, "read-capability.json"), readCapability.bytes),
    ]);
    const completionBytes = jsonBytes({
      schemaVersion: "private-hermes-structured-attempt-completion/v1",
      role: "manager-qa",
      attemptId,
      runId,
      hostReceiptSha256: sha256(jsonBytes(receipt)),
      completed: true,
    });
    await writeFile(join(attemptDir, "completed.json"), completionBytes);
    await writeFile(join(options.runRoot, "completed.json"), jsonBytes({
      schemaVersion: "private-hermes-structured-completed-pointer/v1",
      role: "manager-qa",
      attempt: `attempts/${attemptId}`,
      attemptCompletionSha256: sha256(completionBytes),
      hostReceiptSha256: sha256(jsonBytes(receipt)),
    }));
    return {
      status: "completed",
      result,
      attemptDir,
      receipt,
      usage,
      trace,
    };
  };
}

function fakeRuntime(overrides = {}) {
  const runtime = {
    profileId: PROFILE_ID,
    runtimeAttestation: "current-attested",
    profileConfigSha256: "a".repeat(64),
    soulSha256: "c".repeat(64),
    contentNeutralSoulSectionSha256: "d".repeat(64),
    contextLimitEntrySha256: "e".repeat(64),
    hermesExecutableSha256: "6".repeat(64),
    hermesDelegatedExecutableSha256: "9".repeat(64),
    hermesVersionSha256: "7".repeat(64),
    hermesImplementationSha256: "b".repeat(64),
    hermesDependencySha256: "c".repeat(64),
    hermesProfileContextSha256: "d".repeat(64),
    hermesProjectContextSha256: "e".repeat(64),
    contextLimit: 272000,
    contentNeutralContractId: "fiction-content-neutral-ko/v1",
    contentNeutralContractSha256: "c5b531577cbfbfb1dfc4cd2b5cb82d7ce796c6958e0bc00c3e180b0e5440e199",
    soulText: FAKE_SOUL_TEXT,
    ...overrides,
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
  return runtime;
}

function buildFixtureReadCapability(options, runtime, inputBytes) {
  const expectedInputs = [{
    inputId: "input-001",
    path: resolve(options.expectedReadPaths[0]),
    sha256: sha256(inputBytes),
    sizeBytes: inputBytes.byteLength,
  }];
  const manifestBytes = jsonBytes({
    schemaVersion: "firefly-hermes-read-manifest/v1",
    inputs: expectedInputs,
  });
  const pluginFiles = ["__init__.py", "plugin.yaml", "reader.py"].map((name, index) => ({
    name,
    sha256: sha256(`fixture-plugin-${index}`),
    sizeBytes: index + 1,
  }));
  const authAdapterFiles = options.expectedAuthAdapterPlanningEvidence?.files
    ?? (() => {
      const authAdapterBytes = Buffer.from("fixture-hermes-auth-adapter");
      return [{
        name: "sitecustomize.py",
        sha256: sha256(authAdapterBytes),
        sizeBytes: authAdapterBytes.byteLength,
      }];
    })();
  const executionPolicy = {
    schemaVersion: "hermes-exact-input-execution-policy/v3",
    homeScope: "ephemeral-system-temp",
    workspaceScope: "empty-ephemeral-system-temp",
    cleanup: "required-before-finalization",
    capsuleCredentialPersistence: "forbidden",
    credentialCopyIntoCapsule: "forbidden",
    authoritativeAuthStoreScope: "source-profile-global-root",
    authoritativeAuthStoreMutation: "provider-managed-under-auth-lock",
    authProjectionContractVersion: "hermes-global-auth-store-adapter/v1",
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
  const executionEnvironmentSha256 = sha256(jsonBytes({
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
  const executionRuntimeIdentitySha256 = sha256(jsonBytes({
    schemaVersion: "hermes-exact-input-runtime-identity/v3",
    sourceRuntimeIdentitySha256: runtime.hermesRuntimeIdentitySha256,
    manifestSha256: sha256(manifestBytes),
    pluginFiles,
    authProjectionContractVersion: "hermes-global-auth-store-adapter/v1",
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
    manifest: { sha256: sha256(manifestBytes), sizeBytes: manifestBytes.byteLength },
    pluginFiles,
    authProjectionContractVersion: "hermes-global-auth-store-adapter/v1",
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

function buildFixtureAttemptAttestation(options, runtime, inputBytes) {
  const readCapability = buildFixtureReadCapability(options, runtime, inputBytes);
  const expectedReads = [{
    path: resolve(options.expectedReadPaths[0]),
    sha256: sha256(inputBytes),
    sizeBytes: inputBytes.byteLength,
  }];
  const value = buildHermesStructuredAttemptInputAttestation({
    schemaVersion: HERMES_STRUCTURED_ATTEMPT_INPUT_ATTESTATION_SCHEMA,
    role: options.role,
    profileHome: resolve(options.profileHome),
    projectCwd: resolve(options.projectCwd),
    profileId: options.profileId,
    promptSha256: sha256(Buffer.from(options.prompt)),
    inputDigest: options.inputDigest,
    inputSha256: sha256(jsonBytes(expectedReads.map(({ path, sha256: fileSha256 }) => ({ path, sha256: fileSha256 })))),
    expectedReads,
    outputReserveTokens: options.outputReserveTokens,
    executionEnvironmentSha256: buildHermesExecutionEnvironment({
      profileHome: options.profileHome,
      projectCwd: options.projectCwd,
    }).descriptorSha256,
    readCapabilitySha256: sha256(readCapability.bytes),
    runtime: {
      profileId: options.profileId,
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

function fakeScan({ fail = false } = {}) {
  return async (options) => {
    if (fail) throw new Error("fixture scan failed before tracked publication");
    return {
      schemaVersion: "tracked-projection-leak-scan/v1",
      scanner: { version: "genre-soul-surface-scanner/v1", exactTokenCount: 12, longCommonUtf8Bytes: 120 },
      artifact: {
        path: options.artifactRelativePath,
        sha256: sha256(options.artifactBytes),
        sizeBytes: options.artifactBytes.byteLength,
      },
      corpus: {
        privateRegistrySha256: "3".repeat(64),
        availableSourceCount: 3,
        observedSourceSetSha256: "4".repeat(64),
      },
      matchCount: 0,
      matches: [],
      truncated: false,
      status: "pass",
      automaticRewrite: false,
      automaticReject: false,
    };
  };
}

async function setupFixture(options = {}) {
  const root = await mkdtemp(join(tmpdir(), "genre-soul-manager-qa-"));
  const evidence = makeEvidence(root, options);
  for (const binding of evidence.bindings) {
    await writeBytes(join(root, binding.evidence.source.repoRelativePath), sourceBytes(binding.sourceId));
  }
  const privateProfileInput = {
    path: `exports/genre-souls/${SOUL_ID}/v1/profile-runs/${"d".repeat(64)}/genre/input.json`,
    bytes: jsonBytes({
      schemaVersion: "private-genre-soul-profile-input/v1",
      genre: GENRE,
      soulId: SOUL_ID,
      version: "v1",
      sourceIds: [...SOURCE_IDS],
      works: SOURCE_IDS.map((sourceId, index) => ({ sourceId, selectionBasis: BASES[index] })),
    }),
  };
  await writeBytes(join(root, privateProfileInput.path), privateProfileInput.bytes);
  const profile = makeProfile(evidence, privateProfileInput);
  const profilePath = `analyses/genre_souls/${SOUL_ID}/v1/genre-profile.json`;
  const leakPath = `analyses/genre_souls/${SOUL_ID}/v1/leak-scan-receipts/genre-profile.json`;
  async function writeProfileAndLeak(nextProfile = profile, mutateLeak) {
    const bytes = jsonBytes(nextProfile);
    const leak = {
      schemaVersion: "tracked-projection-leak-scan/v1",
      scanner: { version: "genre-soul-surface-scanner/v1", exactTokenCount: 12, longCommonUtf8Bytes: 120 },
      artifact: { path: profilePath, sha256: sha256(bytes), sizeBytes: bytes.byteLength },
      corpus: {
        privateRegistrySha256: evidence.metadata.privateRegistry.sha256,
        availableSourceCount: 3,
        observedSourceSetSha256: "4".repeat(64),
      },
      matchCount: 0,
      matches: [],
      truncated: false,
      status: "pass",
      automaticRewrite: false,
      automaticReject: false,
    };
    if (mutateLeak) mutateLeak(leak);
    await writeBytes(join(root, profilePath), bytes);
    await writeBytes(join(root, leakPath), jsonBytes(leak));
  }
  await writeProfileAndLeak();
  return { root, evidence, profile, writeProfileAndLeak };
}

function runnerOptions(fixture, overrides = {}) {
  return {
    testOnlyRepositoryRoot: fixture.root,
    genre: GENRE,
    testOnlyLoadEvidence: async () => fixture.evidence,
    testOnlyRuntimeLoader: async () => fakeRuntime(),
    testOnlyAuthAdapterPlanningEvidenceLoader: async () => fakeAuthAdapterPlanningEvidence(),
    testOnlyProfileCompletionReadback: async () => ({ status: "fixture-completed" }),
    testOnly: true,
    testOnlyRunStructured: fakeRun(),
    testOnlyScanProjection: fakeScan(),
    ...overrides,
  };
}

test("builds a fresh manager receipt, scans before publication, and reuses identical bytes", async () => {
  const fixture = await setupFixture();
  try {
    const first = await runGenreSoulManagerQa(runnerOptions(fixture));
    assert.equal(first.status, "written");
    assert.equal(first.receipt.manager.actorId, `hermes:${PROFILE_ID}:manager-qa-run`);
    assert.equal(first.receipt.sources.length, 3);
    assert.equal(first.receipt.sources.flatMap((source) => source.samples).length, 9);
    assert.equal(new Set(first.receipt.sources.map((source) => source.mechanismSignatureSha256)).size, 3);
    assert.equal(validateManagerQaReceipt(first.receipt), true);
    const tracked = await readFile(join(fixture.root, first.qaPath));
    assert.equal(sha256(tracked), first.leakReceipt.artifact.sha256);

    const second = await runGenreSoulManagerQa(runnerOptions(fixture));
    assert.equal(second.status, "reused");
    assert.deepEqual(second.receipt, first.receipt);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("valid negative Manager QA verdicts persist immutable private decisions without publishing a pass marker", async () => {
  const cases = [
    {
      expectedStatus: "needs-revision",
      expectedReason: "sample-primary-engine-unsupported",
      mutateResult: (result) => {
        result.sampleVerdicts[0].supportsPrimaryEngine = false;
        result.result = "needs-revision";
      },
    },
  ];
  for (const scenario of cases) {
    const fixture = await setupFixture();
    let scannerCalls = 0;
    try {
      const options = runnerOptions(fixture, {
        testOnlyRunStructured: fakeRun({ mutateResult: scenario.mutateResult }),
        testOnlyScanProjection: async () => {
          scannerCalls += 1;
          throw new Error("negative QA must not scan a tracked pass candidate");
        },
      });
      const first = await runGenreSoulManagerQa(options);
      assert.equal(first.status, scenario.expectedStatus);
      assert.equal(first.decisionPublication, "written");
      assert.equal(first.decision.schemaVersion, "private-genre-soul-manager-qa-decision/v1");
      assert.equal(first.decision.executionValid, true);
      assert.equal(first.decision.verdict.result, scenario.expectedStatus);
      assert.equal(first.decision.verdict.reasonCodes.includes(scenario.expectedReason), true);
      assert.equal(first.decision.authority.mayPublishManagerQaPass, false);
      assert.deepEqual(
        JSON.parse(await readFile(join(fixture.root, first.decisionPath), "utf8")),
        first.decision,
      );
      const second = await runGenreSoulManagerQa(options);
      assert.equal(second.status, scenario.expectedStatus);
      assert.equal(second.decisionPublication, "reused");
      assert.deepEqual(second.decision, first.decision);
      assert.equal(scannerCalls, 0);
      await assert.rejects(
        readFile(join(fixture.root, `analyses/genre_souls/${SOUL_ID}/v1/manager-qa.json`)),
        /ENOENT/u,
      );
      await assert.rejects(
        readFile(join(fixture.root, `analyses/genre_souls/${SOUL_ID}/v1/leak-scan-receipts/manager-qa.json`)),
        /ENOENT/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  }
});

test("model output cannot turn a host-proven Manager invariant into a valid failure decision", async () => {
  const fixture = await setupFixture();
  try {
    await assert.rejects(runGenreSoulManagerQa(runnerOptions(fixture, {
      testOnlyRunStructured: fakeRun({
        mutateResult: (result) => {
          result.checks.profileEvidenceBinding = false;
        },
      }),
    })), /host-proven invariant profileEvidenceBinding must remain true/u);
    await assert.rejects(
      readFile(join(fixture.root, `analyses/genre_souls/${SOUL_ID}/v1/manager-qa.json`)),
      /ENOENT/u,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("host-derived Manager QA verdict rejects declared mismatches and content-neutrality drift", async () => {
  const mismatch = await setupFixture();
  try {
    await assert.rejects(runGenreSoulManagerQa(runnerOptions(mismatch, {
      testOnlyRunStructured: fakeRun({
        mutateResult: (result) => {
          result.sampleVerdicts[0].supportsPrimaryEngine = false;
        },
      }),
    })), /declared verdict mismatch: declared pass, host derived needs-revision/u);
    await assert.rejects(
      readFile(join(mismatch.root, `analyses/genre_souls/${SOUL_ID}/v1/manager-qa.json`)),
      /ENOENT/u,
    );
  } finally {
    await rm(mismatch.root, { recursive: true, force: true });
  }

  const unsafe = await setupFixture();
  try {
    await assert.rejects(runGenreSoulManagerQa(runnerOptions(unsafe, {
      testOnlyRunStructured: fakeRun({
        mutateResult: (result) => {
          result.checks.contentNeutrality = false;
          result.contentNeutrality.automaticRewrite = true;
        },
      }),
    })), /content-neutrality check must remain fail-closed true|content-neutrality boundary failed/u);
  } finally {
    await rm(unsafe.root, { recursive: true, force: true });
  }

  const result = {
    sampleVerdicts: [{ supportsPrimaryEngine: true }],
    engineComparisons: [{ verdict: "same" }],
    checks: {
      profileEvidenceBinding: false,
      exactSourceCoverage: true,
      rawSampleReadback: true,
      primaryEnginesPairwiseDifferent: false,
      profileSurfaceLeakScanPassed: true,
      contentNeutrality: true,
    },
  };
  assert.deepEqual(derivePrivateManagerQaVerdict(result), {
    result: "needs-revision",
    reasonCodes: ["primary-engine-pair-same", "primary-engines-not-pairwise-different"],
  });
});

test("Manager QA rejects a receipt-bound candidate output that differs from result JSON", async () => {
  const fixture = await setupFixture();
  try {
    await assert.rejects(runGenreSoulManagerQa(runnerOptions(fixture, {
      testOnlyRunStructured: fakeRun({
        mutateCandidate: (candidate) => {
          candidate.result = "needs-revision";
        },
      }),
    })), /candidate output does not exactly equal its parsed result JSON/u);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("manager rejects a visible profile marker whose top-level profile run is not completed", async () => {
  const fixture = await setupFixture();
  try {
    const options = runnerOptions(fixture);
    delete options.testOnlyProfileCompletionReadback;
    await assert.rejects(
      runGenreSoulManagerQa(options),
      /no top-level completed\.json seal; Manager QA is forbidden/u,
    );
    await assert.rejects(
      readFile(join(fixture.root, `analyses/genre_souls/${SOUL_ID}/v1/manager-qa.json`)),
      /ENOENT/u,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("operating API rejects legacy executor injection and requires immutable structured evidence even in test mode", async () => {
  const fixture = await setupFixture();
  try {
    await assert.rejects(runGenreSoulManagerQa({
      ...runnerOptions(fixture),
      runStructured: fakeRun(),
    }), /production executor is not injectable/u);
    for (const [key, value] of [
      ["repositoryRoot", fixture.root],
      ["profileHome", fixture.root],
      ["contextCachePath", join(fixture.root, "context.yaml")],
      ["loadEvidence", async () => fixture.evidence],
      ["runtimeLoader", async () => fakeRuntime()],
      ["profileCompletionReadback", async () => true],
      ["scanProjection", fakeScan()],
      ["publishHooks", {}],
    ]) {
      await assert.rejects(runGenreSoulManagerQa({
        genre: GENRE,
        [key]: value,
      }), new RegExp(`production option is not injectable: ${key}`, "u"));
    }
    await assert.rejects(runGenreSoulManagerQa({
      genre: GENRE,
      testOnlyLoadEvidence: async () => fixture.evidence,
    }), /test override requires the explicit testOnly=true boundary/u);

    await assert.rejects(runGenreSoulManagerQa(runnerOptions(fixture, {
      testOnlyRunStructured: async (options) => {
        const run = await fakeRun()(options);
        return { ...run, attemptDir: undefined };
      },
    })), /requires an immutable Hermes attempt directory/u);

    await assert.rejects(runGenreSoulManagerQa(runnerOptions(fixture, {
      testOnlyRunStructured: async (options) => {
        const run = await fakeRun()(options);
        await writeFile(join(run.attemptDir, "usage.json"), jsonBytes({ tampered: true }));
        return run;
      },
    })), /evidence SHA binding drifted/u);
    await assert.rejects(runGenreSoulManagerQa(runnerOptions(fixture, {
      testOnlyRunStructured: async (options) => {
        const run = await fakeRun()(options);
        const attestationPath = join(run.attemptDir, "input-attestation.json");
        const attestation = JSON.parse(await readFile(attestationPath, "utf8"));
        attestation.promptSha256 = "0".repeat(64);
        await writeFile(attestationPath, jsonBytes(attestation));
        return run;
      },
    })), /input attestation|attempt directory suffix|promptSha256/u);
    await assert.rejects(readFile(join(fixture.root, `analyses/genre_souls/${SOUL_ID}/v1/manager-qa.json`)), /ENOENT/u);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("manager test-only execution requires an isolated repository root before dependencies run", async () => {
  const isolatedRoot = await mkdtemp(join(tmpdir(), "manager-qa-isolated-boundary-"));
  let dependencyCalls = 0;
  let executorCalls = 0;
  let scannerCalls = 0;
  const base = {
    genre: GENRE,
    testOnly: true,
    testOnlyLoadEvidence: async () => {
      dependencyCalls += 1;
      throw new Error("dependency must not run");
    },
    testOnlyRunStructured: async () => {
      executorCalls += 1;
      throw new Error("executor must not run");
    },
    testOnlyScanProjection: async () => {
      scannerCalls += 1;
      throw new Error("scanner must not run");
    },
  };
  try {
    await assert.rejects(
      runGenreSoulManagerQa(base),
      /requires an explicit testOnlyRepositoryRoot/u,
    );
    await assert.rejects(
      runGenreSoulManagerQa({ ...base, testOnlyRepositoryRoot: ACTUAL_REPOSITORY_ROOT }),
      /must not equal the canonical Reference Lab repository root/u,
    );
    await assert.rejects(
      runGenreSoulManagerQa({ ...base, testOnlyRepositoryRoot: CASE_ALIAS_REPOSITORY_ROOT }),
      /must not equal the canonical Reference Lab repository root/u,
    );
    assert.equal(dependencyCalls, 0);
    assert.equal(executorCalls, 0);
    assert.equal(scannerCalls, 0);
    assert.deepEqual(await readdir(isolatedRoot), []);
  } finally {
    await rm(isolatedRoot, { recursive: true, force: true });
  }
});

test("manager publication test hooks require the same isolated repository root boundary", async () => {
  const root = await mkdtemp(join(tmpdir(), "manager-qa-publish-isolated-boundary-"));
  const aliasParent = await mkdtemp(join(tmpdir(), "manager-qa-publish-isolated-alias-"));
  const aliasRoot = join(aliasParent, "test-root-alias");
  await symlink(root, aliasRoot);
  const entries = [
    { path: join(root, "analyses/soul/v1/manager-qa.json"), bytes: Buffer.from("qa\n"), label: "QA", visibilityMarker: true },
    { path: join(root, "analyses/soul/v1/leak.json"), bytes: Buffer.from("leak\n"), label: "leak", visibilityMarker: false },
  ];
  const options = {
    repositoryRoot: root,
    testOnly: true,
    testOnlyHooks: { afterSupportPublish: () => { throw new Error("hook must not run"); } },
  };
  try {
    await assert.rejects(
      publishTrackedPair(entries, options),
      /requires an explicit testOnlyRepositoryRoot/u,
    );
    await assert.rejects(
      publishTrackedPair(entries, {
        ...options,
        repositoryRoot: ACTUAL_REPOSITORY_ROOT,
        testOnlyRepositoryRoot: ACTUAL_REPOSITORY_ROOT,
      }),
      /must not equal the canonical Reference Lab repository root/u,
    );
    await assert.rejects(
      publishTrackedPair(entries, {
        ...options,
        repositoryRoot: CASE_ALIAS_REPOSITORY_ROOT,
        testOnlyRepositoryRoot: CASE_ALIAS_REPOSITORY_ROOT,
      }),
      /must not equal the canonical Reference Lab repository root/u,
    );
    await assert.rejects(
      publishTrackedPair(entries.map((entry) => ({
        ...entry,
        path: entry.path.replace(root, aliasRoot),
      })), {
        ...options,
        repositoryRoot: aliasRoot,
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

test("production Manager QA publication is sealed to the physical canonical repository and exact pair", async () => {
  const otherRoot = await mkdtemp(join(tmpdir(), "manager-qa-production-other-root-"));
  const aliasParent = await mkdtemp(join(tmpdir(), "manager-qa-production-alias-"));
  const symlinkAlias = join(aliasParent, "reference-lab-alias");
  await symlink(ACTUAL_REPOSITORY_ROOT, symlinkAlias);
  const pairFor = (root, soulId = SOUL_ID) => [
    {
      path: join(root, `analyses/genre_souls/${soulId}/v1/manager-qa.json`),
      bytes: Buffer.from("qa\n"),
      label: "QA",
      visibilityMarker: true,
    },
    {
      path: join(root, `analyses/genre_souls/${soulId}/v1/leak-scan-receipts/manager-qa.json`),
      bytes: Buffer.from("leak\n"),
      label: "leak",
      visibilityMarker: false,
    },
  ];
  try {
    for (const root of [otherRoot, symlinkAlias, CASE_ALIAS_REPOSITORY_ROOT]) {
      await assert.rejects(
        publishTrackedPair(pairFor(root), { repositoryRoot: root }),
        /canonical Reference Lab repository root/u,
      );
    }
    assert.deepEqual(await readdir(otherRoot), []);

    const arbitrarySoul = `publisher-capability-${process.pid}`;
    const arbitraryPair = pairFor(ACTUAL_REPOSITORY_ROOT, arbitrarySoul);
    await assert.rejects(
      publishTrackedPair(arbitraryPair, { repositoryRoot: ACTUAL_REPOSITORY_ROOT }),
      /canonical manager-qa\.json visibility marker/u,
    );
    await assert.rejects(readFile(arbitraryPair[0].path), /ENOENT/u);
    await assert.rejects(readFile(arbitraryPair[1].path), /ENOENT/u);

    const reversedRoles = pairFor(ACTUAL_REPOSITORY_ROOT).map((entry) => ({
      ...entry,
      visibilityMarker: !entry.visibilityMarker,
    }));
    await assert.rejects(
      publishTrackedPair(reversedRoles, { repositoryRoot: ACTUAL_REPOSITORY_ROOT }),
      /canonical manager-qa\.json visibility marker/u,
    );
  } finally {
    await rm(otherRoot, { recursive: true, force: true });
    await rm(aliasParent, { recursive: true, force: true });
  }
});

test("raw samples remain exact members of the live private source bytes", async () => {
  const fixture = await setupFixture();
  try {
    const result = await runGenreSoulManagerQa(runnerOptions(fixture));
    const input = JSON.parse(await readFile(join(fixture.root, result.privateInputPath), "utf8"));
    assert.equal(await assertRawSamplesBindPrivateSources({
      repositoryRoot: fixture.root,
      evidence: fixture.evidence,
      rawSamples: input.rawSamples,
    }), true);
    const tampered = structuredClone(input.rawSamples);
    tampered[0].sourceText = `${tampered[0].sourceText}x`;
    await assert.rejects(assertRawSamplesBindPrivateSources({
      repositoryRoot: fixture.root,
      evidence: fixture.evidence,
      rawSamples: tampered,
    }), /private source membership drifted/u);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("source drift during Hermes execution fails the publication-time private membership gate", async () => {
  const fixture = await setupFixture();
  const sourcePath = join(
    fixture.root,
    fixture.evidence.bindings[0].evidence.source.repoRelativePath,
  );
  try {
    await assert.rejects(runGenreSoulManagerQa(runnerOptions(fixture, {
      testOnlyRunStructured: async (options) => {
        const run = await fakeRun()(options);
        await writeFile(sourcePath, Buffer.concat([await readFile(sourcePath), Buffer.from("drift")]));
        return run;
      },
    })), /raw sample source bytes drifted/u);
    await assert.rejects(
      readFile(join(fixture.root, `analyses/genre_souls/${SOUL_ID}/v1/manager-qa.json`)),
      /ENOENT/u,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("rejects shared synthesis runs, identical mechanisms, and incomplete pairwise output", async () => {
  const shared = await setupFixture();
  try {
    await assert.rejects(
      runGenreSoulManagerQa(runnerOptions(shared, { testOnlyRunStructured: fakeRun({ runId: "profile-synthesis-run" }) })),
      /fresh run separate from profile synthesis/u,
    );
  } finally {
    await rm(shared.root, { recursive: true, force: true });
  }

  const identical = await setupFixture({ identicalMechanisms: true });
  try {
    await assert.rejects(runGenreSoulManagerQa(runnerOptions(identical)), /identical primary commercial mechanisms/u);
  } finally {
    await rm(identical.root, { recursive: true, force: true });
  }

  const incomplete = await setupFixture();
  try {
    await assert.rejects(runGenreSoulManagerQa(runnerOptions(incomplete, {
      testOnlyRunStructured: fakeRun({ mutateResult: (result) => result.engineComparisons.pop() }),
    })), /all three pairwise engine comparisons|comparison set is incomplete/u);
  } finally {
    await rm(incomplete.root, { recursive: true, force: true });
  }
});

test("strict private validators reject missing samples, spans, and unbound verdicts", async () => {
  const fixture = await setupFixture();
  try {
    let capturedInput;
    let capturedResult;
    await runGenreSoulManagerQa(runnerOptions(fixture, {
      testOnlyRunStructured: async (options) => {
        capturedInput = JSON.parse(await readFile(options.expectedReadPaths[0], "utf8"));
        capturedResult = privateResult(capturedInput);
        return fakeRun()(options);
      },
    }));
    const missing = structuredClone(capturedInput);
    missing.rawSamples.pop();
    assert.throws(() => validatePrivateManagerQaInput(missing), /exactly nine raw samples/u);
    const missingSpan = structuredClone(capturedInput);
    missingSpan.rawSamples.find((sample) => sample.span === "early").span = "middle";
    assert.throws(() => validatePrivateManagerQaInput(missingSpan), /opening, middle, and ending/u);
    const unboundVerdict = structuredClone(capturedResult);
    unboundVerdict.sampleVerdicts[0].sliceSha256 = "0".repeat(64);
    assert.throws(
      () => validatePrivateManagerQaResult(unboundVerdict, { input: capturedInput }),
      /missing, duplicated, or unbound/u,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("rejects bad profile, profile synthesis input, or leak input before Hermes", async () => {
  const badProfile = await setupFixture();
  try {
    const profile = structuredClone(badProfile.profile);
    profile.state = "promoted";
    await badProfile.writeProfileAndLeak(profile);
    await assert.rejects(runGenreSoulManagerQa(runnerOptions(badProfile)), /state must be candidate/u);
  } finally {
    await rm(badProfile.root, { recursive: true, force: true });
  }

  const badInput = await setupFixture();
  try {
    const badInputBytes = jsonBytes({ schemaVersion: "private-genre-soul-profile-input/v1", genre: "wrong" });
    await writeBytes(join(badInput.root, badInput.profile.synthesis.privateInput.path), badInputBytes);
    const reboundProfile = structuredClone(badInput.profile);
    reboundProfile.synthesis.privateInput.sha256 = sha256(badInputBytes);
    reboundProfile.synthesis.privateInput.sizeBytes = badInputBytes.byteLength;
    await badInput.writeProfileAndLeak(reboundProfile);
    await assert.rejects(runGenreSoulManagerQa(runnerOptions(badInput)), /private input identity or exact source set drifted/u);
  } finally {
    await rm(badInput.root, { recursive: true, force: true });
  }

  const badLeak = await setupFixture();
  try {
    await badLeak.writeProfileAndLeak(badLeak.profile, (leak) => {
      leak.status = "quarantine";
      leak.matchCount = 1;
      leak.matches = [{ matchId: "fixture" }];
    });
    await assert.rejects(
      runGenreSoulManagerQa(runnerOptions(badLeak)),
      /canonical zero-match byte- and corpus-bound pass receipt/u,
    );
  } finally {
    await rm(badLeak.root, { recursive: true, force: true });
  }
});

test("scan failure leaves no tracked manager receipt or leak receipt", async () => {
  const fixture = await setupFixture();
  try {
    await assert.rejects(
      runGenreSoulManagerQa(runnerOptions(fixture, { testOnlyScanProjection: fakeScan({ fail: true }) })),
      /fixture scan failed/u,
    );
    await assert.rejects(readFile(join(fixture.root, `analyses/genre_souls/${SOUL_ID}/v1/manager-qa.json`)), /ENOENT/u);
    await assert.rejects(readFile(join(fixture.root, `analyses/genre_souls/${SOUL_ID}/v1/leak-scan-receipts/manager-qa.json`)), /ENOENT/u);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("Manager QA consumes an exact owner surface decision before publishing a pending pass candidate", async () => {
  const fixture = await setupFixture();
  const options = runnerOptions(fixture, {
    testOnlyRunStructured: fakeRun({
      mutateResult: (result) => {
        result.engineComparisons[0].semanticDifference = "차도윤 방식은 반복 행동과 저항 해소 순서가 다르다";
      },
    }),
  });
  try {
    const pending = await runGenreSoulManagerQa(options);
    assert.equal(pending.status, "pending_hil");
    await assert.rejects(
      readFile(join(fixture.root, `analyses/genre_souls/${SOUL_ID}/v1/manager-qa.json`)),
      /ENOENT/u,
    );
    const decision = await writePrivateGenreSoulSurfaceHilDecision({
      repositoryRoot: fixture.root,
      requestPath: pending.surfaceHil.requestPath,
      decision: "approve",
      actorId: "owner:test",
      decidedAt: "2026-08-30T00:00:00.000Z",
      testOnly: true,
      testOnlyRepositoryRoot: fixture.root,
    });
    const published = await runGenreSoulManagerQa(options);
    assert.equal(published.status, "written");
    assert.equal(published.surfaceHil.outcome, "pass");
    assert.equal(published.surfaceHil.decisionPath, decision.decisionPath);
    const tracked = JSON.parse(await readFile(join(fixture.root, published.qaPath), "utf8"));
    assert.equal(tracked.result, "pass");
    assert.equal(tracked.surfaceReview.schemaVersion, "genre-soul-manager-surface-review-proof/v1");
    assert.equal(tracked.surfaceReview.candidate.path, published.surfaceHil.candidatePath);
    assert.equal(tracked.surfaceReview.request.path, published.surfaceHil.requestPath);
    assert.equal(tracked.surfaceReview.decision.path, decision.decisionPath);
    assert.equal(tracked.surfaceReview.decision.sha256, decision.decisionSha256);
    assert.equal(tracked.surfaceReview.decision.outcome, "approved");
    assert.equal(tracked.surfaceReview.decision.decidedByRole, "owner");
    assert.equal(validateManagerQaReceipt(tracked), true);
    const tampered = structuredClone(tracked);
    tampered.surfaceReview.decision.outcome = "rejected";
    assert.throws(() => validateManagerQaReceipt(tampered), /requires an exact approved owner decision/u);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("semantic lint rejects proper names, selection identities, and copied private surfaces without blocking generic mechanism prose", async () => {
  const fixture = await setupFixture();
  try {
    const result = await runGenreSoulManagerQa(runnerOptions(fixture));
    const privateInput = JSON.parse(await readFile(join(fixture.root, result.privateInputPath), "utf8"));
    const rawSamples = structuredClone(privateInput.rawSamples);
    rawSamples[0].sourceText = "차도윤과 함께 움직였다. 압박을 돈으로 바꾼 뒤 목격자 앞에서 즉시 지위를 얻는다 그리고 돌아섰다.";
    assert.equal(assertManagerQaTrackedSemanticSafety({
      receipt: result.receipt,
      evidence: fixture.evidence,
      rawSamples,
    }), true);

    const named = structuredClone(result.receipt);
    named.engineComparisons[0].semanticDifference = "차도윤 방식은 반복 행동과 저항 해소 순서가 다르다";
    assert.throws(() => assertManagerQaTrackedSemanticSafety({
      receipt: named,
      evidence: fixture.evidence,
      rawSamples,
    }), /pending_hil/u);

    for (const [sourceText, personName] of [
      ["김민수와 함께 움직였다.", "김민수"],
      ["김철은 먼저 움직였다.", "김철"],
      ["김철이는 먼저 움직였다.", "김철"],
      ["김철이가 먼저 움직였다.", "김철"],
      ["김철이를 먼저 불렀다.", "김철"],
      ["김광은 먼저 움직였다.", "김광"],
      ["이준이 먼저 움직였다.", "이준"],
      ["차도윤이랑 함께 움직였다.", "차도윤"],
      ["차도윤랑 함께 움직였다.", "차도윤"],
      ["차도윤하고 함께 움직였다.", "차도윤"],
      ["김철, 지금 와.", "김철"],
      ["모두 그를 김철이라고 불렀다.", "김철"],
    ]) {
      const conjunctionSamples = structuredClone(rawSamples);
      conjunctionSamples[0].sourceText = sourceText;
      const conjunctionReceipt = structuredClone(result.receipt);
      conjunctionReceipt.engineComparisons[0].semanticDifference = `${personName} 방식은 반복 행동과 저항 해소 순서가 다르다`;
      assert.throws(() => assertManagerQaTrackedSemanticSafety({
        receipt: conjunctionReceipt,
        evidence: fixture.evidence,
        rawSamples: conjunctionSamples,
      }), /pending_hil/u);
    }

    const organizationSamples = structuredClone(rawSamples);
    organizationSamples[0].sourceText = "태성 본사는 다음 인수를 준비했다.";
    const organizationReceipt = structuredClone(result.receipt);
    organizationReceipt.engineComparisons[0].semanticDifference = "태성 방식은 반복 행동과 저항 해소 순서가 다르다";
    assert.throws(() => assertManagerQaTrackedSemanticSafety({
      receipt: organizationReceipt,
      evidence: fixture.evidence,
      rawSamples: organizationSamples,
    }), /protected proper surface/u);

    for (const sourceText of [
      "태성그룹은 다음 인수를 준비했다.",
      "태성기업이 다음 인수를 준비했다.",
      "태성문파는 다음 공격을 준비했다.",
      "태성그룹이라는 회사가 인수를 준비했다.",
      "상대는 태성그룹이었다.",
    ]) {
      const attachedOrganizationSamples = structuredClone(rawSamples);
      attachedOrganizationSamples[0].sourceText = sourceText;
      assert.throws(() => assertManagerQaTrackedSemanticSafety({
        receipt: organizationReceipt,
        evidence: fixture.evidence,
        rawSamples: attachedOrganizationSamples,
      }), /protected proper surface/u);
    }

    const genericSamples = structuredClone(rawSamples);
    genericSamples[0].sourceText = "대기업은 자산 인수 압박을 먼저 회수했다.";
    const genericReceipt = structuredClone(result.receipt);
    genericReceipt.engineComparisons[0].semanticDifference = "대기업 인수 방식은 압박 회수 순서가 다르다";
    assert.equal(assertManagerQaTrackedSemanticSafety({
      receipt: genericReceipt,
      evidence: fixture.evidence,
      rawSamples: genericSamples,
    }), true);
    const fourTokenSamples = structuredClone(rawSamples);
    fourTokenSamples[0].sourceText = "대기업 인수 압박 회수";
    const fourTokenReceipt = structuredClone(result.receipt);
    fourTokenReceipt.engineComparisons[0].semanticDifference = "대기업 인수 압박 회수";
    assert.equal(assertManagerQaTrackedSemanticSafety({
      receipt: fourTokenReceipt,
      evidence: fixture.evidence,
      rawSamples: fourTokenSamples,
    }), true);
    const ambiguousNounSamples = structuredClone(rawSamples);
    ambiguousNounSamples[0].sourceText = "공개는 다음 보상을 바꾼다.";
    const ambiguousNounReceipt = structuredClone(result.receipt);
    ambiguousNounReceipt.engineComparisons[0].semanticDifference = "공개 방식은 압박 회수 순서를 바꾼다";
    assert.throws(() => assertManagerQaTrackedSemanticSafety({
      receipt: ambiguousNounReceipt,
      evidence: fixture.evidence,
      rawSamples: ambiguousNounSamples,
    }), /pending_hil/u);
    for (const genericNoun of ["변화", "한계", "권한"]) {
      const nounSamples = structuredClone(rawSamples);
      nounSamples[0].sourceText = `${genericNoun}는 다음 보상을 바꾼다.`;
      const nounReceipt = structuredClone(result.receipt);
      nounReceipt.engineComparisons[0].semanticDifference = `${genericNoun} 방식은 압박 회수 순서를 바꾼다`;
      assert.equal(assertManagerQaTrackedSemanticSafety({
        receipt: nounReceipt,
        evidence: fixture.evidence,
        rawSamples: nounSamples,
      }), true);
    }

    const selectionIdentity = structuredClone(result.receipt);
    selectionIdentity.engineComparisons[0].commercialConsequence = "작품-1 독자에게만 특수한 기대를 만든다";
    assert.throws(() => assertManagerQaTrackedSemanticSafety({
      receipt: selectionIdentity,
      evidence: fixture.evidence,
      rawSamples,
    }), /protected proper surface/u);

    const fragmentEvidence = structuredClone(fixture.evidence);
    fragmentEvidence.bindings[0].title = "재벌집 막내아들";
    const titleFragment = structuredClone(result.receipt);
    titleFragment.engineComparisons[0].commercialConsequence = "재벌집 독자에게만 특수한 기대를 만든다";
    assert.equal(assertManagerQaTrackedSemanticSafety({
      receipt: titleFragment,
      evidence: fragmentEvidence,
      rawSamples,
    }), true);

    fragmentEvidence.bindings[0].title = "재벌집막내아들";
    assert.equal(assertManagerQaTrackedSemanticSafety({
      receipt: titleFragment,
      evidence: fragmentEvidence,
      rawSamples,
    }), true);

    fragmentEvidence.bindings[0].title = "대기업재벌집";
    const genericTitleFragment = structuredClone(result.receipt);
    genericTitleFragment.engineComparisons[0].commercialConsequence = "대기업 인수 방식은 압박 회수 순서가 다르다";
    assert.equal(assertManagerQaTrackedSemanticSafety({
      receipt: genericTitleFragment,
      evidence: fragmentEvidence,
      rawSamples,
    }), true);

    const shortCopy = structuredClone(result.receipt);
    shortCopy.engineComparisons[0].semanticDifference = "압박을 돈으로 바꾼 뒤 목격자 앞에서 즉시 지위를 얻는다";
    assert.throws(() => assertManagerQaTrackedSemanticSafety({
      receipt: shortCopy,
      evidence: fixture.evidence,
      rawSamples,
    }), /exact-private-surface-copy/u);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("high-confidence protected Manager prose fails before the structured result can be sealed", async () => {
  const fixture = await setupFixture();
  let calls = 0;
  const protectedRun = fakeRun({
    mutateResult: (result) => {
      result.engineComparisons[0].semanticDifference = "작품-1의 고유 비교 표면을 그대로 따른다";
    },
  });
  try {
    await assert.rejects(runGenreSoulManagerQa(runnerOptions(fixture, {
      testOnlyRunStructured: async (options) => {
        calls += 1;
        return protectedRun(options);
      },
    })), /Manager QA candidate contains a protected private surface/u);
    assert.equal(calls, 1);
    await assert.rejects(
      readFile(join(fixture.root, `analyses/genre_souls/${SOUL_ID}/v1/manager-qa.json`)),
      /ENOENT/u,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("tracked pair uses a target lock, publishes support before marker, and preserves failed support invisibly", async () => {
  const root = await mkdtemp(join(tmpdir(), "manager-qa-pair-publish-"));
  const qaPath = join(root, "analyses/soul/v1/manager-qa.json");
  const leakPath = join(root, "analyses/soul/v1/leak-scan-receipts/manager-qa.json");
  const entries = [
    { path: qaPath, bytes: Buffer.from("qa\n"), label: "QA", visibilityMarker: true },
    { path: leakPath, bytes: Buffer.from("leak\n"), label: "leak", visibilityMarker: false },
  ];
  try {
    assert.equal(await publishTrackedPair(entries, {
      repositoryRoot: root,
      testOnly: true,
      testOnlyRepositoryRoot: root,
      testOnlyHooks: {
        afterSupportPublish: async () => {
          assert.equal((await readFile(leakPath, "utf8")), "leak\n");
          await assert.rejects(readFile(qaPath), /ENOENT/u);
        },
      },
    }), "written");
    assert.equal((await readFile(qaPath, "utf8")), "qa\n");
    assert.equal((await readFile(leakPath, "utf8")), "leak\n");
    assert.equal((await lstat(qaPath)).mode & 0o077, 0);
    assert.equal((await lstat(leakPath)).mode & 0o077, 0);
    assert.equal(await publishTrackedPair(entries, {
      repositoryRoot: root,
      testOnly: true,
      testOnlyRepositoryRoot: root,
    }), "reused");
    const releasedLocks = (await readdir(join(root, "exports/locks/manager-qa-publish")))
      .filter((name) => name.includes(".lock.released-"));
    assert.equal(releasedLocks.length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }

  const failedRoot = await mkdtemp(join(tmpdir(), "manager-qa-pair-rollback-"));
  const failedQaPath = join(failedRoot, "analyses/soul/v1/manager-qa.json");
  const failedLeakPath = join(failedRoot, "analyses/soul/v1/leak-scan-receipts/manager-qa.json");
  try {
    await assert.rejects(publishTrackedPair([
      { path: failedQaPath, bytes: Buffer.from("qa\n"), label: "QA", visibilityMarker: true },
      { path: failedLeakPath, bytes: Buffer.from("leak\n"), label: "leak", visibilityMarker: false },
    ], {
      repositoryRoot: failedRoot,
      testOnly: true,
      testOnlyRepositoryRoot: failedRoot,
      testOnlyHooks: {
        afterSupportPublish: async () => {
          throw new Error("injected pre-visibility failure");
        },
      },
    }), /files and lock preserved for manual audit/u);
    await assert.rejects(readFile(failedQaPath), /ENOENT/u);
    assert.equal(await readFile(failedLeakPath, "utf8"), "leak\n");
    const locks = await readdir(join(failedRoot, "exports/locks/manager-qa-publish"));
    assert.equal(locks.length, 1);
    assert.equal(JSON.parse(await readFile(join(failedRoot, "exports/locks/manager-qa-publish", locks[0], "owner.json"), "utf8")).pid, process.pid);
  } finally {
    await rm(failedRoot, { recursive: true, force: true });
  }

  const reusedRoot = await mkdtemp(join(tmpdir(), "manager-qa-pair-reused-support-"));
  const reusedQaPath = join(reusedRoot, "analyses/soul/v1/manager-qa.json");
  const reusedLeakPath = join(reusedRoot, "analyses/soul/v1/leak-scan-receipts/manager-qa.json");
  try {
    await mkdir(dirname(reusedLeakPath), { recursive: true });
    await writeFile(reusedLeakPath, "leak\n");
    await assert.rejects(publishTrackedPair([
      { path: reusedQaPath, bytes: Buffer.from("qa\n"), label: "QA", visibilityMarker: true },
      { path: reusedLeakPath, bytes: Buffer.from("leak\n"), label: "leak", visibilityMarker: false },
    ], {
      repositoryRoot: reusedRoot,
      testOnly: true,
      testOnlyRepositoryRoot: reusedRoot,
      testOnlyHooks: {
        afterSupportPublish: () => { throw new Error("injected-after-reused-support"); },
      },
    }), /files and lock preserved for manual audit/u);
    await assert.rejects(readFile(reusedQaPath), /ENOENT/u);
    assert.equal(await readFile(reusedLeakPath, "utf8"), "leak\n");
    const locks = await readdir(join(reusedRoot, "exports/locks/manager-qa-publish"));
    assert.equal(locks.length, 1);
  } finally {
    await rm(reusedRoot, { recursive: true, force: true });
  }
});

test("preexisting marker-only and support-only Manager QA states preserve their live publish locks", async () => {
  const roots = await Promise.all(["marker", "support"].map((kind) => (
    mkdtemp(join(tmpdir(), `manager-qa-inverse-${kind}-`))
  )));
  try {
    for (const [index, root] of roots.entries()) {
      const qaPath = join(root, "analyses/soul/v1/manager-qa.json");
      const leakPath = join(root, "analyses/soul/v1/leak-scan-receipts/manager-qa.json");
      const entries = [
        { path: qaPath, bytes: Buffer.from("qa\n"), label: "QA", visibilityMarker: true },
        { path: leakPath, bytes: Buffer.from("leak\n"), label: "leak", visibilityMarker: false },
      ];
      const preexisting = entries[index];
      await mkdir(dirname(preexisting.path), { recursive: true });
      await writeFile(preexisting.path, preexisting.bytes);
      await assert.rejects(publishTrackedPair(entries, {
        repositoryRoot: root,
        testOnly: true,
        testOnlyRepositoryRoot: root,
      }), /inconsistent|visibility marker exists.*files and lock preserved|files and lock preserved.*(?:inconsistent|visibility marker exists)/u);
      const lockRoot = join(root, "exports/locks/manager-qa-publish");
      const liveLocks = (await readdir(lockRoot)).filter((name) => name.endsWith(".lock"));
      assert.equal(liveLocks.length, 1);
      assert.equal(JSON.parse(await readFile(join(lockRoot, liveLocks[0], "owner.json"), "utf8")).pid, process.pid);
      const counterpart = entries[index === 0 ? 1 : 0];
      await assert.rejects(readFile(counterpart.path), /ENOENT/u);
    }
  } finally {
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  }
});

test("Manager QA publish lock release quarantine never removes a replacement at the live pathname", async () => {
  const root = await mkdtemp(join(tmpdir(), "manager-qa-release-replacement-"));
  const qaPath = join(root, "analyses/soul/v1/manager-qa.json");
  const leakPath = join(root, "analyses/soul/v1/leak-scan-receipts/manager-qa.json");
  let liveLockPath;
  let releasePath;
  let liveLockIdentity;
  let liveOwnerIdentity;
  const temporaryReleases = [];
  try {
    assert.equal(await publishTrackedPair([
      { path: qaPath, bytes: Buffer.from("qa\n"), label: "QA", visibilityMarker: true },
      { path: leakPath, bytes: Buffer.from("leak\n"), label: "leak", visibilityMarker: false },
    ], {
      repositoryRoot: root,
      testOnly: true,
      testOnlyRepositoryRoot: root,
      testOnlyHooks: {
        afterLockAcquired: async ({ lockPath }) => {
          liveLockPath = lockPath;
          const [lockInfo, ownerInfo] = await Promise.all([
            lstat(lockPath),
            lstat(join(lockPath, "owner.json")),
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
    }), "written");
    assert.equal(await readFile(join(liveLockPath, "foreign.txt"), "utf8"), "foreign\n");
    const ownerBytes = await readFile(join(releasePath, "owner.json"));
    assert.equal(JSON.parse(ownerBytes.toString("utf8")).pid, process.pid);
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
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Manager QA publish lock rejects a non-canonical content-rebound tombstone", async () => {
  const root = await mkdtemp(join(tmpdir(), "manager-qa-damaged-tombstone-"));
  const entries = [
    { path: join(root, "analyses/soul/v1/manager-qa.json"), bytes: Buffer.from("qa\n"), label: "QA", visibilityMarker: true },
    { path: join(root, "analyses/soul/v1/leak.json"), bytes: Buffer.from("leak\n"), label: "leak", visibilityMarker: false },
  ];
  try {
    await publishTrackedPair(entries, {
      repositoryRoot: root,
      testOnly: true,
      testOnlyRepositoryRoot: root,
    });
    const lockParent = join(root, "exports/locks/manager-qa-publish");
    const [releasedName] = (await readdir(lockParent)).filter((name) => name.includes(".lock.released-"));
    const releasedPath = join(lockParent, releasedName);
    const ownerPath = join(releasedPath, "owner.json");
    const ownerInfoBefore = await lstat(ownerPath);
    const owner = JSON.parse(await readFile(ownerPath, "utf8"));
    const damagedBytes = Buffer.from(JSON.stringify(owner));
    await writeFile(ownerPath, damagedBytes);
    const ownerInfoAfter = await lstat(ownerPath);
    assert.deepEqual(
      { dev: ownerInfoAfter.dev, ino: ownerInfoAfter.ino },
      { dev: ownerInfoBefore.dev, ino: ownerInfoBefore.ino },
    );
    const reboundName = releasedName.replace(/[a-f0-9]{64}$/u, sha256(damagedBytes));
    await rename(releasedPath, join(lockParent, reboundName));
    await assert.rejects(
      publishTrackedPair(entries, {
        repositoryRoot: root,
        testOnly: true,
        testOnlyRepositoryRoot: root,
      }),
      /released quarantine owner is not canonical JSON; manual audit is required/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("tracked pair failure never mutates a foreign replacement directory and preserves the lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "manager-qa-pair-rollback-ownership-"));
  const qaPath = join(root, "analyses/soul/v1/manager-qa.json");
  const leakPath = join(root, "analyses/soul/v1/leak-scan-receipts/manager-qa.json");
  const foreignBytes = Buffer.from("foreign-sentinel\n");
  let lockPath;
  try {
    await assert.rejects(publishTrackedPair([
      { path: qaPath, bytes: Buffer.from("qa\n"), label: "QA", visibilityMarker: true },
      { path: leakPath, bytes: Buffer.from("owned-leak\n"), label: "leak", visibilityMarker: false },
    ], {
      repositoryRoot: root,
      testOnly: true,
      testOnlyRepositoryRoot: root,
      testOnlyHooks: {
        afterLockAcquired: ({ lockPath: acquired }) => { lockPath = acquired; },
        afterSupportPublish: async () => {
          await rm(leakPath);
          await mkdir(leakPath);
          await writeFile(join(leakPath, "sentinel.txt"), foreignBytes);
          throw new Error("injected-after-foreign-replacement");
        },
      },
    }), /files and lock preserved for manual audit/u);
    assert.equal((await lstat(leakPath)).isDirectory(), true);
    assert.deepEqual(await readFile(join(leakPath, "sentinel.txt")), foreignBytes);
    await assert.rejects(readFile(qaPath), /ENOENT/u);
    assert.ok(lockPath);
    assert.equal(JSON.parse(await readFile(join(lockPath, "owner.json"), "utf8")).pid, process.pid);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("tracked pair serializes competing writers and never clobbers a different completed pair", async () => {
  const root = await mkdtemp(join(tmpdir(), "manager-qa-pair-lock-"));
  const qaPath = join(root, "analyses/soul/v1/manager-qa.json");
  const leakPath = join(root, "analyses/soul/v1/leak-scan-receipts/manager-qa.json");
  const entries = [
    { path: qaPath, bytes: Buffer.from("qa-a\n"), label: "QA", visibilityMarker: true },
    { path: leakPath, bytes: Buffer.from("leak-a\n"), label: "leak", visibilityMarker: false },
  ];
  let releaseLock;
  let reportLocked;
  const locked = new Promise((resolveLocked) => { reportLocked = resolveLocked; });
  const release = new Promise((resolveRelease) => { releaseLock = resolveRelease; });
  try {
    const first = publishTrackedPair(entries, {
      repositoryRoot: root,
      testOnly: true,
      testOnlyRepositoryRoot: root,
      testOnlyHooks: {
        afterLockAcquired: async () => {
          reportLocked();
          await release;
        },
      },
    });
    await locked;
    await assert.rejects(publishTrackedPair(entries, {
      repositoryRoot: root,
      testOnly: true,
      testOnlyRepositoryRoot: root,
    }), /publish lock exists/u);
    releaseLock();
    assert.equal(await first, "written");
    await assert.rejects(publishTrackedPair([
      { ...entries[0], bytes: Buffer.from("qa-b\n") },
      { ...entries[1], bytes: Buffer.from("leak-b\n") },
    ], {
      repositoryRoot: root,
      testOnly: true,
      testOnlyRepositoryRoot: root,
    }), /already exists with different bytes/u);
    assert.equal(await readFile(qaPath, "utf8"), "qa-a\n");
    assert.equal(await readFile(leakPath, "utf8"), "leak-a\n");
  } finally {
    releaseLock?.();
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test("tracked pair rejects a symlinked ancestor before writing outside the repository", async () => {
  const root = await mkdtemp(join(tmpdir(), "manager-qa-symlink-root-"));
  const outside = await mkdtemp(join(tmpdir(), "manager-qa-symlink-outside-"));
  try {
    await symlink(outside, join(root, "analyses"));
    const qaPath = join(root, "analyses/soul/v1/manager-qa.json");
    const leakPath = join(root, "analyses/soul/v1/leak-scan-receipts/manager-qa.json");
    await assert.rejects(publishTrackedPair([
      { path: qaPath, bytes: Buffer.from("qa\n"), label: "QA", visibilityMarker: true },
      { path: leakPath, bytes: Buffer.from("leak\n"), label: "leak", visibilityMarker: false },
    ], {
      repositoryRoot: root,
      testOnly: true,
      testOnlyRepositoryRoot: root,
    }), /symlinked path component/u);
    await assert.rejects(readFile(join(outside, "soul/v1/manager-qa.json")), /ENOENT/u);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }

  const lockRoot = await mkdtemp(join(tmpdir(), "manager-qa-lock-symlink-root-"));
  const lockOutside = await mkdtemp(join(tmpdir(), "manager-qa-lock-symlink-outside-"));
  try {
    await symlink(lockOutside, join(lockRoot, "exports"));
    await assert.rejects(publishTrackedPair([
      { path: join(lockRoot, "analyses/soul/v1/manager-qa.json"), bytes: Buffer.from("qa\n"), label: "QA", visibilityMarker: true },
      { path: join(lockRoot, "analyses/soul/v1/leak-scan-receipts/manager-qa.json"), bytes: Buffer.from("leak\n"), label: "leak", visibilityMarker: false },
    ], {
      repositoryRoot: lockRoot,
      testOnly: true,
      testOnlyRepositoryRoot: lockRoot,
    }), /publish lock parent has a symlinked path component/u);
    assert.deepEqual(await readdir(lockOutside), []);
  } finally {
    await rm(lockRoot, { recursive: true, force: true });
    await rm(lockOutside, { recursive: true, force: true });
  }
});

test("manager private input rejects symlinked read and write ancestors without escaping the repository", async () => {
  const readFixture = await setupFixture();
  const readOutside = await mkdtemp(join(tmpdir(), "manager-qa-private-read-outside-"));
  try {
    const exportsPath = join(readFixture.root, "exports");
    const outsideExports = join(readOutside, "exports");
    await rename(exportsPath, outsideExports);
    await symlink(outsideExports, exportsPath);
    await assert.rejects(
      runGenreSoulManagerQa(runnerOptions(readFixture)),
      /Profile synthesis private input path has a symlinked path component/u,
    );
  } finally {
    await rm(readFixture.root, { recursive: true, force: true });
    await rm(readOutside, { recursive: true, force: true });
  }

  const writeFixture = await setupFixture();
  const writeOutside = await mkdtemp(join(tmpdir(), "manager-qa-private-write-outside-"));
  try {
    const managerRuns = join(
      writeFixture.root,
      `exports/genre-souls/${SOUL_ID}/v1/manager-qa-runs`,
    );
    await symlink(writeOutside, managerRuns);
    await assert.rejects(
      runGenreSoulManagerQa(runnerOptions(writeFixture)),
      /Manager QA private input has a symlinked path component/u,
    );
    assert.deepEqual(await readdir(writeOutside), []);
  } finally {
    await rm(writeFixture.root, { recursive: true, force: true });
    await rm(writeOutside, { recursive: true, force: true });
  }
});

test("manager rejects symlinked Hermes attempt and host-receipt evidence before tracked publication", async () => {
  for (const mode of ["attempt", "host-receipt"]) {
    const fixture = await setupFixture();
    const outside = await mkdtemp(join(tmpdir(), `manager-qa-hermes-${mode}-outside-`));
    const testOnlyRunStructured = async (options) => {
      const run = await fakeRun()(options);
      if (mode === "attempt") {
        await rm(run.attemptDir, { recursive: true, force: true });
        await symlink(outside, run.attemptDir);
      } else {
        const outsideReceipt = join(outside, "host-receipt.json");
        await writeFile(outsideReceipt, jsonBytes(run.receipt));
        const receiptPath = join(run.attemptDir, "host-receipt.json");
        await rm(receiptPath, { force: true });
        await symlink(outsideReceipt, receiptPath);
      }
      return run;
    };
    try {
      await assert.rejects(
        runGenreSoulManagerQa(runnerOptions(fixture, { testOnlyRunStructured })),
        /Manager QA Hermes (?:attempt directory|host-receipt\.json) has a symlinked path component/u,
      );
      await assert.rejects(
        readFile(join(fixture.root, `analyses/genre_souls/${SOUL_ID}/v1/manager-qa.json`)),
        /ENOENT/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  }
});

test("full runtime and exact prompt bytes change the structured manager run digest", async () => {
  const firstFixture = await setupFixture();
  const secondFixture = await setupFixture();
  const promptFixture = await setupFixture();
  try {
    const first = await runGenreSoulManagerQa(runnerOptions(firstFixture));
    const second = await runGenreSoulManagerQa(runnerOptions(secondFixture, {
      testOnlyRuntimeLoader: async () => fakeRuntime({
        hermesVersionSha256: "f".repeat(64),
        hermesRuntimeIdentitySha256: "0".repeat(64),
      }),
    }));
    assert.notEqual(first.inputDigest, second.inputDigest);
    assert.notEqual(first.privateInputPath, second.privateInputPath);

    const promptChanged = await runGenreSoulManagerQa(runnerOptions(promptFixture, {
      testOnlyPromptSuffix: "TEST-ONLY PROMPT CONTRACT V2",
    }));
    assert.equal(first.privateInputPath, promptChanged.privateInputPath);
    assert.notEqual(first.inputDigest, promptChanged.inputDigest);
  } finally {
    await rm(firstFixture.root, { recursive: true, force: true });
    await rm(secondFixture.root, { recursive: true, force: true });
    await rm(promptFixture.root, { recursive: true, force: true });
  }
});

test("manager run digest and immutable capability bind the exact auth adapter planning evidence", async () => {
  const firstFixture = await setupFixture();
  const secondFixture = await setupFixture();
  const firstEvidence = fakeAuthAdapterPlanningEvidence("first");
  const secondEvidence = fakeAuthAdapterPlanningEvidence("second");
  let executorEvidence;
  try {
    const first = await runGenreSoulManagerQa(runnerOptions(firstFixture, {
      testOnlyAuthAdapterPlanningEvidenceLoader: async () => firstEvidence,
      testOnlyRunStructured: async (options) => {
        executorEvidence = options.expectedAuthAdapterPlanningEvidence;
        return fakeRun()(options);
      },
    }));
    const second = await runGenreSoulManagerQa(runnerOptions(secondFixture, {
      testOnlyAuthAdapterPlanningEvidenceLoader: async () => secondEvidence,
    }));
    assert.deepEqual(executorEvidence, firstEvidence);
    assert.equal(first.privateInputPath, second.privateInputPath);
    assert.notEqual(first.inputDigest, second.inputDigest);

    const descriptorPath = join(
      firstFixture.root,
      dirname(first.privateInputPath),
      "structured-runs",
      first.inputDigest,
      "run-descriptor.json",
    );
    const descriptor = JSON.parse(await readFile(descriptorPath, "utf8"));
    assert.equal(descriptor.schemaVersion, "private-genre-soul-manager-qa-run-input-digest/v4");
    assert.equal(
      descriptor.exactInputAuthProjectionContractVersion,
      "hermes-global-auth-store-adapter/v1",
    );
    assert.deepEqual(descriptor.authAdapterPlanningEvidence, firstEvidence);
  } finally {
    await rm(firstFixture.root, { recursive: true, force: true });
    await rm(secondFixture.root, { recursive: true, force: true });
  }
});

test("manager rejects a self-consistent Hermes auth adapter capability that differs from its run plan", async () => {
  const fixture = await setupFixture();
  const planned = fakeAuthAdapterPlanningEvidence("planned");
  const drifted = fakeAuthAdapterPlanningEvidence("drifted");
  try {
    await assert.rejects(
      runGenreSoulManagerQa(runnerOptions(fixture, {
        testOnlyAuthAdapterPlanningEvidenceLoader: async () => planned,
        testOnlyRunStructured: async (options) => fakeRun()({
          ...options,
          expectedAuthAdapterPlanningEvidence: drifted,
        }),
      })),
      /Manager QA Hermes auth-store adapter drifted from the sealed planning evidence/u,
    );
    await assert.rejects(
      readFile(join(fixture.root, `analyses/genre_souls/${SOUL_ID}/v1/manager-qa.json`)),
      /ENOENT/u,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("manager revalidates its exact run descriptor and prompt after structured execution", async () => {
  for (const [filename, label] of [
    ["run-descriptor.json", "run descriptor"],
    ["prompt.txt", "exact prompt"],
  ]) {
    const fixture = await setupFixture();
    try {
      await assert.rejects(
        runGenreSoulManagerQa(runnerOptions(fixture, {
          testOnlyRunStructured: async (options) => {
            const run = await fakeRun()(options);
            await writeFile(join(options.runRoot, filename), Buffer.from(`drifted-${filename}\n`));
            return run;
          },
        })),
        new RegExp(`Manager QA ${label} changed during structured execution`, "u"),
      );
      await assert.rejects(
        readFile(join(fixture.root, `analyses/genre_souls/${SOUL_ID}/v1/manager-qa.json`)),
        /ENOENT/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  }
});
