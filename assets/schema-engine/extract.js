// Copied from seo-tools-api/src/schema-engine/ by scripts/publish-schema-engine.mjs. Edit it there, not here.
// Structured data out of an HTML page: JSON-LD blocks, Microdata items and RDFa (Lite) items, plus the page's visible
// text for the content checks. Part of the schema engine (engine.js), and like it, plain JavaScript with no imports,
// so the worker (src/schemaAudit.js) and the browser (each site's /assets/schema-engine/) run the same code.
//
// A small tokenizer rather than a DOM: Workers have no DOMParser, and one parser in both places means a page gives the
// same result in the browser's "paste code" mode as in the worker's "page URL" mode. It follows the HTML rules that
// matter here: script/style/textarea/title contents are raw text (a script ends at the first "</script", as in a
// browser), void elements have no end tag, and an unmatched end tag is ignored.

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title', 'noscript', 'template']);
const HIDDEN = new Set(['script', 'style', 'noscript', 'template', 'head', 'title']);
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', euro: '€', pound: '£', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function parseAttrs(src) {
  const attrs = {};
  const re = /([^\s"'=<>`/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1].toLowerCase();
    if (!(name in attrs)) attrs[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

// Tokens: { t: 'open', name, attrs } | { t: 'close', name } | { t: 'text', text, raw? }
export function tokenize(html) {
  const out = [];
  const s = String(html);
  const lower = s.toLowerCase();
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt === -1) { out.push({ t: 'text', text: s.slice(i) }); break; }
    if (lt > i) out.push({ t: 'text', text: s.slice(i, lt) });
    if (s.startsWith('<!--', lt)) { const end = s.indexOf('-->', lt + 4); i = end === -1 ? s.length : end + 3; continue; }
    if (s[lt + 1] === '!' || s[lt + 1] === '?') { const end = s.indexOf('>', lt); i = end === -1 ? s.length : end + 1; continue; }
    const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/.exec(s.slice(lt, lt + 20000));
    if (!m) { out.push({ t: 'text', text: '<' }); i = lt + 1; continue; }
    const name = m[2].toLowerCase();
    i = lt + m[0].length;
    if (m[1]) { out.push({ t: 'close', name }); continue; }
    out.push({ t: 'open', name, attrs: parseAttrs(m[3].replace(/\/\s*$/, '')) });
    if (RAW.has(name)) {
      const end = lower.indexOf('</' + name, i);
      const stop = end === -1 ? s.length : end;
      out.push({ t: 'text', text: s.slice(i, stop), raw: true });
      out.push({ t: 'close', name });
      const gt = end === -1 ? s.length : s.indexOf('>', end);
      i = gt === -1 ? s.length : gt + 1;
    }
  }
  return out;
}

const SCHEMA = /^https?:\/\/schema\.org\/?/i;
// A schema.org type or property name from an itemtype / typeof / property value; anything else stays a full address.
const local = (v) => (SCHEMA.test(v) ? v.replace(SCHEMA, '') : /^schema:/i.test(v) ? v.slice(7) : v);

// The value an itemprop / property element carries when it is not itself an item (HTML Microdata rules). A content
// attribute wins on any element: HTML only defines it on <meta>, but Google reads it everywhere (its own examples use
// <span itemprop="price" content="1000.00">), and RDFa defines it on every element.
function attrValue(name, a) {
  if (a.content != null) return a.content;
  if (name === 'meta') return a.content ?? '';
  if (['audio', 'embed', 'iframe', 'img', 'source', 'track', 'video'].includes(name)) return a.src ?? '';
  if (['a', 'area', 'link'].includes(name)) return a.href ?? '';
  if (name === 'object') return a.data ?? '';
  if (name === 'data' || name === 'meter') return a.value ?? '';
  if (name === 'time' && a.datetime != null) return a.datetime;
  if (a.resource != null) return a.resource;
  return null; // the element's text, collected until it closes
}

function addProp(item, names, value) {
  for (const n of names) {
    if (!n) continue;
    const key = local(n);
    if (item[key] === undefined) item[key] = value;
    else if (Array.isArray(item[key])) item[key].push(value);
    else item[key] = [item[key], value];
  }
}

const words = (v) => String(v ?? '').trim().split(/\s+/).filter(Boolean);

export function extract(html) {
  const tokens = tokenize(html);
  const jsonld = [], microdata = [], rdfa = [];
  const textParts = [];
  let title = '', ogType = null;
  // Each open element: { name, md, mdText, rd, rdText, vocab, hidden }
  const stack = [];
  const top = (k) => { for (let j = stack.length - 1; j >= 0; j--) if (stack[j][k]) return stack[j][k]; return null; };
  let inJsonLd = false, inTitle = false;

  for (const tok of tokens) {
    if (tok.t === 'open') {
      const a = tok.attrs, name = tok.name;
      const frame = { name, hidden: HIDDEN.has(name) || stack.some((f) => f.hidden) || 'hidden' in a };
      if (name === 'script' && /application\/ld\+json/i.test(a.type || '')) inJsonLd = true;
      if (name === 'title' && !stack.some((f) => f.name === 'svg')) inTitle = true;
      if (name === 'meta' && /^og:type$/i.test(a.property || a.name || '')) ogType = a.content || null;

      // Microdata
      if ('itemscope' in a) {
        const item = {};
        const types = words(a.itemtype);
        if (types.length) item['@type'] = types.length === 1 ? local(types[0]) : types.map(local);
        if (a.itemid) item['@id'] = a.itemid;
        const parent = top('md');
        if ('itemprop' in a && parent) addProp(parent, words(a.itemprop), item);
        else microdata.push(item);
        frame.md = item;
      } else if ('itemprop' in a && top('md')) {
        const v = attrValue(name, a);
        if (v != null) addProp(top('md'), words(a.itemprop), v);
        else frame.mdText = { item: top('md'), names: words(a.itemprop), text: '' };
      }

      // RDFa (Lite: vocab, typeof, property, resource; schema: prefixes)
      const vocab = a.vocab ?? top('vocab');
      if (vocab != null) frame.vocab = vocab;
      const inSchema = (v) => /^schema:/i.test(v) || SCHEMA.test(v) || (vocab && SCHEMA.test(vocab));
      if ('typeof' in a) {
        const item = {};
        const types = words(a.typeof).filter(inSchema);
        if (types.length) item['@type'] = types.length === 1 ? local(types[0]) : types.map(local);
        if (a.resource) item['@id'] = a.resource;
        const parent = top('rd');
        if ('property' in a && parent) addProp(parent, words(a.property), item);
        else if (types.length) rdfa.push(item);
        frame.rd = item;
      } else if ('property' in a && top('rd')) {
        const props = words(a.property).filter(inSchema);
        if (props.length) {
          const v = attrValue(name, a);
          if (v != null) addProp(top('rd'), props, v);
          else frame.rdText = { item: top('rd'), names: props, text: '' };
        }
      }
      if (!VOID.has(name)) stack.push(frame);
      else if (!frame.hidden && name === 'img' && a.alt) textParts.push(' ' + a.alt + ' ');
      continue;
    }
    if (tok.t === 'text') {
      if (inJsonLd) { jsonld.push(tok.text.trim()); continue; }
      if (inTitle) title += tok.text;
      const text = tok.raw ? tok.text : decodeEntities(tok.text);
      for (const f of stack) { if (f.mdText) f.mdText.text += text; if (f.rdText) f.rdText.text += text; }
      if (!stack.some((f) => f.hidden)) textParts.push(text);
      continue;
    }
    // close: pop to the matching element, finishing text-valued properties on the way
    if (tok.name === 'script') inJsonLd = false;
    if (tok.name === 'title') inTitle = false;
    const at = stack.map((f) => f.name).lastIndexOf(tok.name);
    if (at === -1) continue;
    while (stack.length > at) {
      const f = stack.pop();
      if (f.mdText) addProp(f.mdText.item, f.mdText.names, f.mdText.text.replace(/\s+/g, ' ').trim());
      if (f.rdText) addProp(f.rdText.item, f.rdText.names, f.rdText.text.replace(/\s+/g, ' ').trim());
      if (['p', 'div', 'li', 'td', 'th', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'article', 'tr', 'dd', 'dt'].includes(f.name)) textParts.push('\n');
    }
  }
  return {
    jsonld: jsonld.filter(Boolean),
    microdata,
    rdfa: rdfa.filter((it) => Object.keys(it).length),
    text: textParts.join(' ').replace(/[ \t\r\f\v]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim(),
    title: decodeEntities(title).replace(/\s+/g, ' ').trim() || null,
    ogType
  };
}
