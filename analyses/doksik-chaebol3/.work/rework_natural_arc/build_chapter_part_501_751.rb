#!/usr/bin/env ruby
# frozen_string_literal: true

require "csv"
require "fileutils"

analysis = File.expand_path("../..", __dir__)
chapter_path = File.join(analysis, "chapter_map.csv")
semantics_path = File.join(__dir__, "chapter_semantics_501_751.tsv")
out_path = File.join(__dir__, "final_parts", "chapter-map-501-751.csv")

header = %w[
  sequence visible_label title start_line end_line entry_state reader_promise
  protagonist_goal action resistance_or_cost turn_or_reveal paid_reward
  state_change_axis state_change ending_hook closed_loops opened_loops arc_id
  confidence
].freeze

semantic_fields = %w[
  entry_state reader_promise protagonist_goal resistance_or_cost turn_or_reveal
  paid_reward state_change_axis state_change ending_hook closed_loops opened_loops
].freeze

def normalize_surface(text, sequence)
  value = text.to_s.dup
  value.gsub!("먀인", "미아인")
  value.gsub!("다이아몬드 프린세스", "다이아 프린스") if sequence == 553
  value.gsub!("밥 스완", "밥 스웬") if sequence == 585
  value.gsub!("스티브 허블", "스티븐 허블") if sequence == 598
  value.gsub!(/팜뷰로|팜뷰/, "미국 농업 연맹") if sequence == 665
  value.gsub!("하나제약", "한아약품") if sequence.between?(685, 687)
  value.gsub!("콜로모이스키", "콜로노이")
  value
end

# Mixed-scene chapters need literal action order. The inherited row often
# compressed the first settlement or promoted the next chapter's event.
action_override = {
  610 => "40조 원 불법대출·10조 원 비자금과 아홉 현금창고를 공개하고 미아인의 계좌·페이퍼컴퍼니를 동결한다",
  611 => "즈엉 미아인의 구속과 정유회사 인수 보고를 확인한 뒤, 귀국한 김태중과 부산 축구장에서 경기를 본다",
  614 => "김태중의 축구협회장 당선과 메타버스 지분 교환을 확인한 뒤 중국 제약사의 델타 변이 백신 밀어주기를 감시한다",
  620 => "수에즈 운하를 나흘 만에 열어 우선 통항권·확장공사 약속을 받고, 로나 스테이블코인의 구조적 허점을 공개한다",
  660 => "폴란드 20조 원 방산·체코 원전 협상을 굳히고 로나 코인 공매도 그물을 마지막까지 조인다",
  661 => "로나 코인의 99퍼센트 폭락과 베릴의 공개 복권을 확인한 뒤 김태중에게 동남아 식량·러시아 에너지 순방을 부탁한다",
  687 => "아폴로가 형제 지분을 금융타워에 넘겨 한아약품 경영권을 확보한 뒤, NLL 남쪽에 떨어진 북한 미사일을 확인한다",
  725 => "푸틴의 조건부 승낙을 받아 낸 뒤 흑해의 프리고진에게 향해 러시아 강경파보다 먼저 현장 합의를 시도한다",
  726 => "태우해운 선박에서 프리고진에게 아프리카 사업과 안전한 퇴장을 보장해 반란을 끝내고 미국으로 향한다",
  730 => "젤렌스키에게 부패자금 회수 자료·통신망·원전·자동차 재건안을 내밀고 휴전 결단을 요구한다",
  731 => "우크라이나의 협상 신호를 확인한 금융타워가 엔캐리 전액청산을 일주일 앞당겨 실행한다",
  739 => "일본 야당의 약진을 확인하는 동안 AI 드론·PMC가 하마스 기습의 민간인 학살을 막는다",
  740 => "미국대사에게 PMC 비용·미국 기업 동등대우·우크라이나 재건 중심권을 받아 낸 뒤 러시아 전후투자를 서두른다",
  748 => "머스크와 우주선용 고체배터리 공장·탈부착 표준을 합의하고 일본에서 AI 금융플랫폼을 출시한다",
  749 => "북한 횡단철도 착공식에서 첫 삽을 뜬 뒤 태우 AI의 위상을 확인하고 천민정의 노벨 화학상 소식을 받는다",
  750 => "천민정을 기자들에게서 숨겨 보호하는 사이 김민재·최재석의 노벨 평화상 공동 수상 발표를 듣는다",
  751 => "최재석과 수상·퇴임을 결산하고 김태중에게 평화상을 돌린 뒤 천민정의 임신·결혼을 가족에게 알린다"
}.freeze

chapters = CSV.read(chapter_path, headers: true)
chapter_by_sequence = chapters.to_h { |row| [row.fetch("sequence").to_i, row] }
semantics = CSV.read(semantics_path, headers: true, col_sep: "\t")

unless semantics.headers == ["sequence", *semantic_fields]
  abort "unexpected semantic headers: #{semantics.headers.inspect}"
end

expected_sequences = (501..751).to_a
actual_sequences = semantics.map { |row| row.fetch("sequence").to_i }
abort "semantic sequence coverage mismatch" unless actual_sequences == expected_sequences

rows = semantics.map do |semantic|
  sequence = semantic.fetch("sequence").to_i
  source = chapter_by_sequence.fetch(sequence)
  action = action_override.fetch(sequence, source.fetch("action"))

  result = {
    "sequence" => source.fetch("sequence"),
    "visible_label" => source.fetch("visible_label"),
    "title" => source.fetch("title"),
    "start_line" => source.fetch("start_line"),
    "end_line" => source.fetch("end_line"),
    "action" => normalize_surface(action, sequence),
    "arc_id" => source.fetch("arc_id"),
    "confidence" => source.fetch("confidence")
  }

  semantic_fields.each do |field|
    value = normalize_surface(semantic.fetch(field).to_s.strip, sequence)
    abort "blank #{field} at #{sequence}" if value.empty?
    result[field] = value
  end

  result
end

FileUtils.mkdir_p(File.dirname(out_path)) unless Dir.exist?(File.dirname(out_path))
CSV.open(out_path, "w", write_headers: true, headers: header) do |csv|
  rows.each { |row| csv << header.map { |field| row.fetch(field) } }
end

puts "wrote=#{out_path}"
puts "rows=#{rows.length} sequences=#{rows.first.fetch('sequence')}-#{rows.last.fetch('sequence')}"
