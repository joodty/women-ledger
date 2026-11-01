'use strict';
// Credentials are accepted only on stdin; this keeps them out of process arguments.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const input=JSON.parse(fs.readFileSync(0,'utf8'));
const items=[['me',input.me],['him',input.him]];
for(const [,entry] of items){if(!entry||typeof entry.username!=='string'||!/^[a-z0-9_]{3,32}$/.test(entry.username)||['me','him'].includes(entry.username)||typeof entry.password!=='string'||entry.password.length<6||entry.password.length>256)throw Error('Invalid account information');}
if(input.me.username===input.him.username)throw Error('Accounts must be distinct');
const dir=path.resolve(process.env.WOMEN_DATA_DIR||path.join(process.env.HOME,'women-ledger','data'));
const db=new DatabaseSync(path.join(dir,'ledger.sqlite'));db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; BEGIN IMMEDIATE');
try{
 const state=db.prepare('SELECT revision,json,updated_at FROM state WHERE id=1').get();if(!state)throw Error('Legacy ledger is missing');
 for(const [slot,entry] of items){const member=db.prepare('SELECT user_id FROM space_members WHERE space_id=? AND slot=?').get('legacy',slot);if(!member||member.user_id!==slot)throw Error('Legacy membership changed');if(db.prepare('SELECT 1 FROM users WHERE id=?').get(entry.username))throw Error('Username is already in use');}
 for(const [slot,entry] of items){const salt=crypto.randomBytes(16),hash=crypto.scryptSync(entry.password,salt,64);db.prepare('INSERT INTO users(id,salt,hash) VALUES(?,?,?)').run(entry.username,salt,hash);const result=db.prepare('UPDATE space_members SET user_id=? WHERE user_id=? AND space_id=? AND slot=?').run(entry.username,slot,'legacy',slot);if(result.changes!==1)throw Error('Account mapping failed');db.prepare('DELETE FROM sessions WHERE user_id=?').run(slot);}
 const after=db.prepare('SELECT revision,json,updated_at FROM state WHERE id=1').get();if(JSON.stringify(state)!==JSON.stringify(after))throw Error('Ledger content unexpectedly changed');
 db.exec('COMMIT');console.log('Account migration completed; ledger unchanged.');
}catch(e){db.exec('ROLLBACK');console.error(e.message);process.exitCode=1}finally{db.close()}
