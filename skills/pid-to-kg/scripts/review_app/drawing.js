// Drawing viewer: the P&ID sheet with every extracted item as a hotspot.
const LAYERS = [
  { key: 'equipment', label: 'Equipment', types: ['Equipment'] },
  { key: 'instruments', label: 'Instruments', types: ['Instrument'] },
  { key: 'valves', label: 'Valves & fittings', types: ['Component'] },
  { key: 'connectors', label: 'Connectors & boundaries', types: ['OffPageConnector', 'Boundary'] },
];
class DrawingViewer {
  constructor(host, opts = {}) {
    this.opts = opts; this.sheetId = null; this.rects = new Map(); this.lastPicked = null;
    this.layers = store.get('layers', { equipment: true, instruments: true, valves: true, connectors: true });
    this.invert = store.get('invert', true);
    this.content = h('div', { class: 'dv-content' });
    this.stage = h('div', { class: 'dv-stage' }, this.content);
    this.tools = h('div', { class: 'dv-tools no-print' });
    this.banner = h('div', { class: 'dv-banner' });
    this.el = h('div', { class: 'dv' }, this.stage, this.tools, this.banner);
    host.append(this.el);
    this.pz = new PanZoom(this.stage, t => { this.content.style.transform = `translate(${t.x}px,${t.y}px) scale(${t.k})`; }, { min: 0.03, max: 6 });
    this.buildTools();
    this.offs = [bus.on('trace', () => this.refresh()), bus.on('theme', () => this.applyInvert())];
    this.ro = new ResizeObserver(() => { if (!this.fitted && this.sheetId) this.fitAll(); });
    this.ro.observe(this.stage);
  }
  destroy() { this.offs.forEach(f => f()); this.ro.disconnect(); this.el.remove(); }
  buildTools() {
    const layerBox = h('div', { class: 'dv-layers', hidden: true });
    for (const l of LAYERS) {
      const cb = h('input', { type: 'checkbox', checked: this.layers[l.key] ? true : null, on: { change: () => { this.layers[l.key] = cb.checked; store.set('layers', this.layers); this.applyLayers(); } } });
      layerBox.append(h('label', { class: `t-${l.types[0]}` }, cb, h('span', { class: 'dot' }), l.label));
    }
    const tb = (name, title, fn) => h('button', { class: 'icon-btn', type: 'button', title, 'aria-label': title, on: { click: fn } }, icon(name));
    this.tools.append(h('div', { class: 'dv-toolbar' }, tb('plus', 'Zoom in (+)', () => this.pz.zoomBy(1.6)), tb('minus', 'Zoom out (−)', () => this.pz.zoomBy(1 / 1.6)), tb('fit', 'Fit sheet (0)', () => this.fitAll(true)),
      tb('layers', 'Show or hide item types', () => { layerBox.hidden = !layerBox.hidden; }), tb('invert', 'Invert the sheet in dark mode', () => { this.invert = !this.invert; store.set('invert', this.invert); this.applyInvert(); })), layerBox);
  }
  applyInvert() { this.el.classList.toggle('inverted', this.invert && currentTheme() === 'dark'); }
  applyLayers() { for (const l of LAYERS) for (const t of l.types) this.el.classList.toggle('hide-' + t, !this.layers[l.key]); }
  setSheet(sheetId) {
    const sheet = NODES.get(sheetId); if (!sheet) return;
    this.sheetId = sheetId; this.rects.clear(); this.fitted = false;
    const page = sheet.attributes?.page, src = pageImage(page), size = pageSize(page);
    this.W = size?.w || 1600; this.H = size?.h || 1000; this.hasImage = !!src;
    clear(this.content);
    Object.assign(this.content.style, { width: this.W + 'px', height: this.H + 'px' });
    this.el.classList.toggle('schematic', !src);
    this.svg = sv('svg', { class: 'dv-overlay', viewBox: `0 0 ${this.W} ${this.H}`, width: this.W, height: this.H });
    if (src) {
      const img = h('img', { class: 'dv-img', alt: `Drawing ${sheet.label}`, draggable: 'false', width: this.W, height: this.H });
      if (!size) img.addEventListener('load', () => { if (this.sheetId !== sheetId) return; this.W = img.naturalWidth; this.H = img.naturalHeight; this.setSheet(sheetId); this.focus(selected()); }, { once: true });
      img.src = src; this.content.append(img);
    }
    this.content.append(this.svg);
    this.drawHotspots();
    this.applyLayers(); this.applyInvert(); this.refresh();
    requestAnimationFrame(() => { if (!this.fitted) this.fitAll(); });
  }
  drawHotspots() {
    const items = [];
    for (const n of ON_SHEET.get(this.sheetId) || []) { const p = locate(n, this.sheetId); if (p) items.push({ n, b: p.bbox }); }
    items.sort((a, b) => (b.b[2] - b.b[0]) * (b.b[3] - b.b[1]) - (a.b[2] - a.b[0]) * (a.b[3] - a.b[1]));
    for (const { n, b } of items) {
      const x = b[0] * this.W, y = b[1] * this.H, w = Math.max(6, (b[2] - b[0]) * this.W), ht = Math.max(6, (b[3] - b[1]) * this.H);
      const r = sv('rect', { class: `hs t-${n.type}`, x, y, width: w, height: ht, rx: Math.min(10, w / 5, ht / 5), tabindex: 0, role: 'button', 'aria-label': `${titleOf(n)}, ${subOf(n)}` });
      r.addEventListener('click', e => { e.stopPropagation(); this.lastPicked = n.id; (this.opts.onPick || select)(n.id); });
      r.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); r.dispatchEvent(new MouseEvent('click')); } });
      tip(r, titleOf(n), subOf(n));
      this.svg.append(r); this.rects.set(n.id, r);
      if (!this.hasImage) this.svg.append(sv('text', { class: 'hs-label', x: x + w / 2, y: y + ht / 2 + 4, 'text-anchor': 'middle' }, titleOf(n).slice(0, Math.max(3, Math.floor(w / 9)))));
    }
  }
  /** Re-apply selection and trace classes, and the contextual banner. */
  refresh() {
    const sel = selected();
    for (const [id, r] of this.rects) { r.classList.toggle('sel', id === sel); r.classList.toggle('traced', TRACE.ids.has(id)); }
    this.el.classList.toggle('has-trace', TRACE.ids.size > 0);
    clear(this.banner);
    if (!this.hasImage && this.sheetId) this.banner.append(h('span', { class: 'dv-note', text: 'Sheet image not included in this export. Boxes show the extracted positions.' }));
    if (TRACE.ids.size) {
      const here = [...this.rects.keys()].filter(id => TRACE.ids.has(id)).length;
      this.banner.append(h('span', { class: 'dv-note accent' }, `${TRACE.label || 'Trace'}: ${here} located item${here === 1 ? '' : 's'} on this sheet`, h('button', { type: 'button', title: 'Clear the trace highlight', 'aria-label': 'Clear trace', on: { click: () => setTrace() } }, icon('x'))));
    }
    const n = sel && NODES.get(sel);
    if (n?.type === 'OffPageConnector') {
      for (const partner of connectorPartners(n)) this.banner.append(h('button', { class: 'btn primary sm', type: 'button', on: { click: () => openOnDrawing(partner) } }, `Continue on ${sheetLabel(homeSheet(NODES.get(partner)))}`, icon('right')));
    }
    if (n && !this.rects.has(sel) && (n.sheets || []).includes(this.sheetId)) this.banner.append(h('span', { class: 'dv-note', text: `${titleOf(n)} is on this sheet but has no recorded position.` }));
  }
  fitAll(animate) { this.fitted = this.stage.clientWidth > 0; this.pz.fit({ x: 0, y: 0, w: this.W, h: this.H }, 16, animate); }
  /** Centre on an item. Skipped for picks made in this viewer that are already in view. */
  focus(id, animate = true) {
    const n = id && NODES.get(id), p = n && locate(n, this.sheetId);
    if (!p) return false;
    const [x0, y0, x1, y1] = p.bbox, cx = (x0 + x1) / 2 * this.W, cy = (y0 + y1) / 2 * this.H;
    if (id === this.lastPicked) { const v = this.pz.viewport(); if (cx > v.x && cx < v.x + v.w && cy > v.y && cy < v.y + v.h) return true; }
    const w = Math.max((x1 - x0) * this.W * 3, this.W * 0.2), ht = Math.max((y1 - y0) * this.H * 3, this.H * 0.2);
    this.fitted = true;
    this.pz.fit({ x: cx - w / 2, y: cy - ht / 2, w, h: ht }, 30, animate, 2.5);
    return true;
  }
  /** Bring a normalised box into view (used by the review queue). */
  focusBox(b, animate = true) {
    const w = Math.max((b[2] - b[0]) * this.W * 3, this.W * 0.2), ht = Math.max((b[3] - b[1]) * this.H * 3, this.H * 0.2);
    this.fitted = true;
    this.pz.fit({ x: (b[0] + b[2]) / 2 * this.W - w / 2, y: (b[1] + b[3]) / 2 * this.H - ht / 2, w, h: ht }, 30, animate, 2.5);
  }
  /** Extra outline that is not tied to a node (an issue location). */
  mark(b) {
    this.svg?.querySelector('.hs-mark')?.remove();
    if (b && this.svg) this.svg.append(sv('rect', { class: 'hs-mark', x: b[0] * this.W, y: b[1] * this.H, width: (b[2] - b[0]) * this.W, height: (b[3] - b[1]) * this.H, rx: 6 }));
  }
  key(e) {
    if (e.key === '+' || e.key === '=') this.pz.zoomBy(1.6); else if (e.key === '-') this.pz.zoomBy(1 / 1.6); else if (e.key === '0') this.fitAll(true); else return false;
    return true;
  }
}

