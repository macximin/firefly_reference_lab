#!/usr/bin/env ruby
# frozen_string_literal: true

require "csv"

work = File.expand_path(__dir__)
arc_path = File.join(work, "arc_map_251_500.csv")
chapter_paths = [
  File.join(work, "chapter_map_151_250.csv"),
  File.join(work, "chapter_map_251_500.csv")
]

headers = %w[
  arc_id arc_name start_sequence end_sequence start_label end_label episode_count
  main_characters main_locations concrete_premise central_question promise
  pressure_escalation mid_turn concrete_payoff relationship_change
  status_or_ability_change residual_cost next_arc_bridge boundary_signals confidence
]

specs = [
  [21, 352, 356, "금융타워와 직원의 새 시작", "김민재·한정훈·최재석·서정준", "금융타워 신사옥·국민경제당·센트리언"],
  [22, 357, 361, "신사옥과 중임제 개혁", "김민재·천민정·오희건·머스크·최재석", "태우 신사옥·금융타워·대선 토론장"],
  [23, 362, 365, "대선 사퇴와 스타링크 전환", "김민재·최재석·머스크·재벌 회장단", "대선 토론장·미국 기술현장·용산"],
  [24, 366, 375, "독사과와 삼진 승계전", "김민재·김태중·오용재·진동구·진동우", "재계 회장단·삼진그룹·러시아"],
  [25, 376, 380, "러시아 손잡기와 사우디 화해", "김민재·로만·빈 살만·살만·한정훈", "축구 자선행사·러시아·사우디·금융타워"],
  [26, 381, 385, "유가전쟁과 가이아나 인수", "김민재·천민정·오바마·한정훈·헤스 경영진", "태우 AI 연구소·백악관·가이아나·월가"],
  [27, 386, 390, "헤스 인수와 카노스의 타이밍", "김민재·카노스·헤스 이사회·미국 정부", "헤스 본사·월가·가이아나 유전"],
  [28, 391, 395, "가이아나 발견과 공매도 반격", "김민재·빈 살만·카노스·퀀텀펀드", "가이아나 유전·사우디·월가"],
  [29, 396, 400, "공개매수와 카노스 갈취", "김민재·카노스·한정훈·워런·조지", "월가·헤스 공개매수 시장·덴마크"],
  [30, 401, 405, "유고빈 잭팟과 중국 숏", "김민재·서정준·오용재·한정훈", "덴마크 제약사·센트리언·중국 금융시장·삼진"],
  [31, 406, 410, "메르스 대응과 좋은 오해", "김민재·서정준·정부 방역진·금융타워", "센트리언 R&D센터·메르스 병동·금융타워"],
  [32, 411, 415, "브렉시트·사드와 격변의 서막", "김민재·최재석·트럼프·강준용", "새만금·군산·미국 대선 캠프·중국 시장"],
  [33, 416, 420, "중국 폭락·ASML·50조 수확", "김민재·오용재·최재석·이영한", "중국 증시·반도체 공급망·국민경제당"],
  [34, 421, 425, "총선 미끼와 대통령 하야 전야", "김민재·최재석·장명준·이명걸", "국민경제당·채권단·청와대·언론사"],
  [35, 426, 430, "대통령 하야·700조 도시·해운 통합", "김민재·최재석·이영한·해운 채권단", "청와대·반도체 도시·채권단 회의"],
  [36, 431, 435, "대한타이어와 사우디 왕자의 난", "김민재·주성재·빈 살만·최재석·데이비드", "대한타이어·사우디·한국 대선·미국 연구기관"],
  [37, 436, 440, "용선료·노보·해운동맹 재협상", "김민재·제리 왕·러스·데이비드", "태우해운 협상장·센트리언·미국 해운시장"],
  [38, 441, 445, "유전자 가위와 미국 규제 활용", "김민재·김진우·버클리·브로드 연구진·트럼프", "센트리언·IIT·미국 대선 캠프·태우반도체"],
  [39, 446, 450, "칭화 역정보와 해운 눈에는 눈", "김민재·천민정·트럼프·머스크 경영진·스티브", "태우반도체·백악관·글로벌 해운시장·애플 신사옥"],
  [40, 451, 455, "이더리온과 북한 생존 변수", "김민재·강대위·최재석·천민정", "금융타워·태우반도체·말레이시아 공항"],
  [41, 456, 460, "사우디·국민연금 거대 자본", "김민재·빈 살만·최재석·진동우", "금융타워·청와대·게임시장·공연장 사업지"],
  [42, 461, 465, "통신·유전 지분 참여", "김민재·이주영·손정우·트럼프", "태우통신·백악관·알래스카·가이아나"],
  [43, 466, 470, "코로나·중러 철수 대비", "김민재·한정훈·최재석·장경준·도요타", "새만금·중국·러시아 자동차 공장·금융타워"],
  [44, 471, 475, "일본 품질비리 저점매수", "김민재·한정훈·최재석·이영한·사토 켄지", "중국·몽골 운송로·청와대·태우 부품연구소"],
  [45, 476, 480, "일본차·도시바 대규모 악재", "김민재·한정훈·베릴·도시바 경영진", "방송사·일본 자동차시장·도시바·금융타워"],
  [46, 481, 485, "도시바·유전·워런 전문가", "김민재·한정훈·워런·도시바 경영진", "도시바·유전 경매시장·핀테크은행·오마하"],
  [47, 486, 490, "엔비디아와 생명 약속의 시간", "김민재·서정준·손정우·트럼프·머스크", "센트리언·스마트 팹·백악관·테슬라"],
  [48, 491, 495, "엔비디아·청나라 채권 장난질", "김민재·젝슨 황·리사·리강·데이비드", "엔비디아·미중 관세시장·홍콩·대만·금융타워"],
  [49, 496, 500, "니콜라·희토류·코로나 훼방꾼", "김민재·김정권·김태중·최재석·서정준", "새만금·베트남 동파오·청와대·센트리언"]
]

