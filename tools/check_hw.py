# -*- coding: utf-8 -*-
"""抽查 questions.json 质量：答案合法性、选项拆分、题干完整性。"""
import json
import re

d = json.load(open("data/questions.json", encoding="utf-8"))

print("========== A. 各章首题抽查 ==========")
for ch in d["chapters"]:
    print(f"\n--- 第{ch['no']}章 {ch['name']} ---")
    for s in ch["sections"]:
        if not s["questions"]:
            continue
        q = s["questions"][0]
        print(f"  [{s['label']}] #{q['no']} 答={q['answer'][:40]!r}")
        print(f"      stem: {q['stem'][:78]!r}")
        if q["options"]:
            for o in q["options"][:4]:
                print(f"        {o['key']}. {o['text'][:46]!r}")

print("\n========== B. 合法性校验 ==========")
bad_judge, bad_choice, empty_stem, no_opt = [], [], [], []
for ch in d["chapters"]:
    for s in ch["sections"]:
        for q in s["questions"]:
            a = q["answer"]
            if not q["stem"].strip():
                empty_stem.append((ch["no"], s["kind"], q["no"]))
            if s["kind"] == "judge":
                if a not in ("√", "×"):
                    bad_judge.append((ch["no"], q["no"], a[:20]))
            if s["kind"] == "choice":
                if not re.fullmatch(r"[A-D，、, ]+", a):
                    bad_choice.append((ch["no"], q["no"], a[:20]))
                if not q["options"]:
                    no_opt.append((ch["no"], q["no"]))

print("判断题答案非√/×:", len(bad_judge), bad_judge[:8])
print("选择题答案含非ABCD:", len(bad_choice), bad_choice[:8])
print("题干为空:", len(empty_stem), empty_stem[:8])
print("选择题无选项:", len(no_opt), no_opt[:10])

print("\n========== C. 选择题答案长度分布（多空题） ==========")
from collections import Counter
lens = Counter()
for ch in d["chapters"]:
    for s in ch["sections"]:
        if s["kind"] != "choice":
            continue
        for q in s["questions"]:
            n = len(re.findall(r"[A-D]", q["answer"]))
            lens[n] += 1
print("按答案字母个数:", dict(sorted(lens.items())))

print("\n========== D. 判断题答案分布 ==========")
jc = Counter()
for ch in d["chapters"]:
    for s in ch["sections"]:
        if s["kind"] != "judge":
            continue
        for q in s["questions"]:
            jc[q["answer"]] += 1
print(dict(jc))
