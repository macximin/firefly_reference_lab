import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workDir = dirname(fileURLToPath(import.meta.url));
const outputDir = dirname(workDir);
const chapterFiles = [
  "early_001_074.jsonl",
  "middle_075_148.jsonl",
  "late_149_220.jsonl",
];

const chapterHeader = [
  "sequence",
  "visible_label",
  "title",
  "start_line",
  "end_line",
  "entry_state",
  "reader_promise",
  "protagonist_goal",
  "action",
  "resistance_or_cost",
  "turn_or_reveal",
  "paid_reward",
  "state_change_axis",
  "state_change",
  "ending_hook",
  "closed_loops",
  "opened_loops",
  "arc_id",
  "confidence",
];

const arcHeader = [
  "arc_id",
  "arc_name",
  "start_sequence",
  "end_sequence",
  "start_label",
  "end_label",
  "episode_count",
  "main_characters",
  "main_locations",
  "concrete_premise",
  "central_question",
  "promise",
  "pressure_escalation",
  "mid_turn",
  "concrete_payoff",
  "relationship_change",
  "status_or_ability_change",
  "residual_cost",
  "next_arc_bridge",
  "boundary_signals",
  "confidence",
];

const pacingHeader = [
  "sequence",
  "visible_label",
  "arc_id",
  "arc_phase",
  "concrete_event",
  "tension_1_10",
  "reward_1_10",
  "hook_1_10",
  "information_weight",
  "action_weight",
  "relationship_weight",
  "emotion_weight",
  "material_or_status_weight",
  "pacing_note",
];

