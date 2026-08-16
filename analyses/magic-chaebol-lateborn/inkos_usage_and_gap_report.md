# `마법 배운 재벌집 늦둥이`를 InkOS에서 운용하는 법과 구조 간극

## 판정 요약

이 작품은 현재 InkOS의 `기획서 → ArcPacket → 회차 원고` 흐름으로 **회차 생산**은 가능하다. 그러나 원작에서 자연스럽게 닫히는 사건 Arc와 InkOS의 1~3화 `ArcPacket`을 같은 객체로 취급하면, 사업 준비·마법 적용·공개 검증·사람의 인정까지 이어지는 보상 사슬이 중간에서 잘린다.

권장안은 `ArcPacket`의 1~3화 제작 단위를 없애는 것이 아니다. 그 위에 가변 길이의 `NarrativeArc`를 두고, 하나의 실제 사건 Arc를 여러 제작 Packet으로 나눈다. 이 작품에서 중요한 것은 Packet 개수가 아니라 다음 연쇄가 한 덩어리로 보존되는가이다.

> 실제 결핍 또는 사업 문제 → 미래 정보·협상·조직 동원 → 마법의 선택·산업화 → 수치로 확인되는 성과 → 밥상·호칭·몸짓·자리·인사권으로 확인되는 인정 → 새 사업과 다음 서클 압력

## 확인한 현재 구현 표면

2026-08-13에 `/Users/a2501/Desktop/inkos`를 읽기 전용으로 확인했다. 구현 변경은 하지 않았다.

- `packages/core/src/arc/schema.ts`: `ArcPacket`은 정확히 1~3개의 연속 회차만 허용한다. `openingState`, `promise`, `goal`, `obstacle`, `pressure`, `turn`, `payoff`, `irreversibleChange`, `nextHook`, 인물·관계·세계 변화, `mustKeep`, `mustAvoid`, `styleEmphasis`는 이 작품을 가까운 회차 단위로 쓰기에 유용하다.
- `packages/core/src/arc/rail-schema.ts`: A-Rail은 장기 불가역 목적지와 `humanAftermath`, `readerDebt`, `payoffAxis`, `nextPressure`를 가진다. B-Rail은 가까운 Arc 경로와 `payoffAxis`, `carriedReaderDebt`, `contrastRequirement`를 가진다. 장기 보상과 다음 압력을 잇는 뼈대로 사용할 수 있다.
- `packages/core/src/arc/reflow-schema.ts`: 완료된 B를 실제 결과로 닫을 때 `humanRemainder`, 지급·이월·폐기·신규 독자 부채를 남길 수 있다. 원고가 계획과 달라졌을 때 회수하는 장치로 적합하다.
- `packages/core/src/arc/forecast.ts`: Forecast 후보에서 첫 연속 1~3화만 골라 Arc 초안을 만들며, 생성 시 `turn`, `irreversibleChange`, `nextHook`, 인물·관계·세계 변화가 비어 있다. 3화 Packet의 역할도 `promise → pressure → payoff`로 고정돼 `turn`이 별도 역할로 배치되지 않는다.
- `packages/core/src/forecast/schema.ts`: 저장 스키마의 언어가 아직 `zh | en`이다. Studio의 선택 지시문은 `ko`를 받을 수 있어, 한국어 UI와 저장 계약 사이에 불일치가 있다.
- `packages/studio/src/components/chat/StoryRailsPreview.tsx`: Rail과 결합 상태를 읽어 보여 주지만 `actualEpisodeCount`와 route capacity 역시 1~3화 상한을 전제한다.

## 현재 구조로 충분한 부분

### 가까운 1~3화 제작 Packet

다음과 같이 한 번의 약속과 결산이 가까이 있는 구간은 현 `ArcPacket`에 잘 들어간다.

