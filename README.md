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
node tools/blind-pair-evaluation-runner.mjs --input exports/<blind-input>.json
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
현재 exact-input capability v3는 플러그인을 임시 bundled root에서만 발견하고,
큰 UTF-8 입력을 결정론적 cursor chunk로 순차 전달한다. 모델은 직전 응답의
`nextInputId`·`nextCursor`만 따라가며, host는 누락·병렬·재분할·재정렬·변조를
거절한 뒤 모든 chunk를 원본 SHA와 byte 크기로 재조립한다. 당시 플러그인을
실제로 등록하지 못했던 미완료 structured v1 attempt는 호환 완료본으로 간주하지
않고 audit trail로만 보존한다.
각 survey 옆에는 전체 available 원문 코퍼스와 대조한 zero-match 누출 검사
영수증을 함께 둔다. `needs-manager-review`는 자동 완료하지 않는다.

`tools/genre-soul-deep-read-runner.mjs`는 자연 회차 파일을 bounded segment로
묶고 opaque input ID별 `firefly_read_source` 응답을 모든 chapter 원본과 exact
byte 검증한다. 동일한 capability v3 cursor chain을 쓰며 실패 attempt는
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

이 상한은 raw 파일 크기의 근사치가 아니라 실제 capability v3 cursor chain의
assistant/tool transcript를 결정론적으로 직렬화한 값이다. profile context,
bundled plugin, stage prompt, static reserve와 output reserve까지 공용 Hermes
preflight와 같은 공식으로 합산하고 `budget < contextLimit`일 때만 실행한다.
각 work partition은 provider 호출 전에 이 영수증을 run-input digest v4에 봉인하고
실행 직전에 다시 계산한다. 이전 공식으로 만들어진 미완료 run은 수정하거나
재사용하지 않고 audit trail로 남기며, 새 budget 계약은 새 digest/run root를 쓴다.
최종 profile 표면 semantic 입력도 같은 exact preflight를 통과해야 한다. 전체 입력이
예산 안에 들면 single v1 input/result/prompt, HIL gate v3, 전체 semantic finding
partition을 결속한 single owner request v4를 쓰고, 넘치면
`partition-plan/v1`의 `greedy-prefix/v1`이 정렬된 finding을 쪼개지 않은 채 연속
part로 나눈다. 각 part는 별도 reviewer run으로 exact 검토하고 host가
`aggregate/v1`을 결정론적으로 합친다. plan·모든 part input/result/host receipt·
aggregate 실제 bytes를 completion에 봉인하며, protected finding 하나라도 있으면
전역 차단한다. uncertain 전체는 part별 요청이 아니라 HIL v4 request/decision 한
쌍으로만 보낸다.

capability v3는 원문·세션·state DB·plugin을 system-temp capsule에 유지하면서,
provider 인증 상태만 source profile tree의 canonical global `auth.json`으로 라우팅한다. 인증 파일은
capsule에 복사하거나 symlink하지 않고, provider가 소유하는 credential lifecycle 및
auth-state 변경(refresh, cooldown, pool sync·정규화·pruning)은 기존 global
`auth.lock` 아래 수행한다. attested delegated Hermes를 직접 실행해 wrapper의
`PYTHONPATH` 제거를 우회하고, 봉인된 bootstrap adapter bytes, 현재 Hermes private-hook
consumer 호환성 probe, reader의 READY contract가 실제 trace에서 함께 통과해야 한다.
survey·deep-read·profile·Manager QA의 current structured run은 모두 이 adapter planning
evidence를 입력 digest와 executable capability에 결속한다. project/managed dotenv와
Codex CLI credential 자동 수입은 exact run에서 비활성화된다. Hermes v0.19의 일반 profile
process는 global singleton refresh 때 같은 root lock을 항상 공유하지 않으므로,
exact profile synthesis와 별도 비-adapter Soul 실행을 동시에 돌리지 않는 것을
현 운영 전제로 둔다.

