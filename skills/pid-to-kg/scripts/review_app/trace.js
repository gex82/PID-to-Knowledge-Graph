// Directed flow tracing over FLOWS_TO. Pure functions over the indexes.
function flowNext(id, reverse) { return (reverse ? INN : OUT).get(id)?.filter(e => e.type === 'FLOWS_TO') || NONE; }
/** Breadth-first walk. Returns visit order and the tree edge that reached each node. */
function bfs(start, reverse, maxDepth, banned) {
  const prev = new Map(), hops = new Map([[start, 0]]), order = [], q = [start];
  for (let i = 0; i < q.length; i++) {
    const cur = q[i], d = hops.get(cur);
    if (maxDepth && d >= maxDepth) continue;
    for (const e of flowNext(cur, reverse)) {
      if (banned && banned.has(e.id)) continue;
      const nxt = reverse ? e.source : e.target;
      if (hops.has(nxt)) continue;
      hops.set(nxt, d + 1); prev.set(nxt, { id: cur, edge: e }); order.push({ id: nxt, hops: d + 1 }); q.push(nxt);
    }
  }
  return { order, prev, hops };
}
/** Rebuild the route from the walk start to `id`, always listed in flow direction. */
function routeFrom(walk, start, id, reverse) {
  const nodes = [id], edges = [];
  let cur = id;
  while (cur !== start) { const p = walk.prev.get(cur); if (!p) return null; edges.push(p.edge); cur = p.id; nodes.push(cur); }
  if (!reverse) { nodes.reverse(); edges.reverse(); }
  return { nodes, edges };
}
function shortestRoute(a, b, banned) {
  if (a === b) return { nodes: [a], edges: [] };
  const w = bfs(a, false, 0, banned);
  return w.hops.has(b) ? routeFrom(w, a, b, false) : null;
}
/** Shortest route plus distinct alternatives found by removing one edge of it at a time. */
function routes(a, b, limit = 3) {
  const first = shortestRoute(a, b);
  if (!first) return [];
  const found = [first], seen = new Set([first.nodes.join('>')]);
  for (const e of first.edges) {
    const alt = shortestRoute(a, b, new Set([e.id]));
    if (!alt) continue;
    const key = alt.nodes.join('>');
    if (!seen.has(key)) { seen.add(key); found.push(alt); }
  }
  return [first, ...found.slice(1).sort((x, y) => x.nodes.length - y.nodes.length)].slice(0, limit);
}
function measuring(id) { return inE(id, 'MEASURES').map(e => e.source); }
function routeStats(r) {
  const ns = r.nodes.map(id => NODES.get(id));
  const sheets = [];
  for (const n of ns) for (const s of n.sheets || []) if (!sheets.includes(s)) sheets.push(s);
  const conf = [...ns.map(n => n.confidence), ...r.edges.map(e => e.confidence)].filter(c => typeof c === 'number');
  return {
    steps: r.edges.length,
    valves: ns.filter(isValve).length,
    equipment: ns.filter(n => n.type === 'Equipment').length,
    instruments: new Set(r.nodes.flatMap(measuring)).size,
    sheets,
    inferred: r.edges.filter(e => e.attributes?.flow_direction === 'inferred').length,
    minConfidence: conf.length ? Math.min(...conf) : null,
  };
}
/** Nearest valve on each branch away from an item, as drawn. Not an isolation plan. */
function boundaryValves(id, limit = 40) {
  const res = [];
  for (const reverse of [true, false]) {
    const seen = new Set([id]), q = [{ id, hops: 0 }];
    for (let i = 0; i < q.length && i < 400; i++) {
      const cur = q[i];
      if (cur.hops >= limit) continue;
      for (const e of flowNext(cur.id, reverse)) {
        const nxt = reverse ? e.source : e.target;
        if (seen.has(nxt)) continue;
        seen.add(nxt);
        const n = NODES.get(nxt);
        if (isValve(n)) res.push({ side: reverse ? 'in' : 'out', id: nxt, hops: cur.hops + 1, valve: true });
        else if (isTerminal(n)) res.push({ side: reverse ? 'in' : 'out', id: nxt, hops: cur.hops + 1, valve: false });
        else q.push({ id: nxt, hops: cur.hops + 1 });
      }
    }
  }
  return res;
}
