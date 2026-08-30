import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  FICTION_CONTENT_CONTRACT_ID,
  FICTION_CONTENT_CONTRACT_SHA256,
  HERMES_STRUCTURED_ATTEMPT_EVIDENCE_FILENAMES,
  HERMES_STRUCTURED_ATTEMPT_INPUT_ATTESTATION_SCHEMA,
  buildHermesExecutionEnvironment,
  buildHistoricalHermesExecutionEnvironmentDescriptorV2,
  buildHermesExactInputReadManifest,
  buildHermesStructuredAttemptInputAttestation,
  extractHermesContextLimitEntry,
  loadHermesAuthAdapterPlanningEvidence,
  loadHermesBinaryRuntimeEvidence,
  loadHermesExactInputEvidence,
  loadHermesExactInputPluginPlanningEvidence,
  loadHermesRuntimeEvidence,
  measureHermesExactInputTranscript,
  planHermesStructuredContextBudget,
  resolveHermesDelegatedWrapperTarget,
  runHermesStructuredAttempt,
  validateHermesStructuredAttemptEvidenceFileNames,
  validateHermesProfileRuntime,
  validateHermesStructuredAttemptInputAttestation,
  validateHermesStructuredReceipt,
  validateHermesStructuredTrace,
  validateHermesExactInputTrace,
  validateHermesExactInputReadCapability,
} from "../tools/genre-soul-hermes-run-lib.mjs";

