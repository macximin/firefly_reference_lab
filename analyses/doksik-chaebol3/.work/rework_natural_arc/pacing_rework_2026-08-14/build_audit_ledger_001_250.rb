#!/usr/bin/env ruby
# frozen_string_literal: true

require "csv"
require "zlib"
require "rubygems/package"

ROOT = File.expand_path("../../../../../", __dir__)
CURRENT_PATH = File.join(ROOT, "analyses/doksik-chaebol3/chapter_map.csv")
ARCHIVE_PATH = File.join(ROOT, "exports/checkpoints/2026-08-14-doksik-pre-pacing-rework.tar.gz")
ARCHIVE_MEMBER = "analyses/doksik-chaebol3/chapter_map.csv"
OUTPUT_PATH = File.join(__dir__, "audit-ledger-001-250.csv")

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

PLAN_VS_EXECUTION = [3, 38, 51, 54, 55, 56, 57, 59, 60, 82, 88, 96, 129, 132, 138, 143, 150, 160, 181, 192, 198, 199, 202, 212, 232].freeze
NEXT_FACT_PULL = [
  24, 53, 58, 59, 82, 92, 129, 132, 133, 135, 136, 137, 138, 139, 141, 142, 143, 144,
  146, 147, 148, 149, 150, 153, 154, 157, 158, 159, 160, 164, 165, 166, 169,
  172, 173, 174, 177, 180, 181, 182, 183, 186, 187, 188, 189, 191, 192, 193,
  195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 207, 208, 209, 210,
  212, 213, 232, 233, 235, 236, 237, 238, 242, 243, 244, 245, 246, 247, 248, 250
].freeze
NUMBER_OR_SCOPE = [25, 54, 55, 59, 199].freeze
EVENT_OWNERSHIP = [50, 149, 158, 192, 198, 202, 212].freeze

SPECIAL_REASON = {
  25 => "8천억 원 전체가 아니라 절반 이상이 명동 자금이며 4천억 원 상환 제안은 다음 화에 나온다. 현재 화에는 차입 지배 구조와 회수 질문만 남겼다.",
  38 => "이선일이 약 15퍼센트 지분을 모아 주겠다고 약속한 단계다. 태우전자 지배력을 이미 얻은 상태로 바꾸지 않았다.",
  50 => "거짓 자료·돈의 전달 주체를 박진훈→우성일→박 기자로 바로잡고 강인식의 증거 확보와 3국 시연 준비를 같은 화에 귀속했다.",
  53 => "L9927~L9940에는 SAVE 차입 미끼와 현재그룹 위기 가능성만 열린다. 구체적인 태우 지분 회수 결과를 당기지 않았다.",
  54 => "L10051~L10065의 1,500명은 사무직·연구원·개발팀 전체 검토 대상이고 실제 이동은 아직 미래형 약 500명 가능성이다. 완료형 재배치를 전수 검토·산정으로 고쳤다.",
  55 => "L10176~L10184의 실제 이동은 사무직 20퍼센트, 원문 표현 수백 명이다. 500명 초과 완료 서술을 제거했다.",
  58 => "은행 지분 술자리 준비 뒤 마지막 프레임은 거래가 조손 관계를 돌이킬 수 없게 만들 수 있다는 민재의 자각이다.",
  59 => "L10923~L10951에는 6개 은행과 지분 양도 가능성·예금 조건 및 다음 날 날인 약속까지만 있다. 약 10퍼센트 지분 확보 완료를 계약 전 협상으로 되돌렸다.",
  82 => "전경련 회장단의 일제 추천만 나온 화다. 김태중의 실제 수락·선출과 회장직 보유를 현재 화의 지급이나 닫힌 루프로 처리하지 않았다.",
  96 => "현재 화는 투자비율·전면 명의·SAVE 은폐 방식의 컨소시엄 설계까지다. 정부 운영권 취득은 다음 화로 남겼다.",
  129 => "현재반도체는 25퍼센트 상환 조건부 협상이고 태우 지분·퀄컴 매입은 준비 단계다. 소유·매입 완료 서술과 다음 화 미국 약속 선취를 제거했다.",
  149 => "현재 화의 아이패드 구상·애플태우 TV 계약·제프리와 아마존 협상 개시를 회복하고 다음 화 로봇 계약을 당기지 않았다.",
  158 => "삼진 기본 탑재 계약과 카드·은행 인수 조사 뒤 임재범 합작 제안으로 장면이 교대한다. 마지막 프레임을 외환은행 조사로 되돌리지 않았다.",
  192 => "현재 화에는 정치연합 구상 뒤 천민우 폭력 영상을 확인하는 전환까지만 있다. 다음 화 가해자·경호대응을 당기지 않았다.",
  198 => "최재석에게 데이터센터·인재명단을 건네고 태우상사의 낮은 실적과 전환 필요를 확인하는 화다. 다음 화 원자재 조사 실행을 당기지 않았다.",
  199 => "원문 품목은 희토류·리튬·식각가스·불화수소다. 다음 화 영상 플랫폼 면담이 아니라 국민경제당 경제 공약 질문으로 끝을 맞췄다.",
  200 => "첫 김익수 면담과 손을 잡으라는 제안까지만 있다. 50억 원 매각·합작 제안은 201화 지급이므로 현재 훅에서 제외했다.",
  202 => "스티브 첸의 개인 영상 공유 발상과 영입을 현재 화에 두고, 기존 인터넷 복제 요구나 존재하지 않는 CEO 결론을 제거했다.",
  212 => "IIT 고용·연구 명분과 최재석 지지 뒤 태우자동차·테슬라 전기차 경쟁으로 장면이 바뀐다. 다음 화 지도업체 해법을 당기지 않았다.",
  232 => "미국의 비공개 반입 확답은 현재 화에 지급되지만 러시아 구매 계약은 아직 체결 전이다. 두 상태를 paid_reward·state_change·closed_loops에서 분리했다."
}.freeze

