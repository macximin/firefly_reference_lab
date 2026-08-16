# Manager follow-up 시작 `chapter_map` 영수증

- 권위 스냅샷: `manager-followup-start-chapter_map-7053d49d.csv`
- SHA-256: `7053d49dc7025e48b56daa2b35458965918ffc570cd66be0f87f4239992581f8`
- 행 수: 751
- 용도: `chapter-narrative-boundary-audit-001-751.csv`의 11개 narrative field `before` 권위본
- 정본 처리: 현재 `chapter_map.csv`에는 역적용하지 않으며 비교 입력으로만 보존한다.

관리자 재현 순서:

1. `2026-08-14-doksik-pre-pacing-rework.tar.gz` 추출
2. `apply_chapter_corrections_001_250.rb`
3. `apply_chapter_corrections_251_500.rb`
4. `apply_chapter_corrections_501_751.rb`
5. `apply_n20_resegmentation.rb`
6. `apply_n33_n34_followup.rb`

`apply_manual_pacing_prose_followup.rb`는 실행할 때마다 위 스냅샷의 전체 SHA-256과 751행·sequence 집합을 먼저 검증하고, 불일치하면 정본과 장부를 쓰기 전에 중단한다.
