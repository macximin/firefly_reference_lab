#!/usr/bin/env ruby

require "csv"
require "fileutils"

ANALYSIS = File.expand_path("../..", __dir__)
REWORK = __dir__
PARTS = File.join(REWORK, "final_parts")
PACING_DIR = File.join(REWORK, "pacing")

ARC_HEADER = %w[
  arc_id arc_name start_sequence end_sequence start_label end_label episode_count
  main_characters main_locations concrete_premise central_question promise
  pressure_escalation mid_turn concrete_payoff relationship_change
  status_or_ability_change residual_cost next_arc_bridge boundary_signals confidence
].freeze

CHAPTER_HEADER = %w[
  sequence visible_label title start_line end_line entry_state reader_promise
  protagonist_goal action resistance_or_cost turn_or_reveal paid_reward
  state_change_axis state_change ending_hook closed_loops opened_loops arc_id
  confidence
].freeze

PACING_PART_HEADER = %w[
  sequence arc_phase tension_1_10 reward_1_10 hook_1_10 information_weight
  action_weight relationship_weight emotion_weight material_or_status_weight
  ribbon_rationale source_lines
].freeze

PACING_HEADER = %w[
  sequence visible_label arc_id arc_phase concrete_event tension_1_10
  reward_1_10 hook_1_10 information_weight action_weight relationship_weight
  emotion_weight material_or_status_weight pacing_note
].freeze

def read_rows(path, header)
  table = CSV.read(path, headers: true)
  raise "header mismatch: #{path}\n#{table.headers.inspect}" unless table.headers == header
  table.map(&:to_h)
end

def write_rows(path, header, rows)
  CSV.open(path, "w", write_headers: true, headers: header) do |csv|
    rows.each { |row| csv << header.map { |field| row.fetch(field) } }
  end
end

part_files = %w[
  arc-map-001-191.csv
  arc-map-root.csv
  arc-map-216-401.csv
  arc-map-402-600.csv
].map { |name| File.join(PARTS, name) }

missing = part_files.reject { |path| File.file?(path) }
raise "missing arc part(s): #{missing.join(', ')}" unless missing.empty?

arcs = part_files.flat_map { |path| read_rows(path, ARC_HEADER) }
                 .sort_by { |row| row.fetch("start_sequence").to_i }

expected = 1
arcs.each_with_index do |arc, index|
  start_seq = arc.fetch("start_sequence").to_i
  end_seq = arc.fetch("end_sequence").to_i
  raise "arc gap/overlap at #{arc.fetch('arc_id')}: #{start_seq} != #{expected}" unless start_seq == expected
  raise "bad arc range #{start_seq}-#{end_seq}" if end_seq < start_seq
  raise "bad episode_count #{start_seq}-#{end_seq}" unless arc.fetch("episode_count").to_i == end_seq - start_seq + 1
  arc["arc_id"] = format("DCA-N%02d", index + 1)
  arc["start_label"] = start_seq.to_s
  arc["end_label"] = end_seq.to_s
  expected = end_seq + 1
end
raise "arc coverage ends at #{expected - 1}" unless expected == 752

chapters = read_rows(File.join(ANALYSIS, "chapter_map.csv"), CHAPTER_HEADER)
raise "chapter row count #{chapters.length}" unless chapters.length == 751

# Human source-readback replacements are assembled in bounded partials. The
# script only overlays those authored rows; it does not generate narrative
# fields from chapter position, titles, keywords, or formulas.
required_chapter_part_names = %w[
  chapter-map-050-125.csv
  chapter-map-126-250.csv
  chapter-map-corrections-251-500.csv
  chapter-map-501-751.csv
]
missing_chapter_parts = required_chapter_part_names.reject do |name|
  File.file?(File.join(PARTS, name))
end
raise "missing chapter part(s): #{missing_chapter_parts.join(', ')}" unless missing_chapter_parts.empty?

chapter_part_files = Dir[File.join(PARTS, "chapter-map-*.csv")].sort
corrected_chapter_sequences = {}
chapter_part_files.each do |path|
  read_rows(path, CHAPTER_HEADER).each do |row|
    sequence = row.fetch("sequence").to_i
    raise "chapter partial sequence out of range #{sequence}: #{path}" unless sequence.between?(1, 751)
    if corrected_chapter_sequences.key?(sequence)
      raise "duplicate chapter partial #{sequence}: #{corrected_chapter_sequences.fetch(sequence)}, #{path}"
    end
    corrected_chapter_sequences[sequence] = path
    chapters[sequence - 1] = row
  end
