'use strict';
// Runs on the tablet; only published, non-prerelease GitHub releases are deployed.
const fs=require('fs'), path=require('path'), os=require('os'), http=require('http');
const {spawnSync,spawn}=require('child_process');
const root=process.env.LEDGER_ROOT||path.join(os.homedir(),'women-ledger');
const statePath=path.join(root,'release-updater-state.json');
const repo=process.env.LEDGER_TEST_REPO||'https://github.com/joodty/women-ledger.git';
const api='https://api.github.com/repos/joodty/women-ledger/releases/latest';
const store=path.join(root,'release-updater-cache.git');
const interval=5*60*1000;
const livePort=Number(process.env.LEDGER_TEST_PORT||18763);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function log(...args){console.log(new Date().toISOString(),...args)}
function run(cmd,args,opts={}){const r=spawnSync(cmd,args,{encoding:'utf8',timeout:120000,...opts});if(r.error||r.status!==0)throw Error(`${cmd} failed: ${(r.error?.message||r.stderr||'exit '+r.status).slice(0,400)}`);return (r.stdout||'').trim()}
function state(){try{return JSON.parse(fs.readFileSync(statePath,'utf8'))}catch(e){if(e.code==='ENOENT')return {};throw e}}
function save(s){const p=statePath+'.tmp';fs.writeFileSync(p,JSON.stringify(s,null,2)+'\n',{mode:0o600});fs.renameSync(p,statePath)}
function check(file){run(process.execPath,['--check',file])}
function codeCopy(src,dst){fs.copyFileSync(path.join(src,'server.cjs'),path.join(dst,'server.cjs'));fs.cpSync(path.join(src,'public'),path.join(dst,'public'),{recursive:true,force:true})}
function childPid(){const parent=Number(fs.readFileSync(path.join(root,'supervisor.pid'),'utf8').trim());if(!Number.isSafeInteger(parent)||parent<2)throw Error('invalid supervisor pid');const rows=run('ps',['-A','-o','pid,ppid,args']).split('\n').slice(1).map(x=>x.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/)).filter(Boolean).filter(x=>Number(x[2])===parent&&x[3].includes(path.join(root,'server.cjs')));if(rows.length!==1)throw Error('cannot identify exactly one supervised ledger server');return Number(rows[0][1])}
async function status(url){return await new Promise((resolve,reject)=>{const req=http.get(url,{timeout:2500},r=>{r.resume();resolve(r.statusCode)});req.on('timeout',()=>req.destroy(Error('timeout')));req.on('error',reject)})}
async function ready(url,timeout=20000){const until=Date.now()+timeout;while(Date.now()<until){try{if(await status(url)===200)return}catch{}await pause(500)}throw Error('ledger HTTP health check failed')}
async function restarted(old){const until=Date.now()+20000;while(Date.now()<until){try{if(childPid()!==old)return}catch{}await pause(500)}throw Error('server did not restart')}
async function preflight(stage,backup,tmp){
 const copy=path.join(tmp,'data');fs.mkdirSync(copy,{recursive:true});fs.copyFileSync(backup,path.join(copy,'ledger.sqlite'));
 // Port 0 lets the OS choose a free port. The startup message contains it only for
 // fixed ports, so reserve one briefly and let the child bind it immediately.
 const net=require('net');const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})});
 const child=spawn(process.execPath,[path.join(stage,'server.cjs')],{cwd:stage,env:{...process.env,WOMEN_DATA_DIR:copy,HOST:'127.0.0.1',PORT:String(port),WOMEN_SECURE_COOKIE:'1'},stdio:'ignore'});
 let exited=false;child.on('exit',()=>{exited=true});child.on('error',()=>{exited=true});
 try{await ready(`http://127.0.0.1:${port}/`,12000);if(exited)throw Error('preflight process exited');}finally{child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),pause(2000)])}
}
function git(args,opts={}){return run('git',['--git-dir',store,...args],opts)}
async function update(release){
 const tag=release.tag_name;if(typeof tag!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(tag))throw Error('invalid release tag');
 if(!fs.existsSync(store))run('git',['init','--bare',store]);
 git(['fetch','--no-tags',repo,'+refs/heads/main:refs/remotes/origin/main',`+refs/tags/${tag}:refs/tags/${tag}`]);
 const sha=git(['rev-parse',`refs/tags/${tag}^{commit}`]);if(!/^[0-9a-f]{40}$/.test(sha))throw Error('invalid commit');
 git(['merge-base','--is-ancestor',sha,'refs/remotes/origin/main']);
 const s=state();if(s.deployed===sha){log('already deployed',tag,sha.slice(0,8));return}if(s.failed===sha){log('previous failure requires manual review',tag);return}
 try{await deploy(sha,tag,s)}catch(e){const current=state();if(current.failed!==sha)save({...current,failed:sha,failedTag:tag,failedAt:new Date().toISOString()});throw e}
}
async function deploy(sha,tag,s){
 const stamp=new Date().toISOString().replace(/[:.]/g,'-'), base=path.join(root,'release-updater-work',stamp), stage=path.join(base,'stage'), prev=path.join(base,'previous');
 fs.mkdirSync(stage,{recursive:true});fs.mkdirSync(prev,{recursive:true});
 const tar=path.join(base,'release.tar');const fd=fs.openSync(tar,'w',0o600);try{git(['archive','--format=tar',sha,'server.cjs','public'],{stdio:['ignore',fd,'pipe']})}finally{fs.closeSync(fd)}
 run('tar',['-xf',tar,'-C',stage]);for(const f of ['server.cjs','public/original.js','public/sync.js'])check(path.join(stage,f));
 const backup=path.join(root,'data','backups',`before-release-${stamp}.sqlite`);fs.mkdirSync(path.dirname(backup),{recursive:true});run(process.execPath,[path.join(root,'server.cjs'),'backup',backup]);
 const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(backup,{readOnly:true});const ok=db.prepare('PRAGMA integrity_check').get().integrity_check;db.close();if(ok!=='ok')throw Error('backup integrity check failed');
 try{await preflight(stage,backup,base)}catch(e){save({...s,failed:sha,failedTag:tag,failedAt:new Date().toISOString(),backup});throw e}
 fs.copyFileSync(path.join(root,'server.cjs'),path.join(prev,'server.cjs'));fs.cpSync(path.join(root,'public'),path.join(prev,'public'),{recursive:true});
 const serverChanged=!fs.readFileSync(path.join(stage,'server.cjs')).equals(fs.readFileSync(path.join(root,'server.cjs')));
 const pid=serverChanged?childPid():null;
 try{
  codeCopy(stage,root);if(pid){process.kill(pid,'SIGTERM');await restarted(pid)}await ready(`http://127.0.0.1:${livePort}/`,20000);
  for(const name of ['original.js','sync.js','style.css']){const a=fs.readFileSync(path.join(stage,'public',name));const b=fs.readFileSync(path.join(root,'public',name));if(!a.equals(b))throw Error('deployed file mismatch '+name)}
  save({deployed:sha,tag,at:new Date().toISOString(),backup});log('deployed',tag,sha.slice(0,8),'database backup',backup);
 }catch(e){
  log('deployment failed; restoring previous code:',e.message);codeCopy(prev,root);if(serverChanged){try{process.kill(childPid(),'SIGTERM')}catch{}}save({...s,failed:sha,failedTag:tag,failedAt:new Date().toISOString(),backup});throw e;
 }
}
async function poll(){
 const r=await fetch(api,{headers:{'User-Agent':'women-ledger-release-updater','Accept':'application/vnd.github+json'},signal:AbortSignal.timeout(20000)});
 if(r.status===404){log('no published release');return}if(!r.ok)throw Error('GitHub API HTTP '+r.status);
 const release=await r.json();if(release.draft||release.prerelease)throw Error('refusing draft or prerelease');await update(release);
}
async function main(){fs.mkdirSync(root,{recursive:true});const lock=path.join(root,'release-updater.pid');if(fs.existsSync(lock)){const pid=Number(fs.readFileSync(lock,'utf8'));if(Number.isSafeInteger(pid)&&pid>1){try{process.kill(pid,0);throw Error('updater already running')}catch(e){if(e.code!=='ESRCH')throw e}}fs.unlinkSync(lock)}fs.writeFileSync(lock,String(process.pid),{mode:0o600,flag:'wx'});const cleanup=()=>{try{if(fs.readFileSync(lock,'utf8')===String(process.pid))fs.unlinkSync(lock)}catch{}};process.on('exit',cleanup);for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>process.exit());
 do{try{await poll()}catch(e){log('check failed:',e.message)}if(process.argv.includes('--once'))break;await pause(interval)}while(true)
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={update};
