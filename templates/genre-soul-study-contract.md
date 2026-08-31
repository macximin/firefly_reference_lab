# Genre Soul study contract v1

이 계약은 현대판타지·판타지·무협 Soul의 원문 독해와 승급 증거를 분리한다.
원문은 `private_sources/`와 ignored `exports/`에만 존재하며 tracked 산출물에는
source ID, UTF-8 byte 범위, SHA-256, 파생 관찰과 판정 영수증만 둔다.

## 단계

1. `genre-soul-source-inventory/v1`: Drive 직계 남성향 398개와 여성향 제외 374개를 고정한다.
2. `genre-soul-survey/v1`: manager가 확정한 장르 후보 전부에 reader run과 읽은 byte 범위를 남긴다.
3. `genre-soul-deep-read/v1`: 앵커별 `0..sourceSizeBytes` gap-free 전수 범위와 실제 `gpt-5.6-sol/high` readback을 남긴다.
4. `genre-soul-analysis-profile/v1`: 정확히 세 앵커의 검증된 전수 관찰을 bounded private partition → 작품별 consolidation → 장르 synthesis 순서로 합성한다. 세계 제약, 주인공 반복 동사, 압박·적대, 보상·지위 통화, 다음 행동, 상업 엔진, 감정적 정합성, Arc·성장, 실패 패턴의 아홉 차원을 모두 포함한다.
5. `tracked-projection-leak-scan/v1`: 전체 available corpus에 대해 exact 12-token과 120 UTF-8 byte 공통 표면을 검사한다.
6. `genre-soul-manager-qa/v2`: 프로필 synthesis와 다른 실제 `gpt-5.6-sol/high` run이 세 작품에서 early·middle·late 원문 sub-slice를 하나씩, 총 9개 새로 읽는다. 각 표본은 live private source selector·byte SHA에 재결속한다. profile/input/raw readback/leak 결속은 host가 먼저 증명하고 모델이 false로 뒤집으면 유효한 실패 판정이 아니라 invalid output으로 거절한다. 표본 미지지·동일/불충분 pair는 `needs-revision`, 나머지는 `pass`로 결정론적으로 계산하며 모델 선언과 다르면 거절한다. 유효 음성 판정은 immutable private decision으로 보존하며 tracked PASS marker를 만들지 않는다. 세 상업 엔진의 3개 pairwise 비교, distinct mechanism signature, exact profile/input/prompt SHA, current-attested Hermes binary·implementation·dependency·profile/project context, immutable trace·usage·result·host receipt·completion pointer와 zero-match receipt가 모두 통과했을 때만 candidate QA를 pass할 수 있다. tracked leak receipt는 target lock/no-clobber CAS 아래 먼저 게시하고 `manager-qa.json` visibility marker는 마지막에 게시·readback한다. `genre-soul-manager-qa/v1`은 역사 영수증으로만 검증하며 current v2 proof로 대체하지 않는다.
7. `genre-soul-promotion-eligibility/v1`: 장르당 전수 독해 3편, Review Packet v2, 독립 blind pair 3개와 상업 기준을 집계한다. 이 파일은 owner 승급 결정을 소유하지 않는다.

신규 Hermes 실행은 경로·glob·offset을 모델에 주지 않는다. host가 exact input bytes를
opaque input ID에 결속하고, 격리된 임시 capsule은 `firefly_read_source` 하나만
bundled plugin root를 통해 노출한다. capability v3는 큰 UTF-8 원문을 결정론적
cursor chunk로 나누고 직전 결과의 `nextInputId`·`nextCursor`를 한 번에 하나씩만
따르게 한다. host가 누락·병렬·재분할·재정렬·변조를 거절하고 완전한 원본 bytes로
재조립한 뒤에만 읽기를 인정한다. trace의 도구 이름·호출 순서·인자·반환 bytes와
runtime/plugin/input attestation이 모두 일치해야 실행을 완료한다. capsule은 handled
completion/failure마다 삭제를 시도한다. capsule identity drift나 제거 실패는 완료를
중단하고 감사용 상태를 남길 수 있으며, SIGKILL·host loss는 in-process cleanup 보장 밖이다.
인증 자료의 capsule 사본이나 session/state DB를 repository에 영속하지 않는다.
profile runner의 exact private 입력·attempt 증거는 기존 계약대로 ignored `exports/`에
감사 자료로 남는다. credential bytes는 capsule에
복사하거나 symlink하지 않는다. 봉인된 bootstrap adapter가 attested delegated
Hermes 시작 시 source profile tree의 canonical global `auth.json`만 중앙 auth helper에
연결하고, provider가 소유하는 credential lifecycle 및 auth-state 변경(refresh,
cooldown, pool sync·정규화·pruning)은 기존 global `auth.lock` 아래에서만 수행한다.
같은 adapter가 현재 Hermes private-hook consumer 호환성을 fail-closed로 확인하고,
project/managed dotenv, external secret source, Codex CLI credential 자동 수입을
비활성화한다. reader는 READY contract와 capsule HERMES_HOME을 확인한 뒤에만 원문
chunk를 반환한다. survey·deep-read·profile·Manager QA의 current structured run은 모두
adapter planning evidence를 run-input digest와 executable capability에 결속한다.

