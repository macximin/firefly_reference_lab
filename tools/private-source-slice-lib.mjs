import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { resolveRegistryEntry, validateSourceRegistryFiles } from "./genre-soul-source-registry.mjs";

const execFileAsync = promisify(execFile);
const SHA = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const exactKeys = (value, keys, label) => {
  if (!isObject(value) || Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0")) {
    throw new Error(`${label} fields are invalid.`);
  }
};
const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const assertSha = (value, label) => { if (typeof value !== "string" || !SHA.test(value)) throw new Error(`${label} must be a full SHA-256.`); };
const assertString = (value, label) => { if (typeof value !== "string" || !value) throw new Error(`${label} must be a non-empty string.`); };

export function validatePrivateSourceSliceWorkOrder(value) {
  exactKeys(value, ["schemaVersion", "workOrderId", "repo", "capability", "executionMode", "approvalMode", "adapterContract", "sourceSlice", "sourceRegistry", "grant"], "source slice WorkOrder");
  if (value.schemaVersion !== 2 || !UUID.test(value.workOrderId) || value.repo !== "firefly_reference_lab"
    || value.capability !== "private-source-slice" || value.executionMode !== "human-source-review"
    || value.approvalMode !== "human" || value.adapterContract !== "reference-source-slice/v1") {
    throw new Error("Source slice WorkOrder authority is invalid.");
  }
  const slice = value.sourceSlice;
  exactKeys(slice, ["requestId", "packetId", "packetSha256", "matchId", "selectorSha256", "selector", "maxBytes"], "sourceSlice");
  if (!UUID.test(slice.requestId) || !/^frp-[0-9a-f]{24}$/u.test(slice.packetId) || !/^fsm-[0-9a-f]{24}$/u.test(slice.matchId)) throw new Error("Source slice identities are invalid.");
  assertSha(slice.packetSha256, "packet SHA");
  assertSha(slice.selectorSha256, "selector SHA");
  if (!Number.isInteger(slice.maxBytes) || slice.maxBytes < 1 || slice.maxBytes > 32_768) throw new Error("Source slice maxBytes is invalid.");
  const selector = slice.selector;
  exactKeys(selector, ["coordinateKind", "sourceId", "sourceSha256", "startByte", "endByte", "expectedSliceSha256"], "source selector");
  if (selector.coordinateKind !== "utf8-byte") throw new Error("Source selector must use utf8-byte coordinates.");
  assertString(selector.sourceId, "source ID");
  assertSha(selector.sourceSha256, "source SHA");
  assertSha(selector.expectedSliceSha256, "expected slice SHA");
  if (!Number.isInteger(selector.startByte) || selector.startByte < 0 || !Number.isInteger(selector.endByte)
    || selector.endByte <= selector.startByte || selector.endByte - selector.startByte > slice.maxBytes) {
    throw new Error("Source selector byte range is invalid.");
  }
  const registry = value.sourceRegistry;
  exactKeys(registry, ["receiptRepo", "receiptCommit", "receiptPath", "receiptSha256", "privateRegistryPath", "declaredPrivateRegistrySha256"], "source registry binding");
  if (registry.receiptRepo !== "firefly_reference_lab" || !COMMIT.test(registry.receiptCommit)) throw new Error("Source registry repository binding is invalid.");
  for (const key of ["receiptPath", "privateRegistryPath"]) assertSafeRelative(registry[key], `source registry ${key}`);
  assertSha(registry.receiptSha256, "registry receipt SHA");
  assertSha(registry.declaredPrivateRegistrySha256, "declared private registry SHA");
  const grant = value.grant;
  exactKeys(grant, ["issuer", "audience", "actorId", "authenticatedRole", "ownerScope", "requestId", "packetId", "packetSha256", "matchId", "selectorSha256", "coordinateKind", "sourceId", "sourceSha256", "startByte", "endByte", "expectedSliceSha256", "maxBytes", "expiresAt", "jti", "verifiedGrantSha256"], "verified grant");
  if (grant.issuer !== "storyyard" || grant.audience !== "firefly-hq-source-slice" || grant.authenticatedRole !== "admin") throw new Error("Verified grant authority is invalid.");
  for (const key of ["actorId", "ownerScope", "jti"]) assertString(grant[key], `grant ${key}`);
  assertSha(grant.verifiedGrantSha256, "verified grant SHA");
  if (!Number.isFinite(Date.parse(grant.expiresAt))) throw new Error("Verified grant expiry is invalid.");
  const equality = [
    [grant.requestId, slice.requestId], [grant.packetId, slice.packetId], [grant.packetSha256, slice.packetSha256],
    [grant.matchId, slice.matchId], [grant.selectorSha256, slice.selectorSha256],
    [grant.coordinateKind, selector.coordinateKind], [grant.sourceId, selector.sourceId], [grant.sourceSha256, selector.sourceSha256],
    [grant.startByte, selector.startByte], [grant.endByte, selector.endByte], [grant.expectedSliceSha256, selector.expectedSliceSha256],
    [grant.maxBytes, slice.maxBytes],
  ];
  if (equality.some(([left, right]) => left !== right)) throw new Error("Verified grant claims do not exactly match the host selector.");
  return value;
}

