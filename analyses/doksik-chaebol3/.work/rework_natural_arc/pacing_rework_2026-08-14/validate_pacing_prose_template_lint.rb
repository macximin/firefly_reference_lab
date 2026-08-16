#!/usr/bin/env ruby
# frozen_string_literal: true

require "csv"

WORK = __dir__
ANALYSIS = File.expand_path("../../..", WORK)
PACING_PATH = File.join(ANALYSIS, "arc_pacing.csv")
MANUAL_LEDGER_PATH = File.join(WORK, "manual-pacing-prose-ledger-119.csv")

rows = CSV.read(PACING_PATH, headers: true)
ledger = CSV.read(MANUAL_LEDGER_PATH, headers: true)
errors = []

errors << "pacing rows=#{rows.length}" unless rows.length == 751
notes = rows.map { |row| row["pacing_note"].to_s }
errors << "unique notes=#{notes.uniq.length}" unless notes.uniq.length == 751

forbidden = {
  "독자는" => /독자는/,
  "실제 지급은 다음에 한정된다" => /실제 지급은 다음에 한정된다/,
  "가장 오래 머문다" => /가장 오래 머문다/,
  "편집 메타어" => /지배한다|비중|리본|독서 시간|(?:정보|행동|관계|감정|물질|지위|돈)(?:·(?:정보|행동|관계|감정|물질|지위|돈))*\s*회차(?:다|이다)|(?:정보|행동|관계|감정|물질|지위|돈).{0,8}(?:중심|주축)|(?:정보|행동|관계|감정|물질|지위|돈).{0,8}(?:높다|크다|압도한다)/
}

counts = forbidden.transform_values { |pattern| notes.count { |note| note.match?(pattern) } }
counts.each { |label, count| errors << "#{label}=#{count}" unless count.zero? }

errors << "manual ledger rows=#{ledger.length}" unless ledger.length == 119
pace_by_sequence = rows.to_h { |row| [row["sequence"].to_i, row] }
ledger.each do |row|
  sequence = row["sequence"].to_i
  errors << "manual final note mismatch #{sequence}" unless row["after_note"] == pace_by_sequence.fetch(sequence)["pacing_note"]
  errors << "manual note status #{sequence}" unless row["note_status"] == "EDIT"
  errors << "manual boundary status #{sequence}" unless row["boundary_status"] == "PASS"
end

{
  "apply_pacing_rework.rb" => "DISABLED: this legacy script generates mechanical pacing prose",
  "apply_pacing_microfixes.rb" => "DISABLED: this legacy script regenerates mechanical pacing prose"
}.each do |name, marker|
  first_lines = File.readlines(File.join(WORK, name), chomp: true).first(5).join("\n")
  errors << "legacy writer not fail-closed #{name}" unless first_lines.include?(marker)
end

if errors.empty?
  puts "PASS pacing prose template lint: rows=751 unique=751 manual=119 exact_templates=0 semantic_meta=0 legacy_writers=fail-closed"
else
  warn "FAIL pacing prose template lint errors=#{errors.length}"
  errors.each { |message| warn "- #{message}" }
  exit 1
end
