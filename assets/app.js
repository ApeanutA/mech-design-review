/* 机械设计期末复习 · 应用逻辑（无依赖） */
(function () {
  "use strict";

  var Q = window.QDATA || { chapters: [], stats: {}, total: 0 };
  var EX = window.EXAMPLES || { chapters: [], examCount: 0 };

  var KIND_NAME = { choice: "单项选择题", blank: "填空题", judge: "判断对错题", short: "名词解释及简答题" };
  var KIND_SHORT = { choice: "选择", blank: "填空", judge: "判断", short: "简答" };
  var KIND_ORDER = ["choice", "blank", "judge", "short"];

  /* ================= 存储 ================= */
  var KEY = "mechdesign-review-v1";
  var store = { rec: {}, wrong: [], good: [], dark: false };
  var session = null;   // 当前练习会话

  function loadStore() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var o = JSON.parse(raw);
        store.rec = o.rec || {};
        store.wrong = o.wrong || [];
        store.good = o.good || [];
        store.dark = !!o.dark;
      }
    } catch (e) { /* 隐私模式等，忽略 */ }
  }
  function saveStore() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {}
  }

  /* ================= 题目索引 ================= */
  var QMAP = {};
  var ALLQ = [];
  Q.chapters.forEach(function (ch) {
    ch.sections.forEach(function (s) {
      s.questions.forEach(function (q) {
        q._ch = ch.no; q._chName = ch.name; q._kind = s.kind;
        QMAP[q.id] = q; ALLQ.push(q);
      });
    });
  });

  /* ================= 小工具 ================= */
  function h(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  /* 题干转 HTML：填空位显示成下划线占位 */
  /* 公式渲染总入口：$...$ 包起来的部分交给 KaTeX 做印刷体数学排版，
     其余文字继续走下面的角标规则。人工修订的公式就用 $ 包 LaTeX 写（见 tools/extract_hw.py 的 FIX_* 表）。 */
  function katexSpan(tex) {
    if (typeof katex === "undefined" || !katex || !katex.renderToString) return esc(tex);
    try {
      return katex.renderToString(tex, { throwOnError: false, errorColor: "#cc0000" });
    } catch (e) {
      return esc(tex);
    }
  }
  function mathHtml(s) {
    var str = String(s == null ? "" : s);
    if (str.indexOf("**") < 0) return mathSeg(str);
    return str.split(/(\*\*[^*]+\*\*)/).map(function (seg) {
      if (seg.length > 4 && seg.slice(0, 2) === "**") return "<strong>" + mathSeg(seg.slice(2, -2)) + "</strong>";
      return mathSeg(seg);
    }).join("");
  }
  function mathSeg(s) {
    var str = String(s == null ? "" : s);
    if (str.indexOf("$") < 0) return mathPlain(str);
    var out = "", last = 0, m, re = /\$([^$]+)\$/g;
    while ((m = re.exec(str)) !== null) {
      out += mathPlain(str.slice(last, m.index));
      out += katexSpan(m[1]);
      last = m.index + m[0].length;
    }
    return out + mathPlain(str.slice(last));
  }
  /* 公式角标还原。
     PDF 文字层里 d₁、σ_b 这类角标都是平排的普通字符（σ 和 b 之间还有排版空格），
     直接显示就是 "σ b =540N/mm2" 这种样子，这里按机械设计的常见写法还原。
     数据里也能写 _{..} / ^{..} 精确指定（人工修订的公式用这个，见 tools/extract_hw.py 的 FIX_* 表）。 */
  function mathPlain(s) {
    var t = esc(s);
    // 0) 单位里的平方 —— 必须最先做，否则 m2 会被下一条规则当成下标
    t = t.replace(/N\/mm2/g, "N/mm<sup>2</sup>")
         .replace(/mm2/g, "mm<sup>2</sup>")
         .replace(/cm2/g, "cm<sup>2</sup>");
    // 1) 人工指定的 _{..} / ^{..}
    t = t.replace(/_\{([^}]*)\}/g, "<sub>$1</sub>")
         .replace(/\^\{([^}]*)\}/g, "<sup>$1</sup>");
    // 2) σmax / σmin —— 要排在「希腊字母+单字母」之前，否则会被切成 σ_m ax
    t = t.replace(/([στεαβδλφηωγθμνρ])\s?(max|min)(?![A-Za-z])/g, "$1<sub>$2</sub>");
    // 3) 希腊字母 + 下标字母（可带数字）：σ b → σ_b、σF1 → σ_F1
    t = t.replace(/([στεαβδλφηωγθμνρ])\s?([A-Za-z])(\d{0,3})(?![0-9A-Za-z])/g,
      function (m, g, l, d) { return g + "<sub>" + l + d + "</sub>"; });
    // 4) 希腊字母 + 数字：α1 → α_1、δ1 → δ_1、σ 0 → σ_0
    t = t.replace(/([στεαβδλφηωγθμνρ])\s?(\d+)(?![0-9A-Za-z])/g, "$1<sub>$2</sub>");
    // 4b) 希腊字母 + 带符号数字：σ-1（对称循环疲劳极限）、σ+1
    t = t.replace(/([στεαβδλφηωγθμνρ])\s?([-+]\d+)(?![0-9A-Za-z])/g, "$1<sub>$2</sub>");
    // 5a) 拉丁字母 + 数字 + m：z1m → z_1 m、d1m → d_1 m
    //     只认尾随的 m（数字后面跟的那个 m 是独立变量），放宽会把 ZCuSn10P1 这类牌号切坏
    t = t.replace(/(?<![0-9])([A-LN-Za-ln-z])(\d{1,2})(m)(?![a-zA-Z])/g,
      function (m0, l, d, tail) { return l + "<sub>" + d + "</sub>" + tail; });
    // 5) 拉丁字母 + 数字：d1 → d_1、F0 → F_0、HBW1 → HBW_1
    //    只认 1~2 位数字，否则 HT200 / Q235 这类牌号会被切开；
    //    (?<![0-9]) 是为了放过 ZCuSn10P1 这类牌号里的「10P1」。
    //    跳过 M/m：M12、M16 是螺纹规格，m 单独作模数时另有写法，都不是下标
    t = t.replace(/(?<![0-9])([A-LN-Za-ln-z])(\d{1,2})(?![0-9A-Za-z])/g, "$1<sub>$2</sub>");
    // 5b) V 带小带轮的最小直径 dd1min —— 整个 d1min 都是下标
    t = t.replace(/\bdd1min\b/g, "d<sub>d1min</sub>");
    // 6) 少数固定的双字母下标：Cb/Cm（螺栓与被联接件的刚度）、KA/KV（齿轮载荷系数）、Lh（轴承寿命）
    t = t.replace(/\bC([bm])(?![A-Za-z])/g, "C<sub>$1</sub>")
         .replace(/\bK([AV])(?![A-Za-z])/g, "K<sub>$1</sub>")
         .replace(/\bL(h)(?![A-Za-z])/g, "L<sub>$1</sub>");
    return t;
  }
  function stemHtml(s) {
    var t = mathHtml(s);
    t = t.replace(/[＿_]{2,}/g, '<span class="bk"></span>');
    t = t.replace(/ {3,}/g, '<span class="bk"></span>');
    return t;
  }
  function chapterByNo(no) {
    for (var i = 0; i < Q.chapters.length; i++) if (Q.chapters[i].no === +no) return Q.chapters[i];
    return null;
  }
  function questionsOf(chNo, kind) {
    var ch = chapterByNo(chNo);
    if (!ch) return [];
    var out = [];
    ch.sections.forEach(function (s) { if (!kind || s.kind === kind) out = out.concat(s.questions); });
    return out;
  }
  function isRec(id) { return store.rec[id]; }
  function setRec(id, ok) {
    store.rec[id] = { ok: !!ok, t: Date.now() };
    var wi = store.wrong.indexOf(id);
    if (!ok) { if (wi < 0) store.wrong.push(id); }
    else if (wi >= 0) { store.wrong.splice(wi, 1); }
    saveStore();
  }
  function toggleGood(id) {
    var i = store.good.indexOf(id);
    if (i < 0) store.good.push(id); else store.good.splice(i, 1);
    saveStore();
  }
  function clearRec(id) { delete store.rec[id]; saveStore(); }

  /* ================= 主题 ================= */
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", store.dark ? "dark" : "light");
    var b = document.getElementById("themeBtn");
    if (b) b.textContent = store.dark ? "☀" : "🌙";
  }

  /* ================= 路由 ================= */
  function go(hash) { location.hash = hash; }
  function parseHash() {
    var raw = (location.hash || "#/").replace(/^#\/?/, "");
    return raw.split("/").filter(Boolean);
  }

  function render() {
    var p = parseHash();
    var app = document.getElementById("app");
    app.innerHTML = "";
    window.scrollTo(0, 0);
    if (!p.length) return viewHome(app);
    if (p[0] === "ch") return viewChapter(app, +p[1], p[2]);
    if (p[0] === "quiz") return viewQuizSetup(app, p[1] === "wrong" ? "wrong" : "all");
    if (p[0] === "notes") return viewNotes(app, p[1]);
    if (p[0] === "run") return viewSession(app);
    if (p[0] === "exam") return viewExam(app, p[1] ? +p[1] : null, p[2] ? +p[2] : null);
    if (p[0] === "wrong") return viewCollection(app, "wrong");
    if (p[0] === "good") return viewCollection(app, "good");
    return viewHome(app);
  }

  function navBar(active) {
    var nav = document.getElementById("nav");
    nav.innerHTML = "";
    [["#/", "章节", ""], ["#/quiz", "抽题训练", "quiz"],
     ["#/notes", "知识点", "notes"],
     ["#/exam", "大题原图", "exam"], ["#/wrong", "错题本", "wrong"],
     ["#/good", "收藏", "good"]].forEach(function (it) {
      var b = h("button", null, it[1]);
      if (it[2] === active) b.className = "on";
      b.onclick = function () { go(it[0]); };
      nav.appendChild(b);
    });
  }

  /* 例题标题：太短用章名兜底，过长则截断 */
  function exTitle(ch, e) {
    var t = (e.title || "").trim();
    if (t.length < 6) t = ch.name || t;
    return t.length > 26 ? t.slice(0, 26) + "…" : t;
  }

  /* ================= 首页 ================= */
  function viewHome(app) {
    navBar("");
    var wrap = h("div", "wrap");

    var hero = h("div", "card hero");
    hero.appendChild(h("h1", null, "机械设计 · 期末复习"));
    var sub = h("p");
    sub.textContent = "小题原题 " + Q.total + " 道 · 考点例题原图 " + EX.examCount +
      " 道 · 分章节刷题与抽题训练，答案与题目一一对应。";
    hero.appendChild(sub);

    var stats = h("div", "hero-stats");
    var doneN = Object.keys(store.rec).length;
    var okN = Object.keys(store.rec).filter(function (k) { return store.rec[k].ok; }).length;
    var rate = doneN ? Math.round(okN / doneN * 100) : 0;
    [["已做题", doneN + " / " + Q.total], ["正确率", doneN ? rate + "%" : "—"],
     ["错题", store.wrong.length + " 道"], ["收藏", store.good.length + " 道"]].forEach(function (s) {
      var d = h("div", "hstat");
      d.appendChild(h("b", null, s[1]));
      d.appendChild(h("span", null, s[0]));
      stats.appendChild(d);
    });
    hero.appendChild(stats);
    wrap.appendChild(hero);

    /* 知识点 & 大题思路 入口 */
    var NL = notesList();
    if (NL.length) {
      var np0 = 0, ne0 = 0, nc0 = 0;
      NL.forEach(function (ch) {
        np0 += (ch.points || []).length;
        ne0 += (ch.patterns || []).length;
        nc0 += (ch.calc || []).length;
      });
      var t0 = h("div", "sec-title");
      t0.appendChild(document.createTextNode("📗 知识点 & 题型解法"));
      t0.appendChild(h("em", null, "考前速览 · 可打印"));
      wrap.appendChild(t0);

      var nb = h("button", "card notes-entry");
      var nbL = h("div", "ne-l");
      nbL.appendChild(h("h3", null, "知识点与公式 · 同类题型解法 · 客观题计算题"));
      nbL.appendChild(h("div", "meta", "按考试范围逐章整理 " + NL.length +
        " 章 —— 知识点 " + np0 + " 条 · 题型解法 " + ne0 + " 类 · 客观题计算题 " + nc0 + " 道"));
      nb.appendChild(nbL);
      var nbR = h("div", "ne-r");
      nbR.appendChild(h("span", "badge", "共 " + (np0 + ne0 + nc0) + " 条"));
      nbR.appendChild(h("span", "go-arrow", "查看 →"));
      nb.appendChild(nbR);
      nb.onclick = function () { go("#/notes"); };
      wrap.appendChild(nb);
    }

    /* 章节 */
    var t1 = h("div", "sec-title");
    t1.appendChild(document.createTextNode("📘 分章节刷题"));
    t1.appendChild(h("em", null, "共 " + Q.chapters.length + " 章"));
    wrap.appendChild(t1);

    var grid = h("div", "grid");
    Q.chapters.forEach(function (ch) {
      var total = 0, done = 0;
      ch.sections.forEach(function (s) {
        total += s.questions.length;
        s.questions.forEach(function (q) { if (store.rec[q.id]) done++; });
      });
      var c = h("button", "card ch-card");
      var no = h("span", "no", "第 " + ch.no + " 章");
      c.appendChild(no);
      c.appendChild(h("h3", null, ch.name));
      var bits = ch.sections.map(function (s) { return KIND_SHORT[s.kind] + " " + s.questions.length; }).join(" · ");
      c.appendChild(h("div", "meta", bits));
      var bar = h("div", "ch-bar"); var i = h("i");
      i.style.width = (total ? done / total * 100 : 0) + "%";
      bar.appendChild(i); c.appendChild(bar);
      c.appendChild(h("div", "meta", "进度 " + done + " / " + total));
      c.onclick = function () { go("#/ch/" + ch.no); };
      grid.appendChild(c);
    });
    wrap.appendChild(grid);

    /* 考点例题 */
    var t2 = h("div", "sec-title");
    t2.appendChild(document.createTextNode("🔥 期末大题范围（考点例题）"));
    t2.appendChild(h("em", null, EX.examCount + " 道"));
    wrap.appendChild(t2);

    var eg = h("div", "grid");
    EX.chapters.forEach(function (ch) {
      ch.examples.filter(function (e) { return e.exam; }).forEach(function (e) {
        var c = h("button", "card ex-card");
        c.appendChild(h("span", "badge", "第" + ch.no + "章"));
        var box = h("div");
        box.appendChild(h("div", "t", "例 " + e.no + " · " + exTitle(ch, e)));
        box.appendChild(h("div", "d", e.pages.length + " 页原图" + (e.note ? " · " + e.note : "")));
        c.appendChild(box);
        c.onclick = function () { go("#/exam/" + ch.no + "/" + e.no); };
        eg.appendChild(c);
      });
    });
    wrap.appendChild(eg);

    wrap.appendChild(aiDisclaimer());
    app.appendChild(wrap);
  }

  /* ================= 章节练习 ================= */
  function viewChapter(app, chNo, kind) {
    navBar("");
    var ch = chapterByNo(chNo);
    if (!ch) { go("#/"); return; }
    if (!kind) kind = ch.sections[0].kind;

    var wrap = h("div", "wrap");
    var crumb = h("div", "crumb");
    var b = h("button", null, "← 全部章节"); b.onclick = function () { go("#/"); };
    crumb.appendChild(b);
    crumb.appendChild(document.createTextNode("/ 第 " + ch.no + " 章 " + ch.name));
    wrap.appendChild(crumb);

    var tabs = h("div", "tabs");
    ch.sections.forEach(function (s) {
      var t = h("button", "tab", s.label + " ");
      t.appendChild(h("span", "n", s.questions.length));
      if (s.kind === kind) t.className = "tab on";
      t.onclick = function () { go("#/ch/" + ch.no + "/" + s.kind); };
      tabs.appendChild(t);
    });
    wrap.appendChild(tabs);

    var list = questionsOf(ch.no, kind);

    // 工具条
    var bar = h("div", "row");
    bar.style.marginBottom = "13px";
    bar.style.flexWrap = "wrap";
    var startBtn = h("button", "btn", "▶ 开始刷这一组（" + list.length + " 题）");
    startBtn.onclick = function () { startSession(list, "第" + ch.no + "章 · " + KIND_NAME[kind]); };
    bar.appendChild(startBtn);

    var toggle = h("button", "btn ghost sm", "显示全部答案");
    var revealed = false;
    bar.appendChild(toggle);
    bar.appendChild(h("span", "small muted", "点选项即判对错；简答/填空看完答案后自评"));
    wrap.appendChild(bar);

    var holder = h("div");
    wrap.appendChild(holder);

    function paint() {
      holder.innerHTML = "";
      var frag = document.createDocumentFragment();
      list.forEach(function (q, i) {
        frag.appendChild(renderCard(q, { index: i + 1, total: list.length, revealed: revealed }));
      });
      holder.appendChild(frag);
    }
    toggle.onclick = function () {
      revealed = !revealed;
      toggle.textContent = revealed ? "隐藏全部答案" : "显示全部答案";
      paint();
    };
    paint();
    app.appendChild(wrap);
  }

  /* ================= 单题卡片 ================= */
  function renderCard(q, opt) {
    opt = opt || {};
    var card = h("div", "card q");
    card.id = "q-" + q.id;

    var head = h("div", "q-head");
    head.appendChild(h("span", "q-no", opt.index ? ("第 " + opt.index + " 题") : ("#" + q.no)));
    head.appendChild(h("span", "q-kind", KIND_NAME[q._kind] || ""));
    if (q._chName) head.appendChild(h("span", "q-kind", "第" + q._ch + "章 " + q._chName));
    var rec = isRec(q.id);
    if (rec) head.appendChild(h("span", rec.ok ? "done-mark" : "wrong-mark", rec.ok ? "✓ 做对过" : "✗ 做错过"));
    var star = h("button", "btn ghost sm", store.good.indexOf(q.id) >= 0 ? "★ 已收藏" : "☆ 收藏");
    star.style.marginLeft = "auto";
    star.onclick = function () {
      toggleGood(q.id);
      star.textContent = store.good.indexOf(q.id) >= 0 ? "★ 已收藏" : "☆ 收藏";
    };
    head.appendChild(star);
    card.appendChild(head);

    var stem = h("div", "q-stem");
    stem.innerHTML = stemHtml(q.stem);
    card.appendChild(stem);

    var ansBox = h("div", "ans");
    var answered = false;

    function showAnswer() {
      var info = QDATA.answerImgs && QDATA.answerImgs[q.id];
      if (info) {
        /* 填空/简答题的答案里有公式，PDF 文字层里是碎的
           （tanλ/tan(λ+φv) 会变成 ")tan(tanvφλλ+"），所以以原图为准，
           碎掉的文字版收进折叠里，要复制时再展开。 */
        ansBox.className = "ans";
        ansBox.innerHTML = "";
        var fig = h("div", "ans-fig");
        fig.appendChild(h("div", "small muted", "原书答案："));
        var im = document.createElement("img");
        im.src = "img/ans/" + q.id + ".webp";
        im.alt = "原书答案";
        im.loading = "lazy";
        im.width = info.w;
        im.height = info.h;
        im.onclick = function () { lightbox(im.src); };
        fig.appendChild(im);
        ansBox.appendChild(fig);

        if (q.answer) {
          var det = document.createElement("details");
          det.className = "ans-raw";
          var sm = document.createElement("summary");
          sm.textContent = "文字版（公式可能已散架）";
          det.appendChild(sm);
          var pre = h("div", "raw");
          pre.textContent = q.answer;
          det.appendChild(pre);
          ansBox.appendChild(det);
        }
      } else if (!q.answer) {
        ansBox.className = "ans empty";
        ansBox.textContent = "（原书此处无参考答案）";
      } else {
        ansBox.className = "ans";
        ansBox.innerHTML = "<b>答案：</b>" + mathHtml(q.answer);
      }
      ansBox.classList.remove("hidden");
    }

    function afterAnswer(ok) {
      answered = true;
      setRec(q.id, ok);
      if (opt.onAnswered) opt.onAnswered(ok);
    }

    if (q._kind === "choice" && q.options && q.options.length) {
      var keys = q.answer_keys || [];
      var multi = keys.length > 1;
      /* 题干里画了几个空位 → 决定是「按空位顺序填」还是「多选（与顺序无关）」。
         第5章10题/15题这类是「每个空从 A~E 里挑一个」，同一个字母可以填多次
         （答案 BAAE、AABB），所以要按顺序点、点一次记一个，不能像多选那样来回切换。 */
      var blanks = (q.stem.match(/[＿_]{2,}| {3,}/g) || []).length;
      var fillMode = multi && blanks > 1 && blanks === keys.length;
      var picked = [];
      var opts = h("div", "opts");
      var buttons = [];
      var submit = null;
      var strip = null, tools = null, undo = null;

      q.options.forEach(function (o) {
        var b = h("button", "opt");
        b.appendChild(h("span", "k", o.key));
        var vspan = h("span", "v");
        vspan.innerHTML = mathHtml(o.text);
        b.appendChild(vspan);
        b.onclick = function () {
          if (b.classList.contains("locked")) return;
          if (!multi) {
            judge([o.key]);
          } else if (fillMode) {
            if (picked.length >= keys.length) return;   // 已填满，先退格再改
            picked.push(o.key);                          // 同一字母可重复填
            paint();
          } else {
            var i = picked.indexOf(o.key);
            if (i >= 0) { picked.splice(i, 1); b.classList.remove("sel"); }
            else { picked.push(o.key); b.classList.add("sel"); }
            if (submit) submit.disabled = picked.length !== keys.length;
          }
        };
        buttons.push(b);
        opts.appendChild(b);
      });
      /* 填空式选择题：把「第几个空填了什么」画出来，并提供退格/清空 */
      function paint() {
        buttons.forEach(function (b) {
          var k = b.querySelector(".k").textContent;
          if (picked.indexOf(k) >= 0) b.classList.add("sel");
          else b.classList.remove("sel");
        });
        if (strip) {
          strip.innerHTML = keys.map(function (k, i) {
            var v = picked[i];
            return '<span class="slot' + (v ? " on" : "") + '">' + (i + 1) + "．" +
              esc(v == null ? "＿" : v) + "</span>";
          }).join("");
        }
        if (submit) submit.disabled = picked.length !== keys.length;
        if (undo) undo.disabled = picked.length === 0;
      }

      card.appendChild(opts);

      if (multi) {
        var hint = h("div", "small muted");
        hint.style.marginTop = "9px";
        hint.textContent = fillMode
          ? "本题有 " + keys.length + " 个空，按空位顺序逐个点选（同一字母可以重复选），点错可退格。"
          : "多选题：本题有 " + keys.length + " 个正确选项，选够 " + keys.length + " 个后提交（不限顺序）。";
        card.appendChild(hint);
        if (fillMode) {
          strip = h("div", "picks");
          card.appendChild(strip);
          tools = h("div", "row");
          tools.style.marginTop = "9px";
          undo = h("button", "btn sm ghost", "退格");
          undo.disabled = true;
          undo.onclick = function () { if (!picked.length) return; picked.pop(); paint(); };
          var clr = h("button", "btn sm ghost", "清空");
          clr.onclick = function () { picked.length = 0; paint(); };
          tools.appendChild(undo);
          tools.appendChild(clr);
          card.appendChild(tools);
        }
        submit = h("button", "btn sm", "提交答案");
        submit.style.marginTop = "9px";
        submit.disabled = true;
        submit.onclick = function () { judge(picked.slice()); };
        card.appendChild(submit);
        paint();
      }

      function judge(pick) {
        /* 填空式：字母要跟空位一一对上（允许重复字母）；多选：只比较选中的集合 */
        var ok = pick.length === keys.length && (fillMode
          ? pick.every(function (k, i) { return k === keys[i]; })
          : keys.every(function (k) { return pick.indexOf(k) >= 0; }));
        buttons.forEach(function (b) {
          b.classList.add("locked");
          b.classList.remove("sel");
          var k = b.querySelector(".k").textContent;
          if (keys.indexOf(k) >= 0) b.classList.add("ok");
          else if (pick.indexOf(k) >= 0) b.classList.add("bad");
        });
        if (strip) {
          strip.innerHTML = keys.map(function (k, i) {
            var v = pick[i];
            return '<span class="slot on ' + (v === k ? "hit" : "miss") + '">' +
              (i + 1) + "．" + esc(v == null ? "＿" : v) + "</span>";
          }).join("");
        }
        if (tools) tools.remove();
        if (submit) submit.remove();
        var tip = h("div", "small");
        tip.style.marginTop = "10px";
        tip.innerHTML = ok
          ? '<span class="tag-ok">✓ 正确</span>'
          : '<span class="tag-bad">✗ 错，正确答案是 ' + mathHtml(q.answer) + "</span>";
        card.appendChild(tip);
        showAnswer();
        afterAnswer(ok);
      }

      if (opt.revealed) {
        buttons.forEach(function (b) {
          b.classList.add("locked");
          if (keys.indexOf(b.querySelector(".k").textContent) >= 0) b.classList.add("ok");
        });
        if (strip) {
          strip.innerHTML = keys.map(function (k, i) {
            return '<span class="slot on">' + (i + 1) + "．" + esc(k) + "</span>";
          }).join("");
        }
        if (tools) tools.remove();
        if (submit) submit.remove();
        showAnswer();
      }
    } else if (q._kind === "judge") {
      var jr = h("div", "judge-row");
      var jb = {};
      ["√", "×"].forEach(function (sym) {
        var b = h("button", "judge-btn", sym === "√" ? "√ 对" : "× 错");
        b.onclick = function () {
          if (b.classList.contains("locked")) return;
          var ok = q.answer === sym;
          Object.keys(jb).forEach(function (k) {
            jb[k].classList.add("locked");
            if (k === q.answer) jb[k].classList.add("ok");
              else if (k === sym) jb[k].classList.add("bad");
          });
          var tip = h("div", "small");
          tip.style.marginTop = "10px";
          tip.innerHTML = ok ? '<span class="tag-ok">✓ 正确</span>'
            : '<span class="tag-bad">✗ 错，正确答案是 ' + mathHtml(q.answer) + "</span>";
          card.appendChild(tip);
          showAnswer();
          afterAnswer(ok);
        };
        jb[sym] = b;
        jr.appendChild(b);
      });
      card.appendChild(jr);
      if (opt.revealed) {
        Object.keys(jb).forEach(function (k) {
          jb[k].classList.add("locked");
          if (k === q.answer) jb[k].classList.add("ok");
        });
        showAnswer();
      }
    } else {
      /* 填空 / 简答：自评 */
      var foot = h("div", "q-foot");
      var see = h("button", "btn sm ghost", "显示答案");
      see.onclick = function () {
        showAnswer();
        see.style.display = "none";
        selfBox.style.display = "flex";
      };
      var selfBox = h("div", "row");
      selfBox.style.display = "none";
      var okB = h("button", "btn sm", "✓ 我答对了");
      var badB = h("button", "btn sm ghost", "✗ 我答错了");
      okB.onclick = function () { afterAnswer(true); okB.textContent = "✓ 已记做对"; okB.disabled = true; badB.disabled = true; };
      badB.onclick = function () { afterAnswer(false); badB.textContent = "✗ 已记做错"; okB.disabled = true; badB.disabled = true; };
      selfBox.appendChild(okB); selfBox.appendChild(badB);
      foot.appendChild(see); foot.appendChild(selfBox);
      card.appendChild(foot);
      ansBox.classList.add("hidden");
      card.appendChild(ansBox);
      if (opt.revealed) { showAnswer(); see.style.display = "none"; selfBox.style.display = "flex"; }
    }

    if (q._kind === "choice" || q._kind === "judge") {
      ansBox.classList.add("hidden");
      card.appendChild(ansBox);
    }
    return card;
  }

  /* ================= 练习会话（抽题 / 成组刷题） ================= */
  function startSession(list, title) {
    if (!list.length) return;
    session = { list: list.slice(), idx: 0, title: title, results: [] };
    go("#/run");
  }

  function viewSession(app) {
    navBar("quiz");
    if (!session || !session.list.length) { go("#/quiz"); return; }
    var wrap = h("div", "wrap");

    var top = h("div", "spread");
    top.style.marginBottom = "13px";
    var left = h("div");
    left.appendChild(h("div", null, session.title)).className = "small muted";
    var counter = h("div", "big-n", (session.idx + 1) + " / " + session.list.length);
    top.appendChild(left); top.appendChild(counter);
    wrap.appendChild(top);

    if (session.idx >= session.list.length) { return viewSessionResult(app, wrap); }

    var q = session.list[session.idx];
    var card = renderCard(q, {
      index: session.idx + 1,
      total: session.list.length,
      onAnswered: function (ok) {
        session.results.push({ id: q.id, ok: ok });
        var next = h("button", "btn", session.idx + 1 >= session.list.length ? "查看成绩 →" : "下一题 →");
        next.style.marginTop = "13px";
        next.onclick = function () { session.idx++; render(); };
        card.appendChild(next);
        next.focus();
      }
    });
    wrap.appendChild(card);

    var quit = h("button", "btn ghost sm", "结束本组");
    quit.onclick = function () { if (confirm("结束本组练习？已答的会保留。")) { session.idx = session.list.length; render(); } };
    wrap.appendChild(quit);
    app.appendChild(wrap);
  }

  function viewSessionResult(app, wrap) {
    navBar("quiz");
    var rs = session.results || [];
    var ok = rs.filter(function (r) { return r.ok; }).length;
    var rate = rs.length ? Math.round(ok / rs.length * 100) : 0;

    var card = h("div", "card panel");
    card.appendChild(h("div", "sec-title", "本轮成绩"));
    var st = h("div", "hero-stats");
    [["答对", ok + " 题"], ["答错", (rs.length - ok) + " 题"], ["正确率", rate + "%"]].forEach(function (s) {
      var d = h("div", "hstat"); d.appendChild(h("b", null, s[1])); d.appendChild(h("span", null, s[0]));
      st.appendChild(d);
    });
    card.appendChild(st);
    wrap.appendChild(card);

    if (rs.length - ok > 0) {
      var t = h("div", "sec-title", "本轮错题（" + (rs.length - ok) + "）");
      wrap.appendChild(t);
      rs.filter(function (r) { return !r.ok; }).forEach(function (r, i) {
        var q = QMAP[r.id];
        if (q) wrap.appendChild(renderCard(q, { index: i + 1, revealed: true }));
      });
    }

    var bar = h("div", "row");
    bar.style.flexWrap = "wrap";
    var again = h("button", "btn", "再来一组");
    again.onclick = function () { go("#/quiz"); };
    var home = h("button", "btn ghost", "回到首页");
    home.onclick = function () { go("#/"); };
    bar.appendChild(again); bar.appendChild(home);
    wrap.appendChild(bar);
    app.appendChild(wrap);
  }

  /* ================= 抽题设置 ================= */
  var quizCfg = { src: "all", chs: null, kinds: null, n: 20 };

  function wrongQuestions() {
    return store.wrong.map(function (id) { return QMAP[id]; }).filter(Boolean);
  }

  function viewQuizSetup(app, src) {
    navBar("quiz");
    quizCfg.src = src === "wrong" ? "wrong" : "all";
    if (!quizCfg.chs) quizCfg.chs = Q.chapters.map(function (c) { return c.no; });
    if (!quizCfg.kinds) quizCfg.kinds = KIND_ORDER.slice();
    var wrongQ = wrongQuestions();
    var base = quizCfg.src === "wrong" ? wrongQ : ALLQ;

    var wrap = h("div", "wrap");
    var card = h("div", "card panel");
    card.appendChild(h("div", "sec-title", "🎯 抽题训练"));
    card.appendChild(h("p", "small muted", "选范围与题量，随机抽题做一遍；做完给成绩并自动收集错题。"));

    // 题源
    var f0 = h("div", "fld");
    f0.appendChild(h("label", null, "题源"));
    var c0 = h("div", "chips");
    [["all", "全部题库", ALLQ.length], ["wrong", "错题本", wrongQ.length]].forEach(function (it) {
      var on = quizCfg.src === it[0];
      var b = h("button", "chip" + (on ? " on" : ""), it[1] + "（" + it[2] + " 题）");
      b.disabled = it[0] === "wrong" && it[2] === 0;
      b.onclick = function () { go("#/quiz/" + it[0]); };
      c0.appendChild(b);
    });
    f0.appendChild(c0);
    f0.appendChild(h("p", "small muted", quizCfg.src === "wrong"
      ? "只从错题本里抽，可再按章节、题型收窄；做对了的题会自动从错题本移出。"
      : "从全部题库里抽。想专攻做错的题，切到「错题本」。"));
    card.appendChild(f0);

    // 章节
    var f1 = h("div", "fld");
    f1.appendChild(h("label", null, "章节范围"));
    var c1 = h("div", "chips");
    var allCh = h("button", "chip", "全选");
    allCh.onclick = function () { quizCfg.chs = Q.chapters.map(function (c) { return c.no; }); render(); };
    c1.appendChild(allCh);
    Q.chapters.forEach(function (ch) {
      var on = quizCfg.chs.indexOf(ch.no) >= 0;
      var label = "第" + ch.no + "章";
      var cnt = 0;
      if (quizCfg.src === "wrong") {
        cnt = wrongQ.filter(function (q) { return q._ch === ch.no; }).length;
        label += " " + cnt;
      }
      var b = h("button", "chip" + (on ? " on" : ""), label);
      if (quizCfg.src === "wrong" && !cnt) b.disabled = true;
      b.onclick = function () {
        var i = quizCfg.chs.indexOf(ch.no);
        if (i >= 0) quizCfg.chs.splice(i, 1); else quizCfg.chs.push(ch.no);
        render();
      };
      c1.appendChild(b);
    });
    f1.appendChild(c1);
    card.appendChild(f1);

    // 题型
    var f2 = h("div", "fld");
    f2.appendChild(h("label", null, "题型"));
    var c2 = h("div", "chips");
    KIND_ORDER.forEach(function (k) {
      var on = quizCfg.kinds.indexOf(k) >= 0;
      var b = h("button", "chip" + (on ? " on" : ""), KIND_NAME[k]);
      b.onclick = function () {
        var i = quizCfg.kinds.indexOf(k);
        if (i >= 0) quizCfg.kinds.splice(i, 1); else quizCfg.kinds.push(k);
        render();
      };
      c2.appendChild(b);
    });
    f2.appendChild(c2);
    card.appendChild(f2);

    // 题量
    var pool = base.filter(function (q) {
      return quizCfg.chs.indexOf(q._ch) >= 0 && quizCfg.kinds.indexOf(q._kind) >= 0;
    });
    var f3 = h("div", "fld");
    f3.appendChild(h("label", null, "题量（当前范围可用 " + pool.length + " 题）"));
    var c3 = h("div", "chips");
    [10, 20, 30, 50, 0].forEach(function (n) {
      var label = n === 0 ? "全部" : n + " 题";
      var b = h("button", "chip" + (quizCfg.n === n ? " on" : ""), label);
      b.onclick = function () { quizCfg.n = n; render(); };
      c3.appendChild(b);
    });
    f3.appendChild(c3);
    card.appendChild(f3);

    var start = h("button", "btn", "开始抽题（" + (quizCfg.n === 0 ? pool.length : Math.min(quizCfg.n, pool.length)) + " 题）");
    start.disabled = pool.length === 0;
    start.onclick = function () {
      var n = quizCfg.n === 0 ? pool.length : Math.min(quizCfg.n, pool.length);
      var shuffled = pool.slice();
      for (var i = shuffled.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t;
      }
      startSession(shuffled.slice(0, n), (quizCfg.src === "wrong" ? "错题训练 · " : "抽题训练 · ") + n + " 题");
    };
    card.appendChild(start);
    wrap.appendChild(card);
    app.appendChild(wrap);
  }

  /* ================= 大题原图 ================= */
  function viewExam(app, chNo, exNo) {
    navBar("exam");
    var wrap = h("div", "wrap");

    if (!chNo) {
      wrap.appendChild(h("div", "sec-title", "🔥 期末大题范围"));
      wrap.appendChild(h("p", "small muted", "按老师给的范围列出考点例题；点进去看原题与解答原图（考试会改数字，重点看解题步骤）。"));
      EX.chapters.forEach(function (ch) {
        var t = h("div", "sec-title");
        t.appendChild(document.createTextNode("第 " + ch.no + " 章 " + ch.name));
        wrap.appendChild(t);
        var g = h("div", "grid");
        ch.examples.forEach(function (e) {
          var c = h("button", "card ex-card");
          if (e.exam) c.appendChild(h("span", "badge", "考点"));
          else c.appendChild(h("span", "badge", "了解"));
          var box = h("div");
          box.appendChild(h("div", "t", "例 " + e.no));
          box.appendChild(h("div", "d", exTitle(ch, e)));
          c.appendChild(box);
          c.onclick = function () { go("#/exam/" + ch.no + "/" + e.no); };
          g.appendChild(c);
        });
        wrap.appendChild(g);
      });
      app.appendChild(wrap);
      return;
    }

    var ch = null, ex = null;
    EX.chapters.forEach(function (c) {
      if (c.no === chNo) { ch = c; c.examples.forEach(function (e) { if (e.no === exNo) ex = e; }); }
    });
    if (!ex) { go("#/exam"); return; }

    var crumb = h("div", "crumb");
    var b = h("button", null, "← 全部例题");
    b.onclick = function () { go("#/exam"); };
    crumb.appendChild(b);
    crumb.appendChild(document.createTextNode("/ 第 " + ch.no + " 章 " + ch.name + " / 例 " + ex.no));
    wrap.appendChild(crumb);

    var head = h("div", "card panel");
    head.appendChild(h("div", "sec-title", "第" + ch.no + "章 例" + ex.no + (ex.exam ? " · 考点" : "")));
    if (ex.title) head.appendChild(h("p", null, ex.title));
    head.appendChild(h("p", "small muted",
      "共 " + ex.pages.length + " 页原图。考试为大题改数，照原题练熟步骤即可。" + (ex.note ? "（" + ex.note + "）" : "")));
    wrap.appendChild(head);

    ex.imgs.forEach(function (src, i) {
      var p = h("div", "card ex-page");
      var img = h("img");
      img.src = src;
      img.alt = "第 " + ch.no + " 章 例 " + ex.no + " 第 " + (i + 1) + " 页";
      img.loading = i === 0 ? "eager" : "lazy";
      img.onclick = function () { lightbox(src); };
      p.appendChild(img);
      p.appendChild(h("div", "cap", "原书第 " + ex.pages[i] + " 页（点击放大）"));
      wrap.appendChild(p);
    });

    /* 该题的题中符号、看图与画图、解题思路（符号与看图数据来自 data/exnote.js，按「章-例」索引） */
    var nc = notesChapter(ch.no);
    var exn = (window.EXNOTE || {})[ch.no + "-" + ex.no];
    if (exn) {
      var sc = exSyms(exn); if (sc) wrap.appendChild(sc);
      var fc = exFig(exn); if (fc) wrap.appendChild(fc);
    }
    if (nc && nc.exam && nc.exam.length) {
      nc.exam.forEach(function (e) {
        if (e.tag === "例" + ex.no) wrap.appendChild(exIdea(e));
      });
    }

    app.appendChild(wrap);
  }

  /* 例题详情页 · 题中符号（e.syms: [{s,d}]） */
  function exSyms(e) {
    if (!e.syms || !e.syms.length) return null;
    var d = h("div", "card ex-syms");
    var hd = h("div", "ei-h");
    hd.appendChild(h("span", "ei-tag ei-tag-g", "题中符号"));
    hd.appendChild(h("span", "ei-t", "本题出现的符号与含义"));
    d.appendChild(hd);
    var tb = h("table", "nsym");
    var tr = h("tr");
    tr.appendChild(h("th", null, "符号"));
    tr.appendChild(h("th", null, "含义"));
    tb.appendChild(tr);
    e.syms.forEach(function (it) {
      var r = h("tr");
      var c1 = h("td"); c1.innerHTML = mathHtml(it.s || "");
      var c2 = h("td"); c2.innerHTML = mathHtml(it.d || "");
      r.appendChild(c1); r.appendChild(c2);
      tb.appendChild(r);
    });
    d.appendChild(tb);
    return d;
  }

  /* 例题详情页 · 看图与画图（e.figs: [{t,s}] 或纯字符串数组） */
  function exFig(e) {
    if (!e.figs || !e.figs.length) return null;
    var d = h("div", "card ex-fig");
    var hd = h("div", "ei-h");
    hd.appendChild(h("span", "ei-tag ei-tag-y", "看图 · 画图"));
    hd.appendChild(h("span", "ei-t", "怎么读这张图，自己画时先画什么"));
    d.appendChild(hd);
    var ol = h("ol", "ei-steps");
    e.figs.forEach(function (it) {
      var li = h("li");
      if (typeof it === "string") li.innerHTML = mathHtml(it);
      else {
        li.innerHTML = mathHtml((it.t ? "**" + it.t + "**　" : "") + (it.s || ""));
      }
      ol.appendChild(li);
    });
    d.appendChild(ol);
    return d;
  }

  /* 例题详情页 · 单题解题思路 */
  function exIdea(e) {
    var d = h("div", "card ex-idea");
    var hd = h("div", "ei-h");
    hd.appendChild(h("span", "ei-tag", "解题思路"));
    var t = h("span", "ei-t"); t.innerHTML = mathHtml(e.t || "本题思路");
    hd.appendChild(t);
    d.appendChild(hd);
    if (e.steps && e.steps.length) {
      var ol = h("ol", "ei-steps");
      e.steps.forEach(function (s) { var li = h("li"); li.innerHTML = mathHtml(s); ol.appendChild(li); });
      d.appendChild(ol);
    }
    if (e.f && e.f.length) {
      var box = h("div", "ei-f");
      box.appendChild(h("b", null, "核心公式"));
      e.f.forEach(function (x) { box.appendChild(nLine(null, x)); });
      d.appendChild(box);
    }
    if (e.tip) d.appendChild(nLine("ei-tip", "⚠ " + e.tip));
    return d;
  }

  function lightbox(src) {
    var lb = h("div", "lightbox");
    var img = h("img"); img.src = src;
    var close = h("button", "close", "×");
    lb.appendChild(img); lb.appendChild(close);
    lb.onclick = function (e) { if (e.target === lb || e.target === close) lb.remove(); };
    document.body.appendChild(lb);
  }

  /* ================= 知识点 & 大题思路 ================= */
  function aiDisclaimer() {
    var d = h("div", "disclaimer");
    d.appendChild(h("b", null, "免责声明"));
    d.appendChild(document.createTextNode(
      "　本站的题库提取、知识点整理、例题思路与客观题解答均由 AI 依据课程课件与例题原卷整理生成，仅供个人复习参考。" +
      "题目与答案一律以原卷 PDF 与教材为准，公式、数据与结论请自行核对；如发现错误，欢迎指出以便更正。"));
    return d;
  }
  function notesList() { return (window.NOTES && window.NOTES.chapters) || []; }
  function notesChapter(no) {
    var L = notesList();
    for (var i = 0; i < L.length; i++) if (L[i].no === +no) return L[i];
    return null;
  }
  function nLine(cls, txt) { var d = h("div", cls); d.innerHTML = mathHtml(txt); return d; }

  function nPoint(p) {
    var d = h("div", "np" + (p.warn ? " warn" : ""));
    d.appendChild(h("div", "np-t", p.t));
    if (p.f) d.appendChild(nLine("np-f", p.f));
    if (p.d) d.appendChild(nLine("np-d", p.d));
    return d;
  }

  function nExam(e) {
    var d = h("div", "ne");
    var hd = h("div", "ne-h");
    hd.appendChild(h("span", "ne-tag", e.tag || "大题"));
    var t = h("span", "ne-t"); t.innerHTML = mathHtml(e.t); hd.appendChild(t);
    d.appendChild(hd);
    if (e.q) d.appendChild(nLine("ne-q", e.q));
    if (e.steps && e.steps.length) {
      var ol = h("ol");
      e.steps.forEach(function (s) { var li = h("li"); li.innerHTML = mathHtml(s); ol.appendChild(li); });
      d.appendChild(ol);
    }
    if (e.f && e.f.length) {
      var box = h("div", "ne-f");
      box.appendChild(h("b", null, "核心公式"));
      e.f.forEach(function (x) { box.appendChild(nLine(null, x)); });
      d.appendChild(box);
    }
    if (e.tip) d.appendChild(nLine("ne-tip", "⚠ " + e.tip));
    return d;
  }

  function nPattern(p, ch) {
    var d = h("div", "np npt");
    var tt = h("div", "np-t"); tt.innerHTML = mathHtml(p.t); d.appendChild(tt);
    var f = p.f;
    if (!f && p.from && ch && ch.exam) {
      ch.exam.forEach(function (e) {
        if (e.tag === p.from && e.f && e.f.length) f = e.f.slice(0, 2).join("　");
      });
    }
    if (f) d.appendChild(nLine("np-f", f));
    if (p.how) d.appendChild(nLine("np-d", p.how));
    if (p.key) d.appendChild(nLine("np-key", "考察知识点：" + p.key));
    return d;
  }

  function nCalc(c) {
    var d = h("div", "nc");
    var hd = h("div", "nc-h");
    if (c.ref) hd.appendChild(h("span", "nc-ref", c.ref));
    var t = h("span"); t.innerHTML = mathHtml(c.t || "计算题"); hd.appendChild(t);
    d.appendChild(hd);
    d.appendChild(nLine("nc-q", c.q));
    if (c.opts && c.opts.length) d.appendChild(nLine("nc-o", c.opts.join("　")));
    if (c.steps && c.steps.length) {
      var ol = h("ol");
      c.steps.forEach(function (s) { var li = h("li"); li.innerHTML = mathHtml(s); ol.appendChild(li); });
      d.appendChild(ol);
    }
    if (c.f) d.appendChild(nLine("nc-f", "公式：" + c.f));
    if (c.a) { var a = h("div", "nc-a"); a.innerHTML = "答案：<b>" + esc(c.a) + "</b>"; d.appendChild(a); }
    return d;
  }

  function nChapterBody(ch) {
    var box = h("div");
    if (ch.symbols && ch.symbols.length) {
      var ss = h("div", "nsub");
      ss.appendChild(document.createTextNode("本章符号"));
      ss.appendChild(h("em", null, ch.symbols.length + " 个"));
      box.appendChild(ss);
      var tb = h("table", "nsym");
      var thead = h("thead"), trh = h("tr");
      ["符号", "含义", "单位"].forEach(function (x) { trh.appendChild(h("th", null, x)); });
      thead.appendChild(trh); tb.appendChild(thead);
      var tbody = h("tbody");
      ch.symbols.forEach(function (sy) {
        var r = h("tr");
        var c1 = h("td"); c1.innerHTML = mathHtml(sy.s || ""); r.appendChild(c1);
        var c2 = h("td"); c2.innerHTML = mathHtml(sy.d || ""); r.appendChild(c2);
        var c3 = h("td"); c3.innerHTML = mathHtml(sy.u || "—"); r.appendChild(c3);
        tbody.appendChild(r);
      });
      tb.appendChild(tbody);
      box.appendChild(tb);
    }
    if (ch.points && ch.points.length) {
      var s1 = h("div", "nsub");
      s1.appendChild(document.createTextNode("知识点"));
      s1.appendChild(h("em", null, ch.points.length + " 条"));
      box.appendChild(s1);
      var gp = h("div", "nps");
      // 带公式的排前面，其余保持原顺序（只做轻分类，不拆小节）
      var ordered = ch.points.filter(function (p) { return p.f; })
        .concat(ch.points.filter(function (p) { return !p.f; }));
      ordered.forEach(function (p) { gp.appendChild(nPoint(p)); });
      box.appendChild(gp);
    }
    if (ch.patterns && ch.patterns.length) {
      var s2 = h("div", "nsub");
      s2.appendChild(document.createTextNode("同类题型解法"));
      s2.appendChild(h("em", null, ch.patterns.length + " 类"));
      box.appendChild(s2);
      ch.patterns.forEach(function (p) { box.appendChild(nPattern(p, ch)); });
    }
    if (ch.calc && ch.calc.length) {
      var s3 = h("div", "nsub");
      s3.appendChild(document.createTextNode("客观题里的计算题"));
      s3.appendChild(h("em", null, ch.calc.length + " 道"));
      box.appendChild(s3);
      ch.calc.forEach(function (c) { box.appendChild(nCalc(c)); });
    }
    if (ch.note) box.appendChild(nLine("nc-f", ch.note));
    return box;
  }

  function nChapterCard(ch) {
    var c = h("button", "card ch-card");
    c.appendChild(h("span", "no", "第 " + ch.no + " 章"));
    c.appendChild(h("h3", null, ch.name));
    var bits = [];
    if (ch.points) bits.push("知识点 " + ch.points.length);
    if (ch.patterns) bits.push("题型解法 " + ch.patterns.length);
    if (ch.calc) bits.push("计算题 " + ch.calc.length);
    c.appendChild(h("div", "meta", bits.join(" · ")));
    c.onclick = function () { go("#/notes/" + ch.no); };
    return c;
  }

  function nChapterSec(ch) {
    var sec = h("div", "card nch");
    var hd = h("div", "nch-h");
    hd.appendChild(h("span", "nno", "第 " + ch.no + " 章"));
    hd.appendChild(h("h2", null, ch.name));
    sec.appendChild(hd);
    sec.appendChild(nChapterBody(ch));
    return sec;
  }

  function printNotes() {
    if (location.hash !== "#/notes/all") location.hash = "#/notes/all";
    setTimeout(function () { window.print(); }, 450);
  }

  function viewNotes(app, arg) {
    navBar("notes");
    var wrap = h("div", "wrap");
    var L = notesList();

    if (!L.length) {
      var es = h("div", "card empty-state");
      es.appendChild(h("div", "ic", "📗"));
      es.appendChild(h("div", null, "知识点数据还没生成。"));
      wrap.appendChild(es);
      app.appendChild(wrap);
      return;
    }

    /* —— 打印视图：全部章节一次排完 —— */
    if (arg === "all") {
      var head = h("div", "notes-hero");
      head.appendChild(h("h1", null, "机械设计 · 知识点与题型解法"));
      head.appendChild(h("p", null, "考试范围：" + L.length + " 章 · 更新 " +
        ((window.NOTES && window.NOTES.updated) || "")));
      wrap.appendChild(head);
      wrap.appendChild(aiDisclaimer());
      var toc = h("div", "ntoc");
      toc.appendChild(h("h2", null, "目录"));
      var ul = h("ul");
      L.forEach(function (ch) {
        var li = h("li");
        li.appendChild(h("span", "ntoc-no", "第 " + ch.no + " 章"));
        li.appendChild(h("span", "ntoc-nm", ch.name));
        li.appendChild(h("span", "ntoc-ct", "知识点 " + (ch.points || []).length +
          " · 题型解法 " + (ch.patterns || []).length + " · 计算题 " + (ch.calc || []).length));
        ul.appendChild(li);
      });
      toc.appendChild(ul);
      wrap.appendChild(toc);
      L.forEach(function (ch) { wrap.appendChild(nChapterSec(ch)); });
      app.appendChild(wrap);
      return;
    }

    /* —— 单章 —— */
    if (arg) {
      var ch = notesChapter(arg);
      if (!ch) { go("#/notes"); return; }
      var crumb = h("div", "crumb");
      var b1 = h("button", null, "← 知识点总览");
      b1.onclick = function () { go("#/notes"); };
      crumb.appendChild(b1);
      crumb.appendChild(h("span", null, "/ 第 " + ch.no + " 章"));
      wrap.appendChild(crumb);
      wrap.appendChild(nChapterSec(ch));

      var nav = h("div", "nbar");
      var i = L.indexOf(ch);
      if (i > 0) {
        var pv = h("button", "btn ghost sm", "← 第 " + L[i - 1].no + " 章 " + L[i - 1].name);
        pv.onclick = function () { go("#/notes/" + L[i - 1].no); };
        nav.appendChild(pv);
      }
      if (i < L.length - 1) {
        var nx = h("button", "btn ghost sm", "第 " + L[i + 1].no + " 章 " + L[i + 1].name + " →");
        nx.onclick = function () { go("#/notes/" + L[i + 1].no); };
        nav.appendChild(nx);
      }
      nav.appendChild(h("span", "small muted", ""));
      wrap.appendChild(nav);

      wrap.appendChild(aiDisclaimer());
      app.appendChild(wrap);
      return;
    }

    /* —— 总览 —— */
    var hero = h("div", "card notes-hero");
    hero.appendChild(h("h1", null, "📗 知识点 & 题型解法"));
    hero.appendChild(h("p", null, "按考试范围逐章整理：知识点与公式、同类题型的通用解法与看图思路、客观题里的计算题。"));
    hero.appendChild(h("p", null, "范围：题库与例题涉及的 " + L.length +
      " 章；第 6、8、14 章只有客观题，按纯知识点列出。更新 " +
      ((window.NOTES && window.NOTES.updated) || "")));
    wrap.appendChild(hero);

    var bar = h("div", "nbar");
    var pb = h("button", "btn", "🖨 打印 / 存为 PDF（全部章节）");
    pb.onclick = printNotes;
    bar.appendChild(pb);
    var np0 = 0, ne0 = 0, nc0 = 0;
    L.forEach(function (c) {
      np0 += (c.points || []).length; ne0 += (c.exam || []).length; nc0 += (c.calc || []).length;
    });
    bar.appendChild(h("span", "small muted",
      "共 " + np0 + " 条知识点 · " + ne0 + " 道例题思路 · " + nc0 + " 道计算题"));
    wrap.appendChild(bar);

    var grid = h("div", "grid");
    L.forEach(function (ch) { grid.appendChild(nChapterCard(ch)); });
    wrap.appendChild(grid);

    wrap.appendChild(aiDisclaimer());
    app.appendChild(wrap);
  }

  /* ================= 错题本 / 收藏 ================= */
  var KIND_RANK = { choice: 0, blank: 1, judge: 2, short: 3 };

  /* 把一组题按章节归组（章号升序，章内按题型、题号升序） */
  function groupByChapter(list) {
    var order = [], gmap = {};
    list.forEach(function (q) {
      var k = q._ch;
      if (!gmap[k]) { gmap[k] = { no: q._ch, name: q._chName || "", list: [] }; order.push(k); }
      gmap[k].list.push(q);
    });
    var groups = order.map(function (k) { return gmap[k]; });
    groups.sort(function (a, b) { return a.no - b.no; });
    groups.forEach(function (g) {
      g.list.sort(function (a, b) {
        var ka = KIND_RANK[a._kind], kb = KIND_RANK[b._kind];
        if (ka !== kb) return (ka || 0) - (kb || 0);
        return (+a.no || 0) - (+b.no || 0);
      });
    });
    return groups;
  }

  /* 折叠状态：type + ":" + 章号 → true 表示展开；未记录时按默认值 */
  var chOpen = {};

  /* 一章 = 可折叠表头 + 题目列表；点表头任意处（除"只做本章"按钮）开合 */
  function chapterGroupBox(g, type, defOpen) {
    var key = type + ":" + g.no;
    var isOpen = chOpen[key] === undefined ? !!defOpen : chOpen[key];
    var box = h("div", "ch-group");
    var head = h("div", "cg-head");
    head.appendChild(h("span", "cg-caret", "▸"));
    head.appendChild(h("span", "cg-no", "第 " + g.no + " 章"));
    if (g.name) head.appendChild(h("span", "cg-nm", g.name));
    head.appendChild(h("em", "cg-ct", g.list.length + " 道"));
    var b = h("button", "btn ghost sm cg-run", "只做本章");
    b.onclick = function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      startSession(g.list.slice(), "第" + g.no + "章 · " + (g.name || "") + (type === "wrong" ? " · 错题" : " · 收藏"));
    };
    head.appendChild(b);
    var body = h("div", "cg-body");
    g.list.forEach(function (q, i) { body.appendChild(renderCard(q, { index: i + 1, revealed: true })); });
    body.style.display = isOpen ? "" : "none";
    if (isOpen) box.classList.add("open");
    head.onclick = function () {
      var now = !(chOpen[key] === undefined ? !!defOpen : chOpen[key]);
      chOpen[key] = now;
      body.style.display = now ? "" : "none";
      box.classList.toggle("open", now);
    };
    box.appendChild(head);
    box.appendChild(body);
    return box;
  }

  function viewCollection(app, type) {
    navBar(type);
    var wrap = h("div", "wrap");
    var ids = type === "wrong" ? store.wrong.slice() : store.good.slice();
    var title = type === "wrong" ? "❌ 错题本" : "⭐ 收藏";
    var list = ids.map(function (id) { return QMAP[id]; }).filter(Boolean);
    var groups = groupByChapter(list);
    var defOpen = groups.length === 1;   /* 只有一章默认展开；多章默认收起，一屏看完章数 */
    var isOpenNow = function (g) {
      var k = type + ":" + g.no;
      return chOpen[k] === undefined ? defOpen : chOpen[k];
    };
    var t = h("div", "sec-title");
    t.appendChild(document.createTextNode(title));
    t.appendChild(h("em", null, list.length + " 道 · " + groups.length + " 章"));
    wrap.appendChild(t);

    if (!list.length) {
      var es = h("div", "card empty-state");
      es.appendChild(h("div", "ic", type === "wrong" ? "🎉" : "☆"));
      es.appendChild(h("div", null, type === "wrong" ? "还没有错题，继续加油。" : "还没有收藏的题。"));
      wrap.appendChild(es);
      app.appendChild(wrap);
      return;
    }

    var bar = h("div", "row");
    bar.style.marginBottom = "13px";
    bar.style.flexWrap = "wrap";
    var run = h("button", "btn", "▶ 把这 " + list.length + " 道做一遍");
    run.onclick = function () { startSession(list.slice(), title); };
    bar.appendChild(run);

    var anyClosedNow = groups.some(function (g) { return !isOpenNow(g); });
    var allBtn = h("button", "btn ghost sm", anyClosedNow ? "展开全部" : "收起全部");
    allBtn.onclick = function () {
      var anyClosed = groups.some(function (g) { return !isOpenNow(g); });
      groups.forEach(function (g) { chOpen[type + ":" + g.no] = anyClosed; });
      render();
    };
    bar.appendChild(allBtn);
    if (type === "wrong") {
      var clr = h("button", "btn ghost sm", "清空错题本");
      clr.onclick = function () {
        if (confirm("清空错题本？（做题记录会保留）")) { store.wrong = []; saveStore(); render(); }
      };
      bar.appendChild(clr);
    }
    wrap.appendChild(bar);

    var holder = h("div");
    wrap.appendChild(holder);
    groups.forEach(function (g) { holder.appendChild(chapterGroupBox(g, type, defOpen)); });
    app.appendChild(wrap);
  }

  /* ================= 启动 ================= */
  function init() {
    loadStore();
    applyTheme();
    var tb = document.getElementById("themeBtn");
    tb.onclick = function () { store.dark = !store.dark; saveStore(); applyTheme(); };
    document.getElementById("brandBtn").onclick = function () { go("#/"); };
    window.addEventListener("hashchange", render);
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
