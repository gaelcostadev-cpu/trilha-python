import { mkdirSync,writeFileSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExperimentalRunner } from './memory-crash-runner.mjs';
const root=dirname(fileURLToPath(import.meta.url)),scratch=join(root,'crash-scratch');mkdirSync(scratch,{recursive:true});
const runner=createExperimentalRunner(join(root,'official-runtime'),scratch,chunk=>{const n=Number(String(chunk).trim());if(Number.isInteger(n)&&n>0)writeFileSync(join(root,'memory-crash-pid.txt'),String(n));});
await runner.execute("# TRILHA_FAKE_SOURCE_SECRET_82D8\nimport os,time\nprint(os.getpid(),flush=True)\ntime.sleep(8)\n");
