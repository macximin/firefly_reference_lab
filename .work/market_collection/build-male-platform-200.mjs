import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const workDir = "/Users/a2501/Desktop/inkos/edge_repos/inkos_reverse_lab/.work/market_collection";
const outputDir = "/Users/a2501/Desktop/inkos/edge_repos/inkos_reverse_lab/outputs/019ff69d-4e2d-7230-ad52-0aebaaa527b1";
const outputPath = path.join(outputDir, "webnovel-male-platform-200.xlsx");
const previewDir = path.join(workDir, "male-200-previews");

const kakaoPayload = JSON.parse(await fs.readFile(path.join(workDir, "male-200-kakao-details.json"), "utf8"));
const kakaoRanking = JSON.parse(await fs.readFile(path.join(workDir, "male-200-kakao-ranking-snapshot.json"), "utf8"));
const naverPayload = JSON.parse(await fs.readFile(path.join(workDir, "male-200-naver-details.json"), "utf8"));
const naverRanking = JSON.parse(await fs.readFile(path.join(workDir, "male-200-naver-ranking-snapshot.json"), "utf8"));

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const genreRanks = new Map();
for (const [genre, key] of [["판타지", "fantasy"], ["현판", "modern_fantasy"], ["무협", "martial_arts"]]) {
  for (const row of kakaoRanking[key]) genreRanks.set(`${genre}:${row.id}`, row.rank);
}

const kakaoRows = kakaoPayload.rows.map((row, index) => ({
  ...row,
  selection_order: index + 1,
  overall_rank: row.rank,
  category_rank: genreRanks.get(`${row.genre}:${row.product_id}`) ?? null,
  comment_display: row.comment_display ?? "",
  completion_state: row.completion_state ?? "",
  detail_snapshot: row.detail_snapshot ?? "2026-08-16 공개 상세 화면",
}));
const naverRows = naverPayload.rows.map((row, index) => ({
  ...row,
  selection_order: row.selection_order ?? index + 1,
  detail_snapshot: row.detail_snapshot ?? naverRanking.collected_at,
}));
const allRows = [...kakaoRows, ...naverRows];

if (kakaoRows.length !== 100 || naverRows.length !== 100 || allRows.length !== 200) {
  throw new Error(`invalid row counts: ${kakaoRows.length}/${naverRows.length}/${allRows.length}`);
}
if (new Set(allRows.map((row) => `${row.platform}:${row.product_id}`)).size !== 200) {
  throw new Error("duplicate platform/product identity");
}
const maleGenres = new Set(["판타지", "현대판타지", "현판", "무협"]);
const invalidGenres = allRows.filter((row) => !maleGenres.has(row.genre));
if (invalidGenres.length) throw new Error(`invalid male genres: ${invalidGenres.map((row) => row.title).join(", ")}`);

const wb = Workbook.create();
const summary = wb.worksheets.add("요약");
const all = wb.worksheets.add("전체200");
const kakao = wb.worksheets.add("카카오100");
const naver = wb.worksheets.add("네이버100");
const receipt = wb.worksheets.add("수집영수증");

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
  };
}

function styleHeader(sheet, range) {
  sheet.getRange(range).format = {
    fill: navy,
    font: { name: "Aptos", size: 10, bold: true, color: white },
    verticalAlignment: "center",
    wrapText: true,
  };
}

function setWidths(sheet, widths) {
  for (const [column, width] of Object.entries(widths)) sheet.getRange(`${column}:${column}`).format.columnWidth = width;
}

function borders(range) {
  range.format.borders = { preset: "all", style: "thin", color: "#D9E1F2" };
}

const fullSynopsis = allRows.filter((row) => row.synopsis_state === "full_public_detail").length;
const fallbackSynopsis = allRows.filter((row) => row.synopsis_state === "ranking_summary_fallback").length;
const blankSynopsis = allRows.filter((row) => !row.synopsis).length;
const genreCounts = Object.fromEntries(["판타지", "현판", "무협"].map((genre) => [genre, allRows.filter((row) => row.genre === genre).length]));

