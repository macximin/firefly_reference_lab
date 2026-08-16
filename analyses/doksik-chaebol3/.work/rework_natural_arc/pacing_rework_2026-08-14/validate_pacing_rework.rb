#!/usr/bin/env ruby
# frozen_string_literal: true

require "csv"
require "digest"

WORK = __dir__
ROOT = File.expand_path("../../../../../", WORK)
ANALYSIS = File.join(ROOT, "analyses/doksik-chaebol3")
SOURCE = File.join(ROOT, "private_sources/korean_webnovel_corpus/서오/독식하는 재벌 3세_서오_합본.txt")
ARCHIVE = File.join(ROOT, "exports/checkpoints/2026-08-14-doksik-pre-pacing-rework.tar.gz")
REWORK = File.join(ANALYSIS, ".work/rework_natural_arc")
REVIEWS = File.join(REWORK, "reviews")

EXPECTED_SOURCE_SHA = "66f3e7df3123343c14a7134108dc59940511f40372493a549cba8ae709df4b45"
EXPECTED_ARCHIVE_SHA = "13cbbdd4226452abd006e3e5348e63356f99bcef5627329eba7ef8311fa9896a"
EXPECTED_START_CHAPTER_SHA = "7053d49dc7025e48b56daa2b35458965918ffc570cd66be0f87f4239992581f8"
START_CHAPTER = File.join(WORK, "manager-followup-start-chapter_map-7053d49d.csv")
FIELD_AUDIT = File.join(WORK, "chapter-narrative-boundary-audit-001-751.csv")
MANUAL_LEDGER = File.join(WORK, "manual-pacing-prose-ledger-119.csv")

errors = []
check = lambda do |condition, message|
  errors << message unless condition
end

check.call(Digest::SHA256.file(SOURCE).hexdigest == EXPECTED_SOURCE_SHA, "source SHA mismatch")
check.call(Digest::SHA256.file(ARCHIVE).hexdigest == EXPECTED_ARCHIVE_SHA, "archive SHA mismatch")
check.call(File.exist?(START_CHAPTER), "manager-followup start snapshot missing")
check.call(Digest::SHA256.file(START_CHAPTER).hexdigest == EXPECTED_START_CHAPTER_SHA, "manager-followup start snapshot SHA mismatch") if File.exist?(START_CHAPTER)

source_lines = File.readlines(SOURCE, chomp: true)
marker_lines = source_lines.each_index.select { |index| source_lines[index].match?(/ⓚ\d/) }.map { |index| index + 1 }
check.call(marker_lines.length == 751, "source marker count #{marker_lines.length}")

arcs = CSV.read(File.join(ANALYSIS, "arc_map.csv"), headers: true).map(&:to_h)
chapters = CSV.read(File.join(ANALYSIS, "chapter_map.csv"), headers: true).map(&:to_h)
pacing = CSV.read(File.join(ANALYSIS, "arc_pacing.csv"), headers: true).map(&:to_h)
evidence = CSV.read(File.join(REWORK, "pacing/pacing-all-evidence.csv"), headers: true).map(&:to_h)
high = CSV.read(File.join(REWORK, "high-score-and-relationship-evidence.csv"), headers: true).map(&:to_h)
start_chapters = CSV.read(START_CHAPTER, headers: true).map(&:to_h)
field_audit = CSV.read(FIELD_AUDIT, headers: true).map(&:to_h)
manual_ledger = CSV.read(MANUAL_LEDGER, headers: true).map(&:to_h)

check.call(arcs.length == 84, "arc count #{arcs.length}")
check.call(chapters.length == 751, "chapter count #{chapters.length}")
check.call(pacing.length == 751, "pacing count #{pacing.length}")
check.call(evidence.length == 751, "evidence count #{evidence.length}")
check.call(start_chapters.length == 751, "start chapter count #{start_chapters.length}")
check.call(field_audit.length == 751 * 11, "field audit count #{field_audit.length}")
check.call(manual_ledger.length == 119, "manual prose ledger count #{manual_ledger.length}")

