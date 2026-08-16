#!/usr/bin/env ruby
# frozen_string_literal: true

require "csv"

ROOT = File.expand_path("../../../../..", __dir__)
SOURCE = File.join(ROOT, "private_sources/korean_webnovel_corpus/서오/독식하는 재벌 3세_서오_합본.txt")
CHAPTER_MAP = File.join(ROOT, "analyses/doksik-chaebol3/chapter_map.csv")

from = Integer(ARGV.fetch(0))
to = Integer(ARGV.fetch(1, ARGV.fetch(0)))
mode = ARGV.fetch(2, "full")

lines = File.readlines(SOURCE, chomp: true)
rows = CSV.read(CHAPTER_MAP, headers: true).map { |row| row }

STOP = %w[
  그리고 그러나 하지만 그래서 그동안 이제 이미 아직 다시 실제 결국 이번 다음 현재 바로
  같은 모든 대한 통해 위해 하는 했다 한다 된다 있다 없다 것을 것이 있는 없는 만큼 정도
  김민재 태우그룹 회장님 말이다 말했다 생각했다 시작했다 확인했다
].freeze

def content_tokens(text)
  text.to_s.scan(/[가-힣A-Za-z0-9·%]+/)
      .select { |token| token.length >= 2 && !STOP.include?(token) }
      .uniq
end

def compact_nonblank(lines, start_line, end_line)
  (start_line..end_line).each_with_object([]) do |line_no, result|
    text = lines[line_no - 1].to_s.strip
    result << [line_no, text] unless text.empty?
  end
end

(from..to).each do |sequence|
  row = rows.fetch(sequence - 1)
  following = rows[sequence]
  start_line = row["start_line"].to_i
  end_line = row["end_line"].to_i
  current_text = lines[(start_line - 1)..(end_line - 1)].join("\n")
  next_text = if following
                lines[(following["start_line"].to_i - 1)..(following["end_line"].to_i - 1)].join("\n")
              else
                ""
              end

  puts "\n===== #{sequence} · #{row['title']} · #{row['arc_id']} · L#{start_line}~L#{end_line} ====="
  fields = if mode == "tail"
             %w[action turn_or_reveal paid_reward state_change ending_hook closed_loops opened_loops]
           else
             %w[entry_state protagonist_goal action turn_or_reveal paid_reward state_change ending_hook closed_loops opened_loops]
           end
  fields.each do |field|
    value = row[field].to_s
    tokens = content_tokens(value)
    only_next = tokens.select { |token| !current_text.include?(token) && next_text.include?(token) }
    absent = tokens.select { |token| !current_text.include?(token) && !next_text.include?(token) }
    suffix = []
    suffix << "NEXT_ONLY=#{only_next.join('/')}" unless only_next.empty?
    suffix << "ABSENT=#{absent.join('/')}" unless absent.empty?
    puts "#{field}: #{value}#{suffix.empty? ? '' : " [#{suffix.join(' | ')}]"}"
  end

  compact = compact_nonblank(lines, start_line, end_line)
  selected = []
  selected.concat(compact.first(mode == "tail" ? 2 : (mode == "compact" ? 4 : 8)))
  if mode != "tail"
    compact.each_with_index do |(line_no, text), idx|
      next unless text == "***"

      selected.concat(compact[[idx - 2, 0].max, 6] || [])
    end
  end
  if mode == "full"
    selected.concat(compact.select { |_line_no, text| text.match?(/[0-9][0-9,.%조억만천달러원엔]|계약|서명|도장|지분|취임|임명|승인|확정|수락|거절|발표|체포|해임|당선|승리|패배|매각|인수|상환|지급/) })
  end
  selected.concat(compact.last(mode == "tail" ? 12 : (mode == "compact" ? 20 : 18)))
  selected.uniq.sort_by(&:first).each { |line_no, text| puts "L#{line_no}: #{text}" }

  if following
    ns = following["start_line"].to_i
    ne = following["end_line"].to_i
    next_head = compact_nonblank(lines, ns, ne).first(mode == "tail" ? 4 : 8)
    puts "-- NEXT #{sequence + 1} HEAD --"
    next_head.each { |line_no, text| puts "L#{line_no}: #{text}" }
  end
end
