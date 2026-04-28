import { readState, writeState, nextStage } from '../lib/state.js';

export async function advance() {
  const state = readState();
  const next  = nextStage(state.stage);

  if (!next) {
    console.log('이미 마지막 스테이지입니다.');
    return;
  }

  writeState({
    ...state,
    stage:     next,
    iteration: 0,
    history:   [...state.history, {
      stage:             state.stage,
      completedAt:       new Date().toISOString(),
      skippedValidation: true,
    }],
  });

  console.log(`${state.stage} -> ${next} (검증 생략)`);
}
