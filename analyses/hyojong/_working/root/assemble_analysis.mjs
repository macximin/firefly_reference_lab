#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const analysisDir = resolve(here, "../..");
const sourceIndex = JSON.parse(await readFile(resolve(here, "source_index.json"), "utf8"));
const arcDefinitions = JSON.parse(await readFile(resolve(here, "arc_definitions.json"), "utf8"));
const arcOverrides = JSON.parse(await readFile(resolve(here, "chapter_arc_overrides.json"), "utf8"));

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

const chapterFragments = [
  resolve(analysisDir, "_working/early/chapters_001_166.csv"),
  resolve(analysisDir, "_working/middle/chapters_167_333.csv"),
  resolve(analysisDir, "_working/late/chapters_334_500.csv"),
];
const pacingFragments = [
  resolve(analysisDir, "_working/early/pacing_001_166.csv"),
  resolve(analysisDir, "_working/middle/pacing_167_333.csv"),
  resolve(analysisDir, "_working/late/pacing_334_500.csv"),
];

const chapters = await readFragments(chapterFragments, chapterHeader);
const pacing = await readFragments(pacingFragments, pacingHeader);
assertSequences(chapters, 500, "chapter fragments");
assertSequences(pacing, 500, "pacing fragments");
assertArcCoverage(arcDefinitions, 500);

const arcForSequence = new Map();
for (const arc of arcDefinitions) {
  for (let sequence = arc.start_sequence; sequence <= arc.end_sequence; sequence += 1) {
    arcForSequence.set(sequence, arc.arc_id);
  }
}

for (const row of chapters) {
  const source = sourceIndex.chapters[row.sequence - 1];
  row.visible_label = source.visibleLabel;
  row.title = source.title;
  row.start_line = String(source.startLine);
  row.end_line = String(source.endLine);
  row.arc_id = arcOverrides[String(row.sequence)] ?? arcForSequence.get(row.sequence);
}
for (const row of pacing) {
  const source = sourceIndex.chapters[row.sequence - 1];
  row.visible_label = source.visibleLabel;
  row.arc_id = arcOverrides[String(row.sequence)] ?? arcForSequence.get(row.sequence);
}

const arcs = arcDefinitions.map((arc) => ({
  ...arc,
  start_label: sourceIndex.chapters[arc.start_sequence - 1].visibleLabel,
  end_label: sourceIndex.chapters[arc.end_sequence - 1].visibleLabel,
  episode_count: arc.end_sequence - arc.start_sequence + 1,
}));

await writeFile(resolve(analysisDir, "chapter_map.csv"), renderCsv(chapterHeader, chapters), "utf8");
await writeFile(resolve(analysisDir, "arc_pacing.csv"), renderCsv(pacingHeader, pacing), "utf8");
await writeFile(resolve(analysisDir, "arc_map.csv"), renderCsv(arcHeader, arcs), "utf8");
await writeFile(resolve(analysisDir, "arc_atlas.md"), await renderAtlas(arcs, chapters, pacing), "utf8");

console.log(`Assembled ${chapters.length} chapters, ${pacing.length} pacing rows, and ${arcs.length} Arcs.`);

async function readFragments(paths, expectedHeader) {
  const rows = [];
  for (const path of paths) {
    const parsed = parseCsv(await readFile(path, "utf8"));
    const [header, ...body] = parsed;
    if (header.join(",") !== expectedHeader.join(",")) {
      throw new Error(`Unexpected header in ${path}: ${header.join(",")}`);
    }
    for (const values of body) {
      if (values.length !== expectedHeader.length) {
        throw new Error(`Column mismatch in ${path}: expected ${expectedHeader.length}, got ${values.length}`);
      }
      const row = Object.fromEntries(expectedHeader.map((key, index) => [key, values[index]]));
      row.sequence = Number(row.sequence);
      rows.push(row);
    }
  }
  return rows.sort((left, right) => left.sequence - right.sequence);
}

function assertSequences(rows, expectedCount, label) {
  if (rows.length !== expectedCount) throw new Error(`${label}: ${rows.length} rows, expected ${expectedCount}`);
  rows.forEach((row, index) => {
    if (row.sequence !== index + 1) throw new Error(`${label}: expected sequence ${index + 1}, got ${row.sequence}`);
  });
}

