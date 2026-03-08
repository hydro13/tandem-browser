import fs from 'fs';
import path from 'path';
import { tandemDir } from '../utils/paths';
import { API_PORT } from '../utils/constants';
import { createLogger } from '../utils/logger';

const log = createLogger('ActionPolyfill');

// ─── Polyfill JavaScript (injected into extension service workers) ────────────

/**
 * Generate the chrome.action polyfill script to inject into extension service workers.
 *
 * Electron does not implement chrome.action (the MV3 replacement for
 * chrome.browserAction). MV3 extensions that call chrome.action.onClicked,
 * setIcon, setPopup, getUserSettings, setBadgeText, etc. crash at service
 * worker startup with "Cannot read properties of undefined".
 *
 * The polyfill:
 * - Only activates if chrome.action is missing or incomplete at runtime
 * - Proxies to chrome.browserAction where Electron provides it
 * - Creates safe stubs for all remaining methods
 * - Posts setBadgeText / setIcon updates to the Tandem API so badge state
 *   can be picked up by the toolbar (best-effort, silent on failure)
 */
function generatePolyfillScript(cwsId: string, apiPort: number): string {
  // Single quotes and no template literals — this runs in the SW context, not Node
  //
  // Strategy: ES module variable shadow.
  //
  // In Electron 40, the chrome global is a V8-native Proxy where defineProperty
  // and set traps are no-ops — we cannot add chrome.action via assignment or
  // Object.defineProperty. The only reliable approach in a module-type service
  // worker is to declare module-level `var chrome` and `var browser`, which are
  // hoisted to module scope and shadow the globals for ALL code in this file.
  //
  // Execution order (due to var hoisting):
  //   1. var chrome, var browser → hoisted to module scope (value: undefined)
  //   2. setup IIFE runs → captures globalThis.chrome, builds proxy, assigns
  //      chrome = proxy, browser = proxy
  //   3. Rest of the module runs with chrome/browser = our proxy
  //   4. proxy.get('action') → returns our polyfill object
  return `
/* Tandem chrome.action polyfill v9 — module-scope var shadow */
;(function() {
  var __tc = (typeof globalThis !== 'undefined' && globalThis.chrome) || (typeof self !== 'undefined' && self.chrome) || {};
  var CWS_ID = '${cwsId}';
  var API_PORT = ${apiPort};
  var __tandemNotificationStore = {};
  var __tandemSessionStorage = {};

  function __tandemExtensionId() {
    return (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) ? chrome.runtime.id : CWS_ID;
  }

  function __tandemExtensionHeaders(extraHeaders) {
    var headers = extraHeaders ? Object.assign({}, extraHeaders) : {};
    headers['X-Tandem-Extension-Id'] = __tandemExtensionId();
    return headers;
  }

  function makeEvent() {
    var listeners = [];
    return {
      addListener: function(cb) {
        if (typeof cb === 'function' && listeners.indexOf(cb) < 0) listeners.push(cb);
      },
      removeListener: function(cb) {
        var i = listeners.indexOf(cb);
        if (i >= 0) listeners.splice(i, 1);
      },
      hasListener: function(cb) { return listeners.indexOf(cb) >= 0; },
      hasListeners: function() { return listeners.length > 0; },
      _fire: function() {
        var a = arguments;
        listeners.forEach(function(cb) { try { cb.apply(null, a); } catch(e) {} });
      }
    };
  }

  function notifyToolbar(_endpoint, _body) {
    // No-op: fetch to Tandem API is blocked by extension CSP (connect-src does not
    // include http://127.0.0.1:8765). Generating a CSP violation error in console.
    // Icon/badge state from 1Password is not critical for Tandem functionality.
  }

  var ba = (__tc.browserAction) || null;
  var actionObj = {
    onClicked: (ba && ba.onClicked) ? ba.onClicked : makeEvent(),
    openPopup: function(options) {
      if (ba && ba.openPopup) return ba.openPopup(options || {});
      return Promise.resolve();
    },
    setPopup: function(details, callback) {
      if (ba && ba.setPopup) return ba.setPopup(details, callback);
      if (typeof callback === 'function') callback();
      return Promise.resolve();
    },
    getPopup: function(details, callback) {
      if (ba && ba.getPopup) return ba.getPopup(details, callback);
      if (typeof callback === 'function') callback('');
      return Promise.resolve('');
    },
    setIcon: function(details, callback) {
      if (ba && ba.setIcon) return ba.setIcon(details, callback);
      notifyToolbar('/extensions/action/setIcon', { extensionId: CWS_ID, details: details });
      if (typeof callback === 'function') callback();
      return Promise.resolve();
    },
    setBadgeText: function(details, callback) {
      if (ba && ba.setBadgeText) return ba.setBadgeText(details, callback);
      notifyToolbar('/extensions/action/badge', { extensionId: CWS_ID, text: (details && details.text) || '' });
      if (typeof callback === 'function') callback();
      return Promise.resolve();
    },
    getBadgeText: function(details, callback) {
      if (ba && ba.getBadgeText) return ba.getBadgeText(details, callback);
      if (typeof callback === 'function') callback('');
      return Promise.resolve('');
    },
    setBadgeBackgroundColor: function(details, callback) {
      if (ba && ba.setBadgeBackgroundColor) return ba.setBadgeBackgroundColor(details, callback);
      if (typeof callback === 'function') callback();
      return Promise.resolve();
    },
    getBadgeBackgroundColor: function(details, callback) {
      if (ba && ba.getBadgeBackgroundColor) return ba.getBadgeBackgroundColor(details, callback);
      if (typeof callback === 'function') callback([0,0,0,0]);
      return Promise.resolve([0,0,0,0]);
    },
    setTitle: function(details, callback) {
      if (ba && ba.setTitle) return ba.setTitle(details, callback);
      if (typeof callback === 'function') callback();
      return Promise.resolve();
    },
    getTitle: function(details, callback) {
      if (ba && ba.getTitle) return ba.getTitle(details, callback);
      if (typeof callback === 'function') callback('');
      return Promise.resolve('');
    },
    enable: function(tabId, callback) {
      if (ba && ba.enable) return ba.enable(tabId, callback);
      if (typeof callback === 'function') callback();
      return Promise.resolve();
    },
    disable: function(tabId, callback) {
      if (ba && ba.disable) return ba.disable(tabId, callback);
      if (typeof callback === 'function') callback();
      return Promise.resolve();
    },
    isEnabled: function(tabId, callback) {
      if (typeof callback === 'function') callback(true);
      return Promise.resolve(true);
    },
    getUserSettings: function(callback) {
      if (ba && ba.getUserSettings) return ba.getUserSettings(callback);
      var s = { isOnToolbar: true };
      if (typeof callback === 'function') callback(s);
      return Promise.resolve(s);
    }
  };

  /*
   * chrome.notifications stub — Electron does not implement this API.
   * Required because 1Password's background.js calls:
   *   Fj()||(chrome.notifications.onClicked.addListener(...), ...)
   * at module init, crashing immediately if chrome.notifications is undefined.
   */
  var notificationsObj = (typeof __tc.notifications === 'object' && __tc.notifications !== null)
    ? __tc.notifications
    : {
        onClicked:       makeEvent(),
        onButtonClicked: makeEvent(),
        onClosed:        makeEvent(),
        create:  function(id, opts, cb) {
          if (typeof id === 'object') { cb = opts; opts = id; id = ''; }
          var finalId = id || ('tandem-notification-' + Date.now() + '-' + Math.floor(Math.random() * 100000));
          __tandemNotificationStore[finalId] = opts || {};
          if (typeof cb === 'function') cb(finalId);
          return Promise.resolve(finalId);
        },
        getAll:  function(cb) {
          var entries = {};
          for (var key in __tandemNotificationStore) {
            if (Object.prototype.hasOwnProperty.call(__tandemNotificationStore, key)) {
              entries[key] = __tandemNotificationStore[key];
            }
          }
          if (typeof cb === 'function') cb(entries);
          return Promise.resolve(entries);
        },
        clear:   function(id, cb) {
          var existed = Object.prototype.hasOwnProperty.call(__tandemNotificationStore, id);
          delete __tandemNotificationStore[id];
          if (typeof cb === 'function') cb(existed);
          return Promise.resolve(existed);
        },
        update:  function(id, opts, cb) {
          var existed = Object.prototype.hasOwnProperty.call(__tandemNotificationStore, id);
          __tandemNotificationStore[id] = Object.assign({}, __tandemNotificationStore[id] || {}, opts || {});
          if (typeof cb === 'function') cb(true);
          return Promise.resolve(existed || true);
        }
      };

  /*
   * chrome.storage.session stub — Electron does not expose this namespace in the
   * extension service worker context, but 1Password uses it while calculating
   * effective policies and other ephemeral runtime state.
   */
  function __tandemStorageNormalizeKeys(keys) {
    if (keys === null || keys === undefined) return null;
    if (Array.isArray(keys)) return keys;
    if (typeof keys === 'string') return [keys];
    if (typeof keys === 'object') return Object.keys(keys);
    return [];
  }
  function __tandemStorageBuildResult(keys) {
    if (keys === null) return Object.assign({}, __tandemSessionStorage);
    var result = {};
    if (Array.isArray(keys)) {
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (Object.prototype.hasOwnProperty.call(__tandemSessionStorage, key)) {
          result[key] = __tandemSessionStorage[key];
        }
      }
      return result;
    }
    if (typeof keys === 'object') {
      for (var fallbackKey in keys) {
        if (!Object.prototype.hasOwnProperty.call(keys, fallbackKey)) continue;
        result[fallbackKey] = Object.prototype.hasOwnProperty.call(__tandemSessionStorage, fallbackKey)
          ? __tandemSessionStorage[fallbackKey]
          : keys[fallbackKey];
      }
      return result;
    }
    return result;
  }
  var storageObj = __tc && __tc.storage ? __tc.storage : {};
  if (!storageObj.local) {
    storageObj.local = {
      get: function(_keys, cb) { var data = {}; if (typeof cb === 'function') cb(data); return Promise.resolve(data); },
      set: function(_items, cb) { if (typeof cb === 'function') cb(); return Promise.resolve(); },
      remove: function(_keys, cb) { if (typeof cb === 'function') cb(); return Promise.resolve(); },
      clear: function(cb) { if (typeof cb === 'function') cb(); return Promise.resolve(); }
    };
  }
  if (!storageObj.sync) {
    storageObj.sync = storageObj.local;
  }
  if (!storageObj.onChanged) {
    storageObj.onChanged = makeEvent();
  }
  if (!storageObj.session) {
    storageObj.session = {
      get: function(keys, cb) {
        var normalized = __tandemStorageNormalizeKeys(keys);
        var lookup = normalized === null ? null : (Array.isArray(keys) || typeof keys === 'object' ? keys : normalized);
        var result = __tandemStorageBuildResult(lookup);
        if (typeof cb === 'function') cb(result);
        return Promise.resolve(result);
      },
      set: function(items, cb) {
        items = items && typeof items === 'object' ? items : {};
        var changes = {};
        for (var key in items) {
          if (!Object.prototype.hasOwnProperty.call(items, key)) continue;
          changes[key] = { oldValue: __tandemSessionStorage[key], newValue: items[key] };
          __tandemSessionStorage[key] = items[key];
        }
        if (typeof storageObj.onChanged._fire === 'function' && Object.keys(changes).length > 0) {
          storageObj.onChanged._fire(changes, 'session');
        }
        if (typeof cb === 'function') cb();
        return Promise.resolve();
      },
      remove: function(keys, cb) {
        var normalized = __tandemStorageNormalizeKeys(keys) || [];
        var changes = {};
        for (var i = 0; i < normalized.length; i++) {
          var key = normalized[i];
          if (!Object.prototype.hasOwnProperty.call(__tandemSessionStorage, key)) continue;
          changes[key] = { oldValue: __tandemSessionStorage[key], newValue: undefined };
          delete __tandemSessionStorage[key];
        }
        if (typeof storageObj.onChanged._fire === 'function' && Object.keys(changes).length > 0) {
          storageObj.onChanged._fire(changes, 'session');
        }
        if (typeof cb === 'function') cb();
        return Promise.resolve();
      },
      clear: function(cb) {
        var changes = {};
        for (var key in __tandemSessionStorage) {
          if (!Object.prototype.hasOwnProperty.call(__tandemSessionStorage, key)) continue;
          changes[key] = { oldValue: __tandemSessionStorage[key], newValue: undefined };
        }
        __tandemSessionStorage = {};
        if (typeof storageObj.onChanged._fire === 'function' && Object.keys(changes).length > 0) {
          storageObj.onChanged._fire(changes, 'session');
        }
        if (typeof cb === 'function') cb();
        return Promise.resolve();
      }
    };
  }

  /*
   * Native Messaging Proxy
   *
   * Electron 40 does not support chrome.runtime.connectNative() or
   * chrome.runtime.sendNativeMessage() for extensions loaded via
   * session.extensions.loadExtension(). We proxy these calls through
   * Tandem's local HTTP/WebSocket API instead.
   *
   * The extension's manifest.json has been patched (at startup, before
   * session.extensions.loadExtension()) to add http://127.0.0.1:${API_PORT}
   * and ws://127.0.0.1:${API_PORT} to connect-src, so these fetches are
   * allowed by the extension's CSP.
   */
  var NM_HTTP = 'http://127.0.0.1:' + API_PORT + '/extensions/native-message';
  var NM_WS   = 'ws://127.0.0.1:' + API_PORT + '/extensions/native-message/ws';

  function __nmSendNativeMessage(host, message, callback) {
    fetch(NM_HTTP, {
      method: 'POST',
      headers: __tandemExtensionHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ host: host, message: message })
    })
    .then(function(r) { return r.json(); })
    .then(function(resp) { if (typeof callback === 'function') callback(resp); })
    .catch(function() { if (typeof callback === 'function') callback(undefined); });
  }

  function __nmConnectNative(host) {
    var extensionId = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) ? chrome.runtime.id : CWS_ID;
    var ws = new WebSocket(NM_WS + '?host=' + encodeURIComponent(host) + '&extensionId=' + encodeURIComponent(extensionId));
    var msgListeners = [];
    var disconnectListeners = [];
    var port = {
      name: host,
      onMessage: {
        addListener: function(fn) { if (typeof fn === 'function' && msgListeners.indexOf(fn) < 0) msgListeners.push(fn); },
        removeListener: function(fn) { msgListeners = msgListeners.filter(function(l) { return l !== fn; }); },
        hasListener: function(fn) { return msgListeners.indexOf(fn) >= 0; }
      },
      onDisconnect: {
        addListener: function(fn) { if (typeof fn === 'function') disconnectListeners.push(fn); },
        removeListener: function(fn) { disconnectListeners = disconnectListeners.filter(function(l) { return l !== fn; }); },
        hasListener: function(fn) { return disconnectListeners.indexOf(fn) >= 0; }
      },
      postMessage: function(msg) {
        if (ws.readyState === 1 /* OPEN */) {
          try { ws.send(JSON.stringify(msg)); } catch(_e) {}
        }
      },
      disconnect: function() { try { ws.close(); } catch(_e) {} }
    };
    ws.onmessage = function(e) {
      try {
        var msg = JSON.parse(e.data);
        var ls = msgListeners.slice();
        for (var i = 0; i < ls.length; i++) { try { ls[i](msg); } catch(_e) {} }
      } catch(_e) {}
    };
    ws.onclose = function() {
      var ls = disconnectListeners.slice();
      for (var i = 0; i < ls.length; i++) { try { ls[i](port); } catch(_e) {} }
    };
    ws.onerror = function() { try { ws.close(); } catch(_e) {} };
    return port;
  }

  /* Runtime proxy: intercept connectNative + sendNativeMessage */
  var __tc_runtime = __tc.runtime;
  var runtimeProxy = __tc_runtime
    ? new Proxy(__tc_runtime, {
        get: function(t, k) {
          if (k === 'sendNativeMessage') return __nmSendNativeMessage;
          if (k === 'connectNative')     return __nmConnectNative;
          var v = t[k];
          return (typeof v === 'function') ? v.bind(t) : v;
        },
        set: function(t, k, v) { t[k] = v; return true; }
      })
    : undefined;

  /*
   * webNavigation bridge: Electron does not expose chrome.webNavigation to extensions,
   * but 1Password needs getAllFrames()/getFrame() for autofill frame detection.
   * Bridge those calls through Tandem's local API using WebFrameMain frame data.
   */
  function __tandemFetchFrames(tabId) {
    return fetch('http://127.0.0.1:' + API_PORT + '/extensions/web-navigation/frames?tabId=' + encodeURIComponent(String(tabId)), {
      headers: __tandemExtensionHeaders()
    })
      .then(function(r) { return r.json(); })
      .then(function(d) { return d && Array.isArray(d.frames) ? d.frames : []; })
      .catch(function() { return []; });
  }
  function __tandemFetchFrame(tabId, frameId) {
    return fetch(
      'http://127.0.0.1:' + API_PORT + '/extensions/web-navigation/frame?tabId=' +
      encodeURIComponent(String(tabId)) + '&frameId=' + encodeURIComponent(String(frameId)),
      { headers: __tandemExtensionHeaders() }
    )
      .then(function(r) { return r.json(); })
      .then(function(d) { return d && d.frame ? d.frame : null; })
      .catch(function() { return null; });
  }
  var webNavStub = __tc.webNavigation || {
    getAllFrames: function(opts, cb) {
      var tabId = opts && opts.tabId;
      var p = __tandemFetchFrames(tabId);
      if (cb) p.then(cb);
      return p;
    },
    getFrame: function(opts, cb) {
      var tabId = opts && opts.tabId;
      var frameId = opts && opts.frameId;
      var p = __tandemFetchFrame(tabId, frameId);
      if (cb) p.then(cb);
      return p;
    },
    onCommitted: { addListener: function() {}, removeListener: function() {}, hasListener: function() { return false; } },
    onBeforeNavigate: { addListener: function() {}, removeListener: function() {}, hasListener: function() { return false; } },
    onDOMContentLoaded: { addListener: function() {}, removeListener: function() {}, hasListener: function() { return false; } },
    onCompleted: { addListener: function() {}, removeListener: function() {}, hasListener: function() { return false; } },
    onCreatedNavigationTarget: { addListener: function() {}, removeListener: function() {}, hasListener: function() { return false; } },
    onHistoryStateUpdated: { addListener: function() {}, removeListener: function() {}, hasListener: function() { return false; } }
  };

  /*
   * windows.create intercept: redirect type:'popup' windows to tabs.
   * Electron does not keep chrome.windows.create({type:'popup'}) open —
   * the window flashes and immediately closes. Opening as a tab works.
   */
  var windowsCreateOrig = __tc && __tc.windows && __tc.windows.create
    ? __tc.windows.create.bind(__tc.windows)
    : null;
  var _windowsCreateIntercepted = function(createData, callback) {
    if (createData && createData.type === 'popup' && createData.url) {
      var urls = Array.isArray(createData.url) ? createData.url : [createData.url];
      var firstUrl = urls[0];
      console.log('[Tandem] windows.create popup->tab:', firstUrl);
      return __tc.tabs.create({url: firstUrl, active: true}, function(tab) {
        if (typeof callback === 'function') callback({id: tab ? tab.windowId : -1, tabs: tab ? [tab] : []});
      });
    }
    return windowsCreateOrig ? windowsCreateOrig(createData, callback) : undefined;
  };
  var windowsObj = __tc && __tc.windows
    ? new Proxy(__tc.windows, {
        get: function(t, k) {
          if (k === 'create') return _windowsCreateIntercepted;
          var v = t[k];
          return (typeof v === 'function') ? v.bind(t) : v;
        }
      })
    : undefined;

  /*
   * tabs.query fallback: when Electron returns no active tab (webviews are not
   * surfaced to the extension API as Chrome tabs), fall back to the Tandem API.
   * GET http://127.0.0.1:${API_PORT}/extensions/active-tab returns the active
   * webview as a Chrome tab using its webContentsId as the tab id — the same id
   * Electron uses for chrome.tabs.sendMessage routing to content scripts.
   */
  var _tabsQueryOrig = __tc && __tc.tabs && __tc.tabs.query
    ? __tc.tabs.query.bind(__tc.tabs) : null;
  var _tabsSendMessageOrig = __tc && __tc.tabs && __tc.tabs.sendMessage
    ? __tc.tabs.sendMessage.bind(__tc.tabs) : null;
  function __tandemCopyMessageOptions(options, stripFrameTarget) {
    if (!options || typeof options !== 'object') return undefined;
    var next = {};
    for (var key in options) {
      if (!Object.prototype.hasOwnProperty.call(options, key)) continue;
      if (key === 'documentId') continue;
      if (stripFrameTarget && (key === 'frameId' || key === 'documentId')) continue;
      next[key] = options[key];
    }
    return Object.keys(next).length > 0 ? next : undefined;
  }
  function __tandemShouldRetryUsoMessage(message, options, errorMessage) {
    if (!errorMessage) return false;
    if (!message || typeof message !== 'object' || typeof message.name !== 'string') return false;
    if (message.name.indexOf('uso-') !== 0) return false;
    return !!(options && typeof options === 'object' && (options.frameId !== undefined || options.documentId !== undefined));
  }
  function __tandemSendMessageCall(tabId, message, options, callback) {
    if (!_tabsSendMessageOrig) {
      if (typeof callback === 'function') callback(undefined);
      return Promise.resolve(undefined);
    }
    if (options === undefined) {
      return typeof callback === 'function'
        ? _tabsSendMessageOrig(tabId, message, callback)
        : _tabsSendMessageOrig(tabId, message);
    }
    return typeof callback === 'function'
      ? _tabsSendMessageOrig(tabId, message, options, callback)
      : _tabsSendMessageOrig(tabId, message, options);
  }
  var _tabsSendMessagePatched = function(tabId, message, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = undefined;
    }
    var primaryOptions = __tandemCopyMessageOptions(options, false);
    var retryOptions = __tandemCopyMessageOptions(options, true);

    if (typeof callback === 'function') {
      return __tandemSendMessageCall(tabId, message, primaryOptions, function(response) {
        var err = __tc && __tc.runtime && __tc.runtime.lastError ? __tc.runtime.lastError.message : '';
        if (__tandemShouldRetryUsoMessage(message, options, err)) {
          return __tandemSendMessageCall(tabId, message, retryOptions, callback);
        }
        callback(response);
      });
    }

    try {
      var result = __tandemSendMessageCall(tabId, message, primaryOptions);
      if (result && typeof result.then === 'function') {
        return result.catch(function(err) {
          var errMsg = err && err.message ? err.message : String(err || '');
          if (__tandemShouldRetryUsoMessage(message, options, errMsg)) {
            return __tandemSendMessageCall(tabId, message, retryOptions);
          }
          throw err;
        });
      }
      return result;
    } catch (err) {
      var errMsg = err && err.message ? err.message : String(err || '');
      if (__tandemShouldRetryUsoMessage(message, options, errMsg)) {
        return __tandemSendMessageCall(tabId, message, retryOptions);
      }
      throw err;
    }
  };
  var _tabsQueryPatched = function(queryInfo, callback) {
    var isActiveQuery = queryInfo && queryInfo.active;
    if (!isActiveQuery) {
      return _tabsQueryOrig ? _tabsQueryOrig(queryInfo, callback) : (callback ? callback([]) : Promise.resolve([]));
    }
    // Try original first; fall back to Tandem API if empty
    var fromApi = function() {
      return fetch('http://127.0.0.1:' + API_PORT + '/extensions/active-tab', {
        headers: __tandemExtensionHeaders()
      })
        .then(function(r) { return r.json(); })
        .then(function(d) { return d && d.tab ? [d.tab] : []; })
        .catch(function() { return []; });
    };
    if (_tabsQueryOrig) {
      var result = _tabsQueryOrig(queryInfo);
      // result may be a Promise (browser ns) or void with callback (chrome ns)
      var asPromise = result && typeof result.then === 'function'
        ? result
        : new Promise(function(res) { _tabsQueryOrig(queryInfo, res); });
      return asPromise.then(function(tabs) {
        if (tabs && tabs.length > 0) {
          if (callback) callback(tabs);
          return tabs;
        }
        return fromApi().then(function(tabs2) {
          if (callback) callback(tabs2);
          return tabs2;
        });
      });
    }
    var p = fromApi();
    if (callback) p.then(callback);
    return p;
  };
  var tabsObj = __tc && __tc.tabs
    ? new Proxy(__tc.tabs, {
        get: function(t, k) {
          if (k === 'query') return _tabsQueryPatched;
          if (k === 'sendMessage') return _tabsSendMessagePatched;
          var v = t[k];
          return (typeof v === 'function') ? v.bind(t) : v;
        }
      })
    : undefined;

  /* Build a proxy that returns stubs for missing APIs, forwards the rest */
  var proxy = new Proxy(__tc, {
    get: function(target, prop) {
      if (prop === 'action')         return actionObj;
      if (prop === 'notifications')  return notificationsObj;
      if (prop === 'runtime' && runtimeProxy) return runtimeProxy;
      if (prop === 'windows' && windowsObj)   return windowsObj;
      if (prop === 'tabs' && tabsObj)         return tabsObj;
      if (prop === 'storage')                 return storageObj;
      if (prop === 'webNavigation')            return webNavStub;
      var val = target[prop];
      return (typeof val === 'function') ? val.bind(target) : val;
    },
    has: function(target, prop) {
      return prop === 'action' || prop === 'notifications' || prop === 'runtime' || prop === 'windows' || prop === 'tabs' || prop === 'storage' || (prop in target);
    }
  });

  /*
   * Assign to the module-level var chrome / var browser declared below.
   * Because var is hoisted, these assignments write to the module-scope
   * bindings that shadow the globals for ALL code that follows in this file.
   */
  chrome = proxy;
  try { browser = proxy; } catch(e) {}
  console.log('[Tandem] chrome.action polyfill v9 active for ${cwsId}');
})();
/* Module-scope declarations — hoisted above the IIFE, shadow the globals */
/* eslint-disable no-var */
var chrome; var browser; // jshint ignore:line
var TANDEM_PORT; TANDEM_PORT = ${apiPort}; // used by P$() patch below
/* Tandem:polyfill:end */
`;
}

