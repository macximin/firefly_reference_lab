# 『대망』 InkOS 사용·구조 간극 보고서

## 판정

현재 InkOS에는 『대망』을 쓰는 데 필요한 핵심 부품이 이미 상당 부분 있다. `Book → Chapter` 정본 구조를 유지하면서 1~3화 `ArcPacket`, Forecast 후보 선택, active Arc 주입, Chapter별 Arc provenance, A-Rail 장기 Anchor, B-Rail 경로, stale·binding·reflow 보호가 구현돼 있다. 특히 A-Rail의 `irreversibleChange`, `humanAftermath`, `readerDebt`, `payoffAxis`, `nextPressure`와 B-Rail의 `carriedReaderDebt`, `contrastRequirement`는 『대망』의 장기 재장전 원리를 직접 담을 수 있다.

그러나 현재의 `ArcPacket = 1~3화`는 제작 패킷이지 원문에서 발견된 자연 사건 Arc와 같은 단위가 아니다. 『대망』의 작가 표지 소구간만 해도 170개이며, 대체로 4~11화이고 `드라마 제작`은 516~530화 15화, `뭐야, 이건 또?`는 435~448화 14화다. 하나의 사건 Arc가 여러 1~3화 패킷을 요구한다. 이 둘을 같은 `Arc`라고 부르면 “이번 세 화를 어떻게 쓸지”는 잘 보이지만 “트리폴리 첫 거래가 어디서 시작해 무엇으로 결산됐는지”, “드라마 제작 국면이 어떤 압력을 누적하고 어떤 흥행으로 닫혔는지”가 패킷 사이에서 사라진다.

결론은 전면 교체가 아니다. 현재 `ArcPacket`은 그대로 제작 단위로 유지하고, 그 위에 여러 패킷을 묶는 **자연 사건 Arc**를 별도 1급 객체로 추가하는 것이 맞다. A-Rail은 작품 전체 6~12개의 비가역 목적지, 자연 사건 Arc는 실제 인물·장소·대결산이 이어지는 중간층, `ArcPacket`은 다음 1~3화를 쓰는 실행층으로 역할을 분리한다.

## 이번 확인의 현재 구현 근거

읽기 전용으로 다음 현재 파일을 확인했다. InkOS 작업트리는 기존 대규모 미커밋 변경을 가진 상태였고 이 보고서 작성 중에는 전혀 수정하지 않았다.

- `/Users/a2501/Desktop/inkos/packages/core/src/arc/schema.ts`: `ArcPacket`은 1~3개의 연속 회차와 정렬된 `episodeBeats`, `draft|ready|completed`를 강제한다.
- `/Users/a2501/Desktop/inkos/packages/core/src/arc/store.ts`: `story/arcs/`에 원자적으로 저장하고 `active.json`을 유일한 활성 Arc 포인터로 둔다.
- `/Users/a2501/Desktop/inkos/packages/core/src/arc/forecast.ts`: Forecast 분기의 첫 연속 1~3개 비트를 편집 가능한 Arc 초안으로 만들며 정본과 Chapter를 즉시 덮어쓰지 않는다. 활성 Arc와 선택적 Rail 문맥은 Writer 입력과 Chapter provenance에 들어간다.
- `/Users/a2501/Desktop/inkos/packages/core/src/arc/rail-schema.ts`: A-Rail은 ready 상태에서 6~12개 장기 Anchor를 요구하고, B-Rail은 `closed → active → provisional → hypothesis` 순서와 최대 3화 용량을 검증한다.
- `/Users/a2501/Desktop/inkos/packages/core/src/arc/rail-context.ts`: A/B Rail이 ready이고 Book 목표 회차 스냅샷이 현재값과 맞으며 active B가 active Arc와 정확히 연결될 때만 런타임 문맥을 만든다.
- `/Users/a2501/Desktop/inkos/packages/studio/src/components/chat/StoryRailsPreview.tsx`: 장기 Anchor의 진입·촉발·비가역 변화·인물 여진·독자 약속·보상 방향·다음 압력과 B-Rail의 이전 Arc 대비 차이를 한국어로 보여 준다.
- `/Users/a2501/Desktop/inkos/packages/studio/src/components/chat/NarrativeForecastPreview.tsx`: stale Forecast 선택을 막고, 후보 선택이 정본이 아니라 활성 Arc 초안만 만들도록 사용자에게 명시한다.

