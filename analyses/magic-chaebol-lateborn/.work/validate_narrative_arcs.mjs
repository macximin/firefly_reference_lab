import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const outputDir = "/Users/a2501/Desktop/inkos/edge_repos/inkos_reverse_lab/analyses/magic-chaebol-lateborn";
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
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((candidate) => candidate.some((cell) => cell !== ""));
}

function load(file, header) {
  const rows = parseCsv(fs.readFileSync(path.join(outputDir, file), "utf8"));
  const actualHeader = rows.shift();
  if (actualHeader.join("\0") !== header.join("\0")) throw new Error(`${file}: 헤더 불일치`);
  return rows.map((row, rowIndex) => {
    if (row.length !== header.length) throw new Error(`${file}:${rowIndex + 2}: ${row.length}열`);
    return Object.fromEntries(header.map((key, column) => [key, row[column]]));
  });
}

function withoutArcIdHash(header, rows) {
  const filteredHeader = header.filter((key) => key !== "arc_id");
  const normalized = [filteredHeader, ...rows.map((row) => filteredHeader.map((key) => row[key]))];
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const chapters = load("chapter_map.csv", chapterHeader);
const pacing = load("arc_pacing.csv", pacingHeader);
const arcs = load("arc_map.csv", arcHeader);
const atlas = fs.readFileSync(path.join(outputDir, "arc_atlas.md"), "utf8");
const preserved = JSON.parse(fs.readFileSync(path.join(workDir, "surface_hashes_before.json"), "utf8"));

assert(chapters.length === 304, `chapter_map ${chapters.length}행`);
assert(pacing.length === 304, `arc_pacing ${pacing.length}행`);
assert(arcs.length !== 100, "거부된 100개 미니 Arc 분포가 그대로 남았다.");
assert(withoutArcIdHash(chapterHeader, chapters) === preserved.chapter_map_without_arc_id, "chapter_map 표면 해시 불일치");
assert(withoutArcIdHash(pacingHeader, pacing) === preserved.arc_pacing_without_arc_id, "arc_pacing 표면 해시 불일치");

const arcBySequence = new Map();
let expectedStart = 1;
for (const [index, arc] of arcs.entries()) {
  const start = Number(arc.start_sequence);
  const end = Number(arc.end_sequence);
  assert(arc.arc_id === `NA${String(index + 1).padStart(3, "0")}`, `${arc.arc_id}: 자연 Arc ID 순서 오류`);
  assert(start === expectedStart, `${arc.arc_id}: ${start}화 시작, 기대 ${expectedStart}화`);
  assert(end >= start, `${arc.arc_id}: 역전 범위`);
  assert(Number(arc.episode_count) === end - start + 1, `${arc.arc_id}: 길이 불일치`);
  assert(arc.start_label === chapters[start - 1].visible_label, `${arc.arc_id}: 시작 표식 불일치`);
  assert(arc.end_label === chapters[end - 1].visible_label, `${arc.arc_id}: 끝 표식 불일치`);
  const signals = arc.boundary_signals
    .split(/;|①|②|③|④|⑤/)
    .map((part) => part.trim())
    .filter(Boolean);
  assert(signals.length >= 2, `${arc.arc_id}: 경계 신호 두 개를 명시하지 않았다.`);
  assert(atlas.includes(`## ${arc.arc_id} · ${arc.arc_name}`), `${arc.arc_id}: atlas 상세 절 누락`);
  for (let sequence = start; sequence <= end; sequence += 1) {
    assert(!arcBySequence.has(sequence), `${sequence}화 중복 Arc`);
    arcBySequence.set(sequence, arc.arc_id);
  }
  expectedStart = end + 1;
}
assert(expectedStart === 305 && arcBySequence.size === 304, "자연 Arc 1~304화 커버리지 실패");

for (let index = 0; index < 304; index += 1) {
  const sequence = index + 1;
  assert(Number(chapters[index].sequence) === sequence, `chapter_map ${sequence}화 순서 불일치`);
  assert(Number(pacing[index].sequence) === sequence, `arc_pacing ${sequence}화 순서 불일치`);
  const expectedArc = arcBySequence.get(sequence);
  assert(chapters[index].arc_id === expectedArc, `${sequence}화 chapter_map Arc 불일치`);
  assert(pacing[index].arc_id === expectedArc, `${sequence}화 arc_pacing Arc 불일치`);
  const ribbon = ["information_weight", "action_weight", "relationship_weight", "emotion_weight", "material_or_status_weight"]
    .reduce((sum, field) => sum + Number(pacing[index][field]), 0);
  assert(ribbon === 100, `${sequence}화 리본 합계 ${ribbon}`);
}

assert(arcBySequence.get(101) === arcBySequence.get(107), "101~107화 후계전이 하나의 자연 Arc가 아니다.");
assert(arcBySequence.get(138) !== arcBySequence.get(139), "메테오 위성망과 카지노 잠입이 아직 한 Arc다.");
assert(arcBySequence.get(189) === arcBySequence.get(190), "189~190화 우주 발전소 결산이 끊겼다.");
assert(arcBySequence.get(190) !== arcBySequence.get(191), "우주 발전소와 불턴·빛의 지팡이가 아직 한 Arc다.");
assert(arcBySequence.get(303) === arcBySequence.get(304), "303~304화 9서클·귀환 결산이 끊겼다.");
assert(!atlas.includes("메테오 위성망과 카지노 잠입"), "거부된 혼합 Arc 이름이 atlas에 남았다.");
assert(!atlas.includes("우주 발전소·불턴·빛의 지팡이"), "거부된 혼합 Arc 이름이 atlas에 남았다.");

const histogram = {};
for (const arc of arcs) histogram[arc.episode_count] = (histogram[arc.episode_count] ?? 0) + 1;
const lengths = arcs.map((arc) => Number(arc.episode_count));
const twoOrThree = lengths.filter((length) => length === 2 || length === 3).length;
console.log(JSON.stringify({
  ok: true,
  chapters: chapters.length,
  pacingRows: pacing.length,
  narrativeArcs: arcs.length,
  meanLength: Number((304 / arcs.length).toFixed(2)),
  minLength: Math.min(...lengths),
  maxLength: Math.max(...lengths),
  twoOrThreeCount: twoOrThree,
  twoOrThreeRatio: Number((twoOrThree / arcs.length).toFixed(4)),
  histogram,
  chapterSurfaceHash: withoutArcIdHash(chapterHeader, chapters),
  pacingSurfaceHash: withoutArcIdHash(pacingHeader, pacing),
  counterexamples: {
    satelliteVsCasino: `${arcBySequence.get(138)} / ${arcBySequence.get(139)}`,
    spacePlantVsBolton: `${arcBySequence.get(190)} / ${arcBySequence.get(191)}`,
  },
}, null, 2));