function loadJsonl(path) {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${path}:${index + 1}: ${error.message}`);
      }
    });
}

function valueText(value) {
  if (Array.isArray(value)) return value.join(" | ").replaceAll("왕태성", "왕주형");
  if (value === null || value === undefined) return "";
  return String(value).replaceAll("왕태성", "왕주형");
}

function csvEscape(value) {
  const text = valueText(value);
  if (/[",\r\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function writeCsv(filename, header, rows) {
  const output = [header.join(",")];
  for (const row of rows) {
    output.push(header.map((key) => csvEscape(row[key])).join(","));
  }
  writeFileSync(join(outputDir, filename), `${output.join("\n")}\n`, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertText(value, context) {
  const valid = Array.isArray(value)
    ? value.length > 0 && value.every((item) => typeof item === "string" && item.trim().length > 0)
    : typeof value === "string" && value.trim().length > 0;
  assert(valid, `${context} must contain non-empty text`);
}

function mdCell(value) {
  return valueText(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function average(values) {
  return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1);
}

function spark(values) {
  const bars = "▁▂▃▄▅▆▇█";
  return values.map((value) => bars[Math.max(0, Math.min(7, Math.round(((value - 1) / 9) * 7)))]).join("");
}

const chapters = chapterFiles
  .flatMap((filename) => loadJsonl(join(workDir, filename)))
  .sort((left, right) => left.sequence - right.sequence);
const arcs = JSON.parse(readFileSync(join(workDir, "arc_definitions.json"), "utf8"))
  .sort((left, right) => left.start_sequence - right.start_sequence);

assert(chapters.length === 220, `expected 220 chapters, got ${chapters.length}`);
for (const [index, chapter] of chapters.entries()) {
  const expected = index + 1;
  const labelMatch = chapter.title.match(/(\d+화(?:\(완결화\))?)$/);
  assert(labelMatch, `could not derive visible label from title at ${expected}: ${chapter.title}`);
  chapter.visible_label = labelMatch[1];
  assert(chapter.sequence === expected, `chapter sequence mismatch at index ${index}: ${chapter.sequence}`);
  const expectedLabel = expected === 220 ? "220화(완결화)" : `${expected}화`;
  assert(chapter.visible_label === expectedLabel, `visible label mismatch at ${expected}: ${chapter.visible_label}`);
  assert(Number.isInteger(chapter.start_line) && Number.isInteger(chapter.end_line), `invalid line range at ${expected}`);
  assert(chapter.start_line <= chapter.end_line, `reversed line range at ${expected}`);
  if (index > 0) {
    assert(chapter.start_line === chapters[index - 1].end_line + 1, `line range gap/overlap before ${expected}`);
  }
  for (const field of chapterHeader.filter((field) => !["arc_id", "closed_loops", "opened_loops"].includes(field))) {
    assert(chapter[field] !== undefined && chapter[field] !== null, `missing ${field} at chapter ${expected}`);
  }
  for (const field of ["tension_1_10", "reward_1_10", "hook_1_10"]) {
    assert(Number.isInteger(chapter[field]) && chapter[field] >= 1 && chapter[field] <= 10, `${field} out of range at ${expected}`);
  }
  for (const field of ["information_weight", "action_weight", "relationship_weight", "emotion_weight", "material_or_status_weight"]) {
    assert(["low", "medium", "high"].includes(chapter[field]), `${field} invalid at ${expected}: ${chapter[field]}`);
  }
  assert(Array.isArray(chapter.closed_loops), `closed_loops must be an array at ${expected}`);
  assert(Array.isArray(chapter.opened_loops), `opened_loops must be an array at ${expected}`);
}

assert(arcs.length > 0, "arc_definitions.json is empty");
for (const [index, arc] of arcs.entries()) {
  const id = `ARC-${String(index + 1).padStart(3, "0")}`;
  arc.arc_id = id;
  assert(Number.isInteger(arc.start_sequence) && Number.isInteger(arc.end_sequence), `${id} has invalid range`);
  assert(arc.start_sequence <= arc.end_sequence, `${id} has reversed range`);
  assert(arc.start_sequence === (index === 0 ? 1 : arcs[index - 1].end_sequence + 1), `${id} is not contiguous with the prior Arc`);
  assert(Array.isArray(arc.boundary_signals) && arc.boundary_signals.length >= 2, `${id} needs at least two boundary signals`);
  for (const field of arcHeader.filter((field) => !["arc_id", "start_sequence", "end_sequence", "start_label", "end_label", "episode_count", "boundary_signals"].includes(field))) {
    assertText(arc[field], `${id}.${field}`);
  }
  const startChapter = chapters[arc.start_sequence - 1];
  const endChapter = chapters[arc.end_sequence - 1];
  arc.start_label = startChapter.visible_label;
  arc.end_label = endChapter.visible_label;
  arc.episode_count = arc.end_sequence - arc.start_sequence + 1;
}
assert(arcs.at(-1).end_sequence === 220, `last Arc ends at ${arcs.at(-1).end_sequence}, not 220`);

for (const chapter of chapters) {
  const arc = arcs.find((candidate) => chapter.sequence >= candidate.start_sequence && chapter.sequence <= candidate.end_sequence);
  assert(arc, `chapter ${chapter.sequence} has no Arc`);
  chapter.arc_id = arc.arc_id;
}

writeCsv("chapter_map.csv", chapterHeader, chapters);
writeCsv("arc_map.csv", arcHeader, arcs);
writeCsv("arc_pacing.csv", pacingHeader, chapters);

const atlas = [];
atlas.push("# 《이혼 후 재벌 각성!》 Arc 구조도");
atlas.push("");
atlas.push("## 1. 작품 전체 독자 계약");
atlas.push("");
atlas.push("이혼으로 자기 삶의 가치를 처음 재평가한 강산이 숨겨진 재벌 혈통, 커리어 스캔, 미래 역사 일지를 이용해 경제적 주도권을 되찾는다. 독자가 기다리는 보상은 숫자의 증가만이 아니다. 강산을 무능한 남편·어린 상속자·경험 없는 회장으로 보던 인물이 구체 사건을 목격한 뒤 호칭·거래·관계·행동을 바꾸고, 그 변화가 다시 지분·직책·생활·국가 미래의 결과로 남아야 한 주기가 끝난다.");
atlas.push("");
atlas.push("Arc 길이는 미리 고정하지 않았다. 지배 목표의 교체, 상대·장소의 전환, 누적 약속의 실제 결산, 되돌릴 수 없는 돈·지위·관계·세계 상태 변화 가운데 두 신호 이상이 겹치는 지점을 경계로 삼았다. 아래 모든 회차는 파일 순서 기준 정확히 하나의 Arc에 속한다.");
atlas.push("");
atlas.push("## 2. 전체 Arc 목차");
atlas.push("");
atlas.push("| Arc | 사건형 이름 | 범위 | 화수 | 중앙 질문 | 실제 결산 | 신뢰도 |");
atlas.push("| --- | --- | ---: | ---: | --- | --- | --- |");
for (const arc of arcs) {
  atlas.push(`| ${arc.arc_id} | ${mdCell(arc.arc_name)} | ${arc.start_label}~${arc.end_label} | ${arc.episode_count} | ${mdCell(arc.central_question)} | ${mdCell(arc.concrete_payoff)} | ${arc.confidence} |`);
}

atlas.push("");
atlas.push("## 3. Arc별 사건·회차·페이싱");
for (const arc of arcs) {
  const rows = chapters.slice(arc.start_sequence - 1, arc.end_sequence);
  const tension = rows.map((row) => row.tension_1_10);
  const reward = rows.map((row) => row.reward_1_10);
  const hook = rows.map((row) => row.hook_1_10);
  atlas.push("");
  atlas.push(`### ${arc.arc_id} · ${arc.arc_name} (${arc.start_label}~${arc.end_label}, ${arc.episode_count}화)`);
  atlas.push("");
  atlas.push(`- 주요 인물: ${valueText(arc.main_characters)}`);
  atlas.push(`- 주요 장소: ${valueText(arc.main_locations)}`);
  atlas.push(`- 발단: ${arc.concrete_premise}`);
  atlas.push(`- 중앙 질문: ${arc.central_question}`);
  atlas.push(`- 독자 약속: ${arc.promise}`);
  atlas.push(`- 압력 상승: ${arc.pressure_escalation}`);
  atlas.push(`- 중간 전환: ${arc.mid_turn}`);
  atlas.push(`- 실제 보상: ${arc.concrete_payoff}`);
  atlas.push(`- 관계 변화: ${arc.relationship_change}`);
  atlas.push(`- 지위·능력 변화: ${arc.status_or_ability_change}`);
  atlas.push(`- 잔여 비용: ${arc.residual_cost}`);
  atlas.push(`- 다음 Arc 다리: ${arc.next_arc_bridge}`);
  atlas.push("");
  atlas.push("경계 근거:");
  atlas.push("");
  for (const signal of arc.boundary_signals) atlas.push(`- ${signal}`);
  atlas.push("");
  atlas.push(`페이싱 개요: 긴장 평균 ${average(tension)} ${spark(tension)} · 보상 평균 ${average(reward)} ${spark(reward)} · 훅 평균 ${average(hook)} ${spark(hook)}`);
  atlas.push("");
  atlas.push("#### 회차별 구체 비트와 종료 훅");
  atlas.push("");
  atlas.push("| 회차 | 단계 | 실제 사건 | 이번 화 지급 | 종료 훅 |");
  atlas.push("| ---: | --- | --- | --- | --- |");
  for (const row of rows) {
    atlas.push(`| ${row.visible_label} | ${mdCell(row.arc_phase)} | ${mdCell(row.concrete_event)} | ${mdCell(row.paid_reward)} | ${mdCell(row.ending_hook)} |`);
  }
  atlas.push("");
  atlas.push("#### 회차별 페이싱 수치");
  atlas.push("");
  atlas.push("| 회차 | 긴장 | 보상 | 훅 | 정보 | 행동 | 관계 | 감정 | 물질·지위 | 판단 |");
  atlas.push("| ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- |");
  for (const row of rows) {
    atlas.push(`| ${row.visible_label} | ${row.tension_1_10} | ${row.reward_1_10} | ${row.hook_1_10} | ${row.information_weight} | ${row.action_weight} | ${row.relationship_weight} | ${row.emotion_weight} | ${row.material_or_status_weight} | ${mdCell(row.pacing_note)} |`);
  }
}

