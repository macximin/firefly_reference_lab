# InkOS Reverse Lab 다음 세션 인계서

> 이 인계서는 작품 피치 확장 이전 기록이다. 현재 재개 정본은 `docs/2026-08-16-p9-pilot-preproduction-handoff.md`다.

작성 시각: 2026-08-16 11:13 KST  
저장소: `/Users/a2501/Desktop/firefly_studio/edge_repos/firefly_reference_lab`
브랜치·HEAD: `main` / `c46f153`  
현재 단계: 작품 Arc 연구 2편 골드 승인, P0~P8 완료, 작품 피치 확장 전, P9 미착수

## 1. 새 세션은 여기서 시작한다

다음 세션은 아래 문서를 순서대로 읽는다.

1. 이 인계서
2. `AGENTS.md`
3. `docs/2026-08-16-p0-p8-pitch-system-context.md`
4. `docs/2026-08-15-webnovel-gold-routing-writing-system-plan.md`
5. `docs/manager-manual-qa-rubric.md`

`docs/2026-08-13-safe-stop-checkpoint.md`는 15편 동시 분석을 멈췄던 시점의 역사 기록이다. 당시 `0/15 승인`은 현재 사실이 아니다. 이후 《독식하는 재벌 3세》와 《리턴 에이스》가 전수 재작업과 관리자 QA를 통과했다. 작품별 미완성 구간을 찾을 때만 옛 체크포인트를 참고한다.

## 2. 현재 실행 상태

2026-08-16 11:13 KST에 Codex 앱과 로컬 프로세스를 확인했다.

| 구분 | 현재 상태 |
| --- | --- |
| 관리자 작업 | 1개 active: `019ff69d-4e2d-7230-ad52-0aebaaa527b1` |
| 작품 전담 15개 작업 | 전부 `notLoaded` |
| 실행 중 작품 분석 | 0개 |
| 별도 `codex exec` | 0개 |
| ephemeral 작업 | 0개 |
| 독식 하트비트 `3-arc` | `PAUSED` |

과거 작품 작업은 삭제되지 않았다. 아래 ID로 앱에서 읽고 이어갈 수 있다. 그러나 사용자의 새 지시 없이 15개를 다시 동시에 실행하지 않는다. 새 작품 분석이 필요하면 한 작품씩 기존 작업을 재개하는 것이 현재 운영 방침이다.

사이드바에 보이는 `InkOS Arc 1/5 · 금수저 투자백서` 작업 `019ff6b0-5c6e-7fd3-9aba-cb1a9103fe14`는 초기 위임 작업이다. 아래 표의 금수저 투자백서 전담 작업 `019ff6b4-45be-72e0-b9e1-8c94574ec210`과 다른 ID다. 후속 재작업에는 아래 전담 ID를 권위로 쓴다.

## 3. 작품 전담 작업 ID와 최신 판정

공통 생성 당시 설정은 `gpt-5.6-sol` / `ultra` / Fast였다. 15개 ID는 모두 2026-08-16에 앱에서 다시 조회했고 `notLoaded`임을 확인했다.

