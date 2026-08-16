# InkOS 사용·구조 개선 보고서

## 1. 판정

`고려는 천조국이 되기로 하였습니다`는 현재 InkOS의 **기획서 → A/B Rail → 1~3화 ArcPacket → 회차 원고 → 감리·정산 → reflow** 흐름으로 집필할 수 있다. 특히 이미 구현된 `openingState`, `promise`, `goal`, `obstacle`, `pressure`, `turn`, `payoff`, `irreversibleChange`, `nextHook`과 회차별 `episodeBeats`는 왕기의 작전 계획을 실제 원고 입력으로 내리는 데 유용하다. 생성 당시 Arc와 Rail의 내용을 회차 메타데이터에 스냅샷으로 보존하고, 승인된 회차와 상태 영수증을 확인한 뒤에만 B-Rail을 닫는 방식도 장편의 정본 관리에 잘 맞는다.

그러나 이 작품에서 원문상 자연스럽게 닫히는 사건 Arc는 흔히 4화 이상이며, 한 사건 안에서 정책·기술·첩보·외교·전쟁·민생이 서로 다른 시간차로 결산된다. 현행 `ArcPacket`을 자연 사건 Arc라고 부르면 원문 구조가 잘린다. 가장 안전한 운용은 **자연 사건 Arc를 중간 묶음인 `Campaign`으로 보존하고, 현행 ArcPacket은 그 안의 1~3화 제작 패킷으로 유지하는 것**이다. `Campaign`은 코드의 기존 Arc를 대체하는 새 본체가 아니라, A-Rail과 B-Rail 사이에 놓이는 보정층이어야 한다.

또 하나의 선결 조건이 있다. 2026-08-13 현재 읽기 전용 확인에서 `BookConfigSchema`, `NarrativeForecastSchema`, Forecast 컨텍스트와 프롬프트의 언어 계약은 여전히 `zh | en`이다. Studio의 Forecast 선택 문구와 일부 문체 분석에는 `ko` 분기가 있지만, 권위 스키마가 한국어 작품을 허용하지 않는다. 따라서 이 작품을 한국어 정본으로 실제 운영하기 전에는 Book·Forecast·프롬프트·길이 계산까지 이어지는 `ko` 경로를 먼저 완성해야 한다.

## 2. 확인한 현재 구현

이번 판단은 `/Users/a2501/Desktop/inkos`를 수정하지 않고 다음 구현을 직접 읽어 내렸다.

- `packages/core/src/arc/schema.ts`: Arc는 1~3개의 연속 회차만 소유한다. 회차 역할은 `promise`, `pressure`, `turn`, `payoff` 중 하나이고, 인물·관계·세계 변화와 훅·유지·금지·문체 강조를 문자열 배열로 가진다.
- `packages/core/src/arc/forecast.ts`: Forecast의 첫 연속 1~3개 비트를 Arc 초안으로 바꾸며, 선택만으로 원고나 정본 상태를 덮어쓰지 않는다. Writer에 주입되는 Arc 문맥과 회차 메타데이터용 provenance도 여기서 만든다.
- `packages/core/src/arc/rail-schema.ts`: A-Rail은 6~12개의 장기 비가역 목적지, B-Rail은 ArcPacket 경로다. A에는 `humanAftermath`, `readerDebt`, `payoffAxis`, `nextPressure`가 있고 B에는 `narrativeFunction`, `payoffAxis`, `carriedReaderDebt`, `contrastRequirement`가 있다.
- `packages/core/src/arc/rail-context.ts`: 두 Rail이 모두 `ready`이고, 목표 회차 스냅샷과 현재 Book 길이가 같고, 활성 B와 활성 Arc가 정확히 결합돼야만 원고 생성에 Rail 문맥이 들어간다.
- `packages/core/src/arc/reflow-schema.ts`와 `reflow-store.ts`: 승인·발행 회차, 원고 해시, 상태 스냅샷, truth receipt를 다시 검증한 뒤에만 실제 결과·비가역 결산·인간적 여진·독자 빚을 기록하고 다음 B를 활성화한다. 실패나 불일치는 정본을 바꾸지 않는다.
- `packages/core/src/agents/planner.ts`, `planner-prompts.ts`, `writer.ts`, `continuity.ts`: 활성 Arc는 Planner와 Writer에 종속 권위로 주입되고, Continuity 감리도 회차 이탈을 확인한다. 사용자 지시·Book 정본·하드 규칙보다 Arc가 앞서지 않는 우선순위도 명시돼 있다.
- `packages/core/src/forecast/schema.ts`, `context-builder.ts`, `prompts.ts`와 `packages/core/src/models/book.ts`: Forecast는 2~5개 비정본 분기, 최대 10화 전망, fingerprint 기반 stale 검사를 지원한다. 반면 언어는 `zh | en`에 고정돼 있다.
- `packages/studio/src/components/chat/StoryRailsPreview.tsx`: A/B Rail과 수용량, 결합 상태, pending reflow를 카드로 볼 수 있고 한국어 표시 문자열도 있다. 다만 독립적인 Arc 타임라인·Campaign 편집기나 다축 페이싱 편집기는 확인되지 않았다.

