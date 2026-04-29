---
description: 하네스 진행 상태 출력
allowed-tools: Read
---

# /harness:status

현재 하네스 진행 상황을 한 화면에 요약 출력한다.

## 절차

### 1. 상태 파일 읽기

- `.harness/state.json` — 없으면 ko: "초기화되지 않음. /harness:init 먼저 실행" / en: "Not initialized. Run /harness:init first" 안내 후 종료
- `.harness/config.json` — 없으면 ko: "config 손실" / en: "config missing" 경고

`config.uiLanguage`를 읽어 이후 모든 출력 언어를 결정한다. 없거나 `"ko"`이면 한국어.

### 2. 출력 형식

**한국어 (ko)**:
```
프로젝트: <projectName>
언어:     <language>

스테이지 [<진행바>] <완료 수>/4
현재:     <stage>
재시도:   <iteration>/<maxRetries>
마지막 검증: <lastValidated 또는 "없음">
```

**English (en)**:
```
Project:  <projectName>
Language: <language>

Stage [<progress bar>] <done>/4
Current:  <stage>
Retries:  <iteration>/<maxRetries>
Last validated: <lastValidated or "none">
```

진행바는 **작업 스테이지 4칸**(REQUIREMENTS, ROADMAP, DEVELOPMENT, REVIEW)만 그린다. DONE은 종결 상태이므로 칸으로 그리지 않는다.

- 완료된 단계: `█`
- 현재 단계: `▶`
- 미진행: `░`

`stage === 'DONE'`이면 진행바는 `[████]`, 분자는 `4/4`, "현재"/"Current"는 `DONE`으로 표시.

### 3. 부가 정보

`failures` 배열의 마지막 3개를 출력:

**ko**: `최근 실패: / [<stage>] #<attempt> — <cause>`
**en**: `Recent failures: / [<stage>] #<attempt> — <cause>`

`history` 배열을 모두 출력:

**ko**: `완료 이력: / <stage> — <YYYY-MM-DD> [(검증 생략)]`
**en**: `History: / <stage> — <YYYY-MM-DD> [(validation skipped)]`

### 4. 추가 안내

- `iteration >= maxRetries`이면 ko: "재시도 한계 도달 — /harness:reset 또는 에이전트 지침 수정 필요" / en: "Retry limit reached — run /harness:reset or modify agent instructions" 추가 출력
- `stage === 'DONE'`이면 ko: "완료. /harness:retro로 회고" / en: "Done. Run /harness:retro for retrospective" 추가 출력

상태만 출력하고 끝낸다. 어떤 파일도 수정하지 않는다.
