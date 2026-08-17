import fs from 'node:fs';
import path from 'node:path';

const repoRoot = '/Users/a2501/Desktop/firefly_studio/edge_repos/firefly_reference_lab';
const analysisDir = path.join(repoRoot, 'analyses/trillion-salary-rookie');
const segmentDir = path.join(analysisDir, 'segments');
const sourcePath = path.join(repoRoot, 'private_sources/korean_webnovel_corpus/서오/연봉 1조 신입사원_서오_합본.txt');

const chapterHeader = 'sequence,visible_label,title,start_line,end_line,entry_state,reader_promise,protagonist_goal,action,resistance_or_cost,turn_or_reveal,paid_reward,state_change_axis,state_change,ending_hook,closed_loops,opened_loops,arc_id,confidence'.split(',');
const arcHeader = 'arc_id,arc_name,start_sequence,end_sequence,start_label,end_label,episode_count,main_characters,main_locations,concrete_premise,central_question,promise,pressure_escalation,mid_turn,concrete_payoff,relationship_change,status_or_ability_change,residual_cost,next_arc_bridge,boundary_signals,confidence'.split(',');
const pacingHeader = 'sequence,visible_label,arc_id,arc_phase,concrete_event,tension_1_10,reward_1_10,hook_1_10,information_weight,action_weight,relationship_weight,emotion_weight,material_or_status_weight,pacing_note'.split(',');

