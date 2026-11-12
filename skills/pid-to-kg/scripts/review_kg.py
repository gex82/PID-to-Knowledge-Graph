#!/usr/bin/env python3
"""Export an offline, interactive review workbench for a built graph.

Usage: python review_kg.py work/mini-plant [--out review.html]
The HTML contains the graph and any rendered drawings, so keep it as private
as the source drawings. No API key, service, or network connection is required.

Review decisions exported from the page (``review_decisions.json``) are merged
back in when the file is placed in ``work/<plant>/validation/``.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
from pathlib import Path

from pidkg.analytics import compute_analytics
from pidkg.store import Graph

APP = Path(__file__).with_name("review_app")
# Concatenation order matters: later files use helpers from earlier ones.
JS_PARTS = ("core.js", "panzoom.js", "trace.js", "palette.js", "inspector.js", "home.js", "map.js",
            "drawing.js", "traceview.js", "loops.js", "lists.js", "review.js", "analytics.js", "main.js")
VALID_STATUS = ("open", "accepted", "needs_fix")


def _json_for_html(obj) -> str:
    # '<' must be escaped even in application/json: HTML parsers recognize a
    # closing script tag before JSON parsing. Source labels are untrusted.
    return json.dumps(obj, ensure_ascii=True).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")


def issue_key(issue: dict) -> str:
    """Identity of a QA issue that is stable across rebuilds of the same extraction."""
    identity = {k: v for k, v in issue.items() if k not in ("key", "review")}
    digest = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()[:20]
    return "|".join(str(issue.get(k) or "") for k in ("code", "node", "page", "sheet")) + "|" + digest


def graph_revision(data: dict) -> str:
    """Bind decisions to graph evidence, excluding the rebuild timestamp."""
    evidence = {k: data.get(k) for k in ("plant", "nodes", "edges", "issues")}
    return hashlib.sha256(json.dumps(evidence, sort_keys=True).encode()).hexdigest()


def enrich_issues(g: Graph, issues: list[dict], dispositions: list[dict] | None = None,
                  decisions: list[dict] | None = None) -> tuple[list[dict], int]:
    """Give every issue a key, a sheet, and a review state.

    ``dispositions`` is the scripted ``qa_dispositions.json``; ``decisions`` come
    from the workbench export and take precedence. Returns the issues and the
    number of decisions that no longer match any issue.
    """
    page_sheet = {n.attributes.get("page"): n.id for n in g.kg.nodes if n.type == "Sheet"}
    by_disposition = {(d.get("code"), d.get("node") or "", d.get("page")): d for d in dispositions or []}
    by_key = {d.get("key"): d for d in decisions or [] if d.get("key")}
    seen: dict[str, int] = {}
    used = set()
    for issue in issues:
        node = g.nodes.get(issue.get("node") or "")
        if not issue.get("sheet"):
            sheet = page_sheet.get(issue.get("page")) or (node.sheets[0] if node and node.sheets else None)
            if sheet:
                issue["sheet"] = sheet
        key = issue_key(issue)
        seen[key] = seen.get(key, 0) + 1
        if seen[key] > 1:
            key = f"{key}#{seen[key]}"
        issue["key"] = key
        review = {"status": "open"}
        d = by_disposition.get((issue["code"], issue.get("node") or "", issue.get("page")))
        if d:
            raw = str(d.get("status") or "")
            # Reviewed/retained means the warning was examined, not resolved.
            review = {"status": raw if raw in VALID_STATUS else "open",
                      "note": d.get("disposition") or "", "source": "qa_dispositions.json", "raw_status": raw}
            if d.get("evidence"):
                review["evidence"] = d["evidence"]
        d = by_key.get(key)
        if d and d.get("status") in VALID_STATUS:
            used.add(key)
            review = {"status": d["status"], "note": str(d.get("note") or ""), "source": "review_decisions.json"}
            for field in ("reviewer", "at"):
                if d.get(field):
                    review[field] = str(d[field])
        issue["review"] = review
    return issues, len(by_key) - len(used)


def _encode_page(path: Path) -> tuple[str, int, int]:
    """Drawing as a compact data URI. Line drawings survive 16 grey levels well,
    which cuts the embedded size to roughly a quarter of the RGB render."""
    raw = path.read_bytes()
    try:
        from PIL import Image
    except ImportError:  # pragma: no cover - Pillow is a declared dependency
        return "data:image/png;base64," + base64.b64encode(raw).decode("ascii"), 0, 0
    Image.MAX_IMAGE_PIXELS = None
    with Image.open(io.BytesIO(raw)) as im:
        im.load()
        grey = im.convert("L")
        buf = io.BytesIO()
        grey.quantize(16).save(buf, "PNG", optimize=True)
        data = buf.getvalue() if buf.tell() < len(raw) else raw
        return "data:image/png;base64," + base64.b64encode(data).decode("ascii"), grey.width, grey.height


def _read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None


def build_payload(work: Path) -> tuple[dict, dict[str, str]]:
    work = Path(work)
    g = Graph.load(work / "kg" / "graph.json")
    data = g.kg.model_dump(mode="json", exclude_none=True)
    data["graph_revision"] = graph_revision(data)
    # Honor the same P&ID-over-PFD traversal policy as kg_query.py.
    data["traversal_edge_ids"] = [e.id for edges in g.out.values() for e in edges]
    images: dict[str, str] = {}
    meta: dict[str, dict] = {}
    for n in g.kg.nodes:
        if n.type != "Sheet":
            continue
        page = n.attributes.get("page")
        if not isinstance(page, int) or page < 1:
            continue
        path = work / "pages" / f"page_{page:02d}" / "page.png"
        if not path.is_file():
            path = work / "pages" / f"page_{page:02d}" / "overview.png"
        if path.is_file():
            uri, w, h = _encode_page(path)
            images[str(page)] = uri
            meta[str(page)] = {"w": w, "h": h}
    # Sizes only; the pixels live in one lazily parsed block per page.
    data["page_images"] = meta
    review = _read_json(work / "validation" / "summary.json")
    if review is not None:
        data["source_review"] = review
    dispositions = _read_json(work / "validation" / "qa_dispositions.json")
    if dispositions is not None:
        data["issue_dispositions"] = dispositions
    decisions = _read_json(work / "validation" / "review_decisions.json")
    rejected = 0
    if decisions is not None:
        entries = decisions.get("decisions", []) if isinstance(decisions, dict) else decisions
        if not isinstance(entries, list) or any(not isinstance(d, dict) for d in entries):
            raise ValueError("review_decisions.json must contain a list of decision objects")
        if (not isinstance(decisions, dict) or decisions.get("plant") != data["plant"]["id"]
                or decisions.get("graph_revision") != data["graph_revision"]):
            rejected, decisions = len(entries), []
        else:
            decisions = entries
    data["issues"], stale = enrich_issues(g, data.get("issues", []), dispositions, decisions)
    data["review_meta"] = {"merged_decisions": len(decisions or []) - stale, "stale_decisions": stale + rejected}
    data["analytics"] = compute_analytics(g, data["issues"])
    return data, images


def render_html(data: dict, images: dict[str, str]) -> str:
    shell = (APP / "shell.html").read_text(encoding="utf-8")
    css = (APP / "styles.css").read_text(encoding="utf-8")
    js = "\n".join(f"// ---- {name}\n" + (APP / name).read_text(encoding="utf-8") for name in JS_PARTS)
    if "</script" in js.lower() or "</style" in css.lower():
        raise ValueError("review_app sources must not contain closing script/style tags")
    blocks = "\n".join(
        f'<script id="page-image-{page}" type="application/json">{_json_for_html(uri)}</script>'
        for page, uri in sorted(images.items(), key=lambda kv: int(kv[0])))
    # Data goes in last so nothing in the (untrusted) payload is re-scanned.
    html = shell.replace("/*__CSS__*/", css).replace("/*__JS__*/", js).replace("<!--__PAGE_IMAGES__-->", blocks)
    return html.replace("__GRAPH_DATA__", _json_for_html(data))


def export_review(work: Path, out: Path) -> Path:
    data, images = build_payload(Path(work))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render_html(data, images), encoding="utf-8")
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("work", type=Path)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    out = args.out or args.work / "review" / "index.html"
    print(export_review(args.work, out))


if __name__ == "__main__":
    main()
