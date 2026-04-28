import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { HARNESS_DIR } from './state.js';

// Patch block format in retrospective output:
//
// === PATCH: agents/01-requirements.md ===
// [ADD]
// - 새 규칙
// === END PATCH ===
//
// === PATCH: agents/03-developer.md ===
// [MODIFY]
// BEFORE: 기존 텍스트
// AFTER: 수정된 텍스트
// === END PATCH ===
//
// === PATCH: agents/02-roadmap.md ===
// [REMOVE]
// 제거할 텍스트
// === END PATCH ===

export function parsePatches(text) {
  const patches = [];
  const blockRe = /=== PATCH: (.+?) ===\n([\s\S]+?)=== END PATCH ===/g;
  let match;
  while ((match = blockRe.exec(text)) !== null) {
    const [, file, body] = match;
    const typeMatch = body.match(/^\[(ADD|MODIFY|REMOVE)\]\n/);
    if (!typeMatch) continue;
    const type = typeMatch[1];
    const content = body.slice(typeMatch[0].length).trimEnd();
    patches.push({ file: file.trim(), type, content });
  }
  return patches;
}

export function applyPatches(patches) {
  const results = [];
  for (const patch of patches) {
    const filePath = join(HARNESS_DIR, patch.file);
    if (!existsSync(filePath)) {
      results.push({ file: patch.file, status: 'SKIP', reason: '파일 없음' });
      continue;
    }
    let content = readFileSync(filePath, 'utf8');
    try {
      if (patch.type === 'ADD') {
        content = content.trimEnd() + '\n\n' + patch.content + '\n';
      } else if (patch.type === 'REMOVE') {
        const target = patch.content.trim();
        if (!content.includes(target)) {
          results.push({ file: patch.file, status: 'SKIP', reason: '제거할 텍스트를 찾을 수 없음' });
          continue;
        }
        content = content.replace(target, '').replace(/\n{3,}/g, '\n\n');
      } else if (patch.type === 'MODIFY') {
        const m = patch.content.match(/^BEFORE:\s*([\s\S]+?)\nAFTER:\s*([\s\S]+)$/);
        if (!m) {
          results.push({ file: patch.file, status: 'SKIP', reason: 'MODIFY 형식 오류 (BEFORE:/AFTER: 필요)' });
          continue;
        }
        const [, before, after] = m;
        if (!content.includes(before.trim())) {
          results.push({ file: patch.file, status: 'SKIP', reason: 'BEFORE 텍스트를 찾을 수 없음' });
          continue;
        }
        content = content.replace(before.trim(), after.trim());
      }
      writeFileSync(filePath, content, 'utf8');
      results.push({ file: patch.file, status: 'OK', type: patch.type });
    } catch (e) {
      results.push({ file: patch.file, status: 'ERROR', reason: e.message });
    }
  }
  return results;
}
