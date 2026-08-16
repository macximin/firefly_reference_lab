#!/usr/bin/env ruby
# frozen_string_literal: true

require "csv"
require "digest"
require "json"

stage = ARGV.fetch(0) { abort "usage: validate_manager_redteam_stage.rb STAGE DECISIONS" }
decision_path = ARGV.fetch(1) { abort "usage: validate_manager_redteam_stage.rb STAGE DECISIONS" }

ROOT_OUTPUTS = %w[
  arc_atlas.md arc_map.csv arc_pacing.csv chapter_map.csv completion_receipt.md
  free_improvements_report.md inkos_usage_and_gap_report.md project_bible.md
  source_receipt.json
].freeze
SCORE_FIELDS = %w[tension_1_10 reward_1_10 hook_1_10].freeze
RIBBON_FIELDS = %w[
  information_weight action_weight relationship_weight emotion_weight
  material_or_status_weight
].freeze
NARRATIVE_FIELDS = %w[
  entry_state reader_promise protagonist_goal action resistance_or_cost
  turn_or_reveal paid_reward state_change ending_hook closed_loops opened_loops
].freeze

def fail_check(message)
  raise "STAGE VALIDATION: #{message}"
end

def csv_rows(path)
  CSV.read(path, headers: true).map(&:to_h)
end

def must_include(text, label, *tokens)
  tokens.each { |token| fail_check("#{label} missing #{token}") unless text.include?(token) }
end

def must_exclude(text, label, *tokens)
  tokens.each { |token| fail_check("#{label} contains forbidden #{token}") if text.include?(token) }
end

def chapter_surface(row)
  NARRATIVE_FIELDS.map { |field| row.fetch(field).to_s }.join(" ")
end

ROOT_OUTPUTS.each do |name|
  path = File.join(stage, name)
  fail_check("missing root output #{name}") unless File.file?(path)
end

decisions = csv_rows(decision_path)
arcs = csv_rows(File.join(stage, "arc_map.csv"))
chapters = csv_rows(File.join(stage, "chapter_map.csv"))
pacing = csv_rows(File.join(stage, "arc_pacing.csv"))
fail_check("decision count #{decisions.length}") unless decisions.length == 131
fail_check("arc count #{arcs.length}") unless arcs.length == 131
fail_check("chapter count #{chapters.length}") unless chapters.length == 751
fail_check("pacing count #{pacing.length}") unless pacing.length == 751

decision_ranges = decisions.map do |row|
  [row.fetch("arc_id"), row.fetch("start_sequence").to_i, row.fetch("end_sequence").to_i]
end
arc_ranges = arcs.map do |row|
  [row.fetch("arc_id"), row.fetch("start_sequence").to_i, row.fetch("end_sequence").to_i]
end
fail_check("arc ranges differ from decision CSV") unless arc_ranges == decision_ranges
fail_check("arc coverage endpoints") unless arc_ranges[0][1] == 1 && arc_ranges[-1][2] == 751
fail_check("arc gap/overlap") unless arc_ranges.each_cons(2).all? { |left, right| right[1] == left[2] + 1 }
fail_check("arc IDs duplicate") unless arcs.map { |row| row.fetch("arc_id") }.uniq.length == 131
fail_check("analytical word in event name") if arcs.any? { |row| row.fetch("arc_name") =~ /(coda|bridge|subplot|climax|코다|브리지|서브플롯|클라이맥스)/i }

arc_for_sequence = {}
arcs.each do |arc|
  first = arc.fetch("start_sequence").to_i
  last = arc.fetch("end_sequence").to_i
  fail_check("episode_count #{arc.fetch('arc_id')}") unless arc.fetch("episode_count").to_i == last - first + 1
  (first..last).each { |sequence| arc_for_sequence[sequence] = arc.fetch("arc_id") }
end

chapters.each_with_index do |row, index|
  sequence = index + 1
  fail_check("chapter sequence #{sequence}") unless row.fetch("sequence").to_i == sequence
  fail_check("chapter arc #{sequence}") unless row.fetch("arc_id") == arc_for_sequence.fetch(sequence)
end
pacing.each_with_index do |row, index|
  sequence = index + 1
  fail_check("pacing sequence #{sequence}") unless row.fetch("sequence").to_i == sequence
  fail_check("pacing arc #{sequence}") unless row.fetch("arc_id") == arc_for_sequence.fetch(sequence)
  SCORE_FIELDS.each do |field|
    value = row.fetch(field).to_i
    fail_check("score #{field} seq #{sequence}") unless value.between?(1, 10)
  end
  values = RIBBON_FIELDS.map { |field| row.fetch(field).to_f }
  fail_check("ribbon range seq #{sequence}") unless values.all? { |value| value.between?(0.0, 1.0) }
  fail_check("ribbon sum seq #{sequence}") unless (values.inject(0.0, :+) - 1.0).abs <= 0.01
end

