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
       '\n  <p class="lede" style="margin-top:14px"><strong>How each AI family sees Make, model by model:</strong> '
       '<a href="/make/claude/">Claude</a> · <a href="/make/chatgpt/">ChatGPT</a> · <a href="/make/deepseek/">DeepSeek</a> · <a href="/make/perplexity/">Perplexity</a></p>' + src[end:])

os.makedirs('make', exist_ok=True)
open('make/index.html', 'w', encoding='utf-8').write(src)
print('wrote make/index.html')
