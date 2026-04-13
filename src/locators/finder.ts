import type { DevToolsManager } from '../devtools/manager';
import type { SnapshotManager } from '../snapshot/manager';
import type { AccessibilityNode } from '../snapshot/types';

// ─── Types ──────────────────────────────────────────────────────────

export type LocatorStrategy = 'role' | 'text' | 'placeholder' | 'label' | 'testid';

export interface LocatorQuery {
  by: LocatorStrategy;
  value: string;
  name?: string;      // For role: optional accessible name filter
  exact?: boolean;    // Default true; false = substring match
}

export interface LocatorResult {
  found: boolean;
  ref?: string;        // '@e5' — usable with /snapshot/click
  text?: string;       // Visible text of the element
  role?: string;       // ARIA role
  tagName?: string;    // DOM tag (button, input, a, ...)
  count?: number;      // Number of matches
}

export interface LocatorFindOptions {
  wcId?: number;
}

interface DOMSearchResponse {
  resultCount?: number;
  searchId?: string;
}

interface DOMSearchResultsResponse {
  nodeIds?: number[];
}

interface DOMAttributesResponse {
  attributes?: string[];
}

interface DOMQuerySelectorResponse {
  nodeId?: number;
}

interface DOMQuerySelectorAllResponse {
  nodeIds?: number[];
}

interface DOMDocumentResponse {
  root: {
    nodeId: number;
  };
}

interface DOMDescribeNodeResponse {
  node?: {
    backendNodeId?: number;
    nodeName?: string;
  };
}

interface AccessibilityPartialTreeResponse {
  nodes?: Array<{
    role?: { value?: string };
    name?: { value?: string };
  }>;
}

// ─── Manager ────────────────────────────────────────────────────────

/**
 * LocatorFinder — finds elements by role, text, placeholder, label, or test ID.
 */
export class LocatorFinder {

  // === 2. Constructor ===

  constructor(
    private devTools: DevToolsManager,
    private snapshot: SnapshotManager,
  ) {}

  // === 4. Public methods ===

  async find(query: LocatorQuery, options?: LocatorFindOptions): Promise<LocatorResult> {
    switch (query.by) {
      case 'role':        return this.findByRole(query, options);
      case 'text':        return this.findByText(query, options);
      case 'placeholder': return this.findByPlaceholder(query, options);
      case 'label':       return this.findByLabel(query, options);
      case 'testid':      return this.findByTestId(query, options);
      default:
        throw new Error(`Unknown locator strategy: ${(query as unknown as Record<string, unknown>).by}`);
    }
  }

  async findAll(query: LocatorQuery, options?: LocatorFindOptions): Promise<LocatorResult[]> {
    switch (query.by) {
      case 'role':        return this.findAllByRole(query, options);
      case 'text':        return this.findAllByText(query, options);
      case 'placeholder': return this.findAllByPlaceholder(query, options);
      case 'label':       return this.findAllByLabel(query, options);
      case 'testid':      return this.findAllByTestId(query, options);
      default:
        throw new Error(`Unknown locator strategy: ${(query as unknown as Record<string, unknown>).by}`);
    }
  }

  // === 7. Private helpers ===

  // --- Role ---

  private async findByRole(query: LocatorQuery, options?: LocatorFindOptions): Promise<LocatorResult> {
    const tree = await this.snapshot.getAccessibilityTree({ interactive: false, wcId: options?.wcId });
    const match = this.walkTree(tree, (node) => this.matchRole(node, query));
    if (!match) return { found: false };
    return { found: true, ref: match.ref, text: match.name, role: match.role, count: 1 };
  }

  private async findAllByRole(query: LocatorQuery, options?: LocatorFindOptions): Promise<LocatorResult[]> {
    const tree = await this.snapshot.getAccessibilityTree({ interactive: false, wcId: options?.wcId });
    const matches = this.walkTreeAll(tree, (node) => this.matchRole(node, query));
    return matches.map(m => ({ found: true, ref: m.ref, text: m.name, role: m.role }));
  }

  private matchRole(node: AccessibilityNode, query: LocatorQuery): boolean {
    if (node.role.toLowerCase() !== query.value.toLowerCase()) return false;
    if (query.name) {
      const exact = query.exact !== false;
      const nodeName = node.name?.toLowerCase() ?? '';
      const wantName = query.name.toLowerCase();
      return exact ? nodeName === wantName : nodeName.includes(wantName);
    }
    return true;
  }

  // --- Text ---

  private async findByText(query: LocatorQuery, options?: LocatorFindOptions): Promise<LocatorResult> {
    const tree = await this.snapshot.getAccessibilityTree({ interactive: false, wcId: options?.wcId });
    const exact = query.exact !== false;
    const match = this.walkTree(tree, (node) => this.matchText(node, query.value, exact));
    if (match) return { found: true, ref: match.ref, text: match.name, role: match.role, count: 1 };

    // Fallback: DOM text search via CDP
    return this.findByDomText(query.value, exact, options);
  }

