import assert from 'node:assert/strict';
import { cpSync, linkSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { lockRuntime } from '../lock-runtime.mjs';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
function fixture() {
  const temp = mkdtempSync(join(tmpdir(), 'trilha-lock-'));
  const runtime = join(temp, 'runtime'), gateDirectory = join(temp, 'gate');
  cpSync(join(root, 'official-runtime'), runtime, { recursive: true });
  mkdirSync(gateDirectory);
  const gate = join(gateDirectory, 'bootstrap.py');
  cpSync(join(root, 'payload', 'gate-stdin-locked.py'), gate);
  return { temp, runtime, gate, gateDirectory };
}
test('file locks deny writes, renames and deletion while the handle is held', () => {
  const f = fixture();
  let release;
  try {
    const privateCanary = join(f.temp, 'private-canary');
    writeFileSync(privateCanary, 'PRIVATE_CANARY');
    const linkedCanary = join(f.runtime, 'linked-canary');
    linkSync(privateCanary, linkedCanary);
    assert.equal(readFileSync(linkedCanary, 'utf8'), 'PRIVATE_CANARY');
    unlinkSync(linkedCanary);
    release = lockRuntime(f.runtime, f.gate, f.gateDirectory);
    const executable = join(f.runtime, 'python.exe');
    for (const operation of [() => writeFileSync(executable, 'changed'), () => renameSync(executable, executable + '.old'), () => unlinkSync(executable), () => writeFileSync(f.gate, 'changed'), () => renameSync(f.gate, f.gate + '.old')]) assert.throws(operation);
    assert.ok(readFileSync(executable).length > 0);
    // A directory handle alone does not prevent a new entry.
    writeFileSync(join(f.runtime, 'untrusted.py'), 'canary');
    assert.throws(() => lockRuntime(f.runtime, f.gate, f.gateDirectory));
    unlinkSync(join(f.runtime, 'untrusted.py'));
    assert.throws(() => linkSync(privateCanary, linkedCanary), error => error.code === 'EBUSY');
    release(); release = null;
    renameSync(f.gate, f.gate + '.old');
  } finally { if (release) release(); rmSync(f.temp, { recursive: true, force: true }); }
});
test('hard-linked or modified runtime files fail before execution', () => {
  const f = fixture();
  try {
    const executable = join(f.runtime, 'python.exe');
    const hardlink = join(f.temp, 'hardlink.exe');
    linkSync(executable, hardlink);
    assert.throws(() => lockRuntime(f.runtime, f.gate, f.gateDirectory), /Link/);
    unlinkSync(hardlink);
    writeFileSync(executable, 'modified');
    assert.throws(() => lockRuntime(f.runtime, f.gate, f.gateDirectory), /Integridade/);
    renameSync(f.gate, f.gate + '.old');
  } finally { rmSync(f.temp, { recursive: true, force: true }); }
});
test('runtime directory junction fails before execution', () => {
  const f = fixture();
  try {
    const link = join(f.temp, 'runtime-link');
    symlinkSync(f.runtime, link, 'junction');
    assert.throws(() => lockRuntime(link, f.gate, f.gateDirectory), /Link/);
  } finally { rmSync(f.temp, { recursive: true, force: true }); }
});
