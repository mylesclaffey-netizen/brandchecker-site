#!/usr/bin/env python3
"""Generate ai/index.html from index.html (the one shell). Run after any change to index.html:

    python3 build-ai.py

/ai/ is the same shell with only the AI tools: the cards are copied from the homepage's "AI Search Visibility"
category (so a card edited there changes here too) and split into two groups, both open. The shell reads its own
path, so tools open at /ai/?tool=… and the sidebar lists just these."""
import os, re, sys

src = open('index.html', encoding='utf-8').read()

def swap(old, new):
    global src
    if src.count(old) != 1:
        sys.exit('build-ai.py: expected exactly one match for: ' + old[:70])
    src = src.replace(old, new)

swap('<title>SEO Tools for Brand Managers — Brand Checker</title>', '<title>AI Visibility Tools — Brand Checker</title>')
swap('<p class="eyebrow">Free tools</p>\n  <h1>SEO Tools for Brand Managers</h1>', '<p class="eyebrow">AI tools</p>\n  <h1>How AI answers talk about your brand</h1>')

# The lede under the h1 (its wording may change; replace whatever is there).
start = src.index('<p class="lede">')
end = src.index('</p>', start) + 4
src = (src[:start] +
       '<p class="lede">Ranking in Google and being named by ChatGPT, Claude or Gemini are different questions. '
       'A brand can rank first and still be missing from the answer an AI assistant gives. These tools ask the models '
       'directly: whether they name you, how they describe you, which sources they lean on, and whether they can read '
       'your site at all.</p>'
       '\n  <p class="lede" style="margin-top:14px"><a href="/">← All tools</a></p>' + src[end:])

# Cards from the homepage's AI category, by tool slug.
cat_start = src.index('<div class="cattitle">AI Search Visibility</div>')
cat_end = src.index('</details>', cat_start)
cards = {}
for m in re.finditer(r'  <div class="live">.*?\n  </div>\n', src[cat_start:cat_end], re.S):
    slug = re.search(r'href="/tools/([a-z0-9-]+)/"', m.group(0)).group(1)
    cards[slug] = m.group(0)

GROUPS = [
    ('What AI says about you', 'Ask the models your buyers use and read what comes back: who gets named, recommended and cited.',
     ['state-of-the-llm-union', 'search-on-off', 'model-compare', 'ai-mentions', 'brand-sentiment', 'brand-questions']),
    ('Make sure AI can read you', 'Free checks and files that decide whether AI crawlers can reach your site and understand it.',
     ['crawler-check', 'llms-txt']),
]
missing = [s for _, _, slugs in GROUPS for s in slugs if s not in cards]
if missing:
    sys.exit('build-ai.py: not in the homepage AI category: ' + ', '.join(missing))
# Cards on the homepage's AI category that deliberately stay off /ai/.
NOT_ON_AI = {'page-audit'}
left = set(cards) - {s for _, _, slugs in GROUPS for s in slugs} - NOT_ON_AI
if left:
    sys.exit('build-ai.py: AI category has cards not placed in a group here: ' + ', '.join(sorted(left)))

menu = ''.join(
    '\n  <details class="category" open>\n  <summary>\n    <div>\n'
    '      <div class="cattitle">' + title + '</div>\n'
    '      <p class="catlede">' + lede + '</p>\n    </div>\n'
    '    <div class="catmeta"><span class="catcount">' + str(len(slugs)) + ' tools</span><span class="chev">›</span></div>\n'
    '  </summary>\n  <div class="live-grid">\n\n' + '\n'.join(cards[s] for s in slugs) + '\n  </div>\n  </details>\n'
    for title, lede, slugs in GROUPS)

# Replace every category in the menu with the two groups above.
m_start = src.index('<div class="category-menu">') + len('<div class="category-menu">')
m_end = src.rindex('</details>') + len('</details>')
src = src[:m_start] + '\n' + menu + src[m_end:]

# Tools here get path addresses — /ai/search-on-off/ rather than /ai/?tool=search-on-off. Each one is a copy of this
# shell; the swaps below make the shell read the tool from its path and write paths back. Old ?tool= links still work.
slugs_all = [s for _, _, slugs in GROUPS for s in slugs]
for slug in slugs_all:
    swap('href="/tools/' + slug + '/"', 'href="/ai/' + slug + '/"')
swap("var BASE = location.pathname.replace(/[^\\/]*$/, '');",
     "var BASE = '/ai/';\n  function here(slug){ return BASE + (slug ? slug + '/' : ''); }\n"
     "  function pathTool(){ var m = location.pathname.match(/^\\/ai\\/([a-z0-9-]+)\\/?$/); return m ? m[1] : null; }")
swap("return href.replace(/^\\/tools\\//,'').replace(/\\/$/,'');", "return href.replace(/^\\/(tools|ai)\\//,'').replace(/\\/$/,'');")
swap("""    var sp = forwardedParams(currentSlug ? { tool: currentSlug } : null);
    var qs = sp.toString();
    history.replaceState(history.state, '', BASE + (qs ? '?' + qs : ''));""",
     """    var qs = forwardedParams().toString();
    history.replaceState(history.state, '', here(currentSlug) + (qs ? '?' + qs : ''));""")
swap("""      var sp = forwardedParams({ tool: slug });
      history.pushState({ tool: slug }, '', BASE + '?' + sp.toString());""",
     """      var qs = forwardedParams().toString();
      history.pushState({ tool: slug }, '', here(slug) + (qs ? '?' + qs : ''));""")
swap("    var tool = p.get('tool');", "    var tool = p.get('tool') || pathTool();")
swap("""    var sp0 = forwardedParams(currentSlug ? { tool: currentSlug } : null);
    var qs0 = sp0.toString();
    history.replaceState(history.state, '', BASE + (qs0 ? '?' + qs0 : ''));""",
     """    var qs0 = forwardedParams().toString();
    history.replaceState(history.state, '', here(currentSlug) + (qs0 ? '?' + qs0 : ''));""")

os.makedirs('ai', exist_ok=True)
open('ai/index.html', 'w', encoding='utf-8').write(src)
for slug in slugs_all:
    os.makedirs('ai/' + slug, exist_ok=True)
    open('ai/' + slug + '/index.html', 'w', encoding='utf-8').write(src)
print('wrote ai/index.html and ai/<tool>/ for ' + str(len(slugs_all)) + ' tools')
