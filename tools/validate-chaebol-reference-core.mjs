#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const coreRelativeRoot = "inkos_handoffs/chaebol-reference-core";
const allowedRoles = new Set(["Spine", "Engine", "Payoff", "Emotion", "Hook", "Wildcard"]);
const requiredCardMarkers = [
  "## 목적",
  "## 입력 조건",
  "## 재사용 판단",
  "## 장면 표면",
  "## 출력 계약",
  "## 실패 신호",
  "## 직접 전사 금지",
  "## 근거와 승인",
];

export function validateReferenceCoreManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== "object") return ["manifest: JSON 객체가 아님"];
  if (manifest.version !== 1) errors.push("manifest: version은 1이어야 함");
  if (manifest.id !== "chaebol-reference-core-v1") errors.push("manifest: id 불일치");
  if (manifest.bindingPolicy !== "opt-in-per-book") errors.push("manifest: 작품별 opt-in 정책 누락");
  if (manifest.stylePolicy !== "separate-style-guide-and-profile") errors.push("manifest: 문체 분리 정책 누락");
  if (manifest.routingPolicy !== "primary-chassis-plus-secondary-event-bank") errors.push("manifest: 주축 골격+보조 사건 은행 정책 누락");
  if (manifest.similarityPolicy !== "do-not-penalize-industry-event-order-or-reward-similarity") errors.push("manifest: 구조 유사성 비감점 정책 누락");
  if (manifest.directCopyPolicy !== "forbid-verbatim-prose-fictional-proper-nouns-and-dialogue") errors.push("manifest: 직접 전사 금지 정책 누락");
  if (!Array.isArray(manifest.productionEvidence)) {
    errors.push("manifest: productionEvidence는 승인 골드 2편 이상이어야 함");
  } else {
    if (manifest.productionEvidence.length < 2) errors.push("manifest: productionEvidence는 승인 골드 2편 이상이어야 함");
    for (const evidence of manifest.productionEvidence) {
      if (evidence?.status !== "GOLD_APPROVED") errors.push(`manifest: 승인되지 않은 productionEvidence (${evidence?.workSlug ?? "unknown"})`);
      if (evidence?.qa !== "15/15 PASS") errors.push(`manifest: QA 증거 불일치 (${evidence?.workSlug ?? "unknown"})`);
      if (typeof evidence?.referenceCard !== "string" || !evidence.referenceCard.endsWith("gold_reference_card.md")) {
        errors.push(`manifest: Gold Reference Card 경로 누락 (${evidence?.workSlug ?? "unknown"})`);
      }
    }
  }
  if (!Array.isArray(manifest.cards) || manifest.cards.length !== 6) {
    errors.push("manifest: production-ready 카드는 정확히 6개여야 함");
    return errors;
  }
  const ids = new Set();
  const paths = new Set();
  for (const card of manifest.cards) {
    const id = card?.id;
    if (typeof id !== "string" || !/^CHB-CORE-0[1-6]$/u.test(id)) errors.push(`manifest: 잘못된 카드 ID (${id ?? "missing"})`);
    if (ids.has(id)) errors.push(`manifest: 중복 카드 ID (${id})`);
    ids.add(id);
    if (card?.status !== "production_ready") errors.push(`manifest: production_ready가 아닌 카드 (${id ?? "unknown"})`);
    if (typeof card?.path !== "string" || !card.path.startsWith("materials/") || card.path.includes("..") || card.path.startsWith("/")) {
      errors.push(`manifest: 안전하지 않은 카드 경로 (${card?.path ?? "missing"})`);
    }
    if (paths.has(card?.path)) errors.push(`manifest: 중복 카드 경로 (${card?.path})`);
    paths.add(card?.path);
    if (!Array.isArray(card?.roles) || card.roles.length === 0 || card.roles.some((role) => !allowedRoles.has(role))) {
      errors.push(`manifest: 잘못된 역할 목록 (${id ?? "unknown"})`);
    }
  }
  return errors;
}

