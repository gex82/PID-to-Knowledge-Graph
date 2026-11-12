# Pahala graph: extraction and drawing validation

This records the drawing review baseline. For the current application, regression results and review-decision semantics, see [the November 11 code review](process-atlas-review-2026-11-11.md). A retained source warning is not an acceptance decision.

The local app now contains the full seventeen-sheet Pahala P&ID set: [open Pahala](http://127.0.0.1:8765/pahala/review/). The source is the [EPA-hosted July 2021 drawing set](https://www.epa.gov/system/files/documents/2021-08/pahala-wwtp-design-build-drawings-2021-07-23.pdf), physical PDF pages9–25. Legends6–8 and process schematic2 were consulted; they were not added as duplicate equipment sheets. No alternate revision of a selected P&ID was identified.

The title blocks state DESIGN/BUILD DOCUMENTS and explicitly limit the set to a July2021 concept submission, not design requirements. This graph describes that set, not verified as-built equipment or current operating state.

## What was built

| Record | Count | Meaning |
|---|---:|---|
| Sheets | 17 | P101, P201–211, P401, P501, P601–603 |
| Equipment records | 57 | Includes package envelopes, panels, mounted equipment and one future membrane group |
| Instrument/function records | 347 | Includes72 field-located functions and275 panel/PLC/SCADA functions; not347 independent physical sensors |
| Components | 164 | Valves, fittings, flow elements represented as components, and ambiguous retained symbols |
| Extracted pipe runs | 122 | Expanded to288 pipe segments |
| Measurement relationships | 84 | Explicit or inherited measurement placement; distinct from physical sensor count |
| Nodes / relationships | 1,053 / 1,462 | Canonical graph totals |
| Inferred loop groups | 100 | Heuristic grouping, not100 validated functional control loops |

JSON, DuckDB, GraphML and Neo4j CSV export files are local. The app supports tag/description search, sheet filtering, directed traces, measurement/control relationships, full-resolution drawings with source boxes, visible source notes, reviewed QA dispositions, and downloadable query evidence. No API keys are needed.

## Validation performed

All substantive nonblank tiles were visually reviewed, with source bounding boxes retained for equipment/instrument records. Every automatic cross-sheet pair was checked at both ends:16 fluid bridges and2 signal bridges. Three additional main-stream bridges were joined explicitly from one-sided reciprocal evidence, recorded in `work/pahala/reviewed_links.json` without inventing printed drawing numbers.

- Headworks normal and overflow paths: influent flume→fine screen→grit removal, with separate gated manual-bar-rack bypass and utility-water sprays.
- Treatment continuity: headworks→anoxic basin→pre-aeration→MBR membranes→permeate collection→contact basin→irrigation equalization→four drip zones. The shortest graph path can use the drawn permeate pump bypass; it does not establish hydraulic availability.
- Sludge and support: MBR→WAS storage→WAS pump/truck; gallery pump and sodium-hydroxide feeds to anoxic basin; pre-aeration and MBR blower connections.
- Fuel: bulk tank→filter/transfer pumps→day tank→onboard pump/generator, with distinct return routing. Signal flags remain separate from fluid connections.
- Targeted sensor checks include upstream/downstream screen levels, anoxic/pre-aeration/MBR sensing, permeate pressure/flow/turbidity, gallery/WAS tank levels and pump temperature/moisture, irrigation valve-position switches and fuel-tank levels.

The reproducible checks passed:65/65 whole-plant assertions,26/26 additional treatment assertions, and98/98 toolkit tests. The two drawing-check sets overlap; they are not independent accuracy samples. The browser verified FIT100,002→flume placement, full5000-pixel source inspection, and an85-node directed route from FROM PAHALA to DRIP ZONE1. Downloaded evidence contains84 corresponding edges. Reverse reachability and fuel/wastewater separation were checked in the graph. JSON and DuckDB traversal results agree.

These checks establish internal consistency and the reviewed source correspondences. They do not establish exhaustive precision/recall, hydraulic feasibility, control-logic acceptance, safe isolation, or independent engineering approval.

## Findings that remain visible

There are zero schema/reference errors and97 reviewed, retained automated warnings:

| Category | Count | Disposition |
|---|---:|---|
| Duplicate printed tags | 54 | Many are distinct local/SCADA representations; others are actual source collisions. Kept separate. |
| Suspected missed text tags | 15 | Address/CAD filename, truncated panel label or electrical-supply text; visually checked false candidates. |
| Inferred loop without final element | 14 | Missing vendor detail or switch-chain derivation limits; no invented actuation. |
| Equipment without fluid connections | 8 | Package enclosures/control panels; expected structural records. |
| Unmatched cross-sheet flags | 2 | One unresolved P209/P210 blower-reference discrepancy. |
| Unconnected components | 2 | P203 TP03 manifold ambiguity and one standalone future valve symbol. |
| Tag/signal loop disagreement | 2 | Manual H-functions command X-tagged vent valves; retained for control review. |

The most useful engineering review targets are:

1. P209 sends WAS blower air to P210, while P210 says its source is P205. That pair remains unjoined; the standby P209↔P205 connection is separately confirmed.
2. P101 has incomplete100tags and field114A/B versus SCADA124A/B labels; its115/125 level labels also differ. P401 has LE401→LI402→LI401. P601 alarm captions/numbers do not consistently correspond to field switches. Source labels are preserved.
3. P501 repeats zone2 position-switch tags on zone4. Zone3/4 outlet strokes meet the motor elevation; intended valve continuity is recorded at reduced confidence.
4. P203 future membranes and cleaning connections, plus the detached P206 acid hose, are conditional. The graph follows connected piping without simulating valve positions or cleaning modes. Acid-to-permeate-to-disinfection reachability must not be interpreted as a validated normal operating route.
5. Vendor shared buses and incomplete pump tags limit loop reconstruction. The P211 pump remains untagged because the source prints only PMP-.

## Changes required by the real drawings

The run exposed and fixed six-digit/area-separated tag parsing, accidental merging of unrelated reused panel tags, loss of extraction notes, signal flags being treated as process links, overstated cross-sheet confidence, and measurement-only wires being interpreted as actuation. Printed tags remain available beside canonical IDs. Explicit reviewed links provide auditable reconciliation for one-sided references. Regression tests cover these behaviors.

The app now filters by sheet and exposes5000-pixel drawings instead of only reduced overviews. Incomplete tags, source notes and QA dispositions are visible while inspecting assets.

## Local files and rerun

- `work/pahala/kg/graph.json` and `graph.duckdb`: canonical graph and query database.
- `work/pahala/extract/page_09.json` through `page_25.json`: reviewable source extractions.
- `work/pahala/validation/summary.json`, `coverage.json`, `checks.json`: source hash, coverage and assertions.
- `work/pahala/validation/equipment.csv`, `instrument_functions.csv`, `components.csv`: source-linked inventories.
- `work/pahala/validation/pipe_runs.csv` and `measurement_placements.csv`: every extracted run and graph measurement placement.
- `work/pahala/validation/qa_index.md`: final warning index, linking four detailed review reports.
- `work/pahala/validation/browser-route-evidence.json`: actual browser route export.
- `work/pahala/review/index.html`: standalone offline app, with all source drawings embedded.

From the repository directory, run `./run-pahala.sh --build-only` to rebuild and verify, or `PORT=8766 ./run-pahala.sh` to run another local server. Port8765 is currently serving the real graph. This reuses the visually reviewed extraction; it does not claim that PDF-to-JSON visual reasoning is fully automated. Source files and graph artifacts are in the local ignored `work` folder; changes have not been pushed to GitHub.
