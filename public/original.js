
/* ============================================================
   data.js
   ============================================================ */
/* ============================================================
   「我们」系统 · 数据层
   设计稿 v3（2026-10-29）§六 11 张表
   ------------------------------------------------------------
   ⚠️ 2026-10-30 v4：已清空全部模拟数据。首次打开是空空间：
      只有两个人、情侣码、六域色板，其余全部等你们自己填。
   ⚠️ 不写负数：points_ledger 只增不减，消耗走 redemptions。
   ============================================================ */
(function (global) {
  'use strict';

  var KEY = 'women.store.v1';
  var VERSION = 4;

  /* ---------------- 日期工具 ---------------- */
  var D = {
    pad: function (n) { return (n < 10 ? '0' : '') + n; },
    key: function (d) {
      return d.getFullYear() + '-' + D.pad(d.getMonth() + 1) + '-' + D.pad(d.getDate());
    },
    parse: function (k) {
      var p = String(k).split('-');
      return new Date(+p[0], +p[1] - 1, +p[2]);
    },
    today: function () { return D.key(new Date()); },
    shift: function (k, n) {
      var d = D.parse(k);
      d.setDate(d.getDate() + n);
      return D.key(d);
    },
    diffDays: function (a, b) {
      return Math.round((D.parse(b) - D.parse(a)) / 86400000);
    },
    md: function (k) {
      var d = D.parse(k);
      return (d.getMonth() + 1) + '月' + d.getDate() + '日';
    },
    wd: function (k) {
      return '星期' + '日一二三四五六'.charAt(D.parse(k).getDay());
    },
    minutes: function (start, end) {         // 跨夜也对：23:00–08:30 → 570
      var a = D.hm(start), b = D.hm(end);
      if (a == null || b == null) return 0;
      var m = b - a;
      if (m < 0) m += 1440;
      return m;
    },
    hm: function (s) {
      if (!s || typeof s !== 'string') return null;
      var p = s.split(':');
      if (p.length < 2) return null;
      return (+p[0]) * 60 + (+p[1]);
    },
    dur: function (min) {
      min = Math.round(min || 0);
      var h = Math.floor(min / 60), m = min % 60;
      if (h && m) return h + ' 小时 ' + m + ' 分';
      if (h) return h + ' 小时';
      return m + ' 分';
    },
    durShort: function (min) {
      var h = (min || 0) / 60;
      return (Math.round(h * 10) / 10).toString().replace(/\.0$/, '') + 'h';
    },
    monthLabel: function (k) {
      var d = D.parse(k);
      return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月';
    },
    /* 6×7 网格，周一起点 */
    monthGrid: function (y, m) {
      var first = new Date(y, m, 1);
      var offset = (first.getDay() + 6) % 7;
      var start = new Date(y, m, 1 - offset);
      var out = [];
      for (var i = 0; i < 42; i++) {
        var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        out.push({ key: D.key(d), day: d.getDate(), inMonth: d.getMonth() === m });
      }
      return out;
    }
  };

  /* ---------------- 六域 ＋ 未分类 ---------------- */
  var CATEGORIES = [
    { id: 'health',  name: '健康', desc: '身体的事',     color: '#E9C9A3' },
    { id: 'career',  name: '事业', desc: '对外交付的',   color: '#A7C7EC' },
    { id: 'growth',  name: '成长', desc: '为自己长的',   color: '#A8CF9F' },
    { id: 'relate',  name: '关系', desc: '跟人有关的',   color: '#F2A6AC' },
    { id: 'life',    name: '生活', desc: '维持日常运转', color: '#C3A6EA' },
    { id: 'leisure', name: '休闲', desc: '纯放空',       color: '#93D2CE' },
    { id: 'none',    name: '未分类', desc: '暂时不知道归哪类', color: '#D8D5D2', locked: true }
  ];

  /* ---------------- 空空间（不带任何模拟记录） ---------------- */
  function seed() {
    var t = D.today();
    return {
      version: VERSION,
      members: [
        { id: 'me',  name: global.WomenSync.account || '我', role: '她', side: 'pink', avatar: null },
        { id: 'him', name: '待加入', role: '他', side: 'blue', avatar: null }
      ],
      couple: {
        code: 'WMS-' + (1000 + Math.floor(Math.random() * 9000)),
        since: t,          // 在一起天数从建空间那天算起
        shareOpen: true
      },
      categories: CATEGORIES.map(function (c) { return Object.assign({}, c); }),

      /* 以下全部留空——等你们自己动笔 */
      entries: [],
      goals: [],
      weekly_settlements: [],
      points_ledger: [],
      rewards: [],
      wishlist: [],
      story_entries: [],
      milestones: [],
      redemptions: [],

      /* 「换个灵感」的备选开头（系统内容，不是记录） */
      sparks: [
        '她把信纸折成一只小鸟，轻轻放进了雨后的水洼里。',
        '他在便利店门口停了一会儿，看着玻璃上的自己。',
        '那天的风很大，她把手插进口袋，走得很慢。',
        '他们约好不说再见，只说下次见。',
        '窗外的雨刚停，她想起还没回的那条消息。'
      ]
    };
  }

  /* ---------------- 持久化 ---------------- */
  function load() { return global.WomenSync.initialData; }
  function save(db) { global.WomenSync.save(db); }
  var DB = load() || seed();
  if (!load()) save(DB);
  else if (global.WomenSync.account && DB.members.some(function(m){return m.id==='me' && m.name==='待加入';})) {
    DB.members.filter(function(m){return m.id==='me';})[0].name=global.WomenSync.account;
    save(DB);
  }

  /* ---------------- 查询与写入 ---------------- */
  var store = {
    db: DB,
    date: D,
    save: function () { save(DB); },

    member: function (id) {
      return DB.members.filter(function (m) { return m.id === id; })[0];
    },
    setAvatar: function (memberId, dataUrl) {
      var m = store.member(memberId);
      if (m) { m.avatar = dataUrl; save(DB); }
    },

    cat: function (id) {
      if (!id) return DB.categories[DB.categories.length - 1];
      return DB.categories.filter(function (c) { return c.id === id; })[0] ||
             DB.categories[DB.categories.length - 1];
    },
    catColor: function (id) { return store.cat(id).color; },
    catName: function (id) { return store.cat(id).name; },

    entry: function (id) {
      return DB.entries.filter(function (e) { return e.id === id; })[0];
    },
    entriesOf: function (memberId, dateKey) {
      return DB.entries.filter(function (e) {
        return e.memberId === memberId && e.date === dateKey;
      }).sort(function (a, b) { return D.hm(a.start) - D.hm(b.start); });
    },
    entriesInRange: function (memberId, from, to) {
      return DB.entries.filter(function (e) {
        if (e.date < from || e.date > to) return false;
        if (memberId === 'all') return true;
        return e.memberId === memberId;
      });
    },
    goalProgress: function (goal) {
      var today = D.today();
      var start = D.shift(today, -((D.parse(today).getDay() + 6) % 7));
      var end = D.shift(start, 6);
      return DB.entries.filter(function (e) {
        return e.memberId === 'me' && e.goalId === goal.id && e.date >= start && e.date <= end;
      }).length;
    },
    unfinishedCount: function (memberId, dateKey) {
      return store.entriesOf(memberId, dateKey).filter(function (e) { return !e.categoryId; }).length;
    },

    addEntry: function (o) {
      o.id = 'e' + crypto.randomUUID();
      o.minutes = D.minutes(o.start, o.end);
      DB.entries.push(o);
      save(DB);
      return o;
    },
    updateEntry: function (id, patch) {
      var e = store.entry(id);
      if (!e) return;
      Object.assign(e, patch);
      e.minutes = D.minutes(e.start, e.end);
      save(DB);
    },
    deleteEntry: function (id) {
      DB.entries = DB.entries.filter(function (e) { return e.id !== id; });
      save(DB);
    },

    distribution: function (memberId, from, to) {
      var list = DB.entries.filter(function (e) {
        if (e.date < from || e.date > to) return false;
        if (memberId !== 'all' && e.memberId !== memberId) return false;
        return e.minutes > 0;
      });
      var total = list.reduce(function (s, e) { return s + e.minutes; }, 0);
      var map = {};
      list.forEach(function (e) {
        var k = e.categoryId || 'none';
        map[k] = (map[k] || 0) + e.minutes;
      });
      return DB.categories.map(function (c) {
        return {
          id: c.id, name: c.name, color: c.color,
          minutes: map[c.id] || 0,
          pct: total ? Math.round((map[c.id] || 0) / total * 100) : 0
        };
      });
    },

    happySeries: function (memberId, from, to) {
      var out = [];
      var k = from;
      while (k <= to) {
        var list = store.entriesInRange(memberId, k, k).filter(function (e) { return e.happy; });
        var avg = list.length
          ? list.reduce(function (s, e) { return s + e.happy; }, 0) / list.length
          : null;
        out.push({ key: k, value: avg });
        k = D.shift(k, 1);
      }
      return out;
    },
    lowEntries: function (memberId, from, to) {
      return DB.entries.filter(function (e) {
        if (e.date < from || e.date > to) return false;
        if (memberId !== 'all' && e.memberId !== memberId) return false;
        return e.happy && e.happy <= 2;
      }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    },

    pointsOf: function (memberId, wallet) {
      var w = (wallet === 'mine' || wallet === 'ours') ? wallet : 'all';
      var add = DB.points_ledger
        .filter(function (p) { return p.memberId === memberId && (w === 'all' || (p.wallet || 'mine') === w); })
        .reduce(function (s, p) { return s + (Number.isFinite(p.points) ? p.points : 0); }, 0);
      var used = DB.redemptions
        .filter(function (r) { return r.status !== 'pending' && (w === 'all' || (r.wallet || 'mine') === w); })
        .reduce(function (s, r) {
          return s + (memberId === 'me' ? (r.fromMe || 0) : (r.fromHim || 0));
        }, 0);
      return Math.max(0, add - used);
    },
    pointsBySource: function (memberId) {
      var own = 0, joint = 0;
      DB.points_ledger.forEach(function (p) {
        if (p.memberId !== memberId) return;
        if (p.type === 'joint') joint += p.points;
        else own += p.points;
      });
      return { own: own, joint: joint };
    },
    ledgerOf: function (memberId) {
      return DB.points_ledger.filter(function (p) { return p.memberId === memberId; })
        .sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    },

    nextMeet: function () {
      var t = D.today();
      var list = DB.milestones
        .filter(function (m) { return m.kind === 'meet' && m.date >= t; })
        .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      return list[0] || null;
    },
    pastMeets: function () {
      var t = D.today();
      return DB.milestones
        .filter(function (m) { return m.kind === 'meet' && m.date < t; })
        .sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    },
    daysTogether: function () { return D.diffDays(DB.couple.since, D.today()) + 1; },

    storySorted: function () {
      return DB.story_entries.slice().sort(function (a, b) { return a.seq - b.seq; });
    },
    storyLast: function () {
      var l = store.storySorted();
      return l.length ? l[l.length - 1] : null;
    },
    addStory: function (memberId, text) {
      var seq = DB.story_entries.length + 1;
      DB.story_entries.push({
        id: 's' + crypto.randomUUID(), memberId: memberId, seq: seq,
        date: D.today(), text: text
      });
      save(DB);
    },

    dayMarks: function (monthKey) {
      var map = {};
      DB.entries.forEach(function (e) {
        if (e.date.slice(0, 7) !== monthKey) return;
        var m = map[e.date] || { me: false, him: false };
        if (e.memberId === 'me') m.me = true; else m.him = true;
        map[e.date] = m;
      });
      return map;
    },

    /* 清空所有记录，保留成员、情侣码、色板 */
    clearAll: function () {
      DB.entries = [];
      DB.goals = [];
      DB.weekly_settlements = [];
      DB.points_ledger = [];
      DB.rewards = [];
      DB.wishlist = [];
      DB.story_entries = [];
      DB.milestones = [];
      DB.redemptions = [];
      save(DB);
    }
  };

  store.D = D;
  global.Store = store;
})(window);


/* ============================================================
   ui.js
   ============================================================ */
/* ============================================================
   「我们」系统 · 图标 ＋ 公共组件
   ============================================================ */
(function (global) {
  'use strict';

  var S = global.Store;
  var D = S.D;

  /* ---------------- 图标（线性 · stroke=currentColor） ---------------- */
  var PATHS = {
    sun:      '<circle cx="12" cy="12" r="4"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"/>',
    heart:    '<path d="M12 20.3s-7.6-4.6-7.6-9.7A4.4 4.4 0 0 1 12 7.7a4.4 4.4 0 0 1 7.6 2.9c0 5.1-7.6 9.7-7.6 9.7z"/>',
    calendar: '<rect x="3.2" y="5" width="17.6" height="16" rx="3.4"/><path d="M8 3v4M16 3v4M3.2 10.4h17.6"/>',
    gear:     '<circle cx="12" cy="12" r="3.3"/><path d="M9.42 5.92L9.49 2.63L14.51 2.63L14.58 5.92L15.97 6.73L18.86 5.14L21.37 9.49L18.55 11.2L18.55 12.8L21.37 14.51L18.86 18.86L15.97 17.27L14.58 18.08L14.51 21.37L9.49 21.37L9.42 18.08L8.03 17.27L5.14 18.86L2.63 14.51L5.45 12.8L5.45 11.2L2.63 9.49L5.14 5.14L8.03 6.73Z"/>',
    home:     '<path d="M4 10.6 12 4l8 6.6V20a1 1 0 0 1-1 1h-4.6v-6H9.6v6H5a1 1 0 0 1-1-1z"/>',
    plus:     '<path d="M12 5.4v13.2M5.4 12h13.2"/>',
    right:    '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
    down:     '<path d="M5.5 9.5 12 16l6.5-6.5"/>',
    left:     '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
    edit:     '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/>',
    check:    '<path d="M5 12.8 9.6 17.4 19 8"/>',
    x:        '<path d="M6.2 6.2l11.6 11.6M17.8 6.2 6.2 17.8"/>',
    lock:     '<rect x="4.6" y="10.4" width="14.8" height="10.2" rx="2.8"/><path d="M8.4 10.4V7.8a3.6 3.6 0 0 1 7.2 0v2.6"/>',
    gift:     '<rect x="3.4" y="8.6" width="17.2" height="4.2" rx="1.6"/><path d="M5 12.8V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6.2M12 8.6V21"/>',
    star:     '<path d="m12 4 2.5 5.1 5.5.8-4 3.9 1 5.5-5-2.7-5 2.7 1-5.5-4-3.9 5.5-.8z"/>',
    briefcase:'<rect x="3" y="7.6" width="18" height="13" rx="2.8"/><path d="M8.6 7.6V6a2 2 0 0 1 2-2h2.8a2 2 0 0 1 2 2v1.6M3 12.6h18"/>',
    sprout:   '<path d="M12 20.6v-6.2"/><path d="M12 14.4C8.4 14.4 6 12 6 8.6c3.6 0 6 2.4 6 5.8z"/><path d="M12 13.6c0-2.8 2-4.8 4.8-4.8 0 2.8-2 4.8-4.8 4.8z"/>',
    users:    '<circle cx="9.4" cy="8.6" r="3.2"/><path d="M3.4 19.6a6 6 0 0 1 12 0"/><path d="M16.2 6.4a3 3 0 0 1 0 5.6M17.6 15.2a5.4 5.4 0 0 1 3 4.4"/>',
    house:    '<path d="M4 10.4 12 4l8 6.4V19a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 19z"/><path d="M9.6 20.6v-5.4h4.8v5.4"/>',
    cup:      '<path d="M6 8.4h10v6a5 5 0 0 1-10 0z"/><path d="M16 9.6h1.6a2.6 2.6 0 0 1 0 5.2H16M4.4 20.6h13.2"/>',
    pulse:    '<path d="M3 12.4h4L9.4 6l3.4 12 2.6-5.6H21"/>',
    book:     '<path d="M4 5.4A2 2 0 0 1 6 3.4h12.6v17.2H6a2 2 0 0 0-2 2z"/><path d="M4 17.6h14.6"/>',
    run:      '<circle cx="14.6" cy="5.4" r="2"/><path d="M8 21l3-4.6-2-2.2 1.4-4.4 3.2 1 1.4 2.4 2.8.8M5.6 13.6l2.6-2.2"/>',
    clock:    '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.6V12l3 2"/>',
    copy:     '<rect x="8.6" y="8.6" width="11.4" height="11.4" rx="2.6"/><path d="M15.4 8.6V6.2a2.2 2.2 0 0 0-2.2-2.2H6.2A2.2 2.2 0 0 0 4 6.2v7a2.2 2.2 0 0 0 2.2 2.2h2.4"/>',
    download: '<path d="M12 3.4v11.2M7.6 10.6 12 15l4.4-4.4"/><path d="M4.4 17.4v1.8a1.6 1.6 0 0 0 1.6 1.6h12a1.6 1.6 0 0 0 1.6-1.6v-1.8"/>',
    palette:  '<path d="M12 3.2a8.8 8.8 0 0 0 0 17.6c1.4 0 2-1 2-1.9 0-1.5-1.4-1.7-1.4-3 0-1 .9-1.8 2-1.8h1.6A5.6 5.6 0 0 0 20.8 8.6C20.2 5.4 16.6 3.2 12 3.2z"/><circle cx="8.2" cy="9.4" r="1.1"/><circle cx="12" cy="7.4" r="1.1"/><circle cx="15.6" cy="9.4" r="1.1"/>',
    target:   '<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1"/>',
    plane:    '<path d="M20.4 4.4 3.6 11.2l6.2 2.2 2.2 6.2z"/><path d="M20.4 4.4 9.8 13.4"/>',
    speech:   '<path d="M4 6.4A2.4 2.4 0 0 1 6.4 4h11.2A2.4 2.4 0 0 1 20 6.4v8.2a2.4 2.4 0 0 1-2.4 2.4H9.2L4 21z"/>',
    pin:      '<path d="M12 21s6.4-6.2 6.4-10.6A6.4 6.4 0 0 0 5.6 10.4C5.6 14.8 12 21 12 21z"/><circle cx="12" cy="10.2" r="2.3"/>',
    food:     '<path d="M6 3.4v8.2M9 3.4v8.2M7.5 11.6v9M16.4 3.4c1.6 0 2.6 1.6 2.6 4.6s-1 4.6-2.6 4.6h0v8"/>',
    beach:    '<path d="M12 20.6V11"/><path d="M12 11C9 8.6 5.6 9 3.6 11.4"/><path d="M12 11c3-2.4 6.4-2 8.4.4"/><path d="M5 20.6h14"/>',
    coins:    '<ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7"/><path d="M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>',
    art:      '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9.2" cy="9.4" r="1.4"/><path d="M5 17.4 10 12l4 4 2.2-2.2 2.8 2.8"/>',
    trash:    '<path d="M4.6 7.4h14.8M9.4 7.4V5.2a1.6 1.6 0 0 1 1.6-1.6h2a1.6 1.6 0 0 1 1.6 1.6v2.2"/><path d="M6.4 7.4 7.4 20a1.6 1.6 0 0 0 1.6 1.4h6a1.6 1.6 0 0 0 1.6-1.4l1-12.6"/>',
    sparkle:  '<path d="M12 3.6 13.8 9l5.4 1.8-5.4 1.8L12 18l-1.8-5.4L4.8 10.8 10.2 9z"/>',
    eye:      '<path d="M2.6 12S6 6.4 12 6.4 21.4 12 21.4 12 18 17.6 12 17.6 2.6 12 2.6 12z"/><circle cx="12" cy="12" r="2.8"/>',
    copyall:  '<rect x="3.4" y="3.4" width="12" height="12" rx="2.4"/><path d="M8.6 19.4a2.4 2.4 0 0 0 2.4 1.2h7.6a2.4 2.4 0 0 0 2.4-2.4V10.6a2.4 2.4 0 0 0-1.2-2.1"/>',
    upload:   '<path d="M12 20.6V9.4M7.6 13.4 12 9l4.4 4.4"/><path d="M4.4 6.6V4.8a1.6 1.6 0 0 1 1.6-1.6h12a1.6 1.6 0 0 1 1.6 1.6v1.8"/>',
    cloud:    '<path d="M7.6 18.4h9.2a3.8 3.8 0 0 0 .4-7.6 5.4 5.4 0 0 0-10.4-1 3.9 3.9 0 0 0 .8 8.6z"/><path d="M12 15.6v-4.4M10.2 12.4 12 10.6l1.8 1.8"/>',
    moon:     '<path d="M20 14.4A8.4 8.4 0 0 1 9.6 4 8.6 8.6 0 1 0 20 14.4z"/>'
  };

  function icon(name, size) {
    var p = PATHS[name] || PATHS.star;
    var s = size || 20;
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s +
      '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      p + '</svg>';
  }

  /* ---------------- 分类 → 图标 ---------------- */
  var CAT_ICON = {
    health: 'pulse', career: 'briefcase', growth: 'sprout',
    relate: 'users', life: 'house', leisure: 'cup', none: 'clock'
  };
  function catIcon(catId, size) { return icon(CAT_ICON[catId] || 'clock', size || 20); }

  /* hex → rgba */
  function rgba(hex, a) {
    var h = String(hex || '#D8D5D2').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---------------- 头像（可自己上传图片） ----------------
     kind 传入对应的 class 前缀：member / who / col / side
  */
  function avatar(m, size, kind) {
    var s = size || 36;
    var k = kind || 'member';
    var cls = k + '-ava ' + m.id;   // class 用成员 id（me / him），不是 side
    if (m.avatar) {
      return '<span class="' + cls + ' ava-has-img" ' +
        'style="width:' + s + 'px;height:' + s + 'px;font-size:0">' +
        '<img class="ava-img" src="' + m.avatar + '" alt="">' +
      '</span>';
    }
    return '<span class="' + cls + '" style="width:' + s + 'px;height:' + s +
      'px;font-size:' + Math.round(s * 0.38) + 'px">' + esc(m.name.charAt(0)) + '</span>';
  }

  /* ---------------- 堆叠条 ---------------- */
  function stack(dist) {
    var has = dist.some(function (d) { return d.minutes > 0; });
    var inner = dist.map(function (d) {
      if (!d.minutes) return '';
      return '<i style="width:' + (d.minutes ? Math.max(d.pct, 1) : 0) + '%;background:' + d.color + '"></i>';
    }).join('');
    return '<div class="stack">' + (has ? inner : '') + '</div>';
  }

  function legend(dist, withPct) {
    return '<div class="legend">' + dist.map(function (d) {
      return '<div class="legend-item">' +
        '<span class="legend-dot" style="background:' + d.color + '"></span>' +
        '<span>' + esc(d.name) + '</span>' +
        '<b>' + (d.minutes ? D.durShort(d.minutes) : '0分') + '</b>' +
        (withPct ? '<span class="pct">' + d.pct + '%</span>' : '') +
        '</div>';
    }).join('') + '</div>';
  }

  /* ---------------- 记录条目 ---------------- */
  /* opts: { dayTotal, arrow, showName } */
  function entryRow(e, opts) {
    opts = opts || {};
    var cat = S.cat(e.categoryId);
    var dayTotal = opts.dayTotal || 0;
    var w = dayTotal ? Math.round(e.minutes / dayTotal * 100) : 0;
    return '<div class="entry' + (opts.editable ? ' editable' : '') + '" data-entry="' + e.id + '"' +
      (opts.editable ? ' data-act="edit-entry" data-id="' + e.id + '"' : '') + '>' +
      '<div class="entry-ico" style="background:' + rgba(cat.color, .2) + ';color:' + cat.color + '">' +
        catIcon(cat.id, 20) +
      '</div>' +
      '<div class="entry-main">' +
        '<div class="entry-line1">' +
          '<span class="entry-time">' + esc(e.start) + ' – ' + esc(e.end) + '</span>' +
          '<span class="entry-chip" style="background:' + rgba(cat.color, .18) + ';color:' + shade(cat.color) + '">' + esc(cat.name) + '</span>' +
          '<span class="entry-dur">' + D.durShort(e.minutes) + '</span>' +
        '</div>' +
        '<div class="entry-text">' + esc(e.content) + '</div>' +
        '<div class="entry-bar"><i style="width:' + Math.min(w, 100) + '%;background:' + cat.color + '"></i></div>' +
      '</div>' +
      (opts.arrow ? '<div class="entry-arrow">' + icon('right', 15) + '</div>' : '') +
    '</div>';
  }

  function shade(hex) {
    // 让浅色背景上的文字更沉一点
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    var r = Math.round(((n >> 16) & 255) * .62);
    var g = Math.round(((n >> 8) & 255) * .62);
    var b = Math.round((n & 255) * .62);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function entriesBlock(memberId, dateKey, opts) {
    var list = S.entriesOf(memberId, dateKey);
    if (!list.length) {
      return '<div class="empty">这天还没有记录。<br>记下来，就已经很好。</div>';
    }
    var total = list.reduce(function (s, e) { return s + e.minutes; }, 0);
    return '<div class="entries">' + list.map(function (e) {
      return entryRow(e, { dayTotal: total, arrow: opts && opts.arrow, editable: opts && opts.editable });
    }).join('') + '</div>';
  }

  /* ---------------- 日历 ---------------- */
  function calendar(monthKey, marks, todayKey, selectedKey, picker) {
    var d = D.parse(monthKey + '-01');
    var y = d.getFullYear(), mo = d.getMonth();
    var grid = D.monthGrid(y, mo);
    var cells = grid.map(function (c) {
      var m = marks[c.key] || {};
      var marksHtml = '';
      if (m.me && m.him) {
        marksHtml = '<i style="background:#E8899C"></i><i style="background:#7FA9DB"></i>';
      } else if (m.me) {
        marksHtml = '<i style="background:#E8899C"></i>';
      } else if (m.him) {
        marksHtml = '<i style="background:#7FA9DB"></i>';
      }
      var cls = 'cal-cell' + (c.inMonth ? '' : ' out') +
        (c.key === todayKey ? ' today' : '') +
        (c.key === selectedKey ? ' sel' : '');
      return '<div class="' + cls + '" data-day="' + c.key + '">' +
        '<span class="d">' + c.day + '</span>' +
        '<span class="cal-marks">' + marksHtml + '</span>' +
      '</div>';
    }).join('');

    /* 年月直接选择面板 */
    var pickerHtml = '';
    if (picker) {
      var months = '';
      for (var i = 0; i < 12; i++) {
        months += '<button class="cp-m' + (i === mo ? ' on' : '') +
          '" data-act="cal-month" data-m="' + i + '">' + (i + 1) + '月</button>';
      }
      pickerHtml = '<div class="cal-picker">' +
        '<div class="cp-year">' +
          '<button data-act="cal-year" data-d="-1" aria-label="上一年">' + icon('left', 15) + '</button>' +
          '<span>' + y + ' 年</span>' +
          '<button data-act="cal-year" data-d="1" aria-label="下一年">' + icon('right', 15) + '</button>' +
        '</div>' +
        '<div class="cp-months">' + months + '</div>' +
      '</div>';
    }

    return '<div class="cal-head">' +
        '<button class="cal-month" data-act="cal-pick">' +
          D.monthLabel(monthKey + '-01') + icon('down', 14) +
        '</button>' +
        '<div class="cal-nav">' +
          '<button data-act="cal" data-dir="prev" aria-label="上个月">' + icon('left', 16) + '</button>' +
          '<button data-act="cal" data-dir="next" aria-label="下个月">' + icon('right', 16) + '</button>' +
        '</div>' +
      '</div>' +
      pickerHtml +
      '<div class="cal-week">' + ['一', '二', '三', '四', '五', '六', '日']
        .map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div>' +
      '<div class="cal-grid">' + cells + '</div>' +
      '<div class="cal-legend">' +
        '<span><i style="background:#E8899C"></i>她有记录</span>' +
        '<span><i style="background:#7FA9DB"></i>他有记录</span>' +
        '<span><i style="background:#E8899C"></i><i style="background:#7FA9DB;margin-left:-2px"></i>两人都有</span>' +
      '</div>';
  }

  /* ---------------- 快乐值折线（SVG） ---------------- */
  function happyChart(series, selectedKey) {
    var w = 320, h = 128, padL = 22, padR = 8, padT = 14, padB = 24;
    var iw = w - padL - padR, ih = h - padT - padB;
    var n = series.length;
    var stepX = n > 1 ? iw / (n - 1) : 0;
    var pts = series.map(function (p, i) {
      var x = padL + i * stepX;
      var y = p.value == null ? null : padT + ih - ((p.value - 1) / 4) * ih;
      return { x: x, y: y, v: p.value, key: p.key };
    });

    var grid = '';
    [1, 2, 3, 4, 5].forEach(function (v) {
      var y = padT + ih - ((v - 1) / 4) * ih;
      grid += '<line x1="' + padL + '" y1="' + y + '" x2="' + (w - padR) + '" y2="' + y +
        '" stroke="#F1ECE6" stroke-width="1"/>';
      grid += '<text x="' + (padL - 6) + '" y="' + (y + 3.5) + '" text-anchor="end" font-size="9" fill="#C6C0B9">' + v + '</text>';
    });

    // 折线：空值断开
    var segs = [], cur = [];
    pts.forEach(function (p) {
      if (p.y == null) { if (cur.length) { segs.push(cur); cur = []; } }
      else cur.push(p);
    });
    if (cur.length) segs.push(cur);

    var lines = segs.map(function (seg) {
      if (seg.length === 1) return '';
      return '<polyline fill="none" stroke="#E8899C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="' +
        seg.map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ') + '"/>';
    }).join('');

    // 面积
    var area = segs.map(function (seg) {
      if (seg.length < 2) return '';
      var dpath = 'M' + seg[0].x.toFixed(1) + ',' + (padT + ih) + ' L' +
        seg.map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' L ') +
        ' L' + seg[seg.length - 1].x.toFixed(1) + ',' + (padT + ih) + ' Z';
      return '<path d="' + dpath + '" fill="rgba(232,137,156,.10)" stroke="none"/>';
    }).join('');

    var dots = pts.map(function (p) {
      if (p.y == null) return '';
      var on = p.key === selectedKey;
      return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (on ? 4.2 : 2.8) +
        '" fill="' + (on ? '#D9748A' : '#fff') + '" stroke="#E8899C" stroke-width="1.6" data-hday="' + p.key + '" style="cursor:pointer"/>';
    }).join('');

    var xlab = pts.map(function (p) {
      var d = D.parse(p.key);
      return '<text x="' + p.x.toFixed(1) + '" y="' + (h - 6) + '" text-anchor="middle" font-size="9" fill="#B5AFA8">' +
        (d.getMonth() + 1) + '/' + d.getDate() + '</text>';
    }).join('');

    return '<div class="chart-wrap"><svg viewBox="0 0 ' + w + ' ' + h + '">' +
      grid + area + lines + dots + xlab +
    '</svg></div>';
  }

  /* ---------------- 子页头 ---------------- */
  // 返回键只留箭头图标，不再显示文字。
  // 第一个参数 back 保留只为兼容 8 处调用点，已经不渲染了。
  function subHead(back, title, right) {
    return '<div class="sub-head">' +
      '<button class="sub-back" data-act="back" aria-label="返回">' + icon('left', 17) + '</button>' +
      '<div class="sub-title">' + esc(title) + '</div>' +
      '<div class="sub-right">' + (right || '') + '</div>' +
    '</div>';
  }

  /* ---------------- 折线等等：把 hex 变浅底 ---------------- */
  function soft(hex, a) { return rgba(hex, a == null ? .18 : a); }

  global.UI = {
    icon: icon,
    avatar: avatar,
    catIcon: catIcon,
    rgba: rgba,
    soft: soft,
    shade: shade,
    esc: esc,
    stack: stack,
    legend: legend,
    entryRow: entryRow,
    entriesBlock: entriesBlock,
    calendar: calendar,
    happyChart: happyChart,
    subHead: subHead
  };
})(window);


/* ============================================================
   pages-main.js
   ============================================================ */
/* ============================================================
   「我们」系统 · 一级页（今天 / 一起 / 回看 / 设置）
   ============================================================ */
(function (global) {
  'use strict';

  var S = global.Store, UI = global.UI, D = S.D;
  var Pages = {};

  function page(html, narrow) {
    return '<div class="page' + (narrow ? ' narrow' : '') + '">' + html + '</div>';
  }
  function esc(s) { return UI.esc(s); }

  /* 演示数据声明——设计稿 §9.2：分值一律「待定」 */
  var DEMO = '<div class="page-foot">演示数据不是设计 · 分值以「待定」占位</div>';

  /* ============================================================
     ① 今天（手机） ／ ② 今天（电脑）
     ============================================================ */
  Pages.today = function (st) {
    var t = D.today();
    var me = S.member('me'), him = S.member('him');
    var together = S.daysTogether();
    var next = S.nextMeet();
    var cd = next ? D.diffDays(t, next.date) : null;
    var shareOpen = true;
    var expanded = st.parallelOpen && shareOpen;

    /* ---------- 状态卡（手机） ---------- */
    var statRow =
      '<div class="stat-row">' +
        '<div class="stat-card me" data-act="edit-since" style="cursor:pointer" title="点这里改在一起的日子">' +
          '<div><div class="stat-k">在一起 <span style="opacity:.55">· 可改</span></div>' +
          '<div class="stat-v">' + together + '<em>天</em></div></div>' +
          '<span class="stat-ico">' + UI.icon('heart', 18) + '</span>' +
        '</div>' +
        '<div class="stat-card him">' +
          '<div><div class="stat-k">下次见面</div>' +
          '<div class="stat-v">' + (cd == null ? '—' : cd) + '<em>' + (cd == null ? '还没定' : '天') + '</em></div></div>' +
          '<span class="stat-ico">' + UI.icon('calendar', 18) + '</span>' +
        '</div>' +
      '</div>';

    /* ---------- 平行空间（按钮，不可拨） ---------- */
    var parallelBtn =
      '<button class="parallel' + (shareOpen ? '' : ' closed') + '" data-act="parallel">' +
        '<span class="p-ico">' + UI.icon(shareOpen ? 'eye' : 'lock', 15) + '</span>' +
        '<span class="p-txt">' + (shareOpen
            ? '平行空间 · 看看他写了什么'
            : '他没有开放 · 这天你看不到他的记录') + '</span>' +
        '<span class="p-arrow">' + UI.icon('right', 15) + '</span>' +
      '</button>';

    /* ---------- 双人 tab（手机） ---------- */
    var pairTabs =
      '<div class="pair-tabs">' +
        '<button class="pair-tab' + (st.todaySide === 'me' ? ' on' : '') + '" data-act="side" data-side="me">' + esc(me.name) + '的空间</button>' +
        '<button class="pair-tab him' + (st.todaySide === 'him' ? ' on him' : '') + '" data-act="side" data-side="him">' + esc(him.name) + '的空间</button>' +
      '</div>';

    /* ---------- 单人记录卡（手机） ---------- */
    function whoCard(side) {
      var m = side === 'me' ? me : him;
      var rows = S.entriesOf(side, t);
      var total = rows.reduce(function (s, e) { return s + e.minutes; }, 0);
      var html = '<div class="card">' +
        '<div class="card-title">' +
          '<span style="display:flex;align-items:center;gap:8px">' +
            UI.avatar(m, 26, 'who') +
            '<span>' + esc(m.name) + ' · ' + (side === 'me' ? '我的记录' : '他的记录') + '</span>' +
          '</span>' +
        '</div>' +
        UI.entriesBlock(side, t, { arrow: true, editable: side === 'me' }) +
      '</div>';

      // 今日时间分布
      var dist = S.distribution(side, t, t);
      var un = S.unfinishedCount(side, t);
      html += '<div class="card">' +
        '<div class="card-title">今日时间分布' +
          '<span class="sub">共 ' + (total ? D.dur(total) : '0 分') + '</span>' +
        '</div>' +
        UI.stack(dist) + UI.legend(dist, false) +
        (un ? '<button class="tip-row" data-act="tidy" data-side="' + side + '">' +
                UI.icon('clock', 14) +
                '<span>' + un + ' 条未分类 · 去整理</span>' +
                '<span class="go">' + UI.icon('right', 13) + '</span>' +
              '</button>' : '') +
      '</div>';
      return html;
    }

    /* ---------- 电脑版单栏 ---------- */
    function deskCol(side, label, motto) {
      var m = side === 'me' ? me : him;
      var rows = S.entriesOf(side, t);
      var total = rows.reduce(function (s, e) { return s + e.minutes; }, 0);
      var dist = S.distribution(side, t, t);
      var un = S.unfinishedCount(side, t);

      var html = '<div class="pair-col ' + side + '">' +
        '<div class="col-head">' +
          UI.avatar(m, 34, 'col') +
          '<div style="flex:1"><div class="col-name">' + label + ' · ' + esc(m.name) + '</div>' +
          '<div class="col-sub" style="margin-top:2px">' + motto + '</div></div>' +
        '</div>' +
        '<div class="col-card">' +
          UI.entriesBlock(side, t, { arrow: true, editable: side === 'me' }) +
        '</div>' +
        '<div class="col-card">' +
          '<div class="card-title">今日时间分布' +
            '<span class="sub">共 ' + (total ? D.dur(total) : '0 分') + '</span></div>' +
          UI.stack(dist) + UI.legend(dist, true) +
        '</div>';

      if (un) {
        html += '<div class="col-card">' +
          '<div class="card-title">待整理<span class="sub">' + un + ' 条未分类</span></div>' +
          '<div style="font-size:12.5px;color:var(--ink-3);margin:-4px 0 10px">这些记录还没有归到具体类型。</div>' +
          rows.filter(function (e) { return !e.categoryId; }).map(function (e) {
            return '<div class="ledger-row" style="border-top:0;padding:5px 0">' +
              '<span class="entry-time">' + esc(e.start) + '</span>' +
              '<span style="font-size:13px">' + esc(e.content) + '</span>' +
              '<span class="d" style="color:var(--ink-4)">' + UI.icon('right', 13) + '</span>' +
            '</div>';
          }).join('') +
        '</div>';
      }
      html += '</div>';
      return html;
    }

    var deskTop = '<div class="desk-top desk-only">' +
      '<span class="dt-date"><b>' + D.md(t) + '</b>' + D.wd(t) + '</span>' +
      '<span class="dt-pill" data-act="edit-since" style="cursor:pointer" title="点这里改在一起的日子">' + UI.icon('heart', 13) + '在一起 ' + together + ' 天</span>' +
      '<span class="dt-pill blue">' + UI.icon('calendar', 13) +
        '下次见面 ' + (cd == null ? '还没定' : cd + ' 天') + '</span>' +
      '<span class="dt-spacer"></span>' +
      '<button class="dt-parallel" data-act="parallel">' +
        UI.icon('eye', 15) + '平行空间：' + (expanded ? '已开启' : '已关闭') + '</button>' +
      '<button class="top-add" data-act="add">' + UI.icon('plus', 14) + '记一笔</button>' +
    '</div>';

    var deskHero = '<div class="desk-hero desk-only">' +
      '<h1 class="page-title">今天，过得怎么样？</h1>' +
      '<p class="page-sub">写一两行就好，不需要完美。</p>' +
    '</div>';

    var deskCols = '<div class="pair-cols desk-only' + (expanded ? '' : ' one') + '">' +
      deskCol('me', '我的一天', '认真生活，也好好爱你。') +
      (expanded ? deskCol('him', '他的今天', '上班很辛苦，也要好好照顾自己。') : '') +
    '</div>';

    var deskFoot = '<div class="desk-foot desk-only">' +
      '<div class="avas">' +
        UI.avatar(me, 24, 'side') +
        '<span style="margin-left:-8px;display:inline-block">' + UI.avatar(him, 24, 'side') + '</span>' +
      '</div>' +
      '<span>一起记录，慢慢变好</span>' +
    '</div>';

    /* ---------- 手机版整体 ---------- */
    var mobile =
      '<div class="mobile-only">' +
        '<div class="topline">' +
          '<div class="brand">我们</div>' +
          '<div class="topline-date"><span>' + D.md(t) + ' ' + D.wd(t) + '</span>' +
            UI.icon('calendar', 17) + '</div>' +
          '<button class="top-gear" data-act="go" data-go="settings" aria-label="设置">' + UI.icon('gear', 18) + '</button>' +
        '</div>' +
        '<div class="page-head">' +
          '<h1 class="page-title">今天，过得怎么样？</h1>' +
          '<p class="page-sub">记一两行就好。</p>' +
        '</div>' +
        statRow + pairTabs +
        (st.todaySide === 'me' ? '<div class="card"><div class="card-title">本周目标<button class="card-link" data-act="go" data-go="goals">管理' + UI.icon('right', 12) + '</button></div>' +
          (S.db.goals.filter(function(g){return (g.memberId==='me'||g.scope==='both') && g.status==='active';}).map(function(g){return '<button class="prog-row" data-act="go" data-go="goals"><span class="prog-main">'+esc(g.name)+'</span><span>'+S.goalProgress(g)+' / '+g.timesPerWeek+'</span></button>';}).join('') || '<button class="add-block" data-act="goal-add">添加长期目标</button>') + '</div>' : '') +
        (st.todaySide === 'him' && !shareOpen
          ? '<div class="card"><div class="empty">他没有开放这一天的记录。<br>不追问，也不解释。</div></div>'
          : whoCard(st.todaySide)) +
      '</div>';

    var fab = '<button class="fab" data-act="add">' + UI.icon('plus', 15) + '记一笔</button>';

    return page(deskTop + deskHero + deskCols + deskFoot + mobile + fab);
  };

  /* ============================================================
     ③ 一起（三段：状态 → 想一起做的事 → 一起做过的）
     ============================================================ */

  /* 愿望分值：非数字（「待定」等）一律排到最后，不参与比较 */
  function wishCost(w) {
    var v = String((w && w.pointsLabel) || '').trim();
    return /^[1-9]\d{0,4}$/.test(v) ? Number(v) : 99999;
  }
  function wishCostText(w) {
    return wishCost(w) > 10000 ? '待定' : esc(w.pointsLabel) + ' 分';
  }
  /* 排序：能正常兑的按分值从低到高，共同但奇数分的排后面，没定分值的最后 */
  function wishRank(w) {
    var cost = wishCost(w);
    if (cost > 10000) return 1e7;
    if (w.scope === 'both' && cost % 2 !== 0) return 1e6 + cost;
    return cost;
  }
  function openWishes(onlyShared) {
    return S.db.wishlist
      .filter(function (w) { return w.status !== 'redeemed' && w.status !== 'done' && (!onlyShared || w.scope === 'both'); })
      .slice()
      .sort(function (a, b) { return wishRank(a) - wishRank(b); });
  }

  Pages.together = function (st) {
    var together = S.daysTogether();
    var next = S.nextMeet();
    var cd = next ? D.diffDays(D.today(), next.date) : null;

    /* ----- ① 状态行：两块都能点，见面不再是孤儿按钮 ----- */
    var statusRow =
      '<div class="stat-row">' +
        '<div class="stat-card me" data-act="edit-since" style="cursor:pointer" title="点这里改在一起的日子">' +
          '<div><div class="stat-k">在一起 <span style="opacity:.55">· 可改</span></div>' +
          '<div class="stat-v">' + together + '<em>天</em></div></div>' +
          '<span class="stat-ico">' + UI.icon('heart', 18) + '</span>' +
        '</div>' +
        '<div class="stat-card him" data-act="go" data-go="meet" style="cursor:pointer" title="点这里安排下次见面">' +
          '<div><div class="stat-k">下次见面</div>' +
          '<div class="stat-v">' + (cd == null ? '—' : cd) + '<em>' + (cd == null ? '还没定' : '天') + '</em></div></div>' +
          '<span class="stat-ico">' + UI.icon('calendar', 18) + '</span>' +
        '</div>' +
      '</div>';

    /* ----- ② 想一起做的事：只列最近能达成的 3 条 ----- */
    var top = openWishes(true).slice(0, 3);
    var wishRows = top.map(function (w) {
      var c = S.cat(w.cat === 'together' ? 'relate' : w.cat === 'eat' ? 'life' : 'leisure');
      return '<button class="prog-row" data-act="go" data-go="wishlist">' +
        '<span class="prog-ico" style="background:' + UI.rgba(c.color, .18) + ';color:' + UI.shade(c.color) + '">' +
          UI.icon(w.icon || 'star', 18) + '</span>' +
        '<span class="prog-main">' +
          '<span class="prog-name">' + esc(w.name || '还没起名') + '</span>' +
          '<span class="prog-dots"><span class="txt">' +
            esc(w.executorLabel || '我们一起') + ' · ' + wishCostText(w) +
          '</span></span>' +
        '</span>' +
        '<span class="list-arrow">' + UI.icon('right', 16) + '</span>' +
      '</button>';
    }).join('');

    var wishCard = '<div class="card">' +
      '<div class="card-title">想一起做的事' +
        '<button class="card-link" data-act="go" data-go="wishlist">管理' + UI.icon('right', 12) + '</button>' +
      '</div>' +
      (wishRows || '<div class="empty">还没有想一起做的事。</div>' +
        '<button class="add-block" data-act="go" data-go="wishlist">加一个想一起做的事</button>') +
    '</div>';

    /* ----- ③ 一起做过的：兑换 / 见面 / 里程碑，倒序一行一条 ----- */
    var events = [];
    /* 一起做过的只收共同的兑换；单人兑的算他自己的，不进这条时间线 */
    S.db.redemptions.filter(function(r){return r.status !== 'pending' && r.status !== 'cancelled' && r.wallet === 'ours';}).forEach(function (r) {
      events.push({ date: r.date, text: r.name || '兑换', ico: 'gift' });
    });
    S.db.milestones.forEach(function (m) {
      if (m.kind === 'meet' && m.date > D.today()) return;   /* 还没发生的见面不算「做过的」 */
      events.push({
        date: m.date,
        text: m.title || m.note || '记了一笔',
        ico: m.kind === 'meet' ? 'users' : 'heart'
      });
    });
    events.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    events = events.slice(0, 5);

    var eventRows = events.map(function (e) {
      return '<div class="prog-row" style="cursor:default">' +
        '<span class="prog-ico" style="background:var(--pink-soft);color:var(--pink-deep)">' +
          UI.icon(e.ico, 17) + '</span>' +
        '<span class="prog-main">' +
          '<span class="prog-name" style="font-size:13.5px">' + esc(e.text) + '</span>' +
          '<span class="prog-dots"><span class="txt">' + D.md(e.date) + '</span></span>' +
        '</span>' +
      '</div>';
    }).join('');

    var pastCard = '<div class="card">' +
      '<div class="card-title">一起做过的' +
        '<button class="card-link" data-act="go" data-go="past">全部' + UI.icon('right', 12) + '</button>' +
      '</div>' +
      (eventRows || '<div class="empty">还什么都没做过。<br>从上面挑一件，慢慢攒。</div>') +
    '</div>';

    return page(
      '<div class="page-head">' +
        '<h1 class="page-title">一起</h1>' +
        '<p class="page-sub">把想做的事慢慢实现</p>' +
      '</div>' +
      statusRow + wishCard + pastCard,
      true
    );
  };

  /* ============================================================
     兑换（原「积分」页：只管兑换，不再复述账本）
     ============================================================ */
  /* 分值判断：个人愿望全额扣我的分；共同愿望各出一半，且分值必须是偶数 */
  /* 只有「我们俩」的才用共同分；单人的一律用他自己的分 */
  function wishWallet(w) { return w.scope === 'both' ? 'ours' : 'mine'; }
  function wishCheck(w) {
    var cost = wishCost(w);
    if (cost > 10000) return { ok: false, reason: 'nocost', gap: 0, pay: 0 };
    if (w.scope === 'him') return { ok: false, reason: 'his', gap: 0, pay: 0 };
    if (wishWallet(w) === 'mine') {
      var mine = S.pointsOf('me', 'mine');
      return { ok: cost <= mine, gap: cost - mine, pay: cost };
    }
    if (cost % 2 !== 0) return { ok: false, reason: 'odd', gap: 0, pay: 0 };
    var ours = S.pointsOf('me', 'ours');
    return { ok: cost / 2 <= ours, gap: cost / 2 - ours, pay: cost / 2 };
  }
  /* pages-main 与 pages-sub 是两个独立闭包，这里把分值判断交给全局，免得各写一份 */
  global.Wish = { cost: wishCost, costText: wishCostText, wallet: wishWallet, check: wishCheck, rank: wishRank };

  Pages.points = function (st) {
    /* 两个钱包：我们的分（共同）／我的分（个人） */
    var balCard = '<div class="card">' +
      '<div class="pool" style="grid-template-columns:1fr 1fr">' +
        '<div class="pool-cell me"><div class="pool-k">我们的分</div><div class="pool-v">' +
          S.pointsOf('me', 'ours') + '</div></div>' +
        '<div class="pool-cell him"><div class="pool-k">我的分</div><div class="pool-v">' +
          S.pointsOf('me', 'mine') + '</div></div>' +
      '</div>' +
      '<div class="chip-hint" style="margin:12px 0 0">' +
        '「我们的分」兑两个人一起做的事，各出一半；「我的分」兑只属于我的事。</div>' +
    '</div>';

    /* 等点头的兑换申请 */
    var asks = S.db.redemptions.filter(function (r) { return r.status === 'pending'; }).map(function (r) {
      var mine = r.memberId === 'me';
      return '<div class="wish-item">' +
        '<span class="wish-ico" style="background:var(--pink-soft);color:var(--pink-deep)">' +
          UI.icon('heart', 19) + '</span>' +
        '<span class="wish-main">' +
          '<span class="wish-name">' + esc(r.name || '兑换') + '</span>' +
          '<span class="wish-meta">' + (mine ? '你发起 · 等他点头' : '他发起 · 等你点头') + '</span>' +
        '</span>' +
        (mine ? '' : '<button class="wish-btn" data-act="confirm-redeem" data-id="' + esc(r.wishId || '') + '">去确认</button>') +
        '<button class="wish-btn saving" data-act="cancel-redemption" data-id="' + esc(r.id) + '">取消申请</button>' +
      '</div>';
    }).join('');
    var askCard = asks
      ? '<div class="card"><div class="card-title">兑换申请<span class="sub">两个人都点头才扣分</span></div>' + asks + '</div>'
      : '';

    /* 全部想做的事：能兑的永远在最上面，后面按「还差多少」从少到多 */
    function taskOf(w) {
      var chk = wishCheck(w);
      if (w.scope === 'him') return { rank: 4e6, kind: 'his', text: '他来兑', pct: 0 };
      if (chk.reason === 'nocost') return { rank: 3e6, kind: 'nocost', text: '没定分值', pct: 0 };
      if (chk.reason === 'odd') return { rank: 2e6, kind: 'odd', text: '要偶数分', pct: 0 };
      var pay = chk.pay > 0 ? chk.pay : 1;
      if (chk.ok) return { rank: 0, kind: 'ok', text: '去兑换', pct: 100 };
      return {
        rank: 1e6 + chk.gap, kind: 'gap', text: '还差 ' + chk.gap + ' 分',
        pct: Math.max(0, Math.min(99, Math.round((pay - chk.gap) / pay * 100)))
      };
    }

    var tasks = openWishes().map(function (w) { return { w: w, t: taskOf(w) }; })
      .sort(function (a, b) { return a.t.rank - b.t.rank; });

    var taskRows = tasks.map(function (x) {
      var w = x.w, t = x.t;
      var c = S.cat(w.cat === 'together' ? 'relate' : w.cat === 'eat' ? 'life' : 'leisure');
      var whoTag = w.scope === 'both' ? '' :
        '<span class="task-who">' + (w.scope === 'him' ? '他的' : '我的') + '</span>';
      var right = t.kind === 'ok'
        ? (wishWallet(w) === 'ours' ? '<span class="task-gap">各出 ' + wishCheck(w).pay + '</span>' : '') +
          '<button class="wish-btn" data-act="confirm-redeem" data-id="' + w.id + '">去兑换</button>'
        : '<span class="task-gap' + (t.kind === 'his' ? ' off' : '') + '">' + t.text + '</span>';
      var bar = (t.kind === 'ok' || t.kind === 'his') ? '' :
        '<div class="task-bar"><i style="width:' + t.pct + '%;background:' + c.color + '"></i></div>';
      return '<div class="wish-item">' +
        '<span class="wish-ico" style="background:' + UI.rgba(c.color, .18) + ';color:' + UI.shade(c.color) + '">' +
          UI.icon(w.icon || 'star', 19) + '</span>' +
        '<span class="wish-main">' +
          '<span class="task-top"><span class="wish-name">' + esc(w.name || '还没起名') + '</span>' +
            whoTag + right + '</span>' +
          bar +
        '</span>' +
      '</div>';
    }).join('');

    var taskCard = '<div class="card">' +
      '<div class="card-title">想做的事</div>' +
      (taskRows || '<div class="empty">还没有想做的事。<br>去「一起」加一个，再来这里兑。</div>') +
    '</div>';

    /* 兑换记录：一行一条，不展开 */
    var rd = S.db.redemptions.filter(function (r) { return r.status !== 'pending' && r.status !== 'cancelled'; }).slice()
      .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; })
      .slice(0, 5);
    var rdRows = rd.map(function (r) {
      return '<div class="prog-row" style="cursor:default">' +
        '<span class="prog-ico" style="background:var(--pink-soft);color:var(--pink-deep)">' +
          UI.icon('gift', 17) + '</span>' +
        '<span class="prog-main">' +
          '<span class="prog-name" style="font-size:13.5px">' + esc(r.name || '兑换') + '</span>' +
          '<span class="prog-dots"><span class="txt">' +
            (r.wallet === 'ours' ? '一起的 · ' : '我的 · ') + D.md(r.date) + '</span></span>' +
        '</span>' +
      '</div>';
    }).join('');

    var recordCard = '<div class="card">' +
      '<div class="card-title">兑换记录</div>' +
      (rdRows || '<div class="empty">还没兑换过。</div>') +
    '</div>';

    return page(
      '<div class="page-head">' +
        '<h1 class="page-title">兑换</h1>' +
        '<p class="page-sub">攒够分，就把想做的事做掉。</p>' +
      '</div>' +
      balCard + askCard + taskCard + recordCard,
      true
    );
  };

  /* ============================================================
     ④ 回看
     ============================================================ */
  Pages.review = function (st) {
    var t = D.today();
    var month = st.reviewMonth || t.slice(0, 7);
    var sel = st.reviewDay || t;
    var marks = S.dayMarks(month);
    var me = S.member('me'), him = S.member('him');
    var scope = st.reviewScope || 'all';

    /* ----- 月历 ----- */
    var calCard = '<div class="card">' +
      UI.calendar(month, marks, t, sel, st.calPicker) +
    '</div>';

    /* ----- 当日并排预览（复用今天页并排组件，无照片） ----- */
    function miniCol(side) {
      var m = side === 'me' ? me : him;
      var rows = S.entriesOf(side, sel);
      var total = rows.reduce(function (s, e) { return s + e.minutes; }, 0);
      return '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">' +
          UI.avatar(m, 20, 'who') +
          '<span style="font-size:12.5px;color:var(--ink-2)">' + esc(m.name) + '</span>' +
        '</div>' +
        (rows.length
          ? '<div class="entries">' + rows.map(function (e) {
              var c = S.cat(e.categoryId);
              return '<div class="entry" style="padding:7px 0">' +
                '<div class="entry-main">' +
                  '<div class="entry-line1">' +
                    '<span class="entry-time" style="font-size:11.5px">' + esc(e.start) + '</span>' +
                    '<span class="entry-chip" style="background:' + UI.rgba(c.color, .18) + ';color:' + UI.shade(c.color) + ';font-size:10px">' + esc(c.name) + '</span>' +
                  '</div>' +
                  '<div class="entry-text" style="font-size:13px;margin-top:2px">' + esc(e.content) + '</div>' +
                  '<div class="entry-bar" style="margin-top:6px"><i style="width:' +
                    Math.round(e.minutes / (total || 1) * 100) + '%;background:' + c.color + '"></i></div>' +
                '</div>' +
              '</div>';
            }).join('') + '</div>'
          : '<div style="font-size:12px;color:var(--ink-4);padding:14px 0">这天没有记录</div>') +
      '</div>';
    }

    var dayCard = '<div class="card">' +
      '<div class="card-title"><span>' + D.md(sel) +
        (sel === t ? ' · 今天' : ' · ' + D.wd(sel)) +
      '</span><span class="sub">' + (st.reviewScope === 'all' ? '两人并排' : '') + '</span>' +
      '</div>' +
      '<div style="display:flex;gap:16px">' + miniCol('me') + miniCol('him') + '</div>' +
    '</div>';

    /* ----- 时间分布（我／他／我们 三视角） ----- */
    var mStart = month + '-01';
    var mEnd = month + '-31';
    var dist = S.distribution(scope, mStart, mEnd);
    var maxMin = Math.max.apply(null, dist.map(function (d) { return d.minutes; }).concat([1]));

    var bars = dist.filter(function (d) { return d.minutes > 0; }).sort(function (a, b) {
      return b.minutes - a.minutes;
    }).map(function (d) {
      return '<div class="bar-row">' +
        '<span class="bar-ico" style="background:' + UI.rgba(d.color, .2) + ';color:' + UI.shade(d.color) + '">' +
          UI.catIcon(d.id, 14) + '</span>' +
        '<span class="bar-name">' + esc(d.name) + '</span>' +
        '<span class="bar-track"><i style="width:' + Math.round(d.minutes / maxMin * 100) + '%;background:' + d.color + '"></i></span>' +
        '<span class="bar-val">' + D.durShort(d.minutes) + '</span>' +
      '</div>';
    }).join('');

    // 给自己的时间＝成长＋休闲，只报一个合计；本周范围
    var wkFrom = D.shift(t, -((D.parse(t).getDay() + 6) % 7));
    var selfDist = S.distribution(scope, wkFrom, t);
    var selfMin = selfDist.filter(function (d) { return d.id === 'growth' || d.id === 'leisure'; })
      .reduce(function (s, d) { return s + d.minutes; }, 0);

    var scopeTabs = [
      { k: 'all', n: '我们' }, { k: 'me', n: '我' }, { k: 'him', n: '他' }
    ];

    var distCard = '<div class="card">' +
      '<div class="card-title">时间分布' +
        '<span class="mini-tabs" style="margin:0">' + scopeTabs.map(function (x) {
          return '<button class="mini-tab' + (scope === x.k ? ' on' : '') +
            '" data-act="scope" data-k="' + x.k + '">' + x.n + '</button>';
        }).join('') + '</span>' +
      '</div>' +
      (bars ? '<div class="bars">' + bars + '</div>' : '<div class="empty">这个月还没有记录。</div>') +
      '<div class="self-line"><span>给自己的时间 · 本周</span>' +
        '<b>' + (selfMin ? D.dur(selfMin).replace(' 小时 ', 'h').replace(' 分', 'm') : '0m') + '</b></div>' +
    '</div>';

    /* ----- 快乐值 ----- */
    var from = D.shift(t, -6);
    var series = S.happySeries(scope === 'him' ? 'him' : 'me', from, t);
    var lowList = '';
    if (st.happyDay) {
      var lows = S.lowEntries(scope === 'him' ? 'him' : 'me', st.happyDay, st.happyDay);
      lowList = '<div class="low-list">' +
        '<div style="font-size:12px;color:var(--ink-3);margin-bottom:6px">' +
          D.md(st.happyDay) + ' 的低分时段（≤2 分）</div>' +
        (lows.length ? lows.map(function (e) {
          var c = S.cat(e.categoryId);
          return '<div class="low-item">' +
            '<span class="t">' + esc(e.start) + '–' + esc(e.end) + '</span>' +
            '<span>' + esc(e.content) + '</span>' +
            '<span class="c" style="background:' + UI.rgba(c.color, .18) + ';color:' + UI.shade(c.color) + '">' + esc(c.name) + '</span>' +
            '<span class="s">' + e.happy + ' 分</span>' +
          '</div>';
        }).join('') : '<div style="font-size:12.5px;color:var(--ink-4)">这天没有低分记录。</div>') +
      '</div>';
    }

    var hasHappy = series.some(function (x) { return x.value != null; });
    var happyCard = '<div class="card">' +
      '<div class="card-title">快乐值' +
        '<button class="filter-btn' + (st.lowOnly ? ' on' : '') + '" data-act="low-toggle">只看低分时段</button>' +
      '</div>' +
      (hasHappy
        ? UI.happyChart(series, st.happyDay) +
          '<div class="chart-tip">点某一天 → 看那天的低分记录。不做评价，也不扣分。</div>'
        : '<div class="empty">近 7 天还没有快乐值记录。<br>记一笔的时候可以顺手打一个分。</div>') +
      (st.lowOnly ? (function () {
        var lows = S.lowEntries(scope === 'him' ? 'him' : 'me', from, t);
        return '<div class="low-list">' + (lows.length ? lows.map(function (e) {
          var c = S.cat(e.categoryId);
          return '<div class="low-item">' +
            '<span class="t">' + D.md(e.date) + '</span>' +
            '<span>' + esc(e.content) + '</span>' +
            '<span class="c" style="background:' + UI.rgba(c.color, .18) + ';color:' + UI.shade(c.color) + '">' + esc(c.name) + '</span>' +
            '<span class="s">' + e.happy + ' 分</span>' +
          '</div>';
        }).join('') : '<div style="font-size:12.5px;color:var(--ink-4)">近 7 天没有低分记录。</div>') + '</div>';
      })() : '') +
      lowList +
    '</div>';

    return page(
      '<div class="topline">' +
        '<div class="brand">我们</div>' +
        '<div class="topline-date">' + UI.icon('calendar', 17) + '</div>' +
      '</div>' +
      '<div class="page-head">' +
        '<h1 class="page-title">回看</h1>' +
        '<p class="page-sub">没有记录的日子也没关系。</p>' +
      '</div>' +
      calCard + dayCard + distCard + happyCard + DEMO,
      true
    );
  };

  /* ============================================================
     ⑤ 设置
     ============================================================ */
  Pages.settings = function () {
    var me = S.member('me'), him = S.member('him');
    var open = S.db.couple.shareOpen;

    function memberBlock(m, tag) {
      return '<div class="member">' +
        '<button class="member-ava-btn" ' + (m.id==='me' ? 'data-act="pick-avatar" data-id="me" aria-label="换头像"' : 'disabled aria-label="对方头像"') + '>' +
          UI.avatar(m, 62, 'member') +
        '</button>' +
        '<button class="member-nm" ' + (m.id==='me' ? 'data-act="open-edit" data-kind="member" data-id="me"' : 'disabled') + '>' +
          esc(m.name) + '<i>· ' + tag + '</i>' +
          (m.id==='me' ? '<span class="nm-edit">' + UI.icon('edit', 12) + '</span>' : '') +
        '</button>' +
      '</div>';
    }

    var memberCard = '<div class="card">' +
      '<div class="member-card">' +
        memberBlock(me, '我') +
        '<div class="member-mid">' +
          '<span class="h">' + UI.icon('heart', 18) + '</span>' +
          '<span class="conn">两位成员共享这个空间</span>' +
          '<span class="code-row">成员账号已启用 <b></b>' +
            '</span>' +
        '</div>' +
        memberBlock(him, '他') +
      '</div>' +
      '<div class="member-tip">点自己的头像换照片 · 点自己的名字改称呼</div>' +
    '</div>';

    var switchCard = '<div class="switch-card">' +
      '<span class="switch-ico">' + UI.icon('lock', 20) + '</span>' +
      '<span class="switch-main">' +
        '<span class="switch-k">平行空间</span>' +
        '<span class="switch-d">允许他在「今天」看到我的记录</span>' +
        '<span class="switch-h">由你自己决定是否开放</span>' +
      '</span>' +
      '<button class="switch' + (open ? ' on' : '') + '" data-act="share-open" aria-label="平行空间开关"></button>' +
    '</div>';

    var entries = [
      { go: 'palette',  ico: 'palette',  t: '分类与色板',   d: '六域 ＋ 未分类 · 拖动排序全局生效', bg: 'var(--pink-soft)',   fg: 'var(--pink-deep)' }
    ];

    var listHtml = '<div class="list-group">' + entries.map(function (x) {
      return '<button class="list-row" data-act="go" data-go="' + x.go + '">' +
        '<span class="list-ico" style="background:' + x.bg + ';color:' + x.fg + '">' + UI.icon(x.ico, 19) + '</span>' +
        '<span class="list-main"><span class="list-k">' + x.t + '</span>' +
        '<span class="list-d">' + x.d + '</span></span>' +
        '<span class="list-arrow">' + UI.icon('right', 16) + '</span>' +
      '</button>';
    }).join('') + '</div>';

    var backup = '<div class="list-group">' +
      '<button class="list-row" data-act="export">' +
        '<span class="list-ico" style="background:var(--blue-soft);color:var(--blue-ink)">' + UI.icon('cloud', 19) + '</span>' +
        '<span class="list-main"><span class="list-k">数据备份与恢复</span>' +
        '<span class="list-d">导出 JSON · 在顶部导入恢复</span></span>' +
        '<span class="list-arrow">' + UI.icon('right', 16) + '</span>' +
      '</button>' +
      '<button class="list-row" data-act="clear-all">' +
        '<span class="list-ico" style="background:#FBEAEA;color:#C46A6A">' + UI.icon('trash', 19) + '</span>' +
        '<span class="list-main"><span class="list-k" style="color:#C46A6A">清空所有记录</span>' +
        '<span class="list-d">只清记录，成员、情侣码、色板保留</span></span>' +
        '<span class="list-arrow">' + UI.icon('right', 16) + '</span>' +
      '</button>' +
    '</div>';

    return page(
      '<div class="page-head">' +
        '<h1 class="page-title">设置</h1>' +
        '<p class="page-sub">把我们的空间调整成舒服的样子</p>' +
      '</div>' +
      memberCard + '<div class="card" style="padding:14px;margin-bottom:16px">记录和目标可选择仅自己或双方可见；愿望等共同内容双方可见。旧记录默认双方可见。</div>' + listHtml + backup +
      '<div class="page-foot">没有连续打卡，也没有扣分。</div>' +
      DEMO,
      true
    );
  };

  global.Pages = Pages;
})(window);


