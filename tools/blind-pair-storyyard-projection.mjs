import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import {
  BLIND_PAIR_CANDIDATE_IDS,
  hashBlindEvaluationArtifact,
  scoreBlindCommercialEvaluation,
  validateBlindPairEvaluationInput,
  validateBlindPairEvaluationResult,
  validateBlindSurfaceScanReceipt,
  validateInkOSBlindPairEvaluationTransfer,
} from "./blind-pair-evaluation-contract.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const PACKET_ID = /^frp-[0-9a-f]{24}$/u;
const UTC_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u;
const SOUL_IDS = Object.freeze({
  "modern-fantasy-ko": "male-modern-fantasy-ko",
  "fantasy-ko": "male-fantasy-ko",
  "murim-ko": "male-murim-ko",
});
const STORYYARD_AUTHORITY = Object.freeze({
  canon: "inkos",
  decisionSurface: "storyyard",
  decisionEffect: "advisory",
  manuscriptApply: false,
  reverseSync: false,
});

function rawSha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortJson(nested)]));
  }
  return value;
}

function canonicalSha256(value) {
  return rawSha256(JSON.stringify(sortJson(value)));
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
  if (!isObject(value)) throw new Error(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} keys must be exactly ${wanted.join(", ")}.`);
  }
}

function assertSha(value, label) {
  if (!SHA256.test(value ?? "")) throw new Error(`${label} must be a full lowercase SHA-256.`);
}

function assertText(value, label, { allowEmpty = false } = {}) {
  if (typeof value !== "string" || (!allowEmpty && value.length < 1)) throw new Error(`${label} must be text.`);
}

function assertIso(value, label) {
  if (typeof value !== "string" || !UTC_DATETIME.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be a UTC-Z ISO timestamp.`);
  }
}

function validateCanaryIsolation(value, label) {
  exactKeys(value, ["receiptSha256", "receiptSelfHash", "isolationScopeSha256", "commonSnapshotSha256"], label);
  for (const field of Object.keys(value)) assertSha(value[field], `${label}.${field}`);
}

function validateSortedShaPair(value, label) {
  if (!Array.isArray(value) || value.length !== 2) throw new Error(`${label} must contain exactly two SHA-256 values.`);
  value.forEach((item, index) => assertSha(item, `${label}[${index}]`));
  if (value[0] >= value[1]) throw new Error(`${label} must contain two unique sorted SHA-256 values.`);
}

