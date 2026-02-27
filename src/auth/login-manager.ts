import { BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { tandemDir } from '../utils/paths';

interface LoginState {
  domain: string;
  status: 'logged-in' | 'logged-out' | 'unknown';
  lastChecked: string;
  lastUpdated: string;
  username?: string;
  detectionMethod: string;
  confidence: number; // 0-100
}

interface LoginDetectionRule {
  type: 'selector' | 'url-pattern' | 'text-content' | 'cookie';
  pattern: string;
  condition: 'exists' | 'not-exists' | 'contains' | 'not-contains';
  value?: string;
  weight: number; // For confidence calculation
}

interface DomainConfig {
  domain: string;
  loginPagePatterns: string[];
  loggedInRules: LoginDetectionRule[];
  loggedOutRules: LoginDetectionRule[];
}

export class LoginManager {
  private statesFile: string;
  private configFile: string;
  private states: Map<string, LoginState> = new Map();
  private domainConfigs: Map<string, DomainConfig> = new Map();

  constructor() {
    const authDir = tandemDir('auth');
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }

    this.statesFile = path.join(authDir, 'login-states.json');
    this.configFile = path.join(authDir, 'domain-configs.json');
    
    this.loadStates();
    this.loadDomainConfigs();
    this.initializeDefaultConfigs();
  }

  /**
   * Get login state for a specific domain
   */
  async getLoginState(domain: string): Promise<LoginState> {
    const existing = this.states.get(domain);
    if (existing) {
      return existing;
    }

    // Create new unknown state
    const newState: LoginState = {
      domain,
      status: 'unknown',
      lastChecked: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      detectionMethod: 'none',
      confidence: 0
    };

    this.states.set(domain, newState);
    this.saveStates();
    return newState;
  }

  /**
   * Get all tracked login states
   */
  async getAllStates(): Promise<LoginState[]> {
    return Array.from(this.states.values());
  }

  /**
   * Check and update login state for current page
   */
  async checkCurrentPage(webview: BrowserWindow): Promise<LoginState> {
    const url = webview.webContents.getURL();
    const domain = this.extractDomain(url);
    
    const state = await this.detectLoginState(webview, domain);
    
    this.states.set(domain, state);
    this.saveStates();
    
    return state;
  }

  /**
   * Detect if current page is a login page
   */
  async isLoginPage(webview: BrowserWindow): Promise<boolean> {
    const url = webview.webContents.getURL();
    const domain = this.extractDomain(url);
    const config = this.domainConfigs.get(domain);

    // Check URL patterns
    if (config?.loginPagePatterns) {
      for (const pattern of config.loginPagePatterns) {
        if (new RegExp(pattern, 'i').test(url)) {
          return true;
        }
      }
    }

    // Generic login page detection
    return await webview.webContents.executeJavaScript(`
      (() => {
        const url = window.location.href.toLowerCase();
        const title = document.title.toLowerCase();
        
        // URL patterns
        const loginPatterns = [
          '/login', '/signin', '/sign-in', '/auth', '/authenticate',
          '/log-in', '/logon', '/log_in', '/session', '/account/login',
          'login.', 'signin.', 'auth.', 'accounts.'
        ];
        
        if (loginPatterns.some(pattern => url.includes(pattern))) {
          return true;
        }
        
        // Title patterns
        const titlePatterns = ['login', 'sign in', 'log in', 'authenticate'];
        if (titlePatterns.some(pattern => title.includes(pattern))) {
          return true;
        }
        
        // Form detection
        const passwordFields = document.querySelectorAll('input[type="password"]');
        const emailFields = document.querySelectorAll('input[type="email"], input[name*="email"], input[name*="username"], input[name*="user"]');
        
        if (passwordFields.length > 0 && emailFields.length > 0) {
          return true;
        }
        
        // Login form detection by common class names and IDs
        const loginSelectors = [
          'form[class*="login"]', 'form[id*="login"]',
          'form[class*="signin"]', 'form[id*="signin"]',
          'form[class*="auth"]', 'form[id*="auth"]',
          '.login-form', '.signin-form', '.auth-form',
          '#login-form', '#signin-form', '#auth-form'
        ];
        
        for (const selector of loginSelectors) {
          if (document.querySelector(selector)) {
            return true;
          }
        }
        
        return false;
      })()
    `);
  }

  /**
   * Update login state manually
   */
  async updateLoginState(domain: string, status: 'logged-in' | 'logged-out', username?: string): Promise<void> {
    const existing = this.states.get(domain) || await this.getLoginState(domain);
    
    existing.status = status;
    existing.lastUpdated = new Date().toISOString();
    existing.username = username;
    existing.detectionMethod = 'manual';
    existing.confidence = 100;
    
    this.states.set(domain, existing);
    this.saveStates();
  }

  /**
   * Clear login state for domain (set to unknown)
   */
  async clearLoginState(domain: string): Promise<void> {
    const state = await this.getLoginState(domain);
    state.status = 'unknown';
    state.username = undefined;
    state.lastUpdated = new Date().toISOString();
    state.detectionMethod = 'cleared';
    state.confidence = 0;
    
    this.states.set(domain, state);
    this.saveStates();
  }

  private async detectLoginState(webview: BrowserWindow, domain: string): Promise<LoginState> {
    const config = this.domainConfigs.get(domain);
    const url = webview.webContents.getURL();
    
    let loggedInScore = 0;
    let loggedOutScore = 0;
    let detectionMethods: string[] = [];

    try {
      // Check domain-specific rules if available
      if (config) {
        for (const rule of config.loggedInRules) {
          const matches = await this.checkRule(webview, rule);
          if (matches) {
            loggedInScore += rule.weight;
            detectionMethods.push(`logged-in-${rule.type}`);
          }
        }

        for (const rule of config.loggedOutRules) {
          const matches = await this.checkRule(webview, rule);
          if (matches) {
            loggedOutScore += rule.weight;
            detectionMethods.push(`logged-out-${rule.type}`);
          }
        }
      }

      // Generic detection
      const genericResult = await webview.webContents.executeJavaScript(`
        (() => {
          const indicators = {
            loggedIn: [],
            loggedOut: []
          };
          
          // Common logged-in indicators
          const loggedInSelectors = [
            'button[class*="logout"]', 'a[href*="logout"]', '.logout',
            'button[class*="sign-out"]', 'a[href*="sign-out"]', '.sign-out',
            '.user-menu', '.user-profile', '.user-avatar',
            '[class*="profile-"]', '[id*="profile"]',
            '.account-menu', '.user-dropdown',
            '[class*="dashboard"]', '[href*="dashboard"]'
          ];
          
          for (const selector of loggedInSelectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
              indicators.loggedIn.push(selector);
            }
          }
          
          // Common logged-out indicators
          const loggedOutSelectors = [
            'button[class*="login"]', 'a[href*="login"]', '.login',
            'button[class*="signin"]', 'a[href*="signin"]', '.signin',
            'button[class*="sign-in"]', 'a[href*="sign-in"]', '.sign-in',
            'input[type="password"]'
          ];
          
          for (const selector of loggedOutSelectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
              indicators.loggedOut.push(selector);
            }
          }
          
          // Check for username/email display
          const userNameElements = document.querySelectorAll('[class*="username"], [class*="user-name"], [class*="email"]');
          let username = null;
          
          for (const el of userNameElements) {
            const text = el.textContent?.trim();
            if (text && text.includes('@') && text.length > 5 && text.length < 50) {
              username = text;
              indicators.loggedIn.push('username-display');
              break;
            }
          }
          
          return {
            loggedIn: indicators.loggedIn,
            loggedOut: indicators.loggedOut,
            username
          };
        })()
      `);

      // Score generic indicators
      loggedInScore += genericResult.loggedIn.length * 10;
      loggedOutScore += genericResult.loggedOut.length * 10;

      detectionMethods.push(...genericResult.loggedIn.map((i: string) => `generic-in-${i}`));
      detectionMethods.push(...genericResult.loggedOut.map((i: string) => `generic-out-${i}`));

      // Determine status
      let status: 'logged-in' | 'logged-out' | 'unknown';
      let confidence: number;
      
      if (loggedInScore > loggedOutScore && loggedInScore >= 20) {
        status = 'logged-in';
        confidence = Math.min(100, (loggedInScore / Math.max(loggedOutScore + loggedInScore, 1)) * 100);
      } else if (loggedOutScore > loggedInScore && loggedOutScore >= 20) {
        status = 'logged-out';
        confidence = Math.min(100, (loggedOutScore / Math.max(loggedInScore + loggedOutScore, 1)) * 100);
      } else {
        status = 'unknown';
        confidence = 0;
      }

      return {
        domain,
        status,
        lastChecked: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        username: genericResult.username,
        detectionMethod: detectionMethods.join(', '),
        confidence
      };

    } catch (error) {
      console.error('Error detecting login state:', error);
      
      return {
        domain,
        status: 'unknown',
        lastChecked: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        detectionMethod: 'error',
        confidence: 0
      };
    }
  }

  private async checkRule(webview: BrowserWindow, rule: LoginDetectionRule): Promise<boolean> {
    try {
      switch (rule.type) {
        case 'selector':
          return await webview.webContents.executeJavaScript(`
            (() => {
              const elements = document.querySelectorAll('${rule.pattern}');
              const exists = elements.length > 0;
              
              if ('${rule.condition}' === 'exists') return exists;
              if ('${rule.condition}' === 'not-exists') return !exists;
              
              if ('${rule.value}' && elements.length > 0) {
                const text = Array.from(elements).map(el => el.textContent || el.value || '').join(' ');
                if ('${rule.condition}' === 'contains') return text.includes('${rule.value}');
                if ('${rule.condition}' === 'not-contains') return !text.includes('${rule.value}');
              }
              
              return false;
            })()
          `);

        case 'url-pattern':
          const url = webview.webContents.getURL();
          const matches = new RegExp(rule.pattern, 'i').test(url);
          
          if (rule.condition === 'exists' || rule.condition === 'contains') return matches;
          if (rule.condition === 'not-exists' || rule.condition === 'not-contains') return !matches;
          return false;

        case 'text-content':
          return await webview.webContents.executeJavaScript(`
            (() => {
              const text = document.body.textContent || '';
              const contains = text.includes('${rule.pattern}');
              
              if ('${rule.condition}' === 'contains') return contains;
              if ('${rule.condition}' === 'not-contains') return !contains;
              
              return false;
            })()
          `);

        case 'cookie':
          const cookies = await webview.webContents.session.cookies.get({ domain: this.extractDomain(webview.webContents.getURL()) });
          const cookieExists = cookies.some(cookie => cookie.name === rule.pattern);
          
          if (rule.condition === 'exists') return cookieExists;
          if (rule.condition === 'not-exists') return !cookieExists;
          
          if (rule.value && cookieExists) {
            const cookie = cookies.find(c => c.name === rule.pattern);
            const contains = cookie?.value.includes(rule.value) || false;
            
            if (rule.condition === 'contains') return contains;
            if (rule.condition === 'not-contains') return !contains;
          }
          
          return false;

        default:
          return false;
      }
    } catch (error) {
      console.error('Error checking rule:', error);
      return false;
    }
  }

  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return 'unknown';
    }
  }

  private loadStates(): void {
    try {
      if (fs.existsSync(this.statesFile)) {
        const data = fs.readFileSync(this.statesFile, 'utf8');
        const states = JSON.parse(data) as LoginState[];
        
        this.states.clear();
        for (const state of states) {
          this.states.set(state.domain, state);
        }
      }
    } catch (error) {
      console.error('Failed to load login states:', error);
    }
  }

  private saveStates(): void {
    try {
      const states = Array.from(this.states.values());
      fs.writeFileSync(this.statesFile, JSON.stringify(states, null, 2));
    } catch (error) {
      console.error('Failed to save login states:', error);
    }
  }

  private loadDomainConfigs(): void {
    try {
      if (fs.existsSync(this.configFile)) {
        const data = fs.readFileSync(this.configFile, 'utf8');
        const configs = JSON.parse(data) as DomainConfig[];
        
        this.domainConfigs.clear();
        for (const config of configs) {
          this.domainConfigs.set(config.domain, config);
        }
      }
    } catch (error) {
      console.error('Failed to load domain configs:', error);
    }
  }

  private saveDomainConfigs(): void {
    try {
      const configs = Array.from(this.domainConfigs.values());
      fs.writeFileSync(this.configFile, JSON.stringify(configs, null, 2));
    } catch (error) {
      console.error('Failed to save domain configs:', error);
    }
  }

  private initializeDefaultConfigs(): void {
    // Initialize common domain configurations
    const defaults: DomainConfig[] = [
      {
        domain: 'linkedin.com',
        loginPagePatterns: ['/login', '/uas/login'],
        loggedInRules: [
          { type: 'selector', pattern: '.global-nav__me', condition: 'exists', weight: 50 },
          { type: 'selector', pattern: '[data-test-id="nav-settings-trigger"]', condition: 'exists', weight: 40 },
          { type: 'url-pattern', pattern: '/feed/', condition: 'contains', weight: 30 }
        ],
        loggedOutRules: [
          { type: 'selector', pattern: '.login-form', condition: 'exists', weight: 50 },
          { type: 'url-pattern', pattern: '/login', condition: 'contains', weight: 40 }
        ]
      },
      {
        domain: 'github.com',
        loginPagePatterns: ['/login', '/signin'],
        loggedInRules: [
          { type: 'selector', pattern: '.Header-link--profile', condition: 'exists', weight: 50 },
          { type: 'selector', pattern: '[data-test-selector="profile-tab"]', condition: 'exists', weight: 40 }
        ],
        loggedOutRules: [
          { type: 'selector', pattern: '.js-sign-in-form', condition: 'exists', weight: 50 },
          { type: 'text-content', pattern: 'Sign in to GitHub', condition: 'contains', weight: 40 }
        ]
      },
      {
        domain: 'twitter.com',
        loginPagePatterns: ['/login', '/i/flow/login'],
        loggedInRules: [
          { type: 'selector', pattern: '[data-testid="SideNav_AccountSwitcher_Button"]', condition: 'exists', weight: 50 },
          { type: 'url-pattern', pattern: '/home', condition: 'contains', weight: 30 }
        ],
        loggedOutRules: [
          { type: 'selector', pattern: '[data-testid="loginButton"]', condition: 'exists', weight: 50 },
          { type: 'text-content', pattern: 'Sign in to X', condition: 'contains', weight: 40 }
        ]
      }
    ];

    for (const config of defaults) {
      if (!this.domainConfigs.has(config.domain)) {
        this.domainConfigs.set(config.domain, config);
      }
    }

    this.saveDomainConfigs();
  }
}