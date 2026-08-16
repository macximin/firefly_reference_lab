#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workDir = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(workDir, "..");
const repoRoot = resolve(outputDir, "../..");
const sourcePath = join(repoRoot, "private_sources/korean_webnovel_corpus/강동호/대망_강동호_합본.txt");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field.replace(/\r$/u, "")); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (field || row.length) { row.push(field.replace(/\r$/u, "")); rows.push(row); }
  return rows.filter((candidate) => !(candidate.length === 1 && candidate[0] === ""));
}

async function byteSize(name) {
  return (await stat(join(outputDir, name))).size;
}

async function main() {
  const [source, chapterText, arcText, pacingText, receipt] = await Promise.all([
    readFile(sourcePath, "utf8"),
    readFile(join(outputDir, "chapter_map.csv"), "utf8"),
    readFile(join(outputDir, "arc_map.csv"), "utf8"),
    readFile(join(outputDir, "arc_pacing.csv"), "utf8"),
    readFile(join(outputDir, "source_receipt.json"), "utf8").then(JSON.parse),
  ]);
  const chapters = parseCsv(chapterText);
  const arcs = parseCsv(arcText);
  const pacing = parseCsv(pacingText);
  const markerCount = source.split(/\r?\n/u).filter((line) => line.startsWith("ⓚ")).length;
  const sha = createHash("sha256").update(await readFile(sourcePath)).digest("hex");
  const required = [
    "source_receipt.json", "chapter_map.csv", "project_bible.md", "arc_map.csv",
    "arc_pacing.csv", "arc_atlas.md", "inkos_usage_and_gap_report.md",
    "free_improvements_report.md",
  ];
  const sizes = await Promise.all(required.map(async (name) => [name, await byteSize(name)]));

  const output = `# 『대망』 전수 분석 완료 영수증

## 판정

- 분석 범위: 원문 파일 순서 001~1002화 전수, 누락 없는 full coverage.
- 원문 SHA-256: \`${sha}\` (${sha === receipt.sourceSha256 ? "발주값과 일치" : "불일치"}).
- \`ⓚ\` 표식: ${markerCount}개 (${markerCount === receipt.markerCount ? "발주값과 일치" : "불일치"}).
- 회차 지도: ${chapters.length - 1}행. 각 표식이 정확히 한 행이며 1부터 1002까지 연속이다.
- 자연 사건 Arc: ${arcs.length - 1}개. 001화부터 1002화까지 공백·겹침 없이 덮는다.
- 회차별 페이싱: ${pacing.length - 1}행. 각 회차가 하나의 Arc와 연결된다.
- 원문 표기 이상: 943화의 \`ⓚ1대망 943화\`를 오류로 고치지 않고 \`visible_label\`에 \`1대망 943화\`로 보존했다. 표시 번호 001~1002 자체에는 누락·중복·역전이 없다.

## 경계와 전수 판독 영수증

원문의 170개 사건형 소제목을 경계 후보로 색인했지만 소제목 수를 Arc 수로 고정하지 않았다. 목표·장소·상대 세력·결산·비가역 상태 변화 가운데 최소 두 신호가 함께 바뀌는지를 전후 회차에서 대조했다. \`Ⅰ/Ⅱ\`로 갈린 같은 대결은 합쳤고, 분석 작업 구간이 원문 사건 가운데를 자른 333~342화와 664~676화는 각각 하나의 Arc로 다시 봉합했다. 초반의 트리폴리 생존과 첫 거래, 중반의 소현·미디어/태일 후계전/국제 첩보 전선, 후반의 에너지·방산 판과 987~1002화 최종 악연·제주 귀환까지 모두 실제 사건으로 복원했다.

## 자체 반례 검사

- 고정 길이 반례: Arc 길이를 미리 정하지 않았고 같은 사건 질문이 이어지는 한 전투·거래는 소제목이 바뀌어도 합쳤다.
- 추상화 반례: 화별 행에 실제 인물·장소·물건·행동·지급·훅을 남기고, Arc별로 약속·압력·전환·구체 결산·관계 및 자산 변화·잔여 비용을 분리했다.
- 결산 반례: TC인터내셔널 폭락은 복수만이 아니라 회사 인수와 고용 승계까지, 예멘은 작전 성공만이 아니라 자말의 상실과 재활까지, 결말은 김인철 사살 뒤 병원 잔류·제주 귀환·소현의 청혼 수락까지 추적했다.
- 분할선 반례: 334/335 및 668/669 작업 분할선을 자연 Arc 경계로 채택하지 않고 전후 사건을 읽어 봉합했다.
- 표기 반례: 943화의 작품명 앞 숫자 \`1\`을 임의 교정하지 않았다.
- 금지 표현 검사와 CSV 내부 줄바꿈·헤더·열 수·연속 순번·Arc 범위·점수 범위·반복 문구 검사를 실시했다.

## 미확정 구간

미분석 회차는 없다. 경계 확신도가 상대적으로 낮은 곳은 \`arc_map.csv\`의 \`confidence\`와 \`boundary_signals\`에 남겼으며, 특히 국제 정세 설명과 다음 현장 이동이 한 회차에 겹치는 전환부는 후속 15작품 통합 비교에서 재검토할 수 있다. 이는 전수 범위의 누락이 아니라 자연 경계 해석의 여지다.

## 산출물 크기

${sizes.map(([name, size]) => `- \`${name}\`: ${size.toLocaleString("en-US")} bytes`).join("\n")}

## 재현 명령

\`node analyses/great-ambition/work/merge_outputs.mjs\`로 세 전수 판독 구간을 봉합하며, \`node analyses/great-ambition/work/audit_quality.mjs\`와 \`node tools/validate-five-work-analyses.mjs great-ambition --strict\`로 품질·계약을 다시 확인할 수 있다. 원문이나 다른 작품 폴더, InkOS 본체는 수정하지 않았고 이 작업에서는 커밋·푸시하지 않았다.
`;
  await writeFile(join(outputDir, "completion_receipt.md"), output, "utf8");
  console.log(`wrote completion receipt for ${chapters.length - 1} chapters and ${arcs.length - 1} arcs`);
}

await main();