const execFileAsync = promisify(execFile);

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function structuredAttemptInputAttestationFixture() {
  const profileId = "inkos_test_profile";
  const fixedDigest = (label) => digest(`fixture:${label}`);
  const runtime = {
    runtimeAttestation: "current-attested",
    profileId,
    profileConfigSha256: fixedDigest("profile-config"),
    soulSha256: fixedDigest("soul"),
    contentNeutralContractId: FICTION_CONTENT_CONTRACT_ID,
    contentNeutralContractSha256: FICTION_CONTENT_CONTRACT_SHA256,
    contentNeutralSoulSectionSha256: fixedDigest("content-neutral-section"),
    contextLimit: 272000,
    contextLimitEntrySha256: fixedDigest("context-limit-entry"),
    hermesCommand: join(tmpdir(), "mock-hermes"),
    hermesExecutableSha256: fixedDigest("executable"),
    hermesDelegatedExecutableSha256: fixedDigest("delegated-executable"),
    hermesVersionSha256: fixedDigest("version"),
    hermesImplementationSha256: fixedDigest("implementation"),
    hermesDependencySha256: fixedDigest("dependency"),
    hermesProfileContextSha256: fixedDigest("profile-context"),
    hermesProjectContextSha256: fixedDigest("project-context"),
    hermesRuntimeIdentitySha256: "",
  };
  runtime.hermesRuntimeIdentitySha256 = digest(jsonBytes({
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
  const expectedReads = [{
    path: join(tmpdir(), "bound-input.json"),
    sha256: fixedDigest("bound-input"),
    sizeBytes: 123,
  }];
  return {
    schemaVersion: HERMES_STRUCTURED_ATTEMPT_INPUT_ATTESTATION_SCHEMA,
    role: "profile-synthesis",
    profileHome: join(tmpdir(), "hermes-profile"),
    projectCwd: join(tmpdir(), "firefly-reference-lab"),
    profileId,
    promptSha256: fixedDigest("prompt"),
    inputDigest: fixedDigest("input-digest"),
    inputSha256: digest(jsonBytes(expectedReads.map(({ path, sha256 }) => ({ path, sha256 })))),
    expectedReads,
    outputReserveTokens: 48_000,
    executionEnvironmentSha256: fixedDigest("execution-environment"),
    readCapabilitySha256: fixedDigest("read-capability"),
    runtime,
  };
}

test("validates canonical structured-attempt input attestation bytes and all consumer bindings", () => {
  const fixture = structuredAttemptInputAttestationFixture();
  const canonical = buildHermesStructuredAttemptInputAttestation(fixture);
  const bytes = jsonBytes(canonical);
  const attemptDir = join(tmpdir(), `attempt-20260830000000000-deadbeef-${digest(bytes)}`);
  const validated = validateHermesStructuredAttemptInputAttestation({
    bytes,
    attemptDir,
    expected: canonical,
  });
  assert.deepEqual(validated.value, canonical);
  assert.equal(validated.sha256, digest(bytes));

  const tampered = buildHermesStructuredAttemptInputAttestation({ ...fixture, role: "manager-qa" });
  const tamperedBytes = jsonBytes(tampered);
  assert.throws(() => validateHermesStructuredAttemptInputAttestation({
    bytes: tamperedBytes,
    attemptDir: join(tmpdir(), `attempt-tampered-${digest(tamperedBytes)}`),
    expected: canonical,
  }), /expected binding drifted: role/u);

  assert.throws(() => validateHermesStructuredAttemptInputAttestation({
    bytes,
    attemptDir: join(tmpdir(), `attempt-wrong-${"0".repeat(64)}`),
    expected: canonical,
  }), /directory digest drifted/u);

  assert.throws(() => validateHermesStructuredAttemptInputAttestation({
    bytes,
    attemptDir,
    expected: { expectedReads: [{ ...canonical.expectedReads[0], sizeBytes: 124 }] },
  }), /expected binding drifted: expectedReads/u);
  assert.throws(() => validateHermesStructuredAttemptInputAttestation({
    bytes,
    attemptDir,
    expected: { runtime: { hermesExecutableSha256: "0".repeat(64) } },
  }), /expected runtime drifted: hermesExecutableSha256/u);
  assert.throws(() => validateHermesStructuredAttemptInputAttestation({
    bytes,
    attemptDir,
    expected: { executionEnvironmentSha256: "0".repeat(64) },
  }), /expected binding drifted: executionEnvironmentSha256/u);

  assert.throws(() => validateHermesStructuredAttemptInputAttestation({
    bytes: Buffer.from(JSON.stringify(canonical)),
    attemptDir,
    expected: canonical,
  }), /not canonical JSON/u);
  assert.throws(() => buildHermesStructuredAttemptInputAttestation({
    ...fixture,
    runtime: { ...fixture.runtime, extraRuntimeKey: true },
  }), /runtime keys drifted/u);
  assert.throws(() => buildHermesStructuredAttemptInputAttestation({
    ...fixture,
    inputSha256: "0".repeat(64),
  }), /inputSha256 drifted from expectedReads/u);
});

function configBytes() {
  return Buffer.from(`model:
  provider: openai-codex
  default: gpt-5.6-sol
agent:
  reasoning_effort: high
`);
}

function soulBytes(profileId) {
  return Buffer.from(`# 테스트 Soul

- Profile ID: \`${profileId}\`

## 허구 내용 중립

계약은 \`${FICTION_CONTENT_CONTRACT_ID}\`, SHA-256은 \`${FICTION_CONTENT_CONTRACT_SHA256}\`다.

- 허구 내용은 도덕 승인 여부가 아니라 인물과 장면 인과로 판단한다.

## 실행 경계

읽기 전용 분석만 수행한다.
`);
}

function usage(runId = "20260829_000000_mock") {
  return {
    estimated_cost_usd: 0,
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
}

function traceFixture({ profileId, prompt, soul, path, fileContent, result, runId = "20260829_000000_mock" }) {
  const fileBytes = Buffer.from(fileContent);
  return {
    id: runId,
    model: "gpt-5.6-sol",
    billing_provider: "openai-codex",
    profile_name: profileId,
    end_reason: "agent_close",
    ended_at: 1787932800.125,
    compression_failure_cooldown_until: null,
    compression_failure_error: null,
    compression_fallback_streak: 0,
    compression_ineffective_count: 0,
    input_tokens: 1200,
    output_tokens: 300,
    cache_read_tokens: 400,
    cache_write_tokens: 0,
    reasoning_tokens: 50,
    api_call_count: 2,
    system_prompt: `${soul}\nHermes appended runtime instructions`,
    messages: [
      { role: "user", content: prompt, compacted: 0 },
      {
        role: "assistant",
        finish_reason: "tool_calls",
        compacted: 0,
        tool_calls: [{
          id: "call-read-1",
          function: { name: "firefly_read_source", arguments: JSON.stringify({ inputId: "input-001" }) },
        }],
      },
      {
        role: "tool",
        tool_call_id: "call-read-1",
        compacted: 0,
        content: JSON.stringify({
          schemaVersion: "firefly-hermes-read-result/v2",
          inputId: "input-001",
          sha256: digest(fileBytes),
          sizeBytes: fileBytes.byteLength,
          chunkIndex: 0,
          chunkCount: 1,
          chunkSha256: digest(fileBytes),
          nextInputId: null,
          nextCursor: null,
          content: fileContent,
        }),
      },
      {
        role: "assistant",
        finish_reason: "stop",
        compacted: 0,
        content: JSON.stringify(result),
      },
    ],
  };
}

function readToolDescriptionFixture() {
  return {
    name: "firefly_read_source",
    description: "Read every host-attested Firefly input through a sequential cursor chain. Begin with only input-001, then make exactly one call per turn using the nextInputId and nextCursor returned by the prior result until nextCursor is null. This is the only file-reading capability in the session. It accepts no path, glob, command, offset, or write operation.",
    parameters: {
      type: "object",
      properties: {
        inputId: {
          type: "string",
          pattern: "^input-[0-9]{3}$",
          description: "Opaque ID supplied by the host prompt, for example input-001.",
        },
        cursor: {
          type: "string",
          pattern: "^cursor-[a-f0-9]{64}$",
          description: "Use only the exact nextCursor returned by the preceding call.",
        },
      },
      required: ["inputId"],
      additionalProperties: false,
    },
  };
}

test("validates the real sol/high profile, SOUL, and content-neutral runtime evidence", () => {
  const profileId = "inkos_test_profile";
  const runtime = validateHermesProfileRuntime({
    profileId,
    configBytes: configBytes(),
    soulBytes: soulBytes(profileId),
    contextLimitEntryBytes: Buffer.from("gpt-5.6-sol@https://chatgpt.com/backend-api/codex: 272000"),
  });
  assert.equal(runtime.contextLimit, 272000);
  assert.equal(runtime.contentNeutralContractSha256, FICTION_CONTENT_CONTRACT_SHA256);
  assert.match(runtime.soulSha256, /^[a-f0-9]{64}$/u);

  assert.throws(() => validateHermesProfileRuntime({
    profileId,
    configBytes: Buffer.from("model:\n  provider: mock\n  default: gpt-5.6-sol\nagent:\n  reasoning_effort: high\n"),
    soulBytes: soulBytes(profileId),
    contextLimitEntryBytes: Buffer.from("gpt-5.6-sol@https://chatgpt.com/backend-api/codex: 272000"),
  }), /not gpt-5\.6-sol\/openai-codex\/high/u);

  const commentSpoof = Buffer.from(`model:
  provider: wrong-provider
  default: wrong-model
agent:
  reasoning_effort: low
# provider: openai-codex
# default: gpt-5.6-sol
# reasoning_effort: high
`);
  assert.throws(() => validateHermesProfileRuntime({
    profileId,
    configBytes: commentSpoof,
    soulBytes: soulBytes(profileId),
    contextLimitEntryBytes: Buffer.from("gpt-5.6-sol@https://chatgpt.com/backend-api/codex: 272000"),
  }), /canonical config/u);

  assert.equal(
    extractHermesContextLimitEntry(Buffer.from("context_lengths:\n  gpt-5.6-sol@https://chatgpt.com/backend-api/codex: 272000\n")).toString("utf8"),
    "gpt-5.6-sol@https://chatgpt.com/backend-api/codex: 272000",
  );
  assert.throws(() => extractHermesContextLimitEntry(Buffer.from(
    "context_lengths:\n  gpt-5.6-sol@https://chatgpt.com/backend-api/codex: 272000\n  gpt-5.6-sol@https://chatgpt.com/backend-api/codex: 128000\n",
  )), /exactly one/u);

  assert.throws(() => validateHermesProfileRuntime({
    profileId,
    configBytes: configBytes(),
    soulBytes: Buffer.from(soulBytes(profileId).toString("utf8").replace(FICTION_CONTENT_CONTRACT_SHA256, "0".repeat(64))),
    contextLimitEntryBytes: Buffer.from("gpt-5.6-sol@https://chatgpt.com/backend-api/codex: 272000"),
  }), /content-neutral contract identity drifted/u);
});

test("pure trace validation rejects extra paths, non-read tools, compaction, and result drift", () => {
  const profileId = "inkos_test_profile";
  const prompt = "read one input and return JSON";
  const soul = soulBytes(profileId).toString("utf8");
  const path = "/private/input.txt";
  const result = { schemaVersion: "mock-result/v1", status: "ok" };
  const fileContent = "첫 줄\n둘째 줄\n";
  const trace = traceFixture({ profileId, prompt, soul, path, fileContent: "첫 줄\n둘째 줄\n", result });
  const budget = {
    inputEvidenceBytes: Buffer.byteLength(fileContent),
    outputReserveTokens: 48_000,
  };
  const evidence = validateHermesStructuredTrace({
    trace,
    usage: usage(),
    profileId,
    prompt,
    soulText: soul,
    expectedReadPaths: [path],
    result,
    contextLimit: 272000,
    ...budget,
  });
  assert.equal(evidence.exactReadCount, 1);
  const activeMessages = trace.messages.slice(0, -1);
  assert.equal(evidence.contextInputProxyTokens, Math.ceil((
    Buffer.byteLength(trace.system_prompt)
    + Buffer.byteLength(JSON.stringify(activeMessages))
  ) / 2));
  const duplicateCountedProxy = Math.ceil((
    Buffer.byteLength(trace.system_prompt)
    + Buffer.byteLength(JSON.stringify(trace.messages))
    + Buffer.byteLength(prompt)
    + Buffer.byteLength(fileContent)
  ) / 2);
  assert.notEqual(evidence.contextInputProxyTokens, duplicateCountedProxy);
  assert.equal(evidence.contextOutputReserveTokens, 48_000);
  assert.equal(evidence.contextBudgetUpperBoundTokens, evidence.contextInputProxyTokens + 48_000);

  const codexEnvelope = structuredClone(trace);
  const directArguments = JSON.parse(codexEnvelope.messages[1].tool_calls[0].function.arguments);
  codexEnvelope.messages[1].tool_calls[0].function = {
    name: "tool_call",
    arguments: JSON.stringify({
      name: "firefly_read_source",
      arguments: directArguments,
    }),
  };
  const envelopeEvidence = validateHermesStructuredTrace({
    trace: codexEnvelope,
    usage: usage(),
    profileId,
    prompt,
    soulText: soul,
    expectedReadPaths: [path],
    result,
    contextLimit: 272000,
    ...budget,
  });
  assert.equal(envelopeEvidence.exactReadCount, 1);

  const described = structuredClone(codexEnvelope);
  described.messages.splice(1, 0, {
    role: "assistant",
    finish_reason: "tool_calls",
    compacted: 0,
    tool_calls: [{
      id: "call-describe-read-tool",
      function: {
        name: "tool_describe",
        arguments: JSON.stringify({ name: "firefly_read_source" }),
      },
    }],
  }, {
    role: "tool",
    tool_call_id: "call-describe-read-tool",
    tool_name: "tool_describe",
    compacted: 0,
    content: JSON.stringify(readToolDescriptionFixture()),
  });
  const describedEvidence = validateHermesStructuredTrace({
    trace: described,
    usage: usage(),
    profileId,
    prompt,
    soulText: soul,
    expectedReadPaths: [path],
    result,
    contextLimit: 272000,
    ...budget,
  });
  assert.equal(describedEvidence.exactReadCount, 1);

  const describeWrongTool = structuredClone(described);
  describeWrongTool.messages[1].tool_calls[0].function.arguments = JSON.stringify({ name: "terminal" });
  assert.throws(() => validateHermesStructuredTrace({
    trace: describeWrongTool,
    usage: usage(),
    profileId,
    prompt,
    soulText: soul,
    expectedReadPaths: [path],
    result,
    contextLimit: 272000,
    ...budget,
  }), /describe only the sealed read-only tool once before any source read/u);

  const describeResultDrift = structuredClone(described);
  const driftedDescription = readToolDescriptionFixture();
  driftedDescription.parameters.additionalProperties = true;
  describeResultDrift.messages[2].content = JSON.stringify(driftedDescription);
  assert.throws(() => validateHermesStructuredTrace({
    trace: describeResultDrift,
    usage: usage(),
    profileId,
    prompt,
    soulText: soul,
    expectedReadPaths: [path],
    result,
    contextLimit: 272000,
    ...budget,
  }), /description drifted from the sealed read-only schema/u);

  const describeAfterRead = structuredClone(described);
  const describePair = describeAfterRead.messages.splice(1, 2);
  describeAfterRead.messages.splice(3, 0, ...describePair);
  assert.throws(() => validateHermesStructuredTrace({
    trace: describeAfterRead,
    usage: usage(),
    profileId,
    prompt,
    soulText: soul,
    expectedReadPaths: [path],
    result,
    contextLimit: 272000,
    ...budget,
  }), /describe only the sealed read-only tool once before any source read/u);

  const forbiddenEnvelope = structuredClone(codexEnvelope);
  forbiddenEnvelope.messages[1].tool_calls[0].function.arguments = JSON.stringify({
    name: "terminal",
    arguments: directArguments,
  });
  assert.throws(() => validateHermesStructuredTrace({
    trace: forbiddenEnvelope,
    usage: usage(),
    profileId,
    prompt,
    soulText: soul,
    expectedReadPaths: [path],
    result,
    contextLimit: 272000,
    ...budget,
  }), /forbidden tool/u);

  const widenedEnvelope = structuredClone(codexEnvelope);
  widenedEnvelope.messages[1].tool_calls[0].function.arguments = JSON.stringify({
    name: "firefly_read_source",
    arguments: directArguments,
    approval: "always",
  });
  assert.throws(() => validateHermesStructuredTrace({
    trace: widenedEnvelope,
    usage: usage(),
    profileId,
    prompt,
    soulText: soul,
    expectedReadPaths: [path],
    result,
    contextLimit: 272000,
    ...budget,
  }), /Codex tool-call envelope keys drifted/u);

  const unexpected = structuredClone(trace);
  unexpected.messages[1].tool_calls[0].function.arguments = JSON.stringify({ inputId: "input-002" });
  assert.throws(() => validateHermesStructuredTrace({
    trace: unexpected, usage: usage(), profileId, prompt, soulText: soul, expectedReadPaths: [path], result, contextLimit: 272000, ...budget,
  }), /unexpected inputId/u);

  const forbidden = structuredClone(trace);
  forbidden.messages[1].tool_calls[0].function.name = "terminal";
  assert.throws(() => validateHermesStructuredTrace({
    trace: forbidden, usage: usage(), profileId, prompt, soulText: soul, expectedReadPaths: [path], result, contextLimit: 272000, ...budget,
  }), /forbidden tool/u);

  const compacted = structuredClone(trace);
  compacted.messages[0].compacted = 1;
  assert.throws(() => validateHermesStructuredTrace({
    trace: compacted, usage: usage(), profileId, prompt, soulText: soul, expectedReadPaths: [path], result, contextLimit: 272000, ...budget,
  }), /compacted messages/u);

  assert.throws(() => validateHermesStructuredTrace({
    trace, usage: usage(), profileId, prompt, soulText: soul, expectedReadPaths: [path], result: { status: "drifted" }, contextLimit: 272000, ...budget,
  }), /result drifted/u);

  const driftedTotal = usage();
  driftedTotal.total_tokens += 1;
  assert.throws(() => validateHermesStructuredTrace({
    trace, usage: driftedTotal, profileId, prompt, soulText: soul, expectedReadPaths: [path], result, contextLimit: 272000, ...budget,
  }), /usage total is not bound/u);

  const cacheHeavyUsage = usage();
  cacheHeavyUsage.cache_read_tokens = 2_000_000;
  cacheHeavyUsage.total_tokens = cacheHeavyUsage.input_tokens + cacheHeavyUsage.output_tokens
    + cacheHeavyUsage.cache_read_tokens + cacheHeavyUsage.cache_write_tokens;
  const cacheHeavyTrace = structuredClone(trace);
  cacheHeavyTrace.cache_read_tokens = cacheHeavyUsage.cache_read_tokens;
  const cacheHeavy = validateHermesStructuredTrace({
    trace: cacheHeavyTrace,
    usage: cacheHeavyUsage,
    profileId,
    prompt,
    soulText: soul,
    expectedReadPaths: [path],
    result,
    contextLimit: 272000,
    ...budget,
  });
  assert.equal(cacheHeavy.contextBudgetUpperBoundTokens, evidence.contextBudgetUpperBoundTokens);

  assert.throws(() => validateHermesStructuredTrace({
    trace,
    usage: usage(),
    profileId,
    prompt,
    soulText: soul,
    expectedReadPaths: [path],
    result,
    contextLimit: 272000,
    inputEvidenceBytes: Buffer.byteLength(fileContent),
    outputReserveTokens: 299,
  }), /exceeded its bound reserve/u);

  assert.throws(() => validateHermesStructuredTrace({
    trace,
    usage: usage(),
    profileId,
    prompt,
    soulText: soul,
    expectedReadPaths: [path],
    result,
    contextLimit: evidence.contextBudgetUpperBoundTokens,
    ...budget,
  }), /context boundary failed/u);
});

test("public exact-input APIs bind opaque IDs to complete UTF-8 result bytes", async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "hermes-exact-input-api-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const inputPath = join(root, "source.txt");
  const content = "경로는 모델 인자가 아니다.\n두 번째 줄.\n";
  await writeFile(inputPath, content);
  const inputDigest = digest("public-exact-input-fixture");
  const evidence = await loadHermesExactInputEvidence([inputPath], inputDigest);
  assert.deepEqual(buildHermesExactInputReadManifest(evidence.files), {
    schemaVersion: "firefly-hermes-read-manifest/v1",
    inputs: [{
      inputId: "input-001",
      path: inputPath,
      sha256: digest(content),
      sizeBytes: Buffer.byteLength(content),
    }],
  });
  const trace = traceFixture({
    profileId: "inkos_test_profile",
    prompt: "read input-001",
    soul: soulBytes("inkos_test_profile").toString("utf8"),
    path: inputPath,
    fileContent: content,
    result: { schemaVersion: "mock-result/v1", status: "ok" },
  });
  assert.deepEqual(await validateHermesExactInputTrace({ trace, expectedFiles: evidence.files }), {
    exactReadCount: 1,
    exactReadSha256s: [digest(content)],
  });
  const pathArgument = structuredClone(trace);
  pathArgument.messages[1].tool_calls[0].function.arguments = JSON.stringify({ path: inputPath });
  await assert.rejects(
    validateHermesExactInputTrace({ trace: pathArgument, expectedFiles: evidence.files }),
    /arguments must contain only inputId and an optional cursor/u,
  );
  const partial = structuredClone(trace);
  partial.messages[2].content = JSON.stringify({
    ...JSON.parse(partial.messages[2].content),
    content: content.slice(0, -2),
  });
  await assert.rejects(
    validateHermesExactInputTrace({ trace: partial, expectedFiles: evidence.files }),
    /result binding drifted/u,
  );
  const chunkedPath = join(root, "chunked-result.txt");
  await writeFile(chunkedPath, "\u0000".repeat(800_000));
  const chunkedEvidence = await loadHermesExactInputEvidence([chunkedPath], inputDigest);
  assert.ok(chunkedEvidence.files[0].chunkCount > 1);
  const oversizedPath = join(root, "oversized-source.txt");
  await writeFile(oversizedPath, Buffer.alloc(4_500_001, 0x61));
  await assert.rejects(
    loadHermesExactInputEvidence([oversizedPath], inputDigest),
    /exceeds the reader source boundary/u,
  );
  const linkedPath = join(root, "linked-input.txt");
  await symlink(inputPath, linkedPath, "file");
  await assert.rejects(
    loadHermesExactInputEvidence([linkedPath], inputDigest),
    /symbolic-link component/u,
  );
});

test("in-memory exact-input transcript measurement matches file evidence for ordered mixed UTF-8 inputs", async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "hermes-transcript-measurement-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const inputBuffers = [
    Buffer.from("한글, quote=\", slash=\\\\, newline=\n, emoji=😀, nul=\u0000, 끝\n", "utf8"),
    Buffer.alloc(0),
    Buffer.from("第二入力と café\r\n", "utf8"),
  ];
  const inputPaths = inputBuffers.map((_, index) => join(root, `source-${index + 1}.txt`));
  await Promise.all(inputPaths.map((path, index) => writeFile(path, inputBuffers[index])));
  const measurement = measureHermesExactInputTranscript(inputBuffers);
  const evidence = await loadHermesExactInputEvidence(inputPaths, digest("ordered-mixed-inputs"));
  assert.equal(measurement.schemaVersion, "hermes-exact-input-transcript-measurement/v1");
  assert.deepEqual(
    evidence.files.map(({ path: _path, ...file }) => file),
    measurement.files,
  );
  assert.equal(evidence.totalBytes, measurement.totalBytes);
  assert.equal(evidence.readTranscriptProxyBytes, measurement.readTranscriptProxyBytes);
  assert.equal(
    measurement.contextProxyTokens,
    Math.ceil(measurement.readTranscriptProxyBytes / 2),
  );
  assert.deepEqual(measurement.files.map((file) => file.inputId), ["input-001", "input-002", "input-003"]);
  assert.equal(measurement.files[1].sizeBytes, 0);
  assert.equal(measurement.files[1].chunkCount, 1);
  assert.throws(
    () => measureHermesExactInputTranscript([]),
    /requires a non-empty Buffer array/u,
  );
  assert.throws(
    () => measureHermesExactInputTranscript([new Uint8Array([0x61])]),
    /must be a Buffer/u,
  );
  assert.throws(
    () => measureHermesExactInputTranscript([Buffer.from([0xc3, 0x28])]),
    /must be valid UTF-8/u,
  );
  assert.throws(
    () => measureHermesExactInputTranscript([Buffer.alloc(4_500_001, 0x61)]),
    /exceeds the reader source boundary/u,
  );
});

test("structured context planning uses the generic preflight formula and rejects equality", () => {
  const transcript = measureHermesExactInputTranscript([
    Buffer.from("한글 \\\\ \" 😀 \u0000\n", "utf8"),
    Buffer.from("second input", "utf8"),
  ]);
  const options = {
    profilePromptContextBytes: 1_237,
    pluginContextBytes: 2_345,
    prompt: "Unicode prompt: 분석 😀",
    readTranscriptProxyBytes: transcript.readTranscriptProxyBytes,
    outputReserveTokens: 48_000,
    contextLimit: 272_000,
  };
  const plan = planHermesStructuredContextBudget(options);
  const expectedInputTokens = 16_384 + Math.ceil((
    options.profilePromptContextBytes
    + options.pluginContextBytes
    + Buffer.byteLength(options.prompt, "utf8")
    + options.readTranscriptProxyBytes
  ) / 2);
  assert.deepEqual(plan, {
    schemaVersion: "hermes-structured-context-budget/v1",
    contextProxyBytesPerToken: 2,
    staticPromptReserveTokens: 16_384,
    profilePromptContextBytes: options.profilePromptContextBytes,
    pluginContextBytes: options.pluginContextBytes,
    promptSizeBytes: Buffer.byteLength(options.prompt, "utf8"),
    readTranscriptProxyBytes: options.readTranscriptProxyBytes,
    contextInputProxyTokens: expectedInputTokens,
    outputReserveTokens: options.outputReserveTokens,
    preflightBudgetTokens: expectedInputTokens + options.outputReserveTokens,
    contextLimit: options.contextLimit,
    fits: true,
  });
  const equalBoundary = planHermesStructuredContextBudget({
    ...options,
    contextLimit: plan.preflightBudgetTokens,
  });
  assert.equal(equalBoundary.preflightBudgetTokens, equalBoundary.contextLimit);
  assert.equal(equalBoundary.fits, false);
  assert.equal(planHermesStructuredContextBudget({
    ...options,
    contextLimit: plan.preflightBudgetTokens + 1,
  }).fits, true);
});

test("exact-input plugin planning evidence binds the canonical three-file set", async () => {
  const evidence = await loadHermesExactInputPluginPlanningEvidence();
  assert.equal(evidence.schemaVersion, "hermes-exact-input-plugin-planning-evidence/v1");
  assert.deepEqual(evidence.files.map((file) => file.name), ["__init__.py", "plugin.yaml", "reader.py"]);
  assert.equal(
    evidence.totalBytes,
    evidence.files.reduce((total, file) => total + file.sizeBytes, 0),
  );
  assert.equal(evidence.sha256, digest(jsonBytes({
    schemaVersion: evidence.schemaVersion,
    files: evidence.files,
    totalBytes: evidence.totalBytes,
  })));
});

test("allows only the capsule-owned bundled plugin discovery root", { concurrency: false }, async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "hermes-bundled-plugin-env-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const profileHome = join(root, "hermes", "profiles", "inkos_test_profile");
  const projectCwd = join(root, "workspace");
  const bundledPluginsPath = join(root, "hermes-bundled-plugins");
  const previous = process.env.HERMES_BUNDLED_PLUGINS;
  try {
    process.env.HERMES_BUNDLED_PLUGINS = "/tmp/hostile-bundled-plugins";
    const sourceEnvironment = buildHermesExecutionEnvironment({ profileHome, projectCwd });
    assert.equal(sourceEnvironment.env.HERMES_BUNDLED_PLUGINS, undefined);
    const capsuleEnvironment = buildHermesExecutionEnvironment({
      profileHome,
      projectCwd,
      bundledPluginsPath,
    });
    assert.equal(capsuleEnvironment.env.HERMES_BUNDLED_PLUGINS, bundledPluginsPath);
    assert.equal(capsuleEnvironment.descriptor.bundledPluginsPath, bundledPluginsPath);
    assert.throws(() => buildHermesExecutionEnvironment({
      profileHome,
      projectCwd,
      bundledPluginsPath: join(root, "arbitrary-plugins"),
    }), /escaped the ephemeral capsule boundary/u);
  } finally {
    if (previous === undefined) delete process.env.HERMES_BUNDLED_PLUGINS;
    else process.env.HERMES_BUNDLED_PLUGINS = previous;
  }
});

