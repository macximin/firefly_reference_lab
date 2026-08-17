# 15작품 Reverse Lab 안전 정지 체크포인트

- 정지 시각: 2026-08-13 02:03 KST
- Lab Git 루트: `/Users/a2501/Desktop/firefly_studio/edge_repos/firefly_reference_lab`
- 체크포인트 이전 HEAD: `044b1b5331d5c85daa81fab6cc27a21677f6c954`
- 공통 작품 세션 설정: `gpt-5.6-sol` / reasoning `ultra` / service tier `fast` / Fast mode enabled
- 정지 확인: Lab 관련 `codex exec` 0개, 별도 ephemeral 실행 0개
- 원문·중국 자료: 변경 없음. 중국 자료는 아직 열지 않았다.
- InkOS 부모 저장소: 변경 없음.

## 안전성 영수증

정지 직후 `analyses/` 아래 파일 264개를 검사했다.

- 0바이트 파일: 0개
- CSV: 현재 존재하는 모든 파일이 CSV 파서로 열림
- JSONL: 현재 존재하는 모든 파일이 줄별 JSON 파서로 열림
- 주의: 파싱 성공은 작품 분석 완료나 sequence 완결을 뜻하지 않는다. 아래 표의 누락 범위와 QA 반려는 그대로 남아 있다.
- 미완성 `analyses/` 폴더는 의도적으로 Git에 올리지 않았다. QA PASS 전 산출물을 정본으로 오인하지 않게 하기 위한 조치다.

복구용 로컬 스냅샷:

- archive: `exports/checkpoints/2026-08-13-0200-kst-arc-lab-paused.tar.gz`
- archive SHA-256: `161e3dd4ea4de7ec3db82ef4abb862dac2ce2511a0d728c4443bbc7d4c953f25`
- archive readback: PASS
- file manifest: `exports/checkpoints/2026-08-13-0200-kst-analyses.sha256`
- manifest rows: 264
- manifest SHA-256: `5f09f5381e82905a54a8520cb8f1adaad3cfb3c6bc44bf773630874d6fcbf62a`

`exports/`는 Git 비추적 영역이다. 같은 머신의 위 경로에 복구 스냅샷이 남아 있다.

## 작품별 재개점

