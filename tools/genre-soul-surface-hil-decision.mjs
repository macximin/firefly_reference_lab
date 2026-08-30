#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { lstat, mkdir, open, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildPrivateGenreSoulAmbiguousSurfaceDecision,
  validatePrivateGenreSoulAmbiguousSurfaceRequest,
} from "./genre-soul-surface-hil-lib.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REQUEST_PATH = /^exports\/genre-souls\/(male-(?:modern-fantasy-ko|fantasy-ko|murim-ko))\/v1\/(?:profile-runs\/[0-9a-f]{64}\/genre|manager-qa-runs\/[0-9a-f]{64}\/structured-runs\/[0-9a-f]{64})\/surface-review\/owner-hil\/requests\/([0-9a-f]{64})\.json$/u;
const DECISION_BY_CLI = new Map([
  ["approve", "generic-overlap-approved"],
  ["reject", "protected-reject"],
]);

async function physicalDirectoryIdentity(path, label) {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`${label} must be a real directory.`);
  return { dev: info.dev, ino: info.ino, realpath: realpathSync(path) };
}

function samePhysicalIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

async function resolveExecutionRoot(options) {
  const root = resolve(options.repositoryRoot ?? "");
  const [canonicalIdentity, rootIdentity] = await Promise.all([
    physicalDirectoryIdentity(repoRoot, "Canonical Reference Lab root"),
    physicalDirectoryIdentity(root, "Surface HIL decision repository root"),
  ]);
  if (options.testOnly === true) {
    if (typeof options.testOnlyRepositoryRoot !== "string" || resolve(options.testOnlyRepositoryRoot) !== root) {
      throw new Error("Surface HIL decision test mode requires an exact testOnlyRepositoryRoot.");
    }
    if (samePhysicalIdentity(rootIdentity, canonicalIdentity)) {
      throw new Error("Surface HIL decision test root must be physically isolated from the canonical Reference Lab root.");
    }
    return root;
  }
  if (options.testOnlyRepositoryRoot !== undefined) {
    throw new Error("Surface HIL decision testOnlyRepositoryRoot requires testOnly=true.");
  }
  if (!samePhysicalIdentity(rootIdentity, canonicalIdentity)) {
    throw new Error("Surface HIL decisions may be written only in the canonical Reference Lab repository root.");
  }
  return root;
}

function safeRequestPath(root, requestPath) {
  if (
    typeof requestPath !== "string"
    || requestPath.length < 1
    || requestPath.includes("\\")
    || requestPath.includes("\0")
    || isAbsolute(requestPath)
    || normalize(requestPath) !== requestPath
  ) throw new Error("Surface HIL requestPath must be a normalized repository-relative path.");
  const match = REQUEST_PATH.exec(requestPath);
  if (!match) throw new Error("Surface HIL requestPath is not a canonical profile or Manager QA request path.");
  const absolute = resolve(root, requestPath);
  const rel = relative(root, absolute);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error("Surface HIL requestPath escapes the repository.");
  }
  return { absolute, soulId: match[1], requestSha256: match[2] };
}

async function assertNoSymlinkAncestors(root, target, label, requireTarget = false) {
  const rel = relative(root, target);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`${label} escapes the repository.`);
  let current = root;
  const parts = rel.split(sep).filter(Boolean);
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (error?.code === "ENOENT" && (!requireTarget || index < parts.length - 1)) return;
      throw error;
    }
    if (info.isSymbolicLink()) throw new Error(`${label} has a symbolic-link component.`);
    if (index < parts.length - 1 && !info.isDirectory()) throw new Error(`${label} has a non-directory ancestor.`);
    if (index === parts.length - 1 && requireTarget && !info.isFile()) throw new Error(`${label} must be a real file.`);
  }
}

async function writeExclusiveOrReuse(path, bytes, label) {
  let handle;
  try {
    handle = await open(path, "wx", 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    return "written";
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const current = await readFile(path);
    if (!current.equals(bytes)) throw new Error(`${label} already exists with different bytes.`);
    return "reused";
  } finally {
    await handle?.close();
  }
}

export async function writePrivateGenreSoulSurfaceHilDecision(options) {
  const root = await resolveExecutionRoot(options);
  const requestTarget = safeRequestPath(root, options.requestPath);
  await assertNoSymlinkAncestors(root, requestTarget.absolute, "Surface HIL request", true);
  const requestBytes = await readFile(requestTarget.absolute);
  const requestValidation = validatePrivateGenreSoulAmbiguousSurfaceRequest(requestBytes);
  if (
    requestValidation.sha256 !== requestTarget.requestSha256
    || requestValidation.request.soulId !== requestTarget.soulId
  ) throw new Error("Surface HIL request path identity drifted from its canonical bytes.");
  const findingDecision = DECISION_BY_CLI.get(options.decision);
  if (!findingDecision) throw new Error("Surface HIL decision must be approve or reject.");
  const built = buildPrivateGenreSoulAmbiguousSurfaceDecision({
    request: requestBytes,
    requestPath: options.requestPath,
    findingDecisions: requestValidation.request.findings.map((finding) => ({
      findingId: finding.findingId,
      decision: findingDecision,
    })),
    decidedByActorId: options.actorId,
    decidedByRole: "owner",
    decidedAt: options.decidedAt ?? new Date().toISOString(),
  });
  const decisionPath = options.requestPath.replace(
    "/surface-review/owner-hil/requests/",
    "/surface-review/owner-hil/decisions/",
  );
  const decisionAbsolute = resolve(root, decisionPath);
  await assertNoSymlinkAncestors(root, decisionAbsolute, "Surface HIL decision");
  await mkdir(dirname(decisionAbsolute), { recursive: true, mode: 0o700 });
  await assertNoSymlinkAncestors(root, decisionAbsolute, "Surface HIL decision");
  const status = await writeExclusiveOrReuse(decisionAbsolute, built.bytes, "Surface HIL decision");
  await assertNoSymlinkAncestors(root, decisionAbsolute, "Surface HIL decision", true);
  const readback = await readFile(decisionAbsolute);
  if (!readback.equals(built.bytes)) throw new Error("Surface HIL decision readback drifted.");
  return {
    status,
    requestPath: options.requestPath,
    requestSha256: requestValidation.sha256,
    decisionPath,
    decisionSha256: built.sha256,
    decisionId: built.decision.decisionId,
    outcome: built.decision.outcome,
  };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const result = await writePrivateGenreSoulSurfaceHilDecision({
    repositoryRoot: repoRoot,
    requestPath: argument("--request"),
    decision: argument("--decision"),
    actorId: argument("--actor-id"),
    decidedAt: argument("--decided-at"),
  });
  console.log(JSON.stringify(result, null, 2));
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