chapter_by_sequence = chapters.to_h { |row| [row.fetch("sequence").to_i, row] }
pace_by_sequence = pacing.to_h { |row| [row.fetch("sequence").to_i, row] }
evidence_by_sequence = evidence.to_h { |row| [row.fetch("sequence").to_i, row] }
start_chapter_by_sequence = start_chapters.to_h { |row| [row.fetch("sequence").to_i, row] }
check.call(chapter_by_sequence.keys.sort == (1..751).to_a, "chapter sequence coverage")
check.call(pace_by_sequence.keys.sort == (1..751).to_a, "pacing sequence coverage")
check.call(evidence_by_sequence.keys.sort == (1..751).to_a, "evidence sequence coverage")
check.call(start_chapter_by_sequence.keys.sort == (1..751).to_a, "start chapter sequence coverage")

narrative_fields = %w[
  entry_state reader_promise protagonist_goal action resistance_or_cost
  turn_or_reveal paid_reward state_change ending_hook closed_loops opened_loops
]
audit_keys = field_audit.map { |row| [row.fetch("sequence").to_i, row.fetch("field")] }
expected_audit_keys = (1..751).flat_map { |sequence| narrative_fields.map { |field| [sequence, field] } }
check.call(audit_keys == expected_audit_keys, "field audit sequence/field coverage")
field_audit.each do |row|
  sequence = row.fetch("sequence").to_i
  field = row.fetch("field")
  expected_before = start_chapter_by_sequence.fetch(sequence).fetch(field).to_s
  expected_after = chapter_by_sequence.fetch(sequence).fetch(field).to_s
  expected_result = expected_before == expected_after ? "PASS" : "EDIT"
  check.call(row.fetch("before") == expected_before, "field audit before #{sequence} #{field}")
  check.call(row.fetch("after") == expected_after, "field audit after #{sequence} #{field}")
  check.call(row.fetch("result") == expected_result, "field audit result #{sequence} #{field}")
  check.call(row.fetch("candidate_status") == "CANDIDATE", "field audit changed field not candidate #{sequence} #{field}") if expected_result == "EDIT"
  check.call(row.fetch("before_provenance") == "manager-followup-start sha256:#{EXPECTED_START_CHAPTER_SHA}", "field audit provenance #{sequence} #{field}")
end

chapters.each_with_index do |row, index|
  sequence = index + 1
  check.call(row.fetch("sequence").to_i == sequence, "chapter order #{sequence}")
  check.call(row.fetch("start_line").to_i == marker_lines[index], "chapter #{sequence} start line")
  expected_end = index == 750 ? source_lines.length : marker_lines[index + 1] - 1
  check.call(row.fetch("end_line").to_i == expected_end, "chapter #{sequence} end line")
end

expected_start = 1
arcs.each do |arc|
  first = arc.fetch("start_sequence").to_i
  last = arc.fetch("end_sequence").to_i
  check.call(first == expected_start, "arc gap/overlap before #{arc.fetch('arc_id')}")
  check.call(last >= first, "arc reverse range #{arc.fetch('arc_id')}")
  check.call(arc.fetch("episode_count").to_i == last - first + 1, "arc episode count #{arc.fetch('arc_id')}")
  (first..last).each do |sequence|
    check.call(chapter_by_sequence.fetch(sequence).fetch("arc_id") == arc.fetch("arc_id"), "chapter arc mismatch #{sequence}")
    check.call(pace_by_sequence.fetch(sequence).fetch("arc_id") == arc.fetch("arc_id"), "pacing arc mismatch #{sequence}")
    check.call(evidence_by_sequence.fetch(sequence).fetch("arc_id") == arc.fetch("arc_id"), "evidence arc mismatch #{sequence}")
  end
  expected_start = last + 1
end
check.call(expected_start == 752, "arc coverage ends #{expected_start - 1}")

weight_fields = %w[information_weight action_weight relationship_weight emotion_weight material_or_status_weight]
score_fields = %w[tension_1_10 reward_1_10 hook_1_10]

def clean_clause(text)
  text.to_s.strip.sub(/[.;。]+\z/, "")
end

