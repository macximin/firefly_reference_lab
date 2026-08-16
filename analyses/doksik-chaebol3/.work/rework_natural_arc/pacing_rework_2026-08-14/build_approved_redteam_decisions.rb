#!/usr/bin/env ruby
# frozen_string_literal: true

require "csv"
require "digest"

WORK = __dir__
ANALYSIS = File.expand_path("../../..", WORK)
REWORK = File.join(ANALYSIS, ".work/rework_natural_arc")
LEDGER = File.join(REWORK, "long-arc-red-team-2026-08-14.md")
DECISIONS = File.join(REWORK, "long-arc-red-team-decisions-2026-08-14.csv")
SOURCE = File.expand_path("../../private_sources/korean_webnovel_corpus/서오/독식하는 재벌 3세_서오_합본.txt", ANALYSIS)

LEDGER_SHA = "52bbd904efd4483aa999d2062f301ec548ea2cc433bca0565c77d4f1fd418fa2"
SOURCE_SHA = "66f3e7df3123343c14a7134108dc59940511f40372493a549cba8ae709df4b45"

HEADERS = %w[
  ordinal arc_id start_sequence end_sequence source_arc_ids decision arc_name
  dominant_question evidence_anchor boundary_line_evidence predecessor_payoff
  next_first_action bridge_climax_ownership ledger_sha256 source_sha256
].freeze

MANUAL = {
  [556, 565] => ["DCA-N45B", "DCA-N45+DCA-N46", "MERGE_SHIFT", "3월 폭락·유가전쟁과 미국 대선 양면보험", "L97139~L97156;L98031~L98063;L98926~L98946"],
  [566, 570] => ["DCA-N46", "DCA-N46", "SHIFT", "사장단 포스트코로나 재편과 일본 20조 엔·FDA 승인", "L98926~L98964"],
  [631, 633] => ["DCA-N55", "DCA-N55", "SPLIT", "말리 리튬광산 탈환과 지분 5% 추가", "L110006~L110020;L110467~L110503"],
  [634, 636] => ["DCA-N55B", "DCA-N55", "SPLIT", "오미크론 독립외교·기업농법과 28GHz 강행", "L110467~L110520;L111015~L111042"],
  [637, 641] => ["DCA-N56", "DCA-N56", "SPLIT", "리즈 인수·홀란드 계약과 베이징 외교", "L111038~L111060;L111850~L111871"],
  [642, 642] => ["DCA-N56B", "DCA-N56", "SPLIT", "북한 장남의 이 상무 돈·신뢰·CNC 복수", "L111850~L111890;L112045~L112067"],
  [643, 645] => ["DCA-N57", "DCA-N57", "SPLIT", "러시아 침공 대응과 우크라이나 군수·원전·물류 설계", "L112068~L112090;L112562~L112578"],
  [646, 648] => ["DCA-N57B", "DCA-N57", "SPLIT", "니켈 마진콜 200억 보증과 광산·가격 안정", "L112562~L112595;L112918~L113086"],
  [655, 661] => ["DCA-N58B", "DCA-N58+DCA-N59", "MERGE_SHIFT", "명동 이 상무 처분·엔캐리와 로나 99% 폭락", "L113869~L114037;L114939~L115074"],
  [662, 662] => ["DCA-N59", "DCA-N59", "SPLIT", "김태중의 베트남 식량 수출예외", "L115074~L115090;L115170~L115328"],
  [663, 664] => ["DCA-N59B", "DCA-N59", "SPLIT", "로봇물류·일본지분과 10만 석 경기장 흥행", "L115305~L115329;L115466~L115640"],
  [665, 668] => ["DCA-N59C", "DCA-N59", "SPLIT", "바이든·곡물메이저·사우디 증산 협상", "L115638~L115645;L116274~L116314"],
  [682, 684] => ["DCA-N62", "DCA-N62", "SPLIT", "N&K 기술탈취 계약위반·계좌동결과 체포", "L118446~L118465;L118769~L118956"],
  [685, 687] => ["DCA-N62B", "DCA-N62", "SPLIT", "체코 원전 우선협상과 한아약품 경영권 인수", "L118957~L118985;L119400~L119441"],
  [697, 710] => ["DCA-N65", "DCA-N65+DCA-N66", "MERGE", "오셔닉스·고체배터리와 사우디 부산엑스포 철회", "L122141~L122171;L122803~L122832"],
  [711, 715] => ["DCA-N67", "DCA-N67", "SPLIT", "중국 임시가입·경제특구와 철수 안전장치", "L122803~L122965;L123629~L123756"],
  [716, 720] => ["DCA-N67B", "DCA-N67", "SPLIT", "바그너 반란 대응과 신속무기·북방 경제영토", "L123758~L123803;L124541~L124608"],
  [721, 731] => ["DCA-N68", "DCA-N68+DCA-N69+DCA-N70", "MERGE_SHIFT", "푸틴·프리고진·서방·젤렌스키 휴전 중재", "L124613~L124635;L125393~L125426;L126211~L126233"],
  [732, 735] => ["DCA-N70", "DCA-N70", "SHIFT", "일본 엔화 상환·3대은행 지분과 야당 집권통로", "L126220~L126233;L126383~L126405"],
}.freeze

