#!/usr/bin/env node
/**
 * Builds make/data/app-pairs.json for brandchecker.eu/make/app-pairs/ — the Make app-pair visibility map.
 *
 * For each app pair ("What's the best way to connect HubSpot to Slack?") it asks the AI surfaces people use — the
 * real ChatGPT app, Perplexity, Google's AI Overview — through State Of The LLM Union runs (the Worker's queue
 * does the work; 20 pairs per run), and reads from the same Google search where make.com and zapier.com rank
 * organically. Search volume for "<A> <B> integration" comes from one DataForSEO batch call. The result is one row
 * per pair: who each surface recommends first, whether Make is named, which make.com page (if any) is cited, and
 * Make's Google position — plus a priority score for the worklist.
 *
 * Usage (needs an access code with budget; the code is not written to the output):
 *   CODE=<access code> node build-make-app-pairs.mjs            # new runs (~$1)
 *   CODE=<access code> RUNS=<id1>,<id2> node build-make-app-pairs.mjs   # rebuild from finished runs
 */
import fs from 'fs';

const API = 'https://mc2seo-tools-api.mylesclaffey.workers.dev/api';
const CODE = process.env.CODE;
if (!CODE) { console.error('Set CODE to an access code.'); process.exit(1); }

const CATEGORIES = {
  'CRM & sales': [['HubSpot', 'Slack'], ['HubSpot', 'Google Sheets'], ['Salesforce', 'Slack'], ['Salesforce', 'Google Sheets'], ['Pipedrive', 'Google Sheets'],
    ['HubSpot', 'Mailchimp'], ['Salesforce', 'Mailchimp'], ['Pipedrive', 'Slack'], ['HubSpot', 'Gmail'], ['Zoho CRM', 'Google Sheets']],
  'E-commerce & payments': [['Shopify', 'Google Sheets'], ['Shopify', 'Slack'], ['Shopify', 'Mailchimp'], ['Shopify', 'Klaviyo'], ['WooCommerce', 'Google Sheets'],
    ['Shopify', 'QuickBooks'], ['Stripe', 'Google Sheets'], ['Stripe', 'QuickBooks'], ['Shopify', 'HubSpot'], ['WooCommerce', 'Mailchimp']],
  'Marketing & forms': [['Typeform', 'Google Sheets'], ['Google Forms', 'Slack'], ['Facebook Lead Ads', 'Google Sheets'], ['Facebook Lead Ads', 'HubSpot'], ['Typeform', 'HubSpot'],
    ['Calendly', 'HubSpot'], ['Calendly', 'Slack'], ['Mailchimp', 'Google Sheets'], ['Webflow', 'HubSpot'], ['Typeform', 'Slack']],
  'Productivity': [['Gmail', 'Slack'], ['Gmail', 'Google Sheets'], ['Notion', 'Slack'], ['Airtable', 'Slack'], ['Google Calendar', 'Slack'],
    ['Trello', 'Slack'], ['Asana', 'Slack'], ['Notion', 'Google Calendar'], ['Airtable', 'Gmail'], ['ClickUp', 'Slack']]
};
const PAIRS = Object.entries(CATEGORIES).flatMap(([category, list]) => list.map(([a, b]) => ({ category, a, b, prompt: `What's the best way to connect ${a} to ${b}?`, keyword: `${a} ${b} integration`.toLowerCase() })));
const BRANDS = { brand_name: 'Make', domain: 'make.com', aliases: ['Make.com', 'Integromat'],
  competitors: ['zapier.com', 'n8n.io', 'workato.com', { name: 'Power Automate', aliases: ['Microsoft Power Automate'], domains: ['powerautomate.microsoft.com'] }] };
const PROVIDERS = ['chatgpt_app', 'perplexity', 'ai_overviews'];
const TRACKED = ['Make', 'Zapier', 'n8n', 'Workato', 'Power Automate'];

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

async function runAll() {
  if (process.env.RUNS) return process.env.RUNS.split(',');
  const ids = [];
  for (let i = 0; i < PAIRS.length; i += 20) {
    const r = await api('/state-of-union/submit', { ...BRANDS, prompts: PAIRS.slice(i, i + 20).map(p => p.prompt), locations: ['United States'], providers: PROVIDERS, web: false, repeats: 1 });
    if (r.error) throw new Error(r.error);
    console.log('run', r.id, '≈ $' + r.estimated_cost_usd);
    ids.push(r.id);
  }
  return ids;
}

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

const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
// The apps' own connection, as answers phrase it: "the native Salesforce for Slack integrations", "Mailchimp's
// official Shopify app", "Stripe Connector by QuickBooks", "Zoho CRM connector/add-on for Sheets", "install it from
// the Shopify App Store".
const NATIVE = /\b(native|official|built[- ]in|first[- ]party)\b[^.\n|]{0,45}?\b(integrations?|apps?|connectors?|add-?ons?|sync)\b|\bconnector by\b|\b(app store|app marketplace|appexchange|marketplace app)\b|\bconnector\/add-on\b|\bdirect(ly)? integrat/i;

