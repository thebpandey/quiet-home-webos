(function () {
  'use strict';
  var grid = document.getElementById('tiles');
  var status = document.getElementById('status');
  var error = document.getElementById('error');
  var buttons = [];
  var selected = 0;
  var pending = false;
  var ambient;
  var settingsOverlay = document.getElementById('settings-overlay');
  var zipInput = document.getElementById('weather-zip');
  var settingsMessage = document.getElementById('settings-message');
  var weatherController;
  var settingsSession = 0;
  var safeStorage = {
    getItem: function (key) { try { return window.localStorage.getItem(key); } catch (ignored) { return null; } },
    setItem: function (key, value) { try { window.localStorage.setItem(key, value); } catch (ignored) {} }
  };
  function setMotionVisible(visible) { document.body.classList.toggle('motion-paused', !visible); }
  setMotionVisible(!document.hidden);
  document.addEventListener('visibilitychange', function () { setMotionVisible(!document.hidden); });
  window.addEventListener('pagehide', function () { setMotionVisible(false); });
  window.addEventListener('pageshow', function () { setMotionVisible(!document.hidden); });
  function atmosphereForScene(id) {
    if (id === '22-lapland') return 'aurora';
    if (/-(dolomites|fjord|bamboo|iceland|patagonia|alpine-meadow|milford|rockies|skye|bali|faroe|oregon|fuji|bled|kauai)$/.test(id)) return 'mist';
    if (/-(namib|sonoran|amalfi|cyclades|atlas|bhutan|tuscany|great-ocean-road)$/.test(id)) return 'light';
    return '';
  }
  function weatherTime(value, location) {
    try { return new Intl.DateTimeFormat('en-US', { timeZone: location.timezone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)); }
    catch (ignored) { return new Date(value).toUTCString(); }
  }
  function weatherIcon(weather) {
    var code = weather.weatherCode, day = weather.isDay;
    if (code === 0 || code === 1 || code === 2) {
      if (typeof day !== 'boolean') return 'unknown.svg';
      return (code === 0 ? 'clear-' : 'partly-cloudy-') + (day ? 'day.svg' : 'night.svg');
    }
    if (code === 3) return 'cloudy.svg';
    if ([45, 48].indexOf(code) !== -1) return 'fog.svg';
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].indexOf(code) !== -1) return 'rain.svg';
    if ([71, 73, 75, 77, 85, 86].indexOf(code) !== -1) return 'snow.svg';
    if ([95, 96, 99].indexOf(code) !== -1) return 'storm.svg';
    return 'unknown.svg';
  }
  function drawWeather(state) {
    var location = state.location, weather = state.weather, air = state.air;
    document.getElementById('weather-location').textContent = location ? location.name + (location.region ? ', ' + location.region : '') : 'Set location in Settings';
    var icon = document.getElementById('weather-icon');
    icon.hidden = !weather;
    if (weather) icon.src = 'weather-icons/' + weatherIcon(weather);
    document.getElementById('weather-temperature').textContent = weather ? Math.round(weather.temperatureF) + '\u00b0F' : '';
    document.getElementById('weather-condition').textContent = weather ? weather.condition + ' \u00b7 Humidity ' + Math.round(weather.relativeHumidityPct) + '%' + (state.weatherStale ? ' \u00b7 Saved reading' : '') : (location ? 'Weather unavailable' : '');
    document.getElementById('weather-air').textContent = air ? 'US AQI ' + Math.round(air.usAqi) + (window.LauncherWeather && window.LauncherWeather.describeAqi ? ' \u00b7 ' + window.LauncherWeather.describeAqi(air.usAqi) : '') + (state.airStale ? ' \u00b7 Saved reading' : '') : (location ? 'Air quality unavailable' : '');
    document.getElementById('weather-particles').textContent = air ? 'PM2.5 ' + Math.round(air.pm25MicrogramsM3) + ' \u00b7 PM10 ' + Math.round(air.pm10MicrogramsM3) + ' \u00b5g/m\u00b3' : '';
    var times = [];
    if (weather) times.push('Weather ' + (state.weatherStale ? 'stale \u00b7 ' : '') + 'valid ' + weatherTime(weather.validAtMs, location) + ' \u00b7 updated ' + weatherTime(weather.fetchedAtMs, location));
    if (air) times.push('Air ' + (state.airStale ? 'stale \u00b7 ' : '') + 'valid ' + weatherTime(air.validAtMs, location) + ' \u00b7 updated ' + weatherTime(air.fetchedAtMs, location));
    document.getElementById('weather-times').textContent = times.join(' | ');
  }
  if (window.LauncherWeatherView) {
    weatherController = window.LauncherWeatherView.createController({ engine: window.LauncherWeather, storage: safeStorage,
      now: Date.now, fetch: window.fetch && window.fetch.bind(window), setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window), render: drawWeather });
    weatherController.setVisible(!document.hidden);
    if (!weatherController.getState().location) {
      try {
        var launchParams = window.PalmSystem && window.PalmSystem.launchParams;
        var seed = typeof launchParams === 'string' ? JSON.parse(launchParams) : launchParams;
        if (seed && typeof seed.weatherZip === 'string') weatherController.saveZip(seed.weatherZip).catch(function () {});
      } catch (ignored) {}
    }
    document.addEventListener('visibilitychange', function () { weatherController.setVisible(!document.hidden); });
    window.addEventListener('pagehide', function () { weatherController.setVisible(false); });
    window.addEventListener('pageshow', function () { weatherController.setVisible(!document.hidden); });
  }
  function openSettings() {
    settingsSession++;
    settingsMessage.textContent = '';
    zipInput.value = weatherController && weatherController.getState().location ? weatherController.getState().location.postalCode : '';
    settingsOverlay.hidden = false;
    document.getElementById('settings-tv').focus();
  }
  function closeSettings() {
    settingsSession++;
    settingsOverlay.hidden = true;
    if (weatherController) weatherController.cancel();
    restoreFocus();
  }
  document.getElementById('settings-cancel').addEventListener('click', closeSettings);
  document.getElementById('settings-save').addEventListener('click', function () {
    if (!weatherController) { settingsMessage.textContent = 'Weather is unavailable.'; return; }
    var button = this, session = settingsSession;
    if (document.activeElement === button) document.getElementById('settings-cancel').focus();
    button.disabled = true; settingsMessage.textContent = 'Finding location...';
    weatherController.saveZip(zipInput.value).then(function (location) {
      button.disabled = false;
      if (!settingsOverlay.hidden && session === settingsSession) settingsMessage.textContent = 'Saved: ' + location.name + (location.region ? ', ' + location.region : '');
    }).catch(function (failure) { button.disabled = false; if (!settingsOverlay.hidden && session === settingsSession) settingsMessage.textContent = failure.message || 'Cannot find that ZIP code.'; });
  });
  document.getElementById('settings-tv').addEventListener('click', function () {
    Promise.resolve().then(function () { return window.LauncherPlatform.launch({ appId: 'com.palm.app.settings' }, window); })
      .then(function () { settingsMessage.textContent = 'Opening TV settings...'; })
      .catch(function (failure) { settingsMessage.textContent = 'Cannot open TV settings. ' + (failure.message || ''); });
  });
  document.addEventListener('keydown', function (event) {
    if (settingsOverlay.hidden) return;
    if (event.key === 'Escape' || event.key === 'Back' || event.keyCode === 461) { event.preventDefault(); event.stopPropagation(); closeSettings(); return; }
    if ((event.key === 'Enter' || event.keyCode === 13) && event.target === document.activeElement && document.activeElement.tagName === 'BUTTON' && settingsOverlay.contains(document.activeElement) && !document.activeElement.disabled) {
      event.preventDefault();
      if (!event.repeat) document.activeElement.click();
      return;
    }
    var row = [document.getElementById('settings-save'), document.getElementById('settings-cancel'), document.getElementById('settings-tv')].filter(function (item) { return !item.disabled; });
    var controls = [zipInput].concat(row), active = document.activeElement;
    if (event.key === 'Tab') {
      event.preventDefault();
      var index = controls.indexOf(active), direction = event.shiftKey ? -1 : 1;
      if (index < 0) index = direction > 0 ? -1 : 0;
      controls[(index + direction + controls.length) % controls.length].focus();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (row.length) row[0].focus(); else zipInput.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault(); zipInput.focus();
    } else if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && active !== zipInput && row.length) {
      event.preventDefault();
      var position = row.indexOf(active);
      if (position < 0) position = 0;
      else position = Math.max(0, Math.min(row.length - 1, position + (event.key === 'ArrowRight' ? 1 : -1)));
      row[position].focus();
    }
  }, true);

  var appsOverlay = document.getElementById('apps-overlay');
  var appsList = document.getElementById('apps-list');
  var appsMessage = document.getElementById('apps-message');
  var appsRetry = document.getElementById('apps-retry');
  var appsSession = 0;
  function closeApps() { appsSession++; appsOverlay.hidden = true; restoreFocus(); }
  function loadApps() {
    var session = ++appsSession;
    appsList.textContent = ''; appsRetry.hidden = true; appsMessage.textContent = 'Loading installed apps...';
    document.getElementById('apps-close').focus();
    window.LauncherPlatform.listApps(window).then(function (result) {
      if (session !== appsSession || appsOverlay.hidden) return;
      appsMessage.textContent = result.simulated ? 'Browser simulation' : (result.apps.length ? '' : 'No installed apps found.');
      result.apps.forEach(function (app) {
        var button = document.createElement('button'); button.type = 'button'; button.textContent = app.title + (app.launchable ? '' : ' (not launchable)');
        button.disabled = !app.launchable;
        button.addEventListener('click', function () {
          appsMessage.textContent = 'Opening ' + app.title + '...';
          window.LauncherPlatform.launch({ appId: app.id }, window).then(function (result) {
            if (session !== appsSession) return;
            appsMessage.textContent = result.simulated ? 'Simulated: open ' + app.title + '.' : '';
          }).catch(function () { if (session === appsSession) appsMessage.textContent = 'Cannot open ' + app.title + '.'; });
        });
        appsList.appendChild(button);
      });
      var first = appsList.querySelector('button:not(:disabled)'); if (first) first.focus();
    }).catch(function () {
      if (session !== appsSession || appsOverlay.hidden) return;
      appsMessage.textContent = 'Cannot load installed apps. Check the TV service and try again.';
      appsRetry.hidden = false; appsRetry.focus();
    });
  }
  function openApps() { error.hidden = true; status.textContent = ''; appsOverlay.hidden = false; loadApps(); }
  document.getElementById('apps-close').addEventListener('click', closeApps);
  appsRetry.addEventListener('click', loadApps);
  document.addEventListener('keydown', function (event) {
    if (appsOverlay.hidden) return;
    if (event.key === 'Escape' || event.key === 'Back' || event.keyCode === 461) { event.preventDefault(); event.stopPropagation(); closeApps(); return; }
    var controls = Array.prototype.slice.call(appsOverlay.querySelectorAll('button:not([disabled])')).filter(function (button) { return !button.hidden; });
    var index = controls.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'Tab') {
      event.preventDefault(); event.stopPropagation();
      var direction = event.key === 'ArrowUp' || event.key === 'ArrowLeft' || (event.key === 'Tab' && event.shiftKey) ? -1 : 1;
      controls[(index + direction + controls.length) % controls.length].focus();
    } else if (event.key === 'Enter' || event.keyCode === 13) {
      event.preventDefault(); event.stopPropagation(); if (!event.repeat && document.activeElement.tagName === 'BUTTON') document.activeElement.click();
    }
  }, true);

  document.addEventListener('keydown', function (event) {
    if (settingsOverlay.hidden && appsOverlay.hidden && (event.key === 'Back' || event.keyCode === 461)) {
      event.preventDefault(); event.stopPropagation();
    }
  }, true);

  function showError(message) {
    error.textContent = message;
    error.hidden = false;
    status.textContent = '';
  }

  function restoreFocus() {
    if (!document.hidden && settingsOverlay.hidden && appsOverlay.hidden && buttons[selected]) buttons[selected].focus();
  }

  function columns() {
    return window.getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length;
  }

  function activate(tile) {
    if (tile.action === 'all-apps') { openApps(); return; }
    if (tile.appId === 'com.palm.app.settings') { openSettings(); return; }
    if (pending) return;
    pending = true;
    error.hidden = true;
    status.textContent = 'Opening ' + tile.label + '…';
    grid.setAttribute('aria-busy', 'true');
    buttons.forEach(function (button) { button.setAttribute('aria-disabled', 'true'); });
    // Promise.resolve also turns a synchronous bridge error into a visible error.
    Promise.resolve().then(function () {
      return window.LauncherPlatform.launch(tile, window);
    }).then(function (result) {
      status.textContent = result.simulated
        ? 'Simulated: open ' + tile.label + '. No TV action was sent.'
        : '';
    }).catch(function (failure) {
      showError('Cannot open ' + tile.label + '. ' + (failure.message || 'The TV rejected the request.'));
    }).then(function () {
      pending = false;
      grid.removeAttribute('aria-busy');
      buttons.forEach(function (button) { button.removeAttribute('aria-disabled'); });
      restoreFocus();
    });
  }

  function render(config) {
    document.getElementById('title').textContent = config.title;
    document.title = config.title;
    config.tiles.concat([{ label: 'All Apps', action: 'all-apps' }]).forEach(function (tile, index) {
      var button = document.createElement('button');
      var icon = tile.action === 'all-apps' ? 'icons/all-apps.svg' : {
        'io.strem.tv': 'icons/stremio.svg', netflix: 'icons/netflix.png',
        amazon: 'icons/prime-video.png', 'com.wbd.stream': 'icons/hbo-max.png',
        'youtube.leanback.v4': 'icons/youtube.png', 'com.palm.app.settings': 'icons/settings.svg'
      }[tile.appId] || (tile.kind === 'input' ? 'icons/hdmi.svg' : '');
      var mark = document.createElement(icon ? 'img' : 'span');
      button.type = 'button';
      button.className = 'tile';
      button.setAttribute('aria-label', tile.label);
      button.tabIndex = index === selected ? 0 : -1;
      mark.className = 'tile-logo' + (icon ? '' : ' tile-generic');
      if (icon) {
        mark.src = icon;
        mark.alt = '';
        mark.width = 145;
        mark.height = 90;
      } else {
        for (var cell = 0; cell < 4; cell++) {
          var square = document.createElement('span');
          square.className = 'tile-generic-cell';
          mark.appendChild(square);
        }
      }
      mark.setAttribute('aria-hidden', 'true');
      button.appendChild(mark);
      button.addEventListener('focus', function () {
        buttons.forEach(function (item) { item.tabIndex = -1; });
        selected = index;
        button.tabIndex = 0;
      });
      button.addEventListener('click', function () {
        button.focus();
        activate(tile);
      });
      button.addEventListener('keydown', function (event) {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(event.key) !== -1) {
          event.preventDefault();
          selected = window.LauncherCore.nextIndex(index, event.key, columns(), buttons.length);
          restoreFocus();
        } else if (event.key === 'Enter') {
          event.preventDefault();
          if (!event.repeat) activate(tile);
        }
      });
      buttons.push(button);
      grid.appendChild(button);
    });
    status.textContent = '';
    restoreFocus();
  }

  document.addEventListener('visibilitychange', restoreFocus);
  document.addEventListener('webOSRelaunch', restoreFocus);
  window.addEventListener('focus', restoreFocus);

  function ambientError(message) {
    var notice = document.getElementById('ambient-error');
    notice.textContent = message;
    notice.hidden = false;
  }

  // Start the clock independently of both configuration files. An unavailable
  // wallpaper must never block the apps or hide a launch error.
  if (window.LauncherAmbient) {
    ambient = window.LauncherAmbient.createController({
      now: Date.now, random: Math.random, storage: safeStorage,
      setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window),
      reducedMotion: function () { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; },
      clock: function (value) {
        document.getElementById('time').textContent = value.time;
        document.getElementById('date').textContent = value.date;
      },
      error: ambientError,
      load: function (scene, success, failure) {
        var image = new Image();
        var deadline = window.setTimeout(failure, 8000);
        image.alt = '';
        image.className = 'wallpaper';
        image.onload = function () {
          window.clearTimeout(deadline);
          image.onload = image.onerror = null;
          success(image);
        };
        image.onerror = failure;
        image.src = scene.src;
        return function () {
          window.clearTimeout(deadline);
          image.onload = image.onerror = null;
          image.removeAttribute('src');
          var node = image._sceneFrame || image;
          if (node.parentNode) node.parentNode.removeChild(node);
        };
      },
      show: function (image, scene) {
        var landscape = document.getElementById('landscape');
        var frame = document.createElement('div');
        frame.className = 'wallpaper-frame';
        frame.setAttribute('data-atmosphere', atmosphereForScene(scene.id));
        image._sceneFrame = frame;
        image.className = 'wallpaper';
        frame.appendChild(image);
        landscape.appendChild(frame);
        // Fade the image and its scene-specific effects as one unit.
        void frame.offsetWidth;
        frame.className = 'wallpaper-frame visible';
        document.getElementById('scene-title').textContent = scene.title;
        document.getElementById('scene-location').textContent = scene.location;
        document.getElementById('ambient-error').hidden = true;
      },
      release: function (image) {
        image.removeAttribute('src');
        var node = image._sceneFrame || image;
        if (node.parentNode) node.parentNode.removeChild(node);
      }
    });
    ambient.setVisible(!document.hidden);
    ambient.start();
    document.addEventListener('visibilitychange', function () { ambient.setVisible(!document.hidden); });
    window.addEventListener('pagehide', function () { ambient.setVisible(false); });
    window.addEventListener('pageshow', function () { ambient.setVisible(!document.hidden); });
    var scenery = new XMLHttpRequest();
    scenery.open('GET', 'wallpapers.json', true);
    scenery.timeout = 5000;
    scenery.onload = function () {
      try {
        if (scenery.status !== 200 && !(scenery.status === 0 && window.location.protocol === 'file:')) {
          throw new Error('The wallpaper manifest is missing.');
        }
        ambient.setScenes(JSON.parse(scenery.responseText));
      } catch (failure) { ambientError('Cannot read wallpapers.json. ' + failure.message + ' Apps and inputs are still available.'); }
    };
    scenery.onerror = scenery.ontimeout = function () { ambientError('Cannot load wallpapers.json. Check the app package. Apps and inputs are still available.'); };
    scenery.send();
  } else ambientError('The clock and wallpaper files are missing. Reinstall the complete app package.');

  // Quotes are optional and must not delay the clock, weather or launcher.
  if (window.LauncherQuotes) {
    var quoteController, quoteRequest = null, quotesLoaded = false;
    var quoteText = document.getElementById('quote-text'), shownQuote = null, pendingQuote = null, fadeTimer = null;
    function cancelQuoteFade() {
      if (fadeTimer !== null) window.clearTimeout(fadeTimer);
      fadeTimer = null; pendingQuote = null; quoteText.classList.remove('quote-fading');
    }
    function showQuote(quote) {
      document.getElementById('quote-error').hidden = true;
      if (quote.id === shownQuote) { cancelQuoteFade(); return; }
      if (pendingQuote && pendingQuote.id === quote.id) return;
      var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!shownQuote || reduced) {
        cancelQuoteFade(); quoteText.textContent = quote.text; quoteText.hidden = false; shownQuote = quote.id; return;
      }
      if (fadeTimer !== null) window.clearTimeout(fadeTimer);
      pendingQuote = quote; quoteText.classList.add('quote-fading');
      fadeTimer = window.setTimeout(function () {
        var next = pendingQuote; fadeTimer = null; pendingQuote = null;
        if (!next) return;
        quoteText.textContent = next.text; quoteText.hidden = false; shownQuote = next.id;
        quoteText.classList.remove('quote-fading');
      }, 350);
    }
    function quoteError() {
      document.getElementById('quote-text').hidden = true;
      var notice = document.getElementById('quote-error');
      notice.textContent = 'Quotes unavailable'; notice.hidden = false;
    }
    try {
      quoteController = window.LauncherQuotes.createController({ now: Date.now, random: Math.random, storage: safeStorage,
        setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window),
        show: showQuote });
      function loadQuotes() {
        if (document.hidden || quotesLoaded || quoteRequest) return;
        var request = new XMLHttpRequest(); quoteRequest = request;
        request.open('GET', 'quotes.json', true); request.timeout = 5000;
        request.onload = function () {
          if (quoteRequest !== request) return; quoteRequest = null;
          try {
            if (request.status !== 200 && !(request.status === 0 && window.location.protocol === 'file:')) throw new Error('Missing quotes');
            quoteController.setBank(JSON.parse(request.responseText)); quotesLoaded = true;
            document.getElementById('quote-error').hidden = true;
            quoteController.setVisible(!document.hidden);
          } catch (ignored) { quoteError(); }
        };
        request.onerror = request.ontimeout = function () { if (quoteRequest === request) { quoteRequest = null; quoteError(); } };
        request.send();
      }
      function quotesVisible(visible) {
        if (!visible) { quoteText.classList.add('quote-no-transition'); cancelQuoteFade(); }
        else { void quoteText.offsetWidth; quoteText.classList.remove('quote-no-transition'); }
        quoteController.setVisible(visible);
        if (!visible && quoteRequest) { var old = quoteRequest; quoteRequest = null; old.abort(); }
        if (visible) loadQuotes();
      }
      quotesVisible(!document.hidden);
      document.addEventListener('visibilitychange', function () { quotesVisible(!document.hidden); });
      window.addEventListener('pagehide', function () { quotesVisible(false); });
      window.addEventListener('pageshow', function () { quotesVisible(!document.hidden); });
    } catch (ignored) { quoteError(); }
  } else {
    document.getElementById('quote-error').textContent = 'Quotes unavailable';
    document.getElementById('quote-error').hidden = false;
  }

  if (!window.LauncherCore || !window.LauncherPlatform) {
    showError('The launcher files are missing. Reinstall the complete app package.');
    return;
  }
  document.getElementById('preview').hidden = window.LauncherPlatform.isTV(window);
  var request = new XMLHttpRequest();
  request.open('GET', 'tiles.json', true);
  request.timeout = 5000;
  request.onload = function () {
    if (request.status !== 200 && !(request.status === 0 && window.location.protocol === 'file:')) {
      showError('Cannot load tiles.json (status ' + request.status + '). Check the app package.');
      return;
    }
    try { render(window.LauncherCore.validateConfig(JSON.parse(request.responseText))); }
    catch (failure) { showError('Cannot read tiles.json. ' + failure.message + ' Check the tile configuration.'); }
  };
  request.onerror = function () { showError('Cannot load tiles.json. Check that it is in the app package.'); };
  request.ontimeout = function () { showError('Loading tiles.json timed out. Reopen the launcher.'); };
  request.send();
}());
