import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSurveyAdmissible,
  buildSurveyWindows,
  indexSourceChapters,
  validatePrivateSurveyResult,
} from "../tools/genre-soul-survey-runner.mjs";

function source(chapters) {
  return Buffer.from(Array.from({ length: chapters }, (_, index) => (
    `ⓚ${index + 1}화\n${`본문-${index + 1} `.repeat(100)}\n`
  )).join(""));
}

test("indexes UTF-8 chapter bytes and builds distributed survey windows", () => {
  const bytes = source(250);
  const chapters = indexSourceChapters(bytes);
  assert.equal(chapters.length, 250);
  assert.equal(chapters[0].startByte, 0);
  assert.equal(chapters.at(-1).endByte, bytes.byteLength);
  const windows = buildSurveyWindows(bytes, 250, 120);
  assert.equal(windows.length, 5);
  assert.equal(windows[0].phase, "opening");
  assert.equal(windows.at(-1).phase, "ending");
  assert.ok(windows.every((window) => window.endByte > window.startByte));
  assert.ok(windows.every((window) => Buffer.from(bytes.subarray(window.startByte, window.endByte)).toString("utf8").includes("�") === false));
});

test("rejects chapter drift and incomplete private survey output", () => {
  const bytes = source(5);
  assert.throws(() => buildSurveyWindows(bytes, 6), /chapter count drift/u);
  const windows = buildSurveyWindows(bytes, 5);
  const coverage = windows.map(({ startByte, endByte }) => ({ startByte, endByte }));
  const base = {
    schemaVersion: "private-genre-soul-survey-result/v1",
    sourceId: "gdrive-source",
    sourceSha256: "a".repeat(64),
    genre: "fantasy-ko",
    coverage,
    observations: windows.map((window) => ({
      windowId: window.windowId,
      phase: window.phase,
      commercialEngine: "행동",
      protagonistAction: "선택",
      resistance: "저항",
      payoff: "지급",
      endingPromise: "다음 행동",
      genreEvidence: "장르 근거",
    })),
    classification: { genre: "fantasy-ko", confidence: 0.9, recommendation: "keep", reason: "근거" },
  };
  assert.equal(validatePrivateSurveyResult(base, {
    sourceId: base.sourceId,
    sourceSha256: base.sourceSha256,
    genre: base.genre,
    windows,
    coverage,
  }), true);
  assert.equal(assertSurveyAdmissible(base), true);
  assert.throws(
    () => assertSurveyAdmissible({
      ...base,
      classification: { ...base.classification, recommendation: "needs-manager-review" },
    }),
    /requires manager review/u,
  );
  assert.throws(
    () => validatePrivateSurveyResult({ ...base, observations: base.observations.slice(1) }, {
      sourceId: base.sourceId,
      sourceSha256: base.sourceSha256,
      genre: base.genre,
      windows,
      coverage,
    }),
    /one observation per window/u,
  );
});
