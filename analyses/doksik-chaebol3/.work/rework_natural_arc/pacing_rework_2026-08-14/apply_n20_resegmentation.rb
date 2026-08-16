#!/usr/bin/env ruby

require "csv"

ANALYSIS = File.expand_path("../../..", __dir__)
ARC_PATH = File.join(ANALYSIS, "arc_map.csv")
CHAPTER_PATH = File.join(ANALYSIS, "chapter_map.csv")
PACING_PATH = File.join(ANALYSIS, "arc_pacing.csv")

ARC_HEADER = %w[
  arc_id arc_name start_sequence end_sequence start_label end_label episode_count
  main_characters main_locations concrete_premise central_question promise
  pressure_escalation mid_turn concrete_payoff relationship_change
  status_or_ability_change residual_cost next_arc_bridge boundary_signals confidence
].freeze

def arc_row(id:, name:, first:, last:, people:, places:, premise:, question:, promise:,
            pressure:, turn:, payoff:, relationship:, status:, residual:, bridge:,
            boundary:, confidence: "0.98")
  {
    "arc_id" => id,
    "arc_name" => name,
    "start_sequence" => first.to_s,
    "end_sequence" => last.to_s,
    "start_label" => first.to_s,
    "end_label" => last.to_s,
    "episode_count" => (last - first + 1).to_s,
    "main_characters" => people,
    "main_locations" => places,
    "concrete_premise" => premise,
    "central_question" => question,
    "promise" => promise,
    "pressure_escalation" => pressure,
    "mid_turn" => turn,
    "concrete_payoff" => payoff,
    "relationship_change" => relationship,
    "status_or_ability_change" => status,
    "residual_cost" => residual,
    "next_arc_bridge" => bridge,
    "boundary_signals" => boundary,
    "confidence" => confidence
  }
end

