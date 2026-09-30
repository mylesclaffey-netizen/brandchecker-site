#!/usr/bin/env node
/**
 * Builds make/data/search-on-off.json — the default snapshot for brandchecker.eu/make/search-on-off/, which asks one
 * prompt of the same models twice, web search off and web search on, and compares the answers.
 *
 * Two State Of The LLM Union runs (US, same prompt, same brands, 2× each): web:false and web:true. The page itself
 * can start new pairs; this script just freezes one so the page has something to show without an access code.
 *
 * Usage: CODE=<access code> [PROMPT="…"] node build-make-search-on-off.mjs       (new pair, ~$0.30)
 *        CODE=<access code> RUNS=<off id>,<on id> node build-make-search-on-off.mjs (rebuild from a finished pair)
 */
import fs from 'fs';

const API = 'https://mc2seo-tools-api.mylesclaffey.workers.dev/api';
const CODE = process.env.CODE;
if (!CODE) { console.error('Set CODE to an access code.'); process.exit(1); }

const PROMPT = process.env.PROMPT || 'How do I evaluate an AI agent platform for a mid-sized IT team?';
// Keep in step with DEFAULT_BRANDS / DEFAULT_MODELS in templates/make-search-on-off.html.
const BRANDS = { brand_name: 'Make', domain: 'make.com', aliases: ['Make.com', 'Integromat'],
  competitors: ['n8n.io', 'zapier.com', 'workato.com', { name: 'Microsoft Copilot Studio', aliases: ['Copilot Studio'], domains: ['copilotstudio.microsoft.com'] }, 'servicenow.com'] };
const PROVIDERS = ['chatgpt', 'claude', 'llama', 'mistral'];

async function api(path, body) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': 'https://brandchecker.eu', 'User-Agent': 'Mozilla/5.0 (brandchecker build script)' },
    body: JSON.stringify({ code: CODE, ...body })
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

let ids = process.env.RUNS ? process.env.RUNS.split(',') : null;
if (!ids) {
  ids = [];
  for (const web of [false, true]) {
    const r = await api('/state-of-union/submit', { ...BRANDS, prompts: [PROMPT], locations: ['United States'], providers: PROVIDERS, web, repeats: 2 });
    if (r.error) throw new Error(r.error);
    console.log('web', web ? 'on ' : 'off', r.id, '≈ $' + r.estimated_cost_usd);
    ids.push(r.id);
  }
}
const runs = [];
for (const id of ids) {
  for (let i = 0; ; i++) {
    const d = await api('/state-of-union/get', { id });
    if (d.status === 'complete') { runs.push(d); break; }
    if (i > 90) throw new Error('run ' + id + ' did not finish');
    await sleep(10000);
  }
}
// The page reads exactly what /state-of-union/get returns, so a live pair and the snapshot render the same way.
const [off, on] = runs;
fs.writeFileSync('make/data/search-on-off.json', JSON.stringify({ created_at: new Date().toISOString(), off, on }));
for (const [label, d] of [['off', off], ['on', on]]) {
  const cells = d.cells.filter(c => c.status === 'done' && c.result?.text);
  const make = cells.filter(c => (c.mentions || []).some(m => m.name === 'Make' && m.mentioned)).length;
  console.log(`web ${label}: $${d.total_cost} · ${cells.length} answers · Make named in ${make} · sources in ${cells.filter(c => (c.result.sources || []).length).length}`);
  for (const c of cells) console.log('  ', c.provider.padEnd(8), c.rep, (c.mentions || []).filter(m => m.mentioned).map(m => m.name).join(', ') || '—', '·', c.result.text.length, 'chars ·', (c.result.sources || []).length, 'sources');
}
