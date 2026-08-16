#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workDir = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(workDir, "..");
const repoRoot = resolve(outputDir, "../..");
const sourcePath = join(
  repoRoot,
  "private_sources/korean_webnovel_corpus/강동호/대망_강동호_합본.txt",
);

const chapterHeader = [
  "sequence", "visible_label", "title", "start_line", "end_line", "entry_state",
  "reader_promise", "protagonist_goal", "action", "resistance_or_cost",
  "turn_or_reveal", "paid_reward", "state_change_axis", "state_change",
  "ending_hook", "closed_loops", "opened_loops", "arc_id", "confidence",
];
const arcHeader = [
  "arc_id", "arc_name", "start_sequence", "end_sequence", "start_label",
  "end_label", "episode_count", "main_characters", "main_locations",
  "concrete_premise", "central_question", "promise", "pressure_escalation",
  "mid_turn", "concrete_payoff", "relationship_change",
  "status_or_ability_change", "residual_cost", "next_arc_bridge",
  "boundary_signals", "confidence",
];
const pacingHeader = [
  "sequence", "visible_label", "arc_id", "arc_phase", "concrete_event",
  "tension_1_10", "reward_1_10", "hook_1_10", "information_weight",
  "action_weight", "relationship_weight", "emotion_weight",
  "material_or_status_weight", "pacing_note",
];

const parts = ["001_334", "335_668", "669_1002"];

// The two delegated reading ranges cut through source-defined story movements.
// Merge only these explicit seam ranges; all other boundaries remain as read.
const seamRanges = [
  { start: 333, end: 342, arcName: "무엇보다 소중한 것의 시험" },
  { start: 664, end: 676, arcName: "저울질이 만든 전화위복" },
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
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (quoted) throw new Error("CSV has an unclosed quoted field");
  if (field || row.length) {
    row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
    rows.push(row);
  }
  return rows.filter((candidate) => !(candidate.length === 1 && candidate[0] === ""));
}

function asObjects(rows, expectedHeader, label) {
  const [header, ...body] = rows;
  if (header.join(",") !== expectedHeader.join(",")) {
    throw new Error(`${label}: header mismatch\n${header.join(",")}`);
  }
  if (body.some((row) => row.length !== header.length)) {
    throw new Error(`${label}: row width mismatch`);
  }
  return body.map((row) => Object.fromEntries(header.map((key, index) => [key, row[index]])));
}

function csvEscape(value) {
  return `"${String(value ?? "").replaceAll('"', '""').replaceAll(/\r?\n/gu, " ")}"`;
}

function serializeCsv(header, rows) {
  return `${header.map(csvEscape).join(",")}\n${rows
    .map((row) => header.map((key) => csvEscape(row[key])).join(","))
    .join("\n")}\n`;
}

function compactJoin(values, separator = " / ") {
  const seen = new Set();
  const kept = [];
  for (const value of values) {
    const clean = String(value ?? "").trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    kept.push(clean);
  }
  return kept.join(separator);
}

function mergeList(values) {
  const items = values.flatMap((value) => String(value ?? "").split(/\s*[;,·/]\s*/u));
  return compactJoin(items, ", ");
}

function mergeArcRows(rows, arcName) {
  const first = rows[0];
  const last = rows.at(-1);
  const start = Number(first.start_sequence);
  const end = Number(last.end_sequence);
  const minimumConfidence = Math.min(...rows.map((row) => Number(row.confidence) || 0.8));
  return {
    ...first,
    arc_name: arcName || compactJoin(rows.map((row) => row.arc_name), "·"),
    start_sequence: String(start),
    end_sequence: String(end),
    episode_count: String(end - start + 1),
    main_characters: mergeList(rows.map((row) => row.main_characters)),
    main_locations: mergeList(rows.map((row) => row.main_locations)),
    concrete_premise: compactJoin(rows.map((row) => row.concrete_premise)),
    central_question: compactJoin(rows.map((row) => row.central_question)),
    promise: compactJoin(rows.map((row) => row.promise)),
    pressure_escalation: compactJoin(rows.map((row) => row.pressure_escalation)),
    mid_turn: compactJoin(rows.map((row) => row.mid_turn)),
    concrete_payoff: compactJoin(rows.map((row) => row.concrete_payoff)),
    relationship_change: compactJoin(rows.map((row) => row.relationship_change)),
    status_or_ability_change: compactJoin(rows.map((row) => row.status_or_ability_change)),
    residual_cost: compactJoin(rows.map((row) => row.residual_cost)),
    next_arc_bridge: last.next_arc_bridge,
    boundary_signals: compactJoin(rows.map((row) => row.boundary_signals)),
    confidence: minimumConfidence.toFixed(2),
  };
}