Profile partition budget은 raw source byte 수가 아니라 위 cursor chain의 실제
assistant/tool transcript byte 수를 사용한다. profile context, bundled plugin,
stage prompt, static reserve와 output reserve를 공용 Hermes preflight와 동일하게
합산하며 총합이 context limit과 같아도 거절한다. 모든 work partition은 provider
호출 전에 계획되고 run-input digest v4에 영수증으로 봉인되며 실행 직전에 exact
재검증한다. 이전 budget 계약의 미완료 run root는 audit trail로 보존하고 새 실행에
복사·수정·재사용하지 않는다.

Profile 최종 표면 semantic 입력도 같은 exact budget을 사용한다. 전체 single v1
input/result/prompt가 예산 안에 들면 HIL gate v3와 owner request v4 경로를 쓴다. 넘치면
`private-genre-soul-surface-semantic-review-partition-plan/v1`의
`genre-soul-surface-semantic-review-greedy-prefix/v1`이 findingId 정렬 순서의 최대
연속 prefix를 선택한다. finding과 그 candidate/private windows는 쪼개지 않으며,
단일 finding도 맞지 않으면 실패한다. 각 part의 v1 input/result와 별도 reviewer
host receipt를 검증한 뒤 host만
`private-genre-soul-surface-semantic-review-aggregate/v1`을 만든다. LLM 재합성은
없다. Profile reviewer의 raw result는 모델이 반환한 bytes 그대로 보존하고 host
receipt는 그 raw result에 결속한다. 다만 `windowCoverageComplete:false` finding의 raw verdict가 uncertain이
아니면 host가 aggregate seal 전에 effective verdict만 `uncertain` /
`insufficient-context`로 fail-closed 투영하고 evidence window ID는 보존한다.
aggregate decision union·part projection·count·outcome·HIL은 이 effective verdict를
사용한다. plan·모든 raw part·aggregate 실제 bytes는 completion seal과 재사용
readback의 필수 증거다.

Hermes v0.19의 일반 profile process는 global singleton을 읽은 뒤에도 profile-local
lock/write 경로로 refresh할 수 있다. upstream source-aware Codex transaction이
도입되기 전까지 profile synthesis 중 별도 비-adapter Soul Hermes 실행을 병행하지
않는다. Reference Lab exact run끼리는 canonical global auth lock을 공유한다.

플러그인이 등록되지 않아 완료될 수 없었던 pre-v2 structured attempt는 audit
trail로만 보존하고 current evidence로 재사용하지 않는다. 실제 역사적 v1 survey와
deep-read receipt는 기존 별도 validator로 계속 읽으며 새 증거로 재표기하지 않는다.

기존 9편의 역사적 deep-read receipt는 `legacy-unattested` 상태 그대로 보존한다.
신규 실행만 현재 runtime을 재검증한 `current-attested`이며
`deep-read-runs/<sourceId>/runs/<inputDigest>/deep-read-receipt.json`에 기록한다.
profile은 정확한 역사 경로 또는 이 content-addressed current 경로만 소비하고,
legacy/current 증거를 같은 실행으로 위장하거나 혼합하지 않는다. tracked deep-read
게시에서는 zero-match support receipt를 target lock 아래 먼저 만들고 work-study
visibility marker를 모든 검증 뒤 마지막에 만든다. support 게시 뒤 중단되면 support를
자동 삭제하지 않고 lock을 보존해 수동 감리한다.

Manager QA는 top-level profile `completed` seal을 필수 입력으로 삼는다. partition,
작품 consolidation, 장르 결과, 누출 영수증 같은 하위 support가 모두 존재해도 이
seal이 없으면 profile을 완료 후보로 보거나 QA를 시작·재사용하지 않는다.

