# 다음 세션 인계서 · P9 신규 재벌물 파일럿

작성일: 2026-08-16 KST
현재 단계: P9 프리프로덕션 초안 완료, owner lock 및 InkOS 첫 3화 대기

## 2026-08-17 경로 마이그레이션

- 현재 저장소: `/Users/a2501/Desktop/firefly_studio/edge_repos/firefly_reference_lab`
- InkOS: `/Users/a2501/Desktop/firefly_studio/edge_repos/inkos`
- HQ 마이그레이션 영수증: `/Users/a2501/Desktop/firefly_studio/docs/bootstrap-status.md`
- 2026-08-17 이전 영수증·세션 로그의 옛 절대경로는 당시 증거로 보존한다.
- 재벌물 Reference Core 6개는 기존 material ID를 유지한 채 최신 내용과
  `firefly-reference-core:` 논리 출처로 갱신됐다. 재실행 시 6개 모두 재사용된다.

## 먼저 읽을 경로

`inkos_handoffs/p9-pilot-distressed-company-buyer/README.md`

이 폴더 하나에 가제 《부도난 회사만 삽니다》의 피치, Series·Entry 계약, A/B Rail 초안, Gold Router, 인물 코어, 첫 3개 NarrativeArc, 1~3화 Packet, 보상 장부, 진입 게이트가 있다.

## 완료된 일

- InkOS 한국어 변경과 피치·Reference Core 연결 변경은 `master`에 반영돼 있다.
  물리 이동 직전 기준 HEAD는 `4875c28a`였으며, 현재 HEAD는 새 경로에서 확인한다.
- Firefly Studio HQ의 InkOS branch contract는 `match`로 복구됐다.
- Firefly Market Radar가 2026-08-16 남성향 공개 목록 120개를 수집했다.
- Market Radar 정본 커밋은 `6d50cbe`다. 보고서는 baseline-only이며 추세를 주장하지 않는다.
- Reference Lab에는 작품 피치 15개와 승인 골드 2개가 있다.
- 주 골드는 《독식하는 재벌 3세》, 보조 골드는 《리턴 에이스》로 라우팅했다.
- 신규 파일럿의 원고와 InkOS 프로젝트는 만들지 않았다.

## 파일럿 핵심

- 주인공: 첫 생의 분식회계 책임을 뒤집어쓴 기업회생 회계사 윤태겸
- HOW: 장부, 계약, 재고, 설비 가동을 대조해 손실의 수혜자와 회수 가능한 자산을 찾는다.
- 반복 보상: 회수금, 급여, 설비 재가동, 우선주, 의결권
- 장기 성장: 계약직 실사 담당 -> 회생회사 대표 -> 부실 계열사 경영권 -> 지주회사 자본 배분권
- 첫 제작 패킷: 1~3화 `창고 벽 뒤의 구리`
- 3화 지급: 구리 재고 물증, 창고 봉인, 지급 정지, 실사 통제권
- 다음 부채: 밀린 급여, 프레스 재가동, 태겸의 첫 우선주

## A/B Rail 경계

- A-Rail은 6개 목적지다. A01·A02만 compound, A03~A06은 sparse다.
- B-Rail은 가까운 1~3화 단위 세 개만 작성했다.
- 세 B는 모두 A01에 도달하는 서로 다른 지급을 맡는다.
- InkOS book_id와 목표 회차가 없으므로 둘 다 `draft`다.
- 첫 파일럿 전에 전체 B-Rail을 만들어 `ready`로 올리지 않는다.

## owner lock 항목

1. 가제 유지 여부
2. 12년 회귀 유지 여부
3. 최문정과 태겸의 로맨스 여부
4. A02 이후 산업 방향
5. 목표 회차와 회차당 한국어 글자 수

팩의 권장 기본값은 가제와 회귀를 유지하고, 첫 30화 로맨스를 끄며, A01만 확정하는 안이다. 첫 파일럿은 3화, 회차당 공백 포함 4,800~5,500자다.

## 검증

```text
node --test tests/*.test.mjs
PASS 11 / FAIL 0

node tools/validate-writing-system-contracts.mjs
PASS P0~P8 계약팩: 14개 계약 + 독식하는 재벌 3세 피치

node tools/validate-five-work-analyses.mjs doksik-chaebol3 --strict --require-pitch
PASS 독식하는 재벌 3세: 751회 / 131 Arc / 오류 0 / 경고 0

node tools/validate-five-work-analyses.mjs return-ace --strict --require-pitch
PASS 리턴 에이스: 310회 / 55 Arc / 오류 0 / 경고 0
```

## 다음 세션 명령

> `/Users/a2501/Desktop/firefly_studio/docs/bootstrap-status.md`와 `/Users/a2501/Desktop/firefly_studio/edge_repos/firefly_reference_lab/AGENTS.md`, `docs/2026-08-16-p9-pilot-preproduction-handoff.md`를 읽고 저장소 상태를 확인하라. `inkos_handoffs/p9-pilot-distressed-company-buyer/`의 owner lock 항목을 사용자와 확정한 뒤, 승인된 값으로 `/Users/a2501/Desktop/firefly_studio/edge_repos/inkos`에 한국어 작품을 만들고 첫 1~3화만 집필하라. 다른 작품 원문, 중국 자료, 세 번째 골드, 전체 B-Rail 확장은 열지 마라.
