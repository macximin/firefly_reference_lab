# 《법보다 주먹(개정판)》을 InkOS에서 운용하는 법과 구조 간극

## 판정

현재 InkOS는 이 작품을 **1~3화씩 실제로 쓰는 실행기**로는 쓸 수 있다. `ArcPacket`에는 약속, 목표, 장애물, 압력, 전환, 보상, 비가역 변화, 다음 훅과 회차별 비트가 있고, Writer가 active Arc와 해당 회차 비트를 원고 입력에 넣는다. 생성된 회차에는 당시 Arc와 Rail의 스냅숏도 남는다. Forecast는 여러 후보를 비교한 뒤 하나를 Arc 초안으로 바꾸며, Story Rail은 장기 목적지와 다음 제작 단위를 분리해 둔다.

하지만 이 작품에서 원문으로 발견되는 자연 사건 Arc는 대개 1~3화보다 길다. 학교 폭력과 성범죄 응징, 검사 사건, 기업·정치권 수사, 최문탁·욱일회 대결, 제주 독립처럼 하나의 지배 목표와 상대가 여러 회차에 걸쳐 압력과 반격을 축적한다. 따라서 현재 `ArcPacket`을 자연 사건 Arc라고 부르면 긴 사건이 잘리고, 자연 사건 Arc를 그대로 `ArcPacket`에 넣으면 스키마가 거부한다. 이 작품을 운영할 때는 다음 셋을 구분해야 한다.

1. **장기 Anchor**: 인생 리셋, 검사 진입, 공직 이탈, 정치 진입, 제주 독립, 국가 규모 결산처럼 작품의 방향을 돌리는 비가역 목적지.
2. **자연 사건 Arc**: 한 상대·사건·장소·독자 약속이 발단에서 사회적 결산까지 이어지는 실제 서사 단위.
3. **Production Packet**: InkOS가 한 번에 생성·검수하는 1~3화 묶음. 현재 `ArcPacket`은 이 층에 해당한다.

현재 구조를 버릴 이유는 없다. `ArcPacket`의 이름과 역할을 Production Packet으로 명확히 하고, 그 위에 자연 사건 Arc를 보정층으로 추가하는 것이 가장 작고 안전한 변경이다.

## 2026-08-13 읽기 전용 구현 확인

확인한 기준은 `/Users/a2501/Desktop/inkos`의 현재 작업트리다. InkOS 본체는 수정하지 않았고, 기존 미커밋 변경도 건드리지 않았다.

- `packages/core/src/arc/schema.ts`: `ArcPacket`은 1~3개의 연속 회차만 허용한다. 전역 약속·목표·장애물·압력·전환·보상·비가역 변화·다음 훅, 회차별 역할과 비트, 인물·관계·세계 변화, 훅 조작, 유지·회피·문체 강조를 보관한다.
- `packages/core/src/arc/forecast.ts`: 선택한 Forecast의 첫 연속 1~3비트를 Arc 초안으로 만든다. 이때 장거리 예상 변화는 정본으로 올리지 않지만 `turn`, `irreversibleChange`, `nextHook`은 빈 값으로 시작하므로 사람이 채우지 않으면 행동 장르의 결산이 마른다.
- `packages/core/src/arc/rail-schema.ts`: A-Rail은 6~12개 장기 목적지를, B-Rail은 `closed → active → provisional → hypothesis` 순서의 제작 경로를 가진다. B 하나는 실제 `ArcPacket` 하나와 결박되며 최대 3화를 담당한다.
- `packages/core/src/arc/rail-context.ts`: ready 상태, 목표 회차 스냅숏 일치, active B와 active Arc의 정확한 결박을 모두 만족해야 Rail이 Writer 입력에 들어간다.
- `packages/core/src/arc/reflow-schema.ts`와 `reflow-store.ts`: 승인된 Arc 끝에서 실제 결과, 비가역 결산, 인간적 여진, 지급·이월·폐기·신규 독자 부채를 영수증으로 남기고 다음 B를 명시적으로 고른다. 미래 B도 각각 유지·수정·은퇴를 결정해야 한다.
- `packages/core/src/agents/writer.ts`와 `pipeline/runner.ts`: active Arc가 해당 회차를 소유할 때만 입력에 주입하며, ready Rail을 쓸 때는 Arc 끝 회차 승인과 Reflow가 끝나기 전 다음 회차 생산을 막는다.
- `packages/core/src/forecast/schema.ts`, `context-builder.ts`, `prompts.ts`: 현재 Forecast 언어 계약과 프롬프트 분기는 여전히 `zh|en`이다. 한국어 Book을 독립적인 한국어 Forecast로 다루는 계약은 이 코드 표면에 완성되어 있지 않다.
- Studio에는 A/B Rail 결과를 읽기 좋은 카드로 보여 주는 `StoryRailsPreview`와 관련 API가 있다. 읽은 코드 범위에서는 자연 사건 Arc 전체와 그 아래 여러 Production Packet을 한 화면에서 편집하는 전용 표면은 확인되지 않았다.

