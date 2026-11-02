'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline/promises');
const { DatabaseSync, backup } = require('node:sqlite');
const dataDir = path.resolve(process.env.WOMEN_DATA_DIR || path.join(__dirname, 'data'));
fs.mkdirSync(dataDir, {recursive:true, mode:0o700});
const db = new DatabaseSync(path.join(dataDir,'ledger.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, salt BLOB NOT NULL, hash BLOB NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, json TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS snapshots (id INTEGER PRIMARY KEY, revision INTEGER NOT NULL, json TEXT NOT NULL, created_at TEXT NOT NULL);`);
db.exec(`CREATE TABLE IF NOT EXISTS spaces (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS space_members (user_id TEXT PRIMARY KEY REFERENCES users(id), space_id TEXT NOT NULL REFERENCES spaces(id), slot TEXT NOT NULL CHECK(slot IN ('me','him')), UNIQUE(space_id,slot));
CREATE TABLE IF NOT EXISTS space_state (space_id TEXT PRIMARY KEY REFERENCES spaces(id), revision INTEGER NOT NULL, json TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS space_snapshots (id INTEGER PRIMARY KEY, space_id TEXT NOT NULL REFERENCES spaces(id), revision INTEGER NOT NULL, json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS invitations (token_hash TEXT PRIMARY KEY, space_id TEXT NOT NULL REFERENCES spaces(id), expires INTEGER NOT NULL);`);
// Keep the original single-space tables intact while mapping the original two accounts.
db.prepare('INSERT OR IGNORE INTO spaces VALUES(?,?)').run('legacy',Date.now());
for(const slot of ['me','him'])db.prepare('INSERT OR IGNORE INTO space_members(user_id,space_id,slot) SELECT id,?,id FROM users WHERE id=?').run('legacy',slot);
const count = () => db.prepare('SELECT count(*) n FROM users').get().n;
const hashPassword = (p,s) => crypto.scryptSync(p,s,64);
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
const users = ['me','him'];
async function secret(prompt) { if(!process.stdin.isTTY)throw Error('请在终端中交互设置密码');const {Writable}=require('node:stream');const silent=new Writable({write(_c,_e,done){done()}});process.stdout.write(prompt);const rl=readline.createInterface({input:process.stdin,output:silent,terminal:true});try{return await rl.question('')}finally{rl.close();process.stdout.write('\n')}}
async function setup() {
 if(count()) throw Error('账户已存在；不会覆盖已有账户。');
 const entries=[];
 for(const id of users) { const p=await secret(`设置${id==='me'?'第一位':'第二位'}成员的密码（至少 12 个字符）：`); const confirm=await secret('再次输入：'); if(p.length<12||p!==confirm) throw Error('密码不足 12 字符或两次不同'); entries.push([id,crypto.randomBytes(16),p]); }
 db.exec('BEGIN IMMEDIATE'); try { for(const [id,salt,p] of entries) db.prepare('INSERT INTO users VALUES(?,?,?)').run(id,salt,hashPassword(p,salt)); db.exec('COMMIT'); } catch(e) {db.exec('ROLLBACK');throw e;} console.log('两个成员账户已创建，请妥善保管密码。');
}
if(process.argv[2]==='setup') { setup().catch(e=>{console.error(e.message);process.exitCode=1}); return; }
if(process.argv[2]==='passwd') { (async()=>{const id=process.argv[3];if(!users.includes(id)||!count())throw Error('请选择已有成员 me 或 him');const p=await secret('新密码（至少 12 个字符）：');const confirm=await secret('再次输入：');if(p.length<12||p!==confirm)throw Error('密码不足 12 字符或两次不同');const salt=crypto.randomBytes(16);db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE users SET salt=?,hash=? WHERE id=?').run(salt,hashPassword(p,salt),id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}console.log('密码已更新，该成员需重新登录。')})().catch(e=>{console.error(e.message);process.exitCode=1});return; }
if(process.argv[2]==='backup') { const destination=process.argv[3]&&path.resolve(process.argv[3]); if(!destination||fs.existsSync(destination)){console.error('请指定不存在的备份文件路径。');process.exit(1)} backup(db,destination).then(()=>{fs.chmodSync(destination,0o600);db.close();console.log('数据库备份已创建。')}).catch(e=>{console.error(e.message);process.exitCode=1});return; }
const attempts=new Map();
const registrations=new Map();
const secure=process.env.WOMEN_SECURE_COOKIE==='1';
const port=Number(process.env.PORT||18763), host=process.env.HOST||'127.0.0.1';
const publicDir=path.join(__dirname,'public');
const files={'/':'index.html','/index.html':'index.html','/style.css':'style.css','/sync.js':'sync.js','/original.js':'original.js'};
function send(res,status,obj,headers={}) {const body=JSON.stringify(obj);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(body);}
function cookie(req) { const match=(req.headers.cookie||'').match(/(?:^|;\s*)women_session=([a-f0-9]{64})(?:;|$)/);return match&&match[1]; }
function session(req) {const t=cookie(req);if(!t)return null;return db.prepare('SELECT s.user_id,s.expires,m.space_id,m.slot FROM sessions s JOIN space_members m ON m.user_id=s.user_id WHERE s.token_hash=? AND s.expires>?').get(sha(t),Date.now());}
function sameOrigin(req) { const origin=req.headers.origin; if(!origin)return false;try{return new URL(origin).host === req.headers.host && ['http:','https:'].includes(new URL(origin).protocol);}catch{return false;} }
function getBody(req) {return new Promise((resolve,reject)=>{let size=0,chunks=[];req.on('data',chunk=>{size+=chunk.length;if(size>2*1024*1024){reject(Error('内容超过 2MB'));req.destroy();}else chunks.push(chunk)});req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))}catch{reject(Error('无效 JSON'))}});req.on('error',reject)});}
function validState(s) {const arrays=['members','categories','entries','goals','weekly_settlements','points_ledger','rewards','wishlist','story_entries','milestones','redemptions','sparks'];return !!(s && s.version===4 && s.couple && typeof s.couple==='object' && arrays.every(k=>Array.isArray(s[k]) && s[k].length<=100000) && s.members.length===2 && s.members.every(m=>m && typeof m.name==='string' && m.name.length<=200) && s.categories.some(c=>c && c.id==='none') && ['entries','goals','points_ledger','story_entries','redemptions'].every(k=>s[k].every(x=>x && ['me','him'].includes(x.memberId))) && s.entries.every(x=>typeof x.content==='string' && typeof x.date==='string' && /^\d{4}-\d{2}-\d{2}$/.test(x.date) && typeof x.start==='string' && typeof x.end==='string') && s.goals.every(x=>Array.isArray(x.keywords)) && typeof s.couple.since==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s.couple.since) && s.members.some(m=>m.id==='me')&&s.members.some(m=>m.id==='him') && s.members.every(m=>m && (!m.avatar || (typeof m.avatar==='string' && /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(m.avatar)))) && s.categories.every(c=>c && typeof c.color==='string' && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c.color)) && arrays.filter(k=>k!=='sparks').every(k=>s[k].every(item=>item && typeof item==='object' && (!('id' in item) || (typeof item.id==='string' && /^[a-z0-9_-]{1,100}$/i.test(item.id))))));}
// A three-way merge only accepts independent edits. Deletions versus edits and
// simultaneous changes to the same value remain explicit conflicts.
const absent=Symbol('absent');
const equal=(a,b)=>a===absent||b===absent?a===b:JSON.stringify(a)===JSON.stringify(b);
function mergeValue(base,local,remote){
 if(equal(local,base))return remote;if(equal(remote,base)||equal(local,remote))return local;
 if(base===absent||local===absent||remote===absent)throw Error('conflict');
 if(Array.isArray(base)&&Array.isArray(local)&&Array.isArray(remote)){
  const all=[...base,...local,...remote];
  if(!all.every(x=>x&&typeof x==='object'&&!Array.isArray(x)&&typeof x.id==='string'))throw Error('conflict');
  for(const a of [base,local,remote])if(new Set(a.map(x=>x.id)).size!==a.length)throw Error('conflict');
  // Concurrent reordering must not silently lose either user's arrangement.
  const baseIds=new Set(base.map(x=>x.id));for(const a of [local,remote]){const ids=new Set(a.map(x=>x.id));const before=base.filter(x=>ids.has(x.id)).map(x=>x.id),after=a.filter(x=>baseIds.has(x.id)).map(x=>x.id);if(!equal(before,after))throw Error('conflict');}
  const maps=[base,local,remote].map(a=>new Map(a.map(x=>[x.id,x]))),ids=[...new Set([...remote,...local].map(x=>x.id))];
  return ids.map(id=>mergeValue(...maps.map(m=>m.has(id)?m.get(id):absent))).filter(x=>x!==absent);
 }
 if([base,local,remote].every(x=>x&&typeof x==='object'&&!Array.isArray(x))){
  const out={};for(const k of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])){
   const v=mergeValue(...[base,local,remote].map(x=>Object.hasOwn(x,k)?x[k]:absent));if(v!==absent)out[k]=v;
  }return out;
 }
 throw Error('conflict');
}
function visibleState(data,slot){
 const result=structuredClone(data);
 const hiddenGoals=new Set(data.goals.filter(x=>x.memberId!==slot&&x.visibility==='private').map(x=>'完成长期目标「'+x.name+'」'));
 result.milestones=result.milestones.filter(x=>x.kind!=='goal'||!hiddenGoals.has(x.title));
 for(const key of ['entries','goals'])result[key]=result[key].filter(x=>x.memberId===slot||x.visibility!=='private');
 return result;
}
function visibleHistory(data,slot){
 const result=visibleState(data,slot);
 // An item shared in the past can become private later; historical snapshots
 // must not give the other account a way to recover its former contents.
 for(const key of ['entries','goals'])result[key]=result[key].filter(x=>x.memberId===slot);
 result.milestones=result.milestones.filter(x=>x.kind!=='goal');
 return result;
}
function protectPersonal(base,requested,slot){
 for(const key of ['entries','goals']){
  const a=base[key].filter(x=>x.memberId!==slot),b=requested[key].filter(x=>x.memberId!==slot);
  if(!equal(a,b))throw Error('cannot change another member’s personal items');
  const original=new Map(base[key].map(x=>[x.id,x]));
  for(const x of requested[key]){const old=original.get(x.id);if(!x.id||!['private','shared',undefined].includes(x.visibility)||(old&&old.memberId!==x.memberId))throw Error('invalid item ownership');}
  if(new Set(requested[key].map(x=>x.id)).size!==requested[key].length)throw Error('duplicate personal item');
 }
}
/* 记一笔也发分：每条 1 分，每人每天最多 3 条。
   只对生效日之后的记录生效，避免把历史记录一次性补成一大笔分。 */