chapters = chapter_paths.flat_map { |path| CSV.read(path, headers: true).map(&:to_h) }
chapters_by_sequence = chapters.to_h { |row| [row.fetch("sequence").to_i, row] }

existing = CSV.read(arc_path, headers: true).map(&:to_h).select do |row|
  row.fetch("arc_id").split("A").last.to_i <= 20
end

clean = ->(value) { value.to_s.gsub(/[\r\n]+/, " ").strip }

generated = specs.map do |number, start_sequence, end_sequence, name, characters, locations|
  rows = (start_sequence..end_sequence).map { |sequence| chapters_by_sequence.fetch(sequence) }
  first = rows.first
  middle = rows[rows.length / 2]
  last = rows.last
  {
    "arc_id" => format("S2-A%02d", number),
    "arc_name" => name,
    "start_sequence" => start_sequence,
    "end_sequence" => end_sequence,
    "start_label" => first.fetch("visible_label"),
    "end_label" => last.fetch("visible_label"),
    "episode_count" => rows.length,
    "main_characters" => characters,
    "main_locations" => locations,
    "concrete_premise" => clean.call(first.fetch("action")),
    "central_question" => clean.call("#{first.fetch("protagonist_goal")}라는 목표를 압박 속에서 결산하는가?"),
    "promise" => clean.call(first.fetch("reader_promise")),
    "pressure_escalation" => clean.call("#{first.fetch("resistance_or_cost")} 이어 #{middle.fetch("resistance_or_cost")}"),
    "mid_turn" => clean.call(middle.fetch("turn_or_reveal")),
    "concrete_payoff" => clean.call(last.fetch("paid_reward")),
    "relationship_change" => clean.call("#{middle.fetch("state_change")}를 거쳐 #{last.fetch("state_change")}"),
    "status_or_ability_change" => clean.call(last.fetch("state_change")),
    "residual_cost" => clean.call(last.fetch("opened_loops")),
    "next_arc_bridge" => clean.call(last.fetch("ending_hook")),
    "boundary_signals" => clean.call("#{start_sequence}화에서 #{first.fetch("title")}의 새 목표·상대·장소가 시작됨; #{end_sequence}화에서 #{last.fetch("closed_loops")}를 닫고 #{last.fetch("opened_loops")}를 새로 엶"),
    "confidence" => "high"
  }
end

all_arcs = existing + generated
CSV.open(arc_path, "w", write_headers: true, headers: headers, force_quotes: true) do |csv|
  all_arcs.each { |row| csv << headers.map { |header| row.fetch(header) } }
end

section_path = File.join(work, "arc_sections_251_500.md")
section_rows = chapters.select { |row| row.fetch("sequence").to_i.between?(247, 500) }
section_rows_by_arc = section_rows.group_by { |row| row.fetch("arc_id") }

File.open(section_path, "w") do |file|
  file.puts "# Arc Sections · 독식하는 재벌 3세 · sequence 247~500"
  file.puts
  file.puts "> 247~250화는 공유 경계 Arc S2-A01의 문맥만 포함하며, 담당 화별 CSV에는 중복하지 않는다. S2-A49는 500화에서 닫지 않고 501화 코로나 생산망 실행으로 연결한다."
  file.puts
  all_arcs.each do |arc|
    file.puts "## #{arc.fetch("arc_id")} · #{arc.fetch("arc_name")}"
    file.puts
    file.puts "- 범위: #{arc.fetch("start_sequence")}~#{arc.fetch("end_sequence")}화 · #{arc.fetch("episode_count")}화"
    file.puts "- 인물·장소: #{arc.fetch("main_characters")} · #{arc.fetch("main_locations")}"
    file.puts "- 전제·중심 질문: #{arc.fetch("concrete_premise")} / #{arc.fetch("central_question")}"
    file.puts "- 약속·압박: #{arc.fetch("promise")} / #{arc.fetch("pressure_escalation")}"
    file.puts "- 중간 전환·결산: #{arc.fetch("mid_turn")} / #{arc.fetch("concrete_payoff")}"
    file.puts "- 관계·지위 변화: #{arc.fetch("relationship_change")} / #{arc.fetch("status_or_ability_change")}"
    file.puts "- 잔여 비용·다음 다리: #{arc.fetch("residual_cost")} / #{arc.fetch("next_arc_bridge")}"
    file.puts "- 경계 신호: #{arc.fetch("boundary_signals")}"
    file.puts
    file.puts "### 화별 비트"
    file.puts
    section_rows_by_arc.fetch(arc.fetch("arc_id")).each do |row|
      event = clean.call(row.fetch("action"))
      hook = clean.call(row.fetch("ending_hook"))
      file.puts "- #{row.fetch("sequence")}화 · #{event} → #{hook}"
    end
    file.puts
  end
end