## 현재 기능으로 바로 가능한 운영

### 1. 작품 기획서

`story_frame`, `volume_map`, 역할 카드, `book_rules`, `author_intent`, 상태 파일을 다음 정보로 채운다.

- 박동철의 출발점: 2025년의 늙은 삼류 조폭이 열아홉 살로 돌아온다.
- 장기 욕망: 검사라는 공적 힘을 얻어 법이 놓치는 악을 끝까지 응징한다.
- 반복 재미: 얕보임과 부당함 목격 → 정보·증거·주먹으로 판 설계 → 상대의 반격 → 공개된 자리에서 역전 → 피해자·군중·언론·국민이 결과를 목격 → 더 큰 적과 비용 발생.
- 핵심 관계: 조명득의 실행·해킹·친구 기능, 최은희의 사랑·대중 노출·사회적 증언 기능, 스승·검찰 동료·피해자·정치 동맹의 변화.
- 능력과 비용: 회귀 지식, 진실의 눈, 선악의 저울, 지식을 담는 뇌, ARS 통화와 기억 삭제, 자기 선악 수치의 악화.
- 금지: 실제 사건 이름과 상대를 `부패 세력`, `기관`, `보상` 같은 기능어로 바꾸지 않는다. 주먹의 승리만 쓰고 이후의 수사·평판·가족·국가 비용을 지우지 않는다.

### 2. A-Rail

A-Rail은 회차 숫자보다 비가역 상태 변화로 잡는다. 완결 원문을 역으로 옮기는 작업이라면 다음과 같은 목적지 묶음이 적합하다.

- 전교 꼴등의 학교 통이 검사 진학 궤도에 오른다.
- 검사 박동철이 사건 해결과 대중적 명성을 동시에 얻는다.
- 공직의 절차만으로는 지킬 수 없는 사람을 위해 직함 밖의 힘을 쓴다.
- 최문탁·정치권·욱일회와의 싸움이 개인 사건에서 국가 노선 대결로 커진다.
- 제주가 독립 가능한 산업·안보·여론 기반을 갖춘다.
- 제주민국과 통일·에너지 질서가 성립하며 1부의 국가 규모 약속이 결산된다.
- 외전과 2부에서는 되감긴 시간대의 사건·증거·조직 뿌리를 다시 파고드는 별도 시즌 목적지를 둔다.

실제 새 작품 집필에서는 6~12개만 유지하되 가까운 두 Anchor만 구체적으로 쓰고 먼 목적지는 상태 변화와 독자 부채만 남긴다. 이 원칙은 현재 A-Rail의 `compound|sparse` 구분과 잘 맞는다.

### 3. 1~3화 Production Packet

매 Packet에는 반드시 다음을 실제 고유명사로 적는다.

