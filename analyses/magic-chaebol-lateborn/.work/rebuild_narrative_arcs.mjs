import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = "/Users/a2501/Desktop/firefly_studio/edge_repos/firefly_reference_lab";
const outputDir = path.join(root, "analyses/magic-chaebol-lateborn");
const workDir = path.join(outputDir, ".work");

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
const arcHeader = [
  "arc_id", "arc_name", "start_sequence", "end_sequence", "start_label", "end_label",
  "episode_count", "main_characters", "main_locations", "concrete_premise", "central_question",
  "promise", "pressure_escalation", "mid_turn", "concrete_payoff", "relationship_change",
  "status_or_ability_change", "residual_cost", "next_arc_bridge", "boundary_signals", "confidence",
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
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("닫히지 않은 CSV 따옴표");
  if (field !== "" || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((candidate) => candidate.some((cell) => cell !== ""));
}

function asObjects(filePath, expectedHeader) {
  const rows = parseCsv(fs.readFileSync(filePath, "utf8"));
  const header = rows.shift();
  if (header.join("\u0000") !== expectedHeader.join("\u0000")) {
    throw new Error(`헤더 불일치: ${filePath}`);
  }
  return rows.map((row, index) => {
    if (row.length !== expectedHeader.length) {
      throw new Error(`${filePath}:${index + 2} ${row.length}열, 예상 ${expectedHeader.length}열`);
    }
    return Object.fromEntries(expectedHeader.map((key, column) => [key, row[column]]));
  });
}

function csvEscape(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function writeCsv(filePath, header, rows) {
  const text = [
    header.join(","),
    ...rows.map((row) => header.map((key) => csvEscape(row[key])).join(",")),
    "",
  ].join("\n");
  fs.writeFileSync(filePath, text);
}

function withoutArcIdHash(header, rows) {
  const index = header.indexOf("arc_id");
  const normalized = [
    header.filter((_, column) => column !== index),
    ...rows.map((row) => header.filter((_, column) => column !== index).map((key) => row[key])),
  ];
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function md(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function uniqueJoin(values) {
  return [...new Set(values.filter((value) => String(value).trim()))].join(" / ");
}

function mean(rows, field) {
  return (rows.reduce((sum, row) => sum + Number(row[field]), 0) / rows.length).toFixed(1);
}

class DisjointSet {
  constructor(values) {
    this.parent = new Map(values.map((value) => [value, value]));
  }
  find(value) {
    const parent = this.parent.get(value);
    if (parent === undefined) throw new Error(`알 수 없는 병합 키: ${value}`);
    if (parent !== value) this.parent.set(value, this.find(parent));
    return this.parent.get(value);
  }
  union(left, right) {
    const a = this.find(left);
    const b = this.find(right);
    if (a !== b) this.parent.set(b, a);
  }
}

const chapters = asObjects(path.join(outputDir, "chapter_map.csv"), chapterHeader);
const pacing = asObjects(path.join(outputDir, "arc_pacing.csv"), pacingHeader);
if (chapters.length !== 304 || pacing.length !== 304) throw new Error("304화 표면 행 수 불일치");

const expectedSurface = JSON.parse(fs.readFileSync(path.join(workDir, "surface_hashes_before.json"), "utf8"));
const chapterSurfaceBefore = withoutArcIdHash(chapterHeader, chapters);
const pacingSurfaceBefore = withoutArcIdHash(pacingHeader, pacing);
if (chapterSurfaceBefore !== expectedSurface.chapter_map_without_arc_id) throw new Error("chapter_map 실제 표면이 재작업 전에 이미 달라졌다.");
if (pacingSurfaceBefore !== expectedSurface.arc_pacing_without_arc_id) throw new Error("arc_pacing 실제 표면이 재작업 전에 이미 달라졌다.");

const segmentSpecs = [
  { file: "narrative_arcs_001_102.csv", start: 1, end: 102, segment: "S1" },
  { file: "narrative_arcs_103_203.csv", start: 103, end: 203, segment: "S2" },
  { file: "narrative_arcs_204_304.csv", start: 204, end: 304, segment: "S3" },
];
const sourceArcs = [];
for (const spec of segmentSpecs) {
  const rows = asObjects(path.join(workDir, spec.file), arcHeader);
  let expectedStart = spec.start;
  for (const row of rows) {
    const start = Number(row.start_sequence);
    const end = Number(row.end_sequence);
    if (start !== expectedStart) throw new Error(`${spec.file} ${row.arc_id}: 시작 ${start}, 기대 ${expectedStart}`);
    if (end < start || Number(row.episode_count) !== end - start + 1) throw new Error(`${spec.file} ${row.arc_id}: 범위/길이 오류`);
    for (const field of arcHeader) if (!String(row[field]).trim()) throw new Error(`${spec.file} ${row.arc_id}: ${field} 공백`);
    sourceArcs.push({ ...row, _key: `${spec.segment}:${row.arc_id}`, _segment: spec.segment });
    expectedStart = end + 1;
  }
  if (expectedStart !== spec.end + 1) throw new Error(`${spec.file}: 마지막 커버리지 ${expectedStart - 1}`);
}

const dsu = new DisjointSet(sourceArcs.map((arc) => arc._key));
function arcAt(sequence) {
  const found = sourceArcs.find((arc) => Number(arc.start_sequence) <= sequence && Number(arc.end_sequence) >= sequence);
  if (!found) throw new Error(`${sequence}화 자연 Arc가 없다.`);
  return found;
}

// 세 분담 경계를 가로질러 원문에서 같은 누적 약속으로 이어지는 두 자연 Arc만 병합한다.
for (const [leftSequence, rightSequence] of [[102, 103], [203, 204]]) {
  dsu.union(arcAt(leftSequence)._key, arcAt(rightSequence)._key);
}

const grouped = new Map();
for (const arc of sourceArcs) {
  const rootKey = dsu.find(arc._key);
  if (!grouped.has(rootKey)) grouped.set(rootKey, []);
  grouped.get(rootKey).push(arc);
}
const groups = [...grouped.values()].sort((left, right) => Number(left[0].start_sequence) - Number(right[0].start_sequence));

const mergedOverrides = {
  "101-107": {
    arc_name: "골렘차 피습에서 35 대 30 부회장 선출까지",
    concrete_premise: "창립 멤버에게 준 골렘차가 재방파의 매복에서 김건웅을 구한 뒤 홍수홍이 크게 다치자, 조도겸은 라칼·조도훈의 공작을 공개하고 자금·암살·해킹이 겹친 주주전에서 세운의 공식 후계자를 가린다.",
    central_question: "사람을 지킨 기술과 살인 증거를 25조 원 자금전·물리 공격·투표 해킹까지 견디는 표로 바꿔 조도훈보다 먼저 세운의 공식 후계자가 될 수 있는가?",
    promise: "골렘차 생존과 병상의 복수 선언에서 시작해 칼리안의 10조 원, 개인주주 팬클럽, 35 대 30 승리, 조문홍의 손들기와 `조도겸 부회장` 호칭까지 한 후계전으로 지급한다.",
    pressure_escalation: "재방파 30명 매복과 홍수홍의 다리 손상에서 라칼의 10조 원, 25조 원 조달 필요, 대주주 배신, 화물차 암살과 100곳 이상 투표 해킹으로 압력이 확대된다.",
    mid_turn: "조도겸이 마법 방탄복을 직접 시연해 칼리안에게서 10조 원을 당일 송금받고 체인 라이트닝·대지의 기억·0호기로 물리 공격과 배신을 표심으로 되받는다.",
    concrete_payoff: "김건웅 생존; 재방파 장부와 라칼 살인 공작 공개; 주주투표 35% 대 30% 승리; 조문홍의 공개 손들기; 20대 세운그룹 부회장 호칭과 6서클 광역 전격마법.",
    relationship_change: "홍수홍은 대표님의 사람으로서 몸값을 치르고 도겸은 회복을 약속한다. 칼리안은 채권자이자 친구로 묶이고, 조문홍은 막내를 공개 후계자로 인정하며 조도훈과는 되돌리기 어려운 적대가 굳어진다.",
    status_or_ability_change: "비밀 증거전을 벌이던 자동차 사장에서 35% 지지를 얻은 세운그룹 부회장으로 올라서며 6서클 체인 라이트닝까지 실전 운용한다.",
    residual_cost: "홍수홍의 다리는 아직 회복되지 않았고 칼리안에게 진 10조 원, 라칼·조도훈의 잔존 복수, 부회장으로서 실적을 증명할 의무가 남는다.",
    next_arc_bridge: "부회장 지위를 현금흐름으로 바꾸기 위해 세운전자 사장을 겸임하고 마법 가전·스마트폰·통신 생태계에 들어간다.",
    boundary_signals: "① 101화 동료 보호 기술이 102화 공개 전면전의 직접 원인이 된다; ② 압력이 매복→자금전→암살·해킹으로 같은 후계 질문 아래 상승한다; ③ 107화 35 대 30 결과와 부회장 호칭이 장기 후계 약속을 닫고 108화 세운전자 사장 직무가 시작된다.",
    confidence: "high",
  },
  "198-204": {
    arc_name: "가고일 배송·산불 5천 톤과 세운메타버스 출범",
    concrete_premise: "조도겸이 가고일을 서울·캘리포니아 배송 인프라와 산불 진화 영웅으로 증명해 드론법을 움직이는 동안, 겜마블을 5조 원에 인수하고 배송 반대 조작극을 공개 폭로해 다음 산업인 세운메타버스의 인력·장치·경제 기반을 세운다.",
    central_question: "규제받던 가고일을 공공 배송망으로 정착시키고 일자리·안전 반발을 이긴 뒤, 그 평판과 인재를 진짜 가상세계 사업의 출발점으로 바꿀 수 있는가?",
    promise: "서울 미세먼지 의결, FAA 승인, 5만 대의 산불 5천 톤 투하, 미국 대통령의 실명 감사, 서울 드론법, 겜마블 전 직원 승계·연봉 인상, 조작극 전광판 폭로와 메타버스 3대 조건을 누적 지급한다.",
    pressure_escalation: "한국 규제와 배달 노동 반발, 미국 운항 안전 기준, 캘리포니아 강풍·대형 산불, 2천 대 파손과 30억 원 손실 뒤 김장욱의 고의 충돌·전치 6주 보도·30억 원 요구·신입 폭행 쇼가 이어진다.",
    mid_turn: "5만 가고일이 강풍을 뚫고 총 5천 톤 물을 투하해 미국 대통령의 감사를 얻고, 도겸은 인비지빌리티로 김장욱의 컨테이너에서 조작 지시와 장부를 확보해 현장 전광판에 공개한다.",
    concrete_payoff: "서울 미세먼지 사업·미국 FAA 승인·세계적 산불 영웅 평판·한국 드론 상용화·겜마블 5조 원 인수와 5천 명 이상 조직·김장욱 공작 붕괴·VR 기계·세계 최대 데이터센터·비트코인 경제 설계.",
    relationship_change: "황연우는 서울시장으로 법·시의원·여론 실행을 맡는 정치 파트너가 되고, 서광수는 지친 기술 고문에서 새 세계를 만들 세운메타버스 초대 사장으로 되살아난다. 겜마블 직원은 매각 대상에서 고용·임금이 보장된 세운 구성원이 된다.",
    status_or_ability_change: "가고일은 규제 대상 석상에서 대통령이 감사한 재난·배송 인프라로, 세운은 물류 기업을 넘어 현실 배송망과 가상세계 개발 조직을 함께 가진 플랫폼 그룹으로 이동한다.",
    residual_cost: "가고일 파손·마정석 교체와 직업 대체 갈등이 남고, 세운메타버스의 VR·데이터센터·가상경제는 아직 설계 단계다.",
    next_arc_bridge: "환상·최면을 안전한 VR로 바꾸고 데이비슨 부자의 재회와 대중 베타를 거쳐 메타버스의 현실감·수익성을 검증한다.",
    boundary_signals: "① 198화 가고일 제작·서울 시정에서 배송·산불·법 개정으로 같은 상용화 약속이 확대된다; ② 202~204화 조작 사고는 드론 상용화의 마지막 사회적 저항이며 공개 폭로와 김장욱 처분으로 닫힌다; ③ 204화 말 지배 목표가 배송 정착에서 VR·데이터센터·가상경제 제작으로 교체된다.",
    confidence: "high",
  },
};

const arcs = groups.map((parts, index) => {
  const start = Number(parts[0].start_sequence);
  const end = Number(parts.at(-1).end_sequence);
  const base = {
    arc_id: `NA${String(index + 1).padStart(3, "0")}`,
    arc_name: uniqueJoin(parts.map((arc) => arc.arc_name)),
    start_sequence: String(start),
    end_sequence: String(end),
    start_label: chapters[start - 1].visible_label,
    end_label: chapters[end - 1].visible_label,
    episode_count: String(end - start + 1),
    main_characters: uniqueJoin(parts.map((arc) => arc.main_characters)),
    main_locations: uniqueJoin(parts.map((arc) => arc.main_locations)),
    concrete_premise: uniqueJoin(parts.map((arc) => arc.concrete_premise)),
    central_question: uniqueJoin(parts.map((arc) => arc.central_question)),
    promise: uniqueJoin(parts.map((arc) => arc.promise)),
    pressure_escalation: uniqueJoin(parts.map((arc) => arc.pressure_escalation)),
    mid_turn: uniqueJoin(parts.map((arc) => arc.mid_turn)),
    concrete_payoff: uniqueJoin(parts.map((arc) => arc.concrete_payoff)),
    relationship_change: uniqueJoin(parts.map((arc) => arc.relationship_change)),
    status_or_ability_change: uniqueJoin(parts.map((arc) => arc.status_or_ability_change)),
    residual_cost: uniqueJoin(parts.map((arc) => arc.residual_cost)),
    next_arc_bridge: uniqueJoin(parts.map((arc) => arc.next_arc_bridge)),
    boundary_signals: uniqueJoin(parts.map((arc) => arc.boundary_signals)),
    confidence: parts.every((arc) => arc.confidence === "high") ? "high" : "medium",
  };
  return { ...base, ...(mergedOverrides[`${start}-${end}`] ?? {}) };
});

let expectedStart = 1;
for (const arc of arcs) {
  const start = Number(arc.start_sequence);
  const end = Number(arc.end_sequence);
  if (start !== expectedStart) throw new Error(`${arc.arc_id}: 시작 ${start}, 기대 ${expectedStart}`);
  if (Number(arc.episode_count) !== end - start + 1) throw new Error(`${arc.arc_id}: episode_count 오류`);
  const signalCount = String(arc.boundary_signals).split(/[①②③④⑤;\/]/).filter((part) => part.trim()).length;
  if (signalCount < 2) throw new Error(`${arc.arc_id}: 경계 신호 2개 미만`);
  expectedStart = end + 1;
}
if (expectedStart !== 305) throw new Error(`최종 커버리지 ${expectedStart - 1}`);

for (const chapter of chapters) {
  const sequence = Number(chapter.sequence);
  const arc = arcs.find((candidate) => Number(candidate.start_sequence) <= sequence && Number(candidate.end_sequence) >= sequence);
  if (!arc) throw new Error(`${sequence}화 새 NarrativeArc 없음`);
  chapter.arc_id = arc.arc_id;
}
for (const row of pacing) {
  const sequence = Number(row.sequence);
  const arc = arcs.find((candidate) => Number(candidate.start_sequence) <= sequence && Number(candidate.end_sequence) >= sequence);
  if (!arc) throw new Error(`${sequence}화 새 페이싱 NarrativeArc 없음`);
  row.arc_id = arc.arc_id;
}

if (withoutArcIdHash(chapterHeader, chapters) !== expectedSurface.chapter_map_without_arc_id) throw new Error("chapter_map 실제 표면 보존 실패");
if (withoutArcIdHash(pacingHeader, pacing) !== expectedSurface.arc_pacing_without_arc_id) throw new Error("arc_pacing 실제 표면 보존 실패");

writeCsv(path.join(outputDir, "chapter_map.csv"), chapterHeader, chapters);
writeCsv(path.join(outputDir, "arc_pacing.csv"), pacingHeader, pacing);
writeCsv(path.join(outputDir, "arc_map.csv"), arcHeader, arcs);

const pacingBySequence = new Map(pacing.map((row) => [Number(row.sequence), row]));
const atlas = [
  "# `마법 배운 재벌집 늦둥이` 자연 NarrativeArc Atlas",
  "",
  "## 작품 전체 독자 계약",
  "",
  "몰락한 세운그룹 늦둥이 조도겸이 1996년 열여섯 살로 돌아와, 새로운 방식으로 돈을 벌수록 마법이 열리는 골드 드래곤 하트와 실패한 미래의 기억으로 가족·기업·세계의 중심을 되찾는다. 독자는 미래 정보 선점, 마법의 현실 산업화, 수치로 확인되는 성과, 밥상·호칭·치료·자리로 보이는 관계 영수증을 함께 약속받는다.",
  "",
  "이 문서의 `NarrativeArc`는 InkOS가 다음 1~3화를 생산하는 `ArcPacket`과 다르다. 하나의 자연 Arc는 같은 지배 목표·상대·장소·누적 약속을 공유하는 여러 Packet을 품을 수 있고, 목표 변경·상대/장소 전환·큰 약속 결산·핵심 루프 교대·비가역 상태 변화 중 최소 두 신호가 확인될 때만 닫힌다. 아래 회차별 단계와 점수·다섯 비중 리본은 304화 전수 판독값을 그대로 보존했다.",
  "",
  "## 전체 자연 NarrativeArc 목차",
  "",
  "| Arc | 사건형 이름 | 범위 | 길이 | 누적 약속 | 큰 결산 |",
  "| --- | --- | ---: | ---: | --- | --- |",
];
for (const arc of arcs) {
  atlas.push(`| ${arc.arc_id} | ${md(arc.arc_name)} | ${arc.start_sequence}~${arc.end_sequence}화 | ${arc.episode_count}화 | ${md(arc.promise)} | ${md(arc.concrete_payoff)} |`);
}
atlas.push("");

for (const arc of arcs) {
  const arcChapters = chapters.filter((chapter) => chapter.arc_id === arc.arc_id);
  const arcPacing = arcChapters.map((chapter) => pacingBySequence.get(Number(chapter.sequence)));
  atlas.push(`## ${arc.arc_id} · ${arc.arc_name}`, "");
  atlas.push(`- **범위:** ${arc.start_sequence}~${arc.end_sequence}화, ${arc.episode_count}화`);
  atlas.push(`- **실제 등장인물:** ${arc.main_characters}`);
  atlas.push(`- **실제 장소:** ${arc.main_locations}`);
  atlas.push(`- **발단·전제:** ${arc.concrete_premise}`);
  atlas.push(`- **중앙 질문:** ${arc.central_question}`);
  atlas.push(`- **누적 약속:** ${arc.promise}`);
  atlas.push(`- **압력 상승:** ${arc.pressure_escalation}`);
  atlas.push(`- **중간 전환:** ${arc.mid_turn}`);
  atlas.push(`- **큰 결산과 실제 보상:** ${arc.concrete_payoff}`);
  atlas.push(`- **관계·호칭 영수증:** ${arc.relationship_change}`);
  atlas.push(`- **지위·능력 변화:** ${arc.status_or_ability_change}`);
  atlas.push(`- **남은 비용:** ${arc.residual_cost}`);
  atlas.push(`- **다음 자연 Arc 교대:** ${arc.next_arc_bridge}`);
  atlas.push(`- **경계 신호:** ${arc.boundary_signals}`);
  atlas.push(`- **경계 확신도:** ${arc.confidence}`);
  atlas.push(`- **평균 페이싱:** 긴장 ${mean(arcPacing, "tension_1_10")} / 보상 ${mean(arcPacing, "reward_1_10")} / 훅 ${mean(arcPacing, "hook_1_10")}`, "");
  atlas.push(
    "| 회차 | 부제 | 하위 Packet/비트 단계 | 실제 사건 | 실제 지급 | 종료 훅 | 긴장/보상/훅 | 정보·행동·관계·감정·물질 |",
    "| ---: | --- | --- | --- | --- | --- | ---: | ---: |",
  );
  for (const chapter of arcChapters) {
    const row = pacingBySequence.get(Number(chapter.sequence));
    atlas.push(`| ${chapter.sequence} | ${md(chapter.title || "(부제 없음)")} | ${md(row.arc_phase)} | ${md(row.concrete_event)} | ${md(chapter.paid_reward)} | ${md(chapter.ending_hook)} | ${row.tension_1_10}/${row.reward_1_10}/${row.hook_1_10} | ${row.information_weight}/${row.action_weight}/${row.relationship_weight}/${row.emotion_weight}/${row.material_or_status_weight} |`);
  }
  atlas.push("");
}

atlas.push(
  "## 장기 리듬과 Packet 계층",
  "",
  "- 초반은 성적·첫 투자·공매도처럼 결산이 가까운 Packet이 많지만, 세운 말단 입사 이후에는 여러 업무 시험이 `계열사 경영권 획득` 같은 뒤쪽 큰 결산을 향해 누적된다.",
  "- 중반은 한 계열사를 살리는 동안 연구·제품·공작·해외 검증 Packet이 교대하고, 자연 Arc는 회생·승계·상장·새 서클 같은 비가역 결산까지 이어진다.",
  "- 후반은 마탑·메타버스·국가 방어·자원전·우주처럼 결정권 반경이 커진다. 1~3화 Packet은 현장 과제를 쓰는 단위이고, 자연 Arc는 그 과제가 어떤 국가·조직·관계 상태를 바꿨는지 증명하는 단위다.",
  "",
  "## 결말 자연 Arc의 수렴",
  "",
  "303화 세계 1위 부자와 9서클 자격은 외형적 최고점이지만 곧 1년 강제 동면이라는 비용이 된다. 도겸이 사라지자 세운의 혁신은 멈추고 부패 사장들은 조민형을 옹립한다. 황연우·김건웅·홍 사장과 남은 사장단은 자리를 지킨다. 304화 도겸은 선출 회의에 돌아와 언령으로 비리를 자백시키고 11명을 해임한다. `세운의 심장이 돌아왔다`는 문장이 마법 성장, 조직 충성, 회귀 초의 가족·그룹 복구 약속을 함께 닫는다.",
  "",
  "## 경계 반례와 겹침 판정",
  "",
  "- 짧다는 이유만으로 합치지 않았다. 목표·상대·장소와 비가역 결산이 함께 바뀌는 짧은 사건은 독립 자연 Arc로 남겼다.",
  "- 길다는 이유만으로 자르지 않았다. 제품 연구→공개 검증→공작 반격→관계·직책 지급이 같은 누적 약속이면 여러 하위 Packet을 하나의 자연 Arc로 묶었다.",
  "- 종전 초안의 `메테오 위성망과 카지노 잠입`, `우주 발전소·불턴·빛의 지팡이`처럼 서로 다른 지배 목표와 장소를 한 이름에 묶은 곳은 원문 경계를 다시 확인해 분리했다.",
  "- 101~107화는 분담 경계와 부제 경계를 넘지만 동료 피습이 주주전의 직접 원인이며 35 대 30·부회장 호칭까지 같은 후계 약속이므로 통합했다.",
  "- 198~204화는 가고일 상용화의 법·노동·여론 저항이 김장욱 공작 처분까지 이어지고 세운메타버스 인재 확보가 그 결산 위에서 시작되므로 하나의 전환 자연 Arc로 묶었다.",
  "- 원문의 중복 부제와 표식 이상은 교정하지 않았다. 100·101화 `기술이전(2)`, 116·117화 `이동통신사(2)`, 244·245화 `천연가스(2)`, 26~32화의 빈 부제, 246화의 마침표 없는 표식을 그대로 보존했다.",
  "",
);
fs.writeFileSync(path.join(outputDir, "arc_atlas.md"), `${atlas.join("\n")}\n`);

const lengthCounts = {};
for (const arc of arcs) lengthCounts[arc.episode_count] = (lengthCounts[arc.episode_count] ?? 0) + 1;
console.log(JSON.stringify({
  chapters: chapters.length,
  pacing: pacing.length,
  narrativeArcs: arcs.length,
  minLength: Math.min(...arcs.map((arc) => Number(arc.episode_count))),
  maxLength: Math.max(...arcs.map((arc) => Number(arc.episode_count))),
  meanLength: Number((304 / arcs.length).toFixed(2)),
  lengthCounts,
  chapterSurfaceHash: withoutArcIdHash(chapterHeader, chapters),
  pacingSurfaceHash: withoutArcIdHash(pacingHeader, pacing),
}, null, 2));
