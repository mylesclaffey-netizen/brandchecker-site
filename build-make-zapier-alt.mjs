#!/usr/bin/env node
/**
 * Builds make/data/zapier-alternatives.json for brandchecker.eu/make/zapier-alternatives/ — how AI answers people
 * who are thinking of leaving Zapier, and whether they send them to Make.
 *
 * Twelve switching questions ("best Zapier alternatives", "cheaper than Zapier", "Make vs Zapier"…) are asked on the
 * real ChatGPT app and Perplexity (twice each — these answers vary) and Google's AI Overview, in the US, through one
 * State Of The LLM Union run; Google's organic top 10 for the same question comes from the same search. Per answer:
 * which alternative it names first (Zapier itself doesn't count — it's the thing being replaced), whether and where
 * Make is named, which pages it cites. Across answers: the run's own citation, description and discovery statistics.
 *
 * Usage: CODE=<access code> node build-make-zapier-alt.mjs            (new run, ~$0.30)
 *        CODE=<access code> RUNS=<id>[,<id>] node build-make-zapier-alt.mjs   (rebuild; later finished answers win)
 */
import fs from 'fs';

const API = 'https://mc2seo-tools-api.mylesclaffey.workers.dev/api';
const CODE = process.env.CODE;
if (!CODE) { console.error('Set CODE to an access code.'); process.exit(1); }

const QUESTIONS = [
  ['Switching', 'What are the best Zapier alternatives?'],
  ['Switching', 'What is a cheaper alternative to Zapier?'],
  ['Switching', 'Zapier is getting too expensive — what should I use instead?'],
  ['Switching', 'What is the best free alternative to Zapier?'],
  ['Switching', 'What is the best open-source alternative to Zapier?'],
  ['Switching', 'What is the best Zapier alternative for small businesses?'],
  ['Switching', 'What is the best Zapier alternative for complex workflows?'],
  ['Switching', 'What should I use instead of Zapier to build AI agents?'],
  ['Head to head', 'Is Make better than Zapier?'],
  ['Head to head', 'Make vs Zapier: which should I choose?'],
  ['Head to head', 'Which is easier to use, Make or Zapier?'],
  ['Head to head', 'n8n vs Zapier: which is better?']
];
const BRANDS = { brand_name: 'Make', domain: 'make.com', aliases: ['Make.com', 'Integromat'],
  competitors: ['zapier.com', 'n8n.io', 'workato.com', { name: 'Power Automate', aliases: ['Microsoft Power Automate'], domains: ['powerautomate.microsoft.com'] }, 'pipedream.com'] };
const PROVIDERS = ['chatgpt_app', 'perplexity', 'ai_overviews'];
const ALTERNATIVES = ['Make', 'n8n', 'Workato', 'Power Automate', 'Pipedream']; // tracked alternatives; Zapier is the incumbent

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

async function waitFor(ids) {
  const out = [];
  for (const id of ids) {
    for (let i = 0; ; i++) {
      const d = await api('/state-of-union/get', { id });
      if (d.status === 'complete') { out.push(d); break; }
      if (i > 120) throw new Error('run ' + id + ' did not finish');
      await sleep(10000);
    }
  }
  return out;
}

let ids;
if (process.env.RUNS) ids = process.env.RUNS.split(',');
else {
  const r = await api('/state-of-union/submit', { ...BRANDS, prompts: QUESTIONS.map(q => q[1]), locations: ['United States'], providers: PROVIDERS, web: false, repeats: 2 });
  if (r.error) throw new Error(r.error);
  console.log('run', r.id, '≈ $' + r.estimated_cost_usd);
  ids = [r.id];
}
const reports = await waitFor(ids);
const main = reports[reports.length - 1];   // the report whose summary (citations, descriptions, discovery) is used
const cells = reports.flatMap(d => d.cells);
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };

// One answer: the first tracked alternative named (earliest in the text), and Make's place among the alternatives.
function readAnswer(cell) {
  const r = cell?.result;
  if (!cell || cell.status !== 'done') return { who: 'failed' };
  if (!r?.text) return { who: 'none', note: r?.note || 'no answer' };
  const alts = (cell.mentions || []).filter(m => m.mentioned && ALTERNATIVES.includes(m.name)).sort((a, b) => a.first_offset - b.first_offset);
  const make = alts.findIndex(m => m.name === 'Make');
  return {
    who: alts[0] ? alts[0].name : 'Other', alternatives: alts.map(m => m.name),
    make_named: make !== -1, make_rank: make === -1 ? null : make + 1,   // Make's place among the alternatives named
    zapier_named: (cell.mentions || []).some(m => m.name === 'Zapier' && m.mentioned),
    make_cited: [...new Set((r.sources || []).filter(s => host(s.url || '').endsWith('make.com')).map(s => s.url))].slice(0, 3),
    says: make !== -1 ? r.says || null : null, rep: cell.rep || 1
  };
}

const questions = QUESTIONS.map(([group, prompt]) => {
  const surfaces = {};
  for (const id of PROVIDERS) {
    // Latest finished answers win (a later RUNS id may re-check a failure); keep every repeat.
    const mine = cells.filter(c => c.prompt === prompt && c.provider === id);
    const done = mine.filter(c => c.status === 'done');
    const byRep = {};
    (done.length ? done : mine).forEach(c => { byRep[c.rep || 1] = c; });
    surfaces[id] = Object.values(byRep).map(readAnswer);
  }
  const aio = cells.filter(c => c.prompt === prompt && c.provider === 'ai_overviews' && c.status === 'done').pop();
  const org = aio?.result?.organic || [];
  const rankOf = d => { const o = org.find(x => (x.domain || '').replace(/^www\./, '').endsWith(d)); return o ? { rank: o.rank, url: o.url } : null; };
  return { group, prompt, surfaces, google: { make: rankOf('make.com'), zapier: rankOf('zapier.com'), n8n: rankOf('n8n.io'),
    top: org.slice(0, 5).map(o => ({ rank: o.rank, domain: (o.domain || '').replace(/^www\./, ''), url: o.url, title: o.title })) } };
});

const sm = main.summary || {};
const out = {
  created_at: new Date().toISOString(), market: 'United States', providers: PROVIDERS, alternatives: ALTERNATIVES,
  run_ids: reports.map(d => d.id), total_cost: Number(reports.reduce((t, d) => t + (d.total_cost || 0), 0).toFixed(3)),
  repeats: main.repeats, questions,
  // The run's own statistics (one run: every answer), trimmed to what the page shows.
  by_brand: sm.by_brand || {},
  describe: sm.describe || null,
  citations: sm.citations ? { answers_with_sources: sm.citations.answers_with_sources, share: sm.citations.share, top_domains: sm.citations.top_domains.slice(0, 12),
    pages: { own: (sm.citations.pages?.own || []).slice(0, 10), competitors: (sm.citations.pages?.competitors || []).slice(0, 10), other: (sm.citations.pages?.other || []).slice(0, 12) } } : null,
  discovered: (sm.discovered || []).slice(0, 10)
};
fs.mkdirSync('make/data', { recursive: true });
fs.writeFileSync('make/data/zapier-alternatives.json', JSON.stringify(out));
console.log('wrote make/data/zapier-alternatives.json — $' + out.total_cost);
for (const q of questions) console.log(q.prompt.padEnd(62), PROVIDERS.map(id => q.surfaces[id].map(s => s.who + (s.make_named ? '(Make#' + s.make_rank + ')' : '')).join('/')).join(' | '), '| G Make', q.google.make ? '#' + q.google.make.rank : '—');
