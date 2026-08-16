#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../../..");
const analysisDir = resolve(repoRoot, "analyses/hyojong");
const sourcePath = resolve(
  repoRoot,
  "private_sources/korean_webnovel_corpus/강동호/효종_강동호_합본.txt",
);
const expectedHash = "f0b4459d33253c389d9bf6a9c6b648ec3b461eeb327e44822be719d4a179e334";
const expectedCount = 500;

const chapterHeader = [
  "sequence", "visible_label", "title", "start_line", "end_line", "entry_state",
  "reader_promise", "protagonist_goal", "action", "resistance_or_cost", "turn_or_reveal",
  "paid_reward", "state_change_axis", "state_change", "ending_hook", "closed_loops",
  "opened_loops", "arc_id", "confidence",
];
const pacingHeader = [
  "sequence", "visible_label", "arc_id", "arc_phase", "concrete_event", "tension_1_10",
  "reward_1_10", "hook_1_10", "information_weight", "action_weight", "relationship_weight",
  "emotion_weight", "material_or_status_weight", "pacing_note",
];
const arcHeader = [
  "arc_id", "arc_name", "start_sequence", "end_sequence", "start_label", "end_label",
  "episode_count", "main_characters", "main_locations", "concrete_premise", "central_question",
  "promise", "pressure_escalation", "mid_turn", "concrete_payoff", "relationship_change",
  "status_or_ability_change", "residual_cost", "next_arc_bridge", "boundary_signals", "confidence",
];
const requiredMarkdown = new Map([
  ["project_bible.md", 8_000],
  ["arc_atlas.md", 15_000],
  ["inkos_usage_and_gap_report.md", 6_000],
  ["free_improvements_report.md", 4_000],
  ["completion_receipt.md", 800],
]);

const errors = [];
const warnings = [];
const source = await readFile(sourcePath, "utf8");
const sourceHash = createHash("sha256").update(source).digest("hex");
if (sourceHash !== expectedHash) errors.push(`source hash ${sourceHash} != ${expectedHash}`);
const sourceLines = source.split(/\r?\n/u);
if (sourceLines.at(-1) === "") sourceLines.pop();
const sourceChapters = [];
for (let index = 0; index < sourceLines.length; index += 1) {
  if (!sourceLines[index].startsWith("ⓚ")) continue;
  const previous = sourceChapters.at(-1);
  if (previous) previous.endLine = index;
  const label = sourceLines[index];
  const number = Number(label.match(/(\d+)화\s*$/u)?.[1]);
  sourceChapters.push({ sequence: sourceChapters.length + 1, number, label, title: "", startLine: index + 1 });
}
if (sourceChapters.at(-1)) sourceChapters.at(-1).endLine = sourceLines.length;
for (const chapter of sourceChapters) {
  chapter.title = sourceLines
    .slice(chapter.startLine, chapter.endLine)
    .map((line) => line.trim())
    .find((line) => line.startsWith("* "))
    ?.slice(2)
    .trim() ?? "";
}
if (sourceChapters.length !== expectedCount) errors.push(`source markers ${sourceChapters.length} != ${expectedCount}`);
sourceChapters.forEach((chapter, index) => {
  if (chapter.number !== index + 1) errors.push(`source label number at sequence ${index + 1}: ${chapter.number}`);
});

const chapters = await loadCsv("chapter_map.csv", chapterHeader);
const pacing = await loadCsv("arc_pacing.csv", pacingHeader);
const arcs = await loadCsv("arc_map.csv", arcHeader);

checkSequences(chapters, "chapter_map.csv");
checkSequences(pacing, "arc_pacing.csv");
if (chapters.length !== expectedCount) errors.push(`chapter rows ${chapters.length} != ${expectedCount}`);
if (pacing.length !== expectedCount) errors.push(`pacing rows ${pacing.length} != ${expectedCount}`);