`tools/genre-soul-manager-qa-runner.mjs`는 프로필 합성 run을 재사용하지 않는다.
별도 `gpt-5.6-sol/high` manager run이 각 작품의 early·middle·late 원문
sub-slice 9개를 새로 읽고, 세 작품의 상업 엔진을 세 쌍 모두 비교한다. 프로필
SHA·private 입력 SHA·run ID·zero-match 영수증이 모두 닫혀야 candidate QA가
`pass`할 수 있다. 핵심 결속은 host가 먼저 증명하며 모델이 이를 false로 뒤집으면
실패 판정이 아니라 invalid output이다. 모델은 표본별 `sampleId`와 의미 판정만
반환하고, host가 그 ID를 exact private input의 source·span·observation·selector·SHA에
재결속해 tracked receipt로 투영한다. 표본은 긴 엔진 전체가 아니라 exact phase
allowlist만 판정한다: early는 `pressure`·`protagonistRepeatedVerb`, middle은
`activeChoice`·`protagonistRepeatedVerb`·`resistance`, late는
`payoff`·`recognition`만 허용한다. 작품별 세 phase의
합집합이 상업 엔진 여섯 필드를 덮고, 세 pair가 `shared-core` 또는
`distinct-variant`로 evidence-complete일 때 pass한다. 장르 공통 코어는 결함이
아니며, byte-identical mechanism은 장르 공통 evidence가 있는 `shared-core`로만
판정할 수 있고 `distinct-variant`로 판정하면 invalid output이다. 모순·불충분·누락·중복·미결속만 fail-close한다. 유효한 음성
판정은 ignored 실행 경로의 immutable `manager-decision.json`으로 보존하고 tracked
PASS marker나 누출 검사는 만들지 않는다. top-level profile `completed` seal이 없으면 하위 support 파일이
모두 보여도 Manager QA를 시작하거나 재사용하지 않는다. QA 통과도 InkOS canon
반영이나 Soul 승급은 아니며 owner 결정을 대체하지 않는다. 각 표본은 게시 직전
live private source의 selector와 byte SHA에 다시 결속한다. 연속 5-token 복사와
선정 메타데이터의 제목·저자처럼 별도 구조로 결정론적으로 확정된 표면은 즉시
차단한다. 샘플 텍스트에서 형태만 추정한 인용·Latin 식별자·조직 전체형을 포함해
구두점·조사·일반 어휘·조직 접미사·맨몸
2~4음절 인명형처럼 문맥 판단이 필요한 항목은 코드가 차단 여부를 추측하지 않고
bounded raw window 후보만 추출한다. 작품별 consolidation과 장르 합성의 중간
결과에서는 구조·근거 검증만 수행한다. Manager의 최종 receipt 후보는 별도
role/run의 `gpt-5.6-sol/high` semantic reviewer 한 번으로 검토하고, profile 최종
후보는 위 context preflight 결과에 따라 legacy single 또는 partitioned reviewer
집합으로 검토한다. reviewer가 `generic-overlap`으로 판정하면 자동 통과하고,
`protected-identity`면 차단하며, `uncertain`만 `surface-review/owner-hil/` 아래
single과 partition aggregate 모두 v4 `pending_hil` 요청으로 보낸다. single v4는
전체 finding-set SHA와 generic/protected/uncertain ID partition을 결속하며 과거
single request v3는 readback 호환으로만 받는다. reviewer
input·result·host receipt·trace는
producer run/receipt와 함께 immutable private evidence로 봉인하고, 성공한
completion의 재사용 때 prompt와 exact-read chain을 다시 만든다. pending 상태에서는 tracked 후보·누출
영수증·visibility marker·top-level completion seal을 쓰지 않는다. 현재 Manager
tracked receipt는 `genre-soul-manager-qa/v3`, surface candidate는 v2이며 clean 후보도 deterministic proof를
필수로 가진다. semantic proof는 Manager input digest, canonical candidate bytes,
finding decision/result SHA, 실제 private evidence readback에 함께 결속되고 현재
receipt에는 legacy v1 proof를 넣을 수 없다. 기존 Storyyard
`firefly_review_packet/v2`는 InkOS 원고 두 후보 전용이므로 이 분석 판정에
재라벨해 쓰지 않는다. 반면 `대기업` 같은 짧은 일반 상업 메커니즘 문구는 길이만으로
자동 거절하지 않는다. 문장부호 너머 인접 토큰은 조직 구조에서 제외하고, 불완전한
window coverage는 semantic reviewer가 반드시 `uncertain`으로 남긴다. 과거 Manager
v1/v2 receipt와 pending 요청·결정은 불변 이력으로 검증하되 current v3로 재표기하거나
새 digest에 재사용하지 않는다.
Manager current v3 semantic 경로는 partition하지 않는다. 대신 single v1 입력과
prompt를 semantic evidence write·provider 호출보다 먼저 exact context preflight하고,
초과하면 HIL·누출 검사·tracked publication 없이 fail-closed한다.
Manager 실행 digest는 exact prompt bytes와 현재 attested Hermes
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
  --actor-id "$OWNER_ACTOR_ID" \
  --decided-at "$DECIDED_AT"
