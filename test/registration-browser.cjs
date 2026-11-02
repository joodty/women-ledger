'use strict';
const {spawn}=require('node:child_process');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const assert=require('node:assert/strict');const {chromium}=require('playwright');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'women-register-ui-'));const base='http://127.0.0.1:18767';const server=spawn(process.execPath,['server.cjs'],{cwd:path.join(__dirname,'..'),env:{...process.env,WOMEN_DATA_DIR:dir,PORT:'18767'},stdio:'pipe'});
(async()=>{let browser;try{
 for(let i=0;i<80;i++){try{await fetch(base);break}catch{await new Promise(r=>setTimeout(r,100))}}
 browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 const ca=await browser.newContext({viewport:{width:390,height:844}}),cb=await browser.newContext({viewport:{width:390,height:844}});const a=await ca.newPage(),b=await cb.newPage();
 async function register(page,url,name){await page.goto(url);if(!url.includes('?invite='))await page.locator('.register-toggle').click();await page.locator('input[name=username]').fill(name);await page.locator('input[name=password]').fill('valid-password-123');await page.locator('form button[type=submit]').click();await page.locator('[data-act=add]:visible').first().waitFor();}
 await register(a,base,'alice');await a.locator('#sync-message').filter({hasText:'已同步'}).waitFor();
 await a.locator('#tabbar [data-nav=points]').click();await a.getByRole('heading',{name:'兑换'}).waitFor();
 await a.locator('#tabbar [data-nav=review]').click();await a.locator('[data-go=story]').click();await a.getByText('我们的故事接龙').waitFor();
 await a.locator('#tabbar [data-nav=today]').click();const gear=await a.getByRole('button',{name:'设置'}).boundingBox();assert.ok(gear&&gear.x>300,'mobile settings entry should be at the right edge');await a.getByRole('button',{name:'设置'}).click();await a.getByRole('heading',{name:'设置'}).waitFor();
 if(process.env.PREVIEW_SCREENSHOT){await a.locator('#tabbar [data-nav=today]').click();await a.screenshot({path:process.env.PREVIEW_SCREENSHOT});}
 const token=await a.evaluate(async()=>{const r=await fetch('/api/invite',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});return (await r.json()).token});
 await register(b,base+'/?invite='+token,'bob');await b.locator('#sync-message').filter({hasText:'已同步'}).waitFor();
 await b.evaluate(()=>{Store.member('me').name='小雨';Store.save()});await b.locator('#sync-message').filter({hasText:'已同步'}).waitFor();
 await a.reload();await a.locator('[data-act=add]:visible').first().waitFor();assert.equal(await a.evaluate(()=>Store.member('him').name),'小雨');assert.equal(await a.evaluate(()=>Store.member('me').name),'alice');
 assert.equal(await b.evaluate(()=>Store.member('me').name),'小雨');assert.equal(await b.evaluate(()=>Store.member('him').name),'alice');
 a.on('dialog',d=>d.accept());await a.locator('summary').click();await a.locator('#sync-password').click();await a.locator('input[name=current]').fill('valid-password-123');await a.locator('input[name=next]').fill('a-new-strong-password');await a.locator('input[name=confirm]').fill('a-new-strong-password');await a.getByRole('button',{name:'保存密码'}).click();await a.locator('input[name=username]').waitFor();await a.locator('input[name=username]').fill('alice');await a.locator('input[name=password]').fill('a-new-strong-password');await a.locator('form button[type=submit]').click();await a.locator('[data-act=add]:visible').first().waitFor();
 console.log('PASS: mobile registration, invitation and member identity');
 }finally{if(browser)await browser.close();server.kill();setTimeout(()=>fs.rmSync(dir,{recursive:true,force:true}),500)}})().catch(e=>{console.error(e);process.exitCode=1});