test("reconstructs the historical v2 base descriptor without weakening current execution sanitization", async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "hermes-historical-base-env-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const profileHome = join(root, "profiles", "inkos_test_profile");
  const projectCwd = join(root, "workspace");
  const current = buildHermesExecutionEnvironment({ profileHome, projectCwd });
  const historical = buildHistoricalHermesExecutionEnvironmentDescriptorV2({
    profileHome,
    projectCwd,
  });
  const expectedHistoricalDescriptor = {
    profileHome,
    projectCwd,
    contextCachePath: join(dirname(dirname(profileHome)), "context_length_cache.yaml"),
    terminalCwd: projectCwd,
    terminalEnvironment: "local",
    pythonDontWriteBytecode: "1",
    gitOptionalLocks: "0",
    pathSha256: digest(Buffer.from(process.env.PATH ?? "")),
    homeSha256: digest(Buffer.from(process.env.HOME ?? "")),
    configuredTimeZone: (process.env.TZ ?? "").trim() || null,
    canonicalOverrideKeys: ["HERMES_CONTEXT_CACHE_PATH", "HERMES_HOME", "TERMINAL_CWD", "TERMINAL_ENV"],
    removedDynamicPrefixes: [
      "ANTHROPIC_", "CODEX_", "DYLD_", "GIT_", "HERMES_", "OPENAI_", "OPENROUTER_",
      "PYTHON", "TERMINAL_", "_CODEX_", "_HERMES_",
    ],
    removedProxyVariablesCaseInsensitive: ["ALL_PROXY", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY"],
    removedExactVariables: [
      "AWS_CA_BUNDLE", "BASH_ENV", "CURL_CA_BUNDLE", "DENO_CERT", "ENV",
      "GRPC_DEFAULT_SSL_ROOTS_FILE_PATH", "LD_LIBRARY_PATH", "LD_PRELOAD",
      "NODE_EXTRA_CA_CERTS", "NODE_OPTIONS", "NODE_PATH", "NPM_CONFIG_CAFILE",
      "OPENSSL_CONF", "PIP_CERT", "REQUESTS_CA_BUNDLE", "SSL_CERT_DIR", "SSL_CERT_FILE",
    ].sort(),
  };
  assert.equal(current.descriptor.removedDynamicPrefixes.includes("FIREFLY_HERMES_"), true);
  assert.deepEqual(historical.descriptor, expectedHistoricalDescriptor);
  assert.equal(historical.descriptorSha256, digest(jsonBytes(expectedHistoricalDescriptor)));
  assert.equal(Object.hasOwn(historical, "env"), false);
  assert.notEqual(historical.descriptorSha256, current.descriptorSha256);
});

test("the installed plugin API delivers a live-size deterministic cursor chain inline", async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "hermes-chunked-reader-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const inputPath = join(root, "input.txt");
  const manifestPath = join(root, "manifest.json");
  const unit = "재벌의 압박과 보상🚀\\\"\\\\\n";
  const targetBytes = 377_857;
  const unitBytes = Buffer.byteLength(unit);
  let content = unit.repeat(Math.floor(targetBytes / unitBytes));
  content += "x".repeat(targetBytes - Buffer.byteLength(content));
  assert.equal(Buffer.byteLength(content), targetBytes);
  await writeFile(inputPath, content);
  const manifestBytes = jsonBytes({
    schemaVersion: "firefly-hermes-read-manifest/v1",
    inputs: [{
      inputId: "input-001",
      path: inputPath,
      sha256: digest(Buffer.from(content)),
      sizeBytes: targetBytes,
    }],
  });
  await writeFile(manifestPath, manifestBytes);
  const pluginRoot = fileURLToPath(new URL("../tools/hermes-plugins/firefly-source-read", import.meta.url));
  const python = String.raw`
import importlib.util, json, os, sys
root = sys.argv[1]
spec = importlib.util.spec_from_file_location(
    "firefly_source_read", os.path.join(root, "__init__.py"),
    submodule_search_locations=[root],
)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
class Context:
    def register_tool(self, name, toolset, schema, handler, check_fn=None,
                      requires_env=None, is_async=False, description="", emoji="", override=False):
        self.registration = (name, toolset, schema, handler)
ctx = Context()
module.register(ctx)
name, toolset, schema, handler = ctx.registration
assert name == "firefly_read_source" and toolset == "firefly-source-read"
args = {"inputId": "input-001"}
payloads = []
arguments = []
while True:
    arguments.append(args)
    raw = handler(args)
    payload = json.loads(raw)
    assert len(raw) <= 80000
    payloads.append(raw)
    if payload["nextCursor"] is None:
        break
    args = {"inputId": payload["nextInputId"], "cursor": payload["nextCursor"]}
print(json.dumps({"arguments": arguments, "payloads": payloads}, ensure_ascii=False, separators=(",", ":")))
`;
  const executed = await execFileAsync("python3", ["-c", python, pluginRoot], {
    env: {
      ...process.env,
      FIREFLY_READ_MANIFEST: manifestPath,
      FIREFLY_READ_MANIFEST_SHA256: digest(manifestBytes),
      FIREFLY_HERMES_AUTH_ADAPTER_READY: "hermes-global-auth-store-adapter/v1",
      FIREFLY_HERMES_CAPSULE_HOME: root,
      HERMES_HOME: root,
      PYTHONDONTWRITEBYTECODE: "1",
    },
    maxBuffer: 4 * 1024 * 1024,
  });
  const observed = JSON.parse(executed.stdout);
  assert.ok(observed.payloads.length > 1);
  assert.ok(observed.payloads.every((raw) => Array.from(raw).length <= 80_000));
  const trace = {
    messages: [
      { role: "user", content: "read the complete cursor chain" },
      ...observed.payloads.flatMap((raw, index) => {
        const callId = `call-${index + 1}`;
        return [{
          role: "assistant",
          finish_reason: "tool_calls",
          tool_calls: [{
            id: callId,
            function: { name: "firefly_read_source", arguments: JSON.stringify(observed.arguments[index]) },
          }],
        }, {
          role: "tool",
          tool_call_id: callId,
          content: raw,
        }];
      }),
      { role: "assistant", finish_reason: "stop", content: "{}" },
    ],
  };
  const evidence = await loadHermesExactInputEvidence([inputPath], digest("live-size-chunk-fixture"));
  assert.equal(evidence.files[0].chunkCount, observed.payloads.length);
  assert.ok(evidence.readTranscriptProxyBytes > targetBytes);
  assert.deepEqual(await validateHermesExactInputTrace({ trace, expectedFiles: evidence.files }), {
    exactReadCount: 1,
    exactReadSha256s: [digest(Buffer.from(content))],
  });

  const resegmented = structuredClone(trace);
  const firstPayload = JSON.parse(resegmented.messages[2].content);
  const secondPayload = JSON.parse(resegmented.messages[4].content);
  const moved = Array.from(secondPayload.content)[0];
  firstPayload.content += moved;
  secondPayload.content = Array.from(secondPayload.content).slice(1).join("");
  firstPayload.chunkSha256 = digest(Buffer.from(firstPayload.content));
  secondPayload.chunkSha256 = digest(Buffer.from(secondPayload.content));
  resegmented.messages[2].content = JSON.stringify(firstPayload);
  resegmented.messages[4].content = JSON.stringify(secondPayload);
  await assert.rejects(
    validateHermesExactInputTrace({ trace: resegmented, expectedFiles: evidence.files }),
    /result binding drifted/u,
  );

  const missing = structuredClone(trace);
  missing.messages.splice(3, 2);
  await assert.rejects(
    validateHermesExactInputTrace({ trace: missing, expectedFiles: evidence.files }),
    /cursor chain drifted|message grammar drifted|ended before/u,
  );

  const parallel = structuredClone(trace);
  parallel.messages[1].tool_calls.push(parallel.messages[3].tool_calls[0]);
  await assert.rejects(
    validateHermesExactInputTrace({ trace: parallel, expectedFiles: evidence.files }),
    /one sequential tool call/u,
  );
});

