import fs from 'fs';
import { EventEmitter } from 'events';
import { ensureDir, tandemDir } from '../utils/paths';

export const HANDOFF_STATUSES = [
  'needs_human',
  'blocked',
  'waiting_approval',
  'ready_to_resume',
  'completed_review',
  'resolved',
] as const;

export type HandoffStatus = (typeof HANDOFF_STATUSES)[number];

export interface Handoff {
  id: string;
  status: HandoffStatus;
  title: string;
  body: string;
  reason: string;
  workspaceId: string | null;
  tabId: string | null;
  agentId: string | null;
  source: string | null;
  actionLabel: string | null;
  taskId: string | null;
  stepId: string | null;
  open: boolean;
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number;
}

export interface CreateHandoffInput {
  status: HandoffStatus;
  title: string;
  body?: string;
  reason?: string;
  workspaceId?: string | null;
  tabId?: string | null;
  agentId?: string | null;
  source?: string | null;
  actionLabel?: string | null;
  taskId?: string | null;
  stepId?: string | null;
  open?: boolean;
}

export interface UpdateHandoffInput {
  status?: HandoffStatus;
  title?: string;
  body?: string;
  reason?: string;
  workspaceId?: string | null;
  tabId?: string | null;
  agentId?: string | null;
  source?: string | null;
  actionLabel?: string | null;
  taskId?: string | null;
  stepId?: string | null;
  open?: boolean;
}

export interface HandoffListFilters {
  openOnly?: boolean;
  status?: HandoffStatus;
  workspaceId?: string;
  tabId?: string;
  taskId?: string;
  stepId?: string;
}

function isHandoffStatus(value: unknown): value is HandoffStatus {
  return typeof value === 'string' && HANDOFF_STATUSES.includes(value as HandoffStatus);
}

function trimText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function nullableText(value: unknown): string | null {
  const trimmed = trimText(value);
  return trimmed.length > 0 ? trimmed : null;
}

function cloneHandoff(handoff: Handoff): Handoff {
  return { ...handoff };
}

function isOpenStatus(status: HandoffStatus): boolean {
  return status !== 'resolved';
}

function sanitizeHandoff(raw: unknown): Handoff | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const value = raw as Partial<Record<keyof Handoff, unknown>>;
  if (!isHandoffStatus(value.status)) {
    return null;
  }

  const id = trimText(value.id);
  const title = trimText(value.title);
  if (!id || !title) {
    return null;
  }

  const createdAt = typeof value.createdAt === 'number' ? value.createdAt : Date.now();
  const updatedAt = typeof value.updatedAt === 'number' ? value.updatedAt : createdAt;
  const status = value.status;
  const open = typeof value.open === 'boolean' ? value.open : isOpenStatus(status);

  const handoff: Handoff = {
    id,
    status,
    title,
    body: trimText(value.body),
    reason: trimText(value.reason, 'human_help'),
    workspaceId: nullableText(value.workspaceId),
    tabId: nullableText(value.tabId),
    agentId: nullableText(value.agentId),
    source: nullableText(value.source),
    actionLabel: nullableText(value.actionLabel),
    taskId: nullableText(value.taskId),
    stepId: nullableText(value.stepId),
    open: status === 'resolved' ? false : open,
    createdAt,
    updatedAt,
  };

  if (typeof value.resolvedAt === 'number') {
    handoff.resolvedAt = value.resolvedAt;
  } else if (!handoff.open) {
    handoff.resolvedAt = updatedAt;
  }

  return handoff;
}

/**
 * HandoffManager — durable human↔agent escalation records shared across HTTP, MCP, and UI.
 */
export class HandoffManager extends EventEmitter {
  private readonly handoffsPath: string;
  private readonly handoffs = new Map<string, Handoff>();

  constructor() {
    super();
    ensureDir(tandemDir());
    this.handoffsPath = tandemDir('handoffs.json');
    this.loadFromDisk();
  }

  list(filters: HandoffListFilters = {}): Handoff[] {
    let handoffs = Array.from(this.handoffs.values());

    if (filters.openOnly) {
      handoffs = handoffs.filter(handoff => handoff.open);
    }
    if (filters.status) {
      handoffs = handoffs.filter(handoff => handoff.status === filters.status);
    }
    if (filters.workspaceId) {
      handoffs = handoffs.filter(handoff => handoff.workspaceId === filters.workspaceId);
    }
    if (filters.tabId) {
      handoffs = handoffs.filter(handoff => handoff.tabId === filters.tabId);
    }
    if (filters.taskId) {
      handoffs = handoffs.filter(handoff => handoff.taskId === filters.taskId);
    }
    if (filters.stepId) {
      handoffs = handoffs.filter(handoff => handoff.stepId === filters.stepId);
    }

    return handoffs
      .sort((a, b) => {
        if (a.open !== b.open) {
          return a.open ? -1 : 1;
        }
        return b.updatedAt - a.updatedAt;
      })
      .map(cloneHandoff);
  }