end

required_authored_sequences = (50..250).to_a + (501..751).to_a
missing_authored_sequences = required_authored_sequences.reject do |sequence|
  corrected_chapter_sequences.key?(sequence)
end
raise "missing source-readback chapter(s): #{missing_authored_sequences.join(',')}" unless missing_authored_sequences.empty?

arc_for = {}
arcs.each do |arc|
  (arc.fetch("start_sequence").to_i..arc.fetch("end_sequence").to_i).each do |sequence|
    raise "duplicate arc assignment #{sequence}" if arc_for.key?(sequence)
    arc_for[sequence] = arc.fetch("arc_id")
  end
end

chapters.each_with_index do |row, index|
  sequence = row.fetch("sequence").to_i
  raise "chapter order #{sequence}" unless sequence == index + 1
  row["arc_id"] = arc_for.fetch(sequence)
end

pacing_files = %w[
  pacing-001-200.csv
  pacing-201-400.csv
  pacing-401-600.csv
  pacing-601-751.csv
].map { |name| File.join(PACING_DIR, name) }
missing = pacing_files.reject { |path| File.file?(path) }
raise "missing pacing part(s): #{missing.join(', ')}" unless missing.empty?

pacing_evidence = pacing_files.flat_map { |path| read_rows(path, PACING_PART_HEADER) }
                                .sort_by { |row| row.fetch("sequence").to_i }
raise "pacing evidence count #{pacing_evidence.length}" unless pacing_evidence.length == 751

old_pacing = read_rows(File.join(ANALYSIS, "arc_pacing.csv"), PACING_HEADER)
old_by_sequence = old_pacing.to_h { |row| [row.fetch("sequence").to_i, row] }
chapter_by_sequence = chapters.to_h { |row| [row.fetch("sequence").to_i, row] }

pacing = pacing_evidence.each_with_index.map do |evidence, index|
  sequence = evidence.fetch("sequence").to_i
  raise "pacing order #{sequence}" unless sequence == index + 1
  chapter = chapter_by_sequence.fetch(sequence)
  old = old_by_sequence.fetch(sequence)
  weights = %w[
    information_weight action_weight relationship_weight emotion_weight
    material_or_status_weight
  ].map { |field| Float(evidence.fetch(field)) }
  raise "ribbon out of range at #{sequence}" unless weights.all? { |value| value.between?(0.0, 1.0) }
  raise "ribbon sum #{sequence}: #{weights.sum}" unless (weights.sum - 1.0).abs <= 0.01

  {
    "sequence" => sequence.to_s,
    "visible_label" => chapter.fetch("visible_label"),
    "arc_id" => arc_for.fetch(sequence),
    "arc_phase" => evidence.fetch("arc_phase"),
    "concrete_event" => if corrected_chapter_sequences.key?(sequence)
      [chapter.fetch("action"), chapter.fetch("turn_or_reveal"), chapter.fetch("paid_reward")].join("; ")
    else
      old.fetch("concrete_event")
    end,
    "tension_1_10" => evidence.fetch("tension_1_10"),
    "reward_1_10" => evidence.fetch("reward_1_10"),
    "hook_1_10" => evidence.fetch("hook_1_10"),
    "information_weight" => evidence.fetch("information_weight"),
    "action_weight" => evidence.fetch("action_weight"),
    "relationship_weight" => evidence.fetch("relationship_weight"),
    "emotion_weight" => evidence.fetch("emotion_weight"),
    "material_or_status_weight" => evidence.fetch("material_or_status_weight"),
    "pacing_note" => evidence.fetch("ribbon_rationale")
  }
end

write_rows(File.join(ANALYSIS, "arc_map.csv"), ARC_HEADER, arcs)
write_rows(File.join(ANALYSIS, "chapter_map.csv"), CHAPTER_HEADER, chapters)
write_rows(File.join(ANALYSIS, "arc_pacing.csv"), PACING_HEADER, pacing)

# Preserve a single, continuous evidence surface for every editorial ribbon row.
evidence_out = pacing_evidence.map do |row|
  sequence = row.fetch("sequence").to_i
  row.merge("arc_id" => arc_for.fetch(sequence), "visible_label" => chapter_by_sequence.fetch(sequence).fetch("visible_label"))