function assertArcCoverage(arcs, expectedCount) {
  let expectedStart = 1;
  const ids = new Set();
  for (const arc of arcs) {
    if (ids.has(arc.arc_id)) throw new Error(`Duplicate Arc id ${arc.arc_id}`);
    if (arc.start_sequence !== expectedStart) {
      throw new Error(`Arc ${arc.arc_id} starts at ${arc.start_sequence}, expected ${expectedStart}`);
    }
    if (arc.end_sequence < arc.start_sequence) throw new Error(`Arc ${arc.arc_id} has an inverted range`);
    ids.add(arc.arc_id);
    expectedStart = arc.end_sequence + 1;
  }
  if (expectedStart !== expectedCount + 1) throw new Error(`Arc coverage ends at ${expectedStart - 1}`);
}

function renderCsv(header, rows) {
  return `${[
    header.map(escapeCsv).join(","),
    ...rows.map((row) => header.map((key) => escapeCsv(row[key] ?? "")).join(",")),
  ].join("\n")}\n`;
}

function escapeCsv(value) {
  const text = String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function renderAtlas(arcs, chapters, pacingRows) {
  const frontmatter = await readFile(resolve(here, "arc_atlas_frontmatter.md"), "utf8");
  const afterword = await readFile(resolve(here, "arc_atlas_afterword.md"), "utf8");
  const chapterBySequence = new Map(chapters.map((chapter) => [chapter.sequence, chapter]));
  const pacingBySequence = new Map(pacingRows.map((row) => [row.sequence, row]));
  const sections = arcs.map((arc) => {
    const beats = [];
    for (let sequence = arc.start_sequence; sequence <= arc.end_sequence; sequence += 1) {
      const chapter = chapterBySequence.get(sequence);
      const pace = pacingBySequence.get(sequence);
      beats.push(
        `| ${sequence} | ${escapeMarkdownCell(chapter.visible_label)} | ${escapeMarkdownCell(pace.arc_phase)} | `
        + `${escapeMarkdownCell(pace.concrete_event)} | ${pace.tension_1_10}/${pace.reward_1_10}/${pace.hook_1_10} | `
        + `${escapeMarkdownCell(chapter.ending_hook)} |`,
      );
    }
    return [
      `## ${arc.arc_id} · ${arc.arc_name} (${arc.start_sequence}~${arc.end_sequence}화)`,
      "",
      `- 주요 인물: ${arc.main_characters}`,
      `- 주요 장소: ${arc.main_locations}`,
      `- 발단과 목표: ${arc.concrete_premise}`,
      `- 중심 질문: ${arc.central_question}`,
      `- 독자 약속: ${arc.promise}`,
      `- 압력 상승: ${arc.pressure_escalation}`,
      `- 중간 전환: ${arc.mid_turn}`,
      `- 결산: ${arc.concrete_payoff}`,
      `- 관계 변화: ${arc.relationship_change}`,
      `- 지위·능력·국가 상태 변화: ${arc.status_or_ability_change}`,
      `- 잔여 비용: ${arc.residual_cost}`,
      `- 다음 연결: ${arc.next_arc_bridge}`,
      `- 경계 근거: ${arc.boundary_signals}`,
      "",
      "| 회차 | 표식 | 단계 | 구체 비트 | 긴장/보상/훅 | 종료 훅 |",
      "| ---: | --- | --- | --- | --- | --- |",
      ...beats,
      "",
    ].join("\n");
  });
  const toc = [
    "## 전체 Arc 목차",
    "",
    "| Arc | 사건형 이름 | 회차 | 길이 | 중심 결산 |",
    "| --- | --- | ---: | ---: | --- |",
    ...arcs.map((arc) => (
      `| ${arc.arc_id} | ${escapeMarkdownCell(arc.arc_name)} | ${arc.start_sequence}~${arc.end_sequence} | `
      + `${arc.episode_count} | ${escapeMarkdownCell(arc.concrete_payoff)} |`
    )),
    "",
  ].join("\n");
  return `${frontmatter.trim()}\n\n${toc}\n${sections.join("\n")}${afterword.trim()}\n`;
}

function escapeMarkdownCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", "<br>");
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
  if (quoted) throw new Error("CSV has an unclosed quoted field");
  if (field !== "" || row.length > 0) {
    row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
    rows.push(row);
  }
  return rows.filter((candidate) => !(candidate.length === 1 && candidate[0] === ""));
}
