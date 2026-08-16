#!/usr/bin/env ruby

require "csv"
require "digest"
require "json"
require "rbconfig"

REPO = File.expand_path("../../../..", __dir__)
ANALYSIS = File.expand_path("../..", __dir__)
REWORK = __dir__

EXPECTED = {
  source: "66f3e7df3123343c14a7134108dc59940511f40372493a549cba8ae709df4b45",
  archive: "30de704f3dfc5cbbec4c88129d41684e08d452d9bf384fd30ffd4a91bc5e2d33",
  manifest: "1ee55e2586052ef89371fb7c87535674e1449c2c01276fee365ceb0dbfd98e11"
}.freeze

SOURCE = File.join(REPO, "private_sources/korean_webnovel_corpus/서오/독식하는 재벌 3세_서오_합본.txt")
ARCHIVE = File.join(REPO, "exports/checkpoints/2026-08-13-doksik-pre-rework.tar.gz")
MANIFEST = File.join(REPO, "exports/checkpoints/2026-08-13-doksik-pre-rework-files.sha256")

def assert(condition, message)
  raise message unless condition
end

def sha(path)
  Digest::SHA256.file(path).hexdigest
end

assert(sha(SOURCE) == EXPECTED.fetch(:source), "source hash mismatch")
assert(sha(ARCHIVE) == EXPECTED.fetch(:archive), "archive hash mismatch")
assert(sha(MANIFEST) == EXPECTED.fetch(:manifest), "manifest hash mismatch")

source_lines = File.readlines(SOURCE, chomp: true)
markers = source_lines.each_index.select { |index| source_lines[index].start_with?("ⓚ") }
assert(markers.length == 751, "marker count #{markers.length}")

chapter = CSV.read(File.join(ANALYSIS, "chapter_map.csv"), headers: true)
arcs = CSV.read(File.join(ANALYSIS, "arc_map.csv"), headers: true)
pacing = CSV.read(File.join(ANALYSIS, "arc_pacing.csv"), headers: true)
evidence = CSV.read(File.join(REWORK, "pacing/pacing-all-evidence.csv"), headers: true)
high = CSV.read(File.join(REWORK, "high-score-and-relationship-evidence.csv"), headers: true)

assert(chapter.length == 751, "chapter rows #{chapter.length}")
assert(pacing.length == 751, "pacing rows #{pacing.length}")
assert(evidence.length == 751, "evidence rows #{evidence.length}")
assert(arcs.length == 74, "arc rows #{arcs.length}")

arc_for = {}
expected_start = 1
arcs.each_with_index do |arc, index|
  start_seq = arc["start_sequence"].to_i
  end_seq = arc["end_sequence"].to_i
  assert(start_seq == expected_start, "arc gap #{expected_start}->#{start_seq}")
  assert(arc["arc_id"] == format("DCA-N%02d", index + 1), "arc id #{arc['arc_id']}")
  assert(arc["episode_count"].to_i == end_seq - start_seq + 1, "episode count #{arc['arc_id']}")
  (start_seq..end_seq).each { |sequence| arc_for[sequence] = arc["arc_id"] }
  expected_start = end_seq + 1
end
assert(expected_start == 752, "coverage ends #{expected_start - 1}")

arc_narrative_fields = %w[
  arc_name concrete_premise central_question promise pressure_escalation mid_turn
  concrete_payoff relationship_change status_or_ability_change residual_cost
  next_arc_bridge boundary_signals
]
arc_narrative_fields.each do |field|
  values = arcs.map { |arc| arc[field].to_s.strip }
  assert(values.none?(&:empty?), "blank arc field #{field}")
  assert(values.uniq.length == values.length, "duplicated arc prose #{field}")
end
assert(arcs.none? { |arc| arc["concrete_premise"].include?("핵심 물건은") }, "template arc premise remains")
assert(arcs.none? { |arc| arc["promise"].include?("실제 계약·소유·직책·목격자 반응") }, "template arc promise remains")

