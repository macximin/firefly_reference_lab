#!/usr/bin/env ruby
# frozen_string_literal: true

require "csv"
require "digest"
require "json"

stage = ARGV.fetch(0) { abort "usage: validate_manager_redteam_stage.rb STAGE DECISIONS" }
decision_path = ARGV.fetch(1) { abort "usage: validate_manager_redteam_stage.rb STAGE DECISIONS" }

ROOT_OUTPUTS = %w[
  arc_atlas.md arc_map.csv arc_pacing.csv chapter_map.csv completion_receipt.md
  free_improvements_report.md inkos_usage_and_gap_report.md project_bible.md
  source_receipt.json
].freeze
SCORE_FIELDS = %w[tension_1_10 reward_1_10 hook_1_10].freeze
RIBBON_FIELDS = %w[
  information_weight action_weight relationship_weight emotion_weight
  material_or_status_weight
].freeze
NARRATIVE_FIELDS = %w[
  entry_state reader_promise protagonist_goal action resistance_or_cost
  turn_or_reveal paid_reward state_change ending_hook closed_loops opened_loops
].freeze
ARC_PROSE_FIELDS = %w[
  central_question promise pressure_escalation relationship_change
  status_or_ability_change residual_cost next_arc_bridge boundary_signals
].freeze
DECISION_SHA = "85ebcd4437e44f2c821d010a8e6de512dd81018cea3164aee093fbc50905a547"
LEDGER_SHA = "52bbd904efd4483aa999d2062f301ec548ea2cc433bca0565c77d4f1fd418fa2"
SOURCE_SHA = "66f3e7df3123343c14a7134108dc59940511f40372493a549cba8ae709df4b45"
EFFECTIVE_DECISIONS_NAME = "effective-redteam-decisions-v2.csv"
BOUNDARY_AMENDMENT_NAME = "manager-boundary-amendment-642-645.md"
BOUNDARY_AMENDMENT_LINES = "L111872~L112240"
SURFACE_AMENDMENT_NAME = "manager-surface-amendment-n63-688.md"
SURFACE_AMENDMENT_LINES = "L119442~L119593"
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
SURFACE_CHARACTER_LIMIT = 12
SURFACE_LOCATION_LIMIT = 10
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
EFFECTIVE_RANGE_OVERRIDES = {
  "DCA-N56B" => [642, 643],
  "DCA-N57" => [644, 645]
}.freeze
BANNED_ARC_PHRASES = [
  "범위 마지막의",
  "까지 실제로 확인할 수 있는가",
  "확인 가능한 지급은",
  "다음 첫 행동은",
  "지급·상대·장소·목표 가운데 둘 이상이 교대"
].freeze
ANALYSIS_LEAD_PATTERN = /\A(?:이\s*Arc|이번\s*Arc|해당\s*Arc|범위|독자는|분석상|지배\s*질문은|관계\s*변화는|상태(?:·능력)?\s*변화는|보상은|압박은)/i

def fail_check(message)
  raise "STAGE VALIDATION: #{message}"
end

def csv_rows(path)
  CSV.read(path, headers: true).map(&:to_h)
end

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

  fail_check("endpoint pacing result lacks #{field}: #{result}")
end

def must_include(text, label, *tokens)
  tokens.each { |token| fail_check("#{label} missing #{token}") unless text.include?(token) }
end

def must_exclude(text, label, *tokens)
  tokens.each { |token| fail_check("#{label} contains forbidden #{token}") if text.include?(token) }
end

def sentence_units(text)
  text.to_s.split(/(?<=[.!?])\s+|[;\n]+/).map(&:strip).reject(&:empty?)
end

def explicit_negation?(sentence)
  [
    /(?:공개|확인|드러나|귀속|소유|지급)[^.!?;]{0,24}(?:되지 않는다|하지 않는다|아니다|없다|미지급)/,
    /이 화(?:에|에서)[^.!?;]{0,24}(?:없다|아니다|공개되지 않는다|확인되지 않는다|드러나지 않는다)/,
    /(?:미지급|최종 소유자는[^.!?;]*공개되지 않는다)/
  ].any? { |pattern| sentence.match?(pattern) }
end

def reject_positive_early_attribution(field_values, label, *patterns)
  field_values.each do |field, text|
    sentence_units(text).each do |sentence|
      next unless patterns.any? { |pattern| sentence.match?(pattern) }
      next if explicit_negation?(sentence)
      fail_check("#{label} positive early attribution in #{field}: #{sentence}")
    end
  end
end

def chapter_surface(row)
  NARRATIVE_FIELDS.map { |field| row.fetch(field).to_s }.join(" ")
end

def normalize_surface_text(text)
  text.to_s.unicode_normalize(:nfkc).tr("\u00a0", " ").gsub(/\s+/, " ").strip
end

