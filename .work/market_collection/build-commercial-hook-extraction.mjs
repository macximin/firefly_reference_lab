import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";
import { commercialHookAnnotations } from "./commercial-hook-annotations.mjs";

const workDir = "/Users/a2501/Desktop/firefly_studio/edge_repos/firefly_reference_lab/.work/market_collection";
const outputDir = "/Users/a2501/Desktop/firefly_studio/edge_repos/firefly_reference_lab/outputs/019ff69d-4e2d-7230-ad52-0aebaaa527b1";
const outputPath = path.join(outputDir, "webnovel-commercial-hook-extraction-100.xlsx");
const previewDir = path.join(workDir, "commercial-hook-previews");
const payload = JSON.parse(await fs.readFile(path.join(workDir, "platform-sample-100.json"), "utf8"));
const maleGenres = new Set(["판타지", "현대판타지", "현판", "무협"]);

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const annotationByKey = new Map(commercialHookAnnotations.map((row) => [row.key, row]));
const enriched = payload.rows.map((row, index) => {
  const key = `${row.platform === "카카오페이지" ? "K" : "N"}${row.rank}`;
  const annotation = annotationByKey.get(key);
  if (!annotation) throw new Error(`Missing annotation: ${key}`);
  const isMale = maleGenres.has(row.genre);
  return {
    key,
    ...row,
    ...annotation,
    audience: isMale ? "남성향" : "여성향",
    male_scope: isMale ? "포함" : "제외",
    classification_rule: isMale ? "지정 남성향 장르" : "기타 장르",
    reward_primary: annotation.reward_currency.split("·")[0],
    source_url: row.product_url || row.detail_url,
    source_order: index + 1,
  };
});

const maleRows = enriched.filter((row) => row.male_scope === "포함");
const femaleRows = enriched.filter((row) => row.male_scope === "제외");

const wb = Workbook.create();
const summary = wb.worksheets.add("요약");
const extraction = wb.worksheets.add("전체100_추출");
const male = wb.worksheets.add("남성향76");
const female = wb.worksheets.add("여성향24");
const source = wb.worksheets.add("원자료100");
const method = wb.worksheets.add("분류기준");

const navy = "#17365D";
const blue = "#D9EAF7";
const pale = "#F4F7FB";
const green = "#E2F0D9";
const yellow = "#FFF2CC";
const red = "#FCE4D6";
const white = "#FFFFFF";
const gray = "#666666";

function titleBand(sheet, range, title, subtitle) {
  sheet.mergeCells(range);
  const anchor = range.split(":")[0];
  const row = Number(anchor.match(/\d+/)[0]);
  sheet.getRange(anchor).values = [[title]];
  sheet.getRange(range).format = {
    fill: navy,
    font: { name: "Aptos Display", size: 18, bold: true, color: white },
    verticalAlignment: "center",
  };
  sheet.mergeCells(`A${row + 1}:H${row + 1}`);
  sheet.getRange(`A${row + 1}`).values = [[subtitle]];
  sheet.getRange(`A${row + 1}:H${row + 1}`).format = {
    fill: pale,
    font: { name: "Aptos", size: 10, italic: true, color: gray },
    wrapText: true,
    verticalAlignment: "center",
  };
}

function styleHeader(sheet, range) {
  sheet.getRange(range).format = {
    fill: navy,
    font: { name: "Aptos", size: 10, bold: true, color: white },
    wrapText: true,
    verticalAlignment: "center",
  };
}

function lightBorders(range) {
  range.format.borders = { preset: "all", style: "thin", color: "#D9E1F2" };
}

function setWidths(sheet, widths) {
  for (const [column, width] of Object.entries(widths)) {
    sheet.getRange(`${column}:${column}`).format.columnWidth = width;
  }
}

