#!/usr/bin/env python3
"""Make the pages in sitemap-pages.json indexable and generate sitemap.xml and robots.txt from the same list.

    python3 build-sitemap.py            apply and write
    python3 build-sitemap.py --check    only report problems (exit 1 if any)

The rest of the site stays noindex (see the site-wide noindex decision): only these pages carry `index, follow`, a canonical
address and a meta description, and only they are in the sitemap. Run it after editing the list, after sync-from-mc2seo.py, or after
adding a page. build-make.py / build-ai.py force noindex on their copies, so running them cannot open /make/ or /ai/."""
import json, os, re, subprocess, sys, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
cfg = json.load(open(os.path.join(HERE, 'sitemap-pages.json'), encoding='utf-8'))
BASE = cfg['base'].rstrip('/')
check = '--check' in sys.argv
problems = []

def file_of(path):
    return os.path.join(HERE, 'index.html' if path == '/' else path.strip('/') + '/index.html')

def lastmod(f):
    r = subprocess.run(['git', 'log', '-1', '--format=%cs', '--', os.path.relpath(f, HERE)], cwd=HERE, capture_output=True, text=True).stdout.strip()
    return r or datetime.date.today().isoformat()

esc = lambda s: s.replace('&', '&amp;').replace('"', '&quot;').replace('<', '&lt;')
urls = []
for p in cfg['pages']:
    path, f = p['path'], file_of(p['path'])
    if not os.path.exists(f):
        problems.append(f'{path}: page file is missing'); continue
    s = o = open(f, encoding='utf-8').read()
    url = BASE + path
    # robots: index, follow
    if re.search(r'<meta name="robots"[^>]*>', s): s = re.sub(r'<meta name="robots"[^>]*>', '<meta name="robots" content="index, follow">', s, count=1)
    else: s = s.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="robots" content="index, follow">', 1)
    # canonical
    canon = f'<link rel="canonical" href="{url}">'
    if re.search(r'<link rel="canonical"[^>]*>', s): s = re.sub(r'<link rel="canonical"[^>]*>', canon, s, count=1)
    else: s = re.sub(r'(<title>.*?</title>)', r'\1\n' + canon, s, count=1, flags=re.S)
    # description: the page's own wins; otherwise the one in the list
    if not re.search(r'<meta name="description"', s):
        if p.get('description'): s = re.sub(r'(<link rel="canonical"[^>]*>)', r'\1\n<meta name="description" content="' + esc(p['description']) + '">', s, count=1)
        else: problems.append(f'{path}: no meta description (add one to the page or to the list)')
    if '<title>' not in s: problems.append(f'{path}: no <title>')
    if s != o:
        if check: problems.append(f'{path}: not applied yet (run without --check)')
        else: open(f, 'w', encoding='utf-8').write(s)
    urls.append((url, lastmod(f)))

sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + ''.join(f'  <url>\n    <loc>{u}</loc>\n    <lastmod>{d}</lastmod>\n  </url>\n' for u, d in urls) + '</urlset>\n'
robots = f'''# brandchecker.eu: crawlers are welcome. Only the pages in the sitemap are meant for search; everything else carries noindex,
# which crawlers can only see if they are allowed to fetch it, so nothing is blocked here.
User-agent: *
Allow: /

Sitemap: {BASE}/sitemap.xml
'''
for name, text in (('sitemap.xml', sitemap), ('robots.txt', robots)):
    f = os.path.join(HERE, name)
    if check:
        if not os.path.exists(f) or open(f, encoding='utf-8').read() != text: problems.append(f'{name}: out of date')
    else: open(f, 'w', encoding='utf-8').write(text)

# Nothing outside the list may be indexable.
listed = {file_of(p['path']) for p in cfg['pages']}
for root, _, files in os.walk(HERE):
    if '.git' in root or 'node_modules' in root or 'templates' in root: continue
    for n in files:
        if n != 'index.html': continue
        f = os.path.join(root, n)
        if f in listed: continue
        if subprocess.run(['git', 'check-ignore', '-q', os.path.relpath(f, HERE)], cwd=HERE).returncode == 0: continue   # drafts kept out of git (privacy, terms)
        if not re.search(r'<meta name="robots"[^>]*noindex', open(f, encoding='utf-8').read()): problems.append(os.path.relpath(f, HERE) + ': not in the list but not noindex')
print(f'{len(urls)} pages in the sitemap')
for pr in problems: print('  PROBLEM:', pr)
sys.exit(1 if (check and problems) else 0)
