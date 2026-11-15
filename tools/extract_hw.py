# -*- coding: utf-8 -*-
"""把《机械设计习题.pdf》解析成结构化 JSON。

产出 data/questions.json:
{
  "chapters": [
    {"no": 3, "name": "机械零件的强度",
     "sections": [
        {"kind": "choice", "label": "单项选择题",
         "questions": [{"no": 1, "stem": "...", "options": [{"key":"A","text":"..."}], "answer": "B"}]}
     ]}
  ]
}
"""
import json
import re
import sys
import pymupdf

sys.path.insert(0, "tools")
from symbols import decode_span

HW = r"E:\xwechat_files\wxid_iydyyuetduoq22_8f6a\msg\file\2026-11\机械设计习题.pdf"

CH_RE = re.compile(r"^\s*第([一二三四五六七八九十]+)章\s*(.*)$")
TITLE_RE = re.compile(r"机械设计习题(参考答案)?")
SEC_RE = re.compile(r"^\s*([一二三四])、\s*(单项选择题|填空题|判断对错题|名词解释及简答题)\s*$")
# 答案区里题型标记与答案同行（「一、1．B，C；2．C；」），用宽松版
SEC_LOOSE = re.compile(r"^\s*([一二三四])、\s*(.*)$")
Q_RE = re.compile(r"^\s*(\d+)\s*[．.]\s*(.*)$")
OPT_SPLIT = re.compile(r"(?=[A-D][．.])")

CN_NUM = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7,
          "八": 8, "九": 9, "十": 10, "十一": 11, "十二": 12, "十三": 13,
          "十四": 14, "十五": 15, "十六": 16}

KIND_BY_ORDER = {"一": "choice", "二": "blank", "三": "judge", "四": "short"}
LABEL_BY_KIND = {"choice": "单项选择题", "blank": "填空题",
                 "judge": "判断对错题", "short": "名词解释及简答题"}


def cn2int(s):
    return CN_NUM.get(s, 0)


def page_lines(path):
    """整份 PDF 逐页逐行解码，返回 [(page_no, line_text)]"""
    doc = pymupdf.open(path)
    rows = []
    for i, page in enumerate(doc):
        d = page.get_text("dict")
        for blk in d["blocks"]:
            if blk.get("type") != 0:
                continue
            for line in blk["lines"]:
                s = "".join(decode_span(sp["text"], sp["font"]) for sp in line["spans"])
                rows.append((i + 1, s.rstrip()))
    doc.close()
    return rows


def blankify(stem):
    """填空题的连续空格还原成下划线占位。"""
    # 3 个及以上空格视为空位（题目里选项分隔一般 2~6 空格，但填空题干没有选项）
    s = re.sub(r"[ \u3000]{3,}", "＿＿＿", stem)
    return s


def parse_question_block(text):
    """把一道题的整段文本拆成 stem + options。"""
    parts = OPT_SPLIT.split(text)
    stem = parts[0].strip()
    opts = []
    for p in parts[1:]:
        p = p.strip()
        if not p:
            continue
        key = p[0]
        body = p[1:].lstrip("．. ").strip()
        opts.append({"key": key, "text": body})
    return stem, opts


def split_answers(blob, n_expected):
    """答案区一段文本 -> {题号: 答案文本}。

    用「题号递增」校验，避免把 1.5 / 900~1200 里的数字当成题号。
    """
    marks = []
    for m in re.finditer(r"(\d+)\s*[．.]", blob):
        num = int(m.group(1))
        marks.append((m.start(), m.end(), num))

    picked = []
    if marks:
        want = marks[0][2]          # 从本段第一个题号起步（可能是 11，不一定是 1）
        for st, en, num in marks:
            if num == want:
                picked.append((st, en, num))
                want += 1

    out = {}
    for i, (st, en, num) in enumerate(picked):
        end = picked[i + 1][0] if i + 1 < len(picked) else len(blob)
        out[num] = blob[en:end].strip()
    return out


