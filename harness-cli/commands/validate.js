import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { readState, writeState, nextStage, validatorFile, readConfig, HARNESS_DIR } from '../lib/state.js';

const CONTEXT_FILES = {
  REQUIREMENTS: ['requirements.md'],
  ROADMAP:      ['requirements.md', 'roadmap.md'],
  DEVELOPMENT:  ['requirements.md', 'roadmap.md', 'progress.md'],
  REVIEW:       ['requirements.md', 'roadmap.md', 'review-report.md'],
};

function buildPrompt(stage, validatorInstructions, config) {
  const files = CONTEXT_FILES[stage] || [];
  const context = files
    .map(f => {
      const p = join(HARNESS_DIR, f);
      return existsSync(p) ? `\n=== ${f} ===\n${readFileSync(p, 'utf8')}\n=== END ===` : '';
    })
    .filter(Boolean)
    .join('\n');

  const configBlock = `\n=== config.json ===\n${JSON.stringify(config, null, 2)}\n=== END ===`;

  return [
    validatorInstructions,
    '\n\n## 컨텍스트',
    configBlock,
    context,
    '\n\n## 출력 형식 (마지막 줄에 반드시 포함)',
    'VALIDATION_RESULT: PASS',
    '또는',
    'VALIDATION_RESULT: FAIL',
    'REASON: [실패 원인 한 줄]',
    'FIX_PLAN: [구체적인 수정 계획]',
  ].join('\n');
}

export async function validate() {
  const state  = readState();
  const config = readConfig();
  const vFile  = validatorFile(state.stage);

  if (!vFile || !existsSync(vFile)) {
    console.log(`${state.stage} 스테이지는 자동 검증 없음.`);
    return;
  }

  const instructions = readFileSync(vFile, 'utf8');
  const claudePrompt = buildPrompt(state.stage, instructions, config);

  console.log(`\n검증 중: ${state.stage}...`);

  const result = spawnSync('claude', ['-p', claudePrompt], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  const output = result.stdout || '';
  const passed = /VALIDATION_RESULT:\s*PASS/.test(output);

  if (passed) {
    const next = nextStage(state.stage);
    const now  = new Date().toISOString();
    writeState({
      ...state,
      stage:         next || 'DONE',
      iteration:     0,
      lastValidated: now,
      history:       [...state.history, { stage: state.stage, completedAt: now }],
    });
    console.log(`\n검증 통과: ${state.stage} -> ${next || 'DONE'}`);
    if (next) console.log(`다음: harness run`);
    else      console.log(`완료. 다음: harness retro`);
    return;
  }

  const cause = (output.match(/REASON:\s*(.+)/))?.[1]?.trim()         || '알 수 없음';
  const plan  = (output.match(/FIX_PLAN:\s*([\s\S]+?)(?:\n\n|$)/))?.[1]?.trim() || '재시도';

  console.log(`\n검증 실패: ${state.stage}`);
  console.log(`원인:      ${cause}`);
  console.log(`수정 계획: ${plan}`);

  const newIter = state.iteration + 1;
  writeState({
    ...state,
    iteration: newIter,
    failures:  [...state.failures, {
      stage: state.stage, attempt: newIter, cause, plan,
      timestamp: new Date().toISOString(),
    }],
  });

  if (newIter >= state.maxRetries) {
    console.log(`\n${state.maxRetries}회 연속 실패 — 사용자 개입 필요`);
    console.log('에이전트 지침 또는 요구사항을 수정한 뒤 state.json의 iteration을 0으로 리셋하세요.');
  } else {
    console.log(`\n남은 재시도: ${state.maxRetries - newIter}회 — harness run으로 재시도`);
  }
}
