#!/usr/bin/env ruby
# frozen_string_literal: true

require "digest"
require "fileutils"
require "json"
require "time"

WORK = __dir__
ANALYSIS = File.expand_path("../../..", WORK)
REPO = File.expand_path("../..", ANALYSIS)
CHECKPOINTS = File.join(REPO, "exports", "checkpoints")
STAGE = File.join(WORK, "stage-manager-redteam-v3-2026-08-14")
STAGE_MANIFEST = File.join(STAGE, "stage-file-manifest.sha256")
EXTRA_LEDGER_NAME = "manager-extra-sample-qa-2026-08-14.csv"
EXTRA_LEDGER_WORK = File.join(WORK, EXTRA_LEDGER_NAME)
EXTRA_LEDGER_STAGE = File.join(STAGE, "derived", EXTRA_LEDGER_NAME)

CHECKPOINT_NAME = "2026-08-14-doksik-pre-v3-canonical-apply"
CHECKPOINT_FINAL = File.join(CHECKPOINTS, CHECKPOINT_NAME)
CHECKPOINT_TEMP = File.join(CHECKPOINTS, ".#{CHECKPOINT_NAME}.tmp")
APPLY_TEMP = File.join(ANALYSIS, ".doksik-v3-canonical-apply.tmp")
ROLLBACK_TEMP = File.join(ANALYSIS, ".doksik-v3-canonical-rollback.tmp")

