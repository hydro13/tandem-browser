/**
 * X Scout Agent — Tandem Browser
 * 
 * A slow, human-paced agent that browses X.com on Robin's behalf.
 * 
 * Principles:
 * - NEVER rush. Human pace only (5-15 seconds between actions)
 * - Browse like Robin would: read, pause, scroll, think
 * - Find interesting people and tweets
 * - Prepare replies but NEVER post without approval
 * - Report findings via Tandem chat for Robin to review
 * - Stop immediately if Robin says stop
 * 
 * Architecture:
 * - Runs as a background task via Tandem API
 * - Uses humanized delays from Tandem's input system
 * - Reports via POST /chat
 * - Stores state in ~/.tandem/x-scout/
 */

import * as fs from 'fs';
import * as path from 'path';

const API = 'http://localhost:8765';
const SCOUT_DIR = path.join(process.env.HOME || '', '.tandem', 'x-scout');
const STATE_FILE = path.join(SCOUT_DIR, 'state.json');
const FINDINGS_FILE = path.join(SCOUT_DIR, 'findings.json');

// Human-like timing (milliseconds)
const TIMING = {
  betweenPages: { min: 8000, max: 20000 },      // 8-20s between navigations
  readingTime: { min: 5000, max: 15000 },         // 5-15s to "read" a page
  scrollPause: { min: 2000, max: 6000 },           // 2-6s between scrolls
  beforeAction: { min: 1000, max: 3000 },          // 1-3s before clicking
  sessionLength: { min: 300000, max: 900000 },     // 5-15 min sessions
  betweenSessions: { min: 1800000, max: 7200000 }, // 30min-2hr between sessions
};

interface ScoutState {
  running: boolean;
  lastSession: number;
  peopleFound: string[];      // handles we've already seen
  tweetsAnalyzed: string[];   // tweet IDs we've already seen
  pendingApprovals: Approval[];
  followedAccounts: string[];
  sessionCount: number;
}

interface Approval {
  id: string;
  type: 'follow' | 'reply' | 'post';
  target?: string;           // handle or tweet URL
  content?: string;          // draft reply/post text
  reason: string;            // why we recommend this
  foundAt: number;           // timestamp
  status: 'pending' | 'approved' | 'rejected';
}

interface Finding {
  type: 'person' | 'tweet' | 'trend';
  handle?: string;
  name?: string;
  bio?: string;
  followers?: string;
  tweetText?: string;
  tweetUrl?: string;
  engagement?: string;
  relevanceScore: number;    // 1-10
  reason: string;
  foundAt: number;
}

// ============ Utilities ============

function randomDelay(range: { min: number; max: number }): number {
  // Gaussian-ish distribution (more natural than uniform)
  const u1 = Math.random();
  const u2 = Math.random();
  const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const normalized = (gaussian + 3) / 6; // roughly 0-1
  const clamped = Math.max(0, Math.min(1, normalized));
  return Math.round(range.min + clamped * (range.max - range.min));
}