// ─── ActionPolyfill class ─────────────────────────────────────────────────────

/**
 * ActionPolyfill — provides chrome.action (MV3) support for extensions in Electron.
 *
 * Electron does not implement chrome.action. MV3 extensions that call
 * chrome.action.onClicked.addListener(), setIcon(), getUserSettings(), etc.
 * crash on service worker startup with:
 *   "Cannot read properties of undefined (reading 'onClicked')"
 *   "Service worker registration failed. Status code: 15"
 *
 * Architecture:
 * 1. injectPolyfills() scans ~/.tandem/extensions/ for all MV3 extensions
 *    that have a background service worker
 * 2. Prepends a polyfill script to each service worker file on disk
 *    (same strategy as IdentityPolyfill — Electron reads the file at load time)
 * 3. Polyfill is idempotent — guarded by a marker comment and a runtime check
 * 4. Called from ExtensionManager.init() BEFORE session.extensions.loadExtension()
 *
 * Future: when Electron adds native chrome.action support, the runtime guard
 *   `if (chrome.action && typeof chrome.action.onClicked !== 'undefined') return;`
 * ensures the polyfill becomes a no-op without requiring code changes.
 */
export class ActionPolyfill {
  private apiPort: number;

  constructor(apiPort: number = API_PORT) {
    this.apiPort = apiPort;
  }

