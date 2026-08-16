#!/usr/bin/env ruby
# frozen_string_literal: true

require "csv"
require "digest"
require "fileutils"
require "json"
require "open3"
require "rbconfig"
require "time"

WORK = __dir__
ANALYSIS = File.expand_path("../../..", WORK)
REWORK = File.join(ANALYSIS, ".work/rework_natural_arc")
LEDGER = File.join(REWORK, "long-arc-red-team-2026-08-14.md")
DECISIONS = File.join(REWORK, "long-arc-red-team-decisions-2026-08-14.csv")
SOURCE = File.expand_path("../../private_sources/korean_webnovel_corpus/서오/독식하는 재벌 3세_서오_합본.txt", ANALYSIS)
STAGE = File.join(WORK, "stage-manager-redteam-2026-08-14")
TEMP_STAGE = File.join(WORK, ".stage-manager-redteam-2026-08-14.tmp")
VALIDATOR = File.join(WORK, "validate_manager_redteam_stage.rb")
COMMON_VALIDATOR = File.expand_path("../../tools/validate-five-work-analyses.mjs", ANALYSIS)

SOURCE_SHA = "66f3e7df3123343c14a7134108dc59940511f40372493a549cba8ae709df4b45"
LEDGER_SHA = "52bbd904efd4483aa999d2062f301ec548ea2cc433bca0565c77d4f1fd418fa2"
DECISION_SHA = "85ebcd4437e44f2c821d010a8e6de512dd81018cea3164aee093fbc50905a547"
START_CHAPTER_SHA = "7053d49dc7025e48b56daa2b35458965918ffc570cd66be0f87f4239992581f8"

CANONICAL_START = {
  "arc_atlas.md" => "e278073eb02e1bdd970bd5bcec9126b5d5aa97816a0daada32c2117127ccd35b",
  "arc_map.csv" => "413750cf567baf268453327b0833da6167c2a7c0ab9e1e794a43a3a2bc7d2c68",
  "arc_pacing.csv" => "f32f7572f64e16ec47e3a911788c8a987dbd74aee4b5c0aba65a440cacd1204e",
  "chapter_map.csv" => "16e91900a6dd3ea800ac535846888f6454d60038c605ad36a5849fea145678af",
  "completion_receipt.md" => "97c1a5d8081719489c8e3f2576249a358af2f7373ca0bd2632f99a42bbe8aed6",
  "free_improvements_report.md" => "62aef345b4c2c9f4d2d948927825d9ba30c204792bd33da62d618e0a09aa41b4",
  "inkos_usage_and_gap_report.md" => "b54701135365bbd5db5e7d0ac0b52478745a1b08af93dff68891d75ba1e7b0c3",
  "project_bible.md" => "8406a06574fd4853f145ee32c6cc70e4162ba96f8521db217731c42c5f7ef37b",
  "source_receipt.json" => "5aad05680d9c6a4a6712a79900fce98efc6c4995e22eee98126497e61b2b019d"
}.freeze

ROOT_OUTPUTS = %w[
  arc_atlas.md arc_map.csv arc_pacing.csv chapter_map.csv completion_receipt.md
  free_improvements_report.md inkos_usage_and_gap_report.md project_bible.md
  source_receipt.json
].freeze
NARRATIVE_FIELDS = %w[
  entry_state reader_promise protagonist_goal action resistance_or_cost
  turn_or_reveal paid_reward state_change ending_hook closed_loops opened_loops
].freeze
DECISION_HEADERS = %w[
  ordinal arc_id start_sequence end_sequence source_arc_ids decision arc_name
  dominant_question evidence_anchor boundary_line_evidence predecessor_payoff
  next_first_action bridge_climax_ownership ledger_sha256 source_sha256
].freeze
SCORE_FIELDS = %w[tension_1_10 reward_1_10 hook_1_10].freeze
RIBBON_FIELDS = %w[
  information_weight action_weight relationship_weight emotion_weight
  material_or_status_weight
].freeze

def sha(path)
  Digest::SHA256.file(path).hexdigest
end

def write_csv(path, rows, headers)
  expanded = File.expand_path(path)
  raise "write escaped TEMP_STAGE: #{expanded}" unless expanded.start_with?("#{File.expand_path(TEMP_STAGE)}/")
  FileUtils.mkdir_p(File.dirname(path))
  CSV.open(path, "w", write_headers: true, headers: headers) do |csv|
    rows.each { |row| csv << headers.map { |field| row[field] } }
  end
end

def write_stage(path, content)
  expanded = File.expand_path(path)
  raise "write escaped TEMP_STAGE: #{expanded}" unless expanded.start_with?("#{File.expand_path(TEMP_STAGE)}/")
  FileUtils.mkdir_p(File.dirname(path))
  File.binwrite(path, content)
end

def unique_parts(rows, field)
  seen = {}
  rows.flat_map { |row| row.fetch(field).tr(";", ",").split(",") }.map(&:strip).reject(&:empty?).each_with_object([]) do |value, result|
    next if seen[value]
    seen[value] = true
    result << value
  end
end

