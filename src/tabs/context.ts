export type TabSource = string;

export type ActorKind = 'human' | 'assistant' | 'agent' | 'unknown';

export interface ActorContext {
  id: string | null;
  kind: ActorKind;
}

export interface WorkspaceContextSummary {
  id: string | null;
  name: string | null;
  selectedId: string | null;
  selectedName: string | null;
  matchesSelection: boolean | null;
}

export interface TabOwnershipContext {
  scope: 'tab' | 'global';
  source: string | null;
  actor: ActorContext;
  workspace: WorkspaceContextSummary;
}

export function normalizeTabSource(source: unknown): string | null {
  if (typeof source !== 'string') {
    return null;
  }

  const trimmed = source.trim();
  return trimmed ? trimmed : null;
}

export function getActorContext(source: unknown): ActorContext {
  const normalizedSource = normalizeTabSource(source);
  if (!normalizedSource) {
    return { id: null, kind: 'unknown' };
  }

  if (normalizedSource === 'user') {
    return { id: normalizedSource, kind: 'human' };
  }

  if (normalizedSource === 'wingman') {
    return { id: normalizedSource, kind: 'assistant' };
  }

  return { id: normalizedSource, kind: 'agent' };
}

export function buildTabOwnershipContext(opts: {
  source?: unknown;
  workspaceId?: string | null;
  workspaceName?: string | null;
  selectedWorkspaceId?: string | null;
  selectedWorkspaceName?: string | null;
  scope?: 'tab' | 'global';
}): TabOwnershipContext {
  const workspaceId = opts.workspaceId ?? null;
  const selectedWorkspaceId = opts.selectedWorkspaceId ?? null;

  return {
    scope: opts.scope ?? 'tab',
    source: normalizeTabSource(opts.source),
    actor: getActorContext(opts.source),
    workspace: {
      id: workspaceId,
      name: opts.workspaceName ?? null,
      selectedId: selectedWorkspaceId,
      selectedName: opts.selectedWorkspaceName ?? null,
      matchesSelection: workspaceId && selectedWorkspaceId
        ? workspaceId === selectedWorkspaceId
        : workspaceId === null
          ? null
          : false,
    },
  };
}
