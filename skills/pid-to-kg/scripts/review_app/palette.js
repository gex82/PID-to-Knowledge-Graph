// Command palette: one search for assets, drawings, loops and views.
const squash = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const TYPE_RANK = { Equipment: 0, Instrument: 1, ControlLoop: 2, Component: 3, Boundary: 4, OffPageConnector: 5, PipeSegment: 6 };
const SEARCH = ASSETS.map(n => {
  const key = titleOf(n).toLowerCase();
  const hay = [n.id, n.tag, n.label, n.name, n.attributes?.printed_tag, n.kind && pretty(n.kind)].filter(Boolean).join(' ').toLowerCase();
  return { n, key, keyC: squash(key), hay, hayC: squash(hay) };
});
function searchAssets(q, filter, limit = 40) {
  q = q.trim().toLowerCase();
  const qc = squash(q), tokens = q.split(/\s+/).filter(Boolean), res = [];
  if (!q) return res;
  for (const s of SEARCH) {
    if (filter && !filter(s.n)) continue;
    let score = 0;
    if (s.key === q) score = 120;
    else if (s.key.startsWith(q)) score = 100;
    else if (qc && s.keyC.startsWith(qc)) score = 95;
    else if (s.key.includes(q)) score = 80;
    else if (qc && s.keyC.includes(qc)) score = 72;
    else if (s.hay.includes(q)) score = 60;
    else if (qc.length > 2 && s.hayC.includes(qc)) score = 50;
    else if (tokens.length > 1 && tokens.every(t => s.hay.includes(t))) score = 40;
    if (score) res.push({ s, score: score - (TYPE_RANK[s.n.type] ?? 9) - Math.min(8, s.key.length / 8) });
  }
  return res.sort((a, b) => b.score - a.score).slice(0, limit).map(r => r.s.n);
}
const PAL = { onPick: null, filter: null, rows: [], idx: 0 };
function openPalette(opts = {}) {
  PAL.onPick = opts.onPick || null; PAL.filter = opts.filter || null;
  byId('palette').hidden = false;
  byId('palette-hint').textContent = opts.hint || '';
  const input = byId('palette-input');
  input.placeholder = opts.placeholder || 'Search tags, names, drawings, loops…';
  input.value = ''; renderPalette(); input.focus();
}
function closePalette() { byId('palette').hidden = true; PAL.onPick = null; PAL.filter = null; }
function renderPalette() {
  const q = byId('palette-input').value, box = clear(byId('palette-results'));
  PAL.rows = []; PAL.idx = 0;
  const add = (el, run) => { el.setAttribute('role', 'option'); el.addEventListener('click', e => { e.stopImmediatePropagation(); run(); }, true); el.addEventListener('pointermove', () => setPalIdx(PAL.rows.findIndex(r => r.el === el))); PAL.rows.push({ el, run }); box.append(el); };
  const group = label => box.append(h('div', { class: 'palette-group', text: label }));
  const pick = id => () => { const cb = PAL.onPick; closePalette(); if (cb) return cb(id); const rec = [id, ...store.get('recent', []).filter(x => x !== id)].slice(0, 8); store.set('recent', rec); select(id); };
  if (!q.trim()) {
    const recent = store.get('recent', []).filter(id => NODES.has(id) && (!PAL.filter || PAL.filter(NODES.get(id))));
    if (recent.length) { group('Recent'); for (const id of recent) add(assetRow(id, sheetLabel(homeSheet(NODES.get(id)))), pick(id)); }
    if (!PAL.onPick) {
      group('Go to');
      for (const [k, v] of Object.entries(VIEWS)) add(h('button', { class: 'row-btn', type: 'button' }, h('span', { class: 'glyph' }, icon(v.icon)), h('span', { class: 'main' }, h('b', { text: v.label, style: { 'font-family': 'var(--sans)' } }), h('span', { text: v.hint }))), () => { closePalette(); go({ view: k }); });
    } else if (!recent.length) box.append(h('div', { class: 'empty', text: 'Type a tag or name.' }));
  } else {
    const found = searchAssets(q, PAL.filter);
    const byType = groupBy(found, n => n.type);
    for (const [type, list] of byType) { group(TYPES[type]?.plural || type); for (const n of list) add(assetRow(n.id, n.sheets?.map(sheetLabel).join(', ')), pick(n.id)); }
    if (!PAL.onPick) {
      const ql = q.trim().toLowerCase(), sheets = SHEETS.filter(s => `${s.label} ${s.name || ''}`.toLowerCase().includes(ql)).slice(0, 6);
      if (sheets.length) { group('Drawings'); for (const s of sheets) add(h('button', { class: 'row-btn t-Sheet', type: 'button' }, h('span', { class: 'glyph' }, icon('sheet')), h('span', { class: 'main' }, h('b', { text: s.label }), h('span', { text: s.name || '' }))), () => { closePalette(); go({ view: 'drawing', arg: s.label }); }); }
    }
    if (!PAL.rows.length) box.append(h('div', { class: 'empty', text: `Nothing matches “${q.trim()}”. Try part of a tag, e.g. 0401, or a word from the description.` }));
  }
  setPalIdx(0);
}
function setPalIdx(i) {
  if (!PAL.rows.length || i < 0) return;
  PAL.idx = (i + PAL.rows.length) % PAL.rows.length;
  PAL.rows.forEach((r, j) => { r.el.classList.toggle('active', j === PAL.idx); r.el.setAttribute('aria-selected', String(j === PAL.idx)); });
}
function initPalette() {
  const input = byId('palette-input');
  input.addEventListener('input', renderPalette);
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setPalIdx(PAL.idx + (e.key === 'ArrowDown' ? 1 : -1)); PAL.rows[PAL.idx]?.el.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter') { e.preventDefault(); PAL.rows[PAL.idx]?.run(); }
    else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
  });
  byId('palette').addEventListener('click', e => { if (e.target === byId('palette')) closePalette(); });
  byId('open-palette').addEventListener('click', () => openPalette());
}
