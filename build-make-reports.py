#!/usr/bin/env python3
"""Generate the read-only shared reports at /make/claude/, /make/chatgpt/ and /make/deepseek/ from
tools/model-compare/index.html. Each page reads its saved run from make/data/<family>.json (the run's
access code is stripped when the snapshot is taken). Run after any change to the model-compare page:

    python3 build-make-reports.py"""
import os

src = open('tools/model-compare/index.html', encoding='utf-8').read()
FAMILIES = {'claude': 'Claude', 'chatgpt': 'ChatGPT', 'deepseek': 'DeepSeek', 'perplexity': 'Perplexity'}

def swap(text, old, new):
    assert text.count(old) == 1, 'expected exactly one match for: ' + old[:60]
    return text.replace(old, new)

for fam, label in FAMILIES.items():
    page = swap(src, '<title>Model comparison</title>', '<title>%s models over time — Brand Checker for Make</title>' % label)
    page = page.replace('https://brandchecker.eu/tools/model-compare/', 'https://brandchecker.eu/make/%s/' % fam)
    page = swap(page, '<script src="/assets/sotu.js"></script>',
                '<script>window.SNAPSHOT = "/make/data/%s.json";</script>\n<script src="/assets/sotu.js"></script>' % fam)
    page = swap(page, '<div class="sotu-actions" style="margin-top:8px"><button class="btn2" id="again" type="button">← New comparison</button></div>',
                '<div class="sotu-actions" style="margin-top:8px"><a class="btn2" href="/make/">← Brand Checker for Make</a>'
                + ''.join(' <a class="btn2" href="/make/%s/">%s</a>' % (f, l) for f, l in FAMILIES.items() if f != fam) + '</div>')
    page = swap(page, '<a href="/" class="sidenav-link">← Back to tools</a>', '<a href="/make/" class="sidenav-link">← Back to Brand Checker for Make</a>')
    page = swap(page, '<a href="/tools/state-of-the-union/" class="sidenav-link">State Of The Union — across AI assistants →</a>\n      <a href="/tools/history/" class="sidenav-link">My history →</a>\n      ', '')
    os.makedirs('make/' + fam, exist_ok=True)
    open('make/%s/index.html' % fam, 'w', encoding='utf-8').write(page)
    print('wrote make/%s/index.html' % fam)
