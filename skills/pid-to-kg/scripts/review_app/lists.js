// Lists: the registers engineers actually keep, sortable and exportable.
function lineOf(n) { for (const e of [...inE(n.id, 'FLOWS_TO'), ...outE(n.id, 'FLOWS_TO')]) { const o = NODES.get(e.source === n.id ? e.target : e.source); if (o.type === 'PipeSegment') return o.attributes?.line_number || o.attributes?.line_id || ''; } return ''; }
const sheetsOf = n => (n.sheets || []).map(sheetLabel).join(', ');
const C = { tag: { label: 'Tag', get: n => titleOf(n), mono: true }, name: { label: 'Description', get: n => (n.name && n.name !== titleOf(n) ? n.name : '') }, sheet: { label: 'Drawing', get: sheetsOf, mono: true }, conf: { label: 'Confidence', get: n => n.confidence, fmt: v => Number(v).toFixed(2), num: true } };
const LISTS = {
  equipment: { label: 'Equipment', rows: () => ASSETS.filter(n => n.type === 'Equipment'), cols: [C.tag, C.name, { label: 'Type', get: n => pretty(n.kind || '') },
    { label: 'Instruments', get: n => AN.equipment?.[n.id]?.instruments.length ?? 0, num: true }, { label: 'Loops', get: n => AN.equipment?.[n.id]?.loops.length ?? 0, num: true },
    { label: 'Downstream', get: n => AN.connectivity?.reach?.[n.id]?.down ?? 0, num: true, title: 'Equipment downstream on the drawings' }, { label: 'Upstream', get: n => AN.connectivity?.reach?.[n.id]?.up ?? 0, num: true },
    { label: 'Process connection', get: n => ((AN.connectivity?.unconnected || []).includes(n.id) ? 'none drawn' : 'connected') }, C.sheet, C.conf] },
  instruments: { label: 'Instruments', rows: () => ASSETS.filter(n => n.type === 'Instrument'), cols: [C.tag, C.name, { label: 'Variable', get: n => n.attributes?.variable || '' }, { label: 'Role', get: n => pretty(n.attributes?.role || n.kind || '') },
    { label: 'Location', get: n => pretty(n.attributes?.location || '') }, { label: 'Loop', get: n => outE(n.id, 'MEMBER_OF').map(e => NODES.get(e.target).label).join(', '), mono: true },
    { label: 'Measures', get: n => outE(n.id, 'MEASURES').map(e => titleOf(NODES.get(e.target))).join(', ') }, C.sheet, C.conf] },
  valves: { label: 'Valves & fittings', rows: () => ASSETS.filter(n => n.type === 'Component'), cols: [C.tag, C.name, { label: 'Type', get: n => pretty(n.kind || '') }, { label: 'Actuator', get: n => n.attributes?.actuator || '' },
    { label: 'Normal position', get: n => n.attributes?.normal_position || '' }, { label: 'Size', get: n => n.attributes?.size || '' }, { label: 'Line', get: lineOf, mono: true },
    { label: 'Actuated by', get: n => inE(n.id, 'ACTUATES').map(e => titleOf(NODES.get(e.source))).join(', '), mono: true }, C.sheet, C.conf] },
  lines: { label: 'Lines', rows: () => [...groupBy(ASSETS.filter(n => n.type === 'PipeSegment'), n => `${n.sheets?.[0]}|${n.attributes?.line_id}`).values()].map(segs => ({ ...segs[0], segs })),
    cols: [{ label: 'Line', get: n => n.attributes?.line_id || n.label, mono: true }, { label: 'Line number', get: n => n.attributes?.line_number || '', mono: true }, { label: 'Service', get: n => n.attributes?.service || '' }, { label: 'Size', get: n => n.attributes?.size || '' },
      { label: 'Segments', get: n => n.segs.length, num: true }, { label: 'Instruments', get: n => new Set(n.segs.flatMap(s => measuring(s.id))).size, num: true }, { label: 'Direction', get: n => n.attributes?.flow_direction || '' }, C.sheet, C.conf] },
  connectors: { label: 'Off-page connectors', rows: () => ASSETS.filter(n => n.type === 'OffPageConnector'), cols: [{ label: 'Connector', get: n => n.label }, { label: 'Direction', get: n => n.attributes?.direction || '' }, { label: 'Other drawing', get: n => n.attributes?.other_drawing || '', mono: true },
    { label: 'Partner', get: n => { return connectorPartners(n).map(p => NODES.get(p).label).join(', '); } }, { label: 'Status', get: n => (connectorPartners(n).length ? 'matched' : 'unmatched') }, C.sheet, C.conf] },
};
VIEWS.lists = {
  label: 'Lists', icon: 'lists', hint: 'Equipment, instrument, valve and line registers with CSV export',
  mount(root, r0) {
    const tabs = h('div', { class: 'tabs', role: 'tablist' }), search = h('input', { class: 'input', type: 'search', placeholder: 'Filter this list…', 'aria-label': 'Filter this list', style: { width: '260px' } }), count = h('span', { class: 'sub' }), wrap = h('div', { class: 'scroll table-wrap' });
    let key = null, sort = { i: 0, dir: 1 }, rows = [], view = [];
    const exportBtn = btn('Export CSV', 'download', () => { const L = LISTS[key]; download(`${KG.plant?.id || 'plant'}-${key}.csv`, toCSV(L.cols, view), 'text/csv'); toast(`Exported ${view.length} rows`); }, 'sm');
    root.append(h('div', { class: 'view' }, h('div', { class: 'view-head' }, h('h1', { text: 'Lists' }), tabs, h('span', { style: { 'margin-left': 'auto' } }), count, search, exportBtn), wrap));
    const draw = () => {
      const L = LISTS[key], q = search.value.trim().toLowerCase(), col = L.cols[sort.i];
      view = rows.filter(r => !q || r._text.includes(q));
      view.sort((a, b) => { const x = col.get(a), y = col.get(b); return (col.num ? (x || 0) - (y || 0) : String(x).localeCompare(String(y), undefined, { numeric: true })) * sort.dir; });
      count.textContent = `${view.length} of ${rows.length}`;
      const sel = selected();
      const thead = h('tr', null, L.cols.map((c, i) => h('th', { class: (c.num ? 'num ' : '') + (i === sort.i ? 'sorted' : ''), title: c.title, 'aria-sort': i === sort.i ? (sort.dir > 0 ? 'ascending' : 'descending') : null }, h('button', { type: 'button', on: { click: () => { sort = { i, dir: i === sort.i ? -sort.dir : 1 }; draw(); } } }, c.label, i === sort.i ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''))));
      const tbody = h('tbody');
      for (const r of view.slice(0, 1500)) tbody.append(h('tr', { class: r.id === sel ? 'sel' : '', tabindex: 0, on: { click: () => select(r.id), keydown: e => { if (e.key === 'Enter') select(r.id); } } }, L.cols.map((c, i) => { const v = c.get(r); return h('td', { class: (c.num ? 'num ' : '') + (c.mono ? 'mono' : '') }, i === 0 ? h('span', { class: `dot t-${r.type}`, style: { 'margin-right': '8px' } }) : null, c.fmt ? c.fmt(v) : (v === '' || v === null || v === undefined ? h('span', { class: 'dim', text: '—' }) : String(v))); })));
      clear(wrap).append(view.length ? h('table', { class: 'table' }, h('thead', null, thead), tbody) : h('div', { class: 'empty', text: 'No rows match this filter.' }));
    };
    const sync = (route, prev) => {
      const want = LISTS[route.arg] ? route.arg : 'equipment';
      if (want !== key) {
        key = want; sort = { i: 0, dir: 1 };
        rows = LISTS[key].rows(); for (const r of rows) r._text = LISTS[key].cols.map(c => c.get(r)).join(' ').toLowerCase();
        clear(tabs); for (const [k, L] of Object.entries(LISTS)) tabs.append(h('button', { type: 'button', role: 'tab', class: k === key ? 'active' : '', 'aria-selected': String(k === key), text: L.label, on: { click: () => go({ arg: k, params: { q: null } }) } }));
        search.value = route.params.q || '';
      } else if (prev && route.params.q !== prev.params.q) search.value = route.params.q || '';
      draw();
    };
    search.addEventListener('input', draw);
    sync(r0, null);
    return { update: sync, destroy() {} };
  },
};
