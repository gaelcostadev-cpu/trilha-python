// Experimental: this helper must be launched inside the supervisor's Job.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, probe } from '@microsoft/mxc-sdk/v1';
import { lockRuntime } from './lock-runtime.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const runtime = join(root, 'official-runtime');
const gateDirectory = join(root, 'gate'), gate = join(gateDirectory, 'bootstrap.py');
let release, child;
try {
  release = lockRuntime(runtime, gate, gateDirectory);
  const q = s => '"' + s + '"';
  const request = {
    containment: { type: 'processcontainer', config: { ui: { isolation: 'container', desktopSystemControl: false, systemSettings: 'none', ime: false } } },
    filesystem: { readonlyPaths: [runtime, gateDirectory] },
    network: { egress: { default: 'deny' }, ingress: { default: 'deny', hostLoopback: 'deny' } },
    ui: { disable: false, clipboard: 'none', allowInputInjection: false },
    environment: { SystemRoot: process.env.SystemRoot, LOCALAPPDATA: gateDirectory }, inheritDefaultEnvironment: false,
    workingDirectory: runtime, timeoutMs: 5000,
    command: [join(runtime, 'python.exe'), '-I', '-B', '-X', 'utf8', '-u', gate].map(q).join(' ')
  };
  const support = probe(request);
  if (support.tier !== 'base-container' || support.error || support.warnings?.length) throw Error('Isolamento indisponível.');
  child = await spawn(request, { telemetry: { enabled: false } });
  if (!child.id || child.warnings.length || !child.standardInput || !child.standardOutput || !child.standardError) throw Error('Inicialização isolada inválida.');
  let requestData = {}, count = 0, exceeded = false, error = null, ready = false, prefix = '', testPrefix = '';
  const out = [], err = [], limit = 65536;
  const stop = () => { try { child.kill(); } catch (e) { error = String(e); } };
  const append = (parts, chunk) => {
    const bytes = Buffer.from(chunk), n = Math.min(bytes.length, limit - count);
    if (requestData.test_ready && parts === out && testPrefix.length < 100) {
      testPrefix += bytes.toString('utf8');
      if (testPrefix.includes('TRILHA_SYNTHETIC_STARTED')) {
        process.stderr.write(`TRILHA_PSEC_TEST_READY ${child.id}\n`);
        requestData.test_ready = false;
      }
    }
    if (n) { parts.push(bytes.subarray(0, n)); count += n; }
    if (n < bytes.length && !exceeded) { exceeded = true; stop(); }
  };
  let resolveReady, rejectReady;
  const readiness = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const drain = (stream, parts, isOut) => new Promise(resolve => {
    stream.on('data', chunk => {
      if (!isOut || ready) return append(parts, chunk);
      prefix += chunk.toString('utf8');
      if (prefix.length > 256) return rejectReady(Error('Inicialização inválida.'));
      const end = prefix.indexOf('\n');
      if (end >= 0) {
        if (prefix.slice(0, end).trim() !== 'TRILHA_SANDBOX_READY') return rejectReady(Error('Inicialização inválida.'));
        ready = true; resolveReady();
        if (prefix.length > end + 1) append(parts, Buffer.from(prefix.slice(end + 1)));
      }
    });
    const done = e => { if (e) error = String(e); if (isOut && !ready) rejectReady(Error('Inicialização interrompida.')); resolve(); };
    stream.once('error', done); stream.once('end', () => done()); stream.once('close', () => done());
  });
  const drains = [drain(child.standardOutput, out, true), drain(child.standardError, err, false)];
  await readiness;
  process.stderr.write('TRILHA_LAUNCHER_READY\n');
  requestData = JSON.parse(readFileSync(0, 'utf8'));
  if (requestData.test_handle) {
    const { probeHandle } = await import('./handle-probe.mjs');
    const probe = probeHandle(requestData.test_handle);
    if (probe.ok || probe.error !== 6) throw Error('Canário de herança não foi rejeitado.');
  }
  if (requestData.test_environment && 'TRILHA_ENV_CANARY' in process.env) throw Error('Canário de ambiente foi herdado.');
  if (typeof requestData.code !== 'string' || !requestData.code.trim() || Buffer.byteLength(requestData.code, 'utf8') > 100000 || typeof requestData.input !== 'string' || Buffer.byteLength(requestData.input, 'utf8') > 50000) throw Error('Entrada inválida.');
  child.standardInput.on('error', e => { error = String(e); });
  const code = Buffer.from(requestData.code, 'utf8');
  child.standardInput.end(Buffer.concat([Buffer.from(`TRILHA_SANDBOX_RUN ${code.length}\n`), code, Buffer.from(requestData.input, 'utf8')]));
  const status = await child.wait();
  await Promise.all(drains);
  if (error) throw Error(error);
  let remaining = limit, trimmed = false;
  const decode = parts => { let result = ''; for (const char of Buffer.concat(parts).toString('utf8')) { const n = Buffer.byteLength(char); if (n > remaining) { trimmed = true; break; } result += char; remaining -= n; } return result; };
  const stdout = decode(out), stderr = decode(err);
  process.stdout.write(JSON.stringify({ reason: exceeded || trimmed ? 'output_limit' : status.timedOut ? 'timeout' : 'completed', exitCode: status.exitCode, stdout, stderr }));
} catch (error) {
  process.stderr.write(String(error));
  process.exitCode = 1;
} finally {
  if (child) { try { child.kill(); } catch { process.exitCode = 1; } try { child.dispose(); } catch { process.exitCode = 1; } }
  if (release) release();
}