titleBand(
  summary,
  "A1:H1",
  "카카오·네이버 남성향 웹소설 200편",
  "판타지·현대판타지·현판·무협만 포함한 공개 시장 표본. 카카오 열람자와 네이버 다운로드는 서로 다른 지표다."
);
summary.getRange("A4:B4").values = [["플랫폼", "작품 수"]];
styleHeader(summary, "A4:B4");
summary.getRange("A5:B7").values = [["카카오페이지", 100], ["네이버 시리즈", 100], ["합계", 200]];
summary.getRange("A7:B7").format = { fill: blue, font: { bold: true } };

summary.getRange("D4:E4").values = [["장르", "작품 수"]];
styleHeader(summary, "D4:E4");
summary.getRange("D5:E7").values = [["판타지", genreCounts["판타지"]], ["현판", genreCounts["현판"]], ["무협", genreCounts["무협"]]];

summary.getRange("G4:H4").values = [["소개 상태", "작품 수"]];
styleHeader(summary, "G4:H4");
summary.getRange("G5:H7").values = [["상세 소개", fullSynopsis], ["랭킹 소개 보충", fallbackSynopsis], ["공란", blankSynopsis]];
summary.getRange("G7:H7").conditionalFormats.add("cellIs", { operator: "greaterThan", formula: 0, format: { fill: red, font: { bold: true, color: "#9C0006" } } });

summary.mergeCells("A10:H10");
summary.getRange("A10").values = [["표본 정의"]];
styleHeader(summary, "A10:H10");
const notes = [
  ["1", "카카오: 실시간 종합 Top 300과 판타지·현판·무협 장르 Top 300의 작품 ID를 교차하고, 종합 순위가 높은 100편을 선택했다."],
  ["2", "카카오 100번째 작품은 종합 146위였다. 표본 안 장르 구성은 판타지 44·현판 31·무협 25편이다."],
  ["3", "네이버: 전체 일간 TOP100에서 남성향 84편을 먼저 선택하고, 부족한 16편은 판타지·현판·무협 일간 순위를 같은 순위부터 라운드로빈으로 보충했다."],
  ["4", "네이버 보충 16편은 전체 TOP100 순위가 없으므로 종합순위는 공란이며 장르순위와 선정경로로 추적한다."],
  ["5", "독자향은 주인공 성별이나 팬덤 추정이 아니라 장르 단일 규칙으로만 판정했다."],
  ["6", "로그인·성인 인증·유료 회차를 우회하지 않았다. 공개 제한 1편의 소개는 공란으로 유지했다."],
];
summary.getRange("A11:H16").values = notes.map(([number, note]) => [number, note, "", "", "", "", "", ""]);
for (let row = 11; row <= 16; row++) summary.mergeCells(`B${row}:H${row}`);
summary.getRange("A11:A16").format = { fill: blue, font: { bold: true }, horizontalAlignment: "center" };
summary.getRange("B11:H16").format = { wrapText: true, verticalAlignment: "top" };

summary.mergeCells("A19:H19");
summary.getRange("A19").values = [["해석 주의"]];
styleHeader(summary, "A19:H19");
summary.mergeCells("A20:H21");
summary.getRange("A20").values = [["카카오의 열람자와 네이버의 다운로드는 정의가 달라 합산·평균·순위화하지 않는다. 누적 지표는 작품 연령, 무료 행사, 회차 수와 노출면의 영향을 함께 받으므로 현재 전환율이나 서사 구조의 우수성을 직접 증명하지 않는다."]];
summary.getRange("A20:H21").format = { fill: yellow, wrapText: true, verticalAlignment: "center" };

borders(summary.getRange("A4:B7"));
borders(summary.getRange("D4:E7"));
borders(summary.getRange("G4:H7"));
borders(summary.getRange("A10:H16"));
borders(summary.getRange("A19:H21"));
setWidths(summary, { A: 20, B: 48, C: 4, D: 18, E: 14, F: 4, G: 22, H: 18 });
summary.getRange("1:1").format.rowHeight = 38;
summary.getRange("2:2").format.rowHeight = 34;
summary.getRange("11:16").format.rowHeight = 38;
summary.getRange("20:21").format.rowHeight = 34;
summary.freezePanes.freezeRows(3);
summary.showGridLines = false;

