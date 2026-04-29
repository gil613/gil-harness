---
description: iteration/failures 리셋 (maxRetries 초과 후 재시도용)
allowed-tools: Read, Edit
argument-hint: "[--iteration|--failures|--all]"
---

# /harness:reset

검증 재시도가 한계에 도달했을 때, 에이전트 지침이나 요구사항을 수정한 후 이 명령으로 카운터를 리셋해 재시도할 수 있게 한다.

## 인수

- `--iteration` (기본): `iteration`만 0으로 리셋
- `--failures`: `failures` 배열 비우기
- `--all`: iteration + failures 모두 리셋
- `--stage <STAGE>`: 추가 옵션 — 특정 스테이지로 강제 이동 (위험, 명시적 확인 필요)

인수 없으면 `--iteration --failures` 둘 다 리셋(가장 흔한 케이스).

## 절차

### 1. state.json 읽기

`.harness/config.json`을 먼저 읽어 `uiLanguage`를 확인한다. 없거나 `"ko"`이면 한국어.

`.harness/state.json` 없으면 ko: "초기화 필요" / en: "Not initialized" 후 종료.

### 2. 사용자 확인 (--stage 사용 시에만)

`--stage` 인수가 있으면 명시적으로 한 번 더 확인:

**ko**: > 스테이지를 <X>로 강제 변경합니다. 산출물과 history는 보존됩니다. 진행할까요? (yes/no)
**en**: > Force-changing stage to <X>. Outputs and history will be preserved. Continue? (yes/no)

### 3. Edit으로 state.json 갱신

기본(인수 없음 또는 `--iteration` + `--failures`):

```diff
- "iteration": <기존값>,
+ "iteration": 0,
- "failures": [...],
+ "failures": [],
```

`--all`은 위와 동일.

`--stage <STAGE>` 추가 시 `stage` 필드도 함께 갱신.

`schemaVersion`, `maxRetries`, `lastValidated`, `history`는 절대 건드리지 않는다.

### 4. 출력

**ko**:
```
리셋 완료: iteration=0, failures=[]
현재 스테이지: <stage>
다음: /harness:run
```

**en**:
```
Reset complete: iteration=0, failures=[]
Current stage: <stage>
Next: /harness:run
```
