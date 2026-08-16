#!/usr/bin/env ruby
# frozen_string_literal: true

require "digest"

WORK = __dir__
ANALYSIS = File.expand_path("../../..", WORK)
OUTPUT = File.join(WORK, "final-sha256-2026-08-14.txt")

files = Dir.glob(File.join(ANALYSIS, "**", "*"), File::FNM_DOTMATCH).select do |path|
  File.file?(path) && path != OUTPUT
end.sort

lines = files.map do |path|
  relative = path.delete_prefix("#{ANALYSIS}/")
  "#{Digest::SHA256.file(path).hexdigest}  #{relative}"
end

File.write(OUTPUT, lines.join("\n") + "\n")
puts "PASS final manifest files=#{files.length} output=#{OUTPUT}"
