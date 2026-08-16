#!/usr/bin/env ruby

require "csv"
require "digest"
require "json"

ROOT = File.expand_path("..", __dir__)
SOURCE = File.expand_path(
  "../../private_sources/korean_webnovel_corpus/서오/독식하는 재벌 3세_서오_합본.txt",
  ROOT
)
EXPECTED_SHA = "66f3e7df3123343c14a7134108dc59940511f40372493a549cba8ae709df4b45"

CHAPTER_HEADER = %w[
  sequence visible_label title start_line end_line entry_state reader_promise
  protagonist_goal action resistance_or_cost turn_or_reveal paid_reward
  state_change_axis state_change ending_hook closed_loops opened_loops arc_id
  confidence
].freeze
PACING_HEADER = %w[
  sequence visible_label arc_id arc_phase concrete_event tension_1_10
  reward_1_10 hook_1_10 information_weight action_weight relationship_weight
  emotion_weight material_or_status_weight pacing_note
].freeze
ARC_HEADER = %w[
  arc_id arc_name start_sequence end_sequence start_label end_label episode_count
  main_characters main_locations concrete_premise central_question promise
  pressure_escalation mid_turn concrete_payoff relationship_change
  status_or_ability_change residual_cost next_arc_bridge boundary_signals confidence
].freeze

failures = []
check = lambda do |condition, message|
  failures << message unless condition
end

receipt = JSON.parse(File.read(File.join(ROOT, "source_receipt.json")))
sha = Digest::SHA256.file(SOURCE).hexdigest
check.call(sha == EXPECTED_SHA, "source SHA mismatch")
check.call(receipt.fetch("sourceSha256") == sha, "receipt SHA mismatch")

lines = File.readlines(SOURCE, chomp: true)
markers = []
lines.each_with_index do |line, index|
  next unless line.start_with?("ⓚ")
  match = line.match(/\Aⓚ(\d+)(화)?(?:\.|\s)\s*(.*?)\s*\z/)
  unless match
    failures << "unparsed marker at line #{index + 1}: #{line}"
    next
  end
  visible = "#{match[1]}#{match[2]}"
  markers << {
    "sequence" => markers.length + 1,
    "visible_label" => visible,
    # Two source markers (356 and 357) end in U+00A0. Preserve the marker and
    # line boundary, but compare the human-visible title after terminal-space
    # normalization; chapter_map records no invisible title suffix.
    "title" => match[3].sub(/[\s\u00A0]+\z/, ""),
    "start_line" => index + 1
  }
end
markers.each_with_index do |marker, index|
  marker["end_line"] = index + 1 < markers.length ? markers[index + 1]["start_line"] - 1 : lines.length
end
check.call(markers.length == 751, "source marker count #{markers.length}, expected 751")
check.call(markers.map { |m| m.fetch("visible_label").to_i } == (1..751).to_a, "visible numbers not 1..751")

chapter = CSV.read(File.join(ROOT, "chapter_map.csv"), headers: true)
pacing = CSV.read(File.join(ROOT, "arc_pacing.csv"), headers: true)
arcs = CSV.read(File.join(ROOT, "arc_map.csv"), headers: true)
check.call(chapter.headers == CHAPTER_HEADER, "chapter header mismatch")
check.call(pacing.headers == PACING_HEADER, "pacing header mismatch")
check.call(arcs.headers == ARC_HEADER, "arc header mismatch")
check.call(chapter.length == 751, "chapter rows #{chapter.length}, expected 751")
check.call(pacing.length == 751, "pacing rows #{pacing.length}, expected 751")
check.call(arcs.length == 97, "Arc rows #{arcs.length}, expected 97")

chapter.each_with_index do |row, index|
  marker = markers[index]
  sequence = index + 1
  check.call(row["sequence"].to_i == sequence, "chapter sequence mismatch at #{sequence}")
  check.call(row["visible_label"] == marker["visible_label"], "visible label mismatch at #{sequence}: #{row['visible_label']} != #{marker['visible_label']}")
  check.call(row["title"] == marker["title"], "title mismatch at #{sequence}: #{row['title']} != #{marker['title']}")
  check.call(row["start_line"].to_i == marker["start_line"], "start line mismatch at #{sequence}")
  check.call(row["end_line"].to_i == marker["end_line"], "end line mismatch at #{sequence}")
  CHAPTER_HEADER.each { |field| check.call(!row[field].to_s.strip.empty?, "blank chapter #{field} at #{sequence}") }
  confidence = row["confidence"].to_f
  check.call(confidence.positive? && confidence <= 1.0, "chapter confidence #{row['confidence']} at #{sequence}")

  pacing_row = pacing[index]
  check.call(pacing_row["sequence"] == row["sequence"], "pacing sequence mismatch at #{sequence}")
  check.call(pacing_row["visible_label"] == row["visible_label"], "pacing label mismatch at #{sequence}")
  check.call(pacing_row["arc_id"] == row["arc_id"], "pacing arc mismatch at #{sequence}")
  PACING_HEADER.each { |field| check.call(!pacing_row[field].to_s.strip.empty?, "blank pacing #{field} at #{sequence}") }
  %w[tension_1_10 reward_1_10 hook_1_10].each do |field|
    value = pacing_row[field].to_i
    check.call((1..10).cover?(value), "pacing #{field}=#{pacing_row[field]} at #{sequence}")
  end
