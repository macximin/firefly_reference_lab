#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workDir = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(workDir, "..");
const repoRoot = resolve(outputDir, "../..");
const sourcePath = join(
  repoRoot,
  "private_sources/korean_webnovel_corpus/강동호/금수저생활백서_강동호_합본.txt",
);

const chapterColumns = [
  "sequence", "visible_label", "title", "start_line", "end_line", "entry_state",
  "reader_promise", "protagonist_goal", "action", "resistance_or_cost", "turn_or_reveal",
  "paid_reward", "state_change_axis", "state_change", "ending_hook", "closed_loops",
  "opened_loops", "arc_id", "confidence",
];
const pacingColumns = [
  "sequence", "visible_label", "arc_id", "arc_phase", "concrete_event", "tension_1_10",
  "reward_1_10", "hook_1_10", "information_weight", "action_weight", "relationship_weight",
  "emotion_weight", "material_or_status_weight", "pacing_note",
];
const arcColumns = [
  "arc_id", "arc_name", "start_sequence", "end_sequence", "start_label", "end_label",
  "episode_count", "main_characters", "main_locations", "concrete_premise", "central_question",
  "promise", "pressure_escalation", "mid_turn", "concrete_payoff", "relationship_change",
  "status_or_ability_change", "residual_cost", "next_arc_bridge", "boundary_signals", "confidence",
];

function csvCell(value) {
  const text = String(value ?? "").replace(/\r?\n/gu, " ").trim();
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

function toCsv(columns, rows) {
  return `${columns.join(",")}\n${rows.map((row) => columns.map((key) => csvCell(row[key])).join(",")).join("\n")}\n`;
}

function parseJsonl(text, name) {
  return text.split(/\r?\n/u).filter((line) => line.trim()).map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`${name}:${index + 1}: ${error.message}`); }
  });
}

function requireColumns(row, columns, label) {
  for (const key of columns) {
    if (!(key in row)) throw new Error(`${label}: missing ${key}`);
    if (String(row[key] ?? "").trim() === "") throw new Error(`${label}: blank ${key}`);
  }
}

const sourceLines = (await readFile(sourcePath, "utf8")).split(/\r?\n/u);
const markers = [];
for (const [zeroIndex, line] of sourceLines.entries()) {
  if (line.startsWith("ⓚ")) markers.push({ line: zeroIndex + 1, text: line });
}
if (markers.length !== 703) throw new Error(`source marker count ${markers.length} != 703`);

const segmentPaths = [
  join(workDir, "early_001_235/episodes.jsonl"),
  join(workDir, "middle_236_469/episodes.jsonl"),
  join(workDir, "late_470_703/episodes_470_475_parent.jsonl"),
  join(workDir, "late_470_703/episodes_476_703.jsonl"),
];
const episodes = [];
for (const path of segmentPaths) episodes.push(...parseJsonl(await readFile(path, "utf8"), path));
episodes.sort((left, right) => Number(left.sequence) - Number(right.sequence));
if (episodes.length !== 703) throw new Error(`episode rows ${episodes.length} != 703`);

const arcs = JSON.parse(await readFile(join(workDir, "arcs.json"), "utf8"));
if (!Array.isArray(arcs) || arcs.length === 0) throw new Error("arcs.json must contain a non-empty array");
let expectedStart = 1;
for (const [index, arc] of arcs.entries()) {
  requireColumns(arc, arcColumns.filter((key) => !["start_label", "end_label", "episode_count"].includes(key)), `arc ${index + 1}`);
  const start = Number(arc.start_sequence);
  const end = Number(arc.end_sequence);
  if (start !== expectedStart || !Number.isInteger(end) || end < start) {
    throw new Error(`arc ${arc.arc_id}: expected start ${expectedStart}, received ${start}-${end}`);
  }
  arc.start_label = episodes[start - 1]?.visible_label;
  arc.end_label = episodes[end - 1]?.visible_label;
  arc.episode_count = end - start + 1;
  expectedStart = end + 1;
}
if (expectedStart !== 704) throw new Error(`arc coverage ended at ${expectedStart - 1}`);

const arcBySequence = new Map();
for (const arc of arcs) {
  for (let sequence = Number(arc.start_sequence); sequence <= Number(arc.end_sequence); sequence += 1) {
    arcBySequence.set(sequence, arc.arc_id);
  }
}

for (const [index, episode] of episodes.entries()) {
  const sequence = index + 1;
  if (Number(episode.sequence) !== sequence) throw new Error(`sequence ${sequence}: received ${episode.sequence}`);
  const marker = markers[index];
  episode.start_line = marker.line;
  episode.end_line = (markers[index + 1]?.line ?? sourceLines.length + 1) - 1;
  episode.arc_id = arcBySequence.get(sequence);
  requireColumns(episode, chapterColumns, `episode ${sequence} chapter`);
  requireColumns(episode, pacingColumns, `episode ${sequence} pacing`);
  for (const key of ["tension_1_10", "reward_1_10", "hook_1_10"]) {
    const score = Number(episode[key]);
    if (!Number.isInteger(score) || score < 1 || score > 10) throw new Error(`episode ${sequence}: invalid ${key}`);
  }
}

await writeFile(join(outputDir, "chapter_map.csv"), toCsv(chapterColumns, episodes), "utf8");
await writeFile(join(outputDir, "arc_pacing.csv"), toCsv(pacingColumns, episodes), "utf8");
await writeFile(join(outputDir, "arc_map.csv"), toCsv(arcColumns, arcs), "utf8");
console.log(`assembled ${episodes.length} episodes across ${arcs.length} arcs`);
