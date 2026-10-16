/* B2B SaaS comparison keywords — a panel for the pages that take a keyword list (rank scheduler, rank snapshot).
   Software buyers choose between products with searches like "<you> vs <rival>" and "<rival> alternatives"; this writes
   those from your product name and competitors and adds them to the keyword box, so the weekly report shows where your
   site ranks for the searches that decide a deal. No search is made here — it only fills the box.
   Loaded at the end of a page that has #keywords (and, optionally, #website). Styled with the page's own CSS variables. */
(function () {
  var kw = document.getElementById('keywords');
  if (!kw) return;
  var field = kw.closest('.field') || kw.parentNode;
  // The page's own limit ("up to 20" on the scheduler, "up to 10" on the snapshot).
  var MAX = +((field.textContent.match(/up to (\d+)/i) || [])[1]) || 20;
  var box = document.createElement('div');
  box.style.cssText = 'border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:0 0 18px;background:var(--card)';
  box.innerHTML =
    '<div style="font-family:\'Archivo\',\'Space Grotesk\',sans-serif;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:4px">B2B SaaS comparison keywords</div>' +
    '<p style="font-size:12px;color:var(--muted);margin:0 0 12px;line-height:1.55">The searches buyers use when they are choosing between products. Add your competitors and we write the keywords — “you vs rival”, “rival alternatives” and your own pricing and review searches — into the box below.</p>' +
    '<label style="display:block;font-size:11px;color:var(--muted);margin:0 0 5px">Your product name</label>' +
    '<input id="sk_you" type="text" maxlength="60" placeholder="e.g. Acme" style="width:100%;margin:0 0 10px;font:inherit;font-size:14px;color:var(--ink);background:var(--paper);border:1px solid var(--line);border-radius:7px;padding:9px 11px">' +
    '<label style="display:block;font-size:11px;color:var(--muted);margin:0 0 5px">Competitors — up to 5, one per line (names or websites)</label>' +
    '<textarea id="sk_comp" rows="3" placeholder="HubSpot&#10;salesforce.com&#10;Zoho" style="width:100%;margin:0 0 10px;font:inherit;font-size:14px;color:var(--ink);background:var(--paper);border:1px solid var(--line);border-radius:7px;padding:9px 11px;resize:vertical"></textarea>' +
    '<label style="display:flex;gap:8px;align-items:center;font-size:12px;color:var(--ink);margin:0 0 5px"><input type="checkbox" style="width:auto;margin:0;flex:none;padding:0" id="sk_vs" checked> “you vs rival”</label>' +
    '<label style="display:flex;gap:8px;align-items:center;font-size:12px;color:var(--ink);margin:0 0 5px"><input type="checkbox" style="width:auto;margin:0;flex:none;padding:0" id="sk_alt" checked> “rival alternatives”</label>' +
    '<label style="display:flex;gap:8px;align-items:center;font-size:12px;color:var(--ink);margin:0 0 5px"><input type="checkbox" style="width:auto;margin:0;flex:none;padding:0" id="sk_own" checked> your own “pricing”, “reviews” and “alternatives”</label>' +
    '<label style="display:flex;gap:8px;align-items:center;font-size:12px;color:var(--ink);margin:0 0 12px"><input type="checkbox" style="width:auto;margin:0;flex:none;padding:0" id="sk_price"> “rival pricing”</label>' +
    '<button type="button" id="sk_go" style="font:inherit;font-size:12px;font-weight:700;color:var(--ink);background:none;border:1px solid var(--ink);border-radius:7px;padding:8px 14px;cursor:pointer">Add comparison keywords</button> <span id="sk_msg" style="font-size:12px;color:var(--muted);margin-left:8px"></span>';
  field.parentNode.insertBefore(box, field);

  var $ = function (id) { return document.getElementById(id); };
  var nameOf = function (s) {
    var x = String(s).trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
    return /\./.test(x) ? x.split('.')[0].replace(/^./, function (c) { return c.toUpperCase(); }) : x;
  };
  $('sk_go').onclick = function () {
    var site = ($('website') && $('website').value) || '';
    var you = $('sk_you').value.trim() || (site ? nameOf(site) : '');
    var rivals = $('sk_comp').value.split('\n').map(nameOf).filter(Boolean).slice(0, 5);
    var msg = $('sk_msg');
    if (!you) { msg.textContent = 'Enter your product name (or your website above).'; return; }
    if (!rivals.length && !$('sk_own').checked) { msg.textContent = 'Add at least one competitor.'; return; }
    var list = [];
    if ($('sk_vs').checked) rivals.forEach(function (r) { list.push(you + ' vs ' + r); });
    if ($('sk_alt').checked) rivals.forEach(function (r) { list.push(r + ' alternatives'); });
    if ($('sk_own').checked) list.push(you + ' pricing', you + ' reviews', you + ' alternatives');
    if ($('sk_price').checked) rivals.forEach(function (r) { list.push(r + ' pricing'); });
    list = list.map(function (k) { return k.toLowerCase(); });
    var cur = kw.value.split('\n').map(function (k) { return k.trim(); }).filter(Boolean);
    var have = {}; cur.forEach(function (k) { have[k.toLowerCase()] = 1; });
    var added = 0, skipped = 0;
    list.forEach(function (k) {
      if (have[k]) return;
      if (cur.length >= MAX) { skipped++; return; }
      cur.push(k); have[k] = 1; added++;
    });
    kw.value = cur.join('\n');
    kw.dispatchEvent(new Event('input', { bubbles: true }));
    msg.textContent = added ? 'Added ' + added + ' keyword' + (added > 1 ? 's' : '') + '.' + (skipped ? ' ' + skipped + ' more didn’t fit the ' + MAX + '-keyword limit.' : '') : (skipped ? 'The ' + MAX + '-keyword limit is full.' : 'Those keywords are already in the box.');
  };
})();