VIEWS.drawing = {
  label: 'Drawings', icon: 'drawing', hint: 'The P&ID sheets with every extracted item as a hotspot',
  mount(root, r0) {
    const strip = h('div', { class: 'sheet-strip' }), title = h('h1'), sub = h('span', { class: 'sub' }), counts = h('div', { class: 'chips', style: { 'margin-left': 'auto' } });
    const host = h('div', { class: 'dv-host' }), notes = h('details', { class: 'sheet-notes' });
    const step = d => { const i = SHEET_INDEX.get(viewer.sheetId) ?? 0, s = SHEETS[(i + d + SHEETS.length) % SHEETS.length]; go({ arg: s.label }); };
    root.append(h('div', { class: 'view' },
      h('div', { class: 'view-head' }, h('div', { class: 'seg' }, h('button', { type: 'button', title: 'Previous drawing ([)', 'aria-label': 'Previous drawing', on: { click: () => step(-1) } }, '‹'), h('button', { type: 'button', title: 'Next drawing (])', 'aria-label': 'Next drawing', on: { click: () => step(1) } }, '›')), title, sub, counts),
      h('div', { class: 'dv-layout' }, h('div', { class: 'sheet-side' }, strip, notes), host)));
    const viewer = new DrawingViewer(host);
    const rows = new Map();
    for (const s of SHEETS) {
      const open = ISSUES.filter(i => i.sheet === s.id && needsReview(i) && reviewOf(i).status !== 'accepted').length;
      const b = h('button', { class: 'row-btn', type: 'button', on: { click: () => go({ arg: s.label }) } }, h('span', { class: 'main' }, h('b', { text: s.label }), h('span', { text: s.name || '' })), open ? h('span', { class: 'right' }, h('span', { class: 'pill warn', text: open })) : null);
      rows.set(s.id, b); strip.append(b);
    }
    const sync = (route, prev) => {
      let sheet = SHEET_BY_LABEL.get(route.arg);
      const sel = selected(), n = sel && NODES.get(sel), selChanged = !prev || prev.params.sel !== route.params.sel;
      if (n && selChanged && (!sheet || !(n.sheets || []).includes(sheet.id)) && homeSheet(n)) sheet = NODES.get(homeSheet(n));
      if (!sheet) sheet = (n && NODES.get(homeSheet(n))) || SHEETS[0];
      if (!sheet) { host.append(h('div', { class: 'empty', text: 'This graph has no drawings.' })); return; }
      if (sheet.label !== route.arg) { queueMicrotask(() => go({ arg: sheet.label }, { replace: true })); }
      const changed = viewer.sheetId !== sheet.id;
      if (changed) {
        viewer.setSheet(sheet.id);
        title.textContent = sheet.label; sub.textContent = [sheet.name, sheet.attributes?.page ? `PDF page ${sheet.attributes.page}` : '', sheet.attributes?.revision ? `rev ${sheet.attributes.revision}` : ''].filter(Boolean).join(' · ');
        for (const [id, b] of rows) { b.classList.toggle('active', id === sheet.id); if (id === sheet.id) b.scrollIntoView({ block: 'nearest' }); }
        const c = countBy(ON_SHEET.get(sheet.id) || [], x => x.type);
        clear(counts); for (const t of ['Equipment', 'Instrument', 'Component', 'ControlLoop']) if (c.get(t)) counts.append(h('span', { class: `pill t-${t}` }, h('span', { class: 'dot' }), `${c.get(t)} ${TYPES[t].plural.toLowerCase()}`));
        const a = sheet.attributes || {}, list = [...(a.notes || []).map(t => ['Note', t]), ...(a.unreadable || []).map(t => ['Could not be read', t])];
        clear(notes); notes.hidden = !list.length;
        addKids(notes, [h('summary', { text: `Reviewer notes for this sheet (${list.length})` }), list.map(([k, t]) => h('p', null, h('b', { text: k + ': ' }), t))]);
      } else viewer.refresh();
      if (changed || selChanged) requestAnimationFrame(() => { if (!viewer.focus(sel, !changed) && changed) viewer.fitAll(); });
    };
    sync(r0, null);
    return { update: sync, destroy: () => viewer.destroy(), key(e) { if (e.key === '[') step(-1); else if (e.key === ']') step(1); else viewer.key(e); } };
  },
};
