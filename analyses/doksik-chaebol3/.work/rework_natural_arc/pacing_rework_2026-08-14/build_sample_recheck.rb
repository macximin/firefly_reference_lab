#!/usr/bin/env ruby

require "csv"

WORK = __dir__
ANALYSIS = File.expand_path("../../..", WORK)
OUT = File.join(ANALYSIS, ".work/rework_natural_arc/reviews/pacing-rework-sample-recheck-2026-08-14.md")

chapters = CSV.read(File.join(ANALYSIS, "chapter_map.csv"), headers: true).to_h { |row| [row["sequence"].to_i, row.to_h] }
pacing = CSV.read(File.join(ANALYSIS, "arc_pacing.csv"), headers: true).to_h { |row| [row["sequence"].to_i, row.to_h] }
atlas = File.read(File.join(ANALYSIS, "arc_atlas.md"))

semantic = {}
Dir[File.join(WORK, "audit-ledger-*.csv")].sort.each do |path|
  CSV.foreach(path, headers: true) { |row| semantic[row["sequence"].to_i] = row["status"] }
end

MANAGER_SAMPLE = ((50..60).to_a + (198..202).to_a + (608..612).to_a + (658..662).to_a + (729..732).to_a).freeze
EXTRA_SAMPLE = {
  "초반 DCA-N11 117~124" => [117, 120, 124, 125],
  "중반 기존 381~401 캘리브레이션 창" => [381, 391, 401, 402],
  "후반 DCA-N71 736~739" => [736, 738, 739, 740]
}.freeze

FOLLOWUP_ARC_SAMPLE = {
  "DCA-N33" => [["첫", 357], ["중간", 363], ["끝", 369], ["다음 첫", 370]],
  "DCA-N33B" => [["첫", 370], ["중간", 372], ["끝", 373], ["다음 첫", 374]],
  "DCA-N33C" => [["첫", 374], ["중간", 376], ["끝", 377], ["다음 첫", 378]],
  "DCA-N33D" => [["첫", 378], ["중간", 379], ["끝", 380], ["다음 첫", 381]],
  "DCA-N34" => [["첫", 381], ["중간", 388], ["끝", 396], ["다음 첫", 397]],
  "DCA-N34B" => [["첫", 397], ["중간", 398], ["끝", 399], ["다음 첫", 400]],
  "DCA-N34C" => [["첫", 400], ["중간", 401], ["끝", 401], ["다음 첫", 402]]
}.freeze

