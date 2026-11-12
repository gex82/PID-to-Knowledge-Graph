"""Read-only analytics over a built graph, for the offline review workbench.

Everything here describes *drawing connectivity and extraction state*. Nothing
is an operating-state, reliability, or safety figure.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any, Callable, Optional

import networkx as nx

from .store import Graph

TERMINAL = ("Equipment", "Boundary")
CONFIDENCE_BUCKETS = ("<0.70", "0.70-0.79", "0.80-0.89", "0.90-1.00")
# What a loop of each type needs to be drawn end to end.
LOOP_NEEDS = {
    "control": ("sensors", "controllers", "final_elements"),
    "on_off": ("sensors", "final_elements"),
    "interlock": ("sensors", "final_elements"),
    "monitoring": ("sensors",),
    "manual": ("final_elements",),
}


def local_piping(g: Graph, start: str, limit: int = 8) -> set[str]:
    """Segments and fittings near an item, stopping at the next equipment.

    Each direction gets the same hop budget. The CLI uses this helper too.
    """
    found: set[str] = set()
    for direction in ("down", "up"):
        frontier = [start]
        seen = {start}
        for _ in range(max(0, limit)):
            if not frontier or len(found) >= 500:
                break
            nxt = []
            for cur in frontier:
                for e in (g.out[cur] if direction == "down" else g.inn[cur]):
                    if e.type != "FLOWS_TO":
                        continue
                    other = e.target if direction == "down" else e.source
                    if other in seen or g.nodes[other].type in TERMINAL:
                        continue
                    seen.add(other)
                    found.add(other)
                    nxt.append(other)
            frontier = nxt
    return found


def confidence_bucket(value: float) -> str:
    if value < 0.70:
        return CONFIDENCE_BUCKETS[0]
    if value < 0.80:
        return CONFIDENCE_BUCKETS[1]
    if value < 0.90:
        return CONFIDENCE_BUCKETS[2]
    return CONFIDENCE_BUCKETS[3]


def _feeds_graph(g: Graph) -> nx.DiGraph:
    dg = nx.DiGraph()
    for n in g.kg.nodes:
        if n.type in TERMINAL:
            dg.add_node(n.id)
    for edges in g.out.values():
        for e in edges:
            if e.type == "FEEDS" and e.source in dg and e.target in dg:
                dg.add_edge(e.source, e.target)
    return dg


def equipment_context(g: Graph, piping: Callable[[Graph, str], set[str]] = local_piping) -> dict[str, Any]:
    """Per equipment: instruments on it or its own piping, loops, nearby fittings."""
    out: dict[str, Any] = {}
    for n in g.kg.nodes:
        if n.type != "Equipment":
            continue
        parts = {e.source for e in g.inn[n.id] if e.type == "PART_OF"}
        near = {n.id} | parts | piping(g, n.id)
        instruments = sorted({e.source for nid in near for e in g.inn[nid] if e.type == "MEASURES"})
        loops = {e.target for i in instruments for e in g.out[i] if e.type == "MEMBER_OF"}
        acting = set()
        for e in g.inn[n.id]:
            if e.type in ("ACTUATES", "TRIPS"):
                acting.update(m.target for m in g.out[e.source] if m.type == "MEMBER_OF")
        for loop in g.kg.nodes:
            if loop.type == "ControlLoop" and n.id in (loop.attributes.get("final_elements") or []):
                acting.add(loop.id)
        variables = Counter(g.nodes[i].attributes.get("variable") or "unclassified" for i in instruments)
        out[n.id] = {
            "instruments": instruments,
            "variables": dict(variables.most_common()),
            "loops": sorted(loops | acting),
            "acting_loops": sorted(acting),
            "fittings": sorted(x for x in near if g.nodes[x].type == "Component"),
        }
    return out


def connectivity(g: Graph) -> dict[str, Any]:
    dg = _feeds_graph(g)
    reach = {}
    for nid in dg:
        if g.nodes[nid].type != "Equipment":
            continue
        down = [x for x in nx.descendants(dg, nid) if g.nodes[x].type == "Equipment"]
        up = [x for x in nx.ancestors(dg, nid) if g.nodes[x].type == "Equipment"]
        reach[nid] = {"down": len(down), "up": len(up)}
    between = nx.betweenness_centrality(dg, normalized=True) if dg.number_of_edges() else {}
    cuts = set(nx.articulation_points(dg.to_undirected())) if dg.number_of_edges() else set()
    chokepoints = [
        {"id": nid, "score": round(score, 4), "cut": nid in cuts}
        for nid, score in sorted(between.items(), key=lambda kv: (-kv[1], kv[0]))
        if (score > 0 or nid in cuts) and g.nodes[nid].type == "Equipment"
    ][:15]
    recirculation = sorted(
        (sorted(c) for c in nx.strongly_connected_components(dg) if len(c) > 1),
        key=lambda c: (-len(c), c),
    )
    unconnected = sorted(nid for nid in dg if dg.degree(nid) == 0 and g.nodes[nid].type == "Equipment")
    connectors = [n for n in g.kg.nodes if n.type == "OffPageConnector"]
    partners = {n.id: sorted({
        e.target if e.source == n.id else e.source
        for e in [*g.out[n.id], *g.inn[n.id]]
        if e.type in ("FLOWS_TO", "SIGNAL_TO") and e.attributes.get("off_page")
    }) for n in connectors}
    matched = {nid for nid, targets in partners.items() if targets}
    return {
        "reach": reach,
        "chokepoints": chokepoints,
        "recirculation": recirculation,
        "unconnected": unconnected,
        "off_page": {
            "total": len(connectors),
            "matched": len(matched),
            "unmatched": sorted(n.id for n in connectors if n.id not in matched),
            "partners": partners,
        },
    }


def loop_health(g: Graph) -> dict[str, Any]:
    loops = {}
    by_type: dict[str, Counter] = defaultdict(Counter)
    for n in g.kg.nodes:
        if n.type != "ControlLoop":
            continue
        kind = n.attributes.get("loop_type") or n.kind or "other"
        missing = [k for k in LOOP_NEEDS.get(kind, ()) if not n.attributes.get(k)]
        loops[n.id] = {"missing": missing}
        by_type[kind]["complete" if not missing else "incomplete"] += 1
    return {"loops": loops, "by_type": {k: dict(v) for k, v in sorted(by_type.items())}}


def sheet_scorecards(g: Graph, issues: list[dict]) -> list[dict[str, Any]]:
    cards = []
    for s in g.kg.nodes:
        if s.type != "Sheet":
            continue
        members = [n for n in g.kg.nodes if s.id in (n.sheets or []) and n.type not in ("Sheet", "Plant")]
        mine = [i for i in issues if i.get("sheet") == s.id]
        confidences = [n.confidence for n in members]
        cards.append({
            "id": s.id,
            "label": s.label,
            "title": s.name or s.attributes.get("title") or "",
            "page": s.attributes.get("page"),
            "counts": dict(Counter(n.type for n in members)),
            "issues": dict(Counter(i["severity"] for i in mine)),
            "open": sum(1 for i in mine if i["severity"] != "info" and i.get("review", {}).get("status", "open") == "open"),
            "needs_fix": sum(1 for i in mine if i.get("review", {}).get("status") == "needs_fix"),
            "reviewed": sum(1 for i in mine if i.get("review", {}).get("status") == "accepted"),
            "mean_confidence": round(sum(confidences) / len(confidences), 3) if confidences else None,
            "low_confidence": sum(1 for c in confidences if c < 0.8),
            "tiles_reviewed": len(s.attributes.get("tiles_reviewed") or []),
            "unreadable": len(s.attributes.get("unreadable") or []),
            "notes": len(s.attributes.get("notes") or []),
        })
    return sorted(cards, key=lambda c: (c["page"] is None, c["page"] or 0, c["label"]))


def compute_analytics(g: Graph, issues: Optional[list[dict]] = None,
                      piping: Callable[[Graph, str], set[str]] = local_piping) -> dict[str, Any]:
    """Summaries embedded in the review page. ``issues`` are the enriched issue
    dicts (with ``sheet`` and ``review``); defaults to the graph's raw issues."""
    if issues is None:
        issues = [dict(i) for i in g.kg.issues]
    nodes = g.kg.nodes
    instruments = [n for n in nodes if n.type == "Instrument"]
    components = [n for n in nodes if n.type == "Component"]
    valves = [n for n in components if "valve" in (n.kind or "")]
    confidence: dict[str, Counter] = defaultdict(Counter)
    for n in nodes:
        if n.type not in ("Sheet", "Plant"):
            confidence[n.type][confidence_bucket(n.confidence)] += 1
    equipment = equipment_context(g, piping)
    matrix: dict[str, Counter] = defaultdict(Counter)
    status = Counter()
    for i in issues:
        matrix[i["code"]][i.get("sheet") or ""] += 1
        if i["severity"] != "info":
            status[i.get("review", {}).get("status", "open")] += 1
    return {
        "equipment": equipment,
        "connectivity": connectivity(g),
        "loops": loop_health(g),
        "sheets": sheet_scorecards(g, issues),
        "confidence": {t: {b: c.get(b, 0) for b in CONFIDENCE_BUCKETS} for t, c in sorted(confidence.items())},
        "low_confidence": sorted(
            (n.id for n in nodes if n.confidence < 0.8 and n.type not in ("Sheet", "Plant")),
            key=lambda nid: (g.nodes[nid].confidence, nid))[:60],
        "variables": dict(Counter(n.attributes.get("variable") or "unclassified" for n in instruments).most_common()),
        "locations": dict(Counter(n.attributes.get("location") or "not recorded" for n in instruments).most_common()),
        "roles": dict(Counter(n.attributes.get("role") or n.kind or "other" for n in instruments).most_common()),
        "valves": {
            "total": len(valves),
            "by_kind": dict(Counter(n.kind for n in valves).most_common()),
            "by_actuator": dict(Counter(n.attributes.get("actuator") or "not recorded" for n in valves).most_common()),
            "by_position": dict(Counter(n.attributes.get("normal_position") or "not recorded" for n in valves).most_common()),
        },
        "uninstrumented": sorted(k for k, v in equipment.items() if not v["instruments"]),
        "issue_matrix": {code: dict(c) for code, c in sorted(matrix.items())},
        "review_status": {k: status.get(k, 0) for k in ("open", "needs_fix", "accepted")},
    }