export async function resolvePrivateSourceSlice(workOrder, options = {}) {
  validatePrivateSourceSliceWorkOrder(workOrder);
  const repositoryRoot = resolve(options.repositoryRoot ?? fileURLToPath(new URL("..", import.meta.url)));
  const currentCommit = options.repositoryCommit ?? (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot })).stdout.trim();
  if (currentCommit !== workOrder.sourceRegistry.receiptCommit) throw new Error("Reference Lab commit drifted from the WorkOrder registry binding.");
  const receiptPath = safeInside(repositoryRoot, workOrder.sourceRegistry.receiptPath, "registry receipt");
  const privateRegistryPath = safeInside(repositoryRoot, workOrder.sourceRegistry.privateRegistryPath, "private registry");
  const receiptBytes = await readFile(receiptPath);
  const registryBytes = await readFile(privateRegistryPath);
  if (sha256(receiptBytes) !== workOrder.sourceRegistry.receiptSha256) throw new Error("Tracked registry receipt byte SHA-256 mismatch.");
  if (sha256(registryBytes) !== workOrder.sourceRegistry.declaredPrivateRegistrySha256) throw new Error("Actual private registry byte SHA-256 mismatch.");
  const { privateRegistry, receipt } = await validateSourceRegistryFiles({
    repositoryRoot,
    inventoryPath: safeInside(repositoryRoot, JSON.parse(receiptBytes.toString("utf8")).inventoryPath, "tracked inventory"),
    privateRegistryPath,
    receiptPath,
    verifyAvailableBytes: false,
  });
  if (receipt.privateRegistrySha256 !== workOrder.sourceRegistry.declaredPrivateRegistrySha256) throw new Error("Registry receipt does not bind the actual private registry bytes.");
  const entry = resolveRegistryEntry(privateRegistry, workOrder.sourceSlice.selector.sourceId);
  if (entry.sourceSha256 !== workOrder.sourceSlice.selector.sourceSha256) throw new Error("Registered source SHA-256 differs from the selector.");
  const sourcePath = safeInside(repositoryRoot, entry.repoRelativePath, "private source");
  await assertNoSymlinkPath(repositoryRoot, entry.repoRelativePath);
  const sourceRoot = safeInside(repositoryRoot, privateRegistry.sourceRoot, "private source root");
  const [realRoot, realSource, sourceStat] = await Promise.all([realpath(sourceRoot), realpath(sourcePath), lstat(sourcePath)]);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink() || !isInside(realRoot, realSource)) throw new Error("Private source escaped the configured read scope.");
  const sourceBytes = await readFile(realSource);
  if (sourceBytes.byteLength !== entry.sizeBytes || sha256(sourceBytes) !== entry.sourceSha256) throw new Error("Private source byte readback failed.");
  const { startByte, endByte, expectedSliceSha256 } = workOrder.sourceSlice.selector;
  if (endByte > sourceBytes.byteLength) throw new Error("Source selector exceeds the registered source bytes.");
  const slice = sourceBytes.subarray(startByte, endByte);
  if (sha256(slice) !== expectedSliceSha256) throw new Error("Resolved source slice SHA-256 mismatch.");
  try { new TextDecoder("utf-8", { fatal: true }).decode(slice); }
  catch { throw new Error("Resolved source slice does not align to UTF-8 boundaries."); }
  const resolvedAt = options.resolvedAt ?? new Date().toISOString();
  return {
    bytes: slice,
    receipt: {
      schemaVersion: "source-access-receipt/v1",
      requestId: workOrder.sourceSlice.requestId,
      actorId: workOrder.grant.actorId,
      actorRole: workOrder.grant.authenticatedRole,
      ownerScope: workOrder.grant.ownerScope,
      verifiedGrantSha256: workOrder.grant.verifiedGrantSha256,
      packetId: workOrder.sourceSlice.packetId,
      packetSha256: workOrder.sourceSlice.packetSha256,
      matchId: workOrder.sourceSlice.matchId,
      selectorSha256: workOrder.sourceSlice.selectorSha256,
      sourceId: entry.sourceId,
      sourceSha256: entry.sourceSha256,
      startByte,
      endByte,
      returnedByteCount: slice.byteLength,
      sliceSha256: expectedSliceSha256,
      trackedRegistryReceiptSha256: workOrder.sourceRegistry.receiptSha256,
      actualPrivateRegistrySha256: workOrder.sourceRegistry.declaredPrivateRegistrySha256,
      repositoryCommit: currentCommit,
      result: "provided",
      resolvedAt,
      rawSourcePersisted: false,
    },
  };
}

function assertSafeRelative(value, label) {
  if (typeof value !== "string" || !value || isAbsolute(value) || value.split(/[\\/]/u).includes("..")) throw new Error(`${label} must be repository-relative.`);
}

function safeInside(root, relativePath, label) {
  assertSafeRelative(relativePath, label);
  const absolute = resolve(root, relativePath);
  if (!isInside(root, absolute)) throw new Error(`${label} escaped Reference Lab.`);
  return absolute;
}

function isInside(root, target) {
  const rel = relative(root, target);
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

async function assertNoSymlinkPath(root, relativePath) {
  const segments = relativePath.split(/[\\/]/u).filter(Boolean);
  let current = root;
  for (const segment of segments) {
    current = resolve(current, segment);
    if ((await lstat(current)).isSymbolicLink()) throw new Error("Private source path contains a symbolic link.");
  }
}