- 1~3화: 몰락·회귀·메모라이즈를 받은 도겸이 기말 성적과 학생주임 대면을 거쳐 아침 식탁에서 조문홍에게 검정고시 허락을 받는다.
- 4~6화: 유말숙에게 10억 원을 빌리고, 황연우를 영입하고, 슬립으로 외할머니와 병원 VIP의 실제 불면을 해결한다.
- 7~9화: 영보철강 공매도의 불안을 견뎌 약 5억 원을 벌고, 황연우 부모의 검진·용종 발견으로 고용 관계를 충성 관계로 바꾸며 2서클을 연다.
- 152~153화: 야쿠자 자금이 7서클 개방권으로 환전되고, 대화그룹과 미래생명 지분을 거래해 63빌딩을 산 뒤 과학·골렘·마법진을 결합한 마법사의 탑을 완성한다.
- 303~304화: 세계 1위 부자와 9서클 자격이라는 결산 뒤 강제 동면에 들고, 1년의 부재로 세운이 정체·분열된 순간 돌아와 언령으로 비리를 자백시키고 `세운의 심장` 자리를 회수한다.

이때 `mustKeep`에는 숫자보다 장면을 넣어야 한다. 예를 들어 4화의 필수 요소는 `10억 확보`만이 아니라 `유말숙이 직접 끓인 김치찌개`, `부엌 출입`, `사과 상자로 위장한 현금`이다.

### 장기 목적지와 실제 결과 재정렬

A-Rail의 `humanAftermath`와 `readerDebt`는 이 작품에 특히 잘 맞는다. `세운 총수 취임`이라는 목적지는 직함만으로 닫히지 않는다. 조문홍의 상석, 사장단의 기립과 박수, 반발하는 사장들의 존재, 이후 인사권 행사까지 있어야 독자가 받은 것으로 느낀다. Reflow의 실제 결과 기록은 계획했던 경제 승리가 어떤 인간 장면으로 바뀌었는지 남길 수 있다.

### 비정본 Forecast 비교

2~5개 후보를 비교한 뒤 선택 전에는 정본을 바꾸지 않는 원칙은 유지할 가치가 있다. 이 작품이라면 같은 사업 목표에서도 `공개 기술 시연`, `가족 식탁의 인정`, `경쟁자 파멸`, `새 마법 산업화`처럼 보상 표면이 다른 후보를 비교할 수 있다.

## 구조 자체를 바꿔야 하는 부분

### 1. 자연 Arc와 제작 Packet을 분리한다

현재 `Arc = 1~3화` 정의를 그대로 장기 서사 경계로 쓰면 안 된다. 이 작품의 자연 Arc는 짧은 2화 결산도 있지만, 같은 목표·상대·장소·열린 루프가 4화 이상 이어지는 구간도 있다. 현 Packet은 유지하되 다음 상위 객체를 추가하는 편이 안전하다.

```ts
interface NarrativeArc {
  id: string;
  title: string;
  chapterRange: { start: number; end: number };
  packetIds: string[];

  entryState: string;
  concretePremise: string;
  centralQuestion: string;
  promise: string;
  pressureLadder: string[];
  midTurns: string[];
  payoffBundle: string[];
  residualCost: string;
  irreversibleChange: string;
  nextBridge: string;
  boundarySignals: string[];

  relationshipTransactions: RelationshipTransaction[];
  rewardReceipts: RewardReceipt[];
  magicBusinessCouplings: MagicBusinessCoupling[];
}
```

`NarrativeArc`는 작품의 자연 사건 단위이고, `ArcPacket`은 다음 1~3화를 실제로 쓰기 위한 가까운 계약이다. A-Rail은 여러 Narrative Arc가 도달할 장기 목적지, B-Rail은 Narrative Arc 또는 Packet 묶음의 경로로 재정의하면 계층이 분명해진다.

### 2. 관계 변화를 문자열 배열이 아니라 거래로 남긴다

현재 `relationshipChanges: string[]`만으로는 이 작품의 핵심 보상을 감리하기 어렵다. 최소 계약은 아래처럼 상대·이전 상태·행동·새 상태·호칭·공개 범위를 나눠야 한다.

```ts
interface RelationshipTransaction {
  actor: string;
  counterpart: string;
  before: string;
  concreteGesture: string;
  after: string;
  addressBefore?: string;
  addressAfter?: string;
  publicness: "private" | "family" | "organization" | "public";
  evidenceChapter: number;
}
```

예시는 다음과 같다.

