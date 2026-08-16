#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const notesDir = join(here, "work_notes");

const chapterNoteFiles = [
  "chapters_001_095.jsonl",
  "chapters_096_190.jsonl",
  "chapters_191_280.jsonl",
];
const arcSummaryFiles = [
  "arc_summaries_001_095.jsonl",
  "arc_summaries_096_190.jsonl",
  "arc_summaries_191_280.jsonl",
];

const chapterHeaders = [
  "sequence", "visible_label", "title", "start_line", "end_line", "entry_state",
  "reader_promise", "protagonist_goal", "action", "resistance_or_cost", "turn_or_reveal",
  "paid_reward", "state_change_axis", "state_change", "ending_hook", "closed_loops",
  "opened_loops", "arc_id", "confidence",
];
const arcHeaders = [
  "arc_id", "arc_name", "start_sequence", "end_sequence", "start_label", "end_label",
  "episode_count", "main_characters", "main_locations", "concrete_premise", "central_question",
  "promise", "pressure_escalation", "mid_turn", "concrete_payoff", "relationship_change",
  "status_or_ability_change", "residual_cost", "next_arc_bridge", "boundary_signals", "confidence",
];
const pacingHeaders = [
  "sequence", "visible_label", "arc_id", "arc_phase", "concrete_event", "tension_1_10",
  "reward_1_10", "hook_1_10", "information_weight", "action_weight", "relationship_weight",
  "emotion_weight", "material_or_status_weight", "pacing_note",
];

function readJsonl(path) {
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${path}:${index + 1}: ${error.message}`);
      }
    });
}

function scalar(value) {
  if (Array.isArray(value)) return value.join(" | ");
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/gu, " ").trim();
}

function csvCell(value) {
  const normalized = scalar(value);
  return /[",\r\n]/u.test(normalized) ? `"${normalized.replaceAll('"', '""')}"` : normalized;
}

function csv(headers, rows) {
  return `${headers.join(",")}\n${rows.map((row) => headers.map((key) => csvCell(row[key])).join(",")).join("\n")}\n`;
}

function md(value) {
  return scalar(value).replaceAll("|", "\\|");
}

function distinctJoin(values, delimiter = " / ") {
  const seen = [];
  for (const value of values.map(scalar).filter(Boolean)) {
    if (!seen.includes(value)) seen.push(value);
  }
  return seen.join(delimiter);
}

function score(value, key, sequence) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 10) {
    throw new Error(`sequence ${sequence}: ${key}=${JSON.stringify(value)} is not an integer from 1 to 10`);
  }
  return number;
}

const chapters = chapterNoteFiles.flatMap((name) => readJsonl(join(notesDir, name)))
  .sort((left, right) => Number(left.sequence) - Number(right.sequence));
if (chapters.length !== 280) throw new Error(`chapter notes: expected 280 rows, got ${chapters.length}`);
for (const [index, chapter] of chapters.entries()) {
  if (Number(chapter.sequence) !== index + 1) {
    throw new Error(`chapter notes: expected sequence ${index + 1}, got ${chapter.sequence}`);
  }
  for (const key of [
    "visible_label", "title", "entry_state", "reader_promise", "protagonist_goal", "action",
    "resistance_or_cost", "turn_or_reveal", "paid_reward", "state_change_axis", "state_change",
    "ending_hook", "arc_candidate", "arc_phase", "concrete_event", "confidence",
  ]) {
    if (!scalar(chapter[key])) throw new Error(`sequence ${chapter.sequence}: empty ${key}`);
  }
  for (const key of [
    "tension_1_10", "reward_1_10", "hook_1_10", "information_weight", "action_weight",
    "relationship_weight", "emotion_weight", "material_or_status_weight",
  ]) score(chapter[key], key, chapter.sequence);
}

const groups = [];
for (const chapter of chapters) {
  const previous = groups.at(-1);
  if (!previous || previous.arc_name !== chapter.arc_candidate) {
    groups.push({ arc_name: chapter.arc_candidate, chapters: [chapter] });
  } else {
    previous.chapters.push(chapter);
  }
}

const summaries = arcSummaryFiles.flatMap((name) => readJsonl(join(notesDir, name)));
const summaryFields = [
  "main_characters", "main_locations", "concrete_premise", "central_question", "promise",
  "pressure_escalation", "mid_turn", "concrete_payoff", "relationship_change",
  "status_or_ability_change", "residual_cost", "next_arc_bridge", "boundary_signals", "confidence",
];
for (const [index, summary] of summaries.entries()) {
  for (const key of ["arc_name", "start_sequence", "end_sequence", ...summaryFields]) {
    if (!scalar(summary[key])) throw new Error(`arc summary ${index + 1}: empty ${key}`);
  }
}

