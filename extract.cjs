const fs = require('fs');
const path = require('path');
const root = __dirname;
const html = fs.readFileSync(path.join(root, '原始页面.html'), 'utf8');
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
let js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const old = /  function load\(\) \{[\s\S]*?  var DB = load\(\) \|\| seed\(\);\r?\n  save\(DB\);/;
if(!old.test(js)) throw Error('Unable to locate persistence section');
js=js.replace(old, `  function load() { return global.WomenSync.initialData; }
  function save(db) { global.WomenSync.save(db); }
  var DB = load() || seed();
  if (!load()) save(DB);`);
js=js.replace("'<span class=\"conn\">同一空间 · 已连接</span>'", "'<span class=\"conn\">两位成员共享这个空间</span>'");
js=js.replace("'<span class=\"code-row\">情侣码 <b>' + S.db.couple.code + '</b>' +", "'<span class=\"code-row\">成员账号已启用 <b></b>' +");
js=js.replace("'<button class=\"copy-btn\" data-act=\"copy-code\">复制</button></span>'", "'</span>'");
js=js.replace('memberCard + switchCard + listHtml + backup +', "memberCard + '<div class=\"card\" style=\"padding:14px;margin-bottom:16px\">这个空间的记录对两位成员可见，请共同商量后记录。</div>' + listHtml + backup +");
js=js.replace('导出 JSON · 用情侣码重新加入','导出 JSON · 在顶部导入恢复');
js=js.replace("var shareOpen = S.db.couple.shareOpen;", "var shareOpen = true;");
js=js.replace("if (!S.db.couple.shareOpen) { toast('他没有开放这一天的记录。'); return; }", "");
js=js.replaceAll('+ m.name +', '+ esc(m.name) +').replaceAll('+ c.name +', '+ esc(c.name) +').replaceAll('+ c.desc +', '+ esc(c.desc) +').replaceAll('+ d.name +', '+ esc(d.name) +').replaceAll('+ cat.name +', '+ esc(cat.name) +').replaceAll('+ settle.label +', '+ esc(settle.label) +').replaceAll('+ w.pointsLabel +', '+ esc(w.pointsLabel) +');
js=js.replaceAll('+ S.member(last.memberId).name +', '+ esc(S.member(last.memberId).name) +').replaceAll('+ g.pointsLabel +', '+ esc(g.pointsLabel) +').replaceAll('+ r.pointsLabel +', '+ esc(r.pointsLabel) +').replaceAll("            m.name + ' · '", "            esc(m.name) + ' · '");
js=js.replace("+ S.cat(guess).name + '」，也可以跳过</div>'", "+ esc(S.cat(guess).name) + '」，也可以跳过</div>'");
js=js.replaceAll('最多 3 个 · 每周一自动结算','最多 3 个 · 记录目标进度');
const shell = html.replace(/<style>[\s\S]*?<\/style>/, '<link rel="stylesheet" href="/style.css">').replace(/<script>[\s\S]*?<\/script>/, '<script src="/sync.js"></script>');
fs.writeFileSync(path.join(root,'public/style.css'),css);
fs.writeFileSync(path.join(root,'public/index.html'),shell);
fs.writeFileSync(path.join(root,'public/original.js'),js);


