# 작품별 웹소설 Arc 분석 계약

이 템플릿은 15작품 분석 세션의 공통 계약이다. 담당 작품 하나만 분석한다.

## 고정 규칙

- 원문 전체를 파일 순서대로 다룬다.
- 회차 식별은 `ⓚ` 표식의 실제 순서를 기준으로 한다.
- Arc 길이를 먼저 정하지 않는다.
- 관찰한 사실과 해석을 구분한다.
- 다른 작품 분석과 중국 숏드라마 자료를 1차 분석에 사용하지 않는다.
- 담당 `analyses/<work-slug>/` 밖의 파일은 수정하지 않는다.
- 커밋과 푸시는 하지 않는다.
- 인물·사건·장소·물건·관계·승패·보상의 실제 표면을 최대한 보존한다.
- 현실 고증보다 재미의 인과, 기대와 보상, 감정적 납득을 우선한다.
- 이름 없는 기능어와 과잉 분류로 작품을 말려 버리지 않는다.
- 미세 오류 집착, 기계적인 문체, 진단명이나 비하 표현을 산출물에 사용하지 않는다.

## 네 가지 Goal

1. `project_bible.md` + `project_pitch.md`: 작품 전체 분석 기획서와 작품소개 포함 판매 피치
2. `arc_atlas.md` + `arc_map.csv` + `arc_pacing.csv`: 작품 전체 Arc 구조도와 Arc별 페이싱
3. `inkos_usage_and_gap_report.md`: InkOS 사용법, 구조 개선 또는 보정층 제안
4. `free_improvements_report.md`: 기타 자유 개선 사항

요약본만 제출하지 않는다. 데이터 크기에 상한은 없으며, 전 회차와 모든 Arc를 다룬다.

## `source_receipt.json`

```json
{
  "schemaVersion": 1,
  "workSlug": "",
  "title": "",
  "penName": "",
  "sourcePath": "",
  "sourceSha256": "",
  "markerPattern": "^ⓚ",
  "markerCount": 0,
  "firstMarker": "",
  "lastMarker": "",
  "numberingNotes": [],
  "analysisCoverage": "full"
}
```

## `chapter_map.csv`

헤더:

```text
sequence,visible_label,title,start_line,end_line,entry_state,reader_promise,protagonist_goal,action,resistance_or_cost,turn_or_reveal,paid_reward,state_change_axis,state_change,ending_hook,closed_loops,opened_loops,arc_id,confidence
```

`sequence`는 파일 내 1부터 시작하는 연속 순번이다. `visible_label`은 원문에 표시된 번호를 그대로 보존한다.

## `arc_map.csv`

헤더:

```text
arc_id,arc_name,start_sequence,end_sequence,start_label,end_label,episode_count,main_characters,main_locations,concrete_premise,central_question,promise,pressure_escalation,mid_turn,concrete_payoff,relationship_change,status_or_ability_change,residual_cost,next_arc_bridge,boundary_signals,confidence
```

## `arc_pacing.csv`

헤더:

```text
sequence,visible_label,arc_id,arc_phase,concrete_event,tension_1_10,reward_1_10,hook_1_10,information_weight,action_weight,relationship_weight,emotion_weight,material_or_status_weight,pacing_note
```

다섯 `*_weight` 열은 한 작품 안에서 아래 셋 중 **한 척도만** 사용한다. 문자열 등급(`low`, `medium`, `high`)이나 척도 혼용은 허용하지 않는다.

- 독립 강도형: 다섯 열 모두 `1`~`10` 정수. 각 값은 독립 강도라 합계 제약이 없다.
- 정규화 비율형: 다섯 열 모두 `0`~`1` 숫자. 한 행의 합은 `1`이어야 하며 부동소수점 허용 오차는 `±0.01`이다.
- 백분율 구성형: 다섯 열 모두 `0`~`100` 숫자. 한 행의 합은 `100`이어야 하며 반올림 허용 오차는 `±1`이다.

예를 들어 앞 구간은 `0.25`, 뒤 구간은 `7`로 쓰는 식의 작품 내 혼용은 금지한다. 다섯 열 가운데 일부만 다른 척도를 쓰는 행도 금지한다. 사용한 척도는 `completion_receipt.md`에 기록한다.

## `project_bible.md`

