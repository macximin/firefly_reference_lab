import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDeepReadSegments,
  validatePrivateDeepReadSegment,
} from "../tools/genre-soul-deep-read-runner.mjs";

function source(chapters) {
  return Buffer.from(Array.from({ length: chapters }, (_, index) => (
    `ⓚ${index + 1}화\n${`본문-${index + 1} `.repeat(80)}\n`
  )).join(""));
}

test("groups natural chapters into gap-free full-work segments", () => {
  const bytes = source(12);
  const segments = buildDeepReadSegments(bytes, 12, Math.ceil(bytes.byteLength / 3));
  assert.ok(segments.length >= 3);
  assert.equal(segments[0].startByte, 0);
  assert.equal(segments.at(-1).endByte, bytes.byteLength);
  assert.equal(segments.flatMap((segment) => segment.chapters).length, 12);
  for (let index = 1; index < segments.length; index += 1) {
    assert.equal(segments[index].startByte, segments[index - 1].endByte);
  }
});

test("validates derived observations only at chapter boundaries", () => {
  const bytes = source(5);
  const segment = buildDeepReadSegments(bytes, 5, bytes.byteLength)[0];
  const expected = {
    sourceId: "gdrive-source",
    sourceSha256: "a".repeat(64),
    genre: "murim-ko",
    segmentId: segment.segmentId,
    coverage: { startByte: segment.startByte, endByte: segment.endByte },
    chapters: segment.chapters,
  };
  const result = {
    schemaVersion: "private-genre-soul-deep-read-segment/v1",
    sourceId: expected.sourceId,
    sourceSha256: expected.sourceSha256,
    genre: expected.genre,
    segmentId: expected.segmentId,
    coverage: expected.coverage,
    observations: Array.from({ length: 4 }, (_, index) => ({
      kind: ["commercial-engine", "protagonist-action", "pressure-resistance", "payoff-witness"][index],
      finding: "구체적인 파생 관찰",
      commercialFunction: "기능",
      evidenceRanges: [{ startByte: segment.chapters[0].startByte, endByte: segment.chapters[0].endByte }],
    })),
    unresolvedPromises: [],
  };
  assert.equal(validatePrivateDeepReadSegment(result, expected), true);
  const drifted = structuredClone(result);
  drifted.observations[0].evidenceRanges[0].startByte += 1;
  assert.throws(() => validatePrivateDeepReadSegment(drifted, expected), /invalid evidence range/u);
});
