# 자연 NarrativeArc 재작업 작업대

이 폴더는 2026-08-13 관리자 재개 지시에 따른 단계 A~C의 신규 근거와 최종 검증 자료를 보관한다.

- 권위 입력: `private_sources/korean_webnovel_corpus/서오/독식하는 재벌 3세_서오_합본.txt`
- 재검증 원문 SHA-256: `66f3e7df3123343c14a7134108dc59940511f40372493a549cba8ae709df4b45`
- 재검증 회차 표식: `751`
- 복구 기준: `exports/checkpoints/2026-08-13-doksik-pre-rework.tar.gz`
- 복구본 SHA-256: `30de704f3dfc5cbbec4c88129d41684e08d452d9bf384fd30ffd4a91bc5e2d33`
- 기존 `chapter_map.csv`는 탐색 보조로만 사용한다.
- 기존 97개 Arc ID·길이·장 제목·작업 구간을 자연 경계의 전제로 삼지 않는다.
- 단계 A와 B를 닫은 뒤에만 최종 `arc_map.csv`, `chapter_map.csv`, `arc_pacing.csv`, `arc_atlas.md`를 교체했다.
- 자연 Arc 경계는 원문 장면에서 확인되는 신호 둘 이상으로만 확정한다.

## 현재 결과

- 확정 자연 NarrativeArc: `74개`
- 연속 범위: `1~751`, 빈틈 `0`, 중복 `0`
- 회차별 pacing 근거: `pacing/pacing-all-evidence.csv` 751행
- 고득점·관계 변화 QA 색인: `high-score-and-relationship-evidence.csv` 537행
- 회차 의미 readback: `PASS chapter semantic lint rows=751`
- strict 검증: `PASS 독식하는 재벌 3세: 751회 / 74 Arc / 오류 0 / 경고 0`
- 최종 커밋·푸시: 수행하지 않음

## 단계 A 구간 파일

- `segments/candidates-001-200.md`
- `segments/candidates-201-400.md`
- `segments/candidates-401-600.md`
- `segments/candidates-601-751.md`
- `checkpoint-001-200.md`
- `checkpoint-201-400.md`
- `checkpoint-401-600.md`
- `checkpoint-601-751.md`

네 구간의 분할선은 독해 체크포인트일 뿐 Arc 경계가 아니다. 분할선을 넘는 후보는 `open boundary`로 남긴 뒤 단계 A 통합에서 원문을 다시 대조한다.

## 단계 B·C 파일

- 통합 후보 지도: `natural_arc_candidates.md`
- 경계 반례 통합: `boundary_counterexamples.md`
- 구간별 반례·기존 97 Arc 매핑: `reviews/stage-b-*.md`
- 장면별 편집 판단: `pacing/pacing-*.csv`
- 최종 파생 조립 근거: `final_parts/arc-map-*.csv`
- 최종 원문 역대조: `reviews/final-qa-*.md`
- 로컬 readback: `validate_rework.rb`

`build_root_arc_parts.rb`와 `build_final_rework.rb`는 근거 CSV를 최종 파일 형식으로 조립하고 연속성·리본 합계를 거부하도록 만든 파생 도구다. Arc 경계, 점수, 리본의 내용을 키워드·정규식·화수 위치로 생성하지 않는다.