atlas.push("");
atlas.push("## 4. 초반·중반·후반의 리듬 변화");
atlas.push("");
atlas.push("### 초반 · 1~74화");
atlas.push("");
atlas.push("이혼, 숨은 출생 공개, 교통사고, 각성, 허준수 일가 사망, 장례와 상속전이 짧은 간격으로 겹친다. 보상도 양혜원의 즉각적인 후회, 유일 상주 자리, 허광호 공개 제압, 차지혜·강덕수 영입, 창식과 노진구의 생활 변화처럼 얼굴과 행동이 선명하다. 박탈 직후 역전이 오고, 역전 직후 더 큰 비용이 오는 톱니 리듬이 가장 강한 구간이다.");
atlas.push("");
atlas.push("### 중반 · 75~148화");
atlas.push("");
atlas.push("마이크로소프트 수익과 대출이 대현전자 빅딜, 중국 인터넷·게임, 전자 인재, 유통·커피·면세, 철강 재편으로 분기된다. 한 화의 충돌보다 3~수 화 동안 협상안을 바꾸고 주주총회·계약·제품 조직으로 결산하는 비중이 커진다. 숫자 보상 사이에 허지태·허지훈·김말숙·조현경의 태도 변화와 양혜원 출산·친부 공개가 관계의 촉감을 되돌린다. 강산의 회장 취임은 상속 지위의 큰 결산이자 IMF 전 체질 변경의 출발점이다.");
atlas.push("");
atlas.push("### 후반 · 149~220화");
atlas.push("");
atlas.push("대양조선 4조 원 매각과 부채비율 0%, 자동차 노조전 뒤 IMF가 현실화되면서 회차당 금액과 상대가 기업에서 은행·정부·해외 권력으로 커진다. 동시에 양혜원의 새 가정, 왕혜은과의 보육원·데이트, 김대한의 가족 인정이 개인 보상을 보충한다. 마지막은 스마트폰·국민 펀드·7광구로 압축된 긴 시간 점프를 사용해 한 사람의 정보가 국가의 연금·일자리·철도를 바꾼 결과를 지급한다.");

