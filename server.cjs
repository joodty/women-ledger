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
if(!count()) { console.error('请先运行 node server.cjs setup 创建两个账户。');process.exit(1); }
const attempts=new Map();
const secure=process.env.WOMEN_SECURE_COOKIE==='1';
const port=Number(process.env.PORT||18763), host=process.env.HOST||'127.0.0.1';
const publicDir=path.join(__dirname,'public');
const files={'/':'index.html','/index.html':'index.html','/style.css':'style.css','/sync.js':'sync.js','/original.js':'original.js'};
function send(res,status,obj,headers={}) {const body=JSON.stringify(obj);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(body);}
function cookie(req) { const match=(req.headers.cookie||'').match(/(?:^|;\s*)women_session=([a-f0-9]{64})(?:;|$)/);return match&&match[1]; }
function session(req) {const t=cookie(req);if(!t)return null;return db.prepare('SELECT user_id,expires FROM sessions WHERE token_hash=? AND expires>?').get(sha(t),Date.now());}
function sameOrigin(req) { const origin=req.headers.origin; if(!origin)return false;try{return new URL(origin).host === req.headers.host && ['http:','https:'].includes(new URL(origin).protocol);}catch{return false;} }
function getBody(req) {return new Promise((resolve,reject)=>{let size=0,chunks=[];req.on('data',chunk=>{size+=chunk.length;if(size>2*1024*1024){reject(Error('内容超过 2MB'));req.destroy();}else chunks.push(chunk)});req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))}catch{reject(Error('无效 JSON'))}});req.on('error',reject)});}
function validState(s) {const arrays=['members','categories','entries','goals','weekly_settlements','points_ledger','rewards','wishlist','story_entries','milestones','redemptions','sparks'];return !!(s && s.version===4 && s.couple && typeof s.couple==='object' && arrays.every(k=>Array.isArray(s[k]) && s[k].length<=100000) && s.members.length===2 && s.members.every(m=>m && typeof m.name==='string' && m.name.length<=200) && s.categories.some(c=>c && c.id==='none') && ['entries','goals','points_ledger','story_entries','redemptions'].every(k=>s[k].every(x=>x && ['me','him'].includes(x.memberId))) && s.entries.every(x=>typeof x.content==='string' && typeof x.date==='string' && /^\d{4}-\d{2}-\d{2}$/.test(x.date) && typeof x.start==='string' && typeof x.end==='string') && s.goals.every(x=>Array.isArray(x.keywords)) && typeof s.couple.since==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s.couple.since) && s.members.some(m=>m.id==='me')&&s.members.some(m=>m.id==='him') && s.members.every(m=>m && (!m.avatar || (typeof m.avatar==='string' && /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(m.avatar)))) && s.categories.every(c=>c && typeof c.color==='string' && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c.color)) && arrays.filter(k=>k!=='sparks').every(k=>s[k].every(item=>item && typeof item==='object' && (!('id' in item) || (typeof item.id==='string' && /^[a-z0-9_-]{1,100}$/i.test(item.id))))));}
const server=http.createServer(async(req,res)=>{try{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
 const url=new URL(req.url,'http://localhost');const pathname=url.pathname;
 if(req.method==='GET' && files[pathname]) {const name=files[pathname];const type=name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':'text/html';res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store'});return fs.createReadStream(path.join(publicDir,name)).pipe(res);}
 if(req.method==='POST'&&!sameOrigin(req)) return send(res,403,{error:'请求来源不匹配'});
 if(pathname==='/api/login'&&req.method==='POST') {const key=req.socket.remoteAddress;const a=attempts.get(key)||{n:0,t:0};if(a.t>Date.now())return send(res,429,{error:'尝试次数过多，请稍后再试'});const body=await getBody(req);const row=users.includes(body.user)?db.prepare('SELECT * FROM users WHERE id=?').get(body.user):null;const salt=row?row.salt:Buffer.alloc(16);const actual=hashPassword(typeof body.password==='string'?body.password.slice(0,256):'',salt);const good=row&&crypto.timingSafeEqual(actual,Buffer.from(row.hash));if(!good){a.n++;if(a.n>=5){a.n=0;a.t=Date.now()+60000;}attempts.set(key,a);return send(res,401,{error:'账号或密码不正确'});}attempts.delete(key);const token=crypto.randomBytes(32).toString('hex');const expires=Date.now()+7*86400000;db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(sha(token),row.id,expires);return send(res,200,{user:row.id},{'Set-Cookie':`women_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secure?'; Secure':''}`});}
 const s=session(req);if(!s)return send(res,401,{error:'请先登录'});
 if(pathname==='/api/session'&&req.method==='GET')return send(res,200,{user:s.user_id});
 if(pathname==='/api/logout'&&req.method==='POST'){db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(cookie(req)));return send(res,200,{ok:true},{'Set-Cookie':'women_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'});}
 if(pathname==='/api/history'&&req.method==='GET'){const list=db.prepare('SELECT id,revision,created_at FROM snapshots ORDER BY id DESC LIMIT 20').all();return send(res,200,{items:list});}
 if(/^\/api\/history\/\d+$/.test(pathname)&&req.method==='GET'){const id=Number(pathname.split('/').pop());const row=db.prepare('SELECT revision,json,created_at FROM snapshots WHERE id=?').get(id);return row?send(res,200,{revision:row.revision,createdAt:row.created_at,data:JSON.parse(row.json)}):send(res,404,{error:'没有找到此版本'});}
 if(pathname==='/api/state'&&req.method==='GET'){const row=db.prepare('SELECT revision,json FROM state WHERE id=1').get();return send(res,200,row?{revision:row.revision,data:JSON.parse(row.json)}:{revision:0,data:null});}
 if(pathname==='/api/state'&&req.method==='POST'){const body=await getBody(req);if(!Number.isSafeInteger(body.revision)||!validState(body.data))return send(res,400,{error:'数据格式无效'});const json=JSON.stringify(body.data);db.exec('BEGIN IMMEDIATE');try{const row=db.prepare('SELECT revision,json FROM state WHERE id=1').get();const current=row?row.revision:0;if(current!==body.revision){db.exec('ROLLBACK');return send(res,409,{error:'另一台设备已更新，请先处理冲突',revision:current});}if(row)db.prepare('INSERT INTO snapshots(revision,json,created_at) VALUES(?,?,?)').run(row.revision,row.json,new Date().toISOString());const rev=current+1;db.prepare('INSERT INTO state(id,revision,json,updated_at) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,json=excluded.json,updated_at=excluded.updated_at').run(rev,json,new Date().toISOString());db.prepare('DELETE FROM snapshots WHERE id NOT IN (SELECT id FROM snapshots ORDER BY id DESC LIMIT 100)').run();db.exec('COMMIT');return send(res,200,{revision:rev});}catch(e){db.exec('ROLLBACK');throw e;}}
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




