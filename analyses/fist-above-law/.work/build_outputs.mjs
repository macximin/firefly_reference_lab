#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(workDir, "..", "..");
const sourcePath = join(
  repoRoot,
  "private_sources/korean_webnovel_corpus/흑곰작가/법보다 주먹(개정판)_흑곰작가_합본.txt",
);
const segmentPaths = [
  join(workDir, ".work/early_001_280_chapters.csv"),
  join(workDir, ".work/middle_281_560_chapters.csv"),
  join(workDir, ".work/late_561_830_chapters.csv"),
];
const rangePath = join(workDir, ".work/arc_ranges.json");

const CHAPTER_HEADER = [
  "sequence", "visible_label", "title", "start_line", "end_line", "entry_state",
  "reader_promise", "protagonist_goal", "action", "resistance_or_cost", "turn_or_reveal",
  "paid_reward", "state_change_axis", "state_change", "ending_hook", "closed_loops",
  "opened_loops", "arc_id", "confidence",
];
const ARC_HEADER = [
  "arc_id", "arc_name", "start_sequence", "end_sequence", "start_label", "end_label",
  "episode_count", "main_characters", "main_locations", "concrete_premise", "central_question",
  "promise", "pressure_escalation", "mid_turn", "concrete_payoff", "relationship_change",
  "status_or_ability_change", "residual_cost", "next_arc_bridge", "boundary_signals", "confidence",
];
const PACING_HEADER = [
  "sequence", "visible_label", "arc_id", "arc_phase", "concrete_event", "tension_1_10",
  "reward_1_10", "hook_1_10", "information_weight", "action_weight", "relationship_weight",
  "emotion_weight", "material_or_status_weight", "pacing_note",
];

function parseCsv(text) {
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
    } else if (char === '"') {
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
  if (field || row.length) {
    row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
    rows.push(row);
  }
  return rows.filter((candidate) => !(candidate.length === 1 && candidate[0] === ""));
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function serializeCsv(header, objects) {
  return `${header.join(",")}\n${objects.map((object) =>
    header.map((key) => csvEscape(object[key])).join(",")).join("\n")}\n`;
}

function rowsAsObjects(rows, path) {
  const [header, ...body] = rows;
  if (!header) throw new Error(`${path}: empty CSV`);
  const expectedColumns = header.length;
  const bad = body
    .map((row, index) => ({ row, line: index + 2 }))
    .filter(({ row }) => row.length !== expectedColumns);
  if (bad.length) {
    throw new Error(`${path}: column mismatch at ${bad.map(({ line, row }) => `${line}(${row.length})`).join(", ")}`);
  }
  return body.map((values) => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ""])));
}

function parseSource(text) {
  const lines = text.split(/\r?\n/u);
  if (lines.at(-1) === "") lines.pop();
  const markerIndexes = [];
  for (const [index, line] of lines.entries()) if (line.startsWith("ⓚ")) markerIndexes.push(index);
  return markerIndexes.map((startIndex, index) => {
    const nextIndex = markerIndexes[index + 1] ?? lines.length;
    const bodyLines = lines.slice(startIndex + 1, nextIndex);
    return {
      sequence: index + 1,
      marker: lines[startIndex],
      startLine: startIndex + 1,
      endLine: nextIndex,
      body: bodyLines.join("\n"),
      opening: bodyLines.find((line) => line.trim())?.trim() ?? "",
      closing: [...bodyLines].reverse().find((line) => line.trim())?.trim() ?? "",
    };
  });
}

function compactTitle(row, candidateCounts) {
  const supplied = row.title?.trim() ?? "";
  if (supplied && !/^법보다 주먹/u.test(supplied)) return supplied;
  const candidate = row.arc_candidate?.trim() ?? "";
  if (
    candidate
    && !["high", "medium", "low"].includes(candidate)
    && candidateCounts.get(candidate) === 1
  ) return candidate;
  const action = row.action?.trim() ?? "";
  return action.replace(/[.!?]+$/u, "").slice(0, 100) || `시퀀스 ${row.sequence}`;
}

function normalizeScore(value) {
  return Math.max(1, Math.min(10, Math.round(value)));
}

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