weights = %w[information_weight action_weight relationship_weight emotion_weight material_or_status_weight]
chapter.each_with_index do |row, index|
  sequence = index + 1
  assert(row["sequence"].to_i == sequence, "chapter order #{sequence}")
  assert(row["arc_id"] == arc_for.fetch(sequence), "chapter arc #{sequence}")
  marker_line = markers[index] + 1
  next_marker_line = index + 1 < markers.length ? markers[index + 1] : source_lines.length
  assert(row["start_line"].to_i == marker_line, "chapter start line #{sequence}: #{row['start_line']} != #{marker_line}")
  assert(row["end_line"].to_i == next_marker_line, "chapter end line #{sequence}: #{row['end_line']} != #{next_marker_line}")
end

chapter_surface = lambda do |sequence, fields = nil|
  row = chapter[sequence - 1]
  selected = fields || row.headers
  selected.map { |field| row[field].to_s }.join(" ")
end

{
  153 => ["제임스 힌톤"],
  182 => ["100억", "2천억"],
  193 => ["추영택"],
  214 => ["씽크윈"],
  215 => ["씽크윈", "기술·데이터", "개발"],
  221 => ["태우맵", "10만"],
  230 => ["4조", "6조1705억"],
  231 => ["4조"],
  553 => ["다이아 프린스"],
  585 => ["밥 스웬"],
  598 => ["스티븐 허블"],
  610 => ["미아인"],
  611 => ["즈엉 미아인"],
  665 => ["미국 농업 연맹"],
  685 => ["한아약품"],
  738 => ["콜로노이"]
}.each do |sequence, required_surfaces|
  text = chapter_surface.call(sequence)
  required_surfaces.each do |surface|
    assert(text.include?(surface), "missing source surface #{sequence}: #{surface}")
  end
end

chapter_400_payment = chapter_surface.call(400, %w[action turn_or_reveal paid_reward])
assert(chapter_400_payment.include?("매각안") || chapter_400_payment.include?("협상"), "400 missing pre-signature state")
assert(!chapter_400_payment.include?("서명"), "400 pulls 401 signature forward")
assert(chapter_surface.call(401).include?("서명"), "401 missing actual signature")
chapter_500_payment = chapter_surface.call(500, %w[action turn_or_reveal paid_reward])
assert(chapter_500_payment.include?("명단"), "500 missing supplier-list promise")
assert(!chapter_500_payment.include?("업체 매입"), "500 pulls 501 acquisition forward")
assert(chapter_surface.call(501, %w[action]).include?("매입"), "501 missing actual acquisition instruction")

pacing.each_with_index do |row, index|
  sequence = index + 1
  assert(row["sequence"].to_i == sequence, "pacing order #{sequence}")
  assert(row["arc_id"] == arc_for.fetch(sequence), "pacing arc #{sequence}")
  %w[tension_1_10 reward_1_10 hook_1_10].each do |field|
    score = row[field].to_i
    assert(row[field] == score.to_s && score.between?(1, 10), "score #{sequence} #{field}")
  end
  values = weights.map { |field| Float(row[field]) }
  assert(values.all? { |value| value.between?(0.0, 1.0) }, "weight range #{sequence}")
  assert((values.inject(0.0, :+) - 1.0).abs <= 0.01, "weight sum #{sequence}")
end


authored_sequences = {}
Dir[File.join(REWORK, "final_parts/chapter-map-*.csv")].sort.each do |path|
  CSV.foreach(path, headers: true) do |row|
    sequence = row["sequence"].to_i
    assert(!authored_sequences.key?(sequence), "duplicate authored chapter #{sequence}")
    authored_sequences[sequence] = path
  end
end
pacing_by_sequence = pacing.to_h { |row| [row["sequence"].to_i, row] }
authored_sequences.each_key do |sequence|
  chapter_row = chapter[sequence - 1]
  expected_event = %w[action turn_or_reveal paid_reward].map { |field| chapter_row[field] }.join("; ")
  actual_event = pacing_by_sequence.fetch(sequence)["concrete_event"]
  assert(actual_event == expected_event, "authored pacing event drift #{sequence}")
