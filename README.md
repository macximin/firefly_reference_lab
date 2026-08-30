# InkOS Reverse Lab

내 작품과 참고 작품을 전수 비교해 **웹소설에 맞는 실제 Arc 구조와 페이싱**을 추출하는 독립 연구 저장소다.

InkOS 본체는 집필·감리·수정에 집중한다. 이 저장소는 작품 간 구조 비교, 증거 기록, 분석 도구, 그리고 InkOS에 반영할 기획·Arc·reference 근거를 보관한다. 관리자가 승인한 비추적 원문은 축약하지 않고 전수 독해할 수 있지만, Git에는 원문 문장 대신 source ID·범위·SHA와 누출 검사 영수증만 남긴다. 실제 이야기·문체 예문을 쓰는 경우에도 검증된 private store에서 InkOS로 일회성 전달하며 공용 추상화만 강요하지 않는다.

## 작업 원칙

1. 원문은 로컬 입력 폴더에만 두고 Git에 커밋하지 않는다.
2. 실제 인물·사건·장소·관계·물건·승패·보상을 먼저 보존한다. 추상 용어가 작품 표면을 대신하면 불합격이다.
3. 현실 고증보다 재미의 인과, 기대와 보상, 감정적 납득을 기준으로 본다.
4. 자연 사건 Arc와 1~3화 제작 패킷을 미리 같은 단위로 가정하지 않는다. 원문에서 경계를 찾는다.

## 시작하기

1. 원문은 `private_sources/korean_webnovel_corpus/<필명>/`에 둔다. 이 경로는 커밋되지 않는다.
2. `docs/session-briefs/`에서 담당 작품 발주를 읽고 `templates/work-arc-analysis-contract.md`를 따른다.
3. `analyses/<work-slug>/`에 전 회차 지도, 전체 분석 기획서, 작품소개 포함 피치, Arc Atlas·페이싱, InkOS 적용·간극 보고서, 자유 개선 보고서와 완료 영수증을 만든다.
4. 관리자 검수를 통과한 작품만 `comparisons/`에서 비교하고, InkOS 적용 계약은 `inkos_handoffs/`에 남긴다.
5. 여러 재벌물에서 선택해 쓰는 공용 기능 카드는 `inkos_handoffs/chaebol-reference-core/`에서 관리한다. 카드는 작품별 opt-in이며 문체 설정과 분리한다.

검증:

```bash
node tools/validate-source-manifest.mjs
node tools/genre-soul-source-registry.mjs
node tools/genre-soul-survey-runner.mjs
node tools/genre-soul-deep-read-runner.mjs --source-id gdrive-1BzfNJPOBwauB9HxQq6_HZIDLllb46vJN
node tools/genre-soul-profile-runner.mjs --genre modern-fantasy-ko
node tools/genre-soul-manager-qa-runner.mjs --genre modern-fantasy-ko
node tools/validate-five-work-analyses.mjs --strict
node tools/validate-writing-system-contracts.mjs
```

`tools/genre-soul-source-registry.mjs`는 Drive 메타데이터 스냅샷과 로컬 private
source를 대조해 398개 남성향 재고를 추적 가능한 inventory로 만들고, 로컬
바이트의 SHA-256이 검증된 항목만 private registry의 `available` 상태로 둔다.
여성향 하위 폴더 374개는 v1에서 명시적으로 제외한다. 제목 키워드와 자동
분류는 Soul 승격 근거가 아니다. `male-manager-selection.v1.json`에서 관리자가
장르별 상업·장르 폭·표면 앵커를 선택하고 로컬 바이트, UTF-8, 순차 회차
구조가 모두 일치한 항목만
`eligibleForSoulInput=true`가 된다. 이 선택은 survey/deep-read 입력 허가일 뿐
학습 완료나 Soul 승격 근거는 아니다.

`tools/genre-soul-survey-runner.mjs`는 선별된 9개에 한해 장르별 격리 Hermes
프로필을 `gpt-5.6-sol/high`로 실행한다. 분산 private window를 각각 읽은
session trace, profile config, usage와 결과를 ignored `exports/`에 보존하고,
모든 readback과 `keep` 판정이 일치할 때만 raw 없는 장르별 survey JSON을 만든다.
신규 실행은 경로를 프롬프트에 노출하지 않고 opaque input ID별
`firefly_read_source` 응답을 각 private window 원본과 exact byte 비교한다. 기존
`read_file` trace는 역사적 receipt 검증에서만 line-number wrapper를 복원해 읽는다.
각 survey 옆에는 전체 available 원문 코퍼스와 대조한 zero-match 누출 검사
영수증을 함께 둔다. `needs-manager-review`는 자동 완료하지 않는다.

