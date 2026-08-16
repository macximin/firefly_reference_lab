import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

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
  return rows;
}

function readCsv(file) {
  const [header, ...rows] = parseCsv(readFileSync(join(root, file), "utf8"));
  return rows.map((values) => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ""])));
}

const arcs = readCsv("arc_map.csv");
const pacing = readCsv("arc_pacing.csv");
const chapters = readCsv("chapter_map.csv");
const chapterBySequence = new Map(chapters.map((row) => [Number(row.sequence), row]));

function sectionFor(sequence) {
  if (sequence <= 310 * 0.33) return "early";
  if (sequence <= 310 * 0.66) return "middle";
  return "late";
}

const sections = { early: [], middle: [], late: [] };
for (const arc of arcs) {
  const start = Number(arc.start_sequence);
  const end = Number(arc.end_sequence);
  const midpoint = (start + end) / 2;
  sections[sectionFor(midpoint)].push({ ...arc, start, end, midpoint });
}

const selectedArcs = [];
for (const [section, list] of Object.entries(sections)) {
  const positions = [...new Set([0, Math.ceil(list.length / 2) - 1, list.length - 1])];
  for (const position of positions) selectedArcs.push({ section, position: position + 1, sectionArcCount: list.length, ...list[position] });
}

const arcIndex = new Map(arcs.map((arc, index) => [arc.arc_id, index]));
const base = [];
for (const arc of selectedArcs) {
  const sequences = [arc.start, Math.floor((arc.start + arc.end) / 2), arc.end];
  const next = arcs[arcIndex.get(arc.arc_id) + 1];
  if (next) sequences.push(Number(next.start_sequence));
  for (const sequence of sequences) base.push(sequence);
}
const baseSequences = [...new Set(base)].sort((a, b) => a - b);
const baseSet = new Set(baseSequences);

function ranked(field) {
  return pacing
    .map((row) => ({
      sequence: Number(row.sequence),
      value: Number(row[field]),
      arc_id: row.arc_id,
      phase: row.arc_phase,
      event: row.concrete_event,
      chapter: chapterBySequence.get(Number(row.sequence)),
    }))
    .filter((row) => !baseSet.has(row.sequence))
    .sort((a, b) => b.value - a.value || a.sequence - b.sequence)
    .slice(0, 30);
}

const relation = pacing
  .map((row) => ({
    sequence: Number(row.sequence),
    value: Number(row.relationship_weight),
    arc_id: row.arc_id,
    event: row.concrete_event,
    state_change: chapterBySequence.get(Number(row.sequence))?.state_change,
    ending_hook: chapterBySequence.get(Number(row.sequence))?.ending_hook,
  }))
  .filter((row) => !baseSet.has(row.sequence))
  .sort((a, b) => b.value - a.value || a.sequence - b.sequence)
  .slice(0, 40);

console.log(JSON.stringify({
  thresholds: { earlyMax: 310 * 0.33, middleMax: 310 * 0.66 },
  sectionCounts: Object.fromEntries(Object.entries(sections).map(([key, value]) => [key, value.length])),
  selectedArcs: selectedArcs.map(({ section, position, sectionArcCount, arc_id, arc_name, start, end, midpoint }) => ({ section, position, sectionArcCount, arc_id, arc_name, start, end, midpoint })),
  baseSequences,
  rewardCandidates: ranked("reward_1_10"),
  hookCandidates: ranked("hook_1_10"),
  relationshipCandidates: relation,
}, null, 2));