이 평가는 현재 소스 구조를 읽은 결과다. InkOS 코드를 수정하거나 테스트를 새로 실행하는 일은 이 작품 분석의 범위가 아니므로, 런타임 전체가 현재 통과한다고 주장하지 않는다.

## 현재 InkOS로 『대망』을 운영하는 구체적 방법

### 1. Book 기획서

`project_bible.md`의 장기 계약을 Book 기획서에 옮긴다. 한 줄 전제만 넣지 말고 다음을 고정한다.

- 김혁권의 변하지 않는 욕망: 다시 버려지지 않을 힘, 자기 사람과 자기 몫을 빼앗기지 않을 자유.
- 반복 재미 엔진: 막힌 물자·사람·자금의 경로를 열고, 더 큰 상대와 조건을 바꾸며, 현금보다 다음 판을 여는 자산을 얻는다.
- 반드시 유지: 거래 물건의 이름과 경로, 실제 상대와 장소, 부하의 생사·부상, 돈 외의 관계 지급, 공격 배후까지 값을 치르는 성향.
- 피해야 함: 모든 국가와 기관을 이름 없는 ‘세력’으로 말리기, 부상과 죽음을 다음 화에 초기화하기, 거래 성과를 숫자 한 줄로만 처리하기, 소현을 위험에 빠질 때만 호출하기.
- 문체 계약: 협상은 조건과 위험이 선명해야 하고, 액션은 이동·엄폐·탄약·탈출 목적이 보여야 하며, 결산 뒤에는 사람의 반응과 다음 압력을 남긴다.

### 2. A-Rail: 10~11개의 장기 목적지

현재 ready A-Rail이 허용하는 6~12개 Anchor 안에 작품의 거시 목적지를 둔다. 『대망』 분석에서 실용적인 초안은 다음과 같다.

1. 트리폴리 발령을 생존하고 독립 거래자로 선다.
2. 카다피 컬렉션과 만수르 인연으로 국제 자본의 문을 연다.
3. TC인터내셔널 주가 조작을 뒤집고 회사를 인수한다.
4. 치우 팀과 광산을 확보해 개인 실행력을 조직 능력으로 바꾼다.
5. 정소현과 관계를 선택하고 미리내·매니지먼트를 만든다.
6. 원유·미디어·국내 세력의 세 사업축을 자립시킨다.
7. 모사드·121부대·예멘을 통과해 국가기관과 대등한 외부 실행자가 된다.
8. 태일 형제의 난과 아프리카 광산을 이용해 자원·에너지 판을 넓힌다.
9. 이란 중재·잠수함·셰일 오일로 국가 에너지 판을 다룬다.
10. 콩고 쿠데타·태일 임시주총·한국 방산 컨소시엄을 결산한다.
11. 김인철의 마지막 공격을 끝내고 소현에게 돌아와 청혼한다.

각 Anchor의 `humanAftermath`에는 자말의 의족, 알아바디와 부하들의 죽음, 소현의 불안과 부상처럼 결산 뒤에도 남는 비용을 쓴다. `nextPressure`에는 막연한 ‘더 큰 적’이 아니라 “드비어스가 광산 원석 유통을 조인다”, “김인철이 필리핀에서 위조 신분으로 돌아온다”처럼 실제 압력을 기록한다.

### 3. 자연 사건 Arc: 새 중간층

작가의 170개 사건형 표지를 출발점으로 삼되, 목표·장소·결산이 이어지는 경우는 합치고 같은 제목이라도 중심 질문이 바뀌면 나눈다. 최소 계약은 다음과 같다.

```ts
interface StoryArc {
  id: string;
  title: string;
  anchorId: string;
  status: "planned" | "active" | "settled" | "retired";
  plannedRange?: { startChapter: number; endChapter: number };
  actualRange?: { startChapter: number; endChapter: number };

  entryState: string;
  concretePremise: string;
  centralQuestion: string;
  promise: string;
  pressureSteps: string[];
  midTurns: string[];
  concretePayoff: string;
  humanAftermath: string;
  nextBridge: string;
  boundarySignals: string[];

  focusCharacters: Array<{ id?: string; displayName: string }>;
  locations: string[];
  factions: string[];
  assetsAtStake: string[];
  openLoopIds: string[];
  packetIds: string[];
}
```