const headers = [
  "선정순서", "플랫폼", "종합순위", "장르순위", "작품 ID", "작품명", "작가", "장르",
  "완결상태", "회차 수", "지표 종류", "지표 원문", "평점", "댓글 수", "소개 상태", "작품 소개",
  "출판사", "연령등급", "연재 상태", "선정 경로", "수집 상태", "상세 스냅샷", "상세 URL"
];

function rowValues(row) {
  return [
    row.selection_order, row.platform, row.overall_rank ?? "", row.category_rank ?? "", String(row.product_id),
    row.title ?? "", row.author ?? "", row.genre ?? "", row.completion_state ?? "", row.episode_count ?? "",
    row.metric_type ?? "", row.metric_display ?? "", row.rating ?? "", row.comment_display ?? "", row.synopsis_state ?? "",
    row.synopsis ?? "", row.publisher ?? "", row.age_rating ?? "", row.serialization ?? "", row.selection_source ?? "",
    row.collection_state ?? "", row.detail_snapshot ?? "", row.detail_url || row.product_url || "",
  ];
}

function buildDataSheet(sheet, rows, tableName, platformFill) {
  sheet.getRange("A1:W1").values = [headers];
  styleHeader(sheet, "A1:W1");
  sheet.getRange(`A2:W${rows.length + 1}`).values = rows.map(rowValues);
  sheet.tables.add(`A1:W${rows.length + 1}`, true, tableName);
  sheet.getRange(`A2:W${rows.length + 1}`).format = { verticalAlignment: "top" };
  sheet.getRange(`P2:W${rows.length + 1}`).format.wrapText = true;
  sheet.getRange(`A2:A${rows.length + 1}`).format.numberFormat = "0";
  sheet.getRange(`C2:D${rows.length + 1}`).format.numberFormat = "0";
  sheet.getRange(`J2:J${rows.length + 1}`).format.numberFormat = "#,##0";
  sheet.getRange(`B2:B${rows.length + 1}`).conditionalFormats.addCustom('=B2="카카오페이지"', { fill: yellow });
  sheet.getRange(`B2:B${rows.length + 1}`).conditionalFormats.addCustom('=B2="네이버 시리즈"', { fill: green });
  sheet.getRange(`O2:O${rows.length + 1}`).conditionalFormats.addCustom('=O2="restricted_or_unavailable"', { fill: red, font: { bold: true, color: "#9C0006" } });
  if (platformFill) sheet.getRange(`A2:A${rows.length + 1}`).format.fill = platformFill;
  sheet.freezePanes.freezeRows(1);
  sheet.freezePanes.freezeColumns(8);
  sheet.showGridLines = false;
  setWidths(sheet, {
    A: 10, B: 16, C: 11, D: 11, E: 14, F: 36, G: 18, H: 11, I: 12, J: 10, K: 13, L: 14,
    M: 9, N: 11, O: 26, P: 78, Q: 20, R: 15, S: 17, T: 34, U: 23, V: 23, W: 50,
  });
  sheet.getRange("1:1").format.rowHeight = 38;
  sheet.getRange(`2:${rows.length + 1}`).format.rowHeight = 76;
}

buildDataSheet(all, allRows, "Male200Table", null);
buildDataSheet(kakao, kakaoRows, "KakaoMale100Table", yellow);
buildDataSheet(naver, naverRows, "NaverMale100Table", green);

