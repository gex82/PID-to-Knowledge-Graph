// Review workflow: triage each QA item against the drawing and record a decision.
const CODE_LABEL = {
  duplicate_tag: 'Tag used more than once on a sheet', tag_reused: 'Tag reused on another sheet', possible_missed_tags: 'Tags read from the page text but not extracted',
  loop_no_sensor: 'Loop without a sensor', loop_no_final_element: 'Loop without a final element', loop_no_signals: 'Loop without signal lines', loop_signal_conflict: 'Loop identity conflict',
  equipment_not_connected: 'Equipment without a process connection', component_not_connected: 'Valve or fitting without a connection', isolated_instrument: 'Instrument not attached to anything',
  unmatched_off_page: 'Off-page connector without a partner', inferred_flow_direction: 'Flow direction inferred',
};
const codeLabel = c => CODE_LABEL[c] || cap(c);
const inBox = b => Array.isArray(b) && b.length === 4 && b.every(v => v >= 0 && v <= 1);
function issueBox(i) { if (inBox(i.bbox)) return i.bbox; const n = NODES.get(i.node); const p = n && locate(n, i.sheet); if (p) return p.bbox; const c = (i.candidates || []).find(x => inBox(x.bbox)); return c ? c.bbox : null; }
function exportDecisions() {
  const out = [];
  for (const i of ISSUES) {
    const r = reviewOf(i), local = DECISIONS[i.key];
    if (!local && r.source !== 'review_decisions.json') continue;
    out.push({ key: i.key, code: i.code, node: i.node || null, page: i.page ?? null, sheet: i.sheet || null, status: r.status, note: r.note || '', reviewer: r.reviewer || '', at: r.at || '' });
  }
  download('review_decisions.json', JSON.stringify({ plant: KG.plant?.id, graph_revision: KG.graph_revision, tool: 'process-atlas', exported_at: new Date().toISOString(), decisions: out }, null, 2));
  toast(`Exported ${out.length} decision${out.length === 1 ? '' : 's'}. Place the file in validation/ and rebuild to keep them.`);
}
function importDecisions(file) {
  file.text().then(t => {
    const data = JSON.parse(t);
    if (data.plant !== KG.plant?.id || data.graph_revision !== KG.graph_revision) { toast('Decisions belong to a different plant or graph revision; nothing was imported.'); return; }
    const list = data.decisions;
    if (!Array.isArray(list) || list.some(d => !d || typeof d !== 'object')) throw new Error('Invalid decisions');
    let n = 0;
    for (const d of list) if (ISSUE_BY_KEY.has(d.key) && ['open', 'accepted', 'needs_fix'].includes(d.status)) { DECISIONS[d.key] = { status: d.status, note: String(d.note || ''), reviewer: String(d.reviewer || ''), at: String(d.at || '') }; n++; }
    if (!store.set('decisions', DECISIONS)) { bus.emit('decisions'); toast('Imported in memory only. Browser storage failed; export decisions to keep them.'); return; }
    bus.emit('decisions');
    toast(`Loaded ${n} of ${list.length} decisions${n < list.length ? '; the rest do not match this build' : ''}.`);
  }).catch(() => toast('That file is not a decisions export.'));
}
VIEWS.review = {
  label: 'Review', icon: 'review', hint: 'Work through QA items against the drawing and record decisions',
  mount(root, r0) {
    const list = h('div', { class: 'rv-list' }), progress = h('div', { class: 'rv-progress' }), filters = h('div', { class: 'rv-filters' }), detail = h('div', { class: 'rv-detail' }), host = h('div', { class: 'dv-host' });
    const file = h('input', { type: 'file', accept: '.json,application/json', class: 'hide', on: { change: () => { if (file.files[0]) importDecisions(file.files[0]); file.value = ''; } } });
    root.append(h('div', { class: 'view' }, h('div', { class: 'view-head' }, h('h1', { text: 'Review' }), h('span', { class: 'sub', text: 'Decisions are saved in this browser. Export them to keep them through a rebuild.' }), h('span', { style: { 'margin-left': 'auto' } }), btn('Import', 'upload', () => file.click(), 'sm'), btn('Export decisions', 'download', exportDecisions, 'sm'), file),
      h('div', { class: 'rv-layout' }, h('div', { class: 'rv-side' }, progress, filters, list), h('div', { class: 'rv-main' }, detail, host))));
    const viewer = new DrawingViewer(host);
    let view = [], cur = null, P = {};
    const statusOf = i => (needsReview(i) ? reviewOf(i).status : 'note');
    const fill = () => {
      const rc = reviewCounts(), st = P.status || (rc.open ? 'open' : 'all');
      clear(progress).append(h('div', { class: 'rv-prog-top' }, h('b', { text: rc.total ? `${Math.round((rc.accepted + rc.needs_fix) / rc.total * 100)}% dispositioned` : 'Nothing to review' }), h('span', { class: 'dim small', text: `${rc.accepted} reviewed · ${rc.needs_fix} need a fix · ${rc.open} open` })), reviewMeter(rc));
      const opt = (v, t) => h('option', { value: v, text: t });
      const codes = [...countBy(ISSUES, i => i.code)].sort((a, b) => b[1] - a[1]);
      const codeSel = h('select', { class: 'select', 'aria-label': 'Issue type', on: { change: e => go({ params: { code: e.target.value || null } }, { replace: true }) } }, opt('', 'All issue types'), codes.map(([c, n]) => opt(c, `${codeLabel(c)} (${n})`)));
      const sheetSel = h('select', { class: 'select', 'aria-label': 'Drawing', on: { change: e => go({ params: { sheet: e.target.value || null } }, { replace: true }) } }, opt('', 'All drawings'), SHEETS.map(s => opt(s.label, s.label)));
      codeSel.value = P.code || ''; sheetSel.value = P.sheet || '';
      clear(filters).append(segmented([{ value: 'open', label: `Open ${rc.open}` }, { value: 'needs_fix', label: `Fix ${rc.needs_fix}` }, { value: 'accepted', label: `Done ${rc.accepted}`, title: "Reviewed and accepted as drawn" }, { value: 'note', label: `Notes ${rc.notes}` }, { value: 'all', label: 'All' }], st, v => go({ params: { status: v } }, { replace: true })), h('div', { class: 'rv-selects' }, codeSel, sheetSel));
      view = ISSUES.filter(i => (st === 'all' || statusOf(i) === st) && (!P.code || i.code === P.code) && (!P.sheet || sheetLabel(i.sheet) === P.sheet));
      clear(list);
      for (const [code, items] of groupBy(view, i => i.code)) {
        list.append(h('div', { class: 'rv-group' }, h('span', { text: codeLabel(code) }), h('span', { class: 'dim', text: items.length })));
        for (const i of items) {
          const s = statusOf(i);
          const row = h('button', { class: 'rv-row' + (cur && i.key === cur.key ? ' active' : ''), type: 'button', data: { key: i.key }, on: { click: () => open(i) } }, h('span', { class: 'rv-msg', text: i.message }), h('span', { class: 'rv-meta' }, i.sheet ? h('span', { class: 'pill', text: sheetLabel(i.sheet) }) : null, s === 'note' ? h('span', { class: 'pill info', text: 'Note' }) : statusPill(s)));
          list.append(row);
        }
      }
      if (!view.length) list.append(h('div', { class: 'empty', text: st === 'open' ? 'No open items with these filters.' : 'Nothing matches these filters.' }));
    };
    const open = i => go({ arg: i.key, params: { sel: i.node && NODES.has(i.node) ? i.node : null } });
    const move = d => { if (!view.length) return; const idx = cur ? view.findIndex(i => i.key === cur.key) : -1; open(view[Math.max(0, Math.min(view.length - 1, idx + d))]); };
    const decide = status => {
      if (!cur || !needsReview(cur)) return;
      const note = detail.querySelector('textarea')?.value.trim() || '', reviewer = detail.querySelector('.rv-initials')?.value.trim() || '';
      store.set('reviewer', reviewer);
      const idx = view.findIndex(i => i.key === cur.key), next = view[idx + 1] || view[idx - 1];
      const saved = setDecision(cur.key, { status, note, reviewer, at: new Date().toISOString() });
      toast(!saved ? 'Could not save in this browser. Export decisions to keep them.' : status === 'accepted' ? 'Marked as reviewed' : status === 'needs_fix' ? 'Marked as needing a fix' : 'Reopened');
      if (next && !view.some(i => i.key === cur.key)) open(next);
    };
    const show = () => {
      clear(detail);
      if (!cur) { detail.append(h('div', { class: 'empty', text: ISSUES.length ? 'Choose an item on the left. J and K step through the list.' : 'The graph build raised no QA items. That is not a measure of extraction accuracy.' })); return; }
      const r = reviewOf(cur), n = NODES.get(cur.node), s = statusOf(cur), idx = view.findIndex(i => i.key === cur.key);
      const note = h('textarea', { class: 'input', rows: 2, placeholder: 'Why (optional): what you checked on the drawing', 'aria-label': 'Decision note' }); note.value = r.note || '';
      const initials = h('input', { class: 'input rv-initials', placeholder: 'Initials', maxlength: 8, 'aria-label': 'Reviewer initials', style: { width: '84px' } }); initials.value = r.reviewer || store.get('reviewer', '');
      detail.append(h('div', { class: 'rv-head' },
        h('div', { class: 'grow' }, h('div', { class: 'rv-kicker' }, h('span', { class: 'pill ' + (cur.severity === 'error' ? 'bad' : cur.severity === 'warning' ? 'warn' : 'info'), text: cap(cur.severity) }), h('span', { class: 'eyebrow', text: codeLabel(cur.code) }), s === 'note' ? null : statusPill(s), idx >= 0 ? h('span', { class: 'dim small', text: `${idx + 1} of ${view.length}` }) : null),
          h('p', { class: 'rv-message', text: cur.message }),
          h('div', { class: 'chips' }, n ? assetChip(n.id) : null, (cur.candidates || []).slice(0, 8).map(c => h('span', { class: 'chip' }, h('span', { class: 'lbl', text: typeof c === 'string' ? c : c.text || '' })))),
          r.raw_status ? h('p', { class: 'dim small', text: 'Source review: ' + pretty(r.raw_status) + '. This is not an acceptance decision.' }) : null,
          r.note ? h('p', { class: 'rv-prev' }, h('b', { text: r.source === 'qa_dispositions.json' ? 'Scripted disposition: ' : `Decision${r.reviewer ? ' by ' + r.reviewer : ''}: ` }), r.note) : null),
        needsReview(cur) ? h('div', { class: 'rv-decide' }, note, h('div', { class: 'rv-btns' }, initials, btn('Accept as drawn', 'check', () => decide('accepted'), 'primary sm'), btn('Needs fix', 'flag', () => decide('needs_fix'), 'sm'), s !== 'open' ? btn('Reopen', null, () => decide('open'), 'sm ghost') : null),
          h('div', { class: 'dim small' }, h('kbd', { text: 'A' }), ' accept · ', h('kbd', { text: 'F' }), ' needs fix · ', h('kbd', { text: 'J' }), h('kbd', { text: 'K' }), ' next / previous'))
          : h('p', { class: 'dim small', style: { 'max-width': '260px' }, text: 'Informational. Recorded by the build for context; no decision needed.' })));
    };
    const sync = (route, prev) => {
      P = route.params;
      const want = ISSUE_BY_KEY.get(route.arg) || null, changed = want !== cur;
      cur = want; fill();
      if (!cur && view.length && !route.arg) { queueMicrotask(() => go({ arg: view[0].key, params: { sel: view[0].node && NODES.has(view[0].node) ? view[0].node : null } }, { replace: true })); }
      show();
      list.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
      if (cur && (changed || !prev)) {
        const sheet = cur.sheet || homeSheet(NODES.get(cur.node));
        host.hidden = !sheet;
        if (sheet) { if (viewer.sheetId !== sheet) viewer.setSheet(sheet); else viewer.refresh(); const b = issueBox(cur); viewer.mark(b && !viewer.rects.has(cur.node) ? b : null); requestAnimationFrame(() => (b ? viewer.focusBox(b) : viewer.fitAll(true))); }
      } else if (cur) viewer.refresh();
      if (!cur) host.hidden = true;
    };
    sync(r0, null);
    const off = bus.on('decisions', () => { fill(); show(); });
    return { update: sync, destroy() { off(); viewer.destroy(); }, key(e) { const k = e.key.toLowerCase(); if (k === 'j') move(1); else if (k === 'k') move(-1); else if (k === 'a') decide('accepted'); else if (k === 'f') decide('needs_fix'); else if (k === 'o') decide('open'); else viewer.key(e); } };
  },
};
