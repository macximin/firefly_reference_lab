#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workDir = dirname(fileURLToPath(import.meta.url));
const sourcePath = "/Users/a2501/Desktop/inkos/edge_repos/inkos_reverse_lab/private_sources/korean_webnovel_corpus/흑곰작가/리턴 에이스_흑곰작가_합본.txt";
const reviewPaths = [
  "manual_review_001_025.md",
  "manual_review_026_103.md",
  "manual_review_104_207.md",
  "manual_review_208_310.md",
].map((name) => join(workDir, name));

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [header, ...data] = rows;
  return data.map((values) => Object.fromEntries(header.map((key, index) => [key, values[index]])));
}

function blocks(markdown) {
  const matches = [...markdown.matchAll(/^##\s+(\d+)화\s*$/gm)];
  return matches.map((match, index) => ({
    sequence: Number(match[1]),
    body: markdown.slice(match.index + match[0].length, matches[index + 1]?.index ?? markdown.length),
  }));
}

function fields(body) {
  return Object.fromEntries(body.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^-\s+([^:]+):\s*(.*?)\s*$/);
    return match ? [[match[1].trim(), match[2].trim()]] : [];
  }));
}

const reviews = new Map();
for (const path of reviewPaths) {
  for (const block of blocks(readFileSync(path, "utf8"))) reviews.set(block.sequence, fields(block.body));
}

const sourceLines = readFileSync(sourcePath, "utf8").split(/\r?\n/);
const markers = [];
for (let index = 0; index < sourceLines.length; index += 1) {
  const match = sourceLines[index].match(/^ⓚ리턴 에이스 (\d+)화\s*$/);
  if (match) markers.push({ sequence: Number(match[1]), markerIndex: index });
}
const sourceBySequence = new Map(markers.map((marker, index) => [marker.sequence, {
  startLine: marker.markerIndex + 1,
  endLine: (markers[index + 1]?.markerIndex ?? sourceLines.length) ,
  lines: sourceLines.slice(marker.markerIndex + 1, markers[index + 1]?.markerIndex ?? sourceLines.length)
    .map((line) => line.trim()).filter(Boolean),
}]));

const candidateChapterPath = join(workDir, "chapter_map.csv");
const authorityChapterPath = join(workDir, "manual_chapter_fact_authority.csv");
const rows = parseCsv(readFileSync(existsSync(candidateChapterPath) ? candidateChapterPath : authorityChapterPath, "utf8"));
const start = Number(process.argv[2] ?? 1);
const end = Number(process.argv[3] ?? start);
const firstCount = Number(process.argv[4] ?? 5);
const lastCount = Number(process.argv[5] ?? 14);

for (const row of rows.filter((item) => Number(item.sequence) >= start && Number(item.sequence) <= end)) {
  const sequence = Number(row.sequence);
  const review = reviews.get(sequence);
  const source = sourceBySequence.get(sequence);
  console.log(`\n===== ${sequence}화 · ${source.startLine}~${source.endLine} =====`);
  for (const key of [
    "reader_promise",
    "protagonist_goal",
    "action",
    "resistance_or_cost",
    "turn_or_reveal",
    "paid_reward",
    "state_change",
    "ending_hook",
    "opened_loops",
  ]) console.log(`[${key}] ${row[key]}`);
  for (const key of ["진입 장면", "보상 범위", "페이싱 근거", "종료 훅", "닫힌 루프", "열린 루프"]) {
    console.log(`[manual:${key}] ${review[key]}`);
  }
  console.log(`[source:first] ${source.lines.slice(0, firstCount).join(" / ")}`);
  console.log(`[source:last] ${source.lines.slice(-lastCount).join(" / ")}`);
}