// 요약
titleBand(
  summary,
  "A1:H1",
  "웹소설 100편 WHAT·HOW·첫 보상 약속 추출",
  "공개 제목과 작품 소개에서 독자가 결제 전에 받는 상업적 약속을 추출한 1차 편집 자료. 실제 본문 지급 여부와는 별개다."
);
summary.getRange("A4:B4").values = [["장르 기반 독자향", "작품 수"]];
styleHeader(summary, "A4:B4");
summary.getRange("A5:A6").values = [["남성향"], ["여성향"]];
summary.getRange("B5:B6").values = [
  [maleRows.length],
  [femaleRows.length],
];

summary.getRange("D4:E4").values = [["분석 범위", "작품 수"]];
styleHeader(summary, "D4:E4");
summary.getRange("D5:D6").values = [["남성향 분석군"], ["여성향 분리군"]];
summary.getRange("E5:E6").values = [
  [maleRows.length],
  [femaleRows.length],
];

summary.getRange("G4:H4").values = [["근거 확신도", "작품 수"]];
styleHeader(summary, "G4:H4");
summary.getRange("G5:G7").values = [["높음"], ["중간"], ["낮음"]];
summary.getRange("H5:H7").values = [
  [enriched.filter((row) => row.confidence === "높음").length],
  [enriched.filter((row) => row.confidence === "중간").length],
  [enriched.filter((row) => row.confidence === "낮음").length],
];

summary.getRange("A10:B10").values = [["남성향76 보상 신호", "언급 작품 수"]];
styleHeader(summary, "A10:B10");
const rewardSignals = ["생존", "성장", "인정", "권력", "부", "복수", "지위", "가족", "구원", "자유"];
summary.getRange("A11:A20").values = rewardSignals.map((item) => [item]);
summary.getRange("B11:B20").values = rewardSignals.map((item) => [
  maleRows.filter((row) => row.reward_currency.includes(item)).length,
]);
summary.getRange("A21:B21").merge();
summary.getRange("A21").values = [["복수 통화가 한 작품에 함께 등장할 수 있어 합계는 76을 넘을 수 있음"]];
summary.getRange("A21:B21").format = { fill: yellow, font: { italic: true, color: gray }, wrapText: true };

summary.getRange("D10:H10").merge();
summary.getRange("D10").values = [["1차 편집 판독"]];
styleHeader(summary, "D10:H10");
const findings = [
  ["1", "남성향 분석군 76편의 공통 중심은 거대한 설정 자체보다 주인공이 무엇을 먼저 차지하는지에 있다."],
  ["2", "HOW는 회귀 정보, 독점 능력, 상태창, 전생 전문성, 숨은 지위처럼 타인과의 격차로 제시된다."],
  ["3", "첫 보상은 생존만으로 끝나지 않고 인정·지위·부·권력 중 하나를 빠르게 붙이는 경우가 많다."],
  ["4", "독자향은 장르로만 가른다. 판타지·현대판타지·현판·무협은 남성향이며 이외 장르는 여성향이다."],
  ["5", "낮은 확신 5편은 소개글이 짧아 실제 본문을 보기 전 HOW와 지급 방식을 정본화하면 안 된다."],
];
summary.getRange("D11:H15").values = findings.map(([n, text]) => [n, text, "", "", ""]);
for (let row = 11; row <= 15; row++) summary.mergeCells(`E${row}:H${row}`);
summary.getRange("D11:D15").format = { fill: blue, font: { bold: true }, horizontalAlignment: "center" };
summary.getRange("E11:H15").format = { wrapText: true, verticalAlignment: "top" };

