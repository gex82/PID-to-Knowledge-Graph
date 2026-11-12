// Data, indexes, DOM helpers, routing. All source text reaches the DOM through
// textContent / setAttribute only: drawing labels are untrusted.
const KG = JSON.parse(document.getElementById('graph-data').textContent);
const AN = KG.analytics || {};
const SVGNS = 'http://www.w3.org/2000/svg';

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  setAttrs(el, attrs);
  addKids(el, kids);
  return el;
}
function sv(tag, attrs, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  setAttrs(el, attrs);
  addKids(el, kids);
  return el;
}
function setAttrs(el, attrs) {
  if (!attrs) return;
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'on') for (const [evt, fn] of Object.entries(v)) el.addEventListener(evt, fn);
    else if (k === 'style' && typeof v === 'object') for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
    else if (k === 'data') for (const [d, val] of Object.entries(v)) el.dataset[d] = val;
    else el.setAttribute(k, v === true ? '' : v);
  }
}
function addKids(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
}
const byId = id => document.getElementById(id);
const clear = el => { el.replaceChildren(); return el; };

// ---- graph indexes
const NODES = new Map(KG.nodes.map(n => [n.id, n]));
const ALLOWED = new Set(KG.traversal_edge_ids || KG.edges.map(e => e.id));
const EDGES = KG.edges.filter(e => ALLOWED.has(e.id) && NODES.has(e.source) && NODES.has(e.target));
const EDGE_BY_ID = new Map(EDGES.map(e => [e.id, e]));
const OUT = new Map(), INN = new Map();
for (const e of EDGES) {
  (OUT.get(e.source) || OUT.set(e.source, []).get(e.source)).push(e);
  (INN.get(e.target) || INN.set(e.target, []).get(e.target)).push(e);
}
const NONE = Object.freeze([]);
const outE = (id, type) => { const l = OUT.get(id) || NONE; return type ? l.filter(e => e.type === type) : l; };
const inE = (id, type) => { const l = INN.get(id) || NONE; return type ? l.filter(e => e.type === type) : l; };
const ASSETS = KG.nodes.filter(n => n.type !== 'Sheet' && n.type !== 'Plant');
const SHEETS = KG.nodes.filter(n => n.type === 'Sheet').sort((a, b) => (a.attributes?.page ?? 1e9) - (b.attributes?.page ?? 1e9) || a.label.localeCompare(b.label));
const SHEET_INDEX = new Map(SHEETS.map((s, i) => [s.id, i]));
const SHEET_BY_LABEL = new Map(SHEETS.map(s => [s.label, s]));
const ON_SHEET = new Map(SHEETS.map(s => [s.id, []]));
for (const n of ASSETS) for (const s of n.sheets || []) ON_SHEET.get(s)?.push(n);

const TYPES = {
  Equipment: { label: 'Equipment', plural: 'Equipment', icon: 'tank' },
  Instrument: { label: 'Instrument', plural: 'Instruments', icon: 'bubble' },
  Component: { label: 'Valve / fitting', plural: 'Valves & fittings', icon: 'valve' },
  PipeSegment: { label: 'Pipe segment', plural: 'Pipe segments', icon: 'pipe' },
  ControlLoop: { label: 'Loop', plural: 'Loops', icon: 'loop' },
  Boundary: { label: 'Boundary', plural: 'Boundaries', icon: 'boundary' },
  OffPageConnector: { label: 'Off-page connector', plural: 'Off-page connectors', icon: 'connector' },
  Sheet: { label: 'Drawing', plural: 'Drawings', icon: 'sheet' },
};
const pretty = s => String(s ?? '').replace(/_/g, ' ').replace(/\b(scada|plc|dcs|vfd|hmi|mcc)\b/gi, m => m.toUpperCase());
const cap = s => { s = pretty(s); return s.charAt(0).toUpperCase() + s.slice(1); };
const sheetLabel = id => NODES.get(id)?.label || String(id || '').replace(/^SHEET:/, '');
const isValve = n => n.type === 'Component' && /valve/.test(n.kind || '');
const isTerminal = n => n.type === 'Equipment' || n.type === 'Boundary';
function titleOf(n) { return n.tag || n.label || n.id; }
function subOf(n) {
  if (n.type === 'PipeSegment') return [n.attributes?.line_number, n.attributes?.service, n.attributes?.size].filter(Boolean).join(' · ') || 'Pipe segment';
  if (n.type === 'ControlLoop') return `${cap(n.kind || 'loop')} loop · ${n.attributes?.variable || 'unclassified'}`;
  const name = n.name && n.name !== titleOf(n) ? n.name : '';
  return name || cap(n.kind && n.kind !== 'other' ? n.kind : TYPES[n.type]?.label || n.type);
}
function iconFor(n) {
  const k = n.kind || '';
  if (n.type === 'Equipment') {
    if (/pump/.test(k)) return 'pump';
    if (/blower|compressor|fan/.test(k)) return 'blower';
    if (/mixer|agitator/.test(k)) return 'mixer';
    if (/filter|screen|separator|membrane/.test(k)) return 'filter';
    if (/package|panel/.test(k)) return 'package';
    return 'tank';
  }
  if (n.type === 'Component') return isValve(n) ? 'valve' : 'fitting';
  return TYPES[n.type]?.icon || 'dot';
}
/** First drawing location of a node, optionally on a given sheet. */
function locate(n, sheetId) {
  const list = n?.provenance || [];
  return list.find(p => p.bbox && (!sheetId || p.sheet === sheetId)) || (sheetId ? null : list.find(p => p.bbox)) || null;
}
const connectorPartners = n => (AN.connectivity?.off_page?.partners?.[n.id] || []).filter(id => NODES.has(id));
const homeSheet = n => locate(n)?.sheet || n?.sheets?.[0] || null;

