import type { DevToolsManager } from '../devtools/manager';
import { behaviorReplay } from '../behavior/replay';
import { InteractionTargetNotFoundError } from '../interaction/errors';
import {
  captureNavigationState,
  hasObservableInteractionEffect,
  readPageState,
  type InteractionElementState,
  type NavigationState,
  type PageState,
  type WaitForNavigationOptions,
} from '../interaction/page-state';
import type { AccessibilityNode, RefMap, SnapshotOptions, SnapshotResult } from './types';

/** Roles considered interactive (buttons, inputs, links, etc.) */
const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'checkbox', 'radio',
  'combobox', 'menuitem', 'tab', 'searchbox',
]);

// ─── Types ───────────────────────────────────────────────────────────────────

interface CDPAXValue {
  value?: string | number | boolean;
}

interface CDPAXProperty {
  name: string;
  value?: CDPAXValue;
}

interface CDPAXNode {
  nodeId: string;
  backendDOMNodeId?: number;
  childIds?: string[];
  role?: CDPAXValue;
  name?: CDPAXValue;
  value?: CDPAXValue;
  description?: CDPAXValue;
  properties?: CDPAXProperty[];
}

const MAX_TYPED_CHARS = 10_000;
const DEFAULT_CONFIRM_TIMEOUT_MS = 700;

interface RefTarget {
  backendNodeId: number;
  wcId: number | null;
}

interface DOMBoxModelResponse {
  model?: {
    content?: number[];
  };
}

interface DOMResolveNodeResponse {
  object?: {
    objectId?: string;
  };
}

interface RuntimeCallFunctionResponse {
  result?: {
    value?: unknown;
  };
}

export interface SnapshotActionOptions extends WaitForNavigationOptions {
  confirm?: boolean;
  confirmTimeoutMs?: number;
}

export interface SnapshotActionResult {
  ok: true;
  ref: string;
  wcId: number | null;
  target: {
    kind: 'ref';
    ref: string;
    resolved: true;
    tagName: string | null;
    text: string | null;
  };
  completion: {
    dispatchCompleted: boolean;
    effectConfirmed: boolean;
    mode: 'confirmed' | 'dispatched';
    caveat?: string;
  };
  postAction: {
    page: PageState;
    element: (InteractionElementState & { role: string | null }) | null;
    navigation?: NavigationState;
    observedAfterMs?: number;
  };
}

