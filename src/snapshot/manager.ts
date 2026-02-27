import { DevToolsManager } from '../devtools/manager';
import { AccessibilityNode, RefMap, SnapshotOptions, SnapshotResult } from './types';

/** Roles considered interactive (buttons, inputs, links, etc.) */
const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'checkbox', 'radio',
  'combobox', 'menuitem', 'tab', 'searchbox',
]);

/**
 * SnapshotManager — Provides accessibility tree snapshots via CDP.
 *
 * Uses Accessibility.getFullAXTree() through DevToolsManager to get
 * a structured tree of all UI elements. Each element gets a stable
 * @ref (e.g. @e1, @e2) that can be used for click/fill/text operations.
 *
 * All CDP calls go through devToolsManager.sendCommand() — never
 * attach the debugger directly.
 */
export class SnapshotManager {
  private refMap: RefMap = {};
  private refBackendNodeMap: Map<string, number> = new Map();
  private refCounter = 0;
  private devtools: DevToolsManager;
  private subscribedToNavigation = false;

  constructor(devtools: DevToolsManager) {
    this.devtools = devtools;
    this.setupNavigationReset();
  }

  /**
   * Subscribe to Page.frameNavigated to reset refs on navigation.
   */
  private setupNavigationReset(): void {
    if (this.subscribedToNavigation) return;
    this.devtools.subscribe({
      name: 'snapshot-nav-reset',
      events: ['Page.frameNavigated'],
      handler: (_method: string, params: Record<string, unknown>) => {
        // Only reset on top-level navigation (not iframes)
        const frame = params.frame as Record<string, unknown> | undefined;
        if (!frame?.parentId) {
          this.refMap = {};
          this.refBackendNodeMap.clear();
          this.refCounter = 0;
        }
      },
    });
    this.subscribedToNavigation = true;
  }

  /**
   * Get an accessibility tree snapshot of the current page.
   */
  async getSnapshot(options: SnapshotOptions): Promise<SnapshotResult> {
    // Enable Accessibility domain (idempotent)
    await this.devtools.sendCommand('Accessibility.enable', {});

    // Get the full accessibility tree
    const result = await this.devtools.sendCommand('Accessibility.getFullAXTree', {});
    const rawNodes: Record<string, any>[] = result.nodes || [];

    // Build tree from flat CDP node list
    let tree = this.buildTree(rawNodes);

    // Selector filter: scope to a CSS selector's subtree
    if (options.selector) {
      tree = await this.filterBySelector(tree, options.selector);
    }

    // Interactive filter
    if (options.interactive) {
      tree = this.filterInteractive(tree);
    }

    // Compact filter: remove empty structural nodes
    if (options.compact) {
      tree = this.filterCompact(tree);
    }

    // Depth filter
    if (options.depth !== undefined) {
      tree = this.filterByDepth(tree, options.depth);
    }

    // Reset refs for this snapshot
    this.refMap = {};
    this.refBackendNodeMap.clear();
    this.refCounter = 0;

    // Assign @refs to all nodes
    this.assignRefs(tree);

    // Format as text
    const text = this.formatTree(tree);

    // Count nodes
    const count = this.countNodes(tree);

    // Get current URL
    let url = '';
    try {
      const evalResult = await this.devtools.sendCommand('Runtime.evaluate', {
        expression: 'window.location.href',
        returnByValue: true,
      });
      url = evalResult.result?.value || '';
    } catch {
      // ignore — URL is nice to have
    }

    return { text, count, url };
  }

  /**
   * Click an element by @ref.
   * Resolves ref → backendDOMNodeId → DOM.getBoxModel → center coordinates → sendInputEvent.
   */
  async clickRef(ref: string): Promise<void> {
    const backendNodeId = this.refBackendNodeMap.get(ref);
    if (backendNodeId === undefined) {
      throw new Error(`Ref not found: ${ref} — call GET /snapshot first`);
    }

    // Get the box model to find element coordinates
    await this.devtools.sendCommand('DOM.enable', {});
    const box = await this.devtools.sendCommand('DOM.getBoxModel', { backendNodeId });
    if (!box.model?.content) {
      throw new Error(`Cannot get box model for ${ref}`);
    }

    // Calculate center from content quad (8 values: x1,y1,x2,y2,x3,y3,x4,y4)
    const c = box.model.content;
    const x = Math.round((c[0] + c[2] + c[4] + c[6]) / 4);
    const y = Math.round((c[1] + c[3] + c[5] + c[7]) / 4);

    // Get WebContents via ensureAttached for sendInputEvent
    const wc = await this.devtools.ensureAttached();
    if (!wc) throw new Error('No active tab');

    // Scroll element into view first
    try {
      const resolved = await this.devtools.sendCommand('DOM.resolveNode', { backendNodeId });
      if (resolved.object?.objectId) {
        await this.devtools.sendCommand('Runtime.callFunctionOn', {
          objectId: resolved.object.objectId,
          functionDeclaration: 'function() { this.scrollIntoView({ behavior: "smooth", block: "center" }); }',
          returnByValue: true,
        });
        // Re-get box model after scroll
        const box2 = await this.devtools.sendCommand('DOM.getBoxModel', { backendNodeId });
        if (box2.model?.content) {
          const c2 = box2.model.content;
          const x2 = Math.round((c2[0] + c2[2] + c2[4] + c2[6]) / 4);
          const y2 = Math.round((c2[1] + c2[3] + c2[5] + c2[7]) / 4);
          // Use updated coordinates
          this.performClick(wc, x2, y2);
          return;
        }
      }
    } catch {
      // fallback to original coordinates
    }

    this.performClick(wc, x, y);
  }

