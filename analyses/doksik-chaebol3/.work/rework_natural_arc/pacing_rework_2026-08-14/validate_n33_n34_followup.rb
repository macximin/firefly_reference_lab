#!/usr/bin/env ruby
# frozen_string_literal: true

require "csv"
require "digest"

WORK = __dir__
ANALYSIS = File.expand_path("../../..", WORK)
ROOT = File.expand_path("../..", ANALYSIS)
SOURCE = File.join(ROOT, "private_sources/korean_webnovel_corpus/서오/독식하는 재벌 3세_서오_합본.txt")
REWORK = File.join(ANALYSIS, ".work/rework_natural_arc")
SAMPLE = File.join(REWORK, "reviews/pacing-rework-sample-recheck-2026-08-14.md")
REPORT = File.join(REWORK, "reviews/manager-followup-n33-n34-2026-08-14.md")

EXPECTED_SOURCE_SHA = "66f3e7df3123343c14a7134108dc59940511f40372493a549cba8ae709df4b45"
EXPECTED_ARCS = {
  "DCA-N33" => [357, 369], "DCA-N33B" => [370, 373],
  "DCA-N33C" => [374, 377], "DCA-N33D" => [378, 380],
  "DCA-N34" => [381, 396], "DCA-N34B" => [397, 399],
  "DCA-N34C" => [400, 401]
}.freeze
EXPECTED_LONG_ARCS = [
  ["DCA-N03", 32, 52, 21],
  ["DCA-N43", 496, 516, 21],
  ["DCA-N44", 517, 540, 24],
  ["DCA-N45", 541, 560, 20]
].freeze

errors = []
check = lambda do |condition, message|
  errors << message unless condition
end

check.call(Digest::SHA256.file(SOURCE).hexdigest == EXPECTED_SOURCE_SHA, "source SHA")
source_lines = File.readlines(SOURCE, chomp: true)
marker_lines = source_lines.each_index.select { |index| source_lines[index].match?(/ⓚ\d/) }.map { |index| index + 1 }
check.call(marker_lines.length == 751, "source markers #{marker_lines.length}")

arcs = CSV.read(File.join(ANALYSIS, "arc_map.csv"), headers: true).map(&:to_h)
chapters = CSV.read(File.join(ANALYSIS, "chapter_map.csv"), headers: true).map(&:to_h)
pacing = CSV.read(File.join(ANALYSIS, "arc_pacing.csv"), headers: true).map(&:to_h)
evidence = CSV.read(File.join(REWORK, "pacing/pacing-all-evidence.csv"), headers: true).map(&:to_h)

check.call(arcs.length == 84, "arc count #{arcs.length}")
check.call(chapters.length == 751, "chapter count #{chapters.length}")
check.call(pacing.length == 751, "pacing count #{pacing.length}")
check.call(evidence.length == 751, "evidence count #{evidence.length}")

arc_by_id = arcs.to_h { |row| [row.fetch("arc_id"), row] }
chapter_by_sequence = chapters.to_h { |row| [row.fetch("sequence").to_i, row] }
pace_by_sequence = pacing.to_h { |row| [row.fetch("sequence").to_i, row] }
evidence_by_sequence = evidence.to_h { |row| [row.fetch("sequence").to_i, row] }

expected_start = 1
arcs.each do |arc|
  first = arc.fetch("start_sequence").to_i
  last = arc.fetch("end_sequence").to_i
  check.call(first == expected_start, "coverage before #{arc.fetch('arc_id')}")
  check.call(arc.fetch("episode_count").to_i == last - first + 1, "episode count #{arc.fetch('arc_id')}")
  check.call(arc.fetch("boundary_signals").length >= 50, "thin boundary evidence #{arc.fetch('arc_id')}")
  (first..last).each do |sequence|
    ids = [chapter_by_sequence.fetch(sequence), pace_by_sequence.fetch(sequence), evidence_by_sequence.fetch(sequence)].map { |row| row.fetch("arc_id") }
    check.call(ids.uniq == [arc.fetch("arc_id")], "arc id sync #{sequence}: #{ids.inspect}")
    check.call(!pace_by_sequence.fetch(sequence).fetch("arc_phase").strip.empty?, "blank pacing phase #{sequence}")
    check.call(pace_by_sequence.fetch(sequence).fetch("arc_phase") == evidence_by_sequence.fetch(sequence).fetch("arc_phase"), "phase sync #{sequence}")
  end
  expected_start = last + 1
end
check.call(expected_start == 752, "coverage end #{expected_start - 1}")

EXPECTED_ARCS.each do |id, range|
  arc = arc_by_id[id]
  actual = arc && [arc.fetch("start_sequence").to_i, arc.fetch("end_sequence").to_i]
  check.call(actual == range, "mapping #{id}: #{actual.inspect}")
end

{
  "DCA-N33" => ["368/369", "369/370"],
  "DCA-N33B" => ["373/374"],
  "DCA-N33C" => ["377/378"],
  "DCA-N34" => ["396/397"],
  "DCA-N34B" => ["397/398", "399/400"],
  "DCA-N34C" => ["401/402", "coda"]
}.each do |id, fragments|
  text = [arc_by_id.fetch(id).fetch("next_arc_bridge"), arc_by_id.fetch(id).fetch("boundary_signals")].join(" ")
  fragments.each { |fragment| check.call(text.include?(fragment), "#{id} missing #{fragment}") }
end

