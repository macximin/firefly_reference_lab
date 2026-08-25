# 《독식하는 재벌 3세》 Reference Transformation Pack v1

이 팩은 《독식하는 재벌 3세》 751화와 131개 승인 Gold NarrativeArc를
InkOS 장편 제작에 전달한다. 원작과의 거리를 만드는 도구가 아니라, 검증된
상업 엔진을 어느 Rail·Arc·회차에 옮겼는지 추적하는 도구다.

## 파일 경계

- `reference-pack.json`: Git에 남는 검색·변형·상업성 정책과 private input SHA
- `transformation-contract.schema.json`: 작품별 source→target 변형 지도 계약
- `receipt.json`: 원천·분석·tracked/private 산출물 무결성
- `exports/reference-packs/doksik-chaebol3-ko-v1/story-index.jsonl`: 로컬 전용
  751화 전수 이야기 검색 인덱스
- `exports/reference-packs/doksik-chaebol3-ko-v1/style-examples.jsonl`: 로컬 전용
  5시기 × entry/escalation/payoff 실제 원문 문체 예문 15개
- `exports/reference-packs/doksik-chaebol3-ko-v1/index.json`: 로컬 전용 파일 SHA

원문 본문은 tracked 팩에 복사하지 않는다. Writer는 해시로 승인된 로컬
원천과 private input에서 현재 변형 지도에 매핑된 회차 1~3개의 실제 장면,
같은 시기·기능의 문체 예문을 읽는다.

## 제작 원칙

- 작품마다 주축 `spineReference` 하나를 둔다.
- 사건 순서, 인물 역할, 압박, 반전, 지급, 훅은 의도적으로 유지할 수 있다.
- 인명·조직·물건·공간·국소 원인을 변주할 때 돈·증거·절차·역할·결과를
  같은 장면 묶음에서 함께 바꾼다.
- 구조·의미 유사성을 감점하지 않고 최소 거리 점수를 만들지 않는다.
- Writer 출력은 자동 재작성하지 않는다. 변형 비교 HIL에서 사람이
  `accept | polish | reject`를 결정한다.

## 생성과 검증

```text
node tools/build-corpus-reference-pack.mjs
node --test tests/build-corpus-reference-pack.test.mjs
```

생성기는 현재 원천 SHA, 751개 비어 있지 않은 회차, `chapter_map.csv`
751행, `arc_map.csv` 131행, 관리자 rubric 15/15를 모두 확인한 뒤에만 쓴다.