test("the attested delegated Python activates the auth adapter and rejects unsafe stores", { concurrency: false }, async (t) => {
  let wrapperPath;
  try {
    wrapperPath = (await execFileAsync("which", ["hermes"])).stdout.trim();
  } catch {
    t.skip("Hermes is not installed in PATH.");
    return;
  }
  const wrapperBytes = await readFile(wrapperPath);
  const delegatedMatch = /\bexec\s+["']([^"']+)["']\s+["']?\$@["']?/u.exec(wrapperBytes.toString("utf8"));
  const delegatedHermes = delegatedMatch?.[1] ?? wrapperPath;
  const delegatedPython = join(dirname(delegatedHermes), "python");
  const runtime = await loadHermesBinaryRuntimeEvidence(wrapperPath);
  assert.equal(digest(await readFile(delegatedHermes)), runtime.hermesDelegatedExecutableSha256);

  const root = await realpath(await mkdtemp(join(tmpdir(), "hermes-auth-adapter-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sourceRoot = join(root, "source-hermes");
  const sourceAuthPath = join(sourceRoot, "auth.json");
  const capsuleHome = join(root, "capsule", "hermes", "profiles", "inkos_test_profile");
  const fakeHome = join(root, "home");
  const decoyProjectEnv = join(root, "decoy.env");
  const adapterSourceRoot = fileURLToPath(new URL("../tools/hermes-runtime/firefly-auth-store", import.meta.url));
  const adapterRoot = join(root, "hermes-auth-adapter");
  await Promise.all([
    mkdir(sourceRoot, { recursive: true, mode: 0o700 }),
    mkdir(capsuleHome, { recursive: true, mode: 0o700 }),
    mkdir(fakeHome, { recursive: true, mode: 0o700 }),
    mkdir(adapterRoot, { mode: 0o700 }),
  ]);
  const adapterPath = join(adapterRoot, "sitecustomize.py");
  await writeFile(
    adapterPath,
    await readFile(join(adapterSourceRoot, "sitecustomize.py")),
    { mode: 0o600 },
  );
  await Promise.all([
    chmod(sourceRoot, 0o700),
    chmod(adapterRoot, 0o700),
    chmod(adapterPath, 0o600),
  ]);
  const jwtPart = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const accessCanary = `${jwtPart({ alg: "none", typ: "JWT" })}.${jwtPart({
    exp: 4_102_444_800,
    "https://api.openai.com/auth": { chatgpt_account_id: "firefly-test-account" },
  })}.signature-canary`;
  const refreshCanary = "refresh-token-must-never-be-printed";
  const sourceAuthBytes = jsonBytes({
    version: 1,
    providers: {},
    credential_pool: {
      "openai-codex": [{
        id: "source1",
        label: "firefly-source-canary",
        auth_type: "oauth",
        priority: 0,
        source: "manual:device_code",
        access_token: accessCanary,
        refresh_token: refreshCanary,
        last_status: null,
        last_status_at: null,
        last_error_code: null,
        last_error_reason: null,
        last_error_message: null,
        last_error_reset_at: null,
        request_count: 0,
      }],
    },
  });
  await Promise.all([
    writeFile(sourceAuthPath, sourceAuthBytes, { mode: 0o600 }),
    writeFile(join(capsuleHome, "config.yaml"), configBytes(), { mode: 0o600 }),
    writeFile(join(capsuleHome, "SOUL.md"), soulBytes("inkos_test_profile"), { mode: 0o600 }),
    writeFile(decoyProjectEnv, "HERMES_HOME=/tmp/forbidden-escape\nOPENAI_API_KEY=forbidden\n", { mode: 0o600 }),
  ]);
  const adapterEnvironment = {
    ...process.env,
    HOME: fakeHome,
    HERMES_HOME: capsuleHome,
    FIREFLY_HERMES_AUTH_STORE: sourceAuthPath,
    FIREFLY_HERMES_AUTH_ADAPTER_CONTRACT: "hermes-global-auth-store-adapter/v1",
    FIREFLY_HERMES_AUTH_ADAPTER_READY: "forged-parent-ready",
    FIREFLY_HERMES_CAPSULE_HOME: capsuleHome,
    PYTHONPATH: adapterRoot,
    PYTHONDONTWRITEBYTECODE: "1",
  };
  const probe = String.raw`
import json, os
from pathlib import Path
import agent.credential_pool as credential_pool
import hermes_cli.auth as auth
import hermes_cli.env_loader as env_loader
import hermes_cli.main as hermes_main
from hermes_cli.profiles import get_active_profile_name
store = Path(os.environ["FIREFLY_HERMES_AUTH_STORE"])
payload = json.loads(store.read_text(encoding="utf-8"))
expected = payload["credential_pool"]["openai-codex"][0]
assert os.environ["FIREFLY_HERMES_AUTH_ADAPTER_READY"] == "hermes-global-auth-store-adapter/v1"
assert auth._auth_file_path() == store
assert auth._global_auth_file_path() is None
assert get_active_profile_name() == "inkos_test_profile"
assert env_loader.load_hermes_dotenv(project_env=Path(${JSON.stringify(decoyProjectEnv)})) == []
assert hermes_main.load_hermes_dotenv is env_loader.load_hermes_dotenv
assert credential_pool.auth_mod is auth
assert credential_pool._load_auth_store is auth._load_auth_store
assert credential_pool.read_credential_pool is auth.read_credential_pool
assert credential_pool.write_credential_pool is auth.write_credential_pool
assert os.environ["HERMES_HOME"] == ${JSON.stringify(capsuleHome)}
pool = credential_pool.load_pool("openai-codex")
entry = pool.peek()
assert entry is not None and entry.label == "firefly-source-canary"
creds = auth.resolve_codex_runtime_credentials(refresh_if_expiring=False)
assert creds["api_key"] == expected["access_token"]
assert creds["source"] == "credential_pool"
assert auth._import_codex_cli_tokens() is None
print(json.dumps({"ready": True, "label": entry.label}, separators=(",", ":")))
`;
  const probed = await execFileAsync(delegatedPython, ["-c", probe], {
    env: adapterEnvironment,
    maxBuffer: 1024 * 1024,
  });
  assert.deepEqual(JSON.parse(probed.stdout), { ready: true, label: "firefly-source-canary" });
  assert.equal(probed.stdout.includes(accessCanary), false);
  assert.equal(probed.stdout.includes(refreshCanary), false);
  assert.equal(probed.stderr.includes(accessCanary), false);
  assert.equal(probed.stderr.includes(refreshCanary), false);
  assert.deepEqual(await readFile(sourceAuthPath), sourceAuthBytes);

  const listed = await execFileAsync(delegatedHermes, ["auth", "list", "openai-codex"], {
    env: adapterEnvironment,
    maxBuffer: 1024 * 1024,
  });
  assert.match(listed.stdout, /firefly-source-canary/u);
  assert.equal(listed.stdout.includes(accessCanary), false);
  assert.equal(listed.stdout.includes(refreshCanary), false);
  assert.deepEqual(await readFile(sourceAuthPath), sourceAuthBytes);
  await assert.rejects(lstat(join(capsuleHome, "auth.json")), { code: "ENOENT" });

  const codexHome = join(fakeHome, ".codex");
  const externalDecoy = "external-codex-decoy-must-not-be-imported";
  await mkdir(codexHome, { recursive: true, mode: 0o700 });
  await writeFile(join(codexHome, "auth.json"), jsonBytes({
    tokens: { access_token: externalDecoy, refresh_token: "external-refresh-decoy" },
  }), { mode: 0o600 });
  const emptySourceAuthBytes = jsonBytes({ version: 1, providers: {}, credential_pool: {} });
  await writeFile(sourceAuthPath, emptySourceAuthBytes);
  const noExternalImportProbe = String.raw`
import json, os
from pathlib import Path
import hermes_cli.auth as auth
before = Path(os.environ["FIREFLY_HERMES_AUTH_STORE"]).read_bytes()
try:
    auth.resolve_codex_runtime_credentials(refresh_if_expiring=False)
    raise AssertionError("external Codex credential was imported")
except auth.AuthError:
    pass
assert Path(os.environ["FIREFLY_HERMES_AUTH_STORE"]).read_bytes() == before
print(json.dumps({"externalImportBlocked": True}, separators=(",", ":")))
`;
  const noExternalImport = await execFileAsync(delegatedPython, ["-c", noExternalImportProbe], {
    env: adapterEnvironment,
    maxBuffer: 1024 * 1024,
  });
  assert.deepEqual(JSON.parse(noExternalImport.stdout), { externalImportBlocked: true });
  assert.equal(noExternalImport.stdout.includes(externalDecoy), false);
  assert.deepEqual(await readFile(sourceAuthPath), emptySourceAuthBytes);
  await writeFile(sourceAuthPath, sourceAuthBytes);

  const assertExit78 = async (environment) => {
    await assert.rejects(
      execFileAsync(delegatedPython, ["-c", "print('forbidden-marker')"], { env: environment }),
      (error) => {
        assert.equal(error.code, 78);
        assert.equal(error.stdout.includes("forbidden-marker"), false);
        assert.match(error.stderr, /^Firefly Hermes auth-store adapter failed closed\.\n$/u);
        assert.equal(error.stderr.includes(sourceAuthPath), false);
        assert.equal(error.stderr.includes(refreshCanary), false);
        return true;
      },
    );
  };
  const runManualActivationProbe = async (mutation) => {
    const inactiveEnvironment = { ...adapterEnvironment };
    for (const name of [
      "FIREFLY_HERMES_AUTH_ADAPTER_CONTRACT",
      "FIREFLY_HERMES_AUTH_ADAPTER_READY",
      "FIREFLY_HERMES_AUTH_STORE",
      "FIREFLY_HERMES_CAPSULE_HOME",
      "PYTHONPATH",
    ]) delete inactiveEnvironment[name];
    const manualProbe = String.raw`
import importlib.util, os
${mutation}
os.environ["FIREFLY_HERMES_AUTH_STORE"] = ${JSON.stringify(sourceAuthPath)}
os.environ["FIREFLY_HERMES_AUTH_ADAPTER_CONTRACT"] = "hermes-global-auth-store-adapter/v1"
os.environ["FIREFLY_HERMES_CAPSULE_HOME"] = ${JSON.stringify(capsuleHome)}
os.environ["PYTHONPATH"] = ${JSON.stringify(adapterRoot)}
spec = importlib.util.spec_from_file_location(
    "firefly_sitecustomize_probe",
    ${JSON.stringify(join(adapterRoot, "sitecustomize.py"))},
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
print("forbidden-marker")
`;
    await assert.rejects(
      execFileAsync(delegatedPython, ["-c", manualProbe], { env: inactiveEnvironment }),
      (error) => {
        assert.equal(error.code, 78);
        assert.equal(error.stdout.includes("forbidden-marker"), false);
        assert.match(error.stderr, /^Firefly Hermes auth-store adapter failed closed\.\n$/u);
        return true;
      },
    );
  };

  await runManualActivationProbe("import hermes_cli.auth as auth\nauth._auth_file_path = None");
  await runManualActivationProbe(String.raw`
import hermes_cli.auth as auth
def bypassed_load_auth_store(_auth_file=None):
    _auth_file_path
    return {"version": 1, "providers": {}}
auth._load_auth_store = bypassed_load_auth_store
`);
  await runManualActivationProbe(String.raw`
import agent.credential_pool as credential_pool
credential_pool._load_auth_store = lambda _auth_file=None: {"version": 1, "providers": {}}
`);
  await runManualActivationProbe(String.raw`
import sys, types
import hermes_cli.env_loader as env_loader
stale_main = types.ModuleType("hermes_cli.main")
stale_main.load_hermes_dotenv = env_loader.load_hermes_dotenv
sys.modules["hermes_cli.main"] = stale_main
`);

  const pythonPathSeparator = process.platform === "win32" ? ";" : ":";
  await assertExit78({
    ...adapterEnvironment,
    PYTHONPATH: `${adapterRoot}${pythonPathSeparator}${fakeHome}`,
  });
  await assertExit78({ ...adapterEnvironment, FIREFLY_HERMES_AUTH_ADAPTER_CONTRACT: "wrong-contract" });
  await chmod(adapterPath, 0o644);
  await assertExit78(adapterEnvironment);
  await chmod(adapterPath, 0o600);
  const adapterHardLinkPath = join(root, "adapter-hardlink.py");
  await link(adapterPath, adapterHardLinkPath);
  await assertExit78(adapterEnvironment);
  await unlink(adapterHardLinkPath);
  await chmod(sourceAuthPath, 0o644);
  await assertExit78(adapterEnvironment);
  await chmod(sourceAuthPath, 0o600);
  const hardLinkPath = join(sourceRoot, "auth-hardlink.json");
  await link(sourceAuthPath, hardLinkPath);
  await assertExit78(adapterEnvironment);
  await unlink(hardLinkPath);
  const realAuthPath = join(sourceRoot, "auth-real.json");
  await rename(sourceAuthPath, realAuthPath);
  await symlink(realAuthPath, sourceAuthPath);
  await assertExit78(adapterEnvironment);
  await unlink(sourceAuthPath);
  await rename(realAuthPath, sourceAuthPath);
});

test("binds the delegated Hermes implementation behind a stable wrapper", async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "hermes-runtime-fingerprint-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const installRoot = join(root, "install");
  const delegated = join(installRoot, "venv/bin/hermes");
  const venvPython = join(installRoot, "venv/bin/python");
  const basePython = join(root, "base-python/bin/python3.11");
  const standardLibraryFile = join(root, "base-python/lib/python3.11/os.py");
  const sitePackage = join(installRoot, "venv/lib/python3.11/site-packages/mock_dependency/__init__.py");
  const wrapper = join(root, "hermes");
  await mkdir(join(installRoot, "venv/bin"), { recursive: true });
  await mkdir(join(installRoot, "venv/lib/python3.11/site-packages/mock_dependency"), { recursive: true });
  await mkdir(join(root, "base-python/bin"), { recursive: true });
  await mkdir(join(root, "base-python/lib/python3.11"), { recursive: true });
  await writeFile(delegated, "#!/usr/bin/env node\nprocess.stdout.write('delegated-one');\n");
  await writeFile(basePython, "#!/bin/sh\nexit 0\n");
  await chmod(basePython, 0o755);
  await writeFile(standardLibraryFile, "BOUND = 'one'\n");
  await symlink(basePython, venvPython, "file");
  await writeFile(join(installRoot, "venv/pyvenv.cfg"), "home = /bound/base/python\n");
  await writeFile(sitePackage, "VERSION = 'one'\n");
  await writeFile(wrapper, `#!/usr/bin/env bash
if [[ "$1" == "--version" ]]; then
  printf '%s\\n' 'mock-hermes 1.0.0' 'Install directory: ${installRoot}'
else
  exec "${delegated}" "$@"
fi
`);
  await Promise.all([chmod(delegated, 0o755), chmod(wrapper, 0o755)]);

  const first = await loadHermesBinaryRuntimeEvidence(wrapper);
  await writeFile(delegated, "#!/usr/bin/env node\nprocess.stdout.write('delegated-two');\n");
  await chmod(delegated, 0o755);
  const second = await loadHermesBinaryRuntimeEvidence(wrapper);
  assert.equal(first.hermesExecutableSha256, second.hermesExecutableSha256);
  assert.equal(first.hermesVersionSha256, second.hermesVersionSha256);
  assert.notEqual(first.hermesDelegatedExecutableSha256, second.hermesDelegatedExecutableSha256);
  assert.notEqual(first.hermesImplementationSha256, second.hermesImplementationSha256);
  assert.notEqual(first.hermesRuntimeIdentitySha256, second.hermesRuntimeIdentitySha256);

  const dependencyBefore = second;
  await writeFile(sitePackage, "VERSION = 'two'\n");
  const dependencyAfter = await loadHermesBinaryRuntimeEvidence(wrapper);
  assert.equal(dependencyBefore.hermesDelegatedExecutableSha256, dependencyAfter.hermesDelegatedExecutableSha256);
  assert.notEqual(dependencyBefore.hermesDependencySha256, dependencyAfter.hermesDependencySha256);
  assert.notEqual(dependencyBefore.hermesRuntimeIdentitySha256, dependencyAfter.hermesRuntimeIdentitySha256);

  await writeFile(standardLibraryFile, "BOUND = 'two'\n");
  const standardLibraryAfter = await loadHermesBinaryRuntimeEvidence(wrapper);
  assert.notEqual(dependencyAfter.hermesDependencySha256, standardLibraryAfter.hermesDependencySha256);

  const versionProbeState = join(root, "version-probe-state");
  await writeFile(wrapper, `#!/usr/bin/env bash
if [[ "$1" == "--version" ]]; then
  if [[ -e "${versionProbeState}" ]]; then
    printf '%s\\n' '# drift during version probe' >> "${delegated}"
  else
    : > "${versionProbeState}"
  fi
  printf '%s\\n' 'mock-hermes 1.0.0' 'Install directory: ${installRoot}'
else
  exec "${delegated}" "$@"
fi
`);
  await chmod(wrapper, 0o755);
  await assert.rejects(
    loadHermesBinaryRuntimeEvidence(wrapper),
    /changed across hash\/version\/hash attestation/u,
  );
});

test("bypasses only the exact reviewed Hermes environment scrubber wrapper", () => {
  const delegated = "/opt/hermes/venv/bin/hermes";
  const canonical = Buffer.from(`#!/usr/bin/env bash
unset PYTHONPATH
unset PYTHONHOME
exec "${delegated}" "$@"
`);
  assert.equal(resolveHermesDelegatedWrapperTarget(canonical), delegated);
  assert.equal(
    resolveHermesDelegatedWrapperTarget(Buffer.from("#!/usr/bin/env node\nprocess.exit(0);\n")),
    null,
  );

  for (const changed of [
    `#!/usr/bin/env bash
unset PYTHONPATH
unset PYTHONHOME
export HERMES_SECURITY_PRELUDE=required
exec "${delegated}" "$@"
`,
    `#!/usr/bin/env bash
if [[ -x "${delegated}" ]]; then
  exec "${delegated}" "$@"
fi
`,
    "#!/usr/bin/env bash\nunset PYTHONPATH\nunset PYTHONHOME\nexec \"../venv/bin/hermes\" \"$@\"\n",
  ]) {
    assert.throws(
      () => resolveHermesDelegatedWrapperTarget(Buffer.from(changed)),
      /unsupported semantics; refusing to bypass its prelude/u,
    );
  }
});

test("keeps project runtime identity stable across volatile Git/date state and binds policy bytes", { concurrency: false }, async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "hermes-project-context-")));
  const profileId = "inkos_test_profile";
  const profileHome = join(root, "hermes", "profiles", profileId);
  const mockBin = join(root, "mock-hermes");
  const candidatePath = join(root, "analyses", "genre_souls", "candidate.json");
  const previousBin = process.env.HERMES_BIN;
  const previousCache = process.env.HERMES_CONTEXT_CACHE_PATH;
  try {
    await Promise.all([
      mkdir(profileHome, { recursive: true }),
      mkdir(join(root, "analyses", "genre_souls"), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(join(profileHome, "config.yaml"), configBytes()),
      writeFile(join(profileHome, "SOUL.md"), soulBytes(profileId)),
      writeFile(join(root, "hermes", "context_length_cache.yaml"), "context_lengths:\n  gpt-5.6-sol@https://chatgpt.com/backend-api/codex: 272000\n"),
      writeFile(join(root, "notes.txt"), "baseline\n"),
      writeFile(candidatePath, "{\"version\":1}\n"),
      writeFile(mockBin, "#!/bin/sh\nprintf 'mock-hermes 1.0.0\\n'\n"),
    ]);
    await chmod(mockBin, 0o755);
    await execFileAsync("git", ["-C", root, "init", "-q"]);
    await execFileAsync("git", ["-C", root, "config", "user.name", "Hermes Test"]);
    await execFileAsync("git", ["-C", root, "config", "user.email", "hermes-test@example.invalid"]);
    await execFileAsync("git", ["-C", root, "add", "notes.txt", "analyses/genre_souls/candidate.json"]);
    await execFileAsync("git", ["-C", root, "commit", "-qm", "baseline"]);
    process.env.HERMES_BIN = mockBin;
    process.env.HERMES_CONTEXT_CACHE_PATH = "/tmp/ignored-context-cache";

    const load = () => loadHermesRuntimeEvidence(profileHome, profileId, { projectCwd: root });
    const baseline = await load();
    const canonicalEnvironment = buildHermesExecutionEnvironment({ profileHome, projectCwd: root });
    const forgedEnvironment = {
      ...canonicalEnvironment,
      env: {
        ...canonicalEnvironment.env,
        HOME: join(root, "forged-home"),
        XDG_CONFIG_HOME: join(root, "forged-xdg-config"),
      },
    };
    await assert.rejects(
      loadHermesRuntimeEvidence(profileHome, profileId, {
        projectCwd: root,
        executionEnvironment: forgedEnvironment,
      }),
      /execution environment is not canonical/u,
    );
    await writeFile(candidatePath, "{\"version\":2}\n");
    const dirty = await load();
    assert.equal(dirty.hermesProjectContextSha256, baseline.hermesProjectContextSha256);
    assert.equal(dirty.hermesRuntimeIdentitySha256, baseline.hermesRuntimeIdentitySha256);

    await execFileAsync("git", ["-C", root, "add", "analyses/genre_souls/candidate.json"]);
    const staged = await load();
    assert.equal(staged.hermesProjectContextSha256, baseline.hermesProjectContextSha256);
    assert.equal(staged.hermesRuntimeIdentitySha256, baseline.hermesRuntimeIdentitySha256);
    await execFileAsync("git", ["-C", root, "commit", "-qm", "tracked output update"]);
    await execFileAsync("git", ["-C", root, "commit", "--allow-empty", "-qm", "head only"]);
    const movedHead = await load();
    assert.equal(movedHead.hermesProjectContextSha256, baseline.hermesProjectContextSha256);
    assert.equal(movedHead.hermesRuntimeIdentitySha256, baseline.hermesRuntimeIdentitySha256);

    const NativeDate = globalThis.Date;
    globalThis.Date = class FixedFutureDate extends NativeDate {
      constructor(...args) {
        super(...(args.length > 0 ? args : ["2099-12-31T23:59:59.000Z"]));
      }

      static now() {
        return NativeDate.parse("2099-12-31T23:59:59.000Z");
      }
    };
    try {
      const futureDate = await load();
      assert.equal(futureDate.hermesProjectContextSha256, baseline.hermesProjectContextSha256);
      assert.equal(futureDate.hermesRuntimeIdentitySha256, baseline.hermesRuntimeIdentitySha256);
    } finally {
      globalThis.Date = NativeDate;
    }

    await writeFile(join(root, "AGENTS.md"), "first policy bytes\n");
    const firstPolicy = await load();
    assert.notEqual(firstPolicy.hermesProjectContextSha256, baseline.hermesProjectContextSha256);
    assert.notEqual(firstPolicy.hermesRuntimeIdentitySha256, baseline.hermesRuntimeIdentitySha256);
    await writeFile(join(root, "AGENTS.md"), "second policy bytes\n");
    const secondPolicy = await load();
    assert.notEqual(secondPolicy.hermesProjectContextSha256, firstPolicy.hermesProjectContextSha256);
    assert.notEqual(secondPolicy.hermesRuntimeIdentitySha256, firstPolicy.hermesRuntimeIdentitySha256);
  } finally {
    if (previousBin === undefined) delete process.env.HERMES_BIN;
    else process.env.HERMES_BIN = previousBin;
    if (previousCache === undefined) delete process.env.HERMES_CONTEXT_CACHE_PATH;
    else process.env.HERMES_CONTEXT_CACHE_PATH = previousCache;
    await rm(root, { recursive: true, force: true });
  }
});

