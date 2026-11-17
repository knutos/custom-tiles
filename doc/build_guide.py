# Builds the user guide (HTML -> PDF) from src/<lang>/body.html.  Usage: build_guide.py <src dir> <version> <out dir>
import sys, re, os, asyncio
from playwright.async_api import async_playwright

SRC, VER, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
T = {
    'no': dict(file='Geocaching-Map-Custom-Tile-Layers-Brukerveiledning.pdf', kind='Brukerveiledning', toc='Innhold',
               sub='Brukerveiledning og teknisk beskrivelse for brukerskriptet, versjon {v}',
               by='Utarbeidet for Knut Olav Sunde · {m}', month='november 2026',
               runs='Virker på geocaching.com: kartet (<code>/map</code>), søkekartet (<code>/play/map</code>) og cachesidene. Skjermbildene viser skriptets eget grensesnitt, tegnet på en eksempelbakgrunn.'),
    'en': dict(file='Geocaching-Map-Custom-Tile-Layers-Guide.pdf', kind='User guide', toc='Contents',
               sub='User guide and technical reference for the userscript, version {v}',
               by='Prepared for Knut Olav Sunde · {m}', month='November 2026',
               runs='Runs on geocaching.com: the browse map (<code>/map</code>), the search map (<code>/play/map</code>) and cache pages. Screenshots show the script\'s own interface, rendered on a sample map background.'),
}
CSS = """
@page { size: A4; margin: 22mm 18mm 20mm 18mm; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: Inter, 'Helvetica Neue', Arial, sans-serif; font-size: 10.6pt; line-height: 1.5; color: #1f2328; margin: 0; }
h2 { font-size: 16.5pt; margin: 22pt 0 10pt; padding-bottom: 6pt; border-bottom: 1.5px solid #1f7a4d; break-after: avoid; page-break-after: avoid; }
h2.first { margin-top: 0; }
h3 { font-size: 12.5pt; margin: 16pt 0 6pt; break-after: avoid; }
p { margin: 0 0 7pt; }
p.small, .small { color: #57606a; font-size: 9.6pt; }
ul, ol { margin: 0 0 8pt; padding-left: 20pt; }
li { margin: 0 0 3pt; }
ul li::marker { color: #1f7a4d; }
code { font-family: 'Liberation Mono', Menlo, monospace; font-size: 8.8pt; background: #eff2f5; border-radius: 4px; padding: 1px 4px; }
kbd { font-family: 'DejaVu Sans Mono', Menlo, monospace; font-size: 8.6pt; border: 1px solid #c9d1d9; border-bottom-width: 2px; border-radius: 4px; padding: 0 4px; background: #fff; }
img.ic { height: 1.25em; vertical-align: -0.28em; }
td img.ic { height: 22px; vertical-align: middle; }
.new { display: inline-block; background: #d1242e; color: #fff; font-weight: 700; font-size: 7.5pt; letter-spacing: .04em; border-radius: 10px; padding: 1px 6px; vertical-align: 2px; }
.red { color: #d1242e; } .blue { color: #0969da; }
table { width: auto; max-width: 100%; border-collapse: collapse; margin: 6pt 0 12pt; font-size: 9.9pt; break-inside: auto; }
th { text-align: left; background: #f6f8fa; padding: 5pt 6pt; border-bottom: 1px solid #c9d1d9; vertical-align: top; }
td { padding: 5pt 6pt; border-bottom: 1px solid #d8dee4; vertical-align: top; }
tr { break-inside: avoid; }
tr.sub td { background: #f6f8fa; font-weight: 700; }
.note { background: #ddf4ff; border-left: 4px solid #54aeff; padding: 8pt 11pt; margin: 8pt 0 12pt; border-radius: 4px; break-inside: avoid; }
.note p:last-child { margin-bottom: 0; }
figure.fig { float: right; clear: right; width: max(110px, min(var(--w), 46%)); margin: 2pt 0 10pt 16pt; text-align: center; break-inside: avoid; }
figure.fig.full { float: none; width: min(var(--w), 100%); margin: 8pt auto 12pt; }
figure img { width: var(--w); max-width: 100%; border-radius: 6px; box-shadow: 0 2px 10px rgba(0,0,0,.16); }
figcaption { color: #57606a; font-size: 9pt; margin-top: 6pt; }
h2 { clear: both; }
aside.side { float: right; clear: right; width: min(var(--w), 46%); margin: 2pt 0 10pt 16pt; }
aside.side figure.fig.in { float: none; width: auto; margin: 0 0 8pt; }
aside.side h3 { margin-top: 6pt; }
.cover { height: 232mm; position: relative; page-break-after: always; padding-top: 38mm; box-sizing: border-box; }
.cover h1 { font-size: 30pt; line-height: 1.12; margin: 0 0 8pt; padding-left: 12pt; border-left: 6px solid #1f7a4d; }
.cover .sub { color: #57606a; font-size: 12.5pt; margin: 0 0 18mm; }
.cover .shot { text-align: center; }
.cover .shot img { width: 54mm; border-radius: 8px; box-shadow: 0 3px 14px rgba(0,0,0,.18); }
.cover .foot { position: absolute; bottom: 0; left: 0; right: 0; border-top: 1px solid #d8dee4; padding-top: 8pt; color: #57606a; font-size: 9.2pt; }
.toc { columns: 2; column-gap: 24pt; padding: 0; margin: 0 0 14pt; list-style: none; }
.toc li { margin: 0 0 3pt; }
.toc span { display: inline-block; min-width: 18pt; color: #57606a; }
"""


