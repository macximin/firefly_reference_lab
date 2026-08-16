#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(
  here,
  "../../../../private_sources/korean_webnovel_corpus/강동호/효종_강동호_합본.txt",
);
const outputPath = resolve(here, "source_index.json");
const rawSource = await readFile(sourcePath, "utf8");
const lines = rawSource.split(/\r?\n/u);
if (lines.at(-1) === "") lines.pop();
const starts = [];

for (const [index, line] of lines.entries()) {
  if (!line.startsWith("ⓚ")) continue;
  const match = /^ⓚ효종\s+(\d+)화$/u.exec(line.trim());
  if (!match) throw new Error(`Unrecognized marker at line ${index + 1}: ${line}`);
  starts.push({ lineIndex: index, visibleNumber: Number(match[1]), visibleLabel: line.trim() });
}

const chapters = starts.map((marker, index) => {
  const endLineIndex = (starts[index + 1]?.lineIndex ?? lines.length) - 1;
  const body = lines.slice(marker.lineIndex + 1, endLineIndex + 1);
  const subtitle = body
    .map((line) => line.trim())
    .find((line) => line.startsWith("* "))
    ?.slice(2)
    .trim() ?? "";
  return {
    sequence: index + 1,
    visibleLabel: marker.visibleLabel,
    visibleNumber: marker.visibleNumber,
    title: subtitle,
    startLine: marker.lineIndex + 1,
    endLine: endLineIndex + 1,
    characterCount: body.join("\n").length,
    sceneBreakCount: body.filter((line) => line.trim() === "***").length,
  };
});

const numberingMismatches = chapters
  .filter((chapter) => chapter.sequence !== chapter.visibleNumber)
  .map((chapter) => ({ sequence: chapter.sequence, visibleNumber: chapter.visibleNumber }));

await writeFile(outputPath, `${JSON.stringify({
  sourcePath,
  lineCount: lines.length,
  markerCount: chapters.length,
  numberingMismatches,
  chapters,
}, null, 2)}\n`, "utf8");

console.log(`Wrote ${chapters.length} chapter records to ${outputPath}`);
