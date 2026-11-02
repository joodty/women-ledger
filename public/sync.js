(function () {
  'use strict';
  const banner = document.createElement('div');
  banner.style.cssText='position:sticky;top:0;z-index:1000;background:#faf8f5;padding:7px 16px;border-bottom:1px solid #eee5df;font:12px sans-serif;display:flex;gap:10px;align-items:center;color:#847a75';
  banner.innerHTML='<span id="sync-message" style="flex:1">正在连接…</span><button id="sync-refresh" type="button" style="color:#ae727d">刷新</button><details style="position:relative"><summary style="cursor:pointer;color:#ae727d;list-style:none">更多</summary><div id="sync-menu" style="position:absolute;right:0;top:26px;min-width:120px;background:white;border:1px solid #eee5df;border-radius:12px;padding:8px;box-shadow:0 8px 22px #48352c20;display:grid;gap:8px"><button id="sync-import" type="button">导入备份</button><button id="sync-history" type="button">历史版本</button><button id="sync-password" type="button">修改密码</button><button id="sync-logout" type="button">退出登录</button></div></details><input id="sync-file" type="file" accept="application/json,.json" hidden>';
  document.body.prepend(banner);
  const message=banner.querySelector('#sync-message');
  let user=null, account=null, revision=0, pending=null, sending=false, conflict=false, online=false;
  let sync;
  let reminderPort=null;
  const reminderAcks=new Map();
  function clearReminders(){if(!reminderPort||!account)return Promise.resolve();const requestId=crypto.randomUUID();return new Promise(resolve=>{const timer=setTimeout(()=>{reminderAcks.delete(requestId);resolve()},2000);reminderAcks.set(requestId,()=>{clearTimeout(timer);resolve()});reminderPort.postMessage(JSON.stringify({type:'clear',account,requestId}))})}
  function syncReminders(){
    if(!reminderPort||!account||!window.Store||pending||sending||conflict)return;
    const reminders=window.Store.db.goals.filter(g=>g.memberId==='me'&&g.status==='active'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(g.reminderTime||''))
      .map(g=>({id:g.id,name:g.name,time:g.reminderTime}));
    reminderPort.postMessage(JSON.stringify({type:'sync',account,reminders}));
  }
  window.WomenReminders={requestPermission(){if(reminderPort)reminderPort.postMessage(JSON.stringify({type:'request-permission'}))}};
  window.addEventListener('message',event=>{if(event.data!=='women-reminders-v1'||!event.ports||!event.ports[0]||(event.origin&&event.origin!==location.origin))return;reminderPort=event.ports[0];reminderPort.onmessage=e=>{try{const ack=JSON.parse(e.data),done=reminderAcks.get(ack.requestId);if(done){reminderAcks.delete(ack.requestId);done()}}catch{}};syncReminders()});
  const tabId=sessionStorage.getItem('women.tab')||crypto.randomUUID();sessionStorage.setItem('women.tab',tabId);let recoveryKey='women.pending.v1.'+tabId;
  const setMessage=x=>{message.textContent=x};
  async function api(url, options={}) {const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});let data={};try{data=await r.json()}catch{}if(!r.ok){const e=new Error(data.error||'请求失败');e.status=r.status;throw e}return data}
  function swapId(v){return v==='me'?'him':v==='him'?'me':v}
  function perspective(source) {
    const d=structuredClone(source); if(user!=='him')return d;
    for(const m of d.members||[])m.id=swapId(m.id);
    for(const key of ['entries','goals','points_ledger','story_entries','redemptions']) for(const item of d[key]||[]) if(item.memberId)item.memberId=swapId(item.memberId);
    for(const item of d.wishlist||[])if(item.scope)item.scope=swapId(item.scope);
for(const key of ['rewards','wishlist'])for(const item of d[key]||[])if(item.executor){item.executor=swapId(item.executor);item.executorLabel=item.executor==='both'?'我们一起':item.executor==='me'?(key==='wishlist'?'我来安排':'我执行'):(key==='wishlist'?'他来安排':'他执行');}
    for(const item of d.redemptions||[]){const a=item.fromMe;item.fromMe=item.fromHim;item.fromHim=a;}
    return d;
  }
  function saveRecovery(data){try{localStorage.setItem(recoveryKey,JSON.stringify({user,revision,data,at:Date.now()}));return true}catch{return false}}
  function download(name,data){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)}
  function block(title, detail, data){
    conflict=true;const pane=document.createElement('div');pane.style.cssText='position:fixed;inset:0;z-index:10001;background:#fff8f5;display:grid;place-items:center;padding:24px;font:16px/1.7 sans-serif';
    const box=document.createElement('div');box.style.cssText='max-width:480px';
    const h=document.createElement('h2');h.textContent=title;const p=document.createElement('p');p.textContent=detail;
    let exported=false;const exp=document.createElement('button');exp.textContent='下载当前未同步数据';exp.style.cssText='padding:10px;margin-right:12px';exp.onclick=()=>{download('我们-未同步数据.json',data);exported=true};
    const refresh=document.createElement('button');refresh.textContent='确认已备份，重新加载';refresh.style.padding='10px';refresh.onclick=()=>{if(!exported){alert('请先下载未同步数据。');return}try{localStorage.removeItem(recoveryKey)}catch{}location.reload()};
    box.append(h,p,exp,refresh);pane.append(box);document.body.append(pane);
  }
  async function flush(){
    if(sending||!pending||conflict)return; sending=true;
    while(pending&&!conflict){const copy=pending;pending=null;setMessage('正在同步…');
      try {const sentRevision=revision;const r=await api('/api/state',{method:'POST',body:JSON.stringify({revision:sentRevision,data:perspective(copy)})});
        // If another edit was queued while a merge was in flight, it must still
        // be compared against its original base before accepting remote changes.
        revision=r.data&&pending?sentRevision:r.revision;online=true;
        if(!pending){if(r.data&&window.Store){const merged=perspective(r.data);for(const key of Object.keys(window.Store.db))delete window.Store.db[key];Object.assign(window.Store.db,merged);if(window.App)window.App.render();}
          try{localStorage.removeItem(recoveryKey)}catch{}setMessage('已同步');}}
      catch(e){pending=pending||copy;online=false;const saved=saveRecovery(pending);if(e.status===409){setMessage('需要处理');block('当前修改无法同步',`${e.message}。请先下载这份未同步的数据，再重新加载查看服务器版本。${saved?'本机也保留了临时副本。':'本机临时副本保存失败，请务必下载。'}`,pending)}else if(e.status===401){setMessage('登录已过期');block('登录已过期','请先下载未同步的数据，再重新登录并核对记录。',pending)}else{setMessage('同步失败：'+e.message+'，请点击重试');banner.querySelector('#sync-refresh').textContent='重试同步';}break;}
    } sending=false;if(!pending&&!conflict)syncReminders();
  }
  function loginScreen(){
    return new Promise(resolve=>{const pane=document.createElement('div');pane.style.cssText='position:fixed;inset:0;z-index:10000;background:#faf8f5;display:grid;place-items:center;padding:24px;font:16px/1.6 sans-serif';
      pane.innerHTML='<form style="width:min(100%,360px);background:white;border-radius:20px;padding:25px;box-shadow:0 4px 24px #e5d9d4"><h1>我们</h1><p>两个人的时间账本</p><label>账号<input name="username" required autocomplete="username" style="display:block;width:100%;padding:10px;margin:6px 0 12px"></label><label>密码<input name="password" type="password" required autocomplete="current-password" style="display:block;width:100%;padding:10px;margin:6px 0 18px"></label><button type="submit" style="padding:10px 22px;background:#e8899c;color:white;border-radius:10px">登录</button><button type="button" class="register-toggle" style="margin-left:10px;padding:10px">注册新账号</button><p class="hint"></p><p class="error" style="color:#b43d4b"></p></form>';
      document.body.append(pane);const form=pane.querySelector('form');let registering=false;const hint=form.querySelector('.hint'),toggle=form.querySelector('.register-toggle');
      function update(){form.querySelector('button[type=submit]').textContent=registering?'注册并登录':'登录';toggle.textContent=registering?'返回登录':'注册新账号';hint.textContent=registering?'账号使用字母、数字或下划线，密码至少 12 位。':'';}
      toggle.onclick=()=>{registering=!registering;update()};
      form.onsubmit=async e=>{e.preventDefault();try{const name=form.username.value.trim();if(registering){const invitation=new URL(location.href).searchParams.get('invite')||'';await api('/api/register',{method:'POST',body:JSON.stringify({username:name,password:form.password.value,invitation})});if(invitation)history.replaceState(null,'',location.pathname);}const x=await api('/api/login',{method:'POST',body:JSON.stringify({user:name,password:form.password.value})});user=x.user;account=x.account||x.user;pane.remove();resolve()}catch(err){form.querySelector('.error').textContent=err.message}};
      if(new URL(location.href).searchParams.has('invite')){registering=true;update()}
    });
  }
  async function start(){
    try{const s=await api('/api/session');user=s.user;account=s.account||s.user}catch{await loginScreen()}
    const previousRecoveryKey=recoveryKey+'.'+user;recoveryKey+='.'+account;
    try{const info=await api('/api/session');if(info.legacySpace&&account!==user&&!localStorage.getItem(recoveryKey)){const draft=localStorage.getItem(previousRecoveryKey);if(draft){localStorage.setItem(recoveryKey,draft);localStorage.removeItem(previousRecoveryKey)}}if(info.canInvite){const invite=document.createElement('button');invite.type='button';invite.textContent='邀请另一位';invite.onclick=async()=>{try{const x=await api('/api/invite',{method:'POST',body:'{}'});const url=location.origin+'/?invite='+encodeURIComponent(x.token);prompt('复制邀请链接发给对方（24 小时有效）：',url)}catch(e){alert('创建邀请失败：'+e.message)}};banner.querySelector('#sync-menu').append(invite)}}catch{}
    try {const state=await api('/api/state');revision=state.revision;online=true;sync=window.WomenSync={account,initialData:state.data?perspective(state.data):null,save(data){const copy=structuredClone(data);pending=copy;if(!saveRecovery(copy))setMessage('本机临时保存失败，正在尝试同步');flush()},
      async redeem(kind,id){if(pending||sending||conflict)throw Error('请先等待数据同步');const before=revision,key='women.redeem.'+account+'.'+kind+'.'+id,requestId=localStorage.getItem(key)||crypto.randomUUID();localStorage.setItem(key,requestId);sending=true;try{const result=await api('/api/redeem',{method:'POST',body:JSON.stringify({kind,id,requestId})});localStorage.removeItem(key);if(pending){revision=before;}else{revision=result.revision;const data=perspective(result.data);for(const k of Object.keys(window.Store.db))delete window.Store.db[k];Object.assign(window.Store.db,data);if(window.App)window.App.render();setMessage('已同步');}return result;}catch(e){if(e.status>=400&&e.status<500)localStorage.removeItem(key);throw e}finally{sending=false;if(pending)flush()}},
      async cancelRedemption(id){if(pending||sending||conflict)throw Error('请先等待数据同步');const before=revision;sending=true;try{const result=await api('/api/redeem/cancel',{method:'POST',body:JSON.stringify({id})});if(pending){revision=before;}else{revision=result.revision;const data=perspective(result.data);for(const k of Object.keys(window.Store.db))delete window.Store.db[k];Object.assign(window.Store.db,data);if(window.App)window.App.render();setMessage('已同步');}return result;}finally{sending=false;if(pending)flush()}}
    };
      setMessage('已连接');
      const old=localStorage.getItem(recoveryKey);if(old){let data;try{data=JSON.parse(old)}catch{}if(data&&data.user===user&&data.data){
        const serverData=state.data?perspective(state.data):null;
        if(JSON.stringify(data.data)===JSON.stringify(serverData)){localStorage.removeItem(recoveryKey);}
        else if(data.revision===revision){
          try{setMessage('正在恢复未同步的记录…');const result=await api('/api/state',{method:'POST',body:JSON.stringify({revision,data:perspective(data.data)})});revision=result.revision;sync.initialData=data.data;localStorage.removeItem(recoveryKey);setMessage('已恢复并同步');}
          catch(e){block('发现上次未同步的记录','自动恢复未能完成。请先下载保留这份记录，再重新加载查看服务器数据。不要直接导入，避免覆盖其他记录。',data.data);return;}
        }else{block('发现上次未同步的记录','服务器内容也有更新，暂时无法安全自动合并。请先下载保留这份记录，再重新加载查看服务器数据。不要直接导入，避免覆盖其他记录。',data.data);return;}
      }}
      const script=document.createElement('script');script.src='/original.js';script.onload=syncReminders;document.body.append(script);
    }catch(e){setMessage('无法连接服务器，请刷新重试');alert('无法加载账本：'+e.message)}
  }
  banner.querySelector('#sync-refresh').onclick=()=>{if(pending&&!conflict){flush();return}if(sending){setMessage('正在同步，请稍等');return}if(confirm('刷新会重新读取服务器数据，请确认当前没有正在填写的内容。'))location.reload()};
  window.addEventListener('online',()=>{if(pending&&!conflict)flush()});
  async function refreshWhenIdle(){
    if(!user||pending||sending||conflict||document.hidden||!window.Store||!window.App||window.App.state.sheet||window.App.state.storyDraft)return;
    if(document.activeElement&&/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName))return;
    try{const before=revision,state=await api('/api/state');if(pending||sending||conflict||revision!==before||window.App.state.sheet||window.App.state.storyDraft||(document.activeElement&&/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)))return;
      if(state.data&&state.revision!==revision){const d=perspective(state.data);for(const key of Object.keys(window.Store.db))delete window.Store.db[key];Object.assign(window.Store.db,d);revision=state.revision;window.App.render();setMessage('已同步');syncReminders();}
    }catch{}
  }
  setInterval(refreshWhenIdle,15000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshWhenIdle()});
  banner.querySelector('#sync-logout').onclick=async()=>{if(pending||sending){alert('还有记录未同步，请先重试或下载备份。');return}await api('/api/logout',{method:'POST',body:'{}'});await clearReminders();location.reload()};
  banner.querySelector('#sync-password').onclick=()=>{
    if(pending||sending||conflict){alert('请先处理尚未同步的记录。');return}
    const pane=document.createElement('div');pane.style.cssText='position:fixed;inset:0;z-index:10002;background:#0006;display:grid;place-items:center;padding:24px;font:16px/1.6 sans-serif';
    pane.innerHTML='<form style="width:min(100%,360px);background:white;border-radius:20px;padding:24px"><h2>修改密码</h2><p>修改后需要重新登录。新密码至少 12 位。</p><label>当前密码<input name="current" type="password" autocomplete="current-password" required style="display:block;width:100%;padding:10px;margin:6px 0 12px"></label><label>新密码<input name="next" type="password" autocomplete="new-password" minlength="12" maxlength="256" required style="display:block;width:100%;padding:10px;margin:6px 0 12px"></label><label>再次输入新密码<input name="confirm" type="password" autocomplete="new-password" minlength="12" maxlength="256" required style="display:block;width:100%;padding:10px;margin:6px 0 18px"></label><button type="submit" style="padding:10px 22px;background:#e8899c;color:white;border-radius:10px">保存密码</button><button type="button" class="cancel" style="padding:10px">取消</button><p class="error" style="color:#b43d4b"></p></form>';
    document.body.append(pane);const form=pane.querySelector('form');form.querySelector('.cancel').onclick=()=>pane.remove();
    form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button[type=submit]');if(form.next.value!==form.confirm.value){form.querySelector('.error').textContent='两次输入的新密码不一致';return}button.disabled=true;try{await api('/api/password',{method:'POST',body:JSON.stringify({currentPassword:form.current.value,newPassword:form.next.value})});await clearReminders();pane.remove();alert('密码已更新，请重新登录。');location.reload()}catch(err){form.querySelector('.error').textContent=err.message;button.disabled=false}};
  };
  banner.querySelector('#sync-history').onclick=async()=>{if(pending||sending){alert('请先等待当前数据同步');return}try{const h=await api('/api/history');if(!h.items.length){alert('还没有历史版本');return}const labels=h.items.map((x,i)=>(i+1)+'. '+new Date(x.created_at).toLocaleString()+'（版本 '+x.revision+'）').join('\n');const choice=prompt('选择要恢复的历史版本编号：\n'+labels);if(choice===null)return;const n=Number(choice);if(!Number.isInteger(n)||n<1||n>h.items.length)throw Error('编号无效');const item=h.items[n-1];if(!confirm('恢复会整体替换当前共享账本。当前版本也会保留在历史中，继续吗？'))return;const old=await api('/api/history/'+item.id);const current=perspective(window.Store.db);for(const k of ['entries','goals'])old.data[k]=old.data[k].filter(x=>x.memberId===user).concat(current[k].filter(x=>x.memberId!==user));for(const k of ['points_ledger','redemptions'])old.data[k]=current[k];await api('/api/state',{method:'POST',body:JSON.stringify({revision,data:old.data})});alert('历史版本已恢复。');location.reload()}catch(e){alert('恢复失败：'+e.message)}};
  banner.querySelector('#sync-import').onclick=()=>banner.querySelector('#sync-file').click();
  banner.querySelector('#sync-file').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;try{const d=JSON.parse(await f.text());if(d.version!==4||!Array.isArray(d.members)||!Array.isArray(d.entries)||!d.couple)throw Error('备份格式不正确');if(pending||sending)throw Error('请先等待当前数据同步');if(!confirm('导入会用备份替换当前共享账本。请确认你们已经另外导出当前账本，继续吗？'))return;const r=await api('/api/state',{method:'POST',body:JSON.stringify({revision,data:(function(){const x=perspective(d);const c=perspective(window.Store.db);for(const k of ['points_ledger','redemptions'])x[k]=c[k];return x;})()})});revision=r.revision;alert('已导入，页面将重新加载。');location.reload()}catch(err){alert('导入失败：'+err.message)}};
  start();
})();





