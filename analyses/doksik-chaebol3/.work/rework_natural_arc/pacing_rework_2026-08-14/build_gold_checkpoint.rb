#!/usr/bin/env ruby
# frozen_string_literal: true

require "csv"
require "digest"
require "fileutils"
require "json"
require "open3"
require "time"

WORK = __dir__
ANALYSIS = File.expand_path("../../..", WORK)
REPO = File.expand_path("../..", ANALYSIS)
CHECKPOINTS = File.join(REPO, "exports", "checkpoints")
STAGE = File.join(WORK, "stage-manager-redteam-v3-2026-08-14")
SOURCE = File.join(REPO, "private_sources", "korean_webnovel_corpus", "서오", "독식하는 재벌 3세_서오_합본.txt")
STRICT_TOOL = File.join(REPO, "tools", "validate-five-work-analyses.mjs")

DRAFT = File.join(WORK, "manager-final-qa-2026-08-14.md.draft")
REPORT_FINAL = File.join(ANALYSIS, "manager_final_qa.md")
REPORT_TEMP = File.join(ANALYSIS, ".doksik-manager-final-qa.tmp")

GOLD_NAME = "2026-08-14-doksik-natural-arc-gold"
GOLD_FINAL = File.join(CHECKPOINTS, GOLD_NAME)
GOLD_TEMP = File.join(CHECKPOINTS, ".#{GOLD_NAME}.tmp")
TAR_FINAL = File.join(CHECKPOINTS, "#{GOLD_NAME}.tar.gz")
TAR_TEMP = File.join(CHECKPOINTS, ".#{GOLD_NAME}.tar.gz.tmp")
TAR_SHA_FINAL = File.join(CHECKPOINTS, "#{GOLD_NAME}.tar.gz.sha256")
TAR_SHA_TEMP = File.join(CHECKPOINTS, ".#{GOLD_NAME}.tar.gz.sha256.tmp")

PRE_APPLY_CHECKPOINT = File.join(CHECKPOINTS, "2026-08-14-doksik-pre-v3-canonical-apply")
PRE_APPLY_MANIFEST = File.join(PRE_APPLY_CHECKPOINT, "checkpoint-files.sha256")

ROOT_FILES = %w[
  arc_atlas.md
  arc_map.csv
  arc_pacing.csv
  chapter_map.csv
  completion_receipt.md
  free_improvements_report.md
  inkos_usage_and_gap_report.md
  project_bible.md
  source_receipt.json
].freeze

FINAL_ROOT_SHA = {
  "arc_atlas.md" => "90f1eb72082f2853bf23f96a644eb7fa78ac0d90f536c04f0aec817091140c4f",
  "arc_map.csv" => "570bc330e5e0597636ee41a31ffd8df3ac1801c8a8f9c7a3af74edaa80f17167",
  "arc_pacing.csv" => "2cb43590950999894bb66c46a48172ffd59015a2125c73b4140de9307540bc46",
  "chapter_map.csv" => "3e6ade1b048df571a4bd327f4c699751eabbe4e403761b4b17f1e54610dd5167",
  "completion_receipt.md" => "f42871437f067b4f1f55d0fcf27ff1f303f84da12a3561efb12dd0c27944f521",
  "free_improvements_report.md" => "9ef5eb07fb27801ccd9b92d12bc623a04e97ef448b205ccaa204f43a8e2e4e61",
  "inkos_usage_and_gap_report.md" => "b19a86c980a3530c7ce64dc49117d29931371d7ee5292ff000eecf63be3c2f6d",
  "project_bible.md" => "7f9e87f885fc3c5e01ae9c4db40c7aa1fd033a0aa574fb502ab0fc6fd0181572",
  "source_receipt.json" => "5aad05680d9c6a4a6712a79900fce98efc6c4995e22eee98126497e61b2b019d"
}.freeze

