# P&ID knowledge graph: assessment and development roadmap

Historical assessment from November 10. The full Pahala run and the subsequent Process Atlas application supersede the implementation-status statements below; see [Pahala validation](pahala-validation-2026-11-10.md) and [the current code review](process-atlas-review-2026-11-11.md).

Reviewed November 10, 2026 (America/New_York). Primary objective: manufacturing operations, equipment/sensor lookup, and process-flow understanding. Secondary objective: historian integration and AI fault investigation.

## Recommendation

Build on this toolkit. Its separation of visual reading from deterministic graph construction is useful, and its local JSON/DuckDB outputs avoid unnecessary infrastructure. The biggest opportunity is a **reviewable operations knowledge system**: an engineer can ask what feeds an asset, which instruments monitor its piping, and which controller moves a valve, then inspect the exact evidence.

The repository is an early foundation, not a validated plant model or an autonomous operations assistant. Its extraction stage is an AI workflow, not a Python function that converts arbitrary PDFs unattended. A usable product needs stronger identity, source/version tracking, review state, and independently scored extraction quality before relying on conversational answers.

## What the repositories actually contain

| Repository | Role | What it does not supply |
|---|---|---|
| PID-to-Knowledge-Graph | Claude skill, extraction instructions, Pydantic schemas, PDF rendering/OCR hints, graph builder, QA, SQL/CLI queries, exports, synthetic tests | A standalone visual extraction model, production UI, historian connector, or engineering-validated benchmark |
| public-chemical-manufacturing-datasets | Five public drawing sources and five time-series dataset sources | A downloaded corpus, common schema, matched plant/drawing/historian pairs, or ground-truth graph annotations |

The graph uses equipment, pipe segments, components, instruments, boundaries, sheets, and control loops. It distinguishes material flow (`FLOWS_TO`), condensed equipment flow (`FEEDS`), measurement (`MEASURES`), signals, actuation, and cascade relations. Pipe-segment nodes are especially valuable for locating instruments precisely. Equipment tags are normalized, off-page references are scored, and ISA tag grouping is refined by signal tracing. These heuristics are useful but can disagree.

