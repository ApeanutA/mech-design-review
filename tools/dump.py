# -*- coding: utf-8 -*-
"""dump 指定 PDF 的指定页文字，用于判断结构。"""
import sys, re
import pymupdf

def dump(path, pages):
    doc = pymupdf.open(path)
    for i in pages:
        if i < 1 or i > len(doc):
            continue
        page = doc[i - 1]
        txt = page.get_text("text")
        print(f"\n{'='*70}\n### PAGE {i}  (chars={len(re.sub(chr(92)+'s+','',txt))}, imgs={len(page.get_images(full=True))})\n{'='*70}")
        print(txt.strip()[:1500])
    doc.close()

if __name__ == "__main__":
    kind = sys.argv[1]
    pages = [int(x) for x in sys.argv[2:]]
    P = {
        "ex": r"E:\xwechat_files\wxid_iydyyuetduoq22_8f6a\msg\file\2026-11\机械设计例题汇总.pdf",
        "hw": r"E:\xwechat_files\wxid_iydyyuetduoq22_8f6a\msg\file\2026-11\机械设计习题.pdf",
    }
    dump(P[kind], pages)
