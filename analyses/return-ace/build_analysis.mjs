import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outputDir = dirname(fileURLToPath(import.meta.url));
const sourcePath = "/Users/a2501/Desktop/inkos/edge_repos/inkos_reverse_lab/private_sources/korean_webnovel_corpus/흑곰작가/리턴 에이스_흑곰작가_합본.txt";
const segmentPaths = [
  join(outputDir, "segment_001_103.md"),
  join(outputDir, "segment_104_207.md"),
  join(outputDir, "segment_208_310.md"),
];
const manualReviewPaths = [
  join(outputDir, "manual_review_001_103.md"),
  join(outputDir, "manual_review_104_207.md"),
  join(outputDir, "manual_review_208_310.md"),
];
const manualArcRevisionPath = join(outputDir, "manual_arc_revisions.md");

// Natural Arcs that cross a delegated reading boundary can be joined here
// after both sides have been checked against the source. Keys and values are
// the temporary ids in the segment notes.
const ARC_ALIASES = new Map([
  ["M001", "A020"], // 103→104화는 같은 보스턴 1차전의 타석·결산이다.
  ["L001", "M017"], // 207→208화는 같은 텍사스 ALDS 1차전의 초회 타석이다.
]);

const UNCERTAIN_RAW_ARCS = new Set([
  "L015", // 310화 한 표식 안에서 결혼·FA·2016년 컵스 우승까지 시간 점프한다.
]);

