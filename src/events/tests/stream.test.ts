import { describe, expect, it } from 'vitest';
import { EventStreamManager } from '../stream';
import { buildTabOwnershipContext } from '../../tabs/context';

describe('EventStreamManager', () => {
  it('enriches tab events with resolved workspace and actor context', () => {
    const manager = new EventStreamManager();
    manager.setContextResolver(({ tabId }) => buildTabOwnershipContext({
      source: tabId === 'tab-1' ? 'codex' : null,
      workspaceId: 'ws-codex',
      workspaceName: 'Codex',
      selectedWorkspaceId: 'ws-codex',
      selectedWorkspaceName: 'Codex',
      scope: tabId ? 'tab' : 'global',
    }));

    manager.handleTabEvent('tab-focused', {
      tabId: 'tab-1',
      url: 'https://example.com',
      title: 'Example',
    });

    expect(manager.getRecent(1)[0]).toEqual(expect.objectContaining({
      type: 'tab-focused',
      tabId: 'tab-1',
      context: {
        scope: 'tab',
        source: 'codex',
        actor: { id: 'codex', kind: 'agent' },
        workspace: {
          id: 'ws-codex',
          name: 'Codex',
          selectedId: 'ws-codex',
          selectedName: 'Codex',
          matchesSelection: true,
        },
      },
    }));
  });

  it('uses default global context when no resolver is set and no context is passed', () => {
    const manager = new EventStreamManager();

    manager.handleTabEvent('tab-opened', { tabId: undefined });

    const event = manager.getRecent(1)[0];
    expect(event.context).toBeDefined();
    expect(event.context.scope).toBe('global');
    expect(event.context.source).toBeNull();
    expect(event.context.actor.kind).toBe('unknown');
  });

  it('uses tab scope default context when tabId is present and no resolver is set', () => {
    const manager = new EventStreamManager();

    manager.handleTabEvent('tab-opened', { tabId: 'tab-99' });

    const event = manager.getRecent(1)[0];
    expect(event.context.scope).toBe('tab');
  });

  it('clears the context resolver when null is passed to setContextResolver', () => {
    const manager = new EventStreamManager();
    manager.setContextResolver(() => buildTabOwnershipContext({
      source: 'agent-x',
      scope: 'tab',
    }));
    manager.setContextResolver(null);

    manager.handleTabEvent('tab-focused', { tabId: 'tab-1' });

    const event = manager.getRecent(1)[0];
    // With no resolver the default fallback is used
    expect(event.context.source).toBeNull();
  });

  it('handleWebviewEvent emits navigation event for did-navigate', () => {
    const manager = new EventStreamManager();

    manager.handleWebviewEvent({
      type: 'did-navigate',
      tabId: 'tab-1',
      url: 'https://example.com',
      title: 'Example',
    });

    const event = manager.getRecent(1)[0];
    expect(event.type).toBe('navigation');
    expect(event.tabId).toBe('tab-1');
    expect(event.url).toBe('https://example.com');
  });

  it('handleWebviewEvent emits page-loaded event for did-finish-load', () => {
    const manager = new EventStreamManager();

    manager.handleWebviewEvent({
      type: 'did-finish-load',
      tabId: 'tab-2',
      url: 'https://example.com',
    });

    const event = manager.getRecent(1)[0];
    expect(event.type).toBe('page-loaded');
  });

  it('handleWebviewEvent emits navigation for did-navigate-in-page', () => {
    const manager = new EventStreamManager();

    manager.handleWebviewEvent({
      type: 'did-navigate-in-page',
      tabId: 'tab-3',
      url: 'https://example.com/#section',
    });

    const event = manager.getRecent(1)[0];
    expect(event.type).toBe('navigation');
    expect(event.url).toBe('https://example.com/#section');
  });

  it('handleWebviewEvent ignores did-start-navigation', () => {
    const manager = new EventStreamManager();

    manager.handleWebviewEvent({ type: 'did-start-navigation', tabId: 'tab-1' });

    expect(manager.getRecent(1)).toHaveLength(0);
  });

  it('handleWebviewEvent preserves explicit context snapshot', () => {
    const manager = new EventStreamManager();
    const snapshot = buildTabOwnershipContext({
      source: 'claude',
      workspaceId: 'ws-1',
      workspaceName: 'Dev',
      selectedWorkspaceId: 'ws-1',
      selectedWorkspaceName: 'Dev',
      scope: 'tab',
    });

    manager.handleWebviewEvent({
      type: 'did-navigate',
      tabId: 'tab-1',
      url: 'https://example.com',
      context: snapshot,
    });

    expect(manager.getRecent(1)[0].context).toEqual(snapshot);
  });

  it('handleFormSubmit emits form-submit with correct field count', () => {
    const manager = new EventStreamManager();

    manager.handleFormSubmit({
      url: 'https://example.com/login',
      tabId: 'tab-5',
      fields: ['username', 'password'],
    });

    const event = manager.getRecent(1)[0];
    expect(event.type).toBe('form-submit');
    expect(event.data).toEqual({ fieldCount: 2 });
    expect(event.tabId).toBe('tab-5');
  });

  it('handleFormSubmit sets fieldCount to 0 for non-array fields', () => {
    const manager = new EventStreamManager();

    manager.handleFormSubmit({ url: 'https://example.com', tabId: 'tab-6', fields: 'notanarray' });

    const event = manager.getRecent(1)[0];
    expect(event.data).toEqual({ fieldCount: 0 });
  });

  it('handleFormSubmit preserves explicit context', () => {
    const manager = new EventStreamManager();
    const ctx = buildTabOwnershipContext({ source: 'user', scope: 'tab' });

    manager.handleFormSubmit({ tabId: 'tab-7', context: ctx });

    expect(manager.getRecent(1)[0].context).toEqual(ctx);
  });

  it('handleScroll emits scroll event', () => {
    const manager = new EventStreamManager();

    manager.handleScroll({ tabId: 'tab-1', url: 'https://example.com' });

    const event = manager.getRecent(1)[0];
    expect(event.type).toBe('scroll');
    expect(event.tabId).toBe('tab-1');
  });

  it('handleScroll is debounced — second call within 5s is ignored', () => {
    const manager = new EventStreamManager();

    manager.handleScroll({ tabId: 'tab-1', url: 'https://example.com' });
    manager.handleScroll({ tabId: 'tab-1', url: 'https://example.com' });

    expect(manager.getRecent(10)).toHaveLength(1);
  });

  it('handleScroll preserves explicit context', () => {
    const manager = new EventStreamManager();
    const ctx = buildTabOwnershipContext({ source: 'user', scope: 'tab' });

    manager.handleScroll({ tabId: 'tab-1', context: ctx });

    expect(manager.getRecent(1)[0].context).toEqual(ctx);
  });

  it('handleError emits error event with message and extra data', () => {
    const manager = new EventStreamManager();

    manager.handleError('Something went wrong', { code: 42 });

    const event = manager.getRecent(1)[0];
    expect(event.type).toBe('error');
    expect(event.data).toEqual({ message: 'Something went wrong', code: 42 });
  });

  it('handleError attaches context when provided', () => {
    const manager = new EventStreamManager();
    const ctx = buildTabOwnershipContext({ source: 'claude', scope: 'tab' });

    manager.handleError('oops', undefined, ctx);

    expect(manager.getRecent(1)[0].context).toEqual(ctx);
  });

  it('handleError falls back to resolver when no context is passed', () => {
    const manager = new EventStreamManager();
    manager.setContextResolver(() => buildTabOwnershipContext({
      source: 'codex',
      workspaceId: 'ws-2',
      selectedWorkspaceId: 'ws-2',
      scope: 'global',
    }));

    manager.handleError('something broke');

    const event = manager.getRecent(1)[0];
    expect(event.context.source).toBe('codex');
  });

  it('keeps explicit event context when a caller passes a snapshot', () => {
    const manager = new EventStreamManager();
    manager.setContextResolver(() => buildTabOwnershipContext({
      source: 'resolver-source',
      workspaceId: 'ws-resolver',
      workspaceName: 'Resolver',
      selectedWorkspaceId: 'ws-resolver',
      selectedWorkspaceName: 'Resolver',
      scope: 'tab',
    }));

    manager.handleTabEvent('tab-closed', {
      tabId: 'tab-1',
      context: buildTabOwnershipContext({
        source: 'claude',
        workspaceId: 'ws-claude',
        workspaceName: 'Claude',
        selectedWorkspaceId: 'ws-codex',
        selectedWorkspaceName: 'Codex',
        scope: 'tab',
      }),
    });

    expect(manager.getRecent(1)[0].context).toEqual({
      scope: 'tab',
      source: 'claude',
      actor: { id: 'claude', kind: 'agent' },
      workspace: {
        id: 'ws-claude',
        name: 'Claude',
        selectedId: 'ws-codex',
        selectedName: 'Codex',
        matchesSelection: false,
      },
    });
  });
});
