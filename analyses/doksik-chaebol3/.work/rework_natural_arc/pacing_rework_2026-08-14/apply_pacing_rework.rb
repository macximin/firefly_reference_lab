#!/usr/bin/env ruby

abort "DISABLED: this legacy script generates mechanical pacing prose; use apply_manual_pacing_prose_followup.rb"

require "csv"

WORK = __dir__
ANALYSIS = File.expand_path("../../..", WORK)
CHAPTER_PATH = File.join(ANALYSIS, "chapter_map.csv")
PACING_PATH = File.join(ANALYSIS, "arc_pacing.csv")
EVIDENCE_PATH = File.join(ANALYSIS, ".work/rework_natural_arc/pacing/pacing-all-evidence.csv")
HIGH_PATH = File.join(ANALYSIS, ".work/rework_natural_arc/high-score-and-relationship-evidence.csv")
LEDGER_PATH = File.join(WORK, "pacing-rejudgment-ledger-001-751.csv")

PACING_HEADER = %w[
  sequence visible_label arc_id arc_phase concrete_event tension_1_10
  reward_1_10 hook_1_10 information_weight action_weight relationship_weight
  emotion_weight material_or_status_weight pacing_note
].freeze

EVIDENCE_HEADER = %w[
  sequence visible_label arc_id arc_phase tension_1_10 reward_1_10 hook_1_10
  information_weight action_weight relationship_weight emotion_weight
  material_or_status_weight ribbon_rationale source_lines
].freeze

LEDGER_HEADER = %w[
  sequence visible_label source_lines semantic_status score_status ribbon_status
  old_tension new_tension old_reward new_reward old_hook new_hook old_ribbon
  new_ribbon actual_action actual_paid_reward actual_ending_hook
  concrete_event_before concrete_event_after pacing_note_before pacing_note_after
  adjudication
].freeze

def parse_scores(text, label)
  values = text.split.map(&:to_i)
  raise "#{label} score count #{values.length}, expected 751" unless values.length == 751
  raise "#{label} out of range" unless values.all? { |value| value.between?(1, 10) }
  values
end

# Every value below is an explicit chapter-by-chapter editorial judgment. These
# lists are deliberately not calculated from keywords, Arc position, or a curve.
REWARD_VALUES = parse_scores(<<~SCORES, "reward")
  6 6 5 7 7 9 6 9 6 7 7 6 7 8 8 4 5 6 6 7 7 7 8 6 5 6 5 7 6 8 5 7 6 7 6 7 8 6 7 7 5 6 7 5 7 8 8 6 5 6
  8 10 10 6 7 9 8 6 5 8 7 8 7 5 6 6 5 8 8 9 7 6 7 6 8 7 7 5 6 6 8 7 8 9 8 9 6 8 8 8 5 7 8 8 7 5 9 8 7 8
  7 5 5 6 7 6 8 5 7 8 8 7 6 6 7 8 5 7 6 8 7 8 8 8 6 6 7 6 5 7 8 8 8 9 6 8 5 6 6 5 9 7 5 8 6 8 8 8 6 7
  6 9 8 6 5 6 7 7 8 5 7 7 6 7 7 10 6 8 7 8 8 7 6 7 7 10 8 8 7 6 7 9 6 7 9 8 7 7 6 7 8 5 6 7 10 7 7 5 6 5
  8 7 7 6 6 9 8 5 9 6 5 7 7 4 7 5 6 7 7 6 7 5 6 8 7 10 7 9 7 7 9 8 7 9 7 9 6 6 8 8 7 10 4 6 8 10 7 7 8 9
  7 8 7 8 6 6 7 6 6 6 7 6 7 7 7 6 9 8 8 6 6 9 8 7 8 7 8 8 7 9 8 6 7 7 7 8 6 8 7 7 6 6 7 8 8 8 6 8 7 6
  8 5 9 8 6 8 7 6 7 6 8 8 7 7 8 9 7 6 8 8 6 7 7 7 7 9 6 6 6 6 7 8 6 7 8 10 8 6 6 7 7 6 7 7 6 6 7 7 8 7
  6 9 7 8 7 9 8 7 6 6 5 8 6 7 7 6 7 8 7 7 6 7 7 7 8 7 8 7 7 8 7 7 7 6 8 8 7 6 6 9 9 7 8 7 8 9 8 8 7 5
  9 7 8 8 3 6 6 9 9 6 5 7 6 7 6 9 8 7 8 7 6 7 9 7 5 10 8 7 5 8 7 8 9 7 8 6 7 6 7 5 6 7 7 9 6 5 8 5 8 7
  7 6 4 9 7 8 6 6 9 7 7 8 4 7 8 6 6 5 5 9 7 8 7 5 6 6 8 5 7 6 10 6 7 9 8 5 8 9 8 7 7 8 6 6 9 8 6 8 8 7
  6 8 5 7 5 5 6 8 6 8 5 8 5 5 8 7 5 6 5 8 6 5 7 8 5 6 7 6 5 7 8 9 6 8 6 5 5 6 7 8 6 6 6 8 7 8 7 8 8 7
  8 5 5 6 9 6 6 7 7 7 8 7 6 6 8 6 6 5 5 9 7 9 7 6 8 5 8 5 5 6 7 7 9 5 8 7 6 5 4 8 6 8 9 9 6 6 5 5 7 5
  8 5 5 4 7 6 5 9 4 7 9 7 6 9 8 9 6 8 5 9 7 6 8 7 7 7 5 6 8 7 7 5 8 6 8 6 8 6 8 6 8 8 3 5 6 5 7 9 5 5
  5 9 5 5 7 8 5 7 8 8 9 8 7 7 6 7 8 8 7 4 7 5 8 8 9 6 5 8 9 8 8 5 4 8 7 8 8 7 7 9 7 5 7 7 8 7 6 8 6 6
  9 8 6 8 7 7 4 9 6 8 5 5 5 5 5 6 6 7 5 8 5 6 7 7 6 8 4 5 5 7 8 7 8 6 9 8 9 9 9 8 8 7 8 6 7 7 9 9 10 10
  10
