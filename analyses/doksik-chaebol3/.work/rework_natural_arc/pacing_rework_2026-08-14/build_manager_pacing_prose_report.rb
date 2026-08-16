#!/usr/bin/env ruby
# frozen_string_literal: true

require "csv"
require "digest"

WORK = __dir__
ANALYSIS = File.expand_path("../../..", WORK)
REWORK = File.join(ANALYSIS, ".work/rework_natural_arc")
REVIEWS = File.join(REWORK, "reviews")
OUTPUT = File.join(REVIEWS, "manager-followup-pacing-prose-2026-08-14.md")
START_SHA = "7053d49dc7025e48b56daa2b35458965918ffc570cd66be0f87f4239992581f8"
START_SNAPSHOT = File.join(WORK, "manager-followup-start-chapter_map-7053d49d.csv")

chapters = CSV.read(File.join(ANALYSIS, "chapter_map.csv"), headers: true)
pacing = CSV.read(File.join(ANALYSIS, "arc_pacing.csv"), headers: true)
arcs = CSV.read(File.join(ANALYSIS, "arc_map.csv"), headers: true)
field_audit = CSV.read(File.join(WORK, "chapter-narrative-boundary-audit-001-751.csv"), headers: true)
manual_ledger = CSV.read(File.join(WORK, "manual-pacing-prose-ledger-119.csv"), headers: true)
high = CSV.read(File.join(REWORK, "high-score-and-relationship-evidence.csv"), headers: true)

raise "start snapshot SHA" unless Digest::SHA256.file(START_SNAPSHOT).hexdigest == START_SHA
raise "chapter rows" unless chapters.length == 751
raise "pacing rows" unless pacing.length == 751
raise "arc rows" unless arcs.length == 84
raise "field audit rows" unless field_audit.length == 8_261
raise "manual ledger rows" unless manual_ledger.length == 119

chapter_by_sequence = chapters.to_h { |row| [row["sequence"].to_i, row] }
pace_by_sequence = pacing.to_h { |row| [row["sequence"].to_i, row] }

role_samples = [
  [16, "DCA-N02", "첫"], [21, "DCA-N02", "중간·훅 앵커"], [31, "DCA-N02", "끝"], [32, "DCA-N02", "다음 첫"],
  [154, "DCA-N16", "첫"], [160, "DCA-N16", "중간"], [166, "DCA-N16", "끝"], [167, "DCA-N16", "다음 첫"],
  [192, "DCA-N20", "첫"], [197, "DCA-N20", "중간·관계 앵커"], [199, "DCA-N20", "끝"], [200, "DCA-N20", "다음 첫"],
  [327, "DCA-N31", "첫"], [335, "DCA-N31", "중간·훅 앵커"], [341, "DCA-N31", "끝"], [342, "DCA-N31", "다음 첫"],
  [381, "DCA-N34", "첫"], [391, "DCA-N34", "중간"], [396, "DCA-N34", "끝"], [397, "DCA-N34", "다음 첫"],
  [456, "DCA-N40", "첫"], [459, "DCA-N40", "중간"], [462, "DCA-N40", "끝"], [463, "DCA-N40", "다음 첫"],
  [591, "DCA-N50", "첫"], [597, "DCA-N50", "중간"], [598, "DCA-N50", "끝"], [599, "DCA-N50", "다음 첫"],
  [669, "DCA-N60", "첫"], [672, "DCA-N60", "중간"], [675, "DCA-N60", "끝"], [676, "DCA-N60", "다음 첫"],
  [736, "DCA-N71", "첫"], [738, "DCA-N71", "중간"], [739, "DCA-N71", "끝"], [740, "DCA-N71", "다음 첫"]
]
anchor_samples = [[52, "DCA-N03", "보상 앵커"], [426, "DCA-N36", "보상 앵커"], [745, "DCA-N73", "관계 앵커"]]
fixed_samples = role_samples + anchor_samples
raise "fixed sample count" unless fixed_samples.length == 39 && fixed_samples.map(&:first).uniq.length == 39

fixed_samples.each do |sequence, owner_arc, role|
  current_arc = chapter_by_sequence.fetch(sequence)["arc_id"]
  if role == "다음 첫"
    raise "#{sequence} still in #{owner_arc}" if current_arc == owner_arc
  else
    raise "#{sequence} arc #{current_arc}/#{owner_arc}" unless current_arc == owner_arc
  end
