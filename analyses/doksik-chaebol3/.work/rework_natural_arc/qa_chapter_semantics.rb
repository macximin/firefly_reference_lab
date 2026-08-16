#!/usr/bin/env ruby
# frozen_string_literal: true

require "csv"

analysis = File.expand_path("../..", __dir__)
path = ARGV.fetch(0, File.join(analysis, "chapter_map.csv"))
rows = CSV.read(path, headers: true)

required = %w[
  sequence entry_state reader_promise protagonist_goal action resistance_or_cost
  turn_or_reveal paid_reward state_change ending_hook closed_loops opened_loops
]
abort "missing columns" unless (required - rows.headers).empty?

generic_patterns = {
  "entry_state" => [/\A시작 장면:/, / 상태\z/],
  "protagonist_goal" => [/\A요약 목표:/, /\A이번 화에서 이루려는 구체 결과:/],
  "paid_reward" => [/\A이 화의 부분 지급:/, /\A이 화에서 확정된 지급:/, /\A큰 보상은 미지급[.] 이 화에서는/],
  "state_change" => [/\s→\s/, /주도권이 이 사건으로 .*한 단계 이동한다/],
  "ending_hook" => [/\A현재 화 끝 장면:/, / 문제로 이어진다\z/],
  "closed_loops" => [/\A현재 화에서/, /의 당면 실행(?:·결정)?\z/],
  "opened_loops" => [/\A현재 화 끝에서 다음으로 넘긴 장면·질문:/]
}.freeze

errors = []
rows.each_with_index do |row, index|
  sequence = row["sequence"].to_i
  errors << "sequence order #{index + 1}: #{row['sequence']}" unless sequence == index + 1 || rows.length < 751

  required.drop(1).each do |field|
    value = row[field].to_s.strip
    errors << "#{sequence} blank #{field}" if value.empty?
  end

  {
    "goal=action" => %w[protagonist_goal action],
    "action=turn" => %w[action turn_or_reveal],
    "action=paid" => %w[action paid_reward],
    "turn=paid" => %w[turn_or_reveal paid_reward],
    "hook=open" => %w[ending_hook opened_loops]
  }.each do |label, (left, right)|
    errors << "#{sequence} #{label}" if row[left].to_s.strip == row[right].to_s.strip
  end

  generic_patterns.each do |field, patterns|
    patterns.each do |pattern|
      errors << "#{sequence} formulaic #{field}: #{pattern.inspect}" if pattern.match?(row[field].to_s)
    end
  end

  next_row = rows[index + 1]
  next unless next_row
  next_action = next_row["action"].to_s.strip
  next if next_action.empty?
  %w[ending_hook opened_loops].each do |field|
    value = row[field].to_s.strip
    errors << "#{sequence} #{field} copies next action #{sequence + 1}" if value == next_action || value.include?(next_action)
  end
end

# Three or more byte-identical narrative cells across distinct episodes are a
# strong sign that an Arc template was copied instead of the source scene being
# read back. Two repetitions remain available for genuinely recurring facts.
required.drop(1).each do |field|
  rows.group_by { |row| row[field].to_s.strip }.each do |value, grouped|
    next if value.empty? || grouped.length < 3
    sequences = grouped.map { |row| row["sequence"] }.join(",")
    errors << "duplicate #{field} x#{grouped.length} sequences=#{sequences}: #{value[0, 120]}"
  end
end

if errors.empty?
  puts "PASS chapter semantic lint rows=#{rows.length} path=#{path}"
else
  warn "FAIL chapter semantic lint errors=#{errors.length} path=#{path}"
  warn errors.join("\n")
  exit 1
end
