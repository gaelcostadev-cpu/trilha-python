import { mkdtempSync,writeFileSync,unlinkSync,rmdirSync,copyFileSync } from 'node:fs';
import { dirname,join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn,probe } from '@microsoft/mxc-sdk/v1';
import koffi from 'koffi';
import { verifyRuntime } from './verify-memory-runtime.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const kernel=koffi.load('kernel32.dll');
const createJob=kernel.func('CreateJobObjectW','void *',['void *','const char16_t *']);
const setJob=kernel.func('SetInformationJobObject','int',['void *','int','void *','uint32']);
const openProcess=kernel.func('OpenProcess','void *',['uint32','int','uint32']);
const assign=kernel.func('AssignProcessToJobObject','int',['void *','void *']);
const close=kernel.func('CloseHandle','int',['void *']);

// Experimental only: not wired to the application or approved for student code.
export function createExperimentalRunner(runtimePath,scratchRoot){
 if(process.platform!=='win32'||process.arch!=='x64')throw Error('Experimento disponível apenas para Windows x64.');
 const runtime=resolve(runtimePath),scratch=resolve(scratchRoot);let running=false,child=null,cancelled=false;
 function cancel(){if(!running)return false;cancelled=true;child?.kill();return true}
 async function execute(code,input=''){
  if(running)throw Error('Já existe uma execução em andamento.');
  if(typeof code!=='string'||!code.trim()||code.length>100000||typeof input!=='string'||input.length>50000)throw Error('Código ou entrada inválidos.');
  running=true;cancelled=false;let temp,bootstrap,job,processHandle;
  try{
   verifyRuntime(runtime, join(root,'payload','gate-stdin.py'));
   temp=mkdtempSync(join(scratch,'run-'));if(!resolve(temp).startsWith(scratch+'\\run-'))throw Error('Diretório inválido.');
   bootstrap=join(temp,'bootstrap.py');copyFileSync(join(root,'payload','gate-stdin.py'),bootstrap);
   const q=s=>'"'+s+'"';
   const request={containment:{type:'processcontainer',config:{ui:{isolation:'container',desktopSystemControl:false,systemSettings:'none',ime:false}}},filesystem:{readonlyPaths:[runtime,temp]},network:{egress:{default:'deny'},ingress:{default:'deny',hostLoopback:'deny'}},ui:{disable:false,clipboard:'none',allowInputInjection:false},environment:{SystemRoot:process.env.SystemRoot,LOCALAPPDATA:temp},inheritDefaultEnvironment:false,workingDirectory:runtime,timeoutMs:5000,command:[join(runtime,'python.exe'),'-I','-B','-X','utf8','-u',bootstrap].map(q).join(' ')};
   const support=probe(request);if(support.tier!=='base-container'||support.error||support.warnings?.length)throw Error('Isolamento indisponível.');
   if(cancelled)return{reason:'cancelled',stdout:'',stderr:''};
   child=await spawn(request,{telemetry:{enabled:false}});if(child.warnings.length||!child.id)throw Error('Isolamento não pôde ser confirmado.');if(cancelled){child.kill();await child.wait();return{reason:'cancelled',stdout:'',stderr:''}}
   const stdin=child.standardInput,stdout=child.standardOutput,stderr=child.standardError;
   if(!stdin||!stdout||!stderr)throw Error('Canais indisponíveis.');
   let retained=0,exceeded=false;const limit=65536, out=[],err=[];let ready=false;
   const completed=stream=>new Promise(resolveStream=>{stream.once('end',()=>resolveStream(null));stream.once('close',()=>resolveStream(null));stream.once('error',error=>resolveStream(error));});
   const stdoutDone=completed(stdout),stderrDone=completed(stderr);
   let resolveReady,rejectReady;const readiness=new Promise((r,j)=>{resolveReady=r;rejectReady=j});let pre='';
   const append=(parts,chunk)=>{const b=Buffer.from(chunk),keep=Math.min(b.length,Math.max(0,limit-retained));if(keep){parts.push(b.subarray(0,keep));retained+=keep}if(keep<b.length&&!exceeded){exceeded=true;child.kill()}};
   stdout.on('data',chunk=>{if(!ready){pre+=chunk.toString('utf8');if(pre.length>256){rejectReady(Error('Inicialização inválida.'));return}const end=pre.indexOf('\n');if(end>=0){if(pre.slice(0,end).trim()!=='TRILHA_SANDBOX_READY'){rejectReady(Error('Inicialização inválida.'));return}ready=true;resolveReady();if(pre.length>end+1)append(out,Buffer.from(pre.slice(end+1)));}}else append(out,chunk)});
   stderr.on('data',chunk=>append(err,chunk));stdout.on('error',rejectReady);stderr.on('error',rejectReady);stdout.on('end',()=>{if(!ready)rejectReady(Error('Inicialização interrompida.'))});
   stdout.on('close',()=>{if(!ready)rejectReady(Error('Inicialização interrompida.'))});
   try{await readiness}catch(error){if(cancelled){await child.wait();return{reason:'cancelled',stdout:'',stderr:''}}throw error}if(cancelled){child.kill();await child.wait();return{reason:'cancelled',stdout:'',stderr:''}}
   job=createJob(null,null);if(!job)throw Error('Não foi possível criar limite de recursos.');
   const limits=Buffer.alloc(144);limits.writeUInt32LE(0x2000|0x8|0x100|0x200,16);limits.writeUInt32LE(4,40);limits.writeBigUInt64LE(128n*1024n*1024n,112);limits.writeBigUInt64LE(256n*1024n*1024n,120);
   if(!setJob(job,9,limits,limits.length))throw Error('Não foi possível aplicar limite de recursos.');
   processHandle=openProcess(0x1101,0,child.id);if(!processHandle||!assign(job,processHandle))throw Error('Não foi possível vincular limite de recursos.');
   close(processHandle);processHandle=null;
   stdin.on('error',()=>{});const body=Buffer.from(code,'utf8');stdin.end(Buffer.concat([Buffer.from('TRILHA_SANDBOX_RUN '+body.length+'\n','ascii'),body,Buffer.from(input,'utf8')]));
   const result=await child.wait();close(job);job=null;const [outError,errError]=await Promise.all([stdoutDone,stderrDone]);if(outError||errError)throw Error('Falha ao receber a saída da execução.');
   return{reason:cancelled?'cancelled':exceeded?'output_limit':result.timedOut?'timeout':'completed',exitCode:result.exitCode,stdout:Buffer.concat(out).toString('utf8'),stderr:Buffer.concat(err).toString('utf8')};
  }finally{
   if(child){try{child.kill()}catch{} try{child.dispose()}catch{} child=null}if(processHandle)try{close(processHandle)}catch{} if(job)try{close(job)}catch{}
   if(bootstrap)try{unlinkSync(bootstrap)}catch{} if(temp)try{rmdirSync(temp)}catch{}
   running=false;
  }
 }
 return{execute,cancel};
}