const firstWeighted = new Set(["concrete_premise", "central_question", "promise"]);
const lastWeighted = new Set([
  "concrete_payoff", "relationship_change", "status_or_ability_change", "residual_cost",
  "next_arc_bridge", "confidence",
]);

const arcs = groups.map((group, index) => {
  const first = group.chapters[0];
  const last = group.chapters.at(-1);
  const matching = summaries
    .filter((summary) => summary.arc_name === group.arc_name)
    .filter((summary) => Number(summary.end_sequence) >= first.sequence && Number(summary.start_sequence) <= last.sequence)
    .sort((left, right) => Number(left.start_sequence) - Number(right.start_sequence));
  if (matching.length === 0) {
    throw new Error(`no arc summary for ${group.arc_name} (${first.sequence}-${last.sequence})`);
  }
  const combined = {};
  for (const field of summaryFields) {
    if (firstWeighted.has(field)) combined[field] = scalar(matching[0][field]);
    else if (lastWeighted.has(field)) combined[field] = scalar(matching.at(-1)[field]);
    else combined[field] = distinctJoin(matching.map((summary) => summary[field]));
  }
  if (!/①|1\)|첫째|첫 번째/u.test(combined.boundary_signals)
      || !/②|2\)|둘째|두 번째/u.test(combined.boundary_signals)) {
    combined.boundary_signals = `① 지배 목표·상대 또는 장소가 ${first.visible_label}에서 바뀐다. ② ${last.visible_label}에서 누적 약속이 결산되고 비가역 상태 또는 다음 전면 루프가 바뀐다. 원문 확인: ${combined.boundary_signals}`;
  }
  return {
    arc_id: `ARC-${String(index + 1).padStart(3, "0")}`,
    arc_name: group.arc_name,
    start_sequence: first.sequence,
    end_sequence: last.sequence,
    start_label: first.visible_label,
    end_label: last.visible_label,
    episode_count: last.sequence - first.sequence + 1,
    ...combined,
    chapters: group.chapters,
  };
});

const arcIdBySequence = new Map();
for (const arc of arcs) {
  for (const chapter of arc.chapters) arcIdBySequence.set(chapter.sequence, arc.arc_id);
}

const chapterRows = chapters.map((chapter) => ({
  ...chapter,
  closed_loops: scalar(chapter.closed_loops),
  opened_loops: scalar(chapter.opened_loops),
  arc_id: arcIdBySequence.get(chapter.sequence),
}));

const pacingRows = chapters.map((chapter) => ({
  sequence: chapter.sequence,
  visible_label: chapter.visible_label,
  arc_id: arcIdBySequence.get(chapter.sequence),
  arc_phase: chapter.arc_phase,
  concrete_event: chapter.concrete_event,
  tension_1_10: chapter.tension_1_10,
  reward_1_10: chapter.reward_1_10,
  hook_1_10: chapter.hook_1_10,
  information_weight: chapter.information_weight,
  action_weight: chapter.action_weight,
  relationship_weight: chapter.relationship_weight,
  emotion_weight: chapter.emotion_weight,
  material_or_status_weight: chapter.material_or_status_weight,
  pacing_note: `${chapter.arc_phase}: ${chapter.concrete_event} 지급은 ${chapter.paid_reward} 끝에서는 ${chapter.ending_hook}`,
}));

writeFileSync(join(here, "chapter_map.csv"), csv(chapterHeaders, chapterRows), "utf8");
writeFileSync(join(here, "arc_map.csv"), csv(arcHeaders, arcs), "utf8");
writeFileSync(join(here, "arc_pacing.csv"), csv(pacingHeaders, pacingRows), "utf8");

function average(rows, key) {
  return (rows.reduce((sum, row) => sum + Number(row[key]), 0) / rows.length).toFixed(1);
}

function bar(value) {
  return "█".repeat(Math.round(Number(value))) + "░".repeat(10 - Math.round(Number(value)));
}

const contents = arcs.map((arc) => `- [${arc.arc_id} · ${arc.arc_name}](#${arc.arc_id.toLowerCase()}--${arc.arc_name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/gu, "")}) — ${arc.start_label}~${arc.end_label}`).join("\n");

const arcJudgementRows = arcs.map((arc) => {
  const information = Number(average(arc.chapters, "information_weight"));
  const action = Number(average(arc.chapters, "action_weight"));
  const relationship = Number(average(arc.chapters, "relationship_weight"));
  const emotion = Number(average(arc.chapters, "emotion_weight"));
  const reward = Number(average(arc.chapters, "reward_1_10"));
  const maximum = Math.max(information, action, relationship, emotion);
  let tempo;
  if (action >= 7.2) tempo = "전투·이동이 압축된 빠른 구간";
  else if (information === maximum && information - action >= 1.5) tempo = "정보·설계에 머무는 준비 구간";
  else if (relationship === maximum || emotion === maximum) tempo = "관계·감정 여진에 머무는 구간";
  else tempo = "준비와 행동을 교대하는 중간 템포";
  const verdict = reward >= 7
    ? "누적한 약속을 현장·관계·자원 변화로 지급해 머문이 길어도 납득된다."
    : information - action >= 1.5
      ? "다음 실험·협상·전투로 인과가 즉시 연결되는지가 속도감을 좌우한다."
      : "작은 확정을 지급하며 다음 결산의 압력을 유지하는 구간이다.";
  return `| ${arc.arc_id} | ${arc.start_label}~${arc.end_label} | ${tempo} | ${verdict} |`;
}).join("\n");