SCORES

HOOK_VALUES = parse_scores(<<~SCORES, "hook")
  8 8 6 7 9 6 9 7 9 6 6 7 6 9 8 8 7 7 8 8 10 8 7 7 8 8 7 7 8 7 7 8 6 7 8 9 8 7 7 8 7 8 7 7 9 8 7 8 8 9
  8 9 7 8 8 8 9 9 7 8 8 8 7 8 8 8 9 7 7 6 7 7 8 7 7 7 7 8 7 7 7 7 8 9 8 8 8 9 8 7 7 7 7 8 5 8 7 5 7 8
  8 7 8 9 6 6 5 8 8 9 6 5 9 8 6 5 6 6 7 6 5 9 8 6 7 7 6 7 7 7 7 8 6 6 7 7 10 8 7 7 7 7 7 8 7 7 6 7 7 7
  10 6 7 6 6 6 7 7 6 8 7 6 7 6 7 6 7 7 7 6 6 6 7 7 7 8 6 7 7 7 8 8 9 8 6 7 7 7 8 5 7 8 9 8 5 8 7 6 7 8
  8 6 6 7 8 7 7 8 6 7 6 7 7 7 7 7 6 6 8 7 8 7 9 7 9 6 7 8 8 8 8 8 9 7 7 6 7 7 6 6 7 8 7 7 8 5 7 7 7 7
  5 6 7 8 8 7 6 7 8 8 8 7 6 9 8 8 8 6 7 7 7 6 6 8 8 8 8 7 8 7 8 8 6 7 8 6 7 7 7 6 8 7 8 7 7 7 5 6 6 6
  7 7 6 7 7 7 6 7 7 7 6 8 8 6 8 6 7 7 6 7 7 8 8 7 8 7 6 6 7 7 7 6 9 8 10 7 6 7 6 8 7 6 7 6 7 6 7 7 6 7
  7 6 6 6 7 6 8 7 8 7 8 8 6 7 8 7 5 6 7 7 6 7 7 7 7 7 6 6 7 7 6 7 5 6 7 7 8 8 7 6 7 8 7 8 8 7 7 8 7 5
  7 8 6 7 8 7 7 8 7 6 7 7 5 7 7 9 7 6 6 7 7 9 7 8 8 10 6 7 7 7 8 7 8 9 5 7 6 7 7 7 6 8 7 8 8 8 7 6 7 7
  6 7 9 8 7 6 6 6 7 7 7 7 8 7 6 7 7 8 8 6 7 8 7 8 9 8 7 6 8 7 7 7 8 6 7 6 7 8 8 6 7 8 7 8 7 6 7 6 7 7
  6 7 7 7 7 8 8 6 8 7 7 6 7 7 6 7 8 7 8 7 7 7 8 7 8 9 8 8 7 8 7 7 8 7 7 7 7 8 8 7 9 8 8 8 9 7 7 7 7 7
  6 8 8 8 7 8 8 8 7 7 7 8 7 8 6 7 7 7 8 7 7 7 7 7 6 7 6 7 7 7 8 7 6 7 7 7 7 7 8 7 7 8 6 6 7 7 7 7 7 7
  7 7 7 8 7 7 7 6 7 8 7 7 8 8 7 8 7 7 8 8 7 7 7 7 8 7 7 8 7 7 8 8 6 6 7 6 7 7 7 7 7 6 9 7 7 8 8 6 8 8
  8 7 6 6 7 7 7 8 7 8 7 6 7 6 7 7 8 6 7 8 7 6 8 7 6 7 8 6 7 8 7 8 9 8 7 8 9 7 7 7 7 8 7 7 8 6 7 7 7 7
  6 7 8 6 7 7 8 6 7 8 7 7 8 7 8 8 7 7 8 6 8 7 8 9 9 7 8 7 8 8 8 8 7 8 8 9 7 7 8 6 7 7 7 7 8 8 8 7 8 8
  4
