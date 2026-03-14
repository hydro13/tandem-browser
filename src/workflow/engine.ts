import type { BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { tandemDir } from '../utils/paths';
import { DEFAULT_TIMEOUT_MS } from '../utils/constants';
import { humanizedClick, humanizedType } from '../input/humanized';
import { createLogger } from '../utils/logger';
import { assertSinglePathSegment, resolvePathWithinRoot } from '../utils/security';

const log = createLogger('WorkflowEngine');

type WorkflowVariables = Record<string, unknown>;
type WorkflowStepResult = unknown;

interface ConditionExecutionResult {
  condition: boolean;
  action: 'continue' | 'goto' | 'skip' | 'abort';
  gotoStep?: string;
  skipCount?: number;
}

interface WorkflowStep {
  id: string;
  type: 'navigate' | 'wait' | 'click' | 'type' | 'extract' | 'screenshot' | 'condition' | 'scroll';
  params: Record<string, unknown>;
  description?: string;
  retries?: number;
  timeout?: number;
}

interface NavigateStep extends WorkflowStep {
  type: 'navigate';
  params: {
    url: string;
    waitForLoad?: boolean;
  };
}

interface WaitStep extends WorkflowStep {
  type: 'wait';
  params: {
    duration: number; // milliseconds
    condition?: 'element' | 'text' | 'url';
    selector?: string;
    text?: string;
    urlPattern?: string;
  };
}

interface ClickStep extends WorkflowStep {
  type: 'click';
  params: {
    selector: string;
    waitAfter?: number;
    scrollIntoView?: boolean;
  };
}

interface TypeStep extends WorkflowStep {
  type: 'type';
  params: {
    selector: string;
    text: string;
    clear?: boolean;
    submit?: boolean;
  };
}

interface ExtractStep extends WorkflowStep {
  type: 'extract';
  params: {
    selector?: string;
    attribute?: string;
    saveAs: string; // Variable name to store result
  };
}

interface ScreenshotStep extends WorkflowStep {
  type: 'screenshot';
  params: {
    filename?: string;
    fullPage?: boolean;
    saveAs?: string;
  };
}

interface ScrollStep extends WorkflowStep {
  type: 'scroll';
  params: {
    direction: 'up' | 'down' | 'top' | 'bottom';
    amount?: number; // pixels or percentage
  };
}

interface ConditionStep extends WorkflowStep {
  type: 'condition';
  params: {
    condition: 'elementExists' | 'textContains' | 'urlMatches' | 'variableEquals';
    selector?: string;
    text?: string;
    urlPattern?: string;
    variable?: string;
    value?: unknown;
    onTrue: 'continue' | 'goto' | 'skip' | 'abort';
    onFalse: 'continue' | 'goto' | 'skip' | 'abort';
    gotoStep?: string; // Step ID to jump to
    skipCount?: number; // Number of steps to skip
  };
}

interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  variables?: WorkflowVariables;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'running' | 'completed' | 'failed' | 'aborted';
  currentStep: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
  variables: WorkflowVariables;
  stepResults: Array<{
    stepId: string;
    status: 'completed' | 'failed' | 'skipped';
    result?: WorkflowStepResult;
    error?: string;
    executedAt: string;
  }>;
}

export class WorkflowEngine {
  private workflowsDir: string;
  private executions: Map<string, WorkflowExecution> = new Map();