  private async findAllByText(query: LocatorQuery, options?: LocatorFindOptions): Promise<LocatorResult[]> {
    const tree = await this.snapshot.getAccessibilityTree({ interactive: false, wcId: options?.wcId });
    const exact = query.exact !== false;
    const matches = this.walkTreeAll(tree, (node) => this.matchText(node, query.value, exact));
    return matches.map(m => ({ found: true, ref: m.ref, text: m.name, role: m.role }));
  }

  private matchText(node: AccessibilityNode, value: string, exact: boolean): boolean {
    const nodeName = node.name?.toLowerCase() ?? '';
    const want = value.toLowerCase();
    return exact ? nodeName === want : nodeName.includes(want);
  }

  private async findByDomText(text: string, exact: boolean, options?: LocatorFindOptions): Promise<LocatorResult> {
    try {
      const xpath = exact
        ? `//*[normalize-space(text())="${text}"]`
        : `//*[contains(normalize-space(text()),"${text}")]`;

      const result = await this.sendCommand<DOMSearchResponse>(options?.wcId, 'DOM.performSearch', {
        query: xpath,
        includeUserAgentShadowDOM: false,
      });

      if (!result?.resultCount) return { found: false };

      const nodes = await this.sendCommand<DOMSearchResultsResponse>(options?.wcId, 'DOM.getSearchResults', {
        searchId: result.searchId,
        fromIndex: 0,
        toIndex: 1,
      });

      await this.sendCommand(options?.wcId, 'DOM.discardSearchResults', {
        searchId: result.searchId,
      });

      if (!nodes?.nodeIds?.[0]) return { found: false };

      return this.nodeIdToLocatorResult(nodes.nodeIds[0], options);
    } catch {
      return { found: false };
    }
  }

  // --- Placeholder ---

  private async findByPlaceholder(query: LocatorQuery, options?: LocatorFindOptions): Promise<LocatorResult> {
    const exact = query.exact !== false;
    const selector = exact
      ? `input[placeholder="${query.value}"], textarea[placeholder="${query.value}"]`
      : `input[placeholder*="${query.value}"], textarea[placeholder*="${query.value}"]`;
    return this.findByCssSelector(selector, options);
  }

  private async findAllByPlaceholder(query: LocatorQuery, options?: LocatorFindOptions): Promise<LocatorResult[]> {
    const exact = query.exact !== false;
    const selector = exact
      ? `input[placeholder="${query.value}"], textarea[placeholder="${query.value}"]`
      : `input[placeholder*="${query.value}"], textarea[placeholder*="${query.value}"]`;
    return this.findAllByCssSelector(selector, options);
  }

  // --- Label ---

  private async findByLabel(query: LocatorQuery, options?: LocatorFindOptions): Promise<LocatorResult> {
    try {
      const exact = query.exact !== false;
      const labelXpath = exact
        ? `//label[normalize-space(text())="${query.value}"]`
        : `//label[contains(normalize-space(text()),"${query.value}")]`;

      const result = await this.sendCommand<DOMSearchResponse>(options?.wcId, 'DOM.performSearch', {
        query: labelXpath,
        includeUserAgentShadowDOM: false,
      });

      if (!result?.resultCount) return { found: false };

      const nodes = await this.sendCommand<DOMSearchResultsResponse>(options?.wcId, 'DOM.getSearchResults', {
        searchId: result.searchId,
        fromIndex: 0,
        toIndex: 1,
      });
      await this.sendCommand(options?.wcId, 'DOM.discardSearchResults', {
        searchId: result.searchId,
      });

      if (!nodes?.nodeIds?.[0]) return { found: false };

      // Get the for attribute of the label
      const attrs = await this.sendCommand<DOMAttributesResponse>(options?.wcId, 'DOM.getAttributes', {
        nodeId: nodes.nodeIds[0],
      });
      const attrList: string[] = attrs?.attributes ?? [];
      const forIdx = attrList.indexOf('for');
      const forValue = forIdx >= 0 ? attrList[forIdx + 1] : null;

      if (forValue) {
        // Escape CSS identifier (no CSS.escape in Node)
        const escaped = forValue.replace(/([^\w-])/g, '\\$1');
        return this.findByCssSelector(`#${escaped}`, options);
      }

      // No for attribute — find enclosed input
      const childResult = await this.sendCommand<DOMQuerySelectorResponse>(options?.wcId, 'DOM.querySelector', {
        nodeId: nodes.nodeIds[0],
        selector: 'input, select, textarea',
      });
      if (childResult?.nodeId) {
        return this.nodeIdToLocatorResult(childResult.nodeId, options);
      }

      return { found: false };
    } catch {
      return { found: false };
    }
  }

