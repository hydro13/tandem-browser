/**
 * ManagerRegistry — single source of truth for all shared manager instances.
 *
 * Replaces the 35+ param TandemAPIOptions object and the duplicate RouteContext interface.
 * Built once in main.ts, passed to TandemAPI, and used as RouteContext for route handlers.
 */
import type { AgentTrustStore } from './security/agent-trust';
import type { TabManager } from './tabs/manager';
import type { PanelManager } from './panel/manager';
import type { DrawOverlayManager } from './draw/overlay';
import type { ActivityTracker } from './activity/tracker';
import type { VoiceManager } from './voice/recognition';
import type { BehaviorObserver } from './behavior/observer';
import type { ConfigManager } from './config/manager';
import type { SiteMemoryManager } from './memory/site-memory';
import type { WatchManager } from './watch/watcher';
import type { HeadlessManager } from './headless/manager';
import type { FormMemoryManager } from './memory/form-memory';
import type { ContextBridge } from './bridge/context-bridge';
import type { PiPManager } from './pip/manager';
import type { NetworkInspector } from './network/inspector';
import type { ChromeImporter } from './import/chrome-importer';
import type { BookmarkManager } from './bookmarks/manager';
import type { HistoryManager } from './history/manager';
import type { DownloadManager } from './downloads/manager';
import type { VideoRecorderManager } from './video/recorder';
import type { ExtensionLoader } from './extensions/loader';
import type { ExtensionManager } from './extensions/manager';
import type { ClaroNoteManager } from './claronote/manager';
import type { ContentExtractor } from './content/extractor';
import type { WorkflowEngine } from './workflow/engine';
import type { LoginManager } from './auth/login-manager';
import type { EventStreamManager } from './events/stream';
import type { HandoffManager } from './handoffs/manager';
import type { TaskManager } from './agents/task-manager';
import type { TaskHandoffCoordinator } from './agents/task-handoff-coordinator';
import type { TabLockManager } from './agents/tab-lock-manager';
import type { DevToolsManager } from './devtools/manager';
import type { WingmanStream } from './activity/wingman-stream';
import type { SecurityManager } from './security/security-manager';
import type { SnapshotManager } from './snapshot/manager';
import type { NetworkMocker } from './network/mocker';
import type { SessionManager } from './sessions/manager';
import type { StateManager } from './sessions/state';
import type { ScriptInjector } from './scripts/injector';
import type { LocatorFinder } from './locators/finder';
import type { DeviceEmulator } from './device/emulator';
import type { SidebarManager } from './sidebar/manager';
import type { WorkspaceManager } from './workspaces/manager';
import type { SyncManager } from './sync/manager';
import type { PinboardManager } from './pinboards/manager';
import type { ClipboardManager } from './clipboard/manager';
import type { GooglePhotosManager } from './integrations/google-photos';
import type { PairingManager } from './pairing/manager';

