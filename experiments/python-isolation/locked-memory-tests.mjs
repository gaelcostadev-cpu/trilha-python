import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExperimentalRunner } from './locked-memory-runner.mjs';
const root=dirname(fileURLToPath(import.meta.url)), scratch=join(root,'prototype-scratch');mkdirSync(scratch,{recursive:true});
const runner=createExperimentalRunner(join(root,'official-runtime'),scratch);const tests=[];
async function check(name,fn){try{const result=await fn();tests.push({name,ok:Boolean(result.ok),details:result.details})}catch(e){tests.push({name,ok:false,error:String(e)})}}
await check('unicode and stdin',async()=>{const r=await runner.execute("print('Olá, '+input())",'世界 🐍\n');return{ok:r.reason==='completed'&&r.stdout.trim()==='Olá, 世界 🐍',details:r}});
await check('python errors',async()=>{const r=await runner.execute('raise ValueError("canary")');return{ok:r.reason==='completed'&&r.exitCode!==0&&r.stderr.includes('ValueError: canary'),details:r}});
await check('main module',async()=>{const r=await runner.execute("answer=42\nimport __main__\nprint(__main__.answer)");return{ok:r.reason==='completed'&&r.stdout.trim()==='42',details:r}});
await check('invalid utf8 output within limit',async()=>{const r=await runner.execute("import sys\nsys.stdout.buffer.write(b'\\xff'*30000)");return{ok:r.reason==='output_limit'&&Buffer.byteLength(r.stdout)+Buffer.byteLength(r.stderr)<=65536,details:{reason:r.reason,bytes:Buffer.byteLength(r.stdout)+Buffer.byteLength(r.stderr)}}});
await check('timeout',async()=>{const r=await runner.execute('while True: pass');return{ok:r.reason==='timeout',details:r}});
await check('output limit',async()=>{const r=await runner.execute("while True: print('x'*4096, flush=True)");return{ok:r.reason==='output_limit'&&Buffer.byteLength(r.stdout)<=65536,details:{reason:r.reason,size:Buffer.byteLength(r.stdout)}}});
await check('cancel',async()=>{const p=runner.execute('while True: pass');setTimeout(()=>runner.cancel(),500);const r=await p;return{ok:r.reason==='cancelled',details:r}});
await check('early cancel before execution',async()=>{const p=runner.execute("print('SHOULD_NOT_EXECUTE')");runner.cancel();const r=await p;return{ok:r.reason==='cancelled'&&!r.stdout.includes('SHOULD_NOT_EXECUTE'),details:r}});
await check('one execution at a time',async()=>{const first=runner.execute('while True: pass');let rejected=false;try{await runner.execute("print('SECOND')")}catch{rejected=true}finally{runner.cancel()}const result=await first;return{ok:rejected&&result.reason==='cancelled',details:result}});
await check('clean scratch',async()=>({ok:readdirSync(scratch).length===0}));
writeFileSync(join(root,'locked-memory-tests.json'),JSON.stringify({tests},null,2));
if(tests.some(t=>!t.ok))process.exitCode=1;
