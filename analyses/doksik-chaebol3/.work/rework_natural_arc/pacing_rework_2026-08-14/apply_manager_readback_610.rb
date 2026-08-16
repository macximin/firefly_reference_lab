#!/usr/bin/env ruby
# frozen_string_literal: true

require "csv"

WORK = __dir__
ANALYSIS = File.expand_path("../../..", WORK)
CHAPTER_PATH = File.join(ANALYSIS, "chapter_map.csv")
PACING_PATH = File.join(ANALYSIS, "arc_pacing.csv")
EVIDENCE_PATH = File.join(ANALYSIS, ".work/rework_natural_arc/pacing/pacing-all-evidence.csv")
HIGH_PATH = File.join(ANALYSIS, ".work/rework_natural_arc/high-score-and-relationship-evidence.csv")
PACING_LEDGER_PATH = File.join(WORK, "pacing-rejudgment-ledger-001-751.csv")
SEMANTIC_LEDGER_PATH = File.join(WORK, "audit-ledger-501-751.csv")

WEIGHTS = {
  "information_weight" => "0.30",
  "action_weight" => "0.17",
  "relationship_weight" => "0.31",
  "emotion_weight" => "0.08",
  "material_or_status_weight" => "0.14"
}.freeze

PHASE = "부패증거 공개·정부 수습선"
NOTE = "가이아나 30억 달러 군수계약·스테이블코인 공격 준비를 보고받고, 40조 원 불법대출·10조 원 비자금 보고서를 공개해 베트남 정부의 주동자 수습선과 김태중 통로를 확인한다. 압수·계좌동결·구속·정유회사 인수 전이라 정보와 정치 관계가 중심이다."

def rewrite(path)
  table = CSV.read(path, headers: true)
  yield table
  CSV.open(path, "w", write_headers: true, headers: table.headers) do |csv|
    table.each { |row| csv << table.headers.map { |field| row[field] } }
  end
end

def clean_clause(text)
  text.to_s.strip.sub(/[.;。]+\z/, "")
end

chapter = CSV.read(CHAPTER_PATH, headers: true).find { |row| row["sequence"] == "610" }
raise "missing chapter 610" unless chapter
raise "chapter 610 manager correction missing" unless chapter["paid_reward"].include?("현금창고 압수·계좌동결·구속·정유회사 인수는 아직 전")
chapter_730 = CSV.read(CHAPTER_PATH, headers: true).find { |row| row["sequence"] == "730" }
raise "missing chapter 730" unless chapter_730
raise "chapter 730 proposal correction missing" unless chapter_730["paid_reward"].include?("휴전 결단·사업권·부패자금 회수는 아직 전")

event = [chapter["action"], chapter["turn_or_reveal"], chapter["paid_reward"]].map { |text| clean_clause(text) }.join("; ")
event_730 = [chapter_730["action"], chapter_730["turn_or_reveal"], chapter_730["paid_reward"]].map { |text| clean_clause(text) }.join("; ")

rewrite(PACING_PATH) do |table|
  row = table.find { |item| item["sequence"] == "610" }
  raise "missing pacing 610" unless row
  row["arc_phase"] = PHASE
  row["concrete_event"] = event
  WEIGHTS.each { |field, value| row[field] = value }
  row["pacing_note"] = NOTE
  row_730 = table.find { |item| item["sequence"] == "730" }
  raise "missing pacing 730" unless row_730
  row_730["concrete_event"] = event_730
  row_660 = table.find { |item| item["sequence"] == "660" }
  raise "missing pacing 660" unless row_660
  row_660["arc_phase"] = "폴란드 방산 지급·로나 붕괴 대기"
end

rewrite(EVIDENCE_PATH) do |table|
  row = table.find { |item| item["sequence"] == "610" }
  raise "missing evidence 610" unless row
  row["arc_phase"] = PHASE
  WEIGHTS.each { |field, value| row[field] = value }
  row["ribbon_rationale"] = NOTE
  row_660 = table.find { |item| item["sequence"] == "660" }
  raise "missing evidence 660" unless row_660
  row_660["arc_phase"] = "폴란드 방산 지급·로나 붕괴 대기"
end

