// Loops: sensor to controller to final element, drawn with ISA-style bubbles.
const LOOP_COL = { element: 1, transmitter: 1, gauge: 1, sensor_input: 1, switch: 1, controller: 2, hand_switch: 2, other: 2, relay: 3, final_element: 4 };
const LOOP_LOW = new Set(['readout', 'indicator', 'alarm']);
const LD = { CW: 150, RH: 96, R: 27, TOP: 52, LEFT: 30 };
function loopModel(loopId) {
  const loop = NODES.get(loopId), members = inE(loopId, 'MEMBER_OF').map(e => ({ id: e.source, role: e.attributes?.role || 'other' }));
  const ids = new Set(members.map(m => m.id)), cols = [[], [], [], [], []], low = [];
  for (const m of members) { if (LOOP_LOW.has(m.role)) low.push(m); else cols[LOOP_COL[m.role] ?? 2].push(m); }
  const proc = new Set(loop.attributes?.measured_at || []);
  for (const m of members) for (const e of outE(m.id, 'MEASURES')) proc.add(e.target);
  for (const p of proc) if (NODES.has(p) && !ids.has(p)) cols[0].push({ id: p, role: 'process' });
  for (const m of members) for (const e of [...outE(m.id, 'ACTUATES'), ...outE(m.id, 'TRIPS')]) if (!ids.has(e.target) && !cols[4].some(x => x.id === e.target)) cols[4].push({ id: e.target, role: 'final_element' });
  const need = AN.loops?.loops?.[loopId]?.missing || [];
  if (need.includes('sensors') && !cols[1].length) cols[1].push({ ghost: 'Sensor not extracted' });
  if (need.includes('controllers') && !cols[2].length) cols[2].push({ ghost: 'Controller not extracted' });
  if (need.includes('final_elements') && !cols[4].length) cols[4].push({ ghost: 'Final element not extracted' });
  const pos = new Map(), rows = Math.max(1, ...cols.map(c => c.length));
  cols.forEach((col, ci) => col.forEach((m, i) => { m.x = LD.LEFT + ci * LD.CW + LD.CW / 2; m.y = LD.TOP + (i + (rows - col.length) / 2) * LD.RH + LD.RH / 2; if (m.id) pos.set(m.id, m); }));
  const perRow = 4, lowTop = LD.TOP + rows * LD.RH + 34;
  low.forEach((m, i) => { m.x = LD.LEFT + LD.CW * 1.5 + (i % perRow) * (LD.CW * 0.86); m.y = lowTop + Math.floor(i / perRow) * LD.RH + LD.RH / 2; pos.set(m.id, m); });
  const shown = new Set(pos.keys()), links = [];
  for (const id of shown) for (const e of outE(id)) if (shown.has(e.target) && ['SIGNAL_TO', 'MEASURES', 'ACTUATES', 'TRIPS'].includes(e.type)) links.push(e);
  return { loop, cols, low, pos, links, w: LD.LEFT * 2 + 5 * LD.CW, h: (low.length ? lowTop + Math.ceil(low.length / perRow) * LD.RH : LD.TOP + rows * LD.RH) + 16, lowTop, members };
}
function isaBubble(n) {
  const R = LD.R, loc = n.attributes?.location, g = sv('g', { class: 'bubble' });
  const shared = loc === 'dcs' || loc === 'scada', plc = loc === 'plc';
  if (shared || plc) g.append(sv('rect', { x: -R, y: -R, width: R * 2, height: R * 2, class: 'b-shape' }));
  g.append(plc ? sv('path', { d: `M0,${-R}L${R},0L0,${R}L${-R},0z`, class: 'b-shape' }) : sv('circle', { r: R, class: 'b-shape' }));
  if (loc === 'local_panel') g.append(sv('path', { d: `M${-R + 2},-3H${R - 2}M${-R + 2},3H${R - 2}`, class: 'b-line' }));
  else if (loc === 'behind_panel') g.append(sv('path', { d: `M${-R},0H${R}`, class: 'b-line dashed' }));
  else if (loc && loc !== 'field') g.append(sv('path', { d: `M${plc ? -R + 3 : -R},0H${plc ? R - 3 : R}`, class: 'b-line' }));
  const tag = n.tag || n.label || '', letters = n.attributes?.isa_letters || tag.split('-')[0], num = tag.includes('-') ? tag.slice(tag.indexOf('-') + 1) : '';
  g.append(sv('text', { class: 'b-top', y: -6, 'text-anchor': 'middle' }, letters.slice(0, 5)), sv('text', { class: 'b-num', y: 13, 'text-anchor': 'middle' }, num.length > 9 ? num.slice(0, 8) + '…' : num));
  return g;
}
function drawLoop(loopId) {
  const M = loopModel(loopId), svg = sv('svg', { class: 'loop-svg', viewBox: `0 0 ${M.w} ${M.h}`, role: 'img', 'aria-label': `Loop diagram for ${M.loop.label}` },
    sv('defs', null, sv('marker', { id: 'larr', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' }, sv('path', { d: 'M0 1L9 5L0 9z', class: 'larr' }))));
  ['Process', 'Sensing', 'Control', 'Output', 'Final element'].forEach((t, i) => { if (M.cols[i].length || i === 0 || i === 4) svg.append(sv('text', { class: 'col-head', x: LD.LEFT + i * LD.CW + LD.CW / 2, y: 22, 'text-anchor': 'middle' }, t)); });
  if (M.low.length) svg.append(sv('line', { class: 'low-rule', x1: LD.LEFT, x2: M.w - LD.LEFT, y1: M.lowTop - 6, y2: M.lowTop - 6 }), sv('text', { class: 'col-head', x: LD.LEFT, y: M.lowTop + 12 }, 'Readouts and alarms'));
  const eg = sv('g'); svg.append(eg);
  for (const e of M.links) {
    const a = M.pos.get(e.source), b = M.pos.get(e.target), dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, pad = LD.R + 5;
    if (d < pad * 2) continue;
    const sig = e.type === 'SIGNAL_TO' ? (e.attributes?.signal_type || 'unknown') : e.type.toLowerCase();
    const line = sv('line', { class: `sig sig-${sig}`, x1: a.x + dx / d * pad, y1: a.y + dy / d * pad, x2: b.x - dx / d * pad, y2: b.y - dy / d * pad, 'marker-end': e.type === 'MEASURES' ? null : 'url(#larr)' });
    tip(line, `${titleOf(NODES.get(e.source))} → ${titleOf(NODES.get(e.target))}`, e.type === 'SIGNAL_TO' ? `${cap(sig)} signal${e.attributes?.purpose ? ' · ' + e.attributes.purpose : ''}` : cap(e.type.toLowerCase().replace('_', ' ')) + (e.derived ? ' (derived)' : ''));
    eg.append(line);
  }
  for (const m of [...M.cols.flat(), ...M.low]) {
    if (m.ghost) { svg.append(sv('g', { class: 'ghost', transform: `translate(${m.x},${m.y})` }, sv('circle', { r: LD.R }), sv('text', { y: 4, 'text-anchor': 'middle' }, '?'), sv('text', { class: 'b-cap', y: LD.R + 15, 'text-anchor': 'middle' }, m.ghost))); continue; }
    const n = NODES.get(m.id), el = sv('g', { class: `lnode t-${n.type}` + (m.id === selected() ? ' sel' : ''), transform: `translate(${m.x},${m.y})`, tabindex: 0, role: 'button', 'aria-label': `${titleOf(n)}, ${pretty(m.role)}` });
    if (n.type === 'Instrument') el.append(isaBubble(n));
    else el.append(sv('rect', { class: 'b-shape block', x: -52, y: -22, width: 104, height: 44, rx: 8 }), sv('g', { transform: 'translate(-44,-10) scale(.8)', class: 'glyph' }, sv('path', { d: ICONS[iconFor(n)] })), sv('text', { class: 'b-top', x: 8, y: 4, 'text-anchor': 'middle' }, titleOf(n).length > 11 ? titleOf(n).slice(0, 10) + '…' : titleOf(n)));
    const capText = n.type === 'Instrument' ? (n.name || pretty(m.role)) : subOf(n);
    el.append(sv('text', { class: 'b-cap', y: LD.R + 15, 'text-anchor': 'middle' }, capText.length > 22 ? capText.slice(0, 21) + '…' : capText));
    el.addEventListener('click', () => select(m.id));
    el.addEventListener('keydown', e => { if (e.key === 'Enter') select(m.id); });
    tip(el, titleOf(n), `${pretty(m.role)} · ${subOf(n)}${n.attributes?.location ? ' · ' + pretty(n.attributes.location) : ''}`);
    svg.append(el);
  }
  return { svg, M };
}
VIEWS.loops = {
  label: 'Loops', icon: 'loops', hint: 'Control, interlock and monitoring loops, drawn end to end',
  mount(root, r0) {
    const loops = ASSETS.filter(n => n.type === 'ControlLoop').sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    const missing = id => AN.loops?.loops?.[id]?.missing || [];
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Filter loops…', 'aria-label': 'Filter loops', style: { width: '100%' } });
    const opt = (v, t) => h('option', { value: v, text: t });
    const typeSel = h('select', { class: 'select', 'aria-label': 'Loop type' }, opt('', 'All types'), [...new Set(loops.map(l => l.kind))].sort().map(k => opt(k, cap(k))));
    const showSel = h('select', { class: 'select', 'aria-label': 'Completeness' }, opt('', 'Any state'), opt('incomplete', 'Incomplete'), opt('complete', 'Complete'));
    const list = h('div', { class: 'loop-list' }), count = h('div', { class: 'dim small', style: { padding: '0 12px 6px' } }), detail = h('div', { class: 'scroll' });
    root.append(h('div', { class: 'view' }, h('div', { class: 'view-head' }, h('h1', { text: 'Loops' }), h('span', { class: 'sub', text: 'Built from ISA tag numbers and the signal lines on the drawings. Logic that lives only in control narratives is not here.' })),
      h('div', { class: 'loops-layout' }, h('div', { class: 'loops-side' }, h('div', { class: 'loops-filters' }, search, h('div', { style: { display: 'flex', gap: '6px' } }, typeSel, showSel)), count, list), detail)));
    let arg = null;
    const fill = () => {
      const q = search.value.trim().toLowerCase(), t = typeSel.value, s = showSel.value;
      const rows = loops.filter(l => (!t || l.kind === t) && (!s || (s === 'incomplete') === (missing(l.id).length > 0)) && (!q || `${l.label} ${l.attributes?.variable || ''} ${l.attributes?.description || ''}`.toLowerCase().includes(q)));
      clear(list); count.textContent = `${rows.length} of ${loops.length} loops`;
      for (const l of rows) list.append(assetRow(l.id, missing(l.id).length ? h('span', { class: 'pill warn', title: 'Not found in this loop group: ' + missing(l.id).map(pretty).join(', '), text: 'incomplete' }) : null, { active: l.id === arg, onClick: () => go({ arg: l.id, params: { sel: l.id } }) }));
      if (!rows.length) list.append(h('div', { class: 'empty', text: 'No loops match.' }));
      return rows;
    };
    const show = () => {
      clear(detail);
      const loop = NODES.get(arg);
      if (!loop) { detail.append(h('div', { class: 'empty', text: loops.length ? 'Choose a loop.' : 'This graph has no loops.' })); return; }
      const { svg, M } = drawLoop(arg), a = loop.attributes || {}, miss = missing(arg);
      const casc = [...outE(arg, 'CASCADES_TO').map(e => ['Cascades to', e.target]), ...inE(arg, 'CASCADES_TO').map(e => ['Cascade from', e.source])];
      detail.append(h('div', { class: 'page' },
        h('div', { class: 'loop-title' }, h('div', null, h('div', { class: 'eyebrow t-ControlLoop' }, h('span', { class: 'dot' }), ` ${cap(loop.kind || 'loop')} loop · ${a.variable || 'unclassified'}`), h('h2', { class: 'mono', text: loop.label })),
          h('div', { class: 'chips' }, (loop.sheets || []).map(s => h('button', { class: 'pill', type: 'button', text: sheetLabel(s), on: { click: () => go({ view: 'drawing', arg: sheetLabel(s) }) } })), confMeter(loop.confidence),
            btn('Highlight on drawing', 'drawing', () => { setTrace(M.members.map(m => m.id), [], `Loop ${loop.label}`); const first = M.members.find(m => locate(NODES.get(m.id))); if (first) openOnDrawing(first.id); else toast('No member of this loop has a drawing position.'); }, 'sm'))),
        a.description ? h('p', { class: 'loop-desc', text: a.description }) : null,
        miss.length ? h('div', { class: 'notice warn', style: { 'margin-bottom': '12px' }, text: `Not found in this loop group: ${miss.map(m => pretty(m).replace(/s$/, '')).join(', ')}. The loop may continue in a control narrative or vendor package, or part of it was not extracted.` }) : null,
        casc.length ? h('div', { class: 'chips', style: { 'margin-bottom': '12px' } }, casc.map(([k, id]) => [h('span', { class: 'dim small', text: k }), assetChip(id, { onClick: x => go({ arg: x, params: { sel: x } }) })])) : null,
        h('div', { class: 'card loop-card' }, svg),
        h('div', { class: 'loop-legend' },
          [['Field mounted', 'field'], ['Local panel', 'local_panel'], ['DCS / SCADA', 'scada'], ['PLC', 'plc']].map(([t, loc]) => h('span', null, sv('svg', { viewBox: '-30 -30 60 60', class: 'lg-bubble' }, isaBubble({ attributes: { location: loc, isa_letters: '' }, tag: '' })), t)),
          [['Electrical', 'electrical'], ['Software link', 'software'], ['Signal, type not shown', 'unknown'], ['Measures', 'measures'], ['Actuates', 'actuates'], ['Trips', 'trips']].map(([t, c]) => h('span', null, sv('svg', { viewBox: '0 0 30 10', class: 'lg-sig' }, sv('line', { class: 'sig sig-' + c, x1: 1, y1: 5, x2: 29, y2: 5 })), t)))));
    };
    const sync = (route) => {
      showSel.value = route.params.show || '';
      const rows = fill();
      const want = NODES.get(route.arg)?.type === 'ControlLoop' ? route.arg : null;
      if (!want) { const first = rows.find(l => l.kind === 'control') || rows[0]; if (first) queueMicrotask(() => go({ arg: first.id }, { replace: true })); arg = null; show(); return; }
      if (want !== arg) { arg = want; fill(); list.querySelector('.active')?.scrollIntoView({ block: 'nearest' }); }
      show();
    };
    search.addEventListener('input', fill); typeSel.addEventListener('change', fill); showSel.addEventListener('change', () => go({ params: { show: showSel.value || null } }, { replace: true }));
    sync(r0);
    return { update: sync, destroy() {} };
  },
};
