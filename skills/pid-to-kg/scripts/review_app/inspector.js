// Right-hand inspector: everything known about the selected item, with evidence.
const REL = [
  ['FEEDS', 'Feeds', 'Fed by'], ['MEASURES', 'Measures', 'Measured by'], ['ACTUATES', 'Actuates', 'Actuated by'], ['TRIPS', 'Trips', 'Tripped by'],
  ['SIGNAL_TO', 'Signal to', 'Signal from'], ['MEMBER_OF', 'In loop', 'Members'], ['CASCADES_TO', 'Cascades to', 'Cascade from'],
  ['PART_OF', 'Part of', 'Parts'], ['FLOWS_TO', 'Flows to', 'Flows from'],
];
function sec(title, count, ...kids) {
  return h('section', { class: 'insp-sec' }, h('h3', null, title, count !== null && count !== undefined ? h('span', { class: 'count', text: count }) : null), kids);
}
function chipList(ids, max = 14) {
  const box = h('div', { class: 'chips' });
  const show = list => { clear(box); for (const id of list) box.append(assetChip(id)); if (list.length < ids.length) box.append(h('button', { class: 'chip', type: 'button', text: `+${ids.length - list.length} more`, on: { click: () => show(ids) } })); };
  show(ids.slice(0, max));
  return box;
}
/** Zoomed crop of the drawing around a bounding box. */
function cropThumb(prov, onClick) {
  const src = pageImage(prov.page);
  if (!src || !prov.bbox) return null;
  const W = 336, H = 196;
  const el = h('button', { class: 'crop', type: 'button', title: 'Open on the drawing', style: { 'aspect-ratio': `${W}/${H}` }, on: { click: onClick } });
  const img = h('img', { alt: `Drawing ${sheetLabel(prov.sheet)} around this item`, draggable: 'false' }), box = h('span', { class: 'box' });
  const place = (pw, ph) => {
    const [x0, y0, x1, y1] = prov.bbox, bw = (x1 - x0) * pw, bh = (y1 - y0) * ph;
    const rw = Math.min(pw, Math.max(bw * 2.4, pw * 0.13, bh * 2.2 * W / H)), rh = rw * H / W;
    const rx = Math.max(0, Math.min(pw - rw, (x0 + x1) / 2 * pw - rw / 2)), ry = Math.max(0, Math.min(Math.max(0, ph - rh), (y0 + y1) / 2 * ph - rh / 2));
    Object.assign(img.style, { width: pw / rw * 100 + '%', left: -rx / rw * 100 + '%', top: -ry / rh * 100 + '%' });
    Object.assign(box.style, { left: (x0 * pw - rx) / rw * 100 + '%', top: (y0 * ph - ry) / rh * 100 + '%', width: bw / rw * 100 + '%', height: bh / rh * 100 + '%' });
  };
  const size = pageSize(prov.page);
  if (size) place(size.w, size.h); else img.addEventListener('load', () => place(img.naturalWidth, img.naturalHeight));
  img.src = src;
  el.append(img, box);
  return el;
}
function openOnDrawing(id, sheetId) { const n = NODES.get(id); go({ view: 'drawing', arg: sheetLabel(sheetId || homeSheet(n)), params: { sel: id } }); }