/* 记一笔曾经发过分，2026-11-02 之后取消：奖励「记录」这个动作没有意义，
   而且写什么都行、无法核实。历史分保留，不追溯扣除。 */
const ENTRY_POINTS_SINCE='2026-11-02',ENTRY_POINTS_UNTIL='2026-11-02',ENTRY_POINTS_PER=1,ENTRY_POINTS_DAILY=3;
/* 钱包：旧记录没有 wallet 字段，一律算个人分 */
const walletTag=x=>x&&x.wallet==='ours'?'ours':'mine';
function reconcilePoints(before,after){
 const oldEntries=new Map((before?.entries||[]).map(e=>[e.id,e]));
 const oldAwards=new Map((before?.points_ledger||[]).filter(p=>p.type==='checkin'&&p.entryId).map(p=>[p.entryId,p]));
 const goals=new Map(after.goals.map(g=>[g.id,g]));
 const ledger=(before?.points_ledger||[]).filter(p=>!((p.type==='checkin'||p.type==='entry')&&p.entryId));
 /* 目标打卡：共同目标谁打卡都能计入（分记在打卡人自己名下） */
 for(const e of after.entries){
  const previous=oldEntries.get(e.id),old=oldAwards.get(e.id);let award=null;
  if(previous&&previous.goalId===e.goalId&&previous.memberId===e.memberId)award=old||null;
  else if(e.goalId){const goal=goals.get(e.goalId),amount=goal?.pointsPerCheckin,shared=goal?.scope==='both';
   if(goal&&(shared||goal.memberId===e.memberId)&&goal.status==='active'&&Number.isSafeInteger(amount)&&amount>0&&amount<=10000)
    award={id:'checkin-'+e.id,entryId:e.id,memberId:e.memberId,type:'checkin',wallet:shared?'ours':'mine',points:amount,date:e.date,note:shared?'共同目标打卡':'目标打卡'};
  }
  if(award){award.wallet=walletTag(award);ledger.push(award);}
 }
 /* 记一笔：不进目标的那种，按天取前 3 条各 1 分 */
 const days=new Map();
 for(const e of after.entries){
  if(e.goalId||String(e.date||'')<ENTRY_POINTS_SINCE||String(e.date||'')>ENTRY_POINTS_UNTIL)continue;
  const key=e.memberId+'|'+e.date;
  if(!days.has(key))days.set(key,[]);
  days.get(key).push(e);
 }
 for(const [key,list] of days){
  list.sort((a,b)=>String(a.start||'').localeCompare(String(b.start||''))||String(a.id).localeCompare(String(b.id)));
  const memberId=key.slice(0,key.indexOf('|'));
  for(const e of list.slice(0,ENTRY_POINTS_DAILY))
   ledger.push({id:'entry-'+e.id,entryId:e.id,memberId,type:'entry',wallet:'mine',points:ENTRY_POINTS_PER,date:e.date,note:'记一笔'});
 }
 after.points_ledger=ledger;
 for(const slot of ['me','him'])for(const wallet of ['mine','ours']){
  const earned=ledger.filter(p=>p.memberId===slot&&walletTag(p)===wallet).reduce((n,p)=>n+(Number.isFinite(p.points)?p.points:0),0);
  const spent=after.redemptions.filter(r=>r.status!=='pending'&&walletTag(r)===wallet).reduce((n,r)=>n+(slot==='me'?(r.fromMe||0):(r.fromHim||0)),0);
  if(earned<spent)throw Error('已兑换积分，无法撤回该打卡');
 }
}
const server=http.createServer(async(req,res)=>{try{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
 const url=new URL(req.url,'http://localhost');const pathname=url.pathname;
 if((req.method==='GET'||req.method==='HEAD')&&pathname==='/download/women-ledger-0.2.0.apk'){
  const apk=process.env.WOMEN_APK_PATH||path.join(publicDir,'downloads','women-ledger-0.2.0.apk');let size;
  try{size=fs.statSync(apk).size}catch{return send(res,404,{error:'安装包暂不可用'});}
  res.writeHead(200,{'Content-Type':'application/vnd.android.package-archive','Content-Length':size,'Content-Disposition':'attachment; filename="women-ledger-0.2.0.apk"','Cache-Control':'no-store'});
  if(req.method==='HEAD')return res.end();const stream=fs.createReadStream(apk);stream.on('error',()=>res.destroy());return stream.pipe(res);
 }
 if(req.method==='GET' && files[pathname]) {const name=files[pathname];const type=name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':'text/html';res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store'});return fs.createReadStream(path.join(publicDir,name)).pipe(res);}
 if(req.method==='POST'&&!sameOrigin(req)) return send(res,403,{error:'请求来源不匹配'});
 if(pathname==='/api/login'&&req.method==='POST') {const key=req.socket.remoteAddress;const a=attempts.get(key)||{n:0,t:0};if(a.t>Date.now())return send(res,429,{error:'尝试次数过多，请稍后再试'});const body=await getBody(req);const row=typeof body.user==='string'?db.prepare('SELECT u.*,m.slot FROM users u JOIN space_members m ON m.user_id=u.id WHERE u.id=?').get(body.user.trim().toLowerCase()):null;const salt=row?row.salt:Buffer.alloc(16);const actual=hashPassword(typeof body.password==='string'?body.password.slice(0,256):'',salt);const good=row&&crypto.timingSafeEqual(actual,Buffer.from(row.hash));if(!good){a.n++;if(a.n>=5){a.n=0;a.t=Date.now()+60000;}attempts.set(key,a);return send(res,401,{error:'账号或密码不正确'});}attempts.delete(key);const token=crypto.randomBytes(32).toString('hex');const expires=Date.now()+7*86400000;db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(sha(token),row.id,expires);return send(res,200,{user:row.slot,account:row.id},{'Set-Cookie':`women_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secure?'; Secure':''}`});}
 if(pathname==='/api/register'&&req.method==='POST'){
  const registerKey=req.socket.remoteAddress,now=Date.now();let limit=registrations.get(registerKey);if(!limit||limit.until<=now)limit={count:0,until:now+3600000};if(limit.count>=20)return send(res,429,{error:'注册请求过多，请稍后再试'});limit.count++;registrations.set(registerKey,limit);
  const body=await getBody(req),id=typeof body.username==='string'?body.username.trim().toLowerCase():'',password=body.password;
  if(!/^[a-z0-9_]{3,32}$/.test(id)||users.includes(id)||typeof password!=='string'||password.length<12||password.length>256)return send(res,400,{error:'账号须为3至32位字母、数字或下划线，密码须为12至256位'});
  const invitation=typeof body.invitation==='string'?body.invitation:'';if(invitation&&!/^[a-f0-9]{64}$/.test(invitation))return send(res,400,{error:'邀请链接无效'});
  const salt=crypto.randomBytes(16),hash=hashPassword(password,salt);db.exec('BEGIN IMMEDIATE');try{
   if(db.prepare('SELECT 1 FROM users WHERE id=?').get(id)){db.exec('ROLLBACK');return send(res,409,{error:'账号已存在'});}
   let spaceId,slot;if(invitation){const row=db.prepare('SELECT * FROM invitations WHERE token_hash=? AND expires>?').get(sha(invitation),Date.now());if(!row||db.prepare('SELECT count(*) n FROM space_members WHERE space_id=?').get(row.space_id).n!==1){db.exec('ROLLBACK');return send(res,400,{error:'邀请已失效或空间已满'});}spaceId=row.space_id;const member=db.prepare('SELECT slot FROM space_members WHERE space_id=?').get(spaceId);slot=member.slot==='me'?'him':'me';db.prepare('DELETE FROM invitations WHERE space_id=?').run(spaceId);}
   else{spaceId=crypto.randomUUID();slot='me';db.prepare('INSERT INTO spaces VALUES(?,?)').run(spaceId,Date.now());}
   db.prepare('INSERT INTO users VALUES(?,?,?)').run(id,salt,hash);db.prepare('INSERT INTO space_members VALUES(?,?,?)').run(id,spaceId,slot);db.exec('COMMIT');return send(res,201,{ok:true});
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 const s=session(req);if(!s)return send(res,401,{error:'请先登录'});
 if(pathname==='/api/session'&&req.method==='GET')return send(res,200,{user:s.slot,account:s.user_id,legacySpace:s.space_id==='legacy',canInvite:db.prepare('SELECT count(*) n FROM space_members WHERE space_id=?').get(s.space_id).n===1});
 if(pathname==='/api/password'&&req.method==='POST'){
  const key='password:'+s.user_id,a=attempts.get(key)||{n:0,t:0};if(a.t>Date.now())return send(res,429,{error:'尝试次数过多，请稍后再试'});
  const body=await getBody(req),current=typeof body.currentPassword==='string'?body.currentPassword.slice(0,256):'',next=body.newPassword;
  if(typeof next!=='string'||next.length<12||next.length>256)return send(res,400,{error:'新密码需要 12 至 256 个字符'});
  const row=db.prepare('SELECT salt,hash FROM users WHERE id=?').get(s.user_id),actual=hashPassword(current,row.salt);
  if(!crypto.timingSafeEqual(actual,Buffer.from(row.hash))){a.n++;if(a.n>=5){a.n=0;a.t=Date.now()+60000}attempts.set(key,a);return send(res,401,{error:'当前密码不正确'});}
  attempts.delete(key);const salt=crypto.randomBytes(16),hash=hashPassword(next,salt);db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE users SET salt=?,hash=? WHERE id=?').run(salt,hash,s.user_id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(s.user_id);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
  return send(res,200,{ok:true},{'Set-Cookie':'women_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'});
 }
 if(pathname==='/api/invite'&&req.method==='POST'){
  if(db.prepare('SELECT count(*) n FROM space_members WHERE space_id=?').get(s.space_id).n!==1)return send(res,409,{error:'两人空间已有两位成员'});
  const token=crypto.randomBytes(32).toString('hex');db.prepare('DELETE FROM invitations WHERE space_id=?').run(s.space_id);db.prepare('INSERT INTO invitations VALUES(?,?,?)').run(sha(token),s.space_id,Date.now()+86400000);return send(res,200,{token,expiresIn:86400});
 }
 if(pathname==='/api/logout'&&req.method==='POST'){db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(cookie(req)));return send(res,200,{ok:true},{'Set-Cookie':'women_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'});}
 const legacy=s.space_id==='legacy',space=s.space_id;
 if(pathname==='/api/redeem'&&req.method==='POST'){
 const body=await getBody(req);if(!['wish','reward'].includes(body.kind)||typeof body.id!=='string'||!/^[a-z0-9_-]{1,100}$/i.test(body.id)||typeof body.requestId!=='string'||!/^[a-z0-9_-]{1,100}$/i.test(body.requestId))return send(res,400,{error:'兑换请求无效'});
 db.exec('BEGIN IMMEDIATE');try{
  const row=legacy?db.prepare('SELECT revision,json FROM state WHERE id=1').get():db.prepare('SELECT revision,json FROM space_state WHERE space_id=?').get(space);
  if(!row){db.exec('ROLLBACK');return send(res,400,{error:'还没有账本'});}
  const data=JSON.parse(row.json),old=data.redemptions.find(r=>r.id===body.requestId||r.confirmRequestId===body.requestId);
  if(old){db.exec('ROLLBACK');const actor=old.confirmRequestId===body.requestId?old.confirmedBy:old.memberId;if(actor!==s.slot||(body.kind==='wish'?old.wishId:old.rewardId)!==body.id)return send(res,409,{error:'兑换请求编号冲突'});if(old.status==='cancelled')return send(res,409,{error:'这次申请已取消，请重新发起'});return send(res,200,{revision:row.revision,data:visibleState(data,s.slot),pending:old.status==='pending'});}
  const item=(body.kind==='wish'?data.wishlist:data.rewards).find(x=>x.id===body.id);
  if(!item||(body.kind==='wish'&&['redeemed','done'].includes(item.status))){db.exec('ROLLBACK');return send(res,400,{error:'该内容不存在或已经兑换'});}
  const value=String(item.pointsLabel||'').trim(),cost=/^[1-9]\d{0,4}$/.test(value)?Number(value):0;
  if(!cost||cost>10000){db.exec('ROLLBACK');return send(res,400,{error:'请先设置有效的兑换积分'});}
  const balance=(slot,wallet)=>data.points_ledger.filter(p=>p.memberId===slot&&walletTag(p)===wallet).reduce((n,p)=>n+(Number.isFinite(p.points)?p.points:0),0)-data.redemptions.filter(r=>r.status!=='pending'&&walletTag(r)===wallet).reduce((n,r)=>n+(slot==='me'?(r.fromMe||0):(r.fromHim||0)),0);
  const now=new Date(),date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  /* 属于「我们俩」的愿望：一人一半，且要两个人都点头 */
  const existing=body.kind==='wish'?data.redemptions.find(r=>r.status==='pending'&&r.wishId===item.id):null;
  if(existing&&(item.scope!=='both'||String(existing.label)!==String(cost)||existing.name!=='兑换「'+item.name+'」')){db.exec('ROLLBACK');return send(res,409,{error:'愿望内容已更改，请先取消旧申请再重新发起'});}
  const shared=body.kind==='wish'&&item.scope==='both';
  /* 单人的愿望只有本人能兑，因为分在他自己的钱包里 */
  if(body.kind==='wish'&&item.scope!=='both'&&item.scope!==s.slot){db.exec('ROLLBACK');return send(res,400,{error:'这是对方自己的愿望，要他自己来兑'});}
  let waiting=false;
  if(shared){
   if(cost%2!==0){db.exec('ROLLBACK');return send(res,400,{error:'两个人的兑换，分值要能被 2 整除'});}
   const half=cost/2,open=existing;
   if(open&&open.memberId===s.slot){db.exec('ROLLBACK');return send(res,409,{error:'已经发出去了，等对方确认'});}
   if(open){
    if(balance('me','ours')<half||balance('him','ours')<half){db.exec('ROLLBACK');return send(res,400,{error:'说好一人一半，现在两个人的共同分还不够'});}
    open.fromMe=half;open.fromHim=half;open.status='done';open.date=date;open.confirmedBy=s.slot;open.confirmRequestId=body.requestId;
    item.status='redeemed';
   }else{
    if(balance(s.slot,'ours')<half){db.exec('ROLLBACK');return send(res,400,{error:'你的共同分还不够付这一半'});}
    data.redemptions.push({id:body.requestId,memberId:s.slot,date,name:'兑换「'+item.name+'」',wishId:item.id,fromMe:0,fromHim:0,label:String(cost),wallet:'ours',status:'pending'});
    waiting=true;
   }
  }else{
   if(balance(s.slot,'mine')<cost){db.exec('ROLLBACK');return send(res,400,{error:'积分不足，暂时不能兑换'});}
   data.redemptions.push({id:body.requestId,memberId:s.slot,date,name:'兑换「'+item.name+'」',wishId:body.kind==='wish'?item.id:undefined,rewardId:body.kind==='reward'?item.id:undefined,fromMe:s.slot==='me'?cost:0,fromHim:s.slot==='him'?cost:0,label:String(cost),wallet:'mine',status:'done'});
   if(body.kind==='wish')item.status='redeemed';
  }
  const at=now.toISOString(),revision=row.revision+1;
  if(legacy){db.prepare('INSERT INTO snapshots(revision,json,created_at) VALUES(?,?,?)').run(row.revision,row.json,at);db.prepare('UPDATE state SET revision=?,json=?,updated_at=? WHERE id=1').run(revision,JSON.stringify(data),at);db.prepare('DELETE FROM snapshots WHERE id NOT IN (SELECT id FROM snapshots ORDER BY id DESC LIMIT 100)').run();}
  else{db.prepare('INSERT INTO space_snapshots(space_id,revision,json,created_at) VALUES(?,?,?,?)').run(space,row.revision,row.json,at);db.prepare('UPDATE space_state SET revision=?,json=?,updated_at=? WHERE space_id=?').run(revision,JSON.stringify(data),at,space);db.prepare('DELETE FROM space_snapshots WHERE space_id=? AND id NOT IN (SELECT id FROM space_snapshots WHERE space_id=? ORDER BY id DESC LIMIT 100)').run(space,space);}
  db.exec('COMMIT');return send(res,200,{revision,data:visibleState(data,s.slot),pending:waiting});
 }catch(e){db.exec('ROLLBACK');throw e;}
}
if(pathname==='/api/redeem/cancel'&&req.method==='POST'){
 const body=await getBody(req);if(typeof body.id!=='string'||!/^[a-z0-9_-]{1,100}$/i.test(body.id))return send(res,400,{error:'申请编号无效'});
 db.exec('BEGIN IMMEDIATE');try{
  const row=legacy?db.prepare('SELECT revision,json FROM state WHERE id=1').get():db.prepare('SELECT revision,json FROM space_state WHERE space_id=?').get(space);if(!row){db.exec('ROLLBACK');return send(res,404,{error:'没有找到申请'});}
  const data=JSON.parse(row.json),request=data.redemptions.find(r=>r.id===body.id);
  if(!request){db.exec('ROLLBACK');return send(res,404,{error:'没有找到申请'});}
  if(request.status==='cancelled'){db.exec('ROLLBACK');return send(res,200,{revision:row.revision,data:visibleState(data,s.slot)});}
  if(request.status!=='pending'){db.exec('ROLLBACK');return send(res,409,{error:'申请已完成，不能取消'});}
  request.status='cancelled';request.cancelledBy=s.slot;const at=new Date().toISOString(),revision=row.revision+1;
  if(legacy){db.prepare('INSERT INTO snapshots(revision,json,created_at) VALUES(?,?,?)').run(row.revision,row.json,at);db.prepare('UPDATE state SET revision=?,json=?,updated_at=? WHERE id=1').run(revision,JSON.stringify(data),at);db.prepare('DELETE FROM snapshots WHERE id NOT IN (SELECT id FROM snapshots ORDER BY id DESC LIMIT 100)').run();}
  else{db.prepare('INSERT INTO space_snapshots(space_id,revision,json,created_at) VALUES(?,?,?,?)').run(space,row.revision,row.json,at);db.prepare('UPDATE space_state SET revision=?,json=?,updated_at=? WHERE space_id=?').run(revision,JSON.stringify(data),at,space);db.prepare('DELETE FROM space_snapshots WHERE space_id=? AND id NOT IN (SELECT id FROM space_snapshots WHERE space_id=? ORDER BY id DESC LIMIT 100)').run(space,space);}
  db.exec('COMMIT');return send(res,200,{revision,data:visibleState(data,s.slot)});
 }catch(e){db.exec('ROLLBACK');throw e;}
}
if(pathname==='/api/history'&&req.method==='GET'){const list=legacy?db.prepare('SELECT id,revision,created_at FROM snapshots ORDER BY id DESC LIMIT 20').all():db.prepare('SELECT id,revision,created_at FROM space_snapshots WHERE space_id=? ORDER BY id DESC LIMIT 20').all(space);return send(res,200,{items:list});}
 if(/^\/api\/history\/\d+$/.test(pathname)&&req.method==='GET'){const id=Number(pathname.split('/').pop());const row=legacy?db.prepare('SELECT revision,json,created_at FROM snapshots WHERE id=?').get(id):db.prepare('SELECT revision,json,created_at FROM space_snapshots WHERE space_id=? AND id=?').get(space,id);return row?send(res,200,{revision:row.revision,createdAt:row.created_at,data:visibleHistory(JSON.parse(row.json),s.slot)}):send(res,404,{error:'没有找到此版本'});}
 if(pathname==='/api/state'&&req.method==='GET'){const row=legacy?db.prepare('SELECT revision,json FROM state WHERE id=1').get():db.prepare('SELECT revision,json FROM space_state WHERE space_id=?').get(space);return send(res,200,row?{revision:row.revision,data:visibleState(JSON.parse(row.json),s.slot)}:{revision:0,data:null});}
 if(pathname==='/api/state'&&req.method==='POST'){
  const body=await getBody(req);if(!Number.isSafeInteger(body.revision)||!validState(body.data))return send(res,400,{error:'数据格式无效'});
  db.exec('BEGIN IMMEDIATE');try{
   const row=legacy?db.prepare('SELECT revision,json FROM state WHERE id=1').get():db.prepare('SELECT revision,json FROM space_state WHERE space_id=?').get(space), current=row?row.revision:0;let data=body.data,merged=false;
   const fullCurrent=row?JSON.parse(row.json):null;
   let baseFull=fullCurrent;
   if(current!==body.revision){const base=legacy?db.prepare('SELECT json FROM snapshots WHERE revision=? ORDER BY id DESC LIMIT 1').get(body.revision):db.prepare('SELECT json FROM space_snapshots WHERE space_id=? AND revision=? ORDER BY id DESC LIMIT 1').get(space,body.revision);if(!base||!row){db.exec('ROLLBACK');return send(res,409,{error:'原版本已过期，请先处理冲突',revision:current});}baseFull=JSON.parse(base.json);}
   try{
    const base=baseFull?visibleState(baseFull,s.slot):{entries:[],goals:[],points_ledger:[],redemptions:[]};protectPersonal(base,data,s.slot);
    if(!equal(base.points_ledger,data.points_ledger)||!equal(base.redemptions,data.redemptions))throw Error('积分由服务端处理');
    if(current!==body.revision){data=mergeValue(base,data,visibleState(fullCurrent,s.slot));merged=true;}
    if(fullCurrent){for(const key of ['entries','goals']){const hidden=fullCurrent[key].filter(x=>x.memberId!==s.slot&&x.visibility==='private');const ids=new Set(data[key].map(x=>x.id));if(hidden.some(x=>ids.has(x.id)))throw Error('duplicate hidden item');data[key].push(...hidden);}
     const shown=new Set(visibleState(fullCurrent,s.slot).milestones.map(x=>x.id));const hidden=fullCurrent.milestones.filter(x=>!shown.has(x.id));const ids=new Set(data.milestones.map(x=>x.id));if(hidden.some(x=>ids.has(x.id)))throw Error('duplicate hidden milestone');data.milestones.push(...hidden);}
    reconcilePoints(fullCurrent,data);if(!validState(data))throw Error('invalid merge');
   }catch(e){db.exec('ROLLBACK');return send(res,409,{error:e.message==='已兑换积分，无法撤回该打卡'?e.message:'内容冲突或无权修改对方的记录，请先处理',revision:current});}
   const now=new Date().toISOString();if(row){if(legacy)db.prepare('INSERT INTO snapshots(revision,json,created_at) VALUES(?,?,?)').run(row.revision,row.json,now);else db.prepare('INSERT INTO space_snapshots(space_id,revision,json,created_at) VALUES(?,?,?,?)').run(space,row.revision,row.json,now);}
   const rev=current+1;if(legacy){db.prepare('INSERT INTO state(id,revision,json,updated_at) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,json=excluded.json,updated_at=excluded.updated_at').run(rev,JSON.stringify(data),now);db.prepare('DELETE FROM snapshots WHERE id NOT IN (SELECT id FROM snapshots ORDER BY id DESC LIMIT 100)').run();}
   else{db.prepare('INSERT INTO space_state(space_id,revision,json,updated_at) VALUES(?,?,?,?) ON CONFLICT(space_id) DO UPDATE SET revision=excluded.revision,json=excluded.json,updated_at=excluded.updated_at').run(space,rev,JSON.stringify(data),now);db.prepare('DELETE FROM space_snapshots WHERE space_id=? AND id NOT IN (SELECT id FROM space_snapshots WHERE space_id=? ORDER BY id DESC LIMIT 100)').run(space,space);}
   db.exec('COMMIT');return send(res,200,{revision:rev,data:visibleState(data,s.slot)});
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 return send(res,404,{error:'未找到'});
 }catch(e){console.error('Request error:',e.message);if(!res.headersSent)send(res,500,{error:'服务器处理失败'});}});
async function dailyBackup(){
 const folder=path.join(dataDir,'backups');fs.mkdirSync(folder,{recursive:true,mode:0o700});
 const date=new Date().toISOString().slice(0,10);const destination=path.join(folder,`ledger-${date}.sqlite`);
 if(fs.existsSync(destination))return;
 const tmp=destination+'.tmp';try{await backup(db,tmp);fs.chmodSync(tmp,0o600);fs.renameSync(tmp,destination);
 const files=fs.readdirSync(folder).filter(n=>/^ledger-\d{4}-\d{2}-\d{2}\.sqlite$/.test(n)).sort().reverse();
 for(const name of files.slice(14))fs.unlinkSync(path.join(folder,name));
 }catch(e){try{fs.unlinkSync(tmp)}catch{}console.error('自动备份失败：',e.message)}
}
server.listen(port,host,()=>{console.log(`账本服务已启动：${host}:${port}`);dailyBackup().catch(e=>console.error('自动备份失败：',e.message));});
setInterval(()=>dailyBackup().catch(e=>console.error('自动备份失败：',e.message)),24*60*60*1000).unref();




