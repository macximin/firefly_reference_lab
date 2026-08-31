import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  access,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";

export const HERMES_STRUCTURED_MODEL = "gpt-5.6-sol";
export const HERMES_STRUCTURED_PROVIDER = "openai-codex";
export const HERMES_STRUCTURED_REASONING = "high";
export const HERMES_READ_ONLY_TOOLSET = "firefly-source-read";
export const HERMES_READ_ONLY_TOOL = "firefly_read_source";
const HERMES_TOOL_DESCRIBE = "tool_describe";
export const HERMES_STRUCTURED_ATTEMPT_EVIDENCE_FILENAMES = Object.freeze([
  "candidate-output.txt",
  "completed.json",
  "host-receipt.json",
  "input-attestation.json",
  "read-capability.json",
  "result.json",
  "session.jsonl",
  "usage.json",
]);

export function validateHermesStructuredAttemptEvidenceFileNames(fileNames) {
  if (
    !Array.isArray(fileNames)
    || fileNames.some((name) => typeof name !== "string")
    || !isDeepStrictEqual([...fileNames].sort(), HERMES_STRUCTURED_ATTEMPT_EVIDENCE_FILENAMES)
  ) {
    throw new Error("Hermes structured attempt evidence file set drifted.");
  }
  return true;
}
export const FICTION_CONTENT_CONTRACT_ID = "fiction-content-neutral-ko/v1";
export const FICTION_CONTENT_CONTRACT_SHA256 = "c5b531577cbfbfb1dfc4cd2b5cb82d7ce796c6958e0bc00c3e180b0e5440e199";

const RECEIPT_SCHEMA = "private-hermes-structured-run-receipt/v1";
export const HERMES_STRUCTURED_ATTEMPT_INPUT_ATTESTATION_SCHEMA = "private-hermes-structured-attempt-input-attestation/v1";
const ATTEMPT_COMPLETION_SCHEMA = "private-hermes-structured-attempt-completion/v1";
const COMPLETED_POINTER_SCHEMA = "private-hermes-structured-completed-pointer/v1";
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const CURRENT_RUNTIME_ATTESTATION = "current-attested";
const MAX_FINGERPRINT_BYTES = 512 * 1024 * 1024;
const CONTEXT_PROXY_BYTES_PER_TOKEN = 2;
const CONTEXT_STATIC_PROMPT_RESERVE_TOKENS = 16_384;
const READ_CAPABILITY_SCHEMA = "private-hermes-exact-input-read-capability/v3";
const READ_PLUGIN_PLANNING_EVIDENCE_SCHEMA = "hermes-exact-input-plugin-planning-evidence/v1";
export const HERMES_EXACT_INPUT_AUTH_PROJECTION_CONTRACT = "hermes-global-auth-store-adapter/v1";
const READ_AUTH_ADAPTER_PLANNING_EVIDENCE_SCHEMA = "hermes-auth-store-adapter-planning-evidence/v1";
const READ_MANIFEST_SCHEMA = "firefly-hermes-read-manifest/v1";
const READ_RESULT_SCHEMA = "firefly-hermes-read-result/v2";
const READ_SOURCE_MAX_BYTES = 4_500_000;
const READ_CHUNK_ENCODED_CONTENT_MAX_CHARS = 75_000;
const READ_CHUNK_RESULT_MAX_CHARS = 80_000;
const READ_CURSOR_PATTERN = /^cursor-[a-f0-9]{64}$/u;
const READ_EXECUTION_TEMP_PREFIX = "firefly-hermes-readonly-";
const READ_EXECUTION_FORBIDDEN_CREDENTIAL_NAMES = Object.freeze([
  ".anthropic_oauth.json",
  ".env",
  "auth.json",
  "credentials.json",
  "oauth.json",
  "tokens.json",
]);
const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const READ_PLUGIN_SOURCE_ROOT = join(moduleDirectory, "hermes-plugins/firefly-source-read");
const READ_PLUGIN_FILES = Object.freeze(["__init__.py", "plugin.yaml", "reader.py"]);
const READ_AUTH_ADAPTER_SOURCE_ROOT = join(moduleDirectory, "hermes-runtime/firefly-auth-store");
const READ_AUTH_ADAPTER_FILES = Object.freeze(["sitecustomize.py"]);
const READ_AUTH_ADAPTER_DIRECTORY = "hermes-auth-adapter";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function exactUtf8Text(bytes, label) {
  const text = bytes.toString("utf8");
  if (Buffer.from(text, "utf8").compare(bytes) !== 0) throw new Error(`${label} must be valid UTF-8.`);
  return text.replace(/\r\n/gu, "\n");
}

function validateCanonicalProfileConfig(configBytes, profileId) {
  const configText = exactUtf8Text(configBytes, `Hermes profile config ${profileId}`);
  const expected = [
    "model:",
    "  provider: openai-codex",
    "  default: gpt-5.6-sol",
    "agent:",
    "  reasoning_effort: high",
    "",
  ].join("\n");
  if (configText !== expected) {
    throw new Error(`Hermes profile is not gpt-5.6-sol/openai-codex/high canonical config: ${profileId}`);
  }
  return configText;
}

function parseContextLimitEntry(contextLimitEntryBytes) {
  const contextEntry = exactUtf8Text(contextLimitEntryBytes, "Hermes context limit entry");
  const contextMatch = /^gpt-5\.6-sol@https:\/\/chatgpt\.com\/backend-api\/codex: ([1-9]\d*)$/u.exec(contextEntry);
  const contextLimit = Number(contextMatch?.[1]);
  if (!Number.isSafeInteger(contextLimit) || contextLimit < 100_000) {
    throw new Error("Hermes context limit readback is invalid.");
  }
  return { contextEntry, contextLimit };
}

export function extractHermesContextLimitEntry(contextCacheBytes) {
  if (!Buffer.isBuffer(contextCacheBytes)) throw new Error("Hermes context cache must be a byte buffer.");
  const text = exactUtf8Text(contextCacheBytes, "Hermes context cache");
  const activeLines = text.split("\n")
    .filter((line) => line.trim() !== "" && !line.trimStart().startsWith("#"));
  if (activeLines[0] !== "context_lengths:" || activeLines.length < 2) {
    throw new Error("Hermes context cache must contain one context_lengths mapping.");
  }
  for (const line of activeLines.slice(1)) {
    if (!/^  [^\s].*: [1-9]\d*$/u.test(line)) {
      throw new Error("Hermes context cache contains a non-canonical active entry.");
    }
  }
  const target = activeLines.slice(1).filter((line) => (
    /^  gpt-5\.6-sol@https:\/\/chatgpt\.com\/backend-api\/codex: [1-9]\d*$/u.test(line)
  ));
  if (target.length !== 1) throw new Error("Hermes context cache must contain exactly one gpt-5.6-sol Codex entry.");
  const entryBytes = Buffer.from(target[0].slice(2));
  parseContextLimitEntry(entryBytes);
  return entryBytes;
}

function parseStructuredJson(text) {
  if (typeof text !== "string") throw new Error("Hermes structured output must be text.");
  const trimmed = text.trim();
  const candidate = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, "")
    : trimmed;
  return JSON.parse(candidate);
}

function assertSha256(value, label) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  }
}

function assertNonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer.`);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
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

async function ensureRealAbsoluteDirectory(targetPath, label) {
  const target = resolve(targetPath);
  const missing = [];
  const ancestry = [];
  let cursor = target;
  while (true) {
    ancestry.push(cursor);
    const info = await lstatOrNull(cursor);
    if (info) {
      if (!info.isDirectory() || info.isSymbolicLink()) {
        throw new Error(`${label} has a non-directory or symbolic-link component.`);
      }
    } else {
      missing.push(cursor);
    }
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  for (const path of missing.reverse()) {
    try {
      await mkdir(path);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error(`${label} has a non-directory or symbolic-link component.`);
    }
  }
  for (const path of ancestry.reverse()) {
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error(`${label} has a non-directory or symbolic-link component.`);
    }
  }
  return target;
}

async function assertRealRunPath(runRoot, targetPath, label, options = {}) {
  const root = resolve(runRoot);
  const target = resolve(targetPath);
  const rel = relative(root, target);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`${label} escapes the structured run root.`);
  const rootInfo = await lstatOrNull(root);
  if (!rootInfo || !rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error("Hermes structured run root must be a real non-symlink directory.");
  }
  let cursor = root;
  const segments = rel.split(sep).filter(Boolean);
  for (const [index, segment] of segments.entries()) {
    cursor = join(cursor, segment);
    const info = await lstatOrNull(cursor);
    if (!info) {
      if (options.requireExisting === true) throw new Error(`${label} is missing.`);
      break;
    }
    if (info.isSymbolicLink()) throw new Error(`${label} has a symlinked path component.`);
    const targetEntry = index === segments.length - 1;
    if (!targetEntry && !info.isDirectory()) throw new Error(`${label} has a non-directory ancestor.`);
    if (targetEntry && options.targetType === "file" && !info.isFile()) throw new Error(`${label} must be a real file.`);
    if (targetEntry && options.targetType === "directory" && !info.isDirectory()) throw new Error(`${label} must be a real directory.`);
  }
}

async function writeTemporaryRegularFile(path, bytes) {
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Temporary evidence path is not a real file: ${path}`);
}

async function atomicReplaceRunFile(runRoot, path, bytes, label) {
  await assertRealRunPath(runRoot, dirname(path), `${label} parent`, {
    requireExisting: true,
    targetType: "directory",
  });
  await assertRealRunPath(runRoot, path, label);
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`;
  try {
    await writeTemporaryRegularFile(temporary, bytes);
    await rename(temporary, path);
  } finally {
    try {
      await unlink(temporary);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  await assertRealRunPath(runRoot, path, label, { requireExisting: true, targetType: "file" });
}

async function atomicCreateRunFile(runRoot, path, bytes, label) {
  await assertRealRunPath(runRoot, dirname(path), `${label} parent`, {
    requireExisting: true,
    targetType: "directory",
  });
  await assertRealRunPath(runRoot, path, label);
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`;
  try {
    await writeTemporaryRegularFile(temporary, bytes);
    await link(temporary, path);
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error(`${label} appeared concurrently or is a symbolic link.`);
    throw error;
  } finally {
    try {
      await unlink(temporary);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  await assertRealRunPath(runRoot, path, label, { requireExisting: true, targetType: "file" });
}

function runCommand(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      const output = Buffer.concat(stdout).toString("utf8");
      const errorOutput = Buffer.concat(stderr).toString("utf8");
      if (code !== 0) {
        reject(new Error(`${command} failed (${String(code)}/${String(signal)}): ${errorOutput.slice(-2000)}`));
        return;
      }
      resolvePromise({ stdout: output, stderr: errorOutput });
    });
  });
}

async function tryRunCommand(command, args, options = {}) {
  try {
    return { ok: true, ...(await runCommand(command, args, options)) };
  } catch (error) {
    return { ok: false, stdout: "", stderr: String(error?.message ?? error) };
  }
}

function inside(root, target) {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}

