#!/usr/bin/env ruby
# frozen_string_literal: true

require "digest"
require "fileutils"
require "open3"

WORK = __dir__
ANALYSIS = File.expand_path("../../..", WORK)
REPO = File.expand_path("../..", ANALYSIS)
STAGE = File.join(WORK, "stage-manager-redteam-v3-2026-08-14")
STAGE_MANIFEST = File.join(STAGE, "stage-file-manifest.sha256")
CHECKPOINT = File.join(REPO, "exports", "checkpoints", "2026-08-14-doksik-pre-v3-canonical-apply")
CHECKPOINT_MANIFEST = File.join(CHECKPOINT, "checkpoint-files.sha256")
STRICT_TOOL = File.join(REPO, "tools", "validate-five-work-analyses.mjs")

STATUS_TEMP = File.join(ANALYSIS, ".doksik-canonical-status-finalize.tmp")
STATUS_ROLLBACK_TEMP = File.join(ANALYSIS, ".doksik-canonical-status-rollback.tmp")

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

STATUS_FILES = %w[
  completion_receipt.md
  free_improvements_report.md
  inkos_usage_and_gap_report.md
  project_bible.md
].freeze

PROMOTED_SHA = {
  "arc_atlas.md" => "90f1eb72082f2853bf23f96a644eb7fa78ac0d90f536c04f0aec817091140c4f",
  "arc_map.csv" => "570bc330e5e0597636ee41a31ffd8df3ac1801c8a8f9c7a3af74edaa80f17167",
  "arc_pacing.csv" => "2cb43590950999894bb66c46a48172ffd59015a2125c73b4140de9307540bc46",
  "chapter_map.csv" => "3e6ade1b048df571a4bd327f4c699751eabbe4e403761b4b17f1e54610dd5167",
  "completion_receipt.md" => "48deee0cee8546917e7ffe7eb0f9c820bfae008749da5f73cebe836c05fdbae3",
  "free_improvements_report.md" => "fa261554a573316172acf0dd97ccc82d9b71d5f8bdb3a9316ff47013c302467a",
  "inkos_usage_and_gap_report.md" => "fd1e6d3267c5283054352a1ebfbcacf9e3b4c7b47c257304663e1331199a623f",
  "project_bible.md" => "36a7d21ee158d2214ee62005b6cd28221fb646386d3b0b489b62ef8bf6be3dd2",
  "source_receipt.json" => "5aad05680d9c6a4a6712a79900fce98efc6c4995e22eee98126497e61b2b019d"
}.freeze

