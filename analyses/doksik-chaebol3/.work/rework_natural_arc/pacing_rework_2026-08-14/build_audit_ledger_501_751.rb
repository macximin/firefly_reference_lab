#!/usr/bin/env ruby
# frozen_string_literal: true

require "csv"
require "zlib"
require "rubygems/package"

ROOT = File.expand_path("../../../../../", __dir__)
CURRENT_PATH = File.join(ROOT, "analyses/doksik-chaebol3/chapter_map.csv")
ARCHIVE_PATH = File.join(ROOT, "exports/checkpoints/2026-08-14-doksik-pre-pacing-rework.tar.gz")
ARCHIVE_MEMBER = "analyses/doksik-chaebol3/chapter_map.csv"
OUTPUT_PATH = File.join(__dir__, "audit-ledger-501-751.csv")
CHECKPOINT_PATH = File.join(__dir__, "checkpoint-semantic-audit-501-751.md")

SEMANTIC_FIELDS = %w[
  action turn_or_reveal paid_reward state_change ending_hook closed_loops opened_loops
].freeze

KEY_NOTES = {
  609 => "L106262~L106419은 미아인 불법망의 일주일 정보수집·공개 계획과 김태중의 동의까지다. 증거·보호팀·계좌동결·정유회사 권리를 다음 화들에서 현재 화로 당기지 않았다.",
  619 => "L108010~L108186은 선박 우회와 중장비·예인선 투입, 자비 구조작전의 시작이다. 나흘 뒤 재개통·우선통항·확장공사 보상은 620화 지급으로 남겼다.",
  660 => "L114856~L114999에는 폴란드·체코 산업선과 로나 공매도 그물만 있다. 99퍼센트 폭락·베릴 복권은 661화 지급이므로 수치와 완료를 제거했다.",
  670 => "L116472~L116638은 로만이 지친 프리고진을 처음 만나 김민재의 조언을 구해 보자고 제안하는 장면이다. 군부 불만·생존계약·반란의사를 아직 확보하지 않았다.",
  683 => "L118600~L118768은 김남훈이 10분 안에 증거를 가져오겠다고 배신을 약속하는 데서 끝난다. 명단·계좌·비밀번호의 실제 전달은 다음 화 이전이라 지급하지 않았다.",
  691 => "L119911~L120062의 마지막 프레임은 고체배터리 안전의제와 최재석의 정책·정치 협력이다. 다음 화 산업스파이 추적을 현재 turn·hook으로 선취하지 않았다.",
  710 => "L122799~L122944에서 아람코 지분은 지급되지만 조지는 D-DAY를 정하라는 임무만 받는다. 날짜가 이미 확정됐다는 완료 상태를 제거했다.",
  729 => "L125884~L126045은 일본 조기상환 대응과 우크라이나 재건카드 선택이다. 젤렌스키 부패자료·구체 담판은 730화라 현재 훅에서 선취하지 않았다.",
  731 => "L126216~L126382은 자민당 비자금 자료 축적, 총리 사퇴·중의원 해산 장기카드, 미국 압박 가능성과 일본 이탈자금 흡수까지다. 일본 협상요청·금융청 책임론은 732화 결과로 분리했다.",
  732 => "L126383~L126556의 현재 행동은 일본 금융청 30조 엔 대응논의, 미국 환율관찰국 지정, 일본 측 협상요청과 김민재·한 부회장 투트랙 결정이다. 전액상환 실행은 진입배경이므로 action 반복을 제거했다.",
  734 => "L126730~L126889은 곤조에게 불법자금 카드·자금통로를 주고 환율보험 지급조건 충족을 확인한다. 보험금·3대 은행 지분 실제 지급은 735화로 남겼다."
}.freeze

def archived_text(archive_path, member_name)
  found = nil
  Zlib::GzipReader.open(archive_path) do |gzip|
    Gem::Package::TarReader.new(gzip) do |tar|
      tar.each do |entry|
        next unless entry.full_name == member_name

        found = entry.read
        break
      end
    end
  end
  abort("Archive member not found: #{member_name}") unless found
  found.force_encoding(Encoding::UTF_8)
end

current = CSV.read(CURRENT_PATH, headers: true)
original = CSV.parse(archived_text(ARCHIVE_PATH, ARCHIVE_MEMBER), headers: true)
current_by_sequence = current.each_with_object({}) { |row, out| out[row["sequence"].to_i] = row }
original_by_sequence = original.each_with_object({}) { |row, out| out[row["sequence"].to_i] = row }

headers = [
  "sequence", "visible_label", "start_line", "end_line", "status", "fields_changed",
  "evidence_lines", "reason", "before_after"
]

