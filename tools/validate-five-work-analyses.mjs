#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const works = [
  {
    slug: "goldspoon-investment-manual",
    title: "금수저 투자백서",
    markerCount: 686,
    sha256: "1ac62315ac08181c712154e480d6cd6951fb61b8825ab6bb28af88d4fdb534af",
    source: join(repoRoot, "private_sources/korean_webnovel_corpus/강동호/금수저 투자백서_강동호_합본.txt"),
  },
  {
    slug: "doksik-chaebol3",
    title: "독식하는 재벌 3세",
    markerCount: 751,
    sha256: "66f3e7df3123343c14a7134108dc59940511f40372493a549cba8ae709df4b45",
    source: join(repoRoot, "private_sources/korean_webnovel_corpus/서오/독식하는 재벌 3세_서오_합본.txt"),
  },
  {
    slug: "magic-chaebol-lateborn",
    title: "마법 배운 재벌집 늦둥이",
    markerCount: 304,
    sha256: "f6517541f1be4d1ed108613687fb024a4745258927669447898b914a0578e0f3",
    source: join(repoRoot, "private_sources/korean_webnovel_corpus/서오/마법 배운 재벌집 늦둥이_서오_합본.txt"),
  },
  {
    slug: "divorce-chaebol-awakening",
    title: "이혼 후 재벌 각성!",
    markerCount: 220,
    sha256: "09ca4bb08e88f7791e38bc33c393ee1732af32823d7ed39a1c7026f4b7e37908",
    source: join(repoRoot, "private_sources/korean_webnovel_corpus/흑곰작가/이혼 후 재벌 각성!_흑곰작가_합본.txt"),
  },
  {
    slug: "return-ace",
    title: "리턴 에이스",
    markerCount: 310,
    sha256: "d1dd84aebe77ece8f17e4b4448b739c3106931ccec5f2008933b385b74b8ba45",
    source: join(repoRoot, "private_sources/korean_webnovel_corpus/흑곰작가/리턴 에이스_흑곰작가_합본.txt"),
  },
  {
    slug: "success-era",
    title: "성공시대",
    markerCount: 1006,
    sha256: "6aa081f0c9039e25bfec93ffbc2e2fe9f10175e8d302d794e454263200257a79",
    source: join(repoRoot, "private_sources/korean_webnovel_corpus/강동호/성공시대_강동호_합본.txt"),
  },
  {
    slug: "great-ambition",
    title: "대망",
    markerCount: 1002,
    sha256: "60a91d7a4f95fb3f808dfd0c2dd1967a4f2e72d71f70e4b713d32766669b918e",
    source: join(repoRoot, "private_sources/korean_webnovel_corpus/강동호/대망_강동호_합본.txt"),
  },
  {
    slug: "fist-above-law",
    title: "법보다 주먹(개정판)",
    markerCount: 830,
    sha256: "994b205ffc22ff9a51633c8b71db89207716c64cae3ff97f9b02d4122e27078e",
    source: join(repoRoot, "private_sources/korean_webnovel_corpus/흑곰작가/법보다 주먹(개정판)_흑곰작가_합본.txt"),
  },
  {
    slug: "goldspoon-life-manual",
    title: "금수저생활백서",
    markerCount: 703,
    sha256: "0b3542d640338c504cf7fd7c26c559e753357244dfcd451ddd7d4c75a920f93f",
    source: join(repoRoot, "private_sources/korean_webnovel_corpus/강동호/금수저생활백서_강동호_합본.txt"),
  },
  {
    slug: "hyojong",
    title: "효종",
    markerCount: 500,
    sha256: "f0b4459d33253c389d9bf6a9c6b648ec3b461eeb327e44822be719d4a179e334",
    source: join(repoRoot, "private_sources/korean_webnovel_corpus/강동호/효종_강동호_합본.txt"),
  },
  {
    slug: "trillion-salary-rookie",
    title: "연봉 1조 신입사원",
    markerCount: 485,
    sha256: "72353f790d8ee488a7832ee08008bd96a1681af7438a21ba7811a790223bc7b7",
    source: join(repoRoot, "private_sources/korean_webnovel_corpus/서오/연봉 1조 신입사원_서오_합본.txt"),
  },
  {
    slug: "nouveau-riche-rascal",
    title: "졸부집 망나니(개정판)",
    markerCount: 450,
    sha256: "67997af4a5922c21e2852545c958c3f71ec6b1a30a679271d0a7d41c87a947a8",
    source: join(repoRoot, "private_sources/korean_webnovel_corpus/흑곰작가/졸부집 망나니(개정판)_흑곰작가_합본.txt"),
  },
  {
    slug: "chaebol-youngest-genius",
    title: "재벌가 막둥이는 만능 천재(개정판)",
    markerCount: 380,
    sha256: "e00881820810cd27f1efbe72a0a514aa4a0a9b1a08a77a747444766a84892c7f",
    source: join(repoRoot, "private_sources/korean_webnovel_corpus/흑곰작가/재벌가 막둥이는 만능 천재(개정판)_흑곰작가_합본.txt"),
  },
  {
    slug: "mans-road",
    title: "남자의 길",
    markerCount: 325,
    sha256: "b74c0e66d22a50a1f9f9442013f2818ba952c1f8e00fbebddfe6a46c09d371b2",
    source: join(repoRoot, "private_sources/korean_webnovel_corpus/강동호/남자의 길_강동호_합본.txt"),
  },
  {
    slug: "goryeo-superpower",
    title: "고려는 천조국이 되기로 하였습니다",
    markerCount: 280,
    sha256: "bd90732f0ae6fa2a8d83631c5d48364ecf87106230cc7b73ab128c146510fd5f",
    source: join(repoRoot, "private_sources/korean_webnovel_corpus/강동호/고려는 천조국이 되기로 하였습니다_강동호_합본.txt"),
  },
];