summary.getRange("D17:H17").merge();
summary.getRange("D17").values = [["낮은 확신 — 본문 또는 더 긴 소개가 필요한 5편"]];
styleHeader(summary, "D17:H17");
const lowRows = enriched.filter((row) => row.confidence === "낮음");
summary.getRange("D18:H22").values = lowRows.map((row) => [row.key, row.title, row.evidence_basis, row.what, row.source_url]);
summary.getRange("D18:H22").format = { wrapText: true, verticalAlignment: "top" };
lightBorders(summary.getRange("A4:B6"));
lightBorders(summary.getRange("D4:E6"));
lightBorders(summary.getRange("G4:H7"));
lightBorders(summary.getRange("A10:B21"));
lightBorders(summary.getRange("D10:H15"));
lightBorders(summary.getRange("D17:H22"));
setWidths(summary, { A: 20, B: 15, C: 3, D: 18, E: 48, F: 20, G: 20, H: 46 });
summary.getRange("1:1").format.rowHeight = 36;
summary.getRange("2:2").format.rowHeight = 36;
summary.getRange("11:15").format.rowHeight = 38;
summary.getRange("18:22").format.rowHeight = 52;
summary.freezePanes.freezeRows(3);
summary.showGridLines = false;

// 전체 100편 추출
const extractionHeaders = [
  "키", "플랫폼", "순위", "작품명", "작가", "장르", "장르 기반 독자향", "남성향 분석 범위",
  "WHAT: 주인공 목표", "HOW: 정보격차·특수성", "첫 보상 약속", "보상 통화", "1차 보상축",
  "근거 범위", "확신도", "소개글 상태", "회차 수", "플랫폼 지표", "지표 원문", "작품 소개", "상세 URL"
];
extraction.getRange("A1:U1").values = [extractionHeaders];
styleHeader(extraction, "A1:U1");
extraction.getRange("A2:U101").values = enriched.map((row) => [
  row.key, row.platform, row.rank, row.title, row.author, row.genre, row.audience, row.male_scope,
  row.what, row.how, row.first_reward, row.reward_currency, row.reward_primary,
  row.evidence_basis, row.confidence, row.synopsis_state, row.episode_count ?? "", row.metric_type,
  row.metric_display, row.synopsis, row.source_url,
]);
extraction.tables.add("A1:U101", true, "Extraction100Table");
extraction.getRange("A2:U101").format = { verticalAlignment: "top" };
extraction.getRange("I2:U101").format.wrapText = true;
extraction.getRange("C2:C101").format.numberFormat = "0";
extraction.getRange("Q2:Q101").format.numberFormat = "0";
extraction.getRange("G2:G101").conditionalFormats.addCustom('=G2="남성향"', { fill: green });
extraction.getRange("G2:G101").conditionalFormats.addCustom('=G2="여성향"', { fill: red });
extraction.getRange("O2:O101").conditionalFormats.addCustom('=O2="낮음"', { fill: red, font: { bold: true, color: "#9C0006" } });
extraction.freezePanes.freezeRows(1);
extraction.freezePanes.freezeColumns(8);
extraction.showGridLines = false;
setWidths(extraction, {
  A: 8, B: 16, C: 8, D: 34, E: 18, F: 13, G: 17, H: 15, I: 44, J: 48, K: 46,
  L: 24, M: 16, N: 17, O: 10, P: 25, Q: 10, R: 13, S: 15, T: 66, U: 48,
});
extraction.getRange("1:1").format.rowHeight = 36;
extraction.getRange("2:101").format.rowHeight = 76;

// 남성향 76편
const focusedHeaders = [
  "플랫폼", "순위", "작품명", "장르", "WHAT", "HOW", "첫 보상 약속", "보상 통화",
  "지표 종류", "지표 원문", "회차 수", "확신도", "근거 범위", "상세 URL"
];
male.getRange("A1:N1").values = [focusedHeaders];
styleHeader(male, "A1:N1");
male.getRange("A2:N77").values = maleRows.map((row) => [
  row.platform, row.rank, row.title, row.genre, row.what, row.how, row.first_reward, row.reward_currency,
  row.metric_type, row.metric_display, row.episode_count ?? "", row.confidence, row.evidence_basis, row.source_url,
]);
male.tables.add("A1:N77", true, "Male76Table");
male.getRange("E2:N77").format.wrapText = true;
male.getRange("A2:N77").format.verticalAlignment = "top";
male.getRange("L2:L77").conditionalFormats.addCustom('=L2="낮음"', { fill: red, font: { bold: true, color: "#9C0006" } });
male.freezePanes.freezeRows(1);
male.freezePanes.freezeColumns(4);
male.showGridLines = false;
setWidths(male, { A: 16, B: 8, C: 34, D: 13, E: 44, F: 48, G: 46, H: 24, I: 13, J: 15, K: 10, L: 10, M: 17, N: 48 });
male.getRange("1:1").format.rowHeight = 36;
male.getRange("2:77").format.rowHeight = 72;