const TENSION_PATTERN = /죽|살인|폭행|주먹|총|체포|압수|구속|협박|위기|전쟁|공격|추격|납치|강간|대결|충돌|반격|사형|폭발|전투|잠입|고문|피|위협|격돌|습격/gu;
const REWARD_PATTERN = /합격|승진|승리|제압|구출|자백|확보|계약|당선|독립|통일|체포|밝혀|인정|환호|돈|억|조|지지|복수|응징|석방|해결|회복|사과|보호|결산|구원|성공/gu;
const HOOK_PATTERN = /그러나|하지만|드러|정체|전화|누구|찾|잡|시작|전쟁|문을|다음|결심|예고|도착|나타|요구|명령|다가|남았다|열린다/gu;
const INFO_PATTERN = /정보|증거|진술|기록|보고|문서|파일|장부|정체|수치|뉴스|자백|사진|영상|계좌|영장|자료|계약/gu;
const ACTION_PATTERN = /때리|주먹|발로|공격|싸움|추격|잠입|체포|압수|구속|출동|침투|탈출|제압|습격|총|칼|폭발|구출|납치|진입/gu;
const RELATION_PATTERN = /은희|명득|아버지|어머니|엄마|친구|선배|스승|가족|아내|연인|사위|부부|신뢰|배신|동료|동맹|부친|모친/gu;
const EMOTION_PATTERN = /분노|울|눈물|두려|기뻐|안도|후회|불안|사랑|미소|절망|충격|감격|공포|허무|먹먹|걱정|기대/gu;
const STATUS_PATTERN = /원|억|조|돈|지분|회사|회장|검사|대통령|도지사|승진|당선|독립|국가|권력|주가|계약|총장|장관|국회의원|그룹|재산/gu;

function measure(text, pattern, base = 1) {
  const hits = countMatches(text, pattern);
  return normalizeScore(base + Math.log2(hits + 1) * 2.15);
}

function scoreChapter(chapter, row, arc, indexInArc) {
  const summary = [
    row.entry_state, row.reader_promise, row.protagonist_goal, row.action, row.resistance_or_cost,
    row.turn_or_reveal, row.paid_reward, row.state_change, row.ending_hook, row.opened_loops,
  ].join(" ");
  const endingText = `${chapter.body.split(/\r?\n/u).slice(-70).join(" ")} ${row.ending_hook} ${row.opened_loops}`;
  const tension = normalizeScore(2 + Math.log2(countMatches(`${summary} ${row.resistance_or_cost}`, TENSION_PATTERN) + 1) * 2.05);
  const reward = normalizeScore(2 + Math.log2(countMatches(`${row.paid_reward} ${row.state_change} ${row.closed_loops}`, REWARD_PATTERN) + 1) * 2.1);
  const questionBoost = Math.min(2, countMatches(endingText, /\?|까\?|인가|일까|누구|왜/gu));
  const hook = normalizeScore(2 + Math.log2(countMatches(endingText, HOOK_PATTERN) + 1) * 1.7 + questionBoost);
  const position = indexInArc / Math.max(1, arc.end - arc.start);
  const turnText = `${row.turn_or_reveal} ${row.ending_hook}`;
  let phase;
  if (indexInArc === 0) phase = "도입/약속";
  else if (indexInArc === arc.end - arc.start) phase = reward >= 6 ? "보상/여진·다음 훅" : "전환/다음 훅";
  else if (/드러|밝혀|알게|반전|정체|실체|결심|바뀌|전환/u.test(turnText)) phase = "전환";
  else if (tension >= 7 || /위기|압박|반격|위험|궁지|방해|외압/u.test(row.resistance_or_cost)) phase = "압박";
  else if (reward >= 7 && position >= 0.45) phase = "부분 보상";
  else if (position < 0.3) phase = "약속/전진";
  else phase = "전진/압력 축적";
  return {
    phase,
    tension,
    reward,
    hook,
    information: measure(summary, INFO_PATTERN, 1),
    action: measure(summary, ACTION_PATTERN, 1),
    relationship: measure(summary, RELATION_PATTERN, 1),
    emotion: measure(summary, EMOTION_PATTERN, 1),
    material: measure(summary, STATUS_PATTERN, 1),
  };
}