## 3. 이 작품을 현행 InkOS로 운영하는 구체적 방법

### 3.1 기획서 층

`Book = 작품`, `Chapter = 연재 회차`를 그대로 둔다. `story/outline/story_frame.md`에는 왕기가 1354년에 두 번째 기회를 얻어 부원배의 권력과 원의 종속 구조를 끊고, 백성이 외세와 수탈을 두려워하지 않는 고려를 만든다는 장기 약속을 적는다. 결말 목표는 막연한 부국강병이 아니라 **원 제국을 무너뜨린 고려 제국의 황제로서 국내 제도와 2세대 관료·무장을 안정시키고, 노국공주의 행방을 좇아 서유럽 친정을 결정하는 상태**로 둔다.

`volume_map.md`에는 회차를 미리 빽빽하게 처방하기보다 다음 장기 목적지를 둔다.

1. 기철 일파를 제거하고 이제현·최영을 양축으로 자주 개혁 정부를 세운다.
2. 화약·화포·의학·상공업과 군제 개편을 실제 국력으로 전환한다.
3. 쌍성총관부와 금야를 회복하고 여진을 적이 아닌 고려의 군사·생활권으로 묶는다.
4. 압록강을 넘어 요양·심양을 손에 넣고 원의 동쪽 지배를 끊는다.
5. 귀환 후 농업·초석·과거제·호적·구휼을 정비해 정복을 감당할 나라를 만든다.
6. 대마도와 규슈에서 왜구를 징벌하되 노예 해방·채무 소각·세율 인하로 민심까지 얻는다.
7. 일본의 두 조정을 상호 견제시키고 이와미 은광 등 자원을 고려의 다음 성장 동력으로 바꾼다.
8. 중원 군웅을 거래·분열·포섭해 원 황제군과의 결전을 준비한다.
9. 90만 원군을 꺾고 대도를 차지한 뒤, 20년 후 안정된 제국과 노국공주 추적을 다음 길로 남긴다.

인물 카드는 왕기, 정영, 최영, 이제현, 최무선, 장영소, 이인복, 이성계, 퉁두란, 아라부카를 우선한다. `Current_State`에는 직위만 쓰지 말고 “누구를 믿으며 무엇을 아직 두려워하는가”를 적는다. 왕기는 정영에게는 생활과 비밀을 맡기고, 최영에게는 전장의 독자 판단을 맡기며, 이제현에게는 자신의 위험한 구상을 반박할 권한까지 준다. 이 관계 차이가 원고의 대화를 살린다.

### 3.2 Rail 층

