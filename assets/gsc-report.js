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
    + '.gr .bad{color:#b3261e}.gr .ok{color:#1b7a3d}.gr ul{margin:0 0 8px 18px;padding:0}.gr li{margin:0 0 3px}.gr .chart{border:2px solid #0a0a0a;padding:6px 8px;margin:0 0 8px;break-inside:avoid}.gr .chart svg{width:100%;height:auto;display:block}.gr .cl{font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.05em}'
    + '.gr table{width:100%;border-collapse:collapse;margin-top:6px}.gr th,.gr td{border:1px solid #0a0a0a;padding:4px 6px;text-align:left;vertical-align:top;word-break:break-word;font-size:10.5px}.gr th{background:#0a0a0a;color:#fff;font-size:9.5px;text-transform:uppercase}.gr td.n{text-align:right;white-space:nowrap}.gr tr{break-inside:avoid}.gr thead{display:table-header-group}.gr .foot{margin-top:8px;color:#3d3d3d;font-size:10px}.gr .end{margin-top:22px;border-top:3px solid #0a0a0a;padding-top:8px;color:#3d3d3d;font-size:10px}';

  function render(s) {
    var site = String(s.site || '').replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    var trend = (s.trend || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var h = '<div class="gr"><h1>' + esc(site) + ': Search Console report</h1><p class="meta">Snapshot taken ' + esc(String(s.created || '').slice(0, 10)) + (trend.length ? ' · data up to ' + dLong(trend[trend.length - 1].date) : '') + '</p>';
    if (trend.length >= 28) h += headline(trend) + trendSection(trend) + typesSection(trend, s.trend_types);
    h += monthsSection(s.months) + pagesSection(s.pages);
    h += '<p class="end">Figures are from Google Search Console for ' + esc(site) + '. Days older than Google’s 16-month window come from Brand Checker’s archive. Search Console’s own daily totals can differ slightly from the sum of query rows. Generated by Brand Checker (brandchecker.eu).</p></div>';
    return h;
  }
  window.GscReport = { render: render, css: CSS, esc: esc };
})();