표면 검사는 identity와 일반 메커니즘을 구분한다. 선정 작품 제목·저자와 exact
5-token private copy처럼 구조적으로 확정된 표면은 결정론적으로 차단한다. 반면
구두점·조사·일반 어휘·조직 접미사·인용·Latin identifier·조직 전체형·직함 인접·
맨몸 2~4음절 인명형처럼 문맥 판단이 필요한 교차는 코드가 사람·조직으로
과승격하지 않고 bounded candidate/private window finding으로 만든다. 별도
producer가 아닌 `gpt-5.6-sol/high` semantic reviewer가 모든 finding을 정확히 한
번씩 `generic-overlap`, `protected-identity`, `uncertain`으로 판정한다. window
coverage가 불완전하면 effective 판정은 반드시 `uncertain`이다. Profile에서는
모델의 다른 raw 의견도 감사 증거로 보존하되 host projection이 안전 판정을
소유한다. Manager QA는 기존처럼 이런 raw 의견 자체를 invalid output으로 거절한다.
protected 하나라도 있으면 owner가 우회할 수 없는 전역 차단이고, uncertain만 owner
HIL로 간다. `대기업` 같은 짧은 일반 상업 메커니즘은 길이만으로 자동 거절하지
않는다. InkOS chapter 전용 Storyyard Review Packet v2를 이 분석 판정으로
재라벨하지 않는다.

Single semantic 경로는 legacy v1 input/result/prompt와
`genre-soul-protected-surface-hil/v3`,
`private-genre-soul-ambiguous-surface-request/v4`,
`private-genre-soul-ambiguous-surface-decision/v3`를 사용한다. request v4는 전체
finding-set SHA와 host-effective generic/protected/uncertain ID partition을 raw
semantic result reference와 함께 결속한다. 과거 request v3는 읽기·결정 재생
호환만 유지하며 새로 쓰지 않는다. Profile overflow
경로는 모든 part의 exact finding union과 reviewer role/run 분리를 host aggregate가
재구성한다. protected가 없고 uncertain이 있을 때에만 part별 요청 대신 정확히 한
개의 `private-genre-soul-batch-ambiguous-surface-request/v4`와
`private-genre-soul-batch-ambiguous-surface-decision/v4`를 만든다. 이 v4 한 쌍은
plan·aggregate·모든 part input/result/receipt hash와 uncertain 전체 finding을
결속한다. v1/v2/v3/v4 증거는 각 schema validator로만 읽고 서로 대체하지 않는다.

Manager current v2는 single v1 semantic proof만 사용하고 자동 partition하지 않는다.
대신 semantic input/prompt를 private semantic evidence write와 provider 호출 전에
공용 exact context preflight한다. 초과하면 semantic reviewer·HIL·누출 검사·tracked
publication 없이 fail-closed한다.

owner 결정은 request의 exact path·SHA·candidate·private source/sample digest와 모든
finding ID를 결속한다. batch v4는 여기에 plan·aggregate·각 reviewer evidence
reference도 결속한다. 같은 run 재실행은 `approve`일 때만 계속 진행하며 profile은
candidate·semantic evidence·request·decision을 top-level completion에 함께 봉인하고
Manager QA PASS는 candidate·request·approved owner decision의 bodyless exact proof를
tracked receipt에 남긴다. `reject`는
tracked 게시 없이 종료한다. 실제 재작성 전이가 없는 `polish-retry`는 선택지로
노출하지 않는다. 결정 권한은 Reference Lab 분석 표면에
한정되고 InkOS canon 작성이나 Soul 승급 권한을 포함하지 않는다.

## 금지

- 제목 키워드나 모델 자기 분류를 장르 확정 근거로 사용
- remote-only, provider-size drift, symlink 또는 SHA 불일치 원천 사용
- tracked JSON에 raw body/prose/text/quote/excerpt 저장
- 검증된 partition·작품 결과에서 같은 차원으로 전달되지 않은 observation ID를 상위 합성 근거로 사용
- unresolved conflict가 남은 profile 후보 게시
- 도덕 적합성, 성별, 허구의 불법 자체를 장르 기본 금지나 Gold 차단으로 사용
- leak match를 자동 재작성·자동 거절하거나 private 원문을 receipt에 직렬화
- test executor나 축약 receipt로 actual-Hermes evidence gate를 우회
- Manager QA support receipt와 visibility marker를 lock·CAS 없이 교차 게시하거나 기존 bytes를 덮어쓰기
- Reference Lab이 HQ owner의 `promote` 결정을 대신 기록

## 권한 경계

- Reference Lab 산출물은 `candidate`, `analysis-only`, `no-canon`, `no-promotion`이다.
- InkOS 프로젝트·Arc·Rail·원고에 직접 쓰지 않는다. InkOS가 승인된 후보를 적용한다.
- Storyyard에는 immutable review packet만 보낼 수 있고, Storyyard 결정도 InkOS canon을 직접 변경하지 않는다.
- manager QA와 promotion eligibility는 owner 판단의 입력이며 승급 명령이 아니다.
