import assert from "node:assert/strict";
import test from "node:test";

import {
  validateChaebolReferenceCore,
  validateReferenceCoreManifest,
} from "../tools/validate-chaebol-reference-core.mjs";

test("checked-in chaebol reference core passes its contract", async () => {
  assert.deepEqual(await validateChaebolReferenceCore(), []);
});

test("manifest validator rejects automatic global binding and candidate production evidence", () => {
  const invalid = {
    version: 1,
    id: "chaebol-reference-core-v1",
    bindingPolicy: "automatic-for-all-books",
    stylePolicy: "mixed",
    routingPolicy: "abstract-everything",
    similarityPolicy: "maximize-distance",
    directCopyPolicy: "allow-verbatim",
    productionEvidence: [
      { workSlug: "candidate", status: "candidate", qa: "not-reviewed", referenceCard: "project_pitch.md" },
    ],
    cards: [],
  };
  const errors = validateReferenceCoreManifest(invalid);
  assert.ok(errors.some((error) => /opt-in/u.test(error)));
  assert.ok(errors.some((error) => /문체 분리/u.test(error)));
  assert.ok(errors.some((error) => /주축 골격/u.test(error)));
  assert.ok(errors.some((error) => /구조 유사성/u.test(error)));
  assert.ok(errors.some((error) => /직접 전사/u.test(error)));
  assert.ok(errors.some((error) => /승인되지 않은/u.test(error)));
  assert.ok(errors.some((error) => /정확히 6개/u.test(error)));
});