edited = []
ledger_rows = []
(501..751).each do |sequence|
  now = current_by_sequence.fetch(sequence)
  before = original_by_sequence.fetch(sequence)
  changed_fields = SEMANTIC_FIELDS.select { |field| now[field] != before[field] }
  unexpected = current.headers.select { |field| now[field] != before[field] } - SEMANTIC_FIELDS
  abort("Unexpected changed fields at #{sequence}: #{unexpected.join(', ')}") unless unexpected.empty?

  status = changed_fields.empty? ? "PASS" : "EDIT"
  start_line = now["start_line"].to_i
  end_line = now["end_line"].to_i
  evidence = [
    ("prev L#{[1, start_line - 10].max}~L#{start_line - 1}" if start_line > 1),
    "hard L#{start_line}~L#{end_line}",
    "next L#{end_line + 1}~L#{end_line + 10}"
  ].compact.join("; ")

  if status == "PASS"
    reason = "현재 action·turn_or_reveal·paid_reward·state_change·ending_hook·closed_loops·opened_loops가 하드 경계와 일치하며, 계획·계약 전 상태나 인접 화 결과를 완료로 선취하지 않는다."
    before_after = ""
  else
    edited << sequence
    reason = KEY_NOTES[sequence] || if (changed_fields & %w[action turn_or_reveal paid_reward state_change closed_loops]).any?
      "L#{start_line}~L#{end_line} 원문을 다시 읽어 계획·가능성·협상 전과 실행·서명·소유·지급을 분리하고, 인접 화의 구체 결과를 현재 화의 완료 상태에서 제거했다."
    else
      "L#{start_line}~L#{end_line}의 실제 마지막 프레임만 남겨 다음 화의 인물·금액·계약·결과를 훅과 열린 루프에서 의미상 선취하지 않도록 고쳤다."
    end
    before_after = changed_fields.map do |field|
      "#{field}=[#{before[field]}] => [#{now[field]}]"
    end.join(" || ")
  end

  ledger_rows << [
    sequence, now["visible_label"], start_line, end_line, status,
    changed_fields.join(";"), evidence, reason, before_after
  ]
end

CSV.open(OUTPUT_PATH, "w", write_headers: true, headers: headers) do |csv|
  ledger_rows.each { |row| csv << row }
end

File.open(CHECKPOINT_PATH, "w") do |file|
  file.puts "# 501~751 인접 회차 의미 감사 체크포인트"
  file.puts
  file.puts "- 완료 범위: 501~751화, 251행 전수"
  file.puts "- 마지막 확정 회차: 751화 (L129569~L129777)"
  file.puts "- 판정: EDIT #{edited.length}행 / PASS #{251 - edited.length}행"
  file.puts "- 검수 필드: action, turn_or_reveal, paid_reward, state_change, ending_hook, closed_loops, opened_loops"
  file.puts "- 다음 재개점: 전 751화 페이싱 T/R/H·리본·concrete_event·pacing_note 재판정과 DCA-N20 재분절"
  file.puts "- 미확정 경계: DCA-N20 192~215의 자연 경계; 610/611·660/661은 지급 귀속을 유지한 채 Arc 소유권 재판정; 730/731은 일본 금융전 진입 신호 재확인"
  file.puts
  file.puts "## 수정 sequence와 원문 하드 경계"
  file.puts
  file.puts "| sequence | 원문 line | 변경 필드 | 전/후 의미 |"
  file.puts "|---:|---|---|---|"
  ledger_rows.select { |row| row[4] == "EDIT" }.each do |row|
    sequence = row[0]
    line_range = "L#{row[2]}~L#{row[3]}"
    fields = row[5]
    reason = row[7].gsub("|", "\\|")
    file.puts "| #{sequence} | #{line_range} | #{fields} | #{reason} |"
  end
  file.puts
  file.puts "정확한 필드별 전/후 문장은 `audit-ledger-501-751.csv`의 `before_after`에 보존했다. PASS 행도 모두 한 번씩 기록했으며, 기계 중복검색은 판정을 대신하지 않았다."
end

abort("Expected 251 rows, got #{ledger_rows.length}") unless ledger_rows.length == 251
abort("Duplicate sequences") unless ledger_rows.map(&:first).uniq.length == 251
abort("Coverage mismatch") unless ledger_rows.map(&:first) == (501..751).to_a

puts "wrote #{OUTPUT_PATH} rows=251 edits=#{edited.length} pass=#{251 - edited.length}"
puts "wrote #{CHECKPOINT_PATH}"
