import { session } from 'electron';
import type { Session } from './types';
import { DEFAULT_PARTITION } from '../utils/constants';

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private activeSession = 'default';

  constructor() {
    // Register default session (Robin's persist:tandem)
    this.sessions.set('default', {
      name: 'default',
      partition: DEFAULT_PARTITION,
      createdAt: Date.now(),
      isDefault: true,
    });
  }

  /** Create a new isolated session */
  create(name: string): Session {
    if (this.sessions.has(name)) {
      throw new Error(`Session '${name}' already exists`);
    }
    if (!name || name === 'default') {
      throw new Error('Invalid session name');
    }
    const partition = `persist:session-${name}`;
    // Touch the Electron session so it's initialized
    session.fromPartition(partition);
    const sess: Session = {
      name,
      partition,
      createdAt: Date.now(),
      isDefault: false,
    };
    this.sessions.set(name, sess);
    return sess;
  }

  /** List all sessions */
  list(): Session[] {
    return Array.from(this.sessions.values());
  }

  /** Get a session by name */
  get(name: string): Session | null {
    return this.sessions.get(name) || null;
  }

  /** Get the active session name */
  getActive(): string {
    return this.activeSession;
  }

  /** Set the active API session */
  setActive(name: string): void {
    if (!this.sessions.has(name)) {
      throw new Error(`Session '${name}' does not exist`);
    }
    this.activeSession = name;
  }

  /** Destroy a single session by name, or all sessions when called with no arguments */
  destroy(name?: string): void {
    if (name === undefined) {
      this.sessions.clear();
      return;
    }
    if (name === 'default') {
      throw new Error('Cannot destroy the default session');
    }
    if (!this.sessions.has(name)) {
      throw new Error(`Session '${name}' does not exist`);
    }
    this.sessions.delete(name);
    if (this.activeSession === name) {
      this.activeSession = 'default';
    }
  }

  /** Resolve a session name to its partition string */
  resolvePartition(sessionName?: string): string {
    const name = sessionName || this.activeSession;
    const sess = this.sessions.get(name);
    if (!sess) {
      throw new Error(`Session '${name}' does not exist`);
    }
    return sess.partition;
  }

}
