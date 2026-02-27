/**
 * Console log entry captured via CDP Runtime.consoleAPICalled
 */
export interface ConsoleEntry {
  id: number;
  level: 'log' | 'info' | 'warn' | 'error' | 'debug' | 'verbose';
  text: string;
  args: string[];       // serialized argument previews
  url: string;          // source URL
  line: number;         // source line
  column: number;       // source column
  timestamp: number;
  tabId?: string;
  stackTrace?: string;  // formatted stack trace for errors
}

/**
 * Network request captured via CDP Network domain
 */
export interface CDPNetworkRequest {
  id: string;           // CDP requestId
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
  resourceType: string; // Document, Script, XHR, Fetch, etc.
  timestamp: number;
  tabId?: string;
}

/**
 * Network response captured via CDP Network domain
 */
export interface CDPNetworkResponse {
  requestId: string;
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  mimeType: string;
  size: number;
  timestamp: number;
  body?: string;        // populated on-demand via Network.getResponseBody
  bodyTruncated?: boolean;
}

/**
 * Combined network entry (request + response)
 */
export interface CDPNetworkEntry {
  request: CDPNetworkRequest;
  response?: CDPNetworkResponse;
  failed?: boolean;
  errorText?: string;
  duration?: number;    // ms between request and response
}

/**
 * DOM node snapshot from CDP
 */
export interface DOMNodeInfo {
  nodeId: number;
  backendNodeId: number;
  nodeType: number;     // 1=Element, 3=Text, etc.
  nodeName: string;
  localName: string;
  attributes: Record<string, string>;
  childCount: number;
  innerText?: string;   // first 500 chars
  outerHTML?: string;   // first 2000 chars
  boundingBox?: { x: number; y: number; width: number; height: number };
}

/**
 * Storage data
 */
export interface StorageData {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    httpOnly: boolean;
    secure: boolean;
    sameSite: string;
    expires: number;
  }>;
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
}

/**
 * Performance metrics from CDP
 */
export interface PerformanceMetrics {
  timestamp: number;
  metrics: Record<string, number>;  // JSHeapUsedSize, Documents, Nodes, etc.
}

// ═══════════════════════════════════════════════
// CDP Event Parameter Types
// ═══════════════════════════════════════════════

/** CDP Runtime.RemoteObject — represents a JS value in the debuggee */
export interface CDPRemoteObject {
  type: string;
  subtype?: string;
  className?: string;
  value?: unknown;
  description?: string;
  objectId?: string;
  preview?: {
    type: string;
    overflow: boolean;
    properties: Array<{ name: string; type: string; value: string }>;
  };
}

/** CDP Runtime.CallFrame — a single stack frame */
export interface CDPCallFrame {
  functionName: string;
  scriptId: string;
  url: string;
  lineNumber: number;
  columnNumber: number;
}

/** CDP Runtime.StackTrace */
export interface CDPStackTrace {
  description?: string;
  callFrames: CDPCallFrame[];
  parent?: CDPStackTrace;
}

/** CDP Runtime.consoleAPICalled event params */
export interface CDPConsoleAPICalledParams {
  type: string;
  args: CDPRemoteObject[];
  executionContextId: number;
  timestamp: number;
  stackTrace?: CDPStackTrace;
}

/** CDP Runtime.exceptionThrown event params */
export interface CDPExceptionThrownParams {
  timestamp: number;
  exceptionDetails: {
    exceptionId: number;
    text: string;
    lineNumber: number;
    columnNumber: number;
    url?: string;
    stackTrace?: CDPStackTrace;
    exception?: CDPRemoteObject;
  };
}

/** CDP Runtime.bindingCalled event params */
export interface CDPBindingCalledParams {
  name: string;
  payload: string;
  executionContextId: number;
}

/** CDP Network.requestWillBeSent event params */
export interface CDPRequestWillBeSentParams {
  requestId: string;
  request: {
    url: string;
    method: string;
    headers: Record<string, string>;
    postData?: string;
  };
  type?: string;
  documentURL?: string;
  timestamp: number;
  initiator?: { type: string; url?: string };
}

/** CDP Network.responseReceived event params */
export interface CDPResponseReceivedParams {
  requestId: string;
  response: {
    url: string;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    mimeType: string;
    encodedDataLength?: number;
  };
  type?: string;
  timestamp: number;
}

/** CDP Network.loadingFinished event params */
export interface CDPLoadingFinishedParams {
  requestId: string;
  timestamp: number;
  encodedDataLength?: number;
}

/** CDP Network.loadingFailed event params */
export interface CDPLoadingFailedParams {
  requestId: string;
  timestamp: number;
  errorText: string;
  canceled?: boolean;
  type?: string;
}

/** CDP Network cookie (from Network.getCookies) */
export interface CDPCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  size: number;
  httpOnly: boolean;
  secure: boolean;
  session: boolean;
  sameSite?: string;
}

/** CDP subscriber — used by security modules to receive CDP events */
export interface CDPSubscriber {
  name: string;
  events: string[];  // CDP event names to subscribe to, or ['*'] for all
  handler: (method: string, params: Record<string, unknown>) => void;
}
