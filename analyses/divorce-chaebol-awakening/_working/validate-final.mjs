import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workDir = dirname(fileURLToPath(import.meta.url));
const outputDir = dirname(workDir);
const receipt = JSON.parse(readFileSync(join(outputDir, "source_receipt.json"), "utf8"));

const expectedChapterHeader = "sequence,visible_label,title,start_line,end_line,entry_state,reader_promise,protagonist_goal,action,resistance_or_cost,turn_or_reveal,paid_reward,state_change_axis,state_change,ending_hook,closed_loops,opened_loops,arc_id,confidence";
const expectedArcHeader = "arc_id,arc_name,start_sequence,end_sequence,start_label,end_label,episode_count,main_characters,main_locations,concrete_premise,central_question,promise,pressure_escalation,mid_turn,concrete_payoff,relationship_change,status_or_ability_change,residual_cost,next_arc_bridge,boundary_signals,confidence";
const expectedPacingHeader = "sequence,visible_label,arc_id,arc_phase,concrete_event,tension_1_10,reward_1_10,hook_1_10,information_weight,action_weight,relationship_weight,emotion_weight,material_or_status_weight,pacing_note";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseCsv(text) {
  const records = [];
  let record = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n") {
      record.push(field.replace(/\r$/, ""));
      records.push(record);
      record = [];
      field = "";
    } else {
      field += char;
    }
  }
  assert(!quoted, "unterminated CSV quote");
  if (field || record.length) {
    record.push(field.replace(/\r$/, ""));
    records.push(record);
  }
  const header = records.shift();
  return { header, rows: records.map((cells) => Object.fromEntries(header.map((key, index) => [key, cells[index] ?? ""]))) };
}

const source = readFileSync(receipt.sourcePath);
const sourceText = source.toString("utf8").replaceAll("\r\n", "\n");
const sourceLines = sourceText.split("\n");
if (sourceLines.at(-1) === "") sourceLines.pop();
const sourceHash = createHash("sha256").update(source).digest("hex");
assert(sourceHash === receipt.sourceSha256, `source hash mismatch: ${sourceHash}`);
assert(sourceHash === "09ca4bb08e88f7791e38bc33c393ee1732af32823d7ed39a1c7026f4b7e37908", "source hash differs from order");

const markers = sourceLines
  .map((line, index) => ({ text: line, line: index + 1 }))
  .filter((entry) => entry.text.startsWith("ⓚ"));
assert(markers.length === 220, `expected 220 markers, got ${markers.length}`);
assert(markers[0].text === receipt.firstMarker, "first marker mismatch");
assert(markers.at(-1).text === receipt.lastMarker, "last marker mismatch");

const chapterRaw = readFileSync(join(outputDir, "chapter_map.csv"), "utf8");
const arcRaw = readFileSync(join(outputDir, "arc_map.csv"), "utf8");
const pacingRaw = readFileSync(join(outputDir, "arc_pacing.csv"), "utf8");
assert(chapterRaw.split(/\r?\n/, 1)[0] === expectedChapterHeader, "chapter_map.csv header mismatch");
assert(arcRaw.split(/\r?\n/, 1)[0] === expectedArcHeader, "arc_map.csv header mismatch");
assert(pacingRaw.split(/\r?\n/, 1)[0] === expectedPacingHeader, "arc_pacing.csv header mismatch");

const chapterCsv = parseCsv(chapterRaw);
const arcCsv = parseCsv(arcRaw);
const pacingCsv = parseCsv(pacingRaw);
assert(chapterCsv.rows.length === 220, `chapter_map.csv has ${chapterCsv.rows.length} data rows`);
assert(pacingCsv.rows.length === 220, `arc_pacing.csv has ${pacingCsv.rows.length} data rows`);
assert(arcCsv.rows.length > 0, "arc_map.csv has no data rows");

const essentialChapterFields = expectedChapterHeader.split(",").filter((field) => !["closed_loops", "opened_loops"].includes(field));
for (const [index, row] of chapterCsv.rows.entries()) {
  const sequence = index + 1;
  assert(Number(row.sequence) === sequence, `chapter row ${sequence}: sequence mismatch`);
  const expectedLabel = sequence === 220 ? "220화(완결화)" : `${sequence}화`;
  assert(row.visible_label === expectedLabel, `chapter row ${sequence}: visible label mismatch`);
  assert(Number(row.start_line) === markers[index].line, `chapter row ${sequence}: start line mismatch`);
  const expectedEnd = index + 1 < markers.length ? markers[index + 1].line - 1 : sourceLines.length;
  assert(Number(row.end_line) === expectedEnd, `chapter row ${sequence}: end line mismatch`);
  assert(row.title === markers[index].text.slice(1), `chapter row ${sequence}: title differs from source marker`);
  for (const field of essentialChapterFields) assert(row[field].trim(), `chapter row ${sequence}: empty ${field}`);
}

