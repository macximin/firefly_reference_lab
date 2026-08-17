#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateProjectPitchText } from "./validate-five-work-analyses.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const contracts = [
  {
    path: "docs/2026-08-15-male-webnovel-commercial-editorial-principles.md",
    minimumBytes: 12_000,
    markers: ["## 2. 자기중심성", "### 정보 계약", "### 주인공 중력", "Entry Contract", "### 중반 런웨이"],
  },
  {
    path: "docs/2026-08-15-webnovel-gold-routing-writing-system-plan.md",
    minimumBytes: 8_000,
    markers: ["P0~P8 계약팩 완료", "## 4. 골드 라우팅 방식", "## 9. P9 진입 게이트", "《독식하는 재벌 3세》"],
  },
  {
    path: "templates/writing-system/README.md",
    minimumBytes: 1_500,
    markers: ["## 권위 순서", "## P0~P8", "gold-reference-card.md", "## 완료 게이트"],
  },
  {
    path: "templates/writing-system/01-series-contract.md",
    minimumBytes: 1_000,
    markers: ["## 한 줄 계약", "## 주인공", "## HOW", "## 반복 재미 엔진", "## 작품 고유 표면"],
  },
  {
    path: "templates/writing-system/02-entry-contract.md",
    minimumBytes: 900,
    markers: ["## 진입 약속", "## 기능 순서", "## 초반 주인공 중력", "## 합격 기준"],
  },
  {
    path: "templates/writing-system/03-narrative-arc-v2.md",
    minimumBytes: 1_400,
    markers: ["## 식별과 경계", "## 작품 표면", "## 정보 계약", "## 보상과 영수증", "## 중반 런웨이"],
  },
  {
    path: "templates/writing-system/04-chapter-packet.md",
    minimumBytes: 1_000,
    markers: ["## 패킷 식별", "## 회차별 제작표", "## 패킷 합격 기준"],
  },
  {
    path: "templates/writing-system/05-reward-pacing-ledger.md",
    minimumBytes: 900,
    markers: ["## 기대와 지급", "## 페이싱 리본", "## 반복 피로 점검", "## 실제 원고 Closeout"],
  },
  {
    path: "templates/writing-system/06-protagonist-gravity-check.md",
    minimumBytes: 700,
    markers: ["## 장면별 검사", "## 외부 시점 허용 이유", "## 조연 서사 검사"],
  },
  {
    path: "templates/writing-system/07-character-utility-card.md",
    minimumBytes: 900,
    markers: ["## 욕망과 행동 원리", "## 주인공과의 가치 교환", "## 사건 생산력", "## 남성향 관계 라우팅"],
  },
  {
    path: "templates/writing-system/08-gold-router.md",
    minimumBytes: 1_000,
    markers: ["## 현재 작품 진단", "## 주축 골격", "## 보조 사건·보상 라우팅", "## 결합안", "## 직접 전사 금지", "## Lead Writer 결정"],
  },
  {
    path: "templates/writing-system/project-pitch.md",
    minimumBytes: 1_500,
    markers: ["### 플랫폼 작품소개", "## 내부 기획 피치", "## 사실 검증"],
  },
  {
    path: "templates/writing-system/gold-reference-card.md",
    minimumBytes: 800,
    markers: ["## 식별과 승인", "## best_at", "## 직접 라우팅 가능 자산", "## 역할별 사용", "## 직접 전사 금지", "## Anti-Gold 메모"],
  },
  {
    path: "analyses/doksik-chaebol3/gold_reference_card.md",
    minimumBytes: 2_000,
    markers: ["15/15 PASS", "131개 자연 NarrativeArc", "## best_at", "## 역할별 사용", "## 직접 라우팅 가능 자산", "## 직접 전사 금지"],
  },
];

export function validateContractText(text, contract) {
  const errors = [];
  if (Buffer.byteLength(text, "utf8") < contract.minimumBytes) {
    errors.push(`${contract.path}: ${contract.minimumBytes} bytes 미만`);
  }
  for (const marker of contract.markers) {
    if (!text.includes(marker)) errors.push(`${contract.path}: 필수 표식 누락 (${marker})`);
  }
  return errors;
}

async function main() {
  const errors = [];
  for (const contract of contracts) {
    const file = join(repoRoot, contract.path);
    try {
      await stat(file);
      const text = await readFile(file, "utf8");
      errors.push(...validateContractText(text, contract));
    } catch (error) {
      errors.push(`${contract.path}: 읽기 실패 (${error.message})`);
    }
  }

  const pitchPath = "analyses/doksik-chaebol3/project_pitch.md";
  try {
    const pitch = await readFile(join(repoRoot, pitchPath), "utf8");
    errors.push(...validateProjectPitchText(pitch, pitchPath));
  } catch (error) {
    errors.push(`${pitchPath}: 읽기 실패 (${error.message})`);
  }

  if (errors.length === 0) {
    console.log(`PASS P0~P8 계약팩: ${contracts.length}개 계약 + 독식하는 재벌 3세 피치`);
    return;
  }

  console.log(`FAIL P0~P8 계약팩: 오류 ${errors.length}`);
  for (const error of errors) console.log(`  ERROR ${error}`);
  process.exitCode = 1;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