`focusCharacters`와 `locations`는 지식 그래프를 과도하게 확장하자는 뜻이 아니다. “주인공/기관/전장” 같은 추상 칸 채우기를 막고 김혁권·자말·코린시아 호텔·트리폴리처럼 화면에 보이는 표면을 보존하기 위한 최소 영수증이다.

### 4. B-Rail과 `ArcPacket`: 다음 1~3화 실행

자연 사건 Arc 하나를 여러 B-Rail/`ArcPacket`으로 쪼갠다. 예를 들어 001~014화의 초반은 다음처럼 운영할 수 있다.

- 자연 사건 Arc: `트리폴리에서 첫 밀수 계약을 완수한다` 001~014화.
- 패킷 001~003: 누명을 쓰고 트리폴리에 도착해 자말과 계약한다.
- 패킷 004~006: 의약품과 화물을 확보하고 국경에서 첫 공격을 버틴다.
- 패킷 007~009: 사막 야영과 압둘라흐만 협상으로 260만 달러 계약을 닫는다.
- 패킷 010~012: 피레우스의 밀수 화물을 인수하고 추적 위험을 연다.
- 패킷 013~014: 화물을 통과시키고 자말과 ‘돈값과 배신 금지’의 관계 규칙을 굳힌다.

516~530화 `드라마 제작`처럼 15화인 사건은 다섯 패킷으로 나누되 모두 같은 `storyArcId`를 가진다. 이렇게 해야 각 1~3화의 Writer 입력은 짧고 강하게 유지하면서도 제작비·편성·캐스팅·납치라는 누적 압력과 최종 결산이 중간에 리셋되지 않는다.

### 5. Forecast 사용

Forecast는 다음 패킷의 2~5개 변주를 비교하는 데 사용한다. 선택된 분기는 현재 구현대로 비정본 Arc 초안이어야 한다. 다만 『대망』에서는 후보를 고른 직후 자동 변환된 빈 `turn`, `irreversibleChange`, `nextHook`, 관계·세계 변화 필드를 사람이 채우기 전 `ready`로 올리면 안 된다.

Forecast의 장거리 예측은 자연 사건 Arc의 가설에 남기고, 첫 1~3화만 `ArcPacket` 의무로 승격한다. 현재 구현이 먼 변화는 정본 계약으로 올리지 않도록 한 판단은 이 작품과 잘 맞는다. 반대로 branch의 모든 `risks`를 `mustAvoid`로 옮기는 기본값은 검토해야 한다. “자말이 다칠 위험”은 금지할 요소가 아니라 압력 또는 의도한 비용일 수도 있기 때문이다.

### 6. 원고 생성과 완료 감리

활성 패킷을 Writer에 넣을 때 현재 provenance를 유지하고 자연 사건 Arc 스냅샷을 한 층 더 붙인다. 생성 뒤에는 다음을 계획/실제 두 열로 검수한다.

- 이번 화에서 실제로 벌어진 사건과 마지막 훅.
- 약속한 보상이 지급됐는지, 지연됐다면 독자가 받은 중간 지급이 무엇인지.
- 돈·자산·지위·관계·부상·세계 상태 중 무엇이 바뀌었는지.
- 닫힌 루프와 새로 열린 루프.
- 해당 패킷이 자연 사건 Arc의 어느 압력 단계 또는 전환을 수행했는지.
- 원고에서 새로 생긴 고유명사·물건·관계가 기획서/Arc에 승격돼야 하는지.

패킷을 닫을 때 실제 회차 수를 B-Rail에 기록하고, 자연 사건 Arc를 닫을 때만 큰 결산과 인간적 여진을 확정한다. 실제 전개가 늘어나거나 줄면 현재 reflow 영수증을 이용해 이후 B 경로를 재배치하되, 이미 쓴 Chapter와 닫힌 Arc를 덮어쓰지 않는다.

## 현재 구조로 충분한 부분