async function regularFileIdentity(path, label) {
  const invocationPath = resolve(path);
  const invocationInfo = await lstat(invocationPath);
  if (!invocationInfo.isFile() && !invocationInfo.isSymbolicLink()) {
    throw new Error(`${label} invocation must be a file or symbolic link.`);
  }
  const resolvedPath = await realpath(invocationPath);
  const info = await lstat(resolvedPath);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${label} must resolve to a real file.`);
  const bytes = await readFile(resolvedPath);
  return {
    path: invocationPath,
    invocationPath,
    invocationType: invocationInfo.isSymbolicLink() ? "symbolic-link" : "file",
    invocationLinkTarget: invocationInfo.isSymbolicLink() ? await readlink(invocationPath) : null,
    resolvedPath,
    sizeBytes: bytes.byteLength,
    sha256: sha256(bytes),
  };
}

async function hashRelativeFileSet(root, relativePaths, label) {
  const entries = [];
  let totalBytes = 0;
  for (const relativePath of [...new Set(relativePaths)].sort()) {
    const absolute = resolve(root, relativePath);
    if (!inside(root, absolute)) throw new Error(`${label} path escaped its root: ${relativePath}`);
    const info = await lstatOrNull(absolute);
    if (!info) continue;
    if (info.isSymbolicLink()) {
      throw new Error(`${label} contains a symbolic link: ${relativePath} -> ${await readlink(absolute)}`);
    }
    if (!info.isFile()) throw new Error(`${label} contains a non-file entry: ${relativePath}`);
    const bytes = await readFile(absolute);
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_FINGERPRINT_BYTES) {
      throw new Error(`${label} exceeds its deterministic fingerprint byte limit.`);
    }
    entries.push({ path: relativePath, type: "file", sizeBytes: bytes.byteLength, sha256: sha256(bytes) });
  }
  return { entries, totalBytes, sha256: sha256(jsonBytes(entries)) };
}

async function listFilesRecursively(root, relativeRoot) {
  const start = resolve(root, relativeRoot);
  const startInfo = await lstatOrNull(start);
  if (!startInfo) return [];
  if (startInfo.isSymbolicLink()) return [relativeRoot];
  if (startInfo.isFile()) return [relativeRoot];
  if (!startInfo.isDirectory()) throw new Error(`Runtime fingerprint path is not a file or directory: ${relativeRoot}`);
  const files = [];
  const queue = [relativeRoot];
  while (queue.length > 0) {
    const current = queue.shift();
    const absolute = resolve(root, current);
    const entries = await readdir(absolute, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const child = join(current, entry.name);
      if (entry.isDirectory()) queue.push(child);
      else files.push(child);
    }
  }
  return files;
}

async function loadInstallGitEvidence(installDirectory, commandOptions = {}) {
  if (!installDirectory) return { mode: "standalone-executable" };
  const gitCommand = await resolveHermesExecutable("git");
  const gitIdentity = await regularFileIdentity(gitCommand, "Git executable");
  const head = await tryRunCommand(gitCommand, ["-C", installDirectory, "rev-parse", "HEAD"], commandOptions);
  const tree = await tryRunCommand(gitCommand, ["-C", installDirectory, "rev-parse", "HEAD^{tree}"], commandOptions);
  if (!head.ok || !tree.ok) return { mode: "non-git-install" };
  const [diff, untracked, submodules] = await Promise.all([
    runCommand(gitCommand, ["-C", installDirectory, "diff", "--binary", "HEAD", "--"], commandOptions),
    runCommand(gitCommand, ["-C", installDirectory, "ls-files", "--others", "--exclude-standard", "-z"], commandOptions),
    tryRunCommand(gitCommand, ["-C", installDirectory, "submodule", "status", "--recursive"], commandOptions),
  ]);
  const untrackedPaths = untracked.stdout.split("\0").filter(Boolean);
  const untrackedEvidence = await hashRelativeFileSet(
    installDirectory,
    untrackedPaths,
    "Hermes untracked implementation",
  );
  return {
    mode: "git-install",
    gitExecutable: publicFileIdentity(gitIdentity),
    head: head.stdout.trim(),
    tree: tree.stdout.trim(),
    worktreeDiffSha256: sha256(Buffer.from(diff.stdout)),
    untrackedSha256: untrackedEvidence.sha256,
    submoduleStatusSha256: sha256(Buffer.from(submodules.stdout)),
  };
}

async function loadProfilePromptContextEvidence(profileHome) {
  const root = await realpath(resolve(profileHome));
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error("Hermes profile home must resolve to a real directory.");
  }
  const direct = [
    ".env",
    "config.yaml",
    "SOUL.md",
    "USER.md",
    "profile.yaml",
    ".no-bundled-skills",
    ".skills_prompt_snapshot.json",
  ];
  const recursive = [];
  for (const directory of ["skills", "plugins", "memories"]) {
    recursive.push(...await listFilesRecursively(root, directory));
  }
  const files = await hashRelativeFileSet(root, [...direct, ...recursive], "Hermes profile prompt context");
  const evidence = { profileHome: root, fileSetSha256: files.sha256, totalBytes: files.totalBytes };
  return { evidence, totalBytes: files.totalBytes, sha256: sha256(jsonBytes(evidence)) };
}

const HERMES_CANONICAL_ENV_KEYS = new Set([
  "HERMES_CONTEXT_CACHE_PATH",
  "HERMES_HOME",
  "TERMINAL_CWD",
  "TERMINAL_ENV",
]);
const HERMES_EPHEMERAL_BUNDLED_PLUGINS_KEY = "HERMES_BUNDLED_PLUGINS";
const HERMES_EPHEMERAL_BUNDLED_PLUGINS_DIRECTORY = "hermes-bundled-plugins";

const HERMES_EXACT_ENV_OVERRIDES = new Set([
  "AWS_CA_BUNDLE",
  "BASH_ENV",
  "CURL_CA_BUNDLE",
  "DENO_CERT",
  "ENV",
  "GRPC_DEFAULT_SSL_ROOTS_FILE_PATH",
  "LD_LIBRARY_PATH",
  "LD_PRELOAD",
  "NPM_CONFIG_CAFILE",
  "NODE_EXTRA_CA_CERTS",
  "NODE_OPTIONS",
  "NODE_PATH",
  "OPENSSL_CONF",
  "PIP_CERT",
  "REQUESTS_CA_BUNDLE",
  "SSL_CERT_DIR",
  "SSL_CERT_FILE",
]);

function isHermesExecutionOverride(key) {
  return key.startsWith("HERMES_")
    || key.startsWith("_HERMES_")
    || key.startsWith("FIREFLY_HERMES_")
    || key.startsWith("CODEX_")
    || key.startsWith("_CODEX_")
    || key.startsWith("OPENAI_")
    || key.startsWith("ANTHROPIC_")
    || key.startsWith("OPENROUTER_")
    || key.startsWith("GIT_")
    || key.startsWith("PYTHON")
    || key.startsWith("DYLD_")
    || key.startsWith("TERMINAL_")
    || /^(?:all|http|https|no)_proxy$/iu.test(key)
    || HERMES_EXACT_ENV_OVERRIDES.has(key.toUpperCase());
}

export function buildHermesExecutionEnvironment({
  profileHome,
  projectCwd,
  contextCachePath,
  bundledPluginsPath,
} = {}) {
  if (typeof profileHome !== "string" || profileHome.length < 1) throw new Error("Hermes execution profile home is required.");
  if (typeof projectCwd !== "string" || projectCwd.length < 1) throw new Error("Hermes execution project cwd is required.");
  const absoluteProfileHome = resolve(profileHome);
  const absoluteProjectCwd = resolve(projectCwd);
  const absoluteContextCachePath = resolve(contextCachePath
    ?? join(dirname(dirname(absoluteProfileHome)), "context_length_cache.yaml"));
  let absoluteBundledPluginsPath = null;
  if (bundledPluginsPath !== undefined) {
    if (typeof bundledPluginsPath !== "string" || bundledPluginsPath.length < 1) {
      throw new Error("Hermes bundled plugin discovery path must be non-empty text.");
    }
    absoluteBundledPluginsPath = resolve(bundledPluginsPath);
    const expectedBundledPluginsPath = join(
      dirname(dirname(dirname(absoluteProfileHome))),
      HERMES_EPHEMERAL_BUNDLED_PLUGINS_DIRECTORY,
    );
    if (absoluteBundledPluginsPath !== expectedBundledPluginsPath) {
      throw new Error("Hermes bundled plugin discovery path escaped the ephemeral capsule boundary.");
    }
  }
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (isHermesExecutionOverride(key)) delete env[key];
  }
  env.HERMES_HOME = absoluteProfileHome;
  env.HERMES_CONTEXT_CACHE_PATH = absoluteContextCachePath;
  env.TERMINAL_CWD = absoluteProjectCwd;
  env.TERMINAL_ENV = "local";
  env.PYTHONDONTWRITEBYTECODE = "1";
  env.GIT_OPTIONAL_LOCKS = "0";
  if (absoluteBundledPluginsPath) {
    env[HERMES_EPHEMERAL_BUNDLED_PLUGINS_KEY] = absoluteBundledPluginsPath;
  }
  delete env.PYTHONHOME;
  delete env.PYTHONPATH;
  const descriptor = {
    profileHome: absoluteProfileHome,
    projectCwd: absoluteProjectCwd,
    contextCachePath: absoluteContextCachePath,
    terminalCwd: env.TERMINAL_CWD,
    terminalEnvironment: env.TERMINAL_ENV,
    pythonDontWriteBytecode: env.PYTHONDONTWRITEBYTECODE,
    gitOptionalLocks: env.GIT_OPTIONAL_LOCKS,
    pathSha256: sha256(Buffer.from(env.PATH ?? "")),
    homeSha256: sha256(Buffer.from(env.HOME ?? "")),
    configuredTimeZone: (env.TZ ?? "").trim() || null,
    canonicalOverrideKeys: [
      ...HERMES_CANONICAL_ENV_KEYS,
      ...(absoluteBundledPluginsPath ? [HERMES_EPHEMERAL_BUNDLED_PLUGINS_KEY] : []),
    ].sort(),
    removedDynamicPrefixes: [
      "ANTHROPIC_", "CODEX_", "DYLD_", "FIREFLY_HERMES_", "GIT_", "HERMES_", "OPENAI_", "OPENROUTER_",
      "PYTHON", "TERMINAL_", "_CODEX_", "_HERMES_",
    ],
    removedProxyVariablesCaseInsensitive: ["ALL_PROXY", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY"],
    removedExactVariables: [...HERMES_EXACT_ENV_OVERRIDES].sort(),
  };
  if (absoluteBundledPluginsPath) descriptor.bundledPluginsPath = absoluteBundledPluginsPath;
  return {
    env,
    descriptor,
    descriptorSha256: sha256(jsonBytes(descriptor)),
    contextCachePath: absoluteContextCachePath,
  };
}

// Historical Survey v2 and Deep work-v2 receipts bind the exact base execution
// descriptor that existed before the auth adapter introduced FIREFLY_HERMES_*
// sanitization. Keep this reconstruction narrow and validation-only: execution
// must always use buildHermesExecutionEnvironment() and its current policy.
export function buildHistoricalHermesExecutionEnvironmentDescriptorV2({
  profileHome,
  projectCwd,
  contextCachePath,
  bundledPluginsPath,
} = {}) {
  if (typeof profileHome !== "string" || profileHome.length < 1) {
    throw new Error("Historical Hermes execution profile home is required.");
  }
  if (typeof projectCwd !== "string" || projectCwd.length < 1) {
    throw new Error("Historical Hermes execution project cwd is required.");
  }
  const absoluteProfileHome = resolve(profileHome);
  const absoluteProjectCwd = resolve(projectCwd);
  const absoluteContextCachePath = resolve(contextCachePath
    ?? join(dirname(dirname(absoluteProfileHome)), "context_length_cache.yaml"));
  let absoluteBundledPluginsPath = null;
  if (bundledPluginsPath !== undefined) {
    if (typeof bundledPluginsPath !== "string" || bundledPluginsPath.length < 1) {
      throw new Error("Historical Hermes bundled plugin discovery path must be non-empty text.");
    }
    absoluteBundledPluginsPath = resolve(bundledPluginsPath);
    const expectedBundledPluginsPath = join(
      dirname(dirname(dirname(absoluteProfileHome))),
      "hermes-bundled-plugins",
    );
    if (absoluteBundledPluginsPath !== expectedBundledPluginsPath) {
      throw new Error("Historical Hermes bundled plugin discovery path escaped the ephemeral capsule boundary.");
    }
  }
  const descriptor = {
    profileHome: absoluteProfileHome,
    projectCwd: absoluteProjectCwd,
    contextCachePath: absoluteContextCachePath,
    terminalCwd: absoluteProjectCwd,
    terminalEnvironment: "local",
    pythonDontWriteBytecode: "1",
    gitOptionalLocks: "0",
    pathSha256: sha256(Buffer.from(process.env.PATH ?? "")),
    homeSha256: sha256(Buffer.from(process.env.HOME ?? "")),
    configuredTimeZone: (process.env.TZ ?? "").trim() || null,
    canonicalOverrideKeys: [
      "HERMES_CONTEXT_CACHE_PATH",
      "HERMES_HOME",
      ...(absoluteBundledPluginsPath ? ["HERMES_BUNDLED_PLUGINS"] : []),
      "TERMINAL_CWD",
      "TERMINAL_ENV",
    ].sort(),
    removedDynamicPrefixes: [
      "ANTHROPIC_", "CODEX_", "DYLD_", "GIT_", "HERMES_", "OPENAI_", "OPENROUTER_",
      "PYTHON", "TERMINAL_", "_CODEX_", "_HERMES_",
    ],
    removedProxyVariablesCaseInsensitive: ["ALL_PROXY", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY"],
    removedExactVariables: [
      "AWS_CA_BUNDLE",
      "BASH_ENV",
      "CURL_CA_BUNDLE",
      "DENO_CERT",
      "ENV",
      "GRPC_DEFAULT_SSL_ROOTS_FILE_PATH",
      "LD_LIBRARY_PATH",
      "LD_PRELOAD",
      "NODE_EXTRA_CA_CERTS",
      "NODE_OPTIONS",
      "NODE_PATH",
      "NPM_CONFIG_CAFILE",
      "OPENSSL_CONF",
      "PIP_CERT",
      "REQUESTS_CA_BUNDLE",
      "SSL_CERT_DIR",
      "SSL_CERT_FILE",
    ].sort(),
  };
  if (absoluteBundledPluginsPath) descriptor.bundledPluginsPath = absoluteBundledPluginsPath;
  return {
    descriptor,
    descriptorSha256: sha256(jsonBytes(descriptor)),
  };
}

async function loadProjectPromptContextEvidence(projectCwd, executionEnvironment) {
  const cwd = await realpath(resolve(projectCwd));
  const cwdInfo = await lstat(cwd);
  if (!cwdInfo.isDirectory() || cwdInfo.isSymbolicLink()) throw new Error("Hermes project cwd must resolve to a real directory.");
  const gitCommand = await resolveHermesExecutable("git");
  const gitIdentity = await regularFileIdentity(gitCommand, "Git executable");
  const gitOptions = { env: executionEnvironment.env };
  const rootResult = await tryRunCommand(gitCommand, ["-C", cwd, "rev-parse", "--show-toplevel"], gitOptions);
  const root = rootResult.ok ? await realpath(rootResult.stdout.trim()) : cwd;
  if (!inside(root, cwd)) throw new Error("Hermes project cwd escaped its detected project root.");
  const relativeFiles = [];
  const common = [
    ".hermes.md", "HERMES.md", "hermes.md", "AGENTS.md", "agents.md", "CLAUDE.md", "claude.md",
    ".cursorrules", "package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "pyproject.toml",
    "uv.lock", "poetry.lock", "requirements.txt", "pytest.ini", "Makefile",
  ];
  let cursor = cwd;
  while (inside(root, cursor)) {
    for (const name of common) {
      const candidate = join(cursor, name);
      const info = await lstatOrNull(candidate);
      if (info?.isFile() || info?.isSymbolicLink()) relativeFiles.push(relative(root, candidate));
    }
    if (cursor === root) break;
    cursor = dirname(cursor);
  }
  relativeFiles.push(...await listFilesRecursively(root, ".cursor/rules"));
  const files = await hashRelativeFileSet(root, relativeFiles, "Hermes project prompt context");
  const evidence = {
    policy: "stable-project-prompt-context/v1",
    root,
    cwd,
    processPlatform: process.platform,
    processArch: process.arch,
    pathSha256: sha256(Buffer.from(executionEnvironment.env.PATH ?? "")),
    contextFilesSha256: files.sha256,
    executionEnvironmentSha256: executionEnvironment.descriptorSha256,
    gitExecutable: publicFileIdentity(gitIdentity),
    excludedVolatileProjectState: ["git-head", "git-recent-commits", "git-status", "prompt-date"],
    totalBytes: files.totalBytes,
  };
  return { evidence, totalBytes: files.totalBytes, sha256: sha256(jsonBytes(evidence)) };
}

async function resolveHermesExecutable(command) {
  const candidates = command.includes(sep) || isAbsolute(command)
    ? [resolve(command)]
    : (process.env.PATH ?? "").split(delimiter).filter(Boolean).map((entry) => join(entry, command));
  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.X_OK);
      const resolvedPath = await realpath(candidate);
      const [invocationInfo, resolvedInfo] = await Promise.all([lstat(candidate), lstat(resolvedPath)]);
      if (
        (invocationInfo.isFile() || invocationInfo.isSymbolicLink())
        && resolvedInfo.isFile()
        && !resolvedInfo.isSymbolicLink()
      ) return resolve(candidate);
    } catch (error) {
      if (["ENOENT", "EACCES", "ENOTDIR"].includes(error?.code)) continue;
      throw error;
    }
  }
  throw new Error(`Hermes executable is not available: ${command}`);
}

function canonicalVersionText(version) {
  const versionText = `${version.stdout}\n---stderr---\n${version.stderr}`;
  if (versionText.includes("\0") || Buffer.byteLength(versionText) > 16_384 || versionText.trim().length < 1) {
    throw new Error("Hermes --version output is invalid.");
  }
  return versionText;
}

async function installDirectoryFromVersion(versionText) {
  const installMatch = /^Install directory:\s*(.+?)\s*$/mu.exec(versionText);
  if (!installMatch) return null;
  const candidate = await realpath(resolve(installMatch[1]));
  const info = await lstat(candidate);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Hermes install directory is not a real directory.");
  return candidate;
}

function publicFileIdentity(identity) {
  return {
    invocationPath: identity.invocationPath,
    invocationType: identity.invocationType,
    invocationLinkTarget: identity.invocationLinkTarget,
    resolvedPath: identity.resolvedPath,
    sizeBytes: identity.sizeBytes,
    sha256: identity.sha256,
  };
}

async function loadHermesImplementationFileSet(installDirectory) {
  if (!installDirectory) return { entries: [], totalBytes: 0, sha256: sha256(jsonBytes([])) };
  const relativePaths = [];
  for (const runtimeRoot of [
    "agent",
    "hermes_cli",
    "tools",
    "plugins",
    "gateway",
    "cron",
    "acp_adapter",
    "hermes",
    "locales",
    "native",
    "optional-mcps",
    "optional-skills",
    "providers",
    "skills",
    "tui_gateway",
    "web",
  ]) {
    relativePaths.push(...await listFilesRecursively(installDirectory, runtimeRoot));
  }
  const topLevel = await readdir(installDirectory, { withFileTypes: true });
  for (const entry of topLevel) {
    if (entry.isFile() && /\.(?:json|lock|md|py|toml|ya?ml)$/u.test(entry.name)) relativePaths.push(entry.name);
    else if (entry.isSymbolicLink()) relativePaths.push(entry.name);
  }
  return hashRelativeFileSet(installDirectory, relativePaths, "Hermes loaded implementation");
}

async function loadHermesDependencyEvidence(installDirectory, hermesVersionSha256) {
  if (!installDirectory) return { mode: "standalone-version", versionSha256: hermesVersionSha256 };
  const venvRoot = join(installDirectory, "venv");
  const venvInfo = await lstatOrNull(venvRoot);
  if (!venvInfo) return { mode: "install-without-venv", versionSha256: hermesVersionSha256 };
  if (!venvInfo.isDirectory() || venvInfo.isSymbolicLink()) throw new Error("Hermes venv must be a real directory.");
  let python = null;
  try {
    python = await regularFileIdentity(join(venvRoot, "bin/python"), "Hermes delegated Python");
  } catch (error) {
    if (!["ENOENT", "ENOTDIR", "EACCES"].includes(error?.code)) throw error;
  }
  let interpreterStandardLibrary = null;
  if (python) {
    const interpreterRoot = dirname(dirname(python.resolvedPath));
    const interpreterRootInfo = await lstat(interpreterRoot);
    if (!interpreterRootInfo.isDirectory() || interpreterRootInfo.isSymbolicLink()) {
      throw new Error("Hermes delegated Python root must be a real directory.");
    }
    const standardLibraryPaths = [];
    const interpreterLibraryRoot = join(interpreterRoot, "lib");
    const interpreterLibraryInfo = await lstatOrNull(interpreterLibraryRoot);
    if (interpreterLibraryInfo) {
      if (!interpreterLibraryInfo.isDirectory() || interpreterLibraryInfo.isSymbolicLink()) {
        throw new Error("Hermes delegated Python library root must be a real directory.");
      }
      const candidates = await readdir(interpreterLibraryRoot, { withFileTypes: true });
      for (const candidate of candidates) {
        if (candidate.isDirectory() && /^python\d+(?:\.\d+)*$/u.test(candidate.name)) {
          standardLibraryPaths.push(...await listFilesRecursively(
            interpreterRoot,
            join("lib", candidate.name),
          ));
        }
      }
    }
    const standardLibrary = await hashRelativeFileSet(
      interpreterRoot,
      standardLibraryPaths,
      "Hermes delegated Python standard library",
    );
    interpreterStandardLibrary = {
      interpreterRoot,
      fileCount: standardLibrary.entries.length,
      sizeBytes: standardLibrary.totalBytes,
      sha256: standardLibrary.sha256,
    };
  }
  const sitePackageRoots = [];
  for (const libraryRoot of [join(venvRoot, "lib"), join(venvRoot, "Lib")]) {
    const libraryInfo = await lstatOrNull(libraryRoot);
    if (!libraryInfo) continue;
    if (!libraryInfo.isDirectory() || libraryInfo.isSymbolicLink()) throw new Error("Hermes venv library root must be a real directory.");
    const candidates = await readdir(libraryRoot, { withFileTypes: true });
    for (const candidate of candidates) {
      if (candidate.isDirectory() && /^python\d+(?:\.\d+)*$/u.test(candidate.name)) {
        const sitePackages = join(libraryRoot, candidate.name, "site-packages");
        if (await exists(sitePackages)) sitePackageRoots.push(relative(installDirectory, sitePackages));
      }
    }
    const directSitePackages = join(libraryRoot, "site-packages");
    if (await exists(directSitePackages)) sitePackageRoots.push(relative(installDirectory, directSitePackages));
  }
  const sitePackagePaths = [];
  for (const sitePackageRoot of [...new Set(sitePackageRoots)].sort()) {
    sitePackagePaths.push(...await listFilesRecursively(installDirectory, sitePackageRoot));
  }
  const sitePackages = await hashRelativeFileSet(
    installDirectory,
    sitePackagePaths,
    "Hermes venv site-packages",
  );
  const venvMetadataPaths = ["venv/pyvenv.cfg"];
  const metadata = await hashRelativeFileSet(installDirectory, venvMetadataPaths, "Hermes venv metadata");
  return {
    mode: "venv-byte-closure",
    python: python ? publicFileIdentity(python) : null,
    interpreterStandardLibrary,
    metadataSha256: metadata.sha256,
    sitePackageRoots: [...new Set(sitePackageRoots)].sort(),
    sitePackagesFileCount: sitePackages.entries.length,
    sitePackagesSizeBytes: sitePackages.totalBytes,
    sitePackagesSha256: sitePackages.sha256,
  };
}

async function loadBinaryMaterialSnapshot(executablePath, versionText, commandOptions) {
  const wrapper = await regularFileIdentity(executablePath, "Hermes wrapper executable");
  const executableBytes = await readFile(wrapper.resolvedPath);
  const hermesExecutableSha256 = wrapper.sha256;
  const hermesVersionSha256 = sha256(Buffer.from(versionText));
  const installDirectory = await installDirectoryFromVersion(versionText);
  const wrapperText = exactUtf8Text(executableBytes, "Hermes wrapper executable");
  const wrapperDelegatedMatch = /\bexec\s+["']([^"']+)["']\s+["']?\$@["']?/u.exec(wrapperText);
  const delegatedCandidates = [
    wrapperDelegatedMatch?.[1],
    installDirectory ? join(installDirectory, "venv/bin/hermes") : null,
  ].filter(Boolean);
  let delegated = null;
  for (const candidate of delegatedCandidates) {
    try {
      delegated = await regularFileIdentity(candidate, "Hermes delegated executable");
      break;
    } catch (error) {
      if (["ENOENT", "ENOTDIR", "EACCES"].includes(error?.code)) continue;
      throw error;
    }
  }
  if (!delegated) delegated = wrapper;
  const [installGitEvidence, implementationFileSet, dependencyEvidence] = await Promise.all([
    loadInstallGitEvidence(installDirectory, commandOptions),
    loadHermesImplementationFileSet(installDirectory),
    loadHermesDependencyEvidence(installDirectory, hermesVersionSha256),
  ]);
  const hermesImplementationSha256 = sha256(jsonBytes({
    wrapper: publicFileIdentity(wrapper),
    delegated: publicFileIdentity(delegated),
    installGitEvidence,
    loadedFileSetSha256: implementationFileSet.sha256,
    loadedFileCount: implementationFileSet.entries.length,
    loadedFileSizeBytes: implementationFileSet.totalBytes,
  }));
  const hermesDependencySha256 = sha256(jsonBytes(dependencyEvidence));
  const hermesDelegatedExecutableSha256 = delegated.sha256;
  const hermesRuntimeIdentitySha256 = sha256(jsonBytes({
    hermesExecutableSha256,
    hermesDelegatedExecutableSha256,
    hermesVersionSha256,
    hermesImplementationSha256,
    hermesDependencySha256,
  }));
  return {
    wrapperIdentity: publicFileIdentity(wrapper),
    delegatedIdentity: publicFileIdentity(delegated),
    evidence: {
      hermesCommand: executablePath,
      runtimeAttestation: CURRENT_RUNTIME_ATTESTATION,
      hermesExecutableSha256,
      hermesDelegatedExecutableSha256,
      hermesVersionSha256,
      hermesImplementationSha256,
      hermesDependencySha256,
      hermesRuntimeIdentitySha256,
    },
  };
}

export async function loadHermesBinaryRuntimeEvidence(command = process.env.HERMES_BIN ?? "hermes", options = {}) {
  if (typeof command !== "string" || command.length < 1) throw new Error("Hermes executable command is invalid.");
  const executablePath = await resolveHermesExecutable(command);
  const commandOptions = { cwd: options.cwd, env: options.env ?? process.env };
  const wrapperBefore = await regularFileIdentity(executablePath, "Hermes wrapper executable");
  const wrapperBeforeBytes = await readFile(wrapperBefore.resolvedPath);
  const delegatedBeforeMatch = /\bexec\s+["']([^"']+)["']\s+["']?\$@["']?/u.exec(
    exactUtf8Text(wrapperBeforeBytes, "Hermes wrapper executable"),
  );
  const delegatedBefore = delegatedBeforeMatch
    ? await regularFileIdentity(delegatedBeforeMatch[1], "Hermes delegated executable")
    : wrapperBefore;
  const firstVersionText = canonicalVersionText(await runCommand(executablePath, ["--version"], commandOptions));
  const first = await loadBinaryMaterialSnapshot(executablePath, firstVersionText, commandOptions);
  if (
    !isDeepStrictEqual(publicFileIdentity(wrapperBefore), first.wrapperIdentity)
    || !isDeepStrictEqual(publicFileIdentity(delegatedBefore), first.delegatedIdentity)
  ) {
    throw new Error("Hermes wrapper or delegated executable changed across its version probe.");
  }
  const secondVersionText = canonicalVersionText(await runCommand(executablePath, ["--version"], commandOptions));
  const second = await loadBinaryMaterialSnapshot(executablePath, secondVersionText, commandOptions);
  if (!isDeepStrictEqual(first, second)) {
    throw new Error("Hermes binary runtime changed across hash/version/hash attestation.");
  }
  return second.evidence;
}

function extractContentNeutralSection(soulText) {
  const heading = soulText.match(/^## (?:허구 내용 중립|Fiction content[^\r\n]*)$/mu);
  if (!heading || !Number.isInteger(heading.index)) {
    throw new Error("Hermes SOUL has no content-neutral contract section.");
  }
  const start = heading.index;
  const nextHeading = soulText.indexOf("\n## ", start + heading[0].length);
  const section = soulText.slice(start, nextHeading < 0 ? soulText.length : nextHeading).trimEnd();
  if (!section.includes(FICTION_CONTENT_CONTRACT_ID) || !section.includes(FICTION_CONTENT_CONTRACT_SHA256)) {
    throw new Error("Hermes SOUL content-neutral contract identity drifted.");
  }
  return section;
}

export function validateHermesProfileRuntime({
  profileId,
  configBytes,
  soulBytes,
  contextLimitEntryBytes,
}) {
  if (typeof profileId !== "string" || profileId.trim().length < 1) {
    throw new Error("Hermes profile ID is required.");
  }
  if (!Buffer.isBuffer(configBytes) || !Buffer.isBuffer(soulBytes) || !Buffer.isBuffer(contextLimitEntryBytes)) {
    throw new Error("Hermes runtime evidence must be byte buffers.");
  }
  const configText = validateCanonicalProfileConfig(configBytes, profileId);
  const soulText = exactUtf8Text(soulBytes, `Hermes SOUL ${profileId}`);
  const declaredProfile = soulText.match(/^- Profile ID:\s*`([^`]+)`\s*$/mu)?.[1];
  if (declaredProfile !== profileId) throw new Error(`Hermes SOUL profile identity drifted: ${profileId}`);
  const contentNeutralSection = extractContentNeutralSection(soulText);
  const { contextLimit } = parseContextLimitEntry(contextLimitEntryBytes);
  return {
    profileId,
    configText,
    soulText,
    contextLimit,
    profileConfigSha256: sha256(configBytes),
    soulSha256: sha256(soulBytes),
    contentNeutralContractId: FICTION_CONTENT_CONTRACT_ID,
    contentNeutralContractSha256: FICTION_CONTENT_CONTRACT_SHA256,
    contentNeutralSoulSectionSha256: sha256(Buffer.from(contentNeutralSection)),
    contextLimitEntrySha256: sha256(contextLimitEntryBytes),
  };
}

function parseToolArguments(call) {
  const raw = call?.function?.arguments;
  if (typeof raw === "string") return JSON.parse(raw);
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  throw new Error("Hermes exact-input read arguments are invalid.");
}

function normalizeHermesToolInvocation(call) {
  const outerName = call?.function?.name;
  const outerArguments = parseToolArguments(call);
  if (outerName !== "tool_call") {
    return { name: outerName, arguments: outerArguments };
  }

  assertExactObjectKeys(
    outerArguments,
    ["name", "arguments"],
    "Hermes Codex tool-call envelope",
  );
  if (
    typeof outerArguments.name !== "string"
    || !outerArguments.arguments
    || typeof outerArguments.arguments !== "object"
    || Array.isArray(outerArguments.arguments)
  ) {
    throw new Error("Hermes Codex tool-call envelope is invalid.");
  }
  return { name: outerArguments.name, arguments: outerArguments.arguments };
}

function canonicalHermesReadToolDescription() {
  return {
    name: HERMES_READ_ONLY_TOOL,
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

function validateHermesToolDescriptionResult(message) {
  if (
    message?.role !== "tool"
    || message.tool_name !== HERMES_TOOL_DESCRIBE
    || typeof message.content !== "string"
    || Buffer.byteLength(message.content, "utf8") > 16_384
  ) {
    throw new Error("Hermes exact-input tool description result is invalid.");
  }
  let described;
  try {
    described = JSON.parse(message.content);
  } catch (error) {
    throw new Error(`Hermes exact-input tool description result is not JSON: ${error.message}`);
  }
  if (!isDeepStrictEqual(described, canonicalHermesReadToolDescription())) {
    throw new Error("Hermes exact-input tool description drifted from the sealed read-only schema.");
  }
}

function inputIdForIndex(index) {
  return `input-${String(index + 1).padStart(3, "0")}`;
}

function readCursor(inputId, sourceSha256, chunkIndex) {
  assertSha256(sourceSha256, `Hermes exact-input cursor source digest ${inputId}`);
  assertNonNegativeInteger(chunkIndex, `Hermes exact-input cursor chunk index ${inputId}`);
  return `cursor-${sha256(Buffer.from([
    "firefly-hermes-read-cursor/v1",
    inputId,
    sourceSha256,
    String(chunkIndex),
  ].join("\0")))}`;
}

function splitHermesExactInputContent(content) {
  if (typeof content !== "string") throw new Error("Hermes exact-input content must be text.");
  if (content.length === 0) return [""];
  const codePoints = Array.from(content);
  const chunks = [];
  let start = 0;
  while (start < codePoints.length) {
    let low = start + 1;
    let high = Math.min(codePoints.length, start + READ_CHUNK_ENCODED_CONTENT_MAX_CHARS);
    let best = start;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const candidate = codePoints.slice(start, middle).join("");
      const encodedChars = Array.from(JSON.stringify(candidate)).length;
      if (encodedChars <= READ_CHUNK_ENCODED_CONTENT_MAX_CHARS) {
        best = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    if (best === start) throw new Error("Hermes exact-input content cannot fit its deterministic chunk boundary.");
    chunks.push(codePoints.slice(start, best).join(""));
    start = best;
  }
  return chunks;
}

function expectedReadChunkPayload(files, fileIndex, chunks, chunkIndex) {
  const file = files[fileIndex];
  const inputId = inputIdForIndex(fileIndex);
  const finalChunk = chunkIndex + 1 === chunks.length;
  let nextInputId = inputId;
  let nextCursor = readCursor(inputId, file.sha256, chunkIndex + 1);
  if (finalChunk) {
    if (fileIndex + 1 < files.length) {
      const nextFile = files[fileIndex + 1];
      nextInputId = inputIdForIndex(fileIndex + 1);
      nextCursor = readCursor(nextInputId, nextFile.sha256, 0);
    } else {
      nextInputId = null;
      nextCursor = null;
    }
  }
  const content = chunks[chunkIndex];
  return {
    schemaVersion: READ_RESULT_SCHEMA,
    inputId,
    sha256: file.sha256,
    sizeBytes: file.sizeBytes,
    chunkIndex,
    chunkCount: chunks.length,
    chunkSha256: sha256(Buffer.from(content, "utf8")),
    nextInputId,
    nextCursor,
    content,
  };
}

function readTranscriptProxyBytes(filesWithChunks) {
  const files = filesWithChunks.map(({ chunks: _chunks, ...file }) => file);
  const messages = [];
  let expectedCursor = null;
  let callOrdinal = 0;
  for (const [fileIndex, file] of filesWithChunks.entries()) {
    for (const chunkIndex of file.chunks.keys()) {
      callOrdinal += 1;
      const inputId = inputIdForIndex(fileIndex);
      const args = expectedCursor === null ? { inputId } : { inputId, cursor: expectedCursor };
      const callId = `call-${String(callOrdinal).padStart(4, "0")}-${"0".repeat(128)}`;
      const payload = expectedReadChunkPayload(files, fileIndex, file.chunks, chunkIndex);
      const encodedPayload = JSON.stringify(payload);
      if (Array.from(encodedPayload).length > READ_CHUNK_RESULT_MAX_CHARS) {
        throw new Error(`Hermes exact-input host chunk exceeds the inline result boundary: ${inputId}`);
      }
      messages.push({
        role: "assistant",
        finish_reason: "tool_calls",
        compacted: 0,
        tool_calls: [{
          id: callId,
          function: { name: HERMES_READ_ONLY_TOOL, arguments: JSON.stringify(args) },
        }],
      }, {
        role: "tool",
        tool_call_id: callId,
        tool_name: HERMES_READ_ONLY_TOOL,
        compacted: 0,
        content: encodedPayload,
      });
      expectedCursor = payload.nextCursor;
    }
  }
  return Buffer.byteLength(JSON.stringify(messages), "utf8");
}

export function measureHermesExactInputTranscript(inputBuffers) {
  if (!Array.isArray(inputBuffers) || inputBuffers.length < 1) {
    throw new Error("Hermes exact-input transcript measurement requires a non-empty Buffer array.");
  }
  const filesWithChunks = inputBuffers.map((bytes, index) => {
    const inputId = inputIdForIndex(index);
    if (!Buffer.isBuffer(bytes)) {
      throw new Error(`Hermes exact-input transcript source must be a Buffer: ${inputId}`);
    }
    if (bytes.byteLength > READ_SOURCE_MAX_BYTES) {
      throw new Error(`Hermes exact-input source exceeds the reader source boundary: ${inputId}`);
    }
    const content = bytes.toString("utf8");
    if (Buffer.from(content, "utf8").compare(bytes) !== 0) {
      throw new Error(`Hermes exact-input source must be valid UTF-8: ${inputId}`);
    }
    const chunks = splitHermesExactInputContent(content);
    return {
      inputId,
      sha256: sha256(bytes),
      sizeBytes: bytes.byteLength,
      chunkCount: chunks.length,
      chunks,
    };
  });
  const files = filesWithChunks.map(({ chunks: _chunks, ...file }) => file);
  const totalBytes = files.reduce((total, file) => total + file.sizeBytes, 0);
  if (!Number.isSafeInteger(totalBytes)) {
    throw new Error("Hermes exact-input transcript total bytes exceeded the safe integer boundary.");
  }
  const transcriptBytes = readTranscriptProxyBytes(filesWithChunks);
  return {
    schemaVersion: "hermes-exact-input-transcript-measurement/v1",
    files,
    totalBytes,
    readTranscriptProxyBytes: transcriptBytes,
    contextProxyTokens: Math.ceil(transcriptBytes / CONTEXT_PROXY_BYTES_PER_TOKEN),
  };
}

export function planHermesStructuredContextBudget({
  profilePromptContextBytes,
  projectPromptContextBytes = 0,
  pluginContextBytes,
  prompt,
  readTranscriptProxyBytes: transcriptBytes,
  outputReserveTokens,
  contextLimit,
} = {}) {
  assertNonNegativeInteger(profilePromptContextBytes, "Hermes profile prompt context bytes");
  assertNonNegativeInteger(projectPromptContextBytes, "Hermes project prompt context bytes");
  assertNonNegativeInteger(pluginContextBytes, "Hermes plugin context bytes");
  if (typeof prompt !== "string") throw new Error("Hermes structured context budget prompt must be text.");
  assertNonNegativeInteger(transcriptBytes, "Hermes exact-input transcript proxy bytes");
  assertNonNegativeInteger(outputReserveTokens, "Hermes structured output reserve tokens");
  if (outputReserveTokens < 1) throw new Error("Hermes structured output reserve tokens must be positive.");
  assertNonNegativeInteger(contextLimit, "Hermes structured context limit");
  if (contextLimit < 1) throw new Error("Hermes structured context limit must be positive.");
  const promptSizeBytes = Buffer.byteLength(prompt, "utf8");
  const measuredContextBytes = profilePromptContextBytes
    + projectPromptContextBytes
    + pluginContextBytes
    + promptSizeBytes
    + transcriptBytes;
  if (!Number.isSafeInteger(measuredContextBytes)) {
    throw new Error("Hermes structured context budget bytes exceeded the safe integer boundary.");
  }
  const contextInputProxyTokens = CONTEXT_STATIC_PROMPT_RESERVE_TOKENS
    + Math.ceil(measuredContextBytes / CONTEXT_PROXY_BYTES_PER_TOKEN);
  const preflightBudgetTokens = contextInputProxyTokens + outputReserveTokens;
  if (!Number.isSafeInteger(preflightBudgetTokens)) {
    throw new Error("Hermes structured context budget tokens exceeded the safe integer boundary.");
  }
  return {
    schemaVersion: "hermes-structured-context-budget/v2",
    contextProxyBytesPerToken: CONTEXT_PROXY_BYTES_PER_TOKEN,
    staticPromptReserveTokens: CONTEXT_STATIC_PROMPT_RESERVE_TOKENS,
    profilePromptContextBytes,
    projectPromptContextBytes,
    pluginContextBytes,
    promptSizeBytes,
    readTranscriptProxyBytes: transcriptBytes,
    contextInputProxyTokens,
    outputReserveTokens,
    preflightBudgetTokens,
    contextLimit,
    fits: preflightBudgetTokens < contextLimit,
  };
}

function validateToolPolicy(messages, expectedReadPaths) {
  if (!Array.isArray(expectedReadPaths) || expectedReadPaths.length < 1) {
    throw new Error("Expected Hermes read paths must be non-empty.");
  }
  if (new Set(expectedReadPaths).size !== expectedReadPaths.length || expectedReadPaths.some((path) => typeof path !== "string" || path.length < 1)) {
    throw new Error("Expected Hermes read paths must be unique strings.");
  }
  const expectedIds = new Map(expectedReadPaths.map((path, index) => [inputIdForIndex(index), path]));
  const calls = [];
  const allCalls = [];
  let describeCall = null;
  for (const [messageIndex, message] of messages.entries()) {
    const toolCalls = message.tool_calls ?? [];
    if (!Array.isArray(toolCalls)) throw new Error("Hermes trace tool calls must be an array.");
    if (toolCalls.length > 0 && (message.role !== "assistant" || message.finish_reason !== "tool_calls")) {
      throw new Error("Hermes exact-input tool calls must come from an assistant tool_calls message.");
    }
    if (toolCalls.length > 1) {
      throw new Error("Hermes exact-input reader must use one sequential tool call per assistant turn.");
    }
    for (const call of toolCalls) {
      const invocation = normalizeHermesToolInvocation(call);
      if (
        typeof call.id !== "string"
        || call.id.length < 1
        || allCalls.some((existing) => existing.id === call.id)
      ) {
        throw new Error("Hermes exact-input tool call IDs must be unique and non-empty.");
      }
      if (invocation.name === HERMES_TOOL_DESCRIBE) {
        if (
          call?.function?.name !== HERMES_TOOL_DESCRIBE
          || describeCall !== null
          || calls.length > 0
          || !isDeepStrictEqual(Object.keys(invocation.arguments).sort(), ["name"])
          || invocation.arguments.name !== HERMES_READ_ONLY_TOOL
        ) {
          throw new Error("Hermes may describe only the sealed read-only tool once before any source read.");
        }
        describeCall = {
          id: call.id,
          messageIndex,
          resultToolName: HERMES_TOOL_DESCRIBE,
          kind: "describe",
        };
        allCalls.push(describeCall);
        continue;
      }
      if (invocation.name !== HERMES_READ_ONLY_TOOL) {
        throw new Error(`Hermes structured run used a forbidden tool: ${String(invocation.name)}`);
      }
      const args = invocation.arguments;
      const argumentKeys = Object.keys(args).sort();
      if (
        !isDeepStrictEqual(argumentKeys, ["inputId"])
        && !isDeepStrictEqual(argumentKeys, ["cursor", "inputId"])
      ) {
        throw new Error("Hermes exact-input read arguments must contain only inputId and an optional cursor.");
      }
      const inputId = args.inputId;
      const path = expectedIds.get(inputId);
      if (typeof inputId !== "string" || path === undefined) {
        throw new Error(`Hermes exact-input reader used an unexpected inputId: ${String(inputId)}`);
      }
      if (Object.hasOwn(args, "cursor") && (typeof args.cursor !== "string" || !READ_CURSOR_PATTERN.test(args.cursor))) {
        throw new Error(`Hermes exact-input reader used an invalid cursor: ${inputId}`);
      }
      const readCall = {
        id: call.id,
        inputId,
        path,
        args,
        messageIndex,
        resultToolName: HERMES_READ_ONLY_TOOL,
        kind: "read",
      };
      calls.push(readCall);
      allCalls.push(readCall);
    }
  }
  for (const [inputId, path] of expectedIds) {
    if (calls.every((call) => call.inputId !== inputId)) {
      throw new Error(`Hermes must read every exact bound input: ${inputId} (${path})`);
    }
  }
  const results = messages.filter((message) => message.role === "tool");
  const resultIds = results.map((message) => message.tool_call_id);
  if (
    results.length !== allCalls.length
    || results.some((message) => {
      const call = allCalls.find((candidate) => candidate.id === message.tool_call_id);
      return !call || (
        message.tool_name !== undefined
        && message.tool_name !== null
        && message.tool_name !== call.resultToolName
      );
    })
    || resultIds.some((id) => typeof id !== "string" || !allCalls.some((call) => call.id === id))
    || new Set(resultIds).size !== resultIds.length
  ) throw new Error("Hermes trace has a missing, duplicate, or unexpected tool result.");
  for (const call of allCalls) {
    const immediateResult = messages[call.messageIndex + 1];
    if (immediateResult?.role !== "tool" || immediateResult.tool_call_id !== call.id) {
      throw new Error("Hermes exact-input cursor calls and results must form immediate sequential pairs.");
    }
    if (call.kind === "describe") validateHermesToolDescriptionResult(immediateResult);
  }
  if (
    messages.length !== (allCalls.length * 2) + 2
    || messages[0]?.role !== "user"
    || messages.at(-1)?.role !== "assistant"
    || allCalls.some((call, index) => call.messageIndex !== (index * 2) + 1)
  ) throw new Error("Hermes exact-input trace message grammar drifted.");
  return calls;
}

export async function validateHermesExactInputTrace({ trace, expectedFiles } = {}) {
  if (!trace || !Array.isArray(trace.messages) || !Array.isArray(expectedFiles) || expectedFiles.length < 1) {
    throw new Error("Hermes exact-input trace and expected files are required.");
  }
  expectedFiles.forEach((file, index) => {
    if (file?.inputId !== inputIdForIndex(index)) {
      throw new Error(`Hermes exact-input expected file order drifted: ${inputIdForIndex(index)}`);
    }
  });
  const calls = validateToolPolicy(trace.messages, expectedFiles.map((file) => file.path));
  const results = new Map(
    trace.messages
      .filter((message) => message.role === "tool" && typeof message.tool_call_id === "string")
      .map((message) => [message.tool_call_id, message]),
  );
  const expectedPlans = await Promise.all(expectedFiles.map(async (expected, index) => {
    const inputId = inputIdForIndex(index);
    const bytes = await readHermesExactInputFile(expected.path, inputId);
    if (bytes.byteLength !== expected.sizeBytes || sha256(bytes) !== expected.sha256) {
      throw new Error(`Hermes exact-input expected source binding drifted: ${inputId}`);
    }
    const content = bytes.toString("utf8");
    if (Buffer.from(content, "utf8").compare(bytes) !== 0) {
      throw new Error(`Hermes exact-input expected source is not UTF-8: ${inputId}`);
    }
    return { bytes, chunks: splitHermesExactInputContent(content) };
  }));
  const exactReadSha256s = [];
  let expectedFileIndex = 0;
  let expectedChunkIndex = 0;
  let expectedChunkCount = null;
  let expectedCursor = null;
  let restoredChunks = [];
  for (const call of calls) {
    const expected = expectedFiles[expectedFileIndex];
    const expectedPlan = expectedPlans[expectedFileIndex];
    if (!expected) throw new Error("Hermes exact-input trace continued after the final chunk.");
    const inputId = inputIdForIndex(expectedFileIndex);
    const expectedArguments = expectedCursor === null
      ? { inputId }
      : { inputId, cursor: expectedCursor };
    if (!isDeepStrictEqual(call.args, expectedArguments)) {
      throw new Error(`Hermes exact-input cursor chain drifted: ${inputId} chunk ${expectedChunkIndex}`);
    }
    const toolMessage = results.get(call.id);
    if (!toolMessage || typeof toolMessage.content !== "string") {
      throw new Error(`Hermes exact-input result is missing: ${inputId}`);
    }
    if (Array.from(toolMessage.content).length > READ_CHUNK_RESULT_MAX_CHARS) {
      throw new Error(`Hermes exact-input chunk exceeded its inline result boundary: ${inputId}`);
    }
    let payload;
    try {
      payload = JSON.parse(toolMessage.content);
    } catch (error) {
      throw new Error(`Hermes exact-input result is not JSON: ${inputId}: ${error.message}`);
    }
    assertExactObjectKeys(
      payload,
      [
        "schemaVersion", "inputId", "sha256", "sizeBytes", "chunkIndex", "chunkCount",
        "chunkSha256", "nextInputId", "nextCursor", "content",
      ],
      `Hermes exact-input result ${inputId}`,
    );
    if (
      payload.schemaVersion !== READ_RESULT_SCHEMA
      || payload.inputId !== inputId
      || payload.sha256 !== expected.sha256
      || payload.sizeBytes !== expected.sizeBytes
      || !Number.isSafeInteger(payload.chunkIndex)
      || payload.chunkIndex !== expectedChunkIndex
      || !Number.isSafeInteger(payload.chunkCount)
      || payload.chunkCount < 1
      || payload.chunkIndex >= payload.chunkCount
      || payload.chunkCount !== expectedPlan.chunks.length
      || (expectedChunkCount !== null && payload.chunkCount !== expectedChunkCount)
      || typeof payload.chunkSha256 !== "string"
      || !/^[a-f0-9]{64}$/u.test(payload.chunkSha256)
      || typeof payload.content !== "string"
      || payload.content !== expectedPlan.chunks[expectedChunkIndex]
    ) throw new Error(`Hermes exact-input result binding drifted: ${inputId}`);
    if (expectedChunkCount === null) expectedChunkCount = payload.chunkCount;
    const chunkBytes = Buffer.from(payload.content, "utf8");
    if (
      sha256(chunkBytes) !== payload.chunkSha256
      || (chunkBytes.byteLength === 0 && !(expected.sizeBytes === 0 && payload.chunkCount === 1))
    ) throw new Error(`Hermes exact-input chunk bytes drifted: ${inputId} chunk ${expectedChunkIndex}`);
    restoredChunks.push(chunkBytes);
    const finalChunk = expectedChunkIndex + 1 === payload.chunkCount;
    let expectedNextInputId = inputId;
    let expectedNextCursor = readCursor(inputId, expected.sha256, expectedChunkIndex + 1);
    if (finalChunk) {
      if (expectedFileIndex + 1 < expectedFiles.length) {
        const next = expectedFiles[expectedFileIndex + 1];
        expectedNextInputId = inputIdForIndex(expectedFileIndex + 1);
        expectedNextCursor = readCursor(expectedNextInputId, next.sha256, 0);
      } else {
        expectedNextInputId = null;
        expectedNextCursor = null;
      }
    }
    if (payload.nextInputId !== expectedNextInputId || payload.nextCursor !== expectedNextCursor) {
      throw new Error(`Hermes exact-input next-cursor binding drifted: ${inputId} chunk ${expectedChunkIndex}`);
    }
    if (finalChunk) {
      const expectedBytes = expectedPlan.bytes;
      const restoredBytes = Buffer.concat(restoredChunks);
      if (
        expectedBytes.byteLength !== expected.sizeBytes
        || sha256(expectedBytes) !== expected.sha256
        || restoredBytes.compare(expectedBytes) !== 0
      ) throw new Error(`Hermes exact-input result is partial or drifted: ${inputId}`);
      exactReadSha256s.push(expected.sha256);
      expectedFileIndex += 1;
      expectedChunkIndex = 0;
      expectedChunkCount = null;
      restoredChunks = [];
    } else {
      expectedChunkIndex += 1;
    }
    expectedCursor = expectedNextCursor;
  }
  if (expectedFileIndex !== expectedFiles.length || expectedCursor !== null || restoredChunks.length > 0) {
    throw new Error("Hermes exact-input trace ended before the complete cursor chain.");
  }
  return { exactReadCount: expectedFiles.length, exactReadSha256s };
}

export function validateHermesStructuredTrace({
  trace,
  usage,
  profileId,
  prompt,
  soulText,
  expectedReadPaths,
  result,
  contextLimit,
  inputEvidenceBytes,
  outputReserveTokens,
}) {
  if (!trace || !usage || !Array.isArray(trace.messages)) throw new Error("Hermes structured trace or usage is missing.");
  if (
    usage.completed !== true
    || usage.failed !== false
    || usage.model !== HERMES_STRUCTURED_MODEL
    || usage.provider !== HERMES_STRUCTURED_PROVIDER
    || typeof usage.session_id !== "string"
    || usage.session_id.length < 1
  ) throw new Error("Hermes structured usage readback failed.");
  for (const key of ["input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens", "reasoning_tokens", "total_tokens", "api_calls"]) {
    assertNonNegativeInteger(usage[key], `Hermes usage ${key}`);
  }
  if (usage.total_tokens !== usage.input_tokens + usage.output_tokens + usage.cache_read_tokens + usage.cache_write_tokens) {
    throw new Error("Hermes structured usage total is not bound to its token fields.");
  }
  if (
    trace.id !== usage.session_id
    || trace.model !== HERMES_STRUCTURED_MODEL
    || trace.billing_provider !== HERMES_STRUCTURED_PROVIDER
    || trace.profile_name !== profileId
    || trace.end_reason !== "agent_close"
  ) throw new Error("Hermes structured trace identity readback failed.");
  for (const [traceKey, usageKey] of [
    ["input_tokens", "input_tokens"],
    ["output_tokens", "output_tokens"],
    ["cache_read_tokens", "cache_read_tokens"],
    ["cache_write_tokens", "cache_write_tokens"],
    ["reasoning_tokens", "reasoning_tokens"],
    ["api_call_count", "api_calls"],
  ]) {
    if (trace[traceKey] !== usage[usageKey]) throw new Error(`Hermes trace usage drifted: ${traceKey}`);
  }
  if (
    trace.compression_failure_error !== null
    || trace.compression_failure_cooldown_until !== null
    || trace.compression_fallback_streak !== 0
    || trace.compression_ineffective_count !== 0
  ) throw new Error("Hermes structured trace used or attempted compression.");
  if (trace.messages.some((message) => message.compacted !== 0)) {
    throw new Error("Hermes structured trace contains compacted messages.");
  }
  const finalAssistant = trace.messages.filter((message) => message.role === "assistant").at(-1);
  if (!finalAssistant || finalAssistant.finish_reason !== "stop") {
    throw new Error("Hermes structured trace did not end with agent_close/stop.");
  }
  const userMessages = trace.messages.filter((message) => message.role === "user");
  if (userMessages.length !== 1 || userMessages[0].content !== prompt) {
    throw new Error("Hermes structured trace prompt drifted.");
  }
  if (
    typeof trace.system_prompt !== "string"
    || (trace.system_prompt !== soulText && !trace.system_prompt.startsWith(`${soulText}\n`))
  ) throw new Error("Hermes structured trace SOUL bytes drifted.");
  let tracedResult;
  try {
    tracedResult = parseStructuredJson(finalAssistant.content);
  } catch (error) {
    throw new Error(`Hermes final structured result is invalid: ${error.message}`);
  }
  if (!isDeepStrictEqual(tracedResult, result)) throw new Error("Hermes trace result drifted from the stored result.");
  const calls = validateToolPolicy(trace.messages, expectedReadPaths);
  assertNonNegativeInteger(inputEvidenceBytes, "Hermes input evidence bytes");
  assertNonNegativeInteger(outputReserveTokens, "Hermes output reserve tokens");
  if (outputReserveTokens < 1) throw new Error("Hermes output reserve tokens must be positive.");
  if (usage.output_tokens > outputReserveTokens) {
    throw new Error(`Hermes structured output exceeded its bound reserve: ${usage.output_tokens} > ${outputReserveTokens}`);
  }
  const finalAssistantIndex = trace.messages.lastIndexOf(finalAssistant);
  const activeMessages = trace.messages.filter((_, index) => index !== finalAssistantIndex);
  const contextInputProxyTokens = Math.ceil((
    Buffer.byteLength(trace.system_prompt, "utf8")
    + Buffer.byteLength(JSON.stringify(activeMessages), "utf8")
  ) / CONTEXT_PROXY_BYTES_PER_TOKEN);
  const contextOutputReserveTokens = outputReserveTokens;
  const contextBudgetUpperBoundTokens = contextInputProxyTokens + contextOutputReserveTokens;
  if (!Number.isSafeInteger(contextLimit) || contextBudgetUpperBoundTokens >= contextLimit) {
    throw new Error(`Hermes structured context boundary failed: ${contextBudgetUpperBoundTokens} >= ${contextLimit}`);
  }
  const endedAt = Number(trace.ended_at);
  if (!Number.isFinite(endedAt) || endedAt <= 0) throw new Error("Hermes structured trace end time is invalid.");
  return {
    runId: usage.session_id,
    exactReadCount: expectedReadPaths.length,
    contextInputProxyTokens,
    contextOutputReserveTokens,
    contextBudgetUpperBoundTokens,
    effectiveSystemPromptSha256: sha256(Buffer.from(trace.system_prompt)),
    endedAt,
  };
}

const RECEIPT_KEYS = [
  "apiCalls",
  "cacheWriteTokens",
  "candidateOutputSha256",
  "completed",
  "completedAt",
  "compaction",
  "compression",
  "contentNeutralContractId",
  "contentNeutralContractSha256",
  "contentNeutralSoulSectionSha256",
  "contextBudgetUpperBoundTokens",
  "contextInputProxyTokens",
  "contextLimit",
  "contextLimitEntrySha256",
  "contextOutputReserveTokens",
  "cumulativeCacheReadTokens",
  "effectiveSystemPromptSha256",
  "exactReadCount",
  "exactReadSha256s",
  "expectedReadCount",
  "hermesDelegatedExecutableSha256",
  "hermesDependencySha256",
  "hermesExecutableSha256",
  "hermesImplementationSha256",
  "hermesProfileContextSha256",
  "hermesProjectContextSha256",
  "hermesRuntimeIdentitySha256",
  "hermesVersionSha256",
  "inputDigest",
  "inputSha256",
  "inputTokens",
  "model",
  "outputTokens",
  "profileConfigSha256",
  "profileId",
  "promptSha256",
  "provider",
  "readCapabilitySha256",
  "readCapabilityTool",
  "readCapabilityToolset",
  "readExecutionEnvironmentSha256",
  "readExecutionRuntimeIdentitySha256",
  "readManifestSha256",
  "reasoningEffort",
  "reasoningTokens",
  "resultSha256",
  "role",
  "runId",
  "runtimeAttestation",
  "schemaVersion",
  "soulSha256",
  "totalTokens",
  "traceSha256",
  "truncation",
  "usageSha256",
].sort();

export function validateHermesStructuredReceipt(receipt, expected = {}) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) throw new Error("Hermes structured receipt is invalid.");
  if (!isDeepStrictEqual(Object.keys(receipt).sort(), RECEIPT_KEYS)) {
    throw new Error("Hermes structured receipt keys drifted.");
  }
  if (
    receipt.schemaVersion !== RECEIPT_SCHEMA
    || typeof receipt.role !== "string"
    || receipt.role.length < 1
    || typeof receipt.runId !== "string"
    || receipt.runId.length < 1
    || typeof receipt.profileId !== "string"
    || receipt.profileId.length < 1
    || receipt.model !== HERMES_STRUCTURED_MODEL
    || receipt.provider !== HERMES_STRUCTURED_PROVIDER
    || receipt.readCapabilityTool !== HERMES_READ_ONLY_TOOL
    || receipt.readCapabilityToolset !== HERMES_READ_ONLY_TOOLSET
    || receipt.reasoningEffort !== HERMES_STRUCTURED_REASONING
    || receipt.runtimeAttestation !== CURRENT_RUNTIME_ATTESTATION
    || receipt.contentNeutralContractId !== FICTION_CONTENT_CONTRACT_ID
    || receipt.contentNeutralContractSha256 !== FICTION_CONTENT_CONTRACT_SHA256
    || receipt.compaction !== false
    || receipt.compression !== false
    || receipt.truncation !== false
    || receipt.completed !== true
    || !Number.isFinite(Date.parse(receipt.completedAt))
  ) throw new Error("Hermes structured receipt identity or completion state drifted.");
  for (const key of [
    "promptSha256",
    "inputDigest",
    "inputSha256",
    "profileConfigSha256",
    "soulSha256",
    "contentNeutralSoulSectionSha256",
    "effectiveSystemPromptSha256",
    "contextLimitEntrySha256",
    "hermesExecutableSha256",
    "hermesDelegatedExecutableSha256",
    "hermesVersionSha256",
    "hermesImplementationSha256",
    "hermesDependencySha256",
    "hermesProfileContextSha256",
    "hermesProjectContextSha256",
    "hermesRuntimeIdentitySha256",
    "readCapabilitySha256",
    "readExecutionEnvironmentSha256",
    "readExecutionRuntimeIdentitySha256",
    "readManifestSha256",
    "candidateOutputSha256",
    "resultSha256",
    "usageSha256",
    "traceSha256",
  ]) assertSha256(receipt[key], `Hermes receipt ${key}`);
  for (const key of [
    "contextBudgetUpperBoundTokens",
    "contextInputProxyTokens",
    "contextLimit",
    "contextOutputReserveTokens",
    "cumulativeCacheReadTokens",
    "expectedReadCount",
    "exactReadCount",
    "inputTokens",
    "outputTokens",
    "reasoningTokens",
    "totalTokens",
    "apiCalls",
    "cacheWriteTokens",
  ]) assertNonNegativeInteger(receipt[key], `Hermes receipt ${key}`);
  if (
    receipt.contextLimit < 100_000
    || receipt.totalTokens !== receipt.inputTokens + receipt.outputTokens + receipt.cumulativeCacheReadTokens + receipt.cacheWriteTokens
    || receipt.contextOutputReserveTokens < 1
    || receipt.outputTokens > receipt.contextOutputReserveTokens
    || receipt.contextBudgetUpperBoundTokens !== receipt.contextInputProxyTokens + receipt.contextOutputReserveTokens
    || receipt.contextBudgetUpperBoundTokens >= receipt.contextLimit
    || receipt.expectedReadCount < 1
    || receipt.exactReadCount !== receipt.expectedReadCount
    || !Array.isArray(receipt.exactReadSha256s)
    || receipt.exactReadSha256s.length !== receipt.exactReadCount
  ) throw new Error("Hermes structured receipt count or context boundary drifted.");
  for (const digest of receipt.exactReadSha256s) assertSha256(digest, "Hermes receipt exact-read digest");
  for (const [key, value] of Object.entries(expected)) {
    if (!isDeepStrictEqual(receipt[key], value)) throw new Error(`Hermes structured receipt drifted: ${key}`);
  }
  return true;
}

const HERMES_RUNTIME_STABILITY_KEYS = [
  "runtimeAttestation",
  "profileId",
  "profileConfigSha256",
  "soulSha256",
  "contentNeutralContractId",
  "contentNeutralContractSha256",
  "contentNeutralSoulSectionSha256",
  "contextLimit",
  "contextLimitEntrySha256",
  "hermesCommand",
  "hermesExecutableSha256",
  "hermesDelegatedExecutableSha256",
  "hermesVersionSha256",
  "hermesImplementationSha256",
  "hermesDependencySha256",
  "hermesProfileContextSha256",
  "hermesProjectContextSha256",
  "hermesRuntimeIdentitySha256",
];

export const HERMES_STRUCTURED_ATTEMPT_INPUT_ATTESTATION_RUNTIME_KEYS = Object.freeze([
  ...HERMES_RUNTIME_STABILITY_KEYS,
]);

const ATTEMPT_INPUT_ATTESTATION_KEYS = [
  "schemaVersion",
  "role",
  "profileHome",
  "projectCwd",
  "profileId",
  "promptSha256",
  "inputDigest",
  "inputSha256",
  "expectedReads",
  "outputReserveTokens",
  "executionEnvironmentSha256",
  "readCapabilitySha256",
  "runtime",
];

const ATTEMPT_INPUT_ATTESTATION_READ_KEYS = ["path", "sha256", "sizeBytes"];

function assertExactObjectKeys(value, expectedKeys, label) {
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || !isDeepStrictEqual(Object.keys(value).sort(), [...expectedKeys].sort())
  ) throw new Error(`${label} keys drifted.`);
}

function assertCanonicalAbsolutePath(value, label) {
  if (typeof value !== "string" || value.length < 1 || !isAbsolute(value) || resolve(value) !== value) {
    throw new Error(`${label} must be a canonical absolute path.`);
  }
}

function canonicalAttestationRuntime(runtime, profileId) {
  assertExactObjectKeys(
    runtime,
    HERMES_STRUCTURED_ATTEMPT_INPUT_ATTESTATION_RUNTIME_KEYS,
    "Hermes attempt input attestation runtime",
  );
  if (
    runtime.runtimeAttestation !== CURRENT_RUNTIME_ATTESTATION
    || runtime.profileId !== profileId
    || runtime.contentNeutralContractId !== FICTION_CONTENT_CONTRACT_ID
    || runtime.contentNeutralContractSha256 !== FICTION_CONTENT_CONTRACT_SHA256
    || !Number.isSafeInteger(runtime.contextLimit)
    || runtime.contextLimit < 100_000
  ) throw new Error("Hermes attempt input attestation runtime identity drifted.");
  if (
    typeof runtime.hermesCommand !== "string"
    || runtime.hermesCommand.length < 1
    || !isAbsolute(runtime.hermesCommand)
    || resolve(runtime.hermesCommand) !== runtime.hermesCommand
  ) throw new Error("Hermes attempt input attestation runtime command must be a canonical absolute path.");
  for (const key of [
    "profileConfigSha256",
    "soulSha256",
    "contentNeutralSoulSectionSha256",
    "contextLimitEntrySha256",
    "hermesExecutableSha256",
    "hermesDelegatedExecutableSha256",
    "hermesVersionSha256",
    "hermesImplementationSha256",
    "hermesDependencySha256",
    "hermesProfileContextSha256",
    "hermesProjectContextSha256",
    "hermesRuntimeIdentitySha256",
  ]) assertSha256(runtime[key], `Hermes attempt input attestation runtime.${key}`);
  const expectedRuntimeIdentitySha256 = sha256(jsonBytes({
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
  if (runtime.hermesRuntimeIdentitySha256 !== expectedRuntimeIdentitySha256) {
    throw new Error("Hermes attempt input attestation runtime identity digest drifted.");
  }
  return Object.fromEntries(HERMES_RUNTIME_STABILITY_KEYS.map((key) => [key, runtime[key]]));
}

function canonicalAttestationExpectedReads(expectedReads) {
  if (!Array.isArray(expectedReads) || expectedReads.length < 1) {
    throw new Error("Hermes attempt input attestation expectedReads must be non-empty.");
  }
  const paths = new Set();
  return expectedReads.map((entry, index) => {
    assertExactObjectKeys(
      entry,
      ATTEMPT_INPUT_ATTESTATION_READ_KEYS,
      `Hermes attempt input attestation expectedReads[${index}]`,
    );
    assertCanonicalAbsolutePath(entry.path, `Hermes attempt input attestation expectedReads[${index}].path`);
    if (paths.has(entry.path)) throw new Error("Hermes attempt input attestation expectedReads paths must be unique.");
    paths.add(entry.path);
    assertSha256(entry.sha256, `Hermes attempt input attestation expectedReads[${index}].sha256`);
    assertNonNegativeInteger(entry.sizeBytes, `Hermes attempt input attestation expectedReads[${index}].sizeBytes`);
    return { path: entry.path, sha256: entry.sha256, sizeBytes: entry.sizeBytes };
  });
}

export function buildHermesStructuredAttemptInputAttestation(input) {
  assertExactObjectKeys(input, ATTEMPT_INPUT_ATTESTATION_KEYS, "Hermes attempt input attestation");
  if (
    input.schemaVersion !== HERMES_STRUCTURED_ATTEMPT_INPUT_ATTESTATION_SCHEMA
    || typeof input.role !== "string"
    || input.role.trim().length < 1
    || typeof input.profileId !== "string"
    || input.profileId.trim().length < 1
  ) throw new Error("Hermes attempt input attestation identity drifted.");
  assertCanonicalAbsolutePath(input.profileHome, "Hermes attempt input attestation profileHome");
  assertCanonicalAbsolutePath(input.projectCwd, "Hermes attempt input attestation projectCwd");
  for (const key of ["promptSha256", "inputDigest", "inputSha256", "executionEnvironmentSha256", "readCapabilitySha256"]) {
    assertSha256(input[key], `Hermes attempt input attestation ${key}`);
  }
  assertNonNegativeInteger(input.outputReserveTokens, "Hermes attempt input attestation outputReserveTokens");
  if (input.outputReserveTokens < 1) {
    throw new Error("Hermes attempt input attestation outputReserveTokens must be positive.");
  }
  const expectedReads = canonicalAttestationExpectedReads(input.expectedReads);
  const expectedInputSha256 = sha256(jsonBytes(expectedReads.map(({ path, sha256: fileSha256 }) => ({
    path,
    sha256: fileSha256,
  }))));
  if (input.inputSha256 !== expectedInputSha256) {
    throw new Error("Hermes attempt input attestation inputSha256 drifted from expectedReads.");
  }
  const runtime = canonicalAttestationRuntime(input.runtime, input.profileId);
  return {
    schemaVersion: HERMES_STRUCTURED_ATTEMPT_INPUT_ATTESTATION_SCHEMA,
    role: input.role,
    profileHome: input.profileHome,
    projectCwd: input.projectCwd,
    profileId: input.profileId,
    promptSha256: input.promptSha256,
    inputDigest: input.inputDigest,
    inputSha256: input.inputSha256,
    expectedReads,
    outputReserveTokens: input.outputReserveTokens,
    executionEnvironmentSha256: input.executionEnvironmentSha256,
    readCapabilitySha256: input.readCapabilitySha256,
    runtime,
  };
}

function assertExpectedAttemptInputAttestation(stored, expected) {
  if (expected === undefined) return;
  if (!expected || typeof expected !== "object" || Array.isArray(expected)) {
    throw new Error("Expected Hermes attempt input attestation bindings must be an object.");
  }
  const allowedKeys = new Set(ATTEMPT_INPUT_ATTESTATION_KEYS);
  for (const key of Object.keys(expected)) {
    if (!allowedKeys.has(key)) throw new Error(`Expected Hermes attempt input attestation key is unknown: ${key}`);
    if (key === "runtime") {
      if (!expected.runtime || typeof expected.runtime !== "object" || Array.isArray(expected.runtime)) {
        throw new Error("Expected Hermes attempt input attestation runtime must be an object.");
      }
      const runtimeKeys = new Set(HERMES_STRUCTURED_ATTEMPT_INPUT_ATTESTATION_RUNTIME_KEYS);
      for (const [runtimeKey, runtimeValue] of Object.entries(expected.runtime)) {
        if (!runtimeKeys.has(runtimeKey)) {
          throw new Error(`Expected Hermes attempt input attestation runtime key is unknown: ${runtimeKey}`);
        }
        if (!isDeepStrictEqual(stored.runtime[runtimeKey], runtimeValue)) {
          throw new Error(`Hermes attempt input attestation expected runtime drifted: ${runtimeKey}`);
        }
      }
      continue;
    }
    if (!isDeepStrictEqual(stored[key], expected[key])) {
      throw new Error(`Hermes attempt input attestation expected binding drifted: ${key}`);
    }
  }
}

export function validateHermesStructuredAttemptInputAttestation({ bytes, attemptDir, expected } = {}) {
  if (!Buffer.isBuffer(bytes)) throw new Error("Hermes attempt input attestation bytes must be a buffer.");
  if (typeof attemptDir !== "string" || attemptDir.length < 1) {
    throw new Error("Hermes attempt input attestation directory is required.");
  }
  let stored;
  try {
    stored = JSON.parse(exactUtf8Text(bytes, "Hermes attempt input attestation"));
  } catch (error) {
    throw new Error(`Hermes attempt input attestation is not valid JSON: ${error.message}`);
  }
  const canonical = buildHermesStructuredAttemptInputAttestation(stored);
  const canonicalBytes = jsonBytes(canonical);
  const storedSha256 = sha256(bytes);
  if (bytes.compare(canonicalBytes) !== 0) {
    throw new Error("Hermes attempt input attestation is not canonical JSON.");
  }
  if (!basename(attemptDir).endsWith(`-${storedSha256}`)) {
    throw new Error(`Hermes attempt input attestation directory digest drifted: ${basename(attemptDir)}`);
  }
  assertExpectedAttemptInputAttestation(canonical, expected);
  return { value: canonical, bytes, sha256: storedSha256 };
}

export function assertHermesRuntimeEvidenceEqual(expected, actual, label = "Hermes runtime") {
  if (!expected || !actual) throw new Error(`${label} evidence is missing.`);
  for (const key of HERMES_RUNTIME_STABILITY_KEYS) {
    if (!isDeepStrictEqual(expected[key], actual[key])) throw new Error(`${label} changed: ${key}`);
  }
  return true;
}

export async function loadHermesRuntimeEvidence(profileHome, profileId, options = {}) {
  const absoluteProfileHome = resolve(profileHome);
  const projectCwd = resolve(options.projectCwd ?? process.cwd());
  const executionEnvironment = options.executionEnvironment
    ?? buildHermesExecutionEnvironment({ profileHome: absoluteProfileHome, projectCwd });
  const canonicalEnvironment = buildHermesExecutionEnvironment({
    profileHome: absoluteProfileHome,
    projectCwd,
    contextCachePath: executionEnvironment?.contextCachePath,
    ...(executionEnvironment?.env?.[HERMES_EPHEMERAL_BUNDLED_PLUGINS_KEY] === undefined
      ? {}
      : { bundledPluginsPath: executionEnvironment.env[HERMES_EPHEMERAL_BUNDLED_PLUGINS_KEY] }),
  });
  const allowedCanonicalOverrides = new Set([
    ...HERMES_CANONICAL_ENV_KEYS,
    "GIT_OPTIONAL_LOCKS",
    "PYTHONDONTWRITEBYTECODE",
    ...(executionEnvironment?.env?.[HERMES_EPHEMERAL_BUNDLED_PLUGINS_KEY] === undefined
      ? []
      : [HERMES_EPHEMERAL_BUNDLED_PLUGINS_KEY]),
  ]);
  const leakedOverrides = Object.keys(executionEnvironment?.env ?? {})
    .filter((key) => isHermesExecutionOverride(key) && !allowedCanonicalOverrides.has(key));
  if (
    !executionEnvironment
    || typeof executionEnvironment !== "object"
    || executionEnvironment.env?.HERMES_HOME !== absoluteProfileHome
    || executionEnvironment.env?.TERMINAL_CWD !== projectCwd
    || executionEnvironment.env?.TERMINAL_ENV !== "local"
    || executionEnvironment.env?.PYTHONDONTWRITEBYTECODE !== "1"
    || executionEnvironment.env?.GIT_OPTIONAL_LOCKS !== "0"
    || executionEnvironment.env?.HERMES_CONTEXT_CACHE_PATH !== executionEnvironment.contextCachePath
    || executionEnvironment.descriptorSha256 !== sha256(jsonBytes(executionEnvironment.descriptor))
    || !isDeepStrictEqual(executionEnvironment.env, canonicalEnvironment.env)
    || !isDeepStrictEqual(executionEnvironment.descriptor, canonicalEnvironment.descriptor)
    || leakedOverrides.length > 0
  ) throw new Error("Hermes execution environment is not canonical for this runtime.");
  const configPath = join(absoluteProfileHome, "config.yaml");
  const soulPath = join(absoluteProfileHome, "SOUL.md");
  const contextCachePath = executionEnvironment.contextCachePath;
  const first = await Promise.all([
    readFile(configPath),
    readFile(soulPath),
    readFile(contextCachePath),
    loadHermesBinaryRuntimeEvidence(process.env.HERMES_BIN ?? "hermes", {
      cwd: projectCwd,
      env: executionEnvironment.env,
    }),
    loadProfilePromptContextEvidence(absoluteProfileHome),
    loadProjectPromptContextEvidence(projectCwd, executionEnvironment),
  ]);
  const [configBytes, soulBytes, contextCacheBytes, binaryRuntime, profileContext, projectContext] = first;
  const second = await Promise.all([
    readFile(configPath),
    readFile(soulPath),
    readFile(contextCachePath),
    loadProfilePromptContextEvidence(absoluteProfileHome),
    loadProjectPromptContextEvidence(projectCwd, executionEnvironment),
  ]);
  if (
    !configBytes.equals(second[0])
    || !soulBytes.equals(second[1])
    || !contextCacheBytes.equals(second[2])
    || profileContext.sha256 !== second[3].sha256
    || projectContext.sha256 !== second[4].sha256
  ) throw new Error("Hermes prompt/config/project context changed during runtime attestation.");
  const contextLimitEntryBytes = extractHermesContextLimitEntry(contextCacheBytes);
  const validatedProfile = validateHermesProfileRuntime({ profileId, configBytes, soulBytes, contextLimitEntryBytes });
  const hermesProfileContextSha256 = profileContext.sha256;
  const hermesProjectContextSha256 = projectContext.sha256;
  const hermesRuntimeIdentitySha256 = sha256(jsonBytes({
    runtimeAttestation: binaryRuntime.runtimeAttestation,
    profileConfigSha256: validatedProfile.profileConfigSha256,
    soulSha256: validatedProfile.soulSha256,
    contextLimitEntrySha256: validatedProfile.contextLimitEntrySha256,
    hermesExecutableSha256: binaryRuntime.hermesExecutableSha256,
    hermesDelegatedExecutableSha256: binaryRuntime.hermesDelegatedExecutableSha256,
    hermesVersionSha256: binaryRuntime.hermesVersionSha256,
    hermesImplementationSha256: binaryRuntime.hermesImplementationSha256,
    hermesDependencySha256: binaryRuntime.hermesDependencySha256,
    hermesProfileContextSha256,
    hermesProjectContextSha256,
  }));
  return {
    profileHome: absoluteProfileHome,
    projectCwd,
    configBytes,
    soulBytes,
    contextLimitEntryBytes,
    ...binaryRuntime,
    ...validatedProfile,
    hermesProfileContextSha256,
    hermesProjectContextSha256,
    hermesRuntimeIdentitySha256,
    profilePromptContextBytes: profileContext.totalBytes,
    projectPromptContextBytes: projectContext.totalBytes,
  };
}

async function readHermesExactInputFile(path, inputId) {
  if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path) {
    throw new Error(`Hermes exact-input path must be canonical absolute text: ${inputId}`);
  }
  const canonical = await realpath(path);
  if (canonical !== path) {
    // macOS exposes its per-user temporary directory through the root-owned
    // /var -> /private/var alias. Accept only that exact platform alias; any
    // additional or caller-controlled symbolic-link component remains fatal.
    const logicalTempRoot = resolve(tmpdir());
    const physicalTempRoot = await realpath(logicalTempRoot);
    const tempRelative = relative(logicalTempRoot, path);
    const isExactPlatformTempAlias = (
      logicalTempRoot !== physicalTempRoot
      && tempRelative !== ".."
      && !tempRelative.startsWith(`..${sep}`)
      && canonical === join(physicalTempRoot, tempRelative)
    );
    if (!isExactPlatformTempAlias) {
      throw new Error(`Hermes exact-input path contains a symbolic-link component: ${inputId}`);
    }
  }
  const beforePath = await lstat(path);
  if (!beforePath.isFile() || beforePath.isSymbolicLink()) {
    throw new Error(`Hermes exact-input source must be a real regular file: ${inputId}`);
  }
  const handle = await open(
    path,
    fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0) | (fsConstants.O_CLOEXEC ?? 0),
  );
  try {
    const beforeHandle = await handle.stat();
    const bytes = await handle.readFile();
    const afterHandle = await handle.stat();
    const afterPath = await lstat(path);
    for (const info of [beforeHandle, afterHandle, afterPath]) {
      if (!info.isFile() || info.isSymbolicLink?.() === true) {
        throw new Error(`Hermes exact-input source stopped being a regular file: ${inputId}`);
      }
    }
    const identity = (info) => [info.dev, info.ino, info.size, info.mtimeMs];
    if (
      !isDeepStrictEqual(identity(beforePath), identity(beforeHandle))
      || !isDeepStrictEqual(identity(beforeHandle), identity(afterHandle))
      || !isDeepStrictEqual(identity(afterHandle), identity(afterPath))
      || bytes.byteLength !== beforeHandle.size
    ) throw new Error(`Hermes exact-input source changed while read: ${inputId}`);
    return bytes;
  } finally {
    await handle.close();
  }
}

export async function loadHermesExactInputEvidence(expectedReadPaths, inputDigest) {
  assertSha256(inputDigest, "Hermes inputDigest");
  if (!Array.isArray(expectedReadPaths) || expectedReadPaths.length < 1 || new Set(expectedReadPaths).size !== expectedReadPaths.length) {
    throw new Error("Expected Hermes read paths must be unique and non-empty.");
  }
  const inputBuffers = await Promise.all(expectedReadPaths.map((path, index) => (
    readHermesExactInputFile(path, inputIdForIndex(index))
  )));
  const measurement = measureHermesExactInputTranscript(inputBuffers);
  const files = measurement.files.map((file, index) => ({
    inputId: file.inputId,
    path: expectedReadPaths[index],
    sha256: file.sha256,
    sizeBytes: file.sizeBytes,
    chunkCount: file.chunkCount,
  }));
  const digestFiles = files.map(({ path, sha256: fileSha256 }) => ({ path, sha256: fileSha256 }));
  return {
    files,
    totalBytes: measurement.totalBytes,
    readTranscriptProxyBytes: measurement.readTranscriptProxyBytes,
    inputSha256: sha256(jsonBytes(digestFiles)),
  };
}

export function buildHermesExactInputReadManifest(files) {
  if (!Array.isArray(files) || files.length < 1) throw new Error("Hermes exact-input manifest requires bound files.");
  const inputs = files.map((file, index) => {
    const expectedInputId = inputIdForIndex(index);
    if (
      file?.inputId !== expectedInputId
      || typeof file.path !== "string"
      || !isAbsolute(file.path)
      || resolve(file.path) !== file.path
    ) throw new Error(`Hermes exact-input manifest binding is invalid: ${expectedInputId}`);
    assertSha256(file.sha256, `Hermes exact-input manifest ${expectedInputId} digest`);
    assertNonNegativeInteger(file.sizeBytes, `Hermes exact-input manifest ${expectedInputId} size`);
    return {
      inputId: expectedInputId,
      path: file.path,
      sha256: file.sha256,
      sizeBytes: file.sizeBytes,
    };
  });
  return { schemaVersion: READ_MANIFEST_SCHEMA, inputs };
}

async function writeOrReuseRunFile(runRoot, path, bytes, label, options = {}) {
  const info = await lstatOrNull(path);
  if (!info) {
    if (options.requireExisting === true) throw new Error(`${label} is missing from an existing capability.`);
    await atomicCreateRunFile(runRoot, path, bytes, label);
    return "written";
  }
  await assertRealRunPath(runRoot, path, label, { requireExisting: true, targetType: "file" });
  const current = await readFile(path);
  if (current.compare(bytes) !== 0) throw new Error(`${label} drifted from its immutable bytes.`);
  return "reused";
}

async function loadReadPluginFiles() {
  if (await realpath(READ_PLUGIN_SOURCE_ROOT) !== READ_PLUGIN_SOURCE_ROOT) {
    throw new Error("Hermes exact-input plugin source root contains a symbolic-link component.");
  }
  const sourceRootInfo = await lstat(READ_PLUGIN_SOURCE_ROOT);
  if (!sourceRootInfo.isDirectory() || sourceRootInfo.isSymbolicLink()) {
    throw new Error("Hermes exact-input plugin source root must be a real directory.");
  }
  const files = [];
  for (const name of READ_PLUGIN_FILES) {
    const path = join(READ_PLUGIN_SOURCE_ROOT, name);
    if (await realpath(path) !== path) throw new Error(`Hermes exact-input plugin source contains a symbolic link: ${name}`);
    const before = await lstat(path);
    const bytes = await readFile(path);
    const after = await lstat(path);
    if (
      !before.isFile()
      || before.isSymbolicLink()
      || !after.isFile()
      || after.isSymbolicLink()
      || before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
      || bytes.byteLength !== before.size
    ) throw new Error(`Hermes exact-input plugin source changed while read: ${name}`);
    files.push({ name, path, bytes, sha256: sha256(bytes), sizeBytes: bytes.byteLength });
  }
  return files;
}

async function loadHermesAuthAdapterFiles() {
  if (await realpath(READ_AUTH_ADAPTER_SOURCE_ROOT) !== READ_AUTH_ADAPTER_SOURCE_ROOT) {
    throw new Error("Hermes auth-store adapter source root contains a symbolic-link component.");
  }
  const sourceRootInfo = await lstat(READ_AUTH_ADAPTER_SOURCE_ROOT);
  if (!sourceRootInfo.isDirectory() || sourceRootInfo.isSymbolicLink()) {
    throw new Error("Hermes auth-store adapter source root must be a real directory.");
  }
  const files = [];
  for (const name of READ_AUTH_ADAPTER_FILES) {
    const path = join(READ_AUTH_ADAPTER_SOURCE_ROOT, name);
    if (await realpath(path) !== path) throw new Error(`Hermes auth-store adapter contains a symbolic link: ${name}`);
    const before = await lstat(path);
    const bytes = await readFile(path);
    const after = await lstat(path);
    if (
      !before.isFile()
      || before.isSymbolicLink()
      || !after.isFile()
      || after.isSymbolicLink()
      || before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
      || bytes.byteLength !== before.size
    ) throw new Error(`Hermes auth-store adapter source changed while read: ${name}`);
    files.push({ name, path, bytes, sha256: sha256(bytes), sizeBytes: bytes.byteLength });
  }
  return files;
}

export async function loadHermesAuthAdapterPlanningEvidence() {
  const adapterFiles = await loadHermesAuthAdapterFiles();
  const files = adapterFiles.map(({ name, sha256: fileSha256, sizeBytes }) => ({
    name,
    sha256: fileSha256,
    sizeBytes,
  }));
  const totalBytes = files.reduce((total, file) => total + file.sizeBytes, 0);
  const evidence = {
    schemaVersion: READ_AUTH_ADAPTER_PLANNING_EVIDENCE_SCHEMA,
    contractVersion: HERMES_EXACT_INPUT_AUTH_PROJECTION_CONTRACT,
    files,
    totalBytes,
  };
  return validateHermesAuthAdapterPlanningEvidence({
    ...evidence,
    sha256: sha256(jsonBytes(evidence)),
  });
}

export function validateHermesAuthAdapterPlanningEvidence(evidence) {
  assertExactObjectKeys(
    evidence,
    ["schemaVersion", "contractVersion", "files", "totalBytes", "sha256"],
    "Hermes auth-store adapter planning evidence",
  );
  if (
    evidence.schemaVersion !== READ_AUTH_ADAPTER_PLANNING_EVIDENCE_SCHEMA
    || evidence.contractVersion !== HERMES_EXACT_INPUT_AUTH_PROJECTION_CONTRACT
    || !Array.isArray(evidence.files)
    || evidence.files.length !== READ_AUTH_ADAPTER_FILES.length
  ) throw new Error("Hermes auth-store adapter planning evidence identity drifted.");
  let totalBytes = 0;
  evidence.files.forEach((file, index) => {
    assertExactObjectKeys(file, ["name", "sha256", "sizeBytes"], `Hermes auth adapter planning file ${index}`);
    if (file.name !== READ_AUTH_ADAPTER_FILES[index]) {
      throw new Error("Hermes auth-store adapter planning file order drifted.");
    }
    assertSha256(file.sha256, `Hermes auth adapter planning file ${file.name} digest`);
    assertNonNegativeInteger(file.sizeBytes, `Hermes auth adapter planning file ${file.name} size`);
    if (file.sizeBytes < 1) throw new Error(`Hermes auth-store adapter planning file is empty: ${file.name}`);
    totalBytes += file.sizeBytes;
  });
  if (!Number.isSafeInteger(totalBytes) || evidence.totalBytes !== totalBytes) {
    throw new Error("Hermes auth-store adapter planning evidence total bytes drifted.");
  }
  assertSha256(evidence.sha256, "Hermes auth-store adapter planning evidence digest");
  const { sha256: evidenceSha256, ...descriptor } = evidence;
  if (evidenceSha256 !== sha256(jsonBytes(descriptor))) {
    throw new Error("Hermes auth-store adapter planning evidence digest drifted.");
  }
  return evidence;
}

export function assertHermesAuthAdapterPlanningMatch(adapterFiles, evidence, label = "Hermes auth-store adapter") {
  const validated = validateHermesAuthAdapterPlanningEvidence(evidence);
  if (!Array.isArray(adapterFiles) || !isDeepStrictEqual(adapterFiles, validated.files)) {
    throw new Error(`${label} drifted from the sealed planning evidence.`);
  }
  return true;
}

export async function loadHermesExactInputPluginPlanningEvidence() {
  const pluginFiles = await loadReadPluginFiles();
  const files = pluginFiles.map(({ name, sha256: fileSha256, sizeBytes }) => ({
    name,
    sha256: fileSha256,
    sizeBytes,
  }));
  const totalBytes = files.reduce((total, file) => total + file.sizeBytes, 0);
  const evidence = {
    schemaVersion: READ_PLUGIN_PLANNING_EVIDENCE_SCHEMA,
    files,
    totalBytes,
  };
  return validateHermesExactInputPluginPlanningEvidence({
    ...evidence,
    sha256: sha256(jsonBytes(evidence)),
  });
}

export function validateHermesExactInputPluginPlanningEvidence(evidence) {
  assertExactObjectKeys(
    evidence,
    ["schemaVersion", "files", "totalBytes", "sha256"],
    "Hermes exact-input plugin planning evidence",
  );
  if (
    evidence.schemaVersion !== READ_PLUGIN_PLANNING_EVIDENCE_SCHEMA
    || !Array.isArray(evidence.files)
    || evidence.files.length !== READ_PLUGIN_FILES.length
  ) throw new Error("Hermes exact-input plugin planning evidence identity drifted.");
  let totalBytes = 0;
  evidence.files.forEach((file, index) => {
    assertExactObjectKeys(file, ["name", "sha256", "sizeBytes"], `Hermes exact-input planning file ${index}`);
    if (file.name !== READ_PLUGIN_FILES[index]) {
      throw new Error("Hermes exact-input plugin planning file order drifted.");
    }
    assertSha256(file.sha256, `Hermes exact-input planning file ${file.name} digest`);
    assertNonNegativeInteger(file.sizeBytes, `Hermes exact-input planning file ${file.name} size`);
    if (file.sizeBytes < 1) throw new Error(`Hermes exact-input planning file is empty: ${file.name}`);
    totalBytes += file.sizeBytes;
  });
  if (!Number.isSafeInteger(totalBytes) || evidence.totalBytes !== totalBytes) {
    throw new Error("Hermes exact-input plugin planning evidence total bytes drifted.");
  }
  assertSha256(evidence.sha256, "Hermes exact-input plugin planning evidence digest");
  const { sha256: evidenceSha256, ...descriptor } = evidence;
  if (evidenceSha256 !== sha256(jsonBytes(descriptor))) {
    throw new Error("Hermes exact-input plugin planning evidence digest drifted.");
  }
  return evidence;
}

export function assertHermesExactInputPluginPlanningMatch(pluginFiles, evidence, label = "Hermes exact-input plugin") {
  const validated = validateHermesExactInputPluginPlanningEvidence(evidence);
  if (!Array.isArray(pluginFiles) || !isDeepStrictEqual(pluginFiles, validated.files)) {
    throw new Error(`${label} drifted from the sealed planning evidence.`);
  }
  return true;
}

async function loadHermesAuthStoreBoundary(profileHome, profileId) {
  const absoluteProfileHome = resolve(profileHome);
  const canonicalProfileHome = await realpath(absoluteProfileHome);
  if (canonicalProfileHome !== absoluteProfileHome) {
    throw new Error("Hermes auth-store source profile contains a symbolic-link component.");
  }
  const profileInfo = await lstat(canonicalProfileHome);
  if (!profileInfo.isDirectory() || profileInfo.isSymbolicLink()) {
    throw new Error("Hermes auth-store source profile must be a real directory.");
  }
  if (
    basename(canonicalProfileHome) !== profileId
    || basename(dirname(canonicalProfileHome)) !== "profiles"
  ) throw new Error("Hermes auth-store source profile identity drifted.");
  const hermesRoot = dirname(dirname(canonicalProfileHome));
  if (await realpath(hermesRoot) !== hermesRoot) {
    throw new Error("Hermes global auth-store root contains a symbolic-link component.");
  }
  const rootInfo = await lstat(hermesRoot);
  if (
    !rootInfo.isDirectory()
    || rootInfo.isSymbolicLink()
    || (rootInfo.mode & 0o777) !== 0o700
    || (typeof process.getuid === "function" && rootInfo.uid !== process.getuid())
  ) throw new Error("Hermes global auth-store root must be an owner-only real directory.");
  const authStorePath = join(hermesRoot, "auth.json");
  const authInfo = await lstat(authStorePath);
  if (!authInfo.isFile() || authInfo.isSymbolicLink()) {
    throw new Error("Hermes global auth store must be a real regular file.");
  }
  if (
    (authInfo.mode & 0o777) !== 0o600
    || authInfo.nlink !== 1
    || authInfo.uid !== rootInfo.uid
    || (typeof process.getuid === "function" && authInfo.uid !== process.getuid())
  ) throw new Error("Hermes global auth store must be owner-only and owned by the current user.");
  return {
    contractVersion: HERMES_EXACT_INPUT_AUTH_PROJECTION_CONTRACT,
    sourceProfileHome: canonicalProfileHome,
    hermesRoot,
    authStorePath,
  };
}

function buildReadCapabilityEnvironment(
  baseEnvironment,
  manifestPath,
  manifestSha256,
  authStoreBoundary,
  authAdapterRoot,
) {
  if (
    authStoreBoundary?.contractVersion !== HERMES_EXACT_INPUT_AUTH_PROJECTION_CONTRACT
    || typeof authStoreBoundary.authStorePath !== "string"
    || !isAbsolute(authStoreBoundary.authStorePath)
    || resolve(authStoreBoundary.authStorePath) !== authStoreBoundary.authStorePath
  ) throw new Error("Hermes auth-store execution boundary is invalid.");
  const absoluteAuthAdapterRoot = resolve(authAdapterRoot ?? "");
  const env = {
    ...baseEnvironment.env,
    FIREFLY_READ_MANIFEST: manifestPath,
    FIREFLY_READ_MANIFEST_SHA256: manifestSha256,
    FIREFLY_HERMES_AUTH_STORE: authStoreBoundary.authStorePath,
    FIREFLY_HERMES_AUTH_ADAPTER_CONTRACT: HERMES_EXACT_INPUT_AUTH_PROJECTION_CONTRACT,
    FIREFLY_HERMES_CAPSULE_HOME: baseEnvironment.descriptor.profileHome,
    PYTHONPATH: absoluteAuthAdapterRoot,
  };
  const descriptor = {
    schemaVersion: "hermes-exact-input-execution-environment/v3",
    baseEnvironmentSha256: baseEnvironment.descriptorSha256,
    manifestPath,
    manifestSha256,
    authProjectionContractVersion: HERMES_EXACT_INPUT_AUTH_PROJECTION_CONTRACT,
    authStorePath: authStoreBoundary.authStorePath,
    authAdapterRoot: absoluteAuthAdapterRoot,
    addedEnvironmentKeys: [
      "FIREFLY_HERMES_AUTH_ADAPTER_CONTRACT",
      "FIREFLY_HERMES_AUTH_STORE",
      "FIREFLY_HERMES_CAPSULE_HOME",
      "FIREFLY_READ_MANIFEST",
      "FIREFLY_READ_MANIFEST_SHA256",
      "PYTHONPATH",
    ],
  };
  return { env, descriptor, descriptorSha256: sha256(jsonBytes(descriptor)) };
}

function canonicalReadExecutionPolicy() {
  return {
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
    resultSchema: READ_RESULT_SCHEMA,
    cursorProtocol: "firefly-hermes-read-cursor/v1",
    maxSourceBytes: READ_SOURCE_MAX_BYTES,
    maxEncodedContentChars: READ_CHUNK_ENCODED_CONTENT_MAX_CHARS,
    maxResultChars: READ_CHUNK_RESULT_MAX_CHARS,
    preflightAccounting: "deterministic-chunk-transcript",
    forbiddenCredentialNames: [...READ_EXECUTION_FORBIDDEN_CREDENTIAL_NAMES],
    pythonDontWriteBytecode: "1",
    gitOptionalLocks: "0",
  };
}

function computeReadExecutionEnvironmentSha256(executionPolicy) {
  return sha256(jsonBytes({
    schemaVersion: "hermes-exact-input-environment-template/v3",
    executionPolicy,
    baseEnvironmentKeys: [HERMES_EPHEMERAL_BUNDLED_PLUGINS_KEY],
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
}

function computeReadExecutionRuntimeIdentitySha256({
  sourceRuntimeIdentitySha256,
  manifestSha256,
  pluginFiles,
  authAdapterFiles,
  executionEnvironmentSha256,
}) {
  return sha256(jsonBytes({
    schemaVersion: "hermes-exact-input-runtime-identity/v3",
    sourceRuntimeIdentitySha256,
    manifestSha256,
    pluginFiles,
    authProjectionContractVersion: HERMES_EXACT_INPUT_AUTH_PROJECTION_CONTRACT,
    authAdapterFiles,
    executionEnvironmentSha256,
  }));
}

function canonicalReadCapability(value) {
  assertExactObjectKeys(value, [
    "schemaVersion", "toolset", "tool", "sourceRuntimeIdentitySha256",
    "executionRuntimeIdentitySha256", "executionEnvironmentSha256",
    "manifest", "pluginFiles", "authProjectionContractVersion", "authAdapterFiles",
    "expectedInputs", "cliPolicy", "executionPolicy",
  ], "Hermes exact-input read capability");
  if (
    value.schemaVersion !== READ_CAPABILITY_SCHEMA
    || value.toolset !== HERMES_READ_ONLY_TOOLSET
    || value.tool !== HERMES_READ_ONLY_TOOL
  ) throw new Error("Hermes exact-input read capability identity drifted.");
  for (const key of ["sourceRuntimeIdentitySha256", "executionRuntimeIdentitySha256", "executionEnvironmentSha256"]) {
    assertSha256(value[key], `Hermes exact-input read capability ${key}`);
  }
  assertExactObjectKeys(value.manifest, ["sha256", "sizeBytes"], "Hermes exact-input manifest receipt");
  assertSha256(value.manifest.sha256, "Hermes exact-input manifest digest");
  assertNonNegativeInteger(value.manifest.sizeBytes, "Hermes exact-input manifest size");
  if (!Array.isArray(value.pluginFiles) || value.pluginFiles.length !== READ_PLUGIN_FILES.length) {
    throw new Error("Hermes exact-input plugin file set drifted.");
  }
  value.pluginFiles.forEach((file, index) => {
    assertExactObjectKeys(file, ["name", "sha256", "sizeBytes"], `Hermes exact-input plugin file ${index}`);
    if (file.name !== READ_PLUGIN_FILES[index]) throw new Error("Hermes exact-input plugin file order drifted.");
    assertSha256(file.sha256, `Hermes exact-input plugin file ${file.name} digest`);
    assertNonNegativeInteger(file.sizeBytes, `Hermes exact-input plugin file ${file.name} size`);
  });
  if (
    value.authProjectionContractVersion !== HERMES_EXACT_INPUT_AUTH_PROJECTION_CONTRACT
    || !Array.isArray(value.authAdapterFiles)
    || value.authAdapterFiles.length !== READ_AUTH_ADAPTER_FILES.length
  ) throw new Error("Hermes auth-store adapter capability identity drifted.");
  value.authAdapterFiles.forEach((file, index) => {
    assertExactObjectKeys(file, ["name", "sha256", "sizeBytes"], `Hermes auth adapter file ${index}`);
    if (file.name !== READ_AUTH_ADAPTER_FILES[index]) throw new Error("Hermes auth adapter file order drifted.");
    assertSha256(file.sha256, `Hermes auth adapter file ${file.name} digest`);
    assertNonNegativeInteger(file.sizeBytes, `Hermes auth adapter file ${file.name} size`);
    if (file.sizeBytes < 1) throw new Error(`Hermes auth adapter file is empty: ${file.name}`);
  });
  const manifest = buildHermesExactInputReadManifest(value.expectedInputs);
  if (!isDeepStrictEqual(manifest.inputs, value.expectedInputs)) {
    throw new Error("Hermes exact-input capability inputs are not canonical.");
  }
  assertExactObjectKeys(
    value.cliPolicy,
    ["entrypoint", "flags", "model", "provider", "toolsets"],
    "Hermes exact-input CLI policy",
  );
  if (
    value.cliPolicy.entrypoint !== "attested-delegated-executable"
    || !isDeepStrictEqual(value.cliPolicy.flags, ["--oneshot", "--usage-file", "--pass-session-id", "--toolsets", "--model", "--provider"])
    || !isDeepStrictEqual(value.cliPolicy.toolsets, [HERMES_READ_ONLY_TOOLSET])
    || value.cliPolicy.model !== HERMES_STRUCTURED_MODEL
    || value.cliPolicy.provider !== HERMES_STRUCTURED_PROVIDER
  ) throw new Error("Hermes exact-input CLI policy drifted.");
  if (!isDeepStrictEqual(value.executionPolicy, canonicalReadExecutionPolicy())) {
    throw new Error("Hermes exact-input execution policy drifted.");
  }
  const expectedExecutionEnvironmentSha256 = computeReadExecutionEnvironmentSha256(value.executionPolicy);
  if (value.executionEnvironmentSha256 !== expectedExecutionEnvironmentSha256) {
    throw new Error("Hermes exact-input execution environment identity drifted.");
  }
  const expectedExecutionRuntimeIdentitySha256 = computeReadExecutionRuntimeIdentitySha256({
    sourceRuntimeIdentitySha256: value.sourceRuntimeIdentitySha256,
    manifestSha256: value.manifest.sha256,
    pluginFiles: value.pluginFiles,
    authAdapterFiles: value.authAdapterFiles,
    executionEnvironmentSha256: value.executionEnvironmentSha256,
  });
  if (value.executionRuntimeIdentitySha256 !== expectedExecutionRuntimeIdentitySha256) {
    throw new Error("Hermes exact-input execution runtime identity drifted.");
  }
  return value;
}

function canonicalHistoricalReadExecutionPolicyV2() {
  return {
    schemaVersion: "hermes-exact-input-execution-policy/v2",
    homeScope: "ephemeral-system-temp",
    workspaceScope: "empty-ephemeral-system-temp",
    cleanup: "required-before-finalization",
    credentialPersistence: "forbidden",
    pluginDiscovery: "ephemeral-bundled-root",
    readProtocol: "sequential-cursor-chunks-v2",
    resultSchema: READ_RESULT_SCHEMA,
    cursorProtocol: "firefly-hermes-read-cursor/v1",
    maxSourceBytes: READ_SOURCE_MAX_BYTES,
    maxEncodedContentChars: READ_CHUNK_ENCODED_CONTENT_MAX_CHARS,
    maxResultChars: READ_CHUNK_RESULT_MAX_CHARS,
    preflightAccounting: "deterministic-chunk-transcript",
    forbiddenCredentialNames: [...READ_EXECUTION_FORBIDDEN_CREDENTIAL_NAMES],
    pythonDontWriteBytecode: "1",
    gitOptionalLocks: "0",
  };
}

function canonicalHistoricalReadCapabilityV2(value) {
  assertExactObjectKeys(value, [
    "schemaVersion", "toolset", "tool", "sourceRuntimeIdentitySha256",
    "executionRuntimeIdentitySha256", "executionEnvironmentSha256",
    "manifest", "pluginFiles", "expectedInputs", "cliPolicy", "executionPolicy",
  ], "Historical Hermes exact-input read capability");
  if (
    value.schemaVersion !== "private-hermes-exact-input-read-capability/v2"
    || value.toolset !== HERMES_READ_ONLY_TOOLSET
    || value.tool !== HERMES_READ_ONLY_TOOL
  ) throw new Error("Historical Hermes exact-input read capability identity drifted.");
  for (const key of ["sourceRuntimeIdentitySha256", "executionRuntimeIdentitySha256", "executionEnvironmentSha256"]) {
    assertSha256(value[key], `Historical Hermes exact-input read capability ${key}`);
  }
  assertExactObjectKeys(value.manifest, ["sha256", "sizeBytes"], "Historical Hermes exact-input manifest receipt");
  assertSha256(value.manifest.sha256, "Historical Hermes exact-input manifest digest");
  assertNonNegativeInteger(value.manifest.sizeBytes, "Historical Hermes exact-input manifest size");
  if (!Array.isArray(value.pluginFiles) || value.pluginFiles.length !== READ_PLUGIN_FILES.length) {
    throw new Error("Historical Hermes exact-input plugin file set drifted.");
  }
  value.pluginFiles.forEach((file, index) => {
    assertExactObjectKeys(file, ["name", "sha256", "sizeBytes"], `Historical Hermes exact-input plugin file ${index}`);
    if (file.name !== READ_PLUGIN_FILES[index]) throw new Error("Historical Hermes exact-input plugin file order drifted.");
    assertSha256(file.sha256, `Historical Hermes exact-input plugin file ${file.name} digest`);
    assertNonNegativeInteger(file.sizeBytes, `Historical Hermes exact-input plugin file ${file.name} size`);
    if (file.sizeBytes < 1) throw new Error(`Historical Hermes exact-input plugin file is empty: ${file.name}`);
  });
  const manifest = buildHermesExactInputReadManifest(value.expectedInputs);
  if (!isDeepStrictEqual(manifest.inputs, value.expectedInputs)) {
    throw new Error("Historical Hermes exact-input capability inputs are not canonical.");
  }
  assertExactObjectKeys(value.cliPolicy, ["flags", "model", "provider", "toolsets"], "Historical Hermes exact-input CLI policy");
  if (
    !isDeepStrictEqual(value.cliPolicy.flags, ["--oneshot", "--usage-file", "--pass-session-id", "--toolsets", "--model", "--provider"])
    || !isDeepStrictEqual(value.cliPolicy.toolsets, [HERMES_READ_ONLY_TOOLSET])
    || value.cliPolicy.model !== HERMES_STRUCTURED_MODEL
    || value.cliPolicy.provider !== HERMES_STRUCTURED_PROVIDER
  ) throw new Error("Historical Hermes exact-input CLI policy drifted.");
  const executionPolicy = canonicalHistoricalReadExecutionPolicyV2();
  if (!isDeepStrictEqual(value.executionPolicy, executionPolicy)) {
    throw new Error("Historical Hermes exact-input execution policy drifted.");
  }
  const executionEnvironmentSha256 = sha256(jsonBytes({
    schemaVersion: "hermes-exact-input-environment-template/v2",
    executionPolicy,
    baseEnvironmentKeys: [HERMES_EPHEMERAL_BUNDLED_PLUGINS_KEY],
    manifestBinding: "attempt-scoped-absolute-path-plus-sha256",
    addedEnvironmentKeys: ["FIREFLY_READ_MANIFEST", "FIREFLY_READ_MANIFEST_SHA256"],
  }));
  if (value.executionEnvironmentSha256 !== executionEnvironmentSha256) {
    throw new Error("Historical Hermes exact-input execution environment identity drifted.");
  }
  const executionRuntimeIdentitySha256 = sha256(jsonBytes({
    schemaVersion: "hermes-exact-input-runtime-identity/v2",
    sourceRuntimeIdentitySha256: value.sourceRuntimeIdentitySha256,
    manifestSha256: value.manifest.sha256,
    pluginFiles: value.pluginFiles,
    executionEnvironmentSha256,
  }));
  if (value.executionRuntimeIdentitySha256 !== executionRuntimeIdentitySha256) {
    throw new Error("Historical Hermes exact-input execution runtime identity drifted.");
  }
  return value;
}

export function validateHistoricalHermesExactInputReadCapabilityV2({
  bytes,
  expectedFiles,
  sourceRuntimeIdentitySha256,
} = {}) {
  if (!Buffer.isBuffer(bytes)) throw new Error("Historical Hermes exact-input read capability bytes must be a buffer.");
  let capability;
  try {
    capability = canonicalHistoricalReadCapabilityV2(
      JSON.parse(exactUtf8Text(bytes, "Historical Hermes exact-input read capability")),
    );
  } catch (error) {
    throw new Error(`Historical Hermes exact-input read capability is invalid: ${error.message}`);
  }
  if (bytes.compare(jsonBytes(capability)) !== 0) {
    throw new Error("Historical Hermes exact-input read capability is not canonical JSON.");
  }
  if (expectedFiles !== undefined) {
    const expectedInputs = buildHermesExactInputReadManifest(expectedFiles).inputs;
    if (!isDeepStrictEqual(capability.expectedInputs, expectedInputs)) {
      throw new Error("Historical Hermes exact-input read capability input binding drifted.");
    }
    const manifestBytes = jsonBytes({ schemaVersion: READ_MANIFEST_SCHEMA, inputs: expectedInputs });
    if (
      capability.manifest.sha256 !== sha256(manifestBytes)
      || capability.manifest.sizeBytes !== manifestBytes.byteLength
    ) throw new Error("Historical Hermes exact-input read capability manifest binding drifted.");
  }
  if (
    sourceRuntimeIdentitySha256 !== undefined
    && capability.sourceRuntimeIdentitySha256 !== sourceRuntimeIdentitySha256
  ) throw new Error("Historical Hermes exact-input read capability source runtime binding drifted.");
  return { capability, bytes, sha256: sha256(bytes) };
}

export function validateHermesExactInputReadCapability({
  bytes,
  expectedFiles,
  sourceRuntimeIdentitySha256,
} = {}) {
  if (!Buffer.isBuffer(bytes)) throw new Error("Hermes exact-input read capability bytes must be a buffer.");
  let capability;
  try {
    capability = canonicalReadCapability(JSON.parse(exactUtf8Text(bytes, "Hermes exact-input read capability")));
  } catch (error) {
    throw new Error(`Hermes exact-input read capability is invalid: ${error.message}`);
  }
  if (bytes.compare(jsonBytes(capability)) !== 0) {
    throw new Error("Hermes exact-input read capability is not canonical JSON.");
  }
  if (expectedFiles !== undefined) {
    const expectedInputs = buildHermesExactInputReadManifest(expectedFiles).inputs;
    if (!isDeepStrictEqual(capability.expectedInputs, expectedInputs)) {
      throw new Error("Hermes exact-input read capability input binding drifted.");
    }
    const manifestBytes = jsonBytes({ schemaVersion: READ_MANIFEST_SCHEMA, inputs: expectedInputs });
    if (
      capability.manifest.sha256 !== sha256(manifestBytes)
      || capability.manifest.sizeBytes !== manifestBytes.byteLength
    ) throw new Error("Hermes exact-input read capability manifest binding drifted.");
  }
  if (
    sourceRuntimeIdentitySha256 !== undefined
    && capability.sourceRuntimeIdentitySha256 !== sourceRuntimeIdentitySha256
  ) throw new Error("Hermes exact-input read capability source runtime binding drifted.");
  return { capability, bytes, sha256: sha256(bytes) };
}

export async function prepareHermesExactInputReadCapability({
  runRoot,
  profileId,
  runtime,
  inputEvidence,
  expectedPluginPlanningEvidence,
  expectedAuthAdapterPlanningEvidence,
} = {}) {
  const absoluteRunRoot = resolve(runRoot ?? "");
  await assertRealRunPath(absoluteRunRoot, absoluteRunRoot, "Hermes exact-input capability run root", {
    requireExisting: true,
    targetType: "directory",
  });
  if (!runtime || runtime.profileId !== profileId || !inputEvidence) {
    throw new Error("Hermes exact-input capability requires attested runtime and input evidence.");
  }
  const capabilityRoot = join(absoluteRunRoot, ".readonly-capability");
  const capabilityRootInfo = await lstatOrNull(capabilityRoot);
  const requireExisting = capabilityRootInfo !== null;
  const manifestBytes = jsonBytes(buildHermesExactInputReadManifest(inputEvidence.files));
  const manifestPath = join(capabilityRoot, "input-manifest.json");
  const contextCacheBytes = Buffer.from(
    `context_lengths:\n  gpt-5.6-sol@https://chatgpt.com/backend-api/codex: ${runtime.contextLimit}\n`,
  );
  if (sha256(extractHermesContextLimitEntry(contextCacheBytes)) !== runtime.contextLimitEntrySha256) {
    throw new Error("Hermes exact-input context cache drifted from the source runtime.");
  }
  const pluginFiles = await loadReadPluginFiles();
  const pluginFileReceipts = pluginFiles.map(({ name, sha256: fileSha256, sizeBytes }) => ({
    name,
    sha256: fileSha256,
    sizeBytes,
  }));
  const authAdapterFiles = await loadHermesAuthAdapterFiles();
  const authAdapterFileReceipts = authAdapterFiles.map(({ name, sha256: fileSha256, sizeBytes }) => ({
    name,
    sha256: fileSha256,
    sizeBytes,
  }));
  if (expectedPluginPlanningEvidence !== undefined) {
    assertHermesExactInputPluginPlanningMatch(
      pluginFileReceipts,
      expectedPluginPlanningEvidence,
      "Hermes exact-input capability plugin",
    );
  }
  if (expectedAuthAdapterPlanningEvidence !== undefined) {
    assertHermesAuthAdapterPlanningMatch(
      authAdapterFileReceipts,
      expectedAuthAdapterPlanningEvidence,
      "Hermes exact-input capability auth adapter",
    );
  }
  if (!requireExisting) await ensureRealAbsoluteDirectory(capabilityRoot, "Hermes exact-input capability root");
  await assertRealRunPath(absoluteRunRoot, capabilityRoot, "Hermes exact-input capability root", {
    requireExisting: true,
    targetType: "directory",
  });
  await writeOrReuseRunFile(
    absoluteRunRoot,
    manifestPath,
    manifestBytes,
    "Hermes exact-input manifest",
    { requireExisting },
  );
  const capabilityEntries = (await readdir(capabilityRoot)).sort();
  if (!isDeepStrictEqual(capabilityEntries, ["input-manifest.json"])) {
    throw new Error("Hermes exact-input capability root contains an unexpected or credential-bearing artifact.");
  }
  const executionPolicy = canonicalReadExecutionPolicy();
  const executionEnvironmentSha256 = computeReadExecutionEnvironmentSha256(executionPolicy);
  const executionRuntimeIdentitySha256 = computeReadExecutionRuntimeIdentitySha256({
    sourceRuntimeIdentitySha256: runtime.hermesRuntimeIdentitySha256,
    manifestSha256: sha256(manifestBytes),
    pluginFiles: pluginFileReceipts,
    authAdapterFiles: authAdapterFileReceipts,
    executionEnvironmentSha256,
  });
  const capability = canonicalReadCapability({
    schemaVersion: READ_CAPABILITY_SCHEMA,
    toolset: HERMES_READ_ONLY_TOOLSET,
    tool: HERMES_READ_ONLY_TOOL,
    sourceRuntimeIdentitySha256: runtime.hermesRuntimeIdentitySha256,
    executionRuntimeIdentitySha256,
    executionEnvironmentSha256,
    manifest: { sha256: sha256(manifestBytes), sizeBytes: manifestBytes.byteLength },
    pluginFiles: pluginFileReceipts,
    authProjectionContractVersion: HERMES_EXACT_INPUT_AUTH_PROJECTION_CONTRACT,
    authAdapterFiles: authAdapterFileReceipts,
    expectedInputs: buildHermesExactInputReadManifest(inputEvidence.files).inputs,
    cliPolicy: {
      entrypoint: "attested-delegated-executable",
      flags: ["--oneshot", "--usage-file", "--pass-session-id", "--toolsets", "--model", "--provider"],
      model: HERMES_STRUCTURED_MODEL,
      provider: HERMES_STRUCTURED_PROVIDER,
      toolsets: [HERMES_READ_ONLY_TOOLSET],
    },
    executionPolicy,
  });
  return {
    capability,
    bytes: jsonBytes(capability),
    sha256: sha256(jsonBytes(capability)),
    manifestBytes,
    contextCacheBytes,
    pluginFiles,
    authAdapterFiles,
  };
}

const HERMES_EXECUTION_SOURCE_MATCH_KEYS = Object.freeze([
  "profileConfigSha256",
  "soulSha256",
  "contentNeutralContractId",
  "contentNeutralContractSha256",
  "contentNeutralSoulSectionSha256",
  "contextLimit",
  "contextLimitEntrySha256",
  "hermesCommand",
  "hermesExecutableSha256",
  "hermesDelegatedExecutableSha256",
  "hermesVersionSha256",
  "hermesImplementationSha256",
  "hermesDependencySha256",
]);

function assertHermesExecutionRuntimeMatchesSource(sourceRuntime, executionRuntime, label) {
  for (const key of HERMES_EXECUTION_SOURCE_MATCH_KEYS) {
    if (!isDeepStrictEqual(executionRuntime[key], sourceRuntime[key])) {
      throw new Error(`${label} changed: ${key}`);
    }
  }
}

async function resolveHermesDelegatedExecutionCommand(runtime) {
  const wrapper = await regularFileIdentity(runtime.hermesCommand, "Hermes execution wrapper");
  if (wrapper.sha256 !== runtime.hermesExecutableSha256) {
    throw new Error("Hermes execution wrapper drifted from its attested bytes.");
  }
  const wrapperBytes = await readFile(wrapper.resolvedPath);
  const delegatedTarget = resolveHermesDelegatedWrapperTarget(wrapperBytes);
  const delegated = delegatedTarget
    ? await regularFileIdentity(delegatedTarget, "Hermes delegated execution command")
    : wrapper;
  if (delegated.sha256 !== runtime.hermesDelegatedExecutableSha256) {
    throw new Error("Hermes delegated execution command drifted from its attested bytes.");
  }
  await access(delegated.resolvedPath, fsConstants.X_OK);
  return delegated.resolvedPath;
}

export function resolveHermesDelegatedWrapperTarget(wrapperBytes) {
  const text = exactUtf8Text(wrapperBytes, "Hermes execution wrapper");
  const delegatedFragment = /\bexec\s+["']([^"'\r\n]+)["']\s+["']?\$@["']?/u.exec(text);
  if (!delegatedFragment) return null;

  // Firefly intentionally bypasses only the current two-line environment
  // scrubber so its sealed PYTHONPATH can load the auth adapter. Any future
  // wrapper prelude, guard, activation, or control flow must be reviewed and
  // represented explicitly instead of being silently skipped.
  const supported = /^#!\/usr\/bin\/env bash\nunset PYTHONPATH\nunset PYTHONHOME\nexec "([^"\r\n]+)" "\$@"\n?$/u.exec(text);
  const delegatedTarget = supported?.[1];
  if (
    !delegatedTarget
    || delegatedTarget !== delegatedFragment[1]
    || !isAbsolute(delegatedTarget)
    || resolve(delegatedTarget) !== delegatedTarget
  ) {
    throw new Error("Hermes delegated execution wrapper has unsupported semantics; refusing to bypass its prelude.");
  }
  return delegatedTarget;
}

async function createExclusiveExecutionFile(path, bytes, label) {
  try {
    await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
  } catch (error) {
    throw new Error(`${label} could not be created exclusively: ${error.message}`);
  }
}

async function createHermesExactInputExecutionCapsule({
  runRoot,
  profileId,
  runtime,
  readCapability,
  sourceAuthStoreBoundary,
}) {
  const tempParent = await realpath(tmpdir());
  let root;
  try {
    root = await realpath(await mkdtemp(join(tempParent, READ_EXECUTION_TEMP_PREFIX)));
    const rootInfo = await lstat(root);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
      throw new Error("Hermes ephemeral execution root is not a real directory.");
    }
    const relativeToRunRoot = relative(resolve(runRoot), root);
    if (relativeToRunRoot === "" || (!relativeToRunRoot.startsWith(`..${sep}`) && relativeToRunRoot !== "..")) {
      throw new Error("Hermes ephemeral execution root must be outside the run root.");
    }
    const hermesRoot = join(root, "hermes");
    const profileHome = join(hermesRoot, "profiles", profileId);
    const bundledPluginsRoot = join(root, HERMES_EPHEMERAL_BUNDLED_PLUGINS_DIRECTORY);
    const pluginRoot = join(bundledPluginsRoot, HERMES_READ_ONLY_TOOLSET);
    const authAdapterRoot = join(root, READ_AUTH_ADAPTER_DIRECTORY);
    const workspace = join(root, "workspace");
    const contextCachePath = join(hermesRoot, "context_length_cache.yaml");
    const manifestPath = join(root, "input-manifest.json");
    await Promise.all([
      mkdir(profileHome, { recursive: true, mode: 0o700 }),
      mkdir(pluginRoot, { recursive: true, mode: 0o700 }),
      mkdir(authAdapterRoot, { mode: 0o700 }),
      mkdir(workspace, { mode: 0o700 }),
    ]);
    await Promise.all([
      createExclusiveExecutionFile(join(profileHome, "config.yaml"), runtime.configBytes, "Hermes ephemeral config"),
      createExclusiveExecutionFile(join(profileHome, "SOUL.md"), runtime.soulBytes, "Hermes ephemeral SOUL"),
      createExclusiveExecutionFile(join(profileHome, ".no-bundled-skills"), Buffer.alloc(0), "Hermes ephemeral skill boundary"),
      createExclusiveExecutionFile(contextCachePath, readCapability.contextCacheBytes, "Hermes ephemeral context cache"),
      createExclusiveExecutionFile(manifestPath, readCapability.manifestBytes, "Hermes ephemeral input manifest"),
      ...readCapability.pluginFiles.map((file) => createExclusiveExecutionFile(
        join(pluginRoot, file.name),
        file.bytes,
        `Hermes ephemeral plugin ${file.name}`,
      )),
      ...readCapability.authAdapterFiles.map((file) => createExclusiveExecutionFile(
        join(authAdapterRoot, file.name),
        file.bytes,
        `Hermes ephemeral auth adapter ${file.name}`,
      )),
    ]);
    const authStoreBoundary = await loadHermesAuthStoreBoundary(runtime.profileHome, profileId);
    if (!isDeepStrictEqual(authStoreBoundary, sourceAuthStoreBoundary)) {
      throw new Error("Hermes authoritative auth-store boundary drifted before capsule execution.");
    }
    const baseExecutionEnvironment = buildHermesExecutionEnvironment({
      profileHome,
      projectCwd: workspace,
      contextCachePath,
      bundledPluginsPath: bundledPluginsRoot,
    });
    const executionEnvironment = buildReadCapabilityEnvironment(
      baseExecutionEnvironment,
      manifestPath,
      readCapability.capability.manifest.sha256,
      authStoreBoundary,
      authAdapterRoot,
    );
    const executionRuntime = await loadHermesRuntimeEvidence(profileHome, profileId, {
      projectCwd: workspace,
      executionEnvironment: baseExecutionEnvironment,
    });
    assertHermesExecutionRuntimeMatchesSource(runtime, executionRuntime, "Hermes ephemeral execution runtime");
    return {
      root,
      rootIdentity: { dev: rootInfo.dev, ino: rootInfo.ino },
      profileHome,
      bundledPluginsRoot,
      pluginRoot,
      authAdapterRoot,
      workspace,
      contextCachePath,
      manifestPath,
      baseExecutionEnvironment,
      executionEnvironment,
      executionRuntime,
      authStoreBoundary,
      disposed: false,
    };
  } catch (error) {
    if (root) await rm(root, { recursive: true, force: true });
    throw error;
  }
}

async function assertHermesExactInputExecutionCapsuleStable(capsule, sourceRuntime, readCapability, label) {
  const rootInfo = await lstat(capsule.root);
  if (
    !rootInfo.isDirectory()
    || rootInfo.isSymbolicLink()
    || rootInfo.dev !== capsule.rootIdentity.dev
    || rootInfo.ino !== capsule.rootIdentity.ino
  ) throw new Error(`${label} root identity drifted.`);
  const [
    configBytes,
    soulBytes,
    contextCacheBytes,
    manifestBytes,
    bundledPluginEntries,
    pluginEntries,
    authAdapterEntries,
    workspaceEntries,
  ] = await Promise.all([
    readFile(join(capsule.profileHome, "config.yaml")),
    readFile(join(capsule.profileHome, "SOUL.md")),
    readFile(capsule.contextCachePath),
    readFile(capsule.manifestPath),
    readdir(capsule.bundledPluginsRoot),
    readdir(capsule.pluginRoot),
    readdir(capsule.authAdapterRoot),
    readdir(capsule.workspace),
  ]);
  if (
    configBytes.compare(sourceRuntime.configBytes) !== 0
    || soulBytes.compare(sourceRuntime.soulBytes) !== 0
    || contextCacheBytes.compare(readCapability.contextCacheBytes) !== 0
    || manifestBytes.compare(readCapability.manifestBytes) !== 0
    || !isDeepStrictEqual(bundledPluginEntries.sort(), [HERMES_READ_ONLY_TOOLSET])
    || !isDeepStrictEqual(pluginEntries.sort(), [...READ_PLUGIN_FILES].sort())
    || !isDeepStrictEqual(authAdapterEntries.sort(), [...READ_AUTH_ADAPTER_FILES].sort())
    || workspaceEntries.length !== 0
  ) throw new Error(`${label} static capability bytes drifted.`);
  for (const file of readCapability.pluginFiles) {
    if ((await readFile(join(capsule.pluginRoot, file.name))).compare(file.bytes) !== 0) {
      throw new Error(`${label} plugin bytes drifted: ${file.name}`);
    }
  }
  for (const file of readCapability.authAdapterFiles) {
    if ((await readFile(join(capsule.authAdapterRoot, file.name))).compare(file.bytes) !== 0) {
      throw new Error(`${label} auth adapter bytes drifted: ${file.name}`);
    }
  }
  const authStoreBoundary = await loadHermesAuthStoreBoundary(sourceRuntime.profileHome, sourceRuntime.profileId);
  if (!isDeepStrictEqual(authStoreBoundary, capsule.authStoreBoundary)) {
    throw new Error(`${label} authoritative auth-store boundary drifted.`);
  }
  const expectedExecutionEnvironment = buildReadCapabilityEnvironment(
    capsule.baseExecutionEnvironment,
    capsule.manifestPath,
    readCapability.capability.manifest.sha256,
    authStoreBoundary,
    capsule.authAdapterRoot,
  );
  if (
    !isDeepStrictEqual(expectedExecutionEnvironment.descriptor, capsule.executionEnvironment.descriptor)
    || expectedExecutionEnvironment.descriptorSha256 !== capsule.executionEnvironment.descriptorSha256
    || !isDeepStrictEqual(expectedExecutionEnvironment.env, capsule.executionEnvironment.env)
  ) throw new Error(`${label} execution environment drifted.`);
  const executionRuntime = await loadHermesRuntimeEvidence(capsule.profileHome, sourceRuntime.profileId, {
    projectCwd: capsule.workspace,
    executionEnvironment: capsule.baseExecutionEnvironment,
  });
  assertHermesExecutionRuntimeMatchesSource(sourceRuntime, executionRuntime, `${label} runtime`);
  assertHermesRuntimeEvidenceEqual(capsule.executionRuntime, executionRuntime, `${label} attempt runtime`);
}

async function findHermesExecutionCredentialArtifacts(root) {
  const findings = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const info = await lstat(path);
      if (info.isSymbolicLink()) {
        findings.push(`${relative(root, path)}:symlink`);
        continue;
      }
      if (READ_EXECUTION_FORBIDDEN_CREDENTIAL_NAMES.includes(entry.name.toLowerCase())) {
        findings.push(relative(root, path));
      }
      if (info.isDirectory()) await walk(path);
    }
  }
  await walk(root);
  return findings.sort();
}

async function disposeHermesExactInputExecutionCapsule(capsule) {
  if (!capsule || capsule.disposed) return;
  const tempParent = await realpath(tmpdir());
  const relativeToTemp = relative(tempParent, capsule.root);
  if (
    relativeToTemp.startsWith(`..${sep}`)
    || relativeToTemp === ".."
    || !basename(capsule.root).startsWith(READ_EXECUTION_TEMP_PREFIX)
  ) throw new Error("Hermes ephemeral execution cleanup target escaped the owned temp boundary.");
  const rootInfo = await lstat(capsule.root);
  if (
    !rootInfo.isDirectory()
    || rootInfo.isSymbolicLink()
    || rootInfo.dev !== capsule.rootIdentity.dev
    || rootInfo.ino !== capsule.rootIdentity.ino
  ) throw new Error("Hermes ephemeral execution cleanup root identity drifted; preserve for manual audit.");
  let authBoundaryError = null;
  try {
    const observedAuthStoreBoundary = await loadHermesAuthStoreBoundary(
      capsule.authStoreBoundary.sourceProfileHome,
      basename(capsule.authStoreBoundary.sourceProfileHome),
    );
    if (!isDeepStrictEqual(observedAuthStoreBoundary, capsule.authStoreBoundary)) {
      throw new Error("Hermes authoritative auth-store boundary drifted during execution.");
    }
  } catch (error) {
    authBoundaryError = error;
  }
  const credentialArtifacts = await findHermesExecutionCredentialArtifacts(capsule.root);
  await rm(capsule.root, { recursive: true, force: false });
  capsule.disposed = true;
  if (await lstatOrNull(capsule.root)) throw new Error("Hermes ephemeral execution root survived cleanup.");
  if (credentialArtifacts.length > 0) {
    throw new Error(`Hermes ephemeral execution created a forbidden credential artifact: ${credentialArtifacts.join(", ")}`);
  }
  if (authBoundaryError) throw authBoundaryError;
}

function assertInputEvidenceEqual(expected, actual, label = "Hermes structured input") {
  if (!expected || !actual || !isDeepStrictEqual(expected, actual)) {
    throw new Error(`${label} changed during structured execution.`);
  }
  return true;
}

function assertReadCapabilityEqual(expected, actual, label = "Hermes exact-input capability") {
  if (
    !expected
    || !actual
    || expected.sha256 !== actual.sha256
    || expected.bytes.compare(actual.bytes) !== 0
    || !isDeepStrictEqual(expected.capability, actual.capability)
  ) throw new Error(`${label} changed during structured execution.`);
  if (expected.manifestBytes.compare(actual.manifestBytes) !== 0) throw new Error(`${label} manifest changed.`);
  if (expected.contextCacheBytes.compare(actual.contextCacheBytes) !== 0) throw new Error(`${label} context cache changed.`);
  if (
    expected.authAdapterFiles.length !== actual.authAdapterFiles.length
    || expected.authAdapterFiles.some((file, index) => (
      file.name !== actual.authAdapterFiles[index]?.name
      || file.bytes.compare(actual.authAdapterFiles[index].bytes) !== 0
    ))
  ) throw new Error(`${label} auth adapter changed.`);
  return true;
}

async function revalidateStructuredRunInputs(input, label) {
  const runtime = await loadHermesRuntimeEvidence(input.profileHome, input.profileId, {
    projectCwd: input.projectCwd,
    executionEnvironment: input.executionEnvironment,
  });
  assertHermesRuntimeEvidenceEqual(input.runtime, runtime, `${label} runtime`);
  // This read must happen after the potentially slow runtime attestation. A
  // parallel snapshot could approve bytes that changed while --version ran.
  const inputEvidence = await loadHermesExactInputEvidence(input.expectedReadPaths, input.inputDigest);
  assertInputEvidenceEqual(input.inputEvidence, inputEvidence, `${label} input`);
  const readCapability = await prepareHermesExactInputReadCapability({
    runRoot: input.runRoot,
    profileId: input.profileId,
    runtime: input.runtime,
    inputEvidence,
    expectedPluginPlanningEvidence: input.expectedPluginPlanningEvidence,
    expectedAuthAdapterPlanningEvidence: input.expectedAuthAdapterPlanningEvidence,
  });
  assertReadCapabilityEqual(input.readCapability, readCapability, `${label} read capability`);
}

function buildAttemptInputAttestation(input) {
  if (!input.runtime || !input.inputEvidence || !input.readCapability) {
    throw new Error("Hermes attempt input attestation requires verified runtime and input evidence.");
  }
  return buildHermesStructuredAttemptInputAttestation({
    schemaVersion: HERMES_STRUCTURED_ATTEMPT_INPUT_ATTESTATION_SCHEMA,
    role: input.role,
    profileHome: input.profileHome,
    projectCwd: input.projectCwd,
    profileId: input.profileId,
    promptSha256: sha256(Buffer.from(input.prompt)),
    inputDigest: input.inputDigest,
    inputSha256: input.inputEvidence.inputSha256,
    expectedReads: input.inputEvidence.files.map((file) => ({
      path: file.path,
      sha256: file.sha256,
      sizeBytes: file.sizeBytes,
    })),
    outputReserveTokens: input.outputReserveTokens,
    executionEnvironmentSha256: input.executionEnvironment.descriptorSha256,
    readCapabilitySha256: input.readCapability.sha256,
    runtime: Object.fromEntries(HERMES_RUNTIME_STABILITY_KEYS.map((key) => [key, input.runtime[key]])),
  });
}

function validateAttemptInputAttestation(input, attemptDir, bytes) {
  const expected = buildAttemptInputAttestation(input);
  try {
    return validateHermesStructuredAttemptInputAttestation({ bytes, attemptDir, expected });
  } catch (error) {
    throw new Error(`Hermes attempt input attestation drifted: ${basename(attemptDir)}: ${error.message}`, { cause: error });
  }
}

function attemptPaths(attemptDir) {
  return {
    candidateOutputPath: join(attemptDir, "candidate-output.txt"),
    inputAttestationPath: join(attemptDir, "input-attestation.json"),
    readCapabilityPath: join(attemptDir, "read-capability.json"),
    usagePath: join(attemptDir, "usage.json"),
    resultPath: join(attemptDir, "result.json"),
    tracePath: join(attemptDir, "session.jsonl"),
    receiptPath: join(attemptDir, "host-receipt.json"),
    completionPath: join(attemptDir, "completed.json"),
  };
}

async function readAttemptArtifacts(runRoot, attemptDir) {
  await assertRealRunPath(runRoot, join(runRoot, "attempts"), "Hermes attempts directory", {
    requireExisting: true,
    targetType: "directory",
  });
  await assertRealRunPath(runRoot, attemptDir, "Hermes attempt directory", {
    requireExisting: true,
    targetType: "directory",
  });
  const presentNames = (await readdir(attemptDir)).sort();
  if (presentNames.some((name) => !HERMES_STRUCTURED_ATTEMPT_EVIDENCE_FILENAMES.includes(name))) {
    throw new Error(`Hermes structured attempt contains an unexpected evidence file: ${basename(attemptDir)}`);
  }
  const paths = attemptPaths(attemptDir);
  for (const [name, path] of Object.entries(paths).filter(([name]) => name !== "receiptPath" && name !== "completionPath")) {
    await assertRealRunPath(runRoot, path, `Hermes attempt ${name}`, { requireExisting: true, targetType: "file" });
  }
  const [candidateOutputBytes, inputAttestationBytes, readCapabilityBytes, usageBytes, resultBytes, traceBytes] = await Promise.all([
    readFile(paths.candidateOutputPath),
    readFile(paths.inputAttestationPath),
    readFile(paths.readCapabilityPath),
    readFile(paths.usagePath),
    readFile(paths.resultPath),
    readFile(paths.tracePath),
  ]);
  const traceLines = traceBytes.toString("utf8").trim().split("\n").filter(Boolean);
  if (traceLines.length !== 1) throw new Error("Hermes structured trace export must contain one session.");
  return {
    paths,
    candidateOutputBytes,
    inputAttestationBytes,
    readCapabilityBytes,
    usageBytes,
    resultBytes,
    traceBytes,
    usage: JSON.parse(usageBytes.toString("utf8")),
    result: JSON.parse(resultBytes.toString("utf8")),
    trace: JSON.parse(traceLines[0]),
  };
}

async function validateResultCallback(validateResult, result) {
  const verdict = await validateResult(result);
  if (verdict === false) throw new Error("Hermes structured result validator rejected the result.");
}

async function buildValidatedReceipt(input, artifacts) {
  await validateResultCallback(input.validateResult, artifacts.result);
  const storedReadCapability = validateHermesExactInputReadCapability({
    bytes: artifacts.readCapabilityBytes,
    expectedFiles: input.inputEvidence.files,
    sourceRuntimeIdentitySha256: input.runtime.hermesRuntimeIdentitySha256,
  }).capability;
  if (
    !isDeepStrictEqual(storedReadCapability, input.readCapability.capability)
    || sha256(artifacts.readCapabilityBytes) !== input.readCapability.sha256
  ) throw new Error("Hermes exact-input read capability drifted from the attested execution boundary.");
  let candidateResult;
  try {
    candidateResult = parseStructuredJson(artifacts.candidateOutputBytes.toString("utf8"));
  } catch (error) {
    throw new Error(`Hermes candidate output is not valid structured JSON: ${error.message}`);
  }
  if (!isDeepStrictEqual(candidateResult, artifacts.result)) {
    throw new Error("Hermes candidate output drifted from the stored structured result.");
  }
  const traceEvidence = validateHermesStructuredTrace({
    trace: artifacts.trace,
    usage: artifacts.usage,
    profileId: input.profileId,
    prompt: input.prompt,
    soulText: input.runtime.soulText,
    expectedReadPaths: input.expectedReadPaths,
    result: artifacts.result,
    contextLimit: input.runtime.contextLimit,
    inputEvidenceBytes: input.inputEvidence.totalBytes,
    outputReserveTokens: input.outputReserveTokens,
  });
  const exactReadback = await validateHermesExactInputTrace({
    trace: artifacts.trace,
    expectedFiles: input.inputEvidence.files,
  });
  if (!isDeepStrictEqual(exactReadback.exactReadSha256s, input.inputEvidence.files.map((file) => file.sha256))) {
    throw new Error("Hermes exact-read bytes drifted from the bound input bytes.");
  }
  const receipt = {
    schemaVersion: RECEIPT_SCHEMA,
    role: input.role,
    runId: artifacts.usage.session_id,
    profileId: input.profileId,
    model: HERMES_STRUCTURED_MODEL,
    provider: HERMES_STRUCTURED_PROVIDER,
    readCapabilitySha256: input.readCapability.sha256,
    readCapabilityTool: HERMES_READ_ONLY_TOOL,
    readCapabilityToolset: HERMES_READ_ONLY_TOOLSET,
    readExecutionEnvironmentSha256: input.readCapability.capability.executionEnvironmentSha256,
    readExecutionRuntimeIdentitySha256: input.readCapability.capability.executionRuntimeIdentitySha256,
    readManifestSha256: input.readCapability.capability.manifest.sha256,
    reasoningEffort: HERMES_STRUCTURED_REASONING,
    runtimeAttestation: input.runtime.runtimeAttestation,
    promptSha256: sha256(Buffer.from(input.prompt)),
    inputDigest: input.inputDigest,
    inputSha256: input.inputEvidence.inputSha256,
    profileConfigSha256: input.runtime.profileConfigSha256,
    soulSha256: input.runtime.soulSha256,
    contentNeutralContractId: input.runtime.contentNeutralContractId,
    contentNeutralContractSha256: input.runtime.contentNeutralContractSha256,
    contentNeutralSoulSectionSha256: input.runtime.contentNeutralSoulSectionSha256,
    effectiveSystemPromptSha256: traceEvidence.effectiveSystemPromptSha256,
    contextLimitEntrySha256: input.runtime.contextLimitEntrySha256,
    hermesExecutableSha256: input.runtime.hermesExecutableSha256,
    hermesDelegatedExecutableSha256: input.runtime.hermesDelegatedExecutableSha256,
    hermesVersionSha256: input.runtime.hermesVersionSha256,
    hermesImplementationSha256: input.runtime.hermesImplementationSha256,
    hermesDependencySha256: input.runtime.hermesDependencySha256,
    hermesProfileContextSha256: input.runtime.hermesProfileContextSha256,
    hermesProjectContextSha256: input.runtime.hermesProjectContextSha256,
    hermesRuntimeIdentitySha256: input.runtime.hermesRuntimeIdentitySha256,
    contextBudgetUpperBoundTokens: traceEvidence.contextBudgetUpperBoundTokens,
    contextInputProxyTokens: traceEvidence.contextInputProxyTokens,
    contextLimit: input.runtime.contextLimit,
    contextOutputReserveTokens: traceEvidence.contextOutputReserveTokens,
    cumulativeCacheReadTokens: artifacts.usage.cache_read_tokens,
    cacheWriteTokens: artifacts.usage.cache_write_tokens,
    compaction: false,
    compression: false,
    truncation: false,
    expectedReadCount: input.expectedReadPaths.length,
    exactReadCount: exactReadback.exactReadCount,
    exactReadSha256s: exactReadback.exactReadSha256s,
    candidateOutputSha256: sha256(artifacts.candidateOutputBytes),
    resultSha256: sha256(artifacts.resultBytes),
    usageSha256: sha256(artifacts.usageBytes),
    traceSha256: sha256(artifacts.traceBytes),
    inputTokens: artifacts.usage.input_tokens,
    outputTokens: artifacts.usage.output_tokens,
    reasoningTokens: artifacts.usage.reasoning_tokens,
    totalTokens: artifacts.usage.total_tokens,
    apiCalls: artifacts.usage.api_calls,
    completedAt: new Date(traceEvidence.endedAt * 1000).toISOString(),
    completed: true,
  };
  validateHermesStructuredReceipt(receipt);
  return receipt;
}

function expectedReceiptFields(input, receipt) {
  return {
    role: input.role,
    profileId: input.profileId,
    runtimeAttestation: input.runtime.runtimeAttestation,
    promptSha256: sha256(Buffer.from(input.prompt)),
    inputDigest: input.inputDigest,
    inputSha256: input.inputEvidence.inputSha256,
    profileConfigSha256: input.runtime.profileConfigSha256,
    soulSha256: input.runtime.soulSha256,
    contentNeutralContractId: input.runtime.contentNeutralContractId,
    contentNeutralContractSha256: input.runtime.contentNeutralContractSha256,
    contentNeutralSoulSectionSha256: input.runtime.contentNeutralSoulSectionSha256,
    contextLimitEntrySha256: input.runtime.contextLimitEntrySha256,
    hermesExecutableSha256: input.runtime.hermesExecutableSha256,
    hermesDelegatedExecutableSha256: input.runtime.hermesDelegatedExecutableSha256,
    hermesVersionSha256: input.runtime.hermesVersionSha256,
    hermesImplementationSha256: input.runtime.hermesImplementationSha256,
    hermesDependencySha256: input.runtime.hermesDependencySha256,
    hermesProfileContextSha256: input.runtime.hermesProfileContextSha256,
    hermesProjectContextSha256: input.runtime.hermesProjectContextSha256,
    hermesRuntimeIdentitySha256: input.runtime.hermesRuntimeIdentitySha256,
    contextLimit: input.runtime.contextLimit,
    expectedReadCount: input.expectedReadPaths.length,
    ...receipt,
  };
}

async function finalizeAttempt(input, attemptDir, options = {}) {
  const artifacts = await readAttemptArtifacts(input.runRoot, attemptDir);
  const inputAttestation = validateAttemptInputAttestation(
    input,
    attemptDir,
    artifacts.inputAttestationBytes,
  );
  const derivedReceipt = await buildValidatedReceipt(input, artifacts);
  let receipt = derivedReceipt;
  let receiptBytes = jsonBytes(receipt);
  const receiptInfo = await lstatOrNull(artifacts.paths.receiptPath);
  const completionInfo = await lstatOrNull(artifacts.paths.completionPath);
  if (receiptInfo) {
    await assertRealRunPath(input.runRoot, artifacts.paths.receiptPath, "Hermes structured host receipt", {
      requireExisting: true,
      targetType: "file",
    });
    receiptBytes = await readFile(artifacts.paths.receiptPath);
    receipt = JSON.parse(receiptBytes.toString("utf8"));
    validateHermesStructuredReceipt(receipt, expectedReceiptFields(input, derivedReceipt));
    if (sha256(receiptBytes) !== sha256(jsonBytes(receipt))) {
      throw new Error("Hermes structured host receipt is not canonical JSON.");
    }
  } else if (options.requireCompletion === true) {
    throw new Error("Hermes structured host receipt is missing.");
  } else if (completionInfo) {
    throw new Error("Hermes attempt completion exists without its host receipt; immutable recovery is forbidden.");
  }
  const completion = {
    schemaVersion: ATTEMPT_COMPLETION_SCHEMA,
    role: input.role,
    attemptId: basename(attemptDir),
    runId: receipt.runId,
    hostReceiptSha256: sha256(receiptBytes),
    completed: true,
  };
  const completionBytes = jsonBytes(completion);
  if (completionInfo) {
    await assertRealRunPath(input.runRoot, artifacts.paths.completionPath, "Hermes attempt completion marker", {
      requireExisting: true,
      targetType: "file",
    });
    const storedBytes = await readFile(artifacts.paths.completionPath);
    const stored = JSON.parse(storedBytes.toString("utf8"));
    if (!isDeepStrictEqual(stored, completion) || sha256(storedBytes) !== sha256(completionBytes)) {
      throw new Error(`Hermes attempt completion marker drifted: ${basename(attemptDir)}`);
    }
  } else if (options.requireCompletion === true) {
    throw new Error("Hermes attempt completion marker is missing.");
  }

  // Validate every pre-existing seal before filling either missing seal. This
  // keeps an invalid historical attempt byte-identical during recovery.
  if (!receiptInfo) {
    await atomicCreateRunFile(
      input.runRoot,
      artifacts.paths.receiptPath,
      receiptBytes,
      "Hermes structured host receipt",
    );
  }
  if (!completionInfo) {
    await atomicCreateRunFile(
      input.runRoot,
      artifacts.paths.completionPath,
      completionBytes,
      "Hermes attempt completion marker",
    );
  }
  validateHermesStructuredAttemptEvidenceFileNames(await readdir(attemptDir));
  return {
    attemptDir,
    attempt: relative(input.runRoot, attemptDir),
    artifacts,
    receipt,
    receiptBytes,
    completion,
    completionBytes,
    inputAttestation,
  };
}

function completedPointer(input, finalized) {
  return {
    schemaVersion: COMPLETED_POINTER_SCHEMA,
    role: input.role,
    attempt: finalized.attempt,
    attemptCompletionSha256: sha256(finalized.completionBytes),
    hostReceiptSha256: sha256(finalized.receiptBytes),
  };
}

async function writeCompletedPointer(input, finalized) {
  const bytes = jsonBytes(completedPointer(input, finalized));
  const info = await lstatOrNull(input.completedPath);
  if (info) {
    await assertRealRunPath(input.runRoot, input.completedPath, "Hermes structured completed pointer", {
      requireExisting: true,
      targetType: "file",
    });
    const existing = await readFile(input.completedPath);
    if (existing.compare(bytes) !== 0) throw new Error("Hermes structured completed pointer appeared concurrently with different bytes.");
    return;
  }
  await atomicCreateRunFile(input.runRoot, input.completedPath, bytes, "Hermes structured completed pointer");
}

async function validateCompletedPointer(input) {
  await assertRealRunPath(input.runRoot, input.completedPath, "Hermes structured completed pointer", {
    requireExisting: true,
    targetType: "file",
  });
  const pointerBytes = await readFile(input.completedPath);
  const pointer = JSON.parse(pointerBytes.toString("utf8"));
  if (
    pointer?.schemaVersion !== COMPLETED_POINTER_SCHEMA
    || pointer.role !== input.role
    || typeof pointer.attempt !== "string"
    || !SHA256_PATTERN.test(pointer.attemptCompletionSha256 ?? "")
    || !SHA256_PATTERN.test(pointer.hostReceiptSha256 ?? "")
  ) throw new Error("Hermes structured completed pointer is invalid.");
  const attemptDir = resolve(input.runRoot, pointer.attempt);
  const attemptsRoot = resolve(input.runRoot, "attempts");
  if (!attemptDir.startsWith(`${attemptsRoot}${sep}`) || dirname(attemptDir) !== attemptsRoot) {
    throw new Error("Hermes structured completed pointer escapes its attempts directory.");
  }
  await assertRealRunPath(input.runRoot, attemptDir, "Hermes completed attempt directory", {
    requireExisting: true,
    targetType: "directory",
  });
  const finalized = await finalizeAttempt(input, attemptDir, { requireCompletion: true });
  const expected = completedPointer(input, finalized);
  if (!isDeepStrictEqual(pointer, expected) || sha256(pointerBytes) !== sha256(jsonBytes(pointer))) {
    throw new Error("Hermes structured completed pointer drifted.");
  }
  return finalized;
}

async function recoverCompletedAttempt(input) {
  if (!(await exists(input.attemptsRoot))) return null;
  await assertRealRunPath(input.runRoot, input.attemptsRoot, "Hermes attempts directory", {
    requireExisting: true,
    targetType: "directory",
  });
  const attempts = (await readdir(input.attemptsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
  for (const attemptName of attempts) {
    const attemptDir = join(input.attemptsRoot, attemptName);
    const paths = attemptPaths(attemptDir);
    const ready = await Promise.all([
      paths.candidateOutputPath,
      paths.inputAttestationPath,
      paths.usagePath,
      paths.resultPath,
      paths.tracePath,
    ].map(exists));
    if (!ready.every(Boolean)) continue;
    try {
      const finalized = await finalizeAttempt(input, attemptDir);
      await writeCompletedPointer(input, finalized);
      return finalized;
    } catch (error) {
      await input.progress({ event: "attempt-invalid", attempt: relative(input.runRoot, attemptDir), error: error.message });
      // Immutable invalid and incomplete attempts remain available for audit.
    }
  }
  return null;
}

function freshAttemptName(inputAttestationSha256) {
  assertSha256(inputAttestationSha256, "Hermes attempt input attestation");
  return `attempt-${new Date().toISOString().replace(/[-:.TZ]/gu, "")}-${randomBytes(4).toString("hex")}-${inputAttestationSha256}`;
}

function publicResult(finalized, status) {
  return {
    status,
    reused: status !== "completed",
    recovered: status === "recovered",
    attempt: finalized.attempt,
    attemptDir: finalized.attemptDir,
    receipt: finalized.receipt,
    result: finalized.artifacts.result,
    usage: finalized.artifacts.usage,
    trace: finalized.artifacts.trace,
  };
}

function inodeIdentity(info) {
  return { dev: String(info.dev), ino: String(info.ino) };
}

function sameInodeIdentity(left, right) {
  return left?.dev === right?.dev && left?.ino === right?.ino;
}

async function verifyStructuredRunLockOwnership(input, lock) {
  try {
    await assertRealRunPath(input.runRoot, lock.lockPath, "Hermes structured run lock", {
      requireExisting: true,
      targetType: "directory",
    });
    await assertRealRunPath(input.runRoot, lock.ownerPath, "Hermes structured run lock owner", {
      requireExisting: true,
      targetType: "file",
    });
    const [lockInfoBefore, ownerInfoBefore, ownerBytes] = await Promise.all([
      lstat(lock.lockPath),
      lstat(lock.ownerPath),
      readFile(lock.ownerPath),
    ]);
    const [lockInfoAfter, ownerInfoAfter] = await Promise.all([
      lstat(lock.lockPath),
      lstat(lock.ownerPath),
    ]);
    if (
      !lockInfoBefore.isDirectory()
      || lockInfoBefore.isSymbolicLink()
      || !ownerInfoBefore.isFile()
      || ownerInfoBefore.isSymbolicLink()
      || !sameInodeIdentity(inodeIdentity(lockInfoBefore), lock.lockIdentity)
      || !sameInodeIdentity(inodeIdentity(lockInfoAfter), lock.lockIdentity)
      || !sameInodeIdentity(inodeIdentity(ownerInfoBefore), lock.ownerIdentity)
      || !sameInodeIdentity(inodeIdentity(ownerInfoAfter), lock.ownerIdentity)
      || ownerBytes.compare(lock.ownerBytes) !== 0
      || sha256(ownerBytes) !== lock.ownerSha256
    ) {
      throw new Error("directory inode, owner inode, or owner bytes changed");
    }
  } catch (error) {
    throw new Error(`Hermes structured run lock ownership drifted; preserve it for manual audit: ${error.message}`);
  }
}

function releasedStructuredRunLockName(lock) {
  return [
    ".structured-run.lock.released",
    lock.lockId,
    lock.lockIdentity.dev,
    lock.lockIdentity.ino,
    lock.ownerIdentity.dev,
    lock.ownerIdentity.ino,
    lock.ownerSha256,
  ].join("-");
}

async function validateReleasedStructuredRunLocks(input) {
  const names = await readdir(input.runRoot);
  for (const name of names.filter((entry) => entry.startsWith(".structured-run.lock.release"))) {
    const match = /^\.structured-run\.lock\.released-([a-f0-9]{32})-(\d+)-(\d+)-(\d+)-(\d+)-([a-f0-9]{64})$/u.exec(name);
    if (!match) {
      throw new Error("Hermes structured run has an unverified lock release quarantine; manual audit is required.");
    }
    const [, lockId, lockDev, lockIno, ownerDev, ownerIno, ownerSha256] = match;
    const lockPath = join(input.runRoot, name);
    const ownerPath = join(lockPath, "owner.json");
    try {
      await assertRealRunPath(input.runRoot, lockPath, "Hermes released structured run lock", {
        requireExisting: true,
        targetType: "directory",
      });
      await assertRealRunPath(input.runRoot, ownerPath, "Hermes released structured run lock owner", {
        requireExisting: true,
        targetType: "file",
      });
      const [lockBefore, ownerBefore, ownerBytes] = await Promise.all([
        lstat(lockPath),
        lstat(ownerPath),
        readFile(ownerPath),
      ]);
      const [lockAfter, ownerAfter] = await Promise.all([lstat(lockPath), lstat(ownerPath)]);
      const owner = JSON.parse(ownerBytes.toString("utf8"));
      if (
        !sameInodeIdentity(inodeIdentity(lockBefore), { dev: lockDev, ino: lockIno })
        || !sameInodeIdentity(inodeIdentity(lockAfter), { dev: lockDev, ino: lockIno })
        || !sameInodeIdentity(inodeIdentity(ownerBefore), { dev: ownerDev, ino: ownerIno })
        || !sameInodeIdentity(inodeIdentity(ownerAfter), { dev: ownerDev, ino: ownerIno })
        || sha256(ownerBytes) !== ownerSha256
        || owner?.schemaVersion !== "private-hermes-structured-run-lock-owner/v1"
        || owner.lockId !== lockId
        || !Number.isSafeInteger(owner.pid)
        || owner.pid < 1
        || typeof owner.role !== "string"
        || owner.role.length < 1
        || !SHA256_PATTERN.test(owner.inputDigest ?? "")
      ) throw new Error("released lock identity or owner bytes changed");
    } catch (error) {
      throw new Error(`Hermes released structured run lock drifted; manual audit is required: ${error.message}`);
    }
  }
}

async function acquireStructuredRunLock(input) {
  const lockPath = join(input.runRoot, ".structured-run.lock");
  await validateReleasedStructuredRunLocks(input);
  await assertRealRunPath(input.runRoot, lockPath, "Hermes structured run lock");
  try {
    await mkdir(lockPath);
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error("Hermes structured run lock exists; concurrent or stale execution requires audit.");
    }
    throw error;
  }
  await assertRealRunPath(input.runRoot, lockPath, "Hermes structured run lock", {
    requireExisting: true,
    targetType: "directory",
  });
  const lockInfo = await lstat(lockPath);
  const lockIdentity = inodeIdentity(lockInfo);
  const ownerPath = join(lockPath, "owner.json");
  const ownerBytes = jsonBytes({
    schemaVersion: "private-hermes-structured-run-lock-owner/v1",
    lockId: randomBytes(16).toString("hex"),
    pid: process.pid,
    role: input.role,
    inputDigest: input.inputDigest,
  });
  try {
    await atomicCreateRunFile(input.runRoot, ownerPath, ownerBytes, "Hermes structured run lock owner");
  } catch (error) {
    // Preserve an incomplete lock for manual audit. Deleting by pathname after
    // ownership establishment failed could remove a concurrent replacement.
    throw error;
  }
  const [lockInfoAfterOwner, ownerInfo] = await Promise.all([lstat(lockPath), lstat(ownerPath)]);
  if (
    !lockInfoAfterOwner.isDirectory()
    || lockInfoAfterOwner.isSymbolicLink()
    || !sameInodeIdentity(inodeIdentity(lockInfoAfterOwner), lockIdentity)
    || !ownerInfo.isFile()
    || ownerInfo.isSymbolicLink()
  ) {
    throw new Error("Hermes structured run lock ownership drifted during acquisition; preserve it for manual audit.");
  }
  const lockId = JSON.parse(ownerBytes.toString("utf8")).lockId;
  return {
    lockPath,
    lockId,
    lockIdentity,
    ownerPath,
    ownerIdentity: inodeIdentity(ownerInfo),
    ownerBytes,
    ownerSha256: sha256(ownerBytes),
  };
}

async function releaseStructuredRunLock(input, lock) {
  await verifyStructuredRunLockOwnership(input, lock);
  const releasePath = join(input.runRoot, releasedStructuredRunLockName(lock));
  await assertRealRunPath(input.runRoot, releasePath, "Hermes structured run lock release quarantine");
  if (await lstatOrNull(releasePath)) {
    throw new Error("Hermes structured run lock release quarantine already exists; preserve it for manual audit.");
  }
  try {
    await rename(lock.lockPath, releasePath);
  } catch (error) {
    throw new Error(`Hermes structured run lock could not enter release quarantine; preserve it for manual audit: ${error.message}`);
  }
  const quarantined = {
    ...lock,
    lockPath: releasePath,
    ownerPath: join(releasePath, "owner.json"),
  };
  await verifyStructuredRunLockOwnership(input, quarantined);
  // The verified quarantine is an immutable tombstone. Never unlink an owner
  // pathname after a separate check: a concurrent inode replacement must be
  // preserved, not deleted. Future acquisitions revalidate this tombstone.
}

export async function runHermesStructuredAttempt({
  role,
  runRoot,
  profileHome,
  profileId,
  prompt,
  expectedReadPaths,
  inputDigest,
  expectedPluginPlanningEvidence,
  expectedAuthAdapterPlanningEvidence,
  outputReserveTokens,
  validateResult,
  progress = () => {},
  projectCwd = process.cwd(),
}) {
  if (typeof role !== "string" || role.trim().length < 1) throw new Error("Hermes structured run role is required.");
  if (typeof runRoot !== "string" || runRoot.length < 1) throw new Error("Hermes structured run root is required.");
  if (typeof profileHome !== "string" || profileHome.length < 1) throw new Error("Hermes profile home is required.");
  if (typeof profileId !== "string" || profileId.length < 1) throw new Error("Hermes profile ID is required.");
  if (typeof prompt !== "string" || prompt.trim().length < 1) throw new Error("Hermes structured prompt is required.");
  assertNonNegativeInteger(outputReserveTokens, "Hermes structured output reserve tokens");
  if (outputReserveTokens < 1) throw new Error("Hermes structured output reserve tokens must be positive.");
  if (typeof validateResult !== "function") throw new Error("Hermes structured result validator is required.");
  if (typeof progress !== "function") throw new Error("Hermes structured progress callback must be a function.");
  const sealedPluginPlanningEvidence = expectedPluginPlanningEvidence === undefined
    ? undefined
    : JSON.parse(jsonBytes(validateHermesExactInputPluginPlanningEvidence(expectedPluginPlanningEvidence)).toString("utf8"));
  if (expectedAuthAdapterPlanningEvidence === undefined) {
    throw new Error("Hermes auth-store adapter planning evidence is required.");
  }
  const sealedAuthAdapterPlanningEvidence = JSON.parse(
    jsonBytes(validateHermesAuthAdapterPlanningEvidence(expectedAuthAdapterPlanningEvidence)).toString("utf8"),
  );
  const absoluteRunRoot = resolve(runRoot);
  const absoluteProfileHome = resolve(profileHome);
  const absoluteProjectCwd = resolve(projectCwd);
  const absoluteExpectedReadPaths = expectedReadPaths.map((path) => resolve(path));
  const executionEnvironment = buildHermesExecutionEnvironment({
    profileHome: absoluteProfileHome,
    projectCwd: absoluteProjectCwd,
  });
  await ensureRealAbsoluteDirectory(absoluteRunRoot, "Hermes structured run root");
  await assertRealRunPath(absoluteRunRoot, absoluteRunRoot, "Hermes structured run root", {
    requireExisting: true,
    targetType: "directory",
  });
  const input = {
    role,
    runRoot: absoluteRunRoot,
    attemptsRoot: join(absoluteRunRoot, "attempts"),
    completedPath: join(absoluteRunRoot, "completed.json"),
    profileHome: absoluteProfileHome,
    projectCwd: absoluteProjectCwd,
    profileId,
    prompt,
    expectedReadPaths: absoluteExpectedReadPaths,
    inputDigest,
    expectedPluginPlanningEvidence: sealedPluginPlanningEvidence,
    expectedAuthAdapterPlanningEvidence: sealedAuthAdapterPlanningEvidence,
    outputReserveTokens,
    validateResult,
    progress: async (event) => progress(event),
    executionEnvironment,
    runtime: null,
    inputEvidence: null,
    authStoreBoundary: null,
    readCapability: null,
  };
  const lock = await acquireStructuredRunLock(input);
  try {
    [input.runtime, input.inputEvidence, input.authStoreBoundary] = await Promise.all([
      loadHermesRuntimeEvidence(absoluteProfileHome, profileId, {
        projectCwd: absoluteProjectCwd,
        executionEnvironment,
      }),
      loadHermesExactInputEvidence(absoluteExpectedReadPaths, inputDigest),
      loadHermesAuthStoreBoundary(absoluteProfileHome, profileId),
    ]);
    input.readCapability = await prepareHermesExactInputReadCapability({
      runRoot: input.runRoot,
      profileId: input.profileId,
      runtime: input.runtime,
      inputEvidence: input.inputEvidence,
      expectedPluginPlanningEvidence: input.expectedPluginPlanningEvidence,
      expectedAuthAdapterPlanningEvidence: input.expectedAuthAdapterPlanningEvidence,
    });
    const preflight = planHermesStructuredContextBudget({
      profilePromptContextBytes: input.runtime.profilePromptContextBytes,
      projectPromptContextBytes: input.runtime.projectPromptContextBytes,
      pluginContextBytes: input.readCapability.pluginFiles.reduce((total, file) => total + file.sizeBytes, 0),
      prompt,
      readTranscriptProxyBytes: input.inputEvidence.readTranscriptProxyBytes,
      outputReserveTokens,
      contextLimit: input.runtime.contextLimit,
    });
    if (!preflight.fits) {
      throw new Error(`Hermes structured preflight context boundary failed: ${preflight.preflightBudgetTokens} >= ${preflight.contextLimit}`);
    }
    if (await exists(input.completedPath)) {
      const finalized = await validateCompletedPointer(input);
      await input.progress({ event: "attempt-reused", attempt: finalized.attempt, runId: finalized.receipt.runId });
      await revalidateStructuredRunInputs(input, "Hermes reuse pre-return");
      return publicResult(finalized, "reused");
    }
    const recovered = await recoverCompletedAttempt(input);
    if (recovered) {
      await input.progress({ event: "attempt-recovered", attempt: recovered.attempt, runId: recovered.receipt.runId });
      await revalidateStructuredRunInputs(input, "Hermes recovery pre-return");
      return publicResult(recovered, "recovered");
    }
    const attemptsInfo = await lstatOrNull(input.attemptsRoot);
    if (!attemptsInfo) await mkdir(input.attemptsRoot);
    await assertRealRunPath(input.runRoot, input.attemptsRoot, "Hermes attempts directory", {
      requireExisting: true,
      targetType: "directory",
    });
    const inputAttestationBytes = jsonBytes(buildAttemptInputAttestation(input));
    const attemptDir = join(input.attemptsRoot, freshAttemptName(sha256(inputAttestationBytes)));
    await mkdir(attemptDir);
    await assertRealRunPath(input.runRoot, attemptDir, "Hermes fresh attempt directory", {
      requireExisting: true,
      targetType: "directory",
    });
    const paths = attemptPaths(attemptDir);
    await atomicCreateRunFile(
      input.runRoot,
      paths.inputAttestationPath,
      inputAttestationBytes,
      "Hermes attempt input attestation",
    );
    await atomicCreateRunFile(
      input.runRoot,
      paths.readCapabilityPath,
      input.readCapability.bytes,
      "Hermes exact-input read capability",
    );
    const hermes = await resolveHermesDelegatedExecutionCommand(input.runtime);
    const immediatelyBeforeExecution = await loadHermesRuntimeEvidence(input.profileHome, input.profileId, {
      projectCwd: input.projectCwd,
      executionEnvironment: input.executionEnvironment,
    });
    assertHermesRuntimeEvidenceEqual(input.runtime, immediatelyBeforeExecution, "Hermes pre-execution runtime");
    const immediatelyBeforeCapability = await prepareHermesExactInputReadCapability({
      runRoot: input.runRoot,
      profileId: input.profileId,
      runtime: input.runtime,
      inputEvidence: input.inputEvidence,
      expectedPluginPlanningEvidence: input.expectedPluginPlanningEvidence,
      expectedAuthAdapterPlanningEvidence: input.expectedAuthAdapterPlanningEvidence,
    });
    assertReadCapabilityEqual(input.readCapability, immediatelyBeforeCapability, "Hermes pre-execution read capability");
    let capsule;
    let executionError;
    try {
      capsule = await createHermesExactInputExecutionCapsule({
        runRoot: input.runRoot,
        profileId: input.profileId,
        runtime: input.runtime,
        readCapability: input.readCapability,
        sourceAuthStoreBoundary: input.authStoreBoundary,
      });
      await input.progress({ event: "attempt-start", attempt: relative(input.runRoot, attemptDir), role });
      await assertHermesExactInputExecutionCapsuleStable(
        capsule,
        input.runtime,
        input.readCapability,
        "Hermes pre-execution capsule",
      );
      const executed = await runCommand(hermes, [
        "--oneshot",
        prompt,
        "--usage-file",
        paths.usagePath,
        "--pass-session-id",
        "--toolsets",
        HERMES_READ_ONLY_TOOLSET,
        "--model",
        HERMES_STRUCTURED_MODEL,
        "--provider",
        HERMES_STRUCTURED_PROVIDER,
      ], {
        cwd: capsule.workspace,
        env: capsule.executionEnvironment.env,
      });
      const immediatelyAfterExecution = await loadHermesRuntimeEvidence(input.profileHome, input.profileId, {
        projectCwd: input.projectCwd,
        executionEnvironment: input.executionEnvironment,
      });
      assertHermesRuntimeEvidenceEqual(input.runtime, immediatelyAfterExecution, "Hermes post-execution runtime");
      const immediatelyAfterCapability = await prepareHermesExactInputReadCapability({
        runRoot: input.runRoot,
        profileId: input.profileId,
        runtime: input.runtime,
        inputEvidence: input.inputEvidence,
        expectedPluginPlanningEvidence: input.expectedPluginPlanningEvidence,
        expectedAuthAdapterPlanningEvidence: input.expectedAuthAdapterPlanningEvidence,
      });
      assertReadCapabilityEqual(input.readCapability, immediatelyAfterCapability, "Hermes post-execution read capability");
      await assertHermesExactInputExecutionCapsuleStable(
        capsule,
        input.runtime,
        input.readCapability,
        "Hermes post-execution capsule",
      );
      const candidateOutputBytes = Buffer.from(executed.stdout);
      await atomicCreateRunFile(input.runRoot, paths.candidateOutputPath, candidateOutputBytes, "Hermes candidate output");
      const result = parseStructuredJson(executed.stdout);
      await validateResultCallback(validateResult, result);
      await atomicCreateRunFile(input.runRoot, paths.resultPath, jsonBytes(result), "Hermes structured result");
      const usage = JSON.parse(await readFile(paths.usagePath, "utf8"));
      if (typeof usage.session_id !== "string" || usage.session_id.length < 1) {
        throw new Error("Hermes structured usage has no session ID.");
      }
      const exportHermes = await resolveHermesDelegatedExecutionCommand(input.runtime);
      await runCommand(exportHermes, [
        "sessions",
        "export",
        paths.tracePath,
        "--format",
        "jsonl",
        "--session-id",
        usage.session_id,
        "--yes",
      ], {
        cwd: capsule.workspace,
        env: capsule.executionEnvironment.env,
      });
      const afterTraceExport = await loadHermesRuntimeEvidence(input.profileHome, input.profileId, {
        projectCwd: input.projectCwd,
        executionEnvironment: input.executionEnvironment,
      });
      assertHermesRuntimeEvidenceEqual(input.runtime, afterTraceExport, "Hermes post-export runtime");
      const afterCapabilityTraceExport = await prepareHermesExactInputReadCapability({
        runRoot: input.runRoot,
        profileId: input.profileId,
        runtime: input.runtime,
        inputEvidence: input.inputEvidence,
        expectedPluginPlanningEvidence: input.expectedPluginPlanningEvidence,
        expectedAuthAdapterPlanningEvidence: input.expectedAuthAdapterPlanningEvidence,
      });
      assertReadCapabilityEqual(input.readCapability, afterCapabilityTraceExport, "Hermes post-export read capability");
      await assertHermesExactInputExecutionCapsuleStable(
        capsule,
        input.runtime,
        input.readCapability,
        "Hermes post-export capsule",
      );
    } catch (error) {
      executionError = error;
    }
    let cleanupError;
    try {
      await disposeHermesExactInputExecutionCapsule(capsule);
    } catch (error) {
      cleanupError = error;
    }
    if (executionError && cleanupError) {
      throw new AggregateError([executionError, cleanupError], "Hermes execution and ephemeral cleanup both failed.");
    }
    if (executionError) throw executionError;
    if (cleanupError) throw cleanupError;
    const finalized = await finalizeAttempt(input, attemptDir);
    await writeCompletedPointer(input, finalized);
    await input.progress({ event: "attempt-complete", attempt: finalized.attempt, runId: finalized.receipt.runId });
    await revalidateStructuredRunInputs(input, "Hermes completion pre-return");
    return publicResult(finalized, "completed");
  } finally {
    await releaseStructuredRunLock(input, lock);
  }
}