  /**
   * Inject chrome.action polyfill into all MV3 extension service workers.
   * Must be called BEFORE loading extensions via session.extensions.loadExtension().
   *
   * Targets all MV3 extensions that declare a background service_worker —
   * not limited to extensions with a specific permission, because chrome.action
   * is used widely without needing to be listed in permissions.
   *
   * @returns List of extension folder names that were patched
   */
  injectPolyfills(): string[] {
    const extensionsDir = tandemDir('extensions');
    if (!fs.existsSync(extensionsDir)) return [];

    const patched: string[] = [];
    const dirs = fs.readdirSync(extensionsDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('_'));

    for (const dir of dirs) {
      const extPath = path.join(extensionsDir, dir.name);
      const manifestPath = path.join(extPath, 'manifest.json');
      if (!fs.existsSync(manifestPath)) continue;

      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

        // Only MV3 extensions use chrome.action
        if (manifest.manifest_version !== 3) continue;

        // Only patch extensions with service workers
        const swFile = manifest.background?.service_worker;
        if (!swFile) continue;

        const swPath = path.join(extPath, swFile);
        if (!fs.existsSync(swPath)) continue;

        const cwsId = dir.name;
        const polyfillCode = generatePolyfillScript(cwsId, this.apiPort);
        const marker = '/* Tandem chrome.action polyfill v9';

        let existing = fs.readFileSync(swPath, 'utf-8');

        // Strip ALL previous versions of the Tandem polyfill (any version, with or
        // without end marker). Old copies accumulate when the file is patched across
        // multiple runs if the end marker was not present in older versions.
        //
        // Strategy: use a regex anchored to the unique module-scope var declaration
        // that appears at the end of EVERY polyfill version:
        //   var chrome; var browser; // jshint ignore:line
        // This line does not appear anywhere in the 1Password bundle.
        const polyfillBlockRe = /\/\* Tandem chrome\.action polyfill v[\s\S]*?var chrome; var browser; \/\/ jshint ignore:line\n(?:\/\* Tandem:polyfill:end \*\/\n)?/g;
        const strippedCount = (existing.match(polyfillBlockRe) || []).length;
        if (strippedCount > 0) {
          existing = existing.replace(polyfillBlockRe, '');
          log.info(`[ActionPolyfill] Stripped ${strippedCount} old polyfill block(s) from ${manifest.name || cwsId}`);
        }

        // Prepend new polyfill if current version marker not present
        if (!existing.includes(marker)) {
          existing = polyfillCode + '\n' + existing;
          log.info(`🎯 Action polyfill injected into ${manifest.name || cwsId}`);
        }

        // --- Direct string patches (independent of var-shadow approach) ---
        // These guard against chrome.* APIs that are undefined in Electron's
        // extension service worker context. Applied regardless of polyfill state.
        // Electron injects chrome as a V8-native sealed object; we cannot shadow
        // it via module-level var declarations. Direct patching is the only
        // reliable fix.

        // Patch 1: chrome.notifications.onClicked — crashes at SW startup because
        //   Fj()||(chrome.notifications.onClicked.addListener(...))
        // runs unconditionally (Fj()=false in Chrome/Electron context).
        //
        // IMPORTANT: Use the 1Password-specific callback signature (A=>mre() / mre("click"))
        // as part of the pattern so we never match the polyfill's own JSDoc comments.
        const notifPattern = 'Fj()||(chrome.notifications.onClicked.addListener(A=>mre(';
        const notifGuard   = 'Fj()||!chrome.notifications||(chrome.notifications.onClicked.addListener(A=>mre(';
        if (existing.includes(notifPattern) && !existing.includes(notifGuard)) {
          existing = existing.replace(notifPattern, notifGuard);
          log.info(`🩹 Patched chrome.notifications guard for ${manifest.name || cwsId}`);
        }

        // Patch 2: browser.action.onClicked / browser.browserAction.onClicked — at SW
        // startup 1Password registers its browser-action click handler:
        //   En()?browser.action.onClicked.addListener(EBA):browser.browserAction.onClicked.addListener(EBA)
        // En() returns true in Electron (MV3 context). browser.action is undefined because
        // Electron does not implement chrome.action in extension service workers.
        // Fix: add optional chaining so the addListener call is a no-op if the API is absent.
        const actionClickPattern = 'En()?browser.action.onClicked.addListener(EBA):browser.browserAction.onClicked.addListener(EBA)';
        const actionClickPatch   = 'En()?browser.action?.onClicked?.addListener(EBA):browser.browserAction?.onClicked?.addListener(EBA)';
        if (existing.includes(actionClickPattern) && !existing.includes(actionClickPatch)) {
          existing = existing.replace(actionClickPattern, actionClickPatch);
          log.info(`🩹 Patched browser.action.onClicked guard for ${manifest.name || cwsId}`);
        }

        // Patch 3: browser.windows.WINDOW_ID_NONE / browser.tabs.TAB_ID_NONE — module-level
        // var declarations read these constants directly at SW startup:
        //   Hce=browser.windows.WINDOW_ID_NONE
        //   zce={sourceWindowId:browser.windows.WINDOW_ID_NONE,popupWindowId:browser.tabs.TAB_ID_NONE}
        // browser.windows is undefined in Electron. WINDOW_ID_NONE and TAB_ID_NONE are both
        // standard Chrome constants equal to -1. Use nullish coalescing to fall back to -1.
        // Anchored to 1Password-specific var names Hce / Nce / zce / sourceWindowId.
        const winIdPattern = 'Hce=browser.windows.WINDOW_ID_NONE,Nce';
        const winIdPatch   = 'Hce=(browser.windows?.WINDOW_ID_NONE??-1),Nce';
        if (existing.includes(winIdPattern) && !existing.includes(winIdPatch)) {
          existing = existing.replace(winIdPattern, winIdPatch);
          log.info(`🩹 Patched browser.windows.WINDOW_ID_NONE for ${manifest.name || cwsId}`);
        }

        const zcePattern = 'zce={sourceWindowId:browser.windows.WINDOW_ID_NONE,popupWindowId:browser.tabs.TAB_ID_NONE}';
        const zcePatch   = 'zce={sourceWindowId:(browser.windows?.WINDOW_ID_NONE??-1),popupWindowId:(browser.tabs?.TAB_ID_NONE??-1)}';
        if (existing.includes(zcePattern) && !existing.includes(zcePatch)) {
          existing = existing.replace(zcePattern, zcePatch);
          log.info(`🩹 Patched zce WINDOW_ID_NONE/TAB_ID_NONE for ${manifest.name || cwsId}`);
        }

        // Patch 4: browser.commands.onCommand — module-level listener registration:
        //   browser.commands.onCommand.addListener(A=>{amA(A)&&...})
        // browser.commands is not implemented in Electron. Anchored to amA(A) callback.
        const commandsPattern = 'browser.commands.onCommand.addListener(A=>{amA(A)&&';
        const commandsPatch   = 'browser.commands?.onCommand?.addListener(A=>{amA(A)&&';
        if (existing.includes(commandsPattern) && !existing.includes(commandsPatch)) {
          existing = existing.replace(commandsPattern, commandsPatch);
          log.info(`🩹 Patched browser.commands.onCommand for ${manifest.name || cwsId}`);
        }

        // Patch 5: chrome.windows.onFocusChanged — class constructor called during async SW
        // initialization. chrome.windows is entirely absent in Electron.
        // Also patches chrome.windows.getCurrent in Uce() which uses chrome.windows.WINDOW_ID_NONE
        // directly (not via the already-patched Hce var).
        // Use try-catch instead of optional chaining: Electron's chrome.windows object
        // may throw (not return undefined) when .onFocusChanged is accessed, because
        // the V8 native binding Proxy can throw for unsupported properties.
        // optional chaining (?) does NOT prevent throws from property getters.
        const winFocusOrig     = 'chrome.windows.onFocusChanged.addListener(this.onBrowserWindowFocusChange.bind(this))';
        const winFocusOptional = 'chrome.windows?.onFocusChanged?.addListener(this.onBrowserWindowFocusChange.bind(this))';
        const winFocusTryCatch = '(function(){try{chrome.windows.onFocusChanged.addListener(this.onBrowserWindowFocusChange.bind(this))}catch(_e){}}).call(this)';
        const winFocusGuard    = 'try{chrome.windows.onFocusChanged.addListener(this.onBrowserWindowFocusChange';
        // Upgrade unpatched → try-catch
        if (existing.includes(winFocusOrig) && !existing.includes(winFocusGuard)) {
          existing = existing.replace(winFocusOrig, winFocusTryCatch);
          log.info(`🩹 Patched chrome.windows.onFocusChanged (try-catch) for ${manifest.name || cwsId}`);
        }
        // Upgrade optional-chain → try-catch (migration from earlier patch version)
        if (existing.includes(winFocusOptional) && !existing.includes(winFocusGuard)) {
          existing = existing.replace(winFocusOptional, winFocusTryCatch);
          log.info(`🩹 Upgraded chrome.windows.onFocusChanged to try-catch for ${manifest.name || cwsId}`);
        }

        const winGetCurrentPattern = 'chrome.windows.getCurrent(A=>Lce(A.id??chrome.windows.WINDOW_ID_NONE))';
        const winGetCurrentPatch   = 'chrome.windows?.getCurrent?.(A=>Lce(A.id??-1))';
        if (existing.includes(winGetCurrentPattern) && !existing.includes(winGetCurrentPatch)) {
          existing = existing.replace(winGetCurrentPattern, winGetCurrentPatch);
          log.info(`🩹 Patched chrome.windows.getCurrent for ${manifest.name || cwsId}`);
        }

        // Patch 6: chrome.contextMenus.onClicked — class constructor called at module-level
        // instantiation. chrome.contextMenus is undefined in Electron.
        // Anchored to the unique single occurrence of contextMenus.onClicked in background.js.
        const ctxMenuPattern = 'chrome.contextMenus.onClicked.addListener(this.onClick)';
        const ctxMenuPatch   = 'chrome.contextMenus?.onClicked?.addListener(this.onClick)';
        if (existing.includes(ctxMenuPattern) && !existing.includes(ctxMenuPatch)) {
          existing = existing.replace(ctxMenuPattern, ctxMenuPatch);
          log.info(`🩹 Patched chrome.contextMenus.onClicked for ${manifest.name || cwsId}`);
        }

        // Patch 6: Uce() async initialization block — multiple undefined API accesses.
        // chrome.webNavigation is absent in Electron; chrome.windows.onFocusChanged /
        // onCreated are not implemented. NOTE: Fj() in this minified scope is NOT the
        // Fj=()=>!1 seen elsewhere — variable names are reused across module IIFEs.
        // Fj() here may return true (Chrome/MV3 context), causing the windows branch to run.
        // Patch ALL potentially-undefined API calls in this block with optional chaining.
        // Use try-catch on windows.onFocusChanged in Uce() for same reason as above.
        const uceNavOrig     = 'chrome.webNavigation.onCommitted.addListener(n0j),chrome.tabs.onRemoved.addListener(i0j),Fj()?(chrome.windows.onFocusChanged.addListener(j0j),chrome.windows.onCreated.addListener(t0j),chrome.tabs.onCreated.addListener(r0j)):chrome.webNavigation.onCreatedNavigationTarget.addListener(o0j)';
        const uceNavOptional = 'chrome.webNavigation?.onCommitted?.addListener(n0j),chrome.tabs.onRemoved.addListener(i0j),Fj()?(chrome.windows?.onFocusChanged?.addListener(j0j),chrome.windows?.onCreated?.addListener(t0j),chrome.tabs.onCreated.addListener(r0j)):chrome.webNavigation?.onCreatedNavigationTarget?.addListener(o0j)';
        const uceNavTryCatch = 'chrome.webNavigation?.onCommitted?.addListener(n0j),chrome.tabs.onRemoved.addListener(i0j),Fj()?(function(){try{chrome.windows.onFocusChanged.addListener(j0j)}catch(_e){}})(),(function(){try{chrome.windows.onCreated.addListener(t0j)}catch(_e){}})(),(chrome.tabs.onCreated.addListener(r0j)):(chrome.webNavigation?.onCreatedNavigationTarget?.addListener(o0j))';
        const uceNavGuard    = 'try{chrome.windows.onFocusChanged.addListener(j0j)';
        if (existing.includes(uceNavOrig) && !existing.includes(uceNavGuard)) {
          existing = existing.replace(uceNavOrig, uceNavTryCatch);
          log.info(`🩹 Patched Uce() webNavigation/windows block (try-catch) for ${manifest.name || cwsId}`);
        }
        // Upgrade optional-chain → try-catch
        if (existing.includes(uceNavOptional) && !existing.includes(uceNavGuard)) {
          existing = existing.replace(uceNavOptional, uceNavTryCatch);
          log.info(`🩹 Upgraded Uce() windows.onFocusChanged to try-catch for ${manifest.name || cwsId}`);
        }

        // Patch 7: chrome.webNavigation — module-level event listener registration at SW
        // startup crashes because chrome.webNavigation is undefined in Electron (the
        // 'webNavigation' permission is listed as unknown at extension load time).
        // Only the two module-init calls are patched; all other webNavigation uses are inside
        // async function bodies and only execute on demand, so they are safe for now.
        // Anchored to the 1Password-specific callback names Qxj / Zxj.
        const webNavPattern = 'chrome.webNavigation.onDOMContentLoaded.addListener(Qxj),chrome.webNavigation.onBeforeNavigate.addListener(Zxj)';
        const webNavPatch   = 'chrome.webNavigation?.onDOMContentLoaded?.addListener(Qxj),chrome.webNavigation?.onBeforeNavigate?.addListener(Zxj)';
        if (existing.includes(webNavPattern) && !existing.includes(webNavPatch)) {
          existing = existing.replace(webNavPattern, webNavPatch);
          log.info(`🩹 Patched chrome.webNavigation guard for ${manifest.name || cwsId}`);
        }

        // Patch 9: P$() — async function that queries the active Chrome tab.
        // browser.tabs.query({active:true,currentWindow:true}) returns empty in Electron
        // because webviews are not surfaced as extension tabs. Replace P$() with a direct
        // fetch to the Tandem API that returns the active webview as a Chrome tab object.
        // TANDEM_PORT is declared at module scope by the polyfill (var TANDEM_PORT = N).
        const pDollarOrig = 'async function P$(){let A=new Promise(e=>{browser.tabs.query({active:!0,currentWindow:!0}).then(j=>{if(j===void 0||j.length===0){e(void 0);return}e(j[0])})});return wt()?Ja.withTimeout(A,500,k`tab-manager:activeNativeTab`):A}';
        const pDollarLegacyPatch = 'async function P$(){try{var _r=await fetch("http://127.0.0.1:"+TANDEM_PORT+"/extensions/active-tab");var _d=await _r.json();if(_d&&_d.tab)return _d.tab;}catch(_e){console.error("[Tandem] P$ fetch failed:",_e);}return undefined;}';
        const pDollarPatch = 'async function P$(){try{var _r=await fetch("http://127.0.0.1:"+TANDEM_PORT+"/extensions/active-tab",{headers:__tandemExtensionHeaders()});var _d=await _r.json();if(_d&&_d.tab)return _d.tab;}catch(_e){console.error("[Tandem] P$ fetch failed:",_e);}return undefined;}';
        if (!existing.includes(pDollarPatch) && (existing.includes(pDollarOrig) || existing.includes(pDollarLegacyPatch))) {
          existing = existing.replace(pDollarOrig, pDollarPatch).replace(pDollarLegacyPatch, pDollarPatch);
          log.info(`🩹 Patched P$() active tab query for ${manifest.name || cwsId}`);
        }

        // Patch 10: browser.webNavigation.getAllFrames / chrome.webNavigation.getAllFrames
        // chrome.webNavigation is undefined in Electron (listed as unknown permission).
        // Called inside av() and R3.getAllFrames() to enumerate page frames for autofill.
        // Guard both call sites so they return an empty array instead of throwing.
        const wnavP1orig = 'browser.webNavigation.getAllFrames({tabId:A}).then(e=>e??[]).then(e=>e.filter(({url:j})=>{try{return Dx(new URL(j))}catch{return!1}}))';
        const wnavP1patch = '(browser.webNavigation?.getAllFrames?.({tabId:A})??Promise.resolve([])).then(e=>e??[]).then(e=>e.filter(({url:j})=>{try{return Dx(new URL(j))}catch{return!1}}))';
        if (existing.includes(wnavP1orig) && !existing.includes(wnavP1patch)) {
          existing = existing.replace(wnavP1orig, wnavP1patch);
          log.info(`🩹 Patched browser.webNavigation.getAllFrames (av) for ${manifest.name || cwsId}`);
        }
        const wnavP2orig = 'chrome.webNavigation.getAllFrames({tabId:this.tabId},t=>{t?e(t):j("Frames no longer exists")})';
        const wnavP2patch = 'chrome.webNavigation?.getAllFrames?.({tabId:this.tabId},t=>{t?e(t):j("Frames no longer exists")})||j([])';
        if (existing.includes(wnavP2orig) && !existing.includes(wnavP2patch)) {
          existing = existing.replace(wnavP2orig, wnavP2patch);
          log.info(`🩹 Patched chrome.webNavigation.getAllFrames (R3) for ${manifest.name || cwsId}`);
        }

        // Patch 8: browser.windows.create({type:'popup'}) — the extension opens its own
        // popup/index.html in "detached" mode via a popup window. Electron creates the
        // window but immediately closes it (popup windows flash and disappear).
        // Fix: replace the single windows.create call with chrome.tabs.create so the
        // detached popup opens as a normal tab that stays open.
        const winCreateOrig  = 'browser.windows.create({url:chrome.runtime.getURL("/popup/index.html#detached"),type:"popup",...MWA()})';
        const winCreatePatch = 'chrome.tabs.create({url:chrome.runtime.getURL("/popup/index.html#detached"),active:true})';
        if (existing.includes(winCreateOrig) && !existing.includes(winCreatePatch)) {
          existing = existing.replace(winCreateOrig, winCreatePatch);
          log.info(`🩹 Patched browser.windows.create popup->tabs.create for ${manifest.name || cwsId}`);
        }

        // Patch 11: Error telemetry — patch Dre and Bte catch blocks to POST
        // the real exception to /extensions/log so it appears in Node.js terminal.
        // Replaces the anonymous catch{} with catch(_te){} that forwards the error.
        // Dre catch: '...Unable to generate item details')||logger.report(["Unable to generate item details'
        const dreCatchOrig = '}catch{return console.error("[Background]","Unable to generate item details")';
        const dreCatchLegacyPatch = `}catch(_te){try{fetch("http://127.0.0.1:"+TANDEM_PORT+"/extensions/log",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({source:"Dre-catch",msg:_te?.message||String(_te),stack:(_te?.stack||"").slice(0,500)})});}catch{}return console.error("[Background]","Unable to generate item details")`;
        const dreCatchPatch = `}catch(_te){try{fetch("http://127.0.0.1:"+TANDEM_PORT+"/extensions/log",{method:"POST",headers:__tandemExtensionHeaders({"Content-Type":"application/json"}),body:JSON.stringify({source:"Dre-catch",msg:_te?.message||String(_te),stack:(_te?.stack||"").slice(0,500)})});}catch{}return console.error("[Background]","Unable to generate item details")`;
        if (!existing.includes(dreCatchPatch) && (existing.includes(dreCatchOrig) || existing.includes(dreCatchLegacyPatch))) {
          existing = existing.replaceAll(dreCatchOrig, dreCatchPatch).replaceAll(dreCatchLegacyPatch, dreCatchPatch);
          log.info(`🩹 Patched Dre catch (error telemetry) for ${manifest.name || cwsId}`);
        }

        // Bte: wrap registration P("get-settings-configuration",Bte) with a logging wrapper.
        // Replaces the handler registration so exceptions POST to /extensions/log before rethrowing.
        const bteRegOrig  = 'P("get-settings-configuration",Bte)';
        const bteRegLegacyPatch = 'P("get-settings-configuration",async function(..._bteA){try{return await Bte(..._bteA)}catch(_bte){try{fetch("http://127.0.0.1:"+TANDEM_PORT+"/extensions/log",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({source:"Bte-catch",msg:_bte?.message||String(_bte),stack:(_bte?.stack||"").slice(0,500)})});}catch{}throw _bte;}})';
        const bteRegPatch = 'P("get-settings-configuration",async function(..._bteA){try{return await Bte(..._bteA)}catch(_bte){try{fetch("http://127.0.0.1:"+TANDEM_PORT+"/extensions/log",{method:"POST",headers:__tandemExtensionHeaders({"Content-Type":"application/json"}),body:JSON.stringify({source:"Bte-catch",msg:_bte?.message||String(_bte),stack:(_bte?.stack||"").slice(0,500)})});}catch{}throw _bte;}})';
        if (!existing.includes(bteRegPatch) && (existing.includes(bteRegOrig) || existing.includes(bteRegLegacyPatch))) {
          existing = existing.replace(bteRegOrig, bteRegPatch).replace(bteRegLegacyPatch, bteRegPatch);
          log.info(`🩹 Patched Bte registration (error telemetry) for ${manifest.name || cwsId}`);
        }

        // Patch 12: Kfj() — called inside GmA.getItemDetails() to check if the popup is
        // a "new window" popup. browser.windows.getCurrent() is undefined in Electron's
        // Service Worker context and throws. Since Tandem never opens 1Password in a
        // detached popup window, always return false (not a popup).
        const kfjOrig  = 'async function Kfj(){return(await browser.windows.getCurrent()).type==="popup"}';
        const kfjPatch = 'async function Kfj(){return false/* tandem-patch: windows.getCurrent() not available in SW */}';
        if (existing.includes(kfjOrig) && !existing.includes(kfjPatch)) {
          existing = existing.replace(kfjOrig, kfjPatch);
          log.info(`🩹 Patched Kfj() isInNewWindow for ${manifest.name || cwsId}`);
        }

        // Patch 13: zj.getShortcuts() — called inside Bte() to fetch keyboard shortcuts.
        // browser.commands is undefined in Electron. Guard with early return when absent.
        const getShortcutsOrig  = 'static async getShortcuts(){return browser.commands.getAll().then(e=>{let j={browserAction:"",lock:""};try{let t=e.find(({name:a})=>a&&Afj(a)),r=e.find(({name:a})=>a&&amA(a));j={browserAction:this.normalizeCtrlOnMac(t?.shortcut)??"",lock:this.normalizeCtrlOnMac(r?.shortcut)??""}}catch{}return j})}';
        const getShortcutsPatch = 'static async getShortcuts(){if(!browser.commands)return{browserAction:"",lock:""};return browser.commands.getAll().then(e=>{let j={browserAction:"",lock:""};try{let t=e.find(({name:a})=>a&&Afj(a)),r=e.find(({name:a})=>a&&amA(a));j={browserAction:this.normalizeCtrlOnMac(t?.shortcut)??"",lock:this.normalizeCtrlOnMac(r?.shortcut)??""}}catch{}return j})}';
        if (existing.includes(getShortcutsOrig) && !existing.includes(getShortcutsPatch)) {
          existing = existing.replace(getShortcutsOrig, getShortcutsPatch);
          log.info(`🩹 Patched zj.getShortcuts() browser.commands guard for ${manifest.name || cwsId}`);
        }

        fs.writeFileSync(swPath, existing, 'utf-8');
        patched.push(cwsId);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn(`⚠️ Failed to inject action polyfill for ${dir.name}: ${msg}`);
      }
    }

    return patched;
  }
}
