import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outputDir = dirname(fileURLToPath(import.meta.url));
const sourcePath = "/Users/a2501/Desktop/inkos/edge_repos/inkos_reverse_lab/private_sources/korean_webnovel_corpus/흑곰작가/리턴 에이스_흑곰작가_합본.txt";
const expectedHash = "d1dd84aebe77ece8f17e4b4448b739c3106931ccec5f2008933b385b74b8ba45";
const expectedChapters = 310;
const manualReviewPaths = [
  join(outputDir, "manual_review_001_103.md"),
  join(outputDir, "manual_review_104_207.md"),
  join(outputDir, "manual_review_208_310.md"),
];
const forbiddenPacingGenerators = [
  "keywordScore",
  "pacingScores",
  "weightScores",
  "phaseFor",
];

const manualReviewFields = [
  "진입 장면",
  "Arc 단계",
  "긴장",
  "보상 강도",
  "훅 강도",
  "정보 리본",
  "행동 리본",
  "관계 리본",
  "감정 리본",
  "물질/지위 리본",
  "보상 범위",
  "페이싱 근거",
  "종료 훅",
  "닫힌 루프",
  "열린 루프",
];

const headers = {
  chapter_map: "sequence,visible_label,title,start_line,end_line,entry_state,reader_promise,protagonist_goal,action,resistance_or_cost,turn_or_reveal,paid_reward,state_change_axis,state_change,ending_hook,closed_loops,opened_loops,arc_id,confidence",
  arc_map: "arc_id,arc_name,start_sequence,end_sequence,start_label,end_label,episode_count,main_characters,main_locations,concrete_premise,central_question,promise,pressure_escalation,mid_turn,concrete_payoff,relationship_change,status_or_ability_change,residual_cost,next_arc_bridge,boundary_signals,confidence",
  arc_pacing: "sequence,visible_label,arc_id,arc_phase,concrete_event,tension_1_10,reward_1_10,hook_1_10,information_weight,action_weight,relationship_weight,emotion_weight,material_or_status_weight,pacing_note",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function readCsv(name) {
  const path = join(outputDir, `${name}.csv`);
  assert(existsSync(path), `Missing ${name}.csv`);
  const text = readFileSync(path, "utf8");
  const firstLine = text.split(/\r?\n/, 1)[0];
  assert(firstLine === headers[name], `${name}.csv header mismatch`);
  const [header, ...rows] = parseCsv(text);
  assert(header.join(",") === headers[name], `${name}.csv parsed header mismatch`);
  return {
    keys: header,
    rows: rows.map((values, index) => {
      assert(values.length === header.length, `${name}.csv row ${index + 2} has ${values.length}/${header.length} cells`);
      return Object.fromEntries(header.map((key, column) => [key, values[column]]));
    }),
  };
}

function requireTextFile(name, minimumBytes = 100) {
  const path = join(outputDir, name);
  assert(existsSync(path), `Missing ${name}`);
  assert(statSync(path).size >= minimumBytes, `${name} is unexpectedly short`);
  return readFileSync(path, "utf8");
}

function headingBlocks(markdown) {
  const headings = [...markdown.matchAll(/^#{2,3}\s+(.+?)\s*$/gm)];
  return headings.map((heading, index) => ({
    title: heading[1].trim(),
    body: markdown.slice(
      heading.index + heading[0].length,
      headings[index + 1]?.index ?? markdown.length,
    ),
  }));
}

function parseLabeledFields(body, expected) {
  const fields = {};
  for (const line of body.split(/\r?\n/)) {
    const match = line.match(/^-\s+([^:]+):\s*(.*?)\s*$/);
    if (!match) continue;
    const key = match[1].trim();
    if (expected.includes(key)) fields[key] = match[2].trim();
  }
  return fields;
}

function parseManualReviews(path) {
  const markdown = readFileSync(path, "utf8");
  const reviews = [];
  for (const block of headingBlocks(markdown)) {
    const match = block.title.match(/^(\d+)화$/);
    if (!match) continue;
    const sequence = Number(match[1]);
    const fields = parseLabeledFields(block.body, manualReviewFields);
    const missing = manualReviewFields.filter((field) => !fields[field]);
    assert(missing.length === 0, `${path}: ${sequence}화 missing manual fields: ${missing.join(", ")}`);
    reviews.push({ sequence, fields });
  }
  return reviews;
}

function compact(...values) {
  return values
    .map((value) => String(value ?? "").trim().replace(/[.!?。]+$/u, ""))
    .filter(Boolean)
    .join(" → ");
}

function mdCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function average(values) {
  return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1);
}

const source = readFileSync(sourcePath);
const sourceText = source.toString("utf8");
const sourceHash = createHash("sha256").update(source).digest("hex");
assert(sourceHash === expectedHash, `Source hash mismatch: ${sourceHash}`);

const sourceLines = sourceText.split(/\r?\n/);
const lineCount = sourceText.endsWith("\n") ? sourceLines.length - 1 : sourceLines.length;
const markers = [];
for (let index = 0; index < lineCount; index += 1) {
  const match = sourceLines[index].match(/^ⓚ리턴 에이스 (\d+)화\s*$/);
  if (match) markers.push({ sequence: Number(match[1]), label: sourceLines[index], startLine: index + 1 });
}
assert(markers.length === expectedChapters, `Source marker count is ${markers.length}`);
for (let sequence = 1; sequence <= expectedChapters; sequence += 1) {
  assert(markers[sequence - 1]?.sequence === sequence, `Source marker sequence breaks at ${sequence}`);
}
for (let index = 0; index < markers.length; index += 1) {
  markers[index].endLine = (markers[index + 1]?.startLine ?? lineCount + 1) - 1;
}

const receipt = JSON.parse(requireTextFile("source_receipt.json"));
assert(receipt.sourcePath === sourcePath, "source_receipt sourcePath mismatch");
assert(receipt.sourceSha256 === expectedHash, "source_receipt hash mismatch");
assert(receipt.markerCount === expectedChapters, "source_receipt markerCount mismatch");
assert(receipt.firstMarker === markers[0].label, "source_receipt firstMarker mismatch");
assert(receipt.lastMarker === markers.at(-1).label, "source_receipt lastMarker mismatch");
assert(receipt.analysisCoverage === "full", "source_receipt coverage is not full");

const chapterMap = readCsv("chapter_map");
const arcMap = readCsv("arc_map");
const arcPacing = readCsv("arc_pacing");
const manualReviews = manualReviewPaths.flatMap(parseManualReviews).sort((a, b) => a.sequence - b.sequence);
assert(chapterMap.rows.length === expectedChapters, `chapter_map has ${chapterMap.rows.length} rows`);
assert(arcPacing.rows.length === expectedChapters, `arc_pacing has ${arcPacing.rows.length} rows`);
assert(manualReviews.length === expectedChapters, `manual reviews have ${manualReviews.length} rows`);
assert(arcMap.rows.length > 0, "arc_map has no arcs");
for (let sequence = 1; sequence <= expectedChapters; sequence += 1) {
  assert(manualReviews[sequence - 1]?.sequence === sequence, `manual review sequence breaks at ${sequence}`);
}
const manualBySequence = new Map(manualReviews.map((review) => [review.sequence, review.fields]));

const chapterBySequence = new Map();
for (let index = 0; index < chapterMap.rows.length; index += 1) {
  const row = chapterMap.rows[index];
  const sequence = Number(row.sequence);
  const expected = index + 1;
  const marker = markers[index];
  assert(sequence === expected, `chapter_map sequence breaks at ${expected}`);
  assert(row.visible_label === `${expected}화`, `chapter_map visible_label mismatch at ${expected}`);
  assert(Number(row.start_line) === marker.startLine, `chapter_map start_line mismatch at ${expected}`);
  assert(Number(row.end_line) === marker.endLine, `chapter_map end_line mismatch at ${expected}`);
  assert(row.arc_id.length > 0, `chapter_map missing arc_id at ${expected}`);
  for (const field of ["entry_state", "reader_promise", "protagonist_goal", "action", "resistance_or_cost", "turn_or_reveal", "paid_reward", "state_change", "ending_hook"]) {
    assert(row[field].trim().length > 0, `chapter_map ${expected} missing ${field}`);
  }
  const manual = manualBySequence.get(sequence);
  assert(row.entry_state === manual["진입 장면"], `chapter_map ${expected} entry_state differs from manual review`);
  assert(row.ending_hook === manual["종료 훅"], `chapter_map ${expected} ending_hook differs from manual review`);
  assert(row.closed_loops === manual["닫힌 루프"], `chapter_map ${expected} closed_loops differs from manual review`);
  assert(row.opened_loops === manual["열린 루프"], `chapter_map ${expected} opened_loops differs from manual review`);
  chapterBySequence.set(sequence, row);
}
const chapterEventFingerprints = new Set(chapterMap.rows.map((row) => [
  row.protagonist_goal,
  row.action,
  row.resistance_or_cost,
  row.paid_reward,
  row.state_change,
].join("\u241f")));
assert(chapterEventFingerprints.size === expectedChapters, "chapter_map contains duplicated goal/action/cost/reward/state bundles");

const knownArcs = new Set();
let nextStart = 1;
for (let index = 0; index < arcMap.rows.length; index += 1) {
  const row = arcMap.rows[index];
  const expectedId = `RA-${String(index + 1).padStart(3, "0")}`;
  const start = Number(row.start_sequence);
  const end = Number(row.end_sequence);
  assert(row.arc_id === expectedId, `arc_map id mismatch at row ${index + 2}`);
  assert(start === nextStart, `${row.arc_id} starts at ${start}, expected ${nextStart}`);
  assert(end >= start, `${row.arc_id} has reversed range`);
  assert(Number(row.episode_count) === end - start + 1, `${row.arc_id} episode_count mismatch`);
  assert(row.arc_name.trim().length > 0, `${row.arc_id} missing name`);
  for (const field of ["main_characters", "main_locations", "concrete_premise", "central_question", "promise", "pressure_escalation", "mid_turn", "concrete_payoff", "relationship_change", "status_or_ability_change", "residual_cost", "next_arc_bridge"]) {
    assert(row[field].trim().length > 0, `${row.arc_id} missing ${field}`);
  }
  const signals = row.boundary_signals.split(/;|\s+및\s+|\s*\/\s*/).map((value) => value.trim()).filter(Boolean);
  assert(signals.length >= 2, `${row.arc_id} has fewer than two boundary signals`);
  for (let sequence = start; sequence <= end; sequence += 1) {
    assert(chapterBySequence.get(sequence)?.arc_id === row.arc_id, `${row.arc_id} coverage mismatch at ${sequence}`);
  }
  knownArcs.add(row.arc_id);
  nextStart = end + 1;
}
assert(nextStart === expectedChapters + 1, `Arc coverage ends at ${nextStart - 1}`);

for (let index = 0; index < arcPacing.rows.length; index += 1) {
  const row = arcPacing.rows[index];
  const sequence = index + 1;
  const manual = manualBySequence.get(sequence);
  assert(Number(row.sequence) === sequence, `arc_pacing sequence breaks at ${sequence}`);
  assert(row.arc_id === chapterBySequence.get(sequence).arc_id, `arc_pacing arc mismatch at ${sequence}`);
  assert(knownArcs.has(row.arc_id), `arc_pacing unknown arc at ${sequence}`);
  assert(row.concrete_event.trim().length > 0, `arc_pacing missing event at ${sequence}`);
  assert(row.arc_phase === manual["Arc 단계"], `arc_pacing ${sequence} phase differs from manual review`);
  for (const field of ["tension_1_10", "reward_1_10", "hook_1_10", "information_weight", "action_weight", "relationship_weight", "emotion_weight", "material_or_status_weight"]) {
    const value = Number(row[field]);
    assert(Number.isInteger(value) && value >= 1 && value <= 10, `arc_pacing ${sequence} invalid ${field}=${row[field]}`);
  }
  const expectedScores = {
    tension_1_10: manual["긴장"],
    reward_1_10: manual["보상 강도"],
    hook_1_10: manual["훅 강도"],
    information_weight: manual["정보 리본"],
    action_weight: manual["행동 리본"],
    relationship_weight: manual["관계 리본"],
    emotion_weight: manual["감정 리본"],
    material_or_status_weight: manual["물질/지위 리본"],
  };
  for (const [field, expectedValue] of Object.entries(expectedScores)) {
    assert(row[field] === expectedValue, `arc_pacing ${sequence} ${field} differs from manual review`);
  }
  const expectedNote = `보상 범위=${manual["보상 범위"]}; ${manual["페이싱 근거"]}`;
  assert(row.pacing_note === expectedNote, `arc_pacing ${sequence} pacing_note differs from manual review`);
}
const uniquePacingNotes = new Set(arcPacing.rows.map((row) => row.pacing_note));
assert(uniquePacingNotes.size === expectedChapters, `arc_pacing has only ${uniquePacingNotes.size} unique pacing notes`);

const atlas = requireTextFile("arc_atlas.md", 1000);
for (const arcId of knownArcs) {
  assert(new RegExp(`^## ${arcId} \\u00b7`, "m").test(atlas), `arc_atlas missing ${arcId}`);
}
const atlasChapterRows = [...atlas.matchAll(/^\| (\d+)화 \|/gm)].map((match) => Number(match[1]));
assert(atlasChapterRows.length === expectedChapters, `arc_atlas has ${atlasChapterRows.length} chapter beat rows`);
assert(new Set(atlasChapterRows).size === expectedChapters, "arc_atlas chapter beat rows are duplicated");
for (let sequence = 1; sequence <= expectedChapters; sequence += 1) {
  const chapter = chapterBySequence.get(sequence);
  const pacing = arcPacing.rows[sequence - 1];
  const expectedRow = `| ${sequence}화 | ${mdCell(compact(chapter.action, chapter.turn_or_reveal))} | ${mdCell(chapter.paid_reward)} | ${mdCell(chapter.ending_hook)} | ${pacing.tension_1_10} | ${pacing.reward_1_10} | ${pacing.hook_1_10} | ${pacing.arc_phase} |`;
  assert(atlas.includes(expectedRow), `arc_atlas chapter row differs from CSV data at ${sequence}`);
}
for (let index = 0; index < arcMap.rows.length; index += 1) {
  const arc = arcMap.rows[index];
  const start = Number(arc.start_sequence);
  const end = Number(arc.end_sequence);
  const paces = arcPacing.rows.slice(start - 1, end);
  const sectionStart = atlas.indexOf(`## ${arc.arc_id} ·`);
  const sectionEnd = index + 1 < arcMap.rows.length
    ? atlas.indexOf(`## ${arcMap.rows[index + 1].arc_id} ·`, sectionStart + 1)
    : atlas.indexOf("## 초반·중반·후반의 리듬 변화", sectionStart + 1);
  const section = atlas.slice(sectionStart, sectionEnd);
  for (const [label, field] of [
    ["긴장", "tension_1_10"],
    ["보상", "reward_1_10"],
    ["훅", "hook_1_10"],
  ]) {
    const values = paces.map((row) => Number(row[field]));
    const expectedLine = `${label}: ${values.join("-")} (평균 ${average(values)})`;
    assert(section.includes(expectedLine), `arc_atlas ${arc.arc_id} ${label} sequence or average mismatch`);
  }
}

const buildSource = requireTextFile("build_analysis.mjs", 1000);
for (const forbidden of forbiddenPacingGenerators) {
  assert(!buildSource.includes(forbidden), `build_analysis.mjs still contains forbidden pacing generator ${forbidden}`);
}
assert(buildSource.includes("manualReviewPaths"), "build_analysis.mjs does not read manual pacing reviews");

const manualArcRevisionText = requireTextFile("manual_arc_revisions.md", 1000);
const revisionMatches = [...manualArcRevisionText.matchAll(/^## ([A-Z]\d{3}) · (.+?) \((\d+)~(\d+)화\)$/gm)];
assert(revisionMatches.length > 0, "manual_arc_revisions.md has no revision entries");
for (const match of revisionMatches) {
  const [, rawId, name, start, end] = match;
  assert(
    arcMap.rows.some((row) => row.arc_name === name && row.start_sequence === start && row.end_sequence === end),
    `${rawId} manual Arc revision is not present in arc_map.csv`,
  );
}

assert(manualBySequence.get(56)["페이싱 근거"].includes("56화 말미 재확인:"), "56화 ending audit evidence is missing");
assert(manualBySequence.get(107)["페이싱 근거"].includes("107화 노히터 결산:"), "107화 no-hitter audit evidence is missing");
assert(Number(manualBySequence.get(107)["보상 강도"]) >= 8, "107화 reward does not reflect the eight-inning no-hitter performance");

const goalFiles = [
  "project_bible.md",
  "arc_atlas.md",
  "inkos_usage_and_gap_report.md",
  "free_improvements_report.md",
];
for (const file of goalFiles) requireTextFile(file, 1000);

console.log(JSON.stringify({
  status: "pass",
  sourceSha256: sourceHash,
  sourceLines: lineCount,
  sourceMarkers: markers.length,
  chapterMapRows: chapterMap.rows.length,
  arcCount: arcMap.rows.length,
  arcPacingRows: arcPacing.rows.length,
  arcAtlasChapterRows: atlasChapterRows.length,
  arcCoverage: `1-${nextStart - 1}`,
  uniqueChapterEventBundles: chapterEventFingerprints.size,
  goalFiles,
}, null, 2));