// ---- icons (static geometry only)
const ICONS = {
  home: 'M4 11l8-7 8 7M6 10v9h12v-9M10 19v-5h4v5',
  map: 'M3 7h5v4H3zM16 4h5v4h-5zM16 15h5v4h-5zM8 9h4M12 6v11M12 6h4M12 17h4',
  drawing: 'M4 4h16v16H4zM4 9h16M9 9v11',
  trace: 'M5 6a2 2 0 104 0 2 2 0 00-4 0M15 18a2 2 0 104 0 2 2 0 00-4 0M7 8v5a3 3 0 003 3h5',
  loops: 'M12 5a7 7 0 107 7M12 5l3-2.5M12 5l3 2.5',
  lists: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  review: 'M5 4h14v16H5zM9 9l2 2 4-4M9 15h6',
  analytics: 'M4 20V10M10 20V4M16 20v-7M21 20H3',
  tank: 'M6 5h12v14H6zM6 9h12',
  pump: 'M12 7a5 5 0 100 10 5 5 0 000-10M12 7h8M4 19h10',
  blower: 'M12 6a6 6 0 100 12 6 6 0 000-12M12 12l4-4M12 12l-4 4M12 12l4 4M12 12l-4-4',
  mixer: 'M12 3v12M7 18c2-3 8-3 10 0M7 15c2 3 8 3 10 0',
  filter: 'M5 5h14v14H5zM5 19L19 5',
  package: 'M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10',
  valve: 'M4 7v10l8-5zM20 7v10l-8-5z',
  fitting: 'M4 12h16M12 6v12',
  bubble: 'M12 5a7 7 0 100 14 7 7 0 000-14',
  pipe: 'M3 9h18M3 15h18',
  loop: 'M12 5a7 7 0 107 7M12 5l3-2.5M12 5l3 2.5',
  boundary: 'M4 12h11M11 7l5 5-5 5M20 5v14',
  connector: 'M3 8h12l5 4-5 4H3z',
  sheet: 'M6 3h9l4 4v14H6zM15 3v4h4',
  dot: 'M12 10a2 2 0 100 4 2 2 0 000-4',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14M20 20l-4-4',
  sun: 'M12 8a4 4 0 100 8 4 4 0 000-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2',
  moon: 'M20 14A8 8 0 019.8 4 8 8 0 1020 14z',
  panel: 'M4 5h16v14H4zM14 5v14',
  plus: 'M12 5v14M5 12h14', minus: 'M5 12h14', fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  down: 'M12 4v15M6 13l6 6 6-6', up: 'M12 20V5M6 11l6-6 6 6', right: 'M5 12h14M13 6l6 6-6 6',
  swap: 'M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14', upload: 'M12 16V5M7 9l5-5 5 5M5 20h14',
  check: 'M5 12l5 5 9-10', flag: 'M6 21V4h11l-2 4 2 4H6', x: 'M6 6l12 12M18 6L6 18', link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  split: 'M4 5h16v14H4zM12 5v14', layers: 'M12 4l9 5-9 5-9-5zM3 14l9 5 9-5', invert: 'M12 4a8 8 0 100 16zM12 4a8 8 0 010 16',
  warn: 'M12 4l9 16H3zM12 10v4M12 17h.01',
};
function icon(name) {
  return sv('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' },
    sv('path', { d: ICONS[name] || ICONS.dot }));
}

