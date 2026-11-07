import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import koffi from 'koffi';

const root = dirname(fileURLToPath(import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const manifestBytes = readFileSync(join(root, 'runtime-manifest.json'));
if (hash(manifestBytes) !== '3a20433398ae403077a7d3eec31a4122320b702e1b4bc5554790a211aa059d8c') throw Error('Manifesto alterado.');
const manifest = JSON.parse(manifestBytes.toString('utf8').replace(/^\uFEFF/, ''));
const gateHash = '08b940d34adf1030b6677ed4749c8fa88973721fe34a21d68d06d57fdbcfbdbf';
const kernel = koffi.load('kernel32.dll');
const open = kernel.func('CreateFileW', 'void *', ['const char16_t *', 'uint32', 'uint32', 'void *', 'uint32', 'uint32', 'void *']);
const info = kernel.func('GetFileInformationByHandle', 'int', ['void *', 'void *']);
const read = kernel.func('ReadFile', 'int', ['void *', 'void *', 'uint32', 'void *', 'void *']);
const close = kernel.func('CloseHandle', 'int', ['void *']);
const invalid = handle => !handle || koffi.address(handle) === 0xffffffffffffffffn;

// Locks existing paths only; a writable parent can still create entries or redirect an ancestor.
export function lockRuntime(runtime, gate, gateDirectory) {
  const handles = [];
  function acquire(path, directory) {
    const handle = open(path, 0x80000000, 1, null, 3, 0x00200000 | (directory ? 0x02000000 : 0), null);
    if (invalid(handle)) throw Error('Não foi possível proteger arquivo ou diretório.');
    handles.push(handle);
    const attributes = Buffer.alloc(52);
    if (!info(handle, attributes)) throw Error('Não foi possível verificar arquivo.');
    const flags = attributes.readUInt32LE(0);
    if ((flags & 0x400) || Boolean(flags & 0x10) !== directory || (!directory && attributes.readUInt32LE(40) !== 1)) throw Error('Link ou tipo de arquivo inválido.');
    return handle;
  }
  function check(path, expected) {
    const handle = acquire(path, false), digest = createHash('sha256');
    const buffer = Buffer.alloc(65536), bytesRead = Buffer.alloc(4);
    while (true) {
      bytesRead.fill(0);
      if (!read(handle, buffer, buffer.length, bytesRead, null)) throw Error('Não foi possível ler arquivo protegido.');
      const count = bytesRead.readUInt32LE(0);
      if (!count) break;
      digest.update(buffer.subarray(0, count));
    }
    if (digest.digest('hex') !== expected) throw Error('Integridade do arquivo inválida.');
  }
  function release() { while (handles.length) { try { close(handles.pop()); } catch {} } }
  try {
    acquire(runtime, true);
    acquire(gateDirectory, true);
    if (JSON.stringify(readdirSync(gateDirectory).sort()) !== JSON.stringify(['bootstrap.py']) || gate !== join(gateDirectory, 'bootstrap.py')) throw Error('Conteúdo de inicialização inválido.');
    const names = readdirSync(runtime).sort();
    if (JSON.stringify(names) !== JSON.stringify(Object.keys(manifest).sort())) throw Error('Conteúdo do runtime inválido.');
    for (const name of names) check(join(runtime, name), manifest[name]);
    check(gate, gateHash);
    if (JSON.stringify(readdirSync(runtime).sort()) !== JSON.stringify(names)) throw Error('Conteúdo do runtime alterado.');
    if (JSON.stringify(readdirSync(gateDirectory).sort()) !== JSON.stringify(['bootstrap.py'])) throw Error('Conteúdo de inicialização alterado.');
    return release;
  } catch (error) { release(); throw error; }
}
