# 《독식하는 재벌 3세》 제로로스 작업 아카이브 영수증

- 처리일: 2026-08-15 (Asia/Seoul)
- 방식: 삭제·압축·내용 축약 없이 동일 파일과 디렉터리를 콜드 폴더로 이동
- 정본 아홉 파일과 `manager_final_qa.md`: 이동·변경 없음
- 활성 최종 stage: `rework_natural_arc/pacing_rework_2026-08-14/stage-manager-redteam-v3-2026-08-14/` 현 위치 유지
- 수동 장부·검증기·reviews·segments·pacing·final_parts: 현 위치 유지

## 이동 묶음과 무결성

| 묶음 | 원래 위치 | 콜드 위치 | 파일/링크/디렉터리 | 바이트 | 이동 전후 트리 SHA-256 |
|---|---|---|---:|---:|---|
| 초기 분할 작업 | `.work/` 바로 아래 README·rework 폴더를 제외한 25파일 | `.work/archive/2026-08-15-zero-loss/legacy_flat_work/` | 25 / 0 / 0 | 1,922,809 | `28375b1e16ea5896351809d591f00669907a09fcd8cdf2ae70aa4bfb04a075d8` |
| superseded red-team v1/v2 | `rework_natural_arc/pacing_rework_2026-08-14/`의 v1·v2 stage | `.work/archive/2026-08-15-zero-loss/superseded_stages/` | 62 / 0 / 8 | 20,264,275 | `a19e427274763a34fd31ee0453eb4155c7f338fd286cb85a3c9ac73be86aefea` |
| 루트 단편 파생본 | `analyses/doksik-chaebol3/final_parts/` | `.work/archive/2026-08-15-zero-loss/legacy_root_outputs/final_parts/` | 1 / 0 / 1 | 135,390 | `5e1067ece91ee357e9f89ec8f63ac0063d1d80c63ab8a1c83d6c28c0869c84b2` |

트리 SHA는 정렬된 각 항목의 종류, 상대 경로, POSIX 권한, 파일 크기와 파일 내용 SHA-256을 묶어 다시 SHA-256한 값이다. 세 묶음 모두 이동 전후 값이 일치한다.

## 복원

- `legacy_flat_work/`의 25파일은 basename 그대로 `.work/` 바로 아래로 역이동한다.
- `superseded_stages/`의 두 stage 디렉터리는 `rework_natural_arc/pacing_rework_2026-08-14/`로 역이동한다.
- `legacy_root_outputs/final_parts/`는 작품 루트로 역이동한다.

`build_gold_checkpoint.rb`와 `apply_v3_to_canonical.rb`는 과거 v1/v2 원위치를 참조하는 일회성 마감 도구다. 이 두 도구를 역사 그대로 재실행하려면 먼저 superseded stage를 위 원위치로 복원한다. 현재 정본 검증에는 복원이 필요하지 않다.

커밋·푸시는 하지 않았다.
