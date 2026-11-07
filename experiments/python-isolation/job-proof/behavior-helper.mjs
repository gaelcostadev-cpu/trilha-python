// Fixed diagnostic payload; never accepts student code.
import { writeFileSync, renameSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const [report, base, mode, target] = process.argv.slice(2);
const sdk = pathToFileURL(resolve(base, 'node_modules/@microsoft/mxc-sdk/dist/v1/index.js'));
const { spawn, probe } = await import(sdk.href);
const runtime = resolve(base, 'official-runtime');
const payload = fileURLToPath(new URL('./fixed-payload.py', import.meta.url));
const q = s => '"' + s + '"';
const req = {
  containment: { type: 'processcontainer', config: { ui: { isolation: 'container', desktopSystemControl: false, systemSettings: 'none', ime: false } } },
  filesystem: { readonlyPaths: [runtime, resolve(payload, '..')] },
  network: { egress: { default: 'deny' }, ingress: { default: 'deny', hostLoopback: 'deny' } },
  ui: { disable: false, clipboard: 'none', allowInputInjection: false },
  environment: { SystemRoot: process.env.SystemRoot, LOCALAPPDATA: runtime }, inheritDefaultEnvironment: false,
  workingDirectory: runtime, timeoutMs: 20000,
  command: [join(runtime, 'python.exe'), '-I', '-B', '-u', payload, mode, target].map(q).join(' ')
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
  child.standardError.resume();
  let data = '';
  child.standardOutput.on('data', chunk => {
    data += chunk.toString();
    const end = data.indexOf('\n');
    if (end >= 0 && !published) {
      publish({ pid: child.id, payload: JSON.parse(data.slice(0, end)) });
    }
  });
  const result = await child.wait();
  if (!published) throw Error(`payload did not report: ${JSON.stringify(result)} output=${data}`);
} catch (error) {
  if (!published) publish({ error: String(error) });
  process.exitCode = 1;
} finally { if (child) child.dispose(); }
