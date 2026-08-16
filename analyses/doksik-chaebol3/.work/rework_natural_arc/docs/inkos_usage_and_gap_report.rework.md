# 《독식하는 재벌 3세》를 InkOS에서 운용하는 법과 구조 격차 · 자연 NarrativeArc 재작업본

## 판정

이 작품은 현재 InkOS의 `기획서 → A-Rail/B-Rail → ArcPacket → 회차 원고 → 감리·수정` 흐름으로 집필할 수 있다. 다만 이번 원문 재독에서 확정한 **자연 NarrativeArc 74개**를 현재의 `ArcPacket` 74개로 옮기면 안 된다. 두 단위의 존재 이유가 다르기 때문이다.

- **NarrativeArc**는 독자가 하나의 사건으로 느끼는 상위 단위다. 지배 목표·주 상대나 장소·압박 성격·큰 약속의 결산·비가역 상태 변화·열린 루프 교대 중 실제 신호 둘 이상으로 시작과 끝을 판정한다.
- **ArcPacket**은 당장 생성·감리할 **1~3화 제작 단위**다. 같은 NarrativeArc 안에서도 여러 Packet이 순차로 부분 보상을 지급할 수 있다.

재작업된 74개 NarrativeArc는 1~751화를 빈틈과 중복 없이 덮고 길이가 3~24화까지 다르다. 평균은 약 10.15화다. 24화짜리 `192~215`, `517~540`과 21화짜리 `381~401`, 12화짜리 `599~610`, 10화짜리 `711~720`을 1~3화 객체 하나에 우겨 넣는 것은 불가능하다. 반대로 `ArcPacket`의 1~3화 제한을 없애 버리면 Writer·Auditor·Reviser가 받는 근거리 생성 계약과 회차별 provenance가 흐려진다. 해법은 기존 Packet을 유지하고 그 위에 가변 길이 NarrativeArc와 명시적인 부모-자식 연결을 두는 것이다.

이 보고서는 2026-08-13 현재 로컬 InkOS working tree의 다음 구현을 읽기 전용으로 다시 확인했다.

- `packages/core/src/arc/schema.ts`
- `packages/core/src/arc/rail-schema.ts`
- `packages/core/src/arc/forecast.ts`
- `packages/core/src/forecast/schema.ts`
- `packages/core/src/forecast/context-builder.ts`
- `packages/core/src/models/chapter.ts`
- `packages/core/src/state/state-projections.ts`
- `packages/core/src/pipeline/runner.ts`

InkOS 코드는 수정하지 않았다. 이 문서는 자연 NarrativeArc 재작업 결과를 반영한 최종 운용·격차 보고서이며, 제안 타입은 아직 구현되지 않은 설계안으로 명시한다.

## 원문 재독이 바꾼 운영 전제

기존 97개 Arc는 중·후반에 5화·10화·20화 묶음이 반복되어 장 제목과 작업 구간이 독자 사건을 대신하는 경우가 있었다. 새 74개 NarrativeArc는 원문 line을 다시 읽고 경계 신호를 확인한 결과다. 다음 다섯 구간은 InkOS에서 상위 Arc와 제작 Packet을 분리해야 하는 이유를 가장 선명하게 보여 준다.

