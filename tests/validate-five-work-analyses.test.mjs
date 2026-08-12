import assert from "node:assert/strict";
import test from "node:test";

import { parseCsv } from "../tools/validate-five-work-analyses.mjs";

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
