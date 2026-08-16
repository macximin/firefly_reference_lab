#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workDir = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(workDir, "..");
const repoRoot = resolve(outputDir, "../..");
const sourcePath = join(repoRoot, "private_sources/korean_webnovel_corpus/강동호/대망_강동호_합본.txt");

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
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field.replace(/\r$/u, "")); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (field || row.length) { row.push(field.replace(/\r$/u, "")); rows.push(row); }
  const [header, ...body] = rows.filter((candidate) => !(candidate.length === 1 && candidate[0] === ""));
  return body.map((values) => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ""])));
}

function duplicatesWithin(row, fields) {
  const groups = new Map();
  for (const field of fields) {
    const value = row[field]?.trim();
    if (!value) continue;
    const list = groups.get(value) ?? [];
    list.push(field);
    groups.set(value, list);
  }
  return [...groups.entries()].filter(([, names]) => names.length > 1);
}

function exactValueRepeats(rows, fields) {
  const findings = [];
  for (const field of fields) {
    const counts = new Map();
    rows.forEach((row) => {
      const value = row[field]?.trim();
      if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
    });
    const [value, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
    findings.push({ field, count, sample: value.slice(0, 100) });
  }
  return findings;
}

const chapterFields = [
  "entry_state", "reader_promise", "protagonist_goal", "action", "resistance_or_cost",
  "turn_or_reveal", "paid_reward", "state_change", "ending_hook", "closed_loops", "opened_loops",
];
const arcFields = [
  "concrete_premise", "central_question", "promise", "pressure_escalation", "mid_turn",
  "concrete_payoff", "relationship_change", "status_or_ability_change", "residual_cost",
  "next_arc_bridge", "boundary_signals",
];

async function main() {
  const [source, chapterText, arcText, pacingText] = await Promise.all([
    readFile(sourcePath, "utf8"),
    readFile(join(outputDir, "chapter_map.csv"), "utf8"),
    readFile(join(outputDir, "arc_map.csv"), "utf8"),
    readFile(join(outputDir, "arc_pacing.csv"), "utf8"),
  ]);
  const chapters = parseCsv(chapterText);
  const arcs = parseCsv(arcText);
  const pacing = parseCsv(pacingText);
  const sourceLines = source.split("\n");

  const missingChapter = [];
  const duplicateRows = [];
  const rawQuoteRows = [];
  for (const row of chapters) {
    const missing = chapterFields.filter((field) => !row[field]?.trim());
    if (!row.state_change_axis?.trim() || !row.ending_hook?.trim() || !row.confidence?.trim()) {
      missing.push("axis/hook/confidence");
    }
    if (missing.length) missingChapter.push([row.sequence, missing]);
    const duplicates = duplicatesWithin(row, chapterFields);
    if (duplicates.length) duplicateRows.push([row.sequence, duplicates.map(([, fields]) => fields.join("="))]);
    const chapterSource = sourceLines.slice(Number(row.start_line) - 1, Number(row.end_line)).join("\n");
    const direct = chapterFields.filter((field) => {
      const value = row[field]?.trim();
      return value?.length >= 35 && chapterSource.includes(value);
    });
    if (direct.length) rawQuoteRows.push([row.sequence, direct]);
  }

  const missingArcs = arcs
    .map((row) => [row.arc_id, arcFields.filter((field) => !row[field]?.trim())])
    .filter(([, missing]) => missing.length);
  const duplicateArcs = arcs
    .map((row) => [row.arc_id, duplicatesWithin(row, arcFields).map(([, fields]) => fields.join("="))])
    .filter(([, duplicates]) => duplicates.length);
  const pacingDuplicateRows = pacing
    .filter((row) => row.concrete_event?.trim() === row.pacing_note?.trim())
    .map((row) => row.sequence);
  const longCells = chapters.flatMap((row) => chapterFields
    .filter((field) => row[field]?.length > 320)
    .map((field) => [row.sequence, field, row[field].length]));

  console.log(JSON.stringify({
    counts: { chapters: chapters.length, arcs: arcs.length, pacing: pacing.length },
    missingChapterCount: missingChapter.length,
    missingChapterSample: missingChapter.slice(0, 10),
    chapterRowsWithInternalDuplicates: duplicateRows.length,
    internalDuplicateSample: duplicateRows.slice(0, 12),
    chapterRowsWithLongDirectSourceSentences: rawQuoteRows.length,
    directSourceSample: rawQuoteRows.slice(0, 12),
    chapterCellsOver320Chars: longCells.length,
    longCellSample: longCells.slice(0, 10),
    missingArcCount: missingArcs.length,
    missingArcSample: missingArcs.slice(0, 10),
    arcRowsWithInternalDuplicates: duplicateArcs.length,
    arcDuplicateSample: duplicateArcs.slice(0, 10),
    pacingEventEqualsNoteCount: pacingDuplicateRows.length,
    pacingEventEqualsNoteSample: pacingDuplicateRows.slice(0, 20),
    mostRepeatedChapterValues: exactValueRepeats(chapters, chapterFields),
    mostRepeatedArcValues: exactValueRepeats(arcs, arcFields),
    mostRepeatedPacingValues: exactValueRepeats(pacing, ["concrete_event", "pacing_note"]),
  }, null, 2));
}

await main();
