#!/usr/bin/env node

import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inkosRoot = resolve(repoRoot, "../inkos");
const coreRoot = join(repoRoot, "inkos_handoffs/chaebol-reference-core");
const coreModulePath = join(inkosRoot, "packages/core/dist/index.js");
const SOURCE_PREFIX = "firefly-reference-core:";
const LEGACY_SOURCE_MARKER = "inkos_handoffs/chaebol-reference-core/materials/";
const EXCERPT_CHARS = 1600;

export async function listInstalledCoreAssets(projectRoot = inkosRoot) {
  const materialsDir = join(projectRoot, ".inkos/materials");
  let names = [];
  try {
    names = await readdir(materialsDir);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const assets = [];
  for (const name of names.filter((value) => value.endsWith(".json"))) {
    try {
      const asset = JSON.parse(await readFile(join(materialsDir, name), "utf8"));
      if (isCoreAsset(asset)) {
        assets.push(asset);
      }
    } catch {
      // 다른 로컬 자료의 손상은 설치 작업에서 수정하지 않는다.
    }
  }
  return assets;
}

export async function installChaebolReferenceCore(projectRoot = inkosRoot) {
  const manifest = JSON.parse(await readFile(join(coreRoot, "manifest.json"), "utf8"));
  const existing = await listInstalledCoreAssets(projectRoot);
  const byCardId = new Map(existing.map((asset) => [cardIdFromAsset(asset), asset]).filter(([cardId]) => cardId));
  const { ingestMaterial } = await import(pathToFileURL(coreModulePath).href);
  const results = [];
  for (const card of manifest.cards) {
    const absoluteSource = join(coreRoot, card.path);
    const content = normalizeText(await readFile(absoluteSource, "utf8"));
    const source = `${SOURCE_PREFIX}${card.path}`;
    const title = `재벌물 Reference Core ${card.id} · ${card.title}`;
    const installed = byCardId.get(card.id);
    if (installed) {
      const action = await refreshInstalledAsset(projectRoot, installed, { title, source, content });
      results.push({ cardId: card.id, materialId: installed.id, source, action });
      continue;
    }
    const asset = await ingestMaterial(projectRoot, {
      sourceKind: "text",
      content,
      sourceLabel: source,
      filename: basename(card.path),
      title,
      purpose: "reference",
    });
    results.push({ cardId: card.id, materialId: asset.id, source, action: "installed" });
  }
  return results;
}

function isCoreAsset(asset) {
  if (!asset || typeof asset !== "object") return false;
  const source = typeof asset.source === "string" ? asset.source : "";
  const title = typeof asset.title === "string" ? asset.title : "";
  return source.startsWith(SOURCE_PREFIX)
    || source.includes(LEGACY_SOURCE_MARKER)
    || /재벌물 Reference Core CHB-CORE-0[1-6]/u.test(title);
}

function cardIdFromAsset(asset) {
  const values = [asset?.title, asset?.source].filter((value) => typeof value === "string");
  for (const value of values) {
    const match = /CHB-CORE-0[1-6]/u.exec(value);
    if (match) return match[0];
  }
  return undefined;
}

async function refreshInstalledAsset(projectRoot, installed, next) {
  const id = installed?.id;
  if (typeof id !== "string" || !id || id.includes("..") || /[/\\\0]/u.test(id)) {
    throw new Error(`잘못된 기존 material ID: ${JSON.stringify(id)}`);
  }
  const markdownPath = `.inkos/materials/${id}.md`;
  const manifestPath = `.inkos/materials/${id}.json`;
  const asset = {
    id,
    title: next.title,
    kind: "text",
    purpose: "reference",
    source: next.source,
    mimeType: "text/markdown",
    markdownPath,
    manifestPath,
    charCount: next.content.length,
    excerpt: next.content.slice(0, EXCERPT_CHARS),
  };
  const markdown = renderMaterialMarkdown(asset, next.content);
  const currentMarkdown = await readFile(join(projectRoot, markdownPath), "utf8").catch(() => "");
  const currentManifest = `${JSON.stringify(installed, null, 2)}\n`;
  const nextManifest = `${JSON.stringify(asset, null, 2)}\n`;
  if (currentMarkdown === markdown && currentManifest === nextManifest) return "reused";
  await writeFile(join(projectRoot, markdownPath), markdown, "utf8");
  await writeFile(join(projectRoot, manifestPath), nextManifest, "utf8");
  return "refreshed";
}

function renderMaterialMarkdown(asset, content) {
  return [
    `# ${asset.title}`,
    "",
    "## Metadata",
    `- kind: ${asset.kind}`,
    `- purpose: ${asset.purpose}`,
    `- source: ${asset.source}`,
    `- mime_type: ${asset.mimeType}`,
    `- char_count: ${asset.charCount}`,
    "",
    "## Extracted content",
    content,
    "",
  ].join("\n");
}

function normalizeText(value) {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function main() {
  const results = await installChaebolReferenceCore();
  console.log(JSON.stringify({
    coreId: "chaebol-reference-core-v1",
    installed: results.filter((item) => item.action === "installed").length,
    refreshed: results.filter((item) => item.action === "refreshed").length,
    reused: results.filter((item) => item.action === "reused").length,
    bindingsChanged: 0,
    materials: results,
  }, null, 2));
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
