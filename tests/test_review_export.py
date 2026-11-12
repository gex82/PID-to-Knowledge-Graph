import json
import re
import pytest

from review_kg import build_payload, enrich_issues, export_review, issue_key


def _write_graph(kg, root):
    (root / "kg").mkdir(parents=True, exist_ok=True)
    (root / "kg" / "graph.json").write_text(kg.model_dump_json())


def _payload(html):
    return json.loads(re.search(r'<script id="graph-data" type="application/json">(.*?)</script>', html, re.S)[1])


def test_offline_review_preserves_evidence_and_escapes_source_text(mini_kg, tmp_path):
    kg = mini_kg.model_copy(deep=True)
    kg.plant.name = '</script><script>alert("source label")</script>'
    _write_graph(kg, tmp_path)
    out = export_review(tmp_path, tmp_path / "review" / "index.html")
    html = out.read_text()
    data = _payload(html)
    assert data["plant"]["name"] == kg.plant.name
    assert '</script><script>alert' not in html
    assert data["nodes"][0] == kg.nodes[0].model_dump(mode="json", exclude_none=True)
    assert data["page_images"] == {}
    assert set(data["traversal_edge_ids"]) == {e.id for e in kg.edges}
    assert 'connect-src \'none\'' in html
    assert "default-src 'none'" in html


def test_page_is_self_contained(mini_kg, tmp_path):
    _write_graph(mini_kg, tmp_path)
    html = export_review(tmp_path, tmp_path / "index.html").read_text()
    # No placeholders left behind, and nothing fetched from anywhere.
    for marker in ("__GRAPH_DATA__", "/*__CSS__*/", "/*__JS__*/", "<!--__PAGE_IMAGES__-->"):
        assert marker not in html
    assert not re.search(r'<(script|link|img)[^>]+(src|href)="https?:', html)
    assert html.count("<script") == html.count("</script>")


def test_rendered_page_is_included_for_offline_evidence(mini_kg, tmp_path):
    from PIL import Image

    _write_graph(mini_kg, tmp_path)
    page = tmp_path / "pages" / "page_01"
    page.mkdir(parents=True)
    Image.new("RGB", (400, 260), "white").save(page / "overview.png")
    html = export_review(tmp_path, tmp_path / "index.html").read_text()
    assert "data:image/png;base64," in html
    # Pixels sit in their own block so the main payload stays small.
    assert '<script id="page-image-1" type="application/json">' in html
    assert _payload(html)["page_images"] == {"1": {"w": 400, "h": 260}}


def test_issues_get_keys_sheets_and_scripted_dispositions(mini_graph):
    issues = [
        {"severity": "warning", "code": "duplicate_tag", "message": "m", "node": "FIC-101", "page": 1},
        {"severity": "warning", "code": "duplicate_tag", "message": "m", "node": "FIC-101", "page": 1},
        {"severity": "info", "code": "loop_no_sensor", "message": "m", "node": "LOOP:F-101"},
    ]
    dispositions = [{"code": "duplicate_tag", "node": "FIC-101", "page": 1, "status": "reviewed_retained", "disposition": "kept"}]
    out, stale = enrich_issues(mini_graph, issues, dispositions, None)
    assert stale == 0
    assert out[0]["key"] == issue_key(out[0])
    assert out[1]["key"] == out[0]["key"] + "#2"
    assert out[0]["sheet"] == "SHEET:PID-100"
    assert out[0]["review"]["status"] == "open" and out[0]["review"]["note"] == "kept"
    assert out[2]["review"] == {"status": "open"}


def test_exported_decisions_survive_a_rebuild(mini_kg, tmp_path):
    kg = mini_kg.model_copy(deep=True)
    kg.issues = [{"severity": "warning", "code": "duplicate_tag", "message": "check me", "node": "FIC-101", "page": 1}]
    _write_graph(kg, tmp_path)
    payload, _ = build_payload(tmp_path)
    key = payload["issues"][0]["key"]
    (tmp_path / "validation").mkdir()
    (tmp_path / "validation" / "review_decisions.json").write_text(json.dumps({"plant": payload["plant"]["id"], "graph_revision": payload["graph_revision"], "decisions": [
        {"key": key, "status": "needs_fix", "note": "wrong loop", "reviewer": "EX", "at": "2026-11-11T00:00:00Z"},
        {"key": "gone|X||", "status": "accepted"},
        {"key": key + "-bad", "status": "not-a-status"},
    ]}))
    data, _ = build_payload(tmp_path)
    review = data["issues"][0]["review"]
    assert review["status"] == "needs_fix" and review["note"] == "wrong loop" and review["reviewer"] == "EX"
    assert data["review_meta"] == {"merged_decisions": 1, "stale_decisions": 2}
    assert data["analytics"]["review_status"] == {"open": 0, "needs_fix": 1, "accepted": 0}


def test_issue_decisions_do_not_move_when_issues_are_reordered(mini_graph):
    import copy
    a = {"severity": "warning", "code": "duplicate_tag", "message": "first location", "node": "FIC-101", "page": 1}
    b = dict(a, message="second location")
    original, _ = enrich_issues(mini_graph, [copy.deepcopy(a), copy.deepcopy(b)])
    decisions = [{"key": original[0]["key"], "status": "accepted", "note": "checked first"}]
    reordered, stale = enrich_issues(mini_graph, [b, a], decisions=decisions)
    assert not stale
    assert reordered[0]["review"]["status"] == "open"
    assert reordered[1]["review"]["note"] == "checked first"


@pytest.mark.parametrize("change", ["plant", "revision", "evidence"])
def test_reject_decisions_for_different_plant_or_graph(mini_kg, tmp_path, change):
    kg = mini_kg.model_copy(deep=True)
    kg.issues = [{"severity": "warning", "code": "duplicate_tag", "message": "check", "node": "FIC-101"}]
    _write_graph(kg, tmp_path)
    payload, _ = build_payload(tmp_path)
    saved = {"plant": payload["plant"]["id"], "graph_revision": payload["graph_revision"],
             "decisions": [{"key": payload["issues"][0]["key"], "status": "accepted"}]}
    if change == "plant":
        saved["plant"] = "another-plant"
    elif change == "revision":
        saved["graph_revision"] = "old"
    else:
        kg.nodes[-1].confidence = 0.1
        _write_graph(kg, tmp_path)
    (tmp_path / "validation").mkdir()
    (tmp_path / "validation" / "review_decisions.json").write_text(json.dumps(saved))
    data, _ = build_payload(tmp_path)
    assert data["issues"][0]["review"]["status"] == "open"
    assert data["review_meta"] == {"merged_decisions": 0, "stale_decisions": 1}


def test_graph_revision_ignores_rebuild_timestamp(mini_kg, tmp_path):
    from review_kg import graph_revision
    data = mini_kg.model_dump(mode="json")
    before = graph_revision(data)
    data["generated_at"] = "2099-01-01"
    assert graph_revision(data) == before


def test_export_preserves_source_pixel_dimensions(mini_kg, tmp_path):
    from PIL import Image
    import base64
    import io
    _write_graph(mini_kg, tmp_path)
    page = tmp_path / "pages" / "page_01"
    page.mkdir(parents=True)
    Image.new("RGB", (5000, 300), "white").save(page / "page.png")
    data, images = build_payload(tmp_path)
    with Image.open(io.BytesIO(base64.b64decode(images["1"].split(",")[1]))) as im:
        assert im.size == (5000, 300)
        assert data["page_images"]["1"] == {"w": im.width, "h": im.height}