SCORES

TENSION_OVERRIDES = {
  50 => 8, 152 => 9, 541 => 9, 557 => 7, 572 => 8, 583 => 8,
  609 => 7, 611 => 6, 642 => 8, 661 => 6, 670 => 6, 683 => 7,
  727 => 8, 731 => 9, 739 => 9
}.freeze

RIBBON_OVERRIDES = {
  54 => [0.25, 0.26, 0.30, 0.11, 0.08],
  55 => [0.20, 0.22, 0.34, 0.16, 0.08],
  58 => [0.28, 0.17, 0.28, 0.13, 0.14],
  59 => [0.29, 0.13, 0.30, 0.09, 0.19],
  201 => [0.20, 0.17, 0.28, 0.10, 0.25],
  609 => [0.27, 0.24, 0.20, 0.18, 0.11],
  610 => [0.30, 0.17, 0.31, 0.08, 0.14],
  611 => [0.12, 0.22, 0.29, 0.18, 0.19],
  612 => [0.22, 0.11, 0.37, 0.17, 0.13],
  658 => [0.27, 0.10, 0.29, 0.10, 0.24],
  659 => [0.25, 0.12, 0.29, 0.09, 0.25],
  660 => [0.23, 0.18, 0.16, 0.08, 0.35],
  661 => [0.14, 0.18, 0.28, 0.16, 0.24],
  683 => [0.23, 0.22, 0.32, 0.16, 0.07],
  710 => [0.20, 0.24, 0.22, 0.08, 0.26],
  729 => [0.29, 0.13, 0.21, 0.14, 0.23],
  731 => [0.20, 0.36, 0.09, 0.10, 0.25],
  732 => [0.23, 0.25, 0.28, 0.10, 0.14],
  734 => [0.25, 0.16, 0.26, 0.10, 0.23],
  735 => [0.16, 0.22, 0.19, 0.08, 0.35]
}.freeze

