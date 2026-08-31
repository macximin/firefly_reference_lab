import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { writePrivateGenreSoulSurfaceHilDecision } from "../tools/genre-soul-surface-hil-decision.mjs";
import {
  buildPrivateGenreSoulAmbiguousSurfaceRequest,
  buildPrivateGenreSoulBatchAmbiguousSurfaceRequest,
  computeGenreSoulSurfaceSampleSetSha256,
  computeGenreSoulSurfaceSourceSetSha256,
  evaluateGenreSoulSurfaceHil,
  validatePrivateGenreSoulAmbiguousSurfaceDecision,
  validatePrivateGenreSoulBatchAmbiguousSurfaceDecision,
} from "../tools/genre-soul-surface-hil-lib.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const ACTUAL_REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function writeRequestFixture(root) {
  const samples = [{ selectorId: "selector-a", sourceText: "김광은 움직였다." }];
  const pending = evaluateGenreSoulSurfaceHil({
    stage: "profile",
    genre: "modern-fantasy-ko",
    soulId: "male-modern-fantasy-ko",
    inputDigest: sha256("profile-input"),
    candidatePath: "analyses/genre_souls/male-modern-fantasy-ko/v1/genre-profile.json",
    candidate: { mechanism: "김광 방식" },
    selectionBindings: [],
    privateSamples: samples,
    sourceSetSha256: computeGenreSoulSurfaceSourceSetSha256([]),
    sampleSetSha256: computeGenreSoulSurfaceSampleSetSha256(samples),
  });
  assert.equal(pending.status, "pending_semantic_review");
  const built = buildPrivateGenreSoulAmbiguousSurfaceRequest({
    stage: pending.stage,
    genre: pending.genre,
    soulId: pending.soulId,
    inputDigest: pending.inputDigest,
    candidate: pending.candidate,
    privateEvidence: pending.privateEvidence,
    semanticReview: {
      input: { sha256: sha256("review-input"), sizeBytes: 10 },
      result: { sha256: sha256("review-result"), sizeBytes: 10 },
      receipt: {
        sha256: sha256("review-receipt"),
        sizeBytes: 10,
        role: "genre-soul-surface-semantic-review:profile:test",
        runId: "review-run-test",
        model: "gpt-5.6-sol",
        provider: "openai-codex",
        reasoningEffort: "high",
        promptSha256: sha256("review-prompt"),
      },
    },
    semanticProjection: {
      findingSetSha256: pending.findingSetSha256,
      genericFindingIds: [],
      protectedFindingIds: [],
      uncertainFindingIds: pending.findings.map((finding) => finding.findingId),
    },
    findings: pending.findings,
  });
  const requestPath = `exports/genre-souls/male-modern-fantasy-ko/v1/profile-runs/${sha256("run")}/genre/surface-review/owner-hil/requests/${built.sha256}.json`;
  await mkdir(join(root, dirname(requestPath)), { recursive: true });
  await writeFile(join(root, requestPath), built.bytes);
  return { pending: built, requestPath };
}