pacing.each do |row|
  sequence = row.fetch("sequence").to_i
  chapter = chapter_by_sequence.fetch(sequence)
  scores = score_fields.map { |field| row.fetch(field) }
  check.call(scores.all? { |value| value.match?(/\A\d+\z/) && value.to_i.between?(1, 10) }, "score scale #{sequence}")
  weights = weight_fields.map { |field| row.fetch(field).to_f }
  check.call(weights.all? { |value| value.between?(0.0, 1.0) }, "ribbon range #{sequence}")
  check.call((weights.sum - 1.0).abs <= 0.01, "ribbon sum #{sequence}=#{weights.sum}")
  event = [chapter.fetch("action"), chapter.fetch("turn_or_reveal"), chapter.fetch("paid_reward")].map { |text| clean_clause(text) }.join("; ")
  check.call(row.fetch("concrete_event") == event, "concrete event mismatch #{sequence}")
  source = evidence_by_sequence.fetch(sequence)
  check.call(source.fetch("source_lines") == "L#{chapter.fetch('start_line')}~L#{chapter.fetch('end_line')}", "evidence lines #{sequence}")
  score_fields.each { |field| check.call(source.fetch(field) == row.fetch(field), "evidence score #{sequence} #{field}") }
  weight_fields.each { |field| check.call(source.fetch(field) == row.fetch(field), "evidence ribbon #{sequence} #{field}") }
  check.call(source.fetch("ribbon_rationale") == row.fetch("pacing_note"), "evidence note #{sequence}")
end

note_groups = pacing.group_by { |row| row.fetch("pacing_note") }.select { |_note, rows| rows.length > 1 }
check.call(note_groups.empty?, "duplicate pacing notes #{note_groups.values.map(&:length).inspect}")
template_phrases = ["독자는", "실제 지급은 다음에 한정된다", "가장 오래 머문다"]
template_phrases.each do |phrase|
  count = pacing.count { |row| row.fetch("pacing_note").include?(phrase) }
  check.call(count.zero?, "mechanical pacing phrase #{phrase}=#{count}")
end
semantic_meta_pattern = /지배한다|비중|리본|독서 시간|(?:정보|행동|관계|감정|물질|지위|돈)(?:·(?:정보|행동|관계|감정|물질|지위|돈))*\s*회차(?:다|이다)|(?:정보|행동|관계|감정|물질|지위|돈).{0,8}(?:중심|주축)|(?:정보|행동|관계|감정|물질|지위|돈).{0,8}(?:높다|크다|압도한다)/
semantic_meta_count = pacing.count { |row| row.fetch("pacing_note").match?(semantic_meta_pattern) }
check.call(semantic_meta_count.zero?, "semantic pacing meta prose=#{semantic_meta_count}")
check.call(manual_ledger.map { |row| row.fetch("sequence").to_i }.uniq.length == 119, "manual prose ledger duplicate sequence")
manual_ledger.each do |row|
  sequence = row.fetch("sequence").to_i
  check.call(row.fetch("note_status") == "EDIT", "manual note status #{sequence}")
  check.call(row.fetch("boundary_status") == "PASS", "manual boundary status #{sequence}")
  check.call(row.fetch("after_note") == pace_by_sequence.fetch(sequence).fetch("pacing_note"), "manual note mismatch #{sequence}")
end

semantic_rows = %w[audit-ledger-001-250.csv audit-ledger-251-500.csv audit-ledger-501-751.csv].flat_map do |name|
  CSV.read(File.join(WORK, name), headers: true).map(&:to_h)
end
check.call(semantic_rows.length == 751, "semantic ledger rows #{semantic_rows.length}")
check.call(semantic_rows.map { |row| row.fetch("sequence").to_i }.sort == (1..751).to_a, "semantic ledger coverage")
check.call(semantic_rows.all? { |row| %w[PASS EDIT].include?(row.fetch("status")) }, "semantic ledger status")
check.call(semantic_rows.find { |row| row.fetch("sequence") == "610" }.fetch("status") == "EDIT", "semantic ledger 610 not corrected")

arc_by_id = arcs.to_h { |row| [row.fetch("arc_id"), row] }
expected_n20 = {
  "DCA-N20" => [192, 199], "DCA-N20B" => [200, 202], "DCA-N20C" => [203, 206],
  "DCA-N20D" => [207, 209], "DCA-N20E" => [210, 211], "DCA-N20F" => [212, 215]
}
expected_n20.each do |id, range|
  row = arc_by_id[id]
  check.call(row && [row.fetch("start_sequence").to_i, row.fetch("end_sequence").to_i] == range, "N20 mapping #{id}")
end

expected_n33_n34 = {
  "DCA-N33" => [357, 369], "DCA-N33B" => [370, 373],
  "DCA-N33C" => [374, 377], "DCA-N33D" => [378, 380],
  "DCA-N34" => [381, 396], "DCA-N34B" => [397, 399],
  "DCA-N34C" => [400, 401]
}
expected_n33_n34.each do |id, range|
  row = arc_by_id[id]
  check.call(row && [row.fetch("start_sequence").to_i, row.fetch("end_sequence").to_i] == range, "N33/N34 mapping #{id}")
