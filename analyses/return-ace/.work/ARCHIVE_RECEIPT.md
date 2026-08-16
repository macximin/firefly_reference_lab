# 《리턴 에이스》 제로로스 작업 아카이브 영수증

- 처리일: 2026-08-15 (Asia/Seoul)
- 방식: 삭제·압축·내용 축약 없이 동일 파일을 콜드 폴더로 이동
- 정본 아홉 파일: 이동·변경 없음. 단 `completion_receipt.md`의 아카이브 경로 안내만 갱신
- 활성 근거: `rework_natural_arc/`의 수동 권위 입력·생성기·검증기·관리자 QA는 현 위치 유지
- 골드 체크포인트: `checkpoints/2026-08-15-return-ace-gold-approval.md` 현 위치 유지

## 이동 묶음과 무결성

| 묶음 | 원래 위치 | 콜드 위치 | 파일/링크/디렉터리 | 바이트 | 이동 전후 트리 SHA-256 |
|---|---|---|---:|---:|---|
| 승격 전 체크포인트 2세트 | `.work/checkpoints/`의 resume baseline·pre-gold promotion 4파일 | `.work/archive/2026-08-15-zero-loss/checkpoints_pre_gold/` | 4 / 0 / 0 | 905,318 | `7c49dea0b59e088d5aa3e55366c05ee0091fcf307d148521e09b1e32cc001d30` |
| strict 미러 스냅샷 | `.work/rework_natural_arc/strict_mirror/` | `.work/archive/2026-08-15-zero-loss/strict_mirror_snapshot/strict_mirror/` | 1 / 10 / 7 | 20,621 | `18fc000fb25677c80cf37285ec589096a23d41ef2980af7f369550db5265c479` |

트리 SHA는 정렬된 각 항목의 종류, 상대 경로, POSIX 권한, 파일 크기, 파일 내용 SHA-256 또는 심볼릭 링크 대상을 묶어 다시 SHA-256한 값이다. 이동 전후 값이 일치한다.

## 복원

복원이 필요하면 두 콜드 묶음을 표의 원래 위치로 그대로 역이동한다. basename과 하위 구조를 바꾸지 않았으므로 별도 변환은 없다. `prepare_strict_mirror.mjs`를 실행하면 strict 미러는 새로 생성할 수도 있다.

커밋·푸시는 하지 않았다.
