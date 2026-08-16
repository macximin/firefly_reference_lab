#!/usr/bin/env ruby
# frozen_string_literal: true

require "csv"
require "zlib"
require "rubygems/package"

ROOT = File.expand_path("../../../../../", __dir__)
CURRENT_PATH = File.join(ROOT, "analyses/doksik-chaebol3/chapter_map.csv")
ARCHIVE_PATH = File.join(ROOT, "exports/checkpoints/2026-08-14-doksik-pre-pacing-rework.tar.gz")
ARCHIVE_MEMBER = "analyses/doksik-chaebol3/chapter_map.csv"
OUTPUT_PATH = File.join(__dir__, "audit-ledger-251-500.csv")

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

# These reasons are manual source-reading judgments. The builder only pairs them
# with the exact before/after CSV values and hard-boundary line ranges.
REASONS = {
  257 => "L45727~L45913은 신화은행의 주간 출시 약속과 초안 검토까지다. 실제 상품 출시·계약 전이므로 은행이 이미 환율 도박꾼이 됐다는 완료 상태와 첫 상품 승인 닫힘을 되돌렸다.",
  263 => "L46767~L46931의 애플 파크는 스티브의 건설 요청안이고 애플카는 구두합의다. 정식 수주·소유 보상과 닫힌 루프를 계약 전 상태로 분리했다.",
  280 => "L49796~L49798은 대통령실장이 조만간 허가가 날 것이라고 약속한 장면이다. 실제 개발허가 취득으로 쓰지 않고 약속과 발급을 분리했다.",
  286 => "L50615~L50766에서 500억 달러 통화스와프는 실행됐지만 법안은 여야 추진 경로, 게임은 베타 승인 단계다. 통과·흥행 완료와 분리했다.",
  294 => "L52131~L52141은 67퍼센트 지분 구조와 정부·노조 지원 합의 뒤 최종 서명을 기다린다. GM 경영권·소유권 확보 완료를 다음 화 계약 전 상태로 되돌렸다.",
  307 => "L54275~L54288의 마지막 장면은 천민정이 AI·제약 결합 가능성을 먼저 알아보고 움직이는 프레임이다. 다음 화의 구체 개발 실행을 훅에서 당기지 않았다.",
  308 => "L54433~L54453에서 최남호는 충전기 지원을 약속하지만 경기도 전체 시범도시는 김민재의 제안으로 끝난다. 수락·실행 완료를 제거했다.",
  313 => "L55262~L55276은 다음 날 장경준 면담 일정과 목적을 여는 데 그친다. 실제 불개입 경고는 다음 화이므로 현재 훅에서 당기지 않았다.",
  318 => "L56116~L56130의 마지막 전환은 빈 살만 국부펀드 협력 가능성이다. 다음 화 머스크 면담을 현재 훅으로 가져오지 않았다.",
  330 => "L58124~L58138은 조영수가 현진해운 문제를 상의하자고 연락한 장면이다. 계약승계 협상을 이미 정한 것으로 구체화하지 않았다.",
  334 => "L58822~L58839에서 김민재의 기자회견은 준비·예고 상태다. 1만2천 명 대피와 비용 선언은 다음 화이므로 현재 훅에서 실행하지 않았다.",
  340 => "L59657~L59811에는 보스·전화·사무실·위장취업 경로와 다음 날 출국 준비까지만 있다. 현장 잠입·결정적 증거 확보·조직 해체 완료를 제거했다.",
  343 => "L60148~L60318은 로보 지분 약 30퍼센트와 다음 날 이사회 자리를 확보한다. 인슐린·mRNA·비만치료제 권리 취득은 협상 전이라 지급·닫힘에서 분리했다.",
  347 => "L60801~L60982의 30분 통화는 조지 부시에게 경제·안보 논리를 전달한 단계다. 텍사스 소유주 설득 부탁·지원 확답은 아직 없어 관심과 실제 개입을 분리했다.",
  350 => "L61355~L61505에는 와고너 부지와 베릴 운영 참여만 확정된다. 장비와 체서피크 협업·우선인수 조항은 설계·협상 전이므로 완료 보상에서 뺐다.",
  354 => "L62005~L62159에서 첫 야당 지위와 인슐린 개발은 실제 결실이지만 덴마크 비만치료제·지분은 서정준의 제안이다. 지급과 미지급을 나눴다.",
  376 => "L65934~L65985에서 로만은 크렘린에 보고해 허가를 받아오겠다고 약속한다. 러시아 정부 허가·운송로 확보 완료를 약속 단계로 되돌렸다.",
  377 => "L66130~L66170에서 리강은 주석에게 보고하고 계약 성사를 위해 노력하겠다고 답한다. 20년 장기계약과 끊기지 않는 자원 판로를 실제 체결·소유처럼 쓰지 않았다.",
  394 => "L69167~L69182는 워런에게 헤스 지분 임대와 아직 밝히지 않은 이벤트를 제안하는 장면이다. 버크셔 동맹·방패를 이미 얻었다는 지급 완료를 제거했다.",
  397 => "L69538~L69724에서 박만덕 퇴직·한정훈 취임은 인수인계·교육 단계이고 카노스의 전향만 실제로 닫힌다. 내부 승계 지급과 적 전향을 분리했다.",
  398 => "L69725~L69890은 카노스의 2주 사냥과 중국 자금 배치, 한정훈 교육·다음 달 이취임식 준비다. 실제 부회장 취임은 399화이므로 현재 지급에서 뺐다.",
  402 => "L70579~L70589은 오희건이 이번 주 지분을 넘기겠다고 약속한 장면이다. 실제 태우 지분 이전과 오용재 수락은 아직 열려 있어 소유 완료로 쓰지 않았다.",
  407 => "L71417~L71428은 제리 왕이 용선료 카드를 스스로 꺼내게 기다리는 협상 직전이다. 비용개선 수단 확보 완료를 데이터망 지급과 구분했다.",
  409 => "L71785~L71796에서 메르스 국내 긴급승인은 지급됐지만 FDA 방문·당뇨병 치료제 승인은 계획이다. 현장실사를 이미 수행한 행동과 글로벌 승인 완료를 제거했다.",
  411 => "L72131~L72141의 10억 달러는 호남 투자용으로 별도 배정한 예산이다. 군산·새만금 실제 집행과 표심 성과를 현재 화의 완료로 쓰지 않았다.",
  412 => "L72291~L72298에서 군산 5억 달러 발주만 실행됐고 새만금 5억 달러와 타기업 합계 20억 달러는 계획이다. 약속·집행 범위를 분리했다.",
  419 => "L73474~L73514은 ASML 지분 3퍼센트 매매 합의와 이번 주 실무진 파견 약속이다. 실제 지분 이전·장비 우선권 귀속을 완료 보상으로 당기지 않았다.",
  420 => "L73674~L73689은 금융타워에 PF 30조 원을 권유하라는 지시와 채울 수 있다는 추산이다. 30조·50조 실제 투자와 과반 의석을 지급 완료로 쓰지 않았다.",
  427 => "L74704~L74733에서 대통령은 하야를 선언했지만 대선 때까지 직을 유지한다. 실제 퇴임과 이양을 닫지 않고 선언·60일 대선 시계만 닫았다.",
  440 => "L76962~L77140의 현재 사건은 세계 4위 선복량 확인·미국 동맹 설계·연구진 방문 추진·반도체 도시 토지 점검이다. 직전 회차 로보 결산 반복과 중간 장면 훅을 실제 마지막 명동·토지 프레임으로 교체했다.",
  442 => "L77473~L77484은 김진우에게 편법·불법 목록을 내미는 영입 협상 시작이다. 실제 영입 완료를 훅에서 당기지 않고 법적 구제·합류 질문으로 남겼다.",
  443 => "L77485~L77653에서 김진우 팀은 합류를 결정하지만 누명 해소 판결은 아직이다. 마지막 프레임도 미국 후보 카드가 아니라 사드·미중 갈등에 쓸 자본 카드다.",
  444 => "L77830~L77841은 트럼프 당선 직후 감사가 남아 있을 때 해운 규제를 청구할 수 있다는 판단이다. 실제 요구·규제 실행은 이후로 남겼다.",
  446 => "L78208~L78215은 취임식 한 달 전 해운 동맹 문제를 해결할 계획이다. 취임식에서 규제를 이미 실행한 것처럼 쓰지 않았다.",
  449 => "L78734~L78738은 다음 날 애플 신사옥 완공식 소식을 듣고 즉시 이동해야 하는 장면이다. 스티브와의 실제 만남은 450화이므로 선취를 제거했다.",
  450 => "L78901~L78912은 알트코인 시장을 금융사들에 제안하고 예상 차익을 계산한다. 실제 공급·운용 완료가 아니라 승선 여부의 질문으로 남겼다.",
  452 => "L79091~L79276에서 자동화 팹과 5G는 투자 승인 단계다. 범용 반도체 독점·원가우위가 이미 지급된 상태로 바꾸지 않았다.",
  453 => "L79448~L79459은 2월 13일 말레이시아 작전의 인력·의료지원 계획이다. 강 대위가 현장에서 공격을 기다리는 실행은 다음 화이므로 질문으로 남겼다.",
  455 => "L79835~L79845은 사우디 정부가 빈 살만의 방한을 예고한 장면이다. 실제 방한과 대규모 자본 협상을 현재 화에 당기지 않았다.",
  460 => "L80532~L80714은 공연장 규제 철폐 방향·태우건설 이관과 반값 망사용료 계약 지시다. 실제 공사·계약 체결을 완료 상태와 닫힌 루프에서 분리했다.",
  461 => "L80715~L80890은 기존 해저케이블 지분 매매·엔비디아 담보대출 합의 뒤 새 한국-미국 케이블 준비를 지시한다. 새 공동투자 계약·착공을 아직 실행된 것으로 쓰지 않았다.",
  467 => "L81874~L81885의 마지막 프레임은 대학원생 여섯 명의 AI 사무프로그램에 장학금·취업·특허 매입을 지시하는 장면이다. 1만 명 채용·특허 이전 완료와 초기 보고 훅을 바로잡았다.",
  469 => "L82237~L82248에서 도요타는 가격을 받아들이고 일본 기업연합 구성 시간을 요청한다. 매각 계약·대금 회수를 완료 보상으로 쓰지 않았다.",
  477 => "L83677~L83688에서 도시바는 러시아 계약파기를 전화로 요청하고 김민재가 면담 일정을 잡게 한다. 실제 방문·협상은 478화이므로 선취를 제거했다.",
  479 => "L83857~L84015은 반독점 해결 약속·석유사 인수 의사·800억~1천억 달러 추산과 연말 숏 계획이다. 인수·유전매각·대금 순환 완료로 쓰지 않았다.",
  480 => "L84016~L84191은 웨스팅하우스 가격 합의 뒤 도시바메모리 약점을 파고드는 장면이다. 실제 소유권 이전·반독점 승인과 메모리 계약을 남겼다.",
  485 => "L85053~L85064의 마지막 프레임은 비트코인 저점을 정확히 잡은 국민연금 운용자를 보복 대신 영입하라는 지시다. 센트리언·연금 매수 반복 훅을 실제 마지막 질문으로 바꿨다.",
  492 => "L86108~L86288에서 400억 달러 투자·5년 선납·25퍼센트 유상증자는 조건부 제안이고 젝슨 황은 다음 날 대주주 회의 지원만 약속한다. 계약·입금을 완료로 쓰지 않았다.",
  496 => "L86991~L87002은 니콜라 지분을 2주 안에 팔고 매각대금·본사자금을 새만금에 넣으라는 김성윤의 결정이다. 실제 매각·자금 집행을 지급 완료와 닫힌 루프에서 분리했다."
}.freeze

