# 웹소설 피치 시스템 P0~P8 재개 컨텍스트

> 이 문서는 P9 프리프로덕션 이전 기록이다. 현재 재개 정본은 `docs/2026-08-16-p9-pilot-preproduction-handoff.md`다.

작성일: 2026-08-16 KST  
저장소: `/Users/a2501/Desktop/inkos/edge_repos/inkos_reverse_lab`  
현재 단계: P0~P8 완료, P9 실제 작품 파일럿 시작 전

## 지금까지 끝난 일

- 남성향 상업 편집 원칙에 자기중심성, 목적성, HOW, 보상, 정보 계약, 주인공 중력, Entry Contract, 중반 런웨이를 반영했다.
- Series Contract부터 Gold Router까지 P1~P8 실행 템플릿을 만들었다.
- 작품소개가 포함된 `project_pitch.md` 규격과 Gold Reference Card 규격을 만들었다.
- 《독식하는 재벌 3세》와 《리턴 에이스》를 승인 골드로 등록했다.
- 《독식하는 재벌 3세》의 751회·131 NarrativeArc 분석에서 작품소개 포함 피치와 Gold Reference Card를 추출했다.
- 《리턴 에이스》는 310회 수동 재감리·55 NarrativeArc·관리자 QA 15/15 PASS까지 끝났으며, 작품소개 포함 피치와 Gold Reference Card 추출이 다음 작업이다.
- 피치 필수 구획, 외부용 작품소개 400~700자, 빈 템플릿 표식, 기존 분석 계약을 검사하는 검증기를 추가했다.

P9에서 실제 원고를 쓰거나 InkOS 본체를 변경하는 작업은 시작하지 않았다.

## 정본 경로

| 역할 | 경로 |
| --- | --- |
| 상업 편집 원칙 | `docs/2026-08-15-male-webnovel-commercial-editorial-principles.md` |
| P0~P8 시스템 계획 | `docs/2026-08-15-webnovel-gold-routing-writing-system-plan.md` |
| P1~P8 실행 계약팩 | `templates/writing-system/README.md` |
| 작품소개 포함 피치 템플릿 | `templates/writing-system/project-pitch.md` |
| Gold Reference Card 템플릿 | `templates/writing-system/gold-reference-card.md` |
| 작품별 분석 계약 | `templates/work-arc-analysis-contract.md` |
| 《독식하는 재벌 3세》 분석 기획서 | `analyses/doksik-chaebol3/project_bible.md` |
| 《독식하는 재벌 3세》 작품 피치 | `analyses/doksik-chaebol3/project_pitch.md` |
| 《독식하는 재벌 3세》 골드 카드 | `analyses/doksik-chaebol3/gold_reference_card.md` |
| 《독식하는 재벌 3세》 관리자 승인 | `analyses/doksik-chaebol3/manager_final_qa.md` |
| 《리턴 에이스》 분석 기획서 | `analyses/return-ace/project_bible.md` |
| 《리턴 에이스》 골드 승인 | `analyses/return-ace/.work/checkpoints/2026-08-15-return-ace-gold-approval.md` |

## 현재 검증 상태

2026-08-16에 다음 결과를 확인했다.

```text
node --test tests/*.test.mjs
PASS 9 / FAIL 0

node tools/validate-writing-system-contracts.mjs
PASS P0~P8 계약팩: 14개 계약 + 독식하는 재벌 3세 피치

node tools/validate-five-work-analyses.mjs doksik-chaebol3 --strict --require-pitch
PASS 독식하는 재벌 3세: 751회 / 131 Arc / 오류 0 / 경고 0

node tools/validate-five-work-analyses.mjs return-ace --strict
PASS 리턴 에이스: 310회 / 55 Arc / 오류 0 / 경고 0
```

《독식하는 재벌 3세》의 외부용 플랫폼 작품소개는 425자다. 결말은 숨겼고, 내부 기획 피치에는 초·중·후 성장선과 결말을 남겼다. 출판 당시 공식 작품소개를 복원했다고 주장하지 않는다.

## 다음 작업

가장 먼저 관리자 QA를 통과한 《리턴 에이스》에서 `project_pitch.md`와 `gold_reference_card.md`를 추출한다. 그 뒤 로컬 원문 보유 작품의 피치를 순차 추출한다. 작품마다 다음 순서를 지킨다.