const requiredMarkdown = new Map([
  ["project_bible.md", 8_000],
  ["arc_atlas.md", 15_000],
  ["inkos_usage_and_gap_report.md", 6_000],
  ["free_improvements_report.md", 4_000],
  ["completion_receipt.md", 800],
]);

const csvHeaders = new Map([
  ["chapter_map.csv", "sequence,visible_label,title,start_line,end_line,entry_state,reader_promise,protagonist_goal,action,resistance_or_cost,turn_or_reveal,paid_reward,state_change_axis,state_change,ending_hook,closed_loops,opened_loops,arc_id,confidence"],
  ["arc_map.csv", "arc_id,arc_name,start_sequence,end_sequence,start_label,end_label,episode_count,main_characters,main_locations,concrete_premise,central_question,promise,pressure_escalation,mid_turn,concrete_payoff,relationship_change,status_or_ability_change,residual_cost,next_arc_bridge,boundary_signals,confidence"],
  ["arc_pacing.csv", "sequence,visible_label,arc_id,arc_phase,concrete_event,tension_1_10,reward_1_10,hook_1_10,information_weight,action_weight,relationship_weight,emotion_weight,material_or_status_weight,pacing_note"],
]);

const forbiddenOutputPatterns = [
  [/아스퍼거/gu, "금지된 진단명·비하 표현"],
  [/자폐증/gu, "금지된 진단명·비하 표현"],
];

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error("CSV has an unclosed quoted field");
  if (field !== "" || row.length > 0) {
    row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
    rows.push(row);
  }
  if (rows[0]?.[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/u, "");
  return rows.filter((candidate) => !(candidate.length === 1 && candidate[0] === ""));
}

function rowsAsObjects(rows) {
  const [header, ...body] = rows;
  return body.map((values) => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ""])));
}

async function sha256(inputFile) {
  const digest = createHash("sha256");
  await new Promise((resolvePromise, rejectPromise) => {
    const stream = createReadStream(inputFile);
    stream.on("data", (chunk) => digest.update(chunk));
    stream.on("end", resolvePromise);
    stream.on("error", rejectPromise);
  });
  return digest.digest("hex");
}

