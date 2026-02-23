/**
 * Liquid Glass Lite (LGL) Integration for Tandem Browser
 * 
 * CSS-first glass effects (T1 Static tier) with preparation for full WebGL lensing.
 * Applies glass treatment to chrome elements: tab bar, toolbar, copilot panel, overlays.
 */

class LiquidGlassIntegration {
  constructor() {
    this.config = this.loadConfig();
    this.enabled = this.config.enabled !== false; // default: enabled
    this.blurRadius = this.config.blurRadius || 20;
    this.refractionStrength = this.config.refractionStrength || 0.15;
    this.respectsReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    this.glassElements = new Map();
    this.dynamicZones = new Set();
    
    // Track mouse position for inner glow effects
    this.mouseX = 50;
    this.mouseY = 50;
    
    this.init();
  }

  loadConfig() {
    try {
      const stored = localStorage.getItem('tandem.appearance.liquidGlass');
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      return {};
    }
  }

  saveConfig() {
    localStorage.setItem('tandem.appearance.liquidGlass', JSON.stringify({
      enabled: this.enabled,
      blurRadius: this.blurRadius,
      refractionStrength: this.refractionStrength
    }));
  }

  init() {
    if (!this.enabled) {
      console.log('[LGL] Liquid Glass effects disabled');
      return;
    }

    console.log('[LGL] Initializing Liquid Glass Lite...');
    
    // Apply glass effects to chrome elements
    this.applyGlassEffects();
    
    // Set up mouse tracking for inner glow
    this.setupMouseTracking();
    
    // Listen for theme changes
    this.setupThemeListener();
    
    // Set up settings sync
    this.setupSettingsSync();
    
    console.log('[LGL] Liquid Glass Lite initialized ✨');
  }

  applyGlassEffects() {
    // Tab Bar — LGL Navbar treatment
    this.applyGlass('.tab-bar', {
      type: 'navbar',
      blur: 20,
      tint: true,
      lensing: true,
      showThrough: true
    });

    // Toolbar — LGL Toolbar treatment
    this.applyGlass('.toolbar', {
      type: 'toolbar',
      blur: 18,
      tint: true,
      lensing: true
    });

    // Copilot Panel — LGL Sidebar treatment (biggest glass surface)
    this.applyGlass('.copilot-panel', {
      type: 'sidebar',
      blur: 24,
      tint: true,
      lensing: true,
      strongBlur: true
    });

    // Draw Toolbar — Floating glass
    this.applyGlass('.draw-toolbar', {
      type: 'floating',
      blur: 16,
      tint: true
    });

    // Voice Indicator Overlay — Enhanced glass modal
    this.applyGlass('.voice-indicator-overlay', {
      type: 'overlay',
      blur: 15,
      tint: true,
      materialize: true
    });

    // Onboarding Overlay — Full glass takeover
    this.applyGlass('.onboarding-overlay', {
      type: 'overlay',
      blur: 24,
      tint: true,
      materialize: true
    });

    // Apply gel press effects to interactive elements
    this.applyGelPress('.toolbar button');
    this.applyGelPress('.tab');
    this.applyGelPress('.draw-toolbar button');
    this.applyGelPress('.copilot-panel-toggle');

    // Apply inner glow to key elements
    this.applyInnerGlow('.tab.active');
    this.applyInnerGlow('.copilot-panel-toggle');
    this.applyInnerGlow('.toolbar button');
  }

  applyGlass(selector, options = {}) {
    const elements = document.querySelectorAll(selector);
    
    elements.forEach(el => {
      if (!el) return;
      
      el.classList.add('lgl-glass');
      el.classList.add(`lgl-glass-${options.type || 'default'}`);
      
      if (options.materialize && !this.respectsReducedMotion) {
        el.classList.add('lgl-materialize');
      }
      
      this.glassElements.set(el, options);
      
      // Apply custom blur if specified
      if (options.blur && options.blur !== this.blurRadius) {
        el.style.setProperty('--lgl-element-blur', `${options.blur}px`);
      }
    });
  }

  applyGelPress(selector) {
    const elements = document.querySelectorAll(selector);
    elements.forEach(el => {
      if (!el) return;
      el.classList.add('lgl-pressable');
    });
  }

  applyInnerGlow(selector) {
    const elements = document.querySelectorAll(selector);
    elements.forEach(el => {
      if (!el) return;
      el.classList.add('lgl-glow');
    });
  }

  setupMouseTracking() {
    // Track mouse position for radial gradients
    document.addEventListener('mousemove', (e) => {
      const glowElements = document.querySelectorAll('.lgl-glow:hover');
      
      glowElements.forEach(el => {
        const rect = el.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        
        el.style.setProperty('--mouse-x', `${x}%`);
        el.style.setProperty('--mouse-y', `${y}%`);
      });
    });
  }

  setupThemeListener() {
    // Listen for theme changes (light/dark)
    const themeObserver = new MutationObserver(() => {
      this.updateGlassForTheme();
    });

    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });

    // Also listen for system preference changes
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      this.updateGlassForTheme();
    });
  }

  updateGlassForTheme() {
    // CSS variables handle the theme switching automatically
    // This method is here for future WebGL updates that need JS theme awareness
    console.log('[LGL] Theme changed, glass effects auto-updated via CSS');
  }

  setupSettingsSync() {
    // Listen for settings changes from settings page
    window.addEventListener('storage', (e) => {
      if (e.key === 'tandem.appearance.liquidGlass') {
        const newConfig = JSON.parse(e.newValue || '{}');
        this.enabled = newConfig.enabled !== false;
        this.blurRadius = newConfig.blurRadius || 20;
        this.refractionStrength = newConfig.refractionStrength || 0.15;
        
        this.refresh();
      }
    });
  }

  // Public API
  enable() {
    this.enabled = true;
    this.saveConfig();
    this.refresh();
  }

  disable() {
    this.enabled = false;
    this.saveConfig();
    this.removeAllGlassEffects();
  }

  setBlurRadius(radius) {
    this.blurRadius = Math.max(10, Math.min(30, radius));
    document.documentElement.style.setProperty('--lgl-blur-radius', `${this.blurRadius}px`);
    this.saveConfig();
  }

  setRefractionStrength(strength) {
    this.refractionStrength = Math.max(0, Math.min(1, strength));
    document.documentElement.style.setProperty('--lgl-refraction', this.refractionStrength);
    this.saveConfig();
  }

  refresh() {
    this.removeAllGlassEffects();
    if (this.enabled) {
      this.init();
    }
  }

  removeAllGlassEffects() {
    document.querySelectorAll('.lgl-glass, .lgl-pressable, .lgl-glow').forEach(el => {
      el.classList.remove('lgl-glass', 'lgl-pressable', 'lgl-glow', 'lgl-materialize');
      el.classList.remove('lgl-glass-navbar', 'lgl-glass-toolbar', 'lgl-glass-sidebar', 
                          'lgl-glass-floating', 'lgl-glass-overlay');
    });
    this.glassElements.clear();
  }

  // Future: WebGL lensing integration point
  async enableWebGLLensing() {
    console.log('[LGL] WebGL lensing will be enabled here when @mblock/liquid-glass is ready');
    // TODO: Import and initialize full LGL package
    // const { LiquidGlass } = await import('@mblock/liquid-glass');
    // this.lgl = new LiquidGlass({ ... });
  }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.LGL = new LiquidGlassIntegration();
  });
} else {
  window.LGL = new LiquidGlassIntegration();
}

// Export for ES modules (future)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LiquidGlassIntegration;
}