export function validateReferenceCardText(text, card) {
  const errors = [];
  if (!text.startsWith(`# ${card.id}`)) errors.push(`${card.path}: 첫 제목에 카드 ID 누락`);
  if (Buffer.byteLength(text, "utf8") < 1_500) errors.push(`${card.path}: 1500 bytes 미만`);
  for (const marker of requiredCardMarkers) {
    if (!text.includes(marker)) errors.push(`${card.path}: 필수 표식 누락 (${marker})`);
  }
  if (/private_sources\//u.test(text)) errors.push(`${card.path}: 비공개 원문 경로 포함`);
  return errors;
}

export async function validateChaebolReferenceCore(root = repoRoot) {
  const errors = [];
  const coreRoot = join(root, coreRelativeRoot);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(coreRoot, "manifest.json"), "utf8"));
  } catch (error) {
    return [`manifest.json: 읽기 또는 JSON 파싱 실패 (${error.message})`];
  }
  errors.push(...validateReferenceCoreManifest(manifest));

  if (Array.isArray(manifest.cards)) {
    for (const card of manifest.cards) {
      if (typeof card?.path !== "string" || card.path.includes("..") || card.path.startsWith("/")) continue;
      const cardPath = join(coreRoot, card.path);
      const normalizedRoot = `${normalize(coreRoot)}${sep}`;
      if (!normalize(cardPath).startsWith(normalizedRoot)) {
        errors.push(`${card.path}: 코어 루트 밖의 경로`);
        continue;
      }
      try {
        errors.push(...validateReferenceCardText(await readFile(cardPath, "utf8"), card));
      } catch (error) {
        errors.push(`${card.path}: 읽기 실패 (${error.message})`);
      }
    }
  }

  const supportFiles = [
    {
      path: "README.md",
      minimumBytes: 2_000,
      markers: ["## 현재 승인 범위", "작품별 opt-in", "## InkOS 연결", "## 문체 경계", "## 권위와 금지선"],
    },
    {
      path: manifest.candidateDeckPath,
      minimumBytes: 1_500,
      markers: ["candidate-only", "production Gold Router 입력 금지", "## 후보 카드 승격 게이트"],
    },
    {
      path: manifest.bindingRecipesPath,
      minimumBytes: 2_500,
      markers: ["작품별 opt-in", "문체는 별도", "## InkOS 등록과 연결 예시", "manage_book_reference"],
    },
  ];
  for (const support of supportFiles) {
    if (typeof support.path !== "string") {
      errors.push("manifest: 보조 문서 경로 누락");
      continue;
    }
    try {
      const text = await readFile(join(coreRoot, support.path), "utf8");
      if (Buffer.byteLength(text, "utf8") < support.minimumBytes) errors.push(`${support.path}: ${support.minimumBytes} bytes 미만`);
      for (const marker of support.markers) {
        if (!text.includes(marker)) errors.push(`${support.path}: 필수 표식 누락 (${marker})`);
      }
    } catch (error) {
      errors.push(`${support.path}: 읽기 실패 (${error.message})`);
    }
  }

  if (Array.isArray(manifest.productionEvidence)) {
    for (const evidence of manifest.productionEvidence) {
      if (typeof evidence?.referenceCard !== "string") continue;
      try {
        await stat(resolve(coreRoot, evidence.referenceCard));
      } catch (error) {
        errors.push(`productionEvidence: 근거 파일 읽기 실패 (${evidence.workSlug}: ${error.message})`);
      }
    }
  }
  return errors;
}

async function main() {
  const errors = await validateChaebolReferenceCore();
  if (errors.length === 0) {
    console.log("PASS 재벌물 Reference Core: production-ready 카드 6개 + 후보 격리 + 작품별 바인딩 계약");
    return;
  }
  console.log(`FAIL 재벌물 Reference Core: 오류 ${errors.length}`);
  for (const error of errors) console.log(`  ERROR ${error}`);
  process.exitCode = 1;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
