#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const analysisDir = resolve(import.meta.dirname, "..");
const workDir = import.meta.dirname;

const chapterHeader = [
  "sequence", "visible_label", "title", "start_line", "end_line", "entry_state",
  "reader_promise", "protagonist_goal", "action", "resistance_or_cost", "turn_or_reveal",
  "paid_reward", "state_change_axis", "state_change", "ending_hook", "closed_loops",
  "opened_loops", "arc_id", "confidence",
];
const pacingHeader = [
  "sequence", "visible_label", "arc_id", "arc_phase", "concrete_event", "tension_1_10",
  "reward_1_10", "hook_1_10", "information_weight", "action_weight", "relationship_weight",
  "emotion_weight", "material_or_status_weight", "pacing_note",
];
const sourcePacingHeader = [
  "sequence", "visible_label", "arc_candidate", "arc_phase", "concrete_event", "tension_1_10",
  "reward_1_10", "hook_1_10", "information_weight", "action_weight", "relationship_weight",
  "emotion_weight", "material_or_status_weight", "pacing_note",
];
const arcHeader = [
  "arc_id", "arc_name", "start_sequence", "end_sequence", "start_label", "end_label",
  "episode_count", "main_characters", "main_locations", "concrete_premise", "central_question",
  "promise", "pressure_escalation", "mid_turn", "concrete_payoff", "relationship_change",
  "status_or_ability_change", "residual_cost", "next_arc_bridge", "boundary_signals", "confidence",
];
const sourceArcHeader = [
  "arc_candidate", "arc_name", "start_sequence", "end_sequence", "main_characters",
  "main_locations", "concrete_premise", "central_question", "promise", "pressure_escalation",
  "mid_turn", "concrete_payoff", "relationship_change", "status_or_ability_change",
  "residual_cost", "next_arc_bridge", "boundary_signals", "confidence",
];

const parts = ["early", "middle", "late"];
const chapters = await readFragments(parts.map((part) => `${part}_chapters.csv`));
const pacing = await readFragments(parts.map((part) => `${part}_pacing.csv`));
const arcCandidates = await readFragments(parts.map((part) => `${part}_arcs.csv`));

assertHeader(chapters.header, [
  ...chapterHeader.slice(0, 17), "arc_candidate", "confidence",
], "chapter fragments");
assertHeader(pacing.header, sourcePacingHeader, "pacing fragments");
assertHeader(arcCandidates.header, sourceArcHeader, "arc fragments");
assertSequences(chapters.rows, 325, "chapter fragments");
assertSequences(pacing.rows, 325, "pacing fragments");

const arcs = arcCandidates.rows.map((arc, index) => ({
  ...arc,
  arc_id: `MR-${String(index + 1).padStart(2, "0")}`,
}));
assertArcCoverage(arcs, 325);

const arcForSequence = new Map();
for (const arc of arcs) {
  for (let sequence = Number(arc.start_sequence); sequence <= Number(arc.end_sequence); sequence += 1) {
    arcForSequence.set(sequence, arc.arc_id);
  }
  arc.start_label = `${arc.start_sequence}화`;
  arc.end_label = `${arc.end_sequence}화`;
  arc.episode_count = String(Number(arc.end_sequence) - Number(arc.start_sequence) + 1);
}

for (const row of chapters.rows) {
  row.arc_id = arcForSequence.get(Number(row.sequence));
  row.visible_label = `${row.sequence}화`;
}
for (const row of pacing.rows) {
  row.arc_id = arcForSequence.get(Number(row.sequence));
  row.visible_label = `${row.sequence}화`;
}

await writeFile(resolve(analysisDir, "chapter_map.csv"), renderCsv(chapterHeader, chapters.rows), "utf8");
await writeFile(resolve(analysisDir, "arc_pacing.csv"), renderCsv(pacingHeader, pacing.rows), "utf8");
await writeFile(resolve(analysisDir, "arc_map.csv"), renderCsv(arcHeader, arcs), "utf8");
await writeFile(resolve(analysisDir, "arc_atlas.md"), await renderAtlas(arcs, chapters.rows, pacing.rows), "utf8");

console.log(`Assembled ${chapters.rows.length} chapters, ${pacing.rows.length} pacing rows, and ${arcs.length} Arcs.`);