// ---- small utilities
const bus = { m: new Map(), on(e, f) { (this.m.get(e) || this.m.set(e, []).get(e)).push(f); return () => this.off(e, f); }, off(e, f) { const l = this.m.get(e); if (l) l.splice(l.indexOf(f), 1); }, emit(e, d) { for (const f of [...(this.m.get(e) || [])]) f(d); } };
const store = {
  key: k => `process-atlas:${KG.plant?.id || 'plant'}:${k === 'decisions' ? KG.graph_revision + ':' : ''}${k}`,
  get(k, d) { try { const v = localStorage.getItem(this.key(k)); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(this.key(k), JSON.stringify(v)); return true; } catch (_) { return false; } },
};
function toast(msg) { const t = byId('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200); }
function download(name, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime || 'application/json' }));
  const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function toCSV(cols, rows) {
  const q = v => { v = v === null || v === undefined ? '' : String(v); if (/^(?:[\t\r\n]|\s*[=+\-@])/.test(v)) v = "'" + v; return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  return [cols.map(c => q(c.label)).join(','), ...rows.map(r => cols.map(c => q(c.csv ? c.csv(r) : c.get(r))).join(','))].join('\n');
}
const fmtPct = v => Math.round(v * 100) + '%';
const groupBy = (list, fn) => { const m = new Map(); for (const x of list) { const k = fn(x); (m.get(k) || m.set(k, []).get(k)).push(x); } return m; };
const countBy = (list, fn) => { const m = new Map(); for (const x of list) { const k = fn(x); m.set(k, (m.get(k) || 0) + 1); } return m; };
function tip(el, title, sub) {
  el.addEventListener('pointerenter', e => showTip(e, title, sub));
  el.addEventListener('pointermove', moveTip);
  el.addEventListener('pointerleave', hideTip);
}
function showTip(e, title, sub) { const t = clear(byId('tooltip')); t.append(h('b', { text: title })); if (sub) t.append(h('span', { text: sub })); t.hidden = false; moveTip(e); }
function moveTip(e) { const t = byId('tooltip'); if (t.hidden) return; const r = t.getBoundingClientRect(); t.style.left = Math.max(6, Math.min(innerWidth - r.width - 6, e.clientX + 14)) + 'px'; t.style.top = Math.max(6, e.clientY + 16 + r.height > innerHeight ? e.clientY - r.height - 10 : e.clientY + 16) + 'px'; }
function hideTip() { byId('tooltip').hidden = true; }

// ---- page images: parsed on first use
const IMG_CACHE = new Map();
function pageImage(page) {
  if (page === null || page === undefined) return null;
  const k = String(page);
  if (!IMG_CACHE.has(k)) { const el = byId('page-image-' + k); IMG_CACHE.set(k, el ? JSON.parse(el.textContent) : null); }
  return IMG_CACHE.get(k);
}
const pageSize = page => { const m = KG.page_images?.[String(page)]; return m && m.w ? m : null; };

// ---- review state (browser-local decisions layered over what was built in)
const ISSUES = KG.issues || [];
const ISSUE_BY_KEY = new Map(ISSUES.map(i => [i.key, i]));
let DECISIONS = store.get('decisions', {});
const reviewOf = i => DECISIONS[i.key] || i.review || { status: 'open' };
const needsReview = i => i.severity !== 'info';
const openIssues = () => ISSUES.filter(i => needsReview(i) && reviewOf(i).status === 'open');
function setDecision(key, d) {
  if (d) DECISIONS[key] = d; else delete DECISIONS[key];
  const saved = store.set('decisions', DECISIONS);
  bus.emit('decisions');
  return saved;
}
const ISSUES_BY_NODE = groupBy(ISSUES.filter(i => i.node), i => i.node);

// ---- shared UI atoms
function assetChip(id, opts = {}) {
  const n = NODES.get(id);
  if (!n) return h('span', { class: 'chip', text: id });
  const b = h('button', { class: `chip t-${n.type}`, type: 'button', on: { click: e => { e.stopPropagation(); (opts.onClick || select)(id); } } },
    h('span', { class: 'dot' }), h('span', { class: 'lbl', text: opts.label || titleOf(n) }));
  tip(b, titleOf(n), `${subOf(n)}${n.sheets?.length ? ' · ' + n.sheets.map(sheetLabel).join(', ') : ''}`);
  return b;
}
function assetRow(id, right, opts = {}) {
  const n = NODES.get(id);
  const b = h('button', { class: `row-btn t-${n.type}${opts.active ? ' active' : ''}`, type: 'button', on: { click: () => (opts.onClick || select)(id) } },
    h('span', { class: 'glyph' }, icon(iconFor(n))),
    h('span', { class: 'main' }, h('b', { text: opts.title || titleOf(n) }), h('span', { text: opts.sub || subOf(n) })),
    right ? h('span', { class: 'right' }, right) : null);
  return b;
}
function confMeter(c) {
  const col = c >= 0.9 ? 'var(--ok)' : c >= 0.8 ? 'var(--info)' : 'var(--warn)';
  return h('span', { class: 'conf', title: 'Extraction estimate, not a calibrated probability' }, h('span', { class: 'meter' }, h('i', { style: { width: fmtPct(c), background: col } })), h('span', { class: 'mono small', text: Number(c).toFixed(2) }));
}
function statusPill(status) {
  return status === 'accepted' ? h('span', { class: 'pill ok', text: 'Reviewed' }) : status === 'needs_fix' ? h('span', { class: 'pill bad', text: 'Needs fix' }) : h('span', { class: 'pill warn', text: 'Open' });
}
function btn(label, iconName, onClick, cls = '') {
  return h('button', { class: 'btn ' + cls, type: 'button', on: { click: onClick } }, iconName ? icon(iconName) : null, label);
}
function segmented(options, value, onChange) {
  const el = h('div', { class: 'seg', role: 'group' });
  for (const o of options) el.append(h('button', { type: 'button', class: o.value === value ? 'active' : '', 'aria-pressed': String(o.value === value), title: o.title, on: { click: () => onChange(o.value) } }, o.icon ? icon(o.icon) : null, o.label));
  return el;
}

// ---- router: #/view/arg?sel=ID&k=v
const VIEWS = {};
let route = { view: 'home', arg: '', params: {} };
let current = null;
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const qi = raw.indexOf('?');
  const path = qi < 0 ? raw : raw.slice(0, qi);
  const [view, ...rest] = path.split('/');
  let arg = rest.join('/');
  try { arg = decodeURIComponent(arg); } catch (_) { /* keep raw */ }
  return { view: VIEWS[view] ? view : 'home', arg, params: Object.fromEntries(new URLSearchParams(qi < 0 ? '' : raw.slice(qi + 1))) };
}
function buildHash(r) {
  const q = new URLSearchParams(Object.entries(r.params).filter(([, v]) => v !== null && v !== undefined && v !== '')).toString();
  return '#/' + r.view + (r.arg ? '/' + encodeURIComponent(r.arg) : '') + (q ? '?' + q : '');
}
/** Navigate. `patch.params` merges into the current params; a null value removes one. */
function go(patch, opts = {}) {
  const viewChange = patch.view && patch.view !== route.view;
  const keep = viewChange ? (route.params.sel ? { sel: route.params.sel } : {}) : route.params;
  const next = { view: patch.view || route.view, arg: patch.arg !== undefined ? patch.arg : (viewChange ? '' : route.arg), params: { ...keep, ...(patch.params || {}) } };
  const hash = buildHash(next);
  if (hash === location.hash) return;
  if (opts.replace) history.replaceState(null, '', hash); else history.pushState(null, '', hash);
  applyRoute();
}
function select(id) { if (NODES.has(id)) { document.body.classList.remove('no-inspector'); go({ params: { sel: id } }); } }
const selected = () => (NODES.has(route.params.sel) ? route.params.sel : null);
function applyRoute() {
  const prev = route;
  route = parseHash();
  hideTip();
  if (!current || prev.view !== route.view || !current.update) {
    current?.destroy?.();
    const main = clear(byId('main'));
    current = VIEWS[route.view].mount(main, route) || {};
    for (const b of document.querySelectorAll('.rail-btn')) { const on = b.dataset.view === route.view; b.classList.toggle('active', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }
    document.title = `${VIEWS[route.view].label} · ${KG.plant?.name || 'Plant'} | Process Atlas`;
  } else current.update(route, prev);
  if (prev.params.sel !== route.params.sel || !applyRoute.done) renderInspector(selected());
  applyRoute.done = true;
  bus.emit('route', { route, prev });
}
// Shared trace highlight, shown on the map and the drawing.
const TRACE = { ids: new Set(), edges: new Set(), label: '' };
function setTrace(ids, edges, label) { TRACE.ids = new Set(ids || []); TRACE.edges = new Set(edges || []); TRACE.label = label || ''; bus.emit('trace'); }