async function writeBatchRequestFixture(root) {
  const samples = [{ selectorId: "selector-batch", sourceText: "김광은 움직였다. 공개는 늦었다." }];
  const pending = evaluateGenreSoulSurfaceHil({
    stage: "profile",
    genre: "modern-fantasy-ko",
    soulId: "male-modern-fantasy-ko",
    inputDigest: sha256("batch-profile-input"),
    candidatePath: "analyses/genre_souls/male-modern-fantasy-ko/v1/genre-profile.json",
    candidate: { mechanism: "김광 방식과 공개 방식" },
    selectionBindings: [],
    privateSamples: samples,
    sourceSetSha256: computeGenreSoulSurfaceSourceSetSha256([]),
    sampleSetSha256: computeGenreSoulSurfaceSampleSetSha256(samples),
  });
  assert.equal(pending.status, "pending_semantic_review");
  assert.equal(pending.findings.length, 2);
  const findingIds = pending.findings.map((finding) => finding.findingId);
  const built = buildPrivateGenreSoulBatchAmbiguousSurfaceRequest({
    stage: pending.stage,
    genre: pending.genre,
    soulId: pending.soulId,
    inputDigest: pending.inputDigest,
    candidate: pending.candidate,
    privateEvidence: pending.privateEvidence,
    batchSemanticReview: {
      plan: {
        path: "surface-review/partition-plan.json",
        sha256: sha256("batch-plan"),
        sizeBytes: 10,
      },
      aggregate: {
        path: "surface-review/aggregate.json",
        sha256: sha256("batch-aggregate"),
        sizeBytes: 10,
      },
      verdictCounts: { genericOverlap: 0, protectedIdentity: 0, uncertain: findingIds.length },
      outcome: "pending_hil",
      parts: findingIds.map((findingId, index) => {
        const partId = `p${String(index + 1).padStart(4, "0")}`;
        return {
          partId,
          findingIds: [findingId],
          genericFindingIds: [],
          uncertainFindingIds: [findingId],
          protectedFindingIds: [],
          input: {
            path: `surface-review/parts/${partId}/input.json`,
            sha256: sha256(`batch-part-input-${partId}`),
            sizeBytes: 10,
          },
          result: {
            path: `surface-review/parts/${partId}/result.json`,
            sha256: sha256(`batch-part-result-${partId}`),
            sizeBytes: 10,
          },
          receipt: {
            path: `surface-review/parts/${partId}/accepted-host-receipt.json`,
            sha256: sha256(`batch-part-receipt-${partId}`),
            sizeBytes: 10,
          },
          reviewer: {
            role: `genre-soul-surface-semantic-review:profile:batch-test:${partId}`,
            runId: `batch-review-run-test-${partId}`,
            model: "gpt-5.6-sol",
            provider: "openai-codex",
            reasoningEffort: "high",
            promptSha256: sha256(`batch-review-prompt-${partId}`),
          },
        };
      }),
    },
    findings: pending.findings,
  });
  const requestPath = `exports/genre-souls/male-modern-fantasy-ko/v1/profile-runs/${sha256("batch-run")}/genre/surface-review/owner-hil/requests/${built.sha256}.json`;
  await mkdir(join(root, dirname(requestPath)), { recursive: true });
  await writeFile(join(root, requestPath), built.bytes);
  return { pending: built, requestPath };
}

