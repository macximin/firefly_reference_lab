import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const workDir = "/Users/a2501/Desktop/inkos/edge_repos/inkos_reverse_lab/.work/market_collection";
const outputDir = "/Users/a2501/Desktop/inkos/edge_repos/inkos_reverse_lab/outputs/019ff69d-4e2d-7230-ad52-0aebaaa527b1";
const inputPath = path.join(workDir, "platform-sample-100.json");
const outputPath = path.join(outputDir, "webnovel-platform-sample-100.xlsx");
const previewDir = path.join(workDir, "previews");

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const payload = JSON.parse(await fs.readFile(inputPath, "utf8"));
const rows = payload.rows;
const receipt = payload.receipt;

const wb = Workbook.create();
const summary = wb.worksheets.add("요약");
const works = wb.worksheets.add("작품100");
const platform = wb.worksheets.add("플랫폼정보");
const receiptSheet = wb.worksheets.add("수집영수증");

const navy = "#17365D";
const blue = "#D9EAF7";
const pale = "#F4F7FB";
const yellow = "#FFF2CC";
const red = "#FCE4D6";
const green = "#E2F0D9";
const white = "#FFFFFF";
const gray = "#666666";

function titleBand(sheet, range, title, subtitle) {
  sheet.mergeCells(range);
  const topLeft = range.split(":")[0];
  sheet.getRange(topLeft).values = [[title]];
  sheet.getRange(range).format = {
    fill: navy,
    font: { bold: true, color: white, size: 18 },
    verticalAlignment: "center",
  };
  const row = Number(topLeft.match(/\d+/)[0]) + 1;
  sheet.getRange(`A${row}`).values = [[subtitle]];
  sheet.getRange(`A${row}:H${row}`).merge();
  sheet.getRange(`A${row}:H${row}`).format = {
    fill: pale,
    font: { color: gray, italic: true },
    wrapText: true,
  };
}

function styleHeader(range) {
  range.format = {
    fill: navy,
    font: { bold: true, color: white },
    verticalAlignment: "center",
    wrapText: true,
  };
}

function styleBorders(range) {
  range.format.borders = {
    top: { style: "continuous", color: "#D9E1F2" },
    bottom: { style: "continuous", color: "#D9E1F2" },
    left: { style: "continuous", color: "#D9E1F2" },
    right: { style: "continuous", color: "#D9E1F2" },
    insideHorizontal: { style: "continuous", color: "#E7E6E6" },
    insideVertical: { style: "continuous", color: "#E7E6E6" },
  };
}

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item) || "미상";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"));
}

// 요약
titleBand(
  summary,
  "A1:H1",
  "카카오페이지·네이버 시리즈 웹소설 100편 시장 표본",
  "공개 랭킹과 작품 상세 화면을 수집한 시점 표본. 두 플랫폼의 지표 정의가 달라 합산하지 않음."
);
summary.getRange("A4:C4").values = [["플랫폼", "표본 수", "플랫폼 지표"]];
styleHeader(summary.getRange("A4:C4"));
summary.getRange("A5:C6").values = [
  ["카카오페이지", null, "열람자"],
  ["네이버 시리즈", null, "다운로드"],
];
summary.getRange("B5").formulas = [["=COUNTIF('작품100'!A2:A101,A5)"]];
summary.getRange("B6").formulas = [["=COUNTIF('작품100'!A2:A101,A6)"]];
summary.getRange("A8:B8").values = [["검증 항목", "결과"]];
styleHeader(summary.getRange("A8:B8"));
summary.getRange("A9:A13").values = [
  ["전체 행"],
  ["소개글 공란"],
  ["플랫폼 지표 공란"],
  ["연령 제한 상세"],
  ["플랫폼+작품ID 중복"],
];
summary.getRange("B9").formulas = [["=COUNTA('작품100'!A2:A101)"]];
summary.getRange("B10").formulas = [["=COUNTBLANK('작품100'!U2:U101)"]];
summary.getRange("B11").formulas = [["=COUNTBLANK('작품100'!O2:O101)"]];
summary.getRange("B12").formulas = [["=COUNTIF('작품100'!Y2:Y101,\"<>public\")"]];
summary.getRange("B13").values = [[0]];
summary.getRange("D4:E4").values = [["장르", "100편 내 작품 수"]];
styleHeader(summary.getRange("D4:E4"));
const genreCounts = countBy(rows, (row) => row.genre);
summary.getRange(`D5:E${4 + Math.min(12, genreCounts.length)}`).values = genreCounts.slice(0, 12);
summary.getRange("A16:H16").values = [["해석 원칙", "", "", "", "", "", "", ""]];
summary.mergeCells("A16:H16");
styleHeader(summary.getRange("A16:H16"));
summary.getRange("A17:H20").values = [
  ["1", "카카오 열람자와 네이버 다운로드는 같은 지표가 아니다.", "", "", "", "", "", ""],
  ["2", "랭킹은 수집 시점의 노출면 표본이며 장기 흥행 순위를 뜻하지 않는다.", "", "", "", "", "", ""],
  ["3", "회차 수·무료 행사·독점·연령 제한을 함께 봐야 소개글과 소재의 상업성을 해석할 수 있다.", "", "", "", "", "", ""],
  ["4", "연령 제한 작품은 공개 범위를 우회하지 않아 일부 상세 필드가 비어 있다.", "", "", "", "", "", ""],
];
for (let r = 17; r <= 20; r++) summary.mergeCells(`B${r}:H${r}`);
summary.getRange("A17:A20").format = { fill: blue, font: { bold: true }, horizontalAlignment: "center" };
summary.getRange("B17:H20").format = { wrapText: true, verticalAlignment: "top" };
summary.getRange("A1:H20").format.rowHeight = 22;
summary.getRange("A1:H1").format.rowHeight = 34;
summary.getRange("A2:H2").format.rowHeight = 34;
summary.getRange("A:A").format.columnWidth = 22;
summary.getRange("B:B").format.columnWidth = 18;
summary.getRange("C:C").format.columnWidth = 18;
summary.getRange("D:D").format.columnWidth = 24;
summary.getRange("E:E").format.columnWidth = 16;
summary.getRange("F:H").format.columnWidth = 14;
styleBorders(summary.getRange("A4:E13"));
styleBorders(summary.getRange("A16:H20"));
summary.freezePanes.freezeRows(3);