// Delegated reading boundaries fell inside two games. These overrides preserve
// one coherent natural-Arc description instead of concatenating two partial
// summaries written from opposite sides of the boundary.
const ARC_OVERRIDES = new Map([
  ["A020", {
    rawArcName: "웨이크필드 5안타와 보스턴 11연승 저지",
    fields: {
      "주요 인물": "윤주혁, 팀 웨이크필드, 제레미 헬릭슨, 에반 롱고리아, 자니 데이먼, 테리 프랑코나",
      "주요 장소/팀": "트로피카나 필드, 탬파베이 레이스, 보스턴 레드삭스",
      "구체 전제": "동부 1위 보스턴이 11연승으로 달아나는 가운데 윤주혁은 평생 약했던 팀 웨이크필드의 너클볼을 경기 중에 읽어 탬파의 추격을 다시 시작해야 한다.",
      "중심 질문": "윤주혁이 너클볼 약점을 현장에서 고치고 보스턴의 연승과 선두 분위기를 동시에 끊을 수 있는가.",
      "약속": "행운성 첫 안타에서 회전 판독 홈런, 5안타 경기로 발전하는 즉석 적응이 팀의 8대3 승리와 보스턴 11연승 저지로 이어진다.",
      "압력 상승": "웨이크필드의 불규칙한 너클볼, 데이비드 오티스의 선제 홈런, 무사 1·2루 좌완 교체와 보스턴의 1위 사수가 윤주혁의 매 타석을 압박한다.",
      "중간 전환": "3볼에서 미세하게 회전하는 너클볼을 밀어 시즌 29호 2점 홈런을 치며 탬파가 3대2로 역전한다.",
      "구체 결산": "윤주혁은 홈런 포함 데뷔 첫 5안타로 8대3 승리를 이끌어 보스턴의 11연승을 끝내고, 다음 경기 세 볼넷으로 체력을 아껴 3차전 선발을 준비한다.",
      "관계 변화": "자니 데이먼은 자기 지명타자 자리를 차지한 후배를 공개적으로 인정하고, 헬릭슨과 탬파 타선은 윤주혁이 바꾼 리드를 지켜 선두 추격의 공동 몫을 만든다.",
      "지위/능력/기록 변화": "윤주혁은 너클볼 약점을 실전에서 수정해 시즌 29홈런, 타율·출루율·장타율 1위와 홈런 2위까지 올라선다.",
      "잔여 비용": "30호 홈런과 보스턴 3연전 마무리, 다음 날 선발 투구가 남아 타격 보상을 투수 성과로 이어야 한다.",
      "다음 Arc 다리": "보스턴이 좌타자 여섯 명을 배치한 3차전에서 윤주혁은 시즌 30호 만루포와 구단 첫 노히터에 도전한다.",
      "경계 신호": "웨이크필드가 강판되고 보스턴의 11연승이 1차전 8대3 패배로 끝난다; 다음 지배 목표가 너클볼 타격에서 윤주혁의 3차전 선발·노히터와 30호 홈런으로 바뀐다",
    },
  }],
  ["M017", {
    rawArcName: "텍사스 홈 2연승과 에이스의 경고음",
    fields: {
      "주요 인물": "윤주혁, 에반 롱고리아, 필립 모리스, 카를로스 페냐, 데이비드 프라이스, 조 매든, 조쉬 해밀턴, 라이언 뎀스터",
      "주요 장소/팀": "트로피카나 필드, 탬파베이 레이스, 텍사스 레인저스, 2012 아메리칸리그 디비전시리즈",
      "구체 전제": "정규시즌 25승·386탈삼진을 끝낸 윤주혁과 탬파가 와일드카드 승자 텍사스를 홈에서 만나 2연속 월드시리즈 우승의 첫 관문을 연다.",
      "중심 질문": "윤주혁의 운영 피칭과 동료 타선, 2차전 대타 카드가 홈 두 경기를 모두 잡고 원정 종결 조건을 만들 수 있는가.",
      "약속": "1차전 0대0 투수전을 롱고리아의 홈런과 윤주혁 완봉으로, 2차전 열세를 페냐·윤주혁의 홈런으로 뒤집는다.",
      "압력 상승": "텍사스 타자들은 삼진을 피하며 윤주혁의 공을 외야로 보내고, 탬파 타선은 뎀스터에게 득점하지 못한다. 2차전에는 해밀턴이 프라이스에게 선제 홈런을 친다.",
      "중간 전환": "1차전 6회 롱고리아가 투런 홈런을 치자 윤주혁이 운영 피칭에서 탈삼진 피칭으로 전환해 9회까지 리드를 지킨다.",
      "구체 결산": "탬파는 1차전 2대0·윤주혁 9이닝 무실점 11탈삼진, 2차전 4대1로 홈 2연승을 얻는다. 윤주혁은 2차전 대타 솔로포까지 보탠다.",
      "관계 변화": "롱고리아·모리스·페냐가 윤주혁의 득점 부담을 나누고, 조 매든과 윤주혁은 대타 투입 시점을 말없이 공유할 만큼 운용 신뢰를 굳힌다.",
      "지위/능력/기록 변화": "윤주혁은 탈삼진 기록을 쫓던 정규시즌 투수에서 완급·주루·대타 홈런으로 시리즈 승리 조건을 만드는 포스트시즌 에이스로 전환한다.",
      "잔여 비용": "홈 2승 직후 왼쪽 무릎 통증이 강해져 3차전 결장과 다음 선발 등판 여부가 불확실해진다.",
      "다음 Arc 다리": "윤주혁이 빠진 탬파가 텍사스 원정 3차전에서 12대2로 무너지며 시리즈와 몸 상태가 함께 흔들린다.",
      "경계 신호": "홈 1·2차전 일정이 탬파의 두 승으로 끝난다; 시리즈 장소가 텍사스로 옮겨지고 윤주혁의 상태도 승리 보증수표에서 부상 의심 결장자로 바뀐다",
    },
  }],
]);

const CHAPTER_FIELDS = [
  "진입",
  "약속",
  "목표",
  "행동",
  "저항/비용",
  "전환",
  "보상",
  "상태 변화",
  "종료 훅",
  "닫힌 루프",
  "열린 루프",
  "후보 Arc",
];