- 이번 1~3화에서 박동철이 맞서는 사람과 제도.
- 어느 장소에서 어떤 행동을 하고 무엇을 빼앗기거나 위험에 거는지.
- 법적 절차, 언론전, 조명득의 비공식 작전, 직접 폭력이 각각 어디까지 허용되는지.
- 이번 Packet에서 바로 지급할 작은 보상과 자연 사건 Arc 끝까지 미룰 큰 결산.
- 이 장면을 누가 목격하며, 목격 전후 박동철과 상대에 대한 인식이 어떻게 달라지는지.
- 주먹 또는 편법을 쓴 뒤 남는 기억·평판·가족·직위·외교 비용.

`episodeBeats`는 줄거리 세 줄이 아니라 장면 순서를 담아야 한다. 예를 들어 `피해자 진술 확보 → 상대가 법률·권력으로 무력화 → 조명득이 숨은 경로를 연다 → 공개된 자리에서 증거와 주먹이 함께 터진다 → 피해자 또는 군중 반응 → 더 큰 배후 훅`처럼 기록한다.

### 4. 생성 뒤 검수와 Reflow

원고 승인 전 검수는 사실 일치만 보지 않는다.

- 약속한 상대와 장소가 실제 장면에 등장했는가.
- 회차 안에 독자가 체감할 작은 지급이 하나 이상 있는가.
- 큰 결산을 유예했다면 압력이나 새 정보가 실제로 증가했는가.
- 폭력 장면 뒤 피해자·동료·언론·군중 반응이 있어 사회적 목격이 완성됐는가.
- 박동철의 승리가 다음 비용을 만들었는가, 아니면 세계가 공짜로 굴복했는가.
- 끝 훅이 막연한 불길함이 아니라 다음 사람·장소·증거·결정 중 하나를 가리키는가.

Reflow의 `readerDebt.paid/carried/retired/emerged`는 이 작품에 특히 잘 맞는다. 다만 Production Packet 종료 영수증과 자연 사건 Arc 종료 영수증을 따로 보관해야 한다. 전자는 1~3화의 실행 결과, 후자는 상대 패배·사회적 인정·비가역 지위 변화와 장기 비용을 결산한다.

## 구조 개선이 필요한 부분

### 1. `EventArc` 부모 객체

다음과 같은 별도 객체를 제안한다.

```ts
interface EventArc {
  id: string;
  title: string;
  status: "planned" | "active" | "closed";
  startChapter?: number;
  endChapter?: number;
  dominantGoal: string;
  opponents: string[];
  locations: string[];
  incitingIncident: string;
  centralQuestion: string;
  pressureLadder: string[];
  midTurns: string[];
  publicSettlement: string;
  irreversibleChange: string;
  residualCosts: string[];
  nextBridge: string;
  packetIds: string[];
}
```

`ArcPacket`에는 `eventArcId`와 `packetOrder`를 추가한다. 자연 사건 Arc의 길이는 고정하지 않고, 여러 Packet이 같은 목표·상대·독자 약속을 향해 움직이게 한다. 그러면 원문의 실제 경계를 보존하면서 1~3화 생산 안정성도 유지된다.

### 2. 장면 단위 계약

현재 `beats: string[]`만으로는 행동 장르의 체감 속도를 계획하거나 사후 비교하기 어렵다. 각 비트를 다음처럼 구조화한다.

```ts
interface SceneBeat {
  sceneId: string;
  place: string;
  presentCharacters: string[];
  objective: string;
  opposition: string;
  actionOrProof: string;
  witnesses: string[];
  immediatePayoff: string;
  incurredCost: string;
  stateDelta: string;
  exitHook: string;
  expectedShare: number;
}
```

`expectedShare`는 글자 수 강제가 아니라 회차 안 체류 비중이다. 응징 장면을 두 줄로 급히 넘기거나, 작전 설명이 결산보다 길어지는 문제를 생성 전후에 비교할 수 있다.

### 3. 보상과 비용의 이중 장부

`payoff` 하나로는 이 작품을 설명할 수 없다. `immediatePayoffs[]`, `deferredPayoffs[]`, `residualCosts[]`를 분리한다. 같은 승리도 학교 군중의 환호, 합의금, 피해자의 안도, 검사 조직의 인정, 대중 지지율처럼 종류가 다르다. 비용도 기억 삭제, 선악 수치 악화, 가족 위험, 직위 상실, 적의 규모 상승을 따로 추적해야 한다.

