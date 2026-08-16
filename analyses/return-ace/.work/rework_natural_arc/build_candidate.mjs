import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const candidateDir = dirname(fileURLToPath(import.meta.url));
const analysisRoot = resolve(candidateDir, "../..");
const sourcePath = "/Users/a2501/Desktop/inkos/edge_repos/inkos_reverse_lab/private_sources/korean_webnovel_corpus/흑곰작가/리턴 에이스_흑곰작가_합본.txt";
const expectedSourceHash = "d1dd84aebe77ece8f17e4b4448b739c3106931ccec5f2008933b385b74b8ba45";
const expectedChapters = 310;

const manualReviewPaths = [
  join(candidateDir, "manual_review_001_025.md"),
  join(candidateDir, "manual_review_026_103.md"),
  join(candidateDir, "manual_review_104_207.md"),
  join(candidateDir, "manual_review_208_310.md"),
];

const manualChapterFactAuthorityPath = join(candidateDir, "manual_chapter_fact_authority.csv");

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

const boundaryHeader = [
  "arc_id",
  "start_sequence",
  "end_sequence",
  "arc_name",
  "metadata_source",
  "confidence",
];

const manualReviewFields = [
  "진입 장면",
  "Arc 단계",
  "긴장",
  "보상 강도",
  "훅 강도",
  "정보 리본",
  "행동 리본",
  "관계 리본",
  "감정 리본",
  "물질/지위 리본",
  "보상 범위",
  "페이싱 근거",
  "종료 훅",
  "닫힌 루프",
  "열린 루프",
];

const chapterFactFields = [
  "reader_promise",
  "protagonist_goal",
  "action",
  "resistance_or_cost",
  "turn_or_reveal",
  "paid_reward",
  "state_change",
];