- 조문홍은 `사고만 치는 막내`에게 성적 증명을 요구하다가 3화 식탁에서 검정고시를 허락한다.
- 유말숙은 4화에 손자를 돈 구하러 온 아이로 밀어내면서도 10억, 직접 만든 김치찌개, 부엌 자리를 내준다.
- 창립 멤버들은 도겸을 `도련님`이라 부르다가 사업 성과가 누적된 뒤 41화에서 `대표님`으로 바꾼다.
- 260~261화의 조민우는 옛 가족 식탁에서 갈비찜 기억과 세운 승계를 다시 꺼내고, 도움을 얻기 위해 처음 `작은아버지`라고 부른다. 따뜻한 화해가 아니라 불신 속 동맹이므로 감정값을 미화하면 안 된다.
- 304화에서 홍 사장과 남은 사장단은 도겸의 복귀를 보고 다시 뛰는 심장으로 반응한다. 이는 개인 호칭보다 조직 전체의 귀속을 증명하는 장면이다.

### 3. 보상을 복합 영수증으로 만든다

이 작품은 한 성공을 여러 통화로 지급한다. `payoff: string` 하나보다 아래 다중 축이 필요하다.

```ts
interface RewardReceipt {
  promiseId: string;
  paidAtChapter: number;
  moneyOrAsset?: string;
  magicOrAbility?: string;
  statusOrAuthority?: string;
  relationshipOrRecognition?: string;
  sensoryScene?: string;
  witness?: string[];
  costOrRemainder?: string;
  nextDebt?: string;
}
```

7~9화의 결산은 `약 5억 차익`만이 아니다. 황연우 부모의 호텔·정밀검진, 아버지의 용종 조기 발견, 황연우의 충성, 홍 부장의 미래 거래 접근권, 2서클 개방이 한 묶음이다. 86~88화 역시 `6서클`·`2조 계약`·`아버지 회복`·`형의 10분 천하 종료`·`사장단 앞 공개 칭찬`·`세운자동차 사장 임명과 유언 변경 암시`가 같은 보상 사슬이다.

### 4. 마법과 사업의 양방향 결합을 명시한다

마법은 사업의 치트키이면서, 사업의 새 수익 방식은 다시 마법을 연다. 이 순환을 별도 필드로 추적해야 한다.

```ts
interface MagicBusinessCoupling {
  businessProblem: string;
  magicInput: string;
  industrialization: string;
  publicCoverStory: string;
  measurableOutcome: string;
  dragonHeartNovelty: string;
  unlockedCapability?: string;
  humanUseOrCost?: string;
}
```

`마법을 썼다`로 끝내지 않는다. 152~153화의 마법사의 탑은 63빌딩 매입, 투명 잉크 마법진 유리, 수정구·포탈·골렘 시공, 0호기의 룬 해독, 영등포구 단위 우호도라는 산업 표면을 가진다. 반대로 반복 수익에는 드래곤 하트가 둔감해지므로 `새 수익 방식인가`가 다음 전개 압력이다.

### 5. 한 회차에 여러 단계가 공존할 수 있게 한다

현재 `episodeBeats[].role`은 회차마다 단일 역할만 가진다. 실제 회차는 이전 약속을 결산하면서 다음 약속을 여는 경우가 흔하다. 역할을 배열 또는 가중치로 바꾸는 편이 낫다.

```ts
roles: Array<{
  kind: "promise" | "advance" | "pressure" | "turn" | "payoff" | "aftermath" | "nextHook";
  weight: number;
}>;
```

304화는 1년 부재의 압박, 가짜 후계자 선출, 도겸의 귀환 반전, 사장단 자백과 해임 보상, 9서클 신제품 약속을 한 회차에 모두 수행한다. `payoff` 하나로만 분류하면 다음 작품 동력이 사라진다.

### 6. 한국어 Forecast 저장 계약을 맞춘다

UI 지시문만 `ko`를 받는 현재 상태를 끝내고 `NarrativeForecastSchema.language`에도 `ko`를 추가해야 한다. 한국어 작품에서 Forecast가 실제 저장·재열기·stale 재검증을 통과해야 한다.

## 기존 구조를 유지하고 보정층으로 해결할 부분

### A-Rail 보정

A-Rail에는 6~12개의 장기 목적지를 둔다. 이 작품이라면 단순 매출 목표가 아니라 다음처럼 사람과 권한까지 포함한다.