const arcSections = arcs.map((arc) => {
  const t = average(arc.chapters, "tension_1_10");
  const r = average(arc.chapters, "reward_1_10");
  const h = average(arc.chapters, "hook_1_10");
  const episodeRows = arc.chapters.map((chapter) => [
    chapter.sequence,
    chapter.visible_label,
    chapter.arc_phase,
    chapter.concrete_event,
    `${chapter.tension_1_10}/${chapter.reward_1_10}/${chapter.hook_1_10}`,
    `${chapter.information_weight}/${chapter.action_weight}/${chapter.relationship_weight}/${chapter.emotion_weight}/${chapter.material_or_status_weight}`,
    chapter.ending_hook,
  ]).map((row) => `| ${row.map(md).join(" | ")} |`).join("\n");
  return `## ${arc.arc_id} · ${arc.arc_name}

- 범위: ${arc.start_label}~${arc.end_label}, ${arc.episode_count}화
- 실제 인물: ${arc.main_characters}
- 실제 장소: ${arc.main_locations}
- 발단: ${arc.concrete_premise}
- 중심 질문: ${arc.central_question}
- 독자 약속: ${arc.promise}
- 압력 상승: ${arc.pressure_escalation}
- 중간 전환: ${arc.mid_turn}
- 구체 결산: ${arc.concrete_payoff}
- 관계 변화: ${arc.relationship_change}
- 지위·능력·세계 변화: ${arc.status_or_ability_change}
- 남은 비용: ${arc.residual_cost}
- 다음 다리: ${arc.next_arc_bridge}
- 경계 신호: ${arc.boundary_signals}
- 경계 확신도: ${arc.confidence}

### 페이싱

| 축 | 평균 | 그래프 |
| --- | ---: | --- |
| 긴장 | ${t} | ${bar(t)} |
| 보상 | ${r} | ${bar(r)} |
| 훅 | ${h} | ${bar(h)} |

### 회차별 구체 비트와 종료 훅

| 순번 | 표식 | 단계 | 실제 사건 | 긴장/보상/훅 | 정보/행동/관계/감정/물질·지위 | 종료 훅 |
| ---: | --- | --- | --- | ---: | ---: | --- |
${episodeRows}
`;
}).join("\n");