| 자연 범위 | 원문 장면과 경계 판정 | InkOS에서의 처리 |
| --- | --- | --- |
| `192~215` | 천민우 학교폭력 보호가 사과·전학·장학생 지정으로 끝난 뒤에도 국민경제당 38석·원자재 선점·판타지TV·리사 수·IIT·씽크윈 기술·데이터 사용권과 무료 앱 개발 방침이라는 보호 방벽으로 같은 질문이 확장된다. 200화 김익수 협상은 201화 같은 방·같은 상대·같은 서버 질문으로 계속된다(L34777~L38905 및 L36293~L36457). 215화에 앱 완성을 당겨 쓰지 않고, 216화 김태중의 신사옥 요구에서 교대한다. | 하나의 24화 NarrativeArc 아래에 학교폭력 보호 Packet·정치/원자재 Packet·영상 합작 Packet·AI/IIT/내비 개발조건 Packet을 둔다. 학교폭력 해결이나 미완성 앱을 상위 Arc 종결로 오인하지 않는다. |
| `216~221 / 222~226` | 216~221화는 김태중의 신사옥, 샤롯 승계·땅 가계약, 5,000억 달러 한러 에너지와 한전 이전, 태우맵 출시·하루 사용자 10만 명이 지배한다. 221화 말 데이터 거절 뒤 222화부터는 차봉훈의 횡령·상납, 강인운수·코코아택시·무료 단말기, 파업·조폭 100명의 카르텔전으로 목표·상대/장소·압박이 모두 교대한다(L38906~L40044). | 같은 11화를 한 상위 Arc에 넣지 않는다. 신사옥/입법 Packet과 택시 앱 Packet이 가까이 이어져도 221/222의 세 경계 신호로 NarrativeArc 자체를 나눈다. |
| `381~401` | 유가 폭락 자산 인수·가이아나 유전·카노스 역파산·한정훈 승계·로보 폐기 신약이 ‘위기 자산과 적을 다음 성장축으로 바꾼다’는 질문으로 이어진다. 400화에는 매각안만 있고 401화 10억 달러·전 권한·연구자료·로열티 삭제 계약서 서명에서야 신약 권리가 지급된다(L66743~L70343 및 L70054~L70343). | 21화 NarrativeArc의 마지막 Packet이 400~401화를 함께 소유하게 한다. 400화를 payoff로 닫지 말고 401화 계약서 서명을 `observed payoff`로 기록한다. 402화부터 중국 숏·삼진 승계·메르스가 새 상위 Arc다. |
| `599~610` | 미국 대선 뒤 트럼프 정권이양·바이든 가이아나 방위가 601~605화 HBM·SMR·북한 해킹·호주 석탄으로 실행되고 606~610화 호주·가이아나·베트남 계약으로 지급된다(L104593~L106590 및 L104891~L105770). 600/601 작업 분할선과 605/606 장 제목선에는 종결 신호가 없다. | 12화 NarrativeArc 아래에 정권이양 Packet·기술/해킹 Packet·에너지 저장 Packet·호주/가이아나/베트남 Packet을 둔다. 610화 미아인 체포·정유 거점 뒤 611화 부산 축구장과 김태중 명예 회복으로 교대한다. |
| `711~720` | 중국 특구·일본 조기상환·프리고진 로스토프 이동이 자동차동맹 임시가입·일본 제외·미 7함대 부산 배치·수에즈 우선운송·지린 경제영토라는 같은 유라시아 출구로 수렴한다(L122978~L124612). 715화 바그너 반란은 새 Arc가 아니라 mid-turn이다. | 10화 NarrativeArc 안에서 중국협상 Packet과 바그너반란 Packet을 교차 편집한다. 720화까지 간접 지렛대를 쌓고 721화 김민재·최재석의 직접 러시아 중재가 시작될 때 상위 Arc를 닫는다. |

이 다섯 사례에서 보이는 공통 원칙은 `큰 사건이 나왔다`와 `자연 Arc가 끝났다`가 같지 않다는 점이다. 지급 뒤에도 주 상대·지배 질문·남은 비용이 이어지면 중간 봉우리다. 반대로 다음 사건의 훅이 앞 회차 말에 등장하더라도 앞 약속이 이미 지급되고 상대·장소·목표가 교대했다면 자연 경계다.

## 현재 InkOS로 운용하는 구체 순서

### 1. 기획서에는 회귀 생존·가족·복수의 원형을 따로 고정한다

이 작품의 한 줄 목표를 `세계 1위 기업이 된다`로만 적으면 마지막 초음파 사진이 장식으로 밀린다. `할아버지를 지킨다`만 적으면 각 시대 사건에서 무엇을 사고 팔고 개발하고 계약하는지가 사라진다. 기획서에는 다음 세 약속을 서로 독립된 장부로 둔다.

