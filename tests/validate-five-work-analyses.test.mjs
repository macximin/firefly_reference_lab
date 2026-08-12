import assert from "node:assert/strict";
import test from "node:test";

import { parseCsv, validatePacingRibbonWeights } from "../tools/validate-five-work-analyses.mjs";

test("parseCsv preserves commas, newlines, and escaped quotes inside quoted fields", () => {
  const rows = parseCsv('\uFEFFa,b,c\n1,"two, fields","line 1\nline 2"\n2,"say ""yes""",done\n');
  assert.deepEqual(rows, [
    ["a", "b", "c"],
    ["1", "two, fields", "line 1\nline 2"],
    ["2", 'say "yes"', "done"],
  ]);
});

test("parseCsv rejects an unclosed quoted field", () => {
  assert.throws(() => parseCsv('a,b\n1,"open'), /unclosed quoted field/u);
});

const ribbonColumns = [
  "information_weight",
  "action_weight",
  "relationship_weight",
  "emotion_weight",
  "material_or_status_weight",
];

function pacingRow(sequence, values) {
  return {
    sequence: String(sequence),
    ...Object.fromEntries(ribbonColumns.map((column, index) => [column, String(values[index])])),
  };
}

test("pacing ribbons accept one consistent 1~10 integer scale", () => {
  const warnings = [];
  validatePacingRibbonWeights([
    pacingRow(1, [1, 3, 5, 7, 10]),
    pacingRow(2, [2, 4, 6, 8, 9]),
  ], warnings);
  assert.deepEqual(warnings, []);
});

test("pacing ribbons accept normalized ratio and percentage composition scales", () => {
  const ratioWarnings = [];
  validatePacingRibbonWeights([
    pacingRow(1, [0.05, 0.2, 0.25, 0.3, 0.2]),
    pacingRow(2, [0, 0.1, 0.2, 0.3, 0.4]),
  ], ratioWarnings);
  assert.deepEqual(ratioWarnings, []);

  const percentageWarnings = [];
  validatePacingRibbonWeights([
    pacingRow(1, [5, 20, 25, 30, 20]),
    pacingRow(2, [10, 15, 20, 25, 30]),
  ], percentageWarnings);
  assert.deepEqual(percentageWarnings, []);
});

test("pacing ribbons warn when ratio and 1~10 rows are mixed", () => {
  const warnings = [];
  validatePacingRibbonWeights([
    pacingRow(1, [0.05, 0.2, 0.25, 0.3, 0.2]),
    pacingRow(2, [2, 4, 6, 8, 9]),
  ], warnings);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /척도가 혼재함/u);
  assert.match(warnings[0], /0~1 정규화 비율형 1행/u);
  assert.match(warnings[0], /1~10 정수 강도형 1행/u);
});

test("pacing ribbons warn on nonnumeric, out-of-contract, and bad ratio sums", () => {
  const warnings = [];
  validatePacingRibbonWeights([
    pacingRow(1, ["high", "low", "medium", "high", "low"]),
    pacingRow(2, [101, 4, 6, 8, 9]),
    pacingRow(3, [0.1, 0.1, 0.1, 0.1, 0.1]),
  ], warnings);
  assert.equal(warnings.length, 3);
  assert.ok(warnings.some((warning) => /비수치 또는 빈 값/u.test(warning)));
  assert.ok(warnings.some((warning) => /허용 척도/u.test(warning)));
  assert.ok(warnings.some((warning) => /합계가 1±0\.01이 아닌/u.test(warning)));
});
