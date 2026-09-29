#!/usr/bin/env node
/**
 * Builds make/data/ai-agents.json for brandchecker.eu/make/ai-agents/ — has Make entered the "AI agent builder"
 * category in AI answers, and is it named as an agent platform or only as general automation?
 *
 * Ten category questions go through one State Of The LLM Union run (US): the real ChatGPT app and Perplexity (2×,
 * they search the web), Google's AI Overview (+ organic top 10), and ChatGPT and Claude from their own knowledge
 * (2×) — searching vs. remembered, i.e. whether Make's agent positioning has reached the models' training yet.
 * Tracked: Make vs n8n, Zapier, Lindy, Relevance AI, Gumloop; other agent tools come from brand discovery.
 * Per answer that names Make: is it named *as an agent platform* (its own sentences about Make mention agents), or
 * only as automation?
 *
 * Usage: CODE=<access code> node build-make-ai-agents.mjs            (new run, ~$0.45)
 *        CODE=<access code> RUNS=<id> node build-make-ai-agents.mjs  (rebuild from a finished run)
 */
import fs from 'fs';

const API = 'https://mc2seo-tools-api.mylesclaffey.workers.dev/api';
const CODE = process.env.CODE;
if (!CODE) { console.error('Set CODE to an access code.'); process.exit(1); }

const QUESTIONS = [
  ['Category', 'What is the best AI agent builder?'],
  ['Category', 'What are the best tools to build AI agents without code?'],
  ['Category', 'What is the best platform for building AI agents for business automation?'],
  ['Category', 'What should I use to build AI agents that connect to my apps?'],
  ['Category', 'What are the best AI workflow automation tools?'],
  ['Category', 'What is the best no-code AI agent platform for small businesses?'],
  ['Category', 'How do I build an AI agent that automates my email and CRM?'],
  ['Category', 'What are the best alternatives to n8n for AI agents?'],
  ['Head to head', 'Which is better for building AI agents: Make, Zapier or n8n?'],
  ['Head to head', 'Can Make build AI agents?']
];
const BRANDS = { brand_name: 'Make', domain: 'make.com', aliases: ['Make.com', 'Integromat'],
  competitors: ['n8n.io', 'zapier.com', 'lindy.ai', { name: 'Relevance AI', aliases: [], domains: ['relevanceai.com'] }, 'gumloop.com'] };
