// Boot: rail, theme, shortcuts.
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  clear(byId('theme-btn')).append(icon(t === 'dark' ? 'sun' : 'moon'));
  try { localStorage.setItem('process-atlas:theme', t); } catch (_) { /* private mode */ }
  bus.emit('theme', t);
}
function currentTheme() { return document.documentElement.dataset.theme; }
function buildRail() {
  const rail = byId('rail');
  for (const [k, v] of Object.entries(VIEWS)) {
    const b = h('button', { class: 'rail-btn', type: 'button', title: v.hint, data: { view: k }, on: { click: () => go({ view: k }) } }, icon(v.icon), h('span', { text: v.short || v.label }));
    rail.append(b);
  }
  const badge = () => {
    const b = rail.querySelector('[data-view=review]'); if (!b) return;
    b.querySelector('.rail-badge')?.remove();
    const n = openIssues().length; if (n) b.append(h('span', { class: 'rail-badge', text: n > 99 ? '99+' : n, 'aria-label': `${n} open review items` }));
  };
  badge(); bus.on('decisions', badge);
}
function showHelp() {
  const box = clear(byId('help').firstElementChild);
  const rows = [['/ or ⌘K', 'Search everything'], ['1 – 8', 'Switch view'], ['[ and ]', 'Previous / next drawing'], ['+ − 0', 'Zoom in, out, fit (map and drawings)'], ['J and K', 'Next / previous review item'], ['A · F · O', 'Review: accept, needs fix, reopen'], ['I', 'Show or hide the inspector'], ['T', 'Light / dark'], ['Esc', 'Close a dialog or clear the selection']];
  box.append(h('h2', { text: 'Keyboard shortcuts' }), h('div', { class: 'help-grid' }, rows.map(([k, d]) => [h('span', null, k.split(' ').map(p => /^(or|and|–|·)$/.test(p) ? ` ${p} ` : h('kbd', { text: p }))), h('span', { text: d })])),
    h('p', { class: 'dim small', style: { 'margin-top': '14px' }, text: 'Links are shareable: the address bar always holds the current view and selection.' }));
  byId('help').hidden = false;
}
function boot() {
  let theme = null;
  try { theme = localStorage.getItem('process-atlas:theme'); } catch (_) { /* private mode */ }
  setTheme(theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  byId('plant-name').textContent = KG.plant?.name || 'Plant';
  byId('plant-meta').textContent = `${SHEETS.length} drawings · ${ASSETS.length.toLocaleString()} items`;
  byId('palette-key').textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : '/';
  clear(byId('inspector-btn')).append(icon('panel'));
  byId('theme-btn').addEventListener('click', () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark'));
  byId('inspector-btn').addEventListener('click', () => document.body.classList.toggle('no-inspector'));
  byId('help-btn').addEventListener('click', showHelp);
  byId('help').addEventListener('click', e => { if (e.target === byId('help')) byId('help').hidden = true; });
  if (innerWidth <= 1100) document.body.classList.add('no-inspector');
  buildRail(); initPalette();
  addEventListener('hashchange', applyRoute);
  addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
    if (e.key === 'Escape') {
      if (!byId('palette').hidden) return closePalette();
      if (!byId('help').hidden) { byId('help').hidden = true; return; }
      if (typing) return e.target.blur();
      if (selected()) go({ params: { sel: null } });
      return;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey || !byId('palette').hidden) return;
    const keys = Object.keys(VIEWS);
    if (e.key === '/') { e.preventDefault(); openPalette(); }
    else if (e.key === '?') showHelp();
    else if (/^[1-9]$/.test(e.key) && keys[e.key - 1]) go({ view: keys[e.key - 1] });
    else if (e.key.toLowerCase() === 't') setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
    else if (e.key.toLowerCase() === 'i') document.body.classList.toggle('no-inspector');
    else current?.key?.(e);
  });
  applyRoute();
}
boot();