function validateEnvelope(envelope, input, evaluatorResultSha256, expectedContentNeutralReceipts) {
  exactKeys(envelope, [
    "generatedAt", "source", "work", "artifact", "comparison", "candidatePreparedAt",
    "sealedGenerationEvidence",
  ], "Storyyard projection envelope");
  assertIso(envelope.generatedAt, "Storyyard projection generatedAt");

  exactKeys(envelope.source, ["system", "bookId", "sourceRevision"], "Storyyard projection source");
  if (envelope.source.system !== "inkos") throw new Error("Storyyard projection source must be InkOS.");
  assertText(envelope.source.bookId, "Storyyard projection source.bookId");
  assertText(envelope.source.sourceRevision, "Storyyard projection source.sourceRevision");

  exactKeys(envelope.work, ["id", "title", "genre", "status", "targetChapters"], "Storyyard projection work");
  for (const field of ["id", "title", "genre", "status"]) assertText(envelope.work[field], `Storyyard projection work.${field}`);
  if (envelope.work.genre !== input.genre || SOUL_IDS[envelope.work.genre] === undefined) {
    throw new Error("Storyyard projection work.genre drifted from the sealed RefLab genre.");
  }
  if (!Number.isSafeInteger(envelope.work.targetChapters) || envelope.work.targetChapters < 1) {
    throw new Error("Storyyard projection work.targetChapters must be a positive integer.");
  }
  if (envelope.source.bookId !== envelope.work.id) throw new Error("Storyyard projection source/work identity drifted.");

  exactKeys(envelope.artifact, [
    "id", "kind", "chapterNumber", "title", "status", "currentContent", "currentContentSha256",
  ], "Storyyard projection artifact");
  assertText(envelope.artifact.id, "Storyyard projection artifact.id");
  if (envelope.artifact.kind !== "chapter") throw new Error("Storyyard projection artifact must be a chapter.");
  if (!Number.isSafeInteger(envelope.artifact.chapterNumber) || envelope.artifact.chapterNumber < 1) {
    throw new Error("Storyyard projection chapterNumber must be a positive integer.");
  }
  assertText(envelope.artifact.title, "Storyyard projection artifact.title", { allowEmpty: true });
  assertText(envelope.artifact.status, "Storyyard projection artifact.status");
  assertText(envelope.artifact.currentContent, "Storyyard projection artifact.currentContent", { allowEmpty: true });
  assertSha(envelope.artifact.currentContentSha256, "Storyyard projection artifact.currentContentSha256");
  if (rawSha256(envelope.artifact.currentContent) !== envelope.artifact.currentContentSha256) {
    throw new Error("Storyyard projection current manuscript SHA-256 drifted.");
  }

  exactKeys(envelope.comparison, [
    "reviewKind", "pairId", "round", "blindRunId", "blindSessionId", "commonInputReceiptSha256",
    "pairedGenerationReceiptSha256", "labelAssignmentReceiptSha256", "runtimeReceiptSha256", "canaryIsolation",
    "candidateLabelsShuffled", "generatorMetadataExcluded", "runtime",
  ], "Storyyard projection comparison");
  if (envelope.comparison.reviewKind !== "independent-blind-comparison"
    || envelope.comparison.pairId !== input.pairId
    || envelope.comparison.round !== input.round
    || envelope.comparison.blindRunId !== input.blindRunId
    || envelope.comparison.blindSessionId !== input.blindSessionId
    || envelope.comparison.commonInputReceiptSha256 !== input.commonInputReceiptSha256
    || envelope.comparison.pairedGenerationReceiptSha256 !== input.pairedGenerationReceiptSha256
    || envelope.comparison.labelAssignmentReceiptSha256 !== input.labelAssignmentReceiptSha256) {
    throw new Error("Storyyard projection comparison drifted from the sealed blind input.");
  }
  assertSha(envelope.comparison.runtimeReceiptSha256, "Storyyard projection comparison.runtimeReceiptSha256");
  if (envelope.comparison.runtimeReceiptSha256 !== evaluatorResultSha256) {
    throw new Error("Storyyard projection runtime receipt must be the exact evaluator result SHA-256.");
  }
  validateCanaryIsolation(envelope.comparison.canaryIsolation, "Storyyard projection comparison.canaryIsolation");
  if (envelope.comparison.candidateLabelsShuffled !== true || envelope.comparison.generatorMetadataExcluded !== true) {
    throw new Error("Storyyard projection comparison must remain independently blinded.");
  }
  exactKeys(envelope.comparison.runtime, ["kernel", "piWorker", "retrieval", "fts", "model", "reasoning"], "Storyyard projection runtime");
  if (JSON.stringify(envelope.comparison.runtime) !== JSON.stringify({
    kernel: "enforce", piWorker: "off", retrieval: "legacy", fts: "off", model: input.reviewer.model, reasoning: input.reviewer.reasoning,
  })) throw new Error("Storyyard projection runtime must remain the locked evaluation baseline.");

  exactKeys(envelope.candidatePreparedAt, BLIND_PAIR_CANDIDATE_IDS, "Storyyard projection candidatePreparedAt");
  for (const id of BLIND_PAIR_CANDIDATE_IDS) assertIso(envelope.candidatePreparedAt[id], `Storyyard projection candidatePreparedAt.${id}`);

  exactKeys(envelope.sealedGenerationEvidence, [
    "candidateEvidenceReceiptSha256s", "contentNeutralReceiptSha256s",
  ], "Storyyard projection sealedGenerationEvidence");
  validateSortedShaPair(
    envelope.sealedGenerationEvidence.candidateEvidenceReceiptSha256s,
    "Storyyard projection candidateEvidenceReceiptSha256s",
  );
  validateSortedShaPair(
    envelope.sealedGenerationEvidence.contentNeutralReceiptSha256s,
    "Storyyard projection contentNeutralReceiptSha256s",
  );
  if (!isDeepStrictEqual(
    envelope.sealedGenerationEvidence.contentNeutralReceiptSha256s,
    expectedContentNeutralReceipts,
  )) throw new Error("Storyyard projection content-neutral receipts drifted from the public candidate evaluations.");
}