  private async findAllByLabel(query: LocatorQuery, options?: LocatorFindOptions): Promise<LocatorResult[]> {
    // Label locator typically finds one input per label, delegate to single find
    const result = await this.findByLabel(query, options);
    return result.found ? [result] : [];
  }

  // --- TestID ---

  private async findByTestId(query: LocatorQuery, options?: LocatorFindOptions): Promise<LocatorResult> {
    const exact = query.exact !== false;
    const selector = exact
      ? `[data-testid="${query.value}"]`
      : `[data-testid*="${query.value}"]`;
    return this.findByCssSelector(selector, options);
  }

  private async findAllByTestId(query: LocatorQuery, options?: LocatorFindOptions): Promise<LocatorResult[]> {
    const exact = query.exact !== false;
    const selector = exact
      ? `[data-testid="${query.value}"]`
      : `[data-testid*="${query.value}"]`;
    return this.findAllByCssSelector(selector, options);
  }

  // --- CSS / DOM helpers ---

  private async findByCssSelector(selector: string, options?: LocatorFindOptions): Promise<LocatorResult> {
    try {
      await this.sendCommand(options?.wcId, 'DOM.enable', {});
      const doc = await this.sendCommand<DOMDocumentResponse>(options?.wcId, 'DOM.getDocument', { depth: 0 });
      const result = await this.sendCommand<DOMQuerySelectorResponse>(options?.wcId, 'DOM.querySelector', {
        nodeId: doc.root.nodeId,
        selector,
      });
      if (!result?.nodeId) return { found: false };
      return this.nodeIdToLocatorResult(result.nodeId, options);
    } catch {
      return { found: false };
    }
  }

  private async findAllByCssSelector(selector: string, options?: LocatorFindOptions): Promise<LocatorResult[]> {
    try {
      await this.sendCommand(options?.wcId, 'DOM.enable', {});
      const doc = await this.sendCommand<DOMDocumentResponse>(options?.wcId, 'DOM.getDocument', { depth: 0 });
      const result = await this.sendCommand<DOMQuerySelectorAllResponse>(options?.wcId, 'DOM.querySelectorAll', {
        nodeId: doc.root.nodeId,
        selector,
      });
      if (!result?.nodeIds?.length) return [];
      const results: LocatorResult[] = [];
      for (const nodeId of result.nodeIds) {
        const loc = await this.nodeIdToLocatorResult(nodeId, options);
        if (loc.found) results.push(loc);
      }
      return results;
    } catch {
      return [];
    }
  }

  private async nodeIdToLocatorResult(nodeId: number, options?: LocatorFindOptions): Promise<LocatorResult> {
    try {
      // Get node info to find backendNodeId
      const nodeInfo = await this.sendCommand<DOMDescribeNodeResponse>(options?.wcId, 'DOM.describeNode', { nodeId });
      const backendNodeId = nodeInfo?.node?.backendNodeId;
      const tagName = nodeInfo?.node?.nodeName?.toLowerCase() ?? '';

      if (backendNodeId === undefined) return { found: false };

      // Try to find this node in the current accessibility tree refs
      // If not found, register the backendNodeId as a new ref
      const ref = this.snapshot.registerBackendNodeId(backendNodeId, options?.wcId ?? null);

      // Get accessible name via CDP Accessibility
      let role = tagName;
      let name = '';
      try {
        const axNode = await this.sendCommand<AccessibilityPartialTreeResponse>(options?.wcId, 'Accessibility.getPartialAXTree', {
          nodeId,
          fetchRelatives: false,
        });
        if (axNode?.nodes?.[0]) {
          role = axNode.nodes[0].role?.value ?? tagName;
          name = axNode.nodes[0].name?.value ?? '';
        }
      } catch {
        // Fallback: use tagName as role
      }

      return { found: true, ref, text: name || undefined, role, tagName, count: 1 };
    } catch {
      return { found: false };
    }
  }

  private async sendCommand<T = unknown>(
    wcId: number | undefined,
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    if (wcId) {
      return this.devTools.sendCommandToTab(wcId, method, params) as Promise<T>;
    }
    return this.devTools.sendCommand(method, params) as Promise<T>;
  }

  // --- Tree walker ---

  private walkTree(
    nodes: AccessibilityNode[],
    predicate: (node: AccessibilityNode) => boolean,
  ): AccessibilityNode | null {
    for (const node of nodes) {
      if (predicate(node)) return node;
      if (node.children?.length) {
        const found = this.walkTree(node.children, predicate);
        if (found) return found;
      }
    }
    return null;
  }

  private walkTreeAll(
    nodes: AccessibilityNode[],
    predicate: (node: AccessibilityNode) => boolean,
  ): AccessibilityNode[] {
    const results: AccessibilityNode[] = [];
    for (const node of nodes) {
      if (predicate(node)) results.push(node);
      if (node.children?.length) {
        results.push(...this.walkTreeAll(node.children, predicate));
      }
    }
    return results;
  }
}
