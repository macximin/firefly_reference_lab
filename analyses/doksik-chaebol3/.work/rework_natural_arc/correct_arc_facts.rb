#!/usr/bin/env ruby
# frozen_string_literal: true

require "csv"

parts = File.expand_path("final_parts", __dir__)

def rewrite(path)
  table = CSV.read(path, headers: true)
  yield table
  CSV.open(path, "w", write_headers: true, headers: table.headers) do |csv|
    table.each { |row| csv << table.headers.map { |field| row[field] } }
  end
end

early_path = File.join(parts, "arc-map-001-191.csv")
rewrite(early_path) do |table|
  hinton = table.find { |row| row["start_sequence"] == "147" && row["end_sequence"] == "153" }
  abort "147~153 arc not found" unless hinton
  hinton["main_characters"] = hinton["main_characters"].sub("제프리 힌톤", "제임스 힌톤")
  hinton["main_locations"] = hinton["main_locations"].sub("캐나다 힌톤 연구실·미국 정치 협상장", "미국의 식당·조지 슐츠 협상장")
  hinton["concrete_payoff"] = hinton["concrete_payoff"].sub("힌톤 AI팀", "제임스 힌톤 AI팀")
  hinton["relationship_change"] = hinton["relationship_change"].sub("자식을 살린 힌톤", "WTC에서 아들을 살린 제임스 힌톤")
  hinton["boundary_signals"] = hinton["boundary_signals"].sub("힌톤 영입", "제임스 힌톤 영입")

  funds = table.find { |row| row["start_sequence"] == "177" && row["end_sequence"] == "186" }
  abort "177~186 arc not found" unless funds
  funds["pressure_escalation"] = funds["pressure_escalation"].sub("KS 1천억 선거자금과 2천억 비자금", "KS의 100억 원 넘는 정치자금과 총 2천억 원 비자금")
end

puts "corrected source facts in #{early_path}"