```

`--decided-at`은 owner가 고정한 ISO-8601 시각이며 필수다. 같은 request를 재시도할
때 동일한 값을 다시 전달해야 decision bytes가 달라지지 않는다.

분산 survey, 전수 deep-read, 장르 프로필, manager QA, tracked 누출 검사와
promotion eligibility의 완료선은
`templates/genre-soul-study-contract.md` 및
`tools/genre-soul-study-contract.mjs`가 소유한다. 전수 byte coverage와 실제
`gpt-5.6-sol/high` config·trace 영수증, zero-match scanner receipt가 없으면
manager QA를 통과할 수 없다. Reference Lab의 eligibility는 HQ owner 결정을
대신하지 않는다.

`tools/blind-pair-evaluation-runner.mjs`는 InkOS가 무작위화한 `candidate-A/B`
두 본문만 별도 `gpt-5.6-sol/high` 평가자에게 exact-read로 전달한다. 생성 lane,
생성자 profile, label mapping은 평가 입력과 prompt에서 제외한다. 원고·상세 평가는
ignored `exports/`에만 보존한다. 평가자의 v2 결과는 후보 SHA에 결속한 상업 점수,
감정적 정합성 점수, content-neutral 위반, hard canon contradiction·canon leak,
장르 정체성 근거를 기록하며 모든 근거는 같은 후보의 사전 봉인된 UTF-8 byte span을
그대로 사용한다. host는 실제 본문 byte 경계·slice SHA를 다시 검증하고 evaluator
input/result/host receipt 세 해시를 하나의 결속으로 남긴다.

평가자 profile은 정확히 `inkos_blind_evaluator`이며 고정 감사 digest
`configSha256=4124e16bc40d28732d1dd02f9f2e8b78127a202313e1ace21021f16fca809f46`,
`soulSha256=5c4cca60c9971312682f7b71cac5d4d61b6f9e2c42d19af99c8fe6daedacd94b`를 Hermes
readback과 byte-for-byte 대조한다. 임의의 로컬 profile 상태를 기대값으로 승격하지
않는다. `assembleBlindPairEvaluationInputFromInkOSTransfer`는 InkOS
`inkos-blind-pair-evaluation-transfer/v1`의 exact `candidate-A/B`
`id/body/sha256/byteLength`, non-empty `commonContext`, opaque IDs와 canonical self-hash를
검증한 뒤 bodyless RefLab v2 input을 조립한다. 이 boundary는 lane·WorkOrder·producer
profile 등 private label-assignment mapping을 입력으로 받지 않는다. 평가자에게 보이는 pair/run ID는 각각
`bp-<24 hex>`, `br-<24 hex>` 형식의 opaque ID뿐이다. shared Book brief·canon·현재
Arc/Rail projection은 lane-neutral `commonContext`의 비어 있지 않은 원문 bytes,
byte length, SHA-256으로 입력에 결속한다. 평가자는 이 공통 문맥을 실제로 확인한 뒤에만
`referenceEngineRetention`, canon contradiction, canon leak의 빈 배열을 무발견으로
기록할 수 있다. tracked receipt에는 공통 문맥 본문 대신 hash와 byte length만 남긴다.

각 후보는 평가와 별개로 검증된 private 원문 registry 전체에 대해 실제 12-token·
120-byte surface scan을 수행한다. scan이 끝난 zero-match와 match-present를 서로 다른
상태로 기록하고, truncation이나 가짜 빈 결과는 완료로 인정하지 않는다. match selector는
후보·원문 SHA와 양쪽 UTF-8 byte span에 결속되며 자동 재작성·자동 거절은 항상 false다.
Git에는 이 결속·점수·count와 `humanDecision=pending`만 담은 bodyless v2 영수증을
no-clobber로 게시한다. Storyyard에는 `promotion-evaluation`,
`select|tie|invalid`, advisory, `manuscriptApply=false`로만 투영할 수 있다. 이 영수증은
분석 근거이며 InkOS canon 작성이나 Soul 승급 권한이 없다.

`tools/blind-pair-storyyard-projection.mjs`는 InkOS가 제공한 source/work/artifact,
canary isolation, generation evidence를 임의로 보충하지 않고 현재 Storyyard
`firefly_review_packet/v2`의 `evaluationBindingSha256`, 32,768-byte source selector
상한, packet identity 규칙에 맞춘 in-memory 호환 projection만 만든다. evaluator의
`canonLeaks`가 하나라도 있으면 Storyyard schema에서 누락시키지 않고
`block-on-nonzero`로 materialization을 중단한다. 이 helper는 게시·canon 반영 권한이
없다. 실제 import/배포 전에는 sibling Storyyard의
`app/firefly-review-contract.ts` validator를 동일 packet bytes에 다시 실행하는 것이
필수 cross-repo gate다. Storyyard 또는 InkOS 계약이 바뀌면 이 fixture PASS만으로
호환을 주장하지 않는다.

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
