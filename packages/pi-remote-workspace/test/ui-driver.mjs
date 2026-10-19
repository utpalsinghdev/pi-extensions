import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,readdirSync,rmSync} from 'node:fs';
import {setTimeout as sleep} from 'node:timers/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {sshFixture} from './ssh-fixture.ts';
const base=fileURLToPath(new URL('./',import.meta.url));
const repo=fileURLToPath(new URL('../',import.meta.url));
const mode=process.argv[2]||'fullscreen';
const auth=process.argv[3]||'password';
const run=mkdtempSync(join(tmpdir(),'pi-remote-ui-'));
let passed=false;
const fixture=await sshFixture(auth==='key'?'key':'password');
const socket=join(run,'outer.sock'), agent=join(run,'agent'), client=join(run,'client'), bin=join(run,'bin'), trace=join(run,'trace.log');
for(const d of [agent,client,bin])mkdirSync(d,{mode:0o700});
const realSsh=execFileSync('sh',['-c','command -v ssh'],{encoding:'utf8'}).trim();
const clientConfig=join(run,'ssh-config');
writeFileSync(clientConfig,`Include "${fixture.config}"\nHost *\n  SendEnv -*\n`,{mode:0o600});
// Isolate test SSH configuration without modifying the user's ~/.ssh/config.
writeFileSync(join(bin,'ssh'),`#!${process.execPath}\nconst {spawnSync}=require('node:child_process');
const args=process.argv.slice(2);let found=false;
for(let i=0;i<args.length;i++)if(args[i]==='-F'){args[++i]=${JSON.stringify(clientConfig)};found=true;}
if(!found)args.unshift('-F',${JSON.stringify(clientConfig)});
const result=spawnSync(${JSON.stringify(realSsh)},args,{stdio:'inherit'});process.exitCode=result.status??1;\n`,{mode:0o700});
writeFileSync(join(agent,'settings.json'),JSON.stringify({quietStartup:true,hideThinkingBlock:true}));
const cli=process.env.PI_REMOTE_WORKSPACE_TEST_CLI || fileURLToPath(new URL('../../../node_modules/.bin/pi',import.meta.url));
const tm=(...args)=>execFileSync('tmux',['-S',socket,'-f','/dev/null',...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const screen=()=>tm('capture-pane','-p','-t','ui:0.0');
const send=data=>tm('send-keys','-t','ui:0.0','-H',...Array.from(Buffer.from(data),b=>b.toString(16)));
const command=async text=>{send(text);send('\r');await sleep(180)};
const fillForm=()=>{send('fixture');send('\r');send('fixture');send('\r');send('\r');send('\r')};
const records=()=>{try{return readFileSync(trace,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l))}catch{return[]}};
const wait=async(predicate,label,timeout=15000)=>{const end=Date.now()+timeout;while(Date.now()<end){const s=screen();if(s.includes('pi exiting due to uncaughtException'))throw new Error(s);if(predicate(s))return s;await sleep(70)}throw new Error(`${label}\n${screen()}`)};
const turns=()=>records().filter(x=>x.output?.some(b=>b.text==='WORKSPACE_PROBE_DONE')).length;
const request=async text=>{const count=turns();await command(text);await wait(()=>turns()>count,`model turn ${text}`)};
const readTree=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?readTree(join(dir,e.name)):[join(dir,e.name)]);
const stableRequests=previousRequests=>{
 const currentRequests=records().filter(record=>record.request).slice(-2);
 assert.equal(currentRequests.length,2,'both provider transcript modes captured');
 for(const previous of previousRequests){
  const current=currentRequests.find(record=>record.supportsMidConvoSystemMessages===previous.supportsMidConvoSystemMessages);
  assert.deepEqual(current.request.tools,previous.request.tools,'workspace switch must not replace provider tool declarations');
  assert.deepEqual(current.request.input.slice(0,previous.request.input.length),previous.request.input,'workspace switch must preserve the existing provider request prefix');
 }
 return currentRequests;
};
const workspaceUpdates=request=>request.input.filter(item=>item.role==='user').flatMap(item=>typeof item.content==='string'?[item.content]:item.content.filter(block=>block.type==='input_text').map(block=>block.text)).filter(text=>text.startsWith('<workspace_update>'));
try{
 tm('new-session','-d','-s','ui','-x','110','-y','36','-c',client,
 'env',`PATH=${bin}:${process.env.PATH}`,`PI_CODING_AGENT_DIR=${agent}`,'PI_OFFLINE=1',`REMOTE_TRACE=${trace}`,`LOCAL_PROBE_MARKER=${join(client,'local-probe')}`,`LOCAL_OVERRIDE_MARKER=${join(client,'local-override')}`,
 cli,'--no-extensions','--no-skills','--no-prompt-templates','--no-themes','--no-context-files',
 '--extension',`${base}/override-fixture.ts`,'--extension',repo,'--extension',`${base}/fixture-provider.ts`,'--provider','remote-fixture','--model','fixture','--tui-mode',mode);
 tm('set-option','-w','-t','ui:0','remain-on-exit','on');
 await wait(s=>s.includes('fixture')&&!s.includes('Failed to load'),'startup');
 await request('where-initial-local');
 const initialActive=records().find(record=>record.active).active;
 const initialRequests=records().filter(record=>record.request).slice(-2);
 assert.equal(initialRequests.length,2,'both provider transcript modes captured before SSH');
 await command('/remote');
 await wait(s=>s.includes('SSH connection')&&s.includes('Host or SSH alias'),'connection form');
 send('fixture'); await sleep(120);
 assert.ok(screen().includes('fixture'),'legacy keyboard input reaches connection form');
 send('\r');await sleep(150);
 assert.equal(fixture.connectionCount,0,'Enter on host advances to username without starting SSH');
 send('\r');
 await wait(s=>s.includes('Enter your SSH username before connecting.'),'missing username validation');
 assert.equal(fixture.connectionCount,0,'missing username never starts SSH');
 send('fixture');send('\r');send('\r');send('\r');
 if(mode==='fullscreen'){
  const rows=screen().split('\n');const row=rows.findIndex(l=>l.includes('[Connect]'));
  const column=rows[row].indexOf('[Connect]')+3;
  send(`\x1b[<0;${column};${row+1}M`);send(`\x1b[<0;${column};${row+1}m`);
 }else send('\r');
 await wait(s=>s.includes('Confirm SSH host key'),'SSH trust prompt');
 assert.ok(screen().includes('SHA256:'),'host fingerprint is visible before accepting');
 send('y');
 await wait(s=>s.includes('SSH authentication')&&s.includes('Response:'),'secret input');
 const password=auth==='key'?fixture.passphrase:fixture.password;
 send(password); await sleep(180);
 const masked=screen();
 assert.ok(!masked.includes(password),'secret never rendered');
 assert.ok(masked.includes('•'),'masked input visible');
 send('\r');
 await wait(s=>s.includes('Remote workspace')&&s.includes('/remote stop')&&!s.includes('SSH connection'),'workspace switched and modal dismissed');
 writeFileSync(join(run,'connected.txt'),screen());
 await request('where-remote');
 const remoteRecords=records();
 const remoteRequests=stableRequests(initialRequests);
 for(const record of remoteRequests)assert.match(workspaceUpdates(record.request).at(-1),/Workspace is REMOTE/);
 assert.ok(remoteRecords.some(r=>r.lastTool?.content?.some(b=>b.text?.includes(fixture.home))),'bash runs in server home');
 const active=remoteRecords.filter(r=>r.active).at(-1);
 assert.deepEqual(active.active.sort(),initialActive.sort(),'tool catalog stays stable while remote; execution is separately guarded');
 await command('!printf USER_SHELL:;pwd');
 await wait(s=>s.includes(`USER_SHELL:${fixture.home}`),'user ! command runs remotely');
 await request('remote-file');
 assert.equal(readFileSync(join(fixture.home,'remote-only.txt'),'utf8'),'REMOTE_FILE_CREATED');
 assert.ok(!existsSync(join(client,'remote-only.txt')),'remote write never touches local workspace');
 const unchangedRequests=stableRequests(remoteRequests);
 for(const record of unchangedRequests)assert.equal(workspaceUpdates(record.request).length,2,'unchanged workspace does not repeat its notice');
 await request('try-local-tool');
 assert.ok(!existsSync(join(client,'local-probe')),'unrelated local tool cannot run remotely');
 await command('remote-sleep');
 await wait(s=>s.includes('REMOTE_SHELL_SLEEP_READY'),'long remote command started');
 const remotePid=readFileSync(join(fixture.home,'remote-sleep.pid'),'utf8');
 await command('/remote stop');
 await wait(s=>s.includes('Back in your local workspace')&&!s.includes('Leaving remote'),'stop during active tool restores local',20000);
 assert.ok(!existsSync(`/proc/${remotePid}`),'stop terminates tracked remote process');
 await command('/remote');
 await wait(s=>s.includes('SSH connection'),'reconnect form');
 fillForm(); send('\r');
 await wait(s=>s.includes('SSH authentication'),'reconnect prompts for authentication without new host confirmation');
 send(password); send('\r');
 await wait(s=>s.includes('Remote workspace ·')&&!s.includes('SSH connection'),'reconnect succeeded');
 fixture.disconnect();
 await wait(s=>s.includes('Remote disconnected'),'disconnect keeps remote mode');
 const before=fixture.commands.length;
 await request('where-disconnected');
 assert.equal(fixture.commands.length,before,'disconnected request did not reconnect');
 assert.ok(records().some(r=>r.lastTool?.isError),'disconnect/tool allowlist reports failure');
 await command('/remote stop');
 await wait(s=>s.includes('Back in your local workspace')&&!s.includes('Remote disconnected'),'stop returns local');
 await command('!printf LOCAL_SHELL:;pwd');
 await wait(s=>s.includes(`LOCAL_SHELL:${client}`),'user ! command restored locally');
 await request('where-local');
 const localRequests=stableRequests(remoteRequests);
 for(const record of localRequests)assert.match(workspaceUpdates(record.request).at(-1),/Workspace is LOCAL/);
 assert.ok(records().some(r=>r.lastTool?.content?.some(b=>b.text?.includes(client))),'bash restored local cwd');
 await request('try-local-tool');
 assert.ok(existsSync(join(client,'local-probe')),'previous active local tool restored');
 assert.deepEqual(records().filter(record=>record.active).at(-1).active.sort(),initialActive.sort(),'original local tool selection restored exactly');
 // Cancellation restores local state without leaving a modal or remote permission.
 await command('/remote');
 await wait(s=>s.includes('SSH connection'),'reopen form');
 send('\x1b');
 await wait(s=>!s.includes('SSH connection')&&!s.includes('SSH login'),'Escape cancels connection form');
 await request('where-local-after-cancel');
 for(const file of readTree(agent)){
  let contents;try{contents=readFileSync(file,'utf8')}catch{continue}
  assert.ok(!contents.includes(password),`password excluded from persisted Pi files: ${file}`);
 }
 assert.ok(!readFileSync(trace,'utf8').includes(password),'password excluded from model/tool data');
 // Cancelling at the secret prompt must tear down pending authentication without persisting input.
 await command('/remote');
 await wait(s=>s.includes('SSH connection'),'form before secret-cancel check');
 fillForm();send('\r');
 await wait(s=>s.includes('SSH authentication'),'secret prompt before cancel');
 send('cancelled-secret-value');send('\x1b');
 await wait(s=>!s.includes('SSH connection')&&!s.includes('SSH login'),'secret prompt cancelled');
 await request('where-local-after-secret-cancel');
 for(const file of readTree(agent)){
  let content;try{content=readFileSync(file,'utf8')}catch{continue}
  assert.ok(!content.includes('cancelled-secret-value'),'cancelled password never saved');
 }
 // Reload must close a live remote session and leave the replacement runtime local.
 await command('/remote');
 await wait(s=>s.includes('SSH connection'),'form before reload check');
 fillForm();send('\r');
 await wait(s=>s.includes('SSH authentication'),'authentication before reload check');
 send(password);send('\r');
 await wait(s=>s.includes('Remote workspace ·')&&!s.includes('SSH connection'),'connected before reload');
 await command('/reload');
 await wait(s=>s.includes('Reloaded')&&!s.includes('Remote workspace ·'),'reload returns local');
 await request('where-local-after-reload');
 // Quit with a live connection, rather than testing only an already disconnected client.
 await command('/remote');
 await wait(s=>s.includes('SSH connection'),'form before quit check');
 fillForm();send('\r');
 await wait(s=>s.includes('SSH authentication'),'authentication before quit check');
 send(password);send('\r');
 await wait(s=>s.includes('Remote workspace ·')&&!s.includes('SSH connection'),'connected before quit');
 await request('simulate-tool-override');
 assert.ok(!existsSync(join(client,'local-override')),'same-name local tool replacement must be blocked');
 assert.ok(records().some(r=>r.lastTool?.content?.some(b=>b.text?.includes('replaced this tool'))),'backend override reports blocked execution');
 await command('/quit');
 await wait(()=>fixture.activeConnections===0,'quit closes active SSH connection');
 passed=true;
 console.log(`PASS ${cli} ${mode} ${auth}: native SSH login, host trust, masked input, remote coding tools, local-tool block, disconnect fail-closed, stop restores local, cancel and transcript privacy.`);
}catch(error){try{writeFileSync(join(run,'failure.txt'),screen())}catch{}throw error}
finally{try{tm('kill-server')}catch{}await fixture.close();if(passed&&!process.env.PI_REMOTE_WORKSPACE_KEEP_UI_ARTIFACTS)rmSync(run,{recursive:true,force:true});else console.error(`UI artifacts: ${run}`);}
