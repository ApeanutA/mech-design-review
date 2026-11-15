# -*- coding: utf-8 -*-
"""扫描两份 PDF 的结构：章节标题、题型标题、是否有答案区。"""
import re
import pymupdf

EX = r"E:\xwechat_files\wxid_iydyyuetduoq22_8f6a\msg\file\2026-11\机械设计例题汇总.pdf"
HW = r"E:\xwechat_files\wxid_iydyyuetduoq22_8f6a\msg\file\2026-11\机械设计习题.pdf"

CH = re.compile(r"第[一二三四五六七八九十百零\d]+章")
QT = re.compile(r"^\s*[一二三四五六七八九十]\s*[、.．]\s*\S{2,12}(题|题）|\))?\s*$")

print("########## 习题 PDF ##########")
doc = pymupdf.open(HW)
print("总页数:", len(doc))
for i, page in enumerate(doc):
    t = page.get_text("text")
    lines = [l.strip() for l in t.splitlines() if l.strip()]
    hits = []
    for l in lines:
        if CH.search(l) and len(l) < 40:
            hits.append("CH:" + l)
        elif re.match(r"^\s*[一二三四五六七八九十]\s*[、.．]", l) and len(l) < 25:
            hits.append("QT:" + l)
        elif "答案" in l and len(l) < 30:
            hits.append("ANS?:" + l)
    if hits:
        print(f"p{i+1}: " + " | ".join(hits[:6]))
doc.close()

print("\n########## 例题汇总 PDF: 低文字量页（疑似章封面） ##########")
doc = pymupdf.open(EX)
print("总页数:", len(doc))
for i, page in enumerate(doc):
    t = page.get_text("text").strip()
    n = len(re.sub(r"\s+", "", t))
    if n < 40:
        print(f"  p{i+1}: chars={n} :: {t[:60]!r}")
doc.close()
