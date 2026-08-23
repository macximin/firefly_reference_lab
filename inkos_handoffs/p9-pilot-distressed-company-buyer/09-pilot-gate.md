# P9 Pilot Gate · 《부도난 회사만 삽니다》

> **삭제 상태 · 2026-08-17 · `INTENTIONALLY_DELETED_BY_OWNER`:** 이 문서는 owner가 거부·삭제한 외부 프리프로덕션 팩의 역사적 본문이다. 활성 InkOS 작품이나 집필 지시가 아니며, 이 작품을 다시 살린다는 새로운 명시적 owner 승인 없이는 복구·검토·집필하지 않는다. 아래 상태 표기는 삭제 전 시점의 기록이다. 최신 근거: `../../docs/2026-08-23-p9-owner-deletion-receipt.md`.

## 준비 판정

상태: `B001_CH1_READY_FOR_REVIEW`
원고 상태: 1화 `ready-for-review`, 2~3화 미착수
InkOS 프로젝트: `books/부도난-회사만-삽니다`

## 게이트 확인

| 요구 자료 | 상태 | 근거 |
| --- | --- | --- |
| 작품소개 포함 피치 | PASS | `project_pitch.md` |
| Series Contract | PASS | `01-series-contract.md` |
| Entry Contract | PASS | `02-entry-contract.md` |
| 첫 3개 NarrativeArc v2 | PASS | `06-narrative-arcs.md` |
| 첫 1~3화 Chapter Packet | PASS | `07-first-chapter-packet.md` |
| Reward & Pacing 계획 | PASS | `08-reward-pacing-ledger.md` |
| 주요 인물 코어·효용 | PASS | `05-character-cores.md` |
| Gold Router와 복제 금지선 | PASS | `04-gold-router.md` |
| A/B Rail 초안 | PASS | `03-story-rails-draft.md` |
| 현재 시장 근거 | PASS, baseline-only | `firefly_market_radar@6d50cbe` |

## 복제 반례 검사

- 태겸의 전용 HOW는 미래 사건을 골라 투자하는 방식이 아니다. 현재 회사의 장부와 설비, 계약을 맞춰 손실 수혜자를 찾는다.
- 첫 사건은 걸프전·외환위기·은행·유전 인수와 겹치지 않는다. 고유 물건은 구리 코일, 프레스 전력계, 임금채권, 우선주다.
- 보조 골드에서 가져온 것은 남은 시간, 작은 판정, 공개 점수의 박자다. 야구 경기와 기록, 팀 이동은 사용하지 않는다.
- 현재 시장 목록의 제목과 설정을 사건 재료로 쓰지 않았다. 공개 제목에서 `전문 역할 + 돈·지위` 결합 가설만 받았다.

## owner lock 결과

1. 작품명 《부도난 회사만 삽니다》 유지
2. 12년 회귀 유지, 미래 기억은 직접 실사한 회사로 제한
3. 첫 30화 로맨스 미가동
4. A01만 확정, A02 이후 산업은 sparse 유지
5. 첫 파일럿 3화, 회차당 공백 포함 4,800~5,500자
6. InkOS targetChapters는 제품 용량용 임시 스냅샷 200으로 생성하며 실제 완결 회차는 파일럿 뒤 재판정

## 권장 기본값

- 가제 유지
- 12년 회귀 유지, 미래 기억은 직접 실사한 회사로 제한
- 첫 30화 로맨스 미가동
- A01만 확정하고 A02 이후 산업은 sparse 유지
- 첫 파일럿은 3화, 회차당 공백 포함 4,800~5,500자

## 다음 실행

한국어 작품과 참고자료 묶음, 문체·화법 계약, `story/rails/plan.json`, 첫 3개 ArcPacket 생성을 완료했다. B001만 active이며 B002·B003은 draft다. 1화 `내 이름으로 망한 회사`는 공백 포함 5,179자로 집필했고 최종 감사 PASS다. 다음은 사람 검토 뒤 승인하거나, 지적을 반영한 다음 2화로 진행하는 일이다.

3화가 끝나면 다음을 비교한다.

- Gold Router가 사건 복제 없이 판단을 도왔는가
- 태겸의 전문 역할이 설명보다 행동으로 보였는가
- 3화의 구리 재고와 지급 정지가 충분한 보상인가
- 한국어 원고에 영어·중국어 제어 문구나 번역투가 노출됐는가
- 다음 3화의 급여·지분 약속이 선명하게 남았는가

이 비교가 PASS일 때만 B002를 집필하고, 그 결과를 바탕으로 Gold 역할과 카드 필드를 줄이거나 확정한다.
