#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseCsv } from "./validate-five-work-analyses.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultSource = join(
  repoRoot,
  "private_sources/korean_webnovel_corpus/서오/독식하는 재벌 3세_서오_합본.txt",
);
const defaultAnalysis = join(repoRoot, "analyses/doksik-chaebol3");
const defaultTrackedOutput = join(
  repoRoot,
  "inkos_handoffs/doksik-chaebol3-transformation-pack/v1",
);
const defaultPrivateOutput = join(
  repoRoot,
  "exports/reference-packs/doksik-chaebol3-ko-v1",
);

const PHASE_COUNT = 5;
const EXPECTED_CHAPTERS = 751;
const EXPECTED_ARCS = 131;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function round(value, digits = 3) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * fraction)),
  );
  return sorted[index];
}

function summarize(values) {
  if (values.length === 0) return { mean: 0, stdDev: 0, p10: 0, p50: 0, p90: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  const sorted = [...values].sort((left, right) => left - right);
  return {
    mean: round(mean, 1),
    stdDev: round(Math.sqrt(variance), 1),
    p10: percentile(sorted, 0.1),
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
  };
}

function mattr(tokens, windowSize = 200) {
  if (tokens.length === 0) return 0;
  if (tokens.length <= windowSize) return round(new Set(tokens).size / tokens.length);
  const counts = new Map();
  let unique = 0;
  let sum = 0;
  let windows = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const next = (counts.get(token) ?? 0) + 1;
    counts.set(token, next);
    if (next === 1) unique += 1;
    if (index >= windowSize) {
      const expired = tokens[index - windowSize];
      const remaining = counts.get(expired) - 1;
      if (remaining === 0) {
        counts.delete(expired);
        unique -= 1;
      } else {
        counts.set(expired, remaining);
      }
    }
    if (index >= windowSize - 1) {
      sum += unique / windowSize;
      windows += 1;
    }
  }
  return round(sum / windows);
}

export function parseMarkedCorpus(text) {
  const starts = [...text.matchAll(/^ⓚ(?=\d)/gmu)];
  return starts.map((match, index) => {
    const startOffset = match.index;
    const endOffset = starts[index + 1]?.index ?? text.length;
    const raw = text.slice(startOffset, endOffset).trim();
    const newline = raw.indexOf("\n");
    const marker = newline >= 0 ? raw.slice(0, newline).trim() : raw;
    const prose = newline >= 0 ? raw.slice(newline + 1).trim() : "";
    return {
      sequence: index + 1,
      marker,
      prose,
      startOffset,
      endOffset,
    };
  });
}