current = CSV.read(CURRENT_PATH, headers: true)
original = CSV.parse(archived_text(ARCHIVE_PATH, ARCHIVE_MEMBER), headers: true)
current_by_sequence = current.each_with_object({}) { |row, out| out[row["sequence"].to_i] = row }
original_by_sequence = original.each_with_object({}) { |row, out| out[row["sequence"].to_i] = row }

headers = [
  "sequence", "visible_label", "start_line", "end_line", "status", "fields_changed",
  "evidence_lines", "reason", "before_after"
]

CSV.open(OUTPUT_PATH, "w", write_headers: true, headers: headers) do |csv|
  (1..250).each do |sequence|
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
      reason = "현재 action·turn·paid_reward·state_change·ending_hook·closed_loops·opened_loops가 이 회차 하드 경계와 일치하고 인접 화의 구체 결과를 선취하지 않는다."
      before_after = ""
    else
      tags = []
      tags << "계획·검토·계약 전 상태를 실행·지급 완료와 분리했다." if PLAN_VS_EXECUTION.include?(sequence)
      tags << "다음 화의 구체 결과를 현재 마지막 프레임의 실제 질문으로 되돌렸다." if NEXT_FACT_PULL.include?(sequence)
      tags << "금액·인원·대상의 원문 범위를 바로잡았다." if NUMBER_OR_SCOPE.include?(sequence)
      tags << "행동 주체와 현재 화의 장면 교대를 바로잡았다." if EVENT_OWNERSHIP.include?(sequence)
      reason = SPECIAL_REASON.fetch(sequence, tags.join(" "))
      abort("No manual reason category for edited sequence #{sequence}") if reason.empty?
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

edit_count = CSV.foreach(OUTPUT_PATH, headers: true).count { |row| row["status"] == "EDIT" }
puts "wrote #{OUTPUT_PATH} rows=250 edits=#{edit_count} pass=#{250 - edit_count}"