check.call(chapter_by_sequence.fetch(368).fetch("arc_id") == "DCA-N33" && chapter_by_sequence.fetch(369).fetch("arc_id") == "DCA-N33", "368/369 split")
check.call(chapter_by_sequence.fetch(397).fetch("arc_id") == "DCA-N34B" && chapter_by_sequence.fetch(398).fetch("arc_id") == "DCA-N34B", "397/398 split")
check.call(chapter_by_sequence.fetch(401).fetch("arc_id") == "DCA-N34C" && chapter_by_sequence.fetch(402).fetch("arc_id") == "DCA-N35", "401/402 ownership")
check.call(chapter_by_sequence.fetch(401).fetch("ending_hook").include?("중국") && !chapter_by_sequence.fetch(401).fetch("paid_reward").match?(/중국.*수익|수익.*중국/), "401 coda/payoff attribution")

weight_fields = %w[information_weight action_weight relationship_weight emotion_weight material_or_status_weight]
pacing.each do |row|
  sequence = row.fetch("sequence").to_i
  weights = weight_fields.map { |field| row.fetch(field).to_f }
  check.call(weights.all? { |value| value.between?(0.0, 1.0) }, "ribbon range #{sequence}")
  check.call((weights.sum - 1.0).abs <= 0.01, "ribbon sum #{sequence}=#{weights.sum}")
end

long_arcs = arcs.map do |arc|
  count = arc.fetch("episode_count").to_i
  [arc.fetch("arc_id"), arc.fetch("start_sequence").to_i, arc.fetch("end_sequence").to_i, count] if count >= 20
end.compact
check.call(long_arcs == EXPECTED_LONG_ARCS, "20+ umbrella set #{long_arcs.inspect}")

fixed_runs = []
index = 0
while index < arcs.length
  finish = index + 1
  finish += 1 while finish < arcs.length && arcs[finish].fetch("episode_count") == arcs[index].fetch("episode_count")
  if finish - index >= 2
    fixed_runs << [arcs[index].fetch("arc_id"), arcs[finish - 1].fetch("arc_id"), arcs[index].fetch("episode_count").to_i, finish - index]
  end
  index = finish
end
check.call(fixed_runs.none? { |_first, _last, _length, count| count >= 4 }, "fixed-length run >=4 #{fixed_runs.inspect}")

check.call(source_lines.fetch(93015 - 1).include?("불화수소에 한해 수출 규제를 풀어"), "N44 L93015 readback")
check.call(source_lines.fetch(93137 - 1).include?("불화수소 문제가 해결"), "N44 L93137 readback")
check.call(source_lines.fetch(93141 - 1).include?("포토레지스트와 폴리이미드 문제가 해결되지 않아"), "N44 L93141 readback")
check.call(source_lines.fetch(93620 - 1).match?(/ⓚ536/), "N44 finance turn marker")
check.call(source_lines.fetch(93776 - 1).match?(/ⓚ537/), "N44 contamination turn marker")
check.call(source_lines.fetch(94341 - 1).include?("폴리이미드 국산화에 성공"), "N44 L94341 readback")
check.call(source_lines.fetch(94370 - 1).include?("오염수 처리 문제"), "N44 L94370 readback")
check.call(source_lines.fetch(94411 - 1).include?("한·일 무역 분쟁"), "N44 L94411 readback")
check.call(source_lines.fetch(94487 - 1).match?(/ⓚ541/), "N44/N45 marker")

counterexamples = File.read(File.join(REWORK, "boundary_counterexamples.md"))
%w[L93014 L93137 L94341 L94369].each do |fragment|
  check.call(counterexamples.include?(fragment), "N44 counterexample missing #{fragment}")
end

sample = File.read(SAMPLE)
base_rows = sample.scan(/^\| (\d+) · /).flatten.map(&:to_i)
role_rows = sample.scan(/^\| (DCA-N(?:33|34)\w*) · (첫|중간|끝|다음 첫) · (\d+) \|/)
check.call(base_rows.length == 42 && base_rows.uniq.length == 42, "base samples #{base_rows.length}/#{base_rows.uniq.length}")
check.call(role_rows.length == 28, "follow-up role samples #{role_rows.length}")
check.call(sample.include?("30/30 PASS") && sample.include?("12/12 PASS") && sample.include?("28/28 PASS"), "sample verdicts")

atlas = File.read(File.join(ANALYSIS, "arc_atlas.md"))
check.call(atlas.include?("자연 NarrativeArc 84개"), "atlas count")
EXPECTED_ARCS.each_key { |id| check.call(atlas.include?("## #{id} ·"), "atlas #{id}") }
check.call(atlas.scan(/^- \*\*[^*]+\*\* · /).length == 751, "atlas chapter count")

%w[project_bible.md inkos_usage_and_gap_report.md free_improvements_report.md completion_receipt.md].each do |name|
  text = File.read(File.join(ANALYSIS, name))
  check.call(text.include?("84"), "#{name} count")
end

if File.exist?(REPORT)
  report = File.read(REPORT)
  check.call(report.include?("AWAITING_MANAGER_APPROVAL"), "follow-up report status")
  check.call(report.include?("DCA-N44") && report.include?("L93137~L93150"), "follow-up report N44 counterexample")
  check.call(report.include?("28/28 PASS"), "follow-up report samples")
end

if errors.empty?
  puts "PASS N33/N34 follow-up: source=751 chapters=751 arcs=84 errors=0"
  puts "20+ umbrellas=#{long_arcs.map { |id, first, last, count| "#{id}:#{first}-#{last}(#{count})" }.join(', ')}"
  puts "fixed-length runs=#{fixed_runs.map { |first, last, length, count| "#{first}..#{last}:#{length}x#{count}" }.join(', ')}; max_run=#{fixed_runs.map(&:last).max || 1}"
  puts "samples=42 base + 28 follow-up roles; N44 counterexample=PASS"
else
  warn "FAIL N33/N34 follow-up errors=#{errors.length}"
  errors.each { |message| warn "- #{message}" }
  exit 1
end