titleBand(
  receipt,
  "A1:F1",
  "수집 영수증",
  "공개 랭킹과 공개 작품 상세 화면만 사용했다. 표본은 플랫폼 전체 카탈로그가 아니라 지정 시점의 관찰면이다."
);
receipt.getRange("A4:C4").values = [["구분", "값", "설명"]];
styleHeader(receipt, "A4:C4");
receipt.getRange("A5:C14").values = [
  ["남성향 규칙", "판타지·현대판타지·현판·무협", "이외 장르는 제외"],
  ["카카오 순위 시점", kakaoRanking.ranking_snapshot_label, kakaoRanking.overall_url],
  ["카카오 표본", 100, "종합 Top300을 장르 Top300 ID로 필터; 종합 146위까지"],
  ["카카오 소개", `${kakaoRows.filter((row) => row.synopsis).length}/100`, "공개 제한 1편 공란"],
  ["네이버 순위 시점", naverRanking.collected_at, naverRanking.ranking_url],
  ["네이버 전체 TOP100", 84, "전체 일간 TOP100 안 남성향 장르"],
  ["네이버 장르 보충", 16, "판타지·현판·무협 일간 TOP100에서 보충"],
  ["네이버 소개", `${naverRows.filter((row) => row.synopsis).length}/100`, "상세 소개 또는 랭킹 소개 보충"],
  ["중복", 0, "플랫폼+작품 ID 기준"],
  ["수집 원칙", "공개 화면만", "로그인·성인 인증·유료 회차 우회 없음"],
];

receipt.getRange("A17:C17").values = [["플랫폼", "지표", "해석"]];
styleHeader(receipt, "A17:C17");
receipt.getRange("A18:C19").values = [
  ["카카오페이지", "열람자", "누적 열람 지표. 네이버 다운로드와 합산 금지"],
  ["네이버 시리즈", "다운로드", "누적 다운로드 지표. 카카오 열람자와 합산 금지"],
];

receipt.getRange("A22:C22").values = [["제약", "상태", "처리"]];
styleHeader(receipt, "A22:C22");
receipt.getRange("A23:C26").values = [
  ["카카오 공개 제한", "1편", "제목·장르·열람자·회차는 보존, 소개는 공란"],
  ["네이버 보충 16편", "전체순위 없음", "종합순위 공란, 장르순위와 선정경로 보존"],
  ["시점성", "변동 가능", "순위와 지표는 스냅샷으로만 사용"],
  ["상업성 해석", "별도 분석 필요", "소개 약속과 실제 본문 지급·Arc는 동일하지 않음"],
];

receipt.getRange("A4:C26").format = { verticalAlignment: "top", wrapText: true };
borders(receipt.getRange("A4:C14"));
borders(receipt.getRange("A17:C19"));
borders(receipt.getRange("A22:C26"));
setWidths(receipt, { A: 24, B: 34, C: 76, D: 4, E: 4, F: 4 });
receipt.getRange("1:1").format.rowHeight = 38;
receipt.getRange("2:2").format.rowHeight = 34;
receipt.getRange("5:14").format.rowHeight = 38;
receipt.getRange("23:26").format.rowHeight = 42;
receipt.freezePanes.freezeRows(3);
receipt.showGridLines = false;

const previews = [
  ["요약", "A1:H21", "summary.png", 1],
  ["전체200", "A1:W8", "all200.png", 0.7],
  ["카카오100", "A1:W8", "kakao100.png", 0.7],
  ["네이버100", "A1:W8", "naver100.png", 0.7],
  ["수집영수증", "A1:F26", "receipt.png", 1],
];
for (const [sheetName, range, fileName, scale] of previews) {
  const image = await wb.render({ sheetName, range, scale, format: "png" });
  await fs.writeFile(path.join(previewDir, fileName), new Uint8Array(await image.arrayBuffer()));
}

const summaryCheck = wb.inspect({ kind: "table", range: "요약!A4:H21", include: "values,formulas", tableMaxRows: 25, tableMaxCols: 10 });
const dataCheck = wb.inspect({ kind: "table", range: "전체200!A1:W6", include: "values,formulas", tableMaxRows: 8, tableMaxCols: 24 });
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
    total: allRows.length,
    kakao: kakaoRows.length,
    naver: naverRows.length,
    genres: genreCounts,
    fullSynopsis,
    fallbackSynopsis,
    blankSynopsis,
    metricBlank: allRows.filter((row) => !row.metric_display).length,
    episodeBlank: allRows.filter((row) => row.episode_count == null).length,
  },
  summaryCheck,
  dataCheck,
  errors,
}, null, 2));
