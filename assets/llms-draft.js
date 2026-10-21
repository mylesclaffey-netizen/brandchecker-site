/* Drafts an llms.txt from a list of pages, the same way in both tools that use it: Lil Rag Chunker (in its ZIP and the
   "Edit in the llms.txt generator" hand-off) and the llms.txt generator's "Fill from my website".
   pages: [{ url, path, role, legal, title, description, first }] — role is the Worker's page type (home, pricing, …).
   The draft fits the generator's form: at most 8 sections of at most 12 links. */
(function () {
  var MAX_SECTIONS = 8, MAX_LINKS = 12, HANDOFF_KEY = 'mc2seo_llms_draft';
  var SECTION_FOR = { product: 'Product', pricing: 'Pricing', integrations: 'Integrations', comparison: 'Comparisons',
    customers: 'Customers', docs: 'Docs', security: 'Security and trust' };
  var ORDER = ['Product', 'Pricing', 'Integrations', 'Docs', 'Guides', 'Comparisons', 'Customers', 'Security and trust', 'Pages', 'Optional'];

  // "Pricing — Acme" / "Acme | Pricing" → "Pricing": drop the part that is just the brand name.
  function cleanTitle(title, brand, path) {
    var t = String(title || '').trim(), b = String(brand || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    var parts = t.split(/\s+[|—–:-]\s+/).map(function (s) { return s.trim(); }).filter(Boolean);
    var keep = parts.filter(function (s) { return s.toLowerCase().replace(/[^a-z0-9]/g, '') !== b; });
    var out = (keep.length ? keep.join(' — ') : t) || path || '/';
    return out.length > 90 ? out.slice(0, 87).replace(/\s+\S*$/, '') + '…' : out;
  }
  function note(p) {
    var n = String(p.description || p.first || '').replace(/\s+/g, ' ').trim();
    return n.length > 160 ? n.slice(0, 157).replace(/\s+\S*$/, '') + '…' : n;
  }
  var segOf = function (path) { var m = String(path || '').match(/^\/([^/]+)\/[^/]+/); return m ? m[1].toLowerCase() : ''; };
  var titleCase = function (seg) { var w = seg.replace(/[-_]+/g, ' '); return w.charAt(0).toUpperCase() + w.slice(1); };
  function sectionOf(p, shared) {
    if (p.legal) return 'Optional';
    if (SECTION_FOR[p.role]) return SECTION_FOR[p.role];
    if (/\/(?:blog|guides?|learn|resources|articles?|academy|insights)(?:\/|$)/i.test(p.path || '')) return 'Guides';
    // Pages that share a folder (/tools/…, /solutions/…) get a section named after it.
    var seg = segOf(p.path);
    if (seg && shared[seg] >= 2) return titleCase(seg);
    return 'Pages';
  }

  function build(opts) {
    var brand = opts.brand || opts.domain, groups = {}, seen = {}, shared = {}, order = ORDER.slice();
    (opts.pages || []).forEach(function (p) { var g = p && segOf(p.path); if (g) shared[g] = (shared[g] || 0) + 1; });
    (opts.pages || []).forEach(function (p) {
      if (!p || !p.url || p.role === 'home' || seen[p.url]) return;
      seen[p.url] = 1;
      var s = sectionOf(p, shared);
      if (order.indexOf(s) === -1) order.splice(order.indexOf('Pages'), 0, s);   // folder sections sit before the catch-all
      (groups[s] = groups[s] || []).push({ title: cleanTitle(p.title, brand, p.path), url: p.url, desc: note(p) });
    });
    var sections = order.filter(function (n) { return groups[n]; }).map(function (n) { return { name: n, links: groups[n] }; });
    // Fit the generator's form: overflow links and sections go to "Optional" (the convention's skippable section), then cap.
    var overflow = [];
    sections.forEach(function (s) { if (s.name !== 'Optional' && s.links.length > MAX_LINKS) overflow = overflow.concat(s.links.splice(MAX_LINKS)); });
    if (sections.length > MAX_SECTIONS) sections.splice(MAX_SECTIONS - 1).forEach(function (s) { overflow = overflow.concat(s.links); });
    if (overflow.length) {
      var opt = sections.filter(function (s) { return s.name === 'Optional'; })[0];
      if (!opt) { opt = { name: 'Optional', links: [] }; sections.push(opt); }
      opt.links = opt.links.concat(overflow);
    }
    sections.forEach(function (s) { s.links = s.links.slice(0, MAX_LINKS); });
    return { name: brand, summary: String(opts.summary || '').trim(), context: '', sections: sections };
  }

  function toMarkdown(d) {
    var md = '# ' + d.name + '\n';
    if (d.summary) md += '\n> ' + d.summary + '\n';
    if (d.context) md += '\n' + d.context + '\n';
    d.sections.forEach(function (s) {
      md += '\n## ' + s.name + '\n\n';
      s.links.forEach(function (l) { md += '- [' + l.title + '](' + l.url + ')' + (l.desc ? ': ' + l.desc : '') + '\n'; });
    });
    return md;
  }

  // Hand a draft to the llms.txt generator page (same site, so localStorage carries it; nothing is sent anywhere).
  function handoff(draft) { try { localStorage.setItem(HANDOFF_KEY, JSON.stringify(draft)); return true; } catch (e) { return false; } }
  function takeHandoff() {
    try { var s = localStorage.getItem(HANDOFF_KEY); localStorage.removeItem(HANDOFF_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }

  window.MC2LlmsDraft = { build: build, toMarkdown: toMarkdown, handoff: handoff, takeHandoff: takeHandoff, MAX_SECTIONS: MAX_SECTIONS, MAX_LINKS: MAX_LINKS };
})();