end
evidence_header = ["sequence", "visible_label", "arc_id"] + PACING_PART_HEADER.drop(1)
write_rows(File.join(PACING_DIR, "pacing-all-evidence.csv"), evidence_header, evidence_out)

high_relation = evidence_out.select do |row|
  scores = %w[tension_1_10 reward_1_10 hook_1_10].map { |field| row.fetch(field).to_i }
  scores.max >= 9 || row.fetch("relationship_weight").to_f >= 0.30
end
write_rows(File.join(REWORK, "high-score-and-relationship-evidence.csv"), evidence_header, high_relation)

def fmt_line(value)
  value.to_s.sub(/\AL/i, "")
end

atlas = []
atlas << "# 《독식하는 재벌 3세》 자연 NarrativeArc Atlas"
atlas << ""
atlas << "- 권위 원문: `private_sources/korean_webnovel_corpus/서오/독식하는 재벌 3세_서오_합본.txt`"
atlas << "- 원문 SHA-256: `66f3e7df3123343c14a7134108dc59940511f40372493a549cba8ae709df4b45`"
atlas << "- 범위: 1~751화 연속, 자연 NarrativeArc #{arcs.length}개"
atlas << "- ArcPacket(1~3화 제작 패킷)과 구분해 지배 목표·상대/장소·압박·지급·비가역 변화·열린 루프 교대 중 원문 신호 둘 이상으로만 경계를 세웠다."
atlas << "- 회차별 점수와 리본은 장면 편집 판단이며, 리본은 전 행 0~1 비율형·합계 1이다."
atlas << ""
atlas << "## 연속 범위"
atlas << ""
atlas << "| Arc | 범위 | 사건형 이름 | 원문 line |"
atlas << "| --- | ---: | --- | ---: |"
arcs.each do |arc|
  start_seq = arc.fetch("start_sequence").to_i
  end_seq = arc.fetch("end_sequence").to_i
  first = chapter_by_sequence.fetch(start_seq)
  last = chapter_by_sequence.fetch(end_seq)
  atlas << "| #{arc.fetch('arc_id')} | #{start_seq}~#{end_seq} | #{arc.fetch('arc_name')} | L#{first.fetch('start_line')}~L#{last.fetch('end_line')} |"
end

pacing_by_sequence = pacing.to_h { |row| [row.fetch("sequence").to_i, row] }
evidence_by_sequence = evidence_out.to_h { |row| [row.fetch("sequence").to_i, row] }

arcs.each do |arc|
  start_seq = arc.fetch("start_sequence").to_i
  end_seq = arc.fetch("end_sequence").to_i
  first = chapter_by_sequence.fetch(start_seq)
  last = chapter_by_sequence.fetch(end_seq)
  atlas << ""
  atlas << "## #{arc.fetch('arc_id')} · #{arc.fetch('arc_name')} (#{start_seq}~#{end_seq}화)"
  atlas << ""
  atlas << "- **실제 인물:** #{arc.fetch('main_characters')}"
  atlas << "- **주 장소:** #{arc.fetch('main_locations')}"
  atlas << "- **시작 장면:** #{arc.fetch('concrete_premise')}"
  atlas << "- **지배 질문:** #{arc.fetch('central_question')}"
  atlas << "- **독자 약속:** #{arc.fetch('promise')}"
  atlas << "- **중간 압박:** #{arc.fetch('pressure_escalation')}"
  atlas << "- **중간 전환:** #{arc.fetch('mid_turn')}"
  atlas << "- **구체 지급:** #{arc.fetch('concrete_payoff')}"
  atlas << "- **관계 변화:** #{arc.fetch('relationship_change')}"
  atlas << "- **지위·능력 변화:** #{arc.fetch('status_or_ability_change')}"
  atlas << "- **미지급·비용:** #{arc.fetch('residual_cost')}"
  atlas << "- **끝 장면:** #{arc.fetch('next_arc_bridge')}"
  atlas << "- **다음 경계 신호:** #{arc.fetch('boundary_signals')}"
  atlas << "- **원문 근거:** L#{fmt_line(first.fetch('start_line'))}~L#{fmt_line(last.fetch('end_line'))}; 회차별 상세 line은 아래와 `pacing/pacing-all-evidence.csv`에 보존했다."
  atlas << ""
  atlas << "### 회차별 장면·리본"
  atlas << ""
  (start_seq..end_seq).each do |sequence|
    chapter = chapter_by_sequence.fetch(sequence)
    pace = pacing_by_sequence.fetch(sequence)
    evidence = evidence_by_sequence.fetch(sequence)
    atlas << "- **#{chapter.fetch('visible_label')}** · #{pace.fetch('concrete_event')} · 긴장 #{pace.fetch('tension_1_10')} / 보상 #{pace.fetch('reward_1_10')} / 훅 #{pace.fetch('hook_1_10')} · 리본 I#{pace.fetch('information_weight')} A#{pace.fetch('action_weight')} R#{pace.fetch('relationship_weight')} E#{pace.fetch('emotion_weight')} M#{pace.fetch('material_or_status_weight')} · #{pace.fetch('pacing_note')} · #{evidence.fetch('source_lines')}"
  end
