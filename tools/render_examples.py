# -*- coding: utf-8 -*-
"""渲染例题 PDF 页面为 WebP，并生成 data/examples.json。

- 渲染全部页（工具里可看任意例题），200% 缩放后压 WebP，清晰且体积小
- wanted 范围标注为「考点例题」（用户给的期末范围）
- 设环境变量 SKIP_RENDER=1 可只重建 examples.json、复用已有图片
"""
import json
import os
import re
import sys
import pymupdf

sys.path.insert(0, "tools")
from symbols import decode_span

EX = r"E:\xwechat_files\wxid_iydyyuetduoq22_8f6a\msg\file\2026-11\机械设计例题汇总.pdf"
OUT = "img/ex"
ZOOM = 2.0
WEBP_Q = 82

# 用户给的期末大题范围（已人工核对页码）
WANTED = {3: [1, 4], 5: [4, 5, 6, 7], 10: [1, 2, 4, 5, 8], 11: [1, 2], 13: [1, 3]}
# 老师标注
NOTE = {(10, 2): "老师标注：了解即可"}
# 人工修正：例2 的解答延续到 p51（该页另有例3，多给一页无害）
PAGE_OVERRIDE = {(11, 2): [50, 51]}

# 只重建 examples.json、不重渲染图片（图片已优化过，重跑纯属浪费）
SKIP_RENDER = os.environ.get("SKIP_RENDER") == "1"


def clean_title(s):
    """清理例题标题：去前导冒号、压缩空白、去掉标点碎片、限长加省略号。"""
    s = s.replace("\u3000", " ")
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"^[：:．.、，,；;）)]+\s*", "", s)
    s = re.sub(r"(?:^|\s)[．.、，,；;](?=\s|$)", " ", s)
    s = re.sub(r"\s{2,}", " ", s).strip(" ，,、；;：:．.")
    if len(s) > 40:
        s = s[:40].rstrip(" ，,、；;：:") + "…"
    return s


def main():
    os.makedirs(OUT, exist_ok=True)
    idx = json.load(open("data/example_index.json", encoding="utf-8"))
    ranges = idx["all_ranges"]

    doc = pymupdf.open(EX)
    mat = pymupdf.Matrix(ZOOM, ZOOM)

    # ---- 渲染全部页（转 WebP 压体积） ----
    from PIL import Image

    rendered = {}
    if SKIP_RENDER:
        for i, page in enumerate(doc):
            pno = i + 1
            path = f"{OUT}/p{pno:03d}.webp"
            if not os.path.exists(path):
                raise SystemExit(f"缺少 {path}，无法跳过渲染")
            with Image.open(path) as im:
                w, h = im.size
            rendered[pno] = {"path": path, "w": w, "h": h,
                             "bytes": os.path.getsize(path)}
        print(f"[跳过渲染] 复用已有 {len(rendered)} 页 -> {OUT}/")
    else:
        for i, page in enumerate(doc):
            pno = i + 1
            pix = page.get_pixmap(matrix=mat, alpha=False)
            im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            path = f"{OUT}/p{pno:03d}.webp"
            im.save(path, "WEBP", quality=WEBP_Q, method=5)
            rendered[pno] = {"path": path, "w": pix.width, "h": pix.height,
                             "bytes": os.path.getsize(path)}
        print(f"渲染 {len(rendered)} 页 -> {OUT}/")
    tot = sum(v["bytes"] for v in rendered.values())
    print(f"总体积 {tot/1024/1024:.1f} MB, 单页均值 {tot/len(rendered)/1024:.0f} KB")

    # ---- 章名 ----
    CH_RE = re.compile(r"第(\d+)章")
    chap_names = {}
    for p in idx["page_meta"]:
        if p["chap_title"]:
            # 章封面页的第二行是章名
            lines = p["head"]
            for l in lines:
                if l.strip() and not CH_RE.match(l.strip()) and "第" not in l[:3]:
                    chap_names[p["chap_title"]] = l.strip()
                    break
    print("章名:", chap_names)

    # ---- 例题标题（首页含「例N」的行） ----
    def page_lines(page):
        d = page.get_text("dict")
        out = []
        for blk in d["blocks"]:
            if blk.get("type") != 0:
                continue
            for line in blk["lines"]:
                s = "".join(decode_span(sp["text"], sp["font"]) for sp in line["spans"])
                if s.strip():
                    out.append(s.strip())
        return out

    titles = {}
    for key, (a, b) in ranges.items():
        chap, ex = (int(x) for x in key.split("-"))
        lines = page_lines(doc[a - 1])
        t = ""
        for i, l in enumerate(lines):
            m = re.match(rf"例[题]?\s*{ex}\s*[．.、]?\s*(.*)$", l)
            if m:
                t = (m.group(1) or "").strip()
                if not t:
                    # 「例N」独占一行时，正文在下一行
                    t = " ".join(x for x in lines[i + 1:i + 3] if x.strip())
                break
        titles[key] = clean_title(t)
    doc.close()

    # ---- 组装 examples.json ----
    chapters = {}
    for key, (a, b) in ranges.items():
        chap, ex = (int(x) for x in key.split("-"))
        pgs = PAGE_OVERRIDE.get((chap, ex), list(range(a, b + 1)))
        chapters.setdefault(chap, []).append({
            "no": ex,
            "pages": pgs,
            "imgs": [f"img/ex/p{p:03d}.webp" for p in pgs],
            "title": titles.get(key, ""),
            "exam": ex in WANTED.get(chap, []),
            "note": NOTE.get((chap, ex), ""),
        })
    out = {"chapters": [], "pages": rendered}
    for chap in sorted(chapters):
        exs = sorted(chapters[chap], key=lambda e: e["no"])
        out["chapters"].append({
            "no": chap,
            "name": chap_names.get(chap, ""),
            "examples": exs,
        })
    with open("data/examples.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    n_exam = sum(1 for c in out["chapters"] for e in c["examples"] if e["exam"])
    print(f"例题 {sum(len(c['examples']) for c in out['chapters'])} 道，其中考点 {n_exam} 道")
    print("写出 data/examples.json")


if __name__ == "__main__":
    main()