NEW_ARCS = [
  arc_row(
    id: "DCA-N20",
    name: "천민우를 지키고 국민경제당·원자재 방벽을 세우다",
    first: 192,
    last: 199,
    people: "김민재·김태중·천민정·천민우·추영택·조영희·최재석",
    places: "태우 부회장실·천민우 학교·학부모 회의장·태우 본사·부산 데이터센터 협상선·태우상사",
    premise: "최재석 중심의 독자 정치세력을 구상하던 김민재가 경호 영상에서 천민우의 학교폭력을 발견하고, 경호·영상·화원정밀 거래중단·검찰 상급선을 동원해 사과와 전학을 받아낸 뒤 최재석의 국민경제당과 태우상사의 전략 원자재 조사로 보호 방벽을 넓힌다(L34777~L36165).",
    question: "김민재는 천민우를 검사 가족의 보복에서 실제로 지키고 그 보호 원칙을 독자 정치조직과 제조업 공급망 임무로 바꿀 수 있는가?",
    promise: "경호 영상과 학부모 회의, 화원정밀 거래중단, 공개 사과·전학, 최재석의 창당 수락, 부산 데이터센터·인재 명단, 희토류·리튬·식각가스·불화수소 조사 지시를 차례로 지급한다.",
    pressure: "추영택의 상습 폭행과 부장검사 아버지·화원정밀 외가·학교 묵인이 맞서고, 사건 결산 뒤에는 양당 정쟁과 태우상사의 낮은 실적·해외 원재료 의존이 새 압박이 된다.",
    turn: "195화에 추영택 가족의 사과와 전학이 확정된 뒤, 천민정의 딥러닝 성과와 김태중의 법적 방패가 최재석의 국민경제당·부산 데이터센터 협상으로 보호의 범위를 바꾼다.",
    payoff: "천민우의 당일 구출과 추영택의 공개 사과·전학, 천민우의 안전, 천민정의 신뢰, 최재석의 창당 수락과 기업 개입 경계, 부산 데이터센터·인재 명단, 태우상사의 전략 원자재 조사 임무가 지급된다.",
    relationship: "천민우와 천민정은 김민재를 가족 보호자로 받아들이고, 김태중은 손자의 정치 위험을 나누며, 최재석은 재벌의 꼭두각시가 아니라 국가사업만 협력하는 정치 동맹이 된다.",
    status: "천민우 문제는 개인 피해에서 태우가 공식 보호하는 직원 가족 사안으로 바뀌고, 국민경제당은 지도자·지원 원칙을 얻으며 태우상사는 전략 원자재 조사 주체가 된다.",
    residual: "국민경제당의 실제 의석과 원자재 권리 확보는 아직 남는다. 판타지TV·리사 수·서브프라임 보험·IIT·씽크윈은 이 Arc의 지급이 아니다.",
    bridge: "199화 말 김민재는 태우상사에 희토류·리튬·식각가스·불화수소 조사와 국민경제당의 경제 공약을 지시한다. 200화 첫 장면부터 CES 이후 판타지TV 김익수의 서버비·망사용료·글로벌 자금 병목을 묻는 별도 면담이 시작된다(L36009~L36346).",
    boundary: "(1) 지배 목표가 가족·정치·원자재 방벽에서 글로벌 영상 플랫폼 합작으로 교대한다. (2) 상대와 장소가 최재석·학교·태우상사에서 김익수·태우 부회장실의 판타지TV 면담으로 바뀐다. (3) 압박이 권력형 폭력·양당 정쟁·공급망에서 서버비·망사용료·저작권·세계화 비용으로 바뀐다."
  ),
  arc_row(
    id: "DCA-N20B",
    name: "판타지TV 50억 합작과 슈퍼볼 영상팀을 세우다",
    first: 200,
    last: 202,
    people: "김민재·김익수·천민정·데이비드·채드 헐리·스티브 첸",
    places: "태우 부회장실·판타지TV 협상실·미국 슈퍼볼 방송 현장·태우 영상서비스 준비팀",
    premise: "김민재가 김익수를 불러 국내 서비스의 서버·저작권·망사용료 한계를 짚고, 다음 날이 아니라 같은 면담의 다음 회차에서 50억 원과 애플·구글·아마존 합작 조건을 계약한 뒤 슈퍼볼 노출 사고를 광고와 영상 공유팀 영입으로 전환한다(L36166~L36693).",
    question: "자금이 막힌 판타지TV와 아직 이름 없는 영상 서비스를 세계 기업 합작과 슈퍼볼 수요를 받을 실행팀으로 바꿀 수 있는가?",
    promise: "200화의 첫 면담과 자금 병목, 201화의 50억 원·글로벌 합작 계약, 202화의 슈퍼볼 광고와 채드 헐리·스티브 첸 영입을 시간순서대로 지급한다.",
    pressure: "김익수는 회사와 꿈을 넘길 위험을 경계하고, 국내 서비스는 수백억 원의 세계화 비용을 감당할 수 없다. 슈퍼볼 생방송 사고를 상업화한다는 반감과 초기 콘텐츠 부족도 따른다.",
    turn: "김익수가 천민정의 알파 버전과 애플·구글·아마존 참여 조건을 확인하고 계약서에 지장을 찍으면서 첫 면담이 실제 합작으로 바뀐다.",
    payoff: "판타지TV 팀과 김익수의 50억 원 글로벌 합작 계약, 태우 광고의 슈퍼볼 송출, 채드 헐리·스티브 첸 영입, 개인 영상 업로드·검색 서비스 발상이 지급된다.",
    relationship: "김익수는 자금이 부족한 국내 창업자에서 글로벌 영상 합작의 운영자로 들어오고, 채드 헐리와 스티브 첸은 새 영상서비스의 창업팀이 된다.",
    status: "판타지TV 투자 문의가 계약된 글로벌 영상 합작과 미국 실행팀으로 바뀐다.",
    residual: "서비스의 이름·출시·이용자 규모는 아직 지급되지 않았다. 202화 말의 인도·미국 정치 보고는 다음 영입·자원 사건으로 넘어가는 정보다.",
    bridge: "202화는 슈퍼볼 광고와 영상팀 영입을 지급한 뒤 데이비드의 인도 총선·미국 대선 보고로 끝난다. 203화부터 주 질문은 IBM의 리사 수를 태우전자 사장으로 데려오고 남미 리튬 권리를 선점하는 일로 바뀐다(L36523~L36882).",
    boundary: "(1) 영상 합작 계약과 슈퍼볼 영상팀이 실제 지급된다. (2) 203화부터 상대가 김익수·채드·스티브에서 리사 수·사우디 왕가·남미 광구 관계자로 바뀐다. (3) 압박이 영상 서버·콘텐츠에서 인재 영입·조직문화·자원 소유권으로 교대한다.",
    confidence: "0.99"
  ),
  arc_row(
    id: "DCA-N20C",
    name: "리사 수를 태우전자 사장으로 세우고 남미 리튬 권리를 잠그다",
    first: 203,
    last: 206,
    people: "김민재·리사 수·천민정·빈 살만·최재석·태우상사 담당자",
    places: "IBM 인재 면담선·사우디 왕궁·촛불 집회와 SNS·칠레·볼리비아 광구·태우전자·태우IT",
    premise: "김민재가 리사 수에게 태우전자 사장·반도체 총괄·5배 연봉을 제안하고, 사우디 왕궁의 프리미엄 가전 관계와 남미 리튬 광구 계약을 병행한다. 조직문화 때문에 떠나려던 리사 수는 천민정과 밤새 기술을 논한 뒤 수락하고 한 달 뒤 사장에 취임한다(L36694~L37418).",
    question: "태우의 위계 문화에 실망한 리사 수를 실제 권한과 천민정의 기술 동료 관계로 붙잡고, FTA 전에 남미 리튬 권리까지 확보할 수 있는가?",
    promise: "사장·개발총괄 제안과 사우디 왕가의 브랜드 노출, 칠레·볼리비아 광구 계약, 천민정과의 밤샘 대화, 리사 수의 수락·취임·임원 교체 전권을 지급한다.",
    pressure: "리사 수는 한국행·젊은 외국인 사장직·태우의 위계 문화를 위험으로 보고 사실상 거절하려 한다. 남미 자원은 FTA 발효 전에 낮은 가격으로 잠가야 한다.",
    turn: "205화 말 천민정이 리사 수의 AI·반도체 대화에 끼어들고, 206화 밤샘 기술 토론이 리사 수의 거절을 수락으로 뒤집는다.",
    payoff: "우유니 염호와 리튬 트라이앵글의 광구 열 곳 이상 계약, 리사 수의 태우전자 사장 수락·공식 취임, 반도체 총괄과 임원 교체 전권이 지급된다.",
    relationship: "리사 수는 외부 영입 후보에서 천민정의 장기 기술 동료이자 태우전자 수장이 되고, 빈 살만은 프리미엄 가전 고객에서 장기 투자 관계로 가까워진다.",
    status: "태우는 남미 핵심 리튬 권리와 반도체·전자 조직을 바꿀 최고경영자를 동시에 얻는다.",
    residual: "리사 수가 맡은 조직 개편과 팹리스 실행은 다음 단계다. 국민경제당의 총선 의석은 아직 확정되지 않았다.",
    bridge: "206화에서 리사 수가 한 달 뒤 사장으로 공식 취임하고 임원 교체 전권을 받는다. 같은 화 후반 L37395~L37418에서 애플·구글·아마존 CEO의 국민경제당 공개행사가 브리지로 시작되고, 207화부터 그 행사·총선 개표·번역 AI 학습이 지배한다.",
    boundary: "(1) 리사 수의 수락·취임·전권이라는 비가역 지급이 끝난다. (2) 206화 후반 브리지부터 상대와 장소가 리사 수 개인·태우 현장에서 글로벌 CEO 공개무대·총선 개표 상황실로 바뀌고 207화에 지배한다. (3) 압박이 영입과 자원 계약에서 전국 인지도·의석·AI 실증으로 교대한다."
  ),
  arc_row(
    id: "DCA-N20D",
    name: "IT 거물 무대에서 국민경제당 38석과 AI 학습을 지급하다",
    first: 207,
    last: 209,
    people: "김민재·최재석·천민정·리사 수·애플·구글·아마존 CEO",
    places: "국민경제당 경제 대담장·총선 개표 상황실·김민재와 최재석의 비밀 면담·AI 개발 현장",
    premise: "애플·구글·아마존 수장을 최재석과 같은 공개 대담에 세우고 리사 수에게 팹리스 투자 재량을 준 뒤, 실시간 번역 AI 시연과 총선 개표를 거쳐 국민경제당 38석·국회 캐스팅보트와 논문 2만 건 학습을 지급한다(L37419~L37935).",
    question: "세계 IT 기업의 무대와 AI 실증이 국민경제당을 양당 사이의 실제 캐스팅보트로 만들고 태우의 학습자산을 늘릴 수 있는가?",
    promise: "글로벌 CEO 공개 대담, 번역 AI 시연, 지역별 개표, 국민경제당 38석, 최재석의 중립 약속, 논문 2만 건 학습을 지급한다.",
    pressure: "국민경제당은 예상 20석대의 출구조사와 양당 회유를 견뎌야 하고, 천민정의 번역 기능은 실시간 사용성과 대규모 학습자료가 필요하다.",
    turn: "전국 권역에서 당선자가 늘며 예상 의석을 넘기고, 최종 38석이 여당 123석·야당 112석 사이의 캐스팅보트가 된다.",
    payoff: "국민경제당 38석과 최재석의 독자 교섭력, 실시간 번역의 실용 가능성, 논문 2만 건을 포함한 대규모 AI 학습 진전, 독립 팹리스 창설 결정이 지급된다.",
    relationship: "최재석은 태우의 지원을 받는 창당 인물에서 양당 회유를 거부할 독자 정치 지도자가 되고, 리사 수와 천민정은 매일 기술을 논의하는 실행 축이 된다.",
    status: "국민경제당은 국회 캐스팅보트를 갖고 태우의 AI는 데모에서 논문·콘텐츠 대규모 학습 단계로 올라선다.",
    residual: "정당의 장기 정책 성과와 AI 상용화는 남는다. 210화부터는 미국 주택붕괴의 보험·은행지분 설계가 별도 압박으로 시작된다.",
    bridge: "209화는 국민경제당 38석·논문 2만 건 학습을 지급한 뒤 리사 수와 천민정의 다음 아이디어를 묻는다. 210화는 NINA 대출과 저신용 주택담보 현장 증거를 확인하는 금융붕괴 대비로 전환한다(L37766~L38099).",
    boundary: "(1) 총선 38석과 AI 학습자산이라는 큰 약속이 결산된다. (2) 장소·상대가 개표 상황실·최재석·IT 수장들에서 미국 주택대출 현장·다이먼·보험사로 바뀐다. (3) 압박이 선거·인지도·AI 시연에서 수년간 보험료를 견디는 금융붕괴 대비로 교대한다.",
    confidence: "0.99"
  ),
  arc_row(
    id: "DCA-N20E",
    name: "NINA 주택붕괴를 보험·은행지분 대물변제로 설계하다",
    first: 210,
    last: 211,
    people: "김민재·다이먼·한정훈·미국 저신용 주택대출 관계자",
    places: "미국 NINA 대출 조사선·SAVE 금융회의·인도 투자 검토선",
    premise: "김민재가 인도 10년 투자안을 검토하면서 미국 NINA·저신용 주택담보의 현장 증거를 확인하고, 다이먼에게 하락보험과 파생상품을 소액부터 누적해 보험사 지급불능 때 현금 대신 금융회사 지분을 받는 계약 원칙을 준비시킨다(L37936~L38260).",
    question: "소득·재산을 묻지 않는 미국 주택대출 붕괴를 미리 확인하고 보험금 미지급 위험까지 은행 지분 대물변제로 바꿀 수 있는가?",
    promise: "NINA 대출의 실제 사례와 주택시장 붕괴 증거, 하락보험 누적, 지급불능 때 금융회사 지분을 받는 계약 원칙을 지급한다.",
    pressure: "붕괴까지 수년 동안 보험료를 견뎌야 하고, 상대 보험사들이 무너지면 현금 보상 자체를 받지 못할 수 있다.",
    turn: "단순 하락보험 매수에서 보험사의 지급불능을 전제로 현금 대신 금융회사 지분을 받는 소유권 설계로 바뀐다.",
    payoff: "미국 주택시장 붕괴의 현장 증거와 서브프라임 하락보험 누적·금융회사 지분 대물변제 계약 원칙이 확정된다.",
    relationship: "다이먼은 시장 관찰자가 아니라 김민재의 장기 보험·은행 인수 실행자가 된다.",
    status: "SAVE는 가격 하락 수익뿐 아니라 보험사 부실을 금융회사 지분으로 전환할 준비 단계에 들어간다.",
    residual: "실제 붕괴·보험금·은행 지분 소유권은 아직 지급되지 않았다. IIT 한국캠퍼스와 자율주행팀은 다음 Arc의 질문이다.",
    bridge: "211화에서 보험금 지급불능 시 금융회사 지분을 받는 원칙을 정한 뒤, 같은 화 후반 최재석에게 IIT 한국캠퍼스를 제안해 국내 반발 질문을 연다. 212화부터 한국인 입학 20퍼센트·공채 확대·빅테크 연구소라는 교육·고용 협상이 지배한다(L38100~L38406).",
    boundary: "(1) 보험·은행지분 대물변제의 설계가 일차 확정된다. (2) 상대가 다이먼·보험사에서 최재석·양당·IIT·자동차 업계로 바뀐다. (3) 압박이 금융붕괴와 보험료에서 교육여론·입법·자율주행 기술병목으로 교대한다."
  ),
  arc_row(
    id: "DCA-N20F",
    name: "IIT 정치경로와 씽크윈 기술·데이터를 자율주행 기반으로 잇다",
    first: 212,
    last: 215,
    people: "김민재·최재석·천민정·장경준·박태수·양당 지도부",
    places: "최재석 정책 협상실·세이브 투자회의·태우 자율주행팀·현재자동차 협상장·씽크윈 면담실",
    premise: "IIT 한국캠퍼스에 한국인 입학 20퍼센트·태우 공채 확대·빅테크 연구소를 붙여 최재석과 양당의 협조를 얻고, 50~60명 자율주행팀의 정밀지도 병목을 현재자동차 절충과 씽크윈의 기술·데이터 사용권으로 푼다(L38261~L38905).",
    question: "IIT의 국내 반발과 자율주행 정밀지도 부족을 정치 협조·연구조직·현재자동차 절충·씽크윈 기술·데이터 계약으로 풀 수 있는가?",
    promise: "최재석의 IIT 지지와 양당 법안 협조, 세이브의 테슬라 추가투자, 천민정과 엔지니어 50~60명 자율주행팀, 현재자동차와의 제한적 합의, 씽크윈 기술·데이터 독점 사용권과 무료 모바일 내비 개발 방침을 지급한다.",
    pressure: "IIT의 외국인 중심 선발에 국내 반발이 있고, 자율주행팀은 실시간 정밀지도가 없으며, 현재자동차는 캐피탈 시장을 방어하려 하고 씽크윈 박태수는 500억 원 인수를 거절한다.",
    turn: "씽크윈의 회사 인수가 막히자 태우·카이 1차 협력사와 선택 옵션, 차량용 시장 불진출을 교환해 회사 소유 없이 기술·데이터 사용권을 얻는 방식으로 바뀐다.",
    payoff: "IIT 법안 발의 협조와 한국 자율주행 연구조직, 현재자동차와의 출혈전 회피, 씽크윈 기술·데이터 독점 사용권, 태우·카이 우선공급 조건, 무료 모바일 내비 개발 방침이 지급된다.",
    relationship: "최재석은 IIT의 정책 동맹이 되고, 현재자동차는 적대적 금융전 대신 제한적 절충 상대가 되며, 박태수는 회사를 팔지 않고 태우·카이에 기술을 공급하는 파트너가 된다.",
    status: "태우는 자율주행팀과 실시간 지도 개발의 기술·데이터 사용 조건을 얻지만 앱 자체는 아직 완성되지 않았다.",
    residual: "모바일 내비의 실제 완성·출시·하루 사용자 10만 명은 221화 지급이다. IIT 캠퍼스의 실제 착공과 자율주행 대중 적용도 남는다.",
    bridge: "215화에 씽크윈 기술·데이터 사용권과 한 달 개발·무료 배포 방침이 지급된 뒤 김태중이 서울역의 낡은 본사를 보며 강남 신사옥을 원한다고 말한다. 216화부터 샤롯 부지·승계·한전 이전이 새 지배 목표다(L38750~L39051).",
    boundary: "(1) 씽크윈 기술·데이터 사용권과 개발 조건이 지급된다. (2) 지배 목표가 IIT·자율주행 기반에서 김태중의 신사옥 부지 확보로 바뀐다. (3) 장소·상대가 정책실·자동차사·씽크윈에서 서울역 본사·샤롯 진호균 일가·한전으로 옮겨 간다. (4) 앱 완성은 다음 Arc의 221화 지급으로 남겨 선취하지 않는다.",
    confidence: "0.99"
  )
].freeze