  get(id: string): Handoff | null {
    const handoff = this.handoffs.get(id);
    return handoff ? cloneHandoff(handoff) : null;
  }

  create(input: CreateHandoffInput): Handoff {
    const now = Date.now();
    const status = input.status;
    const open = status === 'resolved'
      ? false
      : typeof input.open === 'boolean'
        ? input.open
        : isOpenStatus(status);

    const handoff: Handoff = {
      id: `handoff-${now}-${Math.random().toString(36).slice(2, 8)}`,
      status,
      title: trimText(input.title, 'Agent handoff'),
      body: trimText(input.body),
      reason: trimText(input.reason, 'human_help'),
      workspaceId: nullableText(input.workspaceId),
      tabId: nullableText(input.tabId),
      agentId: nullableText(input.agentId),
      source: nullableText(input.source),
      actionLabel: nullableText(input.actionLabel),
      taskId: nullableText(input.taskId),
      stepId: nullableText(input.stepId),
      open,
      createdAt: now,
      updatedAt: now,
      resolvedAt: open ? undefined : now,
    };

    this.handoffs.set(handoff.id, handoff);
    this.saveToDisk();
    this.emit('handoff-created', cloneHandoff(handoff));
    return cloneHandoff(handoff);
  }

  update(id: string, patch: UpdateHandoffInput): Handoff | null {
    const existing = this.handoffs.get(id);
    if (!existing) {
      return null;
    }

    const nextStatus = patch.status ?? existing.status;
    const nextOpen = nextStatus === 'resolved'
      ? false
      : typeof patch.open === 'boolean'
        ? patch.open
        : existing.open;

    const updated: Handoff = {
      ...existing,
      status: nextStatus,
      title: patch.title !== undefined ? trimText(patch.title, existing.title) : existing.title,
      body: patch.body !== undefined ? trimText(patch.body) : existing.body,
      reason: patch.reason !== undefined ? trimText(patch.reason, existing.reason) : existing.reason,
      workspaceId: patch.workspaceId !== undefined ? nullableText(patch.workspaceId) : existing.workspaceId,
      tabId: patch.tabId !== undefined ? nullableText(patch.tabId) : existing.tabId,
      agentId: patch.agentId !== undefined ? nullableText(patch.agentId) : existing.agentId,
      source: patch.source !== undefined ? nullableText(patch.source) : existing.source,
      actionLabel: patch.actionLabel !== undefined ? nullableText(patch.actionLabel) : existing.actionLabel,
      taskId: patch.taskId !== undefined ? nullableText(patch.taskId) : existing.taskId,
      stepId: patch.stepId !== undefined ? nullableText(patch.stepId) : existing.stepId,
      open: nextOpen,
      updatedAt: Date.now(),
      resolvedAt: nextOpen ? undefined : (existing.resolvedAt ?? Date.now()),
    };

    this.handoffs.set(id, updated);
    this.saveToDisk();
    this.emit('handoff-updated', cloneHandoff(updated));
    return cloneHandoff(updated);
  }

  resolve(id: string): Handoff | null {
    return this.update(id, { status: 'resolved', open: false });
  }

  findOpenByTaskStep(taskId: string, stepId: string): Handoff | null {
    const match = Array.from(this.handoffs.values()).find(handoff =>
      handoff.open && handoff.taskId === taskId && handoff.stepId === stepId,
    );
    return match ? cloneHandoff(match) : null;
  }

  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(this.handoffsPath)) {
        return;
      }

      const raw = JSON.parse(fs.readFileSync(this.handoffsPath, 'utf-8'));
      if (!Array.isArray(raw)) {
        return;
      }

      for (const item of raw) {
        const handoff = sanitizeHandoff(item);
        if (handoff) {
          this.handoffs.set(handoff.id, handoff);
        }
      }
    } catch {
      this.handoffs.clear();
    }
  }

  private saveToDisk(): void {
    const serialized = JSON.stringify(
      Array.from(this.handoffs.values()).sort((a, b) => b.updatedAt - a.updatedAt),
      null,
      2,
    );
    fs.writeFileSync(this.handoffsPath, serialized);
  }
}
