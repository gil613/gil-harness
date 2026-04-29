---
description: 현재 프로젝트에서 하네스 완전 제거 (.harness/ 삭제)
allowed-tools: Read, Bash
---

# /harness:uninstall

현재 프로젝트에서 하네스를 완전히 제거한다. `.harness/` 디렉터리와 그 안의 모든 파일(config, state, 산출물, 로그, 회고)을 삭제한다.

## 절차

### 1. 언어 확인

`.harness/config.json`을 읽어 `uiLanguage`를 확인한다. 파일이 없거나 읽을 수 없으면 한국어로 처리.

이후 모든 출력은 `uiLanguage`에 따라 한국어 또는 영어로 표시한다.

### 2. 초기화 여부 확인

`.harness/state.json`이 없으면 출력 후 종료:
- ko: "하네스가 초기화되지 않았습니다"
- en: "Harness is not initialized"

### 3. 삭제 목록 표시 및 확인

삭제될 항목을 열거하고 사용자에게 명시적으로 확인받는다.

**ko**:
```
다음 항목을 영구 삭제합니다:

  .harness/
  ├── config.json
  ├── state.json
  ├── requirements.md       (있으면)
  ├── roadmap.md            (있으면)
  ├── progress.md           (있으면)
  ├── review-report.md      (있으면)
  ├── logs/                 (있으면)
  ├── agents-overrides/     (있으면)
  └── retrospectives/       (있으면)

계속할까요? (yes/no)
```

**en**:
```
The following will be permanently deleted:

  .harness/
  ├── config.json
  ├── state.json
  ├── requirements.md       (if present)
  ├── roadmap.md            (if present)
  ├── progress.md           (if present)
  ├── review-report.md      (if present)
  ├── logs/                 (if present)
  ├── agents-overrides/     (if present)
  └── retrospectives/       (if present)

Continue? (yes/no)
```

`yes`/`y`가 아니면 중단:
- ko: "취소됨"
- en: "Cancelled"

### 4. 삭제 실행

```bash
rm -rf .harness/
```

### 5. 완료 보고

**ko**:
```
제거 완료: .harness/ 삭제됨
플러그인을 완전히 제거하려면: claude plugin remove harness
```

**en**:
```
Uninstalled: .harness/ deleted
To fully remove the plugin: claude plugin remove harness
```