1. 조문홍이 도겸을 사고뭉치가 아니라 다시 기대할 아들로 본다.
2. 자기 자본·사람·거점으로 독립 사업팀을 만든다.
3. 세운 계열사 사장으로 들어가 실제 실적으로 이름값을 만든다.
4. 형들의 왕자의 난을 꺾고 조문홍의 공개 신임을 얻는다.
5. 아버지의 상석과 세운 회장직을 상속받는다.
6. 마법을 제품·공장·도시 인프라로 산업화한다.
7. 개인 기업의 힘을 국가·세계 질서로 확장한다.
8. 9서클과 부재 시험을 거쳐 `세운의 심장`으로 돌아온다.

각 목적지의 `humanAftermath`에는 장면을 의무화한다. `회장이 됨` 대신 `사장단이 기립하고, 아버지의 상석에 앉으며, 반대파의 저항을 직접 받는다`처럼 쓴다.

### B-Rail 보정

B-Rail의 `payoffAxis`를 `money`, `magic`, `status`, `relationship`, `world` 중 하나로 고정하지 않는다. `money+relationship`, `magic+status`처럼 이번 Arc의 주·부축을 기록하고 `contrastRequirement`에는 직전 Arc와 다른 보상 표면을 쓴다.

예:

- 직전이 계좌 차익이었다면 다음은 가족 식탁의 허락으로 끝낸다.
- 직전이 공개적인 경쟁자 굴복이었다면 다음은 외할머니와 조용히 밥을 먹는 장면으로 숨을 고른다.
- 직전이 고서클 공격 마법이었다면 다음은 직원의 몸, 공장 안전, 생활 제품처럼 사람에게 닿는 용도로 바꾼다.

### Forecast 보정

후보 카드에 다음 비교축을 추가한다.

- 이번 후보가 해결하는 `readerDebt`
- 구체 보상 장면과 그 장면의 목격자
- 도겸을 다르게 부르거나 대하는 사람
- 마법이 돈을 만들고 돈이 새 마법을 여는 양방향 사슬
- 직전 3개 Arc와 겹치지 않는 수익 방식·상대·장소·감정 온도
- 다음 Arc에 남기는 비용과 적대자의 대응권

## 이 작품의 실제 집필 운영 순서

### 1. 기획서

기획서에 다음 불변 계약을 넣는다.

- 주인공: 조도겸. 1996년 16세로 돌아온 세운그룹 늦둥이.
- 장기 욕망: 형과 조카가 망친 세운을 빼앗아 되살리고, 돈을 벌어 마법을 높이며 자기 사람에게 실제 몫을 준다.
- 능력 규칙: 미래 기억, 메모라이즈, 부와 새 수익 방식에 반응하는 골드 드래곤 하트, 가르틴의 단계별 마법.
- 반복 재미: 현실의 구체 문제를 사업과 마법으로 풀고, 수치·공개 시연·경쟁자 반응·관계 변화로 이중 이상 결산한다.
- 반드시 유지: 실제 회사·제품·직책·장소·거래 조건, 마법의 산업화 과정, 가족 식탁, 호칭 변화, 사람별 대가.
- 피해야 함: 성과 보고만 하고 장면을 생략하기, 마법으로 모든 저항을 즉시 제거하기, 관계를 선악 한 줄로 평평하게 만들기.

### 2. Narrative Arc 설계

먼저 실제 사건의 시작·결산을 정한다. 목표·상대·장소·열린 루프·불가역 상태 중 둘 이상이 바뀌는 지점을 경계로 삼는다. 그 뒤 Arc 안을 1~3화 Packet으로 자른다.

예를 들어 86~88화의 큰 사건은 `왕자의 난과 아버지의 귀환`이다.

- Packet 1: 국민연금 지분전과 형의 우위, 2조 매각·6서클 개방.
- Packet 2: 그레이트 힐·사이코 테라피·메디테이션을 총동원해 아버지를 깨운다.
- Packet 3: 조도훈이 상석에 앉은 이사회에 조문홍이 돌아오고, 다음 사장단 회의에서 도겸이 공개 칭찬과 세운자동차를 받는다.

Packet을 나누어도 상위 Narrative Arc의 독자 부채는 `도겸이 돈보다 아버지를 택한 결과가 가족·승계에서 어떻게 돌아오는가`로 유지한다.

### 3. 원고 생성 전 장면 계약

각 회차 `mustKeep`에 다음 다섯 가지를 최소 한 개씩 구체화한다.

1. 이번 회차의 실제 장소와 업무 표면
2. 손에 잡히는 물건 또는 수치
3. 마법을 쓰는 구체 방식과 제약
4. 도겸을 바라보는 인물 한 명의 반응
5. 종료 직전 닫는 약속과 새로 여는 약속