def main():
    rows = page_lines(HW)

    # ---- 1. 切分题目区 / 答案区 ----
    ans_start = None
    for idx, (pno, line) in enumerate(rows):
        if "机械设计习题参考答案" in line:
            ans_start = idx
            break
    assert ans_start, "没找到参考答案起始行"
    q_rows = rows[:ans_start]
    a_rows = rows[ans_start:]

    # ---- 2. 解析题目区 ----
    chapters = []
    cur = None            # 当前章
    sec = None            # 当前题型 dict
    q = None              # 当前题

    def close_q():
        nonlocal q
        if q is not None and sec is not None:
            sec["questions"].append(q)
        q = None

    def close_sec():
        nonlocal sec
        close_q()
        if sec is not None and cur is not None:
            cur["sections"].append(sec)
        sec = None

    for pno, line in q_rows:
        if not line.strip():
            continue
        if re.fullmatch(r"\d{1,3}", line.strip()):   # 页脚页眉的纯页码行
            continue
        if pno == 1 and (line.strip() in ("1", "机械设计习题")):
            continue
        m = CH_RE.match(line)
        if m:
            close_sec()
            cur = {"no": cn2int(m.group(1)), "name": m.group(2).strip(), "sections": []}
            chapters.append(cur)
            continue
        m = SEC_RE.match(line)
        if m:
            close_sec()
            kind = KIND_BY_ORDER[m.group(1)]
            sec = {"kind": kind, "label": m.group(2), "questions": []}
            continue
        m = Q_RE.match(line)
        if m and sec is not None:
            close_q()
            q = {"no": int(m.group(1)), "raw": m.group(2).strip(), "page": pno}
            continue
        if q is not None:
            q["raw"] = (q["raw"] + " " + line.strip()).strip()
        # 章节标题行之外、无当前题的孤立行直接丢
    close_sec()

    # ---- 3. 题目后处理：拆选项 / 填空下划线 ----
    for ch in chapters:
        for s in ch["sections"]:
            for q in s["questions"]:
                stem, opts = parse_question_block(q["raw"])
                if s["kind"] == "blank":
                    stem = blankify(stem)
                q["stem"] = stem
                q["options"] = opts
                del q["raw"]

    # ---- 4. 解析答案区 ----
    ans_ch = []
    acur = None
    asec = None
    ablob = []

    def close_aq():
        nonlocal ablob
        if asec is not None and ablob:
            asec["blobs"].append("".join(ablob))
        ablob = []

    def close_asec():
        nonlocal asec
        close_aq()
        if asec is not None and acur is not None:
            acur["sections"].append(asec)
        asec = None

    for pno, line in a_rows:
        s = line.strip()
        if not s:
            continue
        if TITLE_RE.search(s) and len(s) < 30:
            continue
        if re.fullmatch(r"\d{1,3}", s):
            continue
        m = CH_RE.match(line)
        if m:
            close_asec()
            acur = {"no": cn2int(m.group(1)), "name": m.group(2).strip(), "sections": []}
            ans_ch.append(acur)
            continue
        m = SEC_LOOSE.match(line)
        if m:
            close_asec()
            asec = {"kind": KIND_BY_ORDER[m.group(1)], "blobs": []}
            rest = m.group(2).strip()
            if rest:
                ablob.append(rest)
            continue
        if asec is None:
            continue
        if Q_RE.match(line):
            close_aq()
            ablob.append(s)
        else:
            ablob.append(s)
    close_asec()

    # 答案 blob -> 按题号切分
    answer_map = {}
    for ch in ans_ch:
        for s in ch["sections"]:
            for blob in s["blobs"]:
                got = split_answers(blob, 0)
                answer_map[(ch["no"], s["kind"])] = answer_map.get((ch["no"], s["kind"]), {})
                answer_map[(ch["no"], s["kind"])].update(got)

    # ---- 5. 合并答案 ----
    missing = []
    for ch in chapters:
        for s in ch["sections"]:
            amap = answer_map.get((ch["no"], s["kind"]), {})
            for q in s["questions"]:
                a = amap.get(q["no"], "")
                a = re.sub(r"\s+", " ", a).strip()
                if s["kind"] in ("choice", "judge"):
                    a = a.strip("；;。. ")
                q["answer"] = a
                if s["kind"] == "choice":
                    q["answer_keys"] = re.findall(r"[A-D]", a)
                if not a:
                    missing.append((ch["no"], s["kind"], q["no"]))

    # ---- 6. 输出 ----
    out = {"chapters": chapters}
    with open("data/questions.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    print("=== 统计 ===")
    for ch in chapters:
        seg = " | ".join(f"{s['label']}:{len(s['questions'])}" for s in ch["sections"])
        print(f"  第{ch['no']}章 {ch['name']}: {seg}")
    total = sum(len(s["questions"]) for ch in chapters for s in ch["sections"])
    print("总题数:", total)
    print("缺答案:", len(missing))
    for m in missing[:25]:
        print("   MISS", m)


if __name__ == "__main__":
    main()
