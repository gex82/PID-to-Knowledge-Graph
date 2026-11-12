// Home: plant status, what needs attention, and a way into every drawing.
function statCard(value, label, sub, onClick, tone) {
  return h(onClick ? 'button' : 'div', { class: 'stat' + (tone ? ' ' + tone : ''), type: onClick ? 'button' : null, on: onClick ? { click: onClick } : null },
    h('span', { class: 'stat-value', text: value }), h('span', { class: 'stat-label', text: label }), sub ? h('span', { class: 'stat-sub', text: sub }) : null);
}
function reviewCounts(list = ISSUES) {
  const c = { open: 0, needs_fix: 0, accepted: 0, notes: 0 };
  for (const i of list) { if (!needsReview(i)) c.notes++; else c[reviewOf(i).status]++; }
  c.total = c.open + c.needs_fix + c.accepted;
  return c;
}
function reviewMeter(c) {
  const t = Math.max(1, c.total);
  const m = h('span', { class: 'meter', title: `${c.accepted} reviewed · ${c.needs_fix} need a fix · ${c.open} open` });
  m.append(h('i', { style: { width: c.accepted / t * 100 + '%', background: 'var(--ok)' } }), h('i', { style: { width: c.needs_fix / t * 100 + '%', background: 'var(--bad)' } }), h('i', { style: { width: c.open / t * 100 + '%', background: 'var(--warn)' } }));
  return m;
}
VIEWS.home = {
  label: 'Home', icon: 'home', hint: 'Plant status and what needs attention',
  mount(root) {
    const count = t => ASSETS.filter(n => n.type === t).length;
    const page = h('div', { class: 'page' });
    const draw = () => {
      clear(page);
      const rc = reviewCounts(), conn = AN.connectivity || {}, loops = AN.loops?.loops || {};
      if (KG.review_meta?.stale_decisions) page.append(h('div', { class: 'notice warn', text: `${KG.review_meta.stale_decisions} saved decisions were not applied because their issue, plant or graph revision no longer matches.` }));
      const statuses = [...new Set(SHEETS.map(s => s.attributes?.issue_status).filter(Boolean))];
      page.append(h('div', { class: 'hero' },
        h('div', null, h('div', { class: 'eyebrow', text: 'P&ID knowledge graph · review workbench' }), h('h1', { class: 'hero-title', text: KG.plant?.name || 'Plant' }),
          h('p', { class: 'hero-sub', text: 'Find an asset, follow what feeds it, see what measures and controls it, and check each answer against the drawing.' })),
        h('div', { class: 'hero-actions' }, btn('Search', 'search', () => openPalette(), 'primary'), btn('Process map', 'map', () => go({ view: 'map' })), btn('Drawings', 'drawing', () => go({ view: 'drawing' })))));
      if (statuses.length || KG.source_review?.summary) page.append(h('div', { class: 'notice', style: { 'margin-bottom': '16px' } },
        statuses.length ? h('div', null, h('b', { text: 'Source status: ' }), statuses.join(' · ')) : null, KG.source_review?.summary ? h('div', { text: KG.source_review.summary }) : null));
      page.append(h('div', { class: 'stats' },
        statCard(count('Equipment'), 'Equipment', `${conn.unconnected?.length || 0} without a process connection`, () => go({ view: 'lists', arg: 'equipment' })),
        statCard(count('Instrument'), 'Instrument functions', `${Object.keys(AN.variables || {}).length} measured variables`, () => go({ view: 'lists', arg: 'instruments' })),
        statCard(count('ControlLoop'), 'Inferred loop groups', `${Object.values(loops).filter(l => l.missing.length).length} with missing members`, () => go({ view: 'loops' })),
        statCard(AN.valves?.total ?? 0, 'Valves', `${count('Component') - (AN.valves?.total ?? 0)} other fittings`, () => go({ view: 'lists', arg: 'valves' })),
        statCard(SHEETS.length, 'Drawings', `${Object.keys(KG.page_images || {}).length} with the sheet image`, () => go({ view: 'drawing' })),
        statCard(rc.open, 'Open review items', `${rc.accepted} reviewed · ${rc.needs_fix} need a fix`, () => go({ view: 'review' }), rc.open ? 'warn' : 'ok')));

      const attention = [];
      const att = (n, title, detail, action, tone) => { if (n) attention.push({ n, title, detail, action, tone }); };
      att(rc.open, 'review items are still open', 'Warnings awaiting an explicit acceptance or correction decision; source-review notes are retained.', () => go({ view: 'review', params: { status: 'open' } }), 'warn');
      att(rc.needs_fix, 'review items are marked as needing a fix', 'Decisions that call for a correction to the extraction.', () => go({ view: 'review', params: { status: 'needs_fix' } }), 'bad');
      const incomplete = Object.entries(loops).filter(([id, l]) => l.missing.length && ['control', 'on_off', 'interlock'].includes(NODES.get(id)?.kind));
      att(incomplete.length, 'control or interlock loops are missing a sensor, controller or final element', 'The drawings do not show the whole loop, or part of it was not extracted.', () => go({ view: 'loops', params: { show: 'incomplete' } }), 'warn');
      att(conn.off_page?.unmatched?.length, 'off-page connectors have no partner', 'Flow cannot be followed across these sheet breaks.', () => go({ view: 'lists', arg: 'connectors', params: { q: 'unmatched' } }), 'warn');
      att(conn.unconnected?.length, 'equipment items have no process connection', 'Often panels, enclosures and vendor packages; worth a look for missed lines.', () => go({ view: 'analytics', params: { focus: 'connectivity' } }), 'info');
      att(AN.uninstrumented?.length, 'equipment items have no instrument on them or their piping', 'No measurement was extracted within the local piping search; check the source drawing.', () => go({ view: 'analytics', params: { focus: 'instrumentation' } }), 'info');
      att(AN.low_confidence?.length, 'items were extracted with low confidence', 'Below 0.80. Check these first if a result looks wrong.', () => go({ view: 'analytics', params: { focus: 'extraction' } }), 'info');
      const attCard = h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', { text: 'Worth your attention' }), h('span', { class: 'sub', text: 'From the graph and the review record' })),
        h('div', { class: 'card-body att-list' }, attention.length ? attention.slice(0, 6).map(x => h('button', { class: 'att', type: 'button', on: { click: x.action } }, h('span', { class: 'att-n pill ' + x.tone, text: x.n }), h('span', { class: 'grow' }, h('b', { text: x.title }), h('span', { text: x.detail })), icon('right'))) : h('div', { class: 'empty', text: 'Nothing flagged. That is not a measure of extraction accuracy.' })));

      const top = (AN.connectivity?.chokepoints || []).slice(0, 6);
      const reach = Object.entries(AN.connectivity?.reach || {}).sort((a, b) => b[1].down - a[1].down).slice(0, 6);
      const keyCard = h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', { text: 'Most connected equipment' }), h('span', { class: 'sub', text: 'Equipment downstream on the drawings' })),
        h('div', { class: 'card-body', style: { padding: '6px 4px 10px' } }, reach.length ? reach.map(([id, r]) => assetRow(id, `${r.down} downstream${top.find(c => c.id === id && c.cut) ? ' · single link' : ''}`)) : h('div', { class: 'empty', text: 'No equipment-to-equipment flow in this graph.' })));
      page.append(h('div', { class: 'home-grid' }, attCard, keyCard));

      const sheetCards = new Map((AN.sheets || []).map(s => [s.id, s]));
      const grid = h('div', { class: 'sheet-grid' });
      for (const s of SHEETS) {
        const c = sheetCards.get(s.id), rcS = reviewCounts(ISSUES.filter(i => i.sheet === s.id));
        grid.append(h('button', { class: 'sheet-card', type: 'button', on: { click: () => go({ view: 'drawing', arg: s.label }) } },
          h('span', { class: 'sheet-top' }, h('b', { class: 'mono', text: s.label }), s.attributes?.page ? h('span', { class: 'dim small', text: 'p. ' + s.attributes.page }) : null),
          h('span', { class: 'sheet-title', text: s.name || s.attributes?.title || '' }),
          h('span', { class: 'sheet-counts' }, ['Equipment', 'Instrument', 'Component', 'ControlLoop'].map(t => h('span', { class: `t-${t}`, title: TYPES[t].plural }, h('span', { class: 'dot' }), c?.counts?.[t] || 0))),
          rcS.total ? h('span', { class: 'sheet-rev' }, reviewMeter(rcS), h('span', { class: 'dim small', text: rcS.open ? `${rcS.open} open` : 'all reviewed' })) : h('span', { class: 'sheet-rev dim small', text: 'No warnings' })));
      }
      page.append(h('div', { class: 'card', style: { 'margin-top': '16px' } }, h('div', { class: 'card-head' }, h('h2', { text: 'Drawings' }), h('span', { class: 'sub', text: 'Counts: equipment, instrument functions, valves and fittings, inferred loops' })), h('div', { class: 'card-body' }, grid)));
      page.append(h('div', { class: 'notice warn', style: { 'margin-top': '16px' } }, 'This graph describes drawing connectivity. It does not establish current equipment state, safe isolation, or a causal fault diagnosis. Machine-extracted results require engineering review.'),
        h('p', { class: 'dim small', style: { 'margin-top': '12px' }, text: `${KG.generator || 'pid-to-kg'} · ${SHEETS.length} sheets · built ${KG.generated_at || ''} · offline, no network calls` }));
    };
    draw();
    const off = bus.on('decisions', draw);
    root.append(h('div', { class: 'view' }, h('div', { class: 'scroll' }, page)));
    return { destroy: off, update() {} };
  },
};