current = CSV.read(CURRENT_PATH, headers: true)
original = CSV.parse(archived_text(ARCHIVE_PATH, ARCHIVE_MEMBER), headers: true)
current_by_sequence = current.each_with_object({}) { |row, out| out[row["sequence"].to_i] = row }
original_by_sequence = original.each_with_object({}) { |row, out| out[row["sequence"].to_i] = row }

headers = [
  "sequence", "visible_label", "start_line", "end_line", "status", "fields_changed",
  "evidence_lines", "reason", "before_after"
]

edited_sequences = []
CSV.open(OUTPUT_PATH, "w", write_headers: true, headers: headers) do |csv|
  (251..500).each do |sequence|
    now = current_by_sequence.fetch(sequence)
    before = original_by_sequence.fetch(sequence)
    changed_fields = current.headers.select { |field| now[field] != before[field] }
    status = changed_fields.empty? ? "PASS" : "EDIT"

    start_line = now["start_line"].to_i
    end_line = now["end_line"].to_i
    adjacent = []
    adjacent << "prev L#{[1, start_line - 10].max}~L#{start_line - 1}" if start_line > 1
    adjacent << "hard L#{start_line}~L#{end_line}"
    adjacent << "next L#{end_line + 1}~L#{end_line + 10}"

    if status == "PASS"
      reason = "현재 action·turn_or_reveal·paid_reward·state_change·ending_hook·closed_loops·opened_loops가 이 회차 하드 경계와 일치하고, 계획·계약 전 상태나 인접 화의 구체 결과를 선취하지 않는다."
      before_after = ""
    else
      edited_sequences << sequence
      reason = REASONS.fetch(sequence) { abort("No manual reason for edited sequence #{sequence}") }
      before_after = changed_fields.map do |field|
        "#{field}=[#{before[field]}] => [#{now[field]}]"
      end.join(" || ")
    end

    csv << [
      sequence,
      now["visible_label"],
      start_line,
      end_line,
      status,
      changed_fields.join(";"),
      adjacent.join("; "),
      reason,
      before_after
    ]
  end
end

extra_reasons = REASONS.keys - edited_sequences
missing_reasons = edited_sequences - REASONS.keys
abort("Unused manual reasons: #{extra_reasons.join(', ')}") unless extra_reasons.empty?
abort("Missing manual reasons: #{missing_reasons.join(', ')}") unless missing_reasons.empty?

puts "wrote #{OUTPUT_PATH} rows=250 edits=#{edited_sequences.length} pass=#{250 - edited_sequences.length}"
