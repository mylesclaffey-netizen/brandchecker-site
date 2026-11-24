/* Project context: when a tool page runs inside the Local Search platform (in a frame), the platform tells it which
   project is selected and the project's business details. A tool registers once with bcProject.on(fn); fn gets the
   project ({ id, name, business, website, city, keyword, language }) now if it is already known, and again whenever the
   person picks another project. Outside the platform nothing is ever sent and the tool behaves as before. */
(function () {
  'use strict';
  if (window.bcProject) return;
  var current = null, subs = [];
  window.bcProject = {
    get: function () { return current; },
    on: function (fn) { subs.push(fn); if (current) { try { fn(current); } catch (e) { /* a tool's own bug must not stop the others */ } } }
  };
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (e.origin !== location.origin || !d || d.type !== 'bc-project') return;
    current = d.project || null;
    if (current) subs.forEach(function (fn) { try { fn(current); } catch (x) { /* ignore */ } });
  });
  if (window.parent !== window) { try { window.parent.postMessage({ type: 'bc-project-request' }, location.origin); } catch (e) { /* not framed by us */ } }
})();