// 여성향 24편
female.getRange("A1:N1").values = [focusedHeaders];
styleHeader(female, "A1:N1");
female.getRange("A2:N25").values = femaleRows.map((row) => [
  row.platform, row.rank, row.title, row.genre, row.what, row.how, row.first_reward, row.reward_currency,
  row.metric_type, row.metric_display, row.episode_count ?? "", row.confidence, row.evidence_basis, row.source_url,
]);
female.tables.add("A1:N25", true, "Female24Table");
female.getRange("A2:N25").format = { fill: red, verticalAlignment: "top", wrapText: true };
female.freezePanes.freezeRows(1);
female.freezePanes.freezeColumns(4);
female.showGridLines = false;
setWidths(female, { A: 16, B: 8, C: 34, D: 13, E: 44, F: 48, G: 46, H: 24, I: 13, J: 15, K: 10, L: 10, M: 17, N: 48 });
female.getRange("1:1").format.rowHeight = 36;
female.getRange("2:25").format.rowHeight = 78;

// 원자료 100편
const sourceHeaders = ["키", "플랫폼", "순위", "작품 ID", "작품명", "작가", "장르", "소개글 상태", "작품 소개", "상세 URL"];
source.getRange("A1:J1").values = [sourceHeaders];
styleHeader(source, "A1:J1");
source.getRange("A2:J101").values = enriched.map((row) => [
  row.key, row.platform, row.rank, row.product_id, row.title, row.author, row.genre, row.synopsis_state, row.synopsis, row.source_url,
]);
source.tables.add("A1:J101", true, "Source100Table");
source.getRange("A2:J101").format.verticalAlignment = "top";
source.getRange("H2:J101").format.wrapText = true;
source.freezePanes.freezeRows(1);
source.freezePanes.freezeColumns(5);
source.showGridLines = false;
setWidths(source, { A: 8, B: 16, C: 8, D: 14, E: 36, F: 18, G: 13, H: 26, I: 78, J: 48 });
source.getRange("1:1").format.rowHeight = 36;
source.getRange("2:101").format.rowHeight = 86;