1. **생존 약속**: 고시원에서 죽은 김민재가 17세로 돌아옴 → 100만 달러 종잣돈과 SAVE → 외환위기 때 태우 부채율 0퍼센트·사우디 6조 원 정유계약 → 팬데믹·전쟁 때 한국과 태우의 안전판 → 세계 1위 그룹의 지속 가능한 방어벽.
2. **가족 약속**: 김태중을 다시 안음 → 손자가 후계자로 인정받음 → 살아 있는 김태중이 전대 회장·축구협회장·리즈 구단주·대북특사로 자기 삶을 되찾음 → 김민재가 평화상의 공을 할아버지에게 돌림 → 천민정의 초음파 사진과 증조부가 된 김태중.
3. **복수 약속**: 박진훈 축출·장수영 퇴진·윤현길의 평생 미끼 전환·이영한의 명동 승계·이 상무의 돈과 CNC 몰락처럼 사람별 처리를 기록함 → 감사·인사·지분·법·금융망을 바꾸어 같은 배신이 반복되기 어려운 구조로 전환함.

복수는 `살생부 전원 말소`라는 임의 완료 체크박스로 닫지 않는다. 원문에서 누가 어떤 증거·직함·자산·관계 대가를 잃었는지와 아직 남은 비용을 각각 기록한다.

### 2. A-Rail은 6~12개의 장거리 상태 목적지만 소유한다

현재 `StoryAnchor`의 `entryState`, `trigger`, `irreversibleChange`, `humanAftermath`, `readerDebt`, `payoffAxis`, `nextPressure`는 이 작품의 장거리 목적지에 잘 맞는다. A-Rail에는 74개 Arc의 상세 비트를 넣지 않고 다음 정도의 내구성 있는 상태만 둔다.

- 죽음에서 17세 후계자로 돌아와 김태중과 재회한다.
- SAVE의 독립자본과 한정훈 팀으로 미래지식을 실행조직으로 바꾼다.
- 박진훈 등 내부 배신을 정리하고 외환위기 때 태우를 인수자로 뒤집는다.
- 김태중이 살아서 총수권을 넘기고 김민재가 그룹 책임자가 된다.
- 금융위기·공급망·팬데믹을 통과해 태우가 국가 안전판이 된다.
- AI·고체배터리·해상도시로 과거를 이용하는 회사에서 미래표준을 만드는 회사가 된다.
- 러우 휴전·북한 횡단철도·부산 엑스포·노벨상을 거쳐 가족과 가정을 완성한다.

먼 목적지에 정확한 계약 수치나 아직 등장하지 않은 인물 행동을 정본으로 박지 않는다. 반면 `humanAftermath`와 `readerDebt`에는 김태중의 생존·명예와 천민정 가족선이 사라지지 않게 남긴다.

### 3. 74개 NarrativeArc는 상위 경로표로 두고 활성 Arc만 Packet으로 잘게 쪼갠다

NarrativeArc에는 실제 범위·지배 질문·압박 사다리·중간 전환·구체 지급·잔여 비용·경계 신호·원문 line을 둔다. 집필 시에는 활성 NarrativeArc 하나만 골라 그 안의 가까운 1~3화를 `ArcPacket`으로 만든다.

예를 들어 `599~610`을 한 Packet으로 만들지 않는다.

- Packet A `599~600`: 패배한 트럼프의 폭동·소송을 막고 바이든에게 가이아나 100억 달러 대출과 무기 수입을 제안한다.
- Packet B `601~603`: 천민정의 저온 식각 HBM과 SMR을 확인하고 현재 장 회장의 전차수출·원전동맹과 메타버스 지분 40퍼센트 현금화를 실행한다.
- Packet C `604~606`: 북한의 센트리언 해킹을 막고 호주산 석탄·동해 LNG 저장고를 다음 전쟁의 실물 방벽으로 만든다.
- Packet D `607~608`: 모리슨의 호주 석탄과 가이아나 IIT·유전·방산을 장기계약으로 묶는다.
- Packet E `609~610`: 사이공은행 40조 원 불법대출·10조 원 비자금을 공개해 미아인 세력을 체포시키고 정유 거점을 회수한다.

각 Packet의 `payoff`는 부분 지급이다. Packet E에서만 NarrativeArc의 `concretePayoff`와 `boundarySignals`를 닫는다. Packet A~D가 완료됐다는 이유로 상위 Arc를 `closed`로 바꾸지 않는다.

### 4. Forecast는 역사 결과가 아니라 실행 순서를 비교한다

