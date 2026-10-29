'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = '/var/lib/quiet-home-router';
const OWN = { action: 'launch', id: 'com.local.quietlauncher' };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function object(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
function parse(bytes) { const x = JSON.parse(bytes); if (!object(x)) throw Error('expected object'); return x; }
class Frame {
  constructor(onValue, limit = 65536, onStart = () => {}) { this.onValue = onValue; this.onStart = onStart; this.limit = limit; this.buffer = ''; this.depth = 0; this.quoted = false; this.escape = false; }
  push(chunk) {
    for (const ch of chunk) {
      if (!this.buffer && /\s/.test(ch)) continue;
      if (!this.buffer && ch !== '{') throw Error('non-JSON reply');
      if (!this.buffer) this.onStart();
      this.buffer += ch;
      if (Buffer.byteLength(this.buffer) > this.limit) throw Error('oversized reply');
      if (this.quoted) { if (this.escape) this.escape = false; else if (ch === '\\') this.escape = true; else if (ch === '"') this.quoted = false; }
      else if (ch === '"') this.quoted = true;
      else if (ch === '{' || ch === '[') this.depth++;
      else if (ch === '}' || ch === ']') this.depth--;
      if (!this.depth) { const value = parse(this.buffer); this.buffer = ''; this.onValue(value); }
    }
  }
  end() { if (this.buffer) throw Error('truncated reply'); }
}
const keys = { sam: 'foregroundAppInfo', sm: 'foregroundAppInfo', windows: 'windows', focus: 'focusedWindowInfo' };
class Router {
  constructor(opts) { this.opts = opts; this.states = {}; this.incomplete = new Set(); this.armed = null; this.exitPrompt = null; this.promptCandidate = null; this.pending = null; this.last = -Infinity; this.stopped = false; this.boot = opts.boot === true; this.bootUntil = opts.now() + 30000; this.bootInput = typeof opts.bootInput === 'string' && /^com\.webos\.app\.hdmi[1-4]$/.test(opts.bootInput) ? opts.bootInput : null; }
  begin(source) { if (!this.stopped) { this.incomplete.add(source); delete this.states[source]; this.pending = null; } }
  invalidate(source) { delete this.states[source]; this.armed = null; this.exitPrompt = null; this.promptCandidate = null; this.pending = null; this.boot = false; }
  update(source, reply) {
    if (this.stopped) return;
    this.incomplete.delete(source);
    const windows = reply[keys[source]];
    if (this.promptCandidate && this.opts.now() > this.promptCandidate.until) this.promptCandidate = null;
    if (source === 'windows') {
      const promptApp = this.armed || (this.promptCandidate && this.promptCandidate.appId);
      this.exitPrompt = null; this.promptCandidate = null;
      // The observed LG native prompt is exactly the proved app plus one alert.
      if (promptApp && reply.returnValue === true && Array.isArray(windows) && windows.length === 2 && windows.every(w => object(w) && (w.displayId === undefined || w.displayId === 0)) && windows.filter(w => w.appId === promptApp && w.windowType === '_WEBOS_WINDOW_TYPE_CARD').length === 1 && windows.filter(w => w.appId === 'com.webos.app.alert' && w.windowType === '_WEBOS_WINDOW_TYPE_ALERT').length === 1) {
        this.armed = promptApp; this.exitPrompt = promptApp; delete this.states[source]; this.pending = null; return;
      }
    }
    if (source === 'focus' && (this.armed || this.promptCandidate) && reply.returnValue === true && Array.isArray(windows) && windows.length === 1 && object(windows[0]) && windows[0].appId === 'com.webos.systemui.notification' && windows[0].type === 'alert' && (windows[0].displayId === undefined || windows[0].displayId === 0)) {
      if (this.armed && this.exitPrompt !== this.armed) {
        // Focus can precede the matching windows reply. Until it arrives,
        // history is disarmed and this one candidate cannot launch.
        this.promptCandidate = { appId: this.armed, until: this.opts.now() + 4000 };
        this.armed = null; this.exitPrompt = null;
      }
      delete this.states[source]; this.pending = null; return;
    }
    // During boot, valid empty lists acknowledge a reply, not a destination.
    // An empty app-to-Home handoff is not a destination. Retain only history
    // already proved by a complete app view, while blocking launch.
    if ((source === 'focus' || this.boot || this.armed) && reply.returnValue === true && Array.isArray(windows) && !windows.length) {
      delete this.states[source]; this.pending = null; return this.boot;
    }
    // SAM/SM retire the proved app with display -1 before their empty reply.
    // This exact retirement frame blocks; a negative display never launches.
    if (this.armed && (source === 'sam' || source === 'sm') && reply.returnValue === true && Array.isArray(windows) && windows.length > 0 && windows.length <= 32 && windows.every(w => object(w) && w.appId === this.armed && w.windowType === '_WEBOS_WINDOW_TYPE_CARD' && w.displayId === -1)) {
      delete this.states[source]; this.pending = null; return;
    }
    const knownStartupApp = w => w.appId === this.opts.home.appId || w.appId === this.bootInput;
    const startupAlert = w => w.appId === 'com.webos.app.alert' || w.appId === 'com.webos.systemui.notification';
    if (this.boot && reply.returnValue === true && Array.isArray(windows) && windows.length > 0 && windows.length <= 32 && windows.some(w => object(w) && startupAlert(w))) {
      if (windows.some(w => !object(w) || typeof w.appId !== 'string' || (w.displayId !== undefined && w.displayId !== 0) || (!startupAlert(w) && (!knownStartupApp(w) || (source === 'focus' ? w.type !== 'fullscreen' : w.windowType !== '_WEBOS_WINDOW_TYPE_CARD' && w.windowType !== '_WEBOS_WINDOW_TYPE_SPLASH'))))) { this.invalidate(source); return; }
      // The observed LG startup popup pair only blocks; neither is a destination.
      delete this.states[source]; this.pending = null; return true;
    }
    if (reply.returnValue !== true || !Array.isArray(windows) || !windows.length || windows.length > 32 || windows.some(w => !object(w) || typeof w.appId !== 'string' || (source === 'focus' ? w.type !== 'fullscreen' : typeof w.windowType !== 'string') || (w.displayId !== undefined && w.displayId !== 0))) { this.invalidate(source); return; }
    if (this.promptCandidate && windows.some(w => w.appId !== this.promptCandidate.appId || (source === 'focus' ? w.type !== 'fullscreen' : w.windowType !== '_WEBOS_WINDOW_TYPE_CARD'))) this.promptCandidate = null;
    if (this.boot && source !== 'focus' && windows.some(w => knownStartupApp(w) && w.windowType === '_WEBOS_WINDOW_TYPE_SPLASH')) {
      if (windows.some(w => !knownStartupApp(w) || (w.windowType !== '_WEBOS_WINDOW_TYPE_CARD' && w.windowType !== '_WEBOS_WINDOW_TYPE_SPLASH'))) { this.invalidate(source); return; }
      // A known startup splash proves a reply, not a launchable window state.
      delete this.states[source]; this.pending = null; return true;
    }
    this.states[source] = { windows: windows.map(w => ({ appId: w.appId, windowType: source === 'focus' ? '_WEBOS_WINDOW_TYPE_CARD' : w.windowType })), time: this.opts.now() };
    this.evaluate(false);
    return true;
  }
  evaluate(fire) {
    if (!this.opts.enabled || this.stopped) return;
    const now = this.opts.now(), sets = Object.keys(keys).map(k => this.states[k]);
    if (this.promptCandidate && now > this.promptCandidate.until) this.promptCandidate = null;
    if (this.boot && now >= this.bootUntil) { this.boot = false; this.pending = null; }
    const windows = sets.reduce((a, s) => s ? a.concat(s.windows) : a, []), home = this.opts.home;
    const isHome = w => w.appId === home.appId && w.windowType === home.windowType;
    const isApp = w => this.opts.apps.indexOf(w.appId) !== -1 && w.windowType === '_WEBOS_WINDOW_TYPE_CARD';
    const isBootInput = w => this.boot && w.appId === this.bootInput && w.windowType === '_WEBOS_WINDOW_TYPE_CARD';
    if (windows.some(w => !isHome(w) && !isApp(w) && !isBootInput(w))) { this.pending = null; this.armed = null; this.exitPrompt = null; this.promptCandidate = null; this.boot = false; return; }
    // A complete veto always disarms, even if another source is incomplete.
    // Quiet playback retains approved history; stale/missing data cannot launch.
    if (this.incomplete.size || sets.some(x => !x || now - x.time > 4000)) { this.pending = null; return; }
    const apps = windows.filter(isApp).map(w => w.appId);
    if (apps.length) {
      this.boot = false; // An interactive streaming app ends startup intent.
      this.pending = null;
      if (apps.length === windows.length && apps.every(id => id === apps[0])) { if (this.armed !== apps[0]) this.exitPrompt = null; this.promptCandidate = null; this.armed = apps[0]; }
      else if (apps.some(id => id !== this.armed)) { this.armed = null; this.exitPrompt = null; this.promptCandidate = null; }
      return;
    }
    if (!windows.every(isHome) && !windows.every(isBootInput)) { this.pending = null; return; }
    if (!this.armed && !this.boot) return;
    if (this.pending === null) this.pending = now;
    if (fire && now - this.pending >= 750 && now - this.last >= 5000) {
      this.armed = null; this.exitPrompt = null; this.promptCandidate = null; this.pending = null;
      this.boot = false; this.last = now; this.opts.launch();
    }
  }
  tick() { this.evaluate(true); }
  stop() { this.stopped = true; this.states = {}; this.incomplete.clear(); this.armed = null; this.exitPrompt = null; this.promptCandidate = null; this.pending = null; }
}
function regular(file) { const s = fs.lstatSync(file); if (!s.isFile() || s.isSymbolicLink()) throw Error('unsafe file'); return s; }
function read(file) { regular(file); const b = fs.readFileSync(file); if (b.length > 65536) throw Error('oversized config'); return b; }
function atomic(file, bytes) {
  const tmp = file + '.new'; const fd = fs.openSync(tmp, 'wx', 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}
async function replaceLater(file, bytes) {
  const previous = fs.existsSync(file) ? regular(file).mtimeMs : 0;
  if (previous > Date.now() + 2000) throw Error('future config mtime; manual clock review required');
  // Native 1.0 observes seconds, not nanoseconds. Never use a future timestamp.
  while (Math.floor(Date.now() / 1000) <= Math.floor(previous / 1000)) await sleep(100);
  atomic(file, bytes);
  await sleep(1200);
}
async function writeMapping(file, backup) {
  const bytes = fs.existsSync(file) ? read(file) : Buffer.from('{}'); const obj = parse(bytes);
  if (fs.existsSync(backup)) {
    if (JSON.stringify(parse(read(backup))['773']) !== JSON.stringify(obj['773'])) throw Error('backup HOME differs; manual review required');
  } else {
    const fd = fs.openSync(backup, 'wx', 0o600); try { fs.writeFileSync(fd, bytes); } finally { fs.closeSync(fd); }
  }
  obj['773'] = OWN; await replaceLater(file, JSON.stringify(obj) + '\n');
}
async function restoreMapping(file, backup) {
  const original = parse(read(backup)); const currentBytes = read(file), current = parse(currentBytes);
  if (JSON.stringify(current['773']) !== JSON.stringify(OWN)) {
    if (JSON.stringify(current['773']) === JSON.stringify(original['773'])) return;
    throw Error('changed HOME ownership; manual review required');
  }
  if (Object.prototype.hasOwnProperty.call(original, '773')) current['773'] = original['773']; else delete current['773'];
  const unchanged = Object.keys(current).length === Object.keys(original).length && Object.keys(current).every(k => JSON.stringify(current[k]) === JSON.stringify(original[k]));
  await replaceLater(file, unchanged ? read(backup) : JSON.stringify(current) + '\n');
}
function hash(file) { regular(file); return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function verifyAssets(dir, manifest) {
  if (!object(manifest) || !Object.keys(manifest).length) throw Error('empty manifest');
  for (const name of Object.keys(manifest)) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(name) || name === '.' || name === '..' || !/^[a-f0-9]{64}$/.test(manifest[name])) throw Error('unsafe manifest path/hash');
    if (hash(path.join(dir, name)) !== manifest[name]) throw Error('asset hash mismatch: ' + name);
  }
}
function targets(rows) {
  return ['lginput2', 'micomservice'].map(name => {
    const matches = rows.filter(r => r.name === name); if (matches.length !== 1) throw Error('target missing or ambiguous: ' + name);
    const r = matches[0], b = r.elf;
    if (r.exe !== '/usr/sbin/' + name || !Number.isInteger(r.pid) || r.pid < 2 || !/^\d+$/.test(r.start) || b.length < 20 || b.toString('binary', 0, 4) !== '\x7fELF' || b[4] !== 1 || b[5] !== 1 || b.readUInt16LE(18) !== 40) throw Error('target identity/ABI mismatch');
    const hooks = r.maps.split('\n').filter(line => /inputhook/i.test(line));
    if (hooks.some(line => line.trim().split(/\s+/).pop() !== ROOT + '/libinputhookpp.so')) throw Error('foreign hook mapping');
    return Object.assign({}, r, { loaded: hooks.length > 0 });
  });
}
module.exports = { ROOT, Frame, Router, parse, read, regular, atomic, writeMapping, restoreMapping, hash, verifyAssets, targets };
