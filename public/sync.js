(function () {
  'use strict';
  const banner = document.createElement('div');
  banner.style.cssText='position:sticky;top:0;z-index:1000;background:#fff8f5;padding:8px 12px;border-bottom:1px solid #eadbd7;font:13px sans-serif;display:flex;gap:8px;align-items:center;flex-wrap:wrap';
  banner.innerHTML='<span id="sync-message">正在连接…</span><button id="sync-refresh" type="button">刷新数据</button><button id="sync-import" type="button">导入备份</button><button id="sync-history" type="button">历史版本</button><button id="sync-logout" type="button">退出</button><input id="sync-file" type="file" accept="application/json,.json" hidden>';
  document.body.prepend(banner);
  const message=banner.querySelector('#sync-message');
  let user=null, revision=0, pending=null, sending=false, conflict=false, online=false;
  let sync;
  const tabId=sessionStorage.getItem('women.tab')||crypto.randomUUID();sessionStorage.setItem('women.tab',tabId);let recoveryKey='women.pending.v1.'+tabId;
  const setMessage=x=>{message.textContent=x};
  async function api(url, options={}) {const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});let data={};try{data=await r.json()}catch{}if(!r.ok){const e=new Error(data.error||'请求失败');e.status=r.status;throw e}return data}
  function swapId(v){return v==='me'?'him':v==='him'?'me':v}
  function perspective(source) {
    const d=structuredClone(source); if(user!=='him')return d;
    for(const m of d.members||[])m.id=swapId(m.id);
    for(const key of ['entries','goals','points_ledger','story_entries','redemptions']) for(const item of d[key]||[]) if(item.memberId)item.memberId=swapId(item.memberId);
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
      try {const r=await api('/api/state',{method:'POST',body:JSON.stringify({revision,data:perspective(copy)})});revision=r.revision;online=true;if(!pending){try{localStorage.removeItem(recoveryKey)}catch{}setMessage('已同步');}}
      catch(e){pending=pending||copy;online=false;const saved=saveRecovery(pending);if(e.status===409){setMessage('同步冲突');block('两台设备同时修改了记录',`服务器已经有更新。请先下载这份未同步的数据；重新加载后可查看服务器版本。${saved?'本机也保留了临时副本。':'本机临时副本保存失败，请务必下载。'}`,pending)}else if(e.status===401){setMessage('登录已过期');block('登录已过期','请先下载未同步的数据，再重新登录并核对记录。',pending)}else{setMessage('同步失败：'+e.message+'，请点击重试');banner.querySelector('#sync-refresh').textContent='重试同步';}break;}
    } sending=false;
  }
  function loginScreen(){
    return new Promise(resolve=>{const pane=document.createElement('div');pane.style.cssText='position:fixed;inset:0;z-index:10000;background:#faf8f5;display:grid;place-items:center;padding:24px;font:16px/1.6 sans-serif';
      pane.innerHTML='<form style="width:min(100%,360px);background:white;border-radius:20px;padding:25px;box-shadow:0 4px 24px #e5d9d4"><h1>我们</h1><p>登录两个人的时间账本</p><label>成员<select name="user" style="display:block;width:100%;padding:10px;margin:6px 0 18px"><option value="me">第一位成员</option><option value="him">第二位成员</option></select></label><label>密码<input name="password" type="password" required autocomplete="current-password" style="display:block;width:100%;padding:10px;margin:6px 0 18px"></label><button style="padding:10px 22px;background:#e8899c;color:white;border-radius:10px">登录</button><p class="error" style="color:#b43d4b"></p></form>';
      document.body.append(pane);const form=pane.querySelector('form');form.onsubmit=async e=>{e.preventDefault();try{const x=await api('/api/login',{method:'POST',body:JSON.stringify({user:form.user.value,password:form.password.value})});user=x.user;pane.remove();resolve()}catch(err){form.querySelector('.error').textContent=err.message}};
    });
  }
  async function start(){
    try{const s=await api('/api/session');user=s.user}catch{await loginScreen()}
    recoveryKey+='.'+user;
    try {const state=await api('/api/state');revision=state.revision;online=true;sync=window.WomenSync={initialData:state.data?perspective(state.data):null,save(data){const copy=structuredClone(data);pending=copy;if(!saveRecovery(copy))setMessage('本机临时保存失败，正在尝试同步');flush()}};
      setMessage('已连接 · 记录对两位成员可见');
      const old=localStorage.getItem(recoveryKey);if(old){let data;try{data=JSON.parse(old)}catch{}if(data&&data.user===user&&data.data){block('发现上次未同步的记录','请先下载保留这份记录，再重新加载查看服务器数据。不要直接导入，避免覆盖其他记录。',data.data);return}} 
      const script=document.createElement('script');script.src='/original.js';document.body.append(script);
    }catch(e){setMessage('无法连接服务器，请刷新重试');alert('无法加载账本：'+e.message)}
  }
  banner.querySelector('#sync-refresh').onclick=()=>{if(pending&&!conflict){flush();return}if(sending){setMessage('正在同步，请稍等');return}if(confirm('刷新会重新读取服务器数据，请确认当前没有正在填写的内容。'))location.reload()};
  banner.querySelector('#sync-logout').onclick=async()=>{if(pending||sending){alert('还有记录未同步，请先重试或下载备份。');return}await api('/api/logout',{method:'POST',body:'{}'});location.reload()};
  banner.querySelector('#sync-history').onclick=async()=>{if(pending||sending){alert('请先等待当前数据同步');return}try{const h=await api('/api/history');if(!h.items.length){alert('还没有历史版本');return}const labels=h.items.map((x,i)=>(i+1)+'. '+new Date(x.created_at).toLocaleString()+'（版本 '+x.revision+'）').join('\n');const choice=prompt('选择要恢复的历史版本编号：\n'+labels);if(choice===null)return;const n=Number(choice);if(!Number.isInteger(n)||n<1||n>h.items.length)throw Error('编号无效');const item=h.items[n-1];if(!confirm('恢复会整体替换当前共享账本。当前版本也会保留在历史中，继续吗？'))return;const old=await api('/api/history/'+item.id);await api('/api/state',{method:'POST',body:JSON.stringify({revision,data:old.data})});alert('历史版本已恢复。');location.reload()}catch(e){alert('恢复失败：'+e.message)}};
  banner.querySelector('#sync-import').onclick=()=>banner.querySelector('#sync-file').click();
  banner.querySelector('#sync-file').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;try{const d=JSON.parse(await f.text());if(d.version!==4||!Array.isArray(d.members)||!Array.isArray(d.entries)||!d.couple)throw Error('备份格式不正确');if(pending||sending)throw Error('请先等待当前数据同步');if(!confirm('导入会用备份替换当前共享账本。请确认你们已经另外导出当前账本，继续吗？'))return;const r=await api('/api/state',{method:'POST',body:JSON.stringify({revision,data:perspective(d)})});revision=r.revision;alert('已导入，页面将重新加载。');location.reload()}catch(err){alert('导入失败：'+err.message)}};
  start();
})();





