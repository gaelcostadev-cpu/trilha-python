import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExperimentalRunner } from './locked-memory-runner.mjs';
const root = dirname(fileURLToPath(import.meta.url));
const temp = mkdtempSync(join(root, 'locked-live-'));
try {
  const runtime = join(temp, 'runtime'), scratch = join(temp, 'scratch');
  cpSync(join(root, 'official-runtime'), runtime, { recursive: true });
  mkdirSync(scratch);
  const runner = createExperimentalRunner(runtime, scratch);
  const running = runner.execute('import time; time.sleep(3)');
  await new Promise(resolve => setTimeout(resolve, 800));
  const dirs = readdirSync(scratch);
  assert.equal(dirs.length, 1);
  const gate = join(scratch, dirs[0], 'bootstrap.py');
  const executable = join(runtime, 'python.exe');
  for (const operation of [() => writeFileSync(executable, 'tampered'), () => renameSync(executable, executable + '.old'), () => writeFileSync(gate, 'tampered'), () => renameSync(gate, gate + '.old')]) {
    assert.throws(operation, error => ['EBUSY', 'EPERM'].includes(error.code));
  }
  assert.equal(runner.cancel(), true);
  const result = await running;
  assert.equal(result.reason, 'cancelled');
  assert.deepEqual(readdirSync(scratch), []);
  renameSync(executable, executable + '.old');
  writeFileSync(join(root, 'locked-live-result.json'), JSON.stringify({duringExecution: 'write and rename denied', afterCancellation: 'lock released', result: result.reason}, null, 2));
} finally { rmSync(temp, {recursive: true, force: true}); }
