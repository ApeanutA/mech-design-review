# -*- coding: utf-8 -*-
"""独立核对答案区与题目区的题号配对（不复用 extract_hw 的解析代码）。

判据：每个 (章, 题型) 的「答案区题号集合」必须等于「题目区题号集合」。
题号是印在卷子上的，只要两边集合一一对应、无重复无遗漏，配对就不可能错位。

用法: python tools/verify_map.py
"""
import collections
import json
import re
import sys

import pymupdf

HW = r"E:\xwechat_files\wxid_iydyyuetduoq22_8f6a\msg\file\2026-11\机械设计习题.pdf"
CN2KIND = {"一": "choice", "二": "blank", "三": "judge", "四": "short"}
KIND_LABEL = {"choice": "单项选择题", "blank": "填空题",
              "judge": "判断对错题", "short": "名词解释及简答题"}
CH_RE = re.compile(r"^\s*第([一二三四五六七八九十]+)章")
SEC_RE = re.compile(r"^\s*([一二三四])、\s*(.*)$")
NUM_RE = re.compile(r"(\d{1,2})\s*[．.]")
CN_NUM = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8,
          "九": 9, "十": 10, "十一": 11, "十二": 12, "十三": 13, "十四": 14,
          "十五": 15, "十六": 16}


def answer_segments():
    """独立扫描答案区，返回 {(章, 题型): 该段全文}。"""
    doc = pymupdf.open(HW)
    lines, started = [], False
    for page in doc:
        for ln in page.get_text("text").split("\n"):
            if "机械设计习题参考答案" in ln:
                started = True
                continue
            if started:
                lines.append(ln.rstrip())
    doc.close()

    seg = collections.defaultdict(list)
    ch, kind = None, None
    for ln in lines:
        s = ln.strip()
        if not s or re.fullmatch(r"\d{1,3}", s):
            continue
        m = CH_RE.match(s)
        if m:
            ch = CN_NUM.get(m.group(1), 0)
            kind = None
            continue
        m = SEC_RE.match(s)
        if m:
            kind = CN2KIND[m.group(1)]
            rest = m.group(2).strip()
            if rest:
                seg[(ch, kind)].append(rest)
            continue
        if ch and kind:
            seg[(ch, kind)].append(s)
    return {k: " ".join(v) for k, v in seg.items()}


def incr_nums(text):
    """按「从 1 起、严格递增」取出题号序列（题号是印刷的，噪音数字不会递增）。"""
    picks, want = [], 1
    for m in NUM_RE.finditer(text):
        n = int(m.group(1))
        if n == want:
            picks.append(n)
            want += 1
    return picks


def main():
    ans = answer_segments()
    data = json.load(open("data/questions.json", encoding="utf-8"))

    qside = {}
    for ch in data["chapters"]:
        for s in ch["sections"]:
            qside[(ch["no"], s["kind"])] = [q["no"] for q in s["questions"]]

    print("=" * 72)
    print("题号配对核对：题目区 vs 答案区")
    print("=" * 72)

    bad = 0
    for key in sorted(qside, key=lambda k: (k[0], ["choice", "blank", "judge", "short"].index(k[1]))):
        chno, kind = key
        qs = qside[key]
        seg = ans.get(key, "")
        as_ = incr_nums(seg)
        ok = (qs == as_)
        if not ok:
            bad += 1
        mark = "✅" if ok else "❌"
        print(f"\n{mark} 第{chno}章 {KIND_LABEL[kind]}  题目 {len(qs)} 题 {qs[:3]}...{qs[-2:] if len(qs) > 3 else ''}")
        print(f"     答案区题号 {len(as_)} 个: {as_[:3]}...{as_[-2:] if len(as_) > 3 else ''}")

    print("\n" + "=" * 72)
    if bad == 0:
        print("全部 %d 组题号一一对应 ✅  → 不存在整段错位、漏配、重复覆盖" % len(qside))
    else:
        print("有 %d 组对不上 ❌" % bad)

    # 附：答案区未被任何题型段接住的 (章) —— 说明有整章答案没被识别
    chs_in_ans = {k[0] for k in ans}
    chs_in_q = {k[0] for k in qside}
    if chs_in_q - chs_in_ans:
        print("\n⚠️ 题目区有、答案区没有的章:", sorted(chs_in_q - chs_in_ans))

    # 附：每段答案开头 90 字，供人工扫一眼
    print("\n" + "-" * 72)
    print("各段答案开头（人工扫读用）")
    print("-" * 72)
    for key in sorted(ans, key=lambda k: (k[0], ["choice", "blank", "judge", "short"].index(k[1]))):
        print(f"[第{key[0]}章 {KIND_LABEL[key[1]]}] {ans[key][:90]}")


if __name__ == "__main__":
    sys.exit(main())
