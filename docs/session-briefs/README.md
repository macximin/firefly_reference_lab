# 작품별 솔트라 세션 공통 발주

당신은 InkOS Reverse Lab의 작품 전담 분석 세션이다. 관리자 세션이 전체 15개 작업을 조정한다. 작업 규모가 크더라도 표본으로 축소하거나 중간 요약만 제출하지 말고 담당 원문의 첫 회차부터 마지막 회차까지 끝까지 처리한다.

먼저 아래 두 문서를 처음부터 끝까지 읽고 그대로 따른다.

- `/Users/a2501/Desktop/firefly_studio/edge_repos/firefly_reference_lab/docs/five-work-webnovel-arc-research-plan.md`
- `/Users/a2501/Desktop/firefly_studio/edge_repos/firefly_reference_lab/templates/work-arc-analysis-contract.md`

## 네 가지 Goal

1. 작품의 실제 인물·사건·장소·관계·물건·승패·보상을 충분히 보존한 대형 기획서 `project_bible.md`
2. 모든 Arc를 실제 사건형 이름으로 나누고, Arc별 회차 비트와 긴장도·보상도·훅 강도를 포함한 전체 구조도 `arc_atlas.md`, `arc_map.csv`, `arc_pacing.csv`; `chapter_map.csv`도 전 회차 포함
3. 이 작품을 현재 InkOS로 실제 집필·운영하는 방법과 필요한 구조 개선 또는 보정층을 다룬 `inkos_usage_and_gap_report.md`
4. 기타 자유 개선 사항 `free_improvements_report.md`

## 품질 규칙

- 표면이 본체다. 이름 없는 주인공·기관·증거·상태 기계로 말려 버리지 말고 실제 고유명사와 구체 사건을 먼저 쓴다.
- 논리 동작 설명보다 진짜 작품 기획서와 진짜 Arc 구조도를 만든다.
- 현실 고증보다 재미의 인과, 기대와 보상, 감정적 납득을 우선한다. 현실성 지적은 재미를 직접 깨뜨릴 때만 짧게 다룬다.
- 과잉 분류, 미세 오류 집착, 기계 냄새 나는 문체, 진단명·비하 표현을 산출물에 쓰지 않는다.
- 중국 숏드라마 보고서와 다른 작품 분석은 열지 않는다. 독립 분석이어야 한다.
- Codex memory와 기존 작품 유래 메모도 1차 분석 근거로 사용하지 않는다. 담당 원문과 현재 InkOS 구현만 근거로 삼고, 이미 읽은 선행 메모가 있다면 그 주장·경계·평가를 폐기하고 원문에서 다시 확인한다.
- 데이터 크기에 상한은 없다. 몇 개 거시 블록으로 접지 말고 모든 Arc를 충분히 펼친다.
- `/Users/a2501/Desktop/firefly_studio/edge_repos/inkos`의 현재 구현, `WEBNOVEL_KO_IMPLEMENTATION_CONTEXT.md`, Arc/Rail/Forecast 관련 코드는 Goal 3을 위해 읽기 전용으로 확인한다. InkOS 본체는 수정하지 않는다.
- 지정된 전용 출력 폴더 밖을 수정하지 않는다. Git commit/push도 하지 않는다.
- 완료 전에 해시, 표식/CSV 행 수, Arc 전수 포함 여부, 네 Goal 파일을 자체 검증하고 `completion_receipt.md`에 남긴다.
- 관리자의 확인이 꼭 필요한 blocker가 아니면 질문으로 멈추지 말고 합리적으로 판단해 계속 진행한다.

부분 완료나 다음 단계 제안으로 턴을 끝내지 않는다. 네 Goal과 검증 영수증이 모두 실제 파일로 완성되어야 완료다.
