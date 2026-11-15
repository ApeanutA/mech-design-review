# -*- coding: utf-8 -*-
"""专门核对判断题的 √/× 答案：PDF 原文（经符号解码） vs data/questions.json。

判断题答案在 PDF 文字层里是画上去的符号，靠 symbols.decode_span 还原，
所以这一题型必须单独验一遍。

用法: python tools/check_judge.py
"""
import json
import sys

import pymupdf

sys.path.insert(0, "tools")
from symbols import decode_span

HW = r"E:\xwechat_files\wxid_iydyyuetduoq22_8f6a\msg\file\2026-11\机械设计习题.pdf"


def main():
    data = json.load(open("data/questions.json", encoding="utf-8"))

    print("=" * 70)
    print("JSON 里的判断题答案")
    print("=" * 70)
    for ch in data["chapters"]:
        for s in ch["sections"]:
            if s["kind"] != "judge":
                continue
            cells = " ".join(f"{q['no']}={q['answer']}" for q in s["questions"])
            print(f"第{ch['no']:>2}章 ({len(s['questions']):>2}题): {cells}")

    print()
    print("=" * 70)
    print("PDF 答案区原文（符号已解码）")
    print("=" * 70)
    doc = pymupdf.open(HW)
    started = False
    for i, page in enumerate(doc):
        for blk in page.get_text("dict")["blocks"]:
            if blk.get("type") != 0:
                continue
            for line in blk["lines"]:
                s = "".join(decode_span(sp["text"], sp["font"]) for sp in line["spans"])
                if "机械设计习题参考答案" in s:
                    started = True
                if started and s.strip():
                    print(f"p{i + 1:>2} | {s}")
    doc.close()


if __name__ == "__main__":
    main()
