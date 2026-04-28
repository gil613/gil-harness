import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { readState, writeState, agentFile, HARNESS_DIR } from '../lib/state.js';
import { parsePatches, applyPatches } from '../lib/patcher.js';

export async function retro() {
  const state = readState();

  const retroFile = agentFile('RETROSPECTIVE');
  if (!retroFile || !existsSync(retroFile)) {
    throw new Error('회고 에이전트 파일 없음: ' + retroFile);
  }

  console.log('\n회고 에이전트를 시작합니다.\n');
  console.log('완료 후 .harness/retrospectives/YYYY-MM-DD.md 에 패치 블록을 저장하세요.\n');

  spawnSync('claude', [], { stdio: 'inherit', shell: true });

  const today = new Date().toISOString().split('T')[0];
  const retroPath = join(HARNESS_DIR, 'retrospectives', `${today}.md`);

  if (!existsSync(retroPath)) {
    console.log(`\n회고 파일 없음: ${retroPath}`);
    console.log('에이전트가 파일을 생성했는지 확인하세요.');
    return;
  }

  const content = readFileSync(retroPath, 'utf8');
  const patches = parsePatches(content);

  if (patches.length === 0) {
    console.log('\n적용할 패치 없음.');
    return;
  }

  console.log(`\n${patches.length}개 패치 발견:`);
  for (const p of patches) console.log(`  [${p.type}] ${p.file}`);

  const results = applyPatches(patches);
  console.log('\n패치 결과:');
  for (const r of results) {
    const icon = r.status === 'OK' ? '✓' : r.status === 'SKIP' ? '-' : '✗';
    console.log(`  ${icon} ${r.file}${r.reason ? ` (${r.reason})` : ''}`);
  }

  const applied = results.filter(r => r.status === 'OK').length;
  writeState({
    ...state,
    history: [...state.history, {
      stage:          'RETROSPECTIVE',
      completedAt:    new Date().toISOString(),
      patchesApplied: applied,
    }],
  });

  console.log(`\n완료: ${applied}개 패치 적용됨`);
}