A-Rail에는 위 아홉 목적지를 9개 Anchor로 만들 수 있다. 각 Anchor의 `irreversibleChange`에는 영토 이름이나 제도명을 넣고, `humanAftermath`에는 반드시 사람을 둔다. 예컨대 규슈 Anchor의 변화는 “규슈 확보”가 아니라 “미야자키가 자기 노예 증서를 직접 불태우고, 주변 농민들이 5할 세율 소식을 듣고 후쿠오카로 움직인다”여야 한다. 원 제국 붕괴 Anchor도 “패권 획득”보다 “만종과 개동을 비롯한 병사들이 살아남아 왕기의 약속을 듣고 대고려 만세를 외친다”가 먼저다.

현행 B-Rail을 그대로 쓴다면 각 B는 1~3화 ArcPacket 하나와 대응시킨다. 먼 B에는 `hypothesis`, 바로 다음 하나에는 `provisional`, 현재 하나에는 `active`를 사용한다. 다만 `ready` B-Rail은 목표 280화를 3화 상한으로 모두 덮어야 하므로 최소 94개 항목이 필요하다. 실제 운용에서는 94개의 빈약한 예측을 한꺼번에 정본처럼 보이게 만들 위험이 있다. 구현을 고치기 전 임시 방편은 다음 둘뿐이다.

- 94개 B를 만들되 현재·다음 Campaign 이외에는 사건을 확정하지 않고 `payoffAxis`, `carriedReaderDebt`, `contrastRequirement`만 성긴 가설로 적는다.
- B-Rail을 `draft`로 두고 기존 Book → Chapter 흐름을 사용한다. 이 경우 Forecast 비교에는 Rail이 보이지만, Writer에는 ready Rail 문맥이 주입되지 않는다는 한계를 감수한다.

둘 다 불편하므로 장기적으로는 전체 Book 수용량 대신 **rolling coverage**를 허용해야 한다. “현재 B + 다음 provisional B + 이후 2~4개 hypothesis가 적어도 12화 또는 한 Campaign을 덮으면 ready” 같은 계약이 이 작품에 더 맞다.

### 3.3 Campaign과 ArcPacket

자연 사건 Arc를 `Campaign`으로 둔다. 예를 들어 “후쿠오카 노예문서 소각과 5할 세율” Campaign은 전쟁에서 이긴 뒤 민심을 얻는 211~214화의 하나의 결산이지만, 현행 ArcPacket 상한에는 들어가지 않는다. 이를 다음처럼 두 패킷으로 나누면 된다.

- Packet A, 211~212화: 다자이후 문서를 무기로 읽고, 미야자키에게 노예 증서를 직접 태우게 하며 채무 소각·5할 세율을 선포한다. 지급은 한 개인의 자유와 광장의 만세다.
- Packet B, 213~214화: 해방 소식이 인근 마을과 양 조정으로 번지고, 농민의 귀부·패잔병 제보·적 조정의 강경 대응으로 전쟁 조건 자체가 바뀐다. 지급은 정책이 군사 정보와 민심 우위로 환전되는 장면이다.

두 Packet은 각각 완결성을 가지지만 `campaignId`, `campaignPromise`, `campaignQuestion`, `campaignPayoff`, `carriedInputs`를 공유해야 원래 사건의 몸통이 보존된다. 같은 방식으로 화약 개발은 연구 패킷, 공개 시험 패킷, 전장 검증 패킷이 멀리 떨어져도 하나의 기술 계보로 연결돼야 한다.

### 3.4 Forecast와 회차 생성

Forecast의 분기점은 “다음에 어느 나라를 칠까” 같은 거시 선택만으로 만들지 않는다. 이 작품에는 다음처럼 서로 다른 비용 구조를 비교하는 것이 유용하다.

- 정면전: 빠른 영토 보상, 큰 화약·병력 비용, 외교 명분 약화.
- 내부 분열: 느린 행동 보상, 첩보·외교 비중 증가, 아군 피해 감소.
- 민생 선점: 즉각적인 전투는 적지만 피점령지 협조와 보급 우위를 획득.