function applyExplicitSeamMerges(arcs) {
  const result = [...arcs];
  for (const range of seamRanges) {
    const selected = result
      .filter((arc) => Number(arc.end_sequence) >= range.start && Number(arc.start_sequence) <= range.end)
      .sort((left, right) => Number(left.start_sequence) - Number(right.start_sequence));
    if (!selected.length) throw new Error(`no arcs overlap seam range ${range.start}~${range.end}`);
    const exactStart = Number(selected[0].start_sequence) === range.start;
    const exactEnd = Number(selected.at(-1).end_sequence) === range.end;
    const adjacent = selected.every((arc, index) => index === 0
      || Number(arc.start_sequence) === Number(selected[index - 1].end_sequence) + 1);
    if (!exactStart || !exactEnd || !adjacent) {
      throw new Error(`seam range ${range.start}~${range.end} does not align with delegated arc boundaries`);
    }
    const merged = mergeArcRows(selected, range.arcName);
    const firstIndex = result.findIndex((arc) => arc.arc_id === selected[0].arc_id);
    result.splice(firstIndex, selected.length, merged);
  }
  return result;
}

function assertContinuous(rows, label, firstSequence = 1) {
  rows.forEach((row, index) => {
    const expected = firstSequence + index;
    if (Number(row.sequence) !== expected) {
      throw new Error(`${label}: expected sequence ${expected}, got ${row.sequence}`);
    }
  });
}

function deriveMarkers(sourceText) {
  const lines = sourceText.split("\n");
  const markers = [];
  lines.forEach((line, index) => {
    if (line.startsWith("ⓚ")) markers.push({ raw: line.replace(/\r$/u, ""), line: index + 1 });
  });
  return markers.map((marker, index) => ({
    sequence: index + 1,
    visibleLabel: marker.raw.slice(1),
    startLine: marker.line,
    endLine: (markers[index + 1]?.line ?? (lines.at(-1) === "" ? lines.length : lines.length + 1)) - 1,
  }));
}

function makeScoreBar(value) {
  const score = Math.max(1, Math.min(10, Number(value) || 1));
  return `${"■".repeat(score)}${"□".repeat(10 - score)} ${score}`;
}