NOTE_OVERRIDES = {
  54 => "공장 세 곳 전환과 불량품 교환을 지시한 뒤 사무직·연구원·개발팀 1,500명을 전수 검토한다. 실제 이동 규모는 아직 산정 단계라 조직 정보와 관계 체류가 앞선다.",
  55 => "산업스파이의 금전 흔적을 잡고 사무직 20퍼센트, 원문 표현 수백 명을 적성에 맞춰 옮긴다. 조사 행동과 인사 관계 변화가 함께 크다.",
  59 => "6개 은행과 지분 양도 가능성·10억 달러 예금 조건·다음 날 날인 일정을 맞추는 장면이다. 소유권 지급 전이라 협상 정보와 관계에 오래 머문다.",
  200 => "김익수와의 첫 면담에서 서버비·망사용료·저작권과 수백억 원 세계화 비용을 확인한다. 50억 원 계약은 아직 없어 사업 정보와 미결 선택이 중심이다.",
  201 => "50억 원과 글로벌 합작 조건을 제시하고 김익수가 계약서에 지장을 찍는다. 제안이 서명으로 넘어가는 계약·관계·지위 지급이 봉우리를 만든다.",
  609 => "미아인의 불법대출·차명망을 일주일 안에 조사해 공개할 계획과 김태중의 동의까지만 얻는다. 증거·동결·구속 전이라 정보와 준비 행동에 머문다.",
  610 => "가이아나 30억 달러 군수계약·스테이블코인 공격 준비를 보고받고, 40조 원 불법대출·10조 원 비자금 보고서를 공개해 베트남 정부의 주동자 수습선과 김태중 통로를 확인한다. 압수·계좌동결·구속·정유회사 인수 전이라 정보와 정치 관계가 중심이다.",
  611 => "미아인 구속·정유회사 인수 보고로 앞 사건을 닫은 뒤 부산 축구장의 김태중으로 이동한다. 실물 지급과 조손 관계 전환을 함께 담은 혼합 회차다.",
  612 => "김민재가 축구협회장 지원을 수락하고 연 90억 원 기부·후원사 확대 방침을 정한다. 실제 선거 득표 전이라 관계와 설계에 가장 오래 머문다.",
  658 => "70조 엔 차입은 확정됐지만 크레디트스위스 1달러 인수와 유럽 방공망 참여는 스위스에 제시한 조건이다. 금융 정보와 협상 관계가 앞선다.",
  659 => "스위스의 조건 수락과 EU의 공정경쟁 지원을 받는다. 폴란드 방산·체코 원전·로나 결과 전이라 관계와 산업 진입권 지급에 머문다.",
  660 => "폴란드 20조 원 방산 계약을 확인하고 체코 원전 협상과 로나 숏그물을 이어 간다. 99퍼센트 폭락 전이라 산업 계약과 금융 포지션이 중심이다.",
  661 => "로나 99퍼센트 폭락과 베릴의 공개 복권을 확인한 뒤 김태중에게 해외임무를 부탁한다. 물질 보상 뒤 조손 관계와 감정 전환이 이어진다.",
  683 => "김남훈이 10분 안에 증거를 가져오겠다고 배신을 약속한다. 명단·계좌·비밀번호는 아직 전달 전이라 관계 균열과 미지급 질문에 머문다.",
  710 => "아람코 0.6퍼센트 지분은 실제 지급되고 조지는 일본 금융공격 D-DAY를 정하라는 임무를 받는다. 날짜는 아직 미정이라 자산과 준비 행동이 함께 남는다.",
  729 => "일본 조기상환 대응과 우크라이나 재건 보상안의 방향만 고른다. 젤렌스키에게 구체 자료를 내미는 다음 화 전이라 정보와 선택에 머문다.",
  731 => "엔캐리 전액청산과 니케이 7퍼센트 하락을 실행하면서 자민당 비자금·미국 압박 가능성을 장기 카드로 쌓는다. 일본의 협상요청은 아직 지급하지 않는다.",
  732 => "전액상환 충격을 받은 일본 금융청의 30조 엔 대응, 미국 환율관찰국 지정, 일본 측 협상요청과 투트랙 결정을 다룬다. 전액상환 자체는 진입 배경이다.",
  734 => "곤조에게 자민당 불법자금 카드와 합법적 자금통로를 주고 환율보험 지급조건 충족을 확인한다. 보험금·은행지분 수령 전이라 조건과 관계가 중심이다.",
  735 => "환율보험 보상으로 일본 3대 은행 지분을 실제 받고 검은 건설사 돈을 거절한다. 소유권 지급과 선거자금 규율이 물질·지위 봉우리를 만든다."
}.freeze

PHASE_OVERRIDES = {
  610 => "부패증거 공개·정부 수습선",
  660 => "폴란드 방산 지급·로나 붕괴 대기"
}.freeze

WEIGHT_FIELDS = %w[
  information_weight action_weight relationship_weight emotion_weight
  material_or_status_weight
].freeze

