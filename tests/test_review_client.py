"""Exercise the offline client's graph/decision logic in Node, without a browser."""
import json
import shutil
import subprocess

import pytest

from review_kg import APP, JS_PARTS, build_payload


def test_client_routes_decision_identity_and_exports(mini_kg, tmp_path):
    node = shutil.which("node")
    if not node:
        pytest.skip("Node is required for offline client regression checks")
    (tmp_path / "kg").mkdir()
    kg = mini_kg.model_copy(deep=True)
    kg.issues = [{"code": "test_issue", "severity": "warning", "message": "Check source", "node": "TK-100"}]
    (tmp_path / "kg" / "graph.json").write_text(kg.model_dump_json())
    data, _ = build_payload(tmp_path)
    sources = "\n".join((APP / name).read_text() for name in JS_PARTS if name != "main.js")
    # Compile the whole app too, including boot, to catch cross-module syntax errors.
    compiled = "\n".join((APP / name).read_text() for name in JS_PARTS)
    harness = r'''
const vm = require('node:vm'), fs = require('node:fs'), assert = require('node:assert/strict');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
new vm.Script(input.compiled);
const context = vm.createContext({
  assert, console,
  document: {getElementById: () => ({textContent: JSON.stringify(input.data)})},
  localStorage: {getItem: () => null, setItem: () => {}},
});
vm.runInContext(input.sources, context);
vm.runInContext(`
  var messages = [];
  toast = msg => messages.push(msg);
  assert.equal(shortestRoute('TK-200', 'TK-100'), null);
  var forward = shortestRoute('TK-100', 'TK-200');
  assert.equal(forward.nodes[0], 'TK-100');
  assert.equal(forward.nodes.at(-1), 'TK-200');
  assert.equal(forward.edges.length, forward.nodes.length - 1);
  for (var i = 0; i < forward.edges.length; i++) {
    assert.equal(forward.edges[i].source, forward.nodes[i]);
    assert.equal(forward.edges[i].target, forward.nodes[i+1]);
  }
  assert.ok(store.key('decisions').includes(KG.graph_revision));
  assert.equal(toCSV([{label:'Value', get:x=>x}], ['abc\\r=2']), 'Value\\n"abc\\r=2"');
  assert.equal(toCSV([{label:'Value', get:x=>x}], [' =2']), "Value\\n' =2");
  var decision = {key: ISSUES[0].key, status:'needs_fix', note:'Keep this evidence', reviewer:'test'};
  var payload = {plant:KG.plant.id, graph_revision:KG.graph_revision, decisions:[decision]};
`, context);
// Import is asynchronous. Drain promise callbacks after each file read.
(async () => {
  vm.runInContext(`importDecisions({text:async()=>JSON.stringify({...payload, plant:'another-plant'})})`, context);
  await new Promise(resolve => setImmediate(resolve));
  vm.runInContext(`assert.equal(Object.keys(DECISIONS).length, 0)`, context);
  vm.runInContext(`importDecisions({text:async()=>JSON.stringify({...payload, graph_revision:'old'})})`, context);
  await new Promise(resolve => setImmediate(resolve));
  vm.runInContext(`assert.equal(Object.keys(DECISIONS).length, 0)`, context);
  vm.runInContext(`importDecisions({text:async()=>JSON.stringify(payload)})`, context);
  await new Promise(resolve => setImmediate(resolve));
  vm.runInContext(`
    assert.equal(reviewOf(ISSUES[0]).note, 'Keep this evidence');
    var exported;
    download = (name, text) => { exported = JSON.parse(text); };
    exportDecisions();
    assert.equal(exported.plant, KG.plant.id);
    assert.equal(exported.graph_revision, KG.graph_revision);
    assert.equal(exported.decisions[0].note, 'Keep this evidence');
  `, context);
})().catch(error => {console.error(error); process.exitCode = 1;});
'''
    result = subprocess.run([node, "-e", harness], input=json.dumps({"data": data, "sources": sources, "compiled": compiled}),
                            text=True, capture_output=True, timeout=30)
    assert result.returncode == 0, result.stderr