rewrite(PACING_LEDGER_PATH) do |table|
  row = table.find { |item| item["sequence"] == "610" }
  raise "missing pacing ledger 610" unless row
  row["semantic_status"] = "EDIT"
  row["ribbon_status"] = "EDIT"
  row["new_ribbon"] = WEIGHTS.values.join("/")
  row["actual_action"] = chapter["action"]
  row["actual_paid_reward"] = chapter["paid_reward"]
  row["actual_ending_hook"] = chapter["ending_hook"]
  row["concrete_event_after"] = event
  row["pacing_note_after"] = NOTE
  row["adjudication"] = "보상은 실제 지급만 세어 10→7 판정; 리본은 압수·동결 전의 보고·정부 협의·김태중 관계 장면에 맞춰 재배분; 관리자 readback으로 610/611 시제를 재확정"
  row_730 = table.find { |item| item["sequence"] == "730" }
  raise "missing pacing ledger 730" unless row_730
  row_730["semantic_status"] = "EDIT"
  row_730["actual_action"] = chapter_730["action"]
  row_730["actual_paid_reward"] = chapter_730["paid_reward"]
  row_730["actual_ending_hook"] = chapter_730["ending_hook"]
  row_730["concrete_event_after"] = event_730
  row_730["adjudication"] = "기존 점수·리본 유지; 729화 방향 선택과 730화 자료 전달·패키지 제안을 분리하고 휴전 결단·사업권·부패자금 회수는 미지급으로 재확정"
end

rewrite(SEMANTIC_LEDGER_PATH) do |table|
  row = table.find { |item| item["sequence"] == "610" }
  raise "missing semantic ledger 610" unless row
  row["status"] = "EDIT"
  row["fields_changed"] = "reader_promise;protagonist_goal;action;turn_or_reveal;paid_reward;state_change;ending_hook;closed_loops;opened_loops"
  row["reason"] = "관리자 readback 보정. L106420~L106590에는 가이아나 군수계약·스테이블코인 공격 준비, 40조 원 불법대출·10조 원 비자금 보고서 공개, 베트남 정부의 주동자 수습선과 김태중 통로까지만 있다. 아홉 현금창고 압수·계좌동결·구속·정유회사 인수는 611화 L106617~L106650 지급이므로 제거했다."
  row["before_after"] = "action=[40조 원 불법대출·10조 원 비자금과 아홉 현금창고를 공개하고 미아인의 계좌·페이퍼컴퍼니를 동결한다] => [#{chapter['action']}] || paid_reward=[미아인의 아홉 현금창고·차명계좌가 공개·동결되고 베트남 정부의 개인일탈 수습선과 김태중의 총리통로가 확보된다.] => [#{chapter['paid_reward']}] || state_change=[부패망을 폭로할 외국 투자자에서 베트남 총리·고위층의 수습방향까지 움직이는 현지 권력자로 올라선다.] => [#{chapter['state_change']}] || ending_hook=[미아인 본인 구속과 정유회사 인수가 실제로 닫힐지, 김태중의 다음 삶이 무엇일지가 남는다.] => [#{chapter['ending_hook']}] || closed_loops=[불법자금 공개·계좌동결과 정부 수습선.] => [#{chapter['closed_loops']}] || opened_loops=[미아인 구속, 정유회사 소유권, 김태중의 축구협회 도전.] => [#{chapter['opened_loops']}]"
  row_730 = table.find { |item| item["sequence"] == "730" }
  raise "missing semantic ledger 730" unless row_730
  fields = row_730["fields_changed"].to_s.split(";") | %w[paid_reward closed_loops]
  row_730["fields_changed"] = fields.join(";")
  row_730["reason"] = "L126046~L126215에서 실제 지급된 것은 젤렌스키에게 부패자금 회수 자료를 건네고 통신망·원전·자동차 재건 패키지와 휴전의 정치적 이득을 제시한 일이다. 휴전 결단·사업권·부패자금 회수 자체는 아직 전이므로 제안과 실행을 분리했다."
  row_730["before_after"] = "paid_reward=[젤렌스키에게 휴전 결단을 압박할 자료와 전후재건 대가가 모두 지급된다.] => [#{chapter_730['paid_reward']}] || closed_loops=[젤렌스키 설득자료 전달.] => [#{chapter_730['closed_loops']}] || ending_hook=[기존 다음 화 선취] => [#{chapter_730['ending_hook']}] || opened_loops=[기존 다음 화 선취] => [#{chapter_730['opened_loops']}]"
end

evidence = CSV.read(EVIDENCE_PATH, headers: true)
selected = evidence.select do |row|
  [row["tension_1_10"], row["reward_1_10"], row["hook_1_10"]].map(&:to_i).max >= 9 ||
    row["relationship_weight"].to_f >= 0.30
end
CSV.open(HIGH_PATH, "w", write_headers: true, headers: evidence.headers) do |csv|
  selected.each { |row| csv << evidence.headers.map { |field| row[field] } }
end

puts "PASS manager readbacks 610/730: semantic=EDIT phase=#{PHASE} ribbon610=#{WEIGHTS.values.join('/')} high=#{selected.length}"
