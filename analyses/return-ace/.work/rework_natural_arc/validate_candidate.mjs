import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const candidateDir = dirname(fileURLToPath(import.meta.url));
const analysisRoot = resolve(candidateDir, "../..");
const sourcePath = "/Users/a2501/Desktop/firefly_studio/edge_repos/firefly_reference_lab/private_sources/korean_webnovel_corpus/흑곰작가/리턴 에이스_흑곰작가_합본.txt";
const expectedSourceHash = "d1dd84aebe77ece8f17e4b4448b739c3106931ccec5f2008933b385b74b8ba45";
const expectedChapters = 310;
const expectedArcs = 55;

const rootHashes = {
  "project_bible.md": "b5b372e7a27e448a907e1ba87a10e8e0c483a801e1145e04dcc36715d1d49a77",
  "chapter_map.csv": "6aa4eccedc4d0f6e53839ed5aed7799b0015541ceb6ce7aa29d271ad3f6d2d46",
  "arc_map.csv": "24dd3d74babedf2822d1fb12a8f77a1907952869fbc0f822ba9a4680eb109074",
  "arc_pacing.csv": "60c82ecf58c77aab48692808975c7c9be1d6b4260489a8f42b58d0820fe9a0a2",
  "arc_atlas.md": "c3b35d92e3ec24bf5af2ad779991d33b38c923c93698f6071a1834719e0aea93",
  "completion_receipt.md": "3aba4c553a34a0164271067f8ec2244abeaccc999f4cbff97cd136803f7d8d6c",
};

const headers = {
  chapter_map: "sequence,visible_label,title,start_line,end_line,entry_state,reader_promise,protagonist_goal,action,resistance_or_cost,turn_or_reveal,paid_reward,state_change_axis,state_change,ending_hook,closed_loops,opened_loops,arc_id,confidence",
  manual_chapter_fact_authority: "sequence,visible_label,title,start_line,end_line,entry_state,reader_promise,protagonist_goal,action,resistance_or_cost,turn_or_reveal,paid_reward,state_change_axis,state_change,ending_hook,closed_loops,opened_loops,arc_id,confidence",
  arc_map: "arc_id,arc_name,start_sequence,end_sequence,start_label,end_label,episode_count,main_characters,main_locations,concrete_premise,central_question,promise,pressure_escalation,mid_turn,concrete_payoff,relationship_change,status_or_ability_change,residual_cost,next_arc_bridge,boundary_signals,confidence",
  arc_pacing: "sequence,visible_label,arc_id,arc_phase,concrete_event,tension_1_10,reward_1_10,hook_1_10,information_weight,action_weight,relationship_weight,emotion_weight,material_or_status_weight,pacing_note",
  arc_boundary_authority: "arc_id,start_sequence,end_sequence,arc_name,metadata_source,confidence",
};

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

const manualReviewPaths = [
  "manual_review_001_025.md",
  "manual_review_026_103.md",
  "manual_review_104_207.md",
  "manual_review_208_310.md",
].map((file) => join(candidateDir, file));

const errors = [];
const warnings = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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
      } else if (char === '"') quoted = false;
      else cell += char;
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
    } else cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function readCsv(name) {
  const path = join(candidateDir, `${name}.csv`);
  if (!existsSync(path)) {
    errors.push(`missing ${name}.csv`);
    return [];
  }
  const rows = parseCsv(readFileSync(path, "utf8"));
  const expected = headers[name].split(",");
  check(rows[0]?.join(",") === headers[name], `${name}.csv header mismatch`);
  const body = rows.slice(1).map((values, index) => {
    check(values.length === expected.length, `${name}.csv row ${index + 2} has ${values.length}/${expected.length} cells`);
    return Object.fromEntries(expected.map((key, column) => [key, values[column] ?? ""]));
  });
  return body;
}