선택한 Forecast는 초안 Arc가 되므로 사람이 다음을 보완한 뒤 `ready`로 올린다. 실제 고유명사, 현장 장소, 이번 화의 목격자, 소모할 물자, 정책·기술의 이전 입력, 적이 학습하는 내용, 이번 화에 당장 지급할 작은 보상, Campaign 결산으로 이월할 독자 빚이다. 자동 변환은 현재 `turn`, `irreversibleChange`, `nextHook`과 변화 배열을 비운 채 초안을 만들기 때문에 그대로 생성하면 안 된다.

### 3.5 생성 후 감리와 reflow

회차 감리는 단순히 “Arc 비트가 들어갔는가”만 확인하면 안 된다. 다음 다섯 문장을 원고에서 인용하지 않고 장면 위치로 증명해야 한다.

1. 왕기의 결정이 누구의 행동을 바꾸었는가.
2. 기술이나 정책이 설명에 머물지 않고 어느 현장에서 작동했는가.
3. 국가의 이득을 누가 보고·만지고·먹고·두려워했는가.
4. 이번 승리에 실제로 소모된 화약·병력·시간·신뢰는 무엇인가.
5. 적 또는 백성이 다음에는 다르게 행동할 이유가 생겼는가.

승인된 회차가 Arc 끝에 도달하면 현행 reflow의 `actualOutcome`, `irreversibleSettlement`, `humanRemainder`, 독자 빚의 `paid/carried/retired/emerged`를 적극 사용한다. 계획보다 전투가 빨리 끝났다면 빈 회차를 억지로 쓰지 말고 실제 endpoint로 닫는다. 반대로 정책의 현장 효과가 아직 나오지 않았다면 “정책 발표”를 결산으로 오인하지 말고 독자 빚을 다음 Packet으로 넘긴다.

## 4. 현재 구조로 충분한 부분

- Arc가 Book 정본과 사용자 지시보다 아래에 있는 종속 권위라는 원칙은 옳다. 왕기의 미래 지식이 있다고 해서 이미 쓴 전쟁 결과를 Forecast가 바꿔서는 안 된다.
- 연속 회차, 정확한 회차별 비트, ending hook, mustKeep/mustAvoid/styleEmphasis는 1~3화 생산 단위에 충분하다.
- 인물·관계·세계 변화 배열은 최영의 자율권 확대, 장영소의 제후화, 여진 세력의 동맹화 같은 변화를 원고에 주입할 수 있다.
- Forecast의 비정본 분기와 stale 검사는 장편에서 “예전에 골라둔 미래”가 새 원고 뒤에도 유효한 척하는 문제를 막는다.
- A-Rail의 `humanAftermath`와 `readerDebt`, reflow의 `humanRemainder`는 거시 결과를 사람에게 돌려주는 핵심 자리가 이미 마련돼 있다는 뜻이다.
- 승인·발행 상태, 원고 해시, 상태 스냅샷과 truth receipt가 모두 맞아야 Rail을 닫는 방식은 장기 연재의 사실 관계를 지키는 강한 장치다.
- 기존 Book → Chapter 경로가 Rail 손상이나 부재 때문에 막히지 않는 fail-open 선택도 실제 집필 도구로서 타당하다.

## 5. 구조 개선이 필요한 부분

### 5.1 한국어 권위 계약

가장 먼저 Book, Genre, Forecast, Agent prompt, context renderer, 분량 계산의 언어 유니언에 `ko`를 일관되게 넣어야 한다. Studio 버튼만 한국어인 상태는 이 작품을 한국어 작품으로 저장·예측한다는 뜻이 아니다. 한국어 Forecast JSON 예시, 한국어 repair prompt, 한국어 section heading, 한국어 테스트 fixture가 함께 필요하다.

### 5.2 자연 사건 Arc와 제작 Packet의 분리

1~3화 상한은 원고 생산에는 좋지만 작품 분석의 자연 Arc와 동일하지 않다. `Campaign` 또는 `StoryArcGroup`을 추가해 여러 B/ArcPacket을 묶고 다음 필드를 둔다.

