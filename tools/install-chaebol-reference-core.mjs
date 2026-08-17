#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inkosRoot = resolve(repoRoot, "../..");
const coreRoot = join(repoRoot, "inkos_handoffs/chaebol-reference-core");
const coreModulePath = join(inkosRoot, "packages/core/dist/index.js");

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
      if (typeof asset?.source === "string" && asset.source.includes("inkos_handoffs/chaebol-reference-core/materials/")) {
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
  const bySource = new Map(existing.map((asset) => [asset.source, asset]));
  const { ingestMaterial } = await import(pathToFileURL(coreModulePath).href);
  const results = [];
  for (const card of manifest.cards) {
    const absoluteSource = join(coreRoot, card.path);
    const source = relative(projectRoot, absoluteSource).replaceAll("\\", "/");
    const installed = bySource.get(source);
    if (installed) {
      results.push({ cardId: card.id, materialId: installed.id, source, action: "reused" });
      continue;
    }
    const asset = await ingestMaterial(projectRoot, {
      sourceKind: "file",
      filePath: source,
      filename: card.path.split("/").at(-1),
      title: `재벌물 Reference Core ${card.id} · ${card.title}`,
      purpose: "reference",
    });
    results.push({ cardId: card.id, materialId: asset.id, source, action: "installed" });
  }
  return results;
}

async function main() {
  const results = await installChaebolReferenceCore();
  console.log(JSON.stringify({
    coreId: "chaebol-reference-core-v1",
    installed: results.filter((item) => item.action === "installed").length,
    reused: results.filter((item) => item.action === "reused").length,
    bindingsChanged: 0,
    materials: results,
  }, null, 2));
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
