#!/usr/bin/env python3
"""Generate make/index.html from index.html (the one shell). Run after any change to index.html:

    python3 build-make.py

The two pages share all behaviour — the shell reads its own path to know it is at /make/ and
passes preset=make to every tool. Only the headline copy below differs."""
import os, sys

src = open('index.html', encoding='utf-8').read()

swaps = [
    ('<title>SEO Tools for Brand Managers — Brand Checker</title>',
     '<title>Brand Checker for Make</title>'),
    ('<p class="eyebrow">Free tools</p>\n  <h1>SEO Tools for Brand Managers</h1>',
     '<p class="eyebrow">Prepared for Make</p>\n  <h1>Brand Checker for Make</h1>'),
    ('<a class="home" href="/">Brand Checker</a>',
     '<a class="home" href="/make/">Brand Checker</a>'),
]
for old, new in swaps:
    if src.count(old) != 1:
        sys.exit('build-make.py: expected exactly one match for: ' + old[:70])
    src = src.replace(old, new)

# The lede paragraph directly under the h1 (its wording may change; replace whatever is there).
start = src.index('<p class="lede">')
end = src.index('</p>', start) + 4
src = (src[:start] +
       '<p class="lede">Every tool is already filled in for Make: make.com, its competitors Zapier, n8n and '
       'Workato, and the keyword “workflow automation”. Pick a tool and run it.</p>'
       '\n  <p class="lede" style="margin-top:14px"><strong>How each AI family sees Make, model by model:</strong> <a href="/make/overview/">All on one chart</a> · '
       '<a href="/make/claude/">Claude</a> · <a href="/make/chatgpt/">ChatGPT</a> · <a href="/make/deepseek/">DeepSeek</a> · <a href="/make/perplexity/">Perplexity</a> · <a href="/make/gemini/">Gemini</a> · <a href="/make/stateoftheunion/tracker/">Weekly tracker</a></p>' + src[end:])

# On /make/ only: the Optimizely to Webflow checklist gets its own "Migration" group above Local search, so it
# sits high in the menu. It is taken out of the groups that list it on the main page (the menu credits a tool to
# the first group that lists it).
CARD_TITLE = '<h3>Optimizely to Webflow migration checklist</h3>'
card = None
while CARD_TITLE in src:
    i = src.index(CARD_TITLE)
    a = src.rindex('  <div class="live">', 0, i)
    b = src.index('No access code needed', i)
    b = src.index('  </div>\n', b) + len('  </div>\n')
    card = card or src[a:b]
    src = src[:a] + src[b:]
assert card, 'Optimizely checklist card not found'
group = (
    '  <details class="category" name="category-group">\n  <summary>\n    <div>\n'
    '      <div class="cattitle">Migration</div>\n'
    '      <p class="catlede">Moving from Optimizely to Webflow — the phase-by-phase checklist, including a phase for building the migration as a Make scenario.</p>\n'
    '    </div>\n    <div class="catmeta"><span class="catcount">1 tool</span><span class="chev">›</span></div>\n  </summary>\n'
    '  <div class="live-grid">\n\n' + card + '\n  </div>\n  </details>\n\n')
t = src.index('Local search</div>')
at = src.rindex('<details', 0, t)
at = src.rindex('\n', 0, at) + 1
src = src[:at] + group + src[at:]
# the category counts on the groups that lost it
import re
def bump(title):
    global src
    i = src.index(title + '</div>')
    m = re.compile(r'<span class="catcount">(\d+) tools?</span>').search(src, i)
    n = int(m.group(1)) - 1
    src = src[:m.start()] + '<span class="catcount">%d tool%s</span>' % (n, '' if n == 1 else 's') + src[m.end():]
bump('Free To Use Tools'); bump('Technical &amp; Migration')

os.makedirs('make', exist_ok=True)
open('make/index.html', 'w', encoding='utf-8').write(src)
print('wrote make/index.html')