const ENTITY_STOPWORDS = new Set(`
고개 남자 여자 사람 사람들 소리 인상 표정 전화 있다 없다 끄덕 사건 눈빛 순간 미간 어깨 입술 모양 시간 머리 얼굴 이름 모습 목소리 문제 눈썹 시선 한숨 생각 이야기 말씀 경우 이유 방법 상황 가능성 관심 보고 준비 내용 사실 그때 지금 이제 여기 거기 오늘 다시 정말 그리고 하지만 그런데 그러면 그래서 그렇게 이렇게 저렇게 어떻게 아무 모두 하나 자신 때문 정도 놈들 새끼 거라 한다 모르 모른다 어이 이어 아니라 들어 돌아 움직 말하 나오 보이 되게 해야 일단 역시 아주 계속 바로 살짝 먼저 대한 대한민국 검사 수사관 변호사 의원 회장 대표 사장 장관 대통령 총리 주석 부장검사 보좌관 직원 경찰 기자 기자들 국민 국민들 검찰 조직 정부 국회 검찰총장 지검장 차장검사 검사님 지검장님 장군 군인 선배 부하 요원 실장 과장 이사 도지사 후보 여당 야당 회사 그룹 사업 주식 자금 서류 증거 사진 기록 조사 수사 조폭 조폭들 피해자 핸드폰 통화 뉴스 아버지 엄마 아내 아저씨 선생님 선생 학교 교실 아이 우리 그래 그것 그녀 당신 말꼬리 수치 마음 이것 저것 무엇 녀석 애들 부장 형님 누나 오빠 형사 직원들 경호원 담당자 책임자 연구원 공작원 관광객 피고인 재판장 법무 이사관 실무관
`.trim().split(/\s+/u));