arcs.each_with_index do |arc, index|
  decision = decisions.fetch(index)
  fail_check("dominant_question copied #{arc.fetch('arc_id')}") if [
    arc.fetch("central_question"), arc.fetch("promise")
  ].include?(decision.fetch("dominant_question"))
  must_include(arc.fetch("concrete_premise"), "premise #{arc.fetch('arc_id')}", "L")
  must_include(arc.fetch("boundary_signals"), "boundary #{arc.fetch('arc_id')}", "①", "②")
end

chapter_by_sequence = chapters.each_with_object({}) { |row, hash| hash[row.fetch("sequence").to_i] = row }
pace_by_sequence = pacing.each_with_object({}) { |row, hash| hash[row.fetch("sequence").to_i] = row }

surface15 = chapter_surface(chapter_by_sequence.fetch(15))
must_include(surface15, "seq15", "푸틴", "하버드", "배터리 교수", "지분 취득은 이 화에 없다")

surface50 = chapter_surface(chapter_by_sequence.fetch(50))
must_include(surface50, "seq50", "영상", "음성 녹음", "이미 확보")
must_exclude(chapter_by_sequence.fetch(50).fetch("paid_reward"), "seq50 paid_reward", "아직 없다")

surface192 = chapter_surface(chapter_by_sequence.fetch(192))
must_include(surface192, "seq192", "불량학생 4~5명", "머리를 후려치고", "식판에 침", "후보 50명 명단은 아직 미지급")
must_exclude(surface192, "seq192", "천민우", "추영택")

surface194 = chapter_surface(chapter_by_sequence.fetch(194))
must_include(surface194, "seq194", "사진·영상·녹취·진술서", "바디캠", "교실", "안아", "정식 학폭위", "부장검사 윗라인")

surface246 = chapter_surface(chapter_by_sequence.fetch(246))
must_include(surface246, "seq246", "SG 소속 가수 전원 양도 약속", "실제 계약이전", "미지급")

surface259 = chapter_surface(chapter_by_sequence.fetch(259))
must_include(surface259, "seq259", "북한 사투리", "스페인어", "CCTV", "프로 승률 50%", "1경기 승리")

surface264 = chapter_surface(chapter_by_sequence.fetch(264))
must_include(surface264, "seq264", "30%", "CITI", "2만 명", "600억 달러", "리먼 파산설")

surface335 = chapter_surface(chapter_by_sequence.fetch(335))
must_include(surface335, "seq335", "1만2천 명", "운송수단", "구호물자", "실제 대피는 아직 미지급", "동일본 대지진")

surface380 = chapter_surface(chapter_by_sequence.fetch(380))
must_include(surface380, "seq380", "110", "105", "25%", "전액 회수")

surface382 = chapter_surface(chapter_by_sequence.fetch(382))
must_include(surface382, "seq382", "체셔피크", "헤스", "가이아나", "500억 달러", "30%", "60%")

surface482 = chapter_surface(chapter_by_sequence.fetch(482))
must_include(surface482, "seq482", "5% 금리", "600만 파운드", "지시", "실제 채권")
must_include(pace_by_sequence.fetch(482).fetch("pacing_note"), "seq482 note", "한 장도 확보되지")

surface488 = chapter_surface(chapter_by_sequence.fetch(488))
must_include(surface488, "seq488", "3%", "8%", "약 10%", "25%", "40%", "50%")
must_include(chapter_by_sequence.fetch(488).fetch("paid_reward"), "seq488 paid_reward", "통제권은 아직 없다")

surface495 = chapter_surface(chapter_by_sequence.fetch(495))
must_include(surface495, "seq495", "5년", "말합의", "세부계약", "미지급")

surface513 = chapter_surface(chapter_by_sequence.fetch(513))
must_include(surface513, "seq513", "최소 50%", "구형 노광장비", "2년", "악성재고", "HBM 5배")
surface514 = chapter_surface(chapter_by_sequence.fetch(514))
must_include(surface514, "seq514", "곡물·농지", "밀", "1,000억 달러", "ASML", "직접 협상")
surface515 = chapter_surface(chapter_by_sequence.fetch(515))
must_include(surface515, "seq515", "피터슨", "EUV", "50%", "70%", "DUV", "증설비")
surface516 = chapter_surface(chapter_by_sequence.fetch(516))
must_include(surface516, "seq516", "구형 반도체 단지", "ASML 5년", "10조 원", "곡물", "농지", "28GHz", "스타링크")

surface654 = chapter_surface(chapter_by_sequence.fetch(654))
must_include(surface654, "seq654", "SVB", "모든 지분·경영권", "뱅크런 없음", "예치금", "주가", "1면", "직거래")

surface660 = chapter_surface(chapter_by_sequence.fetch(660))
must_include(surface660, "seq660", "폴란드 20조 원", "체코 원전", "로나 99% 폭락", "미지급")
surface661 = chapter_surface(chapter_by_sequence.fetch(661))
must_include(surface661, "seq661", "85달러", "0.003달러", "99% 폭락", "최소 300억 달러", "베릴")
surface662 = chapter_surface(chapter_by_sequence.fetch(662))
must_include(surface662, "seq662", "동남아", "농산물", "팜유", "한국 수출예외")