일본 버블·외환위기·코로나19·러시아-우크라이나 전쟁의 발생 자체를 분기시키면 작품의 시대 계약이 흔들린다. Forecast는 다음처럼 전술의 순서와 초점을 비교한다.

- 외환위기 전에 현금보존·부채상환·계열사 구조조정·타 기업 인수를 어떤 순서로 둘지 비교한다.
- 코로나19에서 진단·마스크·음압병실·크루즈 구조·시장 저점 중 이번 Packet의 전면 보상을 고른다.
- `711~720`에서 중국 임시가입과 바그너 반란을 교차할지 한쪽을 먼저 보여 줄지 비교한다.

선택한 Forecast는 먼저 `NarrativeArc hypothesis`의 근거리 대안으로 저장하고 그중 연속된 1~3화만 Packet으로 materialize한다. 현재처럼 branch 첫 연속 1~3개 beat만 뽑는 동작은 Packet 생성에는 맞지만 상위 Arc 전체를 대표한다고 간주하면 안 된다.

### 5. 회차 생성 뒤 계획이 아니라 실제 원고를 readback한다

한 회차가 승인될 때 다음 여섯 장부를 함께 갱신한다.

- 사건: 실제 계약·매도·인수·수사·개발·외교.
- 돈·지분·물량: 판돈·수익·부채·지분율·생산량·운송량.
- 관계: 김민재-김태중과 핵심 인재·정치인·기업인의 호칭·신뢰·의존 변화.
- 독자 약속: 열린 질문·부분 지급·완전 지급·이월 비용.
- 시대: 연도·실제 사건의 전조·발발·여진과 김민재 개입 뒤 달라진 결과.
- 증거: 원문 SHA-256·회차 표식·1-based line 범위·해당 상태 delta를 만든 장면.

계획했던 수익이나 관계 변화가 원고에 없으면 발생한 것으로 쓰지 않는다. `planned`와 `observed`를 나누고 observed readback만 다음 Packet의 정본 입력으로 사용한다.

## 현재 구조로 충분한 부분

### 근거리 ArcPacket 계약

`ArcPacketSchema`는 `episodeCount`와 `chapterNumbers`를 1~3으로 제한하고 `openingState`, `promise`, `goal`, `obstacle`, `pressure`, `turn`, `payoff`, `irreversibleChange`, `nextHook`을 갖는다. `episodeBeats`, `characterChanges`, `relationshipChanges`, `worldChanges`, `hookOperations`, `mustKeep`, `mustAvoid`, `styleEmphasis`도 있다. 이는 NarrativeArc 전체가 아니라 가까운 1~3화의 집필 계약으로는 적절하다.

### 회차 provenance와 감사·수정 재사용

`ChapterArcProvenanceSchema`는 활성 Arc의 ID·수정시각·제목·회차번호·역할·비트·관계/세계 변화·훅 연산과 선택 Forecast를 회차에 스냅샷으로 남긴다. `pipeline/runner.ts`는 이 문맥을 Writer뿐 아니라 Auditor와 Reviser에도 다시 전달한다. 계획이 나중에 바뀌어도 해당 회차가 어떤 Packet 아래 생성됐는지 추적할 수 있는 토대다.

### A-Rail/B-Rail의 정본 경계

A-Rail은 가까운 목적지만 compound로 하고 먼 목적지는 sparse로 두며 ready 상태에서 6~12개 live anchor를 요구한다. B-Rail은 먼 경로에서 정확한 장면·인물·보상을 굳히지 않고 `narrativeFunction`, `payoffAxis`, `carriedReaderDebt`, `contrastRequirement` 같은 내구성 있는 필드만 둔다. 장편을 일찍 거짓 정본으로 얼리지 않는 이 원칙은 유지해야 한다.

### Forecast의 비정본성과 fingerprint

Forecast는 자체로 정본이 아니며 `contextFingerprint`로 입력 변화에 따른 stale 상태를 판별한다. `context-builder.ts`도 Forecast 컨텍스트를 만들 때 정본 파일을 생성·복구하지 않는 read-only 경로를 사용한다. 상위 NarrativeArc hypothesis 역시 이 비정본 원칙을 계승하면 된다.