end

c54 = chapter_by_sequence.fetch(54)
c55 = chapter_by_sequence.fetch(55)
c59 = chapter_by_sequence.fetch(59)
c200 = chapter_by_sequence.fetch(200)
c610 = chapter_by_sequence.fetch(610)
c611 = chapter_by_sequence.fetch(611)
c660 = chapter_by_sequence.fetch(660)
c661 = chapter_by_sequence.fetch(661)
c730 = chapter_by_sequence.fetch(730)
c731 = chapter_by_sequence.fetch(731)
c732 = chapter_by_sequence.fetch(732)
c50 = chapter_by_sequence.fetch(50)
c230 = chapter_by_sequence.fetch(230)
c264 = chapter_by_sequence.fetch(264)
c391 = chapter_by_sequence.fetch(391)
c577 = chapter_by_sequence.fetch(577)
c619 = chapter_by_sequence.fetch(619)
c669 = chapter_by_sequence.fetch(669)
c675 = chapter_by_sequence.fetch(675)
c676 = chapter_by_sequence.fetch(676)

check.call(c54.fetch("action").include?("1,500명을 전수 검토") && !c54.fetch("action").include?("1,500명 재배치"), "54 review vs move")
check.call(c55.fetch("action").include?("수백 명") && !c55.fetch("action").include?("500명"), "55 unsupported 500")
check.call(c59.fetch("closed_loops").include?("다음 날 날인 일정") && !c59.fetch("closed_loops").include?("교환을 실행"), "59 pre-sign closure")
check.call(![c200.fetch("action"), c200.fetch("paid_reward"), c200.fetch("ending_hook")].join(" ").include?("50억"), "200 pulls 201 contract")
check.call(!c610.fetch("action").match?(/현금창고|계좌.*동결|정유회사.*인수/) && c610.fetch("paid_reward").include?("아직 전이다"), "610 pulls 611 result")
check.call(c611.fetch("paid_reward").match?(/구속/) && c611.fetch("paid_reward").match?(/정유회사/), "611 missing actual payoff")
check.call(c660.fetch("paid_reward").include?("아직 미지급") && c661.fetch("paid_reward").include?("99퍼센트"), "660/661 payoff order")
check.call(c730.fetch("paid_reward").include?("제시한다") && c730.fetch("paid_reward").include?("휴전 결단·사업권·부패자금 회수는 아직 전"), "730 proposal vs payoff")
check.call(!c731.fetch("ending_hook").match?(/협상요청|금융청 책임/) && c731.fetch("ending_hook").include?("미국 압박 가능성"), "731 hook attribution")
check.call(c732.fetch("action").include?("전액상환 충격을 받은") && !c732.fetch("action").match?(/전액상환(을|을 다시) (실행|완료)/), "732 repayment attribution")
c50_surface = [c50.fetch("action"), c50.fetch("paid_reward"), c50.fetch("state_change"), c50.fetch("closed_loops"), pace_by_sequence.fetch(50).fetch("pacing_note")].join(" ")
check.call(!c50_surface.match?(/사진(?:·|과)\s*녹취(?:를)?\s*확보(?!되지)/), "50 pulls next evidence")
check.call(!c230.fetch("ending_hook").include?("4조 원으로 낙찰") && !pace_by_sequence.fetch(230).fetch("pacing_note").match?(/실제 낙찰가.*4조|4조.*낙찰/), "230 pulls next winning price")
check.call(!c264.fetch("resistance_or_cost").include?("2만 명 감원"), "264 pulls next CITI response")
check.call(!c391.fetch("ending_hook").match?(/일주일|공매도 자금/), "391 pulls next survey plan")
check.call(!c577.fetch("ending_hook").match?(/새 얼굴|서사/) && !c577.fetch("opened_loops").match?(/시장 영웅|서사/), "577 pulls next market character")
check.call(![c619.fetch("reader_promise"), c619.fetch("paid_reward"), c619.fetch("opened_loops"), pace_by_sequence.fetch(619).fetch("pacing_note")].join(" ").match?(/나흘|우선통항|확장공사/), "619 pulls next Suez payoff")
check.call(c669.fetch("paid_reward").include?("급료 해결은 아직 전") && !c669.fetch("action").include?("간접 지원해"), "669 pulls next payroll solution")
check.call(c675.fetch("paid_reward").include?("정식 계약·수익 실현은 아직 전") && !c675.fetch("action").include?("계약을 따내고"), "675 converts pending Saudi deals to executed contracts")
check.call(c676.fetch("paid_reward").include?("보고서 전달·경제부처 심사·시장개혁 정책은 아직 전") && !c676.fetch("paid_reward").include?("연대가 확정"), "676 converts review promise to policy execution")