/* ============================================================
   pages-sub.js
   ============================================================ */
/* ============================================================
   「我们」系统 · ⑥ 记一笔 ＋ ⑦–⑭ 功能页
   ============================================================ */
(function (global) {
  'use strict';

  var S = global.Store, UI = global.UI, D = S.D;
  var Pages = global.Pages || {};
  var W = global.Wish || {};
  var wishCost = W.cost, wishCostText = W.costText, wishWallet = W.wallet, wishCheck = W.check;
  var wishRank = W.rank || function () { return 0; };

  function esc(s) { return UI.esc(s); }
  function sub(html) { return '<div class="page"><div class="sub-wrap">' + html + '</div></div>'; }

  var DEMO = '<div class="page-foot">演示数据不是设计 · 分值以「待定」占位</div>';

  /* ============================================================
     ⑥ 记一笔（底部弹层）
     ============================================================ */
  Pages.addSheet = function (st) {
    var f = st.form || {};
    var start = f.start || '14:20';
    var end = f.end || '17:00';
    var guess = guessByTime(D.hm(start));
    var pick = f.categoryId;
    if (pick === undefined) pick = null;

    var mins = D.minutes(start, end);
    var cats = S.db.categories.filter(function (c) { return c.id !== 'none'; });

    var chips = cats.map(function (c) {
      var on = pick === c.id;
      return '<button class="chip-cat' + (on ? ' on' : '') + '" data-act="pick-cat" data-id="' + c.id + '">' +
        '<span class="cdot" style="background:' + c.color + '"></span>' + esc(c.name) +
      '</button>';
    }).join('');

    var happy = f.happy;
    var happyHtml = [1, 2, 3, 4, 5].map(function (n) {
      return '<button class="happy-dot' + (happy === n ? ' on' : '') + '" data-act="happy" data-n="' + n + '">' + n + '</button>';
    }).join('');

    return '<div class="sheet-mask" data-act="close-sheet">' +
      '<div class="sheet" data-sheet="1">' +
        '<div class="sheet-grip"></div>' +
        '<div class="sheet-head">' +
          '<div class="sheet-title">' + (f.editId ? '改一笔' : '记一笔') + '</div>' +
          '<button class="sheet-x" data-act="close-sheet">' + UI.icon('x', 18) + '</button>' +
        '</div>' +

        '<div class="field">' +
          '<div class="field-k">时间段</div>' +
          '<div class="time-row">' +
            '<div class="time-box"><div class="tk">开始</div>' +
              '<input type="time" class="time-input" id="f-start" value="' + esc(start) + '"></div>' +
            '<div class="time-box"><div class="tk">结束</div>' +
              '<input type="time" class="time-input" id="f-end" value="' + esc(end) + '"></div>' +
            '<div class="time-box time-dur"><div class="tk">时长</div>' +
              '<div class="dv" id="f-dur">' + D.dur(mins) + '</div></div>' +
          '</div>' +
        '</div>' +

        '<div class="field">' +
          '<div class="field-k">干了什么</div>' +
          '<textarea class="textarea" id="f-content" maxlength="100" ' +
            'placeholder="写具体一点，比如“刷招聘网站”而不是“找工作”">' + esc(f.content || '') + '</textarea>' +
          '<div class="textarea-foot"><span class="count-badge" id="f-count">' +
            (f.content ? f.content.length : 0) + '/100</span></div>' +
        '</div>' +

        '<div class="field">' +
          '<div class="field-k">分类<i>选填</i></div>' +
          '<div class="chips" id="f-chips">' + chips + '</div>' +
          '<div class="chip-hint">可以不选分类，先记下来。</div>' +
        '</div>' +

        '<div class="field"><div class="field-k">计入目标<i>选填</i></div>' +
          '<select id="f-goal" class="textarea" style="min-height:0;padding:12px 14px">' +
            '<option value="">不计入目标</option>' +
            S.db.goals.filter(function(g){return (g.memberId==='me'||g.scope==='both') && (g.status==='active' || g.id===f.goalId);}).map(function(g){return '<option value="'+esc(g.id)+'"'+(f.goalId===g.id?' selected':'')+'>'+esc(g.name)+'</option>';}).join('') +
          '</select></div>' +

        '<div class="field"><div class="field-k">谁可以看到</div><select id="f-visibility" class="textarea" style="min-height:0;padding:12px 14px">' +
          '<option value="private"' + (f.visibility==='private'?' selected':'') + '>仅自己</option>' +
          '<option value="shared"' + (f.visibility!=='private'?' selected':'') + '>双方可见</option></select></div>' +

        '<div class="field">' +
          '<div class="field-k">备注<i>选填</i></div>' +
          '<input class="textarea" style="min-height:0;padding:12px 14px" id="f-note" ' +
            'placeholder="身体信号…" value="' + esc(f.note || '') + '">' +
        '</div>' +

        '<div class="field">' +
          '<div class="field-k">今天的快乐值<i>选填</i></div>' +
          '<div class="happy-row">' + happyHtml + '</div>' +
          '<div class="chip-hint">低分的时段会在回看页单独列出来</div>' +
        '</div>' +

        '<button class="btn-primary" data-act="save-entry">' +
          (f.editId ? '保存修改' : '保存记录') + '</button>' +
        (f.editId
          ? '<button class="btn-ghost" style="margin-top:10px" data-act="delete-entry" data-id="' +
              f.editId + '">删除这条记录</button>'
          : '') +
        '<div class="foot-line">' +
          (f.editId ? '改错了也没关系，随时可以再改。' : '记下来，就已经很好。') + '</div>' +
      '</div>' +
    '</div>';
  };

  function guessByTime(hm) {
    var h = Math.floor((hm || 0) / 60);
    if (h < 7) return 'health';
    if (h < 9) return 'health';
    if (h < 12) return 'relate';
    if (h < 14) return 'health';
    if (h < 18) return 'career';
    if (h < 20) return 'life';
    if (h < 23) return 'leisure';
    return 'health';
  }

  /* ============================================================
     ⑦ 长期目标
     ============================================================ */
  Pages.goals = function () {
    var goals = S.db.goals.filter(function (g) { return g.memberId === 'me' || g.scope === 'both'; });
    var active = goals.filter(function (g) { return g.status === 'active'; });
    var ownActive = active.filter(function (g) { return g.memberId === 'me'; });

    var cards = active.map(function (g) {
      var c = S.cat(g.categoryId);
      var kws = g.keywords.map(function (k) {
        return '<span class="kw ' + (g.icon === 'run' ? 'pink' : 'blue') + '">' + esc(k) + '</span>';
      }).join('');
      return '<div class="goal-card">' +
        '<div class="goal-head">' +
          '<span class="goal-ico">' + UI.icon(g.icon, 20) + '</span>' +
          '<span class="goal-name">' + esc(g.name) + '</span>' +
          (g.memberId === 'me' ? '<button class="goal-edit" data-act="open-edit" data-kind="goal" data-id="' + g.id + '">' + UI.icon('edit', 17) + '</button>' : '<span class="goal-stat">共同目标 · 对方创建</span>') +
        '</div>' +
        '<div class="kv"><span class="kv-k">归属分类</span><span class="kv-v">' +
          '<span class="kw" style="background:' + UI.rgba(c.color, .2) + ';color:' + UI.shade(c.color) + '">' +
            c.name + '</span></span></div>' +
        '<div class="kv"><span class="kv-k">每周次数</span><span class="kv-v">每周 ' + g.timesPerWeek + ' 次</span></div>' +
        '<div class="kv"><span class="kv-k">每次打卡</span><span class="kv-v">' + (g.pointsPerCheckin || 0) + ' 分</span></div>' +
        (g.reminderTime ? '<div class="kv"><span class="kv-k">每日提醒</span><span class="kv-v">' + esc(g.reminderTime) + '</span></div>' : '') +
        '<div class="goal-foot">' +
          '<span class="goal-stat">本周我打卡 ' + S.goalProgress(g) + '/' + g.timesPerWeek + ' · 进行中</span>' +
          '<span class="goal-btns">' +
            (g.memberId === 'me' ? '<button class="btn-mini" data-act="goal-done" data-id="' + g.id + '">' + UI.icon('check', 13) + '结束目标</button>' +
            '<button class="btn-mini ghost" data-act="goal-drop" data-id="' + g.id + '">' + UI.icon('trash', 13) + '放弃</button>' : '') +
          '</span>' +
        '</div>' +
      '</div>';
    }).join('');

    var prog = active.map(function (g) {
      var c = S.cat(g.categoryId);
      var dots = '';
      for (var i = 0; i < g.timesPerWeek; i++) {
        dots += '<span class="dot-s' + (i < S.goalProgress(g) ? ' on' : '') +
          '" style="color:' + c.color + '"></span>';
      }
      return '<div class="prog-row">' +
        '<span class="prog-ico" style="background:' + UI.rgba(c.color, .18) + ';color:' + UI.shade(c.color) + '">' +
          UI.icon(g.icon, 18) + '</span>' +
        '<span class="prog-main"><span class="prog-name">' + esc(g.name) + '</span></span>' +
        '<span class="prog-dots">' + dots +
          '<span class="txt">' + S.goalProgress(g) + '/' + g.timesPerWeek + '</span></span>' +
      '</div>';
    }).join('');

    var settle = S.db.weekly_settlements[0];

    return sub(
      UI.subHead('今天', '我的长期目标', ownActive.length + '/3') +
      '<div class="sub-lead">最多 3 个 · 记录目标进度</div>' +
      cards +
      (ownActive.length < 3
        ? '<button class="add-block" data-act="goal-add">' + UI.icon('plus', 15) +
          '新增长期目标 · ' + ownActive.length + '/3</button>'
        : '<div class="tip-band">' + UI.icon('lock', 14) + '已经 3 个了。先完成或放弃一个，再加新的。</div>') +
      '<div class="card">' +
        '<div class="card-title">本周进度<span class="sub">只显示自己</span></div>' +
        (prog || '<div class="empty">还没有进行中的目标。</div>') +
        (settle ? '<div class="settle-row">' + UI.icon('calendar', 14) +
          '<span>上周已结算：<b>' + esc(settle.text) + ' +' + esc(settle.label) + '分</b></span></div>' : '') +
      '</div>' +
      '<div class="page-foot">完成或不想做了可以归档，历史记录保留</div>'
    );
  };

  /* ============================================================
     ⑧ 愿望兑换
     ============================================================ */
  Pages.redeem = function (st) {
    var w = S.db.wishlist.filter(function (x) { return x.id === (st.params || {}).id; })[0] ||
            S.db.wishlist[0];
    if (!w) {
      return sub(
        UI.subHead('一起', '愿望兑换', '') +
        '<div class="card"><div class="empty">还没有愿望。<br>去「愿望清单管理」加一个想一起做的事。</div></div>' +
        '<button class="btn-ghost" data-act="go" data-go="wishlist">去愿望清单管理</button>'
      );
    }
    var c = S.cat(w.cat === 'together' ? 'relate' : w.cat === 'eat' ? 'life' : 'leisure');

    var flow = '<div class="flow">' +
      '<div class="flow-step">' +
        '<div class="flow-ico" style="background:var(--pink-soft);color:var(--pink-deep)">' + UI.icon('check', 20) + '</div>' +
        '<div class="flow-k">兑换成功</div>' +
        '<div class="flow-d">扣除相应积分<br>完成愿望愿望</div>' +
      '</div>' +
      '<div class="flow-arrow">' + UI.icon('right', 14) + '</div>' +
      '<div class="flow-step">' +
        '<div class="flow-ico" style="background:var(--blue-soft);color:var(--blue-ink)">' + UI.icon('calendar', 20) + '</div>' +
        '<div class="flow-k">一起去完成</div>' +
        '<div class="flow-d">按计划一起<br>享受这段时光</div>' +
      '</div>' +
      '<div class="flow-arrow">' + UI.icon('right', 14) + '</div>' +
      '<div class="flow-step">' +
        '<div class="flow-ico" style="background:var(--green-soft);color:#5F8F58">' + UI.icon('speech', 20) + '</div>' +
        '<div class="flow-k">记入时间线</div>' +
        '<div class="flow-d">真正完成后<br>才生成时间线节点</div>' +
      '</div>' +
    '</div>';

    return sub(
      UI.subHead('一起', '', '') +
      '<div class="card" style="text-align:center;padding:22px">' +
        '<div style="width:56px;height:56px;border-radius:50%;margin:0 auto 12px;background:' +
          UI.rgba(c.color, .18) + ';color:' + UI.shade(c.color) +
          ';display:flex;align-items:center;justify-content:center">' + UI.icon(w.icon || 'star', 26) + '</div>' +
        '<div style="font-family:var(--serif);font-size:21px;font-weight:600;letter-spacing:.6px">' + esc(w.name) + '</div>' +
        '<div style="font-size:12.5px;color:var(--ink-3);margin-top:6px">' +
          (w.scope === 'me' ? '只属于我 · ' : '') + esc(w.executorLabel) + '执行</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-title">需要积分' +
          '<span style="font-family:var(--serif);font-size:20px;font-weight:600;color:var(--pink-deep)">' +
            w.pointsLabel + '分</span></div>' +
        '<div class="pool" style="grid-template-columns:1fr 1fr">' +
          '<div class="pool-cell me"><div class="pool-k">' + (wishWallet(w)==='mine'?'我的分':'我们的分') + '</div><div class="pool-v">' + S.pointsOf('me',wishWallet(w)) + '</div></div>' +
          '<div class="pool-cell sum"><div class="pool-k">还差</div><div class="pool-v">' + Math.max(0, wishCheck(w).gap) + '</div></div>' +
        '</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-title">本次积分消耗<span class="sub">' + (wishWallet(w)==='mine'?'由我自己支付':'两个人各一半') + '</span></div>' +
        (wishWallet(w)==='mine'
          ? '<div class="pay-row me"><span class="ava">' + UI.icon('heart', 13) + '</span><span>从我的分扣除</span><span class="v">' + esc(w.pointsLabel) + '分</span></div>'
          : '<div class="pay-row me"><span class="ava">' + UI.icon('heart', 13) + '</span><span>我出</span><span class="v">' + (wishCost(w)/2) + '分</span></div>' +
            '<div class="pay-row me"><span class="ava">' + UI.icon('heart', 13) + '</span><span>他出</span><span class="v">' + (wishCost(w)/2) + '分</span></div>') +
        '<div class="chip-hint" style="margin-top:10px">' + (wishWallet(w)==='mine'?'确认后立刻从我的分里扣除。':'发出后要他也点头才扣分。') + '</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-title">兑换流程</div>' +
        flow +
        '<div class="tip-band" style="margin:14px 0 0">' + UI.icon('star', 14) +
          '真正完成后才生成时间线节点</div>' +
      '</div>' +

      '<div class="btn-row">' +
        '<button class="btn-primary" data-act="confirm-redeem" data-id="' + w.id + '">' + (wishWallet(w)==='mine'?'确认兑换 · ':'发出兑换申请 · ') + esc(w.pointsLabel) + '分</button>' +
        '<button class="btn-ghost" data-act="back">再想想</button>' +
      '</div>'
    );
  };

  /* ============================================================
     ⑨ 故事接龙
     ============================================================ */
  Pages.story = function (st) {
    var last = S.storyLast();
    var txt = (st.storyDraft || '');

    return sub(
      UI.subHead('一起', '我们的故事接龙', '') +
      '<div class="sub-lead">不用同时在线，也能一起写完一个故事。</div>' +

      (last ? '<div class="prev-card">' +
        '<div class="prev-head">' +
          '<span class="ico">' + UI.icon('speech', 13) + '</span>' +
          '<span>上一段 · ' + esc(S.member(last.memberId).name) + '写于' + D.md(last.date) + '</span>' +
        '</div>' +
        '<div class="prev-body">' + esc(last.text) + '</div>' +
      '</div>' : '') +

      '<div class="turn-badge">' + UI.icon('heart', 13) + '轮到你续写啦</div>' +

      '<div class="write-card">' +
        '<textarea class="write-area" id="story-input" maxlength="60" ' +
          'placeholder="接着上一段往下写 1–3 句…">' + esc(txt) + '</textarea>' +
        '<div class="write-foot">' +
          '<span class="write-count" id="story-count">写 1–3 句就好 · ' + txt.length + '/60</span>' +
          '<button class="spark-btn" data-act="spark">' + UI.icon('sparkle', 13) + '换个灵感（可选）</button>' +
        '</div>' +
      '</div>' +

      '<div class="point-band">' +
        '<span class="icon">' + UI.icon('star', 15) + '</span>' +
        '<span><span class="k">一起把故事慢慢写下去</span>' +
        '<span class="d">不需要每天写，想到了再继续</span></span>' +
      '</div>' +

      '<div class="btn-row">' +
        '<button class="btn-primary" data-act="publish">发布这一段</button>' +
        '<button class="btn-ghost" data-act="go" data-go="storyFull">查看整篇故事</button>' +
      '</div>' +
      '<div class="foot-line">🔴 统一用第三人称，接龙才能连成一篇。</div>'
    );
  };

  /* ============================================================
     ⑩ 奖励清单
     ============================================================ */
  Pages.rewards = function () {
    var tiers = [
      { k: 'small', n: '小奖励', d: '5–20 分 · 适合日常的小惊喜', ico: 'gift',  bg: 'var(--pink-soft)', fg: 'var(--pink-deep)' },
      { k: 'mid',   n: '中奖励', d: '40–60 分 · 值得一起期待的时刻', ico: 'gift', bg: 'var(--blue-soft)', fg: 'var(--blue-ink)' },
      { k: 'big',   n: '大奖励', d: '100 分以上 · 为重要的时刻攒分', ico: 'plane', bg: 'var(--pink-soft)', fg: 'var(--pink-deep)' }
    ];

    var groups = tiers.map(function (t) {
      var list = S.db.rewards.filter(function (r) { return r.tier === t.k; });
      var icos = { small: ['cup', 'heart'], mid: ['calendar'], big: ['plane'] };
      return '<div class="reward-group">' +
        '<div class="reward-head">' +
          '<span class="reward-ico" style="background:' + t.bg + ';color:' + t.fg + '">' + UI.icon(t.ico, 17) + '</span>' +
          '<span class="reward-k">' + t.n + '</span>' +
          '<span class="reward-d">' + t.d + '</span>' +
        '</div>' +
        (list.length ? list.map(function (r, i) {
          var ic = (icos[t.k] || ['gift'])[i % (icos[t.k] || ['gift']).length];
          return '<div class="reward-item">' +
            '<span class="ri" style="background:' + UI.rgba(t.k === 'mid' ? '#A7C7EC' : '#F2A6AC', .2) +
              ';color:' + UI.shade(t.k === 'mid' ? '#A7C7EC' : '#F2A6AC') + '">' + UI.icon(ic, 16) + '</span>' +
            '<span class="rm">' + esc(r.name) + '</span>' +
            '<span class="rp">' + esc(r.pointsLabel) + '分 · ' + esc(r.executorLabel) + '</span>' +
            '<button class="wish-btn" data-act="redeem-reward" data-id="' + r.id + '">兑换</button>' +
            '<button class="re" data-act="open-edit" data-kind="reward" data-id="' + r.id + '">' +
              UI.icon('edit', 15) + '</button>' +
          '</div>';
        }).join('') : '<div class="empty">这一档还没有奖励。</div>') +
      '</div>';
    }).join('');

    return sub(
      UI.subHead('积分', '奖励清单', '') +
      '<div class="tip-band" style="justify-content:center">' + UI.icon('star', 14) +
        '先写谁来执行，再设置需要多少分</div>' +
      groups +
      '<div class="card" style="padding:14px 16px">' +
        '<div style="font-size:12px;color:var(--ink-3);line-height:1.8">' +
          '· 奖励是没有对应具体愿望的行为；想一起做的事，去愿望清单添加。<br>' +
          '· 奖励只记录可以执行的事，不是购物清单。' +
        '</div>' +
      '</div>' +
      '<button class="add-block" data-act="reward-add">' + UI.icon('plus', 15) + '新增奖励</button>' +
      DEMO
    );
  };

  /* ============================================================
     ⑪ 分类与色板
     ============================================================ */
  Pages.palette = function () {
    var cats = S.db.categories;
    var rows = cats.map(function (c, i) {
      return '<div class="cat-item" data-cat="' + c.id + '" draggable="true">' +
        '<span class="grip" data-act="cat-up" data-id="' + c.id + '" title="点一下上移 · 桌面可直接拖动">' +
          '<i></i><i></i><i></i></span>' +
        '<label class="swatch" style="background:' + c.color + '">' +
          (c.locked ? UI.icon('lock', 13) : '') +
          '<input type="color" value="' + c.color + '" data-color-act="cat-color" data-id="' + c.id + '">' +
        '</label>' +
        '<span class="cat-main"><span class="cat-name">' + esc(c.name) + '<i>' + esc(c.desc) + '</i></span></span>' +
        '<button class="cat-edit" data-act="open-edit" data-kind="cat" data-id="' + c.id + '">' +
          UI.icon('edit', 16) + '</button>' +
      '</div>';
    }).join('');

    var dist = S.distribution('all', D.shift(D.today(), -6), D.today());

    return sub(
      UI.subHead('设置', '分类与色板', '') +
      '<div class="card" style="padding:8px 18px">' + rows + '</div>' +
      '<button class="add-block" data-act="cat-add">' + UI.icon('plus', 15) + '新增自定义分类</button>' +
      '<div class="card">' +
        '<div class="card-title">预览今天的色块</div>' +
        UI.stack(dist) +
        UI.legend(dist, false) +
      '</div>' +
      '<div class="page-foot">改颜色只影响展示，不影响原始记录。</div>' +
      '<button class="btn-primary" style="margin-top:10px" data-act="back">完成</button>'
    );
  };

  /* ============================================================
     ⑫ 见面安排
     ============================================================ */
  Pages.meet = function () {
    var t = D.today();
    var next = S.nextMeet();
    var cd = next ? D.diffDays(t, next.date) : null;
    var past = S.pastMeets();

    var countCard = '<div class="count-card">' +
      '<div class="count-main">' +
        '<div class="count-k">距下次见面</div>' +
        '<div class="count-v">' + (cd == null ? '—' : cd) + '<em>' + (cd == null ? '还没定' : '天') + '</em></div>' +
        '<div class="count-date">' + (next ? D.parse(next.date).getFullYear() + ' 年 ' +
          (D.parse(next.date).getMonth() + 1) + ' 月 ' + D.parse(next.date).getDate() + ' 日 · ' +
          D.wd(next.date) : '还没有安排下一次见面') + '</div>' +
        '<div class="count-note">期待把“晚安”变成“见面”。</div>' +
      '</div>' +
      '<span class="count-ico">' + UI.icon('calendar', 30) + '</span>' +
    '</div>';

    var pastHtml = past.map(function (m, i) {
      var side = i % 2 === 0 ? 'me' : 'him';
      return '<div class="tline-item ' + (side === 'him' ? 'him' : '') + '">' +
        '<div class="tline-date">' + D.md(m.date) + ' · ' + esc(m.title) + '</div>' +
        '<div class="tline-text" style="color:var(--ink-2);font-size:13px">' + esc(m.note || '') + '</div>' +
      '</div>';
    }).join('');

    return sub(
      UI.subHead('设置', '见面安排', '') +
      '<div class="sub-lead">把下一次见面放在看得见的地方。</div>' +
      countCard +
      '<div class="card">' +
        '<div class="card-title">计划见面日期</div>' +
        '<div class="form-line">' + UI.icon('calendar', 17) +
          '<input type="date" id="meet-date" value="' + (next ? next.date : t) + '"></div>' +
        '<div class="field" style="margin:16px 0 0">' +
          '<div class="field-k">这次想做些什么<i>选填</i></div>' +
          '<textarea class="textarea" id="meet-plan" maxlength="100" ' +
            'placeholder="一起去吃那家一直想去的餐厅">' + esc(next ? (next.plan || '') : '') + '</textarea>' +
        '</div>' +
        '<button class="btn-primary" style="margin-top:14px" data-act="save-meet">保存见面安排</button>' +
      '</div>' +
      '<div class="card">' +
        '<div class="card-title">曾经见面的日子</div>' +
        (past.length ? '<div class="tline">' + pastHtml + '</div>' : '<div class="empty">还没有记录。</div>') +
      '</div>' +
      '<div class="page-foot">这些日子也会出现在回看的时间线里。</div>'
    );
  };

  /* ============================================================
     ⑬ 故事成篇
     ============================================================ */
  Pages.storyFull = function () {
    var list = S.storySorted();
    var segs = list.map(function (s) {
      var m = S.member(s.memberId);
      return '<div class="story-seg ' + (s.memberId === 'him' ? 'him' : '') + '">' +
        '<div class="seg-card">' +
          '<span class="seg-who ' + s.memberId + '">' + UI.icon('heart', 11) +
            esc(m.name) + ' · ' + D.md(s.date) + '</span>' +
          '<div class="seg-text">' + esc(s.text) + '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    var nodeN = S.db.milestones.filter(function (m) { return m.kind !== 'meet'; }).length;

    return sub(
      UI.subHead('回看', '我们的一篇', '') +
      '<div class="sub-lead">由' + esc(S.member('me').name) + '与' + esc(S.member('him').name) +
        '，一句一句写成。</div>' +
      (list.length >= 4
        ? '<div class="story-flow">' + segs + '</div>'
        : '<div class="card"><div class="empty">接龙满 4 段才成篇。<br>现在还差 ' + (4 - list.length) + ' 段。</div></div>') +
      '<div class="card">' +
        '<div class="sum-row">' +
          '<span class="sum-ico" style="background:var(--pink-soft);color:var(--pink-deep)">' + UI.icon('speech', 17) + '</span>' +
          '<span class="sum-main"><span class="sum-k">接龙 ' + list.length + ' 段</span>' +
            '<span class="sum-d">由你们一人一句，慢慢接成</span></span>' +
        '</div>' +
        '<div class="sum-row">' +
          '<span class="sum-ico" style="background:var(--blue-soft);color:var(--blue-ink)">' + UI.icon('clock', 17) + '</span>' +
          '<span class="sum-main"><span class="sum-k">时间线 ' + nodeN + ' 个节点</span>' +
            '<span class="sum-d">记录这个月重要的几次时刻</span></span>' +
        '</div>' +
      '</div>' +
      '<div class="btn-duo">' +
        '<button class="btn-primary" style="padding:13px;font-size:14px" data-act="copy-story">' +
          UI.icon('copyall', 15) + ' 复制全文</button>' +
        '<button class="btn-blue" style="padding:13px;font-size:14px" data-act="export-story">' +
          UI.icon('download', 15) + ' 导出故事</button>' +
      '</div>' +
      '<div class="foot-line">第三人称：她和他，才连得成一篇。</div>'
    );
  };

  /* ============================================================
     做过的（一起页第三段点进来）：完整时间线 + 我们的故事
     ============================================================ */
  Pages.past = function () {
    var today = D.today();
    var items = [];

    S.db.milestones.forEach(function (m) {
      items.push({
        date: m.date, title: m.title || m.note || '记了一笔',
        ico: m.kind === 'meet' ? 'users' : m.kind === 'goal' ? 'target' : 'heart'
      });
    });
    S.db.redemptions.forEach(function (r) {
      if (r.status === 'pending' || r.status === 'cancelled' || r.wallet !== 'ours') return;
      items.push({ date: r.date, title: r.name || '兑换', ico: 'gift' });
    });
    items.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });

    var next = items.filter(function (x) { return x.date > today; }).reverse();
    var done = items.filter(function (x) { return x.date <= today; });

    function row(x) {
      return '<div class="tline-item">' +
        '<div class="tline-date">' + D.md(x.date) + '<span class="wd">' + D.wd(x.date) + '</span></div>' +
        '<div class="tline-text">' + esc(x.title) + '</div>' +
      '</div>';
    }

    var meetBtn = '<button class="add-block" data-act="go" data-go="meet">' +
      UI.icon('plus', 15) + '安排下次见面</button>';

    var nextCard = '<div class="card">' +
      '<div class="card-title">还没到的' + (next.length ? '<span class="sub">' + next.length + ' 个</span>' : '') + '</div>' +
      (next.length ? '<div class="tline">' + next.map(row).join('') + '</div>'
        : '<div class="empty">还没安排下次见面。</div>') +
      meetBtn +
    '</div>';

    var doneCard = '<div class="card">' +
      '<div class="card-title">时间线<span class="sub">' + done.length + ' 个节点</span></div>' +
      (done.length ? '<div class="tline">' + done.map(row).join('') + '</div>'
        : '<div class="empty">还什么都没做过。<br>从想做的事里挑一件，慢慢攒。</div>') +
    '</div>';

    /* 故事接龙暂放在这一页的末尾：它属于「我们一起造的东西」，不属于回看 */
    var storyN = S.db.story_entries.length;
    var storyCard = '<div class="card">' +
      '<div class="card-title">我们的故事<span class="sub">' + storyN + ' 段</span>' +
        (storyN ? '<button class="card-link" data-act="go" data-go="storyFull">查看整篇' + UI.icon('right', 12) + '</button>' : '') +
      '</div>' +
      '<div class="sum-row" data-act="go" data-go="story" style="cursor:pointer">' +
        '<span class="sum-ico" style="background:var(--pink-soft);color:var(--pink-deep)">' + UI.icon('speech', 17) + '</span>' +
        '<span class="sum-main">' +
          '<span class="sum-k">' + (storyN ? '接龙 ' + storyN + ' 段' : '还没开始') + '</span>' +
          '<span class="sum-d">' + (storyN ? '一人一句，接着往下写' : '谁先写第一句都行') + '</span>' +
        '</span>' +
        '<span class="sum-go">' + UI.icon('right', 14) + '</span>' +
      '</div>' +
      '<button class="add-block" data-act="go" data-go="story">' +
        UI.icon('plus', 15) + (storyN ? '接着写一段' : '写第一句') + '</button>' +
    '</div>';

    return sub(
      UI.subHead('一起', '做过的', '') +
      '<div class="sub-lead">一起做成的、去过的、见面的，都在这里。</div>' +
      nextCard + doneCard + storyCard +
      DEMO
    );
  };


  /* ============================================================
     ⑭ 愿望清单管理
     ============================================================ */
  Pages.wishlist = function () {
    /* 做完了就离开这张单子，去下面的「已经做过的」 */
    function isDone(w) { return w.status === 'redeemed' || w.status === 'done'; }
    function doneDate(w) {
      var r = S.db.redemptions.filter(function (x) { return x.wishId === w.id; })[0];
      return r && r.date ? D.md(r.date) : '';
    }
    function who(w) {
      return w.scope === 'both' ? '我们一起' : w.scope === 'him' ? '他的' : '我的';
    }
    function catOf(w) {
      return S.cat(w.cat === 'together' ? 'relate' : w.cat === 'eat' ? 'life' : 'leisure');
    }

    var open = S.db.wishlist.filter(function (w) { return !isDone(w); });
    /* 一起的：按离能兑最近排 */
    var shared = open.filter(function (w) { return w.scope === 'both'; })
      .sort(function (a, b) { return wishRank(a) - wishRank(b); });
    /* 单人的：我的在前、他的在后，各自按分值 */
    var single = open.filter(function (w) { return w.scope !== 'both'; })
      .sort(function (a, b) {
        var ka = a.scope === 'me' ? 0 : 1, kb = b.scope === 'me' ? 0 : 1;
        return (ka - kb) || (wishRank(a) - wishRank(b));
      });

    function openRow(w) {
      var c = catOf(w), mine = w.scope !== 'him';
      return '<div class="wi-row">' +
        '<span class="wi-ico" style="background:' + UI.rgba(c.color, .18) + ';color:' + UI.shade(c.color) + '">' +
          UI.icon(w.icon || 'star', 19) + '</span>' +
        '<span class="wi-main"><span class="wi-name">' + esc(w.name) + '</span>' +
          '<span class="wi-meta">' + esc(who(w)) + ' · ' + wishCostText(w) + '</span></span>' +
        '<button class="wi-edit" data-act="open-edit" data-kind="wish" data-id="' + w.id + '">' +
          UI.icon('edit', 15) + '</button>' +
        (mine
          ? '<button class="wi-btn saving" data-act="redeem" data-id="' + w.id + '">去兑换' + UI.icon('right', 12) + '</button>'
          : '<span class="wi-btn his" title="这是对方的愿望，用他自己的分兑">他来兑</span>') +
      '</div>';
    }

    function doneRow(w) {
      return '<div class="wi-row wi-done">' +
        '<span class="wi-ico" style="background:var(--gray-soft);color:var(--ink-3)">' +
          UI.icon(w.icon || 'star', 19) + '</span>' +
        '<span class="wi-main"><span class="wi-name">' + esc(w.name) + '</span>' +
          '<span class="wi-meta">' + esc(who(w)) + ' · ' + esc(w.pointsLabel) + ' 分' +
            (doneDate(w) ? ' · ' + doneDate(w) : '') + '</span></span>' +
      '</div>';
    }

    function section(title, list, row, emptyText) {
      return '<div class="wl-sec">' +
        '<div class="wl-sec-head">' + title + '<span class="n">' + list.length + '</span></div>' +
        (list.length ? list.map(row).join('') : '<div class="empty" style="padding:10px 0">' + emptyText + '</div>') +
      '</div>';
    }

    var listCard = '<div class="card">' +
      '<div class="card-title">想做的' +
        '<button class="wg-add" style="background:var(--pink-soft);color:var(--pink-deep)" data-act="wish-add">' +
          UI.icon('plus', 12) + '新增愿望</button>' +
      '</div>' +
      section('一起的', shared, openRow, '还没有两个人一起做的事。') +
      section('单人的', single, openRow, '还没有只属于一个人的事。') +
    '</div>';

    var doneAll = S.db.wishlist.filter(isDone);
    var doneShared = doneAll.filter(function (w) { return w.scope === 'both'; });
    var doneSingle = doneAll.filter(function (w) { return w.scope !== 'both'; });

    var doneCard = doneAll.length ? '<div class="card">' +
      '<div class="card-title">已经做过的<span class="sub">' + doneAll.length + ' 件</span></div>' +
      section('一起的', doneShared, doneRow, '') +
      section('单人的', doneSingle, doneRow, '') +
    '</div>' : '';

    return sub(
      UI.subHead('设置', '愿望清单管理', '') +
      '<div class="sub-lead">一起的、各自的分开记，做完了就往下走。</div>' +
      listCard +
      doneCard +
      '<div class="tip-band" style="align-items:flex-start">' + UI.icon('star', 14) +
        '<span>一起的用共同分，各出一半；单人的用他自己的分，只有本人能兑。<br>' +
        '没有对应具体愿望的行为，去奖励清单。</span></div>' +
      DEMO
    );
  };

  /* ============================================================
     通用编辑弹层（长期目标 / 奖励 / 愿望）
     ============================================================ */
  Pages.editSheet = function (st) {
    var ed = st.edit || {};
    var kind = ed.kind;
    var r = ed.rec || {};
    var isNew = !!ed.isNew;
    var cats = S.db.categories.filter(function (c) { return c.id !== 'none'; });

    var titleMap = { goal: '长期目标', reward: '奖励', wish: '愿望', cat: '分类', member: '名字' };
    var title = (isNew ? '新增' : '编辑') + (titleMap[kind] || '');

    function field(k, inner, hint) {
      return '<div class="field"><div class="field-k">' + k + '</div>' + inner +
        (hint ? '<div class="chip-hint">' + hint + '</div>' : '') + '</div>';
    }
    function input(id, val, ph) {
      return '<input class="input-box" id="' + id + '" value="' + esc(val) + '" placeholder="' + esc(ph) + '">';
    }
    function chipsCat(cur) {
      return '<div class="chips">' + cats.map(function (c) {
        return '<button class="chip-cat' + (cur === c.id ? ' on' : '') +
          '" data-act="pick-field" data-f="categoryId" data-v="' + c.id + '">' +
          '<span class="cdot" style="background:' + c.color + '"></span>' + esc(c.name) + '</button>';
      }).join('') + '</div>';
    }
    function chipsPick(f, cur, opts) {
      return '<div class="chips">' + opts.map(function (o) {
        return '<button class="chip-cat' + (cur === o[0] ? ' on' : '') +
          '" data-act="pick-field" data-f="' + f + '" data-v="' + o[0] + '">' + o[1] + '</button>';
      }).join('') + '</div>';
    }
    function chipsNum(cur) {
      var out = '';
      for (var i = 1; i <= 7; i++) {
        out += '<button class="chip-num' + (cur === i ? ' on' : '') +
          '" data-act="pick-field" data-f="timesPerWeek" data-v="' + i + '">' + i + '</button>';
      }
      return '<div class="chips">' + out + '</div>';
    }

    var body = '';
    if (kind === 'goal') {
      body =
        field('名称', input('e-name', r.name || '', '比如：规律运动')) +
        field('归属分类', chipsCat(r.categoryId)) +
        field('每周次数', chipsNum(r.timesPerWeek), '记一笔时选择这个目标，就会计入本周进度。') +
        field('每次打卡得分', input('e-goal-points', String(r.pointsPerCheckin || 0), '例如 5'), '自己设定，0 分表示只记录进度。') +
        field('每日提醒（选填）', '<input class="input-box" type="time" id="e-reminder-time" value="' + esc(r.reminderTime || '') + '">', '设置后，登录新版安卓 App 并允许通知，手机每天会提醒；留空关闭。') +
        field('属于谁', chipsPick('scope', r.scope || 'me', [['me', '只算我自己的'], ['both', '我们共同的']]),
          '共同目标谁打卡都算，得分进「我们的分」，用来兑两个人一起做的事。') +
        field('谁可以看到', chipsPick('visibility', r.visibility || 'shared', [['private','仅自己'],['shared','双方可见']]));
    } else if (kind === 'reward') {
      body =
        field('名称', input('e-name', r.name || '', '写成行为，比如：他做一顿饭，我休息')) +
        field('档位', chipsPick('tier', r.tier, [['small', '小奖励'], ['mid', '中奖励'], ['big', '大奖励']])) +
        field('需要的分', input('e-points', r.pointsLabel || '待定', '待定')) +
        field('谁执行', chipsPick('executor', r.executor, [['me', '我执行'], ['him', '他执行'], ['both', '我们一起']]),
          '必须写清谁做，不能只写物品。');
    } else if (kind === 'member') {
      body = field('名字', input('e-name', r.name || '', '比如：小满'),
        '只在这个空间里显示。改了以后，今天页、回看页、故事接龙都会跟着变。');
    } else if (kind === 'cat') {
      body =
        field('名称', input('e-name', r.name || '', '比如：健康')) +
        field('说明', input('e-desc', r.desc || '', '一句话，比如：身体的事')) +
        field('颜色',
          '<div class="form-line">' + UI.icon('palette', 17) +
            '<input type="color" id="e-color" value="' + (r.color || '#E9C9A3') + '" ' +
              'style="width:46px;height:30px;border:0;padding:0;background:none;cursor:pointer">' +
            '<span class="mono" style="font-size:12.5px;color:var(--ink-3)">' + (r.color || '') + '</span>' +
          '</div>') +
        '<div class="chip-hint">改颜色只影响展示，不影响历史记录。</div>' +
        (r.locked ? '<div class="chip-hint">「未分类」是系统兜底，不能删，但可以改名改色。</div>' : '');
    } else {
      body =
        field('名称', input('e-name', r.name || '', '比如：周末一起去看展')) +
        field('需要的分', input('e-points', r.pointsLabel || '待定', '待定'), '两个人的兑换要能被 2 整除，各出一半。') +
        field('属于谁', chipsPick('scope', r.scope || 'both', [['me', '只属于我'], ['him', '只属于对方'], ['both', '我们俩']]),
          '只属于一个人的，用他自己的分兑，一个人就能兑；我们俩的，各出一半，要两个人都点头。') +
        field('谁执行', chipsPick('executor', r.executor, [['me', '我来安排'], ['him', '他来安排'], ['both', '我们一起']]),
          '必须写清谁做，不能只写物品。');
    }

    return '<div class="sheet-mask" data-act="close-sheet">' +
      '<div class="sheet" data-sheet="1">' +
        '<div class="sheet-grip"></div>' +
        '<div class="sheet-head">' +
          '<div class="sheet-title">' + title + '</div>' +
          '<button class="sheet-x" data-act="close-sheet">' + UI.icon('x', 18) + '</button>' +
        '</div>' +
        body +
        '<button class="btn-primary" data-act="save-edit">' + (isNew ? '添加' : '保存') + '</button>' +
        (kind === 'goal' && !isNew
          ? '<div class="btn-row" style="margin-top:10px">' +
              '<button class="btn-ghost" data-act="goal-archive" data-id="' + r.id + '">归档这个目标</button></div>'
          : '') +
        '<div class="foot-line">随时可以改，改了不影响历史记录。</div>' +
      '</div>' +
    '</div>';
  };

  /* ============================================================
     未分类归类弹层（「去整理」，不弹窗打扰、不拦提交）
     ============================================================ */
  Pages.tidySheet = function (st) {
    var td = st.tidy || {};
    var side = td.side || 'me';
    var date = td.date || D.today();
    var rows = S.entriesOf(side, date).filter(function (e) { return !e.categoryId; });
    var cats = S.db.categories.filter(function (c) { return c.id !== 'none'; });

    var list = rows.length ? rows.map(function (e) {
      return '<div class="tidy-block">' +
        '<div class="tidy-top">' +
          '<span class="entry-time">' + esc(e.start) + '–' + esc(e.end) + '</span>' +
          '<span class="tidy-dur">' + D.durShort(e.minutes) + '</span>' +
        '</div>' +
        '<div class="tidy-text">' + esc(e.content) + '</div>' +
        '<div class="chips" style="margin-top:9px">' + cats.map(function (c) {
          return '<button class="chip-cat" data-act="pick-tidy" data-eid="' + e.id +
            '" data-cid="' + c.id + '">' +
            '<span class="cdot" style="background:' + c.color + '"></span>' + esc(c.name) + '</button>';
        }).join('') + '</div>' +
      '</div>';
    }).join('') : '<div class="empty">这一天没有未分类的记录。<br>「未分类」本来就是允许的最终状态。</div>';

    return '<div class="sheet-mask" data-act="close-sheet">' +
      '<div class="sheet" data-sheet="1">' +
        '<div class="sheet-grip"></div>' +
        '<div class="sheet-head">' +
          '<div class="sheet-title">整理未分类</div>' +
          '<button class="sheet-x" data-act="close-sheet">' + UI.icon('x', 18) + '</button>' +
        '</div>' +
        '<div class="chip-hint" style="margin:-10px 0 16px">' +
          D.md(date) + ' · ' + rows.length + ' 条待整理。点一下分类就行，不改内容也不改时间。</div>' +
        list +
        '<button class="btn-primary" style="margin-top:16px" data-act="close-sheet">整理好了</button>' +
        '<div class="foot-line">不整理也没关系，这些记录一直都在。</div>' +
      '</div>' +
    '</div>';
  };

  /* ---------------- 在一起起始日 弹层 ---------------- */
  Pages.sinceSheet = function () {
    var cur = S.db.couple.since || D.today();
    return '<div class="sheet-mask" data-act="close-sheet">' +
      '<div class="sheet" data-sheet="1">' +
        '<div class="sheet-grip"></div>' +
        '<div class="sheet-head">' +
          '<div class="sheet-title">我们在一起的日子</div>' +
          '<button class="sheet-x" data-act="close-sheet">' + UI.icon('x', 18) + '</button>' +
        '</div>' +
        '<div class="chip-hint" style="margin:-10px 0 16px">' +
          '改完之后「在一起 N 天」按这一天重算。两个人看到的是同一个日期。</div>' +
        '<div class="field">' +
          '<div class="field-k">哪一天</div>' +
          '<input type="date" class="textarea" id="f-since" style="min-height:0;padding:12px 14px" value="' + esc(cur) + '" max="' + D.today() + '">' +
        '</div>' +
        '<button class="btn-primary" style="margin-top:16px" data-act="save-since">保存</button>' +
        '<div class="foot-line">忘了具体哪天也没关系，估一个大概就行。</div>' +
      '</div>' +
    '</div>';
  };

  global.Pages = Pages;
})(window);