## 구조 자체를 바꿔야 하는 부분

### P0. NarrativeArc와 ArcPacket의 타입이 분리되어 있지 않다

현재 `ArcPacketSchema`와 `ArcActualEpisodeCountSchema`는 1·2·3만 허용하고 `StoryRailRouteCapacitySchema.arcEpisodeCap`도 3으로 고정한다. 이는 제작 Packet의 올바른 제한이지만 자연 사건 Arc의 길이 계약으로 재사용할 수 없다.

최소 상위 객체는 다음과 같다.

```ts
interface NarrativeArc {
  id: string;
  title: string;
  status: "hypothesis" | "planned" | "active" | "closed";
  plannedRange: { startChapter: number; softEndChapter?: number };
  actualRange?: { startChapter: number; endChapter: number };
  dominantGoal: string;
  mainCharacters: string[];
  organizations: string[];
  locations: string[];
  assets: string[];
  eraEvents: string[];
  concretePremise: string;
  centralQuestion: string;
  promise: string;
  pressureLadder: string[];
  midpointTurns: string[];
  concretePayoff: string;
  relationshipChanges: StateDelta[];
  stateChanges: StateDelta[];
  residualCost: string;
  readerDebtOps: ReaderDebtOperation[];
  boundarySignals: BoundarySignal[];
  sourceEvidence: SourceEvidence[];
  packetIds: string[];
  nextArcBridge: string;
}
```

계획 때 끝 화는 `softEndChapter`로 두고 실제 원고에서 서로 다른 경계 신호 둘 이상이 관찰될 때만 `actualRange`를 닫는다. `episode_count=5`나 장 제목 `(5)`는 경계 신호가 아니다.

### P0. 혼합 회차를 한 개 `episodeRole`로만 저장한다

현재 `ArcEpisodeBeatSchema.role`과 `ChapterArcProvenanceSchema.episodeRole`은 `promise | pressure | turn | payoff` 중 하나다. 그러나 이 작품에는 앞 Arc 결산과 다음 Arc 발단이 한 회차에 공존한다.

661화가 명확한 사례다.

- L115004~L115073: 로나코인 99퍼센트 폭락·최소 300억 달러 이익·베릴 공개 복권으로 앞 Arc를 닫는다.
- L115074~L115080: 시선이 식량·에너지로 교대한다.
- L115083~L115169: 김민재가 축구협회장 김태중에게 동남아 수출예외 협상을 부탁하고 김태중이 마지막 회사 임무를 받아 다음 Arc를 연다.

한 역할만 고르면 payoff 또는 promise 중 하나가 사라진다. 다음 구조가 필요하다.

```ts
interface PhaseSegment {
  order: number;
  role: "promise" | "pressure" | "turn" | "payoff" | "aftermath" | "bridge";
  storyArcId: string;
  beats: string[];
  sourceEvidence: SourceEvidence[];
}

interface ChapterArcProvenanceV2 {
  primaryStoryArcId: string;
  primaryRole: ArcEpisodeRole;
  phaseSegments: PhaseSegment[];
  closesStoryArcIds: string[];
  opensStoryArcIds: string[];
}
```

101화·153/154화·176/177화·614화·660/661화·730/731화·739/740화·748/749화도 같은 회귀 테스트에 넣는다. 회차 CSV는 지배 장면에 따라 하나의 `arc_id`를 가져도 되지만 provenance는 앞 결산과 뒤 발단을 모두 보존해야 한다.

### P0. 원문 line provenance가 없다

현재 Chapter provenance는 계획 스냅샷에는 강하지만 원문 SHA·표식·line span과 경계 판정 근거를 저장하지 않는다. 역분석·수정·관리자 QA에서는 다음 최소 증거가 필요하다.

```ts
interface SourceEvidence {
  sourceId: string;
  sourceSha256: string;
  markerSequence: number;
  startLine: number;
  endLine: number;
  claim: string;
  evidenceKind: "scene" | "contract" | "reaction" | "state-change" | "boundary";
}
```

`381~401`의 경계는 400화 이사회 통과가 아니라 401화 L70216~L70343 계약서 서명이다. line 근거가 없으면 요약 모델이 다음 화 지급을 앞당겨 쓰거나 장 제목 끝을 경계로 오인한다. source hash가 바뀌면 line provenance도 stale로 표시해야 한다.

