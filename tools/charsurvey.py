# -*- coding: utf-8 -*-
"""全文档特殊字符普查：找出所有非 ASCII 字符 + 它们的字体，用于建映射表。"""
import collections
import pymupdf

HW = r"E:\xwechat_files\wxid_iydyyuetduoq22_8f6a\msg\file\2026-11\机械设计习题.pdf"
EX = r"E:\xwechat_files\wxid_iydyyuetduoq22_8f6a\msg\file\2026-11\机械设计例题汇总.pdf"

def survey(path, tag):
    doc = pymupdf.open(path)
    counter = collections.Counter()   # (char, font) -> count
    for page in doc:
        d = page.get_text("dict")
        for blk in d["blocks"]:
            if blk.get("type") != 0:
                continue
            for line in blk["lines"]:
                for sp in line["spans"]:
                    font = sp["font"]
                    for ch in sp["text"]:
                        o = ord(ch)
                        if o > 127 or o < 32:
                            counter[(ch, font)] += 1
    doc.close()
    print(f"\n########## {tag} : {len(counter)} 种 (字符,字体) 组合 ##########")
    for (ch, font), n in counter.most_common(80):
        print(f"  {ch!r:>10} U+{ord(ch):04X}  font={font:<24} x{n}")

survey(HW, "习题")
survey(EX, "例题汇总")
