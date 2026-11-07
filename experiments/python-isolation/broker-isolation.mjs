import { createServer,createConnection } from 'node:net';
import { randomUUID } from 'node:crypto';
import { mkdirSync,writeFileSync,readFileSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExperimentalRunner } from './broker-runner.mjs';
const root=dirname(fileURLToPath(import.meta.url)), scratch=join(root,'prototype-scratch'), privateDir=join(root,'prototype-private');
mkdirSync(scratch,{recursive:true});mkdirSync(privateDir,{recursive:true});const file=join(privateDir,'canary.txt');writeFileSync(file,'host-can-read');
const key='TRILHA_TEST_SECRET';process.env[key]=randomUUID();const server=createServer(s=>s.end());
try{
 await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r)});const port=server.address().port;
 await new Promise((r,j)=>{const s=createConnection({host:'127.0.0.1',port});s.once('connect',()=>{s.end();r()});s.once('error',j)});
 const code=`import os,socket,json\nresult={'secret_present':bool(os.environ.get('${key}'))}\ntry:\n open(${JSON.stringify(file)},'rb').read();result['read']='allowed'\nexcept OSError as e: result['read']=type(e).__name__\ntry:\n socket.create_connection(('127.0.0.1',${port}),timeout=2);result['network']='allowed'\nexcept OSError as e: result['network']=type(e).__name__\nprint(json.dumps(result))\n`;
 const runner=createExperimentalRunner(join(root,'official-runtime'),scratch);const result=await runner.execute(code);const value=JSON.parse(result.stdout);
 const report={hostRead:readFileSync(file,'utf8')==='host-can-read',hostLoopback:true,execution:result.reason,secretPresent:value.secret_present,read:value.read,network:value.network};
 writeFileSync(join(root,'broker-isolation-result.json'),JSON.stringify(report,null,2));
 if(report.execution!=='completed'||report.secretPresent||report.read!=='PermissionError'||report.network!=='PermissionError')process.exitCode=1;
}catch(e){writeFileSync(join(root,'broker-isolation-result.json'),JSON.stringify({error:String(e)}));process.exitCode=1}
finally{delete process.env[key];server.close()}

