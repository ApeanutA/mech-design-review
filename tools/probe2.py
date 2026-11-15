# -*- coding: utf-8 -*-
"""1) 检查判断题答案的符号字体  2) 列出例题 PDF 每页出现的「例N」"""
import re
import pymupdf

HW = r"E:\xwechat_files\wxid_iydyyuetduoq22_8f6a\msg\file\2026-11\机械设计习题.pdf"
EX = r"E:\xwechat_files\wxid_iydyyuetduoq22_8f6a\msg\file\2026-11\机械设计例题汇总.pdf"

print("########## 判断题答案的 span / 字体（习题 p14 三、那一行） ##########")
doc = pymupdf.open(HW)
page = doc[13]
d = page.get_text("dict")
for blk in d["blocks"]:
    if blk.get("type") != 0:
        continue
    for line in blk["lines"]:
        s = "".join(sp["text"] for sp in line["spans"])
        if s.strip().startswith("三、") or "1．" in s and len(s) < 60:
            print("LINE:", repr(s))
            for sp in line["spans"]:
                print(f"   font={sp['font']!r} size={sp['size']:.1f} text={sp['text']!r}")
doc.close()

print("\n########## 例题 PDF 每页的「例N」标记 ##########")
doc = pymupdf.open(EX)
cur_ch = ""
for i, page in enumerate(doc):
    t = page.get_text("text")
    flat = re.sub(r"\s+", "", t)
    m = re.search(r"第(\d+)章", flat)
    if m and len(flat) < 40:
        cur_ch = "第" + m.group(1) + "章"
    exs = re.findall(r"例(\d+)", flat)
    uniq = sorted(set(int(x) for x in exs))
    if uniq:
        print(f"  p{i+1:>3} [{cur_ch}] 例: {uniq}")
doc.close()