function renderInspector(id) {
  const root = clear(byId('inspector'));
  root.scrollTop = 0;
  if (!id) {
    root.append(h('div', { class: 'insp-empty' }, h('b', { text: 'Nothing selected' }), 'Pick an item on the map, a drawing or a list, or press ', h('kbd', { text: '/' }), ' to search. Everything known about it shows here, with the drawing evidence.'));
    return;
  }
  const n = NODES.get(id), a = n.attributes || {}, T = TYPES[n.type] || { label: n.type };
  const prov = locate(n), sheetIds = n.sheets || [];
  const head = h('div', { class: 'insp-head' },
    h('div', { class: `insp-type t-${n.type}` }, h('span', { class: 'dot' }), h('span', { class: 'eyebrow', text: T.label + (n.kind && n.kind !== 'other' ? ' · ' + pretty(n.kind) : '') })),
    h('div', { class: 'insp-title', text: titleOf(n) }),
    n.name && n.name !== titleOf(n) ? h('div', { class: 'insp-name', text: n.name }) : null,
    h('div', { class: 'insp-meta' },
      sheetIds.map(s => h('button', { class: 'pill', type: 'button', title: 'Open this drawing', text: sheetLabel(s), on: { click: () => openOnDrawing(id, s) } })),
      confMeter(n.confidence),
      n.status ? h('span', { class: 'pill', text: pretty(n.status) }) : null,
      a.untagged ? h('span', { class: 'pill warn', text: 'No tag printed' }) : null));
  const actions = h('div', { class: 'insp-actions' });
  if (prov || sheetIds.length) actions.append(btn('Drawing', 'drawing', () => openOnDrawing(id), 'sm'));
  if (isTerminal(n)) actions.append(btn('Map', 'map', () => go({ view: 'map', params: { sel: id } }), 'sm'));
  const flows = outE(id, 'FLOWS_TO').length + inE(id, 'FLOWS_TO').length;
  if (flows) {
    actions.append(btn('Downstream', 'down', () => go({ view: 'trace', params: { from: id, mode: 'down', to: null, sel: id } }), 'sm'),
      btn('Upstream', 'up', () => go({ view: 'trace', params: { from: id, mode: 'up', to: null, sel: id } }), 'sm'),
      btn('Path to…', 'right', () => openPalette({ hint: `Route from ${titleOf(n)} to…`, filter: x => x.id !== id && x.type !== 'ControlLoop' && x.type !== 'Instrument', onPick: to => go({ view: 'trace', params: { from: id, to, mode: 'path', sel: id } }) }), 'sm'));
  }
  const loopId = n.type === 'ControlLoop' ? id : outE(id, 'MEMBER_OF')[0]?.target;
  if (loopId) actions.append(btn('Loop diagram', 'loops', () => go({ view: 'loops', arg: loopId, params: { sel: id } }), 'sm'));
  head.append(actions);
  root.append(head);

  if (prov) {
    const crop = cropThumb(prov, () => openOnDrawing(id, prov.sheet));
    if (crop) root.append(sec('On the drawing', `${sheetLabel(prov.sheet)} · PDF page ${prov.page}`, crop));
  }

  // Facts specific to the kind of item.
  const facts = [];
  const fact = (k, v) => { if (v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)) facts.push([k, Array.isArray(v) ? v.map(pretty).join(', ') : v]); };
  if (n.type === 'Instrument') { fact('ISA letters', a.isa_letters); fact('Measured variable', a.variable); fact('Functions', a.functions); fact('Role', a.role); fact('Location', a.location); fact('Panel', a.panel_tag); fact('Printed as', a.printed_tag); }
  else if (n.type === 'Component') { fact('Type', n.kind); fact('Actuator', a.actuator); fact('Normal position', a.normal_position); fact('Position basis', a.normal_position_basis); fact('Size', a.size); fact('Symbol', a.symbol); }
  else if (n.type === 'PipeSegment') { fact('Line', a.line_number || a.line_id); fact('Service', a.service); fact('Size', a.size); fact('Segment', a.segments ? `${a.segment} of ${a.segments}` : null); fact('Flow direction', a.flow_direction); }
  else if (n.type === 'ControlLoop') { fact('Loop type', a.loop_type || n.kind); fact('Variable', a.variable); const miss = AN.loops?.loops?.[id]?.missing || []; if (miss.length) fact('Missing from loop group', miss.map(m => pretty(m).replace(/s$/, ''))); }
  else if (n.type === 'OffPageConnector' || n.type === 'Boundary') { fact('Direction', a.direction); fact('Other drawing', a.other_drawing); }
  else if (n.type === 'Equipment') { fact('Type', n.kind); const r = AN.connectivity?.reach?.[id]; if (r) { fact('Equipment downstream', r.down); fact('Equipment upstream', r.up); } }
  fact('Printed fragment', a.printed_tag_fragment);
  if (facts.length || a.description || a.notes) {
    const dl = h('dl', { class: 'kv' }); for (const [k, v] of facts) dl.append(h('dt', { text: k }), h('dd', { text: String(v) }));
    root.append(sec('Key facts', null, a.description ? h('p', { text: a.description, style: { 'margin-bottom': '10px' } }) : null, facts.length ? dl : null, a.notes ? h('p', { class: 'hint', text: Array.isArray(a.notes) ? a.notes.join(' ') : a.notes }) : null));
  }

  if (n.type === 'OffPageConnector') {
    const partners = connectorPartners(n);
    root.append(sec('Continues on', null, partners.length
      ? partners.map(partner => assetRow(partner, sheetLabel(homeSheet(NODES.get(partner))), { onClick: () => openOnDrawing(partner) }))
      : h('p', { class: 'dim', text: `No matching connector was found${a.other_drawing ? ' on ' + a.other_drawing : ''}.` })));
  }

  if (n.type === 'Equipment') {
    const ctx = AN.equipment?.[id];
    if (ctx) {
      const groups = groupBy(ctx.instruments.filter(i => NODES.has(i)), i => NODES.get(i).attributes?.variable || 'unclassified');
      root.append(sec('Instruments on it and its piping', ctx.instruments.length, ctx.instruments.length
        ? [...groups].map(([v, ids]) => h('div', { class: 'var-group' }, h('span', { class: 'var', text: v }), chipList(ids, 8)))
        : h('p', { class: 'dim', text: 'No instrument is drawn on this item or its connected piping.' })));
      if (ctx.loops.length) root.append(sec('Loops', ctx.loops.length, h('div', { class: 'insp-list' }, ctx.loops.slice(0, 12).map(l => assetRow(l, ctx.acting_loops.includes(l) ? h('span', { class: 'pill info', text: 'acts on it' }) : null, { onClick: () => go({ view: 'loops', arg: l, params: { sel: l } }) })))));
    }
    const bv = boundaryValves(id);
    if (bv.length) {
      const list = h('div', { class: 'insp-list' });
      for (const side of ['in', 'out']) for (const v of bv.filter(x => x.side === side).slice(0, 8)) {
        const vn = NODES.get(v.id);
        list.append(assetRow(v.id, h('span', { class: 'pill' + (v.valve ? '' : ' warn'), text: (side === 'in' ? 'inlet · ' : 'outlet · ') + (v.valve ? (vn.attributes?.normal_position ? 'normally ' + vn.attributes.normal_position : `${v.hops} hop${v.hops > 1 ? 's' : ''}`) : 'no valve drawn') })));
      }
      root.append(sec('Nearest valves on each branch', null, list, h('p', { class: 'hint', text: 'From drawing connectivity only. This is not an isolation plan: it does not show valve state, bypasses outside the drawings, or energy sources.' })));
    }
  }

  if (n.type === 'ControlLoop') {
    const members = inE(id, 'MEMBER_OF');
    const byRole = groupBy(members, e => e.attributes?.role || 'other');
    root.append(sec('Members', members.length, [...byRole].map(([role, es]) => h('div', { class: 'var-group' }, h('span', { class: 'var', text: pretty(role) }), chipList(es.map(e => e.source), 8)))));
  }

  // All relationships, grouped by meaning and direction.
  const relBox = [];
  for (const [type, fwd, back] of REL) {
    if (n.type === 'ControlLoop' && type === 'MEMBER_OF') continue;
    const o = outE(id, type).map(e => e.target), i = inE(id, type).map(e => e.source);
    if (o.length) relBox.push(h('div', { class: 'var-group' }, h('span', { class: 'var', text: fwd }), chipList([...new Set(o)], 8)));
    if (i.length) relBox.push(h('div', { class: 'var-group' }, h('span', { class: 'var', text: back }), chipList([...new Set(i)], 8)));
  }
  if (relBox.length) root.append(sec('Relationships', (OUT.get(id)?.length || 0) + (INN.get(id)?.length || 0), relBox));

  const issues = ISSUES_BY_NODE.get(id) || [];
  if (issues.length) root.append(sec('Review items', issues.length, issues.map(i => h('button', { class: 'row-btn', type: 'button', on: { click: () => go({ view: 'review', arg: i.key }) } }, h('span', { class: 'main' }, h('span', { text: i.message, style: { 'white-space': 'normal', color: 'var(--ink)' } })), h('span', { class: 'right' }, i.severity === 'info' ? h('span', { class: 'pill info', text: 'Note' }) : statusPill(reviewOf(i).status))))));

  const provList = n.provenance || [];
  const raw = h('details', { class: 'raw' }, h('summary', { text: 'Source record and attributes' }));
  const dl = h('dl', { class: 'kv' });
  dl.append(h('dt', { text: 'Graph ID' }), h('dd', { class: 'mono', text: n.id }));
  if (n.dexpi_class) dl.append(h('dt', { text: 'DEXPI class' }), h('dd', { text: n.dexpi_class }));
  for (const p of provList) dl.append(h('dt', { text: sheetLabel(p.sheet) }), h('dd', { text: `PDF page ${p.page} · ${p.source || 'vision'} · local ID ${p.local_id || '—'}${p.bbox ? ' · box ' + p.bbox.map(x => Number(x).toFixed(3)).join(', ') : ''}` }));
  for (const [k, v] of Object.entries(a)) if (v !== null && v !== '') dl.append(h('dt', { text: pretty(k) }), h('dd', { text: typeof v === 'object' ? JSON.stringify(v) : String(v) }));
  dl.append(h('dt', { text: 'Live data' }), h('dd', { class: 'dim', text: 'No historian is linked to this graph.' }));
  raw.append(dl);
  root.append(sec('Evidence', null,
    provList.length ? null : h('p', { class: 'dim', text: 'Derived item with no drawing location of its own. See its members or neighbours for the source.', style: { 'margin-bottom': '8px' } }),
    raw, h('p', { class: 'hint', text: 'Confidence is an extraction estimate, not a calibrated probability.' })));
}