### P1. 0~1 pacing ribbon을 계획·관찰로 저장할 자리가 없다

이번 재작업은 751행 모두 `information + action + relationship + emotion + material/status = 1±0.01`인 **0~1 정규화 비율형** 하나를 사용했다. 긴장·보상·훅은 1~10 정수이며 실제 장면을 읽어 판정했다. 현재 Arc/Chapter 모델에는 이 구성비를 저장할 구조가 없다.

```ts
interface PacingReadback {
  mode: "normalized-ratio";
  tension: number; // 1..10
  reward: number;  // 1..10
  hook: number;    // 1..10
  ribbon: {
    information: number;
    action: number;
    relationship: number;
    emotion: number;
    materialOrStatus: number;
  };
  basis: "planned" | "observed";
  rationale: string;
  evidence: SourceEvidence[];
}
```

합계 검증은 스키마에서 `1±0.01`로 한다. Arc 위치나 키워드로 점수를 자동 생성하지 않는다. 계획값과 observed 값을 나란히 보여 주고 차이가 클 때만 사람이 보정한다.

### P1. 작품 표면과 누적 delta가 자유문자열에서 증발한다

`characterChanges`·`relationshipChanges`·`worldChanges`는 유용하지만 문자열 배열이다. 이 작품에서는 `태우 부채율 0퍼센트`, `김태중의 축구협회장 17표 당선`, `메타버스 지분 40퍼센트 현금화`, `부산 엑스포 131대34`, `초음파 사진` 같은 표면이 곧 보상이다.

`surfaceRefs`에 인물·조직·장소·계약·제품·시대 사건을 1급 참조로 두고 `StateDelta`에는 `axis`, `subject`, `before`, `after`, `verification`, `sourceEvidence`를 둔다. 숫자형 보조필드는 통화·가치평가가 명확할 때만 선택적으로 사용한다. 사람의 호칭·표정·증언도 관계 delta의 증거로 허용한다.

### P1. 독자 약속과 복선이 한 문자열 묶음에 섞인다

`hookOperations`와 B-Rail의 `carriedReaderDebt`는 유용하지만 이 작품의 장기 약속을 열기·진전·부분지급·완전지급·이월로 추적하기에는 부족하다.

```ts
interface ReaderDebtOperation {
  debtId: string;
  operation: "open" | "advance" | "partial-pay" | "close" | "carry";
  concretePromise: string;
  payment?: string;
  remainingDebt?: string;
  dueStoryArcId?: string;
  evidence: SourceEvidence[];
}
```

`김태중을 살린다`는 외환위기 생존에서 일부 지급되고 축구협회장·리즈·대북특사에서 계속 갱신되며 751화 증조부 장면에서 가족 약속으로 닫힌다. 반면 우주배터리 사업은 후속 삶의 열린 사업이지 가족 약속의 미지급이 아니다. debt와 hook을 UI에서 구별해야 한다.

### P1. 한국어 Forecast 실행 경로가 닫혀 있다

현재 `NarrativeForecastSchema.language`와 `ForecastContext.language`는 `zh | en`만 허용한다. `readBookConfig`는 영어가 아니면 중국어로 떨어지고 `state-projections.ts`와 Forecast prompt/render도 같은 이분법을 쓴다. 한국어 작품을 안정적으로 운영하려면 `ko` 타입·한국어 섹션명·프롬프트·repair prompt·fixture·snapshot test가 필요하다. 이는 표시 문자열 한두 개를 바꾸는 보정층으로 해결되지 않는다.

### P2. Forecast에서 NarrativeArc hypothesis를 거치지 않는다

`createArcDraftFromForecast`는 branch의 첫 연속 1~3 beat만 고르고 역할을 1화면 payoff·2화면 promise/payoff·3화면 promise/pressure/payoff로 정한다. 먼 변화가 정본으로 승격되지 않게 막는 판단은 옳다. 그러나 turn·relationship/world change·nextHook를 빈 배열 또는 빈 문자열로 만들면 가까운 표면도 잃는다.

