#!/usr/bin/env ruby

require "csv"
require "set"

work = __dir__
analysis = File.expand_path("../../..", work)
repo = File.expand_path("../..", analysis)
source_path = File.join(repo, "private_sources/korean_webnovel_corpus/서오/독식하는 재벌 3세_서오_합본.txt")
chapter_path = File.join(analysis, "chapter_map.csv")
audit_path = File.join(work, "chapter-narrative-boundary-audit-001-751.csv")

stop = %w[
  그리고 그러나 하지만 아직 실제 현재 다음 이번 해당 화에서 화는 화의 남는다 열린 열려
  한다 된다 된다면 되어 있다 있는 없다 없는 받는다 얻는다 확보한다 확정한다
  시작 끝 결과 계획 준비 진행 실행 지급 상태 변화 목표 약속 확인 공개 공식
].freeze

chapters = CSV.read(chapter_path, headers: true).to_h { |row| [row["sequence"].to_i, row] }
source_lines = File.readlines(source_path, encoding: "UTF-8")
rows = CSV.read(audit_path, headers: true).select { |row| row["result"] == "EDIT" }
requested_sequences = ARGV.map(&:to_i)
rows.select! { |row| requested_sequences.include?(row["sequence"].to_i) } unless requested_sequences.empty?

rows.each do |row|
  sequence = row["sequence"].to_i
  chapter = chapters.fetch(sequence)
  start_line = chapter["start_line"].to_i
  end_line = chapter["end_line"].to_i
  source = source_lines[(start_line - 1)..(end_line - 1)].join
  after_tokens = row["after"].to_s.scan(/[가-힣A-Za-z0-9.%]+/).to_set
  removed = row["before"].to_s.scan(/[가-힣A-Za-z0-9.%]+/).uniq.reject do |token|
    token.length < 2 || stop.include?(token) || after_tokens.include?(token)
  end
  matched = removed.select { |token| source.include?(token) }
  next if matched.empty?

  evidence = (start_line..end_line).each_with_object([]) do |line_number, matches|
    text = source_lines.fetch(line_number - 1).strip
    next if text.empty?
    hits = matched.select { |token| text.include?(token) }
    next if hits.empty?
    matches << "L#{line_number}[#{hits.join('/')}]:#{text}"
  end.first(8)
  puts [sequence, row["field"], matched.join("/"), row["before"], row["after"], evidence.join(" || ")].join("\t")
end