QUESTION_OVERRIDES = {
  [556, 565] => "3월 시장폭락·유가전쟁·백신 변수 속에서 금융수익과 미국 대선 양면보험을 함께 확보하는가?",
  [566, 570] => "사장단 회의로 코로나 이후 사업을 재편하고 일본 20조 엔·FDA 승인을 실제 계약과 허가로 받는가?",
  [631, 633] => "말리 리튬광산을 PMC 압박으로 되찾고 지분 5%와 현지 안전지위를 지급받는가?",
  [634, 636] => "오미크론·러우전 독립외교를 기업농법과 28GHz 강행의 국내정책으로 고정하는가?",
  [637, 641] => "리즈 구단 인수와 홀란드 계약을 베이징 외교선까지 손상 없이 닫는가?",
  [642, 642] => "북한 장남이 이 상무의 돈·신뢰·CNC를 실제로 빼앗아 개인복수를 결산하는가?",
  [643, 645] => "러시아 침공 직후 한국의 탄약·방산·원전·물류를 우크라이나 지원선으로 설계하는가?",
  [646, 648] => "시안 니켈 마진콜을 200억 달러 보증·광산 양도·가격 안정으로 수습하는가?",
  [655, 661] => "엔캐리·유럽은행 협상을 거쳐 로나 99% 폭락과 최소 300억 달러 수익까지 지급받는가?",
  [662, 662] => "김태중이 베트남 현장에서 동남아 식량 수출예외와 가격안정을 받아 오는가?",
  [663, 664] => "로봇물류·일본지분·10만 석 경기장을 유통·스포츠 흥행 기반으로 묶는가?",
  [665, 668] => "바이든·곡물메이저·사우디를 상대로 식량과 증산 거래를 실제 국가협상으로 닫는가?",
  [682, 684] => "N&K의 기술탈취선을 계약위반·계좌동결·체포로 시장 충격 없이 제거하는가?",
  [685, 687] => "체코 원전 coda 뒤 한아약품의 지분과 경영권을 실제로 인수하는가?",
  [697, 710] => "해상도시·고체배터리·외교를 부산엑스포 실물증거로 바꿔 사우디를 후보에서 철회시키는가?",
  [711, 715] => "중국 자동차 임시가입과 경제특구 계열사·철수 안전장치를 통제 가능한 조건으로 고정하는가?",
  [716, 720] => "바그너 반란을 미국 승인·신속 무기공급·북방 경제영토의 비가역 지급으로 바꾸는가?",
  [721, 731] => "푸틴·프리고진·백악관·EU·젤렌스키를 차례로 설득해 벨라루스 휴전협상 합의를 얻는가?",
  [732, 735] => "일본 엔화 조기상환 충격을 3대은행 지분과 야당 집권통로로 회수하는가?",
}.freeze

