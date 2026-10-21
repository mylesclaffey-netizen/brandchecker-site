/* Lil Rag Chunker: platform presets. Each preset reshapes the export for one chatbot platform and writes its INSTALL.md.
   Platform facts checked 2026-10-21 against each platform's own help pages (linked in the guides).
   Usage: MC2RagPresets.LIST, MC2RagPresets.files(id, d, base) → Promise<{ path: string | Uint8Array }>,
          MC2RagPresets.guide(id, d) → markdown. `d` is the /rag/chunk response, `base` the all-formats file map. Needs JSZip. */
(function () {
  var LIST = [
    { id: 'all', label: 'Everything (all formats)' },
    { id: 'gpt', label: 'ChatGPT: Custom GPT' },
    { id: 'claude', label: 'Claude: Project' },
    { id: 'intercom', label: 'Intercom: Fin AI Agent' },
    { id: 'chatbase', label: 'Chatbase' },
    { id: 'dev', label: 'Developers: vector database' },
    { id: 'site', label: 'Your website: for AI crawlers' }
  ];
  var GPT_MAX_FILES = 20, INTERCOM_MAX_DOCS = 90, CLAUDE_SAFE_TOKENS = 150000;

  function okPages(d) { return d.pages.map(function (p, i) { return p.error ? null : { p: p, i: i }; }).filter(Boolean); }
  function pageChunks(d, i) { return d.chunks.filter(function (c) { return c.page === i && c.source !== 'schema'; }); }
  function faqOf(d) {
    return d.chunks.filter(function (c) { return c.source === 'schema'; }).map(function (c) {
      var nl = c.text.indexOf('\n'); return { q: c.text.slice(0, nl), a: c.text.slice(nl + 1), url: c.url };
    });
  }
  function tokens(d) { return d.chunks.reduce(function (t, c) { return t + c.tokens_est; }, 0); }
  // One page as Markdown text: title, source, then a heading per chunk.
  function pageText(d, x) {
    var p = x.p;
    return '# ' + (p.title || p.path) + '\n\nSource: ' + p.url + '\n\n' +
      pageChunks(d, x.i).map(function (c) { return '## ' + (c.section || p.title || p.path) + '\n\n' + c.text + '\n'; }).join('\n');
  }
  function safeName(s) { return String(s || 'page').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60) || 'page'; }
  function faqText(d) {
    return '# Frequently asked questions (' + d.brand + ')\n\n' + faqOf(d).map(function (f) { return '## ' + f.q + '\n\n' + f.a + '\nSource: ' + f.url + '\n'; }).join('\n');
  }

  // Fewest files for platforms that cap them: group pages by page type or first folder, then merge the smallest groups.
  function bundle(d, items, max) {
    if (items.length <= max) return items.map(function (x) { return { name: x.p.slug, items: [x] }; });
    var keyOf = function (x) { var m = x.p.path.match(/^\/([^/]+)\//); return x.p.legal ? 'legal' : x.p.role && x.p.role !== 'home' ? x.p.role : x.p.role === 'home' ? 'home' : m ? m[1].toLowerCase() : 'pages'; };
    var groups = {};
    items.forEach(function (x) { var k = keyOf(x); (groups[k] = groups[k] || { name: k, items: [] }).items.push(x); });
    var list = Object.keys(groups).map(function (k) { return groups[k]; });
    var size = function (g) { return g.items.reduce(function (t, x) { return t + x.p.words; }, 0); };
    while (list.length > max) {
      list.sort(function (a, b) { return size(a) - size(b); });
      var a = list.shift(), b = list.shift();
      list.push({ name: a.name + '-and-' + b.name, items: a.items.concat(b.items) });
    }
    return list.map(function (g) { return { name: safeName(g.name), items: g.items }; });
  }

  /* ---- Markdown copies of the pages, to publish on the client's own site ---- */
  // One flat folder (/md/pricing.md): a real /pricing/ folder could shadow the CMS's own /pricing/ page on some hosts.
  var MD_DIR = 'md';
  function origin(d) { var u = d.pages.filter(function (p) { return !p.error; })[0]; try { return new URL(u.url).origin; } catch (e) { return 'https://' + d.domain; } }
  function mdUrl(d, p) { return origin(d) + '/' + MD_DIR + '/' + p.slug + '.md'; }
  // The page again as clean Markdown: headings from each chunk's heading path, the overlap paragraph shown once.
  function pageMarkdown(d, x, date) {
    var p = x.p, prevPath = [], prevLast = null, out = [];
    out.push('# ' + (p.title || p.path));
    if (p.description) out.push('> ' + p.description.replace(/\s+/g, ' ').trim());
    out.push('The web page: ' + p.url + '  \nUpdated: ' + date);
    pageChunks(d, x.i).forEach(function (c) {
      var path = c.heading_path || [], k = 0;
      while (k < path.length && k < prevPath.length && path[k] === prevPath[k]) k++;
      for (var h = k; h < path.length; h++) if (h || String(p.title || '').indexOf(path[h]) !== 0) out.push(new Array(Math.min(h + 2, 6) + 1).join('#') + ' ' + path[h]);
      var paras = c.text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      if (k === path.length && k === prevPath.length && paras[0] === prevLast) paras.shift();   // same section: drop the overlap
      paras.forEach(function (l) { out.push(l.replace(/^•\s*/, '- ')); });
      prevPath = path; prevLast = c.text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).pop();
    });
    return out.join('\n\n').replace(/\n\n(- )/g, function (m, b, i, all) { return /\n- [^\n]*$/.test(all.slice(0, i)) ? '\n' + b : m; }) + '\n';
  }

  /* ---- a minimal .docx writer (Intercom accepts PDF and DOCX only) ---- */
  function xml(s) { return String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function docx(markdown) {
    var W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main', R = 'http://schemas.openxmlformats.org/package/2006/relationships';
    var para = function (text, style) { return '<w:p>' + (style ? '<w:pPr><w:pStyle w:val="' + style + '"/></w:pPr>' : '') + '<w:r><w:t xml:space="preserve">' + xml(text) + '</w:t></w:r></w:p>'; };
    var body = String(markdown).split('\n').filter(function (l) { return l.trim() && !/^<!--/.test(l.trim()); }).map(function (l) {
      if (/^# /.test(l)) return para(l.slice(2), 'Heading1');
      if (/^## /.test(l)) return para(l.slice(3), 'Heading2');
      return para(l.replace(/^•\s*/, '• '));
    }).join('');
    var z = new JSZip();
    z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
    z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="' + R + '"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    z.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="' + R + '"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    z.file('word/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="' + W + '">' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="120"/></w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>' +
      '</w:styles>');
    z.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="' + W + '"><w:body>' + body + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>');
    return z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  }

  /* ---- the files for each preset ---- */
  function files(id, d, base) {
    var out = {}, items = okPages(d), faq = faqOf(d);
    out['INSTALL.md'] = guide(id, d);
    if (id === 'all') { Object.keys(base).forEach(function (k) { out[k] = base[k]; }); return Promise.resolve(out); }
    if (id === 'dev') {
      out['chunks.jsonl'] = base['chunks.jsonl'];
      if (base['schema.json']) out['schema.json'] = base['schema.json'];
      return Promise.resolve(out);
    }
    if (id === 'gpt') {
      bundle(d, items, faq.length ? GPT_MAX_FILES - 1 : GPT_MAX_FILES).forEach(function (g) {
        out['knowledge/' + g.name + '.txt'] = g.items.map(function (x) { return pageText(d, x); }).join('\n\n---\n\n');
      });
      if (faq.length) out['knowledge/faq.txt'] = faqText(d);
      out['instructions.txt'] = instructions(d, 'files');
      return Promise.resolve(out);
    }
    if (id === 'claude') {
      items.forEach(function (x) { out['knowledge/' + x.p.slug + '.txt'] = pageText(d, x); });
      if (faq.length) out['knowledge/faq.txt'] = faqText(d);
      out['project-instructions.txt'] = instructions(d, 'project knowledge');
      return Promise.resolve(out);
    }
    if (id === 'site') {
      var date = d.fetched_at.slice(0, 10), headers = [], apache = ['# Serve the Markdown copies as Markdown, each pointing Google at its web page.', 'AddType "text/markdown; charset=utf-8" .md', '<IfModule mod_headers.c>'];
      var llms = base['llms.txt'] || '', tags = ['<!-- Lil Rag Chunker: paste each line into the <head> of the page named above it. -->'];
      items.forEach(function (x) {
        var p = x.p, md = mdUrl(d, p), file = p.slug + '.md';
        out['site/' + MD_DIR + '/' + file] = pageMarkdown(d, x, date);
        tags.push('', '<!-- ' + p.url + ' -->', '<link rel="alternate" type="text/markdown" href="' + md + '" title="' + String(p.title || p.path).replace(/&/g, '&amp;').replace(/"/g, '&quot;') + ' (Markdown)">');
        headers.push('/' + MD_DIR + '/' + file, '  Content-Type: text/markdown; charset=utf-8', '  Link: <' + p.url + '>; rel="canonical"', '');
        apache.push('  <Files "' + file + '">', '    Header set Link "<' + p.url + '>; rel=\\"canonical\\""', '  </Files>');
        llms = llms.split('](' + p.url + ')').join('](' + md + ')');
      });
      apache.push('</IfModule>');
      out['site/' + MD_DIR + '/.htaccess'] = apache.join('\n') + '\n';
      out['head-tags.html'] = tags.join('\n') + '\n';
      out['_headers'] = '# Cloudflare Pages and Netlify: merge into the _headers file at your site\'s root.\n' + headers.join('\n');
      out['llms.txt'] = llms;
      return Promise.resolve(out);
    }
    if (id === 'chatbase') {
      items.forEach(function (x) { out['files/' + x.p.slug + '.txt'] = pageText(d, x); });
      if (faq.length) out['qa.csv'] = '\ufeffquestion,answer\r\n' + faq.map(function (f) { return [f.q, f.a].map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n') + '\r\n';
      return Promise.resolve(out);
    }
    if (id === 'intercom') {
      var groups = bundle(d, items, INTERCOM_MAX_DOCS), used = {};
      if (faq.length) out['snippets.txt'] = faq.map(function (f, n) { return '--- Snippet ' + (n + 1) + ' ---\nTitle: ' + f.q + '\n\n' + f.a + '\n'; }).join('\n');
      return Promise.all(groups.map(function (g) {
        var first = g.items[0].p, title = g.items.length === 1 ? (first.title || first.path) : d.brand + ' — ' + g.name.replace(/-/g, ' ');
        var name = safeName(title); while (used[name]) name += '-2'; used[name] = 1;    // Intercom needs unique names
        return docx(g.items.map(function (x) { return pageText(d, x); }).join('\n')).then(function (bytes) { out['documents/' + name + '.docx'] = bytes; });
      })).then(function () { return out; });
    }
    return Promise.resolve(out);
  }

  function instructions(d, where) {
    return 'You answer questions about ' + d.brand + ' (' + d.domain + ') for visitors and customers.\n' +
      'Answer from the ' + where + ' only. Each section starts with the page it came from ("Source:"); give that link when it helps.\n' +
      'If the ' + where + ' don\'t answer a question, say you don\'t know and suggest contacting ' + d.brand + '. Never guess prices, plans or features.\n' +
      'Keep answers short and in the visitor\'s language.\n';
  }

  /* ---- the install guides ---- */
  function guide(id, d) {
    var n = okPages(d).length, faq = faqOf(d).length, t = tokens(d);
    var head = function (title) { return '# ' + title + '\n\nThe pack: ' + n + ' page' + (n === 1 ? '' : 's') + ' of ' + d.domain + ', ' + d.chunks.length + ' chunks (about ' + t.toLocaleString('en-US') + ' tokens), made ' + d.fetched_at.slice(0, 10) + ' with Lil Rag Chunker (https://brandchecker.eu/tools/lil-rag-chunker/).\n\n'; };
    var noFaq = faq ? '' : '\nTip: tick "Schema extras" before chunking to also get the questions from your FAQ markup as ready-made Q&A pairs.\n';
    var after = afterFor('your bot');
    function afterFor(what) { return '\n## Then test it\n\nAsk ' + what + ' 5 to 10 questions customers really ask (prices, integrations, getting started). If an answer is wrong or missing, check the Test retrieval tab in Lil Rag Chunker: if no chunk answers the question, the fix belongs on your website, not in ' + what.replace(/^your /, 'the ') + '. Re-export after you change your pages.\n'; }
    if (id === 'gpt') return head('Load into a ChatGPT Custom GPT') +
      '## What is in this folder\n\n- `knowledge/`: your pages as text files, at most ' + GPT_MAX_FILES + ' (pages grouped by type when there are more)' + (faq ? ', plus `faq.txt` with ' + faq + ' questions and answers' : '') + '.\n- `instructions.txt`: suggested instructions for the GPT.\n\n' +
      '## Before you start\n\nOpenAI is retiring custom GPTs and recommends moving to Plugins instead. Enterprise workspaces are planned for 11 December 2026, with other plans expected to follow. New GPTs can only be created in Business, Enterprise and Edu workspaces; personal accounts (Free, Go, Plus, Pro) can still use and edit the GPTs they already have. The same text files can also be added to a ChatGPT Project.\n\n' +
      '## Steps\n\n1. In ChatGPT, open **Explore GPTs** (or https://chatgpt.com/gpts) and choose **Create**, then switch to the **Configure** view.\n2. Paste `instructions.txt` into **Instructions** (edit the tone to suit you).\n3. Under **Knowledge**, upload every file in `knowledge/`.\n4. Test it in **Preview**, then choose **Create** (or **Update** for an existing GPT).\n\n' +
      'A GPT can have up to ' + GPT_MAX_FILES + ' knowledge files of up to 512 MB each (https://help.openai.com/en/articles/8554397-creating-and-editing-gpts), so this pack stays at ' + GPT_MAX_FILES + ' files or fewer. OpenAI\'s page also covers the move to Plugins.\n' + noFaq + afterFor('your GPT');
    if (id === 'claude') return head('Load into a Claude Project') +
      '## What is in this folder\n\n- `knowledge/`: one text file per page' + (faq ? ', plus `faq.txt` with ' + faq + ' questions and answers' : '') + '.\n- `project-instructions.txt`: suggested instructions for the project.\n\n' +
      '## Steps\n\n1. In Claude, open **Projects** and create a new project.\n2. Paste `project-instructions.txt` into the project\'s instructions.\n3. Add every file in `knowledge/` to the project\'s knowledge.\n\n' +
      'Each file can be up to 30 MB and there is no fixed file count (https://support.claude.com/en/articles/8241126). On the free plan, everything in the project has to fit Claude\'s context window. On paid plans (Pro, Max, Team, Enterprise), Claude switches to retrieval on its own when a project gets close to that limit, which holds up to about 10 times as much (https://support.claude.com/en/articles/11473015).' +
      (t > CLAUDE_SAFE_TOKENS ? ' At about ' + t.toLocaleString('en-US') + ' tokens this pack is close to or past what the free plan can hold: use a paid plan, where Claude will search the files rather than read them all at once.' : ' At about ' + t.toLocaleString('en-US') + ' tokens this pack fits on any plan, so Claude reads all of it for every answer.') + '\n' + noFaq + afterFor('the project');
    if (id === 'intercom') return head('Load into Intercom Fin AI Agent') +
      '## What is in this folder\n\n- `documents/`: your pages as Word documents (Fin accepts PDF and DOCX only), each with a unique name, as Intercom requires.' + (faq ? '\n- `snippets.txt`: ' + faq + ' questions and answers to add as Snippets.' : '') + '\n\n' +
      '## Steps\n\n1. In Intercom, go to **Train > Content**.\n2. Under **Add content**, choose **See all**, then **Upload a document**, and select every file in `documents/` (they upload in batches).\n3. You get an email listing which files worked. Documents are usually available to Fin within about 10 minutes.\n' +
      (faq ? '4. For each entry in `snippets.txt`, add a **Snippet** from the same **Add content** area: the question as the title, the answer as the text. Snippets suit short answers like these.\n' : '') +
      '\nLimits from Intercom\'s help centre: 100 uploaded documents per workspace, text-based files only, no encrypted files or multi-column layouts. Uploaded documents are a private source: customers never see a link to them (https://fin.ai/help/en/articles/13975760-upload-and-manage-documents). If your pages are public, Intercom can also sync them as a website instead; this pack gives you the cleaned, curated version.\n' + noFaq + after;
    if (id === 'chatbase') return head('Load into Chatbase') +
      '## What is in this folder\n\n- `files/`: one text file per page (Chatbase reads PDF, TXT and Word files, and prefers plain text with Markdown).' + (faq ? '\n- `qa.csv`: ' + faq + ' questions and answers for Chatbase\'s Q&A source.' : '') + '\n\n' +
      '## Steps\n\n1. In Chatbase, open your agent and go to **Build > Data sources**.\n2. Choose **Add Files** and upload every file in `files/`.\n' +
      (faq ? '3. Choose **Add Q&As** and add each row of `qa.csv` as a question and answer.\n4. Retrain the agent.\n' : '3. Retrain the agent.\n') +
      '\nIf you also crawl your website in Chatbase, use either the crawl or these files for the same pages, not both, or the agent sees everything twice. Chatbase\'s guide: https://www.chatbase.co/docs/user-guides/chatbot/data-sources\n' + noFaq + after;
    if (id === 'dev') return head('Load into a vector database') +
      '## What is in this folder\n\n- `chunks.jsonl`: one chunk per line.' + (d.settings.schema ? '\n- `schema.json`: structured-data types, facts and mismatches per page.' : '') + '\n\n' +
      '## The fields\n\n| Field | Use |\n| --- | --- |\n| `id` | Stable key: upsert on it |\n| `text_with_context` | What to embed (page title and headings, then the text) |\n| `text` | What to show or quote |\n| `url`, `title`, `section`, `heading_path` | Citations and filters |\n| `hash` | Changes only when the text changes: re-embed just those |\n| `lang`, `words`, `tokens_est`, `fetched_at` | Housekeeping |' + (d.settings.schema ? '\n| `source`, `schema_types` | "page" or "schema" (FAQ from markup); filter by type |' : '') + '\n\n' +
      '## Example: Postgres with pgvector\n\n```sql\ncreate extension if not exists vector;\ncreate table site_chunks (\n  id text primary key, url text, title text, section text,\n  text text, hash text, embedding vector(1024)  -- match your embedding model\'s size\n);\n```\n\n' +
      '```python\nimport json\nfrom your_embeddings import embed   # your model: OpenAI, Cohere, Voyage, bge-m3, ...\n\n# db: a psycopg connection (psycopg 3: conn.execute works directly)\nstored = dict(db.execute("select id, hash from site_chunks").fetchall())\nseen = set()\n\nwith open("chunks.jsonl") as f:\n    for line in f:\n        c = json.loads(line)\n        seen.add(c["id"])\n        if stored.get(c["id"]) == c["hash"]:\n            # Same text: refresh the labels, keep the embedding (no embedding cost)\n            db.execute("update site_chunks set url = %s, title = %s, section = %s where id = %s",\n                       (c["url"], c["title"], c["section"], c["id"]))\n            continue\n        vec = embed(c["text_with_context"])   # new or changed text only\n        db.execute(\n            """insert into site_chunks (id, url, title, section, text, hash, embedding)\n               values (%s, %s, %s, %s, %s, %s, %s)\n               on conflict (id) do update set url = excluded.url, title = excluded.title,\n                 section = excluded.section, text = excluded.text, hash = excluded.hash,\n                 embedding = excluded.embedding""",\n            (c["id"], c["url"], c["title"], c["section"], c["text"], c["hash"], vec))\n\n# Chunks from pages or sections that are gone from the site\ngone = list(set(stored) - seen)\nif gone:\n    db.execute("delete from site_chunks where id = any(%s)", (gone,))\ndb.commit()\n```\n\n' +
      'At question time: embed the question with the same model, take the closest 5 chunks, and give their `text` and `url` to your model with an instruction to answer only from them. LangChain and LlamaIndex can read this file with their JSONL loaders. If you change page titles or headings with context on, re-embed everything once: the hash covers the text only, not the context line.\n' + after;
    if (id === 'site') {
      var ex = okPages(d)[0], exMd = ex ? mdUrl(d, ex.p) : origin(d) + '/' + MD_DIR + '/home.md';
      return head('Publish on your website, for AI crawlers and agents') +
        'AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google) read web pages and split them up their own way; there is no file that hands them your chunks. ' +
        'What you can do is publish the same clean text where they look: a Markdown copy of each page, linked from the page itself. Assistants that fetch pages live and AI agents already use these; whether the big training crawlers prefer them is not proven. It costs little and nothing breaks.\n\n' +
        '## What is in this folder\n\n- `site/md/`: one Markdown copy per page, in one folder so no file can clash with your existing pages, plus an `.htaccess` for Apache hosts.\n- `head-tags.html`: one `<link>` tag per page, for that page\'s `<head>`.\n- `_headers`: the same settings for Cloudflare Pages and Netlify.\n- `llms.txt`: your draft llms.txt, linking to the Markdown copies.\n\n' +
        '## Steps\n\n1. Check AI crawlers are allowed on your site: https://brandchecker.eu/tools/crawler-check/?u=' + encodeURIComponent(d.domain) + ' (a blocked crawler can\'t read any of this).\n' +
        '2. Upload the `md/` folder from `site/` to the root of your website, so this works: ' + exMd + '\n' +
        '3. Add each line of `head-tags.html` to the `<head>` of the page named above it.\n' +
        '4. Cloudflare Pages or Netlify: add `_headers` (merge it if you have one). Apache hosts (most WordPress hosting) use the `.htaccess` already in `md/`. Both tell Google the web page is the main version, so the copies don\'t compete with it in search.\n' +
        '5. Optional: put `llms.txt` at your site\'s root. If you already have one, compare first.\n' +
        '6. Check it: open ' + exMd + ' in a browser. You should see plain text, not an error page.\n\n' +
        '## Notes for your platform\n\n- **GitHub Pages:** add an empty file named `.nojekyll` at the root, or the .md files get turned into web pages.\n- **WordPress:** upload `md/` with your host\'s file manager or SFTP into the folder that holds `wp-config.php`. Add the head tags with a header-code plugin or your theme\'s settings.\n- **Webflow, Wix, Squarespace, Shopify:** these don\'t let you upload files at your own web addresses, so this route needs a different host for the copies. Use the page flags in Lil Rag Chunker to improve the pages themselves instead.\n\n' +
        '## Keep them in step\n\nThe copies are a snapshot from ' + d.fetched_at.slice(0, 10) + '. When a page changes, re-run Lil Rag Chunker and upload `md/` again, so AI agents don\'t read an old price or plan.\n';
    }
    // all
    return head('What goes where') +
      '| Your setup | Use | Or choose this preset in the tool |\n| --- | --- | --- |\n| ChatGPT Custom GPT | `markdown/` (at most 20 files, or `llms-full.txt` as one; GPTs are being retired) | ChatGPT: Custom GPT |\n| Claude Project | `markdown/` | Claude: Project |\n| Intercom Fin | needs Word or PDF files | Intercom: Fin AI Agent |\n| Chatbase | `markdown/` saved as .txt, or `chunks.csv` | Chatbase |\n| Your own vector database | `chunks.jsonl` | Developers: vector database |\n| Your website, for AI crawlers | Markdown copies of your pages, plus `llms.txt` | Your website: for AI crawlers |\n\n' +
      'Each preset reshapes the files for that platform and comes with step-by-step instructions.\n' + noFaq + after;
  }

  window.MC2RagPresets = { LIST: LIST, files: files, guide: guide };
})();