def build(lang):
    t = T[lang]; d = os.path.join(SRC, lang)
    body = open(os.path.join(d, 'body.html'), encoding='utf-8').read()
    heads = re.findall(r'<h2>(.*?)</h2>', body)
    toc = ''
    for h in heads:
        txt = re.sub(r'<[^>]+>', '', h).replace('NYHET', '').replace('NEW', '').strip()
        m = re.match(r'(\d+)\.\s*(.*)', txt)
        if m: toc += f'<li><span>{m.group(1)}.</span> {m.group(2)}</li>'
    body = body.replace('<!--TOC-->', f'<h2 class="first">{t["toc"]}</h2><ol class="toc">{toc}</ol>', 1)
    cover = f'''<section class="cover"><h1>Geocaching Map –<br>Custom Tile Layers</h1>
<p class="sub">{t["sub"].format(v=VER)}</p>
<div class="shot"><img src="img/cover.png" alt=""></div>
<div class="foot"><p>{t["by"].format(m=t["month"])}</p><p>{t["runs"]}</p></div></section>'''
    doc = f'<!doctype html><html lang="{"nb" if lang == "no" else "en"}"><head><meta charset="utf-8"><style>{CSS}</style></head><body>{cover}\n{body}</body></html>'
    path = os.path.join(d, 'guide.html')
    open(path, 'w', encoding='utf-8').write(doc)
    return path, t


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for lang in ('no', 'en'):
            if not os.path.exists(os.path.join(SRC, lang, 'body.html')): continue
            path, t = build(lang)
            pg = await b.new_page()
            await pg.goto('file://' + os.path.abspath(path)); await pg.wait_for_load_state('networkidle')
            foot = f'<div style="font-family:Inter,Arial;font-size:7.5pt;color:#57606a;width:100%;padding:0 18mm;display:flex;justify-content:space-between"><span>Geocaching Map – Custom Tile Layers · {t["kind"]} · v{VER}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>'
            await pg.pdf(path=os.path.join(OUT, t['file']), format='A4', print_background=True, display_header_footer=True,
                         header_template='<div></div>', footer_template=foot, margin=dict(top='20mm', bottom='18mm', left='18mm', right='18mm'))
            print('wrote', t['file'])
        await b.close()

asyncio.run(main())