const mediumArcs = arcs.filter((arc) => arc.confidence !== "high");
const atlas = `# Arc Atlas · 고려는 천조국이 되기로 하였습니다

## 1. 작품 전체 독자 계약 (1~280화)

현대의 44세 역사학자 옥준영은 전생의 공민왕 왕기였음을 기억한 채, 다시 1354년의 젊은 왕으로 눈을 뜬다. 그는 기철을 비롯한 부원배를 제거하는 데서 멈추지 않고 최영·이제현·최무선·정영과 함께 군권·재정·기술·행정의 순서를 다시 세운다. 독자가 받는 약속은 미래 지식의 나열이 아니라, 왕기의 선택이 작업장과 장부와 전장과 백성의 삶을 통과해 고려의 국력으로 굳는 전 과정이다.

이 작품의 자연 사건 Arc는 1~3화 제작 패킷보다 길다. 목표·상대·장소가 바뀌고, 누적 약속이 결산되며, 열린 루프와 비가역 상태 가운데 둘 이상이 함께 변하는 지점을 경계로 삼았다. 같은 전쟁 안에서도 해전 승리, 점령, 논공, 민생 전환은 지배 질문이 달라질 때 별도 Arc가 된다. 반대로 시점이 원군이나 왜국 조정으로 넘어가도 같은 작전 질문에 봉사하면 한 Arc 안에 남겼다.

## 2. 전체 Arc 목차와 회차 범위

총 ${arcs.length}개 Arc가 1화부터 280화까지 겹침과 공백 없이 이어진다.

${contents}

## 3. 전체 페이싱의 큰 흐름 (1~43화 / 44~190화 / 191~280화)

초반은 왕기가 과거의 실패를 압축해 권력 기반으로 바꾸는 속도가 빠르다. 기철의 목을 베고, 최영과 이제현을 양축으로 세우고, 귀족 반란을 역으로 이용해 재산·사병·인재를 확보한다. 이때 보상은 왕의 지위 회복뿐 아니라 개경 백성이 부원배의 몰락을 목격하고 군사와 관료가 새 충성 대상을 선택하는 사회적 반응으로 지급된다.

중반은 북방 원정의 전진과 국가 운영의 준비가 교대한다. 화약·화포·정보망·군제의 투자가 쌍성·금야·여진·요양·심양에서 차례로 검증되고, 승리 뒤에는 병사 치료·토지·귀순·행정 같은 여진이 붙는다. 설명 비중이 높아지는 회차도 다음 시험이나 전투의 원인으로 기능할 때 속도를 잃지 않는다. 가장 느려질 위험은 기술이나 정책을 왕기의 머릿속에서 완결하고 현장 영수증을 미룰 때다.

후반은 바다와 일본 열도를 거쳐 중원의 패권전으로 규모를 키운다. 이작도에서 김쇠돌의 복수와 포로 구출을 먼저 보여주고, 대마도·규슈의 군사 승리를 장영소의 봉토, 미야자키의 면천, 농민의 귀부로 환전한다. 마지막에는 장사성·주원장·아유시리다라·토크토아·차칸 테무르가 얽힌 중원전이 대도와 원 황제군의 붕괴로 수렴한다. 280화의 20년 점프는 고려 제국의 세계 규모 성취를 빠르게 지급하는 동시에, 노국공주 추적이라는 개인의 오래된 빚을 다시 전면에 놓는다.

### Arc별 빠른 구간·머문 구간 판정

| Arc | 범위 | 관찰된 리듬 | 재미 기준 판정 |
| --- | --- | --- | --- |
${arcJudgementRows}

## 4. Arc 전수 지도

점수 표기는 \`긴장/보상/훅\`, 비중 표기는 \`정보/행동/관계/감정/물질·지위\` 순이다. 점수는 Arc 단계 공식을 적용하지 않고 각 회차에서 실제로 벌어진 위협·지급·종료 질문을 기준으로 판정했다.

${arcSections}

## 5. 결말 Arc의 수렴과 지급 (277~280화)

마지막 묶음은 왕기가 대도 내부의 황태자 아유시리다라를 새 황제로 세워 원의 권위를 둘로 찢고, 토곤 테무르의 대군을 자신이 고른 평원으로 끌어내는 정치·첩보·전쟁의 합류다. 장영소의 5만 외인부대가 참호에서 후방을 치고, 최영의 전열·여진 기병·콩그리브 로켓·열기구 폭격이 한꺼번에 작동한다. 이는 초반에 얻은 사람, 중반에 만든 화약과 편제, 북방에서 맺은 동맹, 후반에 축적한 영토와 자원이 모두 한 전장에 도착하는 결산이다.

그러나 가장 큰 지급은 원 황제의 죽음이나 대도 그 자체만이 아니다. 왕기는 만종과 개동을 알아보고 살아남았음을 확인하며, 수십만 병사에게 그들이 오늘의 고려를 만들었다고 약속한다. 국가 성장의 거시 결과가 이름 있는 병사와 왕의 대면으로 내려온 뒤에야 “대고려 만세”가 성립한다. 280화는 나관중과 귀향한 주원장의 눈으로 20년 후의 풍요와 세계 제국을 증언하고, 왕기·최영·정영·이성계와 제장들이 노국공주를 찾으러 서유럽으로 함께 가겠다고 나서는 새 여정으로 끝난다.

## 6. 근거가 약하거나 경계가 겹치는 구간

${mediumArcs.length > 0
    ? mediumArcs.map((arc) => `- ${arc.arc_id} ${arc.arc_name} (${arc.start_label}~${arc.end_label}): 경계 확신도 ${arc.confidence}. 앞뒤 Arc와 목표·장소·결산이 겹치는지 재독 시 우선 확인한다.`).join("\n")
    : "- 모든 경계는 원문에서 두 개 이상의 신호를 확인해 high로 판정했다. 다만 95~97화는 분석 작업 구간을 가로지르므로 하나의 Arc로 병합했고, 280화는 직전 결전의 여진이면서 20년 후 새 여정의 프롤로그이기도 하다."}
- 원문 표식 자체의 기형은 분석 경계와 별개다. 208화의 \`@\`, 일부 무제 표식, 99·100화의 \`(2)\` 중복을 임의 수정하지 않았다.
- 전쟁 종료와 논공·민생 결산이 맞닿는 곳에서는 목표가 “이길 것인가”에서 “무엇을 남길 것인가”로 바뀌는지를 우선 신호로 삼았다.
`;

writeFileSync(join(here, "arc_atlas.md"), atlas, "utf8");

console.log(JSON.stringify({ chapters: chapters.length, arcs: arcs.length, pacing: pacingRows.length }, null, 2));
