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
