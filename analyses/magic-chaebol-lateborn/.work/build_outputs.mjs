import fs from "node:fs";
import path from "node:path";

const root = "/Users/a2501/Desktop/inkos/edge_repos/inkos_reverse_lab";
const outDir = path.join(root, "analyses/magic-chaebol-lateborn");
const workDir = path.join(outDir, ".work");
const sourcePath = path.join(
  root,
  "private_sources/korean_webnovel_corpus/서오/마법 배운 재벌집 늦둥이_서오_합본.txt",
);

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

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        value += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  if (value.length || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows.filter((candidate) => candidate.some((cell) => cell !== ""));
}

function csvEscape(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function stringifyCsv(header, objects) {
  return [
    header.join(","),
    ...objects.map((object) => header.map((key) => csvEscape(object[key])).join(",")),
    "",
  ].join("\n");
}

function loadObjects(filePath, expectedHeader) {
  const rows = parseCsv(fs.readFileSync(filePath, "utf8"));
  const actualHeader = rows.shift();
  if (actualHeader.join("\u0000") !== expectedHeader.join("\u0000")) {
    throw new Error(`헤더 불일치: ${filePath}`);
  }
  for (const [index, row] of rows.entries()) {
    if (row.length !== expectedHeader.length) {
      throw new Error(`${filePath}:${index + 2} 열 수 ${row.length}, 예상 ${expectedHeader.length}`);
    }
  }
  return rows.map((row) => Object.fromEntries(expectedHeader.map((key, index) => [key, row[index]])));
}

function actualMarkers() {
  const source = fs.readFileSync(sourcePath, "utf8");
  const lines = source.split(/\r?\n/);
  const lineCount = source.endsWith("\n") ? lines.length - 1 : lines.length;
  const markers = [];
  for (let index = 0; index < lineCount; index += 1) {
    const line = lines[index];
    if (!line.startsWith("ⓚ")) continue;
    const match = line.match(/^(ⓚ\d+화(?:\.)?)/);
    if (!match) throw new Error(`해석할 수 없는 표식: ${index + 1}행 ${line}`);
    const visibleLabel = match[1];
    const title = line.slice(visibleLabel.length).replace(/^[\s\u00a0]+/, "");
    markers.push({
      sequence: markers.length + 1,
      raw: line,
      visible_label: visibleLabel,
      title,
      start_line: index + 1,
      end_line: 0,
    });
  }
  markers.forEach((marker, index) => {
    marker.end_line = index + 1 < markers.length ? markers[index + 1].start_line - 1 : lineCount;
  });
  if (markers.length !== 304) throw new Error(`표식 수 ${markers.length}, 예상 304`);
  return markers;
}

function segmentFiles() {
  return fs
    .readdirSync(workDir)
    .map((name) => {
      const match = name.match(/^segment_(\d{3})_(\d{3})\.csv$/);
      return match ? { name, start: Number(match[1]), end: Number(match[2]) } : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.start - right.start);
}

class DisjointSet {
  constructor(values) {
    this.parent = new Map(values.map((value) => [value, value]));
  }

  find(value) {
    const parent = this.parent.get(value);
    if (parent === undefined) throw new Error(`알 수 없는 Arc 키: ${value}`);
    if (parent !== value) this.parent.set(value, this.find(parent));
    return this.parent.get(value);
  }

  union(left, right) {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) this.parent.set(rightRoot, leftRoot);
  }
}

function uniqueJoined(values) {
  return [...new Set(values.filter(Boolean))].join(" / ");
}

function md(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function mean(rows, field) {
  return (rows.reduce((sum, row) => sum + Number(row[field]), 0) / rows.length).toFixed(1);
}

const markers = actualMarkers();
const segments = segmentFiles();
if (!segments.length) throw new Error("조립할 segment CSV가 없다.");

let expectedSequence = 1;
for (const segment of segments) {
  if (segment.start !== expectedSequence) {
    throw new Error(`segment 연속성 실패: ${expectedSequence} 다음이 ${segment.start}`);
  }
  expectedSequence = segment.end + 1;
}
if (expectedSequence !== 305) throw new Error(`segment 종점 ${expectedSequence - 1}, 예상 304`);

const chapters = [];
const pacingRows = [];
const localArcRows = [];
const arcRowByKey = new Map();

for (const segment of segments) {
  const stem = segment.name.replace(/\.csv$/, "");
  const segmentKey = `${segment.start}-${segment.end}`;
  const chapterRows = loadObjects(path.join(workDir, segment.name), chapterHeader);
  const segmentPacing = loadObjects(path.join(workDir, `${stem}_pacing.csv`), pacingHeader);
  const segmentArcs = loadObjects(path.join(workDir, `${stem}_arcs.csv`), arcHeader);
  if (chapterRows.length !== segment.end - segment.start + 1) {
    throw new Error(`${segment.name} 행 수 불일치`);
  }
  if (segmentPacing.length !== chapterRows.length) {
    throw new Error(`${stem}_pacing.csv 행 수 불일치`);
  }
  const localSequencesByArc = new Map();
  for (const [offset, chapter] of chapterRows.entries()) {
    const sequence = segment.start + offset;
    if (Number(chapter.sequence) !== sequence) throw new Error(`${segment.name} sequence ${chapter.sequence}`);
    const marker = markers[sequence - 1];
    const localArcKey = `${segmentKey}:${chapter.arc_id}`;
    if (!chapter.arc_id.trim()) throw new Error(`${segment.name} ${sequence}화 arc_id 공백`);
    for (const field of [
      "entry_state",
      "reader_promise",
      "protagonist_goal",
      "action",
      "resistance_or_cost",
      "turn_or_reveal",
      "paid_reward",
      "state_change",
      "ending_hook",
    ]) {
      if (!chapter[field].trim()) throw new Error(`${segment.name} ${sequence}화 ${field} 공백`);
    }
    if (!localSequencesByArc.has(chapter.arc_id)) localSequencesByArc.set(chapter.arc_id, []);
    localSequencesByArc.get(chapter.arc_id).push(sequence);
    chapters.push({
      ...chapter,
      sequence,
      visible_label: marker.visible_label,
      title: marker.title,
      start_line: marker.start_line,
      end_line: marker.end_line,
      _localArcKey: localArcKey,
      _segmentKey: segmentKey,
    });
  }
  for (const [offset, pacing] of segmentPacing.entries()) {
    const sequence = segment.start + offset;
    if (Number(pacing.sequence) !== sequence) throw new Error(`${stem}_pacing.csv sequence ${pacing.sequence}`);
    for (const field of ["tension_1_10", "reward_1_10", "hook_1_10"]) {
      const score = Number(pacing[field]);
      if (!Number.isInteger(score) || score < 1 || score > 10) {
        throw new Error(`${stem}_pacing.csv ${sequence}화 ${field}=${pacing[field]}`);
      }
    }
    const weightSum = [
      "information_weight",
      "action_weight",
      "relationship_weight",
      "emotion_weight",
      "material_or_status_weight",
    ].reduce((sum, field) => sum + Number(pacing[field]), 0);
    if (weightSum !== 100) throw new Error(`${stem}_pacing.csv ${sequence}화 비중 합 ${weightSum}`);
    pacingRows.push({
      ...pacing,
      sequence,
      visible_label: markers[sequence - 1].visible_label,
      _localArcKey: `${segmentKey}:${pacing.arc_id}`,
    });
  }
  for (const arc of segmentArcs) {
    const key = `${segmentKey}:${arc.arc_id}`;
    const decorated = { ...arc, _localArcKey: key, _segmentKey: segmentKey };
    localArcRows.push(decorated);
    arcRowByKey.set(key, decorated);
  }
  for (const arc of segmentArcs) {
    const sequences = localSequencesByArc.get(arc.arc_id);
    if (!sequences?.length) throw new Error(`${stem}_arcs.csv ${arc.arc_id}에 배정 회차가 없다.`);
    const start = Math.min(...sequences);
    const end = Math.max(...sequences);
    if (sequences.length !== end - start + 1) throw new Error(`${arc.arc_id}가 비연속 배정됐다.`);
    if (Number(arc.start_sequence) !== start || Number(arc.end_sequence) !== end) {
      throw new Error(`${arc.arc_id} 범위 ${arc.start_sequence}-${arc.end_sequence}, 실제 ${start}-${end}`);
    }
    if (Number(arc.episode_count) !== sequences.length) throw new Error(`${arc.arc_id} episode_count 불일치`);
  }
}

for (const chapter of chapters) {
  if (!arcRowByKey.has(chapter._localArcKey)) {
    throw new Error(`${chapter.sequence}화의 ${chapter._localArcKey}에 대응하는 Arc 행이 없다.`);
  }
}

const dsu = new DisjointSet([...new Set(chapters.map((chapter) => chapter._localArcKey))]);
for (const [leftSequence, rightSequence] of [
  [102, 103],
  [152, 153],
  [203, 204],
]) {
  const left = chapters[leftSequence - 1];
  const right = chapters[rightSequence - 1];
  dsu.union(left._localArcKey, right._localArcKey);
}

const groupedChapters = new Map();
for (const chapter of chapters) {
  const rootKey = dsu.find(chapter._localArcKey);
  if (!groupedChapters.has(rootKey)) groupedChapters.set(rootKey, []);
  groupedChapters.get(rootKey).push(chapter);
}
const arcGroups = [...groupedChapters.entries()].sort(
  (left, right) => left[1][0].sequence - right[1][0].sequence,
);
const globalIdByRoot = new Map(
  arcGroups.map(([rootKey], index) => [rootKey, `A${String(index + 1).padStart(3, "0")}`]),
);

for (const chapter of chapters) chapter.arc_id = globalIdByRoot.get(dsu.find(chapter._localArcKey));
for (const pacing of pacingRows) pacing.arc_id = globalIdByRoot.get(dsu.find(pacing._localArcKey));

const mergeOverrides = {
  "101-107": {
    arc_name: "골렘차 피습에서 35 대 30 부회장 선출까지",
    concrete_premise:
      "조도겸이 창립 멤버에게 준 골렘차가 재방파의 매복에서 김건웅을 구한 뒤, 홍수홍의 영구 손상과 라칼·조도훈의 공격을 공개하고 50조 원 규모 주주전으로 후계전을 결산한다.",
    central_question:
      "사람을 지킨 기술과 살인 증거를 25조 원 자금전·암살·해킹까지 버티는 표로 바꿔 형보다 먼저 세운의 공식 후계자가 될 수 있는가?",
    promise:
      "동료용 방호차의 실전 생존, 병상의 복수 선언, 칼리안 10조 원, 개인주주 팬클럽, 35 대 30 승리, 조문홍의 손들기와 `조도겸 부회장` 호칭을 한 전면전으로 지급한다.",
    pressure_escalation:
      "재방파 30명 매복과 홍수홍의 다리 손상에서 시작해 라칼의 10조 원, 25조 원 조달 필요, 대주주 배신, 화물차 암살, 100곳 이상 투표 해킹으로 확대된다.",
    mid_turn:
      "마법 방탄복을 직접 시연해 칼리안에게서 10조 원을 당일 송금받고, 체인 라이트닝과 대지의 기억으로 물리 공격과 배신을 표심으로 되받는다.",
    concrete_payoff:
      "김건웅 생존; 재방파 장부와 라칼 살인 공작 공개; 주주투표 35% 대 30% 승리; 조문홍의 공개 손들기; 20대 세운그룹 부회장 호칭과 6서클 광역 전격마법.",
    relationship_change:
      "홍수홍은 대표님의 사람으로서 몸값을 치르고 도겸은 회복을 약속한다. 칼리안은 채권자이자 친구로 묶이고, 조문홍은 막내를 공개 후계자로 인정하며 조도훈과는 되돌리기 어려운 적대가 굳어진다.",
    status_or_ability_change:
      "비밀 증거전을 하던 자동차 사장에서 35% 지지를 얻은 세운그룹 부회장으로 올라서며 6서클 체인 라이트닝까지 실전 운용한다.",
    residual_cost:
      "홍수홍의 다리는 아직 회복되지 않았고 칼리안에게 진 10조 원, 라칼·조도훈의 잔존 복수, 부회장 실적 증명 의무가 남는다.",
    next_arc_bridge: "부회장 지위를 현금흐름으로 바꾸기 위해 세운전자 사장을 겸임하고 마법 가전 사업에 들어간다.",
    boundary_signals:
      "① 101화의 동료 보호 기술이 102화 공개 전면전의 직접 원인이 된다; ② 압력이 매복→자금전→암살·해킹으로 같은 후계 질문 아래 상승한다; ③ 107화 35 대 30 결과와 부회장 호칭이 장기 후계 약속을 닫고 다음 날 전자 사장 직무가 시작된다.",
    confidence: "high",
  },
  "152-153": {
    arc_name: "3조 전리품으로 세운 63빌딩 마법사의 탑을 세우다",
    concrete_premise:
      "우미구치구미에서 회수한 약 3조 원이 두 번째 7서클 개방권이 되고, 조도겸은 미래생명 지분 지원을 대가로 63빌딩을 사 과학·골렘·마법진이 결합된 첫 마법사의 탑으로 바꾼다.",
    central_question: "대화그룹의 상징을 사는 데서 끝나지 않고 서울 한복판에서 실제 마력을 생산·연구·통치하는 탑으로 완성할 수 있는가?",
    promise:
      "금괴·계좌 전리품을 7서클 지식, 1조3천억 원 63빌딩, 투명 마법진 유리, 골렘 시공, 포탈과 룬 해독, 세운 표식으로 환전한다.",
    mid_turn:
      "강현승이 미래생명 지분 10% 지원 조건으로 매각을 수락하고, 0호기가 룬을 분석하면서 개인 마법사의 기억이 대형 건물 공정으로 번역된다.",
    concrete_payoff:
      "63빌딩 소유권; 대화 마크에서 세운 마크로 교체; 60층 조도겸 사무실; 투명 외벽 마법진·수정구·포탈·골렘이 연동된 마탑 완공.",
    relationship_change:
      "강현승은 건물 매도자에서 미래생명 경영권을 지원받는 거래 동맹이 되고, 코일·0호기·시공진은 조도겸의 마법 연구 거점에 결집한다.",
    status_or_ability_change: "조도겸은 63빌딩 소유자이자 7서클 마탑주가 되고 개인 마법을 도시 규모 시설로 확장한다.",
    residual_cost: "마탑의 비밀·유지비와 대규모 마력 운용 부담, 샤롯 성경호에 대한 직접 응징이 남는다.",
    next_arc_bridge: "완성된 마탑의 힘과 자원을 생활 제품·자연재해·국제 사업에 쓰는 단계로 이동한다.",
    boundary_signals:
      "① 야쿠자 전리품 정산과 7서클 선택이 새 목표를 연다; ② 63빌딩 매입→외벽·내부 설비 공사→마탑 완성으로 하나의 건설 루프가 닫힌다; ③ 다음 화부터 중심 상품·상대·생활 결핍이 바뀐다.",
    confidence: "high",
  },
  "202-204": {
    arc_name: "5조 겜마블과 드론 조작극을 넘어 메타버스 기반을 세우다",
    concrete_premise:
      "조도겸이 5조 원에 겜마블을 인수하고 서울 드론 배송을 여는 순간 김장욱의 시민단체가 가짜 충돌·폭행 쇼를 벌이자, 공개 증거로 여론을 뒤집고 확보한 5천 명 조직으로 진짜 메타버스의 세 기반을 설계한다.",
    central_question:
      "대규모 인재·법적 운행권을 확보하면서도 대기업 횡포라는 조작 보도를 뒤집고 VR·데이터센터·가상경제가 있는 새 세계를 출발시킬 수 있는가?",
    promise:
      "겜마블 전 직원 고용·연봉 10% 인상, 서울 위그 딜리버리, 조작 지시의 대형 전광판 공개, 김장욱 처분, VR·세계 최대 데이터센터·비트코인 경제 설계를 한 묶음으로 지급한다.",
    pressure_escalation:
      "5조 원 선투자와 주주의 우려, 배달노조의 잠자리채·돌, 고의 충돌과 전치 6주 보도, 30억 원 요구, 신입 회원을 실제로 다치게 하는 폭행 쇼가 기업 평판을 압박한다.",
    mid_turn:
      "도겸이 인비지빌리티로 김장욱의 컨테이너에 들어가 장부·컴퓨터·지시 영상을 확보하고, 기자가 모인 폭행 현장의 대형 전광판에 자막과 함께 재생한다.",
    concrete_payoff:
      "겜마블 인수와 5천 명 이상 개발 조직; 서울 첫 가고일 배송 허가; 가짜 충돌·폭행 증거와 언론 역전; 김장욱의 조직 붕괴·무인도 유배; VR 기계·데이터센터·비트코인 경제라는 제작 조건 확정.",
    relationship_change:
      "겜마블 직원은 매각 대상에서 고용·임금이 보장된 세운 구성원이 되고 서광수는 지친 기술 고문에서 새 세계를 만들 초대 사장으로 되살아난다. 김장욱은 시민운동가 가면과 조직 지배력을 모두 잃는다.",
    status_or_ability_change:
      "세운은 SNS·게임 회사를 가진 그룹에서 현실 배송망과 가상세계 개발 조직을 동시에 운영하는 메타버스 사업자로 이동한다.",
    residual_cost:
      "시민단체 조작은 정리됐지만 직업 대체 갈등은 남고, 아직 VR 기계·데이터센터·경제 시스템 어느 것도 완성되지 않았다.",
    next_arc_bridge: "세운전자의 마법 기술로 VR 장치를 만들고 메타버스의 현실감·수익성을 실제 사용자에게 검증한다.",
    boundary_signals:
      "① 202화 겜마블 인수·드론 시범운행과 조작 사고가 같은 신규사업 출발에서 발생한다; ② 203화 공개 폭로와 204화 법적·개인적 처분으로 평판 루프가 닫힌다; ③ 204화 말 목표가 배송 여론전에서 VR·데이터센터·가상경제 제작으로 교체된다.",
    confidence: "high",
  },
};

const arcRows = arcGroups.map(([rootKey, groupChapters]) => {
  const localKeys = [...new Set(groupChapters.map((chapter) => chapter._localArcKey))];
  const sources = localKeys.map((key) => arcRowByKey.get(key));
  const start = groupChapters[0].sequence;
  const end = groupChapters.at(-1).sequence;
  const override = mergeOverrides[`${start}-${end}`] ?? {};
  const base = {
    arc_id: globalIdByRoot.get(rootKey),
    arc_name: uniqueJoined(sources.map((row) => row.arc_name)),
    start_sequence: start,
    end_sequence: end,
    start_label: markers[start - 1].visible_label,
    end_label: markers[end - 1].visible_label,
    episode_count: end - start + 1,
    main_characters: uniqueJoined(sources.map((row) => row.main_characters)),
    main_locations: uniqueJoined(sources.map((row) => row.main_locations)),
    concrete_premise: uniqueJoined(sources.map((row) => row.concrete_premise)),
    central_question: uniqueJoined(sources.map((row) => row.central_question)),
    promise: uniqueJoined(sources.map((row) => row.promise)),
    pressure_escalation: uniqueJoined(sources.map((row) => row.pressure_escalation)),
    mid_turn: uniqueJoined(sources.map((row) => row.mid_turn)),
    concrete_payoff: uniqueJoined(sources.map((row) => row.concrete_payoff)),
    relationship_change: uniqueJoined(sources.map((row) => row.relationship_change)),
    status_or_ability_change: uniqueJoined(sources.map((row) => row.status_or_ability_change)),
    residual_cost: uniqueJoined(sources.map((row) => row.residual_cost)),
    next_arc_bridge: uniqueJoined(sources.map((row) => row.next_arc_bridge)),
    boundary_signals: uniqueJoined(sources.map((row) => row.boundary_signals)),
    confidence: sources.every((row) => row.confidence === "high") ? "high" : "medium",
  };
  return { ...base, ...override };
});

for (const [index, arc] of arcRows.entries()) {
  const expectedStart = index === 0 ? 1 : Number(arcRows[index - 1].end_sequence) + 1;
  if (Number(arc.start_sequence) !== expectedStart) throw new Error(`${arc.arc_id} 시작 연속성 실패`);
  if (Number(arc.episode_count) !== Number(arc.end_sequence) - Number(arc.start_sequence) + 1) {
    throw new Error(`${arc.arc_id} episode_count 실패`);
  }
  const signals = String(arc.boundary_signals).split(/[①②③④⑤;\/]/).filter((part) => part.trim()).length;
  if (signals < 2) throw new Error(`${arc.arc_id} 경계 신호가 두 개 미만으로 보인다.`);
}

fs.writeFileSync(path.join(outDir, "chapter_map.csv"), stringifyCsv(chapterHeader, chapters));
fs.writeFileSync(path.join(outDir, "arc_map.csv"), stringifyCsv(arcHeader, arcRows));
fs.writeFileSync(path.join(outDir, "arc_pacing.csv"), stringifyCsv(pacingHeader, pacingRows));

const pacingBySequence = new Map(pacingRows.map((row) => [Number(row.sequence), row]));
const atlas = [];
atlas.push("# `마법 배운 재벌집 늦둥이` 전체 Arc Atlas", "");
atlas.push("## 작품 전체 독자 계약", "");
atlas.push(
  "몰락한 세운그룹의 늦둥이 조도겸이 1996년 열여섯 살로 돌아와, 돈을 벌수록 새 마법이 열리는 골드 드래곤 하트와 실패한 미래의 기억으로 형·조카가 망친 가족과 그룹을 다시 장악한다. 독자는 `미래 정보로 기회를 선점한다`는 재벌물 보상과 `그 돈이 마법이 되고 마법이 다시 산업이 된다`는 성장 보상을 동시에 약속받는다.",
  "",
  "성과는 계좌 숫자로만 끝나지 않는다. 성적표를 본 아버지의 허락, 외할머니가 직접 끓인 김치찌개와 부엌 자리, 황연우 부모의 검진과 충성, 직원의 승진·보너스·집·치료, 사장단의 기립, 옛 식탁의 갈비찜과 뒤늦은 `작은아버지`, 마지막 복귀 때 다시 뛰는 `세운의 심장`처럼 사람이 행동·호칭·자리로 결과를 증언해야 완전히 지급된다.",
  "",
  "각 Arc는 고정 길이가 아니라 목표·상대·장소, 앞선 약속의 결산, 불가역 상태 변화 가운데 두 가지 이상이 바뀌는 실제 사건 경계로 나눴다. 회차별 수치는 기계적 단계 공식이 아니라 해당 장면의 위험·보상·종료 압력에 따라 판정했다.",
  "",
);
atlas.push("## 전체 Arc 목차", "");
atlas.push("| Arc | 사건형 이름 | 범위 | 길이 | 독자 약속 | 구체 결산 |", "| --- | --- | ---: | ---: | --- | --- |");
for (const arc of arcRows) {
  atlas.push(
    `| ${arc.arc_id} | ${md(arc.arc_name)} | ${arc.start_sequence}~${arc.end_sequence}화 | ${arc.episode_count}화 | ${md(arc.promise)} | ${md(arc.concrete_payoff)} |`,
  );
}
atlas.push("");

for (const arc of arcRows) {
  const arcChapters = chapters.filter((chapter) => chapter.arc_id === arc.arc_id);
  const arcPacing = arcChapters.map((chapter) => pacingBySequence.get(Number(chapter.sequence)));
  atlas.push(`## ${arc.arc_id} · ${arc.arc_name}`, "");
  atlas.push(`- **범위:** ${arc.start_sequence}~${arc.end_sequence}화, ${arc.episode_count}화`);
  atlas.push(`- **실제 등장인물:** ${arc.main_characters}`);
  atlas.push(`- **실제 장소:** ${arc.main_locations}`);
  atlas.push(`- **발단·전제:** ${arc.concrete_premise}`);
  atlas.push(`- **중앙 질문:** ${arc.central_question}`);
  atlas.push(`- **약속:** ${arc.promise}`);
  atlas.push(`- **압력 상승:** ${arc.pressure_escalation}`);
  atlas.push(`- **전환:** ${arc.mid_turn}`);
  atlas.push(`- **구체 보상:** ${arc.concrete_payoff}`);
  atlas.push(`- **관계·호칭 변화:** ${arc.relationship_change}`);
  atlas.push(`- **지위·능력 변화:** ${arc.status_or_ability_change}`);
  atlas.push(`- **남은 비용:** ${arc.residual_cost}`);
  atlas.push(`- **다음 훅:** ${arc.next_arc_bridge}`);
  atlas.push(`- **경계 근거:** ${arc.boundary_signals}`);
  atlas.push(`- **경계 확신도:** ${arc.confidence}`);
  atlas.push(
    `- **Arc 평균 페이싱:** 긴장 ${mean(arcPacing, "tension_1_10")} / 보상 ${mean(arcPacing, "reward_1_10")} / 훅 ${mean(arcPacing, "hook_1_10")}`,
    "",
  );
  atlas.push(
    "| 회차 | 부제 | 단계 | 구체 비트 | 지급 보상 | 종료 훅 | 긴장/보상/훅 | 정보·행동·관계·감정·물질 |",
    "| ---: | --- | --- | --- | --- | --- | ---: | ---: |",
  );
  for (const chapter of arcChapters) {
    const pacing = pacingBySequence.get(Number(chapter.sequence));
    atlas.push(
      `| ${chapter.sequence} | ${md(chapter.title || "(부제 없음)")} | ${md(pacing.arc_phase)} | ${md(pacing.concrete_event)} | ${md(chapter.paid_reward)} | ${md(chapter.ending_hook)} | ${pacing.tension_1_10}/${pacing.reward_1_10}/${pacing.hook_1_10} | ${pacing.information_weight}/${pacing.action_weight}/${pacing.relationship_weight}/${pacing.emotion_weight}/${pacing.material_or_status_weight} |`,
    );
  }
  atlas.push("");
}

atlas.push("## 초반·중반·후반 리듬 변화", "");
atlas.push(
  "- **1~51화:** 1~3화 단위의 빠른 증명과 즉시 보상이 많다. 성적·공매도·수능·경매·공채 같은 독립 시험을 통과할 때마다 돈, 서클, 아버지의 포옹·허락, 외할머니 밥상, 첫 동료와 새 호칭이 함께 쌓인다.",
  "- **52~123화:** 건설 현장부터 엔터·제약·에너지·자동차·전자까지 계열사 하나를 맡아 회생시키는 중형 Arc가 이어진다. 마법의 개인 사용이 제품·공장·조직으로 확대되고, 후계전은 비밀 공작에서 사장단·주주 앞 공개 승부로 바뀐다.",
  "- **124~200화:** 아버지의 죽음과 회장 상석 인수가 가족사의 중앙 경계를 만든 뒤, 우주·마탑·재해·국제 사업으로 결정권 반경이 급격히 커진다. 대신 코일·황연우 등 자기 사람의 몸을 되돌리는 장면이 거대 성과의 인간적 영수증 역할을 한다.",
  "- **201~271화:** 가상세계·곡물·자원·의료·천연가스와 국제 분쟁을 거쳐 기업의 힘이 국가·전쟁·기후 규모로 확장된다. 고강도 행동과 정책·자원 정보가 늘어나는 가운데 260~261화 옛 식탁과 갈비찜이 오래 비었던 가족 리듬을 복원한다.",
  "- **272~304화:** 전쟁 뒤 일상 복귀를 잠깐 지급한 다음 신세계·달·석유·강대국 경쟁을 9서클 문턱까지 밀어붙인다. 마지막에는 힘을 더 보여 주는 대신 주인공을 1년 비워, 그가 만든 조직에서 누가 약속을 지켰고 누가 이권을 챙겼는지 시험한다.",
  "",
);
atlas.push("## 결말 Arc의 수렴과 지급", "");
atlas.push(
  "303화의 세계 1위 부자와 9서클 자격은 외형적 최고점이지만 곧 드래곤 하트의 1년 강제 동면이라는 비용이 된다. 도겸이 사라지자 세운은 기존 제품으로 버틸 뿐 혁신과 공장 증축이 멈추고, 부패 사장들은 조민형을 후계자로 올려 이권을 나누려 한다. 반대로 황연우·김건웅·홍 사장과 남은 사장단은 자리를 지킨다.",
  "",
  "304화의 귀환은 단순 능력 공개가 아니다. 조민형 선출 투표장에 들어온 도겸이 드래곤 언어의 명령으로 부패를 스스로 자백하게 만들고 11명을 해임한다. 남은 사람들은 다시 일할 수 있다는 흥분을 느끼고, `세운의 심장이 돌아왔다`는 문장이 회귀 초반의 가족·그룹 복구 약속과 최강 마법사의 귀환을 동시에 닫는다. 새 9서클 제품 가능성은 완결 뒤에도 성장 방향이 남았음을 보여 준다.",
  "",
);
atlas.push("## 근거가 약하거나 경계가 겹치는 구간", "");
atlas.push(
  "- 101~107화는 101화의 기술·동료 보상, 102화의 `전면전(1)`, 103화 이후의 주주전을 하나의 인과로 합쳤다. 101화를 앞 Arc의 후일담으로도 볼 수 있으나 골렘차 선물이 매복 생존과 공개 후계전의 직접 원인이므로 통합했다.",
  "- 152~153화와 202~204화는 분담 파일 경계를 가로지르지만 목표·결산이 연속돼 각각 한 Arc로 병합했다. 201화는 같은 `메타버스(1)` 부제이지만 가고일 산불 결산·미 대통령 감사·서광수의 새 사업 제안이라는 별도 전환 Arc로 두었다. 부제 묶음보다 실제 목표와 결산을 우선한 사례다.",
  "- 원문은 100·101화 `기술이전(2)`, 116·117화 `이동통신사(2)`, 244·245화 `천연가스(2)`를 중복 표기한다. 26~32화는 부제가 없고 246화 표식에는 마침표가 없다. 이를 교정하지 않고 `visible_label`과 `title`에 원문대로 보존했다.",
);
for (const arc of arcRows.filter((row) => row.confidence !== "high")) {
  atlas.push(`- ${arc.arc_id} ${arc.start_sequence}~${arc.end_sequence}화: ${arc.boundary_signals} (확신도 ${arc.confidence})`);
}
atlas.push("");

fs.writeFileSync(path.join(outDir, "arc_atlas.md"), `${atlas.join("\n")}\n`);

console.log(
  JSON.stringify(
    {
      segments: segments.map(({ start, end }) => `${start}-${end}`),
      chapters: chapters.length,
      arcs: arcRows.length,
      pacing: pacingRows.length,
      mediumArcs: arcRows.filter((row) => row.confidence !== "high").map((row) => row.arc_id),
    },
    null,
    2,
  ),
);