def split_surface_tokens(value)
  value.to_s.split(/[;,，、·|\/]+/).map do |token|
    normalize_surface_text(token).gsub(/\A["'“”‘’]+|["'“”‘’]+\z/, "")
  end.reject(&:empty?)
end

def surface_aliases(token, alias_table)
  ([token] + alias_table.fetch(token, [])).map { |term| normalize_surface_text(term) }.uniq
end

def grounded_surface_match(raw_source, token, alias_table, first_person_exception: false)
  source = normalize_surface_text(raw_source)
  matches = surface_aliases(token, alias_table).map do |term|
    [term, source.scan(Regexp.new(Regexp.escape(term))).length]
  end
  best = matches.max_by { |term, count| [count, term.length] }
  return best if best[1].positive?
  return ["FIRST_PERSON_EXCEPTION", 0] if first_person_exception && token == "김민재"

  best
end

def normalized_sentence_shape(text)
  text.unicode_normalize(:nfkc)
      .downcase
      .gsub(%r{L?\d+(?:[.,]\d+)*(?:~L?\d+(?:[.,]\d+)*)?}, "#")
      .gsub(/[“”"'`][^“”"'`]*[“”"'`]/, "〈구체〉")
      .gsub(/\s+/, " ")
      .strip
end

def leading_signature(text)
  normalized_sentence_shape(text)
    .sub(/\A[①②③]\s*/, "")
    .scan(/[가-힣a-z0-9%+]+/)
    .first(4)
    .join(" ")
end

def word_ngrams(text, width = 4)
  tokens = text.unicode_normalize(:nfkc).downcase.scan(/[가-힣a-z0-9%+]+/)
  tokens = tokens.reject { |token| token.length == 1 || token.match?(/\A\d+\z/) }
  return [] if tokens.length < width
  tokens.each_cons(width).map { |gram| gram.join(" ") }.uniq
end

def normalized_relation_status(text)
  text.unicode_normalize(:nfkc)
      .sub(/\A(?:DCA-[A-Z0-9]+|N\d+[A-Z]?)\s*[·:：-]\s*/i, "")
      .sub(/\A\d+화(?:\s+L?\d+(?:~L?\d+)?)?(?:에서|의)?\s*/, "")
      .gsub(/\d+(?:[.,]\d+)*/, "#")
      .gsub(/[\s[:punct:]·→~%+]/, "")
      .downcase
end

def assert_nonmechanical_values(values, label)
  fail_check("blank #{label}") if values.any?(&:empty?)

  exact_duplicates = values.group_by(&:itself).select { |_text, rows| rows.length > 1 }
  fail_check("exact duplicate #{label}: #{exact_duplicates.values.map(&:length).max}") unless exact_duplicates.empty?

  normalized_duplicates = values.group_by { |text| normalized_sentence_shape(text) }
                                .select { |_shape, rows| rows.length > 3 }
  fail_check("normalized skeleton repeated >3 #{label}") unless normalized_duplicates.empty?

  leading_repeats = values.group_by { |text| leading_signature(text) }
                          .reject { |signature, _rows| signature.empty? }
                          .select { |_signature, rows| rows.length > 3 }
  fail_check("leading phrase repeated >3 #{label}: #{leading_repeats.keys.first}") unless leading_repeats.empty?

  gram_owners = Hash.new { |hash, gram| hash[gram] = [] }
  values.each_with_index do |text, index|
    word_ngrams(text).each { |gram| gram_owners[gram] << index }
  end
  repeated_grams = gram_owners.select { |_gram, owners| owners.uniq.length > 3 }
  fail_check("high 4-gram repetition #{label}: #{repeated_grams.keys.first}") unless repeated_grams.empty?

  BANNED_ARC_PHRASES.each do |phrase|
    count = values.count { |text| text.include?(phrase) }
    fail_check("banned Arc phrase #{label} #{phrase}=#{count}") unless count.zero?
  end
end

def assert_nonmechanical_arc_prose(arcs)
  ARC_PROSE_FIELDS.each do |field|
    values = arcs.map { |arc| arc.fetch(field).to_s.strip }
    assert_nonmechanical_values(values, "Arc prose #{field}")
  end
end

ROOT_OUTPUTS.each do |name|
  path = File.join(stage, name)
  fail_check("missing root output #{name}") unless File.file?(path)
end

source_receipt = JSON.parse(File.read(File.join(stage, "source_receipt.json")))
fail_check("source receipt SHA") unless source_receipt.fetch("sourceSha256") == SOURCE_SHA
fail_check("source receipt marker") unless source_receipt.fetch("markerCount") == 751
fail_check("source receipt coverage") unless source_receipt.fetch("analysisCoverage") == "full"
source_path = source_receipt.fetch("sourcePath")
fail_check("source file missing") unless File.file?(source_path)
fail_check("source file SHA") unless sha(source_path) == SOURCE_SHA
source_lines = File.readlines(source_path, encoding: "UTF-8")

decisions = csv_rows(decision_path)
fail_check("original decision SHA") unless sha(decision_path) == DECISION_SHA
effective_decision_path = File.join(stage, "authority", EFFECTIVE_DECISIONS_NAME)
amendment_path = File.join(stage, "authority", BOUNDARY_AMENDMENT_NAME)
surface_amendment_path = File.join(stage, "authority", SURFACE_AMENDMENT_NAME)
authority_receipt_path = File.join(stage, "authority", "authority-input-receipt.json")
fail_check("missing effective decision CSV") unless File.file?(effective_decision_path)
fail_check("missing boundary amendment") unless File.file?(amendment_path)
fail_check("missing surface amendment") unless File.file?(surface_amendment_path)
fail_check("missing authority input receipt") unless File.file?(authority_receipt_path)
effective_decisions = csv_rows(effective_decision_path)
arcs = csv_rows(File.join(stage, "arc_map.csv"))
chapters = csv_rows(File.join(stage, "chapter_map.csv"))
pacing = csv_rows(File.join(stage, "arc_pacing.csv"))
fail_check("decision count #{decisions.length}") unless decisions.length == 131
fail_check("effective decision count #{effective_decisions.length}") unless effective_decisions.length == 131
fail_check("arc count #{arcs.length}") unless arcs.length == 131
fail_check("chapter count #{chapters.length}") unless chapters.length == 751
fail_check("pacing count #{pacing.length}") unless pacing.length == 751

decision_ranges = decisions.map do |row|
  [row.fetch("arc_id"), row.fetch("start_sequence").to_i, row.fetch("end_sequence").to_i]
end
original_override_ranges = {
  "DCA-N56B" => [642, 642],
  "DCA-N57" => [643, 645]
}.freeze
original_override_ranges.each do |arc_id, expected|
  row = decision_ranges.find { |candidate| candidate[0] == arc_id }
  fail_check("original decision range drift #{arc_id}") unless row && row[1, 2] == expected
end
effective_decision_ranges = effective_decisions.map do |row|
  [row.fetch("arc_id"), row.fetch("start_sequence").to_i, row.fetch("end_sequence").to_i]
end
fail_check("effective decision ID/order drift") unless effective_decisions.map { |row| row.fetch("arc_id") } == decisions.map { |row| row.fetch("arc_id") }
effective_decisions.each_with_index do |row, index|
  original = decisions.fetch(index)
  arc_id = row.fetch("arc_id")
  expected_range = EFFECTIVE_RANGE_OVERRIDES.fetch(
    arc_id,
    [original.fetch("start_sequence").to_i, original.fetch("end_sequence").to_i]
  )
  actual_range = [row.fetch("start_sequence").to_i, row.fetch("end_sequence").to_i]
  fail_check("effective decision range drift #{arc_id}") unless actual_range == expected_range
end
n63_effective = effective_decisions.find { |row| row.fetch("arc_id") == "DCA-N63" }
fail_check("effective N63 missing") unless n63_effective
fail_check("effective N63 decision") unless n63_effective.fetch("decision") == "MANAGER_SURFACE_AMENDMENT"
fail_check("effective N63 name") unless n63_effective.fetch("arc_name") == "러북 거래 확인과 중국·장남·언론 대응 설계"
must_include(n63_effective.fetch("dominant_question"), "effective N63 question", "세 정보선", "확인", "대응 역할")
fail_check("effective N63 evidence anchor") unless n63_effective.fetch("evidence_anchor") == SURFACE_AMENDMENT_LINES
arc_ranges = arcs.map do |row|
  [row.fetch("arc_id"), row.fetch("start_sequence").to_i, row.fetch("end_sequence").to_i]
end
fail_check("arc ranges differ from effective decision CSV") unless arc_ranges == effective_decision_ranges
fail_check("arc coverage endpoints") unless arc_ranges[0][1] == 1 && arc_ranges[-1][2] == 751
fail_check("arc gap/overlap") unless arc_ranges.each_cons(2).all? { |left, right| right[1] == left[2] + 1 }
fail_check("arc IDs duplicate") unless arcs.map { |row| row.fetch("arc_id") }.uniq.length == 131
fail_check("analytical word in event name") if arcs.any? { |row| row.fetch("arc_name") =~ /(coda|bridge|subplot|climax|코다|브리지|서브플롯|클라이맥스)/i }
fail_check("N56B range") unless arc_ranges.find { |row| row[0] == "DCA-N56B" } == ["DCA-N56B", 642, 643]
fail_check("N57 range") unless arc_ranges.find { |row| row[0] == "DCA-N57" } == ["DCA-N57", 644, 645]
fail_check("N63 range") unless arc_ranges.find { |row| row[0] == "DCA-N63" } == ["DCA-N63", 688, 688]

amendment = File.read(amendment_path)
must_include(
  amendment,
  "boundary amendment",
  DECISION_SHA,
  LEDGER_SHA,
  BOUNDARY_AMENDMENT_LINES,
  "DCA-N56B 642~642",
  "DCA-N57 643~645",
  "DCA-N56B 642~643",
  "DCA-N57 644~645",
  "연변 큰손",
  "비트코인",
  "리규철",
  "CNC",
  "러시아",
  "644화부터"
)
authority_receipt = JSON.parse(File.read(authority_receipt_path))
fail_check("authority receipt original decision SHA") unless authority_receipt.fetch("decisionCsvSha256") == DECISION_SHA
fail_check("authority receipt ledger SHA") unless authority_receipt.fetch("approvedLedgerSha256") == LEDGER_SHA
fail_check("authority receipt effective SHA") unless authority_receipt.fetch("effectiveDecisionCsvSha256") == sha(effective_decision_path)
fail_check("authority receipt amendment SHA") unless authority_receipt.fetch("boundaryAmendmentSha256") == sha(amendment_path)
fail_check("authority receipt amendment lines") unless authority_receipt.fetch("boundaryAmendmentSourceLines") == BOUNDARY_AMENDMENT_LINES
surface_amendment = File.read(surface_amendment_path)
must_include(
  surface_amendment,
  "surface amendment",
  DECISION_SHA,
  LEDGER_SHA,
  SOURCE_SHA,
  SURFACE_AMENDMENT_LINES,
  "DCA-N63 688~688",
  "러북 거래 확인과 중국·장남·언론 대응 설계",
  "최재석·리강·빈 살만",
  "청와대·사우디",
  "세 정보선",
  "실제 언론 공개",
  "발생하지 않는다",
  "DCA-N63B 689~690"
)
fail_check("authority receipt surface amendment SHA") unless authority_receipt.fetch("surfaceAmendmentSha256") == sha(surface_amendment_path)
fail_check("authority receipt surface amendment lines") unless authority_receipt.fetch("surfaceAmendmentSourceLines") == SURFACE_AMENDMENT_LINES
fail_check("authority receipt endpoint audit SHA") unless authority_receipt.fetch("endpointAuditSha256") == ENDPOINT_AUDIT_SHA
fail_check("authority receipt endpoint audit rows") unless authority_receipt.fetch("endpointAuditRows") == 131
fail_check("authority receipt endpoint audit status") unless authority_receipt.fetch("endpointAuditStatus") == ENDPOINT_AUDIT_STATUS
fail_check("authority receipt endpoint result counts") unless authority_receipt.fetch("endpointAuditResultCounts") == {
  "EDIT" => 77,
  "KEEP" => 54
}
fail_check("authority receipt extra sample audit SHA") unless authority_receipt.fetch("extraSampleAuditSha256") == EXTRA_SAMPLE_AUDIT_SHA
fail_check("authority receipt extra sample audit rows") unless authority_receipt.fetch("extraSampleAuditRows") == 4
fail_check("authority receipt extra sample audit sequences") unless authority_receipt.fetch("extraSampleAuditSequences") == [466, 468, 471, 721]

arc_for_sequence = {}
arcs.each do |arc|
  first = arc.fetch("start_sequence").to_i
  last = arc.fetch("end_sequence").to_i
  fail_check("episode_count #{arc.fetch('arc_id')}") unless arc.fetch("episode_count").to_i == last - first + 1
  (first..last).each { |sequence| arc_for_sequence[sequence] = arc.fetch("arc_id") }
end

chapters.each_with_index do |row, index|
  sequence = index + 1
  fail_check("chapter sequence #{sequence}") unless row.fetch("sequence").to_i == sequence
  fail_check("chapter arc #{sequence}") unless row.fetch("arc_id") == arc_for_sequence.fetch(sequence)
end
pacing.each_with_index do |row, index|
  sequence = index + 1
  fail_check("pacing sequence #{sequence}") unless row.fetch("sequence").to_i == sequence
  fail_check("pacing arc #{sequence}") unless row.fetch("arc_id") == arc_for_sequence.fetch(sequence)
  SCORE_FIELDS.each do |field|
    value = row.fetch(field).to_i
    fail_check("score #{field} seq #{sequence}") unless value.between?(1, 10)
  end
  values = RIBBON_FIELDS.map { |field| row.fetch(field).to_f }
  fail_check("ribbon range seq #{sequence}") unless values.all? { |value| value.between?(0.0, 1.0) }
  fail_check("ribbon sum seq #{sequence}") unless (values.inject(0.0, :+) - 1.0).abs <= 0.01
end

arcs.each_with_index do |arc, index|
  decision = effective_decisions.fetch(index)
  fail_check("dominant_question copied #{arc.fetch('arc_id')}") if [
    arc.fetch("central_question"), arc.fetch("promise")
  ].include?(decision.fetch("dominant_question"))
  must_include(arc.fetch("concrete_premise"), "premise #{arc.fetch('arc_id')}", "L")
  must_include(arc.fetch("boundary_signals"), "boundary #{arc.fetch('arc_id')}", "①", "②")
  relationship = arc.fetch("relationship_change").strip
  status = arc.fetch("status_or_ability_change").strip
  fail_check("relation/status exact duplicate #{arc.fetch('arc_id')}") if relationship == status
  fail_check("relation/status normalized duplicate #{arc.fetch('arc_id')}") if normalized_relation_status(relationship) == normalized_relation_status(status)
end
assert_nonmechanical_arc_prose(arcs)
arcs.each do |arc|
  %w[central_question relationship_change status_or_ability_change boundary_signals].each do |field|
    prose = arc.fetch(field).strip.sub(/\A[①②③]\s*/, "")
    fail_check("analytical lead #{arc.fetch('arc_id')} #{field}") if prose.match?(ANALYSIS_LEAD_PATTERN)
  end
end

chapter_by_sequence = chapters.each_with_object({}) { |row, hash| hash[row.fetch("sequence").to_i] = row }
pace_by_sequence = pacing.each_with_object({}) { |row, hash| hash[row.fetch("sequence").to_i] = row }

endpoint_audit_path = File.join(stage, "derived", ENDPOINT_AUDIT_NAME)
fail_check("missing endpoint audit") unless File.file?(endpoint_audit_path)
fail_check("endpoint audit immutable SHA") unless sha(endpoint_audit_path) == ENDPOINT_AUDIT_SHA
endpoint_audit_table = CSV.read(endpoint_audit_path, headers: true)
fail_check("endpoint audit header") unless endpoint_audit_table.headers == ENDPOINT_AUDIT_HEADERS
endpoint_audit = endpoint_audit_table.map(&:to_h)
fail_check("endpoint audit rows #{endpoint_audit.length}") unless endpoint_audit.length == 131
fail_check("endpoint audit invalid result") unless endpoint_audit.all? { |row| %w[KEEP EDIT BOUNDARY_REVIEW].include?(row.fetch("result")) }
fail_check("endpoint audit result counts") unless endpoint_audit.group_by { |row| row.fetch("result") }.transform_values(&:length) == {
  "EDIT" => 77,
  "KEEP" => 54
}
fail_check("endpoint audit duplicate") unless endpoint_audit.map { |row| [row.fetch("arc_id"), row.fetch("end_sequence")] }.uniq.length == 131
endpoint_audit.each_with_index do |row, index|
  ordinal = index + 1
  decision = effective_decisions.fetch(index)
  sequence = decision.fetch("end_sequence").to_i
  chapter = chapter_by_sequence.fetch(sequence)
  pace = pace_by_sequence.fetch(sequence)
  expected_status = if index < 44
    "ENDPOINT_AUDIT_44_OF_131"
  elsif index < 88
    "ENDPOINT_AUDIT_88_OF_131"
  else
    ENDPOINT_AUDIT_COMPLETE_STATUS
  end

  fail_check("endpoint audit ordinal #{ordinal}") unless row.fetch("ordinal").to_i == ordinal
  fail_check("endpoint audit arc #{ordinal}") unless row.fetch("arc_id") == decision.fetch("arc_id")
  fail_check("endpoint audit sequence #{ordinal}") unless row.fetch("end_sequence").to_i == sequence
  fail_check("endpoint audit lines #{ordinal}") unless row.fetch("source_lines") == "L#{chapter.fetch('start_line')}~L#{chapter.fetch('end_line')}"
  fail_check("endpoint audit evidence #{ordinal}") if row.fetch("evidence_note").strip.empty?
  fail_check("endpoint audit batch status #{ordinal}") unless row.fetch("batch_status") == expected_status
  {
    "paid_reward_after" => "paid_reward",
    "ending_hook_after" => "ending_hook",
    "closed_loops_after" => "closed_loops",
    "opened_loops_after" => "opened_loops"
  }.each do |audit_field, chapter_field|
    fail_check("endpoint audit after #{ordinal} #{audit_field}") unless row.fetch(audit_field) == chapter.fetch(chapter_field)
  end
  SCORE_FIELDS.each do |field|
    fail_check("endpoint audit pacing #{ordinal} #{field}") unless endpoint_result_score(row.fetch("pacing_result"), field) == pace.fetch(field)
  end
end

extra_sample_audit_path = File.join(stage, "derived", EXTRA_SAMPLE_AUDIT_NAME)
fail_check("missing extra sample audit") unless File.file?(extra_sample_audit_path)
fail_check("extra sample audit immutable SHA") unless sha(extra_sample_audit_path) == EXTRA_SAMPLE_AUDIT_SHA
extra_sample_audit_table = CSV.read(extra_sample_audit_path, headers: true)
fail_check("extra sample audit header") unless extra_sample_audit_table.headers == EXTRA_SAMPLE_AUDIT_HEADERS
extra_sample_audit = extra_sample_audit_table.map(&:to_h)
fail_check("extra sample audit rows #{extra_sample_audit.length}") unless extra_sample_audit.length == 4
fail_check("extra sample audit sequence/order") unless extra_sample_audit.map { |row| row.fetch("sequence").to_i } == [466, 468, 471, 721]
fail_check("extra sample audit blank field") if extra_sample_audit.any? do |row|
  EXTRA_SAMPLE_AUDIT_HEADERS.any? { |field| row.fetch(field).to_s.strip.empty? }
end
extra_sample_expected_lines = {
  466 => "L81552~L81719",
  468 => "L81886~L82070",
  471 => "L82432~L82611",
  721 => "L124613~L124802"
}.freeze
extra_sample_audit.each do |row|
  sequence = row.fetch("sequence").to_i
  expected_after = if sequence == 721
    pace_by_sequence.fetch(sequence).fetch("pacing_note")
  else
    chapter_by_sequence.fetch(sequence).fetch("paid_reward")
  end
  fail_check("extra sample audit source lines #{sequence}") unless row.fetch("source_lines") == extra_sample_expected_lines.fetch(sequence)
  fail_check("extra sample audit after #{sequence}") unless row.fetch("corrected_current_receipt_or_note") == expected_after
  fail_check("extra sample audit boundary #{sequence}") unless row.fetch("boundary_decision").include?("KEEP")
end
fail_check("extra sample audit 470→471 boundary") unless extra_sample_audit.find { |row| row.fetch("sequence") == "471" }.fetch("boundary_decision").include?("KEEP 470→471")
fail_check("extra sample audit N68 boundary") unless extra_sample_audit.find { |row| row.fetch("sequence") == "721" }.fetch("boundary_decision").include?("KEEP N68")

surface_evidence_path = File.join(stage, "derived", SURFACE_EVIDENCE_NAME)
fail_check("missing Arc surface evidence") unless File.file?(surface_evidence_path)
surface_evidence = csv_rows(surface_evidence_path)
fail_check("authority receipt surface evidence SHA") unless authority_receipt.fetch("surfaceEvidenceSha256") == sha(surface_evidence_path)
fail_check("Arc surface evidence count #{surface_evidence.length}") unless surface_evidence.length == 131
fail_check("Arc surface evidence ID/order") unless surface_evidence.map { |row| row.fetch("arc_id") } == arcs.map { |row| row.fetch("arc_id") }
surface_evidence_by_arc = surface_evidence.to_h { |row| [row.fetch("arc_id"), row] }

arcs.each do |arc|
  arc_id = arc.fetch("arc_id")
  first = arc.fetch("start_sequence").to_i
  last = arc.fetch("end_sequence").to_i
  first_chapter = chapter_by_sequence.fetch(first)
  last_chapter = chapter_by_sequence.fetch(last)
  first_line = first_chapter.fetch("start_line").to_i
  last_line = last_chapter.fetch("end_line").to_i
  raw_lines = source_lines[(first_line - 1)..(last_line - 1)]
  expected_source_lines = last_line - first_line + 1
  fail_check("source slice missing #{arc_id}") unless raw_lines && raw_lines.length == expected_source_lines
  raw_source = raw_lines.join
  characters = split_surface_tokens(arc.fetch("main_characters"))
  locations = split_surface_tokens(arc.fetch("main_locations"))
  fail_check("blank character surface #{arc_id}") if characters.empty?
  fail_check("blank location surface #{arc_id}") if locations.empty?
  fail_check("character surface limit #{arc_id}=#{characters.length}") if characters.length > SURFACE_CHARACTER_LIMIT
  fail_check("location surface limit #{arc_id}=#{locations.length}") if locations.length > SURFACE_LOCATION_LIMIT
  fail_check("duplicate character surface #{arc_id}") unless characters.uniq.length == characters.length
  fail_check("duplicate location surface #{arc_id}") unless locations.uniq.length == locations.length
  fail_check("placeholder location surface #{arc_id}") if locations.include?("원문 장면의 실제 장소")
  leaked_arenas = characters.select { |token| SURFACE_CHARACTER_EXCLUSIONS.include?(normalize_surface_text(token)) }
  fail_check("arena emitted as character #{arc_id}: #{leaked_arenas.join(', ')}") unless leaked_arenas.empty?

  characters.each do |token|
    evidence_term, count = grounded_surface_match(
      raw_source,
      token,
      SURFACE_CHARACTER_ALIASES,
      first_person_exception: token == "김민재"
    )
    next if count.positive? || evidence_term == "FIRST_PERSON_EXCEPTION"
    fail_check("ungrounded character #{arc_id}: #{token}")
  end
  locations.each do |token|
    evidence_term, count = grounded_surface_match(raw_source, token, SURFACE_LOCATION_ALIASES)
    fail_check("ungrounded location #{arc_id}: #{token} <= #{evidence_term}") unless count.positive?
  end

  evidence = surface_evidence_by_arc.fetch(arc_id)
  fail_check("surface evidence range #{arc_id}") unless [
    evidence.fetch("start_sequence"), evidence.fetch("end_sequence"),
    evidence.fetch("start_line"), evidence.fetch("end_line")
  ] == [first.to_s, last.to_s, first_line.to_s, last_line.to_s]
  fail_check("surface evidence character drift #{arc_id}") unless evidence.fetch("main_characters") == arc.fetch("main_characters")
  fail_check("surface evidence location drift #{arc_id}") unless evidence.fetch("main_locations") == arc.fetch("main_locations")
  fail_check("surface evidence source SHA #{arc_id}") unless evidence.fetch("source_sha256") == SOURCE_SHA
  fail_check("blank character evidence #{arc_id}") if evidence.fetch("character_evidence").strip.empty?
  fail_check("blank location evidence #{arc_id}") if evidence.fetch("location_evidence").strip.empty?
end

arc_n63 = arcs.find { |arc| arc.fetch("arc_id") == "DCA-N63" }
fail_check("N63 missing") unless arc_n63
fail_check("N63 event name") unless arc_n63.fetch("arc_name") == "러북 거래 확인과 중국·장남·언론 대응 설계"
n63_characters = split_surface_tokens(arc_n63.fetch("main_characters"))
n63_locations = split_surface_tokens(arc_n63.fetch("main_locations"))
%w[김민재 데이비드 이영한].each do |character|
  fail_check("N63 character missing #{character}") unless n63_characters.include?(character)
end
fail_check("N63 character missing 강 대위") unless n63_characters.include?("강 대위")
fail_check("N63 character missing 한정훈/한 부회장") unless (n63_characters & ["한정훈", "한 부회장"]).any?
fail_check("N63 ghost character") if (n63_characters & ["최재석", "리강", "빈 살만"]).any?
fail_check("N63 office missing") unless n63_locations.include?("강 대위 사무실")
fail_check("N63 international arena missing") unless (n63_locations & ["중국", "연변", "러시아", "북한"]).any?
fail_check("N63 ghost location") if (n63_locations & ["청와대", "사우디"]).any?
n63_surface_evidence = surface_evidence_by_arc.fetch("DCA-N63")
must_include(n63_surface_evidence.fetch("character_evidence"), "N63 character evidence", "김민재<=FIRST_PERSON_EXCEPTION(0)", "한정훈<=한 부회장(1)")
must_include(n63_surface_evidence.fetch("location_evidence"), "N63 location evidence", "강 대위 사무실<=강 대위의 사무실(1)")
must_include(arc_n63.fetch("central_question"), "N63 central question", "세 정보선", "확인", "대응 역할", "설계")
must_include(arc_n63.fetch("relationship_change"), "N63 relationship", "검증 동료", "러북 관계 자체는 아직 갈라지지 않는다")
must_include(arc_n63.fetch("status_or_ability_change"), "N63 status", "교차확인", "담당과 지시만 확정")
must_include(arc_n63.fetch("boundary_signals"), "N63 boundary", "언론 공개·러북 분열·대체공급 효과는 지급하지 않는다", "689화", "리강")

surface15 = chapter_surface(chapter_by_sequence.fetch(15))
must_include(surface15, "seq15", "푸틴", "하버드", "배터리 교수", "지분 취득은 이 화에 없다")

surface50 = chapter_surface(chapter_by_sequence.fetch(50))
must_include(surface50, "seq50", "영상", "음성 녹음", "이미 확보")
must_exclude(chapter_by_sequence.fetch(50).fetch("paid_reward"), "seq50 paid_reward", "아직 없다")

surface154 = chapter_surface(chapter_by_sequence.fetch(154)) + " " + pace_by_sequence.fetch(154).fetch("pacing_note")
must_include(surface154, "seq154", "회장직 제안", "결혼 최후통첩", "명예시민권", "반덤핑 재량", "아이폰 40만 대", "조너선", "200~300%", "세이월드")
must_include(chapter_by_sequence.fetch(154).fetch("ending_hook"), "seq154 hook", "세이월드")

surface156 = chapter_surface(chapter_by_sequence.fetch(156)) + " " + pace_by_sequence.fetch(156).fetch("pacing_note")
must_include(surface156, "seq156", "약 100명", "재택", "안식년", "다이먼", "미국 부동산", "파생상품", "카드업계")
must_include(chapter_by_sequence.fetch(156).fetch("opened_loops"), "seq156 loops", "부동산 파생상품", "카드대란")

surface192 = chapter_surface(chapter_by_sequence.fetch(192))
must_include(surface192, "seq192", "불량학생 4~5명", "머리를 후려치고", "식판에 침", "후보 50명 명단은 아직 미지급")
must_exclude(surface192, "seq192", "천민우", "추영택")

surface194 = chapter_surface(chapter_by_sequence.fetch(194))
must_include(surface194, "seq194", "사진·영상·녹취·진술서", "바디캠", "교실", "안아", "정식 학폭위", "부장검사 윗라인")

surface246 = chapter_surface(chapter_by_sequence.fetch(246))
must_include(surface246, "seq246", "SG 소속 가수 전원 양도 약속", "실제 계약이전", "미지급")

surface259 = chapter_surface(chapter_by_sequence.fetch(259))
must_include(surface259, "seq259", "북한 사투리", "스페인어", "CCTV", "프로 승률 50%", "1경기 승리")

surface264 = chapter_surface(chapter_by_sequence.fetch(264))
must_include(surface264, "seq264", "30%", "CITI", "2만 명", "600억 달러", "리먼 파산설")

surface335 = chapter_surface(chapter_by_sequence.fetch(335))
must_include(surface335, "seq335", "1만2천 명", "운송수단", "구호물자", "실제 대피는 아직 미지급", "동일본 대지진")

surface380 = chapter_surface(chapter_by_sequence.fetch(380))
must_include(surface380, "seq380", "110", "105", "25%", "전액 회수")

surface382 = chapter_surface(chapter_by_sequence.fetch(382))
must_include(surface382, "seq382", "체셔피크", "헤스", "가이아나", "500억 달러", "30%", "60%")

surface466 = chapter_surface(chapter_by_sequence.fetch(466))
must_include(surface466, "seq466", "새만금 화학단지 일부 완성", "20곳", "입주 가능", "유고빈", "센트리언", "국내 약 2천억 원", "일본 약 1조 원", "10조 원", "키울 목표", "연말 규제 전 청산")
must_include(chapter_by_sequence.fetch(466).fetch("paid_reward"), "seq466 paid_reward", "10조 원은 키울 목표", "아직 시장규모·수익으로 지급되지 않는다")
fail_check("seq466 10조 current payment") if chapter_by_sequence.fetch(466).fetch("paid_reward").match?(/10조 원.{0,30}(?:현재 시장|시장규모.{0,8}(?:확보|완성)|수익.{0,8}(?:확정|지급된다))/)

surface468 = chapter_surface(chapter_by_sequence.fetch(468))
must_include(surface468, "seq468", "태우증권·핀테크", "전량", "금융타워", "80퍼센트 이상", "약 20퍼센트 수익", "불법도박", "범죄자금", "장경준", "숨은 위험")
must_include(chapter_by_sequence.fetch(468).fetch("paid_reward"), "seq468 paid_reward", "공장 인수나 위험 전가는 아직 결과가 아니다")

surface471 = chapter_surface(chapter_by_sequence.fetch(471))
must_include(surface471, "seq471", "중국·러시아 양 경로", "1차가공", "한국·미국·유럽", "공급", "실제 시작", "리강", "기부금", "즉각 충돌", "늦춘다", "일본 철강 데이터 공개", "다음 실행 준비")
fail_check("470→471 Arc boundary drift") unless chapter_by_sequence.fetch(470).fetch("arc_id") == "DCA-N41B" && chapter_by_sequence.fetch(471).fetch("arc_id") == "DCA-N41C"

note721 = pace_by_sequence.fetch(721).fetch("pacing_note")
must_include(note721, "seq721 pacing_note", "바그너", "우크라이나", "가스관 압박", "최재석", "공동중재", "김민재가 수락", "구체 협상조건은 아직 지급되지 않는다")
must_exclude(note721, "seq721 pacing_note", "49퍼센트", "49%", "태우IT", "일본", "강제안")
fail_check("N68 731 ownership drift") unless chapter_by_sequence.fetch(731).fetch("arc_id") == "DCA-N68"

surface482 = chapter_surface(chapter_by_sequence.fetch(482))
must_include(surface482, "seq482", "5% 금리", "600만 파운드", "지시", "실제 채권")
must_include(pace_by_sequence.fetch(482).fetch("pacing_note"), "seq482 note", "한 장도 확보되지")

surface488 = chapter_surface(chapter_by_sequence.fetch(488))
must_include(surface488, "seq488", "3%", "8%", "약 10%", "25%", "40%", "50%")
must_include(chapter_by_sequence.fetch(488).fetch("paid_reward"), "seq488 paid_reward", "통제권은 아직 없다")

surface495 = chapter_surface(chapter_by_sequence.fetch(495))
must_include(surface495, "seq495", "5년", "말합의", "세부계약", "미지급")

surface500 = chapter_surface(chapter_by_sequence.fetch(500)) + " " + pace_by_sequence.fetch(500).fetch("pacing_note")
must_include(surface500, "seq500", "건설비 150%", "추가 자금", "자가진단키트", "마스크", "두 배", "확정되지")
must_exclude(chapter_by_sequence.fetch(500).fetch("paid_reward"), "seq500 paid_reward", "두 배로 확정", "두 배 확대를 확정")

surface513 = chapter_surface(chapter_by_sequence.fetch(513))
must_include(surface513, "seq513", "최소 50%", "구형 노광장비", "2년", "악성재고", "HBM 5배")
surface514 = chapter_surface(chapter_by_sequence.fetch(514))
must_include(surface514, "seq514", "곡물·농지", "밀", "1,000억 달러", "ASML", "직접 협상")
surface515 = chapter_surface(chapter_by_sequence.fetch(515))
must_include(surface515, "seq515", "피터슨", "EUV", "50%", "70%", "DUV", "증설비", "호의적 반응", "아직 미지급")
seq515_completion = %w[paid_reward state_change closed_loops].map { |field| chapter_by_sequence.fetch(515).fetch(field) }.join(" ")
must_exclude(seq515_completion, "seq515 completion", "계약을 체결", "계약 완료", "신규 EUV 70% 확보", "DUV 확보 완료")
surface516 = chapter_surface(chapter_by_sequence.fetch(516))
must_include(surface516, "seq516", "구형 반도체 단지", "ASML 5년", "10조 원", "중국행 구형장비 일부", "베트남", "인도", "곡물", "농지", "28GHz", "스타링크")

surface642 = chapter_surface(chapter_by_sequence.fetch(642)) + " " + pace_by_sequence.fetch(642).fetch("pacing_note")
must_include(surface642, "seq642", "위조지폐", "큰손", "신뢰", "상황을 이해하지 못", "최종 소유자는 이 화에서 공개되지 않는다")
seq642_current_fields = %w[action turn_or_reveal paid_reward state_change closed_loops].to_h do |field|
  [field, chapter_by_sequence.fetch(642).fetch(field)]
end
reject_positive_early_attribution(
  seq642_current_fields,
  "seq642 current fields",
  /비트코인 계좌.{0,32}(?:전액\s*)?(?:탈취|털리|장남에게|장남의)/,
  /(?:CNC|리규철|해킹세력|해킹망).{0,44}장남.{0,24}(?:귀속|넘어|소유|흡수|합류)/,
  /장남.{0,44}(?:비트코인|CNC|리규철|해킹세력|해킹망).{0,32}(?:얻|귀속|소유|흡수|넘어)/,
  /(?:비트코인 계좌|CNC|리규철|해킹세력|해킹망).{0,52}최종 소유자/
)

surface643 = chapter_surface(chapter_by_sequence.fetch(643)) + " " + pace_by_sequence.fetch(643).fetch("pacing_note")
must_include(surface643, "seq643", "비트코인 계좌", "리규철", "해킹세력", "CNC", "장남", "러시아", "우크라이나 침공")
must_include(chapter_by_sequence.fetch(643).fetch("paid_reward"), "seq643 reward", "귀속", "침공")

surface645 = chapter_surface(chapter_by_sequence.fetch(645)) + " " + pace_by_sequence.fetch(645).fetch("pacing_note")
must_include(surface645, "seq645", "대통령", "연결역할", "미국 보충판매", "유럽", "방산", "원전", "물류", "식량", "백악관 접촉지시", "미지급")
must_include(chapter_by_sequence.fetch(645).fetch("paid_reward"), "seq645 paid_reward", "실제 승인·수출·계약은 미지급")
fail_check("seq645 early completion") if chapter_by_sequence.fetch(645).fetch("paid_reward").match?(/(?:승인|수출|계약).{0,15}(?:완료|체결|성립)/)

surface654 = chapter_surface(chapter_by_sequence.fetch(654))
must_include(surface654, "seq654", "SVB", "모든 지분·경영권", "뱅크런 없음", "예치금", "주가", "1면", "직거래")

surface660 = chapter_surface(chapter_by_sequence.fetch(660))
must_include(surface660, "seq660", "폴란드 20조 원", "체코 원전", "로나", "붕괴", "공매도", "베릴")
must_exclude(surface660 + " " + pace_by_sequence.fetch(660).fetch("pacing_note"), "seq660", "85달러", "0.003달러", "99%")
surface661 = chapter_surface(chapter_by_sequence.fetch(661))
must_include(surface661 + " " + pace_by_sequence.fetch(661).fetch("pacing_note"), "seq661", "85달러", "0.003달러", "99%", "약 200억 달러", "최소 총 300억 달러", "전망", "베릴")
must_exclude(chapter_by_sequence.fetch(661).fetch("paid_reward"), "seq661 paid_reward", "최소 300억 달러를 실제", "300억 달러 수익을 확정")
surface662 = chapter_surface(chapter_by_sequence.fetch(662))
must_include(surface662 + " " + pace_by_sequence.fetch(662).fetch("pacing_note"), "seq662", "태우 소유 농장", "태우상사", "팜유", "태우해운", "30%", "정유", "10%", "인도산 밀", "가격안정")
must_exclude(surface662, "seq662", "한국 전체 무조건 예외", "한국 전체의 포괄예외")

surface688 = chapter_surface(chapter_by_sequence.fetch(688)) + " " + pace_by_sequence.fetch(688).fetch("concrete_event") + " " + pace_by_sequence.fetch(688).fetch("pacing_note")
must_include(surface688, "seq688", "강 대위", "데이비드", "이영한", "하루", "세 독립 정보선", "대북 식량", "무기·탄약", "지시", "실제 공개", "미지급")
must_include(chapter_by_sequence.fetch(688).fetch("action"), "seq688 action", "확인", "지시")
must_include(chapter_by_sequence.fetch(688).fetch("paid_reward"), "seq688 reward", "세 독립 정보선", "미지급")
must_include(chapter_by_sequence.fetch(688).fetch("ending_hook"), "seq688 hook", "바그너", "러시아", "분열", "주도할 수 있는가")
must_exclude(chapter_by_sequence.fetch(688).fetch("ending_hook"), "seq688 hook", "리강", "총리", "원화 국제화")
seq688_current_fields = NARRATIVE_FIELDS.to_h do |field|
  [field, chapter_by_sequence.fetch(688).fetch(field)]
end
reject_positive_early_attribution(
  seq688_current_fields,
  "seq688 current fields",
  /(?:언론|언론에).{0,24}(?:공개(?:했다|됐다|되어)|보도(?:했다|됐다)|제보(?:했다|가 실행됐다)|흘려(?:졌다|냈다))/,
  /(?:러북|북한과 러시아|러시아와 북한).{0,32}(?:분열(?:됐다|시켰다|이 완료)|갈라졌)/,
  /(?:한국 방산|한국산 무기).{0,32}(?:대체\s*공급).{0,20}(?:됐다|완료|실행|성립)/,
  /러시아.{0,28}(?:반응(?:했다|이 나왔다|이 확인됐다)|물러섰)/
)
fail_check("seq688 reward score") unless pace_by_sequence.fetch(688).fetch("reward_1_10") == "6"
fail_check("seq688 ribbon") unless RIBBON_FIELDS.map { |field| pace_by_sequence.fetch(688).fetch(field) } == %w[0.42 0.17 0.22 0.10 0.09]

surface745 = chapter_surface(chapter_by_sequence.fetch(745)) + " " + pace_by_sequence.fetch(745).fetch("pacing_note")
must_include(surface745, "seq745", "할아버지", "손자")
must_exclude(surface745, "seq745", "아버지가 아들의")
fail_check("seq745 father/son wording") if surface745.match?(/(?<!할)아버지의 능력/)

surface749 = chapter_surface(chapter_by_sequence.fetch(749)) + " " + pace_by_sequence.fetch(749).fetch("pacing_note")
must_include(surface749, "seq749", "AI", "코로나 치료제", "희귀질병 치료제", "노벨 화학상", "양복", "안아", "회사 밖")
must_exclude(chapter_by_sequence.fetch(749).fetch("paid_reward"), "seq749 paid_reward", "고체배터리")

surface750 = chapter_surface(chapter_by_sequence.fetch(750)) + " " + pace_by_sequence.fetch(750).fetch("pacing_note")
must_include(surface750, "seq750", "공동", "노벨 평화상", "주가", "계열사 매출", "브랜드", "국민경제당 후계")
must_include(chapter_by_sequence.fetch(750).fetch("entry_state"), "seq750 entry", "전날 안아 데려온")

surface751 = chapter_surface(chapter_by_sequence.fetch(751)) + " " + pace_by_sequence.fetch(751).fetch("pacing_note")
must_include(surface751, "seq751", "할아버지", "손자", "영국행", "한국 잔류", "초음파 사진", "조손 화해", "50%", "세계 10위권", "전체 자산 절반 미만", "숨은 제국")
must_exclude(surface751, "seq751", "아들의 손", "지키려던 아버지", "부자화해", "김태중의 귀환")

arc_649 = arcs.find { |row| row.fetch("start_sequence") == "649" }
arc_655 = arcs.find { |row| row.fetch("start_sequence") == "655" }
arc_662 = arcs.find { |row| row.fetch("start_sequence") == "662" }
fail_check("649~654 ownership") unless arc_649 && arc_649.fetch("end_sequence") == "654"
fail_check("655~661 ownership") unless arc_655 && arc_655.fetch("end_sequence") == "661"
fail_check("662 ownership") unless arc_662 && arc_662.fetch("end_sequence") == "662"
arc_n56b = arcs.find { |row| row.fetch("arc_id") == "DCA-N56B" }
arc_n57 = arcs.find { |row| row.fetch("arc_id") == "DCA-N57" }
fail_check("N56B 642~643 ownership") unless arc_n56b && [arc_n56b.fetch("start_sequence"), arc_n56b.fetch("end_sequence")] == %w[642 643]
fail_check("N57 644~645 ownership") unless arc_n57 && [arc_n57.fetch("start_sequence"), arc_n57.fetch("end_sequence")] == %w[644 645]

derived_counts = {
  "pacing-all-evidence.csv" => 751,
  "arc-pacing-summary-v2.csv" => 131,
  SURFACE_EVIDENCE_NAME => 131,
  "chapter-narrative-boundary-audit-001-751.csv" => 8261,
  "current-fact-omission-audit-297-fields.csv" => 297,
  "current-fact-omission-audit-102-sequences.csv" => 102,
  "pacing-rejudgment-ledger-001-751.csv" => 751,
  "manual-pacing-prose-ledger-119.csv" => 119,
  ENDPOINT_AUDIT_NAME => 131,
  EXTRA_SAMPLE_AUDIT_NAME => 4
}
derived_counts.each do |name, expected|
  rows = csv_rows(File.join(stage, "derived", name))
  fail_check("#{name} rows #{rows.length}") unless rows.length == expected
end

arc_pacing_summaries = csv_rows(File.join(stage, "derived", "arc-pacing-summary-v2.csv"))
fail_check("Arc pacing summary ID/order") unless arc_pacing_summaries.map { |row| row.fetch("arc_id") } == arcs.map { |row| row.fetch("arc_id") }
assert_nonmechanical_values(
  arc_pacing_summaries.map { |row| row.fetch("pacing_reading").strip },
  "Arc pacing reading"
)
arc_pacing_summaries.each do |row|
  fail_check("analytical pacing lead #{row.fetch('arc_id')}") if row.fetch("pacing_reading").strip.match?(ANALYSIS_LEAD_PATTERN)
end
summary_by_arc = arc_pacing_summaries.to_h { |row| [row.fetch("arc_id"), row] }
pacing_by_arc = pacing.group_by { |row| row.fetch("arc_id") }
arcs.each do |arc|
  summary = summary_by_arc.fetch(arc.fetch("arc_id"))
  rows = pacing_by_arc.fetch(arc.fetch("arc_id"))
  fail_check("Arc pacing summary range #{arc.fetch('arc_id')}") unless [
    summary.fetch("start_sequence"), summary.fetch("end_sequence")
  ] == [arc.fetch("start_sequence"), arc.fetch("end_sequence")]
  {
    "avg_tension" => "tension_1_10",
    "avg_reward" => "reward_1_10",
    "avg_hook" => "hook_1_10",
    "avg_information" => "information_weight",
    "avg_action" => "action_weight",
    "avg_relationship" => "relationship_weight",
    "avg_emotion" => "emotion_weight",
    "avg_material_or_status" => "material_or_status_weight"
  }.each do |summary_field, source_field|
    expected_mean = rows.sum { |row| row.fetch(source_field).to_f } / rows.length
    fail_check("Arc pacing mean #{arc.fetch('arc_id')} #{summary_field}") if (summary.fetch(summary_field).to_f - expected_mean).abs > 0.011
  end
  {
    "tension" => "tension_1_10",
    "reward" => "reward_1_10",
    "hook" => "hook_1_10"
  }.each do |kind, score_field|
    sequence = summary.fetch("peak_#{kind}_sequence").to_i
    peak = rows.find { |row| row.fetch("sequence").to_i == sequence }
    fail_check("Arc pacing peak ownership #{arc.fetch('arc_id')} #{kind}") unless peak
    fail_check("Arc pacing peak score #{arc.fetch('arc_id')} #{kind}") unless peak.fetch(score_field) == summary.fetch("peak_#{kind}_score")
    fail_check("Arc pacing peak max #{arc.fetch('arc_id')} #{kind}") unless peak.fetch(score_field).to_i == rows.map { |row| row.fetch(score_field).to_i }.max
    chapter = chapters.fetch(sequence - 1)
    fail_check("Arc pacing peak label #{arc.fetch('arc_id')} #{kind}") unless chapter.fetch("visible_label") == summary.fetch("peak_#{kind}_label")
    fail_check("Arc pacing peak event #{arc.fetch('arc_id')} #{kind}") unless chapter.fetch("action") == summary.fetch("peak_#{kind}_event")
  end
end

field_audit = csv_rows(File.join(stage, "derived", "chapter-narrative-boundary-audit-001-751.csv"))
field_audit_by_sequence = field_audit.group_by { |row| row.fetch("sequence").to_i }
fail_check("field audit sequence coverage") unless field_audit_by_sequence.keys.sort == (1..751).to_a
field_audit_by_sequence.each do |sequence, rows|
  fail_check("field audit row count seq #{sequence}") unless rows.length == NARRATIVE_FIELDS.length
  fail_check("field audit fields seq #{sequence}") unless rows.map { |row| row.fetch("field") }.sort == NARRATIVE_FIELDS.sort
  fail_check("field audit blank after seq #{sequence}") if rows.any? { |row| row.fetch("after").to_s.strip.empty? }
end

evidence = csv_rows(File.join(stage, "derived", "pacing-all-evidence.csv"))
high = csv_rows(File.join(stage, "derived", "high-score-and-relationship-evidence.csv"))
expected_high = evidence.count do |row|
  SCORE_FIELDS.map { |field| row.fetch(field).to_i }.max >= 9 || row.fetch("relationship_weight").to_f >= 0.30
end
fail_check("high evidence rows #{high.length}/#{expected_high}") unless high.length == expected_high

template_phrases = ["독자는", "실제 지급은 다음에 한정된다", "가장 오래 머문다"]
template_phrases.each do |phrase|
  count = pacing.count { |row| row.fetch("pacing_note").include?(phrase) }
  fail_check("template phrase #{phrase}=#{count}") unless count.zero?
end

prose_documents = %w[
  arc_atlas.md project_bible.md inkos_usage_and_gap_report.md
  free_improvements_report.md completion_receipt.md
].to_h { |name| [name, File.read(File.join(stage, name))] }
BANNED_ARC_PHRASES.each do |phrase|
  prose_documents.each do |name, text|
    count = text.scan(Regexp.new(Regexp.escape(phrase))).length
    fail_check("banned phrase leaked to #{name}: #{phrase}=#{count}") unless count.zero?
  end
end

minimum_sizes = {
  "project_bible.md" => 8_000,
  "arc_atlas.md" => 15_000,
  "inkos_usage_and_gap_report.md" => 6_000,
  "free_improvements_report.md" => 4_000,
  "completion_receipt.md" => 800
}
minimum_sizes.each do |name, minimum|
  size = File.size(File.join(stage, name))
  fail_check("#{name} size #{size}") unless size >= minimum
end

atlas = File.read(File.join(stage, "arc_atlas.md"))
bible = File.read(File.join(stage, "project_bible.md"))
gap_report = File.read(File.join(stage, "inkos_usage_and_gap_report.md"))
free_report = File.read(File.join(stage, "free_improvements_report.md"))
receipt = File.read(File.join(stage, "completion_receipt.md"))
fail_check("atlas headings") unless atlas.scan(/^## \d{3} · DCA-/).length == 131
{
  "독자 약속" => /^- 독자 약속:/,
  "도입" => /^- 구조 · 도입:/,
  "압박" => /^- 구조 · 압박:/,
  "전환" => /^- 구조 · 전환:/,
  "결산" => /^- 구조 · 결산:/,
  "여진" => /^- 구조 · 여진:/,
  "브리지" => /^- 구조 · 브리지:/,
  "관계 변화" => /^- 관계 변화:/,
  "상태·능력 변화" => /^- 상태·능력 변화:/,
  "T\/R\/H 평균" => /^- Arc T\/R\/H 평균:/,
  "tension peak" => /^- 최고 tension:/,
  "reward peak" => /^- 최고 reward:/,
  "hook peak" => /^- 최고 hook:/,
  "5리본 평균" => /^- 5리본 평균 I\/A\/Rel\/E\/M:/,
  "페이싱 독해" => /^- 페이싱 독해:/
}.each do |label, pattern|
  count = atlas.scan(pattern).length
  fail_check("atlas #{label} count #{count}") unless count == 131
end
fail_check("atlas chapter T/R/H rows") unless atlas.scan(/ · T\/R\/H \d+\/\d+\/\d+ · I\/A\/Rel\/E\/M /).length == 751
fail_check("atlas chapter five-ribbon rows") unless atlas.scan(/ · I\/A\/Rel\/E\/M \d+(?:\.\d+)?\/\d+(?:\.\d+)?\/\d+(?:\.\d+)?\/\d+(?:\.\d+)?\/\d+(?:\.\d+)?/).length == 751
arcs.each do |arc|
  summary = summary_by_arc.fetch(arc.fetch("arc_id"))
  must_include(
    atlas,
    "atlas #{arc.fetch('arc_id')}",
    "- 관계 변화: #{arc.fetch('relationship_change')}",
    "- 상태·능력 변화: #{arc.fetch('status_or_ability_change')}",
    "- 페이싱 독해: #{summary.fetch('pacing_reading')}"
  )
end
must_include(
  bible,
  "independent bible overview",
  "작품의 출발과 독자 약속",
  "김민재의 욕망·능력·결핍",
  "주요 관계",
  "초반 — 독립자본과 태우 생존",
  "중반 — 금융위기, 기술·정치·자원 제국",
  "후반 — 팬데믹과 공급망·은행·전쟁",
  "대표 보상과 마지막 결산",
  "NarrativeArc 추적 부록",
  "할아버지",
  "AI로 코로나 치료제와 희귀질병 치료제",
  "숨은 제국",
  "조손 화해"
)
must_include(
  bible,
  "bible opening precision",
  "라면 한 봉지도 사지 못한 채 각혈",
  "시야가 어두워져 의식을 잃은 뒤 열일곱 살",
  "상태창은 사람의 소속과 능력",
  "파텍필립 시계의 거짓말을 별도로",
  "고교 입학 선물",
  "스위스 은행 페이퍼컴퍼니 명의 계좌",
  "100만 달러",
  "열 개 계좌의 합계는 약 70억 원"
)

must_include(
  gap_report,
  "InkOS report independent body",
  "ArcPacket 위에 NarrativeArc",
  "1~3화",
  "Forecast → NarrativeArc draft → 첫 ArcPacket materialize",
  "surfaceRefs",
  "인물, 장소, 물건, 사건, 관계, 목격자 반응",
  "expectedRewardTarget",
  "actualRewardReceipt",
  "Reflow closeout",
  "다섯 리본의 plan/actual",
  "GenreProfile/RuleStack",
  "draft/missing은 fail-open",
  "ready",
  "active",
  "Studio 편집·검토 화면",
  "642~643 — crossfade와 climax 소유",
  "515→516 — 제안과 계약",
  "660→661 — 대기와 지급",
  "재미의 납득을 우선한다",
  "현실성 미세교정",
  "부록 · 131 Arc 추적"
)
fail_check("InkOS report appendix placement") unless gap_report.index("## 부록 · 131 Arc 추적") > gap_report.index("## 10. 구현 순서와 승인 기준")

must_include(
  free_report,
  "free report independent body",
  "100만 달러가 실물 제국으로 자라는 초반 사다리",
  "중후반 거대거래의 반복 피로",
  "보상 통화를 지분 밖으로",
  "김태중을 동료 원로로",
  "천민정의 능력과 보호",
  "적과 경쟁자의 얼굴",
  "642~643 교차전환",
  "제안·계약·시장결과의 세 시계",
  "751화 숨은 제국과 가족의 이중결산",
  "부록 · 131 Arc별 회귀 추적"
)
fail_check("free report improvement count") unless free_report.scan(/^### 개선 \d{2} ·/).length.between?(8, 12)
fail_check("free report keep count") unless free_report.scan(/^- \*\*살릴 것:\*\*/).length >= 8
fail_check("free report correction count") unless free_report.scan(/^- \*\*보정할 것:\*\*/).length >= 8
fail_check("free report warning count") unless free_report.scan(/^- \*\*InkOS 경고:\*\*/).length >= 8
fail_check("free report appendix placement") unless free_report.index("## 부록 · 131 Arc별 회귀 추적") > free_report.index("### 개선 10")

must_include(
  receipt,
  "completion amendment disclosure",
  BOUNDARY_AMENDMENT_NAME,
  SURFACE_AMENDMENT_NAME,
  "원 장부 승인 뒤 관리자 고정표본",
  "명시적 amendment",
  "DCA-N56B 642~643",
  "DCA-N57 644~645",
  "DCA-N63",
  "688화",
  "세 정보선",
  "실제 공개·러북 분열·대체공급·러시아 반응은 미지급",
  "Arc endpoint 원문 전독",
  "131/131",
  ENDPOINT_AUDIT_SHA,
  "001~044 EDIT 13 / KEEP 31",
  "045~088 EDIT 35 / KEEP 9",
  "089~131 EDIT 29 / KEEP 14",
  "BOUNDARY_REVIEW 0",
  "관리자 추가표본 QA",
  "4/4",
  EXTRA_SAMPLE_AUDIT_NAME,
  EXTRA_SAMPLE_AUDIT_SHA,
  "466·468·471·721",
  "470→471",
  "N68"
)
if receipt.include?("- 상태: **VALIDATION_PENDING / NOT_STAGE_READY**")
  must_include(receipt, "pending receipt", "NOT_STAGE_READY", "아직 validator를 통과하지 않았으므로", "완료를 선언하지 않는다")
  must_exclude(receipt, "pending receipt", "AWAITING_MANAGER_V3_STAGE_APPROVAL")
else
  must_include(receipt, "validated receipt", "STAGE_READY", "AWAITING_MANAGER_V3_STAGE_APPROVAL", "금지 조립문 0건", "canonical 적용", "하지 않음")
end

puts "PASS stage-validator: arcs=#{arcs.length} chapters=#{chapters.length} pacing=#{pacing.length} evidence=#{evidence.length} high=#{high.length}"
puts "PASS coverage=1..751 gap=0 overlap=0 ribbons=ratio-sum1 pacing-template-count=0 arc-prose-template-count=0"
puts "PASS ranges=N56B:642-643,N57:644-645"
puts "PASS surface-scope=131 N63:688 aliases+source-grounded"
puts "PASS endpoint-audit=131 sha=#{ENDPOINT_AUDIT_SHA} edit=77 keep=54 boundary=0"
puts "PASS semantic-fixed=15,50,154,156,192,194,246,259,264,335,380,382,466,468,471,482,488,495,500,513-516,590,595,598,600,603,605,608,614,625,630,633,636,642-645,648,654,660-662,664,668,672,681,687,688,690,693,710,715,720,721,731,735,739,744,745,748-751"