// 100편 원자료
const headers = [
  "플랫폼", "랭킹 면", "랭킹 기준/수집 시각", "순위", "순위 변동", "작품 ID", "작품명", "작가", "장르",
  "회차 수", "연재 상태/주기", "평점", "지표 종류", "지표 원문", "지표 정규화", "댓글 수 정규화", "프로모션 표지",
  "무료 행사", "연재 주기", "키워드", "작품 소개", "출판사", "연령 등급", "가격", "접근 상태", "작품 URL", "상세 URL"
];
const fieldOrder = [
  "platform", "ranking_surface", "ranking_snapshot", "rank", "rank_change", "product_id", "title", "author", "genre",
  "episode_count", "serialization_status", "rating", "metric_type", "metric_display", "metric_count", "comment_count", "promotion_badges",
  "free_offer", "schedule", "keywords", "synopsis", "publisher", "age_rating", "price", "access_state", "product_url", "detail_url"
];
works.getRange("A1:AA1").values = [headers];
styleHeader(works.getRange("A1:AA1"));
works.getRange(`A2:AA${rows.length + 1}`).values = rows.map((row) => fieldOrder.map((key) => row[key] ?? ""));
works.getRange(`A2:AA${rows.length + 1}`).format = { verticalAlignment: "top" };
works.getRange(`Q2:U${rows.length + 1}`).format.wrapText = true;
works.getRange(`Z2:AA${rows.length + 1}`).format.wrapText = true;
works.getRange(`D2:D${rows.length + 1}`).format.numberFormat = "0";
works.getRange(`J2:J${rows.length + 1}`).format.numberFormat = "0";
works.getRange(`L2:L${rows.length + 1}`).format.numberFormat = "0.0";
works.getRange(`O2:P${rows.length + 1}`).format.numberFormat = "#,##0";
works.getRange(`A2:A${rows.length + 1}`).conditionalFormats.addCustom("=A2=\"카카오페이지\"", { fill: "#FFF2CC" });
works.getRange(`A2:A${rows.length + 1}`).conditionalFormats.addCustom("=A2=\"네이버 시리즈\"", { fill: "#E2F0D9" });
works.getRange(`Y2:Y${rows.length + 1}`).conditionalFormats.addCustom("=Y2<>\"public\"", { fill: red, font: { bold: true, color: "#9C0006" } });
works.tables.add(`A1:AA${rows.length + 1}`, true, "Works100Table");
works.freezePanes.freezeRows(1);
works.freezePanes.freezeColumns(7);
const widths = {
  A: 15, B: 25, C: 24, D: 8, E: 13, F: 13, G: 34, H: 18, I: 15, J: 10, K: 19, L: 9, M: 12,
  N: 14, O: 16, P: 16, Q: 24, R: 24, S: 16, T: 38, U: 68, V: 20, W: 16, X: 20, Y: 34, Z: 44, AA: 44,
};
for (const [col, width] of Object.entries(widths)) works.getRange(`${col}:${col}`).format.columnWidth = width;
works.getRange("1:1").format.rowHeight = 36;
works.getRange(`2:${rows.length + 1}`).format.rowHeight = 72;

