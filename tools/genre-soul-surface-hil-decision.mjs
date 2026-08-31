#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { realpathSync } from "node:fs";
import { link, lstat, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PRIVATE_GENRE_SOUL_BATCH_AMBIGUOUS_SURFACE_REQUEST_SCHEMA,
  buildPrivateGenreSoulAmbiguousSurfaceDecision,
  buildPrivateGenreSoulBatchAmbiguousSurfaceDecision,
  validatePrivateGenreSoulAmbiguousSurfaceRequest,
  validatePrivateGenreSoulBatchAmbiguousSurfaceRequest,
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

async function lstatOrNull(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function readStableRegularFile(path, label) {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error(`${label} must be a real file.`);
  const handle = await open(path, "r");
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) {
      throw new Error(`${label} changed while it was opened.`);
    }
    const bytes = await handle.readFile();
    const after = await lstat(path);
    if (
      !after.isFile()
      || after.isSymbolicLink()
      || after.dev !== opened.dev
      || after.ino !== opened.ino
    ) throw new Error(`${label} changed while it was read.`);
    return { bytes, info: opened };
  } finally {
    await handle.close();
  }
}

async function syncRealDirectory(path, label) {
  const before = await lstat(path);
  if (!before.isDirectory() || before.isSymbolicLink()) throw new Error(`${label} must be a real directory.`);
  const handle = await open(path, "r");
  try {
    const opened = await handle.stat();
    if (!opened.isDirectory() || opened.dev !== before.dev || opened.ino !== before.ino) {
      throw new Error(`${label} changed while it was opened.`);
    }
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function ensureDecisionDirectory(root, path, label) {
  const parent = dirname(path);
  const existing = await lstatOrNull(parent);
  if (!existing) {
    await assertNoSymlinkAncestors(root, parent, `${label} parent`);
    await mkdir(parent, { recursive: true, mode: 0o700 });
    await assertNoSymlinkAncestors(root, parent, `${label} parent`);
    const created = await lstat(parent);
    if (!created.isDirectory() || created.isSymbolicLink()) {
      throw new Error(`${label} parent must be a real directory.`);
    }
    await syncRealDirectory(dirname(parent), `${label} parent entry directory`);
  } else if (!existing.isDirectory() || existing.isSymbolicLink()) {
    throw new Error(`${label} parent must be a real directory.`);
  }
  return parent;
}

function resolveTestOnlyHooks(options) {
  const hooks = options.testOnlyHooks ?? {};
  if (hooks === null || typeof hooks !== "object" || Array.isArray(hooks)) {
    throw new Error("Surface HIL decision testOnlyHooks must be an object.");
  }
  const supported = new Set([
    "afterTemporaryFileSync",
    "afterPublishBeforeDirectorySync",
    "afterForeignTemporaryRestore",
  ]);
  if (Object.keys(hooks).some((key) => !supported.has(key))) {
    throw new Error("Surface HIL decision testOnlyHooks contains an unsupported hook.");
  }
  for (const key of supported) {
    if (Object.hasOwn(hooks, key) && typeof hooks[key] !== "function") {
      throw new Error(`Surface HIL decision ${key} hook must be a function.`);
    }
  }
  if (Object.keys(hooks).length > 0 && options.testOnly !== true) {
    throw new Error("Surface HIL decision hooks require testOnly=true.");
  }
  return hooks;
}

async function writeTemporaryDecisionFile(path, bytes, label) {
  const handle = await open(path, "wx", 0o600);
  let info;
  try {
    await handle.writeFile(bytes);
    await handle.sync();
    info = await handle.stat();
    if (!info.isFile()) throw new Error(`${label} temporary path must be a real file.`);
  } finally {
    await handle.close();
  }
  const readback = await readStableRegularFile(path, `${label} temporary`);
  if (
    readback.info.dev !== info.dev
    || readback.info.ino !== info.ino
    || !readback.bytes.equals(bytes)
  ) throw new Error(`${label} temporary readback drifted.`);
  return info;
}

async function restoreQuarantinedReplacement({
  releasePath,
  temporaryPath,
  replacementInfo,
  parent,
  label,
  hooks,
}) {
  try {
    await link(releasePath, temporaryPath);
  } catch (error) {
    if (error?.code !== "EEXIST") {
      throw new Error(
        `${label} foreign temporary replacement is preserved in quarantine; manual restore is required: ${error.message}`,
      );
    }
    const current = await lstatOrNull(temporaryPath);
    if (
      !current
      || current.dev !== replacementInfo.dev
      || current.ino !== replacementInfo.ino
    ) {
      throw new Error(
        `${label} foreign temporary replacement is preserved in quarantine because its live path was reused.`,
      );
    }
  }
  const restored = await lstatOrNull(temporaryPath);
  if (
    !restored
    || restored.dev !== replacementInfo.dev
    || restored.ino !== replacementInfo.ino
  ) {
    throw new Error(`${label} foreign temporary replacement restoration drifted; quarantine is preserved.`);
  }
  await syncRealDirectory(parent, `${label} foreign temporary restoration directory`);
  if (typeof hooks.afterForeignTemporaryRestore === "function") {
    await hooks.afterForeignTemporaryRestore({
      temporaryPath,
      quarantinePath: releasePath,
    });
  }
  const releaseCurrent = await lstatOrNull(releasePath);
  if (
    !releaseCurrent
    || releaseCurrent.dev !== replacementInfo.dev
    || releaseCurrent.ino !== replacementInfo.ino
  ) {
    throw new Error(`${label} foreign temporary quarantine drifted after restoration; manual audit is required.`);
  }
  const liveCurrent = await lstatOrNull(temporaryPath);
  if (
    !liveCurrent
    || liveCurrent.dev !== replacementInfo.dev
    || liveCurrent.ino !== replacementInfo.ino
  ) {
    throw new Error(
      `${label} foreign temporary replacement is preserved in quarantine because its live path changed after restoration.`,
    );
  }
  throw new Error(
    `${label} temporary ownership drifted; foreign replacement was restored and preserved in quarantine.`,
  );
}

async function quarantineAndUnlinkOwnedTemporary(root, path, expected, bytes, parent, label, hooks) {
  const quarantineRoot = join(root, "exports/locks/file-release-quarantine");
  await assertNoSymlinkAncestors(root, quarantineRoot, `${label} temporary quarantine root`);
  await mkdir(quarantineRoot, { recursive: true, mode: 0o700 });
  await assertNoSymlinkAncestors(root, quarantineRoot, `${label} temporary quarantine root`);
  const quarantineInfo = await lstat(quarantineRoot);
  if (
    !quarantineInfo.isDirectory()
    || quarantineInfo.isSymbolicLink()
    || (quarantineInfo.mode & 0o077) !== 0
    || quarantineInfo.dev !== expected.dev
  ) {
    throw new Error(
      `${label} temporary quarantine must be a real same-filesystem private directory; temporary is preserved.`,
    );
  }
  await syncRealDirectory(dirname(quarantineRoot), `${label} temporary quarantine parent directory`);
  const releasePath = join(
    quarantineRoot,
    `file.released-${process.pid}-${randomBytes(16).toString("hex")}-${String(expected.dev)}-${String(expected.ino)}`,
  );
  try {
    await rename(path, releasePath);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw new Error(`${label} temporary could not enter private quarantine; it is preserved: ${error.message}`);
  }
  await syncRealDirectory(parent, `${label} temporary quarantine source directory`);
  await syncRealDirectory(quarantineRoot, `${label} temporary quarantine directory`);

  const quarantinedInfo = await lstatOrNull(releasePath);
  if (!quarantinedInfo) {
    throw new Error(`${label} temporary quarantine entry disappeared; manual audit is required.`);
  }
  const owned = quarantinedInfo.isFile()
    && !quarantinedInfo.isSymbolicLink()
    && quarantinedInfo.dev === expected.dev
    && quarantinedInfo.ino === expected.ino;
  if (!owned) {
    await restoreQuarantinedReplacement({
      releasePath,
      temporaryPath: path,
      replacementInfo: quarantinedInfo,
      parent,
      label,
      hooks,
    });
  }
  const readback = await readStableRegularFile(releasePath, `${label} released temporary`);
  if (
    readback.info.dev !== expected.dev
    || readback.info.ino !== expected.ino
    || !readback.bytes.equals(bytes)
  ) {
    await restoreQuarantinedReplacement({
      releasePath,
      temporaryPath: path,
      replacementInfo: readback.info,
      parent,
      label,
      hooks,
    });
  }
  const releaseCurrent = await lstatOrNull(releasePath);
  if (
    !releaseCurrent
    || releaseCurrent.dev !== expected.dev
    || releaseCurrent.ino !== expected.ino
  ) throw new Error(`${label} released temporary ownership drifted; quarantine is preserved.`);
  await unlink(releasePath);
  await syncRealDirectory(quarantineRoot, `${label} released temporary cleanup directory`);
}

async function writeCrashSafeExclusiveOrReuse({ root, path, bytes, label, hooks }) {
  const parent = await ensureDecisionDirectory(root, path, label);
  await assertNoSymlinkAncestors(root, path, label);
  const existing = await lstatOrNull(path);
  if (existing) {
    const current = await readStableRegularFile(path, label);
    if (!current.bytes.equals(bytes)) throw new Error(`${label} already exists with different bytes.`);
    await syncRealDirectory(parent, `${label} reuse directory`);
    return "reused";
  }

  const temporary = join(
    parent,
    `.${basename(path)}.tmp-${process.pid}-${randomBytes(12).toString("hex")}`,
  );
  await assertNoSymlinkAncestors(root, temporary, `${label} temporary`);
  let temporaryInfo;
  try {
    temporaryInfo = await writeTemporaryDecisionFile(temporary, bytes, label);
    if (typeof hooks.afterTemporaryFileSync === "function") {
      await hooks.afterTemporaryFileSync({ temporaryPath: temporary, decisionPath: path });
    }
    await assertNoSymlinkAncestors(root, path, label);
    let status = "written";
    try {
      await link(temporary, path);
      const published = await lstat(path);
      if (
        !published.isFile()
        || published.isSymbolicLink()
        || published.dev !== temporaryInfo.dev
        || published.ino !== temporaryInfo.ino
      ) throw new Error(`${label} no-clobber target ownership drifted; manual audit is required.`);
      if (typeof hooks.afterPublishBeforeDirectorySync === "function") {
        await hooks.afterPublishBeforeDirectorySync({ temporaryPath: temporary, decisionPath: path });
      }
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const current = await readStableRegularFile(path, label);
      if (!current.bytes.equals(bytes)) throw new Error(`${label} appeared concurrently with different bytes.`);
      status = "reused";
    }
    await syncRealDirectory(parent, `${label} publication directory`);
    const readback = await readStableRegularFile(path, label);
    if (
      !readback.bytes.equals(bytes)
      || (status === "written" && (
        readback.info.dev !== temporaryInfo.dev
        || readback.info.ino !== temporaryInfo.ino
      ))
    ) throw new Error(`${label} readback drifted.`);
    return status;
  } finally {
    if (temporaryInfo) {
      await quarantineAndUnlinkOwnedTemporary(
        root,
        temporary,
        temporaryInfo,
        bytes,
        parent,
        label,
        hooks,
      );
    }
  }
}

export async function writePrivateGenreSoulSurfaceHilDecision(options) {
  const root = await resolveExecutionRoot(options);
  const hooks = resolveTestOnlyHooks(options);
  const requestTarget = safeRequestPath(root, options.requestPath);
  await assertNoSymlinkAncestors(root, requestTarget.absolute, "Surface HIL request", true);
  const requestBytes = await readFile(requestTarget.absolute);
  let parsedRequest;
  try {
    parsedRequest = JSON.parse(requestBytes.toString("utf8"));
  } catch (error) {
    throw new Error(`Surface HIL request is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const batchRequest = parsedRequest?.schemaVersion === PRIVATE_GENRE_SOUL_BATCH_AMBIGUOUS_SURFACE_REQUEST_SCHEMA;
  const requestValidation = batchRequest
    ? validatePrivateGenreSoulBatchAmbiguousSurfaceRequest(requestBytes)
    : validatePrivateGenreSoulAmbiguousSurfaceRequest(requestBytes);
  if (
    requestValidation.sha256 !== requestTarget.requestSha256
    || requestValidation.request.soulId !== requestTarget.soulId
  ) throw new Error("Surface HIL request path identity drifted from its canonical bytes.");
  const findingDecision = DECISION_BY_CLI.get(options.decision);
  if (!findingDecision) throw new Error("Surface HIL decision must be approve or reject.");
  const decidedAt = typeof options.decidedAt === "string" ? new Date(options.decidedAt) : null;
  if (
    !decidedAt
    || !Number.isFinite(decidedAt.getTime())
    || decidedAt.toISOString() !== options.decidedAt
  ) {
    throw new Error("Surface HIL decision requires an explicit ISO-8601 decidedAt for deterministic retry.");
  }
  const buildDecision = batchRequest
    ? buildPrivateGenreSoulBatchAmbiguousSurfaceDecision
    : buildPrivateGenreSoulAmbiguousSurfaceDecision;
  const built = buildDecision({
    request: requestBytes,
    requestPath: options.requestPath,
    findingDecisions: requestValidation.request.findings.map((finding) => ({
      findingId: finding.findingId,
      decision: findingDecision,
    })),
    decidedByActorId: options.actorId,
    decidedByRole: "owner",
    decidedAt: options.decidedAt,
  });
  const decisionPath = options.requestPath.replace(
    "/surface-review/owner-hil/requests/",
    "/surface-review/owner-hil/decisions/",
  );
  const decisionAbsolute = resolve(root, decisionPath);
  await assertNoSymlinkAncestors(root, decisionAbsolute, "Surface HIL decision");
  const status = await writeCrashSafeExclusiveOrReuse({
    root,
    path: decisionAbsolute,
    bytes: built.bytes,
    label: "Surface HIL decision",
    hooks,
  });
  await assertNoSymlinkAncestors(root, decisionAbsolute, "Surface HIL decision", true);
  const readback = await readStableRegularFile(decisionAbsolute, "Surface HIL decision readback");
  if (!readback.bytes.equals(built.bytes)) throw new Error("Surface HIL decision readback drifted.");
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
