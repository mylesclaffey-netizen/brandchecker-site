/* "Save to project": one small widget every tool page loads. It adds a button in the bottom-right corner; the panel
   lists the projects that belong to this access code, adds a new one, and saves the page you are looking at (its
   address, with a title, the tool and an optional note) into the chosen project. Nothing is requested until the
   panel is opened. The projects page (/tools/projects/) lists what has been saved. */
(function () {
  'use strict';
  if (window.__bcProjects || /\/tools\/projects\//.test(location.pathname)) return;
  window.__bcProjects = true;
  var API = 'https://mc2seo-tools-api.mylesclaffey.workers.dev/api';
  var qs = new URLSearchParams(location.search);
  var CODE = qs.get('k') || window.MC_VISITOR || '';
  if (!CODE) return;
  var slug = (location.pathname.match(/\/tools\/([^/]+)\//) || [])[1] || '';
  var LAST = 'bc-project:' + CODE;
  var projects = null, busy = false;

  var css = document.createElement('style');
  css.textContent =
    '.bcp-btn{position:fixed;right:16px;bottom:16px;z-index:2147483000;font:700 12px var(--mc-display,"Archivo",Arial,sans-serif);background:var(--ink,#0a0a0a);color:#fff;border:0;border-radius:8px;padding:10px 14px;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.25)}' +
    '.bcp-btn:hover{background:var(--you,#ff3d00)}' +
    '.bcp-panel{position:fixed;right:16px;bottom:60px;z-index:2147483000;width:320px;max-width:calc(100vw - 32px);background:#fff;color:#0a0a0a;border:1px solid var(--ink,#0a0a0a);border-radius:10px;padding:14px;font:12.5px var(--mc-mono,"IBM Plex Mono",monospace);box-shadow:0 6px 24px rgba(0,0,0,.25)}' +
    '.bcp-panel[hidden]{display:none}' +
    '.bcp-panel h2{font:700 13px var(--mc-display,"Archivo",Arial,sans-serif);margin:0 0 10px}' +
    '.bcp-panel label{display:block;font-size:11px;color:#3d3d3d;margin:10px 0 4px}' +
    '.bcp-panel select,.bcp-panel input{width:100%;font:13px var(--mc-mono,"IBM Plex Mono",monospace);color:#0a0a0a;background:#fff;border:1px solid var(--ink,#0a0a0a);border-radius:7px;padding:8px 9px}' +
    '.bcp-row{display:flex;gap:6px}.bcp-row input{flex:1}' +
    '.bcp-panel button.bcp-go{font:700 12px var(--mc-display,"Archivo",Arial,sans-serif);background:var(--you,#ff3d00);color:#fff;border:0;border-radius:7px;padding:8px 12px;cursor:pointer}' +
    '.bcp-panel button.bcp-go:disabled{opacity:.5;cursor:default}' +
    '.bcp-panel button.bcp-alt{font:700 12px var(--mc-display,"Archivo",Arial,sans-serif);background:#fff;color:#0a0a0a;border:1px solid var(--ink,#0a0a0a);border-radius:7px;padding:8px 12px;cursor:pointer}' +
    '.bcp-save{width:100%;margin-top:12px;padding:11px!important;font-size:13px!important}' +
    '.bcp-msg{margin-top:8px;font-size:11.5px;min-height:16px}.bcp-msg.bad{color:var(--bad,#d40000)}.bcp-msg.good{color:var(--ok,#00844a)}' +
    '.bcp-foot{margin-top:8px;font-size:11px}.bcp-foot a{color:var(--you,#ff3d00)}' +
    '@media print{.bcp-btn,.bcp-panel{display:none!important}}';
  document.head.appendChild(css);

  var btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'bcp-btn'; btn.textContent = '+ Save to project';
  btn.setAttribute('aria-expanded', 'false');
  var panel = document.createElement('div');
  panel.className = 'bcp-panel'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Save to project');
  panel.innerHTML =
    '<h2>Save this page to a project</h2>' +
    '<label for="bcpSel">Project</label><select id="bcpSel"><option value="">Loading…</option></select>' +
    '<label for="bcpNew">Or add a new project</label>' +
    '<div class="bcp-row"><input id="bcpNew" maxlength="60" placeholder="e.g. Acme Dental"><button type="button" class="bcp-alt" id="bcpAdd">Add</button></div>' +
    '<label for="bcpNote">Note (optional)</label><input id="bcpNote" maxlength="300" placeholder="e.g. before the schema fix">' +
    '<button type="button" class="bcp-go bcp-save" id="bcpSave" disabled>Save to project</button>' +
    '<div class="bcp-msg" id="bcpMsg"></div>' +
    '<div class="bcp-foot"><a id="bcpOpen" target="_blank" rel="noopener">Open my projects →</a></div>';
  document.body.appendChild(btn); document.body.appendChild(panel);
  var $ = function (id) { return panel.querySelector('#' + id); };
  $('bcpOpen').href = '/tools/projects/' + (/^v-/i.test(CODE) ? '' : '?k=' + encodeURIComponent(CODE));

  function say(text, cls) { var m = $('bcpMsg'); m.textContent = text || ''; m.className = 'bcp-msg' + (cls ? ' ' + cls : ''); }
  function api(path, body) {
    return fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ code: CODE }, body)) })
      .then(function (r) { return r.json(); }).catch(function () { return { error: 'Couldn\'t reach the server. Try again.' }; });
  }
  function fill(selectId) {
    var sel = $('bcpSel'), want = selectId || sel.value || '';
    try { want = want || localStorage.getItem(LAST) || ''; } catch (e) { /* no storage: nothing remembered */ }
    sel.innerHTML = '<option value="">' + (projects.length ? 'Choose a project…' : 'No projects yet — add one below') + '</option>' +
      projects.map(function (p) { return '<option value="' + p.id + '">' + p.name.replace(/[<&>"]/g, function (c) { return { '<': '&lt;', '&': '&amp;', '>': '&gt;', '"': '&quot;' }[c]; }) + ' (' + p.count + ')</option>'; }).join('');
    if (want && projects.some(function (p) { return p.id === want; })) sel.value = want;
    $('bcpSave').disabled = !sel.value;
  }
  function load() {
    if (projects) return;
    api('/projects/list', {}).then(function (d) {
      if (d.error) { projects = []; fill(); say(d.error, 'bad'); return; }
      projects = d.projects || []; fill();
    });
  }
  function toggle(open) {
    var show = open == null ? panel.hidden : open;
    panel.hidden = !show; btn.setAttribute('aria-expanded', String(show));
    if (show) { load(); say(''); }
  }
  btn.addEventListener('click', function () { toggle(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') toggle(false); });
  $('bcpSel').addEventListener('change', function () { $('bcpSave').disabled = !$('bcpSel').value; try { localStorage.setItem(LAST, $('bcpSel').value); } catch (e) { /* ignore */ } });

  $('bcpAdd').addEventListener('click', function () {
    var name = $('bcpNew').value.trim();
    if (!name || busy) return;
    busy = true; say('Adding…');
    api('/projects/create', { name: name }).then(function (d) {
      busy = false;
      if (d.error) { say(d.error, 'bad'); return; }
      projects = (projects || []).filter(function (p) { return p.id !== d.project.id; }); projects.push(d.project);
      projects.sort(function (a, b) { return a.name.localeCompare(b.name); });
      $('bcpNew').value = ''; fill(d.project.id);
      try { localStorage.setItem(LAST, d.project.id); } catch (e) { /* ignore */ }
      say(d.existing ? 'You already have that project, selected.' : 'Project added. Now save the page into it.', 'good');
    });
  });
  $('bcpNew').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('bcpAdd').click(); });

  $('bcpSave').addEventListener('click', function () {
    var id = $('bcpSel').value;
    if (!id || busy) return;
    busy = true; $('bcpSave').disabled = true; say('Saving…');
    api('/projects/add', { project_id: id, tool: slug, title: document.title, url: location.href, note: $('bcpNote').value.trim() }).then(function (d) {
      busy = false; $('bcpSave').disabled = false;
      if (d.error) { say(d.error, 'bad'); return; }
      var p = projects.filter(function (x) { return x.id === id; })[0]; if (p) p.count = d.project.count;
      fill(id); $('bcpNote').value = '';
      say(d.updated ? 'Already saved here: updated it.' : 'Saved ✓', 'good');
    });
  });
})();
