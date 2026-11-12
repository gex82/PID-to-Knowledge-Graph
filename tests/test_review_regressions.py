"""User-visible regressions found during the local evaluation."""
import json
import subprocess
import sys

from conftest import SCRIPTS
from pidkg.build import build_graph
from pidkg.models import PageExtraction
from pidkg.qa import run_qa


def repeated_skids(reverse_valves=False):
    valves = [{"id": f"V{i}", "tag": "LV-100", "kind": "control_valve",
               "actuator": "pneumatic"} for i in (1, 2)]
    return PageExtraction.model_validate({
        "page": 1, "sheet": {"drawing_number": "SKIDS"},
        "equipment": [{"id": f"TK-{i}", "tag": f"TK-{i}", "kind": "tank"} for i in (1, 2)],
        "components": list(reversed(valves)) if reverse_valves else valves,
        "instruments": [{"id": f"T{i}", "tag": "LT-100", "measures": {"item": f"TK-{i}"}}
                        for i in (1, 2)],
        "signals": [{"from": f"T{i}", "to": f"V{i}", "purpose": "control"} for i in (1, 2)],
        "lines": [{"id": f"L{i}", "from": f"TK-{i}", "to": "OUT", "path": [f"V{i}"]}
                  for i in (1, 2)],
        "boundaries": [{"id": "OUT", "name": "Drain", "direction": "sink"}],
    })


def test_repeated_valves_belong_to_their_respective_loops():
    kg = build_graph([repeated_skids()], "skids", "Repeated skids")
    finals = {(e.source, e.target) for e in kg.edges
              if e.type == "MEMBER_OF" and e.attributes.get("role") == "final_element"}
    assert finals == {("LV-100", "LOOP:L-100"), ("LV-100#2", "LOOP:L-100#2")}


def test_direct_sensor_signals_always_emit_actuation_edges():
    kg = build_graph([repeated_skids()], "skids", "Repeated skids")
    assert {(e.source, e.target) for e in kg.edges if e.type == "ACTUATES"} == {
        ("LT-100", "LV-100"), ("LT-100#2", "LV-100#2")}


def test_signal_tag_disagreement_is_visible_for_review():
    # Occurrence suffixes are not physical skid identity. Different extraction
    # order must be flagged rather than presented as an unambiguous loop.
    kg = build_graph([repeated_skids(reverse_valves=True)], "skids", "Repeated skids")
    warnings = [i for i in run_qa(kg) if i["code"] == "loop_signal_conflict"]
    assert {i["node"] for i in warnings} == {"LV-100", "LV-100#2"}
    assert all(i["severity"] == "warning" for i in warnings)


def test_explicit_loop_identity_overrides_duplicate_occurrence_order():
    page = repeated_skids(reverse_valves=True)
    for item in page.components + page.instruments:
        item.loop = f"L-SKID{item.id[-1]}"
    kg = build_graph([page], "skids", "Repeated skids")
    finals = {(e.source, e.target) for e in kg.edges
              if e.type == "MEMBER_OF" and e.attributes.get("role") == "final_element"}
    assert finals == {("LV-100#2", "LOOP:L-SKID1"), ("LV-100", "LOOP:L-SKID2")}
    assert not [i for i in run_qa(kg) if i["code"] == "loop_signal_conflict"]


def test_cli_path_does_not_reverse_requested_direction(mini_kg, tmp_path):
    graph = tmp_path / "graph.json"
    graph.write_text(mini_kg.model_dump_json())
    def query(a, b):
        result = subprocess.run([sys.executable, str(SCRIPTS / "kg_query.py"), str(graph),
                                 "path", a, b, "--json"], text=True, capture_output=True)
        assert result.returncode == 0, result.stderr
        return json.loads(result.stdout)
    assert query("TK-200", "TK-100")["path"] is None
    forward = query("TK-100", "TK-200")["path"]
    assert (forward[0]["id"], forward[-1]["id"]) == ("TK-100", "TK-200")


def test_derived_actuation_carries_weakest_evidence_and_signal_path():
    page = repeated_skids()
    page.signals[0].confidence = 0.3
    kg = build_graph([page], "skids", "Repeated skids")
    edge = next(e for e in kg.edges if e.type == "ACTUATES" and e.source == "LT-100")
    assert edge.confidence == 0.3
    evidence = [e for e in kg.edges if e.id in edge.attributes["evidence_edges"]]
    assert [(e.source, e.target, e.type) for e in evidence] == [("LT-100", "LV-100", "SIGNAL_TO")]


def test_derived_flow_preserves_inferred_direction_and_confidence():
    page = repeated_skids()
    page.lines[0].confidence = 0.2
    page.lines[0].flow_direction = "inferred"
    kg = build_graph([page], "skids", "Repeated skids")
    edge = next(e for e in kg.edges if e.type == "FEEDS" and e.source == "TK-1")
    assert edge.confidence == 0.2
    assert edge.attributes["flow_direction"] == "inferred"
    evidence = {e.id: e for e in kg.edges}
    route = edge.attributes["via_nodes"]
    assert (route[0], route[-1]) == (edge.source, edge.target)
    assert [(evidence[i].source, evidence[i].target) for i in edge.attributes["evidence_edges"]] == list(zip(route, route[1:]))


def test_sql_and_python_traversals_agree_on_recirculation(mini_kg, mini_graph, tmp_path):
    import duckdb
    from pidkg.store import write_duckdb

    db = tmp_path / "graph.duckdb"
    write_duckdb(mini_kg, db)
    with duckdb.connect(str(db), read_only=True) as con:
        for sql_name, direction in (("downstream", "down"), ("upstream", "up")):
            actual = {r[0] for r in con.execute(f"SELECT id FROM {sql_name}(?)", ["TK-100"]).fetchall()}
            assert "TK-100" not in actual
            assert actual == {nid for nid, _ in mini_graph.walk("TK-100", direction)}