end

escape = lambda { |text| text.to_s.gsub("|", "\\|").gsub(/\s+/, " ").strip }
sample_rows = fixed_samples.map do |sequence, owner_arc, role|
  chapter = chapter_by_sequence.fetch(sequence)
  pace = pace_by_sequence.fetch(sequence)
  ribbon = %w[information_weight action_weight relationship_weight emotion_weight material_or_status_weight]
           .map { |field| pace[field] }.join("/")
  "| #{sequence} | #{owner_arc} | #{role} | L#{chapter['start_line']}~L#{chapter['end_line']} | #{pace['tension_1_10']}/#{pace['reward_1_10']}/#{pace['hook_1_10']} | #{ribbon} | #{escape.call(pace['pacing_note'])} | PASS |"
end.join("\n")

field_edits = field_audit.select { |row| row["result"] == "EDIT" }
field_passes = field_audit.count { |row| row["result"] == "PASS" }
field_edit_sequences = field_edits.map { |row| row["sequence"].to_i }.uniq
field_distribution = field_edits.group_by { |row| row["field"] }.transform_values(&:length).sort.to_h

semantic_files = %w[audit-ledger-001-250.csv audit-ledger-251-500.csv audit-ledger-501-751.csv]
semantic_counts = semantic_files.map do |name|
  rows = CSV.read(File.join(WORK, name), headers: true)
  [name, rows.count { |row| row["status"] == "EDIT" }, rows.count { |row| row["status"] == "PASS" }]
end

score_fields = %w[tension_1_10 reward_1_10 hook_1_10]
score_distributions = score_fields.to_h do |field|
  values = pacing.map { |row| row[field].to_i }
  [field, values.group_by(&:itself).map { |value, group| [value, group.length] }.sort.to_h]
end
distribution_text = lambda do |field|
  score_distributions.fetch(field).map { |score, count| "#{score}:#{count}" }.join(", ")
end

hook_values = pacing.map { |row| row["hook_1_10"].to_i }
hook_high = hook_values.count { |value| value >= 8 }
longest_hook_run = hook_values.chunk_while { |left, right| left >= 8 && right >= 8 }
                              .select { |run| run.first >= 8 }.map(&:length).max || 0

arc_ranges = score_fields.to_h do |field|
  widths = arcs.map do |arc|
    values = (arc["start_sequence"].to_i..arc["end_sequence"].to_i).map { |sequence| pace_by_sequence.fetch(sequence)[field].to_i }
    values.max - values.min
  end
  [field, [widths.count(0), widths.count { |width| width <= 1 }]]
end

weight_fields = %w[information_weight action_weight relationship_weight emotion_weight material_or_status_weight]
ribbon_groups = pacing.group_by { |row| weight_fields.map { |field| row[field] }.join("/") }
duplicate_ribbon_groups = ribbon_groups.count { |_tuple, rows| rows.length > 1 }
notes = pacing.map { |row| row["pacing_note"] }
template_counts = ["독자는", "실제 지급은 다음에 한정된다", "가장 오래 머문다"].to_h do |phrase|
  [phrase, notes.count { |note| note.include?(phrase) }]
end
meta_pattern = /지배한다|비중|리본|독서 시간|(?:정보|행동|관계|감정|물질|지위|돈)(?:·(?:정보|행동|관계|감정|물질|지위|돈))*\s*회차(?:다|이다)|(?:정보|행동|관계|감정|물질|지위|돈).{0,8}(?:중심|주축)|(?:정보|행동|관계|감정|물질|지위|돈).{0,8}(?:높다|크다|압도한다)/
meta_count = notes.count { |note| note.match?(meta_pattern) }