// What an answer recommends first: whichever comes earliest in the text — a tracked tool (Make, Zapier…) or a
// native connection between the two apps; "Other" when it recommends neither (custom code, another tool).
// Earliest in the text, not list position, because answers often lead with the native app and list Zapier after.
function winner(cell) {
  const r = cell?.result;
  if (!cell || cell.status !== 'done') return { who: 'failed' };
  if (!r?.text) return { who: 'none', note: r?.note || 'no answer' };
  const named = (cell.mentions || []).filter(m => m.mentioned && TRACKED.includes(m.name)).sort((x, y) => (x.position ?? 99) - (y.position ?? 99));
  const make = (cell.mentions || []).find(m => m.name === 'Make');
  const makeCited = (r.sources || []).filter(s => host(s.url || s.domain) .endsWith('make.com')).map(s => s.url).filter(Boolean);
  const zapCited = (r.sources || []).filter(s => host(s.url || s.domain).endsWith('zapier.com')).map(s => s.url).filter(Boolean);
  const nat = r.text.search(NATIVE);
  const firstTool = (cell.mentions || []).filter(m => m.mentioned && TRACKED.includes(m.name)).sort((x, y) => x.first_offset - y.first_offset)[0];
  const who = nat !== -1 && (!firstTool || nat < firstTool.first_offset) ? 'Native integration' : firstTool ? firstTool.name : 'Other';
  return {
    who, first_tool: firstTool ? firstTool.name : null, // the automation platform named first, even after a native recommendation
    named: named.map(m => m.name), make_named: !!make?.mentioned, make_position: make?.mentioned ? make.position : null,
    make_cited: [...new Set(makeCited)].slice(0, 3), zapier_cited: [...new Set(zapCited)].slice(0, 3), says: make?.mentioned ? r.says || null : null,
    queries: (r.queries || []).slice(0, 6)
  };
}

function organicRanks(cell) {
  const org = cell?.result?.organic || [];
  const first = d => { const o = org.find(x => (x.domain || '').replace(/^www\./, '').endsWith(d)); return o ? { rank: o.rank, url: o.url } : null; };
  return { make: first('make.com'), zapier: first('zapier.com'), n8n: first('n8n.io'), top: org[0] ? { domain: (org[0].domain || '').replace(/^www\./, ''), url: org[0].url } : null };
}

const reports = await waitFor(await runAll());
const cells = reports.flatMap(d => d.cells);
const vol = await api('/volume/batch', { keywords: PAIRS.map(p => p.keyword), market: 'United States' });
if (vol.error) console.warn('volumes:', vol.error);

const pairs = PAIRS.map(p => {
  // A later patch run may re-check a pair that failed: prefer a finished answer.
  const c = id => { const all = cells.filter(x => x.prompt === p.prompt && x.provider === id); return all.find(x => x.status === 'done') || all[0]; };
  const surfaces = Object.fromEntries(PROVIDERS.map(id => [id, winner(c(id))]));
  const answered = Object.values(surfaces).filter(s => s.who !== 'none' && s.who !== 'failed');
  const makeFirst = answered.filter(s => s.who === 'Make').length, makeNamed = answered.filter(s => s.make_named).length;
  const google = organicRanks(c('ai_overviews'));
  const volume = vol.results?.[p.keyword]?.volume ?? null;
  // Priority: search demand × how much Make is losing where it can win. A native recommendation is hard to displace,
  // so the weight is on answers that name another automation platform first, then on not being named at all.
  const toolAnswers = answered.filter(s => s.first_tool), lostToTool = toolAnswers.filter(s => s.first_tool !== 'Make').length;
  const lost = answered.length ? lostToTool / answered.length + 0.5 * (answered.length - makeNamed) / answered.length : 0;
  const googleGap = google.make && google.make.rank <= 10 ? 0 : 1;
  const priority = Math.round(Math.log10((volume || 10) + 1) * 10 * (lost + googleGap)) / 10;
  return { ...p, volume, surfaces, make_first: makeFirst, make_named: makeNamed, answered: answered.length, google, priority };
});

const out = {
  created_at: new Date().toISOString(), market: 'United States', providers: PROVIDERS, tracked: TRACKED,
  run_ids: reports.map(d => d.id), total_cost: Number(reports.reduce((t, d) => t + (d.total_cost || 0), 0).toFixed(3)),
  categories: Object.keys(CATEGORIES), pairs
};
fs.mkdirSync('make/data', { recursive: true });
fs.writeFileSync('make/data/app-pairs.json', JSON.stringify(out));
console.log('wrote make/data/app-pairs.json —', pairs.length, 'pairs, $' + out.total_cost);
for (const p of pairs) console.log(p.category.padEnd(22), (p.a + ' → ' + p.b).padEnd(34), String(p.volume ?? '—').padStart(6), PROVIDERS.map(id => p.surfaces[id].who.padEnd(18)).join(' '), 'G:', p.google.make ? '#' + p.google.make.rank : '—');