`tools/genre-soul-deep-read-runner.mjs`는 자연 회차 파일을 bounded segment로
묶고 opaque input ID별 `firefly_read_source` 응답을 모든 chapter 원본과 exact
byte 검증한다. 실패 attempt는
삭제·덮어쓰기 없이 보존하며, 전 구간이 gap-free이고 trace에 compaction이
없을 때만 raw 없는 work-study receipt와 zero-match 누출 영수증을 만든다. 기존
9편의 역사적 receipt는 `legacy-unattested`로만 읽으며 current 증거로 재표기하지
않는다. 신규 실행은 현재 Hermes runtime 결속을 통과한 `current-attested`이고
`deep-read-runs/<sourceId>/runs/<inputDigest>/deep-read-receipt.json` content-addressed
경로를 쓴다. profile 입력은 정확한 legacy 경로 또는 이 current 경로만 받으며
한 실행 안의 legacy/current 혼합은 실패한다. tracked work-study 게시도 target
lock 아래 zero-match support receipt를 먼저 쓰고 work-study visibility marker를
마지막에 쓴다. support 이후 중단되면 파일을 자동 삭제하지 않고 lock을 남겨
수동 감리를 요구한다.

`tools/genre-soul-profile-runner.mjs`는 장르별 정확히 세 작품
(`commercial-anchor`, `genre-breadth`, `surface-anchor`)의 검증된 관찰 전부를
190k-token 보수 상한 이하의 private partition으로 나눈다. 각 partition 결과를
같은 차원의 관찰 ID에만 결속해 작품별로 합치고, 그 세 작품 결과만 다시 장르
프로필로 합성한다. 세계 제약부터 실패 패턴까지 아홉 차원을 모두 다루되 raw
표면은 ignored 실행 디렉터리에만 두며, tracked 후보와 routing 후보는 전체
available corpus 누출 검사 통과 후에만 함께 게시한다. 미해결 충돌이 있으면
후보를 게시하지 않는다.

`tools/genre-soul-manager-qa-runner.mjs`는 프로필 합성 run을 재사용하지 않는다.
별도 `gpt-5.6-sol/high` manager run이 각 작품의 early·middle·late 원문
sub-slice 9개를 새로 읽고, 세 작품의 상업 엔진을 세 쌍 모두 비교한다. 프로필
SHA·private 입력 SHA·run ID·zero-match 영수증이 모두 닫혀야 candidate QA가
`pass`할 수 있다. 핵심 결속은 host가 먼저 증명하며 모델이 이를 false로 뒤집으면
실패 판정이 아니라 invalid output이다. host는 표본 미지지·동일/불충분 엔진
비교를 `needs-revision`, 나머지를 `pass`로 결정론적으로 계산한다. 유효한 음성
판정은 ignored 실행 경로의 immutable `manager-decision.json`으로 보존하고 tracked
PASS marker나 누출 검사는 만들지 않는다. top-level profile `completed` seal이 없으면 하위 support 파일이
모두 보여도 Manager QA를 시작하거나 재사용하지 않는다. QA 통과도 InkOS canon
반영이나 Soul 승급은 아니며 owner 결정을 대체하지 않는다. 각 표본은 게시 직전 live private source의 selector와
byte SHA에 다시 결속한다. 선정 제목·저자, 직함에 결속된 인명, 식별 가능한
조직 표면은 tracked 비교문에서 즉시 차단한다. 원문과 후보에 함께 나타난 맨몸
2~4음절 성씨형 표현은 코드가 인명·일반어를 추측하지 않고 ignored `exports/`에
private `pending_hil` 요청만 남긴다. 이 상태에서는 tracked 후보·누출 영수증·
visibility marker·top-level completion seal을 쓰지 않는다. 기존 Storyyard
`firefly_review_packet/v2`는 InkOS 원고 두 후보 전용이므로 이 분석 판정에
재라벨해 쓰지 않는다. 반면 `대기업` 같은 4-token 이하의 일반 상업 메커니즘
문구는 짧다는 이유만으로 자동 거절하지 않는다. 실행
digest는 exact prompt bytes와 현재 attested Hermes
binary·implementation·dependency·profile/project context 전체를 포함하며, 실제
attempt의 trace·usage·result·host receipt·completion pointer가 모두 일치해야 한다.
테스트 executor도 명시적 test-only 경계와 같은 immutable evidence 검사를 우회할
수 없다. 모든 test-only override는 실제 Reference Lab 루트와 다른, 명시적
`testOnlyRepositoryRoot` 아래에서만 실행된다. tracked QA pair는 target lock과
no-clobber CAS 아래 누출 영수증을 먼저,
`manager-qa.json` visibility marker를 마지막에 게시하고 둘 다 exact readback한다.

