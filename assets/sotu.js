/* State Of The LLM Union — shared helpers for the form, report and tracker pages. */
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
      // [n8n](https://n8n.io) → n8n. The address may itself contain a brand highlight (<mark>make.com</mark>), hence [^)\n].
      .replace(/\[([^\]\n]*)\]\((https?:[^)\n]*)\)/g, '$1')
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
            return '<div class="quote" style="--bg:#ff3d00">“' + esc(x.quote.replace(/\*\*|__/g, '').trim()) + '”<br><small>' + esc(x.claim) + ' — ' + esc(providerLabel(x.provider)) + ', ' + esc(x.location) + '</small></div>';
          }).join('') + '</div>';
      }).join('');
  }

  // "How models describe <brand>": per-dimension favourable/unfavourable counts and the answers' own phrases
  // (Worker: factCheck.js readAbout traits, aggregated in sotuStats.js describeStats).
  var GOOD = '#1b7040', BAD = '#c0321f';
  function describeHtml(ds, brand) {
    if (!ds || !ds.dims.length) return '';
    var rows = ds.dims.map(function (d) {
      var w = function (n) { return Math.round(100 * n / ds.answers); };
      var phrases = (d.phrases || []).map(function (p) {
        return '<span style="display:inline-block;margin:2px 4px 2px 0;padding:1px 7px;border:2px solid ' + (p.tone === '-' ? BAD : GOOD) + ';font-size:13px">' + esc(p.phrase) + (p.n > 1 ? ' <small>×' + p.n + '</small>' : '') + '</span>';
      }).join('');
      return '<tr><td><b>' + esc(d.label) + '</b></td>' +
        '<td style="min-width:140px"><div style="display:flex;height:14px;border:2px solid #0a0a0a;background:#f3f3ef"><i style="width:' + w(d.pos) + '%;background:' + GOOD + '"></i><i style="width:' + w(d.neg) + '%;background:' + BAD + '"></i></div></td>' +
        '<td class="num"><span style="color:' + GOOD + '">' + d.pos + ' +</span> / <span style="color:' + BAD + '">' + d.neg + ' −</span></td><td>' + phrases + '</td>' +
        '<td style="font-size:13px">' + (d.models || []).map(function (m) {
          return '<span style="white-space:nowrap">' + esc(providerLabel(m.model)) + (m.pos ? ' <b style="color:' + GOOD + '">+' + m.pos + '</b>' : '') + (m.neg ? ' <b style="color:' + BAD + '">−' + m.neg + '</b>' : '') + '</span>';
        }).join('<br>') + '</td></tr>';
    }).join('');
    var best = (ds.best_for || []).length ? '<p style="margin:0 0 30px"><b>Who they say ' + esc(brand) + ' is best for:</b> ' + ds.best_for.map(function (b) { return '“' + esc(b.phrase) + '”' + (b.n > 1 ? ' ×' + b.n : ''); }).join(' · ') + '</p>' : '';
    return '<h2 class="h2b">How models describe ' + esc(brand) + '</h2><p class="hint" style="margin:0 0 12px">From ' + ds.answers + ' answers that name ' + esc(brand) +
      '. Green: described favourably on that point; red: unfavourably. The chips are the answers’ own words. Tagged by a small AI model.</p>' +
      '<div class="tblwrap"><table class="tbl" style="margin:0 0 12px"><tr><th>Dimension</th><th>Share of answers</th><th>Favourable / unfavourable</th><th>What they say</th><th>Models</th></tr>' + rows + '</table></div>' + best;
  }

  // Tracker: one row per dimension, one column per run (oldest → newest), each cell "favourable / unfavourable".
  function describeTrendHtml(runs, brand, when) {
    var rs = (runs || []).filter(function (r) { return r.describe && r.describe.dims.length; }).slice(-8);
    if (rs.length < 2) return '';
    var dims = [];
    rs.forEach(function (r) { r.describe.dims.forEach(function (d) { if (!dims.some(function (x) { return x.dim === d.dim; })) dims.push({ dim: d.dim, label: d.label }); }); });
    var head = '<tr><th>Dimension</th>' + rs.map(function (r) { return '<th>' + esc(when(r.created_at)) + '</th>'; }).join('') + '</tr>';
    var body = dims.map(function (x) {
      return '<tr><td><b>' + esc(x.label) + '</b></td>' + rs.map(function (r) {
        var d = r.describe.dims.filter(function (y) { return y.dim === x.dim; })[0];
        if (!d) return '<td class="num" style="color:#8a8a8a">—</td>';
        var t = (d.pos - d.neg) / d.mentions;
        var bg = t > 0.2 ? 'rgba(27,112,64,' + (0.12 + 0.4 * t).toFixed(2) + ')' : t < -0.2 ? 'rgba(192,50,31,' + (0.12 - 0.4 * t).toFixed(2) + ')' : '#f3f3ef';
        return '<td class="num" style="background:' + bg + '">' + d.pos + ' / ' + d.neg + '</td>';
      }).join('') + '</tr>';
    }).join('');
    return '<h2 class="h2b">How the description of ' + esc(brand) + ' changes, run by run</h2><p class="hint" style="margin:0 0 12px">Each cell: answers describing ' + esc(brand) +
      ' favourably / unfavourably on that point. Green leans favourable, red unfavourable.</p><div class="tblwrap"><table class="tbl">' + head + body + '</table></div>';
  }

  // The tracker's mention-rate-over-time chart (tracker page and the print/PDF layout). `when` formats a run date.
  function trendChart(d, when) {
    const runs = d.runs, W = 900, H = 320, L = 46, R = 20, T = 16, B = 40;
    const colours = colourMap(d.brands), n = runs.length;
    const x = i => n === 1 ? (L + W - R) / 2 : L + (W - L - R) * i / (n - 1);
    const y = v => T + (H - T - B) * (1 - v);
    let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Mention rate over time">';
    [0, .25, .5, .75, 1].forEach(v => { svg += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + Math.round(v * 100) + '%</text>'; });
    svg += '<line class="axis" x1="' + L + '" x2="' + L + '" y1="' + T + '" y2="' + (H - B) + '"/><line class="axis" x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B) + '" y2="' + (H - B) + '"/>';
    runs.forEach((r, i) => { svg += '<text x="' + x(i) + '" y="' + (H - 14) + '" text-anchor="middle">' + when(r.created_at) + '</text>'; });
  // Your brand's likely range (95%) as a shaded band behind the lines, where runs carry one.
    const main = d.brands[0];
    const band = runs.map((r, i) => { const s = r.by_brand[main.name]; return s && s.low != null ? [x(i), y(s.low), y(s.high)] : null; }).filter(Boolean);
    if (band.length > 1) svg += '<polygon points="' + band.map(p => p[0] + ',' + p[2]).concat(band.slice().reverse().map(p => p[0] + ',' + p[1])).join(' ') + '" fill="' + colours[main.name].bg + '" fill-opacity="0.16"/>';
    else if (band.length === 1) svg += '<line x1="' + band[0][0] + '" x2="' + band[0][0] + '" y1="' + band[0][1] + '" y2="' + band[0][2] + '" stroke="' + colours[main.name].bg + '" stroke-opacity="0.35" stroke-width="14"/>';
  // your brand drawn last so it sits on top
    const order = d.brands.slice(1).concat(d.brands.slice(0, 1));
    order.forEach(b => {
      const pts = runs.map((r, i) => { const s = r.by_brand[b.name]; return s && s.rate != null ? [x(i), y(s.rate), s, r] : null; }).filter(Boolean);
      if (!pts.length) return;
      const c = colours[b.name].bg;
      if (pts.length > 1) svg += '<polyline class="ln" style="stroke:' + c + '" points="' + pts.map(p => p[0] + ',' + p[1]).join(' ') + '"/>';
      pts.forEach(p => { svg += '<circle class="pt" cx="' + p[0] + '" cy="' + p[1] + '" r="7" fill="' + c + '"><title>' + esc(b.name) + ' · ' + when(p[3].created_at) + ' · ' + Math.round(p[2].rate * 100) + '% (' + p[2].mentioned + ' of ' + p[2].answered + ' answers' + (S.range(p[2]) ? ', likely ' + S.range(p[2]) : '') + ')</title></circle>'; });
    });
    return '<div class="chart">' + svg + '</svg></div>';
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

  // "Download PDF": the Worker prints the print layout (tools/state-of-the-llm-union/print/) in a hosted browser and returns
  // the file. `which` = { id } for a report or { watch } for a tracker, plus summary: true for the ~2-page summary.
  function downloadPdf(which, btn, filename) {
    var label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Making PDF… (up to a minute)';
    return fetch(API + '/state-of-union/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ code: CODE }, which)) })
      .then(function (r) {
        if ((r.headers.get('Content-Type') || '').indexOf('application/pdf') === -1) return r.json().then(function (d) { throw new Error(d.error || 'The PDF could not be made.'); });
        return r.blob();
      })
      .then(function (blob) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = filename || 'state-of-the-llm-union.pdf';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      })
      .catch(function (e) { alert(e.message); })
      .then(function () { btn.disabled = false; btn.textContent = label; });
  }
  function printUrl(which) {
    return withPreset('/tools/state-of-the-llm-union/print/?k=' + encodeURIComponent(CODE) + (which.watch ? '&w=' + encodeURIComponent(which.watch) : '&id=' + encodeURIComponent(which.id)) + (which.summary ? '&mode=summary' : ''));
  }

  function withPreset(href) {
    if (!PRESET) return href;
    return href + (href.indexOf('?') === -1 ? '?' : '&') + 'preset=' + encodeURIComponent(PRESET);
  }

  window.SOTU = {
    API: API, CODE: CODE, PRESET: PRESET, MARKETS: MARKETS, market: market, PALETTE: PALETTE, colourMap: colourMap,
    esc: esc, highlight: highlight, api: api, answered: answered, rate: rate, avgPosition: avgPosition,
    pct: pct, range: range, money: money, factsHtml: factsHtml, discoveredHtml: discoveredHtml, describeHtml: describeHtml, describeTrendHtml: describeTrendHtml, trendChart: trendChart, downloadPdf: downloadPdf, printUrl: printUrl, providerLabel: providerLabel, fmtDate: fmtDate, ago: ago, badgeFor: badgeFor, withPreset: withPreset
  };
})();