chapter_table = CSV.read(CHAPTER_PATH, headers: true)
pacing_table = CSV.read(PACING_PATH, headers: true)
raise "chapter rows #{chapter_table.size}" unless chapter_table.size == 751
raise "pacing rows #{pacing_table.size}" unless pacing_table.size == 751
raise "pacing header mismatch" unless pacing_table.headers == PACING_HEADER

chapters = chapter_table.to_h { |row| [row["sequence"].to_i, row.to_h] }
old_pacing = pacing_table.to_h { |row| [row["sequence"].to_i, row.to_h] }

semantic_status = {}
semantic_fields = {}
Dir[File.join(WORK, "audit-ledger-*.csv")].sort.each do |path|
  CSV.foreach(path, headers: true) do |row|
    sequence = row["sequence"].to_i
    semantic_status[sequence] = row["status"]
    semantic_fields[sequence] = row["fields_changed"].to_s.split(";")
  end
end
raise "semantic ledger coverage #{semantic_status.size}" unless semantic_status.keys.sort == (1..751).to_a

def fmt_weights(weights)
  weights.map { |value| format("%.2f", value.to_f) }
end

def clean_clause(text)
  text.to_s.strip.sub(/[.;。]+\z/, "")
end

def refreshed_note(chapter, weights)
  labels = ["사건의 조건과 확인 정보", "현장 실행", "인물의 선택과 관계 변화", "감정 반응", "돈·지분·직책의 지급"]
  focus = labels[weights.each_with_index.max_by { |value, _index| value }.last]
  "#{clean_clause(chapter.fetch('action'))}. 독자는 #{focus}에 가장 오래 머문다. 실제 지급은 다음에 한정된다: #{clean_clause(chapter.fetch('paid_reward'))}."
end

new_rows = []
ledger_rows = []

(1..751).each do |sequence|
  chapter = chapters.fetch(sequence)
  old = old_pacing.fetch(sequence)
  raise "order mismatch #{sequence}" unless chapter.fetch("sequence").to_i == sequence && old.fetch("sequence").to_i == sequence

  old_weights = WEIGHT_FIELDS.map { |field| old.fetch(field).to_f }
  new_weights = RIBBON_OVERRIDES.fetch(sequence, old_weights)
  raise "ribbon range #{sequence}" unless new_weights.all? { |value| value.between?(0.0, 1.0) }
  raise "ribbon sum #{sequence}: #{new_weights.sum}" unless (new_weights.sum - 1.0).abs <= 0.01

  tension = TENSION_OVERRIDES.fetch(sequence, old.fetch("tension_1_10").to_i)
  reward = REWARD_VALUES.fetch(sequence - 1)
  hook = HOOK_VALUES.fetch(sequence - 1)
  event = [chapter.fetch("action"), chapter.fetch("turn_or_reveal"), chapter.fetch("paid_reward")].map { |text| clean_clause(text) }.join("; ")

  substantive_edit = (semantic_fields.fetch(sequence) & %w[action turn_or_reveal paid_reward state_change closed_loops]).any?
  note = if NOTE_OVERRIDES.key?(sequence)
    NOTE_OVERRIDES.fetch(sequence)
  elsif substantive_edit
    refreshed_note(chapter, new_weights)
  else
    old.fetch("pacing_note")
  end

  row = old.dup
  row["visible_label"] = chapter.fetch("visible_label")
  row["arc_id"] = chapter.fetch("arc_id")
  row["arc_phase"] = PHASE_OVERRIDES.fetch(sequence, old.fetch("arc_phase"))
  row["concrete_event"] = event
  row["tension_1_10"] = tension.to_s
  row["reward_1_10"] = reward.to_s
  row["hook_1_10"] = hook.to_s
  WEIGHT_FIELDS.zip(fmt_weights(new_weights)).each { |field, value| row[field] = value }
  row["pacing_note"] = note
  new_rows << row

  score_changed = [
    old.fetch("tension_1_10").to_i != tension,
    old.fetch("reward_1_10").to_i != reward,
    old.fetch("hook_1_10").to_i != hook
  ].any?
  ribbon_changed = fmt_weights(old_weights) != fmt_weights(new_weights)
  parts = []
  parts << "긴장은 이 화에서 실제 맞닥뜨린 압박을 기준으로 #{old.fetch('tension_1_10')}→#{tension} 판정" if old.fetch("tension_1_10").to_i != tension
  parts << "보상은 실제 지급만 세어 #{old.fetch('reward_1_10')}→#{reward} 판정" if old.fetch("reward_1_10").to_i != reward
  parts << "훅은 마지막 프레임의 열린 질문만 세어 #{old.fetch('hook_1_10')}→#{hook} 판정" if old.fetch("hook_1_10").to_i != hook
  parts << "리본은 실제 장면 체류에 맞춰 재배분" if ribbon_changed
  parts << "기존 점수·리본 유지; 원문 하드 경계와 인접 회차 대비 재확인" if parts.empty?

  ledger_rows << {
    "sequence" => sequence.to_s,
    "visible_label" => chapter.fetch("visible_label"),
    "source_lines" => "L#{chapter.fetch('start_line')}~L#{chapter.fetch('end_line')}",
    "semantic_status" => semantic_status.fetch(sequence),
    "score_status" => score_changed ? "EDIT" : "PASS",
    "ribbon_status" => ribbon_changed ? "EDIT" : "PASS",
    "old_tension" => old.fetch("tension_1_10"),
    "new_tension" => tension.to_s,
    "old_reward" => old.fetch("reward_1_10"),
    "new_reward" => reward.to_s,
    "old_hook" => old.fetch("hook_1_10"),
    "new_hook" => hook.to_s,
    "old_ribbon" => fmt_weights(old_weights).join("/"),
    "new_ribbon" => fmt_weights(new_weights).join("/"),
    "actual_action" => chapter.fetch("action"),
    "actual_paid_reward" => chapter.fetch("paid_reward"),
    "actual_ending_hook" => chapter.fetch("ending_hook"),
    "concrete_event_before" => old.fetch("concrete_event"),
    "concrete_event_after" => event,
    "pacing_note_before" => old.fetch("pacing_note"),
    "pacing_note_after" => note,
    "adjudication" => parts.join("; ")
  }