```text
id, title, startChapter, plannedEndRange, status
openingState, concretePremise, centralQuestion, campaignPromise
threads[policy|technology|war|diplomacy|livelihood|relationship]
requiredReceipts, humanWitnesses, residualCosts, finalPayoff, nextCampaignBridge
packetIds, sourceAnchorId
```

`plannedEndRange`는 고정 끝 회차가 아니라 2개의 경계 신호가 충족될 때 닫히는 범위여야 한다. 이러면 “화약 완성”과 “화약으로 성을 함락”을 같은 기술 계보로 묶되, 각각은 독립 Packet 보상을 가진다.

### 5.3 국가 성장 인과 원장

현재 `worldChanges: string[]` 하나로는 국가 성장의 입력과 결과가 뭉개진다. 별도 `NationalProgressLedger`를 두고 최소한 다음 축을 구조화해야 한다.

- 정책·법: 사병 철폐, 노비·채무·세율, 과거제와 호적.
- 기술·생산: 초석 밭, 화약 조성, 화포, 함선, 비료, 농법.
- 군사: 편제, 교리, 병종, 보급, 훈련, 사상자와 전리품.
- 외교·정통성: 원 황실, 장사성, 여진, 일본 남북조와의 약속·명분·배신 위험.
- 재정·자원: 환수 재산, 대운하 물자, 유황·초석·금·은, 토지와 노동력.
- 민생·행정: 세율, 면천, 구휼, 의료, 식량, 이주, 점령지 협조.

각 변화에는 `introducedAt`, `fundedBy`, `implementedBy`, `fieldTestedAt`, `witnessedBy`, `measuredEffect`, `cost`, `enemyAdaptation`, `nextUse`를 붙인다. 숫자를 모르면 빈칸으로 두되 “증가했다”를 근거 없이 확정하지 않는다.

### 5.4 계획 페이싱과 실제 페이싱의 비교

현행 Arc에는 장면 비트만 있고 긴장·보상·훅 및 정보·행동·관계·감정·물질/지위 비중을 비교하는 표면이 없다. 각 회차에 `plannedPacing`과 승인 후 `observedPacing`을 1~10 또는 낮음/중간/높음으로 두고 차이를 보여줘야 한다. 이 작품은 설명 회차가 나쁜 것이 아니라, 설명이 곧 사람·물건·시험·협상으로 변환되지 않을 때 느려진다. 그러므로 “정보량이 높다”를 경고하기보다 “현장 영수증 없이 정보만 2화 연속”일 때 경고해야 한다.

### 5.5 전체 수용량 강제의 완화

`targetChaptersSnapshot=280`, `arcEpisodeCap=3`이면 미래 B가 최소 94개 필요하다. 장기 계획을 검증한다는 취지는 좋지만, 불확실한 후반을 세밀한 가설 90여 개로 채우면 오히려 허위 정밀도가 커진다. `coverageMode: full | rolling`을 추가하고 rolling은 현재 Campaign 끝과 다음 Anchor까지의 최소 창만 검증하는 편이 낫다. 과거 B의 불변성·tombstone·reflow 영수증은 그대로 유지할 수 있다.

## 6. 별도 보정층이 더 적절한 부분

모든 것을 Arc 스키마에 넣으면 제작 패킷이 다시 거대해진다. 다음은 별도 보정층으로 두는 편이 낫다.

- `Campaign`: 자연 사건 Arc의 몸통과 여러 Packet의 결산을 묶는다.
- `NationalProgressLedger`: 정책·기술·자원·행정의 장기 인과를 추적한다.
- `PayoffReceipt`: 거시 변화가 실제 인물과 장소에서 체감된 장면을 기록한다.
- `PacingOverlay`: 계획/실제 긴장·보상·훅과 다섯 비중을 비교한다.
- `AdaptationDebt`: 적이 고려의 화력·외교술·민심 공략을 학습한 정도와 다음 대응을 기록한다.

이 층들은 Book 정본을 자동 변경하지 않아야 한다. 승인된 Chapter settlement가 증거를 만들고, 사용자가 Campaign closeout에서 채택해야 원장에 반영되는 구조가 안전하다.