| 번호 | 작품 / thread ID | 안전하게 남은 것 | 다음 재개 작업 |
| --- | --- | --- | --- |
| 01 | 금수저 투자백서<br>`019ff6b4-45be-72e0-b9e1-8c94574ec210` | 상세 segment JSONL 1~686 전부. 최종 9파일도 있으나 범용 문구·평탄 점수로 반려됨. | `exports/session_logs/01-manager-correction.md`를 유지해 같은 thread 재개. 686행 기능 필드·페이싱과 37 Arc를 실제 장면으로 전수 재작성. |
| 02 | 독식하는 재벌 3세<br>`019ff6b4-462d-72f2-9c0b-7fde6fa94f45` | 최종 9파일, 751행, 97 Arc. 과거 validator는 0/0이었으나 새 검사에서 리본 척도 혼용 확인. | 251~500의 0~1 리본 250행과 나머지 1~10 리본 501행을 한 척도로 재판정. 297~500의 장기 5화 격자와 501~740의 10/20화 격자를 원문 자연 경계로 재분절한 뒤 관리자 QA를 처음부터 수행. |
| 03 | 마법 배운 재벌집 늦둥이<br>`019ff6b4-45ff-7663-a9a2-013cecfc25c9` | 상세 304행 보존. 기존 최종은 100 Arc 중 78개가 1~3화라 반려. `.work/narrative_arcs_*`에 3구간 자연 Arc 후보가 남음. | 자연 NarrativeArc 후보를 304행에 재매핑하고 최종 CSV·Atlas·Bible·보고서·receipt 동기화. |
| 04 | 이혼 후 재벌 각성!<br>`019ff6b4-45d0-7432-bd64-2107687e0ca6` | 최종 9파일과 재독해 JSONL 1~220 전부, 경계 검사 스크립트. | 101→102 정책거래, 184→196 앱스토어, 190→191 철수합의 미래 누출을 포함해 `start_line~end_line` 하드 경계로 220행 전수 재구축. ARC-012·022 재판정 후 파생 파일 전량 갱신. |
| 05 | 리턴 에이스<br>`019ff6b4-45ea-7200-8396-0e1021a7f613` | 최종 9파일, 310행·50 Arc, 수동 검토 노트와 수정 중인 build script. | 키워드 공식으로 만든 310행 페이싱을 장면별 편집 판단으로 전량 교체. RA-028·RA-040 재분절, 56화와 전 회차 ending hook 미래 요약 검사. |
| 06 | 성공시대<br>`019ff6d1-a60c-7f03-95fc-1ce25f3e77cb` | project bible·source receipt. 1~340 사건 노트, 341~540 일부 JSON, 561~580 일부 JSON, 681~1006 chapter/pacing 완성. | 541~560, 581~680을 우선 복원하고 이미 작성된 341~540도 연속성 검사. 이후 1~1006 자연 Arc와 9파일 통합. |
| 07 | 대망<br>`019ff6d1-a6af-78a2-bf04-f1253f706cdc` | Goal 문서 3개와 source receipt. 1~334 및 669~1002 chapter/pacing·Arc 자료 완성. | 정확히 335~668 구간부터 계속 읽고, 세 구간 경계를 자연 Arc로 접합한 뒤 최종 9파일 조립. |
| 08 | 법보다 주먹(개정판)<br>`019ff6d1-a5fe-7620-895a-c033713f70fe` | Goal 문서 3개와 source receipt. chapter 임시행 1~200, 281~440, 561~700. | 누락 201~280, 441~560, 701~830을 먼저 채운 뒤 Arc·pacing·Atlas를 생성. 기존 임시행도 경계 밖 사실 누출을 표본 검사. |
| 09 | 금수저생활백서<br>`019ff6d1-a5e6-7f10-84d8-1720620c34c4` | Goal 문서 3개와 source receipt. 상세 JSONL은 현재 1~55, 236~285, 470~509. 특히 470~475는 부모 세션 재독해본. | `exports/session_logs/09-manager-correction.md`를 유지해 같은 thread 재개. 누락 전 구간을 원문에서 계속 읽되 별도 `codex exec` 생성 금지. |
| 10 | 효종<br>`019ff6d1-a5f5-7dd0-bbd3-18de8353d317` | Goal 문서 3개와 source receipt. 임시 chapter 1~125, 167~222 등 부분 자료와 조립/감사 스크립트. | 126~166, 223~333, 334~500을 다시 완성. late 임시 CSV는 19행인데 sequence가 344에서 343으로 끝나므로 신뢰하지 말고 `build_late.rb` 입력부터 검사해 재생성. |
| 11 | 연봉 1조 신입사원<br>`019ff6d1-a61c-7eb1-90e2-a80d20163344` | Goal 문서 3개와 source receipt. early 1~126, middle1 127~250, middle2 251~377 chapter/pacing/Arc 자료. | 378~485 late 구간부터 계속하고, early 헤더/sequence 계약을 조립 전에 점검한 뒤 9파일 통합. |
| 12 | 졸부집 망나니(개정판)<br>`019ff6d1-a618-7891-90f7-ff188e320741` | Goal 문서 3개·source receipt·조기 completion receipt. chapter 1~75, 151~250; pacing은 1~21만 존재. | 22화부터 pacing을 계속하고 chapter 76~150, 251~450을 채운다. 완료 전에 기존 receipt는 폐기하지 말고 미완료 사실에 맞게 재작성. |
| 13 | 재벌가 막둥이는 만능 천재(개정판)<br>`019ff6d1-a612-7723-b5a6-ef52b7b5d110` | 1~380 chapter/pacing 네 part 전부와 Arc note 네 part. source·Gap·개선·Atlas·조기 receipt. | part 파일을 검증해 최종 chapter/arc/pacing으로 조립하고 project bible 작성. 기존 Atlas·receipt가 실제 최종 매핑과 일치하는지 재생성 수준으로 대조. |
| 14 | 남자의 길<br>`019ff6d1-a61a-72f1-b036-af4de4275002` | Goal 문서 3개와 source receipt. 임시 chapter 1~108, 109~216, 217~325로 전 325행 보존. | 실제 파일 문구를 기준으로 실패한 부분 패치를 다시 판단한 뒤, 325행을 조립해 자연 Arc·pacing·Atlas·receipt 작성. |
| 15 | 고려는 천조국이 되기로 하였습니다<br>`019ff6d1-a618-7641-b925-6dabf23f6aae` | source receipt·InkOS 보고서·개선 보고서. JSONL 1~73, 96~168, 191~280. | 누락 74~95와 169~190부터 채운 뒤 전체 280행을 build script로 통합하고 Bible·Arc·pacing·Atlas·receipt 작성. |