end

CSV.open(PACING_PATH, "w", write_headers: true, headers: PACING_HEADER) do |csv|
  new_rows.each { |row| csv << PACING_HEADER.map { |field| row.fetch(field) } }
end

CSV.open(LEDGER_PATH, "w", write_headers: true, headers: LEDGER_HEADER) do |csv|
  ledger_rows.each { |row| csv << LEDGER_HEADER.map { |field| row.fetch(field) } }
end

evidence_rows = new_rows.map do |row|
  sequence = row.fetch("sequence").to_i
  chapter = chapters.fetch(sequence)
  {
    "sequence" => row.fetch("sequence"),
    "visible_label" => row.fetch("visible_label"),
    "arc_id" => row.fetch("arc_id"),
    "arc_phase" => row.fetch("arc_phase"),
    "tension_1_10" => row.fetch("tension_1_10"),
    "reward_1_10" => row.fetch("reward_1_10"),
    "hook_1_10" => row.fetch("hook_1_10"),
    "information_weight" => row.fetch("information_weight"),
    "action_weight" => row.fetch("action_weight"),
    "relationship_weight" => row.fetch("relationship_weight"),
    "emotion_weight" => row.fetch("emotion_weight"),
    "material_or_status_weight" => row.fetch("material_or_status_weight"),
    "ribbon_rationale" => row.fetch("pacing_note"),
    "source_lines" => "L#{chapter.fetch('start_line')}~L#{chapter.fetch('end_line')}"
  }
end

CSV.open(EVIDENCE_PATH, "w", write_headers: true, headers: EVIDENCE_HEADER) do |csv|
  evidence_rows.each { |row| csv << EVIDENCE_HEADER.map { |field| row.fetch(field) } }
end

high_rows = evidence_rows.select do |row|
  [row.fetch("tension_1_10"), row.fetch("reward_1_10"), row.fetch("hook_1_10")].map(&:to_i).max >= 9 ||
    row.fetch("relationship_weight").to_f >= 0.30
end
CSV.open(HIGH_PATH, "w", write_headers: true, headers: EVIDENCE_HEADER) do |csv|
  high_rows.each { |row| csv << EVIDENCE_HEADER.map { |field| row.fetch(field) } }
end

puts "PASS pacing rejudgment rows=#{new_rows.length} ledger=#{ledger_rows.length} high=#{high_rows.length}"