ALLOWED_ROOTS = %w[
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

OLD_SHA = {
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

NEW_SHA = {
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

STAGE_MANIFEST_SHA = "13d79bb34bf64e0998ae9dcd46386feb92ad2c51d7466daba658390381dcb711"
EXTRA_LEDGER_SHA = "b6711ddac75e1869ffb0fe8edd86a3a97e945a13396ceab447f7aacfbe6b6bc7"
AUTHORITY_SHA = "0057ffe04283cdec7cf707cd72737e0a3c6f0679566268e9a6efa07a3f3d458a"
VALIDATOR_SHA = "852b0143f1a5a08409a703817f71780fa37e8741dac454d91123c0cabd30dcc8"
V1_MANIFEST = File.join(WORK, "stage-manager-redteam-2026-08-14", "stage-file-manifest.sha256")
V1_MANIFEST_SHA = "c1225d7a567ebdbdca0ffbcbb4f338b75209cc4576e4f559f9eef96e969ab619"
V2_MANIFEST = File.join(WORK, "stage-manager-redteam-v2-2026-08-14", "stage-file-manifest.sha256")
V2_MANIFEST_SHA = "e55a6d63f8830fe3f57a6a9c907343fa5241b9c6e628da94e245ad7d7156dbac"
PROTECTED_CHECKPOINTS = {
  File.join(CHECKPOINTS, "2026-08-14-doksik-pre-pacing-rework.tar.gz") => "13cbbdd4226452abd006e3e5348e63356f99bcef5627329eba7ef8311fa9896a",
  File.join(CHECKPOINTS, "2026-08-14-doksik-pre-redteam-rework.tar.gz") => "d60b72fc4bea6a324eea49cf58c8fc2ec1e49425095f10acff2c830690bb3965"
}.freeze

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
  fail!("#{label} key set mismatch") unless expected.keys == ALLOWED_ROOTS
  ALLOWED_ROOTS.each do |name|
    verify_one_sha!(File.join(base, name), expected.fetch(name), "#{label} #{name}")
  end
  true
end

def safe_relative_path?(relative)
  return false if relative.empty? || relative.start_with?("/") || relative.include?("\0")
  parts = relative.split("/")
  parts.none? { |part| part.empty? || part == "." || part == ".." }
end

def manifest_entries(path, base, expected_manifest_sha, expected_count)
  verify_one_sha!(path, expected_manifest_sha, "stage manifest")
  lines = File.readlines(path, encoding: "UTF-8").map(&:chomp).reject(&:empty?)
  fail!("manifest row count mismatch: expected #{expected_count}, got #{lines.length}") unless lines.length == expected_count
  entries = lines.map do |line|
    match = line.match(/\A([0-9a-f]{64})  (.+)\z/)
    fail!("invalid manifest line: #{line}") unless match
    relative = match[2]
    fail!("unsafe manifest path: #{relative}") unless safe_relative_path?(relative)
    expanded = File.expand_path(relative, base)
    prefix = File.expand_path(base) + File::SEPARATOR
    fail!("manifest path escaped stage: #{relative}") unless expanded.start_with?(prefix)
    verify_one_sha!(expanded, match[1], "manifest entry #{relative}")
    [relative, match[1]]
  end
  fail!("duplicate manifest path") unless entries.map(&:first).uniq.length == entries.length
  entries
end

def must_include!(text, label, *tokens)
  tokens.each do |token|
    fail!("#{label} missing #{token}") unless text.include?(token)
  end
end

def verify_validation_receipts!
  validator_text = File.read(File.join(STAGE, "validation", "stage-validator.txt"), encoding: "UTF-8")
  strict_text = File.read(File.join(STAGE, "validation", "common-strict.txt"), encoding: "UTF-8")
  build_text = File.read(File.join(STAGE, "validation", "stage-build-receipt.md"), encoding: "UTF-8")
  completion_text = File.read(File.join(STAGE, "completion_receipt.md"), encoding: "UTF-8")

  must_include!(validator_text, "stage validator receipt",
    "PASS stage-validator: arcs=131 chapters=751 pacing=751 evidence=751 high=354",
    "PASS coverage=1..751 gap=0 overlap=0",
    "PASS surface-scope=131",
    "PASS endpoint-audit=131",
    "466,468,471",
    "720,721,731")
  must_include!(strict_text, "common strict receipt",
    "PASS 독식하는 재벌 3세: 751회 / 131 Arc / 오류 0 / 경고 0")
  must_include!(build_text, "stage build receipt",
    "STAGE_READY / AWAITING_MANAGER_V3_STAGE_APPROVAL",
    EXTRA_LEDGER_SHA,
    "4 rows · 466/468/471/721",
    "canonical apply·commit·push 없음")
  must_include!(completion_text, "completion receipt",
    "STAGE_READY / AWAITING_MANAGER_V3_STAGE_APPROVAL",
    EXTRA_LEDGER_NAME,
    EXTRA_LEDGER_SHA,
    "관리자 추가표본 QA: **4/4**")

  receipt_path = File.join(STAGE, "authority", "authority-input-receipt.json")
  receipt = JSON.parse(File.read(receipt_path, encoding: "UTF-8"))
  fail!("authority receipt status") unless receipt.fetch("status") == "V3_STAGE_BUILD_INPUTS_VERIFIED"
  fail!("authority receipt stage target") unless receipt.fetch("stageTarget") == STAGE
  fail!("authority receipt write permission") unless receipt.fetch("canonicalWriteAllowed") == false
  fail!("authority receipt extra ledger SHA") unless receipt.fetch("extraSampleAuditSha256") == EXTRA_LEDGER_SHA
  fail!("authority receipt extra ledger rows") unless receipt.fetch("extraSampleAuditRows") == 4
  fail!("authority receipt extra ledger sequences") unless receipt.fetch("extraSampleAuditSequences") == [466, 468, 471, 721]
  true
end

def verify_protected_inputs!
  verify_one_sha!(V1_MANIFEST, V1_MANIFEST_SHA, "v1 manifest")
  verify_one_sha!(V2_MANIFEST, V2_MANIFEST_SHA, "v2 manifest")
  PROTECTED_CHECKPOINTS.each do |path, expected|
    verify_one_sha!(path, expected, "protected checkpoint")
  end
  true
end

def assert_write_targets_absent!
  [CHECKPOINT_FINAL, CHECKPOINT_TEMP, APPLY_TEMP, ROLLBACK_TEMP].each do |path|
    fail!("write target already exists: #{path}") if File.exist?(path)
  end
end

def preflight!
  fail!("allowlist mismatch") unless ALLOWED_ROOTS.uniq.length == 9
  fail!("OLD SHA allowlist mismatch") unless OLD_SHA.keys == ALLOWED_ROOTS
  fail!("NEW SHA allowlist mismatch") unless NEW_SHA.keys == ALLOWED_ROOTS
  fail!("checkpoint directory missing") unless File.directory?(CHECKPOINTS)
  fail!("v3 stage missing") unless File.directory?(STAGE)

  verify_root_set!(ANALYSIS, OLD_SHA, "canonical old")
  verify_root_set!(STAGE, NEW_SHA, "v3 stage new")
  entries = manifest_entries(STAGE_MANIFEST, STAGE, STAGE_MANIFEST_SHA, 34)
  expected_extra = ["derived/#{EXTRA_LEDGER_NAME}", EXTRA_LEDGER_SHA]
  fail!("extra ledger missing from manifest") unless entries.include?(expected_extra)
  stage_files = Dir.glob(File.join(STAGE, "**", "*"), File::FNM_DOTMATCH).select { |path| File.file?(path) }
  fail!("v3 stage file count mismatch: expected 35, got #{stage_files.length}") unless stage_files.length == 35

  verify_one_sha!(EXTRA_LEDGER_WORK, EXTRA_LEDGER_SHA, "work extra ledger")
  verify_one_sha!(EXTRA_LEDGER_STAGE, EXTRA_LEDGER_SHA, "stage extra ledger")
  verify_one_sha!(File.join(STAGE, "authority", "apply_manager_redteam_rework.rb"), AUTHORITY_SHA, "stage authority")
  verify_one_sha!(File.join(STAGE, "authority", "validate_manager_redteam_stage.rb"), VALIDATOR_SHA, "stage validator")
  verify_validation_receipts!
  verify_protected_inputs!
  assert_write_targets_absent!

  {
    "manifestRows" => entries.length,
    "stageFiles" => stage_files.length
  }
end

def write_binary(path, content)
  File.open(path, "wb") { |file| file.write(content) }
end

def build_file_manifest(dir, output_name)
  output_path = File.join(dir, output_name)
  files = Dir.glob(File.join(dir, "**", "*"), File::FNM_DOTMATCH).select do |path|
    File.file?(path) && path != output_path
  end.sort
  body = files.map do |path|
    relative = path.sub(/\A#{Regexp.escape(dir + File::SEPARATOR)}/, "")
    "#{sha(path)}  #{relative}"
  end.join("\n") + "\n"
  write_binary(output_path, body)
  output_path
end

def verify_local_manifest!(path, base)
  lines = File.readlines(path, encoding: "UTF-8").map(&:chomp).reject(&:empty?)
  lines.each do |line|
    match = line.match(/\A([0-9a-f]{64})  (.+)\z/)
    fail!("invalid local manifest line") unless match && safe_relative_path?(match[2])
    verify_one_sha!(File.join(base, match[2]), match[1], "checkpoint manifest #{match[2]}")
  end
  fail!("duplicate local manifest path") unless lines.map { |line| line.split("  ", 2).last }.uniq.length == lines.length
  lines.length
end

def tree_sha(dir)
  files = Dir.glob(File.join(dir, "**", "*"), File::FNM_DOTMATCH).select { |path| File.file?(path) }.sort
  material = files.map do |path|
    relative = path.sub(/\A#{Regexp.escape(dir + File::SEPARATOR)}/, "")
    "#{relative}\0#{sha(path)}\n"
  end.join
  Digest::SHA256.hexdigest(material)
end

def create_checkpoint!
  Dir.mkdir(CHECKPOINT_TEMP)
  canonical_dir = File.join(CHECKPOINT_TEMP, "canonical")
  Dir.mkdir(canonical_dir)
  ALLOWED_ROOTS.each do |name|
    FileUtils.cp(File.join(ANALYSIS, name), File.join(canonical_dir, name), preserve: true)
  end
  verify_root_set!(canonical_dir, OLD_SHA, "checkpoint canonical old")

  old_manifest = OLD_SHA.map { |name, digest| "#{digest}  canonical/#{name}" }.join("\n") + "\n"
  write_binary(File.join(CHECKPOINT_TEMP, "canonical-old-root9.sha256"), old_manifest)
  FileUtils.cp(STAGE_MANIFEST, File.join(CHECKPOINT_TEMP, "stage-v3-manifest.sha256"), preserve: true)

  receipt = {
    "status" => "PRE_V3_CANONICAL_APPLY_CHECKPOINT",
    "createdAt" => Time.now.iso8601,
    "analysis" => ANALYSIS,
    "allowedRoots" => ALLOWED_ROOTS,
    "canonicalOldSha256" => OLD_SHA,
    "plannedNewSha256" => NEW_SHA,
    "stageManifestSha256" => STAGE_MANIFEST_SHA,
    "extraSampleAuditSha256" => EXTRA_LEDGER_SHA,
    "rollbackSource" => File.join(CHECKPOINT_FINAL, "canonical"),
    "rollbackPolicy" => "restore all nine allowlisted roots and verify OLD SHA 9/9"
  }
  write_binary(File.join(CHECKPOINT_TEMP, "checkpoint-receipt.json"), JSON.pretty_generate(receipt) + "\n")
  checkpoint_manifest = build_file_manifest(CHECKPOINT_TEMP, "checkpoint-files.sha256")
  verify_local_manifest!(checkpoint_manifest, CHECKPOINT_TEMP)
  File.rename(CHECKPOINT_TEMP, CHECKPOINT_FINAL)

  verify_root_set!(File.join(CHECKPOINT_FINAL, "canonical"), OLD_SHA, "final checkpoint canonical old")
  final_manifest = File.join(CHECKPOINT_FINAL, "checkpoint-files.sha256")
  verify_local_manifest!(final_manifest, CHECKPOINT_FINAL)
  {
    "path" => CHECKPOINT_FINAL,
    "manifestSha256" => sha(final_manifest),
    "treeSha256" => tree_sha(CHECKPOINT_FINAL)
  }
rescue StandardError
  FileUtils.rm_rf(CHECKPOINT_TEMP) if File.exist?(CHECKPOINT_TEMP)
  raise
end

def remove_apply_temp!
  fail!("unsafe apply temp") unless APPLY_TEMP == File.join(ANALYSIS, ".doksik-v3-canonical-apply.tmp")
  FileUtils.rm_rf(APPLY_TEMP) if File.exist?(APPLY_TEMP)
end

def restore_all_from_checkpoint!
  fail!("rollback checkpoint missing") unless File.directory?(CHECKPOINT_FINAL)
  fail!("rollback temp already exists") if File.exist?(ROLLBACK_TEMP)
  Dir.mkdir(ROLLBACK_TEMP)
  checkpoint_canonical = File.join(CHECKPOINT_FINAL, "canonical")
  ALLOWED_ROOTS.each do |name|
    FileUtils.cp(File.join(checkpoint_canonical, name), File.join(ROLLBACK_TEMP, name), preserve: true)
  end
  verify_root_set!(ROLLBACK_TEMP, OLD_SHA, "rollback temp old")
  ALLOWED_ROOTS.each do |name|
    File.rename(File.join(ROLLBACK_TEMP, name), File.join(ANALYSIS, name))
  end
  verify_root_set!(ANALYSIS, OLD_SHA, "canonical rollback old")
  Dir.rmdir(ROLLBACK_TEMP)
  remove_apply_temp!
  true
end

def apply!
  preflight = preflight!
  checkpoint = create_checkpoint!
  apply_started = false

  begin
    Dir.mkdir(APPLY_TEMP)
    ALLOWED_ROOTS.each do |name|
      FileUtils.cp(File.join(STAGE, name), File.join(APPLY_TEMP, name), preserve: true)
    end
    verify_root_set!(APPLY_TEMP, NEW_SHA, "canonical apply temp new")
    apply_started = true
    ALLOWED_ROOTS.each do |name|
      File.rename(File.join(APPLY_TEMP, name), File.join(ANALYSIS, name))
    end
    verify_root_set!(ANALYSIS, NEW_SHA, "canonical applied new")
    Dir.rmdir(APPLY_TEMP)
    fail!("apply temp remains") if File.exist?(APPLY_TEMP)
    fail!("rollback temp remains") if File.exist?(ROLLBACK_TEMP)

    puts "PASS V3_CANONICAL_APPLIED root9=9"
    puts "preflight_manifest=#{preflight.fetch('manifestRows')}/34 stage_files=#{preflight.fetch('stageFiles')}"
    puts "checkpoint=#{checkpoint.fetch('path')}"
    puts "checkpoint_manifest_sha256=#{checkpoint.fetch('manifestSha256')}"
    puts "checkpoint_tree_sha256=#{checkpoint.fetch('treeSha256')}"
    ALLOWED_ROOTS.each { |name| puts "applied #{NEW_SHA.fetch(name)}  #{name}" }
    puts "rollback=AVAILABLE checkpoint_root9_old_sha=9/9"
  rescue StandardError => error
    rollback_status = "NOT_NEEDED"
    if apply_started
      begin
        restore_all_from_checkpoint!
        rollback_status = "PASS old_sha=9/9"
      rescue StandardError => rollback_error
        rollback_status = "FAIL #{rollback_error.class}: #{rollback_error.message}"
      end
    else
      remove_apply_temp!
    end
    warn "APPLY FAILED: #{error.class}: #{error.message}"
    warn "ROLLBACK: #{rollback_status}"
    raise
  end
end

case ARGV
when ["--preflight"]
  result = preflight!
  puts "PASS V3_CANONICAL_PREFLIGHT write=0"
  puts "canonical_old_sha=9/9 stage_new_sha=9/9"
  puts "stage_manifest=#{result.fetch('manifestRows')}/34 sha=#{STAGE_MANIFEST_SHA} stage_files=#{result.fetch('stageFiles')}"
  puts "extra_ledger=#{EXTRA_LEDGER_SHA} validation=PASS"
  puts "checkpoint_target=#{CHECKPOINT_FINAL} status=ABSENT"
when []
  apply!
else
  abort "usage: #{File.basename(__FILE__)} [--preflight]"
end