// ─── Manager ─────────────────────────────────────────────────────────────────

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

  // === 1. Private state ===

  private refMap: RefMap = {};
  private refTargets: Map<string, RefTarget> = new Map();
  private refCounter = 0;
  private devtools: DevToolsManager;
  private subscribedToNavigation = false;

  // === 2. Constructor ===

  constructor(devtools: DevToolsManager) {
    this.devtools = devtools;
    this.setupNavigationReset();
  }

  // === 4. Public methods ===

  /**
   * Get an accessibility tree snapshot of the current page.
   */
  async getSnapshot(options: SnapshotOptions): Promise<SnapshotResult> {
    // If a specific tab is requested, attach DevTools to it and use sendCommandToTab
    if (options.wcId) {
      await this.devtools.attachToTab(options.wcId, { makePrimary: false });
      await this.devtools.sendCommandToTab(options.wcId, 'Accessibility.enable', {});
      const result = await this.devtools.sendCommandToTab(options.wcId, 'Accessibility.getFullAXTree', {});
      const rawNodes = (result.nodes || []) as CDPAXNode[];
      let tree = this.buildTree(rawNodes);
      if (options.selector) tree = await this.filterBySelector(tree, options.selector, options.wcId);
      if (options.interactive) tree = this.filterInteractive(tree);
      if (options.compact) tree = this.filterCompact(tree);
      if (options.depth !== undefined) tree = this.filterByDepth(tree, options.depth);
      this.clearAllRefs();
      this.assignRefs(tree, options.wcId);
      const text = this.formatTree(tree);
      const count = this.countNodes(tree);
      // Get URL from the tab
      const { webContents } = await import('electron');
      const wc = webContents.fromId(options.wcId);
      const url = wc?.getURL() ?? '';
      return { text, count, url };
    }

    // Enable Accessibility domain (idempotent)
    const attachedWc = await this.devtools.ensureAttached();
    if (!attachedWc) {
      throw new Error('No active tab');
    }
    await this.devtools.sendCommand('Accessibility.enable', {});

    // Get the full accessibility tree
    const result = await this.devtools.sendCommand('Accessibility.getFullAXTree', {});
    const rawNodes = (result.nodes || []) as CDPAXNode[];

    // Build tree from flat CDP node list
    let tree = this.buildTree(rawNodes);

    // Selector filter: scope to a CSS selector's subtree
    if (options.selector) {
      tree = await this.filterBySelector(tree, options.selector, attachedWc.id);
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
    this.clearAllRefs();

    // Assign @refs to all nodes
    this.assignRefs(tree, attachedWc.id);

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
  async clickRef(ref: string, options?: SnapshotActionOptions): Promise<SnapshotActionResult> {
    const target = this.requireRefTarget(ref);
    const { backendNodeId } = target;
    const wc = await this.getWebContentsForRef(target);
    const beforePage = await readPageState(wc);
    const beforeElement = options?.confirm === false ? null : await this.readRefElementState(target);

    // Get the box model to find element coordinates
    await this.sendCommandForRef(target, 'DOM.enable', {});
    const box = await this.sendCommandForRef<DOMBoxModelResponse>(target, 'DOM.getBoxModel', { backendNodeId });
    if (!box.model?.content) {
      throw new Error(`Cannot get box model for ${ref}`);
    }

    // Calculate center from content quad (8 values: x1,y1,x2,y2,x3,y3,x4,y4)
    const c = box.model.content;
    const x = Math.round((c[0] + c[2] + c[4] + c[6]) / 4);
    const y = Math.round((c[1] + c[3] + c[5] + c[7]) / 4);

    // Scroll element into view first
    try {
      const resolved = await this.sendCommandForRef<DOMResolveNodeResponse>(target, 'DOM.resolveNode', { backendNodeId });
      if (resolved.object?.objectId) {
        await this.sendCommandForRef(target, 'Runtime.callFunctionOn', {
          objectId: resolved.object.objectId,
          functionDeclaration: 'function() { this.scrollIntoView({ behavior: "smooth", block: "center" }); }',
          returnByValue: true,
        });
        // Re-get box model after scroll
        const box2 = await this.sendCommandForRef<DOMBoxModelResponse>(target, 'DOM.getBoxModel', { backendNodeId });
        if (box2.model?.content) {
          const c2 = box2.model.content;
          const x2 = Math.round((c2[0] + c2[2] + c2[4] + c2[6]) / 4);
          const y2 = Math.round((c2[1] + c2[3] + c2[5] + c2[7]) / 4);
          // Use updated coordinates
          await this.performClick(wc, x2, y2);
          return this.buildClickResult(ref, target, wc, beforePage, beforeElement, options);
        }
      }
    } catch {
      // fallback to original coordinates
    }

    await this.performClick(wc, x, y);
    return this.buildClickResult(ref, target, wc, beforePage, beforeElement, options);
  }

  /**
   * Fill an element by @ref with text.
   * Clicks to focus, then types char-by-char via sendInputEvent.
   */
  async fillRef(ref: string, value: string, options?: SnapshotActionOptions): Promise<SnapshotActionResult> {
    const target = this.requireRefTarget(ref);
    const { backendNodeId } = target;
    const wc = await this.getWebContentsForRef(target);

    // Get box model for clicking to focus
    await this.sendCommandForRef(target, 'DOM.enable', {});
    const box = await this.sendCommandForRef<DOMBoxModelResponse>(target, 'DOM.getBoxModel', { backendNodeId });
    if (!box.model?.content) {
      throw new Error(`Cannot get box model for ${ref}`);
    }

    const c = box.model.content;
    let x = Math.round((c[0] + c[2] + c[4] + c[6]) / 4);
    let y = Math.round((c[1] + c[3] + c[5] + c[7]) / 4);

    // Scroll into view and re-get coordinates
    try {
      const resolved = await this.sendCommandForRef<DOMResolveNodeResponse>(target, 'DOM.resolveNode', { backendNodeId });
      if (resolved.object?.objectId) {
        await this.sendCommandForRef(target, 'Runtime.callFunctionOn', {
          objectId: resolved.object.objectId,
          functionDeclaration: 'function() { this.scrollIntoView({ behavior: "smooth", block: "center" }); }',
          returnByValue: true,
        });
        const box2 = await this.sendCommandForRef<DOMBoxModelResponse>(target, 'DOM.getBoxModel', { backendNodeId });
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
    await this.performClick(wc, x, y);

    // Small delay to ensure focus
    await this.delay(100);

    // Type each character with BehaviorReplay timing (Robin's real typing rhythm)
    const chars = Array.from(value).slice(0, MAX_TYPED_CHARS);
    const preparation = await this.prepareRefForTextEntry(target);

    if (preparation.existingTextLength > 0 && !preparation.selectionPrepared) {
      await this.sendSelectAllShortcut(wc);
    }

    if (chars.length === 0) {
      await this.clearSelectedText(wc);
    }

    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const nextChar = i + 1 < chars.length ? chars[i + 1] : '';
      wc.sendInputEvent({ type: 'char', keyCode: char });
      await this.delay(behaviorReplay.getTypingDelay(char, nextChar));
    }

    const confirmation = options?.confirm === false
      ? { confirmed: false, state: await this.readRefElementState(target), observedAfterMs: 0 }
      : await this.confirmRefValue(
          target,
          value,
          options?.confirmTimeoutMs ?? DEFAULT_CONFIRM_TIMEOUT_MS,
        );
    const page = await readPageState(wc);

    return {
      ok: true,
      ref,
      wcId: target.wcId,
      target: {
        kind: 'ref',
        ref,
        resolved: true,
        tagName: confirmation.state?.tagName ?? null,
        text: confirmation.state?.text ?? null,
      },
      completion: {
        dispatchCompleted: true,
        effectConfirmed: confirmation.confirmed,
        mode: confirmation.confirmed ? 'confirmed' : 'dispatched',
        caveat: confirmation.confirmed ? undefined : options?.confirm === false
          ? 'Typing dispatch finished without post-fill value confirmation.'
          : 'Fill dispatch finished, but the requested value was not observed before the confirmation window expired.',
      },
      postAction: {
        page,
        element: confirmation.state,
        observedAfterMs: confirmation.observedAfterMs,
      },
    };
  }

  /**
   * Get the text content of an element by @ref.
   */
  async getTextRef(ref: string): Promise<string> {
    const target = this.requireRefTarget(ref);
    const { backendNodeId } = target;

    await this.sendCommandForRef(target, 'DOM.enable', {});
    const resolved = await this.sendCommandForRef<DOMResolveNodeResponse>(target, 'DOM.resolveNode', { backendNodeId });
    if (!resolved.object?.objectId) {
      throw new Error(`Cannot resolve DOM node for ${ref}`);
    }

    const textResult = await this.sendCommandForRef<RuntimeCallFunctionResponse>(target, 'Runtime.callFunctionOn', {
      objectId: resolved.object.objectId,
      functionDeclaration: 'function() { return this.innerText || this.textContent || ""; }',
      returnByValue: true,
    });

    return typeof textResult.result?.value === 'string' ? textResult.result.value : '';
  }

  /**
   * Get the accessibility tree with @refs assigned.
   * Used by LocatorFinder for semantic element search.
   */
  async getAccessibilityTree(options?: SnapshotOptions): Promise<AccessibilityNode[]> {
    const attachedWc = options?.wcId
      ? await this.devtools.attachToTab(options.wcId, { makePrimary: false })
      : await this.devtools.ensureAttached();
    if (!attachedWc) {
      throw new Error('No active tab');
    }

    if (options?.wcId) {
      await this.devtools.sendCommandToTab(options.wcId, 'Accessibility.enable', {});
    } else {
      await this.devtools.sendCommand('Accessibility.enable', {});
    }
    const result = options?.wcId
      ? await this.devtools.sendCommandToTab(options.wcId, 'Accessibility.getFullAXTree', {})
      : await this.devtools.sendCommand('Accessibility.getFullAXTree', {});
    const rawNodes = (result.nodes || []) as CDPAXNode[];
    let tree = this.buildTree(rawNodes);

    if (options?.interactive) {
      tree = this.filterInteractive(tree);
    }
    if (options?.compact) {
      tree = this.filterCompact(tree);
    }

    // Reset and assign refs (same as getSnapshot)
    this.clearAllRefs();
    this.assignRefs(tree, attachedWc.id);

    return tree;
  }

  /**
   * Register a backendNodeId found via CDP DOM queries as a new @ref.
   * Used by LocatorFinder when elements are found via CSS/XPath but not in the tree.
   */
  registerBackendNodeId(backendNodeId: number, wcId?: number | null): string {
    this.refCounter++;
    const ref = `@e${this.refCounter}`;
    const resolvedWcId = wcId ?? this.devtools.getAttachedWebContents()?.id ?? null;
    this.refTargets.set(ref, { backendNodeId, wcId: resolvedWcId });
    return ref;
  }

  /**
   * Get the current ref map (for debugging / API responses).
   */
  getRefMap(): RefMap {
    return this.refMap;
  }

  // === 6. Cleanup ===

  /**
   * Cleanup — called from will-quit handler.
   */
  destroy(): void {
    this.refMap = {};
    this.refTargets.clear();
    this.refCounter = 0;
    this.devtools.unsubscribe('snapshot-nav-reset');
  }

  // === 7. Private helpers ===

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
          const targetWcId = this.devtools.getDispatchWebContents()?.id;
          if (targetWcId) {
            this.clearRefsForTab(targetWcId);
          } else {
            this.clearAllRefs();
          }
        }
      },
    });
    this.subscribedToNavigation = true;
  }

  private clearAllRefs(): void {
    this.refMap = {};
    this.refTargets.clear();
    this.refCounter = 0;
  }

  private clearRefsForTab(wcId: number): void {
    for (const [ref, target] of Array.from(this.refTargets.entries())) {
      if (target.wcId !== wcId) continue;
      delete this.refMap[ref];
      this.refTargets.delete(ref);
    }
  }

  private requireRefTarget(ref: string): RefTarget {
    const target = this.refTargets.get(ref);
    if (!target) {
      throw new InteractionTargetNotFoundError(`Ref not found: ${ref} — call GET /snapshot first`);
    }
    return target;
  }

  private async sendCommandForRef<T = unknown>(
    refTarget: RefTarget,
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    if (refTarget.wcId) {
      return this.devtools.sendCommandToTab(refTarget.wcId, method, params) as Promise<T>;
    }
    return this.devtools.sendCommand(method, params) as Promise<T>;
  }

  private async getWebContentsForRef(refTarget: RefTarget): Promise<Electron.WebContents> {
    const wc = refTarget.wcId
      ? await this.devtools.attachToTab(refTarget.wcId, { makePrimary: false })
      : await this.devtools.ensureAttached();
    if (!wc) {
      throw new Error(refTarget.wcId ? `Tab ${refTarget.wcId} is no longer available` : 'No active tab');
    }
    return wc;
  }

  private async buildClickResult(
    ref: string,
    target: RefTarget,
    wc: Electron.WebContents,
    beforePage: PageState,
    beforeElement: (InteractionElementState & { role: string | null }) | null,
    options?: SnapshotActionOptions,
  ): Promise<SnapshotActionResult> {
    const navigation = await captureNavigationState(wc, beforePage.url, options);
    const page = await readPageState(wc);
    const element = options?.confirm === false ? null : await this.readRefElementState(target);
    const effectConfirmed = options?.confirm === false
      ? false
      : hasObservableInteractionEffect({
          beforePage,
          afterPage: page,
          navigation,
          beforeElement,
          afterElement: element,
        });

    return {
      ok: true,
      ref,
      wcId: target.wcId,
      target: {
        kind: 'ref',
        ref,
        resolved: true,
        tagName: element?.tagName ?? beforeElement?.tagName ?? null,
        text: element?.text ?? beforeElement?.text ?? null,
      },
      completion: {
        dispatchCompleted: true,
        effectConfirmed,
        mode: effectConfirmed ? 'confirmed' : 'dispatched',
        caveat: effectConfirmed ? undefined : options?.confirm === false
          ? 'Click dispatch was acknowledged without post-click confirmation.'
          : 'Click dispatch finished, but no immediate focus, value, checked, or navigation change was observable.',
      },
      postAction: {
        page,
        element,
        navigation,
      },
    };
  }

  private async readRefElementState(
    refTarget: RefTarget,
  ): Promise<(InteractionElementState & { role: string | null }) | null> {
    const resolved = await this.sendCommandForRef<DOMResolveNodeResponse>(refTarget, 'DOM.resolveNode', {
      backendNodeId: refTarget.backendNodeId,
    }).catch(() => null);
    const objectId = resolved?.object?.objectId;
    if (!objectId) {
      return null;
    }

    const stateResult = await this.sendCommandForRef<RuntimeCallFunctionResponse>(refTarget, 'Runtime.callFunctionOn', {
      objectId,
      functionDeclaration: `
        function() {
          const active = document.activeElement;
          return {
            found: true,
            tagName: this.tagName || null,
            text: (this.textContent || '').trim().slice(0, 200),
            value: typeof this.value === 'string' ? this.value.slice(0, 200) : null,
            focused: active === this,
            connected: this.isConnected !== false,
            checked: typeof this.checked === 'boolean' ? this.checked : null,
            disabled: typeof this.disabled === 'boolean' ? this.disabled : null,
            role: this.getAttribute ? this.getAttribute('role') : null
          };
        }
      `,
      returnByValue: true,
    }).catch(() => null);

    return (stateResult?.result?.value as (InteractionElementState & { role: string | null }) | undefined) ?? null;
  }

  private async prepareRefForTextEntry(
    refTarget: RefTarget,
  ): Promise<{
    focused: boolean;
    selectionPrepared: boolean;
    existingTextLength: number;
  }> {
    const resolved = await this.sendCommandForRef<DOMResolveNodeResponse>(refTarget, 'DOM.resolveNode', {
      backendNodeId: refTarget.backendNodeId,
    }).catch(() => null);
    const objectId = resolved?.object?.objectId;
    if (!objectId) {
      return { focused: false, selectionPrepared: false, existingTextLength: 0 };
    }

    const preparationResult = await this.sendCommandForRef<RuntimeCallFunctionResponse>(refTarget, 'Runtime.callFunctionOn', {
      objectId,
      functionDeclaration: `
        function() {
          if (typeof this.focus === 'function') {
            try {
              this.focus({ preventScroll: true });
            } catch {
              this.focus();
            }
          }

          let selectionPrepared = false;
          const existingTextLength = typeof this.value === 'string'
            ? this.value.length
            : typeof this.textContent === 'string'
              ? this.textContent.length
              : 0;

          if (typeof this.select === 'function') {
            try {
              this.select();
              selectionPrepared = true;
            } catch {
              // fall through
            }
          }

          if (!selectionPrepared && typeof this.setSelectionRange === 'function' && typeof this.value === 'string') {
            try {
              this.setSelectionRange(0, this.value.length);
              selectionPrepared = true;
            } catch {
              // fall through
            }
          }

          if (!selectionPrepared && this.isContentEditable) {
            try {
              const range = document.createRange();
              range.selectNodeContents(this);
              const selection = window.getSelection();
              selection?.removeAllRanges();
              selection?.addRange(range);
              selectionPrepared = true;
            } catch {
              // fall through
            }
          }

          return {
            focused: document.activeElement === this,
            selectionPrepared,
            existingTextLength,
          };
        }
      `,
      returnByValue: true,
    }).catch(() => null);

    return (preparationResult?.result?.value as {
      focused: boolean;
      selectionPrepared: boolean;
      existingTextLength: number;
    } | undefined) ?? { focused: false, selectionPrepared: false, existingTextLength: 0 };
  }

  private async sendSelectAllShortcut(wc: Electron.WebContents): Promise<void> {
    const modifiers: Electron.InputEvent['modifiers'] = process.platform === 'darwin' ? ['meta'] : ['control'];
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'a', modifiers });
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'a', modifiers });
    await this.delay(50);
  }

  private async clearSelectedText(wc: Electron.WebContents): Promise<void> {
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace' });
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'Backspace' });
    await this.delay(50);
  }

  private async confirmRefValue(
    refTarget: RefTarget,
    expectedValue: string,
    timeoutMs: number,
  ): Promise<{
    confirmed: boolean;
    state: (InteractionElementState & { role: string | null }) | null;
    observedAfterMs: number;
  }> {
    const startedAt = Date.now();
    let lastState = await this.readRefElementState(refTarget);

    while (Date.now() - startedAt <= timeoutMs) {
      if (lastState?.value === expectedValue) {
        return {
          confirmed: true,
          state: lastState,
          observedAfterMs: Date.now() - startedAt,
        };
      }

      await this.delay(50);
      lastState = await this.readRefElementState(refTarget);
    }

    return {
      confirmed: lastState?.value === expectedValue,
      state: lastState,
      observedAfterMs: Date.now() - startedAt,
    };
  }

  // ── Tree building ──

  /**
   * Build a tree structure from CDP's flat AXNode list.
   * CDP returns a flat array where each node has a childIds array.
   */
  private buildTree(rawNodes: CDPAXNode[]): AccessibilityNode[] {
    if (rawNodes.length === 0) return [];

    // Index nodes by nodeId
    const nodeMap = new Map<string, CDPAXNode>();
    for (const raw of rawNodes) {
      nodeMap.set(raw.nodeId, raw);
    }

    // Convert a raw CDP node to our AccessibilityNode
    const convert = (raw: CDPAXNode): AccessibilityNode => {
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

  // ── Filters ──

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
  private async filterBySelector(tree: AccessibilityNode[], selector: string, wcId?: number): Promise<AccessibilityNode[]> {
    // Use CDP DOM.querySelector to find the target element
    if (wcId) {
      await this.devtools.sendCommandToTab(wcId, 'DOM.enable', {});
    } else {
      await this.devtools.sendCommand('DOM.enable', {});
    }
    const doc = wcId
      ? await this.devtools.sendCommandToTab(wcId, 'DOM.getDocument', { depth: 0 })
      : await this.devtools.sendCommand('DOM.getDocument', { depth: 0 });
    const queryResult = wcId
      ? await this.devtools.sendCommandToTab(wcId, 'DOM.querySelector', {
          nodeId: doc.root.nodeId,
          selector,
        })
      : await this.devtools.sendCommand('DOM.querySelector', {
          nodeId: doc.root.nodeId,
          selector,
        });

    if (!queryResult.nodeId) {
      throw new Error(`Selector not found: ${selector}`);
    }

    // Get the backendNodeId of the matched element
    const nodeInfo = wcId
      ? await this.devtools.sendCommandToTab(wcId, 'DOM.describeNode', {
          nodeId: queryResult.nodeId,
        })
      : await this.devtools.sendCommand('DOM.describeNode', {
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

  // ── Property extraction from CDP AXNodes ──

  private extractProperty(raw: CDPAXNode, propName: string): string {
    if (propName === 'role' && raw.role) {
      return typeof raw.role.value === 'string' ? raw.role.value : String(raw.role.value ?? '');
    }
    if (propName === 'name' && raw.name) {
      return typeof raw.name.value === 'string' ? raw.name.value : String(raw.name.value ?? '');
    }
    if (propName === 'value' && raw.value) {
      return typeof raw.value.value === 'string' ? raw.value.value : String(raw.value.value ?? '');
    }
    if (propName === 'description' && raw.description) {
      return typeof raw.description.value === 'string' ? raw.description.value : String(raw.description.value ?? '');
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

  private extractNumericProperty(raw: CDPAXNode, propName: string): number | undefined {
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

  private extractBooleanProperty(raw: CDPAXNode, propName: string): boolean | undefined {
    if (raw.properties) {
      for (const prop of raw.properties) {
        if (prop.name === propName) {
          return prop.value?.value === true ? true : undefined;
        }
      }
    }
    return undefined;
  }

  // ── Ref assignment & formatting ──

  /**
   * Assign @refs (@e1, @e2, ...) to all nodes in the tree.
   */
  private assignRefs(nodes: AccessibilityNode[], wcId: number | null): void {
    for (const node of nodes) {
      if (node.name || INTERACTIVE_ROLES.has(node.role)) {
        this.refCounter++;
        const ref = `@e${this.refCounter}`;
        node.ref = ref;
        this.refMap[ref] = node.nodeId;
        if (node.backendDOMNodeId !== undefined) {
          this.refTargets.set(ref, { backendNodeId: node.backendDOMNodeId, wcId });
        }
      }

      this.assignRefs(node.children, wcId);
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

  // ── Input helpers ──

  /**
   * Perform a humanized click at (x, y) using sendInputEvent (Event.isTrusted = true).
   * Uses BehaviorReplay for mouse trajectory and Gaussian timing — mimics Robin's real input.
   */
  private async performClick(wc: Electron.WebContents, x: number, y: number): Promise<void> {
    // Small random offset — humans don't click dead center
    const offsetX = Math.round((Math.random() - 0.5) * 6);
    const offsetY = Math.round((Math.random() - 0.5) * 6);
    const tx = x + offsetX;
    const ty = y + offsetY;

    // Pre-click hesitation (hover before clicking)
    await this.delay(this.gaussian(60, 120));

    // Mouse trajectory from a nearby starting point
    const startX = Math.round(tx + (Math.random() - 0.5) * 300);
    const startY = Math.round(ty + (Math.random() - 0.5) * 200);
    const trajectory = behaviorReplay.getMouseTrajectory(startX, startY, tx, ty);
    for (const point of trajectory) {
      wc.sendInputEvent({ type: 'mouseMove', x: point.x, y: point.y });
      if (point.delayMs > 0) await this.delay(point.delayMs);
    }

    // Final hover pause before pressing
    await this.delay(this.gaussian(30, 80));

    // Mouse down
    wc.sendInputEvent({ type: 'mouseDown', x: tx, y: ty, button: 'left', clickCount: 1 });

    // Hold duration (humans don't instant-release)
    await this.delay(this.gaussian(40, 110));

    // Mouse up
    wc.sendInputEvent({ type: 'mouseUp', x: tx, y: ty, button: 'left', clickCount: 1 });
  }

  /**
   * Gaussian random value clamped between min and max.
   */
  private gaussian(min: number, max: number): number {
    const mean = (min + max) / 2;
    const stddev = (max - min) / 4;
    const u1 = Math.max(Number.EPSILON, Math.random()); // guard against log(0)
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(min, Math.min(max, Math.round(mean + z * stddev)));
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
