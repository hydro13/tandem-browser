/**
 * TaskManager — Agent Autonomie (Fase 4)
 *
 * Manages AI tasks, approval workflow, risk assessment, and emergency stop.
 * Tasks are persisted to ~/.tandem/tasks/ as JSON files.
 *
 * Risk levels:
 * - none: read, screenshot, scroll → auto-approve
 * - low: navigate, open tabs → auto-approve (configurable)
 * - medium: click, select → ask for unknown sites
 * - high: type, forms, purchase → always ask
 */

import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { tandemDir, ensureDir } from '../utils/paths';

// ═══════════════════════════════════════════════
// Interfaces
// ═══════════════════════════════════════════════

export type RiskLevel = 'none' | 'low' | 'medium' | 'high';
export type TaskStatus = 'pending' | 'running' | 'paused' | 'waiting-approval' | 'done' | 'failed' | 'cancelled';
export type StepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'rejected';

export interface TaskStep {
  id: string;
  description: string;
  action: { type: string; params: Record<string, any> };
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  status: StepStatus;
  result?: any;
  startedAt?: number;
  completedAt?: number;
}

export interface AITask {
  id: string;
  description: string;
  createdBy: 'robin' | 'claude' | 'openclaw';
  assignedTo: 'claude' | 'openclaw';
  status: TaskStatus;
  steps: TaskStep[];
  currentStep: number;
  results: any[];
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface ActivityEntry {
  timestamp: number;
  agent: string;
  taskId?: string;
  action: string;
  target?: string;
  riskLevel?: RiskLevel;
  approved?: boolean;
  approvedBy?: 'robin' | 'auto';
}

export interface AutonomySettings {
  autoApproveRead: boolean;
  autoApproveNavigate: boolean;
  autoApproveClick: boolean;
  autoApproveType: boolean;
  autoApproveForms: boolean;
  trustedSites: string[];
}

// ═══════════════════════════════════════════════
// Risk assessment
// ═══════════════════════════════════════════════

const ACTION_RISK: Record<string, RiskLevel> = {
  'read_page': 'none',
  'screenshot': 'none',
  'scroll': 'none',
  'get_links': 'none',
  'get_context': 'none',
  'list_tabs': 'none',
  'navigate': 'low',
  'open_tab': 'low',
  'close_tab': 'low',
  'focus_tab': 'low',
  'go_back': 'low',
  'go_forward': 'low',
  'reload': 'low',
  'click': 'medium',
  'select': 'medium',
  'execute_js': 'high',
  'type': 'high',
  'fill_form': 'high',
  'submit': 'high',
};

export function getRiskLevel(actionType: string): RiskLevel {
  return ACTION_RISK[actionType] || 'medium';
}

// ═══════════════════════════════════════════════
// TaskManager
// ═══════════════════════════════════════════════

const DEFAULT_AUTONOMY: AutonomySettings = {
  autoApproveRead: true,
  autoApproveNavigate: true,
  autoApproveClick: false,
  autoApproveType: false,
  autoApproveForms: false,
  trustedSites: ['google.com', 'wikipedia.org', 'duckduckgo.com'],
};

export class TaskManager extends EventEmitter {
  private tasksDir: string;
  private activityLog: ActivityEntry[] = [];
  private emergencyStopped = false;
  private autonomy: AutonomySettings;

  constructor() {
    super();
    this.tasksDir = ensureDir(tandemDir('tasks'));
    this.autonomy = this.loadAutonomySettings();
    this.activityLog = this.loadActivityLog();
  }

  // ── Autonomy Settings ──

  private loadAutonomySettings(): AutonomySettings {
    const settingsPath = tandemDir('autonomy-settings.json');
    try {
      if (fs.existsSync(settingsPath)) {
        const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        return { ...DEFAULT_AUTONOMY, ...raw };
      }
    } catch { /* use defaults */ }
    return { ...DEFAULT_AUTONOMY };
  }

  private saveAutonomySettings(): void {
    const settingsPath = tandemDir('autonomy-settings.json');
    try {
      fs.writeFileSync(settingsPath, JSON.stringify(this.autonomy, null, 2));
    } catch { /* silent */ }
  }

  getAutonomySettings(): AutonomySettings {
    return { ...this.autonomy };
  }

