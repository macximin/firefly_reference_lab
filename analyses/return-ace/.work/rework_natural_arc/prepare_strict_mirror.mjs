import { copyFileSync, existsSync, lstatSync, mkdirSync, readlinkSync, symlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const candidateDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(candidateDir, "../../../..");
const mirrorRoot = join(candidateDir, "strict_mirror");
const mirrorAnalysis = join(mirrorRoot, "analyses", "return-ace");
const mirrorSourceDir = join(mirrorRoot, "private_sources", "korean_webnovel_corpus", "흑곰작가");
const sourceName = "리턴 에이스_흑곰작가_합본.txt";
const sourcePath = join(repoRoot, "private_sources", "korean_webnovel_corpus", "흑곰작가", sourceName);

function ensureLink(linkPath, targetPath) {
  if (existsSync(linkPath)) {
    if (!lstatSync(linkPath).isSymbolicLink()) throw new Error(`${linkPath} exists and is not a symlink`);
    if (readlinkSync(linkPath) !== targetPath) throw new Error(`${linkPath} points to an unexpected target`);
    return;
  }
  symlinkSync(targetPath, linkPath);
}

mkdirSync(join(mirrorRoot, "tools"), { recursive: true });
mkdirSync(mirrorAnalysis, { recursive: true });
mkdirSync(mirrorSourceDir, { recursive: true });

copyFileSync(
  join(repoRoot, "tools", "validate-five-work-analyses.mjs"),
  join(mirrorRoot, "tools", "validate-five-work-analyses.mjs"),
);

for (const file of [
  "project_bible.md",
  "source_receipt.json",
  "chapter_map.csv",
  "arc_map.csv",
  "arc_pacing.csv",
  "arc_atlas.md",
  "completion_receipt.md",
  "inkos_usage_and_gap_report.md",
  "free_improvements_report.md",
]) ensureLink(join(mirrorAnalysis, file), join(candidateDir, file));

ensureLink(join(mirrorSourceDir, sourceName), sourcePath);

console.log(JSON.stringify({
  status: "ready",
  mirrorRoot,
  analysisTarget: mirrorAnalysis,
  sourceTarget: sourcePath,
}, null, 2));
