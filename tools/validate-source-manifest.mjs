#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const allowedRights = new Set([
  "owned",
  "licensed",
  "permission_granted",
  "public_domain",
]);

const manifestPath = new URL("../evidence/source_manifest.json", import.meta.url);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.works)) {
  throw new Error("Manifest must contain schemaVersion: 1 and a works array.");
}
if (manifest.collections !== undefined && !Array.isArray(manifest.collections)) {
  throw new Error("Manifest collections must be an array when present.");
}

const ids = new Set();
for (const [index, work] of manifest.works.entries()) {
  const label = `works[${index}]`;
  for (const field of ["id", "title", "ownerType", "rightsStatus", "accessedAt"]) {
    if (typeof work[field] !== "string" || work[field].trim() === "") {
      throw new Error(`${label}.${field} must be a non-empty string.`);
    }
  }
  if (ids.has(work.id)) throw new Error(`${label}.id duplicates ${work.id}.`);
  ids.add(work.id);
  if (!allowedRights.has(work.rightsStatus)) {
    throw new Error(`${label}.rightsStatus is not cleared for analysis: ${work.rightsStatus}.`);
  }
  if (!Number.isFinite(Date.parse(work.accessedAt))) {
    throw new Error(`${label}.accessedAt must be ISO-8601 compatible.`);
  }
  if (work.ownerType !== "self" && typeof work.sourceUrl !== "string") {
    throw new Error(`${label}.sourceUrl is required for third-party material.`);
  }
  if (work.sourceHash !== null && typeof work.sourceHash !== "string") {
    throw new Error(`${label}.sourceHash must be a string or null.`);
  }
}

for (const [index, collection] of (manifest.collections ?? []).entries()) {
  const label = `collections[${index}]`;
  for (const field of [
    "id",
    "title",
    "ownerType",
    "rightsStatus",
    "sourceLocator",
    "rightsEvidenceRef",
    "accessedAt",
    "scope",
  ]) {
    if (typeof collection[field] !== "string" || collection[field].trim() === "") {
      throw new Error(`${label}.${field} must be a non-empty string.`);
    }
  }
  if (!allowedRights.has(collection.rightsStatus)) {
    throw new Error(`${label}.rightsStatus is not cleared for analysis: ${collection.rightsStatus}.`);
  }
  if (!Number.isInteger(collection.itemCount) || collection.itemCount < 1) {
    throw new Error(`${label}.itemCount must be a positive integer.`);
  }
  if (!Number.isInteger(collection.totalBytes) || collection.totalBytes < 1) {
    throw new Error(`${label}.totalBytes must be a positive integer.`);
  }
  if (!Number.isFinite(Date.parse(collection.accessedAt))) {
    throw new Error(`${label}.accessedAt must be ISO-8601 compatible.`);
  }
}

console.log(
  `Source-manifest validation passed (${manifest.works.length} work(s), ${(manifest.collections ?? []).length} collection(s)).`,
);