- `ArcPacket`의 연속 1~3화와 회차별 비트 정렬은 실제 집필 컨텍스트 크기로 적절하다.
- Forecast 선택이 정본·원고를 덮어쓰지 않고 초안으로 남는 경계는 장편에서 안전하다.
- `mustKeep`, `mustAvoid`, `styleEmphasis`는 장소·물건·말투·이번 회차의 강도를 보존하기에 충분하다.
- active Arc와 Chapter provenance는 “그때 무엇을 계획하고 썼는가”를 사후 검증할 수 있게 한다.
- A-Rail의 비가역 변화, 인간 여진, 독자 약속, 보상 방향, 다음 압력은 『대망』의 장기 Anchor에 정확히 대응한다.
- B-Rail의 carried debt와 contrast requirement는 같은 거래·습격 구조가 반복처럼 보이지 않게 하는 데 유용하다.
- ready/stale/active binding 검증과 reflow 보호는 오래된 미래 계획이 현재 원고를 오염시키는 것을 막는다.
- Book 정본이 Rail보다 높고 Chapter가 Arc의 자식으로 강제되지 않는 권위 관계도 유지할 가치가 있다.

## 구조 자체를 개선해야 하는 부분

### 1. 자연 사건 Arc와 제작 패킷의 분리

가장 큰 간극이다. `ArcPacket` 이름을 바꾸지 않더라도 `storyArcId`를 추가하고 별도 `StoryArc` 저장소·UI·완료 영수증을 둬야 한다. 단순 태그만으로는 범위·경계 신호·중간 전환·결산·여진을 편집할 자리가 없으므로 이 부분은 보정 프롬프트가 아니라 구조 개선이다.

### 2. 1002화 B-Rail 용량 문제

현재 ready B-Rail의 최대 용량은 닫힌 항목의 실제 1~3화와 나머지 항목당 3화 합계가 Book 목표 회차 이상이어야 한다. 목표를 1002화로 두면 적어도 334개 B 항목이 필요하다. 먼 미래 300여 패킷에 `narrativeFunction`, `payoffAxis`, `carriedReaderDebt`, `contrastRequirement`를 미리 채우는 것은 허위 정밀도를 만든다.

장편에서는 `coveredThroughChapter`와 rolling horizon을 허용하고, 전체 Book 목표는 A-Rail과 자연 사건 Arc 가설이 담당해야 한다. 예컨대 ready B-Rail은 닫힌 과거 + 현재 1개 + 다음 provisional 1개 + 3~8개 hypothesis만 요구하고, 그 범위 밖은 미계획으로 정직하게 남기는 편이 낫다. Book 목표 전체를 B-Rail이 수용해야 한다는 검증은 단기 작품 모드와 장편 rolling 모드로 분리할 필요가 있다.

### 3. 여러 전선의 동시 진행

『대망』은 혁권의 현장, 김인철·김성균의 태일 후계전, 소현의 촬영, 정보기관의 반응을 한 회차 안에서도 교차 편집한다. 현재 Arc 필드는 단일 `goal/obstacle/turn/payoff`에 강하게 기울어 있다. `focusThread`, `cutawayPurpose`, `offstageChange`, `convergesAt` 정도의 얇은 스레드 계약이 필요하다. 모든 장면을 그래프로 만들 필요는 없지만, 김인철의 준비가 혁권의 다음 압력으로 언제 합류하는지는 추적해야 한다.

### 4. 자산·부상·의무의 장편 상태

광산·원유·미리내·샹그릴라·아메리칸 에너지·미디어 지분은 한 번 얻고 끝나는 보상이 아니라 나중에 다시 쓰이는 자원이다. 부하의 생사와 부상, 국가기관에 진 빚, 별칭 ‘존슨’과 법적 노출도 마찬가지다. 현재 character/world change 문자열만으로는 1000화 동안 가용 여부를 검증하기 어렵다. 자산 소유·위치·관리자·현재 가용성, 인물 부상·회복, 세력 신뢰·채무·적대 상태를 얇은 ledger로 두고 Writer에는 현재 Arc에 관련된 항목만 컴파일해야 한다.

### 5. 엄격 장편 모드

현재 optional Arc/Rail 로딩 실패는 경고 뒤 legacy Book → Chapter 경로로 계속 진행한다. 하위 호환에는 옳지만, 사용자가 Rails를 ready로 잠근 장편에서는 stale·binding conflict를 조용히 무시한 채 원고가 생성되면 더 큰 손실이 생긴다. Book별 `governedLongform` 모드를 두고, 이 모드에서는 ready Rail 불일치·자연 사건 Arc 부재·필수 상태 receipt 실패를 생성 전 hard stop으로 바꾸는 것이 맞다.