async function readFragments(names) {
  const allRows = [];
  let header;
  for (const name of names) {
    const [currentHeader, ...rows] = parseCsv(await readFile(resolve(workDir, name), "utf8"));
    if (!header) header = currentHeader;
    else assertHeader(currentHeader, header, name);
    for (const values of rows) {
      if (values.length !== currentHeader.length) {
        throw new Error(`${name}: expected ${currentHeader.length} columns, got ${values.length}`);
      }
      allRows.push(Object.fromEntries(currentHeader.map((key, index) => [key, values[index]])));
    }
  }
  return { header: header ?? [], rows: allRows };
}

function assertHeader(actual, expected, label) {
  if (actual.join(",") !== expected.join(",")) {
    throw new Error(`${label}: unexpected header ${actual.join(",")}`);
  }
}

function assertSequences(rows, count, label) {
  if (rows.length !== count) throw new Error(`${label}: ${rows.length} rows, expected ${count}`);
  rows.forEach((row, index) => {
    if (Number(row.sequence) !== index + 1) {
      throw new Error(`${label}: expected sequence ${index + 1}, got ${row.sequence}`);
    }
  });
}

function assertArcCoverage(arcs, count) {
  let expected = 1;
  for (const arc of arcs) {
    const start = Number(arc.start_sequence);
    const end = Number(arc.end_sequence);
    if (start !== expected) throw new Error(`${arc.arc_candidate} starts ${start}, expected ${expected}`);
    if (end < start) throw new Error(`${arc.arc_candidate} has inverted range`);
    expected = end + 1;
  }
  if (expected !== count + 1) throw new Error(`Arc coverage ends ${expected - 1}, expected ${count}`);
}

