// Analytics: what the graph says about instrumentation, control, connectivity
// and the state of the extraction. Every mark links to the items behind it.
function barList(items, opts = {}) {
  const max = Math.max(1, ...items.map(i => i.value)), box = h('div', { class: 'bars' });
  for (const it of items) {
    const row = h(it.onClick ? 'button' : 'div', { class: 'bar-row', type: it.onClick ? 'button' : null, on: it.onClick ? { click: it.onClick } : null },
      h('span', { class: 'bar-label' + (opts.mono ? ' mono' : ''), text: it.label }), h('span', { class: 'bar-track' }, h('i', { style: { width: Math.max(it.value ? 1.5 : 0, it.value / max * 100) + '%' } })), h('span', { class: 'bar-value', text: opts.fmt ? opts.fmt(it.value) : it.value }));
    tip(row, `${it.label}: ${opts.fmt ? opts.fmt(it.value) : it.value}`, it.sub || opts.unit || '');
    box.append(row);
  }
  if (!items.length) box.append(h('div', { class: 'dim small', text: opts.empty || 'Nothing to show.' }));
  return box;
}
function stackBar(parts, opts = {}) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1, bar = h('div', { class: 'stack' + (opts.thin ? ' thin' : '') });
  for (const p of parts) { if (!p.value) continue; const seg = h(p.onClick ? 'button' : 'span', { class: 'seg-part', type: p.onClick ? 'button' : null, style: { 'flex-grow': p.value, background: p.color }, on: p.onClick ? { click: p.onClick } : null }); tip(seg, `${p.label}: ${p.value}`, `${Math.round(p.value / total * 100)}% of ${total}`); bar.append(seg); }
  return bar;
}
const legend = parts => h('div', { class: 'legend' }, parts.map(p => h('span', null, h('i', { style: { background: p.color } }), p.label, p.value !== undefined ? h('b', { text: p.value }) : null)));
function card(id, title, sub, span, ...kids) { return h('section', { class: 'card an-card', id: 'an-' + id, style: { 'grid-column': `span ${span}` } }, h('div', { class: 'card-head' }, h('h2', { text: title }), sub ? h('span', { class: 'sub', text: sub }) : null), h('div', { class: 'card-body' }, kids)); }
const subhead = t => h('h3', { class: 'an-sub', text: t });
VIEWS.analytics = {
  label: 'Analytics', icon: 'analytics', hint: 'Instrumentation, control, connectivity and extraction quality',
  mount(root, r0) {
    const page = h('div', { class: 'page' });
    const draw = () => {
      clear(page);
      const grid = h('div', { class: 'an-grid' }), conn = AN.connectivity || {}, rc = reviewCounts();
      const ST = { accepted: 'var(--st-good)', needs_fix: 'var(--st-crit)', open: 'var(--st-warn)' };
      // --- review
      const parts = [{ label: 'Reviewed', value: rc.accepted, color: ST.accepted, onClick: () => go({ view: 'review', params: { status: 'accepted' } }) }, { label: 'Needs fix', value: rc.needs_fix, color: ST.needs_fix, onClick: () => go({ view: 'review', params: { status: 'needs_fix' } }) }, { label: 'Open', value: rc.open, color: ST.open, onClick: () => go({ view: 'review', params: { status: 'open' } }) }];
      const codes = [...groupBy(ISSUES, i => i.code)].sort((a, b) => b[1].length - a[1].length), maxCell = Math.max(1, ...codes.flatMap(([, l]) => [...countBy(l, i => i.sheet || '').values()]));
      const heat = h('table', { class: 'heat' }, h('thead', null, h('tr', null, h('th'), SHEETS.map(s => h('th', { title: s.name || '' }, h('span', { text: s.label }))), h('th', { class: 'num', text: 'All' }))),
        h('tbody', null, codes.map(([code, l]) => { const by = countBy(l, i => i.sheet || ''); return h('tr', null, h('th', { scope: 'row', text: codeLabel(code) }), SHEETS.map(s => { const v = by.get(s.id) || 0; if (!v) return h('td'); const step = Math.min(5, Math.ceil(v / maxCell * 5)); const b = h('button', { type: 'button', class: 'heat-cell s' + step, text: v, on: { click: () => go({ view: 'review', params: { code, sheet: s.label, status: 'all' } }) } }); tip(b, `${codeLabel(code)} on ${s.label}`, `${v} item${v === 1 ? '' : 's'}`); return h('td', null, b); }), h('td', { class: 'num mono', text: l.length })); })));
      grid.append(card('review', 'Review state', `${rc.total} warnings · ${rc.notes} informational notes`, 12, stackBar(parts), legend(parts), subhead('Where the QA items are: issue type by drawing'), h('div', { class: 'heat-wrap' }, heat)));
      // --- extraction
      const seq = ['var(--seq-1)', 'var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)'], buckets = ['<0.70', '0.70-0.79', '0.80-0.89', '0.90-1.00'];
      const confRows = Object.entries(AN.confidence || {}).map(([type, b]) => h('div', { class: 'conf-row' }, h('span', { class: `bar-label t-${type}` }, h('span', { class: 'dot' }), ' ', TYPES[type]?.plural || type), stackBar(buckets.map((k, i) => ({ label: `${TYPES[type]?.plural || type}, confidence ${k}`, value: b[k] || 0, color: seq[i] })), { thin: true }), h('span', { class: 'bar-value', text: Object.values(b).reduce((s, v) => s + v, 0) })));
      grid.append(card('extraction', 'Extraction confidence', 'Estimates from the reading step, not calibrated probabilities', 5, confRows, legend(buckets.map((k, i) => ({ label: k, color: seq[i] }))),
        subhead(`Lowest-confidence items (${(AN.low_confidence || []).length})`), (AN.low_confidence || []).length ? chipList(AN.low_confidence, 14) : h('p', { class: 'dim small', text: 'Nothing below 0.80.' })));
      const sc = AN.sheets || [];
      grid.append(card('sheets', 'Drawing scorecards', 'Select a row to open the drawing', 7, h('div', { class: 'heat-wrap' }, h('table', { class: 'table compact' }, h('thead', null, h('tr', null, ['Drawing', 'Equip.', 'Instr.', 'Valves', 'Loops', 'Mean conf.', 'Open', 'Unreadable'].map((t, i) => h('th', { class: i ? 'num' : '' }, h('span', { text: t }))))),
        h('tbody', null, sc.map(s => h('tr', { tabindex: 0, title: s.title, on: { click: () => go({ view: 'drawing', arg: s.label }), keydown: e => { if (e.key === 'Enter') go({ view: 'drawing', arg: s.label }); } } }, h('td', { class: 'mono', text: s.label }), [s.counts.Equipment, s.counts.Instrument, s.counts.Component, s.counts.ControlLoop].map(v => h('td', { class: 'num', text: v || 0 })), h('td', { class: 'num', text: s.mean_confidence === null ? '—' : s.mean_confidence.toFixed(2) }), h('td', { class: 'num' }, reviewCounts(ISSUES.filter(i => i.sheet === s.id)).open || '0'), h('td', { class: 'num', text: s.unreadable })))))),
        h('p', { class: 'dim small', style: { 'margin-top': '8px' }, text: '"Unreadable" counts reviewer notes about text or symbols that could not be read on that sheet.' })));
      // --- instrumentation
      const eq = Object.entries(AN.equipment || {});
      grid.append(card('instrumentation', 'Instrumentation', 'What is measured, and where it is read', 6,
        subhead('Instrument functions by measured variable'), barList(Object.entries(AN.variables || {}).slice(0, 12).map(([k, v]) => ({ label: cap(k), value: v, onClick: () => go({ view: 'lists', arg: 'instruments', params: { q: k } }) }))),
        subhead('By location'), barList(Object.entries(AN.locations || {}).map(([k, v]) => ({ label: cap(k), value: v, onClick: () => go({ view: 'lists', arg: 'instruments', params: { q: pretty(k).toLowerCase() } }) })))));
      grid.append(card('coverage', 'Instrument coverage by equipment', 'Instruments on the item or its own piping', 6,
        subhead('Most instrumented'), barList(eq.map(([id, c]) => ({ id, value: c.instruments.length })).filter(x => x.value).sort((a, b) => b.value - a.value).slice(0, 10).map(x => ({ label: titleOf(NODES.get(x.id)), value: x.value, sub: subOf(NODES.get(x.id)), onClick: () => select(x.id) })), { mono: true }),
        subhead(`No instrument drawn (${(AN.uninstrumented || []).length})`), (AN.uninstrumented || []).length ? chipList(AN.uninstrumented, 16) : h('p', { class: 'dim small', text: 'Every equipment item has at least one.' })));
      // --- control
      const byType = Object.entries(AN.loops?.by_type || {}), LC = [{ k: 'complete', label: 'Required members present', color: 'var(--st-good)' }, { k: 'incomplete', label: 'Something missing', color: 'var(--st-warn)' }];
      const missCount = countBy(Object.values(AN.loops?.loops || {}).flatMap(l => l.missing), x => x);
      grid.append(card('control', 'Loops', 'Checks member presence only; signal continuity and control logic are not validated', 6,
        byType.map(([t, c]) => h('div', { class: 'conf-row' }, h('span', { class: 'bar-label', text: cap(t) }), stackBar(LC.map(x => ({ label: `${cap(t)}: ${x.label.toLowerCase()}`, value: c[x.k] || 0, color: x.color, onClick: () => go({ view: 'loops', params: { show: x.k } }) })), { thin: true }), h('span', { class: 'bar-value', text: (c.complete || 0) + (c.incomplete || 0) }))), legend(LC),
        subhead('What is missing'), barList([...missCount].map(([k, v]) => ({ label: cap(pretty(k).replace(/s$/, '')), value: v, onClick: () => go({ view: 'loops', params: { show: 'incomplete' } }) })), { empty: 'Every loop group has its expected member roles; signal continuity is not checked.' })));
      // --- valves
      const V = AN.valves || {};
      grid.append(card('valves', 'Valves', `${V.total || 0} valves on the drawings`, 6, subhead('By type'), barList(Object.entries(V.by_kind || {}).map(([k, v]) => ({ label: cap(k), value: v, onClick: () => go({ view: 'lists', arg: 'valves', params: { q: pretty(k) } }) }))),
        h('div', { class: 'an-two' }, h('div', null, subhead('Actuator'), barList(Object.entries(V.by_actuator || {}).map(([k, v]) => ({ label: cap(k), value: v })))), h('div', null, subhead('Normal position'), barList(Object.entries(V.by_position || {}).map(([k, v]) => ({ label: cap(k), value: v })))))));
      // --- connectivity
      const reach = Object.entries(conn.reach || {}).sort((a, b) => b[1].down - a[1].down).slice(0, 10);
      grid.append(card('connectivity', 'What depends on what', 'Equipment downstream of each item, following flow on the drawings', 6,
        barList(reach.map(([id, r]) => ({ label: titleOf(NODES.get(id)), value: r.down, sub: `${subOf(NODES.get(id))} · ${r.up} upstream`, onClick: () => go({ view: 'map', params: { sel: id } }) })), { mono: true, empty: 'No equipment-to-equipment flow.' }),
        subhead('Flow chokepoints'), (conn.chokepoints || []).length ? h('div', { class: 'insp-list', style: { margin: 0 } }, conn.chokepoints.slice(0, 6).map(c => assetRow(c.id, c.cut ? h('span', { class: 'pill warn', title: 'Removing it splits the drawn flow network', text: 'single link' }) : h('span', { class: 'dim small', text: 'on many routes' })))) : h('p', { class: 'dim small', text: 'None found.' }),
        h('p', { class: 'dim small', style: { 'margin-top': '8px' }, text: 'Structural position in the drawings only. This is not a reliability or criticality rating.' })));
      const op = conn.off_page || { total: 0, matched: 0, unmatched: [] };
      const opParts = [{ label: 'Matched', value: op.matched, color: 'var(--st-good)' }, { label: 'No partner', value: op.total - op.matched, color: 'var(--st-warn)', onClick: () => go({ view: 'lists', arg: 'connectors', params: { q: 'unmatched' } }) }];
      grid.append(card('gaps', 'Loops in the flow, and gaps', 'Recirculation, unconnected equipment and sheet-to-sheet links', 6,
        subhead(`Recirculation groups (${(conn.recirculation || []).length})`), (conn.recirculation || []).length ? conn.recirculation.map(gp => h('div', { class: 'recirc' }, chipList(gp, 8))) : h('p', { class: 'dim small', text: 'No recirculation between equipment.' }),
        subhead(`Equipment with no process connection (${(conn.unconnected || []).length})`), (conn.unconnected || []).length ? chipList(conn.unconnected, 14) : h('p', { class: 'dim small', text: 'None.' }),
        subhead(`Off-page connectors (${op.total})`), stackBar(opParts, { thin: true }), legend(opParts), op.unmatched.length ? chipList(op.unmatched, 8) : null));
      page.append(h('div', { class: 'hero', style: { 'margin-bottom': '14px' } }, h('div', null, h('div', { class: 'eyebrow', text: 'Analytics' }), h('h1', { class: 'hero-title', style: { 'font-size': '22px' }, text: 'What the drawings add up to' }), h('p', { class: 'hero-sub', text: 'Counts and structure from the graph. Select any bar, cell or tag to see the items behind it.' }))), grid);
    };
    draw();
    root.append(h('div', { class: 'view' }, h('div', { class: 'scroll' }, page)));
    const focus = r => { const el = r.params.focus && byId('an-' + r.params.focus); if (el) { el.scrollIntoView({ block: 'start' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1400); } };
    requestAnimationFrame(() => focus(r0));
    const off = bus.on('decisions', draw);
    return { update: (r, p) => { if (r.params.focus !== p.params.focus) focus(r); }, destroy: off };
  },
};
