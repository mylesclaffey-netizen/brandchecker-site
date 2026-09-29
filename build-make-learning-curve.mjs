#!/usr/bin/env node
/**
 * Builds make/data/learning-curve.json (and appends to make/data/learning-curve-history.json) for
 * brandchecker.eu/make/learning-curve/ — the "Make is hard to learn" perception: how common it is, where it
 * comes from, and whether it's changing.
 *
 * Eight ease-of-use questions are asked through one State Of The LLM Union run (US): the real ChatGPT app and
 * Perplexity (2× each), Google's AI Overview (+ organic top 10), and ChatGPT and Claude from their own knowledge.
 * Each answer that names Make is classed on ease of use:
 *   hard   — the answer's description tags put ease_of_use unfavourable, or its sentences about Make say so
 *            ("steep learning curve", "not beginner-friendly", "can feel overwhelming"…)
 *   easy   — tagged favourable / its sentences say "easy", "intuitive", "beginner-friendly"… and nothing hard
 *   mixed  — both; silent — neither
 * The page adds the model-release view from the existing Model comparison snapshots (make/data/<family>.json).
 *
 * Usage: CODE=<access code> node build-make-learning-curve.mjs          (new run, ~$0.40)
 *        CODE=<access code> RUNS=<id> node build-make-learning-curve.mjs (rebuild from a finished run)
 */
import fs from 'fs';

const API = 'https://mc2seo-tools-api.mylesclaffey.workers.dev/api';
const CODE = process.env.CODE;
if (!CODE) { console.error('Set CODE to an access code.'); process.exit(1); }

const QUESTIONS = [
  'Is Make easy to use?',
  'How hard is it to learn Make.com?',
  'Is Make good for beginners?',
  'How long does it take to learn Make.com?',
  'What are the downsides of Make.com?',
  'Make vs Zapier: which is easier for non-technical users?',
  'What is the best no-code automation tool for beginners?',
  'Which automation tool has the gentlest learning curve?'
];
const BRANDS = { brand_name: 'Make', domain: 'make.com', aliases: ['Make.com', 'Integromat'], competitors: ['zapier.com', 'n8n.io'] };
const PROVIDERS = ['chatgpt_app', 'perplexity', 'ai_overviews', 'chatgpt', 'claude'];
const HARD = /\b(steep(er)?|(?<!(gentle|low|shallow|minimal|easy) )learning curve|not (very |as )?(beginner|newbie)[- ]friendly|overwhelm\w*|complicated|intimidat\w*|confusing|harder to (learn|use|master)|takes (some )?time to (learn|master)|not for (beginners|non-technical)|less intuitive|daunting|(more|very|quite) technical|technical (users|mindset|skills?|background))\b/i;
const EASY = /\b(easy to (use|learn|get started)|intuitive|beginner[- ]friendly|user[- ]friendly|simple to (use|learn)|easier|gentle learning curve|quick to learn|drag[- ]and[- ]drop|no[- ]code)\b/i;

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
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };

let id = process.env.RUNS;
if (!id) {
  const r = await api('/state-of-union/submit', { ...BRANDS, prompts: QUESTIONS, locations: ['United States'], providers: PROVIDERS, web: false, repeats: 2 });
  if (r.error) throw new Error(r.error);
  console.log('run', r.id, '≈ $' + r.estimated_cost_usd);
  id = r.id;
}
let d;
for (let i = 0; ; i++) {
  d = await api('/state-of-union/get', { id });
  if (d.status === 'complete') break;
  if (i > 120) throw new Error('run did not finish');
  await sleep(10000);
}