| 번호 | 작품 | 전담 작업 ID | 최신 판정 | 안전한 다음 작업 |
| --- | --- | --- | --- | --- |
| 01 | 금수저 투자백서 | `019ff6b4-45be-72e0-b9e1-8c94574ec210` | 반려. 현재 strict 오류 3·경고 12 | 686회 기능 필드·37 Arc·페이싱을 실제 장면으로 전수 재편집 |
| 02 | 독식하는 재벌 3세 | `019ff6b4-462d-72f2-9c0b-7fde6fa94f45` | **GOLD APPROVED**. 751회·131 Arc·15/15 PASS | 재분석 금지. 골드 라우팅과 피치 기준으로 사용 |
| 03 | 마법 배운 재벌집 늦둥이 | `019ff6b4-45ff-7663-a9a2-013cecfc25c9` | 반려. 100 Arc 중 78개가 1~3화, receipt 없음 | 자연 NarrativeArc 후보를 304회에 재매핑하고 전체 동기화 |
| 04 | 이혼 후 재벌 각성! | `019ff6b4-45d0-7432-bd64-2107687e0ca6` | 시스템성 FAIL. 후속 화 사실 조기 지급 | 220회 하드 경계 전수 재구축, ARC-012·022 재판정 |
| 05 | 리턴 에이스 | `019ff6b4-45ea-7200-8396-0e1021a7f613` | **GOLD APPROVED**. 310회·55 Arc·15/15 PASS | `project_pitch.md`와 `gold_reference_card.md` 추출 |
| 06 | 성공시대 | `019ff6d1-a60c-7f03-95fc-1ce25f3e77cb` | 미완성 | 541~560·581~680 복원 후 1~1006 통합 |
| 07 | 대망 | `019ff6d1-a6af-78a2-bf04-f1253f706cdc` | 미완성 | 335~668 독해 후 양쪽 구간 접합 |
| 08 | 법보다 주먹(개정판) | `019ff6d1-a5fe-7620-895a-c033713f70fe` | 미완성 | 201~280·441~560·701~830 우선 보충 |
| 09 | 금수저생활백서 | `019ff6d1-a5e6-7f10-84d8-1720620c34c4` | 미완성 | 누락 전 구간을 원문에서 계속 독해 |
| 10 | 효종 | `019ff6d1-a5f5-7dd0-bbd3-18de8353d317` | 미완성, 후반 임시 범위 이상 | 126~166·223~500 재구축, late 입력부터 재검사 |
| 11 | 연봉 1조 신입사원 | `019ff6d1-a61c-7eb1-90e2-a80d20163344` | 미완성 | 378~485 작성 후 전 구간 통합 |
| 12 | 졸부집 망나니(개정판) | `019ff6d1-a618-7891-90f7-ff188e320741` | 미완성, 조기 receipt 존재 | pacing 22화 이후와 chapter 누락 범위 보충 |
| 13 | 재벌가 막둥이는 만능 천재(개정판) | `019ff6d1-a612-7723-b5a6-ef52b7b5d110` | 380회 파트 자료 존재, 최종 통합 미완 | 네 파트 검증·조립, Bible·Atlas·receipt 재대조 |
| 14 | 남자의 길 | `019ff6d1-a61a-72f1-b036-af4de4275002` | 325회 임시 chapter 존재, Arc층 미완 | 자연 Arc·pacing·Atlas·receipt 작성 |
| 15 | 고려는 천조국이 되기로 하였습니다 | `019ff6d1-a618-7641-b925-6dabf23f6aae` | 미완성 | 74~95·169~190 보충 후 280회 통합 |

## 4. 승인된 Arc 골드 두 편

### 독식하는 재벌 3세

- 정본: `analyses/doksik-chaebol3/`
- 원문 범위: 751회
- 자연 NarrativeArc: 131개
- strict: 오류 0·경고 0
- 관리자 QA: 15/15 PASS
- 작품 피치: `analyses/doksik-chaebol3/project_pitch.md`
- 골드 카드: `analyses/doksik-chaebol3/gold_reference_card.md`
- 관리자 승인: `analyses/doksik-chaebol3/manager_final_qa.md`
- 골드 체크포인트: `exports/checkpoints/2026-08-14-doksik-natural-arc-gold/`
- 주 기능: 사업·소유·지위 상승, 거래의 공개적 결산, 장기 스케일 확장

### 리턴 에이스

- 정본: `analyses/return-ace/`
- 원문 범위: 310회
- 자연 NarrativeArc: 55개
- 수동 판정: 회차 페이싱 310/310, 종료 훅 310/310, 회차 사실 7필드 310/310
- strict: 오류 0·경고 0
- 관리자 QA: 비중복 59회 원문 대조, 15/15 PASS
- 골드 승인: `analyses/return-ace/.work/checkpoints/2026-08-15-return-ace-gold-approval.md`
- 상세 QA: `analyses/return-ace/.work/rework_natural_arc/manager_qa.md`
- 주 기능: 경쟁·훈련·기록, 공개 검증, 경기 보상과 커리어 상승
- 아직 없는 것: `project_pitch.md`, `gold_reference_card.md`

《리턴 에이스》는 과거 Anti-Gold 판정이 있었지만 현재는 재작업 완료 후 긍정 골드다. `docs/2026-08-15-webnovel-gold-routing-writing-system-plan.md`도 이 최신 상태로 갱신했다.

## 5. 지금까지 완성된 집필 시스템

P0~P8은 완료됐고 P9는 시작하지 않았다.

