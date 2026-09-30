/* State Of The LLM Union — slide deck export (.pptx), built in the browser from the data the report or tracker page
 * already holds, with PptxGenJS (MIT, self-hosted at /assets/vendor/pptxgen.bundle.js, loaded on first use).
 * Charts are drawn from plain shapes (bars, lines, dots) rather than PowerPoint chart objects — PptxGenJS charts come out
 * blank in Keynote (and Google Slides import) — so they render everywhere; every shape and text box stays editable.
 * Nothing here spends except what the pages would anyway: the demand lookup (cached after the first, ~$0.02) and the
 * crawler check (free). Prompt briefs are included only when already written — the deck never pays for new ones.
 *
 *   SOTU_DECK.report(d, { demand, crawl }, button)   — d is /state-of-union/get's response
 *   SOTU_DECK.tracker(d, { demand, weightedRuns }, button) — d is /state-of-union/trend's response
 */
(function () {
  var S = window.SOTU;
  var ACCENT_DEFAULT = 'FF3D00', ORANGE = ACCENT_DEFAULT, INK = '0A0A0A', MUTED = '5A5A5A', LIGHT = 'F3F3EF', WHITE = 'FFFFFF';
  var SITE = 'brandchecker.eu';
  // The access code's agency branding (Worker: branding.js), set at the start of each export: name, logo, accent, white label.
  var BRAND = {};
  function useBranding(br) { BRAND = br || {}; ORANGE = BRAND.accent ? String(BRAND.accent).replace('#', '').toUpperCase() : ACCENT_DEFAULT; }
  // "Prepared by <agency> · State Of The LLM Union", or just the agency when white-label, or our credit when unbranded.
  function credit() { return BRAND.name ? 'Prepared by ' + BRAND.name + (BRAND.white_label ? '' : ' · State Of The LLM Union') : BRAND.white_label ? '' : 'State Of The LLM Union · ' + SITE; }
  // The logo's size in inches at a given height, capped in width, keeping its proportions.
  function logoSize(h, maxW) { var r = BRAND.logo_w && BRAND.logo_h ? BRAND.logo_w / BRAND.logo_h : 3; var w = Math.min(maxW, h * r); return { w: w, h: w / r }; }
  var HEAD = 'Arial Black', BODY = 'Arial';
  var W = 13.333, X = 0.6, CW = 12.13;   // LAYOUT_WIDE: 13.333 × 7.5 in

  function lib() {
    if (window.PptxGenJS) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = '/assets/vendor/pptxgen.bundle.js';
      s.onload = resolve;
      s.onerror = function () { reject(new Error('The slide library could not be loaded.')); };
      document.head.appendChild(s);
    });
  }

  var hex = function (c) { return String(c || INK).replace('#', '').toUpperCase(); };
  var pct = function (v) { return v == null ? '—' : Math.round(v * 100) + '%'; };
  // Shortened at a word boundary where there is one near the limit.
  var clip = function (s, n) {
    s = String(s == null ? '' : s).replace(/\*\*|__/g, '').replace(/\s+/g, ' ').trim();
    if (s.length <= n) return s;
    var cut = s.slice(0, n - 1), sp = cut.lastIndexOf(' ');
    return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.—-]+$/, '') + '…';
  };
  // The report's heat scale (rgba(255,61,0, 0.08 + 0.72·rate) on white), flattened to a solid colour for PowerPoint.
  function heat(v) {
    if (v == null) return LIGHT;
    var a = 0.08 + 0.72 * v, ch = function (c) { return ('0' + Math.round(255 - (255 - c) * a).toString(16)).slice(-2); };
    return (ch(255) + ch(61) + ch(0)).toUpperCase();
  }
  function day(iso) { return iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''; }
  function slug(s) { return String(s || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  function Deck(title, date) {
    this.p = new window.PptxGenJS();
    this.p.layout = 'LAYOUT_WIDE';
    this.p.title = title; this.p.company = BRAND.name || SITE; this.p.subject = 'State Of The LLM Union';
    this.date = date; this.n = 0;
  }
  // A content slide: orange rule, kicker, title, footer with page number.
  Deck.prototype.slide = function (kicker, title) {
    var s = this.p.addSlide();
    this.n++;
    s.background = { color: WHITE };
    s.addShape(this.p.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.12, fill: { color: ORANGE }, line: { color: ORANGE } });
    if (kicker) s.addText(kicker.toUpperCase(), { x: X, y: 0.32, w: CW, h: 0.34, fontFace: BODY, fontSize: 11, bold: true, color: ORANGE, charSpacing: 2, margin: 0 });
    var lw = 0;
    if (BRAND.logo) { var ls = logoSize(0.46, 1.9); lw = ls.w + 0.3; s.addImage({ data: BRAND.logo, x: W - 0.6 - ls.w, y: 0.3, w: ls.w, h: ls.h }); }
    if (title) s.addText(title, { x: X, y: 0.66, w: CW - lw, h: 0.95, fontFace: HEAD, fontSize: 24, color: INK, valign: 'top', margin: 0, fit: 'shrink' });
    s.addText([credit(), this.date].filter(Boolean).join(' · '), { x: X, y: 7.05, w: 9, h: 0.28, fontFace: BODY, fontSize: 9, color: MUTED, margin: 0 });
    s.addText(String(this.n), { x: W - 1.2, y: 7.05, w: 0.6, h: 0.28, fontFace: BODY, fontSize: 9, color: MUTED, align: 'right', margin: 0 });
    return s;
  };
  Deck.prototype.cover = function (kicker, title, lines) {
    var s = this.p.addSlide();
    this.n++;
    s.background = { color: INK };
    s.addShape(this.p.ShapeType.rect, { x: 0, y: 0, w: 0.35, h: 7.5, fill: { color: ORANGE }, line: { color: ORANGE } });
    // The agency's logo on a white card (logos are made for light backgrounds).
    if (BRAND.logo) {
      var ls = logoSize(0.7, 3.4);
      s.addShape(this.p.ShapeType.rect, { x: 1, y: 0.4, w: ls.w + 0.4, h: ls.h + 0.3, fill: { color: WHITE }, line: { color: WHITE } });
      s.addImage({ data: BRAND.logo, x: 1.2, y: 0.55, w: ls.w, h: ls.h });
    }
    if (BRAND.white_label) kicker = kicker.replace('State Of The LLM Union tracker', 'AI visibility tracker').replace('State Of The LLM Union', 'AI visibility report');
    s.addText(kicker.toUpperCase(), { x: 1, y: 1.6, w: 11, h: 0.4, fontFace: BODY, fontSize: 14, bold: true, color: ORANGE, charSpacing: 3, margin: 0 });
    s.addText(title, { x: 1, y: 2.1, w: 11.3, h: 2.2, fontFace: HEAD, fontSize: 44, color: WHITE, valign: 'top', margin: 0, fit: 'shrink' });
    s.addText(lines.map(function (l) { return { text: l, options: { breakLine: true } }; }), { x: 1, y: 4.6, w: 11.3, h: 1.8, fontFace: BODY, fontSize: 16, color: 'D9D9D9', valign: 'top', margin: 0, paraSpaceAfter: 6 });
    s.addText(BRAND.name ? 'Prepared by ' + BRAND.name : BRAND.white_label ? '' : SITE, { x: 1, y: 6.7, w: 8, h: 0.3, fontFace: BODY, fontSize: 11, color: MUTED, margin: 0 });
    return s;
  };
  // A table: header row in ink, cells as strings or { text, options }. Rows beyond `max` are dropped (noted in the caller).
  Deck.prototype.table = function (s, head, rows, o) {
    o = o || {};
    var cell = function (c) { return c !== null && typeof c === 'object' ? c : { text: c == null ? '—' : String(c) }; };
    var all = [head.map(function (h) { return { text: h, options: { bold: true, color: WHITE, fill: { color: INK }, fontSize: o.hfs || 10 } }; })].concat(rows.slice(0, o.max || 12).map(function (r) { return r.map(cell); }));
    s.addTable(all, { x: o.x || X, y: o.y || 1.75, w: o.w || CW, colW: o.colW, fontFace: BODY, fontSize: o.fs || 11, color: INK, border: { type: 'solid', pt: 0.75, color: INK }, valign: 'middle', margin: 0.06, autoPage: false });
  };
  // Headline number boxes in a row.
  Deck.prototype.stats = function (s, items, y) {
    var n = items.length, gap = 0.25, bw = (CW - gap * (n - 1)) / n;
    items.forEach(function (it, i) {
      var x = X + i * (bw + gap), accent = i === 0;
      s.addShape(this.p.ShapeType.rect, { x: x, y: y, w: bw, h: 1.9, fill: { color: accent ? ORANGE : WHITE }, line: { color: INK, width: 2 } });
      s.addText(it.lbl.toUpperCase(), { x: x + 0.18, y: y + 0.15, w: bw - 0.36, h: 0.3, fontFace: BODY, fontSize: 9, bold: true, color: accent ? WHITE : MUTED, charSpacing: 1, margin: 0 });
      s.addText(it.val, { x: x + 0.18, y: y + 0.48, w: bw - 0.36, h: 0.75, fontFace: HEAD, fontSize: 30, color: accent ? WHITE : INK, margin: 0, fit: 'shrink' });
      s.addText(it.sub || '', { x: x + 0.18, y: y + 1.25, w: bw - 0.36, h: 0.55, fontFace: BODY, fontSize: 10, color: accent ? WHITE : MUTED, valign: 'top', margin: 0, fit: 'shrink' });
    }, this);
  };
  Deck.prototype.note = function (s, text, y, h) {
    s.addText(text, { x: X, y: y, w: CW, h: h || 0.5, fontFace: BODY, fontSize: 10, color: MUTED, valign: 'top', margin: 0, fit: 'shrink' });
  };
  Deck.prototype.bullets = function (s, items, o) {
    o = o || {};
    s.addText(items.map(function (t) { return { text: t, options: { bullet: { indent: 14 }, breakLine: true } }; }), { x: o.x || X, y: o.y || 1.8, w: o.w || CW, h: o.h || 4.8, fontFace: BODY, fontSize: o.fs || 14, color: INK, valign: 'top', paraSpaceAfter: 8, margin: 0, fit: 'shrink' });
  };
  // Horizontal bars, one group per row, one bar per series (0–100%), drawn from shapes.
  Deck.prototype.bars = function (s, rows, series, o) {
    o = o || {};
    var y0 = o.y || 1.8, h = o.h || 4.6, lx = X, lw = 2.6, bx = X + lw + 0.1, bw = CW - lw - 0.9;
    var gh = h / rows.length, bh = Math.min(0.42, (gh * 0.72) / series.length), p = this.p;
    [0, 0.25, 0.5, 0.75, 1].forEach(function (v) {
      s.addShape(p.ShapeType.line, { x: bx + bw * v, y: y0, w: 0, h: h, line: { color: 'DDDDDD', width: 0.75 } });
      s.addText(Math.round(v * 100) + (o.suffix == null ? '%' : o.suffix), { x: bx + bw * v - 0.4, y: y0 + h + 0.02, w: 0.8, h: 0.25, fontFace: BODY, fontSize: 9, color: MUTED, align: 'center', margin: 0 });
    });
    rows.forEach(function (r, i) {
      var gy = y0 + gh * i, top = gy + (gh - bh * series.length) / 2;
      s.addText(r, { x: lx, y: gy, w: lw, h: gh, fontFace: BODY, fontSize: 12, bold: i === (o.bold == null ? -1 : o.bold), color: INK, align: 'right', valign: 'middle', margin: 0, fit: 'shrink' });
      series.forEach(function (se, j) {
        var v = se.values[i], y = top + bh * j;
        if (v) s.addShape(p.ShapeType.rect, { x: bx, y: y, w: Math.max(0.02, bw * v), h: bh * 0.9, fill: { color: se.color }, line: { color: se.color, width: 0 } });
        s.addText(v == null ? '—' : Math.round(v * 100) + (o.suffix == null ? '%' : o.suffix), { x: bx + bw * (v || 0) + 0.06, y: y, w: 0.8, h: bh * 0.9, fontFace: BODY, fontSize: 10, bold: true, color: INK, valign: 'middle', margin: 0 });
      });
    });
    if (series.length > 1) this.legend(s, series, y0 + h + 0.35);
  };
  // Lines over time (0–100%), one per series, drawn from line segments and dots.
  Deck.prototype.lines = function (s, labels, series, o) {
    o = o || {};
    var y0 = o.y || 1.8, h = o.h || 4.1, x0 = X + 0.6, w = CW - 0.9, p = this.p, n = labels.length;
    var px = function (i) { return n === 1 ? x0 + w / 2 : x0 + w * i / (n - 1); }, py = function (v) { return y0 + h * (1 - v); };
    [0, 0.25, 0.5, 0.75, 1].forEach(function (v) {
      s.addShape(p.ShapeType.line, { x: x0, y: py(v), w: w, h: 0, line: { color: 'DDDDDD', width: 0.75 } });
      s.addText(Math.round(v * 100) + '%', { x: X - 0.1, y: py(v) - 0.13, w: 0.6, h: 0.26, fontFace: BODY, fontSize: 9, color: MUTED, align: 'right', margin: 0 });
    });
    var step = Math.max(1, Math.ceil(n / 10));
    labels.forEach(function (l, i) { if (i % step === 0 || i === n - 1) s.addText(l, { x: px(i) - 0.6, y: y0 + h + 0.05, w: 1.2, h: 0.25, fontFace: BODY, fontSize: 9, color: MUTED, align: 'center', margin: 0 }); });
    series.forEach(function (se) {
      for (var i = 1; i < n; i++) {
        var a = se.values[i - 1], b = se.values[i];
        if (a == null || b == null) continue;
        var x1 = px(i - 1), x2 = px(i), y1 = py(a), y2 = py(b);
        s.addShape(p.ShapeType.line, { x: x1, y: Math.min(y1, y2), w: x2 - x1, h: Math.abs(y2 - y1), flipV: y2 < y1, line: { color: se.color, width: 3 } });
      }
      se.values.forEach(function (v, i) { if (v != null) s.addShape(p.ShapeType.ellipse, { x: px(i) - 0.07, y: py(v) - 0.07, w: 0.14, h: 0.14, fill: { color: se.color }, line: { color: WHITE, width: 1 } }); });
    });
    this.legend(s, series, y0 + h + 0.4);
  };
  Deck.prototype.legend = function (s, series, y) {
    var x = X, p = this.p;
    series.forEach(function (se) {
      s.addShape(p.ShapeType.rect, { x: x, y: y + 0.06, w: 0.18, h: 0.18, fill: { color: se.color }, line: { color: se.color, width: 0 } });
      var w = Math.min(3, 0.3 + se.name.length * 0.09);
      s.addText(se.name, { x: x + 0.25, y: y, w: w, h: 0.3, fontFace: BODY, fontSize: 10, color: INK, margin: 0, valign: 'middle' });
      x += 0.35 + w;
    });
  };
  Deck.prototype.save = function (name) { return this.p.writeFile({ fileName: name }); };

  function rateIn(list, brand) { return S.rate(list, brand); }
  function firstRate(list, brand) {
    var n = 0, k = 0;
    list.forEach(function (c) { var m = (c.mentions || []).filter(function (x) { return x.name === brand; })[0]; if (m) { k++; if (m.mentioned && m.position === 1) n++; } });
    return k ? n / k : null;
  }
  function label(d, id) { var p = (d.providers || []).filter(function (x) { return x.id === id; })[0]; return p ? p.label : S.providerLabel(id); }

  /* ---- the report deck ------------------------------------------------------------------ */

  function describeSlide(deck, ds, name) {
    if (!ds || !(ds.dims || []).length) return;
    var s = deck.slide('How AI describes ' + name, 'What the answers say about ' + name);
    deck.table(s, ['Dimension', 'Favourable / unfavourable', 'In the answers’ own words'], ds.dims.slice(0, 9).map(function (x) {
      return [x.label, { text: x.pos + ' + / ' + x.neg + ' −', options: { color: x.neg > x.pos ? 'B3261E' : '2F6B2A', bold: true } }, clip((x.phrases || []).slice(0, 3).map(function (p) { return (p.tone === '-' ? '− ' : '+ ') + p.phrase; }).join(' · '), 110)];
    }), { colW: [2.6, 2.3, 7.23], max: 9 });
    if ((ds.best_for || []).length) deck.note(s, 'Who they say ' + name + ' is best for: ' + ds.best_for.slice(0, 3).map(function (b) { return '“' + b.phrase + '”'; }).join(' · ') + '. From ' + ds.answers + ' answers that name ' + name + '; tagged by a small AI model.', 6.35, 0.6);
  }

  async function report(d, extra, btn) {
    extra = extra || {};
    var old = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Building slides…'; }
    try {
      await lib();
      useBranding(await S.branding());
      var main = d.brands[0], list = S.answered(d.cells), sm = d.summary || {}, colours = S.colourMap(d.brands);
      var name = main ? main.name : 'AI answers';
      // Extras the report loads lazily: fetch them if the Brand mentions tab was never opened.
      var demand = extra.demand, crawl = extra.crawl;
      if (main && !demand) demand = await S.api('/state-of-union/demand', { id: d.id }).catch(function () { return null; });
      if (demand && !demand.prompts) demand = null;
      if (main && !crawl) crawl = await S.api('/state-of-union/crawler-access', { id: d.id }).catch(function () { return null; });
      if (crawl && !crawl.pages) crawl = null;
      var cited = extra.cited;
      if (main && !cited) cited = await S.api('/state-of-union/cited-check', { id: d.id }).catch(function () { return null; });
      if (cited && !cited.pages) cited = null;
      var briefs = main ? (await Promise.all(d.prompts.map(function (p) { return S.api('/state-of-union/brief', { id: d.id, prompt: p, cached_only: true }).catch(function () { return null; }); }))).filter(function (b) { return b && b.brief; }) : [];
      var basis = demand ? S.demandBasisFor(d, demand) : null;
      var provs = (d.providers || []).filter(function (p) { return d.cells.some(function (c) { return c.provider === p.id && c.status !== 'unavailable'; }); });

      var deck = new Deck(name + ' in AI answers', day(d.completed_at || d.created_at));
      deck.cover('State Of The LLM Union', main ? name + ' in AI answers' : clip(d.prompts[0], 90), [
        d.prompts.length + ' prompt' + (d.prompts.length === 1 ? '' : 's') + ' · ' + d.locations.join(', ') + ' · ' + provs.map(function (p) { return p.label; }).join(', '),
        (d.repeats > 1 ? 'Each asked ' + d.repeats + ' times · ' : '') + list.length + ' answer' + (list.length === 1 ? '' : 's') + ' · web search ' + (d.web ? 'on' : 'off') + ((d.personas || []).length ? ' · ' + d.personas.length + ' buyer personas' : ''),
        day(d.completed_at || d.created_at)
      ]);

      if (main) {
        // Headline numbers.
        var mb = (sm.by_brand || {})[main.name] || {}, rivals = d.brands.slice(1).map(function (b) { return { b: b, v: rateIn(list, b.name) }; }).filter(function (x) { return x.v != null; }).sort(function (a, b) { return b.v - a.v; });
        var cit = sm.citations, cb = cit && cit.by_brand[main.name];
        var wMain = null;
        if (demand) {
          var num = 0, den = 0;
          d.prompts.forEach(function (p) { d.locations.forEach(function (m) { var r = rateIn(list.filter(function (c) { return c.prompt === p && c.location === m; }), main.name), w = S.demandWeight(demand, basis, p, m); if (r != null && w) { num += w * r; den += w; } }); });
          wMain = den ? num / den : null;
        }
        var s = deck.slide('The headline', name + ' is named in ' + pct(mb.rate) + ' of AI answers' + (rivals[0] ? ' — ' + rivals[0].b.name + ' in ' + pct(rivals[0].v) : ''));
        deck.stats(s, [
          { lbl: 'Share of answers', val: pct(mb.rate), sub: (S.range(mb) ? 'likely ' + S.range(mb) + ' · ' : '') + (mb.mentioned || 0) + ' of ' + (mb.answered || 0) + ' answers' },
          sm.visibility && sm.visibility.by_brand[main.name] ? { lbl: 'Visibility score', val: sm.visibility.by_brand[main.name].score + '/100', sub: 'named, prominence' + (sm.recommend ? ', recommendations' : '') + ' and citations in one number' } : { lbl: 'Named first', val: pct(firstRate(list, main.name)), sub: 'answers where ' + name + ' is the first brand named' },
          rivals[0] ? { lbl: 'Top competitor', val: pct(rivals[0].v), sub: rivals[0].b.name } : null,
          wMain != null ? { lbl: 'Weighted by demand', val: pct(wMain), sub: 'each prompt counted by its ' + (basis === 'ai' ? 'AI' : 'Google') + ' searches' } : null,
          cb && cb.has_domain ? { lbl: 'Cited as a source', val: pct(cb.rate), sub: 'of ' + cit.answers_with_sources + ' answers that show sources' } : null
        ].filter(Boolean), 1.9);
        var con = sm.consistency;
        deck.bullets(s, [
          'Asked ' + list.length + ' time' + (list.length === 1 ? '' : 's') + ' across ' + provs.length + ' AI model' + (provs.length === 1 ? '' : 's') + (d.locations.length > 1 ? ' and ' + d.locations.length + ' markets' : '') + '.',
          con ? name + ' was named every time in ' + con.always + ' of ' + con.groups + ' model × prompt × market combinations, only sometimes in ' + con.sometimes + ' and never in ' + con.never + '.' : null,
          rivals.length ? 'Competitors: ' + rivals.map(function (x) { return x.b.name + ' ' + pct(x.v); }).join(' · ') + '.' : null
        ].filter(Boolean), { y: 4.2, h: 2.5, fs: 14 });

        // Visibility score per brand (sotuStats.js visibilityStats).
        var vis = sm.visibility;
        if (vis) {
          var VL = { named: 'named', prominence: 'prominence', recommended: 'recommended', top_pick: 'top pick', cited: 'cited' };
          var vr = d.brands.slice().sort(function (a, b) { return ((vis.by_brand[b.name] || {}).score || 0) - ((vis.by_brand[a.name] || {}).score || 0); });
          s = deck.slide('Visibility score', name + ' scores ' + (vis.by_brand[main.name] || {}).score + '/100' + (vr[0].name !== main.name ? ' — ' + vr[0].name + ' leads with ' + (vis.by_brand[vr[0].name] || {}).score : ' — the highest of the brands tracked'));
          deck.bars(s, vr.map(function (b) { return b.name; }), [{ name: 'Visibility score', color: ORANGE, values: vr.map(function (b) { var x = vis.by_brand[b.name]; return x && x.score != null ? x.score / 100 : null; }) }], { y: 1.8, h: 4.3, suffix: '', bold: vr.findIndex(function (b) { return b.name === main.name; }) });
          deck.note(s, 'One number out of 100: ' + vis.parts_used.map(function (k) { return VL[k] + ' ' + vis.weights[k] + '%'; }).join(', ') + '. Prominence: full credit for being named first, half for second, a third for third.', 6.5, 0.45);
        }

        // Share of answers by brand (a real chart; weighted by demand as a second series when known).
        s = deck.slide('Share of voice', 'How often each brand is named');
        var series = [{ name: 'Share of answers', color: INK, values: d.brands.map(function (b) { return rateIn(list, b.name); }) }];
        if (demand) {
          series.push({ name: 'Weighted by ' + (basis === 'ai' ? 'AI' : 'Google') + ' searches', color: ORANGE, values: d.brands.map(function (b) {
            var num = 0, den = 0;
            d.prompts.forEach(function (p) { d.locations.forEach(function (m) { var r = rateIn(list.filter(function (c) { return c.prompt === p && c.location === m; }), b.name), w = S.demandWeight(demand, basis, p, m); if (r != null && w) { num += w * r; den += w; } }); });
            return den ? num / den : null;
          }) });
        }
        deck.bars(s, d.brands.map(function (b) { return b.name; }), series, { y: 1.8, h: series.length > 1 ? 4.4 : 4.7, bold: 0 });

        // Who AI recommends (runs that read recommendations): recommended and top pick per brand, and each model's top pick.
        var rec = sm.recommend;
        if (rec) {
          var rm = rec.by_brand[main.name] || {};
          s = deck.slide('Who AI recommends', name + ' is the top pick in ' + pct(rm.top_rate) + ' of answers' + (rec.top_picks[0] ? ' — most often: ' + rec.top_picks[0].name : ''));
          deck.bars(s, d.brands.map(function (b) { return b.name; }), [
            { name: 'Recommended', color: INK, values: d.brands.map(function (b) { return (rec.by_brand[b.name] || {}).rec_rate; }) },
            { name: 'Top pick', color: ORANGE, values: d.brands.map(function (b) { return (rec.by_brand[b.name] || {}).top_rate; }) }
          ], { y: 1.75, h: 3.3, bold: 0 });
          var pv = Object.keys(rec.by_provider);
          if (pv.length) deck.note(s, 'Most common top pick by model: ' + pv.map(function (p) { var v = rec.by_provider[p]; return S.providerLabel(p) + ' — ' + (v.leader ? v.leader + ' (' + v.leader_answers + ' of ' + v.answers + ')' : 'no single pick'); }).join(' · ') + '. Each answer read for its top pick, what it recommends and what it warns against.', 6.0, 0.9);
        }

        // By model.
        if (provs.length > 1) {
          s = deck.slide('By model', 'Which AI models name ' + name);
          deck.table(s, ['Model'].concat(d.brands.map(function (b) { return b.name; })), provs.map(function (p) {
            var mine = list.filter(function (c) { return c.provider === p.id; });
            return [{ text: p.label, options: { bold: true } }].concat(d.brands.map(function (b) { var v = rateIn(mine, b.name); return { text: pct(v), options: { fill: { color: heat(v) }, align: 'center' } }; }));
          }), { fs: 12, max: 11 });
        }
        // By market.
        if (d.locations.length > 1) {
          s = deck.slide('By market', 'Where ' + name + ' is named');
          deck.table(s, ['Market'].concat(d.brands.map(function (b) { return b.name; })), d.locations.map(function (m) {
            var mine = list.filter(function (c) { return c.location === m; });
            return [{ text: m, options: { bold: true } }].concat(d.brands.map(function (b) { var v = rateIn(mine, b.name); return { text: pct(v), options: { fill: { color: heat(v) }, align: 'center' } }; }));
          }), { fs: 12 });
        }
        // Buyer personas.
        var bp = sm.by_persona;
        if (bp && bp.length > 1) {
          s = deck.slide('By buyer', 'Which buyers AI sends to ' + name);
          deck.table(s, ['Brand'].concat(bp.map(function (v) { return S.personaName(v.persona); })), d.brands.map(function (b) {
            return [{ text: b.name, options: { bold: true } }].concat(bp.map(function (v) { var x = v.by_brand[b.name] || {}; return { text: pct(x.rate) + (x.first ? '  (first ' + pct(x.first_rate) + ')' : ''), options: { fill: { color: heat(x.rate) }, align: 'center' } }; }));
          }), { fs: 11 });
          deck.note(s, 'The same prompts asked as each buyer (“I’m … . What’s the best…?”). Share of answers naming each brand, and how often it is named first.', 6.35);
        }
        // Prompts: by searches at stake when demand is known.
        s = deck.slide('Prompt by prompt', demand ? 'Where the searches at stake are' : 'Which prompts ' + name + ' wins and loses');
        var prow = d.prompts.map(function (p) {
          var mine = list.filter(function (c) { return c.prompt === p; }), r = rateIn(mine, main.name);
          var lead = d.brands.slice(1).map(function (b) { return { n: b.name, v: rateIn(mine, b.name) }; }).filter(function (x) { return x.v; }).sort(function (a, b) { return b.v - a.v; })[0];
          var e = demand && demand.prompts.filter(function (x) { return x.prompt === p; })[0];
          var vol = e ? d.locations.reduce(function (t, m) { var v = e.by_market[m]; var k = v && (basis === 'ai' ? v.ai : v.google); return k != null ? (t || 0) + k : t; }, null) : null;
          return { p: p, r: r, lead: lead, vol: vol, kw: e ? e.keyword : null, miss: demand ? S.demandMissed(d, demand, basis, p) : null };
        }).sort(function (a, b) { return demand ? b.miss - a.miss : (a.r == null ? 1 : a.r) - (b.r == null ? 1 : b.r); });
        var head = ['Prompt', name + ' named', 'Most-named rival'].concat(demand ? ['Keyword', (basis === 'ai' ? 'AI' : 'Google') + ' searches / mo', 'Searches missed / mo'] : []);
        deck.table(s, head, prow.map(function (x) {
          return [clip(x.p, 70), { text: pct(x.r), options: { fill: { color: heat(x.r) }, align: 'center' } }, x.lead ? x.lead.n + ' ' + pct(x.lead.v) : '—']
            .concat(demand ? [x.kw || '—', { text: x.vol == null ? '—' : Number(x.vol).toLocaleString(), options: { align: 'right' } }, { text: x.miss ? Math.round(x.miss).toLocaleString() : '0', options: { align: 'right', bold: true } }] : []);
        }), { colW: demand ? [4.2, 1.3, 1.9, 1.8, 1.4, 1.53] : [7.3, 2, 2.83], fs: 10, max: 11 });
        if (d.prompts.length > 11) deck.note(s, 'Showing 11 of ' + d.prompts.length + ' prompts — the full list is in the report.', 6.5, 0.4);

        describeSlide(deck, sm.describe, name);

        // What AI gets wrong.
        var fg = sm.facts && sm.facts.groups || [];
        if (fg.length) {
          s = deck.slide('What AI gets wrong', 'Facts about ' + name + ' the answers get wrong');
          deck.table(s, ['The fact', 'Answers', 'Models', 'What an answer said'], fg.slice(0, 6).map(function (g) {
            return [{ text: clip(g.correct, 80), options: { bold: true } }, { text: String(g.answers), options: { align: 'center' } }, g.providers.map(S.providerLabel).join(', '), clip('“' + (g.examples[0] && g.examples[0].quote) + '”', 150)];
          }), { colW: [3.2, 1, 2.2, 5.73], fs: 10 });
        }

        // Who gets cited.
        if (cit) {
          s = deck.slide('Who gets cited', name + ' ' + pct(cit.share.own) + ' · competitors ' + pct(cit.share.competitors) + ' · other sites ' + pct(cit.share.other) + ' of citations');
          deck.table(s, ['Most-cited website', 'Answers', 'Belongs to'], cit.top_domains.slice(0, 10).map(function (x) { return [x.domain, { text: String(x.answers), options: { align: 'center' } }, x.owner || 'Third party']; }), { w: 5.6, colW: [2.9, 1, 1.7], fs: 10, max: 10 });
          var other = (cit.pages && cit.pages.other || []).slice(0, 8);
          if (other.length) deck.table(s, ['Third-party pages to get onto', 'Answers'], other.map(function (p) { return [clip(p.url.replace(/^https?:\/\/(www\.)?/, ''), 60), { text: String(p.answers), options: { align: 'center' } }]; }), { x: 6.5, w: 6.23, colW: [5.33, 0.9], fs: 9, max: 8 });
          deck.note(s, 'Across ' + cit.answers_with_sources + ' answers that showed their sources. Third-party pages are the reviews and roundups AI draws on.', 6.4);
        }

        // Pages to get onto: cited third-party pages that name a competitor but not you (sotuCitedPages.js).
        if (cited) {
          var gap = cited.pages.filter(function (p) { return p.checked && p.missing_you && p.named.length; });
          if (gap.length) {
            s = deck.slide('Pages to get onto', gap.length + ' pages AI cites name a competitor but not ' + name);
            deck.table(s, ['Page AI cites', 'Cited in', 'Names instead'], gap.slice(0, 10).map(function (p) {
              return [clip(p.url.replace(/^https?:\/\/(www\.)?/, ''), 60) + (p.title ? '\n' + clip(p.title, 70) : ''), { text: String(p.answers), options: { align: 'center' } }, p.named.join(', ')];
            }), { colW: [6.6, 1.2, 4.33], fs: 10, max: 10 });
            deck.note(s, 'Each page the answers cite was read for the tracked brands. AI already trusts these pages — being on them is how to be in the answer.', 6.4);
          }
        }

        // What ChatGPT searched for (sotuFanout.js): who it looked up by name, and — if checked — where you rank for its searches.
        var fo = await S.api('/state-of-union/fanout', { id: d.id }).catch(function () { return null; });
        if (fo && fo.queries && fo.queries.length) {
          var lk = fo.lookups.filter(function (l) { return l.searches; }).sort(function (a, b) { return b.answers - a.answers; });
          var you = fo.lookups.filter(function (l) { return l.brand === name; })[0] || { answers: 0 };
          s = deck.slide('What ChatGPT searched for', fo.queries.length + ' searches while answering — ' + (you.answers ? name + ' looked up ' + you.answers + '×' : name + ' never looked up'));
          var g = fo.rankings && (fo.rankings.google || fo.rankings.bing), bullets = [];
          if (lk.length) bullets.push('Vendors looked up by name: ' + lk.map(function (l) { return l.brand + ' ' + l.answers + '×'; }).join(' · ') + '.');
          fo.queries.filter(function (q) { return q.kind === 'discovery'; }).slice(0, 4).forEach(function (q) { bullets.push('“' + clip(q.query, 110) + '”' + (q.answers > 1 ? ' (' + q.answers + ' answers)' : '')); });
          deck.bullets(s, bullets, { y: 1.75, h: g ? 2.3 : 4.8, fs: 12 });
          if (g) {
            var okS = g.searches.filter(function (x) { return !x.error; });
            var p1 = function (n) { return okS.filter(function (x) { return x.brands[n] && x.brands[n].rank <= 10; }).length; };
            deck.bars(s, d.brands.map(function (b) { return b.name; }), [{ name: 'On ' + (g.engine === 'bing' ? 'Bing' : 'Google') + '’s first page for these searches', color: ORANGE, values: d.brands.map(function (b) { return okS.length ? p1(b.name) / okS.length : null; }) }], { y: 4.1, h: 2.0, bold: 0 });
            deck.note(s, (g.engine === 'bing' ? 'Bing' : 'Google') + '’s top 20 held a website the answer cited for ' + g.explains.with_cited_site + ' of ' + g.explains.searches + ' searches' + (g.explains.searches && g.explains.with_cited_site / g.explains.searches < 0.5 ? ' — ChatGPT isn’t simply citing what ranks, so treat rankings as context.' : ' — rankings and citations line up here, so ranking for these searches is a route into the answer.'), 6.62, 0.35);
          }
        }

        // Crawler access: only when something needs attention.
        if (crawl) {
          var issues = crawl.pages.filter(function (p) { return p.blocked_us || p.status >= 400 || (p.page_rules || []).length || (p.ua_blocked || []).length || Object.values(p.robots || {}).some(function (v) { return v.allowed === false; }); });
          if (issues.length) {
            s = deck.slide('Can AI crawlers reach these pages?', issues.length + ' of ' + crawl.pages.length + ' pages checked need attention');
            var names = {}; (crawl.crawlers || []).forEach(function (c) { names[c.id] = c.name; });
            deck.table(s, ['Page', 'Belongs to', 'Issue'], issues.slice(0, 10).map(function (p) {
              var why = [];
              var no = Object.entries(p.robots || {}).filter(function (kv) { return kv[1].allowed === false; }).map(function (kv) { return names[kv[0]] || kv[0]; });
              if (no.length) why.push('robots.txt blocks ' + no.join(', '));
              (p.page_rules || []).forEach(function (r) { why.push(r); });
              (p.ua_blocked || []).forEach(function (u) { why.push('turned away ' + u.crawler + ' (' + (u.status || u.error) + ')'); });
              if (p.blocked_us) why.push('blocks automated checks (' + p.status + ') — verify with a real crawler');
              else if (p.status >= 400) why.push('returns ' + p.status + ' — AI is citing a page that doesn’t load');
              return [clip(p.url.replace(/^https?:\/\/(www\.)?/, ''), 55), p.kind === 'own' ? name : p.kind === 'competitor' ? (p.owner || 'Competitor') : 'Third party', clip(why.join('; '), 150)];
            }), { colW: [4.6, 1.8, 5.73], fs: 10, max: 10 });
          }
        }

        // Prompt briefs already written, most searches at stake first.
        if (demand) briefs.sort(function (a, b) { return S.demandMissed(d, demand, basis, b.prompt) - S.demandMissed(d, demand, basis, a.prompt); });
        briefs.slice(0, 5).forEach(function (b) {
          var br = b.brief;
          s = deck.slide('Why ' + name + ' loses this prompt', '“' + clip(b.prompt, 68) + '”');
          s.addText(clip(br.verdict, 400), { x: X, y: 1.65, w: CW, h: 0.9, fontFace: BODY, fontSize: 14, bold: true, color: INK, valign: 'top', margin: 0, fit: 'shrink' });
          if ((br.who_wins || []).length) deck.bullets(s, br.who_wins.slice(0, 3).map(function (w) { return w.brand + ': ' + clip(w.why, 160); }), { y: 2.6, h: 1.5, fs: 12 });
          if ((br.actions || []).length) deck.table(s, ['What to do', 'Where'], br.actions.slice(0, 4).map(function (a) { return [clip(a.action, 170), clip(a.where, 60)]; }), { y: 4.25, colW: [8.6, 3.53], fs: 10, max: 4 });
        });
      }

      // Method.
      var s2 = deck.slide('Method', 'How this was measured');
      deck.bullets(s2, [
        'Each prompt was put to ' + provs.map(function (p) { return p.label; }).join(', ') + (d.locations.length ? ' as someone in ' + d.locations.map(function (m) { return /^united /i.test(m) ? 'the ' + m : m; }).join(', ') : '') + (d.repeats > 1 ? ', ' + d.repeats + ' times each (AI Overviews and Gemini once), because AI answers vary' : '') + '.',
        'Web search was ' + (d.web ? 'on' : 'off') + ' for the API models; the ChatGPT app, Gemini app, Perplexity, AI Overviews and AI Mode answer the way they do for real users.',
        '“Share of answers” counts answers that name a brand; the likely range is a 95% Wilson interval. “Named first” is the first brand an answer names.',
        demand ? 'Demand: each prompt is matched to a search keyword; weights are ' + (basis === 'ai' ? 'DataForSEO’s AI search volume (an estimate of monthly use in AI tools, from Google People Also Ask data)' : 'Google monthly search volume') + '.' : null,
        'Description tags, fact checks and briefs are written by AI models reading the answers; quotes are the answers’ own words.',
        BRAND.white_label ? 'Every chart and table in this deck is editable.' : 'Made with State Of The LLM Union on ' + SITE + '. Every chart and table in this deck is editable.'
      ].filter(Boolean), { fs: 13 });

      await deck.save('state-of-the-llm-union-' + slug(name) + '-' + String(d.completed_at || d.created_at).slice(0, 10) + '.pptx');
      if (btn) { btn.disabled = false; btn.textContent = old; }
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Slides failed — try again'; }
      console.error('slide export failed', e);
    }
  }

  /* ---- the tracker deck ----------------------------------------------------------------- */

  async function tracker(d, extra, btn) {
    extra = extra || {};
    var old = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Building slides…'; }
    try {
      await lib();
      useBranding(await S.branding());
      var main = d.brands[0], runs = d.runs, last = runs[runs.length - 1], prev = runs.length > 1 ? runs[runs.length - 2] : null;
      var name = main.name, colours = S.colourMap(d.brands);
      var when = function (iso) { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
      var deck = new Deck(d.watch.name, day(last.created_at));
      deck.cover('State Of The LLM Union tracker', d.watch.name, [
        runs.length + ' run' + (runs.length === 1 ? '' : 's') + ', ' + day(runs[0].created_at) + ' – ' + day(last.created_at) + ' · ' + d.watch.frequency,
        (d.prompts || []).length + ' prompts · ' + (d.locations || []).join(', ') + ' · ' + (d.providers || []).map(S.providerLabel).join(', ')
      ]);

      var now = (last.by_brand[name] || {}), before = prev ? (prev.by_brand[name] || {}) : null;
      var delta = before && now.rate != null && before.rate != null ? Math.round((now.rate - before.rate) * 100) : null;
      var wr = extra.weightedRuns, wNow = wr ? (wr[wr.length - 1].by_brand[name] || {}).rate : null;
      var s = deck.slide('The headline', name + ' is named in ' + pct(now.rate) + ' of AI answers' + (delta != null ? ' (' + (delta > 0 ? '+' : '') + delta + ' pts since the last run)' : ''));
      deck.stats(s, [
        { lbl: 'Share of answers now', val: pct(now.rate), sub: S.range(now) ? 'likely ' + S.range(now) : 'latest run' },
        { lbl: 'Change', val: delta == null ? '—' : (delta > 0 ? '+' : '') + delta + ' pts', sub: prev ? 'since ' + when(prev.created_at) : 'needs a second run' },
        wNow != null ? { lbl: 'Weighted by demand', val: pct(wNow), sub: 'each prompt counted by its searches' } : null,
        last.consistency ? { lbl: 'Named every time', val: last.consistency.always + '/' + last.consistency.groups, sub: 'combinations asked ' + (d.repeats || 1) + '×' } : null,
        { lbl: 'Runs', val: String(runs.length), sub: d.watch.frequency }
      ].filter(Boolean), 1.9);
      var ch = last.changes && last.changes.items || [];
      if (ch.length) deck.bullets(s, ch.slice(0, 6).map(function (c) { return (c.tone === 'bad' ? '▼ ' : c.tone === 'good' ? '▲ ' : '• ') + c.text; }), { y: 4.2, h: 2.6, fs: 13 });

      var line = function (title, rs, note) {
        var sl = deck.slide('Over time', title);
        // Your brand last, so its line sits on top.
        var order = d.brands.slice(1).concat(d.brands.slice(0, 1));
        deck.lines(sl, rs.map(function (r) { return when(r.created_at); }), order.map(function (b) { return { name: b.name, color: hex(colours[b.name].bg), values: rs.map(function (r) { var v = r.by_brand[b.name]; return v && v.rate != null ? v.rate : null; }) }; }), { y: 1.8, h: 4.0 });
        if (note) deck.note(sl, note, 6.62, 0.35);
      };
      line('Share of answers naming each brand, run by run', runs, 'Each point is one full run.');
      if (runs.some(function (r) { return r.visibility; })) line('Visibility score, run by run', runs.map(function (r) {
        return Object.assign({}, r, { by_brand: r.visibility ? Object.fromEntries(Object.entries(r.visibility.by_brand).filter(function (kv) { return kv[1].score != null; }).map(function (kv) { return [kv[0], { rate: kv[1].score / 100 }]; })) : {} });
      }), 'Score out of 100 (the 50% line is a score of 50). Named, prominence, recommendations and citations in one number.');
      if (runs.some(function (r) { return r.recommend; })) line('Top pick, run by run', runs.map(function (r) {
        return Object.assign({}, r, { by_brand: r.recommend ? Object.fromEntries(Object.entries(r.recommend.by_brand).map(function (kv) { return [kv[0], { rate: kv[1].top_rate }]; })) : {} });
      }), 'Share of answers where each brand is the single top recommendation. Runs made without reading recommendations are gaps.');
      if (wr) line('Weighted by demand, run by run', wr, 'Each prompt counts in proportion to its searches; the same weights for every run, so the lines move only when the answers do.');

      var bp = last.by_provider || {};
      if (Object.keys(bp).length) {
        s = deck.slide('Latest run', name + ' by model');
        deck.table(s, ['Model', 'Share of answers', 'Answers'], Object.keys(bp).map(function (p) { var v = bp[p]; return [{ text: S.providerLabel(p), options: { bold: true } }, { text: pct(v.rate), options: { fill: { color: heat(v.rate) }, align: 'center' } }, { text: v.mentioned + ' / ' + v.answered, options: { align: 'center' } }]; }), { w: 8, colW: [3.5, 2.5, 2], fs: 12 });
      }
      describeSlide(deck, last.describe, name);
      var cit = last.citations;
      if (cit) {
        s = deck.slide('Who gets cited', 'Latest run: ' + name + ' ' + pct(cit.share.own) + ' · competitors ' + pct(cit.share.competitors) + ' · other sites ' + pct(cit.share.other));
        deck.table(s, ['Most-cited website', 'Answers', 'Belongs to'], cit.top_domains.slice(0, 10).map(function (x) { return [x.domain, { text: String(x.answers), options: { align: 'center' } }, x.owner || 'Third party']; }), { w: 8, colW: [4.5, 1.3, 2.2], fs: 11, max: 10 });
      }
      s = deck.slide('All runs', 'Every run of this tracker');
      deck.table(s, ['Run', name + ' share', 'Likely range', 'Avg position', 'Answers'], runs.slice().reverse().slice(0, 12).map(function (r) {
        var v = r.by_brand[name] || {};
        return [day(r.created_at), { text: pct(v.rate), options: { fill: { color: heat(v.rate) }, align: 'center' } }, S.range(v) || '—', v.avg_position ? '#' + v.avg_position : '—', String(r.answers)];
      }), { fs: 11 });

      await deck.save('state-of-the-llm-union-tracker-' + slug(d.watch.name) + '-' + String(last.created_at).slice(0, 10) + '.pptx');
      if (btn) { btn.disabled = false; btn.textContent = old; }
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Slides failed — try again'; }
      console.error('slide export failed', e);
    }
  }

  window.SOTU_DECK = { report: report, tracker: tracker };
})();