function renderCsv(header, rows) {
  return `${[
    header.map(escapeCsv).join(","),
    ...rows.map((row) => header.map((key) => escapeCsv(row[key] ?? "")).join(",")),
  ].join("\n")}\n`;
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function renderAtlas(arcs, chapterRows, pacingRows) {
  const chapterBySequence = new Map(chapterRows.map((row) => [Number(row.sequence), row]));
  const pacingBySequence = new Map(pacingRows.map((row) => [Number(row.sequence), row]));
  const toc = [
    "# 《남자의 길》 Arc Atlas",
    "",
    "## 1. 작품 전체 독자 계약",
    "",
    "공채 탈락과 연인의 배신, 부모의 등록금 빚 앞에서 원양어선을 택한 강혁이 대성 6호 동료들의 피값을 갚고 자기 사람의 생계와 안전을 책임지며 콜롬비아 암흑가·국제 자원 사업·한국 재벌·국가기관의 판을 차례로 넘는다. 매 Arc는 강혁이 피할 수 있는 손해 대신 책임질 사람을 고르는 선택에서 출발하고, 주먹·총·정보·계약·지분·여론 중 해당 전장에 맞는 행동으로 상대를 꺾은 뒤 돈·구역·생존·관계·삶의 자리 중 하나를 실제 영수증으로 지급한다.",
    "",
    "## 2. 전체 Arc 목차",
    "",
    "| Arc | 사건형 이름 | 회차 | 길이 | 중심 결산 |",
    "| --- | --- | ---: | ---: | --- |",
    ...arcs.map((arc) => `| ${arc.arc_id} | ${cell(arc.arc_name)} | ${arc.start_sequence}~${arc.end_sequence} | ${arc.episode_count} | ${cell(arc.concrete_payoff)} |`),
    "",
    "> 자연 사건 Arc는 고정 길이로 자르지 않았다. 원문의 목표·상대/장소·결산/상태 변화가 함께 움직이는 지점에서 최소 두 경계 신호를 확인했다.",
    "",
  ];

  const sections = arcs.flatMap((arc) => {
    const beats = [];
    for (let sequence = Number(arc.start_sequence); sequence <= Number(arc.end_sequence); sequence += 1) {
      const chapter = chapterBySequence.get(sequence);
      const pace = pacingBySequence.get(sequence);
      beats.push(`| ${sequence} | ${cell(chapter.visible_label)} | ${cell(pace.arc_phase)} | ${cell(pace.concrete_event)} | ${pace.tension_1_10}/${pace.reward_1_10}/${pace.hook_1_10} | ${cell(chapter.ending_hook)} |`);
    }
    return [
      `## ${arc.arc_id} · ${arc.arc_name} (${arc.start_sequence}~${arc.end_sequence}화)`,
      "",
      `- 주요 인물: ${arc.main_characters}`,
      `- 주요 장소: ${arc.main_locations}`,
      `- 발단과 목표: ${arc.concrete_premise}`,
      `- 중심 질문: ${arc.central_question}`,
      `- 독자 약속: ${arc.promise}`,
      `- 압력 상승: ${arc.pressure_escalation}`,
      `- 중간 전환: ${arc.mid_turn}`,
      `- 구체 결산: ${arc.concrete_payoff}`,
      `- 관계 변화: ${arc.relationship_change}`,
      `- 지위·능력 변화: ${arc.status_or_ability_change}`,
      `- 잔여 비용: ${arc.residual_cost}`,
      `- 다음 Arc 연결: ${arc.next_arc_bridge}`,
      `- 경계 신호: ${arc.boundary_signals}`,
      `- 경계 신뢰도: ${arc.confidence}`,
      "",
      "| 회차 | 표식 | Arc 단계 | 구체 비트 | 긴장/보상/훅 | 종료 훅 |",
      "| ---: | --- | --- | --- | --- | --- |",
      ...beats,
      "",
    ];
  });

  return `${[...toc, ...sections, ...atlasAfterword()].join("\n")}\n`;
}

function atlasAfterword() {
  return [
    "## 3. 초반·중반·후반의 리듬 변화",
    "",
    "초반은 취업·실연·빚이라는 생활 좌절을 대성 6호 참사와 개인 복수로 급격히 바꾸고, 골목과 나이트클럽에서 시작한 행동을 카르텔·마피아·FARC 전쟁까지 확대한다. 중반은 귀국·가족·수영·미리내 커피라는 생활 면을 넣은 뒤 광성회·밀로노프·가스관·평양·콜롬비아 내전으로 국제 규모를 올린다. 후반은 CIA의 배신을 닫고 에코 시티·광산·한소그룹·소말리아·삼합회·스미요시가이를 합법 계약과 비합법 행동의 두 장부로 수렴한다.",
    "",
    "긴장 고점은 습격·전쟁·인질 구출·도쿄 저택 총격에 몰리지만, 보상 고점은 전투 직후뿐 아니라 유족 보상, 발주서 도착, 공장 증설, 지분 확보, 부하 치료, 청혼과 출산에 분산된다. 이 때문에 전투가 끝나도 다음 화를 읽을 물질·관계 보상이 남는다.",
    "",
    "## 4. 결말 Arc의 수렴과 지급",
    "",
    "마지막 국면은 백민용의 한소그룹과 와타나베의 스미요시가이가 하나의 위협으로 결합하면서 한국 사업·암흑가 체면·가족 안전을 동시에 건드린다. 강혁은 경찰 수사와 내부 균열, 고다마의 쿠데타, 도쿄 저택 직접 습격을 겹쳐 와타나베를 단죄한다. 한국 사업체와 한소 계열사를 흡수해 미리내 그룹을 재계 5위권으로 키우는 지위 보상 뒤, 수영과의 아들·딸과 평범한 봄날이라는 삶의 보상이 최종 지급된다.",
    "",
    "## 5. 경계가 겹치거나 해석 여지가 있는 구간",
    "",
    "- 108/109화는 광성회·흑사 습격의 피해와 왕국원 보복이 이어지는 접경이다. 피케 생존 확인과 시화호 농장으로 목표·장소가 이동하므로 109화를 새 Arc 시작으로 두었다.",
    "- 216/217화는 광성 솔라텍 인수·나래 시티 진입 뒤 적자 해법이 시작되는 접경이다. 217화에서 저급 부품 거절과 여론전이라는 새 선택이 전면화되므로 별도 Arc로 두었다.",
    "- 원문의 사건형 대단락 제목은 중요한 후보 근거지만 그대로 71개를 확정하지 않았다. 같은 중심 질문이 이어지는 대단락은 합치고, 한 대단락 안에서 목표·상대·결산이 교대하면 나눴다.",
    "- 마리아와 수영의 관계는 결혼과 에필로그로 수영 축이 종착되지만 마리아 쪽 감정 비용이 완전히 닫히지 않는다. 이를 완료된 관계 루프로 기록하지 않았다.",
  ];
}

function cell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

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
    else if (char === "\n") { row.push(field.endsWith("\r") ? field.slice(0, -1) : field); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (quoted) throw new Error("CSV has an unclosed quoted field");
  if (field !== "" || row.length > 0) { row.push(field.endsWith("\r") ? field.slice(0, -1) : field); rows.push(row); }
  return rows.filter((candidate) => !(candidate.length === 1 && candidate[0] === ""));
}