end

coverage = []
seen_arc_ids = {}
arcs.each_with_index do |row, index|
  start_sequence = row["start_sequence"].to_i
  end_sequence = row["end_sequence"].to_i
  check.call(start_sequence <= end_sequence, "reversed Arc #{row['arc_id']}")
  check.call(row["episode_count"].to_i == end_sequence - start_sequence + 1, "episode_count mismatch #{row['arc_id']}")
  check.call(!seen_arc_ids.key?(row["arc_id"]), "duplicate Arc row #{row['arc_id']}")
  seen_arc_ids[row["arc_id"]] = true
  ARC_HEADER.each { |field| check.call(!row[field].to_s.strip.empty?, "blank Arc #{field} at #{row['arc_id']}") }
  arc_confidence = row["confidence"].to_f
  check.call(arc_confidence.positive? && arc_confidence <= 1.0, "Arc confidence #{row['confidence']} at #{row['arc_id']}")
  check.call(row["arc_name"] !~ /\A(?:S\d|Arc|구간)/, "non-event Arc name at #{row['arc_id']}")
  %w[main_characters main_locations concrete_premise concrete_payoff next_arc_bridge].each do |field|
    check.call(row[field].to_s.length >= 8, "thin Arc surface #{field} at #{row['arc_id']}")
  end
  signal_count = row["boundary_signals"].split(/[;·\/]/).map(&:strip).reject(&:empty?).length
  check.call(signal_count >= 2, "fewer than two boundary signals at #{row['arc_id']}")
  coverage.concat((start_sequence..end_sequence).to_a)
  range_rows = chapter[(start_sequence - 1)..(end_sequence - 1)] || []
  check.call(range_rows.all? { |episode| episode["arc_id"] == row["arc_id"] }, "chapter Arc range mismatch #{row['arc_id']}")
  chapter_arc_count = chapter.count { |episode| episode["arc_id"] == row["arc_id"] }
  check.call(chapter_arc_count == range_rows.length, "non-contiguous chapter Arc id #{row['arc_id']}")
  if index.positive?
    previous = arcs[index - 1]
    check.call(previous["end_sequence"].to_i + 1 == start_sequence, "Arc gap/overlap before #{row['arc_id']}")
  end
end
check.call(coverage == (1..751).to_a, "Arc coverage not exact 1..751")

required = %w[
  source_receipt.json chapter_map.csv project_bible.md arc_map.csv arc_pacing.csv
  arc_atlas.md inkos_usage_and_gap_report.md free_improvements_report.md
  completion_receipt.md
]
required.each do |name|
  path = File.join(ROOT, name)
  check.call(File.file?(path) && File.size(path).positive?, "missing or empty #{name}")
end
analysis_files = Dir.glob(File.join(ROOT, "*.{md,csv,json}"))
analysis_files.each do |path|
  content = File.read(path)
  check.call(!content.include?("다이몬"), "surface typo 다이몬 in #{File.basename(path)}")
end

atlas = File.read(File.join(ROOT, "arc_atlas.md"))
arc_ids = arcs.map { |row| row["arc_id"] }
arc_ids.each { |arc_id| check.call(atlas.include?("## #{arc_id} ·"), "atlas missing #{arc_id}") }
atlas_episodes = atlas.scan(/^- (\d+)화 ·/).flatten.map(&:to_i)
check.call(atlas_episodes.length == 751, "atlas episode beats #{atlas_episodes.length}, expected 751")
check.call(atlas_episodes.uniq.sort == (1..751).to_a, "atlas episode beat coverage mismatch")

if failures.empty?
  puts "PASS"
  puts "sha256=#{sha}"
  puts "markers=#{markers.length}"
  puts "chapter_rows=#{chapter.length}"
  puts "arc_rows=#{arcs.length}"
  puts "pacing_rows=#{pacing.length}"
  puts "atlas_episode_beats=#{atlas_episodes.length}"
else
  warn failures.uniq.join("\n")
  exit 1
end
