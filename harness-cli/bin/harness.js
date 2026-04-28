#!/usr/bin/env node
import { init } from '../commands/init.js';
import { run } from '../commands/run.js';
import { status } from '../commands/status.js';
import { validate } from '../commands/validate.js';
import { advance } from '../commands/advance.js';
import { retro } from '../commands/retro.js';

const [,, cmd, ...args] = process.argv;

const commands = { init, run, status, validate, advance, retro };

const help = `
harness <command>

Commands:
  init      새 프로젝트에 하네스 초기화
  run       현재 스테이지 에이전트 실행 (완료 후 자동 검증)
  validate  현재 스테이지 수동 검증
  advance   다음 스테이지로 강제 이동 (검증 생략)
  status    현재 진행 상태 출력
  retro     회고 에이전트 실행 후 에이전트 지침 업데이트
`;

if (!cmd || !commands[cmd]) {
  console.log(help);
  process.exit(cmd ? 1 : 0);
}

commands[cmd](args).catch(e => {
  console.error(`\n오류: ${e.message}`);
  process.exit(1);
});