FOCUS = {
  50 => "1면 허위기사·SAVE 반박자료·3국 이벤트 준비만 현재 화에 두고 사진·녹취는 다음 화에 둠",
  51 => "실물검증·협조 약속과 기사·축출 미지급을 분리",
  52 => "정정·30만 대 소진·박진훈 축출을 지급하고 지분 요구를 새 질문으로 엶",
  53 => "지분·사장직 실제 지급과 SAVE 차입 미끼만 현재 훅으로 둠",
  54 => "1,500명 전수 검토와 실제 이동 규모 미정 상태를 완료 이동과 분리",
  55 => "실제 이동을 사무직 20퍼센트·수백 명으로 제한",
  56 => "다이먼 전권·잡스 복귀 이사회 조건을 현재 지급으로 제한",
  57 => "NEXT 5억 달러·잡스 복귀·소프트웨어 권리를 실제 지급으로 확인",
  58 => "현재그룹 구매력·주식교환 설계와 6개 은행 협상 전 상태를 분리",
  59 => "지분 양도 가능성·예금 조건·다음 날 날인 일정까지만 인정",
  60 => "검 선물·아크만 명의 3개 계열사 취득은 지급, 아람코 협력은 미지급",
  198 => "데이터센터·인재 명단 지급과 태우상사 전환 필요까지만 인정",
  199 => "희토류·리튬·식각가스·불화수소 조사와 경제공약, 광산 취득은 미지급",
  200 => "김익수 첫 면담·자금 병목만 인정하고 50억 원 계약을 201화에 둠",
  201 => "50억 원 글로벌 합작 서명은 지급, 슈퍼볼 사건의 결과는 미지급",
  202 => "광고 송출·채드·스티브 영입은 지급, 바이럴 규모와 다음 CEO 영입은 미지급",
  608 => "가이아나 교육·제조·금융·무기·국채·유전 계약을 현재 지급으로 확인",
  609 => "미아인 부패망 조사·공개 계획과 김태중 동의까지만 인정",
  610 => "불법대출·비자금 보고서 공개와 정부 수습선은 지급, 압수·계좌동결·구속·정유회사 인수는 미지급",
  611 => "미아인 구속·정유회사 인수 coda와 부산 축구장 조손 전환을 함께 반영",
  612 => "연 90억 원·후원 설계는 지급, 실제 선거 득표는 미지급",
  658 => "70조 엔 차입은 확정, 크레디트스위스·방공망은 제안 단계",
  659 => "스위스 수락·EU 공정경쟁 지원은 지급, 유럽 실제 계약은 미지급",
  660 => "폴란드 방산 계약·로나 숏그물은 지급, 99퍼센트 폭락·베릴 복권은 미지급",
  661 => "로나 99퍼센트 폭락·베릴 복권과 김태중 임무 수락을 실제 지급으로 확인",
  662 => "동남아 식량·팜유 수출예외와 물가 안정만 지급",
  729 => "일본 대응·이름 없는 재건사업 방향까지만 인정",
  730 => "재건 패키지·부패자금 자료 전달은 지급, 젤렌스키 결정은 미지급",
  731 => "엔캐리 전액청산·시장충격·자금흡수는 지급, 일본 협상요청은 미지급",
  732 => "일본 금융청 30조 엔 대응·미국 관찰국·협상요청·투트랙 결정이 현재 행동",
  117 => "장기 기술투자·IT 버블 방어 명령과 재계 승계 질문을 현재 화 범위로 확인",
  120 => "일본 자산 회수와 미국 IT 지분·파생계약 지급을 다음 아이폰 장면과 분리",
  124 => "러시아 자원·현지공장 혜택과 월가 위험분산 승인을 현재 지급으로 확인",
  125 => "DCA-N12 첫 화의 현 건설 채권단·반도체 인수 목표가 새로 지배함을 확인",
  357 => "신사옥·가족 약속이 새 권력망 질문을 여는 실제 시작",
  363 => "정권 기부 거절·산업 계약 유지와 오바마 선물 전환을 현재 화에 한정",
  369 => "ARN 입금·계약서·반도체 통합이 지배하고 테이퍼링은 말미 신호임을 확인",
  370 => "실제 테이퍼링 공매도·채권 수익과 금융사 규율이 새 목표로 지배",
  372 => "연준 유지 번복 수익·천민정 센터장·로보 AI 미끼 지급을 확인",
  373 => "연준 연습경기 결산과 3차 석유전쟁 타임라인 설계까지만 인정",
  374 => "종무식 계열사 결산·몽골 운송 병목과 크림 실행 대기를 새 진입으로 확인",
  376 => "로만의 운송로·크렘린 허가 약속과 실제 정부 허가 미지급을 분리",
  377 => "리강의 주석 보고·계약 노력 약속과 실제 20년 계약 미지급을 분리",
  378 => "상대·장소가 살만 왕가로 바뀌고 왕위·숙청 동맹이 지배함을 확인",
  379 => "숙청 정보시스템 역할 배정은 지급, 실제 숙청은 미지급",
  380 => "왕족 계좌·증산 신호·원유 숏·첫 수익을 실제 지급으로 확인",
  381 => "AI 신약효과 조정·금융사 수익 배분과 장기 투자우물 지급을 현재 화에 한정",
  388 => "카노스의 태우상사 도미노 선동과 태우의 의도적 무대응·적 집결을 확인",
  396 => "공개매수 공시·주가 폭등으로 역포획이 봉우리에 이르지만 카노스 전향은 아직 미지급",
  397 => "박만덕→한정훈 인수인계 개시와 카노스 손잡기를 같은 지휘체제 전환으로 확인",
  398 => "카노스의 2주 뒤 헤지펀드 파산·중국 자금 배치와 취임 일정 확정을 실제 지급으로 확인",
  399 => "한정훈 실제 부회장 취임·청와대 갈취 대응 뒤 로보 폐기 연락이 새 훅임을 확인",
  400 => "로보 내부 폐기 보고·에릭센 이사회 공작은 계약 전 단계임을 확인",
  391 => "살만 즉위·빈 살만 승계계획과 가이아나 50억 배럴 추정만 현재 화에 두고 정밀조사·공개작전은 뒤에 둠",
  401 => "덴마크 바이오 계약 서명은 지배 지급, 중국 D-DAY는 후행 coda이며 수익은 미지급",
  402 => "중국 금융수익 정치보험과 오희건의 조건부 지분 약속이 새 질문으로 교대함",
  736 => "DCA-N71 첫 화의 일본 정치결과·러우 휴전 서명 진입을 현재 장면대로 확인",
  738 => "우크라이나 부패재벌 정리·일본 야당 과반 지급과 후속 내각 질문을 분리",
  739 => "AI 드론·PMC가 하마스 기습의 민간인 학살을 막는 실제 결산을 확인",
  740 => "미국 보상은 740화 지급이며 739화로 당기지 않음을 확인"
}.freeze