const ARC_FIELDS = [
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

const MANUAL_REVIEW_FIELDS = [
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

function canonicalRawArc(rawId) {
  let current = rawId;
  const visited = new Set();
  while (ARC_ALIASES.has(current)) {
    if (visited.has(current)) throw new Error(`Arc alias cycle at ${current}`);
    visited.add(current);
    current = ARC_ALIASES.get(current);
  }
  return current;
}

function headingBlocks(markdown) {
  const headings = [...markdown.matchAll(/^#{2,3}\s+(.+?)\s*$/gm)];
  return headings.map((heading, index) => ({
    title: heading[1].trim(),
    body: markdown.slice(
      heading.index + heading[0].length,
      headings[index + 1]?.index ?? markdown.length,
    ),
  }));
}

function parseLabeledFields(body, expected) {
  const values = {};
  for (const line of body.split(/\r?\n/)) {
    const match = line.match(/^-\s+([^:]+):\s*(.*?)\s*$/);
    if (!match) continue;
    const key = match[1].trim();
    if (expected.includes(key)) values[key] = match[2].trim();
  }
  return values;
}

function parseSegment(path) {
  const markdown = readFileSync(path, "utf8");
  const chapters = [];
  const arcMetadata = [];
  for (const block of headingBlocks(markdown)) {
    const chapterMatch = block.title.match(/^(\d+)화$/);
    if (chapterMatch) {
      const sequence = Number(chapterMatch[1]);
      const fields = parseLabeledFields(block.body, CHAPTER_FIELDS);
      const missing = CHAPTER_FIELDS.filter((field) => !fields[field]);
      if (missing.length > 0) {
        throw new Error(`${path}: ${sequence}화 missing fields: ${missing.join(", ")}`);
      }
      const arcMatch = fields["후보 Arc"].match(/^([AML]\d{3})\s*·\s*(.+)$/);
      if (!arcMatch) {
        throw new Error(`${path}: ${sequence}화 has invalid 후보 Arc: ${fields["후보 Arc"]}`);
      }
      chapters.push({
        sequence,
        fields,
        rawArcId: canonicalRawArc(arcMatch[1]),
        rawArcName: arcMatch[2].trim(),
      });
      continue;
    }

    const arcMatch = block.title.match(/^([AML]\d{3})\s*·\s*(.+?)\s*\((\d+)\s*[~\-–]\s*(\d+)화\)$/);
    if (!arcMatch) continue;
    const fields = parseLabeledFields(block.body, ARC_FIELDS);
    const missing = ARC_FIELDS.filter((field) => !fields[field]);
    if (missing.length > 0) {
      throw new Error(`${path}: ${arcMatch[1]} missing Arc fields: ${missing.join(", ")}`);
    }
    arcMetadata.push({
      rawArcId: canonicalRawArc(arcMatch[1]),
      rawArcName: arcMatch[2].trim(),
      startSequence: Number(arcMatch[3]),
      endSequence: Number(arcMatch[4]),
      fields,
    });
  }
  return { chapters, arcMetadata };
}

function parseManualReview(path) {
  const markdown = readFileSync(path, "utf8");
  const reviews = [];
  for (const block of headingBlocks(markdown)) {
    const chapterMatch = block.title.match(/^(\d+)화$/);
    if (!chapterMatch) continue;
    const sequence = Number(chapterMatch[1]);
    const fields = parseLabeledFields(block.body, MANUAL_REVIEW_FIELDS);
    const missing = MANUAL_REVIEW_FIELDS.filter((field) => !fields[field]);
    if (missing.length > 0) {
      throw new Error(`${path}: ${sequence}화 missing manual fields: ${missing.join(", ")}`);
    }
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
      if (!Number.isInteger(value) || value < 1 || value > 10) {
        throw new Error(`${path}: ${sequence}화 invalid ${field}: ${fields[field]}`);
      }
    }
    reviews.push({ sequence, fields });
  }
  return reviews;
}

function parseManualArcRevisions(path) {
  const markdown = readFileSync(path, "utf8");
  const revisions = [];
  for (const block of headingBlocks(markdown)) {
    const arcMatch = block.title.match(/^([A-Z]\d{3})\s*·\s*(.+?)\s*\((\d+)\s*[~\-–]\s*(\d+)화\)$/);
    if (!arcMatch) continue;
    const fields = parseLabeledFields(block.body, ARC_FIELDS);
    const missing = ARC_FIELDS.filter((field) => !fields[field]);
    if (missing.length > 0) {
      throw new Error(`${path}: ${arcMatch[1]} missing Arc fields: ${missing.join(", ")}`);
    }
    revisions.push({
      rawArcId: arcMatch[1],
      rawArcName: arcMatch[2].trim(),
      startSequence: Number(arcMatch[3]),
      endSequence: Number(arcMatch[4]),
      fields,
    });
  }
  if (revisions.length === 0) throw new Error(`${path}: no manual Arc revisions found`);
  return revisions;
}

function parseSourceMarkers() {
  const source = readFileSync(sourcePath, "utf8");
  const split = source.split(/\r?\n/);
  const lineCount = source.endsWith("\n") ? split.length - 1 : split.length;
  const markers = [];
  for (let index = 0; index < lineCount; index += 1) {
    const marker = split[index].match(/^ⓚ리턴 에이스 (\d+)화\s*$/);
    if (marker) markers.push({ sequence: Number(marker[1]), marker: split[index], startLine: index + 1 });
  }
  return markers.map((marker, index) => ({
    ...marker,
    endLine: (markers[index + 1]?.startLine ?? lineCount + 1) - 1,
  }));
}

const parsed = segmentPaths.map(parseSegment);
const chapters = parsed.flatMap((segment) => segment.chapters).sort((a, b) => a.sequence - b.sequence);
const manualReviews = manualReviewPaths.flatMap(parseManualReview).sort((a, b) => a.sequence - b.sequence);
const manualArcRevisions = parseManualArcRevisions(manualArcRevisionPath);
const metadataEntries = [
  ...parsed.flatMap((segment) => segment.arcMetadata),
  ...manualArcRevisions,
];
const sourceMarkers = parseSourceMarkers();

if (chapters.length !== 310) throw new Error(`Expected 310 chapter notes, found ${chapters.length}`);
if (manualReviews.length !== 310) throw new Error(`Expected 310 manual reviews, found ${manualReviews.length}`);
if (sourceMarkers.length !== 310) throw new Error(`Expected 310 source markers, found ${sourceMarkers.length}`);
for (let sequence = 1; sequence <= 310; sequence += 1) {
  if (chapters[sequence - 1]?.sequence !== sequence) throw new Error(`Missing or duplicate chapter note at ${sequence}`);
  if (manualReviews[sequence - 1]?.sequence !== sequence) throw new Error(`Missing or duplicate manual review at ${sequence}`);
  if (sourceMarkers[sequence - 1]?.sequence !== sequence) throw new Error(`Missing or duplicate source marker at ${sequence}`);
}

const manualReviewBySequence = new Map(manualReviews.map((review) => [review.sequence, review]));
const revisedArcBySequence = new Map();
for (const revision of manualArcRevisions) {
  if (revision.startSequence > revision.endSequence) {
    throw new Error(`${revision.rawArcId} has a reversed manual range`);
  }
  if (splitSignals(revision.fields["경계 신호"]).length < 2) {
    throw new Error(`${revision.rawArcId} needs at least two manual boundary signals`);
  }
  for (let sequence = revision.startSequence; sequence <= revision.endSequence; sequence += 1) {
    if (revisedArcBySequence.has(sequence)) {
      throw new Error(`Manual Arc revisions overlap at ${sequence}화`);
    }
    revisedArcBySequence.set(sequence, revision.rawArcId);
  }
}
for (const chapter of chapters) {
  const revisedRawArcId = revisedArcBySequence.get(chapter.sequence);
  if (revisedRawArcId) chapter.rawArcId = revisedRawArcId;
  chapter.manual = manualReviewBySequence.get(chapter.sequence).fields;
}

const arcOrder = [...new Set(chapters.map((chapter) => chapter.rawArcId))];
const arcIdByRaw = new Map(arcOrder.map((raw, index) => [raw, `RA-${String(index + 1).padStart(3, "0")}`]));
const chaptersByRawArc = new Map();
for (const chapter of chapters) {
  const rows = chaptersByRawArc.get(chapter.rawArcId) ?? [];
  rows.push(chapter);
  chaptersByRawArc.set(chapter.rawArcId, rows);
  chapter.arcId = arcIdByRaw.get(chapter.rawArcId);
}

const metadataByRawArc = new Map();
for (const metadata of metadataEntries) {
  const existing = metadataByRawArc.get(metadata.rawArcId);
  if (!existing) {
    metadataByRawArc.set(metadata.rawArcId, metadata);
    continue;
  }
  metadataByRawArc.set(metadata.rawArcId, {
    ...existing,
    startSequence: Math.min(existing.startSequence, metadata.startSequence),
    endSequence: Math.max(existing.endSequence, metadata.endSequence),
    fields: Object.fromEntries(ARC_FIELDS.map((field) => [
      field,
      [existing.fields[field], metadata.fields[field]].filter(Boolean).join("; "),
    ])),
  });
}

const arcs = arcOrder.map((rawArcId, index) => {
  const rows = chaptersByRawArc.get(rawArcId);
  const metadata = metadataByRawArc.get(rawArcId);
  if (!rows?.length) throw new Error(`No chapters for ${rawArcId}`);
  const startSequence = rows[0].sequence;
  const endSequence = rows.at(-1).sequence;
  for (let sequence = startSequence; sequence <= endSequence; sequence += 1) {
    if (rows[sequence - startSequence]?.sequence !== sequence) {
      throw new Error(`Arc ${rawArcId} is not contiguous at chapter ${sequence}`);
    }
  }
  if (!metadata) {
    throw new Error(`Missing concrete Arc metadata for ${rawArcId}`);
  }
  if (metadata.startSequence !== startSequence || metadata.endSequence !== endSequence) {
    throw new Error(
      `${rawArcId} metadata range ${metadata.startSequence}-${metadata.endSequence} `
      + `does not match chapter map ${startSequence}-${endSequence}`,
    );
  }
  const override = ARC_OVERRIDES.get(rawArcId);
  const fields = override?.fields ?? metadata.fields;
  if (splitSignals(fields["경계 신호"]).length < 2) {
    throw new Error(`${rawArcId} needs at least two boundary signals`);
  }
  return {
    rawArcId,
    arcId: `RA-${String(index + 1).padStart(3, "0")}`,
    arcName: override?.rawArcName ?? metadata.rawArcName,
    startSequence,
    endSequence,
    rows,
    fields,
    confidence: UNCERTAIN_RAW_ARCS.has(rawArcId) ? "medium" : "high",
  };
});

function splitSignals(value) {
  return value.split(/;|\s+및\s+|\s*\/\s*/).map((item) => item.trim()).filter(Boolean);
}

function axisFor(text) {
  const axes = [];
  if (/부상|통증|수술|회복|체력|피로|어깨|무릎/.test(text)) axes.push("신체·가용성");
  if (/훈련|구종|체인지업|커브|슬라이더|투심|제구|구속|타격|수비|주루|기량/.test(text)) axes.push("능력·기량");
  if (/선발|불펜|로스터|보직|트레이드|입단|계약|연봉|FA|팀을 떠|합류/.test(text)) axes.push("팀·보직·커리어");
  if (/승|패|홈런|탈삼진|타율|방어율|기록|완봉|완투|노히터|퍼펙트/.test(text)) axes.push("경기·기록");
  if (/MVP|신인왕|사이영상|골드글러브|실버슬러거|우승|금메달|평가|인정/.test(text)) axes.push("지위·명예");
  if (/감독|코치|동료|친구|부모|한유라|믿|관계|작별|재회|고백|결혼/.test(text)) axes.push("관계");
  return [...new Set(axes)].join("·") || "목표·상황";
}

function compact(...values) {
  return values
    .map((value) => String(value ?? "").trim().replace(/[.!?。]+$/u, ""))
    .filter(Boolean)
    .join(" → ");
}

function shorten(value, max = 90) {
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
}

function csv(header, rows) {
  return `${header}\n${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

const arcById = new Map(arcs.map((arc) => [arc.arcId, arc]));
const markerBySequence = new Map(sourceMarkers.map((marker) => [marker.sequence, marker]));

const chapterMapHeader = "sequence,visible_label,title,start_line,end_line,entry_state,reader_promise,protagonist_goal,action,resistance_or_cost,turn_or_reveal,paid_reward,state_change_axis,state_change,ending_hook,closed_loops,opened_loops,arc_id,confidence";
const chapterMapRows = chapters.map((chapter) => {
  const marker = markerBySequence.get(chapter.sequence);
  const stateText = chapter.fields["상태 변화"];
  return [
    chapter.sequence,
    `${chapter.sequence}화`,
    marker.marker.slice(1),
    marker.startLine,
    marker.endLine,
    chapter.manual["진입 장면"],
    chapter.fields["약속"],
    chapter.fields["목표"],
    chapter.fields["행동"],
    chapter.fields["저항/비용"],
    chapter.fields["전환"],
    chapter.fields["보상"],
    axisFor(`${stateText} ${chapter.fields["보상"]}`),
    stateText,
    chapter.manual["종료 훅"],
    chapter.manual["닫힌 루프"],
    chapter.manual["열린 루프"],
    chapter.arcId,
    arcById.get(chapter.arcId).confidence,
  ];
});

const arcMapHeader = "arc_id,arc_name,start_sequence,end_sequence,start_label,end_label,episode_count,main_characters,main_locations,concrete_premise,central_question,promise,pressure_escalation,mid_turn,concrete_payoff,relationship_change,status_or_ability_change,residual_cost,next_arc_bridge,boundary_signals,confidence";
const arcMapRows = arcs.map((arc) => [
  arc.arcId,
  arc.arcName,
  arc.startSequence,
  arc.endSequence,
  `${arc.startSequence}화`,
  `${arc.endSequence}화`,
  arc.endSequence - arc.startSequence + 1,
  arc.fields["주요 인물"],
  arc.fields["주요 장소/팀"],
  arc.fields["구체 전제"],
  arc.fields["중심 질문"],
  arc.fields["약속"],
  arc.fields["압력 상승"],
  arc.fields["중간 전환"],
  arc.fields["구체 결산"],
  arc.fields["관계 변화"],
  arc.fields["지위/능력/기록 변화"],
  arc.fields["잔여 비용"],
  arc.fields["다음 Arc 다리"],
  arc.fields["경계 신호"],
  arc.confidence,
]);

const pacingBySequence = new Map();
const arcPacingHeader = "sequence,visible_label,arc_id,arc_phase,concrete_event,tension_1_10,reward_1_10,hook_1_10,information_weight,action_weight,relationship_weight,emotion_weight,material_or_status_weight,pacing_note";
const arcPacingRows = chapters.map((chapter) => {
  const manual = chapter.manual;
  const pacing = {
    tension: Number(manual["긴장"]),
    reward: Number(manual["보상 강도"]),
    hook: Number(manual["훅 강도"]),
    information: Number(manual["정보 리본"]),
    action: Number(manual["행동 리본"]),
    relationship: Number(manual["관계 리본"]),
    emotion: Number(manual["감정 리본"]),
    materialStatus: Number(manual["물질/지위 리본"]),
    phase: manual["Arc 단계"],
    note: `보상 범위=${manual["보상 범위"]}; ${manual["페이싱 근거"]}`,
  };
  pacingBySequence.set(chapter.sequence, pacing);
  return [
    chapter.sequence,
    `${chapter.sequence}화`,
    chapter.arcId,
    pacing.phase,
    compact(chapter.fields["행동"], chapter.fields["전환"], chapter.fields["보상"]),
    pacing.tension,
    pacing.reward,
    pacing.hook,
    pacing.information,
    pacing.action,
    pacing.relationship,
    pacing.emotion,
    pacing.materialStatus,
    pacing.note,
  ];
});

function mdCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function average(values) {
  return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1);
}

function renderAtlas() {
  const endingArc = arcs.at(-1);
  const lines = [
    "# 리턴 에이스 Arc Atlas",
    "",
    "## 작품 전체 독자 계약",
    "",
    "윤주혁은 명예의 전당 타자로 생을 마감한 뒤 2009년의 건강한 어깨로 돌아온다. 독자는 그가 한 타자, 한 경기에서 당장 답을 내는 모습을 보면서도 투수 정착, 투타 겸업, 시즌 기록, 팀 우승, 최고액 계약으로 이어지는 긴 결산을 함께 기다린다. 짧은 보상은 삼진·장타·선발 기회처럼 눈앞에서 끝나고, 같은 결과가 시즌 성적과 동료의 신뢰를 바꾸면서 다음 보상의 조건이 된다.",
    "",
    "회차 표식, 경기 결과, 기록, 등장인물, 소속 팀과 본문에 드러난 관계 변화는 관찰값으로 옮겼다. Arc 이름·경계·단계와 1~10 페이싱 수치는 그 관찰값을 바탕으로 한 분석 판단이다.",
    "",
    "여기서 Arc는 원문의 지배 목표·상대·결산·상태 변화가 함께 바뀌는 자연 단위다. 따라서 길이를 1~3화로 고정하지 않았다. InkOS에서 실제 원고를 만들 때는 이 자연 Arc를 1~3화 제작 Packet으로 나누되, 같은 상위 Arc ID와 누적 기록을 유지해야 한다.",
    "",
    "## 전체 Arc 목차",
    "",
    "| Arc | 사건형 이름 | 회차 | 길이 | 중심 결산 |",
    "| --- | --- | ---: | ---: | --- |",
    ...arcs.map((arc) => `| ${arc.arcId} | ${mdCell(arc.arcName)} | ${arc.startSequence}~${arc.endSequence}화 | ${arc.rows.length} | ${mdCell(shorten(arc.fields["구체 결산"], 88))} |`),
    "",
  ];

  for (const arc of arcs) {
    const paces = arc.rows.map((row) => pacingBySequence.get(row.sequence));
    lines.push(
      `## ${arc.arcId} · ${arc.arcName} (${arc.startSequence}~${arc.endSequence}화)`,
      "",
      `발단: ${arc.fields["구체 전제"]}`,
      "",
      `주요 무대: ${arc.fields["주요 장소/팀"]}`,
      "",
      `등장인물: ${arc.fields["주요 인물"]}`,
      "",
      `중심 질문: ${arc.fields["중심 질문"]}`,
      "",
      `독자 약속: ${arc.fields["약속"]}`,
      "",
      `압력 상승: ${arc.fields["압력 상승"]}`,
      "",
      `중간 전환: ${arc.fields["중간 전환"]}`,
      "",
      `결산: ${arc.fields["구체 결산"]}`,
      "",
      `관계 변화: ${arc.fields["관계 변화"]}`,
      "",
      `지위·능력·기록 변화: ${arc.fields["지위/능력/기록 변화"]}`,
      "",
      `잔여 비용: ${arc.fields["잔여 비용"]}`,
      "",
      `다음 Arc 다리: ${arc.fields["다음 Arc 다리"]}`,
      "",
      `경계 근거: ${arc.fields["경계 신호"]}`,
      "",
      "### 회차별 구체 비트와 종료 훅",
      "",
      "| 회차 | 실제 사건 비트 | 지급 보상 | 종료 훅 | 긴장 | 보상 | 훅 | 단계 |",
      "| ---: | --- | --- | --- | ---: | ---: | ---: | --- |",
      ...arc.rows.map((row) => {
        const pace = pacingBySequence.get(row.sequence);
        return `| ${row.sequence}화 | ${mdCell(compact(row.fields["행동"], row.fields["전환"]))} | ${mdCell(row.fields["보상"])} | ${mdCell(row.manual["종료 훅"])} | ${pace.tension} | ${pace.reward} | ${pace.hook} | ${pace.phase} |`;
      }),
      "",
      "### Arc 페이싱",
      "",
      `긴장: ${paces.map((pace) => pace.tension).join("-")} (평균 ${average(paces.map((pace) => pace.tension))})`,
      "",
      `보상: ${paces.map((pace) => pace.reward).join("-")} (평균 ${average(paces.map((pace) => pace.reward))})`,
      "",
      `훅: ${paces.map((pace) => pace.hook).join("-")} (평균 ${average(paces.map((pace) => pace.hook))})`,
      "",
    );
  }

  lines.push(
    "## 초반·중반·후반의 리듬 변화",
    "",
    "초반은 윤주혁의 한 구와 한 타석이 곧 생존 심사다. 윈터 리그, 스프링캠프, 개막 로스터와 보직 경쟁이 짧은 주기로 이어져 한 번의 삼진이나 장타가 다음 기회를 산다. 2010년 정규 시즌부터는 같은 경기 보상이 누적 성적과 신인왕 경쟁으로 겹치고, 포스트시즌 패배가 개인의 압도적 활약만으로 팀 우승을 만들 수 없다는 비용을 남긴다.",
    "",
    "중반은 구종 추가와 상대의 재분석, 투구 이닝·타격 출장·부상 위험을 함께 관리한다. 정규 시즌의 기록 도전은 포스트시즌 선발 순서와 동료 신뢰를 바꾸고, 월드시리즈 한 경기는 시즌 내내 쌓은 팀 관계를 결산한다. 탬파베이의 우승 뒤에도 저연봉과 트레이드 가능성이 남아 성취가 다음 커리어 압력으로 바뀐다.",
    "",
    "후반은 워싱턴, 텍사스, 시카고로 팀이 바뀔 때마다 같은 능력의 가치가 달라지는 과정을 보여준다. 개인 트리플 크라운과 팀의 포스트시즌 탈락이 한 시즌에 공존하고, 다음 시즌에는 감독과 동료가 윤주혁의 성적을 팀 우승으로 환전한다. 텍사스 우승, 한유라와의 결혼, 최고액 FA, 시카고의 108년 한 해소가 경기·관계·커리어 보상을 한꺼번에 닫는다.",
    "",
    "## 결말 Arc의 수렴과 지급",
    "",
    `마지막 Arc ${endingArc.arcId}은 ${endingArc.startSequence}~${endingArc.endSequence}화의 ${endingArc.arcName}이다. ${endingArc.fields["구체 결산"]} 마지막 310화는 텍사스 우승 뒤 FA 최고액과 결혼을 지급하고, 시카고 컵스의 108년 우승까지 압축한다. 회귀 첫날 품었던 투수 미련은 투타 겸업 전설로 닫히며, 윤주혁은 은퇴 이후의 공허 대신 조 매든과 동료들 곁에서 베이브 루스를 넘겠다는 다음 생애 목표를 얻는다.`,
    "",
    "## 근거가 약하거나 경계가 겹치는 구간",
    "",
    "회차 표식과 사건 순서는 1~310화가 연속한다. Arc 경계는 각 구간의 목표·상대·결산·상태 변화 가운데 두 가지 이상이 함께 바뀌는 지점을 택했다. 한 경기가 여러 화에 걸친 구간은 이닝 종료만으로 자르지 않았고, 경기 결산 뒤 시상·계약·이동이 이어지는 구간은 후속 상태 변화가 끝날 때까지 같은 Arc에 남겼다.",
    "",
    "310화 안에서는 2015년 텍사스 월드시리즈, 결혼과 FA, 2016년 시카고 우승이 빠르게 이어진다. 표식이 하나뿐이라 chapter_map에서는 한 회차로 보존했지만, 제작 단계에서는 ‘텍사스 결산’, ‘FA·결혼’, ‘시카고 108년’ 세 장면 묶음으로 나눠 감리하는 편이 안전하다. 이 구간은 회차 경계보다 내부 시간 점프가 더 크다.",
    "",
  );
  return lines.join("\n");
}

writeFileSync(join(outputDir, "chapter_map.csv"), csv(chapterMapHeader, chapterMapRows), "utf8");
writeFileSync(join(outputDir, "arc_map.csv"), csv(arcMapHeader, arcMapRows), "utf8");
writeFileSync(join(outputDir, "arc_pacing.csv"), csv(arcPacingHeader, arcPacingRows), "utf8");
writeFileSync(join(outputDir, "arc_atlas.md"), `${renderAtlas()}\n`, "utf8");

console.log(JSON.stringify({
  chapters: chapters.length,
  arcs: arcs.length,
  sourceMarkers: sourceMarkers.length,
  firstArc: arcs[0]?.arcId,
  lastArc: arcs.at(-1)?.arcId,
}, null, 2));
