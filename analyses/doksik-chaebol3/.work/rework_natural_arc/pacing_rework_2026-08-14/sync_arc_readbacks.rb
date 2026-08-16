#!/usr/bin/env ruby

require "csv"

WORK = __dir__
ANALYSIS = File.expand_path("../../..", WORK)
REWORK = File.join(ANALYSIS, ".work/rework_natural_arc")

arcs = CSV.read(File.join(ANALYSIS, "arc_map.csv"), headers: true).map(&:to_h)
chapters = CSV.read(File.join(ANALYSIS, "chapter_map.csv"), headers: true).map(&:to_h)
pacing = CSV.read(File.join(ANALYSIS, "arc_pacing.csv"), headers: true).map(&:to_h)
evidence = CSV.read(File.join(REWORK, "pacing/pacing-all-evidence.csv"), headers: true).map(&:to_h)

raise "arc count #{arcs.length}" unless arcs.length == 84
raise "chapter count #{chapters.length}" unless chapters.length == 751
raise "pacing count #{pacing.length}" unless pacing.length == 751
raise "evidence count #{evidence.length}" unless evidence.length == 751

chapter_by_sequence = chapters.to_h { |row| [row.fetch("sequence").to_i, row] }
pacing_by_sequence = pacing.to_h { |row| [row.fetch("sequence").to_i, row] }
evidence_by_sequence = evidence.to_h { |row| [row.fetch("sequence").to_i, row] }

expected = 1
arcs.each do |arc|
  first = arc.fetch("start_sequence").to_i
  last = arc.fetch("end_sequence").to_i
  raise "arc gap/overlap #{arc.fetch('arc_id')}: #{first} != #{expected}" unless first == expected
  raise "bad episode count #{arc.fetch('arc_id')}" unless arc.fetch("episode_count").to_i == last - first + 1
  (first..last).each do |sequence|
    raise "chapter arc mismatch #{sequence}" unless chapter_by_sequence.fetch(sequence).fetch("arc_id") == arc.fetch("arc_id")
    raise "pacing arc mismatch #{sequence}" unless pacing_by_sequence.fetch(sequence).fetch("arc_id") == arc.fetch("arc_id")
    raise "evidence arc mismatch #{sequence}" unless evidence_by_sequence.fetch(sequence).fetch("arc_id") == arc.fetch("arc_id")
  end
  expected = last + 1
end
raise "arc coverage ends #{expected - 1}" unless expected == 752

atlas = []
atlas << "# 《독식하는 재벌 3세》 자연 NarrativeArc Atlas"
atlas << ""
atlas << "- 권위 원문: `private_sources/korean_webnovel_corpus/서오/독식하는 재벌 3세_서오_합본.txt`"
atlas << "- 원문 SHA-256: `66f3e7df3123343c14a7134108dc59940511f40372493a549cba8ae709df4b45`"
atlas << "- 범위: 1~751화 연속, 자연 NarrativeArc #{arcs.length}개"
atlas << "- ArcPacket(1~3화 제작 패킷)과 구분해 지배 목표·상대/장소·압박·지급·비가역 변화·열린 루프 교대 중 원문 신호 둘 이상으로만 경계를 세웠다."
atlas << "- 회차별 점수와 리본은 장면 편집 판단이며, 리본은 전 행 0~1 비율형·합계 1이다."
atlas << "- 아래 회차 문장은 전 751화 의미 감사 장부와 페이싱 재판정 장부를 통과한 정합 readback이다. 독립 반례·선취 판정은 `.work/rework_natural_arc/pacing_rework_2026-08-14/`와 관리자 QA 보고서에 보존한다."
atlas << ""
atlas << "## 연속 범위"
atlas << ""
atlas << "| Arc | 범위 | 사건형 이름 | 원문 line |"
atlas << "| --- | ---: | --- | ---: |"
arcs.each do |arc|
  first_sequence = arc.fetch("start_sequence").to_i
  last_sequence = arc.fetch("end_sequence").to_i
  first = chapter_by_sequence.fetch(first_sequence)
  last = chapter_by_sequence.fetch(last_sequence)
  atlas << "| #{arc.fetch('arc_id')} | #{first_sequence}~#{last_sequence} | #{arc.fetch('arc_name')} | L#{first.fetch('start_line')}~L#{last.fetch('end_line')} |"
end

arcs.each do |arc|
  first_sequence = arc.fetch("start_sequence").to_i
  last_sequence = arc.fetch("end_sequence").to_i
  first = chapter_by_sequence.fetch(first_sequence)
  last = chapter_by_sequence.fetch(last_sequence)
  atlas << ""
  atlas << "## #{arc.fetch('arc_id')} · #{arc.fetch('arc_name')} (#{first_sequence}~#{last_sequence}화)"
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
  atlas << "- **원문 근거:** L#{first.fetch('start_line')}~L#{last.fetch('end_line')}; 회차별 상세 line은 아래와 `pacing/pacing-all-evidence.csv`에 보존했다."
  atlas << ""
  atlas << "### 회차별 장면·리본"
  atlas << ""
  (first_sequence..last_sequence).each do |sequence|
    chapter = chapter_by_sequence.fetch(sequence)
    pace = pacing_by_sequence.fetch(sequence)
    source = evidence_by_sequence.fetch(sequence)
    atlas << "- **#{chapter.fetch('visible_label')}** · #{pace.fetch('concrete_event')} · 긴장 #{pace.fetch('tension_1_10')} / 보상 #{pace.fetch('reward_1_10')} / 훅 #{pace.fetch('hook_1_10')} · 리본 I#{pace.fetch('information_weight')} A#{pace.fetch('action_weight')} R#{pace.fetch('relationship_weight')} E#{pace.fetch('emotion_weight')} M#{pace.fetch('material_or_status_weight')} · #{pace.fetch('pacing_note')} · #{source.fetch('source_lines')}"
  end
end

File.write(File.join(ANALYSIS, "arc_atlas.md"), atlas.join("\n") + "\n")

candidates_path = File.join(REWORK, "natural_arc_candidates.md")
candidates = File.read(candidates_path)
table = []
table << "| 후보 | 범위 | 사건형 이름 | 시작·끝 원문 | 경계 판정 |"
table << "| --- | ---: | --- | ---: | --- |"
arcs.each do |arc|
  first_sequence = arc.fetch("start_sequence").to_i
  last_sequence = arc.fetch("end_sequence").to_i
  first = chapter_by_sequence.fetch(first_sequence)
  last = chapter_by_sequence.fetch(last_sequence)
  table << "| #{arc.fetch('arc_id')} | #{first_sequence}~#{last_sequence} | #{arc.fetch('arc_name')} | L#{first.fetch('start_line')}~L#{last.fetch('end_line')} | #{arc.fetch('boundary_signals')} |"
end
replacement = table.join("\n") + "\n"
unless candidates.sub!(/\| 후보 \| 범위 \| 사건형 이름 \| 시작·끝 원문 \| 경계 판정 \|\n\| --- \| ---: \| --- \| ---: \| --- \|\n.*?(?=\n## )/m, replacement.rstrip)
  raise "candidate table not found"
end
File.write(candidates_path, candidates)

puts "PASS Arc readbacks: atlas=#{arcs.length} arcs/751 chapters, candidates=#{arcs.length} rows"