end

evidence.each_with_index do |row, index|
  sequence = index + 1
  chapter_row = chapter[index]
  assert(row["sequence"].to_i == sequence, "evidence order #{sequence}")
  assert(row["arc_id"] == arc_for.fetch(sequence), "evidence arc #{sequence}")
  expected_lines = "L#{chapter_row['start_line']}-L#{chapter_row['end_line']}"
  normalized = row["source_lines"].to_s.tr("~", "-")
  assert(normalized == expected_lines, "evidence line #{sequence}: #{row['source_lines']} != #{expected_lines}")
end

expected_high = evidence.select do |row|
  %w[tension_1_10 reward_1_10 hook_1_10].map { |field| row[field].to_i }.max >= 9 || row["relationship_weight"].to_f >= 0.30
end
assert(high.length == expected_high.length, "high evidence rows #{high.length} != #{expected_high.length}")

atlas = File.read(File.join(ANALYSIS, "arc_atlas.md"))
arcs.each do |arc|
  assert(atlas.include?("## #{arc['arc_id']} ·"), "atlas missing #{arc['arc_id']}")
end
assert(atlas.scan(/^### 회차별 장면·리본$/).length == arcs.length, "atlas arc section count")
assert(atlas.scan(/^- \*\*[^*]+\*\* ·/).length == 751, "atlas episode bullet count")

%w[
  project_bible.md arc_atlas.md inkos_usage_and_gap_report.md
  free_improvements_report.md completion_receipt.md
].each do |name|
  assert(File.size(File.join(ANALYSIS, name)) > 0, "empty #{name}")
end

semantic_lint = File.join(REWORK, "qa_chapter_semantics.rb")
assert(system(RbConfig.ruby, semantic_lint, File.join(ANALYSIS, "chapter_map.csv")), "chapter semantic lint failed")

generated_text = %w[arc_map.csv chapter_map.csv arc_pacing.csv arc_atlas.md].map do |name|
  File.read(File.join(ANALYSIS, name))
end.join("\n")
{
  "제프리 힌톤" => "153화 인물명",
  "캐나다 힌톤 연구실" => "153화 장소",
  "1천억 선거자금" => "182화 정치자금",
  "추가영" => "192~193화 가해자 이름",
  "팅크웨어" => "214~215화 회사명",
  "스톡옵션" => "215화 계약조건",
  "강인택시" => "222~226화 회사명",
  "먀인" => "610~611화 베트남 인물명",
  "다이아몬드 프린세스" => "553화 크루즈명",
  "밥 스완" => "585화 인텔 인물명",
  "스티브 허블" => "598화 제약협회 인물명",
  "팜뷰로" => "665화 미국 농업 단체명",
  "팜뷰" => "665화 미국 농업 단체명",
  "하나제약" => "685~687화 제약사명",
  "콜로모이스키" => "738화 우크라이나 인물명",
  "센추리온" => "296~308화 제약사명"
}.each do |bad_text, label|
  assert(!generated_text.include?(bad_text), "stale fact #{label}: #{bad_text}")
end

arc_ranges = arcs.map { |row| [row["start_sequence"].to_i, row["end_sequence"].to_i] }
assert(arc_ranges.include?([216, 221]), "missing natural boundary 216~221")
assert(arc_ranges.include?([222, 226]), "missing natural boundary 222~226")

puts "PASS source_sha=#{EXPECTED.fetch(:source)} markers=#{markers.length}"
puts "PASS archive_sha=#{EXPECTED.fetch(:archive)} manifest_sha=#{EXPECTED.fetch(:manifest)}"
puts "PASS arcs=#{arcs.length} chapters=#{chapter.length} pacing=#{pacing.length} evidence=#{evidence.length} high_or_relation=#{high.length}"
