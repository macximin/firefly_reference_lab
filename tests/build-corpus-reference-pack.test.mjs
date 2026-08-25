import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeKoreanStyle,
  buildCorpusReferencePack,
  parseMarkedCorpus,
  validateReferencePack,
} from "../tools/build-corpus-reference-pack.mjs";

test("parses marked chapters and retains raw source ranges", () => {
  const chapters = parseMarkedCorpus("ⓚ1화. 시작\n첫 문장.\n\n둘째 문장.\nⓚ2. 다음\n다음 문장.");
  assert.equal(chapters.length, 2);
  assert.equal(chapters[0].sequence, 1);
  assert.equal(chapters[0].marker, "ⓚ1화. 시작");
  assert.equal(chapters[0].prose, "첫 문장.\n\n둘째 문장.");
  assert.equal(chapters[1].prose, "다음 문장.");
  assert.ok(chapters[1].startOffset > chapters[0].startOffset);
});

test("Korean style metrics are normalized and do not expose opening tokens", () => {
  const profile = analyzeKoreanStyle("그는 문을 열었다.\n\n“지금 갑시다.”\n\n손이 잠깐 멈췄다?");
  assert.ok(profile.sentenceLength.mean > 0);
  assert.ok(profile.dialogueParagraphRatio > 0);
  assert.ok(profile.lexicalDiversityMattr200 > 0);
  assert.equal(Object.hasOwn(profile, "topPatterns"), false);
});

test("builds full story retrieval plus actual private style examples", async () => {
  const result = await buildCorpusReferencePack();
  assert.deepEqual(validateReferencePack(result.pack), []);
  assert.equal(result.pack.source.chapterCount, 751);
  assert.equal(result.pack.source.naturalArcCount, 131);
  assert.equal(result.storyIndex.length, 751);
  assert.equal(result.styleSamples.length, 15);
  assert.equal(result.pack.storyRetrieval.indexedChapterCount, 751);
  assert.equal(result.pack.commercialPolicy.similarityPenalty, false);
  assert.equal(result.pack.commercialPolicy.minimumDistanceScore, null);
  assert.equal(JSON.stringify(result.pack).includes('"prose"'), false);
  assert.ok(result.styleSamples.every((sample) => sample.prose.length > 100));
  assert.ok(result.storyIndex.every((entry) => entry.rawProseSha256.length === 64));
  assert.equal(result.privateIndex.storyIndex.count, 751);
  assert.equal(result.privateIndex.styleExamples.count, 15);
});

test("tracked pack rejects source-bearing fields and distance gates", async () => {
  const { pack } = await buildCorpusReferencePack();
  assert.match(
    validateReferencePack({ ...pack, prose: "원문" }).join("\n"),
    /source-bearing/,
  );
  assert.match(
    validateReferencePack({
      ...pack,
      commercialPolicy: { ...pack.commercialPolicy, minimumDistanceScore: 0.3 },
    }).join("\n"),
    /minimum distance/,
  );
});
