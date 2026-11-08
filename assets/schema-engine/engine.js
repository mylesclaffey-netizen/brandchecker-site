// Copied from seo-tools-api/src/schema-engine/ by scripts/publish-schema-engine.mjs. Edit it there, not here.
// The schema engine: checks structured data (JSON-LD, Microdata, RDFa) against the schema.org vocabulary (vocab.json,
// refreshed by scripts/update-schema-vocab.mjs) and Google's rich result rules (google.json, kept by hand), and checks
// the claims in it against the page's visible text. Plain JavaScript with one import (extract.js), so the same file
// runs in the worker (src/schemaAudit.js, "page URL" mode) and in the browser (each site's /assets/schema-engine/,
// "paste code" mode, copied there by scripts/publish-schema-engine.mjs). Tests: test/schemaEngine.test.js.
//
//   const engine = createEngine({ vocab, google });
//   engine.validateHtml(html)        // a whole page: every format, plus the content checks
//   engine.validateText(text)        // pasted code: JSON-LD on its own, or HTML
//
// The report: { engine, found, items: [{ source, types, name, data, issues, features }], issues, features, summary }.
// Issue levels: error (invalid, or blocks a rich result), warning (works, but likely wrong or soon to break), info.

import { extract } from './extract.js';

export const ENGINE_VERSION = '1.0.0';

const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const empty = (v) => v == null || v === '' || (Array.isArray(v) && v.every(empty)) || (isObj(v) && '@value' in v && empty(v['@value']));
const SCHEMA = /^https?:\/\/schema\.org\/?/i;
const localName = (s) => (typeof s !== 'string' ? s : SCHEMA.test(s) ? s.replace(SCHEMA, '') : /^schema:/i.test(s) ? s.slice(7) : s);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const ISO_TIME = /^\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const ISO_DURATION = /^P(?!$)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$/;
const MAX_ISSUES_PER_ITEM = 200;

function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