// 플랫폼 정보
titleBand(
  platform,
  "A1:F1",
  "플랫폼 정보와 필드 정의",
  "동일한 숫자처럼 보여도 플랫폼별 의미와 수집 면이 다르므로 원문 지표와 정규화 수치를 함께 보존한다."
);
platform.getRange("A4:F4").values = [["플랫폼", "랭킹 면", "표본 범위", "핵심 지표", "해석", "출처"]];
styleHeader(platform.getRange("A4:F4"));
platform.getRange("A5:F6").values = [
  ["카카오페이지", "웹소설 실시간 랭킹 Top 300", "1~50위", "열람자", "누적 열람 지표. 네이버 다운로드와 직접 비교·합산 금지.", receipt.sources[0].ranking_url],
  ["네이버 시리즈", "웹소설 TOP 100 일간", "1~50위", "다운로드", "누적 다운로드 지표. 카카오 열람자와 직접 비교·합산 금지.", receipt.sources[1].ranking_url],
];
platform.getRange("A8:D8").values = [["플랫폼", "필드", "확인 방법", "검증 결과"]];
styleHeader(platform.getRange("A8:D8"));
platform.getRange("A9:D12").values = [
  ["카카오페이지", "작품 소개", receipt.sources[0].synopsis_selector, "50/50 수집"],
  ["카카오페이지", "열람자", "상세 화면 지표 + 아이콘 대체 텍스트 '열람자'", "49/50 수집; 1편 연령 제한"],
  ["네이버 시리즈", "작품 소개", receipt.sources[1].synopsis_selector, "50/50 수집"],
  ["네이버 시리즈", "다운로드", "상세 화면 .btn_download", "49/50 수집; 1편 연령 제한"],
];
platform.getRange("A14:F14").values = [["주의", "", "", "", "", ""]];
platform.mergeCells("A14:F14");
styleHeader(platform.getRange("A14:F14"));
platform.getRange("A15:F17").values = [
  ["랭킹 범위", "전체 카탈로그가 아니라 지정 시점의 상위 50편씩이다.", "", "", "", ""],
  ["대상 성별", "제공된 전체 랭킹 URL을 사용했으므로 남성향 전용 표본이 아니다. 장르·제목·소개글로 후속 분류해야 한다.", "", "", "", ""],
  ["이용 제한", "로그인·연령 확인·유료 회차를 우회하지 않았고 공개 정보만 수집했다.", "", "", "", ""],
];
for (let r = 15; r <= 17; r++) platform.mergeCells(`B${r}:F${r}`);
platform.getRange("A4:F17").format = { verticalAlignment: "top", wrapText: true };
styleBorders(platform.getRange("A4:F6"));
styleBorders(platform.getRange("A8:D12"));
styleBorders(platform.getRange("A14:F17"));
platform.getRange("A:A").format.columnWidth = 20;
platform.getRange("B:B").format.columnWidth = 34;
platform.getRange("C:C").format.columnWidth = 34;
platform.getRange("D:D").format.columnWidth = 22;
platform.getRange("E:E").format.columnWidth = 48;
platform.getRange("F:F").format.columnWidth = 48;
platform.getRange("9:12").format.rowHeight = 84;
platform.freezePanes.freezeRows(3);

