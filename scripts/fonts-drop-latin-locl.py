"""EB Garamond's GSUB has a Latin ('LAT ') language system whose locl feature turns u into v
(classical V for both letters). The app marks Latin text lang="la", so the browser applies it
and shows "mvltvs", "īnsvla". Wheelock and Familia Rōmāna print u and v apart, so this copies
the two upright EB Garamond files the app uses (latin subset, 400 and 600) into src/ui/fonts/
with the 'LAT ' language system removed; Latin then gets the font's default shaping.
Needs fontTools and brotli (pip install fonttools brotli). Run from the repo root after
upgrading @fontsource/eb-garamond: python3 scripts/fonts-drop-latin-locl.py"""
from fontTools.ttLib import TTFont

for w in ('400', '600'):
    src = f'node_modules/@fontsource/eb-garamond/files/eb-garamond-latin-{w}-normal.woff2'
    t = TTFont(src)
    for rec in t['GSUB'].table.ScriptList.ScriptRecord:
        s = rec.Script
        s.LangSysRecord = [l for l in s.LangSysRecord if l.LangSysTag != 'LAT ']
        s.LangSysCount = len(s.LangSysRecord)
    # woff2 first; a plain TTF as the second CSS source in case a browser refuses the re-encoded woff2.
    t.flavor = 'woff2'
    t.save(f'src/ui/fonts/eb-garamond-latin-{w}-normal-nolat.woff2')
    t.flavor = None
    t.save(f'src/ui/fonts/eb-garamond-latin-{w}-normal-nolat.ttf')
    print('wrote', w)