PHASES = {
  192 => "N20·정치구상에 천민우 위험 침입",
  193 => "N20·하굣길 구출과 유착 증거",
  194 => "N20·학부모 회의 공개 보호",
  195 => "N20·사과·전학 지급",
  196 => "N20·딥러닝과 정치방벽 재연결",
  197 => "N20·최재석 창당 수락과 개입 경계",
  198 => "N20·데이터센터 지급과 태우상사 전환",
  199 => "N20·원자재 조사와 경제공약 브리지",
  200 => "N20B·김익수 첫 면담과 자금병목",
  201 => "N20B·50억 글로벌 합작 계약",
  202 => "N20B·슈퍼볼 광고와 영상팀 지급",
  203 => "N20C·리사 수 제안과 사우디 관계",
  204 => "N20C·촛불 연설과 남미 리튬 착수",
  205 => "N20C·광구 계약과 리사 수 영입 위기",
  206 => "N20C·리사 수 취임과 전권 지급",
  207 => "N20D·IT 거물 공개무대와 팹리스",
  208 => "N20D·개표 압박과 번역 AI",
  209 => "N20D·국민경제당 38석과 AI 학습 지급",
  210 => "N20E·NINA 현장증거",
  211 => "N20E·하락보험과 은행지분 대물설계",
  212 => "N20F·IIT 지지와 전기차 방향",
  213 => "N20F·양당 협조와 자율주행팀",
  214 => "N20F·현재자동차 절충과 씽크윈 협상",
  215 => "N20F·기술·데이터 사용권 지급과 신사옥 브리지"
}.freeze