// 분류 기준
titleBand(
  method,
  "A1:F1",
  "추출·분류 기준",
  "독자향은 장르 단일 규칙으로 분류한다. 판타지·현대판타지·현판·무협은 남성향, 이외 장르는 여성향이다."
);
method.getRange("A4:C4").values = [["필드", "정의", "판정 규칙"]];
styleHeader(method, "A4:C4");
method.getRange("A5:C10").values = [
  ["남성향", "남성향 분석에 넣을 작품", "장르가 판타지·현대판타지·현판·무협 중 하나"],
  ["여성향", "남성향 분석에서 분리할 작품", "위 4개 이외의 모든 장르. 장르 미상도 여성향으로 분류"],
  ["WHAT", "주인공이 얻거나 바꾸려는 구체적 결과", "생존·복수·돈·가문·졸업·재건처럼 독자가 진행 방향을 예상할 수 있어야 함"],
  ["HOW", "주인공만 가진 정보격차·능력·지위·경험", "소개글에 없으면 미공개라고 적고 제목에서 능력을 창작하지 않음"],
  ["첫 보상 약속", "소개글이 가장 먼저 기대시키는 가시적 만족", "실제 본문 지급 영수증이 아니라 결제 전 약속이며 인정·부·지위·생존·관계 등으로 표현"],
  ["확신도", "소개글만으로 추출이 얼마나 안정적인지", "높음=세 요소가 명시, 중간=일부 암시, 낮음=제목 중심 또는 제한된 소개"],
];
method.getRange("A13:C13").values = [["자료 상태", "값", "의미"]];
styleHeader(method, "A13:C13");
method.getRange("A14:C18").values = [
  ["전체 작품", 100, "카카오 50 + 네이버 50"],
  ["전문 소개글", 99, "공개 상세 화면에서 더보기까지 펼쳐 수집"],
  ["제한 랭킹 소개", 1, "네이버 19세 제한 1편은 랭킹 소개만 보존"],
  ["남성향 분석군", 76, "남성향76 시트"],
  ["여성향 분리군", 24, "여성향24 시트"],
];
method.getRange("A21:C21").values = [["한계", "", ""]];
method.mergeCells("A21:C21");
styleHeader(method, "A21:C21");
method.getRange("A22:C25").values = [
  ["1", "소개글은 판매 문구이므로 실제 Arc 구조와 지급 속도를 증명하지 않는다.", ""],
  ["2", "이번 표본은 지정 시점 전체 장르 상위 50편씩이며 남성향 카테고리 전체 모집단이 아니다.", ""],
  ["3", "플랫폼 열람자와 다운로드는 서로 다른 지표라 합산하거나 점수화하지 않는다.", ""],
  ["4", "실제 전용 Arc 설계서로 승격하려면 원문 회차에서 약속→지급→다음 압력의 장면 영수증을 다시 확인한다.", ""],
];
for (let row = 22; row <= 25; row++) method.mergeCells(`B${row}:C${row}`);
method.getRange("A4:C25").format = { verticalAlignment: "top", wrapText: true };
method.getRange("A22:A25").format = { fill: blue, font: { bold: true }, horizontalAlignment: "center" };
lightBorders(method.getRange("A4:C10"));
lightBorders(method.getRange("A13:C18"));
lightBorders(method.getRange("A21:C25"));
setWidths(method, { A: 22, B: 56, C: 62, D: 4, E: 4, F: 4 });
method.getRange("1:1").format.rowHeight = 36;
method.getRange("2:2").format.rowHeight = 34;
method.getRange("5:10").format.rowHeight = 60;
method.getRange("22:25").format.rowHeight = 42;
method.freezePanes.freezeRows(3);
method.showGridLines = false;

const previews = [
  ["요약", "A1:H22", "summary.png", 1],
  ["전체100_추출", "A1:U10", "extraction.png", 0.75],
  ["남성향76", "A1:N10", "male76.png", 0.85],
  ["여성향24", "A1:N10", "female24.png", 0.9],
  ["원자료100", "A1:J8", "source100.png", 0.9],
  ["분류기준", "A1:F25", "method.png", 1],
];
for (const [sheetName, range, fileName, scale] of previews) {
  const image = await wb.render({ sheetName, range, scale, format: "png" });
  await fs.writeFile(path.join(previewDir, fileName), new Uint8Array(await image.arrayBuffer()));
}

const keyCheck = wb.inspect({ kind: "table", range: "요약!A4:H22", include: "values,formulas", tableMaxRows: 25, tableMaxCols: 10 });
const sampleCheck = wb.inspect({ kind: "table", range: "전체100_추출!A1:U8", include: "values,formulas", tableMaxRows: 10, tableMaxCols: 25 });
const errors = wb.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});

const xlsx = await SpreadsheetFile.exportXlsx(wb);
await xlsx.save(outputPath);

console.log(JSON.stringify({
  outputPath,
  previewDir,
  counts: {
    total: enriched.length,
    male: maleRows.length,
    female: femaleRows.length,
    lowConfidence: lowRows.length,
    fullSynopsis: enriched.filter((row) => row.synopsis_state === "full_public_detail").length,
  },
  keyCheck,
  sampleCheck,
  errors,
}, null, 2));
