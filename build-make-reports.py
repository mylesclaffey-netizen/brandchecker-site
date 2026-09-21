#!/usr/bin/env python3
"""Generate the read-only shared reports at /make/claude/, /make/chatgpt/ and /make/deepseek/ from
tools/model-compare/index.html. Each page reads its saved run from make/data/<family>.json (the run's
access code is stripped when the snapshot is taken). Run after any change to the model-compare page:

    python3 build-make-reports.py"""
import os

src = open('tools/model-compare/index.html', encoding='utf-8').read()
FAMILIES = {'claude': 'Claude', 'chatgpt': 'ChatGPT', 'deepseek': 'DeepSeek', 'perplexity': 'Perplexity', 'gemini': 'Gemini'}

def swap(text, old, new):
    assert text.count(old) == 1, 'expected exactly one match for: ' + old[:60]
    return text.replace(old, new)


def nav(current):
    """The row of buttons at the top of every shared page; the page you are on is the blue one."""
    items = [('/make/', '← Brand Checker for Make', None)] + [('/make/%s/' % f, l, f) for f, l in FAMILIES.items()] + [('/make/stateoftheunion/tracker/', 'Weekly tracker', 'tracker')]
    links = ''.join(' <a class="btn2 navb%s" href="%s"%s>%s</a>' % (' blue' if key == current else '', href, ' aria-current="page"' if key == current else '', label) for href, label, key in items)
    return '<div class="sotu-actions" style="margin-top:8px">' + links.strip() + '</div>'

for fam, label in FAMILIES.items():
    page = swap(src, '<title>Model comparison</title>', '<title>%s models over time — Brand Checker for Make</title>' % label)
    page = page.replace('https://brandchecker.eu/tools/model-compare/', 'https://brandchecker.eu/make/%s/' % fam)
    page = swap(page, '<script src="/assets/sotu.js"></script>',
                '<script>window.SNAPSHOT = "/make/data/%s.json";</script>\n<script src="/assets/sotu.js"></script>' % fam)
    page = swap(page, '<div class="sotu-actions" style="margin-top:8px"><button class="btn2" id="again" type="button">← New comparison</button></div>',
                nav(fam))

    page = swap(page, '<a href="/" class="sidenav-link">← Back to tools</a>', '<a href="/make/" class="sidenav-link">← Back to Brand Checker for Make</a>')
    page = swap(page, '<a href="/tools/state-of-the-union/" class="sidenav-link">State Of The Union — across AI assistants →</a>\n      <a href="/tools/history/" class="sidenav-link">My history →</a>\n      ', '')
    os.makedirs('make/' + fam, exist_ok=True)
    open('make/%s/index.html' % fam, 'w', encoding='utf-8').write(page)
    print('wrote make/%s/index.html' % fam)

# ---- the State Of The Union tracker for Make: /make/stateoftheunion/tracker/ (live data from the worker's public-trend endpoint; the watch id must be listed in PUBLIC_TRACKERS in worker/wrangler.toml)
t = open('tools/state-of-the-union/tracker/index.html', encoding='utf-8').read()
t = swap(t, '<title>State Of The Union trackers</title>', '<title>State Of The Union tracker — Brand Checker for Make</title>') if '<title>State Of The Union trackers</title>' in t else t
t = swap(t, '<script src="/assets/sotu.js"></script>', '<script>window.SNAPSHOT = true; window.PUBLIC_TRACKER = "feb38601-904d-4c89-819a-030f29946b44";</script>\n<script src="/assets/sotu.js"></script>')
t = swap(t, '<h1>My trackers</h1>', '<h1>How AI models name Make</h1>')
t = swap(t, '<p class="sotu-sub">Each tracker re-runs your prompts on a schedule and keeps every result, so you can see whether AI models name your brand more or less over time.</p>',
         '<p class="sotu-sub">The same prompts are put to ChatGPT, Claude, Perplexity, Llama, Mistral and Google AI Overviews every week, and every result is kept, so you can see whether AI models name Make more or less over time.</p>')
t = swap(t, '<div class="sotu-actions"><a class="btn2 solid" id="newBtn" href="/tools/state-of-the-union/">New tracker</a></div>',
         nav('tracker'))
t = swap(t, "$('newBtn').setAttribute('href', link('/tools/state-of-the-union/'));", '')
t = swap(t, '<a href="/tools/state-of-the-union/" class="sidenav-link">← New State Of The Union report</a>\n    <a href="/" class="sidenav-link">← Back to tools</a>', '<a href="/make/" class="sidenav-link">← Back to Brand Checker for Make</a>')
os.makedirs('make/stateoftheunion/tracker', exist_ok=True)
open('make/stateoftheunion/tracker/index.html', 'w', encoding='utf-8').write(t)
print('wrote make/stateoftheunion/tracker/index.html')
