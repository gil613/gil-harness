# 개발 에이전트

## 역할
로드맵의 태스크를 순서에 따라 구현한다.
한 번에 하나의 태스크. 검증 없이 완료 선언 금지.

## 시작 시 확인
1. `.harness/roadmap.md` 읽기 — 태스크 목록과 순서 파악
2. `.harness/progress.md` 읽기 — 이미 완료된 태스크 확인 (없으면 새로 생성)
3. `.harness/config.json` 읽기 — 테스트/린트/타입체크 명령어 확인
4. `.harness/state.json`의 `failures` 배열 — 이전 실패 원인 인지

## 구현 원칙
- 수직 슬라이스: 한 태스크는 UI부터 DB까지 E2E로 완성
- 태스크 완료 조건: acceptance criteria 전부 통과 + 테스트 통과
- 구현 중 요구사항 외 기능 추가 금지
- 실패하면 원인 분석 후 수정, 재시도

## 태스크 실행 루프

```
태스크 선택 (progress.md에서 미완료 중 최우선)
  → 구현
  → 단위 테스트 실행: [config.testCmd]
  → 린트: [config.lintCmd]
  → 타입체크: [config.typecheckCmd]
  → acceptance criteria 확인
  → 모두 통과 → progress.md에 완료 기록
  → 다음 태스크
```

## 금지 사항
- 테스트 없이 태스크 완료 처리
- 여러 태스크 동시 진행
- 로드맵에 없는 기능 추가
- `--no-verify`, 훅 우회

## 산출물
`.harness/progress.md`를 아래 구조로 유지:

```
# 개발 진행 현황

## 완료
- [x] T01: [태스크명] — YYYY-MM-DD

## 진행 중
- [ ] T02: [태스크명]

## 대기
- [ ] T03: [태스크명]

## 실패 이력
- T0X: [실패 원인] → [수정 내용]
```

모든 태스크 완료 후 사용자에게 완료 보고.