/* ============================================================
   app.js
   ============================================================ */
/* ============================================================
   「我们」系统 · 路由 ＋ 交互
   ============================================================ */
(function (global) {
  'use strict';

  var S = global.Store, UI = global.UI, D = S.D, Pages = global.Pages;
  var wishWallet = global.Wish.wallet, wishCost = global.Wish.cost;

  var view = document.getElementById('view');
  var sidebar = document.getElementById('sidebar');
  var tabbar = document.getElementById('tabbar');
  var sheetRoot = document.getElementById('sheet-root');

  var MAIN = ['today', 'together', 'points', 'review', 'settings'];
  var TITLES = { today: '今天', together: '一起', points: '兑换', review: '回看', settings: '设置' };

  var state = {
    route: 'today',
    params: {},
    prev: 'today',
    todaySide: 'me',
    parallelOpen: true,
    reviewMonth: D.today().slice(0, 7),
    reviewDay: D.today(),
    reviewScope: 'all',
    lowOnly: false,
    happyDay: null,
    calPicker: false,
    clearAt: 0,
    storyDraft: '',
    form: null,
    sheet: null
  };

  /* ---------------- 导航 ---------------- */
  function nav(route, params) {
    if (MAIN.indexOf(state.route) >= 0 && MAIN.indexOf(route) >= 0) {
      state.prev = state.route;
    } else if (MAIN.indexOf(route) >= 0) {
      state.prev = 'today';
    } else {
      state.prev = state.route;
    }
    state.route = route;
    state.params = params || {};
    if (route !== 'story') state.storyDraft = '';
    if (route !== 'review') { state.happyDay = null; state.lowOnly = false; state.calPicker = false; }
    closeSheet();
    render();
    global.scrollTo(0, 0);
  }

  function back() {
    var r = state.prev && state.prev !== state.route ? state.prev : 'today';
    state.prev = 'today';
    nav(r);
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    var fn = Pages[state.route];
    if (!fn) { state.route = 'today'; fn = Pages.today; }
    view.innerHTML = fn(state);
    renderShell();
  }

  function renderShell() {
    var me = S.member('me'), him = S.member('him');
    var on = state.route;

    sidebar.innerHTML =
      '<div class="side-brand">我们 <span class="h" style="display:inline-block;vertical-align:-2px">' +
        UI.icon('heart', 17) + '</span></div>' +
      '<div class="side-sub">两个人的时间账本</div>' +
      '<nav class="side-nav">' +
        sideItem('today', 'sun', '今天', on) +
        sideItem('together', 'heart', '一起', on) +
        sideItem('points', 'gift', '兑换', on) +
        sideItem('review', 'calendar', '回看', on) +
        sideItem('settings', 'gear', '设置', on) +
      '</nav>' +
      '<div class="side-foot">' +
        UI.avatar(me, 26, 'side') +
        '<span style="margin-left:-8px;display:inline-block">' + UI.avatar(him, 26, 'side') + '</span>' +
        '<span>一起记录，慢慢变好</span>' +
      '</div>';

    tabbar.innerHTML =
      tabItem('today', 'sun', '今天', on) +
      tabItem('together', 'heart', '一起', on) +
      tabItem('points', 'gift', '兑换', on) +
      tabItem('review', 'calendar', '回看', on);
  }

  function sideItem(route, ico, label, on) {
    return '<button class="side-item' + (on === route ? ' on' : '') + '" data-nav="' + route + '">' +
      UI.icon(ico, 19) + '<span>' + label + '</span></button>';
  }

  function tabItem(route, ico, label, on) {
    return '<button class="tab' + (on === route ? ' on' : '') + '" data-nav="' + route + '">' +
      '<span class="tab-ico-wrap">' + UI.icon(ico, 22) + '</span>' +
      '<span>' + label + '</span></button>';
  }

  /* ---------------- 弹层 ---------------- */
  function openSheet() {
    state.form = {
      start: defaultStart(),
      end: '',
      categoryId: undefined,
      content: '',
      note: '',
      happy: null
    };
    var f = state.form;
    var m = D.hm(f.start);
    var e = Math.min(m + 60, 1439);
    f.end = D.pad(Math.floor(e / 60)) + ':' + D.pad(e % 60);
    state.sheet = 'add';
    sheetRoot.innerHTML = Pages.addSheet(state);
    document.body.style.overflow = 'hidden';
    var ta = document.getElementById('f-content');
    if (ta && global.innerWidth > 700) ta.focus();
  }

  function defaultStart() {
    // 开始＝上一次的结束时间（设计稿 §8.6 字段表）
    var rows = S.entriesOf('me', D.today());
    if (rows.length) {
      return rows[rows.length - 1].end;
    }
    var now = new Date();
    return D.pad(now.getHours()) + ':' + D.pad(now.getMinutes());
  }

  function closeSheet() {
    state.sheet = null;
    sheetRoot.innerHTML = '';
    document.body.style.overflow = '';
  }

  /* ---------------- 编辑弹层（目标 / 奖励 / 愿望） ---------------- */
  var EDIT_DEFAULTS = {
    goal: function (cat) {
      return {
        id: 'g' + crypto.randomUUID(), memberId: 'me', name: '', icon: 'target',
        categoryId: cat || 'growth', timesPerWeek: 3, points: null,
        pointsLabel: '待定', pointsPerCheckin: 0, keywords: [], doneThisWeek: 0, totalWeeks: 0, status: 'active', visibility: 'private', scope: 'me'
      };
    },
    reward: function () {
      return {
        id: 'r' + crypto.randomUUID(), tier: 'small', name: '', points: null,
        pointsLabel: '待定', executor: 'me', executorLabel: '我执行', scope: 'me'
      };
    },
    wish: function (cat) {
      return {
        id: 'w' + crypto.randomUUID(), cat: cat || 'together', name: '', points: null,
        pointsLabel: '待定', executor: 'both', executorLabel: '我们一起', scope: 'both',
        status: 'saving', icon: 'star'
      };
    },
    cat: function () {
      return { id: 'c' + crypto.randomUUID(), name: '', desc: '', color: '#D6C6E8' };
    },
    member: function () {
      return { id: 'me', name: '', role: '她', side: 'pink', avatar: null };
    }
  };

  function openEdit(kind, id, cat) {
    var arr = kind === 'goal' ? S.db.goals
      : kind === 'reward' ? S.db.rewards
        : kind === 'cat' ? S.db.categories
          : kind === 'member' ? S.db.members
            : S.db.wishlist;
    var rec = id ? arr.filter(function (x) { return x.id === id; })[0] : null;
    var isNew = !rec;
    if (!rec) rec = EDIT_DEFAULTS[kind](cat);
    state.edit = { kind: kind, isNew: isNew, rec: JSON.parse(JSON.stringify(rec)) };
    state.sheet = 'edit';
    sheetRoot.innerHTML = Pages.editSheet(state);
    document.body.style.overflow = 'hidden';
  }

  function collectEdit() {
    var e = state.edit;
    if (!e) return;
    var n = document.getElementById('e-name');
    var p = document.getElementById('e-points');
    var k = document.getElementById('e-keywords');
    var d = document.getElementById('e-desc');
    var c = document.getElementById('e-color'), gp = document.getElementById('e-goal-points'), reminder = document.getElementById('e-reminder-time');
    if (n) e.rec.name = n.value.trim();
    if (p) e.rec.pointsLabel = p.value.trim() || '待定';
    if (gp) e.rec.pointsPerCheckin = gp.value.trim();
    if (reminder) e.rec.reminderTime = reminder.value;
    if (k) e.rec.keywords = k.value.split(/[\s,，、]+/).filter(Boolean);
    if (d) e.rec.desc = d.value.trim();
    if (c) e.rec.color = c.value;
  }

  function refreshEdit() { sheetRoot.innerHTML = Pages.editSheet(state); }

  function saveEdit() {
    collectEdit();
    var e = state.edit;
    if (!e) return;
    var r = e.rec;
    if (!r.name) { toast('先写个名字。'); return; }
    if (e.kind === 'goal') {
      if (!/^(0|[1-9]\d{0,4})$/.test(String(r.pointsPerCheckin)) || Number(r.pointsPerCheckin)>10000) { toast('每次打卡得分请输入 0 到 10000 的整数。'); return; }
      r.pointsPerCheckin=Number(r.pointsPerCheckin);
      if (r.reminderTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.reminderTime)) { toast('请选择有效的提醒时间。'); return; }
      if (r.scope === 'both' && r.visibility === 'private') { toast('共同目标需要双方可见；打卡记录仍可单独设为私密。'); return; }
      if (r.reminderTime && global.WomenReminders) global.WomenReminders.requestPermission();
    }

    if (r.executor) {
      r.executorLabel = r.executor === 'me'
        ? (e.kind === 'wish' ? '我来安排' : '我执行')
        : r.executor === 'him'
          ? (e.kind === 'wish' ? '他来安排' : '他执行')
          : '我们一起';
    }

    if (e.kind === 'goal') {
      if (e.isNew) {
        var act = S.db.goals.filter(function (g) { return g.memberId === 'me' && g.status === 'active'; });
        if (act.length >= 3) { toast('最多同时 3 个长期目标。'); return; }
        S.db.goals.push(r);
      } else {
        var g0 = S.db.goals.filter(function (x) { return x.id === r.id; })[0];
        if (g0) Object.assign(g0, r);
      }
    } else if (e.kind === 'reward') {
      if (e.isNew) S.db.rewards.push(r);
      else {
        var r0 = S.db.rewards.filter(function (x) { return x.id === r.id; })[0];
        if (r0) Object.assign(r0, r);
      }
    } else if (e.kind === 'member') {
      var m0 = S.member(r.id);
      if (m0) { m0.name = r.name; S.save(); }
      closeSheet();
      render();
      toast('名字改好了。');
      return;
    } else if (e.kind === 'cat') {
      if (e.isNew) {
        // 插到「未分类」之前——未分类永远是最后一项且不可删
        S.db.categories.splice(S.db.categories.length - 1, 0, r);
      } else {
        var c0 = S.db.categories.filter(function (x) { return x.id === r.id; })[0];
        if (c0) { c0.name = r.name; c0.desc = r.desc; c0.color = r.color; }
      }
      S.save();
      closeSheet();
      render();
      toast(e.isNew ? '加好了。排序会全局生效。' : '改好了。只影响展示，不动历史数据。');
      return;
    } else {
      if (e.isNew) S.db.wishlist.push(r);
      else {
        var w0 = S.db.wishlist.filter(function (x) { return x.id === r.id; })[0];
        if (w0) Object.assign(w0, r);
      }
    }
    S.save();
    closeSheet();
    render();
    toast(e.isNew ? '加好了。' : '改好了。');
  }

  /* ---------------- 未分类整理弹层 ---------------- */
  function openTidy(side, date) {
    state.tidy = { side: side || 'me', date: date || D.today() };
    state.sheet = 'tidy';
    sheetRoot.innerHTML = Pages.tidySheet(state);
    document.body.style.overflow = 'hidden';
  }

  function collectForm() {
    var f = state.form || {};
    var s = document.getElementById('f-start'), e = document.getElementById('f-end');
    var c = document.getElementById('f-content'), n = document.getElementById('f-note'), goal = document.getElementById('f-goal'), visibility = document.getElementById('f-visibility');
    if (s) f.start = s.value;
    if (e) f.end = e.value;
    if (c) f.content = c.value;
    if (n) f.note = n.value;
    if (goal) f.goalId = goal.value || null;
    if (visibility) f.visibility = visibility.value;
    state.form = f;
    return f;
  }

  function refreshSheet() {
    collectForm();
    sheetRoot.innerHTML = Pages.addSheet(state);
  }

  /* ---------------- 轻提示 ---------------- */
  var toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.style.cssText =
        'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:200;' +
        'background:rgba(51,47,44,.92);color:#fff;font-size:13px;letter-spacing:.4px;' +
        'padding:10px 18px;border-radius:20px;max-width:82%;text-align:center;' +
        'box-shadow:0 8px 24px rgba(0,0,0,.18);transition:opacity .2s;pointer-events:none;';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.style.opacity = '0'; }, 2000);
  }

  /* ---------------- 事件 ---------------- */
  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-act],[data-nav],[data-day],[data-hday]');
    if (!el) return;

    /* 一级导航 */
    if (el.hasAttribute('data-nav')) {
      nav(el.getAttribute('data-nav'));
      return;
    }

    /* 点日历 */
    if (el.hasAttribute('data-day')) {
      state.reviewDay = el.getAttribute('data-day');
      render();
      return;
    }

    /* 点折线某天 */
    if (el.hasAttribute('data-hday')) {
      var k = el.getAttribute('data-hday');
      state.happyDay = state.happyDay === k ? null : k;
      render();
      return;
    }

    var act = el.getAttribute('data-act');
    var id = el.getAttribute('data-id');

    switch (act) {
      case 'add':
        openSheet();
        break;

      case 'close-sheet':
        if (el.classList.contains('sheet-mask') && ev.target !== el) return;
        closeSheet();
        break;

      case 'pick-cat':
        collectForm();
        state.form.categoryId = state.form.categoryId === id ? null : id;
        state.form.catManual = true;
        refreshSheet();
        break;

      case 'happy':
        collectForm();
        var n = +el.getAttribute('data-n');
        state.form.happy = state.form.happy === n ? null : n;
        refreshSheet();
        break;

      case 'save-entry': {
        var f = collectForm();
        if (!f.content || !f.content.trim()) {
          toast('写一句“干了什么”就好，不用完整。');
          return;
        }
        var mins = D.minutes(f.start, f.end);
        if (!mins) { toast('结束时间要晚于开始时间。'); return; }
        var patch = {
          start: f.start,
          end: f.end,
          categoryId: f.categoryId || null,   // 留空＝未分类，允许的最终状态
          content: f.content.trim(),
          note: f.note || '',
          happy: f.happy || null,
          goalId: f.goalId || null,
          visibility: f.visibility || 'shared'
        };
        if (f.editId) {
          S.updateEntry(f.editId, patch);
          closeSheet();
          render();
          toast('改好了。');
        } else {
          patch.memberId = 'me';
          patch.date = D.today();
          S.addEntry(patch);
          closeSheet();
          if (state.route !== 'today') nav('today'); else render();
          toast('记下来了。记下来，就已经很好。');
        }
        break;
      }

      case 'edit-entry': {
        var en0 = S.entry(id);
        if (!en0) return;
        state.form = {
          editId: en0.id,
          start: en0.start,
          end: en0.end,
          categoryId: en0.categoryId || null,
          catManual: true,          // 编辑已有记录时，不再跟着时间自动改分类
          content: en0.content,
          note: en0.note || '',
          goalId: en0.goalId || null,
          visibility: en0.visibility || 'shared',
          happy: en0.happy || null
        };
        state.sheet = 'add';
        sheetRoot.innerHTML = Pages.addSheet(state);
        document.body.style.overflow = 'hidden';
        break;
      }

      case 'delete-entry': {
        var did = el.getAttribute('data-id');
        S.deleteEntry(did);
        closeSheet();
        render();
        toast('删掉了。');
        break;
      }

      case 'side':
        state.todaySide = el.getAttribute('data-side');
        render();
        break;

      case 'parallel':
        
        if (global.innerWidth >= 980) {
          state.parallelOpen = !state.parallelOpen;
          render();
        } else {
          state.todaySide = state.todaySide === 'me' ? 'him' : 'me';
          render();
        }
        break;

      case 'tidy':
        openTidy(el.getAttribute('data-side'), D.today());
        break;

      case 'go':
        nav(el.getAttribute('data-go'), { id: id });
        break;

      case 'redeem':
        nav('redeem', { id: id });
        break;

      case 'back':
        back();
        break;

      /* 回看 */
      case 'scope':
        state.reviewScope = el.getAttribute('data-k');
        render();
        break;

      case 'low-toggle':
        state.lowOnly = !state.lowOnly;
        render();
        break;

      case 'cal': {
        var dir = el.getAttribute('data-dir');
        var d = D.parse(state.reviewMonth + '-01');
        d.setMonth(d.getMonth() + (dir === 'next' ? 1 : -1));
        state.reviewMonth = D.key(d).slice(0, 7);
        render();
        break;
      }

      case 'cal-pick':
        state.calPicker = !state.calPicker;
        render();
        break;

      case 'cal-year': {
        var y0 = (+state.reviewMonth.slice(0, 4)) + (+el.getAttribute('data-d'));
        state.reviewMonth = y0 + '-' + state.reviewMonth.slice(5, 7);
        render();
        break;
      }

      case 'cal-month': {
        var mIdx = +el.getAttribute('data-m');
        var yyyy = state.reviewMonth.slice(0, 4);
        state.reviewMonth = yyyy + '-' + D.pad(mIdx + 1);
        state.calPicker = false;
        render();
        break;
      }

      /* 在一起起始日 */
      case 'edit-since':
        state.sheet = 'since';
        sheetRoot.innerHTML = Pages.sinceSheet(state);
        document.body.style.overflow = 'hidden';
        break;

      case 'save-since': {
        var sinceEl = document.getElementById('f-since');
        var sinceVal = sinceEl ? sinceEl.value : '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(sinceVal)) { toast('选一个日期吧。'); break; }
        if (sinceVal > D.today()) { toast('还没到的日子不能当起始日。'); break; }
        S.db.couple.since = sinceVal;
        S.save();
        closeSheet();
        render();
        toast('改好了。在一起 ' + S.daysTogether() + ' 天。');
        break;
      }

      /* 设置 */
      case 'share-open':
        S.db.couple.shareOpen = !S.db.couple.shareOpen;
        S.save();
        render();
        toast(S.db.couple.shareOpen ? '已开放：他能在今天页看到我的记录。' : '已关闭：只有你自己看得见。');
        break;

      case 'copy-code':
        copyText(S.db.couple.code).then(function () { toast('情侣码已复制：' + S.db.couple.code); });
        break;

      case 'export':
        exportJSON();
        break;

      case 'clear-all': {
        var tnow = Date.now();
        if (state.clearAt && tnow - state.clearAt < 5000) {
          S.clearAll();
          state.clearAt = 0;
          render();
          toast('所有记录已清空。成员、情侣码、色板都还在。');
        } else {
          state.clearAt = tnow;
          toast('再点一次「清空所有记录」确认（5 秒内有效）。');
        }
        break;
      }

      case 'pick-avatar':
        pickImage(function (dataUrl) {
          S.setAvatar(id, dataUrl);
          render();
          toast('头像换好了。');
        });
        break;

      /* 长期目标 */
      case 'goal-add': {
        var act0 = S.db.goals.filter(function (g) { return g.memberId === 'me' && g.status === 'active'; });
        if (act0.length >= 3) { toast('最多同时 3 个长期目标。'); return; }
        openEdit('goal', null);
        break;
      }

      case 'goal-done':
      case 'goal-drop': {
        var g = S.db.goals.filter(function (x) { return x.id === id; })[0];
        if (!g) return;
        if (!confirm(act === 'goal-done' ? '确定结束并归档这个长期目标吗？日常打卡请在记一笔时选择该目标。' : '确定放弃并归档这个长期目标吗？')) return;
        g.status = act === 'goal-done' ? 'done' : 'dropped';
        if (act === 'goal-done' && g.visibility !== 'private') {
          S.db.milestones.push({
            id: 'm' + crypto.randomUUID(), kind: 'goal', date: D.today(),
            title: '完成长期目标「' + g.name + '」', note: ''
          });
        }
        S.save(); render(); toast(act === 'goal-done' ? '已归档。历史记录保留。' : '已放弃。历史记录保留。');
        break;
      }

      /* 愿望兑换 */
      case 'confirm-redeem': {
        var w = S.db.wishlist.filter(function (x) { return x.id === id; })[0];
        if (!w) return;
        var sharedWish = wishWallet(w) !== 'mine';
        var askText = sharedWish
          ? '确定一起用 ' + w.pointsLabel + ' 分兑换「' + w.name + '」吗？\n你们各出 ' + (wishCost(w) / 2) + ' 分，发出后要他也点头才扣分。'
          : '确定用我的 ' + w.pointsLabel + ' 分兑换「' + w.name + '」吗？';
        if (!confirm(askText)) break;
        global.WomenSync.redeem('wish',id).then(function(res){nav('points');toast(res && res.pending ? '已经发出去了，等他点头。' : (sharedWish ? '兑换成功，你们各扣了一半。' : '兑换成功，已扣除积分。'));}).catch(function(e){toast(e.message || '兑换未完成，请重试。');});
        break;
      }

      case 'cancel-redemption': {
        if(!confirm('确定取消这次共同兑换申请吗？')) break;
        global.WomenSync.cancelRedemption(id).then(function(){toast('申请已取消。');}).catch(function(e){toast(e.message || '取消失败，请重试。');});
        break;
      }

      case 'redeem-reward': {
        var reward = S.db.rewards.filter(function (x) { return x.id === id; })[0];
        if (!reward || !confirm('确定用自己的 ' + reward.pointsLabel + ' 分兑换「' + reward.name + '」吗？')) break;
        global.WomenSync.redeem('reward',id).then(function(){toast('兑换成功，已扣除积分。');}).catch(function(e){toast(e.message || '兑换未完成，请重试。');});
        break;
      }

      case 'wish-done': {
        var wish = S.db.wishlist.filter(function(x){return x.id===id;})[0];
        if(!wish || wish.status==='done') break;
        if(/^[1-9]\d*$/.test(String(wish.pointsLabel||'')) && wish.status!=='redeemed'){toast('这个愿望设置了积分，请先兑换。');break;}
        if(!confirm('确定已完成「'+wish.name+'」吗？')) break;
        wish.status='done';S.db.milestones.push({id:'m'+crypto.randomUUID(),kind:'wish',date:D.today(),title:'完成「'+wish.name+'」',note:''});S.save();render();toast('愿望已完成。');break;
      }

      /* 故事接龙 */
      case 'spark': {
        var sp = S.db.sparks[Math.floor(Math.random() * S.db.sparks.length)];
        var ta = document.getElementById('story-input');
        if (ta) { ta.value = sp; state.storyDraft = sp; }
        var cnt = document.getElementById('story-count');
        if (cnt) cnt.textContent = '写 1–3 句就好 · ' + sp.length + '/60';
        toast('给了一个开头，不想接就再换一个。');
        break;
      }

      case 'publish': {
        var input = document.getElementById('story-input');
        var txt = input ? input.value.trim() : (state.storyDraft || '');
        if (!txt) { toast('写 1–3 句就好。'); return; }
        S.addStory('me', txt);
        state.storyDraft = '';
        nav('storyFull');
        toast('这一段发出去了。');
        break;
      }

      case 'copy-story':
        copyText(storyPlain()).then(function () { toast('整篇故事已复制。'); });
        break;

      case 'export-story': {
        var blob = new Blob([storyPlain()], { type: 'text/plain;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = '我们的一篇.txt';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
        toast('已导出「我们的一篇.txt」。');
        break;
      }

      /* 见面安排 */
      case 'save-meet': {
        var di = document.getElementById('meet-date');
        var pi = document.getElementById('meet-plan');
        var dateVal = di ? di.value : D.today();
        var planVal = pi ? pi.value : '';
        var cur = S.nextMeet();
        if (cur) {
          cur.date = dateVal;
          cur.plan = planVal;
          cur.note = planVal;
        } else {
          S.db.milestones.push({
            id: 'm' + crypto.randomUUID(), kind: 'meet', date: dateVal,
            title: '在车站见面', note: planVal, plan: planVal
          });
        }
        S.save(); render();
        toast('保存了。首页倒计时立刻开始跳。');
        break;
      }

      /* 分类色板 */
      case 'cat-up': {
        var idx = S.db.categories.findIndex(function (c) { return c.id === id; });
        if (idx <= 0) { toast('已经在最上面了。'); return; }
        var arr = S.db.categories;
        var tmp = arr[idx - 1];
        arr[idx - 1] = arr[idx];
        arr[idx] = tmp;
        S.save(); render();
        break;
      }

      case 'cat-add':
        openEdit('cat', null);
        break;

      /* 奖励 / 愿望新增 */
      case 'reward-add':
        openEdit('reward', null);
        break;

      case 'wish-add': {
        var wk = el.getAttribute('data-k') || 'together';
        openEdit('wish', null, wk);
        break;
      }

      /* 编辑弹层 */
      case 'open-edit':
        openEdit(el.getAttribute('data-kind'), el.getAttribute('data-id'), el.getAttribute('data-k'));
        break;

      case 'pick-field': {
        if (!state.edit) return;
        collectEdit();
        var f = el.getAttribute('data-f');
        var v = el.getAttribute('data-v');
        if (f === 'timesPerWeek') v = +v;
        if (state.edit.kind === 'goal' && f === 'scope' && v === 'both') state.edit.rec.visibility = 'shared';
        if (state.edit.kind === 'goal' && f === 'visibility' && v === 'private' && state.edit.rec.scope === 'both') { toast('共同目标需要双方可见；打卡记录仍可单独设为私密。'); return; }
        state.edit.rec[f] = v;
        refreshEdit();
        break;
      }

      case 'save-edit':
        saveEdit();
        break;

      case 'goal-archive': {
        var gg = S.db.goals.filter(function (x) { return x.id === id; })[0];
        if (!gg || !confirm('确定结束并归档这个长期目标吗？日常打卡请在记一笔时选择该目标。')) break;
        if (gg) { gg.status = 'done'; S.save(); }
        closeSheet();
        render();
        toast('已归档。历史记录保留。');
        break;
      }

      /* 未分类归类 */
      case 'pick-tidy': {
        var eid = el.getAttribute('data-eid');
        var cid = el.getAttribute('data-cid');
        var en = S.db.entries.filter(function (x) { return x.id === eid; })[0];
        if (en) { en.categoryId = cid; S.save(); }
        sheetRoot.innerHTML = Pages.tidySheet(state);
        render();
        document.body.style.overflow = 'hidden';
        toast('归好类了。');
        break;
      }

      default:
        break;
    }
  });

  /* 输入事件 */
  document.addEventListener('input', function (ev) {
    var t = ev.target;

    if (t.id === 'f-content') {
      var cnt = document.getElementById('f-count');
      if (cnt) cnt.textContent = t.value.length + '/100';
      return;
    }

    if (t.id === 'f-start' || t.id === 'f-end') {
      var f = collectForm();
      var mins = D.minutes(f.start, f.end);
      var dv = document.getElementById('f-dur');
      if (dv) dv.textContent = mins ? D.dur(mins) : '—';
      return;
    }

    if (t.id === 'story-input') {
      state.storyDraft = t.value;
      var sc = document.getElementById('story-count');
      if (sc) sc.textContent = '写 1–3 句就好 · ' + t.value.length + '/60';
      return;
    }
  });

  /* 颜色选择 */
  document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t.getAttribute && t.getAttribute('data-color-act') === 'cat-color') {
      var id = t.getAttribute('data-id');
      var c = S.db.categories.filter(function (x) { return x.id === id; })[0];
      if (c) { c.color = t.value; S.save(); render(); toast('改了颜色。只影响展示，不动历史数据。'); }
    }
  });

  /* Esc 关闭弹层 */
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && state.sheet) closeSheet();
    if (ev.key === 'Enter' && ev.metaKey && state.sheet) {
      var b = document.querySelector('[data-act="save-entry"]');
      if (b) b.click();
    }
  });

  /* ---------------- 小工具 ---------------- */
  function guessByTime(hm) {
    var h = Math.floor((hm || 0) / 60);
    if (h < 9) return 'health';
    if (h < 12) return 'relate';
    if (h < 14) return 'health';
    if (h < 18) return 'career';
    if (h < 20) return 'life';
    if (h < 23) return 'leisure';
    return 'health';
  }

  /* 选图 → 居中裁方 → 压到 240×240（避免撑爆 localStorage） */
  function pickImage(cb) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(input);

    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) { document.body.removeChild(input); return; }
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          try {
            var size = 240;
            var cv = document.createElement('canvas');
            cv.width = size; cv.height = size;
            var ctx = cv.getContext('2d');
            var scale = Math.max(size / img.width, size / img.height);
            var w = img.width * scale, h = img.height * scale;
            ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
            cb(cv.toDataURL('image/jpeg', 0.85));
          } catch (err) {
            cb(reader.result);
          }
        };
        img.onerror = function () { cb(reader.result); };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
      document.body.removeChild(input);
    });

    input.click();
  }

  function copyText(text) {
    if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
    }
    fallbackCopy(text);
    return Promise.resolve();
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  function storyPlain() {
    var list = S.storySorted();
    var head = '我们的一篇\n\n';
    return head + list.map(function (s) {
      return S.member(s.memberId).name + ' · ' + D.md(s.date) + '\n' + s.text;
    }).join('\n\n');
  }

  function exportJSON() {
    var data = JSON.stringify(S.db, null, 2);
    var blob = new Blob([data], { type: 'application/json;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '我们-数据备份-' + D.today() + '.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    toast('已导出数据备份。');
  }

  /* ---------------- 启动 ---------------- */
  render();
  global.App = { nav: nav, state: state, render: render, toast: toast };
})(window);