  updateAutonomySettings(patch: Partial<AutonomySettings>): AutonomySettings {
    this.autonomy = { ...this.autonomy, ...patch };
    if (patch.trustedSites) {
      this.autonomy.trustedSites = patch.trustedSites;
    }
    this.saveAutonomySettings();
    return this.getAutonomySettings();
  }

  // ── Task CRUD ──

  createTask(description: string, createdBy: AITask['createdBy'], assignedTo: AITask['assignedTo'], steps: Omit<TaskStep, 'id' | 'status'>[]): AITask {
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const task: AITask = {
      id,
      description,
      createdBy,
      assignedTo,
      status: 'pending',
      steps: steps.map((s, i) => ({
        ...s,
        id: `${id}-step-${i}`,
        status: 'pending' as StepStatus,
      })),
      currentStep: 0,
      results: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.saveTask(task);
    this.emit('task-created', task);
    return task;
  }

  getTask(id: string): AITask | null {
    const filePath = path.join(this.tasksDir, `${id}.json`);
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
    } catch { /* not found */ }
    return null;
  }

  listTasks(status?: TaskStatus): AITask[] {
    const tasks: AITask[] = [];
    try {
      const files = fs.readdirSync(this.tasksDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const task = JSON.parse(fs.readFileSync(path.join(this.tasksDir, file), 'utf-8'));
          if (!status || task.status === status) {
            tasks.push(task);
          }
        } catch { /* skip corrupt */ }
      }
    } catch { /* empty */ }
    return tasks.sort((a, b) => b.createdAt - a.createdAt);
  }

  private saveTask(task: AITask): void {
    task.updatedAt = Date.now();
    try {
      fs.writeFileSync(
        path.join(this.tasksDir, `${task.id}.json`),
        JSON.stringify(task, null, 2)
      );
    } catch { /* silent */ }
  }

  // ── Approval Logic ──

  /**
   * Check if an action needs approval based on risk level, autonomy settings, and site trust.
   */
  needsApproval(actionType: string, targetUrl?: string): boolean {
    const risk = getRiskLevel(actionType);

    // None risk = never needs approval
    if (risk === 'none' && this.autonomy.autoApproveRead) return false;

    // Check trusted sites for medium risk
    if (risk === 'medium' && targetUrl) {
      try {
        const domain = new URL(targetUrl).hostname;
        const isTrusted = this.autonomy.trustedSites.some(
          site => domain === site || domain.endsWith(`.${site}`)
        );
        if (isTrusted && this.autonomy.autoApproveClick) return false;
      } catch { /* not a valid URL, require approval */ }
    }

    // Low risk
    if (risk === 'low' && this.autonomy.autoApproveNavigate) return false;

    // Medium risk click
    if (risk === 'medium' && this.autonomy.autoApproveClick) return false;

    // High risk type
    if (risk === 'high' && actionType === 'type' && this.autonomy.autoApproveType) return false;

    // High risk forms
    if (risk === 'high' && (actionType === 'fill_form' || actionType === 'submit') && this.autonomy.autoApproveForms) return false;

    // Default: require approval for medium and high
    return risk === 'medium' || risk === 'high';
  }

  /**
   * Request approval for a task step. Emits 'approval-request' event.
   * Returns a promise that resolves when Robin approves/rejects.
   */
  requestApproval(task: AITask, stepIndex: number): Promise<boolean> {
    const step = task.steps[stepIndex];
    if (!step) return Promise.resolve(false);

    task.status = 'waiting-approval';
    step.status = 'pending';
    this.saveTask(task);

    return new Promise((resolve) => {
      const requestId = `${task.id}:${step.id}`;
      this.emit('approval-request', {
        requestId,
        taskId: task.id,
        stepId: step.id,
        description: step.description,
        action: step.action,
        riskLevel: step.riskLevel,
      });

      const handler = (data: { requestId: string; approved: boolean }) => {
        if (data.requestId === requestId) {
          this.removeListener('approval-response', handler);
          resolve(data.approved);
        }
      };
      this.on('approval-response', handler);
    });
  }