export interface ManagerRegistry {
  /** Tab lifecycle, grouping, metadata, and focus tracking. See src/tabs/manager.ts */
  tabManager: TabManager;
  /** Wingman panel with activity events and chat messages. See src/panel/manager.ts */
  panelManager: PanelManager;
  /** Transparent annotation canvas overlay for drawing and screenshots. See src/draw/overlay.ts */
  drawManager: DrawOverlayManager;
  /** Tracks browser activities and sends filtered events to the Wingman stream. See src/activity/tracker.ts */
  activityTracker: ActivityTracker;
  /** Voice input via Web Speech API running in the Electron shell. See src/voice/recognition.ts */
  voiceManager: VoiceManager;
  /** Passive user behavior tracking (clicks, scrolls, keyboard, navigation). See src/behavior/observer.ts */
  behaviorObserver: BehaviorObserver;
  /** All configurable settings stored in ~/.tandem/config.json. See src/config/manager.ts */
  configManager: ConfigManager;
  /** Per-domain site memory with structured data and change detection. See src/memory/site-memory.ts */
  siteMemory: SiteMemoryManager;
  /** Scheduled background page watching with change detection and notifications. See src/watch/watcher.ts */
  watchManager: WatchManager;
  /** Headless browser sessions for background scraping and testing. See src/headless/manager.ts */
  headlessManager: HeadlessManager;
  /** Per-domain form data memory with encrypted password storage. See src/memory/form-memory.ts */
  formMemory: FormMemoryManager;
  /** Makes Tandem-read context available to external tools via API snapshots. See src/bridge/context-bridge.ts */
  contextBridge: ContextBridge;
  /** Picture-in-Picture always-on-top mini window via localhost API. See src/pip/manager.ts */
  pipManager: PiPManager;
  /** Captures and analyzes network requests with domain and API tracking. See src/network/inspector.ts */
  networkInspector: NetworkInspector;
  /** Imports and syncs bookmarks, history, and cookies from Chrome profiles. See src/import/chrome-importer.ts */
  chromeImporter: ChromeImporter;
  /** Bookmark CRUD with folder support, stored in ~/.tandem/bookmarks.json. See src/bookmarks/manager.ts */
  bookmarkManager: BookmarkManager;
  /** Auto-tracks page visits with search, max 10,000 entries FIFO. See src/history/manager.ts */
  historyManager: HistoryManager;
  /** Hooks into Electron's download system with progress tracking. See src/downloads/manager.ts */
  downloadManager: DownloadManager;
  /** Records screen and application video using ffmpeg. See src/video/recorder.ts */
  videoRecorderManager: VideoRecorderManager;
  /** Loads unpacked Chrome extensions into the browser session. See src/extensions/loader.ts */
  extensionLoader: ExtensionLoader;
  /** Orchestrates extension installation, updates, conflicts, and polyfills. See src/extensions/manager.ts */
  extensionManager: ExtensionManager;
  /** Integrates with ClaroNote API for audio note uploads and management. See src/claronote/manager.ts */
  claroNoteManager: ClaroNoteManager;
  /** Extracts structured content from web pages (articles, profiles, products). See src/content/extractor.ts */
  contentExtractor: ContentExtractor;
  /** Executes automation workflows with steps, variables, conditions, and retries. See src/workflow/engine.ts */
  workflowEngine: WorkflowEngine;
  /** Detects and tracks login status per domain using rules and heuristics. See src/auth/login-manager.ts */
  loginManager: LoginManager;
  /** In-memory stream of browser events (navigation, clicks, etc). See src/events/stream.ts */
  eventStream: EventStreamManager;
  /** Explicit human↔agent handoffs with durable status and targeting context. See src/handoffs/manager.ts */
  handoffManager: HandoffManager;
  /** AI agent task management with approval workflow and emergency stop. See src/agents/task-manager.ts */
  taskManager: TaskManager;
  /** Synchronizes task execution state with explicit human↔agent handoffs. See src/agents/task-handoff-coordinator.ts */
  taskHandoffCoordinator: TaskHandoffCoordinator;
  /** Prevents multiple agents from controlling the same tab with timeout locks. See src/agents/tab-lock-manager.ts */
  tabLockManager: TabLockManager;
  /** Chrome DevTools Protocol (CDP) access to webview tabs. See src/devtools/manager.ts */
  devToolsManager: DevToolsManager;
  /** Pushes real-time activity events to OpenClaw for AI wingman awareness. See src/activity/wingman-stream.ts */
  wingmanStream: WingmanStream;
  /** Security monitoring with threat detection, containment, and analysis. See src/security/security-manager.ts */
  securityManager: SecurityManager | null;
  /** Accessibility tree snapshots with ref IDs for element interaction. See src/snapshot/manager.ts */
  snapshotManager: SnapshotManager;
  /** Intercepts and mocks HTTP responses via CDP Fetch domain. See src/network/mocker.ts */
  networkMocker: NetworkMocker;
  /** Isolated browser sessions with separate cookies and storage. See src/sessions/manager.ts */
  sessionManager: SessionManager;
  /** Saves and loads session state (cookies) to disk with encryption. See src/sessions/state.ts */
  stateManager: StateManager;
  /** Persistent JavaScript and CSS injection into pages. See src/scripts/injector.ts */
  scriptInjector: ScriptInjector;
  /** Finds elements by semantic locators (role, text, label, placeholder). See src/locators/finder.ts */
  locatorFinder: LocatorFinder;
  /** Emulates device profiles (mobile, tablet) with user agent and viewport. See src/device/emulator.ts */
  deviceEmulator: DeviceEmulator;
  /** Sidebar configuration with sections for workspaces and utilities. See src/sidebar/manager.ts */
  sidebarManager: SidebarManager;
  /** Workspace organization for grouping and switching tab collections. See src/workspaces/manager.ts */
  workspaceManager: WorkspaceManager;
  /** Synchronizes tabs across devices using a shared filesystem. See src/sync/manager.ts */
  syncManager: SyncManager;
  /** Pinboards for collecting and organizing links, images, text, and quotes. See src/pinboards/manager.ts */
  pinboardManager: PinboardManager;
  /** Google Photos API integration for OAuth and image uploads. See src/integrations/google-photos.ts */
  googlePhotosManager: GooglePhotosManager;
  /** Reads and saves clipboard content (text, HTML, images) to disk. See src/clipboard/manager.ts */
  clipboardManager: ClipboardManager;
  /** Remote agent pairing with setup codes, binding tokens, and lifecycle management. See src/pairing/manager.ts */
  pairingManager: PairingManager;
  /** Per-agent trust tiers (T2 windows, T3 trusted domains, T4 global window) layered over approval gates. See src/security/agent-trust.ts */
  agentTrust: AgentTrustStore;
}
