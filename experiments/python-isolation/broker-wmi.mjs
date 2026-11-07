import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExperimentalRunner } from './broker-runner.mjs';
const root=dirname(fileURLToPath(import.meta.url)),runtime=join(root,'official-runtime'),scratch=join(root,'prototype-scratch');mkdirSync(scratch,{recursive:true});
const payload=join(root,'payload','wmi-check.py');
const host=spawnSync(join(runtime,'python.exe'),['-I','-B',payload],{encoding:'utf8',timeout:5000,windowsHide:true});
try {const runner=createExperimentalRunner(runtime,scratch);const result=await runner.execute(readFileSync(payload,'utf8'));writeFileSync(join(root,'broker-wmi-result.json'),JSON.stringify({host:{status:host.status,stdout:host.stdout,error:host.error?.message},sandbox:result},null,2));}
catch(e){writeFileSync(join(root,'broker-wmi-result.json'),JSON.stringify({host:{status:host.status,stdout:host.stdout,error:host.error?.message},error:String(e)},null,2))}