function isDialogueParagraph(paragraph) {
  return /^[“「『"'‘—]/u.test(paragraph.trim());
}

export function analyzeKoreanStyle(text) {
  const clean = text.trim();
  const sentences = clean
    .split(/[.!?。！？\n]+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const paragraphs = clean
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const measure = (value) => [...value.replace(/\s+/gu, "")].length;
  const sentenceLengths = sentences.map(measure);
  const paragraphLengths = paragraphs.map(measure);
  const dialogueParagraphs = paragraphs.filter(isDialogueParagraph);
  const dialogueCharacters = dialogueParagraphs.reduce(
    (sum, paragraph) => sum + measure(paragraph),
    0,
  );
  const proseCharacters = measure(clean);
  const eojeols = clean.toLowerCase().match(/[가-힣]+/gu) ?? [];
  const shortSentences = sentenceLengths.filter((length) => length <= 18).length;
  const similes = clean.match(/(?:처럼|같이|듯이|마치)/gu)?.length ?? 0;
  const questions = clean.match(/[?？]/gu)?.length ?? 0;
  const exclamations = clean.match(/[!！]/gu)?.length ?? 0;
  const per10k = (count) => proseCharacters > 0
    ? round((count / proseCharacters) * 10_000, 2)
    : 0;
  return {
    proseCharacters,
    sentenceCount: sentences.length,
    paragraphCount: paragraphs.length,
    sentenceLength: summarize(sentenceLengths),
    paragraphLength: summarize(paragraphLengths),
    shortSentenceRatio: sentences.length > 0 ? round(shortSentences / sentences.length) : 0,
    dialogueParagraphRatio: paragraphs.length > 0
      ? round(dialogueParagraphs.length / paragraphs.length)
      : 0,
    dialogueCharacterRatio: proseCharacters > 0
      ? round(dialogueCharacters / proseCharacters)
      : 0,
    lexicalDiversityMattr200: mattr(eojeols),
    rhetoricalRatePer10k: {
      simile: per10k(similes),
      question: per10k(questions),
      exclamation: per10k(exclamations),
    },
  };
}

function rowsAsObjects(rows) {
  const [header, ...body] = rows;
  return body.map((values) => Object.fromEntries(
    header.map((key, index) => [key, values[index] ?? ""]),
  ));
}

function findArcForSequence(arcs, sequence) {
  return arcs.find(
    (arc) => Number(arc.start_sequence) <= sequence && Number(arc.end_sequence) >= sequence,
  );
}

function sampleForPhase(arcs, start, end) {
  const midpoint = Math.floor((start + end) / 2);
  const startArc = findArcForSequence(arcs, start);
  const middleArc = findArcForSequence(arcs, midpoint);
  const endArc = findArcForSequence(arcs, end);
  return [
    {
      sequence: Math.max(start, Number(startArc?.start_sequence ?? start)),
      arcId: startArc?.arc_id ?? "unknown",
      position: "entry",
    },
    {
      sequence: midpoint,
      arcId: middleArc?.arc_id ?? "unknown",
      position: "escalation",
    },
    {
      sequence: Math.min(end, Number(endArc?.end_sequence ?? end)),
      arcId: endArc?.arc_id ?? "unknown",
      position: "payoff",
    },
  ];
}

function linesToJsonl(rows) {
  return `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}

export function validateReferencePack(pack) {
  const errors = [];
  if (pack?.version !== 1 || pack?.kind !== "reference-transformation-pack") {
    errors.push("invalid pack identity");
  }
  if (pack?.language !== "ko") errors.push("language must be ko");
  if (pack?.source?.chapterCount !== EXPECTED_CHAPTERS) {
    errors.push("chapter coverage must be 751");
  }
  if (pack?.source?.naturalArcCount !== EXPECTED_ARCS) {
    errors.push("Gold Arc coverage must be 131");
  }
  if (pack?.phases?.length !== PHASE_COUNT) errors.push("exactly five phase profiles are required");
  if (pack?.storyRetrieval?.indexedChapterCount !== EXPECTED_CHAPTERS) {
    errors.push("story retrieval must index all 751 chapters");
  }
  if (pack?.styleRetrieval?.samples?.length !== 15) {
    errors.push("exactly fifteen stratified style samples are required");
  }
  if (pack?.commercialPolicy?.similarityPenalty !== false) {
    errors.push("structural similarity must not be penalized");
  }
  if (pack?.commercialPolicy?.minimumDistanceScore !== null) {
    errors.push("minimum distance score must be disabled");
  }
  const serialized = JSON.stringify(pack);
  if (/"(?:text|quote|excerpt|prose|topPatterns)"\s*:/u.test(serialized)) {
    errors.push("tracked pack contains source-bearing fields");
  }
  return errors;
}

export async function buildCorpusReferencePack(options = {}) {
  const sourcePath = resolve(options.sourcePath ?? defaultSource);
  const analysisDir = resolve(options.analysisDir ?? defaultAnalysis);
  const source = await readFile(sourcePath, "utf8");
  const sourceReceipt = JSON.parse(
    await readFile(join(analysisDir, "source_receipt.json"), "utf8"),
  );
  const sourceSha256 = sha256(source);
  if (sourceSha256 !== sourceReceipt.sourceSha256) {
    throw new Error(`source SHA mismatch: ${sourceSha256}`);
  }

  const chapters = parseMarkedCorpus(source);
  if (chapters.length !== EXPECTED_CHAPTERS || chapters.some((chapter) => !chapter.prose)) {
    throw new Error(`expected ${EXPECTED_CHAPTERS} non-empty chapters, found ${chapters.length}`);
  }

  const chapterRows = rowsAsObjects(
    parseCsv(await readFile(join(analysisDir, "chapter_map.csv"), "utf8")),
  );
  const arcs = rowsAsObjects(
    parseCsv(await readFile(join(analysisDir, "arc_map.csv"), "utf8")),
  );
  if (chapterRows.length !== EXPECTED_CHAPTERS) {
    throw new Error(`expected ${EXPECTED_CHAPTERS} chapter rows, found ${chapterRows.length}`);
  }
  if (arcs.length !== EXPECTED_ARCS) {
    throw new Error(`expected ${EXPECTED_ARCS} Gold Arcs, found ${arcs.length}`);
  }
  const managerQa = await readFile(join(analysisDir, "manager_final_qa.md"), "utf8");
  if (!managerQa.includes("최종 판정 PASS") || !managerQa.includes("관리자 rubric 15/15")) {
    throw new Error("Gold manager QA is not approved");
  }

  const storyIndex = chapters.map((chapter, index) => {
    const evidence = chapterRows[index];
    if (Number(evidence.sequence) !== chapter.sequence) {
      throw new Error(`chapter map sequence mismatch at ${chapter.sequence}`);
    }
    return {
      sequence: chapter.sequence,
      visibleLabel: evidence.visible_label,
      title: evidence.title,
      arcId: evidence.arc_id,
      sourceLineRange: {
        start: Number(evidence.start_line),
        end: Number(evidence.end_line),
      },
      sourceCharacterRange: {
        start: chapter.startOffset,
        end: chapter.endOffset,
      },
      marker: chapter.marker,
      functions: {
        entryState: evidence.entry_state,
        readerPromise: evidence.reader_promise,
        protagonistGoal: evidence.protagonist_goal,
        action: evidence.action,
        resistanceOrCost: evidence.resistance_or_cost,
        turnOrReveal: evidence.turn_or_reveal,
        paidReward: evidence.paid_reward,
        stateChange: evidence.state_change,
        endingHook: evidence.ending_hook,
      },
      surfaceRefs: {
        peopleAndPlaces: findArcForSequence(arcs, chapter.sequence)?.main_characters ?? "",
        locations: findArcForSequence(arcs, chapter.sequence)?.main_locations ?? "",
      },
      rawProseSha256: sha256(chapter.prose),
    };
  });

  const phases = [];
  const styleSamples = [];
  for (let index = 0; index < PHASE_COUNT; index += 1) {
    const start = Math.floor((chapters.length * index) / PHASE_COUNT) + 1;
    const end = index === PHASE_COUNT - 1
      ? chapters.length
      : Math.floor((chapters.length * (index + 1)) / PHASE_COUNT);
    const phaseSamples = sampleForPhase(arcs, start, end);
    for (const sample of phaseSamples) {
      const chapter = chapters[sample.sequence - 1];
      styleSamples.push({
        id: `phase-${index + 1}-${sample.position}-${sample.sequence}`,
        phaseId: `phase-${index + 1}`,
        function: sample.position,
        sequence: sample.sequence,
        arcId: sample.arcId,
        rawProseSha256: sha256(chapter.prose),
        prose: chapter.prose,
      });
    }
    phases.push({
      phaseId: `phase-${index + 1}`,
      progressRange: {
        start: round(index / PHASE_COUNT, 1),
        end: round((index + 1) / PHASE_COUNT, 1),
      },
      sourceChapterRange: { start, end },
      metrics: analyzeKoreanStyle(
        chapters.slice(start - 1, end).map((chapter) => chapter.prose).join("\n\n"),
      ),
      styleSampleIds: styleSamples.slice(index * 3, (index + 1) * 3).map((sample) => sample.id),
    });
  }

  const storyIndexText = linesToJsonl(storyIndex);
  const styleExamplesText = linesToJsonl(styleSamples);
  const privateIndex = {
    version: 1,
    kind: "private-reference-input-index",
    packId: "doksik-chaebol3-ko-v1",
    sourceSha256,
    storyIndex: {
      file: "story-index.jsonl",
      sha256: sha256(storyIndexText),
      count: storyIndex.length,
    },
    styleExamples: {
      file: "style-examples.jsonl",
      sha256: sha256(styleExamplesText),
      count: styleSamples.length,
    },
  };
  const privateIndexText = `${JSON.stringify(privateIndex, null, 2)}\n`;

  const pack = {
    version: 1,
    kind: "reference-transformation-pack",
    id: "doksik-chaebol3-ko-v1",
    language: "ko",
    source: {
      workSlug: "doksik-chaebol3",
      workTitle: sourceReceipt.title,
      sourceSha256,
      chapterCount: chapters.length,
      naturalArcCount: arcs.length,
      goldStatus: "manager-qa-15-of-15-pass",
    },
    privateInputs: {
      storyIndexSha256: privateIndex.storyIndex.sha256,
      styleExamplesSha256: privateIndex.styleExamples.sha256,
      privateIndexSha256: sha256(privateIndexText),
    },
    storyRetrieval: {
      indexedChapterCount: storyIndex.length,
      defaultMappedChapterLimit: 3,
      authority: ["reference_transformation", "arc_map", "chapter_map", "raw_source"],
    },
    styleRetrieval: {
      method: "five-phases-times-entry-escalation-payoff",
      sampleCount: styleSamples.length,
      samples: styleSamples.map(({ id, phaseId, function: sceneFunction, sequence, arcId, rawProseSha256 }) => ({
        id,
        phaseId,
        function: sceneFunction,
        sequence,
        arcId,
        rawProseSha256,
      })),
      defaultSampleLimit: 3,
      hilRetrySampleLimit: 5,
    },
    transformationPolicy: {
      requiredSpineReference: true,
      reusableLayers: [
        "event-order",
        "character-role",
        "pressure",
        "reversal",
        "payoff-ladder",
        "scene-function",
        "hook",
      ],
      selectableSurfaceVariation: [
        "people",
        "organization",
        "object",
        "location",
        "local-cause",
        "number",
        "scene-dressing",
      ],
      linkedConsequences: ["money", "evidence", "procedure", "role", "result"],
    },
    commercialPolicy: {
      priority: [
        "commerciality",
        "reference-engine-retention",
        "style-fidelity",
        "noncritical-consistency",
      ],
      similarityPenalty: false,
      minimumDistanceScore: null,
      automaticRewriteForOverlap: false,
      humanPolishDecision: true,
    },
    corpusMetrics: analyzeKoreanStyle(chapters.map((chapter) => chapter.prose).join("\n\n")),
    phases,
  };
  const errors = validateReferencePack(pack);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  return {
    pack,
    privateIndex,
    privateIndexText,
    storyIndex,
    storyIndexText,
    styleSamples,
    styleExamplesText,
    sourcePath,
    analysisDir,
  };
}

export async function writeCorpusReferencePack(options = {}) {
  const trackedOutputDir = resolve(options.trackedOutputDir ?? defaultTrackedOutput);
  const privateOutputDir = resolve(options.privateOutputDir ?? defaultPrivateOutput);
  const built = await buildCorpusReferencePack(options);
  await mkdir(trackedOutputDir, { recursive: true });
  await mkdir(privateOutputDir, { recursive: true });

  const packText = `${JSON.stringify(built.pack, null, 2)}\n`;
  await writeFile(join(trackedOutputDir, "reference-pack.json"), packText, "utf8");
  await writeFile(join(privateOutputDir, "story-index.jsonl"), built.storyIndexText, "utf8");
  await writeFile(join(privateOutputDir, "style-examples.jsonl"), built.styleExamplesText, "utf8");
  await writeFile(join(privateOutputDir, "index.json"), built.privateIndexText, "utf8");

  const receipt = {
    version: 1,
    kind: "reference-transformation-pack-receipt",
    packId: built.pack.id,
    packSha256: sha256(packText),
    sourceSha256: built.pack.source.sourceSha256,
    sourcePath: relative(repoRoot, built.sourcePath),
    analysisPath: relative(repoRoot, built.analysisDir),
    chapterCount: built.pack.source.chapterCount,
    naturalArcCount: built.pack.source.naturalArcCount,
    storyIndexCount: built.storyIndex.length,
    storyIndexSha256: built.privateIndex.storyIndex.sha256,
    styleExampleCount: built.styleSamples.length,
    styleExamplesSha256: built.privateIndex.styleExamples.sha256,
    privateIndexSha256: built.pack.privateInputs.privateIndexSha256,
    generatedAt: new Date().toISOString(),
  };
  await writeFile(join(trackedOutputDir, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return { ...built, receipt, trackedOutputDir, privateOutputDir };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--source" && value) options.sourcePath = value;
    else if (key === "--analysis" && value) options.analysisDir = value;
    else if (key === "--tracked-output" && value) options.trackedOutputDir = value;
    else if (key === "--private-output" && value) options.privateOutputDir = value;
    else continue;
    index += 1;
  }
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await writeCorpusReferencePack(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify({
      packId: result.pack.id,
      packSha256: result.receipt.packSha256,
      chapterCount: result.pack.source.chapterCount,
      naturalArcCount: result.pack.source.naturalArcCount,
      storyIndexCount: result.storyIndex.length,
      styleExampleCount: result.styleSamples.length,
      trackedOutputDir: relative(repoRoot, result.trackedOutputDir),
      privateOutputDir: relative(repoRoot, result.privateOutputDir),
    }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
