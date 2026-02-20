export interface AccessibilityNode {
  nodeId: string;
  role: string;
  name?: string;
  ref?: string;           // "@e1", "@e2", etc.
  value?: string;
  description?: string;
  focused?: boolean;
  level?: number;         // for headings
  children: AccessibilityNode[];
}

export interface RefMap {
  // "@e1" → CDP nodeId
  [ref: string]: string;
}

export interface SnapshotOptions {
  interactive?: boolean;  // only buttons/inputs/links/etc.
  compact?: boolean;      // remove empty structural nodes
  selector?: string;      // scope to CSS selector
  depth?: number;         // max depth
}

export interface SnapshotResult {
  text: string;           // formatted tree text
  count: number;          // number of nodes
  url: string;            // current page URL
}