test("runs through an injectable mock Hermes binary, seals immutable completion, and reuses it", { concurrency: false }, async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "hermes-structured-run-")));
  const profileId = "inkos_test_profile";
  const profileHome = join(root, "hermes", "profiles", profileId);
  const runRoot = join(root, "run");
  const inputPath = join(root, "input.txt");
  const mockBin = join(root, "mock-hermes.mjs");
  const usageSource = join(root, "mock-usage.json");
  const resultSource = join(root, "mock-result.json");
  const traceSource = join(root, "mock-session.jsonl");
  const invocationLog = join(root, "mock-invocations.log");
  const prompt = "Read the exact file once and return the requested JSON object.";
  const inputText = "첫 줄\n둘째 줄\n";
  const result = { schemaVersion: "mock-result/v1", status: "ok", count: 2 };
  const runId = "20260829_010203_mock";
  const previousBin = process.env.HERMES_BIN;
  const previousUsage = process.env.MOCK_HERMES_USAGE_SOURCE;
  const previousResult = process.env.MOCK_HERMES_RESULT_SOURCE;
  const previousTrace = process.env.MOCK_HERMES_TRACE_SOURCE;
  const previousLog = process.env.MOCK_HERMES_INVOCATION_LOG;
  const previousDelay = process.env.MOCK_HERMES_DELAY_MS;
  const previousVersionDelay = process.env.MOCK_HERMES_VERSION_DELAY_MS;
  const previousExpectedCwd = process.env.MOCK_HERMES_EXPECTED_CWD;
  const previousExpectedCache = process.env.MOCK_HERMES_EXPECTED_CACHE;
  const previousExpectedHome = process.env.MOCK_HERMES_EXPECTED_HOME;
  const previousCapsuleLog = process.env.MOCK_HERMES_CAPSULE_LOG;
  const previousCreateAuth = process.env.MOCK_HERMES_CREATE_AUTH;
  const previousForbiddenRoot = process.env.MOCK_HERMES_FORBIDDEN_ROOT;
  const previousMutateSelf = process.env.MOCK_HERMES_MUTATE_SELF;
  const previousCache = process.env.HERMES_CONTEXT_CACHE_PATH;
  const previousEnvironmentHint = process.env.HERMES_ENVIRONMENT_HINT;
  const previousHermesPlatform = process.env.HERMES_PLATFORM;
  const previousIgnoreRules = process.env.HERMES_IGNORE_RULES;
  const previousTerminalCwd = process.env.TERMINAL_CWD;
  const previousTerminalEnv = process.env.TERMINAL_ENV;
  const hostileEnvironment = {
    ANTHROPIC_MODEL: "must-not-reach-Hermes",
    AWS_CA_BUNDLE: "/tmp/forged-aws-ca.pem",
    CODEX_HOME: "/tmp/forged-codex-home",
    CODEX_MODEL: "forged-model",
    CURL_CA_BUNDLE: "/tmp/forged-curl-ca.pem",
    FIREFLY_HERMES_AUTH_ADAPTER_CONTRACT: "forged-contract",
    FIREFLY_HERMES_AUTH_ADAPTER_READY: "forged-ready",
    FIREFLY_HERMES_AUTH_STORE: "/tmp/forged-auth.json",
    FIREFLY_HERMES_CAPSULE_HOME: "/tmp/forged-capsule-home",
    HERMES_UNEXPECTED_OVERRIDE: "must-not-reach-Hermes",
    HTTPS_PROXY: "http://127.0.0.1:9",
    NODE_EXTRA_CA_CERTS: "/tmp/forged-node-ca.pem",
    NO_PROXY: "example.invalid",
    OPENAI_API_KEY: "forged-openai-key",
    OPENAI_BASE_URL: "https://forged-openai.invalid",
    OPENROUTER_API_KEY: "forged-openrouter-key",
    PYTHONPATH: "/tmp/forged-python-path",
    REQUESTS_CA_BUNDLE: "/tmp/forged-requests-ca.pem",
    SSL_CERT_FILE: "/tmp/forged-ssl-ca.pem",
    TERMINAL_UNEXPECTED_OVERRIDE: "must-not-reach-Hermes",
    _CODEX_DYNAMIC_OVERRIDE: "must-not-reach-Hermes",
    https_proxy: "http://127.0.0.1:10",
    no_proxy: "lowercase.example.invalid",
  };
  const previousHostileEnvironment = Object.fromEntries(
    Object.keys(hostileEnvironment).map((key) => [key, process.env[key]]),
  );
  try {
    await mkdir(profileHome, { recursive: true });
    await chmod(join(root, "hermes"), 0o700);
    await Promise.all([
      writeFile(join(root, "hermes", "auth.json"), "{\"version\":1,\"providers\":{},\"credential_pool\":{}}\n", { mode: 0o600 }),
      writeFile(join(profileHome, "config.yaml"), configBytes()),
      writeFile(join(profileHome, "SOUL.md"), soulBytes(profileId)),
      writeFile(join(root, "hermes", "context_length_cache.yaml"), "context_lengths:\n  gpt-5.6-sol@https://chatgpt.com/backend-api/codex: 272000\n"),
      writeFile(inputPath, inputText),
      writeFile(usageSource, `${JSON.stringify(usage(runId), null, 2)}\n`),
      writeFile(resultSource, `${JSON.stringify(result, null, 2)}\n`),
      writeFile(traceSource, `${JSON.stringify(traceFixture({
        profileId,
        prompt,
        soul: soulBytes(profileId).toString("utf8"),
        path: inputPath,
        fileContent: inputText,
        result,
        runId,
      }))}\n`),
      writeFile(mockBin, `#!/usr/bin/env node
	import { appendFileSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
	import { dirname, join } from "node:path";
	const args = process.argv.slice(2);
	appendFileSync(process.env.MOCK_HERMES_INVOCATION_LOG, args[0] + "\\n");
	if (args[0] === "--version") {
	  const versionDelay = Number(process.env.MOCK_HERMES_VERSION_DELAY_MS ?? 0);
	  if (versionDelay > 0) await new Promise((resolve) => setTimeout(resolve, versionDelay));
	  process.stdout.write("mock-hermes 1.0.0\\n");
		} else if (args[0] === "--oneshot") {
		  const toolsetIndex = args.indexOf("--toolsets");
		  if (toolsetIndex < 0 || args.filter((value) => value === "--toolsets").length !== 1 || args[toolsetIndex + 1] !== "firefly-source-read") throw new Error("exact read-only toolset missing");
		  if (args.includes("--approve-all") || args.includes("--safe-mode") || args.includes("--toolset")) throw new Error("unsafe or ambiguous CLI policy enabled");
		  if (args.filter((value) => value === "--model").length !== 1 || args[args.indexOf("--model") + 1] !== "gpt-5.6-sol") throw new Error("model drifted");
		  if (args.filter((value) => value === "--provider").length !== 1 || args[args.indexOf("--provider") + 1] !== "openai-codex") throw new Error("provider drifted");
		  const hermesKeys = Object.keys(process.env).filter((key) => key.startsWith("HERMES_")).sort();
		  if (JSON.stringify(hermesKeys) !== JSON.stringify(["HERMES_BUNDLED_PLUGINS", "HERMES_CONTEXT_CACHE_PATH", "HERMES_HOME"])) throw new Error("non-canonical HERMES variables leaked: " + hermesKeys.join(","));
		  const terminalKeys = Object.keys(process.env).filter((key) => key.startsWith("TERMINAL_")).sort();
		  if (JSON.stringify(terminalKeys) !== JSON.stringify(["TERMINAL_CWD", "TERMINAL_ENV"])) throw new Error("non-canonical TERMINAL variables leaked: " + terminalKeys.join(","));
		  const executionRoot = dirname(dirname(dirname(process.env.HERMES_HOME)));
		  if (process.env.HERMES_HOME.startsWith(process.env.MOCK_HERMES_FORBIDDEN_ROOT)) throw new Error("HERMES_HOME persisted under the source/run tree");
		  if (process.env.TERMINAL_CWD !== join(executionRoot, "workspace")) throw new Error("TERMINAL_CWD drifted");
		  if (process.env.TERMINAL_ENV !== "local") throw new Error("TERMINAL_ENV drifted");
		  if (process.env.HERMES_CONTEXT_CACHE_PATH !== join(executionRoot, "hermes", "context_length_cache.yaml")) throw new Error("context cache drifted");
		  if (process.env.HERMES_BUNDLED_PLUGINS !== join(executionRoot, "hermes-bundled-plugins")) throw new Error("bundled plugin discovery root drifted");
		  if (process.env.FIREFLY_READ_MANIFEST !== join(executionRoot, "input-manifest.json")) throw new Error("read manifest path drifted");
		  if (!/^[a-f0-9]{64}$/.test(process.env.FIREFLY_READ_MANIFEST_SHA256 ?? "")) throw new Error("read manifest digest missing");
		  if (process.env.FIREFLY_HERMES_AUTH_ADAPTER_CONTRACT !== "hermes-global-auth-store-adapter/v1") throw new Error("auth adapter contract drifted");
		  if (process.env.FIREFLY_HERMES_AUTH_ADAPTER_READY !== undefined) throw new Error("host forged auth adapter readiness");
		  if (process.env.FIREFLY_HERMES_AUTH_STORE !== join(process.env.MOCK_HERMES_FORBIDDEN_ROOT, "hermes", "auth.json")) throw new Error("authoritative auth store drifted");
		  if (process.env.FIREFLY_HERMES_CAPSULE_HOME !== process.env.HERMES_HOME) throw new Error("capsule home contract drifted");
		  if (process.env.PYTHONPATH !== join(executionRoot, "hermes-auth-adapter")) throw new Error("auth adapter import path drifted");
		  appendFileSync(process.env.MOCK_HERMES_CAPSULE_LOG, process.env.HERMES_HOME + "\\n");
		  if (process.env.HERMES_ENVIRONMENT_HINT || process.env.HERMES_PLATFORM || process.env.HERMES_IGNORE_RULES) throw new Error("prompt override leaked");
		  for (const key of ${JSON.stringify(Object.keys(hostileEnvironment).filter((key) => ![
        "FIREFLY_HERMES_AUTH_ADAPTER_CONTRACT",
        "FIREFLY_HERMES_AUTH_ADAPTER_READY",
        "FIREFLY_HERMES_AUTH_STORE",
        "FIREFLY_HERMES_CAPSULE_HOME",
        "PYTHONPATH",
      ].includes(key)))}) {
		    if (process.env[key] !== undefined) throw new Error("forbidden environment override leaked: " + key);
		  }
		  if (process.env.PYTHONDONTWRITEBYTECODE !== "1") throw new Error("bytecode guard missing");
		  if (process.env.MOCK_HERMES_CREATE_AUTH === "1") writeFileSync(join(process.env.HERMES_HOME, "auth.json"), "temporary-secret\\n");
	  const delay = Number(process.env.MOCK_HERMES_DELAY_MS ?? 0);
	  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
	  const usageIndex = args.indexOf("--usage-file");
	  copyFileSync(process.env.MOCK_HERMES_USAGE_SOURCE, args[usageIndex + 1]);
	  process.stdout.write(readFileSync(process.env.MOCK_HERMES_RESULT_SOURCE));
	  if (process.env.MOCK_HERMES_MUTATE_SELF === "1") appendFileSync(new URL(import.meta.url), "// runtime drift\\n");
} else if (args[0] === "sessions" && args[1] === "export") {
  copyFileSync(process.env.MOCK_HERMES_TRACE_SOURCE, args[2]);
} else {
  process.exitCode = 2;
}
`),
    ]);
    await chmod(mockBin, 0o755);
    process.env.HERMES_BIN = mockBin;
    process.env.MOCK_HERMES_USAGE_SOURCE = usageSource;
    process.env.MOCK_HERMES_RESULT_SOURCE = resultSource;
    process.env.MOCK_HERMES_TRACE_SOURCE = traceSource;
    process.env.MOCK_HERMES_INVOCATION_LOG = invocationLog;
    process.env.MOCK_HERMES_CAPSULE_LOG = join(root, "mock-capsules.log");
    process.env.MOCK_HERMES_FORBIDDEN_ROOT = root;
    Object.assign(process.env, hostileEnvironment);
    process.env.HERMES_CONTEXT_CACHE_PATH = "/tmp/must-not-control-context-cache";
    process.env.HERMES_ENVIRONMENT_HINT = "must-not-reach-Hermes";
    process.env.HERMES_PLATFORM = "telegram";
    process.env.HERMES_IGNORE_RULES = "1";
    process.env.TERMINAL_CWD = "/tmp/wrong-project";
    process.env.TERMINAL_ENV = "ssh";
    const progress = [];
    const options = {
      role: "profile-synthesis",
      runRoot,
      profileHome,
      profileId,
      projectCwd: root,
      prompt,
      expectedReadPaths: [inputPath],
      inputDigest: digest("bound-manager-selection-and-deep-read-inputs"),
      outputReserveTokens: 48_000,
      validateResult: (candidate) => {
        assert.equal(candidate.schemaVersion, "mock-result/v1");
        assert.equal(candidate.status, "ok");
        return true;
      },
      progress: (event) => progress.push(event.event),
    };
    const pluginPlanningEvidence = await loadHermesExactInputPluginPlanningEvidence();
    const authAdapterPlanningEvidence = await loadHermesAuthAdapterPlanningEvidence();
    await assert.rejects(
      runHermesStructuredAttempt({ ...options, progress: () => {} }),
      /auth-store adapter planning evidence is required/u,
    );
    options.expectedAuthAdapterPlanningEvidence = authAdapterPlanningEvidence;
    const driftedPlanningDescriptor = {
      schemaVersion: pluginPlanningEvidence.schemaVersion,
      files: pluginPlanningEvidence.files.map((file, index) => (
        index === 0 ? { ...file, sha256: digest("canonical-but-not-live-plugin") } : file
      )),
      totalBytes: pluginPlanningEvidence.totalBytes,
    };
    const driftedPluginPlanningEvidence = {
      ...driftedPlanningDescriptor,
      sha256: digest(jsonBytes(driftedPlanningDescriptor)),
    };
    const pluginPlanningDriftRunRoot = join(root, "plugin-planning-drift-run");
    await assert.rejects(
      runHermesStructuredAttempt({
        ...options,
        runRoot: pluginPlanningDriftRunRoot,
        expectedPluginPlanningEvidence: driftedPluginPlanningEvidence,
        progress: () => {},
      }),
      /plugin.*drifted from the sealed planning evidence/u,
    );
    let preflightInvocations = (await readFile(invocationLog, "utf8")).trim().split("\n");
    assert.equal(preflightInvocations.filter((entry) => entry === "--oneshot").length, 0);
    await assert.rejects(lstat(join(pluginPlanningDriftRunRoot, ".readonly-capability")), { code: "ENOENT" });
    options.expectedPluginPlanningEvidence = pluginPlanningEvidence;
    const driftedAuthAdapterDescriptor = {
      schemaVersion: authAdapterPlanningEvidence.schemaVersion,
      contractVersion: authAdapterPlanningEvidence.contractVersion,
      files: authAdapterPlanningEvidence.files.map((file, index) => (
        index === 0 ? { ...file, sha256: digest("canonical-but-not-live-auth-adapter") } : file
      )),
      totalBytes: authAdapterPlanningEvidence.totalBytes,
    };
    const authAdapterPlanningDriftRunRoot = join(root, "auth-adapter-planning-drift-run");
    await assert.rejects(
      runHermesStructuredAttempt({
        ...options,
        runRoot: authAdapterPlanningDriftRunRoot,
        expectedAuthAdapterPlanningEvidence: {
          ...driftedAuthAdapterDescriptor,
          sha256: digest(jsonBytes(driftedAuthAdapterDescriptor)),
        },
        progress: () => {},
      }),
      /auth adapter.*drifted from the sealed planning evidence/u,
    );
    await assert.rejects(lstat(join(authAdapterPlanningDriftRunRoot, ".readonly-capability")), { code: "ENOENT" });
    const sourceAuthPath = join(root, "hermes", "auth.json");
    const sourceAuthBytes = await readFile(sourceAuthPath);
    const first = await runHermesStructuredAttempt(options);
    assert.equal(first.status, "completed");
    assert.equal(first.reused, false);
    assert.equal(first.receipt.exactReadCount, 1);
    assert.equal(first.receipt.inputDigest, options.inputDigest);
    assert.equal(validateHermesStructuredReceipt(first.receipt), true);
    assert.deepEqual(progress, ["attempt-start", "attempt-complete"]);
    let invocations = (await readFile(invocationLog, "utf8")).trim().split("\n");
    assert.equal(invocations.filter((entry) => entry === "--oneshot").length, 1);
    assert.equal(invocations.filter((entry) => entry === "sessions").length, 1);
    assert.equal(JSON.parse(await readFile(join(runRoot, "completed.json"), "utf8")).attempt, first.attempt);
    assert.equal(JSON.parse(await readFile(join(first.attemptDir, "completed.json"), "utf8")).completed, true);
    const attemptFileNames = (await readdir(first.attemptDir)).sort();
    assert.deepEqual(attemptFileNames, HERMES_STRUCTURED_ATTEMPT_EVIDENCE_FILENAMES);
    assert.equal(validateHermesStructuredAttemptEvidenceFileNames(attemptFileNames), true);
    const firstCapsuleHome = (await readFile(process.env.MOCK_HERMES_CAPSULE_LOG, "utf8")).trim().split("\n")[0];
    const firstCapsuleRoot = join(firstCapsuleHome, "../../..");
    await assert.rejects(lstat(firstCapsuleRoot), { code: "ENOENT" });
    assert.deepEqual((await readdir(join(runRoot, ".readonly-capability"))).sort(), ["input-manifest.json"]);
    const inputAttestationPath = join(first.attemptDir, "input-attestation.json");
    const readCapabilityPath = join(first.attemptDir, "read-capability.json");
    const readCapabilityBytes = await readFile(readCapabilityPath);
    const exactInputEvidence = await loadHermesExactInputEvidence([inputPath], options.inputDigest);
    const validatedReadCapability = validateHermesExactInputReadCapability({
      bytes: readCapabilityBytes,
      expectedFiles: exactInputEvidence.files,
      sourceRuntimeIdentitySha256: first.receipt.hermesRuntimeIdentitySha256,
    });
    assert.equal(validatedReadCapability.sha256, first.receipt.readCapabilitySha256);
    assert.equal(validatedReadCapability.capability.tool, "firefly_read_source");
    assert.equal(
      validatedReadCapability.capability.authProjectionContractVersion,
      "hermes-global-auth-store-adapter/v1",
    );
    assert.deepEqual(
      validatedReadCapability.capability.authAdapterFiles,
      authAdapterPlanningEvidence.files,
    );
    assert.deepEqual(await readFile(sourceAuthPath), sourceAuthBytes);
    const originalInputAttestationBytes = await readFile(inputAttestationPath);
    const inputAttestation = JSON.parse(originalInputAttestationBytes.toString("utf8"));
    const inputAttestationSha256 = digest(originalInputAttestationBytes);
    const attemptCompletion = JSON.parse(await readFile(join(first.attemptDir, "completed.json"), "utf8"));
    const rootCompletion = JSON.parse(await readFile(join(runRoot, "completed.json"), "utf8"));
    assert.equal(first.attempt.endsWith(`-${inputAttestationSha256}`), true);
    assert.equal(attemptCompletion.attemptId.endsWith(`-${inputAttestationSha256}`), true);
    assert.equal(rootCompletion.attempt, first.attempt);
    assert.equal(inputAttestation.inputDigest, options.inputDigest);
    assert.equal(inputAttestation.outputReserveTokens, options.outputReserveTokens);
    assert.equal(inputAttestation.profileId, profileId);
    assert.deepEqual(inputAttestation.expectedReads, [{
      path: inputPath,
      sha256: digest(inputText),
      sizeBytes: Buffer.byteLength(inputText),
    }]);

    process.env.MOCK_HERMES_CREATE_AUTH = "1";
    const authArtifactRunRoot = join(root, "credential-artifact-run");
    await assert.rejects(
      runHermesStructuredAttempt({ ...options, runRoot: authArtifactRunRoot, progress: () => {} }),
      /forbidden credential artifact: .*auth\.json/u,
    );
    delete process.env.MOCK_HERMES_CREATE_AUTH;
    const capsuleHomes = (await readFile(process.env.MOCK_HERMES_CAPSULE_LOG, "utf8")).trim().split("\n");
    const authCapsuleRoot = join(capsuleHomes.at(-1), "../../..");
    await assert.rejects(lstat(authCapsuleRoot), { code: "ENOENT" });
    await assert.rejects(readFile(join(authArtifactRunRoot, "completed.json")), { code: "ENOENT" });
    assert.deepEqual(await readFile(sourceAuthPath), sourceAuthBytes);

    const firstReleasedLockName = (await readdir(runRoot))
      .find((name) => name.startsWith(".structured-run.lock.released-"));
    assert.equal(typeof firstReleasedLockName, "string");
    const releasedOwnerPath = join(runRoot, firstReleasedLockName, "owner.json");
    const releasedOwnerBackup = join(root, "released-owner-original.json");
    const releasedOwnerBytes = await readFile(releasedOwnerPath);
    await rename(releasedOwnerPath, releasedOwnerBackup);
    await writeFile(releasedOwnerPath, releasedOwnerBytes, { mode: 0o600 });
    await assert.rejects(
      runHermesStructuredAttempt({ ...options, progress: () => {} }),
      /released structured run lock drifted.*manual audit/u,
    );
    assert.deepEqual(await readFile(releasedOwnerPath), releasedOwnerBytes);
    await unlink(releasedOwnerPath);
    await rename(releasedOwnerBackup, releasedOwnerPath);

    const second = await runHermesStructuredAttempt({ ...options, progress: () => {} });
    assert.equal(second.status, "reused");
    assert.equal(second.reused, true);
    assert.equal(second.attempt, first.attempt);
    invocations = (await readFile(invocationLog, "utf8")).trim().split("\n");
    assert.equal(invocations.filter((entry) => entry === "--oneshot").length, 2);
    assert.equal(invocations.filter((entry) => entry === "sessions").length, 2);

    const validationRetryRoot = join(root, "validation-retry-run");
    await assert.rejects(runHermesStructuredAttempt({
      ...options,
      runRoot: validationRetryRoot,
      validateResult: () => {
        throw new Error("protected surface preseal failure");
      },
      progress: () => {},
    }), /protected surface preseal failure/u);
    await assert.rejects(readFile(join(validationRetryRoot, "completed.json")), { code: "ENOENT" });
    const [invalidAttempt] = await readdir(join(validationRetryRoot, "attempts"));
    assert.ok(invalidAttempt);
    await assert.rejects(
      readFile(join(validationRetryRoot, "attempts", invalidAttempt, "completed.json")),
      { code: "ENOENT" },
    );
    const validationRetry = await runHermesStructuredAttempt({
      ...options,
      runRoot: validationRetryRoot,
      progress: () => {},
    });
    assert.equal(validationRetry.status, "completed");
    assert.notEqual(validationRetry.attempt, invalidAttempt);
    assert.equal((await readdir(join(validationRetryRoot, "attempts"))).length, 2);

    await writeFile(inputAttestationPath, originalInputAttestationBytes.toString("utf8").replace(
      options.inputDigest,
      "0".repeat(64),
    ));
    await assert.rejects(
      runHermesStructuredAttempt({ ...options, progress: () => {} }),
      /attempt input attestation drifted/u,
    );
    await writeFile(inputAttestationPath, originalInputAttestationBytes);

    const candidateOutputPath = join(first.attemptDir, "candidate-output.txt");
    const originalCandidateOutputBytes = await readFile(candidateOutputPath);
    await writeFile(candidateOutputPath, `${JSON.stringify({ ...result, count: 999 })}\n`);
    await assert.rejects(
      runHermesStructuredAttempt({ ...options, progress: () => {} }),
      /candidate output drifted from the stored structured result/u,
    );
    await writeFile(candidateOutputPath, originalCandidateOutputBytes);
    const unexpectedAttemptFile = join(first.attemptDir, "unbound-debug.json");
    await writeFile(unexpectedAttemptFile, "{}\n");
    await assert.rejects(
      runHermesStructuredAttempt({ ...options, progress: () => {} }),
      /unexpected evidence file/u,
    );
    await unlink(unexpectedAttemptFile);
    await assert.rejects(
      runHermesStructuredAttempt({ ...options, prompt: `${prompt} changed`, progress: () => {} }),
      /attempt input attestation drifted/u,
    );
    await assert.rejects(
      runHermesStructuredAttempt({ ...options, outputReserveTokens: 47_999, progress: () => {} }),
      /attempt input attestation drifted/u,
    );
    const secondInputPath = join(root, "second-input.txt");
    await writeFile(secondInputPath, "other bound bytes\n");
    await assert.rejects(
      runHermesStructuredAttempt({
        ...options,
        expectedReadPaths: [inputPath, secondInputPath],
        progress: () => {},
      }),
      /attempt input attestation drifted|exact-input manifest drifted/u,
    );

    const movedAttemptDir = `${first.attemptDir}.real`;
    await rename(first.attemptDir, movedAttemptDir);
    await symlink(movedAttemptDir, first.attemptDir, "dir");
    await assert.rejects(
      runHermesStructuredAttempt({ ...options, progress: () => {} }),
      /symlinked path component/u,
    );
    await rm(first.attemptDir);
    await rename(movedAttemptDir, first.attemptDir);

    const usagePath = join(first.attemptDir, "usage.json");
    const realUsagePath = join(root, "usage-backup.json");
    await rename(usagePath, realUsagePath);
    await symlink(realUsagePath, usagePath, "file");
    await assert.rejects(
      runHermesStructuredAttempt({ ...options, progress: () => {} }),
      /symlinked path component/u,
    );
    await rm(usagePath);
    await rename(realUsagePath, usagePath);

    const originalMockBytes = await readFile(mockBin);
    process.env.MOCK_HERMES_MUTATE_SELF = "1";
    await assert.rejects(
      runHermesStructuredAttempt({ ...options, runRoot: join(root, "runtime-drift-run"), progress: () => {} }),
      /post-execution runtime changed/u,
    );
    delete process.env.MOCK_HERMES_MUTATE_SELF;
    await writeFile(mockBin, originalMockBytes);
    await chmod(mockBin, 0o755);

    await writeFile(mockBin, originalMockBytes.toString("utf8").replace("mock-hermes 1.0.0", "mock-hermes 2.0.0"));
    await chmod(mockBin, 0o755);
    await assert.rejects(
      runHermesStructuredAttempt({ ...options, progress: () => {} }),
      /attempt input attestation drifted/u,
    );
    await writeFile(mockBin, originalMockBytes);
    await chmod(mockBin, 0o755);

    await writeFile(join(root, "AGENTS.md"), "context changed\n");
    await assert.rejects(
      runHermesStructuredAttempt({ ...options, progress: () => {} }),
      /attempt input attestation drifted/u,
    );
    await unlink(join(root, "AGENTS.md"));

    const externalContextPath = join(root, "external-context.md");
    await writeFile(externalContextPath, "external context changed\n");
    await symlink(externalContextPath, join(root, "AGENTS.md"), "file");
    await assert.rejects(
      runHermesStructuredAttempt({ ...options, progress: () => {} }),
      /project prompt context contains a symbolic link/u,
    );
    await unlink(join(root, "AGENTS.md"));

    const receiptPath = join(first.attemptDir, "host-receipt.json");
    const receiptBackupPath = join(root, "receipt-backup.json");
    const externalReceiptPath = join(root, "outside", "forged-receipt.json");
    await rename(receiptPath, receiptBackupPath);
    await symlink(externalReceiptPath, receiptPath, "file");
    await assert.rejects(
      runHermesStructuredAttempt({ ...options, progress: () => {} }),
      /symlinked path component/u,
    );
    await assert.rejects(readFile(externalReceiptPath), { code: "ENOENT" });
    await unlink(receiptPath);
    await rename(receiptBackupPath, receiptPath);

    const inputDriftRoot = join(root, "input-drift-reuse-run");
    await runHermesStructuredAttempt({ ...options, runRoot: inputDriftRoot, progress: () => {} });
    process.env.MOCK_HERMES_VERSION_DELAY_MS = "150";
    const driftingReuse = runHermesStructuredAttempt({
      ...options,
      runRoot: inputDriftRoot,
      progress: () => {},
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    await writeFile(inputPath, "changed while runtime attestation was still running\n");
    await assert.rejects(
      driftingReuse,
      /expected source binding drifted|exact-input result is partial or drifted|pre-return input changed/u,
    );
    delete process.env.MOCK_HERMES_VERSION_DELAY_MS;
    await writeFile(inputPath, inputText);
    await assert.rejects(
      runHermesStructuredAttempt({
        ...options,
        runRoot: inputDriftRoot,
        progress: async (event) => {
          if (event.event === "attempt-reused") {
            await writeFile(inputPath, "changed after finalization but before return\n");
          }
        },
      }),
      /pre-return input changed/u,
    );
    await writeFile(inputPath, inputText);

    const recoveryRoot = join(root, "runtime-bound-recovery-run");
    const recoveryA = await runHermesStructuredAttempt({
      ...options,
      runRoot: recoveryRoot,
      progress: () => {},
    });
    await Promise.all([
      unlink(join(recoveryRoot, "completed.json")),
      unlink(join(recoveryA.attemptDir, "host-receipt.json")),
      unlink(join(recoveryA.attemptDir, "completed.json")),
    ]);
    const recoveryProgress = [];
    const recoveryB = await runHermesStructuredAttempt({
      ...options,
      runRoot: recoveryRoot,
      inputDigest: digest("different-current-runtime-input-binding"),
      progress: (event) => recoveryProgress.push(event.event),
    });
    assert.equal(recoveryB.status, "completed");
    assert.notEqual(recoveryB.attempt, recoveryA.attempt);
    assert.equal(recoveryB.receipt.inputDigest, digest("different-current-runtime-input-binding"));
    assert.ok(recoveryProgress.includes("attempt-invalid"));
    await assert.rejects(readFile(join(recoveryA.attemptDir, "host-receipt.json")), { code: "ENOENT" });
    await assert.rejects(readFile(join(recoveryA.attemptDir, "completed.json")), { code: "ENOENT" });

    const runtimeRecoveryRoot = join(root, "runtime-version-recovery-run");
    const runtimeRecoveryA = await runHermesStructuredAttempt({
      ...options,
      runRoot: runtimeRecoveryRoot,
      progress: () => {},
    });
    await Promise.all([
      unlink(join(runtimeRecoveryRoot, "completed.json")),
      unlink(join(runtimeRecoveryA.attemptDir, "host-receipt.json")),
      unlink(join(runtimeRecoveryA.attemptDir, "completed.json")),
    ]);
    const stableMockBytes = await readFile(mockBin);
    await writeFile(mockBin, stableMockBytes.toString("utf8").replace("mock-hermes 1.0.0", "mock-hermes 2.0.0"));
    await chmod(mockBin, 0o755);
    const runtimeRecoveryProgress = [];
    const runtimeRecoveryB = await runHermesStructuredAttempt({
      ...options,
      runRoot: runtimeRecoveryRoot,
      progress: (event) => runtimeRecoveryProgress.push(event.event),
    });
    assert.equal(runtimeRecoveryB.status, "completed");
    assert.notEqual(runtimeRecoveryB.attempt, runtimeRecoveryA.attempt);
    assert.ok(runtimeRecoveryProgress.includes("attempt-invalid"));
    assert.notEqual(
      runtimeRecoveryB.receipt.hermesRuntimeIdentitySha256,
      runtimeRecoveryA.receipt.hermesRuntimeIdentitySha256,
    );
    await assert.rejects(readFile(join(runtimeRecoveryA.attemptDir, "host-receipt.json")), { code: "ENOENT" });
    await writeFile(mockBin, stableMockBytes);
    await chmod(mockBin, 0o755);

    const markerlessRoot = join(root, "markerless-incomplete-run");
    const markerlessA = await runHermesStructuredAttempt({
      ...options,
      runRoot: markerlessRoot,
      progress: () => {},
    });
    await Promise.all([
      unlink(join(markerlessRoot, "completed.json")),
      unlink(join(markerlessA.attemptDir, "host-receipt.json")),
      unlink(join(markerlessA.attemptDir, "completed.json")),
      unlink(join(markerlessA.attemptDir, "input-attestation.json")),
    ]);
    const markerlessB = await runHermesStructuredAttempt({
      ...options,
      runRoot: markerlessRoot,
      progress: () => {},
    });
    assert.equal(markerlessB.status, "completed");
    assert.notEqual(markerlessB.attempt, markerlessA.attempt);
    await assert.rejects(readFile(join(markerlessA.attemptDir, "host-receipt.json")), { code: "ENOENT" });

    const invalidRecoveryRoot = join(root, "invalid-completion-recovery-run");
    const invalidRecoveryA = await runHermesStructuredAttempt({
      ...options,
      runRoot: invalidRecoveryRoot,
      progress: () => {},
    });
    await Promise.all([
      unlink(join(invalidRecoveryRoot, "completed.json")),
      unlink(join(invalidRecoveryA.attemptDir, "host-receipt.json")),
    ]);
    const invalidCompletionPath = join(invalidRecoveryA.attemptDir, "completed.json");
    const invalidCompletion = JSON.parse(await readFile(invalidCompletionPath, "utf8"));
    invalidCompletion.hostReceiptSha256 = "0".repeat(64);
    await writeFile(invalidCompletionPath, `${JSON.stringify(invalidCompletion, null, 2)}\n`);
    const invalidRecoveryProgress = [];
    const invalidRecoveryB = await runHermesStructuredAttempt({
      ...options,
      runRoot: invalidRecoveryRoot,
      progress: (event) => invalidRecoveryProgress.push(event.event),
    });
    assert.equal(invalidRecoveryB.status, "completed");
    assert.notEqual(invalidRecoveryB.attempt, invalidRecoveryA.attempt);
    assert.ok(invalidRecoveryProgress.includes("attempt-invalid"));
    await assert.rejects(readFile(join(invalidRecoveryA.attemptDir, "host-receipt.json")), { code: "ENOENT" });

    process.env.MOCK_HERMES_DELAY_MS = "200";
    const raceOptions = { ...options, runRoot: join(root, "race-run"), progress: () => {} };
    const race = await Promise.allSettled([
      runHermesStructuredAttempt(raceOptions),
      runHermesStructuredAttempt(raceOptions),
    ]);
    delete process.env.MOCK_HERMES_DELAY_MS;
    assert.equal(race.filter((entry) => entry.status === "fulfilled").length, 1);
    const rejected = race.filter((entry) => entry.status === "rejected");
    assert.equal(rejected.length, 1);
    assert.match(rejected[0].reason.message, /run lock exists/u);

    const ownerDriftRoot = join(root, "owner-inode-drift-run");
    const ownerDriftBackup = join(root, "original-owner.json");
    await assert.rejects(
      runHermesStructuredAttempt({
        ...options,
        runRoot: ownerDriftRoot,
        progress: async (event) => {
          if (event.event !== "attempt-complete") return;
          const ownerPath = join(ownerDriftRoot, ".structured-run.lock", "owner.json");
          const ownerBytes = await readFile(ownerPath);
          const before = await lstat(ownerPath);
          await rename(ownerPath, ownerDriftBackup);
          await writeFile(ownerPath, ownerBytes, { mode: 0o600 });
          const after = await lstat(ownerPath);
          assert.notEqual(`${after.dev}:${after.ino}`, `${before.dev}:${before.ino}`);
        },
      }),
      /lock ownership drifted.*manual audit/u,
    );
    assert.deepEqual(
      await readFile(join(ownerDriftRoot, ".structured-run.lock", "owner.json")),
      await readFile(ownerDriftBackup),
    );

    const directoryDriftRoot = join(root, "directory-inode-drift-run");
    const directoryDriftBackup = join(root, "original-lock-directory");
    await assert.rejects(
      runHermesStructuredAttempt({
        ...options,
        runRoot: directoryDriftRoot,
        progress: async (event) => {
          if (event.event !== "attempt-complete") return;
          const lockPath = join(directoryDriftRoot, ".structured-run.lock");
          const ownerBytes = await readFile(join(lockPath, "owner.json"));
          await rename(lockPath, directoryDriftBackup);
          await mkdir(lockPath);
          await writeFile(join(lockPath, "owner.json"), ownerBytes, { mode: 0o600 });
        },
      }),
      /lock ownership drifted.*manual audit/u,
    );
    assert.deepEqual(
      await readFile(join(directoryDriftRoot, ".structured-run.lock", "owner.json")),
      await readFile(join(directoryDriftBackup, "owner.json")),
    );

    const ownerBytesDriftRoot = join(root, "owner-bytes-drift-run");
    await assert.rejects(
      runHermesStructuredAttempt({
        ...options,
        runRoot: ownerBytesDriftRoot,
        progress: async (event) => {
          if (event.event !== "attempt-complete") return;
          const ownerPath = join(ownerBytesDriftRoot, ".structured-run.lock", "owner.json");
          const before = await lstat(ownerPath);
          await writeFile(ownerPath, `${await readFile(ownerPath, "utf8")} `);
          const after = await lstat(ownerPath);
          assert.equal(`${after.dev}:${after.ino}`, `${before.dev}:${before.ino}`);
        },
      }),
      /lock ownership drifted.*manual audit/u,
    );
    assert.equal(
      (await readFile(join(ownerBytesDriftRoot, ".structured-run.lock", "owner.json"), "utf8")).endsWith("}\n "),
      true,
    );

    const externalRunParent = join(root, "external-run-parent");
    const linkedRunParent = join(root, "linked-run-parent");
    await mkdir(externalRunParent);
    await symlink(externalRunParent, linkedRunParent, "dir");
    await assert.rejects(
      runHermesStructuredAttempt({
        ...options,
        runRoot: join(linkedRunParent, "must-not-be-created"),
        progress: () => {},
      }),
      /symbolic-link component/u,
    );
    await assert.rejects(readFile(join(externalRunParent, "must-not-be-created")), { code: "ENOENT" });

    await mkdir(join(externalRunParent, "pre-existing-run"));
    await assert.rejects(
      runHermesStructuredAttempt({
        ...options,
        runRoot: join(linkedRunParent, "pre-existing-run"),
        progress: () => {},
      }),
      /symbolic-link component/u,
    );

    const validButWrongTraceSha = { ...first.receipt, traceSha256: "0".repeat(64) };
    assert.throws(
      () => validateHermesStructuredReceipt(validButWrongTraceSha, { traceSha256: first.receipt.traceSha256 }),
      /receipt drifted: traceSha256/u,
    );

    const pointerPath = join(runRoot, "completed.json");
    const pointer = JSON.parse(await readFile(pointerPath, "utf8"));
    pointer.hostReceiptSha256 = "0".repeat(64);
    await writeFile(pointerPath, `${JSON.stringify(pointer, null, 2)}\n`);
    const oneshotsBeforePointerRecheck = (await readFile(invocationLog, "utf8")).trim().split("\n")
      .filter((entry) => entry === "--oneshot").length;
    await assert.rejects(runHermesStructuredAttempt({ ...options, progress: () => {} }), /completed pointer drifted/u);
    const oneshotsAfterPointerRecheck = (await readFile(invocationLog, "utf8")).trim().split("\n")
      .filter((entry) => entry === "--oneshot").length;
    assert.equal(oneshotsAfterPointerRecheck, oneshotsBeforePointerRecheck);
  } finally {
    for (const [key, value] of [
      ["HERMES_BIN", previousBin],
      ["MOCK_HERMES_USAGE_SOURCE", previousUsage],
      ["MOCK_HERMES_RESULT_SOURCE", previousResult],
      ["MOCK_HERMES_TRACE_SOURCE", previousTrace],
      ["MOCK_HERMES_INVOCATION_LOG", previousLog],
      ["MOCK_HERMES_DELAY_MS", previousDelay],
      ["MOCK_HERMES_VERSION_DELAY_MS", previousVersionDelay],
      ["MOCK_HERMES_EXPECTED_CWD", previousExpectedCwd],
      ["MOCK_HERMES_EXPECTED_CACHE", previousExpectedCache],
      ["MOCK_HERMES_EXPECTED_HOME", previousExpectedHome],
      ["MOCK_HERMES_CAPSULE_LOG", previousCapsuleLog],
      ["MOCK_HERMES_CREATE_AUTH", previousCreateAuth],
      ["MOCK_HERMES_FORBIDDEN_ROOT", previousForbiddenRoot],
      ["MOCK_HERMES_MUTATE_SELF", previousMutateSelf],
      ["HERMES_CONTEXT_CACHE_PATH", previousCache],
      ["HERMES_ENVIRONMENT_HINT", previousEnvironmentHint],
      ["HERMES_PLATFORM", previousHermesPlatform],
      ["HERMES_IGNORE_RULES", previousIgnoreRules],
      ["TERMINAL_CWD", previousTerminalCwd],
      ["TERMINAL_ENV", previousTerminalEnv],
      ...Object.entries(previousHostileEnvironment),
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
});