function expectedContentNeutralReceipts(input, result) {
  return BLIND_PAIR_CANDIDATE_IDS.map((id, index) => canonicalSha256({
    schemaVersion: "firefly-content-neutral-evaluation/v1",
    candidateId: id,
    candidateSha256: input.candidates[index].sha256,
    contentNeutrality: result.evaluations[id].contentNeutrality,
  })).sort();
}

function validateTransferBinding(transfer, input, candidateContexts, envelope) {
  validateInkOSBlindPairEvaluationTransfer(transfer);
  const transferBytes = Buffer.from(`${JSON.stringify(transfer, null, 2)}\n`, "utf8");
  if (rawSha256(transferBytes) !== input.reviewPacket.sha256
    || transferBytes.byteLength !== input.reviewPacket.byteLength) {
    throw new Error("Storyyard projection transfer bytes drifted from the RefLab reviewPacket artifact binding.");
  }
  if (
    transfer.pairId !== input.pairId
    || transfer.round !== input.round
    || transfer.blindRunId !== input.blindRunId
    || transfer.blindSessionId !== input.blindSessionId
    || !isDeepStrictEqual(transfer.commonContext, input.commonContext)
    || transfer.commonInputReceiptSha256 !== input.commonInputReceiptSha256
    || transfer.pairedGenerationReceiptSha256 !== input.pairedGenerationReceiptSha256
    || transfer.labelAssignmentReceiptSha256 !== input.labelAssignmentReceiptSha256
    || !isDeepStrictEqual(
      transfer.candidates.map(({ id, sha256, byteLength }) => ({ id, sha256, byteLength })),
      input.candidates,
    )
    || !isDeepStrictEqual(
      transfer.candidates,
      candidateContexts.map(({ id, body, sha256, byteLength }) => ({ id, body, sha256, byteLength })),
    )
  ) throw new Error("Storyyard projection transfer drifted from the sealed RefLab input or candidate bodies.");
  if (envelope.source.bookId !== transfer.bookId
    || envelope.work.id !== transfer.bookId
    || envelope.artifact.chapterNumber !== transfer.chapterNumber
    || !isDeepStrictEqual(envelope.comparison.canaryIsolation, transfer.canaryIsolation)
    || BLIND_PAIR_CANDIDATE_IDS.some((id) => envelope.candidatePreparedAt[id] !== transfer.generatedAt)) {
    throw new Error("Storyyard projection InkOS Book, chapter, canary isolation, or prepared time drifted from the transfer.");
  }
}