PAYOFF_OVERRIDES = {
  15 => "푸틴 감사·하버드 3년 졸업·귀국은 지급됐고 배터리 교수 접촉·계약·지분 취득은 미지급이다.",
  246 => "SG 전원 양도 약속·태우 불개입·희망고문 설계까지만 지급되며 실제 계약이전·형량·복역은 미지급이다.",
  380 => "원유 110→105달러, 5배 레버리지 25% 이상, 준비기간 자금 하루 만의 전액 회수가 지급된다.",
  488 => "엔비디아 3% 교환·태우증권 8%+·핀테크 포함 약 10%가 현재 지급이고 25/40/50%는 협상·목표다.",
  495 => "중국 내 5년 금융활동 권한과 5년 뒤 채권양도는 정치적 말합의이고 세부계약·실행은 미지급이다.",
  516 => "ASML 5년 계약 10조 원+·중국행 구형장비 일부·베트남/인도 협상 회고·28GHz/스타링크 지시가 지급되며 단지·곡물/농지 계약은 진행형이다.",
  654 => "SVB 모든 지분·경영권 이전, 뱅크런 없음, 예치금·주가 상승과 새 주인 1면 보도가 지급된다.",
  661 => "로나 99% 폭락·85달러→0.003달러·최소 300억 달러 수익과 베릴 복권이 지급된다.",
  662 => "베트남 현장에서 동남아 식량 수출예외와 가격안정을 받는다.",
  751 => "김태중의 한국 잔류, 조손 화해, 천민정의 임신·결혼과 초음파 사진이 지급된다."
}.freeze

FIRST_ACTION_OVERRIDES = {
  192 => "최재석에게 후보 약 50명 선별을 맡기고 불량학생 4~5명이 천민정의 동생 머리를 때리고 식판에 침을 뱉는 영상을 확인한다.",
  482 => "5% 금리·600만 파운드 청나라 채권을 경매·골동품상·미영 재단에서 6개월 안 최소 절반 매집하라고 지시한다.",
  513 => "인도·베트남을 중국 구형반도체 시장 50% 대체기지로 잡고 구형 노광장비 선점·2년 제재·악성재고 책임을 설계한다.",
  745 => "김태중이 대북특사를 자청하고 손자 김민재가 할아버지의 안전보장과 선물을 준비한다.",
  749 => "북한 횡단철도 첫 삽 뒤 천민정의 AI 코로나·희귀질병 치료제 공로 노벨 화학상 소식을 받는다."
}.freeze

SPECIAL_OWNERSHIP = {
  661 => "661화 로나 99% 폭락·최소 300억 달러 수익은 이 Arc climax다. 661 말미 식량 요청은 bridge이며 수출예외 지급은 662화 Arc가 소유한다.",
  710 => "710화 사우디 엑스포 공식 철회·아람코 0.6% 계약은 이 Arc climax다. 일본 D-DAY는 후속 bridge이고 711화 러우전·중국특구 행동은 다음 Arc가 소유한다.",
  715 => "715화 중국 임시가입·경제특구·철수 안전장치는 이 Arc 결산이다. 말미 바그너 반란 결의는 bridge이고 실제 보고·대응은 716화 Arc가 소유한다.",
  731 => "731화 벨라루스 휴전협상 합의는 이 Arc climax다. 후반 이스라엘·일본은 bridge이며 일본 정부 대응·협상요청은 732화 Arc가 소유한다."
}.freeze

def sha(path)
  Digest::SHA256.file(path).hexdigest
end

raise "approved ledger SHA mismatch" unless sha(LEDGER) == LEDGER_SHA
raise "source SHA mismatch" unless sha(SOURCE) == SOURCE_SHA