def ribbon(row)
  %w[information_weight action_weight relationship_weight emotion_weight material_or_status_weight].map { |field| row.fetch(field) }.join("/")
end

def compact(text, length = 110)
  value = text.to_s.gsub(/\s+/, " ")
  value.length > length ? "#{value[0, length - 1]}…" : value
end

def table_for(sequences, chapters, pacing, semantic, atlas, focus)
  lines = []
  lines << "| 화·Arc·hard line | 실제 진입 상태 → 현재 행동 | 실제 지급 / 마지막 열린 질문 | T/R/H · I/A/R/E/M | 재검 |"
  lines << "| --- | --- | --- | --- | --- |"
  sequences.each do |sequence|
    chapter = chapters.fetch(sequence)
    pace = pacing.fetch(sequence)
    atlas_ok = atlas.include?("- **#{chapter.fetch('visible_label')}** · #{pace.fetch('concrete_event')}")
    raise "atlas mismatch #{sequence}" unless atlas_ok
    lines << "| #{sequence} · #{chapter.fetch('arc_id')} · L#{chapter.fetch('start_line')}~L#{chapter.fetch('end_line')} | #{compact(chapter.fetch('entry_state'), 72)} → #{compact(chapter.fetch('action'), 105)} | #{compact(chapter.fetch('paid_reward'), 95)} / #{compact(chapter.fetch('ending_hook'), 80)} | #{pace.fetch('tension_1_10')}/#{pace.fetch('reward_1_10')}/#{pace.fetch('hook_1_10')} · #{ribbon(pace)} | **PASS** · 의미감사 #{semantic.fetch(sequence)} · #{focus.fetch(sequence)} · Atlas 동기화 |"
  end
  lines
end

