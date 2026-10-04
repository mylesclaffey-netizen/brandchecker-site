/* Open access: no access code is needed. Each browser makes up a private visitor id (24 random hex characters,
   kept in localStorage) that the API treats as the visitor's own code — it keeps their history and trackers
   apart from everyone else's. An access link (?k=…) or a code saved earlier still wins. Exposes window.MC_VISITOR (and window.BC_ACCOUNT when signed in). */
(function () {
  var KEY = 'mc_visitor', id = '';
  try { id = localStorage.getItem(KEY) || ''; } catch (e) { /* storage blocked */ }
  if (!/^v-[a-f0-9]{24}$/.test(id)) {
    var a = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(a);
    id = 'v-' + Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    try { localStorage.setItem(KEY, id); } catch (e) { /* keeps working for this page load */ }
  }
  // A signed-in credit account (account/index.html saves it) takes the visitor id's place, so every tool runs on it.
  var acct = '';
  try { acct = localStorage.getItem('bc_account') || ''; } catch (e) { /* storage blocked */ }
  window.BC_ACCOUNT = /^c-[a-f0-9]{24}$/.test(acct) ? acct : '';
  window.MC_VISITOR = window.BC_ACCOUNT || id;
})();