atlas.push("");
atlas.push("## 5. 결말 Arc의 수렴과 지급");
atlas.push("");
atlas.push("결말은 1억 원 달러 매입에서 시작한 미래 지식의 효용을 국가 자본과 에너지 자립으로 확장한다. 2002년 7광구 첫 시추 실패를 바로 성공으로 덮지 않고, 강산이 50개 플랜트를 지시한 뒤 2011년 반복 성공이라는 시간 비용을 낸다. 연금 고갈 연도 2500년, 일자리·인구·철도 변화는 돈을 공공 생활로 환전한 최종 물질 보상이다. 미래 역사 일지에 북한 후계와 2014년 서한만 성공이 새로 기록되는 순간, 강산은 정답을 읽는 사람이 아니라 정답지를 바꾼 사람으로 완성된다.");
atlas.push("");
atlas.push("개인 관계에서는 양혜원이 브라운과 아이를 중심으로 새 가정을 선택해 이혼 루프가 닫힌다. 왕혜은은 강산에게 평범한 생활의 가능성을 돌려주지만, 정식 청혼과 결혼식은 장면으로 완전히 지급되지 않는다. 따라서 세계 보상은 크고 선명하지만 개인의 마지막 생활 보상은 일부 생략된 결말로 판정한다.");

atlas.push("");
atlas.push("## 6. 근거가 약하거나 경계가 겹치는 구간");
atlas.push("");
atlas.push("- 양혜원 관계선은 1화에서 시작해 155화에 닫히므로 여러 사업 Arc 위를 가로지른다. 각 회차는 지배 사건 Arc 하나에 배정하되, 관계선은 장기 독자 계약으로 별도 해석했다.");
atlas.push("- 허준수 일가 전용기 사고 의혹은 중반에 다시 제기되지만 완결까지 최종 범인·증거·처분을 명확히 확인하기 어렵다. 상속전의 발단은 확정이나 미스터리 보상은 잔여 부채다.");
atlas.push("- 회장 취임 전후에는 전자·철강·양혜원·대양조선 준비가 병렬 진행돼 단일 목표 경계가 일부 겹친다. 실제 장소·상대 교체와 지위의 비가역 변화를 함께 사용해 주 Arc를 정했다.");
atlas.push("- 왕혜은과의 결혼은 후반 인물들의 계획과 대화로 확정 방향이 제시되지만, 정식 청혼·결혼식의 화면상 지급은 확인되지 않는다.");
atlas.push("- 애플 적대적 인수는 선언과 진행 보고가 있으나 최종 소유권 이전은 본편 안에서 완료되지 않는다. 스마트폰 선점 보상과 애플 인수 약속을 구분했다.");
atlas.push("- 최종화의 서한만 사업은 완결된 본편 보상이라기보다 바뀐 미래가 여는 의도된 다음 다리다.");
atlas.push("");
atlas.push("각 경계의 세부 신뢰도와 두 개 이상의 근거는 `arc_map.csv`에, 모든 회차의 진입·목표·저항·지급·상태 변화는 `chapter_map.csv`에 보존했다.");

writeFileSync(join(outputDir, "arc_atlas.md"), `${atlas.join("\n")}\n`, "utf8");

console.log(JSON.stringify({ chapters: chapters.length, arcs: arcs.length, firstLine: chapters[0].start_line, lastLine: chapters.at(-1).end_line }, null, 2));
