# InkOS Reverse Lab

내 작품과 참고 작품을 전수 비교해 **웹소설에 맞는 실제 Arc 구조와 페이싱**을 추출하는 독립 연구 저장소다.

InkOS 본체는 집필·감리·수정에 집중한다. 이 저장소는 작품 간 구조 비교, 증거 기록, 분석 도구, 그리고 InkOS에 반영할 기획·Arc 인사이트를 보관한다.

## 작업 원칙

1. 원문은 로컬 입력 폴더에만 두고 Git에 커밋하지 않는다.
2. 실제 인물·사건·장소·관계·물건·승패·보상을 먼저 보존한다. 추상 용어가 작품 표면을 대신하면 불합격이다.
3. 현실 고증보다 재미의 인과, 기대와 보상, 감정적 납득을 기준으로 본다.
4. 자연 사건 Arc와 1~3화 제작 패킷을 미리 같은 단위로 가정하지 않는다. 원문에서 경계를 찾는다.

## 시작하기

1. 원문은 `private_sources/korean_webnovel_corpus/<필명>/`에 둔다. 이 경로는 커밋되지 않는다.
2. `docs/session-briefs/`에서 담당 작품 발주를 읽고 `templates/work-arc-analysis-contract.md`를 따른다.
3. `analyses/<work-slug>/`에 전 회차 지도, 전체 분석 기획서, 작품소개 포함 피치, Arc Atlas·페이싱, InkOS 적용·간극 보고서, 자유 개선 보고서와 완료 영수증을 만든다.
4. 관리자 검수를 통과한 작품만 `comparisons/`에서 비교하고, InkOS 적용 계약은 `inkos_handoffs/`에 남긴다.

검증:

```bash
node tools/validate-source-manifest.mjs
node tools/validate-five-work-analyses.mjs --strict
node tools/validate-writing-system-contracts.mjs
```

## 폴더

| 경로 | 역할 |
| --- | --- |
| `private_sources/` | 커밋하지 않는 로컬 원문 입력. |
| `reference_inputs/` | 커밋하지 않는 참고 분석 입력. |
| `evidence/` | 로컬 위치·해시·접근일이 기록된 매니페스트와 증거 메모. |
| `docs/session-briefs/` | 작품별 독립 분석 발주와 입력·출력 경계. |
| `templates/` | 회차·Arc·기획서·보고서 공통 분석 계약. |
| `analyses/` | 작품별 전 회차 지도, 기획서, Arc Atlas·페이싱과 InkOS 보고서. |
| `comparisons/` | 내 작품 간 및 레퍼런스 대비 분석. |
| `inkos_handoffs/` | 기획서·Arc·문체 계약에 반영할, 모사 없는 추상 인사이트. |
| `tools/` | 재현 가능한 검사와 분석 보조 도구. |
| `tests/` | 도구와 분석 계약의 회귀 테스트. |
| `exports/` | 커밋하지 않는 세션 로그와 관리자 임시 산출물. |

## 작품별 필수 산출물

새로 분석하거나 갱신하는 작품은 다음 10개 파일을 최소로 갖는다. 기존 분석은 `--require-pitch`를 지정했을 때만 피치를 필수로 검사한다.

- `source_receipt.json`
- `chapter_map.csv`
- `project_bible.md`
- `project_pitch.md`
- `arc_map.csv`
- `arc_pacing.csv`
- `arc_atlas.md`
- `inkos_usage_and_gap_report.md`
- `free_improvements_report.md`
- `completion_receipt.md`

전체 필드와 완료 조건은 `templates/work-arc-analysis-contract.md`가 권위다. 전 회차를 한 행씩 포함하고, 모든 Arc에 실제 사건형 이름·구체 인물·장소·결산·다음 훅과 회차별 페이싱을 남긴다. `project_pitch.md`는 공식 소개 복원이 아니라는 사실과 근거 범위를 밝힌다.
