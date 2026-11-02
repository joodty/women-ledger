'use strict';
/* 两个钱包：个人分 / 共同分。
   - 共同目标谁打卡都算，得分进「我们的分」
   - 共同愿望一人一半，分值必须偶数，且要两个人都点头
   - 个人愿望只扣自己的分，一个人就能兑
   - 记一笔每天最多发 3 分 */
const {spawn}=require('node:child_process');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const assert=require('node:assert/strict');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'women-wallet-'));const port=process.env.WOMEN_TEST_PORT||'24739',base='http://127.0.0.1:'+port;
const proc=spawn(process.execPath,['server.cjs'],{cwd:path.join(__dirname,'..'),env:{...process.env,WOMEN_DATA_DIR:dir,PORT:port},stdio:'pipe'});
async function req(url,body,cookie){const r=await fetch(base+url,{method:body?'POST':'GET',headers:{...(body?{Origin:base,'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const wallet=x=>x&&x.wallet==='ours'?'ours':'mine';
function balance(data,slot,walletName){
 const earned=data.points_ledger.filter(p=>p.memberId===slot&&wallet(p)===walletName).reduce((n,p)=>n+p.points,0);
 const spent=data.redemptions.filter(r=>r.status!=='pending'&&wallet(r)===walletName).reduce((n,r)=>n+(slot==='me'?(r.fromMe||0):(r.fromHim||0)),0);
 return earned-spent;
}
async function get(cookie){const r=await req('/api/state',null,cookie);return {revision:r.data.revision,data:r.data.data};}
async function put(cookie,rev,data){const r=await req('/api/state',{revision:rev,data},cookie);return r;}
(async()=>{try{
 for(let i=0;i<80;i++){try{await fetch(base);break}catch{await new Promise(r=>setTimeout(r,100))}}
 const pw='valid-password-123';
 assert.equal((await req('/api/register',{username:'alice',password:pw})).status,201);
 const a=await req('/api/login',{user:'alice',password:pw});assert.equal(a.data.user,'me');
 const inv=await req('/api/invite',{},a.cookie);
 assert.equal((await req('/api/register',{username:'bob',password:pw,invitation:inv.data.token})).status,201);
 const b=await req('/api/login',{user:'bob',password:pw});assert.equal(b.data.user,'him');

 const base_data={version:4,couple:{since:'2026-01-01'},members:[{id:'me',name:'a'},{id:'him',name:'b'}],categories:[{id:'none',name:'未分类',color:'#D8D5D2'}],entries:[],goals:[],weekly_settlements:[],points_ledger:[],rewards:[],wishlist:[],story_entries:[],milestones:[],redemptions:[],sparks:[]};
 assert.equal((await req('/api/state',{revision:0,data:base_data},a.cookie)).status,200);

 /* A. 共同目标 + 双方各自打卡 */
 let s=await get(a.cookie);
 s.data.goals.push({id:'g1',memberId:'me',name:'一起运动',scope:'both',status:'active',timesPerWeek:3,pointsPerCheckin:6,keywords:[],visibility:'shared',categoryId:'none'});
 s.data.entries.push({id:'e1',memberId:'me',date:'2026-11-02',start:'07:00',end:'07:30',minutes:30,content:'跑',goalId:'g1',categoryId:'none',visibility:'shared'});
 assert.equal((await put(a.cookie,s.revision,s.data)).status,200);

 s=await get(b.cookie);
 s.data.entries.push({id:'e2',memberId:'him',date:'2026-11-02',start:'08:00',end:'08:30',minutes:30,content:'跑',goalId:'g1',categoryId:'none',visibility:'shared'});
 assert.equal((await put(b.cookie,s.revision,s.data)).status,200);
 s=await get(a.cookie);
 assert.equal(balance(s.data,'me','ours'),6,'我打卡得共同分');
 assert.equal(balance(s.data,'him','ours'),6,'共同目标他打卡也能得分');

 /* B. 个人目标 -> 我的分 */
 s=await get(a.cookie);
 s.data.goals.push({id:'g2',memberId:'me',name:'早睡',scope:'me',status:'active',timesPerWeek:3,pointsPerCheckin:8,keywords:[],visibility:'shared',categoryId:'none'});
 s.data.entries.push({id:'e3',memberId:'me',date:'2026-11-02',start:'22:00',end:'22:30',minutes:30,content:'睡',goalId:'g2',categoryId:'none',visibility:'shared'});
 assert.equal((await put(a.cookie,s.revision,s.data)).status,200);
 s=await get(a.cookie);
 assert.equal(balance(s.data,'me','mine'),11,'个人目标 8 分 + 这周做到过约定，保底 3 分');
 assert.equal(balance(s.data,'me','ours'),6,'个人目标不动共同分');
 /* 周保底：一个成员一周只给一次，记在周一那一天 */
 const floor=s.data.points_ledger.filter(p=>p.type==='week');
 assert.equal(floor.length,2,'两个人都做到过，各一行保底');
 assert.equal(floor.find(p=>p.memberId==='me').date,'2026-11-02','保底记在周一');
 assert.equal(floor.find(p=>p.memberId==='me').points,3);

 /* C. 共同愿望：先发起，不扣分 */
 s=await get(a.cookie);
 s.data.wishlist.push({id:'w1',cat:'go',name:'去看海',pointsLabel:'10',scope:'both',status:'saving',executor:'both',executorLabel:'我们一起'});
 assert.equal((await put(a.cookie,s.revision,s.data)).status,200);

 let r=await req('/api/redeem',{kind:'wish',id:'w1',requestId:'req-a-1'},a.cookie);
 assert.equal(r.status,200,'发起兑换');
 assert.equal(r.data.pending,true,'共同愿望要等对方确认');
 assert.equal(balance(r.data.data,'me','ours'),6,'发起阶段不扣分');
 assert.equal(r.data.data.redemptions.at(-1).status,'pending');

 /* D. 同一个人不能重复发起 */
 r=await req('/api/redeem',{kind:'wish',id:'w1',requestId:'req-a-2'},a.cookie);
 assert.equal(r.status,409,'已经发出去等他点头');

 /* 双方确认前，如果申请内容变更，不得按照新价格扣分；可先取消旧申请。 */
 s=await get(a.cookie);s.data.wishlist.find(x=>x.id==='w1').pointsLabel='12';assert.equal((await put(a.cookie,s.revision,s.data)).status,200);
 r=await req('/api/redeem',{kind:'wish',id:'w1',requestId:'req-b-changed'},b.cookie);assert.equal(r.status,409);assert.match(r.data.error,/已更改/);
 r=await req('/api/redeem/cancel',{id:'req-a-1'},b.cookie);assert.equal(r.status,200);assert.equal(r.data.data.redemptions.find(x=>x.id==='req-a-1').status,'cancelled');assert.equal(balance(r.data.data,'me','ours'),6);
 s=await get(a.cookie);s.data.wishlist.find(x=>x.id==='w1').pointsLabel='10';assert.equal((await put(a.cookie,s.revision,s.data)).status,200);
 assert.equal((await req('/api/redeem',{kind:'wish',id:'w1',requestId:'req-a-reopen'},a.cookie)).status,200);

 /* E. 对方点头才真正扣分，一人一半 */
 r=await req('/api/redeem',{kind:'wish',id:'w1',requestId:'req-b-1'},b.cookie);
 assert.equal(r.status,200,'对方确认');
 assert.equal(r.data.pending,false);
 const done=r.data.data.redemptions.find(x=>x.wishId==='w1'&&x.status==='done');
 assert.equal(done.status,'done');
 assert.equal(done.fromMe,5,'我出一半');
 assert.equal(done.fromHim,5,'他出一半');
 assert.equal(balance(r.data.data,'me','ours'),1);
 assert.equal(balance(r.data.data,'him','ours'),1);
 assert.equal(r.data.data.wishlist.find(x=>x.id==='w1').status,'redeemed');
 const confirmedRevision=r.data.revision;const retry=await req('/api/redeem',{kind:'wish',id:'w1',requestId:'req-b-1'},b.cookie);assert.equal(retry.status,200);assert.equal(retry.data.revision,confirmedRevision);assert.equal(balance(retry.data.data,'me','ours'),1);

 /* F. 奇数分不能两个人兑 */
 s=await get(a.cookie);
 s.data.wishlist.push({id:'w2',cat:'go',name:'看星星',pointsLabel:'9',scope:'both',status:'saving',executor:'both',executorLabel:'我们一起'});
 assert.equal((await put(a.cookie,s.revision,s.data)).status,200);
 r=await req('/api/redeem',{kind:'wish',id:'w2',requestId:'req-a-3'},a.cookie);
 assert.equal(r.status,400);
 assert.match(r.data.error,/2 整除/);

 /* G. 个人愿望：一个人就能兑，只扣我的分 */
 s=await get(a.cookie);
 s.data.wishlist.push({id:'w3',cat:'together',name:'买一本书',pointsLabel:'3',scope:'me',status:'saving',executor:'me',executorLabel:'我来安排'});
 assert.equal((await put(a.cookie,s.revision,s.data)).status,200);
 r=await req('/api/redeem',{kind:'wish',id:'w3',requestId:'req-a-4'},a.cookie);
 assert.equal(r.status,200);
 assert.equal(r.data.pending,false,'个人愿望不需要等对方');
 assert.equal(balance(r.data.data,'me','mine'),8,'从我的分里扣 3');
 assert.equal(balance(r.data.data,'me','ours'),1,'共同分不受影响');

 /* H. 记一笔不再发分（2026-11-02 之后取消） */
 s=await get(a.cookie);
 for(let i=1;i<=4;i++)s.data.entries.push({id:'n'+i,memberId:'me',date:'2026-11-03',start:'0'+i+':00',end:'0'+i+':30',minutes:30,content:'记'+i,categoryId:'none',visibility:'shared'});
 assert.equal((await put(a.cookie,s.revision,s.data)).status,200);
 s=await get(a.cookie);
 const dayPts=s.data.points_ledger.filter(p=>p.type==='entry'&&p.date==='2026-11-03');
 assert.equal(dayPts.length,0,'记一笔不再发分');
 assert.equal(balance(s.data,'me','mine'),8,'记录不改变我的分');


 /* I. 还没加入的共同约定不计分，加入后补算 */
 s=await get(a.cookie);
 s.data.goals.push({id:'g9',memberId:'me',name:'一起看剧',scope:'both',status:'active',joined:false,timesPerWeek:1,pointsPerCheckin:4,keywords:[],visibility:'shared',categoryId:'none'});
 s.data.entries.push({id:'e9',memberId:'me',date:'2026-11-03',start:'20:00',end:'20:30',minutes:30,content:'看',goalId:'g9',categoryId:'none',visibility:'shared'});
 assert.equal((await put(a.cookie,s.revision,s.data)).status,200);
 s=await get(a.cookie);
 assert.equal(balance(s.data,'me','ours'),1,'还没加入的共同约定不计分');
 s.data.goals.find(g=>g.id==='g9').joined=true;
 assert.equal((await put(a.cookie,s.revision,s.data)).status,200);
 s=await get(a.cookie);
 assert.equal(balance(s.data,'me','ours'),1,'加入本身不发分，之前做的也不补');
 s.data.entries.push({id:'e10',memberId:'me',date:'2026-11-03',start:'21:00',end:'21:30',minutes:30,content:'看',goalId:'g9',categoryId:'none',visibility:'shared'});
 assert.equal((await put(a.cookie,s.revision,s.data)).status,200);
 s=await get(a.cookie);
 assert.equal(balance(s.data,'me','ours'),5,'加入后做到才算，4 分');
 assert.equal(balance(s.data,'me','mine'),8,'周保底不重复给，一周只加一次');

 console.log('PASS: two wallets, shared goals, half payment, both confirm, entries earn nothing');
}finally{proc.kill();setTimeout(()=>fs.rmSync(dir,{recursive:true,force:true}),500)}})().catch(e=>{console.error(e);process.exitCode=1});
