# 《리턴 에이스》 후보 정본 보존 장부

- 기준일: 2026-08-15
- 후보 작업 경로: `analyses/return-ace/.work/rework_natural_arc/`
- 루트 정본: 미승격, 읽기 전용 보존

## 보존 원본

| 파일 | SHA-256 | 보존 판단 |
| --- | --- | --- |
| `project_bible.md` | `b5b372e7a27e448a907e1ba87a10e8e0c483a801e1145e04dcc36715d1d49a77` | 작품 전체 사실·인물·커리어·결말 서술을 그대로 후보에 복제한다. 문서 안에 50 Arc 고정 참조가 없어 내용 수정이 필요하지 않다. |
| `chapter_map.csv` | `6aa4eccedc4d0f6e53839ed5aed7799b0015541ceb6ce7aa29d271ad3f6d2d46` | 310행의 표식·제목·원문 행 범위는 보존한다. 사건 사실 7필드와 경계 필드는 310회 원문 경계 감사 뒤 수동 권위 입력으로 전수 교체하고, Arc 참조도 자연 Arc 장부에 맞춘다. |
| `arc_map.csv` | `24dd3d74babedf2822d1fb12a8f77a1907952869fbc0f822ba9a4680eb109074` | 기존 50 Arc 중 자연 경계가 유지되는 45개 Arc의 서술 표면을 재사용한다. 재분절 10개 Arc는 새 수동 메타데이터로 대체한다. |
| `arc_pacing.csv` | `60c82ecf58c77aab48692808975c7c9be1d6b4260489a8f42b58d0820fe9a0a2` | 기존 페이싱 값은 보존 대상이 아니다. 310회 수동 권위 장부로 전량 교체한다. |
| `arc_atlas.md` | `c3b35d92e3ec24bf5af2ad779991d33b38c923c93698f6071a1834719e0aea93` | 이전 50 Arc 표·평균은 보존 대상이 아니다. 후보 CSV에서 다시 조립한다. |
| `completion_receipt.md` | `3aba4c553a34a0164271067f8ec2244abeaccc999f4cbff97cd136803f7d8d6c` | 이전 완료 선언은 보존 대상이 아니다. 이번 수동 전수 판정·검증 결과를 새로 기록한다. |

## `chapter_map.csv` 후보 변경 범위

원본에서는 `sequence`, `visible_label`, `title`, `start_line`, `end_line`, `state_change_axis`만 보존한다. 다음 열은 원문 경계 안의 실제 사건과 자연 Arc 장부를 권위로 전수 교체한다.

- `reader_promise`, `protagonist_goal`, `action`, `resistance_or_cost`, `turn_or_reveal`, `paid_reward`, `state_change`: `manual_chapter_fact_authority.csv`의 310회 수동 사실 판정

- `entry_state`: 310회 수동 리뷰의 `진입 장면`
- `ending_hook`: 해당 표식 안 실제 마지막 장면을 대조한 `종료 훅`
- `closed_loops`: 같은 회차 안에서 실제 지급된 `닫힌 루프`
- `opened_loops`: 마지막 장면에 남은 `열린 루프`
- `arc_id`: 새 자연 Arc 55개에 맞춘 참조
- `confidence`: 수동 경계 장부의 Arc 신뢰도

종료 경계 감사에서 기존 세그먼트의 선행 결과가 여러 시기에 반복됨을 확인했으므로 `entry_state`, `ending_hook`, `closed_loops`, `opened_loops`는 표본 수정이 아니라 310회 전수 교체 대상으로 확장했다. 56·107·214·242·248·296·305·309·310화는 교체 효과를 확인하는 고정 반례다.

관리자 1차 QA에서 `action`, `turn_or_reveal`, `paid_reward`, `state_change`에도 다음 회차 결과가 앞당겨진 사례가 중·후반에 반복됨을 확인했다. 이에 일곱 사실 필드 전체를 1~310화 원문 경계에서 다시 판정했고, 18개 회차를 교정했다. 후보 `chapter_map.csv`는 더 이상 루트 정본의 기존 사실 문구를 읽지 않는다.

## 불변 조건

- 원문 SHA-256 `d1dd84aebe77ece8f17e4b4448b739c3106931ccec5f2008933b385b74b8ba45`
- 원문 표식 310개, `chapter_map.csv` 310행, `arc_pacing.csv` 310행
- 루트 정본 파일은 관리자 승격 전까지 위 SHA-256을 유지한다.
- 후보 생성기는 위 장부와 수동 권위 입력을 조립만 하며 장면 강도·리본·Arc 단계·경계를 추론하지 않는다.
