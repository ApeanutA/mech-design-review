# -*- coding: utf-8 -*-
"""SymbolMT 私用区码点 -> Unicode 映射。

PPT/Word 里的公式常用 Symbol 字体，PDF 提取时变成私用区码点 0xF000+byte。
标准 Symbol 编码表见 Adobe Symbol。这里收常用项，其余按 ASCII 兜底。
"""

_SYMBOL_HIGH = {
    0xA0: "\u20AC", 0xA1: "\u03D2", 0xA2: "\u2032", 0xA3: "\u2264", 0xA4: "\u2044",
    0xA5: "\u221E", 0xA6: "\u0192", 0xA7: "\u2663", 0xA8: "\u2666", 0xA9: "\u2665",
    0xAA: "\u2660", 0xAB: "\u2194", 0xAC: "\u2190", 0xAD: "\u2191", 0xAE: "\u2192",
    0xAF: "\u2193", 0xB0: "\u00B0", 0xB1: "\u00B1", 0xB2: "\u2033", 0xB3: "\u2265",
    0xB4: "\u00D7", 0xB5: "\u221D", 0xB6: "\u2202", 0xB7: "\u2022", 0xB8: "\u00F7",
    0xB9: "\u2260", 0xBA: "\u2261", 0xBB: "\u2248", 0xBC: "\u2026", 0xBD: "\u23D0",
    0xBE: "\u23AF", 0xBF: "\u21B5", 0xC0: "\u2135", 0xC1: "\u2111", 0xC2: "\u211C",
    0xC3: "\u2118", 0xC4: "\u2297", 0xC5: "\u2295", 0xC6: "\u2205", 0xC7: "\u2229",
    0xC8: "\u222A", 0xC9: "\u2283", 0xCA: "\u2287", 0xCB: "\u2284", 0xCC: "\u2282",
    0xCD: "\u2286", 0xCE: "\u2208", 0xCF: "\u2209", 0xD0: "\u2220", 0xD1: "\u2207",
    0xD2: "\u00AE", 0xD3: "\u00A9", 0xD4: "\u2122", 0xD5: "\u220F", 0xD6: "\u221A",
    0xD7: "\u22C5", 0xD8: "\u00AC", 0xD9: "\u2227", 0xDA: "\u2228", 0xDB: "\u21D4",
    0xDC: "\u21D0", 0xDD: "\u21D1", 0xDE: "\u21D2", 0xDF: "\u21D3", 0xE0: "\u25CA",
    0xE1: "\u2329", 0xE2: "\u00AE", 0xE3: "\u00A9", 0xE4: "\u2122", 0xE5: "\u2211",
    0xE6: "\u239B", 0xE7: "\u239C", 0xE8: "\u239D", 0xE9: "\u23A1", 0xEA: "\u23A2",
    0xEB: "\u23A3", 0xEC: "\u23A7", 0xED: "\u23A8", 0xEE: "\u23A9", 0xEF: "\u23AA",
    0xF0: "\u2320", 0xF1: "\u23AE", 0xF2: "\u2321", 0xF3: "\u23AF", 0xF4: "\u2322",
    0xF5: "\u2323", 0xF6: "\u2044", 0xF7: "\u2044", 0xF8: "\u25CA", 0xFB: "\u221A",
    0xFC: "\u207F", 0xFD: "\u00B2", 0xFE: "\u25A0", 0xFF: "\u00A0",
}

# Symbol 字体的 ASCII 区：0x41-0x5A 与 0x61-0x7A 是希腊字母。
# ⚠️ 顺序不是字母序（0x43=Χ 而非 Γ），照 Adobe Symbol 编码表逐位核过。
_SYMBOL_UPPER = "ΑΒΧΔΕΦΓΗΙϑΚΛΜΝΟΠΘΡΣΤΥςΩΞΨΖ"
_SYMBOL_LOWER = "αβχδεφγηιϕκλμνοπθρστυϖωξψζ"
_SYMBOL_ASCII = {
    0x22: "\u2200", 0x24: "\u2203", 0x27: "\u220B", 0x2D: "\u2212", 0x40: "\u2245",
    0x5C: "\u2234", 0x5E: "\u22A5", 0x60: "\u203E", 0x7E: "\u223C",
}


def decode_symbol_char(ch: str) -> str:
    """把 Symbol 字体里的一个字符解码成正常 Unicode。"""
    o = ord(ch)
    if 0x41 <= o <= 0x5A:
        return _SYMBOL_UPPER[o - 0x41]
    if 0x61 <= o <= 0x7A:
        return _SYMBOL_LOWER[o - 0x61]
    if o in _SYMBOL_ASCII:
        return _SYMBOL_ASCII[o]
    if o in _SYMBOL_HIGH:
        return _SYMBOL_HIGH[o]
    return ch


def decode_span(text: str, font: str) -> str:
    """按字体解码一个 span 的文本。

    只解私用区码点（0xF000+byte），不动 Symbol 字体的普通 ASCII ——
    混排时无法区分 `s` 到底是字母 s 还是 σ，保持原样更安全。
    """
    if not text:
        return text
    out = []
    for ch in text:
        o = ord(ch)
        if 0xF000 <= o <= 0xF0FF:
            out.append(decode_symbol_char(chr(o - 0xF000)))
        else:
            out.append(ch)
    return "".join(out)


if __name__ == "__main__":
    for cp in (0xF03D, 0xF073, 0xF02B, 0xF0B4, 0xF0A2, 0xF0D6, 0xF061, 0xF0A3):
        print(f"U+{cp:04X} -> {decode_symbol_char(chr(cp - 0xF000))!r}")
