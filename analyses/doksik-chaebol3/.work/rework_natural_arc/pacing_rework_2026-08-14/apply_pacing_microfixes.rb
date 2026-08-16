#!/usr/bin/env ruby

abort "DISABLED: this legacy script regenerates mechanical pacing prose; use apply_manual_pacing_prose_followup.rb"

require "csv"

WORK = __dir__
ANALYSIS = File.expand_path("../../..", WORK)
PACING_PATH = File.join(ANALYSIS, "arc_pacing.csv")
EVIDENCE_PATH = File.join(ANALYSIS, ".work/rework_natural_arc/pacing/pacing-all-evidence.csv")
HIGH_PATH = File.join(ANALYSIS, ".work/rework_natural_arc/high-score-and-relationship-evidence.csv")
LEDGER_PATH = File.join(WORK, "pacing-rejudgment-ledger-001-751.csv")
CHAPTER_PATH = File.join(ANALYSIS, "chapter_map.csv")

def clean_clause(text)
  text.to_s.strip.sub(/[.;。]+\z/, "")
end

def refreshed_note(chapter, weights)
  labels = ["사건의 조건과 확인 정보", "현장 실행", "인물의 선택과 관계 변화", "감정 반응", "돈·지분·직책의 지급"]
  focus = labels[weights.each_with_index.max_by { |value, _index| value }.last]
  "#{clean_clause(chapter.fetch('action'))}. 독자는 #{focus}에 가장 오래 머문다. 실제 지급은 다음에 한정된다: #{clean_clause(chapter.fetch('paid_reward'))}."
end

def rewrite(path)
  table = CSV.read(path, headers: true)
  headers = table.headers
  yield table
  CSV.open(path, "w", write_headers: true, headers: headers) do |csv|
    table.each { |row| csv << headers.map { |field| row[field] } }
  end
end

chapters = CSV.read(CHAPTER_PATH, headers: true).to_h { |row| [row["sequence"].to_i, row.to_h] }
template_sequences = []

rewrite(PACING_PATH) do |table|
  table.each do |row|
    sequence = row["sequence"].to_i
    chapter = chapters.fetch(sequence)
    row["concrete_event"] = [chapter.fetch("action"), chapter.fetch("turn_or_reveal"), chapter.fetch("paid_reward")].map { |text| clean_clause(text) }.join("; ")
    if row["pacing_note"].include?("독자는") && (row["pacing_note"].include?("이번 화의 지급은") || row["pacing_note"].include?("실제 지급은 다음에 한정된다"))
      weights = %w[information_weight action_weight relationship_weight emotion_weight material_or_status_weight].map { |field| row[field].to_f }
      row["pacing_note"] = refreshed_note(chapter, weights)
      template_sequences << sequence
    end
  end
  row = table.find { |item| item["sequence"] == "201" }
  row["hook_1_10"] = "8"
end

rewrite(EVIDENCE_PATH) do |table|
  table.each do |row|
    pace = CSV.read(PACING_PATH, headers: true).find { |item| item["sequence"] == row["sequence"] }
    row["ribbon_rationale"] = pace["pacing_note"]
  end
  table.find { |item| item["sequence"] == "201" }["hook_1_10"] = "8"
end

rewrite(LEDGER_PATH) do |table|
  pace_by_sequence = CSV.read(PACING_PATH, headers: true).to_h { |item| [item["sequence"], item] }
  table.each do |row|
    pace = pace_by_sequence.fetch(row["sequence"])
    row["concrete_event_after"] = pace["concrete_event"]
    row["pacing_note_after"] = pace["pacing_note"]
  end
  row = table.find { |item| item["sequence"] == "201" }
  row["new_hook"] = "8"
  row["score_status"] = "EDIT"
  row["adjudication"] = row["adjudication"].sub(/훅은 마지막 프레임의 열린 질문만 세어 \d+→\d+ 판정/, "훅은 마지막 프레임의 사건 발생만 세어 8로 유지")
end

evidence = CSV.read(EVIDENCE_PATH, headers: true)
headers = evidence.headers
selected = evidence.select do |row|
  [row["tension_1_10"], row["reward_1_10"], row["hook_1_10"]].map(&:to_i).max >= 9 ||
    row["relationship_weight"].to_f >= 0.30
end
CSV.open(HIGH_PATH, "w", write_headers: true, headers: headers) do |csv|
  selected.each { |row| csv << headers.map { |field| row[field] } }
end

puts "PASS pacing microfixes: 201 H=8, cleaned_events=751, refreshed_notes=#{template_sequences.uniq.length}, high=#{selected.length}"
