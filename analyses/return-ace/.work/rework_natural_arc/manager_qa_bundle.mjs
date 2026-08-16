import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const candidateDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(candidateDir, "../../../..");
const sourcePath = join(repoRoot, "private_sources/korean_webnovel_corpus/흑곰작가/리턴 에이스_흑곰작가_합본.txt");

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
  const [header, ...rows] = parseCsv(readFileSync(join(candidateDir, file), "utf8"));
  return rows.map((values) => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ""])));
}

const chapterRows = readCsv("chapter_map.csv");
const pacingRows = readCsv("arc_pacing.csv");
const arcRows = readCsv("arc_map.csv");
const chapters = new Map(chapterRows.map((row) => [Number(row.sequence), row]));
const pacing = new Map(pacingRows.map((row) => [Number(row.sequence), row]));
const arcs = new Map(arcRows.map((row) => [row.arc_id, row]));
const sourceLines = readFileSync(sourcePath, "utf8").split(/\r?\n/u);

const sequences = process.argv.slice(2).flatMap((value) => value.split(",")).map(Number).filter(Number.isFinite);
for (const sequence of sequences) {
  const chapter = chapters.get(sequence);
  const pace = pacing.get(sequence);
  if (!chapter || !pace) throw new Error(`missing sequence ${sequence}`);
  const arc = arcs.get(chapter.arc_id);
  const start = Number(chapter.start_line);
  const end = Number(chapter.end_line);
  const source = sourceLines.slice(start - 1, end).map((line, index) => ({ line: start + index, text: line.trim() })).filter(({ text }) => text);
  const middleStart = Math.max(0, Math.floor(source.length / 2) - 6);
  const excerpts = [
    ["첫", source.slice(0, 8)],
    ["중앙", source.slice(middleStart, middleStart + 12)],
    ["끝", source.slice(-28)],
  ];
  console.log(`\n===== ${sequence}화 · ${chapter.arc_id} · 원문 ${start}-${end} =====`);
  console.log(`[Arc] ${arc.arc_name} (${arc.start_sequence}-${arc.end_sequence})`);
  console.log(`[행동] ${chapter.action}`);
  console.log(`[전환] ${chapter.turn_or_reveal}`);
  console.log(`[지급] ${chapter.paid_reward}`);
  console.log(`[변화] ${chapter.state_change}`);
  console.log(`[훅] ${chapter.ending_hook}`);
  console.log(`[루프] 닫힘=${chapter.closed_loops} / 열림=${chapter.opened_loops}`);
  console.log(`[페이싱] ${pace.arc_phase}; T/R/H=${pace.tension_1_10}/${pace.reward_1_10}/${pace.hook_1_10}; ribbon=${pace.information_weight}/${pace.action_weight}/${pace.relationship_weight}/${pace.emotion_weight}/${pace.material_or_status_weight}`);
  console.log(`[근거] ${pace.pacing_note}`);
  for (const [label, lines] of excerpts) {
    console.log(`[원문 ${label}]`);
    for (const { line, text } of lines) console.log(`${line}: ${text}`);
  }
}