function makeAtlas(arcs, pacing) {
  const macroWaves = [
    ["001~048", "트리폴리 유배에서 첫 거래·호텔 테러·카다피 컬렉션 탈출까지", "버려진 사원이 자기 판단으로 사람과 화물을 통과시키는 현장 거래자가 된다."],
    ["049~115", "마카오 김인철 역공과 리비아 시가전, 소더비·만수르 거래", "개인 복수와 국제 거래가 맞물리고 자말·하킴 가족의 안전이 책임으로 편입된다."],
    ["116~193", "시에라리온 광산과 TC인터내셔널 작전주 역이용", "사기 재료였던 광산과 무너진 회사를 실물 사업 기반으로 바꾼다."],
    ["194~277", "무기 중개·치우 팀·광산 수성·알레포와 워털루 브리지", "돈과 개인 전투력이 조직력으로 바뀌며 공격의 배후까지 비용을 청구한다."],
    ["278~384", "정소현과의 연애, 뭄바이·동결 채권·샤레프와 시리아 유물", "귀환할 관계가 생기는 동시에 후견받던 샤레프가 책임지는 거래자로 성장한다."],
    ["385~500", "미리내·미디어 성장, 국내 세력전, 트리폴리 원유", "전쟁터의 자원과 한국의 회사·브랜드가 하나의 사업망으로 연결된다."],
    ["501~625", "드라마 흥행, 121부대·모사드·예멘", "미디어 보상과 국제 첩보전이 교차하고 동료의 죽음과 자말의 중상이 값을 남긴다."],
    ["626~713", "샹그릴라, 태일 후계전, 시에라리온 쿠데타와 철광산", "가족기업의 혈연이 무너지는 동안 혁권의 군사 지원은 자원 지분으로 환전된다."],
    ["714~817", "키돈 복수, 이란 중재, 북한 잠수함, 셰일 오일", "복수의 범위를 닫고 국가 에너지 수급과 수십억 달러 자산을 움직이는 중개자로 커진다."],
    ["818~920", "콩고 쿠데타, 야마구치 구미, 태일 표 대결, 국가급 무기 거래", "현장 작전·기업 표결·왕실 계약을 연결해 누구도 혼자 풀지 못하는 판을 조율한다."],
    ["921~1002", "차기 전차 사업, 이산가족 구출, 김인철 최종전과 제주 청혼", "국가급 성취 뒤 001화의 악연을 직접 닫고 살아 돌아와 함께 살겠다는 약속으로 완결한다."],
  ];

  const lines = [
    "# 『대망』 자연 사건 Arc 아틀라스",
    "",
    "## 읽는 법과 경계 원칙",
    "",
    "이 아틀라스는 원문 001~1002화를 파일 순서대로 모두 읽고 만든 자연 사건 Arc 지도다. 원문의 `#` 사건형 소제목은 경계 후보로만 사용했고, 중심 목표·상대 세력·장소가 함께 바뀌거나 앞선 약속이 실제 승패·보상·손실로 정산되는 지점에서 경계를 확정했다. 따라서 `Ⅰ/Ⅱ`처럼 하나의 질문을 계속 푸는 표면 제목은 합쳤고, 같은 장소가 이어져도 거래 대상과 승리 조건이 바뀌면 갈랐다.",
    "",
    "각 Arc의 **관찰** 항목은 원문에 실제로 나타난 인물·장소·행동·물건·결과를 복원한다. **해석** 항목은 그 사건이 독자에게 건 약속, 압력의 기능, 다음 국면으로 야망을 재장전하는 방식을 설명한다. 돈·지위의 획득만 결산으로 세지 않고 관계 변화, 부상, 죽음, 불신과 다음 의무도 함께 남긴다.",
    "",
    "## 천 회 전체의 재장전 파형",
    "",
    "| 범위 | 주 무대와 대결 | 재장전 결과 |",
    "| --- | --- | --- |",
    ...macroWaves.map(([range, event, reload]) => `| ${range}화 | ${event} | ${reload} |`),
    "",
    "## Arc 색인",
    "",
    "| Arc | 범위 | 자연 사건 이름 | 중심 결산 |",
    "| --- | ---: | --- | --- |",
    ...arcs.map((arc) => `| ${arc.arc_id} | ${arc.start_sequence}~${arc.end_sequence}화 | ${arc.arc_name} | ${arc.concrete_payoff} |`),
    "",
    "## 자연 사건 Arc 상세",
    "",
  ];

  for (const arc of arcs) {
    lines.push(
      `### ${arc.arc_id} · ${arc.arc_name}`,
      "",
      `- 범위: ${arc.start_sequence}~${arc.end_sequence}화 (${arc.episode_count}화). 표면 번호 ${arc.start_label} → ${arc.end_label}.`,
      `- [관찰] 인물·장소: ${arc.main_characters}; ${arc.main_locations}.`,
      `- [관찰] 발단: ${arc.concrete_premise}`,
      `- [해석] 중심 질문: ${arc.central_question}`,
      `- [해석] 독자 약속: ${arc.promise}`,
      `- [관찰] 압력 상승: ${arc.pressure_escalation}`,
      `- [관찰] 중간 전환: ${arc.mid_turn}`,
      `- [관찰] 구체 결산: ${arc.concrete_payoff}`,
      `- [관찰] 관계 변화: ${arc.relationship_change}`,
      `- [관찰] 지위·능력·자산 변화: ${arc.status_or_ability_change}`,
      `- [해석] 인간적 여진과 다음 재장전: ${arc.residual_cost} ${arc.next_arc_bridge}`.trimEnd(),
      `- 경계 근거: ${arc.boundary_signals} (확신도 ${arc.confidence}).`,
      "",
      "| 회차 | 단계 | 구체 비트 | 긴장 | 보상 | 훅 | 종료 훅·리듬 판정 |",
      "| ---: | --- | --- | --- | --- | --- | --- |",
    );
    const arcPacing = pacing.filter((row) => row.arc_id === arc.arc_id);
    for (const row of arcPacing) {
      const clean = (value) => String(value ?? "").replaceAll("|", "\\|").replaceAll(/\r?\n/gu, " ");
      lines.push(`| ${row.visible_label} | ${clean(row.arc_phase)} | ${clean(row.concrete_event)} | ${makeScoreBar(row.tension_1_10)} | ${makeScoreBar(row.reward_1_10)} | ${makeScoreBar(row.hook_1_10)} | ${clean(row.pacing_note)} |`);
    }
    lines.push("");
  }

  lines.push(
    "## 초반·중반·후반 페이싱 변화",
    "",
    "초반은 낯선 장소의 규칙을 배우는 정보와 즉시 생존해야 하는 행동이 한 화 안에서 맞붙는다. 국경·사막·호텔·항구처럼 닫힌 통로가 생기고, 다음 화에는 뇌물·교섭·총격·우회 운송 가운데 하나로 통로를 연다. 보상도 선금, 계약서, 살아 돌아온 동료처럼 눈앞에서 확인된다. 김인철의 누명이라는 장기 부채는 마카오와 TC인터내셔널 결산으로 나누어 지급해 초반 200화의 추진력을 만든다.",
    "",
    "중반은 이미 얻은 회사·광산·배·인맥을 서로 다른 전선에서 재사용한다. 정소현의 촬영과 미리내 성장처럼 긴장을 낮춘 관계·직업 보상 뒤에 시리아·트리폴리·예멘의 급격한 행동 고점을 붙이고, 한국 재벌전과 해외 전쟁을 교차 편집해 한 축이 협상 중일 때 다른 축의 공격 준비를 보여 준다. 큰 거래를 닫은 뒤에는 죽은 부하, 가족 이주, 부상과 재활을 남겨 다음 확대가 이전 비용을 지우지 못하게 한다.",
    "",
    "후반은 기업 지분, 왕실 권력, 국가 무기 계약처럼 정보량이 큰 판을 먼저 쌓고 현장 작전으로 승리 조건을 확인한다. 거래 규모가 커져도 회차 말 훅은 추상적인 국제 정세가 아니라 납치된 가족, 움직이는 차량, 배신자의 연락, 시험 결과처럼 다음 행동을 강제하는 표면에 둔다. 987화 이후에는 국가급 사업의 보상을 일부러 뒤로 물리고 소현의 부상과 김인철 추격에 집중해 001화의 개인 악연을 최종 전선으로 되돌린다.",
    "",
    "## 경계가 약하거나 봉합된 구간",
    "",
    "- 333~342화는 분석 분할선이 334/335 사이를 지나지만 `무엇보다 소중한 것Ⅰ/Ⅱ`의 관계 시험과 샤레프 국면 진입 전 결산이 이어진다. 두 판독 구간을 하나의 자연 사건 Arc로 봉합했다.",
    "- 664~676화는 분석 분할선이 668/669 사이를 지나 `저울질`의 선택이 `전화위복`의 결과로 전환된다. 파일 분할선을 경계로 쓰지 않고 압력과 지급이 끝나는 지점까지 합쳤다.",
    "- 원문의 사건형 소제목은 170개지만 그 수를 Arc 수로 고정하지 않았다. `Ⅰ/Ⅱ` 연속 대결은 합쳤고, 제목이 같아도 승리 조건이 달라지는 곳은 전후 사건과 회차 지도를 근거로 갈랐다.",
    "- 위 두 봉합 구간 외에는 모든 Arc가 최소 두 개 이상의 신호를 가진다. 다만 국제 정세 설명과 다음 현장 이동이 같은 화에 겹치는 곳은 경계 확신도를 낮춰 후속 15작품 비교에서 재검토할 수 있게 했다.",
    "",
    "## 결말 Arc의 수렴과 지급",
    "",
    "987화부터 김인철은 필리핀에서 준비한 사람과 돈을 한국으로 보내 소현의 밴을 덤프트럭으로 들이받게 한다. 소현이 장기 손상과 과다 출혈 위험 속에서 수술받는 동안, 병원 지하 주차장에는 러시아계 공격대가 들어오고 혁권·하킴·임영식과 경호원들은 환자에게 닿지 못하게 시간을 번다. 혁권도 총상을 입지만 공격자의 신원과 필리핀 통로를 좇는다.",
    "",
    "필리핀의 추격은 숲·도로·차량 충돌을 거쳐 김인철과 혁권의 정면 대치로 좁혀진다. 혁권이 김인철을 직접 사살하면서 001화의 누명, TC인터내셔널의 1차 응징, 태일 후계전에서 반복 재개방된 악연이 최종 정산된다. 그러나 작품은 이 장면을 마지막 보상으로 삼지 않는다. 하킴과 부하들이 병원에 남고 혁권도 상처를 안은 채 제주로 돌아가며, 회복 중인 소현에게 모든 일이 끝났다고 확인시킨 뒤 반지를 건넨다. 소현의 청혼 수락은 복수 루프, 생환 루프, 연애 루프를 한 장면에서 동시에 닫는 지급이다.",
    "",
    "## 장편 전체 결산",
    "",
    "『대망』의 야망은 단순히 거래 금액이 커지는 직선이 아니다. 김혁권이 한 국면에서 얻은 배·회사·광산·인맥은 다음 국면의 해결 수단이 되지만, 동시에 더 큰 세력의 부탁과 공격을 끌어온다. 그래서 매 결산은 `승리 → 소유 또는 관계 변화 → 새 의무와 노출 → 더 큰 판`의 순서로 다시 장전된다. 트리폴리에서 컨테이너 한 대를 지키던 사람이 왕실·정부·재벌의 이해를 중재하게 되는 규모 상승도 이 누적 때문에 납득된다.",
    "",
    "인간적 여진은 성장의 장식이 아니라 제동 장치다. 자말의 상실과 재활, 알아바디와 다른 부하들의 죽음, 하킴의 반복되는 부상, 소현에게 전가된 위험은 성공을 무상으로 만들지 않는다. 마지막 결산이 김인철의 죽음에서 멈추지 않고 병원에 남은 사람들, 제주로 돌아온 혁권, 회복 중인 소현의 청혼 수락까지 머무는 이유도 같다. 천 회 동안 재장전된 야망은 결국 더 큰 돈이 아니라 살아 돌아갈 사람과 장소를 확보하는 데서 닫힌다.",
    "",
  );
  return lines.join("\n");
}

