(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LauncherAmbient = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var interval = 900000;
  var timeFormat = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hour12: true
  });
  var dateFormat = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  function formatClock(timestamp) {
    return { time: timeFormat.format(timestamp), date: dateFormat.format(timestamp), zone: 'Central Time' };
  }

  function validateManifest(value) {
    if (!Array.isArray(value) || value.length < 1 || value.length > 24) throw new Error('Between 1 and 24 wallpaper scenes are required.');
    var seen = Object.create(null);
    return value.map(function (scene) {
      if (!scene || typeof scene.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(scene.id) || seen[scene.id]) {
        throw new Error('Wallpaper IDs must be unique local names.');
      }
      if (scene.src !== 'wallpapers/' + scene.id + '.jpg') throw new Error('Wallpaper paths must be local JPEG files.');
      if (typeof scene.title !== 'string' || !scene.title.trim() || scene.title.length > 100 ||
          typeof scene.location !== 'string' || !scene.location.trim() || scene.location.length > 100) {
        throw new Error('Each wallpaper needs a short title and location.');
      }
      seen[scene.id] = true;
      return { id: scene.id, title: scene.title.trim(), location: scene.location.trim(), src: scene.src };
    });
  }

  // The host owns image I/O and DOM presentation. This controller owns timing,
  // cancellation, and the lifetime of the current and incoming image only.
  function createController(host) {
    var scenes = host.scenes || [];
    var started = false, visible = true, startTime, lastSlot = -1;
    var timer = null, fadeTimer = null, pending = null, current = null, previous = null;
    var shuffled = typeof host.random === 'function' || Boolean(host.storage);
    var rotation = null, reconcile = true, shownID = null;
    var storageKey = 'quiet-home.wallpaper.v1';

    function shuffle(ids, avoid) {
      var result = ids.slice();
      for (var i = result.length - 1; i > 0; i--) {
        var random = 0;
        try { random = host.random ? host.random() : 0; } catch (ignored) {}
        if (!Number.isFinite(random) || random < 0 || random >= 1) random = 0;
        var j = Math.floor(random * (i + 1));
        var swap = result[i]; result[i] = result[j]; result[j] = swap;
      }
      if (result.length > 1 && result[0] === avoid) {
        var first = result[0]; result[0] = result[1]; result[1] = first;
      }
      return result;
    }

    function validIDs(ids, empty) {
      return Array.isArray(ids) && ids.length <= 24 && (empty || ids.length > 0) && ids.every(function (id, i) {
        return typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(id) && ids.indexOf(id) === i;
      });
    }

    function validRotation(value) {
      return value && value.version === 1 && validIDs(value.ids, false) && validIDs(value.bag, true) &&
        value.ids.indexOf(value.current) !== -1 && value.bag.indexOf(value.current) === -1 &&
        value.bag.every(function (id) { return value.ids.indexOf(id) !== -1; }) &&
        Number.isSafeInteger(value.at) && value.at >= 0 && value.at <= 8640000000000000;
    }

    function nextScene() {
      if (!rotation.bag.length) rotation.bag = shuffle(rotation.ids, rotation.current);
      rotation.current = rotation.bag.shift();
    }

    function prepareRotation(now) {
      if (!reconcile) return;
      var saved = rotation;
      if (!saved && host.storage) {
        try {
          var text = host.storage.getItem(storageKey);
          if (typeof text === 'string' && text.length <= 10000) saved = JSON.parse(text);
        } catch (ignored) {}
      }
      var ids = scenes.map(function (scene) { return scene.id; });
      if (validRotation(saved)) {
        var bag = saved.bag.filter(function (id) { return ids.indexOf(id) !== -1; });
        bag = bag.concat(shuffle(ids.filter(function (id) { return saved.ids.indexOf(id) === -1; })));
        rotation = { version: 1, ids: ids, current: ids.indexOf(saved.current) === -1 ? null : saved.current,
          bag: bag, at: Math.min(saved.at, now) };
      } else rotation = { version: 1, ids: ids, current: null, bag: shuffle(ids), at: Math.min(startTime, now) };
      if (!rotation.current) nextScene();
      reconcile = false;
    }

    function persistRotation() {
      // A failed/cancelled request must never replace the last good saved image.
      if (!host.storage || !rotation || rotation.current !== shownID) return;
      try { host.storage.setItem(storageKey, JSON.stringify(rotation)); } catch (ignored) {}
    }

    function rotationIndex() {
      return scenes.map(function (scene) { return scene.id; }).indexOf(rotation.current);
    }

    function finishFade() {
      if (fadeTimer !== null) host.clearTimeout(fadeTimer);
      fadeTimer = null;
      if (previous) host.release(previous);
      previous = null;
    }

    function cancelLoad() {
      if (!pending) return;
      var cancelled = pending;
      pending = null;
      cancelled.cancel();
    }

    function loadScene(index, attempts, failedIDs) {
      if (!started || !visible || !scenes.length) return;
      finishFade();
      var request = { cancel: function () {} };
      pending = request;
      request.cancel = host.load(scenes[index], function (resource) {
        if (pending !== request || !started || !visible) { host.release(resource); return; }
        pending = null;
        previous = current;
        current = resource;
        host.show(resource, scenes[index]);
        shownID = scenes[index].id;
        if (shuffled) persistRotation();
        if (previous) {
          if (host.reducedMotion && host.reducedMotion()) finishFade();
          // Keep the outgoing frame through the host's 2000 ms opacity fade.
          else fadeTimer = host.setTimeout(finishFade, 2100);
        }
      }, function () {
        if (pending !== request) return;
        pending = null;
        request.cancel();
        var failed = failedIDs || [];
        failed.push(scenes[index].id);
        if (attempts + 1 < scenes.length) {
          if (shuffled) {
            do { nextScene(); } while (failed.indexOf(rotation.current) !== -1);
          }
          loadScene(shuffled ? rotationIndex() : (index + 1) % scenes.length, attempts + 1, failed);
        }
        else host.error('Cannot load the wallpapers. Check the app package. Apps and inputs are still available.');
      });
    }

    function refresh() {
      if (!started || !visible) return;
      if (timer !== null) host.clearTimeout(timer);
      var now = host.now();
      var elapsed = Math.max(0, now - startTime);
      var slot = Math.floor(elapsed / interval);
      host.clock(formatClock(now));
      var changed = slot !== lastSlot;
      var index = scenes.length ? slot % scenes.length : 0;
      if (shuffled && scenes.length) {
        prepareRotation(now);
        if (now < rotation.at) { rotation.at = now; persistRotation(); }
        elapsed = now - rotation.at;
        var steps = Math.floor(elapsed / interval);
        // Bound resume work after long absences. Skipped whole bags were never
        // displayed; only the final bag position and exact slot time matter.
        var advances = Math.min(steps, scenes.length * 2 + steps % scenes.length);
        for (var step = 0; step < advances; step++) nextScene();
        rotation.at += steps * interval;
        changed = steps > 0 || lastSlot === -1;
        index = rotationIndex();
      }
      if (scenes.length && changed) {
        lastSlot = slot;
        cancelLoad();
        loadScene(index, 0);
      }
      timer = host.setTimeout(refresh, Math.min(60000 - (now % 60000), interval - (elapsed % interval)));
    }

    return {
      start: function () {
        if (started) return;
        started = true;
        startTime = host.now();
        refresh();
      },
      setScenes: function (value) {
        var validated = validateManifest(value);
        cancelLoad();
        scenes = validated;
        reconcile = true;
        lastSlot = -1;
        refresh();
      },
      setVisible: function (value) {
        if (visible === value) return;
        visible = value;
        if (!visible) {
          if (timer !== null) host.clearTimeout(timer);
          timer = null;
          if (pending) { cancelLoad(); lastSlot = -1; }
          finishFade();
        } else refresh();
      },
      stop: function () {
        started = false;
        if (timer !== null) host.clearTimeout(timer);
        timer = null;
        cancelLoad();
        finishFade();
        if (current) host.release(current);
        current = null;
        lastSlot = -1;
      }
    };
  }

  return { formatClock: formatClock, validateManifest: validateManifest, createController: createController };
}));