// 수집 영수증
titleBand(
  receiptSheet,
  "A1:F1",
  "수집 영수증",
  `수집 완료 시각 ${receipt.collected_at}. 공개 웹 화면만 사용하고 제한 화면은 미수집 상태로 남김.`
);
receiptSheet.getRange("A4:F4").values = [["플랫폼", "표시 기준 시각", "수집 순위", "행 수", "제한/공란", "랭킹 URL"]];
styleHeader(receiptSheet.getRange("A4:F4"));
receiptSheet.getRange("A5:F6").values = receipt.sources.map((source) => [
  source.platform,
  source.platform_displayed_snapshot,
  source.collected_ranks,
  source.row_count,
  source.restricted_rows,
  source.ranking_url,
]);
receiptSheet.getRange("A8:B8").values = [["검증", "결과"]];
styleHeader(receiptSheet.getRange("A8:B8"));
receiptSheet.getRange("A9:B15").values = [
  ["전체 행", rows.length],
  ["카카오 행", rows.filter((r) => r.platform === "카카오페이지").length],
  ["네이버 행", rows.filter((r) => r.platform === "네이버 시리즈").length],
  ["작품 소개 공란", rows.filter((r) => !r.synopsis).length],
  ["플랫폼 지표 공란", rows.filter((r) => r.metric_count == null).length],
  ["플랫폼+작품ID 중복", rows.length - new Set(rows.map((r) => `${r.platform}|${r.product_id}`)).size],
  ["공개 범위 외 우회", 0],
];
receiptSheet.getRange("D8:F8").values = [["연령 제한 작품", "남긴 정보", "비운 정보"]];
styleHeader(receiptSheet.getRange("D8:F8"));
receiptSheet.getRange("D9:F10").values = [
  ["카카오 27위 / 63243059", "랭킹 제목·작가·소개·표지 정보", "열람자·회차"],
  ["네이버 38위 / 14504926", "랭킹 제목·작가·소개·회차·평점", "다운로드·상세 장르·출판사"],
];
receiptSheet.getRange("A17:F17").values = [["수집 원칙", "", "", "", "", ""]];
receiptSheet.mergeCells("A17:F17");
styleHeader(receiptSheet.getRange("A17:F17"));
receiptSheet.getRange("A18:F20").values = receipt.rules.map((rule, index) => [index + 1, rule, "", "", "", ""]);
for (let r = 18; r <= 20; r++) receiptSheet.mergeCells(`B${r}:F${r}`);
receiptSheet.getRange("A4:F20").format = { verticalAlignment: "top", wrapText: true };
styleBorders(receiptSheet.getRange("A4:F6"));
styleBorders(receiptSheet.getRange("A8:B15"));
styleBorders(receiptSheet.getRange("D8:F10"));
styleBorders(receiptSheet.getRange("A17:F20"));
receiptSheet.getRange("A:A").format.columnWidth = 24;
receiptSheet.getRange("B:B").format.columnWidth = 34;
receiptSheet.getRange("C:C").format.columnWidth = 18;
receiptSheet.getRange("D:D").format.columnWidth = 26;
receiptSheet.getRange("E:E").format.columnWidth = 48;
receiptSheet.getRange("F:F").format.columnWidth = 48;
receiptSheet.getRange("5:6").format.rowHeight = 72;
receiptSheet.freezePanes.freezeRows(3);

// 모든 시트 상단·표 본문 스타일 정리
for (const sheet of [summary, works, platform, receiptSheet]) {
  sheet.getRange("A1:AA200").format.font = { name: "Aptos", size: 10 };
}
// 제목/헤더 스타일은 마지막에 다시 적용해 전역 폰트 설정과 함께 유지한다.
for (const [sheet, titleRange, headerRanges] of [
  [summary, "A1:H1", ["A4:C4", "A8:B8", "D4:E4", "A16:H16"]],
  [works, null, ["A1:AA1"]],
  [platform, "A1:F1", ["A4:F4", "A8:D8", "A14:F14"]],
  [receiptSheet, "A1:F1", ["A4:F4", "A8:B8", "D8:F8", "A17:F17"]],
]) {
  if (titleRange) sheet.getRange(titleRange).format.font = { name: "Aptos Display", size: 18, bold: true, color: white };
  for (const headerRange of headerRanges) styleHeader(sheet.getRange(headerRange));
}

const previews = [
  ["요약", "A1:H20", "summary.png"],
  ["작품100", "A1:AA12", "works100.png"],
  ["플랫폼정보", "A1:F17", "platform-info.png"],
  ["수집영수증", "A1:F20", "receipt.png"],
];
for (const [sheetName, range, file] of previews) {
  const image = await wb.render({ sheetName, range, scale: 0.9, format: "png" });
  await fs.writeFile(path.join(previewDir, file), new Uint8Array(await image.arrayBuffer()));
}

const xlsx = await SpreadsheetFile.exportXlsx(wb);
await xlsx.save(outputPath);

const inspect = wb.inspect({
  kind: "table",
  range: "수집영수증!A8:F15",
  include: "values,formulas",
  tableMaxRows: 20,
  tableMaxCols: 10,
});
const errors = wb.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});

console.log(JSON.stringify({ outputPath, previewDir, rows: rows.length, inspect, errors }, null, 2));
