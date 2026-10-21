#!/usr/bin/env python3
"""Copy the tools that are made on mc2seo.com to brandchecker.eu, in Brand Checker's look.

The opposite direction of deploy/sync-from-brandchecker.py (which owns the LLM and B2B tools): these pages are edited in
deploy/ and copied here. Run it after changing them there, then check the pages locally and commit/push this repo.

  python3 sync-from-mc2seo.py

What changes on the way: the head (noindex, visitor id, Brand Checker fonts and icon, theme.css instead of mc2-tool.css,
no fix-it box), mc2seo's palette and fonts → Brand Checker's, mc2seo.com → brandchecker.eu, the access code → the
visitor id, and the agency-only links (QUOTED guide, contact a consultant) are dropped.
"""
import os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'deploy')

PAGES = ['tools/lil-rag-chunker/index.html', 'tools/llms-txt/index.html']
ASSETS = ['assets/llms-draft.js', 'assets/rag-presets.js']

FONTS = '<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">'
ICON = '''<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='0' fill='%2334517A'/%3E%3C/svg%3E" />'''
# mc2-tool.css's own variables, as Brand Checker values (theme.css sets the shared ones: --ink, --line, --you, ...).
VARS = ('<style>:root{--card2:#f3f3ef;--mc-display:\'Archivo\',system-ui,sans-serif;--mc-body:\'Archivo\',system-ui,sans-serif;'
        '--mc-mono:\'IBM Plex Mono\',ui-monospace,monospace;--mc-ink2:#0a0a0a;--mc-line2:#0a0a0a;--mc-soft:#f3f3ef;--mc-warm:#ff3d00}'
        # white on vermilion is too low-contrast (theme.css does the same for its chips): black on the accent instead
        '.tab[aria-selected=true]{color:#0a0a0a}</style>')

# mc2seo palette → Brand Checker palette (the reverse of sync-from-brandchecker.py's FIXED map).
COLOURS = {
    '#4f5bd5': '#ff3d00', '#3a45b8': '#d92f00', '#0f172a': '#0a0a0a', '#1e293b': '#0a0a0a', '#334155': '#0a0a0a',
    '#64748b': '#3d3d3d', '#94a3b8': '#767676', '#e5e7eb': '#0a0a0a', '#d7dbe2': '#0a0a0a', '#f8fafc': '#ffffff',
    '#f1f5f9': '#f3f3ef', '#eef0ff': '#f3f3ef', '#15803d': '#00844a', '#a15c07': '#b45f00', '#b42318': '#d40000',
}


def brand(s):
    s = s.replace('https://mc2seo.com', 'https://brandchecker.eu').replace('mc2seo.com', 'brandchecker.eu')
    return s.replace(' — MC2SEO', ' | Brand Checker').replace('by MC2SEO', 'by Brand Checker').replace('MC2SEO', 'Brand Checker')


def colours(s):
    for a, b in COLOURS.items():
        s = re.sub(re.escape(a) + r'\b', b, s, flags=re.I)
    s = s.replace("'Plus Jakarta Sans'", "'Archivo'").replace("'JetBrains Mono'", "'IBM Plex Mono'").replace('Inter,', "'Archivo',")
    return s


def must(s, old, new, rel):
    if old not in s:
        sys.exit('sync-from-mc2seo.py: %s no longer has %r: update this script' % (rel, old[:70]))
    return s.replace(old, new)


def page(rel):
    s = open(os.path.join(SRC, rel), encoding='utf-8').read()
    s = must(s, '<meta charset="utf-8">\n', '<meta charset="utf-8">\n<meta name="robots" content="noindex, nofollow">\n<script src="/assets/visitor.js"></script>\n', rel)
    s = re.sub(r'<link rel="canonical"[^>]*>\n', '', s)
    s = re.sub(r'<link rel="icon"[^\n]*\n', ICON + '\n', s, count=1)
    s = re.sub(r'<link rel="preconnect"[^\n]*\n', '', s)
    s = re.sub(r'<link href="https://fonts.googleapis.com/css2[^"]*" rel="stylesheet">', FONTS, s, count=1)
    s = must(s, '<link rel="stylesheet" href="/assets/mc2-tool.css">', VARS + '\n<link rel="stylesheet" href="/assets/theme.css">', rel)
    s = s.replace('<script src="/assets/mc2-fixit.js" defer></script>\n', '')
    # The visitor id (assets/visitor.js) stands in for mc2seo's saved access code; an access link (?k=) still wins.
    s = s.replace("(function () { try { return localStorage.getItem('mc2seo_code') || ''; } catch (e) { return ''; } })()", "window.MC_VISITOR || ''")
    s = s.replace("new URLSearchParams(location.search).get('k') || '';", "new URLSearchParams(location.search).get('k') || window.MC_VISITOR || '';")
    # Agency-only links: brandchecker.eu has no QUOTED guide or consultants, and its tools list is the homepage.
    s = re.sub(r'\s*<a href="/quoted-framework/" class="sidenav-link">[^<]*</a>', '', s)
    s = re.sub(r'\s*<a href="/#contact" class="sidenav-link accent">[^<]*</a>', '', s)
    s = re.sub(r'\s*<a href="/" class="sidenav-link">← Back to homepage</a>', '', s)
    s = s.replace('<a href="/tools/" class="sidenav-link">← Back to tools</a>', '<a href="/" class="sidenav-link">← Back to tools</a>')
    s = s.replace('href="/#contact"', 'href="mailto:mylesclaffey@gmail.com?subject=Brand%20Checker%20access%20code"')
    s = must(s, '</body>', '<script src="/assets/presets.js"></script>\n</body>', rel)
    return colours(brand(s))


def write(rel, text):
    path = os.path.join(HERE, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    old = open(path, encoding='utf-8').read() if os.path.exists(path) else None
    if old != text:
        open(path, 'w', encoding='utf-8').write(text)
        print('wrote', rel)


for rel in PAGES:
    write(rel, page(rel))
for rel in ASSETS:
    write(rel, brand(open(os.path.join(SRC, rel), encoding='utf-8').read()))
