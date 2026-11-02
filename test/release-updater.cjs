'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert');
const {spawn,spawnSync}=require('child_process');
const project=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ledger-release-test-'));
const root=path.join(tmp,'live'),repo=path.join(tmp,'repo'),port=24762;
function git(...args){const r=spawnSync('git',args,{cwd:repo,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim()}
async function wait(){for(let i=0;i<80;i++){try{const r=await fetch(`http://127.0.0.1:${port}/`);if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,100))}throw Error('test server did not start')}
let server;
(async()=>{
 fs.mkdirSync(root,{recursive:true});fs.mkdirSync(repo,{recursive:true});
 for(const dest of [root,repo]){fs.copyFileSync(path.join(project,'server.cjs'),path.join(dest,'server.cjs'));fs.cpSync(path.join(project,'public'),path.join(dest,'public'),{recursive:true})}
 git('init','-b','main');git('config','user.email','test@example.invalid');git('config','user.name','Release Test');git('add','.');git('commit','-m','base');
 const baselineTar=path.join(tmp,'baseline.tar');const baseline=spawnSync('git',['archive','--format=tar','--output',baselineTar,'HEAD','server.cjs'],{cwd:repo});if(baseline.status!==0)throw Error('cannot read test baseline');const unpack=spawnSync('tar',['-xf',baselineTar,'-C',root]);if(unpack.status!==0)throw Error('cannot unpack test baseline');
 fs.appendFileSync(path.join(repo,'public','style.css'),'\n/* release updater test */\n');
 if(process.env.LEDGER_TEST_RESTART)fs.appendFileSync(path.join(repo,'server.cjs'),'\n// release updater restart test\n');
 git('add','.');git('commit','-m','release');git('tag','v-test-1');
 if(process.env.LEDGER_TEST_RESTART){const supervisor=path.join(tmp,'supervisor.cjs');fs.writeFileSync(supervisor,"const {spawn}=require('child_process');let child;function start(){child=spawn(process.execPath,[process.argv[2]],{env:process.env,stdio:'ignore'});child.on('exit',()=>setTimeout(start,200))}process.on('SIGTERM',()=>{child.kill();process.exit()});start();");server=spawn(process.execPath,[supervisor,path.join(root,'server.cjs')],{env:{...process.env,PORT:String(port)},stdio:'ignore'});fs.writeFileSync(path.join(root,'supervisor.pid'),String(server.pid))}
 else server=spawn(process.execPath,[path.join(root,'server.cjs')],{env:{...process.env,PORT:String(port)},stdio:'ignore'});await wait();
 process.env.LEDGER_ROOT=root;process.env.LEDGER_TEST_REPO=repo;process.env.LEDGER_TEST_PORT=String(port);
 const {update}=require('../ops/release-updater.cjs');await update({tag_name:'v-test-1'});
 assert(fs.readFileSync(path.join(root,'public','style.css'),'utf8').includes('release updater test'));
 let s=JSON.parse(fs.readFileSync(path.join(root,'release-updater-state.json')));assert.equal(s.tag,'v-test-1');assert(fs.existsSync(s.backup));
 await update({tag_name:'v-test-1'});assert.equal(fs.readdirSync(path.join(root,'data','backups')).filter(x=>x.startsWith('before-release-')&&x.endsWith('.sqlite')).length,1);
 fs.writeFileSync(path.join(repo,'public','sync.js'),'const = invalid;');git('add','.');git('commit','-m','bad syntax');git('tag','v-test-bad');
 await assert.rejects(update({tag_name:'v-test-bad'}));assert(!fs.readFileSync(path.join(root,'public','sync.js'),'utf8').includes('const = invalid'));
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'release-updater-state.json'))).tag,'v-test-1');
 console.log('PASS: release deploy, backup, preflight, repeat and invalid code protection');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{if(server)server.kill();setTimeout(()=>{try{fs.rmSync(tmp,{recursive:true,force:true})}catch{}},500).unref()});
