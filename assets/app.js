/* ===========================================================
   团课刷题 · 应用逻辑
   数据保存在浏览器 localStorage，关闭页面后进度不丢失。
   =========================================================== */
(function () {
  'use strict';

  var Q = window.QUESTIONS || [];
  var BY_ID = {};
  Q.forEach(function (q) { BY_ID[q.id] = q; });

  var BLANK = '______';
  var KEY = 'tuanquiz.v1';
  var LETTERS = 'ABCDEF';
  var TYPE_NAME = { single: '单选题', multi: '多选题', fill: '填空题', short: '简答题', recite: '背诵卡' };
  var TYPE_ICON = { single: '◉', multi: '☑', fill: '✎', short: '✍', recite: '📖' };

  /* ---------------- 工具 ---------------- */
  function $(s) { return document.querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }

  /* ---------------- 状态 ---------------- */
  function blankState() {
    return { v: 1, rec: {}, fav: [], wrong: {}, sess: null, set: { shuffle: false } };
  }
  var S = blankState();
  try {
    var raw = localStorage.getItem(KEY);
    if (raw) {
      var o = JSON.parse(raw);
      if (o && typeof o === 'object') {
        S.rec = o.rec || {};
        S.fav = Array.isArray(o.fav) ? o.fav.filter(function (id) { return BY_ID[id]; }) : [];
        S.wrong = o.wrong || {};
        S.set = Object.assign({ shuffle: false }, o.set || {});
        if (o.sess && Array.isArray(o.sess.list)) {
          o.sess.list = o.sess.list.filter(function (id) { return BY_ID[id]; });
          o.sess.done = o.sess.done || {};
          o.sess.i = Math.min(o.sess.i || 0, o.sess.list.length);
          S.sess = o.sess;
        }
      }
    }
  } catch (e) { /* 隐私模式等，忽略 */ }

  var saveTimer;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
    }, 120);
  }
  function saveNow() {
    clearTimeout(saveTimer);
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
  }

  /* ---------------- 统计 ---------------- */
  function stats() {
    var total = Q.length, answered = 0, c = 0, w = 0;
    Object.keys(S.rec).forEach(function (id) {
      var r = S.rec[id];
      if (!r) return;
      if ((r.c || 0) + (r.w || 0) > 0) answered++;
      c += r.c || 0; w += r.w || 0;
    });
    return {
      total: total, answered: answered, c: c, w: w,
      acc: c + w ? Math.round((c / (c + w)) * 100) : 0,
      wrong: Object.keys(S.wrong).filter(function (id) { return BY_ID[id]; }).length,
      fav: S.fav.length
    };
  }
  function typeCount(t) {
    return Q.filter(function (q) { return q.type === t; }).length;
  }

  /* ---------------- 路由 ---------------- */
  var view = 'home';
  var picks = [];

  function render(scrollTop) {
    $('#view').innerHTML = VIEWS[view]();
    renderBottom();
    renderTop();
    if (scrollTop) window.scrollTo(0, 0);
    bindInputs();
  }

  function renderTop() {
    var s = stats();
    $('#pill').innerHTML = '已练 <b>' + s.answered + '</b> / ' + s.total;
  }

  /* ---------------- 首页 ---------------- */
  var VIEWS = {};

  VIEWS.home = function () {
    var s = stats();
    var pct = s.total ? Math.round((s.answered / s.total) * 100) : 0;
    var h = '';

    h += '<section class="card hero">';
    h += '<h1>团课知识刷题</h1>';
    h += '<div class="sub">共 ' + s.total + ' 题 · 进度自动保存在本机</div>';
    h += '<div class="bar"><i style="width:' + pct + '%"></i></div>';
    h += '<div class="row" style="margin-top:8px"><span class="muted" style="font-size:12.5px">已完成 ' +
      s.answered + ' / ' + s.total + ' 题</span><span class="grow"></span>' +
      '<span class="muted" style="font-size:12.5px">' + pct + '%</span></div>';
    h += '<div class="metric">' +
      '<div><b>' + s.answered + '</b><span>已练习</span></div>' +
      '<div><b>' + s.acc + '%</b><span>正确率</span></div>' +
      '<div><b>' + s.wrong + '</b><span>错题待复习</span></div>' +
      '</div>';
    h += '</section>';

    if (S.sess && S.sess.i < S.sess.list.length) {
      var m = modeName(S.sess.mode);
      h += '<button class="btn primary wide" data-act="resume" style="margin-bottom:6px">' +
        '继续上次 · ' + m + '（第 ' + (S.sess.i + 1) + ' / ' + S.sess.list.length + ' 题）</button>';
    }

    h += '<div class="section-title">开始练习</div>';
    h += '<div class="modes">';
    h += modeCard('all', '全部练习', '按顺序过一遍 ' + s.total + ' 题', '▶', true);
    h += modeCard('random', '随机 20 题', '打乱抽取，快速自测', '🎲', false);
    h += modeCard('wrong', '错题重做', s.wrong ? s.wrong + ' 题待攻坚' : '暂时没有错题', '↻', s.wrong > 0);
    h += modeCard('fav', '我的收藏', s.fav ? s.fav + ' 题已收藏' : '点击题目右上角收藏', '★', false);
    h += '</div>';

    h += '<div class="section-title">按题型</div>';
    h += '<div class="modes">';
    ['single', 'multi', 'fill', 'short', 'recite'].forEach(function (t) {
      h += modeCard(t, TYPE_NAME[t], typeCount(t) + ' 题', TYPE_ICON[t], false);
    });
    h += '</div>';

    h += '<div class="section-title">数据</div>';
    h += '<div class="modes">';
    h += modeCard('@settings', '设置与备份', '导出 / 导入进度', '⚙', false);
    h += '</div>';

    h += '<div class="foot">题目来自《团课题库》<br>进度保存在当前浏览器，换设备请先导出备份</div>';
    return h;
  };

  function modeCard(mode, title, desc, icon, accent) {
    // 错题本 / 收藏先进入列表页，其余直接开始练习
    var listModes = { wrong: 1, fav: 1 };
    var nav = mode.charAt(0) === '@' || listModes[mode];
    var act = nav ? 'nav' : 'start';
    var m = mode.charAt(0) === '@' ? mode.slice(1) : mode;
    return '<button class="mode' + (accent ? ' accent' : '') + '" data-act="' + act + '" data-mode="' + esc(m) + '">' +
      '<span class="t"><span class="ic">' + icon + '</span>' + esc(title) + '</span>' +
      '<span class="d">' + esc(desc) + '</span></button>';
  }

  function modeName(mode) {
    if (mode === 'all') return '全部练习';
    if (mode === 'random') return '随机 20 题';
    if (mode === 'wrong') return '错题重做';
    if (mode === 'fav') return '我的收藏';
    return TYPE_NAME[mode] || '练习';
  }

  /* ---------------- 答题 ---------------- */
  function curQ() {
    if (!S.sess) return null;
    return BY_ID[S.sess.list[S.sess.i]] || null;
  }
  function doneOf(q) {
    if (!q || !S.sess) return null;
    return S.sess.done[q.id] || null;
  }

  VIEWS.quiz = function () {
    if (!S.sess || !S.sess.list.length) return '<div class="empty"><div class="big">·</div><p>还没有开始练习</p></div>';
    if (S.sess.i >= S.sess.list.length) return finishView();

    var q = curQ();
    if (!q) { S.sess.i++; return VIEWS.quiz(); }
    var d = doneOf(q);
    var h = '';

    h += '<div class="quizhead">';
    h += '<button class="btn sm ghost" data-act="home">← 返回</button>';
    h += '<span class="counter"><b>' + (S.sess.i + 1) + '</b> / ' + S.sess.list.length + '</span>';
    h += '<span class="grow"></span>';
    h += '<span class="muted" style="font-size:12.5px">' + modeName(S.sess.mode) + '</span>';
    h += '<button class="btn sm ghost" data-act="fav" title="收藏">' +
      (S.fav.indexOf(q.id) >= 0 ? '★' : '☆') + '</button>';
    h += '</div>';

    h += '<section class="card qcard">';
    h += '<span class="badge ' + q.type + '">' + TYPE_NAME[q.type] + '</span>';
    h += '<div class="stem">' + stemHTML(q, d) + '</div>';

    if (q.type === 'single' || q.type === 'multi') h += optionsHTML(q, d);
    if (q.type === 'short') h += shortHTML(q, d);
    if (q.type === 'recite') h += reciteHTML(q, d);

    h += feedbackHTML(q, d);
    h += '</section>';
    h += '<div class="foot">第 ' + q.no + ' 题（原题库编号）</div>';
    return h;
  };

  function stemHTML(q, d) {
    if (q.type === 'fill') {
      var parts = q.stem.split(BLANK);
      var out = '';
      for (var k = 0; k < parts.length; k++) {
        out += esc(parts[k]);
        if (k < parts.length - 1) {
          var exp = (q.blanks && q.blanks[k]) || '';
          var val = d && d.val ? (d.val[k] || '') : '';
          if (d) {
            // 答完后用静态文本代替输入框，宽度贴合内容
            var bok = !!(d.res && d.res[k]);
            out += '<span class="fillans ' + (bok ? 'ok' : 'err') + '">' +
              (val ? esc(val) : '<i>未填</i>') + '</span>';
          } else {
            // 初始宽度按常见答案长度给一个紧凑值，输入时随内容增长
            var w = Math.min(Math.max(exp.length * 1.05, 4), 7);
            out += '<span class="fillline"><input class="fillslot" data-i="' + k + '" style="width:' + w + 'em" ' +
              'value="" autocomplete="off" autocapitalize="off" spellcheck="false"></span>';
          }
        }
      }
      return out;
    }
    return esc(q.stem).split(BLANK).join('<span class="blank"></span>');
  }

  function optionsHTML(q, d) {
    var h = '<div class="opts" role="group">';
    for (var i = 0; i < q.opts.length; i++) {
      var cls = 'opt', mark = '';
      var isAns = q.ans.indexOf(i) >= 0;
      if (d) {
        cls += ' locked';
        var picked = d.sel && d.sel.indexOf(i) >= 0;
        if (isAns) { cls += ' correct'; mark = '✓ 正确答案'; }
        else if (picked) { cls += ' wrong'; mark = '✗'; }
      } else if (picks.indexOf(i) >= 0) {
        cls += ' picked';
      }
      h += '<button class="' + cls + '" data-act="pick" data-i="' + i + '">' +
        '<span class="k">' + LETTERS[i] + '</span>' +
        '<span class="grow">' + esc(q.opts[i]) + '</span>' +
        (mark ? '<span class="mark">' + mark + '</span>' : '') +
        '</button>';
    }
    h += '</div>';
    if (q.type === 'multi' && !d) h += '<div class="hint muted" style="font-size:12.5px;margin:2px 2px 10px">多选题：选好后点底部「提交答案」</div>';
    return h;
  }

  function shortHTML(q, d) {
    var h = '';
    if (!d || !d.open) {
      h += '<div class="row" style="margin:16px 0 10px"><button class="btn sm" data-act="reveal">显示参考答案</button>' +
        '<span class="muted" style="font-size:12.5px">先自己想一想，再对照答案</span></div>';
    }
    if (d && d.open) {
      h += '<div class="answerbox"><span class="k">参考答案</span>' + esc(q.answer || '（本题未提供参考答案）') + '</div>';
      if (d.ok === undefined) {
        h += '<div class="row" style="margin:12px 0 10px;gap:8px">' +
          '<button class="btn sm" data-act="self" data-ok="1">答对了</button>' +
          '<button class="btn sm" data-act="self" data-ok="0">答错了</button></div>';
      }
    }
    return h;
  }

  function reciteHTML(q, d) {
    var h = '<div class="answerbox" style="margin-top:16px"><span class="k">知识点</span>' + esc(q.stem) + '</div>';
    if (!d) {
      h += '<div class="row" style="margin:12px 0 10px;gap:8px">' +
        '<button class="btn sm" data-act="self" data-ok="1">我已掌握</button>' +
        '<button class="btn sm" data-act="self" data-ok="0">需要再记</button></div>';
    }
    return h;
  }

  function feedbackHTML(q, d) {
    if (!d || d.ok === undefined) return '';
    var ok = d.ok;
    var h = '<div class="feedback ' + (ok ? 'ok' : 'bad') + '">' + (ok ? '✓ 回答正确' : '✗ 回答错误');
    if (q.type === 'fill' && d.res) {
      var multi = q.blanks.length > 1;
      var right = q.blanks.map(function (b, i) { return multi ? (i + 1) + '. ' + b : b; }).join('　');
      h += '<div class="ansline"><b>参考答案：</b>' + esc(right) + '</div>';
    } else if (q.type === 'single' || q.type === 'multi') {
      var ansTxt = q.ans.map(function (i) { return LETTERS[i] + '. ' + q.opts[i]; }).join('　');
      h += '<div class="ansline"><b>正确答案：</b>' + esc(ansTxt) + '</div>';
    }
    if (q.type === 'fill' && !ok) {
      h += '<div class="hint">答案要点已在上方标出，可点底部「下一题」继续，或' +
        '<a href="#" data-act="forgive" style="color:inherit;text-decoration:underline">计为答对</a></div>';
    }
    h += '</div>';
    return h;
  }

  function finishView() {
    var s = S.sess;
    var n = s.list.length, ok = 0;
    s.list.forEach(function (id) { if (s.done[id] && s.done[id].ok) ok++; });
    var rate = n ? Math.round((ok / n) * 100) : 0;
    var h = '<section class="card hero" style="margin-top:22px;text-align:center">';
    h += '<div style="font-size:40px;line-height:1">🎉</div>';
    h += '<h1 style="margin-top:10px">本组练习完成</h1>';
    h += '<div class="sub">' + modeName(s.mode) + ' · 共 ' + n + ' 题</div>';
    h += '<div class="metric">' +
      '<div><b>' + ok + '</b><span>答对</span></div>' +
      '<div><b>' + (n - ok) + '</b><span>答错</span></div>' +
      '<div><b>' + rate + '%</b><span>正确率</span></div>' +
      '</div>';
    h += '<div style="margin-top:18px;display:flex;gap:9px">' +
      '<button class="btn" style="flex:1" data-act="restart">再来一遍</button>' +
      '<button class="btn primary" style="flex:1" data-act="home">返回首页</button></div>';
    h += '</section>';
    return h;
  }

  function renderBottom() {
    var bb = $('#bottombar'), inner = $('#bbinner');
    if (view !== 'quiz' || !S.sess || S.sess.i >= S.sess.list.length) {
      bb.classList.add('hidden');
      return;
    }
    bb.classList.remove('hidden');
    var q = curQ();
    if (!q) { bb.classList.add('hidden'); return; }
    var d = doneOf(q);
    var needSubmit = !d && (q.type === 'multi' || q.type === 'fill');
    var last = S.sess.i === S.sess.list.length - 1;
    var h = '<button class="btn" data-act="prev"' + (S.sess.i === 0 ? ' disabled' : '') + '>上一题</button>';
    if (needSubmit) h += '<button class="btn primary" data-act="submit">提交答案</button>';
    h += '<button class="btn' + (d || !needSubmit ? ' primary' : '') + '" data-act="next">' +
      (last ? '完成' : '下一题') + '</button>';
    inner.innerHTML = h;
  }

  /* ---------------- 判分 ---------------- */
  function norm(s) {
    return String(s == null ? '' : s)
      .replace(/[\s\u3000]+/g, '')
      .replace(/[，。、；：？！“”‘’（）【】《》〈〉,.;:?!"'`~\-—_…·]/g, '')
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .toLowerCase();
  }
  function fillOk(expected, got) {
    var g = norm(got);
    if (!g) return false;
    var alts = String(expected).split(/[\/／]|或/).map(norm).filter(Boolean);
    for (var i = 0; i < alts.length; i++) {
      var a = alts[i];
      if (a === g) return true;
      if (a.length >= 8 && g.length >= Math.ceil(a.length * 0.6) && a.indexOf(g) >= 0) return true;
    }
    return false;
  }

  function record(id, ok) {
    var r = S.rec[id] || (S.rec[id] = { c: 0, w: 0, last: 0, ts: 0 });
    if (ok) {
      r.c++;
      if (S.wrong[id]) {
        delete S.wrong[id];
        if (S.sess && S.sess.mode === 'wrong') toast('已从错题本移出');
      }
    } else {
      r.w++;
      S.wrong[id] = { n: ((S.wrong[id] && S.wrong[id].n) || 0) + 1, ts: Date.now() };
    }
    r.last = ok ? 1 : 0;
    r.ts = Date.now();
    save();
  }

  /* ---------------- 会话 ---------------- */
  function start(mode) {
    var list;
    if (mode === 'all') list = Q.map(function (q) { return q.id; });
    else if (mode === 'random') list = shuffle(Q.map(function (q) { return q.id; })).slice(0, 20);
    else if (mode === 'wrong') {
      list = Object.keys(S.wrong).filter(function (id) { return BY_ID[id]; })
        .sort(function (a, b) { return (S.wrong[b].ts || 0) - (S.wrong[a].ts || 0); })
        .map(Number);
      if (!list.length) { toast('错题本是空的，先去练习吧'); return; }
    } else if (mode === 'fav') {
      list = S.fav.filter(function (id) { return BY_ID[id]; });
      if (!list.length) { toast('还没有收藏题目'); return; }
    } else {
      list = Q.filter(function (q) { return q.type === mode; }).map(function (q) { return q.id; });
      if (!list.length) { toast('该题型暂无题目'); return; }
      if (S.set.shuffle) list = shuffle(list);
    }
    S.sess = { mode: mode, list: list, i: 0, done: {} };
    picks = [];
    saveNow();
    view = 'quiz';
    render(true);
  }

  function go(delta) {
    if (!S.sess) return;
    var n = S.sess.i + delta;
    if (n < 0) return;
    S.sess.i = Math.min(n, S.sess.list.length);
    picks = [];
    saveNow();
    render(true);
  }

  function answerSingle(i) {
    var q = curQ(); if (!q || doneOf(q)) return;
    var ok = i === q.ans[0];
    S.sess.done[q.id] = { ok: ok, sel: [i] };
    record(q.id, ok);
    saveNow();
    render();
  }

  function togglePick(i) {
    var q = curQ(); if (!q || doneOf(q)) return;
    var p = picks.indexOf(i);
    if (p >= 0) picks.splice(p, 1); else picks.push(i);
    render();
  }

  function submit() {
    var q = curQ(); if (!q || doneOf(q)) return;
    if (q.type === 'multi') {
      if (!picks.length) { toast('请至少选择一个选项'); return; }
      var a = q.ans.slice().sort().join(',');
      var b = picks.slice().sort().join(',');
      var ok = a === b;
      S.sess.done[q.id] = { ok: ok, sel: picks.slice() };
      record(q.id, ok);
    } else if (q.type === 'fill') {
      var inputs = document.querySelectorAll('.fillslot');
      var val = [], res = [], allOk = true;
      for (var k = 0; k < q.blanks.length; k++) {
        var v = inputs[k] ? inputs[k].value : '';
        val.push(v);
        var good = fillOk(q.blanks[k], v);
        res.push(good);
        if (!good) allOk = false;
      }
      S.sess.done[q.id] = { ok: allOk, val: val, res: res };
      record(q.id, allOk);
    }
    saveNow();
    render();
  }

  function selfGrade(ok) {
    var q = curQ(); if (!q) return;
    var d = doneOf(q);
    if (d && d.ok !== undefined) return;
    S.sess.done[q.id] = Object.assign({}, d || {}, { ok: ok, open: true });
    record(q.id, ok);
    saveNow();
    render();
  }

  /* ---------------- 列表页 ---------------- */
  VIEWS.wrong = function () {
    var ids = Object.keys(S.wrong).filter(function (id) { return BY_ID[id]; })
      .sort(function (a, b) { return (S.wrong[b].ts || 0) - (S.wrong[a].ts || 0); });
    var h = '<div class="quizhead"><button class="btn sm ghost" data-act="home">← 返回</button>' +
      '<span class="counter">错题本 · <b>' + ids.length + '</b> 题</span><span class="grow"></span>' +
      (ids.length ? '<button class="btn sm ghost" data-act="clearwrong">清空</button>' : '') + '</div>';
    if (!ids.length) return h + '<div class="empty"><div class="big">✦</div><p>错题本是空的</p><p>答错的题目会自动收进这里</p></div>';
    h += '<div style="margin-bottom:12px"><button class="btn primary wide" data-act="start" data-mode="wrong">开始重做（' + ids.length + ' 题）</button></div>';
    h += '<div class="list">';
    ids.forEach(function (id) {
      var q = BY_ID[id];
      h += '<div class="item" data-act="jump" data-id="' + id + '">' +
        '<span class="idx">' + q.no + '</span>' +
        '<div class="body"><div class="txt">' + esc(q.stem).replace(new RegExp(BLANK, 'g'), '____') + '</div>' +
        '<div class="meta"><span>' + TYPE_NAME[q.type] + '</span><span class="warn">错 ' +
        ((S.wrong[id].n) || 1) + ' 次</span></div></div></div>';
    });
    h += '</div>';
    return h;
  };

  VIEWS.fav = function () {
    var ids = S.fav.filter(function (id) { return BY_ID[id]; });
    var h = '<div class="quizhead"><button class="btn sm ghost" data-act="home">← 返回</button>' +
      '<span class="counter">收藏 · <b>' + ids.length + '</b> 题</span></div>';
    if (!ids.length) return h + '<div class="empty"><div class="big">☆</div><p>还没有收藏</p><p>答题页右上角可以收藏重点题</p></div>';
    h += '<div style="margin-bottom:12px"><button class="btn primary wide" data-act="start" data-mode="fav">开始练习（' + ids.length + ' 题）</button></div>';
    h += '<div class="list">';
    ids.forEach(function (id) {
      var q = BY_ID[id];
      h += '<div class="item" data-act="jump" data-id="' + id + '">' +
        '<span class="idx">' + q.no + '</span>' +
        '<div class="body"><div class="txt">' + esc(q.stem).replace(new RegExp(BLANK, 'g'), '____') + '</div>' +
        '<div class="meta"><span>' + TYPE_NAME[q.type] + '</span></div></div></div>';
    });
    h += '</div>';
    return h;
  };

  VIEWS.settings = function () {
    var s = stats();
    var h = '<div class="quizhead"><button class="btn sm ghost" data-act="home">← 返回</button>' +
      '<span class="counter">设置与备份</span></div>';

    h += '<div class="card" style="overflow:hidden;margin-bottom:14px">';
    h += '<div class="setrow"><div class="lbl"><b>题型乱序</b><span>按题型练习时打乱顺序</span></div>' +
      '<button class="switch' + (S.set.shuffle ? ' on' : '') + '" data-act="toggle-shuffle"></button></div>';
    h += '</div>';

    h += '<div class="section-title">进度备份</div>';
    h += '<div class="card" style="padding:16px;display:flex;flex-direction:column;gap:10px">';
    h += '<div class="muted" style="font-size:13px;line-height:1.8">进度只保存在当前浏览器。' +
      '换手机 / 换浏览器 / 清理缓存前，请先导出备份文件，之后在新页面导入即可恢复。</div>';
    h += '<div class="row" style="gap:9px">' +
      '<button class="btn" style="flex:1" data-act="export">导出备份</button>' +
      '<button class="btn" style="flex:1" data-act="import">导入备份</button></div>';
    h += '<input type="file" id="filein" accept="application/json,.json" style="display:none">';
    h += '</div>';

    h += '<div class="section-title">统计</div>';
    h += '<div class="card" style="padding:16px;font-size:14px;line-height:2.1">' +
      '<div class="row"><span class="muted">总题数</span><span class="grow"></span><b>' + s.total + '</b></div>' +
      '<div class="row"><span class="muted">已练习</span><span class="grow"></span><b>' + s.answered + '</b></div>' +
      '<div class="row"><span class="muted">累计答对 / 答错</span><span class="grow"></span><b>' + s.c + ' / ' + s.w + '</b></div>' +
      '<div class="row"><span class="muted">正确率</span><span class="grow"></span><b>' + s.acc + '%</b></div>' +
      '<div class="row"><span class="muted">收藏</span><span class="grow"></span><b>' + s.fav + '</b></div>' +
      '</div>';

    h += '<div class="section-title">危险操作</div>';
    h += '<div style="margin-bottom:20px"><button class="btn wide" data-act="reset" style="color:var(--bad)">清除全部进度</button></div>';

    h += '<div class="foot">团课刷题 · 单页应用，可离线使用<br>数据格式 v' + S.v + '</div>';
    return h;
  };

  /* ---------------- 事件 ---------------- */
  document.addEventListener('click', function (e) {
    if (!e.target || !e.target.closest) return;
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');

    if (act === 'forgive') {
      e.preventDefault();
      var q0 = curQ(); if (!q0) return;
      var d0 = doneOf(q0); if (!d0) return;
      if (d0.ok) return;
      record(q0.id, true);
      d0.ok = true;
      saveNow();
      render();
      return;
    }

    switch (act) {
      case 'home':
        view = 'home'; render(true); break;

      case 'start':
        start(el.getAttribute('data-mode')); break;

      case 'nav':
        view = el.getAttribute('data-mode'); render(true); break;

      case 'resume':
        if (S.sess) { view = 'quiz'; picks = []; render(true); }
        break;

      case 'restart':
        if (S.sess) start(S.sess.mode);
        break;

      case 'pick':
        var i = parseInt(el.getAttribute('data-i'), 10);
        var qq = curQ();
        if (!qq) break;
        if (qq.type === 'single') answerSingle(i); else togglePick(i);
        break;

      case 'submit':
        submit(); break;

      case 'next':
        go(1); break;

      case 'prev':
        go(-1); break;

      case 'fav':
        var qf = curQ(); if (!qf) break;
        var at = S.fav.indexOf(qf.id);
        if (at >= 0) { S.fav.splice(at, 1); toast('已取消收藏'); }
        else { S.fav.push(qf.id); toast('已收藏'); }
        saveNow(); render(); break;

      case 'reveal':
        var qr = curQ(); if (!qr) break;
        var dr = doneOf(qr) || {};
        dr.open = true;
        S.sess.done[qr.id] = dr;
        saveNow(); render(); break;

      case 'self':
        selfGrade(el.getAttribute('data-ok') === '1'); break;

      case 'jump':
        var id = parseInt(el.getAttribute('data-id'), 10);
        if (!BY_ID[id]) break;
        var mode = (view === 'fav') ? 'fav' : 'wrong';
        S.sess = { mode: mode, list: [id], i: 0, done: {} };
        picks = []; saveNow(); view = 'quiz'; render(true); break;

      case 'clearwrong':
        if (confirm('确定清空错题本吗？（答题记录会保留）')) { S.wrong = {}; saveNow(); render(); }
        break;

      case 'toggle-shuffle':
        S.set.shuffle = !S.set.shuffle; saveNow(); render(); break;

      case 'export':
        var blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        var d2 = new Date();
        a.href = URL.createObjectURL(blob);
        a.download = '团课刷题备份-' + d2.getFullYear() + String(d2.getMonth() + 1).padStart(2, '0') +
          String(d2.getDate()).padStart(2, '0') + '.json';
        document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        toast('备份已导出');
        break;

      case 'import':
        var fin = $('#filein'); if (fin) fin.click();
        break;

      case 'reset':
        if (confirm('将清除全部练习进度、错题与收藏，且无法恢复。确定继续吗？')) {
          S = blankState(); saveNow(); view = 'home'; render(true); toast('已重置');
        }
        break;
    }
  });

  /* 输入框：回车跳到下一个空，最后一个回车提交 */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target && e.target.classList && e.target.classList.contains('fillslot')) {
      e.preventDefault();
      var slots = Array.prototype.slice.call(document.querySelectorAll('.fillslot'));
      var k = slots.indexOf(e.target);
      if (k >= 0 && k < slots.length - 1) slots[k + 1].focus();
      else submit();
      return;
    }
    if (e.key === 'Enter' && view === 'quiz' && S.sess && !(e.target && e.target.tagName === 'INPUT')) {
      var q = curQ();
      if (!q) return;
      if (doneOf(q)) go(1);
      else if (q.type === 'multi' || q.type === 'fill') submit();
      else if (q.type === 'single') go(1);
      return;
    }
    /* 单选题：数字或字母直接选 */
    if (view === 'quiz' && S.sess) {
      var q2 = curQ();
      if (!q2 || doneOf(q2)) return;
      if (q2.type !== 'single' && q2.type !== 'multi') return;
      var key = e.key.toUpperCase();
      var idx = -1;
      if (/^[1-6]$/.test(key)) idx = parseInt(key, 10) - 1;
      else if (LETTERS.indexOf(key) >= 0) idx = LETTERS.indexOf(key);
      if (idx >= 0 && idx < q2.opts.length) {
        if (q2.type === 'single') answerSingle(idx); else togglePick(idx);
      }
    }
  });

  /* 填空输入框随内容变宽 */
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (!el || !el.classList || !el.classList.contains('fillslot')) return;
    var n = (el.value || '').length;
    el.style.width = Math.min(Math.max(n * 1.12, 4), 16) + 'em';
  });

  /* 文件导入 */
  document.addEventListener('change', function (e) {
    if (!e.target || e.target.id !== 'filein') return;
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var o = JSON.parse(fr.result);
        if (!o || typeof o !== 'object' || !o.rec) throw new Error('格式不正确');
        S.rec = o.rec || {};
        S.fav = Array.isArray(o.fav) ? o.fav.filter(function (id) { return BY_ID[id]; }) : [];
        S.wrong = o.wrong || {};
        S.set = Object.assign({ shuffle: false }, o.set || {});
        S.sess = null;
        saveNow();
        view = 'home'; render(true);
        toast('备份已导入');
      } catch (err) {
        alert('导入失败：文件格式不正确');
      }
    };
    fr.readAsText(f);
    e.target.value = '';
  });

  /* 滚动阴影 */
  window.addEventListener('scroll', function () {
    var tb = $('#topbar');
    if (!tb) return;
    tb.classList.toggle('scrolled', window.scrollY > 4);
  }, { passive: true });

  function bindInputs() {
    var first = document.querySelector('.fillslot:not([readonly])');
    /* 不自动聚焦：移动端会顶起键盘，这里只做占位 */
  }

  /* 离开页面前落盘 */
  window.addEventListener('pagehide', saveNow);
  window.addEventListener('beforeunload', saveNow);

  /* 启动 */
  if (!Q.length) {
    $('#view').innerHTML = '<div class="empty"><div class="big">!</div><p>题库数据加载失败</p></div>';
  } else {
    render(false);
  }
})();
