// ─── Gallery Types ──────────────────────────────────────────────────────────

export type ExtensionCategory =
  | 'privacy'
  | 'password'
  | 'productivity'
  | 'appearance'
  | 'developer'
  | 'media'
  | 'shopping'
  | 'language'
  | 'web3';

export interface GalleryExtension {
  id: string;
  name: string;
  description: string;
  category: ExtensionCategory;
  compatibility: 'works' | 'partial' | 'needs-work' | 'blocked';
  compatibilityNote?: string;
  securityConflict: 'none' | 'dnr-overlap' | 'native-messaging';
  mechanism: string;
  featured: boolean;
}

// ─── Curated Gallery (30 extensions) ────────────────────────────────────────

export const GALLERY_DEFAULTS: GalleryExtension[] = [
  // ── Privacy & Security ──────────────────────────────────────────────────
  {
    id: 'cjpalhdlnbpafiamejdnhcphjbkeiagm',
    name: 'uBlock Origin',
    description: 'Efficient wide-spectrum content blocker. The most popular ad blocker — pure JS, no native dependencies.',
    category: 'privacy',
    compatibility: 'works',
    securityConflict: 'dnr-overlap',
    mechanism: 'declarativeNetRequest + content scripts',
    featured: true,
  },
  {
    id: 'cfhdojbkjhnklbpkdaibdccddilifddb',
    name: 'AdBlock Plus',
    description: 'Block ads and pop-ups on YouTube, Facebook, Twitch, and other sites. Has "acceptable ads" list by default (configurable).',
    category: 'privacy',
    compatibility: 'works',
    securityConflict: 'dnr-overlap',
    mechanism: 'declarativeNetRequest + content scripts',
    featured: false,
  },
  {
    id: 'gighmmpiobklfepjocnamgkkbiglidom',
    name: 'AdBlock',
    description: 'Block ads on YouTube, web pages, and more. Different company than AdBlock Plus — both work fine.',
    category: 'privacy',
    compatibility: 'works',
    securityConflict: 'dnr-overlap',
    mechanism: 'declarativeNetRequest',
    featured: false,
  },
  {
    id: 'pkehgijcmpdhfbdbbnkijodmdjhbjlgp',
    name: 'Privacy Badger',
    description: "EFF's tracker blocker that automatically learns to block invisible trackers. Pure JS, no native deps.",
    category: 'privacy',
    compatibility: 'works',
    securityConflict: 'none',
    mechanism: 'Content scripts + background service worker',
    featured: false,
  },
  {
    id: 'mlomiejdfkolichcflejclcbmpeaniij',
    name: 'Ghostery',
    description: 'Tracker blocker + basic ad blocking. See who is tracking you and block them.',
    category: 'privacy',
    compatibility: 'works',
    securityConflict: 'dnr-overlap',
    mechanism: 'Content scripts + declarativeNetRequest',
    featured: false,
  },
  {
    id: 'caoacbimdbbljakfhgikoodekdnkbicp',
    name: 'DuckDuckGo Privacy Essentials',
    description: 'Privacy protection with tracker blocking, encryption enforcement, and private search.',
    category: 'privacy',
    compatibility: 'works',
    securityConflict: 'dnr-overlap',
    mechanism: 'Content scripts + declarativeNetRequest',
    featured: false,
  },

  // ── Password Managers ───────────────────────────────────────────────────
  {
    id: 'nngceckbapebfimnlniiiahkandclblb',
    name: 'Bitwarden',
    description: 'Open-source password manager. Self-contained — vault lives in extension storage + remote sync. Uses WebCrypto.',
    category: 'password',
    compatibility: 'works',
    securityConflict: 'none',
    mechanism: 'Content scripts + background service worker + WebCrypto',
    featured: true,
  },
  {
    id: 'hdokiejnpimakedhajhdlcegeplioahd',
    name: 'LastPass',
    description: 'Password manager with autofill. Desktop app communication needs native messaging setup.',
    category: 'password',
    compatibility: 'partial',
    compatibilityNote: 'Basic autofill works. Desktop app integration needs native messaging (Phase 6).',
    securityConflict: 'native-messaging',
    mechanism: 'Content scripts + native messaging to local binary',
    featured: false,
  },
  {
    id: 'aeblfdkhhhdcdjpifhhbdiojplfjncoa',
    name: '1Password',
    description: 'Password manager tightly coupled to the 1Password 8 desktop app via native messaging.',
    category: 'password',
    compatibility: 'needs-work',
    compatibilityNote: 'Requires native messaging to 1Password desktop app (Phase 6).',
    securityConflict: 'native-messaging',
    mechanism: 'Heavily relies on native messaging to 1Password 8 desktop app',
    featured: false,
  },

  // ── Writing & Productivity ──────────────────────────────────────────────
  {
    id: 'kbfnbcaeplbcioakkpcpgfkobkghlhen',
    name: 'Grammarly',
    description: 'AI writing assistant with grammar checking overlay. Login uses chrome.identity OAuth.',
    category: 'productivity',
    compatibility: 'partial',
    compatibilityNote: 'Grammar checking works. Login needs chrome.identity polyfill (Phase 7).',
    securityConflict: 'none',
    mechanism: 'Content scripts + chrome.identity OAuth',
    featured: false,
  },
  {
    id: 'knheggckgoiihginacbkhaalnibhilkk',
    name: 'Notion Web Clipper',
    description: 'Clip web pages to Notion. OAuth login uses chrome.identity.',
    category: 'productivity',
    compatibility: 'partial',
    compatibilityNote: 'Page clipping works once authenticated. Login needs chrome.identity polyfill (Phase 7).',
    securityConflict: 'none',
    mechanism: 'Content scripts + OAuth via chrome.identity',
    featured: false,
  },
  {
    id: 'niloccemoadcdkdjlinkgdfekeahmflj',
    name: 'Pocket',
    description: 'Save articles, videos, and stories from any page. Uses its own tab-based OAuth (not chrome.identity).',
    category: 'productivity',
    compatibility: 'works',
    securityConflict: 'none',
    mechanism: 'Background script + REST API calls',
    featured: true,
  },
  {
    id: 'liecbddmkiiihnedobmlmillhodjkdmb',
    name: 'Loom',
    description: 'Screen recorder and screen capture. Uses chrome.desktopCapture which may not bridge properly.',
    category: 'productivity',
    compatibility: 'partial',
    compatibilityNote: 'Uses chrome.desktopCapture — the extension API bridge may not connect properly in Electron.',
    securityConflict: 'none',
    mechanism: 'Content scripts + chrome.desktopCapture',
    featured: false,
  },
  {
    id: 'laookkfknpbbblfpciffpaejjkokdgca',
    name: 'Momentum',
    description: 'Beautiful new tab page with weather, todos, and background photos. Replaces new tab page.',
    category: 'productivity',
    compatibility: 'works',
    securityConflict: 'none',
    mechanism: 'chrome_url_overrides.newtab',
    featured: true,
  },
  {
    id: 'laankejkbhbdhmipfmgcngdelahlfoji',
    name: 'StayFocusd',
    description: 'Time-limit distracting websites. Uses chrome.storage for persistence and declarativeNetRequest for blocking.',
    category: 'productivity',
    compatibility: 'works',
    securityConflict: 'dnr-overlap',
    mechanism: 'Background service worker + declarativeNetRequest + content scripts',
    featured: true,
  },

  // ── Appearance & Customization ──────────────────────────────────────────
  {
    id: 'eimadpbcbfnmbkopoojfekhnkhdbieeh',
    name: 'Dark Reader',
    description: 'Dark mode for every website. Pure CSS/DOM injection with zero native dependencies.',
    category: 'appearance',
    compatibility: 'works',
    securityConflict: 'none',
    mechanism: 'Content scripts (CSS injection + MutationObserver)',
    featured: true,
  },
  {
    id: 'clngdbkpkpeebahjckkjfobafhncgmne',
    name: 'Stylus',
    description: 'Apply custom CSS to any site. Community stylesheet library via userstyles.world.',
    category: 'appearance',
    compatibility: 'works',
    securityConflict: 'none',
    mechanism: 'Content scripts + CSS injection',
    featured: false,
  },

  // ── Developer Tools ─────────────────────────────────────────────────────
  {
    id: 'fmkadmapgofadopljbjfkapdkoienihi',
    name: 'React Developer Tools',
    description: 'Adds React component inspector to DevTools. Essential for React developers.',
    category: 'developer',
    compatibility: 'works',
    securityConflict: 'none',
    mechanism: 'DevTools panel injection + content scripts',
    featured: true,
  },
  {
    id: 'nhdogjmejiglipccpnnnanhbledajbpd',
    name: 'Vue.js devtools',
    description: 'Adds Vue component inspector to DevTools. Same pattern as React DevTools.',
    category: 'developer',
    compatibility: 'works',
    securityConflict: 'none',
    mechanism: 'DevTools panel injection + content scripts',
    featured: false,
  },
  {
    id: 'gppongmhjkpfnbhagpmjfkannfbllamg',
    name: 'Wappalyzer',
    description: 'Detect CMS, frameworks, analytics, and servers on any page. Pure JS analysis.',
    category: 'developer',
    compatibility: 'works',
    securityConflict: 'none',
    mechanism: 'Content scripts + background script',
    featured: true,
  },
  {
    id: 'bcjindcccaagfpapjibcdnjnljaoajfd',
    name: 'JSON Formatter',
    description: 'Makes JSON responses readable in the browser. Pure content script, zero dependencies.',
    category: 'developer',
    compatibility: 'works',
    securityConflict: 'none',
    mechanism: 'Content scripts (reformats JSON responses in the browser)',
    featured: false,
  },
  {
    id: 'bhlhnicpbhignbdhedgjmaplebemodai',
    name: 'ColorZilla',
    description: 'Eyedropper + color picker. Uses the EyeDropper API (Chromium 95+).',
    category: 'developer',
    compatibility: 'works',
    securityConflict: 'none',
    mechanism: 'Content scripts + eyedropper API',
    featured: false,
  },
  {
    id: 'fngmhnnpilhplaeedifhccceomclgfbg',
    name: 'EditThisCookie',
    description: 'Cookie editor/manager using chrome.cookies API. Essential for web developers.',
    category: 'developer',
    compatibility: 'works',
    securityConflict: 'none',
    mechanism: 'chrome.cookies API',
    featured: false,
  },
  {
    id: 'aicmkgpgakddgnaphhhpliifpcfnhce',
    name: 'Postman Interceptor',
    description: 'Intercepts requests to forward to Postman. Requires native messaging to Postman desktop app.',
    category: 'developer',
    compatibility: 'needs-work',
    compatibilityNote: 'Requires native messaging to Postman desktop agent (Phase 6).',
    securityConflict: 'native-messaging',
    mechanism: 'Native messaging to Postman desktop app',
    featured: false,
  },

  // ── Media & Entertainment ───────────────────────────────────────────────
  {
    id: 'nffaoalbilbmmfgbnbgppjihopabppdk',
    name: 'Video Speed Controller',
    description: 'Keyboard shortcuts to speed up/slow down any HTML5 video. Works on YouTube, Netflix, etc.',
    category: 'media',
    compatibility: 'works',
    securityConflict: 'none',
    mechanism: 'Content scripts (attaches to HTML5 video elements)',
    featured: true,
  },
  {
    id: 'gebbhagfogifgggkldgodflihielkjfl',
    name: 'Return YouTube Dislike',
    description: 'Restores YouTube dislike counts via community API. Pure content script.',
    category: 'media',
    compatibility: 'works',
    securityConflict: 'none',
    mechanism: 'Content scripts + external API calls',
    featured: false,
  },
  {
    id: 'ponfpcnoihfmfllpaingbgckeeldkhle',
    name: 'Enhancer for YouTube',
    description: 'Cinema mode, volume boost, auto-skip ads, loop, screenshot. Pure DOM injection.',
    category: 'media',
    compatibility: 'works',
    securityConflict: 'none',
    mechanism: 'Content scripts',
    featured: false,
  },

  // ── Shopping ────────────────────────────────────────────────────────────
  {
    id: 'bmnlcjabgnpnenekpadlanbbkooimhnj',
    name: 'Honey',
    description: 'Automatically finds and applies coupon codes at checkout. Uses tab-based OAuth (not chrome.identity).',
    category: 'shopping',
    compatibility: 'works',
    securityConflict: 'none',
    mechanism: 'Content scripts + background script + PayPal OAuth',
    featured: false,
  },

  // ── Translation & Language ──────────────────────────────────────────────
  {
    id: 'aapbdbdomjkkjkaonfhkkikfgjllcleb',
    name: 'Google Translate',
    description: 'Page translation via Google Translate API. Omnibox button missing (Tandem has custom URL bar).',
    category: 'language',
    compatibility: 'partial',
    compatibilityNote: 'Page translation works via context menu. Omnibox translate button not available.',
    securityConflict: 'none',
    mechanism: 'Content scripts + Google Translate API',
    featured: false,
  },

  // ── Web3 ────────────────────────────────────────────────────────────────
  {
    id: 'nkbihfbeogaeaoehlefnkodbefgpgknn',
    name: 'MetaMask',
    description: 'Ethereum wallet — injects window.ethereum into pages. Full functionality including signing and dApps.',
    category: 'web3',
    compatibility: 'works',
    securityConflict: 'none',
    mechanism: 'Content scripts + background service worker + window.ethereum injection',
    featured: true,
  },
];
