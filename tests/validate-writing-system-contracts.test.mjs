import assert from "node:assert/strict";
import test from "node:test";

import { validateProjectPitchText } from "../tools/validate-five-work-analyses.mjs";
import { validateContractText } from "../tools/validate-writing-system-contracts.mjs";

test("contract validator reports missing markers and insufficient size", () => {
  const errors = validateContractText("# 작은 문서\n필수 A", {
    path: "sample.md",
    minimumBytes: 100,
    markers: ["필수 A", "필수 B"],
  });
  assert.equal(errors.length, 2);
  assert.ok(errors.some((error) => /100 bytes 미만/u.test(error)));
  assert.ok(errors.some((error) => /필수 B/u.test(error)));
});

test("project pitch validator accepts a complete evidence-bounded pitch", () => {
  const introduction = "주인공은 자기 몫을 되찾기 위해 미래정보를 실제 계약과 소유권으로 바꾼다. ".repeat(12).slice(0, 450);
  const body = [
    "# 피치",
    "## 기본 정보",
    "근거와 불확실성",
    "## 판매 문구",
    "### 한 줄 카피",
    "한 줄",
    "### 로그라인",
    "로그라인",
    "### 플랫폼 작품소개",
    introduction,
    "## 내부 기획 피치",
    "### 왜 이 작품을 읽는가",
    "자기 이득과 HOW",
    "### 초반 약속",
    "첫 지급",
    "### 전체 성장선",
    "초중후",
    "### 주요 인물과 관계 보상",
    "가치 교환",
    "### 장르 라우팅",
    "주 골드",
    "## 사실 검증",
    "원문 근거",
  ].join("\n\n").padEnd(2_600, "근거");
  assert.deepEqual(validateProjectPitchText(body), []);
});

test("project pitch validator rejects short introductions and template placeholders", () => {
  const text = [
    "## 기본 정보",
    "<작품명>",
    "## 판매 문구",
    "### 한 줄 카피",
    "카피",
    "### 로그라인",
    "로그라인",
    "### 플랫폼 작품소개",
    "짧다.",
    "## 내부 기획 피치",
    "### 왜 이 작품을 읽는가",
    "이유",
    "### 초반 약속",
    "약속",
    "### 전체 성장선",
    "성장",
    "### 주요 인물과 관계 보상",
    "관계",
    "### 장르 라우팅",
    "라우팅",
    "## 사실 검증",
    "검증",
  ].join("\n\n");
  const errors = validateProjectPitchText(text);
  assert.ok(errors.some((error) => /2500 bytes 미만/u.test(error)));
  assert.ok(errors.some((error) => /400~700자/u.test(error)));
  assert.ok(errors.some((error) => /템플릿 표식/u.test(error)));
});