const uniqueFields = ["protagonist_goal", "resistance_or_cost", "paid_reward", "state_change", "ending_hook"];
for (const field of uniqueFields) {
  const unique = new Set(chapterCsv.rows.map((row) => row[field])).size;
  assert(unique >= 210, `${field} has only ${unique} unique values; possible blanket duplication`);
}

let expectedStart = 1;
const arcById = new Map();
for (const [index, arc] of arcCsv.rows.entries()) {
  const expectedId = `ARC-${String(index + 1).padStart(3, "0")}`;
  assert(arc.arc_id === expectedId, `Arc ${index + 1}: id mismatch`);
  const start = Number(arc.start_sequence);
  const end = Number(arc.end_sequence);
  assert(start === expectedStart, `${arc.arc_id}: range is not contiguous`);
  assert(end >= start && end <= 220, `${arc.arc_id}: invalid end`);
  assert(Number(arc.episode_count) === end - start + 1, `${arc.arc_id}: episode count mismatch`);
  const expectedEndLabel = end === 220 ? "220화(완결화)" : `${end}화`;
  assert(arc.start_label === `${start}화` && arc.end_label === expectedEndLabel, `${arc.arc_id}: label range mismatch`);
  assert(arc.boundary_signals.split(" | ").filter(Boolean).length >= 2, `${arc.arc_id}: fewer than two boundary signals`);
  for (const [field, value] of Object.entries(arc)) assert(value.trim(), `${arc.arc_id}: empty ${field}`);
  arcById.set(arc.arc_id, { start, end });
  expectedStart = end + 1;
}
assert(expectedStart === 221, `Arc coverage ends at ${expectedStart - 1}`);

for (const [index, row] of chapterCsv.rows.entries()) {
  const sequence = index + 1;
  const arc = arcById.get(row.arc_id);
  assert(arc && sequence >= arc.start && sequence <= arc.end, `chapter ${sequence}: wrong or missing Arc ${row.arc_id}`);
  const pacing = pacingCsv.rows[index];
  assert(Number(pacing.sequence) === sequence, `pacing row ${sequence}: sequence mismatch`);
  assert(pacing.visible_label === row.visible_label, `pacing row ${sequence}: label mismatch`);
  assert(pacing.arc_id === row.arc_id, `pacing row ${sequence}: Arc mismatch`);
  for (const field of ["tension_1_10", "reward_1_10", "hook_1_10"]) {
    const value = Number(pacing[field]);
    assert(Number.isInteger(value) && value >= 1 && value <= 10, `pacing row ${sequence}: ${field} out of range`);
  }
  for (const field of ["information_weight", "action_weight", "relationship_weight", "emotion_weight", "material_or_status_weight"]) {
    assert(["low", "medium", "high"].includes(pacing[field]), `pacing row ${sequence}: invalid ${field}`);
  }
  for (const [field, value] of Object.entries(pacing)) assert(value.trim(), `pacing row ${sequence}: empty ${field}`);
}

const requiredDocs = {
  "project_bible.md": 20_000,
  "arc_atlas.md": 60_000,
  "inkos_usage_and_gap_report.md": 20_000,
  "free_improvements_report.md": 10_000,
  "completion_receipt.md": 2_000,
};
for (const [filename, minimumBytes] of Object.entries(requiredDocs)) {
  const size = statSync(join(outputDir, filename)).size;
  assert(size >= minimumBytes, `${filename} is too small: ${size} bytes`);
}

const result = {
  sourceSha256: sourceHash,
  sourceLines: sourceLines.length,
  markerCount: markers.length,
  chapterRows: chapterCsv.rows.length,
  arcRows: arcCsv.rows.length,
  pacingRows: pacingCsv.rows.length,
  chapterRange: `${chapterCsv.rows[0].visible_label}~${chapterCsv.rows.at(-1).visible_label}`,
  lineRange: `${chapterCsv.rows[0].start_line}~${chapterCsv.rows.at(-1).end_line}`,
  uniqueChapterFields: Object.fromEntries(uniqueFields.map((field) => [field, new Set(chapterCsv.rows.map((row) => row[field])).size])),
  status: "PASS",
};
console.log(JSON.stringify(result, null, 2));