실제 고유명사를 사용해 다음을 충분히 길게 쓴다.

1. 작품 한 줄 약속과 장르 독자층
2. 전체 줄거리와 결말
3. 주인공의 출발 상태·욕망·능력·결핍·변화
4. 주요 인물별 욕망·관계·역할·변화
5. 세계·시대·직업·사업·경기 규칙
6. 핵심 장소·조직·물건·능력·자원
7. 초반·중반·후반의 구체 사건 흐름
8. 반복 재미와 대표 보상 장면
9. 작품이 약속을 갱신하고 규모를 키우는 방식

## `project_pitch.md`

`project_bible.md`와 전수 분석을 근거로 새로 작성하는 판매·라우팅용 기획서다. 출판 당시 공식 작품소개를 확보하지 못했다면 복원했다고 주장하지 않는다.

1. 작품명·필명·장르·핵심 독자·완결 여부·분량·근거·불확실성
2. 한 줄 카피와 로그라인
3. 결말을 숨긴 400~700자 플랫폼 작품소개
4. 주인공의 자기 이득, 전용 HOW, 반복 재미 엔진, 대표 보상 통화
5. 초반 약속, 초·중·후 성장선과 내부용 결말 상태
6. 주요 인물의 가치 교환과 관계 보상 장면
7. 핵심 판매 포인트와 장르 라우팅
8. 직접 라우팅 가능한 업종·사건·보상과 원문 문장·고유명 직접 전사 금지선, 사실 검증 메모

카피를 세게 만들기 위해 원문에 없는 능력·사건·결말을 추가하지 않는다. 내부 기획 피치와 외부용 작품소개를 분리하고, 외부용 소개에는 결말을 쓰지 않는다.

## `arc_atlas.md`

아래 순서로 쓴다.

1. 작품 전체 독자 계약
2. 전체 Arc 목차와 회차 범위
3. Arc마다 고유한 사건형 이름
4. Arc마다 실제 등장인물·장소·발단·목표·충돌·전환·보상·다음 훅
5. Arc 안의 회차별 구체 비트와 종료 훅
6. Arc별 페이싱 그래프 또는 표
7. 초반·중반·후반의 리듬 변화
8. 결말 Arc의 수렴과 지급
9. 근거가 약하거나 경계가 겹치는 구간

## `inkos_usage_and_gap_report.md`

- 이 작품을 현재 InkOS에서 기획·Arc·원고로 운영하는 구체적 방법
- 현재 구조로 충분한 부분
- 구조 개선이 필요한 부분
- 별도 보정층이 더 적절한 부분
- 작품 표면과 장기 진행을 보존할 데이터·UI·프롬프트·감리 장치
- Arc별 페이싱을 생성 전 계획하고 생성 후 보정하는 방식

## `free_improvements_report.md`

형식 제한 없이 작품 분석 중 발견한 개선안을 제안한다. 창작법, 기획 화면, Arc 편집기, 원고 컨텍스트, 감리, 장편 상태 관리, 비교 분석 도구 모두 범위에 포함된다.

## 완료 판정

- 모든 회차가 `chapter_map.csv`에 있다.
- 모든 행에 `arc_id`가 있거나 명시적인 전이 상태가 있다.
- 모든 Arc는 최소 두 개의 경계 신호를 가진다.
- 모든 Arc에 작품 속 실제 사건을 반영한 이름과 회차별 페이싱이 있다.
- 전 회차에 같은 목표·저항·보상·상태 변화 문장을 일괄 복제하지 않는다. 각 행은 해당 회차에서 실제로 벌어진 사건과 지급을 쓴다.
- 긴장도·보상도·훅 강도는 Arc 단계 공식으로 자동 배정하지 않고 해당 회차의 실제 장면 강도에 따라 판정한다.
- `arc_map.csv`의 인물·장소·관계 변화·잔여 비용은 작품 전체 공통 문구가 아니라 해당 Arc의 구체 표면으로 쓴다.
- 작품 전반·중반·후반에서 각각 근거를 제시한다.
- 네 가지 Goal 문서와 작품소개 포함 피치가 충분한 해상도로 완성됐다.
- 작품 표면보다 추상 분석어가 앞서지 않는다.
- `completion_receipt.md`에 실제 행 수, Arc 수, 미확정 구간, 자체 반례를 기록한다.
