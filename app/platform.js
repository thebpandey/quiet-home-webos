(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LauncherPlatform = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // The native bridge must stay reachable until its single reply or deadline.
  var pendingBridges = new Set();

  function isTV(environment) {
    var env = environment || {};
    return Boolean(env.webOSServiceBridge || env.PalmServiceBridge || env.PalmSystem ||
      (env.navigator && /web[o0]s/i.test(env.navigator.userAgent || '')));
  }

  function launch(tile, environment, timeoutMs) {
    var env = environment || {};
    if (!isTV(env)) return Promise.resolve({ simulated: true });
    return new Promise(function (resolve, reject) {
      var Bridge = env.webOSServiceBridge || env.PalmServiceBridge;
      if (typeof Bridge !== 'function') {
        reject(new Error('TV service bridge is unavailable.'));
        return;
      }
      var bridge = null;
      var timer = null;
      var complete = false;

      function finish(error, response) {
        if (complete) return;
        complete = true;
        clearTimeout(timer);
        if (bridge) {
          bridge.onservicecallback = null;
          pendingBridges.delete(bridge);
          try { if (typeof bridge.cancel === 'function') bridge.cancel(); } catch (ignored) { /* Completion is final. */ }
          bridge = null;
        }
        if (error) reject(error);
        else resolve({ simulated: false, response: response });
      }

      try {
        bridge = new Bridge();
        pendingBridges.add(bridge);
        bridge.onservicecallback = function (reply) {
          if (complete) return;
          var response;
          try { response = JSON.parse(reply); }
          catch (error) { finish(new Error('TV returned malformed JSON.')); return; }
          if (!response || response.returnValue !== true) {
            finish(new Error(response && response.errorText ? String(response.errorText) : 'TV rejected the launch request.'));
            return;
          }
          finish(null, response);
        };
        timer = setTimeout(function () { finish(new Error('TV launch request timed out.')); }, timeoutMs === undefined ? 5000 : timeoutMs);
        bridge.call('luna://com.webos.applicationManager/launch', JSON.stringify({ id: tile.appId, params: tile.params || {} }));
      } catch (error) {
        finish(error);
      }
    });
  }

  function inventory(response) {
    if (!response || response.returnValue !== true || !Array.isArray(response.apps)) throw new Error('App list unavailable.');
    return response.apps.filter(function (app) {
      return app && typeof app.id === 'string' && /^[A-Za-z0-9_.-]+$/.test(app.id) && typeof app.title === 'string' && app.title.trim();
    }).map(function (app) {
      return { id: app.id, title: app.title, launchable: app.visible !== false && app.launchable !== false };
    }).sort(function (a, b) { return a.title.localeCompare(b.title); });
  }

  function request(env, uri, payload) {
    return new Promise(function (resolve, reject) {
      var Bridge = env.webOSServiceBridge || env.PalmServiceBridge, bridge, timer, done = false;
      function finish(error, value) {
        if (done) return; done = true; clearTimeout(timer);
        if (bridge) { bridge.onservicecallback = null; pendingBridges.delete(bridge); try { if (bridge.cancel) bridge.cancel(); } catch (ignored) {} }
        if (error) reject(error); else resolve(value);
      }
      try {
        if (typeof Bridge !== 'function') throw new Error('Bridge unavailable');
        bridge = new Bridge(); pendingBridges.add(bridge);
        bridge.onservicecallback = function (reply) {
          try { var value = JSON.parse(reply); if (!value || value.returnValue !== true) throw new Error('Request denied'); finish(null, value); }
          catch (ignored) { finish(new Error('Request failed')); }
        };
        timer = setTimeout(function () { finish(new Error('Request timed out')); }, 5000);
        bridge.call(uri, JSON.stringify(payload));
      } catch (ignored) { finish(new Error('Request failed')); }
    });
  }

  function listApps(env) {
    if (!isTV(env)) return Promise.resolve({ simulated: true, apps: [{ id: 'preview.one', title: 'Example app', launchable: true }] });
    return request(env, 'luna://com.webos.applicationManager/listApps', {}).then(inventory).catch(function () {
      return request(env, 'luna://org.webosbrew.hbchannel.service/exec', { command: "luna-send -n 1 -w 5000 luna://com.webos.applicationManager/listApps '{}'" }).then(function (reply) {
        return inventory(JSON.parse(reply.stdoutString));
      });
    }).then(function (apps) { return { simulated: false, apps: apps }; }).catch(function () { throw new Error('Cannot load installed apps. Check the TV service and try again.'); });
  }

  return { isTV: isTV, launch: launch, listApps: listApps };
}));
