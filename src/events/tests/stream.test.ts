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
