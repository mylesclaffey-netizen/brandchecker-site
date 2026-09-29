/* State Of The Union — shared helpers for the form, report and tracker pages. */
(function () {
  var API = 'https://mc2seo-tools-api.mylesclaffey.workers.dev/api';
  var Q = new URLSearchParams(location.search);
  var CODE = Q.get('k') || (function () { try { return localStorage.getItem('mc2seo_code') || ''; } catch (e) { return ''; } })() || window.MC_VISITOR || '';
  var PRESET = Q.get('preset') || '';

  // English-language markets only (the tool's focus). key = the Worker's market name.
  var MARKETS = [
    { name: 'United States', short: 'US', flag: '🇺🇸' },
    { name: 'United Kingdom', short: 'UK', flag: '🇬🇧' },
    { name: 'Canada', short: 'CA', flag: '🇨🇦' },
    { name: 'Ireland', short: 'IE', flag: '🇮🇪' },
    { name: 'Australia', short: 'AU', flag: '🇦🇺' }
  ];
  function market(name) {
    return MARKETS.filter(function (m) { return m.name === name; })[0] || { name: name, short: name.slice(0, 2).toUpperCase(), flag: '🌐' };
  }

  // One colour per tracked brand; the first (your brand) is the accent. Drawn from Hilma af Klint's
  // Altarpiece No. 1 — your brand is the painting's path indigo, competitors take the rest of its palette.
  var PALETTE = [
    { bg: '#34517A', fg: '#ffffff' }, { bg: '#C99A3E', fg: '#0a0a0a' }, { bg: '#5B8C3E', fg: '#ffffff' },
    { bg: '#A79FD1', fg: '#0a0a0a' }, { bg: '#D97A66', fg: '#0a0a0a' }, { bg: '#6FA0C4', fg: '#ffffff' }
  ];
  function colourMap(brands) {
    var m = {};
    (brands || []).forEach(function (b, i) { m[b.name] = PALETTE[i % PALETTE.length]; });
    return m;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Models answer in markdown. The page shows plain text, so drop the markup characters AFTER the mention
  // ranges have been applied (they point into the raw text) — headings become bold lines, bullets become dots,
  // table rules disappear.
  function tidy(html) {
    return html
      .replace(/\*\*/g, '').replace(/__/g, '')
      .replace(/(^|\n)#{1,6}[ \t]+([^\n]*)/g, '$1<b>$2</b>')
      .replace(/(^|\n)[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*(?=\n|$)/g, '$1')
      .replace(/(^|\n)[ \t]*[-*][ \t]+/g, '$1• ')
      .replace(/\n{3,}/g, '\n\n');
  }

  // Escape `text` and wrap every mention (ranges come from the Worker's detector) in a coloured <mark>.
  function highlight(text, mentions, colours) {
    text = String(text == null ? '' : text);
    var spans = [];
    (mentions || []).forEach(function (m) {
      (m.ranges || []).forEach(function (r) { spans.push({ s: r[0], e: r[1], name: m.name }); });
    });
    spans.sort(function (a, b) { return a.s - b.s; });
    var out = '', at = 0;
    spans.forEach(function (sp) {
      if (sp.s < at || sp.e > text.length) return; // overlap or stale offsets: skip
      var c = colours[sp.name] || PALETTE[0];
      out += esc(text.slice(at, sp.s)) + '<mark class="b" style="--bg:' + c.bg + ';--fg:' + c.fg + '">' + esc(text.slice(sp.s, sp.e)) + '</mark>';
      at = sp.e;
    });
    return tidy(out + esc(text.slice(at)));
  }

  function api(path, body) {
    return fetch(API + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ code: CODE }, body || {}))
    }).then(function (r) { return r.json(); });
  }

  // Answers that actually contain text and were checked for brands.
  function answered(cells) {
    return (cells || []).filter(function (c) { return c.status === 'done' && c.result && c.result.text && c.mentions; });
  }
  function rate(list, brand) {
    var n = 0;
    list.forEach(function (c) { var m = (c.mentions || []).filter(function (x) { return x.name === brand; })[0]; if (m && m.mentioned) n++; });
    return list.length ? n / list.length : null;
  }
  function avgPosition(list, brand) {
    var ps = [];
    list.forEach(function (c) { var m = (c.mentions || []).filter(function (x) { return x.name === brand; })[0]; if (m && m.mentioned && m.position) ps.push(m.position); });
    return ps.length ? ps.reduce(function (a, b) { return a + b; }, 0) / ps.length : null;
  }
  // '2026-07-24' -> '24 Jul 2026'
  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T00:00:00Z');
    return isNaN(d) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  function pct(v) { return v == null ? '—' : Math.round(v * 100) + '%'; }
  // "40–82%": the 95% range the Worker computes (sotuStats.js); empty when there is none.
  function range(s) { return s && s.low != null && s.high != null ? Math.round(s.low * 100) + '–' + Math.round(s.high * 100) + '%' : ''; }
  function money(v) { return '$' + (v < 0.01 ? v.toFixed(4) : (v < 0.1 ? v.toFixed(3) : v.toFixed(2))); }
  function ago(iso) {
    if (!iso) return '';
    var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 90) return 'just now';
    if (s < 5400) return Math.round(s / 60) + ' min ago';
    if (s < 129600) return Math.round(s / 3600) + ' h ago';
    return Math.round(s / 86400) + ' days ago';
  }
  function badgeFor(m) {
    if (!m) return { text: 'No brand set', cls: 'na' };
    if (!m.mentioned) return { text: 'Not mentioned', cls: 'no' };
    return { text: 'Mentioned' + (m.position ? ' #' + m.position : ''), cls: 'yes' };
  }
  var PROVIDER_LABELS = { chatgpt: 'ChatGPT', chatgpt_app: 'ChatGPT app', claude: 'Claude', perplexity: 'Perplexity', llama: 'Llama',
    mistral: 'Mistral', ai_overviews: 'AI Overviews', gemini: 'Gemini', copilot: 'Copilot' };
  function providerLabel(id) { return PROVIDER_LABELS[id] || id; }

  // "What AI gets wrong about <brand>": fact-check groups from the Worker (sotuStats.js factStats).
  function factsHtml(facts, brand) {
    if (!facts) return '';
    var head = '<h2 class="h2b">What AI gets wrong about ' + esc(brand) + '</h2>';
    if (!facts.groups.length) return head + '<div class="empty2">None of the ' + facts.checked + ' answers that name ' + esc(brand) + ' contradict your fact sheet.</div>';
    return head + '<p class="hint" style="margin:0 0 14px">' + facts.with_issues + ' of ' + facts.checked + ' answers naming ' + esc(brand) +
      ' say something your fact sheet contradicts. Every quote is the model’s own words; the check is done by a small AI model, so confirm before acting.</p>' +
      facts.groups.map(function (g) {
        return '<div style="border:3px solid #0a0a0a;padding:14px 16px;margin:0 0 14px;background:#fff">' +
          '<div style="font-size:13px;text-transform:uppercase;letter-spacing:.05em;font-weight:800">Fact: ' + esc(g.correct) + '</div>' +
          '<div class="hint" style="margin:2px 0 10px">Contradicted in ' + g.answers + ' answer' + (g.answers === 1 ? '' : 's') + ' · ' + g.providers.map(providerLabel).map(esc).join(', ') + '</div>' +
          g.examples.map(function (x) {
            return '<div class="quote" style="--bg:#ff3d00">“' + esc(x.quote) + '”<br><small>' + esc(x.claim) + ' — ' + esc(providerLabel(x.provider)) + ', ' + esc(x.location) + '</small></div>';
          }).join('') + '</div>';
      }).join('');
  }

  // Brands the answers name that aren't tracked (sotuStats.js discoverBrands). `addable`: show Add buttons.
  function discoveredHtml(list, addable) {
    if (!list || !list.length) return '';
    return '<h2 class="h2b">Brands you’re not tracking</h2><p class="hint" style="margin:0 0 12px">Named in these answers but not on your list. ' +
      (addable ? 'Add one to follow it from the next run.' : 'Add the ones that matter as competitors in your next report or tracker.') + '</p>' +
      '<div class="tblwrap"><table class="tbl"><tr><th>Brand</th><th>Answers naming it</th><th>Named by</th>' + (addable ? '<th></th>' : '') + '</tr>' +
      list.map(function (b) {
        return '<tr><td><b>' + esc(b.name) + '</b>' + (b.variants && b.variants.length ? '<br><small>also ' + b.variants.map(esc).join(', ') + '</small>' : '') + '</td>' +
          '<td class="num">' + b.answers + ' <small>(' + pct(b.share) + ')</small></td><td>' + b.providers.map(providerLabel).map(esc).join(', ') + '</td>' +
          (addable ? '<td><button class="btn2 small" type="button" data-addcomp="' + esc(b.name) + '">Add to tracker</button></td>' : '') + '</tr>';
      }).join('') + '</table></div>';
  }

  function withPreset(href) {
    if (!PRESET) return href;
    return href + (href.indexOf('?') === -1 ? '?' : '&') + 'preset=' + encodeURIComponent(PRESET);
  }

  window.SOTU = {
    API: API, CODE: CODE, PRESET: PRESET, MARKETS: MARKETS, market: market, PALETTE: PALETTE, colourMap: colourMap,
    esc: esc, highlight: highlight, api: api, answered: answered, rate: rate, avgPosition: avgPosition,
    pct: pct, range: range, money: money, factsHtml: factsHtml, discoveredHtml: discoveredHtml, providerLabel: providerLabel, fmtDate: fmtDate, ago: ago, badgeFor: badgeFor, withPreset: withPreset
  };
})();
