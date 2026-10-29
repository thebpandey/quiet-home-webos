(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LauncherCore = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function isObject(value) {
    return value !== null && Object.prototype.toString.call(value) === '[object Object]';
  }

  function checkJSON(value, ancestors) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (!Array.isArray(value) && !isObject(value)) throw new Error('Params must contain only JSON values.');
    if (ancestors.indexOf(value) !== -1) throw new Error('Params must not contain circular references.');
    ancestors.push(value);
    Object.keys(value).forEach(function (key) { checkJSON(value[key], ancestors); });
    ancestors.pop();
  }

  function validateConfig(value) {
    if (!isObject(value) || typeof value.title !== 'string' || !value.title.trim()) {
      throw new Error('Configuration must have a non-empty title.');
    }
    if (!Array.isArray(value.tiles) || value.tiles.length === 0 || value.tiles.length > 24) {
      throw new Error('Configuration must have between 1 and 24 tiles.');
    }
    var ids = new Set();
    var tiles = value.tiles.map(function (tile) {
      if (!isObject(tile) || typeof tile.label !== 'string' || !tile.label.trim()) {
        throw new Error('Each tile must have a non-empty label.');
      }
      if (typeof tile.appId !== 'string' || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(tile.appId)) {
        throw new Error('Each tile must have a valid app identifier.');
      }
      if (ids.has(tile.appId)) throw new Error('Duplicate app identifier: ' + tile.appId);
      ids.add(tile.appId);
      if (tile.kind !== 'app' && tile.kind !== 'input') throw new Error('Tile kind must be app or input.');
      var result = { label: tile.label, appId: tile.appId, kind: tile.kind };
      if (Object.prototype.hasOwnProperty.call(tile, 'params')) {
        if (!isObject(tile.params)) throw new Error('Tile params must be a JSON object.');
        checkJSON(tile.params, []);
        result.params = JSON.parse(JSON.stringify(tile.params));
      }
      return result;
    });
    return { title: value.title, tiles: tiles };
  }

  function nextIndex(index, key, columns, count) {
    if (count <= 0) return -1;
    columns = Math.max(1, Math.floor(columns) || 1);
    index = Math.max(0, Math.min(count - 1, Math.floor(index) || 0));
    var column = index % columns;
    if (key === 'ArrowLeft' && column > 0) return index - 1;
    if (key === 'ArrowRight' && column < columns - 1 && index + 1 < count) return index + 1;
    if (key === 'ArrowUp' && index >= columns) return index - columns;
    if (key === 'ArrowDown' && index - column + columns < count) return Math.min(index + columns, count - 1);
    return index;
  }

  return { validateConfig: validateConfig, nextIndex: nextIndex };
}));
