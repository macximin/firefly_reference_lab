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
6. `genre-soul-manager-qa/v1`: 프로필 synthesis와 다른 실제 `gpt-5.6-sol/high` run이 세 작품에서 early·middle·late 원문 sub-slice를 하나씩, 총 9개 새로 읽는다. 각 표본은 live private source selector·byte SHA에 재결속한다. profile/input/raw readback/leak 결속은 host가 먼저 증명하고 모델이 false로 뒤집으면 유효한 실패 판정이 아니라 invalid output으로 거절한다. 표본 미지지·동일/불충분 pair는 `needs-revision`, 나머지는 `pass`로 결정론적으로 계산하며 모델 선언과 다르면 거절한다. 유효 음성 판정은 immutable private decision으로 보존하며 tracked PASS marker를 만들지 않는다. 세 상업 엔진의 3개 pairwise 비교, distinct mechanism signature, exact profile/input/prompt SHA, current-attested Hermes binary·implementation·dependency·profile/project context, immutable trace·usage·result·host receipt·completion pointer와 zero-match receipt가 모두 통과했을 때만 candidate QA를 pass할 수 있다. tracked leak receipt는 target lock/no-clobber CAS 아래 먼저 게시하고 `manager-qa.json` visibility marker는 마지막에 게시·readback한다.
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
호출 전에 계획되고 run-input digest v3에 영수증으로 봉인되며 실행 직전에 exact
재검증한다. 이전 budget 계약의 미완료 run root는 audit trail로 보존하고 새 실행에
복사·수정·재사용하지 않는다.

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

표면 검사는 identity와 일반 메커니즘을 구분한다. 선정 작품 제목·저자, 직함에
결속된 인명, 식별 가능한 조직 표면은 길이가 짧아도 차단한다. 원문과 후보에
함께 나타난 맨몸 2~4음절 성씨형 표현은 코드가 의미를 추측하지 않고 private
`pending_hil` 요청으로 보낸다. 이 상태에서는 tracked 후보·누출 영수증·support·
visibility marker·top-level completion seal을 쓰지 않는다. InkOS chapter 전용
Storyyard Review Packet v2를 Reference Lab 분석 판정으로 재라벨하지 않는다.
`대기업` 같은 4-token 이하 일반 상업 메커니즘 문구는 commercial-first 원칙에
따라 짧다는 이유만으로 자동 거절하지 않는다. 조직 접미사 문맥에서 파생된 bare
stem은 반대쪽에서도 조직 전체형, 소유격, 또는 방식·전략·문화 같은 identity
귀속 문맥이 확인될 때만 조직 identity로 즉시 차단한다. 문장부호를 건넌 인접
토큰은 조직 구조로 보지 않는다. 반대쪽에 귀속 문맥이 없는 stem 단독 교차는
일반어 목록으로 의미를 추측하지 않고 `bare-organization-stem-overlap/v1`
`pending_hil` finding으로 보낸다. 성씨형 finding과 조직 stem finding은 rule별로
dedupe되어 같은 v2 request와 owner decision에 결속된다. 동일 조직
전체형, 선정 identity, 인용 표면, identifier형 Latin, 직함 결속 인명, 5-token
복사는 이 경계와 무관하게 기존 차단을 유지한다. 이 의미 변경은
`genre-soul-protected-surface-hil/v2`와 새 실행 digest를 사용한다. 완료된 v1 검토
영수증은 역사 증거로 읽을 수 있지만 v1 pending 요청·결정은 v2 판단으로 재사용하지
않는다. v2 request/decision schema는 각각
`private-genre-soul-ambiguous-surface-request/v2`와
`private-genre-soul-ambiguous-surface-decision/v2`다.

owner 결정은 request의 exact path·SHA·candidate·private source/sample digest와 모든
finding ID를 결속한다. 같은 run 재실행은 `approve`일 때만 계속 진행하며 profile은
candidate·request·decision을 top-level completion에 함께 봉인하고 Manager QA PASS는
candidate·request·approved owner decision의 bodyless exact proof를 tracked receipt에
남긴다. `reject`는
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