## 7. 필요한 UI·프롬프트·감리 장치

UI에는 A-Rail 아래에 Campaign 띠, 그 아래에 1~3화 Packet 카드, 맨 아래 Chapter를 한 화면에 보이는 계층 타임라인이 필요하다. Campaign 카드에는 기술·정책·전쟁·외교·민생 선이 색으로 구분돼 들어오고 나가야 한다. 같은 기술의 “도입 → 투자 → 시험 → 전장 검증 → 민생 전용”을 눌러 따라갈 수 있어야 한다. 단순 상태 배지보다 **어느 화의 누구에게 무엇이 달라졌는가**를 바로 보여주는 영수증 패널이 중요하다.

Planner 프롬프트에는 다음 지시를 추가한다.

> 이번 회차에서 국가 규모의 결정을 하나 넣었다면, 같은 회차 또는 예약된 후속 회차에 그 결과를 체감할 이름 있는 인물과 장소를 지정하라. 정책·기술 설명을 지급으로 계산하지 말고, 실제 선택·시험·승패·소유·생존·식사·이동·호칭 변화가 일어난 때 지급으로 기록하라.

Writer에는 `carriedInputs`와 `requiredReceipt`만 짧게 주입한다. 원장 전체를 넣으면 설명문이 늘어난다. Auditor에는 다음 세 검사를 추가한다.

- `orphan innovation`: 발명·정책이 도입됐지만 이후 시험·사용·체감 예약이 없음.
- `unearned scale jump`: 재정·보급·인력·외교 비용 없이 국력이 한 단계 상승함.
- `faceless payoff`: 승전·영토·수익 결산은 있으나 이름 있는 목격자와 현장 변화가 없음.

경고는 자동 실패가 아니라 해당 원고 구간과 보완 선택지를 제시해야 한다. 예컨대 “은광 확보를 설명으로 끝냄”에는 채굴 현장, 급료를 받은 병사, 국고 장부를 본 이제현, 은 유입을 경계하는 적 상인 중 어떤 장면을 추가할지 고르게 한다.

## 8. Arc별 페이싱 계획과 생성 후 보정

Campaign을 열 때 큰 결산 하나, 중간 지급 2~4개, 다음 Campaign으로 넘길 비용 하나를 먼저 정한다. 각 Packet에는 최소 하나의 즉시 지급을 둔다. 이 작품의 안정적인 순서는 “판단 또는 약속 → 손으로 만지는 준비 → 상대의 대응 → 현장 시험 → 사회적 목격 → 비가역 결산 → 더 큰 압력”이다. 모든 요소를 매번 넣는 것이 아니라, 누락된 층이 다음 Packet에 예약되어 있는지를 본다.

생성 후에는 회차의 실제 장면을 기준으로 점수를 다시 매긴다. 계획보다 정보가 높고 행동·관계가 낮으면 설명을 줄이는 데서 끝내지 말고, 정보를 전달하는 주체와 이해관계를 장면에 넣는다. 보상이 너무 빨리 나왔다면 다음 적의 적응이나 자원 비용을 앞당긴다. 긴장은 높은데 지급이 두 화 이상 없으면 병사의 생존, 상인의 거래, 백성의 면천, 신하의 인정처럼 큰 승리 전의 작은 확정을 준다. 반대로 큰 승전 뒤에는 곧바로 더 센 적만 던지지 말고 논공·치료·장부·귀환·식사 같은 여진 장면으로 국가 성장을 사람의 몸에 정착시킨다.

이 방식이면 거시 성취가 추상 통계로 마르지 않는다. 화약은 최무선의 손과 포대의 굉음으로, 정책은 미야자키가 태우는 문서와 농민의 이동으로, 영토는 장영소의 새 지위와 병사의 토지로, 제국의 승리는 만종·개동을 알아보는 왕기의 목소리로 지급된다. 그것이 이 작품을 InkOS에서 재현할 때 지켜야 할 가장 중요한 생산 규칙이다.