n51 = arc_by_id.fetch("DCA-N51")
n58 = arc_by_id.fetch("DCA-N58")
check.call(!n51.fetch("concrete_payoff").match?(/구속|정유회사 인수/), "N51 owns 611 payoff")
check.call(n51.fetch("residual_cost").include?("611화 초반 coda"), "N51 residual coda missing")
check.call(n58.fetch("concrete_payoff").include?("로나 폭락 수익은 아직 지급되지 않았다"), "N58 owns 661 profit")
check.call(n58.fetch("relationship_change").include?("공개 복권되지는 않는다"), "N58 owns 661 restoration")
n60 = arc_by_id.fetch("DCA-N60")
check.call(n60.fetch("concrete_payoff").include?("산업 정식계약과 원유 숏 수익 실현은 아직 전"), "N60 overclaims 675 contracts/profit")

[[200, 201], [610, 611], [660, 661], [734, 735]].each do |before_sequence, paid_sequence|
  before_reward = pace_by_sequence.fetch(before_sequence).fetch("reward_1_10").to_i
  paid_reward = pace_by_sequence.fetch(paid_sequence).fetch("reward_1_10").to_i
  check.call(before_reward < paid_reward, "reward inversion #{before_sequence}/#{paid_sequence}: #{before_reward}/#{paid_reward}")
end

sample_path = File.join(REVIEWS, "pacing-rework-sample-recheck-2026-08-14.md")
sample_text = File.read(sample_path)
sample_rows = sample_text.scan(/^\| (\d+) · /).flatten.map(&:to_i)
manager_sample = (50..60).to_a + (198..202).to_a + (608..612).to_a + (658..662).to_a + (729..732).to_a
extra_sample = [117, 120, 124, 125, 381, 391, 401, 402, 736, 738, 739, 740]
check.call(sample_rows.length == 42 && sample_rows.uniq.length == 42, "sample row count #{sample_rows.length}/#{sample_rows.uniq.length}")
check.call((sample_rows & manager_sample).sort == manager_sample.sort, "manager sample set")
check.call((sample_rows & extra_sample).sort == extra_sample.sort, "extra sample set")
role_rows = sample_text.scan(/^\| (DCA-N(?:33|34)\w*) · (첫|중간|끝|다음 첫) · (\d+) \|/)
expected_role_rows = expected_n33_n34.flat_map do |id, (first, last)|
  midpoint = {
    "DCA-N33" => 363, "DCA-N33B" => 372, "DCA-N33C" => 376,
    "DCA-N33D" => 379, "DCA-N34" => 388, "DCA-N34B" => 398,
    "DCA-N34C" => 401
  }.fetch(id)
  [[id, "첫", first.to_s], [id, "중간", midpoint.to_s], [id, "끝", last.to_s], [id, "다음 첫", (last + 1).to_s]]
end
check.call(role_rows == expected_role_rows, "follow-up role sample set #{role_rows.length}/#{expected_role_rows.length}")
check.call(sample_text.include?("30/30 PASS") && sample_text.include?("12/12 PASS") && sample_text.include?("28/28 PASS"), "sample verdict")

followup_path = File.join(REVIEWS, "manager-followup-pacing-prose-2026-08-14.md")
check.call(File.exist?(followup_path), "manager pacing prose follow-up report missing")
if File.exist?(followup_path)
  followup_text = File.read(followup_path)
  followup_rows = followup_text.scan(/^\| (\d+) \| (DCA-N\w+) \| ([^|]+) \| L\d+~L\d+ \|/).map { |sequence, _arc, _role| sequence.to_i }
  fixed_39 = [
    16, 21, 31, 32, 154, 160, 166, 167, 192, 197, 199, 200,
    327, 335, 341, 342, 381, 391, 396, 397, 456, 459, 462, 463,
    591, 597, 598, 599, 669, 672, 675, 676, 736, 738, 739, 740,
    52, 426, 745
  ]
  check.call(followup_rows.length == 39 && followup_rows.uniq.length == 39, "manager fixed sample rows #{followup_rows.length}/#{followup_rows.uniq.length}")
  check.call(followup_rows.sort == fixed_39.sort, "manager fixed 39 sample set")
  check.call(followup_text.include?("39/39 PASS"), "manager fixed 39 verdict")
  check.call(followup_text.scan(/`AWAITING_MANAGER_APPROVAL`/).length >= 2, "manager report approval status")
