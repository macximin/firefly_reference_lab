# Genre Soul study contract v1

이 계약은 현대판타지·판타지·무협 Soul의 원문 독해와 승급 증거를 분리한다.
원문은 `private_sources/`와 ignored `exports/`에만 존재하며 tracked 산출물에는
source ID, UTF-8 byte 범위, SHA-256, 파생 관찰과 판정 영수증만 둔다.

## 단계

1. `genre-soul-source-inventory/v1`: Drive 직계 남성향 398개와 여성향 제외 374개를 고정한다.
2. `genre-soul-survey/v1`: manager가 확정한 장르 후보 전부에 reader run과 읽은 byte 범위를 남긴다.
3. `genre-soul-deep-read/v1`: 앵커별 `0..sourceSizeBytes` gap-free 전수 범위와 실제 `gpt-5.6-sol/high` readback을 남긴다.
4. `genre-soul-analysis-profile/v1`: 세계 제약, 주인공 반복 동사, 압박·적대, 보상·지위 통화, 다음 행동, 상업 엔진만 합성한다.
5. `tracked-projection-leak-scan/v1`: 전체 available corpus에 대해 exact 12-token과 120 UTF-8 byte 공통 표면을 검사한다.
6. `genre-soul-manager-qa/v1`: coverage와 zero-match receipt가 모두 통과했을 때만 manager가 pass할 수 있다.
7. `genre-soul-promotion-eligibility/v1`: 장르당 전수 독해 3편, Review Packet v2, 독립 blind pair 3개와 상업 기준을 집계한다. 이 파일은 owner 승급 결정을 소유하지 않는다.

## 금지

- 제목 키워드나 모델 자기 분류를 장르 확정 근거로 사용
- remote-only, provider-size drift, symlink 또는 SHA 불일치 원천 사용
- tracked JSON에 raw body/prose/text/quote/excerpt 저장
- 도덕 적합성, 성별, 허구의 불법 자체를 장르 기본 금지나 Gold 차단으로 사용
- leak match를 자동 재작성·자동 거절하거나 private 원문을 receipt에 직렬화
- Reference Lab이 HQ owner의 `promote` 결정을 대신 기록
