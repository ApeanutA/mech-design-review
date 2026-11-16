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
OPT_SPLIT = re.compile(r"(?=[A-F][．.])")

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


# ============================================================
# 人工修订表
#   PDF 文字层里的公式是排版"画"出来的，提取出来字符顺序会乱、
#   希腊字母会丢（第15章选择2 的 M_ca=√(M²+(αT)²) 提取成 "( ) T M M ca α + ="）。
#   这类没法用规则自动还原，逐条人工校正。
#   公式里的角标写 _{..} / ^{..}，由前端渲染成 <sub> / <sup>。
# ============================================================
FIX_STEM = {
    # 第15章：计算弯矩 M_ca=√(M²+(αT)²)，文字层里字符顺序全乱
    (15, "choice", 2):
        "求计算弯矩 $M_{ca}=\\sqrt{M^2+(\\alpha T)^2}$ 时，α 是根据转矩性质而定的转化系数，"
        "当承受的转矩是对称循环时，α = ＿＿＿。",
    # 第3章：σ 的角标 + 应力循环特性
    (3, "choice", 5):
        "一等截面直杆，其直径 $d=15$ mm，受静拉力 $F=40$ KN，材料为35钢，"
        "$\\sigma_b=540$ N/mm2，$\\sigma_s=320$ N/mm2，则该杆的工作安全系数为      。",
    (3, "blank", 5):
        "若一零件的应力循环特性 $r=+0.5$，$\\sigma_a=70$ MPa，则此时，"
        "$\\sigma_m$ 为＿＿＿，$\\sigma_{max}$ 为＿＿＿，$\\sigma_{min}$ 为＿＿＿。",
    # 第10章：圆锥齿轮传动比
    (10, "choice", 9):
        "正交直齿圆锥齿轮传动的齿数为 $z_1$ 和 $z_2$，圆锥角 $\\delta_1$、$\\delta_2$，"
        "其传动比 $i=z_2/z_1=$       。",
    # 第11章：导程角原卷是 λ=7°7′30″，文字层里度符号丢了变成 "707′30′′"
    (11, "choice", 5):
        "一正交阿基米德蜗杆传动的蜗杆导程角 $\\lambda=7^{\\circ}7'30''$（右旋），"
        "蜗轮的螺旋角 $\\beta=$      。",
    (11, "choice", 8):
        "对滑动速度 $V_s\\geq 3$ m/s 的重要蜗杆传动应采用       作蜗轮的齿圈材料。",
    (11, "judge", 2):
        "在蜗杆传动比 $i=z_2/z_1$ 中，蜗杆头数 $z_1$ 相当于齿数，因此其分度圆直径 $d_1=z_1 m$。",
    # 第13章：寿命指数 ε 是 (C/P) 的上标，文字层里跟 P 排在一行
    (13, "choice", 14):
        "滚动轴承额定寿命与额定动载荷之间的关系为 $L=(C/P)^{\\varepsilon}$，"
        "其中 P 为轴承的       。",
    (13, "choice", 15):
        "滚动轴承额定寿命与额定动载荷之间具有如下关系 $L=(C/P)^{\\varepsilon}$，"
        "其中 ε 称为寿命指数，对于滚子轴承和球轴承分别为             。",
    # 第5章选择16：四个选项全是公式，文字层里散成一堆碎片（还原依据是原卷 PDF 第3页）
    #   原卷：A. F₂=F+F₀  B. F₂=F+F₁  C. F₂=F₀+F₁  D. F₂=F+C_b/(C_b+C_m)·F₀，答案 B
    (5, "choice", 16):
        "承受预紧力 $F_0$ 的紧螺栓联接在受工作拉力 $F$ 时，残余预紧力为 $F_1$，"
        "其螺栓所受的总拉力 $F_2$ 为＿＿＿＿＿。",
    # 第5章选择15：原卷第 4 个空的下划线排丢了，文字层只剩 1 个空格 → 前端只画出 3 个空位，
    #   而答案 AABB 是 4 个字母、前端多选题要求选够 4 个，故补齐第 4 个空位
    (5, "choice", 15):
        "对顶螺母为＿＿＿防松，弹簧垫圈为＿＿＿防松，开口销与槽形螺母为＿＿＿防松，"
        "止动垫圈为＿＿＿防松。",
    # 第5章选择10：四个空位宽度不一、逗号后还带断行空格，统一成等宽空位
    (5, "choice", 10):
        "受横向载荷的普通螺栓所受的载荷是＿＿＿，受横向载荷的配合螺栓所受的载荷是＿＿＿，"
        "受轴向载荷的松螺栓所受的载荷是＿＿＿，受轴向载荷的紧螺栓所受的载荷是＿＿＿。",
    # 第5章填空1：题干里 "是指 螺纹" / "公式 为" 有多余的断行空格；
    #   "螺纹和＿＿＿径" 是原卷笔误（应为 "的"，已对照 PDF 第3页确认是原卷印错，不是提取问题）
    (5, "blank", 1):
        "螺纹的公称直径是指螺纹和＿＿＿径，计算螺纹危险剖面时使用的是螺纹的＿＿＿径。"
        "螺旋升角是指螺纹＿＿＿径处的升角。螺旋的自锁条件为＿＿＿，拧紧螺母时效率公式为＿＿＿。",
    # 第8章选择6：四个速度关系式里的角标和全角 "＝" 混排
    (8, "choice", 6):
        "带传动中，主动轮圆周速度 $v_1$，从动轮圆周速度 $v_2$，带速 $v$，"
        "它们之间存在的关系是＿＿＿。",
    # 第10章选择4：原卷此处多打了一个逗号
    (10, "choice", 4):
        "一减速齿轮传动，小齿轮1 选45 钢调质，大齿轮2 选45 钢正火，"
        "它们的齿面接触应力 $\\sigma_{H1}$ ＿＿＿ $\\sigma_{H2}$。",
    # 第10章选择16：HB 角标 + "的 关系" 断行空格
    (10, "choice", 16):
        "设计一对材料相同的软齿面齿轮传动时，一般使小齿轮齿面硬度 $HB_1$ 和大齿轮齿面硬度 "
        "$HB_2$ 的关系为＿＿＿。",
    # 第10章判断7：原卷把 "选小些" 误排成 "选项小些"（放大原图确认是原卷印错）
    (10, "judge", 7):
        "为了减小齿向载荷分布系数 $K_{\\beta}$，应该尽量使齿轮在两轴承中间对称分布，"
        "并把齿宽系数 $\\psi_d$ 尽量选项小些。",
}
FIX_OPTION = {
    # 第8章：欧拉公式 e^{fα}
    (8, "choice", 4, "A"): "$F_1/F_2\\approx 1$",
    (8, "choice", 4, "B"): "$F_1/F_2\\approx 0$",
    (8, "choice", 4, "C"): "$F_1/F_2=e^{f\\alpha}$",
    (8, "choice", 4, "D"): "$1<F_1/F_2<e^{f\\alpha}$",
    # 第10章：圆锥齿轮传动比的四种写法
    (10, "choice", 9, "A"): "$\\cot\\delta_1$",
    (10, "choice", 9, "B"): "$\\tan\\delta_1$",
    (10, "choice", 9, "C"): "$\\cos\\delta_2$",
    (10, "choice", 9, "D"): "$\\sin\\delta_2$",
    # 第11章：传动比四式
    (11, "choice", 3, "A"): "$i=\\omega_1/\\omega_2$",
    (11, "choice", 3, "B"): "$i=z_2/z_1$",
    (11, "choice", 3, "C"): "$i=d_2/d_1$",
    (11, "choice", 3, "D"): "$i=n_1/n_2$",
    # 第11章：蜗杆直径系数（原卷 B 就是 q = d₁m，中间没有间隔号）
    (11, "choice", 4, "A"): "$q=d_1/m$",
    (11, "choice", 4, "B"): "$q=d_1 m$",
    (11, "choice", 4, "C"): "$q=a/m$",
    (11, "choice", 4, "D"): "$q=a/d_1$",
    # 第11章选择5：度符号在文字层里丢了
    (11, "choice", 5, "A"): "$\\lambda$",
    (11, "choice", 5, "B"): "$90^{\\circ}-\\lambda$",
    (11, "choice", 5, "C"): "$20^{\\circ}$",
    (11, "choice", 5, "D"): "$15^{\\circ}$",
    # 第13章：寿命指数的四种组合
    (13, "choice", 15, "A"): "$3/10$ 和 $3$",
    (13, "choice", 15, "B"): "$3/10$ 和 $10/3$",
    (13, "choice", 15, "C"): "$10/3$ 和 $3/10$",
    (13, "choice", 15, "D"): "$10/3$ 和 $3$",
    # 第5章选择16：四个总拉力公式（原卷 A. F₂=F+F₀  B. F₂=F+F₁  C. F₂=F₀+F₁  D. F₂=F+C_b/(C_b+C_m)·F₀）
    (5, "choice", 16, "A"): "$F_2=F+F_0$",
    (5, "choice", 16, "B"): "$F_2=F+F_1$",
    (5, "choice", 16, "C"): "$F_2=F_0+F_1$",
    (5, "choice", 16, "D"): "$F_2=F+\\dfrac{C_b}{C_b+C_m}F_0$",
    # 第8章选择6：v1、v2 的角标 + 全角 "＝"
    (8, "choice", 6, "A"): "$v_1=v_2=v$",
    (8, "choice", 6, "B"): "$v_1>v>v_2$",
    (8, "choice", 6, "C"): "$v_1<v<v_2$",
    (8, "choice", 6, "D"): "$v>v_1>v_2$",
    # 第10章选择16：HB1 / HB2 角标
    (10, "choice", 16, "A"): "$HB_1<HB_2$",
    (10, "choice", 16, "B"): "$HB_1=HB_2$",
    (10, "choice", 16, "C"): "$HB_1>HB_2$",
}
FIX_ANSWER = {
    # 原卷"屈服极限 σs；强度极限 σb"，σ 在文字层里丢了
    (3, "blank", 4): "屈服极限 $\\sigma_s$；强度极限 $\\sigma_b$。",
    # 原卷是 "210Mpa；280 Mpa；140 Mpa"，单位大小写写错了
    (3, "blank", 5): "210 MPa；280 MPa；140 MPa。",
    # 原卷 "1，e^fα"，文字层里 e^{fα} 散成了 "fe α"
    (8, "blank", 4): "1，$e^{f\\alpha}$。",
    # 原卷 P = F_e V
    (8, "short", 1):
        "带传动一般放在高速级，因为：$P=F_e V$，当带传递的功率 P 一定时，"
        "速度越高，则有效圆周力越小，则带的根数就越少，这有利于带传动的设计。",
    # 原卷三个并列公式：F_e=F_1-F_2、F_1+F_2=2F_0、F_ec=2F_0(e^fα-1)/(e^fα+1)
    (8, "short", 2):
        "$F_e=F_1-F_2$；$F_1+F_2=2F_0$；"
        "$F_{ec}=2F_0\\dfrac{e^{f\\alpha}-1}{e^{f\\alpha}+1}$",
    # 这题是纯公式推导，文字层里彻底散架
    # （提取出来是 "=ε16667⁄◊⁄⎜⎝⎛=PCnLhΘ16667⁄◊⁄⎜⎝⎛=PCnLh=∴hhLL"），
    # 与其显示乱码不如直接指向原图
    (13, "short", 2): "（这题是公式推导，文字层里散架了 —— 请看上面的原书答案图。）",
    # 第5章填空1：原卷效率公式 tanλ/tan(λ+φ_v)，文字层里散成 ")tan(tanvϕλλ+"
    (5, "blank", 1):
        "大，小，中，螺旋升角小于螺旋副的当量摩擦角，"
        "$\\tan\\lambda/\\tan(\\lambda+\\varphi_v)$。",
}


def apply_fixes(chapters):
    """把人工修订表套到解析结果上，并重算受影响的 answer_keys。"""
    n = 0
    for ch in chapters:
        for s in ch["sections"]:
            for q in s["questions"]:
                k = (ch["no"], s["kind"], q["no"])
                if k in FIX_STEM:
                    q["stem"] = FIX_STEM[k]
                    n += 1
                if k in FIX_ANSWER:
                    q["answer"] = FIX_ANSWER[k]
                    n += 1
                    if s["kind"] == "choice":
                        q["answer_keys"] = re.findall(r"[A-F]", q["answer"])
                for o in q.get("options", []):
                    ok = (ch["no"], s["kind"], q["no"], o["key"])
                    if ok in FIX_OPTION:
                        o["text"] = FIX_OPTION[ok]
                        n += 1
    print("人工修订:", n, "处")
    return n


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
                    q["answer_keys"] = re.findall(r"[A-F]", a)
                if not a:
                    missing.append((ch["no"], s["kind"], q["no"]))

    # ---- 5.5 人工修订（公式在文字层里被打散，规则救不回来）----
    apply_fixes(chapters)

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
