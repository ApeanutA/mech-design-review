# -*- coding: utf-8 -*-
"""验证符号解码：把习题 PDF 用 span 级解码重新输出，对比原样。"""
import re
import pymupdf
from symbols import decode_span

HW = r"E:\xwechat_files\wxid_iydyyuetduoq22_8f6a\msg\file\2026-11\机械设计习题.pdf"


def page_text_decoded(page):
    """逐 span 解码后按行拼接，尽量还原阅读顺序。"""
    d = page.get_text("dict")
    lines_out = []
    for blk in d["blocks"]:
        if blk.get("type") != 0:
            continue
        for line in blk["lines"]:
            s = "".join(decode_span(sp["text"], sp["font"]) for sp in line["spans"])
            lines_out.append(s)
    return "\n".join(lines_out)


if __name__ == "__main__":
    doc = pymupdf.open(HW)
    for pno in (14,):
        page = doc[pno - 1]
        t = page_text_decoded(page)
        print(f"===== p{pno} 解码后 =====")
        for line in t.splitlines():
            if "三、" in line or "一、" in line or "二、" in line:
                print(repr(line[:160]))
    doc.close()
