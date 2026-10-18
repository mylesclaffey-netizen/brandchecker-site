/* Search Console report renderer. Takes a snapshot object and returns HTML for the shared report page and for the PDF print frame.
   snapshot = { site, created, trend: [{date,clicks,impressions,position}], months: [{k,clicks,impressions,ctr,position,n}],
                pages: { month, total, later_range, later_note, rows: [{url,clicks,impressions,kind,label,final,clicks_later,target_later}] } | null } */
(function () {
  var MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var KINDS = [['live', 'Still live', 'ok'], ['moved', 'Moved to another page', 'ok'], ['home', 'Redirected to the homepage', 'bad'], ['gone', 'Gone (404 / 410)', 'bad'], ['elsewhere', 'Sent to another site', 'bad'], ['noindex', 'Live, but noindex', 'bad'], ['error', 'Could not check', 'na']];
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fmt = function (n) { return n == null ? '—' : Math.round(n).toLocaleString('en-US'); };
  var monLabel = function (m) { return MN[+m.slice(5) - 1] + ' ' + m.slice(0, 4); };
  var dLong = function (iso) { var p = iso.split('-'); return +p[2] + ' ' + MN[+p[1] - 1] + ' ' + p[0]; };
  var pct = function (a, b) { return b ? Math.round(a / b * 100) : 0; };
  var shiftYear = function (iso, n) { var d = new Date(iso + 'T00:00:00Z'); d.setUTCFullYear(d.getUTCFullYear() + n); return d.toISOString().slice(0, 10); };
  var addDays = function (iso, n) { var d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  var sitePath = function (u) { try { var x = new URL(u); return x.pathname + x.search || '/'; } catch (e) { return String(u); } };

  function totals(days) { var t = { clicks: 0, impressions: 0, w: 0 }; days.forEach(function (d) { t.clicks += d.clicks; t.impressions += d.impressions; t.w += (d.position || 0) * d.impressions; }); return { clicks: t.clicks, impressions: t.impressions, ctr: t.impressions ? t.clicks / t.impressions * 100 : 0, position: t.impressions ? t.w / t.impressions : null }; }
  function weeklyOf(days) {
    var m = {}, order = [];
    days.forEach(function (d) { var dt = new Date(d.date + 'T00:00:00Z'), dow = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - dow); var k = dt.toISOString().slice(0, 10), b = m[k]; if (!b) { b = m[k] = { k: k, clicks: 0, impressions: 0, n: 0 }; order.push(k); } b.clicks += d.clicks; b.impressions += d.impressions; b.n++; });
    return order.map(function (k) { return m[k]; }).filter(function (b) { return b.n === 7; });
  }
  function findDrops(weeks, metric) {
    var v = weeks.map(function (w) { return w[metric]; }), found = [];
    for (var i = 4; i + 4 <= v.length; i++) {
      var before = (v[i - 4] + v[i - 3] + v[i - 2] + v[i - 1]) / 4, after = (v[i] + v[i + 1] + v[i + 2] + v[i + 3]) / 4;
      if (before >= (metric === 'clicks' ? 20 : 200) && after / before <= 0.65) found.push({ i: i, ratio: after / before, before: before, after: after });
    }
    found.sort(function (a, b) { return a.ratio - b.ratio; });
    var kept = []; found.forEach(function (f) { if (!kept.some(function (k) { return Math.abs(k.i - f.i) < 8; })) kept.push(f); });
    return kept.slice(0, 3).sort(function (a, b) { return a.i - b.i; });
  }

  function chart(weeks, metric, drops, label) {
    var W = 760, H = 230, L = 52, R = 14, T = 22, B = 28, n = weeks.length;
    var vals = weeks.map(function (w) { return w[metric]; }), max = Math.max.apply(null, vals) || 1;
    var x = function (i) { return L + (W - L - R) * i / (n - 1); }, y = function (v) { return T + (H - T - B) * (1 - v / max); };
    var f = function (v) { return v >= 10000 ? Math.round(v / 1000) + 'k' : fmt(v); }, g = '';
    for (var t = 0; t <= 4; t++) { var yy = T + (H - T - B) * (1 - t / 4); g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" stroke="#e2e2dc"/><text x="' + (L - 6) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="11" fill="#3d3d3d">' + f(max * t / 4) + '</text>'; }
    weeks.forEach(function (w, i) { if (i % 8 === 0) g += '<text x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="#3d3d3d">' + MN[+w.k.slice(5, 7) - 1] + ' ' + w.k.slice(2, 4) + '</text>'; });
    drops.forEach(function (d) { g += '<line x1="' + x(d.i) + '" x2="' + x(d.i) + '" y1="' + T + '" y2="' + (H - B) + '" stroke="#d40000" stroke-width="1.5" stroke-dasharray="4 4"/>'; });
    g += '<polyline fill="none" stroke="#34517A" stroke-width="2.6" stroke-linejoin="round" points="' + weeks.map(function (w, i) { return x(i).toFixed(1) + ',' + y(w[metric]).toFixed(1); }).join(' ') + '"/>';
    return '<div class="chart"><div class="cl">' + esc(label) + ' per week</div><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(label) + ' per week">' + g + '</svg></div>';
  }

  function headline(days) {
    var last = days[days.length - 1].date, a0 = addDays(last, -27), b1 = shiftYear(last, -1), b0 = addDays(b1, -27);
    var cur = days.filter(function (d) { return d.date >= a0; }), prev = days.filter(function (d) { return d.date >= b0 && d.date <= b1; });
    if (cur.length < 28) return '';
    var c = totals(cur), p = prev.length >= 28 ? totals(prev) : null;
    var d = function (a, b, low) { if (!p || !b) return ''; var v = (a - b) / b * 100, good = low ? v < 0 : v > 0; return '<em class="' + (good ? 'ok' : 'bad') + '">' + (v >= 0 ? '+' : '') + v.toFixed(0) + '% vs the same 28 days a year earlier</em>'; };
    return '<h2>Last 28 days</h2><p class="sub">' + dLong(a0) + ' to ' + dLong(last) + '</p><div class="tiles">'
      + '<div class="tile"><span>Clicks</span><b>' + fmt(c.clicks) + '</b>' + d(c.clicks, p && p.clicks) + '</div>'
      + '<div class="tile"><span>Impressions</span><b>' + fmt(c.impressions) + '</b>' + d(c.impressions, p && p.impressions) + '</div>'
      + '<div class="tile"><span>CTR</span><b>' + c.ctr.toFixed(2) + '%</b>' + d(c.ctr, p && p.ctr) + '</div>'
      + '<div class="tile"><span>Avg position</span><b>' + (c.position == null ? '—' : c.position.toFixed(1)) + '</b>' + d(c.position, p && p.position, true) + '</div></div>';
  }

  function trendSection(days) {
    var weeks = weeklyOf(days); if (weeks.length < 6) return '';
    var dC = findDrops(weeks, 'clicks'), dI = findDrops(weeks, 'impressions');
    var h = '<h2>Trend</h2><p class="sub">Whole weeks, from ' + dLong(weeks[0].k) + ' to the week of ' + dLong(weeks[weeks.length - 1].k) + ' (everything Search Console still holds).</p>' + chart(weeks, 'clicks', dC, 'Clicks') + chart(weeks, 'impressions', dI, 'Impressions');
    var lines = [];
    dC.forEach(function (d) { lines.push('Clicks: from the week of ' + dLong(weeks[d.i].k) + ' the next four weeks average <b>' + fmt(d.after) + '</b> a week, against <b>' + fmt(d.before) + '</b> in the four before (' + Math.round((d.ratio - 1) * 100) + '%).'); });
    dI.forEach(function (d) { lines.push('Impressions: from the week of ' + dLong(weeks[d.i].k) + ' the next four weeks average <b>' + fmt(d.after) + '</b> a week, against <b>' + fmt(d.before) + '</b> in the four before (' + Math.round((d.ratio - 1) * 100) + '%).'); });
    // Best four weeks against the latest four.
    var v = weeks.map(function (w) { return w.clicks; }), best = 0, bi = 0; for (var i = 0; i + 4 <= v.length; i++) { var a = (v[i] + v[i + 1] + v[i + 2] + v[i + 3]) / 4; if (a > best) { best = a; bi = i; } }
    var now = (v[v.length - 1] + v[v.length - 2] + v[v.length - 3] + v[v.length - 4]) / 4;
    if (best && now / best < 0.8) lines.unshift('Clicks now run at <b>' + fmt(now) + '</b> a week, <b>' + Math.round((1 - now / best) * 100) + '%</b> below the best four weeks (<b>' + fmt(best) + '</b> a week, starting ' + dLong(weeks[bi].k) + ').');
    return h + (lines.length ? '<ul>' + lines.map(function (l) { return '<li>' + l + '</li>'; }).join('') + '</ul>' : '') + '<p class="foot">Red dashed lines mark the start of a sustained drop: a week where the next four weeks average at most 65% of the four before.</p>';
  }


  var TLAB = { web: 'Web', image: 'Image', video: 'Video', news: 'News', discover: 'Discover', googleNews: 'Google News' }, TORD = ['web', 'image', 'video', 'news', 'discover', 'googleNews'];
  function typesSection(web, other) {
    if (!other || !web.length) return '';
    var all = { web: web }; Object.keys(other).forEach(function (k) { all[k] = other[k]; });
    var last = web[web.length - 1].date, a0 = addDays(last, -27), b1 = shiftYear(last, -1), b0 = addDays(b1, -27), tot = 0;
    TORD.forEach(function (k) { (all[k] || []).forEach(function (d) { tot += d.clicks; }); });
    var rows = TORD.filter(function (k) { return all[k] && all[k].some(function (d) { return d.clicks > 0 || d.impressions > 0; }); }).map(function (k) {
      var c = 0, im = 0, pc = 0, tc = 0; all[k].forEach(function (d) { tc += d.clicks; if (d.date >= a0 && d.date <= last) { c += d.clicks; im += d.impressions; } if (d.date >= b0 && d.date <= b1) pc += d.clicks; });
      var ch = pc ? (c - pc) / pc * 100 : null;
      return '<tr><td>' + TLAB[k] + '</td><td class="n">' + fmt(c) + '</td><td class="n">' + (ch == null ? '—' : '<span class="' + (ch >= 0 ? 'ok' : 'bad') + '">' + (ch >= 0 ? '+' : '') + ch.toFixed(0) + '%</span>') + '</td><td class="n">' + fmt(im) + '</td><td class="n">' + fmt(tc) + '</td><td class="n">' + (tot ? (tc / tot * 100).toFixed(1) : '0.0') + '%</td></tr>';
    }).join('');
    var missing = TORD.filter(function (k) { return k !== 'web' && !other[k]; }).map(function (k) { return TLAB[k]; });
    return '<h2>By search type</h2><p class="sub">Search Console reports each search type separately. Everything else in this report is web search.</p><table><thead><tr><th>Type</th><th>Clicks, last 28 days</th><th>vs a year earlier</th><th>Impressions, last 28 days</th><th>Clicks, whole window</th><th>Share of clicks</th></tr></thead><tbody>' + rows + '</tbody></table>'
      + (missing.length ? '<p class="foot">No data in this window for: ' + missing.join(', ') + '.</p>' : '');
  }

  /* ---- brand vs non-brand ---- */
  function bAll(b) { var older = (b.older || []).filter(function (d) { return d.bc != null; }).map(function (d) { return { date: d.date, clicks: d.clicks, impressions: d.impressions, bc: d.bc, bi: d.bi || 0, src: d.src }; }); return older.concat(b.days || []).sort(function (a, c) { return a.date < c.date ? -1 : 1; }); }
  function bWeeks(days) {
    var m = {}, order = [];
    days.forEach(function (d) { var dt = new Date(d.date + 'T00:00:00Z'), dow = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - dow); var k = dt.toISOString().slice(0, 10), w = m[k]; if (!w) { w = m[k] = { k: k, clicks: 0, impressions: 0, bc: 0, bi: 0, n: 0 }; order.push(k); } w.clicks += d.clicks; w.impressions += d.impressions; w.bc += d.bc; w.bi += d.bi; w.n++; });
    return order.map(function (k) { var w = m[k]; w.nc = w.clicks - w.bc; w.ni = w.impressions - w.bi; return w; }).filter(function (w) { return w.n === 7; });
  }
  function bMonths(days) {
    var m = {}; days.forEach(function (d) { var k = d.date.slice(0, 7), x = m[k] || (m[k] = { k: k, clicks: 0, bc: 0, n: 0 }); x.clicks += d.clicks; x.bc += d.bc; x.n++; });
    return Object.keys(m).sort().map(function (k) { var x = m[k]; x.nc = x.clicks - x.bc; x.share = x.clicks ? x.bc / x.clicks * 100 : 0; return x; });
  }
  function sum(days, f) { var t = { clicks: 0, impressions: 0, bc: 0, bi: 0, n: 0 }; days.forEach(function (d) { if (!f || f(d)) { t.clicks += d.clicks; t.impressions += d.impressions; t.bc += d.bc; t.bi += d.bi; t.n++; } }); t.nc = t.clicks - t.bc; t.ni = t.impressions - t.bi; t.share = t.clicks ? t.bc / t.clicks * 100 : 0; return t; }
  function bStats(days) {
    if (!days.length) return null;
    var last = days[days.length - 1].date, a0 = addDays(last, -27), b1 = shiftYear(last, -1), b0 = addDays(b1, -27);
    var cur = sum(days, function (d) { return d.date >= a0 && d.date <= last; }), prev = sum(days, function (d) { return d.date >= b0 && d.date <= b1; });
    return { last: last, a0: a0, b0: b0, b1: b1, cur: cur.n >= 28 ? cur : null, prev: prev.n >= 28 ? prev : null };
  }
  function bChart(weeks, metric) {
    if (weeks.length < 4) return '';
    var nb = metric === 'impressions' ? 'ni' : 'nc', br = metric === 'impressions' ? 'bi' : 'bc';
    var W = 760, H = 230, L = 52, R = 14, T = 16, B = 28, n = weeks.length, max = 1;
    weeks.forEach(function (w) { max = Math.max(max, w[nb], w[br]); });
    var x = function (i) { return L + (W - L - R) * i / (n - 1); }, y = function (v) { return T + (H - T - B) * (1 - v / max); };
    var f = function (v) { return v >= 10000 ? Math.round(v / 1000) + 'k' : fmt(v); }, g = '';
    for (var t = 0; t <= 4; t++) { var yy = T + (H - T - B) * (1 - t / 4); g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" stroke="#e2e2dc"/><text x="' + (L - 6) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="11" fill="#3d3d3d">' + f(max * t / 4) + '</text>'; }
    weeks.forEach(function (w, i) { if (i % 8 === 0) g += '<text x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="#3d3d3d">' + MN[+w.k.slice(5, 7) - 1] + ' ' + w.k.slice(2, 4) + '</text>'; });
    var line = function (key, color) { return '<polyline fill="none" stroke="' + color + '" stroke-width="2.6" stroke-linejoin="round" points="' + weeks.map(function (w, i) { return x(i).toFixed(1) + ',' + y(w[key]).toFixed(1); }).join(' ') + '"/>'; };
    g += line(nb, '#34517A') + line(br, '#C99A3E');
    return '<div class="chart"><div class="cl">' + (metric === 'impressions' ? 'Impressions' : 'Clicks') + ' per week</div><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Brand and non-brand ' + metric + ' per week">' + g + '</svg><div class="leg"><span><i style="background:#34517A"></i>Non-brand</span><span><i style="background:#C99A3E"></i>Brand</span></div></div>';
  }
  function dpct(a, b) { return b ? (a - b) / b * 100 : null; }
  function dtxt(v, goodUp) { if (v == null) return ''; var good = goodUp ? v >= 0 : v <= 0; return '<em class="' + (good ? 'ok' : 'bad') + '">' + (v >= 0 ? '+' : '') + v.toFixed(0) + '% vs the same 28 days a year earlier</em>'; }
  function brandSection(b) {
    if (!b || !b.days || !b.days.length) return '';
    var days = bAll(b), st = bStats(days), weeks = bWeeks(days), months = bMonths(days);
    var h = '<h2>Brand vs non-brand</h2><p class="sub">Brand = queries containing: <b>' + (b.terms || []).map(esc).join('</b>, <b>') + '</b>. Non-brand = the rest of web search, including the queries Google hides.</p>';
    if (st && st.cur) {
      var c = st.cur, p = st.prev;
      h += '<div class="tiles"><div class="tile"><span>Brand clicks, last 28 days</span><b>' + fmt(c.bc) + '</b>' + (p ? dtxt(dpct(c.bc, p.bc), true) : '') + '</div>'
        + '<div class="tile"><span>Non-brand clicks, last 28 days</span><b>' + fmt(c.nc) + '</b>' + (p ? dtxt(dpct(c.nc, p.nc), true) : '') + '</div>'
        + '<div class="tile"><span>Brand share of clicks</span><b>' + c.share.toFixed(1) + '%</b>' + (p ? '<em>' + p.share.toFixed(1) + '% a year earlier</em>' : '') + '</div></div>';
      if (p) { var dn = dpct(c.nc, p.nc), db = dpct(c.bc, p.bc), ins = []; if (dn != null && db != null) ins.push('Compared with the same 28 days a year earlier, non-brand clicks are <b>' + (dn >= 0 ? '+' : '') + dn.toFixed(0) + '%</b> and brand clicks <b>' + (db >= 0 ? '+' : '') + db.toFixed(0) + '%</b>' + (Math.abs(dn - db) > 25 ? (dn < db ? ' — the loss is in non-brand search; people still look for the brand by name.' : ' — brand search fell more than non-brand.') : '.')); h += '<ul>' + ins.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>'; }
    }
    h += bChart(weeks, 'clicks');
    h += '<table><thead><tr><th>Month</th><th>Clicks</th><th>Brand</th><th>Non-brand</th><th>Brand share</th></tr></thead><tbody>' + months.slice().reverse().map(function (m) { var full = new Date(Date.UTC(+m.k.slice(0, 4), +m.k.slice(5), 0)).getUTCDate(); return '<tr><td>' + esc(monLabel(m.k)) + (m.n < full ? ' (' + m.n + ' days)' : '') + '</td><td class="n">' + fmt(m.clicks) + '</td><td class="n">' + fmt(m.bc) + '</td><td class="n">' + fmt(m.nc) + '</td><td class="n">' + m.share.toFixed(1) + '%</td></tr>'; }).join('') + '</tbody></table>';
    var rows = (b.older || []).some(function (d) { return d.src === 'rows'; });
    h += '<p class="foot">Search Console’s own branded-queries filter is not available through its API, so this split is rebuilt from the brand terms above and will differ somewhat from the filter in the Search Console interface (it also catches misspellings and related products). Queries Google anonymises cannot be matched to a term and count as non-brand.' + (rows ? ' Days Google no longer serves are classified from the saved query-by-page rows, which hide small combinations, so brand can read slightly low for those days.' : '') + '</p>';
    return h;
  }

  /* ---- query segments: core terms side by side, and a focus (e.g. a city) with its own report ---- */
  var SCOL = ['#34517A', '#C99A3E', '#00844A', '#d40000', '#7a3d7a', '#555555'];
  function sWin(days, a, b) { var t = { clicks: 0, impressions: 0, w: 0 }; days.forEach(function (d) { if (d.date >= a && d.date <= b) { t.clicks += d.clicks; t.impressions += d.impressions; t.w += (d.position || 0) * d.impressions; } }); return { clicks: t.clicks, impressions: t.impressions, ctr: t.impressions ? t.clicks / t.impressions * 100 : 0, position: t.impressions ? t.w / t.impressions : null }; }
  function sStat(days, last) { var a = addDays(last, -27), b1 = shiftYear(last, -1), b0 = addDays(b1, -27); return { cur: sWin(days, a, last), prev: sWin(days, b0, b1), a: a, b0: b0, b1: b1 }; }
  function sWeeks(days) {
    var m = {}, order = [];
    days.forEach(function (d) { var dt = new Date(d.date + 'T00:00:00Z'), dow = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - dow); var k = dt.toISOString().slice(0, 10), w = m[k]; if (!w) { w = m[k] = { k: k, clicks: 0, impressions: 0, pw: 0, n: 0 }; order.push(k); } w.clicks += d.clicks; w.impressions += d.impressions; w.pw += (d.position || 0) * d.impressions; w.n++; });
    return order.map(function (k) { var w = m[k]; w.position = w.impressions ? w.pw / w.impressions : null; return w; }).filter(function (w) { return w.n === 7; });
  }
  function sMonthly(days) { var m = {}; days.forEach(function (d) { var k = d.date.slice(0, 7), x = m[k] || (m[k] = { clicks: 0, impressions: 0 }); x.clicks += d.clicks; x.impressions += d.impressions; }); return m; }
  // Lines for several series over the same weeks. Position runs best (1) at the top.
  function sChart(list, metric, label) {
    var base = list[0].weeks; if (!base || base.length < 4) return '';
    var W = 760, H = 230, L = 52, R = 14, T = 16, B = 28, n = base.length, rev = metric === 'position', max = 1, min = rev ? 1 : 0;
    list.forEach(function (x) { x.weeks.forEach(function (w) { var v = w[metric]; if (v != null) max = Math.max(max, v); }); }); if (rev) max = Math.ceil(max);
    var x = function (i) { return L + (W - L - R) * i / (n - 1); }, y = function (v) { var t = (v - min) / (max - min || 1); return T + (H - T - B) * (rev ? t : 1 - t); };
    var f = function (v) { return rev ? v.toFixed(0) : (v >= 10000 ? Math.round(v / 1000) + 'k' : fmt(v)); }, g = '';
    for (var t = 0; t <= 4; t++) { var v = min + (max - min) * t / 4, yy = T + (H - T - B) * (rev ? t / 4 : 1 - t / 4); g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" stroke="#e2e2dc"/><text x="' + (L - 6) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="11" fill="#3d3d3d">' + f(v) + '</text>'; }
    base.forEach(function (w, i) { if (i % 8 === 0) g += '<text x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="#3d3d3d">' + MN[+w.k.slice(5, 7) - 1] + ' ' + w.k.slice(2, 4) + '</text>'; });
    var byK = function (arr) { var o = {}; arr.forEach(function (w) { o[w.k] = w; }); return o; };
    list.forEach(function (it, si) { var m = byK(it.weeks), pts = []; base.forEach(function (w, i) { var o = m[w.k]; if (o && o[metric] != null) pts.push(x(i).toFixed(1) + ',' + y(o[metric]).toFixed(1)); }); if (pts.length) g += '<polyline fill="none" stroke="' + SCOL[si % SCOL.length] + '" stroke-width="2.4" stroke-linejoin="round" points="' + pts.join(' ') + '"/>'; });
    return '<div class="chart"><div class="cl">' + esc(label) + '</div><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(label) + '">' + g + '</svg>' + (list.length > 1 ? '<div class="leg">' + list.map(function (it, si) { return '<span><i style="background:' + SCOL[si % SCOL.length] + '"></i>' + esc(it.name) + '</span>'; }).join('') + '</div>' : '') + '</div>';
  }
  var olderNote = function (seg) { return seg && seg.older && seg.older.days ? ' ' + seg.older.days + ' days older than Google’s window come from the archive, stored per day when each was captured' + (seg.older.rows ? ' (classified from the saved query-by-page rows, which hide small combinations, so they can read slightly low)' : '') + '.' : ''; };
  var dch = function (a, b) { return b ? (a - b) / b * 100 : null; };
  var chCell = function (v, goodUp) { if (v == null) return '—'; var good = goodUp ? v >= 0 : v <= 0; return '<span class="' + (good ? 'ok' : 'bad') + '">' + (v >= 0 ? '+' : '') + v.toFixed(0) + '%</span>'; };
  var posCell = function (a, b) { if (a == null) return '—'; var d = b != null ? a - b : null; return a.toFixed(1) + (d == null ? '' : ' <span class="' + (d <= 0 ? 'ok' : 'bad') + '">(' + (d >= 0 ? '+' : '') + d.toFixed(1) + ')</span>'); };
  function detailTables(det, title) {
    if (!det || (!det.queries.length && !det.pages.length)) return '';
    var w = det.window || {};
    var tbl = function (rows, label, n) { return '<table><thead><tr><th>' + label + '</th><th>Clicks</th><th>vs a year earlier</th><th>Impressions</th><th>Avg position</th></tr></thead><tbody>' + rows.slice(0, n).map(function (r) { var k = label === 'Page' ? sitePath(r.key) : r.key; return '<tr><td>' + esc(k) + '</td><td class="n">' + fmt(r.clicks) + '</td><td class="n">' + (r.prev_clicks || r.clicks ? fmt(r.prev_clicks) + ' → ' + fmt(r.clicks) : '—') + '</td><td class="n">' + fmt(r.impressions) + '</td><td class="n">' + r.position.toFixed(1) + '</td></tr>'; }).join('') + '</tbody></table>'; };
    return '<p class="sub" style="margin-top:8px"><b>' + esc(title) + '</b>: last 90 days (' + dLong(w.start) + ' to ' + dLong(w.end) + '), the “vs a year earlier” column shows the same 90 days a year before.</p>' + (det.queries.length ? tbl(det.queries, 'Query', 15) : '') + (det.pages.length ? tbl(det.pages, 'Page', 8) : '');
  }
  function segCore(seg) {
    var core = (seg.segments || []).filter(function (x) { return x.kind === 'core'; }); if (!core.length || !seg.total || !seg.total.length) return '';
    var last = seg.total[seg.total.length - 1].date, tot = sStat(seg.total, last);
    var rows = core.map(function (c) { var st = sStat(c.days, last); return { c: c, st: st, all: sWin(c.days, '0000', '9999') }; });
    var h = '<h2>Core terms</h2><p class="sub">Queries containing ' + core.map(function (c) { return '<b>' + esc(c.include.join(' / ')) + '</b>'; }).join(', ') + ' — each phrase matched from the start of a word, so “mac reparatur” does not include “imac reparatur” or “macbook reparatur”. Last 28 days (' + dLong(tot.a) + ' to ' + dLong(last) + ') against the same 28 days a year earlier.</p>';
    h += '<table><thead><tr><th>Term</th><th>Clicks</th><th>vs year earlier</th><th>Impressions</th><th>vs year earlier</th><th>CTR</th><th>Avg position (change)</th><th>Share of all clicks</th></tr></thead><tbody>' + rows.map(function (r) { var a = r.st.cur, b = r.st.prev; return '<tr><td>' + esc(r.c.name) + '</td><td class="n">' + fmt(a.clicks) + '</td><td class="n">' + chCell(dch(a.clicks, b.clicks), true) + '</td><td class="n">' + fmt(a.impressions) + '</td><td class="n">' + chCell(dch(a.impressions, b.impressions), true) + '</td><td class="n">' + a.ctr.toFixed(2) + '%</td><td class="n">' + posCell(a.position, b.position) + '</td><td class="n">' + (tot.cur.clicks ? (a.clicks / tot.cur.clicks * 100).toFixed(1) : '0.0') + '%</td></tr>'; }).join('') + '</tbody></table>';
    var lines = function () { return core.map(function (c) { return { name: c.name, weeks: sWeeks(c.days) }; }); };
    h += sChart(lines(), 'clicks', 'Clicks per week') + sChart(lines(), 'impressions', 'Impressions per week') + sChart(lines(), 'position', 'Average position per week (1 = top)');
    var ms = core.map(function (c) { return sMonthly(c.days); }), allm = sMonthly(seg.total), keys = Object.keys(allm).sort();
    h += '<table><thead><tr><th>Month</th>' + core.map(function (c) { return '<th>' + esc(c.name) + ' clicks</th>'; }).join('') + '<th>Core terms together</th><th>Share of all clicks</th></tr></thead><tbody>' + keys.slice().reverse().map(function (k) { var sum2 = 0; var cells = core.map(function (c, i) { var v = ms[i][k] ? ms[i][k].clicks : 0; sum2 += v; return '<td class="n">' + fmt(v) + '</td>'; }).join(''); return '<tr><td>' + esc(monLabel(k)) + '</td>' + cells + '<td class="n">' + fmt(sum2) + '</td><td class="n">' + (allm[k].clicks ? (sum2 / allm[k].clicks * 100).toFixed(1) : '0.0') + '%</td></tr>'; }).join('') + '</tbody></table>';
    core.forEach(function (c) { h += detailTables((seg.details || {})[c.id], c.name); });
    return h + '<p class="foot">Web search only: Search Console’s own figures for the last ~16 months, plus the archive beyond that. A query counts in a term if it contains the phrase; queries Google hides cannot be assigned to any term.' + olderNote(seg) + '</p>';
  }
  function segFocus(seg, id) {
    var f = (seg.segments || []).filter(function (x) { return x.id === id; })[0]; if (!f || !seg.total || !seg.total.length) return '';
    var last = seg.total[seg.total.length - 1].date, tot = sStat(seg.total, last), st = sStat(f.days, last), a = st.cur, b = st.prev, all = sWin(f.days, '0000', '9999'), allTot = sWin(seg.total, '0000', '9999');
    var h = '<h2>' + esc(f.name) + ' traffic</h2><p class="sub">Every query containing <b>' + f.include.map(esc).join('</b>, <b>') + '</b>' + (f.exclude.length ? ' but not <b>' + f.exclude.map(esc).join('</b>, <b>') + '</b>' : '') + '. Last 28 days (' + dLong(st.a) + ' to ' + dLong(last) + ') against the same 28 days a year earlier.</p>';
    h += '<div class="tiles"><div class="tile"><span>Clicks</span><b>' + fmt(a.clicks) + '</b><em class="' + (a.clicks >= b.clicks ? 'ok' : 'bad') + '">' + (b.clicks ? (dch(a.clicks, b.clicks) >= 0 ? '+' : '') + dch(a.clicks, b.clicks).toFixed(0) + '% (was ' + fmt(b.clicks) + ')' : 'no data a year earlier') + '</em></div>'
      + '<div class="tile"><span>Impressions</span><b>' + fmt(a.impressions) + '</b><em class="' + (a.impressions >= b.impressions ? 'ok' : 'bad') + '">' + (b.impressions ? (dch(a.impressions, b.impressions) >= 0 ? '+' : '') + dch(a.impressions, b.impressions).toFixed(0) + '% (was ' + fmt(b.impressions) + ')' : '') + '</em></div>'
      + '<div class="tile"><span>Share of all web clicks</span><b>' + (tot.cur.clicks ? (a.clicks / tot.cur.clicks * 100).toFixed(1) : '0.0') + '%</b><em>' + (tot.prev.clicks ? (b.clicks / tot.prev.clicks * 100).toFixed(1) + '% a year earlier' : '') + '</em></div>'
      + '<div class="tile"><span>Avg position</span><b>' + (a.position == null ? '—' : a.position.toFixed(1)) + '</b><em>' + (b.position == null ? '' : b.position.toFixed(1) + ' a year earlier') + '</em></div></div>';
    h += sChart([{ name: f.name, weeks: sWeeks(f.days) }], 'clicks', f.name + ': clicks per week') + sChart([{ name: f.name, weeks: sWeeks(f.days) }], 'impressions', f.name + ': impressions per week');
    var cross = (seg.cross || {})[id] || {}, core = (seg.segments || []).filter(function (x) { return x.kind === 'core'; });
    if (core.length) h += '<p class="sub" style="margin-top:10px"><b>How much of each core term is ' + esc(f.name) + '</b> (queries containing both)</p><table><thead><tr><th>Core term</th><th>' + esc(f.name) + ' clicks, last 28 days</th><th>vs year earlier</th><th>Share of the term’s clicks</th><th>Whole window</th></tr></thead><tbody>' + core.map(function (c) { var d = cross[c.id] || [], x = sStat(d, last), t = sStat(c.days, last), w = sWin(d, '0000', '9999'); return '<tr><td>' + esc(c.name) + '</td><td class="n">' + fmt(x.cur.clicks) + '</td><td class="n">' + chCell(dch(x.cur.clicks, x.prev.clicks), true) + '</td><td class="n">' + (t.cur.clicks ? (x.cur.clicks / t.cur.clicks * 100).toFixed(0) + '%' : '—') + '</td><td class="n">' + fmt(w.clicks) + ' clicks</td></tr>'; }).join('') + '</tbody></table>';
    var fm = sMonthly(f.days), tm = sMonthly(seg.total), keys = Object.keys(tm).sort();
    h += '<table><thead><tr><th>Month</th><th>' + esc(f.name) + ' clicks</th><th>' + esc(f.name) + ' impressions</th><th>Share of all clicks</th></tr></thead><tbody>' + keys.slice().reverse().map(function (k) { var m = fm[k] || { clicks: 0, impressions: 0 }; return '<tr><td>' + esc(monLabel(k)) + '</td><td class="n">' + fmt(m.clicks) + '</td><td class="n">' + fmt(m.impressions) + '</td><td class="n">' + (tm[k].clicks ? (m.clicks / tm[k].clicks * 100).toFixed(1) : '0.0') + '%</td></tr>'; }).join('') + '</tbody></table>';
    h += detailTables((seg.details || {})[id], f.name + ' queries and pages');
    return h + '<p class="foot">Whole window: ' + fmt(all.clicks) + ' clicks and ' + fmt(all.impressions) + ' impressions, ' + (allTot.clicks ? (all.clicks / allTot.clicks * 100).toFixed(1) : '0.0') + '% of all web clicks. Web search only: Search Console’s own figures for the last ~16 months, plus the archive beyond that. Queries that name a district or a neighbourhood but not the city are not included unless you add them as terms.' + olderNote(seg) + '</p>';
  }

  /* ---- Core Web Vitals (Chrome UX Report field data) ---- */
  var CWV = { lcp: { name: 'Largest Contentful Paint (LCP)', good: 2500, poor: 4000 }, inp: { name: 'Interaction to Next Paint (INP)', good: 200, poor: 500 }, cls: { name: 'Cumulative Layout Shift (CLS)', good: 0.1, poor: 0.25 } };
  var CCOL = { good: '#1b7a3d', ni: '#b45f00', poor: '#b3261e' }, CLAB = { good: 'Good', ni: 'Needs improvement', poor: 'Poor' };
  function cVal(m, v) { if (v == null) return '—'; return m === 'lcp' ? (v / 1000).toFixed(1) + ' s' : m === 'inp' ? Math.round(v) + ' ms' : (+v).toFixed(2); }
  function cCat(m, v) { return v == null ? null : v <= CWV[m].good ? 'good' : v > CWV[m].poor ? 'poor' : 'ni'; }
  function cCell(m, x) { if (!x || x.p75 == null) return '<span style="color:#777">—</span>'; return '<b style="color:' + CCOL[x.cat || cCat(m, x.p75)] + '">' + cVal(m, x.p75) + '</b>'; }
  function cBar(x) { if (!x || x.good == null) return ''; var g = Math.round(x.good * 100), n = Math.round((x.ni || 0) * 100), p = Math.max(0, 100 - g - n); return '<div class="b3" title="' + g + '% good, ' + n + '% needs improvement, ' + p + '% poor"><i style="width:' + g + '%;background:' + CCOL.good + '"></i><i style="width:' + n + '%;background:' + CCOL.ni + '"></i><i style="width:' + p + '%;background:' + CCOL.poor + '"></i></div><span class="b3t">' + g + '% good</span>'; }
  function cChart(h, m) {
    var nn = function (o) { return o && o[m] ? o[m].filter(function (v) { return v != null; }).length : 0; };
    var all = h && h.all && nn(h.all) >= 3 ? h.all : null, ph = h && h.phone && nn(h.phone) >= 3 ? h.phone : null, de = h && h.desktop && nn(h.desktop) >= 3 ? h.desktop : null, base = all || ph || de; if (!base) return '';
    var W = 760, H = 190, L = 52, R = 14, T = 12, B = 26, n = base[m].length, lim = CWV[m], max = lim.poor * 1.15;
    [all, ph, de].forEach(function (x) { if (x) x[m].forEach(function (v) { if (v != null) max = Math.max(max, v * 1.05); }); });
    var x = function (i) { return L + (W - L - R) * i / Math.max(1, n - 1); }, y = function (v) { return T + (H - T - B) * (1 - v / max); }, g = '';
    g += '<rect x="' + L + '" y="' + y(lim.good) + '" width="' + (W - L - R) + '" height="' + (y(0) - y(lim.good)) + '" fill="#1b7a3d" opacity=".07"/><line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(lim.good) + '" y2="' + y(lim.good) + '" stroke="#1b7a3d" stroke-dasharray="4 4"/><line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(lim.poor) + '" y2="' + y(lim.poor) + '" stroke="#b3261e" stroke-dasharray="4 4"/>';
    g += '<text x="' + (L - 6) + '" y="' + (y(lim.good) + 4) + '" text-anchor="end" font-size="10.5" fill="#1b7a3d">' + cVal(m, lim.good) + '</text><text x="' + (L - 6) + '" y="' + (y(lim.poor) + 4) + '" text-anchor="end" font-size="10.5" fill="#b3261e">' + cVal(m, lim.poor) + '</text><text x="' + (L - 6) + '" y="' + (y(0) + 4) + '" text-anchor="end" font-size="10.5" fill="#3d3d3d">0</text>';
    var dates = base.dates || []; [0, Math.floor((n - 1) / 2), n - 1].forEach(function (i) { if (dates[i]) g += '<text x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="' + (i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle') + '" font-size="10.5" fill="#3d3d3d">' + dLong(dates[i]) + '</text>'; });
    var line = function (obj, color, w) { if (!obj) return ''; var pts = []; obj[m].forEach(function (v, i) { if (v != null) pts.push(x(i).toFixed(1) + ',' + y(v).toFixed(1)); }); return pts.length ? '<polyline fill="none" stroke="' + color + '" stroke-width="' + w + '" stroke-linejoin="round" points="' + pts.join(' ') + '"/>' : ''; };
    g += line(de, '#C99A3E', 2) + line(ph, '#7a3d7a', 2) + line(all, '#34517A', 2.6);
    return '<div class="chart"><div class="cl">' + esc(CWV[m].name) + ' — 75th percentile by week</div><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(CWV[m].name) + ' by week">' + g + '</svg><div class="leg">' + (all ? '<span><i style="background:#34517A"></i>All devices</span>' : '') + (ph ? '<span><i style="background:#7a3d7a"></i>Phone</span>' : '') + (de ? '<span><i style="background:#C99A3E"></i>Desktop</span>' : '') + '<span style="color:#1b7a3d">dashed: good limit</span><span style="color:#b3261e">dashed: poor limit</span></div><div class="foot">Weeks with too few visits have no value and are skipped.</div></div>';
  }
  function cwvSection(c, opts) {
    if (!c || !c.current) return '';
    var cur = c.current, h = (opts && opts.noTitle ? '' : '<h2>Core Web Vitals</h2>');
    h += '<p class="sub">Real-user (field) data from the Chrome UX Report for <b>' + esc(c.origin) + '</b>' + (cur.all && cur.all.period ? ', rolling 28 days to ' + dLong(cur.all.period.last) : '') + '. Google rates the 75th percentile of visits. Good: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1. Poor: LCP > 4 s, INP > 500 ms, CLS > 0.25.</p>';
    var ph = cur.phone, de = cur.desktop, al = cur.all, cols = [['All devices', al]].concat(ph ? [['Phone', ph]] : [], de ? [['Desktop', de]] : []);
    h += '<table><thead><tr><th>Metric</th>' + cols.map(function (cl) { return '<th>' + cl[0] + '</th><th>' + cl[0] + ' visits</th>'; }).join('') + '</tr></thead><tbody>' + ['lcp', 'inp', 'cls'].map(function (m) { return '<tr><td>' + esc(CWV[m].name) + '</td>' + cols.map(function (cl) { return '<td class="n">' + cCell(m, cl[1] && cl[1][m]) + '</td><td>' + cBar(cl[1] && cl[1][m]) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
    if (!ph || !de) h += '<p class="foot">' + [!ph ? 'phone' : '', !de ? 'desktop' : ''].filter(Boolean).join(' and ') + ' visits alone are too few for the Chrome UX Report to publish their own current figures; the all-devices numbers above combine every visit.</p>';
    h += ['lcp', 'inp', 'cls'].map(function (m) { return cChart(c.history, m); }).join('');
    var pgs = (c.pages || []), withData = pgs.filter(function (x) { return x.lcp || x.inp || x.cls; });
    if (pgs.length) {
      var rank = { poor: 3, ni: 2, good: 1 }, worst = function (x) { var w = null; ['lcp', 'inp', 'cls'].forEach(function (m) { var k = x[m] && x[m].p75 != null ? (x[m].cat || cCat(m, x[m].p75)) : null; if (k && (!w || rank[k] > rank[w])) w = k; }); return w; };
      var rows = pgs.map(function (x) { x._w = worst(x); return x; }), clicks = rows.reduce(function (a, x) { return a + x.clicks; }, 0), poor = rows.filter(function (x) { return x._w === 'poor'; }), ni = rows.filter(function (x) { return x._w === 'ni'; });
      var pc = poor.reduce(function (a, x) { return a + x.clicks; }, 0), nc = ni.reduce(function (a, x) { return a + x.clicks; }, 0), nod = rows.filter(function (x) { return !x._w; }).reduce(function (a, x) { return a + x.clicks; }, 0);
      h += '<p class="sub" style="margin-top:10px"><b>The pages that earn the most clicks</b> (last 28 days, phone field data where available, otherwise all devices). ' + withData.length + ' of ' + pgs.length + ' have enough Chrome traffic for their own data: ' + poor.length + ' rated poor (<b>' + fmt(pc) + '</b> clicks, ' + pct(pc, clicks) + '% of these pages’ clicks), ' + ni.length + ' needs improvement (' + fmt(nc) + ' clicks). ' + fmt(nod) + ' clicks are on pages with no field data of their own.</p>';
      h += '<table><thead><tr><th>Page</th><th>Clicks</th><th>LCP</th><th>INP</th><th>CLS</th><th>Overall</th></tr></thead><tbody>' + rows.map(function (x) { return '<tr><td>' + esc(sitePath(x.url)) + '</td><td class="n">' + fmt(x.clicks) + '</td><td class="n">' + cCell('lcp', x.lcp) + '</td><td class="n">' + cCell('inp', x.inp) + '</td><td class="n">' + cCell('cls', x.cls) + '</td><td>' + (x._w ? '<b style="color:' + CCOL[x._w] + '">' + CLAB[x._w] + '</b>' : '<span style="color:#777">No field data</span>') + '</td></tr>'; }).join('') + '</tbody></table>';
    }
    return h + '<p class="foot">Field data comes from real Chrome users who opted in to usage statistics, so a page appears only with enough traffic; “No field data” is not a fault. Search Console’s own Core Web Vitals report has no API; this is the same underlying dataset (Chrome UX Report). The weekly history covers up to 40 weeks.</p>';
  }

  /* ---- expected vs actual (computed by the worker: weekly totals against a seasonal baseline +/- two sigma) ---- */
  var EXL = { clicks: 'Clicks', impressions: 'Impressions', nonbrand: 'Non-brand clicks', brand: 'Brand clicks' };
  function exChart(e, label) {
    var rows = e && e.weeks ? e.weeks : []; if (rows.length < 10) return '';
    var W = 760, H = 250, L = 52, R = 14, T = 14, B = 28, n = rows.length, max = 1;
    rows.forEach(function (r) { max = Math.max(max, r.v, r.hi || 0); });
    var x = function (i) { return L + (W - L - R) * i / (n - 1); }, y = function (v) { return T + (H - T - B) * (1 - v / max); };
    var f = function (v) { return v >= 10000 ? Math.round(v / 1000) + 'k' : fmt(v); }, g = '';
    for (var t = 0; t <= 4; t++) { var yy = T + (H - T - B) * (1 - t / 4); g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" stroke="#e2e2dc"/><text x="' + (L - 6) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="11" fill="#3d3d3d">' + f(max * t / 4) + '</text>'; }
    rows.forEach(function (r, i) { if (i % 8 === 0) g += '<text x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="#3d3d3d">' + MN[+r.k.slice(5, 7) - 1] + ' ' + r.k.slice(2, 4) + '</text>'; });
    var idx = []; rows.forEach(function (r, i) { if (r.lo != null) idx.push(i); });
    if (idx.length) g += '<polygon fill="#34517A" opacity=".13" points="' + idx.map(function (i) { return x(i).toFixed(1) + ',' + y(rows[i].hi).toFixed(1); }).concat(idx.slice().reverse().map(function (i) { return x(i).toFixed(1) + ',' + y(rows[i].lo).toFixed(1); })).join(' ') + '"/>' +
      '<polyline fill="none" stroke="#34517A" stroke-width="1.4" stroke-dasharray="5 4" points="' + idx.map(function (i) { return x(i).toFixed(1) + ',' + y(rows[i].exp).toFixed(1); }).join(' ') + '"/>';
    g += '<polyline fill="none" stroke="#0a0a0a" stroke-width="2.4" stroke-linejoin="round" points="' + rows.map(function (r, i) { return x(i).toFixed(1) + ',' + y(r.v).toFixed(1); }).join(' ') + '"/>';
    rows.forEach(function (r, i) { if (r.flag) g += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(r.v).toFixed(1) + '" r="4.2" fill="' + (r.flag === 'below' ? '#b3261e' : '#1b7a3d') + '"/>'; });
    return '<div class="chart"><div class="cl">' + esc(label) + ' per week against the expected range</div><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(label) + ' per week against the expected range">' + g + '</svg><div class="leg"><span><i style="background:#0a0a0a"></i>Actual</span><span><i style="background:#34517A;opacity:.35"></i>Expected range (dashed: expected)</span><span><i style="background:#b3261e;border-radius:50%"></i>Below the range</span><span><i style="background:#1b7a3d;border-radius:50%"></i>Above the range</span></div></div>';
  }
  function exSentence(label, e) {
    var s = e && e.summary; if (!s || s.exp == null) return '';
    var st = s.flag === 'below' ? '<b class="bad">below the expected range</b>' : s.flag === 'above' ? '<b class="ok">above the expected range</b>' : '<b>within the normal range</b>';
    return label + ', week of ' + dLong(s.week) + ': <b>' + fmt(s.actual) + '</b> against <b>' + fmt(s.exp) + '</b> expected (range ' + fmt(s.lo) + ' to ' + fmt(s.hi) + '), ' + st + ' (' + (s.pct >= 0 ? '+' : '') + s.pct + '%).' + (s.streak >= 2 ? ' ' + s.streak + ' weeks in a row below.' : '');
  }
  function exShifts(label, e) {
    var sh = e && e.summary ? e.summary.shifts : []; if (!sh || !sh.length) return '';
    return '<ul>' + sh.map(function (x) { return '<li>' + esc(label) + ': below the expected range for <b>' + x.weeks + ' weeks</b> from the week of <b>' + dLong(x.start) + '</b>, at worst <b>' + Math.abs(x.worst) + '%</b> under what the weeks before predicted. Three or more weeks in a row is a real shift, not a dip.</li>'; }).join('') + '</ul>';
  }
  function expectedSection(exp, opts) {
    if (!exp) return '';
    var keys = opts && opts.metric ? [opts.metric] : ['clicks', 'impressions', 'nonbrand'].filter(function (k) { return exp[k]; });
    var h = (opts && opts.noTitle ? '' : '<h2>Expected vs actual</h2>');
    h += '<p class="sub">Each week’s expected value is the average of the eight weeks before it, adjusted by last year’s seasonal shape where a year of history exists. The shaded range is two standard deviations: how far weeks usually stray from that expectation plus the natural noise of small counts. A point outside it is more than normal variation.</p>';
    keys.forEach(function (k) {
      var e = exp[k]; if (!e) return;
      if (!e.summary) { h += '<p class="sub">' + esc(EXL[k]) + ': ' + esc(e.note || 'not enough data yet') + '</p>'; return; }
      h += '<p style="margin:8px 0 4px">' + exSentence(EXL[k], e) + '</p>' + exChart(e, EXL[k]) + exShifts(EXL[k], e);
    });
    var seasonal = keys.some(function (k) { return exp[k] && exp[k].weeks && exp[k].weeks.some(function (w) { return w.seasonal; }); });
    return h + '<p class="foot">' + (seasonal ? 'Seasonal adjustment only applies to weeks that have a full year of history behind them (about the last ' + Math.max(...keys.map(function (k) { return exp[k] && exp[k].weeks ? exp[k].weeks.filter(function (w) { return w.seasonal; }).length : 0; })) + ' weeks); earlier weeks are compared with the recent level alone, so the range is wider and less precise. ' : 'There is not yet a full year of history, so no seasonal adjustment is applied; weeks are compared with the recent level alone. ') + 'The baseline follows the data, so a lasting drop stops being flagged after about eight weeks: the flags show when it started, not that it is still unexplained.</p>';
  }

  function monthsSection(months) {
    if (!months || !months.length) return '';
    return '<h2>Saved days, by month</h2><p class="sub">Days Brand Checker saved before Google deleted them. A month marked partial has fewer saved days than the month has.</p><table><thead><tr><th>Month</th><th>Clicks</th><th>Impressions</th><th>CTR</th><th>Avg position</th><th>Days saved</th></tr></thead><tbody>'
      + months.slice().reverse().map(function (m) { var full = new Date(Date.UTC(+m.k.slice(0, 4), +m.k.slice(5), 0)).getUTCDate(); return '<tr><td>' + esc(monLabel(m.k)) + '</td><td class="n">' + fmt(m.clicks) + '</td><td class="n">' + fmt(m.impressions) + '</td><td class="n">' + m.ctr.toFixed(2) + '%</td><td class="n">' + (m.position == null ? '—' : m.position.toFixed(1)) + '</td><td class="n">' + m.n + (m.n < full ? ' (partial)' : '') + '</td></tr>'; }).join('') + '</tbody></table>';
  }

  function pagesSection(pg) {
    if (!pg || !pg.rows || !pg.rows.length) return '';
    var rows = pg.rows, tc = 0, ti = 0, by = {};
    rows.forEach(function (r) { tc += r.clicks; ti += r.impressions; var b = by[r.kind] || (by[r.kind] = { n: 0, c: 0, i: 0, later: 0 }); b.n++; b.c += r.clicks; b.i += r.impressions; b.later += r.kind === 'moved' ? ((r.target_later && r.target_later.clicks) || 0) : (r.clicks_later || 0); });
    var lost = ['home', 'gone', 'elsewhere', 'noindex'].reduce(function (s, k) { return s + (by[k] ? by[k].c : 0); }, 0);
    var tiles = KINDS.filter(function (k) { return by[k[0]]; }).map(function (k) { var b = by[k[0]]; return '<div class="tile"><span>' + esc(k[1]) + '</span><b class="' + (k[2] === 'bad' ? 'bad' : k[2] === 'ok' ? 'ok' : '') + '">' + pct(b.c, tc) + '%</b><span>' + b.n + ' page' + (b.n === 1 ? '' : 's') + ' · ' + fmt(b.c) + ' clicks · ' + pct(b.i, ti) + '% of impressions</span></div>'; }).join('');
    var ins = [];
    if (tc) ins.push('<b>' + pct(lost, tc) + '%</b> of that month’s clicks came from pages that no longer exist as pages (homepage redirect, 404/410, another site or noindex).');
    if (by.moved && by.moved.c) ins.push('Pages that moved earned ' + fmt(by.moved.c) + ' clicks then and their new addresses earn ' + fmt(by.moved.later) + ' in the matching period a year later' + (pg.later_range ? ' (' + esc(String(pg.later_range).split(',').join(' to ')) + ')' : '') + '.');
    if (by.live && by.live.c) ins.push('Pages still live at the same address earned ' + fmt(by.live.c) + ' clicks then and ' + fmt(by.live.later) + ' in the later period.');
    var later = function (r) { var v = r.kind === 'moved' ? (r.target_later ? r.target_later.clicks : null) : r.clicks_later; return v == null ? '—' : fmt(v); };
    var trs = rows.map(function (r) { return '<tr><td>' + esc(sitePath(r.url)) + '</td><td class="n">' + fmt(r.clicks) + '</td><td class="n">' + fmt(r.impressions) + '</td><td>' + esc(r.label) + (r.final && r.final !== r.url && r.kind !== 'home' ? '<br>→ ' + esc(r.kind === 'elsewhere' ? r.final : sitePath(r.final)) : '') + '</td><td class="n">' + later(r) + '</td></tr>'; }).join('');
    return '<h2>Where the traffic went</h2><p class="sub">The <b>' + rows.length + '</b> pages that earned the most clicks in ' + esc(monLabel(pg.month)) + (pg.total > rows.length ? ' (of ' + pg.total + ' stored)' : '') + ', together <b>' + fmt(tc) + '</b> clicks and <b>' + fmt(ti) + '</b> impressions, and what each address does today.</p><div class="tiles">' + tiles + '</div>'
      + (ins.length ? '<ul>' + ins.map(function (l) { return '<li>' + l + '</li>'; }).join('') + '</ul>' : '')
      + '<table><thead><tr><th>Page</th><th>Clicks then</th><th>Impressions then</th><th>Today</th><th>Clicks later</th></tr></thead><tbody>' + trs + '</tbody></table>'
      + '<p class="foot">“Clicks then” and “Impressions then” come from the archived Search Console data. “Today” is what each address answers when requested on the snapshot date. “Clicks later” are the clicks in the matching period a year later at the same address, or at the redirect target for pages that moved.' + (pg.later_note ? ' ' + esc(pg.later_note) : '') + '</p>';
  }

  var CSS = '*{box-sizing:border-box}.gr{font-family:Helvetica,Arial,sans-serif;color:#0a0a0a;font-size:12px;line-height:1.45}.gr h1{font-size:24px;margin:0 0 2px;letter-spacing:-.01em}.gr h2{font-size:14px;margin:22px 0 6px;text-transform:uppercase;letter-spacing:.05em;border-top:3px solid #0a0a0a;padding-top:10px}'
    + '.gr p{margin:0 0 6px}.gr .meta{color:#3d3d3d;margin:0 0 6px}.gr .sub{color:#3d3d3d;margin:0 0 8px}.gr .tiles{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 10px}.gr .tile{border:2px solid #0a0a0a;padding:7px 10px;min-width:130px;flex:1}.gr .tile b{display:block;font-size:22px;letter-spacing:-.02em}.gr .tile span{display:block;color:#3d3d3d;font-size:10.5px}.gr .tile em{display:block;font-style:normal;font-size:10.5px;font-weight:700}'
    + '.gr .bad{color:#b3261e}.gr .ok{color:#1b7a3d}.gr ul{margin:0 0 8px 18px;padding:0}.gr li{margin:0 0 3px}.gr .chart{border:2px solid #0a0a0a;padding:6px 8px;margin:0 0 8px;break-inside:avoid}.gr .chart svg{width:100%;height:auto;display:block}.gr .leg{display:flex;gap:14px;font-size:10.5px;margin-top:4px}.gr .leg i{display:inline-block;width:10px;height:10px;margin-right:5px;vertical-align:-1px}.gr .b3{display:flex;height:9px;width:100%;min-width:70px;border:1px solid #0a0a0a}.gr .b3 i{display:block;height:100%}.gr .b3t{font-size:9.5px;color:#3d3d3d}.gr .cl{font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.05em}'
    + '.gr table{width:100%;border-collapse:collapse;margin-top:6px}.gr th,.gr td{border:1px solid #0a0a0a;padding:4px 6px;text-align:left;vertical-align:top;word-break:break-word;font-size:10.5px}.gr th{background:#0a0a0a;color:#fff;font-size:9.5px;text-transform:uppercase}.gr td.n{text-align:right;white-space:nowrap}.gr tr{break-inside:avoid}.gr thead{display:table-header-group}.gr .foot{margin-top:8px;color:#3d3d3d;font-size:10px}.gr .end{margin-top:22px;border-top:3px solid #0a0a0a;padding-top:8px;color:#3d3d3d;font-size:10px}';

  function render(s) {
    var site = String(s.site || '').replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    var trend = (s.trend || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var kind = s.kind || 'full', focus = s.seg && (s.seg.segments || []).filter(function (x) { return x.id === s.focus; })[0];
    var title = kind === 'core' ? 'Core terms' : kind === 'focus' && focus ? focus.name + ' traffic' : 'Search Console report';
    var dataTo = s.seg && s.seg.total && s.seg.total.length ? s.seg.total[s.seg.total.length - 1].date : (trend.length ? trend[trend.length - 1].date : '');
    var h = '<div class="gr"><h1>' + esc(site) + ': ' + esc(title.toLowerCase() === 'search console report' ? 'Search Console report' : title) + '</h1><p class="meta">Snapshot taken ' + esc(String(s.created || '').slice(0, 10)) + (dataTo ? ' · data up to ' + dLong(dataTo) : '') + '</p>';
    if (kind === 'core') h += s.seg ? segCore(s.seg) : '<p>No data.</p>';
    else if (kind === 'focus') h += s.seg ? segFocus(s.seg, s.focus) : '<p>No data.</p>';
    else {
      if (trend.length >= 28) h += headline(trend) + trendSection(trend) + typesSection(trend, s.trend_types);
      h += expectedSection(s.expected);
      h += cwvSection(s.cwv);
      h += brandSection(s.brand);
      if (s.seg) { h += segCore(s.seg); (s.seg.segments || []).filter(function (x) { return x.kind === 'focus'; }).forEach(function (x) { h += segFocus(s.seg, x.id); }); }
      h += monthsSection(s.months) + pagesSection(s.pages);
    }
    h += '<p class="end">Figures are from Google Search Console for ' + esc(site) + '. Days older than Google’s 16-month window come from Brand Checker’s archive. Search Console’s own daily totals can differ slightly from the sum of query rows. Generated by Brand Checker (brandchecker.eu).</p></div>';
    return h;
  }
  window.GscReport = { render: render, css: CSS, esc: esc, seg: { core: segCore, focus: segFocus }, cwv: cwvSection, expected: expectedSection, brand: { all: bAll, weeks: bWeeks, months: bMonths, sum: sum, stats: bStats, chart: bChart } };
})();