## 이미 확정된 관리자 반려

완료 승인 작품은 아직 `0/15`다.

1. 금수저 투자백서: 자동 해상도·대량복제·점수 평탄화 반려.
2. 마법 배운 재벌집 늦둥이: NarrativeArc와 1~3화 ArcPacket 혼동 반려.
3. 이혼 후 재벌 각성!: 후속 화 사실을 현재 화 지급으로 당기는 결함이 중·후반 반복되어 시스템성 FAIL.
4. 리턴 에이스: 310행 페이싱 공식 생성과 옴니버스 Arc 경계로 시스템성 FAIL.
5. 독식하는 재벌 3세: 새 validator에서 리본 척도 혼용으로 strict FAIL. 중·후반 고정 5/10/20화 격자도 시스템성 재작업 근거가 확보됨. 원문 관리자 표본 QA는 아직 0회이므로 최종 15항목 판정은 재개 후 수행한다.

## 검사기 체크포인트

다음 변경은 안전 정지 직전 완료했고 분석 산출물은 건드리지 않았다.

- `templates/work-arc-analysis-contract.md`: 한 작품은 리본 척도 하나만 사용하도록 계약 명시
- `tools/validate-five-work-analyses.mjs`: 비수치, 범위·형식 위반, 비율/백분율 합계 오류, 작품 내 척도 혼용 검사
- `tests/validate-five-work-analyses.test.mjs`: 관련 회귀 테스트 추가
- 테스트: 6/6 PASS
- `git diff --check`: PASS
- 독식 재검: `1~10 정수 강도형 501행 + 0~1 정규화 비율형 250행` 혼용 경고로 strict FAIL

## 정확한 재개 순서

1. 이 문서와 `docs/manager-manual-qa-rubric.md`를 읽는다.
2. Lab Git 상태와 복구 archive SHA-256을 확인한다.
3. `analyses/`를 덮어쓰거나 초기화하지 않는다. 우선 기존 임시 파일의 CSV/JSONL 파싱과 마지막 연속 sequence를 다시 확인한다.
4. 작품별 기존 thread ID를 `codex exec resume`로 재개한다. 새 작품 thread를 만들지 않는다.
5. 공통 실행 설정은 반드시 Sol / ultra / fast / Fast mode를 그대로 사용한다.
6. 01·03·04·05·09는 기존 관리자 correction을 우선한다. 02는 이 문서의 리본 척도와 고정 격자 반려를 새 correction으로 전달한다.
7. 각 작품은 9파일 작성 후 strict 오류 0·경고 0을 먼저 통과한다.
8. 관리자 수동 QA는 원문 초·중·후 고정 표본과 15항목을 모두 PASS해야 한다. FAIL이면 같은 thread에 재작업한다.
9. 15작품 전부 승인되기 전 중국 자료를 열지 않고 비교 합성도 시작하지 않는다.

재개 명령 형식:

```sh
/opt/homebrew/bin/codex exec resume --json \
  -m gpt-5.6-sol \
  -c 'model_reasoning_effort="ultra"' \
  -c 'service_tier="fast"' \
  -c 'features.fast_mode=true' \
  --output-last-message exports/session_logs/NN-resume-final.txt \
  THREAD_ID - < RESUME_PROMPT.md
```

여러 작품을 다시 켤 때도 먼저 프로세스 수와 설정을 확인하고, nested `codex exec --ephemeral`이 생기면 해당 작품만 즉시 중단·교정한다.