ledger_text = File.read(LEDGER)
range_block = ledger_text[/## 판정에서 산출된 연속 범위.*?```text\n(.*?)```/m, 1]
raise "approved range block missing" unless range_block
ranges = range_block.scan(/(\d{3})\s+(\d+)-(\d+)/).map { |ordinal, first, last| [ordinal.to_i, first.to_i, last.to_i] }
raise "approved range count mismatch" unless ranges.length == 131
raise "approved range ordinal mismatch" unless ranges.each_with_index.all? { |row, index| row[0] == index + 1 }
raise "approved coverage start/end" unless ranges.first[1] == 1 && ranges.last[2] == 751
raise "approved range gap/overlap" unless ranges.each_cons(2).all? { |left, right| right[1] == left[2] + 1 }

length_runs = []
cursor = 0
while cursor < ranges.length
  finish = cursor + 1
  length = ranges[cursor][2] - ranges[cursor][1] + 1
  finish += 1 while finish < ranges.length && ranges[finish][2] - ranges[finish][1] + 1 == length
  length_runs << ranges[cursor...finish] if finish - cursor >= 3
  cursor = finish
end
raise "approved equal-length run remains" unless length_runs.empty?

chapters = CSV.read(File.join(ANALYSIS, "chapter_map.csv"), headers: true).to_h { |row| [row.fetch("sequence").to_i, row] }
arcs = CSV.read(File.join(ANALYSIS, "arc_map.csv"), headers: true).map(&:to_h)
existing = File.exist?(DECISIONS) ? CSV.read(DECISIONS, headers: true).map(&:to_h) : []
existing_by_range = existing.to_h { |row| [[row.fetch("start_sequence").to_i, row.fetch("end_sequence").to_i], row] }

rows = ranges.map do |ordinal, first, last|
  key = [first, last]
  old = existing_by_range[key]
  manual = MANUAL[key]
  raise "no approved metadata for #{first}-#{last}" unless old || manual

  arc_id = manual ? manual[0] : old.fetch("arc_id")
  source_ids = manual ? manual[1] : old.fetch("source_arc_ids")
  decision = manual ? manual[2] : old.fetch("decision")
  arc_name = manual ? manual[3] : old.fetch("arc_name")
  evidence_anchor = manual ? manual[4] : old.fetch("evidence_anchor")
  start_chapter = chapters.fetch(first)
  end_chapter = chapters.fetch(last)
  previous = first > 1 ? chapters.fetch(first - 1) : nil
  next_chapter = last < 751 ? chapters.fetch(last + 1) : nil
  payoff = PAYOFF_OVERRIDES.fetch(last, end_chapter.fetch("paid_reward"))
  first_action = FIRST_ACTION_OVERRIDES.fetch(first, start_chapter.fetch("action"))
  question = QUESTION_OVERRIDES.fetch(key) do
    existing_question = old && old["dominant_question"].to_s.strip
    existing_question && !existing_question.empty? ? existing_question : "#{arc_name}의 약속을 #{payoff}까지 실제 장면으로 결산하는가?"
  end
  predecessor = if previous
    previous_payoff = PAYOFF_OVERRIDES.fetch(first - 1, previous.fetch("paid_reward"))
    "#{first - 1}화 L#{previous.fetch('start_line')}~L#{previous.fetch('end_line')}: #{previous_payoff}"
  else
    "START: 1화 회귀·파텍필립 폭로·김태중의 100만 달러 지급에서 진입"
  end
  next_action = "#{first}화 L#{start_chapter.fetch('start_line')}~L#{start_chapter.fetch('end_line')}: #{first_action}"
  ownership = SPECIAL_OWNERSHIP.fetch(last) do
    if next_chapter
      "#{last}화의 지급 ‘#{payoff}’은 #{arc_id} 소유다. 끝 훅 ‘#{end_chapter.fetch('ending_hook')}’은 bridge이고 #{last + 1}화 실제 행동은 다음 Arc가 소유한다."
    else
      "751화 조손 화해·김태중 한국 잔류·임신·결혼은 최종 Arc climax이며 후속 사건 대신 새 가정의 책임을 남긴다."
    end
  end

  {
    "ordinal" => ordinal.to_s,
    "arc_id" => arc_id,
    "start_sequence" => first.to_s,
    "end_sequence" => last.to_s,
    "source_arc_ids" => source_ids,
    "decision" => decision,
    "arc_name" => arc_name,
    "dominant_question" => question,
    "evidence_anchor" => evidence_anchor,
    "boundary_line_evidence" => "#{evidence_anchor}; predecessor=#{predecessor}; next=#{next_action}",
    "predecessor_payoff" => predecessor,
    "next_first_action" => next_action,
    "bridge_climax_ownership" => ownership,
    "ledger_sha256" => LEDGER_SHA,
    "source_sha256" => SOURCE_SHA
  }
end

raise "duplicate decision arc_id" unless rows.map { |row| row.fetch("arc_id") }.uniq.length == rows.length
raise "blank decision narrative" unless rows.all? do |row|
  %w[arc_name dominant_question boundary_line_evidence predecessor_payoff next_first_action bridge_climax_ownership].all? { |field| !row.fetch(field).strip.empty? }
end

temp = "#{DECISIONS}.approved-tmp"
CSV.open(temp, "w", write_headers: true, headers: HEADERS) do |csv|
  rows.each { |row| csv << HEADERS.map { |field| row.fetch(field) } }
end
File.rename(temp, DECISIONS)

puts "PASS approved decision CSV rows=#{rows.length} coverage=1..751 ledger=#{LEDGER_SHA} sha=#{sha(DECISIONS)}"
