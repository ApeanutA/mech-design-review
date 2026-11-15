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
    if (p[0] === "quiz") return viewQuizSetup(app);
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
      var picked = [];
      var opts = h("div", "opts");
      var buttons = [];
      var submit = null;

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
      card.appendChild(opts);

      if (multi) {
        var hint = h("div", "small muted");
        hint.style.marginTop = "9px";
        hint.textContent = "本题有 " + keys.length + " 个空，依次选出 " + keys.length + " 个答案后提交。";
        card.appendChild(hint);
        submit = h("button", "btn sm", "提交答案");
        submit.style.marginTop = "9px";
        submit.disabled = true;
        submit.onclick = function () { judge(picked.slice()); };
        card.appendChild(submit);
      }

      function judge(pick) {
        var ok = pick.length === keys.length && pick.every(function (k, i) { return k === keys[i]; });
        buttons.forEach(function (b) {
          b.classList.add("locked");
          var k = b.querySelector(".k").textContent;
          if (keys.indexOf(k) >= 0) b.classList.add("ok");
          else if (pick.indexOf(k) >= 0) b.classList.add("bad");
        });
        if (q.options.length && q.options[0].key !== "A") { /* 无操作，兼容异常数据 */ }
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
  var quizCfg = { chs: null, kinds: null, n: 20 };

  function viewQuizSetup(app) {
    navBar("quiz");
    if (!quizCfg.chs) quizCfg.chs = Q.chapters.map(function (c) { return c.no; });
    if (!quizCfg.kinds) quizCfg.kinds = KIND_ORDER.slice();

    var wrap = h("div", "wrap");
    var card = h("div", "card panel");
    card.appendChild(h("div", "sec-title", "🎯 抽题训练"));
    card.appendChild(h("p", "small muted", "选范围与题量，随机抽题做一遍；做完给成绩并自动收集错题。"));

    // 章节
    var f1 = h("div", "fld");
    f1.appendChild(h("label", null, "章节范围"));
    var c1 = h("div", "chips");
    var allCh = h("button", "chip", "全选");
    allCh.onclick = function () { quizCfg.chs = Q.chapters.map(function (c) { return c.no; }); render(); };
    c1.appendChild(allCh);
    Q.chapters.forEach(function (ch) {
      var on = quizCfg.chs.indexOf(ch.no) >= 0;
      var b = h("button", "chip" + (on ? " on" : ""), "第" + ch.no + "章");
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
    var pool = ALLQ.filter(function (q) {
      return quizCfg.chs.indexOf(q._ch) >= 0 && quizCfg.kinds.indexOf(q._kind) >= 0;
    });
    var f3 = h("div", "fld");
    f3.appendChild(h("label", null, "题量（题库可用 " + pool.length + " 题）"));
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
      startSession(shuffled.slice(0, n), "抽题训练 · " + n + " 题");
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

    app.appendChild(wrap);
  }

  function lightbox(src) {
    var lb = h("div", "lightbox");
    var img = h("img"); img.src = src;
    var close = h("button", "close", "×");
    lb.appendChild(img); lb.appendChild(close);
    lb.onclick = function (e) { if (e.target === lb || e.target === close) lb.remove(); };
    document.body.appendChild(lb);
  }

  /* ================= 错题本 / 收藏 ================= */
  function viewCollection(app, type) {
    navBar(type);
    var wrap = h("div", "wrap");
    var ids = type === "wrong" ? store.wrong.slice() : store.good.slice();
    var title = type === "wrong" ? "❌ 错题本" : "⭐ 收藏";
    var t = h("div", "sec-title");
    t.appendChild(document.createTextNode(title));
    t.appendChild(h("em", null, ids.length + " 道"));
    wrap.appendChild(t);

    if (!ids.length) {
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
    var run = h("button", "btn", "▶ 把这 " + ids.length + " 道做一遍");
    var list = ids.map(function (id) { return QMAP[id]; }).filter(Boolean);
    run.onclick = function () { startSession(list, title); };
    bar.appendChild(run);
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
    list.forEach(function (q, i) { holder.appendChild(renderCard(q, { index: i + 1, revealed: true })); });
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