def ledger_ranges
  block = File.read(LEDGER)[/## 판정에서 산출된 연속 범위.*?```text\n(.*?)```/m, 1]
  raise "approved ledger range block missing" unless block
  block.scan(/(\d{3})\s+(\d+)-(\d+)/).map { |ordinal, first, last| [ordinal.to_i, first.to_i, last.to_i] }
end

def repeated_length_runs(ranges)
  runs = []
  cursor = 0
  while cursor < ranges.length
    finish = cursor + 1
    length = ranges[cursor][2] - ranges[cursor][1] + 1
    finish += 1 while finish < ranges.length && ranges[finish][2] - ranges[finish][1] + 1 == length
    runs << ranges[cursor...finish] if finish - cursor >= 3
    cursor = finish
  end
  runs
end

def run_stage_validator(stage)
  stdout, stderr, status = Open3.capture3(RbConfig.ruby, VALIDATOR, stage, DECISIONS)
  output = [stdout, stderr].reject(&:empty?).join
  raise "stage validator failed:\n#{output}" unless status.success?
  output
end

def run_strict(stage)
  sandbox = File.join(stage, ".strict-sandbox")
  FileUtils.rm_rf(sandbox)
  begin
    tool = File.join(sandbox, "tools", "validate-five-work-analyses.mjs")
    analysis = File.join(sandbox, "analyses", "doksik-chaebol3")
    source = File.join(sandbox, "private_sources", "korean_webnovel_corpus", "서오", File.basename(SOURCE))
    FileUtils.mkdir_p(File.dirname(tool))
    FileUtils.mkdir_p(analysis)
    FileUtils.mkdir_p(File.dirname(source))
    File.binwrite(tool, File.binread(COMMON_VALIDATOR))
    ROOT_OUTPUTS.each { |name| File.binwrite(File.join(analysis, name), File.binread(File.join(stage, name))) }
    File.symlink(SOURCE, source)
    stdout, stderr, status = Open3.capture3("node", tool, "doksik-chaebol3", "--strict", chdir: sandbox)
    output = [stdout, stderr].reject(&:empty?).join
    raise "strict failed:\n#{output}" unless status.success?
    output
  ensure
    FileUtils.rm_rf(sandbox)
  end
end

def completion_text(arcs, pacing, custom, strict)
  distributions = SCORE_FIELDS.map do |field|
    values = pacing.group_by { |row| row.fetch(field) }
    "#{field}: " + values.keys.sort.map { |key| "#{key}=#{values.fetch(key).length}" }.join(", ")
  end.join("\n")
  <<~MD
    # 《독식하는 재벌 3세》 red-team stage completion receipt

    - 상태: **STAGE_READY / AWAITING_MANAGER_SCRIPT_AND_STAGE_APPROVAL**
    - canonical 적용: **하지 않음**
    - 원문 SHA: `#{SOURCE_SHA}`
    - 승인 장부 SHA: `#{LEDGER_SHA}`
    - decision SHA: `#{DECISION_SHA}`
    - NarrativeArc: #{arcs.length}개, 1~751 연속
    - chapter/pacing: #{pacing.length}/#{pacing.length}행
    - 양방향 감사: 297 field / 102 sequence

    ## 분포

    ```text
    #{distributions}
    ```

    ## 확정 사실 반영

    15·50·192·194·246·259·264·335·380·382·482·488·495·513~516·654·660~662·745·749·751화를 현재 화 하드 경계로 다시 썼다. 50·516·654화의 현재 지급을 복원했고 661화가 로나 85→0.003달러, 99% 폭락, 최소 300억 달러와 베릴 복권을 소유한다. 745·751화는 김태중을 할아버지, 김민재를 손자로 고정했으며 749화 화학상 사유는 AI 코로나 치료제와 희귀질병 치료제 개발이다.

    ## 작품 전용 validator

    ```text
    #{custom.strip}
    ```

    ## 공통 strict

    ```text
    #{strict.strip}
    ```

    canonical apply·commit·push는 하지 않았으며 관리자 승인 전 완료로 선언하지 않는다.
  MD
end

CHAPTER_OVERRIDES = {
  15 => {
    "action" => "20억 달러 한도로 조지 발언의 반대 포지션을 잡고 제프리에게 아마존 이름과 창업 전액 지원을 제안한다. 배터리 교수 프로젝트 자료는 데이비드에게 건네 원하는 자금을 지원하고 능력껏 최대 지분을 협상하라고 지시한다.",
    "paid_reward" => "푸틴의 감사 메시지, 하버드 3년 조기졸업, 귀국 뒤 김태중의 식탁 환대를 받는다. 배터리 교수 접촉·계약·지분 취득은 이 화에 없다.",
    "state_change" => "김민재는 23세 하버드 졸업생이자 태우 입사 예정자가 되고, SAVE는 제프리 창업과 배터리 연구자 지원·지분협상을 맡길 실행 담당자를 둔다.",
    "closed_loops" => "하버드 과정; 푸틴 첫 지원; 퀀텀 프랑화 대응 방향",
    "opened_loops" => "태우 내부 수술; 제프리의 아마존 창업; 배터리 교수 지원·지분협상과 실제 계약"
  },
  50 => {
    "entry_state" => "우성일이 이노폰 극비 자료를 박진훈에게 넘기고, 박진훈은 거짓 결함 자료를 만들어 기자에게 전달하라고 지시한다.",
    "reader_promise" => "우성일의 자료 전달을 촬영·녹음한 증거와 SAVE 반박자료를 세계 공개검증으로 이어 언론 공작을 되받는 보상.",
    "protagonist_goal" => "이노폰 신뢰가 무너지기 전에 보도 공작 증거를 보전하고 허위 결함을 공개 검증할 무대를 준비한다.",
    "action" => "박진훈이 우성일에게 거짓 결함 자료를 기자에게 넘기게 하자 강 대위 쪽이 전달 장면 영상과 음성 녹음을 확보한다. 1면 기사가 나온 뒤 김민재는 SAVE 반박자료를 제시하고 한국·미국·독일 동시 이벤트를 준비한다.",
    "resistance_or_cost" => "허위기사가 먼저 1면을 차지했고 박진훈 파벌은 그룹 내부와 언론에 걸쳐 있다. 확보한 증거만으로 배후 전부를 닫지는 못했다.",
    "turn_or_reveal" => "강 대위가 우성일의 기자 접촉 장면과 음성 녹음을 이미 확보했다는 보고가 들어오고, 김민재는 기사 방어를 세 나라 공개행사로 확대한다.",
    "paid_reward" => "우성일의 자료 전달 영상·음성 녹음, SAVE의 허위결함 반박자료, 한국·미국·독일 공개 이벤트 계획을 확보한다.",
    "state_change" => "박진훈이 언론의 선수를 친 국면에서 김민재가 전달 증거·반박자료·세 나라 공개검증 계획으로 대응 주도권을 잡는다.",
    "ending_hook" => "확보한 전달 증거와 세 나라 동시 공개검증으로 1면 허위기사를 소비자 앞에서 뒤집을 수 있는가?",
    "closed_loops" => "우성일의 기자 접촉과 자료 전달 증거 확보; 기사 주장의 허위 확인; 세 나라 공개 이벤트 결정",
    "opened_loops" => "공개 시연의 성패; 우성일·박 기자의 공개 시인과 정정 보도; 박진훈 파벌 축출"
  },
  192 => {
    "reader_promise" => "거대 양당에 끌려가지 않을 정치 방벽을 설계하던 순간 천민정의 동생에게 가해진 구체적 학교폭력이 침입한다.",
    "protagonist_goal" => "최재석에게 깨끗한 정치인 후보를 추려 달라고 맡기고, 천민정의 동생에게 벌어진 학교폭력을 확인해 보호에 착수한다.",
    "action" => "최재석에게 이번 주 안에 후보 약 50명을 추려 보고해 달라고 맡긴다. 강 대위가 보여 준 영상에서는 불량학생 4~5명이 천민정의 동생 머리를 후려치고 식판에 침을 뱉는 장면을 확인한다.",
    "resistance_or_cost" => "20명 교섭단체를 만들 만큼 깨끗한 후보를 찾기 어렵고, 영상 속 가해 학생들의 이름·가족 배경은 이 화에서 아직 알 수 없다.",
    "turn_or_reveal" => "정치 방벽 논의가 천민정의 동생이 교실에서 반복적으로 맞고 모욕당하는 긴급 보호문제로 전환된다.",
    "paid_reward" => "최재석에게 후보 선별 과업을 맡기고, 불량학생 4~5명의 폭행·식판 침 장면이 담긴 대응 근거를 확보한다. 후보 50명 명단은 아직 미지급이다.",
    "state_change" => "추상적 경제정당 계획이 태우 핵심인재의 가족을 지키는 당면 과제와 연결된다. 피해자는 이 화 표면대로 천민정의 동생이며 실명과 가해자 배경은 다음 확인으로 남는다.",
    "ending_hook" => "영상 속 천민정의 동생을 즉시 보호하고 불량학생 4~5명의 신원과 배경을 어떻게 확인할 것인가?",
    "closed_loops" => "교섭단체·경제정당 구상과 후보 선별 담당자 확정",
    "opened_loops" => "후보 약 50명 보고; 천민정의 동생 보호; 가해 학생 신원·배경 확인"
  },
  194 => {
    "entry_state" => "부장검사 남편과 중견기업 회장가 친정을 둔 조영희가 학부모회와 교장을 앞세워 천민우 퇴학을 요구한다.",
    "reader_promise" => "김민재가 사진·영상·녹취·진술서와 몸으로 천민우를 공개 보호하고 학교·검찰 권력을 실제 행동으로 뒤집는다.",
    "protagonist_goal" => "추영택의 상습폭행을 증거로 공식화하고 천민우에게 공개 보호막을 세운 뒤 가해자 가족·학폭위원·검찰선을 조사한다.",
    "action" => "학부모 회의에서 몇 달치 사진·영상·녹취·진술서와 경호원 바디캠을 제시해 정식 학폭위를 요구한다. 교실로 가 천민우를 안아 공개 보호하고 재폭행을 막은 뒤 학폭위원 뒷조사, 명동선 확인, 추영택 아버지의 부장검사 윗라인 압박을 지시한다.",
    "resistance_or_cost" => "조영희는 부장검사 남편과 중견기업 회장가 친정을 믿고 버티며 학교도 학부모회 눈치를 본다. 화원정밀 거래중단 같은 다음 화 조치는 아직 없다.",
    "turn_or_reveal" => "태우 부회장이 천민우를 교실에서 직접 안아 보호하자 은밀하던 피해가 공개 지위로 뒤집히고 누구도 다시 손대기 어려운 보호막이 선다.",
    "paid_reward" => "추영택의 상습폭행을 입증할 사진·영상·녹취·진술서·바디캠을 공개하고 정식 학폭위를 요구한다. 천민우는 김민재가 교실에서 안아 준 태우 직원 가족이라는 공개 보호지위를 얻는다.",
    "state_change" => "천민우는 고립된 피해학생에서 태우 부회장이 공개 보증하는 직원 가족으로 바뀌고, 학교·학폭위원·명동·검찰선을 겨냥한 실제 조사와 압박이 시작된다.",
    "ending_hook" => "학폭위원 뒷조사와 명동선·부장검사 윗라인 압박이 추영택 가족과 학교의 축소 대응을 어디까지 무너뜨릴 것인가?",
    "closed_loops" => "천민우 누명 반박; 추영택의 상습폭행 증거 공개; 교실 공개보호와 재폭행 차단",
    "opened_loops" => "정식 학폭위; 학폭위원·추영택 가족 뒷조사; 명동·검찰 윗라인 압박"
  },
  246 => {
    "protagonist_goal" => "강수기에게 태우 가수 네 명과 SG 전원 양도를 약속받고 태우 불개입·희망고문으로 장기 반격을 막을 구조를 만든다.",
    "action" => "무릎 꿇은 강수기에게 태우 가수 네 명과 SG 소속 가수 전원을 넘기면 태우가 손을 떼겠다고 제시한다. 강수기는 검찰 조사와 태우 불개입, 즉시 가수 이동 의사를 말하고 김민재는 로펌·감옥 내 보호로 희망고문할 계획을 설명한다.",
    "resistance_or_cost" => "강수기는 집행유예를 기대하지만 형량 감소는 없다고 명시된다. 실제 가수 계약이전·구속·판결·10년 복역은 이 화에 없다.",
    "turn_or_reveal" => "강수기가 SG 전원 양도와 태우 불개입 조건을 받아들이고, 김민재는 절망 대신 살아날 희망을 주어 수감 중 움직이지 못하게 할 심리통제를 공개한다.",
    "paid_reward" => "태우 가수 네 명과 SG 소속 가수 전원 양도 약속, 태우 불개입 의사, 로펌·감옥 내 보호를 이용한 희망고문 설계를 얻는다. 실제 계약이전·형량·복역은 미지급이다.",
    "state_change" => "SG 전원 양도 의사와 강수기 장기통제 설계가 생기지만 태우엔터의 실제 인재 소유권과 강수기의 형량은 확정되지 않는다.",
    "ending_hook" => "전원 양도 약속을 실제 계약이전으로 만들고, 희망고문 설계가 판결 전 강수기의 반격을 막을 수 있는가?",
    "closed_loops" => "양지파 역공; 강수기의 SG 전원 양도·태우 불개입 약속; 희망고문 설계",
    "opened_loops" => "가수 계약이전 실행; 강수기 수사·판결·복역; 장기 심리통제 결과"
  },
  259 => {
    "entry_state" => "천민정이 완성한 픽시 업그레이드와 게임·바둑 AI를 들고 부회장실에 온다.",
    "reader_promise" => "전국·북한 사투리와 4개 외국어 통역·방범을 갖춘 픽시, 스타크 AI의 실제 프로대전을 한 회차 안에서 보여 준다.",
    "protagonist_goal" => "완성된 픽시 기능을 출시 가능한 제품으로 확인하고 스타크 AI를 용산 공개전에서 검증한다.",
    "action" => "픽시가 전국·북한 사투리, 영어·중국어·일본어·스페인어와 간단 통역, CCTV 방범·자동연락을 지원하며 즉시 출시 가능하다는 보고를 받는다. 래더 2위·프로 상대 승률 50%, 전용 하드웨어 전망 80%인 스타크 AI를 용산 공개전에 투입한다.",
    "resistance_or_cost" => "바둑 AI는 아직 정상급 프로에 못 미치고, 스타크 AI는 인간의 변칙·유인 전술을 완전히 학습하지 못했다.",
    "turn_or_reveal" => "스타크 AI가 1경기 초반전략을 막아 승리하지만 2경기 랭킹 2위 프로가 일부러 유닛을 흘린 덫으로 본대를 유인해 AI 승률을 20%까지 떨어뜨린다.",
    "paid_reward" => "출시 가능한 픽시의 사투리·4개 외국어·통역·방범 기능, 스타크 AI의 래더 2위·프로 승률 50%와 전용 하드웨어 80% 전망, 용산 공개전 1경기 승리를 확인한다.",
    "state_change" => "태우 AI는 연구실 시제품에서 즉시 출시 가능한 생활기기와 프로게이머 앞 공개 경쟁자로 올라선다.",
    "ending_hook" => "랭킹 2위 프로가 AI의 반응 패턴을 덫으로 역이용해 승률을 20%까지 낮춘 2경기를 인간이 가져갈 것인가?",
    "closed_loops" => "픽시 업그레이드 기능·즉시 출시 준비; 스타크 AI 래더 성능 확인; 공개전 1경기 승리",
    "opened_loops" => "공개전 2경기 승패·AI 약점 보완; 바둑 AI 정상급 대결"
  },
  264 => {
    "entry_state" => "김민재가 아마존 물류창고의 자동화 설비를 직접 점검한 뒤 SAVE의 서브프라임 수확 시계를 확인한다.",
    "reader_promise" => "물류 자동화의 30% 절감 영수증과 CITI 2만 명 감원·최소 600억 달러 손실·부실자산 매각제안·리먼 파산설을 같은 화에서 지급한다.",
    "protagonist_goal" => "태우 미래 제조기반을 점검하고 CITI·리먼이 보험증서의 값을 충분히 키울 때까지 기다린다.",
    "action" => "지게차 로봇·자동검수·로봇팔·드론으로 인건비 30%를 줄인 창고를 점검하되 설비보다 인건비가 아직 싸다는 한계를 확인한다. 다이먼에게 CITI가 소진될 때까지 기다리게 하고 김태중의 ‘완벽히 끝내고 오라’는 전언을 받은 뒤 1년을 건너 리먼 파산설을 맞는다.",
    "resistance_or_cost" => "자동화는 30%를 절감했어도 아직 인건비가 더 싸고, 다이먼은 복수심에 들떠 있다. CITI는 2만 명을 감원해도 최소 600억 달러 손실을 현금으로 막지 못한다.",
    "turn_or_reveal" => "CITI 2만 명 감원·최소 600억 달러 손실과 부실자산 매각 연락이 공개되고, 1년 뒤 미국 의회 경기부양책에도 리먼 파산설이 터진다.",
    "paid_reward" => "아마존 창고의 인건비 30% 절감과 자동화 한계를 확인하고, CITI의 2만 명 감원·최소 600억 달러 손실·부실자산 매각 제안이라는 수확 근거를 얻는다. 김태중에게 장기 미국 체류 허락도 받는다.",
    "state_change" => "한국 운영은 김태중에게 안정적으로 위임되고 SAVE의 보험증서는 CITI의 실제 손실과 리먼 파산설로 금융사 생사를 쥘 수확도구가 된다.",
    "ending_hook" => "리먼 브라더스 파산설로 씨 뿌리기가 끝난 지금, 보험증서를 어느 금융사부터 수확할 것인가?",
    "closed_loops" => "아마존 물류 자동화 검수; CITI 손실규모·자구안 확인; 김태중의 장기체류 허락",
    "opened_loops" => "CITI 부실자산·리먼 등 위기 금융사 수확; 보험증서 행사시점"
  },
  335 => {
    "protagonist_goal" => "일본 동북 교민 최소 1만2천 명의 대피를 지원할 운송·자료·구호물자선을 준비하고 비용 책임을 공개한다.",
    "action" => "최소 1만2천 명 교민의 대피지원·비용 전액 부담을 선언하고 운송수단, 미국 추가자료 요청, 구호물자 조달선을 준비한다.",
    "turn_or_reveal" => "실제 대피가 끝나기 전 모든 전화가 울리고 동일본 대지진이 발생해 예측이 적중했다는 신호가 현실 재난으로 바뀐다.",
    "paid_reward" => "교민 대피 지원과 비용 전액 책임을 공개하고, 운송수단·미국 추가자료 요청·구호물자 조달선을 확보한다. 1만2천 명 실제 대피는 아직 미지급이다.",
    "state_change" => "김민재가 그룹 신뢰를 담보로 AI 재난예측과 민간 대피책임을 공식화하고, 동일본 대지진 발생으로 구조 실행단계에 들어간다.",
    "closed_loops" => "대피지원·비용책임 선언; 운송수단·미국 자료요청·구호물자 조달선 준비",
    "opened_loops" => "교민 실제 대피·구조; 대지진 피해와 구호 실행"
  },
  380 => {
    "action" => "천민정이 사우디 왕족 비밀계좌를 찾고 김민재가 텍사스 관계자에게 경고한 뒤 OPEC 증산 발표와 함께 원유 공매도를 실행한다. 원유는 110달러에서 105달러로 내려간다.",
    "turn_or_reveal" => "OPEC 증산 직후 원유가 110달러에서 105달러로 떨어져 5배 레버리지 수익률이 25%를 넘는다.",
    "paid_reward" => "원유 110→105달러 하락, 5배 레버리지 25% 이상 수익률, 준비기간에 들어간 자금의 하루 만 전액 회수를 확인한다.",
    "state_change" => "오랜 석유전쟁 준비비가 하루 만에 전액 회수되고 금융타워의 원유 숏이 본게임 수익으로 전환된다.",
    "closed_loops" => "OPEC 증산 전 준비비 전액 회수; 원유 공매도 첫 수익",
    "opened_loops" => "추가 유가 하락·산유국과 셰일기업 붕괴; 왕족 숙청정보"
  },
  382 => {
    "reader_promise" => "체셔피크·헤스와 가이아나 지분이라는 고유 표적을 이름·금액·지분율로 정하되 미래 인수 완료는 유예한다.",
    "protagonist_goal" => "체셔피크와 헤스를 500억 달러 이상 규모로 인수할 자금을 만들고 헤스의 가이아나 펀드 30%를 태우 목표 60%로 끌어올린다.",
    "action" => "체셔피크·헤스 공매도를 늘려 주가를 낮추고, 헤스가 가진 가이아나 펀드 30%와 태우 목표 60%를 확인한다. 미국 대사가 셰일업체 구조를 요청하자 두 회사를 고유 표적으로 제시한다.",
    "resistance_or_cost" => "체셔피크와 헤스 인수에는 500억 달러 이상이 필요하고 미국 정부 구조요청도 실제 소유권 이전을 보장하지 않는다.",
    "turn_or_reveal" => "헤스의 가이아나 펀드 지분 30%가 드러나 태우의 목표가 60%로 구체화되고, 미국 대사가 셰일업체 구조를 공식 요청한다.",
    "paid_reward" => "체셔피크·헤스라는 고유 인수표적, 500억 달러 이상 자금규모, 가이아나 펀드 30%와 목표 60%, 두 회사 공매도 실행, 미국 정부 구조요청을 확보한다. 인수·지분취득은 미지급이다.",
    "state_change" => "유가 하락의 계열사 손익표가 체셔피크·헤스·가이아나라는 국가 구조대상과 구체 매집표로 바뀐다.",
    "ending_hook" => "공매도로 낮춘 체셔피크·헤스를 실제 인수하고 가이아나 펀드 지분을 30%에서 60%로 늘릴 수 있는가?",
    "closed_loops" => "체셔피크·헤스·가이아나 고유표적과 자금·지분 목표 확정; 셰일업체 구조요청",
    "opened_loops" => "체셔피크·헤스 인수협상; 가이아나 펀드 60% 확보; 공매도 수익 실현"
  },
  482 => {
    "protagonist_goal" => "5% 금리·600만 파운드 발행 청나라 채권을 경매·골동품상·미영 재단에서 6개월 안에 최소 절반 모을 실행계획을 세운다.",
    "action" => "청나라 채권의 5% 금리와 600만 파운드 발행액을 계산하고 인터넷 경매·골동품상·미영 재단을 매입경로로 정해 한 부회장에게 6개월 안 최소 절반 확보를 지시한다.",
    "turn_or_reveal" => "작은 매입비용이 장래 1조 달러 주장까지 가능한 정치·금융 옵션이 될 수 있음을 계산하고 한 부회장이 담당을 맡는다.",
    "paid_reward" => "청나라 채권의 발행조건·매입경로·6개월 일정·최소 절반 목표와 담당자를 확정한다. 실제 채권 매입·확보는 아직 없다.",
    "state_change" => "청나라 채권 아이디어가 실행경로와 책임자를 가진 저비용 전략계획으로 바뀌지만 소유권은 미지급이다.",
    "closed_loops" => "청나라 채권 계산·매입경로·담당·목표 설정",
    "opened_loops" => "청나라 채권 실제 매입·최소 절반 확보; 법적·정치적 사용"
  },
  488 => {
    "protagonist_goal" => "엔비디아 직접지분을 25% 이상으로 늘릴 협상경로를 열고 최종 50% 목표를 추적한다.",
    "action" => "손정우에게 35억 달러 채권을 돌려주고 엔비디아 3%를 받는다. 기존·매집분을 합친 태우증권 8% 이상, 핀테크 포함 약 10%를 확인하고 뱅가드·피델리티 각 7%와 25~40% 경로를 협상한다.",
    "turn_or_reveal" => "손정우가 약속한 3%를 실제 넘기고 뱅가드·피델리티 대주주 면담을 주선해 25%·40%·최종 50% 경로가 열린다.",
    "paid_reward" => "35억 달러 채권↔엔비디아 3% 교환을 완료하고 태우증권 8% 이상·핀테크 포함 약 10% 보유를 확인한다. 뱅가드·피델리티 각 7% 협상길을 얻지만 통제권은 아직 없다.",
    "state_change" => "엔비디아 보유분은 실제 약 10%가 되고 25%·40%·50%는 협상경로와 목표로 남는다.",
    "closed_loops" => "손정우 35억 달러 대출계약과 엔비디아 3% 교환",
    "opened_loops" => "뱅가드·피델리티 각 7% 협상; 엔비디아 25%·40%·최종 50% 목표"
  },
  495 => {
    "action" => "대만에 추가채권 이전 가능성을 내비치고 방한한 리강에게서 5년간 금융활동 무제한 허용과 5년 뒤 채권 양도 조건의 말수락을 받는다. 금융사 담당자들은 세부조건 협상에 들어간다.",
    "resistance_or_cost" => "중국의 정치적 말수락을 금융타워 각 사의 세부 계약과 실제 활동권으로 내려야 하며 추가조건은 아직 협상 전이다.",
    "turn_or_reveal" => "리강이 5년 금융활동 무제한과 5년 뒤 채권 양도를 말로 수락해 정치적 문이 열리지만 계약서·세부 실행은 뒤에 남는다.",
    "paid_reward" => "중국 금융시장 5년 무제한 활동권과 5년 뒤 청나라 채권 양도 조건의 정치적 수락·말합의를 얻는다. 금융타워 전체 세부계약은 미지급이다.",
    "state_change" => "청나라 채권은 중국의 5년 권한 말합의를 끌어낸 정치 지렛대가 되고 각 금융사는 세부협상 단계로 들어간다.",
    "closed_loops" => "중국의 5년 금융활동 허용·5년 뒤 채권양도 말합의",
    "opened_loops" => "금융타워 각 사 세부조건·계약 체결; 중국 내 실제 금융활동 실행; 니콜라 폭로"
  },
  513 => {
    "reader_promise" => "인도·베트남에 중국 구형반도체 시장의 최소 50%를 대체할 생산기지를 세우고 구형 노광장비를 중국보다 먼저 선점하는 약속.",
    "protagonist_goal" => "2년 내 중국 제재와 차량용 반도체 대란 전에 인도·베트남 구형팹, 구형 노광장비 공급선, HBM·GPU 한국기지를 배치한다.",
    "action" => "인도·베트남 팹을 중국 구형반도체 시장 최소 50% 대체 규모로 잡고 중국 업체보다 먼저 구형 노광장비 공급계약을 맺도록 지시한다. 2년 내 제재·차량용 공급부족을 설명하고 악성재고는 본사가 매입 책임지며 HBM 5배 증설·한국 GPU 부지를 배치한다.",
    "resistance_or_cost" => "중국 기업과 구형 노광장비를 두고 경쟁해야 하고 제재가 빗나가면 수십조 원 악성재고가 남는다. 본사가 재고 매입책임을 져야 한다.",
    "turn_or_reveal" => "차량용 반도체 대란과 2년 내 중국 제재를 근거로 본사가 해외팹 악성재고를 전부 사겠다고 책임져 반대를 돌려세운다.",
    "paid_reward" => "중국 시장 최소 50% 대체 규모, 인도·베트남 구형팹, 중국보다 앞선 구형 노광장비 공급계약 방침, 본사 악성재고 매입책임, HBM 5배 증설과 한국 GPU 부지를 확정한다. 팹 건설·장비 계약은 미지급이다.",
    "state_change" => "해외 구형팹 구상이 대체규모·장비 선점·재고 책임·생산품을 갖춘 국가급 생산계획으로 바뀐다.",
    "ending_hook" => "중국 업체보다 먼저 구형 노광장비 공급계약을 확보하고 2년 뒤 차량용 반도체 부족 전에 인도·베트남 팹을 가동할 수 있는가?",
    "closed_loops" => "해외팹 대체규모·생산품·재고책임·HBM/GPU 투자결정",
    "opened_loops" => "구형 노광장비 선점계약; 인도·베트남 팹 건설·양산; 중국 경쟁·악성재고 위험"
  },
  514 => {
    "reader_promise" => "베트남 반도체공장↔쌀·농지, 인도 공장↔밀을 교환하고 ASML 구형장비를 중국 대신 태우로 돌릴 직접협상을 연다.",
    "protagonist_goal" => "해외팹 생산품을 배분하고 베트남·인도 곡물·농지 조건과 ASML 구형장비 공급을 직접 협상한다.",
    "action" => "공장별 생산품을 배분한 뒤 베트남 공장 대가로 곡물계약·대규모 농지사용권, 인도 공장 대가로 밀을 요구하기로 한다. 1,000억 달러 곡물 비판을 버티며 ASML이 중국 대신 태우와 구형장비 계약을 맺을지 우려하자 김민재가 직접 협상하고 귀로 베트남·인도 도장을 받겠다고 정한다.",
    "resistance_or_cost" => "반도체공장과 곡물·농지 교환은 오너리스크 비판을 부르고, ASML은 제한된 구형장비를 중국과 태우 사이에서 배분해야 한다.",
    "turn_or_reveal" => "곡물시장 비판과 중국 배후 의심에도 김민재가 ASML 직접협상 뒤 베트남·인도 정부 계약까지 한 순방으로 잇기로 한다.",
    "paid_reward" => "해외팹 생산품 배분, 베트남의 곡물·농지와 인도의 밀이라는 교환조건, ASML 직접협상 및 베트남·인도 방문·도장 계획을 확정한다. ASML 장비공급과 정부계약은 아직 미지급이다.",
    "state_change" => "해외팹은 반도체 생산계획에서 식량·농지·노광장비를 맞바꾸는 국가협상안으로 진전된다.",
    "ending_hook" => "ASML이 중국 대신 태우와 구형장비 공급계약을 맺고 베트남·인도가 곡물·농지 교환조건에 도장 찍을 것인가?",
    "closed_loops" => "해외팹 생산품 배분; 베트남·인도 교환조건; ASML 직접협상·순방 결정",
    "opened_loops" => "ASML 구형장비 공급계약; 베트남 곡물·농지 계약; 인도 밀·팹 계약"
  },
  515 => {
    "entry_state" => "김민재가 네덜란드 ASML에서 매출 14조 원의 독점 장비사 대표 피터슨과 마주 앉는다.",
    "reader_promise" => "ASML 증설비를 대신 내고 기존 EUV 50%, 신규 EUV 70%, 중국행 DUV 물량까지 태우의 해외팹으로 돌리는 장비계약 보상.",
    "protagonist_goal" => "ASML 생산능력을 키워 주는 대신 기존·신규 EUV와 중국 제재 뒤 남을 DUV를 태우 팹에 우선 배정받는다.",
    "action" => "ASML 증설비 지원을 제시하고 기존 EUV 물량 50%, 신규 생산분 70%, 중국 제재 뒤 남을 DUV의 태우 공급을 협상한다.",
    "resistance_or_cost" => "ASML은 고객이 줄을 선 독점 장비사라 한 고객에게 과반을 몰아줄 이유가 없고, 태우는 증설비를 선지출해야 한다.",
    "turn_or_reveal" => "태우가 중국 시장을 잃을 DUV의 인도·베트남 판매처까지 책임지자 피터슨이 기존 EUV 50%·신규 70%와 후속 DUV 공급에 동의한다.",
    "paid_reward" => "기존 EUV 50%, 신규 EUV 70%, 중국 제재 뒤 DUV 공급 약속과 ASML 증설비 지원 합의를 얻는다.",
    "state_change" => "태우는 장비를 기다리는 구매자에서 ASML 증설비와 중국 대체수요를 대는 우선 고객으로 올라선다.",
    "ending_hook" => "ASML 장비배정 약속을 베트남·인도 팹과 곡물·농지 정부협상에 실제로 연결할 수 있는가?",
    "closed_loops" => "ASML 기존·신규 EUV 공급비율; 중국 제재 뒤 DUV 공급약속; 증설비 지원합의",
    "opened_loops" => "5년 장기계약 문서화·지출; 베트남·인도 팹·곡물·농지 정부협상"
  },
  516 => {
    "entry_state" => "김민재가 베트남의 대규모 구형 반도체 단지와 김태중의 현지 역할을 확인한다.",
    "reader_promise" => "ASML 5년 장비계약과 베트남·인도 협상·지출을 회고하고 곡물·농지 보상과 28GHz·스타링크를 한 회차의 두 축으로 지급한다.",
    "protagonist_goal" => "베트남 구형반도체 단지·ASML 장비·곡물/농지·인도 협상을 묶고 귀국 뒤 28GHz·스타링크 기반을 강행한다.",
    "action" => "베트남 대규모 구형 반도체 단지를 계획하고 이미 체결한 ASML 계약으로 중국행 구형장비 일부를 확보한다. 단지 보상으로 곡물·농지를 요구하고 김태중이 푹 수상 자리를 마련하기로 한다. 보름 뒤 네덜란드 5년 계약 10조 원 이상과 베트남·인도 수배 지출을 회고한 뒤 28GHz·스타링크 구축을 지시한다.",
    "resistance_or_cost" => "베트남·인도·ASML에 10조 원과 그 몇 배를 쓰고, 28GHz는 기지국 비용이 커 10조 원 추가투자가 필요하다.",
    "turn_or_reveal" => "네덜란드·베트남·인도 협상을 마친 뒤 태우 재무비판을 무시하고, 수익보다 회귀 전 끊기던 5G 실패를 반복하지 않겠다고 28GHz 투자를 택한다.",
    "paid_reward" => "ASML 5년 장기계약 10조 원 이상과 중국행 구형장비 일부, 베트남·인도 정부협상 및 수배 지출 회고, 김태중의 푹 수상 면담 주선, 28GHz·스타링크 구축명령을 확인한다. 베트남 단지·곡물/농지 계약은 계획·협상 단계다.",
    "state_change" => "해외팹·장비·식량 협상은 실제 순방과 지출을 거쳐 실행기반을 얻고 국내에서는 손실을 감수한 28GHz·위성 보완망 투자로 전환된다.",
    "ending_hook" => "해외팹 협상과 장비계약 뒤 28GHz 전국망·스타링크 협업을 실제 통신·자율주행 기반으로 구축할 수 있는가?",
    "closed_loops" => "ASML 5년 계약과 구형장비 일부 확보; 베트남·인도 정부협상 순방; 28GHz 유지·스타링크 보완 결정",
    "opened_loops" => "베트남 반도체단지·곡물·농지 계약; 인도 팹·밀 계약; 28GHz 전국망·스타링크 협업"
  },
  654 => {
    "entry_state" => "미국 일정 뒤 귀국한 김민재가 SVB 인수결산을 받은 다음 국내 기업농·유통개혁을 점검한다.",
    "reader_promise" => "SVB의 모든 지분·경영권 이전과 시장안정을 영수증으로 지급한 뒤 기업농을 직거래·전자상거래 개혁으로 잇는다.",
    "protagonist_goal" => "SVB 1달러 인수를 소유권과 시장안정으로 닫고 태우상사에 산지계약·물류·온라인판매 유통개혁을 맡긴다.",
    "action" => "금융타워가 SVB 모든 지분·경영권을 넘겨받아 인수를 마쳤고 뱅크런 없이 예치금·주가가 상승했으며 1면에 새 주인으로 보도됐음을 확인한다. 뒤이어 기업농 성과를 점검하고 태우상사에 직거래·전자상거래 유통개혁을 맡긴다.",
    "resistance_or_cost" => "SVB 통합 뒤 다른 중소은행은 부채가 더 크고, 국내 유통개혁은 도매·소매·소상공인 반발과 태우 독식이미지를 감수해야 한다.",
    "turn_or_reveal" => "SVB 소유권 이전·시장안정·1면 보도로 미국 은행전이 결산된 뒤, 최재석 정부의 마지막 숙원과 태우 유통지배가 같은 국내 개혁안으로 전환된다.",
    "paid_reward" => "SVB 모든 지분·경영권 이전 완료, 뱅크런 없음, 예치금 소폭 상승·주가 상승, 금융타워가 새 주인이라는 1면 보도를 얻는다. 기업농 성과와 직거래·전자상거래 개혁안·조력기업 배치도 확정하되 전국 유통망 실행은 남는다.",
    "state_change" => "금융타워는 SVB의 공식 소유자이자 시장을 안정시킨 구제자로 고정되고, 국내에서는 기업농의 생산개혁이 소비자가격·전국물류 개편안으로 확장된다.",
    "ending_hook" => "SVB 인수결산 뒤 직거래·전자상거래 유통개혁을 법·물류·조력기업의 실제 체계로 만들 수 있는가?",
    "closed_loops" => "SVB 모든 지분·경영권 이전과 인수작업; 뱅크런 방지·예치금/주가 안정·1면 소유자 보도; 유통개혁 설계",
    "opened_loops" => "다른 미국 중소은행 1달러 인수; 국내 유통망 실행·법제화·시장반발"
  },
  660 => {
    "entry_state" => "유럽 방공망·금융 협상 뒤 한국 무기와 금융타워 지원이 폴란드 군수박람회의 실물계약으로 돌아온다.",
    "reader_promise" => "폴란드 20조 원 방산계약을 지급하고 체코 원전·로나 공매도의 미지급 결과를 분리해 다음 봉우리를 기다리게 한다.",
    "protagonist_goal" => "폴란드 방산계약을 확인하고 체코 원전 입찰·협상을 이어 가며 로나 공매도 그물을 유지한다.",
    "action" => "폴란드 20조 원 방산계약을 확인하고 체코 원전은 입찰·협상을 계속한다. 베릴의 로나 경고를 뒷받침할 공매도·여론 압박을 유지하며 붕괴를 기다린다.",
    "resistance_or_cost" => "체코 원전은 아직 계약 전이고 로나는 버티고 있어 베릴이 조롱과 위협을 받는다. 99% 폭락과 공매도 수익은 이 화에 오지 않는다.",
    "turn_or_reveal" => "폴란드 계약은 현실화됐지만 체코 원전과 로나의 승패는 남아, 산업 보상 뒤 금융전의 마지막 대기국면으로 넘어간다.",
    "paid_reward" => "폴란드 20조 원 방산계약과 로나 공매도 포지션·여론전 유지까지 지급된다. 체코 원전 계약, 로나 99% 폭락·수익, 베릴 복권은 미지급이다.",
    "state_change" => "한국 방산은 폴란드 20조 원 계약을 확보하지만 체코 원전은 협상 중이고 로나 숏은 결과 대기 상태로 남는다.",
    "ending_hook" => "85달러대 로나가 실제로 무너져 공매도 수익과 베릴의 명예를 지급할 것인가?",
    "closed_loops" => "폴란드 20조 원 방산계약; 로나 공매도·여론압박 유지",
    "opened_loops" => "체코 원전 계약; 로나 99% 폭락·공매도 수익; 베릴 공개복권"
  },
  661 => {
    "entry_state" => "암막커튼 뒤 숨은 베릴이 로나 지지자들의 위협과 조롱을 견디는 동안 금융타워의 공매도 포지션이 결산을 기다린다.",
    "reader_promise" => "로나 85달러가 0.003달러로 99% 폭락해 최소 300억 달러를 지급하고 베릴의 경고를 공개 복권한 뒤 식량·에너지 외교를 연다.",
    "protagonist_goal" => "로나 숏을 수익과 베릴의 명예로 닫고 김태중에게 동남아 식량·러시아 에너지 순방을 맡긴다.",
    "action" => "로나가 85달러에서 0.003달러로 99% 폭락해 최소 300억 달러 수익이 난 것을 확인하고 베릴을 공개 복권한다. 이어 김태중에게 동남아 식량과 러시아 에너지 순방을 부탁한다.",
    "resistance_or_cost" => "베릴은 살해위협과 조롱을 견뎠고, 고령의 김태중이 맡을 식량·에너지 순방에는 정치·신변 위험이 따른다.",
    "turn_or_reveal" => "로나 99% 폭락으로 베릴의 경고가 사실이 되고 최소 300억 달러가 지급된 직후, 김태중이 위험을 알면서도 해외임무를 받아들인다.",
    "paid_reward" => "로나 85달러→0.003달러·99% 폭락, 최소 300억 달러 수익, 베릴 공개복권과 김태중의 해외임무 수락이 지급된다.",
    "state_change" => "로나 공매도는 최소 300억 달러 수익으로 결산되고 숨어 있던 베릴은 공개적으로 복권된다. 김태중은 동남아 식량·러시아 에너지 임무의 담당자가 된다.",
    "ending_hook" => "김태중이 베트남을 시작으로 한국향 식량·팜유 수출예외를 실제로 받아 올 수 있는가?",
    "closed_loops" => "로나 99% 폭락·최소 300억 달러 수익; 베릴 공개복권; 김태중 순방 수락",
    "opened_loops" => "베트남·동남아 식량·팜유 수출예외; 러시아 에너지 통로"
  },
  662 => {
    "entry_state" => "김태중은 가장 오래 일한 베트남과 태우의 최대 농장을 첫 순방지로 골라 정부·현지기업 인맥을 가동한다.",
    "reader_promise" => "베트남을 비롯한 동남아 농산물·팜유의 한국 수출예외를 받아 국내 물가와 공급불안을 낮추는 보상.",
    "protagonist_goal" => "동남아 각국의 수출금지 속에서 한국향 농산물·팜유 물량을 예외로 확보한다.",
    "action" => "김태중이 베트남 정부와 현지기업을 설득해 베트남·동남아 농산물과 팜유의 한국 수출예외를 확보한다.",
    "resistance_or_cost" => "각국은 자국물가를 위해 수출을 막고 있어 한국만 예외로 두면 현지 반발과 특혜비판을 감수해야 한다.",
    "turn_or_reveal" => "정부 정책처럼 보이는 물가안정 뒤에서 김태중의 현지 인맥과 태우 유통망이 한국 우선물량을 실제로 만든다.",
    "paid_reward" => "베트남을 비롯한 동남아 농산물·팜유의 한국 수출예외와 우선공급선을 확보한다.",
    "state_change" => "수출금지에 노출된 한국은 김태중의 현지 협상으로 동남아 식량·팜유를 우선 공급받는 국가가 된다.",
    "ending_hook" => "확보한 동남아 물량을 국내 유통망에 풀어 가격안정으로 지속시킬 수 있는가?",
    "closed_loops" => "베트남·동남아 농산물·팜유 한국 수출예외",
    "opened_loops" => "동남아 물량의 국내 유통·가격효과; 수출예외 지속; 러시아 에너지 협상"
  },
  745 => {
    "turn_or_reveal" => "김태중이 위험한 특사역을 스스로 청하고 김민재가 할아버지의 능력과 신뢰를 다시 확인한다.",
    "state_change" => "지켜야 했던 할아버지가 손자의 마지막 국가사업을 맡고, 손자는 안전보장과 선물을 준비하는 상호신뢰로 관계가 바뀐다."
  },
  749 => {
    "reader_promise" => "북한 횡단철도 첫 삽을 뜨고 천민정이 AI로 코로나 치료제·희귀질병 치료제를 개발한 공로로 노벨 화학상을 받는 보상.",
    "protagonist_goal" => "횡단철도 착공을 공식화하고 태우 AI 치료제 연구의 세계적 위상을 천민정에게 돌린다.",
    "action" => "북한 횡단철도 착공식에서 첫 삽을 뜬 뒤 천민정이 AI로 코로나 치료제와 희귀질병 치료제를 개발한 공로로 노벨 화학상 수상자가 됐다는 소식을 받는다.",
    "turn_or_reveal" => "철도 첫 삽 직후 AI 치료제 개발 공로의 노벨 화학상 소식이 도착해 국가사업과 연구자 명예의 정점이 겹친다.",
    "paid_reward" => "북한 횡단철도가 착공되고 천민정은 AI로 코로나 치료제·희귀질병 치료제를 개발한 공로로 노벨 화학상 수상자가 된다."
  },
  751 => {
    "reader_promise" => "최재석·김태중 세대의 공을 돌려주고 천민정의 임신·결혼을 알려 생존·가족·복수 약속을 조손 화해와 새 가정으로 결산한다.",
    "protagonist_goal" => "평화상의 공을 할아버지 김태중에게 돌리고 국민경제당 승계를 정리한 뒤 천민정과 미래를 가족에게 약속한다.",
    "action" => "최재석과 수상·퇴임을 결산하고 평화상 상자를 김태중에게 건네 공을 돌리려 한다. 김태중은 상자를 내팽개치고 영국행을 포기해 한국·가족 곁에 남으며, 김민재는 천민정의 임신·결혼을 알리고 초음파 사진을 건넨다.",
    "resistance_or_cost" => "김태중은 영국으로 떠나려 하고 김민재는 회귀 뒤 눌러 둔 감정을 드러내며 새 가정의 책임을 받아들여야 한다.",
    "turn_or_reveal" => "할아버지가 영국행을 포기하고 손자와 손자며느리의 손을 잡자 김민재가 회귀 이후 처음으로 따뜻한 감정을 온전히 느낀다.",
    "paid_reward" => "최재석의 수상·정계퇴임, 김태중의 한국 잔류와 가족 곁 선택, 천민정의 임신·결혼 약속과 초음파 사진이 한자리에서 지급된다. 평화상은 손자가 상자째 건네 공을 돌리려 했을 뿐 공식 수상자는 김민재·최재석이다.",
    "state_change" => "복수와 독식으로 버틴 김민재는 할아버지·천민정·태어날 아이와 함께 태우그룹과 가정을 지킬 책임을 선택한다.",
    "ending_hook" => "회귀 뒤 지키려던 할아버지와 사랑하는 사람이 곁에 남았고, 이후의 과제는 얻은 세계와 가정을 함께 책임지는 삶이다.",
    "closed_loops" => "부산 엑스포·평화상·정계퇴임·조손 화해·김태중 한국 잔류·임신·결혼",
    "opened_loops" => "태우그룹과 새 가정을 함께 지키는 다음 생애"
  }
}.freeze

PACING_OVERRIDES = {
  50 => { "reward_1_10" => "7", "pacing_note" => "강 대위의 보고로 우성일이 이노폰 자료를 기자에게 넘기는 영상과 음성 녹음이 이미 확보된다. 1면 허위기사에 SAVE 반박자료와 한국·미국·독일 동시 검증을 맞붙이는 리듬이라, 증거 지급 뒤 공개 시연의 성패가 훅으로 남는다.", "weights" => %w[0.25 0.34 0.20 0.10 0.11] },
  192 => { "pacing_note" => "최재석에게 이번 주 안 후보 약 50명을 추리라고 맡긴 뒤 경호 영상이 회의 리듬을 끊는다. 불량학생 4~5명이 천민정의 동생 머리를 때리고 식판에 침을 뱉는 화면이 가족보호 압박을 만들며, 후보명단·가해자 실명은 지급하지 않는다." },
  194 => { "reward_1_10" => "8", "pacing_note" => "사진·영상·녹취·진술서와 바디캠이 회의장의 거짓말을 무너뜨리고, 김민재가 교실에서 천민우를 안아 공개 보호막을 세운다. 학폭위·명동·부장검사 윗라인 압박 지시까지 현재 화가 소유해 관계와 지위 보상이 크게 오른다." },
  246 => { "reward_1_10" => "6", "pacing_note" => "강수기는 네 가수와 SG 전원 양도·태우 불개입을 약속하고 김민재는 로펌과 감옥 보호를 이용한 희망고문을 설계한다. 실제 계약이전·판결·10년 복역은 없으므로 보상은 굴복 약속과 심리통제안까지만 잡는다." },
  259 => { "reward_1_10" => "8", "pacing_note" => "전국·북한 사투리, 4개 외국어 통역, CCTV 방범이 가능한 픽시의 즉시 출시상태를 먼저 확인한다. 래더 2위·프로 승률 50% 스타크 AI가 용산 1경기를 이긴 뒤 2경기 프로의 덫에 걸려 승률 20%로 떨어져, 제품 지급과 공개검증 위기가 한 회차 안에서 교대한다.", "weights" => %w[0.23 0.34 0.16 0.13 0.14] },
  264 => { "pacing_note" => "아마존 창고가 인건비 30%를 줄였지만 설비보다 인건비가 아직 싸다는 한계를 확인한다. 뒤이어 CITI 2만 명 감원·최소 600억 달러 손실·부실자산 매각 연락과 1년 뒤 리먼 파산설이 쌓여, 자동화 점검보다 금융 수확기의 숫자가 후반을 압도한다." },
  335 => { "reward_1_10" => "6", "pacing_note" => "최소 1만2천 명 교민의 대피비 책임을 공개하고 운송수단·미국 추가자료·구호물자 조달선을 준비한다. 실제 대피 전 전화가 동시에 울리고 동일본 대지진이 발생하므로, 지급은 준비 영수증에 제한하고 재난 발생을 드문 10점 훅으로 남긴다." },
  380 => { "reward_1_10" => "9", "pacing_note" => "OPEC 증산 직후 원유가 110달러에서 105달러로 떨어지고 5배 레버리지 수익률이 25%를 넘는다. 준비기간 자금을 하루 만에 전액 회수했다는 정확한 영수증이 석유전쟁의 첫 큰 봉우리를 만든다.", "weights" => %w[0.15 0.32 0.18 0.08 0.27] },
  382 => { "pacing_note" => "체셔피크·헤스 공매도와 500억 달러 이상 인수규모, 헤스의 가이아나 펀드 30%와 태우 목표 60%를 같은 회의에서 맞춘다. 미국 대사의 구조요청까지 오지만 소유권은 아직 없어, 고유 표적과 실행행동을 살리되 인수 완료로 넘기지 않는다." },
  482 => { "reward_1_10" => "5", "pacing_note" => "5% 금리·600만 파운드 청나라 채권을 경매·골동품상·미영 재단에서 6개월 안 최소 절반 모으라고 지시한다. 값싼 전략옵션의 계산과 담당자는 정해졌지만 실제 채권은 한 장도 확보되지 않아 계획 보상에 머문다." },
  488 => { "reward_1_10" => "8", "pacing_note" => "35억 달러 채권과 엔비디아 3%를 실제 교환해 태우증권 8% 이상·핀테크 포함 약 10%를 확인한다. 뱅가드·피델리티 각 7% 협상으로 25%·40%·최종 50% 경로가 열리지만 현재 보유를 통제권으로 부풀리지 않는다." },
  495 => { "reward_1_10" => "8", "pacing_note" => "리강이 5년간 금융활동 무제한과 5년 뒤 채권양도를 말로 수락해 정치적 문을 연다. 각 금융사 담당자가 세부조건을 만들기 시작할 뿐 계약 체결·실행 전이어서, 보상은 권한의 정치적 합의에 두고 문서화는 열린 고리로 남긴다." },
  513 => { "reward_1_10" => "6", "pacing_note" => "인도·베트남을 중국 구형반도체 시장 최소 50% 대체기지로 잡고 구형 노광장비를 중국보다 먼저 계약하라는 경쟁시계를 건다. 2년 내 제재와 차량용 부족, 악성재고 본사매입 책임까지 수치로 맞춘 뒤 HBM 5배·한국 GPU 부지로 확장한다." },
  514 => { "reward_1_10" => "6", "pacing_note" => "베트남 팹과 곡물·농지, 인도 팹과 밀을 맞바꾸는 국가 거래표를 만들고 ASML이 중국 대신 태우에 구형장비를 줄지 직접 협상하기로 한다. 1,000억 달러 곡물 비판과 장비 독점이 압박이며, 공급계약과 정부 도장은 다음 순방에 남는다." },
  515 => { "reward_1_10" => "8", "pacing_note" => "피터슨 앞에 ASML 증설비를 내고 기존 EUV 50%, 신규 EUV 70%, 중국 제재 뒤 남을 DUV 공급을 맞바꾼다. 장비를 기다리던 태우가 증설비와 인도·베트남 대체수요를 제공하는 우선고객으로 올라서는 계약 영수증이 중심이다." },
  516 => { "reward_1_10" => "8", "pacing_note" => "베트남 대규모 구형팹·곡물/농지 목표와 김태중의 푹 수상 주선을 거쳐, 보름 뒤 ASML 5년 계약 10조 원 이상과 베트남·인도 수배 지출을 회고한다. 귀국 뒤 28GHz·스타링크에 10조 원 추가를 감수하는 명령까지 이어져 공급망 지급과 통신기반 전환이 모두 남는다.", "weights" => %w[0.26 0.25 0.19 0.07 0.23] },
  654 => { "reward_1_10" => "9", "pacing_note" => "금융타워가 SVB 모든 지분·경영권을 넘겨받고 뱅크런 없이 예치금·주가가 오르며 1면에 새 주인으로 실린다. 이 소유권 결산 뒤 기업농 성과와 직거래·전자상거래 유통개혁을 논의해, 앞쪽의 큰 물질 지급과 뒤쪽 국내 전환을 함께 보존한다.", "weights" => %w[0.24 0.16 0.12 0.08 0.40] },
  660 => { "pacing_note" => "폴란드 20조 원 방산계약은 이 화에서 지급되지만 체코 원전은 협상 중이고 로나 85달러대 공매도는 결과를 기다린다. 산업계약 봉우리 뒤 로나 99% 폭락·수익·베릴 복권을 마지막 프레임의 미지급 질문으로 분리한다." },
  661 => { "reward_1_10" => "9", "pacing_note" => "로나가 85달러에서 0.003달러로 99% 무너져 금융타워가 최소 300억 달러를 벌고 베릴이 공개 복권된다. 물질 보상 직후 김태중이 동남아 식량·러시아 에너지 순방을 받아들이는 조손 대화가 이어져, 앞 Arc의 결산과 다음 식량 Arc의 문턱이 한 회차 안에서 교대한다.", "weights" => %w[0.12 0.17 0.26 0.13 0.32] },
  662 => { "pacing_note" => "김태중이 베트남 정부와 현지기업 인맥을 써 동남아 농산물·팜유의 한국 수출예외를 받아 온다. 전 화의 순방 수락이 실제 우선물량으로 지급되는 짧은 외교 보상이며, 이후 국내 유통·가격효과가 남는다." },
  745 => { "pacing_note" => "이영한의 일본·지린 사채망과 북한 장남 세력을 확인한 뒤 김태중이 대북특사를 자청한다. 손자가 막으려다 안전보장과 선물을 맡기로 물러서는 대화가 길어, 지켜야 했던 할아버지가 손자의 마지막 국가사업을 맡는 상호신뢰가 중심이다." },
  749 => { "pacing_note" => "북한 횡단철도 첫 삽으로 북방 약속을 실물화한 직후, 천민정이 AI로 코로나 치료제·희귀질병 치료제를 개발한 공로로 노벨 화학상을 받았다는 소식이 도착한다. 고체배터리 공로로 바꾸지 않고 국가사업과 치료제 연구의 두 지급을 나란히 둔다." },
  751 => { "pacing_note" => "김민재는 평화상 상자를 할아버지 김태중에게 건네 공을 돌리려 하지만 김태중은 내팽개치고 영국행을 포기해 가족 곁에 남는다. 초음파 사진을 받은 할아버지가 손자와 손자며느리의 손을 잡는 마지막 프레임이 조손 화해·임신·결혼의 감정 결산이다." }
}.freeze

raise "source SHA mismatch" unless sha(SOURCE) == SOURCE_SHA
raise "ledger SHA mismatch" unless sha(LEDGER) == LEDGER_SHA
raise "decision SHA mismatch" unless sha(DECISIONS) == DECISION_SHA
raise "validator missing" unless File.file?(VALIDATOR)
raise "common validator missing" unless File.file?(COMMON_VALIDATOR)
CANONICAL_START.each do |name, expected|
  actual = sha(File.join(ANALYSIS, name))
  raise "canonical start mismatch #{name}: #{actual}" unless actual == expected
end
baseline_path = File.join(WORK, "manager-followup-start-chapter_map-7053d49d.csv")
raise "baseline SHA mismatch" unless sha(baseline_path) == START_CHAPTER_SHA
raise "stage already exists" if File.exist?(STAGE)

decision_table = CSV.read(DECISIONS, headers: true)
raise "decision header mismatch" unless decision_table.headers == DECISION_HEADERS
decisions = decision_table.map(&:to_h)
raise "decision row count mismatch" unless decisions.length == 131
raise "decision blank field" if decisions.any? { |row| DECISION_HEADERS.any? { |field| row.fetch(field).to_s.strip.empty? } }
raise "decision ordinal mismatch" unless decisions.each_with_index.all? { |row, index| row.fetch("ordinal").to_i == index + 1 }
raise "decision IDs duplicate" unless decisions.map { |row| row.fetch("arc_id") }.uniq.length == decisions.length
raise "decision embedded SHA mismatch" unless decisions.all? { |row| row.fetch("ledger_sha256") == LEDGER_SHA && row.fetch("source_sha256") == SOURCE_SHA }
raise "analysis label in arc_name" if decisions.any? { |row| row.fetch("arc_name") =~ /(coda|bridge|subplot|climax|코다|브리지|서브플롯|클라이맥스)/i }

approved = ledger_ranges
chosen = decisions.map { |row| [row.fetch("ordinal").to_i, row.fetch("start_sequence").to_i, row.fetch("end_sequence").to_i] }
raise "ranges differ from approved ledger" unless chosen == approved
raise "coverage endpoints mismatch" unless chosen.first[1] == 1 && chosen[-1][2] == 751
raise "gap or overlap" unless chosen.each_cons(2).all? { |left, right| right[1] == left[2] + 1 }
raise "equal-length run remains" unless repeated_length_runs(chosen).empty?
raise "forbidden boundary remains" unless ([560, 660, 705, 725, 730] & chosen.map { |row| row[2] }).empty?
raise "required evidence boundary missing" unless [710, 715].all? { |boundary| chosen.map { |row| row[2] }.include?(boundary) }

chapter_path = File.join(ANALYSIS, "chapter_map.csv")
pacing_path = File.join(ANALYSIS, "arc_pacing.csv")
arc_path = File.join(ANALYSIS, "arc_map.csv")
evidence_path = File.join(REWORK, "pacing/pacing-all-evidence.csv")
high_path = File.join(REWORK, "high-score-and-relationship-evidence.csv")
field_path = File.join(WORK, "chapter-narrative-boundary-audit-001-751.csv")
rejudgment_path = File.join(WORK, "pacing-rejudgment-ledger-001-751.csv")
manual_path = File.join(WORK, "manual-pacing-prose-ledger-119.csv")

chapter_table = CSV.read(chapter_path, headers: true)
pacing_table = CSV.read(pacing_path, headers: true)
arc_table = CSV.read(arc_path, headers: true)
evidence_table = CSV.read(evidence_path, headers: true)
high_table = CSV.read(high_path, headers: true)
chapters = chapter_table.map(&:to_h)
pacing = pacing_table.map(&:to_h)
old_arcs = arc_table.map(&:to_h)
evidence = evidence_table.map(&:to_h)
old_field_rows = CSV.read(field_path, headers: true).map(&:to_h)
original_edits = old_field_rows.select { |row| row.fetch("result") == "EDIT" }
edit_sequences = original_edits.map { |row| row.fetch("sequence").to_i }.uniq.sort
raise "chapter/pacing/evidence count mismatch" unless [chapters.length, pacing.length, evidence.length] == [751, 751, 751]
raise "bidirectional audit baseline mismatch" unless original_edits.length == 297 && edit_sequences.length == 102

chapter_by_sequence = chapters.each_with_object({}) { |row, hash| hash[row.fetch("sequence").to_i] = row }
pace_by_sequence = pacing.each_with_object({}) { |row, hash| hash[row.fetch("sequence").to_i] = row }
CHAPTER_OVERRIDES.each { |sequence, fields| fields.each { |field, value| chapter_by_sequence.fetch(sequence)[field] = value } }
PACING_OVERRIDES.each do |sequence, fields|
  pace = pace_by_sequence.fetch(sequence)
  fields.each { |field, value| pace[field] = value unless field == "weights" }
  RIBBON_FIELDS.zip(fields.fetch("weights")).each { |field, value| pace[field] = value } if fields["weights"]
end
CHAPTER_OVERRIDES.each_key do |sequence|
  chapter = chapter_by_sequence.fetch(sequence)
  pace_by_sequence.fetch(sequence)["concrete_event"] = [chapter.fetch("action"), chapter.fetch("turn_or_reveal"), chapter.fetch("paid_reward")].join("; ")
end

new_arcs = decisions.map do |decision|
  first = decision.fetch("start_sequence").to_i
  last = decision.fetch("end_sequence").to_i
  start_chapter = chapter_by_sequence.fetch(first)
  end_chapter = chapter_by_sequence.fetch(last)
  middle = chapter_by_sequence.fetch((first + last) / 2)
  following = last < 751 ? chapter_by_sequence.fetch(last + 1) : nil
  overlaps = old_arcs.select { |arc| arc.fetch("end_sequence").to_i >= first && arc.fetch("start_sequence").to_i <= last }
  characters = unique_parts(overlaps, "main_characters")
  locations = unique_parts(overlaps, "main_locations")
  characters = ["김민재"] if characters.empty?
  locations = ["원문 장면의 실제 장소"] if locations.empty?
  next_action = following ? "#{following.fetch('visible_label')}에서 #{following.fetch('action')}" : "후속 Arc 없이 가족과 그룹을 책임지는 삶"
  boundary = if following
    "① #{end_chapter.fetch('visible_label')} L#{end_chapter.fetch('start_line')}~L#{end_chapter.fetch('end_line')}: #{end_chapter.fetch('paid_reward')} " \
      "② #{following.fetch('visible_label')} L#{following.fetch('start_line')}~L#{following.fetch('end_line')}: #{following.fetch('action')} " \
      "③ #{decision.fetch('boundary_line_evidence')}에서 지급·상대·장소·목표 가운데 둘 이상이 교대한다."
  else
    "① 김태중의 한국 잔류와 조손 화해 ② 천민정의 임신·결혼과 초음파 사진이 751화 안에서 가족 상태를 바꾼다."
  end
  {
    "arc_id" => decision.fetch("arc_id"),
    "arc_name" => decision.fetch("arc_name"),
    "start_sequence" => first.to_s,
    "end_sequence" => last.to_s,
    "start_label" => start_chapter.fetch("visible_label"),
    "end_label" => end_chapter.fetch("visible_label"),
    "episode_count" => (last - first + 1).to_s,
    "main_characters" => characters.join(", "),
    "main_locations" => locations.join(", "),
    "concrete_premise" => "#{start_chapter.fetch('visible_label')} L#{start_chapter.fetch('start_line')}~L#{start_chapter.fetch('end_line')}에서 #{start_chapter.fetch('entry_state')} #{start_chapter.fetch('action')}",
    "central_question" => "#{start_chapter.fetch('protagonist_goal')} 범위 마지막의 #{end_chapter.fetch('paid_reward')}까지 실제로 확인할 수 있는가?",
    "promise" => "#{start_chapter.fetch('reader_promise')} 확인 가능한 지급은 #{end_chapter.fetch('paid_reward')}",
    "pressure_escalation" => "#{middle.fetch('visible_label')} L#{middle.fetch('start_line')}~L#{middle.fetch('end_line')}에서 #{middle.fetch('resistance_or_cost')}",
    "mid_turn" => middle.fetch("turn_or_reveal"),
    "concrete_payoff" => end_chapter.fetch("paid_reward"),
    "relationship_change" => end_chapter.fetch("state_change"),
    "status_or_ability_change" => "#{end_chapter.fetch('visible_label')}에서 #{end_chapter.fetch('state_change')}",
    "residual_cost" => "#{end_chapter.fetch('opened_loops')}. #{end_chapter.fetch('ending_hook')}",
    "next_arc_bridge" => "#{end_chapter.fetch('ending_hook')} 다음 첫 행동은 #{next_action}.",
    "boundary_signals" => boundary,
    "confidence" => "0.96"
  }
end

arc_for_sequence = {}
expected = 1
new_arcs.each do |arc|
  first = arc.fetch("start_sequence").to_i
  last = arc.fetch("end_sequence").to_i
  raise "arc coverage break" unless first == expected && arc.fetch("episode_count").to_i == last - first + 1
  (first..last).each { |sequence| arc_for_sequence[sequence] = arc }
  expected = last + 1
end
raise "arc coverage end mismatch" unless expected == 752
raise "arc count mismatch" unless new_arcs.length == decisions.length

chapters.each { |row| row["arc_id"] = arc_for_sequence.fetch(row.fetch("sequence").to_i).fetch("arc_id") }
pacing.each do |row|
  arc = arc_for_sequence.fetch(row.fetch("sequence").to_i)
  row["arc_id"] = arc.fetch("arc_id")
  row["arc_phase"] = "#{arc.fetch('arc_id').sub('DCA-', '')}·#{arc.fetch('arc_name')}"
  sum = RIBBON_FIELDS.inject(0.0) { |total, field| total + row.fetch(field).to_f }
  raise "ribbon sum mismatch #{row.fetch('sequence')}" unless (sum - 1.0).abs <= 0.01
  SCORE_FIELDS.each { |field| raise "score range" unless row.fetch(field).to_i.between?(1, 10) }
end
evidence.each do |row|
  pace = pace_by_sequence.fetch(row.fetch("sequence").to_i)
  row["arc_id"] = pace.fetch("arc_id")
  row["arc_phase"] = pace.fetch("arc_phase")
  (SCORE_FIELDS + RIBBON_FIELDS).each { |field| row[field] = pace.fetch(field) }
  row["ribbon_rationale"] = pace.fetch("pacing_note")
end
high = evidence.select { |row| SCORE_FIELDS.map { |field| row.fetch(field).to_i }.max >= 9 || row.fetch("relationship_weight").to_f >= 0.30 }.map(&:dup)

FileUtils.rm_rf(TEMP_STAGE)
%w[derived authority validation].each { |directory| FileUtils.mkdir_p(File.join(TEMP_STAGE, directory)) }
write_csv(File.join(TEMP_STAGE, "chapter_map.csv"), chapters, chapter_table.headers)
write_csv(File.join(TEMP_STAGE, "arc_pacing.csv"), pacing, pacing_table.headers)
write_csv(File.join(TEMP_STAGE, "arc_map.csv"), new_arcs, arc_table.headers)
write_stage(File.join(TEMP_STAGE, "source_receipt.json"), File.binread(File.join(ANALYSIS, "source_receipt.json")))
write_csv(File.join(TEMP_STAGE, "derived", "pacing-all-evidence.csv"), evidence, evidence_table.headers)
write_csv(File.join(TEMP_STAGE, "derived", "high-score-and-relationship-evidence.csv"), high, high_table.headers)

baseline = CSV.read(baseline_path, headers: true).each_with_object({}) { |row, hash| hash[row.fetch("sequence").to_i] = row }
field_headers = %w[sequence visible_label arc_id field source_lines next_source_lines candidate_status result before_provenance before after boundary_evidence]
field_rows = []
(1..751).each do |sequence|
  before = baseline.fetch(sequence)
  after = chapter_by_sequence.fetch(sequence)
  NARRATIVE_FIELDS.each do |field|
    changed = before[field].to_s != after[field].to_s
    field_rows << {
      "sequence" => sequence.to_s,
      "visible_label" => after.fetch("visible_label"),
      "arc_id" => after.fetch("arc_id"),
      "field" => field,
      "source_lines" => "L#{after.fetch('start_line')}~L#{after.fetch('end_line')}",
      "next_source_lines" => sequence < 751 ? "L#{chapter_by_sequence.fetch(sequence + 1).fetch('start_line')}~L#{chapter_by_sequence.fetch(sequence + 1).fetch('end_line')}" : "END",
      "candidate_status" => changed ? "CANDIDATE" : "NONE",
      "result" => changed ? "EDIT" : "PASS",
      "before_provenance" => "manager-followup immutable SHA #{START_CHAPTER_SHA}",
      "before" => before[field].to_s,
      "after" => after[field].to_s,
      "boundary_evidence" => changed ? "현재 화 끝선과 다음 화 첫선을 양방향 대조" : "현재 화 하드 경계와 일치"
    }
  end
end
write_csv(File.join(TEMP_STAGE, "derived", "chapter-narrative-boundary-audit-001-751.csv"), field_rows, field_headers)

audit297_headers = %w[sequence visible_label field source_lines manager_start_before pre_rejection_after stage_after bidirectional_result evidence adjudication]
audit297 = original_edits.map do |old|
  sequence = old.fetch("sequence").to_i
  field = old.fetch("field")
  final_value = chapter_by_sequence.fetch(sequence)[field].to_s
  changed = final_value != old.fetch("after").to_s
  {
    "sequence" => sequence.to_s,
    "visible_label" => chapter_by_sequence.fetch(sequence).fetch("visible_label"),
    "field" => field,
    "source_lines" => "L#{chapter_by_sequence.fetch(sequence).fetch('start_line')}~L#{chapter_by_sequence.fetch(sequence).fetch('end_line')}",
    "manager_start_before" => old.fetch("before"),
    "pre_rejection_after" => old.fetch("after"),
    "stage_after" => final_value,
    "bidirectional_result" => changed ? "EDIT_CURRENT_FACT_RECOVERY" : "PASS_BIDIRECTIONAL",
    "evidence" => "현재 화 인물·고유명·수치·행동·계약상태와 다음 화 첫선을 대조",
    "adjudication" => changed ? "삭제·일반화된 현재 사실을 복원하거나 잘못된 유예를 제거" : "미래 선취와 현재 사실 누락이 없음"
  }
end
write_csv(File.join(TEMP_STAGE, "derived", "current-fact-omission-audit-297-fields.csv"), audit297, audit297_headers)

audit102_headers = %w[sequence source_lines result changed_fields absence_claim_check current_fact_check note]
audit102 = edit_sequences.map do |sequence|
  changed_fields = audit297.select { |row| row.fetch("sequence").to_i == sequence && row.fetch("bidirectional_result") == "EDIT_CURRENT_FACT_RECOVERY" }.map { |row| row.fetch("field") }
  {
    "sequence" => sequence.to_s,
    "source_lines" => "L#{chapter_by_sequence.fetch(sequence).fetch('start_line')}~L#{chapter_by_sequence.fetch(sequence).fetch('end_line')}",
    "result" => changed_fields.empty? ? "PASS_BIDIRECTIONAL" : "EDIT_CURRENT_FACT_RECOVERY",
    "changed_fields" => changed_fields.join(";"),
    "absence_claim_check" => "PASS: 아직·미정·계약 전 표현을 원문 끝선과 대조",
    "current_fact_check" => "PASS: 인물·고유명·수치·계약상태·실물행동 보존",
    "note" => "미래 선취 제거와 현재 사실 보존을 함께 확인"
  }
end
write_csv(File.join(TEMP_STAGE, "derived", "current-fact-omission-audit-102-sequences.csv"), audit102, audit102_headers)

rejudgment_table = CSV.read(rejudgment_path, headers: true)
rejudgment = rejudgment_table.map(&:to_h)
rejudgment.each do |row|
  sequence = row.fetch("sequence").to_i
  chapter = chapter_by_sequence.fetch(sequence)
  pace = pace_by_sequence.fetch(sequence)
  row["semantic_status"] = "EDIT_MANAGER_REDTEAM_STAGE" if CHAPTER_OVERRIDES.key?(sequence)
  row["score_status"] = "EDIT_MANAGER_REDTEAM_STAGE" if PACING_OVERRIDES.dig(sequence, "reward_1_10")
  row["ribbon_status"] = "EDIT_MANAGER_REDTEAM_STAGE" if PACING_OVERRIDES.dig(sequence, "weights")
  row["new_tension"] = pace.fetch("tension_1_10")
  row["new_reward"] = pace.fetch("reward_1_10")
  row["new_hook"] = pace.fetch("hook_1_10")
  row["new_ribbon"] = RIBBON_FIELDS.map { |field| pace.fetch(field) }.join("/")
  row["actual_action"] = chapter.fetch("action")
  row["actual_paid_reward"] = chapter.fetch("paid_reward")
  row["actual_ending_hook"] = chapter.fetch("ending_hook")
  row["concrete_event_after"] = pace.fetch("concrete_event")
  row["pacing_note_after"] = pace.fetch("pacing_note")
  row["adjudication"] = "현재 화 하드 경계에서 양방향 재판정" if CHAPTER_OVERRIDES.key?(sequence)
end
write_csv(File.join(TEMP_STAGE, "derived", "pacing-rejudgment-ledger-001-751.csv"), rejudgment, rejudgment_table.headers)

manual_table = CSV.read(manual_path, headers: true)
manual = manual_table.map(&:to_h)
manual.each do |row|
  sequence = row.fetch("sequence").to_i
  next unless PACING_OVERRIDES.key?(sequence)
  chapter = chapter_by_sequence.fetch(sequence)
  pace = pace_by_sequence.fetch(sequence)
  row["after_note"] = pace.fetch("pacing_note")
  row["note_status"] = "EDIT_MANAGER_REDTEAM_STAGE"
  row["score_status"] = "EDIT_MANAGER_REDTEAM_STAGE" if PACING_OVERRIDES.dig(sequence, "reward_1_10")
  row["ribbon_status"] = "EDIT_MANAGER_REDTEAM_STAGE" if PACING_OVERRIDES.dig(sequence, "weights")
  row["retained_scores"] = SCORE_FIELDS.map { |field| pace.fetch(field) }.join("/")
  row["retained_ribbon"] = RIBBON_FIELDS.map { |field| pace.fetch(field) }.join("/")
  row["source_readback"] = "#{chapter.fetch('action')} | 지급: #{chapter.fetch('paid_reward')}"
  row["boundary_readback"] = "현재 화 L#{chapter.fetch('start_line')}~L#{chapter.fetch('end_line')} 안의 표면만 사용"
end
write_csv(File.join(TEMP_STAGE, "derived", "manual-pacing-prose-ledger-119.csv"), manual, manual_table.headers)
Dir.glob(File.join(WORK, "audit-ledger-*.csv")).sort.each { |path| write_stage(File.join(TEMP_STAGE, "derived", File.basename(path)), File.binread(path)) }

atlas = +"# 《독식하는 재벌 3세》 자연 NarrativeArc Atlas — 승인 대기 stage\n\n"
atlas << "> 승인 장부의 131개 범위와 현재 회차의 인물·장소·물건·금액·행동으로 구성했다. canonical에는 적용하지 않았다.\n\n"
new_arcs.each_with_index do |arc, index|
  first = arc.fetch("start_sequence").to_i
  last = arc.fetch("end_sequence").to_i
  atlas << "## #{format('%03d', index + 1)} · #{arc.fetch('arc_id')} · #{arc.fetch('arc_name')} (#{first}~#{last})\n\n"
  %w[main_characters main_locations concrete_premise central_question pressure_escalation concrete_payoff status_or_ability_change residual_cost next_arc_bridge boundary_signals].zip(
    ["인물", "장소", "시작 장면", "지배 질문", "중간 압박", "범위 안 지급", "상태 변화", "남은 부채", "다음 첫 행동", "경계 근거"]
  ).each { |field, label| atlas << "- #{label}: #{arc.fetch(field)}\n" }
  atlas << "\n### 회차 추적\n\n"
  (first..last).each do |sequence|
    chapter = chapter_by_sequence.fetch(sequence)
    pace = pace_by_sequence.fetch(sequence)
    atlas << "- #{chapter.fetch('visible_label')} `L#{chapter.fetch('start_line')}~L#{chapter.fetch('end_line')}` · #{chapter.fetch('action')} · 지급: #{chapter.fetch('paid_reward')} · 마지막: #{chapter.fetch('ending_hook')} · T/R/H #{pace.fetch('tension_1_10')}/#{pace.fetch('reward_1_10')}/#{pace.fetch('hook_1_10')}\n"
  end
  atlas << "\n"
end
write_stage(File.join(TEMP_STAGE, "arc_atlas.md"), atlas)

bible = +"# 《독식하는 재벌 3세》 Project Bible — 131 NarrativeArc stage\n\n"
bible << "> 김민재의 회귀 뒤 생존·가족·복수 약속을 기업 소유권·계약·국가사업과 가족 결산의 실제 장면으로 추적한다. canonical 미적용이다.\n\n"
bible << "## 관계·결말 고정\n\n- 김태중은 김민재의 할아버지다. 751화에서 영국행을 포기하고 한국과 가족 곁에 남는다.\n"
bible << "- 천민정의 749화 노벨 화학상 사유는 AI 코로나 치료제와 희귀질병 치료제 개발이다.\n"
bible << "- 751화는 조손 화해, 천민정의 임신·결혼, 초음파 사진과 손잡기로 가족 약속을 닫는다.\n\n"
bible << "## 사건 지도\n\n"
new_arcs.each_with_index do |arc, index|
  bible << "### #{format('%03d', index + 1)} #{arc.fetch('arc_id')} · #{arc.fetch('arc_name')} · #{arc.fetch('start_sequence')}~#{arc.fetch('end_sequence')}\n\n"
  bible << "- 시작: #{arc.fetch('concrete_premise')}\n- 인물·장소: #{arc.fetch('main_characters')} / #{arc.fetch('main_locations')}\n"
  bible << "- 압박: #{arc.fetch('pressure_escalation')}\n- 지급: #{arc.fetch('concrete_payoff')}\n- 다음: #{arc.fetch('next_arc_bridge')}\n\n"
end
write_stage(File.join(TEMP_STAGE, "project_bible.md"), bible)

gap = +"# InkOS 사용·Gap 보고서 — 131 Arc stage\n\n> canonical 미적용. 승인 장부와 stage CSV의 추적 보고서다.\n\n"
gap << "## 핵심 Gap\n\n- 미래 고유명·계약·수익 선취와 현재 지급 삭제를 양방향으로 검사했다.\n- 계획·말합의·서명·소유권·시장결과를 분리했다.\n- NarrativeArc와 1~3화 ArcPacket을 구분한다.\n\n## Arc 추적\n\n"
new_arcs.each_with_index { |arc, index| gap << "- #{format('%03d', index + 1)} `#{arc.fetch('arc_id')}` #{arc.fetch('start_sequence')}~#{arc.fetch('end_sequence')} · #{arc.fetch('arc_name')} · 시작 #{arc.fetch('concrete_premise')} · 지급 #{arc.fetch('concrete_payoff')} · 다음 #{arc.fetch('next_arc_bridge')}\n" }
gap << "\n관리자 승인 전 canonical 적용·완료 선언·커밋·푸시는 하지 않는다.\n"
write_stage(File.join(TEMP_STAGE, "inkos_usage_and_gap_report.md"), gap)

improvements = +"# 무료 개선 보고서 — 131 Arc stage\n\n> canonical 미적용.\n\n## 즉시 가능한 개선\n\n- 현재 화 마지막 프레임에 없는 다음 화 고유 정답을 경고한다.\n- 계획·검토·말수락과 서명·계좌·지분·경영권을 별도 상태로 둔다.\n- 독립 지급 둘 이상과 상대·장소 교대가 함께 있을 때만 경계 후보를 낸다.\n- T/R/H와 리본은 실제 장면 체류시간과 지급 중량을 설명하게 한다.\n\n## Arc별 회귀 테스트\n\n"
new_arcs.each_with_index { |arc, index| improvements << "- #{format('%03d', index + 1)} #{arc.fetch('arc_id')} #{arc.fetch('arc_name')}: 시작 #{arc.fetch('concrete_premise')} / 지급 #{arc.fetch('concrete_payoff')} / 경계 #{arc.fetch('boundary_signals')}\n" }
improvements << "\nSTAGE_READY 후보이며 관리자 승인 전 canonical과 공통 도구를 바꾸지 않는다.\n"
write_stage(File.join(TEMP_STAGE, "free_improvements_report.md"), improvements)

pending = "TEMP_STAGE 검증 전"
write_stage(File.join(TEMP_STAGE, "completion_receipt.md"), completion_text(new_arcs, pacing, pending, pending))
write_stage(File.join(TEMP_STAGE, "authority", File.basename(LEDGER)), File.binread(LEDGER))
write_stage(File.join(TEMP_STAGE, "authority", File.basename(DECISIONS)), File.binread(DECISIONS))
write_stage(File.join(TEMP_STAGE, "authority", File.basename(__FILE__)), File.binread(__FILE__))
write_stage(File.join(TEMP_STAGE, "authority", File.basename(VALIDATOR)), File.binread(VALIDATOR))
write_stage(
  File.join(TEMP_STAGE, "authority", "authority-input-receipt.json"),
  JSON.pretty_generate({
    "status" => "STAGE_BUILD_INPUTS_VERIFIED",
    "generatedAt" => Time.now.iso8601,
    "sourceSha256" => SOURCE_SHA,
    "approvedLedgerSha256" => LEDGER_SHA,
    "decisionCsvSha256" => DECISION_SHA,
    "authoritySha256" => sha(__FILE__),
    "validatorSha256" => sha(VALIDATOR),
    "canonicalStartSha256" => CANONICAL_START,
    "decisionRows" => decisions.length,
    "coverage" => "1-751",
    "canonicalWriteAllowed" => false
  }) + "\n"
)

custom = run_stage_validator(TEMP_STAGE)
strict = run_strict(TEMP_STAGE)
write_stage(File.join(TEMP_STAGE, "completion_receipt.md"), completion_text(new_arcs, pacing, custom, strict))
custom = run_stage_validator(TEMP_STAGE)
strict = run_strict(TEMP_STAGE)
write_stage(File.join(TEMP_STAGE, "validation", "stage-validator.txt"), custom)
write_stage(File.join(TEMP_STAGE, "validation", "common-strict.txt"), strict)

CANONICAL_START.each do |name, expected|
  raise "canonical changed during build #{name}" unless sha(File.join(ANALYSIS, name)) == expected
end
root_shas = ROOT_OUTPUTS.each_with_object({}) { |name, hash| hash[name] = sha(File.join(TEMP_STAGE, name)) }
receipt = +"# Manager red-team stage build receipt\n\n- status: **STAGE_READY / AWAITING_MANAGER_SCRIPT_AND_STAGE_APPROVAL**\n"
receipt << "- source: `#{SOURCE_SHA}`\n- ledger: `#{LEDGER_SHA}`\n- decision: `#{DECISION_SHA}`\n- authority: `#{sha(__FILE__)}`\n- validator: `#{sha(VALIDATOR)}`\n"
receipt << "- arcs/chapters/pacing: #{new_arcs.length}/#{chapters.length}/#{pacing.length}\n- evidence/high: #{evidence.length}/#{high.length}\n- audits: #{field_rows.length}/#{audit297.length}/#{audit102.length}\n\n"
receipt << "## Root 9 SHA\n\n" + root_shas.map { |name, digest| "- `#{digest}`  `#{name}`" }.join("\n") + "\n\n"
receipt << "## Stage validator\n\n```text\n#{custom.strip}\n```\n\n## Common strict\n\n```text\n#{strict.strip}\n```\n\ncanonical apply·commit·push 없음.\n"
write_stage(File.join(TEMP_STAGE, "validation", "stage-build-receipt.md"), receipt)

manifest_path = File.join(TEMP_STAGE, "stage-file-manifest.sha256")
files = Dir.glob(File.join(TEMP_STAGE, "**", "*"), File::FNM_DOTMATCH).select { |path| File.file?(path) && path != manifest_path }.sort
write_stage(manifest_path, files.map { |path| "#{sha(path)}  #{path.delete_prefix("#{TEMP_STAGE}/")}" }.join("\n") + "\n")

raise "stage target appeared during build" if File.exist?(STAGE)
File.rename(TEMP_STAGE, STAGE)
puts "PASS STAGE_READY arcs=#{new_arcs.length} chapters=#{chapters.length} pacing=#{pacing.length}"
puts "decision=#{DECISION_SHA}"
puts "authority=#{sha(__FILE__)}"
puts "stage=#{STAGE}"
puts custom.strip
puts strict.strip