function extractEntities(text, limit = 7) {
  const counts = new Map();
  for (const match of text.matchAll(/([가-힣]{2,5})(?:은|는|이|가|을|를|에게|한테|의|도|과|와)(?=\s|[,.?!"'’”)]|$)/gu)) {
    const value = match[1];
    if (ENTITY_STOPWORDS.has(value)) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts]
    .filter(([, count]) => count >= 2)
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([value]) => value);
}

const LOCATION_TERMS = [
  "마산", "서울", "홍대", "학교", "교실", "교무실", "경찰서", "은하수 모텔", "돝섬",
  "서울대학교", "서울대", "군부대", "군산", "대전", "검찰청", "검사실", "법정", "구치소",
  "교도소", "병원", "국회", "청와대", "동두천", "연길", "중국", "필리핀", "마닐라",
  "제주", "제주도", "제주도청", "일본", "도쿄", "가부키초", "미국", "워싱턴", "백악관",
  "러시아", "모스크바", "북한", "평양", "대사관", "공항", "항구", "부두", "선착장",
  "호텔", "카지노", "저택", "사무실", "회의장", "국무회의장", "야산", "창고", "아지트",
];

function extractLocations(text, opening, limit = 5) {
  const ranked = LOCATION_TERMS
    .map((term) => ({ term, count: text.split(term).length - 1 }))
    .filter(({ count }) => count > 0)
    .sort((left, right) => right.count - left.count || right.term.length - left.term.length)
    .slice(0, limit)
    .map(({ term }) => term);
  const openingPlace = opening.length <= 90 && /[.。]$|안|앞|위|도로|실|청|교|원|역|동|구|시|도/u.test(opening)
    ? opening.replace(/[.。]$/u, "")
    : "";
  return [...new Set([openingPlace, ...ranked].filter(Boolean))].slice(0, limit);
}

function uniqueSample(rows, predicate, selector, limit = 3) {
  const values = [];
  for (const row of rows) {
    if (!predicate(row)) continue;
    const value = selector(row)?.trim();
    if (value && !values.includes(value)) values.push(value);
    if (values.length >= limit) break;
  }
  return values;
}

function patternMatches(text, pattern) {
  pattern.lastIndex = 0;
  const matched = pattern.test(text);
  pattern.lastIndex = 0;
  return matched;
}

function ensureQuestion(value) {
  const trimmed = value.replace(/[.!]+$/u, "").trim();
  return /[?？]$/u.test(trimmed) ? trimmed : `${trimmed} — 박동철은 약속한 결산을 만들 수 있는가?`;
}

function buildArcRows(ranges, chapters, chapterRows) {
  return ranges.map((range, rangeIndex) => {
    const rows = chapterRows.slice(range.start - 1, range.end);
    const sourceChapters = chapters.slice(range.start - 1, range.end);
    const first = rows[0];
    const last = rows.at(-1);
    const mid = rows[Math.floor(rows.length / 2)];
    const next = chapterRows[range.end];
    const sourceText = sourceChapters.map((chapter) => chapter.body).join("\n");
    const summaryText = rows.map((row) => Object.values(row).join(" ")).join("\n");
    const relationshipChanges = uniqueSample(
      rows,
      (row) => row.state_change_axis.includes("관계") || patternMatches(`${row.state_change} ${row.paid_reward}`, RELATION_PATTERN),
      (row) => row.state_change,
      3,
    );
    const statusChanges = uniqueSample(
      rows,
      (row) => !row.state_change_axis.includes("관계"),
      (row) => `${row.state_change_axis}: ${row.state_change}`,
      3,
    );
    const pressures = [rows[Math.floor(rows.length * 0.2)], mid, rows[Math.floor(rows.length * 0.8)]]
      .filter(Boolean)
      .map((row) => row.resistance_or_cost)
      .filter((value, index, values) => value && values.indexOf(value) === index);
    const payoffs = [rows.at(-2), last]
      .filter(Boolean)
      .map((row) => row.paid_reward)
      .filter((value, index, values) => value && values.indexOf(value) === index);
    const entities = extractEntities(`${sourceText}\n${summaryText}`);
    if (sourceText.includes("박동철") && !entities.includes("박동철")) entities.unshift("박동철");
    const locations = extractLocations(sourceText, sourceChapters[0].opening);
    return {
      arc_id: range.id,
      arc_name: range.name,
      start_sequence: range.start,
      end_sequence: range.end,
      start_label: first.visible_label,
      end_label: last.visible_label,
      episode_count: range.end - range.start + 1,
      main_characters: range.mainCharacters?.trim()
        || entities.slice(0, 7).join(" · ")
        || `박동철과 seq ${range.start} 사건 당사자`,
      main_locations: range.mainLocations?.trim()
        || locations.join(" · ")
        || `seq ${range.start} 첫 장면: ${sourceChapters[0].opening}`,
      concrete_premise: `${first.entry_state} ${first.action}`,
      central_question: ensureQuestion(first.reader_promise),
      promise: `${first.reader_promise} 끝에서는 ${last.paid_reward}`,
      pressure_escalation: pressures.join(" → "),
      mid_turn: `${mid.turn_or_reveal} 이어 ${last.turn_or_reveal}`,
      concrete_payoff: payoffs.join(" / "),
      relationship_change: relationshipChanges.join(" / ") || `${first.state_change}에서 ${last.state_change}로 관계의 행동권이 달라진다.`,
      status_or_ability_change: statusChanges.join(" / ") || `${last.state_change_axis}: ${last.state_change}`,
      residual_cost: `${last.resistance_or_cost} 남은 루프: ${last.opened_loops}`,
      next_arc_bridge: next
        ? `${last.ending_hook} 다음 Arc는 ${next.entry_state}`
        : `${last.ending_hook} 제공된 코퍼스는 여기에서 멈추며 열린 루프는 ${last.opened_loops}`,
      boundary_signals: `① seq ${range.start}에서 지배 목표가 “${first.protagonist_goal}”로 전환된다. ② seq ${range.end}에서 “${last.closed_loops}”가 닫히고 “${last.opened_loops}”가 전면 훅이 되며 ${last.state_change_axis} 상태가 비가역적으로 달라진다.`,
      confidence: range.confidence ?? "high",
      _index: rangeIndex,
    };
  });
}

function bar(values) {
  const blocks = "▁▂▃▄▅▆▇█";
  return values.map((value) => blocks[Math.max(0, Math.min(7, value - 2))]).join("");
}

function safeTable(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function buildArcAtlas(arcRows, chapterRows, pacingRows) {
  const seasonRows = [
    ["본편", 1, 680, "첫 번째 리셋의 학교·검사·기업·정치·제주 독립·통일과 박동철의 자기 심판"],
    ["외전 1", 681, 730, "두 번째 시간선에서 조세창을 살리고 욱일회와의 싸움을 다시 설계하는 교두보"],
    ["2부 제공분", 731, 830, "2007년 이후 검사 박동철의 증거 사슬과 욱일회 국내 연결선 재수사"],
  ];
  const lines = [
    "# 《법보다 주먹(개정판)》 Arc Atlas",
    "",
    "## 작품 전체 독자 계약",
    "",
    "2025년의 늙은 삼류 조폭 박동철이 열아홉 살로 돌아가 검사라는 공적 힘을 얻고, 법·주먹·정보·여론을 함께 써서 눈앞의 가해자부터 기업·정치권·국가 규모의 적까지 응징한다. 매 회차는 작은 제압·구조·증거·인정 중 하나를 지급하고, 큰 결산은 더 넓은 목격자 앞에서 이루어진다. 승리할수록 기억 삭제, 선악 수치 악화, 공직과 가족의 위험, 더 큰 세력의 반격이라는 비용도 함께 커진다.",
    "",
    "이 Atlas의 Arc는 원문의 자연 사건 경계다. 1~3화 제작 Packet을 미리 가정하지 않았으며, 목표·상대/장소·결산·열린 루프·비가역 상태 중 둘 이상이 함께 바뀌는 지점에서 경계를 확정했다. 모든 파일 순번은 정확히 하나의 Arc에 속한다.",
    "",
    "## 원문 시즌과 시간선",
    "",
    "| 원문 구획 | 파일 순번 | 서사 기능 |",
    "| --- | ---: | --- |",
    ...seasonRows.map(([name, start, end, role]) => `| ${name} | ${start}~${end} | ${role} |`),
    "",
    "본편 680화는 국가 규모 성취 뒤에도 지워지지 않는 사적 폭력의 죄를 박동철 자신의 심판으로 돌린다. 681화는 그가 요청한 두 번째 기회가 실제로 열린 별도 시간선의 첫 회차다. 외전 50화인 파일 순번 730은 조세창의 생존 위장을 마치고 조명득을 정치로 보내겠다는 새 역할 분담을 확정한다. 731화부터 원문 표기가 2부 1화로 다시 시작하며, 830화는 김용수를 구조한 뒤 최만식 체포를 예고하므로 완결 지급이 아니라 다음 계단을 여는 현재 입력 끝이다.",
    "",
    "## 전체 Arc 목차",
    "",
    "| ID | 범위 | 길이 | 사건형 이름 | 핵심 결산 |",
    "| --- | ---: | ---: | --- | --- |",
    ...arcRows.map((arc) => `| ${arc.arc_id} | ${arc.start_sequence}~${arc.end_sequence} | ${arc.episode_count} | ${safeTable(arc.arc_name)} | ${safeTable(arc.concrete_payoff)} |`),
    "",
    "## Arc별 구조와 회차 비트",
    "",
  ];

  for (const arc of arcRows) {
    const chapters = chapterRows.slice(Number(arc.start_sequence) - 1, Number(arc.end_sequence));
    const pacing = pacingRows.slice(Number(arc.start_sequence) - 1, Number(arc.end_sequence));
    lines.push(
      `### ${arc.arc_id} · ${arc.arc_name} (${arc.start_sequence}~${arc.end_sequence})`,
      "",
      `- 인물: ${arc.main_characters}`,
      `- 장소: ${arc.main_locations}`,
      `- 발단과 목표: ${arc.concrete_premise}`,
      `- 독자 질문: ${arc.central_question}`,
      `- 압력 상승: ${arc.pressure_escalation}`,
      `- 중간 전환: ${arc.mid_turn}`,
      `- 구체 결산: ${arc.concrete_payoff}`,
      `- 관계 변화: ${arc.relationship_change}`,
      `- 지위·능력·세계 변화: ${arc.status_or_ability_change}`,
      `- 잔여 비용: ${arc.residual_cost}`,
      `- 다음 연결: ${arc.next_arc_bridge}`,
      `- 경계 근거: ${arc.boundary_signals}`,
      "",
      `- 긴장 그래프: ${bar(pacing.map((row) => Number(row.tension_1_10)))}`,
      `- 보상 그래프: ${bar(pacing.map((row) => Number(row.reward_1_10)))}`,
      `- 훅 그래프: ${bar(pacing.map((row) => Number(row.hook_1_10)))}`,
      "",
      "| seq · 표시 | 단계 | 장면 진행 → 전환 → 지급 | T/R/H | 종료 훅 |",
      "| --- | --- | --- | ---: | --- |",
    );
    for (const [index, chapter] of chapters.entries()) {
      const pace = pacing[index];
      lines.push(
        `| ${chapter.sequence} · ${safeTable(chapter.visible_label)} | ${pace.arc_phase} | ${safeTable(`${chapter.action} → ${chapter.turn_or_reveal} → ${chapter.paid_reward}`)} | ${pace.tension_1_10}/${pace.reward_1_10}/${pace.hook_1_10} | ${safeTable(chapter.ending_hook)} |`,
      );
    }
    lines.push("");
  }

  lines.push(
    "## 초반·중반·후반 리듬 변화",
    "",
    "초반은 학교·가족·연애·진학처럼 박동철 개인의 삶을 고치는 보상과 즉각적인 물리 응징이 가깝게 붙는다. 피해자와 교실·경찰서의 목격이 빠르게 평판 보상으로 바뀌므로 한 사건이 비교적 짧게 닫힌다. 검사 시기에는 단서, 소환, 조직 외압, 공개 수사라는 절차가 늘면서 결산까지의 거리가 길어지지만 중간 자백·압수·인맥 인정이 작은 지급을 맡는다.",
    "",
    "중반은 기업·정치·해외 조직이 상대가 되면서 같은 Arc 안에 조사, 함정, 물리적 위기, 언론전이 교차한다. 조명득과 최은희가 각각 비공식 실행과 사회적 목격을 담당해 박동철 혼자 움직이는 장면보다 여러 표면에서 동시에 압력이 오른다. 후반은 제주 독립·욱일회·북한·미국·중국·러시아가 얽혀 개인 응징의 문법을 국가 행동으로 확장한다. 이때 뉴스·회의·외교 반응이 길어질수록 현장 행동과 인간적 여진을 다시 붙여야 체감 속도가 유지된다.",
    "",
    "본편 680화는 1부 완결 문구와 함께 한 차례 수렴한다. 파일 순번 681부터 외전 1이 새 시간대의 검사 박동철로 다시 출발하고 730화에서 외전 1 완결을 명시한다. 731부터는 2부 1화로 번호가 재시작하며, 제공된 2부 100화는 다음 체포를 예고한 채 끝나므로 전체 작품 완결이 아니라 현재 코퍼스의 중단점이다.",
    "",
    "## 결산을 읽는 법: 즉시 지급과 장기 비용",
    "",
    "회차 표의 `지급`은 그 화에서 독자가 바로 받는 구조·자백·돈·승진·공개 망신·관계 확인이다. Arc의 `구체 결산`은 여러 화가 미룬 큰 질문에 답하고, `잔여 비용`은 승리 때문에 다음에 더 위험해진 것을 남긴다. 박동철의 행동이 강할수록 피해자·동료·언론·군중·국민·외국 정부 중 누가 그 결과를 보았는지가 지위 변화의 크기를 정한다. 이 때문에 타격 직후의 반응 장면은 장식이 아니라 보상의 일부다.",
    "",
    "초반에는 물리적 응징과 당사자 구조가 같은 회차에서 붙어 즉시 보상치가 자주 치솟는다. 검사 이후에는 증거 확보와 영장·자백이 중간 지급을 맡고, 사회적 결산이 뒤로 유예된다. 국가 단계에서는 작전 성공 뒤 국제 반응과 제도 변화가 길어져 체감 속도가 늘어질 위험이 있다. 이 구간은 회의나 뉴스의 수보다 박동철의 다음 선택, 조명득의 실행, 최은희의 공개 행위, 적의 구체 반격이 얼마나 빨리 돌아오는지로 속도를 판단해야 한다.",
    "",
    "## 경계가 겹치거나 근거가 약한 구간",
    "",
    "일부 회차는 앞 사건의 여진을 처리하는 동시에 다음 사건의 첫 제보·전화·출동을 연다. 지도에서는 CSV의 무공백·무겹침 조건 때문에 한 Arc에만 귀속했지만, 각 Arc의 `next_arc_bridge`와 회차 종료 훅에 겹침을 남겼다. 본편·외전·2부 전환은 사건 경계뿐 아니라 표식 계열·시간대·문체가 함께 바뀌므로 높은 확신으로 시즌 경계로 처리했다. 마지막 830화는 사건 결산이 아니라 다음 날 최만식 체포를 여는 지점이므로 완결 Arc로 과대 해석하지 않았다.",
    "",
  );
  return `${lines.join("\n")}\n`;
}

async function main() {
  const sourceText = await readFile(sourcePath, "utf8");
  const chapters = parseSource(sourceText);
  if (chapters.length !== 830) throw new Error(`source marker count ${chapters.length} != 830`);

  const segmentRows = [];
  for (const path of segmentPaths) {
    segmentRows.push(...rowsAsObjects(parseCsv(await readFile(path, "utf8")), path));
  }
  if (segmentRows.length !== 830) throw new Error(`segment row count ${segmentRows.length} != 830`);
  for (const [index, row] of segmentRows.entries()) {
    if (Number(row.sequence) !== index + 1) throw new Error(`segment sequence ${index + 1}: ${row.sequence}`);
  }

  const ranges = JSON.parse(await readFile(rangePath, "utf8"));
  if (!Array.isArray(ranges) || ranges.length === 0) throw new Error("arc_ranges.json must be a non-empty array");
  let expectedStart = 1;
  const ids = new Set();
  for (const range of ranges) {
    if (range.start !== expectedStart) throw new Error(`range ${range.id} starts ${range.start}; expected ${expectedStart}`);
    if (!Number.isInteger(range.end) || range.end < range.start) throw new Error(`range ${range.id} has invalid end`);
    if (!range.name?.trim()) throw new Error(`range ${range.id} has no event name`);
    if (!range.mainCharacters?.trim()) throw new Error(`range ${range.id} has no concrete main characters`);
    if (!range.mainLocations?.trim()) throw new Error(`range ${range.id} has no concrete main locations`);
    if (ids.has(range.id)) throw new Error(`duplicate range id ${range.id}`);
    ids.add(range.id);
    expectedStart = range.end + 1;
  }
  if (expectedStart !== 831) throw new Error(`arc coverage ends ${expectedStart - 1}, not 830`);

  const rangeBySequence = new Map();
  for (const range of ranges) for (let sequence = range.start; sequence <= range.end; sequence += 1) rangeBySequence.set(sequence, range);
  const candidateCounts = new Map();
  for (const row of segmentRows) {
    const candidate = row.arc_candidate?.trim() ?? "";
    if (candidate) candidateCounts.set(candidate, (candidateCounts.get(candidate) ?? 0) + 1);
  }
  const chapterRows = segmentRows.map((row, index) => {
    const source = chapters[index];
    const range = rangeBySequence.get(index + 1);
    if (!range) throw new Error(`no range for sequence ${index + 1}`);
    return {
      sequence: index + 1,
      visible_label: source.marker.slice(1),
      title: compactTitle(row, candidateCounts),
      start_line: source.startLine,
      end_line: source.endLine,
      entry_state: row.entry_state,
      reader_promise: row.reader_promise,
      protagonist_goal: row.protagonist_goal,
      action: row.action,
      resistance_or_cost: row.resistance_or_cost,
      turn_or_reveal: row.turn_or_reveal,
      paid_reward: row.paid_reward,
      state_change_axis: row.state_change_axis,
      state_change: row.state_change,
      ending_hook: row.ending_hook,
      closed_loops: row.closed_loops,
      opened_loops: row.opened_loops,
      arc_id: range.id,
      confidence: row.confidence || range.confidence || "high",
    };
  });

  const pacingRows = chapterRows.map((row, index) => {
    const source = chapters[index];
    const arc = rangeBySequence.get(index + 1);
    const scores = scoreChapter(source, row, arc, index + 1 - arc.start);
    return {
      sequence: row.sequence,
      visible_label: row.visible_label,
      arc_id: row.arc_id,
      arc_phase: scores.phase,
      concrete_event: `${row.action} 전환: ${row.turn_or_reveal} 지급: ${row.paid_reward}`,
      tension_1_10: scores.tension,
      reward_1_10: scores.reward,
      hook_1_10: scores.hook,
      information_weight: scores.information,
      action_weight: scores.action,
      relationship_weight: scores.relationship,
      emotion_weight: scores.emotion,
      material_or_status_weight: scores.material,
      pacing_note: `${scores.phase}. ${row.action} 즉시 지급은 “${row.paid_reward}”이며 종료 뒤 “${row.opened_loops}”가 남는다.`,
    };
  });
  const arcRows = buildArcRows(ranges, chapters, chapterRows);

  await Promise.all([
    writeFile(join(workDir, "chapter_map.csv"), serializeCsv(CHAPTER_HEADER, chapterRows), "utf8"),
    writeFile(join(workDir, "arc_map.csv"), serializeCsv(ARC_HEADER, arcRows), "utf8"),
    writeFile(join(workDir, "arc_pacing.csv"), serializeCsv(PACING_HEADER, pacingRows), "utf8"),
    writeFile(join(workDir, "arc_atlas.md"), buildArcAtlas(arcRows, chapterRows, pacingRows), "utf8"),
  ]);
  console.log(JSON.stringify({ chapters: chapterRows.length, arcs: arcRows.length, pacing: pacingRows.length }, null, 2));
}

await main();