Reviewed upstream versions: [PID toolkit, 7ee3a82](https://github.com/ScottDuncanAI/PID-to-Knowledge-Graph/tree/7ee3a82e655c13c11aa26ee25bdc2c0c01bd58f1) and [dataset directory, 3f21a85](https://github.com/ScottDuncanAI/public-chemical-manufacturing-datasets/tree/3f21a85). The first repository is MIT licensed; the directory's descriptions are CC BY 4.0, with separate terms for linked datasets.

## What was implemented and run locally

1. Both repositories were forked into `gex82` and cloned. Changes are on local branches `codex/local-review-workbench` and `codex/structured-catalog`; they have not been pushed or proposed upstream.
2. The original toolkit passed **78 tests**. The expanded suite passes **88 tests**, covering the fixes and offline review export. Dependency consistency also passed. The new GitHub Actions workflows have not run remotely.
3. The bundled two-sheet synthetic plant was built into JSON, DuckDB, a summary, and QA output: **38 nodes, 57 edges, 3 equipment items, 9 instruments, and 4 loops**, with zero errors/warnings and two informational items. GraphML and Neo4j export generation also ran. Neo4j itself was not installed or tested.
4. An offline browser explorer was added: asset search/filtering, equipment overview, directed upstream/downstream/path queries, relationship inspection, source references and bounding boxes, available drawing previews, QA queue, and query-evidence download. It makes no API requests. Search, reverse-path rejection, control relationships, and the downloaded evidence JSON were checked in Chrome.
5. The EPA-hosted Pahala PDF downloaded successfully. Its 25 pages were probed; PDF page 9 was classified as `vector_text`, rendered upright at 4521 x 2926 with 12 nonblank tiles, and processed into 252 text runs and 5 candidate tags. This was a preparation smoke test, **not a full drawing extraction or an accuracy evaluation**. Most bubble tags are split over lines; the five candidates are not a count of actual instruments.
6. The directory now has a structured ten-entry catalog, source/license/verification fields, a validator, bounded link checking, and **five passing catalog tests**. All ten source URLs responded with HTTP 200 in the final check. Three Kaggle pages required GET fallback after HEAD returned 404. Reachability does not establish downloadable access, content identity, or licensing.

## Confirmed defects and corrections

| Finding | Reproduction / consequence | Local correction |
|---|---|---|
| Duplicate-tag valves join the first loop | Two repeated skids produce an extra final-element membership | Apply occurrence scoping consistently to components; preserve explicit per-item loop identities even when extraction order differs |
| Direct sensor actuation is omitted | A drawn sensor-to-valve signal disappears when tag grouping already added the valve | Emit `ACTUATES` independently of whether membership already exists; retain relay members |
| Tag order can disagree with signals | Reversing repeated valve order can create conflicting loop assignments | Add `loop_signal_conflict` QA warnings; do not silently decide physical identity |
| Directed CLI path reverses the request | `path TK-200 TK-100` returns a TK-100-to-TK-200 route | Query only the requested direction |
| Derived connections default to confidence 1.0 | `FEEDS` and `ACTUATES` can look more certain than their source edges | Retain supporting edge IDs and use the minimum node/edge confidence on the supporting route; retain inferred flow direction on `FEEDS` |
| SQL and Python disagree on recirculation | SQL downstream/upstream can include the starting asset when a cycle returns to it | Exclude the starting asset consistently; test SQL results against Python traversal |

The repeated-tag and missing-actuation findings were originally reported in [upstream issue #1](https://github.com/ScottDuncanAI/PID-to-Knowledge-Graph/issues/1). They were reproduced locally before correction. The remaining findings came from code inspection and local execution. Minimum evidence confidence is a conservative heuristic, **not a statistically calibrated probability**. Confidence behavior for other derived relationship types remains to be audited.

## Highest-value next features: operations first

| Priority | Feature | Why it matters | Acceptance evidence |
|---|---|---|---|
| P0 | Stable plant/area/asset IDs with separate tag aliases | Repeated vendor-skid tags and renumbering should not silently select or merge equipment | Ambiguous lookups return candidates; repeated/skipped/reordered tags retain correct identity across drawings |
| P0 | Engineer review with source crops and saved corrections | A warning needs an actionable resolution, reviewer, and durable patch | Every accepted relationship links to source/version; a correction survives rebuild and is auditable |
| P0 | Directed route explanations and alternatives | Operations needs to distinguish process, utility, drain, bypass, and recirculation paths | Return directed supporting edges, cross-sheet steps, inferred links, and alternative routes without implying present valve state |
| P1 | Equipment-centered sensor and control-loop view | “What measures this pump's discharge?” is more useful than a graph inventory | Show sensing location, controller, final element, cascade and supporting signal path beside the drawing |
| P1 | Drawing revision comparison and release gates | Mixing old/new configurations can create plausible but impossible connectivity | Hash source files, compare added/removed/changed assets/edges, and keep draft/reviewed releases separate |
| P1 | Gold-standard benchmark and extraction instrumentation | Passing software tests does not demonstrate drawing accuracy | Independent annotations across digital, outlined and scanned drawings; per-relation precision/recall, off-page match accuracy, review minutes/page, latency and cost |
| P2 | Structured DEXPI input | Smart CAD exports can avoid unnecessary visual re-extraction | Round-trip IDs, connectivity, units and provenance against known DEXPI reference models |
| P2 | Bounded natural-language query tools | Conversational access should call validated graph operations | Questions resolve to read-only operations with citations, ambiguity handling, and abstention when evidence is absent |

The next pilot should cover one equipment train and roughly 5–10 representative sheets, with a named engineering reviewer and hand-checked answers. This is a proposed pilot scope, not an accuracy claim or delivery estimate. Test connected questions, including recirculation and missing off-page sheets, rather than only checking tag extraction.

Remaining implementation concerns include first-match tag resolution in `Graph.find`, heuristic cross-sheet matching, loss of bounding-box provenance in GraphML/Neo4j export properties, and tag-set evaluation that does not distinguish repeated instances well. The new explorer uses explicit node IDs, but it does not solve identity throughout the builder. The review queue is currently read-only; sign-off, correction persistence, revision diffing, and operating-state models are not implemented.

## Research implications

**DEXPI:** the official current specification page identifies **2.0.1** as the correction release replacing 2.0. The toolkit's `dexpi_class` labels are only approximate annotations; they are not conforming serialization. A future importer should select a specific specification version and validate it. [Official DEXPI specifications](https://dexpi.org/specifications/).

**Existing tooling:** pyDEXPI already documents DEXPI XML/JSON and legacy Proteus import, graph queries, visualization, validation, CLI and MCP capabilities. Investigate interoperability rather than rebuilding those functions. Its source currently declares AGPL-3.0; decide how that fits the intended distribution before embedding the library. No pyDEXPI code was copied or installed here. [pyDEXPI repository](https://github.com/process-intelligence-research/pyDEXPI).

**Graph-grounded answers:** the ChatP&ID preprint evaluates graph-based interaction with smart DEXPI drawings and reports improvements over direct input approaches. This supports testing structured retrieval in our own pilot; it does not validate this repository's visual extraction or transfer its reported performance to our drawings. [ChatP&ID research abstract](https://arxiv.org/abs/2603.22528).

## Secondary track: historian and AI fault investigation

Historian integration remains a second phase following the user's priority correction. A useful architecture keeps three distinct layers: drawing topology, historian observations, and diagnostic hypotheses. Graph proximity can select plausible evidence; it does not prove causation.

The strongest accessible starting point in this directory is [HistorianRCA](https://github.com/ScottDuncanAI/HistorianRCA). Its current source provides a conceptual diagram and process narrative for the **same simulated unit** as its historian data. The documentation describes 90 days, 30 target-unit tags and 60 neighboring-unit distractors, with the first 14 days designated as normal. Sources were cloned at `8d12a821395ce5f72e464dc78cc2c10d05cbb9ed`; no diagnostic analysis or score is claimed.

The narrative exposes a critical mapping example: the drawn TT-101 is historized as `TIC-101.PV`, LT-101 as `LIC-101.PV`, and FT-201 as `FIC-201.PV`. Simple string equality would miss these relationships. A mapping layer needs explicit source-backed aliases, plant/unit ownership, units, role, quality codes, controller modes, measurement delay, and version history. [Process description](https://github.com/ScottDuncanAI/HistorianRCA/blob/8d12a821395ce5f72e464dc78cc2c10d05cbb9ed/PROCESS_DESCRIPTION.md).

For the later pilot: load Parquet with DuckDB, preserve quality flags and raw irregular samples, distinguish PV/SP/OP/MODE, test setpoint/operator changes and communication artifacts separately from faults, and produce timestamped evidence packets with competing explanations. Avoid training/test leakage from the withheld answer key. Never imply that unrelated water-treatment PDFs and chemical-process time series represent the same plant. Benchmark results would remain simulated evidence, not plant calibration.

## Dataset-directory improvements beyond this iteration

Generate the human table from the structured catalog to prevent drift. Add document fingerprints for every downloaded source, last-successful retrieval, separately verified page ranges, task/split labels, and source-specific terms. Curate a small permitted gold corpus rather than accumulating links alone. Expand process diversity: the five current drawing sources all concern water or wastewater treatment.

The original directory characterized Pahala as federal work. The inspected drawing identifies a consultant and the County of Hawaii. This fork removes the unsupported authorship inference and records redistribution rights as unverified; hosting on an EPA domain is insufficient evidence of ownership. Public source drawings and downloaded historian files remain local and ignored by Git.

## Reproduction

From this fork: `./run-demo.sh` (or `./run-demo.sh --build-only`). Tests: `.venv/bin/python -m pytest -q` after installing `.[dev]`. Real-plant HTML: `.venv/bin/python skills/pid-to-kg/scripts/review_kg.py work/PLANT`.

The local demo is deterministic graph processing of existing synthetic extraction files. It does not call Claude, OpenAI, or another model. New PDF-to-graph work still requires the documented visual reading and QA process. The environment freeze and detailed verification records are saved in the parent workspace's `output/` directory.
