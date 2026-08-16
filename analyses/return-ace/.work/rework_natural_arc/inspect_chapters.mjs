#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workDir = dirname(fileURLToPath(import.meta.url));
const analysisDir = resolve(workDir, "../..");
const repoRoot = resolve(analysisDir, "../..");
const sourcePath = join(
  repoRoot,
  "private_sources/korean_webnovel_corpus/흑곰작가/리턴 에이스_흑곰작가_합본.txt",
);
const segmentPaths = [
  join(analysisDir, "segment_001_103.md"),
  join(analysisDir, "segment_104_207.md"),
  join(analysisDir, "segment_208_310.md"),
];

function headingBlocks(markdown) {
  const headings = [...markdown.matchAll(/^###\s+(\d+)화\s*$/gm)];
  return headings.map((heading, index) => ({
    sequence: Number(heading[1]),
    body: markdown.slice(
      heading.index + heading[0].length,
      headings[index + 1]?.index ?? markdown.length,
    ),
  }));
}

function fieldsFromBody(body) {
  const fields = {};
  for (const line of body.split(/\r?\n/u)) {
    const match = line.match(/^-\s+([^:]+):\s*(.*?)\s*$/u);
    if (match) fields[match[1].trim()] = match[2].trim();
  }
  return fields;
}

const segmentFields = new Map();
for (const path of segmentPaths) {
  const markdown = readFileSync(path, "utf8");
  for (const block of headingBlocks(markdown)) {
    segmentFields.set(block.sequence, fieldsFromBody(block.body));
  }
}

const sourceLines = readFileSync(sourcePath, "utf8").split(/\r?\n/u);
const markers = [];
for (let index = 0; index < sourceLines.length; index += 1) {
  const match = sourceLines[index].match(/^ⓚ리턴 에이스 (\d+)화\s*$/u);
  if (match) markers.push({ sequence: Number(match[1]), start: index });
}
const chapters = markers.map((marker, index) => ({
  ...marker,
  lines: sourceLines.slice(marker.start + 1, markers[index + 1]?.start ?? sourceLines.length),
}));

const start = Number(process.argv[2] ?? 1);
const end = Number(process.argv[3] ?? start);
const firstCount = Number(process.argv[4] ?? 8);
const lastCount = Number(process.argv[5] ?? 34);

for (const chapter of chapters.filter((item) => item.sequence >= start && item.sequence <= end)) {
  const fields = segmentFields.get(chapter.sequence) ?? {};
  const nonblank = chapter.lines.map((line) => line.trim()).filter(Boolean);
  console.log(`\n===== ${chapter.sequence}화 · 원문 ${chapter.start + 1}행 시작 · ${chapter.lines.length + 1}행 =====`);
  for (const key of [
    "진입",
    "약속",
    "목표",
    "행동",
    "저항/비용",
    "전환",
    "보상",
    "상태 변화",
    "종료 훅",
    "닫힌 루프",
    "열린 루프",
    "후보 Arc",
  ]) {
    console.log(`[${key}] ${fields[key] ?? "(없음)"}`);
  }
  console.log("[원문 첫 장면]");
  for (const line of nonblank.slice(0, firstCount)) console.log(line);
  console.log("[원문 마지막 장면]");
  for (const line of nonblank.slice(-lastCount)) console.log(line);
}
