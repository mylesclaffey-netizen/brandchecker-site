/* Brand Checker presets — pre-filled tool inputs, switched on by ?preset=<name>.
   brandchecker.eu/make sets preset=make for every tool it opens; without a preset
   this file does nothing and the tools show their neutral examples.

   One copy of each tool, many presets: to add another company, add an entry to
   PRESETS (and a page like /make/ that turns it on). Loaded at the end of each
   tool page, after the page's own script, so it sets values on a ready page. */
(function () {
  var MAKE_COMPETITORS = ['zapier.com', 'n8n.io', 'workato.com'];
  var URL_FIELD = { url: 'https://make.com' };

  var PRESETS = {
    make: {
      home: '/make/',
      tools: {
        'ai-mentions':      { fields: { brand: 'Make' } },
        'backlinks':        { fields: { website: 'make.com', comp1: MAKE_COMPETITORS[0], comp2: MAKE_COMPETITORS[1], comp3: MAKE_COMPETITORS[2] }, checks: ['compToggle'], show: ['compBox'] },
        'brand-bidding':    { fields: { site: 'make.com', brand: 'Make', comp1: MAKE_COMPETITORS[0], comp2: MAKE_COMPETITORS[1], comp3: MAKE_COMPETITORS[2] } },
        'brand-builder':    { fields: { homepage: 'make.com', brandName: 'Make', keywords: 'workflow automation', competitors: MAKE_COMPETITORS.join('\n') } },
        'brand-footprint':  { fields: { website: 'make.com', brandName: 'Make' } },
        'brand-questions':  { fields: { brand: 'Make' } },
        'brand-sentiment':  { fields: { brand: 'Make', website: 'make.com' } },
        'crawler-check':    { fields: URL_FIELD },
        'eeat-audit':       { fields: URL_FIELD },
        'hreflang-audit':   { fields: URL_FIELD },
        'image-audit':      { fields: URL_FIELD },
        'locale-audit':     { fields: URL_FIELD },
        'schema-audit':     { fields: URL_FIELD },
        'ua-compare':       { fields: URL_FIELD },
        'sitemap-audit':    { fields: URL_FIELD },
        'sitemap-generator': { fields: URL_FIELD },
        'llms-txt':         { fields: { siteName: 'Make' } },
        'schema-builder':   { fields: { orgName: 'Make', orgUrl: 'https://make.com' } },
        'rank-check':       { fields: { site: 'make.com', kw: 'workflow automation' }, after: function () { call('renderRows'); call('schedule'); } },
        'rank-scheduler':   { fields: { website: 'make.com', keywords: 'workflow automation' } },
        'rank-snapshot':    { fields: { website: 'make.com', keywords: 'workflow automation' } },
        'redirect-check':   { fields: { website: 'make.com' } },
        'redirect-tracer':  { fields: { domain: 'make.com' } },
        'serp-preview':     { fields: { kw: 'workflow automation' } },
        'share-of-search':  { fields: { site: 'make.com', brand: 'Make', cat: 'workflow automation', comp1: MAKE_COMPETITORS[0], comp2: MAKE_COMPETITORS[1], comp3: MAKE_COMPETITORS[2] } },
        'state-of-the-union': { fields: { brandName: 'Make' } },
        'traffic-estimate': { fields: { website: 'make.com', comp1: MAKE_COMPETITORS[0], comp2: MAKE_COMPETITORS[1], comp3: MAKE_COMPETITORS[2] }, checks: ['compToggle'], show: ['compBox'] },
        'grid-check':       { fields: { biz: 'Make', kw: 'workflow automation' } },
        'pin-check':        { fields: { addr: 'Prague, Czechia', kw1: 'workflow automation' } },
        'pagespeed': {
          fields: { 'you-url': 'https://make.com' },
          after: function () {
            // The page starts with one empty competitor row; replace it so all three fit under the limit.
            document.getElementById('competitors').innerHTML = '';
            document.getElementById('addComp').style.display = '';
            [['Zapier', 'https://zapier.com'], ['n8n', 'https://n8n.io'], ['Workato', 'https://workato.com']].forEach(function (c) {
              call('addCompetitorRow');
              var row = document.getElementById('competitors').lastElementChild;
              if (!row) return;
              row.querySelector('.comp-label').value = c[0];
              row.querySelector('.comp-url').value = c[1];
            });
          }
        },
        // Make's own Google listing (Menclova 2538/2, Prague 8; website make.com).
        // The place ID is all a review link needs, so no Places lookup is made.
        'review-link': {
          after: function () {
            try {
              selectedName = 'Make';
              selectedPlaceId = 'ChIJa-IxelaTC0cRzpk5awgZmvU';
              document.getElementById('biz').value = 'Make';
              document.getElementById('acBadge').classList.add('show');
              updateGoButton();
            } catch (e) {}
          }
        }
      }
    }
  };

  function call(name) {
    try { if (typeof window[name] === 'function') window[name](); } catch (e) {}
  }

  var presetName = new URLSearchParams(location.search).get('preset');
  var preset = presetName && PRESETS[presetName];
  if (!preset) return;

  // Keep the preset when moving between pages, and send "Back to tools" to the
  // preset's own home rather than the neutral root.
  document.querySelectorAll('a[href^="/"]').forEach(function (a) {
    try {
      var u = new URL(a.getAttribute('href'), location.origin);
      if (u.pathname === '/' && preset.home) { u.pathname = preset.home; }
      else if (!u.searchParams.has('preset')) { u.searchParams.set('preset', presetName); }
      a.setAttribute('href', u.pathname + u.search + u.hash);
    } catch (e) {}
  });

  var m = location.pathname.match(/\/tools\/([^\/]+)\//);
  var cfg = m && preset.tools[m[1]];
  if (!cfg) return;
  // A saved report (?id= / ?r=) is showing someone's real results — never overwrite its form.
  var q = new URLSearchParams(location.search);
  if (q.get('id') || q.get('r') || q.get('report')) return;

  Object.keys(cfg.fields || {}).forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = cfg.fields[id];
  });
  (cfg.checks || []).forEach(function (id) { var el = document.getElementById(id); if (el) el.checked = true; });
  (cfg.show || []).forEach(function (id) { var el = document.getElementById(id); if (el) el.style.display = 'block'; });
  if (cfg.after) cfg.after();
})();
