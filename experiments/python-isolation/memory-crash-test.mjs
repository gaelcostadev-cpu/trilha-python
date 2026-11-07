import { spawn } from 'node:child_process';
import { existsSync,readFileSync,writeFileSync,unlinkSync,readdirSync,lstatSync,rmdirSync } from 'node:fs';
import { dirname,join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=dirname(fileURLToPath(import.meta.url)), marker=join(root,'memory-crash-pid.txt'),scratch=join(root,'crash-scratch');
if(existsSync(marker)||existsSync(scratch))throw Error('Scratch from an earlier run must be handled first.');
const victim=spawn(process.execPath,[join(root,'memory-crash-victim.mjs')],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:'ignore',windowsHide:true});
try{
 let n=0;while(!existsSync(marker)&&n++<100)await new Promise(r=>setTimeout(r,50));if(!existsSync(marker))throw Error('No PID');
 const pid=Number(readFileSync(marker,'utf8'));if(!Number.isInteger(pid)||pid<=0)throw Error('Invalid PID');
 victim.kill();await new Promise(r=>victim.once('exit',r));await new Promise(r=>setTimeout(r,300));
 let state='alive';try{process.kill(pid,0)}catch(e){state=e.code}
 const dirs=readdirSync(scratch);let codeRemained=false;const files=[];
 for(const dir of dirs){const d=join(scratch,dir);if(!resolve(d).startsWith(resolve(scratch)+'\\run-')||!lstatSync(d).isDirectory()||lstatSync(d).isSymbolicLink())throw Error('Unexpected scratch path');
  for(const file of readdirSync(d)){const p=join(d,file);if(file!=='bootstrap.py'||!lstatSync(p).isFile()||lstatSync(p).isSymbolicLink())throw Error('Unexpected scratch file');files.push(file);if(readFileSync(p,'utf8').includes('TRILHA_FAKE_SOURCE_SECRET_82D8'))codeRemained=true;}
 }
 writeFileSync(join(root,'memory-crash-result.json'),JSON.stringify({childAfterHostDeath:state,codeRemained,files},null,2));if(state!=='ESRCH'||codeRemained)process.exitCode=1;
 for(const dir of dirs){const d=join(scratch,dir);for(const f of readdirSync(d))unlinkSync(join(d,f));rmdirSync(d)}rmdirSync(scratch);
}catch(e){victim.kill();writeFileSync(join(root,'memory-crash-result.json'),JSON.stringify({error:String(e)},null,2));process.exitCode=1}
finally{if(existsSync(marker))unlinkSync(marker)}
