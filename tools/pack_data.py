# -*- coding: utf-8 -*-
"""把 JSON 数据打包成 JS 文件。

浏览器用 file:// 直接打开时 fetch JSON 会被 CORS 拦，
改成 <script src> 加载 window.XXX = {...} 就没有这个问题。
"""
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
with open("data/examples.js", "w", encoding="utf-8") as f:
    f.write("window.EXAMPLES = ")
    json.dump({"chapters": E["chapters"], "examCount": exam_n}, f,
              ensure_ascii=False, separators=(",", ":"))
    f.write(";\n")

print("总题数:", payload["total"], " 题型分布:", stats)
print("例题章数:", len(E["chapters"]), " 考点例题:", exam_n)
print("答案小图:", len(A), "张")
for p in ("data/questions.js", "data/examples.js"):
    print(f"  {p}: {os.path.getsize(p) / 1024:.0f} KB")