function validateReviewReceipt(reviewReceipt, input, result, surfaceScans, candidateContexts) {
  if (!isObject(reviewReceipt) || reviewReceipt.schemaVersion !== "firefly-blind-review-receipt/v2") {
    throw new Error("Storyyard projection requires a RefLab blind review receipt v2.");
  }
  const { receiptSelfHash, ...unsigned } = reviewReceipt;
  if (receiptSelfHash !== hashBlindEvaluationArtifact(unsigned)) throw new Error("RefLab blind review receipt self-hash drifted.");
  if (reviewReceipt.sealedInputSha256 !== hashBlindEvaluationArtifact(input)
    || reviewReceipt.pairId !== input.pairId
    || reviewReceipt.round !== input.round
    || reviewReceipt.blindRunId !== input.blindRunId
    || reviewReceipt.blindSessionId !== input.blindSessionId
    || reviewReceipt.commonContextSha256 !== input.commonContext.sha256
    || reviewReceipt.commonContextByteLength !== input.commonContext.byteLength
    || reviewReceipt.reviewer?.profileId !== input.reviewer.profileId
    || reviewReceipt.reviewer?.configSha256 !== input.reviewer.configSha256
    || reviewReceipt.reviewer?.soulSha256 !== input.reviewer.soulSha256) {
    throw new Error("RefLab blind review receipt drifted from its sealed input.");
  }
  if (reviewReceipt.evaluatorBinding?.evaluatorResultSha256 !== hashBlindEvaluationArtifact(result)) {
    throw new Error("RefLab blind review receipt drifted from the exact evaluator result bytes.");
  }
  const triple = {
    evaluatorInputSha256: reviewReceipt.evaluatorBinding?.evaluatorInputSha256,
    evaluatorResultSha256: reviewReceipt.evaluatorBinding?.evaluatorResultSha256,
    hostReceiptSha256: reviewReceipt.evaluatorBinding?.hostReceiptSha256,
  };
  for (const [field, value] of Object.entries(triple)) assertSha(value, `RefLab evaluatorBinding.${field}`);
  if (reviewReceipt.evaluatorBinding?.tripleBindingSha256 !== hashBlindEvaluationArtifact(triple)) {
    throw new Error("RefLab evaluator triple binding drifted.");
  }
  const expectedPolicy = {
    purpose: "promotion-evaluation",
    actions: ["select", "tie", "invalid"],
    decisionEffect: "advisory",
    manuscriptApply: false,
    canonLeakPolicy: "block-on-nonzero",
  };
  if (JSON.stringify(reviewReceipt.storyyardProjection) !== JSON.stringify(expectedPolicy)) {
    throw new Error("RefLab blind review receipt Storyyard projection policy drifted.");
  }
  const actualLeakCount = BLIND_PAIR_CANDIDATE_IDS.reduce(
    (sum, id) => sum + result.evaluations[id].canonLeaks.length,
    0,
  );
  if (reviewReceipt.outcome?.canonLeakCount !== actualLeakCount) {
    throw new Error("RefLab blind review receipt canon leak count drifted.");
  }
  if (actualLeakCount > 0) {
    throw new Error("Storyyard projection is blocked by canonLeakPolicy=block-on-nonzero.");
  }
  if (!Array.isArray(surfaceScans) || surfaceScans.length !== 2) {
    throw new Error("Storyyard projection requires two completed surface scan receipts.");
  }
  BLIND_PAIR_CANDIDATE_IDS.forEach((id, index) => {
    const binding = reviewReceipt.candidateBindings?.[id];
    const scan = surfaceScans[index];
    validateBlindSurfaceScanReceipt(scan.receipt, candidateContexts[index], { upstreamScanSha256: scan.upstreamScanSha256 });
    if (!isObject(binding)
      || binding.candidateSha256 !== input.candidates[index].sha256
      || binding.surfaceScanReceiptSha256 !== hashBlindEvaluationArtifact(scan.receipt)
      || binding.surfaceIndexSha256 !== scan.receipt.corpus.surfaceIndexSha256
      || binding.surfaceMatchCount !== scan.receipt.matchCount
      || binding.surfaceScanStatus !== scan.receipt.status) {
      throw new Error(`RefLab ${id} review/surface binding drifted.`);
    }
    const expectedEvaluationBindingSha256 = hashBlindEvaluationArtifact({
      schemaVersion: "firefly-blind-evaluation-binding/v1",
      candidateSha256: input.candidates[index].sha256,
      ...triple,
      surfaceScanReceiptSha256: binding.surfaceScanReceiptSha256,
    });
    if (binding.evaluationBindingSha256 !== expectedEvaluationBindingSha256) {
      throw new Error(`RefLab ${id} evaluation binding drifted.`);
    }
  });
}

export function assertStoryyardV2EvaluationPacketIdentity(packet) {
  if (!isObject(packet) || packet.schemaVersion !== "firefly_review_packet/v2" || !PACKET_ID.test(packet.packetId ?? "")) {
    throw new Error("Storyyard evaluation packet schema or ID is invalid.");
  }
  assertSha(packet.packetSha256, "Storyyard evaluation packet SHA-256");
  const unsigned = { ...packet };
  delete unsigned.schemaVersion;
  delete unsigned.packetId;
  delete unsigned.packetSha256;
  const actual = rawSha256(JSON.stringify(unsigned));
  if (packet.packetSha256 !== actual || packet.packetId !== `frp-${actual.slice(0, 24)}`) {
    throw new Error("Storyyard evaluation packet identity or SHA-256 mismatch.");
  }
  return true;
}