function headingBlocks(markdown) {
  const matches = [...markdown.matchAll(/^##\s+(.+?)\s*$/gm)];
  return matches.map((match, index) => ({
    title: match[1].trim(),
    body: markdown.slice(match.index + match[0].length, matches[index + 1]?.index ?? markdown.length),
  }));
}

function parseLabeledFields(body, expected) {
  const fields = {};
  for (const line of body.split(/\r?\n/)) {
    const match = line.match(/^-\s+([^:]+):\s*(.*?)\s*$/);
    if (!match) continue;
    const key = match[1].trim();
    if (expected.includes(key)) fields[key] = match[2].trim();
  }
  return fields;
}

function parseManualReviews(path) {
  const reviews = [];
  for (const block of headingBlocks(readFileSync(path, "utf8"))) {
    const match = block.title.match(/^(\d+)화$/);
    if (!match) continue;
    const fields = parseLabeledFields(block.body, manualReviewFields);
    const sequence = Number(match[1]);
    const missing = manualReviewFields.filter((field) => !fields[field]);
    check(missing.length === 0, `${path}: ${sequence}화 missing ${missing.join(", ")}`);
    reviews.push({ sequence, fields });
  }
  return reviews;
}

function average(values) {
  return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1);
}

function mdCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function maximumRun(rows, fingerprint) {
  let maximum = 0;
  let current = 0;
  let previous;
  for (const row of rows) {
    const value = fingerprint(row);
    if (value === previous) current += 1;
    else {
      previous = value;
      current = 1;
    }
    maximum = Math.max(maximum, current);
  }
  return maximum;
}

const sourceBuffer = readFileSync(sourcePath);
const sourceText = sourceBuffer.toString("utf8");
check(sha256(sourceBuffer) === expectedSourceHash, "source SHA-256 mismatch");
const sourceLines = sourceText.split(/\r?\n/);
const sourceLineCount = sourceText.endsWith("\n") ? sourceLines.length - 1 : sourceLines.length;
const sourceMarkers = [];
for (let index = 0; index < sourceLineCount; index += 1) {
  const match = sourceLines[index].match(/^ⓚ리턴 에이스 (\d+)화\s*$/);
  if (match) sourceMarkers.push({ sequence: Number(match[1]), startLine: index + 1 });
}
for (let index = 0; index < sourceMarkers.length; index += 1) {
  sourceMarkers[index].endLine = (sourceMarkers[index + 1]?.startLine ?? sourceLineCount + 1) - 1;
}
check(sourceMarkers.length === expectedChapters, `source marker count ${sourceMarkers.length}`);
for (let index = 0; index < sourceMarkers.length; index += 1) check(sourceMarkers[index].sequence === index + 1, `source marker sequence breaks at ${index + 1}`);

for (const [file, expectedHash] of Object.entries(rootHashes)) {
  const path = join(analysisRoot, file);
  check(existsSync(path), `root canonical missing ${file}`);
  if (existsSync(path)) check(sha256(readFileSync(path)) === expectedHash, `root canonical changed ${file}`);
}

for (const [file, minimum] of [
  ["project_bible.md", 8_000],
  ["arc_atlas.md", 15_000],
  ["completion_receipt.md", 800],
  ["manual_chapter_fact_audit.md", 5_000],
  ["inkos_usage_and_gap_report.md", 6_000],
  ["free_improvements_report.md", 4_000],
]) {
  const path = join(candidateDir, file);
  check(existsSync(path), `candidate missing ${file}`);
  if (existsSync(path)) check(statSync(path).size >= minimum, `${file} below minimum size ${minimum}`);
}
check(sha256(readFileSync(join(candidateDir, "project_bible.md"))) === rootHashes["project_bible.md"], "candidate project_bible is not preserved exactly");

const reviews = manualReviewPaths.flatMap(parseManualReviews).sort((left, right) => left.sequence - right.sequence);
check(reviews.length === expectedChapters, `manual reviews ${reviews.length}/${expectedChapters}`);
for (let index = 0; index < reviews.length; index += 1) check(reviews[index].sequence === index + 1, `manual review sequence breaks at ${index + 1}`);
const reviewBySequence = new Map(reviews.map((review) => [review.sequence, review.fields]));

const chapters = readCsv("chapter_map");
const chapterFactAuthority = readCsv("manual_chapter_fact_authority");
const arcs = readCsv("arc_map");
const pacing = readCsv("arc_pacing");
const boundary = readCsv("arc_boundary_authority");
check(chapters.length === expectedChapters, `chapter rows ${chapters.length}`);
check(chapterFactAuthority.length === expectedChapters, `manual chapter fact authority rows ${chapterFactAuthority.length}`);
check(pacing.length === expectedChapters, `pacing rows ${pacing.length}`);
check(arcs.length === expectedArcs, `Arc rows ${arcs.length}`);
check(boundary.length === expectedArcs, `boundary authority rows ${boundary.length}`);

const chapterBySequence = new Map();
for (let index = 0; index < chapters.length; index += 1) {
  const row = chapters[index];
  const authority = chapterFactAuthority[index];
  const marker = sourceMarkers[index];
  const sequence = index + 1;
  const manual = reviewBySequence.get(sequence);
  check(Number(row.sequence) === sequence, `chapter sequence breaks at ${sequence}`);
  check(row.visible_label === `${sequence}화`, `chapter visible label differs at ${sequence}`);
  check(Number(authority?.sequence) === sequence, `manual chapter fact authority sequence breaks at ${sequence}`);
  check(Number(authority?.start_line) === marker?.startLine, `manual chapter fact authority start line differs at ${sequence}`);
  check(Number(authority?.end_line) === marker?.endLine, `manual chapter fact authority end line differs at ${sequence}`);
  check(row.start_line === authority?.start_line && row.end_line === authority?.end_line, `chapter ${sequence} source range differs from manual authority`);
  for (const field of chapterFactFields) {
    check((authority?.[field] ?? "").trim().length > 0, `manual chapter fact authority ${sequence} empty ${field}`);
    check(row[field] === authority?.[field], `chapter ${sequence} ${field} differs from manual authority`);
  }
  if (manual) {
    check(row.entry_state === manual["진입 장면"], `chapter ${sequence} entry differs from manual`);
    check(row.ending_hook === manual["종료 훅"], `chapter ${sequence} ending hook differs from manual`);
    check(row.closed_loops === manual["닫힌 루프"], `chapter ${sequence} closed loops differ from manual`);
    check(row.opened_loops === manual["열린 루프"], `chapter ${sequence} opened loops differ from manual`);
  }
  for (const field of [
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
  ]) check(row[field].trim().length > 0, `chapter ${sequence} empty ${field}`);
  chapterBySequence.set(sequence, row);
}

let expectedStart = 1;
const knownArcIds = new Set();
for (let index = 0; index < arcs.length; index += 1) {
  const row = arcs[index];
  const authority = boundary[index];
  const expectedId = `RA-${String(index + 1).padStart(3, "0")}`;
  const start = Number(row.start_sequence);
  const end = Number(row.end_sequence);
  check(row.arc_id === expectedId, `Arc id differs at ${expectedId}`);
  check(row.arc_id === authority.arc_id, `${expectedId} authority id differs`);
  check(row.arc_name === authority.arc_name, `${expectedId} authority name differs`);
  check(row.start_sequence === authority.start_sequence && row.end_sequence === authority.end_sequence, `${expectedId} authority range differs`);
  check(row.confidence === authority.confidence, `${expectedId} authority confidence differs`);
  check(start === expectedStart, `${expectedId} starts ${start}, expected ${expectedStart}`);
  check(end >= start, `${expectedId} reversed range`);
  check(Number(row.episode_count) === end - start + 1, `${expectedId} episode count differs`);
  check(row.boundary_signals.split(";").filter((part) => part.trim()).length >= 2, `${expectedId} has fewer than two boundary signals`);
  for (const field of [
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
  ]) check(row[field].trim().length > 0, `${expectedId} empty ${field}`);
  knownArcIds.add(row.arc_id);
  expectedStart = end + 1;
}
check(expectedStart === expectedChapters + 1, `Arc coverage ends at ${expectedStart - 1}`);
const ra025 = arcs.find((row) => row.arc_id === "RA-025");
const ra025Authority = boundary.find((row) => row.arc_id === "RA-025");
check(ra025Authority?.metadata_source === "manual:RA-025", "RA-025 does not use corrected manual metadata");
check(ra025?.concrete_payoff.includes("10탈삼진"), "RA-025 payoff does not contain corrected 10 strikeouts");
check(!ra025?.concrete_payoff.includes("12탈삼진"), "RA-025 payoff retains incorrect 12 strikeouts");

const expectedArcBySequence = new Map();
for (const arc of arcs) {
  for (let sequence = Number(arc.start_sequence); sequence <= Number(arc.end_sequence); sequence += 1) {
    check(!expectedArcBySequence.has(sequence), `Arc overlap at ${sequence}`);
    expectedArcBySequence.set(sequence, arc.arc_id);
  }
}

for (let index = 0; index < pacing.length; index += 1) {
  const row = pacing[index];
  const sequence = index + 1;
  const manual = reviewBySequence.get(sequence);
  check(Number(row.sequence) === sequence, `pacing sequence breaks at ${sequence}`);
  check(row.arc_id === expectedArcBySequence.get(sequence), `pacing Arc differs at ${sequence}`);
  check(chapterBySequence.get(sequence)?.arc_id === row.arc_id, `chapter/pacing Arc differs at ${sequence}`);
  check(knownArcIds.has(row.arc_id), `pacing unknown Arc at ${sequence}`);
  if (!manual) continue;
  const expectedValues = {
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
  for (const [field, expected] of Object.entries(expectedValues)) check(row[field] === expected, `pacing ${sequence} ${field} differs from manual`);
  for (const field of [
    "tension_1_10",
    "reward_1_10",
    "hook_1_10",
    "information_weight",
    "action_weight",
    "relationship_weight",
    "emotion_weight",
    "material_or_status_weight",
  ]) {
    const value = Number(row[field]);
    check(Number.isInteger(value) && value >= 1 && value <= 10, `pacing ${sequence} invalid ${field}`);
  }
}

const uniqueNotes = new Set(pacing.map((row) => row.pacing_note));
const uniqueEvents = new Set(pacing.map((row) => row.concrete_event));
const uniquePhases = new Set(pacing.map((row) => row.arc_phase));
check(uniqueNotes.size === expectedChapters, `only ${uniqueNotes.size} unique pacing notes`);
check(uniqueEvents.size === expectedChapters, `only ${uniqueEvents.size} unique concrete events`);
check(uniquePhases.size >= 280, `only ${uniquePhases.size} unique manual phases`);

const tripleRun = maximumRun(pacing, (row) => `${row.tension_1_10}/${row.reward_1_10}/${row.hook_1_10}`);
const ribbonRun = maximumRun(pacing, (row) => [
  row.information_weight,
  row.action_weight,
  row.relationship_weight,
  row.emotion_weight,
  row.material_or_status_weight,
].join("/"));
const phaseRun = maximumRun(pacing, (row) => row.arc_phase);
check(tripleRun <= 4, `identical score triple run is ${tripleRun}`);
check(ribbonRun <= 3, `identical ribbon vector run is ${ribbonRun}`);
check(phaseRun <= 2, `identical phase run is ${phaseRun}`);

const fixed = Object.fromEntries([56, 107, 296, 310].map((sequence) => [sequence, {
  chapter: chapterBySequence.get(sequence),
  pacing: pacing[sequence - 1],
}]));
check(fixed[56].chapter.ending_hook.includes("조 매든") && fixed[56].chapter.ending_hook.includes("말"), "56화 ending receipt missing pregame Maddon speech point");
check(fixed[107].pacing.reward_1_10 === "9", "107화 reward is not 9");
check(fixed[107].chapter.ending_hook.includes("무사 만루") && fixed[107].chapter.ending_hook.includes("9회"), "107화 ending receipt missing eight-inning no-hit choice");
check(!fixed[107].chapter.closed_loops.includes("노히터를 완성"), "107화 closes the no-hitter too early");
check(fixed[296].chapter.ending_hook.includes("입맞춤") && fixed[296].chapter.ending_hook.includes("온기"), "296화 ending receipt differs from night drive");
check(!fixed[296].chapter.ending_hook.includes("트레이드"), "296화 advances the trade early");
check(fixed[310].pacing.hook_1_10 === "4", "310화 finale hook is not separated from reward");
check(fixed[310].chapter.ending_hook.includes("108년") && fixed[310].chapter.ending_hook.includes("베이브 루스"), "310화 ending receipt missing final scene");
check(reviewBySequence.get(109)?.["보상 강도"] === "10", "109화 completed no-hitter reward is not 10");
check(reviewBySequence.get(159)?.["보상 강도"] === "10", "159화 championship reward is not 10");
check(reviewBySequence.get(277)?.["보상 강도"] === "10", "277화 perfect game reward is not 10");
check(reviewBySequence.get(309)?.["훅 강도"] === "4", "309화 closed championship hook is not 4");

const audited = (sequence) => chapterBySequence.get(sequence) ?? {};
check(audited(6).paid_reward?.includes("11대0 경기의 구원 등판·무실점 약속은 아직 나오지 않는다"), "6화 advances the next-game relief decision");
check(audited(9).paid_reward?.includes("홈런·득점 보상은 유예된다"), "9화 advances the pinch-hit home run");
check(audited(18).paid_reward?.includes("96·100마일과 삼진은 아직 나오지 않는다"), "18화 advances later velocity and strikeout");
check(audited(31).paid_reward?.includes("타구·타점은 다음 화로 남는다"), "31화 advances the second plate-appearance result");
check(audited(40).paid_reward?.includes("4회 1피안타 봉쇄는 아직 발생하지 않는다"), "40화 advances the four-inning result");
check(audited(41).paid_reward?.includes("삼진과 흐름 차단은 아직 지급되지 않는다"), "41화 advances the 101 mph strikeout");
check(![audited(41).action, audited(41).turn_or_reveal, audited(41).paid_reward, audited(41).state_change].join(" ").includes("101마일"), "41화 fact fields retain next-chapter 101 mph");
check(audited(128).paid_reward?.includes("1차전 선발권은 아직 누구에게도 지급되지 않는다"), "128화 advances the starter choice");
check(audited(129).paid_reward?.includes("4점 리드와 무어의 장기 성공은 아직 없다"), "129화 advances later first-game results");
check(audited(131).paid_reward?.includes("초구 피홈런 뒤 회복도 아직 시작되지 않는다"), "131화 advances the post-homer recovery");
check(audited(133).paid_reward?.includes("10탈삼진") && !audited(133).paid_reward?.includes("12탈삼진"), "133화 strikeout total is not corrected to 10");
check(audited(140).paid_reward?.includes("타구·선취점은 아직 지급되지 않는다"), "140화 advances the opposite-field hit");
check(audited(172).paid_reward?.includes("첫 공·첫 아웃·승리는 아직 나오지 않는다"), "172화 advances the opening-game result");
check(audited(195).paid_reward?.includes("결승 레이스·추월·메달은 아직 지급되지 않는다"), "195화 advances the Olympic final result");
check(audited(248).paid_reward?.includes("1,500만 달러 요구나 워싱턴 4대1 제안은 아직 나오지 않는다"), "248화 advances salary/trade proposals");
check(audited(249).paid_reward?.includes("조정 결과와 트레이드 성립은 아직 지급되지 않는다"), "249화 advances arbitration/trade completion");
check(audited(253).turn_or_reveal?.includes("'3루?'라고 되묻는다") && audited(253).paid_reward?.includes("1·3루 병행 합의와 수비 훈련 성과는 아직 없다"), "253화 exceeds the third-base request boundary");
check(![audited(253).action, audited(253).turn_or_reveal, audited(253).paid_reward, audited(253).state_change].join(" ").includes("송구 확인"), "253화 retains next-chapter throwing assessment");
check(audited(254).paid_reward?.includes("첫 타석 홈런은 아직 나오지 않는다"), "254화 advances the first plate-appearance home run");
check(![audited(254).reader_promise, audited(254).turn_or_reveal, audited(254).paid_reward, audited(254).state_change].join(" ").includes("3안타 2홈런 4타점"), "254화 retains chapter 255 game line");
check(audited(255).paid_reward?.includes("3안타 2홈런 4타점"), "255화 does not own the three-hit two-homer four-RBI result");

const atlas = readFileSync(join(candidateDir, "arc_atlas.md"), "utf8");
const atlasArcHeadings = [...atlas.matchAll(/^## (RA-\d{3}) ·/gm)].map((match) => match[1]);
const atlasChapterRows = [...atlas.matchAll(/^\| (\d+)화 \|/gm)].map((match) => Number(match[1]));
check(atlasArcHeadings.length === expectedArcs, `Atlas Arc headings ${atlasArcHeadings.length}`);
check(new Set(atlasArcHeadings).size === expectedArcs, "Atlas Arc headings duplicated");
check(atlasChapterRows.length === expectedChapters, `Atlas chapter rows ${atlasChapterRows.length}`);
check(new Set(atlasChapterRows).size === expectedChapters, "Atlas chapter rows duplicated");
for (const arc of arcs) {
  const start = Number(arc.start_sequence);
  const end = Number(arc.end_sequence);
  const rows = pacing.slice(start - 1, end);
  const sectionStart = atlas.indexOf(`## ${arc.arc_id} ·`);
  const nextArc = arcs[arcs.indexOf(arc) + 1];
  const sectionEnd = nextArc ? atlas.indexOf(`## ${nextArc.arc_id} ·`, sectionStart + 1) : atlas.indexOf("## 초반·중반·후반의 리듬 변화", sectionStart + 1);
  const section = atlas.slice(sectionStart, sectionEnd);
  check(sectionStart >= 0 && sectionEnd > sectionStart, `Atlas section missing ${arc.arc_id}`);
  for (const [label, field] of [["긴장", "tension_1_10"], ["보상", "reward_1_10"], ["훅", "hook_1_10"]]) {
    const values = rows.map((row) => Number(row[field]));
    const expectedLine = `${label}: ${values.join("-")} (평균 ${average(values)})`;
    check(section.includes(expectedLine), `Atlas ${arc.arc_id} ${label} differs from CSV`);
  }
}
for (let sequence = 1; sequence <= expectedChapters; sequence += 1) {
  const manual = reviewBySequence.get(sequence);
  const row = pacing[sequence - 1];
  const expectedRow = `| ${sequence}화 | ${mdCell(row.concrete_event)} | ${mdCell(manual["보상 범위"])} | ${mdCell(manual["종료 훅"])} | ${row.tension_1_10} | ${row.reward_1_10} | ${row.hook_1_10} | ${mdCell(row.arc_phase)} |`;
  check(atlas.includes(expectedRow), `Atlas chapter row differs at ${sequence}`);
}

const builderSource = readFileSync(join(candidateDir, "build_candidate.mjs"), "utf8");
const prohibitedBuilderNames = [
  ["keyword", "Score"].join(""),
  ["pacing", "Scores"].join(""),
  ["weight", "Scores"].join(""),
  ["phase", "For"].join(""),
];
for (const name of prohibitedBuilderNames) check(!builderSource.includes(name), `builder contains prohibited judgment helper ${name}`);
check(builderSource.includes("manualReviewPaths"), "builder does not read manual reviews");
check(builderSource.includes("manual_chapter_fact_authority.csv"), "builder does not read manual chapter fact authority");
check(builderSource.includes("arc_boundary_authority.csv"), "builder does not read manual Arc authority");
check(!/readCsv\(join\(analysisRoot,\s*["']chapter_map\.csv["']\)\)/.test(builderSource), "builder reads stale root chapter_map facts");
check(!builderSource.includes("axisFor("), "builder derives state axis from keyword classification");

const receipt = readFileSync(join(candidateDir, "completion_receipt.md"), "utf8");
for (const phrase of [
  "자연 NarrativeArc: 55개",
  "수동 페이싱 판정: 310/310",
  "종료 훅 원문 대조: 310/310",
  "회차 사실 7필드 원문 경계 감사: 310/310",
  "발견·교정: 18개 회차",
  "manual_chapter_fact_authority.csv",
  "루트 정본: 미승격·보존",
  "리본 척도: 독립 강도형 1~10 정수",
]) check(receipt.includes(phrase), `completion receipt missing ${phrase}`);

const factAudit = readFileSync(join(candidateDir, "manual_chapter_fact_audit.md"), "utf8");
for (const phrase of [
  "감사 완료: 310/310회",
  "발견·교정 회차: 18개",
  "9화 `1363~1527`",
  "107화 `20249~20469`",
  "254화 `49112~49315`",
  "루트 정본 보존 기준",
]) check(factAudit.includes(phrase), `manual fact audit missing ${phrase}`);

if (warnings.length === 0 && errors.length === 0) {
  console.log(`PASS 리턴 에이스 후보: ${expectedChapters}회 / ${expectedArcs} Arc / 오류 0 / 경고 0`);
} else {
  console.log(`FAIL 리턴 에이스 후보: ${expectedChapters}회 / ${expectedArcs} Arc / 오류 ${errors.length} / 경고 ${warnings.length}`);
  for (const error of errors) console.log(`  ERROR ${error}`);
  for (const warning of warnings) console.log(`  WARN ${warning}`);
  process.exitCode = 1;
}

console.log(JSON.stringify({
  status: errors.length === 0 && warnings.length === 0 ? "pass" : "fail",
  sourceSha256: sha256(sourceBuffer),
  sourceMarkers: sourceMarkers.length,
  manualPacingRows: reviews.length,
  endingHookComparisons: reviews.length,
  manualChapterFactAuthorityRows: chapterFactAuthority.length,
  chapterMapRows: chapters.length,
  arcPacingRows: pacing.length,
  naturalArcCount: arcs.length,
  arcCoverage: `1-${expectedStart - 1}`,
  uniquePacingNotes: uniqueNotes.size,
  uniqueConcreteEvents: uniqueEvents.size,
  uniqueManualPhases: uniquePhases.size,
  maximumIdenticalScoreTripleRun: tripleRun,
  maximumIdenticalRibbonRun: ribbonRun,
  maximumIdenticalPhaseRun: phaseRun,
  atlasChapterRows: atlasChapterRows.length,
  rootCanonicalPreserved: Object.keys(rootHashes).length,
  errors: errors.length,
  warnings: warnings.length,
}, null, 2));