surface745 = chapter_surface(chapter_by_sequence.fetch(745)) + " " + pace_by_sequence.fetch(745).fetch("pacing_note")
must_include(surface745, "seq745", "할아버지", "손자")
must_exclude(surface745, "seq745", "아버지가 아들의")
fail_check("seq745 father/son wording") if surface745.match?(/(?<!할)아버지의 능력/)

surface749 = chapter_surface(chapter_by_sequence.fetch(749)) + " " + pace_by_sequence.fetch(749).fetch("pacing_note")
must_include(surface749, "seq749", "AI", "코로나 치료제", "희귀질병 치료제", "노벨 화학상")
must_exclude(chapter_by_sequence.fetch(749).fetch("paid_reward"), "seq749 paid_reward", "고체배터리")

surface751 = chapter_surface(chapter_by_sequence.fetch(751)) + " " + pace_by_sequence.fetch(751).fetch("pacing_note")
must_include(surface751, "seq751", "할아버지", "손자", "영국행을 포기", "한국", "초음파 사진", "조손 화해")
must_exclude(surface751, "seq751", "아들의 손", "지키려던 아버지", "부자화해", "김태중의 귀환")

arc_649 = arcs.find { |row| row.fetch("start_sequence") == "649" }
arc_655 = arcs.find { |row| row.fetch("start_sequence") == "655" }
arc_662 = arcs.find { |row| row.fetch("start_sequence") == "662" }
fail_check("649~654 ownership") unless arc_649 && arc_649.fetch("end_sequence") == "654"
fail_check("655~661 ownership") unless arc_655 && arc_655.fetch("end_sequence") == "661"
fail_check("662 ownership") unless arc_662 && arc_662.fetch("end_sequence") == "662"

derived_counts = {
  "pacing-all-evidence.csv" => 751,
  "chapter-narrative-boundary-audit-001-751.csv" => 8261,
  "current-fact-omission-audit-297-fields.csv" => 297,
  "current-fact-omission-audit-102-sequences.csv" => 102,
  "pacing-rejudgment-ledger-001-751.csv" => 751,
  "manual-pacing-prose-ledger-119.csv" => 119
}
derived_counts.each do |name, expected|
  rows = csv_rows(File.join(stage, "derived", name))
  fail_check("#{name} rows #{rows.length}") unless rows.length == expected
end

evidence = csv_rows(File.join(stage, "derived", "pacing-all-evidence.csv"))
high = csv_rows(File.join(stage, "derived", "high-score-and-relationship-evidence.csv"))
expected_high = evidence.count do |row|
  SCORE_FIELDS.map { |field| row.fetch(field).to_i }.max >= 9 || row.fetch("relationship_weight").to_f >= 0.30
end
fail_check("high evidence rows #{high.length}/#{expected_high}") unless high.length == expected_high

template_phrases = ["독자는", "실제 지급은 다음에 한정된다", "가장 오래 머문다"]
template_phrases.each do |phrase|
  count = pacing.count { |row| row.fetch("pacing_note").include?(phrase) }
  fail_check("template phrase #{phrase}=#{count}") unless count.zero?
end

minimum_sizes = {
  "project_bible.md" => 8_000,
  "arc_atlas.md" => 15_000,
  "inkos_usage_and_gap_report.md" => 6_000,
  "free_improvements_report.md" => 4_000,
  "completion_receipt.md" => 800
}
minimum_sizes.each do |name, minimum|
  size = File.size(File.join(stage, name))
  fail_check("#{name} size #{size}") unless size >= minimum
end

atlas = File.read(File.join(stage, "arc_atlas.md"))
bible = File.read(File.join(stage, "project_bible.md"))
receipt = File.read(File.join(stage, "completion_receipt.md"))
fail_check("atlas headings") unless atlas.scan(/^## \d{3} · DCA-/).length == 131
must_include(bible, "bible finale", "할아버지", "AI 코로나 치료제", "희귀질병 치료제", "조손 화해")
must_include(receipt, "receipt status", "STAGE_READY", "AWAITING_MANAGER_SCRIPT_AND_STAGE_APPROVAL", "canonical 적용", "하지 않음")

source_receipt = JSON.parse(File.read(File.join(stage, "source_receipt.json")))
fail_check("source receipt SHA") unless source_receipt.fetch("sourceSha256") == "66f3e7df3123343c14a7134108dc59940511f40372493a549cba8ae709df4b45"
fail_check("source receipt marker") unless source_receipt.fetch("markerCount") == 751
fail_check("source receipt coverage") unless source_receipt.fetch("analysisCoverage") == "full"

puts "PASS stage-validator: arcs=#{arcs.length} chapters=#{chapters.length} pacing=#{pacing.length} evidence=#{evidence.length} high=#{high.length}"
puts "PASS coverage=1..751 gap=0 overlap=0 ribbons=ratio-sum1 template-count=0"
puts "PASS semantic-fixed=15,50,192,194,246,259,264,335,380,382,482,488,495,513-516,654,660-662,745,749,751"
