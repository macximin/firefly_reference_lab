# InkOS Reverse Lab

내 작품과 참고 작품을 비교해 **재사용 가능한 서사 구조**를 추출하는 독립 연구 저장소다.

InkOS 본체는 집필·감리·수정에 집중한다. 이 저장소는 작품 간 구조 비교, 증거 기록, 분석 도구, 그리고 InkOS에 반영할 기획·Arc 인사이트를 보관한다.

## 작업 원칙

1. 원문은 로컬 입력 폴더에만 두고 Git에 커밋하지 않는다.
2. 분석 목적은 작가의 문장을 모사하는 것이 아니라, 훅·갈등·전환·보상·클리프행어 같은 추상 구조를 비교하는 것이다.

## 시작하기

1. `evidence/source_manifest.json`에 분석 대상과 로컬 위치를 등록한다.
2. 원문은 `private_sources/korean_webnovel_corpus/<필명>/<work-id>.txt`에 둔다. 이 경로는 커밋되지 않는다.
4. `analyses/<work-id>/structure.md`에 회차/Arc 단위 분석을 작성한다.
5. 여러 작품의 공통점과 차이는 `comparisons/`에 기록하고, InkOS 적용안은 `inkos_handoffs/`에 남긴다.

검증:

```bash
node tools/validate-source-manifest.mjs
```

## 폴더

| 경로 | 역할 |
| --- | --- |
| `private_sources/` | 커밋하지 않는 로컬 원문 입력. |
| `reference_inputs/` | 커밋하지 않는 참고 분석 입력. |
| `evidence/` | 로컬 위치·해시·접근일이 기록된 매니페스트와 증거 메모. |
| `analyses/` | 작품별 구조 분석: 약속, 압박, 전환, 보상, 다음 훅. |
| `comparisons/` | 내 작품 간 및 레퍼런스 대비 분석. |
| `inkos_handoffs/` | 기획서·Arc·문체 계약에 반영할, 모사 없는 추상 인사이트. |
| `tools/` | 재현 가능한 검사와 분석 보조 도구. |
| `tests/` | 도구와 분석 계약의 회귀 테스트. |

## 최소 분석 단위

`analyses/<work-id>/structure.md`는 각 회차 또는 1~3화 Arc마다 아래를 기록한다.

- 독자에게 한 약속과 즉시 주는 보상
- 주인공 목표·장애·압박
- 전환점과 되돌릴 수 없는 상태 변화
- 회차 종료 훅
- 인물·관계·세계 상태 변화
- 근거 위치와 신뢰도

`templates/structure-analysis.md`를 복사해서 시작한다.