CHECKPOINT_OLD_SHA = {
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

STAGE_MANIFEST_SHA = "13d79bb34bf64e0998ae9dcd46386feb92ad2c51d7466daba658390381dcb711"
CHECKPOINT_MANIFEST_SHA = "469042da5c4e0801715cd56921316645c1372c341c09c9f0d07c0cacdb8b842a"
STRICT_PASS = "PASS 독식하는 재벌 3세: 751회 / 131 Arc / 오류 0 / 경고 0"

CLOSEOUT = <<~TEXT.chomp
  ## 관리자 정본 마감

  v3 manifest SHA `13d79bb34bf64e0998ae9dcd46386feb92ad2c51d7466daba658390381dcb711`의 131개 자연 NarrativeArc 정본을 2026-08-14 canonical에 적용했다. 적용 전 root 9개는 `exports/checkpoints/2026-08-14-doksik-pre-v3-canonical-apply/`에 보존했으며 checkpoint manifest SHA는 `469042da5c4e0801715cd56921316645c1372c341c09c9f0d07c0cacdb8b842a`다.

  Canonical strict는 **751회 / 131 Arc / 오류 0 / 경고 0**, 관리자 수동 QA는 **15/15 PASS**다. 추적 근거는 **surface 131/131 + endpoint 131/131 + 추가표본 466·468·471·721**이며 commit/push는 하지 않았음.
TEXT

PATCHES = {
  "completion_receipt.md" => [
    ["- 상태: **STAGE_READY / AWAITING_MANAGER_V3_STAGE_APPROVAL**",
      "- 상태: **CANONICAL_APPLIED / MANAGER_QA_PASS**"],
    ["- canonical 적용: **하지 않음**",
      "- canonical 적용: **2026-08-14 완료**"],
    ["canonical apply·commit·push는 하지 않았으며 관리자 승인 전 완료로 선언하지 않는다.",
      CLOSEOUT]
  ],
  "project_bible.md" => [
    ["> 아래 개요는 Arc 목록을 읽지 않아도 김민재의 출발·욕망·능력·관계·시대사건·보상·결말을 따라갈 수 있는 독립 층이다. 뒤의 131개 NarrativeArc는 회차·경계 추적용 부록이며 canonical에는 아직 적용하지 않았다.",
      "> 아래 개요는 Arc 목록을 읽지 않아도 김민재의 출발·욕망·능력·관계·시대사건·보상·결말을 따라갈 수 있는 독립 층이다. 뒤의 131개 자연 NarrativeArc는 회차·경계 추적용 부록이며 2026-08-14 정본에 적용되어 관리자 QA를 통과했다."]
  ],
  "free_improvements_report.md" => [
    ["> canonical 미적용. 아래 열 가지는 이 작품을 더 재미있게 만드는 작품 고유 편집안이며 131행 추적은 부록으로만 둔다.",
      "> 131개 자연 NarrativeArc 정본 적용을 2026-08-14 완료했고 관리자 QA를 통과했다. 아래 열 가지는 이 작품을 더 재미있게 만드는 작품 고유 편집안이며 131행 추적은 부록으로만 둔다."],
    ["STAGE_READY 후보이며 관리자 승인 전 canonical과 공통 도구를 바꾸지 않는다.",
      "131개 자연 NarrativeArc 정본 적용을 완료했고 관리자 QA를 통과했다. 공통 도구는 변경하지 않았으며 commit·push는 하지 않았다."]
  ],
  "inkos_usage_and_gap_report.md" => [
    ["> canonical 미적용. 이 본문은 Arc 덤프 없이도 제품 결론과 구현 계약을 읽을 수 있게 작성했다. 131행 추적은 맨 뒤 부록이다.",
      "> 131개 자연 NarrativeArc 정본 적용을 2026-08-14 완료했고 관리자 QA를 통과했다. 이 본문은 Arc 덤프 없이도 제품 결론과 구현 계약을 읽을 수 있게 작성했으며 131행 추적은 맨 뒤 부록이다."],
    ["관리자 승인 전 canonical 적용·완료 선언·커밋·푸시는 하지 않는다.",
      "131개 자연 NarrativeArc 정본 적용을 완료했고 관리자 QA를 통과했다. InkOS 공통 구현은 변경하지 않았으며 commit·push는 하지 않았다."]
  ]
}.freeze

STALE_CURRENT_STATUS = [
  "STAGE_READY / AWAITING_MANAGER_V3_STAGE_APPROVAL",
  "- canonical 적용: **하지 않음**",
  "canonical apply·commit·push는 하지 않았으며 관리자 승인 전 완료로 선언하지 않는다.",
  "canonical에는 아직 적용하지 않았다.",
  "> canonical 미적용.",
  "STAGE_READY 후보이며 관리자 승인 전 canonical과 공통 도구를 바꾸지 않는다.",
  "관리자 승인 전 canonical 적용·완료 선언·커밋·푸시는 하지 않는다."
].freeze

def fail!(message)
  raise RuntimeError, message
end

def sha(path)
  Digest::SHA256.file(path).hexdigest
end

def body_sha(body)
  Digest::SHA256.hexdigest(body)
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

def verify_local_manifest!(manifest, base, expected_sha, expected_rows, label)
  verify_one_sha!(manifest, expected_sha, "#{label} manifest")
  lines = File.readlines(manifest, encoding: "UTF-8").map(&:chomp).reject(&:empty?)
  fail!("#{label} manifest rows: expected #{expected_rows}, got #{lines.length}") unless lines.length == expected_rows

  paths = lines.map do |line|
    match = line.match(/\A([0-9a-f]{64})  (.+)\z/)
    fail!("#{label} invalid manifest line: #{line}") unless match
    relative = match[2]
    fail!("#{label} unsafe manifest path: #{relative}") unless safe_relative_path?(relative)
    expanded = File.expand_path(relative, base)
    prefix = File.expand_path(base) + File::SEPARATOR
    fail!("#{label} manifest escaped base: #{relative}") unless expanded.start_with?(prefix)
    verify_one_sha!(expanded, match[1], "#{label} entry #{relative}")
    relative
  end
  fail!("#{label} duplicate manifest path") unless paths.uniq.length == paths.length
  true
end

def file_count(base)
  Dir.glob(File.join(base, "**", "*"), File::FNM_DOTMATCH).count { |path| File.file?(path) }
end

def exact_count(text, token)
  text.scan(Regexp.new(Regexp.escape(token))).length
end

def transform_body(name)
  source = File.read(File.join(ANALYSIS, name), encoding: "UTF-8")
  PATCHES.fetch(name).each do |old_text, new_text|
    count = exact_count(source, old_text)
    fail!("#{name} expected stale phrase once, found #{count}: #{old_text}") unless count == 1
    source = source.sub(old_text, new_text)
  end
  PATCHES.fetch(name).each do |old_text, _new_text|
    fail!("#{name} stale phrase remains: #{old_text}") unless exact_count(source, old_text).zero?
  end
  STALE_CURRENT_STATUS.each do |token|
    fail!("#{name} stale current-status token remains: #{token}") if source.include?(token)
  end
  source
end

def build_expected_bodies
  fail!("status allowlist mismatch") unless PATCHES.keys.sort == STATUS_FILES.sort
  bodies = {}
  STATUS_FILES.each { |name| bodies[name] = transform_body(name) }

  completion = bodies.fetch("completion_receipt.md")
  [
    "CANONICAL_APPLIED / MANAGER_QA_PASS",
    "canonical 적용: **2026-08-14 완료**",
    STAGE_MANIFEST_SHA,
    CHECKPOINT_MANIFEST_SHA,
    "751회 / 131 Arc / 오류 0 / 경고 0",
    "15/15 PASS",
    "surface 131/131 + endpoint 131/131 + 추가표본 466·468·471·721",
    "commit/push는 하지 않았음"
  ].each do |token|
    fail!("completion closeout missing: #{token}") unless completion.include?(token)
  end
  bodies
end

def expected_final_sha(bodies)
  expected = PROMOTED_SHA.dup
  bodies.each { |name, body| expected[name] = body_sha(body) }
  expected
end

def verify_checkpoint!
  fail!("pre-apply checkpoint missing") unless File.directory?(CHECKPOINT)
  fail!("checkpoint file count mismatch") unless file_count(CHECKPOINT) == 13
  verify_local_manifest!(CHECKPOINT_MANIFEST, CHECKPOINT, CHECKPOINT_MANIFEST_SHA, 12, "checkpoint")
  verify_root_set!(File.join(CHECKPOINT, "canonical"), CHECKPOINT_OLD_SHA, "checkpoint old root9")
  verify_one_sha!(File.join(CHECKPOINT, "stage-v3-manifest.sha256"), STAGE_MANIFEST_SHA, "checkpoint v3 manifest copy")
  true
end

def verify_v3_stage!
  fail!("v3 stage missing") unless File.directory?(STAGE)
  fail!("v3 stage file count mismatch") unless file_count(STAGE) == 35
  verify_root_set!(STAGE, PROMOTED_SHA, "v3 stage root9")
  verify_local_manifest!(STAGE_MANIFEST, STAGE, STAGE_MANIFEST_SHA, 34, "v3 stage")
  true
end

def protected_temp_paths
  [
    File.join(REPO, "exports", "checkpoints", ".2026-08-14-doksik-pre-v3-canonical-apply.tmp"),
    File.join(ANALYSIS, ".doksik-v3-canonical-apply.tmp"),
    File.join(ANALYSIS, ".doksik-v3-canonical-rollback.tmp"),
    STATUS_TEMP,
    STATUS_ROLLBACK_TEMP
  ]
end

def assert_temps_absent!
  protected_temp_paths.each do |path|
    fail!("protected temp exists: #{path}") if File.exist?(path)
  end
end

def preflight!
  fail!("root allowlist mismatch") unless ROOT_FILES.uniq.length == 9
  fail!("status allowlist mismatch") unless STATUS_FILES.uniq.length == 4
  fail!("status file escaped root allowlist") unless (STATUS_FILES - ROOT_FILES).empty?
  fail!("strict tool missing") unless File.file?(STRICT_TOOL)

  verify_root_set!(ANALYSIS, PROMOTED_SHA, "canonical promoted root9")
  verify_v3_stage!
  verify_checkpoint!
  assert_temps_absent!

  bodies = build_expected_bodies
  {
    "bodies" => bodies,
    "finalSha" => expected_final_sha(bodies)
  }
end

def write_binary(path, content)
  File.open(path, "wb") { |file| file.write(content) }
end

def safe_remove_status_temp!
  fail!("unsafe status temp") unless STATUS_TEMP == File.join(ANALYSIS, ".doksik-canonical-status-finalize.tmp")
  FileUtils.rm_rf(STATUS_TEMP) if File.exist?(STATUS_TEMP)
end

def restore_status_files!
  fail!("rollback temp already exists") if File.exist?(STATUS_ROLLBACK_TEMP)
  Dir.mkdir(STATUS_ROLLBACK_TEMP)
  STATUS_FILES.each do |name|
    FileUtils.cp(File.join(STAGE, name), File.join(STATUS_ROLLBACK_TEMP, name), preserve: true)
    verify_one_sha!(File.join(STATUS_ROLLBACK_TEMP, name), PROMOTED_SHA.fetch(name), "rollback temp #{name}")
  end
  STATUS_FILES.each do |name|
    File.rename(File.join(STATUS_ROLLBACK_TEMP, name), File.join(ANALYSIS, name))
  end
  Dir.rmdir(STATUS_ROLLBACK_TEMP)
  safe_remove_status_temp!
  verify_root_set!(ANALYSIS, PROMOTED_SHA, "canonical status rollback")
  true
end

def run_strict!
  stdout, stderr, status = Dir.chdir(REPO) do
    Open3.capture3("node", STRICT_TOOL, "doksik-chaebol3", "--strict")
  end
  combined = [stdout, stderr].reject(&:empty?).join
  fail!("common strict failed (exit #{status.exitstatus}): #{combined}") unless status.success?
  fail!("common strict PASS receipt missing: #{combined}") unless combined.include?(STRICT_PASS)
  combined
end

def apply!
  result = preflight!
  bodies = result.fetch("bodies")
  final_sha = result.fetch("finalSha")
  apply_started = false

  begin
    Dir.mkdir(STATUS_TEMP)
    STATUS_FILES.each do |name|
      target = File.join(STATUS_TEMP, name)
      write_binary(target, bodies.fetch(name))
      verify_one_sha!(target, final_sha.fetch(name), "status temp #{name}")
    end

    apply_started = true
    STATUS_FILES.each do |name|
      File.rename(File.join(STATUS_TEMP, name), File.join(ANALYSIS, name))
    end
    Dir.rmdir(STATUS_TEMP)
    verify_root_set!(ANALYSIS, final_sha, "canonical finalized root9")

    strict_output = run_strict!
    verify_v3_stage!
    verify_checkpoint!
    assert_temps_absent!
    verify_root_set!(ANALYSIS, final_sha, "canonical finalized post-strict")

    puts "PASS CANONICAL_STATUS_FINALIZED files=4"
    puts STRICT_PASS
    puts strict_output unless strict_output.include?(STRICT_PASS) && strict_output.strip == STRICT_PASS
    STATUS_FILES.each { |name| puts "finalized #{final_sha.fetch(name)}  #{name}" }
    puts "v3_stage=UNCHANGED checkpoint=UNCHANGED other_canonical=5/5 commit_push=NOT_PERFORMED"
  rescue StandardError => error
    rollback_status = "NOT_NEEDED"
    if apply_started
      begin
        restore_status_files!
        rollback_status = "PASS promoted_sha=9/9"
      rescue StandardError => rollback_error
        rollback_status = "FAIL #{rollback_error.class}: #{rollback_error.message}"
      end
    else
      safe_remove_status_temp!
    end
    warn "STATUS FINALIZE FAILED: #{error.class}: #{error.message}"
    warn "ROLLBACK: #{rollback_status}"
    raise
  end
end

case ARGV
when ["--preflight"]
  result = preflight!
  puts "PASS CANONICAL_STATUS_PREFLIGHT write=0"
  puts "canonical_promoted_sha=9/9 v3_manifest=#{STAGE_MANIFEST_SHA}"
  puts "checkpoint_manifest=#{CHECKPOINT_MANIFEST_SHA} checkpoint_old_sha=9/9 temps=ABSENT"
  STATUS_FILES.each do |name|
    puts "expected #{result.fetch('finalSha').fetch(name)}  #{name}"
  end
when []
  apply!
else
  abort "usage: #{File.basename(__FILE__)} [--preflight]"
end