const chapterRequired = chapterHeader.filter((field) => field !== "title");
const pacingRequired = [...pacingHeader];
const arcRequired = [...arcHeader];
checkNonEmpty(chapters, chapterRequired, "chapter_map.csv");
checkNonEmpty(pacing, pacingRequired, "arc_pacing.csv");
checkNonEmpty(arcs, arcRequired, "arc_map.csv");

chapters.forEach((chapter, index) => {
  const expected = sourceChapters[index];
  if (!expected) return;
  if (chapter.visible_label !== expected.label) errors.push(`chapter ${index + 1}: visible label mismatch`);
  if (chapter.title !== expected.title) errors.push(`chapter ${index + 1}: title mismatch`);
  if (Number(chapter.start_line) !== expected.startLine) errors.push(`chapter ${index + 1}: start line mismatch`);
  if (Number(chapter.end_line) !== expected.endLine) errors.push(`chapter ${index + 1}: end line mismatch`);
});
pacing.forEach((row, index) => {
  if (row.visible_label !== sourceChapters[index]?.label) errors.push(`pacing ${index + 1}: visible label mismatch`);
  for (const field of ["tension_1_10", "reward_1_10", "hook_1_10"]) {
    const score = Number(row[field]);
    if (!Number.isInteger(score) || score < 1 || score > 10) errors.push(`pacing ${index + 1}.${field}: ${row[field]}`);
  }
  for (const field of ["information_weight", "action_weight", "relationship_weight", "emotion_weight", "material_or_status_weight"]) {
    if (!/^(low|medium|high)$/u.test(row[field])) errors.push(`pacing ${index + 1}.${field}: ${row[field]}`);
  }
});
for (const field of ["tension_1_10", "reward_1_10", "hook_1_10"]) {
  const distinct = new Set(pacing.map((row) => row[field]));
  if (distinct.size < 4) errors.push(`${field}: only ${distinct.size} distinct scores`);
}

let expectedStart = 1;
const arcForSequence = new Map();
const arcIds = new Set();
for (const arc of arcs) {
  const start = Number(arc.start_sequence);
  const end = Number(arc.end_sequence);
  if (arcIds.has(arc.arc_id)) errors.push(`duplicate arc id ${arc.arc_id}`);
  arcIds.add(arc.arc_id);
  if (start !== expectedStart) errors.push(`${arc.arc_id}: starts ${start}, expected ${expectedStart}`);
  if (!Number.isInteger(end) || end < start) errors.push(`${arc.arc_id}: invalid end ${arc.end_sequence}`);
  if (Number(arc.episode_count) !== end - start + 1) errors.push(`${arc.arc_id}: episode count mismatch`);
  if (arc.start_label !== sourceChapters[start - 1]?.label) errors.push(`${arc.arc_id}: start label mismatch`);
  if (arc.end_label !== sourceChapters[end - 1]?.label) errors.push(`${arc.arc_id}: end label mismatch`);
  const signals = arc.boundary_signals.split(/\s*[;|/]\s*/u).filter(Boolean);
  if (signals.length < 2) errors.push(`${arc.arc_id}: fewer than two boundary signals`);
  for (let sequence = start; sequence <= end; sequence += 1) arcForSequence.set(sequence, arc.arc_id);
  expectedStart = end + 1;
}
if (expectedStart !== expectedCount + 1) errors.push(`arc coverage ends at ${expectedStart - 1}`);
for (const [label, rows] of [["chapter", chapters], ["pacing", pacing]]) {
  for (const row of rows) {
    const expectedArc = arcForSequence.get(Number(row.sequence));
    if (row.arc_id !== expectedArc) errors.push(`${label} ${row.sequence}: arc ${row.arc_id} != ${expectedArc}`);
  }
}