const segments = [
  { key: 'early', start: 1, end: 126 },
  { key: 'middle1', start: 127, end: 250 },
  { key: 'middle2', start: 251, end: 377 },
  { key: 'late', start: 378, end: 485 },
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
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
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.endsWith('\r') ? field.slice(0, -1) : field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error('CSV has an unclosed quoted field');
  if (field !== '' || row.length > 0) {
    row.push(field.endsWith('\r') ? field.slice(0, -1) : field);
    rows.push(row);
  }
  if (rows[0]?.[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/u, '');
  return rows.filter((candidate) => !(candidate.length === 1 && candidate[0] === ''));
}

function readObjects(file, expectedHeader) {
  if (!fs.existsSync(file)) throw new Error(`missing segment file: ${file}`);
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  if ((rows[0] ?? []).join(',') !== expectedHeader.join(',')) {
    throw new Error(`header mismatch: ${file}`);
  }
  if (rows.slice(1).some((row) => row.length !== expectedHeader.length)) {
    throw new Error(`column count mismatch: ${file}`);
  }
  return rows.slice(1).map((values) => Object.fromEntries(expectedHeader.map((key, index) => [key, values[index] ?? ''])));
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeObjects(file, header, objects) {
  const rows = [header, ...objects.map((object) => header.map((key) => object[key] ?? ''))];
  fs.writeFileSync(file, `\uFEFF${rows.map((row) => row.map(csvEscape).join(',')).join('\n')}\n`, 'utf8');
}

function assertSequences(rows, start, end, label) {
  if (rows.length !== end - start + 1) throw new Error(`${label}: ${rows.length} rows, expected ${end - start + 1}`);
  rows.forEach((row, index) => {
    const expected = start + index;
    if (Number(row.sequence) !== expected) throw new Error(`${label}: sequence ${row.sequence}, expected ${expected}`);
  });
}

const sourceLines = fs.readFileSync(sourcePath, 'utf8').split(/\r?\n/u);
const markers = [];
sourceLines.forEach((line, index) => {
  const match = line.match(/^ⓚ(\d+)화\.\s*(.+)$/u);
  if (match) markers.push({ sequence: markers.length + 1, label: match[1], title: match[2].trim(), startLine: index + 1 });
});
if (markers.length !== 485) throw new Error(`source marker count ${markers.length} != 485`);
markers.forEach((marker, index) => {
  marker.endLine = (markers[index + 1]?.startLine ?? sourceLines.length + 1) - 1;
});

const allChapters = [];
const allPacing = [];
const localArcs = [];

for (const segment of segments) {
  const chapters = readObjects(path.join(segmentDir, `${segment.key}_chapters.csv`), chapterHeader);
  const pacing = readObjects(path.join(segmentDir, `${segment.key}_pacing.csv`), pacingHeader);
  const arcs = readObjects(path.join(segmentDir, `${segment.key}_arcs.csv`), arcHeader);
  assertSequences(chapters, segment.start, segment.end, `${segment.key}_chapters`);
  assertSequences(pacing, segment.start, segment.end, `${segment.key}_pacing`);
  if (!arcs.length) throw new Error(`${segment.key}_arcs is empty`);

  const localArcIds = new Set(arcs.map((arc) => arc.arc_id));
  if (localArcIds.size !== arcs.length) throw new Error(`${segment.key}_arcs has duplicate arc ids`);
  for (const row of [...chapters, ...pacing]) {
    if (!localArcIds.has(row.arc_id)) throw new Error(`${segment.key}: unknown local arc ${row.arc_id} at seq ${row.sequence}`);
  }

  for (const chapter of chapters) allChapters.push({ ...chapter, _segment: segment.key, _localArc: chapter.arc_id });
  for (const row of pacing) allPacing.push({ ...row, _segment: segment.key, _localArc: row.arc_id });
  for (const arc of arcs) localArcs.push({ ...arc, _segment: segment.key, _localArc: arc.arc_id });
}

allChapters.sort((left, right) => Number(left.sequence) - Number(right.sequence));
allPacing.sort((left, right) => Number(left.sequence) - Number(right.sequence));
localArcs.sort((left, right) => Number(left.start_sequence) - Number(right.start_sequence));
assertSequences(allChapters, 1, 485, 'all chapters');
assertSequences(allPacing, 1, 485, 'all pacing');

let expectedArcStart = 1;
const globalArcId = new Map();
for (let index = 0; index < localArcs.length; index += 1) {
  const arc = localArcs[index];
  const start = Number(arc.start_sequence);
  const end = Number(arc.end_sequence);
  if (start !== expectedArcStart) throw new Error(`arc gap/overlap at ${arc._segment}:${arc._localArc}; got ${start}, expected ${expectedArcStart}`);
  if (!Number.isInteger(end) || end < start) throw new Error(`bad arc end at ${arc._segment}:${arc._localArc}`);
  if (Number(arc.episode_count) !== end - start + 1) throw new Error(`episode count mismatch at ${arc._segment}:${arc._localArc}`);
  const id = `A${String(index + 1).padStart(3, '0')}`;
  globalArcId.set(`${arc._segment}:${arc._localArc}`, id);
  arc.arc_id = id;
  arc.start_label = markers[start - 1].label;
  arc.end_label = markers[end - 1].label;
  expectedArcStart = end + 1;
}
if (expectedArcStart !== 486) throw new Error(`arc coverage ends at ${expectedArcStart - 1}`);

for (const chapter of allChapters) {
  const sequence = Number(chapter.sequence);
  const marker = markers[sequence - 1];
  chapter.visible_label = marker.label;
  chapter.title = marker.title;
  chapter.start_line = String(marker.startLine);
  chapter.end_line = String(marker.endLine);
  chapter.arc_id = globalArcId.get(`${chapter._segment}:${chapter._localArc}`);
  if (!chapter.arc_id) throw new Error(`chapter ${sequence} lacks global arc id`);
  delete chapter._segment;
  delete chapter._localArc;
}

for (const row of allPacing) {
  const sequence = Number(row.sequence);
  row.visible_label = markers[sequence - 1].label;
  row.arc_id = globalArcId.get(`${row._segment}:${row._localArc}`);
  if (!row.arc_id) throw new Error(`pacing ${sequence} lacks global arc id`);
  delete row._segment;
  delete row._localArc;
}

for (const arc of localArcs) {
  delete arc._segment;
  delete arc._localArc;
}

writeObjects(path.join(analysisDir, 'chapter_map.csv'), chapterHeader, allChapters);
writeObjects(path.join(analysisDir, 'arc_pacing.csv'), pacingHeader, allPacing);
writeObjects(path.join(analysisDir, 'arc_map.csv'), arcHeader, localArcs);

function mdCell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

const chapterBySequence = new Map(allChapters.map((row) => [Number(row.sequence), row]));
const pacingBySequence = new Map(allPacing.map((row) => [Number(row.sequence), row]));
const atlas = [];
atlas.push('# 『연봉 1조 신입사원』 Arc Atlas', '');
atlas.push('## 작품 전체 독자 계약', '');
atlas.push('고졸 신입 이정후가 구조의 화음과 불협화음을 실제 도면·제품·계약·투자·조직 실행으로 번역해 능력을 증명하고, 그 성과를 동료의 보상과 자신의 직함·지분·산업 지배력으로 키운다. 매 Arc는 “알고 있었다”가 아니라 누가 무엇을 만들고, 누가 반대했으며, 어떤 계약·입금·수율·판매량·호칭이 남았는지를 사건 영수증으로 닫는다.', '');
atlas.push('내부 순번은 원문 파일 순서 1~485를 따른다. 표시 번호 251~261, 315~316, 417~420은 원문에 없으며 보간하지 않는다. 마지막 502화는 완결이 아니라 타사 백신 접종 이상 반응이 열린 미결 종점이다.', '');
atlas.push('## 전체 Arc 목차', '');
for (const arc of localArcs) {
  atlas.push(`- ${arc.arc_id} **${arc.arc_name}** — seq ${arc.start_sequence}~${arc.end_sequence} / ⓚ${arc.start_label}화~ⓚ${arc.end_label}화 / ${arc.episode_count}회`);
}
atlas.push('', '## Arc별 전수 구조와 회차 비트', '');

for (const arc of localArcs) {
  atlas.push(`### ${arc.arc_id}. ${arc.arc_name}`, '');
  atlas.push(`- 범위: sequence ${arc.start_sequence}~${arc.end_sequence}; 표시 ⓚ${arc.start_label}화~ⓚ${arc.end_label}화; ${arc.episode_count}회`);
  atlas.push(`- 주요 인물: ${arc.main_characters}`);
  atlas.push(`- 주요 장소: ${arc.main_locations}`);
  atlas.push(`- 구체 전제: ${arc.concrete_premise}`);
  atlas.push(`- 중심 질문: ${arc.central_question}`);
  atlas.push(`- 독자 약속: ${arc.promise}`);
  atlas.push(`- 압박 확대: ${arc.pressure_escalation}`);
  atlas.push(`- 중간 전환: ${arc.mid_turn}`);
  atlas.push(`- 구체 보상: ${arc.concrete_payoff}`);
  atlas.push(`- 관계 변화: ${arc.relationship_change}`);
  atlas.push(`- 지위·능력 변화: ${arc.status_or_ability_change}`);
  atlas.push(`- 잔여 비용: ${arc.residual_cost}`);
  atlas.push(`- 다음 다리: ${arc.next_arc_bridge}`);
  atlas.push(`- 경계 근거: ${arc.boundary_signals}; 신뢰도 ${arc.confidence}`, '');
  atlas.push('| seq / 표식 | 회차 제목 | Arc 단계 | 구체 사건과 지급 | 긴장 | 보상 | 훅 | 종료 훅 |');
  atlas.push('|---:|---|---|---|---:|---:|---:|---|');
  for (let sequence = Number(arc.start_sequence); sequence <= Number(arc.end_sequence); sequence += 1) {
    const chapter = chapterBySequence.get(sequence);
    const pacing = pacingBySequence.get(sequence);
    atlas.push(`| ${sequence} / ⓚ${chapter.visible_label}화 | ${mdCell(chapter.title)} | ${mdCell(pacing.arc_phase)} | ${mdCell(pacing.concrete_event)} | ${pacing.tension_1_10} | ${pacing.reward_1_10} | ${pacing.hook_1_10} | ${mdCell(chapter.ending_hook)} |`);
  }
  const arcPacing = [];
  for (let sequence = Number(arc.start_sequence); sequence <= Number(arc.end_sequence); sequence += 1) {
    const pacing = pacingBySequence.get(sequence);
    arcPacing.push(`seq ${sequence} ${pacing.arc_phase}: 긴장 ${pacing.tension_1_10}, 보상 ${pacing.reward_1_10}, 훅 ${pacing.hook_1_10}`);
  }
  atlas.push('', `- 페이싱 궤적: ${arcPacing.join(' → ')}`, '');
}

atlas.push('## 초반·중반·후반 리듬 변화', '');
atlas.push('초반은 사무실에서 도면·시제품·특허를 만들고 선배·상사가 검토한 뒤 계좌 입금과 직함으로 닫는 짧은 증명 주기가 중심이다. 컴덱스와 닷컴 공매도부터 계약 상대와 금액이 커지지만, 넥핀 원년 동료의 공동 투자와 강동주의 승인 장면이 숫자를 생활·조직 보상으로 번역한다.', '');
atlas.push('중반은 한 회사의 발명보다 여러 조직을 연결하는 시간이 길어진다. 카드·은행·반도체·배터리·건설·스마트폰·금융위기·에너지·해운이 겹치면서 설명과 준비가 늘고, 5화 안에서 중간 반전과 계약 결산이 더 강해진다. 수익은 다음 인수나 데이터·생산권으로 재투자되어 보상과 다음 압박이 같은 회차에 겹친다.', '');
atlas.push('후반은 국가와 산업이 협상 상대가 된다. 전쟁·브렉시트·무역 분쟁·팬데믹의 위험 신호가 여러 계열사에서 동시에 실행되므로 긴장 최고점이 자주 나오고, 공장·항구·병원 현장 장면이 회의·보고의 추상도를 낮춘다. 마지막에는 백신과 공급망 주도권을 얻은 직후 타사 백신 이상 반응이 열려, 승리의 여진이 책임의 새 압박으로 바뀐다.', '');
atlas.push('## 결말 Arc의 수렴과 지급 판정', '');
atlas.push('수록본의 마지막 두 Arc는 팬데믹으로 얻은 백신·반도체·해운 주도권을 미국 선거와 공급망 재편으로 연결한다. 일본 자동차 기업은 생산계획서와 10년 계약을 수락하고, 바이든 캠프는 반도체·해운·바이오 협력과 공장 이전 비강요를 제안한다. 이는 신입사원 때의 능력 증명이 세계 정책 협상권으로 확대된 지급이다.', '');
atlas.push('그러나 마지막 502화는 트럼프가 충분한 검증 없이 다른 백신의 긴급승인을 밀어붙이고 접종자 이상 반응이 발생한 지점에서 끊긴다. 따라서 백신 경쟁의 승자, 이상 반응의 인과, 미국 선거와 타이거펀드의 최종 지위는 닫히지 않았다. 이 Atlas는 수록본 종점을 완결로 올려 적지 않는다.', '');
atlas.push('## 근거가 약하거나 경계가 겹치는 구간', '');
atlas.push('- sequence 251은 표시 262화 `혁신과 안주 (2)`부터 시작한다. 같은 제목의 1화와 표시 251~261은 파일에 없으므로 앞부분의 발단을 추정하지 않았다. 해당 Arc의 진입 상태는 첫 실제 장면에서 확인되는 상태만 썼다.');
atlas.push('- sequence 304는 표시 317화 `순응하다 (2)`부터 시작한다. 표시 315~316의 사건은 보간하지 않았다.');
atlas.push('- sequence 403의 `위험 신호 (1)` 뒤에는 표시 417~420이 없고 sequence 404가 `원만한 합의 (1)`로 바뀐다. MERS 구간의 누락 결산과 중국 시장 구간의 연결은 각각 실제 남은 회차만 기록했다.');
atlas.push('- 제목 묶음은 강한 경계 신호지만 유일한 기준은 아니다. 이번 지도는 제목 전환에 더해 주 상대·장소 변화, 계약 결산, 자산·직함의 비가역 변화 중 최소 두 신호가 맞는 곳에서 Arc를 확정했다.');
atlas.push('- 마지막 `재편`은 2화만 수록되어 사건이 닫히지 않는다. 이후 회차나 최종 결말은 분석자가 만들지 않았다.', '');

fs.writeFileSync(path.join(analysisDir, 'arc_atlas.md'), `${atlas.join('\n')}\n`, 'utf8');

console.log(JSON.stringify({
  chapters: allChapters.length,
  pacing: allPacing.length,
  arcs: localArcs.length,
  firstArc: localArcs[0]?.arc_id,
  lastArc: localArcs.at(-1)?.arc_id,
  atlasBytes: fs.statSync(path.join(analysisDir, 'arc_atlas.md')).size,
}, null, 2));