식탁 장면이면 좌석·음식·누가 먼저 말을 꺼내는지·누가 숟가락을 놓는지·누구 몫의 반찬인지까지 적는다. 260화의 갈비찜처럼 음식은 가족 권력의 기억을 담는 소품이 될 수 있다.

### 4. 생성 후 감리

감리는 문장 품질보다 먼저 아래를 확인한다.

- 이번 화의 사업 성과가 숫자로만 전달되지 않고 실제 시연·판매·회의·식사 장면에 붙었는가?
- 새 서클·마법이 앞선 수익이나 선택과 인과로 연결됐는가?
- 마법의 제약·마나 비용·비밀 은폐 또는 공학적 위장이 남아 있는가?
- 누가 도겸을 전과 다르게 대하는지 행동이나 호칭으로 보이는가?
- 큰 보상 뒤 상대의 반격권 또는 새 독자 부채가 열렸는가?
- 동일한 `회의 보고 → 압도 → 환호` 패턴이 세 Arc 이상 반복되지 않았는가?

### 5. Arc 종료와 Reflow

마지막 승인 회차가 끝나면 Reflow closeout에 계획문을 복사하지 말고 실제 결과를 남긴다.

- `actualOutcome`: 돈·제품·선거·지분·전쟁의 실제 결론
- `irreversibleSettlement`: 직책, 소유권, 서클, 인물의 이탈·귀속
- `humanRemainder`: 밥상·병실·결혼식·사장단 회의에 남은 감정
- `readerDebt.paid`: 처음 약속한 무엇을 받았는지
- `readerDebt.carried`: 상대의 잔존 세력, 신제품, 다음 서클 조건
- `emergence`: 계획에 없었지만 원고에서 생긴 인물·관계·사업 기회

## 페이싱 계획과 보정

생성 전에는 회차별로 긴장·보상·훅뿐 아니라 다섯 비중을 계획한다: 정보, 행동, 관계, 감정, 물질·지위. 한 Arc 안에서 동일 비중이 연속되지 않게 한다.

- 준비화: 정보와 행동이 높고, 작은 즉시 보상을 지급한다.
- 압박화: 비용·실패 가능성·상대 대응을 올리되 사람의 결핍을 잊지 않는다.
- 전환화: 미래 정보나 마법이 아니라 도겸의 선택이 판을 바꾸게 한다.
- 결산화: 수치와 지위 뒤에 목격자 반응·호칭·자리·식사 같은 인간 영수증을 둔다.
- 여진화: 승자의 다음 사업 보고만 하지 말고, 승리로 달라진 사람의 일상 또는 새 비용을 먼저 보여 준다.

생성 후에는 최근 10화 이동창으로 다음을 본다.

- 보상 없는 회차가 2개를 넘는가?
- 관계 장면 없는 사업 회차가 4개를 넘는가?
- 새 수익 방식 없이 같은 마법 적용이 반복되는가?
- 큰 돈의 단위만 커지고 목격자·생활 변화가 작아지는가?
- 직전 Arc와 같은 장소·상대·결산 제스처가 반복되는가?

이상 신호가 있으면 다음 Arc를 갈아엎기보다 `humanAftermath`, 중간 보상, 상대의 대응 장면을 보강하는 보정층부터 적용한다.

## 최종 권고

1. 현 `ArcPacket`은 가까운 1~3화 제작 계약으로 유지한다.
2. 가변 길이 `NarrativeArc`와 Packet 묶음을 추가한다.
3. 관계 변화·호칭·인정 장면과 복합 보상 영수증을 구조화한다.
4. 마법↔사업 순환과 수익 방식의 새로움을 별도 추적한다.
5. Forecast의 `ko` 저장 계약을 완성하고 후보 비교에 사람·보상 표면을 넣는다.
6. A/B Rail과 Reflow는 버리지 말고 이 상위 Arc·영수증을 연결하는 장기 운영층으로 사용한다.

이렇게 해야 InkOS가 이 작품을 `재벌이 마법으로 계속 이긴다`는 마른 요약이 아니라, **한 번의 승리가 누구의 밥상·호칭·몸·자리와 다음 욕망을 어떻게 바꾸는지**까지 쓰는 제작기로 운용할 수 있다.
