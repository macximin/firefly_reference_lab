#!/usr/bin/env ruby

require "csv"

ROOT = File.expand_path("..", __dir__)
WORK = __dir__

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

def read_rows(path, header)
  table = CSV.read(path, headers: true)
  raise "header mismatch: #{path}" unless table.headers == header
  table.map(&:to_h)
end

def write_rows(path, header, rows)
  CSV.open(path, "w", write_headers: true, headers: header) do |csv|
    rows.each { |row| csv << header.map { |key| row.fetch(key) } }
  end
end

chapter_files = %w[
  chapter_map_001_150.csv
  chapter_map_151_250.csv
  chapter_map_251_500.csv
  chapter_map_501_751.csv
]
pacing_files = %w[
  arc_pacing_001_150.csv
  arc_pacing_151_250.csv
  arc_pacing_251_500.csv
  arc_pacing_501_751.csv
]
arc_files = %w[
  arc_map_001_150.csv
  arc_map_151_250.csv
  arc_map_251_500.csv
  arc_map_501_751.csv
]
section_files = %w[
  arc_sections_001_150.md
  arc_sections_151_250.md
  arc_sections_251_500.md
  arc_sections_501_751.md
]

chapters = chapter_files.flat_map { |name| read_rows(File.join(WORK, name), CHAPTER_HEADER) }
pacing = pacing_files.flat_map { |name| read_rows(File.join(WORK, name), PACING_HEADER) }
arcs = arc_files.flat_map { |name| read_rows(File.join(WORK, name), ARC_HEADER) }

confidence_value = lambda do |value|
  case value.to_s.strip.downcase
  when "high" then "0.95"
  when "medium" then "0.75"
  when "low" then "0.55"
  else value.to_s
  end
end
chapters.each { |row| row["confidence"] = confidence_value.call(row.fetch("confidence")) }
arcs.each { |row| row["confidence"] = confidence_value.call(row.fetch("confidence")) }

# The final segment's source-derived hooks already name the next concrete act.
# Drop the draft-only generic suffix so that the hook itself, not a functional
# label, closes each row.
chapters.each do |row|
  row["ending_hook"] = row.fetch("ending_hook").sub(/ 문제로 이어진다\z/, "")
end

# A Story Arc can share one pressure or promise across several episodes, but the
# observed state delta must still name the episode's actual before/after surface.
state_change_counts = chapters.map { |row| row.fetch("state_change") }.group_by { |value| value }
chapters.each do |row|
  next unless state_change_counts.fetch(row.fetch("state_change")).length > 1
  row["state_change"] = "#{row.fetch('entry_state')} → #{row.fetch('paid_reward')}"
end

# The source split at 250/251 is not a story boundary. The first-segment worker
# assigns 247-250 to S2-A01 so the second segment can extend it through 253.
# Likewise, the 500/501 split is merged only when the second-segment final Arc
# explicitly uses S3-A01. Duplicate Arc rows are collapsed after range extension.
arcs = arcs.group_by { |row| row.fetch("arc_id") }.map do |arc_id, group|
  if group.length == 1
    group.first
  else
    ordered = group.sort_by { |row| row.fetch("start_sequence").to_i }
    first = ordered.first.dup
    last = ordered.last
    first["start_sequence"] = ordered.map { |row| row.fetch("start_sequence").to_i }.min.to_s
    first["end_sequence"] = ordered.map { |row| row.fetch("end_sequence").to_i }.max.to_s
    first["start_label"] = ordered.min_by { |row| row.fetch("start_sequence").to_i }.fetch("start_label")
    first["end_label"] = ordered.max_by { |row| row.fetch("end_sequence").to_i }.fetch("end_label")
    first["episode_count"] = (first.fetch("end_sequence").to_i - first.fetch("start_sequence").to_i + 1).to_s
    %w[
      main_characters main_locations concrete_premise central_question promise
      pressure_escalation mid_turn concrete_payoff relationship_change
      status_or_ability_change residual_cost next_arc_bridge boundary_signals
    ].each do |field|
      first[field] = ordered.map { |row| row.fetch(field) }.reject(&:empty?).uniq.join(" / ")
    end
    first["confidence"] = ordered.map { |row| confidence_value.call(row.fetch("confidence")).to_f }.min.to_s
    first
  end
end.sort_by { |row| row.fetch("start_sequence").to_i }

write_rows(File.join(ROOT, "chapter_map.csv"), CHAPTER_HEADER, chapters)
write_rows(File.join(ROOT, "arc_pacing.csv"), PACING_HEADER, pacing)
write_rows(File.join(ROOT, "arc_map.csv"), ARC_HEADER, arcs)

atlas_path = File.join(ROOT, "arc_atlas.md")
atlas = File.read(atlas_path)
start_marker = "<!-- GENERATED_ARC_CONTENT_START -->"
end_marker = "<!-- GENERATED_ARC_CONTENT_END -->"
raise "atlas markers missing" unless atlas.include?(start_marker) && atlas.include?(end_marker)

generated = section_files.map do |name|
  body = File.read(File.join(WORK, name))
  body = body.sub(/\A# .*?\n+## 사용 기준\n.*?(?=\n## )/m, "")
  # Fragment bullets preserve the source's mixed visible labels (for example,
  # `239` and `244화`). The atlas is a reading surface, so normalize only its
  # bullet prefix while chapter_map.csv retains the exact source label.
  body = body.gsub(/^- (\d+)(?:화)? ·/, '- \1화 ·')
  body = body.gsub(/ 문제로 이어진다$/, "")
  body.strip
end.join("\n\n")

pacing_by_arc = pacing.group_by { |row| row.fetch("arc_id") }
pacing_table = []
pacing_table << "## Arc별 페이싱 표"
pacing_table << ""
pacing_table << "점수는 해당 Arc 안에서 원고 장면의 상대 강도를 1~10으로 판정한 값이다. 평균만으로 결산을 판단하지 않고, 화별 비트와 최대 강도 회차를 함께 읽는다."
pacing_table << ""
pacing_table << "| Arc | 범위 | 주요 단계 흐름 | 평균 긴장 | 평균 보상 | 평균 훅 | 최대 합산 회차 |"
pacing_table << "| --- | ---: | --- | ---: | ---: | ---: | ---: |"
arcs.each do |arc|
  rows = pacing_by_arc.fetch(arc.fetch("arc_id"))
  phases = rows.map { |row| row.fetch("arc_phase") }.chunk_while { |a, b| a == b }.map(&:first)
  averages = %w[tension_1_10 reward_1_10 hook_1_10].map do |field|
    rows.sum { |row| row.fetch(field).to_f } / rows.length
  end
  peak = rows.max_by do |row|
    row.fetch("tension_1_10").to_f + row.fetch("reward_1_10").to_f + row.fetch("hook_1_10").to_f
  end
  pacing_table << format(
    "| %s · %s | %s~%s | %s | %.1f | %.1f | %.1f | %s |",
    arc.fetch("arc_id"), arc.fetch("arc_name"), arc.fetch("start_sequence"),
    arc.fetch("end_sequence"), phases.join(" → "), averages[0], averages[1],
    averages[2], peak.fetch("sequence")
  )
end
generated = "#{generated}\n\n#{pacing_table.join("\n")}"

atlas = atlas.sub(
  /#{Regexp.escape(start_marker)}.*?#{Regexp.escape(end_marker)}/m,
  "#{start_marker}\n\n#{generated}\n\n#{end_marker}"
)
File.write(atlas_path, atlas)

puts "chapter_rows=#{chapters.length}"
puts "pacing_rows=#{pacing.length}"
puts "arc_rows=#{arcs.length}"