변환 순서를 `Forecast branch → NarrativeArc hypothesis → 선택한 1~3화 ArcPacket`으로 바꾼다. 가까운 beat에서 명시된 인물 결정과 관계 변화만 Packet에 승격하고 먼 예상은 hypothesis에 남긴다.

## 생성 전 계획과 생성 후 감리

생성 전에는 Packet마다 다음을 적는다.

- 부모 NarrativeArc ID와 현재 상위 질문.
- 이번 1~3화에서 실제로 움직일 김민재·김태중·한정훈·천민정 등 인물.
- 계약서·지분·공장·선박·제품·표·초음파 사진 같은 물건.
- 부분 지급과 상위 Arc 종결 지급의 구분.
- 0~1 ribbon의 계획값과 장면 근거.
- 앞 Arc를 닫거나 다음 Arc를 여는 phaseSegment 예정.

생성 뒤에는 원고에서 실제 발생한 계약·반응·delta와 line evidence를 읽어 observed ribbon을 만든다. 정보 설명이 연속으로 높고 행동·물질 지급이 없으면 다음 Packet의 앞부분에 계약 체결이나 공개 반응을 검토한다. 다만 대형 승리 뒤 김태중과의 식사·귀환·농담처럼 관계·감정 ribbon이 높아지는 숨 고르기를 결손으로 판단하지 않는다.

## 회귀 생존·가족·복수 약속의 실제 지급

### 생존

1~15화에서 김민재는 고시원 죽음에서 17세로 돌아와 100만 달러를 받고 한정훈 팀·SAVE·걸프전 100억 달러 기반을 만든다. 78~86화 외환위기에는 태우 부채율 0퍼센트와 사우디 6조 원 정유 실계약을 만들어 회귀 전 부도를 정반대로 뒤집는다. 후반의 금융타워·센트리언·AI·반도체·배터리·방산·횡단철도는 이 생존 기반이 개인에서 그룹과 국가로 확장된 지급이다.

### 가족

김태중은 죽어야 할 사람이 살아남는 것만으로 끝나지 않는다. 611~614화 17표 축구협회장 당선·중계권 60억 원에서 300억 원 인상으로 자기 일을 되찾고 637~642화에는 리즈 구단과 홀란드 계약을 받는다. 745~748화에는 대북특사로 남북정상회담·5개국 회의를 성사시키는 주체가 된다. 749~751화에는 김민재가 평화상을 김태중에게 선물하고 천민정의 초음파 사진을 보여 준다. 김태중이 영국행을 취소하고 두 사람의 손을 잡는 장면이 1화 조손 포옹의 최종 가족 지급이다(L129225~L129777).

### 복수

32~52화 박진훈은 이노폰 공개 시연과 내부 증인으로 축출된다. 137~142화 윤현길은 무릎을 꿇고 평생 정보 미끼가 되며 장수영과 공멸한다. 637~642화 북한 장남은 위조지폐·해킹으로 이 상무의 CNC와 비트코인을 빼앗는다. 이 지급들은 단순 처형이 아니라 김민재가 실패했던 사람 보는 눈을 인재·감사·정보·법·금융 구조로 바꾸는 과정이다. 원문에 명시되지 않은 살생부 전원 말소는 완료로 선언하지 않는다.

### 결말

749~751화에 북한 횡단철도 착공·천민정 노벨 화학상·김민재와 최재석 노벨 평화상·부산 엑스포 131대34가 외적 성과로 지급된다. 마지막 핵심 물건은 기업 지분표가 아니라 초음파 사진이다. 김민재가 `태우그룹과 가정`을 끝까지 책임지겠다고 맹세하면서 생존·가족 약속을 닫는다. 우주선용 고체배터리와 해상도시·철도 사업은 새 적대를 여는 미결 Arc가 아니라 완결 뒤 살아갈 세계다.

## UI와 검증 장치

Arc 편집기는 세 층을 한 화면에 보여 줘야 한다.

1. 상단 `NarrativeArc`: 실제 범위·지배 질문·큰 지급·잔여 비용·경계 신호·source line.
2. 중단 `ArcPacket`: 활성 1~3화의 비트·부분 지급·mustKeep·mustAvoid.
3. 하단 `Chapter readback`: phaseSegments·observed delta·0~1 ribbon·원문 evidence.