  /**
   * Fill an element by @ref with text.
   * Clicks to focus, then types char-by-char via sendInputEvent.
   */
  async fillRef(ref: string, value: string): Promise<void> {
    const backendNodeId = this.refBackendNodeMap.get(ref);
    if (backendNodeId === undefined) {
      throw new Error(`Ref not found: ${ref} — call GET /snapshot first`);
    }

    // Get box model for clicking to focus
    await this.devtools.sendCommand('DOM.enable', {});
    const box = await this.devtools.sendCommand('DOM.getBoxModel', { backendNodeId });
    if (!box.model?.content) {
      throw new Error(`Cannot get box model for ${ref}`);
    }

    const c = box.model.content;
    let x = Math.round((c[0] + c[2] + c[4] + c[6]) / 4);
    let y = Math.round((c[1] + c[3] + c[5] + c[7]) / 4);

    const wc = await this.devtools.ensureAttached();
    if (!wc) throw new Error('No active tab');

    // Scroll into view and re-get coordinates
    try {
      const resolved = await this.devtools.sendCommand('DOM.resolveNode', { backendNodeId });
      if (resolved.object?.objectId) {
        await this.devtools.sendCommand('Runtime.callFunctionOn', {
          objectId: resolved.object.objectId,
          functionDeclaration: 'function() { this.scrollIntoView({ behavior: "smooth", block: "center" }); }',
          returnByValue: true,
        });
        const box2 = await this.devtools.sendCommand('DOM.getBoxModel', { backendNodeId });
        if (box2.model?.content) {
          const c2 = box2.model.content;
          x = Math.round((c2[0] + c2[2] + c2[4] + c2[6]) / 4);
          y = Math.round((c2[1] + c2[3] + c2[5] + c2[7]) / 4);
        }
      }
    } catch {
      // use original coordinates
    }

    // Click to focus
    this.performClick(wc, x, y);

    // Small delay to ensure focus
    await this.delay(100);

    // Select all (Cmd+A) then delete to clear existing content
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'a', modifiers: ['meta'] });
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'a', modifiers: ['meta'] });
    await this.delay(50);
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace' });
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'Backspace' });
    await this.delay(50);

    // Type each character
    for (const char of value) {
      wc.sendInputEvent({ type: 'char', keyCode: char });
      await this.delay(30 + Math.random() * 50);
    }
  }

  /**
   * Get the text content of an element by @ref.
   */
  async getTextRef(ref: string): Promise<string> {
    const backendNodeId = this.refBackendNodeMap.get(ref);
    if (backendNodeId === undefined) {
      throw new Error(`Ref not found: ${ref} — call GET /snapshot first`);
    }

    await this.devtools.sendCommand('DOM.enable', {});
    const resolved = await this.devtools.sendCommand('DOM.resolveNode', { backendNodeId });
    if (!resolved.object?.objectId) {
      throw new Error(`Cannot resolve DOM node for ${ref}`);
    }

    const textResult = await this.devtools.sendCommand('Runtime.callFunctionOn', {
      objectId: resolved.object.objectId,
      functionDeclaration: 'function() { return this.innerText || this.textContent || ""; }',
      returnByValue: true,
    });

    return textResult.result?.value || '';
  }

  /**
   * Get the accessibility tree with @refs assigned.
   * Used by LocatorFinder for semantic element search.
   */
  async getAccessibilityTree(options?: SnapshotOptions): Promise<AccessibilityNode[]> {
    await this.devtools.sendCommand('Accessibility.enable', {});
    const result = await this.devtools.sendCommand('Accessibility.getFullAXTree', {});
    const rawNodes: Record<string, any>[] = result.nodes || [];
    let tree = this.buildTree(rawNodes);

    if (options?.interactive) {
      tree = this.filterInteractive(tree);
    }
    if (options?.compact) {
      tree = this.filterCompact(tree);
    }

    // Reset and assign refs (same as getSnapshot)
    this.refMap = {};
    this.refBackendNodeMap.clear();
    this.refCounter = 0;
    this.assignRefs(tree);

    return tree;
  }

  /**
   * Register a backendNodeId found via CDP DOM queries as a new @ref.
   * Used by LocatorFinder when elements are found via CSS/XPath but not in the tree.
   */
  registerBackendNodeId(backendNodeId: number): string {
    this.refCounter++;
    const ref = `@e${this.refCounter}`;
    this.refBackendNodeMap.set(ref, backendNodeId);
    return ref;
  }

  /**
   * Get the current ref map (for debugging / API responses).
   */
  getRefMap(): RefMap {
    return this.refMap;
  }

  // ═══════════════════════════════════════════════
  // Private — Tree building
  // ═══════════════════════════════════════════════

  /**
   * Build a tree structure from CDP's flat AXNode list.
   * CDP returns a flat array where each node has a childIds array.
   */
  private buildTree(rawNodes: Record<string, any>[]): AccessibilityNode[] {
    if (rawNodes.length === 0) return [];

    // Index nodes by nodeId
    const nodeMap = new Map<string, Record<string, any>>();
    for (const raw of rawNodes) {
      nodeMap.set(raw.nodeId, raw);
    }

    // Convert a raw CDP node to our AccessibilityNode
    const convert = (raw: Record<string, any>): AccessibilityNode => {
      const role = this.extractProperty(raw, 'role') || 'none';
      const name = this.extractProperty(raw, 'name');
      const value = this.extractProperty(raw, 'value');
      const description = this.extractProperty(raw, 'description');
      const level = this.extractNumericProperty(raw, 'level');
      const focused = this.extractBooleanProperty(raw, 'focused');

      const children: AccessibilityNode[] = [];
      if (raw.childIds) {
        for (const childId of raw.childIds) {
          const childRaw = nodeMap.get(childId);
          if (childRaw) {
            children.push(convert(childRaw));
          }
        }
      }

      return {
        nodeId: raw.nodeId,
        backendDOMNodeId: raw.backendDOMNodeId,
        role,
        name: name || undefined,
        value: value || undefined,
        description: description || undefined,
        focused: focused || undefined,
        level: level || undefined,
        children,
      };
    };

    // Root is the first node
    const root = convert(rawNodes[0]);
    return [root];
  }

  // ═══════════════════════════════════════════════
  // Private — Filters
  // ═══════════════════════════════════════════════

  /**
   * Filter tree to only include interactive elements and their ancestors.
   */
  private filterInteractive(nodes: AccessibilityNode[]): AccessibilityNode[] {
    const result: AccessibilityNode[] = [];

    for (const node of nodes) {
      const filteredChildren = this.filterInteractive(node.children);
      const isInteractive = INTERACTIVE_ROLES.has(node.role);

      if (isInteractive || filteredChildren.length > 0) {
        result.push({
          ...node,
          children: isInteractive ? node.children : filteredChildren,
        });
      }
    }

    return result;
  }

  /**
   * Filter compact: remove nodes that have no name, are not interactive,
   * and have no meaningful children (i.e. structural-only containers).
   */
  private filterCompact(nodes: AccessibilityNode[]): AccessibilityNode[] {
    const result: AccessibilityNode[] = [];

    for (const node of nodes) {
      const filteredChildren = this.filterCompact(node.children);
      const hasName = !!node.name;
      const isInteractive = INTERACTIVE_ROLES.has(node.role);
      const hasValue = !!node.value;
      const hasMeaningfulChildren = filteredChildren.length > 0;

      if (hasName || isInteractive || hasValue || hasMeaningfulChildren) {
        result.push({
          ...node,
          children: filteredChildren,
        });
      }
    }

    return result;
  }

  /**
   * Filter by depth: limit tree to maxDepth levels.
   */
  private filterByDepth(nodes: AccessibilityNode[], maxDepth: number, currentDepth: number = 0): AccessibilityNode[] {
    if (currentDepth >= maxDepth) return [];

    return nodes.map(node => ({
      ...node,
      children: this.filterByDepth(node.children, maxDepth, currentDepth + 1),
    }));
  }

  /**
   * Filter by CSS selector: find the DOM element matching the selector,
   * then return only the AX subtree rooted at that element.
   */
  private async filterBySelector(tree: AccessibilityNode[], selector: string): Promise<AccessibilityNode[]> {
    // Use CDP DOM.querySelector to find the target element
    await this.devtools.sendCommand('DOM.enable', {});
    const doc = await this.devtools.sendCommand('DOM.getDocument', { depth: 0 });
    const queryResult = await this.devtools.sendCommand('DOM.querySelector', {
      nodeId: doc.root.nodeId,
      selector,
    });

    if (!queryResult.nodeId) {
      throw new Error(`Selector not found: ${selector}`);
    }

    // Get the backendNodeId of the matched element
    const nodeInfo = await this.devtools.sendCommand('DOM.describeNode', {
      nodeId: queryResult.nodeId,
    });
    const targetBackendId = nodeInfo.node?.backendNodeId;
    if (!targetBackendId) {
      throw new Error(`Cannot resolve selector: ${selector}`);
    }

    // Find the AX node with this backendDOMNodeId and return its subtree
    const found = this.findByBackendNodeId(tree, targetBackendId);
    return found ? [found] : [];
  }

  /**
   * Find an AX node by its backendDOMNodeId (recursive).
   */
  private findByBackendNodeId(nodes: AccessibilityNode[], targetId: number): AccessibilityNode | null {
    for (const node of nodes) {
      if (node.backendDOMNodeId === targetId) {
        return node;
      }
      const found = this.findByBackendNodeId(node.children, targetId);
      if (found) return found;
    }
    return null;
  }

  // ═══════════════════════════════════════════════
  // Private — Property extraction from CDP AXNodes
  // ═══════════════════════════════════════════════

  private extractProperty(raw: Record<string, any>, propName: string): string {
    if (propName === 'role' && raw.role) {
      return raw.role.value || '';
    }
    if (propName === 'name' && raw.name) {
      return raw.name.value || '';
    }
    if (propName === 'value' && raw.value) {
      return raw.value.value || '';
    }
    if (propName === 'description' && raw.description) {
      return raw.description.value || '';
    }

    if (raw.properties) {
      for (const prop of raw.properties) {
        if (prop.name === propName) {
          return prop.value?.value?.toString() || '';
        }
      }
    }
    return '';
  }

  private extractNumericProperty(raw: Record<string, any>, propName: string): number | undefined {
    if (raw.properties) {
      for (const prop of raw.properties) {
        if (prop.name === propName) {
          const val = prop.value?.value;
          return typeof val === 'number' ? val : undefined;
        }
      }
    }
    return undefined;
  }

  private extractBooleanProperty(raw: Record<string, any>, propName: string): boolean | undefined {
    if (raw.properties) {
      for (const prop of raw.properties) {
        if (prop.name === propName) {
          return prop.value?.value === true ? true : undefined;
        }
      }
    }
    return undefined;
  }

  // ═══════════════════════════════════════════════
  // Private — Ref assignment & formatting
  // ═══════════════════════════════════════════════

  /**
   * Assign @refs (@e1, @e2, ...) to all nodes in the tree.
   */
  private assignRefs(nodes: AccessibilityNode[]): void {
    for (const node of nodes) {
      if (node.name || INTERACTIVE_ROLES.has(node.role)) {
        this.refCounter++;
        const ref = `@e${this.refCounter}`;
        node.ref = ref;
        this.refMap[ref] = node.nodeId;
        if (node.backendDOMNodeId !== undefined) {
          this.refBackendNodeMap.set(ref, node.backendDOMNodeId);
        }
      }

      this.assignRefs(node.children);
    }
  }

  /**
   * Format the tree as indented text (same style as agent-browser).
   */
  private formatTree(nodes: AccessibilityNode[], indent: number = 0): string {
    const lines: string[] = [];
    const prefix = '  '.repeat(indent);

    for (const node of nodes) {
      let line = `${prefix}- ${node.role}`;

      if (node.name) {
        line += ` "${node.name}"`;
      }

      if (node.ref) {
        line += ` [${node.ref}]`;
      }

      const attrs: string[] = [];
      if (node.focused) attrs.push('(focused)');
      if (node.level !== undefined) attrs.push(`level=${node.level}`);
      if (node.value) attrs.push(`value="${node.value}"`);

      if (attrs.length > 0) {
        line += ' ' + attrs.join(' ');
      }

      lines.push(line);

      if (node.children.length > 0) {
        lines.push(this.formatTree(node.children, indent + 1));
      }
    }

    return lines.join('\n');
  }

  /**
   * Count total nodes in the tree.
   */
  private countNodes(nodes: AccessibilityNode[]): number {
    let count = 0;
    for (const node of nodes) {
      count++;
      count += this.countNodes(node.children);
    }
    return count;
  }

  // ═══════════════════════════════════════════════
  // Private — Input helpers
  // ═══════════════════════════════════════════════

  /**
   * Perform a click at (x, y) using sendInputEvent (Event.isTrusted = true).
   * Same pattern as humanizedClick in src/input/humanized.ts.
   */
  private performClick(wc: Electron.WebContents, x: number, y: number): void {
    wc.sendInputEvent({ type: 'mouseMove', x, y });
    wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup — called from will-quit handler.
   */
  destroy(): void {
    this.refMap = {};
    this.refBackendNodeMap.clear();
    this.refCounter = 0;
    this.devtools.unsubscribe('snapshot-nav-reset');
  }
}
