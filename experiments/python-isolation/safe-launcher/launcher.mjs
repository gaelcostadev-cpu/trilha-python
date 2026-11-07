import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import koffi from 'koffi';
import { lockRuntime } from './lock-runtime.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const kernel = koffi.load('kernel32.dll');
const open = kernel.func('CreateFileW', 'void *', ['const char16_t *', 'uint32', 'uint32', 'void *', 'uint32', 'uint32', 'void *']);
const info = kernel.func('GetFileInformationByHandle', 'int', ['void *', 'void *']);
const close = kernel.func('CloseHandle', 'int', ['void *']);
const retainedLocks = [];
const electronHash = '15e815a2d04aed1a01787354b93cd2cab425f339b3beaef4f9e4193647f5399b';

export function launch(getRequest, { signal } = {}) {
  if (!process.versions.electron || process.platform !== 'win32' || typeof getRequest !== 'function') throw Error('Controlador Electron obrigatório.');
  const electron = process.execPath;
  const handle = open(electron, 0x80000000, 1, null, 3, 0x00200000, null);
  if (!handle || koffi.address(handle) === 0xffffffffffffffffn) throw Error('Electron indisponível.');
  let release;
  try {
    const attributes = Buffer.alloc(52);
    if (!info(handle, attributes) || (attributes.readUInt32LE(0) & 0x410) || attributes.readUInt32LE(40) !== 1 || createHash('sha256').update(readFileSync(electron)).digest('hex') !== electronHash) throw Error('Electron inválido.');
    release = lockRuntime(join(root, 'official-runtime'), join(root, 'gate', 'bootstrap.py'), join(root, 'gate'));
  } catch (error) { close(handle); throw error; }
  return new Promise((resolve, reject) => {
    let child, timer, buffer = '', errors = '', finished = false, closed = false, pending = null, confirmed = false, state = 'starting';
    const settle = () => {
      if (!pending || (child && !closed)) return;
      if (!confirmed) {
        retainedLocks.push({ release, handle });
        return reject(Error(`Encerramento da árvore não confirmado; travas mantidas. ${pending.error || ''}`));
      }
      release(); close(handle);
      pending.error ? reject(pending.error) : resolve(pending.result);
    };
    const finish = (error, result) => {
      if (finished) return;
      finished = true;
      pending = { error, result };
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      if (!child) { confirmed = true; return settle(); }
      if (closed) return settle();
      child.stdin.destroy();
      let requested = child.exitCode !== null;
      try { if (!requested) requested = child.kill(); } catch {}
      if (!requested) setTimeout(() => {
        if (!closed) {
          retainedLocks.push({ release, handle });
          reject(Error('Não foi possível confirmar o encerramento; travas mantidas.'));
        }
      }, 5000);
    };
    const cancel = () => { if (state === 'running') child.stdin.write('C'); else finish(Error('Cancelado antes da inicialização.')); };
    try {
      if (signal?.aborted) return finish(Error('Cancelado antes da inicialização.'));
      child = spawn(join(root, 'official-runtime', 'python.exe'), ['-I', '-B', join(root, 'supervisor_launcher.py'), electron], {
        stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: { SystemRoot: process.env.SystemRoot }
      });
      signal?.addEventListener('abort', cancel, { once: true });
      timer = setTimeout(() => finish(Error('Tempo do supervisor excedido.')), 25000);
      child.stdin.on('error', e => finish(e));
      child.on('error', e => finish(e));
      child.stderr.on('data', chunk => { errors += chunk.toString(); if (errors.length > 8192) finish(Error('Erro excessivo.')); });
      child.stdout.on('data', chunk => {
        buffer += chunk.toString('utf8');
        if (buffer.length > 800000) return finish(Error('Resposta excessiva.'));
        let end;
        while ((end = buffer.indexOf('\n')) >= 0) {
          let message;
          try { message = JSON.parse(buffer.slice(0, end)); } catch { return finish(Error('Resposta inválida.')); }
          buffer = buffer.slice(end + 1);
          if (typeof message.error === 'string' && typeof message.tree_closed === 'boolean' && Object.keys(message).length === 2) { confirmed = message.tree_closed; return finish(Error(message.error)); }
          if (state === 'starting' && message.ready === true && Object.keys(message).length === 1) {
            state = 'requesting';
            Promise.resolve().then(getRequest).then(request => {
              if (finished) return;
              if (!request || Object.keys(request).sort().join(',') !== 'code,input' || typeof request.code !== 'string' || !request.code.trim() || Buffer.byteLength(request.code) > 100000 || typeof request.input !== 'string' || Buffer.byteLength(request.input) > 50000) throw Error('Solicitação inválida.');
              state = 'running';
              child.stdin.write(JSON.stringify(request) + '\n');
            }).catch(e => finish(e));
          } else if (state === 'running' && message.result && message.tree_closed === true && Object.keys(message).length === 2) {
            confirmed = true; state = 'done'; finish(null, message.result);
          } else return finish(Error('Resposta inválida.'));
        }
      });
      child.on('close', code => { closed = true; if (!finished) finish(Error(`Supervisor encerrado (${code}): ${errors.slice(0, 500)}`)); else settle(); });
    } catch (error) { finish(error); }
  });
}