export function createEngine({ vocab, google }) {
  const { types, properties, enumerations = {} } = vocab;
  const rules = google || { features: [], retired: [], shared: {}, aliases: {} };
  const aliases = rules.aliases || {};
  const memo = new Map();
  function ancestors(t) {
    if (memo.has(t)) return memo.get(t);
    const out = new Set([t]);
    memo.set(t, out);
    for (const p of types[t]?.parents || []) for (const a of ancestors(p)) out.add(a);
    return out;
  }
  const isA = (t, of) => !!types[t] && ancestors(t).has(of);
  const depth = (t) => ancestors(t).size;
  const lowerTypes = new Map(Object.keys(types).map((k) => [k.toLowerCase(), k]));
  const lowerProps = new Map(Object.keys(properties).map((k) => [k.toLowerCase(), k]));
  const enumValues = new Map(); // enumeration -> Set of its values, including those of its sub-enumerations
  const valuesOf = (e) => {
    if (!enumValues.has(e)) {
      const s = new Set(enumerations[e] || []);
      for (const [t, def] of Object.entries(types)) if (def.parents.includes(e)) for (const v of valuesOf(t)) s.add(v);
      enumValues.set(e, s);
    }
    return enumValues.get(e);
  };

  // "Did you mean": a case slip first (localbusiness -> LocalBusiness), then a close spelling.
  function suggest(name, kind) {
    const pool = kind === 'type' ? types : properties;
    const lower = (kind === 'type' ? lowerTypes : lowerProps).get(String(name).toLowerCase());
    if (lower) return lower;
    const max = name.length < 6 ? 1 : 2;
    let best = null, bestD = max + 1;
    for (const k of Object.keys(pool)) {
      const d = editDistance(name.toLowerCase(), k.toLowerCase(), max);
      if (d < bestD) { best = k; bestD = d; }
    }
    return best;
  }

  function retiredIssue(kind, name, term) {
    if (term.supersededBy) return { level: 'error', code: 'retired', message: `${kind} "${name}" was retired by schema.org; use ${term.supersededBy.join(' or ')} instead.` };
    if (term.deprecated) return { level: 'warning', code: 'deprecated', message: `${kind} "${name}" is described as deprecated by schema.org.` };
    if (term.status === 'pending') return { level: 'info', code: 'pending', message: `${kind} "${name}" is still pending at schema.org, so it may change and most search engines ignore it.` };
    return null;
  }

  // ---------- one node, recursively: schema.org validity ----------
  function checkNode(node, path, add, ids, seen) {
    if (seen.has(node)) return;
    seen.add(node);
    const ts = list(node['@type']);
    if (!ts.length && path) add({ level: 'info', code: 'no-type', path, message: 'This nested value has no @type, so it is read loosely. Give it a type (for example PostalAddress for an address).' });
    for (const raw of ts) {
      if (typeof raw !== 'string') { add({ level: 'error', code: 'bad-type', path, message: '@type must be text, such as "Product".' }); continue; }
      if (/data-vocabulary\.org/i.test(raw)) { add({ level: 'error', code: 'data-vocabulary', path, message: `"${raw}" is from data-vocabulary.org, which Google stopped reading in 2021. Use schema.org instead.` }); continue; }
      if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) { add({ level: 'info', code: 'other-vocabulary', path, message: `"${raw}" is not a schema.org type (it is from another vocabulary), so it is not checked.` }); continue; }
      const def = types[raw];
      if (!def) { const s = suggest(raw, 'type'); add({ level: 'error', code: 'unknown-type', path, message: `"${raw}" is not a schema.org type${s ? `. Did you mean "${s}"?` : '.'}${s && s.toLowerCase() === raw.toLowerCase() ? ' Names are case-sensitive.' : ''}` }); continue; }
      const r = retiredIssue('Type', raw, def);
      if (r) add({ ...r, path });
    }
    const known = ts.length > 0 && ts.every((t) => types[t]);
    for (const [rawKey, value] of Object.entries(node)) {
      if (rawKey.startsWith('@')) continue;
      const key = localName(rawKey);
      const at = path ? `${path}.${key}` : key;
      if (/^[a-z][a-z0-9+.-]*:/i.test(key) && !SCHEMA.test(rawKey)) continue; // another vocabulary's property
      let name = key.replace(/-(input|output)$/, '');
      const actionInput = name !== key;
      if (aliases[name]) {
        add({ level: 'warning', code: 'google-alias', path: at, message: `"${name}" is how Google's documentation spells it, and Google reads it; schema.org's name is "${aliases[name]}".` });
        name = aliases[name];
      }
      const p = properties[name];
      if (!p) {
        const s = suggest(name, 'property');
        add({ level: 'error', code: 'unknown-property', path: at, message: `"${name}" is not a schema.org property${s ? `. Did you mean "${s}"?` : '.'}${s && s.toLowerCase() === name.toLowerCase() ? ' Names are case-sensitive.' : ''}` });
      } else {
        const r = retiredIssue('Property', name, p);
        if (r) add({ ...r, path: at });
        if (known && !actionInput && p.domain.length && !ts.some((t) => p.domain.some((d) => isA(t, d)))) {
          const where = p.domain.length > 5 ? `${p.domain.slice(0, 5).join(', ')} and others` : p.domain.join(', ');
          add({ level: 'error', code: 'wrong-property', path: at, message: `"${name}" is not a property of ${ts.join(' + ')}. schema.org expects it on ${where}.` });
        }
      }
      for (const [i, v0] of list(value).entries()) {
        const vAt = Array.isArray(value) && value.length > 1 ? `${at}[${i}]` : at;
        if (v0 === '' ) { add({ level: 'warning', code: 'empty', path: vAt, message: 'Empty value: search engines treat it as missing.' }); continue; }
        if (isObj(v0) && '@value' in v0) { if (p && !actionInput) checkScalar(v0['@value'], p, name, vAt, add); continue; }
        if (isObj(v0)) {
          const ref = Object.keys(v0).every((k) => k === '@id' || k === '@type') && v0['@id'];
          const target = ref ? ids.get(v0['@id']) || v0 : v0;
          const vts = list(target['@type']);
          if (p && !actionInput && vts.length && vts.every((t) => types[t]) && p.range.length
              && !vts.some((t) => isA(t, 'Role') || p.range.some((rg) => isA(t, rg)))) {
            add({ level: 'error', code: 'wrong-value-type', path: vAt, message: `"${name}" holds a ${vts.join(' + ')}, but schema.org expects ${p.range.join(' or ')}.` });
          }
          if (!ref) checkNode(v0, vAt, add, ids, seen);
          continue;
        }
        if (p && !actionInput) checkScalar(v0, p, name, vAt, add);
      }
    }
  }

  // A text, number or true/false value against what the property expects. Text is accepted wherever schema.org lists
  // Text; otherwise dates, times, durations, URLs, numbers and fixed lists (enumerations) must be in their format.
  function checkScalar(v, p, name, at, add) {
    const range = p.range;
    // Text, or a kind of Text other than URL (CssSelectorType, XPathType, PronounceableText): any text will do.
    if (!range.length || range.some((r) => r !== 'URL' && isA(r, 'Text'))) return;
    const s = typeof v === 'string' ? v.trim() : v;
    const enums = range.filter((r) => isA(r, 'Enumeration'));
    if (enums.length && typeof s === 'string') {
      const val = localName(s);
      if (enums.some((e) => valuesOf(e).has(val))) return;
      if (!range.some((r) => ['URL', 'Date', 'DateTime', 'Time', 'Number', 'Integer', 'Boolean', 'Duration'].includes(r))) {
        const sample = [...valuesOf(enums[0])].slice(0, 3).map((x) => `https://schema.org/${x}`).join(', ');
        add({ level: 'error', code: 'bad-enum', path: at, message: `"${name}" must be one of ${enums.join(' or ')}'s values (for example ${sample}); "${s}" is not one.` });
        return;
      }
    }
    const allows = (...kinds) => range.some((r) => kinds.includes(r));
    if (typeof s === 'string') {
      if (allows('Date', 'DateTime') && (ISO_DATETIME.test(s))) return;
      if (allows('Time') && ISO_TIME.test(s)) return;
      if (allows('Duration') && ISO_DURATION.test(s)) return;
      if (allows('URL') && /^(https?:)?\/\/\S+$/i.test(s)) return;
      if (allows('Number', 'Integer', 'Float') && /^-?\d+([.,]\d+)?$/.test(s)) return;
      if (allows('Boolean') && /^(true|false|https?:\/\/schema\.org\/(True|False))$/i.test(s)) return;
      if (allows('Date', 'DateTime')) return add({ level: 'error', code: 'bad-date', path: at, message: `"${name}" should be an ISO 8601 date${allows('DateTime') ? ' or date and time' : ''} (for example 2026-05-21${allows('DateTime') ? ' or 2026-05-21T19:00+02:00' : ''}); "${s}" is not.` });
      if (allows('Time')) return add({ level: 'error', code: 'bad-time', path: at, message: `"${name}" should be a time such as 19:00:00; "${s}" is not.` });
      if (allows('Duration')) return add({ level: 'error', code: 'bad-duration', path: at, message: `"${name}" should be an ISO 8601 duration such as PT1H30M; "${s}" is not.` });
      if (allows('URL')) {
        if (/\s/.test(s) || !s) return add({ level: 'error', code: 'bad-url', path: at, message: `"${name}" should be a URL; "${s}" is not.` });
        return add({ level: 'warning', code: 'relative-url', path: at, message: `"${name}" is a relative URL ("${s}"). Search engines resolve it against the page, but a full https:// address is safer.` });
      }
      if (allows('Number', 'Integer', 'Float')) return add({ level: 'warning', code: 'bad-number', path: at, message: `"${name}" should be a number; "${s}" is not.` });
      if (allows('Boolean')) return add({ level: 'warning', code: 'bad-boolean', path: at, message: `"${name}" should be true or false; "${s}" is not.` });
      return;
    }
    // A bare number where only dates, times or URLs make sense (a year as 2026 in datePublished, say).
    if (typeof s === 'number' && !allows('Number', 'Integer', 'Float') && range.every((r) => ['Date', 'DateTime', 'Time', 'URL'].includes(r))) {
      add({ level: 'warning', code: 'number-not-expected', path: at, message: `"${name}" holds the number ${s}, but schema.org expects ${range.join(' or ')}.` });
    }
    if (typeof s === 'boolean' && !allows('Boolean')) add({ level: 'warning', code: 'boolean-not-expected', path: at, message: `"${name}" holds ${s}, but schema.org expects ${range.join(' or ')}.` });
  }

  // ---------- Google rich results ----------
  const resolveWith = (ids) => (v) => (isObj(v) && v['@id'] && Object.keys(v).every((k) => k === '@id' || k === '@type') ? ids.get(v['@id']) || v : v);
  function valuesAt(node, path, resolve) {
    let cur = [node];
    for (const seg of path.split('.')) {
      cur = cur.flatMap((n) => (isObj(n) ? list(n[seg] ?? n[`https://schema.org/${seg}`]).map(resolve) : []));
    }
    return cur.filter((v) => !empty(v));
  }
  const typesOf = (n) => (isObj(n) ? list(n['@type']).map(localName) : []);
  function hasPath(node, path, resolve, exempt) {
    const segs = path.split('.');
    if (segs.length === 1) return valuesAt(node, path, resolve).length > 0;
    let parents = valuesAt(node, segs.slice(0, -1).join('.'), resolve);
    if (exempt) parents = parents.filter((v) => !typesOf(v).some((t) => exempt.some((e) => isA(t, e))));
    if (!parents.length) return !!exempt; // every parent exempt: nothing to check
    const last = segs[segs.length - 1];
    return parents.every((v) => isObj(v) && !empty(resolve(v[last] ?? v[`https://schema.org/${last}`])));
  }

  // Missing required / oneOf / recommended paths of one rule set on one node.
  function applyRule(node, rule, resolve, prefix, out, feature) {
    const req = rule.required || [], groups = rule.oneOf || [];
    const inGroups = (seg) => groups.some((g) => g.some((p) => p.split('.')[0] === seg));
    for (const p of req) {
      const parent = p.split('.').slice(0, -1).join('.');
      if (parent && valuesAt(node, parent, resolve).length === 0) {
        if (req.includes(parent) || inGroups(p.split('.')[0])) continue;
      }
      if (!hasPath(node, p, resolve, feature?.exempt?.[p])) out.missing.push(prefix + p);
    }
    for (const g of groups) if (!g.some((p) => hasPath(node, p, resolve))) out.missing.push(g.map((p) => prefix + p).join(' or '));
    const recs = [...(rule.recommended || [])];
    for (const [t, extra] of Object.entries(rule.recommendedFor || {})) if (typesOf(node).some((x) => isA(x, t))) recs.push(...extra);
    for (const r of recs) {
      if (Array.isArray(r)) { if (!r.some((p) => hasPath(node, p, resolve))) out.recommendedMissing.push(r.map((p) => prefix + p).join(' / ')); continue; }
      const parent = r.split('.').slice(0, -1).join('.');
      if (parent && valuesAt(node, parent, resolve).length === 0 && (recs.includes(parent) || req.includes(parent))) continue;
      if (!hasPath(node, r, resolve)) out.recommendedMissing.push(prefix + r);
    }
  }

  function nestedRules(feature) {
    const merged = {};
    const addRules = (set) => {
      for (const [t, r] of Object.entries(set || {})) {
        const m = (merged[t] ||= {});
        for (const k of ['required', 'oneOf', 'recommended']) if (r[k]) m[k] = [...(m[k] || []), ...r[k]];
      }
    };
    for (const name of feature.use || []) addRules(rules.shared?.[name]);
    addRules(feature.nested);
    return merged;
  }

  function evaluateFeature(feature, node, resolve) {
    const out = { missing: [], recommendedMissing: [] };
    applyRule(node, feature, resolve, '', out, feature);
    if (feature.sequence) {
      const seq = feature.sequence;
      const els = valuesAt(node, seq.property, resolve);
      els.forEach((el, i) => {
        const r = { required: [...(seq.required || []), ...(i < els.length - 1 ? seq.requiredExceptLast || [] : [])], oneOf: seq.oneOf };
        applyRule(el, r, resolve, `${seq.property}[${i + 1}].`, out);
      });
    }
    const nested = nestedRules(feature);
    if (Object.keys(nested).length) {
      const seen = new Set([node]);
      const walk = (n, prefix) => {
        for (const [k, v] of Object.entries(n)) {
          if (k.startsWith('@')) continue;
          const vals = list(v).map(resolve);
          vals.forEach((child, i) => {
            if (!isObj(child) || seen.has(child)) return;
            seen.add(child);
            const at = `${prefix}${localName(k)}${vals.length > 1 ? `[${i + 1}]` : ''}`;
            const ts = typesOf(child);
            const match = Object.keys(nested).filter((rt) => ts.some((t) => isA(t, rt))).sort((a, b) => depth(b) - depth(a))[0];
            if (match) applyRule(child, nested[match], resolve, `${at}.`, out);
            walk(child, `${at}.`);
          });
        }
      };
      walk(node, '');
    }
    return out;
  }

  function applies(def, node) {
    const ts = typesOf(node).filter((t) => types[t]);
    if (!ts.length) return false;
    const match = ts.some((t) => (def.exact ? def.appliesTo.includes(t) : def.appliesTo.some((a) => isA(t, a))));
    if (!match || ts.some((t) => (def.except || []).some((e) => isA(t, e)))) return false;
    if (def.trigger && !def.trigger.some((p) => !empty(node[p]))) return false;
    if (def.triggerFalse) { const v = node[def.triggerFalse]; if (!(v === false || /^(false|https?:\/\/schema\.org\/False)$/i.test(String(v)))) return false; }
    if (def.triggerType) {
      return Object.entries(def.triggerType).every(([p, t]) => list(node[p]).some((v) => typesOf(v).some((x) => isA(x, t))));
    }
    return true;
  }

  // ---------- content checks: claims in the markup that should be visible on the page ----------
  const fragment = (s, len) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, len);
  function numbersIn(text) {
    const out = new Set();
    for (const m of String(text).matchAll(/\d[\d.,\s  ]*\d|\d/g)) {
      const raw = m[0].replace(/[\s  ]/g, '');
      for (const n of [raw.replace(/,/g, ''), raw.replace(/\./g, '').replace(',', '.')]) {
        const x = Number(n);
        if (Number.isFinite(x)) out.add(Math.round(x * 100) / 100);
      }
    }
    return out;
  }
  function contentChecks(node, text, add, resolve) {
    const lower = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ');
    const ts = typesOf(node);
    if (ts.some((t) => isA(t, 'FAQPage') || isA(t, 'QAPage'))) {
      for (const q of valuesAt(node, 'mainEntity', resolve)) {
        const name = isObj(q) ? list(q.name)[0] : null;
        const f = fragment(name, 40);
        if (f && !lower.includes(f)) add({ level: 'error', code: 'not-on-page', path: 'mainEntity', message: `The question "${name}" doesn't appear on the page. Google treats question markup that isn't visible as spam.` });
      }
    }
    let nums = null;
    for (const offer of valuesAt(node, 'offers', resolve)) {
      for (const price of [...valuesAt(offer, 'price', resolve), ...valuesAt(offer, 'lowPrice', resolve)]) {
        const x = Number(String(price).replace(',', '.'));
        if (!Number.isFinite(x) || x === 0) continue;
        nums ||= numbersIn(text);
        if (!nums.has(Math.round(x * 100) / 100)) add({ level: 'warning', code: 'price-not-on-page', path: 'offers.price', message: `The price ${price} doesn't appear on the page as text. Check it matches what buyers see.` });
      }
    }
  }

  // ---------- the report ----------
  function normalize(v) {
    if (Array.isArray(v)) return v.map(normalize);
    if (!isObj(v)) return v;
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      const key = k.startsWith('@') ? k : localName(k);
      out[key] = key === '@type' ? (Array.isArray(x) ? x.map(localName) : localName(x)) : normalize(x);
    }
    return out;
  }

  function validateExtracted({ jsonld = [], microdata = [], rdfa = [], text = null }) {
    const issues = [];
    const items = [];
    jsonld.forEach((raw, block) => {
      let data;
      try { data = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) {
        issues.push({ level: 'error', code: 'invalid-json', block, message: `JSON-LD block ${block + 1} isn't valid JSON, so search engines can't read any of it (${String(e.message).slice(0, 120)}).` });
        return;
      }
      for (const root of list(data)) {
        if (!isObj(root)) continue;
        const ctx = JSON.stringify(root['@context'] ?? '');
        if (!root['@context']) issues.push({ level: 'error', code: 'no-context', block, message: `JSON-LD block ${block + 1} has no @context, so its terms aren't recognised as schema.org. Add "@context": "https://schema.org".` });
        else if (!/schema\.org/i.test(ctx)) issues.push({ level: 'warning', code: 'other-context', block, message: `JSON-LD block ${block + 1} uses a @context other than schema.org (${ctx.slice(0, 80)}).` });
        const nodes = Array.isArray(root['@graph']) ? root['@graph'] : [root];
        for (const n of nodes) if (isObj(n)) items.push({ source: 'json-ld', block, data: normalize(n) });
      }
    });
    microdata.forEach((n) => items.push({ source: 'microdata', data: normalize(n) }));
    rdfa.forEach((n) => items.push({ source: 'rdfa', data: normalize(n) }));

    // Nodes defined anywhere with an @id, so references ({"@id": "#org"}) can be followed.
    const ids = new Map();
    const index = (v) => {
      if (Array.isArray(v)) return v.forEach(index);
      if (!isObj(v)) return;
      if (typeof v['@id'] === 'string' && Object.keys(v).some((k) => k !== '@id') && !ids.has(v['@id'])) ids.set(v['@id'], v);
      Object.values(v).forEach(index);
    };
    items.forEach((it) => index(it.data));
    const resolve = resolveWith(ids);

    const allFeatures = [];
    items.forEach((item, idx) => {
      const found = [];
      const add = (i) => { if (found.length < MAX_ISSUES_PER_ITEM) found.push(i); };
      const ts = typesOf(item.data);
      if (!ts.length) add({ level: 'warning', code: 'no-type', path: '', message: 'This item has no @type, so nothing can tell what it describes.' });
      checkNode(item.data, '', add, ids, new Set());
      if (text) contentChecks(item.data, text, add, resolve);
      // The item, and what it names as its main subject (a WebPage's mainEntity), can each earn rich results.
      const subjects = [{ node: item.data, path: '' }];
      for (const me of valuesAt(item.data, 'mainEntity', resolve)) if (isObj(me) && typesOf(me).length) subjects.push({ node: me, path: 'mainEntity' });
      const features = [];
      for (const { node, path } of subjects) {
        for (const f of rules.features || []) {
          if (!applies(f, node)) continue;
          const r = evaluateFeature(f, node, resolve);
          features.push({ id: f.id, name: f.name, docs: f.docs, path, status: f.status === 'limited' ? 'limited' : r.missing.length ? 'not-eligible' : 'eligible', missing: r.missing, recommendedMissing: r.recommendedMissing, note: f.note || null });
        }
        for (const f of rules.retired || []) {
          if (applies(f, node)) features.push({ id: f.id, name: f.name, path, status: 'retired', missing: [], recommendedMissing: [], note: f.message });
        }
      }
      items[idx] = {
        source: item.source, block: item.block, types: ts,
        name: [item.data.name, item.data.headline, item.data['@id']].map((v) => list(v)[0]).find((v) => typeof v === 'string') || null,
        data: item.data, issues: found, features
      };
      features.forEach((f) => allFeatures.push({ ...f, item: idx }));
    });

    if (!items.length && !issues.length) issues.push({ level: 'warning', code: 'none', message: 'No structured data found: no JSON-LD, Microdata or RDFa.' });
    const every = [...issues, ...items.flatMap((i) => i.issues)];
    const count = (l) => every.filter((i) => i.level === l).length + (l === 'error' ? allFeatures.filter((f) => f.status === 'not-eligible').length : 0);
    const names = (s) => [...new Set(allFeatures.filter((f) => f.status === s).map((f) => f.name))];
    return {
      engine: { version: ENGINE_VERSION, schemaorg: vocab.release, googleRules: rules.updatedAt || null },
      found: { jsonld: jsonld.length, microdata: microdata.length, rdfa: rdfa.length, items: items.length },
      items, issues, features: allFeatures,
      summary: {
        types: [...new Set(items.flatMap((i) => i.types))],
        errors: count('error'), warnings: count('warning'), notes: count('info'),
        eligible: names('eligible'), notEligible: names('not-eligible'), limited: names('limited'), retired: names('retired')
      }
    };
  }

  function validateHtml(html, { checkContent = true } = {}) {
    const x = extract(html);
    const report = validateExtracted({ ...x, text: checkContent ? x.text : null });
    report.page = { title: x.title, ogType: x.ogType };
    if (x.ogType && /^product/i.test(x.ogType) && !report.summary.types.some((t) => isA(t, 'Product'))) {
      report.issues.push({ level: 'warning', code: 'og-mismatch', message: `The page says og:type="${x.ogType}" but has no Product structured data. The two signals should agree.` });
      report.summary.warnings++;
    }
    return report;
  }

  // Pasted code: JSON-LD on its own (an object, a list, or several blocks), or any HTML with markup in it.
  function validateText(input) {
    const s = String(input ?? '').trim();
    if (/^[[{]/.test(s)) return validateExtracted({ jsonld: [s] });
    return validateHtml(s, { checkContent: /<(body|p|h1|h2|div)\b/i.test(s) });
  }

  return { validateHtml, validateText, validateExtracted, extract, isA, ancestors, types, properties, release: vocab.release, googleRulesUpdated: rules.updatedAt };
}