`pending_hil`은 owner가 정확한 request를 결정한 뒤 같은 content-addressed run을
재실행해 해소한다. `approve`는 후보·request·decision의 exact bytes를 소비한 뒤만
진행하고, Manager QA의 tracked PASS에는 후보·request·owner 결정의 bodyless exact
proof를 함께 남긴다. `reject`는 tracked 게시 없이 종료한다. 실제 재작성 전이가 없는
`polish-retry` 선택지는 노출하지 않는다. 이 결정은
분석 표면에만 유효하며 InkOS canon 작성이나 Soul 승급 권한이 아니다.

```bash
node tools/genre-soul-surface-hil-decision.mjs \
  --request "$REQUEST_PATH" \
  --decision approve \
  --actor-id "$OWNER_ACTOR_ID"
```

분산 survey, 전수 deep-read, 장르 프로필, manager QA, tracked 누출 검사와
promotion eligibility의 완료선은
`templates/genre-soul-study-contract.md` 및
`tools/genre-soul-study-contract.mjs`가 소유한다. 전수 byte coverage와 실제
`gpt-5.6-sol/high` config·trace 영수증, zero-match scanner receipt가 없으면
manager QA를 통과할 수 없다. Reference Lab의 eligibility는 HQ owner 결정을
대신하지 않는다.

## 폴더

| 경로 | 역할 |
| --- | --- |
| `private_sources/` | 커밋하지 않는 로컬 원문 입력. |
| `reference_inputs/` | 커밋하지 않는 참고 분석 입력. |
| `evidence/` | raw 없이 source ID·repo-relative path·해시·접근일을 기록한 매니페스트와 증거 메모. |
| `docs/session-briefs/` | 작품별 독립 분석 발주와 입력·출력 경계. |
| `templates/` | 회차·Arc·기획서·보고서 공통 분석 계약. |
| `analyses/` | 작품별 전 회차 지도, 기획서, Arc Atlas·페이싱과 InkOS 보고서. |
| `comparisons/` | 내 작품 간 및 레퍼런스 대비 분석. |
| `inkos_handoffs/` | 기획서·Arc·문체 계약에 반영할 분석 전용 후보와 routing 근거. InkOS canon을 직접 쓰지 않는다. |
| `tools/` | 재현 가능한 검사와 분석 보조 도구. |
| `tests/` | 도구와 분석 계약의 회귀 테스트. |
| `exports/` | 커밋하지 않는 세션 로그와 관리자 임시 산출물. |

## 작품별 필수 산출물

새로 분석하거나 갱신하는 작품은 다음 10개 파일을 최소로 갖는다. 기존 분석은 `--require-pitch`를 지정했을 때만 피치를 필수로 검사한다.

- `source_receipt.json`
- `chapter_map.csv`
- `project_bible.md`
- `project_pitch.md`
- `arc_map.csv`
- `arc_pacing.csv`
- `arc_atlas.md`
- `inkos_usage_and_gap_report.md`
- `free_improvements_report.md`
- `completion_receipt.md`

전체 필드와 완료 조건은 `templates/work-arc-analysis-contract.md`가 권위다. 전 회차를 한 행씩 포함하고, 모든 Arc에 실제 사건형 이름·구체 인물·장소·결산·다음 훅과 회차별 페이싱을 남긴다. `project_pitch.md`는 공식 소개 복원이 아니라는 사실과 근거 범위를 밝힌다.
