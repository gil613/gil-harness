import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export const HARNESS_DIR = '.harness';
export const STATE_FILE = join(HARNESS_DIR, 'state.json');
export const CONFIG_FILE = join(HARNESS_DIR, 'config.json');

export const STAGES = ['REQUIREMENTS', 'ROADMAP', 'DEVELOPMENT', 'REVIEW', 'DONE'];

export const STAGE_AGENTS = {
  REQUIREMENTS: '01-requirements.md',
  ROADMAP: '02-roadmap.md',
  DEVELOPMENT: '03-developer.md',
  REVIEW: '04-reviewer.md',
  RETROSPECTIVE: '05-retrospective.md',
};

export const STAGE_VALIDATORS = {
  REQUIREMENTS: 'requirements.md',
  ROADMAP: 'roadmap.md',
  DEVELOPMENT: 'development.md',
  REVIEW: 'review.md',
};

export function assertInitialized() {
  if (!existsSync(STATE_FILE)) {
    throw new Error('하네스가 초기화되지 않았습니다. `harness init`을 먼저 실행하세요.');
  }
}

export function readState() {
  assertInitialized();
  return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
}

export function writeState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

export function readConfig() {
  if (!existsSync(CONFIG_FILE)) throw new Error('config.json이 없습니다.');
  return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
}

export function nextStage(current) {
  const idx = STAGES.indexOf(current);
  if (idx === -1 || idx >= STAGES.length - 1) return null;
  return STAGES[idx + 1];
}

export function agentFile(stage) {
  const f = STAGE_AGENTS[stage];
  return f ? join(HARNESS_DIR, 'agents', f) : null;
}

export function validatorFile(stage) {
  const f = STAGE_VALIDATORS[stage];
  return f ? join(HARNESS_DIR, 'validators', f) : null;
}

export function initialState() {
  return {
    stage: 'REQUIREMENTS',
    iteration: 0,
    maxRetries: 3,
    lastValidated: null,
    failures: [],
    history: [],
  };
}
