# -*- coding: utf-8 -*-
"""校验 data/questions.json：答案与题目是否对应。

分两层：
  A. 结构性检查（能自动判死的）——空答案、选择题字母不在选项内、判断题非 √/×、
     答案过长（切分时吞并了后文）、答案里混进题干措辞（错位信号）。
  B. 抽样对照——把 PDF 原页面渲染成图，人工核对。

用法: python tools/verify_answers.py
"""
import collections
import json
import sys

DATA = "data/questions.json"

# 答案里不该出现的题干措辞（出现即高度怀疑错位/吞并）
STEM_WORDS = ("如图", "下列", "试问", "简述", "说明理由", "为什么", "（ ）", "( )", "A．", "B．")


def main():
    data = json.load(open(DATA, encoding="utf-8"))
    problems = collections.defaultdict(list)
    counts = collections.Counter()
    n = 0

    for ch in data["chapters"]:
        for s in ch["sections"]:
            kind = s["kind"]
            for q in s["questions"]:
                n += 1
                counts[kind] += 1
                tag = f"第{ch['no']}章/{s['label']}/第{q['no']}题"
                a = (q.get("answer") or "").strip()

                if not a:
                    problems["空答案"].append(tag)
                    continue

                if kind == "choice":
                    keys = q.get("answer_keys") or []
                    opts = [o["key"] for o in q.get("options", [])]
                    if not keys:
                        problems["选择题答案提取不到字母"].append(f"{tag} → {a[:40]!r}")
                    for k in keys:
                        if k not in opts:
                            problems["答案字母不在选项内"].append(
                                f"{tag} → keys={keys} 但选项只有 {opts}")
                    if len(a) > 12:
                        problems["选择题答案过长(疑吞并后文)"].append(f"{tag} → {a[:60]!r}")

                elif kind == "judge":
                    if a.strip("；;。. ") not in ("√", "×"):
                        problems["判断题答案非√/×"].append(f"{tag} → {a[:40]!r}")

                elif kind == "blank":
                    if len(a) > 80:
                        problems["填空题答案过长(疑吞并后文)"].append(f"{tag} → {a[:60]!r}")

                for w in STEM_WORDS:
                    if w in a:
                        problems["答案含题干措辞(疑错位)"].append(f"{tag} → {a[:50]!r}")
                        break

                # 选择题答案字母数 vs 题干空位数（多空题两边应该对得上）
                if kind == "choice":
                    blanks = q["stem"].count("＿＿＿") + q["stem"].count("（ ）")
                    if blanks >= 2 and len(q.get("answer_keys") or []) != blanks:
                        problems["多空题答案数≠空位数(仅提示)"].append(
                            f"{tag} → 空位{blanks} 答案{len(q.get('answer_keys') or [])}")

    print(f"总题数 {n}   " + "  ".join(f"{k}:{v}" for k, v in counts.items()))
    if not problems:
        print("\n结构性检查：全部通过 ✅")
        return

    for k, v in problems.items():
        print(f"\n### {k}  ({len(v)} 条)")
        for x in v[:15]:
            print("   ", x)
        if len(v) > 15:
            print(f"    ... 另有 {len(v) - 15} 条")


if __name__ == "__main__":
    sys.exit(main())
