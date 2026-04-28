import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { createInterface } from 'readline';
import { readState, agentFile } from '../lib/state.js';
import { validate } from './validate.js';

function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

export async function run() {
  const state = readState();

  if (state.stage === 'DONE') {
    console.log('모든 스테이지 완료. `harness retro`로 회고를 실행하세요.');
    return;
  }

  const file = agentFile(state.stage);
  if (!file || !existsSync(file)) {
    throw new Error(`에이전트 파일 없음: ${file}`);
  }

  const remaining = state.maxRetries - state.iteration;
  console.log(`\n스테이지: ${state.stage}  (재시도 ${state.iteration + 1}/${state.maxRetries}, 남은 횟수: ${remaining})`);

  if (state.failures.length > 0) {
    const last = state.failures[state.failures.length - 1];
    if (last.stage === state.stage) {
      console.log(`\n이전 실패 원인: ${last.cause}`);
      console.log(`수정 계획: ${last.plan}\n`);
    }
  }

  console.log('Claude Code를 시작합니다. 세션 종료 후 자동 검증합니다.\n');

  const result = spawnSync('claude', [], { stdio: 'inherit', shell: true });
  if (result.error) throw new Error(`Claude 실행 실패: ${result.error.message}`);

  const answer = await prompt('\n세션 종료. 검증을 실행할까요? [Y/n]: ');
  if (answer.toLowerCase() === 'n') {
    console.log('검증 생략. `harness validate`로 나중에 실행 가능합니다.');
    return;
  }

  await validate();
}
