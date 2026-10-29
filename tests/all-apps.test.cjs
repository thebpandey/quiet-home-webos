const test = require('node:test');
const assert = require('node:assert/strict');
const platform = require('../app/platform.js');
function bridge(replies, calls) {
  return function () { this.call = (uri, payload) => { calls.push([uri, JSON.parse(payload)]); this.onservicecallback(JSON.stringify(replies.shift())); }; this.cancel = () => {}; };
}
test('direct inventory filters data and retains valid uppercase IDs', async () => {
  const calls = [];
  const env = { PalmServiceBridge: bridge([{returnValue:true, apps:[{id:'App_ID',title:'Example',params:{secret:'x'}},{id:'bad/id',title:'Bad'}, {id:'hidden',title:'Hidden',visible:false}]}], calls) };
  const result = await platform.listApps(env);
  assert.deepEqual(result.apps, [{id:'App_ID',title:'Example',launchable:true},{id:'hidden',title:'Hidden',launchable:false}]);
  assert.equal(calls.length, 1);
});
test('denied inventory uses fixed privileged request and parses stdout', async () => {
  const calls = [];
  const env = { PalmServiceBridge: bridge([{returnValue:false},{returnValue:true,stdoutString:JSON.stringify({returnValue:true,apps:[{id:'retail.app',title:'Retail'}]})}], calls) };
  assert.equal((await platform.listApps(env)).apps[0].id, 'retail.app');
  assert.equal(calls[1][0], 'luna://org.webosbrew.hbchannel.service/exec');
  assert.deepEqual(calls[1][1], {command:"luna-send -n 1 -w 5000 luna://com.webos.applicationManager/listApps '{}'"});
});
test('unavailable inventory reports an error and browser data is identified', async () => {
  await assert.rejects(platform.listApps({PalmSystem:{}}), /Cannot load installed apps/);
  assert.equal((await platform.listApps({})).simulated, true);
});
