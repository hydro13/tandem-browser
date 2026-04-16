/**
 * Shared sidebar config + auth token + mutable cross-module state.
 * Accessed via getter/setter pairs so write points stay greppable.
 *
 * Loaded from: shell/js/sidebar/index.js (later PRs will extract more sidebar modules that also import from here)
 * window exports: none
 */

const TOKEN = window.__TANDEM_TOKEN__ || '';
export function getToken() { return TOKEN; }

let _config = null;
// Returns the live config object — callers may mutate its properties directly.
export function getConfig() { return _config; }
export function setConfig(next) { _config = next; }

let _isSetupPanelOpen = false;
export function isSetupPanelOpen() { return _isSetupPanelOpen; }
export function setSetupPanelOpen(v) { _isSetupPanelOpen = v; }

let _wsWorkspaces = [];
export function getWorkspaces() { return _wsWorkspaces; }
export function setWorkspaces(list) { _wsWorkspaces = list; }

let _wsActiveId = null;
export function getActiveWorkspaceId() { return _wsActiveId; }
export function setActiveWorkspaceId(id) { _wsActiveId = id; }
