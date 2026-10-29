(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LauncherQuotes = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var KEY = 'quiet-home.quotes.v1', PERIOD = 300000;
  var categories = ['Motivation', 'Inspiration', 'Leadership', 'Strength', 'Love', 'Healing', 'Meditation', 'Integrity', 'Loyalty', 'Gratitude'];
  function validateBank(bank) {
    if (!Array.isArray(bank) || bank.length !== 300) throw new Error('The quote collection must contain 300 entries.');
    var ids = new Set(), texts = new Set(), counts = {};
    return bank.map(function (item) {
      if (!item || typeof item.id !== 'string' || !/^[a-z0-9-]+$/.test(item.id) || ids.has(item.id) ||
          categories.indexOf(item.category) === -1 || typeof item.text !== 'string' ||
          !item.text.trim() || item.text.length > 150 || /[<>\u0000-\u001f]/.test(item.text) || texts.has(item.text.trim())) {
        throw new Error('The quote collection has an invalid entry.');
      }
      ids.add(item.id); texts.add(item.text.trim());
      counts[item.category] = (counts[item.category] || 0) + 1;
      return { id: item.id, category: item.category, text: item.text.trim() };
    }).map(function (item, index, result) {
      if (index === 0 && categories.some(function (category) { return counts[category] !== 30; })) throw new Error('The quote categories are incomplete.');
      return item;
    });
  }
  function createController(options) {
    var bank = [], byId = Object.create(null), bag = [], current = null, slot = 0, visible = false, timer = null;
    function read() { try { return JSON.parse(options.storage.getItem(KEY)); } catch (ignored) { return null; } }
    function save() { try { options.storage.setItem(KEY, JSON.stringify({ version: 1, current: current, bag: bag, slot: slot })); } catch (ignored) {} }
    function randomIndex(size) {
      var value = options.random();
      if (!Number.isFinite(value) || value < 0 || value >= 1) value = 0;
      return Math.floor(value * size);
    }
    function refill() {
      bag = bank.map(function (item) { return item.id; });
      for (var i = bag.length - 1; i > 0; i--) {
        var j = randomIndex(i + 1), temp = bag[i]; bag[i] = bag[j]; bag[j] = temp;
      }
      if (bag[bag.length - 1] === current) {
        var last = bag.length - 1, swap = bag[0]; bag[0] = bag[last]; bag[last] = swap;
      }
    }
    function advance() { if (!bag.length) refill(); current = bag.pop(); }
    function cancel() { if (timer !== null) { options.clearTimeout(timer); timer = null; } }
    function update() {
      cancel(); if (!visible || !current) return;
      var now = options.now();
      if (now < slot) slot = now;
      var elapsed = Math.floor((now - slot) / PERIOD);
      if (elapsed > 0) {
        var iterations = elapsed > 600 ? 300 + elapsed % 300 : elapsed;
        for (var i = 0; i < iterations; i++) advance();
        slot += elapsed * PERIOD; save();
      }
      options.show(byId[current]);
      timer = options.setTimeout(update, Math.max(1, PERIOD - (now - slot)));
    }
    function validSaved(state, now) {
      if (!state || state.version !== 1 || !byId[state.current] || !Array.isArray(state.bag) || state.bag.length > 299 ||
          !Number.isFinite(state.slot) || state.slot < 0 || state.slot > now) return false;
      var seen = new Set();
      return state.bag.every(function (id) { if (!byId[id] || id === state.current || seen.has(id)) return false; seen.add(id); return true; });
    }
    return {
      setBank: function (input) {
        bank = validateBank(input); byId = Object.create(null);
        bank.forEach(function (item) { byId[item.id] = item; });
        var now = options.now(), saved = read();
        if (validSaved(saved, now)) { current = saved.current; bag = saved.bag.slice(); slot = saved.slot; }
        else { current = null; bag = []; advance(); slot = now; save(); }
        update();
      },
      setVisible: function (value) { visible = Boolean(value); if (visible) update(); else cancel(); }
    };
  }
  return { validateBank: validateBank, createController: createController };
}));