checkUniqueBundle(chapters, [
  "protagonist_goal", "action", "resistance_or_cost", "turn_or_reveal", "paid_reward", "state_change", "ending_hook",
], "chapter core bundle");
checkUniqueBundle(pacing, ["concrete_event", "pacing_note"], "pacing event bundle");
for (const field of ["entry_state", "reader_promise", "protagonist_goal", "action", "resistance_or_cost", "paid_reward", "state_change", "ending_hook"]) {
  reportFrequentExact(chapters, field, "chapter_map.csv");
}
for (const field of ["concrete_event", "pacing_note"]) reportFrequentExact(pacing, field, "arc_pacing.csv");

for (const [name, minimum] of requiredMarkdown) {
  try {
    const info = await stat(resolve(analysisDir, name));
    if (info.size < minimum) errors.push(`${name}: ${info.size} bytes < ${minimum}`);
  } catch (error) {
    errors.push(`${name}: ${error.message}`);
  }
}
const outputText = await Promise.all([
  ...["chapter_map.csv", "arc_pacing.csv", "arc_map.csv"].map((name) => readFile(resolve(analysisDir, name), "utf8")),
  ...[...requiredMarkdown.keys()].map((name) => readFile(resolve(analysisDir, name), "utf8").catch(() => "")),
]);
for (const forbidden of ["아스퍼거", "자폐증"]) {
  if (outputText.some((text) => text.includes(forbidden))) errors.push(`forbidden output term: ${forbidden}`);
}

console.log(`source=${sourceChapters.length}, chapters=${chapters.length}, pacing=${pacing.length}, arcs=${arcs.length}`);
console.log(`arc lengths min=${Math.min(...arcs.map((row) => Number(row.episode_count)))}, max=${Math.max(...arcs.map((row) => Number(row.episode_count)))}`);
for (const warning of warnings) console.log(`WARN ${warning}`);
for (const error of errors) console.log(`ERROR ${error}`);
if (errors.length) process.exitCode = 1;
else console.log(`PASS final audit (${warnings.length} warning(s))`);

async function loadCsv(name, expectedHeader) {
  const rows = parseCsv(await readFile(resolve(analysisDir, name), "utf8"));
  const [header, ...body] = rows;
  if (header?.join(",") !== expectedHeader.join(",")) errors.push(`${name}: header mismatch`);
  for (const [index, row] of body.entries()) {
    if (row.length !== expectedHeader.length) errors.push(`${name}: row ${index + 1} has ${row.length} columns`);
  }
  return body.map((row) => Object.fromEntries(expectedHeader.map((field, index) => [field, row[index] ?? ""])));
}

function checkSequences(rows, label) {
  rows.forEach((row, index) => {
    if (Number(row.sequence) !== index + 1) errors.push(`${label}: position ${index + 1} has ${row.sequence}`);
  });
}

function checkNonEmpty(rows, fields, label) {
  for (const [index, row] of rows.entries()) {
    for (const field of fields) {
      if (!String(row[field] ?? "").trim()) errors.push(`${label}: row ${index + 1}.${field} is empty`);
    }
  }
}

function checkUniqueBundle(rows, fields, label) {
  const seen = new Map();
  for (const row of rows) {
    const key = fields.map((field) => row[field].trim()).join("\u241f");
    const prior = seen.get(key);
    if (prior !== undefined) errors.push(`${label}: duplicate rows ${prior} and ${row.sequence}`);
    else seen.set(key, row.sequence);
  }
}

function reportFrequentExact(rows, field, label) {
  const counts = new Map();
  for (const row of rows) counts.set(row[field], (counts.get(row[field]) ?? 0) + 1);
  const [value, count] = [...counts.entries()].sort((left, right) => right[1] - left[1])[0] ?? ["", 0];
  if (count >= Math.max(5, Math.ceil(rows.length * 0.12))) warnings.push(`${label}.${field}: ${count} exact repeats (${value.slice(0, 50)})`);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (quoted) throw new Error("unclosed quoted CSV field");
  if (field !== "" || row.length) {
    row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
    rows.push(row);
  }
  if (rows[0]?.[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/u, "");
  return rows.filter((candidate) => !(candidate.length === 1 && candidate[0] === ""));
}