| 단계 | 역할 | 정본 |
| --- | --- | --- |
| P0 | 남성향 상업 편집 원칙 | `docs/2026-08-15-male-webnovel-commercial-editorial-principles.md` |
| P1 | Series Contract | `templates/writing-system/01-series-contract.md` |
| P2 | Entry Contract | `templates/writing-system/02-entry-contract.md` |
| P3 | NarrativeArc v2 | `templates/writing-system/03-narrative-arc-v2.md` |
| P4 | 다음 1~3화 Chapter Packet | `templates/writing-system/04-chapter-packet.md` |
| P5 | Reward & Pacing 장부 | `templates/writing-system/05-reward-pacing-ledger.md` |
| P6 | Protagonist Gravity | `templates/writing-system/06-protagonist-gravity-check.md` |
| P7 | Character Utility | `templates/writing-system/07-character-utility-card.md` |
| P8 | Gold Router | `templates/writing-system/08-gold-router.md` |
| 피치 | 작품소개 포함 기획서 | `templates/writing-system/project-pitch.md` |

현재 구조의 핵심은 `Series Contract → 자연 NarrativeArc → 다음 1~3화 Chapter Packet → 실제 지급 영수증`이다. Arc 개수나 길이를 미리 정하지 않는다. 작품 표면의 목표·압박·결산·비가역 변화가 바뀌는 곳에서 자른다.

## 6. 다음 우선순위

### P0. 리턴 에이스 피치와 골드 카드

첫 후속 작업으로 `analyses/return-ace/project_pitch.md`와 `analyses/return-ace/gold_reference_card.md`를 만든다. 이미 QA를 통과한 정본만 사용하고 원문 사건·결말·기록을 새로 만들지 않는다. 외부용 작품소개에는 결말을 숨기고, 내부 성장선에는 결말을 남긴다.

### P1. 피치 라이브러리 확장

로컬 원문 작품에서 작품소개 포함 `project_pitch.md`를 순차 추출한다. 분석이 관리자 QA를 통과하지 않았으면 피치 초안은 만들 수 있지만 Gold Reference Card는 만들지 않는다. 공식 플랫폼 소개를 복원한 것이 아니라 전수 분석에서 새로 추출한 내부 피치라는 점을 표시한다.

### P2. 세 번째 골드 선정

현재 확보된 기능은 재벌·사업형과 스포츠·경쟁형이다. 다음 골드는 관계·감정·로맨스 결산 슬롯을 우선 검토한다. 그 뒤 전투·성장·세계 규칙, 미스터리·정보 통제, 장기 종결 순으로 결손을 채운다. 작품 수 자체를 목표로 늘리지 않는다.

### P3. P9 작품 결정

사용자가 신작 또는 기존 InkOS 작품 하나를 고른 뒤에만 P9에 들어간다. 작품소개 포함 피치, Series Contract, Entry Contract, 첫 3개 NarrativeArc v2, 첫 1~3화 Packet, Reward & Pacing 계획, 주요 조연 카드, 주 골드 1편과 보조 골드 최대 2편의 역할이 준비돼야 한다.

### 후순위 연구

- 카카오 100편·네이버 100편의 WHAT/HOW/첫 보상 약속 수작업 판독
- 정룡필 아카이브의 감리 표본 확대
- 나머지 13편 자연 Arc 재작업
- 중국 숏드라마 비교 합성

중국 자료와 13편 동시 재가동은 현재 우선순위가 아니다.

## 7. 시장·강의 자료

- 샤이나크 입문반 분석: `analyses/shainak-beginner-course/analysis_report.md`
- 남성향 플랫폼 200편: `outputs/019ff69d-4e2d-7230-ad52-0aebaaa527b1/webnovel-male-platform-200.xlsx`
- WHAT/HOW 상업 훅 100편: `outputs/019ff69d-4e2d-7230-ad52-0aebaaa527b1/webnovel-commercial-hook-extraction-100.xlsx`
- 정룡필 아카이브 대시보드: `outputs/019ff69d-4e2d-7230-ad52-0aebaaa527b1/jeong-ryongpil-webnovel-archive-dashboard.xlsx`

샤이나크 WHAT/HOW는 자연 Arc를 자동 생성하는 공식이 아니다. 작품 전체와 현재 에피소드의 목표·수단을 선명하게 하는 상업적 명료도 보정층으로 쓴다.

## 8. 아카이브와 복구

