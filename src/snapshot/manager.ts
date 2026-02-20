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
  private refCounter = 0;
  private devtools: DevToolsManager;

  constructor(devtools: DevToolsManager) {
    this.devtools = devtools;
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
    const tree = this.buildTree(rawNodes);

    // Filter if requested
    let filtered = tree;
    if (options.interactive) {
      filtered = this.filterInteractive(filtered);
    }

    // Reset refs for this snapshot
    this.refMap = {};
    this.refCounter = 0;

    // Assign @refs to all nodes
    this.assignRefs(filtered);

    // Format as text
    const text = this.formatTree(filtered);

    // Count nodes
    const count = this.countNodes(filtered);

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
   * Get the current ref map (for click/fill/text operations in session 1.2).
   */
  getRefMap(): RefMap {
    return this.refMap;
  }

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

  /**
   * Extract a string property from a CDP AXNode.
   * CDP AXNodes have properties as { name: "role", value: { type: "role", value: "button" } }
   */
  private extractProperty(raw: Record<string, any>, propName: string): string {
    // Direct property (role, name, value are top-level in AXNode)
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

    // Check properties array
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

  /**
   * Filter tree to only include interactive elements and their ancestors.
   * Keeps the tree structure but removes non-interactive leaf branches.
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
   * Assign @refs (@e1, @e2, ...) to all nodes in the tree.
   * Refs are stored in the refMap for later use by click/fill/text.
   */
  private assignRefs(nodes: AccessibilityNode[]): void {
    for (const node of nodes) {
      // Assign ref to nodes that have a name or are interactive
      if (node.name || INTERACTIVE_ROLES.has(node.role)) {
        this.refCounter++;
        const ref = `@e${this.refCounter}`;
        node.ref = ref;
        this.refMap[ref] = node.nodeId;
      }

      this.assignRefs(node.children);
    }
  }

  /**
   * Format the tree as indented text (same style as agent-browser).
   *
   * Example:
   * - document [document]
   *   - heading "Tandem Browser" [@e1] level=1
   *   - button "Sign In" [@e2]
   */
  private formatTree(nodes: AccessibilityNode[], indent: number = 0): string {
    const lines: string[] = [];
    const prefix = '  '.repeat(indent);

    for (const node of nodes) {
      let line = `${prefix}- ${node.role}`;

      // Add name in quotes
      if (node.name) {
        line += ` "${node.name}"`;
      }

      // Add @ref
      if (node.ref) {
        line += ` [${node.ref}]`;
      }

      // Add extra attributes
      const attrs: string[] = [];
      if (node.focused) attrs.push('(focused)');
      if (node.level !== undefined) attrs.push(`level=${node.level}`);
      if (node.value) attrs.push(`value="${node.value}"`);

      if (attrs.length > 0) {
        line += ' ' + attrs.join(' ');
      }

      lines.push(line);

      // Recurse into children
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

  /**
   * Cleanup — called from will-quit handler.
   */
  destroy(): void {
    this.refMap = {};
    this.refCounter = 0;
  }
}
