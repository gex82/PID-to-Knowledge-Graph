// Trace view: upstream, downstream and A-to-B routes, shown as steps with evidence.
function routeSteps(r, opts = {}) {
  const box = h('div', { class: 'route' });
  let lastSheet = null;
  r.nodes.forEach((id, i) => {
    const n = NODES.get(id), sheet = homeSheet(n);
    if (sheet && sheet !== lastSheet) {
      box.append(h('div', { class: 'route-sheet' }, lastSheet ? h('span', { class: 'pill info', text: 'crosses to' }) : null, h('button', { class: 'pill', type: 'button', title: 'Open this drawing', text: sheetLabel(sheet), on: { click: () => go({ view: 'drawing', arg: sheetLabel(sheet), params: { sel: id } }) } }), h('span', { class: 'dim small', text: NODES.get(sheet)?.name || '' })));
      lastSheet = sheet;
    }
    const meas = measuring(id), a = n.attributes || {}, tags = [];
    if (isValve(n)) { tags.push(h('span', { class: 'pill', text: pretty(n.kind) })); if (a.normal_position) tags.push(h('span', { class: 'pill ' + (a.normal_position === 'closed' ? 'bad' : 'ok'), text: 'normally ' + a.normal_position })); if (a.actuator) tags.push(h('span', { class: 'pill', text: a.actuator + ' actuator' })); }
    const e = r.edges[i];
    const row = h('div', { class: `step t-${n.type}` + (id === selected() ? ' sel' : '') + (isTerminal(n) ? ' major' : '') + (e?.attributes?.flow_direction === 'inferred' ? ' inf' : '') },
      h('span', { class: 'step-rail' }, h('span', { class: 'step-dot' })),
      h('button', { class: 'step-main', type: 'button', on: { click: () => select(id) } }, h('span', { class: 'glyph' }, icon(iconFor(n))), h('span', { class: 'main' }, h('b', { text: titleOf(n) }), h('span', { text: subOf(n) }))),
      h('span', { class: 'step-tags' }, tags, meas.map(m => assetChip(m))));
    box.append(row);
    if (e && e.attributes?.off_page) box.append(h('div', { class: 'route-flag info' }, icon('connector'), e.attributes.reviewed ? 'Source-reviewed cross-sheet link: ' + (e.attributes.evidence || 'See the extraction review.') : e.attributes.linked_by === 'other_item' ? 'Cross-sheet link inferred from an item reference.' : 'Cross-sheet link inferred by matching off-page connectors.'));
  });
  if (opts.compactNote) box.append(h('p', { class: 'dim small', style: { margin: '8px 0 0 34px' }, text: opts.compactNote }));
  return box;
}
function statStrip(st) {
  const item = (v, l, tone) => h('span', { class: 'ts' + (tone ? ' ' + tone : '') }, h('b', { text: v }), l);
  return h('div', { class: 'trace-stats' }, item(st.steps, 'links'), item(st.equipment, 'equipment'), item(st.valves, 'valves'), item(st.instruments, 'instruments on the route'), item(st.sheets.length, st.sheets.length === 1 ? 'drawing' : 'drawings'),
    st.inferred ? item(st.inferred, 'links with inferred direction (dashed)', 'warn') : null, st.minConfidence !== null ? item(Number(st.minConfidence).toFixed(2), 'lowest confidence', st.minConfidence < 0.8 ? 'warn' : '') : null);
}
VIEWS.trace = {
  label: 'Trace', icon: 'trace', hint: 'Follow flow upstream, downstream, or between two items',
  mount(root, r0) {
    const controls = h('div', { class: 'trace-controls' }), body = h('div', { class: 'page' });
    let last = null;
    root.append(h('div', { class: 'view' }, h('div', { class: 'view-head' }, h('h1', { text: 'Trace' }), h('span', { class: 'sub', text: 'Directed process flow from the drawings. Valve state and operating mode are not modelled.' })), controls, h('div', { class: 'scroll' }, body)));
    const picker = (label, id, onPick, exclude) => {
      const n = id && NODES.get(id);
      return h('label', { class: 'pick' }, h('span', { class: 'eyebrow', text: label }), h('button', { class: `pick-btn t-${n?.type || ''}`, type: 'button', on: { click: () => openPalette({ hint: label === 'From' ? 'Trace from…' : 'Trace to…', filter: x => x.id !== exclude && (outE(x.id, 'FLOWS_TO').length || inE(x.id, 'FLOWS_TO').length), onPick }) } },
        n ? [h('span', { class: 'dot' }), h('b', { class: 'mono', text: titleOf(n) }), h('span', { class: 'dim', text: subOf(n) })] : h('span', { class: 'dim', text: 'Choose an item…' })));
    };
    const draw = route => {
      const P = route.params, from = NODES.has(P.from) ? P.from : (selected() && (outE(selected(), 'FLOWS_TO').length || inE(selected(), 'FLOWS_TO').length) ? selected() : null);
      if (from && !P.from) queueMicrotask(() => go({ params: { from } }, { replace: true }));
      const mode = ['down', 'up', 'path'].includes(P.mode) ? P.mode : 'down', to = NODES.has(P.to) ? P.to : null, detail = P.detail === '1', depth = Math.max(0, parseInt(P.depth, 10) || 0), alt = Math.max(0, parseInt(P.alt, 10) || 0);
      clear(controls); clear(body); last = null;
      addKids(controls, [picker('From', from, id => go({ params: { from: id, sel: id, alt: null } }), to),
        segmented([{ value: 'down', label: 'Downstream', icon: 'down' }, { value: 'up', label: 'Upstream', icon: 'up' }, { value: 'path', label: 'Path to', icon: 'right' }], mode, v => go({ params: { mode: v, alt: null } })),
        mode === 'path' ? [picker('To', to, id => go({ params: { to: id, alt: null } }), from), from && to ? h('button', { class: 'icon-btn', type: 'button', title: 'Swap from and to', 'aria-label': 'Swap', on: { click: () => go({ params: { from: to, to: from, sel: to, alt: null } }) } }, icon('swap')) : null] : [
          segmented([{ value: '0', label: 'Equipment', title: 'Equipment and plant boundaries only' }, { value: '1', label: 'Everything', title: 'Every pipe segment, valve and fitting' }], detail ? '1' : '0', v => go({ params: { detail: v === '1' ? '1' : null } })),
          h('label', { class: 'pick inline' }, h('span', { class: 'dim small', text: 'Max links' }), h('input', { class: 'input', type: 'number', min: 0, max: 999, value: depth || '', placeholder: 'all', style: { width: '72px' }, on: { change: e => go({ params: { depth: e.target.value > 0 ? e.target.value : null } }) } }))]]);
      if (!from) { body.append(h('div', { class: 'card empty' }, h('p', { style: { 'margin-bottom': '12px' }, text: 'Pick where to start. Any equipment, valve, pipe segment or boundary works.' }), btn('Choose a starting item', 'search', () => controls.querySelector('.pick-btn').click(), 'primary'))); setTrace(); return; }
      const fn = NODES.get(from);
      if (mode === 'path') {
        if (!to) { body.append(h('div', { class: 'card empty', text: 'Choose the item to route to.' })); setTrace(); return; }
        const list = routes(from, to);
        if (!list.length) {
          const rev = shortestRoute(to, from);
          body.append(h('div', { class: 'card' }, h('div', { class: 'card-body' }, h('h2', { style: { 'font-size': '15px', 'margin-bottom': '6px' }, text: `No directed flow path from ${titleOf(fn)} to ${titleOf(NODES.get(to))}` }),
            h('p', { class: 'dim', text: 'The drawings do not establish this route in this direction. That can be correct, or it can mean a line or off-page link was not extracted.' }),
            rev ? h('p', { style: { 'margin-top': '12px' } }, `Flow does run the other way (${rev.edges.length} links). `, btn('Show that route', 'swap', () => go({ params: { from: to, to: from, sel: to } }), 'sm')) : null)));
          setTrace(); return;
        }
        const r = list[Math.min(alt, list.length - 1)], st = routeStats(r);
        last = { query: { mode: 'path', from, to, alternative: Math.min(alt, list.length - 1) }, found: true, route: r };
        setTrace(r.nodes, r.edges.map(e => e.id), `Route ${titleOf(fn)} → ${titleOf(NODES.get(to))}`);
        body.append(h('div', { class: 'card' },
          h('div', { class: 'card-head' }, h('h2', { text: `${titleOf(fn)} → ${titleOf(NODES.get(to))}` }), h('span', { class: 'sub' }, list.length > 1 ? segmented(list.map((x, i) => ({ value: String(i), label: i ? `Alternative ${i}` : 'Shortest', title: `${x.edges.length} links` })), String(Math.min(alt, list.length - 1)), v => go({ params: { alt: v === '0' ? null : v } })) : 'Only one route found')),
          h('div', { class: 'card-body' }, statStrip(st), actions(), routeSteps(r))));
        return;
      }
      const reverse = mode === 'up', walk = bfs(from, reverse, depth), all = walk.order, shown = detail ? all : all.filter(x => isTerminal(NODES.get(x.id)));
      last = { query: { mode: reverse ? 'upstream' : 'downstream', from, max_links: depth || null }, found: true, items: all };
      setTrace([from, ...all.map(x => x.id)], [...walk.prev.values()].map(p => p.edge.id), `${reverse ? 'Upstream of' : 'Downstream of'} ${titleOf(fn)}`);
      const terminals = all.filter(x => isTerminal(NODES.get(x.id))), sheets = new Set(all.flatMap(x => NODES.get(x.id).sheets || []));
      const head = h('div', { class: 'card-head' }, h('h2', { text: `${reverse ? 'Upstream of' : 'Downstream of'} ${titleOf(fn)}` }), h('span', { class: 'sub', text: `${terminals.length} equipment and boundaries · ${all.filter(x => isValve(NODES.get(x.id))).length} valves · ${sheets.size} drawings · ${all.length} items in all` }));
      const list = h('div', { class: 'reach' });
      if (!shown.length) list.append(h('div', { class: 'empty', text: all.length ? 'Nothing but piping within this range. Switch to Everything to see it.' : `Nothing is drawn ${reverse ? 'upstream' : 'downstream'} of this item.` }));
      const bySheet = groupBy(shown, x => homeSheet(NODES.get(x.id)) || '');
      for (const [sheet, items] of [...bySheet].sort((a, b) => (SHEET_INDEX.get(a[0]) ?? 99) - (SHEET_INDEX.get(b[0]) ?? 99))) {
        list.append(h('div', { class: 'reach-sheet' }, h('b', { class: 'mono', text: sheet ? sheetLabel(sheet) : 'No drawing' }), h('span', { class: 'dim small', text: NODES.get(sheet)?.name || '' }), h('span', { class: 'dim small', style: { 'margin-left': 'auto' }, text: `${items.length} item${items.length === 1 ? '' : 's'}` })));
        for (const it of items) {
          const holder = h('div', { class: 'reach-item' }), detailBox = h('div', { class: 'reach-route', hidden: true });
          const toggle = h('button', { class: 'btn ghost sm', type: 'button', text: 'Show route', on: { click: e => { e.stopPropagation(); if (detailBox.hidden && !detailBox.firstChild) { const r = routeFrom(walk, from, it.id, reverse); detailBox.append(statStrip(routeStats(r)), routeSteps(r)); } detailBox.hidden = !detailBox.hidden; toggle.textContent = detailBox.hidden ? 'Show route' : 'Hide route'; } } });
          holder.append(h('div', { class: 'reach-row' }, assetRow(it.id, `${it.hops} link${it.hops === 1 ? '' : 's'} away`), toggle), detailBox);
          list.append(holder);
        }
      }
      body.append(h('div', { class: 'card' }, head, h('div', { class: 'card-body' }, actions(), list)));
    };
    const actions = () => h('div', { class: 'trace-actions no-print' }, btn('Show on map', 'map', () => go({ view: 'map' }), 'sm'), btn('Show on drawing', 'drawing', () => { const f = route.params.from || selected(); if (f) openOnDrawing(f); }, 'sm'),
      btn('Download evidence (JSON)', 'download', () => {
        const brief = id => { const n = NODES.get(id); return { id: n.id, label: n.label, type: n.type, kind: n.kind, sheets: n.sheets, confidence: n.confidence, provenance: n.provenance || [] }; };
        const out = { plant: KG.plant, generated_at: KG.generated_at, query: last.query, found: last.found, note: 'Drawing connectivity only. Not equipment state, safe isolation, or a fault diagnosis.' };
        if (last.route) { out.items = last.route.nodes.map((id, hops) => ({ ...brief(id), hops })); out.edges = last.route.edges; }
        else { out.items = last.items.map(x => ({ ...brief(x.id), hops: x.hops })); out.edges = EDGES.filter(e => e.type === 'FLOWS_TO' && TRACE.edges.has(e.id)); }
        download('query-evidence.json', JSON.stringify(out, null, 2));
      }, 'sm'), btn('Print', null, () => print(), 'sm ghost'));
    draw(r0);
    return { update: draw, destroy() {} };
  },
};