counterexamples = [
  [50, "L9210~L9397", "다음 화 사진·녹취를 제거하고 1면 허위기사·SAVE 반박자료·세 나라 이벤트까지만 소유"],
  [96, "L17616~L17784", "9호선·거가대교를 제거하고 퀀텀 전면명·7퍼센트·장기 운영구조까지만 소유"],
  [154, "L28006~L28171", "서광수 투자협상을 제거하고 세이월드 대표 면담 요청까지만 소유; 관계 ribbon 0.37→0.20"],
  [192, "L34777~L34942", "천민우·추영택과 배경을 제거하고 ‘천민정의 동생’·폭력영상까지만 소유"],
  [230, "L41259~L41447", "4조 원 낙찰가를 제거하고 태우의 입찰 승리 통보까지만 소유"],
  [264, "L46932~L47106", "CITI 2만 명 감원을 제거하고 리먼 파산설·수확기 진입까지만 소유"],
  [335, "L58840~L59004", "대피·자료·조달선 지급과 회장직을 건 공식책임 상태를 분리; 대지진은 마지막 훅"],
  [391, "L68452~L68641", "일주일 정밀조사·시장작전을 제거하고 최소 50억 배럴 첫 추정까지만 소유"],
  [394, "L68991~L69182", "공개매수를 제거하고 헤스 지분 3년 임대·정체를 감춘 시장 이벤트까지만 소유"],
  [513, "L89697~L89854", "ASML을 제거하고 인도·베트남 레거시 팹·HBM/GPU·한국 부지까지만 소유"],
  [514, "L89855~L90022", "피터슨·EUV/DUV를 제거하고 ASML 직접협상 결정·방문계획까지만 소유"],
  [568, "L99285~L99462", "G7 비반대·20조 엔 자산을 제거하고 일본 접촉·호주 회담 장소까지만 소유"],
  [577, "L100880~L101041", "새 얼굴·구체 서사를 제거하고 개인투자자를 밀 촉매의 필요까지만 소유"],
  [597, "L104261~L104422", "아시아 생산권을 제거하고 협회장 방한·정회원 계획까지만 소유"],
  [605, "L105610~L105770", "가이아나·호주산 석탄 선점을 제거하고 몽골 증산·비축·QUAD 부담까지만 소유"],
  [606, "L105771~L105925", "모리슨·구체 계약을 제거하고 동해 저장고·호주/가이아나 출장분담까지만 소유"],
  [619, "L108010~L108186", "나흘 재개통·우선통항·확장공사를 제거하고 준설·예인 진행과 비용귀속까지만 소유"],
  [669, "L116315~L116471", "구단 급료 해결을 다음 화로 돌리고 지원 의사·연락·EPL 재회 약속까지만 소유"],
  [675, "L117280~L117454", "산업계약·숏 수익 완료를 제거하고 프로젝트 배정 의사·비용안·25만 배럴 증산 발표까지만 소유"],
  [676, "L117455~L117594", "시장개혁 확정을 제거하고 부산 엑스포 지원·보고서 긍정검토 약속까지만 소유"]
]
counterexample_rows = counterexamples.map do |sequence, lines, result|
  edited_fields = field_edits.select { |row| row["sequence"].to_i == sequence }.map { |row| row["field"] }.join(", ")
  "| #{sequence} | #{lines} | #{escape.call(result)} | #{escape.call(edited_fields)} |"
end.join("\n")

sha_targets = [
  "arc_map.csv", "chapter_map.csv", "arc_pacing.csv", "arc_atlas.md", "project_bible.md",
  "inkos_usage_and_gap_report.md", "free_improvements_report.md", "completion_receipt.md",
  ".work/rework_natural_arc/pacing_rework_2026-08-14/manager-followup-start-chapter_map-7053d49d.csv",
  ".work/rework_natural_arc/pacing_rework_2026-08-14/chapter-narrative-boundary-audit-001-751.csv",
  ".work/rework_natural_arc/pacing_rework_2026-08-14/manual-pacing-prose-ledger-119.csv",
  ".work/rework_natural_arc/pacing_rework_2026-08-14/pacing-rejudgment-ledger-001-751.csv"
]
sha_rows = sha_targets.map do |relative|
  "| `#{relative}` | `#{Digest::SHA256.file(File.join(ANALYSIS, relative)).hexdigest}` |"
end.join("\n")

semantic_table = semantic_counts.map { |name, edit, pass| "| `#{name}` | #{edit} | #{pass} |" }.join("\n")
field_distribution_text = field_distribution.map { |field, count| "#{field}=#{count}" }.join(", ")

