# -*- coding: utf-8 -*-
"""探查两份机械设计 PDF 的页数、文字量、图片分布。"""
import sys, json, re
import fitz

PDFS = {
    "例题汇总": r"E:\xwechat_files\wxid_iydyyuetduoq22_8f6a\msg\file\2026-11\机械设计例题汇总.pdf",
    "习题":     r"E:\xwechat_files\wxid_iydyyuetduoq22_8f6a\msg\file\2026-11\机械设计习题.pdf",
}

out = {}
for tag, path in PDFS.items():
    doc = fitz.open(path)
    pages = []
    for i, page in enumerate(doc):
        txt = page.get_text("text")
        imgs = page.get_images(full=True)
        # 去掉空白后的字符数
        nchar = len(re.sub(r"\s+", "", txt))
        # 页面尺寸
        r = page.rect
        pages.append({
            "p": i + 1,
            "chars": nchar,
            "imgs": len(imgs),
            "w": round(r.width, 1),
            "h": round(r.height, 1),
        })
    out[tag] = {"file": path, "pages": len(doc), "detail": pages}
    doc.close()

print(json.dumps(out, ensure_ascii=False, indent=1))