별도 레인에는 시대 사건·기업 자산·가족/독자 부채를 둔다. `599~610`을 선택하면 미국 대선·HBM/SMR·호주 석탄·베트남 은행이 하나의 상위 질문 아래 보이되 Packet은 다섯 개로 나뉘어야 한다. 661화를 선택하면 로나 결산과 김태중 식량외교 개방이 겹친 전이 셀로 보여야 한다.

자동 검사는 다음만 경고하고 정본을 고치지 않는다.

- NarrativeArc 경계 신호가 둘 미만이다.
- Packet 완료를 상위 Arc 완료로 잘못 승격했다.
- source hash 또는 line span이 사라졌다.
- ribbon 값이 0~1 밖이거나 합이 `1±0.01`을 벗어난다.
- 점수가 키워드·Arc 위치 공식으로 생성된 흔적이 있다.
- 관계 변화나 고득점 회차에 구체 인물·물건·계약·반응이 없다.
- 혼합 회차인데 phaseSegments 또는 closes/opens 참조가 없다.
- 계획 delta가 observed evidence 없이 정본 상태에 반영됐다.

## 구현 우선순위

1. **P0**: 기존 `ArcPacket`을 Production Packet으로 명확히 문서화하고 상위 `NarrativeArc`·`storyArcId`·`packetIds`를 추가한다.
2. **P0**: `ChapterArcProvenanceV2.phaseSegments`와 `closesStoryArcIds`·`opensStoryArcIds`를 추가한다.
3. **P0**: `SourceEvidence`에 source SHA-256·marker sequence·1-based line span을 넣고 stale 검사를 만든다.
4. **P1**: 0~1 normalized ribbon과 1~10 tension/reward/hook의 planned/observed readback을 추가한다.
5. **P1**: `surfaceRefs`, 검증상태가 있는 `StateDelta`, 구조화된 `ReaderDebtOperation`을 추가한다.
6. **P1**: Forecast·state projection·prompt 전 경로에 `ko`를 추가하고 한국어 fixture를 만든다.
7. **P2**: Forecast를 NarrativeArc hypothesis와 가까운 ArcPacket으로 나누는 2단 변환을 구현한다.
8. **P2**: NarrativeArc·Packet·Chapter와 시대/기업/가족 레인을 함께 보여 주는 편집기를 만든다.

## 이 작품으로 고정할 회귀 테스트

- 74개 NarrativeArc가 1~751을 정확히 한 번 덮되 Packet 수와 같다고 가정하지 않는다.
- `192~215`를 학교폭력 해결이나 200/201 회차선에서 자동 분할하지 않는다.
- `215`에는 씽크윈 사용권·개발 방침만 기록하고 태우맵 완성·10만 사용자는 `221`에 기록한다.
- `216~226`을 편의상 한 덩어리로 합치지 않고 221/222의 목표·상대/장소·압박 교대를 검증한다.
- `381~401`을 400화 이사회 승인에서 닫지 않고 401화 계약서 line까지 요구한다.
- `599~610`을 600/601 작업 분할선이나 605/606 장 제목선에서 자르지 않는다.
- `711~720`의 바그너 반란을 새 Arc 시작으로 오인하지 않고 721화 직접 중재에서 교대한다.
- 661화가 payoff→bridge→promise 세 phaseSegment를 모두 보존한다.
- 751행 ribbon이 전부 0~1이고 합계가 `1±0.01`인지 검증한다.
- 계획된 돈·지분·관계 변화보다 원고 readback과 source line evidence를 우선한다.
- 749~751화의 국가급 상과 초음파 사진을 같은 보상으로 뭉개지 않고 외적 지위와 가족 감정을 별도 delta로 닫는다.

이 구조라면 InkOS는 751화를 하나의 거대한 계획으로 얼리지 않고도 1~3화 집필 품질을 유지한다. 동시에 독자가 실제로 느끼는 74개 NarrativeArc와 회귀 직후의 생존·가족·복수 약속이 어디에서 어떤 계약·직함·반응·물건으로 지급됐는지 끝까지 추적할 수 있다.
