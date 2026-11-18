import assert from 'node:assert/strict';
import test from 'node:test';
import {byRoute, routes} from '../src/data/atlas.js';
import {fullMapSvg} from '../tools/full-map.js';

test('the full map includes all assay and research operations', () => {
  const full = byRoute.full;
  for (const route of routes.filter(r => ['rna', 'paired', 'fragments', 'study'].includes(r.id))) {
    for (const stage of route.nodes) {
      assert.ok(stage.steps.length, stage.id);
      for (const step of stage.steps) {
        assert.equal(full.lookup.get(step.id)?.ownerId, stage.id);
        for (const field of ['inputs', 'actions', 'outputs']) assert.ok(step[field].length, step.id + ' ' + field);
        assert.ok(step.source || step.externalSource, step.id);
      }
    }
  }
});

test('all stages can be reached from the start along acyclic paths', () => {
  const {nodes, edges, entry} = byRoute.full;
  const next = new Map(nodes.map(n => [n.id, []]));
  for (const [from, to] of edges) next.get(from).push(to);
  const visited = new Set();
  const ancestors = new Set();
  function visit(id) {
    assert.ok(!ancestors.has(id), 'Cycle through ' + id);
    if (visited.has(id)) return;
    ancestors.add(id);
    for (const target of next.get(id)) visit(target);
    ancestors.delete(id);
    visited.add(id);
  }
  visit(entry);
  assert.equal(visited.size, nodes.length);
});

test('the downloadable map has one working deep link for every stage and operation', () => {
  const links = [...fullMapSvg().matchAll(/<a href="https:\/\/capture-workflow-atlas\.vercel\.app\/#full\/([^"]+)">/g)];
  assert.deepEqual(links.map(link => decodeURIComponent(link[1])).sort(), byRoute.full.items.map(item => item.id).sort());
});
