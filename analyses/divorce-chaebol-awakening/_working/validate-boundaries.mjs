import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workDir = dirname(fileURLToPath(import.meta.url));
const outputDir = dirname(workDir);
const sourceReceipt = JSON.parse(readFileSync(join(outputDir, "source_receipt.json"), "utf8"));
const auditManifest = JSON.parse(readFileSync(join(workDir, "boundary_audit_manifest.json"), "utf8"));
const chapterFiles = ["early_001_074.jsonl", "middle_075_148.jsonl", "late_149_220.jsonl"];
const factFields = ["action", "turn_or_reveal", "paid_reward", "concrete_event", "closed_loops"];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadJsonl(filename) {
  return readFileSync(join(workDir, filename), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${filename}:${index + 1}: ${error.message}`);
      }
    });
}

function text(value) {
  return Array.isArray(value) ? value.join(" | ") : String(value ?? "");
}

function rowText(row, fields) {
  return fields.map((field) => text(row[field])).join(" | ");
}

function includesEvery(value, patterns, context) {
  for (const pattern of patterns) assert(pattern.test(value), `${context}: missing ${pattern}`);
}

function excludesEvery(value, patterns, context) {
  for (const pattern of patterns) assert(!pattern.test(value), `${context}: forbidden ${pattern}`);
}

const sourceBuffer = readFileSync(sourceReceipt.sourcePath);
const sourceHash = createHash("sha256").update(sourceBuffer).digest("hex");
assert(sourceHash === sourceReceipt.sourceSha256, `source hash mismatch: ${sourceHash}`);
assert(sourceHash === "09ca4bb08e88f7791e38bc33c393ee1732af32823d7ed39a1c7026f4b7e37908", "source hash differs from order");

const sourceLines = sourceBuffer.toString("utf8").replaceAll("\r\n", "\n").split("\n");
if (sourceLines.at(-1) === "") sourceLines.pop();
const markers = sourceLines
  .map((line, index) => ({ line: index + 1, text: line }))
  .filter((entry) => entry.text.startsWith("ⓚ"));
assert(markers.length === 220, `expected 220 source markers, got ${markers.length}`);

const chapters = chapterFiles.flatMap(loadJsonl).sort((left, right) => left.sequence - right.sequence);
assert(chapters.length === 220, `expected 220 chapter rows, got ${chapters.length}`);
for (const [index, row] of chapters.entries()) {
  const sequence = index + 1;
  const expectedEnd = sequence < 220 ? markers[index + 1].line - 1 : sourceLines.length;
  assert(row.sequence === sequence, `sequence mismatch at ${sequence}`);
  assert(row.start_line === markers[index].line, `sequence ${sequence}: start_line ${row.start_line} != ${markers[index].line}`);
  assert(row.end_line === expectedEnd, `sequence ${sequence}: end_line ${row.end_line} != ${expectedEnd}`);
  for (const field of factFields) assert(row[field] !== undefined, `sequence ${sequence}: missing ${field}`);
}

assert(auditManifest.schemaVersion === 1, "boundary audit manifest schema mismatch");
assert(auditManifest.sourceSha256 === sourceHash, "boundary audit manifest source hash mismatch");
assert(Array.isArray(auditManifest.reviewedSequences), "reviewedSequences is not an array");
assert(auditManifest.reviewedSequences.length === 220, `reviewedSequences has ${auditManifest.reviewedSequences.length} rows`);
assert(new Set(auditManifest.reviewedSequences).size === 220, "reviewedSequences contains duplicates");
assert(auditManifest.reviewedSequences.every((sequence, index) => sequence === index + 1), "reviewedSequences is not exactly 1..220");
assert(Array.isArray(auditManifest.partitions) && auditManifest.partitions.length === 3, "expected three audit partitions");
for (const partition of auditManifest.partitions) {
  assert(existsSync(join(workDir, partition.report)), `missing audit report ${partition.report}`);
  assert(partition.reviewedCount === partition.endSequence - partition.startSequence + 1, `${partition.report}: reviewed count mismatch`);
  const changed = new Set(partition.changedSequences);
  const unchanged = new Set(partition.unchangedSequences);
  assert(changed.size === partition.changedSequences.length, `${partition.report}: duplicate changed sequence`);
  assert(unchanged.size === partition.unchangedSequences.length, `${partition.report}: duplicate unchanged sequence`);
  for (let sequence = partition.startSequence; sequence <= partition.endSequence; sequence += 1) {
    assert(changed.has(sequence) !== unchanged.has(sequence), `${partition.report}: sequence ${sequence} must occur in exactly one audit result list`);
  }
}
assert(Array.isArray(auditManifest.unresolvedFindings) && auditManifest.unresolvedFindings.length === 0, "unresolved boundary findings remain");
assert(Array.isArray(auditManifest.manualCounterexamples) && auditManifest.manualCounterexamples.length === 3, "expected three manual counterexample audits");
assert(auditManifest.manualCounterexamples.map((item) => item.arcBeforeRework).join("|") === "ARC-004|ARC-019|ARC-029", "manual counterexample set mismatch");
assert(auditManifest.manualCounterexamples.every((item) => item.status === "PASS"), "a manual counterexample audit did not pass");

const row101 = chapters[100];
const facts101 = rowText(row101, factFields);
excludesEvery(facts101, [/보조금/, /대통령.*전달/, /정책.*(?:거래|맞교환|합의)/, /PC[·ㆍ와/ ]*인터넷.*보급/], "sequence 101 fact boundary");
includesEvery(facts101, [/INC\s*소프트/i, /PC방/, /지역구/], "sequence 101 fact boundary");

const row102 = chapters[101];
const facts102 = rowText(row102, factFields);
includesEvery(facts102, [/보조금/, /대통령/, /50개/, /20억\s*달러/], "sequence 102 fact placement");

const row184 = chapters[183];
const all184 = rowText(row184, Object.keys(row184));
const facts184 = rowText(row184, factFields);
excludesEvery(all184, [/앱\s*스토어/], "sequence 184 whole-row boundary");
includesEvery(facts184, [/(?:70[^|.]{0,30}90|90[^|.]{0,30}70)억\s*달러/, /(?:증설|확대)/, /채용/, /네모/, /(?:위성|지도)/], "sequence 184 fact placement");

const row190 = chapters[189];
const facts190 = rowText(row190, factFields);
includesEvery(facts190, [/(?:입찰|철수).*(?:제안|요청)/, /결혼/], "sequence 190 proposal placement");
excludesEvery(facts190, [/합의/, /공동전선/, /거래.*성사/], "sequence 190 completion boundary");
assert(Array.isArray(row190.closed_loops) && row190.closed_loops.length === 0, "sequence 190 must not close the unanswered withdrawal proposal");
assert(row190.reward_1_10 < 10, "sequence 190 unanswered proposal must not receive reward 10");

const row191 = chapters[190];
const facts191 = rowText(row191, factFields);
excludesEvery(text(row191.entry_state), [/합의했/, /합의가 (?:됐|되었)/, /합의된/], "sequence 191 entry state");
includesEvery(facts191, [/현태\s*전자/, /2조/, /(?:합의|수락|동의)/], "sequence 191 completion placement");

const row196 = chapters[195];
const all196 = rowText(row196, Object.keys(row196));
const facts196 = rowText(row196, factFields);
includesEvery(facts196, [/앱\s*스토어/], "sequence 196 app-store placement");
excludesEvery(facts196, [/화성/, /대현\s*제약.*인수권.*확보/], "sequence 196 fact boundary");
excludesEvery(text(row196.paid_reward), [/대현\s*제약.*(?:합의|체결|확보|수락|성사|인수권)/], "sequence 196 unpaid pharmaceutical condition");
includesEvery(text(row196.action), [/대현\s*제약/, /(?:조건|요구|제안)/], "sequence 196 conditional pharmaceutical offer");

const result = {
  sourceSha256: sourceHash,
  sourceLines: sourceLines.length,
  sourceMarkers: markers.length,
  boundaryRowsReviewed: auditManifest.reviewedSequences.length,
  changedRows: auditManifest.partitions.reduce((sum, partition) => sum + partition.changedSequences.length, 0),
  manualCounterexamples: auditManifest.manualCounterexamples.map((item) => item.arcBeforeRework),
  semanticBoundaryAssertions: 6,
  errors: 0,
  warnings: 0,
  status: "PASS",
};

console.log(JSON.stringify(result, null, 2));