end

File.write(File.join(ANALYSIS, "arc_atlas.md"), atlas.join("\n") + "\n")

# Integrated Stage A/B readback. Detailed original candidate prose remains in
# segments/, while this file fixes the final continuous range and evidence path.
candidates = []
candidates << "# 《독식하는 재벌 3세》 자연 Arc 후보 통합 지도"
candidates << ""
candidates << "이 파일은 네 구간 후보 문서와 네 체크포인트를 단계 B 반례 검수 뒤 한 연속 지도에 합친 readback이다. 최종 ID는 숫자 목표가 아니라 원문 경계 판정 결과다."
candidates << ""
candidates << "- 구간 원문 독해: `segments/candidates-001-200.md`, `candidates-201-400.md`, `candidates-401-600.md`, `candidates-601-751.md`"
candidates << "- 체크포인트: `checkpoint-001-200.md`, `checkpoint-201-400.md`, `checkpoint-401-600.md`, `checkpoint-601-751.md`"
candidates << "- 반례·기존 97 Arc 매핑: `reviews/stage-b-001-200.md`, `stage-b-201-400.md`, `stage-b-401-600.md`, `stage-b-601-751.md`"
candidates << ""
candidates << "## 최종 후보 연속 장부"
candidates << ""
candidates << "| 후보 | 범위 | 사건형 이름 | 시작·끝 원문 | 경계 판정 |"
candidates << "| --- | ---: | --- | ---: | --- |"
arcs.each do |arc|
  start_seq = arc.fetch("start_sequence").to_i
  end_seq = arc.fetch("end_sequence").to_i
  first = chapter_by_sequence.fetch(start_seq)
  last = chapter_by_sequence.fetch(end_seq)
  candidates << "| #{arc.fetch('arc_id')} | #{start_seq}~#{end_seq} | #{arc.fetch('arc_name')} | L#{first.fetch('start_line')}~L#{last.fetch('end_line')} | #{arc.fetch('boundary_signals')} |"
end
candidates << ""
candidates << "## 커버리지와 보류선"
candidates << ""
candidates << "- 1~751화가 빈틈 0·중복 0으로 한 번씩 배정됐다."
candidates << "- 작업 분할선 200/201, 400/401, 600/601은 모두 경계가 아니었다. 각각 192~215, 381~401, 599~610으로 합쳤다."
candidates << "- 회차 안 혼합은 101, 153/154, 176/177, 614, 660/661, 730/731, 739/740, 748/749에 남아 있다. 회차 단위 지도에서는 해당 화의 지배 장면에 배정하고, 앞/뒤 여진을 Arc 지급으로 당겨 쓰지 않았다."
candidates << "- 단계 A의 미확정선은 단계 B 문서에서 합침·나눔으로 판정했으며, 새 미확정 자연 경계는 없다. 다만 혼합 회차의 장면 순서는 관리자 원문 QA 대상이라고 completion receipt에 남긴다."
File.write(File.join(REWORK, "natural_arc_candidates.md"), candidates.join("\n") + "\n")

puts "arc_rows=#{arcs.length}"
puts "chapter_rows=#{chapters.length}"
puts "chapter_readback_replacements=#{corrected_chapter_sequences.length}"
puts "pacing_rows=#{pacing.length}"
puts "high_or_relation_evidence_rows=#{high_relation.length}"
