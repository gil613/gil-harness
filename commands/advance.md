---
description: 검증을 생략하고 다음 스테이지로 강제 이동 (긴급용)
allowed-tools: Read, Edit
---

# /harness:advance

현재 스테이지를 검증 없이 통과 처리하고 다음 스테이지로 이동한다. **긴급 상황에서만 사용**.

## 절차

### 1. 사용자 확인

`.harness/config.json`을 읽어 `uiLanguage`를 확인한 뒤 이후 모든 출력 언어를 결정한다. 없거나 `"ko"`이면 한국어.

사용자에게 명시적으로 한 번 묻는다:

**ko**: > 검증을 생략하고 다음 스테이지로 강제 이동합니다. 진행할까요? (yes/no)
**en**: > Skipping validation and force-advancing to the next stage. Continue? (yes/no)

`yes`/`y`가 아니면 중단.

### 2. state.json 읽고 판정

- `.harness/state.json` 없으면 ko: "초기화 필요" / en: "Not initialized" 후 종료
- `state.stage === 'DONE'`이면 ko: "이미 마지막 스테이지" / en: "Already at the last stage" 후 종료

### 3. 다음 스테이지 계산

```
STAGES = ['REQUIREMENTS','ROADMAP','DEVELOPMENT','REVIEW','DONE']
next = STAGES[STAGES.indexOf(state.stage) + 1]
```

### 4. state.json 갱신 (Edit 도구)

다음 필드를 갱신한다:

- `stage`: next
- `iteration`: 0
- `history`: 기존 배열에 다음 항목 append
  ```json
  {
    "stage": "<현재 stage>",
    "completedAt": "<ISO 8601 현재 시각>",
    "skippedValidation": true
  }
  ```

다른 필드(`failures`, `lastValidated`, `maxRetries`, `schemaVersion`)는 건드리지 않는다.

### 5. 출력

**ko**: `<이전 stage> -> <next> (검증 생략)`
**en**: `<prev stage> -> <next> (validation skipped)`