export function buildStoryyardV2EvaluationProjection({
  transfer,
  input,
  result,
  candidateContexts,
  reviewReceipt,
  surfaceScans,
  envelope,
}) {
  validateBlindPairEvaluationInput(input);
  if (!Array.isArray(candidateContexts) || candidateContexts.length !== 2) {
    throw new Error("Storyyard projection requires two exact candidate contexts.");
  }
  validateBlindPairEvaluationResult(result, input, candidateContexts);
  if (!Array.isArray(surfaceScans) || surfaceScans.length !== 2) {
    throw new Error("Storyyard projection requires two completed surface scans.");
  }
  validateReviewReceipt(reviewReceipt, input, result, surfaceScans, candidateContexts);
  const evaluatorResultSha256 = reviewReceipt.evaluatorBinding?.evaluatorResultSha256;
  assertSha(evaluatorResultSha256, "RefLab evaluator result SHA-256");
  const contentNeutralReceiptSha256s = expectedContentNeutralReceipts(input, result);
  validateEnvelope(envelope, input, evaluatorResultSha256, contentNeutralReceiptSha256s);
  validateTransferBinding(transfer, input, candidateContexts, envelope);
  if (surfaceScans[0].receipt.corpus.surfaceIndexSha256 !== surfaceScans[1].receipt.corpus.surfaceIndexSha256) {
    throw new Error("Storyyard projection blind candidates must use the same public surface corpus.");
  }

  const candidates = BLIND_PAIR_CANDIDATE_IDS.map((id, index) => {
    const context = candidateContexts[index];
    const evaluation = result.evaluations[id];
    const scan = surfaceScans[index];
    validateBlindSurfaceScanReceipt(scan.receipt, context, { upstreamScanSha256: scan.upstreamScanSha256 });
    if (evaluation.commercialScore !== scoreBlindCommercialEvaluation(evaluation.commercialEvaluation)) {
      throw new Error(`Storyyard projection ${id} commercial score drifted.`);
    }
    return {
      id,
      kind: "blind-pair-candidate",
      evaluationBindingSha256: reviewReceipt.candidateBindings[id].evaluationBindingSha256,
      canaryIsolation: structuredClone(envelope.comparison.canaryIsolation),
      status: "unreviewed",
      body: context.body,
      sha256: context.sha256,
      preparedAt: envelope.candidatePreparedAt[id],
      commercialScore: evaluation.commercialScore,
      commercialEvaluation: structuredClone(evaluation.commercialEvaluation),
      commercialEvaluationReceiptSha256: evaluatorResultSha256,
      review: {
        status: "unreviewed",
        retained: [],
        variedSurface: [],
        linkedConsequences: [],
        emotionalCoherence: structuredClone(evaluation.emotionalCoherence),
        contentNeutrality: structuredClone(evaluation.contentNeutrality),
        canonContradictions: structuredClone(evaluation.canonContradictions),
        surfaceComparison: {
          schemaVersion: "soul_corpus_comparison/v2",
          soulId: SOUL_IDS[input.genre],
          soulVersion: "v1",
          surfaceIndexSha256: scan.receipt.corpus.surfaceIndexSha256,
          surfaceMatches: structuredClone(scan.receipt.matches),
          similarityPenaltyApplied: false,
          automaticRewriteApplied: false,
          automaticRejectApplied: false,
          humanDecision: "pending",
        },
      },
    };
  });
  const body = {
    purpose: "promotion-evaluation",
    source: structuredClone(envelope.source),
    work: structuredClone(envelope.work),
    artifact: structuredClone(envelope.artifact),
    comparison: structuredClone(envelope.comparison),
    candidates,
    sealedGenerationEvidence: structuredClone(envelope.sealedGenerationEvidence),
    recommendation: null,
    actions: ["select", "tie", "invalid"],
    authority: STORYYARD_AUTHORITY,
  };
  const packetSha256 = rawSha256(JSON.stringify({ generatedAt: envelope.generatedAt, ...body }));
  const packet = {
    schemaVersion: "firefly_review_packet/v2",
    packetId: `frp-${packetSha256.slice(0, 24)}`,
    packetSha256,
    generatedAt: envelope.generatedAt,
    ...body,
  };
  assertStoryyardV2EvaluationPacketIdentity(packet);
  return packet;
}

export const STORYYARD_V2_EVALUATION_AUTHORITY = STORYYARD_AUTHORITY;
