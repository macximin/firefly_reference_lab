import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { writePrivateGenreSoulSurfaceHilDecision } from "../tools/genre-soul-surface-hil-decision.mjs";
import {
  computeGenreSoulSurfaceSampleSetSha256,
  computeGenreSoulSurfaceSourceSetSha256,
  evaluateGenreSoulSurfaceHil,
  validatePrivateGenreSoulAmbiguousSurfaceDecision,
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
  assert.equal(pending.status, "pending_hil");
  const requestPath = `exports/genre-souls/male-modern-fantasy-ko/v1/profile-runs/${sha256("run")}/genre/surface-hil/requests/${pending.requestSha256}.json`;
  await mkdir(join(root, dirname(requestPath)), { recursive: true });
  await writeFile(join(root, requestPath), pending.requestBytes);
  return { pending, requestPath };
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
