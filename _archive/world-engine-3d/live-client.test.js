// world-engine-3d smoke test — validates the live bridge mapping and the
// asset manifest without a browser (node --test, stdlib only).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const DIR = __dirname;

function loadClassic(file, sandboxExtra = {}) {
  const src = fs.readFileSync(path.join(DIR, file), 'utf8');
  const sandbox = {
    window: {}, document: undefined, fetch: undefined,
    WebSocket: undefined, URLSearchParams,
    setInterval: () => 0, clearInterval: () => {},
    console, Math, JSON, Object, Array, ...sandboxExtra,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: file });
  return sandbox;
}

test('live-client maps contract snapshots to viewer avatar shape', () => {
  const live = loadClassic('live-client.js');
  assert.equal(typeof live.WE_LIVE.connect, 'function');

  const snap = {
    avatars: {
      'avatar-abc': {
        id: 'avatar-abc', name: 'River', trait: 'curious',
        state: 'idle', emotional_state: 'happy',
        metrics: { focus: 0.7, cognitive_load: 0.2, stress: 0.1,
                   burnout_risk: 0.0, independence: 0.3,
                   fusion_readiness: 0.1, success_rate: 0.6 },
        scenario: null,
        position: { x: 4, y: 12 },
        needs: { energy: 0.7, hunger: 0.6, hygiene: 0.7, fun: 0.5,
                 social: 0.5 },
      },
    },
  };
  const state = live.WE_LIVE.mapSnapshotToWorldState(snap);
  assert.equal(state.avatars.length, 1);
  const av = state.avatars[0];
  assert.equal(av.name, 'River');
  assert.equal(av.px, 4);
  assert.equal(av.py, 12);
  assert.equal(av.focus, 0.7);
  assert.equal(av.cogLoad, 0.2);
  assert.equal(av.flavor, 'attention');
  assert.deepEqual(Object.keys(av.needs).sort(),
                   ['energy', 'fun', 'hunger', 'hygiene', 'social']);
});

test('assets manifest resolves every name to a procedural entry', () => {
  const assets = loadClassic('assets.js');
  for (const name of ['Avery', 'River', 'Some Stranger']) {
    const entry = assets.WE_ASSETS.characterFor(name);
    assert.ok(entry, name);
    assert.equal(entry.model, 'procedural');
  }
});