《독식하는 재벌 3세》와 《리턴 에이스》의 정본은 루트에 남아 있다. 구버전 작업물은 삭제하거나 축약하지 않고 `.work/archive/2026-08-15-zero-loss/` 아래로 이동했다. 이동 전후 파일 수·바이트·권한·SHA 트리값이 일치한다.

- 독식 아카이브 영수증: `analyses/doksik-chaebol3/.work/ARCHIVE_RECEIPT.md`
- 리턴 에이스 아카이브 영수증: `analyses/return-ace/.work/ARCHIVE_RECEIPT.md`
- 15편 최초 안전 정지 묶음: `exports/checkpoints/2026-08-13-0200-kst-arc-lab-paused.tar.gz`

콜드 아카이브는 현재 정본 검증에 필요하지 않다. 역사 도구를 재실행하거나 과거 상태를 복원할 때만 영수증대로 원위치로 돌린다.

## 9. 저장소 안전 상태

Reverse Lab 작업트리는 dirty다. 이는 사용자 작업과 승인된 연구 산출물이 섞여 있는 의도된 상태다.

- 수정됨: `README.md`, `templates/work-arc-analysis-contract.md`, `tools/validate-five-work-analyses.mjs`
- 다수 분석 폴더, P0~P8 문서·템플릿·출력은 untracked 상태
- 기존 작업을 reset, checkout, 일괄 stage, 일괄 삭제하지 않는다
- 커밋·푸시는 사용자의 새 지시 전까지 하지 않는다
- 부모 `/Users/a2501/Desktop/firefly_studio/edge_repos/inkos`의 제품 코드와 중국 자료는 건드리지 않는다

관리자 세션만 공통 문서·검증 도구·비교 자료를 수정한다. 작품 전담 세션은 담당 원문과 `analyses/<assigned-slug>/`만 다룬다. 별도 CLI `codex exec` 하위 프로세스를 만들지 않는다.

## 10. 검증 명령

```text
node --test tests/*.test.mjs
node tools/validate-writing-system-contracts.mjs
node tools/validate-five-work-analyses.mjs doksik-chaebol3 --strict --require-pitch
node tools/validate-five-work-analyses.mjs return-ace --strict
```

작품별 피치를 추가한 뒤에는 다음 검사를 쓴다.

```text
node tools/validate-five-work-analyses.mjs <work-slug> --strict --require-pitch
```

strict PASS는 형식 게이트다. 긍정 골드 승격에는 `docs/manager-manual-qa-rubric.md`의 15개 수동 항목 PASS가 별도로 필요하다.

## 11. Codex 데스크탑 업데이트 상태

- 설치 경로: `/Applications/ChatGPT.app`
- 설치된 최신 번들: `26.810.52044`, build `6662`
- 현재 실행 프로세스 시작 시각: 2026-08-15 10:37:13 KST
- 판정: 설치 경로는 최신이지만 현재 프로세스는 번들 교체 전부터 살아 있다. 새 세션으로 바꾸며 앱을 완전히 종료하고 다시 열어야 최신 실행이 확정된다.
- 복구용 구버전: `/Applications/.ChatGPT.app.previous-6644`

재실행 후 설치 버전·프로세스 시작 시각을 다시 확인한다. `26.810.52044` build `6662`로 새로 시작한 사실을 확인한 뒤에만 구버전 복구본 삭제를 검토한다. 자동 삭제하지 않는다.

## 12. 새 세션의 첫 행동

1. 앱 재실행 뒤 버전과 프로세스 시작 시각을 확인한다.
2. 이 인계서와 `AGENTS.md`를 읽는다.
3. `git status --short`를 읽고 기존 dirty 상태를 보존한다.
4. 작품 작업 15개가 여전히 `notLoaded`, `3-arc`가 `PAUSED`인지 확인한다.
5. `node --test tests/*.test.mjs`와 두 골드 strict를 실행한다.
6. 다른 작품이나 P9를 열지 말고 《리턴 에이스》 피치·골드 카드부터 작성한다.

새 세션에 전달할 한 문장 지시는 다음과 같다.

> `docs/2026-08-16-next-session-handoff-arc-pitch.md`와 `AGENTS.md`를 먼저 읽고 현재 dirty 상태를 보존하라. 두 골드와 P0~P8 검증을 재확인한 뒤, 최우선 작업인 《리턴 에이스》 작품소개 포함 피치와 Gold Reference Card를 작성하되 다른 작품 원문·중국 자료·InkOS 부모·P9는 열지 마라.
