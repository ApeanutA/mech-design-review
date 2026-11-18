# -*- coding: utf-8 -*-
"""把 JSON 数据打包成 JS 文件。

浏览器用 file:// 直接打开时 fetch JSON 会被 CORS 拦，
改成 <script src> 加载 window.XXX = {...} 就没有这个问题。
"""
import io
import json
import os

Q = json.load(open("data/questions.json", encoding="utf-8"))
E = json.load(open("data/examples.json", encoding="utf-8"))
A = json.load(open("data/answer_imgs.json", encoding="utf-8"))

# ---- 题目：补 id、统计 ----
chapters = []
for ch in Q["chapters"]:
    secs = []
    for s in ch["sections"]:
        qs = []
        for q in s["questions"]:
            q["id"] = f"c{ch['no']}-{s['kind']}-{q['no']}"
            qs.append(q)
        secs.append({"kind": s["kind"], "label": s["label"], "questions": qs})
    chapters.append({"no": ch["no"], "name": ch["name"], "sections": secs})

stats = {}
for ch in chapters:
    for s in ch["sections"]:
        stats.setdefault(s["kind"], 0)
        stats[s["kind"]] += len(s["questions"])

payload = {
    "chapters": chapters,
    "stats": stats,
    "total": sum(stats.values()),
    # 填空/简答题的「原书答案」小图：公式在 PDF 文字层里是碎的，只能看图
    "answerImgs": A,
}

with open("data/questions.js", "w", encoding="utf-8") as f:
    f.write("window.QDATA = ")
    json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";\n")

exam_n = sum(1 for c in E["chapters"] for e in c["examples"] if e["exam"])
star_n = sum(1 for c in E["chapters"] for e in c["examples"] if e.get("star"))
with open("data/examples.js", "w", encoding="utf-8") as f:
    f.write("window.EXAMPLES = ")
    json.dump({"chapters": E["chapters"], "examCount": exam_n, "starCount": star_n}, f,
              ensure_ascii=False, separators=(",", ":"))
    f.write(";\n")

print("总题数:", payload["total"], " 题型分布:", stats)
print("例题章数:", len(E["chapters"]), " 考点例题:", exam_n, " 标星重点:", star_n)
print("答案小图:", len(A), "张")
for p in ("data/questions.js", "data/examples.js"):
    print(f"  {p}: {os.path.getsize(p) / 1024:.0f} KB")

# ---- 给 Service Worker 打版本戳 ----
# 缓存优先策略靠 VERSION 失效：只要下面的文件内容变了，指纹就变，
# sw.js 内容随之变化 -> 浏览器装新 SW -> activate 时旧缓存全删。
# 不这么做的话，改完题目用户还会读到旧缓存，等于「改了没生效」。
def bump_sw_version():
    import hashlib
    import re
    targets = ["data/questions.js", "data/examples.js", "data/notes.js",
               "data/exnote.js", "assets/app.js", "assets/app.css",
               "assets/katex/katex.min.js", "assets/katex/katex.min.css",
               "index.html"]
    h = hashlib.sha1()
    for t in targets:
        try:
            with open(t, "rb") as f:
                h.update(f.read())
        except OSError:
            h.update(b"-")
    ver = h.hexdigest()[:10]
    sw = "sw.js"
    src = io.open(sw, encoding="utf-8").read()
    new, n = re.subn(r'var VERSION = "[^"]*";',
                     'var VERSION = "%s";' % ver, src)
    if n != 1:
        raise SystemExit("sw.js 里没找到 VERSION 行，无法打版本戳")
    if new != src:
        # newline="\n" 是必需的：Windows 上文本模式默认把 \n 翻成 \r\n，
        # 会让 sw.js 每次打包都变成 CRLF、git diff 里冒出整文件改动
        io.open(sw, "w", encoding="utf-8", newline="\n").write(new)
        print("  sw.js 版本戳 ->", ver)
    else:
        print("  sw.js 版本戳未变 ->", ver)
    return ver


bump_sw_version()
