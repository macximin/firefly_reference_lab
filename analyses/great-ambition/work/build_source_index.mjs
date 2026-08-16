import { readFile, writeFile } from "node:fs/promises";

const sourcePath = new URL("../../../private_sources/korean_webnovel_corpus/%EA%B0%95%EB%8F%99%ED%98%B8/%EB%8C%80%EB%A7%9D_%EA%B0%95%EB%8F%99%ED%98%B8_%ED%95%A9%EB%B3%B8.txt", import.meta.url);
const outputPath = new URL("./source_section_index.csv", import.meta.url);
const lines = (await readFile(sourcePath, "utf8")).split(/\r?\n/u);
const markers = [];
const sections = [];
let sequence = 0;

for (let index = 0; index < lines.length; index += 1) {
  if (lines[index].startsWith("ⓚ")) {
    sequence += 1;
    markers.push({ sequence, visibleLabel: lines[index], startLine: index + 1 });
  }
  if (lines[index].startsWith("#")) {
    sections.push({ sequence, title: lines[index].slice(1).trim(), titleLine: index + 1 });
  }
}

const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
const rows = ["section_sequence,section_title,title_line,start_sequence,end_sequence,start_label,end_label,episode_count"];
for (let index = 0; index < sections.length; index += 1) {
  const section = sections[index];
  const next = sections[index + 1];
  const start = section.sequence;
  const end = next ? next.sequence - 1 : markers.length;
  rows.push([
    index + 1,
    quote(section.title),
    section.titleLine,
    start,
    end,
    quote(markers[start - 1].visibleLabel),
    quote(markers[end - 1].visibleLabel),
    end - start + 1,
  ].join(","));
}

await writeFile(outputPath, `${rows.join("\n")}\n`, "utf8");
console.log(`indexed ${markers.length} chapters and ${sections.length} source sections`);