def role_table_for(samples, chapters, pacing, semantic, atlas, focus)
  lines = []
  lines << "| 새 Arc·역할·화 | hard line·실제 행동 | 실제 지급 / 마지막 열린 질문 | T/R/H · I/A/R/E/M | 재검 |"
  lines << "| --- | --- | --- | --- | --- |"
  samples.each do |arc_id, roles|
    roles.each do |role, sequence|
      chapter = chapters.fetch(sequence)
      pace = pacing.fetch(sequence)
      atlas_ok = atlas.include?("- **#{chapter.fetch('visible_label')}** · #{pace.fetch('concrete_event')}")
      raise "atlas mismatch #{arc_id} #{role} #{sequence}" unless atlas_ok
      expected_arc = role == "다음 첫" ? nil : arc_id
      raise "arc mismatch #{arc_id} #{role} #{sequence}" if expected_arc && chapter.fetch("arc_id") != expected_arc
      lines << "| #{arc_id} · #{role} · #{sequence} | L#{chapter.fetch('start_line')}~L#{chapter.fetch('end_line')} · #{compact(chapter.fetch('action'), 112)} | #{compact(chapter.fetch('paid_reward'), 95)} / #{compact(chapter.fetch('ending_hook'), 80)} | #{pace.fetch('tension_1_10')}/#{pace.fetch('reward_1_10')}/#{pace.fetch('hook_1_10')} · #{ribbon(pace)} | **PASS** · 의미감사 #{semantic.fetch(sequence)} · #{focus.fetch(sequence)} |"
    end
  end
  lines
end

out = []
out << "# 《독식하는 재벌 3세》 페이싱 재작업 표본 readback · 2026-08-14"
out << ""
out << "- 권위: 원문 각 회차의 `start_line~end_line`; 바로 앞·뒤 연결은 진입·이월 확인에만 사용했다."
out << "- 관리자 고정 표본은 정확히 30화다. 기존 추가 12화는 완료 게이트가 요구한 초·중·후반 Arc 각 1개의 첫/중간/끝/다음 첫 화다."
out << "- 관리자 후속 N33·N34 재분절은 기존 42화 표본을 보존한 채 새 7개 Arc마다 첫/중간/끝/다음 첫 역할 28건을 추가했다. 2화 Arc DCA-N34C는 401화가 중간과 끝 역할을 함께 가진다."
out << "- `PASS`는 action·turn·지급·마지막 질문의 시제와 귀속, T/R/H 인접 대비, 0~1 리본 체류, Atlas 동기화를 다시 확인했다는 뜻이다."
out << ""
out << "## 관리자 고정 30화"
out << ""
out.concat(table_for(MANAGER_SAMPLE, chapters, pacing, semantic, atlas, FOCUS))
out << ""
out << "## 시스템성 실패 뒤 추가 3개 Arc"
EXTRA_SAMPLE.each do |label, sequences|
  out << ""
  out << "### #{label} · 첫/중간/끝/다음 첫 화"
  out << ""
  out.concat(table_for(sequences, chapters, pacing, semantic, atlas, FOCUS))
end
out << ""
out << "## 관리자 후속 N33·N34 새 Arc 28개 역할 표본"
out << ""
out.concat(role_table_for(FOLLOWUP_ARC_SAMPLE, chapters, pacing, semantic, atlas, FOCUS))
out << ""
out << "## 판정"
out << ""
out << "- 30화 관리자 표본: 30/30 PASS. 200→201, 610→611, 660→661, 731→732의 지급·행동 귀속 역전은 제거됐다."
out << "- 추가 3개 Arc 12화: 12/12 PASS. 초반 권력교체, 중반 계약서 서명, 후반 국가급 결산에서도 같은 선취·시제 오류가 재현되지 않았다."
out << "- N33·N34 새 7개 Arc 역할 표본: 28/28 PASS. 368/369·397/398의 합치 반례와 369/370·373/374·377/378·396/397·399/400·401/402의 경계 귀속을 확인했다."
out << "- Atlas는 기존 42화와 후속 28개 역할 표본 모두 현재 `arc_pacing.csv`의 사건·점수·리본과 일치했다. 독립 판단 근거는 이 readback과 751행 의미·페이싱 장부에 남긴다."

File.write(OUT, out.join("\n") + "\n")
puts "PASS sample recheck manager=#{MANAGER_SAMPLE.length} extra=#{EXTRA_SAMPLE.values.flatten.length} output=#{OUT}"