## 별도 보정층이 적절한 부분

- 회차별 긴장도·보상도·훅 강도와 정보/행동/관계/감정/물질 비중은 핵심 정본 스키마가 아니라 계획·감리 receipt로 붙인다. 숫자가 원고를 자동 지배하면 기계적인 파형이 생긴다.
- 고유명사 누락 검사는 생성 프롬프트와 감리 규칙으로 먼저 해결한다. 모든 인물·장소를 무거운 온톨로지로 만들 필요는 없다.
- 현실 고증, 무기 제원, 국제법 검사는 독자 재미와 별개의 research/audit 보정층으로 두고, 모순이 독서 경험을 깨뜨릴 때만 수정 후보로 올린다.
- 문체는 자연 사건 Arc의 감정 온도와 `ArcPacket.styleEmphasis`를 연결하되, 작가 고유 문장을 모사하는 방식이 아니라 대사 비중·장면 속도·설명 밀도·결산 체류 시간 같은 추상 계약으로 운용한다.
- 패킷 완료 뒤 `planned vs actual` 차이를 기록하는 감리와 다음 Forecast 재생성은 기존 reflow 위에 붙이는 보정층으로 충분하다.

## 페이싱을 생성 전 계획하고 생성 후 보정하는 방식

생성 전에는 자연 사건 Arc의 큰 파형을 먼저 정한다. 각 회차의 숫자를 공식으로 찍지 말고, 구체 사건을 적은 뒤 긴장·보상·훅을 판정한다. 예를 들어 `드라마 제작`은 제작비와 편성 문제를 정보 압력으로 쌓다가 함단 납치로 행동 압력이 급상승한다. 반면 `포상 휴가`는 긴장을 낮추고 소현과의 관계 보상을 오래 체류시키는 것이 기능이다. 두 Arc를 같은 상승 곡선으로 만들면 안 된다.

1~3화 패킷에는 이번 구간의 역할, 반드시 벌어질 비트, 종료 훅과 함께 `tensionTarget`, `rewardTarget`, `hookTarget`을 범위로 둔다. 예: 긴장 5~7, 보상 2~4처럼 여유를 남긴다. 생성 뒤 실제 사건을 보고 점수를 다시 매긴다. 목표와 실제 차이가 크면 원고를 무조건 고치지 않고 세 가지 중 하나를 선택한다.

1. 장면이 약해 약속이 안 보이면 원고를 보강한다.
2. 예상보다 중요한 인간 장면이 생겼으면 계획을 갱신하고 그 체류를 인정한다.
3. 큰 보상이 앞당겨졌으면 다음 패킷의 보상 축과 대비 요구를 바꾼다.

자연 사건 Arc가 닫힐 때는 큰 결산만 보지 않는다. 중간 지급 총합, 남은 독자 부채, 관계·지위·자산 변화, 사람에게 남은 여진, 다음 Arc가 무엇을 바꾸는지를 함께 정산한다. 이것이 『대망』처럼 같은 주인공이 천 회 동안 계속 더 큰 거래로 나아가면서도 이전 승리를 잊지 않게 하는 핵심 감리다.

## 우선순위

1. `ArcPacket` 위에 자연 사건 `StoryArc`와 `storyArcId`를 추가한다.
2. B-Rail에 장편 rolling-horizon 준비 상태를 추가해 334개 미래 패킷 선작성을 피한다.
3. 자연 사건 Arc 완료 receipt와 Chapter의 planned/actual 페이싱 receipt를 만든다.
4. 자산·부상·세력 채무 ledger를 추가하고 현재 Arc 관련 항목만 Writer에 주입한다.
5. Studio에 `A-Rail → 자연 사건 Arc → 현재 1~3화 패킷 → Chapter`를 한 화면에서 오갈 수 있는 편집 표면을 만든다.
6. ready Rails를 선택한 Book에 한해 stale·binding·receipt 실패를 생성 전 차단하는 엄격 장편 모드를 제공한다.

이 순서라면 현재 구현을 버리지 않고도 『대망』의 1002화짜리 야망, 장소·세력·시대 교대, 대결산과 인간적 여진을 끝까지 보존할 수 있다.