### 4. 사회적 목격 장부

박동철의 주먹은 혼자 이기는 장면보다 누군가가 보았을 때 더 큰 보상이 된다. `witnessSurface`에 목격자, 공개 채널, 도달 범위, 목격 전 인식, 확인한 증거, 목격 후 인식, 상대의 반론을 기록한다. 교실·경찰서·법정·기자회견·인터넷 댓글·촛불 군중·국민투표·국제 뉴스는 서로 다른 보상 반경을 가진다.

### 5. 830화 장편의 Rail 용량

현재 ready B-Rail은 목표 회차 전체를 3화 상한으로 덮어야 한다. 목표가 830화라면 최소 277개의 live/closed B가 필요하다. 이는 스키마상 가능하더라도 사람이 읽고 수정할 장기 기획표로는 지나치게 크며, 자연 사건 경계를 다시 숨긴다. 해결은 `EventArc` 아래 Packet을 필요할 때만 펼치거나, 먼 구간에 `packetBudgetRange`를 둬 구체 Packet을 가까운 구간에서만 생성하는 것이다. 미래 장면을 정본처럼 고정하지 않는 현재 원칙은 유지한다.

### 6. 한국어 Forecast 경로

현재 Forecast 타입과 프롬프트가 `zh|en`으로 남아 있다. `ko`를 타입, 컨텍스트 제목, 프롬프트, 수선 프롬프트, fixture에 추가해야 한다. 한국어 Book이 중국어 분기로 떨어지지 않는 테스트도 필요하다. 이 작품처럼 고유명사와 제도 설명이 많은 원고에서 언어 fallback은 이름·호칭·문장 리듬을 쉽게 흐린다.

## 구조를 바꾸지 않고 보정층으로 해결할 부분

- Packet 제목을 기능명이 아니라 `최은희를 구한 밤과 천만 원 역합의`처럼 사건형으로 쓴다.
- `mustKeep`에 인물·장소·증거·보상·목격자를 넣고, `mustAvoid`에는 공짜 승리·목격 없는 응징·비용 없는 권력 확대를 넣는다.
- `styleEmphasis`에 박동철의 1인칭 판단, 조명득과의 짧은 티키타카, 행동 직전의 압축, 결산 뒤 대중 반응을 회차별로 다르게 지정한다.
- `hookOperations`는 `박세출의 거짓말이 드러남`, `욱일회 회주가 직접 움직임`처럼 닫힌 훅과 열린 훅을 함께 적는다.
- `relationshipChanges`는 단순 호감 상승이 아니라 `최은희가 보호받는 인물에서 여론을 움직이는 공동 실행자로 바뀜`처럼 행동권 변화를 쓴다.
- Forecast 후보를 선택한 직후 빈 `turn`, `irreversibleChange`, `nextHook`을 사람이 확정하기 전에는 `ready`로 올리지 않는다.

## 권장 작업 순서

1. 기획서에서 인물·능력·조직·반복 재미·결말 가설을 고정한다.
2. A-Rail에 6~12개 비가역 목적지를 둔다.
3. 현재 목적지까지의 자연 사건 Arc 하나를 선택하고 상대·장소·결산·잔여 비용을 적는다.
4. 그 EventArc의 다음 1~3화만 Production Packet으로 만든다.
5. 각 회차를 장면 비트로 나누고 즉시 보상과 종료 훅을 확정한다.
6. Writer 생성 후 장면 체류 비중, 사회적 목격, 보상·비용 장부를 검수한다.
7. 승인된 Packet을 Reflow하고 EventArc 장부에 실제 결과를 누적한다.
8. 상대·목표·장소·비가역 상태 중 둘 이상이 바뀔 때 EventArc를 닫고 다음 사건을 연다.

이렇게 운용하면 InkOS의 강점인 작은 생산 단위·승인·상태 추적을 살리면서도, 《법보다 주먹(개정판)》의 실제 행동 장르 Arc를 1~3화 공식으로 오해하지 않게 된다.