PRE_APPLY_OLD_SHA = {
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

SOURCE_SHA = "66f3e7df3123343c14a7134108dc59940511f40372493a549cba8ae709df4b45"
DRAFT_SHA = "7bba985393ab391c21350528153fecc14f22c4d5f1ecb0b258262079e5262215"
V1_MANIFEST_SHA = "c1225d7a567ebdbdca0ffbcbb4f338b75209cc4576e4f559f9eef96e969ab619"
V2_MANIFEST_SHA = "e55a6d63f8830fe3f57a6a9c907343fa5241b9c6e628da94e245ad7d7156dbac"
V3_MANIFEST_SHA = "13d79bb34bf64e0998ae9dcd46386feb92ad2c51d7466daba658390381dcb711"
PRE_APPLY_MANIFEST_SHA = "469042da5c4e0801715cd56921316645c1372c341c09c9f0d07c0cacdb8b842a"
EXTRA_QA_SHA = "b6711ddac75e1869ffb0fe8edd86a3a97e945a13396ceab447f7aacfbe6b6bc7"
ENDPOINT_SHA = "70474186bc438041970cefa9096f28ebf733e5660533eb1768510f2f688b4163"
STRICT_PASS = "PASS 독식하는 재벌 3세: 751회 / 131 Arc / 오류 0 / 경고 0"
FIRST_LINE = "최종 판정 PASS. 《독식하는 재벌 3세》를 InkOS 웹소설 NarrativeArc 골드 레퍼런스로 승인한다."

V1_MANIFEST = File.join(WORK, "stage-manager-redteam-2026-08-14", "stage-file-manifest.sha256")
V2_MANIFEST = File.join(WORK, "stage-manager-redteam-v2-2026-08-14", "stage-file-manifest.sha256")
V3_MANIFEST = File.join(STAGE, "stage-file-manifest.sha256")

STAGE_COPY_SPECS = {
  "validation/stage-validator.txt" => File.join(STAGE, "validation", "stage-validator.txt"),
  "evidence/manager-extra-sample-qa-2026-08-14.csv" => File.join(STAGE, "derived", "manager-extra-sample-qa-2026-08-14.csv"),
  "evidence/manager-arc-endpoint-audit-2026-08-14.csv" => File.join(STAGE, "derived", "manager-arc-endpoint-audit-2026-08-14.csv"),
  "evidence/arc-surface-evidence-v2.csv" => File.join(STAGE, "derived", "arc-surface-evidence-v2.csv"),
  "authority/effective-redteam-decisions-v2.csv" => File.join(STAGE, "authority", "effective-redteam-decisions-v2.csv"),
  "authority/long-arc-red-team-decisions-2026-08-14.csv" => File.join(STAGE, "authority", "long-arc-red-team-decisions-2026-08-14.csv"),
  "authority/long-arc-red-team-2026-08-14.md" => File.join(STAGE, "authority", "long-arc-red-team-2026-08-14.md"),
  "authority/manager-boundary-amendment-642-645.md" => File.join(STAGE, "authority", "manager-boundary-amendment-642-645.md"),
  "authority/manager-surface-amendment-n63-688.md" => File.join(STAGE, "authority", "manager-surface-amendment-n63-688.md")
}.freeze

STALE_STATUS = [
  "STAGE_READY / AWAITING_MANAGER_V3_STAGE_APPROVAL",
  "- canonical 적용: **하지 않음**",
  "canonical apply·commit·push는 하지 않았으며 관리자 승인 전 완료로 선언하지 않는다.",
  "canonical에는 아직 적용하지 않았다.",
  "> canonical 미적용.",
  "STAGE_READY 후보이며 관리자 승인 전 canonical과 공통 도구를 바꾸지 않는다.",
  "관리자 승인 전 canonical 적용·완료 선언·커밋·푸시는 하지 않는다."
].freeze

REPORT_REQUIRED = [
  FIRST_LINE,
  SOURCE_SHA,
  "surface 131/131",
  "endpoint 131/131",
  "EDIT 77",
  "KEEP 54",
  "BOUNDARY_REVIEW 0",
  "466·468·471·721",
  "DCA-N17",
  "167화",
  "172화",
  "176화",
  "177화",
  "DCA-N41B/C",
  "DCA-N68",
  "721화 리본은 정보 0.24, 행동 0.18, 관계 0.33, 감정 0.17, 물질·지위 0.08",
  "DCA-N33 SHIFT",
  "357~368",
  "DCA-N34",
  "381~396",
  "470화 계약·5조 원 입금 뒤 471화 몽골 공급망",
  "731화 초 휴전일정",
  "국내 약 2천억 원과 일본 약 1조 원",
  "10조 원은 확대 목표",
  "금융타워 80퍼센트 이상",
  "약 20퍼센트 수익",
  "몽골 자원의 중국·러시아 운송, 현지 1차가공, 한미유럽 공급",
  V3_MANIFEST_SHA,
  PRE_APPLY_MANIFEST_SHA,
  "Commit과 push는 하지 않았다.",
  "미확정 사항은 없다.",
  "유일한 정답 Arc 수를 강제하지 않는다.",
  "합계 44/50"
].freeze

REPORT_FORBIDDEN = [
  "의미가 크다",
  "결론적으로",
  "요약하면",
  "다시 말해",
  "여기서 중요한",
  "살펴보면",
  "본 보고서는",
  "not X but Y",
  "아니라"
].freeze

def fail!(message)
  raise RuntimeError, message
end

def sha(path)
  Digest::SHA256.file(path).hexdigest
end

def ensure_regular_file!(path, label)
  fail!("#{label} missing: #{path}") unless File.file?(path)
  fail!("#{label} must not be symlink: #{path}") if File.symlink?(path)
end

def verify_one_sha!(path, expected, label)
  ensure_regular_file!(path, label)
  actual = sha(path)
  fail!("#{label} SHA mismatch: expected #{expected}, got #{actual}") unless actual == expected
  actual
end

def verify_root_set!(base, expected, label)
  fail!("#{label} key set mismatch") unless expected.keys == ROOT_FILES
  ROOT_FILES.each do |name|
    verify_one_sha!(File.join(base, name), expected.fetch(name), "#{label} #{name}")
  end
  true
end

def safe_relative_path?(relative)
  return false if relative.empty? || relative.start_with?("/") || relative.include?("\0")

  parts = relative.split("/")
  parts.none? { |part| part.empty? || part == "." || part == ".." }
end

def manifest_entries(path, base, expected_sha, expected_rows, label)
  verify_one_sha!(path, expected_sha, "#{label} manifest")
  lines = File.readlines(path, encoding: "UTF-8").map(&:chomp).reject(&:empty?)
  fail!("#{label} row count: expected #{expected_rows}, got #{lines.length}") unless lines.length == expected_rows
  entries = {}
  lines.each do |line|
    match = line.match(/\A([0-9a-f]{64})  (.+)\z/)
    fail!("#{label} invalid manifest line: #{line}") unless match
    relative = match[2]
    fail!("#{label} unsafe path: #{relative}") unless safe_relative_path?(relative)
    fail!("#{label} duplicate path: #{relative}") if entries.key?(relative)
    expanded = File.expand_path(relative, base)
    prefix = File.expand_path(base) + File::SEPARATOR
    fail!("#{label} path escaped base: #{relative}") unless expanded.start_with?(prefix)
    verify_one_sha!(expanded, match[1], "#{label} entry #{relative}")
    entries[relative] = match[1]
  end
  entries
end

def file_paths(base)
  Dir.glob(File.join(base, "**", "*"), File::FNM_DOTMATCH).select { |path| File.file?(path) }.sort
end

def relative_path(path, base)
  path.sub(/\A#{Regexp.escape(base + File::SEPARATOR)}/, "")
end

def tree_sha(base)
  material = file_paths(base).map do |path|
    "#{relative_path(path, base)}\0#{sha(path)}\n"
  end.join
  Digest::SHA256.hexdigest(material)
end

def csv_rows(path)
  CSV.read(path, headers: true, encoding: "UTF-8").length
end

def verify_counts!
  fail!("arc_map rows") unless csv_rows(File.join(ANALYSIS, "arc_map.csv")) == 131
  fail!("chapter_map rows") unless csv_rows(File.join(ANALYSIS, "chapter_map.csv")) == 751
  fail!("arc_pacing rows") unless csv_rows(File.join(ANALYSIS, "arc_pacing.csv")) == 751

  endpoint = File.join(STAGE, "derived", "manager-arc-endpoint-audit-2026-08-14.csv")
  extra = File.join(STAGE, "derived", "manager-extra-sample-qa-2026-08-14.csv")
  surface = File.join(STAGE, "derived", "arc-surface-evidence-v2.csv")
  decisions = File.join(STAGE, "authority", "effective-redteam-decisions-v2.csv")
  verify_one_sha!(endpoint, ENDPOINT_SHA, "endpoint audit")
  verify_one_sha!(extra, EXTRA_QA_SHA, "extra QA")
  fail!("endpoint rows") unless csv_rows(endpoint) == 131
  fail!("extra QA rows") unless csv_rows(extra) == 4
  fail!("surface evidence rows") unless csv_rows(surface) == 131
  fail!("effective decisions rows") unless csv_rows(decisions) == 131

  endpoint_rows = CSV.read(endpoint, headers: true, encoding: "UTF-8")
  result_counts = endpoint_rows.each_with_object(Hash.new(0)) { |row, counts| counts[row["result"]] += 1 }
  fail!("endpoint EDIT count") unless result_counts["EDIT"] == 77
  fail!("endpoint KEEP count") unless result_counts["KEEP"] == 54
  fail!("endpoint boundary count") unless result_counts["BOUNDARY_REVIEW"].zero?
  true
end

def verify_source!
  verify_one_sha!(SOURCE, SOURCE_SHA, "source")
  marker_count = File.foreach(SOURCE, encoding: "UTF-8").count { |line| line.start_with?("ⓚ") }
  fail!("source marker count: expected 751, got #{marker_count}") unless marker_count == 751
  receipt = JSON.parse(File.read(File.join(ANALYSIS, "source_receipt.json"), encoding: "UTF-8"))
  fail!("source receipt SHA") unless receipt.fetch("sourceSha256") == SOURCE_SHA
  fail!("source receipt markers") unless receipt.fetch("markerCount") == 751
  true
end

def verify_stale_status_zero!
  files = %w[completion_receipt.md project_bible.md free_improvements_report.md inkos_usage_and_gap_report.md]
  text = files.map { |name| File.read(File.join(ANALYSIS, name), encoding: "UTF-8") }.join("\n")
  STALE_STATUS.each do |token|
    fail!("stale canonical status remains: #{token}") if text.include?(token)
  end
  completion = File.read(File.join(ANALYSIS, "completion_receipt.md"), encoding: "UTF-8")
  fail!("canonical status missing") unless completion.include?("CANONICAL_APPLIED / MANAGER_QA_PASS")
  fail!("canonical date missing") unless completion.include?("canonical 적용: **2026-08-14 완료**")
  fail!("canonical strict receipt missing") unless completion.include?(STRICT_PASS)
  true
end

def normalized_sentence_units(text)
  text.split(/(?<=[.!?다])\s+|\n+/).map do |unit|
    unit.gsub(/[`|#*]/, "").gsub(/\s+/, " ").strip
  end.select { |unit| unit.length >= 30 }
end

def verify_report_draft!
  verify_one_sha!(DRAFT, DRAFT_SHA, "manager QA draft")
  text = File.read(DRAFT, encoding: "UTF-8")
  fail!("manager QA first line") unless text.lines.first.to_s.chomp == FIRST_LINE
  REPORT_REQUIRED.each { |token| fail!("manager QA missing: #{token}") unless text.include?(token) }
  REPORT_FORBIDDEN.each { |token| fail!("manager QA forbidden phrase: #{token}") if text.include?(token) }
  fail!("manager QA contains em dash") if text.include?("—")
  fail!("manager QA contains unicode arrow") if text.match?(/[→⇒⟶]/)
  fail!("manager QA contains question mark") if text.include?("?")
  fail!("manager QA contains bold-first bullet") if text.lines.any? { |line| line.match?(/\A\s*-\s+\*\*/) }

  rubric = []
  text.lines.each do |line|
    match = line.match(/\A\| (0[1-9]|1[0-5]) \| ([^|]+) \| PASS \| (.+) \|\s*\z/)
    rubric << [match[1], match[2].strip, match[3].strip] if match
  end
  fail!("manager QA rubric row count: #{rubric.length}") unless rubric.length == 15
  fail!("manager QA rubric ordinals") unless rubric.map(&:first) == (1..15).map { |number| format("%02d", number) }
  fail!("manager QA duplicate rubric labels") unless rubric.map { |row| row[1] }.uniq.length == 15
  fail!("manager QA duplicate rubric evidence") unless rubric.map { |row| row[2] }.uniq.length == 15
  leads = rubric.map { |row| row[2].gsub(/[`*0-9,.·~%]/, "").gsub(/\s+/, " ")[0, 24] }
  fail!("manager QA repeated evidence lead") unless leads.uniq.length == 15

  units = normalized_sentence_units(text)
  duplicates = units.group_by { |unit| unit }.select { |_unit, copies| copies.length > 1 }
  fail!("manager QA duplicate sentence: #{duplicates.keys.first}") unless duplicates.empty?

  score_match = text.match(/Directness (\d+), Rhythm (\d+), Trust (\d+), Authenticity (\d+), Density (\d+)\. 합계 (\d+)\/50\./)
  fail!("manager QA deslop score missing") unless score_match
  component_sum = score_match.captures.first(5).map(&:to_i).inject(0, :+)
  fail!("manager QA deslop sum mismatch") unless component_sum == score_match[6].to_i
  fail!("manager QA deslop score below 40") unless component_sum >= 40
  true
end

def verify_stage_and_checkpoint!
  verify_one_sha!(V1_MANIFEST, V1_MANIFEST_SHA, "v1 manifest")
  verify_one_sha!(V2_MANIFEST, V2_MANIFEST_SHA, "v2 manifest")
  v3_entries = manifest_entries(V3_MANIFEST, STAGE, V3_MANIFEST_SHA, 34, "v3")
  fail!("v3 stage file count") unless file_paths(STAGE).length == 35
  STAGE_COPY_SPECS.each_value do |path|
    relative = relative_path(path, STAGE)
    fail!("copy input missing from v3 manifest: #{relative}") unless v3_entries.key?(relative)
  end

  checkpoint_entries = manifest_entries(PRE_APPLY_MANIFEST, PRE_APPLY_CHECKPOINT, PRE_APPLY_MANIFEST_SHA, 12, "pre-apply checkpoint")
  fail!("pre-apply checkpoint file count") unless file_paths(PRE_APPLY_CHECKPOINT).length == 13
  verify_root_set!(File.join(PRE_APPLY_CHECKPOINT, "canonical"), PRE_APPLY_OLD_SHA, "pre-apply old root9")
  fail!("checkpoint receipt missing") unless checkpoint_entries.key?("checkpoint-receipt.json")
  true
end

def capture_strict!
  stdout, stderr, status = Dir.chdir(REPO) do
    Open3.capture3("node", STRICT_TOOL, "doksik-chaebol3", "--strict")
  end
  combined = [stdout, stderr].reject(&:empty?).join
  fail!("common strict failed (exit #{status.exitstatus}): #{combined}") unless status.success?
  fail!("common strict exact PASS missing: #{combined}") unless combined.lines.map(&:strip).include?(STRICT_PASS)
  combined.end_with?("\n") ? combined : combined + "\n"
end

def new_targets
  [REPORT_FINAL, REPORT_TEMP, GOLD_FINAL, GOLD_TEMP, TAR_FINAL, TAR_TEMP, TAR_SHA_FINAL, TAR_SHA_TEMP]
end

def assert_new_targets_absent!
  new_targets.each { |path| fail!("new target already exists: #{path}") if File.exist?(path) }
end

def preflight!(capture_strict)
  fail!("root allowlist mismatch") unless ROOT_FILES.uniq.length == 9
  fail!("gold copy allowlist duplicate") unless STAGE_COPY_SPECS.keys.uniq.length == STAGE_COPY_SPECS.length
  ensure_regular_file!(STRICT_TOOL, "strict tool")
  fail!("checkpoint directory missing") unless File.directory?(CHECKPOINTS)
  verify_root_set!(ANALYSIS, FINAL_ROOT_SHA, "final canonical root9")
  verify_stale_status_zero!
  verify_source!
  verify_counts!
  verify_stage_and_checkpoint!
  verify_report_draft!
  assert_new_targets_absent!
  strict_output = capture_strict ? capture_strict! : nil
  {
    "reportSha" => DRAFT_SHA,
    "strictOutput" => strict_output
  }
end

def write_binary(path, content)
  File.open(path, "wb") { |file| file.write(content) }
end

def copy_verified(source, target)
  ensure_regular_file!(source, "copy source")
  FileUtils.mkdir_p(File.dirname(target))
  FileUtils.cp(source, target, preserve: true)
  fail!("copy SHA mismatch: #{target}") unless sha(source) == sha(target)
end

def planned_gold_files
  paths = ROOT_FILES.map { |name| "canonical/#{name}" }
  paths << "manager_final_qa.md"
  paths << "validation/common-strict.txt"
  paths.concat(STAGE_COPY_SPECS.keys)
  paths << "receipts/source_receipt.json"
  paths << "receipts/pre-v3-checkpoint-pointer-receipt.json"
  paths << "receipt.json"
  paths.sort
end

def build_gold_receipt(report_sha)
  {
    "status" => "DOKSIK_NATURAL_ARC_GOLD",
    "createdAt" => Time.now.iso8601,
    "title" => "독식하는 재벌 3세",
    "penName" => "서오",
    "sourceSha256" => SOURCE_SHA,
    "canonicalRoot9Sha256" => FINAL_ROOT_SHA,
    "managerFinalQaSha256" => report_sha,
    "v3ManifestSha256" => V3_MANIFEST_SHA,
    "preApplyCheckpoint" => PRE_APPLY_CHECKPOINT,
    "preApplyCheckpointManifestSha256" => PRE_APPLY_MANIFEST_SHA,
    "strict" => {
      "chapters" => 751,
      "arcs" => 131,
      "errors" => 0,
      "warnings" => 0
    },
    "rubric" => "15/15 PASS",
    "surfaceEvidence" => "131/131",
    "endpointAudit" => {
      "total" => 131,
      "edit" => 77,
      "keep" => 54,
      "boundaryReview" => 0
    },
    "extraSamples" => [466, 468, 471, 721],
    "commitPush" => false,
    "scope" => "doksik-chaebol3 only; other works, Chinese materials, and InkOS parent not accessed",
    "payloadFilesBeforeManifest" => planned_gold_files
  }
end

def build_manifest!(base)
  output = File.join(base, "gold-manifest.sha256")
  fail!("manifest already exists") if File.exist?(output)
  files = file_paths(base)
  body = files.map { |path| "#{sha(path)}  #{relative_path(path, base)}" }.join("\n") + "\n"
  write_binary(output, body)
  entries = manifest_entries(output, base, sha(output), files.length, "gold")
  fail!("gold manifest path set") unless entries.keys.sort == files.map { |path| relative_path(path, base) }.sort
  [output, entries.length]
end

def create_tar!(source_dir)
  env = { "COPYFILE_DISABLE" => "1" }
  stdout, stderr, status = Open3.capture3(env, "/usr/bin/tar", "-czf", TAR_TEMP, "-C", source_dir, ".")
  fail!("tar create failed: #{stdout}#{stderr}") unless status.success?
  ensure_regular_file!(TAR_TEMP, "gold tar temp")

  list_out, list_err, list_status = Open3.capture3(env, "/usr/bin/tar", "-tzf", TAR_TEMP)
  fail!("tar list failed: #{list_out}#{list_err}") unless list_status.success?
  members = list_out.lines.map(&:chomp).reject { |entry| entry.end_with?("/") }.map do |entry|
    entry.sub(/\A\.\//, "")
  end.reject(&:empty?).sort
  expected = file_paths(source_dir).map { |path| relative_path(path, source_dir) }.sort
  fail!("tar member mismatch") unless members == expected
  [sha(TAR_TEMP), members.length]
end

def verify_sidecar!(path, tar_path, expected_sha)
  ensure_regular_file!(path, "tar SHA sidecar")
  expected = "#{expected_sha}  #{File.basename(tar_path)}\n"
  actual = File.read(path, encoding: "UTF-8")
  fail!("tar SHA sidecar mismatch") unless actual == expected
  true
end

def safe_cleanup_new_targets!
  allowed = new_targets
  allowed.each do |path|
    fail!("unsafe cleanup target: #{path}") unless new_targets.include?(path)
    FileUtils.rm_rf(path) if File.exist?(path)
  end
end

def build!
  preflight!(false)
  strict_output = capture_strict!
  build_started = false

  begin
    build_started = true
    copy_verified(DRAFT, REPORT_TEMP)
    verify_one_sha!(REPORT_TEMP, DRAFT_SHA, "manager QA temp")
    File.rename(REPORT_TEMP, REPORT_FINAL)
    verify_one_sha!(REPORT_FINAL, DRAFT_SHA, "manager QA final")

    Dir.mkdir(GOLD_TEMP)
    %w[canonical validation evidence authority receipts].each do |directory|
      Dir.mkdir(File.join(GOLD_TEMP, directory))
    end
    ROOT_FILES.each do |name|
      copy_verified(File.join(ANALYSIS, name), File.join(GOLD_TEMP, "canonical", name))
    end
    copy_verified(REPORT_FINAL, File.join(GOLD_TEMP, "manager_final_qa.md"))
    write_binary(File.join(GOLD_TEMP, "validation", "common-strict.txt"), strict_output)
    STAGE_COPY_SPECS.each do |relative, source|
      copy_verified(source, File.join(GOLD_TEMP, relative))
    end
    copy_verified(File.join(ANALYSIS, "source_receipt.json"), File.join(GOLD_TEMP, "receipts", "source_receipt.json"))
    copy_verified(File.join(PRE_APPLY_CHECKPOINT, "checkpoint-receipt.json"), File.join(GOLD_TEMP, "receipts", "pre-v3-checkpoint-pointer-receipt.json"))

    receipt = JSON.pretty_generate(build_gold_receipt(DRAFT_SHA)) + "\n"
    write_binary(File.join(GOLD_TEMP, "receipt.json"), receipt)
    actual_before_manifest = file_paths(GOLD_TEMP).map { |path| relative_path(path, GOLD_TEMP) }.sort
    fail!("gold payload allowlist mismatch") unless actual_before_manifest == planned_gold_files

    manifest_path, manifest_rows = build_manifest!(GOLD_TEMP)
    fail!("gold manifest rows: expected 23, got #{manifest_rows}") unless manifest_rows == 23
    fail!("gold file count: expected 24") unless file_paths(GOLD_TEMP).length == 24
    manifest_sha = sha(manifest_path)
    gold_tree_sha = tree_sha(GOLD_TEMP)

    tar_sha, tar_members = create_tar!(GOLD_TEMP)
    write_binary(TAR_SHA_TEMP, "#{tar_sha}  #{File.basename(TAR_FINAL)}\n")
    verify_sidecar!(TAR_SHA_TEMP, TAR_FINAL, tar_sha)

    File.rename(GOLD_TEMP, GOLD_FINAL)
    File.rename(TAR_TEMP, TAR_FINAL)
    File.rename(TAR_SHA_TEMP, TAR_SHA_FINAL)

    final_manifest = File.join(GOLD_FINAL, "gold-manifest.sha256")
    manifest_entries(final_manifest, GOLD_FINAL, manifest_sha, manifest_rows, "final gold")
    fail!("final gold tree SHA") unless tree_sha(GOLD_FINAL) == gold_tree_sha
    verify_one_sha!(TAR_FINAL, tar_sha, "final gold tar")
    verify_sidecar!(TAR_SHA_FINAL, TAR_FINAL, tar_sha)
    verify_one_sha!(REPORT_FINAL, DRAFT_SHA, "final manager QA")
    verify_root_set!(ANALYSIS, FINAL_ROOT_SHA, "post-build canonical root9")
    verify_stage_and_checkpoint!
    assert_no_temp = [REPORT_TEMP, GOLD_TEMP, TAR_TEMP, TAR_SHA_TEMP].none? { |path| File.exist?(path) }
    fail!("build temp remains") unless assert_no_temp

    puts "PASS DOKSIK_NATURAL_ARC_GOLD"
    puts STRICT_PASS
    puts "report_sha256=#{DRAFT_SHA}"
    puts "gold_manifest_sha256=#{manifest_sha} rows=#{manifest_rows}"
    puts "gold_tree_sha256=#{gold_tree_sha} files=24"
    puts "tar_sha256=#{tar_sha} members=#{tar_members}"
    puts "gold=#{GOLD_FINAL}"
    puts "commit_push=NOT_PERFORMED canonical_root9=UNCHANGED"
  rescue StandardError => error
    cleanup_status = "NOT_NEEDED"
    if build_started
      begin
        safe_cleanup_new_targets!
        verify_root_set!(ANALYSIS, FINAL_ROOT_SHA, "failure canonical root9")
        cleanup_status = "PASS new_targets_absent"
      rescue StandardError => cleanup_error
        cleanup_status = "FAIL #{cleanup_error.class}: #{cleanup_error.message}"
      end
    end
    warn "GOLD BUILD FAILED: #{error.class}: #{error.message}"
    warn "CLEANUP: #{cleanup_status}"
    raise
  end
end

case ARGV
when ["--preflight"]
  result = preflight!(true)
  puts "PASS DOKSIK_GOLD_PREFLIGHT write=0"
  puts STRICT_PASS
  puts "canonical_root9=9/9 stale_status=0 source=#{SOURCE_SHA}"
  puts "manifests=v1/v2/v3 pre_apply_checkpoint=12/12"
  puts "report_draft_sha256=#{result.fetch('reportSha')} rubric=15/15 deslop=44/50"
  puts "final_targets=ABSENT temps=ABSENT"
when []
  build!
else
  abort "usage: #{File.basename(__FILE__)} [--preflight]"
end