async function readPart(kind, part, header) {
  const stem = kind === "arc" ? `arcmap_${part}.csv` : `${kind}_${part}.csv`;
  return asObjects(parseCsv(await readFile(join(workDir, stem), "utf8")), header, stem);
}

async function main() {
  const [sourceText, chapterParts, pacingParts, arcParts] = await Promise.all([
    readFile(sourcePath, "utf8"),
    Promise.all(parts.map((part) => readPart("chapter", part, chapterHeader))),
    Promise.all(parts.map((part) => readPart("pacing", part, pacingHeader))),
    Promise.all(parts.map((part) => readPart("arc", part, arcHeader))),
  ]);

  const chapters = chapterParts.flat();
  const pacing = pacingParts.flat();
  let arcs = arcParts.flat().sort((left, right) => Number(left.start_sequence) - Number(right.start_sequence));
  assertContinuous(chapters, "chapter_map");
  assertContinuous(pacing, "arc_pacing");
  if (chapters.length !== 1002 || pacing.length !== 1002) throw new Error("expected 1002 chapter and pacing rows");

  const markers = deriveMarkers(sourceText);
  if (markers.length !== 1002) throw new Error(`expected 1002 markers, got ${markers.length}`);
  chapters.forEach((row, index) => {
    const marker = markers[index];
    row.visible_label = marker.visibleLabel;
    row.start_line = String(marker.startLine);
    row.end_line = String(marker.endLine);
  });
  pacing.forEach((row, index) => { row.visible_label = markers[index].visibleLabel; });

  arcs = applyExplicitSeamMerges(arcs);

  const oldToNew = new Map();
  const normalizedArcs = arcs.map((arc, index) => {
    const newId = `GA-${String(index + 1).padStart(3, "0")}`;
    const coveredOldIds = arc.arc_id.includes("+") ? arc.arc_id.split("+") : [arc.arc_id];
    coveredOldIds.forEach((oldId) => oldToNew.set(oldId, newId));
    // Explicit seam rows retain the first old ID; map every covered source row below too.
    const start = Number(arc.start_sequence);
    const end = Number(arc.end_sequence);
    return {
      ...arc,
      arc_id: newId,
      start_sequence: String(start),
      end_sequence: String(end),
      start_label: markers[start - 1].visibleLabel,
      end_label: markers[end - 1].visibleLabel,
      episode_count: String(end - start + 1),
    };
  });

  const arcForSequence = new Map();
  normalizedArcs.forEach((arc) => {
    for (let sequence = Number(arc.start_sequence); sequence <= Number(arc.end_sequence); sequence += 1) {
      if (arcForSequence.has(sequence)) throw new Error(`overlapping arc at ${sequence}`);
      arcForSequence.set(sequence, arc.arc_id);
    }
  });
  if (arcForSequence.size !== 1002) throw new Error(`arc coverage is ${arcForSequence.size}, expected 1002`);
  chapters.forEach((row) => { row.arc_id = arcForSequence.get(Number(row.sequence)); });
  pacing.forEach((row) => { row.arc_id = arcForSequence.get(Number(row.sequence)); });

  await Promise.all([
    writeFile(join(outputDir, "chapter_map.csv"), serializeCsv(chapterHeader, chapters), "utf8"),
    writeFile(join(outputDir, "arc_map.csv"), serializeCsv(arcHeader, normalizedArcs), "utf8"),
    writeFile(join(outputDir, "arc_pacing.csv"), serializeCsv(pacingHeader, pacing), "utf8"),
    writeFile(join(outputDir, "arc_atlas.md"), makeAtlas(normalizedArcs, pacing), "utf8"),
  ]);
  console.log(`merged 1002 chapters, 1002 pacing rows, ${normalizedArcs.length} natural arcs`);
}

await main();
