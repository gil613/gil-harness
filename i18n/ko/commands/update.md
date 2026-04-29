---
description: 플러그인 업데이트 내용을 현재 프로젝트에 적용
allowed-tools: Read, Edit, Write, Bash, Glob
---

# /harness:update

플러그인 본체(commands/, agents/)가 새 버전으로 업데이트됐을 때, 이미 초기화된 프로젝트의 파일들을 현재 버전에 맞게 동기화한다.

업데이트 대상:
- `.harness/config.json` — 새 버전에서 추가된 필드 보완
- `.harness/` 하위 디렉터리 — 새 버전이 요구하는 디렉터리 생성

건드리지 않는 것:
- `.harness/state.json` (진행 상태)
- `.harness/*.md` 산출물 (requirements, roadmap, progress, review-report)
- `.harness/retrospectives/`
- `.harness/agents-overrides/`

## 절차

### 1. 초기화 여부 확인

`.harness/config.json`, `.harness/state.json`을 읽는다. 없으면 출력 후 종료:
- ko: "초기화 필요 — 먼저 /harness:init 실행"
- en: "Not initialized — run /harness:init first"

`uiLanguage`를 확인해 이후 모든 출력 언어를 결정한다.

### 2. config.json 스키마 보완

현재 `config.json`에 없는 필드를 감지해 추가한다. **기존 필드는 절대 덮어쓰지 않는다.**

현재 스키마 기준 필수 필드:

```
projectName, language, uiLanguage,
testCmd, lintCmd, typecheckCmd, buildCmd, devCmd
```

누락 필드가 있으면:
1. `init.md` 단계 3과 동일한 방법으로 프로젝트 파일 재스캔해 자동 감지 시도
2. 감지 실패 시 빈 문자열(`""`)로 추가

Edit 도구로 누락 필드만 삽입한다.

### 3. 디렉터리 보완

현재 버전이 요구하는 디렉터리가 없으면 생성한다:

```bash
mkdir -p .harness/logs
```

추후 버전에서 새 디렉터리가 추가되면 이 목록에 추가한다.

### 4. 완료 보고

변경된 항목만 출력한다. 변경 없으면 "최신 상태"로 보고.

**ko**:
```
업데이트 완료:
  config.json  — <추가된 필드 목록> (없으면 "변경 없음")
  디렉터리     — <생성된 목록> (없으면 "변경 없음")
```

**en**:
```
Update complete:
  config.json  — <added fields> (or "no changes")
  Directories  — <created list> (or "no changes")
```
