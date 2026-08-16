#!/usr/bin/env ruby

require "csv"

work = __dir__
analysis = File.expand_path("../../..", work)
repo = File.expand_path("../..", analysis)
source_path = File.join(repo, "private_sources/korean_webnovel_corpus/서오/독식하는 재벌 3세_서오_합본.txt")
chapter_path = File.join(analysis, "chapter_map.csv")
audit_path = File.join(work, "chapter-narrative-boundary-audit-001-751.csv")

sequences = ARGV.map(&:to_i)
abort "usage: #{$PROGRAM_NAME} SEQUENCE..." if sequences.empty?

chapters = CSV.read(chapter_path, headers: true).to_h { |row| [row["sequence"].to_i, row] }
edits = CSV.read(audit_path, headers: true)
           .select { |row| row["result"] == "EDIT" }
           .group_by { |row| row["sequence"].to_i }
source_lines = File.readlines(source_path, encoding: "UTF-8")

sequences.each do |sequence|
  chapter = chapters.fetch(sequence)
  start_line = chapter["start_line"].to_i
  end_line = chapter["end_line"].to_i
  puts "\n===== #{sequence} · L#{start_line}~L#{end_line} · #{chapter['title']} ====="
  (edits[sequence] || []).each do |row|
    puts "FIELD #{row['field']}"
    puts "  BEFORE: #{row['before']}"
    puts "  AFTER:  #{row['after']}"
  end
  puts "CURRENT CORE"
  %w[entry_state reader_promise protagonist_goal action resistance_or_cost turn_or_reveal paid_reward state_change ending_hook closed_loops opened_loops].each do |field|
    puts "  #{field}: #{chapter[field]}"
  end
  puts "SOURCE"
  (start_line..end_line).each do |line_number|
    text = source_lines.fetch(line_number - 1).strip
    next if text.empty? || text == "* * *"
    puts "L#{line_number}: #{text}"
  end
end
