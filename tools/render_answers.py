# -*- coding: utf-8 -*-
"""把答案区按题裁剪成小图，给填空题 / 简答题的答案配「原书答案」原图。

为什么需要：公式在 PDF 里是排版画出来的，转成文字必然碎
（例：tanλ/tan(λ+φv) 变成 ") tan( tan v"；σs 变成 "s"）。
所以这两类题的答案，除文字外再配一张从原卷裁下来的小图。

做法：把答案区 4 页的字符按 PDF 内容流顺序串成一条流，
在流上找出「第X章 / 一、二、三、四、 / N．」三种锚点，
于是每道题的答案就是流上从自己题号之后、到下一个题号之前的那一段字符，
取这些字符 bbox 的并集裁剪即可。

产出:
  img/ans/<id>.webp            id 形如 c5-blank-1
  data/answer_imgs.json        {"c5-blank-1": {"w":..., "h":..., "page":...}, ...}
"""
import json
import os
import re
import sys

import pymupdf
from PIL import Image

sys.path.insert(0, "tools")
from symbols import decode_span

HW = r"E:\xwechat_files\wxid_iydyyuetduoq22_8f6a\msg\file\2026-11\机械设计习题.pdf"
OUT_DIR = "img/ans"
INDEX = "data/answer_imgs.json"
DPI = 220
PAD = 5
GAP = 8
WEBP_Q = 86
WANT_KINDS = ("blank", "short")

TOKEN = re.compile(r"第([一二三四五六七八九十]+)章|([一二三四])、|(\d{1,2})\s*[．.]")
CN_NUM = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7,
          "八": 8, "九": 9, "十": 10, "十一": 11, "十二": 12, "十三": 13,
          "十四": 14, "十五": 15, "十六": 16}
CN2KIND = {"一": "choice", "二": "blank", "三": "judge", "四": "short"}


def answer_pages(doc):
    for i, page in enumerate(doc):
        if "机械设计习题参考答案" in page.get_text("text"):
            return list(range(i, doc.page_count))
    raise SystemExit("没找到参考答案区")


def collect_rows(doc, pages):
    """按 PDF 内容流顺序收集 (page_no, bbox, char)。

    必须跳过页脚页码：它是纯数字且贴在页面最底部，混进流里会和下一页的
    题号粘成一个数（第10章简答的页脚「16」+ 次页题号「2．」=「162．」），
    于是那道题的题号认不出来、后面两道跟着全丢。
    """
    rows = []
    for pno in pages:
        page = doc[pno]
        h = page.rect.height
        for blk in page.get_text("rawdict")["blocks"]:
            if blk.get("type") != 0:
                continue
            for line in blk["lines"]:
                for sp in line["spans"]:
                    txt = "".join(ch["c"] for ch in sp["chars"]).strip()
                    if txt.isdigit() and len(txt) <= 3 and sp["bbox"][3] > h * 0.96:
                        continue          # 页脚页码
                    for ch in sp["chars"]:
                        rows.append((pno, ch["bbox"], ch["c"]))
    return rows


def scan(stream):
    """扫出每题的锚点与每个题型段的边界。"""
    segments, anchors = {}, []
    ch = kind = None
    expect = 1
    seg_start = cur = None

    def close_seg(end):
        if cur is not None and seg_start is not None:
            segments[cur] = (seg_start, end)

    for m in TOKEN.finditer(stream):
        if m.group(1):                       # 章标题
            close_seg(m.start())
            ch = CN_NUM.get(m.group(1), 0)
            kind, cur, seg_start = None, None, None
            continue
        if m.group(2):                       # 题型标记
            close_seg(m.start())
            kind = CN2KIND[m.group(2)]
            expect = 1
            cur = (ch, kind)
            seg_start = m.start()
            continue
        n = int(m.group(3))                  # 题号（必须递增，挡住 1.5 这类噪声）
        if ch and kind and n == expect:
            anchors.append({"ch": ch, "kind": kind, "no": n,
                            "begin": m.end(), "mark": m.start()})
            expect += 1
    close_seg(len(stream))
    return segments, anchors


