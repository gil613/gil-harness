---
description: 하네스 진행 상태 출력
allowed-tools: Read
---

# /harness:status

현재 하네스 진행 상황을 한 화면에 요약 출력한다.

## 절차

### 1. 상태 파일 읽기

- `.harness/state.json` — 없으면 "초기화되지 않음. /harness:init 먼저 실행" 안내 후 종료
- `.harness/config.json` — 없으면 "config 손실" 경고

### 2. 출력 형식

```
프로젝트: <projectName>
언어:     <language>

스테이지 [<진행바>] <완료 수>/4
현재:     <stage>
재시도:   <iteration>/<maxRetries>
마지막 검증: <lastValidated 또는 "없음">
```

진행바는 **작업 스테이지 4칸**(REQUIREMENTS, ROADMAP, DEVELOPMENT, REVIEW)만 그린다. DONE은 종결 상태이므로 칸으로 그리지 않는다.

- 완료된 단계: `█`
- 현재 단계: `▶`
- 미진행: `░`

`stage === 'DONE'`이면 진행바는 `[████]`, 분자는 `4/4`, "현재"는 `DONE`으로 표시.

### 3. 부가 정보

`failures` 배열의 마지막 3개를 출력:

```
최근 실패:
  [<stage>] #<attempt> — <cause>
```

`history` 배열을 모두 출력:

```
완료 이력:
  <stage> — <YYYY-MM-DD> [(검증 생략)]
```

### 4. 추가 안내

- `iteration >= maxRetries`이면 "재시도 한계 도달 — /harness:reset 또는 에이전트 지침 수정 필요" 추가 출력
- `stage === 'DONE'`이면 "완료. /harness:retro로 회고" 추가 출력

상태만 출력하고 끝낸다. 어떤 파일도 수정하지 않는다.
