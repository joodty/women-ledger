'use strict';
const {spawn}=require('node:child_process');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const assert=require('node:assert/strict');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'women-spaces-'));const base='http://127.0.0.1:18766';
const proc=spawn(process.execPath,['server.cjs'],{cwd:path.join(__dirname,'..'),env:{...process.env,WOMEN_DATA_DIR:dir,PORT:'18766'},stdio:'pipe'});
async function req(url,body,cookie){const r=await fetch(base+url,{method:body?'POST':'GET',headers:{...(body?{Origin:base,'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
(async()=>{try{
 for(let i=0;i<80;i++){try{await fetch(base);break}catch{await new Promise(r=>setTimeout(r,100))}}
 const pw='valid-password-123';
 assert.equal((await req('/api/register',{username:'alice',password:pw})).status,201);
 const a=await req('/api/login',{user:'alice',password:pw});assert.equal(a.status,200);assert.equal(a.data.user,'me');
 const inv=await req('/api/invite',{},a.cookie);assert.equal(inv.status,200);
 assert.equal((await req('/api/register',{username:'bob',password:pw,invitation:inv.data.token})).status,201);
 assert.equal((await req('/api/register',{username:'eve',password:pw,invitation:inv.data.token})).status,400);
 const b=await req('/api/login',{user:'bob',password:pw});assert.equal(b.data.user,'him');
 assert.equal((await req('/api/invite',{},a.cookie)).status,409);
 assert.equal((await req('/api/register',{username:'other',password:pw})).status,201);const other=await req('/api/login',{user:'other',password:pw});
 const data={version:4,couple:{since:'2026-01-01'},members:[{id:'me',name:'a'},{id:'him',name:'b'}],categories:[{id:'none',name:'未分类',color:'#D8D5D2'}],entries:[],goals:[],weekly_settlements:[],points_ledger:[],rewards:[],wishlist:[],story_entries:[],milestones:[],redemptions:[],sparks:[]};
 assert.equal((await req('/api/state',{revision:0,data},a.cookie)).status,200);
 assert.equal((await req('/api/state',null,b.cookie)).data.data.members[0].name,'a');assert.equal((await req('/api/state',null,other.cookie)).data.data,null);
 const a1=structuredClone(data),b1=structuredClone(data);a1.entries.push({id:'a1',memberId:'me',date:'2026-01-01',start:'10:00',end:'11:00',content:'a'});b1.entries.push({id:'b1',memberId:'him',date:'2026-01-01',start:'10:00',end:'11:00',content:'b'});
 assert.equal((await req('/api/state',{revision:1,data:a1},a.cookie)).status,200);const merged=await req('/api/state',{revision:1,data:b1},b.cookie);assert.equal(merged.status,200);assert.equal(merged.data.data.entries.length,2);
 const x=structuredClone(merged.data.data),y=structuredClone(x);x.entries[0].content='first';y.entries[0].content='second';assert.equal((await req('/api/state',{revision:3,data:x},a.cookie)).status,200);assert.equal((await req('/api/state',{revision:3,data:y},b.cookie)).status,409);
 const own=await req('/api/state',null,a.cookie);own.data.data.entries.push({id:'private_a',memberId:'me',visibility:'private',date:'2026-01-01',start:'11:00',end:'12:00',content:'private secret'});assert.equal((await req('/api/state',{revision:own.data.revision,data:own.data.data},a.cookie)).status,200);
 const their=await req('/api/state',null,b.cookie);assert.ok(!JSON.stringify(their.data).includes('private secret'));their.data.data.entries.push({id:'private_b',memberId:'him',visibility:'private',date:'2026-01-01',start:'12:00',end:'13:00',content:'their secret'});assert.equal((await req('/api/state',{revision:their.data.revision,data:their.data.data},b.cookie)).status,200);
 const again=await req('/api/state',null,a.cookie);assert.ok(JSON.stringify(again.data).includes('private secret'));assert.ok(!JSON.stringify(again.data).includes('their secret'));const bad=structuredClone(their.data.data);bad.entries.push({id:'private_a',memberId:'him',date:'2026-01-01',start:'10:00',end:'11:00',content:'try'});assert.equal((await req('/api/state',{revision:their.data.revision+1,data:bad},b.cookie)).status,409);
 const hist=await req('/api/history',null,a.cookie);assert.ok(hist.data.items.length);assert.equal((await req('/api/history/'+hist.data.items[0].id,null,other.cookie)).status,404);
 const bHistory=await req('/api/history',null,b.cookie);for(const item of bHistory.data.items){const snapshot=await req('/api/history/'+item.id,null,b.cookie);assert.ok(!JSON.stringify(snapshot.data).includes('private secret'));}
 const change=await req('/api/state',null,a.cookie);const shared=change.data.data.entries.find(e=>e.id==='a1');shared.visibility='private';assert.equal((await req('/api/state',{revision:change.data.revision,data:change.data.data},a.cookie)).status,200);
 assert.ok(!JSON.stringify((await req('/api/state',null,b.cookie)).data).includes('first'));
 for(const item of (await req('/api/history',null,b.cookie)).data.items)assert.ok(!JSON.stringify((await req('/api/history/'+item.id,null,b.cookie)).data).includes('first'));
 const setup=await req('/api/state',null,a.cookie);setup.data.data.goals.push({id:'goal1',memberId:'me',visibility:'private',name:'运动',status:'active',keywords:[],pointsPerCheckin:5});setup.data.data.rewards.push({id:'reward1',name:'火锅',pointsLabel:'4'});assert.equal((await req('/api/state',{revision:setup.data.revision,data:setup.data.data},a.cookie)).status,200);
 const checkin=await req('/api/state',null,a.cookie);checkin.data.data.entries.push({id:'entry-points',memberId:'me',visibility:'private',goalId:'goal1',date:'2026-11-01',start:'10:00',end:'11:00',content:'跑步'});const saved=await req('/api/state',{revision:checkin.data.revision,data:checkin.data.data},a.cookie);assert.equal(saved.status,200);assert.equal(saved.data.data.points_ledger.find(p=>p.entryId==='entry-points').points,5);
 const forged=structuredClone(saved.data.data);forged.points_ledger[0].points=9999;assert.equal((await req('/api/state',{revision:saved.data.revision,data:forged},a.cookie)).status,409);
 const purchase=await req('/api/redeem',{kind:'reward',id:'reward1',requestId:'purchase-1'},a.cookie);assert.equal(purchase.status,200);assert.equal(purchase.data.data.redemptions.at(-1).fromMe,4);
 const retry=await req('/api/redeem',{kind:'reward',id:'reward1',requestId:'purchase-1'},a.cookie);assert.equal(retry.status,200);assert.equal(retry.data.data.redemptions.length,purchase.data.data.redemptions.length);
 assert.equal((await req('/api/redeem',{kind:'reward',id:'reward1',requestId:'purchase-2'},a.cookie)).status,400);
 const remove=await req('/api/state',null,a.cookie);remove.data.data.entries=remove.data.data.entries.filter(e=>e.id!=='entry-points');assert.equal((await req('/api/state',{revision:remove.data.revision,data:remove.data.data},a.cookie)).status,409);
 const many=await req('/api/state',null,a.cookie);for(const id of ['shared_one','shared_two'])many.data.data.goals.push({id,memberId:'me',scope:'both',joined:false,visibility:'shared',status:'active',keywords:[],name:id});assert.equal((await req('/api/state',{revision:many.data.revision,data:many.data.data},a.cookie)).status,200);
 const joining=await req('/api/state',null,b.cookie);joining.data.data.goals.find(g=>g.id==='shared_one').joined=true;const joined=await req('/api/state',{revision:joining.data.revision,data:joining.data.data},b.cookie);assert.equal(joined.status,200,'joining one goal must work when another goal is unchanged');assert.equal(joined.data.data.goals.find(g=>g.id==='shared_two').joined,false);
 const editOther=structuredClone(joined.data.data);editOther.goals.find(g=>g.id==='shared_two').name='unauthorized';assert.equal((await req('/api/state',{revision:joined.data.revision,data:editOther},b.cookie)).status,409,'editing another member goal remains forbidden');
 console.log('PASS: registration, invitations, space isolation and concurrent edits');
 }finally{proc.kill();setTimeout(()=>fs.rmSync(dir,{recursive:true,force:true}),500)}})().catch(e=>{console.error(e);process.exitCode=1});
