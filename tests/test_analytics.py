from pidkg.analytics import compute_analytics, confidence_bucket, equipment_context, local_piping


def test_equipment_context_matches_cli_instrument_scope(mini_graph):
    """The workbench and `kg_query instruments --on` must agree on scope."""
    from kg_query import _local_piping

    for n in mini_graph.kg.nodes:
        if n.type == "Equipment":
            assert local_piping(mini_graph, n.id) == _local_piping(mini_graph, n.id)
    ctx = equipment_context(mini_graph)
    assert set(ctx) == {n.id for n in mini_graph.kg.nodes if n.type == "Equipment"}
    for eq, c in ctx.items():
        for inst in c["instruments"]:
            assert mini_graph.nodes[inst].type == "Instrument"
        assert sum(c["variables"].values()) == len(c["instruments"])
        assert set(c["acting_loops"]) <= set(c["loops"])


def test_analytics_summaries_are_consistent_with_the_graph(mini_graph):
    a = compute_analytics(mini_graph)
    nodes = mini_graph.kg.nodes
    assert sum(a["variables"].values()) == sum(1 for n in nodes if n.type == "Instrument")
    assert set(a["loops"]["loops"]) == {n.id for n in nodes if n.type == "ControlLoop"}
    assert sum(sum(v.values()) for v in a["loops"]["by_type"].values()) == len(a["loops"]["loops"])
    assert [s["label"] for s in a["sheets"]] == ["PID-100", "PID-200"]
    for t, buckets in a["confidence"].items():
        assert sum(buckets.values()) == sum(1 for n in nodes if n.type == t)
    reach = a["connectivity"]["reach"]
    # TK-100 -> P-101 -> TK-200 in the synthetic plant.
    assert reach["TK-100"]["down"] == 2 and reach["TK-200"]["up"] == 2
    assert a["connectivity"]["off_page"]["total"] == sum(1 for n in nodes if n.type == "OffPageConnector")
    assert a["valves"]["total"] == sum(a["valves"]["by_kind"].values())


def test_recirculation_and_unconnected_equipment_are_reported(mini_kg):
    from pidkg.models import Edge, Node
    from pidkg.store import Graph

    kg = mini_kg.model_copy(deep=True)
    kg.edges.append(Edge(id="EX1", source="TK-200", target="TK-100", type="FEEDS", confidence=0.9, derived=True))
    kg.nodes.append(Node(id="PNL-1", type="Equipment", label="PNL-1", sheets=["SHEET:PID-100"], confidence=0.9))
    c = compute_analytics(Graph(kg))["connectivity"]
    assert ["P-101", "TK-100", "TK-200"] in c["recirculation"]
    assert c["unconnected"] == ["PNL-1"]


def test_confidence_buckets():
    assert [confidence_bucket(v) for v in (0.5, 0.7, 0.85, 0.9, 1.0)] == ["<0.70", "0.70-0.79", "0.80-0.89", "0.90-1.00", "0.90-1.00"]


def test_local_piping_gets_full_budget_in_both_directions():
    from pidkg.models import Edge, KnowledgeGraph, Node, PlantInfo
    from pidkg.store import Graph
    nodes = [Node(id="T", type="Equipment", label="Tank")]
    edges = []
    for direction in ("up", "down"):
        previous = "T"
        for i in range(1, 11):
            nid = f"{direction}{i}"
            nodes.append(Node(id=nid, type="PipeSegment", label=nid))
            a, b = (nid, previous) if direction == "up" else (previous, nid)
            edges.append(Edge(id=nid, source=a, target=b, type="FLOWS_TO"))
            previous = nid
    graph = Graph(KnowledgeGraph(generator="test", generated_at="2026-11-11T00:00:00Z", plant=PlantInfo(id="test", name="Test"), nodes=nodes, edges=edges))
    assert local_piping(graph, "T", 8) == {f"{d}{i}" for d in ("up", "down") for i in range(1, 9)}
    assert local_piping(graph, "T", 0) == set()


def test_off_page_analytics_include_reviewed_and_item_links(mini_kg):
    from pidkg.models import Edge, Node
    from pidkg.store import Graph
    kg = mini_kg.model_copy(deep=True)
    for nid in ("REVIEWED", "ITEM", "UNMATCHED"):
        kg.nodes.append(Node(id=nid, label=nid, type="OffPageConnector"))
    kg.edges.extend([
        Edge(id="reviewed", source="REVIEWED", target="TK-100", type="FLOWS_TO", attributes={"off_page": True, "reviewed": True}),
        Edge(id="by_item", source="TK-200", target="ITEM", type="FLOWS_TO", attributes={"off_page": True, "linked_by": "other_item"}),
    ])
    op = compute_analytics(Graph(kg))["connectivity"]["off_page"]
    assert op["partners"]["REVIEWED"] == ["TK-100"]
    assert op["partners"]["ITEM"] == ["TK-200"]
    assert "REVIEWED" not in op["unmatched"] and "ITEM" not in op["unmatched"]
    assert "UNMATCHED" in op["unmatched"]