  constructor() {
    this.workflowsDir = tandemDir('workflows');
    this.ensureDirectories();
    this.loadWorkflows();
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.workflowsDir)) {
      fs.mkdirSync(this.workflowsDir, { recursive: true });
    }
  }

  private loadWorkflows(): void {
    // Load any saved executions if needed
  }

  private getWorkflowPath(id: string): string {
    const safeId = assertSinglePathSegment(id, 'workflow id');
    return resolvePathWithinRoot(this.workflowsDir, `${safeId}.json`);
  }

  /**
   * Get all workflow templates
   */
  async getWorkflows(): Promise<WorkflowDefinition[]> {
    try {
      const files = fs.readdirSync(this.workflowsDir);
      const workflows: WorkflowDefinition[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = resolvePathWithinRoot(this.workflowsDir, file);
          const content = fs.readFileSync(filePath, 'utf8');
          const workflow = JSON.parse(content) as WorkflowDefinition;
          workflows.push(workflow);
        }
      }

      return workflows;
    } catch (error) {
      log.error('Failed to load workflows:', error);
      return [];
    }
  }

  /**
   * Save workflow template
   */
  async saveWorkflow(workflow: Omit<WorkflowDefinition, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const id = this.generateId();
    const now = new Date().toISOString();
    
    const workflowDef: WorkflowDefinition = {
      ...workflow,
      id,
      createdAt: now,
      updatedAt: now
    };

    const filepath = this.getWorkflowPath(id);
    
    fs.writeFileSync(filepath, JSON.stringify(workflowDef, null, 2));
    
    return id;
  }

  /**
   * Delete workflow template
   */
  async deleteWorkflow(id: string): Promise<void> {
    const filepath = this.getWorkflowPath(id);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
  }

  /**
   * Start workflow execution
   */
  async runWorkflow(workflowId: string, webview: BrowserWindow, initialVariables: WorkflowVariables = {}): Promise<string> {
    const workflows = await this.getWorkflows();
    const workflow = workflows.find(w => w.id === workflowId);
    
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const executionId = this.generateId();
    const execution: WorkflowExecution = {
      id: executionId,
      workflowId,
      status: 'running',
      currentStep: 0,
      startedAt: new Date().toISOString(),
      variables: { ...workflow.variables, ...initialVariables },
      stepResults: []
    };

    this.executions.set(executionId, execution);

    // Start execution in background
    this.executeWorkflow(execution, workflow, webview).catch(error => {
      execution.status = 'failed';
      execution.error = error.message;
      execution.completedAt = new Date().toISOString();
    });

    return executionId;
  }

  /**
   * Stop workflow execution
   */
  async stopWorkflow(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (execution && execution.status === 'running') {
      execution.status = 'aborted';
      execution.completedAt = new Date().toISOString();
    }
  }

  /**
   * Get workflow execution status
   */
  async getExecutionStatus(executionId: string): Promise<WorkflowExecution | null> {
    return this.executions.get(executionId) || null;
  }

  /**
   * Get all running executions
   */
  async getRunningExecutions(): Promise<WorkflowExecution[]> {
    return Array.from(this.executions.values()).filter(e => e.status === 'running');
  }

  private async executeWorkflow(execution: WorkflowExecution, workflow: WorkflowDefinition, webview: BrowserWindow): Promise<void> {
    try {
      let stepIndex = execution.currentStep;

      while (stepIndex < workflow.steps.length && execution.status === 'running') {
        const step = workflow.steps[stepIndex];
        execution.currentStep = stepIndex;

        log.info(`Executing step ${stepIndex + 1}/${workflow.steps.length}: ${step.type} - ${step.description || step.id}`);

        try {
          const result = await this.executeStep(step, execution, webview);
          
          execution.stepResults.push({
            stepId: step.id,
            status: 'completed',
            result,
            executedAt: new Date().toISOString()
          });

          // Handle condition step results
          if (step.type === 'condition' && result) {
            const conditionResult = result as ConditionExecutionResult;
            
            if (conditionResult.action === 'goto' && conditionResult.gotoStep) {
              const gotoIndex = workflow.steps.findIndex(s => s.id === conditionResult.gotoStep);
              if (gotoIndex !== -1) {
                stepIndex = gotoIndex;
                continue;
              }
            } else if (conditionResult.action === 'skip' && conditionResult.skipCount) {
              stepIndex += conditionResult.skipCount;
              continue;
            } else if (conditionResult.action === 'abort') {
              execution.status = 'aborted';
              break;
            }
          }

          stepIndex++;
        } catch (stepError) {
          log.error(`Step ${step.id} failed:`, stepError);

          execution.stepResults.push({
            stepId: step.id,
            status: 'failed',
            error: stepError instanceof Error ? stepError.message : String(stepError),
            executedAt: new Date().toISOString()
          });

          // Retry logic
          const retries = step.retries || 0;
          if (retries > 0) {
            step.retries = retries - 1;
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait before retry
            continue; // Retry the same step
          }

          throw stepError;
        }
      }

      if (execution.status === 'running') {
        execution.status = 'completed';
      }
      execution.completedAt = new Date().toISOString();

    } catch (error) {
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : String(error);
      execution.completedAt = new Date().toISOString();
      throw error;
    }
  }

  private async executeStep(step: WorkflowStep, execution: WorkflowExecution, webview: BrowserWindow): Promise<WorkflowStepResult> {
    const timeout = step.timeout || DEFAULT_TIMEOUT_MS;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Step ${step.id} timed out after ${timeout}ms`));
      }, timeout);

      (async () => {
        let result;

        switch (step.type) {
          case 'navigate':
            result = await this.executeNavigate(step as NavigateStep, webview);
            break;
          case 'wait':
            result = await this.executeWait(step as WaitStep, webview);
            break;
          case 'click':
            result = await this.executeClick(step as ClickStep, webview);
            break;
          case 'type':
            result = await this.executeType(step as TypeStep, webview);
            break;
          case 'extract':
            result = await this.executeExtract(step as ExtractStep, execution, webview);
            break;
          case 'screenshot':
            result = await this.executeScreenshot(step as ScreenshotStep, webview);
            break;
          case 'scroll':
            result = await this.executeScroll(step as ScrollStep, webview);
            break;
          case 'condition':
            result = await this.executeCondition(step as ConditionStep, execution, webview);
            break;
          default:
            throw new Error(`Unknown step type: ${step.type}`);
        }

        clearTimeout(timer);
        resolve(result);
      })().catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  private async executeNavigate(step: NavigateStep, webview: BrowserWindow): Promise<void> {
    await webview.webContents.loadURL(step.params.url);
    
    if (step.params.waitForLoad !== false) {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Navigation timeout')), DEFAULT_TIMEOUT_MS);
        
        webview.webContents.once('did-finish-load', () => {
          clearTimeout(timeout);
          resolve(void 0);
        });
        
        webview.webContents.once('did-fail-load', (event, errorCode, errorDescription) => {
          clearTimeout(timeout);
          reject(new Error(`Navigation failed: ${errorDescription}`));
        });
      });
    }
  }

  private async executeWait(step: WaitStep, webview: BrowserWindow): Promise<void> {
    if (step.params.condition) {
      // Wait for condition
      const startTime = Date.now();
      const maxWait = step.params.duration || 10000;
      
      while (Date.now() - startTime < maxWait) {
        const conditionMet = await this.checkCondition(step.params, webview);
        if (conditionMet) {
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      throw new Error(`Wait condition not met within ${maxWait}ms`);
    } else {
      // Simple wait
      await new Promise(resolve => setTimeout(resolve, step.params.duration));
    }
  }

  private async executeClick(step: ClickStep, webview: BrowserWindow): Promise<void> {
    if (step.params.scrollIntoView) {
      await webview.webContents.executeJavaScript(`
        const element = document.querySelector(${JSON.stringify(step.params.selector)});
        if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      `);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Verify element exists and is visible before clicking
    const elementInfo = await webview.webContents.executeJavaScript(`
      (() => {
        const element = document.querySelector(${JSON.stringify(step.params.selector)});
        if (!element) throw new Error('Element not found: ' + ${JSON.stringify(step.params.selector)});
        const rect = element.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          visible: rect.width > 0 && rect.height > 0
        };
      })()
    `);

    if (!elementInfo.visible) {
      throw new Error(`Element not visible: ${step.params.selector}`);
    }

    // Use humanizedClick for isTrusted: true events via sendInputEvent
    await humanizedClick(webview.webContents, step.params.selector);
    
    if (step.params.waitAfter) {
      await new Promise(resolve => setTimeout(resolve, step.params.waitAfter));
    }
  }

  private async executeType(step: TypeStep, webview: BrowserWindow): Promise<void> {
    // Use humanizedType which handles focus, clear, and typing via sendInputEvent (isTrusted: true)
    await humanizedType(webview.webContents, step.params.selector, step.params.text, !!step.params.clear);

    if (step.params.submit) {
      // Submit via sendInputEvent Enter key (isTrusted: true)
      webview.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
      webview.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
    }
  }

  private async executeExtract(step: ExtractStep, execution: WorkflowExecution, webview: BrowserWindow): Promise<WorkflowStepResult> {
    const result = await webview.webContents.executeJavaScript(`
      (() => {
        const selector = ${JSON.stringify(step.params.selector || 'body')};
        const attribute = ${JSON.stringify(step.params.attribute || '')};
        
        const element = document.querySelector(selector);
        if (!element) return null;
        
        if (attribute) {
          return element.getAttribute(attribute);
        } else {
          return element.textContent || element.innerText;
        }
      })()
    `);

    // Store in variables
    execution.variables[step.params.saveAs] = result;
    return result;
  }

  private async executeScreenshot(step: ScreenshotStep, webview: BrowserWindow): Promise<string> {
    const image = await webview.webContents.capturePage();
    const buffer = image.toPNG();
    
    const filename = step.params.filename || `workflow-${Date.now()}.png`;
    const screenshotsDir = tandemDir('screenshots');
    
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
    
    const filepath = path.join(screenshotsDir, filename);
    fs.writeFileSync(filepath, buffer);
    
    if (step.params.saveAs) {
      // Store path in variables
    }
    
    return filepath;
  }

  private async executeScroll(step: ScrollStep, webview: BrowserWindow): Promise<void> {
    await webview.webContents.executeJavaScript(`
      const direction = ${JSON.stringify(step.params.direction)};
      const amount = ${JSON.stringify(step.params.amount || 300)};
      
      switch (direction) {
        case 'up':
          window.scrollBy(0, -amount);
          break;
        case 'down':
          window.scrollBy(0, amount);
          break;
        case 'top':
          window.scrollTo(0, 0);
          break;
        case 'bottom':
          window.scrollTo(0, document.body.scrollHeight);
          break;
      }
    `);
  }

  private async executeCondition(step: ConditionStep, execution: WorkflowExecution, webview: BrowserWindow): Promise<ConditionExecutionResult> {
    let conditionResult = false;

    switch (step.params.condition) {
      case 'elementExists':
        conditionResult = await webview.webContents.executeJavaScript(`
          !!document.querySelector(${JSON.stringify(step.params.selector)});
        `);
        break;
      case 'textContains':
        conditionResult = await webview.webContents.executeJavaScript(`
          document.body.textContent.includes(${JSON.stringify(step.params.text)});
        `);
        break;
      case 'urlMatches':
        conditionResult = new RegExp(step.params.urlPattern!).test(webview.webContents.getURL());
        break;
      case 'variableEquals':
        conditionResult = execution.variables[step.params.variable!] === step.params.value;
        break;
    }

    const action = conditionResult ? step.params.onTrue : step.params.onFalse;
    
    return {
      condition: conditionResult,
      action,
      gotoStep: step.params.gotoStep,
      skipCount: step.params.skipCount
    };
  }

  private async checkCondition(params: WaitStep['params'], webview: BrowserWindow): Promise<boolean> {
    switch (params.condition) {
      case 'element':
        return await webview.webContents.executeJavaScript(`
          !!document.querySelector(${JSON.stringify(params.selector)});
        `);
      case 'text':
        return await webview.webContents.executeJavaScript(`
          document.body.textContent.includes(${JSON.stringify(params.text)});
        `);
      case 'url':
        return !!params.urlPattern && new RegExp(params.urlPattern).test(webview.webContents.getURL());
      default:
        return false;
    }
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }
}
