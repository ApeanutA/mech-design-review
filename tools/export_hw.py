# -*- coding: utf-8 -*-
"""导出习题 PDF 全文（span 级 Symbol 解码），供人工检查排版。"""
import sys
import pymupdf
from symbols import decode_span

HW = r"E:\xwechat_files\wxid_iydyyuetduoq22_8f6a\msg\file\2026-11\机械设计习题.pdf"


def page_lines(page):
    d = page.get_text("dict")
    out = []
    for blk in d["blocks"]:
        if blk.get("type") != 0:
            continue
        for line in blk["lines"]:
            s = "".join(decode_span(sp["text"], sp["font"]) for sp in line["spans"])
            out.append(s.rstrip())
    return out


if __name__ == "__main__":
    doc = pymupdf.open(HW)
    buf = []
    for i, page in enumerate(doc):
        buf.append(f"\n{'='*78}\n@@@ PAGE {i+1}\n{'='*78}")
        buf.extend(page_lines(page))
    doc.close()
    txt = "\n".join(buf)
    with open("data/hw_raw.txt", "w", encoding="utf-8") as f:
        f.write(txt)
    print("写出 data/hw_raw.txt  行数:", len(buf), " 字符:", len(txt))
