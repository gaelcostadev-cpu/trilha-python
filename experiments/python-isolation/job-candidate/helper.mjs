// Synthetic cases only. This is an experiment, not an application component.
import { writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const [report, base, mode] = process.argv.slice(2);
if (!['io', 'failure', 'flood', 'unicode_flood', 'hang'].includes(mode)) throw Error('invalid case');
const { spawn, probe } = await import(pathToFileURL(resolve(base, 'node_modules/@microsoft/mxc-sdk/dist/v1/index.js')).href);
const runtime = resolve(base, 'official-runtime');
const payload = fileURLToPath(new URL('./payload.py', import.meta.url));
const q = s => '"' + s + '"';
const request = {
  containment: { type: 'processcontainer', config: { ui: { isolation: 'container', desktopSystemControl: false, systemSettings: 'none', ime: false } } },
  filesystem: { readonlyPaths: [runtime, dirname(payload)] },
  network: { egress: { default: 'deny' }, ingress: { default: 'deny', hostLoopback: 'deny' } },
  ui: { disable: false, clipboard: 'none', allowInputInjection: false },
  environment: { SystemRoot: process.env.SystemRoot, LOCALAPPDATA: runtime }, inheritDefaultEnvironment: false,
  workingDirectory: runtime, timeoutMs: 3000,
  command: [join(runtime, 'python.exe'), '-I', '-B', '-X', 'utf8', '-u', payload, mode].map(q).join(' ')
};
let child;
let result;
try {
  const support = probe(request);
  if (support.tier !== 'base-container' || support.error || support.warnings?.length) throw Error('isolation probe rejected');
  child = await spawn(request, { telemetry: { enabled: false } });
  if (!child.id || child.warnings.length || !child.standardInput || !child.standardOutput || !child.standardError) throw Error('invalid launch');
  const outputs = [[], []];
  let total = 0, exceeded = false, streamError = null;
  const limit = 65536;
  const drain = (stream, index) => new Promise(resolveStream => {
    let done = false;
    const finish = error => { if (!done) { done = true; if (error) streamError = String(error); resolveStream(); } };
    stream.on('data', chunk => {
      const bytes = Buffer.from(chunk), count = Math.min(bytes.length, limit - total);
      if (count) { outputs[index].push(bytes.subarray(0, count)); total += count; }
      if (count < bytes.length && !exceeded) { exceeded = true; try { child.kill(); } catch (error) { streamError = String(error); } }
    });
    stream.once('error', finish); stream.once('end', () => finish()); stream.once('close', () => finish());
  });
  const drains = [drain(child.standardOutput, 0), drain(child.standardError, 1)];
  child.standardInput.on('error', error => { streamError = String(error); });
  child.standardInput.end(mode === 'io' ? 'mundo\n' : '');
  const status = await child.wait();
  await Promise.all(drains);
  if (streamError) throw Error('stream error: ' + streamError);
  let remaining = limit;
  const decode = chunks => {
    let text = '';
    for (const char of Buffer.concat(chunks).toString('utf8')) {
      const size = Buffer.byteLength(char);
      if (size > remaining) break;
      text += char; remaining -= size;
    }
    return text;
  };
  result = { reason: exceeded ? 'output_limit' : status.timedOut ? 'timeout' : 'completed', exitCode: status.exitCode,
    stdout: decode(outputs[0]), stderr: decode(outputs[1]), bytes: total };
} catch (error) {
  result = { error: String(error) };
  process.exitCode = 1;
} finally {
  if (child) {
    const errors = [];
    try { child.kill(); } catch (error) { errors.push(String(error)); }
    try { child.dispose(); } catch (error) { errors.push(String(error)); }
    if (errors.length) { result = { error: `cleanup failed: ${errors.join('; ')}; prior result: ${JSON.stringify(result)}` }; process.exitCode = 1; }
  }
}
writeFileSync(report, JSON.stringify(result), { flag: 'wx' });