async function wait(range: { min: number; max: number }): Promise<void> {
  const ms = randomDelay(range);
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function api(endpoint: string, method = 'GET', body?: any): Promise<any> {
  const opts: RequestInit = { method };
  if (body) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${API}${endpoint}`, opts);
  return res.json();
}

async function navigate(url: string): Promise<void> {
  await api('/navigate', 'POST', { url });
  // Wait for page load like a human would
  await wait(TIMING.readingTime);
}

async function scroll(amount = 2): Promise<void> {
  await api('/scroll', 'POST', { direction: 'down', amount });
  await wait(TIMING.scrollPause);
}

async function screenshot(): Promise<string> {
  // Returns base64 screenshot
  const res = await fetch(`${API}/screenshot`);
  const buf = await res.arrayBuffer();
  return Buffer.from(buf).toString('base64');
}

async function getPageContent(): Promise<any> {
  return api('/page-content');
}

async function chat(text: string): Promise<void> {
  await api('/chat', 'POST', { from: 'copilot', text });
}

// ============ State Management ============

function loadState(): ScoutState {
  if (!fs.existsSync(SCOUT_DIR)) {
    fs.mkdirSync(SCOUT_DIR, { recursive: true });
  }
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  }
  return {
    running: false,
    lastSession: 0,
    peopleFound: [],
    tweetsAnalyzed: [],
    pendingApprovals: [],
    followedAccounts: [],
    sessionCount: 0,
  };
}

function saveState(state: ScoutState): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function addFinding(finding: Finding): void {
  let findings: Finding[] = [];
  if (fs.existsSync(FINDINGS_FILE)) {
    findings = JSON.parse(fs.readFileSync(FINDINGS_FILE, 'utf-8'));
  }
  findings.push(finding);
  // Keep last 200 findings
  if (findings.length > 200) findings = findings.slice(-200);
  fs.writeFileSync(FINDINGS_FILE, JSON.stringify(findings, null, 2));
}

// ============ Scout Actions ============

/**
 * Browse the timeline naturally
 * Read 3-5 tweets, note interesting ones
 */
async function browseTimeline(state: ScoutState): Promise<Finding[]> {
  const findings: Finding[] = [];
  
  await chat('🔍 Even rustig door je timeline scrollen...');
  await navigate('https://x.com/home');
  
  // Read like a human: scroll a few times, pause, read
  for (let i = 0; i < 3; i++) {
    await scroll(2 + Math.floor(Math.random() * 3));
    await wait(TIMING.readingTime); // Actually "reading"
    
    // Take screenshot to analyze what's on screen
    const img = await screenshot();
    // TODO: Send to vision model for analysis
    // For now we use page content
    const content = await getPageContent();
    
    if (content.text) {
      // Basic tweet extraction from text content
      // In production this would use screenshot + vision
      findings.push({
        type: 'tweet',
        tweetText: content.text.substring(0, 500),
        relevanceScore: 5,
        reason: 'Timeline scan',
        foundAt: Date.now(),
      });
    }
    
    await wait(TIMING.betweenPages);
  }
  
  return findings;
}

/**
 * Visit a specific profile at human pace
 */
async function visitProfile(handle: string, state: ScoutState): Promise<Finding | null> {
  await wait(TIMING.beforeAction);
  await navigate(`https://x.com/${handle}`);
  await wait(TIMING.readingTime);
  
  const img = await screenshot();
  const content = await getPageContent();
  
  // Scroll down to see recent tweets
  await scroll(2);
  await wait(TIMING.readingTime);
  
  const finding: Finding = {
    type: 'person',
    handle: `@${handle}`,
    name: content.title?.replace(' / X', '') || handle,
    relevanceScore: 5,
    reason: 'Profile visit',
    foundAt: Date.now(),
  };
  
  state.peopleFound.push(handle);
  return finding;
}

/**
 * Search for relevant content (slowly!)
 */
async function searchTopics(query: string, state: ScoutState): Promise<Finding[]> {
  const findings: Finding[] = [];
  
  await wait(TIMING.betweenPages);
  await navigate(`https://x.com/search?q=${encodeURIComponent(query)}&f=top`);
  await wait(TIMING.readingTime);
  
  // Read first page of results
  await scroll(2);
  await wait(TIMING.readingTime);
  
  return findings;
}

// ============ Main Scout Loop ============

async function runSession(state: ScoutState): Promise<void> {
  state.running = true;
  state.sessionCount++;
  state.lastSession = Date.now();
  saveState(state);
  
  await chat(`🚲 X Scout sessie #${state.sessionCount} gestart. Ik ga rustig rondkijken...`);
  
  try {
    // 1. Check timeline (2-3 min)
    const timelineFindings = await browseTimeline(state);
    
    // 2. Visit 1-2 new profiles (2-3 min each)
    const profilesToVisit: string[] = []; // TODO: dynamic selection from config/findings
    for (const handle of profilesToVisit) {
      if (!state.peopleFound.includes(handle)) {
        await wait(TIMING.betweenPages);
        const finding = await visitProfile(handle, state);
        if (finding) addFinding(finding);
      }
    }
    
    // 3. Search for 1 topic (2-3 min)
    const topics = [
      'building in public AI',
      'solo founder SaaS',
      'Claude AI coding',
      'human-AI collaboration',
      'voice AI app',
    ];
    const topic = topics[state.sessionCount % topics.length];
    await wait(TIMING.betweenPages);
    const searchFindings = await searchTopics(topic, state);
    
    // 4. Report findings via chat
    const allFindings = [...timelineFindings, ...searchFindings];
    if (allFindings.length > 0 || state.pendingApprovals.length > 0) {
      await chat(
        `📊 Sessie klaar! Gevonden:\n` +
        `- ${allFindings.length} interessante items\n` +
        `- ${state.pendingApprovals.filter(a => a.status === 'pending').length} wachten op goedkeuring\n` +
        `Ik stuur een samenvatting naar OpenClaw.`
      );
    } else {
      await chat('📊 Sessie klaar, niks bijzonders gevonden. Ik check later weer.');
    }
    
  } catch (err: any) {
    await chat(`⚠️ Scout error: ${err.message}. Ik stop even.`);
  }
  
  state.running = false;
  saveState(state);
}

// ============ API Endpoints (to be registered in Tandem) ============

export interface XScoutAPI {
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): ScoutState;
  approve(id: string): Promise<void>;
  reject(id: string): Promise<void>;
  findings(): Finding[];
  pending(): Approval[];
}

export function createXScout(): XScoutAPI {
  let state = loadState();
  let sessionTimer: NodeJS.Timeout | null = null;
  
  return {
    async start() {
      state = loadState();
      if (state.running) return;
      
      // Run first session
      await runSession(state);
      
      // Schedule next sessions
      const scheduleNext = () => {
        const delay = randomDelay(TIMING.betweenSessions);
        sessionTimer = setTimeout(async () => {
          state = loadState();
          if (!state.running) {
            await runSession(state);
          }
          scheduleNext();
        }, delay);
      };
      scheduleNext();
    },
    
    async stop() {
      if (sessionTimer) clearTimeout(sessionTimer);
      state.running = false;
      saveState(state);
      await chat('🛑 X Scout gestopt.');
    },
    
    status() {
      return loadState();
    },
    
    async approve(id: string) {
      state = loadState();
      const approval = state.pendingApprovals.find(a => a.id === id);
      if (approval) {
        approval.status = 'approved';
        saveState(state);
        await chat(`⚠️ Goedgekeurd maar niet uitgevoerd: ${approval.type} — ${approval.target || approval.content?.substring(0, 50)} (actie-uitvoering nog niet geïmplementeerd)`);
      }
    },
    
    async reject(id: string) {
      state = loadState();
      const approval = state.pendingApprovals.find(a => a.id === id);
      if (approval) {
        approval.status = 'rejected';
        saveState(state);
        await chat(`❌ Afgekeurd: ${approval.type}`);
      }
    },
    
    findings() {
      if (fs.existsSync(FINDINGS_FILE)) {
        return JSON.parse(fs.readFileSync(FINDINGS_FILE, 'utf-8'));
      }
      return [];
    },
    
    pending() {
      state = loadState();
      return state.pendingApprovals.filter(a => a.status === 'pending');
    },
  };
}
