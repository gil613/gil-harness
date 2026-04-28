import { readState, readConfig, STAGES } from '../lib/state.js';

export async function status() {
  const state  = readState();
  const config = readConfig();

  const idx = STAGES.indexOf(state.stage);
  const bar = STAGES.map((s, i) => {
    if (i < idx)  return '█';
    if (i === idx) return '▶';
    return '░';
  }).join('');

  console.log(`
프로젝트: ${config.projectName}
언어:     ${config.language}

스테이지 [${bar}] ${idx + 1}/${STAGES.length}
현재:     ${state.stage}
재시도:   ${state.iteration}/${state.maxRetries}
마지막 검증: ${state.lastValidated || '없음'}
`);

  if (state.failures.length > 0) {
    console.log('최근 실패:');
    for (const f of state.failures.slice(-3)) {
      console.log(`  [${f.stage}] #${f.attempt} — ${f.cause}`);
    }
    console.log();
  }

  if (state.history.length > 0) {
    console.log('완료 이력:');
    for (const h of state.history) {
      const when = h.completedAt?.split('T')[0] || '?';
      const skip = h.skippedValidation ? ' (검증 생략)' : '';
      console.log(`  ${h.stage} — ${when}${skip}`);
    }
    console.log();
  }
}
