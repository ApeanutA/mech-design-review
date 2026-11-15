# -*- coding: utf-8 -*-
"""建立例题索引：每章每个例题占哪几页；并给出用户指定范围的页码集合。"""
import json
import re
import sys
import pymupdf

sys.path.insert(0, "tools")
from symbols import decode_span

EX = r"E:\xwechat_files\wxid_iydyyuetduoq22_8f6a\msg\file\2026-11\机械设计例题汇总.pdf"

# 用户给的期末大题范围
WANTED = {3: [1, 4], 5: [4, 5, 6, 7], 10: [1, 2, 4, 5, 8], 11: [1, 2], 13: [1, 3]}

CH_RE = re.compile(r"第(\d+)章")
EX_RE = re.compile(r"例[题]?\s*(\d+)")


def main():
    doc = pymupdf.open(EX)
    pages = []
    for i, page in enumerate(doc):
        d = page.get_text("dict")
        lines = []
        for blk in d["blocks"]:
            if blk.get("type") != 0:
                continue
            for line in blk["lines"]:
                s = "".join(decode_span(sp["text"], sp["font"]) for sp in line["spans"])
                if s.strip():
                    lines.append(s.strip())
        flat = "".join(lines)
        ch = None
        m = CH_RE.search(flat)
        if m and len(flat) < 40:
            ch = int(m.group(1))
        hits = sorted({int(x) for x in EX_RE.findall(flat) if 1 <= int(x) <= 20})
        pages.append({"page": i + 1, "chap_title": ch, "examples": hits, "head": lines[:2]})
    doc.close()

    # 逐页推进当前章
    cur = None
    for p in pages:
        if p["chap_title"]:
            cur = p["chap_title"]
        p["chapter"] = cur

    # 例题号 -> 首页
    first = {}
    for p in pages:
        for e in p["examples"]:
            k = (p["chapter"], e)
            if k not in first:
                first[k] = p["page"]

    # 排序后推页范围（不越过本章末页）
    chap_end = {}
    for p in pages:
        if p["chapter"]:
            chap_end[p["chapter"]] = max(chap_end.get(p["chapter"], 0), p["page"])
    ordered = sorted(first.items(), key=lambda kv: kv[1])
    ranges = {}
    for idx, ((chap, ex), start) in enumerate(ordered):
        cend = chap_end.get(chap, len(pages))
        if idx + 1 < len(ordered):
            end = ordered[idx + 1][1] - 1
        else:
            end = cend
        end = max(start, min(end, cend))
        ranges[(chap, ex)] = [start, end]

    print("=== 例题页范围 ===")
    for (chap, ex), (a, b) in sorted(ranges.items()):
        mark = " ★考" if chap in WANTED and ex in WANTED[chap] else ""
        print(f"  第{chap}章 例{ex}: p{a}-p{b}{mark}")

    # 用户要的例题涉及哪些页
    need = set()
    out = []
    for chap, exs in WANTED.items():
        for ex in exs:
            r = ranges.get((chap, ex))
            if not r:
                print(f"  ⚠ 找不到 第{chap}章 例{ex}")
                continue
            for pg in range(r[0], r[1] + 1):
                need.add(pg)
            out.append({"chapter": chap, "example": ex, "pages": list(range(r[0], r[1] + 1))})
    print("\n需要渲染的页:", sorted(need), f"共 {len(need)} 页")

    with open("data/example_index.json", "w", encoding="utf-8") as f:
        json.dump({
            "all_ranges": {f"{c}-{e}": v for (c, e), v in sorted(ranges.items())},
            "wanted": out,
            "pages_needed": sorted(need),
            "page_meta": pages,
        }, f, ensure_ascii=False, indent=1)
    print("写出 data/example_index.json")


if __name__ == "__main__":
    main()
