'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../app/core.js');
const Platform = require('../app/platform.js');

const tile = { label: 'Netflix', appId: 'netflix', kind: 'app' };
const config = () => ({ title: 'My TV', tiles: [{ ...tile }] });

// These cases catch accepting unusable configuration or leaking unknown fields.
test('validation returns only supported fields and keeps ordered app and input tiles', () => {
  assert.deepEqual(Core.validateConfig({ title: 'My TV', ignored: true, tiles: [
    { ...tile, extra: 'drop' },
    { label: 'HDMI 1', appId: 'com.webos.app.hdmi1', kind: 'input', params: { source: 1, nested: [true, null, 'ok'] } }
  ] }), { title: 'My TV', tiles: [tile,
    { label: 'HDMI 1', appId: 'com.webos.app.hdmi1', kind: 'input', params: { source: 1, nested: [true, null, 'ok'] } }
  ] });
});

test('validation rejects invalid title, empty tiles, and more than 24 tiles', () => {
  for (const value of [null, [], { ...config(), title: '  ' }, { ...config(), title: 1 },
    { ...config(), tiles: [] }, { ...config(), tiles: {} },
    { ...config(), tiles: Array.from({ length: 25 }, (_, i) => ({ ...tile, appId: 'app' + i })) }]) {
    assert.throws(() => Core.validateConfig(value), Error);
  }
  assert.equal(Core.validateConfig({ ...config(), tiles: Array.from({ length: 24 }, (_, i) => ({ ...tile, appId: 'app' + i })) }).tiles.length, 24);
});

test('validation rejects missing tile fields, duplicate IDs, and invalid IDs', () => {
  for (const change of [{ label: '' }, { label: ' ' }, { appId: '' }, { appId: 'Some App' },
    { appId: '../netflix' }, { appId: 'com..app' }, { appId: 'APP' }, { kind: 'link' }]) {
    assert.throws(() => Core.validateConfig({ ...config(), tiles: [{ ...tile, ...change }] }), Error);
  }
  assert.throws(() => Core.validateConfig({ ...config(), tiles: [tile, { ...tile, label: 'Again' }] }), /duplicate/i);
});

test('validation rejects params that cannot be represented as a JSON object', () => {
  const cycle = {}; cycle.self = cycle;
  for (const params of [null, [], 'value', 1, new Date(), { value: undefined },
    { value: NaN }, { value: Infinity }, { value: () => 1 }, { value: 1n }, cycle]) {
    assert.throws(() => Core.validateConfig({ ...config(), tiles: [{ ...tile, params }] }), Error);
  }
});

// Literal expected destinations protect row edges and the short last row.
test('arrows stay in their row and clamp down to the short last row', () => {
  for (const [index, key, columns, count, expected] of [
    [0, 'ArrowLeft', 3, 8, 0], [2, 'ArrowRight', 3, 8, 2],
    [3, 'ArrowLeft', 3, 8, 3], [7, 'ArrowRight', 3, 8, 7],
    [1, 'ArrowUp', 3, 8, 1], [7, 'ArrowDown', 3, 8, 7],
    [4, 'ArrowDown', 3, 8, 7], [5, 'ArrowDown', 3, 8, 7],
    [7, 'ArrowUp', 3, 8, 4], [0, 'ArrowRight', 3, 8, 1],
    [4, 'ArrowLeft', 3, 8, 3], [1, 'Enter', 3, 8, 1],
    [2, 'ArrowDown', 4, 5, 4], [0, 'ArrowDown', 1, 3, 1],
    [0, 'ArrowDown', 3, 0, -1]
  ]) assert.equal(Core.nextIndex(index, key, columns, count), expected, `${index} ${key} in ${columns} columns / ${count} tiles`);
});

test('browser scripts expose both public APIs without CommonJS', () => {
  const context = vm.createContext({ setTimeout, clearTimeout });
  for (const name of ['core', 'platform']) vm.runInContext(fs.readFileSync(require.resolve('../app/' + name + '.js'), 'utf8'), context);
  assert.equal(context.LauncherCore.nextIndex(0, 'ArrowRight', 3, 2), 1);
  assert.equal(context.LauncherPlatform.isTV({ PalmSystem: {} }), true);
});

test('TV detection covers both bridges, PalmSystem, and webOS user agents', () => {
  for (const environment of [{ webOSServiceBridge: function () {} }, { PalmServiceBridge: function () {} },
    { PalmSystem: {} }, { navigator: { userAgent: 'Mozilla/5.0 (Web0S; Linux/SmartTV)' } },
    { navigator: { userAgent: 'Mozilla/5.0 (webOS.TV)' } }]) assert.equal(Platform.isTV(environment), true);
  assert.equal(Platform.isTV({ navigator: { userAgent: 'Mozilla/5.0 Chrome/130' } }), false);
  assert.equal(Platform.isTV({}), false);
});

