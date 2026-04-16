/**
 * Sidebar module entry point — panels, workspaces, tab context menu, drag-drop.
 *
 * Loaded from: shell/index.html as <script type="module" src="js/sidebar/index.js">
 * window exports: ocSidebar (consumed by shell/js/shortcut-router.js:35 for the
 *   Cmd+B bookmarks shortcut), __tandemShowTabContextMenu (consumed by main.js
 *   via window.__tandemShowTabContextMenu, already set via window. inside the IIFE).
 */

  // ═══════════════════════════════════════
  // SIDEBAR
  // ═══════════════════════════════════════
  const ocSidebar = (() => {
    // Icon definitions — two styles similar to Opera:
    // - Utility items: Heroicons outline (gray, turns white on hover/active)
    // - Messenger items: colored brand icons on a colored rounded background
    const ICONS = {
      // === UTILITY ITEMS (Heroicons outline) ===
      workspaces: { svg: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" /></svg>`, brand: null },
      news:       { svg: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V18a2.25 2.25 0 0 0 2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5M6 7.5h3v3H6v-3Z" /></svg>`, brand: null },
      pinboards:  { svg: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 8.25V6a2.25 2.25 0 0 0-2.25-2.25H6A2.25 2.25 0 0 0 3.75 6v8.25A2.25 2.25 0 0 0 6 16.5h2.25m8.25-8.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-7.5A2.25 2.25 0 0 1 8.25 18v-1.5m8.25-8.25h-6a2.25 2.25 0 0 0-2.25 2.25v6" /></svg>`, brand: null },
      bookmarks:  { svg: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" /></svg>`, brand: null },
      history:    { svg: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>`, brand: null },
      downloads:  { svg: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>`, brand: null },

      // === COMMUNICATION ITEMS (colored brand icons, custom background) ===
      calendar:  { svg: `<svg viewBox="0 0 24 24" fill="white"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/></svg>`, brand: '#4285F4' },
      gmail:     { svg: `<svg viewBox="0 0 24 24" fill="white"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>`, brand: '#EA4335' },
      whatsapp:  { svg: `<svg viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`, brand: '#25D366' },
      telegram:  { svg: `<svg viewBox="0 0 24 24" fill="white"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>`, brand: '#2AABEE' },
      discord:   { svg: `<svg viewBox="0 0 24 24" fill="white"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.101 18.08.114 18.1.134 18.114a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>`, brand: '#5865F2' },
      slack:     { svg: `<svg viewBox="0 0 24 24" fill="white"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/></svg>`, brand: '#4A154B' },
      instagram: { svg: `<svg viewBox="0 0 24 24" fill="white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>`, brand: 'linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)' },
      x:         { svg: `<svg viewBox="0 0 24 24" fill="white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`, brand: '#000000' },
    };

    let config = null;
    let isSetupPanelOpen = false;
    const TOKEN = window.__TANDEM_TOKEN__ || '';

    // === WORKSPACE STATE ===
    let wsWorkspaces = [];
    let wsActiveId = null;

    const WORKSPACE_ICONS = {
      home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="m2.25 12 8.954-8.955a1.126 1.126 0 0 1 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"/></svg>',
      briefcase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg>',
      'shopping-bag': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"/></svg>',
      play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"/></svg>',
      airplane: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"/></svg>',
      coffee: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z"/></svg>',
      document: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>',
      'face-smile': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z"/></svg>',
      camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z"/></svg>',
      'book-open': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"/></svg>',
      gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21 11.25v8.25a1.5 1.5 0 0 1-1.5 1.5H4.5a1.5 1.5 0 0 1-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 1 0 9.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1 1 14.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"/></svg>',
      bicycle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6.5" cy="17.5" r="3.5"/><circle cx="17.5" cy="17.5" r="3.5"/><path stroke-linecap="round" stroke-linejoin="round" d="M6.5 17.5 9 9h3m5.5 8.5L15 9h-3m0 0-1.5-4H14m-3.5 4 2 5h3"/></svg>',
      car: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.143-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193l-2.254-3.011A2.25 2.25 0 0 0 14.07 4.5H9.93a2.25 2.25 0 0 0-1.8.9L5.876 8.433a17.902 17.902 0 0 0-3.213 9.193c-.053.62.469 1.124 1.09 1.124H5.25"/></svg>',
      crown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 18h18M3.75 14.25l2.25-9 4.5 4.5L12 5.25l1.5 4.5 4.5-4.5 2.25 9H3.75Z"/></svg>',
      sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"/></svg>',
      moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z"/></svg>',
      ghost: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 2C7.58 2 4 5.58 4 10v11l2.5-2 2.5 2 3-2 3 2 2.5-2 2.5 2V10c0-4.42-3.58-8-8-8Z"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/></svg>',
      heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"/></svg>',
      hourglass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M7 2h10M7 22h10M12 12c-3 0-5-2.5-5-5V3h10v4c0 2.5-2 5-5 5Zm0 0c3 0 5 2.5 5 5v4H7v-4c0-2.5 2-5 5-5Z"/></svg>',
      leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 21c2-4 4-7 12-13C12 10 8 12 6 21Zm0 0C5 15 6 8 18 3c0 6-1 12-12 18Z"/></svg>',
      'list-bullet': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"/></svg>',
      rocket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12l.041-.02a.75.75 0 0 0-.714-.714A18.06 18.06 0 0 0 15.59 14.37ZM9.75 17.25v4.25a.75.75 0 0 1-.41.67l-2.58 1.29a.75.75 0 0 1-1.09-.58l-.42-2.93m4.5-2.66a14.98 14.98 0 0 1-6.16-12.12L3.66 5.09a.75.75 0 0 0-.714.714 18.06 18.06 0 0 0 6.804 11.826ZM6.25 18.94l-2.58 1.29a.75.75 0 0 1-1.08-.58l-.42-2.93M15 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>',
      skull: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 2a8 8 0 0 0-8 8c0 3.09 1.75 5.76 4.31 7.1.17.09.19.17.19.28V20a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-2.62c0-.11.02-.19.19-.28A7.997 7.997 0 0 0 20 10a8 8 0 0 0-8-8Z"/><circle cx="9.5" cy="10" r="1.5" fill="currentColor"/><circle cx="14.5" cy="10" r="1.5" fill="currentColor"/><path stroke-linecap="round" d="M10 21v-1m4 1v-1"/></svg>',
      star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z"/></svg>',
    };

    function getIconSvg(slug) {
      if (WORKSPACE_ICONS[slug]) return WORKSPACE_ICONS[slug];
      // If the slug isn't a known icon name, render it directly (supports emoji icons)
      if (slug && typeof slug === 'string' && slug.trim()) {
        return `<span class="workspace-emoji-icon">${slug}</span>`;
      }
      return WORKSPACE_ICONS.home;
    }

    async function loadQuickLinksConfig() {
      const response = await fetch('http://localhost:8765/config', {
        headers: { Authorization: `Bearer ${TOKEN}` }
      });
      if (!response.ok) throw new Error('Failed to load quick links');
      return response.json();
    }

    function isQuickLinkableUrl(url) {
      return /^https?:\/\//i.test(url || '');
    }

    function normalizeQuickLinkUrl(url) {
      const parsed = new URL(url);
      parsed.hash = '';
      return parsed.toString();
    }

    async function addQuickLink(url, label) {
      const data = await loadQuickLinksConfig();
      const normalizedUrl = normalizeQuickLinkUrl(url);
      const quickLinks = (data.general?.quickLinks || []).filter((link) => {
        try {
          return normalizeQuickLinkUrl(link?.url) !== normalizedUrl;
        } catch {
          return true;
        }
      });
      quickLinks.push({ label, url: normalizedUrl });
      const response = await fetch('http://localhost:8765/config', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TOKEN}`
        },
        body: JSON.stringify({ general: { quickLinks } })
      });
      if (!response.ok) throw new Error('Failed to save quick links');
      return response.json();
    }

    async function removeQuickLink(url) {
      const data = await loadQuickLinksConfig();
      const normalizedUrl = normalizeQuickLinkUrl(url);
      const quickLinks = (data.general?.quickLinks || []).filter((link) => {
        try {
          return normalizeQuickLinkUrl(link?.url) !== normalizedUrl;
        } catch {
          return true;
        }
      });
      const response = await fetch('http://localhost:8765/config', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TOKEN}`
        },
        body: JSON.stringify({ general: { quickLinks } })
      });
      if (!response.ok) throw new Error('Failed to save quick links');
      return response.json();
    }

    async function loadConfig() {
      const r = await fetch('http://localhost:8765/sidebar/config', { headers: { Authorization: `Bearer ${TOKEN}` } });
      const data = await r.json();
      config = data.config;
      config.activeItemId = null; // always start with panel closed
      applyPinState(config.panelPinned || false);
      render();
    }

    const COMMUNICATION_IDS = ['calendar','gmail','whatsapp','telegram','discord','slack','instagram','x'];

    const WEBVIEW_URLS = {
      calendar: 'https://calendar.google.com',
      gmail: 'https://mail.google.com',
      whatsapp: 'https://web.whatsapp.com',
      telegram: 'https://web.telegram.org',
      discord: 'https://discord.com/app',
      slack: 'https://app.slack.com',
      instagram: 'https://www.instagram.com',
      x: 'https://x.com',
    };

    function renderItemHTML(item) {
      const icon = ICONS[item.id];
      const isActive = config.activeItemId === item.id;
      const isMessenger = COMMUNICATION_IDS.includes(item.id);

      if (isMessenger && icon?.brand) {
        const bg = icon.brand;
        return `
          <button class="sidebar-item messenger-item ${isActive ? 'active' : ''}"
            data-id="${item.id}" title="${item.label}">
            <div class="messenger-icon" style="background:${bg}">
              ${icon.svg}
            </div>
            <span class="sidebar-item-label">${item.label}</span>
          </button>`;
      }
      return `
        <button class="sidebar-item ${isActive ? 'active' : ''}"
          data-id="${item.id}" title="${item.label}">
          ${icon?.svg || ''}
          <span class="sidebar-item-label">${item.label}</span>
        </button>`;
    }

    function renderWorkspaceIcons() {
      if (!wsWorkspaces.length) return '';
      const icons = wsWorkspaces.map(ws => {
        const isActive = ws.id === wsActiveId;
        return `
          <button class="sidebar-item workspace-icon ${isActive ? 'active' : ''}"
            data-ws-id="${ws.id}" title="${ws.name}">
            <div class="workspace-icon-inner ${isActive ? 'ws-strip-active' : 'ws-strip-inactive'}">
              <span class="workspace-svg-icon">${getIconSvg(ws.icon)}</span>
            </div>
          </button>`;
      }).join('');
      const addBtn = `
        <button class="sidebar-item workspace-add-btn" data-ws-action="add" title="Add workspace">
          <span class="workspace-add-icon">+</span>
        </button>`;
      return icons + addBtn;
    }

    function render() {
      if (!config) return;
      const sidebar = document.getElementById('sidebar');
      const itemsEl = document.getElementById('sidebar-items');
      sidebar.dataset.state = config.state;

      const sorted = config.items.filter(i => i.enabled).sort((a, b) => a.order - b.order);
      // Section 1 = workspaces (dynamic icons, not from config items)
      const sec2 = sorted.filter(i => i.order >= 10 && i.order < 20);
      const sec3 = sorted.filter(i => i.order >= 20);

      // 3 sections: workspace icons / communication / utilities, with group headers + separators
      const wsHtml = renderWorkspaceIcons();
      itemsEl.innerHTML =
        (wsHtml ? '<p class="sidebar-group-header">Workspaces</p>' : '') +
        wsHtml +
        (wsHtml && sec2.length ? '<div class="sidebar-separator"></div>' : '') +
        (sec2.length ? '<p class="sidebar-group-header">Communication</p>' : '') +
        sec2.map(renderItemHTML).join('') +
        (sec2.length && sec3.length ? '<div class="sidebar-separator"></div>' : '') +
        (sec3.length ? '<p class="sidebar-group-header">Browser Utilities</p>' : '') +
        sec3.map(renderItemHTML).join('');

      // Panel — skip title/open state when setup panel is open
      const panel = document.getElementById('sidebar-panel');
      const panelTitle = document.getElementById('sidebar-panel-title');
      if (!isSetupPanelOpen) {
        if (config.activeItemId) {
          const activeItem = config.items.find(i => i.id === config.activeItemId);
          panel.classList.add('open');
          panelTitle.textContent = activeItem?.label || '';
          // Apply saved width for this item
          const savedWidth = getPanelWidth(config.activeItemId);
          setPanelWidth(savedWidth);
        } else {
          panel.classList.remove('open');
          panel.style.width = ''; // clear inline style so CSS animates to 0
          panel.style.removeProperty('--panel-width');
        }
      }

      // Wide toggle button
      const toggleBtn = document.getElementById('sidebar-toggle-width');
      const toggleLabel = config.state === 'wide' ? 'Collapse' : 'Expand';
      toggleBtn.innerHTML = (config.state === 'wide' ? '\u2039' : '\u203a') + `<span class="sidebar-footer-label">${toggleLabel}</span>`;
      toggleBtn.title = toggleLabel;
    }

    // === WEBVIEW MODULE ===
    const webviewCache = new Map();

    // Google services share the same session partition so one login covers all
    const WEBVIEW_PARTITIONS = {
      calendar: 'persist:gmail',  // Calendar + Gmail = same Google account
    };

    // URL patterns that must open as real popup windows (auth flows)
    // Keep these specific to avoid blocking in-app navigation in messengers
    const AUTH_URL_PATTERNS = [
      'accounts.google.com',
      'google.com/o/oauth2',
      'google.com/ServiceLogin',
      'google.com/accounts',
      'appleid.apple.com',
      'login.microsoftonline.com',
      'github.com/login/oauth',
    ];

    function getOrCreateWebview(id) {
      if (webviewCache.has(id)) return webviewCache.get(id);
      const url = WEBVIEW_URLS[id];
      if (!url) return null;
      const wv = document.createElement('webview');
      wv.src = url;
      wv.partition = WEBVIEW_PARTITIONS[id] || `persist:${id}`;
      wv.className = 'sidebar-webview';
      wv.setAttribute('allowpopups', '');
      // Override user agent for apps that need Chrome
      const chromeUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      wv.useragent = chromeUA;
      // Route new-window events: auth URLs → real popup (via setWindowOpenHandler in main.ts)
      //                          everything else → load inside webview
      wv.addEventListener('new-window', (e) => {
        const isAuth = e.url && AUTH_URL_PATTERNS.some(p => e.url.includes(p));
        if (isAuth) return; // don't preventDefault → main.ts setWindowOpenHandler handles it
        e.preventDefault();
        if (e.url && e.url.startsWith('http')) wv.loadURL(e.url);
      });
      webviewCache.set(id, wv);
      return wv;
    }

    function loadWebviewInPanel(id) {
      const content = document.getElementById('sidebar-panel-content');

      // Hide all webviews but keep them in the DOM (preserves login state)
      webviewCache.forEach(wv => { wv.style.display = 'none'; });

      const wv = getOrCreateWebview(id);
      if (!wv) return;

      // Mount in panel-content if not already there — never remove after first mount
      if (!content.contains(wv)) {
        content.appendChild(wv);
      }

      wv.style.display = 'flex';
      content.classList.add('webview-mode');
    }

    function hideWebviews() {
      webviewCache.forEach(wv => { wv.style.display = 'none'; });
      const content = document.getElementById('sidebar-panel-content');
      if (content) content.classList.remove('webview-mode');
    }

    // Safe innerHTML setter: moves webviews to a detached fragment first,
    // sets innerHTML (which would otherwise destroy them), then re-appends.
    // This prevents Electron from killing webview sessions on DOM wipe.
    function safeSetPanelHTML(html) {
      const content = document.getElementById('sidebar-panel-content');
      if (!content) return;
      // Detach webviews before innerHTML wipe
      const detached = [];
      webviewCache.forEach((wv, id) => {
        if (content.contains(wv)) {
          content.removeChild(wv);
          detached.push({ id, wv });
        }
      });
      content.innerHTML = html;
      // Re-attach webviews (hidden) so they stay alive
      detached.forEach(({ wv }) => {
        wv.style.display = 'none';
        content.appendChild(wv);
      });
    }

    async function activateItem(id) {
      await fetch(`http://localhost:8765/sidebar/items/${id}/activate`, {
        method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }
      });
      isSetupPanelOpen = false;
      const newActive = config.activeItemId === id ? null : id;
      config.activeItemId = newActive;
      render();

      if (newActive && COMMUNICATION_IDS.includes(newActive)) {
        loadWebviewInPanel(newActive);
      } else if (newActive && BOOKMARK_PANEL_IDS.includes(newActive)) {
        loadBookmarkPanel();
      } else if (newActive === 'history') {
        loadHistoryPanel();
      } else if (newActive === 'pinboards') {
        loadPinboardPanel();
      } else {
        hideWebviews();
        const content = document.getElementById('sidebar-panel-content');
        content.classList.remove('webview-mode');
      }
    }

    async function toggleState() {
      const newState = config.state === 'wide' ? 'narrow' : 'wide';
      await fetch('http://localhost:8765/sidebar/state', {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: newState })
      });
      config.state = newState;
      render();
    }

    async function toggleVisibility() {
      const newState = config.state === 'hidden' ? 'narrow' : 'hidden';
      await fetch('http://localhost:8765/sidebar/state', {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: newState })
      });
      config.state = newState;
      render();
    }

    // === BOOKMARKS PANEL MODULE ===
    const BOOKMARK_PANEL_IDS = ['bookmarks'];

    const bmState = {
      all: null,         // full bookmark tree from API
      currentFolder: null, // current folder node
      path: [],          // breadcrumb trail [{id, name}]
      searchMode: false,
    };

    function getFaviconUrl(url) {
      try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`; }
      catch { return null; }
    }

    function folderIcon() {
      return `<svg viewBox="0 0 20 20" fill="currentColor" style="color:#aaa"><path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/></svg>`;
    }

    function chevronIcon() {
      return `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg>`;
    }

    function editIcon() {
      return `<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>`;
    }

    function trashIcon() {
      return `<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>`;
    }

    function renderBmItems(items) {
      if (!items || items.length === 0) return '<div class="bm-empty">Empty folder</div>';
      const folders = items.filter(i => i.type === 'folder');
      const urls    = items.filter(i => i.type === 'url');
      const sorted  = [...folders, ...urls];
      return sorted.map(item => {
        const actions = `<div class="bm-actions">
          <button class="bm-action-btn bm-edit-btn" data-action="edit" data-id="${item.id}" title="Edit">${editIcon()}</button>
          <button class="bm-action-btn bm-delete-btn" data-action="delete" data-id="${item.id}" title="Delete">${trashIcon()}</button>
        </div>`;
        if (item.type === 'folder') {
          return `<div class="bm-item folder" data-id="${item.id}" data-type="folder" data-name="${item.name.replace(/"/g, '&quot;')}">
            <div class="bm-icon">${folderIcon()}</div>
            <span class="bm-name">${item.name}</span>
            ${actions}
            <div class="bm-chevron">${chevronIcon()}</div>
          </div>`;
        } else {
          const fav = getFaviconUrl(item.url);
          const img = fav ? `<img src="${fav}" onerror="this.style.display='none'">` : '';
          return `<div class="bm-item url" data-id="${item.id}" data-type="url" data-url="${item.url}" data-name="${item.name.replace(/"/g, '&quot;')}">
            <div class="bm-icon">${img}</div>
            <span class="bm-name" title="${item.url}">${item.name}</span>
            ${actions}
          </div>`;
        }
      }).join('');
    }

    function renderBmBreadcrumb() {
      const content = document.getElementById('bm-breadcrumb');
      if (!content) return;
      const parts = [{ id: null, name: 'Bookmarks' }, ...bmState.path];
      content.innerHTML = parts.map((p, i) => {
        const isLast = i === parts.length - 1;
        return (isLast ? '' : `<span class="bm-sep">›</span>`) +
          `<span class="bm-crumb ${isLast ? 'active' : ''}" data-crumb-id="${p.id ?? ''}">${p.name}</span>`;
      }).reverse().join('');
    }

    function bmNavigateFolder(node) {
      if (!node) { bmState.currentFolder = null; bmState.path = []; }
      else bmState.currentFolder = node;
      refreshBmList();
      renderBmBreadcrumb();
    }

    function refreshBmList() {
      const listEl = document.getElementById('bm-list');
      if (!listEl) return;
      const items = bmState.currentFolder ? bmState.currentFolder.children : bmState.all?.children;
      listEl.innerHTML = renderBmItems(items);
      // Attach click handlers (ignore clicks on action buttons)
      listEl.querySelectorAll('.bm-item').forEach(el => {
        el.addEventListener('click', (e) => {
          if (e.target.closest('.bm-action-btn')) return;
          const type = el.dataset.type;
          if (type === 'url') {
            const url = el.dataset.url;
            if (url && window.tandem) window.tandem.newTab(url);
          } else if (type === 'folder') {
            const folderId = el.dataset.id;
            const items = bmState.currentFolder ? bmState.currentFolder.children : bmState.all?.children;
            const folder = items?.find(i => i.id === folderId);
            if (folder) {
              bmState.path.push({ id: folder.id, name: folder.name });
              bmNavigateFolder(folder);
            }
          }
        });
      });
      // Edit buttons
      listEl.querySelectorAll('.bm-edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const item = btn.closest('.bm-item');
          const id = item.dataset.id;
          const name = item.dataset.name;
          const url = item.dataset.url || '';
          const type = item.dataset.type;
          showBmEditForm(id, name, url, type);
        });
      });
      // Delete buttons
      listEl.querySelectorAll('.bm-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.id;
          const item = btn.closest('.bm-item');
          const name = item.dataset.name;
          if (!confirm(`Delete "${name}"?`)) return;
          try {
            await fetch('http://localhost:8765/bookmarks/remove', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
              body: JSON.stringify({ id }),
            });
            await reloadBmData();
          } catch { /* ignore */ }
        });
      });
    }

    async function reloadBmData() {
      try {
        const res = await fetch('http://localhost:8765/bookmarks', { headers: { Authorization: `Bearer ${TOKEN}` } });
        const data = await res.json();
        bmState.all = data.bookmarks?.[0] || { children: [] };
        // Re-navigate to current folder if possible
        if (bmState.path.length > 0) {
          let node = bmState.all;
          for (const p of bmState.path) {
            const child = node.children?.find(c => c.id === p.id);
            if (!child) { bmState.path = []; bmState.currentFolder = null; break; }
            node = child;
            bmState.currentFolder = node;
          }
        } else {
          bmState.currentFolder = null;
        }
        refreshBmList();
        renderBmBreadcrumb();
      } catch { /* ignore */ }
    }

    function showBmEditForm(id, name, url, type) {
      const listEl = document.getElementById('bm-list');
      if (!listEl) return;
      const item = listEl.querySelector(`.bm-item[data-id="${id}"]`);
      if (!item) return;
      const isFolder = type === 'folder';
      item.innerHTML = `
        <div class="bm-edit-form">
          <input class="bm-edit-input" id="bm-edit-name" type="text" value="${name.replace(/"/g, '&quot;')}" placeholder="Name">
          ${isFolder ? '' : `<input class="bm-edit-input" id="bm-edit-url" type="text" value="${url.replace(/"/g, '&quot;')}" placeholder="URL">`}
          <div class="bm-edit-actions">
            <button class="bm-edit-save" id="bm-edit-save">Save</button>
            <button class="bm-edit-cancel" id="bm-edit-cancel">Cancel</button>
          </div>
        </div>`;
      item.classList.add('editing');
      const nameInput = item.querySelector('#bm-edit-name');
      nameInput.focus();
      nameInput.select();

      item.querySelector('#bm-edit-save').addEventListener('click', async (e) => {
        e.stopPropagation();
        const newName = nameInput.value.trim();
        const newUrl = isFolder ? undefined : item.querySelector('#bm-edit-url')?.value.trim();
        if (!newName) return;
        try {
          const body = { id, name: newName };
          if (!isFolder && newUrl) body.url = newUrl;
          await fetch('http://localhost:8765/bookmarks/update', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
            body: JSON.stringify(body),
          });
          await reloadBmData();
        } catch { /* ignore */ }
      });

      item.querySelector('#bm-edit-cancel').addEventListener('click', (e) => {
        e.stopPropagation();
        refreshBmList();
      });

      // Save on Enter, cancel on Escape
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') item.querySelector('#bm-edit-save').click();
        if (e.key === 'Escape') item.querySelector('#bm-edit-cancel').click();
      });
    }

    async function loadBookmarkPanel() {
      const content = document.getElementById('sidebar-panel-content');
      // Hide all webviews
      hideWebviews();
      content.classList.remove('webview-mode');

      // Build panel HTML
      safeSetPanelHTML(`
        <div class="bookmark-panel">
          <div class="bm-toolbar">
            <div class="bookmark-search-wrap">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg>
              <input class="bookmark-search" id="bm-search" type="text" placeholder="Search bookmarks…">
            </div>
            <button class="bm-toolbar-btn" id="bm-add-bookmark" title="Add bookmark">
              <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"/></svg>
            </button>
            <button class="bm-toolbar-btn" id="bm-add-folder" title="Add folder">
              <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fill-rule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2h-5L9 4H4zm7 5a1 1 0 10-2 0v1H8a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V9z" clip-rule="evenodd"/></svg>
            </button>
          </div>
          <div class="bookmark-breadcrumb" id="bm-breadcrumb"></div>
          <div class="bookmark-list" id="bm-list">
            <div class="bm-empty">Loading…</div>
          </div>
        </div>`);

      // Fetch bookmarks if not cached
      if (!bmState.all) {
        const res = await fetch('http://localhost:8765/bookmarks', { headers: { Authorization: `Bearer ${TOKEN}` } });
        const data = await res.json();
        bmState.all = data.bookmarks?.[0] || { children: [] }; // Bookmarks Bar root
      }

      bmState.currentFolder = null;
      bmState.path = [];
      refreshBmList();
      renderBmBreadcrumb();

      // Breadcrumb clicks
      document.getElementById('bm-breadcrumb').addEventListener('click', (e) => {
        const crumb = e.target.closest('.bm-crumb');
        if (!crumb || crumb.classList.contains('active')) return;
        const crumbId = crumb.dataset.crumbId;
        if (!crumbId) { bmState.path = []; bmNavigateFolder(null); return; }
        const idx = bmState.path.findIndex(p => p.id === crumbId);
        if (idx >= 0) { bmState.path = bmState.path.slice(0, idx + 1); }
        // Navigate to that folder node
        let node = bmState.all;
        for (const p of bmState.path) {
          node = node.children?.find(c => c.id === p.id) || node;
        }
        bmState.currentFolder = node.id === bmState.all.id ? null : node;
        refreshBmList();
        renderBmBreadcrumb();
      });

      // Search input
      let searchTimer;
      document.getElementById('bm-search').addEventListener('input', async (e) => {
        clearTimeout(searchTimer);
        const q = e.target.value.trim();
        if (!q) {
          bmState.searchMode = false;
          refreshBmList();
          renderBmBreadcrumb();
          return;
        }
        searchTimer = setTimeout(async () => {
          bmState.searchMode = true;
          const res = await fetch(`http://localhost:8765/bookmarks/search?q=${encodeURIComponent(q)}`, {
            headers: { Authorization: `Bearer ${TOKEN}` }
          });
          const data = await res.json();
          const listEl = document.getElementById('bm-list');
          const breadEl = document.getElementById('bm-breadcrumb');
          if (listEl) listEl.innerHTML = renderBmItems(data.results || []);
          if (breadEl) breadEl.innerHTML = `<span class="bm-crumb active">Search results</span>`;
          // Attach URL click handlers for search results
          listEl?.querySelectorAll('.bm-item.url').forEach(el => {
            el.addEventListener('click', () => {
              const url = el.dataset.url;
              if (url && window.tandem) window.tandem.newTab(url);
            });
          });
        }, 250);
      });

      // + Bookmark button
      document.getElementById('bm-add-bookmark').addEventListener('click', () => {
        const listEl = document.getElementById('bm-list');
        if (!listEl) return;
        // Insert add form at top
        const form = document.createElement('div');
        form.className = 'bm-item editing';
        form.innerHTML = `
          <div class="bm-edit-form">
            <input class="bm-edit-input" id="bm-add-name" type="text" placeholder="Bookmark name">
            <input class="bm-edit-input" id="bm-add-url" type="text" placeholder="URL (https://...)">
            <div class="bm-edit-actions">
              <button class="bm-edit-save" id="bm-add-save">Add</button>
              <button class="bm-edit-cancel" id="bm-add-cancel">Cancel</button>
            </div>
          </div>`;
        listEl.prepend(form);
        form.querySelector('#bm-add-name').focus();

        form.querySelector('#bm-add-save').addEventListener('click', async () => {
          const name = form.querySelector('#bm-add-name').value.trim();
          const url = form.querySelector('#bm-add-url').value.trim();
          if (!name || !url) return;
          const parentId = bmState.currentFolder?.id || bmState.all?.id || '';
          try {
            await fetch('http://localhost:8765/bookmarks/add', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
              body: JSON.stringify({ name, url, parentId }),
            });
            await reloadBmData();
          } catch { /* ignore */ }
        });

        form.querySelector('#bm-add-cancel').addEventListener('click', () => form.remove());
        form.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') form.querySelector('#bm-add-save').click();
          if (e.key === 'Escape') form.remove();
        });
      });

      // + Folder button
      document.getElementById('bm-add-folder').addEventListener('click', () => {
        const listEl = document.getElementById('bm-list');
        if (!listEl) return;
        const form = document.createElement('div');
        form.className = 'bm-item editing';
        form.innerHTML = `
          <div class="bm-edit-form">
            <input class="bm-edit-input" id="bm-addfolder-name" type="text" placeholder="Folder name">
            <div class="bm-edit-actions">
              <button class="bm-edit-save" id="bm-addfolder-save">Add</button>
              <button class="bm-edit-cancel" id="bm-addfolder-cancel">Cancel</button>
            </div>
          </div>`;
        listEl.prepend(form);
        form.querySelector('#bm-addfolder-name').focus();

        form.querySelector('#bm-addfolder-save').addEventListener('click', async () => {
          const name = form.querySelector('#bm-addfolder-name').value.trim();
          if (!name) return;
          const parentId = bmState.currentFolder?.id || bmState.all?.id || '';
          try {
            await fetch('http://localhost:8765/bookmarks/add-folder', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
              body: JSON.stringify({ name, parentId }),
            });
            await reloadBmData();
          } catch { /* ignore */ }
        });

        form.querySelector('#bm-addfolder-cancel').addEventListener('click', () => form.remove());
        form.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') form.querySelector('#bm-addfolder-save').click();
          if (e.key === 'Escape') form.remove();
        });
      });
    }

    // === HISTORY PANEL MODULE ===
    async function loadHistoryPanel() {
      const content = document.getElementById('sidebar-panel-content');
      hideWebviews();
      content.classList.remove('webview-mode');

      safeSetPanelHTML(`
        <div class="history-panel">
          <div class="history-search-wrap">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg>
            <input class="history-search" id="history-search" type="text" placeholder="Search history…">
          </div>
          <div class="history-list" id="history-list">
            <div class="bm-empty">Loading…</div>
          </div>
          <div id="sync-devices-section" style="display:none">
            <div class="history-section-header">Your Devices</div>
            <div id="sync-devices-list"></div>
          </div>
        </div>`);

      // Fetch history
      try {
        const res = await fetch('http://localhost:8765/history', { headers: { Authorization: `Bearer ${TOKEN}` } });
        const data = await res.json();
        const entries = data.entries || [];
        const listEl = document.getElementById('history-list');
        if (listEl) {
          listEl.innerHTML = renderHistoryItems(entries);
          attachHistoryClickHandlers(listEl);
        }
      } catch (e) {
        const listEl = document.getElementById('history-list');
        if (listEl) listEl.innerHTML = '<div class="bm-empty">Failed to load history</div>';
      }

      // Search handler
      let historySearchTimer;
      document.getElementById('history-search')?.addEventListener('input', async (e) => {
        clearTimeout(historySearchTimer);
        const q = e.target.value.trim();
        if (!q) {
          const res = await fetch('http://localhost:8765/history', { headers: { Authorization: `Bearer ${TOKEN}` } });
          const data = await res.json();
          const listEl = document.getElementById('history-list');
          if (listEl) { listEl.innerHTML = renderHistoryItems(data.entries || []); attachHistoryClickHandlers(listEl); }
          return;
        }
        historySearchTimer = setTimeout(async () => {
          const res = await fetch(`http://localhost:8765/history/search?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
          const data = await res.json();
          const listEl = document.getElementById('history-list');
          if (listEl) { listEl.innerHTML = renderHistoryItems(data.results || []); attachHistoryClickHandlers(listEl); }
        }, 250);
      });

      // Load sync devices
      loadSyncDevices();
    }

    function renderHistoryItems(entries) {
      if (!entries || entries.length === 0) return '<div class="bm-empty">No history</div>';
      return entries.slice(0, 200).map(e => {
        const fav = e.url ? getFaviconUrl(e.url) : null;
        const img = fav ? `<img src="${fav}" onerror="this.style.display='none'">` : '';
        const title = e.title || e.url || 'Untitled';
        return `<div class="bm-item url" data-url="${e.url}">
          <div class="bm-icon">${img}</div>
          <span class="bm-name" title="${e.url}">${title}</span>
        </div>`;
      }).join('');
    }

    function attachHistoryClickHandlers(listEl) {
      listEl.querySelectorAll('.bm-item.url').forEach(el => {
        el.addEventListener('click', () => {
          const url = el.dataset.url;
          if (url && window.tandem) window.tandem.newTab(url);
        });
      });
    }

    async function loadSyncDevices() {
      const section = document.getElementById('sync-devices-section');
      const list = document.getElementById('sync-devices-list');
      if (!section || !list) return;

      try {
        const res = await fetch('http://localhost:8765/sync/devices', { headers: { Authorization: `Bearer ${TOKEN}` } });
        const data = await res.json();
        const devices = data.devices || [];
        if (!devices.length) { section.style.display = 'none'; return; }

        section.style.display = 'block';
        let html = '';
        for (const device of devices) {
          html += `<div class="sync-device-name">${device.name}</div>`;
          for (const tab of (device.tabs || [])) {
            const fav = tab.url ? getFaviconUrl(tab.url) : null;
            const img = fav ? `<img class="sync-tab-favicon" src="${fav}" onerror="this.style.display='none'">` : '<div class="sync-tab-favicon"></div>';
            const title = tab.title || tab.url || 'Untitled';
            const truncUrl = (tab.url || '').length > 60 ? tab.url.substring(0, 60) + '…' : (tab.url || '');
            html += `<div class="sync-tab-item" data-url="${tab.url}" title="${truncUrl}">
              ${img}
              <span class="sync-tab-title">${title}</span>
            </div>`;
          }
        }
        list.innerHTML = html;
        list.querySelectorAll('.sync-tab-item').forEach(el => {
          el.addEventListener('click', () => {
            const url = el.dataset.url;
            if (url && window.tandem) window.tandem.newTab(url);
          });
        });
      } catch {
        section.style.display = 'none';
      }
    }

    // === PINBOARD PANEL MODULE ===
    const pbState = { currentBoardId: null, currentBoardName: '', currentBoardEmoji: '', currentLayout: 'default', currentBackground: 'dark' };

    function pbEscape(text) {
      const d = document.createElement('div');
      d.textContent = text;
      return d.innerHTML;
    }

    async function loadPinboardPanel() {
      const content = document.getElementById('sidebar-panel-content');
      hideWebviews();
      content.classList.remove('webview-mode');
      pbState.currentBoardId = null;

      safeSetPanelHTML(`
        <div class="pb-panel">
          <div class="pb-header">
            <span class="pb-title">Pinboards</span>
            <button class="pb-new-btn" id="pb-new-btn" title="New board">+</button>
          </div>
          <div class="pb-board-list" id="pb-board-list">
            <div class="bm-empty">Loading...</div>
          </div>
        </div>`);

      try {
        const res = await fetch('http://localhost:8765/pinboards', { headers: { Authorization: `Bearer ${TOKEN}` } });
        const data = await res.json();
        pbRenderBoardList(data.boards || []);
      } catch {
        document.getElementById('pb-board-list').innerHTML = '<div class="bm-empty">Failed to load boards</div>';
      }

      document.getElementById('pb-new-btn')?.addEventListener('click', pbCreateBoard);
    }

    function pbRenderBoardList(boards) {
      const container = document.getElementById('pb-board-list');
      if (!container) return;
      if (boards.length === 0) {
        container.innerHTML = '<div class="bm-empty">No boards yet. Click + to create one.</div>';
        return;
      }
      container.innerHTML = boards.map(b => `
        <div class="pb-board-item" data-board-id="${b.id}" data-name="${pbEscape(b.name)}" data-emoji="${pbEscape(b.emoji)}">
          <span class="pb-board-emoji">${pbEscape(b.emoji)}</span>
          <span class="pb-board-name">${pbEscape(b.name)}</span>
          <span class="pb-board-count">${b.itemCount}</span>
          <button class="pb-board-delete" data-board-id="${b.id}" title="Delete board">&times;</button>
        </div>
      `).join('');

      container.querySelectorAll('.pb-board-item').forEach(el => {
        el.addEventListener('click', (e) => {
          if (e.target.classList.contains('pb-board-delete')) return;
          pbOpenBoard(el.dataset.boardId, el.dataset.name, el.dataset.emoji);
        });
      });
      container.querySelectorAll('.pb-board-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const boardId = btn.dataset.boardId;
          await fetch(`http://localhost:8765/pinboards/${boardId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${TOKEN}` } });
          loadPinboardPanel();
        });
      });
    }

    async function pbOpenBoard(boardId, name, emoji) {
      pbState.currentBoardId = boardId;
      pbState.currentBoardName = name;
      pbState.currentBoardEmoji = emoji;
      const content = document.getElementById('sidebar-panel-content');

      safeSetPanelHTML(`
        <div class="pb-panel">
          <div class="pb-items-header" style="position:relative;">
            <button class="pb-back-btn" id="pb-back-btn">&larr;</button>
            <select class="pb-board-switcher" id="pb-board-switcher"></select>
            <button class="pb-note-btn" id="pb-note-btn" title="Add text note">✏️</button>
            <button class="pb-appearance-btn" id="pb-appearance-btn" title="Appearance">✨</button>
          </div>
          <div class="pb-note-editor" id="pb-note-editor" style="display:none;">
            <textarea class="pb-note-textarea" id="pb-note-textarea" placeholder="Type your note here…" rows="4"></textarea>
            <div class="pb-note-actions">
              <button class="pb-note-save" id="pb-note-save">Save</button>
              <button class="pb-note-cancel" id="pb-note-cancel">Cancel</button>
            </div>
          </div>
          <div class="pb-item-list" id="pb-item-list">
            <div class="bm-empty">Loading...</div>
          </div>
        </div>`);

      await pbUpdateBoardSwitcher(boardId);

      // Fetch board data to apply saved layout/background
      try {
        const boardRes = await fetch(`http://localhost:8765/pinboards/${boardId}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
        const boardData = await boardRes.json();
        if (boardData.ok && boardData.board) {
          pbState.currentLayout = boardData.board.layout || 'default';
          pbState.currentBackground = boardData.board.background || 'dark';
        }
      } catch { /* ignore */ }

      document.getElementById('pb-back-btn')?.addEventListener('click', () => {
        loadPinboardPanel();
      });

      document.getElementById('pb-note-btn')?.addEventListener('click', () => {
        const editor = document.getElementById('pb-note-editor');
        const textarea = document.getElementById('pb-note-textarea');
        if (editor.style.display === 'none') {
          editor.style.display = 'block';
          textarea.focus();
        } else {
          editor.style.display = 'none';
          textarea.value = '';
        }
      });

      // Appearance panel
      document.getElementById('pb-appearance-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        let panel = document.getElementById('pb-appearance-panel');
        if (panel) { panel.remove(); return; }
        const header = document.querySelector('.pb-items-header');
        panel = document.createElement('div');
        panel.id = 'pb-appearance-panel';
        panel.className = 'pb-appearance-panel';
        const curLayout = pbState.currentLayout || 'default';
        const curBg = pbState.currentBackground || 'dark';
        panel.innerHTML = `
          <div class="pb-appearance-section">
            <div class="pb-appearance-label">Layout</div>
            <div class="pb-appearance-options">
              <div class="pb-appearance-opt${curLayout === 'dense' ? ' active' : ''}" data-layout="dense">Dense</div>
              <div class="pb-appearance-opt${curLayout === 'default' ? ' active' : ''}" data-layout="default">Default</div>
              <div class="pb-appearance-opt${curLayout === 'spacious' ? ' active' : ''}" data-layout="spacious">Spacious</div>
            </div>
          </div>
          <div class="pb-appearance-section">
            <div class="pb-appearance-label">Background</div>
            <div class="pb-appearance-options">
              <div class="pb-appearance-opt${curBg === 'dark' ? ' active' : ''}" data-bg="dark">Dark</div>
              <div class="pb-appearance-opt${curBg === 'light' ? ' active' : ''}" data-bg="light">Light</div>
            </div>
          </div>`;
        header.appendChild(panel);

        panel.querySelectorAll('[data-layout]').forEach(opt => {
          opt.addEventListener('click', async () => {
            const layout = opt.dataset.layout;
            pbState.currentLayout = layout;
            pbApplyGridClasses();
            panel.querySelectorAll('[data-layout]').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            await fetch(`http://localhost:8765/pinboards/${boardId}/settings`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
              body: JSON.stringify({ layout })
            });
          });
        });
        panel.querySelectorAll('[data-bg]').forEach(opt => {
          opt.addEventListener('click', async () => {
            const bg = opt.dataset.bg;
            pbState.currentBackground = bg;
            pbApplyGridClasses();
            panel.querySelectorAll('[data-bg]').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            await fetch(`http://localhost:8765/pinboards/${boardId}/settings`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
              body: JSON.stringify({ background: bg })
            });
          });
        });

        // Close panel when clicking outside
        const closePanel = (ev) => {
          if (!panel.contains(ev.target) && ev.target !== document.getElementById('pb-appearance-btn')) {
            panel.remove();
            document.removeEventListener('click', closePanel);
          }
        };
        setTimeout(() => document.addEventListener('click', closePanel), 0);
      });

      document.getElementById('pb-note-save')?.addEventListener('click', async () => {
        const textarea = document.getElementById('pb-note-textarea');
        const text = textarea.value.trim();
        if (!text) return;
        await fetch(`http://localhost:8765/pinboards/${boardId}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
          body: JSON.stringify({ type: 'text', content: text })
        });
        textarea.value = '';
        document.getElementById('pb-note-editor').style.display = 'none';
        await pbRefreshItems(boardId);
      });

      document.getElementById('pb-note-cancel')?.addEventListener('click', () => {
        document.getElementById('pb-note-textarea').value = '';
        document.getElementById('pb-note-editor').style.display = 'none';
      });
      document.getElementById('pb-board-switcher')?.addEventListener('change', (e) => {
        const sel = e.target;
        const opt = sel.selectedOptions[0];
        if (opt) {
          const text = opt.textContent;
          pbOpenBoard(sel.value, text.slice(2).replace(/\s*\(\d+\)$/, ''), text.charAt(0));
        }
      });

      try {
        const res = await fetch(`http://localhost:8765/pinboards/${boardId}/items`, { headers: { Authorization: `Bearer ${TOKEN}` } });
        const data = await res.json();
        pbRenderItems(data.items || []);
      } catch {
        document.getElementById('pb-item-list').innerHTML = '<div class="bm-empty">Failed to load items</div>';
      }
    }

    function pbApplyGridClasses() {
      const container = document.getElementById('pb-item-list');
      if (!container) return;
      container.classList.remove('pb-grid--dense', 'pb-grid--spacious', 'pb-board--light');
      const layout = pbState.currentLayout || 'default';
      if (layout === 'dense') container.classList.add('pb-grid--dense');
      else if (layout === 'spacious') container.classList.add('pb-grid--spacious');
      if (pbState.currentBackground === 'light') container.classList.add('pb-board--light');
    }

    async function pbOpenEditModal(item, boardId) {
      const existing = document.getElementById('pb-edit-overlay');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'pb-edit-overlay';
      overlay.className = 'pb-edit-overlay';
      overlay.innerHTML = `
        <div class="pb-edit-modal">
          <div class="pb-edit-header">
            <span>Edit pin</span>
            <button class="pb-edit-close">×</button>
          </div>
          <div class="pb-edit-body">
            <input class="pb-edit-title-input" type="text" placeholder="Headline" value="${pbEscape(item.title || '')}">
            <textarea class="pb-edit-content-input" placeholder="Type something...">${pbEscape(item.content || item.note || '')}</textarea>
            ${item.thumbnail ? `<img src="${pbEscape(item.thumbnail)}" class="pb-edit-preview-img" alt="">` : ''}
          </div>
          <div class="pb-edit-footer">
            <button class="pb-edit-save-btn">Save</button>
            <button class="pb-edit-cancel-btn">Cancel</button>
          </div>
        </div>`;

      document.body.appendChild(overlay);
      overlay.querySelector('.pb-edit-title-input').focus();

      const close = () => overlay.remove();
      overlay.querySelector('.pb-edit-close').addEventListener('click', close);
      overlay.querySelector('.pb-edit-cancel-btn').addEventListener('click', close);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

      overlay.querySelector('.pb-edit-save-btn').addEventListener('click', async () => {
        const title = overlay.querySelector('.pb-edit-title-input').value.trim();
        const content = overlay.querySelector('.pb-edit-content-input').value.trim();
        await fetch(`http://localhost:8765/pinboards/${boardId}/items/${item.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
          body: JSON.stringify({ title, content, note: content })
        });
        close();
        await pbRefreshItems(boardId);
      });
    }

    async function pbRefreshItems(boardId) {
      if (!boardId || !document.getElementById('pb-item-list')) return;
      try {
        const res = await fetch(`http://localhost:8765/pinboards/${boardId}/items`, { headers: { Authorization: `Bearer ${TOKEN}` } });
        const data = await res.json();
        pbRenderItems(data.items || []);
        await pbUpdateBoardSwitcher(boardId);
      } catch { /* ignore */ }
    }

    async function pbUpdateBoardSwitcher(currentId) {
      try {
        const res = await fetch('http://localhost:8765/pinboards', { headers: { Authorization: `Bearer ${TOKEN}` } });
        const data = await res.json();
        const select = document.getElementById('pb-board-switcher');
        if (!select) return;
        select.innerHTML = '';
        (data.boards || []).forEach(b => {
          const opt = document.createElement('option');
          opt.value = b.id;
          opt.textContent = `${b.emoji} ${b.name} (${b.itemCount})`;
          if (b.id === currentId) opt.selected = true;
          select.appendChild(opt);
        });
      } catch { /* ignore */ }
    }

    function pbRenderItems(items) {
      const container = document.getElementById('pb-item-list');
      if (!container) return;
      container.className = 'pb-grid';
      pbApplyGridClasses();

      if (items.length === 0) {
        container.className = 'pb-items-empty';
        container.innerHTML = `
          <div class="bm-empty">
            <div style="font-size:48px;margin-bottom:12px;">📌</div>
            <p>No items on this board yet.</p>
            <p>Right-click on a page, link, image, or text selection &rarr; "Save to Pinboard".</p>
          </div>`;
        return;
      }

      container.innerHTML = items.map(item => {
        const title = pbEscape(item.title || item.url || (item.content ? item.content.substring(0, 50) : '') || 'Untitled');
        const date = new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const typeIcons = { link: '🔗', image: '🖼️', text: '📝', quote: '💬' };

        let preview = '';
        switch (item.type) {
          case 'image':
            preview = `<img src="${pbEscape(item.url || item.thumbnail || '')}" alt="${title}" loading="lazy" onerror="this.parentElement.innerHTML='<span class=pb-card-type-icon>🖼️</span>'">`;
            break;
          case 'link': {
            if (item.thumbnail) {
              preview = `<img src="${pbEscape(item.thumbnail)}" alt="${title}" loading="lazy" onerror="this.parentElement.innerHTML='<span class=pb-card-type-icon>🔗</span>'">`;
            } else {
              let domain = '';
              try { domain = new URL(item.url).hostname; } catch { /* ignore */ }
              preview = domain
                ? `<img src="https://www.google.com/s2/favicons?domain=${domain}&sz=64" alt="" style="width:32px;height:32px;object-fit:contain;" onerror="this.parentElement.innerHTML='<span class=pb-card-type-icon>🔗</span>'">`
                : '<span class="pb-card-type-icon">🔗</span>';
            }
            break;
          }
          case 'quote':
            preview = `<div class="pb-card-text-preview">"${pbEscape(item.content || '')}"</div>`;
            break;
          case 'text':
            preview = `<div class="pb-card-text-preview">${pbEscape(item.content || '')}</div>`;
            break;
          default:
            preview = `<span class="pb-card-type-icon">${typeIcons[item.type] || '📄'}</span>`;
        }

        return `
          <div class="pb-card" draggable="true" data-item-id="${item.id}" ${item.url ? 'data-has-url="true"' : ''} data-url="${pbEscape(item.url || '')}">
            <div class="pb-card-actions">
              <button class="pb-card-action-btn pb-edit-btn" data-item-id="${item.id}">✏️ Edit</button>
              <button class="pb-card-action-btn danger pb-remove-btn" data-item-id="${item.id}">🗑️</button>
            </div>
            <div class="pb-card-preview${(item.type === 'quote' || item.type === 'text') ? ' pb-card-preview--text' : ''}">${preview}</div>
            <div class="pb-card-info">
              <div class="pb-card-title">${title}</div>
              ${item.description ? `<div class="pb-card-desc">${pbEscape(item.description.substring(0, 120))}</div>` : ''}
              ${item.note ? `<div class="pb-card-note">${pbEscape(item.note)}</div>` : ''}
              <div class="pb-card-meta">
                <span class="pb-card-type">${typeIcons[item.type] || ''} ${item.type}</span>
                <span class="pb-card-date">${date}</span>
              </div>
            </div>
          </div>`;
      }).join('');

      // Remove handler with fade-out
      container.addEventListener('click', async (e) => {
        const removeBtn = e.target.closest('.pb-remove-btn');
        if (!removeBtn) return;
        e.stopPropagation();
        const itemId = removeBtn.dataset.itemId;
        if (!itemId || !pbState.currentBoardId) return;
        const card = removeBtn.closest('.pb-card');
        if (card) {
          card.style.transition = 'opacity 0.2s, transform 0.2s';
          card.style.opacity = '0';
          card.style.transform = 'scale(0.9)';
        }
        await fetch(`http://localhost:8765/pinboards/${pbState.currentBoardId}/items/${itemId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${TOKEN}` } });
        setTimeout(() => {
          if (card) card.remove();
          if (container.querySelectorAll('.pb-card').length === 0) {
            container.className = 'pb-items-empty';
            container.innerHTML = '<div class="bm-empty"><div style="font-size:48px;margin-bottom:12px;">📌</div><p>All items removed.</p></div>';
          }
        }, 250);
      });

      // Edit handler
      container.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.pb-edit-btn');
        if (!editBtn) return;
        e.stopPropagation();
        const itemId = editBtn.dataset.itemId;
        const item = items.find(i => i.id === itemId);
        if (item && pbState.currentBoardId) pbOpenEditModal(item, pbState.currentBoardId);
      });

      // Click on link/image cards opens URL in new tab
      container.querySelectorAll('.pb-card[data-has-url="true"]').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('.pb-card-actions')) return;
          const url = card.dataset.url;
          if (url && window.tandem) window.tandem.newTab(url);
        });
      });

      // Drag-and-drop reorder
      pbSetupDragAndDrop(container);

      // Inline editing: double-click on text/quote card body or link card title
      container.querySelectorAll('.pb-card').forEach(card => {
        const itemId = card.dataset.itemId;
        const item = items.find(i => i.id === itemId);
        if (!item) return;

        if (item.type === 'text' || item.type === 'quote') {
          const body = card.querySelector('.pb-card-text-preview');
          if (body) {
            body.addEventListener('dblclick', (e) => {
              e.stopPropagation();
              if (body.contentEditable === 'true') return;
              const originalText = body.textContent;
              body.contentEditable = 'true';
              body.focus();
              body.addEventListener('blur', async function onBlur() {
                body.removeEventListener('blur', onBlur);
                body.contentEditable = 'false';
                const newText = body.textContent.trim();
                if (newText && newText !== originalText) {
                  await fetch(`http://localhost:8765/pinboards/${pbState.currentBoardId}/items/${itemId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
                    body: JSON.stringify({ content: newText })
                  });
                }
              });
              body.addEventListener('keydown', (ke) => {
                if (ke.key === 'Escape') {
                  body.textContent = originalText;
                  body.contentEditable = 'false';
                }
              });
            });
          }
        }

        if (item.type === 'link') {
          const titleEl = card.querySelector('.pb-card-title');
          if (titleEl) {
            titleEl.addEventListener('dblclick', (e) => {
              e.stopPropagation();
              if (titleEl.contentEditable === 'true') return;
              const originalText = titleEl.textContent;
              titleEl.contentEditable = 'true';
              titleEl.style.whiteSpace = 'normal';
              titleEl.focus();
              titleEl.addEventListener('blur', async function onBlur() {
                titleEl.removeEventListener('blur', onBlur);
                titleEl.contentEditable = 'false';
                titleEl.style.whiteSpace = '';
                const newText = titleEl.textContent.trim();
                if (newText && newText !== originalText) {
                  await fetch(`http://localhost:8765/pinboards/${pbState.currentBoardId}/items/${itemId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
                    body: JSON.stringify({ title: newText })
                  });
                }
              });
              titleEl.addEventListener('keydown', (ke) => {
                if (ke.key === 'Escape') {
                  titleEl.textContent = originalText;
                  titleEl.contentEditable = 'false';
                  titleEl.style.whiteSpace = '';
                }
              });
            });
          }
        }
      });
    }

    function pbSetupDragAndDrop(container) {
      let draggedCard = null;
      container.addEventListener('dragstart', (e) => {
        draggedCard = e.target.closest('.pb-card');
        if (!draggedCard) return;
        draggedCard.classList.add('pb-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedCard.dataset.itemId);
      });
      container.addEventListener('dragend', () => {
        if (draggedCard) { draggedCard.classList.remove('pb-dragging'); draggedCard = null; }
        container.querySelectorAll('.pb-drag-over').forEach(el => el.classList.remove('pb-drag-over'));
      });
      container.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const target = e.target.closest('.pb-card');
        if (target && target !== draggedCard) {
          container.querySelectorAll('.pb-drag-over').forEach(el => el.classList.remove('pb-drag-over'));
          target.classList.add('pb-drag-over');
        }
      });
      container.addEventListener('drop', async (e) => {
        e.preventDefault();
        const target = e.target.closest('.pb-card');
        if (!target || !draggedCard || target === draggedCard) return;
        const cards = [...container.querySelectorAll('.pb-card')];
        const draggedIdx = cards.indexOf(draggedCard);
        const targetIdx = cards.indexOf(target);
        if (draggedIdx < targetIdx) { target.after(draggedCard); } else { target.before(draggedCard); }
        const newOrder = [...container.querySelectorAll('.pb-card')].map(c => c.dataset.itemId);
        await fetch(`http://localhost:8765/pinboards/${pbState.currentBoardId}/items/reorder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
          body: JSON.stringify({ itemIds: newOrder })
        });
        container.querySelectorAll('.pb-drag-over').forEach(el => el.classList.remove('pb-drag-over'));
      });
    }

    async function pbCreateBoard() {
      const name = await showPrompt('New board', 'Board name…');
      if (!name) return;
      const emoji = await showPrompt('Board emoji (optional)', 'e.g. 📌', '📌') || '📌';
      await fetch('http://localhost:8765/pinboards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ name, emoji })
      });
      loadPinboardPanel();
    }

    // === SIDEBAR SETUP PANEL ===
    const SETUP_SECTIONS = [
      { title: 'Workspaces',        ids: ['workspaces'] },
      { title: 'Communication',     ids: ['calendar','gmail','whatsapp','telegram','discord','slack','instagram','x'] },
      { title: 'Browser Utilities', ids: ['pinboards','bookmarks','history'] },
    ];

    function renderSetupPanel(items) {
      const panel = document.getElementById('sidebar-panel');
      const titleEl = document.getElementById('sidebar-panel-title');
      const content = document.getElementById('sidebar-panel-content');

      isSetupPanelOpen = true;
      config.activeItemId = null;
      titleEl.textContent = 'Sidebar Setup';
      panel.classList.add('open');

      // Detach cached webviews before innerHTML wipe (preserve login state)
      hideWebviews();
      content.classList.remove('webview-mode');

      const rows = SETUP_SECTIONS.map((section, si) => {
        const itemRows = section.ids.map(id => {
          const item = items.find(i => i.id === id);
          if (!item) return '';
          const icon = ICONS[id];
          const iconHtml = `<div class="setup-item-icon-sm" style="background:rgba(255,255,255,0.08)">${icon ? icon.svg : ''}</div>`;
          return `
            <div class="setup-item">
              ${iconHtml}
              <span class="setup-item-label">${item.label}</span>
              <label class="toggle-switch">
                <input type="checkbox" data-item-id="${id}" ${item.enabled ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
            </div>`;
        }).join('');
        const sep = si < SETUP_SECTIONS.length - 1 ? '<div class="setup-separator"></div>' : '';
        return `<p class="setup-section-title">${section.title}</p>${itemRows}${sep}`;
      }).join('');

      safeSetPanelHTML(rows);

      // Toggle handlers
      content.querySelectorAll('input[data-item-id]').forEach(input => {
        input.addEventListener('change', async (e) => {
          const id = e.target.dataset.itemId;
          await fetch(`http://localhost:8765/sidebar/items/${id}/toggle`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${TOKEN}` }
          });
          const r = await fetch('http://localhost:8765/sidebar/config', {
            headers: { Authorization: `Bearer ${TOKEN}` }
          });
          const data = await r.json();
          config = data.config;
          render();
        });
      });
    }

    function applyPinState(pinned) {
      const panel = document.getElementById('sidebar-panel');
      const pinBtn = document.getElementById('sidebar-panel-pin');
      if (pinned) {
        panel.classList.add('pinned');
        pinBtn && pinBtn.classList.add('active');
      } else {
        panel.classList.remove('pinned');
        pinBtn && pinBtn.classList.remove('active');
      }
    }

    // === PANEL RESIZE ===
    const DEFAULT_PANEL_WIDTH = 340;
    const MIN_PANEL_WIDTH = 180;
    const MAX_PANEL_WIDTH = () => window.innerWidth - 100; // always fits any screen

    function getPanelWidth(id) {
      return (config.panelWidths && config.panelWidths[id]) || DEFAULT_PANEL_WIDTH;
    }

    function setPanelWidth(width) {
      const panel = document.getElementById('sidebar-panel');
      panel.style.width = width + 'px';
      panel.style.setProperty('--panel-width', width + 'px');
    }

    async function savePanelWidth(id, width) {
      if (!config.panelWidths) config.panelWidths = {};
      config.panelWidths[id] = width;
      await fetch('http://localhost:8765/sidebar/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ panelWidths: config.panelWidths })
      });
    }

    // Resize drag logic
    let resizeDragging = false;
    let resizeStartX = 0;
    let resizeStartWidth = 0;
    let resizeActiveId = null;

    const resizeHandle = document.getElementById('sidebar-panel-resize');

    // Drag cover: transparent full-screen div that blocks webviews from eating mouse events
    const dragCover = document.createElement('div');
    dragCover.style.cssText = 'position:fixed;inset:0;z-index:9999;cursor:ew-resize;display:none;';
    document.body.appendChild(dragCover);

    resizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      resizeDragging = true;
      resizeStartX = e.clientX;
      const panel = document.getElementById('sidebar-panel');
      resizeStartWidth = panel.offsetWidth;
      resizeActiveId = config.activeItemId;
      resizeHandle.classList.add('dragging');
      document.body.style.userSelect = 'none';
      dragCover.style.display = 'block'; // block webview mouse capture
    });

    document.addEventListener('mousemove', (e) => {
      if (!resizeDragging) return;
      const delta = e.clientX - resizeStartX;
      const newWidth = Math.min(MAX_PANEL_WIDTH(), Math.max(MIN_PANEL_WIDTH, resizeStartWidth + delta));
      setPanelWidth(newWidth);
    });

    document.addEventListener('mouseup', async (e) => {
      if (!resizeDragging) return;
      resizeDragging = false;
      resizeHandle.classList.remove('dragging');
      document.body.style.userSelect = '';
      dragCover.style.display = 'none'; // restore webview interaction
      if (resizeActiveId) {
        const panel = document.getElementById('sidebar-panel');
        await savePanelWidth(resizeActiveId, panel.offsetWidth);
      }
    });

    // === WORKSPACE FUNCTIONS ===
    async function loadWorkspaces() {
      try {
        const r = await fetch('http://localhost:8765/workspaces', { headers: { Authorization: `Bearer ${TOKEN}` } });
        const data = await r.json();
        if (data.ok) {
          wsWorkspaces = data.workspaces;
          wsActiveId = data.activeId;
          render();
          filterTabBar();
        }
      } catch (e) { /* workspace API not yet available during startup */ }
    }

    async function switchWorkspace(id) {
      try {
        const r = await fetch(`http://localhost:8765/workspaces/${id}/switch`, {
          method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }
        });
        const data = await r.json();
        if (data.ok) {
          wsActiveId = data.workspace.id;
          // Update the local workspace's tabIds
          const ws = wsWorkspaces.find(w => w.id === id);
          if (ws) Object.assign(ws, data.workspace);
          render();
          filterTabBar();
        }
      } catch (e) { console.error('switchWorkspace failed:', e); }
    }

    function getNextWorkspaceName() {
      const existing = wsWorkspaces.map(w => w.name);
      let n = 1;
      while (existing.includes(`Workspace ${n}`)) n++;
      return `Workspace ${n}`;
    }

    function renderIconGrid(selectedIcon) {
      const slugs = Object.keys(WORKSPACE_ICONS);
      return slugs.map(slug => {
        const isSelected = slug === selectedIcon;
        return `<button class="ws-icon-grid-btn ${isSelected ? 'selected' : ''}" data-icon-slug="${slug}" title="${slug}">
          <span class="ws-icon-grid-svg">${WORKSPACE_ICONS[slug]}</span>
        </button>`;
      }).join('');
    }

    function showWorkspaceForm(content, mode, existingWs) {
      const isEdit = mode === 'edit';
      const title = isEdit ? 'Edit workspace' : 'Create workspace';
      const btnLabel = isEdit ? 'Save' : 'Create';
      const defaultIcon = isEdit ? existingWs.icon : Object.keys(WORKSPACE_ICONS)[0];
      const defaultName = isEdit ? existingWs.name : getNextWorkspaceName();

      safeSetPanelHTML(`
        <div class="ws-form-sheet">
          <div class="ws-form-title">${title}</div>
          <div class="ws-form-section-label">Icon</div>
          <div class="ws-icon-grid" id="ws-icon-grid">${renderIconGrid(defaultIcon)}</div>
          <div class="ws-form-section-label">Name</div>
          <input type="text" class="ws-form-input" id="ws-form-name" value="${defaultName}" placeholder="${getNextWorkspaceName()}" />
          <div class="ws-form-actions">
            <button class="ws-form-btn-cancel" id="ws-form-cancel">Cancel</button>
            <button class="ws-form-btn-primary" id="ws-form-submit">${btnLabel}</button>
          </div>
          ${isEdit ? `<button class="ws-form-btn-delete" id="ws-form-delete">Delete workspace</button>` : ''}
          <div class="ws-form-delete-confirm" id="ws-form-delete-confirm" style="display:none;">
            <span>Are you sure? Tabs will move to Default.</span>
            <div class="ws-form-delete-confirm-actions">
              <button class="ws-form-btn-cancel" id="ws-form-delete-no">No</button>
              <button class="ws-form-btn-danger" id="ws-form-delete-yes">Yes, delete</button>
            </div>
          </div>
        </div>`);

      let selectedIcon = defaultIcon;

      // Icon grid selection
      content.querySelectorAll('.ws-icon-grid-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          content.querySelectorAll('.ws-icon-grid-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          selectedIcon = btn.dataset.iconSlug;
        });
      });

      // Auto-focus name input
      const nameInput = content.querySelector('#ws-form-name');
      nameInput.focus();
      nameInput.select();

      // Cancel
      content.querySelector('#ws-form-cancel').addEventListener('click', () => {
        openWorkspacePanel();
      });

      // Submit
      content.querySelector('#ws-form-submit').addEventListener('click', async () => {
        const name = nameInput.value.trim();
        if (!name) return;
        try {
          if (isEdit) {
            const r = await fetch(`http://localhost:8765/workspaces/${existingWs.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
              body: JSON.stringify({ name, icon: selectedIcon })
            });
            const data = await r.json();
            if (data.ok) {
              const idx = wsWorkspaces.findIndex(w => w.id === existingWs.id);
              if (idx >= 0) wsWorkspaces[idx] = data.workspace;
              render();
            }
          } else {
            const r = await fetch('http://localhost:8765/workspaces', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
              body: JSON.stringify({ name, icon: selectedIcon })
            });
            const data = await r.json();
            if (data.ok) {
              wsWorkspaces.push(data.workspace);
              render();
            }
          }
        } catch (e) { console.error('workspace form submit failed:', e); }
        openWorkspacePanel();
      });

      // Enter key on input submits
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') content.querySelector('#ws-form-submit').click();
        if (e.key === 'Escape') openWorkspacePanel();
      });

      // Delete (edit mode only)
      if (isEdit) {
        content.querySelector('#ws-form-delete').addEventListener('click', () => {
          content.querySelector('#ws-form-delete').style.display = 'none';
          content.querySelector('#ws-form-delete-confirm').style.display = '';
        });
        content.querySelector('#ws-form-delete-no').addEventListener('click', () => {
          content.querySelector('#ws-form-delete-confirm').style.display = 'none';
          content.querySelector('#ws-form-delete').style.display = '';
        });
        content.querySelector('#ws-form-delete-yes').addEventListener('click', async () => {
          try {
            await fetch(`http://localhost:8765/workspaces/${existingWs.id}`, {
              method: 'DELETE', headers: { Authorization: `Bearer ${TOKEN}` }
            });
            await loadWorkspaces();
          } catch (e) { console.error('workspace delete failed:', e); }
          openWorkspacePanel();
        });
      }
    }

    function filterTabBar() {
      // Find active workspace
      const ws = wsWorkspaces.find(w => w.id === wsActiveId);
      if (!ws) return;
      const allowedTabIds = new Set(ws.tabIds);

      // Get all tab elements from the tab bar
      const tabEls = document.querySelectorAll('#tab-bar .tab[data-tab-id]');
      const visibleTabIds = [];
      tabEls.forEach(el => {
        const tabId = el.dataset.tabId;
        // Get webContentsId for this tab from the webview
        const wv = document.querySelector(`webview[data-tab-id="${tabId}"]`);
        if (!wv) return;
        const wcId = wv.getWebContentsId ? wv.getWebContentsId() : null;
        const visible = wcId !== null && allowedTabIds.has(wcId);
        el.style.display = visible ? '' : 'none';
        if (visible) {
          visibleTabIds.push(tabId);
        } else {
          wv.classList.remove('active');
        }
      });

      if (visibleTabIds.length === 0) return;

      const activeWebview = document.querySelector('webview.active[data-tab-id]');
      const activeTabId = activeWebview?.dataset?.tabId || null;
      if (!activeTabId || !visibleTabIds.includes(activeTabId)) {
        if (window.tandem) {
          window.tandem.focusTab(visibleTabIds[0]);
        }
      }
    }

    async function openWorkspacePanel() {
      isSetupPanelOpen = false;
      config.activeItemId = '__workspaces';
      const panel = document.getElementById('sidebar-panel');
      const titleEl = document.getElementById('sidebar-panel-title');
      const content = document.getElementById('sidebar-panel-content');

      titleEl.textContent = 'Workspaces';
      panel.classList.add('open');
      setPanelWidth(getPanelWidth('__workspaces'));

      // Hide webviews
      hideWebviews();
      content.classList.remove('webview-mode');

      // Refresh workspace data
      await loadWorkspaces();

      const rows = wsWorkspaces.map(ws => {
        const isActive = ws.id === wsActiveId;
        return `
          <div class="ws-panel-item ${isActive ? 'active' : ''}" data-ws-panel-id="${ws.id}">
            <div class="ws-panel-icon-svg">${getIconSvg(ws.icon)}</div>
            <span class="ws-panel-name">${ws.name}</span>
            ${isActive ? '<span class="ws-panel-check">✓</span>' : ''}
            ${!ws.isDefault ? `<button class="ws-panel-edit" data-ws-edit="${ws.id}" title="Edit">···</button>` : ''}
          </div>`;
      }).join('');

      safeSetPanelHTML(`
        <div class="ws-panel">
          <button class="ws-panel-add" id="ws-panel-add-btn">+ Add workspace</button>
          ${rows}
        </div>`);

      // Event handlers
      content.querySelector('#ws-panel-add-btn')?.addEventListener('click', () => {
        showWorkspaceForm(content, 'create', null);
      });
      content.querySelectorAll('.ws-panel-item').forEach(el => {
        el.addEventListener('click', async (e) => {
          if (e.target.closest('.ws-panel-edit')) return;
          await switchWorkspace(el.dataset.wsPanelId);
          await openWorkspacePanel();
        });
      });
      content.querySelectorAll('.ws-panel-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.dataset.wsEdit;
          const ws = wsWorkspaces.find(w => w.id === id);
          if (ws) showWorkspaceForm(content, 'edit', ws);
        });
      });
    }

    function init() {
      loadConfig();
      // Load workspaces after a short delay to ensure API is ready
      setTimeout(loadWorkspaces, 500);
      initDragHandlers();

      document.getElementById('sidebar-items').addEventListener('click', e => {
        // Handle workspace icon clicks
        const wsBtn = e.target.closest('[data-ws-id]');
        if (wsBtn) { switchWorkspace(wsBtn.dataset.wsId); return; }
        // Handle workspace add button
        const wsAdd = e.target.closest('[data-ws-action="add"]');
        if (wsAdd) { openWorkspacePanel(); return; }
        // Handle regular sidebar items
        const btn = e.target.closest('.sidebar-item:not([data-ws-id]):not([data-ws-action])');
        if (btn && btn.dataset.id) activateItem(btn.dataset.id);
      });
      document.getElementById('sidebar-toggle-width').addEventListener('click', toggleState);

      document.getElementById('sidebar-panel-pin').addEventListener('click', async () => {
        config.panelPinned = !config.panelPinned;
        applyPinState(config.panelPinned);
        await fetch('http://localhost:8765/sidebar/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
          body: JSON.stringify({ panelPinned: config.panelPinned })
        });
      });

      document.getElementById('sidebar-panel-reload').addEventListener('click', () => {
        if (config.activeItemId && webviewCache.has(config.activeItemId)) {
          webviewCache.get(config.activeItemId).reload();
        }
      });

      document.getElementById('sidebar-panel-close').addEventListener('click', () => {
        const panel = document.getElementById('sidebar-panel');
        panel.classList.remove('open');
        // Hide webviews but don't remove them (preserve login state)
        hideWebviews();
        const content = document.getElementById('sidebar-panel-content');
        content.classList.remove('webview-mode');
        // Remove non-webview content
        Array.from(content.children).forEach(child => {
          if (!child.classList.contains('sidebar-webview')) child.remove();
        });
        document.getElementById('sidebar-panel-title').textContent = '';
        isSetupPanelOpen = false;
        config.activeItemId = null;
        render();
      });

      document.getElementById('sidebar-customize').addEventListener('click', () => {
        if (isSetupPanelOpen) {
          // Toggle off — close the panel
          const panel = document.getElementById('sidebar-panel');
          panel.classList.remove('open');
          isSetupPanelOpen = false;
          hideWebviews();
        } else {
          renderSetupPanel(config.items);
        }
      });

      document.getElementById('sidebar-tips').addEventListener('click', () => {
        const webview = document.querySelector('webview.active');
        if (webview) {
          const shellPath = window.location.href.replace(/\/[^/]*$/, '');
          webview.loadURL(shellPath + '/help.html');
        }
      });

      // Shortcut: Cmd+Shift+B (Mac) / Ctrl+Shift+B (Windows/Linux)
      document.addEventListener('keydown', e => {
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'B') {
          e.preventDefault();
          toggleVisibility();
        }
      });

      // Listen for main process signal to reload a sidebar webview (e.g. after Google auth)
      if (window.tandem && window.tandem.onReloadSidebarWebview) {
        window.tandem.onReloadSidebarWebview((id) => {
          const wv = webviewCache.get(id);
          if (wv) wv.reload();
          // If Gmail partition reloads, also reload Calendar (they share persist:gmail session)
          if (id === 'gmail') {
            const calendarWv = webviewCache.get('calendar');
            if (calendarWv) calendarWv.reload();
          }
        });
      }

      // Listen for workspace switch events from main process
      if (window.tandem && window.tandem.onWorkspaceSwitched) {
        window.tandem.onWorkspaceSwitched((workspace) => {
          wsActiveId = workspace.id;
          // Update local workspace data
          const idx = wsWorkspaces.findIndex(w => w.id === workspace.id);
          if (idx >= 0) wsWorkspaces[idx] = workspace;
          render();
          filterTabBar();
        });
      }

      // Refresh pinboard view when a pin is added via page context menu
      if (window.tandem && window.tandem.onPinboardItemAdded) {
        window.tandem.onPinboardItemAdded((boardId) => {
          if (pbState.currentBoardId === boardId) {
            setTimeout(() => pbRefreshItems(boardId), 800); // delay for OG fetch
          }
        });
      }
    }

    // === TAB CONTEXT MENU (custom DOM, no IPC) ===
    let ctxMenuEl = null;

    function getWebContentsIdForTab(domTabId) {
      const wv = document.querySelector(`webview[data-tab-id="${domTabId}"]`);
      return wv && wv.getWebContentsId ? wv.getWebContentsId() : null;
    }

    function getTabWorkspaceId(domTabId) {
      const wcId = getWebContentsIdForTab(domTabId);
      if (wcId === null) return null;
      const ws = wsWorkspaces.find(w => w.tabIds && w.tabIds.includes(wcId));
      return ws ? ws.id : null;
    }

    async function moveTabToWorkspace(domTabId, targetWsId) {
      const wcId = getWebContentsIdForTab(domTabId);
      if (wcId === null) return;
      try {
        await fetch(`http://localhost:8765/workspaces/${targetWsId}/move-tab`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
          body: JSON.stringify({ tabId: wcId })
        });
        await loadWorkspaces();
        filterTabBar();
        const ws = wsWorkspaces.find(w => w.id === targetWsId);
        console.log(`Tab moved to workspace ${ws ? ws.name : targetWsId}`);
      } catch (e) { console.error('moveTabToWorkspace failed:', e); }
    }

    function closeCtxMenu() {
      if (ctxMenuEl) { ctxMenuEl.remove(); ctxMenuEl = null; }
    }

    async function showTabContextMenu(domTabId, x, y) {
      closeCtxMenu();

      const wv = document.querySelector('webview[data-tab-id="'+domTabId+'"]');
      const isMuted = wv ? wv.audioMuted : false;
      const currentWsId = getTabWorkspaceId(domTabId);
      const targets = wsWorkspaces.filter(ws => ws.id !== currentWsId);

      // Pre-fetch pinboards (fast — same-machine API call)
      let pbBoards = [];
      try {
        const pbRes = await fetch('http://localhost:8765/pinboards', { headers: { Authorization: `Bearer ${TOKEN}` } });
        const pbData = await pbRes.json();
        pbBoards = pbData.boards || [];
      } catch { /* Tandem not running or no boards */ }

      const menu = document.createElement('div');
      menu.className = 'tandem-ctx-menu';
      menu.style.left = x + 'px';
      menu.style.top = y + 'px';

      function addItem(label, onClick) {
        const item = document.createElement('div');
        item.className = 'tandem-ctx-menu-item';
        item.textContent = label;
        item.addEventListener('click', () => { closeCtxMenu(); onClick(item); });
        menu.appendChild(item);
        return item;
      }

      function addSep() {
        const sep = document.createElement('div');
        sep.className = 'tandem-ctx-separator';
        menu.appendChild(sep);
      }

      // — New Tab
      addItem('New Tab', () => { window.tandem.newTab(); });

      addSep();

      // — Reload
      addItem('Reload', () => { if (wv) wv.reload(); });

      // — Duplicate Tab
      addItem('Duplicate Tab', () => { if (wv) window.tandem.newTab(wv.src); });

      // — Copy Page Address
      addItem('Copy Page Address', (itemEl) => {
        if (wv) {
          navigator.clipboard.writeText(wv.src);
          itemEl.textContent = 'Copied!';
          setTimeout(() => { itemEl.textContent = 'Copy Page Address'; }, 1000);
        }
      });

      if (wv && isQuickLinkableUrl(wv.src)) {
        const quickLinksData = await loadQuickLinksConfig().catch(() => null);
        const currentQuickLinks = quickLinksData?.general?.quickLinks || [];
        const currentUrl = normalizeQuickLinkUrl(wv.src);
        const alreadyQuickLink = currentQuickLinks.some((link) => {
          try {
            return normalizeQuickLinkUrl(link?.url) === currentUrl;
          } catch {
            return false;
          }
        });
        addItem(alreadyQuickLink ? 'Remove from Quick Links' : 'Add to Quick Links', async () => {
          try {
            if (alreadyQuickLink) {
              await removeQuickLink(currentUrl);
            } else {
              await addQuickLink(currentUrl, wv.getTitle() || currentUrl);
            }
          } catch {
            // Ignore save failures for now; the menu just closes.
          }
        });
      }

      addSep();

      // — Move to Workspace (submenu)
      if (targets.length > 0) {
        const wsItem = document.createElement('div');
        wsItem.className = 'tandem-ctx-menu-item';
        wsItem.innerHTML = '<span>Move to Workspace</span><span class="ctx-arrow">▶</span>';

        const sub = document.createElement('div');
        sub.className = 'tandem-ctx-submenu';
        targets.forEach(ws => {
          const si = document.createElement('div');
          si.className = 'tandem-ctx-submenu-item';
          const icon = getIconSvg(ws.icon);
          si.innerHTML = '<span class="ws-ctx-icon">' + icon + '</span><span>' + ws.name + '</span>';
          si.addEventListener('click', () => {
            closeCtxMenu();
            moveTabToWorkspace(domTabId, ws.id);
          });
          sub.appendChild(si);
        });
        wsItem.appendChild(sub);
        menu.appendChild(wsItem);

        addSep();
      }

      // — Add to Pinboard (submenu)
      {
        const pbItem = document.createElement('div');
        pbItem.className = 'tandem-ctx-menu-item';
        pbItem.innerHTML = '<span>📌 Add to Pinboard</span><span class="ctx-arrow">▶</span>';

        const pbSub = document.createElement('div');
        pbSub.className = 'tandem-ctx-submenu';

        if (pbBoards.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'tandem-ctx-submenu-item';
          empty.style.opacity = '0.5';
          empty.style.cursor = 'default';
          empty.textContent = 'No boards yet';
          pbSub.appendChild(empty);
        } else {
          pbBoards.forEach(board => {
            const si = document.createElement('div');
            si.className = 'tandem-ctx-submenu-item';
            si.innerHTML = '<span>' + board.emoji + ' ' + board.name + '</span>';
            si.addEventListener('click', async () => {
              closeCtxMenu();
              const tabUrl = wv ? wv.src : '';
              const tabTitle = wv ? wv.getTitle() : '';
              await fetch('http://localhost:8765/pinboards/' + board.id + '/items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
                body: JSON.stringify({ type: 'link', url: tabUrl, title: tabTitle })
              });
              // Visual flash feedback on the tab
              const tabEl = document.querySelector('.tab[data-tab-id="' + domTabId + '"]');
              if (tabEl) {
                tabEl.classList.add('pin-flash');
                setTimeout(() => tabEl.classList.remove('pin-flash'), 700);
              }
              // Refresh board if it's currently open
              if (pbState.currentBoardId === board.id) {
                setTimeout(() => pbRefreshItems(board.id), 800); // slight delay for OG fetch
              }
            });
            pbSub.appendChild(si);
          });
        }

        pbItem.appendChild(pbSub);
        menu.appendChild(pbItem);
        addSep();
      }

      // — Mute / Unmute Tab
      addItem(isMuted ? 'Unmute Tab' : 'Mute Tab', () => {
        if (wv) wv.audioMuted = !isMuted;
      });

      // — Set Emoji (submenu)
      {
        const emojiItem = document.createElement('div');
        emojiItem.className = 'tandem-ctx-menu-item';
        const tabEl = document.querySelector('.tab[data-tab-id="' + domTabId + '"]');
        const tabEmojiSpan = tabEl ? tabEl.querySelector('.tab-emoji') : null;
        const currentEmoji = (tabEmojiSpan && tabEmojiSpan.style.display !== 'none') ? tabEmojiSpan.textContent : '';
        const emojiLabel = document.createElement('span');
        emojiLabel.textContent = currentEmoji ? ('Emoji: ' + currentEmoji) : 'Set Emoji...';
        const emojiArrow = document.createElement('span');
        emojiArrow.className = 'ctx-arrow';
        emojiArrow.textContent = '▶';
        emojiItem.appendChild(emojiLabel);
        emojiItem.appendChild(emojiArrow);

        const emojiSub = document.createElement('div');
        emojiSub.className = 'tandem-ctx-submenu tandem-emoji-grid';

        if (currentEmoji) {
          const removeItem = document.createElement('div');
          removeItem.className = 'tandem-ctx-submenu-item';
          removeItem.textContent = 'Remove Emoji';
          removeItem.addEventListener('click', async () => {
            closeCtxMenu();
            await fetch('http://localhost:8765/tabs/' + encodeURIComponent(domTabId) + '/emoji', {
              method: 'DELETE',
              headers: { Authorization: 'Bearer ' + TOKEN }
            });
          });
          emojiSub.appendChild(removeItem);
          const sep = document.createElement('div');
          sep.className = 'tandem-ctx-separator';
          emojiSub.appendChild(sep);
        }

        const emojis = [
          '🔥','⭐','💡','🚀','✅','❌','⚠️','🎯','💬','📌',
          '📚','🧪','🔧','🎨','📊','🔒','👀','💰','🎵','❤️',
          '🏠','📧','🛒','📝','🗂️','🌍','☁️','📸','🎮','🤖',
          '🧠','🔍','📅','🎁','🏷️','⏰','🔔','💻','📱','🎬',
          '🍕','☕','🌟','💎','🦊','🐛','🏗️','📦','🔗','🏆',
        ];
        const grid = document.createElement('div');
        grid.className = 'tandem-emoji-picker';
        emojis.forEach(emoji => {
          const btn = document.createElement('span');
          btn.className = 'tandem-emoji-btn';
          btn.textContent = emoji;
          btn.addEventListener('click', async () => {
            closeCtxMenu();
            await fetch('http://localhost:8765/tabs/' + encodeURIComponent(domTabId) + '/emoji', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
              body: JSON.stringify({ emoji: emoji })
            });
          });
          grid.appendChild(btn);
        });
        emojiSub.appendChild(grid);

        emojiItem.appendChild(emojiSub);
        menu.appendChild(emojiItem);
      }

      addSep();

      // — Close Tab
      addItem('Close Tab', () => { window.tandem.closeTab(domTabId); });

      // — Close Other Tabs
      addItem('Close Other Tabs', () => {
        const allTabs = document.querySelectorAll('#tab-bar .tab[data-tab-id]');
        allTabs.forEach(t => {
          const tid = t.dataset.tabId;
          if (tid && tid !== domTabId) window.tandem.closeTab(tid);
        });
      });

      // — Close Tabs to the Right
      addItem('Close Tabs to the Right', () => {
        const allTabs = Array.from(document.querySelectorAll('#tab-bar .tab[data-tab-id]'));
        const idx = allTabs.findIndex(t => t.dataset.tabId === domTabId);
        if (idx >= 0) {
          for (let i = idx + 1; i < allTabs.length; i++) {
            const tid = allTabs[i].dataset.tabId;
            if (tid) window.tandem.closeTab(tid);
          }
        }
      });

      document.body.appendChild(menu);
      ctxMenuEl = menu;

      // Auto-flip if menu extends beyond viewport
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) menu.style.left = Math.max(0, window.innerWidth - rect.width - 8) + 'px';
      if (rect.bottom > window.innerHeight) menu.style.top = Math.max(0, window.innerHeight - rect.height - 8) + 'px';

      // Flip submenu left if near right edge
      requestAnimationFrame(() => {
        const menuRight = menu.getBoundingClientRect().right;
        if (menuRight + 180 > window.innerWidth) {
          const subs = menu.querySelectorAll('.tandem-ctx-submenu');
          subs.forEach(s => s.classList.add('flip-left'));
        }
      });

      // Close on click outside, Escape, scroll
      const closeHandler = (e) => {
        if (ctxMenuEl && !ctxMenuEl.contains(e.target)) { closeCtxMenu(); cleanup(); }
      };
      const escHandler = (e) => {
        if (e.key === 'Escape') { closeCtxMenu(); cleanup(); }
      };
      const scrollHandler = () => { closeCtxMenu(); cleanup(); };
      function cleanup() {
        document.removeEventListener('mousedown', closeHandler);
        document.removeEventListener('keydown', escHandler);
        window.removeEventListener('scroll', scrollHandler, true);
      }
      setTimeout(() => {
        document.addEventListener('mousedown', closeHandler);
        document.addEventListener('keydown', escHandler);
        window.addEventListener('scroll', scrollHandler, true);
      }, 0);
    }

    // Expose globally so main.js can call it
    window.__tandemShowTabContextMenu = showTabContextMenu;

    // === DRAG & DROP: tab onto workspace icon ===
    function initDragHandlers() {
      const itemsEl = document.getElementById('sidebar-items');

      itemsEl.addEventListener('dragover', (e) => {
        const wsBtn = e.target.closest('[data-ws-id]');
        if (!wsBtn) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        wsBtn.classList.add('ws-drop-active');
      });

      itemsEl.addEventListener('dragleave', (e) => {
        const wsBtn = e.target.closest('[data-ws-id]');
        if (wsBtn) wsBtn.classList.remove('ws-drop-active');
      });

      itemsEl.addEventListener('drop', async (e) => {
        e.preventDefault();
        // Remove highlight from all workspace icons
        itemsEl.querySelectorAll('.ws-drop-active').forEach(el => el.classList.remove('ws-drop-active'));

        const wsBtn = e.target.closest('[data-ws-id]');
        if (!wsBtn) return;
        const domTabId = e.dataTransfer.getData('text/tab-id');
        if (!domTabId) return;
        const targetWsId = wsBtn.dataset.wsId;
        await moveTabToWorkspace(domTabId, targetWsId);
      });
    }

    return { init, loadConfig, activateItem, toggleVisibility };
  })();


// Expose ocSidebar on window so classic scripts (shortcut-router.js) can reach it.
window.ocSidebar = ocSidebar;
  document.addEventListener('DOMContentLoaded', () => ocSidebar.init());