// One answer's verdict on Make's ease of use, with the evidence (the tag phrase and the model's own sentence).
function verdict(cell) {
  const r = cell.result || {};
  const make = (cell.mentions || []).find(m => m.name === 'Make');
  if (cell.status !== 'done' || !r.text) return null;
  if (!make?.mentioned) return { class: 'unnamed' };
  const ease = (r.traits || []).find(t => t.dim === 'ease_of_use');
  const quotes = r.quotes || [];
  const hardQ = quotes.find(q => HARD.test(q)), easyQ = quotes.find(q => EASY.test(q) && !HARD.test(q));
  const hard = (ease && ease.tone === '-') || !!hardQ, easy = (ease && ease.tone === '+') || !!easyQ;
  return {
    class: hard && easy ? 'mixed' : hard ? 'hard' : easy ? 'easy' : 'silent',
    phrase: ease ? ease.phrase : null, tone: ease ? ease.tone : null, quote: (hardQ || easyQ || null),
    sources: (r.sources || []).filter(s => s.url).map(s => ({ url: s.url, domain: host(s.url), title: s.title || null })).slice(0, 8)
  };
}

const answers = d.cells.map(c => ({ provider: c.provider, prompt: c.prompt, rep: c.rep || 1, ...(verdict(c) || { class: 'none' }) })).filter(a => a.class !== 'none');
const named = answers.filter(a => a.class !== 'unnamed');
const count = cls => named.filter(a => a.class === cls).length;
const byProvider = Object.fromEntries(PROVIDERS.map(p => {
  const n = named.filter(a => a.provider === p);
  return [p, { answers: n.length, hard: n.filter(a => a.class === 'hard' || a.class === 'mixed').length, easy: n.filter(a => a.class === 'easy' || a.class === 'mixed').length }];
}));

// Which pages the "hard" answers and the "easy" answers cite.
function pagesOf(list) {
  const m = {};
  for (const a of list) for (const s of new Map(a.sources.map(x => [x.url.split('?')[0], x])).values()) {
    const k = s.url.split('?')[0].replace(/\/$/, '');
    (m[k] ??= { url: k, domain: s.domain, title: s.title, answers: 0 }).answers++;
  }
  return Object.values(m).sort((a, b) => b.answers - a.answers).slice(0, 10);
}

const google = QUESTIONS.map(q => {
  const c = d.cells.find(x => x.prompt === q && x.provider === 'ai_overviews' && x.status === 'done');
  const org = c?.result?.organic || [];
  const make = org.find(o => (o.domain || '').endsWith('make.com'));
  return { prompt: q, make: make ? { rank: make.rank, url: make.url } : null, top: org.slice(0, 5).map(o => ({ rank: o.rank, domain: (o.domain || '').replace(/^www\./, ''), url: o.url, title: o.title })) };
});

const out = {
  created_at: new Date().toISOString(), market: 'United States', providers: PROVIDERS, questions: QUESTIONS, run_id: d.id, total_cost: d.total_cost, repeats: d.repeats,
  totals: { answers: answers.length, named: named.length, hard: count('hard'), mixed: count('mixed'), easy: count('easy'), silent: count('silent') },
  by_provider: byProvider,
  answers: answers.map(({ sources, ...a }) => ({ ...a, sources: (sources || []).slice(0, 4) })),
  pages: { hard: pagesOf(named.filter(a => a.class === 'hard' || a.class === 'mixed')), easy: pagesOf(named.filter(a => a.class === 'easy')) },
  describe: d.summary?.describe || null,
  google
};
fs.writeFileSync('make/data/learning-curve.json', JSON.stringify(out));

// History: one point per build, so the trend grows with every refresh.
const hp = 'make/data/learning-curve-history.json';
const history = fs.existsSync(hp) ? JSON.parse(fs.readFileSync(hp)) : [];
// A rebuild of the same run replaces its point instead of adding a second one.
const kept = history.filter(h => h.run_id !== out.run_id);
kept.push({ date: out.created_at, run_id: out.run_id, ...out.totals });
history.length = 0; history.push(...kept);
fs.writeFileSync(hp, JSON.stringify(history));

const t = out.totals;
console.log(`wrote make/data/learning-curve.json — $${out.total_cost} · ${t.named} answers naming Make: hard ${t.hard}, mixed ${t.mixed}, easy ${t.easy}, silent ${t.silent}`);
for (const p of PROVIDERS) console.log(' ', p.padEnd(13), JSON.stringify(byProvider[p]));