end

atlas = File.read(File.join(ANALYSIS, "arc_atlas.md"))
check.call(atlas.include?("자연 NarrativeArc 84개"), "atlas arc count text")
check.call(atlas.scan(/^- \*\*[^*]+\*\* · /).length == 751, "atlas chapter readbacks")

docs = {
  "project_bible.md" => File.read(File.join(ANALYSIS, "project_bible.md")),
  "inkos_usage_and_gap_report.md" => File.read(File.join(ANALYSIS, "inkos_usage_and_gap_report.md")),
  "free_improvements_report.md" => File.read(File.join(ANALYSIS, "free_improvements_report.md")),
  "completion_receipt.md" => File.read(File.join(ANALYSIS, "completion_receipt.md"))
}
docs.each do |name, text|
  check.call(!text.match?(/자연 NarrativeArc 74|74개 NarrativeArc|74 Arc|Arc 74개|74행/), "stale arc count #{name}")
end
check.call(docs.fetch("project_bible.md").include?("84개"), "bible 84 arcs")
check.call(docs.fetch("inkos_usage_and_gap_report.md").include?("84개 NarrativeArc"), "gap report 84 arcs")
check.call(docs.fetch("free_improvements_report.md").include?("84개 자연 NarrativeArc"), "improvements report 84 arcs")
check.call(docs.fetch("completion_receipt.md").include?("자연 NarrativeArc 84개"), "receipt 84 arcs")
check.call(docs.fetch("completion_receipt.md").include?("관리자 승인 대기"), "receipt approval status")

expected_high = evidence.select do |row|
  [row.fetch("tension_1_10"), row.fetch("reward_1_10"), row.fetch("hook_1_10")].map(&:to_i).max >= 9 ||
    row.fetch("relationship_weight").to_f >= 0.30
end
check.call(high.length == expected_high.length, "high evidence count #{high.length}/#{expected_high.length}")

score_distributions = score_fields.to_h do |field|
  values = pacing.map { |row| row.fetch(field).to_i }
  [field, values.group_by(&:itself).map { |value, group| [value, group.length] }.sort.to_h]
end
hook_values = pacing.map { |row| row.fetch("hook_1_10").to_i }
hook_high = hook_values.count { |value| value >= 8 }
longest = 0
run = 0
hook_values.each do |value|
  run = value >= 8 ? run + 1 : 0
  longest = [longest, run].max
end

arc_ranges = score_fields.to_h do |field|
  ranges = arcs.map do |arc|
    values = (arc.fetch("start_sequence").to_i..arc.fetch("end_sequence").to_i).map { |sequence| pace_by_sequence.fetch(sequence).fetch(field).to_i }
    values.max - values.min
  end
  [field, { constant: ranges.count(0), width_at_most_1: ranges.count { |range| range <= 1 } }]
end

ribbon_groups = pacing.group_by { |row| weight_fields.map { |field| row.fetch(field) }.join("/") }
duplicate_ribbon_groups = ribbon_groups.count { |_tuple, rows| rows.length > 1 }

if errors.empty?
  puts "PASS pacing rework readback: source=751 chapters=751 arcs=84 errors=0"
  puts "T distribution=#{score_distributions.fetch('tension_1_10')}"
  puts "R distribution=#{score_distributions.fetch('reward_1_10')}"
  puts "H distribution=#{score_distributions.fetch('hook_1_10')} H>=8=#{hook_high}/751 (#{format('%.2f', hook_high.fdiv(751) * 100)}%) longest=#{longest}"
  puts "Arc curves=#{arc_ranges}"
  puts "Ribbons unique=#{ribbon_groups.length}/751 duplicate_groups=#{duplicate_ribbon_groups}; notes unique=#{pacing.map { |row| row.fetch('pacing_note') }.uniq.length}/751"
  puts "High-score/relationship evidence=#{high.length}"
else
  warn "FAIL pacing rework readback errors=#{errors.length}"
  errors.each { |message| warn "- #{message}" }
  exit 1
end