test('desktop launch is explicitly simulated', async () => {
  assert.deepEqual(await Platform.launch(tile, {}), { simulated: true });
});

test('a TV without an available bridge rejects instead of simulating', async () => {
  await assert.rejects(Platform.launch(tile, { PalmSystem: {} }), /bridge/i);
  await assert.rejects(Platform.launch(tile, { navigator: { userAgent: 'webOS' } }), /bridge/i);
});

// Only the unavailable OS bridge is replaced. The real adapter builds requests,
// parses replies, handles deadlines, and owns callback/cancellation cleanup.
function bridgeEnvironment(behavior, usePalm = false) {
  const requests = [];
  const bridges = [];
  class Bridge {
    constructor() { this.cancels = 0; bridges.push(this); }
    call(uri, payload) { requests.push({ uri, payload: JSON.parse(payload) }); behavior(this); }
    cancel() { this.cancels++; }
  }
  return { environment: { [usePalm ? 'PalmServiceBridge' : 'webOSServiceBridge']: Bridge }, requests, bridges };
}

test('a real launch uses Application Manager and waits for successful reply', async () => {
  const fixture = bridgeEnvironment(() => {});
  fixture.environment.PalmServiceBridge = class { constructor() { throw new Error('Wrong bridge'); } };
  const pending = Platform.launch(tile, fixture.environment);
  assert.deepEqual(fixture.requests, [{ uri: 'luna://com.webos.applicationManager/launch', payload: { id: 'netflix', params: {} } }]);
  const response = { returnValue: true, appId: 'netflix', processId: '1234' };
  fixture.bridges[0].onservicecallback(JSON.stringify(response));
  assert.deepEqual(await pending, { simulated: false, response });
  assert.equal(fixture.bridges[0].cancels, 1);
  assert.equal(fixture.bridges[0].onservicecallback, null);
});

test('Palm bridge fallback passes configured input params', async () => {
  const fixture = bridgeEnvironment(bridge => bridge.onservicecallback('{"returnValue":true}'), true);
  const result = await Platform.launch({ label: 'HDMI', appId: 'com.webos.app.hdmi1', kind: 'input', params: { source: 1 } }, fixture.environment);
  assert.equal(result.simulated, false);
  assert.deepEqual(fixture.requests[0], { uri: 'luna://com.webos.applicationManager/launch', payload: { id: 'com.webos.app.hdmi1', params: { source: 1 } } });
});

test('a denied launch reports the platform error and releases its bridge', async () => {
  const fixture = bridgeEnvironment(bridge => bridge.onservicecallback('{"returnValue":false,"errorCode":-1,"errorText":"Permission denied"}'));
  await assert.rejects(Platform.launch(tile, fixture.environment), /Permission denied/);
  assert.equal(fixture.bridges[0].cancels, 1);
  assert.equal(fixture.bridges[0].onservicecallback, null);
});

test('malformed and non-success replies reject', async () => {
  for (const reply of ['not json', 'null', '{}', '{"returnValue":"true"}']) {
    const fixture = bridgeEnvironment(bridge => bridge.onservicecallback(reply));
    await assert.rejects(Platform.launch(tile, fixture.environment), Error);
    assert.equal(fixture.bridges[0].cancels, 1);
    assert.equal(fixture.bridges[0].onservicecallback, null);
  }
});

test('bridge constructor and call exceptions reject the launch', async () => {
  await assert.rejects(Platform.launch(tile, { webOSServiceBridge: class { constructor() { throw new Error('Constructor failed'); } } }), /Constructor failed/);
  const fixture = bridgeEnvironment(() => { throw new Error('Call failed'); });
  await assert.rejects(Platform.launch(tile, fixture.environment), /Call failed/);
  assert.equal(fixture.bridges[0].cancels, 1);
  assert.equal(fixture.bridges[0].onservicecallback, null);
});

test('a silent bridge times out and cannot complete again through an old callback', async () => {
  const fixture = bridgeEnvironment(() => {});
  const pending = Platform.launch(tile, fixture.environment, 10);
  const callback = fixture.bridges[0].onservicecallback;
  await assert.rejects(pending, /timed out|timeout/i);
  callback('{"returnValue":true}');
  assert.equal(fixture.bridges[0].cancels, 1);
  assert.equal(fixture.bridges[0].onservicecallback, null);
});

test('duplicate callbacks and cancellation errors do not change the first result', async () => {
  const fixture = bridgeEnvironment(bridge => {
    const callback = bridge.onservicecallback;
    bridge.cancel = () => { throw new Error('Cancel failed'); };
    callback('{"returnValue":true}');
    callback('{"returnValue":false}');
  });
  assert.deepEqual(await Platform.launch(tile, fixture.environment), { simulated: false, response: { returnValue: true } });
});

test('webOS delivers physical Back to the launcher', () => {
  const info = JSON.parse(fs.readFileSync(require.resolve('../app/appinfo.json'), 'utf8'));
  assert.equal(info.disableBackHistoryAPI, true);
});
