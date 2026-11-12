// Process map: plant-wide equipment flow, left to right, one lane per drawing.
const MAP = { NW: 184, NH: 46, COLW: 232, ROWH: 58, LANE_PAD: 13, LEFT: 172, STAGGER: 0.15 };
function buildMapLayout(showLoose) {
  const term = ASSETS.filter(isTerminal), ids = new Set(term.map(n => n.id));
  const feeds = EDGES.filter(e => e.type === 'FEEDS' && ids.has(e.source) && ids.has(e.target) && e.source !== e.target);
  const deg = new Map();
  for (const e of feeds) { deg.set(e.source, (deg.get(e.source) || 0) + 1); deg.set(e.target, (deg.get(e.target) || 0) + 1); }
  const laneOf = n => SHEET_INDEX.get(homeSheet(n)) ?? SHEETS.length;
  const used = term.filter(n => deg.has(n.id)).sort((a, b) => laneOf(a) - laneOf(b) || a.id.localeCompare(b.id));
  const loose = term.filter(n => !deg.has(n.id) && n.type === 'Equipment');
  const out = new Map(used.map(n => [n.id, []])), indeg = new Map(used.map(n => [n.id, 0]));
  for (const e of feeds) { out.get(e.source).push(e); indeg.set(e.target, indeg.get(e.target) + 1); }
  // Break cycles: an edge back to a node still on the DFS stack is a return (recirculation) edge.
  const state = new Map(), back = new Set();
  const visit = root => {
    const stack = [[root, 0]]; state.set(root, 1);
    while (stack.length) {
      const top = stack[stack.length - 1], es = out.get(top[0]);
      if (top[1] >= es.length) { state.set(top[0], 2); stack.pop(); continue; }
      const e = es[top[1]++], s = state.get(e.target);
      if (s === 1) back.add(e.id); else if (!s) { state.set(e.target, 1); stack.push([e.target, 0]); }
    }
  };
  for (const n of used) if (!indeg.get(n.id)) visit(n.id);
  for (const n of used) if (!state.get(n.id)) visit(n.id);
  // Longest-path layering on the remaining forward edges.
  const layer = new Map(used.map(n => [n.id, 0])), fin = new Map(used.map(n => [n.id, 0]));
  for (const e of feeds) if (!back.has(e.id)) fin.set(e.target, fin.get(e.target) + 1);
  const q = used.filter(n => !fin.get(n.id)).map(n => n.id);
  for (let i = 0; i < q.length; i++) for (const e of out.get(q[i])) {
    if (back.has(e.id)) continue;
    layer.set(e.target, Math.max(layer.get(e.target), layer.get(q[i]) + 1));
    fin.set(e.target, fin.get(e.target) - 1); if (!fin.get(e.target)) q.push(e.target);
  }
  // Sources sit just before their first consumer rather than all at the far left.
  for (const n of used) if (!indeg.get(n.id)) { const m = Math.min(...out.get(n.id).filter(e => !back.has(e.id)).map(e => layer.get(e.target))); if (isFinite(m)) layer.set(n.id, Math.max(0, m - 1)); }
  const maxLayer = Math.max(0, ...layer.values());
  const cells = new Map(), lanes = new Map();
  const put = (n, l, isLoose) => { const lane = laneOf(n), k = lane + ':' + l; (cells.get(k) || cells.set(k, []).get(k)).push({ n, loose: isLoose }); lanes.set(lane, Math.max(lanes.get(lane) || 0, cells.get(k).length)); };
  for (const n of used) put(n, layer.get(n.id), false);
  if (showLoose) { const next = new Map(); for (const n of loose) { const lane = laneOf(n); let l = next.get(lane); if (l === undefined) { l = 0; for (const u of used) if (laneOf(u) === lane) l = Math.max(l, layer.get(u.id) + 1); } put(n, l, true); next.set(lane, l + 1); } }
  // Each lane reads left to right from its own first step; a small stagger keeps the plant-wide order visible.
  const laneMin = new Map();
  for (const k of cells.keys()) { const [ln, l] = k.split(':').map(Number); laneMin.set(ln, Math.min(laneMin.get(ln) ?? Infinity, l)); }
  const pos = new Map(), laneRects = [];
  let y = 0, maxX = 0;
  for (const lane of [...lanes.keys()].sort((a, b) => a - b)) {
    const hgt = lanes.get(lane) * MAP.ROWH + MAP.LANE_PAD * 2;
    laneRects.push({ lane, y, h: hgt, sheet: SHEETS[lane] || null });
    for (const [k, list] of cells) {
      const [ln, l] = k.split(':').map(Number); if (ln !== lane) continue;
      const top = y + (hgt - list.length * MAP.ROWH) / 2 + (MAP.ROWH - MAP.NH) / 2;
      list.forEach((it, i) => { const x = MAP.LEFT + ((l - laneMin.get(lane)) + laneMin.get(lane) * MAP.STAGGER) * MAP.COLW; pos.set(it.n.id, { x, y: top + i * MAP.ROWH, loose: it.loose, lane }); maxX = Math.max(maxX, x + MAP.NW); });
    }
    y += hgt;
  }
  return { pos, feeds, back, lanes: laneRects, w: maxX + MAP.LEFT, h: y, looseCount: loose.length, layers: maxLayer + 1 };
}
function feedReach(id, reverse) {
  const seen = new Set([id]), q = [id];
  for (let i = 0; i < q.length; i++) for (const e of (reverse ? inE : outE)(q[i], 'FEEDS')) { const nx = reverse ? e.source : e.target; if (!seen.has(nx)) { seen.add(nx); q.push(nx); } }
  return seen;
}
VIEWS.map = {
  label: 'Process map', short: 'Map', icon: 'map', hint: 'Plant-wide equipment flow across all drawings',
  mount(root, r0) {
    let L, showLoose = store.get('map-loose', false), focusMode = 'off', split = false, viewer = null, nodeEls = new Map(), edgeEls = [];
    const g = sv('g'), svg = sv('svg', { class: 'map-svg', role: 'img', 'aria-label': 'Process map: equipment and boundaries connected by flow' }, sv('defs', null,
      sv('marker', { id: 'arr', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' }, sv('path', { d: 'M0 1L9 5L0 9z', class: 'arr' })),
      sv('marker', { id: 'arr-hi', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' }, sv('path', { d: 'M0 1L9 5L0 9z', class: 'arr hi' }))), g);
    const laneLabels = h('div', { class: 'map-lanes', 'aria-hidden': 'true' }), mini = sv('svg', { class: 'map-mini' }), miniView = sv('rect', { class: 'mini-view' });
    const stage = h('div', { class: 'map-stage' }, svg, laneLabels), right = h('div', { class: 'map-right', hidden: true });
    const info = h('span', { class: 'sub' }), focusSeg = h('span'), looseBtn = h('button', { class: 'btn sm', type: 'button' }), splitBtn = btn('Split with drawing', 'split', () => setSplit(!split), 'sm');
    const traceNote = h('span');
    const pz = new PanZoom(stage, t => {
      g.setAttribute('transform', `translate(${t.x},${t.y}) scale(${t.k})`);
      for (const el of laneLabels.children) { el.style.top = (el._y * t.k + t.y) + 'px'; el.style.height = (el._h * t.k) + 'px'; }
      stage.classList.toggle('far', t.k < 0.42);
      const v = pz.viewport(); miniView.setAttribute('x', v.x); miniView.setAttribute('y', v.y); miniView.setAttribute('width', v.w); miniView.setAttribute('height', v.h);
    }, { min: 0.08, max: 3 });
    root.append(h('div', { class: 'view' },
      h('div', { class: 'view-head' }, h('h1', { text: 'Process map' }), info, h('span', { style: { 'margin-left': 'auto' } }), traceNote, h('span', { class: 'dim small', text: 'Highlight from selection' }), focusSeg, looseBtn, splitBtn),
      h('div', { class: 'map-layout' }, h('div', { class: 'map-main' }, stage,
        h('div', { class: 'map-zoom no-print' }, h('button', { class: 'icon-btn', type: 'button', title: 'Zoom in (+)', 'aria-label': 'Zoom in', on: { click: () => pz.zoomBy(1.5) } }, icon('plus')), h('button', { class: 'icon-btn', type: 'button', title: 'Zoom out (−)', 'aria-label': 'Zoom out', on: { click: () => pz.zoomBy(1 / 1.5) } }, icon('minus')), h('button', { class: 'icon-btn', type: 'button', title: 'Fit all (0)', 'aria-label': 'Fit all', on: { click: () => fitAll(true) } }, icon('fit'))),
        h('div', { class: 'map-legend' }, h('span', { class: 't-Equipment' }, h('span', { class: 'dot' }), 'Equipment'), h('span', { class: 't-Boundary' }, h('span', { class: 'dot' }), 'Plant boundary'), h('span', null, h('i', { class: 'lg-line' }), 'Flow'), h('span', null, h('i', { class: 'lg-line dash' }), 'Return / inferred flow'), h('span', { class: 'dim', text: 'Double-click an item to open its drawing' })),
        h('div', { class: 'map-minibox no-print' }, mini)), right)));
    const fitAll = animate => pz.fit({ x: 0, y: 0, w: L.w, h: L.h }, 28, animate, 1.1);
    // Open at a readable scale on the start of the process; the minimap shows the rest.
    const startView = () => { const k = Math.max(0.72, Math.min(1, stage.clientWidth / (L.w + 24))); pz.set({ k, x: 0, y: 8 }); };
    const edgePath = (a, b, isBack) => {
      const x1 = a.x + MAP.NW, y1 = a.y + MAP.NH / 2, x2 = b.x, y2 = b.y + MAP.NH / 2;
      if (!isBack && x2 > x1 + (a.lane === b.lane ? 0 : 30)) { const dx = Math.max(36, (x2 - x1) * 0.5); return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`; }
      if (a.lane !== b.lane) {
        // Between drawings: leave from the bottom (or top) and arrive on the facing side.
        const dn = b.y > a.y, sx = a.x + MAP.NW * 0.62, sy = a.y + (dn ? MAP.NH : 0), tx = b.x + MAP.NW * 0.38, ty = b.y + (dn ? 0 : MAP.NH), dy = Math.max(28, Math.abs(ty - sy) * 0.45) * (dn ? 1 : -1);
        return `M${sx},${sy} C${sx},${sy + dy} ${tx},${ty - dy} ${tx},${ty}`;
      }
      // Return edges swing out below both ends so they read as a loop back.
      const drop = Math.max(a.y, b.y) + MAP.NH + 18 + Math.min(60, Math.abs(x1 - x2) * 0.06);
      return `M${x1},${y1} C${x1 + 46},${y1} ${x1 + 46},${drop} ${x1 - 10},${drop} L${x2 + 10},${drop} C${x2 - 46},${drop} ${x2 - 46},${y2} ${x2},${y2}`;
    };
    const build = () => {
      L = buildMapLayout(showLoose); clear(g); clear(laneLabels); clear(mini); nodeEls = new Map(); edgeEls = [];
      info.textContent = `${L.pos.size} items · ${L.feeds.length} flow links · ${L.lanes.length} drawings`;
      looseBtn.textContent = showLoose ? `Hide unconnected (${L.looseCount})` : `Show unconnected (${L.looseCount})`; looseBtn.hidden = !L.looseCount;
      if (!L.pos.size) { stage.append(h('div', { class: 'empty', text: 'No equipment-to-equipment flow in this graph.' })); return; }
      mini.setAttribute('viewBox', `0 0 ${L.w} ${L.h}`);
      L.lanes.forEach((ln, i) => {
        g.append(sv('rect', { class: 'lane' + (i % 2 ? ' alt' : ''), x: -4000, y: ln.y, width: L.w + 8000, height: ln.h }));
        mini.append(sv('rect', { class: 'lane' + (i % 2 ? ' alt' : ''), x: 0, y: ln.y, width: L.w, height: ln.h }));
        const lab = h('button', { class: 'lane-label', type: 'button', title: 'Open this drawing', on: { click: () => ln.sheet && go({ view: 'drawing', arg: ln.sheet.label }) } }, h('b', { text: ln.sheet?.label || 'Other' }), h('span', { text: ln.sheet?.name || '' }));
        lab._y = ln.y; lab._h = ln.h; laneLabels.append(lab);
      });
      const eg = sv('g'); g.append(eg);
      for (const e of L.feeds) {
        const a = L.pos.get(e.source), b = L.pos.get(e.target); if (!a || !b) continue;
        const isBack = L.back.has(e.id), p = sv('path', { class: 'edge' + (isBack ? ' back' : '') + (e.attributes?.flow_direction === 'inferred' ? ' inferred' : ''), d: edgePath(a, b, isBack), 'marker-end': 'url(#arr)' });
        eg.append(p); edgeEls.push({ e, p });
      }
      for (const [id, p] of L.pos) {
        const n = NODES.get(id), ctx = AN.equipment?.[id];
        const title = titleOf(n), subt = n.name && n.name !== title ? n.name : cap(n.kind && n.kind !== 'other' ? n.kind : n.type);
        const el = sv('g', { class: `mnode t-${n.type}` + (p.loose ? ' loose' : ''), transform: `translate(${p.x},${p.y})`, tabindex: 0, role: 'button', 'aria-label': `${title}, ${subt}` },
          sv('rect', { class: 'box', width: MAP.NW, height: MAP.NH, rx: n.type === 'Boundary' ? 23 : 9 }),
          sv('rect', { class: 'tab', width: 5, height: MAP.NH - 16, x: 0, y: 8, rx: 2.5 }),
          sv('g', { transform: 'translate(13,13) scale(.82)', class: 'glyph' }, sv('path', { d: ICONS[iconFor(n)] })),
          sv('text', { class: 'mt', x: 40, y: 20 }, title.length > 19 ? title.slice(0, 18) + '…' : title),
          sv('text', { class: 'ms', x: 40, y: 34 }, subt.length > 25 ? subt.slice(0, 24) + '…' : subt),
          ctx?.instruments.length ? sv('text', { class: 'mb', x: MAP.NW - 9, y: 20, 'text-anchor': 'end' }, ctx.instruments.length + ' ◦') : null);
        el.addEventListener('click', e => { e.stopPropagation(); select(id); });
        el.addEventListener('dblclick', e => { e.stopPropagation(); openOnDrawing(id); });
        el.addEventListener('keydown', e => { if (e.key === 'Enter') select(id); });
        tip(el, title, `${subt} · ${sheetLabel(homeSheet(n))}${ctx?.instruments.length ? ` · ${ctx.instruments.length} instruments` : ''}`);
        g.append(el); nodeEls.set(id, el);
        mini.append(sv('rect', { class: `mini-node t-${n.type}`, x: p.x, y: p.y, width: MAP.NW, height: MAP.NH }));
      }
      mini.append(miniView);
      paint();
    };
    const paint = () => {
      const sel = selected();
      let hi = null, label = '';
      if (TRACE.ids.size) { hi = TRACE.ids; label = TRACE.label; }
      else if (sel && L.pos.has(sel) && focusMode !== 'off') { hi = new Set(); if (focusMode !== 'up') for (const x of feedReach(sel, false)) hi.add(x); if (focusMode !== 'down') for (const x of feedReach(sel, true)) hi.add(x); }
      for (const [id, el] of nodeEls) { el.classList.toggle('sel', id === sel); el.classList.toggle('hi', !!hi && hi.has(id)); el.classList.toggle('dim', !!hi && !hi.has(id) && id !== sel); }
      for (const { e, p } of edgeEls) {
        const on = hi ? hi.has(e.source) && hi.has(e.target) : sel && (e.source === sel || e.target === sel);
        p.classList.toggle('hi', !!on); p.classList.toggle('dim', !!hi && !on); p.setAttribute('marker-end', on ? 'url(#arr-hi)' : 'url(#arr)');
      }
      clear(traceNote);
      if (TRACE.ids.size) traceNote.append(h('span', { class: 'dv-note accent' }, label || 'Trace', h('button', { type: 'button', title: 'Clear the trace highlight', 'aria-label': 'Clear trace', on: { click: () => setTrace() } }, icon('x'))));
      clear(focusSeg).append(segmented([{ value: 'off', label: 'Off' }, { value: 'up', label: 'Upstream' }, { value: 'down', label: 'Downstream' }, { value: 'both', label: 'Both' }], focusMode, v => { focusMode = v; paint(); }));
    };
    const reveal = (id, animate) => {
      const p = L.pos.get(id); if (!p) return;
      const v = pz.viewport();
      if (p.x < v.x || p.y < v.y || p.x + MAP.NW > v.x + v.w || p.y + MAP.NH > v.y + v.h || pz.t.k < 0.42)
        pz.fit({ x: p.x - MAP.COLW * 1.6, y: p.y - MAP.ROWH * 3, w: MAP.NW + MAP.COLW * 3.2, h: MAP.NH + MAP.ROWH * 6 }, 20, animate, 1);
    };
    const syncSplit = () => {
      if (!split) return;
      const sel = selected(), n = sel && NODES.get(sel), sheet = (n && homeSheet(n)) || viewer.sheetId || SHEETS[0]?.id;
      if (sheet && viewer.sheetId !== sheet) viewer.setSheet(sheet); else viewer.refresh();
      requestAnimationFrame(() => viewer.focus(sel));
    };
    const setSplit = on => {
      split = on; right.hidden = !on; splitBtn.classList.toggle('primary', on);
      if (on && !viewer) viewer = new DrawingViewer(right);
      syncSplit();
    };
    looseBtn.addEventListener('click', () => { showLoose = !showLoose; store.set('map-loose', showLoose); build(); });
    const moveMini = e => { const r = mini.getBoundingClientRect(), k = L.w / r.width, x = (e.clientX - r.left) * k, y = (e.clientY - r.top) * (L.h / r.height); pz.set({ k: pz.t.k, x: stage.clientWidth / 2 - x * pz.t.k, y: stage.clientHeight / 2 - y * pz.t.k }); };
    mini.addEventListener('pointerdown', e => { mini.setPointerCapture(e.pointerId); moveMini(e); });
    mini.addEventListener('pointermove', e => { if (e.buttons) moveMini(e); });
    build();
    let fitted = false;
    const ro = new ResizeObserver(() => { if (!fitted && stage.clientWidth) { fitted = true; startView(); const s = selected(); if (s) reveal(s); } else pz.apply(pz.t); });
    ro.observe(stage);
    const offs = [bus.on('trace', paint)];
    return {
      update(route, prev) { paint(); if (prev.params.sel !== route.params.sel) { const s = selected(); if (s && !L.pos.has(s) && NODES.get(s).type === 'Equipment' && !showLoose) { showLoose = true; build(); } if (s) reveal(s, true); syncSplit(); } },
      destroy() { ro.disconnect(); offs.forEach(f => f()); viewer?.destroy(); },
      key(e) { if (e.key === '+' || e.key === '=') pz.zoomBy(1.5); else if (e.key === '-') pz.zoomBy(1 / 1.5); else if (e.key === '0') fitAll(true); },
    };
  },
};
