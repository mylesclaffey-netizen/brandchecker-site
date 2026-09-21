/* State Of The Union — shared helpers for the form, report and tracker pages. */
(function () {
  var API = 'https://mc2seo-tools-api.mylesclaffey.workers.dev/api';
  var Q = new URLSearchParams(location.search);
  var CODE = Q.get('k') || (function () { try { return localStorage.getItem('mc2seo_code') || ''; } catch (e) { return ''; } })();
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

  // One colour per tracked brand; the first (your brand) is the accent.
  var PALETTE = [
    { bg: '#ff3d00', fg: '#ffffff' }, { bg: '#c8f169', fg: '#0a0a0a' }, { bg: '#8fd0ff', fg: '#0a0a0a' },
    { bg: '#ffc2ec', fg: '#0a0a0a' }, { bg: '#ffe14d', fg: '#0a0a0a' }, { bg: '#cdb4ff', fg: '#0a0a0a' }
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
    return out + esc(text.slice(at));
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
  function pct(v) { return v == null ? '—' : Math.round(v * 100) + '%'; }
  function money(v) { return '$' + (v < 0.1 ? v.toFixed(3) : v.toFixed(2)); }
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
  function withPreset(href) {
    if (!PRESET) return href;
    return href + (href.indexOf('?') === -1 ? '?' : '&') + 'preset=' + encodeURIComponent(PRESET);
  }

  window.SOTU = {
    API: API, CODE: CODE, PRESET: PRESET, MARKETS: MARKETS, market: market, PALETTE: PALETTE, colourMap: colourMap,
    esc: esc, highlight: highlight, api: api, answered: answered, rate: rate, avgPosition: avgPosition,
    pct: pct, money: money, ago: ago, badgeFor: badgeFor, withPreset: withPreset
  };
})();
