# Process Atlas code review — November 11, 2026

The locally supplied Claude Code work adds an offline application with Home, Process map, Drawings, Trace, Loops, Lists, Review and Analytics views. The session URL was inaccessible, so this review used the files in the shared repository. No blocking software defects remain from the findings below after correction and verification. This is approval to commit the software baseline, not engineering approval of the extracted plant model.

## Corrections made during review

| Finding | Correction |
|---|---|
| Every `reviewed_retained` source warning was automatically marked accepted, including unresolved source conflicts | Retained source reviews remain open until an explicit decision. Existing explanatory notes remain visible. |
| Review identities depended on occurrence order; decisions could be applied to another plant or changed graph | Issue identities include their evidence content. Browser storage and decision imports/exports are bound to the plant and a graph fingerprint. Changed or legacy unbound exports are reported as stale. Rebuild timestamps do not invalidate decisions. |
| Editing an imported decision could replace its note with an empty string | The editor starts with the effective saved note and reviewer. Storage failures remain visible. |
| Cross-sheet analytics and drawing navigation ignored manually reviewed links and item-reference links | Connector partners now come from actual cross-sheet graph edges, including signal links. Pahala has 39 linked connectors and two unresolved connectors. |
| Searching downstream consumed the hop budget intended for upstream instrument context | Both directions receive the full budget, shared by the CLI and application through one implementation. |
| Selecting an item in a trace could change the trace origin | The origin is written to the route before inspecting individual steps. Negative alternative indices are clamped. |
| All cross-sheet trace steps claimed to be matching connectors | Reviewed links display their recorded evidence; heuristic connector and item-reference matches are identified separately. |
| Drawing export reduced source resolution | Compact grayscale encoding retains the source pixel dimensions, including Pahala's 5,000-pixel sheets. |
| CSV fields containing carriage returns could split rows | Both newline forms are quoted; formula-like cells are escaped, including leading whitespace. |
| Loop completeness could sound like verified control functionality | Labels describe expected member presence. Signal continuity and control-logic acceptance are explicitly outside that metric. |

The loop completeness filter now resets correctly, and drawing scorecard counts use the current browser review decisions. The existing directed-query, repeated-tag, confidence, signal and Pahala extraction corrections are included in this software baseline.

## Verification

- 114 Python/client regression tests passed, with Node installed so the client test was executed rather than skipped. That test compiles the assembled application and exercises directed routes, decision import/export scope and CSV escaping.
- 65 whole-plant Pahala assertions and 26 treatment assertions passed. These overlap and are not independent extraction-accuracy measurements.
- The synthetic demo and real Pahala exports rebuilt successfully. Pahala remains at 1,053 nodes, 1,462 relationships, zero schema/reference errors, 97 retained warnings and 47 informational items.
- A second Pahala build in a separate Python process with a different hash seed produced the same evidence fingerprint.
- All eight application views loaded in Chrome. The source drawing, loop diagram, equipment register, retained-warning queue and connector filter were inspected. The directed headworks-to-drip-zone route had 84 edges; its reverse had no path. Inspecting an item preserved the trace's start and destination.
- Dependency consistency, JavaScript compilation, shell syntax and Git whitespace checks passed.
- The companion ten-entry dataset catalog passed offline validation and all five tests. Link availability was not re-probed in this review.

## Remaining limits

The Pahala set is a July 2021 concept submission, not a verified current plant configuration. The two unresolved blower flags, source tag collisions, incomplete vendor details, future equipment and conditional cleaning connections remain documented in [the drawing validation report](pahala-validation-2026-11-10.md). The 97 warnings are source-reviewed but are not automatically accepted by the application.

Routes describe extracted connectivity, not operating mode, valve state or safe isolation. Equipment counts include panels and package envelopes; instrument records include field and control-system functions. Inferred loop groups and connectivity metrics are aids to review, not validated control logic or reliability ratings. Source tag ambiguity and heuristic cross-sheet matching still require engineering judgment.

The code, synthetic fixtures, tests and reports are versioned. The real source PDF, rendered sheets, reviewed extraction data and generated graph remain in the local ignored `work/` folder. A fresh clone runs the synthetic demo; running Pahala on another machine requires restoring that folder. No source drawings or downloaded historian datasets are published with this commit.

For continued use, run `./run-pahala.sh --build-only` and open the local server's `/pahala/review/` page. Review decisions annotate QA findings; they do not modify extraction JSON or repair graph topology. Keep an exported `validation/review_decisions.json` with the corresponding unchanged graph. Re-review decisions when the graph evidence changes.