arc_table = CSV.read(ARC_PATH, headers: true)
raise "arc header mismatch" unless arc_table.headers == ARC_HEADER
raise "expected one DCA-N20 row" unless arc_table.count { |row| row["arc_id"] == "DCA-N20" } == 1
raise "suffix IDs already exist" if arc_table.any? { |row| row["arc_id"]&.match?(/\ADCA-N20[B-F]\z/) }

arc_rows = []
arc_table.each do |row|
  if row["arc_id"] == "DCA-N20"
    arc_rows.concat(NEW_ARCS)
  else
    arc_rows << row.to_h
  end
end

CSV.open(ARC_PATH, "w", write_headers: true, headers: ARC_HEADER) do |csv|
  arc_rows.each { |row| csv << ARC_HEADER.map { |field| row.fetch(field) } }
end

arc_for_sequence = {}
NEW_ARCS.each do |arc|
  (arc.fetch("start_sequence").to_i..arc.fetch("end_sequence").to_i).each do |sequence|
    arc_for_sequence[sequence] = arc.fetch("arc_id")
  end
end

chapter_table = CSV.read(CHAPTER_PATH, headers: true)
chapter_header = chapter_table.headers
CSV.open(CHAPTER_PATH, "w", write_headers: true, headers: chapter_header) do |csv|
  chapter_table.each do |row|
    sequence = row["sequence"].to_i
    row["arc_id"] = arc_for_sequence.fetch(sequence) if arc_for_sequence.key?(sequence)
    csv << chapter_header.map { |field| row[field] }
  end
end

pacing_table = CSV.read(PACING_PATH, headers: true)
pacing_header = pacing_table.headers
CSV.open(PACING_PATH, "w", write_headers: true, headers: pacing_header) do |csv|
  pacing_table.each do |row|
    sequence = row["sequence"].to_i
    if arc_for_sequence.key?(sequence)
      row["arc_id"] = arc_for_sequence.fetch(sequence)
      row["arc_phase"] = PHASES.fetch(sequence)
    end
    csv << pacing_header.map { |field| row[field] }
  end
end

puts "PASS N20 split: #{NEW_ARCS.map { |arc| "#{arc.fetch('arc_id')}=#{arc.fetch('start_sequence')}~#{arc.fetch('end_sequence')}" }.join(', ')}"
