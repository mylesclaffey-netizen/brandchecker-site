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
  var PROVIDER_LABELS = { chatgpt: 'ChatGPT', chatgpt_app: 'ChatGPT app', gemini_app: 'Gemini app', ai_mode: 'AI Mode', claude: 'Claude', perplexity: 'Perplexity', llama: 'Llama',
    mistral: 'Mistral', ai_overviews: 'AI Overviews', gemini: 'Gemini', copilot: 'Copilot' };
  function providerLabel(id) { return PROVIDER_LABELS[id] || id; }

  // "Who AI recommends" (Worker: sotuStats.js recommendStats) — being named isn't being recommended. `opts.compact`: the
  // summary PDF's version (no per-model table); `opts.named`: brand → named rate, when there are no cells (trackers).
  function recommendHtml(rec, d, colours, opts) {
    opts = opts || {};
    if (!rec || !d.brands.length) return '';
    var main = d.brands[0].name, list = answered(d.cells), m = rec.by_brand[main] || {}, lead = rec.top_picks[0];
    var h = '<h2 class="h2b">Who AI recommends</h2><p style="margin:0 0 10px">' + esc(main) + ' is the <b>top pick in ' + pct(m.top_rate) + '</b> of answers' + (m.top_low != null ? ' (likely ' + Math.round(m.top_low * 100) + '–' + Math.round(m.top_high * 100) + '%)' : '') +
      ' and recommended in ' + pct(m.rec_rate) + '.' + (lead ? ' Most common top pick: <b>' + esc(lead.name) + '</b> (' + lead.answers + ' answer' + (lead.answers === 1 ? '' : 's') + ').' : '') + '</p>';
    h += '<div class="tblwrap"><table class="tbl"><tr><th>Brand</th><th>Named</th><th>Recommended</th><th>Top pick</th><th>Cautioned</th></tr>' + d.brands.map(function (b, i) {
      var x = rec.by_brand[b.name] || {}, heatC = function (v) { return v == null ? '#f3f3ef' : 'rgba(255,61,0,' + (0.08 + 0.72 * v).toFixed(2) + ')'; };
      return '<tr><td><span class="dot" style="--bg:' + ((colours[b.name] || PALETTE[0]).bg) + '"></span><b>' + esc(b.name) + '</b>' + (i === 0 ? ' <small>(you)</small>' : '') + '</td><td class="num">' + pct(opts.named ? opts.named[b.name] : rate(list, b.name)) + '</td>' +
        '<td class="heat" style="background:' + heatC(x.rec_rate) + '">' + pct(x.rec_rate) + '</td><td class="heat" style="background:' + heatC(x.top_rate) + '"><b>' + pct(x.top_rate) + '</b></td><td class="num">' + (x.caution ? pct(x.caution_rate) : '—') + '</td></tr>';
    }).join('') + '</table></div>';
    var others = rec.top_picks.filter(function (t) { return !t.tracked; }).slice(0, 6);
    if (!opts.compact) {
      var provs = Object.keys(rec.by_provider);
      h += '<div class="tblwrap"><table class="tbl"><tr><th>Model</th><th>Most common top pick</th><th>Answers read</th></tr>' + provs.map(function (p) {
        var v = rec.by_provider[p];
        return '<tr><td><b>' + esc(providerLabel(p)) + '</b></td><td>' + (v.leader ? (v.leader === main ? '<b>' + esc(v.leader) + '</b>' : esc(v.leader)) + ' <small>(' + v.leader_answers + ' of ' + v.answers + ')</small>' : '<span class="hint">no single pick</span>') + '</td><td class="num">' + v.answers + '</td></tr>';
      }).join('') + '</table></div>';
    }
    return h + '<p class="hint" style="margin:-18px 0 30px">Each answer was read for how it positions every product it names: its single top pick, recommended, only listed or named as something to connect to, or named with a warning. ' +
      (others.length ? 'Top picks you don’t track: ' + others.map(function (t) { return esc(t.name) + ' (' + t.answers + ')'; }).join(' · ') + '. ' : '') +
      (rec.none ? rec.none + ' answer' + (rec.none === 1 ? '' : 's') + ' made no single pick. ' : '') + 'Read from ' + rec.answers + ' of ' + rec.of + ' answers.</p>';
  }

  // "Pages AI cites — who they mention" (Worker: sotuCitedPages.js): the outreach list. Pages that name competitors but
  // not you first. `opts.max`: rows (the PDFs show fewer); `opts.refresh`: add the "check again" link (owner only).
  function citedHtml(c, d, colours, opts) {
    opts = opts || {};
    if (!c || !c.pages || !c.pages.length || !d.brands.length) return '';
    var main = d.brands[0].name, read = c.pages.filter(function (p) { return p.checked; });
    var gap = read.filter(function (p) { return p.missing_you && p.named.length; }), none = read.filter(function (p) { return !p.named.length; });
    var order = gap.concat(read.filter(function (p) { return !p.missing_you; })).concat(none);
    var chips = function (p) {
      return d.brands.map(function (b) {
        var on = p.named.indexOf(b.name) !== -1, col = colours[b.name] || PALETTE[0];
        return '<span class="chip2" style="--bg:' + (on ? col.bg : '#f3f3ef') + ';--fg:' + (on ? col.fg : '#8a8a8a') + ';' + (on ? '' : 'text-decoration:line-through;') + 'font-size:11.5px;padding:2px 7px">' + esc(b.name) + '</span>';
      }).join(' ');
    };
    var h = '<h2 class="h2b">Pages AI cites — who they mention</h2><p style="margin:0 0 10px">Of the ' + read.length + ' third-party pages we could read, <b>' + gap.length + ' name a competitor but not ' + esc(main) + '</b>' +
      (none.length ? ' and ' + none.length + ' name none of the tracked brands' : '') + '. Those are the pages to get onto: AI answers already trust them.</p>';
    h += '<div class="tblwrap"><table class="tbl"><tr><th>Page AI cites</th><th>Cited in</th><th>Brands the page names</th></tr>' + order.slice(0, opts.max || 25).map(function (p) {
      return '<tr' + (p.missing_you && p.named.length ? ' style="box-shadow:inset 5px 0 0 #ff3d00"' : '') + '><td><a href="' + esc(p.url) + '" target="_blank" rel="noopener">' + esc(p.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 70)) + '</a>' +
        (p.title ? '<br><small>' + esc(p.title.slice(0, 90)) + '</small>' : '') + '</td><td class="num">' + p.answers + '</td><td>' + chips(p) + '</td></tr>';
    }).join('') + '</table></div>';
    var skipped = c.pages.filter(function (p) { return !p.checked; });
    return h + '<p class="hint" style="margin:-18px 0 30px">Each page was loaded and read for the tracked brands (a link to a brand’s website counts). ' +
      (skipped.length ? 'Not checked: ' + skipped.map(function (p) { return esc(p.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]) + ' (' + esc(p.video ? 'video' : p.blocked ? 'blocks automated reads' : p.error) + ')'; }).join(' · ') + '. ' : '') +
      'Checked ' + ago(c.checked_at) + (opts.refresh ? ' · <a href="#" id="citedRefresh">check again</a>' : '') + '.</p>';
  }

  // Agency branding for exports (Worker: branding.js) — the access code's name, logo, accent and white-label choice.
  // Fetched once per page; `refresh` re-reads it after a save.
  var brandingP = null;
  function branding(refresh) {
    if (!brandingP || refresh) brandingP = api('/branding/get').then(function (r) { return r && !r.error ? r : {}; }).catch(function () { return {}; });
    return brandingP;
  }
  // Any image the browser can open (PNG, JPEG, SVG, WebP…) → a PNG of at most 600×200, proportions kept: { data, w, h }.
  // Only this PNG is sent, so the Worker never stores or serves anything but a plain bitmap.
  function logoFromFile(file) {
    return new Promise(function (resolve, reject) {
      var rd = new FileReader();
      rd.onerror = function () { reject(new Error('That file could not be read.')); };
      rd.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('That file isn’t an image this browser can open.')); };
        img.onload = function () {
          var w = img.naturalWidth || 600, h = img.naturalHeight || 200, k = Math.min(1, 600 / w, 200 / h);
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve({ data: c.toDataURL('image/png'), w: c.width, h: c.height });
        };
        img.src = rd.result;
      };
      rd.readAsDataURL(file);
    });
  }
  // The "Your logo on PDFs and slides" panel, filled into `el` (report and tracker pages).
  function brandingPanel(el) {
    var pending = null;   // a new logo chosen but not saved yet; '' = remove
    function paint(br) {
      br = br || {};
      el.innerHTML =
        '<p class="hint" style="margin:0 0 12px">Shown on the PDFs and slide decks made with this access link — including the summary PDF attached to tracker alert emails.</p>' +
        '<div class="brgrid"><div><label for="brName">Agency name</label><input id="brName" type="text" maxlength="80" placeholder="e.g. Northwind Digital" value="' + esc(br.name || '') + '"></div>' +
        '<div><label for="brLogo">Logo</label><input id="brLogo" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"><div id="brPrev" class="brprev">' +
        (br.logo ? '<img src="' + esc(br.logo) + '" alt="Current logo"> <a href="#" id="brRemove">Remove</a>' : '<span class="hint">No logo yet</span>') + '</div></div></div>' +
        '<div class="brgrid"><div><label for="brAcc">Accent colour</label><div style="display:flex;gap:10px;align-items:center"><input id="brAcc" type="color" value="' + esc(br.accent || '#1e3cff') + '" style="width:56px;height:38px;padding:2px">' +
        '<label style="font-weight:500;display:flex;gap:6px;align-items:center"><input id="brAccOn" type="checkbox"' + (br.accent ? ' checked' : '') + '> Use it instead of ours</label></div></div>' +
        '<div><label class="brwl"><input id="brWhite" type="checkbox"' + (br.white_label ? ' checked' : '') + '><span><b>White label</b><br>Leave “State Of The LLM Union · ' + esc(location.hostname.replace(/^www\./, '')) + '” off the exports.</span></label></div></div>' +
        '<p style="margin:14px 0 0"><button class="btn2 small solid" id="brSave" type="button">Save branding</button> ' + (br.name || br.logo || br.accent ? '<button class="btn2 small" id="brClear" type="button">Remove all</button> ' : '') + '<span class="hint" id="brMsg"></span></p>';
      var q = function (id) { return el.querySelector('#' + id); };
      q('brLogo').onchange = function () {
        var f = this.files && this.files[0];
        if (!f) return;
        logoFromFile(f).then(function (l) { pending = l; q('brPrev').innerHTML = '<img src="' + l.data + '" alt="New logo"> <span class="hint">new — save to keep it</span>'; })
          .catch(function (e) { q('brMsg').textContent = e.message; });
      };
      var rm = q('brRemove'); if (rm) rm.onclick = function (e) { e.preventDefault(); pending = ''; q('brPrev').innerHTML = '<span class="hint">Logo will be removed when you save</span>'; };
      q('brSave').onclick = function () {
        var body = { name: q('brName').value.trim(), accent: q('brAccOn').checked ? q('brAcc').value : '', white_label: q('brWhite').checked };
        if (pending === '') body.logo = '';
        else if (pending) { body.logo = pending.data; body.logo_w = pending.w; body.logo_h = pending.h; }
        q('brSave').disabled = true; q('brMsg').textContent = 'Saving…';
        api('/branding/set', body).then(function (r) {
          if (r.error) { q('brSave').disabled = false; q('brMsg').textContent = r.error; return; }
          pending = null; branding(true); paint(r);
          el.querySelector('#brMsg').textContent = 'Saved — your next PDF or slide deck will use it.';
        });
      };
      var cl = q('brClear'); if (cl) cl.onclick = function () {
        api('/branding/set', { clear: true }).then(function () { pending = null; branding(true); paint({}); el.querySelector('#brMsg').textContent = 'Branding removed.'; });
      };
    }
    el.innerHTML = '<p class="hint">Loading…</p>';
    branding().then(paint);
  }

  // "Share a read-only link" (Worker: share.js) for one report or tracker, filled into `el`: the link opens it without
  // the access code, and can't run or spend anything.
  function sharePanel(el, kind, id) {
    var what = kind === 'tracker' ? 'tracker' : 'report';
    function paint(r) {
      el.innerHTML = r && r.token
        ? '<p class="hint" style="margin:0 0 8px">Anyone with this link can view this ' + what + ' — read-only, without your access code. It can’t start runs or spend anything.</p>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input id="shUrl" type="text" readonly value="' + esc(r.url) + '" style="flex:1;min-width:240px;padding:8px 10px;font-size:14px">' +
          '<button class="btn2 small solid" id="shCopy" type="button">Copy link</button> <button class="btn2 small" id="shOff" type="button">Stop sharing</button></div>'
        : '<p class="hint" style="margin:0 0 8px">Make a link that opens this ' + what + ' read-only, without your access code — for clients and colleagues. It can’t start runs or spend anything, and you can turn it off at any time.</p>' +
          '<button class="btn2 small solid" id="shOn" type="button">Create share link</button>';
      var q = function (x) { return el.querySelector('#' + x); };
      if (q('shOn')) q('shOn').onclick = function () { this.disabled = true; api('/state-of-union/share/create', { kind: kind, id: id }).then(paint); };
      if (q('shCopy')) q('shCopy').onclick = function () {
        var b = this; q('shUrl').select();
        (navigator.clipboard ? navigator.clipboard.writeText(q('shUrl').value) : Promise.reject()).then(function () { b.textContent = 'Copied'; }).catch(function () { document.execCommand('copy'); b.textContent = 'Copied'; });
      };
      if (q('shOff')) q('shOff').onclick = function () { this.disabled = true; api('/state-of-union/share/revoke', { kind: kind, id: id }).then(function () { paint(null); }); };
    }
    el.innerHTML = '<p class="hint">Loading…</p>';
    api('/state-of-union/share/status', { kind: kind, id: id }).then(paint);
  }
  // The agency header on a shared page: logo and "Prepared by", when the owner set branding.
  function sharedHeader(br) {
    if (!br || (!br.logo && !br.name)) return '';
    return '<div class="agencybar">' + (br.logo ? '<img src="' + esc(br.logo) + '" alt="' + esc(br.name || '') + '">' : '<span></span>') + (br.name ? '<span>Prepared by <b>' + esc(br.name) + '</b></span>' : '') + '</div>';
  }

  // Demand weighting (Worker: promptDemand.js). `basis` is 'ai' (AI searches) or 'google'. A prompt × market's weight is its
  // monthly searches on that basis, 0 when unknown.
  function demandWeight(demand, basis, p, m) {
    var e = demand && demand.prompts ? demand.prompts.filter(function (x) { return x.prompt === p; })[0] : null, v = e && e.by_market[m];
    return v ? (basis === 'ai' ? v.ai : v.google) || 0 : 0;
  }
  // Searches a month where the main brand isn't named: Σ over markets of weight × (1 − rate).
  function demandMissed(d, demand, basis, p) {
    var main = d.brands[0], list = answered(d.cells);
    return d.locations.reduce(function (t, m) {
      var r = rate(list.filter(function (c) { return c.prompt === p && c.location === m; }), main.name);
      return t + (r == null ? 0 : demandWeight(demand, basis, p, m) * (1 - r));
    }, 0);
  }
  // AI searches unless none of the prompts has an AI estimate, then Google.
  function demandBasisFor(d, demand) {
    var ai = d.prompts.reduce(function (t, p) { return t + d.locations.reduce(function (u, m) { return u + demandWeight(demand, 'ai', p, m); }, 0); }, 0);
    return ai ? 'ai' : 'google';
  }
  // The weighted-share table and the prompts-by-searches-at-stake table. opts.editable: keyword inputs (the report);
  // opts.compact: the top 3 prompts and a short note (the summary PDF).
  function demandHtml(d, demand, basis, colours, opts) {
    opts = opts || {};
    var main = d.brands[0], list = answered(d.cells);
    var n = function (v) { return v == null ? '—' : Number(v).toLocaleString(); };
    var total = d.prompts.reduce(function (t, p) { return t + d.locations.reduce(function (u, m) { return u + demandWeight(demand, basis, p, m); }, 0); }, 0);
    if (!total) return '<p class="hint">None of these questions has ' + (basis === 'ai' ? 'an AI' : 'a Google') + ' search estimate' + (opts.editable ? ' — try the other basis, or correct the search keywords below' : '') + '.</p>';
    var weighted = function (b) {
      var num = 0, den = 0;
      d.prompts.forEach(function (p) { d.locations.forEach(function (m) {
        var r = rate(list.filter(function (c) { return c.prompt === p && c.location === m; }), b.name), w = demandWeight(demand, basis, p, m);
        if (r != null && w) { num += w * r; den += w; }
      }); });
      return den ? num / den : null;
    };
    var h = '<div class="tblwrap"><table class="tbl"><tr><th>Brand</th><th>Share of answers</th><th>Weighted by ' + (basis === 'ai' ? 'AI' : 'Google') + ' searches</th><th>Difference</th></tr>' + d.brands.map(function (b) {
      var u = rate(list, b.name), w = weighted(b), df = u != null && w != null ? w - u : null;
      return '<tr><td><span class="dot" style="--bg:' + (colours[b.name] || PALETTE[0]).bg + '"></span><b>' + esc(b.name) + '</b>' + (b === main ? ' <small>(you)</small>' : '') + '</td><td class="num">' + pct(u) + '</td><td class="num"><b>' + pct(w) + '</b></td><td class="num">' +
        (df == null || Math.abs(df) < 0.005 ? '—' : (df > 0 ? '▲' : '▼') + Math.round(Math.abs(df) * 100) + ' pts') + '</td></tr>';
    }).join('') + '</table></div>';
    var rows = demand.prompts.map(function (e) {
      var sum = function (k) { return d.locations.reduce(function (t, m) { var v = e.by_market[m]; return v && v[k] != null ? (t || 0) + v[k] : t; }, null); };
      return { e: e, ai: sum('ai'), g: sum('google'), r: rate(list.filter(function (c) { return c.prompt === e.prompt; }), main.name), missed: demandMissed(d, demand, basis, e.prompt) };
    }).sort(function (a, b) { return b.missed - a.missed; });
    if (opts.compact) rows = rows.slice(0, 3);
    h += '<div class="tblwrap"><table class="tbl"><tr><th>Prompt</th><th>Search keyword</th><th>AI searches / mo</th><th>Google searches / mo</th><th>' + esc(main.name) + ' named</th><th>Searches you miss / mo</th></tr>' + rows.map(function (r) {
      var i = d.prompts.indexOf(r.e.prompt);
      var kw = opts.editable
        ? '<input data-kw="' + i + '" value="' + esc(r.e.keyword) + '" style="width:170px;padding:4px 6px;font-size:13px"> <button class="btn2 small" data-kwsave="' + i + '" type="button">Save</button>' + (r.e.edited ? '<br><small>edited</small>' : '')
        : esc(r.e.keyword) + (r.e.edited ? ' <small>(edited)</small>' : '');
      return '<tr><td>' + esc(r.e.prompt) + '</td><td' + (opts.editable ? ' style="white-space:nowrap"' : '') + '>' + kw + '</td><td class="num">' + n(r.ai) + '</td><td class="num">' + n(r.g) + '</td><td class="num">' + pct(r.r) + '</td><td class="num"><b>' + (r.missed ? Math.round(r.missed).toLocaleString() : '0') + '</b></td></tr>';
    }).join('') + '</table></div>';
    var note = opts.compact
      ? 'Top ' + rows.length + ' of ' + demand.prompts.length + ' prompts by searches at stake. Weighted by ' + (basis === 'ai' ? 'AI searches (DataForSEO’s estimate of monthly use in AI tools)' : 'Google searches') + '; “searches you miss” = searches × the share of answers that don’t name ' + esc(main.name) + '.'
      : 'Each prompt is matched to the short keyword people search for the same need' + (opts.editable ? ' (edit it if it’s wrong — trackers keep your edits)' : '') + '. AI searches: DataForSEO’s estimate of monthly use in AI tools, based on Google’s People Also Ask data. Google searches: monthly Google volume. ' +
        (opts.editable ? '' : 'Weighted here by ' + (basis === 'ai' ? 'AI' : 'Google') + ' searches. ') + (d.locations.length > 1 ? 'Summed across this run’s markets. ' : '') + '“Searches you miss” = searches × the share of answers that don’t name ' + esc(main.name) + ' — the value at stake.' + (demand.note ? ' ' + esc(demand.note) + '.' : '');
    return h + '<p class="hint" style="margin:-18px 0 30px">' + note + '</p>';
  }

  // Persona variants (Worker: sotuStats.js personaStats): each brand's rate per buyer, against the plain question.
  function personaName(v) { return v == null ? 'Plain question' : v.charAt(0).toUpperCase() + v.slice(1); }
  function personasHtml(d, colours) {
    var bp = (d.summary || {}).by_persona;
    if (!bp || bp.length < 2 || !d.brands.length) return '';
    var base = bp.filter(function (v) { return v.persona == null; })[0];
    var head = '<tr><th>Brand</th>' + bp.map(function (v) { return '<th>' + esc(personaName(v.persona)) + '<br><small style="font-weight:400">' + v.answers + ' answers</small></th>'; }).join('') + '</tr>';
    var rows = d.brands.map(function (b, bi) {
      return '<tr><td><span class="dot" style="--bg:' + (colours[b.name] || PALETTE[0]).bg + '"></span><b>' + esc(b.name) + '</b>' + (bi === 0 ? ' <small>(you)</small>' : '') + '</td>' + bp.map(function (v) {
        var x = v.by_brand[b.name] || {}, r = x.rate, bg = r == null ? '#f3f3ef' : 'rgba(255,61,0,' + (0.08 + 0.72 * r).toFixed(2) + ')';
        var b0 = base && v !== base ? (base.by_brand[b.name] || {}).rate : null;
        var delta = b0 != null && r != null && Math.abs(r - b0) >= 0.05 ? ' <small>' + (r > b0 ? '▲' : '▼') + Math.round(Math.abs(r - b0) * 100) + '</small>' : '';
        return '<td class="heat" style="background:' + bg + '">' + pct(r) + delta + '<br><small>' + (x.low != null ? Math.round(x.low * 100) + '–' + Math.round(x.high * 100) + '%' : '') + (x.first ? ' · first ' + pct(x.first_rate) : '') + '</small></td>';
      }).join('') + '</tr>';
    }).join('');
    // The buyers where the main brand does best and worst, for a one-line takeaway.
    var main = d.brands[0].name, ps = bp.filter(function (v) { return v.persona != null && (v.by_brand[main] || {}).rate != null; }), take = '';
    if (ps.length > 1) {
      var sorted = ps.slice().sort(function (a, b) { return b.by_brand[main].rate - a.by_brand[main].rate; }), hi = sorted[0], lo = sorted[sorted.length - 1];
      if (hi.by_brand[main].rate > lo.by_brand[main].rate) take = '<p style="margin:0 0 10px">' + esc(main) + ' is named most for <b>' + esc(hi.persona) + '</b> (' + pct(hi.by_brand[main].rate) + ') and least for <b>' + esc(lo.persona) + '</b> (' + pct(lo.by_brand[main].rate) + ').</p>';
    }
    return '<h2 class="h2b">Which buyers name you</h2>' + take + '<div class="tblwrap"><table class="tbl">' + head + rows + '</table></div>' +
      '<p class="hint" style="margin:-18px 0 30px">The same prompts asked as each buyer (“I’m … . What’s the best…?”). Share of answers naming each brand, its likely range, and how often it’s named first. ▲▼ = points above or below the plain question.</p>';
  }

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
    pct: pct, range: range, personaName: personaName, personasHtml: personasHtml, branding: branding, brandingPanel: brandingPanel, recommendHtml: recommendHtml, citedHtml: citedHtml, sharePanel: sharePanel, sharedHeader: sharedHeader, demandWeight: demandWeight, demandMissed: demandMissed, demandBasisFor: demandBasisFor, demandHtml: demandHtml, money: money, factsHtml: factsHtml, discoveredHtml: discoveredHtml, describeHtml: describeHtml, describeTrendHtml: describeTrendHtml, trendChart: trendChart, downloadPdf: downloadPdf, printUrl: printUrl, providerLabel: providerLabel, fmtDate: fmtDate, ago: ago, badgeFor: badgeFor, withPreset: withPreset
  };
})();