report = <<~MARKDOWN
  # 《독식하는 재벌 3세》 관리자 후속 · 페이싱 문장·회차 경계 재감사 · 2026-08-14

  ## 상태

  `AWAITING_MANAGER_APPROVAL`

  84개 자연 NarrativeArc는 보존했다. 이 보고서는 관리자 SYSTEMIC FAIL 뒤 수행한 페이싱 문장과 회차 경계 교정의 자체 readback이다. 관리자 승인을 대신하지 않으며 커밋·푸시하지 않았다.

  ## 시작 영수증과 before 권위본

  관리자 후속 시작 `chapter_map.csv`를 작업대에 불변 스냅샷으로 보존했다.

  - 파일: `pacing_rework_2026-08-14/manager-followup-start-chapter_map-7053d49d.csv`
  - SHA-256: `#{START_SHA}`
  - 재현 순서: pre-pacing checkpoint → `apply_chapter_corrections_001_250.rb` → `251_500` → `501_751` → `apply_n20_resegmentation.rb` → `apply_n33_n34_followup.rb`
  - `apply_manual_pacing_prose_followup.rb`와 전용 validator는 이 전체 SHA가 다르면 쓰기 전에 중단한다.

  따라서 장부 생성 전에 고친 96·192·394·513·514·568·597·605·606화도 현재값을 before로 둔 PASS가 아니다. 시작 스냅샷의 실제 문장이 `before`, 현재 정본이 `after`이며 `PRE_LEDGER_EDIT / before unavailable` 항목은 0개다.

  ## 기계적 문장 재현과 제거

  시작 시 `pacing_note` 751행 중 119행이 `<action>. 독자는 <범용 분류>에 가장 오래 머문다. 실제 지급은 다음에 한정된다: <paid_reward>.` 골격을 공유했다. 당시 문구 count는 `독자는 119`, `실제 지급은 다음에 한정된다 119`, `가장 오래 머문다 120`이었다.

  119행은 `manual-pacing-prose-ledger-119.csv`에 각각 실제 before/after, 원문 line, 다음 화 line, 점수·ribbon 유지/수정 여부를 남겼다. 그 밖의 범용 문장과 고정 표본도 장면·인물·물건·금액·마지막 프레임으로 다시 썼다. 최종 readback은 다음과 같다.

  | 검사 | 결과 |
  | --- | ---: |
  | `독자는` | #{template_counts.fetch('독자는')} |
  | `실제 지급은 다음에 한정된다` | #{template_counts.fetch('실제 지급은 다음에 한정된다')} |
  | `가장 오래 머문다` | #{template_counts.fetch('가장 오래 머문다')} |
  | 의미상 편집 메타 골격 | #{meta_count} |
  | 완전중복 note | #{751 - notes.uniq.length} |
  | 고유 note | #{notes.uniq.length}/751 |

  `apply_pacing_rework.rb`와 `apply_pacing_microfixes.rb`는 템플릿을 다시 만들지 못하도록 시작부에서 fail-closed한다. 권위 재현 경로는 원문·불변 before 스냅샷을 요구하는 `apply_manual_pacing_prose_followup.rb`뿐이다.

  ## 11개 narrative field 전수 장부

  `entry_state`, `reader_promise`, `protagonist_goal`, `action`, `resistance_or_cost`, `turn_or_reveal`, `paid_reward`, `state_change`, `ending_hook`, `closed_loops`, `opened_loops`를 751화에 대해 모두 기록했다.

  - 전체: 8,261필드
  - EDIT: #{field_edits.length}필드 / #{field_edit_sequences.length}회차
  - PASS: #{field_passes}필드
  - EDIT 분포: #{field_distribution_text}

  | 범위 장부 | EDIT 회차 | PASS 회차 |
  | --- | ---: | ---: |
  #{semantic_table}

  ## 경계 반례와 교정 결과

  | 화 | 원문 하드 경계 | 현재 화가 소유하는 사실 | EDIT 필드 |
  | ---: | --- | --- | --- |
  #{counterexample_rows}

  154화는 이전 재판정 장부의 before/after note가 같아 서광수 협상 누출을 놓쳤던 사실을 숨기지 않았다. 675·676화는 이번 고정 39화 readback에서 추가로 발견했다. 675화의 사우디 산업계약은 `맡기기로 함·이번 주 세부 합의 예정`이고 676화의 금융타워 보고서는 `이번 주 전달·긍정 검토 약속`이므로 서명·정책 시행으로 쓰지 않았다.

  ## 고정 39화 표본

  초·중·후반 9개 Arc에서 첫/중간/끝/다음 첫을 읽었다. 21·335화는 훅 앵커, 197화는 관계 앵커와 겹친다. 별도 앵커 52·426·745화를 더해 중복 없는 39화다. 각 행은 해당 화 첫 장면부터 마지막 프레임, 다음 화 첫 10줄까지 대조했다.

  | 화 | 표본 소유 Arc | 역할 | 원문 | T/R/H | ribbon I/A/R/E/M | 현재 편집판정 | 경계 |
  | ---: | --- | --- | --- | --- | --- | --- | --- |
  #{sample_rows}

  표본 첫 readback에서 669화의 급료 해결 선취, 675화의 정식계약·숏 수익 완료 과장, 676화의 시장개혁 확정 과장을 발견해 정본·페이싱·Atlas·장부를 교정했다. 교정 뒤 결과는 `39/39 PASS`다.

  ## 점수와 ribbon readback

  - T: `#{distribution_text.call('tension_1_10')}`
  - R: `#{distribution_text.call('reward_1_10')}`
  - H: `#{distribution_text.call('hook_1_10')}`
  - H≥8: `#{hook_high}/751`, #{format('%.2f', hook_high.fdiv(751) * 100)}퍼센트. 최장 연속 #{longest_hook_run}화
  - Arc별 상수/1점폭 이내: T `#{arc_ranges.fetch('tension_1_10').join('/')}`, R `#{arc_ranges.fetch('reward_1_10').join('/')}`, H `#{arc_ranges.fetch('hook_1_10').join('/')}`
  - ribbon: #{ribbon_groups.length}/751 고유, 중복 그룹 #{duplicate_ribbon_groups}. 전 행 0~1이고 합계 `1±0.01`
  - 고득점 또는 관계 0.30 이상 evidence: #{high.length}행

  점수 분포를 목표값에 맞춰 조작하지 않았다. 675화도 형식상 정식계약 전이지만 프로젝트 배정 의사·비용분담안과 25만 배럴 증산 발표가 실제로 있어 R9를 유지했고, 장면 체류는 계약 완료 중심에서 프로젝트 수치·바그너 대화·증산 발표가 함께 보이도록 `I0.30/A0.14/R0.20/E0.12/M0.24`로 고쳤다.

  ## 파생층과 재현 경로

  - `arc_pacing.csv`: 751개 note·score·ribbon과 `concrete_event` 동기화
  - `arc_atlas.md`: 현재 세 CSV를 펼친 readback으로 재생성
  - `pacing-all-evidence.csv`, `high-score-and-relationship-evidence.csv`: 현재 note·score·ribbon 동기화
  - `pacing-rejudgment-ledger-001-751.csv`: 전 751화의 actual action/reward/hook와 after note 동기화
  - `completion_receipt.md`, 두 개선 보고서, Bible: 현재 화에서 보이는 이름·계약상태·지급만 정본화하는 규칙 반영

  ## 게이트

  1. `validate_pacing_rework.rb` → `PASS pacing rework readback: source=751 chapters=751 arcs=84 errors=0`
  2. `validate_n33_n34_followup.rb` → `PASS N33/N34 follow-up: source=751 chapters=751 arcs=84 errors=0`
  3. `validate_pacing_prose_template_lint.rb` → `PASS ... rows=751 unique=751 manual=119 exact_templates=0 semantic_meta=0 legacy_writers=fail-closed`
  4. 공식 strict → `PASS 독식하는 재벌 3세: 751회 / 84 Arc / 오류 0 / 경고 0`

  ## 핵심 SHA-256

  | 파일 | SHA-256 |
  | --- | --- |
  #{sha_rows}

  ## 관리자 승인 전 보류

  - 84개 Arc 구조는 바꾸지 않았다.
  - 669·675·676화처럼 새 표본에서 나온 결함도 PASS로 꾸미지 않고 교정 이력에 남겼다.
  - 이 보고서는 자체 게이트 영수증이며 관리자 골드 승인을 선언하지 않는다.
  - 커밋·푸시하지 않았다.

  `AWAITING_MANAGER_APPROVAL`
MARKDOWN

File.write(OUTPUT, report)
puts "PASS manager pacing prose report: fixed_samples=39 field_edits=#{field_edits.length}/#{field_edit_sequences.length} notes=#{notes.uniq.length}/751 output=#{OUTPUT}"