def render_clip(page, bboxes):
    """把一组字符 bbox 的并集裁下来渲染成图。"""
    x0 = min(b[0] for b in bboxes) - PAD
    y0 = min(b[1] for b in bboxes) - PAD
    x1 = max(b[2] for b in bboxes) + PAD
    y1 = max(b[3] for b in bboxes) + PAD
    rect = pymupdf.Rect(x0, y0, x1, y1) & page.rect
    if rect.is_empty:
        return None
    pix = page.get_pixmap(clip=rect, dpi=DPI)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def main():
    doc = pymupdf.open(HW)
    pages = answer_pages(doc)
    print(f"答案区页码: {[p + 1 for p in pages]}")

    rows = collect_rows(doc, pages)
    stream = "".join(
        decode_span(c, "") if 0xF000 <= ord(c) <= 0xF0FF else c for _, _, c in rows)
    print(f"答案区字符数: {len(stream)}")

    segments, anchors = scan(stream)
    print(f"扫到锚点: {len(anchors)} 题，段: {len(segments)}")

    os.makedirs(OUT_DIR, exist_ok=True)
    index, skipped, crosspage = {}, [], []

    for i, a in enumerate(anchors):
        if a["kind"] not in WANT_KINDS:
            continue
        seg_end = segments.get((a["ch"], a["kind"]), (0, len(stream)))[1]
        nxt = anchors[i + 1]["mark"] if i + 1 < len(anchors) else None
        end = min(x for x in (nxt, seg_end) if x is not None)

        # 从题号 mark 起裁，而不是 begin：begin 在「2．」之后，题号本身的 bbox
        # 会留一截在框外，图上左上角就粘出半颗墨点。
        chars = rows[a["mark"]:end]
        if not chars:
            skipped.append((a["ch"], a["kind"], a["no"], "空区间"))
            continue

        # 纯空白字符也占一个 bbox，会被并进裁剪框：跨页答案里夹进页脚那一格空格，
        # 就把整页高度框进来、右边又只切到空格所在的列 —— c13-short-2 就是这么废的
        # （图右侧被切掉、下面混进第十四/十五章）。空白本身不可见，直接丢掉。
        chars = [c for c in chars if c[2].strip()]
        if not chars:
            skipped.append((a["ch"], a["kind"], a["no"], "只有空白"))
            continue

        by_page = {}
        for pno, bbox, _ in chars:
            by_page.setdefault(pno, []).append(bbox)
        if len(by_page) > 1:
            crosspage.append((a["ch"], a["kind"], a["no"], sorted(by_page)))

        opts = [render_clip(doc[pno], by_page[pno]) for pno in sorted(by_page)]
        opts = [im for im in opts if im is not None]
        if not opts:
            skipped.append((a["ch"], a["kind"], a["no"], "裁剪为空"))
            continue

        # 答案跨页时上下拼成一张，中间留一道白缝，别丢半截
        if len(opts) == 1:
            img = opts[0]
        else:
            w = max(im.width for im in opts)
            h = sum(im.height for im in opts) + GAP * (len(opts) - 1)
            img = Image.new("RGB", (w, h), "white")
            y = 0
            for part in opts:
                img.paste(part, (0, y))
                y += part.height + GAP

        qid = f"c{a['ch']}-{a['kind']}-{a['no']}"
        img.save(os.path.join(OUT_DIR, qid + ".webp"),
                 "WEBP", quality=WEBP_Q, method=5)
        index[qid] = {"w": img.width, "h": img.height,
                      "page": "+".join(str(p + 1) for p in sorted(by_page))}

    doc.close()
    with open(INDEX, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=1, sort_keys=True)

    total = sum(os.path.getsize(os.path.join(OUT_DIR, f))
                for f in os.listdir(OUT_DIR))
    print(f"\n裁出 {len(index)} 张小图，合计 {total / 1024:.0f} KB")
    if skipped:
        print(f"跳过 {len(skipped)} 张:")
        for s in skipped[:10]:
            print("   ", s)
    if crosspage:
        print(f"跨页 {len(crosspage)} 题（已上下拼接）:")
        for s in crosspage[:10]:
            print("   ", s)


if __name__ == "__main__":
    main()