const manualArcFields = [
  "주요 인물",
  "주요 장소/팀",
  "구체 전제",
  "중심 질문",
  "약속",
  "압력 상승",
  "중간 전환",
  "구체 결산",
  "관계 변화",
  "지위/능력/기록 변화",
  "잔여 비용",
  "다음 Arc 다리",
  "경계 신호",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bufferOrText) {
  return createHash("sha256").update(bufferOrText).digest("hex");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function readCsv(path, expectedHeader) {
  const parsed = parseCsv(readFileSync(path, "utf8"));
  assert(parsed.length > 1, `${path}: CSV has no data rows`);
  const [header, ...values] = parsed;
  assert(header.join(",") === expectedHeader.join(","), `${path}: header mismatch`);
  return values.map((row, index) => {
    assert(row.length === header.length, `${path}: row ${index + 2} has ${row.length}/${header.length} cells`);
    return Object.fromEntries(header.map((key, column) => [key, row[column]]));
  });
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
}

function renderCsv(header, rows) {
  const lines = [header.join(",")];
  for (const row of rows) lines.push(header.map((key) => csvCell(row[key])).join(","));
  return `${lines.join("\n")}\n`;
}

function headingBlocks(markdown) {
  const matches = [...markdown.matchAll(/^##\s+(.+?)\s*$/gm)];
  return matches.map((match, index) => ({
    title: match[1].trim(),
    body: markdown.slice(match.index + match[0].length, matches[index + 1]?.index ?? markdown.length),
  }));
}

function parseLabeledFields(body, expectedFields) {
  const fields = {};
  for (const line of body.split(/\r?\n/)) {
    const match = line.match(/^-\s+([^:]+):\s*(.*?)\s*$/);
    if (!match) continue;
    const key = match[1].trim();
    if (expectedFields.includes(key)) fields[key] = match[2].trim();
  }
  return fields;
}

function parseManualReviews(path) {
  const reviews = [];
  for (const block of headingBlocks(readFileSync(path, "utf8"))) {
    const match = block.title.match(/^(\d+)화$/);
    if (!match) continue;
    const sequence = Number(match[1]);
    const fields = parseLabeledFields(block.body, manualReviewFields);
    const missing = manualReviewFields.filter((field) => !fields[field]);
    assert(missing.length === 0, `${path}: ${sequence}화 missing ${missing.join(", ")}`);
    for (const field of [
      "긴장",
      "보상 강도",
      "훅 강도",
      "정보 리본",
      "행동 리본",
      "관계 리본",
      "감정 리본",
      "물질/지위 리본",
    ]) {
      const value = Number(fields[field]);
      assert(Number.isInteger(value) && value >= 1 && value <= 10, `${path}: ${sequence}화 invalid ${field}`);
    }
    reviews.push({ sequence, fields });
  }
  return reviews;
}

function parseManualArcRevisions(path) {
  const revisions = new Map();
  for (const block of headingBlocks(readFileSync(path, "utf8"))) {
    const match = block.title.match(/^(RA-\d{3})\s+·\s+(.+?)\s+\((\d+)~(\d+)화\)$/);
    if (!match) continue;
    const fields = parseLabeledFields(block.body, manualArcFields);
    const missing = manualArcFields.filter((field) => !fields[field]);
    assert(missing.length === 0, `${path}: ${match[1]} missing ${missing.join(", ")}`);
    assert(!revisions.has(match[1]), `${path}: duplicate ${match[1]}`);
    revisions.set(match[1], {
      arcId: match[1],
      arcName: match[2],
      startSequence: Number(match[3]),
      endSequence: Number(match[4]),
      fields,
    });
  }
  return revisions;
}

function boundarySignalCount(value) {
  return value.split(";").map((part) => part.trim()).filter(Boolean).length;
}

function mdCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function shorten(value, maximum = 92) {
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length <= maximum ? text : `${text.slice(0, maximum - 1)}…`;
}

function average(values) {
  return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1);
}

const sourceBuffer = readFileSync(sourcePath);
const sourceText = sourceBuffer.toString("utf8");
const sourceHash = sha256(sourceBuffer);
assert(sourceHash === expectedSourceHash, `source hash mismatch: ${sourceHash}`);

const sourceLines = sourceText.split(/\r?\n/);
const sourceLineCount = sourceText.endsWith("\n") ? sourceLines.length - 1 : sourceLines.length;
const markers = [];
for (let index = 0; index < sourceLineCount; index += 1) {
  const match = sourceLines[index].match(/^ⓚ리턴 에이스 (\d+)화\s*$/);
  if (match) markers.push({ sequence: Number(match[1]), label: sourceLines[index], startLine: index + 1 });
}
assert(markers.length === expectedChapters, `source marker count ${markers.length}`);
for (let index = 0; index < markers.length; index += 1) {
  assert(markers[index].sequence === index + 1, `source marker sequence breaks at ${index + 1}`);
  markers[index].endLine = (markers[index + 1]?.startLine ?? sourceLineCount + 1) - 1;
}

const reviews = manualReviewPaths.flatMap(parseManualReviews).sort((left, right) => left.sequence - right.sequence);
assert(reviews.length === expectedChapters, `manual review count ${reviews.length}`);
for (let index = 0; index < reviews.length; index += 1) {
  assert(reviews[index].sequence === index + 1, `manual review sequence breaks at ${index + 1}`);
}
const reviewBySequence = new Map(reviews.map((review) => [review.sequence, review.fields]));

const manualChapterFactRows = readCsv(manualChapterFactAuthorityPath, chapterHeader);
const baseArcRows = readCsv(join(analysisRoot, "arc_map.csv"), arcHeader);
const boundaryRows = readCsv(join(candidateDir, "arc_boundary_authority.csv"), boundaryHeader);
const manualArcRevisions = parseManualArcRevisions(join(candidateDir, "manual_arc_revisions.md"));
assert(manualChapterFactRows.length === expectedChapters, `manual chapter fact count ${manualChapterFactRows.length}`);
assert(boundaryRows.length === 55, `manual natural Arc count ${boundaryRows.length}`);
assert(manualArcRevisions.size === 11, `manual revised Arc count ${manualArcRevisions.size}`);

const baseArcById = new Map(baseArcRows.map((row) => [row.arc_id, row]));
const arcBySequence = new Map();
let expectedArcStart = 1;
const arcRows = boundaryRows.map((boundary, index) => {
  const expectedArcId = `RA-${String(index + 1).padStart(3, "0")}`;
  const start = Number(boundary.start_sequence);
  const end = Number(boundary.end_sequence);
  assert(boundary.arc_id === expectedArcId, `boundary Arc id mismatch at ${expectedArcId}`);
  assert(start === expectedArcStart, `${boundary.arc_id} starts ${start}, expected ${expectedArcStart}`);
  assert(end >= start, `${boundary.arc_id} has reversed range`);
  assert(["high", "medium"].includes(boundary.confidence), `${boundary.arc_id} invalid confidence`);

  let metadata;
  if (boundary.metadata_source.startsWith("root:")) {
    const sourceArcId = boundary.metadata_source.slice("root:".length);
    const sourceArc = baseArcById.get(sourceArcId);
    assert(sourceArc, `${boundary.arc_id} missing root metadata ${sourceArcId}`);
    assert(sourceArc.start_sequence === boundary.start_sequence, `${boundary.arc_id} root start mismatch`);
    assert(sourceArc.end_sequence === boundary.end_sequence, `${boundary.arc_id} root end mismatch`);
    assert(sourceArc.arc_name === boundary.arc_name, `${boundary.arc_id} root name mismatch`);
    metadata = {
      main_characters: sourceArc.main_characters,
      main_locations: sourceArc.main_locations,
      concrete_premise: sourceArc.concrete_premise,
      central_question: sourceArc.central_question,
      promise: sourceArc.promise,
      pressure_escalation: sourceArc.pressure_escalation,
      mid_turn: sourceArc.mid_turn,
      concrete_payoff: sourceArc.concrete_payoff,
      relationship_change: sourceArc.relationship_change,
      status_or_ability_change: sourceArc.status_or_ability_change,
      residual_cost: sourceArc.residual_cost,
      next_arc_bridge: sourceArc.next_arc_bridge,
      boundary_signals: sourceArc.boundary_signals,
    };
  } else {
    assert(boundary.metadata_source === `manual:${boundary.arc_id}`, `${boundary.arc_id} invalid manual source`);
    const revision = manualArcRevisions.get(boundary.arc_id);
    assert(revision, `${boundary.arc_id} missing manual metadata`);
    assert(revision.arcName === boundary.arc_name, `${boundary.arc_id} manual name mismatch`);
    assert(revision.startSequence === start && revision.endSequence === end, `${boundary.arc_id} manual range mismatch`);
    metadata = {
      main_characters: revision.fields["주요 인물"],
      main_locations: revision.fields["주요 장소/팀"],
      concrete_premise: revision.fields["구체 전제"],
      central_question: revision.fields["중심 질문"],
      promise: revision.fields["약속"],
      pressure_escalation: revision.fields["압력 상승"],
      mid_turn: revision.fields["중간 전환"],
      concrete_payoff: revision.fields["구체 결산"],
      relationship_change: revision.fields["관계 변화"],
      status_or_ability_change: revision.fields["지위/능력/기록 변화"],
      residual_cost: revision.fields["잔여 비용"],
      next_arc_bridge: revision.fields["다음 Arc 다리"],
      boundary_signals: revision.fields["경계 신호"],
    };
  }

  assert(boundarySignalCount(metadata.boundary_signals) >= 2, `${boundary.arc_id} needs two boundary signals`);
  for (let sequence = start; sequence <= end; sequence += 1) {
    assert(!arcBySequence.has(sequence), `Arc overlap at ${sequence}`);
    arcBySequence.set(sequence, boundary);
  }
  expectedArcStart = end + 1;
  return {
    arc_id: boundary.arc_id,
    arc_name: boundary.arc_name,
    start_sequence: start,
    end_sequence: end,
    start_label: `${start}화`,
    end_label: `${end}화`,
    episode_count: end - start + 1,
    ...metadata,
    confidence: boundary.confidence,
  };
});
assert(expectedArcStart === expectedChapters + 1, `Arc coverage ends at ${expectedArcStart - 1}`);

const chapterRows = manualChapterFactRows.map((authority, index) => {
  const sequence = index + 1;
  const marker = markers[index];
  const manual = reviewBySequence.get(sequence);
  const arc = arcBySequence.get(sequence);
  assert(Number(authority.sequence) === sequence, `manual chapter fact sequence breaks at ${sequence}`);
  assert(Number(authority.start_line) === marker.startLine, `manual chapter fact start line differs at ${sequence}`);
  assert(Number(authority.end_line) === marker.endLine, `manual chapter fact end line differs at ${sequence}`);
  assert(authority.entry_state === manual["진입 장면"], `manual chapter fact entry differs at ${sequence}`);
  assert(authority.ending_hook === manual["종료 훅"], `manual chapter fact ending hook differs at ${sequence}`);
  assert(authority.closed_loops === manual["닫힌 루프"], `manual chapter fact closed loops differ at ${sequence}`);
  assert(authority.opened_loops === manual["열린 루프"], `manual chapter fact opened loops differ at ${sequence}`);
  for (const field of chapterFactFields) assert(authority[field].trim().length > 0, `manual chapter fact ${sequence} empty ${field}`);
  assert(arc, `chapter ${sequence} has no Arc`);
  return {
    ...authority,
    arc_id: arc.arc_id,
    confidence: arc.confidence,
  };
});

const pacingRows = chapterRows.map((chapter) => {
  const sequence = Number(chapter.sequence);
  const manual = reviewBySequence.get(sequence);
  return {
    sequence,
    visible_label: chapter.visible_label,
    arc_id: chapter.arc_id,
    arc_phase: manual["Arc 단계"],
    concrete_event: manual["페이싱 근거"],
    tension_1_10: manual["긴장"],
    reward_1_10: manual["보상 강도"],
    hook_1_10: manual["훅 강도"],
    information_weight: manual["정보 리본"],
    action_weight: manual["행동 리본"],
    relationship_weight: manual["관계 리본"],
    emotion_weight: manual["감정 리본"],
    material_or_status_weight: manual["물질/지위 리본"],
    pacing_note: `보상 범위=${manual["보상 범위"]}; ${manual["페이싱 근거"]}`,
  };
});

const arcById = new Map(arcRows.map((arc) => [arc.arc_id, arc]));
const pacingBySequence = new Map(pacingRows.map((row) => [Number(row.sequence), row]));

function renderAtlas() {
  const lines = [
    "# 리턴 에이스 Arc Atlas · 자연 경계 후보",
    "",
    "## 작품 전체 독자 계약",
    "",
    "윤주혁은 명예의 전당 타자로 생을 마친 뒤 2009년의 건강한 어깨로 돌아온다. 한 구·한 타석의 즉시 보상은 한 경기의 승패로, 그 승패는 시즌 기록·수상·동료의 성장·팀의 첫 우승·최고액 계약과 결혼으로 이어진다. 독자는 실제 선수와 구단, 구종과 점수, 계약액과 관계 행동을 따라가며 짧은 경기 보상과 긴 커리어 보상이 서로의 조건이 되는 과정을 읽는다.",
    "",
    "이 후보의 55개 NarrativeArc는 회차 수에 맞춘 곡선이 아니다. 지배 목표, 상대와 무대, 구체 결산, 되돌리기 어려운 상태, 다음 압력이 실제 장면에서 함께 바뀌는 곳을 경계로 삼았다. 각 회차의 단계·세 점수·다섯 리본은 310회 수동 권위 장부를 그대로 옮겼고 생성기는 평균만 계산한다.",
    "",
    "## 전체 Arc 목차",
    "",
    "| Arc | 사건형 이름 | 회차 | 길이 | 중심 결산 |",
    "| --- | --- | ---: | ---: | --- |",
    ...arcRows.map((arc) => `| ${arc.arc_id} | ${mdCell(arc.arc_name)} | ${arc.start_sequence}~${arc.end_sequence}화 | ${arc.episode_count} | ${mdCell(shorten(arc.concrete_payoff))} |`),
    "",
  ];

  for (const arc of arcRows) {
    const start = Number(arc.start_sequence);
    const end = Number(arc.end_sequence);
    const arcPaces = pacingRows.slice(start - 1, end);
    lines.push(
      `## ${arc.arc_id} · ${arc.arc_name} (${start}~${end}화)`,
      "",
      `발단: ${arc.concrete_premise}`,
      "",
      `주요 무대: ${arc.main_locations}`,
      "",
      `등장인물: ${arc.main_characters}`,
      "",
      `중심 질문: ${arc.central_question}`,
      "",
      `독자 약속: ${arc.promise}`,
      "",
      `압력 상승: ${arc.pressure_escalation}`,
      "",
      `중간 전환: ${arc.mid_turn}`,
      "",
      `결산: ${arc.concrete_payoff}`,
      "",
      `관계 변화: ${arc.relationship_change}`,
      "",
      `지위·능력·기록 변화: ${arc.status_or_ability_change}`,
      "",
      `잔여 비용: ${arc.residual_cost}`,
      "",
      `다음 Arc 다리: ${arc.next_arc_bridge}`,
      "",
      `경계 근거: ${arc.boundary_signals}`,
      "",
      "### 회차별 실제 체감과 종료 훅",
      "",
      "| 회차 | 실제 장면 강도 근거 | 지급 범위 | 실제 마지막 장면 | 긴장 | 보상 | 훅 | 단계 |",
      "| ---: | --- | --- | --- | ---: | ---: | ---: | --- |",
    );
    for (let sequence = start; sequence <= end; sequence += 1) {
      const manual = reviewBySequence.get(sequence);
      const pace = pacingBySequence.get(sequence);
      lines.push(`| ${sequence}화 | ${mdCell(pace.concrete_event)} | ${mdCell(manual["보상 범위"])} | ${mdCell(manual["종료 훅"])} | ${pace.tension_1_10} | ${pace.reward_1_10} | ${pace.hook_1_10} | ${mdCell(pace.arc_phase)} |`);
    }
    lines.push(
      "",
      "### Arc 페이싱",
      "",
      `긴장: ${arcPaces.map((pace) => pace.tension_1_10).join("-")} (평균 ${average(arcPaces.map((pace) => Number(pace.tension_1_10)))})`,
      "",
      `보상: ${arcPaces.map((pace) => pace.reward_1_10).join("-")} (평균 ${average(arcPaces.map((pace) => Number(pace.reward_1_10)))})`,
      "",
      `훅: ${arcPaces.map((pace) => pace.hook_1_10).join("-")} (평균 ${average(arcPaces.map((pace) => Number(pace.hook_1_10)))})`,
      "",
    );
  }

  lines.push(
    "## 초반·중반·후반의 리듬 변화",
    "",
    "초반에는 봉황대기 혹사 거부, 베네수엘라 첫 승, 체인지업 습득, 스프링캠프와 무사 만루 데뷔처럼 한 구가 다음 출전권을 산다. 같은 점수라도 10화의 홈런은 11대10 추격일 뿐 역전승이 아니고, 25화의 무사 만루 탈출은 첫 승과 빅리그 신뢰까지 바꾼다. 짧은 보상이 곧 보직 심사의 답이다.",
    "",
    "중반에는 노히터·연속 무실점·21탈삼진·386탈삼진 같은 기록과 탬파베이의 지구 우승·월드시리즈가 겹친다. 107화는 여덟 이닝 무피안타라는 경기 체감 때문에 보상 9지만, 만루홈런은 108화, 노히터 완성은 109화에만 지급한다. 159화의 끝내기 우승 뒤 160~169화는 수상·계약, 귀국·재단, 최종원의 죽음이라는 서로 다른 삶의 목표로 분리된다.",
    "",
    "후반에는 워싱턴의 개인 전관왕과 팀 탈락, 다음 시즌 우승, 잠비아 봉사와 한유라의 가족 소개, 텍사스의 창단 첫 우승이 커리어 층위를 넓힌다. 241~256화는 월드시리즈 경기, 수술·수상·WBC, CF·강연, 한유라·보육원, 4대1 트레이드·작별, 워싱턴 3루 전환으로 나뉘어 비시즌이라는 달력만으로 합치지 않는다.",
    "",
    "## 결말 Arc의 수렴과 지급",
    "",
    "RA-054에서 대니 스튜어트의 6이닝 무실점, 윤주혁의 결승 3루타와 3이닝 마무리가 텍사스의 첫 우승을 만든다. RA-055인 310화는 한유라와의 결혼, 시카고 컵스와 10년 5억2천만 달러 계약, 2016년 월드시리즈 7차전의 마지막 두 아웃과 컵스의 108년 우승을 한 표식 안에서 결산한다. 마지막 포부는 이미 이룬 기록이 아니라 베이브 루스를 넘어설 남은 선수 생활이다.",
    "",
    "## 경계가 겹치는 구간과 수동 판단",
    "",
    "242화는 무릎 수술과 사이영상·MVP 발표가 한 회차에 함께 있고, 243화 첫 장면은 공식 수상 감격을 이어 받은 뒤 재활·WBC 불참을 결산한다. 회차 중간을 잘라 중복 소속시키지 않고 241~243화를 우승 뒤 공식 결산·몸의 비용·대표팀 선택이 끝나는 전환 Arc로 묶었다. 신뢰도는 `medium`으로 남긴다.",
    "",
    "248화의 대부분은 한유라와 보육원 관계를 닫지만 마지막 장면은 프리드먼의 로스터 고민이다. 따라서 248화는 관계 Arc의 결산과 다음 커리어 Arc의 다리를 함께 맡고, 실제 트레이드 제안 검토는 249화부터 배치한다. 310화는 한 표식 안 시간 점프가 크므로 Arc 경계는 명확하지만 내부 장면 밀도에 대해 `medium`을 유지한다.",
    "",
  );
  return `${lines.join("\n")}\n`;
}

writeFileSync(join(candidateDir, "chapter_map.csv"), renderCsv(chapterHeader, chapterRows), "utf8");
writeFileSync(join(candidateDir, "arc_map.csv"), renderCsv(arcHeader, arcRows), "utf8");
writeFileSync(join(candidateDir, "arc_pacing.csv"), renderCsv(pacingHeader, pacingRows), "utf8");
writeFileSync(join(candidateDir, "arc_atlas.md"), renderAtlas(), "utf8");

for (const file of [
  "project_bible.md",
  "source_receipt.json",
  "inkos_usage_and_gap_report.md",
  "free_improvements_report.md",
]) {
  writeFileSync(join(candidateDir, file), readFileSync(join(analysisRoot, file)));
}

const candidateHashes = Object.fromEntries([
  "project_bible.md",
  "manual_chapter_fact_authority.csv",
  "manual_chapter_fact_audit.md",
  "chapter_map.csv",
  "arc_map.csv",
  "arc_pacing.csv",
  "arc_atlas.md",
].map((file) => [file, sha256(readFileSync(join(candidateDir, file)))]));

const receipt = `# 《리턴 에이스》 자연 Arc 후보 완료 영수증

- 상태: 후보 재생성 완료, 최종 validator 실행 전
- 격리 경로: \`analyses/return-ace/.work/rework_natural_arc/\`
- 루트 정본: 미승격·보존
- 원문 SHA-256: \`${sourceHash}\`
- 원문 표식: ${markers.length}개
- 수동 페이싱 판정: ${reviews.length}/310
- 종료 훅 원문 대조: ${reviews.length}/310
- 회차 사실 7필드 원문 경계 감사: ${chapterRows.length}/310
- 자연 NarrativeArc: ${arcRows.length}개
- 리본 척도: 독립 강도형 1~10 정수, 합계 제약 없음

## 수동 권위 입력

\`manual_review_001_025.md\`, \`manual_review_026_103.md\`, \`manual_review_104_207.md\`, \`manual_review_208_310.md\`의 310개 회차 블록을 사용했다. 각 블록은 \`arc_phase\`, 긴장·보상·훅, 정보·행동·관계·감정·물질/지위 리본, 보상 범위, 고유 페이싱 근거, 실제 종료 훅과 닫힌·열린 루프를 가진다.

\`manual_chapter_fact_authority.csv\`는 310회 각각의 \`reader_promise\`, \`protagonist_goal\`, \`action\`, \`resistance_or_cost\`, \`turn_or_reveal\`, \`paid_reward\`, \`state_change\`를 해당 \`start_line~end_line\` 원문 안 사실로 재판정한 유일한 회차 사실 권위 입력이다. 후보 \`chapter_map.csv\`는 루트의 오래된 사건 문구를 읽지 않고 이 파일에서만 생성된다.

후보 생성기는 위 수동값과 \`arc_boundary_authority.csv\`, \`manual_arc_revisions.md\`를 조립한다. 키워드, 정규식 분류, Arc 안 위치, 점수 임계값, 공식 곡선으로 장면 강도·리본·단계를 만들지 않는다. 코드의 정규표현식은 Markdown·CSV·원문 표식 문법을 읽는 데만 쓴다.

## 회차 경계 사실 전수 감사

- 감사 방식: 1~310화를 차례로 열어 각 원문 표식의 첫 줄·마지막 줄, 기존 수동 리뷰의 종료 훅·열린 루프, 위 7개 사실 필드를 한 화면에서 대조했다. 숫자-원문 검색은 후보 목록으로만 사용했고 최종 판정은 각 회차 원문 경계에서 직접 했다.
- 발견·교정: 18개 회차 — 6, 9, 18, 31, 40, 41, 128, 129, 131, 133, 140, 172, 195, 248, 249, 253, 254, 255화.
- 경계 밖 사실·자기모순 교정: 16개 회차 — 6, 9, 18, 31, 40, 41, 128, 129, 131, 140, 172, 195, 248, 249, 253, 254화.
- 사실 수치 정정: 133화는 8이닝 1실점 12탈삼진이 아니라 원문과 수동 리뷰의 10탈삼진으로 통일했다. RA-025의 구체 결산도 수동 메타데이터로 바꿨다.
- 소유 회차 명시: 255화에 시범경기 첫 타석 홈런과 3안타 2홈런 4타점이 속하며, 253화는 3루 훈련 요청까지, 254화는 1·3루 병행 합의·빠른 훈련 적응·시범경기 첫 수비까지다.
- 관리자 숫자 후보 28개(18, 40, 41, 57, 71, 76, 91, 96, 108, 109, 112, 125, 133, 155, 160, 175, 189, 193, 196, 199, 200, 205, 206, 248, 261, 269, 282, 302화)는 모두 원문으로 재확인했다. 이 가운데 18·40·41·133·248화는 위 교정 목록에 반영했고 나머지는 해당 회차 경계 안 사실임을 확인했다.

## 초·중·후 원문 경계 수동 반례

- 초반 9화: 감독이 윤주혁을 지명타자 자리에 넣는 데서 끝나며 홈런은 10화 소유다.
- 초반 18화: 첫 두 공 92·93마일까지이며 96·100마일과 삼진은 19화 소유다.
- 초반 40화: 저속 포심의 지저분한 무브먼트 원리를 설명하는 중간에서 끝나며 4회까지 1피안타 봉쇄는 41화 소유다.
- 초반 41화: 0대2에서 그레고리 마틴이 체인지업 미끼를 물기로 결심한 순간까지이며 101마일과 삼진은 42화 소유다.
- 중반 107화: 8이닝 무피안타·무실점 뒤 8회 말 무사 만루 선택까지이며 만루홈런은 108화, 노히터 완성은 109화 소유다.
- 중반 128화: 프리드먼의 무어안과 매든의 니먼안이 맞선 채 끝나며 무어 선발 확정은 129화 소유다.
- 중반 140화: 윤주혁이 바깥쪽 두 공을 본 뒤 끝나며 그린 몬스터를 넘기는 반대 방향 홈런은 141화 소유다.
- 중반 172화: 개막 로스터와 라인업 분석 뒤 첫 투구 전이며 승리·마운드 결과는 다음 회차들에만 둔다.
- 중반 195화: 올림픽 결승 출발 직전 한유라가 두려움과 기대를 인식한 장면까지이며 레이스와 메달은 196화 소유다.
- 후반 248화: 한유라와 번호를 교환하고 프리드먼이 우승 핵심 선수의 연봉·FA 로스터 판단을 못 내린 데서 끝나며 1,500만 달러 요구와 워싱턴 4대1 제안은 249화 소유다.
- 후반 253화: 입단·82번·첫 인사와 3루 훈련 요청, 감독의 “3루?”까지다. 1·3루 반복 훈련과 코치진의 수비 인정은 254화부터다.
- 후반 254화: 시범경기 1회 초 수비를 마치고 1회 말 랜스 린이 데나드 스판을 잡은 뒤 제이슨 워스를 상대하는 데서 끝난다. 첫 타석 홈런과 3안타 2홈런 4타점은 255화 소유다.
- 후반 296화: 한유라의 입맞춤 뒤 윤주혁이 조수석 온기를 느끼며 귀가하는 장면까지이고 텍사스 트레이드는 297화 소유다.
- 후반 310화: 컵스의 108년 만의 우승과 베이브 루스를 넘겠다는 포부로 완결되며, 완료된 경기 결과와 미래의 개방성을 구분했다.

## 자연 Arc 재분절

- 기존 RA-027/028/029 인접 구간: \`145~159 월드시리즈 노히터·끝내기 우승\`, \`160~163 수상·2억 달러 거절·나이키/공공 자산\`, \`164~167 귀국·가족·복지재단/태종보육원\`, \`168~169 최종원 죽음·사이영상 맹세\`, \`170~175 1선발·개막전\`으로 나눴다.
- 기존 RA-039/040/041 인접 구간: \`235~240 샌프란시스코 스윕·우승\`, \`241~243 WS MVP·수술·사이영상/MVP·WBC 결정\`, \`244~245 CF·재단·강연\`, \`246~248 한유라·보육원 연락망\`, \`249~252 4대1 트레이드·탬파 작별·워싱턴 합류\`, \`253~256 3루 전환·100마일 친정팀 점검\`으로 나눴다.
- 기존 50개 중 45개 자연 Arc의 범위와 사건 표면은 보존했다. 재분절 뒤 전체는 55개다.

## 확정 반례 영수증

- 56화: 정규시즌 최종 결과가 아니라 경기 시작 전 조 매든이 4번 타자 윤주혁에게 말을 건네려는 순간에서 끝난다.
- 107화: 여덟 이닝 무피안타·무실점과 8회 말 무사 만루 선택까지다. 보상은 9이며 만루홈런은 108화, 노히터 완성은 109화에만 둔다.
- 296화: 한유라가 먼저 입맞춤하고 집으로 들어간 뒤 윤주혁이 조수석 온기를 느끼며 밤길을 운전하는 장면에서 끝난다. 텍사스 트레이드는 297화다.
- 310화: 코코 크리스프의 뜬공으로 컵스가 108년 만에 우승하고 윤주혁이 베이브 루스를 넘어설 포부를 품으며 완결된다. 훅 4는 미결 사건이 아니라 완결 뒤 미래의 개방성이다.

## 보존과 동기화

\`project_bible.md\`는 기준 SHA-256을 가진 루트 사실 서술을 그대로 복제했다. \`chapter_map.csv\`의 7개 사실 필드와 종료·루프 필드는 각각 310개 수동 권위 입력에서 생성했고 표식·행 범위는 원문과 다시 맞췄다. \`arc_pacing.csv\`와 Atlas의 회차 표·수열·평균은 같은 310개 수동 페이싱값에서 조립했다. 40·41·248·253·254·255화의 사건 표면은 회차 지도, 페이싱, Atlas에 동일하게 반영했다.

## 후보 파일 SHA-256

${Object.entries(candidateHashes).map(([file, hash]) => `- \`${file}\`: \`${hash}\``).join("\n")}

## 검증 상태

- 작품 후보 validator: 실행 전
- 공통 strict 격리 미러: 실행 전
- 오류/경고: 실행 전
`;
writeFileSync(join(candidateDir, "completion_receipt.md"), receipt, "utf8");

console.log(JSON.stringify({
  status: "built",
  sourceSha256: sourceHash,
  chapters: chapterRows.length,
  pacingRows: pacingRows.length,
  naturalArcs: arcRows.length,
  manualArcRevisions: manualArcRevisions.size,
  firstArc: arcRows[0]?.arc_id,
  lastArc: arcRows.at(-1)?.arc_id,
  candidateHashes,
}, null, 2));