function countExactValues(rows, column, warnings, label) {
  const counts = new Map();
  for (const row of rows) {
    const value = row[column]?.trim();
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const [value, count] = [...counts.entries()].sort((left, right) => right[1] - left[1])[0] ?? [];
  if (count >= Math.max(5, Math.ceil(rows.length * 0.12))) {
    warnings.push(`${label}.${column}: 동일 문구가 ${count}/${rows.length}행 반복됨 (${value.slice(0, 90)})`);
  }
}

function validateScores(rows, warnings, label) {
  for (const column of ["tension_1_10", "reward_1_10", "hook_1_10"]) {
    const scores = rows.map((row) => Number(row[column]));
    if (scores.some((score) => !Number.isInteger(score) || score < 1 || score > 10)) {
      warnings.push(`${label}.${column}: 1~10 정수 범위를 벗어난 값이 있음`);
      continue;
    }
    const distinct = new Set(scores);
    if (rows.length >= 20 && distinct.size < 4) {
      warnings.push(`${label}.${column}: ${rows.length}회차에 서로 다른 점수가 ${distinct.size}개뿐이라 페이싱이 평탄함`);
    }
  }
}

function validateArcLengthShape(rows, warnings, label) {
  if (rows.length < 12) return;
  const lengths = rows.map((row) => Number(row.episode_count));
  if (lengths.some((length) => !Number.isInteger(length) || length < 1)) return;
  const packetSized = lengths.filter((length) => length <= 3).length;
  const maximum = Math.max(...lengths);
  const ratio = packetSized / lengths.length;
  if (ratio >= 0.65 && maximum <= 8) {
    warnings.push(`${label}: ${rows.length}개 Arc 중 ${packetSized}개(${Math.round(ratio * 100)}%)가 1~3화이고 최대도 ${maximum}화라 자연 Arc보다 제작 Packet 분할일 가능성이 큼`);
  }
}

function countPattern(rows, column, pattern) {
  let count = 0;
  for (const row of rows) {
    pattern.lastIndex = 0;
    if (pattern.test(row[column] ?? "")) count += 1;
  }
  pattern.lastIndex = 0;
  return count;
}

function validateFormulaicPacing(rows, warnings, label) {
  if (rows.length < 20) return;
  const patterns = [
    ["`다음 추진=` 템플릿", /다음 추진=/gu, 0.25],
    ["행동→전환→보상 화살표 템플릿", /\s→\s/gu, 0.6],
  ];
  for (const [description, pattern, threshold] of patterns) {
    const count = countPattern(rows, description.includes("추진") ? "pacing_note" : "concrete_event", pattern);
    if (count >= Math.max(8, Math.ceil(rows.length * threshold))) {
      warnings.push(`${label}: ${description}이 ${count}/${rows.length}행에서 반복되어 장면별 편집 판단 대신 공식 생성일 가능성이 큼`);
    }
  }
}

function checkForbidden(text, label, errors) {
  for (const [pattern, explanation] of forbiddenOutputPatterns) {
    if (pattern.test(text)) errors.push(`${label}: ${explanation}`);
    pattern.lastIndex = 0;
  }
}

async function validateWork(work) {
  const errors = [];
  const warnings = [];
  const analysisDir = join(repoRoot, "analyses", work.slug);

  let sourceText = "";
  try {
    sourceText = await readFile(work.source, "utf8");
    const actualHash = await sha256(work.source);
    if (actualHash !== work.sha256) errors.push(`원문 SHA-256 불일치: ${actualHash}`);
    const actualMarkers = sourceText.split(/\r?\n/u).filter((line) => line.startsWith("ⓚ")).length;
    if (actualMarkers !== work.markerCount) errors.push(`원문 표식 수 불일치: ${actualMarkers} != ${work.markerCount}`);
  } catch (error) {
    errors.push(`원문을 읽지 못함: ${error.message}`);
  }

  let receipt;
  try {
    receipt = JSON.parse(await readFile(join(analysisDir, "source_receipt.json"), "utf8"));
    if (receipt.sourceSha256 !== work.sha256) errors.push("source_receipt.json의 sourceSha256 불일치");
    if (receipt.markerCount !== work.markerCount) errors.push("source_receipt.json의 markerCount 불일치");
    if (receipt.analysisCoverage !== "full") errors.push("source_receipt.json의 analysisCoverage가 full이 아님");
  } catch (error) {
    errors.push(`source_receipt.json 누락 또는 파싱 실패: ${error.message}`);
  }

  for (const [name, minimumBytes] of requiredMarkdown) {
    const outputFile = join(analysisDir, name);
    try {
      const info = await stat(outputFile);
      const contents = await readFile(outputFile, "utf8");
      if (info.size < minimumBytes) errors.push(`${name}: ${info.size} bytes로 최소 해상도 ${minimumBytes} 미달`);
      checkForbidden(contents, name, errors);
    } catch (error) {
      errors.push(`${name} 누락 또는 읽기 실패: ${error.message}`);
    }
  }

  const parsed = new Map();
  for (const [name, expectedHeader] of csvHeaders) {
    try {
      const contents = await readFile(join(analysisDir, name), "utf8");
      checkForbidden(contents, name, errors);
      const csvRows = parseCsv(contents);
      const actualHeader = csvRows[0]?.join(",") ?? "";
      if (actualHeader !== expectedHeader) errors.push(`${name}: 헤더가 계약과 다름`);
      if (csvRows.slice(1).some((row) => row.length !== csvRows[0].length)) {
        errors.push(`${name}: 열 수가 헤더와 다른 행이 있음`);
      }
      parsed.set(name, rowsAsObjects(csvRows));
    } catch (error) {
      errors.push(`${name} 누락 또는 파싱 실패: ${error.message}`);
    }
  }

  const chapters = parsed.get("chapter_map.csv") ?? [];
  const arcs = parsed.get("arc_map.csv") ?? [];
  const pacing = parsed.get("arc_pacing.csv") ?? [];
  if (chapters.length !== work.markerCount) errors.push(`chapter_map.csv 데이터 행 ${chapters.length} != ${work.markerCount}`);
  if (pacing.length !== work.markerCount) errors.push(`arc_pacing.csv 데이터 행 ${pacing.length} != ${work.markerCount}`);

  for (const [name, rows] of [["chapter_map.csv", chapters], ["arc_pacing.csv", pacing]]) {
    rows.forEach((row, index) => {
      if (Number(row.sequence) !== index + 1) errors.push(`${name}: sequence ${index + 1} 위치에 ${row.sequence}`);
    });
  }

  const orderedArcs = [...arcs].sort((left, right) => Number(left.start_sequence) - Number(right.start_sequence));
  const knownArcIds = new Set();
  let expectedStart = 1;
  for (const arc of orderedArcs) {
    const start = Number(arc.start_sequence);
    const end = Number(arc.end_sequence);
    if (!arc.arc_id) errors.push("arc_map.csv: 빈 arc_id");
    if (knownArcIds.has(arc.arc_id)) errors.push(`arc_map.csv: 중복 arc_id ${arc.arc_id}`);
    knownArcIds.add(arc.arc_id);
    if (start !== expectedStart) errors.push(`arc_map.csv: ${arc.arc_id} 시작 ${start}, 기대값 ${expectedStart} (공백 또는 겹침)`);
    if (!Number.isInteger(end) || end < start) errors.push(`arc_map.csv: ${arc.arc_id} 종료 범위 오류`);
    if (Number(arc.episode_count) !== end - start + 1) errors.push(`arc_map.csv: ${arc.arc_id} episode_count 불일치`);
    expectedStart = end + 1;
  }
  if (expectedStart !== work.markerCount + 1) errors.push(`arc_map.csv: 마지막 커버리지 ${expectedStart - 1} != ${work.markerCount}`);

  const arcForSequence = new Map();
  for (const arc of orderedArcs) {
    for (let sequence = Number(arc.start_sequence); sequence <= Number(arc.end_sequence); sequence += 1) {
      arcForSequence.set(sequence, arc.arc_id);
    }
  }
  for (const [name, rows] of [["chapter_map.csv", chapters], ["arc_pacing.csv", pacing]]) {
    rows.forEach((row) => {
      const expectedArc = arcForSequence.get(Number(row.sequence));
      if (!knownArcIds.has(row.arc_id)) errors.push(`${name}: 알 수 없는 arc_id ${row.arc_id || "(빈 값)"}`);
      if (expectedArc && row.arc_id !== expectedArc) errors.push(`${name}: seq ${row.sequence}의 arc_id ${row.arc_id} != ${expectedArc}`);
    });
  }

  for (const column of ["entry_state", "reader_promise", "protagonist_goal", "resistance_or_cost", "paid_reward", "state_change", "closed_loops", "opened_loops"]) {
    countExactValues(chapters, column, warnings, "chapter_map.csv");
  }
  for (const column of ["main_characters", "main_locations", "central_question", "promise", "pressure_escalation", "relationship_change", "status_or_ability_change", "residual_cost", "boundary_signals"]) {
    countExactValues(arcs, column, warnings, "arc_map.csv");
  }
  countExactValues(pacing, "pacing_note", warnings, "arc_pacing.csv");
  validateScores(pacing, warnings, "arc_pacing.csv");
  validateArcLengthShape(arcs, warnings, "arc_map.csv");
  validateFormulaicPacing(pacing, warnings, "arc_pacing.csv");

  return { ...work, errors, warnings, arcCount: arcs.length };
}

async function main() {
  const requestedSlugs = process.argv.slice(2).filter((value) => value !== "--strict");
  const strict = process.argv.includes("--strict");
  const selected = requestedSlugs.length ? works.filter((work) => requestedSlugs.includes(work.slug)) : works;
  if (selected.length === 0) throw new Error(`알 수 없는 work slug: ${requestedSlugs.join(", ")}`);

  const results = [];
  for (const work of selected) results.push(await validateWork(work));

  for (const result of results) {
    const failed = result.errors.length > 0 || (strict && result.warnings.length > 0);
    console.log(`${failed ? "FAIL" : "PASS"} ${result.title}: ${result.markerCount}회 / ${result.arcCount} Arc / 오류 ${result.errors.length} / 경고 ${result.warnings.length}`);
    for (const error of result.errors) console.log(`  ERROR ${error}`);
    for (const warning of result.warnings) console.log(`  WARN  ${warning}`);
  }

  if (results.some((result) => result.errors.length > 0 || (strict && result.warnings.length > 0))) process.exitCode = 1;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
