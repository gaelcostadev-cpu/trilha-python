// Fixed diagnostic payload. No student code, not an application component.
import { writeFileSync, renameSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const [report, base] = process.argv.slice(2);
const { spawn, probe } = await import(pathToFileURL(resolve(base, 'node_modules/@microsoft/mxc-sdk/dist/v1/index.js')).href);
const runtime = resolve(base, 'official-runtime');
const q = s => '"' + s + '"';
const req = {
  containment: { type: 'processcontainer', config: { ui: { isolation: 'container', desktopSystemControl: false, systemSettings: 'none', ime: false } } },
  filesystem: { readonlyPaths: [runtime] },
  network: { egress: { default: 'deny' }, ingress: { default: 'deny', hostLoopback: 'deny' } },
  ui: { disable: false, clipboard: 'none', allowInputInjection: false },
  environment: { SystemRoot: process.env.SystemRoot, LOCALAPPDATA: runtime }, inheritDefaultEnvironment: false,
  workingDirectory: runtime, timeoutMs: 15000,
  command: [join(runtime, 'python.exe'), '-I', '-B', '-c', 'import time;time.sleep(8)'].map(q).join(' ')
};
let child, published = false;
function publish(value) {
  writeFileSync(report + '.tmp', JSON.stringify(value), { flag: 'wx' });
  renameSync(report + '.tmp', report);
  published = true;
}
try {
  const support = probe(req);
  if (support.tier !== 'base-container' || support.error || support.warnings?.length) throw Error(`probe rejected: ${JSON.stringify(support)}`);
  child = await spawn(req, { telemetry: { enabled: false } });
  if (!child.id || child.warnings.length) throw Error('process ID unavailable or warnings present');
  child.standardInput.end();
  child.standardOutput.resume(); child.standardError.resume();
  publish({ pid: child.id });
  await child.wait();
} catch (error) {
  if (!published) publish({ error: String(error) });
  process.exitCode = 1;
} finally { if (child) child.dispose(); }
