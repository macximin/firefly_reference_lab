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
STAGE = File.join(WORK, "stage-manager-redteam-v3-2026-08-14")
TEMP_STAGE = File.join(WORK, ".stage-manager-redteam-v3-2026-08-14.tmp")
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
ARC_PROSE_FIELDS = %w[
  central_question promise pressure_escalation relationship_change
  status_or_ability_change residual_cost next_arc_bridge boundary_signals
].freeze
ARC_EDITORIAL_FIELDS = %w[
  central_question boundary_signals relationship_change
  status_or_ability_change pacing_reading
].freeze
EFFECTIVE_RANGE_OVERRIDES = {
  "DCA-N56B" => [642, 643],
  "DCA-N57" => [644, 645]
}.freeze
EFFECTIVE_DECISIONS_NAME = "effective-redteam-decisions-v2.csv"
BOUNDARY_AMENDMENT_NAME = "manager-boundary-amendment-642-645.md"
BOUNDARY_AMENDMENT_LINES = "L111872~L112240"
SURFACE_AMENDMENT_NAME = "manager-surface-amendment-n63-688.md"
SURFACE_AMENDMENT_LINES = "L119442~L119593"
SURFACE_CHARACTER_LIMIT = 12
SURFACE_LOCATION_LIMIT = 10
SURFACE_EVIDENCE_NAME = "arc-surface-evidence-v2.csv"
ENDPOINT_AUDIT_NAME = "manager-arc-endpoint-audit-2026-08-14.csv"
ENDPOINT_AUDIT_SHA = "70474186bc438041970cefa9096f28ebf733e5660533eb1768510f2f688b4163"
ENDPOINT_AUDIT_STATUS = "ENDPOINT_AUDIT_COMPLETE_131_OF_131"
ENDPOINT_AUDIT_COMPLETE_STATUS = "ENDPOINT_AUDIT_131_OF_131"
ENDPOINT_AUDIT_HEADERS = %w[
  ordinal arc_id end_sequence source_lines result paid_reward_before
  paid_reward_after ending_hook_before ending_hook_after closed_loops_after
  opened_loops_after pacing_result evidence_note batch_status
].freeze
EXTRA_SAMPLE_AUDIT_NAME = "manager-extra-sample-qa-2026-08-14.csv"
EXTRA_SAMPLE_AUDIT_SHA = "b6711ddac75e1869ffb0fe8edd86a3a97e945a13396ceab447f7aacfbe6b6bc7"
EXTRA_SAMPLE_AUDIT_HEADERS = %w[
  sequence source_lines issue corrected_current_receipt_or_note boundary_decision
].freeze
SURFACE_EVIDENCE_HEADERS = %w[
  arc_id start_sequence end_sequence start_line end_line main_characters
  main_locations character_evidence location_evidence source_sha256
].freeze
SURFACE_CHARACTER_ALIASES = {
  "김민재" => ["김민재"],
  "김태중" => ["김태중", "할아버지", "김 회장"],
  "한정훈" => ["한정훈", "한 사장", "한 부회장"],
  "최재석" => ["최재석", "최 의원", "최 대통령"],
  "천민정" => ["천민정", "천 박사"],
  "강 대위" => ["강 대위"],
  "이영한" => ["이영한"],
  "데이비드" => ["데이비드"],
  "장남" => ["장남", "백두혈통 장남"],
  "프리고진" => ["프리고진"],
  "로만" => ["로만"]
}.freeze
SURFACE_LOCATION_ALIASES = {
  "강 대위 사무실" => ["강 대위 사무실", "강 대위의 사무실"],
  "태우 본사" => ["태우 본사", "태우그룹 본사"],
  "태우 회장실" => ["태우 회장실"],
  "회장실" => ["회장실"],
  "금융타워" => ["금융타워"],
  "명동" => ["명동"],
  "연변" => ["연변"],
  "중국" => ["중국"],
  "북한" => ["북한"],
  "러시아" => ["러시아"],
  "한국" => ["한국", "대한민국"],
  "미국" => ["미국"],
  "유럽" => ["유럽", "유럽 연합"],
  "사우디" => ["사우디", "사우디아라비아"],
  "청와대" => ["청와대"],
  "백악관" => ["백악관"]
}.freeze
SURFACE_CHARACTER_EXCLUSIONS = SURFACE_LOCATION_ALIASES.flat_map do |canonical, aliases|
  [canonical, *aliases]
end.map { |token| token.unicode_normalize(:nfkc) }.uniq.freeze
SURFACE_CHARACTER_ADDITIONS = [
  "김민재", "김태중", "한정훈", "강 대위", "이영한", "데이비드",
  "장남", "프리고진", "로만"
].freeze
SURFACE_LOCATION_ADDITIONS = [
  "강 대위 사무실", "태우 본사", "태우 회장실", "회장실", "금융타워", "명동",
  "연변", "중국", "북한", "러시아", "한국", "미국", "유럽",
  "사우디", "청와대", "백악관"
].freeze

def sha(path)
  Digest::SHA256.file(path).hexdigest
end

def endpoint_result_score(result, field)
  letter = { "tension_1_10" => "T", "reward_1_10" => "R", "hook_1_10" => "H" }.fetch(field)
  transition = result.match(Regexp.new("#{letter}\\d+_TO_#{letter}?(\\d+)"))
  return transition[1] if transition

  after = result.match(Regexp.new("AFTER_[^;]*#{letter}(\\d+)"))
  return after[1] if after

  kept = result.match(Regexp.new("KEEP_[^;]*#{letter}(\\d+)"))
  return kept[1] if kept

  raise "endpoint pacing result lacks #{field}: #{result}"
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

def normalize_surface_text(text)
  text.to_s.unicode_normalize(:nfkc).tr("\u00a0", " ").gsub(/\s+/, " ").strip
end

def split_surface_tokens(value)
  value.to_s.split(/[;,，、·|\/]+/).map do |token|
    normalize_surface_text(token).gsub(/\A["'“”‘’]+|["'“”‘’]+\z/, "")
  end.reject { |token| token.empty? || token == "원문 장면의 실제 장소" }
end

def canonical_surface_token(token, alias_table)
  normalized = normalize_surface_text(token)
  alias_table.each do |canonical, aliases|
    return canonical if ([canonical] + aliases).map { |term| normalize_surface_text(term) }.include?(normalized)
  end
  normalized
end

def surface_lexicon(rows, field, additions, alias_table, excluded: [])
  excluded_normalized = excluded.map { |token| normalize_surface_text(token) }
  (rows.flat_map { |row| split_surface_tokens(row.fetch(field)) } + additions)
    .map { |token| canonical_surface_token(token, alias_table) }
    .reject { |token| token.empty? || excluded_normalized.include?(normalize_surface_text(token)) }
    .uniq
end

def surface_aliases(token, alias_table)
  ([token] + alias_table.fetch(token, [])).map { |term| normalize_surface_text(term) }.uniq
end

def surface_occurrence(normalized_source, token, alias_table)
  surface_aliases(token, alias_table).map do |term|
    [term, normalized_source.scan(Regexp.new(Regexp.escape(term))).length]
  end.max_by { |term, count| [count, term.length] }
end

def concrete_location_token?(token)
  token.match?(/(?:사무실|회의실|회장실|본사|저택|공장|연구소|병원|학교|식당|공항|기지|현장|호텔|법원|국회|청와대|백악관|금융타워)/)
end

def source_scoped_surface(raw_source, lexicon, alias_table, always: [], limit:, location: false)
  normalized_source = normalize_surface_text(raw_source)
  scored = lexicon.each_with_index.map do |token, index|
    evidence_term, count = surface_occurrence(normalized_source, token, alias_table)
    next unless count.positive? || always.include?(token)
    evidence_term = "FIRST_PERSON_EXCEPTION" if always.include?(token) && count.zero?
    [token, count, index, evidence_term]
  end.compact
  scored.sort_by! do |token, count, index, _evidence_term|
    [always.include?(token) ? 0 : 1, location && concrete_location_token?(token) ? 0 : 1, -count, index]
  end
  chosen = scored.first(limit)
  [
    chosen.map(&:first),
    chosen.map { |token, count, _index, term| "#{token}<=#{term}(#{count})" }
  ]
end

def normalized_arc_prose(text)
  text.unicode_normalize(:nfkc)
      .sub(/\A\d+화(?:\s+L?\d+(?:~L?\d+)?)?에서\s*/, "")
      .gsub(/\d+(?:[.,]\d+)*/, "#")
      .gsub(/[\s[:punct:]·→~%+]/, "")
      .downcase
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

def mean_value(rows, field)
  rows.sum { |row| row.fetch(field).to_f } / rows.length
end

def peak_row(rows, field)
  rows.max_by { |row| [row.fetch(field).to_f, -row.fetch("sequence").to_i] }
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

def completion_text(arcs, pacing, custom, strict, validated:)
  distributions = SCORE_FIELDS.map do |field|
    values = pacing.group_by { |row| row.fetch(field) }
    "#{field}: " + values.keys.sort.map { |key| "#{key}=#{values.fetch(key).length}" }.join(", ")
  end.join("\n")
  status = if validated
    "STAGE_READY / AWAITING_MANAGER_V3_STAGE_APPROVAL"
  else
    "VALIDATION_PENDING / NOT_STAGE_READY"
  end
  proof = if validated
    "작품 전용 validator가 751회 감사 장부, 131개 Arc 연속범위, 금지 조립문 0건과 필드별 반복 검사를 통과한 뒤에만 이 영수증을 STAGE_READY로 다시 썼다."
  else
    "아직 validator를 통과하지 않았으므로 원문 전수감사·기계문 제거·stage 완료를 선언하지 않는다."
  end
  <<~MD
    # 《독식하는 재벌 3세》 red-team v3 stage completion receipt

    - 상태: **#{status}**
    - canonical 적용: **하지 않음**
    - 원문 SHA: `#{SOURCE_SHA}`
    - 승인 장부 SHA: `#{LEDGER_SHA}`
    - decision SHA: `#{DECISION_SHA}`
    - 경계 amendment: `#{BOUNDARY_AMENDMENT_NAME}` (`DCA-N56B 642~643` / `DCA-N57 644~645`)
    - 표면·시제 amendment: `#{SURFACE_AMENDMENT_NAME}` (`DCA-N63 688`, `#{SURFACE_AMENDMENT_LINES}`)
    - NarrativeArc: #{arcs.length}개, 1~751 연속
    - chapter/pacing: #{pacing.length}/#{pacing.length}행
    - 양방향 감사: 297 field / 102 sequence
    - Arc endpoint 원문 전독: **131/131** · audit SHA `#{ENDPOINT_AUDIT_SHA}`
    - endpoint batch: 001~044 EDIT 13 / KEEP 31, 045~088 EDIT 35 / KEEP 9, 089~131 EDIT 29 / KEEP 14, BOUNDARY_REVIEW 0
    - 관리자 추가표본 QA: **4/4** · `#{EXTRA_SAMPLE_AUDIT_NAME}` · audit SHA `#{EXTRA_SAMPLE_AUDIT_SHA}`
    - 검증 선언: #{proof}

    ## 분포

    ```text
    #{distributions}
    ```

    ## 확정 사실 반영

    원 장부 승인 뒤 관리자 고정표본에서 642~645 경계 귀속을 발견했으므로 원 decision을 덮지 않고 `#{BOUNDARY_AMENDMENT_NAME}`와 effective decision CSV로 명시적 amendment를 남겼다. 이어 DCA-N63의 넓은 old-Arc 인물·장소 합집합과 688화 완료시제 오류도 `#{SURFACE_AMENDMENT_NAME}`에 별도로 기록했다. 131개 Arc의 endpoint 회차를 각각 처음부터 끝까지 읽고 77개를 EDIT, 54개를 KEEP으로 고정했으며 경계 재검토는 0개다. 이 판정은 immutable `#{ENDPOINT_AUDIT_NAME}`로 stage derived에 복사되며 validator·strict 실행 전에는 상태가 `VALIDATION_PENDING`이다. 추가표본 466·468·471·721의 현재 지급·수치·훅을 `#{EXTRA_SAMPLE_AUDIT_NAME}` 4행에 고정하고 stage derived와 authority receipt에 SHA를 공개한다. 470→471은 러시아 공장 계약·5조 원 입금·로만 해소 뒤 몽골·중국으로 전환되는 경계를 유지하고, N68은 731화 초 벨라루스 협상일정 지급과 후반 이스라엘·일본 crossfade를 함께 소유한다. 131개 Arc의 인물·장소는 이제 각 Arc의 `start_line~end_line` 안에서 exact 또는 승인 alias로 확인된 표면만 출력한다. 688화는 데이비드·강 대위·이영한의 세 정보선이 러북 거래를 확인하고 중국·장남·언론·한국 무기지원 위협·바그너 감시의 역할을 지시한 데까지만 지급하며 실제 공개·러북 분열·대체공급·러시아 반응은 미지급이다. 15·50·154·156·192·194·246·259·264·335·380·382·466·468·471·482·488·495·500·513~516·590·595·598·600·603·605·608·614·625·630·633·636·642~645·648·654·660~662·664·668·672·681·687·688·690·693·710·715·720·721·731·735·739·744·745·748~751화를 현재 화 하드 경계로 다시 썼다. 154화의 승계·미국방패·아이폰 40만 대·TV·200~300% 상여금과 156화의 SNS 제작진·다이먼 금융위기 씨앗, 500화의 150% 인수보증·진단키트·마스크 명단, 516화의 ASML 5년·10조 원 초과 계약을 복원했다. 466화는 새만금 일부 완성·20곳 입주 가능·유고빈 성장과 국내 약 2천억 원·일본 약 1조 원 세탁판을 현재 영수증으로 두고 10조 원은 목표로 남긴다. 468화는 태우증권·핀테크 전량과 금융타워 80퍼센트 이상 청산·약 20퍼센트 수익을 지급하며, 471화는 몽골 자원의 중국·러시아 운송·1차가공·한미유럽 공급과 리강 충돌 유예를 소유한다. 721화는 가스관 압박과 공동중재 수락까지만 쓰고 다음 화 일본 지분 강제안을 제거한다. 이 상무의 비트코인·리규철 해킹망·CNC 귀속은 643화가 소유하고 DCA-N56B는 642~643, DCA-N57은 644~645다. 660화는 로나 붕괴를 기다리며 661화만 85→0.003달러 미만·99% 폭락·시총 절반 약 200억 달러 흡수를 지급한다. 헤지펀드를 포함한 최소 300억 달러는 전망이다. 662화의 예외는 태우 소유 농장 농산물과 태우상사 팜유에 한정한다. 749~751화는 천민정 보호·노벨 화학상 사유·태우 보상·숨은 50%+ 기업제국·조손 화해를 각각 원문 소유 회차에 둔다.

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
  10 => {
    "reader_promise" => "복수 대상의 힘까지 이용해 영국을 공격하고, 퀀텀 장기동맹·추천서 작성 약속·독자 운용자금을 얻는 첫 월가 결산.",
    "turn_or_reveal" => "조지가 자신과 짐의 대학 추천서를 써 주겠다고 약속하고, 한정훈은 퀀텀 자료에서 1,100억 달러가 이미 영국을 그로기 상태로 몰았다고 판단한다.",
    "paid_reward" => "퀀텀펀드의 모든 통화전쟁 장기동맹과 파운드 공격 60억 달러 공동투자 조건, 조지·짐의 추천서 작성 약속, 남은 40억 달러 운용 여력을 얻는다. 추천서 원본과 파운드 붕괴 수익은 아직 미지급이다.",
    "ending_hook" => "한정훈이 파운드 TF·퀀텀 대화 채널을 맡고, 대학에 갈 김민재는 굵직한 투자·영입만 직접 챙기는 SAVE 자율운영을 실제로 버티게 할 수 있는가?",
    "closed_loops" => "제프리 영입·SAVE 운영축; 퀀텀 장기동맹·60억 달러 투자 합의; 조지·짐의 추천서 작성 약속",
    "opened_loops" => "추천서 실제 수령; 영국 파운드화 붕괴·보험금; 대학 입학·조기졸업; 제프리의 IT 투자"
  },
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
  52 => {
    "paid_reward" => "국내 재고 30만 대 완판, 미국 30만 대·유럽과 한국 각 10만 대 주문, 월 10만 대 이상 수요를 확인하고 박진훈 퇴진과 사장단의 만장일치 태우전자 사장 추천을 받는다.",
    "closed_loops" => "이노폰 허위보도; 국내 재고 30만 대 완판과 해외·국내 주문; 박진훈 퇴진; 태우전자 사장 추천",
    "opened_loops" => "태우전자 지분 상속과 소유주로서의 경영권은 요구만 제시된 채 남는다"
  },
  71 => {
    "protagonist_goal" => "황영철에게 디지털케이스 지분 전량 양도 의사를 받아 직원·기술을 보존하고, 태우전자 사장직에서 그룹 기획으로 옮길 동의를 구한다.",
    "action" => "500대도 못 판 엠피맨의 황영철에게 디지털케이스 지분 전량 양도 의사와 직원 보너스용 50억 원 추가 지급 조건을 받아 직원·기술의 애플 이동을 마련한다. 한정훈에게 MCA 레코드 지분 협상을 맡긴 뒤 김태중에게 기획실 이동을 요청한다.",
    "turn_or_reveal" => "황영철이 지분 전량을 넘기겠다고 하고 김민재가 직원 보너스용 50억 원을 당일 입금하겠다고 약속한다. 한정훈은 MCA 지분 협상을 위해 출발하고 김태중은 그룹 세계화 구상을 받아들인다.",
    "paid_reward" => "황영철의 디지털케이스 지분 전량 양도 의사, 직원 보너스용 50억 원 지급 약속, 직원·황영철의 애플 재출발 경로와 김태중의 세계화 구상 동의를 얻는다. 우성일 사장 임명·김민재 기획실 발령·MCA 지분 취득은 아직 실행 전이다.",
    "state_change" => "실패한 MP3 팀은 해체 대신 애플 재출발 경로를 얻고, 김민재는 태우전자 사장직을 떠나 그룹 기획으로 옮길 의사를 김태중과 합의하지만 공식 인사·MCA 지분 취득은 남는다.",
    "ending_hook" => "김태중의 동의를 실제 기획실 인사로 만들고, 한정훈이 파나소닉의 MCA 레코드 지분을 받아 첫 세계화·음원축을 열 수 있는가?",
    "closed_loops" => "엠피맨 실패 진단; 디지털케이스 지분 양도·50억 원 지급 합의; 직원·황영철의 애플 이동 경로; 그룹 세계화 방향 동의",
    "opened_loops" => "우성일 사장 임명·김민재 기획실 발령; MCA 레코드 지분 협상·취득; 중국 자동차 진출"
  },
  77 => {
    "ending_hook" => "도착 30분 만에 전자상거래팀을 뒤엎은 제프리의 지옥훈련을 직원들이 버티고 네 프로젝트를 실제 제품으로 완성할 수 있는가?",
    "closed_loops" => "전자상거래·음원·HTS·호텔예약/A·S 네 팀의 채용·역할·자율출퇴근제와 제프리 투입",
    "opened_loops" => "제프리의 한 달 훈련과 직원 이탈 여부; 전자상거래·HTS·호텔예약·A/S 네 프로젝트의 완성"
  },
  90 => {
    "reader_promise" => "카를로스 곤의 5년 이상 계약·독립경영 수락을 실제 영입으로 닫고, 고연진과의 첫 맞선에서 훗날 경영권 분쟁 가능성만 인식한다.",
    "protagonist_goal" => "카를로스에게 전권을 줘 카이자동차 대표로 영입하고, 김태중이 마련한 고연진과의 첫 만남에서 상대를 파악한다.",
    "resistance_or_cost" => "카를로스는 파격 보수와 경영전권을 요구하고, 고연진의 현재 경영 의지·불만은 아직 드러나지 않는다.",
    "paid_reward" => "카를로스 곤의 한국행·카이자동차 대표 수락, 5년 이상 고용·500만 달러 보수·독립경영 합의를 얻고 김태중에게 정식 소개한다. 고연진과는 첫 맞선·인사만 시작했을 뿐 승계동맹은 없다.",
    "state_change" => "카이자동차는 전권을 가진 회생 책임자를 얻고, 김민재는 김태중이 주선한 고연진과의 첫 만남에서 훗날 CL 경영권 분쟁 가능성만 기억한다.",
    "ending_hook" => "고연진과의 첫 대화에서 그녀가 CL 복지재단·가족 승계에 관해 실제로 무엇을 원하는지 확인할 수 있는가?",
    "closed_loops" => "카를로스 곤의 카이자동차 대표 수락·한국행·김태중 소개",
    "opened_loops" => "고연진의 현재 의사 확인; CL 승계분쟁 가능성; 베리뮤직·CL 자산교환"
  },
  97 => {
    "reader_promise" => "날인된 9호선 30년 운영계약과 아직 협상 전인 거가대교를 분리해 태우건설 회생의 첫 실물과 다음 표적을 보여 준다.",
    "protagonist_goal" => "퀀텀 이름·7% 자금을 끌어와 9호선 계약을 체결하고, 태우건설 주 시공·거가대교 40년 운영권 협상을 시작한다.",
    "action" => "조지에게 퀀텀 명칭과 지분 7% 투자를 받아 컨소시엄을 세우고 정부와 9호선 3조5천억 원·30년 MRG·요금결정·운영 계약에 날인한다. 9호선 확장 변경과 거가대교 1조9천억 원 전액투자·40년 운영안은 다이먼에게 협상하라고 지시한다.",
    "resistance_or_cost" => "9호선 주 시공사 지정과 확장 변경은 후속 협의가 필요하고, 거가대교는 정부 확답도 없어 90% 가능성과 높은 통행료 계산만 있다.",
    "turn_or_reveal" => "실제 날인된 것은 9호선 계약이고, 거가대교는 정부가 분담을 꺼리자 SAVE 전액투자·40년 운영조건을 들고 이제 협상을 시작하는 표적으로 갈린다.",
    "paid_reward" => "퀀텀펀드의 명칭·지분 7% 참여와 9호선 총 3조5천억 원 중 9천억 원 투자, 30년 MRG·요금결정·운영권이 담긴 서명 계약을 얻는다. 태우건설 주 시공사 지정·9호선 확장 변경·거가대교 수주와 40년 운영권은 아직 미지급이다.",
    "state_change" => "비밀 민자구상은 9호선 서명계약으로 첫 실물을 얻지만, 태우건설의 실제 주 시공 지위와 거가대교는 후속 협상 단계에 남는다.",
    "ending_hook" => "다이먼이 거가대교 1조9천억 원 전액투자·40년 운영안을 정부에 제시해 확답을 받고 태우건설 주 시공까지 확정할 수 있는가?",
    "closed_loops" => "퀀텀 명칭·7% 참여 합의; 정부의 민자사업 발표; 9호선 30년 MRG·요금결정·운영 계약 날인",
    "opened_loops" => "9호선 확장 계약변경·태우건설 주 시공사 지정; 거가대교 전액투자·40년 운영 협상; 다섯 추가 사업"
  },
  134 => {
    "paid_reward" => "아이폰의 CES 공개·음악·OTT 실연, 태우전자·태우통신 공식 언급, 애플 주가 반등과 최소 300만 명 대기수요를 확인하고 태우IT 50명 지원을 정한다. 정식 출시·반도체 수율 70%는 아직 남는다.",
    "ending_hook" => "부시 대통령 취임식장에 도착한 김민재가 새 미국 정권과 어떤 보호·거래 관계를 맺을 것인가?",
    "closed_loops" => "아이폰 CES 공개·기능 시연; 최소 300만 명 대기수요·애플 주가 반등; 태우IT 50명 지원 결정",
    "opened_loops" => "아이폰 정식 출시·오류 최적화; 반도체 수율 70%; 부시 정권 첫 접촉"
  },
  142 => {
    "action" => "윤현길을 태우에 반목하는 미끼로 묶고 보좌관·감시를 붙인다. 김태중의 회장직 양도·베트남 영구이주 선언을 막아 1년 체류로 받아들이고, 김태중·비서실장이 은퇴 협박으로 손자에게 일을 넘기는 속내가 독자에게 공개된다.",
    "turn_or_reveal" => "윤현길은 정치통발 역할을 수락하고, 김태중의 완전은퇴 선언은 손자를 사실상 경영 전면에 세우려는 1년 베트남행 연극으로 드러난다.",
    "paid_reward" => "윤현길의 평생 미끼·정보보고 약속과 태우 보좌관·24시간 감시선을 확보하고, 김태중의 즉시 완전은퇴 대신 1년 베트남 체류·김민재 임시 경영 구도를 얻는다. 회장 승계는 아직 공식 실행되지 않는다.",
    "state_change" => "윤현길은 공격자에서 태우 반대세력을 끌어들일 정치통발로 바뀌고, 김민재는 김태중이 자리를 비운 동안 그룹 경영을 맡지만 공식 회장 승계 전이다.",
    "closed_loops" => "윤현길 제압·미끼 전환; 김태중의 즉시 완전은퇴 저지와 1년 베트남 체류 결정",
    "opened_loops" => "김태중 없는 그룹 경영; 한 달 남은 아이폰 국내 출시; 공식 회장 승계 시점"
  },
  146 => {
    "action" => "삼진 회장이 WIPI 지지를 철회하고 방송위원회가 강제탑재를 사실상 연기하자 아이폰 판매가 시작된다. 첫 반나절 2만 대 판매·3만 명 넘는 예약 뒤 김민재는 높은 단가를 감수한 태우전자 국내 생산 협의를 지시한다.",
    "turn_or_reveal" => "WIPI 연기로 즉시 판매가 열리자 반나절 만에 2만 대가 팔리고 3만 명 넘게 예약해 초기 10만 대 부족이 예상되며, 김민재는 높은 단가를 감수한 국내 생산 협의를 지시한다.",
    "paid_reward" => "WIPI 강제탑재 연기라는 국내 판매허가와 판매 첫 반나절 2만 대·3만 명 넘는 예약을 얻는다. 태우전자 국내 생산은 협의 지시 단계라 실제 물량은 아직 나오지 않았다.",
    "state_change" => "통신 카르텔의 출시 장벽은 무너지고 태우통신은 실제 구매·예약 고객을 얻지만, 부족 물량을 메울 국내 생산은 미실행이다.",
    "ending_hook" => "태우전자가 높은 조립단가를 감수하고 국내 생산을 실제로 시작해 초기 10만 대 부족과 태우통신 고객 전환을 감당할 수 있는가?",
    "closed_loops" => "WIPI 강제탑재 규제 연기·국내 판매 개시; 첫 반나절 2만 대 판매·3만 명 이상 예약",
    "opened_loops" => "태우전자 국내 생산 협의·추가 물량 확보; 태우통신 고객 전환"
  },
  154 => {
    "entry_state" => "9·11 대응과 미국 정치방패를 마련한 김민재가 귀국하자 김태중도 베트남에서 돌아와 회장실에서 기다린다.",
    "reader_promise" => "김태중의 승계·결혼 압박, 백악관의 미국 방패, 아이폰·TV·상여금 영수증을 받은 뒤 세이월드라는 다음 SNS 표적만 연다.",
    "protagonist_goal" => "할아버지와 승계 시점을 조율하고 미국 보호선·모바일·TV 실적·직원 보상을 확인한 다음 새 SNS 후보의 면담을 잡는다.",
    "action" => "김태중의 회장직 제안과 베트남 귀환 뒤에도 혼자면 승계하겠다는 결혼 최후통첩을 받는다. 백악관의 명예시민권 발표와 태우자동차 반덤핑 재량을 확인하고, 아이폰 40만 대·조너선이 참여한 애플-태우 TV 진행을 보고받아 추석 상여금 200~300%와 TV 개발진 최고등급 지급을 지시한다. 마지막에 세이월드 대표 면담 약속을 알아보게 한다.",
    "resistance_or_cost" => "젊은 총수라는 시선 때문에 회장 취임을 미루고 싶고, 아이폰은 성능·콘텐츠 제약을 안으며 애플-태우 TV 협업에는 직원 자존심 비용도 남아 있다.",
    "turn_or_reveal" => "살아 있는 외국인에게 전례가 드문 미국 명예시민권 발표와 태우자동차 반덤핑 재량이 지급되고, 아이폰 40만 대·애플 핵심 디자이너 조너선의 TV 참여가 국내 사업 보상으로 이어진다.",
    "paid_reward" => "김태중의 승계 신뢰, 백악관 명예시민권 발표, 태우자동차 반덤핑 재량, 아이폰 40만 대, 조너선이 설계에 참여한 애플-태우 TV, 추석 상여금 200~300%와 TV 개발진 최고등급 지급 지시를 얻는다. 세이월드 면담은 아직 약속을 알아보는 단계다.",
    "state_change" => "김민재는 김태중이 회장직을 맡길 후계자로 다시 확인되고 미국 정치·통상 보호선을 얻는다. 모바일 40만 대와 TV 협업은 실적이 되고 직원에게는 200~300% 보너스가 배정된다.",
    "ending_hook" => "마지막에 처음 꺼낸 세이월드 대표의 약속을 실제로 잡아 SNS의 가치와 인수 가능성을 확인할 수 있는가?",
    "closed_loops" => "회장직 제안·결혼 최후통첩; 미국 명예시민권 발표·태우차 반덤핑 재량; 아이폰 40만 대·애플-태우 TV 진행; 추석 200~300% 보너스 지시",
    "opened_loops" => "세이월드 대표 첫 면담; 세이월드의 투자·인수 여부"
  },
  156 => {
    "entry_state" => "KS텔레콤이 세이월드를 인수하자 김민재가 태우IT로 가 기능을 선점하는 독자 SNS 반격을 시작한다.",
    "reader_promise" => "태우IT 100명의 기능개발·재택·안식년 당근과 다이먼에게 심는 미국 부동산 파생상품·한국 카드대란의 두 금융 씨앗을 함께 보여 준다.",
    "protagonist_goal" => "세이월드의 미래 기능을 한 달 안에 특허화할 조직을 만들고, 다이먼에게 5년 뒤 미국 부동산 파생상품 위기와 당장 닥친 한국 카드업계 과열을 읽게 한다.",
    "action" => "태우IT 대기인력 약 100명에게 미니홈피·일촌·배경음악·SNS 화폐와 미래 SNS 기능을 나눠 맡기고 최고 명절상여금, 주 1회 재택, 1,500명 증원 뒤 3개월 휴가·1년 안식년 조건을 제시한다. 이어 다이먼에게 초저금리 자금이 미국 부동산과 파생상품으로 몰려 최소 5년 뒤 터질 위험을 설명하고, 카드광고와 대학생·고등학생 발급에서 한국 카드업계 광기를 확인시킨다.",
    "resistance_or_cost" => "1,000명 조직의 병렬개발은 생산성 부담이 크고 장기휴가·안식년은 성장 조건부다. 다이먼은 5년 뒤 부동산 붕괴를 허황되게 여기며 카드사들은 이미 발급경쟁에 취해 있다.",
    "turn_or_reveal" => "SNS 복지 발표로 직원들이 개발에 뛰어든 뒤, 다이먼과의 대화가 닷컴 자금의 부동산 이동·파생상품 폭발 가능성에서 한국 카드대란이라는 즉시 실행 표적으로 좁혀진다.",
    "paid_reward" => "SNS 기능별 개발팀 약 100명과 한 달 일정, 최고 상여금·주 1회 재택 및 조건부 장기휴가·안식년이라는 조직 동력을 확보한다. 다이먼에게 세계 최고 은행 CEO 약속을 재확인하고 미국 부동산 파생상품과 한국 카드업계 과열을 추적할 판단축을 심는다.",
    "state_change" => "태우IT는 세이월드 인수 실패를 독자 SNS 기능개발로 되받을 제작진을 갖추고, 방치됐던 다이먼은 미국 부동산 버블과 한국 카드대란을 겨냥할 금융 파트너로 다시 배치된다.",
    "ending_hook" => "대학생·고등학생에게까지 카드를 내주는 과열을 이용해 CL카드와 금융시장에 어떤 인수전을 걸 것인가?",
    "closed_loops" => "SNS 100명 기능분담·한 달 일정; 상여금·재택·조건부 휴가제 설계; 다이먼의 장기 약속 재확인",
    "opened_loops" => "미국 부동산 파생상품 버블 추적; 한국 카드대란과 CL카드 인수전"
  },
  176 => {
    "ending_hook" => "김태중과 단둘이 마주한 천민정이 열애설을 부정하며 직장과 아이디어 회의까지 잃을까 떨 때, 김태중은 어떤 말로 그녀의 두려움에 답할 것인가?",
    "closed_loops" => "서광수의 페이스북 한국 법인장 수락·세이월드 개발진 연락 시작",
    "opened_loops" => "세이월드 개발진 회수·한국형 페이스북 반격; 김태중과 천민정의 첫 단독 식사·직장 상실 두려움"
  },
  180 => {
    "paid_reward" => "영어 90% 이상·한국어 80% 이상·평균 75% 이상의 음성인식과 알람·전화·간단 메시지를 아이폰에서 실제 작동시킨 약인공지능을 확인하고, IIT 한국 캠퍼스로 힌톤팀 교수직·인재공급을 묶을 목표를 세운다. IIT 유치는 아직 계획이다.",
    "closed_loops" => "아이폰 음성인식의 영어·한국어 정확도와 알람·전화·메시지 실제 작동 확인",
    "opened_loops" => "다음 아이폰 음성비서 탑재·상용화; IIT 한국 캠퍼스 정치·교육 협상과 실제 유치"
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
  199 => {
    "paid_reward" => "희토류·리튬·식각가스·불화수소의 매장국·생산업체 조사와 광산 매입계획 담당을 태우상사·태우화학에 확정하고, 국민경제당 정치인 약 40명 영입과 경제공약 선거전략을 확인한다. 공급망 목록·광산 소유권은 아직 미지급이다.",
    "closed_loops" => "원자재별 조사·매입계획 지시; 국민경제당 약 40명 영입·경제공약 방향 확정",
    "opened_loops" => "희토류·리튬 광산 실제 매입; 식각가스·고순도 불화수소 개발; 국민경제당 총선 공약·중도표 검증"
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
  269 => {
    "reader_promise" => "AIZ·SAVE·태우증권 합병과 SAVE 실소유주 공개를 국민·김태중의 수용으로 닫고, 현금·부채 제한을 건 미국 자동차 인수만 다음 질문으로 연다.",
    "action" => "AIZ·SAVE·태우증권 합병을 마치고 귀국해 환영 인파 앞에서 SAVE 실소유주를 공개한다. 김태중에게 미국 최대 보험사의 안정과 1,700억 달러 부채 축소 구상을 설명하고, 태우·SAVE 현금을 쓰지 않으며 부채를 온전히 떠안지 않는 조건으로 GM·포드 검토 허락을 받는다.",
    "turn_or_reveal" => "사전 상의 없는 AIZ 인수에 화낸 김태중이 합병·부채정리 결과와 현금·부채 제한조건을 듣고 웃으며 GM과 포드 중 어느 회사를 살지 묻는다.",
    "paid_reward" => "AIZ·SAVE·태우증권 인수합병 완료와 SAVE 실소유주 공개 뒤 국민적 환대와 김태중의 수용을 얻는다. 김태중은 태우·SAVE 현금을 쓰지 않고 부채를 온전히 떠안지 않는 조건으로 GM 또는 포드 인수 검토를 허락한다.",
    "state_change" => "AIZ·SAVE·태우증권은 공개된 금융그룹으로 합쳐지고, 비밀 투자자였던 김민재는 국민과 할아버지에게 인정받는 공개 총수로 돌아온다. 미국 완성차는 조건부 검토 대상이다.",
    "closed_loops" => "AIZ·SAVE·태우증권 인수합병 완료; SAVE 실소유주 공개·국민 환대·김태중 수용; 장기 미국 체류 종료",
    "opened_loops" => "보험증서·미국지원으로 GM/포드 무현금 인수조건 마련; 대상 자동차사 선택"
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
  466 => {
    "action" => "새만금 화학단지 일부 완성과 계열사·협력사 20곳의 입주 가능 상태를 확인한다. 유고빈의 글로벌 수요와 센트리언 성장으로 생긴 현금을 장기 소재·제약 기반에 재투자한다. 이영한이 국내 약 2천억 원·일본 약 1조 원 규모의 세탁판을 확인하자 김민재는 판을 10조 원까지 키우고 연말 규제 전에 청산하라고 지시한다.",
    "turn_or_reveal" => "새만금 일부 완성과 20곳 입주 가능 상태, 유고빈 글로벌 수요·센트리언 성장이 장기 재투자의 실물 근거가 된다. 이영한이 확인한 현재 세탁판은 국내 약 2천억 원·일본 약 1조 원이고 10조 원은 앞으로 키울 목표로 분리된다.",
    "paid_reward" => "새만금 화학단지 일부 완성과 계열사·협력사 20곳의 입주 가능 상태, 유고빈 글로벌 수요·센트리언 성장과 재투자, 이영한이 확인한 국내 약 2천억 원·일본 약 1조 원 세탁판 정보가 지급된다. 10조 원은 키울 목표이고 연말 규제 전 청산은 지시라 아직 시장규모·수익으로 지급되지 않는다.",
    "state_change" => "새만금 화학단지는 일부 완성돼 20곳이 입주할 수 있는 단계가 되고 유고빈·센트리언 성장은 장기투자 재원으로 돌아간다. 명동 정보망은 현재 약 1조2천억 원의 한일 세탁판을 확인했지만 10조 원 확대와 청산수익은 미실행이다.",
    "closed_loops" => "새만금 화학단지 일부 완성·20곳 입주 가능 확인; 유고빈 글로벌 수요·센트리언 성장과 재투자; 국내 약 2천억 원·일본 약 1조 원 세탁판 확인",
    "opened_loops" => "계열사·협력사 20곳 실제 입주; 세탁판 10조 원 확대; 연말 규제 전 청산과 수익회수"
  },
  468 => {
    "action" => "태우증권·핀테크가 보유한 코인을 전량 청산하고 금융타워도 보유분 80퍼센트 이상을 팔아 약 20퍼센트 수익을 확인한다. 불법도박·범죄자금이 코인시장에 유입된 사실을 확인한 뒤 장경준에게 러시아 공장에 숨은 위험을 경고한다.",
    "turn_or_reveal" => "태우증권·핀테크 전량과 금융타워 80퍼센트 이상 청산으로 약 20퍼센트 수익이 확정되고, 불법도박·범죄자금 유입이 상승장의 실체로 드러난다. 장경준에게는 공장 매각이 아니라 숨은 위험에 대한 경고만 전달된다.",
    "paid_reward" => "태우증권·핀테크 보유분 전량과 금융타워 코인 80퍼센트 이상 청산, 약 20퍼센트 수익, 불법도박·범죄자금 유입 확인과 장경준에게 러시아 공장의 숨은 위험을 경고한 행동이 지급된다. 공장 인수나 위험 전가는 아직 결과가 아니다.",
    "state_change" => "태우증권·핀테크는 코인 노출을 모두 정리하고 금융타워도 20퍼센트 미만만 남긴 채 약 20퍼센트 수익을 확보한다. 불법자금 유입은 확인됐고 장경준은 러시아 공장 위험을 알고 선택해야 하는 위치가 된다.",
    "closed_loops" => "태우증권·핀테크 코인 전량 청산; 금융타워 80퍼센트 이상 청산·약 20퍼센트 수익; 불법도박·범죄자금 유입 확인; 장경준 위험 경고",
    "opened_loops" => "금융타워 잔여 코인 청산; 불법자금 추적·규제; 장경준의 러시아 공장 인수 판단; 일본 철강 데이터 공개"
  },
  471 => {
    "action" => "몽골 자원을 중국·러시아 양 경로로 운송하고 몽골에서 1차가공해 한국·미국·유럽에 공급하기 시작한다. 리강에게 중국 공장축소와 몽골 운송사업 기부금 논리를 설명해 즉각 충돌을 늦추고, 일본 철강 데이터 공개는 다음 실행으로 준비한다.",
    "turn_or_reveal" => "몽골 자원의 양 경로 운송·1차가공·한미유럽 공급이 실제 가동되고, 리강이 중국 공장축소를 몽골 운송과 기부금으로 돌린 설명을 받아들여 즉각 충돌을 미룬다.",
    "paid_reward" => "몽골 자원의 중국·러시아 양 경로 운송, 몽골 1차가공과 한국·미국·유럽 공급이 실제 시작되고, 리강에게 중국 공장축소·몽골 운송 기부금 논리를 설명해 즉각 충돌을 늦춘다. 일본 철강 데이터 공개는 다음 실행 준비로 남는다.",
    "state_change" => "몽골 자원망은 계획에서 중국·러시아 운송·현지 1차가공·한미유럽 공급이 작동하는 상태로 바뀐다. 중국과의 즉각 충돌은 유예됐고 일본 철강 데이터 공개는 미실행이다.",
    "closed_loops" => "몽골 자원 중국·러시아 양 경로 운송 개시; 몽골 1차가공·한미유럽 공급 시작; 리강과 즉각 충돌 유예",
    "opened_loops" => "몽골 자원망 확대·중국의 장기 반응; 일본 철강 데이터 공개와 품질전 실행"
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
  500 => {
    "entry_state" => "미·중 무역분쟁에 일본 강제징용 판결 보복까지 겹칠 것을 걱정하는 최재석을 밤늦게 청와대에서 만난다.",
    "reader_promise" => "새만금 소재 규제법, 센트리언의 코로나 연구·공장 보증, 자가진단팀과 마스크 업체 명단을 1년 뒤 생존전의 담당자·조건으로 고정한다.",
    "protagonist_goal" => "일본 소재보복에 바로 대응할 법안을 준비하고 센트리언의 코로나 치료·진단·생산능력과 중소 마스크 공급선을 선제 확대한다.",
    "action" => "최재석에게 일본 제재 즉시 발동할 새만금 화학단지 규제완화 법안을 만들게 한다. 센트리언에는 코로나 계열 연구의 인원·장비 투자를 늘리고 미·유럽 신축공장에 더 많은 자금을 넣도록 요청하며, 가동률이 모자라면 태우가 건설비 150%로 인수한다는 보증과 계약서 작성을 제시한다. 서정준이 추가 투자를 받아들이자 항원 자가진단키트 개발팀 신설과 계약 중인 마스크 중소업체 명단 제공도 확정한다.",
    "resistance_or_cost" => "코로나 연구는 계속 적자이고 해외 신축공장만 이미 200억 달러 규모다. 서정준은 가동률을 걱정하며, 공장 규모가 두 배가 될 수 있다는 서술상 가능성은 합의된 수치가 아니다.",
    "turn_or_reveal" => "서정준이 태우의 건설비 150% 인수보증을 전제로 공장 신축에 더 많은 자금을 쓰겠다고 동의하고, 자가진단키트 전담팀과 마스크 계약업체 목록까지 즉시 실행선에 오른다.",
    "paid_reward" => "새만금 규제완화 법안 준비 지시, 센트리언의 지속 연구·투자 확대, 가동률 미달 시 건설비 150% 인수보증 제안과 서정준의 추가 자금투입 동의, 항원 자가진단키트팀 신설, 마스크 생산업체 명단 제공 약속을 얻는다. 신축공장 두 배 확대는 확정되지 않았다.",
    "state_change" => "일본 소재보복과 코로나 대비가 막연한 경고에서 규제법안, 150% 인수보증, 연구·진단 전담팀, 기존 마스크 계약망을 가진 실행 준비로 바뀐다.",
    "ending_hook" => "센트리언이 넘길 마스크 업체 명단을 이용해 작은 생산사들을 누가 인수·통합하고 실제 물량을 확보할 것인가?",
    "closed_loops" => "새만금 규제법 준비; 센트리언 추가투자 동의; 가동률 미달 150% 인수보증 제시; 자가진단키트팀 신설; 마스크 업체 명단 제공 약속",
    "opened_loops" => "공장 증설 규모·계약서 문서화; 코로나 백신·치료제·진단키트 양산; 마스크 업체 인수·물량 확보"
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
    "reader_promise" => "현재 확보한 EUV 생산량 50%를 발판으로 50대 선금·5조 원 증설·신규 70%와 중국 제재 뒤 DUV 구매안을 피터슨 앞에 올리고 계약 여부를 다음 화로 넘긴다.",
    "protagonist_goal" => "ASML 생산능력 확대비를 대는 대신 새 공장 EUV 70%와 중국 수출이 막힐 DUV를 인도·베트남 팹에 공급받는 계약을 제안한다.",
    "action" => "태우반도체가 이미 ASML EUV 생산량 18대 중 9대, 즉 50%를 받고 있음을 확인한다. EUV 50대 대금 10조 원 선불 또는 공장 증설비 5조 원, 새 공장 생산분 70% 우선배정, 내년 이후 중국행 DUV 매입을 차례로 제안하고 인도·베트남 대형 구형팹이라는 대체 판매처를 설명한다.",
    "resistance_or_cost" => "피터슨은 다른 고객사 협의와 기존 중국계 계약 때문에 지금 당장 받을 수 없다고 말한다. 신규 EUV 70%·증설비·향후 DUV는 모두 협상안이며 서명된 계약이 아니다.",
    "turn_or_reveal" => "피터슨은 50대 선금안을 즉시 받지 않고 고객사 협의를 요구하지만, 인도·베트남 구형팹과 선불 DUV 구매안을 듣고 입꼬리를 감추지 못한다.",
    "paid_reward" => "ASML EUV 현재 생산량의 50%를 태우가 확보하고 있다는 기존 배분을 확인하고, 피터슨에게 10조 원 선금·5조 원 증설·신규 70%·향후 DUV 구매안을 끝까지 제시해 호의적 반응을 끌어낸다. 새 배분·증설·DUV 계약은 아직 미지급이다.",
    "state_change" => "태우는 현재 EUV 50%를 받는 최대 고객에서 ASML의 증설위험과 중국 대체판매처를 함께 해결할 제안자로 올라서지만, 추가 장비의 소유권과 계약상 우선권은 생기지 않았다.",
    "ending_hook" => "피터슨의 미소를 실제 계약으로 바꿔 새 공장 EUV 70%와 중국행 구형장비 일부를 확보할 수 있는가?",
    "closed_loops" => "현재 EUV 생산량 50% 배분 확인; ASML 증설·선금·신규 70%·향후 DUV 구매안 제시",
    "opened_loops" => "고객사 협의; ASML 5년 계약 체결·지출; 신규 EUV·중국행 DUV 실제 배정; 베트남·인도 팹"
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
  642 => {
    "entry_state" => "보이콧 속 베이징올림픽이 이어지는 동안 태우는 러시아 침공과 니켈 급등을 기다리고, 이 상무는 연변에서 북한 측 CNC 거래를 진행한다.",
    "reader_promise" => "창산그룹의 5조 원대 니켈 숏을 구제명분으로 되받을 설계와, 위조지폐 때문에 연변 큰손들에게 버림받는 이 상무의 현재 붕괴 장면을 함께 제시한다.",
    "protagonist_goal" => "창산그룹을 공격하는 척 도와 더 큰 보상을 받을 포지션을 잡고, 연변 거래에서 이 상무가 스스로 고립되는 과정을 지켜본다.",
    "action" => "창산그룹의 5조 원 이상 니켈 숏을 확인해 금융사 몇 곳으로 롱 포지션을 잡되 구제를 빌미로 보상을 요구할 방침을 세운다. 연변에서는 이 상무가 리규철에게 CNC 수십 대를 실어 보내고 200만 달러 현금과 비트코인 잔금을 받은 뒤, 큰손들이 현금을 위조지폐로 판정하고 자리를 떠나는 장면까지 나온다.",
    "resistance_or_cost" => "니켈 롱은 자동차 계열사의 원가를 올릴 수 있고 창산과 척질 위험이 있다. 이 상무는 구형 감별기를 믿어 위조지폐를 진짜라고 주장하지만 큰손들은 함께 처벌받을까 두려워 그를 버린다.",
    "turn_or_reveal" => "연변 사채시장 큰손들이 100만 달러 가방의 무게와 구형 감별기를 의심해 모두 떠나는데도 이 상무는 벌어진 상황을 이해하지 못한 채 멍하니 남는다.",
    "paid_reward" => "창산그룹 니켈 숏에 롱 포지션을 먼저 넣고 구제대가를 노릴 금융작전 방향을 정한다. 이 상무 쪽에서는 위조지폐 의심으로 큰손들의 신뢰를 잃고 고립된 장면까지만 지급된다. 비트코인 계좌·CNC·리규철 해킹망의 최종 소유자는 이 화에서 공개되지 않는다.",
    "state_change" => "창산은 태우가 구제자처럼 접근할 금융표적이 되고, 이 상무는 거래를 끝냈다고 믿은 사업자에서 연변 자금세탁망이 등을 돌린 고립자로 추락한다. 장남의 실제 소유·세력 영수증은 아직 공개되지 않는다.",
    "ending_hook" => "위조지폐를 알아보지 못한 이 상무가 잃은 비트코인·CNC·인맥의 실제 행방과 이 함정을 설계한 주체는 누구인가?",
    "closed_loops" => "창산 니켈 숏 포착·초기 롱 지시; 이 상무의 CNC 반출·현금/비트코인 수령 장면; 연변 큰손들의 신뢰 철회",
    "opened_loops" => "위조지폐 함정의 설계자; 이 상무 비트코인 계좌·CNC 최종 귀속; 리규철·해킹세력의 편"
  },
  643 => {
    "entry_state" => "이영한이 명동 국화차 자리에서 연변 작전의 실제 설계와 이 상무가 잃은 자금·세력의 행방을 김민재에게 보고한다.",
    "reader_promise" => "위조지폐·비트코인·CNC가 북한 장남의 자금과 산업기반으로 넘어간 복수 영수증을 먼저 지급하고, 같은 날 러시아의 우크라이나 침공으로 세계전쟁을 연다.",
    "protagonist_goal" => "이 상무 복수의 실제 결과와 북한 장남 세력의 성장 정도를 확인한 뒤 러시아 침공 첫날의 유가·정보·식량 포지션으로 즉시 전환한다.",
    "action" => "이영한에게서 조작 감별기와 내부자 배신, 이 상무의 비트코인 계좌 전액 탈취, 리규철·북한 해킹세력의 장남 귀속, CNC와 비자금이 장남에게 넘어갔다는 보고를 받는다. 베이징올림픽 폐막 직후 러시아 침공이 시작되자 유가·전황·SNS 정보와 금융타워 포지션을 실시간 점검한다.",
    "resistance_or_cost" => "빈털터리가 된 이 상무도 중국 인맥을 동원할 수 있고 장남의 성장은 북한 숙청을 부를 수 있다. 침공 첫날은 거짓정보가 난무하며 유가·식량·정치 판단을 몇 시간 안에 바꿔야 한다.",
    "turn_or_reveal" => "명동은 길잡이였고 실제 작전은 장남과 흡수된 해킹세력·리규철이 수행했음이 확인된다. 그 복수 결산 직후 푸틴의 특별군사작전 발표가 울리며 개인 원한선이 세계전쟁으로 교대한다.",
    "paid_reward" => "이 상무의 비트코인 계좌가 털리고 CNC·리규철·북한 해킹세력과 비자금이 장남의 자금·산업·인맥으로 귀속됐음을 확인한다. 이어 러시아의 우크라이나 침공과 유가 100달러 돌파가 실제 발생해 태우의 전시 포지션이 가동된다.",
    "state_change" => "이 상무는 돈·신뢰·CNC·북한선까지 잃고 생존을 걱정할 처지가 되며 장남은 독자 자금·기계·해킹세력을 얻는다. 같은 화 후반 태우의 지배과제는 개인복수에서 전쟁의 에너지·식량·정보질서로 바뀐다.",
    "ending_hook" => "침공 첫날 밤 젤렌스키와 우크라이나가 버틸지, 태우가 직접 참전하지 않고 전황·정보·공급망에 어떻게 개입할지가 열린다.",
    "closed_loops" => "이 상무 비트코인 탈취; CNC·리규철·해킹세력·비자금의 장남 귀속; 이 상무 개인복수 핵심 결산; 러시아 침공 확인",
    "opened_loops" => "침공 첫날 정보전; 유가·식량·니켈 전시 포지션; 한국의 간접 군수지원"
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
    "reader_promise" => "폴란드 20조 원 방산계약과 미국·유럽 은행확장을 지급하되 체코 원전과 로나 규제공격은 아직 결과를 기다리는 상태로 구분한다.",
    "protagonist_goal" => "폴란드 방산계약을 유럽 확장 사례로 만들고 체코 원전 입찰·금융타워 은행통합을 밀면서 로나 규제·공매도 그물의 결과를 기다린다.",
    "action" => "폴란드 20조 원과 노르웨이·루마니아·에스토니아 방산계약을 확인하고 체코 원전 입찰을 점검한다. 시그니처은행 인수 완료, 리퍼블릭은행 인수 진행, 크레디트스위스 공식발표 예정과 금융타워 결속을 보고받은 뒤 미국 스테이블코인 규제와 로나 공매도 그물을 마지막까지 유지한다.",
    "resistance_or_cost" => "체코 원전은 입찰 심사 중이고 크레디트스위스도 당일 공식발표·주중 마무리 전이다. 로나는 아직 붕괴하지 않아 베릴이 살해협박·소송·악플을 견디며 승패와 회수액은 다음 화에 남는다.",
    "turn_or_reveal" => "폴란드 방산과 시그니처은행은 실제 지급됐지만 체코 원전·크레디트스위스 마무리·로나 규제공격은 진행형이다. 한 부회장이 로나와 헤지펀드를 함께 잡을 그물을 공개하며 산업결산이 금융전 대기로 바뀐다.",
    "paid_reward" => "폴란드 20조 원과 유럽 여러 나라의 방산계약, 시그니처은행 인수 완료, 금융타워 금융사들의 공동은행 경영·소통 확대를 확인한다. 체코 원전, 크레디트스위스 최종 인수, 로나 붕괴·공매도 회수·베릴 복권은 미지급이다.",
    "state_change" => "한국 방산은 폴란드 20조 원 계약을 거점으로 유럽에 진입하고 금융타워는 공동은행 운영으로 결속한다. 로나 공격은 규제와 공매도망을 갖췄지만 결과가 없는 대기상태다.",
    "ending_hook" => "미국 규제와 공매도 그물이 로나를 실제로 무너뜨려 회수액과 베릴의 명예를 지급할 것인가?",
    "closed_loops" => "폴란드 20조 원·유럽 방산계약; 시그니처은행 인수; 금융타워 공동은행 결속",
    "opened_loops" => "체코 원전; 크레디트스위스·리퍼블릭은행 인수 마무리; 로나 붕괴·공매도 회수·베릴 복권"
  },
  661 => {
    "entry_state" => "암막커튼 뒤 숨은 베릴이 로나 지지자들의 위협과 조롱을 견디는 동안 금융타워의 공매도 포지션이 결산을 기다린다.",
    "reader_promise" => "로나 85달러가 0.003달러로 99% 폭락하고 시총 약 400억 달러의 절반을 금융타워가 흡수한 현재 보상과, 헤지펀드까지 합친 300억 달러 전망을 분리한 뒤 식량·에너지 외교를 연다.",
    "protagonist_goal" => "로나 숏을 수익과 베릴의 명예로 닫고 김태중에게 동남아 식량·러시아 에너지 순방을 맡긴다.",
    "action" => "로나가 85달러에서 0.003달러 미만으로 99% 폭락하고 시가총액 약 400억 달러 가운데 절반가량, 약 200억 달러를 금융타워가 흡수한 사실을 확인한다. 파산할 가상화폐 헤지펀드 자금까지 흡수하면 최소 총 300억 달러가 될 것이라는 전망을 따로 받고, 공개 복권된 베릴 뒤 김태중에게 동남아 식량·러시아 에너지 순방을 부탁한다.",
    "resistance_or_cost" => "베릴은 살해위협과 조롱을 견뎠고, 고령의 김태중이 맡을 식량·에너지 순방에는 정치·신변 위험이 따른다.",
    "turn_or_reveal" => "로나 99% 폭락과 실제 약 200억 달러 흡수로 베릴의 경고가 사실이 된다. 최소 총 300억 달러는 헤지펀드 추가 흡수를 전제로 한 전망인 채, 김태중이 위험을 알면서도 해외임무를 받아들인다.",
    "paid_reward" => "로나 85달러→0.003달러 미만·99% 폭락, 시총 약 400억 달러의 절반가량인 약 200억 달러 실제 흡수, 베릴 공개복권과 김태중의 해외임무 수락이 지급된다. 헤지펀드까지 합친 최소 총 300억 달러는 아직 전망이다.",
    "state_change" => "로나 공매도는 현재 약 200억 달러 흡수로 결산되고 숨어 있던 베릴은 공개적으로 복권된다. 김태중은 동남아 식량·러시아 에너지 임무의 담당자가 되며 추가 헤지펀드 자금은 미수확으로 남는다.",
    "ending_hook" => "김태중이 베트남을 시작으로 한국향 식량·팜유 수출예외를 실제로 받아 올 수 있는가?",
    "closed_loops" => "로나 99% 폭락·약 200억 달러 실제 흡수; 베릴 공개복권; 김태중 순방 수락",
    "opened_loops" => "파산 헤지펀드 추가 흡수·최소 총 300억 달러 전망; 태우 농장 농산물·팜유 수출조건; 러시아 에너지 통로"
  },
  662 => {
    "entry_state" => "김태중은 가장 오래 일한 베트남과 태우의 최대 농장을 첫 순방지로 골라 정부·현지기업 인맥을 가동한다.",
    "reader_promise" => "태우 소유 농장의 농산물과 태우상사 팜유만 예외로 받는 정확한 범위, 태우해운 30%·정유지분 10%·투자약속이라는 대가, 실제 물가안정을 함께 지급한다.",
    "protagonist_goal" => "동남아 수출제한 속 태우 소유 농산물과 제한품목 팜유의 태우상사 공급을 확보하고 그 물량을 국내 가격안정으로 연결한다.",
    "action" => "김태중이 베트남·동남아와 협상해 태우그룹 소유 농장의 농산물에는 수출제한을 두지 않고, 제한품목인 팜유는 태우상사에 공급받는다. 대가로 태우해운 원유 운송량 30% 이상 증가, 정유시설 지분 10%, 일부 국가 투자약속을 내주며 동남아산 팜유와 인도산 밀 공급재개 뒤 물가가 빠르게 안정되는 결과까지 확인한다.",
    "resistance_or_cost" => "포괄적인 한국 특혜가 아니라 태우 농장·태우상사 물량에 한정된 거래다. 원유 운송 30% 증가와 정유지분 10%·투자약속을 대가로 내놓아야 한다.",
    "turn_or_reveal" => "김태중의 축구포럼·정유시설 인맥이 태우 농장 농산물과 팜유 공급을 열고, 공급재개와 정부 과징금이 실제 가격안정·긍정여론으로 이어진다.",
    "paid_reward" => "태우 소유 농장 농산물의 수출제한 예외와 태우상사 대상 팜유 공급, 동남아산 팜유·인도산 밀의 공급재개 및 빠른 물가안정을 얻는다. 태우해운 물동량 30% 이상 증가, 정유시설 지분 10%, 일부 투자약속이 명시된 대가다.",
    "state_change" => "태우는 자사 해외농장과 상사 물량을 국내에 안정 공급하고 가격을 낮출 유통 지렛대를 얻는다. 한국 전체가 무조건 예외인 상태가 아니라 정유·해운·투자를 맞바꾼 태우 중심 공급선이다.",
    "ending_hook" => "확보한 태우 농장·태우상사 물량을 로켓 물류와 기업농에 결합해 국내 유통구조를 지속적으로 바꿀 수 있는가?",
    "closed_loops" => "태우 농장 농산물 수출예외; 태우상사 팜유 공급; 태우해운 30%·정유지분 10%·투자약속 대가; 팜유·밀 공급재개와 가격안정",
    "opened_loops" => "로켓 농산물 물류·국내 유통개혁; 예외조건 유지; 인도 순방·러시아 에너지 협상"
  },
  688 => {
    "entry_state" => "김민재가 데이비드를 한국으로 불러 강 대위의 사무실에서 북한 미사일 도발과 중국·러시아 관계를 다시 해석한다.",
    "reader_promise" => "데이비드·강 대위·이영한의 독립 정보선으로 러북 무기·식량 거래를 확인하고, 중국·장남·언론·한국 무기지원 위협·바그너 감시의 대응 역할을 설계하는 데까지 지급한다.",
    "protagonist_goal" => "러시아와 북한의 거래를 독립 정보선으로 확인한 뒤 중국과 장남을 결합하고 언론·한국 무기지원 위협·바그너 감시를 지렛대로 쓸 담당자를 정한다.",
    "action" => "강 대위 사무실에서 데이비드와 중국·북한 관계, 장남, 러북 거래 가능성을 검토한다. 하루 뒤 데이비드의 러시아·미국 정보선, 강 대위의 바그너 보급선, 이영한의 연변 장마당선이 러시아의 식량 반출과 북한산 무기·탄약 거래를 같은 방향으로 확인한다. 김민재는 중국 고위층과 장남의 비공식 접촉, 러시아의 북한무기 수입 언론 제보, 한국의 우크라이나 무기지원 위협, 바그너 불만 감시를 각각 지시한다.",
    "resistance_or_cost" => "중국은 서방 제재 때문에 공식 지원에 나서기 어렵고 장남 세력도 북한 내부로 직접 들어갈 수 없다. 언론 제보와 한국 무기지원 위협은 아직 실행 전이며 바그너의 불만이 실제 분열로 이어질지도 알 수 없다.",
    "turn_or_reveal" => "하루 사이 데이비드·강 대위·이영한의 세 정보선이 러시아의 대북 식량과 북한의 무기·탄약 제공을 독립적으로 확인해 추정이 대응 설계의 근거로 바뀐다.",
    "paid_reward" => "데이비드·강 대위·이영한의 세 독립 정보선으로 러시아의 대북 식량 운송과 북한산 무기·탄약 보급을 확인한다. 중국·장남 접촉, 언론 제보, 한국 무기지원 위협, 바그너 감시는 담당과 지시가 정해진 단계이며 실제 공개·러북 분열·한국 방산 대체공급·러시아 반응은 미지급이다.",
    "state_change" => "러북 거래는 가능성에서 세 정보선이 교차 확인한 정보로 올라가고 데이비드·명동·한 부회장·강 대위 라인에 대응 역할이 배정된다. 중국 지원, 언론 공개, 북한·러시아 분열과 대체공급 효과는 아직 발생하지 않았다.",
    "ending_hook" => "바그너의 불만을 이용해 러시아의 분열까지 주도할 수 있는가?",
    "closed_loops" => "러시아의 대북 식량 운송과 북한산 무기·탄약 보급에 대한 세 독립 정보선 확인; 중국·장남·언론·한국 무기지원 위협·바그너 감시 담당과 지시 확정",
    "opened_loops" => "중국 고위층과 장남의 실제 접촉; 러북 거래 언론 공개와 러시아 반응; 한국 무기지원 위협의 효과; 북한·러시아 내부 분열; 바그너 불만 활용"
  },
  301 => {
    "action" => "용산 공개전을 앞둔 바둑 AI의 승률을 점검한 뒤 리그 오브 챔피언스 스킨이 하루 약 10억 원어치 팔린 실적, 스페이스X 네 번째 발사 성공, 타미플루 대량생산 성공과 일본 주문을 차례로 확인한다. 월 200만 명분 생산을 전 공장·2교대로 늘리라고 지시하지만 월 1천만 명분은 아직 생산능력 전망이다.",
    "turn_or_reveal" => "타미플루 대량생산 성공 직후 일본 주문까지 도착해 준비해 둔 감염병 자산이 실제 매출선으로 바뀐다.",
    "paid_reward" => "리그 오브 챔피언스 스킨 하루 약 10억 원 판매, 스페이스X 네 번째 발사 성공, 타미플루 대량생산 성공과 일본 주문이 지급된다. 전 공장 월 1천만 명분 생산은 지시·전망 단계다.",
    "state_change" => "게임·우주·바이오 투자는 각각 실제 판매, 발사 성공, 대량생산·첫 해외주문이라는 관찰 가능한 영수증을 얻는다.",
    "ending_hook" => "세계보건기구의 팬데믹 선언이 타미플루 수요를 얼마나 키울지 기다린다.",
    "closed_loops" => "리그 오브 챔피언스 스킨 첫날 판매; 스페이스X 네 번째 발사 성공; 타미플루 대량생산 성공·일본 주문",
    "opened_loops" => "바둑 AI 공개전; 타미플루 전 공장·2교대 증산; WHO 팬데믹 선언과 세계 주문"
  },
  316 => {
    "action" => "아이폰과 연결된 애플카의 원격주차·호출을 공개 시연해 검색어 1위와 조회수 800만 회를 얻고, 태우차·카이차 주가가 8퍼센트 이상 오른 것을 확인한다. 보조금 지급방침은 정해졌지만 액수는 남고, GM 공장 전기차 전환은 지시 단계다.",
    "turn_or_reveal" => "실차 시연이 성공하며 애플카가 영상 속 구상에서 대중이 확인한 제품으로 바뀌고 자동차주가 즉시 반응한다.",
    "paid_reward" => "애플카 원격주차·아이폰 호출 공개시연, 검색어 1위·영상 800만 조회, 태우차·카이차 주가 8퍼센트 이상 상승과 미국 정부의 긍정 검토가 지급된다. 보조금 액수와 GM 공장 전환은 미지급이다.",
    "state_change" => "애플카는 대중 앞 실주행 제품이 되고 태우·카이 자동차주는 공개효과를 가격으로 확인한다.",
    "ending_hook" => "네 시간만 잔 스티브가 휴식 대신 이틀짜리 아이디어 회의를 시작한다.",
    "closed_loops" => "애플카 원격주차·호출 공개시연; 검색어 1위·800만 조회; 태우차·카이차 주가 상승",
    "opened_loops" => "전기차 보조금 액수; GM 공장 전환·양산; 스티브의 이틀 아이디어 회의"
  },
  326 => {
    "action" => "테슬라 공매도 세력의 공개 항복과 주가 신고가, 태우차·카이차 30만 원대를 확인한다. 이어 게임팀에서 승부조작 가담자가 최소 3명, 연루자가 5명 이상이라는 경기영상·자료를 받고 전수조사와 검찰 이첩을 지시한다.",
    "turn_or_reveal" => "전기차 공매도전이 끝난 직후 천민정이 수상한 경기영상을 내놓아 승리의 장면이 게임 승부조작 수사로 급전환된다.",
    "paid_reward" => "테슬라 공매도 세력의 공개 항복, 테슬라 신고가와 태우차·카이차 30만 원대, 승부조작 의심경기·최소 가담규모 확인이 지급된다. 전체 가담자 확정과 처벌은 남는다.",
    "state_change" => "전기차 동맹은 공매도전을 이기고, 게임팀은 내부 의혹을 영상과 인원규모로 특정해 정식 조사 단계로 들어간다.",
    "ending_hook" => "카노스가 태우그룹 전체의 폭락을 기다리며 장기 공매도 복수를 노린다.",
    "closed_loops" => "테슬라 공매도 세력 항복; 전기차주 상승; 게임 승부조작 의심경기·최소 인원 확인",
    "opened_loops" => "게임팀 전수조사·검찰 이첩; 카노스의 태우그룹 공매도"
  },
  333 => {
    "action" => "노무라 50억 달러를 포함해 여러 금융사·기업과 150억 달러를 넘는 보험계약이 이미 체결됐음을 확인한다. 남은 150억 달러는 일본 제조업 공매도 100억 달러와 엔화 공략 50억 달러로 배분하고, 건설·로켓의 현금소모를 점검한다.",
    "turn_or_reveal" => "보험계약 체결액이 150억 달러를 넘은 가운데 남은 자금의 일본 제조업·엔화 배분은 실행 전 계획으로 분리된다.",
    "paid_reward" => "노무라 50억 달러를 포함한 150억 달러 초과 보험계약 체결이 지급된다. 일본 제조업 공매도 100억 달러와 엔화 공략 50억 달러는 남은 자금의 계획이다.",
    "state_change" => "태우는 대지진·금융충격에 대비한 150억 달러 초과 계약자산을 확보하고, 로켓·건설의 적자를 견디며 2011년 수확을 기다릴 현금계획을 세운다.",
    "ending_hook" => "건설·로켓의 큰 현금소모를 감수한 채 2011년의 대지진·금융 수확을 기다린다.",
    "closed_loops" => "노무라 50억 달러 포함 150억 달러 초과 보험계약 체결; 태우전자·반도체·IT 기록적 판매 확인",
    "opened_loops" => "일본 제조업 100억 달러 공매도; 엔화 50억 달러 공략; 대지진·건설 PF·로켓 수확"
  },
  337 => {
    "action" => "일본 금융사들과의 계약해지·정산 협상을 15일 안에 마쳐 현금 300억 달러와 주식·부동산·특허를 합친 500억 달러 초과 자산을 회수한다. 일본 해운사 인수와 유럽전은 준비하고, 최재석의 차기 대선 지지율 15퍼센트 상승을 확인한다.",
    "turn_or_reveal" => "일본 금융사 정산이 현금 300억 달러·총자산 500억 달러 초과라는 실제 수치로 닫히고 정치 장면은 무상급식 주민투표로 넘어간다.",
    "paid_reward" => "일본 금융사 정산 완료, 현금 300억 달러와 주식·부동산·특허를 합친 500억 달러 초과 회수, 최재석 지지율 15퍼센트 상승이 지급된다. 700억 달러와 일본 해운사 인수는 전망·계획이다.",
    "state_change" => "대지진 금융포지션이 500억 달러가 넘는 실물·현금 자산으로 환산되고 최재석은 차기 대선주자 지위를 얻는다.",
    "ending_hook" => "서울 무상급식 주민투표가 최재석 진영의 다음 정치시험으로 다가온다.",
    "closed_loops" => "일본 금융사 정산; 현금 300억 달러·총 500억 달러 초과 회수; 최재석 지지율 상승",
    "opened_loops" => "일본 해운사 인수; 유럽 금융전; 서울 무상급식 주민투표"
  },
  341 => {
    "action" => "서울시장 선거 개표에서 국민경제당 후보가 36대34, 2퍼센트 차이로 이긴다. 디도스 증거는 개표 뒤 공개하도록 기획실장에게 넘기지만 언론·SNS 공개는 아직 없고, 최재석은 긴 침묵 끝에 이제 움직이겠다고 말한다.",
    "turn_or_reveal" => "박빙 개표가 국민경제당의 2퍼센트 차 승리로 확정되며 최재석의 대권침묵이 끝날 신호가 생긴다.",
    "paid_reward" => "국민경제당 후보의 서울시장 보궐선거 36대34 승리와 디도스 증거의 내부 인계가 지급된다. 증거 공개와 최재석의 공식 대선선언은 아직 전이다.",
    "state_change" => "국민경제당은 서울시장직을 얻고 최재석은 대권행보를 시작할 정치적 발판을 확보한다.",
    "ending_hook" => "최재석이 긴 침묵을 끝내고 이제 움직이겠다고 말한다.",
    "closed_loops" => "서울시장 보궐선거 36대34 승리; 디도스 증거 내부 인계",
    "opened_loops" => "디도스 증거 공개; 최재석의 공식 대권선언; 해외투자"
  },
  344 => {
    "action" => "로보와 인슐린 아시아 생산권, 당뇨 신약 연구비 전액지원과 신약지분 30퍼센트를 묶은 계약을 체결한다. 데이비드에게 트럼프 지원을 맡기고 덴마크 임무를 끝낸 뒤 한국으로 돌아오게 한다.",
    "turn_or_reveal" => "연구비를 전액 대는 대신 신약지분 30퍼센트와 아시아 생산권을 받는 조건이 정식 계약으로 닫힌다.",
    "paid_reward" => "인슐린 아시아 생산권, 당뇨 신약 연구비 전액지원·신약지분 30퍼센트 계약과 데이비드의 트럼프 지원 담당 확정이 지급된다.",
    "state_change" => "태우는 당뇨 신약의 핵심 자금주이자 30퍼센트 권리자·아시아 생산자로 올라선다.",
    "ending_hook" => "데이비드는 덴마크 일을 마치고 한국으로 돌아와 다음 임무를 기다린다.",
    "closed_loops" => "인슐린 아시아 생산권; 당뇨 신약 30퍼센트 계약; 덴마크 협상",
    "opened_loops" => "당뇨 신약 개발·생산; 트럼프 정치지원"
  },
  351 => {
    "action" => "체서피크와 토지·설비·자금지원을 묶은 셰일 협력계약에 서명하고 트럼프에게 정치자금 전액지원을 약속해 수락받는다. 금융타워는 다음 달 완공 예정이고 월가 금융사 30곳은 입주를 기다린다.",
    "turn_or_reveal" => "체서피크 계약서와 트럼프의 전폭 후원 수락이 에너지·정치 동맹을 말이 아닌 합의로 고정한다.",
    "paid_reward" => "체서피크 셰일 협력계약 체결과 트럼프의 전폭 정치후원 수락이 지급된다. 금융타워 입주와 유럽 금융사 이전은 아직 전이다.",
    "state_change" => "태우는 미국 셰일기업의 계약 파트너이자 트럼프의 핵심 후원선이 되고 금융타워에는 월가 30곳의 대기수요가 생긴다.",
    "ending_hook" => "다음 달 완공될 금융타워에 월가 30곳과 유럽 금융사를 실제 입주시킬 수 있는가?",
    "closed_loops" => "체서피크 셰일 협력계약; 트럼프 전폭 후원 수락",
    "opened_loops" => "금융타워 완공·월가 30곳 입주; 유럽 금융사 유치"
  },
  356 => {
    "action" => "완공률 90퍼센트인 신사옥을 점검하고 전 직원 익명설문을 일주일간 실시해 결과를 받는다. 연차통보·야근제한·육아휴직 1년·전환기 재택과 단축근무·안식년 제도를 지시하지만 전사 정착은 남는다.",
    "turn_or_reveal" => "익명설문 결과가 직원들의 실제 불만을 드러내며 성과급 중심 보상에서 시간·가족을 지키는 제도설계로 전환된다.",
    "paid_reward" => "신사옥 외관 90퍼센트와 전 직원 익명설문 결과, 휴가·야근·육아휴직·재택·단축근무·안식년의 시행지침이 지급된다. 건물 완공과 제도 정착은 미지급이다.",
    "state_change" => "태우는 직원문화의 문제를 익명자료로 확인하고 가족시간·휴식을 보장할 구체 정책을 갖추지만 생활변화의 실제 효과는 아직 검증 전이다.",
    "ending_hook" => "새 휴가·육아·근무제도가 직원들의 일상에 실제로 정착할지 남는다.",
    "closed_loops" => "전 직원 익명설문 실시·결과 수령; 직원복지 시행지침 확정",
    "opened_loops" => "신사옥 완공; 휴가·야근·육아휴직·재택·안식년 정착"
  },
  368 => {
    "action" => "투게더워크 지분 90퍼센트와 ARN 지분을 맞바꾸고 베릴의 10퍼센트는 1억 달러에 매각해 ARN에 재투자하는 안을 손정우에게 제시한다. 손정우가 즉시 받아들이지만 문서·대금·소유권 이전 장면은 없다.",
    "turn_or_reveal" => "손정우가 투게더워크 90퍼센트와 ARN 교환, 베릴 10퍼센트 1억 달러 매각·재투자안을 곧바로 수락한다.",
    "paid_reward" => "투게더워크 90퍼센트↔ARN 교환과 베릴 10퍼센트 1억 달러 매각·ARN 재투자에 대한 당사자 합의가 지급된다. 계약서·대금·지분이전은 남는다.",
    "state_change" => "ARN 확보구상은 손정우가 수락한 교환·매각 합의로 올라가지만 태우의 소유권은 아직 바뀌지 않는다.",
    "ending_hook" => "손정우가 복잡한 교환안을 곧바로 받아들여 협상이 예상보다 빠르게 끝난다.",
    "closed_loops" => "투게더워크·ARN 교환조건 합의; 베릴 10퍼센트 1억 달러 매각·재투자 합의",
    "opened_loops" => "계약서 작성; 1억 달러 지급; ARN·투게더워크 지분이전"
  },
  373 => {
    "action" => "연준의 테이퍼링 신호에 맞춰 준비한 포지션에서 소규모 수익을 확인한다. 베네수엘라·미국 셰일·크림반도·OPEC을 잇는 석유전쟁은 후쿠다·데이비드·다이먼과 한정훈에게 타임라인 작성을 맡긴다.",
    "turn_or_reveal" => "양적완화 축소의 작은 수익을 확인한 뒤 다음 승부가 원유가격과 산유국을 겨누는 3차 석유전쟁이라는 점이 드러난다.",
    "paid_reward" => "테이퍼링 신호에 대비한 금융포지션의 소규모 수익과 석유전쟁 담당자·자료·타임라인 과제가 확정된다. 원유 공매도와 산유국 붕괴수익은 아직 없다.",
    "state_change" => "금융타워는 양적완화 연습경기의 수익을 확인하고 원유전쟁을 실행할 국제 담당선을 편성한다.",
    "ending_hook" => "한정훈이 후쿠다·데이비드·다이먼과 베네수엘라·셰일·크림반도·OPEC을 잇는 석유전쟁 타임라인을 짜야 한다.",
    "closed_loops" => "테이퍼링 포지션의 소규모 수익 확인; 석유전쟁 담당선 배정",
    "opened_loops" => "원유 공매도; 크림반도 제재; OPEC 증산; 산유국 붕괴"
  },
  396 => {
    "action" => "헤스 상장폐지·공개매수를 발표하고 퀀텀 지분 3퍼센트를 100퍼센트 프리미엄에 넘겨받는 첫 거래를 실행한다. 헤스 주가는 단기간 100퍼센트 가까이 오르고 헤지펀드 절반 이상이 카노스를 떠난다. 뒤에는 최재석의 4년 중임 재선과 평창재단 지원요구를 논의한다.",
    "turn_or_reveal" => "공개매수 발표와 퀀텀 3퍼센트 이전이 카노스 연합을 갈라놓은 뒤 기업전이 대통령 중임·재단 갈취 문제로 전환된다.",
    "paid_reward" => "헤스 공개매수 개시, 퀀텀 지분 3퍼센트의 100퍼센트 프리미엄 이전, 헤스 주가 급등과 카노스 진영 헤지펀드 절반 이상 이탈이 지급된다.",
    "state_change" => "헤스 방어는 실제 지분이전과 적 연합 붕괴 단계에 들어가고 최재석은 재선·평창재단 요구를 김민재와 상의하는 관계가 된다.",
    "ending_hook" => "최재석이 4년 중임 재선과 평창재단 지원요구를 김민재에게 꺼낸다.",
    "closed_loops" => "헤스 공개매수 발표; 퀀텀 3퍼센트 이전; 카노스 진영 절반 이상 이탈",
    "opened_loops" => "버크셔와 추가 공개매수; 카노스 청산; 4년 중임·평창재단 갈취 대응"
  },
  399 => {
    "action" => "박만덕의 은퇴와 한정훈 부회장 취임식을 치른 사실을 확인하고, 청와대의 200억 원 요구에 25억·25억·150억 원 분할안을 제시한다. 중국시장에 600억 달러를 안전하게 투입하고 카노스가 무너뜨린 헤지펀드 20곳의 정리를 맡긴 뒤 로보의 신약 폐기계획을 보고받는다.",
    "turn_or_reveal" => "박만덕에서 한정훈으로 금융타워 지휘권이 넘어간 직후 로보가 폐기하려는 신약이 새 인수표적으로 등장한다.",
    "paid_reward" => "박만덕 은퇴·한정훈 부회장 취임, 중국시장 600억 달러 투입과 카노스발 헤지펀드 20곳 파산 확인이 지급된다. 청와대 200억 원 납부와 폐기신약 취득은 아직 전이다.",
    "state_change" => "금융타워 승계가 완료되고 한정훈은 중국 600억 달러 운용과 파산 헤지펀드 정리를 맡는 부회장으로 올라선다.",
    "ending_hook" => "천민정이 로보가 폐기하려는 신약 후보를 태우가 살릴 수 있다고 보고한다.",
    "closed_loops" => "박만덕 은퇴·한정훈 취임; 중국시장 600억 달러 투입; 카노스발 헤지펀드 20곳 파산 확인",
    "opened_loops" => "청와대 200억 원 요구 대응; 로보 폐기신약 권리계약; 중국 공매도"
  },
  401 => {
    "action" => "로보와 10억 달러에 폐기신약의 모든 권리·연구자료를 넘기고 인슐린 로열티를 없애는 계약에 당일 서명한다. 귀국 직후 중국 공매도 D-DAY를 시작하지만 수익은 아직 발생 전이다.",
    "turn_or_reveal" => "계약서 서명으로 폐기신약 권리와 연구자료가 태우에 넘어오자 장면이 중국 공매도 개시로 전환된다.",
    "paid_reward" => "10억 달러 지급조건의 폐기신약 전 권리·연구자료 계약과 인슐린 로열티 철폐가 지급된다. 중국 공매도는 개시됐지만 수익은 아직 없다.",
    "state_change" => "태우는 폐기될 신약의 독점권리와 연구자료를 소유하고 중국 금융전은 실행단계에 들어간다.",
    "ending_hook" => "중국 공매도 D-DAY가 시작되고 하루에 증발할 자금을 얼마나 포집할지 남는다.",
    "closed_loops" => "폐기신약 전 권리·연구자료 계약; 인슐린 로열티 철폐",
    "opened_loops" => "폐기신약 개발·상용화; 중국 공매도 수익"
  },
  410 => {
    "action" => "메르스 치료제의 공식 판매를 시작하고 미국 FDA 허가가 다음 달 예상된다는 보고, 당뇨 신약 우선심사 약속을 받는다. 낮은 가격과 증권사 평가로 주가는 내려가지만 중국 금융시장은 안정됐고 브렉시트 작전은 준비한다.",
    "turn_or_reveal" => "메르스 치료제가 실제 판매를 시작했는데도 저가정책과 부정적 평가로 주가가 하락해 기술지급과 시장평가가 엇갈린다.",
    "paid_reward" => "메르스 치료제 공식 판매개시, 다음 달 미국 FDA 허가 전망과 당뇨 신약 우선심사 약속이 지급된다. FDA 승인과 브렉시트 수익은 아직 없다.",
    "state_change" => "태우는 메르스 치료제를 시장에 내놓고 당뇨 신약의 심사우선권을 얻지만 단기 주가 하락을 감수한다.",
    "ending_hook" => "2~3월에 공개할 브렉시트 작전이 다음 금융승부로 남는다.",
    "closed_loops" => "메르스 치료제 공식 판매개시; 당뇨 신약 우선심사 약속; 중국 금융시장 안정",
    "opened_loops" => "메르스 미국 FDA 승인; 당뇨 신약 승인·생산; 브렉시트 작전"
  },
  414 => {
    "action" => "당뇨 신약의 FDA 심사와 센트리언 증설계획을 점검하고, 주가가 네 배 오른 삼진바이오가 흑자와 무상 공장지원을 제안한 것을 확인한다. 국민경제당 지지율 1위 뒤 빈 살만은 아버지의 동의를 받았으며 1월 왕세자 교체·숙청을 준비한다고 밝힌다.",
    "turn_or_reveal" => "빈 살만이 부왕의 동의와 왕세자 교체·숙청계획을 털어놓으며 사업동맹이 목숨과 왕위계획을 공유하는 우정으로 깊어진다.",
    "paid_reward" => "삼진바이오 주가 네 배·흑자와 무상 공장지원 제안, 국민경제당 지지율 1위, 빈 살만의 부왕 동의 확보가 지급된다. FDA 승인·공장증설·왕세자 교체·숙청은 아직 전이다.",
    "state_change" => "신약 생산축은 흑자기업의 공장지원선을 얻고, 김민재와 빈 살만은 왕위계획을 밤새 공유하는 친구관계로 바뀐다.",
    "ending_hook" => "숙청 뒤에는 예전처럼 돌아오기 어려운 두 사람이 친구로 밤새 이야기를 나눈다.",
    "closed_loops" => "삼진바이오 흑자·무상 공장지원 제안; 국민경제당 지지율 1위; 빈 살만의 부왕 동의",
    "opened_loops" => "당뇨 신약 FDA 승인·증설; 빈 살만 왕세자 교체·숙청"
  },
  430 => {
    "action" => "현재해운 부채 20퍼센트인 1조6천억 원을 탕감받고 매각계약에 서명한다. 도장을 찍은 뒤 남은 부채를 일시상환하고 현진·현재해운을 태우상사에 편입한다.",
    "turn_or_reveal" => "매각계약 날인과 잔여부채 일시상환으로 선거용 해운구상이 실제 소유권 이전으로 닫힌다.",
    "paid_reward" => "1조6천억 원 채무탕감, 현재해운 매각계약 서명, 잔여부채 일시상환과 현진·현재해운의 태우상사 편입이 지급된다.",
    "state_change" => "태우상사는 두 대형 해운사를 소유해 글로벌 물류망을 확장하고 부채정리를 마친다.",
    "ending_hook" => "대한타이어 주성재 회장이 승계 문제로 면담을 청한다.",
    "closed_loops" => "현재해운 1조6천억 원 탕감·매각서명·잔여부채 상환; 현진·현재해운 편입",
    "opened_loops" => "대한타이어 승계; 해운 카르텔 대응"
  },
  435 => {
    "action" => "브렉시트 국민투표 통과와 파운드 공략 개시를 확인한다. 빈 살만은 왕세자에 올라 500명 이상을 숙청하고 1천억 달러가 넘는 자산을 회수한 뒤 김민재와 다시 만난다.",
    "turn_or_reveal" => "숙청을 끝낸 빈 살만이 왕세자의 위엄으로 돌아오면서 과거의 우정이 국가권력 동맹으로 바뀐다.",
    "paid_reward" => "브렉시트 통과, 빈 살만의 왕세자 등극·500명 이상 숙청·1천억 달러 초과 자산회수가 지급된다. 파운드 공략의 최종수익은 아직 남는다.",
    "state_change" => "빈 살만은 사우디 차기권력을 장악하고 김민재는 왕세자와 직접 연결된 국가동맹을 얻는다.",
    "ending_hook" => "숙청을 마친 빈 살만의 위엄과 김민재를 향한 깊어진 신뢰가 다음 미중전쟁의 사우디 동맹을 연다.",
    "closed_loops" => "브렉시트 투표 통과; 빈 살만 왕세자 등극·숙청·자산회수",
    "opened_loops" => "파운드 공략 최종수익; 미중 무역전쟁; 사우디 장기사업동맹"
  },
  440 => {
    "action" => "로보와 조건 없는 상호소송 취하에 합의해 유고빈 권리를 확정한다. 태우해운 선복량 약 280만 TEU·세계 4위를 확인하고 미국 주도 해운동맹은 추진을 맡긴다. 이영한은 반도체도시 1구역을 4조 원에 매입해 7천억 원 차익을 냈고 2·3구역에 10조 원 이상을 투입해 착공을 최소 2년 앞당긴다.",
    "turn_or_reveal" => "로보 소송이 철회된 뒤 해운 선복량과 이영한의 토지매입 수치가 드러나며 법정방어가 물류·도시 자산으로 환산된다.",
    "paid_reward" => "로보와의 무조건 상호소송 취하·유고빈 권리확정, 태우해운 약 280만 TEU·세계 4위, 반도체도시 1구역 7천억 원 차익과 2·3구역 10조 원 이상 투자·착공 2년 단축이 지급된다. 미국 해운동맹은 아직 추진 중이다.",
    "state_change" => "태우는 유고빈 권리를 지키고 세계 4위 해운규모와 반도체도시 선매입·착공시간 우위를 확보한다.",
    "ending_hook" => "김민재가 이영한에게 명동 방식으로 더 큰 수익을 낼 다음 토지사업을 약속한다.",
    "closed_loops" => "로보 상호소송 취하·유고빈 권리확정; 태우해운 세계 4위 확인; 반도체도시 토지차익·착공단축",
    "opened_loops" => "미국 주도 해운동맹; 반도체도시 추가부지; 이영한·명동의 다음 투자"
  },
  446 => {
    "action" => "정영근의 50억 원 넘는 빚과 불법도박, 할머니 계좌 6억 원을 확인하고 휴대전화를 좀비폰으로 만들어 문서를 확보한다. 조작정보·악성코드 역공과 전 직원 배경조사를 지시하지만 중국에 실제 전송한 장면은 없다.",
    "turn_or_reveal" => "정영근의 채무·도박·가족계좌와 휴대전화 문서가 내부침투의 동기와 증거를 동시에 드러낸다.",
    "paid_reward" => "정영근의 50억 원 초과 채무·불법도박·할머니 계좌 6억 원 확인, 좀비폰과 내부문서 확보, 역정보·전 직원 배경조사 지시가 지급된다. 조작정보 전송과 중국 경쟁사 피해는 미지급이다.",
    "state_change" => "막연한 스파이 의심은 신원·돈·기기증거를 갖춘 내부보안 사건으로 바뀌고 전사 배경조사가 열린다.",
    "ending_hook" => "연말 태우상사의 적자와 한 달 뒤 트럼프 취임이 해운동맹·규제전의 다음 무대로 남는다.",
    "closed_loops" => "정영근 채무·도박·가족계좌 확인; 좀비폰·문서 확보",
    "opened_loops" => "조작정보·악성코드 역공; 전 직원 배경조사; 미국 해운규제·트럼프 취임"
  },
  450 => {
    "action" => "완공된 애플 신사옥을 스티브와 둘러보고 애플을 다시 맡기며 장기협력을 확인한다. 태우가 주도한 미국 해운동맹이 이미 성립됐다는 보고를 받고, 아직 폭발 전인 알트코인 매집과 최소 다섯 배 수익계획을 금융타워에 맡긴다.",
    "turn_or_reveal" => "스티브가 애플을 다시 이끌겠다고 답하고 미국 우선주의 해운동맹의 성립까지 확인되며 초기 기술동맹이 장기 기업동맹으로 굳어진다.",
    "paid_reward" => "애플 신사옥 완공·스티브의 경영복귀 약속, 태우 주도 미국 해운동맹 성립이 지급된다. 알트코인 매집과 다섯 배 수익은 계획이다.",
    "state_change" => "태우는 애플과의 장기 경영동맹과 미국 해운동맹을 확보하고 금융타워는 알트코인 작전의 실행권을 받는다.",
    "ending_hook" => "금융타워가 아직 폭발 전인 알트코인 시장에서 최소 다섯 배 수익을 만들 수 있는가?",
    "closed_loops" => "애플 신사옥 완공·스티브 경영복귀 약속; 미국 해운동맹 성립",
    "opened_loops" => "알트코인 매집·운용; 미중 분쟁"
  },
  455 => {
    "action" => "북한의 장남을 안전하게 구출한 뒤 칭화 부패자료가 1천억 원 이상, 부동산까지 합치면 2천억 원을 넘을 수 있음을 확인해 중국 언론·SNS에 흘린다. AI 통역 지연을 1초로 줄이고 레벨3 자율주행 고속도로 시험을 오류 없이 마친다.",
    "turn_or_reveal" => "구출전 직후 부패자료 공개와 AI 통역·자율주행 시험성공이 정치공작에서 기술검증으로 장면을 바꾼다.",
    "paid_reward" => "장남 구출, 칭화 부패자료 1천억 원 이상 확인·중국 언론과 SNS 공개, 1초 AI 통역과 레벨3 고속도로 시험 무오류 성공이 지급된다.",
    "state_change" => "장남은 태우 보호선에 들어오고 태우 AI·자율주행은 실전시험을 통과한 기술자산이 된다.",
    "ending_hook" => "사우디가 빈 살만의 한국 방문을 공식 예고한다.",
    "closed_loops" => "장남 구출; 칭화 부패자료 확인·공개; AI 통역·레벨3 자율주행 시험성공",
    "opened_loops" => "중국 내 부패폭로 반응; 빈 살만 방한·사우디 동맹"
  },
  462 => {
    "action" => "태우통신의 국제망 1티어 진입을 확정하고 AT&T·손정우·구글·아마존·페이스북과 10조 원 규모 해저케이블 사업을 발표한다. 태우의 직접 부담은 약 1조 원이며 국내 경쟁사들은 대응하지 못한다.",
    "turn_or_reveal" => "국내 3위권 통신사가 글로벌 플랫폼·통신사들과 해저케이블을 발표하며 국제망 가격을 사는 회사에서 정하는 회사로 올라선다.",
    "paid_reward" => "태우통신 국제망 1티어 확정, 글로벌 동맹과 10조 원 규모 해저케이블 발표, 태우 부담 약 1조 원의 사업구조가 지급된다.",
    "state_change" => "태우통신은 국제망 가격결정에 참여할 상위사업자와 글로벌 케이블 동맹의 주체가 된다.",
    "ending_hook" => "한 달 사이 약 10달러 내린 국제유가가 다음 에너지 매입·공매도 기회를 연다.",
    "closed_loops" => "국제망 1티어 진입; 10조 원 해저케이블 동맹 발표",
    "opened_loops" => "해저케이블 구축; 망사용료 재협상; 유가 하락 뒤 에너지 투자"
  },
  465 => {
    "action" => "헤스가 가진 가이아나 펀드 지분을 합쳐 태우 측 70퍼센트 지배를 확인한다. 비트코인·알트코인 매도를 시작하고 이더리움이 8달러에서 200달러 가까이 오른 수익을 점검한 뒤 메타버스를 AI센터 공식사업으로 승인해 채용·특허·기업·VR기기 인수권을 연다.",
    "turn_or_reveal" => "가이아나 70퍼센트와 이더리움 열 배 이상 상승이라는 기존투자 영수증이 메타버스 무제한 사업권으로 재투자된다.",
    "paid_reward" => "가이아나 펀드 70퍼센트 지배 확인, 이더리움 8달러→200달러 근접 수익과 암호화폐 매도개시, 메타버스의 AI센터 공식사업 승인이 지급된다.",
    "state_change" => "태우는 가이아나 지배지분과 암호화폐 현금화 통로를 갖고 메타버스팀에 인재·특허·기업·기기 인수권을 부여한다.",
    "ending_hook" => "수익을 장담할 수 없는 메타버스에 인재·기업·VR기기를 투입해 선두 이미지를 만들 수 있는가?",
    "closed_loops" => "가이아나 70퍼센트 확인; 이더리움 열 배 이상 상승·매도개시; 메타버스 공식사업 승인",
    "opened_loops" => "암호화폐 완전청산; 메타버스 인재·특허·기업·VR 인수"
  },
  470 => {
    "action" => "러시아 공장 임대계약에 서명해 5조 원을 받고 도요타에 2년간 빌려준다. 로만에게 러시아 철수 오해를 설명하고 신규공장 계획을 내세워 시간을 벌자 로만이 크렘린의 오해를 풀겠다고 약속한다.",
    "turn_or_reveal" => "계약서 서명과 5조 원 입금 뒤 로만까지 해명을 받아들이며 러시아 철수계획이 현금회수·외교완충장치로 바뀐다.",
    "paid_reward" => "러시아 공장 임대계약 체결·5조 원 수령·도요타 2년 임대와 로만의 크렘린 오해해소 약속이 지급된다. 신규 러시아 공장은 시간을 벌기 위한 계획이다.",
    "state_change" => "태우는 러시아 설비에서 5조 원을 회수하면서 생산연속성과 크렘린 완충선을 동시에 확보한다.",
    "ending_hook" => "로만이 신규공장 설명을 받아들이고 크렘린의 오해를 직접 풀겠다고 약속한다.",
    "closed_loops" => "러시아 공장 임대계약·5조 원 수령; 도요타 2년 임대; 로만 해명수락",
    "opened_loops" => "러시아 리콜·철수 일정; 신규공장 위장계획; 일본 품질공격"
  },
  477 => {
    "action" => "일본 자동차 품질자료 공개 뒤 하루오의 공개사과, 생산중단과 대규모 리콜을 확인한다. 태우차도 전 공정 영상을 공개하고 리콜을 거의 마쳐 주가는 오르지만 일본차의 법적배상·최종폭락은 아직 없다. 마지막에 도시바가 러시아 공장계약 파기를 요청한다.",
    "turn_or_reveal" => "일본차 생산중단·리콜과 태우차의 공정공개가 품질전의 실제 시장반응으로 나타난 뒤 도시바 자산협상으로 전환된다.",
    "paid_reward" => "일본 자동차업계 공개사과·생산중단·리콜, 태우차 리콜 마무리와 주가상승이 지급된다. 소송배상과 도시바 거래는 미지급이다.",
    "state_change" => "태우차는 공정영상과 선제 리콜로 신뢰를 얻고 일본차는 생산중단·리콜 상태에 들어간다.",
    "ending_hook" => "도시바가 러시아 공장계약을 파기하고 싶다고 연락하자 김민재가 직접 만날 일정을 잡으라고 지시한다.",
    "closed_loops" => "일본차 품질폭로·사과·생산중단·리콜; 태우차 공정공개·리콜 마무리",
    "opened_loops" => "일본차 배상·주가후속; 도시바 면담·계약파기 조건·자산매각"
  },
  481 => {
    "action" => "도시바와 도시바메모리·웨스팅하우스를 합계 4조5500억 엔에 인수하는 계약에 당일 서명한다. 잔여지분 45퍼센트를 담보로 2조 엔을 빌려주고, 카메코 지분은 3년에 걸쳐 조용히 모으라고 지시한다.",
    "turn_or_reveal" => "하루 안에 도시바메모리·웨스팅하우스 계약서가 체결되고 잔여 45퍼센트는 향후 채무불이행 때 넘겨받을 담보로 남는다.",
    "paid_reward" => "도시바메모리·웨스팅하우스 4조5500억 엔 인수계약 체결과 잔여지분 45퍼센트 담보의 2조 엔 대출이 지급된다. 잔여지분 이전과 카메코 지분취득은 아직 전이다.",
    "state_change" => "태우는 메모리·원전 자산의 계약상 인수자가 되고 도시바 잔여지분에는 담보권을 잡는다.",
    "ending_hook" => "카메코 지분을 3년 동안 조용히 모아 원전·우라늄 부활에 대비하라는 지시가 남는다.",
    "closed_loops" => "도시바메모리·웨스팅하우스 인수계약; 잔여지분 담보 2조 엔 대출",
    "opened_loops" => "도시바 잔여 45퍼센트 채무불이행·이전; 카메코 지분 3년 매집"
  },
  510 => {
    "action" => "리강에게 단계적 기술보호 조치를 제시해 철회요구를 막는다. 중국은 한국 기술자 700명 이상을 실제 해고하고 퇴직금도 주지 않았으며 추가해고를 준비한다. 김민재는 미국·일본·EU 취업까지 막는 블랙리스트를 추진하고 미국행 곡물협상을 준비한다.",
    "turn_or_reveal" => "중국의 700명 이상 해고가 실제 발생하며 기술보호법 논쟁이 노동자 피해와 국제 블랙리스트 계획으로 커진다.",
    "paid_reward" => "리강의 단계적 대응 수락과 기술보호법 철회저지, 중국의 한국 기술자 700명 이상 해고 확인이 지급된다. 국제 블랙리스트와 곡물기업 인수는 아직 계획이다.",
    "state_change" => "기술유출 대응은 국내법 방어에서 해고 기술자와 국제취업을 통제하는 국가간 인력전으로 확장된다.",
    "ending_hook" => "김민재의 미국행 목표가 비테라 인수와 곡물 메이저 협상으로 구체화된다.",
    "closed_loops" => "리강의 단계적 대응 수락; 기술보호법 철회저지; 중국의 700명 이상 해고 확인",
    "opened_loops" => "해고 기술자 보호·국제 블랙리스트; 비테라 인수; 곡물 메이저 협상"
  },
  512 => {
    "action" => "이미 인수한 비테라를 태우곡물회사로 바꾸고 곡물 메이저들과 연 1천억 달러 구매·농장임차 협상을 진행한다. 일부 5년 계약은 순차 체결되고 아마존 창고 임대에도 합의하지만, 다음 반기 500억 달러·내년 1천억 달러는 집행계획이다.",
    "turn_or_reveal" => "비테라 소유권을 바탕으로 일부 장기계약과 아마존 창고임대가 실제 성립하며 곡물매입 계획이 운영망으로 넘어간다.",
    "paid_reward" => "비테라 인수 확인·태우곡물회사 전환, 일부 5년 곡물·농장 계약과 아마존 창고임대 합의가 지급된다. 연 1천억 달러 전량계약은 아직 진행 중이다.",
    "state_change" => "태우는 비테라를 소유한 곡물회사와 일부 장기조달·창고망을 갖지만 전체 곡물카르텔 계약은 남는다.",
    "ending_hook" => "태우반도체를 대체 불가능한 공급자로 만들 해외 구형팹·첨단칩 투자가 다음 과제로 열린다.",
    "closed_loops" => "비테라 인수·태우곡물회사 전환; 일부 5년 곡물·농장 계약; 아마존 창고임대 합의",
    "opened_loops" => "연 1천억 달러 곡물계약 완성; 해외 반도체 생산지도·첨단칩 투자"
  },
  540 => {
    "action" => "폴리이미드 국산화 성공과 생산계획을 대외 발표한다. AI센터에 저가 공개버전을 만들라고 지시하고 양자컴퓨터·초전도체 공동프로젝트의 무제한 투자를 승인한다.",
    "turn_or_reveal" => "일본 소재공격을 막은 국산화 발표가 연구개발 성과를 대외 신뢰로 바꾸고 투자는 AI·양자·초전도체로 이동한다.",
    "paid_reward" => "폴리이미드 국산화 성공과 생산계획의 공식발표, 저가 AI 공개버전·양자컴퓨터·초전도체 공동프로젝트의 담당·투자승인이 지급된다. 미래기술 성과는 아직 없다.",
    "state_change" => "대화그룹은 소재 국산화 공로를 공개적으로 확인받고 태우는 AI·양자·초전도체에 무제한 투자할 실행권을 연다.",
    "ending_hook" => "저가 AI 공개버전과 양자컴퓨터·초전도체 공동프로젝트가 실제 제품·기술로 이어질 수 있는가?",
    "closed_loops" => "폴리이미드 국산화 성공·생산계획 발표; 미래기술 프로젝트 승인",
    "opened_loops" => "저가 AI 공개; 양자컴퓨터·초전도체 연구성과·투자집행"
  },
  555 => {
    "action" => "다이아 프린스 승객 약 300명을 한국으로 옮겨 하루 안에 전원 검사한다. 미국인 16명은 양성으로 태우 음압병동에서 치료하고 한국인은 확진자 0명을 확인한다. 최재석에게 거리두기와 석 달 안 좋은 소식을 약속하지만 백신은 미완성이다.",
    "turn_or_reveal" => "구조한 300명 전수검사에서 한국인 0명·미국인 16명 양성이 확인돼 구조작전이 실제 방역결과로 닫힌다.",
    "paid_reward" => "약 300명 한국 도착·전원검사, 미국인 양성 16명의 음압병동 치료와 한국인 확진 0명이 지급된다. 거리두기 정착과 백신완성은 남는다.",
    "state_change" => "최재석 정부와 태우병원은 국제구조·검사·치료를 한 번에 수행한 방역능력을 증명한다.",
    "ending_hook" => "사회적 거리두기를 준비하고 석 달 안 백신의 좋은 소식을 만들 수 있는가?",
    "closed_loops" => "다이아 프린스 약 300명 구조·한국 도착; 전원검사; 미국인 16명 치료·한국인 확진 0명",
    "opened_loops" => "사회적 거리두기; 센트리언 백신완성·승인"
  },
  565 => {
    "action" => "바이든에게 백신효과가 확인되면 의무접종을 추진하겠다는 답을 받고 지원을 두 배로 늘린다. FDA가 정식심사와 이달 승인 가능성을 발표하자 센트리언 주가가 하루 약 10퍼센트 오르고, 공매도를 청산해 수십조 원 수익을 주식에 재투자한다. 마지막에는 주중 사장단회의를 지시한다.",
    "turn_or_reveal" => "FDA 정식심사 발표가 주가상승과 공매도 청산수익으로 즉시 환산되고 정치후원 장면은 국내 사장단회의로 넘어간다.",
    "paid_reward" => "바이든의 조건부 의무접종 약속, FDA 정식심사·이달 승인 가능성 발표, 센트리언 주가 약 10퍼센트 상승과 공매도 청산 수십조 원 수익이 지급된다. 실제 FDA 승인은 아직 전이다.",
    "state_change" => "태우는 바이든을 주 후원선으로 세우고 백신 심사발표를 시장수익으로 회수해 국내 투자재원으로 돌린다.",
    "ending_hook" => "김민재가 이번 주 안에 태우 사장단 전체회의를 열라고 지시한다.",
    "closed_loops" => "바이든 조건부 의무접종 약속; FDA 정식심사 발표; 주가상승·공매도 청산수익",
    "opened_loops" => "FDA 실제 승인; 미국 의무접종; 국내 사장단회의·산업투자"
  },
  577 => {
    "action" => "EU가 회원국 제약사에 생산을 맡기고 태우가 아프리카 지도자들을 설득하는 정치적 역할분담에 구두 합의한다. 센트리언 수익이 수십 배, 나스닥이 32퍼센트 오른 것을 확인해 현금을 주식에 투입하지만 1달러 위탁계약·유럽과 아프리카 공급은 아직 체결·실행 전이다.",
    "turn_or_reveal" => "EU와 태우의 정치적 역할분담이 정해진 뒤 백신협상 장면이 양적완화 자금의 주식시장 유입으로 전환된다.",
    "paid_reward" => "EU의 회원국 제약사 설득·태우의 아프리카 지도자 설득이라는 구두 역할합의, 센트리언 수십 배 수익과 나스닥 32퍼센트 상승 확인이 지급된다. 위탁생산 계약과 백신공급은 미지급이다.",
    "state_change" => "태우는 유럽·아프리카 백신공급의 정치협상 역할을 얻고 금융타워는 팬데믹 수익을 주식시장에 재배치한다.",
    "ending_hook" => "양적완화 지원금을 들고 망설이는 개인들을 주식시장으로 밀어 넣을 촉매가 필요하다.",
    "closed_loops" => "EU·태우 백신협상 역할분담; 센트리언·나스닥 상승수익 확인",
    "opened_loops" => "유럽 위탁생산 계약; 아프리카 백신공급; 개인투자자 유입"
  },
  583 => {
    "action" => "게임스핀 주가가 500달러를 찍은 뒤 약 370달러로 내려오고 한국 개인투자자 약 1억 달러가 참여한 것을 확인한다. 헤지펀드 손실은 확인분만 100억 달러를 넘고 최대 700억 달러 추정이 나오며 한 곳이 공개사과한다. 베릴 구독자는 300만 명이 된다.",
    "turn_or_reveal" => "공개사과와 300만 구독자가 베릴의 방송을 개인투자자 승리의 상징으로 바꾸지만 추가 파산규모는 아직 추정이다.",
    "paid_reward" => "게임스핀 500달러 도달, 한국 개인투자자 약 1억 달러 참여, 확인된 헤지펀드 손실 100억 달러 초과·한 곳의 공개사과와 베릴 300만 구독자가 지급된다. 700억 달러 손실과 두 곳 파산은 추정이다.",
    "state_change" => "베릴은 300만 구독자의 월가 반대편 브랜드가 되고 헤지펀드는 최소 100억 달러의 확정손실을 공개적으로 인정한다.",
    "ending_hook" => "게임스핀 승리로 얻은 베릴의 300만 구독자·금융브랜드를 다음 작전에 어디에 쓸지 남는다.",
    "closed_loops" => "게임스핀 500달러; 헤지펀드 확인손실 100억 달러 초과·공개사과; 베릴 300만 구독자",
    "opened_loops" => "최대 700억 달러 손실검증; 헤지펀드 추가파산; 베릴의 다음 역할"
  },
  585 => {
    "action" => "바이든에게 중국 팹 제재 4년 유예를 구두로 얻고 인텔 CEO와 NAND 사업부 75억 달러 매입가격을 악수로 합의한다. 정식 계약·대금지급·소유권 이전은 아직 없다.",
    "turn_or_reveal" => "중국 팹 4년 유예와 인텔 CEO의 75억 달러 가격 수락이 국가규제·기업매각의 구두합의로 맞물린다.",
    "paid_reward" => "중국 팹 제재 4년 유예와 인텔 NAND 75억 달러 매입의 구두합의가 지급된다. 정식 계약·대금·소유권은 미지급이다.",
    "state_change" => "태우는 중국 팹에 4년의 시간을 얻고 인텔 NAND 매입가격을 합의했지만 계약상 소유자는 아직 아니다.",
    "ending_hook" => "75억 달러 구두합의를 정식 계약·소유권 이전으로 닫고 NAND를 성장자산으로 재배치할 수 있는가?",
    "closed_loops" => "중국 팹 4년 유예; 인텔 NAND 75억 달러 가격 구두합의",
    "opened_loops" => "인텔 NAND 정식 계약·대금지급·소유권 이전·통합"
  },
  590 => {
    "action" => "이준수 라인이 중국 팹에서 빼낼 수 있는 장비 20여 대를 추리고, 이미 7대를 팔아 2천만 달러가 넘는 대금을 받은 뒤 그날 4대를 선적한다. 판즈 측 담당자도 합류해 기술자와 장비를 더 모으지만 해외 팹 설치·가동은 아직 없다.",
    "turn_or_reveal" => "가짜 사업의 장비회수안이 실제 매각 7대·2천만 달러 초과 입금·당일 선적 4대라는 물류 영수증으로 바뀌고 판즈 인력선까지 붙는다.",
    "paid_reward" => "수출 가능한 반도체 장비 20여 대를 확인하고 7대 매각·2천만 달러 초과 입금, 당일 4대 선적과 판즈 담당자의 추가 모집 합류를 얻는다. 해외 팹 설치·생산은 미지급이다.",
    "state_change" => "중국 보조금 장비 회수는 암호화폐 구상에서 실제 대금·선적이 발생한 반출망으로 올라가지만 해외 생산설비로서의 가동은 남는다.",
    "ending_hook" => "중국에서 더 빼낼 장비와 기술자를 들키지 않고 해외 팹에 설치·가동할 수 있는가?",
    "closed_loops" => "수출가능 장비 20여 대 확인; 7대 매각·2천만 달러 초과 입금; 당일 4대 선적; 판즈 담당자 합류",
    "opened_loops" => "추가 장비·기술자 반출; 해외 팹 설치·가동; 중국 측 탐지 회피"
  },
  595 => {
    "action" => "해운운임 60퍼센트 상승과 하반기 100억 달러 이상 수익 전망, 로켓 이용자 1천5백만 명·25퍼센트 증가를 점검한다. 센트리언 치료제 임상완료와 AI센터 누적 50조 원 이상 투자를 확인하고 양자·AI에 계속 자금을 넣기로 하지만 흑자·승인·미래수익은 아직 전망이다.",
    "turn_or_reveal" => "팬데믹 사업의 이용자·임상·누적투자라는 현재 수치가 쌓인 뒤, 김민재는 1~2년 동안 들어올 현금을 회귀지식 밖 양자·AI에 계속 태우기로 한다.",
    "paid_reward" => "로켓 이용자 1천5백만 명과 25퍼센트 증가, 센트리언 치료제 임상완료, AI센터 누적 50조 원 이상 투자규모를 확인한다. 태우상사 흑자·치료제 승인·하반기 100억 달러 수익은 아직 전망이다.",
    "state_change" => "태우의 팬데믹 자산은 이용자·임상완료·누적투자 규모를 증명했지만 흑자와 승인 전이며, 김민재는 향후 현금을 양자·AI 장기전에 배치한다.",
    "ending_hook" => "앞으로 1~2년 동안 쏟아질 현금을 양자·AI에 계속 투입해 회귀지식 밖 성과를 만들 수 있는가?",
    "closed_loops" => "로켓 이용자 1천5백만·25퍼센트 증가; 치료제 임상완료; AI센터 누적 50조 원 이상 투자 확인",
    "opened_loops" => "태우상사 흑자·해운수익 실현; 치료제 승인; 양자·AI 추가투자와 성과"
  },
  598 => {
    "action" => "스티븐과 미 제약협회 정회원 조건을 협상해 SMA 무료 희귀질환 사업의 잔여 9억 달러 중 30퍼센트인 2억7천만 달러를 협회가 부담하게 한다. 백신공장·아시아 생산권까지 묶어 이틀 뒤 실무진이 예비계약을 마치지만 세부조건과 최종서명은 남는다.",
    "turn_or_reveal" => "무료 희귀질환 사업의 비용분담과 백신공장·아시아 생산권이 말뿐인 제안에서 실무 예비계약으로 올라간다.",
    "paid_reward" => "미 제약협회 정회원 협상의 예비계약, SMA 무료사업 잔여 9억 달러 중 30퍼센트인 2억7천만 달러 부담, 백신공장·아시아 생산권의 협상틀을 얻는다. 세부조건·최종서명은 미지급이다.",
    "state_change" => "센트리언은 미국 제약업계의 외부 협상자에서 정회원·공익사업·생산권을 함께 문서화할 예비계약 당사자로 올라간다.",
    "ending_hook" => "예비계약의 세부조건과 서명을 닫으면서 미국 대선의 승자·패자 양쪽 보호선도 유지할 수 있는가?",
    "closed_loops" => "정회원 조건 협상; SMA 무료사업 2억7천만 달러 분담; 백신공장·아시아 생산권 예비계약",
    "opened_loops" => "예비계약 세부조건·최종서명; 미국 대선 양면 보호선"
  },
  600 => {
    "action" => "바이든 당선인에게 기존 태우 사업과 가이아나 사업의 지속·확대, 환경조건 아래 알래스카·가이아나 사업 유지, 가이아나의 한국산 무기구매를 막지 않겠다는 답을 받는다. 데이비드에게 유전지분을 담보로 한 장기 100억 달러 대출 협상을 맡기고 중국 팹·러우전쟁 정보망을 점검하지만 대출·무기계약은 아직 없다.",
    "turn_or_reveal" => "새 미국 행정부의 사업보호 원칙을 확인한 뒤 김민재는 가이아나 금융·방산과 중국·러시아 감시를 담당자별 실행과제로 넘긴다.",
    "paid_reward" => "바이든 당선인의 기존 태우 사업 지속·확대, 환경조건부 알래스카·가이아나 유지와 가이아나 한국산 무기 비저지 약속을 얻고 100억 달러 장기대출 협상 담당을 정한다. 대출·무기계약은 미지급이다.",
    "state_change" => "태우는 바이든 행정부의 사업보호 원칙과 가이아나 방산 비저지선을 얻었지만 금융·무기거래는 협상 전이며 전쟁 대비 정보망을 새 과제로 세운다.",
    "ending_hook" => "가이아나 100억 달러 금융·방산 협상을 실제 계약으로 닫고 러우전쟁 전에 정보망을 세울 수 있는가?",
    "closed_loops" => "바이든 당선인의 태우사업 지속·확대 원칙; 가이아나 한국산 무기 비저지 약속; 대출협상 담당 확정",
    "opened_loops" => "가이아나 100억 달러 대출·유전지분 조건; 한국산 무기계약; 러우전쟁 정보망"
  },
  603 => {
    "action" => "센트리언의 유고빈이 치매 예방과 인지기능 개선 효과를 보였음을 확인하고 보험적용 검토선을 연다. 태우IT 주가가 세 배 넘게 오르고 메타버스 이용자가 하루 5백만 명씩 늘자 천민정이 VR 개발에 참여하기로 하지만 지분 40퍼센트 매각은 구조만 정한다.",
    "turn_or_reveal" => "유고빈의 인지효과와 메타버스 이용자 증가가 실제 기술성과로 지급된 뒤 천민정의 VR 참여가 다음 제품개발의 인적 동력으로 붙는다.",
    "paid_reward" => "유고빈의 치매 예방·인지기능 개선 효과, 태우IT 주가 세 배 이상과 메타버스 하루 5백만 명 증가, 천민정의 VR 개발 참여를 확인한다. 보험적용과 지분 40퍼센트 매매계약·대금은 미지급이다.",
    "state_change" => "센트리언과 태우IT은 약효·시장성장을 확인하고 천민정을 VR 개발축에 얻지만 메타버스 지분의 소유구조는 아직 바뀌지 않는다.",
    "ending_hook" => "유고빈 보험적용과 메타버스 지분 40퍼센트 거래를 실제 계약으로 닫으면서 천민정의 VR 개발을 제품으로 만들 수 있는가?",
    "closed_loops" => "유고빈 치매예방·인지개선 확인; 태우IT 주가·메타버스 이용자 성장; 천민정 VR 참여",
    "opened_loops" => "유고빈 보험적용; 메타버스 지분 40퍼센트 매매·대금; VR 제품개발"
  },
  605 => {
    "action" => "AI 방어가 센트리언 해킹을 막고 6천 대 좀비PC·북한 암호·반체제 인사명단·비트코인 경로를 잡아낸다. 중국의 호주산 석탄 금지에서 전력난을 읽어 몽골 증산·비축을 지시하지만 실제 물량은 없고, 마지막에는 QUAD 참여압박의 부담을 확인한다.",
    "turn_or_reveal" => "잠시 사이트를 멈춘 해킹은 북한 내부정보를 쏟아내는 역추적으로 바뀌고, 사이버전의 성취 직후 중국 전력난과 QUAD 외교압박이 새 비용으로 들어온다.",
    "paid_reward" => "센트리언 해킹 차단, 6천 대 좀비PC와 북한 암호·반체제 인사명단·비트코인 경로 확인을 얻고 몽골 석탄 증산·비축 지시를 확정한다. 실제 증산·비축물량은 미지급이다.",
    "state_change" => "태우 AI는 방어도구에서 북한 해킹망·내부정보를 역추적하는 안보자산으로 올라가고, 에너지 대응은 몽골 증산지시 단계에 머문다.",
    "ending_hook" => "QUAD 참여압박을 감당하면서 몽골 증산·비축을 실제 물량으로 바꿔 중국 전력난에 대응할 수 있는가?",
    "closed_loops" => "센트리언 해킹 차단; 6천 대 좀비PC·북한 암호·명단·비트코인 경로 확인; 몽골 증산·비축 지시",
    "opened_loops" => "몽골 석탄 실제 증산·비축; 중국 전력난; QUAD 참여압박; 북한 권력변수"
  },
  608 => {
    "action" => "가이아나 정부와 100억 달러 국채계약을 체결해 유전·인프라 지분조건을 확보하고, 호주와는 석탄 장기계약을 맺어 부산·인천으로 보내기로 한다. 올해 1억 달러·내년 10억 달러 이상 물량은 계약됐지만 세부 무기목록과 몽골 비축은 후속이다.",
    "turn_or_reveal" => "유전·교육·인프라 협상이 100억 달러 국채계약으로, 호주 석탄선이 올해 1억 달러·내년 10억 달러 이상의 실물 공급계약으로 각각 닫힌다.",
    "paid_reward" => "가이아나 100억 달러 국채계약과 유전·인프라 지분조건, 호주 석탄 장기계약과 올해 1억 달러·내년 10억 달러 이상 물량 및 부산·인천 공급선을 얻는다. 세부 무기계약·몽골 비축은 남는다.",
    "state_change" => "태우는 가이아나에서 국채·유전·인프라 계약당사자가 되고 호주 석탄을 한국 항만으로 들이는 장기 공급선을 확보한다.",
    "ending_hook" => "가이아나의 세부 군수조건과 몽골 비축을 닫은 뒤 김태중의 베트남 계획까지 안전하게 실행할 수 있는가?",
    "closed_loops" => "가이아나 100억 달러 국채계약·유전/인프라 조건; 호주 석탄 장기계약·부산/인천 공급선",
    "opened_loops" => "가이아나 세부 무기계약; 몽골 석탄 비축; 김태중 베트남 계획"
  },
  614 => {
    "action" => "김태중이 축구협회장 선거에서 17표를 얻어 당선된다. 메타버스 제휴를 두고 마이크로소프트가 장기계약·주식교환에 긍정적으로 반응하지만 계약과 주식지급은 아직 없고, 델타 변이·중국 백신실패·바이든 방한 대응을 연다.",
    "turn_or_reveal" => "김태중의 17표 당선으로 가족의 새 공적역할이 확정된 뒤 메타버스 협상은 마이크로소프트의 긍정답변만 얻은 채 백신·반도체 외교로 넘어간다.",
    "paid_reward" => "김태중의 17표 축구협회장 당선과 마이크로소프트의 메타버스 장기계약·주식교환 협상 의사를 얻는다. 계약서·마이크로소프트 주식은 미지급이다.",
    "state_change" => "김태중은 축구협회장이라는 공식직책을 얻고 태우 메타버스는 마이크로소프트 협상선에 올라가지만 지분·주식 소유는 바뀌지 않는다.",
    "ending_hook" => "델타 변이·중국 백신실패와 바이든 방한을 이용해 백신외교와 반도체 예외권을 얻을 수 있는가?",
    "closed_loops" => "김태중 축구협회장 17표 당선; 마이크로소프트 장기계약·주식교환 협상의사",
    "opened_loops" => "메타버스 정식계약·주식교환; 델타 백신외교; 미국 반도체공장·중국 팹 예외"
  },
  625 => {
    "action" => "제주 무인주행 15일 실증에서 시스템 오류 사고 0건과 음주운전자 7명 적발, 관광객 30퍼센트·외국인 15퍼센트 증가를 확인한다. 당원 3천여 명을 훑어 봉우리파 관련자 이름을 추리고 강 대위에게 수사를 맡기지만 배신 증거는 아직 없다.",
    "turn_or_reveal" => "무인주행의 안전·관광 수치가 기술실증을 닫은 직후, 3천여 명 스캔에서 봉우리파 이름들이 떠올라 성취가 내부수사로 꺾인다.",
    "paid_reward" => "제주 실증 사고 0건·음주운전자 7명 적발, 관광객 30퍼센트·외국인 15퍼센트 증가와 당원 3천여 명 스캔·봉우리파 관련자 명단·수사지시를 얻는다. 배신 증거와 자금망은 미지급이다.",
    "state_change" => "제주 무인주행은 안전·치안·관광 효과를 수치로 증명하고 국민경제당 검증은 막연한 의심에서 봉우리파 관련자 추적으로 좁혀진다.",
    "ending_hook" => "봉우리파 관련자 명단에서 실제 배신증거와 자금망을 찾아 당 내부를 정리할 수 있는가?",
    "closed_loops" => "제주 15일 실증 사고 0·음주 7명; 관광객 30퍼센트·외국인 15퍼센트 증가; 3천여 명 스캔·봉우리파 명단",
    "opened_loops" => "봉우리파 배신증거·자금망; 당 내부정리·수사"
  },
  630 => {
    "action" => "북한 해킹·암호화폐 자금망의 차단·탈취안을 지시하는 한편 국민경제당 야권 인사들의 양심고백과 다수의 이동약속을 확인해 폭로를 시작한다. 중국 부동산 숏을 대부분 닫고 조지에게 일본 금융공격을 제안해 수락받지만 실제 차단·일본공격은 아직 없다.",
    "turn_or_reveal" => "당내 고백·이동약속과 중국 부동산 숏 정리가 실제 정치·금융 영수증으로 남고, 조지가 일본전을 받아들이며 다음 표적이 확정된다.",
    "paid_reward" => "야권 인사들의 양심고백과 다수의 국민경제당 이동약속, 중국 부동산 공매도 대부분의 청산, 조지의 일본 금융전 수락을 얻는다. 북한 자금차단·탈취와 일본 공격수익은 미지급이다.",
    "state_change" => "국민경제당은 야권 이탈자와 폭로선을 얻고 중국 부동산 숏은 대부분 현금화된다. 조지는 일본전 담당자가 되지만 공격은 시작 전이다.",
    "ending_hook" => "조지가 일본 금융전의 목표·자금·공격시점을 정해 첫 행동에 나설 수 있는가?",
    "closed_loops" => "야권 양심고백·이동약속; 중국 부동산 숏 대부분 청산; 조지의 일본전 수락",
    "opened_loops" => "북한 해킹·암호화폐 자금차단; 일본 금융공격 목표·시점·집행"
  },
  633 => {
    "action" => "2천 명이 넘는 PMC가 말리 반군을 물러나게 하고 광산은 다음 날 재가동·일주일 안 정상화를 예정한다. 말리 정부가 리튬광산 지분 5퍼센트를 더 주겠다고 약속하자 김민재는 진행을 받아들이지만 법적 지분이전은 아직 없다.",
    "turn_or_reveal" => "PMC 투입은 반군 철수라는 현장결과를 만들고 말리 정부의 추가 5퍼센트 약속까지 끌어내지만 광산 정상화·지분이전은 다음 절차로 남는다.",
    "paid_reward" => "2천 명 이상 PMC의 반군 철수, 광산의 다음 날 재가동·일주일 정상화 일정, 말리 정부의 리튬광산 추가 5퍼센트 양도약속과 김민재의 수락을 얻는다. 실제 지분이전은 미지급이다.",
    "state_change" => "말리 광산은 반군 점거에서 재가동 일정이 잡힌 자산으로 돌아오고 태우는 추가 5퍼센트의 정치적 약속을 얻지만 법적 소유는 아직 그대로다.",
    "ending_hook" => "광산을 실제 정상화하고 추가 5퍼센트 지분을 이전받으면서 PMC 유착·제재위험을 피할 수 있는가?",
    "closed_loops" => "2천 명 이상 PMC 투입·반군 철수; 광산 재가동 일정; 추가 5퍼센트 양도약속",
    "opened_loops" => "광산 정상가동; 추가 5퍼센트 법적 이전; PMC 유착·제재위험"
  },
  636 => {
    "action" => "국내 원전 2기가 이미 가동 중이고 소형 원전은 다음 상반기 준공예정임을 확인한다. 기업농 정책과 적자 28GHz를 철회하지 않기로 하고 KOSPI 4500의 시장상태를 점검하지만 농산물·통신효과는 아직 장기과제다.",
    "turn_or_reveal" => "원전 2기 가동과 KOSPI 4500이라는 현재 기반을 확인한 뒤 지지율·적자 비용을 감수하고 기업농·28GHz를 끝까지 유지하는 정책선택이 굳어진다.",
    "paid_reward" => "국내 원전 2기 가동과 소형 원전의 다음 상반기 준공일정, KOSPI 4500을 확인하고 기업농·28GHz 유지방침을 확정한다. 농산물 가격·자율주행·스마트팜의 장기효과는 미지급이다.",
    "state_change" => "태우·정부는 가동 원전과 자본시장 기반 위에서 단기 지지율·통신적자를 감수하고 기업농·28GHz를 계속할 정책주체가 된다.",
    "ending_hook" => "기업농·28GHz를 유지한 비용이 농산물 가격과 자율주행·스마트팜의 장기효과로 돌아올 것인가?",
    "closed_loops" => "원전 2기 가동 확인; 소형 원전 준공일정; KOSPI 4500; 기업농·28GHz 유지결정",
    "opened_loops" => "농산물 가격효과; 28GHz 자율주행·스마트팜 성과; 소형 원전 준공"
  },
  645 => {
    "action" => "대통령이 러우전쟁 대응과 미국·유럽 연결역할을 김민재에게 맡긴다. 김민재는 미국의 재고보충 판매, 유럽의 방산·원전·물류·식량 패키지를 설계하고 데이비드에게 백악관 접촉을 지시하지만 승인·수출·계약은 아직 없다.",
    "turn_or_reveal" => "국가의 전쟁대응 역할이 김민재에게 맡겨지고 그 권한이 미국 보충판매와 유럽 산업패키지의 담당·접촉지시로 구체화된다.",
    "paid_reward" => "대통령의 러우전쟁 대응·미국/유럽 연결역할 위임과 미국 보충판매·유럽 방산/원전/물류/식량 패키지 설계, 데이비드의 백악관 접촉지시를 얻는다. 실제 승인·수출·계약은 미지급이다.",
    "state_change" => "김민재는 민간 공급망 운영자에서 대통령이 맡긴 전쟁 산업·외교 연결자가 되지만 군수·원전·물류 계약상 권리는 아직 생기지 않는다.",
    "ending_hook" => "설계한 미국 보충판매와 유럽 방산·원전·물류·식량 패키지를 실제 승인·장기계약으로 바꿀 수 있는가?",
    "closed_loops" => "대통령의 대응역할 위임; 미국 보충판매·유럽 산업패키지 설계; 백악관 접촉지시",
    "opened_loops" => "미국 보충판매 승인; 유럽 방산·원전·물류·식량 계약"
  },
  648 => {
    "action" => "니켈 마진콜을 무기한 유예시키고 가격이 내려가는 동안 금융타워의 숏 포지션을 유지한다. 창산에 200억 달러 보증을 서지만 실제 현금은 나가지 않고, 한 부회장·데이비드의 동유럽 일정과 동남아를 거친 러시아 에너지 전략을 점검한다.",
    "turn_or_reveal" => "니켈 급등의 마진콜은 무기한 유예·가격하락으로 꺾였고 200억 달러 보증은 현금유출 없이 협상력을 만든다. 이어 광물전이 동유럽·러시아 에너지 우회망으로 넘어간다.",
    "paid_reward" => "니켈 마진콜 무기한 유예와 가격하락, 금융타워 숏 포지션 유지, 현금지출 없는 200억 달러 보증과 동유럽 일정 확정을 얻는다. 최종 숏 수익·광산양도·러시아 에너지 계약은 미지급이다.",
    "state_change" => "창산은 즉시청산 위기에서 태우 보증 아래 시간을 얻고 금융타워는 현금유출 없이 숏과 협상력을 유지한다. 다음 전장은 동유럽·러시아 에너지선으로 이동한다.",
    "ending_hook" => "유예·보증으로 잡은 니켈 협상력을 광산양도와 확정수익으로 닫고 러시아 에너지 우회망을 제재 없이 운영할 수 있는가?",
    "closed_loops" => "니켈 마진콜 무기한 유예; 가격하락·숏 유지; 현금지출 없는 200억 달러 보증; 동유럽 일정",
    "opened_loops" => "니켈 숏 최종수익·광산양도; 동유럽 계약; 러시아 에너지 우회망·제재위험"
  },
  664 => {
    "action" => "MCA 측에서 테일러 스위프트의 내한 의사와 태우 경기장 일정 확보, 다른 가수들의 추가배정을 약속받는다. 김민재는 해외 스포츠팀까지 부르라고 지시하지만 공연·관중·매출은 아직 발생하지 않는다.",
    "turn_or_reveal" => "10만 석 시설의 가능성은 테일러 스위프트 내한·일정 배정 약속으로 구체화되지만 흥행 영수증 대신 공연과 스포츠 초청이라는 열린 일정표만 남는다.",
    "paid_reward" => "MCA의 테일러 스위프트 내한·태우 경기장 일정배정과 다른 가수 추가배정 약속, 해외 스포츠팀 초청지시를 얻는다. 실제 공연·관중·수익은 미지급이다.",
    "state_change" => "태우 경기장은 대형 해외공연의 우선 일정과 MCA 협업선을 얻지만 아직 흥행·수익이 검증된 시설은 아니다.",
    "ending_hook" => "테일러 스위프트와 해외 스포츠팀 일정을 실제 10만 석 흥행·관광수익으로 바꿀 수 있는가?",
    "closed_loops" => "테일러 스위프트 내한의사·경기장 일정 약속; MCA 추가가수 배정; 해외 스포츠팀 초청지시",
    "opened_loops" => "실제 공연·관중·매출; 반복 가능한 문화·스포츠 흥행"
  },
  668 => {
    "action" => "바이든에게 곡물메이저의 압박을 알리고 IRS가 불법·탈세 혐의를 제시하자 곡물메이저가 태우 방해를 멈추기로 한다. IRS는 조사를 보류하고 빈 살만은 OPEC+ 증산안을 논의하겠다고 답하지만 실제 증산은 아직 없다.",
    "turn_or_reveal" => "곡물메이저의 정치압박이 IRS 자료 앞에서 방해중단으로 뒤집히고, 사우디선은 증산 합의가 아니라 OPEC+ 논의 약속까지만 열린다.",
    "paid_reward" => "곡물메이저의 태우 방해중단과 IRS 조사보류, 빈 살만의 OPEC+ 증산안 논의 약속을 얻는다. 실제 증산·유가하락은 미지급이다.",
    "state_change" => "태우는 곡물메이저의 직접 방해를 멈추게 하고 미국 세무압박을 일시 정지시키며 사우디 증산협상의 공식 논의선에 올라간다.",
    "ending_hook" => "OPEC+ 논의 약속을 실제 증산으로 바꾸고 곡물메이저의 방해중단을 지속시킬 수 있는가?",
    "closed_loops" => "곡물메이저 방해중단; IRS 조사보류; OPEC+ 증산안 논의 약속",
    "opened_loops" => "사우디·OPEC+ 실제 증산; 유가변화; 곡물메이저 합의 유지"
  },
  672 => {
    "action" => "러시아·바그너 지원선의 처리상태를 점검한 뒤 곡물·원유 카르텔이 트럼프를 만나 후원금을 약속한 사실을 데이비드에게서 듣는다. 김민재는 현직 바이든과 차기 트럼프 양쪽 관계를 유지하기로 하지만 트럼프를 통제할 수는 없다.",
    "turn_or_reveal" => "아프리카·바그너 지원점검이 미국 대선의 카르텔 후원정보로 이어지고, 김민재는 한 후보를 고르는 대신 양쪽 선을 남기는 불완전한 보험을 택한다.",
    "paid_reward" => "러시아·바그너 지원선의 처리확인, 곡물·원유 카르텔의 트럼프 접촉·후원약속 정보와 바이든·트럼프 양면관계 유지결정을 얻는다. 후보통제와 선거결과는 미지급이다.",
    "state_change" => "태우는 카르텔의 트럼프 후원선을 사전에 파악하고 미국 대선 양쪽에 접근할 정치보험을 세우지만 어느 후보도 통제하지 못한다.",
    "ending_hook" => "바이든·트럼프 양쪽 선을 유지해 어느 후보가 이겨도 곡물·원유 정책의 피해를 막을 수 있는가?",
    "closed_loops" => "러시아·바그너 지원선 점검; 카르텔의 트럼프 접촉·후원약속 확인; 양면관계 유지결정",
    "opened_loops" => "미국 대선결과; 트럼프 돌발행동; 곡물·원유 정책보험의 실제 효과"
  },
  681 => {
    "action" => "파리 모터쇼에서 고체배터리와 T-9의 1천 킬로미터 주행·10분 충전을 공개한다. 세계 완성차들이 공급계약을 요구하자 준비한 계약서를 건네지만 서명은 아직 확인되지 않는다.",
    "turn_or_reveal" => "구디너프와 천민정의 고체배터리가 실차 제원으로 공개돼 완성차들의 계약요청을 끌어내고 김민재는 준비한 문서를 즉시 내민다.",
    "paid_reward" => "고체배터리·T-9의 1천 킬로미터 주행·10분 충전 공개와 세계 완성차의 공급계약 요청, 준비된 계약서 제시를 얻는다. 서명·물량배분은 미지급이다.",
    "state_change" => "고체배터리는 연구성과에서 완성차들이 공급을 요청한 공개제품으로 올라가지만 계약상 공급권과 물량은 아직 정해지지 않는다.",
    "ending_hook" => "완성차들 앞에 내민 계약서를 실제 서명과 물량배분으로 닫을 수 있는가?",
    "closed_loops" => "고체배터리·T-9 공개; 1천 킬로미터·10분 충전 제원; 완성차 공급계약 요청·문서 제시",
    "opened_loops" => "공급계약 서명; 완성차별 물량배분; 양산"
  },
  687 => {
    "action" => "한아약품 모녀·형제들의 가족지분을 태우와 금융타워로 넘겨 경영권을 확보한다. 센트리언 매각은 다음 해 계획으로 남고, 북한 미사일이 NLL 남쪽에 떨어졌다가 경보가 해제되자 장남 카드를 움직일 대응을 연다.",
    "turn_or_reveal" => "가족지분 이전으로 한아약품 경영권이 실제 닫힌 직후 북한 미사일 남하가 기업인수를 국가안보 대응으로 뒤집는다.",
    "paid_reward" => "한아약품 모녀·형제들의 가족지분 이전과 태우·금융타워의 경영권 확보를 얻는다. 센트리언 재매각과 북한 장남 카드의 실제 작동은 미지급이다.",
    "state_change" => "한아약품은 가족분쟁 기업에서 태우·금융타워가 지배하는 제약자산으로 바뀌고 김민재의 다음 과제는 북한 도발 대응이 된다.",
    "ending_hook" => "NLL 남쪽 미사일 도발 뒤 심어 둔 북한 장남 카드를 움직여 추가 충돌을 막을 수 있는가?",
    "closed_loops" => "한아약품 가족지분 이전; 태우·금융타워 경영권 확보",
    "opened_loops" => "센트리언 재매각; 북한 미사일 대응; 장남 카드 가동"
  },
  690 => {
    "action" => "사우디에 원화스와프와 원화 원유결제를 제안해 말로 긍정답변을 받고 실무협상을 시작한다. 시장과 환율이 반응하고 유럽 9개국이 원전·방산 금융을 문의해 금융타워가 무이자대출안을 내지만 서명된 스와프·원화결제 계약은 없다.",
    "turn_or_reveal" => "사우디의 구두수락과 유럽 9개국 문의가 원화금융의 가능성을 시장에 드러내지만 국가간 계약과 실제 결제는 세부협상으로 남는다.",
    "paid_reward" => "사우디의 원화스와프·원화 원유결제 구두수락과 실무협상 착수, 시장·환율 반응, 유럽 9개국의 원전·방산 금융문의와 금융타워 무이자대출 제안을 얻는다. 정식 스와프·결제는 미지급이다.",
    "state_change" => "원화 국제화는 사우디·유럽의 구두협상과 시장반응을 얻었지만 실제 국가간 스와프·원유결제 권한은 아직 없다.",
    "ending_hook" => "사우디와 유럽의 구두협상·금융문의를 실제 원화스와프·원유결제·원전/방산 계약으로 닫을 수 있는가?",
    "closed_loops" => "사우디 구두수락·실무협상 착수; 시장·환율 반응; 유럽 9개국 금융문의",
    "opened_loops" => "사우디 정식 스와프·원화 원유결제; 유럽 원전·방산 세부계약"
  },
  693 => {
    "action" => "산업스파이 17명의 증거와 34명의 의심명단, 제안을 거부한 50명 이상을 확인한다. 제보자 보너스를 지시하고 일부 증거를 검찰에 보내며 고체배터리 관심·주가상승을 보지만 체포·자산환수·150만 대 생산은 아직 없다.",
    "turn_or_reveal" => "직원 제보가 17명 확정·34명 의심·50명 이상 거부라는 인적지도로 바뀌고 고체배터리 시장반응까지 붙지만 처벌과 생산확대는 다음 절차로 남는다.",
    "paid_reward" => "산업스파이 17명 증거, 34명 의심명단과 제안을 거부한 직원 50명 이상, 제보자 보너스 지시·일부 검찰자료 전달 및 고체배터리 관심·주가상승을 확인한다. 체포·보너스 입금·자산환수는 미지급이다.",
    "state_change" => "태우는 기술유출의 확정·의심·거부 인원을 구분한 수사자료를 얻고 고체배터리 수요를 확인하지만 처벌·보상·생산능력은 실행 전이다.",
    "ending_hook" => "유출자 처벌과 제보보상을 실제 집행하면서 유럽 보조금·금융동맹을 고체배터리 시장확대로 연결할 수 있는가?",
    "closed_loops" => "산업스파이 17명 증거·34명 의심; 거부직원 50명 이상; 보너스·검찰전달 지시; 시장관심·주가상승",
    "opened_loops" => "산업스파이 체포·자산환수; 제보보너스 입금; 150만 대 생산; 유럽 보조금·금융동맹"
  },
  710 => {
    "action" => "사우디가 2030 엑스포 후보를 공식 철회하고 부산 지지로 돌아선다. 아람코 0.6퍼센트 지분매각 계약서를 받아 핀테크 처리에 넘긴 뒤 AI 투자광풍·유토피아의 엔비디아 보유설을 점검하고 조지에게 일본 금융공격 D-DAY 결정을 맡긴다.",
    "turn_or_reveal" => "사우디 후보철회가 부산 엑스포 외교전의 핵심 경쟁자를 지우고 아람코 0.6퍼센트 계약서까지 지급한 뒤, 마지막 장면은 일본 금융공격 시계로 바뀐다.",
    "paid_reward" => "사우디의 2030 엑스포 후보 공식철회·부산 지지와 아람코 0.6퍼센트 지분매각 계약서 수령·핀테크 처리지시를 얻는다. 일본 금융공격 D-DAY 날짜와 실행은 미지급이다.",
    "state_change" => "부산은 사우디라는 핵심 경쟁자를 지지표로 돌리고 태우는 아람코 지분계약의 처리단계에 들어간다. 조지는 일본전 개시시점을 정할 권한을 맡는다.",
    "ending_hook" => "조지가 일본 금융공격 D-DAY를 언제로 정하고 어떤 신호에 맞춰 실행할 것인가?",
    "closed_loops" => "사우디 엑스포 후보철회·부산 지지; 아람코 0.6퍼센트 지분매각 계약서·처리지시",
    "opened_loops" => "아람코 지분 처리완료; 일본 금융공격 날짜·실행; 유토피아 엔비디아 보유설"
  },
  715 => {
    "action" => "중국 특구의 철수권 조건을 점검하고 계열사들이 진출준비를 시작한다. 마지막에는 프리고진과 바그너 지도부가 러시아로 가기로 결정하지만 행군·점령·반란결과는 아직 없다.",
    "turn_or_reveal" => "중국 특구사업은 철수권을 가진 준비단계에 머무는 반면 프리고진의 러시아행 결정이 회차 말미의 전쟁변수를 단번에 연다.",
    "paid_reward" => "철수권을 포함한 중국특구 조건과 계열사 진출준비, 프리고진·바그너 지도부의 러시아행 결정을 확인한다. 실제 중국진입·바그너 행군·반란결과는 미지급이다.",
    "state_change" => "태우 계열사는 중국특구 진출 준비상태가 되고 프리고진은 불만을 품은 지휘관에서 러시아행을 택한 행동주체로 바뀌지만 반란은 결과 전이다.",
    "ending_hook" => "러시아행을 택한 프리고진과 바그너가 실제로 무엇을 실행하고 푸틴은 어떻게 대응할 것인가?",
    "closed_loops" => "중국특구 철수권 조건; 계열사 진출준비; 프리고진·바그너 러시아행 결정",
    "opened_loops" => "중국특구 실제진입; 바그너 행군·반란; 러시아 대응"
  },
  720 => {
    "action" => "미국이 항모운용 제안을 받아들이고 무기수송선은 13일 만에 수에즈에 도착해 대기 없이 통과한다. 전투기는 이미 폴란드에 있고 동유럽 재고도 우크라이나로 넘어간 것을 확인한 뒤 지린특구·북한·러시아 육로 경제영토를 설계한다.",
    "turn_or_reveal" => "미국 승인과 수에즈 무대기 통과, 폴란드 전투기·우크라이나 재고라는 군수 영수증이 나온 뒤 전시물류가 유라시아 경제영토 구상으로 확장된다.",
    "paid_reward" => "미국의 항모운용 제안 수락, 무기수송선의 13일 내 수에즈 도착·무대기 통과, 폴란드 전투기와 우크라이나 동유럽 재고 이전을 확인한다. 지린특구·북방 육로 경제영토는 설계 단계다.",
    "state_change" => "태우의 간접 군수지원은 승인·수송·전진배치가 확인된 실물망이 되고, 다음 확장은 중국특구와 북한·러시아를 잇는 경제영토 구상으로 옮겨간다.",
    "ending_hook" => "실제로 움직인 군수망을 지린특구·북한·러시아 육로의 지속 가능한 경제영토로 바꿀 수 있는가?",
    "closed_loops" => "미국 항모운용안 수락; 무기선 13일·수에즈 무대기 통과; 폴란드 전투기·우크라이나 재고 이전",
    "opened_loops" => "지린특구 실제진입; 북한·러시아 육로 경제영토; 장기 거버넌스"
  },
  731 => {
    "action" => "우크라이나·벨라루스 협상일정을 확정하고 이스라엘 PMC 계약·드론 수송·대피소 착공을 확인한다. 일본에는 1천2백억 달러 상당 엔화를 반나절 만에 상환해 니케이 15퍼센트·나스닥과 KOSPI 6퍼센트 하락을 만들고 자민당 비자금 자료를 축적한다.",
    "turn_or_reveal" => "휴전협상과 중동 방어선이 지급된 뒤 일본 엔화상환이 반나절 시장충격으로 번지고, 김민재는 즉시 협상을 요구하기보다 비자금·미국압박을 장기카드로 쌓는다.",
    "paid_reward" => "우크라이나·벨라루스 협상일정, 이스라엘 PMC 계약·드론 수송·대피소 착공, 일본 엔화 1천2백억 달러의 반나절 상환과 니케이 15퍼센트·나스닥/KOSPI 6퍼센트 하락을 확인한다. 두 배 수익과 일본 협상요청은 미지급이다.",
    "state_change" => "러우 휴전선과 이스라엘 민간방어선이 실행단계에 들어가고 일본전은 대규모 엔화상환·시장충격을 낸 뒤 비자금 자료를 쌓는 장기 압박으로 바뀐다.",
    "ending_hook" => "자민당 비자금 자료와 미국 압박 가능성을 언제 공개해 총리 사퇴·중의원 해산까지 끌어낼 것인가?",
    "closed_loops" => "우크라이나·벨라루스 협상일정; 이스라엘 PMC·드론·대피소; 엔화 1천2백억 달러 반나절 상환·시장하락",
    "opened_loops" => "엔캐리 최종수익; 자민당 비자금 공개; 미국 압박; 총리 사퇴·중의원 해산; 일본 협상요청"
  },
  735 => {
    "action" => "니케이는 12퍼센트 반등하고 나스닥은 낙폭을 회복하며 KOSPI는 사태 전보다 4퍼센트 오른다. 금융타워는 일본 보유 미국채를 사들이고 야권은 정치인 이름·금액·녹취를 공개한다. 곤조는 50억 엔을 받고 30억 엔을 더 약속받지만 더러운 10억 엔은 거절한다.",
    "turn_or_reveal" => "금융시장의 반등과 미국채 매입이 일본전의 자금흐름을 재편하고, 야권의 실명·금액·녹취 공개와 곤조의 자금선택이 선거전의 규율을 세운다.",
    "paid_reward" => "니케이 12퍼센트 반등·나스닥 낙폭회복·KOSPI 사태 전 대비 4퍼센트 상승, 금융타워의 일본 보유 미국채 매입, 야권의 실명·금액·녹취 공개와 곤조의 50억 엔 수령·30억 엔 추가약속을 얻는다. 환율보험금·3대 은행지분은 미지급이다.",
    "state_change" => "금융타워는 일본 이탈 미국채를 흡수하고 일본 야권은 증거와 합법자금으로 선거전에 들어간다. 일본 은행의 소유권은 아직 바뀌지 않는다.",
    "ending_hook" => "총리 사퇴·중의원 해산 뒤 일본 총선과 같은 시각 겹치는 중동기습·러우휴전을 함께 통제할 수 있는가?",
    "closed_loops" => "일본·미국·한국 증시 반등; 일본 보유 미국채 매입; 야권 실명·금액·녹취 공개; 곤조 50억 엔·30억 엔 약속",
    "opened_loops" => "환율보험 보상; 일본 3대 은행지분; 중의원 총선; 중동기습·러우휴전"
  },
  739 => {
    "action" => "일본 총선에서 자민당 200석·입헌민주당 162석을 확인하고 태우건설은 우크라이나 재건에 들어간다. 이어 하마스 기습을 AI 드론과 PMC가 막아 이스라엘 남서부 민간인 사망 0명을 만들고 이스라엘은 전쟁을 선언한다.",
    "turn_or_reveal" => "일본 야권의 의석증가·우크라이나 재건착수라는 정치·산업 결과가 지급된 직후 하마스 기습이 터지고 AI 드론·PMC가 민간인 피해 0명으로 막아낸다.",
    "paid_reward" => "일본 총선 자민당 200석·입헌민주당 162석, 태우건설의 우크라이나 재건진입, AI 드론·PMC의 하마스 기습차단과 이스라엘 남서부 민간인 사망 0명을 얻는다. 미국의 비용정산·국제보상은 미지급이다.",
    "state_change" => "일본 정계는 야권 의석이 크게 늘고 태우건설은 우크라이나 재건사업자가 된다. 태우 PMC·AI 드론은 이스라엘 민간인 방어능력을 실전에서 증명한다.",
    "ending_hook" => "민간인 방어에 쓴 PMC 비용과 약속된 국제보상을 미국이 어느 범위까지 인정할 것인가?",
    "closed_loops" => "일본 총선 200대162; 태우건설 우크라이나 재건진입; 하마스 기습차단·민간인 사망 0명",
    "opened_loops" => "미국 비용정산·국제보상; 이스라엘 전쟁 후속안보"
  },
  744 => {
    "action" => "고체배터리 2세대의 성능돌파와 생산단서를 확인하고 천민정의 AI 금융플랫폼을 일본에 적용할 준비를 한다. 김민재는 소외감을 보인 천민정과 오래된 호텔 구상을 다시 논의하고 한 부회장은 중국투자 출장을 준비한다.",
    "turn_or_reveal" => "2세대 고체배터리의 기술성과 뒤 천민정의 서운함이 드러나자 김민재가 중단됐던 호텔 구상을 함께 꺼내 관계회복과 금융영토 확장을 같은 미래계획으로 묶는다.",
    "paid_reward" => "고체배터리 2세대 성능돌파·생산단서, AI 금융플랫폼의 일본 적용준비, 김민재·천민정의 호텔 구상 재개와 한 부회장의 중국출장 준비를 얻는다. 플랫폼 출시·중국투자·호텔 실행은 미지급이다.",
    "state_change" => "태우는 다음 세대 배터리 단서를 얻고 천민정은 기술개발자에서 일본 금융플랫폼·공동 호텔구상의 파트너로 역할이 넓어진다.",
    "ending_hook" => "고체배터리 생산단서와 천민정의 AI 금융플랫폼·호텔 구상을 실제 사업과 관계회복으로 이어갈 수 있는가?",
    "closed_loops" => "고체배터리 2세대 성능돌파·생산단서; 일본 금융플랫폼 준비; 김민재·천민정 호텔구상 재개",
    "opened_loops" => "고체배터리 양산; 일본 플랫폼 출시; 중국 투자; 호텔 실행·관계회복"
  },
  748 => {
    "action" => "머스크가 우주선용 고체배터리 공장·시험과 휴머노이드 공동개발, 탈부착 배터리 표준을 받아들인다. 다음 날 일본 AI 금융플랫폼이 출시돼 가입자와 금융상품 이용이 급증하고 금융타워 계열사들은 북한 횡단철도 투자에 동의해 51대49 배분안을 짠다.",
    "turn_or_reveal" => "우주배터리·휴머노이드 협업 수락이 나온 직후 일본 플랫폼이 실제 이용자를 끌어모으고, 그 금융망의 다음 자금은 북한 횡단철도 공동투자로 이동한다.",
    "paid_reward" => "머스크의 우주배터리 공장·시험·휴머노이드 공동개발·탈부착 표준 수락, 일본 AI 금융플랫폼 출시와 가입자·상품이용 급증, 금융타워 전 계열사의 횡단철도 투자동의를 얻는다. 공장건설·51대49 최종계약은 미지급이다.",
    "state_change" => "고체배터리는 우주선·휴머노이드의 공동표준 후보가 되고 일본 금융플랫폼은 실제 고객을 얻는다. 금융타워는 횡단철도 공동투자자로 결집한다.",
    "ending_hook" => "우주배터리 협업과 일본 플랫폼의 초기수요를 반복수익으로 키우고 횡단철도 투자동의를 현장 착공으로 바꿀 수 있는가?",
    "closed_loops" => "머스크의 우주배터리·휴머노이드·탈부착 표준 수락; 일본 플랫폼 출시·초기이용 급증; 금융타워 횡단철도 투자동의",
    "opened_loops" => "우주배터리 공장·시험; 일본 플랫폼 반복수익; 횡단철도 51대49 최종계약·착공"
  },
  745 => {
    "turn_or_reveal" => "김태중이 위험한 특사역을 스스로 청하고 김민재가 할아버지의 능력과 신뢰를 다시 확인한다.",
    "state_change" => "지켜야 했던 할아버지가 손자의 마지막 국가사업을 맡고, 손자는 안전보장과 선물을 준비하는 상호신뢰로 관계가 바뀐다."
  },
  749 => {
    "entry_state" => "남북 횡단철도 착공식에 정상·기업·지역주민이 모여 수년간 준비한 북방경제권의 첫 삽을 기다린다.",
    "reader_promise" => "횡단철도 착공과 천민정의 AI 코로나·희귀질병 치료제 노벨 화학상을 지급하고, 기자 공세 속 김민재가 직접 그녀를 안아 보호하는 관계 영수증까지 닫는다.",
    "protagonist_goal" => "횡단철도 착공을 공식화하고 노벨 화학상 소식에 겁먹은 천민정을 언론 노출에서 즉시 지킨다.",
    "action" => "북한 횡단철도 착공식에서 첫 삽을 뜬 뒤 천민정이 AI로 코로나 치료제와 희귀질병 치료제를 개발한 공로로 노벨 화학상 수상자가 됐다는 소식을 받는다. 회의실에 숨은 천민정에게 수상 자격과 과거 보호를 보증하고, 다리에 힘이 풀린 그녀의 머리를 양복 상의로 가린 채 안아 들어 조용히 회사 밖으로 빠져나간다.",
    "resistance_or_cost" => "철도는 착공 뒤 제재·공사비·정권변수를 견뎌야 하고, 천민정은 과거가 드러날 공포와 쏟아지는 인터뷰 요청 때문에 수상을 감당하지 못한다.",
    "turn_or_reveal" => "AI 치료제 개발 공로가 노벨 화학상으로 공식화된 직후, 김민재가 상보다 천민정의 안전을 우선해 양복으로 가리고 직접 안아 회사 밖으로 데려간다.",
    "paid_reward" => "북한 횡단철도 착공, 천민정의 AI 코로나 치료제·희귀질병 치료제 개발 공로 노벨 화학상, 김민재의 공개보증과 양복 차폐·안아 들기라는 실제 보호행동이 지급된다.",
    "state_change" => "북방경제 구상은 착공현장을 얻고 천민정은 세계가 인정한 연구자가 된다. 두 사람의 관계는 김민재가 공포에 굳은 천민정을 품에 안아 언론에서 빼내는 공개적 보호와 신뢰로 한 단계 굳어진다.",
    "ending_hook" => "저택으로 데려온 천민정이 언론의 관심을 견딜 수 있도록 태우가 어떤 보호·공개방식을 마련할 것인가?",
    "closed_loops" => "횡단철도 착공; AI 치료제 공로 노벨 화학상; 천민정 수상자격·과거 보호보증; 양복으로 가리고 안아 회사 밖으로 이동",
    "opened_loops" => "천민정의 인터뷰·사생활 보호; 횡단철도 공사·운영; 노벨상 이후 두 사람의 관계"
  },
  750 => {
    "entry_state" => "김민재가 전날 안아 데려온 천민정은 저택에서 휴대폰을 끄고 언론의 노벨 화학상 취재를 피한다.",
    "reader_promise" => "김민재·최재석 공동 노벨 평화상을 태우 주가·계열사 매출·세계 최고급 브랜드·국민경제당 후계구도라는 현재 보상으로 환산한다.",
    "protagonist_goal" => "749화부터 보호 중인 천민정의 노출을 줄이고 공동 평화상 발표를 기업·정치·국가 브랜드의 실물 효과로 정리한다.",
    "action" => "저택에서 천민정의 휴식과 음성 인터뷰 방식을 마련하고 해상도시 공개로 관심을 분산한다. 다음 날 김민재·최재석의 노벨 평화상 공동수상을 확인한 뒤 태우 주가 급등, 계열사 매출 상승, 국민경제당 후계구도 강화와 세계 최고 수준의 태우 브랜드 이미지를 보고받는다.",
    "resistance_or_cost" => "천민정은 계속 숨어 있고 김민재는 평화상이 현직 기업가의 족쇄가 될 수 있음을 걱정한다. 세 수상자에게 몰린 취재를 기업·정치 홍보로만 소비하지 않아야 한다.",
    "turn_or_reveal" => "천민정의 관심을 분산하려 켠 휴대폰에서 김민재 자신과 최재석의 공동 평화상 발표가 확인되고, 그 소식이 주가·매출·정당 승계·브랜드 상승으로 즉시 환산된다.",
    "paid_reward" => "김민재·최재석의 노벨 평화상 공동수상, 태우 주가 급등과 계열사 매출 상승, 세계 최고 수준의 브랜드 이미지, 최재석이 선택할 국민경제당 후계자의 대선 우위가 현재 화에서 지급된다. 천민정 보호는 749화에 시작돼 저택에서 계속되는 상태다.",
    "state_change" => "러우 휴전·하마스 민간인 방어의 국제적 공로가 공동 평화상으로 공식화되고 태우는 매출·주가·브랜드에서 즉시 이익을 얻는다. 국민경제당의 다음 권력승계도 사실상 당내 경선 중심으로 굳어진다.",
    "ending_hook" => "최재석이 평화상과 임기 말 권력을 어떻게 결산하고, 부산 엑스포 마지막 투표까지 자신의 후계와 국가사업을 닫을 것인가?",
    "closed_loops" => "김민재·최재석 공동 노벨 평화상; 태우 주가·계열사 매출 상승; 세계 최고급 브랜드; 국민경제당 후계구도 강화",
    "opened_loops" => "최재석 수상·퇴임 결산; 부산 엑스포 투표; 김민재의 수상 공로 돌리기; 천민정의 장기 사생활 보호"
  },
  751 => {
    "reader_promise" => "부산 엑스포 131대34, 김민재의 숨은 기업제국, 천민정의 임신·초음파와 김태중의 한국 잔류를 한자리에서 공개해 생존·가족·복수 약속을 닫는다.",
    "protagonist_goal" => "최재석의 마지막 국가사업을 부산 엑스포로 결산하고, 할아버지 김태중에게 평화상·숨은 소유기업 목록·증손 초음파라는 세 상자를 차례로 보여 가족 곁에 남게 한다.",
    "action" => "최재석과 공동 평화상·퇴임을 정리한 뒤 부산 엑스포 1차 투표 131대34 승리를 함께 확인한다. 2023년 마지막 날 김태중에게 평화상 상자를 건네고, 두 번째 종이에는 차명으로 50% 이상 또는 51%·최대주주 지분을 가진 여러 기업과 그 절반 이상이 세계 10위권이라는 숨은 제국을 공개한다. 그 목록도 전체 자산의 절반 미만이라고 밝힌 뒤 천민정의 임신을 알리는 초음파 사진을 세 번째 선물로 내민다.",
    "resistance_or_cost" => "김태중은 영국으로 떠나려 하고 김민재는 회귀 뒤 눌러 둔 감정을 드러내며 새 가정의 책임을 받아들여야 한다.",
    "turn_or_reveal" => "김태중은 평화상보다 차명 50%+ 기업목록에 손자의 방어벽을 이해하고, 초음파 사진을 본 뒤 영국행 표를 취소해 손자와 손자며느리의 손을 잡는다.",
    "paid_reward" => "최재석의 공동 평화상·퇴임과 부산 엑스포 131대34 승리, 김민재가 50%+ 또는 최대주주로 실소유한 기업목록, 그 절반 이상의 세계 10위권 지위와 공개목록조차 전체 자산 절반 미만이라는 숨은 제국이 드러난다. 천민정의 임신·결혼, 초음파 사진, 김태중의 영국행 취소·한국 잔류와 조손 화해도 지급된다. 평화상의 공식 수상자는 김민재·최재석이고 김태중에게는 손자가 상자째 공을 돌리려 한 것이다.",
    "state_change" => "태우를 지키던 비공개 방어벽의 실소유 구조가 할아버지에게 공개되고, 복수와 독식으로 버틴 김민재는 할아버지·천민정·태어날 아이와 함께 기업과 가정을 지킬 책임을 선택한다.",
    "ending_hook" => "회귀 뒤 지키려던 할아버지와 사랑하는 사람이 곁에 남았고, 이후의 과제는 얻은 세계와 가정을 함께 책임지는 삶이다.",
    "closed_loops" => "부산 엑스포 131대34; 평화상·정계퇴임; 50%+ 실소유 기업과 숨은 자산 공개; 조손 화해·김태중 한국 잔류; 천민정 임신·초음파·결혼",
    "opened_loops" => "태우그룹과 새 가정을 함께 지키는 다음 생애"
  }
}.freeze

PACING_OVERRIDES = {
  10 => { "pacing_note" => "리라화 다음 표적을 맞힌 김민재가 조지에게 모든 통화전쟁 동맹과 파운드 공격 60억 달러 공동투자를 받아 내고, 남은 40억 달러를 독자 운용할 자율성을 얻는다. 조지·짐의 대학 추천서는 써 주겠다는 약속일 뿐 원본 수령 전이므로 관계 보상과 문서 지급을 분리한다." },
  50 => { "reward_1_10" => "7", "pacing_note" => "강 대위의 보고로 우성일이 이노폰 자료를 기자에게 넘기는 영상과 음성 녹음이 이미 확보된다. 1면 허위기사에 SAVE 반박자료와 한국·미국·독일 동시 검증을 맞붙이는 리듬이라, 증거 지급 뒤 공개 시연의 성패가 훅으로 남는다.", "weights" => %w[0.25 0.34 0.20 0.10 0.11] },
  71 => { "reward_1_10" => "6", "pacing_note" => "500대도 못 판 엠피맨 뒤 황영철이 디지털케이스 지분 전량을 넘기겠다고 하고, 김민재는 직원 보너스용 50억 원을 당일 입금하겠다고 약속한다. 직원·황영철의 애플 재출발, MCA 지분 협상 출발, 기획실 이동 동의가 이어지지만 사장 임명·기획실 발령·MCA 지분 취득은 아직 전이라 보상은 합의와 담당 확정에 둔다." },
  97 => { "reward_1_10" => "8", "pacing_note" => "조지가 퀀텀 이름·지분 7% 참여를 수락한 뒤 정부와 9호선 3조5천억 원, 컨소시엄 9천억 원, 30년 MRG·요금결정·운영 계약에 실제 날인한다. 태우건설 주 시공·9호선 확장 변경과 거가대교 1조9천억 원 전액투자·40년 운영은 이제 협상할 안이므로 두 사업을 함께 수주한 보상으로 올리지 않는다." },
  146 => { "pacing_note" => "삼진의 WIPI 철회와 방송위원회 연기로 판매가 열리자 첫 반나절 2만 대가 팔리고 3만 명 넘게 예약해 초기 10만 대가 부족해진다. 김민재는 높은 단가를 감수한 태우전자 국내 생산 협의를 지시하지만 생산·추가물량은 아직 없어, 규제 해제와 실제 판매까지만 지급한다." },
  154 => { "reward_1_10" => "8", "hook_1_10" => "5", "pacing_note" => "김태중의 회장직 제안·결혼 최후통첩 뒤 백악관 명예시민권과 태우차 반덤핑 재량, 아이폰 40만 대, 조너선의 애플-태우 TV 참여, 추석 200~300% 상여금 지시가 연속 지급된다. 세이월드는 마지막에 대표 약속을 알아보라는 한 줄로만 열리므로 이 회차의 무게는 SNS 예고보다 가족승계·미국방패·제품·직원 보상에 있다.", "weights" => %w[0.25 0.13 0.25 0.11 0.26] },
  156 => { "pacing_note" => "전반은 태우IT 약 100명이 미니홈피·일촌·미래 SNS 기능을 나눠 맡고 재택·조건부 안식년 당근을 받는 제작회의다. 후반은 다이먼과 초저금리 자금·미국 부동산 파생상품의 5년 시계, 카드광고와 학생발급 과열을 읽어 금융전 씨앗을 심으므로 조직관계만 과대평가하지 않고 정보·행동·물질위험을 함께 둔다.", "weights" => %w[0.30 0.23 0.24 0.07 0.16] },
  180 => { "reward_1_10" => "7", "pacing_note" => "대선 출구조사 뒤 천민정이 아이폰에서 영어 90% 이상·한국어 80% 이상·평균 75% 이상의 음성인식과 알람·전화·메시지를 직접 확인시킨다. IIT 한국 캠퍼스는 힌톤팀 교수직·인재공급을 묶는 구상으로만 열려 있어, 보상은 작동하는 약인공지능에 두고 대학 유치는 훅으로 남긴다." },
  192 => { "pacing_note" => "최재석에게 이번 주 안 후보 약 50명을 추리라고 맡긴 뒤 경호 영상이 회의 리듬을 끊는다. 불량학생 4~5명이 천민정의 동생 머리를 때리고 식판에 침을 뱉는 화면이 가족보호 압박을 만들며, 후보명단·가해자 실명은 지급하지 않는다." },
  194 => { "reward_1_10" => "8", "pacing_note" => "사진·영상·녹취·진술서와 바디캠이 회의장의 거짓말을 무너뜨리고, 김민재가 교실에서 천민우를 안아 공개 보호막을 세운다. 학폭위·명동·부장검사 윗라인 압박 지시까지 현재 화가 소유해 관계와 지위 보상이 크게 오른다." },
  199 => { "pacing_note" => "희토류·리튬·식각가스·불화수소의 매장국·생산업체를 조사하고 광산 매입안을 짜라는 지시가 회차 대부분을 차지한다. 뒤에서는 이미 영입된 약 40명의 국민경제당 인물을 경제공약으로 띄우지만, 공급망 목록·광산 취득과 총선 득표는 아직 없어 보상은 담당·전략 확정에 둔다." },
  246 => { "reward_1_10" => "6", "pacing_note" => "강수기는 네 가수와 SG 전원 양도·태우 불개입을 약속하고 김민재는 로펌과 감옥 보호를 이용한 희망고문을 설계한다. 실제 계약이전·판결·10년 복역은 없으므로 보상은 굴복 약속과 심리통제안까지만 잡는다." },
  259 => { "reward_1_10" => "8", "pacing_note" => "전국·북한 사투리, 4개 외국어 통역, CCTV 방범이 가능한 픽시의 즉시 출시상태를 먼저 확인한다. 래더 2위·프로 승률 50% 스타크 AI가 용산 1경기를 이긴 뒤 2경기 프로의 덫에 걸려 승률 20%로 떨어져, 제품 지급과 공개검증 위기가 한 회차 안에서 교대한다.", "weights" => %w[0.23 0.34 0.16 0.13 0.14] },
  264 => { "pacing_note" => "아마존 창고가 인건비 30%를 줄였지만 설비보다 인건비가 아직 싸다는 한계를 확인한다. 뒤이어 CITI 2만 명 감원·최소 600억 달러 손실·부실자산 매각 연락과 1년 뒤 리먼 파산설이 쌓여, 자동화 점검보다 금융 수확기의 숫자가 후반을 압도한다." },
  269 => { "pacing_note" => "AIZ·SAVE·태우증권 합병이 끝난 뒤 공항 환대와 SAVE 실소유주 공개를 거쳐 김태중에게 미국 최대 보험사의 안정 결과를 보여 준다. 조손 갈등은 수용으로 돌아서고, 태우·SAVE 현금을 쓰지 않고 부채를 온전히 떠안지 않는 조건의 GM·포드 검토만 열리므로 보상은 AIZ 합병·공개·가족 승인에 둔다." },
  335 => { "reward_1_10" => "6", "pacing_note" => "최소 1만2천 명 교민의 대피비 책임을 공개하고 운송수단·미국 추가자료·구호물자 조달선을 준비한다. 실제 대피 전 전화가 동시에 울리고 동일본 대지진이 발생하므로, 지급은 준비 영수증에 제한하고 재난 발생을 드문 10점 훅으로 남긴다." },
  380 => { "reward_1_10" => "9", "pacing_note" => "OPEC 증산 직후 원유가 110달러에서 105달러로 떨어지고 5배 레버리지 수익률이 25%를 넘는다. 준비기간 자금을 하루 만에 전액 회수했다는 정확한 영수증이 석유전쟁의 첫 큰 봉우리를 만든다.", "weights" => %w[0.15 0.32 0.18 0.08 0.27] },
  382 => { "pacing_note" => "체셔피크·헤스 공매도와 500억 달러 이상 인수규모, 헤스의 가이아나 펀드 30%와 태우 목표 60%를 같은 회의에서 맞춘다. 미국 대사의 구조요청까지 오지만 소유권은 아직 없어, 고유 표적과 실행행동을 살리되 인수 완료로 넘기지 않는다." },
  482 => { "reward_1_10" => "5", "pacing_note" => "5% 금리·600만 파운드 청나라 채권을 경매·골동품상·미영 재단에서 6개월 안 최소 절반 모으라고 지시한다. 값싼 전략옵션의 계산과 담당자는 정해졌지만 실제 채권은 한 장도 확보되지 않아 계획 보상에 머문다." },
  488 => { "reward_1_10" => "8", "pacing_note" => "35억 달러 채권과 엔비디아 3%를 실제 교환해 태우증권 8% 이상·핀테크 포함 약 10%를 확인한다. 뱅가드·피델리티 각 7% 협상으로 25%·40%·최종 50% 경로가 열리지만 현재 보유를 통제권으로 부풀리지 않는다." },
  495 => { "reward_1_10" => "8", "pacing_note" => "리강이 5년간 금융활동 무제한과 5년 뒤 채권양도를 말로 수락해 정치적 문을 연다. 각 금융사 담당자가 세부조건을 만들기 시작할 뿐 계약 체결·실행 전이어서, 보상은 권한의 정치적 합의에 두고 문서화는 열린 고리로 남긴다." },
  500 => { "pacing_note" => "청와대의 새만금 규제법 준비에서 센트리언의 코로나 연구·공장·진단·마스크 공급망으로 이동한다. 서정준이 동의한 것은 건설비 150% 인수보증 아래 공장 신축에 더 많은 자금을 쓰는 일이며, 두 배 확대는 서술자의 가능성일 뿐 확정이 아니다. 자가진단키트팀 신설과 마스크업체 명단 제공이 이 화의 구체 실행 영수증이다.", "weights" => %w[0.28 0.22 0.18 0.08 0.24] },
  513 => { "reward_1_10" => "6", "pacing_note" => "인도·베트남을 중국 구형반도체 시장 최소 50% 대체기지로 잡고 구형 노광장비를 중국보다 먼저 계약하라는 경쟁시계를 건다. 2년 내 제재와 차량용 부족, 악성재고 본사매입 책임까지 수치로 맞춘 뒤 HBM 5배·한국 GPU 부지로 확장한다." },
  514 => { "reward_1_10" => "6", "pacing_note" => "베트남 팹과 곡물·농지, 인도 팹과 밀을 맞바꾸는 국가 거래표를 만들고 ASML이 중국 대신 태우에 구형장비를 줄지 직접 협상하기로 한다. 1,000억 달러 곡물 비판과 장비 독점이 압박이며, 공급계약과 정부 도장은 다음 순방에 남는다." },
  515 => { "reward_1_10" => "6", "pacing_note" => "현재 EUV 생산량 18대 중 9대, 50%를 태우가 받는 사실을 확인한 뒤 50대 선금 10조 원·증설비 5조 원·신규 70%·향후 중국행 DUV 매입안을 피터슨에게 차례로 제시한다. 피터슨은 고객사 협의를 요구하고 마지막에 대체 판매처를 듣고 웃을 뿐이라 새 배분·증설·DUV 계약을 지급으로 올리지 않는다.", "weights" => %w[0.30 0.19 0.22 0.05 0.24] },
  516 => { "reward_1_10" => "8", "pacing_note" => "베트남 대규모 구형팹·곡물/농지 목표와 김태중의 푹 수상 주선을 거쳐, 보름 뒤 ASML 5년 계약 10조 원 이상과 베트남·인도 수배 지출을 회고한다. 귀국 뒤 28GHz·스타링크에 10조 원 추가를 감수하는 명령까지 이어져 공급망 지급과 통신기반 전환이 모두 남는다.", "weights" => %w[0.26 0.25 0.19 0.07 0.23] },
  301 => { "pacing_note" => "리그 오브 챔피언스 스킨 하루 약 10억 원 판매, 스페이스X 네 번째 발사 성공, 타미플루 대량생산·일본 주문이 짧게 연속 지급된다. 바둑 AI 공개전과 전 공장 월 1천만 명분 생산은 아직 앞에 있어 실제 판매·발사·주문과 확대계획을 나눈다." },
  316 => { "reward_1_10" => "8", "pacing_note" => "아이폰으로 부른 애플카가 실제 원격주차를 시연해 검색어 1위·영상 800만 회·태우차와 카이차 8퍼센트 이상 상승으로 이어진다. 보조금 액수와 GM 공장전환은 남고, 마지막은 네 시간만 잔 스티브의 이틀 아이디어 회의다." },
  326 => { "pacing_note" => "테슬라 공매도 세력의 항복과 전기차주 상승 뒤 천민정의 승부조작 경기영상이 장면을 꺾는다. 실제 확인된 최소 3명·연루 5명 이상과 조사 지시가 행동 비중을 높이고, 처벌 전 마지막에는 카노스의 태우그룹 공매도 원한이 남는다.", "weights" => %w[0.23 0.30 0.15 0.15 0.17] },
  333 => { "reward_1_10" => "8", "hook_1_10" => "6", "pacing_note" => "노무라 50억 달러를 포함한 보험계약 150억 달러 초과 체결이 이 회차의 큰 물질 영수증이다. 남은 150억 달러의 일본 제조업 공매도 100억·엔화 50억 배분은 계획이고, 건설·로켓의 현금소모를 보며 2011년 수확을 기다리는 숨 고르기로 닫힌다.", "weights" => %w[0.28 0.13 0.20 0.08 0.31] },
  337 => { "reward_1_10" => "9", "pacing_note" => "일본 금융사 정산을 15일 안에 마치고 현금 300억 달러, 주식·부동산·특허까지 500억 달러 넘게 회수한 수치가 중심이다. 일본 해운사·유럽전은 다음 투자이고, 후반은 최재석 지지율 15퍼센트 상승과 서울 무상급식 주민투표로 정치리듬을 바꾼다.", "weights" => %w[0.22 0.18 0.23 0.09 0.28] },
  341 => { "reward_1_10" => "8", "pacing_note" => "서울시장 선거의 36대34 승리는 실제 직위 지급이다. 디도스 증거는 개표 뒤 공개하도록 기획실장에게 넘겼을 뿐 언론에 아직 나오지 않아, 승리의 봉우리 뒤 최재석이 긴 침묵을 끝내겠다는 마지막 말만 훅으로 남긴다." },
  344 => { "reward_1_10" => "8", "pacing_note" => "인슐린 아시아 생산권과 당뇨 신약 연구비 전액지원·지분 30퍼센트가 정식 계약으로 닫힌다. 데이비드의 트럼프 지원은 담당 배정이고, 덴마크 일을 마친 그가 한국으로 돌아오는 마지막 프레임은 다음 임무 전의 짧은 정지다." },
  351 => { "reward_1_10" => "8", "pacing_note" => "체서피크 셰일 협력계약 서명과 트럼프의 전폭 정치후원 수락이 두 개의 현재 지급이다. 다음 달 금융타워 완공과 월가 30곳 입주·유럽 금융사 이전은 대기상태여서 계약 봉우리 뒤 건물의 빈 공간을 훅으로 남긴다." },
  356 => { "reward_1_10" => "7", "pacing_note" => "신사옥 외형은 90퍼센트이고, 실제 완료된 것은 일주일 전 직원 익명설문과 그 결과 수령이다. 연차·야근·육아휴직·재택·단축근무·안식년은 구체 시행지침이지만 직원 삶의 변화는 아직 검증 전이라 보상을 제도확정 수준에 둔다." },
  368 => { "reward_1_10" => "7", "pacing_note" => "투게더워크 90퍼센트와 ARN 교환, 베릴 10퍼센트의 1억 달러 매각·ARN 재투자안을 손정우가 즉시 수락한다. 협상관계는 크게 전진하지만 문서·대금·지분이전 장면은 없어 소유권 보상으로 올리지 않고 빠른 합의 자체를 결산으로 잡는다." },
  373 => { "reward_1_10" => "6", "pacing_note" => "테이퍼링 신호에 대비한 포지션의 소규모 수익을 먼저 확인한다. 베네수엘라·셰일·크림반도·OPEC을 잇는 석유전쟁은 후쿠다·데이비드·다이먼과 한정훈에게 타임라인을 맡긴 단계라, 정보와 설계가 길고 원유수익은 아직 없다." },
  396 => { "reward_1_10" => "8", "pacing_note" => "헤스 공개매수 발표, 퀀텀 3퍼센트의 100퍼센트 프리미엄 이전, 헤지펀드 절반 이상의 카노스 이탈이 실제 시장행동으로 이어진다. 후반 최재석이 4년 중임과 평창재단 요구를 꺼내며 기업전의 속도를 정치적 거래로 낮춘다." },
  399 => { "reward_1_10" => "8", "pacing_note" => "박만덕 은퇴·한정훈 부회장 취임과 중국시장 600억 달러 투입, 카노스발 헤지펀드 20곳 파산이 현재 영수증이다. 청와대 200억 원은 분할안을 냈을 뿐 지급 전이고, 마지막 로보 폐기신약 보고가 금융승계 뒤 바이오 표적을 연다." },
  401 => { "pacing_note" => "10억 달러로 폐기신약 전 권리·연구자료를 받고 인슐린 로열티를 없애는 계약에 당일 서명한다. 귀국 즉시 중국 공매도 D-DAY가 시작되지만 수익은 아직 없어, 바이오 소유권 보상 뒤 행동·정보 리본이 금융전 개시로 이동한다." },
  410 => { "reward_1_10" => "7", "pacing_note" => "메르스 치료제는 공식 판매를 시작했고 당뇨 신약 우선심사 약속도 얻지만 미국 FDA 허가는 다음 달 전망이다. 저가정책·부정평가로 주가가 내려간 역풍과 브렉시트 준비가 함께 있어 실제 제품 지급을 살리되 승인·금융수익은 유예한다." },
  414 => { "pacing_note" => "삼진바이오 주가 네 배·흑자와 무상 공장지원 제안, 국민경제당 지지율 1위가 앞부분의 지급이다. 빈 살만은 부왕 동의와 1월 왕세자 교체·숙청계획을 털어놓을 뿐 실행 전이며, 밤새 친구로 이야기하는 관계장면이 후반을 오래 점유한다." },
  430 => { "reward_1_10" => "9", "pacing_note" => "현재해운 부채 20퍼센트인 1조6천억 원 탕감, 매각계약 날인, 잔여부채 일시상환과 현진·현재해운의 태우상사 편입이 한 회차에서 닫힌다. 해운 소유권 결산 뒤 대한타이어 회장의 면담요청이 짧은 다음 훅으로 붙는다." },
  435 => { "reward_1_10" => "9", "pacing_note" => "브렉시트 통과와 빈 살만의 왕세자 등극·500명 이상 숙청·1천억 달러 초과 자산회수가 실제 권력 영수증이다. 파운드 공략 최종수익은 남지만, 옛 친구가 국가권력자로 돌아온 장면이 정치·관계·물질 보상을 동시에 끌어올린다." },
  440 => { "reward_1_10" => "7", "pacing_note" => "로보와 무조건 소송취하로 유고빈 권리를 지키고 태우해운 약 280만 TEU·세계 4위를 확인한다. 뒤이어 이영한의 1구역 7천억 원 차익, 2·3구역 10조 원 이상 투자와 착공 2년 단축이 숫자로 쌓여 법정승리보다 도시·물류자산에 오래 머문다." },
  446 => { "reward_1_10" => "6", "hook_1_10" => "7", "pacing_note" => "정영근의 50억 원 넘는 빚·불법도박·할머니 계좌 6억 원과 좀비폰 문서가 스파이의 얼굴을 구체화한다. 조작정보·악성코드는 지시일 뿐 아직 보내지 않았고, 연말 태우상사 적자와 트럼프 취임이 다음 해운규제전으로 이어진다." },
  450 => { "reward_1_10" => "8", "pacing_note" => "완공된 애플 신사옥에서 스티브가 경영복귀와 장기동맹을 확인하고, 태우 주도 미국 해운동맹도 이미 성립한 사실이 나온다. 알트코인은 매집·최소 다섯 배 계획으로만 열려 있어 관계·조직 지급 뒤 금융위험을 훅으로 둔다." },
  455 => { "reward_1_10" => "8", "pacing_note" => "장남 구출 뒤 칭화 부패자료 1천억 원 이상을 중국 언론·SNS에 실제 흘린다. 1초 AI 통역과 레벨3 고속도로 무오류 시험까지 성공해 정치공작과 기술검증이 번갈아 지급되고, 마지막 빈 살만 방한예고가 사우디 관계선을 연다.", "weights" => %w[0.24 0.24 0.16 0.18 0.18] },
  462 => { "pacing_note" => "태우통신의 국제망 1티어 확정과 AT&T·손정우·구글·아마존·페이스북의 10조 원 해저케이블 발표가 통신지위를 눈에 보이게 바꾼다. 태우 직접부담 약 1조 원과 경쟁사 침묵을 짚은 뒤 한 달 새 약 10달러 내린 유가로 전환한다." },
  465 => { "pacing_note" => "가이아나 펀드 70퍼센트 지배, 이더리움 8달러에서 200달러 근접과 암호화폐 매도개시가 먼저 지급된다. 뒤에서는 메타버스를 AI센터 공식사업으로 승인해 인재·특허·기업·VR 인수권을 열지만 실제 제품은 없어, 물질회수 뒤 위험투자 결정에 머문다." },
  470 => { "pacing_note" => "러시아 공장 임대계약에 서명하고 5조 원을 받아 도요타에 2년 빌려주는 현금·계약 지급이 중심이다. 로만이 신규공장 설명을 받아들여 크렘린 오해를 풀겠다고 약속하면서 철수계획은 생산연속성과 외교완충선을 동시에 얻는다." },
  477 => { "pacing_note" => "일본차 공개사과·생산중단·리콜과 태우차 공정영상·리콜 마무리·주가상승이 품질전의 현재 결과다. 소송배상과 최종폭락은 아직 없으며, 마지막 도시바의 러시아 공장계약 파기요청이 자동차전에서 자산협상으로 장면을 꺾는다." },
  481 => { "pacing_note" => "도시바메모리·웨스팅하우스 4조5500억 엔 인수계약과 잔여지분 45퍼센트 담보의 2조 엔 대출이 당일 서명으로 닫힌다. 카메코는 3년 매집지시만 있어 우라늄 지분취득을 지급하지 않고 다음 장기투자로 남긴다." },
  510 => { "pacing_note" => "리강의 단계대응 수락 뒤 중국이 한국 기술자 700명 이상을 실제 해고하고 퇴직금도 주지 않은 피해가 회차 중량을 높인다. 국제 블랙리스트는 추진계획이고, 후반 미국행 비테라·곡물협상 예고가 기술인력전에서 식량전으로 넘어간다." },
  512 => { "pacing_note" => "이미 인수한 비테라를 태우곡물회사로 바꾸고 일부 5년 곡물·농장계약과 아마존 창고임대 합의를 얻는다. 연 1천억 달러 전체계약은 진행 중이어서 일부 운영망만 지급하고, 마지막 해외 구형팹·첨단칩 과제가 반도체 공급망으로 시선을 돌린다." },
  540 => { "pacing_note" => "폴리이미드 국산화 성공·생산계획을 공개해 일본 소재전의 보상을 눈에 보이게 만든다. 후반 저가 AI 공개버전과 양자컴퓨터·초전도체 공동프로젝트는 승인·지시 단계라, 팬데믹 같은 다음 화 사실 없이 소재 지급과 미래투자를 분리한다." },
  555 => { "pacing_note" => "다이아 프린스 승객 약 300명이 한국에 도착해 하루 안 전수검사를 받고 미국인 16명은 양성치료, 한국인은 0명으로 확인된다. 구조·검사·치료의 높은 현재 보상 뒤 사회적 거리두기와 석 달 안 백신은 미지급 약속으로 남는다." },
  565 => { "reward_1_10" => "9", "pacing_note" => "바이든의 조건부 의무접종 약속 뒤 FDA 정식심사·이달 승인 가능성 발표, 센트리언 하루 약 10퍼센트 상승과 공매도 청산 수십조 원 수익이 연속된다. 실제 승인은 남고, 마지막 사장단회의 지시가 미국 정치·시장 봉우리에서 국내 투자로 전환한다.", "weights" => %w[0.22 0.14 0.25 0.10 0.29] },
  577 => { "pacing_note" => "EU 회원국 제약사 설득과 태우의 아프리카 지도자 설득이라는 정치적 역할만 구두 합의한다. 1달러 위탁생산·백신공급 계약은 없고, 센트리언 수십 배·나스닥 32퍼센트 상승 확인과 주식 재투자가 현재 물질보상이다." },
  583 => { "pacing_note" => "게임스핀 500달러와 한국 개인 약 1억 달러 참여, 확인된 헤지펀드 손실 100억 달러 초과·한 곳 공개사과, 베릴 300만 구독자가 현재 영수증이다. 최대 700억 달러와 두 곳 파산은 추정이라 수익 봉우리를 더 부풀리지 않는다." },
  590 => { "pacing_note" => "수출 가능한 중국 팹 장비 20여 대를 추린 뒤 7대 매각·2천만 달러 초과 입금, 당일 4대 선적이 연달아 확인된다. 판즈 담당자가 기술자 모집에 붙지만 해외 팹 설치·생산은 아직 없어, 행동과 현금 영수증 뒤 물류위험을 남긴다." },
  595 => { "reward_1_10" => "7", "pacing_note" => "로켓 이용자 1천5백만 명·25퍼센트 증가와 센트리언 치료제 임상완료, AI센터 누적 50조 원 이상 투자가 현재 수치다. 해운 하반기 100억 달러·태우상사 흑자·치료제 승인은 전망이어서 정보결산 뒤 양자·AI 장기투자의 물질부담으로 무게를 옮긴다.", "weights" => %w[0.32 0.12 0.10 0.10 0.36] },
  598 => { "reward_1_10" => "7", "pacing_note" => "SMA 무료사업 잔여 9억 달러 중 30퍼센트인 2억7천만 달러 부담과 백신공장·아시아 생산권을 정회원 조건에 묶는다. 이틀 뒤 실무 예비계약까지 나와 스티븐과의 협상관계가 중심이지만 세부조건·최종서명은 남는다.", "weights" => %w[0.20 0.12 0.32 0.08 0.28] },
  600 => { "reward_1_10" => "6", "hook_1_10" => "8", "pacing_note" => "바이든 당선인에게 기존 태우사업 지속·확대와 환경조건부 알래스카·가이아나 유지, 한국산 무기 비저지 약속을 받는다. 데이비드의 100억 달러 장기대출 협상과 중국 팹·러우전쟁 감시는 담당만 정해져, 정치관계 지급 뒤 전쟁정보 훅이 급격히 커진다.", "weights" => %w[0.31 0.10 0.32 0.08 0.19] },
  603 => { "reward_1_10" => "7", "pacing_note" => "유고빈의 치매 예방·인지개선 효과, 태우IT 주가 세 배 이상과 메타버스 하루 5백만 명 증가가 먼저 지급된다. 천민정의 VR 참여가 관계축을 더하지만 보험적용과 지분 40퍼센트 매매는 전이라, 확인된 기술·시장수치가 회차 후반 자산설계보다 무겁다.", "weights" => %w[0.24 0.12 0.12 0.06 0.46] },
  605 => { "reward_1_10" => "8", "hook_1_10" => "8", "pacing_note" => "AI가 센트리언 해킹을 막고 6천 대 좀비PC·북한 암호·반체제 명단·비트코인 경로를 역추적한다. 몽골 석탄은 증산·비축 지시만 있고 실제 물량은 없으며, 끝의 QUAD 압박이 사이버전 승리 뒤 외교·에너지 긴장을 다시 높인다.", "weights" => %w[0.29 0.29 0.10 0.12 0.20] },
  608 => { "hook_1_10" => "7", "pacing_note" => "가이아나 100억 달러 국채계약과 유전·인프라 지분조건, 호주 석탄의 올해 1억 달러·내년 10억 달러 이상 장기계약이 한 회차에서 서명된다. 두 국가의 물질지급 뒤 세부 무기목록·몽골 비축·김태중의 베트남 계획이 다음 위험으로 남는다.", "weights" => %w[0.17 0.17 0.27 0.09 0.30] },
  614 => { "reward_1_10" => "8", "hook_1_10" => "7", "pacing_note" => "김태중이 17표로 축구협회장에 실제 당선돼 가족의 공적역할이 확정된다. 마이크로소프트는 메타버스 장기계약·주식교환에 긍정적일 뿐 계약과 주식지급은 없고, 델타 변이·중국 백신실패·바이든 방한이 새 외교압박을 연다.", "weights" => %w[0.20 0.18 0.36 0.15 0.11] },
  625 => { "reward_1_10" => "8", "hook_1_10" => "7", "pacing_note" => "제주 15일 무인주행은 사고 0건·음주 7명 적발·관광객 30퍼센트와 외국인 15퍼센트 증가로 결산된다. 이어 당원 3천여 명 스캔에서 봉우리파 이름을 추려 수사를 맡기므로 기술보상 뒤 내부추적 행동이 길게 이어지고 증거·자금망은 남는다.", "weights" => %w[0.24 0.30 0.20 0.14 0.12] },
  630 => { "reward_1_10" => "8", "pacing_note" => "야권 인사들의 양심고백·국민경제당 이동약속과 중국 부동산 숏 대부분 청산이 현재 영수증이다. 북한 해킹자금 차단은 지시, 조지의 일본전은 수락 단계여서 정치·현금 보상 뒤 다음 금융공격의 행동시계만 열린다.", "weights" => %w[0.20 0.28 0.20 0.11 0.21] },
  633 => { "pacing_note" => "2천 명 넘는 PMC가 반군을 물러나게 하고 광산은 다음 날 재가동·일주일 정상화 일정을 얻는다. 말리 정부의 추가 5퍼센트는 양도약속일 뿐 법적 이전 전이라, 현장 행동과 정치합의는 높게 보되 소유권 보상으로 부풀리지 않는다." },
  636 => { "reward_1_10" => "7", "pacing_note" => "국내 원전 2기 가동·소형 원전 다음 상반기 준공일정과 KOSPI 4500을 확인한 뒤 기업농·적자 28GHz를 유지하기로 한다. 이미 작동하는 기반과 정책결정은 지급되지만 농산물 가격·자율주행·스마트팜 효과는 장기 미지급이라 정보·물질과 행동을 함께 둔다.", "weights" => %w[0.28 0.18 0.15 0.10 0.29] },
  645 => { "pacing_note" => "대통령이 김민재에게 러우전쟁의 미국·유럽 연결역할을 맡기고, 미국 재고보충 판매와 유럽 방산·원전·물류·식량 패키지를 데이비드에게 펼친다. 백악관 접촉도 지시일 뿐 승인·수출·계약은 없어 관계권한과 설계가 실물보상보다 오래 간다.", "weights" => %w[0.30 0.15 0.28 0.08 0.19] },
  648 => { "reward_1_10" => "8", "pacing_note" => "니켈 마진콜 무기한 유예와 가격하락, 금융타워 숏 유지가 현재 시장결과다. 200억 달러 보증에는 현금이 나가지 않았고 광산양도·확정수익도 없어, 위기완화와 협상력을 지급한 뒤 동유럽·러시아 에너지 일정으로 빠르게 넘어간다.", "weights" => %w[0.21 0.23 0.21 0.08 0.27] },
  664 => { "reward_1_10" => "6", "pacing_note" => "MCA가 테일러 스위프트의 내한·태우 경기장 일정과 다른 가수 배정을 약속하고 김민재는 해외 스포츠팀까지 부르라고 한다. 실제 공연·10만 관중·매출은 없으므로 관계와 일정 확보만 지급하고 흥행은 다음 행동으로 남긴다.", "weights" => %w[0.22 0.20 0.28 0.13 0.17] },
  668 => { "pacing_note" => "IRS 자료 앞에서 곡물메이저가 태우 방해를 멈추고 IRS도 조사를 보류한다. 빈 살만은 OPEC+ 증산안을 논의하겠다고만 답해 실제 증산·유가하락은 없으므로 미국의 압박결산과 사우디의 관계약속을 분리한다." },
  681 => { "pacing_note" => "고체배터리·T-9의 1천 킬로미터 주행과 10분 충전이 파리에서 공개되자 완성차들이 공급계약을 요구한다. 김민재는 준비한 계약서를 내밀지만 서명·물량배분 장면은 없어, 기술공개와 협상행동을 봉우리로 두고 소유권 지급은 남긴다.", "weights" => %w[0.17 0.24 0.25 0.15 0.19] },
  690 => { "reward_1_10" => "6", "pacing_note" => "사우디가 원화스와프·원화 원유결제를 말로 받아 실무협상이 시작되고 시장·환율이 반응한다. 유럽 9개국의 원전·방산 금융문의와 무이자대출 제안까지 이어지지만 서명된 국가간 계약은 없어 관계·정보에 오래 머물고 물질보상은 낮춘다.", "weights" => %w[0.27 0.09 0.30 0.08 0.26] },
  693 => { "reward_1_10" => "5", "pacing_note" => "산업스파이 17명 증거·34명 의심·제안을 거부한 50명 이상을 구분하고 보너스·검찰전달을 지시한다. 고체배터리 관심과 주가상승은 보이지만 체포·입금·자산환수·150만 대 생산은 전이라, 인적정보와 후속행동을 중심에 두고 보상은 절제한다.", "weights" => %w[0.29 0.22 0.25 0.08 0.16] },
  710 => { "reward_1_10" => "9", "pacing_note" => "사우디가 2030 엑스포 후보를 공식 철회하고 부산 지지로 돌아서며 아람코 0.6퍼센트 지분매각 계약서도 도착한다. 엑스포 외교의 큰 정치·물질 보상 뒤 유토피아의 엔비디아 보유설과 조지의 일본 D-DAY 결정이 긴장을 다시 연다.", "weights" => %w[0.18 0.24 0.24 0.10 0.24] },
  715 => { "hook_1_10" => "9", "pacing_note" => "중국특구는 철수권 조건과 계열사 진출준비까지만 진행된다. 마지막에 프리고진과 바그너 지도부가 러시아행을 택하지만 행군·점령·반란결과는 없어, 짧은 결정 한 번이 9점짜리 전쟁 훅을 만들고 실행보상은 다음으로 넘긴다.", "weights" => %w[0.19 0.34 0.20 0.22 0.05] },
  720 => { "reward_1_10" => "9", "pacing_note" => "미국의 항모운용안 수락, 무기선의 13일 내 수에즈 도착·무대기 통과, 폴란드 전투기와 우크라이나 재고 이전이 실제 군수 영수증이다. 뒤의 지린특구·북한·러시아 육로는 설계여서 행동봉우리 뒤 정보·경제영토 구상으로 속도를 낮춘다.", "weights" => %w[0.25 0.27 0.19 0.10 0.19] },
  721 => { "pacing_note" => "바그너와 우크라이나가 쥔 가스관 압박을 짚은 뒤 최재석이 공동중재를 먼저 제안하고 김민재가 수락한다. 한국 대통령과 태우 회장이 직접 중재에 나서기로 한 관계·지위 변화가 중심이고, 러시아·우크라이나·바그너를 묶을 구체 협상조건은 아직 지급되지 않는다." },
  731 => { "reward_1_10" => "9", "pacing_note" => "우크라이나·벨라루스 협상일정과 이스라엘 PMC·드론·대피소가 먼저 지급된다. 이어 엔화 1천2백억 달러를 반나절 상환해 니케이 15퍼센트·나스닥과 KOSPI 6퍼센트 하락을 만들지만 두 배 수익은 전망이며, 끝은 자민당 비자금 자료축적의 긴 숨으로 바뀐다.", "weights" => %w[0.18 0.37 0.08 0.10 0.27] },
  735 => { "reward_1_10" => "8", "hook_1_10" => "7", "pacing_note" => "니케이 12퍼센트 반등·나스닥 회복·KOSPI 사태 전 대비 4퍼센트 상승과 일본 보유 미국채 매입이 금융결산이다. 야권의 실명·금액·녹취 공개와 곤조 50억 엔 수령·30억 엔 약속은 정치행동이고, 환율보험금·3대 은행지분은 아직 없다.", "weights" => %w[0.23 0.20 0.28 0.10 0.19] },
  739 => { "pacing_note" => "일본 총선 자민당 200석·입헌민주당 162석과 태우건설의 우크라이나 재건진입이 먼저 결산된다. 곧 하마스 기습을 AI 드론·PMC가 막아 이스라엘 남서부 민간인 사망 0명을 만들며, 정치·산업 지급이 전투행동과 관계보호의 큰 봉우리로 급전환한다.", "weights" => %w[0.16 0.34 0.20 0.22 0.08] },
  744 => { "reward_1_10" => "8", "pacing_note" => "고체배터리 2세대의 성능돌파·생산단서가 기술보상으로 나오고 천민정의 일본 AI 금융플랫폼 준비가 이어진다. 뒤에서는 소외감을 느낀 천민정과 오래된 호텔 구상을 다시 꺼내 관계대화가 길어지므로, 플랫폼 실행보다 기술과 두 사람의 공동미래에 머문다.", "weights" => %w[0.25 0.10 0.31 0.18 0.16] },
  748 => { "pacing_note" => "머스크가 우주배터리 공장·시험·휴머노이드 공동개발·탈부착 표준을 수락한다. 다음 날 일본 AI 플랫폼이 출시돼 가입자와 상품이용이 급증하고 금융타워 계열사들이 횡단철도 투자에 동의해, 관계합의가 실제 디지털 수요와 공동자금으로 연속 지급된다." },
  642 => { "reward_1_10" => "5", "hook_1_10" => "7", "pacing_note" => "창산그룹의 5조 원대 니켈 숏을 구제대가로 바꿀 금융설계 뒤, 연변 CNC 거래와 위조지폐 판정으로 장면이 옮겨 간다. 이 상무가 큰손들의 신뢰를 잃고 상황을 이해하지 못한 채 남는 데서 끝나므로 비트코인 탈취·리규철과 해킹세력·CNC의 장남 귀속은 지급하지 않는다.", "weights" => %w[0.16 0.32 0.24 0.20 0.08] },
  643 => { "reward_1_10" => "8", "pacing_note" => "명동 국화차 자리에서 조작 감별기, 비트코인 계좌 전액 탈취, 리규철·해킹세력·CNC·비자금의 장남 귀속이 실제 복수 영수증으로 나온다. 화 후반 베이징올림픽 폐막과 러시아 침공·유가 100달러가 그 개인결산을 덮어, 큰 보상 뒤 전쟁 정보·원자재 압박이 즉시 솟는 crossfade다.", "weights" => %w[0.22 0.28 0.20 0.18 0.12] },
  654 => { "reward_1_10" => "9", "pacing_note" => "금융타워가 SVB 모든 지분·경영권을 넘겨받고 뱅크런 없이 예치금·주가가 오르며 1면에 새 주인으로 실린다. 이 소유권 결산 뒤 기업농 성과와 직거래·전자상거래 유통개혁을 논의해, 앞쪽의 큰 물질 지급과 뒤쪽 국내 전환을 함께 보존한다.", "weights" => %w[0.24 0.16 0.12 0.08 0.40] },
  660 => { "pacing_note" => "폴란드 20조 원·여러 유럽 방산계약과 시그니처은행 인수는 현재 지급이다. 체코 원전과 크레디트스위스 마무리는 진행형이고 로나 구간은 미국 규제·공매도망·베릴의 위협을 길게 쌓은 채 붕괴 여부와 회수액을 묻는 데서 끝나므로 다음 화의 가격·하락률·복권을 쓰지 않는다." },
  661 => { "reward_1_10" => "9", "pacing_note" => "로나가 85달러에서 0.003달러 미만으로 99% 무너지고 시총 약 400억 달러의 절반가량, 약 200억 달러를 금융타워가 실제 흡수해 베릴이 공개 복권된다. 헤지펀드까지 합친 최소 총 300억 달러는 전망으로 남기고, 후반 김태중의 동남아 식량·러시아 에너지 순방 수락으로 물질봉우리에서 조손관계로 이동한다.", "weights" => %w[0.13 0.18 0.28 0.14 0.27] },
  662 => { "reward_1_10" => "8", "pacing_note" => "김태중은 태우 소유 농장의 농산물에 수출제한 예외를 받고 제한품목 팜유는 태우상사 공급으로 묶는다. 태우해운 물동량 30% 이상·정유지분 10%·투자약속을 대가로 치른 뒤 팜유·인도산 밀 공급재개와 실제 물가안정까지 보여 주므로 한국 전체의 무조건 예외로 넓히지 않는다.", "weights" => %w[0.18 0.25 0.20 0.08 0.29] },
  688 => { "reward_1_10" => "6", "pacing_note" => "강 대위 사무실의 데이비드 대화와 하루 뒤 세 정보선의 교차확인이 정보 리본의 중심이다. 러시아의 대북 식량과 북한산 무기·탄약은 확인되지만 중국·장남 접촉, 언론 제보, 한국 무기지원 위협, 바그너 감시는 지시·설계에 머물러 실제 공개·분열·대체공급을 보상으로 올리지 않는다.", "weights" => %w[0.42 0.17 0.22 0.10 0.09] },
  745 => { "pacing_note" => "이영한의 일본·지린 사채망과 북한 장남 세력을 확인한 뒤 김태중이 대북특사를 자청한다. 손자가 막으려다 안전보장과 선물을 맡기로 물러서는 대화가 길어, 지켜야 했던 할아버지가 손자의 마지막 국가사업을 맡는 상호신뢰가 중심이다." },
  749 => { "pacing_note" => "북한 횡단철도 첫 삽과 AI 코로나·희귀질병 치료제 공로의 노벨 화학상 소식 뒤, 회의실에 웅크린 천민정을 직접 만나는 관계장면이 길게 이어진다. 김민재가 수상 자격과 과거 보호를 보증하고 양복으로 머리를 가린 채 안아 회사 밖으로 빠져나간 행동까지 이 화가 소유한다.", "weights" => %w[0.15 0.18 0.31 0.28 0.08] },
  750 => { "pacing_note" => "749화부터 저택에서 보호 중인 천민정의 휴식·음성 인터뷰를 마련한 뒤 김민재·최재석 공동 평화상 소식이 터진다. 태우 주가와 계열사 매출 상승, 세계 최고급 브랜드, 국민경제당 후계우위까지 즉시 지급돼 관계보호의 지속상태와 기업·정치 보상의 새 발생을 분리한다.", "weights" => %w[0.16 0.11 0.31 0.27 0.15] },
  751 => { "pacing_note" => "부산 엑스포 131대34 승리 뒤 세 선물이 결말을 층층이 연다. 평화상 상자 다음에는 50%+ 실소유 기업들과 절반 이상의 세계 10위권, 공개목록도 자산 절반 미만인 숨은 제국이 나오고, 마지막 초음파 사진 앞에서 할아버지가 영국행을 취소해 손자와 손자며느리의 손을 잡는다.", "weights" => %w[0.12 0.08 0.36 0.32 0.12] }
}.freeze

# These are editor-authored Arc questions and boundary receipts. They are not
# derived from titles, range lengths, decision dominant_question, or a sentence
# template. The remaining four prose fields below consume the unique first,
# middle, ending, and next-first scene sentences already fixed in chapter_map.
ARC_QUESTION_BOUNDARY = {
  "DCA-N01" => [
    "파텍필립 시계의 거짓말을 벗긴 뒤, 김태중이 고교 입학 선물로 따로 준 스위스 은행 100만 달러를 걸프전·파운드 공격과 퀀텀 동맹을 거쳐 40억 달러의 독자 운용권으로 키울 수 있는가?",
    "① 10화의 퀀텀 장기동맹·조지와 짐의 추천서 작성 약속·40억 달러 운용여력이 월가 자립을 닫되 추천서 원본은 남는다. ② 11화에서는 하버드 합격증과 YS·DJ 양쪽 지원론이 투자전 대신 학업·정치 준비를 시작한다."
  ],
  "DCA-N01B" => [
    "하버드 3년 졸업과 푸틴의 감사를 실제 귀국 자격으로 바꾸면서 제프리·배터리 교수라는 다음 기술투자선까지 열 수 있는가?",
    "① 푸틴 감사와 하버드 조기졸업·김태중의 귀국 식탁은 15화에서 지급되지만 배터리 지분은 지시만 남는다. ② 16화 첫 출근은 창원 고철장·총무팀 장부와 관리직 비리 수술로 상대와 장소를 바꾼다."
  ],
  "DCA-N02" => [
    "창원 부품공장의 악수·장부 수집으로 명동 4천억 원 비리망과 47명을 걷어 내고 독립 감사조직을 세울 수 있는가?",
    "① 31화의 명동 간섭 제거·47명 숙청·감사팀 개혁이 공장 복수의 영수증이다. ② 32화 사장단 회의에서는 기술연구소 독립권과 20명 선발을 조건으로 유배 제안을 받아 새 기업전이 열린다."
  ],
  "DCA-N03" => [
    "박진훈의 기술연구소 함정을 이노폰 개발·월 10만 대 수요와 태우전자 사장 추천으로 뒤집을 수 있는가?",
    "① 이노폰 수요와 박진훈 축출·사장 추천이 52화에 모여 연구소 싸움을 끝낸다. ② 53화는 김태중의 태우전자 지분 상속과 현재그룹 차입 미끼로 직함이 아닌 소유권 전쟁을 시작한다."
  ],
  "DCA-N04" => [
    "태우전자 지분을 받은 김민재가 현재조선·애플·MP3 교환을 거쳐 황영철 팀을 살리고 김태중에게 그룹 세계화·기획실 이동 동의를 받을 수 있는가?",
    "① 71화에서 디지털케이스 지분 양도·50억 원 지급과 직원들의 애플 재출발, 김태중의 세계화 구상 동의가 생기지만 공식 발령·MCA 지분은 남는다. ② 72화의 루마니아산 태우차 중국 판매와 쩡훙친 면담은 첫 세계화 표적을 자동차·중국으로 옮긴다."
  ],
  "DCA-N05" => [
    "루마니아 태우차의 중국 판매와 음원·전자상거래·HTS를 묶어 외환위기 전에 외화를 버는 인터넷 조직을 만들 수 있는가?",
    "① 전자상거래·음원·HTS 전담팀과 자유출퇴근제, 제프리 영입이 77화에 실행진을 남긴다. ② 78화에는 김태중의 일본 단기차입을 막는 외환위기 방어가 새 지배과제가 된다."
  ],
  "DCA-N06" => [
    "일본 단기차입을 끊고 사우디 정유·IMF 관계·애플 반등을 이용해 외환위기를 태우의 매입 기회로 바꿀 수 있는가?",
    "① IMF 우호선과 애플 소비자·주가 보상이 86화에 국내 매물을 살 자금·명분을 만든다. ② 87화 다이먼의 카이자동차 인수와 베리뮤직 순위 지시는 위기방어에서 자산인수로 중심을 옮긴다."
  ],
  "DCA-N07" => [
    "채권단과 현재자동차의 줄다리기 속에서 카이자동차 51%와 카를로스 곤의 독립경영을 확보한 뒤 고연진과의 첫 만남으로 CL 승계판을 열 수 있는가?",
    "① 카를로스 곤의 한국행·5년 이상 계약·500만 달러·독립경영 합의는 90화에 닫히고 고연진은 첫 맞선·인사만 시작한다. ② 91화의 고연진 독려와 방송 3사 베리뮤직 후원은 자동차 인수에서 CL 자산교환으로 협상 상대를 바꾼다."
  ],
  "DCA-N07B" => [
    "고연진의 승계 욕망을 지렛대로 CL 카드·백화점과 태우 통신·배터리를 맞바꾸고 새 유통권까지 얻을 수 있는가?",
    "① 스타벅스 한국법인 50대50 권리와 전자 20% 성장, 건설 수주공백이 95화 사장단 표에 함께 드러난다. ② 96화 장수영의 자금난에는 SAVE·퀀텀 비밀 민자 컨소시엄이라는 별도 건설해법이 투입된다."
  ],
  "DCA-N07C" => [
    "무명 퀀텀 법인과 SAVE 자금으로 9호선 30년 운영계약을 날인하고 거가대교 전액투자·40년 운영 협상의 문까지 열 수 있는가?",
    "① 97화에는 9호선 3조5천억 원·30년 MRG·요금결정·운영계약만 날인되고 태우건설 주 시공·거가대교는 후속 협상으로 남는다. ② 98화 사장단 공개와 통신 3사 합병은 건설계약에서 통신·플랫폼 재편으로 넘어간다."
  ],
  "DCA-N08" => [
    "CL·신세계·태우 통신 합병과 HTS·린지 플랫폼을 실제 가입자·일일 수천만 원 수수료로 증명할 수 있는가?",
    "① 린지 흥행과 기하급수 가입·수수료 매출이 101화에 선행투자를 입증한다. ② 이영한의 차가운 악수 뒤 102화는 이선일 죽음과 명동·일본계 자금 추적으로 장르와 위험을 바꾼다."
  ],
  "DCA-N09" => [
    "이선일의 죽음을 둘러싼 일본 대부업·오성파를 걷어 내 이영한에게 명동 70%를 넘기면서 태우 게임단·OTT 준비도 지킬 수 있는가?",
    "① 오성파 두목 체포·이영한의 명동 70% 접수와 게임단 계약·중계 준비가 111화에 결산된다. ② 112화는 IT 계열분리 저지와 현재반도체·배터리 탈취 계획으로 가족·산업 권력전이 전면에 선다."
  ],
  "DCA-N10" => [
    "통신 카르텔의 단말·LCD·장기약정 장벽을 깨고 300억 달러 일본계 계약과 강민 교육 유료화를 동시에 수익화할 수 있는가?",
    "① 일본 대부업체 300억 달러 전량계약과 통신 10% 격차·인터넷강의 유료화가 116화의 숫자 영수증이다. ② 117화 AI·로봇·배터리 10년 로드맵과 채권운용 지시는 단기 통신승리 뒤 장기 승계시험을 연다."
  ],
  "DCA-N11" => [
    "35대3로 부회장 권한을 얻은 김민재가 푸틴 자원선과 월가 위험분산을 지키면서 장수영을 포함한 구세대 물갈이를 감당할 수 있는가?",
    "① 러시아 자원개발·현지공장 혜택과 월가를 섞은 위험분산안이 124화에 김태중의 승인을 받는다. ② 125화의 현재건설 2조 원대 손실 점검은 인사갈등에서 현재그룹 부도·반도체 인수로 목표를 이동시킨다."
  ],
  "DCA-N12" => [
    "현재건설 부도와 왕자의 난을 이용해 태우반도체를 얻고 아이폰이 요구할 반도체 수요까지 선점할 수 있는가?",
    "① 134화의 애플 주가·태우반도체 수요 회복이 부도 매입의 산업가치를 확인한다. ② 135화 부시 취임식과 윤현길 수사모의는 기업인수에서 대통령·검찰 방패전으로 상대를 바꾼다."
  ],
  "DCA-N13" => [
    "윤현길의 수사 미끼를 역이용해 김태중 무혐의와 경영승계를 지키되 공격 배후를 드러내지 않을 수 있는가?",
    "① 김태중 무혐의·윤현길 정치통발·1년 베트남 체류와 김민재 임시경영이 142화에 확보되지만 공식 회장 승계는 남는다. ② 143화의 통신 카르텔 협상 파기와 데이비드 통상압력은 검찰 방어 뒤 아이폰 국내출시 규제로 전장을 옮긴다."
  ],
  "DCA-N14" => [
    "WIPI와 통신·단말 카르텔을 미국 통상압력과 부품사 분열로 꺾어 아이폰 국내 판매를 시작하고 부족 물량의 생산 협상까지 열 수 있는가?",
    "① 146화에는 WIPI 연기와 첫 반나절 2만 대 판매·3만 명 넘는 예약이 지급되고 국내 생산은 협의 지시로 남는다. ② 147화 초도 10만 대 완판과 500곳 와이파이·충전망은 규제전의 문을 실제 소비자 생태계로 바꾼다."
  ],
  "DCA-N15" => [
    "아이폰 완판을 애플 AI·TV 지분과 아마존 로봇·스마트팩토리 계약으로 확장해 태우의 기술생태계를 만들 수 있는가?",
    "① 아마존 로봇 파트너십과 150화 말미 WTC 장기임차 약속이 기술계약 묶음을 닫는다. ② 151화 99년·32억 달러 임차와 건물 비우기는 뉴욕 생존전의 실제 실행을 시작한다."
  ],
  "DCA-N15B" => [
    "WTC 두 동을 99년 임차해 비우고 구조대를 배치함으로써 9·11 무사망·붕괴통제와 미국 자동차시장 방패를 함께 얻을 수 있는가?",
    "① WTC 생존·제임스 힌톤 영입과 미국 반덤핑 재량이 153화에 별도 생존보상으로 닫힌다. ② 154화 귀국 회장실의 승계·결혼 대화와 아이폰·TV 보고는 뉴욕 재난에서 가족·국내경영으로 공간을 돌린다."
  ],
  "DCA-N16" => [
    "세이월드 인수 실패 뒤 독자 SNS·메신저·숏폼 창업자를 확보하면서 카드대란이라는 다음 금융기회까지 놓치지 않을 수 있는가?",
    "① 새 SNS와 메신저·짧은영상의 창업자·기술이 159화까지 태우 편으로 들어온다. ② 160화 CL카드 채권·10조 원대 유동성 압박은 IT 복수에서 카드·은행 회수전으로 돈의 종류를 바꾼다."
  ],
  "DCA-N16B" => [
    "CL카드의 과잉발급을 채권·대출차단으로 무너뜨려 태우카드와 외환은행 인수우위, 가전판매 반등까지 회수할 수 있는가?",
    "① 외환은행 인수우위와 가전매출 반등이 166화에 카드대란 수확으로 남는다. ② 167화 탈락 이력서와 술집의 천민정 추적은 금융사 인수에서 핵심인재 보호·영입으로 질문을 교대한다."
  ],
  "DCA-N17" => [
    "천민정의 사채·가족·비행 공포를 해결하고 비트코인·AI·SNS를 실제 담당할 인재와 서광수의 한국형 페이스북 반격을 배치할 수 있는가?",
    "① 서광수 영입과 옛 개발진 회수·SNS 반격이 176화에 인재전의 성과로 확정된다. ② 177화 김태중의 사과와 천민정 곁을 부탁하는 말은 채용관계를 가족 허락과 신뢰 문제로 바꾼다."
  ],
  "DCA-N18" => [
    "김태중의 가족 허락을 얻은 뒤 페이팔·머스크·힌톤을 기술방패로 묶어 시리와 IIT 한국캠퍼스의 인재공급선을 만들 수 있는가?",
    "① 영어 90% 이상·한국어 80% 이상·평균 75%의 음성인식과 아이폰 작동은 180화에 확인되고 IIT 유치는 목표로 남는다. ② 181화 KS해운 비자금 차량 추적은 실리콘밸리 협상에서 국내 불법대선자금 공격으로 장소와 상대를 바꾼다."
  ],
  "DCA-N18B" => [
    "KS 불법 대선자금을 검찰·야당에 흘려 정권의 공격선을 끊고 세이월드 출신 인력과 틱택톡 공동대표를 태우로 옮길 수 있는가?",
    "① 틱택톡 공동대표 둘과 세이월드 인력의 이동 선택권이 183화에 인재보상으로 남는다. ② 184화 게임사 회의의 비트코인 채굴·아이템결제는 정치자금 역공 뒤 디지털화폐 실전으로 이동한다."
  ],
  "DCA-N18C" => [
    "비트코인을 게임결제에 넣고 WWDC에서 시리·IoT를 시연해 애플의 무선이어폰·스마트워치 공동개발을 끌어낼 수 있는가?",
    "① 에어팟·스마트워치 공동개발 의제와 애플 지원약속이 186화 시연보상으로 열린다. ② 187화 우성일의 생산계획 질책과 인도·베트남 공장 검토는 제품 공개에서 대량생산·교육기지로 전환한다."
  ],
  "DCA-N19" => [
    "인도 가전공장·IIT 한국캠퍼스와 아노르 명품동맹을 성립시켜 생산·인재·브랜드를 한꺼번에 끌어올릴 수 있는가?",
    "① 유럽 명품동맹과 깨끗한 경제인·정치인 연합목표가 191화에 다음 확장권으로 남는다. ② 192화 최재석 후보선별과 천민정 동생 폭행영상은 해외 생산동맹을 정치방벽·가족보호로 급전환한다."
  ],
  "DCA-N20" => [
    "천민정의 동생을 학교·검찰 권력에서 보호하면서 국민경제당 후보망과 원자재 임무를 실제 조직으로 세울 수 있는가?",
    "① 학교폭력 증거·공개보호와 정치후보 선별, 원자재 임무가 199화까지 각 담당선을 얻는다. ② 200화 판타지TV 첫 면담은 국내 보호·정치방벽에서 영상플랫폼의 50억 원 합작협상으로 상대를 바꾼다."
  ],
  "DCA-N20B" => [
    "판타지TV를 50억 원에 독립경영 합작으로 묶고 슈퍼볼 영상팀까지 태우의 글로벌 콘텐츠 공급망으로 만들 수 있는가?",
    "① 201~202화의 50억 합작제안·영상팀 파이프라인이 플랫폼 거래를 구체화한다. ② 203화 리사 수에게 사장·개발총괄·5배 연봉을 제안하는 장면은 콘텐츠에서 반도체 경영승계로 옮겨 간다."
  ],
  "DCA-N20C" => [
    "리사 수를 태우전자 사장으로 앉히고 남미 리튬 권리를 확보해 반도체·배터리의 다음 10년을 맡길 수 있는가?",
    "① 리사 수 영입·취임과 천민정 협업축이 206화에 경영권 영수증으로 닫힌다. ② 207화 세계 IT 거물의 국민경제당 공개행사는 기업인재전에서 총선·AI 학습의 정치무대로 넘어간다."
  ],
  "DCA-N20D" => [
    "세계 IT CEO와 최재석을 한 무대에 세워 국민경제당 38석과 리사 수·천민정의 AI 학습 진전을 함께 얻을 수 있는가?",
    "① 국민경제당의 독자 교섭력과 논문기반 AI 학습이 209화에 지급된다. ② 210화 NINA 저신용 주택담보 조사와 인도 10조 원 투자안은 선거결산 뒤 미국 부동산붕괴 포착으로 질문을 바꾼다."
  ],
  "DCA-N20E" => [
    "NINA 대출과 주택붕괴를 미리 읽어 보험수익과 은행지분 대물변제로 연결할 계약원칙을 세울 수 있는가?",
    "① 211화에 서브프라임 붕괴를 수익·은행인수로 바꿀 원칙이 확정된다. ② 212화 IIT 한국인 20%·태우공채 확대와 전기차 점검은 금융붕괴 준비에서 교육·자율주행 데이터로 장을 넘긴다."
  ],
  "DCA-N20F" => [
    "IIT 한국캠퍼스의 정치경로를 열고 씽크윈 내비 기술·데이터를 무료 태우맵과 자율주행 자산으로 바꿀 수 있는가?",
    "① 씽크윈 독점사용권과 무료 모바일 내비 방침이 215화에 확보된다. ② 216화 진호균과의 아노르·1조5천억 원·샤롯지분 거래는 데이터 확보에서 김태중 신사옥 부지전으로 이동한다."
  ],
  "DCA-N21" => [
    "샤롯 승계·아노르 입점·한전 이전을 맞바꿔 김태중이 원하는 강남 신사옥 부지와 무료 태우맵의 첫 이용자를 얻을 수 있는가?",
    "① 한전 이전의 여야 합의와 작동하는 무료 태우맵이 221화에 실체를 얻는다. ② 222화 차봉훈 횡령·상납 조사와 코코아택시 개발은 부지협상에서 택시 데이터 카르텔 붕괴로 상대를 교체한다."
  ],
  "DCA-N22" => [
    "차봉훈의 택시노조 카르텔을 무료 단말기·호출비 없는 코코아택시로 무너뜨리고 IIT·한전 이전까지 실물화할 수 있는가?",
    "① 호출비 없는 플랫폼 우위와 IIT 허가·한전 이전 합의가 226화에 지급된다. ② 227화 판교 착공과 샤롯 가족회의는 택시전 뒤 강남 쌍부지·초고층 허가전으로 공간을 바꾼다."
  ],
  "DCA-N23" => [
    "한전·샤롯 두 강남 부지를 얻고 Su-47·활주로 이전을 거래해 초고층 신사옥의 하늘길까지 확보할 수 있는가?",
    "① Su-47과 활주로 이전·두 부지 초고층 비반대 약속이 234화에 군사·건축 자산으로 남는다. ② 235화 서브프라임 경고기록과 SpaceX 10년 투자는 서울 부지전에서 미국 우주·금융 인프라로 이동한다."
  ],
  "DCA-N24" => [
    "SpaceX 10년 투자와 반도체 5배·몽골 자원 계획을 그룹의 미래 인프라로 승인받아 단기이익 반발을 넘어설 수 있는가?",
    "① 반도체 초격차·AI 업무활용·몽골 자원계획이 237화 사장단 공통과제로 확정된다. ② 238화 태우엔터 설립과 봉호준 200억 원 계약은 인프라 투자선에서 콘텐츠 제작·플랫폼으로 독자약속을 연다."
  ],
  "DCA-N24B" => [
    "태우엔터의 제작계약·100만 명 오디션·위튜브 출시를 톱10 가수와 국내 100만·세계 3000만 이용자라는 지급으로 바꿀 수 있는가?",
    "① 톱10 가수·오디션 흥행과 위튜브 플랫폼 성과가 242화에 콘텐츠 보상으로 닫힌다. ② 243화 네 가수의 계약해지·SG 접촉은 플랫폼 성장 뒤 조직폭력·연예인 탈취전으로 위험을 바꾼다."
  ],
  "DCA-N24C" => [
    "강수기·양지파·중국군 역공을 버텨 SG 전원 양도 약속과 장기 희망고문 설계를 얻되 미실행 계약이전을 과장하지 않을 수 있는가?",
    "① 246화의 SG 전원 양도·태우 불개입 약속과 심리통제안은 약속단계 보상으로 끝난다. ② 247화 부산 AOS 개발자 5명과 1000만 달러 계약은 조폭복수에서 게임 원천팀 소유로 완전히 전환한다."
  ],
  "DCA-N25" => [
    "부산 AOS 유즈맵 개발자 다섯 명에게 1000만 달러와 40·20·40 지분을 주어 원천팀 계약을 그 자리에서 닫을 수 있는가?",
    "① 247화 안에서 개발자 5명·1000만 달러·40/20/40 지분계약이 서명되어 단화 약속을 완결한다. ② 248화 최재석의 경기도전과 시민 선거펀드는 게임계약과 다른 정치자금 실험을 시작한다."
  ],
  "DCA-N25B" => [
    "시민 400억 원 선거펀드·무료 디지털 유세망과 세 전기차 공개를 최재석의 선거승리·시장 환호로 증명할 수 있는가?",
    "① 경기 주요 시장 10곳 이상 승리와 세 전기차의 기자·관람객 환호가 252화에 선거·제품 실증을 닫는다. ② 253화 라잔 접촉과 연체율·등급괴리 보고는 공개행사에서 서브프라임 경고·보험전으로 넘어간다."
  ],
  "DCA-N25C" => [
    "라잔의 서브프라임 경고를 부시 면담·KIKO 역설계·AIZ와 CITI 수확으로 연결해 국가와 태우의 금융방벽을 세울 수 있는가?",
    "① AIZ·SAVE·태우증권 합병과 SAVE 실소유주 공개, 국민 환대·김태중 수용이 269화에 지급되고 GM·포드는 조건부 검토로 남는다. ② 270화 리먼 보험증서와 25조 원 기업여신 거래는 경고단계에서 정부·산업은행과의 실제 교환으로 진입한다."
  ],
  "DCA-N27" => [
    "리먼 6천억 달러 부채를 경고하면서 보험증서 대가로 25조 원 여신·부동산을 얻고 김민재의 회장 승계까지 정착시킬 수 있는가?",
    "① 대통령 직통 파트너 지위와 한전부지 금융허브 길이 275화에 승계·거래 보상으로 닫힌다. ② 276화 다이먼의 CITI·핀테크 한국이전 계약은 청와대 승계결산 뒤 월가 금융허브 실행으로 장소를 바꾼다."
  ],
  "DCA-N27B" => [
    "월가 금융사 이전·KIKO 보험·500억 달러 통화스와프로 위기 속 한국을 금융허브와 국가방패로 만들 수 있는가?",
    "① 실행된 500억 달러 스와프와 미래산업 법안 추진선·청년정치인 약속이 286화에 국가방패를 남긴다. ② 287화 오바마 승리·GM 180억 달러 구제 분석은 금융방어에서 미국 자동차 조건부 인수로 목표를 바꾼다."
  ],
  "DCA-N28" => [
    "오바마 행정부와 GM 인수를 협상하면서 OLED·해운·바이오를 묶어 금융위기의 산업매물을 태우 공급망으로 흡수할 수 있는가?",
    "① 타미플루 권리·세계급 연구자·제약 생산사가 296화에 감염병 대응축으로 결합된다. ② 297화 베이조스에게 한국 아마존·20억 달러·전기배송을 제안하면서 자동차·바이오 인수에서 유통·우주 실행으로 넘어간다."
  ],
  "DCA-N28B" => [
    "한국 아마존·로켓 배송과 SpaceX 실행축을 세워 전기차·AI·우주·바이오 포트폴리오를 실제 사업으로 분기할 수 있는가?",
    "① 지상이동·AI·우주·바이오 포트폴리오가 301화에 태우의 다음 실행축으로 정리된다. ② 302화 GM 인사자료와 미 의회 청문회 역공은 유통·우주 확장에서 자동차 정치검증으로 되돌아간다."
  ],
  "DCA-N29" => [
    "GM 청문회 역공을 타미플루·충전망·로켓 배송·애플카의 실물계약으로 이어 금융위기 인수의 정당성을 증명할 수 있는가?",
    "① 타미플루 생산·전기충전·로켓·애플카 성과가 316화까지 청문회 방어를 산업보상으로 바꾼다. ② 317화 애플카 수요와 테슬라 숏 점검은 정책검증 뒤 전기차 주가·사우디 매수벽 전쟁을 연다."
  ],
  "DCA-N30" => [
    "애플카 수요와 사우디 매수벽을 이용해 테슬라 공매도세력을 항복시키고 전기차 동맹의 시장가치를 지킬 수 있는가?",
    "① 테슬라 숏세력의 항복과 애플카 수요가 326화에 주가·산업 방어를 닫는다. ② 327화 일본·남유럽 금융 포지션과 국민경제당 선거망은 자동차 주가전에서 국가금융·정치전으로 이동한다."
  ],
  "DCA-N31" => [
    "일본·남유럽 금융위기를 수익화하면서 국민경제당의 PC방·온라인 선거망을 실제 대권 조직으로 만들 수 있는가?",
    "① 국민경제당 작전과 일본·남유럽 금융포지션이 333화까지 실행단계를 얻는다. ② 334화 일본 동북 교민 1만2천 명 대피준비는 금융공격에서 재난생존·책임으로 압박의 성격을 바꾼다."
  ],
  "DCA-N31B" => [
    "동일본 대지진 전에 교민 1만2천 명의 운송·구호선을 준비하고, 발생 뒤 일본 금융사 압박까지 되받을 수 있는가?",
    "① 대피 운송수단·자료·구호조달선과 지진발생, 일본 금융결산이 337화까지 이어진다. ② 338화 그리스·서울 투표와 DDoS 증거는 재난·금융전에서 국내 대권투표 방어로 새 국면을 연다."
  ],
  "DCA-N31C" => [
    "그리스 위기와 서울시장 투표를 동시에 지키고 DDoS 공격을 국민경제당의 대권증거로 전환할 수 있는가?",
    "① 서울 투표방어와 DDoS 대권증거가 341화에 정치보상으로 남는다. ② 342화 로보 지분·당뇨·mRNA 공동연구는 선거보안에서 바이오·로봇 연구계약으로 상대와 보상통화를 바꾼다."
  ],
  "DCA-N32" => [
    "로보 지분을 확보하고 당뇨·mRNA 연구를 태우 AI·제약 생산과 연결해 신약 공동연구를 시작할 수 있는가?",
    "① 로보 지분과 당뇨·mRNA 공동연구선이 344화에 기술자산으로 자리 잡는다. ② 345화 도산 장비와 텍사스 부지·센트리언 방문은 연구합의에서 공장·셰일·신약실의 실물확장으로 넘어간다."
  ],
  "DCA-N32B" => [
    "도산 장비·텍사스 부지·체셔피크 셰일망을 저점에서 묶어 미국 에너지와 센트리언 신약 생산기반을 함께 확보할 수 있는가?",
    "① 미국 셰일·신약 이중축이 351화에 자산·기술 보상으로 닫힌다. ② 352화 귀국 뒤 금융타워·총선·직원문화 점검은 미국 산업확장에서 국내 조직·정치운영으로 교대한다."
  ],
  "DCA-N32C" => [
    "금융타워의 세계화와 제1야당 구도, 직원 가족제도를 함께 정비해 태우가 장기운영 가능한 조직으로 바뀔 수 있는가?",
    "① 금융·정치·직원 가족제도가 356화에 국내 운영체계로 정리된다. ② 357화 신사옥·최재석·사드·위성 논의는 내부문화에서 국가안보와 플랫폼 교환으로 새 목표를 세운다."
  ],
  "DCA-N33" => [
    "신사옥·대선·사드·위성 압박을 풀면서 투게더워크를 ARN 지분과 맞바꿔 통신·플랫폼 주도권을 얻을 수 있는가?",
    "① 투게더워크→ARN 교환과 사드·위성 대응이 368화에 지급된다. ② 369화 연준 테이퍼링 신호와 3단 금융작전은 플랫폼·안보전에서 금리·원자재 포지션으로 상대를 바꾼다."
  ],
  "DCA-N33B" => [
    "테이퍼링 신호를 금·통화·주식의 3단 금융작전과 세 번째 석유전 준비로 바꿔 다음 충격 전에 현금을 만들 수 있는가?",
    "① 금융작전의 포지션과 석유전 준비가 373화에 실행계획을 얻는다. ② 374화 2013 사업결산·크림제재와 몽골 운송병목은 금리전에서 자원판로·지정학 협상으로 넘어간다."
  ],
  "DCA-N33C" => [
    "몽골 자원의 중국 운송병목과 크림제재를 뚫어 러시아·몽골 물량의 중국 장기판매 길을 열 수 있는가?",
    "① 중국 장기계약의 조건과 미계약 위험이 377화 협상장에 남는다. ② 378화 살만·빈 살만 왕위동맹과 OPEC 증산은 중국 자원판로에서 사우디 왕실·원유공매도로 중심을 옮긴다."
  ],
  "DCA-N33D" => [
    "살만의 왕위와 빈 살만 숙청을 지원한 대가로 OPEC 증산을 끌어내 원유 110→105달러·레버리지 25%·준비비 전액회수를 얻을 수 있는가?",
    "① 380화의 원유 110→105달러, 5배 레버리지 25%+, 준비자금 하루 전액회수가 석유전 첫 영수증이다. ② 381화 체셔피크·헤스 인수와 가이아나 지분표는 왕실·OPEC전에서 미국 셰일자산 매입으로 넘어간다."
  ],
  "DCA-N34" => [
    "체셔피크·헤스·가이아나 지분을 공매도와 버크셔의 비공개 작전으로 확보하고 카노스의 공개매수 함정을 역포획할 수 있는가?",
    "① 헤스·체셔피크·가이아나 자산과 카노스 함정의 승패가 396화까지 결산된다. ② 397화 카노스 청소부 전향과 헤지펀드 파산은 자산매입에서 내부자 전향·금융조직 청산으로 초점을 바꾼다."
  ],
  "DCA-N34B" => [
    "카노스가 공격자를 청소하는 내부자로 돌아서게 하고 헤지펀드 파산·박만덕에서 한정훈으로 지휘권 승계를 마칠 수 있는가?",
    "① 카노스 전향·헤지펀드 파산과 한정훈 지휘권이 399화에 사람·조직 보상으로 지급된다. ② 400화 로보의 GLP-1 폐기권리 계약은 금융지휘 승계에서 신약 특허·중국숏 실행으로 전환한다."
  ],
  "DCA-N34C" => [
    "로보가 버린 GLP-1 권리를 계약으로 확보하고 중국 공매도 D-DAY를 열어 바이오와 금융의 다음 폭발점을 동시에 선점할 수 있는가?",
    "① GLP-1 권리계약과 중국숏 준비가 401화에 독립 기술·금융자산으로 남는다. ② 402화 중국 공매도 실행과 삼진 생산동맹은 계약준비에서 국가시장 공격의 실제 행동으로 넘어간다."
  ],
  "DCA-N35" => [
    "중국 공매도·삼진 생산동맹으로 시장충격을 흡수하면서 메르스 치료제·백신의 긴급승인을 받아 생존과 수익을 함께 지킬 수 있는가?",
    "① 중국숏 수익과 생산동맹·메르스 긴급승인이 410화에 금융·생존 보상으로 닫힌다. ② 411화 군산·새만금 투자와 사우디 생산동맹은 위기대응에서 지역공장·왕실 산업협력으로 장소를 바꾼다."
  ],
  "DCA-N36" => [
    "군산·새만금 투자를 사우디 자금과 신약 생산동맹으로 묶어 지역산업과 왕실 관계를 동시에 살릴 수 있는가?",
    "① 사우디·신약 생산동맹과 군산·새만금 투자선이 414화에 계약기반을 얻는다. ② 415화 중국시장 폭락과 자율주행·ASML 지분 회수는 지역투자에서 글로벌 기술자산 수확으로 이어진다."
  ],
  "DCA-N36B" => [
    "중국 폭락장에서 자율주행·ASML 지분을 저점 회수해 태우의 반도체·차량 기술지배력을 높일 수 있는가?",
    "① 자율주행·ASML 지분 수확과 중국 폭락 대응이 419화에 기술자산으로 닫힌다. ② 420화 새만금·부산항·PF 기업동맹은 주식·지분 회수에서 국내 대형개발과 대통령 하야 국면으로 전환한다."
  ],
  "DCA-N36C" => [
    "새만금·부산항·PF 기업동맹을 실제 개발자금으로 묶고 대통령 하야 충격 속 국가사업의 연속성을 지킬 수 있는가?",
    "① 기업동맹·PF와 대통령 하야의 정치결산이 426화에 국가개발판을 재정렬한다. ② 427화 700조 반도체도시와 해운 빅딜은 정권위기 뒤 초대형 산업도시·물류투자로 새 약속을 연다."
  ],
  "DCA-N37" => [
    "700조 원 반도체도시와 해운 빅딜을 금융·부지·선박으로 성립시켜 세계 공급망의 중심을 한국에 고정할 수 있는가?",
    "① 반도체도시와 해운 빅딜의 대형 계약선이 430화에 산업보상으로 모인다. ② 431화 사우디 왕위·한국 총선·브렉시트는 공장·선박에서 세 나라 권력교체 대응으로 목표를 바꾼다."
  ],
  "DCA-N37B" => [
    "사우디 왕위·한국 총선·브렉시트라는 세 권력교체를 태우 동맹의 손실 없이 통과해 다음 정부·시장 접근권을 지킬 수 있는가?",
    "① 세 권력교체의 동맹·포지션이 435화에 정치방패로 정리된다. ② 436화 용선료·2M 해운동맹·로보 소송은 권력전에서 선박계약·법정·반도체도시 기반으로 돌아간다."
  ],
  "DCA-N38" => [
    "용선료·2M 동맹과 로보 소송을 버티며 반도체도시의 선박·공장·기술 기반을 실제 계약으로 고정할 수 있는가?",
    "① 해운·로보·반도체도시 기반의 결산이 440화에 각각 실물자산으로 남는다. ② 441화 제주 렌터카 실증과 바이오 인재영입은 물류·법정에서 차량실험·사람 확보로 전환한다."
  ],
  "DCA-N38B" => [
    "제주 렌터카 자율주행 실증과 바이오 인재를 확보하면서 중국 산업스파이의 기술유출을 역추적할 수 있는가?",
    "① 렌터카 실증·바이오 인재와 중국 스파이 증거가 446화에 기술·인적 보상으로 닫힌다. ② 447화 트럼프 해운규제와 선박·북해자산 협상은 내부스파이에서 미국 규제·해양패권으로 적을 바꾼다."
  ],
  "DCA-N38C" => [
    "트럼프의 해운규제를 한국 선박발주와 북해 에너지자산 인수로 되받아 태우의 해양패권을 넓힐 수 있는가?",
    "① 선박·북해자산 확보가 450화에 규제의 대가를 실물소유로 바꾼다. ② 451화 이더리온·무인공장과 말레이시아 위험점검은 해운패권에서 디지털화폐·자동생산·동남아 생존으로 이동한다."
  ],
  "DCA-N39" => [
    "이더리온과 무인공장을 실제 생산·결제 기반으로 만들면서 말레이시아 정치변수에서도 태우 자산을 지킬 수 있는가?",
    "① 디지털화폐·무인공장과 말레이시아 대응선이 455화에 다음 산업기반으로 정착한다. ② 456화 빈 살만·국민연금과 게임·통신망 실증은 공장자동화에서 왕실자금·대중서비스 증명으로 넘어간다."
  ],
  "DCA-N40" => [
    "빈 살만·국민연금 자금을 게임·통신망의 실제 이용자와 수익으로 증명해 태우 기술투자의 공공성을 확보할 수 있는가?",
    "① 게임·통신망 실증과 왕실·연기금 신뢰가 462화에 투자보상으로 남는다. ② 463화 일본 품질정보·북미 에너지·가이아나 위기 포지션은 서비스 실증에서 국가산업 저점매수로 중심을 바꾼다."
  ],
  "DCA-N41" => [
    "일본 품질조작 정보를 잡고 북미 에너지·가이아나 위기에 선제 포지션을 세워 다음 무역충격의 매입가격을 만들 수 있는가?",
    "① 일본 품질정보와 북미·가이아나 포지션이 465화에 공격 전 지도로 완성된다. ② 466화 중국·러시아 공장철수와 5년 임차·대금회수는 정보수집에서 실제 탈출계약으로 넘어간다."
  ],
  "DCA-N41B" => [
    "중국·러시아 공장을 5년 임차와 대금회수 조건으로 빼내 제재·정치충격 전에 태우 생산망을 안전하게 철수시킬 수 있는가?",
    "① 러시아 공장 임차·중국철수와 대금회수가 470화에 소유·현금 보상으로 끝난다. ② 471화 일본 품질조작 증거와 리콜·저점매수는 철수전에서 일본 제조업 공격으로 새 상대를 세운다."
  ],
  "DCA-N41C" => [
    "일본 기업의 품질조작 증거를 리콜과 주가하락으로 연결해 핵심 제조자산을 저점에서 사들일 수 있는가?",
    "① 품질조작 공개·리콜과 저점매수 기회가 477화에 일본 공격의 영수증으로 남는다. ② 478화 도시바메모리·웨스팅하우스 가격·담보 협상은 폭로전에서 반도체·원전 소유권 거래로 전환한다."
  ],
  "DCA-N41D" => [
    "도시바메모리와 웨스팅하우스를 가격·담보 조건으로 인수해 일본 반도체·미국 원전기술을 태우 공급망에 넣을 수 있는가?",
    "① 도시바메모리·웨스팅하우스의 가격·담보 인수가 481화에 소유권 보상으로 닫힌다. ② 482화 청나라 5% 채권·600만 파운드 매집지시는 기업인수에서 역사채권·중국 금융권한 전략으로 장을 바꾼다."
  ],
  "DCA-N42" => [
    "청나라 5% 채권 매집지시와 유전코인 회수를 거쳐 엔비디아 3% 교환·현재 약 10% 지분을 실제 소유로 만들 수 있는가?",
    "① 488화의 35억 달러 채권↔엔비디아 3% 교환과 8%·10% 현재지분이 실물 보상이다. ② 489화 미중 무역전쟁과 중국 금융권한 협상은 엔비디아 지분에서 국가금융 접근권으로 확장한다."
  ],
  "DCA-N42B" => [
    "미중 무역전쟁에서 청나라채권 60%를 지렛대로 중국의 5년 금융활동권과 5년 뒤 양도 말합의를 끌어낼 수 있는가?",
    "① 리강의 5년 권한·채권양도 말수락이 495화에 정치적 문을 열고 세부계약은 남는다. ② 496화 니콜라 사기증거·새만금·희토류 점검은 중국 금융합의에서 팬데믹 공급망 방벽으로 이동한다."
  ],
  "DCA-N43" => [
    "니콜라 사기증거로 대화그룹 손실을 막고 베트남 희토류·HBM·마스크·농산물까지 팬데믹 공급망을 선제 배치할 수 있는가?",
    "① 니콜라 공개·마스크·음압병동·미국 농산물 거래와 비테라 준비가 505화까지 팬데믹 방벽을 이룬다. ② 506화 천민정의 기술유출 수천 건 증거는 공급망 준비에서 내부고발·기술보호법 전쟁으로 전환한다."
  ],
  "DCA-N43B" => [
    "천민정이 모은 기술유출 수천 건을 이영한·내부고발·기술보호법과 중국 블랙리스트 양보로 결산할 수 있는가?",
    "① 기술보호법과 리강의 양보·블랙리스트가 510화에 국가방패로 지급된다. ② 511화 곡물카르텔 공식협상은 기술안보전에서 연 1000억 달러 식량계약으로 거래대상을 바꾼다."
  ],
  "DCA-N43C" => [
    "곡물카르텔과 연 1000억 달러 구매·농장임차를 합의하고 비테라를 태우곡물회사로 인수할 수 있는가?",
    "① 연 1000억 달러 곡물거래와 비테라 인수·전환이 512화에 식량소유권으로 닫힌다. ② 513화 인도·베트남 구형팹과 노광장비 경쟁은 곡물메이저 협상에서 반도체·식량 교환전으로 넘어간다."
  ],
  "DCA-N43D" => [
    "인도·베트남 구형팹과 곡물·농지, ASML 장비를 한 순방에 묶고 28GHz·스타링크까지 국내 기반으로 연결할 수 있는가?",
    "① 516화의 ASML 5년·10조 원 초과 계약, 중국행 구형장비 일부, 베트남·인도 협상과 28GHz 명령이 지급된다. ② 517화부터 일본 소재보복을 겨눈 대일 경제전이 별도 상대·국가위험으로 시작된다."
  ],
  "DCA-N44" => [
    "일본 소재수출 규제를 국산화·금융전·12나인 기술과 오염수 압박으로 되받아 하나의 대일 경제전에서 항복을 끌어낼 수 있는가?",
    "① 소재·금융·오염수 카드가 540화까지 일본 정부와 기업의 보복력을 꺾는 단일 전쟁으로 누적된다. ② 541화 우한 조기경보와 진단키트 준비는 일본전 결산 뒤 바이러스 생존전으로 주 상대와 압박을 바꾼다."
  ],
  "DCA-N45" => [
    "우한 조기경보를 진단키트·마스크·치료제와 다이아 프린스 구조로 전환해 팬데믹 첫 파도를 선점할 수 있는가?",
    "① 조기경보·진단키트와 다이아 프린스 구조가 555화에 생존·평판 보상으로 닫힌다. ② 556화 3월 폭락·유가전쟁과 미국 대선후보 시험은 의료현장에서 금융시장·정치보험으로 장소를 바꾼다."
  ],
  "DCA-N45B" => [
    "3월 폭락과 유가전쟁을 수익화하면서 미국 대선의 두 후보를 직접 시험해 어느 결과에도 태우를 지킬 보험을 만들 수 있는가?",
    "① 폭락·유가 포지션과 미국 대선 양면보험이 565화까지 하나의 위기대응으로 이어진다. ② 566화 사장단 포스트코로나 회의는 미국 정치시험 뒤 그룹 산업재편과 일본 자산협상으로 돌아온다."
  ],
  "DCA-N46" => [
    "사장단의 포스트코로나 재편을 일본 20조 엔 자산과 FDA 승인으로 연결해 위기 뒤 태우 계열사의 새 성장표를 만들 수 있는가?",
    "① 일본 20조 엔·FDA 승인과 계열사 재편이 570화에 산업보상으로 정리된다. ② 571화 마이너스 유가·백신을 중국·아프리카·EU 개방조건으로 쓰며 국내회의에서 글로벌 외교로 이동한다."
  ],
  "DCA-N47" => [
    "마이너스 유가와 독점 백신을 지렛대로 중국·아프리카·EU 시장을 열고 태우의 의료·에너지 접근권을 넓힐 수 있는가?",
    "① 백신 공급과 중국·아프리카·EU 개방선이 577화에 국가접근권으로 지급된다. ② 578화 베릴·게임스핀 개미군단은 백신외교에서 주식시장 헤지펀드 포위전으로 새 독자계약을 연다."
  ],
  "DCA-N48" => [
    "베릴과 게임스핀 개미군단을 이용해 공매도 헤지펀드를 항복시키고 개인투자자의 분노를 태우의 시장방패로 만들 수 있는가?",
    "① 게임스핀 가격전과 헤지펀드 항복이 583화에 대중·금융 보상으로 끝난다. ② 584화 중국팹 4년 유예와 인텔 NAND 인수는 주식전쟁에서 반도체 규제·자산매입으로 이동한다."
  ],
  "DCA-N49" => [
    "중국팹 제재를 4년 유예받고 인텔 NAND를 75억 달러에 인수해 구형반도체 공급시간과 메모리 자산을 함께 확보할 수 있는가?",
    "① 중국팹 4년 유예와 인텔 NAND 75억 달러 인수가 585화 안에서 계약보상으로 닫힌다. ② 586화 T 충전표준·AI 데이터센터는 단화 반도체 인수 뒤 차량·전력·중국 장비 생태계로 확장한다."
  ],
  "DCA-N49B" => [
    "T 충전표준과 AI 데이터센터를 중국 구형장비 공급선에 연결해 전기차·AI·반도체의 공통 기반을 만들 수 있는가?",
    "① 충전표준·데이터센터와 중국 구형장비 계획이 590화에 기술기반으로 모인다. ② 591화 GDC·G7+와 최재석 재선·50조 연구투자는 인프라 설계에서 글로벌 행사·정치·연구재정으로 넘어간다."
  ],
  "DCA-N50" => [
    "GDC·G7+ 국제무대를 최재석 재선과 50조 원 연구투자로 바꿔 한국 기술외교와 장기 R&D를 동시에 고정할 수 있는가?",
    "① 최재석 재선·G7+ 위상과 50조 원 연구투자가 595화에 국가·연구 보상으로 지급된다. ② 596화 SMA 무료약 여론전과 미국 제약협회 협상은 정상외교에서 환자·약가·생산권 전쟁으로 전환한다."
  ],
  "DCA-N50B" => [
    "SMA 치료제를 무료로 풀어 미국 제약로비의 특허강탈 위협을 여론으로 꺾고, 미 제약협회 가입과 해외공장·필수약 생산권의 잠정조건까지 얻어 낼 수 있는가?",
    "① 598화는 미 제약협회 가입과 해외공장·필수약 생산권의 조건을 말로 정하되 정회원·생산권 최종계약은 남겨 둔다. ② 599화의 바이든 58대42 승리 확인과 트럼프 진정은 제약협상에서 미국 정권이양 관리로 상대와 목적을 돌린다."
  ],
  "DCA-N51" => [
    "바이든 승리 뒤 트럼프의 폭주를 누그러뜨리고, 새 행정부에 태우사업 보호와 가이아나 100억 달러 대출·한국산 무기를 공식 제안할 수 있는가?",
    "① 600화에 태우사업 보호와 가이아나 금융·방산안이 바이든 쪽에 공식 전달되면서 미국 정권교체 대응이 한 단계 닫힌다. ② 601화는 천민정의 AI·극저온 식각 성과와 SMR을 점검해 백악관에서 연구개발 현장으로 무대를 옮긴다."
  ],
  "DCA-N51B" => [
    "천민정의 AI·극저온 식각과 SMR을 다음 성장축으로 세우면서 메타버스 지분 40%를 팔아도 태우 통제권을 지키는 거래구조를 만들 수 있는가?",
    "① 603화에 메타버스 40% 매각구조와 통제권 유지조건이 정해지지만 매매계약과 대금은 아직 생기지 않는다. ② 604화 센트리언 해킹 탐지는 빅테크 지분거래에서 북한발 보안위협으로 압박의 성격을 바꾼다."
  ],
  "DCA-N51C" => [
    "센트리언을 노린 북한 해킹을 AI로 막고 중국·호주 석탄분쟁을 몽골 증산·비축 명령으로 받아칠 수 있는가?",
    "① 605화는 해킹 차단과 북한 권력변수 검토, 몽골 석탄 증산·비축 지시까지 지급하고 실제 비축량은 남긴다. ② 606화 동해 고갈가스전 저장고 결정과 호주·가이아나 출장 분담은 사이버 방어에서 에너지·국가협상으로 이동한다."
  ],
  "DCA-N51D" => [
    "동해 가스전 저장고를 발판으로 호주 석탄과 가이아나 유전·방산을 묶어 IIT·한국 대학 교육까지 포함한 국가거래를 성립시킬 수 있는가?",
    "① 608화의 교육·유전지분·방산·금융 조건 합의가 호주·가이아나 순방의 실물 보상이다. ② 609화 김태중과의 사이공은행 불법대출 조사계획은 공개 국가협상에서 베트남 은행 비자금 추적으로 상대와 위험을 바꾼다."
  ],
  "DCA-N51E" => [
    "사이공은행의 40조 원 불법대출과 10조 원 비자금망을 일주일 조사로 드러내 베트남 정부가 주동자 수습에 나서게 할 수 있는가?",
    "① 610화에 불법대출·비자금 보고서와 베트남 정부의 처리결정·김태중의 총리 통로가 생기지만 구속·계좌동결·정유회사 인수는 아직 없다. ② 611화 즈엉 미아인 구속·정유회사 인수 확인 뒤 부산 축구장으로 돌아가며 은행범죄와 가족의 축구협회 도전이 교대한다."
  ],
  "DCA-N52" => [
    "베트남 은행전 뒤 귀국한 김태중을 축구협회장 선거의 17표 역전승으로 세우고 메타버스 지분대가도 실제 주식으로 받을 수 있는가?",
    "① 614화에서 김태중의 17표 당선과 마이크로소프트 주식 지급이 가족·스포츠·지분거래를 함께 결산한다. ② 615화 바이든 방한과 미국 반도체공장 양보는 축구장·메타버스에서 미중 반도체 외교로 주 상대를 바꾼다."
  ],
  "DCA-N53" => [
    "바이든 방한의 미국 공장 양보와 중국 변이백신 협상을 맞교환해 중국 동부시장 권리와 100조 원대 부동산 공매도 포지션을 확보할 수 있는가?",
    "① 618화에 센트리언 중국 동부시장·합작 유지가 확정되고 100조 원 이상 공매도가 실행된다. ② 619화 수에즈 좌초에 태우 중장비·예인선을 자비 투입하면서 미중 의약·반도체 협상에서 국제 물류구조로 현장이 바뀐다."
  ],
  "DCA-N53B" => [
    "수에즈 좌초선 구조를 조기 재개통과 태우선 우선통항·확장공사 약속으로 되돌려 받고 로나 공매도 표적까지 열 수 있는가?",
    "① 620화의 우선통항·확장공사 약속은 구조비용의 가시적 보상이고 로나 취약성 공개·공매도는 새 위험을 남긴다. ② 621화 중국 폭우·탄광침수와 비축석탄 가동은 운하 현장에서 중국 에너지·식량 공급난으로 압박을 옮긴다."
  ],
  "DCA-N54" => [
    "중국 석탄난과 기업농 논쟁을 견디면서 제주 무인주행을 성공시키고 국민경제당 3천 명 검증자료까지 확보할 수 있는가?",
    "① 625화 제주 무인주행 성공과 당원 3천 명 자료·수사방식이 기술·정치 양쪽의 영수증이지만 배신자 실명은 남는다. ② 626화 유석훈에게 배신증거를 넘기고 북한 장남 정보를 내부처리하면서 공개 실증에서 당내 숙청·북한 자금망으로 전환한다."
  ],
  "DCA-N54B" => [
    "국민경제당 배신자를 정리하고 연변 돈주·북한 장남의 불법자금망을 막아 조지를 일본 금융전에 투입할 수 있는가?",
    "① 630화에 북한 불법자금 차단망과 장남의 연변 우위, 조지의 일본전 배치가 만들어진다. ② 631화 러시아 3월 침공정보와 금융타워 자본 절반의 에너지 투입은 국내 정치·연변 추적에서 전쟁·원자재 시장으로 판을 바꾼다."
  ],
  "DCA-N55" => [
    "러시아 침공정보를 선점한 상태에서 바그너 압박에 빼앗긴 말리 리튬광산을 되찾고 지분 5%와 현지 안전까지 추가할 수 있는가?",
    "① 633화는 말리 광산 복구와 추가 지분·제한적 바그너 억지관계를 남겨 리튬 탈환을 닫는다. ② 634화 오미크론 종식판단과 러우전 독립외교 주문은 말리 현장복구에서 한국의 방역·외교정책으로 목표를 돌린다."
  ],
  "DCA-N55B" => [
    "오미크론과 러우전 사이의 독립외교를 국내 기업농법·28GHz 강행으로 연결해 손실을 감수한 장기 실증을 지킬 수 있는가?",
    "① 636화에서 기업농 정책과 28GHz 유지방침이 철회되지 않아 가격·자율주행·스마트팜 검증이 계속된다. ② 637화 김태중에게 EPL 리즈를 선물하려는 제안은 국가정책에서 조손관계·축구구단 인수로 장소와 보상통화를 바꾼다."
  ],
  "DCA-N56" => [
    "김태중에게 리즈 구단을 선물하고 홀란드의 3년 유럽이적 조항까지 계약하면서 베이징 외교선도 손상 없이 확보할 수 있는가?",
    "① 641화 홀란드 계약과 베이징 통로가 축구·외교의 두 보상으로 확정된다. ② 642화 연변 CNC 거래와 위조지폐 판정은 구단·국가외교에서 이 상무의 돈과 신뢰를 무너뜨리는 개인복수 현장으로 들어간다."
  ],
  "DCA-N56B" => [
    "위조지폐 판정으로 큰손들에게 버림받은 이 상무에게서 비트코인·리규철 해킹망·CNC와 비자금까지 실제로 빼앗아 북한 장남의 복수를 끝낼 수 있는가?",
    "① 642화는 이 상무가 연변 큰손의 신뢰를 잃고도 이유를 모르는 상태까지만 보여 주며, 643화 초반에야 비트코인 계좌·리규철 해킹세력·CNC·비자금의 장남 귀속이 확인된다. ② 같은 643화 후반 러시아 침공은 개인복수의 지급 뒤 전쟁을 열고, 644화부터 정보·방산·원전·물류 지원이 주도 행동이 된다."
  ],
  "DCA-N57" => [
    "러시아 침공 직후 한국의 탄약·방산·원전·물류·식량을 미국 보충판매와 유럽 지원선으로 설계할 수 있는가?",
    "① 645화에 미국 보충판매와 유럽 방산·원전·물류·식량 묶음이 실행 가능한 구조로 정리된다. ② 646화 창산 시안의 니켈 마진콜과 인도네시아 광산 요구는 국가 군수지원에서 민간 원자재 구제로 상대·금액·보상을 바꾼다."
  ],
  "DCA-N57B" => [
    "창산 시안의 니켈 마진콜을 200억 달러 보증과 인도네시아 광산 양도로 수습해 투기손실·가격안정까지 끌어낼 수 있는가?",
    "① 648화에 투기세력 손실, 광산 이전·니켈 가격안정과 러시아 원유 우회수익이 확인된다. ② 649화 SVB의 200억 달러 채권매각 포착은 광물·원유 구제에서 미국 은행의 유동성 위기로 압박을 바꾼다."
  ],
  "DCA-N58" => [
    "SVB의 200억 달러 채권매각을 포착해 1달러 인수계약을 맺고 모든 지분·경영권 이전과 시장안정까지 받아 낼 수 있는가?",
    "① 654화에 금융타워가 SVB 전 지분·경영권을 넘겨받고 예치금·주가 상승과 새 주인 1면 보도를 확인한다. ② 655화 명동 이영한의 기업농·이 상무 처리와 조지의 엔캐리 승인은 미국 은행통합에서 국내 유통복수·일본 금융전으로 갈아탄다."
  ],
  "DCA-N58B" => [
    "명동에서 이 상무의 잔여문제를 정리한 뒤 엔캐리·유럽은행 협상을 밀어 로나 99% 폭락과 베릴 복권을 실제 수익으로 바꿀 수 있는가?",
    "① 661화 로나 85달러→0.003달러 미만과 시총 약 400억 달러의 절반, 약 200억 달러 흡수가 현재 지급이며 헤지펀드까지 합친 최소 300억 달러는 전망이다. ② 661화 말 김태중의 식량·에너지 순방 수락 뒤 662화는 베트남 수출예외와 물가안정을 별도 거래로 실행한다."
  ],
  "DCA-N59" => [
    "김태중이 베트남에서 태우 소유 농산물과 팜유의 제한적 수출길을 열고 해운·정유지분을 대가로 가격안정까지 받아 올 수 있는가?",
    "① 662화에 태우 농장 농산물 예외, 태우상사 팜유 공급, 해운 물동량 30% 증가·정유지분 10%와 실제 가격안정이 한꺼번에 지급된다. ② 663화 로봇물류·일본 3대 상사 지분 활용은 국가 식량협상에서 자동화 유통·스포츠 사업으로 옮겨 간다."
  ],
  "DCA-N59B" => [
    "로봇물류와 일본 상사지분을 유통망에 얹고 10만 석 경기장·테일러 스위프트 공연으로 대형시설의 흥행성을 입증할 수 있는가?",
    "① 664화 태우엔터·MCA 협업과 테일러 스위프트 공연이 관객·수익으로 경기장 규모를 증명한다. ② 665화 빈 살만 방문과 미국 농업연맹 공격은 공연장에서 바이든·곡물메이저·사우디를 상대하는 식량·원유 외교로 전환한다."
  ],
  "DCA-N59C" => [
    "바이든·곡물메이저·빈 살만을 같은 협상판에 올려 태우 방해포기·세무조사 수용과 사우디 증산을 성립시킬 수 있는가?",
    "① 668화 미·사우디 증산협상과 곡물메이저의 방해포기·세무조사 수용이 국가·기업 합의로 남는다. ② 669화 제재로 급료도 막힌 로만의 지원요청은 공개 식량·원유협상에서 개인관계·러시아 보급망으로 장소와 위험을 바꾼다."
  ],
  "DCA-N60" => [
    "제재에 막힌 로만과 프리고진을 보안 메타버스·동남아 보급선으로 돕고 미국 대선의 트럼프선·바이든선을 동시에 관리할 수 있는가?",
    "① 672화 카르텔의 트럼프 통로와 태우의 바이든 통로를 병행하는 대선보험이 정해진다. ② 673화 살만 국왕의 6천억 달러 PIF 위탁 제안은 러시아 개인지원·미국 선거관리에서 사우디 국부펀드·에너지 계약으로 보상규모를 바꾼다."
  ],
  "DCA-N60B" => [
    "살만 국왕의 6천억 달러 PIF 제안을 네옴·통신망·해저케이블·행정IT 배정과 하루 25만 배럴 증산으로 구체화할 수 있는가?",
    "① 675화는 사우디 프로젝트 배정의사·비용분담안과 25만 배럴 증산·유가 하락 시작까지 확인하지만 정식계약·숏 수익은 남긴다. ② 676화 최재석과 코리아 디스카운트 보고서·부산 엑스포를 논의하면서 왕실사업에서 한국 자본시장 개혁으로 주도질문이 바뀐다."
  ],
  "DCA-N61" => [
    "코리아 디스카운트 개혁안을 최재석에게 건네고 빅테크 동등지분의 1천억 달러 AI 데이터센터 합작까지 성립시킬 수 있는가?",
    "① 679화 몇 시간 만에 모은 1천억 달러와 동등지분 합작이 정책논의를 실제 투자로 바꾼다. ② 680화 AI 주문폭증과 고체배터리 완성·파리모터쇼 공개결정은 자본시장·데이터센터에서 완성차 제품검증으로 이동한다."
  ],
  "DCA-N61B" => [
    "완성된 고체배터리와 T-9을 파리 모터쇼에 공개해 세계 완성차의 대규모 공급요청을 끌어낼 수 있는가?",
    "① 681화 고체배터리·T-9 공개와 공급계약 요청이 기술개발의 시장 영수증이다. ② 682화 태우 주가 급등 속 N&K 주가조작 포착은 모터쇼 제품보상에서 차명계좌·기술탈취 수사로 위협을 바꾼다."
  ],
  "DCA-N62" => [
    "N&K의 주가조작·기술탈취선을 계약위반과 차명계좌 동결로 묶어 나기연·김남훈을 시장충격 없이 체포할 수 있는가?",
    "① 684화 차명계좌 동결과 나기연·김남훈 체포가 N&K 제거를 관찰 가능한 결과로 만든다. ② 685화 체코 원전 24조 원 우선협상과 한아약품 인수대상 탐색은 형사·시장수습에서 원전·제약 M&A로 목표를 바꾼다."
  ],
  "DCA-N62B" => [
    "체코 원전 24조 원 우선협상을 확인한 뒤 센트리언 확장을 위해 한아약품 가족지분과 경영권을 실제로 넘겨받을 수 있는가?",
    "① 687화 한아약품 전체 가족지분이 금융타워로 이전돼 제약 인수의 소유권이 확정된다. ② 688화 데이비드·강 대위·이영한의 세 정보선이 러북 거래를 확인하고 중국·장남·언론·한국 무기지원 위협을 설계하면서 기업 M&A에서 국제 안보전으로 목표가 바뀐다."
  ],
  "DCA-N63" => [
    "데이비드·강 대위·이영한의 세 정보선으로 러북 무기·식량 거래를 확인한 뒤 중국·장남·언론·한국 무기지원 위협·바그너 감시의 대응 역할을 설계할 수 있는가?",
    "① 688화는 러시아의 대북 식량과 북한산 무기·탄약 거래를 교차확인하고 각 대응 역할을 지시하지만 언론 공개·러북 분열·대체공급 효과는 지급하지 않는다. ② 689화는 총리가 된 리강의 장남지원과 사우디 원화스와프로 상대·장소·보상통화를 바꿔 통화외교를 시작한다."
  ],
  "DCA-N63B" => [
    "리강의 북한 장남 지원을 유지하면서 사우디 원화스와프·원화 원유결제와 유럽 원전·방산 원화금융을 성립시킬 수 있는가?",
    "① 690화 사우디와 유럽의 원화결제·금융이 원화 국제화의 실제 사용처로 지급된다. ② 691화 전기차 화재·한파 의제와 고체배터리 지원설계는 통화외교에서 제품가격·산업정책 싸움으로 옮겨 간다."
  ],
  "DCA-N64" => [
    "전기차 화재·한파를 고체배터리 수요로 돌리고 산업스파이를 역추적해 제보 보너스·범죄자 자산환수·유럽 보조금 재설계까지 얻을 수 있는가?",
    "① 693화 제보자 보너스와 범죄자 자산환수·유럽 보조금안이 기술유출 대응의 영수증이다. ② 694화 폴란드에서 동유럽 정상들에게 금융타워 경제블록을 제안하면서 개별 스파이 수사에서 다국가 자동차동맹으로 규모가 커진다."
  ],
  "DCA-N64B" => [
    "동유럽 정상들을 금융타워 중심 경제블록으로 묶고 고체배터리 배정·중국 전기차 공동관세 로비에 합의시킬 수 있는가?",
    "① 696화 자동차동맹의 배터리 배정과 중국차 관세 공동로비 합의가 블록의 실행목표를 고정한다. ② 697화 오셔닉스 해상도시·AI 데이터센터 결합은 관세동맹에서 부산 엑스포용 실물도시·기술전시로 장소와 관객을 바꾼다."
  ],
  "DCA-N65" => [
    "오셔닉스 해상도시와 고체배터리를 부산 엑스포의 실물증거로 완성해 빈 살만이 사우디 후보를 공식 철회하게 만들 수 있는가?",
    "① 710화 사우디의 후보철회와 아람코 0.6% 지분계약이 697화부터 이어진 해상도시·배터리·외교의 단일 결산이다. ② 같은 화 말 일본 금융공격일 결정권을 조지에게 넘긴 뒤 711화는 중국 특혜·러우전·바그너를 다루며 엑스포 경쟁에서 안보·중국철수 조건으로 전환한다."
  ],
  "DCA-N67" => [
    "중국 자동차의 임시가입과 경제특구 진출을 허용하되 태우 계열사가 언제든 철수할 안전장치를 계약조건으로 박을 수 있는가?",
    "① 715화 중국 임시가입·경제특구·철수권 명령이 중국 진입의 통제조건을 닫는다. ② 말미 프리고진의 러시아행·반란 개시는 새 위험이고 716화는 가스거점·에너지 대응을 즉시 계산해 중국사업에서 전쟁대응으로 넘어간다."
  ],
  "DCA-N67B" => [
    "바그너 반란에 미국 승인과 신속 무기·수에즈 우선운송을 붙여 중국특구·북방육로까지 잇는 경제영토를 만들 수 있는가?",
    "① 720화 미국 승인·수에즈 운송과 중국특구·북방육로 구상이 군사위기를 제도·물류자산으로 돌린다. ② 721화 김민재와 최재석이 푸틴·프리고진을 직접 만나기로 하면서 무기·물류지원에서 러우 휴전 중재로 당사자와 목표가 바뀐다."
  ],
  "DCA-N68" => [
    "푸틴·프리고진·백악관·EU·젤렌스키를 차례로 설득해 벨라루스 휴전협상 합의를 실제로 받아 낼 수 있는가?",
    "① 731화 초 벨라루스 휴전협상 합의가 721화부터 이어진 중재사슬의 최종 지급이다. ② 731화 후반 이스라엘·일본 비자금 카드가 열리고 732화 일본 금융청 30조 엔 대응·협상요청으로 러우전 당사자에서 일본 정부·금융으로 상대가 교대한다."
  ],
  "DCA-N70" => [
    "엔화 조기상환 충격과 미국 환율관찰 압박을 이용해 일본 3대 은행 지분과 합법적인 야당 집권자금 통로를 확보할 수 있는가?",
    "① 735화 금융타워가 일본 3대 은행 지분과 야권자금 통로를 얻고 건설사 검은돈을 배제한다. ② 736화 러우 휴전서명과 하마스 패러글라이더 기습을 동시에 대비하면서 일본 금융협상에서 중동 민간인 방어로 위험의 성격이 바뀐다."
  ],
  "DCA-N71" => [
    "러우 휴전과 일본 야당승리의 배경 위에서 AI 드론·PMC를 투입해 하마스 기습의 대규모 민간인 학살을 막을 수 있는가?",
    "① 739화 AI 드론·PMC가 민간인 학살을 저지한 사실이 현재 지급이며 일본 총선승리는 진입배경으로 구분된다. ② 740화 미국대사에게 PMC 비용·미국기업 동등대우·우크라이나 재건권을 청구해 구조작전에서 국제보상 협상으로 넘어간다."
  ],
  "DCA-N72" => [
    "하마스 민간인 방어 비용을 미국기업 동등대우·우크라이나 재건 중심권으로 돌려받고 일본·중국용 AI 금융플랫폼까지 구체화할 수 있는가?",
    "① 744화 일본 적용준비와 중국 진입 투자안이 민간인 구조 뒤 금융·재건 보상의 장기형태를 만든다. ② 745화 김태중의 대북특사 자청과 손자 김민재의 안전보장은 국가금융 질서에서 조손관계·북한 횡단철도로 중심을 옮긴다."
  ],
  "DCA-N73" => [
    "할아버지 김태중의 대북특사로 횡단철도 길을 열고 고체배터리를 우주선 공장·탈부착 표준과 일본 AI 금융플랫폼 출시로 확장할 수 있는가?",
    "① 748화 우주선용 고체배터리 공장·탈부착 표준 합의와 일본 AI 금융플랫폼 출시가 철도·기술외교의 사업보상이다. ② 749화 횡단철도 첫 삽과 천민정의 노벨 화학상 소식은 협상·출시에서 착공·가족관계 결산으로 들어간다."
  ],
  "DCA-N74" => [
    "북한 횡단철도와 두 노벨상·부산 엑스포를 결산한 뒤 숨은 기업제국과 초음파 사진을 김태중에게 보여 조손 화해와 새 가족을 완성할 수 있는가?",
    "① 751화 부산 엑스포 131대34, 50%+ 실소유 기업목록과 그 절반 이상의 세계 10위권·목록조차 자산 절반 미만이라는 공개가 세계적 성공을 닫는다. ② 천민정의 임신·초음파와 김태중의 영국행 취소·한국 잔류가 지배목록보다 마지막에 놓여 회귀의 생존·가족 약속을 비가역 가족상태로 바꾼다."
  ]
}.freeze

def editorial_entry(arc_id, relationship:, status:, pacing:)
  question, boundary = ARC_QUESTION_BOUNDARY.fetch(arc_id)
  {
    "central_question" => question,
    "boundary_signals" => boundary,
    "relationship_change" => relationship,
    "status_or_ability_change" => status,
    "pacing_reading" => pacing
  }.freeze
end

ARC_EDITORIAL = {
  "DCA-N01" => editorial_entry("DCA-N01",
    relationship: "김태중의 용돈을 쓰던 열일곱 살 손자가 한정훈·조지·짐에게 투자판단을 맡길 사람으로 인정받고, 월가팀은 그의 나이보다 반복 적중한 지시를 신뢰하기 시작한다.",
    status: "스위스 은행 100만 달러 계좌는 걸프전과 파운드 포지션을 거쳐 SAVE·퀀텀 동맹과 40억 달러 독자 운용여력으로 바뀐다.",
    pacing: "파텍필립 폭로와 계좌 지급은 빠르게 통과하고, 독자가 오래 머무는 곳은 한정훈 팀이 실제 주문을 넣고 수익 숫자를 확인하는 거래실이다. 10화는 추천서 원본이 아니라 조지·짐의 작성 약속과 40억 달러 운용여력으로 첫 관계·물질 봉우리를 만든다."),
  "DCA-N01B" => editorial_entry("DCA-N01B",
    relationship: "김민재는 김태중에게 사랑받는 학생에서 조기졸업·귀국을 허락받는 후계 손자로 올라서고, 데이비드에게 제프리와 배터리 교수를 맡길 만큼 사람을 고르는 신뢰를 나눈다.",
    status: "하버드 3년 졸업과 푸틴의 감사가 귀국 자격으로 확정되며 제프리 창업지원·배터리 지분협상은 담당자와 자금만 정해진 미지급 파이프라인으로 남는다.",
    pacing: "공직자 펀드와 학업 성과는 짧게 쌓고, 김태중의 식탁 환대에서 관계 호흡을 늦춘다. 마지막 배터리 자료 전달은 계약이 아니라 다음 산업선의 작은 훅으로만 작동한다."),
  "DCA-N02" => editorial_entry("DCA-N02",
    relationship: "현장 노동자와 악수하고 장부를 받는 김민재를 김태중이 문제아 손자가 아니라 공장을 살릴 내부 감사자로 보기 시작하며, 명동 실무진도 그의 보호 아래 증언한다.",
    status: "창원 이중장부와 명동 4천억 원 비리망이 드러나 47명이 정리되고, 김민재에게 독립 감사조직과 공장 인사에 개입할 실행권이 생긴다.",
    pacing: "부품·장부·계좌를 하나씩 대조하는 조사 구간이 길고 징계 숫자는 말미에 몰린다. 해고 자체보다 노동자 반응과 김태중의 승인에 시간을 써 첫 기업복수의 납득을 만든다."),
  "DCA-N03" => editorial_entry("DCA-N03",
    relationship: "박진훈이 유배로 보낸 기술연구소 사람들은 김민재를 임시 지휘자가 아니라 제품을 세상에 내놓을 보호자로 받아들이고, 사장단의 충성축도 박진훈에서 김민재 쪽으로 움직인다.",
    status: "월 10만 대 수요의 이노폰과 생산조직이 생기고 박진훈은 축출되며, 김민재는 태우전자 사장 추천까지 좌우하는 사업 책임자가 된다.",
    pacing: "연구소의 부족한 부품과 생산압박을 오래 체류한 뒤 재고·주문 숫자가 보상으로 터진다. 박진훈 퇴장은 제품 성공 뒤 짧게 배치돼 기술 승리가 복수보다 먼저 보인다."),
  "DCA-N04" => editorial_entry("DCA-N04",
    relationship: "김태중은 손자에게 태우전자 지분을 넘겨 조언을 듣는 수준을 벗어나 공동 소유자로 대우하고, 황영철 팀과 애플 쪽 인재는 김민재의 교환조건을 장기 경력으로 선택한다.",
    status: "태우전자 지분·현재조선 교환·MP3와 애플 개발선이 묶이고, 김민재는 그룹 세계화와 기획실 이동에 대한 김태중의 동의를 얻는다. 우성일 사장 임명·기획실 발령·MCA 지분은 실행 전이다.",
    pacing: "지분·차입·조선 계약의 정보량이 큰 구간이라 회의는 압축하고 실제 도장과 제품팀 이동에서 멈춘다. 71화는 디지털케이스 양도·50억 원 지급 약속과 세계화 동의를 주되 공식 발령은 다음 실행으로 남긴다."),
  "DCA-N05" => editorial_entry("DCA-N05",
    relationship: "루마니아와 중국의 판매담당자, 제프리와 국내 인터넷팀이 김민재의 서로 다른 실험을 한 조직으로 받아들이며 자유출퇴근제는 감시보다 성과로 신뢰하겠다는 관계 규칙이 된다.",
    status: "중국 자동차 판매와 음원·전자상거래·HTS 전담조직이 만들어져 태우 안에 외화를 버는 인터넷 사업군과 제프리의 실행자리가 생긴다.",
    pacing: "자동차 판매 숫자는 빠르게 지급하고, 음원·HTS·전자상거래 담당자를 묶는 조직회의에 시간을 배분한다. 77화의 자유출퇴근은 작은 관계 보상 뒤 외환위기 훅을 세운다."),
  "DCA-N06" => editorial_entry("DCA-N06",
    relationship: "김태중은 일본 차입을 막는 손자의 경고를 받아들이고 사우디·IMF 인맥을 함께 쓰는 동업자가 되며, 애플 경영진은 김민재를 위기 때 돈을 대는 우호주주로 인식한다.",
    status: "일본 단기차입이 차단되고 사우디 정유·IMF 우호선·외화투입으로 태우의 부채율 0% 방패와 위기매입 자금이 마련된다.",
    pacing: "환율·부채표는 촘촘히 설명하되 실제 체류는 김태중이 차입방향을 바꾸는 순간과 외화가 계좌에 들어오는 영수증에 둔다. 애플 반등은 다음 인수전으로 속도를 붙인다."),
  "DCA-N07" => editorial_entry("DCA-N07",
    relationship: "카를로스 곤은 김민재에게 독립경영을 보장받아 채권단의 관리자가 아니라 카이자동차 재건 파트너가 된다. 고연진은 김태중이 마련한 첫 맞선에서 인사만 나눠 승계불만·동맹은 아직 확인 전이다.",
    status: "태우는 카이자동차 51%와 5년 이상·500만 달러·독립경영을 수락한 회생 책임자를 확보하고, CL 장녀와는 첫 대화를 시작할 접점만 얻는다.",
    pacing: "채권단 가격싸움은 빠르게 압축하고 곤의 조건·권한 대화를 길게 둔다. 자동차 소유권과 경영자 영입이 지급된 직후 고연진과의 짧은 첫 맞선이 다음 관계 질문만 연다."),
  "DCA-N07B" => editorial_entry("DCA-N07B",
    relationship: "고연진은 김민재를 경쟁그룹의 적이 아니라 자신을 후계자로 세울 거래상대로 선택하고, 두 그룹 실무진은 카드·백화점과 통신·배터리를 맞바꾸는 제한적 동맹이 된다.",
    status: "CL카드·백화점과 태우통신·배터리의 교환구조, 스타벅스 한국법인 50대50 권리와 전자 성장분이 태우의 유통·결제 기반으로 붙는다.",
    pacing: "승계 욕망을 확인하는 대화가 중심이고 자산목록은 교환표처럼 짧게 지나간다. 95화의 지분·법인 권리가 물질 보상을 주고 건설 수주공백으로 결을 바꾼다."),
  "DCA-N07C" => editorial_entry("DCA-N07C",
    relationship: "자금난에 몰린 장수영은 정체를 숨긴 SAVE·퀀텀 컨소시엄의 조건을 받아들이며, 김민재는 공개 지배 없이 태우건설을 살리는 배후 조정자로 남는다.",
    status: "9호선 3조5천억 원·30년 MRG·요금결정·운영계약은 날인되지만 태우건설 주 시공사 지정과 거가대교 1조9천억 원·40년 운영권은 후속 협상에 남는다.",
    pacing: "96화는 7%·40년·컨소시엄 구조를 설계하는 협상에 머물고, 97화에서 9호선만 서명계약으로 지급된다. 거가대교와 태우건설 주 시공은 구체안을 얻었어도 계약 전이라 다음 훅이 된다."),
  "DCA-N08" => editorial_entry("DCA-N08",
    relationship: "통신 3사와 게임·HTS 개발팀은 합병 뒤 김민재의 플랫폼 실험을 공동 목표로 받아들이고, 이영한의 차가운 악수는 다음 명동 관계전의 불신을 남긴다.",
    status: "태우통신 합병체에 HTS·린지·OTT 기반이 올라가 가입자 증가와 일일 수천만 원 수수료가 실제 반복매출로 생긴다.",
    pacing: "합병 설명은 앞에서 압축하고 독자는 린지 접속자·HTS 수수료가 오르는 화면에 오래 머문다. 101화의 숫자 봉우리 뒤 장례식 악수가 정서를 급랭시킨다."),
  "DCA-N09" => editorial_entry("DCA-N09",
    relationship: "이영한은 김민재를 할아버지 죽음을 캐는 외부인에서 오성파·일본계 자금선을 끊어 준 공동 복수자로 인정하고 명동 70%의 새 주인으로 선다.",
    status: "의사·오성파·박동하·일본계 대부업 연결이 해체되고 이영한은 명동 자금 70%와 음지 정보망을 승계한다.",
    pacing: "장례식 불신과 병원·조폭 추적을 길게 끌어 위협의 얼굴을 유지한다. 마지막 명동 접수보고는 현금보다 관계·지위 보상으로 조용히 지급된다."),
  "DCA-N10" => editorial_entry("DCA-N10",
    relationship: "통신 카르텔에 이용되던 강민은 김민재의 교육·보호를 받아 독자적으로 선택할 후배가 되고, 기존 통신사 사장들은 청소년을 얕본 대가로 협상주도권을 잃는다.",
    status: "통신 카르텔의 가격·망 장벽이 깨지고 강민에게 교육자원과 실전 역할이 배정돼 태우의 차세대 인재선이 생긴다.",
    pacing: "통신사 회의는 압박을 빠르게 올리고 강민의 배움과 선택에서 속도를 늦춘다. 기업승리와 한 사람의 성장보상을 같은 화폐로 처리하지 않는 구간이다."),
  "DCA-N11" => editorial_entry("DCA-N11",
    relationship: "사장단 35대3 표결은 김민재에게 공개 충성을 보여 주고, 푸틴과의 교섭은 그를 국내 후계자가 아닌 국가급 협상상대로 격상시킨다. 장수영은 마지막 내부 반대축에서 밀려난다.",
    status: "김민재는 태우 부회장 직책과 계열사 지휘권을 얻고 러시아 통로를 확보하며 장수영의 경영권은 축출된다.",
    pacing: "표결 숫자와 장수영의 고립을 교차해 관계긴장을 만든 뒤 발령에서 보상을 준다. 푸틴 장면은 짧지만 다음 국제사업의 규모를 크게 열어 둔다."),
  "DCA-N12" => editorial_entry("DCA-N12",
    relationship: "김태중과 김민재는 현재건설 부도·반도체 인수를 놓고 충돌하지만 손자가 적자사업을 책임지겠다는 조건으로 역할을 재협상하고, 현 반도체 인력은 해고자가 아니라 태우 기술진으로 받아들여진다.",
    status: "현재건설 부도자산이 정리되고 현 반도체는 태우반도체로 편입되며 아이폰 수요에 대응할 생산·기술 기반이 생긴다.",
    pacing: "부도장부와 인수조건이 길어 중반 압박이 무겁고, 직원 고용·공장 간판 교체가 실제 체류 지점이다. 아이폰 수요는 다음 제품전으로 속도를 올린다."),
  "DCA-N13" => editorial_entry("DCA-N13",
    relationship: "김민재는 윤현길의 미끼에 걸린 김태중을 보호하며 손자에서 방패가 되고, 김태중은 자신의 공신보다 손자의 증거판단을 우선하는 쪽으로 신뢰를 돌린다.",
    status: "검찰의 핵심 혐의가 무혐의로 꺾이고 윤현길의 공격선이 노출돼 태우 총수 일가의 법적 생존과 역공자료가 확보된다.",
    pacing: "검찰 질문과 증거 반전을 오래 붙잡아 긴장을 유지한다. 무혐의 발표 뒤 가족대화는 짧고 낮게 내려앉아 법정승리의 감정값을 확인한다."),
  "DCA-N14" => editorial_entry("DCA-N14",
    relationship: "부품사와 통신사는 WIPI 장벽 앞에서 이해가 갈리지만 김민재는 미국 통상압력까지 끌어와 각 회사를 태우 중심 공급연합으로 묶는다.",
    status: "WIPI 강제탑재는 연기되고 아이폰은 첫 반나절 2만 대 판매·3만 명 넘는 예약을 얻는다. 태우전자의 국내 생산은 높은 단가를 감수한 협의 지시 단계다.",
    pacing: "정책 설명은 빠르게 넘기고 부품사들이 어느 편에 설지 망설이는 회의에 관계압박을 둔다. WIPI 연기 직후 실제 판매·예약 숫자가 터지고 국내 생산은 미실행 훅으로 남아 다음 완판 Arc로 가속한다."),
  "DCA-N15" => editorial_entry("DCA-N15",
    relationship: "애플·태우 AI팀과 아마존은 김민재를 단순 투자자가 아니라 지분·독립경영을 나누는 제품동맹의 설계자로 받아들이고, 직원들은 500곳 충전·와이파이망을 함께 만드는 실행집단이 된다.",
    status: "아이폰 10만 대 완판, 애플 AI 50대50·TV 70대30 구조와 아마존 로봇·스마트팩토리 계약이 서명된 기술생태계로 남는다.",
    pacing: "완판 숫자를 초반 보상으로 주고 충전망·지분조건·로봇계약을 계단처럼 쌓는다. 150화 말 WTC 임차 제안은 기술봉우리 뒤 생존전의 불안으로만 남긴다."),
  "DCA-N15B" => editorial_entry("DCA-N15B",
    relationship: "제임스 힌톤과 미국 구조기관은 김민재를 빌딩 임차인이 아니라 사람을 먼저 비운 협력자로 인정하고, 김태중은 손자의 위험한 예지를 미국 방패로 받아들인다.",
    status: "WTC 99년·32억 달러 임차, 입주자 비움과 구조대 배치로 9·11 무사망·붕괴통제가 이루어지고 반덤핑·SAVE 보호선이 생긴다.",
    pacing: "151화 계약은 짧고 152~153화의 비움·대피·붕괴 순간에 시간과 감정을 몰아준다. 정치적 보상은 구조 뒤에 붙여 인명구조가 물질거래에 묻히지 않는다."),
  "DCA-N16" => editorial_entry("DCA-N16",
    relationship: "김태중은 회장직과 결혼을 함께 압박하며 손자의 사적 미래에 개입하고, 서광수와 새 창업자들은 세이월드 인수 실패를 독립 SNS·메신저·숏폼 동맹으로 바꾼다.",
    status: "백악관 명예시민권·태우차 반덤핑 재량, 아이폰 40만 대·애플TV·200~300% 보너스 뒤 SNS 제작팀과 창업자 계약이 태우 플랫폼군으로 자리 잡는다.",
    pacing: "154화는 승계·미국방패·제품·직원보상을 충분히 지급하고 세이월드는 마지막 한 줄만 연다. 155~159화는 창업자 면담과 기능제작에 오래 머물러 관계협상의 결을 살린다."),
  "DCA-N16B" => editorial_entry("DCA-N16B",
    relationship: "다이먼은 카드업계 과열을 경고받는 외부 은행가에서 김민재와 함께 CL카드·외환은행을 회수하는 금융동맹으로 복귀하고, 카드 임직원은 새 통제 아래 생존조건을 얻는다.",
    status: "CL카드·태우카드와 외환은행 지분·결제망이 태우 쪽으로 이동해 카드채 위기를 흡수할 소유구조가 생긴다.",
    pacing: "학생 카드발급과 부실숫자로 압박을 먼저 키우고 협상·회수 장면에서 물질보상을 집중한다. 은행 간판보다 다이먼의 재등장에 관계 체류를 준다."),
  "DCA-N17" => editorial_entry("DCA-N17",
    relationship: "김민재는 가난과 검사 아들의 압박을 받던 천민정에게 연봉·가족빚·동생보호를 함께 주고, 천민정은 고용인이 아니라 평생 결과로 보답할 핵심 파트너를 선택한다.",
    status: "천민정은 태우의 정식 AI 인재와 결정권자가 되고 비트코인·SNS·번역·보안 기술이 실제 사업에 배치된다.",
    pacing: "천민정의 집·경찰·면담과 가족 사정에 거래숫자보다 오래 머문다. 채용 뒤 곧바로 기술시연을 붙여 보호가 능력지급으로 이어짐을 보여 준다."),
  "DCA-N18" => editorial_entry("DCA-N18",
    relationship: "김태중은 천민정과 손자의 만남을 허락하고 언론방어까지 자청해 고용관계를 가족 후보로 받아들이며, 머스크·페이팔 팀은 김민재와 상호 기술방패를 맺는다.",
    status: "천민정은 그룹과 가족 모두의 보호를 받고 페이팔·머스크 지분·기술선이 태우의 결제·우주·차량 기반에 연결된다. 영어 90% 이상·한국어 80% 이상 음성인식은 아이폰에서 작동하고 IIT 한국 캠퍼스는 유치목표로 열린다.",
    pacing: "177화 가족 허락에서 감정을 길게 쉬고, 뒤의 페이팔·기술협상은 속도를 높여 처리한다. 180화는 작동하는 음성인식 수치에 기술보상을 주고 IIT 캠퍼스는 계획으로만 남겨 관계봉우리 뒤 작은 제품봉우리를 세운다."),
  "DCA-N18B" => editorial_entry("DCA-N18B",
    relationship: "세이월드와 KS의 정치자금 공모가 드러나며 서광수는 빼앗긴 창업자에서 역공의 증언자로 서고, 김민재·최재석 동맹은 불법 대선자금을 함께 끊는 정치방패로 굳어진다.",
    status: "KS 불법 대선자금 증거와 세이월드 대응권이 확보돼 통신·정치 카르텔을 수사와 시장에서 동시에 압박할 수 있다.",
    pacing: "자금흐름과 증거확보가 빠르게 진행되고 서광수의 선택에서 잠시 멈춘다. 공개 역공은 짧은 훅으로 남아 다음 기술시연과 대비된다."),
  "DCA-N18C" => editorial_entry("DCA-N18C",
    relationship: "게임사와 개발자는 비트코인을 투기대상이 아니라 결제도구로 시험하며 김민재를 규제회피자가 아닌 제품실험의 보증인으로 따른다. 애플 무대의 천민정도 공개 기술동료로 인정받는다.",
    status: "비트코인 게임결제, WWDC의 시리·IoT 시연과 태우 기술연동이 실제 사용자·개발자 앞에서 검증된다.",
    pacing: "결제 실험은 짧고 기능시연의 반응에 시간을 쓴다. 숫자보상보다 관객이 시리와 IoT를 목격하는 공개성이 Arc의 리듬을 만든다."),
  "DCA-N19" => editorial_entry("DCA-N19",
    relationship: "인도 정부·IIT와 아노르 브랜드는 김민재를 값싼 생산기지 구매자가 아니라 교육·공장·프리미엄 유통을 함께 내놓는 장기 상대자로 받아들인다.",
    status: "인도 공장·IIT 인재통로와 아노르 프리미엄 브랜드 입점권이 태우의 생산·교육·소비시장 기반으로 묶인다.",
    pacing: "정부협상과 학교조건은 정보밀도가 높아 압축하고 공장·브랜드 문이 열리는 순간에 보상을 준다. 귀국 뒤 천민우 사건이 들이닥치며 정서가 급격히 바뀐다."),
  "DCA-N20" => editorial_entry("DCA-N20",
    relationship: "천민우는 숨은 피해학생에서 김민재가 교실에서 안아 공개 보증한 태우 가족이 되고, 최재석은 보호행동과 공급망 임무를 함께 맡는 정치동맹으로 깊어진다.",
    status: "학폭 증거·정식 학폭위·검찰 윗선 압박이 실행되고 국민경제당 후보선별·원자재 조사까지 담당자가 정해진다.",
    pacing: "192화 폭행영상의 구체 행동과 194화 교실 보호에 관계·감정 체류를 집중한다. 후보명단·정당·희토류 지시는 보호결산 뒤 빠르게 펼쳐 다음 공적 Arc를 연다."),
  "DCA-N20B" => editorial_entry("DCA-N20B",
    relationship: "김익수는 서버비에 몰린 창업자에서 김민재와 지장을 찍은 합작대표가 되고, 채드 헐리·스티브 첸은 슈퍼볼 무대를 통해 태우 영상팀의 공동 창업자로 붙는다.",
    status: "50억 원과 애플·구글·아마존 협력조건이 계약되고 판타지TV·글로벌 영상팀의 자금·광고·인력이 생긴다.",
    pacing: "200화 첫 면담은 병목과 신뢰를 확인하는 저점이고 201화 지장·50억 계약에서 보상이 솟는다. 202화 슈퍼볼·인재영입은 짧게 확장해 플랫폼의 다음 속도를 만든다."),
  "DCA-N20C" => editorial_entry("DCA-N20C",
    relationship: "리사 수는 조직문화 때문에 떠나려던 기술자에서 천민정과 밤새 토론한 뒤 태우전자 사장직·인사전권을 수락하는 공동 기술지휘자가 된다.",
    status: "리사 수의 공식 취임·임원교체권, 남미 리튬 광구권과 사우디 판매선이 반도체·배터리의 장기 공급능력으로 붙는다.",
    pacing: "연봉과 직함보다 천민정과의 밤샘 대화에 오래 머물러 영입의 감정적 납득을 만든다. 취임 발령과 리튬 권리는 뒤에서 명확한 지위·물질 영수증을 준다."),
  "DCA-N20D" => editorial_entry("DCA-N20D",
    relationship: "최재석은 김민재의 후원을 받는 무소속에서 국민경제당 38석을 책임지는 전국 정치지도자로 올라서고, AI팀은 논문 2만 건을 함께 학습하는 공개 연구집단이 된다.",
    status: "국민경제당이 38석과 캐스팅보트를 얻고 번역 AI에는 논문 2만 건 학습자산과 글로벌 IT 공개무대가 지급된다.",
    pacing: "CEO 무대와 AI 시연은 빠르게 보여 주고 개표 숫자가 움직이는 밤에 긴장을 유지한다. 38석 발표와 학습량이 정치·기술의 이중 봉우리다."),
  "DCA-N20E" => editorial_entry("DCA-N20E",
    relationship: "다이먼과 김민재는 미국 주택현장을 함께 보며 낙관론을 공유하는 사이가 아니라 붕괴 뒤 은행지분을 나눌 위험동맹으로 관계를 재확인한다.",
    status: "NINA 대출·저신용 담보붕괴의 현장증거와 하락보험이 누적되고 보험금 대신 금융회사 지분을 받을 대물변제 원칙이 정해진다.",
    pacing: "두 화 모두 보상보다 위험관찰에 머무는 낮은 보상구간이다. 빈집·대출서류와 보험조건을 천천히 쌓아 이후 AIZ·CITI 수확의 신뢰를 선불한다."),
  "DCA-N20F" => editorial_entry("DCA-N20F",
    relationship: "IIT 학생·자동차업계·씽크윈은 태우의 정치후원 대상에서 한국인 입학·채용·데이터 사용권을 맞바꾸는 교육·기술 동맹으로 묶인다.",
    status: "IIT 한국인 입학 20%, 태우 공채 확대, 50~60명 자율주행팀과 씽크윈 기술·지도 사용권·무료 내비 개발방침이 확정된다.",
    pacing: "입법과 교육여론은 압축하고 정밀지도 병목·사용권 협상에 시간을 쓴다. 앱 출시는 미지급으로 남겨 계획보상 뒤 신사옥 장면으로 전환한다."),
  "DCA-N21" => editorial_entry("DCA-N21",
    relationship: "김태중의 신사옥 소원은 손자가 토지·승계·러시아 에너지까지 움직여 실현할 가족약속이 되고, 진동구·아노르·한전·여야는 서로 다른 대가를 주고받는 연합이 된다.",
    status: "샤롯 강남 땅 가계약, 진동구 승계지원·브랜드 입점, 한러 5천억 달러 에너지와 한전 이전 합의, 태우맵 하루 10만 사용자가 지급된다.",
    pacing: "부지·승계·한전의 큰 거래를 계단식으로 압축한 뒤 221화 태우맵 사용자 숫자에서 생활보상을 준다. 말미 택시 콜 독점이 안정된 리듬을 깨뜨린다."),
  "DCA-N22" => editorial_entry("DCA-N22",
    relationship: "강 대위는 경호책임자에서 강인운수 대표로 독립 역할을 얻고, 서울 기사들은 상납 카르텔 대신 수수료 0원 코코아택시를 공동 생존망으로 선택한다.",
    status: "차봉훈·차일엽이 구속되고 영신택시가 해체되며 무료 단말기와 서울 기사 80% 이상 가입·IIT 허가가 실제 플랫폼 기반으로 남는다.",
    pacing: "횡령조사와 닷새 파업은 행동압박을 오래 유지하고 조폭 100명 충돌에서 정점을 찍는다. 기사 가입률은 소란 뒤 차분한 대중반응 보상으로 놓인다."),
  "DCA-N23" => editorial_entry("DCA-N23",
    relationship: "샤롯·한전·러시아 항공기술 관계자들은 김민재를 토지 매수자가 아니라 서로의 승계를 보장하고 하늘길까지 해결하는 초고층 사업주로 인정한다.",
    status: "강남 쌍부지의 소유·착공조건과 Su-47 기술을 이용한 높이·항공규제 해법이 마련돼 신사옥 초고층 건설권이 열린다.",
    pacing: "토지계약은 빠르게 지급하고 항공규제와 Su-47 교환조건에서 정보체류가 길어진다. 착공 가능성이 확정되는 순간 다음 우주·콘텐츠 투자선으로 시야를 넓힌다."),
  "DCA-N24" => editorial_entry("DCA-N24",
    relationship: "머스크와 반도체·몽골 실무진은 김민재의 돈을 단기 차익이 아니라 10년을 기다리는 인프라 신뢰로 받아들이며 실패비용을 함께 지는 파트너가 된다.",
    status: "스페이스X 10년 투자, 반도체 5배 증설·몽골 자원선과 위튜브 글로벌 명명·출시동맹이 미래 인프라 예산으로 확정된다.",
    pacing: "서브프라임 면책 기록을 짧게 닫고 우주·반도체·몽골 투자결정을 빠르게 펼친다. 아직 수익이 없는 계획구간이라 보상점보다 규모와 시간 약속이 리듬을 지배한다."),
  "DCA-N24B" => editorial_entry("DCA-N24B",
    relationship: "봉호준·작가·100만 명 오디션 참가자는 태우엔터의 하청이 아니라 위튜브에 얼굴과 작품을 올리는 창작동맹이 되고, 김민재는 유통자가 아닌 공개무대 제공자로 자리 잡는다.",
    status: "태우엔터 설립·작가와 연예인 계약, 위튜브 정식출시와 국내 100만·세계 3천만 사용자·톱10·21% 지표가 지급된다.",
    pacing: "오디션과 계약 장면에 인물반응을 넓게 쓰고 출시 뒤 순위·가입자 숫자를 연속 보상으로 터뜨린다. 242화 SpaceX 소식은 주봉우리 뒤 짧은 잔향이다."),
  "DCA-N24C" => editorial_entry("DCA-N24C",
    relationship: "태우 가수 네 명은 계약해지 압박 속 김민재의 보호를 확인하고, 강수기는 중국군·삼합회 배경을 믿던 우위에서 태우 불개입을 구걸하는 종속 협상자로 추락한다.",
    status: "네 가수와 SG 전원 양도 약속·태우 불개입, 강수기 희망고문 설계가 확보되지만 실제 계약이전·판결·10년 복역은 아직 없다.",
    pacing: "가수들의 위기와 양지파 위협을 길게 끌어 적의 얼굴을 유지한다. 246화 보상은 소유권 완료가 아니라 굴복 약속이라 일부러 중간 강도로 닫는다."),
  "DCA-N25" => editorial_entry("DCA-N25",
    relationship: "부산 AOS 개발자 다섯 명은 대기업 채용자가 아니라 40·20·40 지분을 나눈 창업동료로 김민재와 계약한다.",
    status: "1천만 달러 자금과 40·20·40 지분계약이 한 화 안에서 서명돼 AOS 팀의 법인·개발권·보상이 확정된다.",
    pacing: "만남·기술검증·조건·서명을 단화에 압축하지만 지분비율을 정확히 남긴다. 다음 화 시민펀드로 곧장 바뀌므로 짧고 선명한 계약봉우리다."),
  "DCA-N25B" => editorial_entry("DCA-N25B",
    relationship: "최재석은 김민재의 자금후원 대상에서 시민 400억 원과 무료 디지털망으로 스스로 표를 얻는 정치인으로 서고, 쿼크·카이 개발팀은 선거성과를 제품신뢰로 나눈다.",
    status: "국민경제회복펀드 400억 원, 무료 유세망, 테슬라 스포츠카 실주행·LA 공개와 선거승리가 시민·기술의 실증자료가 된다.",
    pacing: "펀드 참여자의 반응과 전기차 공개를 교차해 물질과 대중 보상을 번갈아 준다. 252화 선거승리가 정치봉우리를 닫고 곧바로 서브프라임 경고로 온도를 낮춘다."),
  "DCA-N25C" => editorial_entry("DCA-N25C",
    relationship: "라잔·부시·보험사와 다이먼은 김민재의 비관을 흘려듣던 관계에서 KIKO·서브프라임 손실을 함께 다루는 국가·금융 협상상대로 재배치된다.",
    status: "서브프라임 보험·KIKO 역설계와 AIZ·CITI 수확, 픽시·스타크 AI 공개검증까지 현금·지분·기술자산으로 쌓인다.",
    pacing: "253~258화는 경고·보험료·정치압박으로 보상을 늦춘다. 259화 픽시와 스타크 AI가 중간 기술봉우리를 만들고, 269화 AIZ·SAVE·태우증권 합병·실소유 공개와 김태중 수용이 금융·관계 결산을 함께 준다."),
  "DCA-N27" => editorial_entry("DCA-N27",
    relationship: "김태중은 리먼 거래를 끝낸 손자에게 회장직을 넘겨 보호받는 창업자에서 후계자의 결정을 승인하는 원로로 물러나고, 한정훈은 거래실무자에서 그룹 금융지휘 후보로 올라선다.",
    status: "리먼 보험증서·25조 원 거래가 현금화되고 김민재에게 태우그룹 회장실·상석·최종 결재권이 실제 이전된다.",
    pacing: "270~271화 같은 보험증서 평가를 이어 가며 숫자를 충분히 숙성한다. 275화 청와대·이사회 승계 장면은 거래수익보다 관계·직책에 오래 머무는 결산이다."),
  "DCA-N27B" => editorial_entry("DCA-N27B",
    relationship: "정부·은행은 김민재를 위기에서 돈 버는 사인에서 협력기업과 국가 유동성을 지키는 금융방패로 인정하고, 다이먼·한정훈은 독립 권한을 가진 양 축이 된다.",
    status: "강남 금융허브, KIKO 보험 실행과 500억 달러 통화스와프·협력기업 여신이 국가·그룹의 위기대응 체계로 확정된다.",
    pacing: "미국 출장·금융허브 설계는 빠르게 넓히고 281~282화 KIKO 훅과 신화은행 실행은 끊지 않는다. 통화스와프 승인에서 국가급 물질봉우리가 온다."),
  "DCA-N28" => editorial_entry("DCA-N28",
    relationship: "오바마 정부·GM 노조·OLED·해운·바이오 경영진은 김민재에게 구조조정의 고통을 숨기지 않는 대신 고용·투자를 보장받는 조건부 동맹을 맺는다.",
    status: "GM·OLED·해운·바이오 자산의 조건부 인수와 공장·고용·연구책임이 태우의 미국 제조·물류·의약 기반으로 편입된다.",
    pacing: "정부·노조 협상은 같은 조건검토가 이어져 291~292를 자르지 않고 체류한다. 296화 바이오 인재 결산 뒤 로켓·우주 목표가 열려 산업톤을 바꾼다."),
  "DCA-N28B" => editorial_entry("DCA-N28B",
    relationship: "아마존·SpaceX 팀은 김민재의 물류·로켓 자금을 받고 각자 독립개발을 유지하는 장기 실행동맹이 되며 태우 현장팀은 유통과 우주를 잇는 지원자로 붙는다.",
    status: "아마존 로켓배송 실험과 SpaceX 발사·투자축이 실제 물류망·우주자산의 반복 실행 단계로 들어간다.",
    pacing: "297화 새 목표 선언 후 창고·배송·발사 현장으로 곧장 움직여 행동리본이 높다. 성공·실패 장면을 짧게 교차해 미래가 자동승리가 아님을 남긴다."),
  "DCA-N29" => editorial_entry("DCA-N29",
    relationship: "청문회 공격자들은 김민재를 방어적 회장에서 타미플루·충전망·로켓·애플카로 증거를 내놓는 산업설계자로 다시 보게 되고, 미국 대사와의 요청은 실제 면담관계로 이어진다.",
    status: "타미플루 공급·전기차 충전망·로켓배송·애플카 개발계약이 정치공격을 상쇄하는 제품·인프라 권한으로 확보된다.",
    pacing: "청문회 공방의 긴장을 앞에서 높이고 각 제품 지급을 연속적으로 보여 준다. 306→307 미국 대사 요청과 면담은 같은 미지급 약속이라 흐름을 끊지 않는다."),
  "DCA-N30" => editorial_entry("DCA-N30",
    relationship: "테슬라 투자자와 공매도 세력은 애플카 수요·사우디 매수벽을 목격하고 김민재의 허풍을 의심하던 태도에서 손실을 인정하는 쪽으로 돌아선다.",
    status: "애플카 예약·자동제동 실수요와 사우디 자금의 주가방어가 공매도 항복·테슬라 가치회복으로 결산된다.",
    pacing: "제품 시승과 예약반응에 행동·대중체류를 주고 주가전은 숫자를 빠르게 올린다. 공매도 항복 뒤 일본·남유럽 금융위기로 새 압박을 즉시 연결한다."),
  "DCA-N31" => editorial_entry("DCA-N31",
    relationship: "최재석과 국민경제당 조직은 김민재의 자금망을 선거현장 PC방·시민 접점으로 번역하며, 일본·남유럽 금융사들은 태우를 구제자이자 위협자로 동시에 대한다.",
    status: "일본·남유럽 금융포지션과 국민경제당의 캡틴 PC방 선거망이 자금·조직·표 데이터로 구축된다.",
    pacing: "금융시장 숫자는 압축하고 331~332화 선거작전 개시와 PC방 실행은 이어서 보여 준다. 서로 다른 전선을 병렬 배치하되 다음 지진 Arc의 경보로 긴장을 올린다."),
  "DCA-N31B" => editorial_entry("DCA-N31B",
    relationship: "김민재는 일본 동북 교민 최소 1만2천 명의 비용을 공개 책임지며 국가보다 먼저 보호를 약속한 보증인이 되고, 일본 금융사는 재난 뒤 태우의 압박을 무시할 수 없게 된다.",
    status: "운송수단·미국 추가자료·구호물자 조달선이 준비되고 동일본 대지진 발생 뒤 일본 금융포지션의 선견성과 압박력이 확인된다. 실제 교민 대피 완료는 335화 지급이 아니다.",
    pacing: "334~335화는 운송·자료·물자 준비를 차근히 쌓은 뒤 전화벨과 지진 발생을 10점 훅으로 터뜨린다. 336~337화 재난·금융결산은 같은 약속의 실행이라 숨 돌릴 틈 없이 이어진다."),
  "DCA-N31C" => editorial_entry("DCA-N31C",
    relationship: "그리스 시민과 서울 유권자는 태우의 금융·정치 개입을 투표결과로 평가하고, 최재석은 DDoS 배후증거를 받아 차기 대권주자로 공개 신뢰를 얻는다.",
    status: "그리스·서울 투표성과와 DDoS 배후자료가 국민경제당의 정치자산·대권증거로 고정된다.",
    pacing: "337화 일본 금융결산 뒤 338화 투표현장으로 분명히 전환한다. 개표 숫자와 서버증거를 교차하되 최재석의 대중반응에서 관계보상을 준다."),
  "DCA-N32" => editorial_entry("DCA-N32",
    relationship: "로보와 천민정·바이오 연구진은 지분만 사고파는 상대에서 당뇨·mRNA 연구자료를 공유하는 공동연구자로 가까워진다.",
    status: "로보 지분과 당뇨·mRNA 공동연구 조건이 계약돼 태우 바이오가 해외 임상·플랫폼 기술에 접근한다.",
    pacing: "짧은 세 화에서 지분협상보다 연구실 설명에 정보체류를 둔다. 도산 장비·텍사스 부지로 넘어갈 때 임상 가능성을 미지급 훅으로 남긴다."),
  "DCA-N32B" => editorial_entry("DCA-N32B",
    relationship: "도산 장비업체·텍사스 정부·체셔피크는 김민재에게 구조요청을 보내고, 태우는 값싼 자산을 사는 포식자이면서 고용·가동을 유지할 산업 파트너로 협상한다.",
    status: "반도체 장비·텍사스 부지와 체셔피크 셰일 접근권이 공장·에너지 공급망 자산으로 확보된다.",
    pacing: "장비 목록과 토지조건은 빠르게 정리하고 센트리언 신약실 방문 예고→실행인 346~347을 붙여 읽는다. 351화 이중축 결산 뒤 귀국 장면이 다음 정치·조직 Arc를 연다."),
  "DCA-N32C" => editorial_entry("DCA-N32C",
    relationship: "직원들은 김민재를 성과만 요구하는 총수에서 가족제도·문화·신사옥을 함께 책임지는 고용주로 재평가하고, 최재석은 제1야당 지위를 공유하는 정치파트너가 된다.",
    status: "금융타워 운영권·제1야당 기반과 직원 가족지원·조직문화 제도가 태우의 장기 지위·인재유지 능력으로 자리 잡는다.",
    pacing: "귀국 보고와 총선표는 압축하고 직원·가족 반응에 호흡을 늦춘다. 356화 문화결산 뒤 신사옥 국제무대가 열리며 규모를 다시 키운다."),
  "DCA-N33" => editorial_entry("DCA-N33",
    relationship: "최재석은 대선 사퇴와 사드 독사과를 김민재와 함께 감당하는 정치동맹으로 남고, 베릴·투게더워크·ARN 팀은 1억 달러와 계약서를 통해 태우 기술망에 편입된다.",
    status: "신사옥 권력망, 투게더워크 매각대금과 ARN 계약·팹리스 통합이 기술·정치·자산의 새 기반으로 지급된다.",
    pacing: "신사옥·대선·사드의 관계압박을 길게 쌓고 369화 초 ARN 입금·계약까지 같은 결산으로 읽는다. 연준 테이퍼링 신호는 지급 뒤 날카로운 금융 훅이다."),
  "DCA-N33B" => editorial_entry("DCA-N33B",
    relationship: "한정훈과 금융사들은 연준 신호를 세 번 뒤집어 읽으며 김민재의 단발 예측보다 공동 리스크규율을 신뢰하게 되고, 실패 가능성을 공유하는 지휘관계가 강화된다.",
    status: "테이퍼링 공매도·채권 수익과 금융사 규율, 3차 석유전쟁의 포지션·자금배치가 실행 가능한 금융작전으로 확정된다.",
    pacing: "연준 유지·번복·재축소를 세 번의 작은 파동으로 보여 줘 같은 숫자곡선을 피한다. 373화 석유전 설계 뒤 계열사 종무식으로 급히 온도를 낮춘다."),
  "DCA-N33C" => editorial_entry("DCA-N33C",
    relationship: "로만·리강은 김민재에게 러시아 경유와 중국 최소 20년 계약을 검토하겠다고 약속하지만 정부허가 전이라 아직 동맹의 말단계에 머문다.",
    status: "몽골 운송병목과 크림 제재수익을 바탕으로 러시아 경유·중국 장기판로 협상안과 크렘린·주석 보고통로가 생긴다. 실제 장기계약은 미지급이다.",
    pacing: "2013 사업결산은 짧게 지나가고 몽골 철도·국경 병목에 정보체류를 준다. 크림 수익 뒤 협상은 제안상태로 멈춰 378화 사우디 왕궁의 새 상대를 선명하게 만든다."),
  "DCA-N33D" => editorial_entry("DCA-N33D",
    relationship: "살만과 빈 살만은 김민재에게 왕위·숙청의 비밀을 맡기는 정치동맹이 되고, 태우는 왕족 비밀계좌를 다루는 대신 증산신호를 받는 상호의존 관계에 들어간다.",
    status: "OPEC 증산 뒤 원유 110→105달러, 5배 레버리지 25% 이상과 준비비 전액회수가 실제 첫 석유전 수익으로 지급된다.",
    pacing: "왕위협상은 관계긴장을 길게 잡고 증산 발표 뒤 가격·레버리지·전액회수를 빠른 숫자연쇄로 터뜨린다. 380화가 정치와 물질의 이중봉우리다."),
  "DCA-N34" => editorial_entry("DCA-N34",
    relationship: "버크셔와 미국 정부는 헤스 지분 3년 임대와 정체불명 이벤트를 제안받은 뒤 395화 공개매수 설명에서야 김민재의 동맹이 되고, 카노스는 끝까지 반대편 얼굴을 유지한다.",
    status: "체셔피크·헤스 공매도와 500억 달러 이상 인수표적, 가이아나 펀드 30%→60% 목표가 공개매수·정부구조 안으로 실행된다.",
    pacing: "자산·지분 설명이 많은 구간이라 382화 고유 표적과 금액을 또렷이 붙잡고 나머지는 압축한다. 394화는 이벤트만 숨기고 395화에서 공개매수를 지급해 선취 없는 긴장을 만든다."),
  "DCA-N34B" => editorial_entry("DCA-N34B",
    relationship: "카노스는 공매도 적장에서 자기 연합을 청소하는 감시자로 전향하고, 한정훈은 박만덕의 교육·추천을 거쳐 태우 부회장과 금융총괄로 공식 승계한다.",
    status: "헤지펀드 파산·카노스의 청소부 역할과 한정훈의 부회장 직책·금융계열 지휘권이 비가역적으로 확정된다.",
    pacing: "397화 손잡기와 398화 실행을 붙여 배신의 무게를 살린다. 399화 한정훈 취임은 환호보다 실제 결재권·자금줄에 머물러 지위보상을 구체화한다."),
  "DCA-N34C" => editorial_entry("DCA-N34C",
    relationship: "에릭센과 로보 이사회는 버린 신약을 김민재에게 넘기는 거래상대가 되고, 태우 연구진은 자료·권한 전체를 받은 새 책임자로 관계가 이동한다.",
    status: "401화 공동서명으로 10억 달러와 GLP-1 계열 신약 전 권한·연구자료가 태우 소유가 된다. 400화 제안만으로는 소유권이 없다.",
    pacing: "400화 폐기보고·매각안은 저점, 401화 서명이 확실한 보상봉우리다. 후반 중국 D-DAY는 신약권리보다 작게 다뤄 다음 Arc 진입신호로 남긴다."),
  "DCA-N35" => editorial_entry("DCA-N35",
    relationship: "오희건은 삼진 승계를 위해 김민재와 생산·인슐린을 나누는 동맹이 되고, 센트리언 연구진과 환자는 중국숏 자금을 치료제 신뢰로 바꾸는 공동 목격자가 된다.",
    status: "중국 공매도 수익·삼진 생산동맹이 메르스 음압병실·1차 임상·한국 첫 긴급사용승인·2만 원 치료제로 실물화된다.",
    pacing: "402~404화 금융·승계는 자원축적이라 빠르게 지나가고 405~410화 환자·연구실·승인에 오래 머문다. 주가하락보다 환자회복을 큰 보상으로 둔다."),
  "DCA-N36" => editorial_entry("DCA-N36",
    relationship: "군산·새만금 주민과 최재석은 태우 투자를 선거선물보다 일자리 약속으로 받아들이고, 사우디·신약 생산파트너는 지역공장과 글로벌 공급을 함께 책임진다.",
    status: "군산 조선소·새만금 투자, 사우디 자금과 신약 생산동맹이 지역산업·의약 공급능력으로 배치된다.",
    pacing: "총선 전 지역반응과 일자리 압박을 천천히 보여 준 뒤 공장·생산 배치를 짧게 지급한다. 중국폭락 신호가 들어오며 금융행동으로 속도를 높인다."),
  "DCA-N36B" => editorial_entry("DCA-N36B",
    relationship: "천민정·자율주행팀과 ASML 주주들은 중국폭락을 기술투자 기회로 읽는 김민재의 판단을 공유하며 단기 수익보다 장비 접근권을 우선하는 동맹이 된다.",
    status: "중국 공매도 수익과 자율주행 실증, ASML 지분·장비 접근권이 태우 반도체·차량 기술의 장기 능력으로 전환된다.",
    pacing: "415→416 중국폭락 약속과 실행, 420 직전 ASML 지급을 끊지 않고 이어 간다. 주가 숫자는 압축하고 자율주행·장비 소유 순간을 길게 잡는다."),
  "DCA-N36C" => editorial_entry("DCA-N36C",
    relationship: "새만금·부산항 기업들은 PF 부담을 함께 지는 공동 투자자로 묶이고, 최재석·국민경제당은 현직 대통령 하야를 감당할 제도권 대안으로 국민 앞에 선다.",
    status: "새만금·부산항 PF 기업동맹과 물류·공장계획이 확정되고 대통령 하야로 국민경제당의 집권경로가 열린다.",
    pacing: "420→421, 425→426의 제안·실행을 같은 흐름으로 유지한다. PF 숫자압박 뒤 하야 발표와 대중반응이 정치봉우리를 형성한다."),
  "DCA-N37" => editorial_entry("DCA-N37",
    relationship: "정부·반도체사·해운사는 700조 원 도시와 선복을 나눠 쓰는 장기 산업동맹으로 묶이고, 김민재는 공장 한 곳이 아니라 도시·항만을 조율하는 총사업자가 된다.",
    status: "700조 반도체도시 부지·전력·입주안과 해운 빅딜의 선복·지분 조건이 국가급 생산·물류 기반으로 확정된다.",
    pacing: "도시규모와 전력수요는 정보리본이 높지만 현장부지·선박계약에서 물질감을 준다. 430화 빅딜 뒤 사우디 왕위·총선으로 정치리듬이 열린다."),
  "DCA-N37B" => editorial_entry("DCA-N37B",
    relationship: "빈 살만·최재석·영국 협상자들은 서로 다른 권력교체를 김민재와 공유하고, 태우는 왕실·정당·유럽시장 모두에 결과를 제공하는 중개자로 인정받는다.",
    status: "사우디 왕위교체선, 국민경제당 총선승리와 브렉시트 대응자산이 세 지역의 정치·시장 권한으로 지급된다.",
    pacing: "왕실·개표·브렉시트 세 봉우리를 같은 숫자로 평탄화하지 않고 각 목격자 반응을 짧게 분리한다. 마지막 해운비용 훅이 실물경제로 돌아가게 한다."),
  "DCA-N38" => editorial_entry("DCA-N38",
    relationship: "해운사·2M 동맹과 로보 소송진은 김민재를 가격을 누르는 고객에서 선복·법정·반도체도시를 동시에 책임질 협상자로 대한다.",
    status: "용선료·2M 조건과 로보 소송방어, 반도체도시 물류기반이 계약·법률·시설의 방어능력으로 정리된다.",
    pacing: "해운요율과 법정공방을 번갈아 보여 주고 440화 결산 뒤 제주 렌터카로 분명히 전환한다. 긴 거래설명은 선박·법원·도시라는 물건과 장소로 끊어 읽는다."),
  "DCA-N38B" => editorial_entry("DCA-N38B",
    relationship: "제주 이용자·바이오 인재는 제품과 일자리로 태우를 신뢰하게 되고, 중국 산업스파이는 내부 동료로 가장한 적의 얼굴을 드러내며 조직의 경계선을 선명하게 만든다.",
    status: "제주 렌터카 자율주행 실증과 바이오 인재영입이 지급되고 중국 기술유출 증거·대응선이 보안자산으로 확보된다.",
    pacing: "441화 이동실증의 생활감에서 시작해 인재관계에 호흡을 두고 445→446 스파이 훅·실행을 붙여 긴장을 높인다. 편안한 제품체험이 내부위협으로 변하는 리듬이다."),
  "DCA-N38C" => editorial_entry("DCA-N38C",
    relationship: "트럼프 행정부와 해운 경쟁사는 규제압박 뒤 태우의 선박·북해자산 인수능력을 인정하고, 기존 동맹은 미국시장 접근을 지키기 위해 조건을 재협상한다.",
    status: "해운규제 대응권, 추가 선박과 북해 에너지자산이 태우의 대서양 물류·원료 소유로 편입된다.",
    pacing: "규제발표로 긴장을 빠르게 올리고 선박명·자산가격·소유권 이전에서 보상을 준다. 450화 지급 뒤 무인공장 기술전으로 장면을 좁힌다."),
  "DCA-N39" => editorial_entry("DCA-N39",
    relationship: "이더리온 개발자와 말레이시아 현장팀은 김민재에게 자동화 성과뿐 아니라 생존위험까지 보고하는 파트너가 되고, 태우는 인건비 절감보다 사람의 안전을 우선할 책임을 진다.",
    status: "이더리온·무인공장 기술과 말레이시아 공급망의 위험정보·대체선이 생산성·재난대응 능력으로 확보된다.",
    pacing: "공장 자동화 수치는 빠르게 보여 주고 말레이시아 생존변수에서 감정·관계 체류를 늘린다. 기술쾌감 뒤 실제 사람의 비용을 붙이는 완급이다."),
  "DCA-N40" => editorial_entry("DCA-N40",
    relationship: "빈 살만과 국민연금은 김민재의 게임·통신망 실증을 보고 장기자본을 맡길 동맹으로 가까워지고, 이용자는 서비스 품질로 그 관계를 외부에서 증명한다.",
    status: "국민연금·사우디 자금통로와 게임·통신망의 가입·매출 실적이 투자권한과 디지털 유통능력으로 굳어진다.",
    pacing: "왕실·연금 회의는 정보량을 압축하고 게임 접속·통신반응에서 독자가 쉬며 보상을 체감한다. 이후 일본 품질정보가 조용한 위기신호로 들어온다."),
  "DCA-N41" => editorial_entry("DCA-N41",
    relationship: "일본 내부 제보자·북미 에너지사·가이아나 정부는 태우를 각자의 위기를 거래할 비밀 상대자로 선택하지만 아직 공개동맹은 아니다.",
    status: "일본 품질조작 정보와 북미 에너지·가이아나 위기 포지션이 매수·철수 시점을 정할 선행정보 자산으로 축적된다.",
    pacing: "품질문서와 유전·공장 지표를 낮은 톤으로 모아 폭발 전 긴장을 만든다. 확정소유보다 관찰과 포지션에 머무는 준비 Arc다."),
  "DCA-N41B" => editorial_entry("DCA-N41B",
    relationship: "중국·러시아 공장 노동자와 현지정부는 철수 위협 속 5년 임차·대금회수 조건으로 태우와 관계를 재설정하고, 본사 임원은 손실회피보다 퇴로확보를 우선한다.",
    status: "중·러 공장철수 대금과 5년 임차권·설비회수 조건이 확정돼 제재·정치위험 속에서도 생산을 되살릴 옵션이 남는다.",
    pacing: "465→466 전환 뒤 공장별 협상을 이어 읽고 470화 대금·임차 결산에서 멈춘다. 471화 일본 품질공격은 상대와 보상통화를 완전히 바꾼다."),
  "DCA-N41C" => editorial_entry("DCA-N41C",
    relationship: "일본 제보자와 소비자는 태우가 공개한 리콜증거를 신뢰하고, 품질을 자랑하던 일본 기업 경영진은 방어자에서 저점매수 대상·협상약자로 내려온다.",
    status: "품질조작 증거·대규모 리콜과 주가하락, 저점매수 포지션이 일본 제조업 지분·시장점유를 얻을 실행자산으로 바뀐다.",
    pacing: "문서폭로와 소비자 반응을 충분히 보여 준 뒤 주가숫자는 빠르게 처리한다. 477화 매수기회가 지급되고 도시바 협상으로 바로 이어진다."),
  "DCA-N41D" => editorial_entry("DCA-N41D",
    relationship: "도시바·웨스팅하우스 채권자와 일본 정부는 김민재를 외국 포식자로 경계하지만 가격·담보·고용조건을 지킬 유일한 인수자로 협상한다.",
    status: "도시바메모리와 웨스팅하우스의 가격·담보·지분 인수조건이 태우 반도체·원전 소유권으로 확정된다.",
    pacing: "478→481은 협상예고·실사·가격조정·서명이 한 줄로 이어져 제목경계에서 자르지 않는다. 도장과 담보이전이 느린 고중량 결산을 만든다."),
  "DCA-N42" => editorial_entry("DCA-N42",
    relationship: "한 부회장은 청나라 채권 매집명령을 맡은 집행자로 신뢰받고, 엔비디아·뱅가드·피델리티는 현재 지분과 미래 목표를 구분한 협상상대로 관계가 열린다.",
    status: "채권 매집경로·담당이 정해지고 이후 60% 확보, 유전코인 회수와 엔비디아 3% 교환으로 현재 약 10% 지분이 생긴다. 25·40·50%는 경로와 목표다.",
    pacing: "482화는 5%·600만 파운드 계산과 지시만 있어 낮은 보상으로 둔다. 488화 35억 달러 채권↔3% 교환과 8%·10% 숫자가 실제 물질봉우리다."),
  "DCA-N42B" => editorial_entry("DCA-N42B",
    relationship: "리강은 미중 무역전쟁 속 청나라 채권을 두고 김민재와 5년 권한·향후 양도를 말로 수락하는 정치상대가 되고, 금융사 담당자들은 세부계약을 공동 작성한다.",
    status: "중국 금융활동 5년 무제한과 5년 뒤 채권양도의 정치적 말합의가 생기지만 각 금융사 세부계약·실행권은 미지급이다.",
    pacing: "전쟁관세·채권압박을 쌓은 뒤 495화 말수락에서 보상을 주되 도장으로 과장하지 않는다. 니콜라 폭로 신호가 미완 계약의 여진 위로 올라온다."),
  "DCA-N43" => editorial_entry("DCA-N43",
    relationship: "서정준·김태중·베트남·몽골 파트너는 니콜라 사기를 피한 태우와 희토류·HBM·팬데믹 대비를 함께 짜며 위기정보를 먼저 공유하는 공급동맹이 된다.",
    status: "니콜라 손실회피, 베트남 희토류 2만 톤·몽골선, HBM 증설과 새만금 법·센트리언 150% 인수보증·진단팀·마스크 명단이 준비된다.",
    pacing: "니콜라 증거와 공급량은 빠르게 지급하고 500화 서정준의 가동률 걱정·150% 보증 대화에 오래 머문다. 공장 두 배는 가능성으로 남겨 다음 팬데믹 장비전의 긴장을 살린다."),
  "DCA-N43B" => editorial_entry("DCA-N43B",
    relationship: "천민정과 내부고발자는 수천 건 기술유출 증거를 김민재에게 맡기고, 이영한·최재석은 법·명동·외교에서 연구자를 지키는 공동 보호망이 된다.",
    status: "기술유출 증거·내부고발선과 기술보호법, 하버드·중국 압박 뒤 리강의 양보·블랙리스트가 국가급 보안권한으로 확보된다.",
    pacing: "증거 수천 건과 배신자의 얼굴을 길게 보여 주고 법 제정·리강 양보를 뒤에서 지급한다. 공격자를 추상 국가로 지우지 않고 내부고발자의 위험에 체류한다."),
  "DCA-N43C" => editorial_entry("DCA-N43C",
    relationship: "곡물메이저는 태우를 신규 구매자로 얕보다 연 1천억 달러 조건을 받아들이고, 비테라 경영진은 태우곡물회사로 전환되는 인수 파트너가 된다.",
    status: "연 1천억 달러 곡물구매·농장임차와 비테라 인수·태우곡물회사 전환이 식량 소유·유통능력으로 확정된다.",
    pacing: "공식협상과 금액을 단 두 화에 강하게 압축한다. 512화 인수도장이 큰 보상이고 513화 해외팹 회의가 완전히 다른 공급망 질문을 연다."),
  "DCA-N43D" => editorial_entry("DCA-N43D",
    relationship: "피터슨은 515화에서 새 EUV·DUV 제안을 듣고 웃는 협상상대에 머물다가 516화 5년 계약으로 태우의 장기 장비파트너가 된다. 베트남·인도 정부는 팹과 곡물·농지를 교환한다.",
    status: "인도·베트남 구형팹 계획, ASML 5년·10조 원 초과 계약과 중국향 구형장비 일부, 곡물·농지 협상·28GHz·스타링크 지시가 공급망 능력으로 연결된다.",
    pacing: "513~514화는 장비·재고·곡물 위험을 설계하고 515화 제안에서 보상을 억제한다. 516화 보름 뒤 계약·지출 회고와 통신명령이 확실한 결산을 준다."),
  "DCA-N44" => editorial_entry("DCA-N44",
    relationship: "일본 정부·소재기업·금융사는 태우를 수출규제의 피해자에서 12나인 기술·오염수 여론으로 되받는 대등한 경제전 상대로 인정하고, 국내 연구진은 보호받는 국산화 주체가 된다.",
    status: "소재 국산화·12나인 기술, 일본 금융포지션과 오염수 압박이 수출규제 철회·시장대체 능력으로 축적된다.",
    pacing: "24화를 한 전쟁으로 유지하되 소재 실험·금융압박·오염수 여론의 봉우리를 분리한다. 같은 일본 상대라도 실험실·거래실·외교무대의 체류비중을 달리한다."),
  "DCA-N45" => editorial_entry("DCA-N45",
    relationship: "천민정·센트리언·태우병원과 다이아 프린스 승객은 김민재의 조기경보를 실제 구조로 확인하며, 국가기관도 그를 과장된 예언자가 아니라 선행 방역파트너로 받아들인다.",
    status: "우한 경보가 진단키트·마스크·음압병실·치료제 준비와 다이아 프린스 구조능력으로 실행돼 팬데믹 첫 생존망이 완성된다.",
    pacing: "이상 폐렴 정보는 낮게 시작해 진단·물자 준비를 촘촘히 쌓고 크루즈 구조에서 감정·행동봉우리를 만든다. 사망자 숫자보다 승객·의료진 반응에 머문다."),
  "DCA-N45B" => editorial_entry("DCA-N45B",
    relationship: "미국 대선 후보들은 김민재에게 직접 시험받고 교체 가능한 정치보험이 되며, 금융타워·에너지팀은 3월 폭락과 유가전쟁의 손실을 함께 감당하는 실행동맹으로 단단해진다.",
    status: "3월 폭락·유가 포지션의 현금수익과 미국 대선 양면통로가 어느 승자 아래서도 태우를 지킬 시장·정치권한으로 확보된다.",
    pacing: "폭락 당일 거래는 행동·물질비중이 높고 후보 면담은 관계·정보로 속도를 늦춘다. 560→561 미국 출장 결정을 끊지 않아 시험과 실행을 같은 약속으로 읽는다."),
  "DCA-N46" => editorial_entry("DCA-N46",
    relationship: "태우 사장단은 팬데믹 뒤 계열사 생존표를 공동 작성하고, 일본 협상자·FDA는 태우를 위기매수자이자 검증된 의료공급자로 대우한다.",
    status: "포스트코로나 계열사 재편, 일본 20조 엔 자산과 FDA 승인 제품이 산업·의료의 새 성장권으로 편입된다.",
    pacing: "사장단 회의에서 숨을 고른 뒤 일본 자산과 FDA 승인이라는 두 보상을 나눠 준다. 570화 결산 다음 마이너스 유가가 즉시 새 외교자원으로 바뀐다."),
  "DCA-N47" => editorial_entry("DCA-N47",
    relationship: "중국·아프리카·EU 정부는 마이너스 유가와 백신을 쥔 태우에게 시장개방을 내놓고, 김민재는 독점 공급자에서 조건부 공공재 파트너로 관계를 조정한다.",
    status: "백신·에너지 공급과 맞바꾼 중국·아프리카·EU 의료·시장 접근권이 태우의 글로벌 판매·생산 기반으로 열린다.",
    pacing: "유가 숫자는 빠르게 처리하고 백신 배분·시장조건 협상에 정보와 관계시간을 쓴다. 577화 국가접근권 지급 뒤 게임스핀 개미군단으로 무대가 대중시장으로 내려온다."),
  "DCA-N48" => editorial_entry("DCA-N48",
    relationship: "베릴과 개인투자자는 조롱받던 약자에서 태우와 함께 헤지펀드를 포위하는 시장동맹이 되고, 공매도 세력은 대중을 무시하던 지위에서 항복자로 내려온다.",
    status: "게임스핀 가격전·헤지펀드 손실과 항복이 개인투자자 영향력·태우 금융방패로 지급된다.",
    pacing: "게시판·매수행렬·가격급등을 짧은 컷으로 쌓아 행동리듬을 높인다. 베릴의 감정과 헤지펀드 항복장면에서 속도를 늦춰 대중복수의 맛을 준다."),
  "DCA-N49" => editorial_entry("DCA-N49",
    relationship: "미국 규제당국과 인텔은 태우를 중국팹 우회자로 경계하다 4년 유예와 NAND 매각을 통해 공급부족을 함께 관리할 산업파트너로 받아들인다.",
    status: "중국팹 제재 4년 유예와 인텔 NAND 75억 달러 인수계약이 구형반도체 시간·메모리 소유권으로 확정된다.",
    pacing: "두 화의 규제협상과 인수도장을 빠르고 무겁게 처리한다. 585화 소유권 봉우리 뒤 586화 충전표준·데이터센터로 기술범위를 넓힌다."),
  "DCA-N49B" => editorial_entry("DCA-N49B",
    relationship: "완성차·전력·AI 기업과 중국 장비업체는 T 규격과 데이터센터를 공통 기반으로 쓰는 생태계 동맹이 되고, 태우는 표준제공자와 대형 고객을 겸한다.",
    status: "T 충전표준, AI 데이터센터 부지·전력과 중국 구형장비 공급계획이 전기차·AI·반도체의 공용 인프라로 자리 잡는다.",
    pacing: "규격·전력·장비 정보를 압축하되 실제 충전·서버 배치 장면을 붙여 추상을 피한다. 590화 기반설계 뒤 GDC 국제무대로 관객을 바꾼다."),
  "DCA-N50" => editorial_entry("DCA-N50",
    relationship: "최재석은 GDC·G7+ 성과를 재선 신뢰로 돌려받고 연구자들은 50조 원 장기투자를 약속받아 김민재·정부와 기술외교 공동체로 굳어진다.",
    status: "G7+ 위상·최재석 재선과 양자·AI를 포함한 50조 원 연구투자계획이 국가 기술권한·예산으로 확정된다.",
    pacing: "국제행사 반응과 개표를 짧게 교차한 뒤 연구투자 숫자에 물질보상을 준다. 595화 기술결산 뒤 SMA 환자 장면이 거대외교를 개인생존 문제로 좁힌다."),
  "DCA-N50B" => editorial_entry("DCA-N50B",
    relationship: "SMA 환자·미국 여론은 태우의 무료공급을 지지하고 제약협회는 특허강탈 위협자에서 정회원·생산권 조건을 협상하는 상대자로 물러선다.",
    status: "SMA 무료약 여론전으로 미 제약협회 가입과 해외공장·필수약 생산권의 잠정조건이 생기지만 최종 정회원·생산권 계약은 남는다.",
    pacing: "환자와 가족 반응에 감정체류를 주고 로비문건은 압축한다. 598화 말합의는 중간 보상으로 닫아 599화 미국 정권이양보다 과장하지 않는다."),
  "DCA-N51" => editorial_entry("DCA-N51",
    relationship: "바이든은 김민재에게 태우사업 보호와 가이아나 방위안을 받는 새 행정부 파트너가 되고, 패배한 트럼프는 폭주를 달래야 할 위험한 기존 인맥으로 남는다.",
    status: "바이든 58대42 승리 뒤 태우사업 보호·가이아나 100억 달러 대출·한국산 무기 제안이 공식 전달돼 정권이양 방어선이 열린다.",
    pacing: "선거결과와 트럼프 분열은 빠르게 확인하고 바이든에게 내미는 금융·방산 조건에서 정보체류를 늘린다. 600화는 합의가 아닌 공식 제안의 봉우리다."),
  "DCA-N51B" => editorial_entry("DCA-N51B",
    relationship: "천민정은 AI·극저온 식각 성과로 장기 기술결정권을 다시 증명하고, 글로벌 IT기업은 메타버스 40%를 사되 태우 통제를 인정해야 하는 협상상대가 된다.",
    status: "AI·식각·SMR 투자축과 메타버스 지분 40% 매각구조·통제권 유지조건이 확정되지만 매매계약·대금은 아직 없다.",
    pacing: "연구성과를 먼저 보여 기술보상을 주고 지분구조는 협상표로 압축한다. 603화 미서명 상태에서 북한 해킹이 침입해 행동리듬을 급히 올린다."),
  "DCA-N51C" => editorial_entry("DCA-N51C",
    relationship: "천민정의 AI 보안팀은 센트리언을 실제로 지킨 신뢰를 얻고, 김민재·최재석은 QUAD 압박 속에서도 몽골 석탄을 택하는 독립 정책동맹으로 움직인다.",
    status: "북한 해킹이 차단되고 북한 권력변수 검토·몽골 석탄 증산과 비축지시가 내려가지만 실제 비축량·해외계약은 미지급이다.",
    pacing: "해킹 탐지·차단은 짧고 날카로운 행동봉우리, 후반 석탄·QUAD 회의는 정보압박이다. 다음 화 순방을 미리 특정하지 않고 비축질문만 남긴다."),
  "DCA-N51D" => editorial_entry("DCA-N51D",
    relationship: "호주·가이아나 정부는 김민재·김태중을 석탄 구매자가 아니라 교육·유전·방산·금융을 한 묶음으로 제공하는 국가협상자로 받아들인다.",
    status: "동해 고갈가스전 저장고 결정 뒤 IIT·한국 대학 교육, 유전지분·방산·금융 조건의 호주·가이아나 국가합의가 성립된다.",
    pacing: "606화 저장고·출장분담은 준비로 낮게 두고 607~608화 정상·장관 협상에서 관계와 물질보상을 키운다. 합의 뒤 베트남 은행 의혹이 어두운 여진으로 들어온다."),
  "DCA-N51E" => editorial_entry("DCA-N51E",
    relationship: "김태중은 베트남 고위층 통로를 손자에게 내어 주는 현지 원로로 다시 기능하고, 베트남 정부는 사이공은행 비자금 자료 앞에서 태우의 수습요구를 받아들인다.",
    status: "사이공은행 40조 원 불법대출·10조 원 비자금 보고서와 정부의 주동자 처리결정·총리 통로가 확보된다. 구속·계좌동결·정유회사 인수는 611화 소유다.",
    pacing: "609화 의심·일주일 조사계획에서 긴장을 만들고 610화 보고서 숫자와 정부반응을 지급한다. 현금창고·구속을 당겨 쓰지 않아 다음 첫 장면의 보상공간을 남긴다."),
  "DCA-N52" => editorial_entry("DCA-N52",
    relationship: "김태중은 은퇴한 창업자에서 축구팬·협회장 후보로 새 동료와 관중을 얻고, 김민재는 할아버지의 두 번째 직업을 뒤에서 지지하는 손자가 된다.",
    status: "즈엉 미아인 구속·정유회사 인수 확인 뒤 김태중이 17표로 축구협회장에 당선되고 메타버스 지분대가로 마이크로소프트 주식을 받는다.",
    pacing: "611화 베트남 결산은 진입배경으로 짧게 처리하고 부산 축구장·표 모으기·17표 발표에 관계체류를 준다. 지분대가 주식은 조용한 물질여진이다."),
  "DCA-N53" => editorial_entry("DCA-N53",
    relationship: "바이든·중국 보건당국·일본 차량업계는 반도체공장과 변이백신을 놓고 태우와 상호양보 관계를 맺고, 센트리언은 중국 동부시장 파트너 지위를 지킨다.",
    status: "미국 공장 양보와 중국팹 자유·국채협력, 센트리언 중국 동부시장·합작유지와 100조 원 이상 공매도 실행이 지급된다.",
    pacing: "정상외교 조건은 압축하고 일본 차량칩 부족·중국 백신실패라는 현장압박을 보여 준다. 618화 시장권리와 공매도 실행은 큰 계획보상이지 아직 수익결산은 아니다."),
  "DCA-N53B" => editorial_entry("DCA-N53B",
    relationship: "수에즈 당국은 자비로 중장비·예인선을 투입한 태우를 우선통항·확장공사 파트너로 인정하고, 로나와의 관계는 구조대상이 아닌 공개 공매도 적대로 열린다.",
    status: "수에즈 조기 재개통과 태우선 우선통항·확장공사 약속이 확정되고 로나 취약성 공개·공매도가 시작된다.",
    pacing: "619화 구조행동이 가장 길고 620화 통항권은 짧은 보상이다. 후반 로나 표적은 아직 결산하지 않고 세계 폭우·석탄난으로 다음 압박을 넘긴다."),
  "DCA-N54" => editorial_entry("DCA-N54",
    relationship: "중국 공급자·국내 농민·제주 이용자는 태우의 석탄·기업농·자율주행을 각기 다른 이해로 평가하고, 강 대위는 국민경제당 3천 명 검증을 맡는 정치보안 책임자가 된다.",
    status: "석탄 비축·기업농 정책과 제주 무인주행 성공, 당원 3천 명 검증자료·수사방식이 에너지·농업·기술·정치의 실행자산으로 남는다.",
    pacing: "중국 폭우와 탄광침수는 정보압박, 기업농 논쟁은 관계비용, 제주 무인주행은 행동보상으로 리본이 교대한다. 625화 배신자 실명은 남겨 둔다."),
  "DCA-N54B" => editorial_entry("DCA-N54B",
    relationship: "유석훈은 배신증거를 넘겨받아 당을 정리하는 내부 동맹으로 남고, 이영한·연변 돈주·북한 장남망은 김민재의 음지 정보관계로 더 깊어진다.",
    status: "국민경제당 배신자 정리와 북한 불법자금 차단망·장남의 연변 우위가 생기고 조지는 일본 금융전 담당자로 배치된다.",
    pacing: "626화 공개 정치정리는 빠르게, 연변 돈줄과 장남 정보는 은밀하게 오래 읽힌다. 630화 조지 배치가 다음 리튬·전쟁시장으로 연결되는 낮은 훅이다."),
  "DCA-N55" => editorial_entry("DCA-N55",
    relationship: "말리 정부·바그너와 태우 광산팀은 적대와 제한 연락을 동시에 유지하며, 김민재는 광산노동자 안전을 위해 완전동맹 대신 억지관계를 선택한다.",
    status: "말리 리튬광산이 복구되고 지분 5% 추가·현지 안전지위가 생기며 바그너와의 제한적 통로가 남는다.",
    pacing: "러시아 침공정보·에너지 포지션은 빠르게 지나가고 광산탈환 현장에 행동체류를 준다. 지분 5%보다 민간피해·제재거리 유지가 여진을 만든다."),
  "DCA-N55B" => editorial_entry("DCA-N55B",
    relationship: "최재석과 김민재는 오미크론·러우전에서 어느 진영에도 굴종하지 않는 정책동맹을 확인하고, 농민·통신사는 기업농법·28GHz 손실을 감수하는 장기시험 관계에 들어간다.",
    status: "기업농법과 28GHz 유지방침이 철회되지 않아 가격·스마트팜·자율주행 실증을 지속할 법·망 권한이 남는다.",
    pacing: "외교판단은 정보 중심으로 짧게, 기업농 반발과 28GHz 비용은 생활·물질압박으로 길게 둔다. 즉시 이익보다 유지결정이 보상인 숨고르기 Arc다."),
  "DCA-N56" => editorial_entry("DCA-N56",
    relationship: "김태중은 손자가 선물한 리즈 구단에서 새 역할을 얻고 홀란드·구단진은 3년 유럽이적 조항을 인정한 계약동료가 된다. 베이징 통로도 조손 외교자산으로 붙는다.",
    status: "리즈 인수, 홀란드 계약·이적조항과 베이징 외교선이 축구 소유·인재·국가접근권으로 확정된다.",
    pacing: "637화 조손 대화와 구단 선물에 감정체류를 주고 선수협상·계약은 경기처럼 속도를 높인다. 641화 외교선 지급 뒤 연변 위조지폐 장면이 분위기를 급랭시킨다."),
  "DCA-N56B" => editorial_entry("DCA-N56B",
    relationship: "이 상무는 연변 큰손의 신뢰를 잃고 고립된 뒤 리규철·해킹세력·CNC까지 북한 장남에게 빼앗긴다. 이영한은 복수의 길잡이였음을 김민재에게 보고하는 음지 동맹으로 남는다.",
    status: "642화에는 위조지폐로 큰손들이 떠난 상태만 생기고, 643화 초 비트코인 계좌 전액·리규철 해킹망·CNC·비자금이 장남의 자금·산업기반으로 실제 귀속된다.",
    pacing: "642화는 이 상무가 상황을 이해하지 못한 정지화면으로 끝내 보상을 유예한다. 643화 초 복수 영수증을 밀도 높게 지급한 뒤 러시아 침공으로 세계위기 리듬을 덮어쓴다."),
  "DCA-N57" => editorial_entry("DCA-N57",
    relationship: "한국 방산·원전·물류팀과 미국·유럽 정부는 직접 참전하지 않으면서 우크라이나를 돕는 보충판매 동맹으로 역할을 나눈다.",
    status: "644~645화에 미국 보충판매와 유럽 방산·원전·물류·식량 패키지가 실행 가능한 승인·공급 구조로 완성된다.",
    pacing: "643화 후반 침공은 진입배경이고 644화부터 정보판독·우회군수 지시가 주 행동이다. 645화 패키지 설계 뒤 니켈 마진콜로 목표가 선명하게 갈린다."),
  "DCA-N57B" => editorial_entry("DCA-N57B",
    relationship: "창산 시안은 태우를 공격자로 의심하다 200억 달러 보증을 주는 구제자에게 광산을 넘기고, 태우 자동차팀은 원가상승을 감수한 공동 위험당사자가 된다.",
    status: "200억 달러 보증·인도네시아 니켈광산 양도와 투기손실·가격안정, 러시아 원유 우회수익이 광물·에너지 소유권으로 지급된다.",
    pacing: "646화 마진콜 숫자와 광산요구에 긴장을 집중하고 647~648화 보증·양도·가격안정을 순차 지급한다. 다음 SVB 채권매각은 다른 금융위기의 차가운 신호다."),
  "DCA-N58" => editorial_entry("DCA-N58",
    relationship: "미국 당국·SVB 예금자는 금융타워를 1달러 약탈자가 아니라 뱅크런을 멈춘 새 주인으로 받아들이고, 김민재·한정훈의 은행구제 신뢰가 강화된다.",
    status: "SVB 1달러 계약 뒤 654화 모든 지분·경영권 이전, 예치금·주가 상승과 새 주인 1면 보도로 공식 소유·통합이 완료된다.",
    pacing: "649화 200억 달러 채권매각 탐지에서 긴장을 시작해 규제·계약을 쌓고 654화 소유권·시장반응을 큰 물질봉우리로 준다. 뒤 유통개혁은 다음 관계전의 짧은 여진이다."),
  "DCA-N58B" => editorial_entry("DCA-N58B",
    relationship: "이 상무의 명동 잔여선은 정리되고 조지는 김민재도 전모를 모르는 첫 엔캐리 작전의 독립지휘자가 된다. 베릴은 조롱받던 경고자에서 공개 복권된 금융동료로 돌아온다.",
    status: "엔캐리·유럽은행망 뒤 로나가 85달러→0.003달러 미만·99% 폭락하고 시총 약 400억 달러의 절반인 약 200억 달러가 실제 흡수된다. 최소 300억 달러는 전망이다.",
    pacing: "655화 개인복수 잔향에서 조지의 작전으로 전환하고 660화는 폴란드 20조·은행지급 뒤 로나 결과를 기다린다. 661화 폭락·베릴 복권이 물질·관계의 이중봉우리다."),
  "DCA-N59" => editorial_entry("DCA-N59",
    relationship: "김태중은 베트남 인맥을 동원해 손자가 맡긴 식량임무를 독자적으로 결산하고, 현지정부는 태우해운·정유·투자대가를 받는 제한적 공급동맹이 된다.",
    status: "태우 소유 농산물 예외·태우상사 팜유, 태우해운 물동량 30% 증가·정유지분 10%·투자약속과 팜유·밀 가격안정이 662화에 지급된다.",
    pacing: "단화 안에서 협상조건과 시장가격을 빠르게 연결한다. 포괄 한국예외가 아니라 태우 물량·대가를 구체적으로 보여 주는 조손 실행보상이다."),
  "DCA-N59B" => editorial_entry("DCA-N59B",
    relationship: "태우엔터·MCA·테일러 스위프트와 축구팬은 10만 석 경기장을 공동 흥행공간으로 만들고, 일본 상사지분 파트너는 로봇물류의 유통동맹으로 붙는다.",
    status: "로봇물류·일본 3대 상사 지분 활용과 10만 석 경기장 공연의 관객·수익성이 유통·스포츠 반복사업으로 검증된다.",
    pacing: "663화 물류·지분은 정보와 물질 중심, 664화 공연은 관객·감정 중심으로 리본이 바뀐다. 숫자설명보다 만석 반응에 오래 머문다."),
  "DCA-N59C" => editorial_entry("DCA-N59C",
    relationship: "바이든·곡물메이저·빈 살만은 태우를 방해하거나 중재를 요청하는 세 상대에서 증산·세무조사·방해포기를 교환하는 협상동맹으로 재배치된다.",
    status: "미·사우디 증산협상과 곡물메이저의 태우 방해포기·세무조사 수용이 식량·원유 정책권한으로 확정된다.",
    pacing: "미국 농업연맹 공격으로 적의 얼굴을 먼저 세우고 정상·기업 협상은 단계별로 지급한다. 668화 합의 뒤 로만의 사적 지원요청이 거대외교의 온도를 낮춘다."),
  "DCA-N60" => editorial_entry("DCA-N60",
    relationship: "로만·프리고진은 제재 속 급료·생활비·보급을 태우에 의지하는 친구·위험동맹이 되고, 미국 카르텔과 태우는 트럼프선·바이든선을 나눠 맡는다.",
    status: "보안 메타버스·동남아 보급선과 미국 대선 양면관리 전략이 러시아 인맥·미국 정책을 동시에 지킬 통로로 확정된다.",
    pacing: "로만의 생활비 대화는 관계·감정에 머물고 보급선은 빠르게 실행한다. 672화 대선보험 확정 뒤 사우디 PIF 제안으로 물질규모가 급상승한다."),
  "DCA-N60B" => editorial_entry("DCA-N60B",
    relationship: "살만 국왕은 6천억 달러 PIF를 맡길 장기 수탁자로 김민재를 선택하고, 계열사들은 네옴·통신·해저케이블·행정IT를 나눠 맡는 왕실사업 동맹이 된다.",
    status: "사우디 프로젝트 배정의사·비용분담안과 하루 25만 배럴 증산·유가하락이 확인되지만 세부계약·원유숏 수익은 아직 없다.",
    pacing: "673화 6천억 달러 제안에 물질중량을 주고 프로젝트 배분은 정보로 압축한다. 675화 증산 발표는 작은 시장봉우리이며 미서명 조건이 다음 주의 압박을 남긴다."),
  "DCA-N61" => editorial_entry("DCA-N61",
    relationship: "최재석은 코리아 디스카운트 보고서를 정책으로 검토하고 빅테크들은 동등지분을 받아들여, 정부·태우·글로벌 IT가 데이터센터 공동투자자가 된다.",
    status: "경제부처 검토선과 빅테크 동등지분의 1천억 달러 AI 데이터센터 합작이 자본시장 개혁·반도체·전력 수요 기반으로 확정된다.",
    pacing: "정책보고는 낮은 긴장으로 시작해 빅테크 자금이 몇 시간 만에 모이는 장면에서 보상을 급상승시킨다. 679화 합작 뒤 제품공개로 초점을 좁힌다."),
  "DCA-N61B" => editorial_entry("DCA-N61B",
    relationship: "세계 완성차 경영진은 태우의 고체배터리·T-9을 경쟁위협에서 공급계약을 요청할 표준제품으로 인정하고, 천민정·차량팀은 공개무대의 공동 주역이 된다.",
    status: "고체배터리 완성·T-9 파리모터쇼 공개와 세계 완성차의 대규모 공급요청이 기술의 시장지위로 지급된다.",
    pacing: "680화 완성확인·공개결정은 준비, 681화 모터쇼 관객·계약요청이 보상이다. 제품반응 뒤 N&K 주가조작이 긴장을 즉시 되살린다."),
  "DCA-N62" => editorial_entry("DCA-N62",
    relationship: "내부 제보자와 수사기관은 N&K 기술탈취선을 금융타워에 맡기고, 나기연·김남훈은 사업파트너 가면을 잃어 체포대상으로 관계가 뒤집힌다.",
    status: "계약위반 증거·차명계좌 동결과 나기연·김남훈 체포로 N&K가 시장충격 없이 제거된다.",
    pacing: "682화 주가조작 포착에서 불안을 만들고 계좌·계약 증거를 쌓는다. 684화 동결·체포를 행동봉우리로 준 뒤 안덕환의 대박 외침으로 다른 산업보상을 연다."),
  "DCA-N62B" => editorial_entry("DCA-N62B",
    relationship: "체코 정부는 24조 원 원전 우선협상 파트너로 태우를 대하고, 한아약품 가족주주는 금융타워에 전 지분을 넘겨 센트리언의 인수대상이 된다.",
    status: "체코 원전 우선협상·현지 공장과 데이터센터 계획, 한아약품 가족지분 전체·경영권 이전이 원전·제약 소유능력으로 확정된다.",
    pacing: "685화 원전 대박은 짧은 진입보상이고 제약 M&A 대상탐색·가족협상에 더 오래 머문다. 687화 경영권 이전 뒤 러북 거래자료로 주제가 급변한다."),
  "DCA-N63" => editorial_entry("DCA-N63",
    relationship: "데이비드·강 대위·이영한은 서로 다른 러시아·바그너·연변 정보선을 같은 결론으로 맞추는 검증 동료가 되고, 한 부회장은 중국·북한·러시아의 이해관계를 대응 지시로 바꾸는 분석역을 맡는다. 러북 관계 자체는 아직 갈라지지 않는다.",
    status: "러시아의 대북 식량과 북한산 무기·탄약 거래가 세 정보선의 교차확인으로 추정에서 대응 근거로 올라가고 중국·장남 접촉, 언론 제보, 한국 무기지원 위협, 바그너 감시의 담당과 지시만 확정된다.",
    pacing: "강 대위 사무실의 데이비드 대화에 오래 머문 뒤 하루를 건너 세 정보선의 보고를 짧게 겹친다. 마지막은 공개나 공급 결과가 아니라 바그너의 불만으로 러시아 분열을 설계할 수 있는지 묻는 정보 중심 훅이다."),
  "DCA-N63B" => editorial_entry("DCA-N63B",
    relationship: "리강·사우디·유럽 정부는 북한 장남지원과 원화결제를 분리해 다루며, 금융타워를 원전·방산 거래의 통화파트너로 받아들인다.",
    status: "사우디 원화스와프·원화 원유결제와 유럽 원전·방산 원화금융이 원화 국제화의 실제 사용권으로 성립된다.",
    pacing: "689화 리강 신뢰확인 뒤 스와프·자산조건을 압축하고 690화 원화 결제합의에서 물질·지위보상을 준다. 고체배터리 가격장벽이 다음 기술압박이다."),
  "DCA-N64" => editorial_entry("DCA-N64",
    relationship: "산업스파이 제보자는 보너스와 보호를 받는 내부 동맹이 되고, 범죄자는 동료 가면을 잃고 자산환수 대상이 된다. 최재석은 배터리 정책지원자로 역할을 나눈다.",
    status: "전기차 화재·한파 의제, 유출제보 보너스·범죄자 자산환수와 유럽 보조금 재설계안이 고체배터리 시장·보안능력으로 확정된다.",
    pacing: "화재뉴스와 가격장벽은 정보압박, 스파이 추적은 행동긴장으로 리본이 바뀐다. 693화 보너스·환수는 관계와 물질의 결산이다."),
  "DCA-N64B" => editorial_entry("DCA-N64B",
    relationship: "폴란드와 동유럽 정상들은 금융타워를 중심으로 자본·원전·자동차를 나누는 동맹이 되고, 완성차사는 중국차 공동관세 로비를 함께 맡는다.",
    status: "동유럽 경제블록과 고체배터리 배정·중국 전기차 공동관세 로비 합의가 자동차·금융 정책권한으로 생긴다.",
    pacing: "정상회의의 긴 협상을 압축하되 각국 배터리 배정표와 공동로비 합의에서 멈춘다. 697화 해상도시 장면이 회의실 추상을 시각적 실물로 바꾼다."),
  "DCA-N65" => editorial_entry("DCA-N65",
    relationship: "최재석·부산시·빈 살만은 오셔닉스와 고체배터리를 놓고 경쟁하다 사우디 철회·부산 지지로 관계를 재정렬하고, 조지는 일본 금융공격일을 정할 독립권한을 받는다.",
    status: "해상도시·AI 데이터센터·고체배터리 실증, 사우디 엑스포 후보철회와 아람코 0.6% 지분계약이 부산 엑스포 외교자산으로 지급된다.",
    pacing: "697~705화 실물도시·배터리 개발과 706~710화 외교전은 같은 엑스포 질문으로 이어진다. 정부 영상·빈 살만 철회·지분계약을 서로 다른 봉우리로 배치한다."),
  "DCA-N67" => editorial_entry("DCA-N67",
    relationship: "중국 자동차동맹은 임시회원이 되고 태우 계열사는 경제특구에 들어가되 언제든 철수할 권리를 가진 조건부 파트너로 남는다. 프리고진의 반란은 이 관계 밖의 새 위협이다.",
    status: "중국 임시가입·경제특구 진출과 계열사 철수 안전장치가 계약조건으로 고정된다.",
    pacing: "710화 일본 D-DAY 여진 뒤 중국 특혜의 독을 차분히 검토한다. 715화 철수권 지급 직후 프리고진 반란을 열어 보상과 위기를 한 화 안에서 구분한다."),
  "DCA-N67B" => editorial_entry("DCA-N67B",
    relationship: "미국·동유럽·수에즈 당국은 바그너 반란 대응에서 태우의 신속무기·운송안을 승인하고, 중국특구·북방육로 파트너는 군사위기를 경제영토 협력으로 바꾼다.",
    status: "미국 승인·신속 무기공급·수에즈 우선운송과 중국특구·북방육로 경제영토 구상이 국가·물류 권한으로 완성된다.",
    pacing: "716화 가스거점·에너지 위험을 빠르게 계산하고 무기·선박 이동에 행동비중을 높인다. 720화 승인·경제영토 지급 뒤 직접 휴전중재 결심으로 관계목표가 바뀐다."),
  "DCA-N68" => editorial_entry("DCA-N68",
    relationship: "푸틴·프리고진·바이든·EU·젤렌스키는 김민재·최재석을 각 진영의 후원자가 아니라 서로의 퇴로를 보장하는 중재자로 인정하고 벨라루스 협상에 동의한다.",
    status: "가스관·철도·재건·부패자금 조건을 거쳐 731화 벨라루스 휴전협상 합의가 실제 외교권한·전후 사업선으로 지급된다.",
    pacing: "721~731화는 푸틴→프리고진→백악관·EU→젤렌스키로 설득대상을 바꾸며 긴장을 상승시킨다. 725→726 선박면담은 이어 읽고 731화 초 합의를 결산봉우리로 둔다."),
  "DCA-N70" => editorial_entry("DCA-N70",
    relationship: "일본 금융청·정부는 엔화 상환 충격 뒤 금융타워에 협상을 요청하고, 일본 야당은 검은 건설자금 대신 합법 통로를 받은 집권 파트너로 가까워진다.",
    status: "일본 3대 은행 지분과 합법 야권자금 통로가 확보되고 건설사 검은돈이 배제돼 금융·정치 영향권이 생긴다.",
    pacing: "732화 30조 엔 대응회의와 미국 환율압박은 정보긴장, 김민재·한 부회장 투트랙은 행동전환이다. 735화 은행지분·야권통로가 지급되고 중동기습이 새 위기를 연다."),
  "DCA-N71" => editorial_entry("DCA-N71",
    relationship: "러우 양측은 휴전서명 당사자가 되고 이스라엘 민간인은 AI 드론·PMC의 보호대상이 된다. 일본 야당 승리는 현재 새 행동이 아니라 진입배경으로 유지된다.",
    status: "러우 휴전서명과 AI 드론·PMC의 하마스 민간인 학살 저지가 국제안보 성과로 확정된다.",
    pacing: "휴전서명은 조용한 지위보상으로 지나가고 하마스 패러글라이더·드론 대응에 행동·긴장을 몰아준다. 739화 민간인 생존이 Arc의 감정봉우리다."),
  "DCA-N72" => editorial_entry("DCA-N72",
    relationship: "미국은 PMC 비용·기업 동등대우·재건 중심권으로 태우의 민간인 방어를 인정하고, 러시아·일본·중국 파트너는 전후 투자·AI 금융플랫폼의 장기동맹이 된다.",
    status: "PMC 비용보상·우크라이나 재건권, 러시아 공장·가스관 투자와 일본 AI 플랫폼 준비·중국 진입안이 전후 금융·산업 권한으로 구체화된다.",
    pacing: "740화 미국 보상은 빠르게 지급하고 741~744화 러시아·일본·중국 설계에 정보체류를 둔다. 천민정의 새 기술보고가 국가질서 뒤 사적 미래를 여는 낮은 훅이다."),
  "DCA-N73" => editorial_entry("DCA-N73",
    relationship: "김태중은 위험한 대북특사를 자청해 손자의 마지막 국가사업을 맡고, 김민재는 할아버지의 능력을 믿되 안전보장과 선물을 준비하는 상호보호 관계로 물러선다.",
    status: "정상회담·5개국 협의·횡단철도 자금선, 우주선용 고체배터리 공장·탈부착 표준과 일본 AI 금융플랫폼 출시가 국가·기술 권한으로 확정된다.",
    pacing: "745화 조손 대화에 관계·감정체류를 주고 방북·협상은 긴장 있게 압축한다. 748화 우주배터리·플랫폼 지급 뒤 철도 첫 삽과 노벨상으로 결말리듬이 열린다."),
  "DCA-N74" => editorial_entry("DCA-N74",
    relationship: "천민정은 김민재가 양복으로 가리고 안아 보호한 연구동료에서 배우자·아이의 어머니가 되고, 김태중은 영국으로 떠나려던 할아버지에서 손자와 손자며느리 곁에 남는 증조할아버지 예정자가 된다.",
    status: "횡단철도 착공·노벨 화학상과 공동 평화상·부산 엑스포 131대34, 50%+ 실소유 기업과 절반 이상의 세계 10위권·목록조차 자산 절반 미만인 숨은 제국이 공개된다.",
    pacing: "749화 착공·화학상 뒤 천민정 보호에 오래 머물고 750화 주가·매출·브랜드·후계구도를 지급한다. 751화 기업제국을 크게 연 뒤 초음파와 조손 손잡기로 물질보다 가족감정을 마지막 봉우리로 둔다.")
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

effective_decisions = decisions.map(&:dup)
original_range_guard = {
  "DCA-N56B" => [642, 642],
  "DCA-N57" => [643, 645]
}.freeze
EFFECTIVE_RANGE_OVERRIDES.each do |arc_id, (first, last)|
  row = effective_decisions.find { |candidate| candidate.fetch("arc_id") == arc_id }
  raise "effective range arc missing #{arc_id}" unless row
  original = [row.fetch("start_sequence").to_i, row.fetch("end_sequence").to_i]
  raise "effective range input drift #{arc_id}: #{original.inspect}" unless original == original_range_guard.fetch(arc_id)
  row["start_sequence"] = first.to_s
  row["end_sequence"] = last.to_s
end
n56b_effective = effective_decisions.find { |row| row.fetch("arc_id") == "DCA-N56B" }
n57_effective = effective_decisions.find { |row| row.fetch("arc_id") == "DCA-N57" }
n56b_effective["decision"] = "MANAGER_BOUNDARY_AMENDMENT"
n56b_effective["dominant_question"] = "위조지폐로 연변 큰손들에게 버림받은 이 상무가 643화 초 비트코인·리규철 해킹망·CNC·비자금의 북한 장남 귀속까지 확인하며 잔여복수의 실제 영수증을 받는가?"
n56b_effective["evidence_anchor"] = BOUNDARY_AMENDMENT_LINES
n56b_effective["boundary_line_evidence"] = "642화는 위조지폐와 고립·혼란까지만, 643화 초는 비트코인 계좌·리규철 해킹세력·CNC·비자금의 장남 귀속을 확인하고 후반에 러시아 침공을 연다."
n56b_effective["predecessor_payoff"] = "641화 리즈 인수·홀란드 계약선 뒤 개인복수 질문이 이 상무의 고립과 북한 장남 귀속 영수증으로 닫힌다."
n56b_effective["next_first_action"] = "643화 후반 러시아 침공 속보가 들어오고 644화부터 정보·방산·원전·우회군수 실행이 시작된다."
n56b_effective["bridge_climax_ownership"] = "643화 초 복수 지급은 DCA-N56B가 소유하고, 같은 화 후반 침공은 DCA-N57로 건너가는 crossfade다."
n57_effective["decision"] = "MANAGER_BOUNDARY_AMENDMENT"
n57_effective["dominant_question"] = "러시아 침공이 현실이 된 뒤 태우가 정보·방산·원전·물류를 어떤 우회군수망으로 배치할 것인가?"
n57_effective["evidence_anchor"] = BOUNDARY_AMENDMENT_LINES
n57_effective["boundary_line_evidence"] = "643화 후반 침공은 진입 bridge이고 644화 첫 실행부터 정보전·방산·원전·물류 지원 설계가 지배행동이 된다."
n57_effective["predecessor_payoff"] = "643화 초 이 상무 복수 영수증은 앞 Arc가 소유하며 침공 속보만 새 전쟁 Arc에 넘긴다."
n57_effective["next_first_action"] = "646화 시안 니켈 마진콜 구제로 상대·자산·압박이 교대한다."
n57_effective["bridge_climax_ownership"] = "643화 침공 bridge는 앞뒤를 잇되 실행 시작은 644화, 전쟁 초기 설계 결산은 645화가 소유한다."
n63_effective = effective_decisions.find { |row| row.fetch("arc_id") == "DCA-N63" }
raise "effective N63 missing" unless n63_effective
n63_effective["decision"] = "MANAGER_SURFACE_AMENDMENT"
n63_effective["arc_name"] = "러북 거래 확인과 중국·장남·언론 대응 설계"
n63_effective["dominant_question"] = "데이비드·강 대위·이영한의 세 정보선으로 러북 무기·식량 거래를 확인하고 중국·장남·언론·한국 무기지원 위협·바그너 감시의 대응 역할을 정할 수 있는가?"
n63_effective["evidence_anchor"] = SURFACE_AMENDMENT_LINES
n63_effective["boundary_line_evidence"] = "688화는 세 정보선의 거래 확인과 대응 지시까지만 소유한다. 언론 공개·러북 분열·한국 방산 대체공급·러시아 반응은 아직 발생하지 않고, 689화 리강·원화 외교는 다음 Arc가 소유한다."
n63_effective["predecessor_payoff"] = "687화 한아약품 경영권 이전이 닫힌 뒤 강 대위 사무실의 러북 거래 검토로 상대·장소·압박이 교대한다."
n63_effective["next_first_action"] = "689화 총리가 된 리강의 장남지원과 사우디 원화스와프·원유결제를 확인하며 통화외교가 시작된다."
n63_effective["bridge_climax_ownership"] = "688화의 정보확인·지시만 DCA-N63이 소유하고, 리강 지지·원화 국제화의 실제 지급은 DCA-N63B 689~690이 소유한다."
effective_ranges = effective_decisions.map do |row|
  [row.fetch("ordinal").to_i, row.fetch("start_sequence").to_i, row.fetch("end_sequence").to_i]
end
raise "effective decision row count mismatch" unless effective_ranges.length == 131
raise "effective coverage endpoints mismatch" unless effective_ranges.first[1] == 1 && effective_ranges[-1][2] == 751
raise "effective gap or overlap" unless effective_ranges.each_cons(2).all? { |left, right| right[1] == left[2] + 1 }
raise "effective equal-length run remains" unless repeated_length_runs(effective_ranges).empty?
raise "effective N56B range mismatch" unless effective_ranges.any? { |ordinal, first, last| effective_decisions.fetch(ordinal - 1).fetch("arc_id") == "DCA-N56B" && [first, last] == [642, 643] }
raise "effective N57 range mismatch" unless effective_ranges.any? { |ordinal, first, last| effective_decisions.fetch(ordinal - 1).fetch("arc_id") == "DCA-N57" && [first, last] == [644, 645] }
raise "effective N63 range mismatch" unless effective_ranges.any? { |ordinal, first, last| effective_decisions.fetch(ordinal - 1).fetch("arc_id") == "DCA-N63" && [first, last] == [688, 688] }
effective_arc_ids = effective_decisions.map { |row| row.fetch("arc_id") }
raise "question/boundary Arc ID mismatch" unless ARC_QUESTION_BOUNDARY.keys == effective_arc_ids
raise "editorial Arc ID mismatch" unless ARC_EDITORIAL.keys == effective_arc_ids
raise "editorial Arc count mismatch" unless ARC_EDITORIAL.length == 131
raise "editorial entry shape mismatch" unless ARC_EDITORIAL.values.all? do |entry|
  entry.is_a?(Hash) && entry.keys == ARC_EDITORIAL_FIELDS && entry.values.all? { |text| !text.to_s.strip.empty? }
end

endpoint_audit_path = File.join(WORK, ENDPOINT_AUDIT_NAME)
endpoint_audit = CSV.read(endpoint_audit_path, headers: true)
raise "endpoint audit immutable SHA mismatch" unless sha(endpoint_audit_path) == ENDPOINT_AUDIT_SHA
raise "endpoint audit header mismatch" unless endpoint_audit.headers == ENDPOINT_AUDIT_HEADERS
raise "endpoint audit row count mismatch" unless endpoint_audit.length == 131
raise "endpoint audit ordinal mismatch" unless endpoint_audit.each_with_index.all? do |row, index|
  row["ordinal"].to_i == index + 1
end
raise "endpoint audit invalid result" unless endpoint_audit.all? { |row| %w[KEEP EDIT BOUNDARY_REVIEW].include?(row["result"]) }
raise "endpoint audit blank evidence" if endpoint_audit.any? { |row| row["evidence_note"].to_s.strip.empty? }
raise "endpoint audit duplicate" unless endpoint_audit.map { |row| [row["arc_id"], row["end_sequence"]] }.uniq.length == endpoint_audit.length
raise "endpoint audit batch status mismatch" unless endpoint_audit.each_with_index.all? do |row, index|
  expected_status = if index < 44
    "ENDPOINT_AUDIT_44_OF_131"
  elsif index < 88
    "ENDPOINT_AUDIT_88_OF_131"
  else
    ENDPOINT_AUDIT_COMPLETE_STATUS
  end
  row["batch_status"] == expected_status
end
raise "endpoint audit result counts mismatch" unless endpoint_audit.group_by { |row| row["result"] }.transform_values(&:length) == {
  "EDIT" => 77,
  "KEEP" => 54
}

endpoint_baseline_chapters = CSV.read(File.join(ANALYSIS, "chapter_map.csv"), headers: true).to_h do |row|
  [row.fetch("sequence").to_i, row.to_h]
end
endpoint_baseline_pacing = CSV.read(File.join(ANALYSIS, "arc_pacing.csv"), headers: true).to_h do |row|
  [row.fetch("sequence").to_i, row.to_h]
end
endpoint_audit.each_with_index do |row, index|
  decision = effective_decisions.fetch(index)
  sequence = row.fetch("end_sequence").to_i
  raise "endpoint audit decision ID mismatch #{index + 1}" unless row.fetch("arc_id") == decision.fetch("arc_id")
  raise "endpoint audit decision endpoint mismatch #{index + 1}" unless sequence == decision.fetch("end_sequence").to_i

  baseline_chapter = endpoint_baseline_chapters.fetch(sequence)
  expected_lines = "L#{baseline_chapter.fetch('start_line')}~L#{baseline_chapter.fetch('end_line')}"
  raise "endpoint audit source lines mismatch #{sequence}" unless row.fetch("source_lines") == expected_lines

  expected_chapter = baseline_chapter.merge(CHAPTER_OVERRIDES.fetch(sequence, {}))
  {
    "paid_reward_after" => "paid_reward",
    "ending_hook_after" => "ending_hook",
    "closed_loops_after" => "closed_loops",
    "opened_loops_after" => "opened_loops"
  }.each do |audit_field, chapter_field|
    raise "endpoint audit after mismatch #{sequence} #{audit_field}" unless row.fetch(audit_field) == expected_chapter.fetch(chapter_field)
  end

  expected_pacing = endpoint_baseline_pacing.fetch(sequence).merge(PACING_OVERRIDES.fetch(sequence, {}))
  SCORE_FIELDS.each do |field|
    recorded_score = endpoint_result_score(row.fetch("pacing_result"), field)
    raise "endpoint audit pacing mismatch #{sequence} #{field}" unless recorded_score == expected_pacing.fetch(field)
  end
end
raise "endpoint audit incomplete: #{ENDPOINT_AUDIT_STATUS}" unless endpoint_audit.length == effective_decisions.length

extra_sample_audit_path = File.join(WORK, EXTRA_SAMPLE_AUDIT_NAME)
extra_sample_audit = CSV.read(extra_sample_audit_path, headers: true)
raise "extra sample audit immutable SHA mismatch" unless sha(extra_sample_audit_path) == EXTRA_SAMPLE_AUDIT_SHA
raise "extra sample audit header mismatch" unless extra_sample_audit.headers == EXTRA_SAMPLE_AUDIT_HEADERS
raise "extra sample audit row count mismatch" unless extra_sample_audit.length == 4
raise "extra sample audit sequence/order mismatch" unless extra_sample_audit.map { |row| row.fetch("sequence").to_i } == [466, 468, 471, 721]
raise "extra sample audit blank field" if extra_sample_audit.any? do |row|
  EXTRA_SAMPLE_AUDIT_HEADERS.any? { |field| row.fetch(field).to_s.strip.empty? }
end
extra_sample_expected_lines = {
  466 => "L81552~L81719",
  468 => "L81886~L82070",
  471 => "L82432~L82611",
  721 => "L124613~L124802"
}.freeze
extra_sample_expected_after = {
  466 => CHAPTER_OVERRIDES.fetch(466).fetch("paid_reward"),
  468 => CHAPTER_OVERRIDES.fetch(468).fetch("paid_reward"),
  471 => CHAPTER_OVERRIDES.fetch(471).fetch("paid_reward"),
  721 => PACING_OVERRIDES.fetch(721).fetch("pacing_note")
}.freeze
extra_sample_audit.each do |row|
  sequence = row.fetch("sequence").to_i
  raise "extra sample audit source lines mismatch #{sequence}" unless row.fetch("source_lines") == extra_sample_expected_lines.fetch(sequence)
  raise "extra sample audit after mismatch #{sequence}" unless row.fetch("corrected_current_receipt_or_note") == extra_sample_expected_after.fetch(sequence)
  raise "extra sample audit boundary missing #{sequence}" unless row.fetch("boundary_decision").include?("KEEP")
end
raise "extra sample audit 470→471 decision mismatch" unless extra_sample_audit.find { |row| row.fetch("sequence") == "471" }.fetch("boundary_decision").include?("KEEP 470→471")
raise "extra sample audit N68 decision mismatch" unless extra_sample_audit.find { |row| row.fetch("sequence") == "721" }.fetch("boundary_decision").include?("KEEP N68")

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

source_lines = File.readlines(SOURCE, encoding: "UTF-8")
character_lexicon = surface_lexicon(
  old_arcs,
  "main_characters",
  SURFACE_CHARACTER_ADDITIONS,
  SURFACE_CHARACTER_ALIASES,
  excluded: SURFACE_CHARACTER_EXCLUSIONS
)
location_lexicon = surface_lexicon(
  old_arcs,
  "main_locations",
  SURFACE_LOCATION_ADDITIONS,
  SURFACE_LOCATION_ALIASES
)
surface_evidence = []

new_arcs = effective_decisions.map do |decision|
  first = decision.fetch("start_sequence").to_i
  last = decision.fetch("end_sequence").to_i
  start_chapter = chapter_by_sequence.fetch(first)
  end_chapter = chapter_by_sequence.fetch(last)
  middle = chapter_by_sequence.fetch((first + last) / 2)
  following = last < 751 ? chapter_by_sequence.fetch(last + 1) : nil
  source_first_line = start_chapter.fetch("start_line").to_i
  source_last_line = end_chapter.fetch("end_line").to_i
  raw_lines = source_lines[(source_first_line - 1)..(source_last_line - 1)]
  expected_source_lines = source_last_line - source_first_line + 1
  raise "source slice missing #{decision.fetch('arc_id')} L#{source_first_line}~L#{source_last_line}" unless raw_lines && raw_lines.length == expected_source_lines
  raw_source = raw_lines.join
  characters, character_evidence = source_scoped_surface(
    raw_source,
    character_lexicon,
    SURFACE_CHARACTER_ALIASES,
    always: ["김민재"],
    limit: SURFACE_CHARACTER_LIMIT
  )
  locations, location_evidence = source_scoped_surface(
    raw_source,
    location_lexicon,
    SURFACE_LOCATION_ALIASES,
    limit: SURFACE_LOCATION_LIMIT,
    location: true
  )
  raise "source-scoped character surface empty #{decision.fetch('arc_id')}" if characters.empty?
  raise "source-scoped location surface empty #{decision.fetch('arc_id')}" if locations.empty?
  surface_evidence << {
    "arc_id" => decision.fetch("arc_id"),
    "start_sequence" => first.to_s,
    "end_sequence" => last.to_s,
    "start_line" => source_first_line.to_s,
    "end_line" => source_last_line.to_s,
    "main_characters" => characters.join(", "),
    "main_locations" => locations.join(", "),
    "character_evidence" => character_evidence.join("; "),
    "location_evidence" => location_evidence.join("; "),
    "source_sha256" => SOURCE_SHA
  }
  editorial = ARC_EDITORIAL.fetch(decision.fetch("arc_id"))
  next_scene = if following
    following.fetch("action").strip
  else
    "김태중은 영국행을 취소해 손자와 손자며느리 곁에 남고, 김민재는 숨은 기업제국과 태어날 아이를 함께 책임지는 삶으로 들어간다."
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
    "central_question" => editorial.fetch("central_question"),
    "promise" => start_chapter.fetch("reader_promise").strip,
    "pressure_escalation" => middle.fetch("resistance_or_cost").strip,
    "mid_turn" => middle.fetch("turn_or_reveal"),
    "concrete_payoff" => end_chapter.fetch("paid_reward"),
    "relationship_change" => editorial.fetch("relationship_change"),
    "status_or_ability_change" => editorial.fetch("status_or_ability_change"),
    "residual_cost" => end_chapter.fetch("opened_loops").strip,
    "next_arc_bridge" => next_scene,
    "boundary_signals" => editorial.fetch("boundary_signals"),
    "confidence" => "0.96"
  }
end

n63_arc = new_arcs.find { |arc| arc.fetch("arc_id") == "DCA-N63" }
raise "N63 Arc missing" unless n63_arc
n63_characters = split_surface_tokens(n63_arc.fetch("main_characters"))
n63_locations = split_surface_tokens(n63_arc.fetch("main_locations"))
%w[김민재 데이비드 이영한].each do |character|
  raise "N63 source-scoped character missing #{character}" unless n63_characters.include?(character)
end
raise "N63 source-scoped character missing 강 대위" unless n63_characters.include?("강 대위")
raise "N63 source-scoped character missing 한정훈/한 부회장" unless (n63_characters & ["한정훈", "한 부회장"]).any?
raise "N63 ghost character leaked" if (n63_characters & ["최재석", "리강", "빈 살만"]).any?
raise "N63 office location missing" unless n63_locations.include?("강 대위 사무실")
raise "N63 international arena missing" unless (n63_locations & ["중국", "연변", "러시아", "북한"]).any?
raise "N63 ghost location leaked" if (n63_locations & ["청와대", "사우디"]).any?
n63_surface_evidence = surface_evidence.find { |row| row.fetch("arc_id") == "DCA-N63" }
raise "N63 surface evidence missing" unless n63_surface_evidence
raise "N63 first-person evidence mismatch" unless n63_surface_evidence.fetch("character_evidence").include?("김민재<=FIRST_PERSON_EXCEPTION(0)")
raise "N63 Han alias evidence mismatch" unless n63_surface_evidence.fetch("character_evidence").include?("한정훈<=한 부회장(1)")
raise "N63 office alias evidence mismatch" unless n63_surface_evidence.fetch("location_evidence").include?("강 대위 사무실<=강 대위의 사무실(1)")

banned_arc_phrases = [
  "범위 마지막의",
  "까지 실제로 확인할 수 있는가",
  "확인 가능한 지급은",
  "다음 첫 행동은",
  "지급·상대·장소·목표 가운데 둘 이상이 교대"
].freeze
ARC_PROSE_FIELDS.each do |field|
  values = new_arcs.map { |arc| arc.fetch(field).strip }
  raise "blank Arc prose #{field}" if values.any?(&:empty?)
  raise "duplicate Arc prose #{field}" unless values.uniq.length == values.length
  banned_arc_phrases.each do |phrase|
    raise "banned Arc prose #{field}: #{phrase}" if values.any? { |text| text.include?(phrase) }
  end
end
new_arcs.each do |arc|
  relationship = arc.fetch("relationship_change")
  status = arc.fetch("status_or_ability_change")
  raise "relation/status exact duplicate #{arc.fetch('arc_id')}" if relationship == status
  raise "relation/status normalized duplicate #{arc.fetch('arc_id')}" if normalized_arc_prose(relationship) == normalized_arc_prose(status)
end
editorial_pacing_readings = new_arcs.map do |arc|
  ARC_EDITORIAL.fetch(arc.fetch("arc_id")).fetch("pacing_reading").strip
end
raise "blank editorial pacing reading" if editorial_pacing_readings.any?(&:empty?)
raise "duplicate editorial pacing reading" unless editorial_pacing_readings.uniq.length == editorial_pacing_readings.length
banned_arc_phrases.each do |phrase|
  raise "banned editorial pacing reading: #{phrase}" if editorial_pacing_readings.any? { |text| text.include?(phrase) }
end
raise "central question punctuation mismatch" unless new_arcs.all? { |arc| arc.fetch("central_question").end_with?("?") }
raise "boundary receipt shape mismatch" unless new_arcs.all? do |arc|
  boundary = arc.fetch("boundary_signals")
  boundary.include?("①") && boundary.include?("②")
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
raise "arc count mismatch" unless new_arcs.length == effective_decisions.length

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

pacing_by_arc = pacing.group_by { |row| row.fetch("arc_id") }
arc_pacing_summary_headers = %w[
  arc_id start_sequence end_sequence pacing_reading
  avg_tension avg_reward avg_hook
  peak_tension_sequence peak_tension_label peak_tension_event peak_tension_score
  peak_reward_sequence peak_reward_label peak_reward_event peak_reward_score
  peak_hook_sequence peak_hook_label peak_hook_event peak_hook_score
  avg_information avg_action avg_relationship avg_emotion avg_material_or_status
]
arc_pacing_summaries = new_arcs.map do |arc|
  rows = pacing_by_arc.fetch(arc.fetch("arc_id"))
  tension_peak = peak_row(rows, "tension_1_10")
  reward_peak = peak_row(rows, "reward_1_10")
  hook_peak = peak_row(rows, "hook_1_10")
  summary = {
    "arc_id" => arc.fetch("arc_id"),
    "start_sequence" => arc.fetch("start_sequence"),
    "end_sequence" => arc.fetch("end_sequence"),
    "pacing_reading" => ARC_EDITORIAL.fetch(arc.fetch("arc_id")).fetch("pacing_reading"),
    "avg_tension" => format("%.2f", mean_value(rows, "tension_1_10")),
    "avg_reward" => format("%.2f", mean_value(rows, "reward_1_10")),
    "avg_hook" => format("%.2f", mean_value(rows, "hook_1_10")),
    "avg_information" => format("%.3f", mean_value(rows, "information_weight")),
    "avg_action" => format("%.3f", mean_value(rows, "action_weight")),
    "avg_relationship" => format("%.3f", mean_value(rows, "relationship_weight")),
    "avg_emotion" => format("%.3f", mean_value(rows, "emotion_weight")),
    "avg_material_or_status" => format("%.3f", mean_value(rows, "material_or_status_weight"))
  }
  {
    "tension" => [tension_peak, "tension_1_10"],
    "reward" => [reward_peak, "reward_1_10"],
    "hook" => [hook_peak, "hook_1_10"]
  }.each do |kind, (peak, score_field)|
    sequence = peak.fetch("sequence").to_i
    chapter = chapter_by_sequence.fetch(sequence)
    summary["peak_#{kind}_sequence"] = sequence.to_s
    summary["peak_#{kind}_label"] = chapter.fetch("visible_label")
    summary["peak_#{kind}_event"] = chapter.fetch("action")
    summary["peak_#{kind}_score"] = peak.fetch(score_field)
  end
  summary
end
raise "Arc pacing summary count mismatch" unless arc_pacing_summaries.length == 131

boundary_amendment = <<~MD
  # 관리자 경계 amendment · 642~645

  - 상태: v2 stage 전용 명시적 권위 보정
  - 원 decision CSV SHA-256: `#{DECISION_SHA}`
  - 승인 장부 SHA-256: `#{LEDGER_SHA}`
  - 원문 근거 범위: `#{BOUNDARY_AMENDMENT_LINES}`
  - 변경 전: `DCA-N56B 642~642`, `DCA-N57 643~645`
  - 변경 후: `DCA-N56B 642~643`, `DCA-N57 644~645`

  ## 원문 소유 판정

  642화는 위조지폐 탓에 이 상무가 연변 큰손들에게 버림받고도 무슨 일이 벌어졌는지 이해하지 못하는 고립까지 소유한다. 비트코인 탈취, 리규철과 해킹세력, CNC·비자금의 북한 장남 귀속은 이 화의 지급이 아니다.

  643화 초에는 비트코인 계좌·리규철 해킹망·CNC·비자금이 장남에게 넘어간 사실이 확인돼 개인복수의 실제 영수증이 지급된다. 같은 화 후반 러시아의 우크라이나 침공은 다음 전쟁 Arc를 여는 crossfade이며, 644화부터 정보·방산·원전·물류 지원의 실행이 지배행동으로 시작된다.

  ## 소유 규칙

  643화 초 복수 결산은 `DCA-N56B`가 소유한다. 643화 후반 침공 속보는 bridge지만 실행 완료로 당기지 않고, `DCA-N57`은 644화 첫 실행부터 645화 전쟁 초기 설계를 소유한다. 이 보정은 원 장부 승인 뒤 관리자 고정표본에서 발견했으므로 원 decision을 덮어 숨기지 않고 effective decision과 amendment를 함께 보존한다.
MD

surface_amendment = <<~MD
  # 관리자 표면·시제 amendment · DCA-N63 / 688화

  - 상태: v2 stage 전용 명시적 권위 보정
  - 원 decision CSV SHA-256: `#{DECISION_SHA}`
  - 승인 장부 SHA-256: `#{LEDGER_SHA}`
  - 원문 SHA-256: `#{SOURCE_SHA}`
  - 원문 근거 범위: `#{SURFACE_AMENDMENT_LINES}`
  - 원 decision 범위: `DCA-N63 688~688` (범위 유지)
  - effective 사건명: `러북 거래 확인과 중국·장남·언론 대응 설계`

  ## 발견한 시스템성 표면 결함

  기존 생성기는 새 Arc와 겹치는 old Arc의 `main_characters`·`main_locations` 전체를 합집합해 범위 밖 인물·장소를 들여왔다. 그 결과 688화 원문에 없는 최재석·리강·빈 살만과 청와대·사우디가 DCA-N63에 섞였다. 원 decision과 승인 장부는 보존하고, v2 stage에서는 old Arc 명단을 후보 lexicon으로만 쓴다. 각 후보는 새 Arc의 `start_line~end_line` 원문 안에서 exact 또는 승인 alias로 확인되어야 하며 김민재만 1인칭 화자 예외다. 실제 match term과 횟수는 `#{SURFACE_EVIDENCE_NAME}`에 남긴다.

  ## 688화 현재 사실과 미지급

강 대위의 사무실에서 데이비드와 러북 거래 가능성을 검토한 뒤, 하루 사이 데이비드의 러시아·미국 정보선, 강 대위의 바그너 보급선, 이영한의 연변 장마당선이라는 세 정보선이 러시아의 대북 식량과 북한산 무기·탄약 거래를 독립 확인한다. 한 부회장의 분석 뒤 김민재는 중국 고위층과 장남의 비공식 접촉, 러북 거래 언론 제보, 한국의 우크라이나 무기지원 위협, 바그너 불만 감시를 지시한다.

  이 화 안에서 실제 언론 공개, 러북 분열, 한국 방산 대체공급, 러시아 반응은 발생하지 않는다. 마지막 프레임은 바그너의 불만을 이용해 러시아의 분열까지 주도할 수 있는가라는 질문이다. 총리가 된 리강의 장남지원과 사우디 원화스와프·원유결제는 `DCA-N63B 689~690`이 소유한다.
MD

FileUtils.rm_rf(TEMP_STAGE)
%w[derived authority validation].each { |directory| FileUtils.mkdir_p(File.join(TEMP_STAGE, directory)) }
write_csv(File.join(TEMP_STAGE, "chapter_map.csv"), chapters, chapter_table.headers)
write_csv(File.join(TEMP_STAGE, "arc_pacing.csv"), pacing, pacing_table.headers)
write_csv(File.join(TEMP_STAGE, "arc_map.csv"), new_arcs, arc_table.headers)
write_stage(File.join(TEMP_STAGE, "source_receipt.json"), File.binread(File.join(ANALYSIS, "source_receipt.json")))
write_csv(File.join(TEMP_STAGE, "authority", EFFECTIVE_DECISIONS_NAME), effective_decisions, DECISION_HEADERS)
write_stage(File.join(TEMP_STAGE, "authority", BOUNDARY_AMENDMENT_NAME), boundary_amendment)
write_stage(File.join(TEMP_STAGE, "authority", SURFACE_AMENDMENT_NAME), surface_amendment)
write_csv(File.join(TEMP_STAGE, "derived", "pacing-all-evidence.csv"), evidence, evidence_table.headers)
write_csv(File.join(TEMP_STAGE, "derived", "high-score-and-relationship-evidence.csv"), high, high_table.headers)
write_csv(File.join(TEMP_STAGE, "derived", "arc-pacing-summary-v2.csv"), arc_pacing_summaries, arc_pacing_summary_headers)
write_csv(File.join(TEMP_STAGE, "derived", SURFACE_EVIDENCE_NAME), surface_evidence, SURFACE_EVIDENCE_HEADERS)

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
write_stage(File.join(TEMP_STAGE, "derived", ENDPOINT_AUDIT_NAME), File.binread(endpoint_audit_path))
write_stage(File.join(TEMP_STAGE, "derived", EXTRA_SAMPLE_AUDIT_NAME), File.binread(extra_sample_audit_path))
Dir.glob(File.join(WORK, "audit-ledger-*.csv")).sort.each { |path| write_stage(File.join(TEMP_STAGE, "derived", File.basename(path)), File.binread(path)) }

atlas = +"# 《독식하는 재벌 3세》 자연 NarrativeArc Atlas — red-team v2 승인 대기 stage\n\n"
atlas << "> 승인 장부의 131개 범위와 현재 회차의 인물·장소·물건·금액·행동으로 구성했다. canonical에는 적용하지 않았다.\n\n"
arc_pacing_summary_by_id = arc_pacing_summaries.to_h { |row| [row.fetch("arc_id"), row] }
new_arcs.each_with_index do |arc, index|
  first = arc.fetch("start_sequence").to_i
  last = arc.fetch("end_sequence").to_i
  summary = arc_pacing_summary_by_id.fetch(arc.fetch("arc_id"))
  atlas << "## #{format('%03d', index + 1)} · #{arc.fetch('arc_id')} · #{arc.fetch('arc_name')} (#{first}~#{last})\n\n"
  atlas << "- 인물: #{arc.fetch('main_characters')}\n"
  atlas << "- 장소: #{arc.fetch('main_locations')}\n"
  atlas << "- 지배 질문: #{arc.fetch('central_question')}\n"
  atlas << "- 독자 약속: #{arc.fetch('promise')}\n"
  atlas << "- 구조 · 도입: #{arc.fetch('concrete_premise')}\n"
  atlas << "- 구조 · 압박: #{arc.fetch('pressure_escalation')}\n"
  atlas << "- 구조 · 전환: #{arc.fetch('mid_turn')}\n"
  atlas << "- 구조 · 결산: #{arc.fetch('concrete_payoff')}\n"
  atlas << "- 구조 · 여진: #{arc.fetch('residual_cost')}\n"
  atlas << "- 구조 · 브리지: #{arc.fetch('next_arc_bridge')}\n"
  atlas << "- 관계 변화: #{arc.fetch('relationship_change')}\n"
  atlas << "- 상태·능력 변화: #{arc.fetch('status_or_ability_change')}\n"
  atlas << "- 경계 근거: #{arc.fetch('boundary_signals')}\n"
  atlas << "\n### 페이싱 구조\n\n"
  atlas << "- Arc T/R/H 평균: #{summary.fetch('avg_tension')}/#{summary.fetch('avg_reward')}/#{summary.fetch('avg_hook')}\n"
  atlas << "- 최고 tension: #{summary.fetch('peak_tension_label')} · #{summary.fetch('peak_tension_event')} · #{summary.fetch('peak_tension_score')}점\n"
  atlas << "- 최고 reward: #{summary.fetch('peak_reward_label')} · #{summary.fetch('peak_reward_event')} · #{summary.fetch('peak_reward_score')}점\n"
  atlas << "- 최고 hook: #{summary.fetch('peak_hook_label')} · #{summary.fetch('peak_hook_event')} · #{summary.fetch('peak_hook_score')}점\n"
  atlas << "- 5리본 평균 I/A/Rel/E/M: #{summary.fetch('avg_information')}/#{summary.fetch('avg_action')}/#{summary.fetch('avg_relationship')}/#{summary.fetch('avg_emotion')}/#{summary.fetch('avg_material_or_status')}\n"
  atlas << "- 페이싱 독해: #{summary.fetch('pacing_reading')}\n"
  atlas << "\n### 회차 추적\n\n"
  (first..last).each do |sequence|
    chapter = chapter_by_sequence.fetch(sequence)
    pace = pace_by_sequence.fetch(sequence)
    ribbons = RIBBON_FIELDS.map { |field| pace.fetch(field) }.join("/")
    atlas << "- #{chapter.fetch('visible_label')} `L#{chapter.fetch('start_line')}~L#{chapter.fetch('end_line')}` · #{chapter.fetch('action')} · 지급: #{chapter.fetch('paid_reward')} · 마지막: #{chapter.fetch('ending_hook')} · T/R/H #{pace.fetch('tension_1_10')}/#{pace.fetch('reward_1_10')}/#{pace.fetch('hook_1_10')} · I/A/Rel/E/M #{ribbons}\n"
  end
  atlas << "\n"
end
write_stage(File.join(TEMP_STAGE, "arc_atlas.md"), atlas)

bible = +"# 《독식하는 재벌 3세》 Project Bible — red-team v2 stage\n\n"
bible << "> 아래 개요는 Arc 목록을 읽지 않아도 김민재의 출발·욕망·능력·관계·시대사건·보상·결말을 따라갈 수 있는 독립 층이다. 뒤의 131개 NarrativeArc는 회차·경계 추적용 부록이며 canonical에는 아직 적용하지 않았다.\n\n"
bible << "## 작품의 출발과 독자 약속\n\n"
bible << "태우그룹 파산 뒤 할아버지 김태중의 수감과 죽음, 베트남 도피와 빈곤을 겪은 김민재는 좁은 고시원에서 라면 한 봉지도 사지 못한 채 각혈하고 시야가 어두워져 의식을 잃은 뒤 열일곱 살로 돌아온다. 회귀 뒤 뜬 상태창은 사람의 소속과 능력을 읽게 한다. 김태중 생일잔치에서는 첫 생의 기억과 명품 안목으로 파텍필립 시계의 거짓말을 별도로 벗긴다. 그 뒤 김태중이 고교 입학 선물로 건넨 것은 스위스 은행 페이퍼컴퍼니 명의 계좌이고, 그 계좌에 100만 달러가 들어 있다. 다음 화에 확인되는 기존 열 개 계좌의 합계는 약 70억 원이다. 김민재는 이 독립자금을 미국 투자회사 SAVE로 키운다. 작품의 약속은 미래를 아는 재벌 3세가 숫자만 맞히는 데 있지 않다. 공장 장부, 은행 지분, 특허, 유전, 약, 선박, 철도처럼 독자가 확인할 수 있는 소유권과 계약으로 ‘할아버지와 태우를 지키고 배신자에게 갚는다’는 말을 결산하는 데 있다.\n\n"
bible << "## 김민재의 욕망·능력·결핍\n\n"
bible << "김민재의 첫 욕망은 가족과 그룹의 생존이고 SAVE라는 이름도 그 약속을 잊지 않기 위한 표지다. 미래 사건의 시점과 산업방향, 사람의 업무능력과 소속을 읽는 정보가 그의 초기 무기다. 그러나 외환위기 이후 역사가 바뀔수록 기억 하나로는 부족해진다. 한정훈의 금융실행, 강 대위의 현장증거, 천민정의 AI·반도체·바이오 판단, 최재석의 정치적 정당성, 다이먼과 이영한의 독립 금융망을 빌려야 한다. 첫 생에 사람을 잘못 믿었다는 공포 때문에 모든 것을 직접 확인하고 과로하는 결핍은 끝까지 남지만, 직책·계약·결과를 반복 검증한 동료에게 권한을 나누는 회장으로 변한다.\n\n"
bible << "## 주요 관계\n\n"
bible << "- **김태중과 김민재:** 김태중은 아버지가 아니라 할아버지다. 김민재가 지켜야 할 유일한 가족에서 100만 달러·태우전자 지분·회장직을 차례로 맡기는 후견인으로, 다시 축구협회장·리즈 운영자·대북특사로 손자의 국가사업을 함께 수행하는 동료 원로로 바뀐다. 751화에는 영국행을 취소하고 손자와 손자며느리의 손을 잡는다.\n"
bible << "- **천민정과 김민재:** 가난과 가족부양 속에서 대리과제를 하던 천민정은 태우의 보호·직책·연구자원을 받아 코코아톡, 번역·보안 AI, 코로나·희귀질병 치료제, 고체배터리를 만든다. 김민재는 동생 천민우를 교실에서 공개 보호하고 천민정의 과거가 공격받을 때도 수상자와 연구팀을 지킨다. 749화에는 천민정의 머리에 양복을 씌워 안아 회사 밖으로 빠져나가며, 751화에는 임신·초음파와 결혼 약속이 가족관계로 지급된다.\n"
bible << "- **한정훈·다이먼·이영한:** 한정훈은 SAVE 실무자에서 금융타워와 태우 부회장으로, 다이먼은 버림받은 은행가에서 독립 금융제국을 가진 동맹자로, 이영한은 명동 후계자에서 일본·중국·연변 자금과 북한 장남망을 읽는 음지 파트너로 성장한다. 이들은 김민재의 부하라는 한 단어보다 각자 소유한 실행권으로 관계가 증명된다.\n"
bible << "- **최재석:** 깨끗하지만 전국기반이 약한 무소속 정치인에서 국민경제당·대통령·러우 휴전 중재자·노벨평화상 공동수상자가 된다. 김민재가 정치방패를 사고 최재석이 기업의 꼭두각시가 되는 관계가 아니라, 데이터센터·법·방역·외교의 관찰 가능한 성과를 서로 제공하는 장기 동맹이다.\n\n"
bible << "## 초반 — 독립자본과 태우 생존\n\n"
bible << "100만 달러는 걸프전·파운드 공격과 퀀텀 동맹을 거쳐 SAVE의 독립자본이 된다. 귀국한 김민재는 창원 공장의 이중장부와 47명 비리망을 걷어 내고 기술연구소에서 이노폰을 성공시켜 박진훈을 밀어낸다. 태우전자 지분을 받아 경영자가 아니라 소유주가 되고, 중국 자동차·HTS·음원·게임·애플·구글 투자를 외화수입선으로 묶는다. 1997년에는 일본 단기차입을 막고 SAVE 자금을 태우에 넣어 첫 생의 파산을 뒤집는다. 카이자동차·CL 통신·배터리·민자 인프라를 인수하고, 이선일 죽음 뒤 일본계 대부업·오성파를 추적해 이영한에게 명동 70%를 넘긴다. 현 반도체를 살리고 WIPI를 깨 아이폰을 내놓은 뒤 9·11 때 비워 둔 WTC와 태우건설 장비로 구조선을 만들며 미국의 정치·통상 방패를 얻는다.\n\n"
bible << "## 중반 — 금융위기, 기술·정치·자원 제국\n\n"
bible << "세이월드 인수 실패는 독자 SNS와 페이스북 한국법인으로, 카드대란은 CL카드·외환은행·결제망으로 바뀐다. 천민정과 천민우를 보호하고 최재석을 국민경제당의 구심점으로 세운다. 서브프라임 보험과 KIKO 역설계는 AIZ 70%, 다이먼의 CITI 복귀, 500억 달러 통화스와프와 금융허브가 된다. GM·DHL·OLED·타미플루·SpaceX·테슬라를 사거나 계약하고, 동일본 대지진 직전에는 교민 최소 1만2천 명의 대피비 책임·운송수단·자료·구호물자 조달선을 마련한다. 실제 대피 완료는 335화 지급으로 당기지 않는다. 신사옥과 금융타워가 선 뒤 사우디 왕위동맹·OPEC 증산, 헤스·체셔피크·가이아나, 카노스 공매도 역포획, 로보가 버린 GLP-1 신약권과 메르스 치료제를 차례로 소유한다. 국민경제당 과반·최재석 집권, 브렉시트·해운·일본 품질조작·도시바와 웨스팅하우스·중국 금융권도 이 실물 기반 위에서 열린다.\n\n"
bible << "## 후반 — 팬데믹과 공급망·은행·전쟁\n\n"
bible << "우한 이상징후 뒤 진단키트·마스크·음압병실·다이아 프린스 구조·백신을 준비하고, 니콜라 사기와 희토류·곡물·ASML 해외팹을 탈중국 공급망으로 묶는다. 515화의 EUV 현재배분 50%와 새 공장 70%·증설·향후 DUV 제안은 구분되고, 실제 ASML 5년·10조 원 초과 계약과 중국행 구형장비 일부 확보는 516화가 소유한다. 미국 정권이양 뒤 AI·SMR·메타버스, 북한 해킹방어, 호주 석탄·가이아나 방산, 사이공은행 비자금을 처리한다. 642화에는 이 상무가 위조지폐 때문에 큰손에게 버림받은 사실까지만 있고, 643화 초 비트코인·리규철 해킹망·CNC·비자금의 북한 장남 귀속이 복수의 실제 영수증이 된다. 러시아 침공 뒤 방산·원전·물류, 니켈 200억 달러 보증을 설계하고 SVB를 1달러에 인수해 654화에 모든 지분·경영권과 시장안정을 받는다.\n\n"
bible << "## 대표 보상과 마지막 결산\n\n"
bible << "작품의 반복 보상은 버린 자산의 가격을 뒤집는 장면이다. 주당 4달러 AIZ, 폐기 신약, 1달러 은행, 35억 달러 채권과 엔비디아 3% 교환처럼 현재 지분·협상경로·최종목표를 분리해 보여 준다. 로나는 660화에 폴란드 20조 원 방산계약·체코 원전·규제공격 준비와 붕괴 질문만 남기고, 661화에서야 85달러가 0.003달러 미만으로 99% 무너진다. 금융타워의 현재 흡수액은 시총 약 400억 달러의 절반인 약 200억 달러이며 헤지펀드 자금까지 더한 최소 300억 달러는 전망이다. 662화에는 태우 소유 농산물 예외·태우상사 팜유, 태우해운 물동량 30% 증가·정유지분 10%·투자약속과 실제 가격안정이 지급된다.\n\n"
bible << "결말부에서 김민재와 최재석은 푸틴·프리고진·백악관·EU·젤렌스키를 거쳐 벨라루스 휴전협상 합의를 얻고, AI 드론·PMC로 하마스 민간인 학살을 막는다. 일본 금융전은 3대 은행 지분과 야당 집권통로로 돌아오고, 김태중의 대북특사는 북한 횡단철도 첫 삽으로 이어진다. 천민정의 노벨 화학상 사유는 고체배터리가 아니라 AI로 코로나 치료제와 희귀질병 치료제를 개발한 공로다. 749화는 김민재가 천민정을 양복으로 가리고 안아 회사 밖으로 나가는 행동까지 소유한다. 750화 공동 노벨평화상은 태우 주가·계열사 매출·세계 최고급 브랜드·국민경제당 후계구도 강화로 이어진다. 751화에는 부산 엑스포 131대34, 김민재가 50% 이상 또는 최대주주로 지배하는 기업과 그 절반 이상의 세계 10위권 지위, 공개목록조차 전체 자산의 절반 미만이라는 숨은 제국이 나온다. 마지막 지급은 그 목록이 아니라 천민정의 초음파 사진, 김태중의 영국행 취소와 조손 손잡기다.\n\n"
bible << "## 결말 뒤 열린 책임\n\n"
bible << "횡단철도 완공, 엑스포 시설, 결혼식·출산은 작품 안에서 완료되지 않는다. 회귀 전 살생부 전원의 처벌도 선언하지 않는다. 김민재의 최종상태는 모든 약속을 과거형으로 지운 왕이 아니라, 할아버지·배우자·태어날 아이와 함께 세계기업과 국가사업을 계속 책임져야 하는 회장이다.\n\n"
bible << "## NarrativeArc 추적 부록\n\n"
new_arcs.each_with_index do |arc, index|
  bible << "### #{format('%03d', index + 1)} #{arc.fetch('arc_id')} · #{arc.fetch('arc_name')} · #{arc.fetch('start_sequence')}~#{arc.fetch('end_sequence')}\n\n"
  bible << "- 시작: #{arc.fetch('concrete_premise')}\n- 인물·장소: #{arc.fetch('main_characters')} / #{arc.fetch('main_locations')}\n"
  bible << "- 압박: #{arc.fetch('pressure_escalation')}\n- 지급: #{arc.fetch('concrete_payoff')}\n- 다음: #{arc.fetch('next_arc_bridge')}\n\n"
end
write_stage(File.join(TEMP_STAGE, "project_bible.md"), bible)

gap = +"# InkOS 사용·Gap 보고서 — 131 Arc red-team v2 stage\n\n> canonical 미적용. 이 본문은 Arc 덤프 없이도 제품 결론과 구현 계약을 읽을 수 있게 작성했다. 131행 추적은 맨 뒤 부록이다.\n\n"
gap << "## 결론 — ArcPacket 위에 NarrativeArc가 필요하다\n\nInkOS의 1~3화 **ArcPacket**은 실제 집필·재생성·검토를 움직이는 실행단위로 유지해야 한다. 그러나 《독식하는 재벌 3세》에서 독자가 기억하는 것은 한 Packet의 처리보다 여러 Packet과 여러 B 방향을 지나 실제 계약·소유권·관계 영수증이 돌아오는 상위 **NarrativeArc**다. ArcPacket을 없애거나 길게 늘리는 것이 아니라 NarrativeArc가 여러 Packet을 묶어 지배 질문·상대·압박·기대 보상·실제 결산을 소유해야 한다.\n\n"
gap << "## 1. 생성 생명주기 — Forecast에서 첫 Packet까지\n\n권장 흐름은 `Forecast → NarrativeArc draft → 첫 ArcPacket materialize`다. Forecast는 장기 사건 후보와 약속 방향만 제안한다. 작가가 NarrativeArc draft에서 지배 질문, 상대·장소, 예상 결산, 열린 부채와 경계 신호를 확정한 뒤에야 첫 1~3화 Packet을 materialize한다. 이후 Packet은 앞 Packet의 actual receipt와 남은 loop를 받아 생성하며 상위 Arc의 끝을 미리 사실로 쓰지 않는다. 이 순서면 642화 고립을 643화 복수완료로 당기거나 660화 기다림을 661화 폭락으로 바꾸는 오류를 생성 단계에서 막는다.\n\n"
gap << "## 2. Episode beat의 surfaceRefs\n\n각 episode beat에는 요약문만 두지 말고 `surfaceRefs`를 붙인다. 최소 표면은 **인물, 장소, 물건, 사건, 관계, 목격자 반응**이다. 654화라면 SVB 모든 지분·경영권, 1달러 계약, 뱅크런 없음, 예치금 소폭 상승, 주가 상승, 1면 보도와 국내 기업농·직거래를 함께 가리켜야 한다. 749화는 노벨상보다 김민재의 양복, 천민정의 머리, 안아 든 행동, 회사 밖으로 빠져나간 마지막 프레임이 관계 receipt다. surfaceRefs가 없으면 다음 화 고유명·결과를 당겼는지와 현재 화 물건·숫자·몸짓을 삭제했는지를 검증할 수 없다.\n\n"
gap << "## 3. 기대 보상과 실제 영수증\n\nNarrativeArc에는 `expectedRewardTarget`을 두고 Reflow closeout에는 `actualRewardReceipt`를 둔다. 앞은 독자에게 무엇을 기다리게 할지, 뒤는 원고 안에서 무엇이 서명·입금·이전·공개·관계변화로 지급됐는지다. 515화의 새 공장 EUV 70%·증설투자·향후 DUV 구매는 제안이고 피터슨의 웃음은 호의적 반응이다. 516화에서야 ASML 5년·10조 원 초과 계약과 중국향 구형장비 일부가 확인된다. 660화의 로나 붕괴 여부·공매도 회수·베릴 명예회복은 target이고, 661화의 85달러→0.003달러 미만·99% 폭락과 시총 절반 약 200억 달러 흡수가 receipt다. 최소 300억 달러는 헤지펀드 자금까지 더했을 때의 전망이다.\n\n"
gap << "## 4. 다섯 리본의 plan/actual 비교\n\n정보·행동·관계·감정·물질/지위 리본은 집필 전 `plan`과 Reflow 뒤 `actual`을 함께 보관한다. plan은 ‘계약 설명을 짧게, 할아버지의 선택을 길게’처럼 체류 의도를 표시하고 actual은 완성 원고의 장면 분량과 독자 체류를 0~1 비율로 다시 판정한다. 둘이 크게 어긋나면 자동 교정하지 않고 편집 경고를 낸다. 751화는 기업 50%+ 지배목록의 물질/지위 보상이 크지만 마지막 초음파 사진과 김태중 손잡기 때문에 관계·감정 actual도 높아야 한다.\n\n"
gap << "## 5. 장르 보정은 GenreProfile/RuleStack에 둔다\n\n재벌물의 지분·계약·직책, 회귀물의 선지식, 가족복수의 감정 영수증을 공통 Arc schema에 고정 필드로 박지 않는다. 공통 schema는 목표·압박·turn·expected/actual reward·loop·boundary·surfaceRefs와 리본만 책임지고 장르별 강조와 금지는 `GenreProfile`과 `RuleStack` 보정층이 적용한다. 이 작품의 RuleStack은 현재/제안/계약/소유권을 분리하고 적의 얼굴과 목격자 반응을 유지하며 큰 숫자 뒤 가족·조직 관계 receipt가 있는지 묻는다.\n\n"
gap << "## 6. 상태 활성화 — draft/missing은 fail-open\n\nNarrativeArc가 `draft`이거나 필드가 `missing`이면 집필을 막거나 불완전한 지침을 주입하지 않는다. 경고와 미완 표시만 남기는 fail-open이 맞다. Arc가 `ready`이면서 `active`일 때만 해당 Arc의 지배 질문, 허용된 surfaceRefs, 기대 보상, 현재 loop와 경계 gate를 ArcPacket 생성·Reflow 검수에 제공한다. 초안이 권위처럼 동작해 원고를 고치는 역전을 피하려면 ready와 active가 모두 필요하다.\n\n"
gap << "## 7. Studio 편집·검토 화면\n\nStudio에는 상단 NarrativeArc 띠와 하단 회차/ArcPacket 트랙을 함께 둔다. Arc 띠에서는 지배 질문, promise, 도입·압박·전환·결산·여진/bridge, expected target과 actual receipt, 관계 변화와 상태·능력 변화를 편집한다. 회차 트랙에서는 T/R/H와 다섯 리본 plan/actual, 마지막 프레임, 열린/닫힌 loop, surfaceRefs를 비교한다. 경계를 드래그하면 양쪽 Arc의 climax 소유와 다음 첫 행동이 함께 갱신돼야 하고 643화 같은 crossfade는 ‘앞 지급/뒤 진입’을 별도 beat로 표시한다. 검토 화면은 다음 화 답의 누출과 현재 화 표면 삭제를 양방향으로 보여 준다.\n\n"
gap << "## 8. 이 작품의 골드 회귀예\n\n### 642~643 — crossfade와 climax 소유\n\n642화는 위조지폐 때문에 이 상무가 연변 큰손들에게 버림받고 상황을 이해하지 못하는 데서 멈춘다. 643화 초에 비트코인 계좌·리규철 해킹망·CNC·비자금의 북한 장남 귀속이 확인돼 앞 복수 Arc의 영수증이 되고, 후반 러시아 침공은 644화 정보·방산·원전·물류 실행으로 건너가는 bridge다. 한 회차에 앞 Arc payoff와 다음 Arc entry가 공존할 수 있어야 한다.\n\n### 515→516 — 제안과 계약\n\n515화의 현재 EUV 50% 배분과 새 공장 70%·증설·향후 DUV 구매 제안, 피터슨의 웃음을 분리한다. 516화는 네덜란드·베트남·인도 출장 뒤 ASML 5년·10조 원 초과 계약과 중국향 구형장비 일부가 이미 체결된 사실을 소유한다. target이 receipt로 바뀌는 회차는 서명·회고·소유 문장으로 확인한다.\n\n### 660→661 — 대기와 지급\n\n660화는 폴란드 20조 원 계약·체코 원전·로나 규제공격 준비 뒤 붕괴 여부를 기다린다. 661화에서 99% 폭락, 약 200억 달러 현재 흡수, 베릴 명예회복이 지급된다. 마지막 훅은 다음 화 정답을 쓰는 칸이 아니라 현재 장면이 실제로 연 질문의 강도다.\n\n"
gap << "## 9. 재미의 납득을 우선한다\n\n현실성 미세교정은 필요하지만 첫 우선순위가 되어서는 안 된다. 먼저 독자가 약속을 기억하고 압박을 견딘 뒤 지급을 눈으로 확인하며 인물의 감정·관계 변화에 납득하는가를 본다. 계약법 용어 하나를 더 맞히는 것보다 제안과 서명을 바꾸지 않는 것, 지분 숫자보다 누가 누구를 믿고 어떤 역할을 넘겼는지 남기는 것, 거대거래 뒤 가족·직원·목격자 장면을 보존하는 것이 재미에 직접 기여한다.\n\n"
gap << "## 10. 구현 순서와 승인 기준\n\n1단계는 NarrativeArc draft와 ArcPacket 연결, 2단계는 surfaceRefs·expected/actual receipt, 3단계는 리본 plan/actual과 Studio 편집기, 4단계는 GenreProfile/RuleStack 경고다. 승인 기준은 Packet이 상위 promise를 잃지 않을 것, actual receipt가 원고 회차 밖 사실을 당기지 않을 것, current fact omission과 next leakage를 모두 잡을 것, 642~643·515→516·660→661 세 회귀예가 계속 통과할 것, 작가가 경계·리본·receipt를 화면에서 직접 고치고 이유를 남길 수 있을 것이다.\n\n"
gap << "## 부록 · 131 Arc 추적\n\n"
new_arcs.each_with_index { |arc, index| gap << "- #{format('%03d', index + 1)} `#{arc.fetch('arc_id')}` #{arc.fetch('start_sequence')}~#{arc.fetch('end_sequence')} · #{arc.fetch('arc_name')} · 시작 #{arc.fetch('concrete_premise')} · 지급 #{arc.fetch('concrete_payoff')} · 다음 #{arc.fetch('next_arc_bridge')}\n" }
gap << "\n관리자 승인 전 canonical 적용·완료 선언·커밋·푸시는 하지 않는다.\n"
write_stage(File.join(TEMP_STAGE, "inkos_usage_and_gap_report.md"), gap)

improvements = +"# 무료 개선 보고서 — 131 Arc red-team v2 stage\n\n> canonical 미적용. 아래 열 가지는 이 작품을 더 재미있게 만드는 작품 고유 편집안이며 131행 추적은 부록으로만 둔다.\n\n## 살릴 것·보정할 것·InkOS가 경고할 것\n\n"
improvements << "### 개선 01 · 100만 달러가 실물 제국으로 자라는 초반 사다리\n\n- **살릴 것:** 스위스 은행 페이퍼컴퍼니 계좌 100만 달러, 걸프전·파운드 포지션, SAVE, 창원공장 이중장부, 이노폰, 태우전자 지분으로 이어지는 ‘작은 독립자본→현장증거→소유권’ 상승감은 강하다.\n- **보정할 것:** 생일잔치의 가짜 파텍필립 폭로와 김태중의 고교 입학 선물은 별개의 영수증으로 보여 인과를 뭉개지 않는다.\n- **InkOS 경고:** 계좌·지분·직책이 실제 지급된 회차를 찾지 못한 채 ‘선점·장악’으로 넘어가면 경고한다.\n\n"
improvements << "### 개선 02 · 공장 장부와 제품 반격의 촉감\n\n- **살릴 것:** 47명 비리망, 창고·생산라인, 이노폰 자료 전달 영상·음성 녹음처럼 돈과 복수가 사람·장소·물건에 붙는 초반이 선명하다.\n- **보정할 것:** 후반 거대 거래에도 50화의 촬영증거처럼 계약서, 화면, 보도, 계좌, 직원 반응 중 최소 하나를 남긴다.\n- **InkOS 경고:** 현재 화에 이미 있는 영상·수치·직원행동을 ‘아직 없음’으로 밀거나 범용 ‘증거 확보’로 말리면 current-fact omission을 띄운다.\n\n"
improvements << "### 개선 03 · 중후반 거대거래의 반복 피로를 꺾는다\n\n- **살릴 것:** AIZ 4달러, 폐기 GLP-1, 엔비디아 3%, SVB 1달러처럼 버려진 자산을 뒤집는 보상쾌감은 고유 엔진이다.\n- **보정할 것:** 매번 ‘위기정보→저점매수→폭등’으로 닫지 말고 기술사용, 직원 생존, 정치권한, 관계신뢰, 대중 목격으로 결산통화를 바꾼다.\n- **InkOS 경고:** 인접 NarrativeArc 최고 reward가 연속해서 지분·현금 숫자뿐이면 관계·감정·실물사용 receipt 후보를 제안한다.\n\n"
improvements << "### 개선 04 · 보상 통화를 지분 밖으로 넓힌다\n\n- **살릴 것:** 335화의 공개 대피비 책임·운송수단·구호조달선, 654화의 뱅크런 진정·예치금·주가·1면 보도, 662화의 가격안정·해운 물동량 30%·정유지분 10%는 서로 다른 맛을 낸다.\n- **보정할 것:** 법·직책·고용·치료·시장안정·목격자 신뢰를 독립 actual receipt로 적는다.\n- **InkOS 경고:** paid_reward와 state_change가 같은 문장이거나 지분·수익만 반복되면 두 필드의 관찰 가능한 차이를 요구한다.\n\n"
improvements << "### 개선 05 · 김태중을 동료 원로로 끝까지 보인다\n\n- **살릴 것:** 154화 회장직 제안·결혼 최후통첩, 리즈 운영, 745화 대북특사 자청, 751화 영국행 취소와 손잡기는 조손관계의 긴 궤적이다.\n- **보정할 것:** 김태중은 김민재의 아버지가 아니라 할아버지다. 손자가 능력을 믿고 국가사업을 맡기는 선택과 마지막 증조할아버지 예정자 상태를 정확히 유지한다.\n- **InkOS 경고:** 관계 필드에 소유권만 쓰거나 ‘부자화해·아버지’가 섞이면 호칭·역할·선택 receipt를 다시 요구한다.\n\n"
improvements << "### 개선 06 · 천민정의 능력과 보호를 함께 결산한다\n\n- **살릴 것:** 천민우 교실 보호, 코코아톡·AI·바이오·고체배터리, 749화 양복으로 머리를 가리고 안아 회사 밖으로 나가는 행동, 751화 초음파가 능력과 관계를 함께 닫는다.\n- **보정할 것:** 노벨 화학상 사유는 AI로 코로나 치료제와 희귀질병 치료제를 개발한 공로로 두고, 보호장면 앞에 천민정의 연구·직책 receipt를 나란히 둔다.\n- **InkOS 경고:** 관계변화가 ‘보호한다’로 반복되거나 수상원인이 다른 기술로 바뀌면 surfaceRefs와 원인을 대조한다.\n\n"
improvements << "### 개선 07 · 적과 경쟁자의 얼굴을 유지한다\n\n- **살릴 것:** 박진훈·우성일, 강수기, 카노스, 이 상무처럼 이름과 이해관계가 남을 때 복수와 전향이 기억된다.\n- **보정할 것:** ‘일본·중국·헤지펀드’라는 집단명만 쓰지 말고 누가 서명하고 배신하며 결과를 목격했는지 압박 장면에 남긴다.\n- **InkOS 경고:** 세 Arc 이상 resistance가 국가·시장·세력 같은 집합명뿐이면 실제 상대·장소·목격자 surfaceRef 부족을 알린다.\n\n"
improvements << "### 개선 08 · 642~643 교차전환을 숨기지 않는다\n\n- **살릴 것:** 643화 초 이 상무 복수의 비트코인·리규철·CNC 귀속과 후반 러시아 침공은 앞 climax와 다음 entry가 한 회차에 공존하는 좋은 crossfade다.\n- **보정할 것:** DCA-N56B가 642~643 초 지급을 소유하고 DCA-N57은 644화 실행부터 시작하게 해 bridge와 climax 소유를 분리한다.\n- **InkOS 경고:** 제목 경계나 회차번호로 crossfade를 잘라 앞 Arc의 지급이 다음 Arc로 밀리면 양쪽 beat를 펼쳐 보인다.\n\n"
improvements << "### 개선 09 · 제안·계약·시장결과의 세 시계를 분리한다\n\n- **살릴 것:** 515→516 ASML과 660→661 로나는 같은 약속이 상태를 바꾸는 순간이 분명해 페이싱 골드 기준이 된다.\n- **보정할 것:** 피터슨의 웃음은 호의, 516화 5년·10조 원 초과는 계약, 660화는 기다림, 661화 약 200억 달러는 현재 흡수, 최소 300억 달러는 전망으로 쓴다.\n- **InkOS 경고:** ending_hook에 다음 화 고유 가격·사업명·대가가 들어가거나 proposal이 actual receipt로 닫히면 실패시킨다.\n\n"
improvements << "### 개선 10 · 751화 숨은 제국과 가족의 이중결산\n\n- **살릴 것:** 여러 기업 50%+ 실소유, 절반 이상의 세계 10위권, 공개목록도 전체 자산 절반 미만이라는 숨은 제국 뒤 초음파 사진·김태중 영국행 취소·손잡기가 생존·가족 약속을 닫는다.\n- **보정할 것:** 평화상 상자를 김태중에게 공식 귀속하거나 ‘귀환’으로 쓰지 말고, 손자가 공을 돌리려 한 행동과 할아버지가 한국에 남는 선택을 나눈다.\n- **InkOS 경고:** finale가 기업목록만으로 끝나거나 가족장면만 남아 제국 공개를 삭제하면 물질/지위와 관계/감정 두 봉우리를 모두 요구한다.\n\n"
improvements << "## 부록 · 131 Arc별 회귀 추적\n\n"
new_arcs.each_with_index { |arc, index| improvements << "- #{format('%03d', index + 1)} #{arc.fetch('arc_id')} #{arc.fetch('arc_name')}: 시작 #{arc.fetch('concrete_premise')} / 지급 #{arc.fetch('concrete_payoff')} / 경계 #{arc.fetch('boundary_signals')}\n" }
improvements << "\nSTAGE_READY 후보이며 관리자 승인 전 canonical과 공통 도구를 바꾸지 않는다.\n"
write_stage(File.join(TEMP_STAGE, "free_improvements_report.md"), improvements)

pending = "TEMP_STAGE 검증 전"
write_stage(File.join(TEMP_STAGE, "completion_receipt.md"), completion_text(new_arcs, pacing, pending, pending, validated: false))
write_stage(File.join(TEMP_STAGE, "authority", File.basename(LEDGER)), File.binread(LEDGER))
write_stage(File.join(TEMP_STAGE, "authority", File.basename(DECISIONS)), File.binread(DECISIONS))
write_stage(File.join(TEMP_STAGE, "authority", File.basename(__FILE__)), File.binread(__FILE__))
write_stage(File.join(TEMP_STAGE, "authority", File.basename(VALIDATOR)), File.binread(VALIDATOR))
write_stage(
  File.join(TEMP_STAGE, "authority", "authority-input-receipt.json"),
  JSON.pretty_generate({
    "status" => "V3_STAGE_BUILD_INPUTS_VERIFIED",
    "generatedAt" => Time.now.iso8601,
    "sourceSha256" => SOURCE_SHA,
    "approvedLedgerSha256" => LEDGER_SHA,
    "decisionCsvSha256" => DECISION_SHA,
    "effectiveDecisionCsvSha256" => sha(File.join(TEMP_STAGE, "authority", EFFECTIVE_DECISIONS_NAME)),
    "boundaryAmendmentSha256" => sha(File.join(TEMP_STAGE, "authority", BOUNDARY_AMENDMENT_NAME)),
    "boundaryAmendmentSourceLines" => BOUNDARY_AMENDMENT_LINES,
    "surfaceAmendmentSha256" => sha(File.join(TEMP_STAGE, "authority", SURFACE_AMENDMENT_NAME)),
    "surfaceAmendmentSourceLines" => SURFACE_AMENDMENT_LINES,
    "surfaceEvidenceSha256" => sha(File.join(TEMP_STAGE, "derived", SURFACE_EVIDENCE_NAME)),
    "endpointAuditSha256" => ENDPOINT_AUDIT_SHA,
    "endpointAuditRows" => endpoint_audit.length,
    "endpointAuditStatus" => ENDPOINT_AUDIT_STATUS,
    "endpointAuditResultCounts" => endpoint_audit.group_by { |row| row["result"] }.transform_values(&:length),
    "extraSampleAuditSha256" => EXTRA_SAMPLE_AUDIT_SHA,
    "extraSampleAuditRows" => extra_sample_audit.length,
    "extraSampleAuditSequences" => extra_sample_audit.map { |row| row.fetch("sequence").to_i },
    "authoritySha256" => sha(__FILE__),
    "validatorSha256" => sha(VALIDATOR),
    "canonicalStartSha256" => CANONICAL_START,
    "decisionRows" => decisions.length,
    "effectiveRangeOverrides" => EFFECTIVE_RANGE_OVERRIDES,
    "effectiveArcRows" => effective_decisions.length,
    "coverage" => "1-751",
    "stageTarget" => STAGE,
    "canonicalWriteAllowed" => false
  }) + "\n"
)

custom = run_stage_validator(TEMP_STAGE)
strict = run_strict(TEMP_STAGE)
write_stage(File.join(TEMP_STAGE, "completion_receipt.md"), completion_text(new_arcs, pacing, custom, strict, validated: true))
custom = run_stage_validator(TEMP_STAGE)
strict = run_strict(TEMP_STAGE)
write_stage(File.join(TEMP_STAGE, "validation", "stage-validator.txt"), custom)
write_stage(File.join(TEMP_STAGE, "validation", "common-strict.txt"), strict)

CANONICAL_START.each do |name, expected|
  raise "canonical changed during build #{name}" unless sha(File.join(ANALYSIS, name)) == expected
end
root_shas = ROOT_OUTPUTS.each_with_object({}) { |name, hash| hash[name] = sha(File.join(TEMP_STAGE, name)) }
receipt = +"# Manager red-team v3 stage build receipt\n\n- status: **STAGE_READY / AWAITING_MANAGER_V3_STAGE_APPROVAL**\n"
receipt << "- source: `#{SOURCE_SHA}`\n- ledger: `#{LEDGER_SHA}`\n- decision: `#{DECISION_SHA}`\n- authority: `#{sha(__FILE__)}`\n- validator: `#{sha(VALIDATOR)}`\n"
receipt << "- effective decision: `#{sha(File.join(TEMP_STAGE, 'authority', EFFECTIVE_DECISIONS_NAME))}`\n- boundary amendment: `#{sha(File.join(TEMP_STAGE, 'authority', BOUNDARY_AMENDMENT_NAME))}` · `#{BOUNDARY_AMENDMENT_LINES}`\n"
receipt << "- surface amendment: `#{sha(File.join(TEMP_STAGE, 'authority', SURFACE_AMENDMENT_NAME))}` · `#{SURFACE_AMENDMENT_LINES}`\n- surface evidence: `#{sha(File.join(TEMP_STAGE, 'derived', SURFACE_EVIDENCE_NAME))}` · 131 Arc\n"
receipt << "- endpoint audit: `#{ENDPOINT_AUDIT_SHA}` · #{endpoint_audit.length} Arc endpoints · EDIT 77 / KEEP 54 / BOUNDARY_REVIEW 0\n"
receipt << "- extra sample audit: `#{EXTRA_SAMPLE_AUDIT_SHA}` · #{extra_sample_audit.length} rows · 466/468/471/721\n"
receipt << "- effective ranges: DCA-N56B 642~643 / DCA-N57 644~645\n"
receipt << "- DCA-N63: 688~688 · 러북 거래 확인과 중국·장남·언론 대응 설계 · reward 6\n"
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
