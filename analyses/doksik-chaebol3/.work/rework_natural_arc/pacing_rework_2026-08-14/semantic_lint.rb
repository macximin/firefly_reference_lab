#!/usr/bin/env ruby
# frozen_string_literal: true

require "csv"

ROOT = File.expand_path("../../../../..", __dir__)
SOURCE = File.join(ROOT, "private_sources/korean_webnovel_corpus/서오/독식하는 재벌 3세_서오_합본.txt")
CHAPTER_MAP = File.join(ROOT, "analyses/doksik-chaebol3/chapter_map.csv")

from = Integer(ARGV.fetch(0, "1"))
to = Integer(ARGV.fetch(1, "751"))

source = File.readlines(SOURCE, chomp: true)
rows = CSV.read(CHAPTER_MAP, headers: true).map { |row| row }
fields = %w[action turn_or_reveal paid_reward ending_hook opened_loops closed_loops]
stop = %w[
  김민재 태우그룹 현재 이번 다음 실제 통해 위한 위해 한다 했다 된다 있는 없는
  그리고 하지만 그러자 이후 다시 아직 이미 완료 확보 지급 시작 진행 결과 계획 문제 가능성
].freeze

(from..to).each do |sequence|
  row = rows.fetch(sequence - 1)
  following = rows[sequence]
  current_text = source[(row["start_line"].to_i - 1)..(row["end_line"].to_i - 1)].join(" ")
  next_text = if following
                source[(following["start_line"].to_i - 1)..(following["end_line"].to_i - 1)].join(" ")
              else
                ""
              end
  hits = []

  fields.each do |field|
    tokens = row[field].to_s.scan(/[가-힣A-Za-z0-9,.%]+/)
                .select { |token| (token.length >= 3 || token.match?(/\d/)) && !stop.include?(token) }
                .uniq
    only_next = tokens.select { |token| !current_text.include?(token) && next_text.include?(token) }
    hits << "#{field}=#{only_next.join('/')}" unless only_next.empty?
  end

  puts "#{sequence}\t#{hits.join("\t")}" unless hits.empty?
end