  /**
   * Called when Robin approves or rejects a step.
   */
  respondToApproval(taskId: string, stepId: string, approved: boolean): void {
    const task = this.getTask(taskId);
    if (!task) return;

    const step = task.steps.find(s => s.id === stepId);
    if (!step) return;

    if (approved) {
      step.status = 'running';
      task.status = 'running';
    } else {
      step.status = 'rejected';
      task.status = 'paused';
    }
    this.saveTask(task);

    this.emit('approval-response', {
      requestId: `${taskId}:${stepId}`,
      approved,
    });

    this.logActivity({
      timestamp: Date.now(),
      agent: task.assignedTo,
      taskId: task.id,
      action: approved ? 'step-approved' : 'step-rejected',
      target: step.description,
      riskLevel: step.riskLevel,
      approved,
      approvedBy: 'robin',
    });
  }

  // ── Task Execution Updates ──

  updateStepStatus(taskId: string, stepIndex: number, status: StepStatus, result?: any): AITask | null {
    const task = this.getTask(taskId);
    if (!task || !task.steps[stepIndex]) return null;

    task.steps[stepIndex].status = status;
    if (result !== undefined) {
      task.steps[stepIndex].result = result;
      task.results[stepIndex] = result;
    }
    if (status === 'running') task.steps[stepIndex].startedAt = Date.now();
    if (status === 'done' || status === 'skipped' || status === 'rejected') {
      task.steps[stepIndex].completedAt = Date.now();
    }

    // Update task status
    const allDone = task.steps.every(s => s.status === 'done' || s.status === 'skipped');
    const anyFailed = task.steps.some(s => s.status === 'rejected');
    if (allDone) {
      task.status = 'done';
      task.completedAt = Date.now();
    } else if (anyFailed) {
      task.status = 'paused';
    }

    this.saveTask(task);
    this.emit('task-updated', task);
    return task;
  }

  markTaskRunning(taskId: string): void {
    const task = this.getTask(taskId);
    if (task) {
      task.status = 'running';
      this.saveTask(task);
      this.emit('task-updated', task);
    }
  }

  markTaskDone(taskId: string, results?: any[]): void {
    const task = this.getTask(taskId);
    if (task) {
      task.status = 'done';
      task.completedAt = Date.now();
      if (results) task.results = results;
      this.saveTask(task);
      this.emit('task-updated', task);
    }
  }

  markTaskFailed(taskId: string, error: string): void {
    const task = this.getTask(taskId);
    if (task) {
      task.status = 'failed';
      task.completedAt = Date.now();
      task.results.push({ error });
      this.saveTask(task);
      this.emit('task-updated', task);
    }
  }

  // ── Emergency Stop ──

  emergencyStop(): { stopped: number } {
    this.emergencyStopped = true;
    let stopped = 0;

    const tasks = this.listTasks();
    for (const task of tasks) {
      if (task.status === 'running' || task.status === 'waiting-approval' || task.status === 'pending') {
        task.status = 'paused';
        // Pause any running steps
        for (const step of task.steps) {
          if (step.status === 'running') step.status = 'pending';
        }
        this.saveTask(task);
        stopped++;
      }
    }

    this.emit('emergency-stop', { stopped });

    this.logActivity({
      timestamp: Date.now(),
      agent: 'system',
      action: 'emergency-stop',
      target: `${stopped} tasks paused`,
      approvedBy: 'robin',
    });

    // Auto-reset after a brief moment so new tasks can be created
    setTimeout(() => { this.emergencyStopped = false; }, 1000);

    return { stopped };
  }

  isEmergencyStopped(): boolean {
    return this.emergencyStopped;
  }

  // ── Activity Log ──

  private loadActivityLog(): ActivityEntry[] {
    const logPath = tandemDir('activity-log.json');
    try {
      if (fs.existsSync(logPath)) {
        const entries = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
        // Keep last 500 entries
        return Array.isArray(entries) ? entries.slice(-500) : [];
      }
    } catch { /* fresh start */ }
    return [];
  }

  private saveActivityLog(): void {
    const logPath = tandemDir('activity-log.json');
    try {
      // Keep last 500 entries
      const trimmed = this.activityLog.slice(-500);
      fs.writeFileSync(logPath, JSON.stringify(trimmed, null, 2));
    } catch { /* silent */ }
  }

  logActivity(entry: ActivityEntry): void {
    this.activityLog.push(entry);
    this.saveActivityLog();
    this.emit('activity', entry);
  }

  getActivityLog(limit = 50): ActivityEntry[] {
    return this.activityLog.slice(-limit);
  }

  // ── Cleanup ──

  destroy(): void {
    this.emergencyStop();
    this.removeAllListeners();
  }
}
