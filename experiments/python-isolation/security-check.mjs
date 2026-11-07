import { createServer } from 'node:net';
import { createSocket } from 'node:dgram';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { accessVerdict, udpVerdict, wmiVerdict, writeVerdict } from './security-verdicts.mjs';

const argument = process.argv[2];
if (!argument) throw Error('Usage: node security-check.mjs <python-isolation directory>');
const experiment = resolve(argument);
const here = dirname(fileURLToPath(import.meta.url));
const temp = mkdtempSync(join(here, 'security-run-'));
const scratch = join(temp, 'scratch'), privateDir = join(temp, 'private');
const file = join(privateDir, 'canary.txt'), marker = randomUUID();
const connections = new Set(), asyncErrors = [];
const closeConnection = socket => {
 connections.add(socket);
 socket.on('error', error => asyncErrors.push(String(error)));
 socket.once('close', () => connections.delete(socket));
 socket.end();
};
const tcp = createServer(closeConnection), pipe = createServer(closeConnection), udp = createSocket('udp4');
for (const server of [tcp, pipe, udp]) server.on('error', error => asyncErrors.push(String(error)));
const pipePath = '\\\\.\\pipe\\trilha-test-' + randomUUID();
const received = [];
udp.on('message', message => received.push(message.toString()));
const listen = (server, ...args) => new Promise((resolveListen, reject) => {
 server.once('error', reject);
 server.listen(...args, resolveListen);
});
const host = code => new Promise(resolveHost => {
 const p = spawn(join(experiment, 'official-runtime', 'python.exe'), ['-I', '-B', '-c', code], { windowsHide: true, timeout: 10000 });
 let stdout = '', stderr = '', error;
 p.stdout.on('data', data => stdout += data);
 p.stderr.on('data', data => stderr += data);
 p.on('error', e => error = String(e));
 p.on('close', status => resolveHost({ status, stdout, stderr, ...(error && { error }) }));
});
const wait = ms => new Promise(resolveWait => setTimeout(resolveWait, ms));
const results = [];
let runner, runnerError;
const sandbox = async code => {
 if (!runner) return { error: runnerError };
 try { return await runner.execute(code); } catch (error) { return { error: String(error) }; }
};
async function check(name, code, verify = accessVerdict) {
 const h = await host(code), s = await sandbox(code);
 let status = 'inconclusive';
 try { status = verify(h, s); } catch {}
 results.push({ name, status, host: h, sandbox: s });
}
try {
 mkdirSync(scratch); mkdirSync(privateDir); writeFileSync(file, marker, { flag: 'wx' });
 try {
  const { createExperimentalRunner } = await import(pathToFileURL(join(experiment, 'locked-memory-runner.mjs')).href);
  runner = createExperimentalRunner(join(experiment, 'official-runtime'), scratch);
 } catch (error) { runnerError = String(error); }
 await check('read synthetic private file', `try:\n open(${JSON.stringify(file)},'rb').read();print('allowed')\nexcept PermissionError: print('denied')\nexcept OSError as e: print('error',type(e).__name__)`);
 const writeCode = `try:\n open(${JSON.stringify(file)},'ab').write(b'!');print('allowed')\nexcept PermissionError: print('denied')\nexcept OSError as e: print('error',type(e).__name__)`;
 const writeHost = await host(writeCode);
 const readCanary = () => { try { return readFileSync(file, 'utf8'); } catch { return undefined; } };
 const before = readCanary(), writeSandbox = await sandbox(writeCode), after = readCanary();
 results.push({ name: 'write synthetic private file', status: writeVerdict(writeHost, writeSandbox, marker + '!', before, after), host: writeHost, sandbox: writeSandbox });
 await listen(tcp, 0, '127.0.0.1');
 await check('IPv4 loopback TCP', `import socket\ntry:\n s=socket.create_connection(('127.0.0.1',${tcp.address().port}),timeout=1);s.close();print('allowed')\nexcept PermissionError: print('denied')\nexcept OSError as e: print('error',type(e).__name__,e.errno)`);
 await listen(pipe, pipePath);
 await check('named pipe', `try:\n f=open(${JSON.stringify(pipePath)},'rb',buffering=0);f.close();print('allowed')\nexcept PermissionError: print('denied')\nexcept OSError as e: print('error',type(e).__name__,e.errno)`);
 if (process.argv.includes('--external')) {
  await check('external IPv4 TCP (1.1.1.1:443; connect only)', `import socket\ntry:\n s=socket.create_connection(('1.1.1.1',443),timeout=2);s.close();print('allowed')\nexcept PermissionError: print('denied')\nexcept OSError as e: print('error',type(e).__name__,e.errno)`);
 } else {
  results.push({ name: 'external IPv4 TCP', status: 'blocked', error: 'Not requested; use --external when external networking is available.' });
 }
 const wmi = readFileSync(join(experiment, 'payload', 'wmi-check.py'), 'utf8');
 await check('WMI COM connect', wmi, wmiVerdict);
 await new Promise((resolveBind, reject) => { udp.once('error', reject); udp.bind(0, '127.0.0.1', resolveBind); });
 const send = tag => `import socket\ntry:\n s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM);s.sendto(b'${tag}',('127.0.0.1',${udp.address().port}));s.close();print('sent')\nexcept PermissionError: print('denied')\nexcept OSError as e: print('error',type(e).__name__,e.errno)`;
 const h = await host(send('HOST')); await wait(100);
 const s = await sandbox(send('SANDBOX')); await wait(300);
 const status = udpVerdict(h, s, received);
 results.push({ name: 'IPv4 loopback UDP', status, host: h, sandbox: s, received });
} catch (error) {
 results.push({ name: 'setup', status: 'inconclusive', error: String(error) });
} finally {
 for (const socket of connections) socket.destroy();
 await Promise.all([tcp, pipe].map(server => new Promise(resolveClose => {
  if (!server.listening) return resolveClose();
  server.close(error => { if (error) asyncErrors.push(String(error)); resolveClose(); });
 })));
 try { udp.close(); } catch {}
 for (const [action, path] of [[unlinkSync, file], [rmdirSync, privateDir], [rmdirSync, scratch], [rmdirSync, temp]]) {
  try { action(path); } catch (error) { if (error.code !== 'ENOENT') results.push({ name: 'cleanup', status: 'inconclusive', error: String(error) }); }
 }
 for (const error of asyncErrors) results.push({ name: 'network cleanup', status: 'inconclusive', error });
 console.log(JSON.stringify({ results }, null, 2));
 if (results.some(result => result.status !== 'pass')) process.exitCode = 1;
}