const PROVIDERS = ['chatgpt_app', 'perplexity', 'ai_overviews', 'chatgpt', 'claude'];
const TOOLS = ['Make', 'n8n', 'Zapier', 'Lindy', 'Relevance AI', 'Gumloop'];
const AGENT = /\bagent(s|ic)?\b/i;
// Make named, but explicitly *not* as the agent — "more automation-oriented than agent-oriented", "companion tools to
// connect your AI agent". These count as automation only.
const NOT_AGENT = /(automation|workflow)[- ]oriented than agent|less agent|not (really |a true |an? )?agent|companion|connect (your|the) (chosen )?(ai )?agent/i;
// Other agent tools, counted straight from the answer texts (brand discovery is swamped by generic words here).
const OTHERS = [['Microsoft Copilot Studio', /copilot studio|microsoft copilot/i], ['Power Automate', /power automate/i], ['OpenAI Agent Builder', /openai(’s|'s)? (agent ?builder|agentkit|assistants|gpts?)|agentkit|custom gpts?/i],
  ['Salesforce Agentforce', /agentforce/i], ['Google Vertex AI / Agentspace', /vertex ai|agentspace|google agent/i], ['LangChain / LangGraph', /langchain|langgraph/i], ['CrewAI', /crew ?ai/i],
  ['Relay.app', /relay\.app/i], ['Activepieces', /activepieces/i], ['Workato', /workato/i], ['UiPath', /uipath/i], ['Voiceflow', /voiceflow/i], ['Botpress', /botpress/i],
  ['Stack AI', /stack ?ai\b/i], ['Dify', /\bdify\b/i], ['Flowise', /flowise/i], ['Vellum', /vellum/i], ['Composio', /composio/i], ['Pipedream', /pipedream/i], ['Albato', /albato/i]];
const plain = q => q && q.replace(/^\s*\|\s*|\s*\|\s*$/g, '').replace(/\s*\|\s*/g, ' · ').replace(/[⭐★☆✅❌]+/g, '').replace(/( · )+/g, ' · ').replace(/\[([^\]\n]*)\]\((https?:[^)\n]*)\)/g, '$1').replace(/\*\*|__|`/g, '').replace(/^\s*([-*•]|\d+\.|#+)\s+/, '').trim();

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
  const r = await api('/state-of-union/submit', { ...BRANDS, prompts: QUESTIONS.map(q => q[1]), locations: ['United States'], providers: PROVIDERS, web: false, repeats: 2 });
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

function readAnswer(cell) {
  const r = cell.result || {};
  if (cell.status !== 'done') return { who: 'failed' };
  if (!r.text) return { who: 'none', note: r.note || 'no answer' };
  const named = (cell.mentions || []).filter(m => m.mentioned && TOOLS.includes(m.name)).sort((a, b) => a.first_offset - b.first_offset);
  const make = named.find(m => m.name === 'Make');
  // Named as an agent platform: its own sentences about Make talk about agents.
  const asAgent = !!make && (r.quotes || []).some(q => AGENT.test(q) && !NOT_AGENT.test(q));
  return {
    who: named[0] ? named[0].name : 'Other', tools: named.map(m => m.name),
    make_named: !!make, make_rank: make ? named.indexOf(make) + 1 : null, make_as_agent: asAgent,
    make_not_agent: !!make && !asAgent && (r.quotes || []).some(q => NOT_AGENT.test(q)),
    make_quote: make ? plain((r.quotes || []).find(q => NOT_AGENT.test(q) && !asAgent) || (r.quotes || []).find(q => AGENT.test(q) && !NOT_AGENT.test(q)) || (r.quotes || [])[0] || null) : null,
    make_cited: [...new Set((r.sources || []).filter(s => host(s.url || '').endsWith('make.com')).map(s => s.url))].slice(0, 3),
    rep: cell.rep || 1
  };
}

const questions = QUESTIONS.map(([group, prompt]) => {
  const surfaces = {};
  for (const p of PROVIDERS) surfaces[p] = d.cells.filter(c => c.prompt === prompt && c.provider === p).sort((a, b) => (a.rep || 1) - (b.rep || 1)).map(readAnswer);
  const aio = d.cells.find(c => c.prompt === prompt && c.provider === 'ai_overviews' && c.status === 'done');
  const org = aio?.result?.organic || [];
  const rankOf = dm => { const o = org.find(x => (x.domain || '').replace(/^www\./, '').endsWith(dm)); return o ? { rank: o.rank, url: o.url } : null; };
  return { group, prompt, surfaces, google: { make: rankOf('make.com'), n8n: rankOf('n8n.io'), zapier: rankOf('zapier.com'),
    top: org.slice(0, 5).map(o => ({ rank: o.rank, domain: (o.domain || '').replace(/^www\./, ''), url: o.url, title: o.title })) } };
});

const sm = d.summary || {};
const out = {
  created_at: new Date().toISOString(), market: 'United States', providers: PROVIDERS, tools: TOOLS, run_id: d.id, total_cost: d.total_cost, repeats: d.repeats,
  questions,
  describe: sm.describe || null,
  citations: sm.citations ? { answers_with_sources: sm.citations.answers_with_sources, share: sm.citations.share, top_domains: sm.citations.top_domains.slice(0, 12),
    pages: { own: (sm.citations.pages?.own || []).slice(0, 10), competitors: (sm.citations.pages?.competitors || []).slice(0, 10), other: (sm.citations.pages?.other || []).slice(0, 12) } } : null,
  // Category answers naming each other agent tool.
  others: (() => {
    const texts = d.cells.filter(c => c.status === 'done' && c.result?.text && QUESTIONS.find(q => q[1] === c.prompt)[0] === 'Category').map(c => c.result.text);
    return OTHERS.map(([name, re]) => ({ name, answers: texts.filter(t => re.test(t)).length })).filter(o => o.answers).sort((a, b) => b.answers - a.answers);
  })()
};
fs.writeFileSync('make/data/ai-agents.json', JSON.stringify(out));
const all = questions.filter(q => q.group === 'Category').flatMap(q => PROVIDERS.flatMap(p => q.surfaces[p])).filter(s => s.who !== 'none' && s.who !== 'failed');
const c = k => all.filter(s => s.who === k).length;
console.log(`wrote make/data/ai-agents.json — $${out.total_cost} · category answers ${all.length}: first ` + TOOLS.map(t => t + ' ' + c(t)).join(', ') +
  ` · Make named ${all.filter(s => s.make_named).length}, as agent platform ${all.filter(s => s.make_as_agent).length}`);
console.log('others:', out.others.map(x => x.name + ' ' + x.answers).join(', '));
