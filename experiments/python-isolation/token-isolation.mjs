import { mkdtempSync, readFileSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createExperimentalRunner } from './locked-memory-runner.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const runtime = join(root, 'official-runtime');
const probe = join(root, 'payload', 'token-probe.py');
const source = readFileSync(probe, 'utf8');
const control = spawnSync(join(runtime, 'python.exe'), ['-I', '-B', probe], { encoding: 'utf8', timeout: 10000, windowsHide: true });
if (control.status !== 0) throw Error('O controle do host falhou.');
const host = JSON.parse(control.stdout);
if (host.appcontainer !== false) throw Error('O controle não representa um processo normal do host.');

const scratch = mkdtempSync(join(tmpdir(), 'trilha-token-probe-'));
try {
  const result = await createExperimentalRunner(runtime, scratch).execute(source);
  if (result.reason !== 'completed' || result.exitCode !== 0) throw Error('A consulta ao processo isolado falhou.');
  const token = JSON.parse(result.stdout);
  if (token.appcontainer !== true || token.internetClient !== false || token.internetClientServer !== false || token.privateNetworkClientServer !== false) {
    throw Error('O token não atende à política de isolamento esperada.');
  }
  console.log('Controle do host e token AppContainer sem as três permissões de rede passaram.');
  console.log('O ensaio é parcial e não valida UDP nem o aplicativo final.');
} finally {
  rmdirSync(scratch);
}