1. `source_receipt.json`, `project_bible.md`, `arc_map.csv`, `manager_final_qa.md`의 신뢰 상태를 확인한다.
2. 관리자 QA를 통과하지 않은 분석은 긍정 골드로 승격하지 않는다.
3. 외부용 작품소개에는 결말을 숨기고, 내부 피치에만 전체 성장선과 결말을 기록한다.
4. 공식 플랫폼 소개를 확보하지 못한 작품은 새로 추출한 내부 피치임을 밝힌다.
5. 주인공의 자기 이득, 전용 HOW, 반복 재미 엔진, 보상 통화와 관계 영수증을 구체적인 작품 표면으로 쓴다.
6. 아래 검사로 작품별 피치를 통과시킨다.

```text
node tools/validate-five-work-analyses.mjs <work-slug> --strict --require-pitch
```

기존 분석에 시스템성 FAIL이 남은 작품은 피치 초안은 만들 수 있어도 Gold Reference Card를 만들거나 주 골드로 라우팅하지 않는다.

## P9 진입 조건

P9는 실제 신작 또는 기존 InkOS 작품으로 3~5화를 쓰며 시스템을 시험하는 단계다. 시작 전 다음 자료가 필요하다.

- 작품소개 포함 피치
- 채워진 Series Contract와 Entry Contract
- 첫 3개 NarrativeArc v2
- 첫 1~3화 Chapter Packet
- Reward & Pacing 계획
- 주요 조연 Character Utility Card
- 주 골드 1편과 보조 골드 최대 2편의 역할 라우팅

사용자가 첫 실험 작품을 정하기 전에는 P9 원고 집필과 InkOS 코드 변경을 시작하지 않는다.

## 저장소 안전 상태

- 부모 InkOS 저장소, 다른 작품 원문, 중국 자료는 이번 단계에서 변경하지 않았다.
- 현재 Reverse Lab 작업트리는 기존 분석 폴더와 이번 P0~P8 문서를 포함해 dirty 상태다.
- `README.md`, 분석 계약, 기존 검증기는 수정 상태이며 새 문서·템플릿·검증 파일은 아직 untracked 항목이 있다.
- 기존 작업을 초기화하거나 일괄 정리하지 않는다.
- 커밋과 푸시는 하지 않았다.

## Codex 데스크탑 앱 확인

확인 시각: 2026-08-16 KST

| 항목 | 확인값 |
| --- | --- |
| 설치 경로 | `/Applications/ChatGPT.app` |
| 번들 ID | `com.openai.codex` |
| 업데이트 전 버전 | `26.810.50856` |
| 업데이트 전 빌드 | `6644` |
| 현재 설치 버전 | `26.810.52044` |
| 현재 설치 빌드 | `6662` |
| 최신 배포 버전 | `26.810.52044` |
| 최신 빌드 | `6662` |
| 최신 공개 시각 | 2026-08-15 14:33:47 KST |
| 자동 업데이트 | 활성화 |
| 설치본의 마지막 자동 확인 | 2026-08-15 10:37:12 KST |
| 판정 | 최신 배포본 설치 완료, 앱 재실행 대기 |

설치 앱이 사용하는 배포 피드 `https://persistent.oaistatic.com/codex-app-prod/appcast.xml`에서 최신 빌드와 현재 빌드용 delta 항목을 확인했다. 공식 OpenAI 변경 로그는 기능 공개 내역을 제공하지만 데스크탑 빌드 번호는 따로 표시하지 않으므로, 버전 비교는 설치 번들과 앱 자체 업데이트 피드를 기준으로 했다.

2026-08-16에 최신 ZIP을 공식 배포 경로에서 받아 번들 ID, 버전, build, 코드 서명과 Apple 공증을 확인한 뒤 `/Applications/ChatGPT.app`에 설치했다. 서명 주체는 `Developer ID Application: OpenAI OpCo, LLC (2DC432GLL2)`다.

현재 열린 대화는 업데이트 전 프로세스에서 계속 실행 중이다. 앱을 한 번 종료하고 다시 열면 `26.810.52044` build `6662`가 활성화된다. 재실행 검증 전 복구용 구버전 번들을 `/Applications/.ChatGPT.app.previous-6644`에 보존했다. 새 버전 재실행을 확인한 뒤 이 백업을 정리할 수 있다.