test("writes one owner surface decision with no-clobber canonical readback and reuses identical bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "surface-hil-decision-"));
  try {
    const { pending, requestPath } = await writeRequestFixture(root);
    const options = {
      repositoryRoot: root,
      testOnlyRepositoryRoot: root,
      testOnly: true,
      requestPath,
      decision: "approve",
      actorId: "owner:local",
      decidedAt: "2026-08-30T04:00:00.000Z",
    };
    const first = await writePrivateGenreSoulSurfaceHilDecision(options);
    assert.equal(first.status, "written");
    assert.equal(first.outcome, "approved");
    const bytes = await readFile(join(root, first.decisionPath));
    assert.equal(validatePrivateGenreSoulAmbiguousSurfaceDecision(bytes, {
      request: pending.requestBytes,
      requestPath,
    }).sha256, first.decisionSha256);
    assert.equal((await writePrivateGenreSoulSurfaceHilDecision(options)).status, "reused");
    await assert.rejects(
      writePrivateGenreSoulSurfaceHilDecision({ ...options, decision: "reject" }),
      /already exists with different bytes/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("writes and validates one batch v4 owner decision through schema dispatch", async () => {
  const root = await mkdtemp(join(tmpdir(), "surface-hil-batch-decision-"));
  try {
    const { pending, requestPath } = await writeBatchRequestFixture(root);
    const result = await writePrivateGenreSoulSurfaceHilDecision({
      repositoryRoot: root,
      testOnlyRepositoryRoot: root,
      testOnly: true,
      requestPath,
      decision: "approve",
      actorId: "owner:local",
      decidedAt: "2026-08-30T04:00:00.000Z",
    });
    assert.equal(result.status, "written");
    assert.equal(result.outcome, "approved");
    const bytes = await readFile(join(root, result.decisionPath));
    assert.equal(validatePrivateGenreSoulBatchAmbiguousSurfaceDecision(bytes, {
      request: pending.bytes,
      requestPath,
    }).sha256, result.decisionSha256);
    assert.equal((await writePrivateGenreSoulSurfaceHilDecision({
      repositoryRoot: root,
      testOnlyRepositoryRoot: root,
      testOnly: true,
      requestPath,
      decision: "approve",
      actorId: "owner:local",
      decidedAt: "2026-08-30T04:00:00.000Z",
    })).status, "reused");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("requires one explicit decision timestamp before creating retriable decision bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "surface-hil-decision-time-"));
  try {
    const { requestPath } = await writeRequestFixture(root);
    const decisionPath = requestPath.replace(
      "/surface-review/owner-hil/requests/",
      "/surface-review/owner-hil/decisions/",
    );
    await assert.rejects(
      writePrivateGenreSoulSurfaceHilDecision({
        repositoryRoot: root,
        testOnlyRepositoryRoot: root,
        testOnly: true,
        requestPath,
        decision: "approve",
        actorId: "owner:local",
      }),
      /explicit ISO-8601 decidedAt for deterministic retry/u,
    );
    for (const decidedAt of [
      "2026-08-30T04:00:00Z",
      "2026-08-30T13:00:00.000+09:00",
      "August 30, 2026 04:00:00 UTC",
    ]) {
      await assert.rejects(
        writePrivateGenreSoulSurfaceHilDecision({
          repositoryRoot: root,
          testOnlyRepositoryRoot: root,
          testOnly: true,
          requestPath,
          decision: "approve",
          actorId: "owner:local",
          decidedAt,
        }),
        /explicit ISO-8601 decidedAt for deterministic retry/u,
      );
    }
    await assert.rejects(readFile(join(root, decisionPath)), /ENOENT/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("preserves a partial final decision and recovers after a durable temporary-file fault", async () => {
  const partialRoot = await mkdtemp(join(tmpdir(), "surface-hil-decision-partial-"));
  const temporaryRoot = await mkdtemp(join(tmpdir(), "surface-hil-decision-temporary-"));
  try {
    const partialFixture = await writeRequestFixture(partialRoot);
    const partialDecisionPath = partialFixture.requestPath.replace(
      "/surface-review/owner-hil/requests/",
      "/surface-review/owner-hil/decisions/",
    );
    const partialAbsolute = join(partialRoot, partialDecisionPath);
    await mkdir(dirname(partialAbsolute), { recursive: true });
    await writeFile(partialAbsolute, Buffer.from("{\"partial\":true", "utf8"));
    const partialOptions = {
      repositoryRoot: partialRoot,
      testOnlyRepositoryRoot: partialRoot,
      testOnly: true,
      requestPath: partialFixture.requestPath,
      decision: "approve",
      actorId: "owner:local",
      decidedAt: "2026-08-30T04:00:00.000Z",
    };
    await assert.rejects(
      writePrivateGenreSoulSurfaceHilDecision(partialOptions),
      /already exists with different bytes/u,
    );
    assert.equal(await readFile(partialAbsolute, "utf8"), "{\"partial\":true");

    const temporaryFixture = await writeRequestFixture(temporaryRoot);
    const temporaryDecisionPath = temporaryFixture.requestPath.replace(
      "/surface-review/owner-hil/requests/",
      "/surface-review/owner-hil/decisions/",
    );
    const temporaryAbsolute = join(temporaryRoot, temporaryDecisionPath);
    let injectedTemporaryPath;
    const temporaryOptions = {
      repositoryRoot: temporaryRoot,
      testOnlyRepositoryRoot: temporaryRoot,
      testOnly: true,
      requestPath: temporaryFixture.requestPath,
      decision: "approve",
      actorId: "owner:local",
      decidedAt: "2026-08-30T04:00:00.000Z",
    };
    await assert.rejects(
      writePrivateGenreSoulSurfaceHilDecision({
        ...temporaryOptions,
        testOnlyHooks: {
          afterTemporaryFileSync: ({ temporaryPath }) => {
            injectedTemporaryPath = temporaryPath;
            throw new Error("injected-after-temporary-fsync");
          },
        },
      }),
      /injected-after-temporary-fsync/u,
    );
    await assert.rejects(readFile(temporaryAbsolute), /ENOENT/u);
    await assert.rejects(readFile(injectedTemporaryPath), /ENOENT/u);

    const orphanTemporary = join(
      dirname(temporaryAbsolute),
      `.${basename(temporaryAbsolute)}.tmp-crashed-process`,
    );
    await writeFile(orphanTemporary, Buffer.from("partial-temporary", "utf8"), { mode: 0o600 });
    const recovered = await writePrivateGenreSoulSurfaceHilDecision(temporaryOptions);
    assert.equal(recovered.status, "written");
    assert.equal(await readFile(orphanTemporary, "utf8"), "partial-temporary");
  } finally {
    await Promise.all([
      rm(partialRoot, { recursive: true, force: true }),
      rm(temporaryRoot, { recursive: true, force: true }),
    ]);
  }
});

test("restores a foreign temporary replacement raced in before cleanup", async () => {
  const root = await mkdtemp(join(tmpdir(), "surface-hil-decision-cleanup-race-"));
  try {
    const { pending, requestPath } = await writeRequestFixture(root);
    const options = {
      repositoryRoot: root,
      testOnlyRepositoryRoot: root,
      testOnly: true,
      requestPath,
      decision: "approve",
      actorId: "owner:local",
      decidedAt: "2026-08-30T04:00:00.000Z",
    };
    const foreignBytes = Buffer.from("foreign-temporary-replacement", "utf8");
    let foreignInfo;
    let temporaryPath;
    let decisionPath;
    await assert.rejects(
      writePrivateGenreSoulSurfaceHilDecision({
        ...options,
        testOnlyHooks: {
          afterPublishBeforeDirectorySync: async (paths) => {
            temporaryPath = paths.temporaryPath;
            decisionPath = paths.decisionPath;
            await unlink(temporaryPath);
            await writeFile(temporaryPath, foreignBytes, { mode: 0o600 });
            foreignInfo = await lstat(temporaryPath);
          },
        },
      }),
      /temporary ownership drifted; foreign replacement was restored and preserved in quarantine/u,
    );
    assert.equal((await readFile(temporaryPath)).equals(foreignBytes), true);
    validatePrivateGenreSoulAmbiguousSurfaceDecision(await readFile(decisionPath), {
      request: pending.requestBytes,
      requestPath,
    });
    const quarantineRoot = join(root, "exports/locks/file-release-quarantine");
    const quarantineEntries = await readdir(quarantineRoot);
    assert.equal(quarantineEntries.length, 1);
    const quarantinePath = join(quarantineRoot, quarantineEntries[0]);
    assert.equal((await readFile(quarantinePath)).equals(foreignBytes), true);
    const quarantineInfo = await lstat(quarantinePath);
    assert.equal(quarantineInfo.dev, foreignInfo.dev);
    assert.equal(quarantineInfo.ino, foreignInfo.ino);
    assert.equal((await writePrivateGenreSoulSurfaceHilDecision(options)).status, "reused");
    assert.equal((await readFile(temporaryPath)).equals(foreignBytes), true);
    assert.equal((await readFile(quarantinePath)).equals(foreignBytes), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("preserves the quarantined foreign inode when the restored live temp path is raced again", async () => {
  const root = await mkdtemp(join(tmpdir(), "surface-hil-decision-restore-rerace-"));
  try {
    const { pending, requestPath } = await writeRequestFixture(root);
    const firstForeignBytes = Buffer.from("first-foreign-temporary", "utf8");
    const secondForeignBytes = Buffer.from("second-foreign-temporary", "utf8");
    let firstForeignInfo;
    let secondForeignInfo;
    let temporaryPath;
    let decisionPath;
    let quarantinePath;
    await assert.rejects(
      writePrivateGenreSoulSurfaceHilDecision({
        repositoryRoot: root,
        testOnlyRepositoryRoot: root,
        testOnly: true,
        requestPath,
        decision: "approve",
        actorId: "owner:local",
        decidedAt: "2026-08-30T04:00:00.000Z",
        testOnlyHooks: {
          afterPublishBeforeDirectorySync: async (paths) => {
            temporaryPath = paths.temporaryPath;
            decisionPath = paths.decisionPath;
            await unlink(temporaryPath);
            await writeFile(temporaryPath, firstForeignBytes, { mode: 0o600 });
            firstForeignInfo = await lstat(temporaryPath);
          },
          afterForeignTemporaryRestore: async (paths) => {
            quarantinePath = paths.quarantinePath;
            const quarantined = await lstat(quarantinePath);
            assert.equal(quarantined.dev, firstForeignInfo.dev);
            assert.equal(quarantined.ino, firstForeignInfo.ino);
            await unlink(paths.temporaryPath);
            await writeFile(paths.temporaryPath, secondForeignBytes, { mode: 0o600 });
            secondForeignInfo = await lstat(paths.temporaryPath);
          },
        },
      }),
      /foreign temporary replacement is preserved in quarantine because its live path changed after restoration/u,
    );
    assert.equal((await readFile(quarantinePath)).equals(firstForeignBytes), true);
    const quarantined = await lstat(quarantinePath);
    assert.equal(quarantined.dev, firstForeignInfo.dev);
    assert.equal(quarantined.ino, firstForeignInfo.ino);
    assert.equal((await readFile(temporaryPath)).equals(secondForeignBytes), true);
    const live = await lstat(temporaryPath);
    assert.equal(live.dev, secondForeignInfo.dev);
    assert.equal(live.ino, secondForeignInfo.ino);
    assert.notEqual(live.ino, quarantined.ino);
    validatePrivateGenreSoulAmbiguousSurfaceDecision(await readFile(decisionPath), {
      request: pending.requestBytes,
      requestPath,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("retries an identical single decision after publication faults before directory sync", async () => {
  const root = await mkdtemp(join(tmpdir(), "surface-hil-decision-publish-"));
  try {
    const { pending, requestPath } = await writeRequestFixture(root);
    const options = {
      repositoryRoot: root,
      testOnlyRepositoryRoot: root,
      testOnly: true,
      requestPath,
      decision: "approve",
      actorId: "owner:local",
      decidedAt: "2026-08-30T04:00:00.000Z",
    };
    let publishedPath;
    await assert.rejects(
      writePrivateGenreSoulSurfaceHilDecision({
        ...options,
        testOnlyHooks: {
          afterPublishBeforeDirectorySync: ({ decisionPath }) => {
            publishedPath = decisionPath;
            throw new Error("injected-after-no-clobber-publish");
          },
        },
      }),
      /injected-after-no-clobber-publish/u,
    );
    const publishedBytes = await readFile(publishedPath);
    validatePrivateGenreSoulAmbiguousSurfaceDecision(publishedBytes, {
      request: pending.requestBytes,
      requestPath,
    });
    const retried = await writePrivateGenreSoulSurfaceHilDecision(options);
    assert.equal(retried.status, "reused");
    assert.equal((await readdir(dirname(publishedPath))).some((name) => name.includes(".tmp-")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("retries an identical batch v4 decision after no-clobber publication", async () => {
  const root = await mkdtemp(join(tmpdir(), "surface-hil-batch-decision-publish-"));
  try {
    const { pending, requestPath } = await writeBatchRequestFixture(root);
    const options = {
      repositoryRoot: root,
      testOnlyRepositoryRoot: root,
      testOnly: true,
      requestPath,
      decision: "approve",
      actorId: "owner:local",
      decidedAt: "2026-08-30T04:00:00.000Z",
    };
    let publishedPath;
    await assert.rejects(
      writePrivateGenreSoulSurfaceHilDecision({
        ...options,
        testOnlyHooks: {
          afterPublishBeforeDirectorySync: ({ decisionPath }) => {
            publishedPath = decisionPath;
            throw new Error("injected-batch-after-no-clobber-publish");
          },
        },
      }),
      /injected-batch-after-no-clobber-publish/u,
    );
    const publishedBytes = await readFile(publishedPath);
    validatePrivateGenreSoulBatchAmbiguousSurfaceDecision(publishedBytes, {
      request: pending.bytes,
      requestPath,
    });
    const retried = await writePrivateGenreSoulSurfaceHilDecision(options);
    assert.equal(retried.status, "reused");
    assert.equal((await readdir(dirname(publishedPath))).some((name) => name.includes(".tmp-")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("decision writer rejects noncanonical paths and canonical or non-test repository capability drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "surface-hil-decision-boundary-"));
  try {
    const { requestPath } = await writeRequestFixture(root);
    const base = {
      repositoryRoot: root,
      requestPath,
      decision: "approve",
      actorId: "owner:local",
      decidedAt: "2026-08-30T04:00:00.000Z",
    };
    await assert.rejects(
      writePrivateGenreSoulSurfaceHilDecision(base),
      /only in the canonical Reference Lab repository root/u,
    );
    await assert.rejects(
      writePrivateGenreSoulSurfaceHilDecision({
        ...base,
        repositoryRoot: ACTUAL_REPOSITORY_ROOT,
        testOnlyRepositoryRoot: ACTUAL_REPOSITORY_ROOT,
        testOnly: true,
      }),
      /physically isolated/u,
    );
    await assert.rejects(
      writePrivateGenreSoulSurfaceHilDecision({
        ...base,
        testOnlyRepositoryRoot: root,
        testOnly: true,
        requestPath: `exports/genre-souls/male-modern-fantasy-ko/v1/arbitrary/requests/${sha256("bad")}.json`,
      }),
      /not a canonical/u,
    );
    await assert.rejects(
      writePrivateGenreSoulSurfaceHilDecision({
        repositoryRoot: ACTUAL_REPOSITORY_ROOT,
        requestPath,
        decision: "approve",
        actorId: "owner:local",
        decidedAt: "2026-08-30T04:00:00.000Z",
        testOnlyHooks: { afterTemporaryFileSync: () => {} },
      }),
      /hooks require testOnly=true/u,
    );
    await assert.rejects(
      writePrivateGenreSoulSurfaceHilDecision({
        ...base,
        testOnlyRepositoryRoot: root,
        testOnly: true,
        testOnlyHooks: { unsupported: () => {} },
      }),
      /unsupported hook/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("decision writer rejects a symbolic-link request ancestor before creating a decision", async () => {
  const root = await mkdtemp(join(tmpdir(), "surface-hil-decision-symlink-root-"));
  const outside = await mkdtemp(join(tmpdir(), "surface-hil-decision-symlink-outside-"));
  try {
    const { requestPath } = await writeRequestFixture(outside);
    await symlink(join(outside, "exports"), join(root, "exports"));
    await assert.rejects(
      writePrivateGenreSoulSurfaceHilDecision({
        repositoryRoot: root,
        testOnlyRepositoryRoot: root,
        testOnly: true,
        requestPath,
        decision: "approve",
        actorId: "owner:local",
        decidedAt: "2026-08-30T04:00:00.000Z",
      }),
      /symbolic-link component/u,
    );
  } finally {
    await Promise.all([
      rm(root, { recursive: true, force: true }),
      rm(outside, { recursive: true, force: true }),
    ]);
  }
});
